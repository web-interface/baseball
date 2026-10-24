// 도감 — 실제 선수 카드 목록(game/kbo, 13,159장 · 선수 2,273명) 중 무엇을 모았나. 사용자 지시 10-24
//  전체 · 등급별 · 구단별 · 연도별 · 구단+연도별로 '모은 카드 종류 / 전체'와 '모은 선수 / 전체 선수'.
//  보유 카드가 바뀔 때만 다시 센다(invVersion). 카드 종류 기준 — 같은 카드를 여러 장 가져도 1.
import type { ClubCode, GradeId } from './types';
import { kboCards, type KCard } from './kbo';
import { invVersion, ownedCount } from './inventory';

export interface Tally {
  have: number;
  total: number;
  /** 모은 선수 (그 묶음 카드를 한 장이라도 가진 사람) / 전체 선수 */
  peopleHave: number;
  people: number;
}
export interface ClubTally extends Tally {
  /** 카드가 있는 해 (오름차순) */
  years: number[];
  /** 연도 없는 카드(프랜차이즈 · 블랙 · 시그니처) */
  noYear: Tally | null;
}
export interface DexIndex {
  all: Tally;
  grade: Map<GradeId, Tally>;
  club: Map<ClubCode, ClubTally>;
  year: Map<number, Tally & { clubs: ClubCode[] }>;
  /** `${구단}:${연도}` · 연도 없는 카드는 `${구단}:-` */
  clubYear: Map<string, Tally>;
}

class Acc {
  have = 0;
  total = 0;
  private ppl = new Set<string>();
  private pplHave = new Set<string>();
  add(c: KCard, own: boolean) {
    this.total++;
    this.ppl.add(c.kid);
    if (own) { this.have++; this.pplHave.add(c.kid); }
  }
  out(): Tally { return { have: this.have, total: this.total, people: this.ppl.size, peopleHave: this.pplHave.size }; }
}

export const cyKey = (code: string, year: number | null | undefined) => `${code}:${year ?? '-'}`;
export const isOwnedCard = (id: string) => ownedCount(id) > 0;

let memo: { v: number; idx: DexIndex } | null = null;
export function dexIndex(): DexIndex {
  const v = invVersion();
  if (memo && memo.v === v) return memo.idx;
  const all = new Acc();
  const grade = new Map<GradeId, Acc>();
  const club = new Map<ClubCode, { acc: Acc; years: Set<number>; noYear: Acc | null }>();
  const year = new Map<number, { acc: Acc; clubs: Set<ClubCode> }>();
  const cy = new Map<string, Acc>();
  const get = <K, T>(m: Map<K, T>, k: K, mk: () => T) => { let x = m.get(k); if (!x) { x = mk(); m.set(k, x); } return x; };
  for (const c of kboCards()) {
    const own = ownedCount(c.id) > 0;
    all.add(c, own);
    get(grade, c.grade, () => new Acc()).add(c, own);
    const cl = get(club, c.code, () => ({ acc: new Acc(), years: new Set<number>(), noYear: null as Acc | null }));
    cl.acc.add(c, own);
    if (c.year != null) {
      cl.years.add(c.year);
      const y = get(year, c.year, () => ({ acc: new Acc(), clubs: new Set<ClubCode>() }));
      y.acc.add(c, own);
      y.clubs.add(c.code);
    } else {
      (cl.noYear ??= new Acc()).add(c, own);
    }
    get(cy, cyKey(c.code, c.year), () => new Acc()).add(c, own);
  }
  const idx: DexIndex = {
    all: all.out(),
    grade: new Map([...grade].map(([k, a]) => [k, a.out()])),
    club: new Map([...club].map(([k, x]) => [k, { ...x.acc.out(), years: [...x.years].sort((a, b) => a - b), noYear: x.noYear?.out() ?? null }])),
    year: new Map([...year].sort((a, b) => a[0] - b[0]).map(([k, x]) => [k, { ...x.acc.out(), clubs: [...x.clubs] }])),
    clubYear: new Map([...cy].map(([k, a]) => [k, a.out()])),
  };
  memo = { v, idx };
  return idx;
}

/** 그 구단 · 그 해 카드 (연도 없는 카드는 year = null) — 카드 목록 순서 그대로 */
const cyCards = new Map<string, KCard[]>();
export function dexCards(code: string, year: number | null): KCard[] {
  if (!cyCards.size) for (const c of kboCards()) { const k = cyKey(c.code, c.year); const l = cyCards.get(k); if (l) l.push(c); else cyCards.set(k, [c]); }
  return cyCards.get(cyKey(code, year)) ?? [];
}

export const pctOf = (t: Pick<Tally, 'have' | 'total'>) => (t.total ? (t.have / t.total) * 100 : 0);
/** 화면용 % — 0 보다 크면 최소 0.1, 다 모으기 전엔 100 이 되지 않게 */
export function pctText(t: Pick<Tally, 'have' | 'total'>): string {
  if (!t.total || !t.have) return '0';
  if (t.have >= t.total) return '100';
  const p = pctOf(t);
  return p < 10 ? Math.max(0.1, Math.floor(p * 10) / 10).toFixed(1) : String(Math.min(99, Math.floor(p)));
}
