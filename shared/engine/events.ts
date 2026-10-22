// 12 이벤트 — 경기 중 판정·효과·상호작용(부름·키움·막음·끝냄)·감쇠(경기당 횟수·지속·층 상한).
// 확률형 판정은 카운터 해시 난수(u01) — 엔진 P·B 스트림과 섞이지 않아, 이벤트를 켜고 꺼도 같은 공은 같은 난수(켬/끔 비교 실험 가능).
// 효과는 채널 값으로만 들어가고(pitch.ts capCh: 물리 0.30·tanh, 심리 0.113·tanh, 합 ±0.47), 따로 곱하는 '모멘텀 계수'는 없다.
import { EVENTS, EDGES, type EvDef } from './data/events.ts';
import { u01, hashStr, clamp } from './rng.ts';
import { A, HD, CH, N_CH } from './player.ts';
import { type G, type TeamSt, PO, R } from './state.ts';
import { logEV, EVC } from './log.ts';

const E: Record<string, EvDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
const HID: Record<string, number> = Object.fromEntries(EVENTS.map((e) => [e.id, hashStr(e.id)]));
const base = (id: string, d = 0): number => E[id]?.base ?? d;
const effV = (id: string, ch: string, d: number, nth = 0): number => { const l = (E[id]?.eff ?? []).filter((f) => f[1] === ch); return l[nth] ? l[nth][2] : d; };
// 키움·막음 배율표: 대상 → [(출발, 배율)]
const AMP: Record<string, [string, number][]> = {};
for (const [from, to, type, m] of EDGES) if ((type === 'amplifies' || type === 'blocks') && m > 0) (AMP[to] ??= []).push([from, m]);

// 효과 크기(데이터에서)
const V = {
  rattledCtl: effV('pit_rattled', 'pit.control', -0.08), rattledStuff: effV('pit_rattled', 'pit.stuff', -0.03),
  inZoneCtl: effV('pit_in_zone', 'pit.control', 0.04), inZoneStuff: effV('pit_in_zone', 'pit.stuff', 0.03),
  coldCtl: effV('pit_cold_arm', 'pit.control', -0.06), coldStuff: effV('pit_cold_arm', 'pit.stuff', -0.03),
  blCtl: effV('pit_bases_loaded', 'pit.control', 0.06), blAggr: effV('pit_bases_loaded', 'bat.aggr', 0.06), blCrack: effV('pit_bases_loaded', 'pit.control', -0.10, 1),
  rallyCon: effV('bench_dugout_rally', 'bat.contact', 0.015), rallyEye: effV('bench_dugout_rally', 'bat.eye', 0.01),
  momCon: effV('bench_momentum', 'bat.contact', 0.01), roarCon: effV('env_crowd_roar', 'bat.contact', 0.015), roarCtl: effV('env_crowd_roar', 'pit.control', -0.04),
  duelCtl: effV('run_steal_duel', 'pit.control', -0.02), duelCon: effV('run_steal_duel', 'bat.contact', 0.015),
  shakenErr: Math.log(1 + effV('fld_error_shaken', 'fld.error', 0.4)), shakenCon: effV('fld_error_shaken', 'bat.contact', -0.02),
  nohitStuff: effV('rec_nohit_watch', 'pit.stuff', 0.02), nohitCtl: effV('rec_nohit_watch', 'pit.control', -0.04), nohitAggr: effV('rec_nohit_watch', 'bat.aggr', 0.06),
  cycPow: effV('bat_cycle_chase', 'bat.power', 0.04), cycCon: effV('bat_cycle_chase', 'bat.contact', -0.04),
  rhythmCtl: effV('env_rhythm_loss', 'pit.control', -0.08), rhythmStuff: effV('env_rhythm_loss', 'pit.stuff', -0.04),
  visitCtl: effV('pit_mound_visit', 'pit.control', 0.03),
};
const kc = (comp20: number): number => clamp(1.6 - 0.06 * comp20, 0.4, 1.5);
const kt = (t: number): number => clamp(0.4 + 0.06 * t, 0.4, 1.6);
const collapse = (comp100: number): number => 1.4 - 0.008 * comp100;

export interface EvSide {
  rattled: boolean; rattledN: number; rattledChecks: number; inZone: boolean; inZoneUsed: boolean; inZoneInn: number; inZoneOn: number;
  coldLeft: number; rhythmInn: number; visitLeft: number;
  rally: boolean; rallyUsed: boolean; momentum: boolean; shaken: number; shakenPos: number;
  nohit: boolean; perfect: boolean; hits: number; onBase: number; spK: number; kShow: boolean;
  onStreak: number; onAllowed: number; consecOuts: number; hadErr: boolean; runsAfterErr: number; battersHalf: number; runsHalf: number;
  roarDone: boolean; roar: boolean; lastHRord: number; b2b: boolean; hbpGiven: number;
}
const newSide = (): EvSide => ({ rattled: false, rattledN: 0, rattledChecks: 0, inZone: false, inZoneUsed: false, inZoneInn: 0, inZoneOn: 0, coldLeft: 0, rhythmInn: 0, visitLeft: 5,
  rally: false, rallyUsed: false, momentum: false, shaken: 0, shakenPos: -1, nohit: false, perfect: false, hits: 0, onBase: 0, spK: 0, kShow: false,
  onStreak: 0, onAllowed: 0, consecOuts: 0, hadErr: false, runsAfterErr: 0, battersHalf: 0, runsHalf: 0, roarDone: false, roar: false, lastHRord: -9, b2b: false, hbpGiven: 0 });
export interface EvState {
  on: boolean; seed: number; S: [EvSide, EvSide]; crowd: number; tension: number; warning: boolean; clearing: boolean;
  derby: boolean; gale: boolean; heat: boolean; cold: boolean; awayFans: boolean; cnt: Map<string, number>; perGame: Map<string, number>;
  cycle: Map<number, number>; cycleChase: Set<number>; maxDef: [number, number]; lateDef: [number, number]; injCtr: number; blCrack: boolean; duel: boolean;
}
export function initEvents(g: G): EvState {
  const cx = g.inp.ctx.crowd;
  const fan = cx?.fan ?? 55;
  return { on: g.evOn, seed: g.seed[3], S: [newSide(), newSide()], crowd: Math.min(100, 0.6 * fan + (cx?.weekend ? 10 : 0) + (cx?.derby ? 20 : 0) + 22), tension: cx?.derby ? 10 : 0, warning: false, clearing: false,
    derby: !!cx?.derby, gale: false, heat: false, cold: false, awayFans: !!cx?.awayFans, cnt: new Map(), perGame: new Map(), cycle: new Map(), cycleChase: new Set(), maxDef: [0, 0], lateDef: [0, 0], injCtr: 0, blCrack: false, duel: false };
}
function fire(g: G, id: string): boolean {
  const ev = g.ev as EvState; const cap = E[id]?.perGame ?? 0; const n = ev.perGame.get(id) ?? 0;
  if (cap > 0 && n >= cap) return false;
  ev.perGame.set(id, n + 1); ev.cnt.set(id, (ev.cnt.get(id) ?? 0) + 1);
  if (g.col?.event) g.col.event(id);
  logEV(g, EVC.EVENT, EVENTS.indexOf(E[id]), 0);
  return true;
}
/** 감지형(확률 없이 일어난 사실) 기록 */
export function note(g: G, id: string): void { const ev = g.ev as EvState; if (!ev) return; ev.cnt.set(id, (ev.cnt.get(id) ?? 0) + 1); if (g.col?.event) g.col.event(id); }
/** 키움·막음 배율: 지금 켜진 출발 이벤트들의 곱 */
function amp(g: G, to: string, side: number): number {
  const L = AMP[to]; if (!L) return 1; const ev = g.ev as EvState; const S = ev.S[side], O = ev.S[1 - side];
  let m = 1;
  for (const [from, k] of L) {
    let act = false;
    switch (from) {
      case 'pit_rattled': act = S.rattled || O.rattled; break;
      case 'pit_pitch_wall': { const D = g.T[1 - g.half]; act = D.pit.F > D.pcs[D.pit.i].limit; break; }
      case 'env_rain_heavier': act = g.slot.rainLv >= 2; break;
      case 'env_gale': act = ev.gale; break;
      case 'env_heat_game': act = ev.heat; break;
      case 'env_cold_night': act = ev.cold; break;
      case 'season_derby_week': act = ev.derby; break;
      case 'season_postseason': act = g.inp.ctx.importance >= 2; break;
      case 'bench_momentum': act = O.momentum || S.momentum; break;
      case 'pit_bases_loaded': act = !!(g.bases[0] && g.bases[1] && g.bases[2]); break;
      case 'env_crowd_roar': act = ev.S[1].roar; break;
      case 'pit_mound_visit': act = false; break;
      case 'rec_nohit_watch': act = S.nohit || O.nohit; break;
      case 'run_steal_duel': act = ev.duel; break;
      case 'bench_beanball': act = ev.tension >= 25; break;
      default: act = false;
    }
    if (act) m *= k;
  }
  return m;
}

/** 경기 전 감지(강풍·무더위·꽃샘추위·원정 팬) */
export function evPreGame(g: G): void {
  const ev = g.ev as EvState; const s = g.slot;
  if (!g.wx.dome) {
    if (s.windMs >= 6 || s.gustMs >= 12) { ev.gale = true; note(g, 'env_gale'); }
    if (s.atC >= 30) { ev.heat = true; note(g, 'env_heat_game'); }
    if (s.tC <= 8) { ev.cold = true; note(g, 'env_cold_night'); }
  }
  if (ev.awayFans) note(g, 'env_away_fans');
}

/** 반 이닝 시작: 결집·어깨 식음·응원 초기화·노히트 감시 */
export function evHalfStart(g: G): void {
  const ev = g.ev as EvState; if (!ev.on) return;
  const off = g.half, def = 1 - g.half; const O = ev.S[off], D = ev.S[def];
  O.roarDone = false; O.roar = false; ev.S[1].roar = false;
  D.onStreak = 0; D.onAllowed = 0; D.consecOuts = 0; D.hadErr = false; D.runsAfterErr = 0; D.battersHalf = 0; D.runsHalf = 0; D.rattledChecks = 0;
  const diff = g.score[off] - g.score[def];
  const Ot = g.T[off];
  // 더그아웃 결집(7회 이후 1~3점 열세, 분위기 45 이상)
  if (!O.rallyUsed && g.inning >= 7 && diff < 0 && diff >= -3 && Ot.mood >= 45) {
    const lead = Ot.pcs[Ot.order[0]].v[A.leadership] / 5;
    if (u01(ev.seed, 2, HID.bench_dugout_rally, g.inning * 2 + g.half) < base('bench_dugout_rally', 0.12) * (lead / 10) * amp(g, 'bench_dugout_rally', off)) { if (fire(g, 'bench_dugout_rally')) { O.rally = true; O.rallyUsed = true; } }
  }
  // 어깨 식음: 직전 우리 공격이 길었으면(9타자 이상)
  if (D.coldLeft === -1) {
    D.coldLeft = 0;
    const t = g.slot.tC;
    if (u01(ev.seed, 2, HID.pit_cold_arm, g.inning * 2 + g.half) < base('pit_cold_arm', 0.35) * (t < 10 ? 1.5 : t > 28 ? 0.6 : 1) * amp(g, 'pit_cold_arm', def)) { if (fire(g, 'pit_cold_arm')) { D.coldLeft = 2; D.inZone = false; } }
  }
  if (D.rhythmInn > 0 && g.inning > D.rhythmInn) D.rhythmInn = 0;
  if (D.inZone && g.inning - D.inZoneInn >= 3) D.inZone = false;
}

/** 타석 시작: 상황 이벤트 + 이번 타석 채널 합산(타자 bP/bS, 투수 pP/pS) */
export function evPAStart(g: G, bP: Float64Array, bS: Float64Array, pP: Float64Array, pS: Float64Array): void {
  bP.fill(0); bS.fill(0); pP.fill(0); pS.fill(0);
  const ev = g.ev as EvState; if (!ev.on) return;
  const off = g.half, def = 1 - g.half; const O = ev.S[off], D = ev.S[def];
  const Dt = g.T[def], Ot = g.T[off];
  const pc = Dt.pcs[Dt.pit.i]; const comp100 = pc.v[A.composure];
  const diff = g.score[off] - g.score[def];
  ev.blCrack = false; ev.duel = false;
  // 투수 상태
  if (D.rattled) { const k = collapse(comp100); pS[CH.control] += V.rattledCtl * k; pS[CH.stuff] += V.rattledStuff * k; }
  if (D.inZone) { pS[CH.control] += V.inZoneCtl; pS[CH.stuff] += V.inZoneStuff; }
  if (D.coldLeft > 0) { pS[CH.control] += V.coldCtl; pS[CH.stuff] += V.coldStuff; }
  if (D.rhythmInn > 0) { pP[CH.control] += V.rhythmCtl; pP[CH.stuff] += V.rhythmStuff; }
  if (D.nohit && g.inning >= 7) { const c20 = comp100 / 5; if (c20 >= 14) pS[CH.stuff] += V.nohitStuff; else if (c20 <= 7) pS[CH.control] += V.nohitCtl; bS[CH.aggr] += V.nohitAggr; }
  if (D.shaken > 0) pS[CH.error] += V.shakenErr;
  // 만루 정면승부
  if (g.bases[0] && g.bases[1] && g.bases[2]) {
    note(g, 'pit_bases_loaded');
    pS[CH.control] += V.blCtl; bS[CH.aggr] += V.blAggr;
    const P0 = clamp((g.pa.li - 1) / 3, 0, 1) + 0.2;
    if (u01(ev.seed, 3, HID.pit_bases_loaded, g.paNo) < 0.25 * kc(comp100 / 5) * (P0 >= 0.6 ? 1.3 : 1)) { pS[CH.control] += V.blCrack; ev.blCrack = true; }
  }
  // 도루 신경전: 빠른 1루 주자(2루 빔)
  if (g.bases[0] && !g.bases[1]) { const rp = Ot.pcs[g.bases[0].i]; if (rp.v[A.speed] >= 70 && rp.v[A.stealJump] >= 60) { ev.duel = true; note(g, 'run_steal_duel'); pS[CH.control] += V.duelCtl; bS[CH.contact] += V.duelCon; } }
  // 공격 팀 상태
  if (O.rally) { bS[CH.contact] += V.rallyCon; bS[CH.eye] += V.rallyEye; }
  if (O.momentum) bS[CH.contact] += V.momCon;
  // 응원 폭발(홈 공격, 7회 이후, 0~3점 열세 득점권 또는 1점 이내 주자)
  if (off === 1 && !O.roarDone && g.inning >= 7 && diff <= 0 && diff >= -3) {
    const risp = !!(g.bases[1] || g.bases[2]), runners = !!(g.bases[0] || g.bases[1] || g.bases[2]);
    if ((risp || (runners && diff >= -1)) && ev.crowd >= 60) {
      O.roarDone = true;
      const pr = (base('env_crowd_roar', 0.4) + 0.006 * (ev.crowd - 60)) * (ev.derby ? 1.4 : 1) * (g.slot.rainLv >= 2 ? 0.6 : 1) * (ev.awayFans ? 0.5 : 1) * amp(g, 'env_crowd_roar', 1);
      if (u01(ev.seed, 2, HID.env_crowd_roar, g.inning) < pr && fire(g, 'env_crowd_roar')) O.roar = true;
    }
  }
  if (off === 1 && O.roar) { bS[CH.contact] += V.roarCon; if (comp100 / 5 <= 9) pS[CH.control] += V.roarCtl; }
  // 사이클 도전
  const bid = Ot.pcs[g.pa.b].id;
  if (ev.cycleChase.has(bid)) { bS[CH.power] += V.cycPow; bS[CH.contact] += V.cycCon; }
  // 실책 뒤 위축 수비수가 타석에 서면 컨택 −2%
  if (O.shakenPos >= 0 && Ot.field[O.shakenPos] === g.pa.b && O.shaken > 0) bS[CH.contact] += V.shakenCon;
  void diff;
}
export const tmpCh = { bP: new Float64Array(N_CH), bS: new Float64Array(N_CH), pP: new Float64Array(N_CH), pS: new Float64Array(N_CH) };

/** 타석 끝: 흔들림·무아지경·기록 이벤트·위협구 */
export function evPAEnd(g: G, res: number, onBase: boolean, isHit: boolean, runs: number, outsMade: number, wasK: boolean, hbp: boolean): void {
  const ev = g.ev as EvState;
  const off = g.half, def = 1 - g.half; const O = ev.S[off], D = ev.S[def];
  const Dt = g.T[def], Ot = g.T[off];
  D.battersHalf++; D.runsHalf += runs;
  if (D.hadErr) D.runsAfterErr += runs;
  if (isHit) { D.hits++; if (D.nohit) { D.nohit = false; note(g, 'rec_nohit_broken'); } }
  if (onBase) { D.onBase++; D.perfect = false; }
  if (wasK && Dt.pit.starter) { D.spK++; if (D.spK >= 11 && !D.kShow) { D.kShow = true; note(g, 'rec_k_show'); } }
  // 대기록·사이클
  const bid = Ot.pcs[g.pa.b].id;
  if (isHit) {
    const bits = res === R.S1 ? 1 : res === R.S2 ? 2 : res === R.S3 ? 4 : res === R.HR ? 8 : 0;
    const cur = (ev.cycle.get(bid) ?? 0) | bits; ev.cycle.set(bid, cur);
    if (cur === 15 && !ev.cycleChase.has(-bid)) { ev.cycleChase.add(-bid); note(g, 'rec_cycle_done'); }
    else if (g.inning >= 6 && popcnt(cur) === 3 && !ev.cycleChase.has(bid)) { ev.cycleChase.add(bid); note(g, 'bat_cycle_chase'); }
    if (res === R.HR) { const ord = Ot.next; if (O.lastHRord === (ord + 8) % 9) note(g, 'bat_back_to_back'); O.lastHRord = ord; }
  }
  if (!ev.on) return;
  if (D.shaken > 0) D.shaken--;
  if (D.coldLeft > 0) D.coldLeft--;
  // 출루 연속·흔들림
  if (onBase) {
    D.onStreak++; D.onAllowed++; D.consecOuts = 0;
    if (D.inZone) { D.inZoneOn++; if (D.inZoneOn >= 2) D.inZone = false; }
    if (!D.rattled && D.rattledChecks < 2 && (D.onStreak >= 2 || D.onAllowed >= 3) && D.rattledN < 3) {
      D.rattledChecks++;
      const pc = Dt.pcs[Dt.pit.i];
      const lead = Dt.pcs[Dt.field[PO.C]].v[A.leadership] >= 75 || Dt.chemTier >= 2;
      const pr = base('pit_rattled', 0.16) * kc(pc.v[A.composure] / 5) * (D.hadErr ? 1.25 : 1) * (def === 0 && ev.crowd >= 70 ? 1.2 : 1) * (lead ? 0.75 : 1) * (D.rattledN > 0 ? 1.3 : 1) * (pc.age >= 33 ? 0.8 : 1) * amp(g, 'pit_rattled', def);
      if (u01(ev.seed, 2, HID.pit_rattled, g.paNo) < pr && fire(g, 'pit_rattled')) {
        D.rattled = true; D.rattledN++; D.inZone = false;
        // AI 코치 마운드 방문 70%
        if (D.visitLeft > 0 && u01(ev.seed, 4, g.paNo, 1) < 0.7) {
          D.visitLeft--; note(g, 'pit_mound_visit'); logEV(g, EVC.VISIT, Dt.pit.i, 0); g.clock += 35;
          const cl = Dt.pcs[Dt.field[PO.C]].v[A.leadership] / 5;
          if (u01(ev.seed, 2, HID.pit_mound_visit, g.paNo) < Math.min(0.95, base('pit_mound_visit', 0.45) + 0.02 * cl + 0.03 * Dt.chemTier + 0.10)) D.rattled = false;
        }
      }
    }
  } else { D.onStreak = 0; D.consecOuts += outsMade; if (D.rattled && D.consecOuts >= 2) D.rattled = false; }
  // 무아지경
  if (!D.inZoneUsed && Dt.pit.starter) {
    const ps = Dt.pit;
    if (ps.bf >= 9 && ps.h + ps.bb + ps.hbp === 0 && ps.outs >= 9 || (g.inning <= 5 && D.spK >= 7 && D.onBase <= 2)) {
      D.inZoneUsed = true;
      const c20 = Dt.pcs[ps.i].v[A.composure] / 5;
      if (u01(ev.seed, 2, HID.pit_in_zone, g.paNo) < base('pit_in_zone', 0.4) * Math.sqrt(c20 / 10) && fire(g, 'pit_in_zone')) { D.inZone = true; D.inZoneInn = g.inning; D.inZoneOn = 0; }
    }
  }
  // 위협구 시비(몸맞공 뒤)
  if (hbp) {
    const prior = D.hbpGiven > 0 || O.hbpGiven > 0;
    const temp = g.slot.tC;
    const tmp = (Dt.pcs[Dt.pit.i].h[HD.temperament] + Ot.pcs[g.pa.b].h[HD.temperament]) / 2;
    const pb = base('bench_beanball', 0.04) * (prior ? (temp >= 30 ? 2.6 : 2) : 1) * (temp >= 30 ? 1.3 : 1) * (ev.derby ? 1.5 : 1) * (Math.abs(g.score[0] - g.score[1]) >= 6 ? 1.3 : 1) * (ev.warning ? 0.4 : 1) * kt(21 - tmp) * amp(g, 'bench_beanball', def);
    if (u01(ev.seed, 2, HID.bench_beanball, g.paNo) < pb && fire(g, 'bench_beanball')) {
      ev.tension += 25;
      if (!ev.clearing && u01(ev.seed, 2, HID.bench_clearing, g.paNo) < (base('bench_clearing', 0.15) + 0.005 * Math.max(0, ev.tension - 50)) * kt(21 - tmp) * (ev.derby ? 1.3 : 1) && fire(g, 'bench_clearing')) { ev.clearing = true; ev.tension = 100; ev.warning = true; }
      if (u01(ev.seed, 2, HID.bench_beanball + 1, g.paNo) < 0.6) ev.warning = true;
    }
    D.hbpGiven++;
  }
}
const popcnt = (x: number): number => (x & 1) + ((x >> 1) & 1) + ((x >> 2) & 1) + ((x >> 3) & 1);

/** 플레이 직후: 실책 뒤 위축 · 슈퍼 캐치 */
export function evPlay(g: G, errPos: number, catchP: number, caught: boolean): void {
  const ev = g.ev as EvState; const def = 1 - g.half; const D = ev.S[def]; const Dt = g.T[def];
  if (caught && catchP < 0.30) { note(g, 'fld_web_gem'); if (ev.on && D.rattled && u01(ev.seed, 5, g.paNo, 2) < 0.3) D.rattled = false; }
  if (errPos < 0) return;
  D.hadErr = true;
  if (!ev.on) return;
  const pc = Dt.pcs[Dt.field[errPos]];
  if (u01(ev.seed, 2, HID.fld_error_shaken, g.paNo) < base('fld_error_shaken', 0.3) * kc(pc.v[A.composure] / 5) * (ev.crowd >= 70 && def === 0 ? 1.2 : 1) && fire(g, 'fld_error_shaken')) { D.shaken = 4; D.shakenPos = errPos; ev.S[def].shakenPos = errPos; }
}

/** 반 이닝 끝: 흐름 전환·동료 감싸기·노히트 감시·큰 점수 차 */
export function evHalfEnd(g: G): void {
  const ev = g.ev as EvState;
  const off = g.half, def = 1 - g.half; const O = ev.S[off], D = ev.S[def];
  const runs = D.runsHalf;
  if (runs >= 4) { note(g, 'bench_momentum'); O.momentum = ev.on; } else O.momentum = false;
  if (D.hadErr && D.runsAfterErr === 0 && u01(ev.seed, 2, HID.fld_teammate_cover, g.inning * 2 + g.half) < base('fld_teammate_cover', 0.6)) { note(g, 'fld_teammate_cover'); D.shaken = 0; }
  if (D.battersHalf >= 9) D.coldLeft = -1;      // 다음 수비 반 이닝 시작 때 판정(공격한 팀의 투수 = O 쪽)
  if (D.battersHalf >= 9) O.coldLeft = -1;
  D.rattled = false; O.roar = false;
  ev.tension = Math.max(0, ev.tension - 15);
  if (g.inning === 6 && g.half === 1) for (const s of [0, 1]) { if (ev.S[s].hits === 0) { ev.S[s].nohit = true; note(g, 'rec_nohit_watch'); if (ev.S[s].onBase === 0) { ev.S[s].perfect = true; note(g, 'rec_perfect_watch'); } } }
  if (g.inning >= 7 && Math.abs(g.score[0] - g.score[1]) >= 7) note(g, 'bench_mopup');
  // 대역전 추적
  const d0 = g.score[1] - g.score[0];
  if (-d0 > ev.maxDef[1]) ev.maxDef[1] = -d0; if (d0 > ev.maxDef[0]) ev.maxDef[0] = d0;
  if (g.inning >= 7) { if (-d0 > ev.lateDef[1]) ev.lateDef[1] = -d0; if (d0 > ev.lateDef[0]) ev.lateDef[0] = d0; }
}
/** 투수 교체: 흔들림·무아지경 해제 */
export function evPitcherChange(g: G, side: number): void { const S = (g.ev as EvState).S[side]; S.rattled = false; S.inZone = false; S.coldLeft = Math.max(0, S.coldLeft); S.rhythmInn = 0; }
/** 우천 재개 뒤 선발 리듬 상실 */
export function evRhythm(g: G, side: number, mins: number): void {
  const S = (g.ev as EvState).S[side]; const T = g.T[side];
  if (T.pit.starter && mins >= 30) { note(g, 'env_rhythm_loss'); if ((g.ev as EvState).on) S.rhythmInn = g.inning + 2; }
}
export function evGameEnd(g: G, walkoff: boolean): void {
  const ev = g.ev as EvState;
  if (walkoff) note(g, 'rec_walkoff');
  const w = g.score[1] > g.score[0] ? 1 : g.score[0] > g.score[1] ? 0 : -1;
  if (w === 0 || w === 1) { if (ev.maxDef[w] >= 5 || ev.lateDef[w] >= 4) note(g, 'rec_comeback'); }
}
export function eventCounts(g: G): { id: string; n: number }[] { const ev = g.ev as EvState; const out: { id: string; n: number }[] = []; for (const [id, n] of ev.cnt) out.push({ id, n }); return out; }
export type { TeamSt };
