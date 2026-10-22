// 뽑기 계산 — 지금은 목업. 서버가 붙으면 POST /gacha/pull { packId, pick, requestId } 응답(PullResult)으로 바뀐다.
// 화면은 결과를 '이미 정해진 값'으로만 그린다: 연출은 결과를 따라갈 뿐, 결과를 바꾸지 않는다(정직한 연출).
// 중복 카드는 당연히 나온다(강화·각성 재료). 막는 건 '한 번 산 팩을 두 번 처리하는 것' — requestId 로 한 번만.

import { useSyncExternalStore } from 'react';
import { CARDS, ME, MY_CARD_IDS, PACKS, PLAYERS, teamById } from '../../game/mock';
import { GRADES } from '../../game/grades';
import { spend, useWallet } from '../../game/wallet';
import { PITCH_KO, POS_KO } from '../../game/labels';
import type { CardInst, ClubCode, GradeId, Pack, PitchType, Player, SignaturePitch } from '../../game/types';
import { CLUB_TIER, LEGEND_SEASONS, YEAR_OPTIONS, clubPool } from './local-mock';

export type Pick = { kind: 'year'; year: number } | { kind: 'club'; club: ClubCode };

/* ───────── 난수 (목업 전용 — 진짜 결과는 서버 난수) ───────── */
function h32(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rng(seed: string) {
  let a = h32(seed) || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ───────── 등급 묶음 ───────── */
export const rankOf = (g: GradeId) => GRADES[g].rank;
/** 연출 세기 — 0 노멀·스페셜(담백) · 1 레어·엘리트·수상(중간) · 2 레전드·프랜차이즈 · 3 블랙·시그니처(가장 큼) */
export function tierOf(g: GradeId): 0 | 1 | 2 | 3 {
  if (g === 'normal' || g === 'special') return 0;
  if (g === 'legend' || g === 'franchise') return 2;
  if (g === 'black' || g === 'signature' || g === 'unique') return 3;
  return 1;
}
/** 같은 서열이면 화면에서 더 귀한 쪽 (수상 < 엘리트 처럼 보이지 않게) */
const RARITY: Record<GradeId, number> = {
  normal: 1, special: 2, rare: 3, legend: 4, elite: 5, th: 5.2, gg: 5.3, mvp: 5.4, franchise: 6, unique: 6.5, black: 7, signature: 8,
};
export const rarity = (g: GradeId) => RARITY[g];

/* ───────── 확률 (골라 뽑는 팩은 없는 등급을 빼고 비율대로 다시 나눔 — 요구사항 40번) ───────── */
export interface OddsRow { grade: GradeId; pct: number; base: number }
export interface OddsView { rows: OddsRow[]; missing: { grade: GradeId; base: number; why: string }[] }

function whyMissing(g: GradeId, pick: Pick): string | null {
  const k = GRADES[g].kind;
  if (pick.kind === 'year') {
    if (k === 'season') return null;
    if (k === 'award') return pick.year >= 2027 ? '’27 시상 전이라 아직 없어요' : null;
    if (g === 'legend') return LEGEND_SEASONS.some((l) => l.year === pick.year) ? null : '이 해는 레전드 시즌이 아니에요';
    return '연도가 붙지 않는 등급이에요';
  }
  const tier = CLUB_TIER[pick.club];
  if (g === 'signature' && tier !== '강') return '이 구단엔 아직 시그니처가 없어요';
  if (g === 'black' && tier === '약') return '이 구단엔 아직 블랙이 없어요';
  return null;
}

export function oddsFor(pack: Pack, pick?: Pick | null): OddsView {
  const missing: OddsView['missing'] = [];
  const keep = pack.odds.filter((o) => {
    const why = pick ? whyMissing(o.grade, pick) : null;
    if (why) missing.push({ grade: o.grade, base: o.pct, why });
    return !why;
  });
  const sum = keep.reduce((s, o) => s + o.pct, 0) || 1;
  const rows = keep
    .map((o) => ({ grade: o.grade, base: o.pct, pct: (o.pct * 100) / sum }))
    .sort((a, b) => rarity(b.grade) - rarity(a.grade));
  return { rows, missing };
}

/** 30장 중 1장 이상 나올 확률 */
export const atLeastOne = (pct: number, n = 30) => 1 - Math.pow(1 - pct / 100, n);

/* ───────── 내 상태 (목업 서버) — 천장 · 보관함 · 쓴 재화 ───────── */
const cardKey = (playerId: string, grade: GradeId, year?: number) => `${playerId}|${grade}|${year ?? ''}`;

const state = {
  pity: Object.fromEntries(PACKS.map((p) => [p.id, p.pity.count])) as Record<string, number>,
  owned: new Map<string, number>(),
  spent: { gp: 0, ball: 0 },
  pulls: 0,
  version: 0,
  lastResult: null as PullResult | null,
  /** 이번에 받은 카드 — 조합(룰렛) 재료 후보 */
  pulled: [] as PulledCard[],
};
for (const id of MY_CARD_IDS) {
  const c = CARDS.find((x) => x.id === id);
  if (c) state.owned.set(cardKey(c.playerId, c.grade, c.year), 1 + c.dup);
}

const listeners = new Set<() => void>();
const bump = () => { state.version++; listeners.forEach((l) => l()); };

export function useGacha() {
  useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => state.version);
  const wallet = useWallet();
  return {
    pityOf: (packId: string) => state.pity[packId] ?? 0,
    wallet,
    lastResult: state.lastResult,
  };
}

/** 보관함에 몇 장 있나 (중복 포함) */
export const ownedCount = (playerId: string, grade: GradeId, year?: number) => state.owned.get(cardKey(playerId, grade, year)) ?? 0;

/* ───────── 결과 ───────── */
export interface PulledCard {
  card: CardInst;
  player: Player;
  /** 깔린 자리 (0~29) */
  slot: number;
  isNew: boolean;
  /** 이 카드를 받기 전 이미 가진 장수 (중복이면 1 이상) */
  had: number;
  tier: 0 | 1 | 2 | 3;
}

export interface PullResult {
  /** 요청 번호 — 서버는 이 번호를 한 번만 처리한다 */
  requestId: string;
  pack: Pack;
  pick: Pick | null;
  cards: PulledCard[];
  /** 가장 좋은 카드 (마지막에 따로 공개) */
  best: number;
  pity: { before: number; after: number; max: number; hit: boolean; reward: string };
  counts: { grade: GradeId; n: number }[];
  fresh: number;
  dups: number;
  price: { gp?: number; ball?: number };
}

/* 선수 고르기 — 등급마다 어울리는 종합 능력치 근처 선수가 잘 나오게 (목업 그럴듯함) */
const TARGET_OVR: Record<GradeId, number> = {
  normal: 66, special: 74, rare: 80, elite: 86, legend: 86, franchise: 88, black: 91, signature: 93, mvp: 90, gg: 86, th: 88, unique: 88,
};
function choosePlayer(pool: Player[], g: GradeId, r: () => number) {
  const target = TARGET_OVR[g];
  const ws = pool.map((p) => Math.exp(-(((p.ovr - target) / 6) ** 2)) + 0.004);
  const sum = ws.reduce((a, b) => a + b, 0);
  let x = r() * sum;
  for (let i = 0; i < pool.length; i++) { x -= ws[i]; if (x <= 0) return pool[i]; }
  return pool[pool.length - 1];
}

const SIG_COLORS = ['#7FE3D4', '#FFB547', '#6EC1FF', '#FF6B4A', '#B48CFF', '#7CE38B', '#FF4FA3', '#FFD84F'];
const ALIAS: [string, PitchType][] = [['폭포수 커브', 'CU'], ['고속 슬라이더', 'SL'], ['돌직구', 'FF'], ['뱀직구', 'SI'], ['백도어 슬라이더', 'SL'], ['고속 포크', 'FS']];

/** 레어 이상 투수의 고유 구종 — 보관함에 있으면 그대로, 없으면 이름 약자형/별칭형으로 */
function sigFor(p: Player): SignaturePitch | undefined {
  if (p.pos !== 'P') return undefined;
  const known = CARDS.find((c) => c.playerId === p.id && c.signaturePitch)?.signaturePitch;
  if (known) return known;
  const hv = h32(p.id);
  const color = SIG_COLORS[hv % SIG_COLORS.length];
  const pitches = (p.pitches ?? []).filter((x) => x.type !== 'FF').sort((a, b) => b.stuff - a.stuff);
  if (hv % 3 === 0 || !pitches.length) {
    const [name, base] = ALIAS[hv % ALIAS.length];
    return { name, base, style: 'alias', effect: '등급이 높을수록 위력 ↑', color };
  }
  const given = p.name.includes(' ') ? p.name.split(' ').pop()! : p.name.slice(-2);
  return { name: `${given} ${PITCH_KO[pitches[0].type]}`, base: pitches[0].type, style: 'initials', effect: '이름을 딴 고유 구종 · 등급이 높을수록 위력 ↑', color };
}

function awardFor(p: Player, g: GradeId, r: () => number): string | undefined {
  if (g === 'gg') return POS_KO[p.pos === 'DH' ? 'DH' : p.pos];
  if (g !== 'th') return undefined;
  if (p.pos === 'P') {
    if (p.role === 'CL') return '세이브';
    if (p.role === 'RP') return '홀드';
    return ['다승', '평균자책', '탈삼진'][Math.floor(r() * 3)];
  }
  const f = (c: string) => p.face.find((x) => x.code === c)?.v ?? 50;
  if (f('POW') >= 84) return '홈런왕';
  if (f('SPD') >= 84) return '도루왕';
  if (f('CON') >= 82) return '타격왕';
  return r() < 0.5 ? '타점왕' : '최다안타';
}

function poolFor(pick: Pick | null): Player[] {
  if (pick?.kind === 'club') return clubPool(pick.club);
  return PLAYERS.filter((p) => p.id !== 'p41');
}

function sample<T extends { pct: number }>(rows: T[], r: () => number): T {
  let x = r() * 100;
  for (const o of rows) { x -= o.pct; if (x <= 0) return o; }
  return rows[rows.length - 1];
}

function yearFor(g: GradeId, pick: Pick | null, r: () => number): number | undefined {
  const k = GRADES[g].kind;
  if (k === 'icon') {
    // 레전드는 레전드 시즌 연도로 나오지만 카드에는 연도를 붙이지 않는다
    return undefined;
  }
  if (pick?.kind === 'year') return pick.year % 100;
  if (k === 'award') return r() < 0.72 ? 26 : 25; // 수상은 시상이 끝난 해만
  const x = r();
  return x < 0.8 ? 27 : x < 0.94 ? 26 : 25;
}

/** 카드 한 장 만들기 (팩 · 조합 공통) */
function makePulled(requestId: string, slot: number, g: GradeId, p: Player, year: number | undefined, r: () => number): PulledCard {
  const rare = rankOf(g) >= rankOf('rare');
  const card: CardInst = {
    id: `${requestId}-${slot}`,
    playerId: p.id,
    grade: g,
    year: GRADES[g].yearTagged ? year : undefined,
    level: 1,
    enhance: 0,
    signaturePitch: rare ? sigFor(p) : undefined,
    award: awardFor(p, g, r),
    dup: 0,
  };
  return { card, player: p, slot, isNew: true, had: 0, tier: tierOf(g) };
}

/** 보관함에 넣기 — 이미 있으면 중복 */
function receive(c: PulledCard) {
  const k = cardKey(c.card.playerId, c.card.grade, c.card.year);
  const had = state.owned.get(k) ?? 0;
  c.had = had;
  c.isNew = had === 0;
  c.card.isNew = c.isNew;
  state.owned.set(k, had + 1);
}

/** 가장 좋은 카드 순서 — 귀함 → 종합 */
const better = (a: PulledCard, b: PulledCard) => rarity(a.card.grade) - rarity(b.card.grade) || a.player.ovr - b.player.ovr;

/** 팩 하나 열기 (목업 서버) — 재화 차감 · 천장 · 보관함 반영을 한 번에 (서버에선 D1 batch 하나) */
export function pullPack(pack: Pack, pick: Pick | null, opt: { seed?: string; forceBest?: GradeId } = {}): PullResult {
  state.pulls += 1;
  const requestId = `req-${Date.now().toString(36)}-${state.pulls}`;
  const r = rng(opt.seed ?? requestId);
  const odds = oddsFor(pack, pick).rows;
  const pool = poolFor(pick);

  const mk = (slot: number, g: GradeId, p: Player, year?: number) => makePulled(requestId, slot, g, p, year, r);

  const cards: PulledCard[] = [];
  for (let i = 0; i < pack.size; i++) {
    const g = sample(odds, r).grade;
    const p = choosePlayer(pool, g, r);
    cards.push(mk(i, g, p, yearFor(g, pick, r)));
  }

  // 데모: 가장 좋은 카드를 정해서 보기 (개발 서버 스크린샷용)
  let forced = -1;
  if (opt.forceBest) {
    const g = opt.forceBest;
    const slot = Math.floor(r() * pack.size);
    forced = slot;
    const p = choosePlayer(pool, g, r);
    const y = pick?.kind === 'year' ? pick.year % 100 : GRADES[g].kind === 'award' ? 26 : 27;
    cards[slot] = mk(slot, g, p, y);
    for (const c of cards) if (c.slot !== slot && rarity(c.card.grade) >= rarity(g)) cards[c.slot] = mk(c.slot, 'rare', choosePlayer(pool, 'rare', r), 27);
  }

  // 천장 — 이 팩 종류의 카운터 (서버 DB 에만 있는 숫자)
  const before = state.pity[pack.id] ?? 0;
  let after = before + 1;
  const hit = after >= pack.pity.max;
  if (hit) {
    after = 0;
    // '…1장' 보장이면 결과 안에서 보장 (선택권이면 따로 지급)
    const need: GradeId | null = pack.pity.guaranteed.startsWith('엘리트') ? 'elite' : pack.pity.guaranteed.startsWith('블랙') ? 'black' : null;
    if (need && !cards.some((c) => rankOf(c.card.grade) >= rankOf(need))) {
      const worst = [...cards].sort(better)[0];
      cards[worst.slot] = mk(worst.slot, need, choosePlayer(pool, need, r), 27);
    }
  }
  state.pity[pack.id] = after;

  // 중복 — 보관함과 이 팩 안에서 앞서 나온 카드 기준
  for (const c of cards) receive(c);

  const best = forced >= 0 ? forced : [...cards].sort(better).pop()!.slot;
  const countMap = new Map<GradeId, number>();
  for (const c of cards) countMap.set(c.card.grade, (countMap.get(c.card.grade) ?? 0) + 1);
  const counts = [...countMap].map(([grade, n]) => ({ grade, n })).sort((a, b) => rarity(b.grade) - rarity(a.grade));

  state.spent.gp += pack.price.gp ?? 0;
  state.spent.ball += pack.price.ball ?? 0;
  spend({ gp: pack.price.gp, ball: pack.price.ball }); // 헤더 지갑도 같이 줄어든다

  const res: PullResult = {
    requestId, pack, pick, cards, best,
    pity: { before, after, max: pack.pity.max, hit, reward: pack.pity.guaranteed },
    counts,
    fresh: cards.filter((c) => c.isNew).length,
    dups: cards.filter((c) => !c.isNew).length,
    price: pack.price,
  };
  state.lastResult = res;
  state.pulled = [...state.pulled, ...cards];
  bump();
  return res;
}

/* ───────── 카드 조합(룰렛) — 안 쓰는 카드 n장 → 새 카드 1장. 칸 크기 = 확률 (요구 39) ───────── */
export interface ComboSlot { grade: GradeId; pct: number; label: string }

/** 이번에 받은 카드 (조합 재료 후보) */
export const sessionCards = () => state.pulled;

/** 조합 돌리기 (목업 서버) — 재료를 쓰고 결과 칸·카드를 정한다. 바늘은 이 결과를 따라갈 뿐 */
export function rollCombo(slots: ComboSlot[], used: string[], seed?: string): { slot: number; result: PulledCard } {
  state.pulls += 1;
  const requestId = `combo-${Date.now().toString(36)}-${state.pulls}`;
  const r = rng(seed ?? requestId);
  const hitSlot = sample(slots, r);
  const k = slots.indexOf(hitSlot);
  const g = hitSlot.grade;
  const p = choosePlayer(poolFor(null), g, r);
  const res = makePulled(requestId, 0, g, p, yearFor(g, null, r), r);
  receive(res);
  state.pulled = state.pulled.filter((c) => !used.includes(c.card.id));
  bump();
  return { slot: k, result: res };
}

/* ───────── 표시 도움 ───────── */
export const yearLabel = (pick: Pick | null) => {
  if (!pick) return '';
  if (pick.kind === 'year') return YEAR_OPTIONS.find((y) => y.year === pick.year)?.tag ?? `’${String(pick.year).slice(-2)}`;
  return teamById(pick.club.toLowerCase()).short;
};

/** 팩 이름 + 고른 것 ('구단팩 · 독수리스') */
export const packTitle = (pack: Pack, pick: Pick | null) => (pick ? `${pack.name} · ${yearLabel(pick)}` : pack.name);
