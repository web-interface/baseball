// 뽑기 계산 — 지금은 목업. 서버가 붙으면 POST /gacha/pull { packId, pick, requestId } 응답(PullResult)으로 바뀐다.
// 화면은 결과를 '이미 정해진 값'으로만 그린다: 연출은 결과를 따라갈 뿐, 결과를 바꾸지 않는다(정직한 연출).
// 중복 카드는 당연히 나온다(강화·각성 재료). 막는 건 '한 번 산 팩을 두 번 처리하는 것' — requestId 로 한 번만.

import { useSyncExternalStore } from 'react';
import { CARDS, PACKS, PLAYERS, teamByCode } from '../../game/mock';
import { CARD_CAP, addCards, lineupIds, ownedCard, spareOf, totalCards, useForRoulette, useInventory } from '../../game/inventory';
import { cryptoRandom, rollCombine, type CombineRoll, type CombineView } from '../../game/combine';
import { GRADES } from '../../game/grades';
import { readWallet, spend, useWallet } from '../../game/wallet';
import { PITCH_KO, POS_KO } from '../../game/labels';
import { CURRENT_SEASON, eraOfCode, isOldCode, shortLabel } from '../../game/world';
import { championOf } from '../../game/clubSeasons';
import { seasonRoster, yearPool } from '../../game/history';
import { cardInst, kboCardsWhere, playerOfKCard, type KCard } from '../../game/kbo';
import type { CardInst, ClubCode, GradeId, Pack, PitchType, Player, SignaturePitch } from '../../game/types';
import { CLUB_TIER, LEGEND_SEASONS, YEAR_OPTIONS, clubLegendPool, clubTitleYears, yearOption } from './local-mock';

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

/* ───────── 카드 풀 — 실제 선수 카탈로그(game/kbo)의 카드 종류. 등급 안에서는 카드마다 같은 확률 ───────── */
const poolCache = new Map<string, KCard[]>();
/** 그 등급 · 그 팩(연도 · 구단)에서 나올 수 있는 카드 종류 */
export function catalogPool(g: GradeId, pick: Pick | null): KCard[] {
  const key = `${g}|${pick?.kind ?? ''}|${pick?.kind === 'year' ? pick.year : pick?.kind === 'club' ? pick.club : ''}`;
  const hit = poolCache.get(key);
  if (hit) return hit;
  let out: KCard[];
  if (pick?.kind === 'year') out = GRADES[g].kind === 'icon' && g !== 'legend' ? [] : kboCardsWhere({ grade: g, year: pick.year });
  else if (pick?.kind === 'club') out = kboCardsWhere({ grade: g, code: pick.club });
  else out = kboCardsWhere({ grade: g });
  poolCache.set(key, out);
  return out;
}

function whyMissing(g: GradeId, pick: Pick | null): string | null {
  if (catalogPool(g, pick).length) return null;
  if (!pick) return '아직 이 등급 카드가 없어요';
  const k = GRADES[g].kind;
  if (pick.kind === 'club') return `이 구단엔 아직 ${GRADES[g].ko} 카드가 없어요`;
  if (k === 'icon' && g !== 'legend') return '연도가 붙지 않는 등급이에요';
  if (k === 'award' && pick.year >= CURRENT_SEASON) return `’${String(pick.year).slice(-2)} 시상 전이라 아직 없어요`;
  if (g === 'legend') return '이 해를 황금기로 둔 레전드가 없어요';
  return '이 해 카드가 아직 없어요';
}

/** (레거시) 가상 선수 시절 규칙 — 카탈로그에 카드가 하나도 없을 때만 */
export function whyMissingLegacy(g: GradeId, pick: Pick): string | null {
  const k = GRADES[g].kind;
  if (pick.kind === 'year') {
    if (k === 'season') return null;
    if (k === 'award') return pick.year >= CURRENT_SEASON ? `’${String(pick.year).slice(-2)} 시상 전이라 아직 없어요` : null;
    if (g === 'legend') {
      if (LEGEND_SEASONS.some((l) => l.year === pick.year)) return null;
      return yearOption(pick.year)?.live ? '한별 시리즈가 아직 끝나지 않았어요' : '이 해는 레전드 시즌이 아니에요';
    }
    return '연도가 붙지 않는 등급이에요';
  }
  const tier = CLUB_TIER[pick.club];
  if (g === 'signature' && tier !== '강') return '이 구단엔 아직 시그니처가 없어요';
  if (g === 'black' && tier === '약') return '이 구단엔 아직 블랙이 없어요';
  return null;
}

export function oddsFor(pack: Pack, pick?: Pick | null): OddsView {
  let missing: OddsView['missing'] = [];
  const filter = (rule: (g: GradeId) => string | null) => pack.odds.filter((o) => {
    const why = rule(o.grade);
    if (why) missing.push({ grade: o.grade, base: o.pct, why });
    return !why;
  });
  let keep = filter((g) => whyMissing(g, pick ?? null));
  // 그 팩에 실제 선수 카드가 하나도 없으면(수집 전 연도 · 구단) 레거시 가상 선수 규칙으로
  if (!keep.length) { missing = []; keep = filter((g) => (pick ? whyMissingLegacy(g, pick) : null)); }
  const sum = keep.reduce((s, o) => s + o.pct, 0) || 1;
  const rows = keep
    .map((o) => ({ grade: o.grade, base: o.pct, pct: (o.pct * 100) / sum }))
    .sort((a, b) => rarity(b.grade) - rarity(a.grade));
  return { rows, missing };
}

/** 확률 글(% 빼고) — 아주 작은 값도 0.00 으로 뭉개지지 않게 유효 숫자 2~3자리 (0.001 · 0.025 · 0.154 · 2.1 · 82.7) */
export function pctStr(v: number): string {
  if (!(v > 0)) return '0';
  if (v >= 10) return v.toFixed(1);
  if (v >= 1) return v.toFixed(2).replace(/0$/, '').replace(/\.$/, '');
  const d = Math.min(6, 2 - Math.floor(Math.log10(v)));
  return v.toFixed(d).replace(/0+$/, '').replace(/\.$/, '');
}

/** 30장 중 1장 이상 나올 확률 */
export const atLeastOne = (pct: number, n = 30) => 1 - Math.pow(1 - pct / 100, n);

/* ───────── 내 상태 (목업 서버) — 천장 · 쓴 재화. 받은 카드는 보유 카드 저장소(game/inventory)로 바로 들어간다 ───────── */
const state = {
  pity: Object.fromEntries(PACKS.map((p) => [p.id, p.pity.count])) as Record<string, number>,
  spent: { gp: 0, ball: 0 },
  pulls: 0,
  version: 0,
  lastResult: null as PullResult | null,
};

const listeners = new Set<() => void>();
const bump = () => { state.version++; listeners.forEach((l) => l()); };

export function useGacha() {
  useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => state.version);
  useInventory();
  const wallet = useWallet();
  return {
    pityOf: (packId: string) => state.pity[packId] ?? 0,
    wallet,
    lastResult: state.lastResult,
  };
}

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
  /** 이 장으로 같은 카드 수량이 차서 자동 강화됐으면 (VI → VII) */
  up?: { from: number; to: number } | null;
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
  /** 이번 팩으로 자동 강화된 카드 */
  ups: { card: CardInst; player: Player; from: number; to: number }[];
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

/** 카드 연도(2자리) → 4자리 */
const full = (y: number) => (y >= 100 ? y : y <= (CURRENT_SEASON % 100) + 1 ? 2000 + y : 1900 + y);

/**
 * 선수 풀 — 그 해 · 그 구단 선수단(game/history).
 *  연도팩: 그 해 리그에 있던 모든 구단 (레전드는 그 해 우승 구단 주축) · 구단팩: 카드 연도의 그 구단 (연도 없는 등급은 구단 전설 풀)
 *  기본 팩: 지금 목업 선수
 */
function poolFor(pick: Pick | null, g: GradeId, year?: number): Player[] {
  if (pick?.kind === 'club') {
    const list = year != null ? seasonRoster(pick.club, full(year)) : clubLegendPool(pick.club);
    return list.length ? list : clubLegendPool(pick.club);
  }
  if (pick?.kind === 'year') {
    if (g === 'legend') {
      const ch = championOf(pick.year);
      const stars = ch ? seasonRoster(ch, pick.year).filter((p) => p.ovr >= 78) : [];
      if (stars.length) return stars;
    }
    return yearPool(pick.year);
  }
  return PLAYERS.filter((p) => p.id !== 'p41');
}

function sample<T extends { pct: number }>(rows: T[], r: () => number): T {
  let x = r() * 100;
  for (const o of rows) { x -= o.pct; if (x <= 0) return o; }
  return rows[rows.length - 1];
}

/**
 * 구단팩 연도 — 그 구단이 있던 해만. 지금 구단은 열 장에 여섯 장꼴로 최근 세 시즌('27 위주),
 * 나머지는 그 구단의 모든 해에서 고루(우승한 해는 세 배 자주). 수상 등급은 시상이 끝난 해(2026까지)만.
 */
function clubYear(code: ClubCode, r: () => number, award: boolean): number {
  const [from, end] = eraOfCode(code);
  const to = award ? Math.min(end, CURRENT_SEASON - 1) : end;
  if (!isOldCode(code) && r() < 0.6) {
    const x = r();
    const y = award ? (x < 0.72 ? CURRENT_SEASON - 1 : CURRENT_SEASON - 2) : x < 0.8 ? CURRENT_SEASON : x < 0.94 ? CURRENT_SEASON - 1 : CURRENT_SEASON - 2;
    return Math.max(from, Math.min(to, y));
  }
  const titles = new Set(clubTitleYears(code));
  const ys: number[] = [];
  for (let y = from; y <= to; y++) ys.push(y);
  const ws = ys.map((y) => (titles.has(y) ? 3 : 1));
  let x = r() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ys.length; i++) { x -= ws[i]; if (x <= 0) return ys[i]; }
  return ys[ys.length - 1];
}

/** 카드 연도 (2자리) — 레전드·프랜차이즈·블랙·시그니처는 연도를 붙이지 않는다 */
function yearFor(g: GradeId, pick: Pick | null, r: () => number): number | undefined {
  const k = GRADES[g].kind;
  if (k === 'icon') return undefined;
  if (pick?.kind === 'year') return pick.year % 100;
  if (pick?.kind === 'club') return clubYear(pick.club, r, k === 'award') % 100;
  if (k === 'award') return r() < 0.72 ? 26 : 25; // 수상은 시상이 끝난 해만
  const x = r();
  return x < 0.8 ? 27 : x < 0.94 ? 26 : 25;
}

/** 카탈로그 카드 한 장 (팩 · 조합 공통) — 카드 id 는 카탈로그 id 그대로 */
function pulledOf(kc: KCard, slot: number): PulledCard {
  const card = cardInst(kc);
  const player = playerOfKCard(kc)!;
  return { card, player, slot, isNew: true, had: 0, tier: tierOf(kc.grade) };
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

/** 보관함에 넣기 (한 번에 저장) — 같은 카드면 중복 → 수량이 차면 자동 강화. 카드 id 는 보관함 id 로 바뀐다 */
function receive(list: PulledCard[]) {
  const res = addCards(list.map((c) => c.card));
  list.forEach((c, i) => {
    const r = res[i];
    if (!r) return;
    c.card = { ...c.card, id: r.id, isNew: r.isNew };
    c.had = r.had;
    c.isNew = r.isNew;
    c.up = r.up;
  });
}

/** 가장 좋은 카드 순서 — 귀함 → 종합 */
const better = (a: PulledCard, b: PulledCard) => rarity(a.card.grade) - rarity(b.card.grade) || a.player.ovr - b.player.ovr;

/** 팩 하나 열기 (목업 서버) — 재화 차감 · 천장 · 보관함 반영을 한 번에 (서버에선 D1 batch 하나) */
export function pullPack(pack: Pack, pick: Pick | null, opt: { seed?: string; forceBest?: GradeId } = {}): PullResult {
  state.pulls += 1;
  const requestId = `req-${Date.now().toString(36)}-${state.pulls}`;
  const r = rng(opt.seed ?? requestId);
  const odds = oddsFor(pack, pick).rows;

  // 카드 한 장 — 등급 → 그 등급 · 그 팩의 카드 종류 중 하나 (같은 확률). 카탈로그가 비면 레거시 가상 선수
  const draw = (slot: number, g: GradeId): PulledCard => {
    const pool = catalogPool(g, pick);
    if (pool.length) return pulledOf(pool[Math.floor(r() * pool.length)], slot);
    const year = yearFor(g, pick, r);
    return makePulled(requestId, slot, g, choosePlayer(poolFor(pick, g, year), g, r), year, r);
  };

  const cards: PulledCard[] = [];
  for (let i = 0; i < pack.size; i++) cards.push(draw(i, sample(odds, r).grade));

  // 데모: 가장 좋은 카드를 정해서 보기 (개발 서버 스크린샷용)
  let forced = -1;
  if (opt.forceBest) {
    const g = opt.forceBest;
    const slot = Math.floor(r() * pack.size);
    forced = slot;
    cards[slot] = draw(slot, g);
    for (const c of cards) if (c.slot !== slot && rarity(c.card.grade) >= rarity(g)) cards[c.slot] = draw(c.slot, 'rare');
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
      cards[worst.slot] = draw(worst.slot, need);
    }
  }
  state.pity[pack.id] = after;

  // 중복 — 보관함과 이 팩 안에서 앞서 나온 카드 기준
  receive(cards);

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
    ups: cards.filter((c) => c.up).map((c) => ({ card: c.card, player: c.player, from: c.up!.from, to: c.up!.to })),
    price: pack.price,
  };
  state.lastResult = res;
  bump();
  return res;
}

/* ───────── 자동 열기 — 같은 팩을 여러 개(최대 10) 연달아. 팩마다 따로 처리(요청 번호 · 천장 · 보관함 · 재화) ───────── */
export const AUTO_MAX = 10;

/** 지금 재화로 살 수 있는 팩 수 (cap 까지) */
export function affordCount(pack: Pack, w: { gp: number; ball: number }, cap = AUTO_MAX): number {
  const gp = pack.price.gp ?? 0, ball = pack.price.ball ?? 0;
  let k = cap;
  if (gp > 0) k = Math.min(k, Math.floor(w.gp / gp));
  if (ball > 0) k = Math.min(k, Math.floor(w.ball / ball));
  return Math.max(0, k);
}

/** 같은 팩 n개 연달아 열기 (목업 서버) — 결과는 여기서 다 정해지고 보관함에 들어간다. 재화가 모자라면 거기서 멈춘다 */
export function pullMany(pack: Pack, pick: Pick | null, n: number): PullResult[] {
  const out: PullResult[] = [];
  const want = Math.max(0, Math.min(AUTO_MAX, Math.floor(n)));
  for (let i = 0; i < want; i++) {
    if (affordCount(pack, readWallet(), 1) < 1) break;
    if (totalCards() > CARD_CAP) break; // 상한(10만 장)을 넘으면 거기서 멈춘다 (자동 정리 먼저)
    out.push(pullPack(pack, pick));
  }
  return out;
}

export interface AutoSummary {
  packs: number;
  cards: number;
  counts: { grade: GradeId; n: number }[];
  fresh: number;
  dups: number;
  ups: PullResult['ups'];
  /** 천장에 닿은 팩 (몇 번째 · 보상) */
  hits: { pack: number; reward: string }[];
  /** 빛나는 카드(엘리트 이상 — 레전드 · 수상 · 프랜차이즈 …) — 귀한 순 · 종합 순. 하나도 없으면 가장 좋은 카드 몇 장 */
  top: PulledCard[];
  /** top 이 빛나는 카드인가 (아니면 '가장 좋은 카드') */
  topIsGlow: boolean;
  spent: { gp: number; ball: number };
  /** 마지막 팩 뒤 천장 */
  pity: PullResult['pity'];
}

/** 자동 열기 요약 — 등급별 장수 · 새 카드 · 중복 · 강화 · 천장 · 빛나는 카드 */
export function summarize(runs: PullResult[]): AutoSummary {
  const cards = runs.flatMap((r) => r.cards);
  const countMap = new Map<GradeId, number>();
  for (const c of cards) countMap.set(c.card.grade, (countMap.get(c.card.grade) ?? 0) + 1);
  const counts = [...countMap].map(([grade, n]) => ({ grade, n })).sort((a, b) => rarity(b.grade) - rarity(a.grade));
  const sorted = [...cards].sort(better).reverse();
  const glow = sorted.filter((c) => rarity(c.card.grade) >= rarity('legend')); // 레전드(4) · 엘리트(5) 이상 = 카드 테가 빛나는 등급
  return {
    packs: runs.length,
    cards: cards.length,
    counts,
    fresh: cards.filter((c) => c.isNew).length,
    dups: cards.filter((c) => !c.isNew).length,
    ups: runs.flatMap((r) => r.ups),
    hits: runs.map((r, i) => (r.pity.hit ? { pack: i + 1, reward: r.pity.reward } : null)).filter((x): x is { pack: number; reward: string } => !!x),
    top: glow.length ? glow : sorted.slice(0, 6),
    topIsGlow: glow.length > 0,
    spent: runs.reduce((a, r) => ({ gp: a.gp + (r.price.gp ?? 0), ball: a.ball + (r.price.ball ?? 0) }), { gp: 0, ball: 0 }),
    pity: runs[runs.length - 1]?.pity ?? { before: 0, after: 0, max: 0, hit: false, reward: '' },
  };
}

/* ───────── 카드 조합(룰렛) — 안 쓰는 카드 n장 → 새 카드 1장. 칸 크기 = 확률 (요구 39) ───────── */
export interface ComboSlot { grade: GradeId; pct: number; label: string }

/**
 * 조합 돌리기 (목업 서버) — 재료(보관함 카드 id → 장수)를 빼고 결과 칸·카드를 정해 보관함에 넣는다. 바늘은 이 결과를 따라갈 뿐.
 * 재료가 모자라거나 보호 카드(라인업 마지막 1장 · 강화한 카드 마지막 1장 · 특별 선수)면 null.
 */
export function rollCombo(slots: ComboSlot[], use: Record<string, number>, seed?: string): { slot: number; result: PulledCard } | null {
  if (!useForRoulette(use)) return null;
  state.pulls += 1;
  const requestId = `combo-${Date.now().toString(36)}-${state.pulls}`;
  const r = rng(seed ?? requestId);
  const hitSlot = sample(slots, r);
  const k = slots.indexOf(hitSlot);
  const g = hitSlot.grade;
  const pool = catalogPool(g, null);
  const res = pool.length ? pulledOf(pool[Math.floor(r() * pool.length)], 0) : makePulled(requestId, 0, g, choosePlayer(poolFor(null, g), g, r), yearFor(g, null, r), r);
  receive([res]);
  bump();
  return { slot: k, result: res };
}

/* ───────── 선수조합 (#/combine) — 조합 공식(game/combine)이 정한 확률로 결과를 정해 바로 저장 ───────── */
export type ComboWithResult =
  | { ok: true; requestId: string; result: PulledCard; roll: CombineRoll }
  | { ok: false; why: 'material' | 'gp' | 'pool' };

/**
 * 선수조합 한 번 (목업 서버) — 재료 확인 → 결과 정하기(난수, 기본 crypto) → 비용 → 재료 빼기 → 결과 카드 넣기를 한 번에.
 * 룰렛 연출은 돌려준 결과를 따라갈 뿐이다. 실패하면 아무것도 안 바뀐다:
 *  · material: 재료 장수가 view 와 다르거나, 남는 장보다 많이 쓰거나(라인업 · 강화 · 훈련 카드 마지막 1장 · 특별 선수), 잠근 카드
 *  · gp: pay() 가 false (비용 모자람) · pool: 카드 풀이 빔(일어나지 않아야 함)
 * 결과 카드는 넣은 재료와 다른 카드로 (game/combine 의 풀 넓히기 — 끝까지 재료 카드뿐일 때만 같은 카드).
 */
export function rollComboWith(o: { view: CombineView; use: Record<string, number>; pay?: () => boolean; rand?: () => number; seed?: string }): ComboWithResult {
  const { view, use } = o;
  const guard = lineupIds();
  const total = Object.values(use).reduce((a, b) => a + b, 0);
  const bad = Object.entries(use).some(([id, k]) => !(k > 0) || !Number.isInteger(k) || spareOf(id, guard) < k || !!ownedCard(id)?.locked);
  if (!view.ready || total !== view.n || bad) return { ok: false, why: 'material' };
  const roll = rollCombine(view, o.rand ?? (o.seed != null ? rng(o.seed) : cryptoRandom), new Set(Object.keys(use)));
  if (!roll) return { ok: false, why: 'pool' };
  if (o.pay && !o.pay()) return { ok: false, why: 'gp' };
  if (!useForRoulette(use)) return { ok: false, why: 'material' };
  state.pulls += 1;
  const requestId = `combine-${Date.now().toString(36)}-${state.pulls}`;
  const res = pulledOf(roll.card, 0);
  receive([res]);
  bump();
  return { ok: true, requestId, result: res, roll };
}

/* ───────── 표시 도움 ───────── */
export const yearLabel = (pick: Pick | null) => {
  if (!pick) return '';
  if (pick.kind === 'year') return YEAR_OPTIONS.find((y) => y.year === pick.year)?.tag ?? `’${String(pick.year).slice(-2)}`;
  return shortLabel(pick.club);
};
/** 그 구단 (구단팩 무대 · 결과 연출) */
export const pickTeam = (pick: Pick | null) => (pick?.kind === 'club' ? teamByCode(pick.club) : undefined);

/** 팩 이름 + 고른 것 ('구단팩 · 독수리스') */
export const packTitle = (pack: Pack, pick: Pick | null) => (pick ? `${pack.name} · ${yearLabel(pick)}` : pack.name);
