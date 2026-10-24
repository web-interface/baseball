// 보유 카드 저장소 — 내 카드에 관한 모든 것을 한 곳에서 (서버가 붙으면 load()/persist() 두 함수만 서버 호출로 바꾼다).
//
//  · 카드 종류(카드 id)마다 { 보유 수량 n · 강화 단계 enh(0~10) · 지금 단계 연속 실패 · 레벨(8.99 표기) · 처음 얻은 시각 }
//    + 이 카드로 받은 총 장수(got) · 강화에 쓴 장수(mat) · 조합(룰렛)에 쓴 장수(rl) — got = n + mat + rl 이 늘 맞아야 한다.
//  · 처음엔 구단 선택에서 받은 기본 선수단 · 지명 · 특별 선수 카드(game/starter)로 시작한다.
//  · 카드구매(뽑기) · 카드 조합 결과 · 스카우터 구매는 addCards() 로 즉시 들어온다. 조합 재료는 useForRoulette() 로 빠진다.
//  · 라인업(25명)도 여기 저장한다 — 새로고침해도 유지. 라인업 카드는 마지막 1장을 재료로 쓸 수 없다(보호).
//  · 중복 → 강화: 같은 카드가 ENH_STEPS 의 필요 수량만큼 모이면 +1~+5 는 그 자리에서 자동으로 오른다(재료 수량 차감).
//    +6~+10 은 GP·확률이 걸려 있어 강화 화면에서 '도전'으로(같은 카드 1장 + GP, 실패 보정). 최대 단계에서 넘치는 중복은 쌓아 둔다(조합 재료).
//  · 저장: localStorage 'bb.inv' (형식 버전 v). 깨졌거나 모르는 형식이면 처음 선수단으로 다시 시작하고 한 번 안내한다.
//  · 형식 v2 (실제 선수 카탈로그): 카드 id 는 카탈로그 id(`{선수 ID}-{연도}{등급}` 등 — game/kbo). 카드 → 선수 본체는 ID 로 찾는다.
//    v1(가상 선수 시절) 저장은 지우지 않고 v2 로 옮긴다 — 모든 카드 · 수량 · 강화 · 라인업을 그대로 두고, 그때의 시작 설정을
//    legacy.start 에 적어 레거시 카드('k-'·'kd-'·'x-'·'d-'·'g-')를 같은 시드로 다시 만든다(옮긴 뒤 보유 수량 합이 같다 — 시험 scripts/kbo.test.ts).
//  · 훈련(game/training): 카드마다 tr = { 단계 0~10 · 능력치별 오른 값 · 특수구질 단계 · 연속 실패 · 시도 수 } — 강화와 따로. 없으면 훈련 전.
//    tryTrain() 이 확률(crypto 난수)로 그 자리에서 정하고 저장한다. 보유 카드 보기 ownedCard().train 으로 카드 그림·라인업·엔진이 읽는다.
import { useSyncExternalStore } from 'react';
import { CARDS, cardById, playerById, registerPlayers } from './mock';
import { isKboCardId } from './kbo';
import { readStart, registerLegacyStarter, resetStarter, setStarterKind, starter, type StartPicks } from './starter';
import { legacyDraftPool } from './legacy/starter';
import { legacyRoster } from './legacy/history';
import { spend } from './wallet';
import {
  SIG, TRAIN_MAX, canTrainKey, costOf, gainAt, gainTotal, keyAtPlace, oddsOf, placeById, placeLock, sumGains, trainRandom,
  type TrainCost, type TrainOdds,
} from './training';
import type { CardInst, ClubCode, GradeId, SignaturePitch } from './types';
import type { LineupState } from '../screens/lineup/calc';

/* ───────── 강화 규칙 (기획서 7.1) — 이 표 하나만 쓴다 ───────── */
/** 재료 군: A = 레어 이상·수상·특별 선수 · B = 스페셜 · C = 노멀 */
export type MatClass = 'A' | 'B' | 'C';
export const matClass = (g: GradeId): MatClass => (g === 'normal' ? 'C' : g === 'special' ? 'B' : 'A');
export const MAT_CLASS_KO: Record<MatClass, string> = { A: '레어 이상', B: '스페셜', C: '노멀' };

export interface EnhStep {
  stage: number;
  /** 같은 카드 몇 장 (군별) */
  mat: Record<MatClass, number>;
  gp: number;
  /** 성공 확률 % (실패 보정 전) */
  base: number;
  /** 이번 단계에서 대표 능력치 6개 모두 오르는 값 */
  gain: number;
  /** 수량이 차면 바로 오름(+1~+5) */
  auto: boolean;
}
export const ENH_STEPS: EnhStep[] = [
  { stage: 1, mat: { A: 1, B: 2, C: 3 }, gp: 0, base: 100, gain: 1, auto: true },
  { stage: 2, mat: { A: 2, B: 3, C: 5 }, gp: 0, base: 100, gain: 1, auto: true },
  { stage: 3, mat: { A: 3, B: 4, C: 6 }, gp: 0, base: 100, gain: 1, auto: true },
  { stage: 4, mat: { A: 4, B: 5, C: 8 }, gp: 0, base: 100, gain: 1, auto: true },
  { stage: 5, mat: { A: 5, B: 7, C: 9 }, gp: 0, base: 100, gain: 2, auto: true },
  { stage: 6, mat: { A: 1, B: 1, C: 1 }, gp: 50_000, base: 100, gain: 1, auto: false },
  { stage: 7, mat: { A: 1, B: 1, C: 1 }, gp: 100_000, base: 75, gain: 1, auto: false },
  { stage: 8, mat: { A: 1, B: 1, C: 1 }, gp: 200_000, base: 60, gain: 1, auto: false },
  { stage: 9, mat: { A: 1, B: 1, C: 1 }, gp: 400_000, base: 45, gain: 1, auto: false },
  { stage: 10, mat: { A: 1, B: 1, C: 1 }, gp: 800_000, base: 35, gain: 2, auto: false },
];
export const ENH_MAX = 10;
/** 자동 강화가 멈추는 단계 */
export const ENH_AUTO_MAX = 5;
/** 실패마다 오르는 확률 %p · 이만큼 실패하면 다음은 확정 */
export const PITY_STEP = 15;
export const PITY_CAP = 3;
/** 단계 stage(1~10)로 올리는 데 드는 같은 카드 장수 */
export const needFor = (g: GradeId, stage: number) => ENH_STEPS[stage - 1]?.mat[matClass(g)] ?? 0;
/** 0 → enh 까지 자동 강화로 쓴 장수 합 */
export const autoMatTotal = (g: GradeId, enh: number) => ENH_STEPS.slice(0, Math.min(enh, ENH_AUTO_MAX)).reduce((s, x) => s + x.mat[matClass(g)], 0);
export const chanceAfter = (base: number, fails: number) => (fails >= PITY_CAP ? 100 : Math.min(100, base + PITY_STEP * fails));
export const enhGainTotal = (enh: number) => ENH_STEPS.slice(0, enh).reduce((s, x) => s + x.gain, 0);
/** 특별 선수 카드는 재료로도, 중복 자동 강화로도 쓰지 않는다(1인 1장 — 강화권 전용, 기획서 2.5) */
const autoable = (g: GradeId) => g !== 'unique';

/* ───────── 저장 형식 ───────── */
export const INV_KEY = 'bb.inv';
export const INV_VERSION = 2;
/** 뽑기로 새로 생긴 카드 종류 — 다시 열 때 카드를 다시 만들 수 있게 최소 정보 */
export interface CardDefLite { p: string; g: GradeId; y?: number; a?: string; sig?: SignaturePitch }
export interface InvEntry {
  /** 지금 보유 수량 (0 이면 '가졌던 카드' — 목록엔 안 보임) */
  n: number;
  /** 강화 0~10 */
  enh: number;
  /** 지금 단계 연속 실패 0~3 (+7 이상) */
  fail: number;
  /** 레벨 8.99 표기 (정수부 레벨 · 소수부 경험치 %) */
  lv: number;
  /** 처음 얻은 시각 (ms) */
  at: number;
  /** 이 카드로 받은 총 장수 · 강화에 쓴 장수 · 조합에 쓴 장수 */
  got: number;
  mat: number;
  rl: number;
  /** +5 플레이스타일 */
  ps?: string | null;
  def?: CardDefLite;
  /** 훈련 (없으면 훈련 전) */
  tr?: TrainSave;
}
/** 훈련 저장 — lv 단계 0~10 · g 능력치 코드별 오른 값('SIG' = 특수구질) · sig 특수구질 단계 · streak 지금 연속 실패 · n 시도 수 */
export interface TrainSave { lv: number; g: Record<string, number>; sig?: number; streak?: number; n?: number }
export interface EnhEvent { id: string; from: number; to: number; at: number; src: 'auto' | 'manual' }
export interface InvStats { got: number; enhUsed: number; rouletteUsed: number }
export interface InvSave {
  v: typeof INV_VERSION;
  /** v1(가상 선수) 저장을 옮겨 온 경우 — 그때의 시작 설정 (레거시 기본 선수단 카드를 다시 만들 때) */
  legacy?: { start: StartPicks; from: 1; at: number };
  /** 이 보관함의 시작 구단 — 구단을 새로 고르면 처음 선수단으로 다시 시작 */
  club: string;
  cards: Record<string, InvEntry>;
  lineup: LineupState | null;
  stats: InvStats;
  /** 스카우터 — 오늘(05시 기준) 데려온 진열 id */
  shop: { day: string; ids: string[] };
  /** 최근 강화 (새 것 먼저, 30개까지) */
  recent: EnhEvent[];
}

/* ───────── 상태 ───────── */
let state: InvSave | null = null;
let notice: string | null = null;
let version = 0;
const listeners = new Set<() => void>();
const viewCache = new Map<string, CardInst>();

const now = () => Date.now();
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isInt = (x: unknown, lo: number, hi: number) => isNum(x) && Number.isInteger(x) && x >= lo && x <= hi;

function seed(): InvSave {
  const st = starter();
  const cards: Record<string, InvEntry> = {};
  const t = now();
  for (const id of st.cards) {
    const c = cardById(id);
    if (!c || cards[id]) continue;
    cards[id] = { n: 1, enh: 0, fail: 0, lv: c.level || 1, at: t, got: 1, mat: 0, rl: 0 };
  }
  return { v: INV_VERSION, club: st.club, cards, lineup: null, stats: { got: Object.keys(cards).length, enhUsed: 0, rouletteUsed: 0 }, shop: { day: '', ids: [] }, recent: [] };
}

function validEntry(e: unknown): e is InvEntry {
  if (!e || typeof e !== 'object') return false;
  const x = e as InvEntry;
  return isInt(x.n, 0, 1e7) && isInt(x.enh, 0, ENH_MAX) && isInt(x.fail, 0, PITY_CAP) && isNum(x.lv) && x.lv >= 0 && x.lv <= 20
    && isNum(x.at) && isInt(x.got, 0, 1e7) && isInt(x.mat, 0, 1e7) && isInt(x.rl, 0, 1e7)
    && (x.def == null || (typeof x.def === 'object' && typeof x.def.p === 'string' && typeof x.def.g === 'string'));
}
/** 훈련 기록이 틀린 모양이면 그 카드의 훈련만 버린다 (보관함 전체를 처음으로 돌리지 않게) — 훈련 전 저장은 tr 이 없다 */
function cleanTrain(e: InvEntry) {
  const t = e.tr as unknown;
  if (t == null) return;
  const x = t as TrainSave;
  const ok = typeof t === 'object' && isInt(x.lv, 0, TRAIN_MAX) && !!x.g && typeof x.g === 'object' && !Array.isArray(x.g)
    && Object.values(x.g).every((g) => isNum(g) && g >= 0 && g <= 1000)
    && (x.sig == null || isInt(x.sig, 0, TRAIN_MAX)) && (x.streak == null || isInt(x.streak, 0, 1e7)) && (x.n == null || isInt(x.n, 0, 1e9));
  if (!ok) delete e.tr;
}
/** 저장 형식 검사 — 틀리면 null */
export function parseSave(raw: string | null): InvSave | null {
  if (!raw) return null;
  let v: InvSave;
  try { v = JSON.parse(raw) as InvSave; } catch { return null; }
  if (!v || typeof v !== 'object' || (v.v !== INV_VERSION && (v.v as number) !== 1) || typeof v.club !== 'string' || !v.cards || typeof v.cards !== 'object') return null;
  if (!Object.values(v.cards).every(validEntry)) return null;
  Object.values(v.cards).forEach(cleanTrain);
  const s = v.stats;
  if (!s || !isInt(s.got, 0, 1e9) || !isInt(s.enhUsed, 0, 1e9) || !isInt(s.rouletteUsed, 0, 1e9)) return null;
  if (v.lineup != null && typeof v.lineup !== 'object') return null;
  if (!v.shop || typeof v.shop.day !== 'string' || !Array.isArray(v.shop.ids)) v.shop = { day: '', ids: [] };
  if (!Array.isArray(v.recent)) v.recent = [];
  if ((v.v as number) === 1) migrateV1(v);
  return v;
}

/** v1 → v2 — 카드 · 수량 · 강화 · 라인업은 그대로, 그때의 시작 설정만 적어 둔다(레거시 카드 다시 만들기) */
export function migrateV1(v: InvSave) {
  const st = readStart();
  v.v = INV_VERSION;
  v.legacy = { start: { club: v.club, picks: st.club === v.club ? st.picks : [], special: st.special }, from: 1, at: Date.now() };
}

function load(): InvSave {
  const club = starter().club;
  let raw: string | null = null;
  try { raw = localStorage.getItem(INV_KEY); } catch { /* 저장이 막혀 있으면 이번 방문만 */ }
  const parsed = parseSave(raw);
  let s: InvSave;
  if (parsed && parsed.club === club) {
    s = parsed;
  } else {
    if (raw != null && !parsed) notice = '보유 카드 저장이 깨져 있거나 예전 형식이라, 처음 받은 선수단으로 다시 시작했어요';
    s = seed();
  }
  state = s;
  if (s.legacy) registerLegacyStarter(s.legacy.start);
  for (const [id, e] of Object.entries(s.cards)) if (e.def) ensureCard(id, e.def);
  for (const id of Object.keys(s.cards)) if (!cardById(id)) ensureLegacyCard(id);
  const migrated = !!raw && !!parsed && !raw.includes('"legacy"') && !!parsed.legacy; // 방금 v1 → v2 로 옮김
  if (raw == null || !parsed || parsed.club !== club || migrated) persist();
  return s;
}

const S = (): InvSave => state ?? load();

function persist() {
  try { if (state) localStorage.setItem(INV_KEY, JSON.stringify(state)); } catch { /* 저장 공간이 차면 이번 방문만 */ }
}
function bump() {
  version++;
  viewCache.clear();
  listeners.forEach((l) => l());
}
/* 묶어 쓰기 — 자동 정리처럼 수천 번 바꾸는 동안엔 저장 · 알림을 미뤘다가 끝에 한 번 (batchInventory) */
let batching = 0;
let dirty = false;
const commit = () => { if (batching) { dirty = true; return; } persist(); bump(); };
/** fn 안에서 바뀐 것을 끝에 한 번만 저장하고 알린다 (화면 다시 그리기도 한 번) */
export function batchInventory<T>(fn: () => T): T {
  batching++;
  try { return fn(); } finally {
    batching--;
    if (!batching && dirty) { dirty = false; persist(); bump(); }
  }
}

/* ───────── 카드 · 선수 다시 만들기 (뽑기로 생긴 카드) ───────── */
/** 선수 다시 만들기 — 실제 선수 보기 '{선수 ID}~{연도}' 는 카탈로그에서, 레거시 연도팩·구단팩 'x-{구단}-{연도2}-…' · 지명 'd-{구단}-{n}' 은 시드로 */
export function ensurePlayer(pid: string): boolean {
  if (playerById(pid)) return true;
  const x = /^x-([a-z]+)-(\d{2})-/.exec(pid);
  if (x) {
    const yy = Number(x[2]);
    legacyRoster(x[1].toUpperCase() as ClubCode, yy <= 30 ? 2000 + yy : 1900 + yy);
    return !!playerById(pid);
  }
  const d = /^d-([a-z]+)-\d+$/.exec(pid);
  if (d) { legacyDraftPool(d[1]); return !!playerById(pid); }
  return false;
}
/** 정의 없이 저장된 레거시 카드 — 지명 카드 'kd-d-{구단}-{n}' (레거시 시작 설정 밖에서 받은 것) */
function ensureLegacyCard(id: string) {
  const d = /^kd-(d-[a-z]+-\d+)$/.exec(id);
  if (!d || !ensurePlayer(d[1])) return;
  const c: CardInst = { id, playerId: d[1], grade: 'special', year: 26, level: 1, enhance: 0, dup: 0 };
  CARDS.push(c);
  registerPlayers([], [c]);
}
function ensureCard(id: string, def: CardDefLite): CardInst | undefined {
  const hit = cardById(id);
  if (hit) return hit;
  if (!ensurePlayer(def.p)) return undefined;
  const c: CardInst = { id, playerId: def.p, grade: def.g, year: def.y, level: 1, enhance: 0, signaturePitch: def.sig, award: def.a, dup: 0 };
  CARDS.push(c);
  registerPlayers([], [c]);
  kindIndex.set(kindKey(c), id);
  return c;
}

/** 같은 카드 = 같은 선수 · 등급 · 연도 */
const kindKey = (c: { playerId: string; grade: GradeId; year?: number }) => `${c.playerId}|${c.grade}|${c.year ?? ''}`;
const kindIndex = new Map<string, string>();
let indexed = 0;
function canonicalId(c: CardInst): string {
  if (isKboCardId(c.id)) return c.id; // 실제 선수 카드 — 카탈로그 id 그대로
  if (indexed !== CARDS.length) {
    for (let i = indexed; i < CARDS.length; i++) { const k = kindKey(CARDS[i]); if (!kindIndex.has(k)) kindIndex.set(k, CARDS[i].id); }
    indexed = CARDS.length;
  }
  const hit = kindIndex.get(kindKey(c));
  if (hit) return hit;
  return `g-${c.playerId}-${c.grade}-${c.year ?? 'x'}`;
}

/* ───────── 읽기 ───────── */
export function useInventory(): number {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => version);
}
/** 바뀔 때마다 오르는 번호 (계산 캐시용) */
export const invVersion = () => { S(); return version; };
export const entryOf = (id: string): InvEntry | undefined => S().cards[id];
export const ownedCount = (id: string) => S().cards[id]?.n ?? 0;
export const isOwned = (id: string) => ownedCount(id) > 0;
/** 보관함 카드 수 상한 — 넘으면 카드구매를 막고 선수조합 › 자동 정리로 줄이게 한다 (사용자 지시) */
export const CARD_CAP = 30_000; // 사용자 지시 (처음 1만 → 3만). 저장은 카드 종류 · 장수라 장수가 늘어도 크기는 종류 수만큼
/** 상한 글 ('3만') */
export const CARD_CAP_KO = `${CARD_CAP / 10_000}만`;
/** 가진 카드 장수 합 (같은 카드 여러 장 포함) */
export function totalCards(): number {
  let n = 0;
  for (const e of Object.values(S().cards)) if (e.n > 0) n += e.n;
  return n;
}
/** 지금 가진 카드 id (화면에 보일 수 있는 것만) */
export function ownedIds(): string[] {
  const s = S();
  return Object.keys(s.cards).filter((id) => s.cards[id].n > 0 && !!cardById(id));
}
/** 보유 카드 보기 — 카드 정의 + 내 강화 · 레벨 · 같은 카드 장수(dup = n − 1) · 훈련(1단계 이상일 때 train) */
export function ownedCard(id: string): CardInst | undefined {
  const hit = viewCache.get(id);
  if (hit) return hit;
  const e = S().cards[id];
  const c = cardById(id);
  if (!e || !c || e.n <= 0) return undefined;
  const v: CardInst = { ...c, enhance: e.enh, level: e.lv, dup: Math.max(0, e.n - 1), isNew: false };
  if (e.tr && e.tr.lv > 0) v.train = { lv: e.tr.lv, gains: { ...e.tr.g }, ...(e.tr.sig ? { sig: e.tr.sig } : {}) };
  viewCache.set(id, v);
  return v;
}
export const stats = (): InvStats => ({ ...S().stats });
export const recentEnh = (): EnhEvent[] => S().recent.slice();
/** 한 번 보여 줄 안내 (깨진 저장을 정리했을 때) */
export function takeInvNotice(): string | null {
  S();
  const n = notice;
  notice = null;
  return n;
}

/** 다음 강화까지 — 자동 단계면 같은 카드 have/need, 도전 단계면 재료 1장 + GP */
export function nextStep(id: string): { stage: number; need: number; have: number; auto: boolean; gp: number; chance: number } | null {
  const e = S().cards[id];
  const c = cardById(id);
  if (!e || !c || e.enh >= ENH_MAX) return null;
  const st = ENH_STEPS[e.enh];
  return { stage: st.stage, need: needFor(c.grade, st.stage), have: Math.max(0, e.n - 1), auto: st.auto, gp: st.gp, chance: chanceAfter(st.base, e.fail) };
}

/* ───────── 라인업 · 보호 ───────── */
function lineupIdsOf(l: LineupState | null): Set<string> {
  const out = new Set<string>();
  if (l) {
    for (const v of Object.values(l.field ?? {})) if (v) out.add(v);
    for (const v of [...(l.rotation ?? []), ...(l.bullpen ?? []), l.closer, ...(l.bench ?? [])]) if (v) out.add(v);
  } else {
    const st = starter().lineup;
    for (const b of st.batting) out.add(b.cardId);
    for (const v of [...st.rotation, ...st.bullpen, st.closer, ...st.bench]) if (v) out.add(v);
  }
  return out;
}
/** 라인업(1군 25명)에 있는 카드 — 저장된 라인업이 없으면 처음 라인업 */
export const lineupIds = () => lineupIdsOf(S().lineup);
export const inLineup = (id: string) => lineupIds().has(id);
/** 라인업 저장 (null = 처음 라인업으로) */
export function saveLineup(l: LineupState | null) { S().lineup = l; commit(); }
export const loadLineup = (): LineupState | null => S().lineup;

/**
 * 조합(룰렛) 재료로 쓸 수 있는 장수.
 * 라인업 카드 · 강화한 카드 · 훈련한 카드 · 특별 선수는 마지막 1장을 남긴다(0장이 되어 라인업 자리가 비거나 강화 · 훈련이 사라지지 않게).
 */
export function spareOf(id: string, guard = lineupIds()): number {
  const e = S().cards[id];
  const c = cardById(id);
  if (!e || !c || e.n <= 0 || c.grade === 'unique') return 0;
  const keep = guard.has(id) || e.enh > 0 || (e.tr?.lv ?? 0) > 0 ? 1 : 0;
  return Math.max(0, e.n - keep);
}

/* ───────── 쓰기 ───────── */
export interface AddResult {
  /** 보관함 카드 id (같은 카드면 기존 id) */
  id: string;
  /** 받기 전 가진 장수 */
  had: number;
  isNew: boolean;
  /** 이번 장으로 자동 강화가 됐으면 */
  up: { from: number; to: number } | null;
}

function autoEnhance(id: string, e: InvEntry, g: GradeId, s: InvSave): { from: number; to: number } | null {
  if (!autoable(g)) return null;
  const from = e.enh;
  while (e.enh < ENH_AUTO_MAX) {
    const need = needFor(g, e.enh + 1);
    if (e.n - 1 < need) break;
    e.n -= need;
    e.mat += need;
    s.stats.enhUsed += need;
    e.enh += 1;
    e.fail = 0;
  }
  if (e.enh === from) return null;
  s.recent = [{ id, from, to: e.enh, at: now(), src: 'auto' as const }, ...s.recent].slice(0, 30);
  return { from, to: e.enh };
}

/** 카드 받기 (뽑기 · 조합 결과 · 스카우터) — 여러 장을 한 번에 저장 */
export function addCards(list: CardInst[]): AddResult[] {
  const s = S();
  const out: AddResult[] = [];
  for (const c of list) {
    const id = canonicalId(c);
    if (!cardById(id)) {
      const def: CardDefLite = { p: c.playerId, g: c.grade };
      if (c.year != null) def.y = c.year;
      if (c.award) def.a = c.award;
      if (c.signaturePitch) def.sig = c.signaturePitch;
      if (!ensureCard(id, def)) continue;
      s.cards[id] = { n: 0, enh: 0, fail: 0, lv: c.level || 1, at: now(), got: 0, mat: 0, rl: 0, def };
    }
    let e = s.cards[id];
    if (!e) e = s.cards[id] = { n: 0, enh: 0, fail: 0, lv: c.level || 1, at: now(), got: 0, mat: 0, rl: 0 };
    const had = e.n;
    e.n += 1;
    e.got += 1;
    s.stats.got += 1;
    const up = autoEnhance(id, e, cardById(id)!.grade, s);
    out.push({ id, had, isNew: had === 0, up });
  }
  commit();
  return out;
}

/** 조합(룰렛) 재료 쓰기 — 카드 id → 장수. 모자라거나 보호 카드면 아무것도 안 바꾸고 false */
export function useForRoulette(use: Record<string, number>): boolean {
  const s = S();
  const guard = lineupIds();
  for (const [id, k] of Object.entries(use)) if (!(k > 0) || spareOf(id, guard) < k) return false;
  for (const [id, k] of Object.entries(use)) {
    const e = s.cards[id];
    e.n -= k;
    e.rl += k;
    s.stats.rouletteUsed += k;
  }
  commit();
  return true;
}

/** 결과 판정 (서버가 정할 값 — 목업은 시드: 같은 카드 · 같은 단계 · 같은 시도 = 같은 결과) */
function roll(seedStr: string) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  let t = (h + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export type TryResult =
  | { ok: true; success: boolean; stage: number; chance: number; nextChance: number | null; gp: number; gain: number }
  | { ok: false; why: 'max' | 'auto' | 'material' | 'gp' | 'missing'; need?: number; have?: number };
/**
 * +6~+10 강화 도전 — 같은 카드 1장 + GP. 실패해도 단계·카드 그대로, 실패마다 +15%p, 3번 실패 뒤 확정.
 * (+1~+5 는 같은 카드가 모이면 자동으로 오른다 — 여기서는 '수량이 모자라요'로 돌려준다)
 */
export function tryEnhance(id: string, pay: (gp: number) => boolean = (gp) => spend({ gp })): TryResult {
  const s = S();
  const e = s.cards[id];
  const c = cardById(id);
  if (!e || !c || e.n <= 0) return { ok: false, why: 'missing' };
  if (e.enh >= ENH_MAX) return { ok: false, why: 'max' };
  const st = ENH_STEPS[e.enh];
  const need = needFor(c.grade, st.stage);
  if (st.auto) return { ok: false, why: 'auto', need, have: Math.max(0, e.n - 1) };
  if (e.n - 1 < need) return { ok: false, why: 'material', need, have: Math.max(0, e.n - 1) };
  if (!pay(st.gp)) return { ok: false, why: 'gp' };
  const chance = chanceAfter(st.base, e.fail);
  const success = chance >= 100 || roll(`enh|${id}|${st.stage}|${e.mat}`) * 100 < chance;
  e.n -= need;
  e.mat += need;
  s.stats.enhUsed += need;
  if (success) {
    s.recent = [{ id, from: e.enh, to: e.enh + 1, at: now(), src: 'manual' as const }, ...s.recent].slice(0, 30);
    e.enh += 1;
    e.fail = 0;
  } else {
    e.fail = Math.min(PITY_CAP, e.fail + 1);
  }
  commit();
  return { ok: true, success, stage: st.stage, chance, nextChance: success ? null : chanceAfter(st.base, e.fail), gp: st.gp, gain: st.gain };
}

/** 플레이스타일 (+5 이상) */
export function setPlaystyle(id: string, ps: string | null) {
  const e = S().cards[id];
  if (!e) return;
  e.ps = ps;
  commit();
}

/* ───────── 훈련 (규칙 · 표는 game/training) ───────── */
/** 지금 훈련 상태 — 저장이 없으면 0단계 */
export interface TrainState {
  lv: number;
  /** 능력치 코드별 오른 값 ('SIG' = 특수구질) */
  gains: Record<string, number>;
  /** 특수구질 단계 */
  sig: number;
  /** 지금 연속 실패 */
  streak: number;
  /** 시도 수 */
  tries: number;
}
export function trainOf(id: string): TrainState {
  const t = S().cards[id]?.tr;
  return { lv: t?.lv ?? 0, gains: { ...(t?.g ?? {}) }, sig: t?.sig ?? 0, streak: t?.streak ?? 0, tries: t?.n ?? 0 };
}

/** 훈련할 수 없는 까닭 — 내 카드 아님 · 최종 단계 · 이 카드에 없는 능력치 · 이 장소에서 못 하는 능력치 · 잠긴 장소 · 비용 모자람 */
export type TrainWhy = 'missing' | 'max' | 'key' | 'place' | 'locked' | 'pay';
type Quote =
  | { ok: true; e: InvEntry; lv: number; odds: TrainOdds; cost: TrainCost; gain: number }
  | { ok: false; why: TrainWhy; text?: string };
function quote(id: string, key: string, placeId: string): Quote {
  const e = S().cards[id];
  const c = cardById(id);
  const p = c ? playerById(c.playerId) : undefined;
  if (!e || !c || !p || e.n <= 0) return { ok: false, why: 'missing' };
  const lv = e.tr?.lv ?? 0;
  if (lv >= TRAIN_MAX) return { ok: false, why: 'max' };
  if (!canTrainKey(p, c, key)) return { ok: false, why: 'key' };
  const place = placeById(placeId);
  if (!place || !keyAtPlace(place, key)) return { ok: false, why: 'place' };
  const lock = placeLock(place, p, c, lv);
  if (lock) return { ok: false, why: 'locked', text: lock };
  return { ok: true, e, lv, odds: oddsOf(lv, key, place, e.tr?.streak ?? 0)!, cost: costOf(lv, key, place), gain: gainAt(lv, key === SIG) };
}
/** 이 카드 · 능력치 · 장소의 이번 성공 확률 (훈련할 수 없으면 null) */
export function trainChance(id: string, key: string, placeId: string): TrainOdds | null {
  const q = quote(id, key, placeId);
  return q.ok ? q.odds : null;
}
/** 이번 한 번 비용 · 성공하면 오르는 값 (훈련할 수 없으면 null) */
export function trainQuote(id: string, key: string, placeId: string): { odds: TrainOdds; cost: TrainCost; gain: number; lv: number } | { why: TrainWhy; text?: string } {
  const q = quote(id, key, placeId);
  return q.ok ? { odds: q.odds, cost: q.cost, gain: q.gain, lv: q.lv } : { why: q.why, text: q.text };
}

export type TrainTry =
  | { ok: true; success: boolean; key: string; place: string; from: number; to: number; gain: number; chance: number; roll: number; cost: TrainCost; streak: number }
  | { ok: false; why: TrainWhy; text?: string };
/**
 * 훈련 한 번 — 비용을 내고 그 자리에서 난수(crypto)로 정한다.
 * 성공: 단계 +1 · 고른 능력치 +(1 + ⌊단계/3⌋) (특수구질은 +(2 + ⌊단계/3⌋) · 특수구질 단계 +1) · 연속 실패 0.
 * 실패: 비용만 쓰고 연속 실패 +1 (다음 확률 +2%p, 최대 +10%p) — 단계 · 오른 값은 그대로.
 * pay: 비용을 내면 true (모자라면 false — 아무것도 안 바뀜) · rng: 시험용 난수.
 */
export function tryTrain(id: string, key: string, placeId: string, pay: (c: TrainCost) => boolean = (c) => spend(c), rng: () => number = trainRandom): TrainTry {
  const q = quote(id, key, placeId);
  if (!q.ok) return q;
  if (!pay(q.cost)) return { ok: false, why: 'pay' };
  const e = q.e;
  const t: TrainSave = e.tr ?? { lv: 0, g: {} };
  const roll = rng();
  const success = roll * 100 < q.odds.total;
  t.n = (t.n ?? 0) + 1;
  if (success) {
    t.lv = q.lv + 1;
    t.g[key] = (t.g[key] ?? 0) + q.gain;
    if (key === SIG) t.sig = (t.sig ?? 0) + 1;
    t.streak = 0;
  } else {
    t.streak = (t.streak ?? 0) + 1;
  }
  e.tr = t;
  commit();
  return { ok: true, success, key, place: placeId, from: q.lv, to: t.lv, gain: success ? q.gain : 0, chance: q.odds.total, roll, cost: q.cost, streak: t.streak };
}

/* ───────── 스카우터 구매 기록 (하루 = 05:00 기준) ───────── */
export function gameDay(d = new Date()) {
  const x = new Date(d.getTime() - 5 * 3600 * 1000);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
export function shopBoughtToday(): string[] {
  const s = S();
  return s.shop.day === gameDay() ? s.shop.ids.slice() : [];
}
/** 스카우터에서 데려오기 — 진열 id 기록 + 카드 넣기 */
export function buyFromShop(itemId: string, card: CardInst): AddResult | null {
  const s = S();
  const day = gameDay();
  if (s.shop.day !== day) s.shop = { day, ids: [] };
  if (s.shop.ids.includes(itemId)) return null;
  s.shop.ids.push(itemId);
  return addCards([card])[0] ?? null;
}

/* ───────── 다시 시작 · 시험 ───────── */
/** 처음 선수단으로 (구단을 새로 골라 창단) */
export function resetInventory() {
  setStarterKind('kbo');
  resetStarter();
  state = seed();
  commit();
}
/** 같은 구단으로 다시 창단 — 모은 카드는 두고, 새 기본 선수단·지명·특별 선수 카드 중 없는 것만 더하고 라인업은 처음 라인업으로 */
export function mergeStarter() {
  const s = S();
  setStarterKind('kbo');
  resetStarter();
  for (const id of starter().cards) {
    const c = cardById(id);
    if (!c) continue;
    const e = s.cards[id];
    if (e && e.n > 0) continue;
    if (e) { e.n += 1; e.got += 1; } else s.cards[id] = { n: 1, enh: 0, fail: 0, lv: c.level || 1, at: now(), got: 1, mat: 0, rl: 0 };
    s.stats.got += 1;
  }
  s.lineup = null;
  commit();
}
/** 저장에서 다시 읽기 (시험 · 다른 탭에서 바뀌었을 때) */
export function reloadInventory() {
  state = null;
  load();
  bump();
}

/**
 * 저장 검사 — 맞지 않는 것을 글로 돌려준다(빈 배열이면 정상).
 *  · 전체: 받은 장수 = 남은 수량 + 강화에 쓴 수량 + 조합에 쓴 수량
 *  · 카드마다: got = n + mat + rl, 강화 0~10, +5 까지는 쓴 장수가 필요 수량 표와 같고, 다음 자동 단계 수량이 차 있지 않음
 */
export function checkInventory(s: InvSave = S()): string[] {
  const bad: string[] = [];
  let n = 0, mat = 0, rl = 0;
  for (const [id, e] of Object.entries(s.cards)) {
    n += e.n; mat += e.mat; rl += e.rl;
    if (e.got !== e.n + e.mat + e.rl) bad.push(`${id}: 받은 ${e.got} ≠ 보유 ${e.n} + 강화 ${e.mat} + 조합 ${e.rl}`);
    if (e.enh < 0 || e.enh > ENH_MAX) bad.push(`${id}: 강화 ${e.enh}`);
    if (e.tr) {
      // 훈련: 오른 값 합 = 단계마다 오르는 값의 합 (특수구질 단계는 1씩 더)
      const sig = e.tr.sig ?? 0, sum = sumGains(e.tr.g), want = gainTotal(e.tr.lv, sig);
      if (sum !== want) bad.push(`${id}: 훈련 ${e.tr.lv}단계인데 오른 값 합 ${sum} (표 ${want})`);
      if (sig > e.tr.lv || ((e.tr.g[SIG] ?? 0) > 0) !== sig > 0) bad.push(`${id}: 특수구질 단계 ${sig} · 오른 값 ${e.tr.g[SIG] ?? 0} 이 훈련 ${e.tr.lv}단계와 안 맞음`);
    }
    const c = cardById(id);
    if (!c) continue;
    if (!autoable(c.grade)) continue;
    const auto = autoMatTotal(c.grade, e.enh);
    if (e.enh <= ENH_AUTO_MAX) {
      if (e.mat !== auto) bad.push(`${id}: +${e.enh} 인데 강화에 쓴 장수 ${e.mat} (표 ${auto})`);
    } else if (e.mat < auto + (e.enh - ENH_AUTO_MAX)) bad.push(`${id}: +${e.enh} 인데 강화에 쓴 장수 ${e.mat} 가 너무 적음`);
    if (e.enh < ENH_AUTO_MAX && e.n > 0 && e.n - 1 >= needFor(c.grade, e.enh + 1)) bad.push(`${id}: 같은 카드 ${e.n}장인데 +${e.enh + 1} 로 안 오름`);
  }
  if (s.stats.got !== n + s.stats.enhUsed + s.stats.rouletteUsed) bad.push(`전체: 받은 ${s.stats.got} ≠ 보유 ${n} + 강화 ${s.stats.enhUsed} + 조합 ${s.stats.rouletteUsed}`);
  if (s.stats.enhUsed !== mat) bad.push(`전체 강화 ${s.stats.enhUsed} ≠ 카드별 합 ${mat}`);
  if (s.stats.rouletteUsed !== rl) bad.push(`전체 조합 ${s.stats.rouletteUsed} ≠ 카드별 합 ${rl}`);
  return bad;
}
/** 지금 저장 그대로 (시험용 사본) */
export const snapshot = (): InvSave => JSON.parse(JSON.stringify(S())) as InvSave;
