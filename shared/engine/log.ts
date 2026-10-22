// 기록 — 박스스코어 장부(득점·아웃·자살·보살·실책)와 2D 중계용 압축 테이프(정수 배열).
// 테이프 단위: 길이 dm(0.1m)·cm(투구 위치), 시간 cs(0.01초), 속도 km/h×10, 각도 0.1°. 모두 정수(13.2절).
import type { G, Runner, TeamSt } from './state.ts';
import type { BatLine, PitLine, FldLine, GameRecord } from './types.ts';
import { POS_NAME } from './state.ts';

export interface LogBuf { pa: number[]; pt: number[]; bb: number[]; fd: number[]; th: number[]; rn: number[]; ev: number[]; why: number[]; wp: number[]; hl: number[]; wx: number[]; dict: number[]; recOf: Map<number, number>; mk: number[] }
export function newLog(): LogBuf { return { pa: [], pt: [], bb: [], fd: [], th: [], rn: [], ev: [], why: [], wp: [], hl: [], wx: [], dict: [], recOf: new Map(), mk: [-1, -1, -1] }; }
export function recNo(g: G, pid: number): number {
  const L = g.log as LogBuf; if (!L) return 0;
  let r = L.recOf.get(pid); if (r === undefined) { r = L.dict.length; L.dict.push(pid); L.recOf.set(pid, r); }
  return r;
}

// ── 장부 ──
export function newBat(pid: number, pos: string, ord: number): BatLine {
  return { pid, pos, ord, PA: 0, AB: 0, R: 0, H: 0, D: 0, T: 0, HR: 0, RBI: 0, BB: 0, IBB: 0, HBP: 0, SO: 0, SH: 0, SF: 0, GDP: 0, SB: 0, CS: 0, ROE: 0, pitches: 0 };
}
export function newPit(pid: number): PitLine {
  return { pid, GS: 0, outs: 0, BF: 0, H: 0, R: 0, ER: 0, BB: 0, IBB: 0, HBP: 0, SO: 0, HR: 0, WP: 0, BK: 0, pitches: 0, strikes: 0, inh: 0, inhScored: 0, vMax: 0, W: 0, L: 0, SV: 0, HLD: 0, BS: 0, QS: 0, CG: 0 };
}
export function newFld(pid: number, pos: string): FldLine { return { pid, pos, PO: 0, A: 0, E: 0, DP: 0, PB: 0, SBA: 0, CSc: 0, hardCaught: 0 }; }
export function batLine(t: TeamSt, pcsIdx: number): BatLine {
  const pid = t.pcs[pcsIdx].id;
  for (const b of t.bat) if (b.pid === pid) return b;
  const b = newBat(pid, t.posOf[pcsIdx] >= 0 ? POS_NAME[t.posOf[pcsIdx]] : 'PH', 0); t.bat.push(b); return b;
}
export function pitLine(t: TeamSt, pcsIdx: number): PitLine {
  const pid = t.pcs[pcsIdx].id; let l = t.pitL.get(pid);
  if (!l) { l = newPit(pid); t.pitL.set(pid, l); }
  return l;
}
export function fldLine(t: TeamSt, pos: number): FldLine {
  const pid = t.pcs[t.field[pos]].id;
  for (const f of t.fld) if (f.pid === pid && f.pos === POS_NAME[pos]) return f;
  const f = newFld(pid, POS_NAME[pos]); t.fld.push(f); return f;
}
/** 득점: 주자 r 이 홈을 밟음. 자책 여부는 주자 출루 방식과 '가상 아웃'(실책이 없었다면 끝났을 이닝)으로 */
export function bkRun(g: G, r: Runner, rbiBatter: number): boolean {
  // 끝내기: 결승 주자가 홈을 밟는 순간 경기 끝 — 뒤따르는 주자의 득점은 무효(홈런만 예외, 규칙 7.01(g))
  if (g.wo && !g.hrTrot) return false;
  const O = g.T[g.half], D = g.T[1 - g.half];
  g.score[g.half]++;
  O.runsInn[g.inning - 1] = (O.runsInn[g.inning - 1] ?? 0) + 1;
  batLine(O, r.i).R++;
  if (rbiBatter >= 0) batLine(O, rbiBatter).RBI++;
  const earned = r.earned && g.vOuts < 3;
  const pl = pitLine(D, r.resp); pl.R++; if (earned) pl.ER++;
  const ps = D.pitHist.find((x) => x.i === r.resp); if (ps) { ps.runs++; if (earned) ps.er++; }
  if (r.resp !== D.pit.i) { const cur = pitLine(D, D.pit.i); cur.inhScored++; }
  g.h = (Math.imul(g.h ^ (g.paNo * 31 + g.score[g.half]), 0x01000193)) >>> 0;
  if (g.logOn) (g.log as LogBuf).rn.push(recNo(g, O.pcs[r.i].id), -1, 4, Math.round(g.clock * 100), 0, 3, 0);
  if (g.half === 1 && g.inning >= 9 && g.score[1] > g.score[0]) { g.wo = true; g.over = true; }
  return true;
}
export function bkOut(g: G, n = 1): void {
  const D = g.T[1 - g.half];
  g.outs += n; g.vOuts += n; D.pit.outs += n;
  pitLine(D, D.pit.i).outs += n;
}
export function bkPO(g: G, pos: number): void { fldLine(g.T[1 - g.half], pos).PO++; }
export function bkA(g: G, pos: number): void { fldLine(g.T[1 - g.half], pos).A++; }
export function bkE(g: G, pos: number): void { fldLine(g.T[1 - g.half], pos).E++; g.T[1 - g.half].errors++;  }
export function bkDP(g: G, pos: number): void { fldLine(g.T[1 - g.half], pos).DP++; }

// ── 테이프 ──
export function logPitch(g: G, type: number, vPlate: number, x: number, z: number, res: number, flags: number): void {
  if (!g.logOn) return; (g.log as LogBuf).pt.push(type, Math.round(vPlate * 10), Math.round(x), Math.round(z), res, flags, Math.round(g.clock));
}
/** 인플레이 시작 표시: 이 뒤에 남는 수비·송구·주루 기록이 이번 타구 것(logBB 를 수비 기록보다 늦게 불러도 범위가 맞도록) */
export function markBB(g: G): void {
  if (!g.logOn) return; const L = g.log as LogBuf; L.mk[0] = L.fd.length / 11; L.mk[1] = L.th.length / 7; L.mk[2] = L.rn.length / 7;
}
export function logBB(g: G, ev: number, la: number, phi: number, lx: number, ly: number, hang: number, apex: number, kind: number, result: number, catchP: number): void {
  if (!g.logOn) return; const L = g.log as LogBuf;
  const m = L.mk; const f0 = m[0] >= 0 ? m[0] : L.fd.length / 11, t0 = m[1] >= 0 ? m[1] : L.th.length / 7, r0 = m[2] >= 0 ? m[2] : L.rn.length / 7;
  L.bb.push(g.paNo, Math.round(ev * 10), Math.round(la * 10), Math.round(phi * 10), Math.round(lx * 10), Math.round(ly * 10), Math.round(hang * 100), Math.round(apex * 10), kind, result, Math.round(catchP * 1000),
    f0, 0, t0, 0, r0, 0);
}
/** 타구 기록의 관여 수 칸 마감 */
export function closeBB(g: G): void {
  if (!g.logOn) return; const L = g.log as LogBuf; L.mk[0] = L.mk[1] = L.mk[2] = -1; const o = L.bb.length - 17; if (o < 0) return;
  L.bb[o + 12] = L.fd.length / 11 - L.bb[o + 11]; L.bb[o + 14] = L.th.length / 7 - L.bb[o + 13]; L.bb[o + 16] = L.rn.length / 7 - L.bb[o + 15];
}
export function logFD(g: G, pos: number, sx: number, sy: number, react: number, v: number, tau: number, ax: number, ay: number, t: number, act: number, p: number): void {
  if (!g.logOn) return; (g.log as LogBuf).fd.push(pos, Math.round(sx * 10), Math.round(sy * 10), Math.round(react * 100), Math.round(v * 10), Math.round(tau * 100), Math.round(ax * 10), Math.round(ay * 10), Math.round(t * 100), act, Math.round(p * 1000));
}
export function logTH(g: G, from: number, to: number, t0: number, t1: number, v: number, q: number, relay: number): void {
  if (!g.logOn) return; (g.log as LogBuf).th.push(from, to, Math.round(t0 * 100), Math.round(t1 * 100), Math.round(v * 10), q, relay);
}
export function logRN(g: G, pid: number, from: number, to: number, t0: number, t1: number, res: number, slide: number): void {
  if (!g.logOn) return; (g.log as LogBuf).rn.push(recNo(g, pid), from, to, Math.round(t0 * 100), Math.round(t1 * 100), res, slide);
}
export function logEV(g: G, code: number, a: number, b: number): void {
  if (!g.logOn) return; (g.log as LogBuf).ev.push(g.prePA ? g.paNo + 1 : g.paNo, g.pitchNo, code, a, b);
}
export function logWhy(g: G, factor: number, size: number, decisive: boolean, pid: number): void {
  if (!g.logOn) return; const L = g.log as LogBuf; if (L.why.length / 5 >= 8) return; L.why.push(g.paNo, factor, Math.round(size * 10), decisive ? 1 : 0, recNo(g, pid));
}
export const EVC = { SUB_P: 1, SUB_PH: 2, SUB_PR: 3, SUB_DEF: 4, VISIT: 5, REVIEW: 6, DELAY: 7, RESUME: 8, WX: 9, EVENT: 10, INJURY: 11, EJECT: 12, COOLING: 13, CALLED: 14, STEAL: 15, PICKOFF: 16, WP: 17, PB: 18, BALK: 19 } as const;
export const WHY = { WIND: 1, TEMP: 2, PARK_WALL: 3, PARK_DIST: 4, RANGE: 5, MEMORY: 6, PLATOON: 7, SIG_PITCH: 8, FATIGUE: 9, UMP: 10, FRAMING: 11, BONUS: 12, WX_TRAIT: 13 } as const;

export function buildRecord(g: G): GameRecord {
  const L = g.log as LogBuf; const inp = g.inp;
  return {
    v: 1, eng: inp.engineVer, gid: inp.gameId, seedTag: ((inp.seed[0] ^ inp.seed[2]) >>> 0).toString(16).slice(0, 8), status: g.status,
    park: g.park.id, ump: g.ump.id, date: inp.ctx.date, start: inp.ctx.startMin, durMin: Math.round(g.clock / 60),
    teams: [inp.away.id, inp.home.id], dict: L.dict,
    lineups: [Array.from(g.T[0].order).map((i) => recNo(g, g.T[0].pcs[i].id)), Array.from(g.T[1].order).map((i) => recNo(g, g.T[1].pcs[i].id))],
    wx: L.wx, pa: L.pa, pt: L.pt, bb: L.bb, fd: L.fd, th: L.th, rn: L.rn, ev: L.ev, why: L.why, wp: L.wp, hl: L.hl,
  };
}
