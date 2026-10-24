// 자동 정리 — 뽑기로 쌓인 카드를, 남길 등급 · 구단을 빼고 5장씩 묶어 빠르게 조합한다(룰렛 연출 없이, 결과는 같은 공식 — rollComboWith).
//  · 고른 '정리할 등급'의 남는 카드만 재료로. 라인업 · 강화 · 훈련 카드의 마지막 1장 · 특별 선수 · 잠근 카드는 쓰지 않는다(readMaterials).
//    '종류마다 1장 남기기'를 켜면 카드 종류마다 1장은 남긴다(도감 · 세트용).
//  · 묶음은 조합 공식이 잘 맞게 — 같은 등급 안에서 구단 → 연도 → 투수/타자 순으로 줄 세워 5장씩(같은 구단 · 같은 연도면 왕조 조합).
//    등급마다 5장이 안 남으면 4 · 3장으로 한 번 더, 3장 미만은 남는다.
//  · 결과가 다시 정리할 등급이면 재료로(끝까지) — 그 등급이 3장 미만이 될 때까지. GP 가 모자라거나 한 번에 3,000번이면 멈춘다.
//  · 보관함 저장은 끝에 한 번(batchInventory) — 수천 번 조합해도 빠르게.
import { GRADES } from '../../game/grades';
import { analyze, feeOf, ladderOf, matInfoOf, MAX_MATS, MIN_MATS, type CombineRoll, type CombineView, type MatInfo } from '../../game/combine';
import { batchInventory, entryOf, lineupIds, spareOf, totalCards } from '../../game/inventory';
import { readWallet, spend } from '../../game/wallet';
import { rarity, rollComboWith, type PulledCard } from '../gacha/draw';
import { readMaterials } from './materials';
import type { GradeId } from '../../game/types';

/** 한 번에 하는 조합 상한 (켜 둔 화면이 오래 멈추지 않게) */
export const CLEAN_CAP = 3000;

export interface CleanOpts {
  /** 정리할 등급 */
  grades: GradeId[];
  /** 남길 구단 (구단 코드) — 이 구단 카드는 재료로 쓰지 않는다 */
  keepClubs: string[];
  /** 카드 종류마다 1장 남기기 */
  keepOne: boolean;
  /** 결과가 정리할 등급이면 다시 재료로 (끝까지) */
  cascade: boolean;
}

interface Unit { id: string; info: MatInfo }

/** 재료 한 장씩 (같은 카드 여러 장이면 여러 개) — 고른 등급 · 남길 구단 · 1장 남기기 반영 */
function unitsOf(o: CleanOpts): Unit[] {
  const gs = new Set(o.grades);
  const keep = new Set(o.keepClubs);
  const out: Unit[] = [];
  for (const m of readMaterials()) {
    if (!gs.has(m.info.grade) || (m.info.club && keep.has(m.info.club))) continue;
    const n = o.keepOne ? Math.min(m.spare, m.owned - 1) : m.spare;
    for (let i = 0; i < n; i++) out.push({ id: m.id, info: m.info });
  }
  return out;
}

/** 줄 세우기 — 등급(사다리 아래부터) → 구단 → 연도 → 투수/타자 → 카드 */
const order = (a: Unit, b: Unit) =>
  ladderOf(a.info.grade) - ladderOf(b.info.grade) || rarity(a.info.grade) - rarity(b.info.grade)
  || (a.info.club ?? '').localeCompare(b.info.club ?? '') || (a.info.year ?? 0) - (b.info.year ?? 0)
  || Number(a.info.pos === 'P') - Number(b.info.pos === 'P') || a.id.localeCompare(b.id);

/** 묶음 나누기 — 같은 등급끼리 5장씩, 끝에 3~4장이 남으면 그것도 한 묶음 */
function groupsOf(units: Unit[]): { groups: Unit[][]; rest: Unit[] } {
  const byGrade = new Map<GradeId, Unit[]>();
  for (const u of [...units].sort(order)) { const l = byGrade.get(u.info.grade); if (l) l.push(u); else byGrade.set(u.info.grade, [u]); }
  const groups: Unit[][] = [];
  const rest: Unit[] = [];
  for (const list of byGrade.values()) {
    let i = 0;
    for (; i + MAX_MATS <= list.length; i += MAX_MATS) groups.push(list.slice(i, i + MAX_MATS));
    const tail = list.slice(i);
    if (tail.length >= MIN_MATS) groups.push(tail); else rest.push(...tail);
  }
  return { groups, rest };
}

export interface CleanPreview { cards: number; combos: number; gp: number; total: number; byGrade: { grade: GradeId; n: number }[] }
/** 미리 보기 — 첫 바퀴만 센다(끝까지 하면 결과 카드로 몇 번 더) */
export function previewClean(o: CleanOpts): CleanPreview {
  const units = unitsOf(o);
  const { groups } = groupsOf(units);
  const m = new Map<GradeId, number>();
  for (const u of units) m.set(u.info.grade, (m.get(u.info.grade) ?? 0) + 1);
  return {
    cards: units.length, combos: groups.length, gp: groups.reduce((a, g) => a + feeOf(g.length), 0), total: totalCards(),
    byGrade: [...m].map(([grade, n]) => ({ grade, n })).sort((a, b) => ladderOf(a.grade) - ladderOf(b.grade)),
  };
}

export interface CleanResult {
  combos: number;
  /** 재료로 쓴 장수 */
  used: number;
  /** 결과 등급별 장수 (마지막에 남은 것 기준이 아니라 나온 것) */
  made: { grade: GradeId; n: number }[];
  /** 빛나는 결과 (엘리트 이상) — 귀한 순 */
  best: PulledCard[];
  gp: number;
  before: number;
  after: number;
  stopped: 'done' | 'gp' | 'cap';
  /** TH 이상이 나온 조합 — 정리가 끝나면 룰렛(Spin)으로 한 장씩 화려하게 (귀한 순 · 최대 12) */
  spins: { result: PulledCard; roll: CombineRoll; view: CombineView }[];
}

/** 룰렛으로 보여 줄 결과 — TH 이상(사용자 지시) + 레전드. 조합 사다리는 레전드까지 · 히든은 프랜차이즈라
 *  조합에선 TH · GG · MVP 가 나오지 않는다 — 그래서 실제로는 레전드 · 프랜차이즈가 룰렛으로 나온다 */
export const spinWorthy = (g: GradeId) => g === 'legend' || rarity(g) >= rarity('th');

/** 정리하기 — 바로 끝까지 (저장 · 화면 알림은 끝에 한 번) */
export function runClean(o: CleanOpts): CleanResult {
  const before = totalCards();
  const targets = new Set(o.grades);
  const keep = new Set(o.keepClubs);
  let combos = 0, used = 0, gp = 0;
  let stopped: CleanResult['stopped'] = 'done';
  const made = new Map<GradeId, number>();
  const best: PulledCard[] = [];
  const spins: CleanResult['spins'] = [];
  batchInventory(() => {
    let pool = unitsOf(o);
    const guard = lineupIds();
    /** 재료로 쓸 수 있는 장수 — 1장 남기기면 종류마다 1장 덜 */
    const avail = (id: string) => (o.keepOne ? Math.min(spareOf(id, guard), (entryOf(id)?.n ?? 0) - 1) : spareOf(id, guard));
    let before0 = -1;
    for (let pass = 0; pass < 60; pass++) {
      const { groups, rest } = groupsOf(pool);
      if (!groups.length) break;
      const next: Unit[] = [...rest];
      const inNext = new Map<string, number>();
      for (const u of rest) inNext.set(u.id, (inNext.get(u.id) ?? 0) + 1);
      for (const g of groups) {
        if (combos >= CLEAN_CAP) { stopped = 'cap'; break; }
        const fee = feeOf(g.length);
        if (readWallet().gp < fee) { stopped = 'gp'; break; }
        const use: Record<string, number> = {};
        for (const u of g) use[u.id] = (use[u.id] ?? 0) + 1;
        // 자동 강화(같은 카드가 모이면 재료로 쓰임)로 남는 장이 줄었으면 — 쓸 수 있는 장만 다음 바퀴로 돌려보내 다시 묶는다
        if (Object.entries(use).some(([id, k]) => avail(id) < k)) {
          for (const u of g) {
            const have = inNext.get(u.id) ?? 0;
            if (avail(u.id) > have) { next.push(u); inNext.set(u.id, have + 1); }
          }
          continue;
        }
        const view = analyze(g.map((u) => u.info));
        const r = rollComboWith({ view, use, pay: () => spend({ gp: view.fee }) });
        if (!r.ok) { if (r.why === 'gp') { stopped = 'gp'; break; } continue; }
        combos += 1;
        used += g.length;
        gp += view.fee;
        const c = r.result.card;
        made.set(c.grade, (made.get(c.grade) ?? 0) + 1);
        if (rarity(c.grade) >= rarity('legend')) best.push(r.result);
        if (spinWorthy(c.grade)) spins.push({ result: r.result, roll: r.roll, view });
        // 끝까지 — 결과가 정리할 등급이고 남길 구단이 아니면 다음 바퀴 재료로
        if (o.cascade && targets.has(c.grade)) {
          const info = matInfoOf(c, r.result.player);
          const already = inNext.get(c.id) ?? 0;
          if (!(info.club && keep.has(info.club)) && avail(c.id) > already) {
            next.push({ id: c.id, info });
            inNext.set(c.id, already + 1);
          }
        }
      }
      if (stopped !== 'done' || combos === before0) break; // 이번 바퀴에 하나도 못 했으면 끝
      before0 = combos;
      pool = next;
    }
  });
  return {
    combos, used, gp, before, after: totalCards(), stopped,
    made: [...made].map(([grade, n]) => ({ grade, n })).sort((a, b) => rarity(b.grade) - rarity(a.grade)),
    best: best.sort((a, b) => rarity(b.card.grade) - rarity(a.card.grade) || b.player.ovr - a.player.ovr).slice(0, 24),
    spins: spins.sort((a, b) => rarity(b.result.card.grade) - rarity(a.result.card.grade) || b.result.player.ovr - a.result.player.ovr).slice(0, 12),
  };
}

/** 등급 이름 (짧게) */
export const gradeKo = (g: GradeId) => GRADES[g].ko;
