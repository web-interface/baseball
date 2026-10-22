// 주루·플레이 판정 — 공 도착 시각 vs 주자 도착 시각(11 설계 8장). 땅볼·뜬공·안타 진루·태그업·병살·도루·견제·폭투.
import { P } from './params.ts';
import { A, CH, hasT, TR, defZ, type PC } from './player.ts';
import { clamp, invN, sig } from './rng.ts';
import { flight, FL, gbTime, rollSpeed, heightAtFrac, timeAtFrac, kindOf, type Roll } from './batted.ts';
import { airCarry, windAt } from './weather.ts';
import { type G, type Runner, type TeamSt, PO, BASE_X, BASE_Y, R, offense, defense } from './state.ts';
import { OFJ, pcAt, fenceAt, fenceHAt, flyCatch, groundIntercept, retrieve, releaseTime, throwFlight, throwSpeed, throwErrP, flyAbil, travel } from './fielding.ts';
import { bkRun, bkOut, bkPO, bkA, bkE, bkDP, batLine, fldLine, logBB, markBB, closeBB, logFD, logTH, logRN, logWhy, WHY } from './log.ts';

const DEG = Math.PI / 180, BL = 27.43;
const W2 = new Float64Array(2);
const OF_ROLL: Roll = { c: 1.5, k: 1 / 200 }, OF_ROLL_T: Roll = { c: 1.0, k: 1 / 260 };

/** 플레이 결과(재사용) — game.ts 가 타석 결과로 기록 */
/** 진루 상황 기록(보정용) */
function rev(g: G, kind: string, outs: number, field: number, result: number): void { if (g.col?.run) g.col.run({ kind, outs, field, result }); }
const fieldCode = (f: number): number => (f === 6 ? 0 : f === 7 ? 1 : f === 8 ? 2 : 3);
export const PL = { res: 0 as number, rbi: 0, hitBases: 0, kind: 0, ev: 0, la: 0, phi: 0, dist: 0, hang: 0, catchP: 1, fielder: -1, gdp: false, sf: false, sh: false, roe: false, err: false, hr: false, wall: false, robbed: false, fenceD: 0, hrDist: 0, outsMade: 0 };
function resetPL(): void { PL.res = R.OUT; PL.rbi = 0; PL.hitBases = 0; PL.kind = 0; PL.catchP = 1; PL.fielder = -1; PL.gdp = false; PL.sf = false; PL.sh = false; PL.roe = false; PL.err = false; PL.hr = false; PL.wall = false; PL.robbed = false; PL.fenceD = 0; PL.hrDist = 0; PL.outsMade = 0; PL.hang = 0; PL.dist = 0; }

// ── 주자 시간 ──
export function runV(g: G, pc: PC): number { return pc.sprint * (1 + pc.chP[CH.speed] + (g.pa ? 0 : 0)); }
function tauOf(g: G, pc: PC, moving: boolean): number {
  const wet = [0, 0.01, 0.03, 0.06][g.slot.field];
  return (moving ? P.run.tauMove : Math.max(0.6, P.run.tauStand - P.run.tauAg * pc.z[A.agility])) * (1 + wet);
}
const turnPen = (pc: PC): number => P.run.turn - P.run.turnBR * pc.z[A.baserunning];
/** 첫 베이스까지 dist(m) + 그 뒤 n 베이스 더 */
function arrive(g: G, pc: PC, dist: number, nMore: number, t0: number, moving: boolean): number {
  const v = runV(g, pc); return t0 + dist / v + tauOf(g, pc, moving) / 2 + nMore * (BL / v + turnPen(pc));
}
function batterTo(g: G, pc: PC, base: number): number {
  if (base <= 1) return pc.h1 - (g.pa.mode === 3 ? 0.25 : 0);
  const v = runV(g, pc); return pc.h1 + (base - 1) * (BL / v + turnPen(pc));
}
function leadOf(g: G, r: Runner, base: number): number {
  if (base === 0) return Math.max(0, P.run.lead1 + P.run.lead1Jump * g.T[g.half].pcs[r.i].z[A.stealJump]) * (g.T[g.half].pcs[r.i].mech.leadMult ?? 1) + P.run.lead2 + r.lead;
  if (base === 1) return P.run.lead2b + P.run.lead2b2 + r.lead;
  return P.run.lead3 + P.run.lead3b + r.lead;
}
const noise = (g: G, sd: number): number => sd * invN(g.rB.next());

function newRunner(g: G, bIdx: number, earned: boolean): Runner {
  const D = defense(g); return { i: bIdx, slot: g.T[g.half].next, resp: D.pit.i, earned, lead: 0, jump: 0 };
}
function scoreR(g: G, r: Runner, rbiOK: boolean): void { if (bkRun(g, r, rbiOK ? g.pa.b : -1) && rbiOK) PL.rbi++; }   // 끝내기로 무효가 된 득점은 타점도 없음
/** 판정 잡음 + 접전 오심(사람 심판) — 양수면 세이프 */
function safeMargin(g: G, m: number, runner: PC, tag: boolean): number {
  let x = m + noise(g, P.run.safeNoise) + (tag ? P.run.slide * runner.z[A.sliding] + (hasT(runner, TR.headfirstSlide) ? P.run.headfirst : 0) : 0);
  if (Math.abs(x) < 0.05 && g.rB.next() < P.run.closeCall * Math.exp(-Math.abs(x) / 0.02) * g.ump.closeCall) {
    // 오심 → 판독(남았으면 90% 바로잡음)
    const T = x > 0 ? g.T[1 - g.half] : g.T[g.half];
    if (T.reviews > 0 && g.rB.next() < 0.9) { T.reviews--; } else x = -x;
  }
  return x;
}

// ── 공통: 실책 출루 ──
function reachOnError(g: G, pos: number, extra: number): void {
  const O = offense(g);
  bkE(g, pos); g.vOuts++;
  PL.res = R.ROE; PL.roe = true; PL.err = true;
  advanceForced(g, 1 + extra, false);
  const br = newRunner(g, g.pa.b, false); placeBatter(g, br, 1 + extra);
  batLine(O, g.pa.b).ROE++;
}
/** 타자 주자를 베이스 b(1~3)에 */
function placeBatter(g: G, r: Runner, b: number): void { if (b >= 4) { scoreR(g, r, false); return; } g.bases[b - 1] = r; }
/** 밀려나는 주자들을 n 베이스씩(볼넷·실책 등): 강제 진루만 */
export function advanceForced(g: G, n: number, rbiOK: boolean): void {
  for (let k = 0; k < n; k++) {
    if (!g.bases[0]) { if (k === 0) continue; }
    // 3루 주자부터
    if (g.bases[0] && g.bases[1] && g.bases[2]) { const r = g.bases[2]!; g.bases[2] = null; scoreR(g, r, rbiOK); }
    if (g.bases[0] && g.bases[1]) { g.bases[2] = g.bases[1]; g.bases[1] = null; }
    if (g.bases[0]) { g.bases[1] = g.bases[0]; g.bases[0] = null; }
  }
}
/** 모든 주자 n 베이스(폭투·보크·실책 송구) */
export function advanceAll(g: G, n: number, earnedOK: boolean): number {
  let runs = 0;
  for (let k = 0; k < n; k++) {
    if (g.bases[2]) { const r = g.bases[2]; g.bases[2] = null; if (!earnedOK) r.earned = false; bkRun(g, r, -1); runs++; }
    g.bases[2] = g.bases[1]; g.bases[1] = g.bases[0]; g.bases[0] = null;
  }
  return runs;
}

/** 볼넷·몸맞공·고의4구 */
export function walk(g: G, earned = true): void {
  advanceForced(g, 1, true);
  if (g.bases[0]) throw new Error('walk: 1루 비지 않음');
  g.bases[0] = newRunner(g, g.pa.b, earned);
}

// ═════════════ 인플레이 ═════════════
export interface BipCtx { ev: number; la: number; phi: number; weak: boolean; rangeCh: number; bunt: boolean }
/** 인플레이 타구 판정 → PL 채움, 베이스·아웃·득점 갱신 */
export function resolveBIP(g: G, c: BipCtx): void {
  resetPL(); markBB(g);
  PL.ev = c.ev; PL.la = c.la; PL.phi = c.phi; PL.kind = kindOf(c.la);
  OFJ.add = c.la >= 10 ? P.fld.ofLineReact * Math.max(0, 25 - c.la) / 15 : 0;
  if (c.la < 10) playGround(g, c); else playAir(g, c);
  OFJ.add = 0;
  closeBB(g);
}

// ── 땅볼 ──
function playGround(g: G, c: BipCtx): void {
  const D = defense(g), O = offense(g); const pa = g.pa; const bat = O.pcs[pa.b];
  const fs = g.slot.field, turf = g.park.surface === 'turf'; const Gp = P.gb;
  const chop = c.la < Gp.chopLA;
  let v0 = c.ev / 3.6 * Math.cos(c.la * DEG) * (chop ? Gp.chop : Gp.factor) * (turf ? Gp.turf[fs] * (g.park.roof === 'dome' ? Gp.domeTurf : 1) : Gp.grass[fs]);
  const lam: Roll = { c: turf ? Gp.cTurf[fs] : Gp.cGrass[fs], k: turf ? Gp.kTurf : Gp.kGrass };
  let sAir = 0, tAir = 0;
  if (c.la > 2) { flight(c.ev, c.la); sAir = Math.min(FL.d, 40); tAir = FL.T * sAir / Math.max(0.1, FL.d); v0 = Math.min(v0, FL.vl * 0.85); }
  v0 = Math.max(1.5, v0);
  const gi = groundIntercept(g, D, c.phi, v0, lam, sAir, tAir, c.rangeCh, chop ? 0.15 : 0);
  if (gi.f < 0) {
    // 내야를 빠져나감 → 외야 회수
    const s0 = 46; const tr = gbTime(s0 - sAir, v0, lam); const t0 = tAir + (chop ? 0.15 : 0) + (tr === Infinity ? 4 : tr); const vb = Math.max(0.5, rollSpeed(s0 - sAir, v0, lam));
    logBB(g, c.ev, c.la, c.phi, s0 * Math.sin(c.phi * DEG), s0 * Math.cos(c.phi * DEG), t0, 0, 0, 1, 0);
    PL.catchP = 0;
    outfieldHit(g, c.phi, s0, t0, vb, lam, true, 0, false);
    return;
  }
  const fpos = gi.f; const fpc = pcAt(D, fpos);
  PL.fielder = fpos;
  logBB(g, c.ev, c.la, c.phi, gi.x, gi.y, gi.t, 0, 0, 0, 1);
  logFD(g, fpos, g.fx[fpos], g.fy[fpos], 0.28, 6, 0.5, gi.x, gi.y, gi.t, gi.dive ? 2 : 0, 1);
  // ── 포구 실책 ──
  const rainC = P.fld.errRainCatch[g.slot.rainLv + (g.slot.rainLv > 0 ? 1 : 0)] ?? 1;
  const errP = P.fld.errField * Math.exp(-P.fld.hands * defZ(fpc, A.hands, fpos)) * P.gb.bounce[fs] * (turf ? 0.8 : 1) * (chop ? 1.5 : 1) * (gi.dive ? 1.6 : 1) * P.fld.errInf[fs]
    * (g.slot.tC < 5 ? P.fld.errCold : 1) * rainC * Math.exp(pa.cErr) * (1 + Math.max(0, gi.vAt - 28) / 25) * (fpos === PO.P ? 0.7 : 1);
  if (g.rB.next() < errP) { reachOnError(g, fpos, 0); return; }
  // ── 주자 의도 ──
  const outs0 = g.outs, twoOut = outs0 === 2;
  const rr = [g.bases[0], g.bases[1], g.bases[2]];
  const forced = [!!rr[0], !!(rr[0] && rr[1]), !!(rr[0] && rr[1] && rr[2])];
  const tB1 = batterTo(g, bat, 1) - P.run.hustle * bat.z[A.competitiveness];
  const tRun = [99, 99, 99];
  for (let b = 0; b < 3; b++) if (rr[b]) tRun[b] = arrive(g, O.pcs[rr[b]!.i], BL - leadOf(g, rr[b]!, b), 0, forced[b] || twoOut ? 0 : 0.25, true);
  const rel = releaseTime(fpc, fpos, gi.dive);
  const nearBag = (b: number): boolean => Math.hypot(BASE_X[b] - gi.x, BASE_Y[b] - gi.y) < 4.5 && ((b === 1 && fpos === PO.B1) || (b === 2 && (fpos === PO.B2 || fpos === PO.SS)) || (b === 3 && fpos === PO.B3) || (b === 0 && fpos === PO.C));
  const tToBase = (b: number, hurry: boolean): number => {
    const dist = Math.hypot(BASE_X[b] - gi.x, BASE_Y[b] - gi.y);
    if (nearBag(b)) return gi.t + 0.15 + dist / 6.5;
    if (b === 1 && fpos === PO.B1) { const cover = 0.45 + Math.hypot(BASE_X[1] - g.fx[0], BASE_Y[1] - g.fy[0]) / (pcAt(D, 0).sprint * 0.9); return Math.max(gi.t + rel * 0.8 + dist / 20, cover); }
    return gi.t + rel + throwFlight(D, fpc, fpos, gi.x, gi.y, b, hurry);
  };
  // 비강제 주자: 2루 주자는 공이 자기 뒤(우측)로 가거나 느리면 3루로, 3루 주자는 홈 승부 가능성으로
  const dest = [rr[0] ? 2 : 0, rr[1] ? 2 : 0, rr[2] ? 3 : 0];
  if (rr[1]) dest[1] = forced[1] || twoOut || c.phi > 3 || gi.t > 2.0 ? 3 : 2;
  if (rr[2]) {
    let go = forced[2] || twoOut;
    if (!go && outs0 < 2 && D.inf !== 2) {
      const estHome = tToBase(0, true) + P.thr.tag;
      go = tRun[2] + noise(g, P.run.sigJ) < estHome - 0.05 || (outs0 === 1 && gi.t > 1.4) || (O.tac.aggression > 0 && g.rB.next() < 0.25);
    }
    dest[2] = go ? 4 : 3;
  }
  if (rr[1] && dest[1] === 3 && rr[2] && dest[2] === 3) dest[1] = 2;   // 3루가 막혀 있으면 2루에
  // ── 수비 선택: 가장 이득이 큰 송구 ──
  const t1def = tToBase(1, tB1 - tToBase(1, false) < 0.3), m1 = tB1 - t1def;
  const t2def = rr[0] ? tToBase(2, true) : 99, m2 = tRun[0] - t2def;
  const t3def = rr[1] && dest[1] === 3 ? tToBase(3, true) : 99, m3 = tRun[1] - t3def - (forced[1] ? 0 : P.thr.tag);
  const tHdef = rr[2] && dest[2] === 4 ? tToBase(0, true) : 99, mH = tRun[2] - tHdef - (forced[2] ? 0 : P.thr.tag);
  const late = g.inning >= 7 && Math.abs(g.score[1] - g.score[0]) <= 2;
  let choice = 1;   // 0 홈 · 1 1루 · 2 2루 · 3 3루 · −1 송구 없음
  if (rr[2] && dest[2] === 4 && outs0 < 2 && mH > (forced[2] ? (late || D.inf === 2 ? 0.05 : 0.20) : (late || D.inf === 2 ? 0.10 : 0.30))) choice = 0;
  else if (forced[0] && outs0 < 2 && m2 > 0.05) choice = 2;
  else if (forced[0] && m2 > 0.30 && m1 < 0.05) choice = 2;
  else if (rr[1] && dest[1] === 3 && !forced[1] && m3 > 0.35 && m1 < 0.4) choice = 3;
  else if (m1 < -0.45) choice = -1;
  // ── 송구 실행 ──
  const out = [false, false, false]; let batOut = false; let errThrow = false;
  const doThrow = (b: number, tDef: number, tR: number, rpc: PC, tag: boolean): boolean => {
    const D2 = Math.hypot(BASE_X[b] - gi.x, BASE_Y[b] - gi.y);
    if (!nearBag(b) && g.rB.next() < throwErrP(fpc, fpos, D2, tR - tDef < 0.2, g.slot.rainLv, pa.cErr)) { bkE(g, fpos); PL.err = true; errThrow = true; logTH(g, fpos, b, gi.t + rel, tDef, throwSpeed(fpc, fpos, true), 2, 0); return false; }
    if (!nearBag(b)) logTH(g, fpos, b, gi.t + rel, tDef, throwSpeed(fpc, fpos, true), 0, 0);
    return safeMargin(g, tDef + (tag ? P.thr.tag : 0) - tR, rpc, tag) < 0;
  };
  const cover = (b: number): number => (b === 1 ? (fpos === PO.B1 ? PO.P : PO.B1) : b === 2 ? (fpos === PO.B2 || fpos === PO.B1 || (fpos === PO.P && c.phi > 0) ? PO.SS : PO.B2) : b === 3 ? PO.B3 : PO.C);
  const recOut = (b: number): void => { bkOut(g); if (nearBag(b)) bkPO(g, fpos); else { bkPO(g, cover(b)); bkA(g, fpos); } };
  if (choice === 2) {
    if (doThrow(2, t2def, tRun[0], O.pcs[rr[0]!.i], false)) {
      out[0] = true; recOut(2);
      if (g.outs < 3 && !errThrow) {
        // 병살 피벗 → 1루
        const pivPos = nearBag(2) ? fpos : cover(2); const pivPc = pcAt(D, pivPos);
        let pivot = clamp(P.dp.pivot - P.dp.turnDP * defZ(pivPc, A.turnDP, pivPos) - P.dp.ag * pivPc.z[A.agility] - P.dp.mech * (pivPc.mech.dpPP ?? 0) - P.dp.chem * (D.chemTier >= 3 ? 1 : 0), P.dp.min, P.dp.max);
        if (hasT(O.pcs[rr[0]!.i], TR.hardSlide)) pivot += 0.08;
        const t1 = t2def + pivot + BL / throwSpeed(pivPc, pivPos, true) * (1 + P.thr.arc * BL / 30);
        if (g.rB.next() < throwErrP(pivPc, pivPos, BL, true, g.slot.rainLv, pa.cErr) * 0.8) { bkE(g, pivPos); PL.err = true; errThrow = true; }
        else {
          logTH(g, pivPos, 1, t2def + pivot, t1, throwSpeed(pivPc, pivPos, true), 0, 1);
          if (safeMargin(g, t1 - tB1, bat, false) < 0) { batOut = true; bkOut(g); bkPO(g, PO.B1); bkA(g, pivPos); bkDP(g, pivPos); PL.gdp = true; }
        }
      }
    }
  } else if (choice === 0) {
    const tagPlay = !forced[2];
    if (doThrow(0, tHdef, tRun[2], O.pcs[rr[2]!.i], tagPlay)) {
      out[2] = true; recOut(0);
      if (!tagPlay && g.outs < 3 && !errThrow) { const cpc = pcAt(D, PO.C); const t1 = tHdef + 0.55 + BL / throwSpeed(cpc, PO.C, true); logTH(g, PO.C, 1, tHdef + 0.55, t1, throwSpeed(cpc, PO.C, true), 0, 1); if (safeMargin(g, t1 - tB1, bat, false) < 0) { batOut = true; bkOut(g); bkPO(g, PO.B1); bkA(g, PO.C); PL.gdp = true; } }
    }
  } else if (choice === 3) {
    if (doThrow(3, t3def, tRun[1], O.pcs[rr[1]!.i], !forced[1])) { out[1] = true; recOut(3); }
  } else if (choice === 1) {
    if (doThrow(1, t1def, tB1, bat, false)) { batOut = true; recOut(1); }
  }
  // ── 이동 적용 ──
  if (errThrow) { for (let b = 0; b < 3; b++) if (rr[b] && !out[b]) dest[b] = Math.min(4, dest[b] + 1); g.vOuts++; }
  const forceOutMade = out[0] || (out[1] && forced[1]) || (out[2] && forced[2]) || batOut;
  g.bases[0] = g.bases[1] = g.bases[2] = null;
  if (g.outs < 3) {
    for (let b = 2; b >= 0; b--) {
      const r = rr[b]; if (!r || out[b]) continue;
      let k = dest[b];
      while (k <= 3 && g.bases[k - 1]) k++;
      if (k >= 4) scoreR(g, r, !PL.gdp && !errThrow); else g.bases[k - 1] = r;
    }
    if (!batOut) { let k = errThrow && choice === 1 ? 2 : 1; while (k <= 3 && g.bases[k - 1]) k++; if (k >= 4) scoreR(g, newRunner(g, pa.b, false), false); else g.bases[k - 1] = newRunner(g, pa.b, !errThrow); }
  } else if (!forceOutMade) {
    for (let b = 2; b >= 0; b--) { const r = rr[b]; if (r && !out[b] && dest[b] >= 4) scoreR(g, r, true); }
  }
  // ── 결과 분류 ──
  PL.outsMade = (out[0] ? 1 : 0) + (out[1] ? 1 : 0) + (out[2] ? 1 : 0) + (batOut ? 1 : 0);
  if (g.col?.run && !errThrow) {
    if (rr[0] && outs0 < 2) rev(g, 'GB_R1', outs0, 3, PL.gdp ? 0 : out[0] && !batOut ? 1 : batOut && !out[0] ? 2 : 3);
    if (rr[2] && outs0 < 2) rev(g, 'GB_R3', outs0, 3, out[2] ? 2 : dest[2] >= 4 ? 0 : 1);
    if (rr[1] && !rr[2] && batOut && outs0 < 2) rev(g, 'GB_R2', outs0, 3, out[1] ? 2 : dest[1] >= 3 ? 0 : 1);
  }
  if (errThrow) { PL.res = R.ROE; PL.roe = true; batLine(O, pa.b).ROE++; }
  else if (PL.gdp) PL.res = R.DP;
  else if (batOut) PL.res = R.OUT;
  else if (out[0] || out[1] || out[2]) PL.res = R.FC;
  else if (choice === 1 || choice === -1) { PL.res = R.S1; PL.hitBases = 1; }
  else PL.res = R.FC;
}

// ── 뜬공·라이너·팝업 ──
function playAir(g: G, c: BipCtx): void {
  const D = defense(g), O = offense(g); const pa = g.pa; const bat = O.pcs[pa.b];
  flight(c.ev, c.la);
  const d0 = FL.d, T0 = FL.T;
  const sl = g.slot;
  const dAir = airCarry(sl, g.park.elevM, d0);
  windAt(sl, g.park, c.phi, W2);
  let tail = W2[0]; const cross = W2[1];
  if (sl.gustMs > sl.windMs) tail += P.air.gust * (sl.gustMs - sl.windMs) * g.park.expoHigh * invN(g.rW.next());
  const dWind = P.air.tail * T0 * tail;
  const delta = clamp(dAir + dWind, -P.air.cap, P.air.cap);
  const d = Math.max(1, d0 + delta + P.air.offset * Math.pow(d0 / 121.9, 1.3));
  if (d < 80) OFJ.add += P.fld.ofShortReact * (80 - d) / 20;
  const drift = P.air.cross * T0 * cross;
  const T = T0 * (1 + 0.004 * delta);
  const phiL = clamp(c.phi + Math.atan2(drift, Math.max(5, d)) / DEG, -46, 46);
  const lx = d * Math.sin(phiL * DEG), ly = d * Math.cos(phiL * DEG);
  const kind = kindOf(c.la);
  PL.dist = d; PL.hang = T;
  const Df = fenceAt(g, phiL), Hf = fenceHAt(g, phiL);
  PL.fenceD = Df;
  // ── 펜스 ──
  if (d > Df && Math.abs(phiL) <= 45) {
    const hF = heightAtFrac(Df / d) * (d / d0 > 1 ? 1 : 1);
    PL.hrDist = d;
    if (hF > Hf) {
      // 홈런 강탈(펜스 바로 위)
      if (hF - Hf < 0.9) {
        const of = phiL < -15 ? PO.LF : phiL > 15 ? PO.RF : PO.CF; const opc = pcAt(D, of); const ab = flyAbil(opc, of, c.rangeCh);
        const fx = Df * Math.sin(phiL * DEG), fy = Df * Math.cos(phiL * DEG);
        const tNeed = travel(Math.hypot(fx - g.fx[of], fy - g.fy[of]) - 1, ab.react, ab.v, ab.tau);
        const tCross = timeAtFrac(Df / d, T);
        if (tNeed < tCross - 0.1 && g.rB.next() < (0.30 * Math.exp(0.3 * opc.z[A.agility]) + (hasT(opc, TR.wallClimber) ? 0.10 : 0)) * (1 - (hF - Hf) / 0.9) * 0.6) {
          PL.robbed = true; PL.catchP = 0.05; PL.fielder = of;
          logBB(g, c.ev, c.la, c.phi, lx, ly, T, FL.apex, kind, 0, 0.05);
          caughtFly(g, of, fx, fy, tCross, kind); fldLine(D, of).hardCaught++; return;
        }
      }
      PL.hr = true; PL.res = R.HR; PL.hitBases = 4; PL.catchP = 0;
      logBB(g, c.ev, c.la, c.phi, lx, ly, T, FL.apex, kind, 4, 0);
      attribHR(g, d, Df, dAir, dWind, Hf, hF);
      const r = newRunner(g, pa.b, true);
      g.hrTrot = true;   // 홈런은 끝내기여도 주자·타자 전원 득점
      for (let b = 2; b >= 0; b--) { const rr = g.bases[b]; if (rr) { g.bases[b] = null; scoreR(g, rr, true); } }
      scoreR(g, r, true);
      g.hrTrot = false;
      return;
    }
    // 담장 직격 → 담장 앞에서 회수
    PL.wall = true; PL.catchP = 0;
    const tHit = timeAtFrac(Df / d, T);
    logBB(g, c.ev, c.la, c.phi, lx, ly, T, FL.apex, kind, 2, 0);
    if (Hf >= 4) logWhy(g, WHY.PARK_WALL, Hf, true, bat.id);
    const sBack = Df - (2 + 10 * g.park.wallBounce * g.rB.next());
    outfieldHit(g, phiL, sBack, tHit + 0.35, 0.5, OF_ROLL, false, kind, true);
    return;
  }
  // ── 포구 경주 ──
  const sunPen = sunPenalty(g, phiL);
  const fogMult = sl.visKm < 0.5 ? 1.8 : sl.visKm < 1 ? 1.3 : 1;
  const gustMult = 1 + P.fld.gust * Math.max(0, sl.gustMs - 8);
  const cr = flyCatch(g, D, lx, ly, T, d, c.phi, kind, Df, { sunPen, fogMult, gustMult }, c.rangeCh);
  PL.catchP = cr.p; PL.fielder = cr.f;
  // 인필드 플라이
  const ifr = kind === 3 && d < 60 && g.outs < 2 && g.bases[0] && g.bases[1];
  const caught = g.rB.next() < cr.p || (ifr && g.rB.next() < 0.98);
  const fpc = cr.f >= 0 ? pcAt(D, cr.f) : null;
  if (cr.f >= 0) { const ab = flyAbil(fpc!, cr.f, c.rangeCh); logFD(g, cr.f, g.fx[cr.f], g.fy[cr.f], ab.react, ab.v, ab.tau, cr.x, cr.y, cr.t, caught ? (cr.dive ? 2 : 0) : 1, cr.p); }   // 라이너를 길 위에서 막으면 그 점·시각
  if (caught && fpc) {
    // 잡았는데 떨어뜨림(실책)
    const rainC = P.fld.errRainCatch[sl.rainLv + (sl.rainLv > 0 ? 1 : 0)] ?? 1;
    const dropP = P.fld.errCatch * Math.exp(-P.fld.hands * cr.p * 0 - P.fld.hands * flyAbil(fpc, cr.f, 0).hands) * (cr.dive ? 2.5 : 1) * rainC * (sl.tC < 5 ? P.fld.errCold : 1) * Math.exp(pa.cErr) * (kind === 3 && sl.gustMs >= 12 ? 1.5 : 1);
    if (!ifr && g.rB.next() < dropP) {
      logBB(g, c.ev, c.la, c.phi, lx, ly, T, FL.apex, kind, 9, cr.p);
      bkE(g, cr.f); g.vOuts++;
      PL.res = R.ROE; PL.roe = true; PL.err = true; batLine(O, pa.b).ROE++;
      advanceAll(g, 1, false); g.bases[0] = newRunner(g, pa.b, false);
      return;
    }
    if (cr.p < 0.35) fldLine(D, cr.f).hardCaught++;
    logBB(g, c.ev, c.la, c.phi, lx, ly, T, FL.apex, kind, 0, cr.p);
    caughtFly(g, cr.f, cr.x, cr.y, cr.t, kind);
    if (ifr) PL.res = R.OUT;
    return;
  }
  // ── 떨어진 공: 바운드 후 회수 ──
  logBB(g, c.ev, c.la, c.phi, lx, ly, T, FL.apex, kind, 1, cr.p);
  const turf = g.park.surface === 'turf';
  const vb = FL.vl * clamp((turf ? 0.95 : 0.85) - 0.012 * c.la, 0.25, 0.8);
  outfieldHit(g, phiL, d, T, vb, turf ? OF_ROLL_T : OF_ROLL, false, kind, false);
}

/** 햇빛 낙구 판단 패널티(그 방향 수비수가 해를 마주 보면) */
function sunPenalty(g: G, phiL: number): number {
  const s = g.slot; if (s.sky >= 2 || s.sunAlt < 5 || s.sunAlt > 40) return 0;
  const facing = (g.park.orientDeg + phiL + 180) % 360;   // 수비수가 홈을 바라보는 방위
  const dAz = Math.abs(((s.sunAz - facing) % 360 + 540) % 360 - 180);
  if (dAz > 25) return 0;
  return P.fld.sunAdd * (s.sky === 1 ? 0.5 : 1);
}

/** 뜬공 아웃 처리 + 태그업 */
function caughtFly(g: G, f: number, x: number, y: number, tC: number, kind: number): void {
  const D = defense(g), O = offense(g);
  bkOut(g); bkPO(g, f); PL.res = R.OUT;
  if (g.outs >= 3) return;
  const fpc = pcAt(D, f);
  const rel = releaseTime(fpc, f, false) + P.thr.tagRel;
  // 라이너: 뛰던 주자(히트앤런) 더블 아웃
  if (kind === 1 && g.pa.mode === 1 && g.bases[0] && g.rB.next() < 0.6) { bkOut(g); bkA(g, f); bkPO(g, PO.B1); g.bases[0] = null; PL.gdp = true; return; }
  if (kind >= 3 || Math.hypot(x, y) < 45) return;  // 내야 뜬공 — 진루 없음
  const out = g.outs;
  // 3루 주자 태그업
  const r3 = g.bases[2], r2 = g.bases[1];
  const r1s = g.bases[0], had3 = !!r3, had2free = !!r2 && !r3, had1free = !!r1s && !r2; const ob = out - 1;
  try {
  let threw = false;
  if (r3) {
    const pc = O.pcs[r3.i];
    const tRun = tC + arrive(g, pc, BL, 0, 0, true) - 0.05;
    const tThrow = tC + rel + throwFlight(D, fpc, f, x, y, 0, true) + P.thr.tag;
    const th = P.run.thTag3[Math.min(1, out - 1 < 0 ? 0 : out - 1)];
    const est = tThrow - tRun + noise(g, P.run.sigJ * Math.exp(-P.run.sigJBR * pc.z[A.baserunning]));
    const late = g.inning >= 8 && offDiffG(g) <= 0 && offDiffG(g) >= -1;
    if (est > th - (late ? 0.15 : 0) - 0.15 * O.tac.extraBase) {
      threw = true;
      logTH(g, f, 0, tC + rel, tThrow, throwSpeed(fpc, f, true), 0, 0);
      if (g.rB.next() < throwErrP(fpc, f, Math.hypot(x, y), true, g.slot.rainLv, g.pa.cErr) * 0.7) { bkE(g, f); g.bases[2] = null; scoreR(g, r3, true); PL.sf = true; if (r2 && !g.over) { g.bases[1] = null; g.bases[2] = r2; } return; }
      if (safeMargin(g, tThrow - tRun, pc, true) > 0) { g.bases[2] = null; scoreR(g, r3, true); PL.sf = true; logRN(g, pc.id, 3, 4, tC, tRun, 3, 1); if (g.over) return; }   // 끝내기 희생플라이면 여기서 끝
      else { g.bases[2] = null; bkOut(g); bkA(g, f); bkPO(g, PO.C); logRN(g, pc.id, 3, 4, tC, tRun, 1, 1); if (g.outs >= 3) { /* 득점 무효는 아님: 태그 아웃 전에 득점 없음 */ } }
    }
    if (g.outs >= 3) return;
  }
  // 2루 주자 → 3루
  if (r2 && g.bases[1] === r2 && !g.bases[2]) {
    const pc = O.pcs[r2.i];
    const tRun = tC + arrive(g, pc, BL, 0, 0, true);
    const tThrow = tC + rel + throwFlight(D, fpc, f, x, y, 3, true) + P.thr.tag + (threw ? 0.6 : 0);
    const th = P.run.thTag2[Math.min(1, Math.max(0, out - 1))];
    const est = tThrow - tRun + noise(g, P.run.sigJ);
    if (est > th + (x < 0 ? 0.15 : -0.05)) {
      if (safeMargin(g, tThrow - tRun, pc, true) > 0 || threw) { g.bases[1] = null; g.bases[2] = r2; }
      else { g.bases[1] = null; bkOut(g); bkA(g, f); bkPO(g, PO.B3); }
    }
  }
  if (g.outs >= 3) return;
  // 1루 주자 → 2루(깊은 뜬공)
  const r1 = g.bases[0];
  if (r1 && !g.bases[1] && Math.hypot(x, y) > 88) {
    const pc = O.pcs[r1.i]; const tRun = tC + arrive(g, pc, BL, 0, 0, true);
    const tThrow = tC + rel + throwFlight(D, fpc, f, x, y, 2, true) + P.thr.tag;
    if (tThrow - tRun + noise(g, P.run.sigJ) > 0.45) { if (safeMargin(g, tThrow - tRun, pc, true) > 0 || threw) { g.bases[0] = null; g.bases[1] = r1; } else { g.bases[0] = null; bkOut(g); bkA(g, f); bkPO(g, PO.B2); } }
  }
  } finally {
    if (g.col?.run && f >= 6) {
      const fc = fieldCode(f);
      if (had3) rev(g, 'FO_R3', ob, fc, PL.sf ? 0 : g.bases[2] === r3 ? 1 : 2);
      if (had2free) rev(g, 'FO_R2', ob, fc, g.bases[2] === r2 ? 0 : g.bases[1] === r2 ? 1 : 2);
      if (had1free) rev(g, 'FO_R1', ob, fc, g.bases[1] === r1s ? 0 : g.bases[0] === r1s ? 1 : 2);
    }
  }
}
const offDiffG = (g: G): number => (g.half === 1 ? g.score[1] - g.score[0] : g.score[0] - g.score[1]);

/**
 * 외야로 간 공(안타) — 회수 시각과 송구 vs 주자 도착 경주로 타자·주자 진루 결정.
 * ground: 내야를 빠진 땅볼(주자 타격 순간 출발) / kind: 1 라이너(멈칫) / wall: 담장 직격 */
function outfieldHit(g: G, phi: number, s0: number, t0: number, vb: number, lam: Roll, ground: boolean, kind: number, wall: boolean): void {
  const D = defense(g), O = offense(g); const pa = g.pa; const bat = O.pcs[pa.b];
  const rr = retrieve(g, D, phi, s0, t0, vb, lam, fenceAt(g, phi), g.park.wallBounce, 0);
  const f = rr.f < 0 ? PO.CF : rr.f; const fpc = pcAt(D, f);
  const tR = rr.f < 0 ? t0 + 3 : rr.t;
  if (rr.f >= 0) { const ab = flyAbil(fpc, f, 0); logFD(g, f, g.fx[f], g.fy[f], ab.react, ab.v, ab.tau, rr.x, rr.y, tR, 3, 0); }
  const rel = releaseTime(fpc, f, false);
  const tThrowTo = (b: number): number => tR + rel + throwFlight(D, fpc, f, rr.x, rr.y, b, true) + (b === 1 ? 0 : P.thr.tag);
  const outs = g.outs; const twoOut = outs === 2;
  // 주자 출발: 땅볼·2사 = 타격 순간(리드·움직이며), 라이너 = 멈칫 후, 뜬공 = 하프웨이에서 낙구 확인 후
  const startOf = (b: number, r: Runner): { t: number; pos: number; moving: boolean } => {
    const lead = leadOf(g, r, b);
    if (ground || twoOut) return { t: b === 2 ? 0.1 : 0, pos: lead, moving: true };
    if (kind === 1) return { t: P.run.lineFreeze + 0.2, pos: lead * 0.8, moving: false };
    // 뜬공: 하프웨이(1루 12m, 2루 9m, 3루 태그 위치 0)
    const half = b === 0 ? P.run.half1 : b === 1 ? P.run.half2 : 2;
    return { t: clamp(t0 - P.run.flyRead, 0.5, P.run.flyMaxStart), pos: half, moving: true };
  };
  // 타자의 '자연' 목표(앞 주자 무시) 먼저 — 그래야 주자가 안타 종류를 알고 판단한다
  const tgt = [0, 0, 0];   // 주자 b(0,1,2) 의 목표 베이스(2~4)
  const arrT = [0, 0, 0];
  const late = g.inning >= 7;
  const trailing = offDiffG(g) < 0;
  const aggr = 0.15 * O.tac.extraBase;
  let bNat = 1;
  {
    const sj = P.run.sigJ * Math.exp(-P.run.sigJBR * bat.z[A.baserunning]);
    for (let k = 2; k <= 4; k++) {
      const m = tThrowTo(k === 4 ? 0 : k) - batterTo(g, bat, k);
      const th = (k === 2 ? P.run.thB2[outs] : k === 3 ? P.run.thB3[outs] : 0.6) - aggr * 0.5 - (hasT(bat, TR.aggressiveRunner) ? 0.08 : 0) + (k === 2 && ground && !wall ? 0.15 : 0);
      if (m + noise(g, sj) > th) bNat = k; else break;
    }
  }
  // 각 주자(앞 주자부터): 가장 먼 베이스부터 거꾸로 — 갈 수 있는 가장 먼 곳
  let aheadTgt = 5;
  for (let b = 2; b >= 0; b--) {
    const r = g.bases[b]; if (!r) continue;
    const pc = O.pcs[r.i]; const st = startOf(b, r);
    const minB = Math.max(b + 2, Math.min(4, bNat + 1 + (b === 0 ? 0 : b === 1 && g.bases[0] ? 0 : 0)) * (b + 1 <= bNat ? 1 : 0));
    let best = Math.min(Math.max(b + 2, minB), aheadTgt <= 4 ? aheadTgt - 1 : 4);
    const sj = P.run.sigJ * Math.exp(-P.run.sigJBR * pc.z[A.baserunning]);
    const adj = -aggr - (hasT(pc, TR.aggressiveRunner) ? 0.10 : 0) - (late && trailing ? 0.10 : 0) + (offDiffG(g) >= 4 ? 0.15 : 0);
    for (let k = 4; k > best; k--) {
      if (aheadTgt <= 4 && k >= aheadTgt) continue;
      const tr = arrive(g, pc, BL - st.pos, k - (b + 1) - 1, st.t, st.moving);
      const m = tThrowTo(k === 4 ? 0 : k) - tr;
      let th: number;
      if (b === 0) th = k === 3 ? (bNat >= 2 ? -9 : P.run.th1to3[outs]) : (bNat >= 2 ? P.run.th1toH2B[outs] : P.run.th1to3[outs] + 0.4);
      else if (b === 1) th = bNat >= 2 ? -0.3 : P.run.th2toH[outs];
      else th = -9;
      if (m + noise(g, sj) > th + adj) { best = k; break; }
    }
    tgt[b] = Math.max(b + 2, Math.min(best, aheadTgt <= 4 ? aheadTgt - 1 : 4));
    arrT[b] = arrive(g, pc, BL - st.pos, tgt[b] - (b + 1) - 1, st.t, st.moving);
    aheadTgt = tgt[b] >= 4 ? 5 : tgt[b];
  }
  // 타자: 앞 주자에 막히면 그 앞까지
  let bTgt = Math.min(bNat, aheadTgt <= 4 ? aheadTgt - 1 : 4);
  if (bTgt < 1) bTgt = 1;

  // 수비 송구: 가장 잡기 쉬운 진루 주자(이득 순: 홈 > 3루 > 2루)
  let tb = -1, tm = 9, isBat = false;
  for (let b = 2; b >= 0; b--) {
    const r = g.bases[b]; if (!r || tgt[b] <= b + 2 && !(tgt[b] === 4)) { if (!r) continue; }
    if (!r) continue;
    if (tgt[b] <= b + 1) continue;
    const base = tgt[b] === 4 ? 0 : tgt[b];
    const m = tThrowTo(base) - arrT[b];
    const val = tgt[b] === 4 ? 0.12 : 0;   // 홈 승부 선호
    if (m - val < tm && m < 0.30) { tm = m - val; tb = b; }
  }
  if (bTgt >= 2) { const m = tThrowTo(bTgt === 4 ? 0 : bTgt) - batterTo(g, bat, bTgt); if (m < tm && m < 0.25) { tm = m; tb = 3; isBat = true; } }
  // 송구 실책
  let throwErr = false;
  if (tb >= 0) {
    const base = isBat ? (bTgt === 4 ? 0 : bTgt) : (tgt[tb] === 4 ? 0 : tgt[tb]);
    const D2 = Math.hypot(BASE_X[base] - rr.x, BASE_Y[base] - rr.y);
    if (g.rB.next() < throwErrP(fpc, f, D2, true, g.slot.rainLv, pa.cErr)) { throwErr = true; bkE(g, f); PL.err = true; }
    logTH(g, f, base, tR + rel, tThrowTo(base), throwSpeed(fpc, f, true), throwErr ? 2 : 0, D2 > P.thr.relayDist ? 1 : 0);
  }
  // 이동 적용(앞 주자부터)
  const old = [g.bases[0], g.bases[1], g.bases[2]];
  g.bases[0] = g.bases[1] = g.bases[2] = null;
  const pendingRuns: Runner[] = []; const pendingFrom: number[] = [];
  let outOnBases = 0; const fin = [0, 0, 0];
  for (let b = 2; b >= 0; b--) {
    const r = old[b]; if (!r) continue;
    let k = tgt[b];
    if (throwErr) k = Math.min(4, k + 1);
    else if (tb === b && !isBat) {
      const base = k === 4 ? 0 : k;
      const m = tThrowTo(base) - arrT[b];
      if (safeMargin(g, m, O.pcs[r.i], true) < 0) {
        outOnBases++; fin[b] = -1; bkOut(g); bkA(g, f); bkPO(g, base === 0 ? PO.C : base === 3 ? PO.B3 : PO.B2);
        logRN(g, O.pcs[r.i].id, b + 1, k, 0, arrT[b], 1, 1);
        if (g.outs >= 3) break;
        continue;
      }
    }
    if (k < 4) logRN(g, O.pcs[r.i].id, b + 1, k, 0, arrT[b], 0, 0);
    fin[b] = k;
    if (k >= 4) { pendingRuns.push(r); pendingFrom.push(b); } else g.bases[k - 1] = r;
  }
  // 득점(세 번째 아웃이 태그 아웃이면 그 전에 들어온 앞 주자 득점은 인정). 끝내기면 결승 주자까지만(9.06(f): 타자 루타도 결승 주자가 간 만큼만)
  let woFrom = -1;
  for (let q = 0; q < pendingRuns.length; q++) {
    const r = pendingRuns[q], b = pendingFrom[q];
    if (!(g.outs < 3 || outOnBases > 0)) continue;
    const was = g.wo, s0 = g.score[g.half];
    scoreR(g, r, !throwErr || true);
    const scored = g.score[g.half] > s0;
    logRN(g, O.pcs[r.i].id, b + 1, scored ? 4 : 3, 0, arrT[b], scored ? 3 : 0, 0);
    if (!was && g.wo) woFrom = b;
  }
  // 타자
  let bFinal = bTgt;
  if (g.outs < 3) {
    if (throwErr && !isBat) bFinal = Math.min(4, bTgt + 1);
    if (isBat && !throwErr && !g.wo) {
      const base = bTgt === 4 ? 0 : bTgt;
      const m = tThrowTo(base) - batterTo(g, bat, bTgt);
      if (safeMargin(g, m, bat, true) < 0) { bFinal = -(bTgt - 1); bkOut(g); bkA(g, f); bkPO(g, base === 0 ? PO.C : base === 3 ? PO.B3 : PO.B2); }
    } else if (isBat && throwErr) bFinal = Math.min(4, bTgt + 1);
    // 송구가 다른 곳으로 가면 타자 한 베이스 더(공 따라 진루)
    if (!isBat && tb >= 0 && bFinal > 0 && bFinal < 3 && !throwErr) {
      const nb = bFinal + 1; if (!(g.bases[nb - 1]) && g.rB.next() < 0.45) bFinal = nb;
    }
  }
  const credited = bFinal > 0 ? Math.min(bFinal, throwErr ? bTgt : bFinal) : -bFinal;
  PL.hitBases = Math.max(1, Math.min(4, credited));
  if (woFrom >= 0) { PL.hitBases = Math.max(1, Math.min(PL.hitBases, 3 - woFrom)); if (bFinal > PL.hitBases) bFinal = PL.hitBases; }   // 끝내기 안타: 결승 주자가 간 베이스 수만큼만
  PL.res = PL.hitBases === 1 ? R.S1 : PL.hitBases === 2 ? R.S2 : PL.hitBases === 3 ? R.S3 : R.HR;
  if (bFinal > 0) { const br = newRunner(g, pa.b, true); if (bFinal >= 4) scoreR(g, br, true); else { while (bFinal <= 3 && g.bases[bFinal - 1]) bFinal++; if (bFinal >= 4) scoreR(g, br, true); else g.bases[bFinal - 1] = br; } }
  { const to = bFinal > 0 ? bFinal : bTgt; logRN(g, bat.id, 0, to, 0, batterTo(g, bat, Math.max(1, to)), bFinal > 0 ? 0 : 1, bFinal > 0 ? 0 : 1); }   // 더 가다 잡히면 목표 베이스(예: 2루타 치고 3루에서 아웃)로 기록
  if (g.col?.run && !throwErr) {
    const fc = fieldCode(f); const hb = PL.hitBases; const res3 = (b: number, adv: number): number => (fin[b] < 0 ? 2 : fin[b] >= adv ? 0 : 1);
    if (hb === 1) {
      if (old[0]) rev(g, old[1] ? 'S1_R1w' : 'S1_R1a', outs, fc, res3(0, 3));
      if (old[1] && !old[2]) rev(g, 'S1_R2', outs, ground ? 3 : fc, res3(1, 4));
      if (old[2]) rev(g, 'S1_R3', outs, fc, res3(2, 4));
    } else if (hb === 2) {
      if (old[0]) rev(g, 'S2_R1', outs, fc, res3(0, 4));
      if (old[1]) rev(g, 'S2_R2', outs, fc, res3(1, 4));
    }
  }
}

/** 홈런 원인 표시: 바람·기온(비거리), 구장(거리) — 연속값이라 정확 */
function attribHR(g: G, d: number, Df: number, dAir: number, dWind: number, Hf: number, hF: number): void {
  if (!g.logOn) return;
  const bat = offense(g).pcs[g.pa.b];
  const margin = d - Df;
  if (Math.abs(dWind) >= 1 && d - dWind <= Df + 0.5) logWhy(g, WHY.WIND, dWind, true, bat.id);
  else if (Math.abs(dWind) >= 2) logWhy(g, WHY.WIND, dWind, false, bat.id);
  if (Math.abs(dAir) >= 1 && d - dAir <= Df + 0.5) logWhy(g, WHY.TEMP, dAir, true, bat.id);
  if (Df < 98 && margin < 4) logWhy(g, WHY.PARK_DIST, Df, true, bat.id);
  void Hf; void hF;
}

// ═════════════ 번트 ═════════════
/** 번트 타구(페어) — 투수·포수·코너가 잡아 선행 주자 또는 1루 */
export function playBunt(g: G, type: number): void {
  resetPL(); markBB(g); PL.kind = 4;
  const D = defense(g), O = offense(g); const pa = g.pa; const bat = O.pcs[pa.b];
  const Bp = P.bunt; const r = g.rB;
  const zb = clamp(bat.z[A.bunt] / P.zGain, -2.5, 2.5);   // 번트 기술(원래 눈금)
  // 뜬 번트
  if (r.next() < Bp.pop * Math.exp(-Bp.popK * zb)) {
    const f = r.next() < 0.5 ? PO.P : PO.C; bkOut(g); bkPO(g, f); PL.res = R.OUT;
    if (g.bases[0] && g.outs < 3 && r.next() < 0.10) { bkOut(g); bkA(g, f); bkPO(g, PO.B1); g.bases[0] = null; }
    logBB(g, 30, 50, 0, 0, 10, 1.5, 6, 4, 0, 0.98); return;
  }
  const toFirstSide = !!g.bases[1] && !g.bases[0];
  const dirTarget = toFirstSide ? 30 : -30;
  const phi = dirTarget + 6 * clamp(1.4 - 0.4 * zb, 0.5, 2.4) * invN(r.next());
  const v = clamp(Bp.v + Bp.vSd * invN(r.next()) - Bp.vK * zb, 2.5, 12);
  const stop = v * v / (2 * Bp.friction * (g.park.surface === 'turf' ? 0.67 : 1));
  const sx = stop * Math.sin(phi * DEG), sy = stop * Math.cos(phi * DEG);
  // 수비: 투수·포수·1루·3루(코너 전진이면 5m 앞)
  let bestT = 99, bestF: number = PO.P;
  for (const f of [PO.P, PO.C, PO.B1, PO.B3]) {
    const pc = pcAt(D, f); const fy = g.fy[f] - (D.inf === 3 || type === 2 ? 5 : 0);
    const dist = Math.hypot(sx - g.fx[f], sy - fy);
    const t = 0.15 + 0.2 + dist / (pc.sprint * (f === PO.C ? 0.8 : 0.9)) + (f === PO.P ? 0.2 - 0.05 * pc.z[A.pFielding] : 0);
    const tBall = stop / Math.max(1, v / 2);
    const tt = Math.max(t, Math.min(tBall, t + 0.3));
    if (tt < bestT) { bestT = tt; bestF = f; }
  }
  const fpc = pcAt(D, bestF);
  PL.fielder = bestF;
  logBB(g, v * 3.6, -5, phi, sx, sy, bestT, 0, 4, 0, 1);
  const tB1 = batterTo(g, bat, 1) - (type === 3 ? 0.25 : 0) + 0.15;
  const rel = 0.35 + 0.1 * Math.max(0, -fpc.z[A.agility]);
  const tThrow = (b: number): number => bestT + rel + Math.hypot(BASE_X[b] - sx, BASE_Y[b] - sy) / throwSpeed(fpc, bestF, true);
  // 선행 주자 승부?
  const r1 = g.bases[0], r2 = g.bases[1], r3 = g.bases[2];
  // 선행 주자 포스 승부: 2루(1루 주자) · 3루(1·2루 주자) · 홈(만루). 스퀴즈 3루 주자는 투구와 함께 뛰어 홈 승부가 늦다
  let leadBase = -1, mLead = -9;
  if (r1) { const tr = arrive(g, O.pcs[r1.i], BL - leadOf(g, r1, 0), 0, 0.2, true); mLead = tr - tThrow(2); leadBase = 2; }
  if (r2 && r1) { const tr = arrive(g, O.pcs[r2.i], BL - leadOf(g, r2, 1), 0, 0.2, true); const m = tr - tThrow(3); if (m > mLead) { mLead = m; leadBase = 3; } }
  if (r3 && r2 && r1) { const tr = arrive(g, O.pcs[r3.i], BL - leadOf(g, r3, 2), 0, type === 4 ? -0.6 : 0.2, true); const m = tr - tThrow(0); if (m > mLead) { mLead = m; leadBase = 0; } }
  const errP = P.fld.errField * 0.8 * Math.exp(-P.fld.hands * fpc.z[A.hands]);
  if (r.next() < errP) { reachOnError(g, bestF, 0); return; }
  if (type !== 3 && leadBase >= 0 && mLead > P.bunt.leadMargin && g.outs < 2) {   // 확실할 때만 선행 주자(아니면 1루에서 확실한 아웃)
    // 선행 주자 포스 아웃 — 나머지는 밀려 한 베이스씩(만루면 3루 주자 득점), 스퀴즈 3루 주자는 득점
    bkOut(g); bkA(g, bestF); bkPO(g, leadBase === 2 ? PO.SS : leadBase === 3 ? PO.B3 : PO.C);
    const outR = leadBase === 2 ? r1 : leadBase === 3 ? r2 : r3;
    g.bases[0] = g.bases[1] = g.bases[2] = null;
    if (r3 && r3 !== outR) { if (type === 4 || (r1 && r2)) scoreR(g, r3, true); else g.bases[2] = r3; }
    if (r2 && r2 !== outR) g.bases[2] = r2;
    if (r1 && r1 !== outR) g.bases[1] = r1;
    g.bases[0] = newRunner(g, pa.b, true);
    PL.res = R.FC; return;
  }
  const m1 = tThrow(1) - tB1;
  if (safeMargin(g, m1, bat, false) < 0) {
    bkOut(g); bkA(g, bestF); bkPO(g, PO.B1);
    // 주자 진루(희생번트): 밀려나는 주자는 한 베이스씩, 스퀴즈(type 4)면 투구와 함께 뛴 3루 주자가 들어온다
    if (g.outs < 3) {
      const nb: (Runner | null)[] = [null, null, null];
      if (r3) { if (type === 4 || (r1 && r2)) scoreR(g, r3, true); else nb[2] = r3; }
      if (r2) { if (!nb[2]) nb[2] = r2; else nb[1] = r2; }
      if (r1) nb[1] = nb[1] ?? r1;
      g.bases[0] = null; g.bases[1] = nb[1]; g.bases[2] = nb[2];
    }
    PL.res = (r1 || r2 || r3) && type !== 3 ? R.SH : R.OUT; PL.sh = PL.res === R.SH;
  } else {
    // 번트 안타
    advanceForced(g, 1, true);
    if (r3 && type === 4 && g.bases[2] === r3) { g.bases[2] = null; scoreR(g, r3, true); }
    g.bases[0] = newRunner(g, pa.b, true);
    PL.res = R.S1; PL.hitBases = 1;
  }
}

// ═════════════ 도루·견제·폭투 ═════════════
/** 도루 판정: base = 도착 베이스(2·3). 반환 true = 세이프 */
export function stealPlay(g: G, base: number, pitchType: number, vPitch: number, vFF: number, H: number, pitchout: boolean): boolean {
  const D = defense(g), O = offense(g); const S = P.steal;
  const from = base - 2; const r = g.bases[from]!; const rpc = O.pcs[r.i];
  const ppc = D.pcs[D.pit.i], cpc = pcAt(D, PO.C);
  const jump = S.jump - S.jumpK * rpc.z[A.stealJump] + S.pickoffK * ppc.z[A.pickoff] + (ppc.throwsL && base === 2 ? S.lefty : 0) + S.jumpSd * invN(g.rR.next()) + r.jump;
  const lead = base === 2 ? Math.max(0, P.run.lead1 + P.run.lead1Jump * rpc.z[A.stealJump]) * (rpc.mech.leadMult ?? 1) : P.run.lead2b;
  const D0 = BL - lead - 1.0;
  const tRun = jump + D0 / runV(g, rpc) + tauOf(g, rpc, false) / 2 - 0.009 * (rpc.mech.sbPP ?? 0);
  const deliv = ppc.deliv + 0.42 * Math.max(0, vFF - vPitch) / Math.max(100, vPitch);
  const pop = (base === 2 ? cpc.pop : 0.85 * cpc.pop) + (H > 0 ? 0.15 : 0) + (g.rR.next() < S.wide * Math.exp(-S.wideK * cpc.z[A.armAcc]) ? 0.15 : 0) - (pitchout ? S.pitchout : 0);
  const tDef = deliv + pop + P.thr.tag;
  let pSafe = sig((tDef - tRun + S.slide * rpc.z[A.sliding]) / S.sig);
  if (hasT(cpc, TR.runnerKiller)) pSafe -= S.killer;
  const safe = g.rR.next() < pSafe;
  if (g.col?.steal) g.col.steal({ base, success: safe, combinedTime: deliv + (base === 2 ? cpc.pop : 0.85 * cpc.pop), pickoff: false });
  const bl = batLine(O, r.i); const fl = fldLine(D, PO.C); fl.SBA++;
  g.bases[from] = null;
  if (safe) {
    bl.SB++;
    // 포수 악송구
    if (g.rR.next() < S.err * Math.exp(-S.errK * cpc.z[A.armAcc])) { bkE(g, PO.C); if (base === 2 && !g.bases[2]) g.bases[2] = r; else scoreRunner(g, r); }
    else g.bases[base - 1] = r;
  } else { bl.CS++; fl.CSc++; bkOut(g); bkA(g, PO.C); bkPO(g, base === 2 ? PO.SS : PO.B3); }
  return safe;
}
function scoreRunner(g: G, r: Runner): void { bkRun(g, r, -1); }

/** 견제: 성공(아웃)이면 true */
export function pickoffPlay(g: G, base: number): boolean {
  const D = defense(g), O = offense(g); const Pk = P.pick;
  const r = g.bases[base - 1]!; const rpc = O.pcs[r.i]; const ppc = D.pcs[D.pit.i];
  const lm = rpc.mech.leadMult ?? 1;
  const pOut = (Pk.out * Math.exp(Pk.outPk * ppc.z[A.pickoff] - Pk.outJump * rpc.z[A.stealJump]) * lm ** 4 + (hasT(ppc, TR.pickoffArtist) ? 0.03 : 0)) * (base === 2 ? 0.5 : 1);
  const u = g.rR.next();
  if (u < pOut) {
    g.bases[base - 1] = null; bkOut(g); bkA(g, PO.P); bkPO(g, base === 1 ? PO.B1 : PO.SS);
    if (g.col?.steal) g.col.steal({ base, success: false, combinedTime: 0, pickoff: true });
    return true;
  }
  if (u < pOut + Pk.err * Math.exp(-0.4 * ppc.z[A.pickoff])) { bkE(g, PO.P); advanceAll(g, 1, false); }
  r.jump += 0.02;
  return false;
}
