// 선수조합 재료 — 보관함(game/inventory)에서 조합에 쓸 수 있는 장만.
//   라인업 카드 · 강화한 카드 · 훈련한 카드는 마지막 1장을 남기고(spareOf), 특별 선수 · 잠근 카드는 넣지 않는다 (옛 카드 조합 룰렛과 같은 보호).
import { entryOf, lineupIds, ownedCard, ownedIds, spareOf } from '../../game/inventory';
import { playerOfCard } from '../../game/mock';
import { shortLabel } from '../../game/world';
import { ladderOf, matInfoOf, sideOfPos, type CombineView, type MatInfo, type Side } from '../../game/combine';
import type { CardInst, GradeId, Player } from '../../game/types';
import { rarity } from '../gacha/draw';

export interface Mat {
  id: string;
  card: CardInst;
  player: Player;
  info: MatInfo;
  side: Side;
  /** 재료로 쓸 수 있는 장수 */
  spare: number;
  /** 가진 장수 */
  owned: number;
}

/** 쓸 수 있는 재료 (카드 종류마다 한 줄) */
export function readMaterials(): Mat[] {
  const guard = lineupIds();
  const out: Mat[] = [];
  for (const id of ownedIds()) {
    const card = ownedCard(id);
    if (!card || card.locked) continue;
    const spare = spareOf(id, guard);
    if (spare <= 0) continue;
    const player = playerOfCard(card);
    const info = matInfoOf(card, player);
    out.push({ id, card, player, info, side: sideOfPos(player.pos), spare, owned: entryOf(id)?.n ?? spare });
  }
  return out;
}

/** 등급 줄 세우기 — 조합 사다리(노멀 → 레전드), 같은 칸이면 더 귀한 쪽 (레전드 < MVP·GG·TH < 프랜차이즈 < 블랙 < 시그니처) */
export const gradeOrder = (g: GradeId) => ladderOf(g) * 10 + rarity(g);

export type SortKey = 'grade' | 'club' | 'year';
export const SORTS: { value: SortKey; label: string }[] = [
  { value: 'grade', label: '등급' }, { value: 'club', label: '구단' }, { value: 'year', label: '연도' },
];

const ovrOf = (m: Mat) => m.card.ovr ?? m.player.ovr;
const byGrade = (a: Mat, b: Mat) => gradeOrder(b.info.grade) - gradeOrder(a.info.grade) || ovrOf(b) - ovrOf(a);
const clubName = (m: Mat) => (m.info.club ? shortLabel(m.info.club) : '');
const byName = (a: Mat, b: Mat) => a.player.name.localeCompare(b.player.name, 'ko') || a.id.localeCompare(b.id);

/** 목록 정렬 — 등급(높은 등급부터) · 구단(이름순, 구단 안에서 등급) · 연도(최근부터, 연도 없는 카드는 끝) */
export function sortMats(list: readonly Mat[], key: SortKey): Mat[] {
  const out = list.slice();
  if (key === 'grade') return out.sort((a, b) => byGrade(a, b) || byName(a, b));
  if (key === 'club') return out.sort((a, b) => clubName(a).localeCompare(clubName(b), 'ko') || byGrade(a, b) || byName(a, b));
  return out.sort((a, b) => (b.info.year ?? -1) - (a.info.year ?? -1) || clubName(a).localeCompare(clubName(b), 'ko') || byGrade(a, b) || byName(a, b));
}

/**
 * '한 번 더' — 지난 조합과 같은 공식(같은 등급 · 구단 · 연도 · 포지션)이 맞게 다시 채운다. 지난번 재료 등급을 먼저 맞추고,
 * 모자라면 공식에 맞는 다른 카드로. 방금 받은 카드(exclude)는 넣지 않는다. 같은 공식 카드가 모자라면 그만큼만.
 */
export function refill(prev: CombineView, grades: readonly GradeId[], mats: readonly Mat[], exclude: ReadonlySet<string>): string[] {
  const met = (id: string) => prev.formulas.some((f) => f.id === id && f.met);
  const fits = (m: Mat) => !exclude.has(m.id)
    && (!met('grade') || m.info.grade === grades[0])
    && (!met('club') || m.info.club === prev.fix.club)
    && (!met('year') || m.info.year === prev.fix.year)
    && (!met('side') || m.side === prev.fix.side);
  // 덜 아까운 카드부터: 종합 낮은 순 · 남는 장 많은 순
  const cands = mats.filter(fits).sort((a, b) => ovrOf(a) - ovrOf(b) || b.spare - a.spare || byName(a, b));
  const left = new Map(cands.map((m) => [m.id, m.spare]));
  const out: string[] = [];
  const take = (pred: (m: Mat) => boolean) => {
    const m = cands.find((c) => (left.get(c.id) ?? 0) > 0 && pred(c));
    if (!m) return false;
    left.set(m.id, left.get(m.id)! - 1);
    out.push(m.id);
    return true;
  };
  for (const g of grades) take((m) => m.info.grade === g);
  // 등급이 같은 카드가 모자라면 기본 등급이 크게 바뀌지 않게 가까운 등급부터
  const want = grades.length;
  const near = (m: Mat) => Math.abs(ladderOf(m.info.grade) - prev.baseIdx);
  cands.sort((a, b) => near(a) - near(b) || ovrOf(a) - ovrOf(b));
  while (out.length < want && take(() => true)) { /* 채우기 */ }
  return out;
}
