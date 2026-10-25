// 투구 하나 — 구종 선택(카운트·약점·기억·포수) → 의도(가운데/가장자리/밖) → 실제 위치(커맨드·제구·피로·비)
// → 노림수·지각(착시·터널링) → 스윙 → 판정(사람 심판·프레이밍 / ABS) → 접촉(오즈비) → 파울/인플레이 → 몸맞공·폭투·포일 (11 설계 5장)
// 투구마다 고정 슬롯 16개(P 스트림)를 언제나 뽑는다 → 개입·반사실 계산에도 다른 공의 난수가 밀리지 않는다.
import { P } from './params.ts';
import { A, HD, CH, hasT, TR, type PC, type PitchC } from './player.ts';
import { sub, invN, sig, clamp } from './rng.ts';
import { type G, PO, offense, defense, basesCode } from './state.ts';
import { pitchHeadwind } from './weather.ts';
import { leverage } from './we.ts';

export const KIND = { P: 0x11, R: 0x22, B: 0x33, A: 0x44, W: 0x55 } as const;
const SL = new Float64Array(16);
/** 투구 결과 코드(테이프와 같은 번호) */
export const PR = { BALL: 0, CALLED: 1, WHIFF: 2, FOUL: 3, TIP: 4, INPLAY: 5, HBP: 6, AUTO_B: 7, AUTO_S: 8, PITCHOUT: 9, BUNT_FOUL: 10, BUNT_MISS: 11, FOULOUT: 12, TIP_K: 13 } as const;
/** 이번 투구의 값(재사용 객체) */
export const PT = {
  type: 0, pi: 0, x: 0, z: 0, d: 0, inZone: false, vRel: 0, vPlate: 0, vPerc: 0, intent: 0, swing: false, contact: false, foul: false, inPlay: false,
  called: false, hbp: false, tip: false, wild: false, wp: false, pb: false, H: 0, guessHit: false, guessMiss: false, insideCm: 0, f: 0, move: 1,
  zs: 0, zcEff: 0, bunt: false, frame: false, outFoul: false, res: 0,
};
const W = new Float64Array(6), WF = new Float64Array(4);
const fracU = (u: number, k: number): number => { const x = u * k; return x - Math.floor(x); };

/** 포수 리드·볼배합 질 */
function gqOf(c: PC, p: PC): number { return clamp(0.55 + 0.25 * c.z[A.pitcherLead] + 0.10 * p.z[A.baseballIQ], 0.1, 1.0); }

/** 채널 합성: 물리층·심리층 tanh 상한, 최종 안전장치 [12·11 4.4] */
export function capCh(phys: number, psy: number): number {
  const e = P.ev; const x = e.capPhys * Math.tanh(phys / e.capPhys) + e.capPsy * Math.tanh(psy / e.capPsy);
  return clamp(x, -e.san, e.san);
}

/** 타석 시작: 타자·투수·포수 문맥 한 번 계산(플래툰·압박감·채널) */
export function beginPA(g: G, evPhys: Float64Array, evPsy: Float64Array, evPPhys: Float64Array, evPPsy: Float64Array): void {
  const O = offense(g), D = defense(g); const pa = g.pa;
  pa.b = O.order[O.next]; pa.p = D.pit.i; pa.c = D.field[PO.C];
  const b = O.pcs[pa.b], p = D.pcs[pa.p], c = D.pcs[pa.c];
  pa.pL = p.throwsL; pa.bL = b.bats === 1 || (b.bats === 2 && !p.throwsL); pa.same = pa.bL === pa.pL;
  pa.zCon = p.throwsL ? b.zConL : b.zConR;
  pa.zPow = b.z[A.power]; pa.zEye = b.z[A.eye]; pa.zK = b.z[A.avoidK]; pa.zFast = b.z[A.vsFast]; pa.zBreak = b.z[A.vsBreak]; pa.zIQ = b.z[A.baseballIQ]; pa.zAg = b.z[A.agility];
  if (pa.same && b.split > 0) { pa.zPow -= P.platoon.batPow * b.split / 2 / P.scale[A.power]; pa.zEye -= P.platoon.batEye * b.split / 2 / P.scale[A.eye]; }
  const hz = b.height * b.zoneMult;
  pa.top = P.zone.top * hz; pa.bot = P.zone.bot * b.height; pa.HH = (pa.top - pa.bot) / 2; pa.zMid = (pa.top + pa.bot) / 2;
  // 승부처·압박감
  const bc = basesCode(g);
  pa.li = leverage(g.inning, g.half, g.outs, bc, g.score[1] - g.score[0], P.ai.liNorm, g.maxInn);
  const risp = (bc & 6) !== 0;
  let pb = b.h[HD.pressure]; if (risp && hasT(b, TR.clutchBat)) pb = Math.max(pb, b.sigBat === 'clutchKing' ? 17 : 16);
  let pp = p.h[HD.pressure]; if (risp && hasT(p, TR.bigHeart)) pp = Math.max(pp, 16);
  const L = clamp(pa.li - 1, 0, 3);
  pa.press = L * (pb - 10) * P.ctx.pressure / 10 - L * (pp - 10) * P.ctx.pressure / 10;   // 타자 컨택 z 순효과
  pa.zCon += L * (pb - 10) * P.ctx.pressure / 10;
  // 채널(상태·이벤트) — 타자
  pa.cCon = capCh(b.chP[CH.contact] + evPhys[CH.contact], b.chS[CH.contact] + evPsy[CH.contact]);
  pa.cPow = capCh(b.chP[CH.power] + evPhys[CH.power], b.chS[CH.power] + evPsy[CH.power]);
  pa.cEye = capCh(b.chP[CH.eye] + evPhys[CH.eye], b.chS[CH.eye] + evPsy[CH.eye]);
  pa.cAggr = capCh(b.chP[CH.aggr] + evPhys[CH.aggr], b.chS[CH.aggr] + evPsy[CH.aggr]);
  // 투수
  pa.cStuff = capCh(p.chP[CH.stuff] + evPPhys[CH.stuff], p.chS[CH.stuff] + evPPsy[CH.stuff]) - L * (pp - 10) * P.ctx.pressure / 10 * 0;
  pa.cCtl = capCh(p.chP[CH.control] + evPPhys[CH.control], p.chS[CH.control] + evPPsy[CH.control]);
  pa.cVelo = p.chP[CH.velo] + evPPhys[CH.velo];
  pa.cErr = clamp(evPPsy[CH.error] + evPPhys[CH.error], -0.47, 0.47);
  // 기억
  const key = pa.b * 64 + pa.p; let m = O.mem.get(key); if (!m) { m = [0, 0, 0, 0, 0, 0, 0, 0, 0]; O.mem.set(key, m); }
  let tm = O.teamMem.get(pa.p); if (!tm) { tm = [0, 0, 0, 0, 0, 0, 0, 0, 0]; O.teamMem.set(pa.p, tm); }
  pa.mem = m; pa.tmem = tm;
  pa.gq = gqOf(c, p);
  // 결정구: 직구 아닌 공 중 위력 최고
  let best = -9, op = -1; for (let i = 0; i < p.pitches.length; i++) { const x = p.pitches[i]; if (P.pt.fam[x.t] !== 0 && x.zs > best) { best = x.zs; op = i; } }
  pa.outPitch = op;
  let vff = p.velo; for (const x of p.pitches) if (x.t === 0) { vff = p.velo; break; }
  pa.vFF = vff;
  pa.countsSeen = 1; pa.prevType = -1; pa.prevV = 0; pa.run = 0; pa.pitches = 0;
  pa.hot = (hasT(b, TR.lowBallHitter) ? 1 : 0) + (hasT(b, TR.highBallHitter) ? 2 : 0);
}

/** 투수 실효(피로·첫 이닝·압박) — 투구마다 */
function pitcherNow(g: G): { over: number; veloLoss: number; first: number } {
  const D = defense(g); const ps = D.pit; const p = D.pcs[ps.i];
  const over = Math.max(0, ps.F - p.limit);
  const vl = (P.fat.perPitch * Math.min(ps.F, p.limit) + P.fat.overVelo * over) * (P.fat.strengthA - P.fat.strengthB * p.v[A.strength]) + ps.b2bLoss;
  const first = hasT(p, TR.slowStarter) ? (ps.curInning === g.inning && g.inning === 1 && ps.starter ? -0.4 : 0.1) : 0;
  PN.over = over; PN.veloLoss = vl; PN.first = first;
  return PN;
}
const PN = { over: 0, veloLoss: 0, first: 0 };

/**
 * 투구 하나를 계산해 PT 를 채우고 결과 코드를 돌려준다(카운트·주자 처리는 game.ts).
 * mode: 0 보통 · 1 히트앤런 · 2 희생번트 · 3 기습번트 · 4 스퀴즈 · 5 기다려 · 7 피치아웃
 */
export function throwPitch(g: G, pitchout: boolean): number {
  const O = offense(g), D = defense(g); const pa = g.pa;
  const b = O.pcs[pa.b], p = D.pcs[pa.p], c = D.pcs[pa.c];
  const r = sub(g.rP, g.seed, KIND.P, g.paNo, g.pitchInPA);
  for (let i = 0; i < 16; i++) SL[i] = r.next();
  const bs = g.balls, st = g.strikes, ci = bs * 3 + st;
  const sl = g.slot; const rainLv = sl.rainLv;
  const pn = pitcherNow(g);
  const T = PT; T.wp = false; T.pb = false; T.hbp = false; T.tip = false; T.swing = false; T.contact = false; T.foul = false; T.inPlay = false; T.called = false; T.guessHit = false; T.guessMiss = false; T.bunt = false; T.frame = false; T.outFoul = false; T.wild = false;
  // ── 0. 구종 선택 ──
  const np = p.pitches.length;
  const hs = pa.same ? 1 : -1; const gq = pa.gq;
  const r3 = !!g.bases[2]; const blockC = c.v[A.block];
  const mix = (D.tac.pit && D.tac.pit[p.id]?.mix) ?? 0;
  let wsum = 0;
  for (let i = 0; i < np; i++) {
    const x = p.pitches[i]; const fam = P.pt.fam[x.t];
    let be = Math.log(x.use) + (fam === 0 ? P.count.FB[ci] + P.sel.fastBase : 0) + P.sel.bias[x.t];
    be += P.sel.platoon * (P.pt.platoon[x.t] + p.slotPlat) * hs * 0.5;
    const zb = fam === 0 ? pa.zFast : pa.zBreak; be += P.sel.weak * gq * clamp(-zb, -1.5, 1.5) * (fam === 0 ? 1 : 0.6);
    const f = Math.max(pa.mem[x.t], pa.tmem[x.t]); be -= P.sel.mem * gq * f;
    if (pa.prevType === x.t) be -= P.sel.repeat * Math.max(0, pa.run - 1);
    be += P.sel.stuff * x.zs;
    if (st === 2 && i === pa.outPitch) be += P.sel.outPitch;
    if (r3 && P.pt.bd[x.t] > 0 && !hasT(c, TR.blockMaster)) be -= P.sel.block * P.pt.bd[x.t] * (x.sig === 1 ? 1.3 : x.sig === 9 ? 1.4 : 1) * Math.max(0, (55 - blockC) / 25);
    be += P.sel.mix * mix * (fam === 0 ? 1 : -1);
    if (rainLv > 0) be -= P.sel.rain * rainLv * Math.max(0, P.pt.rainGrip[x.t] - 1);
    if (fam === 0 && hasT(p, TR.fastballReliant)) be += Math.log(1 + 0.12 / Math.max(0.1, x.use));
    if (x.sig === 8) be -= 2.5;   // 이퓨스 사용 상한
    const w = Math.exp(be); W[i] = w; wsum += w;
  }
  let u = SL[0] * wsum, pi = 0; while (pi < np - 1 && u >= W[pi]) { u -= W[pi]; pi++; }
  const pc: PitchC = p.pitches[pi]; const t = pc.t; const fam = P.pt.fam[t];
  T.type = t; T.pi = pi;
  // 계열별 실제 확률(노림수용)
  WF[0] = WF[1] = WF[2] = WF[3] = 0; for (let i = 0; i < np; i++) WF[P.pt.fam[p.pitches[i].t]] += W[i] / wsum;
  // ── 1. 의도 ──
  const tp = D.tac.pit?.[p.id];
  let s = P.count.s[ci] + P.count.zoneAdj[ci]
    + (hasT(p, TR.quickWorker) ? P.intent.quick : 0) + (hasT(p, TR.nibbler) ? P.intent.nibble : 0) - 0.08 * (tp?.chase ?? 0)
    + (D.tac.calling === 'attack' ? P.intent.calling : D.tac.calling === 'nibble' ? -P.intent.calling : 0)
    + P.intent.eye * gq * pa.zEye;
  if (!g.bases[0] && pa.zPow > 0) { const J = tp?.jam === 'pitchAround' ? 2 : tp?.jam === 'challenge' ? 0 : 1; s -= P.intent.around * pa.zPow * Math.min(1, pa.li / 2) * J; }
  // 타자의 접근법을 배터리가 읽는다(포수 리드 gq 만큼) [18 재미·악용 심사]: 기다리는 타자에겐 존 안으로 밀어붙이고, 장타를 노리는 타자에겐 조심
  // — 전에는 접근법에 맞대응이 없어 '모든 타석 기다려(patient)'·'모든 타석 장타(power)'가 AI 기본보다 승률 +3.8·+4.6%p 인 정답이었다
  if (pa.approach === 2) s += P.intent.vsPatient * gq; else if (pa.approach === 3) s -= P.intent.vsPower * gq;
  s = clamp(s, -0.3, 1.1);
  let ph = P.intent.s0[0] + s * (P.intent.s1[0] - P.intent.s0[0]), pe = P.intent.s0[1] + s * (P.intent.s1[1] - P.intent.s0[1]), po = P.intent.s0[2] + s * (P.intent.s1[2] - P.intent.s0[2]);
  ph = Math.max(0, ph); pe = Math.max(0, pe); po = Math.max(0, po); const sumI = ph + pe + po; ph /= sumI; pe /= sumI;
  const intent = pitchout ? 3 : SL[1] < ph ? 0 : SL[1] < ph + pe ? 1 : 2;
  T.intent = intent;
  // ── 2·3. 목표점 ──
  const HW = P.zone.halfW, HH = pa.HH, zm = pa.zMid;
  const gloveSign = p.throwsL ? -1 : 1;          // 우투 글러브 쪽 = 1루 쪽(+x)
  const inSign = pa.bL ? 1 : -1;                  // 타자 몸쪽 방향(x 부호)
  let tx = 0, tz = zm;
  if (intent === 0) { const sh = P.loc.heartShrink; tx = (SL[2] * 2 - 1) * (HW - sh); tz = zm + (SL[3] * 2 - 1) * Math.max(2, HH - sh); }
  else if (intent === 3) { tx = -inSign * (HW + 45); tz = zm + 10; }
  else {
    const sd = P.pt.side[t];
    let wU = sd[0], wD = sd[1], wG = sd[2], wA = sd[3];
    // 몸쪽 승부 전술·특성: 몸쪽 변 가중
    const insideTac = (tp?.inside ?? 0) + (hasT(p, TR.brushback) ? 1 : 0);
    if (insideTac) { if (gloveSign === inSign) wG *= 1 + 0.25 * insideTac; else wA *= 1 + 0.25 * insideTac; }
    if (pa.hot & 1) wD *= Math.exp(-0.4 * gq); if (pa.hot & 2) wU *= Math.exp(-0.4 * gq);
    const tot = wU + wD + wG + wA; let v = SL[4] * tot; let side = 0; if (v < wU) side = 0; else if ((v -= wU) < wD) side = 1; else if ((v -= wD) < wG) side = 2; else side = 3;
    const along = SL[3] * 2 - 1;
    if (intent === 1) {
      const dep = P.loc.edgeIn[0] + (P.loc.edgeIn[1] - P.loc.edgeIn[0]) * SL[2];
      if (side === 0) { tz = zm + HH - dep; tx = along * (HW - 2); } else if (side === 1) { tz = zm - HH + dep; tx = along * (HW - 2); }
      else { const sx = side === 2 ? gloveSign : -gloveSign; tx = sx * (HW - dep); tz = zm + along * (HH - 2); }
    } else {
      const far = fracU(SL[2], 7) < P.loc.farShare; const lo = far ? P.loc.outFar[0] : P.loc.outNear[0], hi = far ? P.loc.outFar[1] : P.loc.outNear[1];
      const out = lo + (hi - lo) * SL[2];
      if (side === 0) { tz = zm + HH + out; tx = along * HW; } else if (side === 1) { tz = zm - HH - out; tx = along * HW; }
      else { const sx = side === 2 ? gloveSign : -gloveSign; tx = sx * (HW + out); tz = zm + along * HH; }
    }
  }
  // ── 4. 실제 위치 ──
  const zCtl = p.z[A.control] - 0.015 * pn.over + pa.cCtl * 0 + (c.z[A.pitcherLead] * 0.02);
  let zCmd = pc.zc - 0.025 * pn.over + 0.02 * c.z[A.pitcherLead];
  const tRain = rainLv > 0 ? 1 + (P.wx.rainSig[rainLv + 1] - 1) * p.wxT[2] : 1;
  const heat = (sl.atC > 34 ? 1 + (P.wx.heatSig - 1) * p.wxT[0] : 1) * (sl.tC < 15 ? 1 + P.wx.coldCtl * (15 - sl.tC) * p.wxT[1] : 1);
  const footing = P.wx.footing[sl.field];
  const pWild = P.loc.pWild * Math.exp(-P.loc.ctlK * zCtl - P.ev.ctlWild * pa.cCtl) * (1 + P.fat.overWild * pn.over) * tRain * footing * (sl.atC > 34 ? 1 + (P.wx.heatWild - 1) * p.wxT[0] : 1) * (pc.sig === 1 ? 1.15 : 1);
  T.wild = SL[5] < pWild && !pitchout;
  const sg = T.wild ? P.loc.sigWild : P.loc.sigma0 * Math.exp(-P.loc.cmdK * zCmd - P.ev.ctlSig * pa.cCtl) * P.pt.sigM[t] * tRain * heat;
  const x = tx + sg * invN(SL[6]), z = tz + sg * invN(SL[7]);
  T.x = x; T.z = z;
  const ax = Math.abs(x), dzv = Math.abs(z - zm);
  let d: number;
  if (ax <= HW && dzv <= HH) d = Math.min(HW - ax, HH - dzv); else d = -Math.hypot(Math.max(0, ax - HW), Math.max(0, dzv - HH));
  T.d = d; T.inZone = d >= 0;
  T.insideCm = inSign * x;
  // ── 구속 ──
  const tC = sl.tC;
  let vRel: number;
  if (t === 8) vRel = 112 + 13 * fracU(SL[13], 997);
  else if (pc.sig === 8) vRel = 80 + 15 * fracU(SL[13], 997);
  else vRel = p.velo + P.pt.veloOff[t] + (pc.sig === 5 ? 5 : 0) - pn.veloLoss + P.wx.veloTemp * (tC - 20) - (tC < 8 ? P.wx.coldVelo * p.wxT[1] : 0) + pa.cVelo + 1.2 * invN(fracU(SL[13], 991));
  T.vRel = vRel; T.vPlate = 0.915 * vRel + P.wx.plateTemp * (tC - 20); T.vPerc = vRel + 9 * (p.ext - 1.93);
  T.move = (1 - P.wx.moveTemp * (tC - 20)) * (1 + 2 * pitchHeadwind(sl, g.park) / Math.max(25, T.vPlate / 3.6));
  // ── 몸에 맞는 공(슬롯 14) ──
  const ins = T.insideCm;
  if (!pitchout && ins > HW + 8 && z > pa.bot - 45 && z < pa.top + 70) {
    const crowd = hasT(b, TR.plateCrowder) ? 6 : 0;
    const ph2 = P.hbp.scale * sig((ins - P.hbp.thresh + crowd) / P.hbp.width) * Math.exp(-P.hbp.agil * pa.zAg) * (hasT(b, TR.plateCrowder) ? 2 : 1) * (hasT(p, TR.brushback) ? 1.6 : 1)
      * (1 + P.hbp.temp * (tC - 20)) * P.hbp.rain[rainLv];
    if (SL[14] < ph2) { T.hbp = true; T.res = PR.HBP; return PR.HBP; }
  }
  // 피치아웃
  if (pitchout) { T.res = PR.PITCHOUT; wpCheck(g, c, pc, rainLv); return PR.PITCHOUT; }
  // ── 위력(플래툰·피로·첫 이닝·채널) ──
  let zs = pc.zs + (pa.same ? 1 : -1) * P.platoon.pit * (P.pt.platoon[t] + p.slotPlat + (pc.sig === 3 && pa.same ? 0.3 : 0) + (pc.sig === 6 ? -0.3 : 0) + (pc.sig === 7 ? -0.6 : 0) + (pc.sig === 13 ? 0.2 : 0)) / 2 / P.scaleStuff
    - 0.015 * pn.over + pn.first + 0.02 * c.z[A.pitcherLead];
  T.zs = zs;
  const f = Math.max(pa.mem[t], pa.tmem[t]); T.f = f;
  // ── 5. 노림수(슬롯 8) ──
  const tSw = b.tSwing;
  const appr = pa.approach;
  let pg = P.count.guess[ci] * (1 + 0.3 * tSw) * (appr === 3 ? 1.3 : appr === 4 ? 0.6 : 1); if (pg > 0.85) pg = 0.85;
  let guessFam = -1;
  if (SL[8] < pg) {
    const u2 = SL[8] / pg; const lam = clamp(0.5 - 0.15 * pa.zIQ, 0.2, 0.8);
    let acc = 0; for (let k = 0; k < 3; k++) { acc += (1 - lam) * (WF[k] + (k === 2 ? WF[3] : 0)) + lam / 3; if (u2 < acc) { guessFam = k; break; } }
    if (guessFam < 0) guessFam = 2;
  }
  const famG = fam === 3 ? 2 : fam;
  T.guessHit = guessFam >= 0 && guessFam === famG && T.inZone;
  T.guessMiss = guessFam >= 0 && !T.guessHit;
  // ── 6. 지각 ──
  const zCope = fam === 0 && (T.vPerc >= 148 || pc.sig === 5) ? pa.zFast : fam === 0 ? (pa.zFast + pa.zBreak) / 2 : pa.zBreak;
  let fbar = 0; for (let i = 0; i < 9; i++) fbar += pa.mem[i]; fbar /= Math.max(1, np);
  let ill = 0;
  if (d < 0) ill = P.pt.ill[t] * (pc.sig === 1 ? 1.25 : pc.sig === 9 ? 1.3 : pc.sig === 12 ? 1.2 : pc.sig === 5 ? 1.15 : 1) * (1 - P.perc.memIll * f) * (1 + P.perc.stuffIll * zs) * T.move;
  if (pa.prevType === 0 && fam >= 1) ill += P.perc.tunnel;
  const vis = (sl.sunAlt > 5 && sl.sky === 0 ? 1 + P.wx.sunK * b.wxT[3] : 1) * (sl.visKm < 1 ? (sl.visKm < 0.5 ? P.wx.fog05 : P.wx.fog1) : 1) * (sl.sunAlt > -6 && sl.sunAlt < 3 ? P.wx.twilight : 1);
  const sp = P.perc.sp0 * Math.exp(-P.perc.eye * pa.zEye - P.perc.cope * zCope + P.perc.dec * p.z[A.deception] * (1 - fbar) - P.perc.mem * f - P.ev.eyeNoise * pa.cEye) * vis;
  const dp = d + ill + sp * invN(SL[9]);
  // ── 번트 모드 ──
  const mode = pa.mode;
  if (mode >= 2 && mode <= 4 && !(mode !== 4 && st === 2 && g.rA.next() < 0.7)) {
    const offer = mode === 4 ? true : dp > -4 ? SL[10] < P.bunt.offer : SL[10] < P.bunt.offerOut;
    if (offer) {
      T.swing = true; T.bunt = true;
      const zbR = clamp(b.z[A.bunt] / P.zGain, -2.5, 2.5);   // 번트 기술은 원래 눈금(표준편차 1)으로 — zGain 압축 때문에 기술 차가 거의 사라졌었다
      const pc2 = sig(P.bunt.contact + P.bunt.skill * zbR - P.bunt.stuff * zs - P.bunt.velo * (T.vPlate - 125) - P.bunt.ballPen * (d < 0 ? 1 : 0) + (fam === 0 ? P.bunt.fast : 0));
      if (SL[12] < pc2) {
        T.contact = true;
        if (SL[13] < P.bunt.fair + P.bunt.fairK * zbR) { T.inPlay = true; T.res = PR.INPLAY; return PR.INPLAY; }
        T.foul = true; T.res = PR.BUNT_FOUL; wpCheck(g, c, pc, rainLv); return PR.BUNT_FOUL;
      }
      T.res = PR.BUNT_MISS; wpCheck(g, c, pc, rainLv); return PR.BUNT_MISS;
    }
  }
  // ── 7. 스윙(슬롯 10) ──
  let lg: number;
  if (mode === 5) lg = -3.0;
  else if (mode === 1 && Math.abs(d) < 15) lg = 2.94;
  else {
    lg = P.count.A[ci] + P.count.swingAdj[ci] + P.count.B[ci] * P.swing.scale * Math.tanh(dp / P.swing.tanhW) + P.swing.tSwing * tSw - P.swing.eyeOut * pa.zEye * (dp < 0 ? 1 : 0);
    lg += appr === 1 ? P.swing.aggressive : appr === 2 ? P.swing.patient : appr === 3 ? P.swing.power : 0;
    if (appr === 4 && st === 2) lg += P.swing.contact2S;
    if (T.guessHit) lg += P.swing.guessHit; else if (T.guessMiss && d < 0) lg += P.swing.guessMiss;
    if (ci === 0) { lg += P.swing.firstPitch * O.tac.firstPitch; if (hasT(b, TR.firstPitchSwinger)) lg += b.sigBat === 'firstPitchSniper' ? 0.6 : 0.47; }
    if (hasT(b, TR.patientHitter)) lg -= 0.13;
    if (hasT(b, TR.freeSwinger) && dp < 0) lg += 0.30;
    lg += P.ev.aggr * pa.cAggr - P.ev.eyeChase * pa.cEye * (dp < 0 ? 1 : 0);
    if (hasT(p, TR.nibbler) && d < 0) lg += 0.1;
  }
  T.swing = SL[10] < sig(lg);
  if (!T.swing) {
    // ── 8. 판정(슬롯 11) ──
    let strike: boolean;
    if (g.rules.zone === 'ABS') strike = d >= 0;
    else {
      const U = g.ump;
      const sideB = dzv > HH ? (z > zm ? U.high : U.low) : ((x > 0 ? 1 : -1) === inSign ? U.inside : U.outside);
      const bump = U.size + sideB + U.countBias * P.ump.countBias[ci] + P.ump.countShift[ci];
      const sgm = P.ump.s * U.consistency * (sl.atC > 35 ? P.ump.heatS : 1);
      const bsig = pc.sig === 6 && !pa.same ? 0.8 : 0;
      strike = SL[11] < sig((d + P.ump.b0 + bump + P.ump.framing * c.z[A.framing] + P.ump.cmd * pc.zc + bsig) / sgm);
      T.frame = strike && d < 0;
    }
    T.called = strike;
    T.res = strike ? PR.CALLED : PR.BALL;
    wpCheck(g, c, pc, rainLv);
    return T.res;
  }
  // ── 9. 접촉(슬롯 12) ──
  const two = st === 2;
  const twoTac = O.tac.twoStrike;
  let lc = P.con.c0 + P.con.c1 * Math.tanh(d / P.con.w) + P.pt.C[t] + P.con.zc * pa.zCon + P.con.zk * pa.zK + P.con.zcope * zCope - P.con.zs * zs
    - (fam === 0 ? P.con.velo * (T.vPerc - 146) : t === 8 || pc.sig === 8 ? 0 : P.con.veloOS * clamp(vRel - P.bat.veloRef - P.pt.veloOff[t], -15, 15)) + P.con.mem * f + (two ? P.con.two : 0) + P.ev.contactLogit * (pa.cCon - pa.cStuff) + (g.inp.env?.contactAdj ?? P.env.contactAdj);
  if (t === 0 && z > zm + HH / 3) lc -= P.con.highFF * (pc.sig === 4 ? 1.3 : 1);
  if (pa.prevType >= 0 && P.pt.fam[pa.prevType] === 0 && fam >= 1) lc -= P.con.timing * Math.max(0, pa.prevV - vRel - 10) + (pc.sig === 8 ? 0.6 : 0);
  if (T.guessHit) lc += P.con.guessHit; else if (T.guessMiss) lc += P.con.guessMiss;
  if (two && twoTac === 'shorten') lc += 0.20; else if (two && twoTac === 'full') lc -= 0.15;
  // 접근법의 대가 [18]: 장타(큰 스윙) → 헛스윙↑, 맞히기·진루타(짧게) → 헛스윙↓ — 전에는 장타가 공짜(삼진도 그대로)이고 맞히기는 배트만 느려지는 손해뿐이었다
  if (appr === 3) lc -= P.swing.powerCon; else if (appr === 4) lc += P.swing.contactCon; else if (appr === 5 || appr === 6) lc += P.swing.prodCon;
  if (pc.sig > 0) { const sigW = [0, 1.25, 1.05, 1, 1, 1.15, 1, pa.same ? 1 : 1.25, 1, 1.3, 1, 1, 1.2, pa.same ? 1.2 : 1][pc.sig] ?? 1; lc -= Math.log(sigW); if (pc.sig === 10 && !pa.same) lc -= 0.4; if (pc.sig === 3 && pa.same) lc -= 0.6; }
  if (hasT(b, TR.fastballHunter)) lc += fam === 0 ? 0.4 : -0.3;
  if (pa.hot & 1) lc += z < zm - HH / 3 ? 0.5 : z > zm + HH / 3 ? -0.3 : 0; if (pa.hot & 2) lc += z > zm + HH / 3 ? 0.5 : z < zm - HH / 3 ? -0.3 : 0;
  if (hasT(b, TR.freeSwinger) && d < 0) lc += 0.6;
  if (hasT(b, TR.bigSwing)) lc -= 0.1;
  if (mode === 1) lc += 0.15;
  T.contact = SL[12] < sig(lc);
  if (!T.contact) { T.res = PR.WHIFF; wpCheck(g, c, pc, rainLv); return PR.WHIFF; }
  // ── 10. 파울/인플레이(슬롯 13) ──
  let lf = P.count.F[ci] + P.foul.tanh * Math.tanh(d / 8) + P.foul.zc * pa.zCon - P.foul.zs * zs + (T.guessHit ? P.foul.guess : 0);
  if (two && twoTac === 'shorten') lf += P.foul.shorten;
  if (two && hasT(b, TR.grinder)) lf += P.foul.grinder * (b.sigBat === 'foulMachine' ? 1.5 : 1);
  if (SL[13] < sig(lf)) { T.inPlay = true; T.res = PR.INPLAY; return PR.INPLAY; }
  T.foul = true;
  // 파울팁(슬롯 14 변형) / 잡을 수 있는 파울 뜬공
  const u14 = fracU(SL[14], 1013);
  if (u14 < P.foul.tip) { T.tip = true; if (two && fracU(SL[14], 523) < P.foul.tipCatch + 0.02 * c.z[A.hands]) { T.res = PR.TIP_K; return PR.TIP_K; } T.res = PR.TIP; return PR.TIP; }
  if (fracU(SL[13], 769) < P.foul.popFoul * g.park.foul) {
    const pCatch = clamp(0.80 + 0.05 * (c.z[A.hands] + D.pcs[D.field[PO.B3]].z[A.range]) / 2, 0.6, 0.95);
    if (fracU(SL[13], 389) < pCatch) { T.outFoul = true; T.res = PR.FOULOUT; return PR.FOULOUT; }
  }
  T.res = PR.FOUL;
  return PR.FOUL;
}

/** 폭투·포일(슬롯 15) — 주자 있거나 2스트라이크(낫아웃 조건)일 때만 의미 */
function wpCheck(g: G, c: PC, pc: PitchC, rainLv: number): void {
  const T = PT; T.H = 0;
  const any = g.bases[0] || g.bases[1] || g.bases[2];
  const k3 = g.strikes === 2 && (T.res === PR.WHIFF || T.res === PR.CALLED || T.res === PR.BUNT_MISS) && (!g.bases[0] || g.outs === 2);
  if (!any && !k3) return;
  const H = Math.max(0, 12 - T.z) / 10 + Math.max(0, Math.abs(T.x) - 45) / 15 + Math.max(0, T.z - 150) / 20;
  T.H = H;
  const D = defense(g); const p = D.pcs[D.pit.i];
  const kn = pc.t === 8 ? P.wp.kn * (pc.sig === 12 ? 1.5 : 1) : 1;
  const mech = c.mech.wpPbMult ?? 1;
  const bm = hasT(c, TR.blockMaster) ? 0.75 : 1;
  const rain = P.wp.rain[rainLv];
  let pw = 0, pb = 0;
  if (H > 0) pw = P.wp.base * (1 - Math.exp(-1.2 * H)) * Math.exp(-P.wp.block * c.z[A.block]) * kn * rain * mech * bm * (pc.sig === 1 ? 1.3 : pc.sig === 9 ? 1.4 : 1);
  else pb = P.wp.pb * Math.exp(-P.wp.pbBlock * c.z[A.block]) * kn * rain * mech;
  void p;
  const u = SL[15];
  if (u < pw) T.wp = true; else if (u < pw + pb) T.pb = true;
}
