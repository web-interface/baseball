// 피로 — 경기 중 투수 피로 단위(투구 수·구종 부담·전력투구·더위·긴 이닝)와 경기 사이 회복(팔 피로·연투·야수 피로) [15·10·16]
import { P } from './params.ts';
import { A, hasT, TR, type PC } from './player.ts';
import type { PitSt } from './state.ts';
import type { PlayerState } from './types.ts';

/** 체감온도 → 체력 소모 배율(16 표 보간) */
export function heatDrain(atC: number): number {
  const t = P.fat.heat; if (atC <= t[0][0]) return 1;
  for (let i = 1; i < t.length; i++) if (atC <= t[i][0]) { const [a, va] = t[i - 1], [b, vb] = t[i]; return va + (vb - va) * (atC - a) / (b - a); }
  return t[t.length - 1][1];
}
/** 공 하나 던진 뒤 피로 누적 */
export function addPitch(ps: PitSt, p: PC, type: number, li: number, atC: number, sig: number): void {
  let s = P.pt.stress[type] * (sig === 7 ? 1.3 : 1);
  if (li > 2) s *= P.fat.effort;
  const hd = heatDrain(atC); if (hd > 1) s *= 1 + (hd - 1) * p.wxT[0];
  if (hasT(p, TR.inningsEater)) s *= 0.9;
  if (hasT(p, TR.quickWorker)) s *= 0.95;
  if (ps.inningPitches > P.fat.longInningN) s *= P.fat.longInning;
  ps.F += s; ps.pitches++; ps.inningPitches++;
}
/** 쿨링브레이크·긴 휴식: 피로 −3 */
export function restBreak(ps: PitSt): void { ps.F = Math.max(0, ps.F - 3); }

/** 연투 구속 손실(km/h): 어제 15구↑ −0.8, 20구↑ −1.2, 사흘 연속 −3.5 (고무팔 절반) [15·10] */
export function b2bLoss(b2b: [number, number, number] | undefined, rubber: boolean): number {
  if (!b2b) return 0;
  let l = 0;
  if (b2b[0] >= 20) l = P.fat.b2b20; else if (b2b[0] >= 15) l = P.fat.b2b15;
  if (b2b[0] > 0 && b2b[1] > 0 && b2b[2] > 0) l = Math.max(l, P.fat.b2b3);
  return rubber ? l / 2 : l;
}

/** 경기 사이: 투수 팔 피로 회복·누적(하루). recovery 1~100, 오늘 던진 공 수 */
export function dayPitcher(st: PlayerState, recovery: number, pitchesToday: number, rubber: boolean, iron: boolean): void {
  const rec = 18 * (0.7 + 0.006 * recovery) * (rubber ? 1.2 : 1) * (iron ? 1.2 : 1);
  const arm = Math.max(0, (st.arm ?? 0) - rec) + pitchesToday * 0.55;
  st.arm = Math.min(100, arm);
  const b = st.b2b ?? [0, 0, 0]; st.b2b = [pitchesToday, b[0], b[1]];
}
/** 경기 사이: 야수 피로(출전 시 증가, 하루 회복) — 내구성 반영 */
export function dayFielder(st: PlayerState, durability: number, played: boolean, catcher: boolean, heatAT: number): void {
  let f = st.fatigue ?? 0;
  if (played) f += (catcher ? 9 : 5.5) * (1.2 - 0.004 * durability) * (heatAT > 30 ? 1 + (heatAT - 30) * 0.03 : 1) * (catcher && heatAT > 30 ? 1.3 : 1);
  f -= 6 * (0.9 + 0.002 * durability);
  st.fatigue = Math.max(0, Math.min(100, f));
}
/** 오늘 등판 가능(0 불가·1 비상시만·2 가능) — 선발 휴식·불펜 연투 규칙 */
export function availability(st: PlayerState, isStarter: boolean, daysSinceStart: number, rubber: boolean): 0 | 1 | 2 {
  const b = st.b2b ?? [0, 0, 0];
  if (isStarter) return daysSinceStart >= 4 ? 2 : daysSinceStart >= 3 ? 1 : 0;
  if (b[0] > 0 && b[1] > 0 && (!rubber || b[2] > 0)) return 0;          // 사흘 연속 금지
  if (b[0] >= 30) return rubber ? 1 : 0;
  if (b[0] >= 20 || (st.arm ?? 0) > 60) return 1;
  return 2;
}
export const attrRecovery = (p: PC): number => p.v[A.recovery];
