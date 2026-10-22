// 재생 순서표 — 보기 방식 4가지를 '박자(beat)' 줄로 만든다. 박자 길이는 1배속 실제 시간(ms).
//  빨리 보기   : 반 이닝마다 점수판 칸이 차례로 차고, 주요 장면만 짧게 + 강조 문구 (전체 10초 안)
//  주요 장면   : 승리 확률이 크게 바뀐 순간만 2D 로 몇 초씩
//  이닝별      : 반 이닝을 빠르게 그린 뒤 요약에서 멈춤 → '다음 이닝'
//  자세히 보기 : 공 하나하나 (투구 궤적 · 타구 · 야수 · 주자) — 작전 버튼은 여기서만
import type { CalloutKind } from '../../ui';
import { GAME, type Bases, type FullPlay } from './local-mock';
import {
  buildBip, buildK, buildSteal, buildWalk, idleFrame, pitchFrame, residue, sampleScript,
  type Alignment, type BaseScene, type Frame, type PlayScript,
} from './script';
import { MOUND } from './geometry';
import { playerById } from '../../game/mock';

export type Mode = 'quick' | 'key' | 'inning' | 'detail';
export const MODES: { value: Mode; label: string; short: string }[] = [
  { value: 'quick', label: '빨리 보기', short: '빨리' },
  { value: 'key', label: '주요 장면', short: '주요' },
  { value: 'inning', label: '이닝별', short: '이닝' },
  { value: 'detail', label: '자세히', short: '자세히' },
];

export type Beat =
  | { k: 'half'; dur: number; play: number }
  | { k: 'event'; dur: number; play: number; ev: number }
  | { k: 'pitch'; dur: number; play: number; pitch: number; contact: boolean; rate: number }
  | { k: 'steal'; dur: number; play: number; pitch: number; rate: number }
  | { k: 'bip'; dur: number; play: number; rate: number }
  | { k: 'result'; dur: number; play: number; rate: number }
  | { k: 'callout'; dur: number; play: number }
  | { k: 'scene'; dur: number; play: number }
  | { k: 'fill'; dur: number; from: number; to: number; flash?: number; rate?: number }
  | { k: 'halfsum'; dur: number; first: number; last: number }
  | { k: 'end'; dur: number };

/* ───────── 경기 상태 (플레이 전·후) ───────── */
export interface GState {
  outs: number;
  bases: Bases;
  score: [number, number];
  /** 회별 점수 — 시작한 반 이닝만 숫자 */
  inn: { away: (number | null)[]; home: (number | null)[] };
  h: [number, number];
  e: [number, number];
  b: [number, number];
  /** 홈 승리 확률 */
  wp: number;
  /** 분위기 −1(원정) ~ +1(홈) */
  mom: number;
}

let plays = GAME.plays;
let N = plays.length;
const HITS = ['1B', '2B', '3B', 'HR'];

function computeStates() {
  const before: GState[] = [];
  const after: GState[] = [];
  let cur: GState = {
    outs: 0, bases: [null, null, null], score: [0, 0],
    inn: { away: Array(9).fill(null), home: Array(9).fill(null) },
    h: [0, 0], e: [0, 0], b: [0, 0], wp: plays[0].wp[0], mom: 0,
  };
  let mom = 0;
  plays.forEach((p, i) => {
    const newHalf = i === 0 || plays[i - 1].halfKey !== p.halfKey;
    const inn = { away: [...cur.inn.away], home: [...cur.inn.home] };
    const side = p.half === 'top' ? 'away' : 'home';
    if (newHalf && inn[side][p.inning - 1] == null) inn[side][p.inning - 1] = 0;
    const b: GState = { ...cur, outs: newHalf ? 0 : cur.outs, bases: newHalf ? [null, null, null] : cur.bases, inn, wp: p.wp[0] };
    before.push(b);
    const runs = p.half === 'top' ? p.score[0] - b.score[0] : p.score[1] - b.score[1];
    const inn2 = { away: [...inn.away], home: [...inn.home] };
    inn2[side][p.inning - 1] = (inn2[side][p.inning - 1] ?? 0) + runs;
    const bi = p.half === 'top' ? 0 : 1;
    const fi = 1 - bi;
    const h: [number, number] = [...b.h]; const e: [number, number] = [...b.e]; const bb: [number, number] = [...b.b];
    if (HITS.includes(p.code)) h[bi] += 1;
    if (p.code === 'BB' || p.code === 'HBP') bb[bi] += 1;
    if (p.code === 'E') e[fi] += 1;
    mom = mom * 0.7 + (p.wp[1] - p.wp[0]) * 2.6;
    const a: GState = { outs: Math.min(3, p.outsAfter), bases: p.basesAfter, score: [p.score[0], p.score[1]], inn: inn2, h, e, b: bb, wp: p.wp[1], mom: Math.max(-1, Math.min(1, mom)) };
    after.push(a);
    cur = a;
  });
  return { before, after };
}
export let STATES = computeStates();

/** 플레이 i 전에 그 투수가 던진 공 */
const pitchesBefore = (): number[] => {
  const m = new Map<string, number>();
  return plays.map((p) => { const v = m.get(p.pitcherId) ?? 0; m.set(p.pitcherId, v + p.seq.length); return v; });
};
export let PITCHES_BEFORE: number[] = pitchesBefore();

/** 반 이닝 목록 */
export interface HalfInfo { key: string; inning: number; half: 'top' | 'bot'; first: number; last: number; runs: number }
const halves = (): HalfInfo[] => {
  const out: HalfInfo[] = [];
  plays.forEach((p, i) => {
    const last = out[out.length - 1];
    if (!last || last.key !== p.halfKey) out.push({ key: p.halfKey, inning: p.inning, half: p.half, first: i, last: i, runs: 0 });
    else last.last = i;
  });
  out.forEach((h) => {
    const s0 = STATES.before[h.first].score, s1 = STATES.after[h.last].score;
    h.runs = h.half === 'top' ? s1[0] - s0[0] : s1[1] - s0[1];
  });
  return out;
};
export let HALVES: HalfInfo[] = halves();
export const halfOf = (i: number) => HALVES.find((h) => i >= h.first && i <= h.last)!;

/* ───────── 수비 위치 · 대본 ───────── */
export function alignFor(p: FullPlay): Alignment {
  const side = p.half === 'top' ? GAME.home : GAME.away;
  return { ...side.defense, P: p.pitcherId };
}
export const batsOf = (id: string, pitcherId: string): 'R' | 'L' => {
  const b = playerById(id)?.bats ?? 'R';
  if (b !== 'S') return b;
  return (playerById(pitcherId)?.throws ?? 'R') === 'R' ? 'L' : 'R';
};
export function sceneBefore(i: number): BaseScene {
  const p = plays[i];
  return { align: alignFor(p), bases: STATES.before[i].bases, batterId: p.batterId, bats: batsOf(p.batterId, p.pitcherId) };
}
export function sceneAfter(i: number): BaseScene {
  const p = plays[i];
  return { align: alignFor(p), bases: STATES.after[i].bases, bats: batsOf(p.batterId, p.pitcherId) };
}

const IN_PLAY = ['1B', '2B', '3B', 'HR', 'GO', 'FO', 'LO', 'DP', 'SF', 'SAC', 'E', 'FC'];
const scriptCache = new Map<number, PlayScript>();
/** 플레이의 대본 (타구 · 볼넷 · 삼진 · 도루) */
export function scriptOf(i: number): PlayScript {
  let s = scriptCache.get(i);
  if (s) return s;
  const p = plays[i];
  const prev = STATES.before[i].score;
  if (p.code === 'SB' || p.code === 'CS') s = buildSteal(p, p.seq[p.seq.length - 1]);
  else if (IN_PLAY.includes(p.code) && p.hit) s = buildBip(p, alignFor(p), prev);
  else if (p.code === 'K') s = buildK(p);
  else s = buildWalk(p, prev);
  scriptCache.set(i, s);
  return s;
}
export const isBip = (i: number) => IN_PLAY.includes(plays[i].code) && !!plays[i].hit;

/* ───────── 강조 문구 고르기 (한 경기 3~4번) ───────── */
const KIND_BONUS: Record<CalloutKind, number> = { walkoff: 1, record: 0.5, comeback: 0.3, 'go-ahead': 0.15, escape: 0.1, clutch: 0.05, defense: 0 };
export function calloutScore(p: FullPlay) {
  const h = p.highlight;
  if (!h) return 0;
  let s = Math.abs(p.wp[1] - p.wp[0]) + KIND_BONUS[h.kind];
  if (h.kind === 'defense' && p.defense) s += (0.35 - p.defense.catchProb) * 1.2;
  return s;
}
export function pickCallouts(max: number): number[] {
  return plays
    .map((p, i) => ({ i, s: calloutScore(p) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .map((x) => x.i)
    .sort((a, b) => a - b);
}
export let CALLOUTS_ALL = pickCallouts(4);

/** 주요 장면 — 승리 확률 변화가 큰 순간 (+ 강조 장면), 많아야 8개 */
const keyPlays = (): number[] => {
  const c = plays
    .map((p, i) => ({ i, d: Math.abs(p.wp[1] - p.wp[0]) + (p.highlight ? 0.3 : 0) }))
    .filter((x) => x.d >= 0.08)
    .sort((a, b) => b.d - a.d)
    .slice(0, 8)
    .map((x) => x.i)
    .sort((a, b) => a - b);
  return c;
};
export let KEY_PLAYS: number[] = keyPlays();

/* ───────── 박자 길이 ───────── */
export const PITCH_T = { windup: 0.62, flight: 0.42, settle: 0.6 };
const CALL_MS = { quick: 1300, normal: 2400, slow: 3300 };
const CALL_EXTRA: Record<CalloutKind, number> = { defense: 0, clutch: 0, 'go-ahead': 100, comeback: 200, walkoff: 600, escape: 0, record: 300 };
export const calloutPace = (m: Mode) => (m === 'quick' ? 'quick' : m === 'detail' ? 'slow' : 'normal') as 'quick' | 'normal' | 'slow';
const callMs = (m: Mode, i: number) => {
  const pace = calloutPace(m);
  const k = plays[i].highlight?.kind ?? 'clutch';
  return CALL_MS[pace] + (pace === 'quick' ? CALL_EXTRA[k] / 3 : CALL_EXTRA[k]);
};
const ms = (gameSec: number, rate: number) => Math.round((gameSec / rate) * 1000);

function pitchBeats(i: number, from: number, rate: number, out: Beat[]) {
  const p = plays[i];
  for (let j = from; j < p.seq.length; j++) {
    const pt = p.seq[j];
    const contact = pt.res === 'inplay';
    if (pt.steal) {
      const s = scriptOf(i);
      out.push({ k: 'steal', dur: ms(s.dur, rate), play: i, pitch: j, rate });
      continue;
    }
    const g = PITCH_T.windup + PITCH_T.flight + (contact ? 0.05 : PITCH_T.settle);
    out.push({ k: 'pitch', dur: ms(g, rate), play: i, pitch: j, contact, rate });
  }
}

function resultBeat(i: number, rate: number, hold: number, out: Beat[]) {
  const p = plays[i];
  if (p.code === 'SB' || p.code === 'CS') return;
  const s = scriptOf(i);
  if (isBip(i)) out.push({ k: 'bip', dur: ms(s.dur, rate) + hold, play: i, rate });
  else out.push({ k: 'result', dur: ms(s.dur, rate) + Math.round(hold / 2), play: i, rate });
}

/* 자세히 보기 */
function buildDetail(): Beat[] {
  const out: Beat[] = [];
  const calls = new Set(CALLOUTS_ALL);
  plays.forEach((p, i) => {
    if (i === 0 || plays[i - 1].halfKey !== p.halfKey) out.push({ k: 'half', dur: 1300, play: i });
    p.pre.forEach((_, e) => out.push({ k: 'event', dur: 1800, play: i, ev: e }));
    pitchBeats(i, 0, 1.25, out);
    resultBeat(i, 1.45, 450, out);
    if (calls.has(i)) out.push({ k: 'callout', dur: callMs('detail', i), play: i });
  });
  out.push({ k: 'end', dur: 400 });
  return out;
}

/* 주요 장면 */
function buildKey(): Beat[] {
  const out: Beat[] = [];
  const calls = new Set(CALLOUTS_ALL);
  let done = 0;
  KEY_PLAYS.forEach((i) => {
    if (i > done) out.push({ k: 'fill', dur: 520, from: done, to: i });
    out.push({ k: 'scene', dur: 1500, play: i });
    const p = plays[i];
    pitchBeats(i, Math.max(0, p.seq.length - 1), 1.1, out);
    resultBeat(i, 1.7, 500, out);
    if (calls.has(i)) out.push({ k: 'callout', dur: callMs('key', i), play: i });
    done = i + 1;
  });
  if (done < N) out.push({ k: 'fill', dur: 520, from: done, to: N });
  out.push({ k: 'end', dur: 400 });
  return out;
}

/* 이닝별 */
function buildInning(): Beat[] {
  const out: Beat[] = [];
  const calls = new Set(CALLOUTS_ALL);
  HALVES.forEach((h) => {
    out.push({ k: 'half', dur: 900, play: h.first });
    for (let i = h.first; i <= h.last; i++) {
      const p = plays[i];
      if (p.pre.some((e) => e.kind !== 'note')) out.push({ k: 'event', dur: 1100, play: i, ev: p.pre.findIndex((e) => e.kind !== 'note') });
      if (p.code === 'SB') { out.push({ k: 'steal', dur: ms(scriptOf(i).dur, 3), play: i, pitch: p.seq.length - 1, rate: 3 }); continue; }
      const hl = calls.has(i);
      resultBeat(i, hl ? 1.8 : 3.4, hl ? 300 : 80, out);
      if (hl) out.push({ k: 'callout', dur: callMs('inning', i), play: i });
    }
    out.push({ k: 'halfsum', dur: 600, first: h.first, last: h.last });
  });
  out.push({ k: 'end', dur: 400 });
  return out;
}

/* 빨리 보기 — 10초 예산 */
export const QUICK_BUDGET = 9600;
function buildQuick(): Beat[] {
  let calls = pickCallouts(3);
  const flashMs = 520;
  const endMs = 300;
  const fixed = () => calls.reduce((s, i) => s + callMs('quick', i) + flashMs, 0) + endMs;
  while (calls.length > 1 && QUICK_BUDGET - fixed() < HALVES.length * 150) {
    // 예산이 모자라면 점수가 낮은 강조 문구부터 뺀다
    const worst = calls.reduce((a, b) => (calloutScore(plays[a]) <= calloutScore(plays[b]) ? a : b));
    calls = calls.filter((x) => x !== worst);
  }
  const callSet = new Set(calls);
  const weights = HALVES.map((h) => (h.runs > 0 ? 2.4 : 1));
  const wsum = weights.reduce((a, b) => a + b, 0);
  const pool = QUICK_BUDGET - fixed();
  const out: Beat[] = [];
  HALVES.forEach((h, hi) => {
    const d = Math.max(140, Math.round((pool * weights[hi]) / wsum));
    const hl = [...callSet].find((i) => i >= h.first && i <= h.last);
    // 점수 난 반 이닝은 득점 장면을 번쩍 보여 준다
    let flash: number | undefined;
    if (h.runs > 0) {
      let best = -1, bestD = -1;
      for (let i = h.first; i <= h.last; i++) {
        const p = plays[i];
        const runs = p.half === 'top' ? p.score[0] - STATES.before[i].score[0] : p.score[1] - STATES.before[i].score[1];
        const dd = Math.abs(p.wp[1] - p.wp[0]) + runs * 0.05;
        if (runs > 0 && isBip(i) && dd > bestD) { best = i; bestD = dd; }
      }
      if (best >= 0) flash = best;
    }
    if (hl != null) {
      if (hl > h.first) out.push({ k: 'fill', dur: Math.round(d * 0.5), from: h.first, to: hl });
      const s = scriptOf(hl);
      out.push({ k: 'fill', dur: flashMs, from: hl, to: hl + 1, flash: hl, rate: (s.dur * 1000) / (flashMs * 0.92) });
      out.push({ k: 'callout', dur: callMs('quick', hl), play: hl });
      if (hl < h.last) out.push({ k: 'fill', dur: Math.max(120, Math.round(d * 0.5)), from: hl + 1, to: h.last + 1 });
    } else if (flash != null) {
      const s = scriptOf(flash);
      out.push({ k: 'fill', dur: d, from: h.first, to: h.last + 1, flash, rate: (s.dur * 1000) / (d * 0.62) });
    } else {
      out.push({ k: 'fill', dur: d, from: h.first, to: h.last + 1 });
    }
  });
  out.push({ k: 'end', dur: endMs });
  return out;
}

const cache = new Map<Mode, Beat[]>();
export function beatsFor(m: Mode): Beat[] {
  let b = cache.get(m);
  if (!b) {
    b = m === 'quick' ? buildQuick() : m === 'key' ? buildKey() : m === 'inning' ? buildInning() : buildDetail();
    cache.set(m, b);
  }
  return b;
}
export const totalMs = (b: Beat[]) => b.reduce((s, x) => s + x.dur, 0);

/** 경기를 바꿔 끼운 뒤 — 상태 · 반 이닝 · 강조 장면 · 박자를 새로 (match/active.ts 가 부른다) */
export function rebuildTimeline() {
  plays = GAME.plays;
  N = plays.length;
  scriptCache.clear();
  cache.clear();
  STATES = computeStates();
  PITCHES_BEFORE = pitchesBefore();
  HALVES = halves();
  CALLOUTS_ALL = pickCallouts(4);
  KEY_PLAYS = keyPlays();
}

/** 박자가 다루는 플레이 (첫 플레이) */
export function playOfBeat(b: Beat): number {
  switch (b.k) {
    case 'fill': return b.flash ?? b.from;
    case 'halfsum': return b.last;
    case 'end': return N - 1;
    default: return b.play;
  }
}

/** 다른 보기로 바꿀 때 — 그 플레이(또는 그 뒤) 첫 박자 */
export function beatIndexForPlay(beats: Beat[], play: number): number {
  for (let k = 0; k < beats.length; k++) {
    const b = beats[k];
    if (b.k === 'fill' && b.to > play && b.from <= play) return k;
    if (b.k === 'end') return k;
    if (b.k !== 'fill' && b.k !== 'halfsum' && playOfBeat(b) >= play) return k;
  }
  return beats.length - 1;
}

/* ───────── 박자 → 지금 경기 상태 ───────── */
export interface Cursor {
  /** 진행 중인 플레이 */
  play: number;
  /** 그 플레이에서 던진 공 수 */
  pitches: number;
  /** 결과가 반영됐나 */
  applied: boolean;
}

export function cursorOf(b: Beat, local: number): Cursor {
  const u = b.dur > 0 ? local / b.dur : 1;
  switch (b.k) {
    case 'half': case 'event': return { play: b.play, pitches: 0, applied: false };
    case 'scene': return { play: b.play, pitches: Math.max(0, plays[b.play].seq.length - 1), applied: false };
    case 'pitch': {
      const arrived = (local / 1000) * b.rate >= PITCH_T.windup + PITCH_T.flight;
      return { play: b.play, pitches: arrived && !b.contact ? b.pitch + 1 : b.pitch, applied: false };
    }
    case 'steal': {
      const s = scriptOf(b.play);
      const t = (local / 1000) * b.rate;
      return { play: b.play, pitches: t >= PITCH_T.windup + PITCH_T.flight ? b.pitch + 1 : b.pitch, applied: t >= s.dur - 0.9 };
    }
    case 'bip': case 'result': {
      const s = scriptOf(b.play);
      const t = (local / 1000) * b.rate;
      return { play: b.play, pitches: plays[b.play].seq.length, applied: t >= Math.max(0.4, s.dur - 0.9) };
    }
    case 'callout': return { play: b.play, pitches: plays[b.play].seq.length, applied: true };
    case 'fill': {
      if (b.flash != null) {
        const s = scriptOf(b.flash);
        const t = (local / 1000) * (b.rate ?? 1);
        if (t < s.dur - 0.9) return { play: b.flash, pitches: plays[b.flash].seq.length, applied: false };
        return { play: b.to - 1, pitches: plays[b.to - 1].seq.length, applied: true };
      }
      return u >= 0.5 ? { play: b.to - 1, pitches: plays[b.to - 1].seq.length, applied: true } : { play: b.from, pitches: 0, applied: false };
    }
    case 'halfsum': return { play: b.last, pitches: plays[b.last].seq.length, applied: true };
    case 'end': return { play: N - 1, pitches: plays[N - 1].seq.length, applied: true };
  }
}

export interface Live extends GState {
  play: FullPlay;
  playIdx: number;
  /** 볼카운트 */
  count: [number, number];
  /** 지금 투수가 던진 공 */
  pitcherPitches: number;
  /** 이 플레이에서 던진 공 수 */
  thrown: number;
  applied: boolean;
}

export function liveOf(c: Cursor): Live {
  const p = plays[c.play];
  const st = c.applied ? STATES.after[c.play] : STATES.before[c.play];
  const last = c.pitches > 0 ? p.seq[c.pitches - 1] : undefined;
  // 타석 중간 사건(도루) 다음 타석은 볼카운트를 이어받는다
  let count: [number, number] = last ? [last.b, last.s] : [0, 0];
  if (!last && c.play > 0 && !plays[c.play - 1].isPA && plays[c.play - 1].halfKey === p.halfKey) {
    const pl = plays[c.play - 1].seq[plays[c.play - 1].seq.length - 1];
    count = [pl.b, pl.s];
  }
  return {
    ...st, play: p, playIdx: c.play, count: [Math.min(3, count[0]), Math.min(2, count[1])],
    pitcherPitches: PITCHES_BEFORE[c.play] + c.pitches, thrown: c.pitches, applied: c.applied,
  };
}

/* ───────── 박자 → 2D 장면 ───────── */
export interface Residue { id: string; trace?: { x: number; y: number }[]; landing?: PlayScript['landing']; label?: string; tone: 'hit' | 'out' }

/** 지금 반 이닝에서 이미 끝난 타구들 (기록지처럼 남김) */
export function residuesFor(c: Cursor): Residue[] {
  const h = halfOf(c.play);
  const out: Residue[] = [];
  const end = c.applied ? c.play : c.play - 1;
  for (let i = h.first; i <= end; i++) {
    if (!isBip(i)) continue;
    const r = residue(scriptOf(i));
    out.push({ id: plays[i].id, ...r, tone: HITS.includes(plays[i].code) || plays[i].code === 'E' ? 'hit' : 'out' });
  }
  return out;
}

export function frameOf(b: Beat, local: number): Frame {
  switch (b.k) {
    case 'half': case 'event': case 'scene': return idleFrame(sceneBefore(b.play));
    case 'pitch': {
      const p = plays[b.play];
      const pt = p.seq[b.pitch];
      const t = (local / 1000) * b.rate;
      const u = (t - PITCH_T.windup) / PITCH_T.flight;
      const thr = playerById(p.pitcherId)?.throws ?? 'R';
      const sc: BaseScene = { ...sceneBefore(b.play), bases: STATES.before[b.play].bases };
      return pitchFrame(pt, thr, u, sc, pt.sig);
    }
    case 'steal': {
      const p = plays[b.play];
      const pt = p.seq[b.pitch];
      const t = (local / 1000) * b.rate;
      const s = scriptOf(b.play);
      const sc = sceneBefore(b.play);
      const fr = sampleScript(s, t, sc);
      const u = (t - PITCH_T.windup) / PITCH_T.flight;
      if (u >= 0 && u <= 1.1) {
        const thr = playerById(p.pitcherId)?.throws ?? 'R';
        const pf = pitchFrame(pt, thr, u, sc, pt.sig);
        return { ...fr, ball: pf.ball, tail: pf.tail, tailColor: pf.tailColor };
      }
      return fr;
    }
    case 'bip': case 'result': {
      const t = (local / 1000) * b.rate;
      return sampleScript(scriptOf(b.play), t, sceneBefore(b.play));
    }
    case 'callout': {
      const s = scriptOf(b.play);
      return sampleScript(s, s.dur, sceneBefore(b.play));
    }
    case 'fill': {
      if (b.flash != null) {
        const s = scriptOf(b.flash);
        const t = Math.min(s.dur, (local / 1000) * (b.rate ?? 1));
        return sampleScript(s, t, sceneBefore(b.flash), { circles: false });
      }
      const c = cursorOf(b, local);
      return idleFrame(c.applied ? { ...sceneAfter(c.play), bases: c.applied && STATES.after[c.play].outs >= 3 ? [null, null, null] : STATES.after[c.play].bases } : sceneBefore(c.play));
    }
    case 'halfsum': {
      const sc = sceneAfter(b.last);
      return idleFrame({ ...sc, bases: [null, null, null] });
    }
    case 'end': {
      const s = scriptOf(N - 1);
      return sampleScript(s, s.dur, sceneBefore(N - 1));
    }
  }
}

/** 투수 위치 (마운드) — 투구 장면에서 투수 표시용 */
export const MOUND_PT = MOUND;
export { plays as PLAYS, N as PLAY_COUNT };
