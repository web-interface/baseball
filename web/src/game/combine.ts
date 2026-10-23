// 선수조합 공식 (#/combine) — 카드 3~5장 → 새 카드 1장. 순수 계산만 한다: 저장 · 재화 · 화면은 다른 곳(screens/gacha/draw 의 rollComboWith · screens/combine).
//
//  · 기본 등급: 재료 등급을 사다리(노멀 0 · 스페셜 1 · 레어 2 · 엘리트 3 · 레전드 4)에 올려 평균을 내림.
//    수상(MVP·GG·TH) · 프랜차이즈 · 블랙 · 시그니처 · 특별 선수는 레전드로 친다. 결과는 사다리를 따라 레전드까지.
//  · 결과 확률 (같은 등급 / 한 단계 위 / 두 단계 위): 3장 80/18/2 · 4장 72/24/4 · 5장 62/31/7. 레전드를 넘는 칸은 레전드로 합친다.
//  · 조합 공식 — 맞으면 '같은 등급' 몫에서 위 칸으로 옮긴다(음수 없이, 합은 늘 100%):
//      같은 등급(모두 같은 등급) 한 단계 위 +4%p · 구단 조합(모두 같은 구단) 그 구단 카드 + 한 단계 위 +3%p
//      연도 조합(모두 같은 카드 연도) 그 해 카드 + 두 단계 위 +1%p · 왕조 조합(같은 구단 + 같은 연도) 두 단계 위 +2%p 더 · 그 해 그 구단 카드
//      포지션 조합(모두 투수 / 모두 타자) 결과도 그쪽 · 짝 조합(2루수+유격수 또는 투수+포수) 한 단계 위 +2%p
//      히든 조합(5장 · 모두 엘리트 이상 · 같은 구단) 그 구단 프랜차이즈 0.5% 칸 (같은 등급 몫에서)
//  · 카드 풀: 고정된 구단 · 연도 · 투수/타자 안에서 그 등급 카드 종류 중 하나(같은 확률). 그 풀이 비면 연도 → 구단(같은 계보 먼저) → 투수/타자 순으로 푼다.
//    넣은 재료와 같은 카드는 결과에서 뺀다 — 묶인 풀에 재료 카드뿐이면 위 순서로 더 풀고, 그래도 없을 때만 나올 수 있다. 등급 확률은 그대로.
//  · 확률은 1000분율 정수로 계산해 합이 정확히 1000(=100%)이다. 결과는 누르는 순간 난수(crypto)로 정하고, 연출은 그 결과를 따라갈 뿐이다.
import { GRADES } from './grades';
import { kboCard, kboCardsWhere, kboPerson, type KCard } from './kbo';
import { LINEAGE } from './world';
import type { CardInst, GradeId, Player, Pos } from './types';

/* ───────── 사다리 ───────── */
export const LADDER = ['normal', 'special', 'rare', 'elite', 'legend'] as const;
export type LadderGrade = (typeof LADDER)[number];
export const LADDER_TOP = LADDER.length - 1;
/** 사다리 칸 — 사다리 밖 등급(수상 · 프랜차이즈 · 블랙 · 시그니처 · 특별 선수)은 레전드 칸 */
export function ladderOf(g: GradeId): number {
  const i = (LADDER as readonly string[]).indexOf(g);
  return i >= 0 ? i : LADDER_TOP;
}
/** 레전드 칸으로 '쳐지는' 등급 (레전드 자신은 빼고) — 화면 안내용 */
export const cappedGrade = (g: GradeId) => !(LADDER as readonly string[]).includes(g);

export const MIN_MATS = 3;
export const MAX_MATS = 5;
/** 1000분율 — 같은 등급 / 한 단계 위 / 두 단계 위 */
export const BASE_SPLIT: Record<3 | 4 | 5, [number, number, number]> = {
  3: [800, 180, 20],
  4: [720, 240, 40],
  5: [620, 310, 70],
};
/** 조합 비용 (GP) */
export const COMBINE_FEE: Record<3 | 4 | 5, number> = { 3: 10_000, 4: 20_000, 5: 30_000 };
const clampN = (n: number) => Math.max(MIN_MATS, Math.min(MAX_MATS, n)) as 3 | 4 | 5;
export const feeOf = (n: number) => COMBINE_FEE[clampN(n)];

/* ───────── 재료 ───────── */
export type Side = 'P' | 'B';
/** 재료 한 장 — 조합 계산에 필요한 것만 */
export interface MatInfo {
  /** 보관함 카드 id */
  id: string;
  grade: GradeId;
  /** 구단 코드 (모르면 null) */
  club: string | null;
  /** 카드 연도 4자리 — 카드에 연도가 안 찍히면 null (레전드 · 프랜차이즈 · 블랙 · 시그니처 · 특별 선수) */
  year: number | null;
  pos: Pos;
}
export const sideOfPos = (p: Pos): Side => (p === 'P' ? 'P' : 'B');

/** 2자리 카드 연도 → 4자리 (지난 세기 카드는 81 이후) */
export const fullYear = (y: number) => (y >= 100 ? y : y <= 28 ? 2000 + y : 1900 + y);

/** 보유 카드 → 재료 정보. 실제 선수 카드는 카탈로그의 구단 · 연도, 옛 가상 선수 카드는 선수 구단 · 카드 연도 */
export function matInfoOf(c: CardInst, p: Player): MatInfo {
  const k = kboCard(c.id);
  const club = k?.code ?? (p.teamId ? p.teamId.toUpperCase() : null);
  const tagged = GRADES[c.grade].yearTagged;
  const year = !tagged ? null : k?.year ?? (c.year != null ? fullYear(c.year) : null);
  return { id: c.id, grade: c.grade, club, year, pos: p.pos };
}

/* ───────── 공식 ───────── */
export type FormulaId = 'grade' | 'club' | 'year' | 'dynasty' | 'side' | 'pair' | 'hidden';
export interface FormulaDef {
  id: FormulaId;
  name: string;
  /** 조건 */
  rule: string;
  /** 효과 (짧게) */
  effect: string;
  /** 옮길 칸 (1 한 단계 위 · 2 두 단계 위) — 0 은 확률을 옮기지 않음 */
  steps: 0 | 1 | 2;
  /** 옮길 몫 (1000분율) */
  units: number;
}
export const FORMULAS: readonly FormulaDef[] = [
  { id: 'grade', name: '같은 등급', rule: '모두 같은 등급', effect: '한 단계 위 +4%p', steps: 1, units: 40 },
  { id: 'club', name: '구단 조합', rule: '모두 같은 구단 · 서로 다른 카드 3장 이상 — 그 구단 카드로', effect: '한 단계 위 +3%p', steps: 1, units: 30 },
  { id: 'year', name: '연도 조합', rule: '모두 같은 연도 · 서로 다른 카드 3장 이상 — 그 해 카드로', effect: '두 단계 위 +1%p', steps: 2, units: 10 },
  { id: 'dynasty', name: '왕조 조합', rule: '같은 구단 + 같은 연도 · 서로 다른 카드 3장 이상', effect: '두 단계 위 +2%p', steps: 2, units: 20 },
  { id: 'side', name: '포지션 조합', rule: '모두 투수 또는 모두 타자', effect: '결과도 그쪽', steps: 0, units: 0 },
  { id: 'pair', name: '짝 조합', rule: '2루수+유격수 또는 투수+포수', effect: '한 단계 위 +2%p', steps: 1, units: 20 },
  { id: 'hidden', name: '히든 조합', rule: '5장 · 모두 엘리트 이상 · 같은 구단', effect: '프랜차이즈 0.5%', steps: 0, units: 5 },
];
export const formulaDef = (id: FormulaId) => FORMULAS.find((f) => f.id === id)!;

export interface FormulaState {
  id: FormulaId;
  met: boolean;
  /** 맞은 값 — 등급 id · 구단 코드 · 연도 · 'P'/'B' · '2B+SS'/'P+C' */
  value?: string | number;
  /** 가장 많이 겹치는 장수 (안 맞을 때 '3/4장' 힌트) — 짝 · 히든은 없음 */
  have?: number;
  /** 히든: 그 구단(또는 계보)에 프랜차이즈 카드가 있나 */
  avail?: boolean;
}

/** 결과가 묶이는 곳 */
export interface Fix { club: string | null; year: number | null; side: Side | null }

/** 풀을 넓힌 단계 — 연도 풀기 · 같은 계보 구단으로 · 구단 풀기 · 투수/타자 풀기 */
export type Relax = 'year' | 'lineage' | 'club' | 'side';
export const RELAX_KO: Record<Relax, string> = { year: '연도', lineage: '같은 계보 구단', club: '구단', side: '투수·타자' };

export type Step = 0 | 1 | 2 | 'hidden';
export const STEP_KO: Record<string, string> = { 0: '같은 등급', 1: '한 단계 위', 2: '두 단계 위', hidden: '히든' };

export interface OutRow {
  step: Step;
  grade: GradeId;
  /** 1000분율 (정수) — 모든 줄 합 1000 */
  units: number;
  /** % (units / 10) */
  pct: number;
  /** 레전드 위로 넘쳐 이 줄에 합쳐진 칸 (예: 엘리트 기본이면 레전드 줄에 [1, 2]) */
  merged: number[];
  /** 이 등급은 묶인 풀에 카드가 없어 넓힌 것 */
  relaxed: Relax[];
  /** 넓힌 까닭이 '맞는 카드가 넣은 재료뿐'이라서 */
  byMats?: boolean;
}

export interface CombineView {
  /** 재료 장수 */
  n: number;
  /** 3~5장 */
  ready: boolean;
  /** 기본 등급 (재료가 없으면 null) */
  base: LadderGrade | null;
  baseIdx: number;
  /** 재료 사다리 평균 (소수) */
  avg: number;
  formulas: FormulaState[];
  fix: Fix;
  /** 결과 확률 — 같은 등급부터 (재료가 없으면 빈 배열). 3장 미만이면 3장 기준 미리 보기 */
  rows: OutRow[];
  /** 공식 보너스로 위 칸에 옮긴 몫 (1000분율, 히든 포함) */
  moved: number;
  /** 조합 비용 (GP) */
  fee: number;
  /** 레전드로 쳐진 재료 장수 (수상 · 프랜차이즈 · 블랙 · 시그니처) */
  capped: number;
  /** 결과에서 뺄 카드 — 넣은 재료 (보관함 카드 id = 카탈로그 id) */
  exclude: ReadonlySet<string>;
}

const POS_PAIRS: [Pos, Pos, string][] = [['2B', 'SS', '2B+SS'], ['P', 'C', 'P+C']];

/** 가장 많이 겹치는 값과 그 장수 */
function mode<T>(xs: (T | null)[]): { v: T | null; n: number } {
  const m = new Map<T, number>();
  let best: T | null = null, bn = 0;
  for (const x of xs) {
    if (x == null) continue;
    const k = (m.get(x) ?? 0) + 1;
    m.set(x, k);
    if (k > bn) { bn = k; best = x; }
  }
  return { v: best, n: bn };
}

/** 재료 → 공식 · 고정 · 확률 */
export function analyze(mats: readonly MatInfo[]): CombineView {
  const n = mats.length;
  const k = clampN(n);
  const fee = COMBINE_FEE[k];
  const exclude = new Set(mats.map((m) => m.id));
  const empty: CombineView = { n, ready: false, base: null, baseIdx: 0, avg: 0, formulas: FORMULAS.map((f) => ({ id: f.id, met: false })), fix: { club: null, year: null, side: null }, rows: [], moved: 0, fee, capped: 0, exclude };
  if (n === 0) return empty;

  const idx = mats.map((m) => ladderOf(m.grade));
  const avg = idx.reduce((a, b) => a + b, 0) / n;
  const baseIdx = Math.min(LADDER_TOP, Math.floor(avg + 1e-9));
  const capped = mats.filter((m) => cappedGrade(m.grade)).length;

  // 공식 판정 — 한 장일 땐 비교할 게 없어 모두 미정
  const cmp = n >= 2;
  const gm = mode(mats.map((m) => m.grade));
  const cm = mode(mats.map((m) => m.club));
  const ym = mode(mats.map((m) => m.year));
  const dm = mode(mats.map((m) => (m.club && m.year != null ? `${m.club}|${m.year}` : null)));
  const sm = mode(mats.map((m) => sideOfPos(m.pos)));
  const sameGrade = cmp && gm.n === n;
  // 구단 · 연도 · 왕조(· 히든)는 서로 다른 카드가 3장 이상이어야 — 같은 카드 여러 장으로 공식이 다 맞는 걸 막는다
  const varied = new Set(mats.map((m) => m.id)).size >= 3;
  const sameClub = cmp && cm.n === n && varied;
  const sameYear = cmp && ym.n === n && varied;
  const dynasty = sameClub && sameYear;
  const sameSide = cmp && sm.n === n;
  const poss = new Set(mats.map((m) => m.pos));
  const pairs = POS_PAIRS.filter(([a, b]) => poss.has(a) && poss.has(b)).map((x) => x[2]);
  const hiddenMet = n === MAX_MATS && sameClub && idx.every((i) => i >= ladderOf('elite'));
  const fix: Fix = { club: sameClub ? cm.v : null, year: sameYear ? ym.v : null, side: sameSide ? sm.v : null };
  const hiddenPool = hiddenMet ? poolOf('franchise', fix, true, exclude) : null;
  const hiddenAvail = !!hiddenPool && hiddenPool.cards.length > 0;

  const formulas: FormulaState[] = [
    { id: 'grade', met: sameGrade, value: sameGrade ? gm.v! : undefined, have: gm.n },
    { id: 'club', met: sameClub, value: sameClub ? cm.v! : undefined, have: cm.n },
    { id: 'year', met: sameYear, value: sameYear ? ym.v! : undefined, have: ym.n },
    { id: 'dynasty', met: dynasty, value: dynasty ? `${cm.v} ${ym.v}` : undefined, have: dm.n },
    { id: 'side', met: sameSide, value: sameSide ? sm.v! : undefined, have: sm.n },
    { id: 'pair', met: cmp && pairs.length > 0, value: pairs.length ? pairs.join(' · ') : undefined },
    { id: 'hidden', met: hiddenMet, avail: hiddenMet ? hiddenAvail : undefined },
  ];

  // 확률 — 같은 등급 몫에서 옮김 (모자라면 있는 만큼만)
  const s = [...BASE_SPLIT[k]];
  let moved = 0;
  const take = (units: number) => { const t = Math.max(0, Math.min(units, s[0])); s[0] -= t; moved += t; return t; };
  for (const f of formulas) {
    const def = formulaDef(f.id);
    if (!f.met || def.steps === 0) continue;
    s[def.steps] += take(def.units);
  }
  const hiddenUnits = hiddenMet && hiddenAvail ? take(formulaDef('hidden').units) : 0;

  // 칸 → 등급 (레전드 위는 레전드로 합침)
  const rows: OutRow[] = [];
  for (let st = 0; st < 3; st++) {
    const g = LADDER[Math.min(LADDER_TOP, baseIdx + st)];
    const hit = rows.find((r) => r.grade === g);
    if (hit) { hit.units += s[st]; hit.merged.push(st); continue; }
    rows.push({ step: st as 0 | 1 | 2, grade: g, units: s[st], pct: 0, merged: [], relaxed: [] });
  }
  if (hiddenUnits > 0) rows.push({ step: 'hidden', grade: 'franchise', units: hiddenUnits, pct: 0, merged: [], relaxed: hiddenPool!.relaxed });
  const out = rows.filter((r) => r.units > 0);
  for (const r of out) {
    r.pct = r.units / 10;
    if (r.step === 'hidden') continue;
    r.relaxed = poolOf(r.grade, fix, false, exclude).relaxed;
    if (r.relaxed.length && r.relaxed.join() !== poolOf(r.grade, fix).relaxed.join()) r.byMats = true;
  }
  return { n, ready: n >= MIN_MATS && n <= MAX_MATS, base: LADDER[baseIdx], baseIdx, avg, formulas, fix, rows: out, moved, fee, capped, exclude };
}

/** 확률 합 (1000 이어야 한다) */
export const unitsTotal = (v: Pick<CombineView, 'rows'>) => v.rows.reduce((a, r) => a + r.units, 0);

/* ───────── 카드 풀 ───────── */
const sideCache = new Map<string, Side>();
/** 카탈로그 카드의 투수/타자 (그 카드가 능력치를 가져온 시즌 포지션) */
export function sideOfCard(c: KCard): Side {
  const hit = sideCache.get(c.id);
  if (hit) return hit;
  const p = kboPerson(c.kid);
  const pos = p?.seasons.find((x) => x.year === c.view)?.pos ?? p?.pos ?? 'DH';
  const sd: Side = pos === 'P' ? 'P' : 'B';
  sideCache.set(c.id, sd);
  return sd;
}

/** 같은 계보 구단들 (예: 인천 상륙스 → 인천 비룡스 · 인천 상륙스) — 계보가 없으면 그 구단만 */
export function lineageOf(code: string): readonly string[] {
  return LINEAGE.find((l) => (l as readonly string[]).includes(code)) ?? [code];
}

const gradeCache = new Map<GradeId, KCard[]>();
const ofGrade = (g: GradeId) => {
  let l = gradeCache.get(g);
  if (!l) { l = kboCardsWhere({ grade: g }); gradeCache.set(g, l); }
  return l;
};
interface Filter { clubs: readonly string[] | null; year: number | null; side: Side | null }
const whereCache = new Map<string, KCard[]>();
function where(g: GradeId, f: Filter): KCard[] {
  const key = `${g}|${f.clubs?.join(',') ?? ''}|${f.year ?? ''}|${f.side ?? ''}`;
  const hit = whereCache.get(key);
  if (hit) return hit;
  const out = ofGrade(g).filter((c) => (!f.clubs || f.clubs.includes(c.code)) && (f.year == null || c.year === f.year) && (!f.side || sideOfCard(c) === f.side));
  whereCache.set(key, out);
  return out;
}

export interface Pool { cards: readonly KCard[]; relaxed: Relax[] }

/**
 * 그 등급 · 그 고정(구단 · 연도 · 투수/타자)의 카드 풀. 비면 연도 → 같은 계보 구단 → 구단 → 투수/타자 순으로 푼다.
 * hidden: 히든 조합의 프랜차이즈 칸 — 그 구단, 없으면 같은 계보 구단 (그래도 없으면 빈 풀). 투수/타자 고정은 지키다가 없으면 푼다.
 * exclude: 뺄 카드(넣은 재료) — 빼고 나서 비면 다음 단계로 푼다. 끝까지 비면 빼지 않은 풀로.
 */
export function poolOf(g: GradeId, fix: Fix, hidden = false, exclude?: ReadonlySet<string> | null): Pool {
  const ex = exclude && exclude.size ? exclude : null;
  const keep = (cards: KCard[]) => (ex ? cards.filter((c) => !ex.has(c.id)) : cards);
  if (hidden) {
    // 그 구단 → 같은 계보 구단 (포지션 조합이 맞았으면 투수/타자를 먼저 지키고, 없으면 푼다)
    if (!fix.club) return { cards: [], relaxed: [] };
    const line = lineageOf(fix.club);
    const sd = fix.side;
    const steps: [Relax[], Filter][] = [];
    if (sd) steps.push([[], { clubs: [fix.club], year: null, side: sd }]);
    if (sd && line.length > 1) steps.push([['lineage'], { clubs: line, year: null, side: sd }]);
    steps.push([sd ? ['side'] : [], { clubs: [fix.club], year: null, side: null }]);
    if (line.length > 1) steps.push([sd ? ['lineage', 'side'] : ['lineage'], { clubs: line, year: null, side: null }]);
    for (const [relaxed, f] of steps) {
      const cards = keep(where('franchise', f));
      if (cards.length) return { cards, relaxed };
    }
    return ex ? poolOf(g, fix, true) : { cards: [], relaxed: [] };
  }
  const { club, year, side } = fix;
  const y: Relax[] = year != null ? ['year'] : [];
  const tries: [Relax[], Filter][] = [[[], { clubs: club ? [club] : null, year, side }]];
  if (year != null) tries.push([y, { clubs: club ? [club] : null, year: null, side }]);
  if (club) {
    const line = lineageOf(club);
    if (line.length > 1) tries.push([[...y, 'lineage'], { clubs: line, year: null, side }]);
    tries.push([[...y, 'club'], { clubs: null, year: null, side }]);
  }
  if (side) tries.push([[...y, ...(club ? (['club'] as Relax[]) : []), 'side'], { clubs: null, year: null, side: null }]);
  for (const [relaxed, f] of tries) {
    const cards = keep(where(g, f));
    if (cards.length) return { cards, relaxed };
  }
  if (ex) return poolOf(g, fix);
  return { cards: [], relaxed: tries[tries.length - 1][0] };
}

/* ───────── 뽑기 ───────── */
export interface CombineRoll {
  /** view.rows 의 몇 번째 줄 */
  row: number;
  step: Step;
  grade: GradeId;
  card: KCard;
  /** 이 결과에서 넓힌 풀 */
  relaxed: Relax[];
  /** 기본 등급보다 위인가 (사다리 기준 · 히든 포함) */
  up: boolean;
}

/** 난수 (0~1) — 브라우저 crypto, 없으면 Math.random */
export function cryptoRandom(): number {
  try {
    const a = new Uint32Array(1);
    globalThis.crypto.getRandomValues(a);
    return a[0] / 4294967296;
  } catch {
    return Math.random();
  }
}

/** 결과 정하기 — 줄(확률) 하나 → 그 줄 풀에서 카드 하나(같은 확률, 재료 카드는 빼고 — view.exclude + exclude). 3~5장이 아니거나 풀이 비면 null */
export function rollCombine(view: CombineView, rand: () => number = cryptoRandom, exclude?: ReadonlySet<string>): CombineRoll | null {
  if (!view.ready || !view.rows.length || unitsTotal(view) !== 1000) return null;
  let x = Math.min(999, Math.floor(rand() * 1000));
  let i = 0;
  for (; i < view.rows.length - 1; i++) {
    if (x < view.rows[i].units) break;
    x -= view.rows[i].units;
  }
  const row = view.rows[i];
  const ex = exclude?.size ? new Set([...view.exclude, ...exclude]) : view.exclude;
  const pool = poolOf(row.grade, view.fix, row.step === 'hidden', ex);
  if (!pool.cards.length) return null;
  const card = pool.cards[Math.min(pool.cards.length - 1, Math.floor(rand() * pool.cards.length))];
  return { row: i, step: row.step, grade: row.grade, card, relaxed: pool.relaxed, up: row.step === 'hidden' || ladderOf(row.grade) > view.baseIdx };
}

/**
 * 룰렛 릴 — 돌아가는 카드 count 장 (마지막 = 결과). 결과 풀(고정 · 넓힘 같음)에서 나올 수 있는 등급을 돌아가며 섞는다.
 * 연출용이라 Math.random 으로 충분 — 결과는 이미 정해져 있다.
 */
export function reelOf(view: CombineView, result: KCard, count = 24, rand: () => number = Math.random): KCard[] {
  // 줄마다 결과와 같은 풀 (재료 카드는 빼고) — 결과 카드도 빼서 결과가 먼저 지나가 보이지 않게
  const pools = view.rows.filter((r) => r.units > 0)
    .map((r) => poolOf(r.grade, view.fix, r.step === 'hidden', view.exclude).cards.filter((c) => c.id !== result.id))
    .filter((p) => p.length > 0);
  const out: KCard[] = [];
  const used = new Set<string>();
  const start = Math.floor(rand() * Math.max(1, pools.length));
  for (let i = 0; i < count - 1 && pools.length; i++) {
    const pool = pools[(start + i) % pools.length];
    let pick = pool[Math.floor(rand() * pool.length)];
    for (let t = 0; t < 6 && used.has(pick.id) && pool.length > 1; t++) pick = pool[Math.floor(rand() * pool.length)];
    used.add(pick.id);
    out.push(pick);
  }
  out.push(result);
  return out;
}

/** 릴 간격 (ms) — 처음엔 빠르게, 끝으로 갈수록 느리게. 합 ≈ total */
export function reelTimings(frames: number, total = 3000): number[] {
  const raw = Array.from({ length: frames }, (_, i) => 40 + 330 * Math.pow(i / Math.max(1, frames - 1), 2.8));
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((x) => Math.round((x * total) / sum));
}
