// 작전·AI 감독 — 투수 교체·불펜 배정·대타·대주자·번트·스퀴즈·고의4구·도루·히트앤런·피치아웃·견제·수비 대형, 유저 명령.
// AI 판단은 A 스트림(타석·판단 종류 키)으로 결정적. 난이도는 '판단 정확도(잡음)'만 바꾸고 규칙·확률은 모두 같다(러버밴딩 없음).
import { P } from './params.ts';
import { A, hasT, TR, type PC } from './player.ts';
import { sub, clamp, sig, invN } from './rng.ts';
import { type G, type TeamSt, type PitSt, PO, offense, defense, basesCode } from './state.ts';
import { reOf, offWE } from './we.ts';
import { KIND } from './pitch.ts';
import { pitLine, batLine, logEV, EVC } from './log.ts';
import { b2bLoss } from './fatigue.ts';
import { evPitcherChange } from './events.ts';
import type { Tactics, Command } from './types.ts';

export const DEF_TAC: Tactics = {
  aggression: 0, stealFreq: 0, buntFreq: 0, hitRunFreq: 0, firstPitch: 0, twoStrike: 'normal', extraBase: 0, ph: 'auto',
  infieldIn: 'auto', ofDepth: 'auto', pickoffFreq: 0, ibb: 'auto', calling: 'balanced', hookPitches: 0, hookRuns: 0, tto3Hook: false,
  closer: 'saveOnly', matchup: true,
};
export function resolveTac(t?: Partial<Tactics>): Tactics { return { ...DEF_TAC, ...(t ?? {}) }; }
const NOISE = [0, 0.030, 0.020, 0.012, 0.007, 0.004, 0.002];

/** 판단 잡음(A 스트림): kind = 판단 종류 */
function aiU(g: G, kind: number): number { return sub(g.rA, g.seed, KIND.A, g.paNo, kind).next(); }
function aiN(g: G, kind: number, lvl: number): number { return NOISE[lvl] * invN(aiU(g, kind + 100)); }

/** 타자 공격 가치(z 단위, 상대 투수 손 기준) — 대타 판단용 근사 */
export function batVal(pc: PC, vsL: boolean): number {
  const zc = vsL ? pc.zConL : pc.zConR;
  const bL = pc.bats === 1 || (pc.bats === 2 && !vsL);
  const same = bL === vsL && pc.bats !== 2;
  const pen = same ? pc.split / 20 : 0;
  return 0.32 * zc + 0.28 * (pc.z[A.power] - 0.6 * pen) + 0.12 * (pc.z[A.eye] - 0.3 * pen) + 0.08 * pc.z[A.avoidK] + 0.05 * pc.z[A.speed];
}
/** 투수 평가(불펜 고르기) */
export function pitVal(pc: PC): number {
  let s = 0, u = 0; for (const x of pc.pitches) { s += x.use * x.zs; u += x.use; }
  return (u ? s / u : -1) + 0.45 * pc.z[A.control] + 0.25 * (pc.velo - 146) / 3;
}

// ═════════════ 투수 교체 ═════════════
export function newPitSt(i: number, starter: boolean, role: string, g: G, D: TeamSt): PitSt {
  const pc = D.pcs[i];
  const lead = D.side === 1 ? g.score[1] - g.score[0] : g.score[0] - g.score[1];
  const runners = (g.bases[0] ? 1 : 0) + (g.bases[1] ? 1 : 0) + (g.bases[2] ? 1 : 0);
  const saveSit = !starter && lead >= 1 && (lead <= 3 || lead <= runners + 2);
  return { i, F: 0, pitches: 0, strikes: 0, bf: 0, outs: 0, runs: 0, er: 0, h: 0, bb: 0, ibb: 0, hbp: 0, k: 0, hr: 0, wp: 0, bk: 0, starter, role, inn0: g.inning, inningPitches: 0, curInning: g.inning,
    inh: runners, inhScored: 0, vMax: 0, saveSit, lead0: lead, blown: false, heldLead: true, tto: new Int8Array(9), firstInningDone: false, warmed: true, rattled: 0, inZone: false, coldArm: 0,
    b2bLoss: b2bLoss(D.tin.players.find((p) => p.id === pc.id)?.state?.b2b, hasT(pc, TR.rubberArm)) };
}
export function changePitcher(g: G, D: TeamSt, i: number, role: string): void {
  const old = D.pit;
  const ps = newPitSt(i, false, role, g, D);
  D.pitHist.push(ps); D.pit = ps;
  D.field[PO.P] = i; D.posOf[old.i] = -1; D.posOf[i] = PO.P; D.removed[old.i] = 1;
  for (const p of D.pen) if (p.i === i) p.used = true;
  const pl = pitLine(D, i); pl.inh += ps.inh;
  g.clock += P.clock.pitcherChange;
  logEV(g, EVC.SUB_P, D.pcs[old.i].id, D.pcs[i].id);
  evPitcherChange(g, D.side);
}
/** 불펜에서 역할에 맞는 투수 */
function pickPen(D: TeamSt, roles: string[], allowEmergency: boolean): number {
  for (const pass of allowEmergency ? [2, 1] : [2]) {
    let best = -1, bv = -99;
    for (const r of roles) {
      for (const p of D.pen) {
        if (p.used || D.removed[p.i] || p.avail < pass || p.role !== r) continue;
        const v = pitVal(D.pcs[p.i]); if (v > bv) { bv = v; best = p.i; }
      }
      if (best >= 0) return best;
    }
  }
  return -1;
}
function anyPen(D: TeamSt): number {
  let best = -1, bv = -99;
  for (const pass of [2, 1, 0]) { for (const p of D.pen) { if (p.used || D.removed[p.i] || p.avail < pass) continue; const v = pitVal(D.pcs[p.i]); if (v > bv) { bv = v; best = p.i; } } if (best >= 0) return best; }
  return -1;
}
/** 상황별 필요한 불펜 역할 */
function wantRoles(g: G, D: TeamSt): string[] {
  const lead = D.side === 1 ? g.score[1] - g.score[0] : g.score[0] - g.score[1];
  const inn = g.inning;
  if (Math.abs(lead) >= P.ai.mopDiff) return ['MOP', 'LONG', 'MID'];
  if (inn >= 9 && lead >= 1 && lead <= 3) return ['CL', 'SU', 'MID'];
  if (inn >= 9 && lead === 0 && (D.side === 1 || inn >= 10) && D.tac.closer !== 'saveOnly') return ['CL', 'SU', 'MID'];
  if (inn >= 9 && lead === 0) return ['SU', 'MID', 'CL'];
  if (inn >= 8 && lead >= -1 && lead <= 3) return ['SU', 'MID'];
  if (inn >= 7 && lead >= 0 && lead <= 3) return ['SU', 'MID'];
  if (inn <= 4) return ['LONG', 'MID', 'MOP'];
  return ['MID', 'LONG', 'SU'];
}
/** 수비 쪽 타석 전 판단: 투수 교체 */
export function aiPitching(g: G, startOfHalf: boolean): void {
  const D = defense(g); if (D.user && !D.auto) { forcedChange(g, D); return; }
  const ps = D.pit; const pc = D.pcs[ps.i];
  const lead = D.side === 1 ? g.score[1] - g.score[0] : g.score[0] - g.score[1];
  const style = D.style; const lvl = D.level;
  let pull = false;
  if (ps.starter) {
    const tp = D.tac.pit?.[pc.id];
    const hook = (tp?.limit ?? pc.limit + P.ai.hookAdd) + D.tac.hookPitches - 4 * style + P.ai.spLimitSlack + 6 * invN(sub(g.rA, g.seed, KIND.A, D.side * 7919 + 3, 777).next()) * (lvl <= 2 ? 1.5 : 1);
    const hookRuns = D.tac.hookRuns || P.ai.spHookRuns;
    const winGuard = g.inning === 5 && lead > 0 && ps.F < pc.limit;
    if (startOfHalf && ps.pitches >= hook - 6) pull = true;
    if (!startOfHalf && ps.pitches >= hook + 10) pull = true;
    if (ps.runs >= hookRuns || (g.inning <= 4 && ps.runs >= P.ai.spHookRunsEarly && g.outs < 2 && (g.bases[0] || g.bases[1]))) pull = true;
    if (D.tac.tto3Hook || P.ai.tto3 > 0) { const tto = ps.tto[offense(g).next]; if (tto >= 2 && g.pa.li >= P.ai.starterPullLI && ps.pitches >= hook - 15 && (g.bases[0] || g.bases[1] || g.bases[2])) pull = true; }
    if (g.inning >= 6 && !startOfHalf && g.pa.li >= 2.2 && ps.pitches >= hook - 8 && (g.bases[1] || g.bases[2])) pull = true;
    if (winGuard && ps.runs < hookRuns && ps.pitches < hook + 15) pull = false;
    if (lvl === 1 && ps.pitches < 110 && ps.runs < 7) pull = false;
  } else {
    const roleMax = ps.role === 'LONG' || ps.role === 'MOP' ? 45 : P.ai.rpMaxPitches;
    if (startOfHalf && ps.outs >= 3 && !(ps.role === 'LONG' || ps.role === 'MOP') && !(ps.role === 'CL' && D.tac.closer === 'multiInning' && ps.pitches < 20)) pull = true;
    if (startOfHalf && (ps.role === 'LONG' || ps.role === 'MOP') && ps.outs >= 6) pull = true;
    if (ps.pitches >= roleMax) pull = true;
    if (!startOfHalf && ps.runs - 0 >= 3 && Math.abs(lead) < P.ai.mopDiff) pull = true;
    // 9회 세이브 상황인데 마무리가 아니면 이닝 시작에 교체
    if (startOfHalf && g.inning >= 9 && lead >= 1 && lead <= 3 && ps.role !== 'CL' && pickPen(D, ['CL'], false) >= 0) pull = true;
  }
  forcedChange(g, D);
  if (D.pit !== ps) return;
  if (!pull) return;
  let next = pickPen(D, wantRoles(g, D), false);
  if (next < 0) next = pickPen(D, ['MID', 'SU', 'LONG', 'MOP', 'LOOGY', 'CL'], true);
  if (next < 0) { if (ps.pitches < (ps.starter ? 130 : 50)) return; next = anyPen(D); if (next < 0) return; }
  const role = D.pen.find((p) => p.i === next)?.role ?? 'MID';
  changePitcher(g, D, next, role);
}
/** 강제 교체(부상·투구 수 한계 L+25) */
function forcedChange(g: G, D: TeamSt): void {
  const ps = D.pit; const pc = D.pcs[ps.i];
  if (!(D.removed[ps.i] === 2 || ps.F > pc.limit + 35)) return;
  let next = pickPen(D, wantRoles(g, D), true); if (next < 0) next = anyPen(D); if (next < 0) return;
  changePitcher(g, D, next, D.pen.find((p) => p.i === next)?.role ?? 'MID');
}

// ═════════════ 공격 쪽 타석 전 ═════════════
/** 대타·대주자 */
export function aiSubs(g: G): void {
  const O = offense(g), D = defense(g); if (O.user && !O.auto) return;
  if (O.tac.ph === 'never') return;
  const slot = O.next; const cur = O.order[slot]; const pc = O.pcs[cur];
  const vsL = D.pcs[D.pit.i].throwsL;
  const diff = O.side === 1 ? g.score[1] - g.score[0] : g.score[0] - g.score[1];
  const late = g.inning >= 7 || (O.tac.ph === 'auto' && g.inning >= 6 && g.pa.li >= 2);
  if (late && (g.pa.li >= P.ai.phLI || Math.abs(diff) <= 3) && O.removed[cur] !== 2) {
    const cv = batVal(pc, vsL); let best = -1, bv = cv + P.ai.phGain * 10 + 0.005 * O.style * 10;
    const posNow = O.posOf[cur];
    for (const i of O.bench) {
      if (O.removed[i]) continue; const b = O.pcs[i]; if (b.pitches.length) continue;
      if (posNow === PO.C && b.posProf[1] < 10) continue;   // 포수 자리는 포수만
      const v = batVal(b, vsL) + NOISE[O.level] * 3 * invN(aiU(g, 31 + i));
      if (v > bv) { bv = v; best = i; }
    }
    if (best >= 0 && !(posNow === PO.C && countCatchers(O) <= 1 && O.pcs[best].posProf[1] < 10)) { substitute(g, O, slot, best); logEV(g, EVC.SUB_PH, pc.id, O.pcs[best].id); }
  }
  // 대주자(1·2루, 7회 이후 2점 이내)
  if (g.inning >= 7 && Math.abs(diff) <= 2) {
    for (let b = 0; b < 2; b++) {
      const r = g.bases[b]; if (!r) continue; const rp = O.pcs[r.i]; if (rp.z[A.speed] > -0.5) continue;
      let best = -1, bs = 1.0;
      for (const i of O.bench) { if (O.removed[i] || O.pcs[i].pitches.length) continue; if (O.pcs[i].z[A.speed] > bs) { bs = O.pcs[i].z[A.speed]; best = i; } }
      if (best >= 0) { const s = O.order.indexOf(r.i); if (s >= 0) { substitute(g, O, s, best); r.i = best; logEV(g, EVC.SUB_PR, rp.id, O.pcs[best].id); } }
    }
  }
}
const countCatchers = (T: TeamSt): number => { let n = 0; for (const i of T.bench) if (!T.removed[i] && T.pcs[i].posProf[1] >= 12) n++; return n; };
/** 타순 slot 의 선수를 i 로 바꿈(수비 위치 그대로 이어받음) */
export function substitute(g: G, T: TeamSt, slot: number, i: number): void {
  const out = T.order[slot]; const pos = T.posOf[out];
  T.order[slot] = i; T.removed[out] = 1; T.bench = T.bench.filter((x) => x !== i);
  if (pos >= 0) { T.field[pos] = i; T.posOf[i] = pos; } T.posOf[out] = -1;
  const bl = batLine(T, i); bl.ord = slot + 1;
  void g;
}

/** 공격 작전: 번트·스퀴즈·기습번트·접근법 */
export function aiOffenseMode(g: G): void {
  const O = offense(g); const pa = g.pa;
  pa.mode = 0; pa.approach = O.approach;
  if (pa.approach === 0) {
    if (g.bases[2] && g.outs < 2) pa.approach = 5; else if (g.bases[1] && !g.bases[2] && g.outs === 0) pa.approach = 6;
  }
  if (O.user && !O.auto) return;
  const pc = O.pcs[pa.b]; const D = defense(g); const vsL = D.pcs[D.pit.i].throwsL;
  const diff = O.side === 1 ? g.score[1] - g.score[0] : g.score[0] - g.score[1];
  const bv = batVal(pc, vsL);
  const tb = O.tac.bat?.[pc.id]?.bunt;
  const styleM = O.style > 0 ? 1.6 : O.style < 0 ? 0.6 : 1;
  // 희생번트: 무사 1루(·1·2루·2루), 접전, 약한 타자일수록
  if (g.outs === 0 && (g.bases[0] || g.bases[1]) && !g.bases[2] && Math.abs(diff) <= 3 && tb !== 'none' && tb !== 'drag') {
    const late = g.inning >= 7 ? 1.7 : g.inning >= 5 ? 1.15 : 0.8;
    const pr = P.ai.buntK * 25 * late * Math.exp(-1.6 * bv) * (1 + 0.3 * O.tac.buntFreq) * styleM * (Math.abs(diff) <= 1 ? 1.3 : 0.7) * (1 + 0.3 * pc.z[A.bunt]);
    if (aiU(g, 11) < pr || tb === 'sac' && aiU(g, 11) < 0.5) { pa.mode = 2; return; }
  }
  // 스퀴즈: 3루 주자·1사·7회 이후 1점 차 이내
  if (g.bases[2] && g.outs === 1 && g.inning >= 7 && Math.abs(diff) <= 1 && bv < 0.1 && aiU(g, 12) < 0.10 * styleM * (1 + 0.3 * O.tac.buntFreq)) { pa.mode = 4; return; }
  // 기습번트(특성)
  if (hasT(pc, TR.dragBunter) && g.outs < 2 && D.inf !== 3 && aiU(g, 13) < 0.04 * (pc.sigBat === 'lightningLegs' ? 1.5 : 1)) { pa.mode = 3; return; }
}

/** 고의4구 판단(수비 쪽, 타석 전) — 1루 빔·접전·강타자 뒤 약한 타자 */
export function aiIBB(g: G): boolean {
  const D = defense(g), O = offense(g); if (D.tac.ibb === 'never') return false;
  if (g.bases[0] || (!g.bases[1] && !g.bases[2])) return false;
  const vsL = D.pcs[D.pit.i].throwsL;
  const cur = batVal(O.pcs[O.order[O.next]], vsL), nxt = batVal(O.pcs[O.order[(O.next + 1) % 9]], vsL);
  const diffD = D.side === 1 ? g.score[1] - g.score[0] : g.score[0] - g.score[1];
  const late = g.inning >= 7 && diffD >= -1 && diffD <= 1;
  const bc = basesCode(g);
  // 기대 승리 비교(근사): 고의4구로 주자 한 명 더 vs 이 타자 상대(강할수록 손해)
  const weAfter = offWE(g.inning, g.half, g.outs, bc | 1, g.score[1] - g.score[0], g.maxInn);
  const weNow = offWE(g.inning, g.half, g.outs, bc, g.score[1] - g.score[0], g.maxInn);
  const gain = (cur - nxt) * 0.045 * (g.outs >= 1 ? 1.2 : 0.8) - (weAfter - weNow);
  const margin = P.ai.ibbMargin - 0.002 * D.style + (D.tac.ibb === 'aggressive' ? -0.004 : 0) + aiN(g, 21, D.level);
  return (late || (g.inning >= 5 && bc === 6 && g.outs === 1)) && gain > margin && g.bases[1] !== null;
}

/** 수비 대형 */
export function aiAlign(g: G): void {
  const D = defense(g); if (D.alignFixed) return;
  const diffD = D.side === 1 ? g.score[1] - g.score[0] : g.score[0] - g.score[1];
  const inLate = g.inning >= (D.style > 0 ? 6 : D.style < 0 ? 8 : 7);
  D.inf = 0; D.of = 0;
  if (g.bases[2] && g.outs < 2 && (D.tac.infieldIn === 'always' || (D.tac.infieldIn !== 'never' && inLate && diffD >= -1 && diffD <= 1))) D.inf = 2;
  else if (g.bases[0] && g.outs < 2) D.inf = 1;
  if (g.pa.mode === 2 || (g.bases[0] && !g.bases[2] && g.outs === 0 && Math.abs(diffD) <= 2 && g.inning >= 7)) D.inf = 3;
  if (D.tac.ofDepth === 'deep' || (g.inning >= 9 && diffD >= 1 && diffD <= 2)) D.of = 1; else if (D.tac.ofDepth === 'shallow' || (g.inning >= 9 && diffD === 0 && g.bases[2] && g.outs < 2)) D.of = 2;
}

// ═════════════ 투구 전 ═════════════
export interface PrePitch { steal2: boolean; steal3: boolean; pitchout: boolean; hitRun: boolean }
const PRE: PrePitch = { steal2: false, steal3: false, pitchout: false, hitRun: false };
/** 도루·히트앤런·피치아웃 판단 */
export function aiPrePitch(g: G): PrePitch {
  PRE.steal2 = false; PRE.steal3 = false; PRE.pitchout = false; PRE.hitRun = false;
  const O = offense(g), D = defense(g); const pa = g.pa;
  if (pa.mode >= 2 && pa.mode <= 4) return PRE;
  const S = P.steal;
  const cpc = D.pcs[D.field[PO.C]], ppc = D.pcs[D.pit.i];
  const outs = g.outs; const bc = basesCode(g);
  const tryBase = (from: number): boolean => {
    const r = g.bases[from]; if (!r) return false; const rp = O.pcs[r.i];
    const tb = O.tac.bat?.[rp.id]?.steal; if (tb === 'never') return false;
    const lead = from === 0 ? Math.max(0, P.run.lead1 + P.run.lead1Jump * rp.z[A.stealJump]) * (rp.mech.leadMult ?? 1) : P.run.lead2b;
    const tRun = S.jump - S.jumpK * rp.z[A.stealJump] + S.pickoffK * ppc.z[A.pickoff] + (ppc.throwsL && from === 0 ? S.lefty : 0) + (27.43 - lead - 1.0) / rp.sprint + 0.5 - 0.009 * (rp.mech.sbPP ?? 0);
    const tDef = ppc.deliv + 0.12 + (from === 0 ? cpc.pop : 0.85 * cpc.pop) + P.thr.tag;
    let ps = sig((tDef - tRun + S.slide * rp.z[A.sliding]) / S.sig) - (hasT(cpc, TR.runnerKiller) ? S.killer : 0);
    ps += NOISE[O.level] * 2 * invN(aiU(g, 41 + from));
    const nb = from === 0 ? (bc & ~1) | 2 : (bc & ~2) | 4;
    const reB = reOf(outs, bc), reS = reOf(outs, nb), reF = reOf(outs + 1, bc & ~(1 << from));
    const be = (reB - reF) / Math.max(0.05, reS - reF);
    const margin = P.steal.margin - 0.025 * O.style - (O.tac.stealFreq * 0.03) + (g.strikes === 2 && g.balls < 3 ? 0.03 : 0);
    if (ps - be < margin || ps < S.minProb) return false;
    const q = 0.30 * S.attemptScale * (hasT(rp, TR.stealsOften) ? P.steal.often * (rp.sigBat === 'lightningLegs' ? 1.3 : 1) : 1) * (tb === 'green' ? 1.5 : 1) * (1 + 0.3 * O.tac.stealFreq) * (hasT(cpc, TR.runnerKiller) ? 0.85 : 1);
    return aiU(g, 51 + from) < q;
  };
  if (!(O.user && !O.auto)) {
    if (g.bases[0] && !g.bases[1]) PRE.steal2 = tryBase(0);
    else if (g.bases[1] && !g.bases[2] && g.outs < 2) PRE.steal3 = tryBase(1) && aiU(g, 53) < 0.35;
    // 히트앤런
    if (!PRE.steal2 && g.bases[0] && !g.bases[1] && outs < 2 && (g.balls === 1 && g.strikes === 0 || g.balls === 2 && g.strikes === 1 || g.balls === 3 && g.strikes === 1)) {
      const b = O.pcs[pa.b]; if (b.z[A.contactR] + b.z[A.contactL] >= 1.0 && b.z[A.avoidK] >= 0 && aiU(g, 61) < 0.06 * (1 + 0.4 * O.tac.hitRunFreq)) { PRE.hitRun = true; pa.mode = 1; }
    }
  }
  // 피치아웃(수비)
  if ((PRE.steal2 || PRE.steal3) && !(D.user && !D.auto) && g.balls <= 1 && aiU(g, 71) < 0.04 * (D.level >= 4 ? 1.5 : 1)) PRE.pitchout = true;
  return PRE;
}
/** 견제 시도 횟수(이번 투구 앞) */
export function aiPickoffs(g: G): number {
  const D = defense(g), O = offense(g); const Pk = P.pick;
  if (!g.bases[0] || g.bases[1]) return 0;
  const rp = O.pcs[g.bases[0].i]; const ppc = D.pcs[D.pit.i];
  const threat = sig(1.5 * (rp.z[A.speed] + rp.z[A.stealJump]) / 2 + 0.5 * (hasT(rp, TR.stealsOften) ? 1 : 0) - 0.5);
  const p = Pk.base * threat * (1 + Pk.freq * D.tac.pickoffFreq) * (hasT(ppc, TR.pickoffArtist) ? Pk.artist : 1);
  let n = 0; for (let k = 0; k < Pk.maxPer; k++) { if (aiU(g, 81 + k) < p) n++; else break; }
  return n;
}

// ═════════════ 유저 명령 ═════════════
/** 이번 투구 번호에 해당하는 명령 적용(한 번 쓰는 명령은 플래그로, 유지 명령은 팀 상태로) */
export function applyCommands(g: G, pre: PrePitch): void {
  const L = g.cmds; if (!L || g.cmdPtr >= L.length) return;
  while (g.cmdPtr < L.length && (L[g.cmdPtr] as Command).at <= g.pitchNo) {
    const c = L[g.cmdPtr++] as Command; const T = c.team === 'home' ? g.T[1] : g.T[0];
    const isOff = T === offense(g);
    switch (c.k) {
      case 'auto': T.auto = c.v; break;
      case 'approach': T.approach = c.v === 'aggressive' ? 1 : c.v === 'patient' ? 2 : c.v === 'power' ? 3 : c.v === 'contact' ? 4 : 0; break;
      case 'steal': if (isOff) { if (c.base === 2 && g.bases[0] && !g.bases[1]) pre.steal2 = true; if (c.base === 3 && g.bases[1] && !g.bases[2]) pre.steal3 = true; } break;
      case 'hitRun': if (isOff && g.bases[0]) { pre.hitRun = true; g.pa.mode = 1; } break;
      case 'bunt': if (isOff) g.pa.mode = c.type === 'sac' ? 2 : c.type === 'drag' ? 3 : 4; break;
      case 'take': if (isOff) g.pa.mode = 5; break;
      case 'swingAway': if (isOff) g.pa.mode = 0; break;
      case 'pitchout': if (!isOff) pre.pitchout = true; break;
      case 'infield': if (!isOff) { T.inf = c.v === 'dp' ? 1 : c.v === 'in' ? 2 : c.v === 'cornersIn' ? 3 : 0; T.alignFixed = true; } break;
      case 'outfield': if (!isOff) { T.of = c.v === 'deep' ? 1 : c.v === 'shallow' ? 2 : 0; T.alignFixed = true; } break;
      case 'pitcher': if (!isOff) { const i = T.idOf.get(c.inPid); if (i !== undefined && !T.removed[i]) changePitcher(g, T, i, T.pen.find((p) => p.i === i)?.role ?? 'MID'); } break;
      case 'pinchHit': if (isOff) { const i = T.idOf.get(c.inPid); if (i !== undefined && T.bench.includes(i)) substitute(g, T, T.next, i); } break;
      case 'pinchRun': if (isOff) { const r = g.bases[c.base - 1]; const i = T.idOf.get(c.inPid); if (r && i !== undefined && T.bench.includes(i)) { const s = T.order.indexOf(r.i); if (s >= 0) { substitute(g, T, s, i); r.i = i; } } } break;
      default: break;
    }
  }
}
export { clamp };
