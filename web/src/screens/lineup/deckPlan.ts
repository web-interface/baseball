// 세트덱으로 자동 편성 — '어떤 덱으로 짤까?'를 고르면 그 덱(구단+연도 · 구단 · 연도) 카드부터 1군 엔트리에 넣는다. 사용자 지시 10-24
//  · 고를 수 있는 덱(deckOptions): 보유 카드로 첫 단계(구단+연도 · 구단 5명, 연도 9명) 이상 채울 수 있는 것
//  · 짜는 법(autoLineupFor): 사람마다 카드 하나 — 그 덱 카드면 +DECK_BONUS 를 얹어 먼저 고른다.
//    타자 9자리 · 투수 16자리(선발 5 · 불펜 10 · 마무리)를 적성 감점까지 따져 한꺼번에 배정(헝가리안) → 선발은 센 순 · 추천 타순.
//    레전드급(타자 2 · 투수 2) · MVP(4) · 같은 사람 한 번은 그대로 지킨다.
//  · 연도 없는 카드(레전드급 · 특별 선수)는 같은 구단 연도 세트 · 연도 세트에 함께 든다 (game/sets 와 같은 규칙)
import type { ClubCode } from '../../game/types';
import { TIERS, type SetKind, type Tier } from '../../game/sets';
import { teamByCode } from '../../game/mock';
import { shortLabel } from '../../game/world';
import { clubTitles } from '../../game/clubSeasons';
import { isLegendGrade, isMvpGrade } from '../../game/potential';
import { owned } from './local-mock';
import {
  BAT_SLOTS, LEGEND_MAX, MVP_MAX, ROT_SLOTS, STAFF_SLOTS, FIT_PENALTY, STAFF_FIT_PENALTY,
  autoOrder, benchFor, cardPower, evaluate, fitOf, getSlot, liteUnit, unit,
  type BatSlot, type LineupState, type LiteU, type StaffSlot,
} from './calc';

export interface DeckTarget { kind: SetKind; code?: ClubCode; year?: number }
export interface DeckOption extends DeckTarget {
  id: string;
  /** ’27 독수리스 · 독수리스 · ’25 시즌 */
  name: string;
  /** 엔트리에 넣을 수 있는 그 덱 사람 (타자 최대 9 · 투수 최대 16, 레전드급 · MVP 한도 뺀 것) */
  bat: number;
  pit: number;
  can: number;
  /** 채울 수 있는 단계 · 그다음 단계 */
  tier: Tier;
  tierIdx: number;
  next: Tier | null;
  /** 지금 엔트리에 든 그 덱 인원 */
  now: number;
  /** 구단+연도 — 그 해 우승 */
  title: boolean;
  c1: string;
  c2: string;
}

const personOf = (pid: string) => pid.replace(/~\d{4}$/, '');
const yy = (y: number) => `’${String(y).slice(-2)}`;
export const deckName = (t: DeckTarget) => (t.kind === 'teamYear' ? `${yy(t.year!)} ${shortLabel(t.code!)}` : t.kind === 'team' ? shortLabel(t.code!) : `${yy(t.year!)} 시즌`);
export const deckId = (t: DeckTarget) => (t.kind === 'teamYear' ? `ty:${t.code}:${t.year}` : t.kind === 'team' ? `team:${t.code}` : `year:${t.year}`);

/* ───────── 고를 수 있는 덱 ───────── */
interface PF { isP: boolean; norm: boolean; leg: boolean; mvp: boolean }
const flagsOf = (l: LiteU): PF => {
  const leg = isLegendGrade(l.grade);
  const mvp = isMvpGrade(l.grade);
  return { isP: l.pos === 'P', norm: !leg && !mvp, leg, mvp };
};
function merge(m: Map<string, PF>, who: string, f: PF) {
  const o = m.get(who);
  if (!o) { m.set(who, { ...f }); return; }
  o.norm ||= f.norm; o.leg ||= f.leg; o.mvp ||= f.mvp;
}
/** 엔트리에 넣을 수 있는 인원 — 보통 등급 먼저, 레전드급은 타자 · 투수 2명씩, MVP 는 합쳐 4명 */
function capCount(m: Map<string, PF>) {
  let bN = 0, bL = 0, bM = 0, pN = 0, pL = 0, pM = 0;
  for (const f of m.values()) {
    if (f.isP) { if (f.norm) pN++; else if (f.leg) pL++; else if (f.mvp) pM++; }
    else if (f.norm) bN++; else if (f.leg) bL++; else if (f.mvp) bM++;
  }
  let bat = Math.min(9, bN + Math.min(bL, LEGEND_MAX.bat));
  let pit = Math.min(16, pN + Math.min(pL, LEGEND_MAX.pit));
  let mvpLeft = MVP_MAX;
  const mb = Math.min(bM, mvpLeft, 9 - bat); mvpLeft -= mb; bat += mb;
  const mp = Math.min(pM, mvpLeft, 16 - pit); pit += mp;
  return { bat, pit };
}

export function deckOptions(st: LineupState): DeckOption[] {
  const decks = new Map<string, { t: DeckTarget; m: Map<string, PF> }>();
  const wildClub = new Map<string, Map<string, PF>>();
  const wildAll = new Map<string, PF>();
  const deck = (t: DeckTarget) => {
    const id = deckId(t);
    let d = decks.get(id);
    if (!d) { d = { t, m: new Map() }; decks.set(id, d); }
    return d.m;
  };
  for (const id of owned()) {
    const l = liteUnit(id);
    const who = personOf(l.pid);
    const f = flagsOf(l);
    const code = l.code as ClubCode;
    merge(deck({ kind: 'team', code }), who, f);
    if (l.yearKey !== 'none') {
      const year = Number(l.yearKey);
      merge(deck({ kind: 'teamYear', code, year }), who, f);
      merge(deck({ kind: 'year', year }), who, f);
    } else {
      let w = wildClub.get(code);
      if (!w) { w = new Map(); wildClub.set(code, w); }
      merge(w, who, f);
      merge(wildAll, who, f);
    }
  }
  // 연도 없는 카드 — 연도 카드가 만든 세트에만 함께 (혼자서는 연도 세트를 만들지 않는다)
  for (const d of decks.values()) {
    const wild = d.t.kind === 'teamYear' ? wildClub.get(d.t.code!) : d.t.kind === 'year' ? wildAll : undefined;
    if (wild) for (const [who, f] of wild) merge(d.m, who, f);
  }
  const ev = evaluate(st);
  const nowOf = new Map(ev.sets.map((x) => [x.id, x.have]));
  const out: DeckOption[] = [];
  for (const [id, d] of decks) {
    const { bat, pit } = capCount(d.m);
    const can = bat + pit;
    const tiers = TIERS[d.t.kind];
    let tierIdx = -1;
    tiers.forEach((x, i) => { if (can >= x.at) tierIdx = i; });
    if (tierIdx < 0) continue;
    const team = d.t.code ? teamByCode(d.t.code) : undefined;
    out.push({
      ...d.t, id, name: deckName(d.t), bat, pit, can,
      tier: tiers[tierIdx], tierIdx, next: tiers[tierIdx + 1] ?? null,
      now: nowOf.get(id) ?? 0,
      title: d.t.kind === 'teamYear' && clubTitles(d.t.code!).includes(d.t.year!),
      c1: team?.colors.primary ?? '#6b5cff',
      c2: team?.colors.secondary ?? '#1f6fb2',
    });
  }
  return out.sort(byStrength);
}
/** 센 덱 먼저 — 단계 가치 → 채울 수 있는 인원 → 구단+연도 > 구단 > 연도 */
const KIND_RANK: Record<SetKind, number> = { teamYear: 3, team: 2, year: 1 };
export const byStrength = (a: DeckOption, b: DeckOption) => b.tier.v - a.tier.v || b.can - a.can || KIND_RANK[b.kind] - KIND_RANK[a.kind] || (b.year ?? 0) - (a.year ?? 0);

/* ───────── 그 덱으로 짜기 ───────── */
// 덱 카드에 얹는 값을 바꿔 가며 배정해, '고른 덱이 오를 수 있는 가장 높은 단계 인원'을 채우는 가장 작은 값을 찾는다.
//  → 그 단계는 꼭 채우고, 단계를 더 올리지 못하는 남는 자리는 더 센 선수로 (덱 카드가 약해도 무조건 넣지 않게)
const BIG = 1000;

/** 헝가리안 — n 행(자리) ≤ m 열(후보). 비용 합이 가장 작게 행마다 서로 다른 열 하나 → 행마다 고른 열 */
function hungarian(a: number[][]): number[] {
  const n = a.length;
  const m = a[0]?.length ?? 0;
  const INF = 1e15;
  const u = new Float64Array(n + 1), v = new Float64Array(m + 1);
  const p = new Int32Array(m + 1), way = new Int32Array(m + 1);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Float64Array(m + 1).fill(INF);
    const used = new Uint8Array(m + 1);
    do {
      used[j0] = 1;
      const i0 = p[j0];
      let delta = INF, j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = a[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const ans = new Array<number>(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j]) ans[p[j] - 1] = j - 1;
  return ans;
}

interface Cand { id: string; who: string; l: LiteU; base: number; m: boolean; leg: boolean; mvp: boolean }

export function autoLineupFor(st: LineupState, t: DeckTarget): LineupState {
  const y = t.year != null ? String(t.year) : '';
  const match = (l: LiteU) => (t.kind === 'team' ? l.code === t.code
    : t.kind === 'teamYear' ? l.code === t.code && (l.yearKey === y || l.yearKey === 'none')
      : l.yearKey === y || l.yearKey === 'none');
  const val = (c: Cand, bonus: number) => c.base + (c.m ? bonus : 0);
  // 사람마다 · 쪽마다 — 보통 등급 · 레전드급 · MVP 각각 가장 좋은 카드 (덱 카드 먼저, 그다음 세기)
  type Best = { norm?: Cand; leg?: Cand; mvp?: Cand };
  const sides = { bat: new Map<string, Best>(), pit: new Map<string, Best>() };
  for (const id of owned()) {
    const l = liteUnit(id);
    const who = personOf(l.pid);
    const leg = isLegendGrade(l.grade);
    const mvp = isMvpGrade(l.grade);
    const c: Cand = { id, who, l, base: l.power, m: match(l), leg, mvp };
    const m = l.pos === 'P' ? sides.pit : sides.bat;
    const b = m.get(who) ?? {};
    const k = leg ? 'leg' : mvp ? 'mvp' : 'norm';
    if (!b[k] || val(c, BIG) > val(b[k]!, BIG)) b[k] = c;
    m.set(who, b);
  }
  // 위쪽만 정밀 세기 (강화 · 훈련 · 잠재력 · 부상) — 수천 장이어도 가볍게
  const refine = (c: Cand | undefined) => { if (c) c.base = cardPower(unit(c.id)); };
  const V = (c?: Cand) => (c ? val(c, BIG) : -1e9);
  const raw = (b: Best) => Math.max(b.norm?.base ?? -1e9, b.leg?.base ?? -1e9, b.mvp?.base ?? -1e9);
  type Row = { who: string; b: Best; top: number; side: 'bat' | 'pit' };
  // 후보 추리기 — ① 보통 등급 덱 카드가 있는 사람 위쪽 keep ② 레전드급 · MVP 덱 카드만 덱에 드는 사람 16명(몫이 레전드급 2 · MVP 4라 넉넉히)
  //  ③ 덱 밖에서 센 사람 위쪽 keep ④ 레전드급 · MVP 카드만 있는 그 밖 사람 16명
  //  (연도 세트는 연도 없는 레전드급이 전부 '아무 연도'라 수백 명 — 몫이 없어 못 쓰는 그들이 쓸 수 있는 사람을 밀어내지 않게)
  const rowsOf = (m: Map<string, Best>, keep: number, side: Row['side']): Row[] => {
    const rows: Row[] = [...m.entries()].map(([who, b]) => ({ who, b, top: Math.max(V(b.norm), V(b.leg), V(b.mvp)), side }));
    const byTop = (x: Row, y: Row) => y.top - x.top;
    const taken = new Set<Row>();
    const take = (xs: Row[]) => { xs.forEach((x) => taken.add(x)); return xs; };
    const deckNorm = take(rows.filter((r) => r.b.norm?.m).sort((x, y) => V(y.b.norm) - V(x.b.norm)).slice(0, keep));
    const capDeck = take(rows.filter((r) => !taken.has(r) && (r.b.leg?.m || r.b.mvp?.m)).sort(byTop).slice(0, 16));
    const strong = take(rows.filter((r) => !taken.has(r) && r.b.norm).sort((x, y) => raw(y.b) - raw(x.b)).slice(0, keep));
    const capOnly = take(rows.filter((r) => !taken.has(r) && !r.b.norm).sort(byTop).slice(0, 16));
    const out = [...deckNorm, ...capDeck, ...strong, ...capOnly];
    out.forEach((r) => { refine(r.b.norm); refine(r.b.leg); refine(r.b.mvp); r.top = Math.max(V(r.b.norm), V(r.b.leg), V(r.b.mvp)); });
    return out;
  };
  const batRows = rowsOf(sides.bat, 45, 'bat');
  const pitRows = rowsOf(sides.pit, 70, 'pit');
  // 레전드급(쪽마다 2) · MVP(합쳐 4) 몫 나누기
  //  ① 그 덱에 드는 카드가 레전드급 · MVP 뿐인 사람 먼저 — 몫이 없으면 덱 인원이 줄어든다
  //  ② 남은 몫은 보통 카드보다 더 세지는 만큼 큰 사람부터
  const grant = new Map<string, 'leg' | 'mvp'>();
  const legLeft = { bat: LEGEND_MAX.bat, pit: LEGEND_MAX.pit };
  let mvpLeft = MVP_MAX;
  const key = (r: Row) => `${r.side}:${r.who}`;
  const isM = (c?: Cand) => !!c && c.m;
  const all = [...batRows, ...pitRows];
  const needy = all.filter((r) => !isM(r.b.norm) && (isM(r.b.leg) || isM(r.b.mvp))).sort((a, b) => b.top - a.top);
  for (const r of needy) {
    const legOk = isM(r.b.leg) && legLeft[r.side] > 0;
    const mvpOk = isM(r.b.mvp) && mvpLeft > 0;
    if (legOk && (!mvpOk || V(r.b.leg) >= V(r.b.mvp))) { grant.set(key(r), 'leg'); legLeft[r.side]--; }
    else if (mvpOk) { grant.set(key(r), 'mvp'); mvpLeft--; }
  }
  const gain = (r: Row, k: 'leg' | 'mvp') => V(r.b[k]) - V(r.b.norm);
  for (const r of all.filter((x) => !grant.has(key(x)) && x.b.leg).sort((a, b) => gain(b, 'leg') - gain(a, 'leg'))) {
    if (legLeft[r.side] > 0 && gain(r, 'leg') > 0) { grant.set(key(r), 'leg'); legLeft[r.side]--; }
  }
  for (const r of all.filter((x) => !grant.has(key(x)) && x.b.mvp).sort((a, b) => gain(b, 'mvp') - gain(a, 'mvp'))) {
    if (mvpLeft > 0 && gain(r, 'mvp') > 0) { grant.set(key(r), 'mvp'); mvpLeft--; }
  }
  const candsOf = (rows: Row[]) => rows.map((r) => { const g = grant.get(key(r)); return g ? r.b[g] : r.b.norm; }).filter((c): c is Cand => !!c);
  const batCands = candsOf(batRows);
  const pitCands = candsOf(pitRows);
  const assign = <S extends string>(slots: readonly S[], cands: Cand[], bonus: number, pen: (c: Cand, s: S) => number): Map<S, Cand> => {
    const cols = Math.max(slots.length, cands.length);
    // 후보가 모자라면 빈 칸(비용 0) — 실제 선수(세기 > 0)가 언제나 먼저
    const cost = slots.map((s) => Array.from({ length: cols }, (_, j) => (j < cands.length ? -(val(cands[j], bonus) - pen(cands[j], s)) : 0)));
    const pick = hungarian(cost);
    const res = new Map<S, Cand>();
    slots.forEach((s, i) => { const j = pick[i]; if (j >= 0 && j < cands.length) res.set(s, cands[j]); });
    return res;
  };
  // 타자 9자리 → 투수 16자리(선발 5 · 불펜 10 · 마무리, 감점은 투수진 자동 편성처럼 1.5배 · 타자로 나선 사람은 빼고)
  const build = (bonus: number) => {
    const bats = assign(BAT_SLOTS, batCands, bonus, (c, s) => FIT_PENALTY[fitOf(c.l, s)]);
    const usedP = new Set([...bats.values()].map((c) => c.who));
    const pits = assign(STAFF_SLOTS, pitCands.filter((c) => !usedP.has(c.who)), bonus, (c, s) => STAFF_FIT_PENALTY[fitOf(c.l, s)] * 1.5);
    const count = [...bats.values(), ...pits.values()].filter((c) => c.m).length;
    return { bats, pits, count };
  };
  // 오를 수 있는 가장 높은 단계 인원 → 그걸 채우는 가장 작은 덱 값
  let best = build(BIG);
  const goal = [...TIERS[t.kind]].reverse().find((x) => x.at <= best.count)?.at ?? best.count;
  let lo = 0;
  let hi = BIG;
  for (let i = 0; i < 12 && hi - lo > 0.5; i++) {
    const mid = (lo + hi) / 2;
    const r = build(mid);
    if (r.count >= goal) { best = r; hi = mid; } else lo = mid;
  }
  // 덱 선수는 그 단계 능력치(+v)를 받으니 덱 값은 적어도 v — 비슷한 세기면 덱 선수가 낫다
  const tierV = TIERS[t.kind].find((x) => x.at === goal)?.v ?? 0;
  if (hi < tierV) best = build(tierV);
  // 덱을 꽉 채운 배치와 견줘 팀 종합(+ 투수 묶음)이 더 높은 쪽 — 같은 시즌 케미 · 세트 값까지 실제 계산으로
  const full = toLineup(st, build(BIG));
  const lean = toLineup(st, best);
  const sc = (x: LineupState) => { const e = evaluate(x); return e.raw * 10 + (e.parts.find((p) => p.k === 'pit')?.v ?? 0); };
  return sc(lean) > sc(full) ? lean : full;
}

/** 배정 → 라인업 (선발은 센 순 · 빠진 엔트리 카드는 벤치 앞 · 추천 타순) */
function toLineup(st: LineupState, r: { bats: Map<BatSlot, Cand>; pits: Map<StaffSlot, Cand> }): LineupState {
  const { bats, pits } = r;
  const field = Object.fromEntries(BAT_SLOTS.map((s) => [s, bats.get(s)?.id ?? null])) as Record<BatSlot, string | null>;
  // 선발은 센 순 (1선발 = 가장 센 투수)
  const rot = ROT_SLOTS.map((s) => pits.get(s)).filter((c): c is Cand => !!c).sort((a, b) => b.base - a.base);
  const rotation = ROT_SLOTS.map((_, i) => rot[i]?.id ?? null);
  const bullpen = STAFF_SLOTS.filter((s) => s[0] === 'B').map((s) => pits.get(s)?.id ?? null);
  const closer = pits.get('CL')?.id ?? null;
  // 빠진 엔트리 카드는 벤치 앞으로 (같은 사람은 benchFor 가 뺀다)
  const nextIds = new Set([...Object.values(field), ...rotation, ...bullpen, closer].filter((x): x is string => !!x));
  const out0 = [...BAT_SLOTS.map((s) => st.field[s]), ...STAFF_SLOTS.map((s) => getSlot(st, s))].filter((x): x is string => !!x && !nextIds.has(x));
  let next: LineupState = { field, order: [...st.order], rotation, bullpen, closer, bench: [] };
  next = { ...next, bench: benchFor({ ...next, bench: [...out0, ...st.bench].filter((x) => !nextIds.has(x)) }).slice(0, 9) };
  return autoOrder(next);
}
