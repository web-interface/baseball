// 능력치에 더해지는 값 — 경기 엔진(season/sim bonusArr)과 같은 규칙을 가볍게(엔진을 싣지 않고) 다시 계산해 화면에 보인다.
//  · 강화: 모든 능력치 +round(강화 × 0.5) (성향 칸 빼고)
//  · 세트덱 · 훈련 · 잠재력: 엔진 칸 { k, v } (con · pow · eye … / vel · stf · ctl …) → 능력치 칸 (몫은 sim.ts B_MAP · P_MAP 과 같게)
// 바꿀 땐 season/sim.ts 의 B_MAP · P_MAP 도 같이 볼 것.
import type { AttrKey } from './types';

type Target = AttrKey | 'stuff' | 'command';
const B_MAP: Record<string, [Target, number][]> = {
  con: [['contactR', 1], ['contactL', 1]], pow: [['power', 1]], gap: [['gap', 1]], eye: [['eye', 1], ['avoidK', 0.5]],
  spd: [['speed', 1], ['baserunning', 0.5]], stl: [['stealJump', 1], ['sliding', 0.5]],
  def: [['range', 1], ['firstStep', 0.7], ['hands', 0.7], ['block', 0.7], ['framing', 0.5]], arm: [['armStr', 1], ['armAcc', 0.7], ['popTime', 0.7]],
};
const P_MAP: Record<string, [Target, number][]> = {
  vel: [['velocity', 1]], stf: [['stuff', 1]], brk: [['stuff', 0.6]], ctl: [['control', 1], ['command', 0.8]], sta: [['stamina', 1]], rec: [['recovery', 1]], mnt: [['composure', 1], ['concentration', 0.6]],
};

export type BonusSrc = 'enh' | 'set' | 'train' | 'pot';
export const SRC_KO: Record<BonusSrc, string> = { enh: '강화', set: '세트덱', train: '훈련', pot: '잠재력' };
export interface AttrBonus {
  /** 능력치 칸별 합 */
  total: Partial<Record<Target, number>>;
  /** 출처별 합 (대표값 — 그 출처가 가장 크게 올린 칸의 값) */
  bySrc: Partial<Record<BonusSrc, number>>;
}

/** 출처별 엔진 칸 목록 → 능력치 칸별 더해진 값 */
export function attrBonusOf(src: Partial<Record<Exclude<BonusSrc, 'enh'>, { k: string; v: number }[]>>, enh: number, isP: boolean, keys: AttrKey[]): AttrBonus {
  const total: Partial<Record<Target, number>> = {};
  const bySrc: Partial<Record<BonusSrc, number>> = {};
  const add = (t: Target, v: number) => { total[t] = (total[t] ?? 0) + v; };
  if (enh) {
    for (const k of keys) if (!/Tend$/.test(k)) add(k, enh);
    if (isP) { add('stuff', enh); add('command', enh); }
    bySrc.enh = enh;
  }
  const map = isP ? P_MAP : B_MAP;
  for (const [s, list] of Object.entries(src) as [Exclude<BonusSrc, 'enh'>, { k: string; v: number }[]][]) {
    const per: Partial<Record<Target, number>> = {};
    for (const x of list ?? []) for (const [t, w] of map[x.k] ?? []) per[t] = (per[t] ?? 0) + x.v * w;
    let best = 0;
    for (const [t, v] of Object.entries(per) as [Target, number][]) { add(t, v); if (v > best) best = v; }
    if (best > 0) bySrc[s] = Math.round(best * 10) / 10;
  }
  return { total, bySrc };
}
