// 작전·AI 감독 — 투수 교체·불펜 배정·대타·대주자·번트·스퀴즈·고의4구·도루·히트앤런·피치아웃·견제·수비 대형, 유저 명령.
// AI 판단은 A 스트림(타석·판단 종류 키)으로 결정적. 난이도는 '판단 정확도(잡음)'만 바꾸고 규칙·확률은 모두 같다(러버밴딩 없음).
import { P } from './params.ts';
import { A, hasT, TR, defZ, type PC } from './player.ts';
import { sub, clamp, sig, invN } from './rng.ts';
import { type G, type TeamSt, type PitSt, PO, offense, defense, basesCode } from './state.ts';
import { reOf, offWE } from './we.ts';
import { KIND } from './pitch.ts';
import { pitLine, batLine, logEV, EVC } from './log.ts';
import { b2bLoss } from './fatigue.ts';
import { evPitcherChange } from './events.ts';
import { setAlignment } from './fielding.ts';
import type { Tactics, Command } from './types.ts';

export const DEF_TAC: Tactics = {
  aggression: 0, stealFreq: 0, buntFreq: 0, hitRunFreq: 0, firstPitch: 0, twoStrike: 'normal', extraBase: 0, ph: 'auto',
  infieldIn: 'auto', ofDepth: 'auto', pickoffFreq: 0, ibb: 'auto', calling: 'balanced', hookPitches: 0, hookRuns: 0, tto3Hook: false,
  closer: 'saveOnly', matchup: true,
};
/** 전술값 확정 + 범위 강제 [18 재미·악용 심사]: 서버가 걸러도 엔진이 한 번 더 막는다.
 *  전에는 범위 밖 값이 그대로 들어가 pickoffFreq 100(견제 26배)이면 홈 승률 .488 → .664, stealFreq 100 이면 매 투구 도루였다. */
const LV5 = ['aggression', 'stealFreq', 'buntFreq', 'hitRunFreq', 'firstPitch', 'extraBase', 'pickoffFreq'] as const;
const ENUMS: Record<string, readonly string[]> = { twoStrike: ['shorten', 'normal', 'full'], ph: ['auto', 'lateOnly', 'never'], infieldIn: ['auto', 'never', 'late', 'always'], ofDepth: ['auto', 'shallow', 'normal', 'deep'], ibb: ['auto', 'never', 'aggressive'], calling: ['balanced', 'attack', 'nibble'], closer: ['saveOnly', 'tieHome', 'multiInning'] };
const lv5 = (v: unknown): -2 | -1 | 0 | 1 | 2 => { const n = Math.round(Number(v)); return (Number.isFinite(n) ? clamp(n, -2, 2) : 0) as -2 | -1 | 0 | 1 | 2; };
export function resolveTac(t?: Partial<Tactics>): Tactics {
  const r: any = { ...DEF_TAC, ...(t ?? {}) };
  for (const k of LV5) r[k] = lv5(r[k]);
  for (const k in ENUMS) if (!ENUMS[k].includes(r[k])) r[k] = (DEF_TAC as any)[k];
  r.hookPitches = clamp(Number(r.hookPitches) || 0, -40, 40); r.hookRuns = clamp(Math.round(Number(r.hookRuns) || 0), 0, 12);
  r.tto3Hook = !!r.tto3Hook; r.matchup = r.matchup !== false;
  if (r.pit) { const o: any = {}; for (const id in r.pit) { const x = r.pit[id] ?? {}; o[id] = { ...x, limit: x.limit == null ? undefined : clamp(Number(x.limit) || 0, 20, 160), mix: x.mix == null ? undefined : lv5(x.mix), inside: x.inside == null ? undefined : lv5(x.inside), chase: x.chase == null ? undefined : lv5(x.chase) }; } r.pit = o; }
  return r as Tactics;
}
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
    inh: runners, inhScored: 0, vMax: 0, saveSit, lead0: lead, blown: false, heldLead: true, tto: new Int8Array(9), firstInningDone: false, warmed: true, rattled: 0, inZone: false, coldArm: 0, innBR: 0,
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
  const runners = (g.bases[0] ? 1 : 0) + (g.bases[1] ? 1 : 0) + (g.bases[2] ? 1 : 0); const li = g.pa.li;
  let pull = false, matchup = false;
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
    // 이닝 중 위기 강판(실제 감독처럼 '주자 내보낸 지친 선발'을 이닝 도중에): 5회 이후 투구 수가 한계 근처, 이번 이닝 주자 2명↑, 주자 있음, 승부처일수록
    //   5회는 지거나 비기고 있을 때만(이기고 있으면 승리 요건 5이닝을 채워 준다)
    //   투구 수 기준: 7회 이후 hook−15, 6회·5회는 hook−8 (아직 여유가 있으면 맡긴다)
    const troubleInn = g.inning >= 6 || (g.inning === 5 && lead <= 0);
    if (!startOfHalf && troubleInn && ps.pitches >= hook - (g.inning >= 7 ? 15 : 8) && ps.innBR >= 2 && runners >= 1 && li >= 1.1 && aiU(g, 91) < P.ai.spTrouble + 0.15 * (li - 1.1)) pull = true;
    if (!startOfHalf && g.inning >= 6 && ps.F > pc.limit + 10 && runners >= 1) pull = true;    // 한계를 넘긴 채 주자를 두면
    if (winGuard && ps.runs < hookRuns && ps.pitches < hook + 15) pull = false;
    if (lvl === 1 && ps.pitches < 110 && ps.runs < 7) pull = false;
    // 노히트 진행 중(6회 이후 상대 안타 0)이면 대기록을 위해 120구 안팎까지 맡긴다(실제 감독도 그렇다)
    if (g.inning >= 6 && offense(g).hits === 0 && ps.pitches < P.ai.noHitCap && ps.F < pc.limit + 30) pull = false;
  } else {
    const roleMax = ps.role === 'LONG' || ps.role === 'MOP' ? 45 : P.ai.rpMaxPitches;
    // 이닝 시작: 1이닝(3아웃)을 채운 구원은 교체 — 단, 공을 적게 던진 중간·롱 계투는 점수 차가 크거나 이른 이닝이면 한 이닝 더
    const extraInn = (ps.role === 'MID' || ps.role === 'LOOGY') && ps.pitches <= P.ai.rpExtraPitches && ps.outs < 6 && (Math.abs(lead) >= 3 || g.inning <= 6) && aiU(g, 93) < P.ai.rpExtraP;
    if (startOfHalf && ps.outs >= 3 && !(ps.role === 'LONG' || ps.role === 'MOP') && !(ps.role === 'CL' && D.tac.closer === 'multiInning' && ps.pitches < 20) && !extraInn) pull = true;
    if (startOfHalf && (ps.role === 'LONG' || ps.role === 'MOP') && ps.outs >= 6) pull = true;
    if (ps.pitches >= roleMax) pull = true;
    if (!startOfHalf && ps.runs - 0 >= 3 && Math.abs(lead) < P.ai.mopDiff) pull = true;
    // 큰 점수 차여도 한 투수가 무너지면 바꾼다(이번 등판 5실점·이번 이닝 35구·아웃 없이 6타자) — 전에는 패전 처리 투수가 0이닝 8실점 45구까지 던졌다
    if (!startOfHalf && (ps.runs >= 5 || ps.inningPitches >= 35 || (ps.outs === 0 && ps.bf >= 6))) pull = true;
    // 구원 위기 교체: 이번 이닝 주자 2명↑ + 주자 있음 + 승부처(마무리는 리드 중이면 끝까지 맡긴다)
    if (!startOfHalf && ps.bf >= 1 && ps.innBR >= 2 && runners >= 1 && li >= 1.5 && Math.abs(lead) < P.ai.mopDiff && !(ps.role === 'CL' && lead > 0) && aiU(g, 92) < P.ai.rpTrouble) pull = true;
    // 좌우 승부(원 포인트): 7회 이후 승부처, 좌타자 차례, 우완 구원이면 좌완 불펜 / 좌완 원 포인트는 우타자 차례에 교체
    const bat = offense(g).pcs[g.pa.b];
    if (D.tac.matchup && !startOfHalf && g.inning >= 7 && li >= 1.8 && ps.bf >= 1 && ps.role !== 'CL') {
      if (!pc.throwsL && bat.bats === 1 && D.pen.some((p) => p.role === 'LOOGY' && !p.used && !D.removed[p.i] && p.avail >= 2) && aiU(g, 94) < 0.6) { pull = true; matchup = true; }
      else if (ps.role === 'LOOGY' && bat.bats === 0) pull = true;
    }
    // 9회 세이브 상황인데 마무리가 아니면 이닝 시작에 교체
    if (startOfHalf && g.inning >= 9 && lead >= 1 && lead <= 3 && ps.role !== 'CL' && pickPen(D, ['CL'], false) >= 0) pull = true;
  }
  forcedChange(g, D);
  if (D.pit !== ps) return;
  if (!pull) return;
  let next = matchup ? pickPen(D, ['LOOGY'], false) : -1;
  if (next < 0) next = pickPen(D, wantRoles(g, D), false);
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
  const late = g.inning >= 7 || (O.tac.ph === 'auto' && g.inning >= 6 && g.pa.li >= 2.5);   // 6회 대타는 득점권 같은 큰 승부처만(엔진 LI 는 탱고 표보다 후반이 가팔라 2.5)
  // 2점 이상 앞서면 승부처(LI ≥ 1.5)에서만, 수비 굳히기로 넣은 선수는 앞서거나 비길 때 빼지 않는다
  const phOK = (diff >= 2 ? g.pa.li >= 1.5 : (g.pa.li >= P.ai.phLI || Math.abs(diff) <= 3)) && !(O.defIn[cur] && diff >= 0);
  if (late && phOK && O.removed[cur] !== 2) {
    const cv = batVal(pc, vsL); let best = -1, bv = cv + P.ai.phGain * 10 + 0.005 * O.style * 10;
    const posNow = O.posOf[cur];
    for (const i of O.bench) {
      if (O.removed[i]) continue; const b = O.pcs[i]; if (b.pitches.length) continue;
      if (posNow === PO.C && b.posProf[1] < 10) continue;   // 포수 자리는 포수만
      // 수비 자리를 메울 사람이 없으면 그 자리 대타는 하지 않는다(9회 이후 지고 있을 때만 예외) — 2루수가 중견수로 나가는 일을 막음
      if (posNow >= 1 && posNow <= 8 && b.posProf[posNow] < 10 && !(g.inning >= 9 && diff < 0) && !O.bench.some((j) => j !== i && !O.removed[j] && !O.pcs[j].pitches.length && O.pcs[j].posProf[posNow] >= 12)) continue;
      const v = batVal(b, vsL) + NOISE[O.level] * 3 * invN(aiU(g, 31 + i));
      if (v > bv) { bv = v; best = i; }
    }
    if (best >= 0 && !(posNow === PO.C && countCatchers(O) <= 1 && O.pcs[best].posProf[1] < 10)) { substitute(g, O, slot, best); logEV(g, EVC.SUB_PH, pc.id, O.pcs[best].id); }
  }
  // 대주자(1·2루, 7회 이후 동점·1점 차 — 그 주자가 동점·역전·추가점일 때): 느린 주자(주력 ≤ prSlow)를 빠른 벤치(≥ prFast, 차 ≥ prGap)로.
  // 능력치 원래 눈금(1~100)으로 판단 — z 압축(zGain) 때문에 전에는 한 번도 일어나지 않았다.
  if (g.inning >= 7 && diff >= -1 && diff <= 1) {
    for (let b = 0; b < 2; b++) {
      const r = g.bases[b]; if (!r) continue; const rp = O.pcs[r.i]; if (rp.v[A.speed] > P.ai.prSlow) continue;
      const pos = O.posOf[r.i]; if (pos === PO.C && countCatchers(O) < 1) continue;   // 포수를 빼면 대신 앉을 포수가 있어야
      let best = -1, bs = Math.max(P.ai.prFast, rp.v[A.speed] + P.ai.prGap);
      for (const i of O.bench) { if (O.removed[i] || O.pcs[i].pitches.length) continue; if (O.pcs[i].v[A.speed] > bs) { bs = O.pcs[i].v[A.speed]; best = i; } }
      if (best >= 0) { const s = O.order.indexOf(r.i); if (s >= 0) { substitute(g, O, s, best); r.i = best; logEV(g, EVC.SUB_PR, rp.id, O.pcs[best].id); } }
    }
  }
}
/** 수비 교체(수비 쪽 반 이닝 시작): ① 대타·대주자가 낯선 자리(숙련 < 10)에 서게 되면 그 자리 벤치 선수로 ② 8회 이후 1~3점 리드면 수비가 뚜렷이 나은 벤치 선수로 굳히기 */
export function aiDefense(g: G): void {
  const D = defense(g); if ((D.user && !D.auto) || !P.ai.defSub) return;
  const lead = D.side === 1 ? g.score[1] - g.score[0] : g.score[0] - g.score[1];
  const lock = g.inning >= 8 && lead >= 1 && lead <= 3;
  for (let pos = 1; pos <= 8; pos++) {
    const i = D.field[pos]; if (i < 0) continue;
    const prof = D.pcs[i].posProf[pos];
    // 굳히기는 9회, 또는 8회라도 하위 타순(7~9번)만 — 중심 타자를 8회에 수비로 빼지 않는다
    const lockHere = lock && (g.inning >= 9 || D.order.indexOf(i) >= 6);
    if (prof >= 10 && !lockHere) continue;
    const cur = defValR(D.pcs[i], pos);
    let best = -1, bv = -1e9;
    for (const j of D.bench) {
      if (D.removed[j] || D.pcs[j].pitches.length) continue;
      if (D.pcs[j].posProf[pos] < 12) continue;
      const v = defValR(D.pcs[j], pos); if (v > bv) { bv = v; best = j; }
    }
    if (best < 0) continue;
    if (prof >= 10 && bv < cur + 0.8) continue;   // 굳히기는 수비가 뚜렷이 나을 때만
    if (prof < 10 && bv < cur) continue;
    const slot = D.order.indexOf(i); if (slot < 0) continue;
    substitute(g, D, slot, best); D.defIn[best] = 1; logEV(g, EVC.SUB_DEF, D.pcs[i].id, D.pcs[best].id);
  }
  // 큰 점수 차(7회 이후 8점↑·6회 이후 10점↑)면 주전을 쉬게 한다 — 반 이닝에 최대 2명, 포수·유격수·2루수·중견수 순
  const blow = (g.inning >= 7 && Math.abs(lead) >= 8) || (g.inning >= 6 && Math.abs(lead) >= 10);
  if (blow) {
    let n = 0;
    for (const pos of [1, 5, 3, 7, 4, 6, 8, 2]) {
      if (n >= 2) break;
      const i = D.field[pos]; if (i < 0 || D.defIn[i]) continue;
      let best = -1, bv = -1e9;
      for (const j of D.bench) { if (D.removed[j] || D.pcs[j].pitches.length || D.pcs[j].posProf[pos] < 12) continue; const v = D.pcs[j].posProf[pos]; if (v > bv) { bv = v; best = j; } }
      if (best < 0) continue;
      const slot = D.order.indexOf(i); if (slot < 0) continue;
      substitute(g, D, slot, best); D.defIn[best] = 1; n++; logEV(g, EVC.SUB_DEF, D.pcs[i].id, D.pcs[best].id);
    }
  }
}
/** 그 자리 수비 가치(원래 눈금 z, 숙련 배율 포함): 범위·첫발·포구 + 어깨 절반 */
function defValR(pc: PC, pos: number): number {
  return (defZ(pc, A.range, pos) + defZ(pc, A.firstStep, pos) + defZ(pc, A.hands, pos) + 0.5 * pc.z[A.armStr] + (pos === PO.C ? defZ(pc, A.block, pos) + pc.z[A.framing] : 0)) / P.zGain;
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
  const bvR = clamp(bv / P.zGain, -2.5, 2.5);   // 원래 눈금(표준편차 1)의 타격 가치 — zGain 압축과 무관하게 '약한 타자일수록'이 살아 있게
  const tb = O.tac.bat?.[pc.id]?.bunt;
  const styleM = O.style > 0 ? 1.6 : O.style < 0 ? 0.6 : 1;
  // 희생번트: 무사 1루(·1·2루·2루). 늦을수록·접전일수록·약한 타자·하위 타순일수록. 중심 타선·큰 점수 차는 거의 안 댄다
  if (g.outs === 0 && (g.bases[0] || g.bases[1]) && !g.bases[2] && Math.abs(diff) <= 3 && tb !== 'none' && tb !== 'drag') {
    const late = g.inning >= 9 ? 1.2 : g.inning >= 7 ? 1.0 : g.inning >= 5 ? 0.55 : 0.2;
    const sc = diff === 0 || diff === -1 ? 1.0 : diff === 1 ? 0.7 : Math.abs(diff) === 2 ? 0.25 : 0.08;
    const slot = O.next; const slotM = [0.9, 1.15, 0.3, 0.25, 0.3, 0.6, 1.0, 1.2, 1.3][slot] ?? 1;   // 3~5번(중심 타선)은 거의 안 댄다
    const baseM = g.bases[0] && g.bases[1] ? 0.9 : g.bases[1] ? 0.6 : 1;
    const pr = Math.min(0.85, P.ai.buntBase * late * sc * slotM * baseM * Math.exp(-1.3 * bvR) * (1 + 0.3 * O.tac.buntFreq) * styleM * (1 + 0.1 * clamp(pc.z[A.bunt] / P.zGain, -2, 2)));
    if (aiU(g, 11) < pr || tb === 'sac' && aiU(g, 11) < 0.5) { pa.mode = 2; return; }
  }
  // 스퀴즈: 3루 주자·1사·7회 이후 1점 차 이내, 평균보다 약한 타자
  if (g.bases[2] && g.outs === 1 && g.inning >= 7 && Math.abs(diff) <= 1 && bvR < 0 && aiU(g, 12) < 0.10 * styleM * (1 + 0.3 * O.tac.buntFreq)) { pa.mode = 4; return; }
  // 기습번트(특성)
  if (hasT(pc, TR.dragBunter) && g.outs < 2 && D.inf !== 3 && aiU(g, 13) < 0.04 * (pc.sigBat === 'lightningLegs' ? 1.5 : 1)) { pa.mode = 3; return; }
}

/** 고의4구 판단(수비 쪽, 타석 전) — 1루 빔·접전·강타자 뒤 약한 타자 */
export function aiIBB(g: G): boolean {
  const D = defense(g), O = offense(g); if (D.tac.ibb === 'never' || (D.user && !D.auto)) return false;   // 유저 수동 모드: 고의4구는 유저 명령('ibb')으로만 [18]
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
  // 2·3루 1사 병살 노리기는 접전(±2점)일 때만 — 크게 이기거나 지는 경기에서 주자를 채우는 감독은 없다
  return (late || (g.inning >= 5 && bc === 6 && g.outs === 1 && diffD >= -2 && diffD <= 2)) && gain > margin && g.bases[1] !== null;
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
export interface PrePitch { steal2: boolean; steal3: boolean; pitchout: boolean; hitRun: boolean; ibb: boolean; pick: number }
const PRE: PrePitch = { steal2: false, steal3: false, pitchout: false, hitRun: false, ibb: false, pick: 0 };
/** 도루·히트앤런·피치아웃 판단 */
export function aiPrePitch(g: G): PrePitch {
  PRE.steal2 = false; PRE.steal3 = false; PRE.pitchout = false; PRE.hitRun = false; PRE.ibb = false;
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
    // 점수 상황(불문율·의미 없는 진루): 6회 이후 5점 이상 앞서면 도루 자제, 7회 이후 4점 이상 지면 아웃 위험을 피함
    const diffO = O.side === 1 ? g.score[1] - g.score[0] : g.score[0] - g.score[1];
    const sit = (g.inning >= 6 && diffO >= 5) ? 0.05 : (g.inning >= 7 && diffO <= -4) ? 0.15 : (Math.abs(diffO) >= 7) ? 0.3 : 1;
    const q = 0.30 * S.attemptScale * sit * (hasT(rp, TR.stealsOften) ? P.steal.often * (rp.sigBat === 'lightningLegs' ? 1.3 : 1) : 1) * (tb === 'green' ? 1.5 : 1) * (1 + 0.3 * O.tac.stealFreq) * (hasT(cpc, TR.runnerKiller) ? 0.85 : 1);
    return aiU(g, 51 + from) < q;
  };
  if (!(O.user && !O.auto)) {
    if (g.bases[0] && !g.bases[1]) PRE.steal2 = tryBase(0);
    else if (g.bases[1] && !g.bases[2] && g.outs < 2) PRE.steal3 = tryBase(1) && aiU(g, 53) < 0.35;
    // 히트앤런
    const dO = O.side === 1 ? g.score[1] - g.score[0] : g.score[0] - g.score[1];
    if (!PRE.steal2 && g.bases[0] && !g.bases[1] && outs < 2 && Math.abs(dO) <= 4 && (g.balls === 1 && g.strikes === 0 || g.balls === 2 && g.strikes === 1 || g.balls === 3 && g.strikes === 1)) {
      const b = O.pcs[pa.b]; if ((b.z[A.contactR] + b.z[A.contactL]) / P.zGain >= 1.0 && b.z[A.avoidK] >= 0 && aiU(g, 61) < 0.06 * (1 + 0.4 * O.tac.hitRunFreq)) { PRE.hitRun = true; pa.mode = 1; }
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
/** 유저 명령으로 마운드에 올릴 수 있는 투수인가 [18 재미·악용 심사]
 *  불펜 명단에 있고(avail ≥ 1 — 0 은 사흘 연속·어제 30구↑ 등 규칙상 등판 불가), 아직 안 던졌고, 지금 투수가 아니고, 수비에 서 있지 않은 투수만.
 *  전에는 ① 지금 투수를 다시 '교체'하면 피로가 0으로 되돌아가(선발 평균 154구·8.8이닝, 다음 날 피로 계산엔 뒤 등판분만 남음)
 *  ② 등판 불가 투수도 올릴 수 있어(혹사 비용 없이 승률 +3.1%p) ③ 야수·없는 구종의 선수를 올리면 투구 계산이 멈출 수 있었다. */
function canEnter(T: TeamSt, i: number): boolean {
  if (i === T.pit.i || T.removed[i] || T.posOf[i] >= 0 || !T.pcs[i].pitches.length) return false;
  const pe = T.pen.find((p) => p.i === i); return !!pe && !pe.used && pe.avail >= 1;
}
export function applyCommands(g: G, pre: PrePitch): void {
  const L = g.cmds; if (!L || g.cmdPtr >= L.length) return;
  let realign = false;
  while (g.cmdPtr < L.length && (L[g.cmdPtr] as Command).at <= g.pitchNo) {
    const c = L[g.cmdPtr++] as Command; const T = c.team === 'home' ? g.T[1] : c.team === 'away' ? g.T[0] : null;
    // 유저 팀 명령만 받는다 [18]: 전에는 상대(AI) 팀 이름으로 보낸 명령도 적용돼, 상대에게 매 투구 희생번트를 시키면 홈 승률 .453 → .943
    if (!T || !T.user) continue;
    const isOff = T === offense(g);
    switch (c.k) {
      case 'auto': T.auto = !!c.v; break;
      case 'approach': T.approach = c.v === 'aggressive' ? 1 : c.v === 'patient' ? 2 : c.v === 'power' ? 3 : c.v === 'contact' ? 4 : 0; break;
      case 'steal': if (isOff) { if (c.base === 2 && g.bases[0] && !g.bases[1]) pre.steal2 = true; if (c.base === 3 && g.bases[1] && !g.bases[2]) pre.steal3 = true; } break;
      case 'hitRun': if (isOff && g.bases[0]) { pre.hitRun = true; g.pa.mode = 1; } break;
      case 'bunt': if (isOff) g.pa.mode = c.type === 'sac' ? 2 : c.type === 'drag' ? 3 : 4; break;
      case 'take': if (isOff) g.pa.mode = 5; break;
      case 'swingAway': if (isOff) g.pa.mode = 0; break;
      // 피치아웃은 뛸 수 있는 주자가 있을 때만 [18]: 전에는 매 투구 피치아웃 = 끝없는 볼넷(한 경기 3,400구·상대 212점, CPU 7.7ms)
      case 'pitchout': if (!isOff && ((g.bases[0] && !g.bases[1]) || (g.bases[1] && !g.bases[2]))) pre.pitchout = true; break;
      // 고의4구(자동 고의4구, 아무 카운트에서나) — 유저 수동 모드에서는 AI 고의4구가 꺼지므로 이 명령으로만
      case 'ibb': if (!isOff) pre.ibb = true; break;
      // 수비 대형 — 정한 대형은 바꿀 때까지 유지(자동이면 AI 가 다시 맡음). 이번 타자부터 바로 선다
      case 'infield': if (!isOff) {
        if (c.v === 'auto') T.alignFixed = false;
        else { T.inf = c.v === 'dp' ? 1 : c.v === 'in' ? 2 : c.v === 'cornersIn' ? 3 : c.v === 'shift' ? 4 : c.v === 'lines' ? 5 : 0; T.alignFixed = true; }
        realign = true;
      } break;
      case 'outfield': if (!isOff) {
        if (c.v === 'auto') T.alignFixed = false;
        else { T.of = c.v === 'deep' ? 1 : c.v === 'shallow' ? 2 : c.v === 'pull' ? 3 : c.v === 'oppo' ? 4 : c.v === 'noDoubles' ? 5 : 0; T.alignFixed = true; }
        realign = true;
      } break;
      // 견제 — 이번 공 앞에 한 번 (그 루에 주자가 있을 때만)
      case 'pickoff': if (!isOff && (c.base === 1 || c.base === 2) && g.bases[c.base - 1]) pre.pick = c.base; break;
      // 마운드 방문 — 흔들린 투수를 진정(경기당 5번)
      case 'visit': if (!isOff) {
        const S = (g.ev as { S?: { rattled: boolean; visitLeft: number }[] } | undefined)?.S?.[T.side];
        if (S && S.visitLeft > 0) { S.visitLeft--; S.rattled = false; logEV(g, EVC.VISIT, T.pit.i, 1); g.clock += P.clock.visit; }
      } break;
      case 'pitcher': if (!isOff) { const i = T.idOf.get(c.inPid); if (i !== undefined && canEnter(T, i)) changePitcher(g, T, i, T.pen.find((p) => p.i === i)?.role ?? 'MID'); } break;
      case 'pinchHit': if (isOff) { const i = T.idOf.get(c.inPid); if (i !== undefined && T.bench.includes(i)) { const out = T.order[T.next]; substitute(g, T, T.next, i); logEV(g, EVC.SUB_PH, T.pcs[out].id, T.pcs[i].id); } } break;
      case 'pinchRun': if (isOff) { const r = g.bases[c.base - 1]; const i = T.idOf.get(c.inPid); if (r && i !== undefined && T.bench.includes(i)) { const s = T.order.indexOf(r.i); if (s >= 0) { const out = r.i; substitute(g, T, s, i); r.i = i; logEV(g, EVC.SUB_PR, T.pcs[out].id, T.pcs[i].id); } } } break;
      default: break;
    }
  }
  if (realign) { const D = defense(g), O = offense(g); setAlignment(g, D, O.pcs[g.pa.b], g.pa.bL ? 1 : -1); }
}
export { clamp };
