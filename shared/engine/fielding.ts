// 수비 — 모든 판정은 "공이 거기 가는 시간" 과 "야수가 거기 가는 시간" 의 경주(11 설계 7장).
// 야수 위치(대형·쏠림) · 뜬공/라이너 도달·포구 · 땅볼 가로채기 · 굴러간 공 회수 · 송구 시간 · 실책
import { P } from './params.ts';
import { A, defZ, hasT, TR, type PC } from './player.ts';
import { clamp, sig } from './rng.ts';
import { gbTime, rollSpeed, rollStop, heightAtFrac, timeAtFrac, type Roll } from './batted.ts';
import { type G, type TeamSt, PO, BASE_X, BASE_Y } from './state.ts';

/** 구장 펜스: 각도 −45…45 → 거리·높이(1° 표, 경기 시작 때 1회) */
export function buildFence(g: G): void {
  const f = g.park.fence.slice().sort((a, b) => a.ang - b.ang);
  for (let k = 0; k <= 90; k++) {
    const ang = k - 45; let i = 0; while (i < f.length - 2 && ang > f[i + 1].ang) i++;
    const a = f[i], b = f[i + 1]; const u = clamp((ang - a.ang) / (b.ang - a.ang || 1), 0, 1);
    g.fenceD[k] = a.dist + (b.dist - a.dist) * u; g.fenceH[k] = a.h + (b.h - a.h) * u;
  }
}
export const fenceAt = (g: G, phi: number): number => g.fenceD[Math.max(0, Math.min(90, Math.round(phi + 45)))];
export const fenceHAt = (g: G, phi: number): number => g.fenceH[Math.max(0, Math.min(90, Math.round(phi + 45)))];
export const pcAt = (t: TeamSt, pos: number): PC => t.pcs[t.field[pos]];

/** 수비 대형: 기본 위치 + 쏠림(당김 성향·파워) + 상황 대형(내야 전진·병살·코너·시프트·선상, 외야 깊게·얕게·당겨·밀어·장타 방지) */
export function setAlignment(g: G, def: TeamSt, batter: PC, pullSign: number): void {
  const F = P.fld;
  for (let i = 0; i < 6; i++) { g.fx[i] = F.posX[i]; g.fy[i] = F.posY[i]; }
  // 내야 쏠림: 당김 쪽으로 3°·t_pull(최대 6°), 규정상 2루 양쪽 2명·흙 안
  // 시프트(inf 4): 당김 쪽으로 8° 더 — 2루 양쪽 2명 규정은 그대로 지킨다
  const shiftDeg = clamp(3 * batter.tPull * 2, -6, 6) * pullSign + (def.inf === 4 ? 8 * pullSign : 0);   // pullSign: 우타 −1(좌익 쪽), 좌타 +1
  if (shiftDeg !== 0) for (const i of [2, 3, 4, 5]) {
    const x = g.fx[i], y = g.fy[i]; const a = shiftDeg * Math.PI / 180;
    g.fx[i] = x * Math.cos(a) + y * Math.sin(a); g.fy[i] = -x * Math.sin(a) + y * Math.cos(a);
    if (i === 3 && g.fx[i] < 1.5) g.fx[i] = 1.5; if (i === 5 && g.fx[i] > -1.5) g.fx[i] = -1.5;   // 2루 양쪽 2명 규정
  }
  if (def.inf === 1) { g.fy[3] -= 1.5; g.fy[5] -= 1.5; g.fx[3] -= 1.5; g.fx[5] += 1.5; }
  else if (def.inf === 2) { for (const i of [2, 3, 4, 5]) g.fy[i] -= 6; }
  else if (def.inf === 3) { g.fy[2] -= 5; g.fy[4] -= 5; }
  else if (def.inf === 5) { g.fx[2] += 2.5; g.fy[2] += 1.5; g.fx[4] -= 2.5; g.fy[4] += 1.5; }   // 선상 수비 — 1·3루수가 라인 쪽 · 조금 뒤로
  const pw = clamp(batter.z[A.power], -2, 2.5);
  const ofShift = (def.of === 1 ? 6 : def.of === 2 ? -6 : def.of === 5 ? 9 : 0) + 2 * pw;
  const sh = 4 * batter.tPull * 2 * pullSign;
  const turn = def.of === 3 ? 8 * pullSign : def.of === 4 ? -8 * pullSign : 0;   // 외야 당겨치기 · 밀어치기 쪽으로
  for (const [i, base] of [[6, -F.ofAng], [7, 0], [8, F.ofAng]] as const) {
    const spread = def.of === 5 ? (i === 6 ? -4 : i === 8 ? 4 : 0) : 0;   // 장타 방지 — 깊게 + 좌우 외야수는 선상 쪽
    const ang = base + sh + turn + spread; const D = fenceAt(g, ang) * F.ofDepth + ofShift; const a = ang * Math.PI / 180;
    g.fx[i] = D * Math.sin(a); g.fy[i] = D * Math.cos(a);
  }
}

/** 이동 시간(반응 + 가속 τ 를 고려한 거리 D) */
export function travel(D: number, react: number, v: number, tau: number): number {
  if (D <= 0) return react;
  return react + (D >= v * tau / 2 ? D / v + tau / 2 : Math.sqrt(2 * D * tau / v));
}
/** 시간 t 안에 갈 수 있는 거리 */
export function reachIn(t: number, react: number, v: number, tau: number): number {
  const u = t - react; if (u <= 0) return 0;
  return u >= tau ? v * (u - tau / 2) : v * u * u / (2 * tau);
}

// ── 야수 능력(포지션 숙련 배율 적용) ──
export interface FAbil { react: number; v: number; tau: number; dive: number; reachH: number; hands: number; iq: number; ag: number }
/** 라이너 판단 지연(외야): 발사각이 낮을수록 낙구점 판단이 늦다 — running.ts 가 타구마다 설정 */
export const OFJ = { add: 0 };
const FA: FAbil = { react: 0, v: 0, tau: 0, dive: 0, reachH: 0, hands: 0, iq: 0, ag: 0 };
/** 뜬공·라이너 추격 능력(외야 공식 / 내야 공식) */
export function flyAbil(pc: PC, pos: number, rangeCh: number): FAbil {
  const F = P.fld; const zfs = defZ(pc, A.firstStep, pos), zr = defZ(pc, A.range, pos), ziq = pc.z[A.baseballIQ], zag = pc.z[A.agility];
  const sprint = pc.sprint * (1 + rangeCh * 0.5);
  if (pos >= 6) {
    FA.react = clamp(F.ofReact - F.ofReactFS * zfs - F.ofReactIQ * ziq, 0.25, 0.90) * (1 - 0.5 * rangeCh) + OFJ.add;
    FA.tau = Math.max(0.8, F.ofTau - F.ofTauAg * zag);
    FA.v = sprint * clamp(F.ofPath + F.ofPathR * zr + F.ofPathIQ * ziq, 0.80, 0.99);
  } else {
    FA.react = Math.max(0.10, F.ifFlyReact - F.ifFlyFS * zfs);
    FA.tau = F.ifFlyTau; FA.v = F.ifFlyV * sprint * (1 + 0.03 * zr);
    if (pos === PO.C) { FA.v *= 0.85; FA.react += 0.15; }
  }
  FA.dive = F.diveBase + F.diveAg * zag + (hasT(pc, TR.diver) ? 0.03 : 0);
  FA.reachH = 2.3 + 0.15 * zag + (hasT(pc, TR.highJump) ? 0.25 : 0);
  FA.hands = defZ(pc, A.hands, pos); FA.iq = ziq; FA.ag = zag;
  return FA;
}

/** t·x·y: 포구 시도 시각과 자리 — 뜬공은 낙구점·체공, 라이너를 길 위에서 막으면 공이 그 야수 깊이를 지나는 점·시각(2D 중계가 야수를 낙구점으로 뛰게 그리지 않도록) */
export interface CatchRes { f: number; p: number; m: number; t: number; dive: boolean; wallNear: boolean; line: boolean; x: number; y: number }
const CR: CatchRes = { f: -1, p: 0, m: -9, t: 0, dive: false, wallNear: false, line: false, x: 0, y: 0 };
const FP = new Float64Array(9), FM = new Float64Array(9), FDv = new Uint8Array(9), FLn = new Uint8Array(9), FLX = new Float64Array(9), FLY = new Float64Array(9), FLT = new Float64Array(9);
/** 뜬공 콜 우선순위(P,C,1B,2B,3B,SS,LF,CF,RF) */
const CALL_PRI = [1, 2, 3, 5, 4, 6, 8, 9, 8];
/**
 * 뜬공·라이너 포구 경주. (lx,ly) 낙구점, T 체공, d 비거리, phi 방향, kind 1 라이너·2 뜬공·3 팝업.
 * 라이너는 내야수가 공의 길 위(높이 ≤ 손 닿는 높이)에서 잡는 경우도 본다.
 * 반환: 가장 잡을 확률이 높은 야수와 그 확률(잡을 확률 기록용) */
export function flyCatch(g: G, def: TeamSt, lx: number, ly: number, T: number, d: number, phi: number, kind: number, fenceD: number, wx: { sunPen: number; fogMult: number; gustMult: number }, rangeCh: number): CatchRes {
  CR.f = -1; CR.p = 0; CR.m = -9; CR.t = T; CR.dive = false; CR.wallNear = false; CR.line = false; CR.x = lx; CR.y = ly;
  const sinp = Math.sin(phi * Math.PI / 180), cosp = Math.cos(phi * Math.PI / 180);
  const wallNear = d > fenceD - 3;
  for (let pos = 0; pos <= 8; pos++) {
    const pc = pcAt(def, pos); const ab = flyAbil(pc, pos, rangeCh);
    const fx = g.fx[pos], fy = g.fy[pos];
    // ① 낙구점 도달
    const D = Math.hypot(lx - fx, ly - fy) - 0.5;
    const tCatch = T - 0.08;
    const back = pos <= 5 && Math.hypot(lx, ly) > Math.hypot(fx, fy) + 4;
    const need = back ? travel(D, ab.react + P.fld.ifBackReact, ab.v * P.fld.ifBackV, ab.tau) : travel(D, ab.react, ab.v, ab.tau);
    let m = tCatch - need + ab.dive;
    let p = sig(m / P.fld.catchSig);
    let dive = m - ab.dive < 0 && m > 0;
    if (wallNear && pos >= 6) p *= clamp(P.fld.wallK + P.fld.wallIQ * ab.iq + (hasT(pc, TR.wallClimber) ? 0.05 : 0), 0.5, 1);
    if (kind === 3 && pos >= 6 && d < 50) p *= 0.85;                     // 내야 팝업은 외야수가 양보
    let line = false; FLX[pos] = lx; FLY[pos] = ly; FLT[pos] = T;
    // ② 라이너: 내야수가 공의 길 위에서(깊이 s_p, 옆 거리 L)
    if (kind <= 1 && pos <= 5 && pos !== PO.C) {
      const sp = fx * sinp + fy * cosp, L = Math.abs(fx * cosp - fy * sinp);
      if (sp > 4 && sp < d) {
        const f = sp / d; const h = heightAtFrac(f);
        if (h <= ab.reachH + 0.6) {
          const tb = timeAtFrac(f, T);
          const latV = P.fld.ifLat + P.fld.ifLatR * defZ(pc, A.range, pos);
          const reach = 1.2 + (h > ab.reachH ? -0.6 * (h - ab.reachH) / 0.6 : 0);
          const tn = Math.max(0.08, 0.15 - 0.03 * defZ(pc, A.firstStep, pos)) + Math.max(0, L - reach) / latV;
          const ml = tb - tn + (L > reach ? 0.08 + 0.03 * ab.ag : 0);
          const pl = sig(ml / P.fld.lineSig) * (h > ab.reachH ? 0.6 : 1);
          if (pl > p) { p = pl; m = ml; line = true; dive = L > reach + 0.5; FLX[pos] = sp * sinp; FLY[pos] = sp * cosp; FLT[pos] = tb; }
        }
      }
    }
    FP[pos] = p; FM[pos] = m; FDv[pos] = dive ? 1 : 0; FLn[pos] = line ? 1 : 0;
    if (p > CR.p) { CR.f = pos; CR.p = p; CR.m = m; CR.dive = dive; CR.line = line; CR.x = FLX[pos]; CR.y = FLY[pos]; CR.t = FLT[pos]; }
  }
  // 콜 우선순위: 여럿이 쉽게 잡을 공(뜬공·팝업)은 외야수(중견수 우선) > 유격수 > 2루수 > 3루수 > 1루수 > 포수 > 투수 — 뒤로 뛰는 내야수보다 앞으로 오는 외야수가 잡는다
  if (CR.f >= 0 && !CR.line && CR.p >= 0.9) {
    let bp = CR.f, pri = CALL_PRI[CR.f];
    for (let pos = 0; pos <= 8; pos++) if (FP[pos] >= 0.9 && FP[pos] >= CR.p - 0.03 && !FLn[pos] && CALL_PRI[pos] > pri && !(kind === 3 && d < 50 && pos >= 6)) { bp = pos; pri = CALL_PRI[pos]; }
    if (bp !== CR.f) { CR.f = bp; CR.p = FP[bp]; CR.m = FM[bp]; CR.dive = FDv[bp] === 1; CR.line = false; CR.x = lx; CR.y = ly; CR.t = T; }
  }
  CR.wallNear = wallNear;
  // 햇빛·안개·돌풍 낙구 판단 실수(도달한 공에만)
  if (CR.f >= 0 && !CR.line) {
    const pc = pcAt(def, CR.f);
    let miss = 0;
    if (CR.f >= 2 && wx.sunPen > 0) miss += wx.sunPen * pc.wxT[3] * (1 - 0.3 * Math.min(1, (pc.v ? 0 : 0) / 120));
    if (wx.fogMult > 1) miss += P.fld.fogAdd * (wx.fogMult - 1) * 2.5 * pc.wxT[5];
    if (wx.gustMult > 1) CR.p *= 1 - (wx.gustMult - 1) * 0.05 * pc.wxT[4];
    CR.p *= 1 - miss;
  }
  return CR;
}

export interface GroundRes { f: number; s: number; t: number; x: number; y: number; dive: boolean; vAt: number }
const GR: GroundRes = { f: -1, s: 0, t: 0, x: 0, y: 0, dive: false, vAt: 0 };
/**
 * 땅볼 가로채기: 공의 길 위 점 s 를 1m 간격으로, 야수가 공보다 먼저(또는 같이) 닿는 가장 이른 점.
 * sAir/tAir: 첫 바운드 전 공중 거리·시간(낮은 라이너성 땅볼). 내야수(투수 포함)만. 못 잡으면 f = −1(외야로 빠짐). */
export function groundIntercept(g: G, def: TeamSt, phi: number, v0: number, roll: Roll, sAir: number, tAir: number, rangeCh: number, chopDelay: number): GroundRes {
  GR.f = -1; GR.t = 99;
  const sinp = Math.sin(phi * Math.PI / 180), cosp = Math.cos(phi * Math.PI / 180);
  const F = P.fld;
  const sStop = sAir + rollStop(v0, roll);
  const tStop = tAir + chopDelay + Math.atan(v0 * Math.sqrt(roll.k / roll.c)) / Math.sqrt(roll.c * roll.k);
  // 야수마다 가장 이른 가로채기 → 가장 이른 사람. 단 투수·포수가 가장 이르더라도 내야수(1·2·3루·유격)가 pYield 초 안에 닿으면 내야수가 처리
  // (실제로도 느린 땅볼·바운드 큰 공은 3루수·1루수가 달려 나와 '내 공' 하고 잡는다 — 전에는 투수가 내야 땅볼의 28%를 처리했다)
  let bestT = 99;
  for (let pos = 0; pos <= 5; pos++) {
    GT[pos] = 99;
    if (pos === PO.C && sStop > 8) continue;
    const pc = pcAt(def, pos);
    const fx = g.fx[pos], fy = g.fy[pos];
    const sp = fx * sinp + fy * cosp, L = Math.abs(fx * cosp - fy * sinp);
    if (L > 22) continue;
    const zfs = defZ(pc, A.firstStep, pos), zr = defZ(pc, A.range, pos), zag = pc.z[A.agility];
    // 투수는 던진 뒤 자세(팔로스루)라 반응이 늦고, 자기 옆을 지나가는 공만 막는다(뒤로 쫓아가 줍는 건 2루수·유격수 몫)
    const react = clamp(F.ifReact - F.ifReactFS * zfs, 0.10, 0.45) * (1 - 0.5 * rangeCh) + (pos === 0 ? P.fld.pReact : 0);
    const lat = (F.ifLat + F.ifLatR * zr + F.ifLatS * pc.z[A.speed]) * (1 + 0.5 * rangeCh) * (pos === 0 ? 0.85 : pos === PO.C ? 0.8 : 1);
    // 투수는 마운드에서 균형이 무너진 채라 손이 닿는 거리·다이빙이 짧다(pReach)
    const reach = F.reach * (pos === 0 ? P.fld.pReach : 1), dreach = (F.diveReach + F.diveReachAg * zag + (hasT(pc, TR.diver) ? 0.3 : 0)) * (pos === 0 ? P.fld.pReach * 0.8 : 1);
    // 찍힌 공(촙)은 홈 앞에서 크게 튀어 첫 바운드 동안(≈ pHop·초속 m) 투수 머리 위로 지나간다 — 투수는 그 뒤에만 잡는다
    const sLo = Math.max(sAir + 0.5, sp - 7, pos === 0 && chopDelay > 0 ? P.fld.pHop * v0 : 0), sHi = Math.min(pos === 0 ? Math.min(30, sp + P.fld.pBehind) : 50, sp + 14, sStop);
    let got = false;
    for (let s = sLo; s <= sHi; s += 1) {
      const tb = tAir + chopDelay + gbTime(s - sAir, v0, roll);
      if (tb > bestT + P.fld.pYield) { got = true; break; }
      const dist = Math.hypot(L, s - sp);
      const tf = travel(dist - reach, react, lat, F.ifTau);
      if (tf <= tb) { GT[pos] = tb; GS[pos] = s; GD[pos] = 0; GV[pos] = rollSpeed(s - sAir, v0, roll); got = true; break; }
      const tfd = travel(dist - reach - dreach, react, lat, F.ifTau);
      if (tfd <= tb) { GT[pos] = tb; GS[pos] = s; GD[pos] = 1; GV[pos] = rollSpeed(s - sAir, v0, roll); got = true; break; }
    }
    // 공이 그의 범위 안에서 멈추면 가서 줍는다(느린 땅볼)
    if (!got && sStop < Math.min(pos === 0 ? Math.min(30, sp + P.fld.pBehind + 2) : 50, sp + 14) && sStop >= sAir) {
      const x = sStop * sinp, y = sStop * cosp;
      const t = Math.max(tStop, travel(Math.hypot(x - fx, y - fy) - reach, react, lat * 1.2, F.ifTau)) + 0.1;
      if (t < GT[pos]) { GT[pos] = t; GS[pos] = sStop; GD[pos] = 0; GV[pos] = 0; }
    }
    if (GT[pos] < bestT) bestT = GT[pos];
  }
  let f = -1; for (let pos = 0; pos <= 5; pos++) if (GT[pos] < 99 && (f < 0 || GT[pos] < GT[f])) f = pos;
  if (f === PO.P || f === PO.C) { let alt = -1; for (let pos = 2; pos <= 5; pos++) if (GT[pos] < GT[f] + P.fld.pYield && (alt < 0 || GT[pos] < GT[alt])) alt = pos; if (alt >= 0) f = alt; }
  if (f >= 0) { GR.f = f; GR.s = GS[f]; GR.t = GT[f]; GR.dive = GD[f] === 1; GR.x = GS[f] * sinp; GR.y = GS[f] * cosp; GR.vAt = GV[f]; }
  return GR;
}
const GT = new Float64Array(6), GS = new Float64Array(6), GD = new Uint8Array(6), GV = new Float64Array(6);

export interface RetrRes { f: number; t: number; x: number; y: number; wall: boolean }
const RR: RetrRes = { f: -1, t: 0, x: 0, y: 0, wall: false };
/**
 * 굴러간 공 회수: s0 지점(시각 t0)에서 속도 vb 로 감속(λ)하며 방향 phi 로. 외야수(+ 얕으면 내야수)가 길목을 끊는다.
 * 담장(fenceD)에 닿으면 튕겨 담장 앞에 멈춘다. */
export function retrieve(g: G, def: TeamSt, phi: number, s0: number, t0: number, vb: number, roll: Roll, fenceD: number, wallBounce: number, rangeCh: number): RetrRes {
  RR.f = -1; RR.t = 99; RR.wall = false;
  const sinp = Math.sin(phi * Math.PI / 180), cosp = Math.cos(phi * Math.PI / 180);
  const sWall = fenceD - 0.5;
  const sStop = s0 + rollStop(Math.max(0.3, vb), roll);
  const tWall = s0 >= sWall ? t0 : sStop > sWall ? t0 + gbTime(sWall - s0, Math.max(0.3, vb), roll) : 99;
  const stopAt = sStop < sWall ? sStop : sWall - (2 + 3 * wallBounce);
  for (let pos = 2; pos <= 8; pos++) {
    if (pos <= 5 && (s0 > 55 || vb > P.fld.ifRetrV)) continue;   // 내야수는 느리게 빠져나간 공만 쫓아가 줍는다(세게 빠진 땅볼은 외야수 몫)
    const pc = pcAt(def, pos); const ab = flyAbil(pc, pos, rangeCh);
    const fx = g.fx[pos], fy = g.fy[pos];
    let found = false;
    for (let s = Math.max(s0, 1); s < sWall; s += 1.5) {
      if (s > stopAt + 0.01 && !(tWall < 99)) break;
      const tb = t0 + (s > s0 ? gbTime(s - s0, Math.max(0.3, vb), roll) : 0);
      if (tb > RR.t || tb === Infinity) break;
      const tf = travel(Math.hypot(s * sinp - fx, s * cosp - fy) - 1.0, ab.react, ab.v, ab.tau);
      if (tf <= tb) { const vAt = s > s0 ? rollSpeed(s - s0, Math.max(0.3, vb), roll) : vb; const tt = tb + P.fld.pickup + (vAt > 6 ? 0.04 * (vAt - 6) : 0); if (tt < RR.t) { RR.f = pos; RR.t = tt; RR.x = s * sinp; RR.y = s * cosp; RR.wall = false; } found = true; break; }
    }
    if (!found) {
      // 담장까지 간 공: 담장 앞 멈춘 지점으로
      const s = Math.min(stopAt, sWall); const x = s * sinp, y = s * cosp;
      const tf = travel(Math.hypot(x - fx, y - fy) - 1.0, ab.react, ab.v, ab.tau);
      const tStopB = t0 + Math.atan(Math.max(0.3, vb) * Math.sqrt(roll.k / roll.c)) / Math.sqrt(roll.c * roll.k);
      const tt = sStop < sWall ? Math.max(tf, tStopB) + 0.3 : Math.max(tf, tWall + 0.6) + P.fld.wallPick;
      if (tt < RR.t) { RR.f = pos; RR.t = tt; RR.x = x; RR.y = y; RR.wall = sStop >= sWall; }
    }
  }
  if (RR.f < 0) {   // 안전장치: 어떤 경우에도 가장 가까운 외야수가 공을 줍는다(이전 값 재사용 금지 — 결정성)
    const x = s0 * sinp, y = s0 * cosp; let best = 7, bt = 1e9;
    for (let pos = 6; pos <= 8; pos++) { const ab = flyAbil(pcAt(def, pos), pos, rangeCh); const tf = travel(Math.hypot(x - g.fx[pos], y - g.fy[pos]) - 1.0, ab.react, ab.v, ab.tau); if (tf < bt) { bt = tf; best = pos; } }
    RR.f = best; RR.t = Math.max(bt, t0) + P.fld.wallPick; RR.x = x; RR.y = y; RR.wall = true;
  }
  return RR;
}

/** 송구 속도(m/s) */
export function throwSpeed(pc: PC, pos: number, hurry: boolean): number {
  const vmax = P.thr.vBase[Math.min(8, pos)] + P.thr.arm * pc.z[A.armStr];
  return vmax * (hurry ? P.thr.hurry : P.thr.normal);
}
/** 송구 전 동작(초) */
export function releaseTime(pc: PC, pos: number, dive: boolean): number {
  const T = P.thr;
  let r = pos >= 6 ? T.relOF - T.relOFAg * pc.z[A.agility] - (pc.mech.ofHoldPP ?? 0) * 0.010 : T.relIF - T.relIFAg * pc.z[A.agility] - T.relIFIQ * pc.z[A.baseballIQ];
  if (hasT(pc, TR.quickThrow)) r -= 0.15;
  if (dive) r += pos >= 6 ? (pc.mech.quickStand ? 0.25 : 0.45) : (pc.mech.diveThrow ? P.fld.diveRec - 0.2 : P.fld.diveRec);
  return Math.max(0.25, r);
}
/** (x,y) 에서 베이스 b(0 홈,1,2,3)까지 송구 비행 시간 — 60m 넘으면 중계와 원바운드 중 빠른 쪽 */
export function throwFlight(def: TeamSt, pc: PC, pos: number, x: number, y: number, b: number, hurry: boolean): number {
  const D = Math.hypot(BASE_X[b] - x, BASE_Y[b] - y);
  const v = throwSpeed(pc, pos, hurry);
  const direct = D / v * (1 + P.thr.arc * D / 30);
  if (D <= P.thr.relayDist) return direct;
  const bounce = D / (v * P.thr.bounce);
  const cut = pcAt(def, x < 0 ? PO.SS : PO.B2);
  const d1 = D * 0.62, d2 = D - d1;
  const relay = d1 / v * (1 + P.thr.arc * d1 / 30) + P.thr.relay - 0.05 * def.chemTier / 3 + d2 / throwSpeed(cut, PO.SS, true) * (1 + P.thr.arc * d2 / 30);
  return Math.min(direct, bounce, relay);
}
/** 송구 실책 확률 */
export function throwErrP(pc: PC, pos: number, D: number, hurry: boolean, rainLv: number, cErr: number): number {
  return P.fld.errThrow * Math.exp(-P.fld.armAcc * defZ(pc, A.armAcc, pos)) * Math.sqrt(Math.max(0.3, D / 30)) * (hurry ? 1.8 : 1) * P.fld.errRainThrow[rainLv] * Math.exp(cErr) * (hasT(pc, TR.showArm) ? 1.6 : 1);
}
