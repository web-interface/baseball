// 부상 — 노출이 일어날 때마다 해저드 판정(15 부상 26종 × 노출 13종). 기간·재발·후유증은 경기 뒤(시즌 쪽)에서.
// P(부상 | 노출) = 해저드 × 부상경향·내구성·나이·프로의식(선수 배율) × 피로 × 날씨(추위 근육·비 미끄러짐) × 특성 × 서버 빈도 설정
import { INJURIES, EXPOSURES, type InjDef } from './data/injuries.ts';
import { P } from './params.ts';
import { A, hasT, TR, type PC } from './player.ts';
import { u01, invN, clamp } from './rng.ts';
import type { G, TeamSt } from './state.ts';

export const EX = Object.fromEntries(EXPOSURES.map((k, i) => [k, i])) as Record<typeof EXPOSURES[number], number>;
const NE = EXPOSURES.length;
// 노출별 해저드 합(타자 쪽 B·투수 P·포수 C 포함 여부별)
const TOT = { B: new Float64Array(NE), P: new Float64Array(NE), C: new Float64Array(NE) };
for (const d of INJURIES) for (let e = 0; e < NE; e++) {
  const h = d.hz[e]; if (!h) continue;
  if (d.side === 'B' || d.side === 'all') { TOT.B[e] += h; TOT.C[e] += h; }
  if (d.side === 'C') TOT.C[e] += h;
  if (d.side === 'P' || d.side === 'all') TOT.P[e] += h;
}
const STREAM = 0x1a;
/** 추위 근육 배율(16): 15℃ 1.0 · 10℃ 1.15 · 5℃ 1.35 · 0℃ 1.5 */
export function coldMult(t: number): number { return t >= 15 ? 1 : t >= 10 ? 1 + 0.03 * (15 - t) : t >= 5 ? 1.15 + 0.04 * (10 - t) : Math.min(1.5, 1.35 + 0.03 * (5 - t)); }

/** 노출 1회 — 다치면 부상 종류 키, 아니면 null */
export function expose(g: G, team: TeamSt, i: number, ex: number, mult: number): InjDef | null {
  const pc = team.pcs[i]; const isP = team.posOf[i] === 0 || pc.pitches.length > 0 && ex >= EX.pitch;
  const side = isP ? 'P' : team.posOf[i] === 1 ? 'C' : 'B';
  const base = (side === 'P' ? TOT.P : side === 'C' ? TOT.C : TOT.B)[ex]; if (!base) return null;
  const sl = g.slot;
  const wx = (ex === EX.sprint || ex === EX.swing || ex === EX.throwF || ex === EX.pitch ? 1 + (coldMult(sl.tC) - 1) * pc.wxT[1] : 1) * (sl.rainLv > 0 && (ex === EX.sprint || ex === EX.slide) ? [1, 1.1, 1.3, 1.6][sl.rainLv] * pc.wxT[2] : 1);
  const fat = isP ? 1 : 1 + 1.5 * Math.pow(1 - clamp(1 - (pc.chP[0] < 0 ? -pc.chP[0] * 5 : 0), 0, 1), 2);
  const hz = base * pc.injMult * wx * fat * mult * P.inj.rate;
  g.ev.injCtr = (g.ev.injCtr + 1) | 0;
  const u = u01(g.seed[1], STREAM, pc.id, g.ev.injCtr);
  if (u >= hz) return null;
  // 종류 고르기(그 노출의 해저드 비율 × 조건 배율)
  let tot = 0; const w = W;
  for (let k = 0; k < INJURIES.length; k++) {
    const d = INJURIES[k]; let h = d.hz[ex];
    if (!h || !(d.side === side || d.side === 'all' || (side === 'C' && d.side === 'B'))) { w[k] = 0; continue; }
    const m = d.mods;
    if (m.cold && sl.tC < 10) h *= m.cold; if (m.rain && sl.rainLv > 0) h *= m.rain; if (m.heat && sl.atC > 30) h *= m.heat;
    if (m.speedHigh && pc.v[A.speed] > 70) h *= m.speedHigh; if (m.powerHigh && pc.v[A.power] > 70) h *= m.powerHigh;
    if (m.turf && g.park.surface === 'turf') h *= m.turf; if (m.velocityHigh && pc.v[A.velocity] > 70) h *= m.velocityHigh;
    if ((d.key === 'fingerFracture' || d.key === 'shoulderPos') && ex === EX.slide && hasT(pc, TR.headfirstSlide)) h *= 2;
    if (d.key === 'shoulderPos' && ex === EX.dive && hasT(pc, TR.diver)) h *= 1.5;
    if (side === 'P' && ex === EX.pitch && hasT(pc, TR.ironArm)) h *= 0.6;
    w[k] = h; tot += h;
  }
  let v = u01(g.seed[2], STREAM + 1, pc.id, g.ev.injCtr) * tot;
  for (let k = 0; k < INJURIES.length; k++) { v -= w[k]; if (v <= 0 && w[k] > 0) return INJURIES[k]; }
  return null;
}
const W = new Float64Array(INJURIES.length);

/** 결장 일수(경기 뒤): 로그정규 [중앙, σ, 최소, 최대] × 프로의식·나이 */
export function injuryDays(d: InjDef, prof: number, age: number, u1: number, u2: number): number {
  let dur = d.dur;
  if (d.severe && u2 < d.severe.share) dur = d.severe.dur;
  const days = dur[0] * Math.exp(dur[1] * invN(u1)) * (1.05 - 0.005 * prof) * (1 + 0.02 * Math.max(0, age - 30));
  return Math.round(clamp(days, dur[2], dur[3]));
}
export { INJURIES };
