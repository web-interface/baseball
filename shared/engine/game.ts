// 한 경기 — 공 하나 단위 루프. setup → (반 이닝: 날씨·이벤트 → 타석: AI·명령 → 투구 → 판정 → 플레이) → 마무리(박스·결정·해시·기록)
import { P } from './params.ts';
import { Sfc32, sub, u01, clamp } from './rng.ts';
import { buildCache, A, hasT, TR, N_CH, type PC } from './player.ts';
import type { GameInput, GameResult, TeamIn, PitLine } from './types.ts';
import { type G, type TeamSt, type PitSt, PO, R, newPaCtx, offense, defense, basesCode, POS_NAME } from './state.ts';
import { buildFence, setAlignment, pcAt } from './fielding.ts';
import { beginPA, throwPitch, PT, PR, KIND, capCh } from './pitch.ts';
import { battedBall, sprayAngle, BB, type BatIn } from './batted.ts';
import { resolveBIP, PL, walk, advanceAll, stealPlay, pickoffPlay, playBunt } from './running.ts';
import { aiPitching, aiSubs, aiOffenseMode, aiIBB, aiAlign, aiPrePitch, aiPickoffs, aiDefense, applyCommands, resolveTac, newPitSt, changePitcher, substitute } from './tactics.ts';
import { addPitch, restBreak } from './fatigue.ts';
import { expose, EX } from './injury.ts';
import { initEvents, evPreGame, evHalfStart, evHalfEnd, evPAStart, evPAEnd, evPlay, evRhythm, evGameEnd, eventCounts, tmpCh, note } from './events.ts';
import { newLog, newBat, newPit, batLine, pitLine, fldLine, bkOut, bkPO, bkA, closeBB, logPitch, logEV, EVC, buildRecord, recNo, type LogBuf } from './log.ts';
import { homeWE } from './we.ts';
import { windAt } from './weather.ts';
const WO = new Float64Array(2);
function windOut(g: G): number { if (g.wx.dome) return 0; windAt(g.slot, g.park, 0, WO); return g.park.expoHigh > 0 ? WO[0] / (g.park.expoHigh * P.air.expo) : 0; }

const PRE_SLOTS = 18;
/** 안전 상한 [18 재미·악용 심사]: 한 경기 투구 수가 이만큼이면 그 자리에서 콜드(점수 그대로, 같으면 무승부).
 *  실제 리그 최장급(12회 450구 안팎)·엔진 극단 시험(20회 제한 660구, 전원 99 vs 전원 1 670구)보다 넉넉히 크고, 요청당 CPU 10ms 안(1,000구 ≈ 3ms).
 *  전에는 상한이 없어 명령 폭탄(매 투구 피치아웃)으로 한 경기 3,400구까지 갔다 — 명령 수로 늘어나는 CPU·끝나지 않는 경기로 결과를 무효화하는 길을 막는다. */
const MAX_PITCHES = 1000, MAX_CMDS = 1000;   // 명령은 보낸 순서로 앞 1,000개만(= 투구 상한 — 투구마다 하나씩 보내도 모자라지 않게). 무작위 명령 1,000개 폭탄도 경기당 CPU p99 5ms 안

function buildTeam(g: G, tin: TeamIn, side: 0 | 1): TeamSt {
  const pcs: PC[] = []; const idOf = new Map<number, number>();
  // 이 경기에 나올 수 있는 선수만 캐시(라인업·선발·불펜·벤치) — 2군·부상자는 건너뜀
  const need = new Set<number>([tin.sp, ...tin.lineup.map((l) => l.pid), ...tin.pen.map((x) => x.pid), ...tin.bench]);
  const ref = clamp(Number(g.inp.levelRef) || 0, -20, 60);   // 리그 수준 기준점 R(서버가 양 팀 종합으로 계산, 경기엔진.md 3.4)
  // 선수 배열은 id 순으로 고정 [18 재미·악용 심사]: 배열 순서가 캐시 번호 → AI 판단 난수 키(대타 후보 잡음 등)로 이어져, 같은 선수단을 순서만 바꿔 보내면 200경기 중 1경기 결과가 달라졌다(입력 순서로 재추첨)
  const plist = tin.players.slice().sort((a, b) => a.id - b.id);
  for (let i = 0; i < plist.length; i++) { const p = plist[i]; if (!need.has(p.id)) continue; idOf.set(p.id, pcs.length); pcs.push(buildCache(p, { team: side, home: side === 1, importance: g.inp.ctx.importance, rec: i, ref })); }
  const n = pcs.length;
  const order = new Int16Array(9), field = new Int16Array(10).fill(-1), posOf = new Int8Array(n).fill(-1);
  tin.lineup.forEach((l, k) => { const i = idOf.get(l.pid)!; order[k] = i; const pi = POS_NAME.indexOf(l.pos); field[pi] = i; posOf[i] = pi; });
  const sp = idOf.get(tin.sp)!; field[PO.P] = sp; posOf[sp] = PO.P;
  const T: TeamSt = {
    side, tin, pcs, idOf, order, next: 0, field, posOf, pit: null as any, pitHist: [],
    pen: tin.pen.map((p) => ({ i: idOf.get(p.pid)!, role: p.role, avail: p.avail, used: false })).filter((p) => p.i !== undefined),
    bench: tin.bench.map((id) => idOf.get(id)!).filter((i) => i !== undefined), removed: new Uint8Array(n), defIn: new Uint8Array(n),
    bat: tin.lineup.map((l, k) => newBat(l.pid, l.pos, k + 1)), pitL: new Map(), fld: [], lob: 0, hits: 0, errors: 0, runsInn: [],
    mood: tin.mood ?? 55, chemTier: tin.chemTier ?? 0, streak: tin.streak ?? 0, mem: new Map(), teamMem: new Map(),
    tac: resolveTac(tin.tac), level: tin.mgr?.level ?? 3, style: tin.mgr?.style ?? 0, user: !!tin.isUser, auto: true,
    inf: 0, of: 0, alignFixed: false, reviews: g.rules.reviews, visits: 5, approach: 0, starterIdx: sp,
  };
  const ps = newPitSt(sp, true, 'SP', g, T); T.pit = ps; T.pitHist.push(ps);
  const pl = newPit(pcs[sp].id); pl.GS = 1; T.pitL.set(pl.pid, pl);
  return T;
}

function setup(inp: GameInput): G {
  const o = inp.opts ?? {};
  const g = {
    inp, seed: new Uint32Array(inp.seed), rules: inp.rules, park: inp.park, wx: inp.wx, ump: inp.ump,
    T: null as any, inning: 1, half: 0, outs: 0, bases: [null, null, null], score: [0, 0],
    balls: 0, strikes: 0, paNo: 0, pitchNo: 0, pitchInPA: 0, clock: 0, slot: inp.wx.slots[Math.min(PRE_SLOTS, inp.wx.slots.length - 1)], slotIdx: PRE_SLOTS,
    rP: new Sfc32(), rR: new Sfc32(), rB: new Sfc32(), rA: new Sfc32(), rW: new Sfc32(),
    over: false, status: 'final', maxInn: inp.ctx.dh2 ? 9 : inp.rules.maxInnings,
    fenceD: new Float64Array(91), fenceH: new Float64Array(91), fx: new Float64Array(9), fy: new Float64Array(9),
    col: o.collector ?? null, logOn: !!o.log, evOn: o.events !== false, ev: null, log: null, delays: 0, delayMin: 0,
    // 명령: 보낸 순서로 앞 MAX_CMDS 개 중 투구 번호가 유한한 것만, 번호 순(같은 번호는 보낸 순서) [18 재미·악용 심사 — NaN 번호 하나가 뒤 명령을 전부 막거나 명령 폭탄으로 CPU 를 쓰는 것을 막음]
    pa: newPaCtx(), dayClear: false, tempStart: 20, doy: 0, cmds: (inp.cmds ?? []).slice(0, MAX_CMDS).filter((c) => c && Number.isFinite(c.at)).sort((a, b) => a.at - b.at), cmdPtr: 0,
    injuries: [], inhRunsLeft: 0, lastPlay: 0, horizon: o.liveHorizon ?? 1e9, h: 0x811c9dc5, uniqueEvents: new Map(), extra: false, wpNext: 0, vOuts: 0,
    wo: false, hrTrot: false, prePA: false,
    leadSide: -1, leadWinP: -1, leadLoseP: -1,
  } as unknown as G & { leadSide: number; leadWinP: number; leadLoseP: number };
  if (g.logOn) g.log = newLog();
  g.T = [buildTeam(g, inp.away, 0), buildTeam(g, inp.home, 1)];
  buildFence(g);
  g.ev = initEvents(g);
  const s0 = g.slot; g.tempStart = s0.tC; g.dayClear = s0.sunAlt > 8 && s0.sky === 0;
  return g;
}

/** 경기 시계 → 날씨 칸 */
function tickWeather(g: G): void {
  const idx = Math.min(g.wx.slots.length - 1, PRE_SLOTS + Math.floor(g.clock / 600));
  if (idx !== g.slotIdx) { g.slotIdx = idx; g.slot = g.wx.slots[idx]; if (g.logOn) { const s = g.slot; (g.log as LogBuf).wx.push(Math.round(g.clock / 60), Math.round(s.tC * 10), Math.round(s.rh), Math.round(s.atC * 10), Math.round(s.windMs * 10), Math.round((s.windFromDeg + 180 - g.park.orientDeg + 720) % 360), Math.round(s.gustMs * 10), s.rainLv, s.field, s.sky, Math.round(s.sunAlt), Math.round(s.visKm * 10)); } }
}
/** 우천 중단(강수 ≥ 4mm/h): 30분 이상 대기, 10분마다 확인(<1mm/h 면 정비 20분 뒤 재개), 90분 넘으면 판정 [16] */
function rainCheck(g: G): boolean {
  if (g.wx.dome) return false;
  if (g.slot.rainMmH < 4) return false;
  note(g, 'env_rain_delay'); g.delays++;
  logEV(g, EVC.DELAY, Math.round(g.slot.rainMmH * 10), 0);
  let waited = 0;
  while (true) {
    g.clock += 600; waited += 10; tickWeather(g);
    if (waited >= 30 && g.slot.rainMmH < 1) { g.clock += 1200; waited += 20; tickWeather(g); break; }
    if (waited > 90 || g.slotIdx >= g.wx.slots.length - 1) {
      // 판정: 5회 전 노게임 / 5회초 끝·홈 리드 콜드 / 그 뒤 콜드(동점이면 무승부)
      const done5 = g.inning > 5 || (g.inning === 5 && g.half === 1 && g.outs === 0 && g.score[1] > g.score[0]);
      g.status = done5 ? (g.score[0] === g.score[1] ? 'tie' : 'called') : 'noGame';
      if (g.status !== 'noGame') note(g, 'env_rain_called'); else note(g, 'env_rain_called');
      logEV(g, EVC.CALLED, waited, 0);
      g.over = true; return true;
    }
  }
  g.delayMin += waited;
  logEV(g, EVC.RESUME, waited, 0);
  // 재개 뒤 선발 리듬
  for (const s of [0, 1] as const) { const T = g.T[s]; evRhythm(g, s, waited); if (T.pit.starter && T.pit.pitches > 0 && waited >= 45 && !(T.user && !T.auto)) { /* 45분 넘게 쉬면 AI 교체 */ T.pit.F = Math.max(T.pit.F, T.pcs[T.pit.i].limit + 40); } }
  return false;
}

const chB = { bP: tmpCh.bP, bS: tmpCh.bS, pP: tmpCh.pP, pS: tmpCh.pS };
const ZERO = new Float64Array(N_CH);
const BIN: BatIn = { zc: 0, zk: 0, zs: 0, gbPitch: 0, tLaunch: 0, tGbPit: 0, dEdge: 0, zRel: 0, vPlate: 0, vb: 0, mem: 0, weakAdj: 0, veloDev: 0, muAdj: 0, sdMult: 1, move: 1, heavy: false, rainLv: 0, tempC: 20, coldT: 1 };

/** 타석 하나 */
function runPA(g: G, firstOfHalf: boolean): void {
  const O = offense(g), D = defense(g);
  g.prePA = true;   // 타석 시작 전 사건(교체·대타·우천)은 이번 타석 번호로 기록
  tickWeather(g);
  if (rainCheck(g)) { g.prePA = false; return; }
  // 문맥(채널 없이) → 수비 판단 → 공격 판단 → 이벤트 → 채널 포함 문맥
  beginPA(g, ZERO, ZERO, ZERO, ZERO);
  aiPitching(g, firstOfHalf);
  aiSubs(g);
  evPAStart(g, chB.bP, chB.bS, chB.pP, chB.pS);
  beginPA(g, chB.bP, chB.bS, chB.pP, chB.pS);
  const pa = g.pa;
  aiOffenseMode(g); aiAlign(g);
  let b = O.pcs[pa.b], p = D.pcs[pa.p];
  const slot = O.next; const tto = D.pit.tto[slot];
  const bases0 = basesCode(g), outs0 = g.outs, score0 = g.score[g.half] - g.score[1 - g.half];
  const we0 = g.logOn ? homeWE(g.inning, g.half, g.outs, bases0, g.score[1] - g.score[0], g.maxInn) : 0;
  const firstPitchNo = g.pitchNo;
  let bl = batLine(O, pa.b); let pl = pitLine(D, pa.p); const ps0 = D.pit;
  bl.PA++; pl.BF++; D.pit.bf++;
  g.paNo++; g.prePA = false; g.pitchInPA = 0; g.balls = 0; g.strikes = 0; pa.countsSeen = 1;
  const bb0 = g.logOn ? (g.log as LogBuf).bb.length : 0;
  let res: number = R.OUT; let ended = false; let rbi = 0; let onBase = false, isHit = false, wasK = false, hbp = false; let outsBefore = g.outs;
  /** 타석 미완료: 타석 중 주루사(도루 실패·견제사·스퀴즈 실패)로 세 번째 아웃 또는 끝내기(폭투·보크 등) — 타자는 타석·타수 없음, 다음 이닝 선두로 다시 선다 */
  let incomplete = false;
  const runsBefore = g.score[g.half];
  PL.kind = -1; PL.sf = false; PL.sh = false; PL.gdp = false; PL.rbi = 0;
  // 고의4구(투구 없이, KBO 2018~)
  if (aiIBB(g)) {
    walk(g); res = R.IBB; bl.BB++; bl.IBB++; pl.BB++; pl.IBB++; D.pit.bb++; D.pit.ibb++; onBase = true; ended = true;
  }
  setAlignment(g, D, b, pa.bL ? 1 : -1);
  const pre0 = { steal2: false, steal3: false, pitchout: false, hitRun: false, ibb: false, pick: 0 };
  while (!ended && !g.over) {
    if (g.pitchNo >= g.horizon) { g.over = true; g.status = 'suspended'; break; }
    sub(g.rR, g.seed, KIND.R, g.paNo, g.pitchInPA);
    const pre = aiPrePitch(g); pre0.steal2 = pre.steal2; pre0.steal3 = pre.steal3; pre0.pitchout = pre.pitchout; pre0.hitRun = pre.hitRun; pre0.ibb = false; pre0.pick = 0;
    applyCommands(g, pre0);
    // 유저 대타·투수 교체는 이번 타석부터 [18 재미·악용 심사]: 전에는 타석 문맥(타자·투수)을 명령 전에 잡아 둬서, 대타를 내도 빠진 타자가 그 타석을 끝까지 치고
    //   새 투수를 올려도 앞 투수가 그 타석을 던졌다(시험 120경기 중 0번 적용). 타자·투수가 바뀌었으면 문맥·장부를 새 선수로 다시 잡는다.
    if (O.order[O.next] !== pa.b || D.pit.i !== pa.p) {
      const newB = O.order[O.next] !== pa.b, newP = D.pit.i !== pa.p;
      if (newB) bl.PA--; if (newP) { pl.BF--; ps0.bf--; }
      evPAStart(g, chB.bP, chB.bS, chB.pP, chB.pS, true); beginPA(g, chB.bP, chB.bS, chB.pP, chB.pS);
      b = O.pcs[pa.b]; p = D.pcs[pa.p];
      if (newB) { bl = batLine(O, pa.b); bl.PA++; } if (newP) { pl = pitLine(D, pa.p); pl.BF++; D.pit.bf++; }
      setAlignment(g, D, b, pa.bL ? 1 : -1);
    }
    // 유저 고의4구(아무 카운트에서나, 투구 없이)
    if (pre0.ibb) { walk(g); res = R.IBB; bl.BB++; bl.IBB++; pl.BB++; pl.IBB++; D.pit.bb++; D.pit.ibb++; onBase = true; ended = true; break; }
    // 견제
    if (g.bases[0] && !g.bases[1]) {
      const n = aiPickoffs(g);
      for (let k = 0; k < n && g.bases[0]; k++) { g.clock += P.clock.visit / 6; if (pickoffPlay(g, 1)) { logEV(g, EVC.PICKOFF, 1, 1); pre0.steal2 = false; if (g.outs >= 3) { ended = true; incomplete = true; break; } } if (g.over) break; }
      if (ended || g.over) break;
    }
    // 유저 견제(1 · 2루) — 이번 공 앞에 한 번
    if (pre0.pick && g.bases[pre0.pick - 1]) {
      g.clock += P.clock.visit / 6;
      if (pickoffPlay(g, pre0.pick)) { logEV(g, EVC.PICKOFF, pre0.pick, 1); if (pre0.pick === 1) pre0.steal2 = false; else pre0.steal3 = false; if (g.outs >= 3) { ended = true; incomplete = true; break; } }
      if (g.over) break;
    }
    // 보크
    if ((g.bases[0] || g.bases[1] || g.bases[2]) && g.rR.next() < P.balk.base * Math.exp(-P.balk.pk * p.z[A.pickoff] - P.balk.comp * p.z[A.composure])) {
      advanceAll(g, 1, true); pl.BK++; D.pit.bk++; logEV(g, EVC.BALK, 0, 0); pre0.steal2 = pre0.steal3 = false;
      if (g.over) break;
    }
    // 피치클락 위반
    let auto = -1; const uc = g.rR.next();
    if (g.rules.pitchClock) { if (uc < 0.0004 * (pa.li > 2 ? 1.5 : 1)) auto = 0; else if (uc < 0.0006) auto = 1; }
    const stealing = pre0.steal2 ? 2 : pre0.steal3 ? 3 : 0;
    if (stealing && pa.mode === 1) { const r = g.bases[stealing - 2]; if (r) r.lead = 6; }
    let code: number;
    if (auto >= 0) { code = auto === 0 ? PR.AUTO_B : PR.AUTO_S; PT.type = 0; PT.pi = 0; PT.vPlate = 0; PT.vRel = pa.vFF; PT.H = 0; PT.x = 0; PT.z = 0; PT.d = 0; PT.wp = false; PT.pb = false; PT.swing = false; PT.inZone = false; PT.frame = false; PT.bunt = false; PT.called = auto === 1; }
    else code = throwPitch(g, pre0.pitchout);
    // 스퀴즈는 한 공 작전(히트앤런처럼) — 이번 공이 끝나면 풀린다
    const modeNow = pa.mode; if (pa.mode === 4) pa.mode = 0;
    // ── 기록·피로·기억 ──
    const ps = D.pit;
    if (auto < 0) {
      addPitch(ps, p, PT.type, pa.li, g.slot.atC, p.pitches[PT.pi]?.sig ?? 0);
      pl.pitches++; bl.pitches++;
      const isStrike = code !== PR.BALL && code !== PR.HBP && code !== PR.PITCHOUT;
      if (isStrike) { pl.strikes++; ps.strikes++; }
      if (PT.vRel > ps.vMax) { ps.vMax = PT.vRel; pl.vMax = Math.round(PT.vRel * 10) / 10; }
      const eta = (PT.swing ? P.mem.etaSwing : P.mem.etaTake) * (0.8 + P.mem.iq * pa.zIQ);
      const t = PT.type; pa.mem[t] += eta * (1 - pa.mem[t]); pa.tmem[t] = Math.min(P.mem.teamMax, pa.tmem[t] + P.mem.team);
      if (pa.prevType === t) pa.run++; else pa.run = 1;
      pa.prevType = t; pa.prevV = PT.vRel; pa.pitches++;
      if (g.col) {
        if (g.col.pitch) g.col.pitch({ balls: g.balls, strikes: g.strikes, type: t, inZone: PT.inZone, d: PT.d, x: PT.x, z: PT.z, swing: PT.swing, contact: PT.contact, foul: PT.foul, inPlay: PT.inPlay, calledStrike: code === PR.CALLED, hbp: code === PR.HBP, foulTip: PT.tip,
          wild: PT.wild, velo: PT.vRel, pitchNo: g.pitchInPA, pitcherPitches: ps.pitches, isStarter: ps.starter, inning: g.inning, tto, batterHand: pa.bL ? 'L' : 'R', pitcherHand: pa.pL ? 'L' : 'R', outOfZoneCalledStrike: PT.frame, intent: PT.intent, wp: PT.wp, pb: PT.pb, rainLv: g.slot.rainLv });
        if (g.col.velo && P.pt.fam[t] === 0) g.col.velo({ pitcherPitches: ps.pitches, inning: g.inning, velo: PT.vRel, isStarter: ps.starter, fast: t === 0 });
      }
      // 부상 노출: 투구·스윙
      injuryCheck(g, D, pa.p, EX.pitch, (ps.F > p.limit ? 1 + 0.04 * (ps.F - p.limit) : 1) * p.overuse);
      if (PT.swing) injuryCheck(g, O, pa.b, EX.swing, 1);
    }
    logPitch(g, PT.type, PT.vPlate, PT.x, PT.z, code, (stealing ? 1 : 0) | (pa.mode === 1 ? 2 : 0) | (PT.wp ? 4 : 0) | (PT.pb ? 8 : 0) | (PT.frame ? 32 : 0));
    g.pitchNo++; g.pitchInPA++;
    g.clock += (g.bases[0] || g.bases[1] || g.bases[2]) ? P.clock.pitchOn : P.clock.pitchEmpty;
    // ── 결과 처리 ──
    const wpPb = PT.wp || PT.pb;
    const strikeCode = code === PR.CALLED || code === PR.WHIFF || code === PR.BUNT_MISS || code === PR.AUTO_S || code === PR.TIP_K;
    const ballCode = code === PR.BALL || code === PR.AUTO_B || code === PR.PITCHOUT;
    if (code === PR.HBP) {
      hbp = true; res = R.HBP; bl.HBP++; pl.HBP++; D.pit.hbp++; walk(g); onBase = true; ended = true;
      injuryCheck(g, O, pa.b, EX.hbp, 1);
      break;
    }
    if (code === PR.INPLAY) {
      if (PT.bunt) { playBunt(g, modeNow); closeBB(g); }
      else {
        // 타구(B 스트림, 키 = 타석·투구)
        const rb = sub(g.rB, g.seed, KIND.B, g.paNo, g.pitchInPA);
        const pc = p.pitches[PT.pi];
        BIN.zc = pa.zCon; BIN.zk = pa.zK; BIN.zs = PT.zs; BIN.gbPitch = P.pt.gb[PT.type] + (pc.sig === 1 ? 0.05 : pc.sig === 3 ? 0.06 : pc.sig === 4 ? -0.05 : pc.sig === 9 ? 0.04 : pc.sig === 10 ? 0.06 : 0);
        BIN.tLaunch = b.tLaunch; BIN.tGbPit = p.tGb; BIN.dEdge = PT.d; BIN.zRel = PT.z - pa.zMid;
        BIN.vPlate = PT.vPlate; BIN.veloDev = PT.type === 8 || pc.sig === 8 ? 0 : clamp(PT.vRel - P.bat.veloRef - P.pt.veloOff[PT.type], -15, 15); BIN.mem = PT.f; BIN.move = PT.move; BIN.heavy = pc.sig === 2; BIN.rainLv = g.slot.rainLv; BIN.tempC = g.slot.tC; BIN.coldT = b.wxT[1];
        const appr = pa.approach;
        BIN.vb = P.bat.vb0 + P.bat.power * pa.zPow + P.bat.strength * b.z[A.strength] + (appr === 3 ? P.bat.approachPow : appr === 4 ? P.bat.contactVb : appr === 5 ? -2 : appr === 6 ? -1 : 0) + (PT.guessHit ? P.bat.guessV : 0) + P.ev.powerVb * pa.cPow + P.env.powerAdj
          + (g.strikes === 2 && O.tac.twoStrike === 'shorten' ? -3 : g.strikes === 2 && O.tac.twoStrike === 'full' ? 1.5 : 0) + (hasT(b, TR.fastballHunter) && P.pt.fam[PT.type] === 0 ? 1.5 : 0);
        BIN.weakAdj = (PT.guessHit ? -0.51 : PT.guessMiss ? 0.34 : 0) - 2.0 * (b.mech.hitRel ?? 0) + P.ev.stuffWeak * pa.cStuff - P.ev.contactWeak * pa.cCon + (pc.sig === 11 ? 0.3 : 0);
        BIN.muAdj = (appr === 5 ? 0.15 : appr === 6 ? -0.2 : 0) + (pa.mode === 1 ? -0.3 : 0);
        BIN.sdMult = 1;
        battedBall(rb, BIN);
        let ev = BB.ev, la = BB.la;
        if (hasT(b, TR.pullPower) && la > 20) ev *= 1.005;
        const adjPull = (appr === 6 ? -8 : 0) + (pa.mode === 1 ? -6 : 0) + (hasT(b, TR.oppoMaster) ? -20 / 50 * 18 * (b.sigBat === 'laserLiner' ? 1.5 : 1) : 0) + (hasT(b, TR.pullPower) ? 15 / 50 * 18 * (b.sigBat === 'moonshot' ? 1.5 : 1) : 0);
        const phi = sprayAngle(rb, b.tPull, PT.insideCm, la, PT.vPerc, adjPull, pa.bL);
        // 뛰던 주자(히트앤런·도루 스타트)
        if (stealing) { const r = g.bases[stealing - 2]; if (r) r.lead = 6; }
        g.rB = rb;
        const rangeCh = capCh(0, 0);
        resolveBIP(g, { ev, la, phi, weak: BB.weak, rangeCh, bunt: false });
        if (g.col?.bip) g.col.bip({ ev, la, phi, kind: PL.kind, result: PL.res, dist: PL.dist, hang: PL.hang, catchProb: PL.catchP, fielder: PL.fielder, pulled: pa.bL ? phi : -phi, tempC: g.slot.tC, windOut: windOut(g), park: g.park.id, rainLv: g.slot.rainLv, bunt: false, batterHand: pa.bL ? 'L' : 'R', hrDist: PL.hrDist, fenceDist: PL.fenceD, wall: PL.wall, error: PL.err });
        evPlay(g, PL.err && PL.fielder >= 0 ? PL.fielder : -1, PL.catchP, PL.res === R.OUT && PL.kind > 0);
        // 노출: 타자 질주(땅볼·장타), 투수 강습
        if (PL.kind === 0 || PL.res === R.S2 || PL.res === R.S3) injuryCheck(g, O, pa.b, EX.sprint, 1);
        if (PL.fielder === PO.P && ev > 140) injuryCheck(g, D, pa.p, EX.bip, 1);
        if (PL.fielder >= 0) injuryCheck(g, D, D.field[PL.fielder], EX.throwF, 1);
        g.clock += P.clock.bip + Math.min(12, PL.hang + 3);
      }
      for (const r of g.bases) if (r) r.lead = 0;
      res = PL.res; rbi = PL.rbi; ended = true;
      onBase = res === R.S1 || res === R.S2 || res === R.S3 || res === R.HR || res === R.ROE || res === R.FC && g.bases.some((x) => x && x.i === pa.b);
      isHit = res === R.S1 || res === R.S2 || res === R.S3 || res === R.HR;
      break;
    }
    if (code === PR.FOULOUT) { bkOut(g); bkPO(g, PO.C); res = R.OUT; ended = true; PL.kind = 5; break; }
    if (code === PR.FOUL || code === PR.TIP || code === PR.BUNT_FOUL) {
      if (code === PR.BUNT_FOUL && g.strikes === 2) { res = R.K; wasK = true; strikeOut(g, D, pl, false); ended = true; break; }
      if (g.strikes < 2) g.strikes++;
      if (u01(g.seed[0], 9, g.paNo, g.pitchInPA) < 0.0104) injuryCheck(g, O, pa.b, EX.foulSelf, 1);
      pa.countsSeen |= 1 << (g.balls * 3 + g.strikes);
      continue;
    }
    // 볼·스트라이크(도루·폭투·포일)
    const kNow = strikeCode && (code === PR.TIP_K || g.strikes === 2);
    const bbNow = ballCode && g.balls === 3;
    // 낫아웃: 3번째 스트라이크를 못 잡고(폭투·포일) 1루가 비었거나 2사 → 타자 1루로(75% 세이프)
    const kDrop = kNow && code !== PR.TIP_K && wpPb && (!g.bases[0] || g.outs === 2);
    const kDropSafe = kDrop && g.rB.next() < 0.75;
    // 2사 삼진(공이 잡힘)은 그 순간 이닝 끝 → 도루 판정 없음 · 볼넷으로 밀려가는 주자는 도루 없이 진루
    const forcedSteal = stealing === 2 || (stealing === 3 && !!g.bases[0] && !!g.bases[1]);
    if (stealing && g.bases[stealing - 2] && !(kNow && g.outs === 2) && !(bbNow && forcedSteal)) {
      const ri = g.bases[stealing - 2]!.i;
      const ok = stealPlay(g, stealing, PT.type, PT.vRel, pa.vFF, PT.H, pre0.pitchout);
      logEV(g, EVC.STEAL, stealing, ok ? 1 : 0);
      injuryCheck(g, O, ri, EX.slide, 0.5);
      if (g.over) break;
      if (g.outs >= 3) { ended = true; incomplete = true; break; }   // 도루 실패로 이닝 끝 — 타자는 다음 이닝 선두
    }
    // 스퀴즈 실패(번트 헛스윙): 투구와 함께 뛴 3루 주자가 협살에 걸린다(85%)
    if (modeNow === 4 && code === PR.BUNT_MISS && g.bases[2] && !wpPb && !(kNow && g.outs === 2)) {
      const r3 = g.bases[2]!;
      if (g.rR.next() < 0.85) {
        g.bases[2] = null; batLine(O, r3.i).CS++; bkOut(g); bkA(g, PO.C); bkPO(g, PO.B3); logEV(g, EVC.STEAL, 4, 0);
        if (g.outs >= 3) { ended = true; incomplete = true; break; }
      }
    }
    const anyOn = !!(g.bases[0] || g.bases[1] || g.bases[2]);
    if (wpPb && anyOn && !(kDrop && !kDropSafe && g.outs === 2)) {   // 2사 낫아웃 타자가 1루에서 잡히면 이닝 끝(주자 진루·득점 없음)
      if (PT.wp) { pl.WP++; D.pit.wp++; logEV(g, EVC.WP, 0, 0); } else { fldLine(D, PO.C).PB++; logEV(g, EVC.PB, 0, 0); }
      advanceAll(g, 1, !PT.pb);
      if (g.over && !kNow && !bbNow) break;   // 폭투 끝내기(삼진·볼넷이 같이 나면 그 타석은 마무리)
    }
    if (ballCode) {
      g.balls++;
      if (g.balls >= 4) { res = R.BB; bl.BB++; pl.BB++; D.pit.bb++; walk(g); onBase = true; ended = true; break; }
    } else if (strikeCode) {
      if (kNow) {
        res = R.K; wasK = true;
        if (kDropSafe) {
          g.bases[0] = { i: pa.b, slot: O.next, resp: D.pit.i, earned: true, lead: 0, jump: 0 }; onBase = true;
          if (!anyOn) { if (PT.wp) { pl.WP++; D.pit.wp++; logEV(g, EVC.WP, 0, 0); } else { fldLine(D, PO.C).PB++; logEV(g, EVC.PB, 0, 0); } }
        } else { bkOut(g); if (kDrop) { bkPO(g, PO.B1); bkA(g, PO.C); } else bkPO(g, PO.C); }
        ended = true; break;
      }
      g.strikes++;
    }
    pa.countsSeen |= 1 << (g.balls * 3 + g.strikes);
    if (pa.mode === 1) pa.mode = 0;   // 히트앤런은 한 공
  }
  if (g.over && !ended) {
    if (!g.wo) return;                 // 라이브 지평(liveHorizon) — 타석 진행 중
    ended = true; incomplete = true;   // 타석 도중 끝내기(폭투·포일·보크·도루 실책)
  }
  if (incomplete) { finishIncompletePA(g, O, D, bl, pl, outs0, bases0, score0, firstPitchNo, runsBefore, outsBefore, we0, b.id, p.id, bb0); return; }
  // ── 타석 마무리 ──
  if (res !== R.IBB && res !== R.BB && res !== R.HBP && res !== R.SH && res !== R.SF && !PL.sf) bl.AB++;
  if (res === R.K) { bl.SO++; pl.SO++; D.pit.k++; }
  if (isHit) { bl.H++; pl.H++; D.pit.h++; O.hits++; if (res === R.S2) bl.D++; else if (res === R.S3) bl.T++; else if (res === R.HR) { bl.HR++; pl.HR++; D.pit.hr++; } }
  if (res === R.SH || PL.sh) { bl.SH++; }
  if (PL.sf && res !== R.SH) { bl.SF++; }   // 희생플라이는 위에서 이미 타수에서 빠짐(전에는 한 번 더 빼서 타수가 모자랐다)
  if (res === R.DP || PL.gdp && PL.kind === 0) bl.GDP++;
  D.pit.tto[slot]++;
  if (onBase) D.pit.innBR++;
  const runs = g.score[g.half] - runsBefore;
  void rbi;
  evPAEnd(g, res, onBase, isHit, runs, g.outs - outsBefore, wasK, hbp);
  if (g.col?.pa) g.col.pa({ result: res, batter: b.id, pitcher: p.id, bHand: pa.bL ? 'L' : 'R', pHand: pa.pL ? 'L' : 'R', outsBefore: outs0, basesBefore: bases0, runs, rbi: PL.rbi, pitches: g.pitchInPA,
    balls: g.balls, strikes: g.strikes, countsSeen: pa.countsSeen, tto, isStarter: D.pit.starter, inning: g.inning, half: g.half, homeBatting: g.half === 1, li: pa.li, tempC: g.slot.tC, rainLv: g.slot.rainLv, dayClear: g.dayClear,
    windOut: windOut(g), batterPlatoonAdv: !pa.same, scoreDiff: score0, ibb: res === R.IBB, sh: res === R.SH || PL.sh, sf: PL.sf, gdp: res === R.DP, roe: res === R.ROE, foulOut: PL.kind === 5 && res === R.OUT });
  if (g.logOn) {
    const L = g.log as LogBuf; const we1 = homeWE(g.inning, g.half, Math.min(3, g.outs), basesCode(g), g.score[1] - g.score[0], g.maxInn);
    L.pa.push(g.inning * 2 + g.half, outs0, bases0, score0, recNo(g, b.id), recNo(g, p.id), res, PL.rbi, firstPitchNo, g.pitchInPA, L.bb.length > bb0 ? L.bb.length / 17 - 1 : -1, Math.round((we1 - we0) * 1000));
    L.wp.push(Math.round(we1 * 1000));
  }
  PL.rbi = 0; PL.sf = false; PL.sh = false; PL.gdp = false;
  O.next = (O.next + 1) % 9;
  g.clock += P.clock.paChange;
  // 끝내기
  if (g.half === 1 && g.inning >= 9 && g.score[1] > g.score[0]) { g.over = true; }
  void tto;
}
function strikeOut(g: G, D: TeamSt, pl: PitLine, drop: boolean): void {
  void D; void pl; void drop;
  bkOut(g); bkPO(g, PO.C);
}
/** 미완료 타석 마무리: 타석·타수·상대 타자 수에서 빼고(규칙 9.02), 타순은 그대로(같은 타자가 다음 이닝 선두), 테이프에는 결과 '기타'로 남긴다 */
function finishIncompletePA(g: G, O: TeamSt, D: TeamSt, bl: { PA: number }, pl: { BF: number }, outs0: number, bases0: number, score0: number, firstPitchNo: number, runsBefore: number, outsBefore: number, we0: number, bid: number, pid: number, bb0: number): void {
  bl.PA--; pl.BF--; D.pit.bf--;
  const runs = g.score[g.half] - runsBefore;
  evPAEnd(g, R.OTHER, false, false, runs, g.outs - outsBefore, false, false);
  if (g.col?.pa) g.col.pa({ result: R.OTHER, batter: bid, pitcher: pid, bHand: g.pa.bL ? 'L' : 'R', pHand: g.pa.pL ? 'L' : 'R', outsBefore: outs0, basesBefore: bases0, runs, rbi: 0, pitches: g.pitchInPA,
    balls: g.balls, strikes: g.strikes, countsSeen: g.pa.countsSeen, tto: 0, isStarter: D.pit.starter, inning: g.inning, half: g.half, homeBatting: g.half === 1, li: g.pa.li, tempC: g.slot.tC, rainLv: g.slot.rainLv, dayClear: g.dayClear,
    windOut: windOut(g), batterPlatoonAdv: !g.pa.same, scoreDiff: score0, ibb: false, sh: false, sf: false, gdp: false, roe: false, incomplete: true });
  if (g.logOn) {
    const L = g.log as LogBuf; const we1 = homeWE(g.inning, g.half, Math.min(3, g.outs), basesCode(g), g.score[1] - g.score[0], g.maxInn);
    L.pa.push(g.inning * 2 + g.half, outs0, bases0, score0, recNo(g, bid), recNo(g, pid), R.OTHER, 0, firstPitchNo, g.pitchInPA, L.bb.length > bb0 ? L.bb.length / 17 - 1 : -1, Math.round((we1 - we0) * 1000));
    L.wp.push(Math.round(we1 * 1000));
  }
  PL.rbi = 0; PL.sf = false; PL.sh = false; PL.gdp = false;
  g.clock += P.clock.paChange;
  void O;
  if (g.half === 1 && g.inning >= 9 && g.score[1] > g.score[0]) g.over = true;
}
function injuryCheck(g: G, T: TeamSt, i: number, ex: number, mult: number): void {
  if (i < 0) return;
  const d = expose(g, T, i, ex, mult); if (!d) return;
  const pc = T.pcs[i];
  g.injuries.push({ pid: pc.id, type: d.key, inning: g.inning, exposure: ex as any });
  logEV(g, EVC.INJURY, pc.id, 0);
  note(g, 'inj_on_play');
  if (d.d2d && u01(g.seed[2], 77, pc.id, g.pitchNo) < 0.5) return;   // 일일 체크급은 절반은 그대로 뜀
  // 교체: 투수는 다음 타석 전 강제 교체, 야수는 벤치에서
  if (T.posOf[i] === PO.P) { T.removed[i] = 2; return; }
  const slot = T.order.indexOf(i); if (slot < 0) return;
  const pos = T.posOf[i];
  let best = -1, bv = -9;
  for (const j of T.bench) { if (T.removed[j] || T.pcs[j].pitches.length) continue; const v = pos >= 1 && pos <= 8 ? T.pcs[j].posProf[pos] : 10; if (v > bv) { bv = v; best = j; } }
  // 주자 바꿔 넣기는 공격 팀일 때만 — 전에는 수비수가 다쳐도 같은 번호의 공격 주자를 바꿔 버려 다른 팀 선수 번호가 베이스에 올라가고(드물게) 경기가 멈췄다
  if (best >= 0) { substitute(g, T, slot, best); if (T === offense(g)) for (const r of g.bases) if (r && r.i === i) r.i = best; logEV(g, EVC.SUB_DEF, pc.id, T.pcs[best].id); }
}

function startHalf(g: G): void {
  { const O = offense(g); if (O.runsInn[g.inning - 1] === undefined) O.runsInn[g.inning - 1] = 0; }
  g.outs = 0; g.vOuts = 0; g.bases[0] = g.bases[1] = g.bases[2] = null;
  const D = defense(g); D.pit.inningPitches = 0; D.pit.curInning = g.inning; D.pit.innBR = 0;
  g.prePA = true; aiDefense(g); g.prePA = false;   // 대타·대주자가 낯선 수비 자리에 서면 교체, 후반 리드면 수비 굳히기
  tickWeather(g);
  evHalfStart(g);
  // 노출: 포수 이닝, 첫 이닝엔 출장
  injuryCheck(g, D, D.field[PO.C], EX.catchInning, 1);
}
function endHalf(g: G): void {
  const O = offense(g);
  O.lob += (g.bases[0] ? 1 : 0) + (g.bases[1] ? 1 : 0) + (g.bases[2] ? 1 : 0);
  evHalfEnd(g);
  g.clock += P.clock.inningChange;
  // 폭염 쿨링브레이크: 3·7회 뒤
  if (g.rules.heatRule && g.half === 1 && (g.inning === 3 || g.inning === 7) && g.slot.atC >= 31) { g.clock += P.clock.cooling; restBreak(g.T[0].pit); restBreak(g.T[1].pit); logEV(g, EVC.COOLING, g.inning, 0); }
}

/** 한 경기 시뮬레이션(서버·웹 공용 순수 함수) */
export function simulateGame(inp: GameInput): GameResult {
  const g = setup(inp) as G & { leadSide: number; leadWinP: number; leadLoseP: number };
  if (inp.wx.precheck === 'cancelled') { g.status = 'noGame'; return finalize(g); }
  evPreGame(g);
  // 출장 노출
  for (const T of g.T) for (let k = 0; k < 9; k++) injuryCheck(g, T, T.order[k], EX.playerGame, 1);
  for (const T of g.T) injuryCheck(g, T, T.pit.i, EX.pitcherApp, 1);
  while (!g.over) {
    startHalf(g);
    let first = true;
    while (g.outs < 3 && !g.over) {
      if (g.pitchNo >= MAX_PITCHES) { g.over = true; g.status = g.score[0] === g.score[1] ? 'tie' : 'called'; logEV(g, EVC.CALLED, 0, 1); break; }   // 안전 상한 콜드
      const before = defense(g).pit;
      runPA(g, first); first = false;
      if (defense(g).pit !== before) injuryCheck(g, defense(g), defense(g).pit.i, EX.pitcherApp, 1);
      trackLead(g);
    }
    if (g.over) break;
    endHalf(g);
    // 경기 끝 판정
    if (g.half === 0) {
      if (g.inning >= 9 && g.score[1] > g.score[0]) { g.over = true; break; }
      g.half = 1;
    } else {
      if (g.inning >= 9 && g.score[0] !== g.score[1]) { g.over = true; break; }
      if (g.inning >= g.maxInn) { g.over = true; g.status = 'tie'; break; }
      g.inning++; g.half = 0;
      if (g.inning > 9) g.extra = true;
    }
  }
  return finalize(g);
}
/** 리드 변화 추적(승·패 투수 결정용) */
function trackLead(g: G & { leadSide: number; leadWinP: number; leadLoseP: number }): void {
  const s = g.score[0] > g.score[1] ? 0 : g.score[1] > g.score[0] ? 1 : -1;
  if (s === g.leadSide) return;
  if (s === 0 || s === 1) { g.leadSide = s; g.leadWinP = g.T[s].pit.i; g.leadLoseP = g.T[1 - s].pit.i; }
  else g.leadSide = -1;
  // 세이브 상황에서 리드를 잃은 투수 → 블론
  for (const T of g.T) { const ps = T.pit; const lead = T.side === 1 ? g.score[1] - g.score[0] : g.score[0] - g.score[1]; if (ps.saveSit && !ps.blown && lead <= 0) { ps.blown = true; ps.heldLead = false; } }
}

function finalize(g: G & { leadSide?: number; leadWinP?: number; leadLoseP?: number }): GameResult {
  const status = g.status;
  const winner = status === 'noGame' || g.score[0] === g.score[1] ? null : g.score[1] > g.score[0] ? 'home' : 'away';
  const walkoff = winner === 'home' && g.half === 1 && g.inning >= 9 && g.outs < 3;
  evGameEnd(g, walkoff);
  // 결정(승·패·세이브·홀드·블론·QS·CG)
  if (winner && status !== 'noGame') {
    const W = g.T[winner === 'home' ? 1 : 0], L = g.T[winner === 'home' ? 0 : 1];
    let wp = g.leadWinP ?? -1;
    const sp = W.pitHist[0];
    if (wp === sp.i && sp.outs < 15) {
      // 선발 5이닝 미만 → 가장 효과적인 구원(이닝 많고 실점 적은)
      let best = -1, bv = -99; for (const ps of W.pitHist) if (!ps.starter) { const v = ps.outs - 3 * ps.runs; if (v > bv) { bv = v; best = ps.i; } }
      if (best >= 0) wp = best;
    }
    if (wp >= 0) pitLine(W, wp).W = 1;
    if ((g.leadLoseP ?? -1) >= 0) pitLine(L, g.leadLoseP!).L = 1;
    const fin = W.pitHist[W.pitHist.length - 1];
    if (!fin.starter && fin.i !== wp && fin.saveSit && !fin.blown) pitLine(W, fin.i).SV = 1;
  }
  // 홀드·블론: 이긴 팀만이 아니라 양 팀 모두(세이브 상황에 나와 아웃을 잡고 리드를 지킨 채 내려가면 홀드 — 뒤 투수가 역전당해도 그대로). 무승부 경기도 마찬가지
  if (status !== 'noGame') {
    const W = winner ? g.T[winner === 'home' ? 1 : 0] : null; const wp0 = W ? W.pitHist.find((x) => pitLine(W, x.i).W === 1)?.i ?? -1 : -1;
    for (const T of g.T) { const finT = T.pitHist[T.pitHist.length - 1]; for (const ps of T.pitHist) {
      if (ps.starter) continue;
      if (ps.saveSit && ps.blown) pitLine(T, ps.i).BS = 1;
      else if (ps.saveSit && !ps.blown && ps !== finT && ps.outs >= 1 && !(T === W && ps.i === wp0)) pitLine(T, ps.i).HLD = 1;
    } }
  }
  for (const T of g.T) {
    const sp = T.pitHist[0]; const l = pitLine(T, sp.i);
    if (sp.outs >= 18 && l.ER <= 3) l.QS = 1;
    if (T.pitHist.length === 1 && status === 'final') l.CG = 1;
    if (g.col?.starter) g.col.starter({ outs: sp.outs, pitches: sp.pitches, runs: sp.runs, er: sp.er, tto3: sp.tto.some((x) => x >= 3) });
    if (g.col?.reliever) for (const ps of T.pitHist) if (!ps.starter) g.col.reliever({ outs: ps.outs, pitches: ps.pitches, role: ps.role });
  }
  // 투수별 이 경기 투구 수(같은 투수가 두 번 기록돼도 합친다 — 다음 날 피로 계산이 뒤 등판분만 보는 일이 없게)
  const usage: { pid: number; pitches: number; team: 0 | 1 }[] = [];
  for (const T of g.T) for (const ps of T.pitHist) { const id = T.pcs[ps.i].id; const u = usage.find((x) => x.pid === id && x.team === T.side); if (u) u.pitches += ps.pitches; else usage.push({ pid: id, pitches: ps.pitches, team: T.side }); }
  const box = {
    line: { inn: [g.T[0].runsInn.map((x) => x ?? 0), g.T[1].runsInn.map((x) => x ?? 0)] as [number[], number[]], R: [g.score[0], g.score[1]] as [number, number], H: [g.T[0].hits, g.T[1].hits] as [number, number], E: [g.T[0].errors, g.T[1].errors] as [number, number], LOB: [g.T[0].lob, g.T[1].lob] as [number, number] },
    bat: [g.T[0].bat, g.T[1].bat] as any, pit: [Array.from(g.T[0].pitL.values()), Array.from(g.T[1].pitL.values())] as any, fld: [g.T[0].fld, g.T[1].fld] as any,
    flags: [walkoff ? 'walkoff' : '', g.extra ? 'extra' : ''].filter((x) => x),
  };
  // 결과 해시(결정성 검사): 점수·투구 수·타석 수·안타·실책
  let h = g.h >>> 0;
  const mix = (v: number) => { h ^= v & 0xffffffff; h = Math.imul(h, 0x01000193) >>> 0; };
  mix(g.score[0]); mix(g.score[1]); mix(g.pitchNo); mix(g.paNo); mix(g.T[0].hits); mix(g.T[1].hits); mix(g.T[0].errors); mix(g.T[1].errors); mix(Math.round(g.clock));
  const res: GameResult = {
    status, score: [g.score[0], g.score[1]], innings: g.inning, outsLastHalf: g.outs, winner, box, usage, injuries: g.injuries.map((x) => ({ ...x })), events: eventCounts(g),
    durationMin: Math.round(g.clock / 60), delays: g.delays, hash: h >>> 0, pitchesTotal: g.pitchNo,   // 경기 시계에 우천 대기가 이미 들어 있다(전에는 두 번 더함)
  };
  if (g.logOn) res.record = buildRecord(g);
  if (g.col?.game) g.col.game({ res, input: g.inp, starterIP: [g.T[0].pitHist[0].outs, g.T[1].pitHist[0].outs], starterPitches: [g.T[0].pitHist[0].pitches, g.T[1].pitHist[0].pitches], relievers: [g.T[0].pitHist.length - 1, g.T[1].pitHist.length - 1], extra: g.extra, tempC: g.tempStart, dayClear: g.dayClear, rain: g.delays > 0 || g.wx.slots[PRE_SLOTS].rainLv > 0 });
  return res;
}
export { changePitcher, pcAt };
