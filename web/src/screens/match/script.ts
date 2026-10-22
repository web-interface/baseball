// 플레이 대본 — 한 플레이(타구·투구·볼넷)를 '시간 → 공·야수·주자 위치'로 바꾼다.
// 시간 단위는 경기 초(game seconds). 화면은 보기 방식마다 빠르기(rate)를 곱해 재생한다.
// 엔진 테이프가 오면 bb(타구)·fd(야수)·th(송구)·rn(주자) 값을 그대로 대본으로 옮기면 된다(지금은 목업에서 근사).
import { playerById } from '../../game/mock';
import { polarToField } from '../../game/field';
import { defaultSpot, fenceOf, hangOf, type FullPlay, type PitchEv } from './local-mock';
import {
  BASE, CATCHER, EASE, M, MOUND, NUM_POS, PLATE, add, along, basePath, bez, clamp01, dist, distM, lerpPt, norm, pathLen, scale, sub,
  type EaseName, type FPos, type Pt,
} from './geometry';

/* ───────── 대본 타입 ───────── */
export interface Track { t0: number; t1: number; pts: Pt[]; ease?: EaseName }
export interface BallLeg {
  t0: number; t1: number; a: Pt; b: Pt;
  /** 꼭짓점 높이 (m) */
  apex: number;
  kind: 'pitch' | 'flight' | 'roll' | 'throw' | 'bounce';
  ease?: EaseName;
  /** 휘는 공 — 2차 베지어 조절점 */
  ctrl?: Pt;
}
export interface RunnerScript { id: string; start: Pt; tracks: Track[]; fate: 'safe' | 'out' | 'score' | 'hold'; outT?: number; scoreT?: number; batter: boolean }
export interface FielderScript { pos: FPos; id: string; start: Pt; tracks: Track[]; dive?: [number, number] }
export interface Mark { t: number; until: number; at: Pt; text: string; tone: 'out' | 'hit' | 'hr' | 'run' | 'info' | 'error'; dy?: number; kLook?: boolean }
export interface CircleSpec { pos: FPos; c: Pt; react: number; mps: number; strong: boolean }
export interface PlayScript {
  dur: number;
  legs: BallLeg[];
  /** 공이 사라지는 때 (담장 너머 · 포수 미트) */
  ballGone?: number;
  runners: RunnerScript[];
  fielders: FielderScript[];
  marks: Mark[];
  circles?: { list: CircleSpec[]; hang: number };
  landing?: { at: Pt; t: number; kind: 'hit' | 'out' | 'hr' | 'wall' };
  cause?: { at: Pt; t: number; text: string };
  readout?: { ev: number; la: number; dist: number; catchProb?: number; t: number };
  /** 이 대본에서 공의 땅 위 자취를 남길 다리 (뜬공·땅볼) */
  trace?: boolean;
  /** 공 색 꼬리 (고유 구종) */
  tail?: string;
}

/* ───────── 수비 위치 ───────── */
export type Alignment = Record<FPos, string>;

export function spotOf(pos: FPos): Pt {
  if (pos === 'P') return MOUND;
  if (pos === 'C') return CATCHER;
  return defaultSpot(pos);
}

const speedOf = (id: string) => {
  const a = playerById(id)?.attrs;
  return 6.5 + (((a?.speed ?? 55) - 50) * 0.05);
};

/* ───────── 주자 계획 ───────── */
interface RunPlan { id: string; from: number; to: number; fate: 'safe' | 'out' | 'score' | 'hold'; batter: boolean }

const AIR_OUT = ['FO', 'LO', 'SF'];

function runsOf(p: FullPlay, prevScore: [number, number]) {
  return p.half === 'top' ? p.score[0] - prevScore[0] : p.score[1] - prevScore[1];
}

/** 받는 사람의 베이스 — 6-4-3 의 4 는 2루, 3 은 1루, 1-2-3 의 2 는 홈 */
function receiverBase(d: number, last: boolean) {
  if (d === 2) return 4;
  if (d === 5) return 3;
  if (d === 4 || d === 6) return last ? 2 : 2;
  return 1; // 1·3 = 1루
}

function planRunners(p: FullPlay, prevScore: [number, number], outBases: number[]): RunPlan[] {
  const before = p.basesBefore;
  const after = p.basesAfter;
  const runs = runsOf(p, prevScore);
  const over = p.outsAfter >= 3;
  const onBase = [3, 2, 1].filter((k) => before[k - 1]).map((k) => ({ id: before[k - 1]!, from: k }));
  const plans: RunPlan[] = [];
  const batterOut = ['K', 'FO', 'LO', 'SF', 'GO', 'DP', 'SAC'].includes(p.code);

  if (p.code === 'HR') {
    onBase.forEach((r) => plans.push({ ...r, to: 4, fate: 'score', batter: false }));
    plans.push({ id: p.batterId, from: 0, to: 4, fate: 'score', batter: true });
    return plans;
  }

  if (!over) {
    let left = runs;
    for (const r of onBase) {
      const j = after.indexOf(r.id);
      if (j >= 0) plans.push({ ...r, to: j + 1, fate: j + 1 === r.from ? 'hold' : 'safe', batter: false });
      else if (left > 0) { left--; plans.push({ ...r, to: 4, fate: 'score', batter: false }); }
      else plans.push({ ...r, to: Math.min(4, r.from + 1), fate: 'out', batter: false });
    }
    const j = after.indexOf(p.batterId);
    if (j >= 0) plans.push({ id: p.batterId, from: 0, to: j + 1, fate: 'safe', batter: true });
    else if (left > 0) plans.push({ id: p.batterId, from: 0, to: 4, fate: 'score', batter: true });
    else plans.push({ id: p.batterId, from: 0, to: 1, fate: 'out', batter: true });
    return plans;
  }

  // 이닝이 끝나는 플레이 — 아웃은 송구 베이스에서, 나머지는 밀려 가거나 그대로
  const forcedFrom = new Set<number>();
  const batterRuns = !['K'].includes(p.code);
  if (batterRuns) {
    let k = 1;
    while (k <= 3 && before[k - 1]) { forcedFrom.add(k); k++; }
  }
  const outFrom = new Set(outBases.map((b) => b - 1)); // 베이스 b 에서 아웃 = b-1 에서 온 주자
  for (const r of onBase) {
    if (outFrom.has(r.from)) plans.push({ ...r, to: r.from + 1, fate: 'out', batter: false });
    else if (forcedFrom.has(r.from) && !AIR_OUT.includes(p.code)) plans.push({ ...r, to: r.from + 1, fate: 'safe', batter: false });
    else plans.push({ ...r, to: r.from, fate: 'hold', batter: false });
  }
  if (p.code === 'K') plans.push({ id: p.batterId, from: 0, to: 0, fate: 'out', batter: true });
  else if (outFrom.has(0) || batterOut) plans.push({ id: p.batterId, from: 0, to: 1, fate: 'out', batter: true });
  else plans.push({ id: p.batterId, from: 0, to: 1, fate: 'safe', batter: true });
  return plans;
}

/* ───────── 타구 대본 ───────── */
export function buildBip(p: FullPlay, align: Alignment, prevScore: [number, number]): PlayScript {
  const h = p.hit!;
  const L: Pt = { x: h.x, y: h.y };
  const dir = norm(sub(L, PLATE));
  const digits = (p.notation ?? '').match(/\d/g)?.map(Number) ?? [];
  const code = p.code;
  const legs: BallLeg[] = [];
  const marks: Mark[] = [];
  const fielders = new Map<FPos, FielderScript>();
  const fs = (pos: FPos) => {
    let f = fielders.get(pos);
    if (!f) { f = { pos, id: align[pos], start: spotOf(pos), tracks: [] }; fielders.set(pos, f); }
    return f;
  };
  const posAt = (pos: FPos) => { const f = fs(pos); const last = f.tracks[f.tracks.length - 1]; return last ? last.pts[last.pts.length - 1] : f.start; };
  const moveTo = (pos: FPos, to: Pt, t0: number, t1: number, ease: EaseName = 'inout') => {
    const from = posAt(pos);
    const prev = fs(pos).tracks[fs(pos).tracks.length - 1];
    const s0 = prev ? Math.max(t0, prev.t1) : t0;
    fs(pos).tracks.push({ t0: s0, t1: Math.max(s0 + 0.05, t1), pts: [from, to], ease });
  };
  const batterArrive = 0.32 + 27.43 / speedOf(p.batterId);
  const scoreT: number[] = [];
  let ballDone = 0;               // 공이 정리된 때 (잡힘 · 송구 도착)
  const outAtBase = new Map<number, number>(); // 베이스 → 아웃 순간
  let landing: PlayScript['landing'];
  let circles: PlayScript['circles'];
  let ballGone: number | undefined;
  const la = h.kind === 'ground' ? -6 : h.kind === 'line' ? 14 : h.kind === 'pop' ? 58 : 31;
  let readoutT = 0.3;

  const isAirOut = AIR_OUT.includes(code);
  const isGroundPlay = h.kind === 'ground';
  const hitName = code === '1B' ? (p.notation === '번트' ? '번트 안타' : '안타') : code === '2B' ? '2루타' : code === '3B' ? '3루타' : '';

  if (code === 'HR') {
    // 담장 너머로
    const hang = hangOf({ kind: 'fly', distM: h.distM, kmh: h.kmh }) + 0.4;
    legs.push({ t0: 0, t1: hang, a: PLATE, b: L, apex: 9.8 * hang * hang / 8 * 0.8, kind: 'flight' });
    ballGone = hang + 0.5;
    const wallPt = polarToField(h.angle, fenceOf(h.angle) - 2);
    const of = (['LF', 'CF', 'RF'] as FPos[]).sort((a, b) => dist(spotOf(a), wallPt) - dist(spotOf(b), wallPt))[0];
    moveTo(of, wallPt, 0.35, hang * 0.9, 'out');
    landing = { at: L, t: hang, kind: 'hr' };
    marks.push({ t: hang, until: 99, at: L, text: `홈런 · ${Math.round(h.distM)}m`, tone: 'hr' });
    ballDone = hang;
    readoutT = hang * 0.5;
  } else if (isAirOut) {
    const d = p.defense;
    const hang = d?.hangS ?? hangOf(h);
    legs.push({ t0: 0, t1: hang, a: PLATE, b: L, apex: 9.8 * hang * hang / 8 * (h.kind === 'line' ? 0.5 : 0.85), kind: 'flight' });
    const catcherPos = NUM_POS[digits[0] ?? 8] ?? 'CF';
    const info = d?.fielders.find((f) => f.pos === catcherPos);
    const react = info?.reactS ?? 0.35;
    const arrive = info?.arriveS ?? Math.min(hang, react + distM(spotOf(catcherPos), L) / 8);
    const dive = !!info?.dive;
    if (info) fs(catcherPos).start = info.from;
    if (dive) {
      const pre = lerpPt(fs(catcherPos).start, L, 0.86);
      moveTo(catcherPos, pre, react, hang - 0.3, 'run');
      moveTo(catcherPos, L, hang - 0.3, hang, 'out');
      fs(catcherPos).dive = [hang - 0.3, hang + 0.55];
    } else {
      moveTo(catcherPos, L, react, Math.min(arrive, hang), 'run');
    }
    // 다른 야수들 — 공 쪽으로 조금
    (d?.fielders ?? []).filter((f) => f.pos !== catcherPos).slice(0, 2).forEach((f) => {
      fs(f.pos).start = f.from;
      moveTo(f.pos, lerpPt(f.from, L, 0.42), f.reactS, hang * 0.95, 'run');
    });
    landing = { at: L, t: hang, kind: 'out' };
    const label = `${p.notation ?? ''}${dive ? ' 다이빙 캐치' : ''}`.trim() || '아웃';
    marks.push({ t: hang, until: 99, at: L, text: label, tone: 'out' });
    ballDone = hang;
    if (d) circles = { hang, list: d.fielders.map((f, i) => ({ pos: f.pos, c: f.from, react: f.reactS, mps: f.mps, strong: i < 3 })) };
    if (code === 'SF') {
      const tThrow = hang + 0.45;
      const throwDur = distM(L, PLATE) / 33 + 0.2;
      legs.push({ t0: tThrow, t1: tThrow + throwDur, a: L, b: CATCHER, apex: 3.5, kind: 'throw' });
      ballDone = tThrow + throwDur;
    }
    readoutT = hang * 0.4;
  } else if (isGroundPlay && ['GO', 'DP', 'FC', 'E', 'SAC'].includes(code)) {
    // 땅볼 — 첫 야수가 잡아 송구 사슬
    const tRoll = Math.max(0.55, hangOf(h));
    const mid = lerpPt(PLATE, L, 0.42);
    legs.push({ t0: 0, t1: tRoll * 0.3, a: PLATE, b: mid, apex: 1.4, kind: 'bounce' });
    legs.push({ t0: tRoll * 0.3, t1: tRoll, a: mid, b: L, apex: 0.35, kind: 'bounce', ease: 'out' });
    const first = NUM_POS[digits[0] ?? 6] ?? 'SS';
    moveTo(first, L, 0.12, tRoll, 'run');
    let t = tRoll + 0.3;
    let holder: Pt = L;
    if (code === 'E') {
      // 놓침 — 공이 튀고 다시 잡아 늦은 송구
      const kick = add(L, scale(dir, M(2.2)));
      legs.push({ t0: tRoll, t1: tRoll + 0.4, a: L, b: kick, apex: 0.6, kind: 'bounce' });
      moveTo(first, kick, tRoll + 0.1, tRoll + 0.6, 'out');
      marks.push({ t: tRoll + 0.3, until: 99, at: kick, text: '실책', tone: 'error' });
      holder = kick;
      const tgt = BASE[1];
      const dur = distM(holder, tgt) / 29 + 0.1;
      t = Math.max(tRoll + 0.95, batterArrive - dur + 0.25); // 타자가 먼저 들어감
      moveTo('1B', tgt, 0.25, t + dur - 0.2);
      legs.push({ t0: t, t1: t + dur, a: holder, b: tgt, apex: 1.2, kind: 'throw' });
      ballDone = t + dur;
    } else {
      for (let i = 1; i < digits.length; i++) {
        const recv = NUM_POS[digits[i]];
        const base = receiverBase(digits[i], i === digits.length - 1);
        const tgt = base === 4 ? { x: PLATE.x, y: PLATE.y + 0.006 } : BASE[base];
        const dur = distM(holder, tgt) / 30 + 0.08;
        const arrive = t + dur;
        if (recv) moveTo(recv, tgt, 0.25, Math.max(0.6, arrive - 0.25), 'run');
        legs.push({ t0: t, t1: arrive, a: holder, b: tgt, apex: 1.0, kind: 'throw' });
        outAtBase.set(base, arrive);
        const last = i === digits.length - 1;
        marks.push({
          t: arrive, until: 99, at: tgt, dy: base === 4 ? -10 : -9,
          text: last ? `${p.notation}${code === 'DP' ? ' 병살' : code === 'FC' ? ' 아웃' : ''}` : '아웃', tone: 'out',
        });
        holder = tgt;
        t = arrive + (code === 'DP' ? 0.32 : 0.25);
        ballDone = arrive;
      }
      if (digits.length === 1) { outAtBase.set(1, tRoll); ballDone = tRoll; }
    }
    readoutT = 0.25;
  } else {
    // 안타 — 뜬 공(직선타·뜬공)은 떨어진 뒤 구르고, 땅볼은 내야를 뚫고 외야로
    const d = p.defense;
    const wall = h.kind !== 'ground' && h.distM >= fenceOf(h.angle) - 1.5;
    let restAt: Pt;
    let restT: number;
    if (h.kind === 'ground') {
      const tRoll = Math.max(0.7, hangOf(h));
      const mid = lerpPt(PLATE, L, 0.35);
      legs.push({ t0: 0, t1: tRoll * 0.28, a: PLATE, b: mid, apex: 1.1, kind: 'bounce' });
      legs.push({ t0: tRoll * 0.28, t1: tRoll, a: mid, b: L, apex: 0.3, kind: 'bounce', ease: 'out' });
      restAt = L;
      restT = tRoll;
      // 길목의 내야수가 몸을 날리지만 못 잡음
      const infs: FPos[] = p.notation === '번트' ? [] : ['1B', '2B', 'SS', '3B'];
      const near = infs
        .map((pos) => ({ pos, s: spotOf(pos), q: lerpPt(PLATE, L, Math.max(0.2, Math.min(0.8, ((spotOf(pos).x - PLATE.x) * dir.x + (spotOf(pos).y - PLATE.y) * dir.y) / dist(PLATE, L)))) }))
        .sort((a, b) => dist(a.s, a.q) - dist(b.s, b.q))[0];
      if (near && dist(near.s, near.q) < M(14)) {
        const reach = lerpPt(near.s, near.q, 0.78);
        moveTo(near.pos, reach, 0.12, tRoll * 0.45, 'out');
        fs(near.pos).dive = [tRoll * 0.3, tRoll * 0.45 + 0.5];
      }
      if (p.notation === '번트') {
        // 기습 번트 — 3루수가 뛰어들어 잡고 1루로 던지지만 늦음
        moveTo('3B', L, 0.1, tRoll + 0.1, 'run');
        moveTo('1B', BASE[1], 0.2, tRoll + 0.5);
        const dur = distM(L, BASE[1]) / 29 + 0.08;
        const tt = Math.max(tRoll + 0.35, batterArrive - dur + 0.22); // 한 발 늦은 송구
        legs.push({ t0: tt, t1: tt + dur, a: L, b: BASE[1], apex: 1.0, kind: 'throw' });
        restT = tt + dur;
        restAt = BASE[1];
        ballDone = restT;
      }
      landing = { at: L, t: tRoll, kind: 'hit' };
    } else {
      const hang = d?.hangS ?? hangOf(h);
      legs.push({ t0: 0, t1: hang, a: PLATE, b: L, apex: 9.8 * hang * hang / 8 * (h.kind === 'line' ? 0.5 : 0.8), kind: 'flight' });
      if (wall) {
        const back = add(L, scale(dir, -M(6)));
        legs.push({ t0: hang, t1: hang + 0.7, a: L, b: back, apex: 1.6, kind: 'bounce', ease: 'out' });
        restAt = back;
        restT = hang + 0.7;
        marks.push({ t: hang, until: hang + 1.6, at: L, text: '펜스 직격', tone: 'info', dy: -12 });
        landing = { at: L, t: hang, kind: 'wall' };
      } else {
        const roll = h.kind === 'line' ? 7 : 11;
        const end = add(L, scale(dir, M(roll)));
        legs.push({ t0: hang, t1: hang + 0.35, a: L, b: lerpPt(L, end, 0.55), apex: 1.5, kind: 'bounce' });
        legs.push({ t0: hang + 0.35, t1: hang + 1.05, a: lerpPt(L, end, 0.55), b: end, apex: 0.3, kind: 'bounce', ease: 'out' });
        restAt = end;
        restT = hang + 1.05;
        landing = { at: L, t: hang, kind: 'hit' };
      }
      if (d) circles = { hang, list: d.fielders.map((f, i) => ({ pos: f.pos, c: f.from, react: f.reactS, mps: f.mps, strong: i < 3 })) };
    }
    if (p.notation !== '번트') {
      // 가장 가까운 외야수가 공을 주워 중계 플레이어에게
      const ofs: FPos[] = ['LF', 'CF', 'RF'];
      const of = ofs.sort((a, b) => dist(spotOf(a), restAt) - dist(spotOf(b), restAt))[0];
      const runT = 0.35 + distM(spotOf(of), restAt) / 8.2;
      const pick = Math.max(restT + 0.1, runT);
      moveTo(of, restAt, 0.3, pick, 'run');
      const cutPos: FPos = h.angle < 0 ? 'SS' : '2B';
      const cut = lerpPt(BASE[2], restAt, 0.2);
      moveTo(cutPos, cut, 0.6, pick + 0.2);
      const dur = distM(restAt, cut) / 30 + 0.1;
      legs.push({ t0: pick + 0.3, t1: pick + 0.3 + dur, a: restAt, b: cut, apex: 2.5, kind: 'throw' });
      ballDone = pick + 0.3 + dur;
    }
    marks.push({ t: landing?.t ?? 0.8, until: 99, at: restAt, text: hitName, tone: 'hit', dy: -11 });
    readoutT = 0.3;
  }

  /* 주자 */
  const plans = planRunners(p, prevScore, [...outAtBase.keys()]);
  const runners: RunnerScript[] = [];
  const hangT = legs[0]?.t1 ?? 1;
  const twoOut = p.outsBefore === 2;
  for (const r of plans) {
    const v = speedOf(r.id);
    const start = BASE[r.from];
    if (r.fate === 'hold' || r.to === r.from) {
      runners.push({ id: r.id, start, tracks: [], fate: 'hold', batter: r.batter });
      continue;
    }
    // 뜬공이면 잡힐 때까지 기다렸다가(태그업) — 2아웃이면 바로 뜀
    let t0 = r.batter ? 0.32 : 0.05;
    const airBall = h.kind !== 'ground' && code !== 'HR';
    if (!r.batter && airBall && !twoOut && isAirOut) t0 = hangT + 0.05;
    else if (!r.batter && airBall && !twoOut) t0 = Math.min(hangT * 0.6, 1.2); // 안타 판단 뒤 출발
    const pts = basePath(r.from, Math.min(4, r.to));
    let len = pathLen(pts) * 140;
    let t1 = t0 + len / v;
    if (code === 'HR') t1 = Math.max(t0 + 1.2, (r.batter ? 1.0 : 0.6) + (hangT + 1.8) * (len / 109.7));
    if (r.fate === 'out') {
      const outT = r.batter && isAirOut ? hangT : outAtBase.get(r.to) ?? ballDone;
      if (r.batter && (isAirOut || code === 'K')) {
        // 잡히면 멈춤 — 1루 쪽으로 가다 사라짐
        const stop = along(pts, Math.min(0.75, ((outT - t0) * v) / len));
        runners.push({ id: r.id, start, tracks: [{ t0, t1: Math.max(t0 + 0.2, outT), pts: [start, stop], ease: 'run' }], fate: 'out', outT, batter: true });
        continue;
      }
      // 송구보다 조금 늦게 도착 (아웃)
      t1 = Math.max(t1, outT + 0.14);
      const tracks: Track[] = [{ t0, t1, pts, ease: 'run' }];
      runners.push({ id: r.id, start, tracks, fate: 'out', outT, batter: r.batter });
      continue;
    }
    // 세이프·득점 — 대본이 너무 길지 않게 (공 정리 + 2.4초 안에)
    const cap = Math.max(ballDone + 2.4, t0 + 1.4);
    if (t1 > cap && code !== 'HR') t1 = cap;
    // 송구가 향하는 베이스면 송구보다 먼저
    const thr = outAtBase.get(r.to);
    if (thr != null && t1 > thr - 0.1) t1 = Math.max(t0 + 0.6, thr - 0.15);
    len = 0;
    const scoreAt = r.fate === 'score' ? t1 : undefined;
    if (scoreAt != null) {
      marks.push({ t: scoreAt, until: scoreAt + 1.4, at: { x: PLATE.x + 0.03, y: PLATE.y - 0.02 }, text: '+1', tone: 'run', dy: -10 - scoreT.length * 11 });
      scoreT.push(scoreAt);
    }
    runners.push({ id: r.id, start, tracks: [{ t0, t1, pts, ease: 'run' }], fate: r.fate, scoreT: scoreAt, batter: r.batter });
  }

  // 원인 표시 — 낙구 지점 옆 잠깐
  const cause = p.causes?.[0] ? { at: landing?.at ?? L, t: (landing?.t ?? 0.8) + 0.2, text: p.causes[0].text } : undefined;

  const endT = Math.max(
    ballDone,
    ...legs.map((l) => l.t1),
    ...runners.flatMap((r) => r.tracks.map((t) => t.t1)),
    ...[...fielders.values()].flatMap((f) => f.tracks.map((t) => t.t1)),
  );
  // 잡힌 공은 글러브 속으로 (희생플라이는 홈 송구 뒤)
  if (ballGone == null) ballGone = (legs[legs.length - 1]?.t1 ?? ballDone) + 0.3;
  return {
    dur: endT + 0.9,
    legs,
    ballGone,
    runners,
    fielders: [...fielders.values()],
    marks,
    circles,
    landing,
    cause,
    readout: { ev: h.kmh, la, dist: Math.round(h.distM), catchProb: p.defense && p.defense.catchProb < 0.5 && isAirOut ? p.defense.catchProb : undefined, t: readoutT },
    trace: true,
  };
}

/* ───────── 볼넷·몸에 맞는 공·도루 — 걸어 나가기 ───────── */
export function buildWalk(p: FullPlay, prevScore: [number, number]): PlayScript {
  const plans = planRunners(p, prevScore, []);
  const runners: RunnerScript[] = plans.map((r) => {
    const start = BASE[r.from];
    if (r.fate === 'hold' || r.to === r.from) return { id: r.id, start, tracks: [], fate: 'hold', batter: r.batter };
    const pts = basePath(r.from, Math.min(4, r.to));
    const t0 = r.batter ? 0.4 : 0.25;
    return { id: r.id, start, tracks: [{ t0, t1: t0 + 1.7, pts, ease: 'inout' }], fate: r.fate === 'score' ? 'score' : 'safe', scoreT: r.fate === 'score' ? t0 + 1.7 : undefined, batter: r.batter };
  });
  const marks: Mark[] = [{ t: 0, until: 99, at: { x: PLATE.x, y: PLATE.y - 0.03 }, text: p.code === 'HBP' ? '몸에 맞는 공' : '볼넷', tone: 'info', dy: -10 }];
  runners.filter((r) => r.scoreT != null).forEach((r) => marks.push({ t: r.scoreT!, until: r.scoreT! + 1.4, at: { x: PLATE.x + 0.025, y: PLATE.y - 0.02 }, text: '+1', tone: 'run' }));
  return { dur: 2.6, legs: [], runners, fielders: [], marks };
}

export function buildK(p: FullPlay): PlayScript {
  const last = p.seq[p.seq.length - 1];
  const looking = last?.res === 'called';
  return {
    dur: 1.6, legs: [], fielders: [],
    runners: [{ id: p.batterId, start: PLATE, tracks: [], fate: 'out', outT: 0.5, batter: true }],
    marks: [{ t: 0, until: 99, at: { x: PLATE.x, y: PLATE.y - 0.035 }, text: looking ? '루킹 삼진' : '헛스윙 삼진', tone: 'out', kLook: looking }],
  };
}

/** 도루 — 투구와 함께 뛰고, 포수 송구보다 먼저 */
export function buildSteal(p: FullPlay, pitch: PitchEv): PlayScript {
  const st = pitch.steal!;
  const from = BASE[st.from];
  const to = BASE[st.to];
  const tArrive = 0.62 + 0.42;
  const throwDur = distM(CATCHER, to) / 34 + 0.05;
  const tThrow = tArrive + 0.55;
  const runT1 = tThrow + throwDur - 0.12;
  return {
    dur: tThrow + throwDur + 1.0,
    legs: [{ t0: tThrow, t1: tThrow + throwDur, a: CATCHER, b: to, apex: 1.2, kind: 'throw' }],
    runners: [{ id: st.runner, start: from, tracks: [{ t0: 0.05, t1: runT1, pts: [from, to], ease: 'run' }], fate: st.ok ? 'safe' : 'out', batter: false }],
    fielders: [{ pos: st.to === 2 ? 'SS' : '3B', id: '', start: spotOf(st.to === 2 ? 'SS' : '3B'), tracks: [{ t0: 0.6, t1: tThrow + throwDur - 0.2, pts: [spotOf(st.to === 2 ? 'SS' : '3B'), to], ease: 'inout' }] }],
    marks: [{ t: runT1, until: 99, at: to, text: st.ok ? '도루 성공' : '도루 실패', tone: st.ok ? 'hit' : 'out', dy: -10 }],
  };
}

/* ───────── 투구 (마운드 → 홈) ───────── */
/** 구종별 휨 (존 좌표, 우투 기준: +x = 1루 쪽) — 꼬리 그림·2D 궤적에 */
export const BREAK: Record<string, [number, number]> = {
  FF: [-0.03, -0.05], SI: [-0.1, 0.05], FC: [0.06, 0.03], SL: [0.13, 0.07], SW: [0.22, 0.03],
  CU: [0.07, 0.24], CH: [-0.09, 0.12], FS: [-0.02, 0.19], KN: [0.05, 0.1],
};
export function breakOf(type: string, throws: 'R' | 'L'): [number, number] {
  const b = BREAK[type] ?? [0, 0];
  return [throws === 'L' ? -b[0] : b[0], b[1]];
}

/** 투구 대본 — 와인드업 W 초 뒤 F 초 동안 날아감 (실제 시간 ms 로 쓰는 곳은 timeline) */
export function pitchPath(pitch: PitchEv, throws: 'R' | 'L') {
  const side = throws === 'R' ? -1 : 1; // 우투는 화면 왼쪽(투수의 오른손)에서 놓음
  const rel: Pt = { x: MOUND.x + side * 0.0085, y: MOUND.y + 0.006 };
  const end: Pt = { x: PLATE.x + (pitch.zone[0] - 0.5) * 0.014, y: PLATE.y - 0.002 };
  const [bx] = breakOf(pitch.type, throws);
  const ctrl: Pt = { x: (rel.x + end.x) / 2 - bx * 0.11, y: (rel.y + end.y) / 2 };
  return { rel, end, ctrl };
}

/* ───────── 표본 (한 순간의 모습) ───────── */
export interface FrameActor { id: string; p: Pt; alpha: number; dive?: number; out?: boolean }
export interface FrameFielder extends FrameActor { pos: FPos; hot: boolean }
export interface Frame {
  ball?: { p: Pt; h: number };
  /** 땅 위 자취 */
  trace?: Pt[];
  /** 공 바로 뒤 꼬리 (투구·송구) */
  tail?: Pt[];
  tailColor?: string;
  fielders: FrameFielder[];
  runners: FrameActor[];
  circles?: { c: Pt; r: number; strong: boolean; alpha: number }[];
  marks: { at: Pt; text: string; tone: Mark['tone']; alpha: number; dy: number; kLook?: boolean }[];
  landing?: { at: Pt; kind: 'hit' | 'out' | 'hr' | 'wall'; alpha: number };
  cause?: { at: Pt; text: string; alpha: number };
  readout?: PlayScript['readout'];
}

function sampleTrack(start: Pt, tracks: Track[], t: number): Pt {
  let p = start;
  for (const tr of tracks) {
    if (t <= tr.t0) return p;
    if (t >= tr.t1) { p = tr.pts[tr.pts.length - 1]; continue; }
    const u = (EASE[tr.ease ?? 'lin'])((t - tr.t0) / (tr.t1 - tr.t0));
    return along(tr.pts, u);
  }
  return p;
}

function legAt(l: BallLeg, t: number): { p: Pt; h: number } {
  const raw = clamp01((t - l.t0) / Math.max(0.001, l.t1 - l.t0));
  const u = (EASE[l.ease ?? 'lin'])(raw);
  const p = l.ctrl ? bez(l.a, l.ctrl, l.b, u) : lerpPt(l.a, l.b, u);
  const h = 4 * l.apex * raw * (1 - raw);
  return { p, h };
}

export function sampleBall(s: PlayScript, t: number): { p: Pt; h: number } | undefined {
  if (!s.legs.length) return undefined;
  if (s.ballGone != null && t > s.ballGone) return undefined;
  let cur: BallLeg | undefined;
  for (const l of s.legs) {
    if (t >= l.t0) cur = l;
  }
  if (!cur) return t < s.legs[0].t0 ? undefined : undefined;
  if (t > cur.t1) return { p: cur.b, h: 0 };
  return legAt(cur, t);
}

/** 땅 위 자취 — 첫 다리(날아가는 공)의 지나온 길 */
function traceOf(s: PlayScript, t: number): Pt[] | undefined {
  if (!s.trace || !s.legs.length) return undefined;
  const pts: Pt[] = [];
  for (const l of s.legs) {
    if (l.kind === 'throw') break;
    if (t < l.t0) break;
    const end = Math.min(t, l.t1);
    const n = 10;
    for (let i = 0; i <= n; i++) {
      const tt = l.t0 + ((end - l.t0) * i) / n;
      pts.push(legAt(l, tt).p);
    }
    if (t < l.t1) break;
  }
  return pts.length > 1 ? pts : undefined;
}

export interface BaseScene {
  /** 수비 팀 위치 → 선수 */
  align: Alignment;
  /** 플레이 전 주자 [1루,2루,3루] */
  bases: (string | null)[];
  batterId?: string;
  bats?: 'R' | 'L';
}

/** 가만히 있는 장면 (투구 사이 · 이닝 사이) */
export function idleFrame(sc: BaseScene): Frame {
  const fielders = (Object.keys(sc.align) as FPos[]).map((pos) => ({ pos, id: sc.align[pos], p: spotOf(pos), alpha: 1, hot: false }));
  const runners: FrameActor[] = [];
  sc.bases.forEach((id, i) => { if (id) runners.push({ id, p: BASE[i + 1], alpha: 1 }); });
  if (sc.batterId) runners.push({ id: sc.batterId, p: batterSpot(sc.bats ?? 'R'), alpha: 1 });
  return { fielders, runners, marks: [] };
}

export const batterSpot = (bats: 'R' | 'L'): Pt => ({ x: PLATE.x + (bats === 'R' ? -0.0165 : 0.0165), y: PLATE.y - 0.004 });

/** 대본의 한 순간 */
export function sampleScript(s: PlayScript, t: number, sc: BaseScene, opts: { circles?: boolean; marks?: boolean } = {}): Frame {
  const moved = new Map(s.fielders.map((f) => [f.pos, f]));
  const fielders: FrameFielder[] = (Object.keys(sc.align) as FPos[]).map((pos) => {
    const f = moved.get(pos);
    if (!f) return { pos, id: sc.align[pos], p: spotOf(pos), alpha: 1, hot: false };
    const p = sampleTrack(f.start, f.tracks, t);
    const dive = f.dive && t >= f.dive[0] && t <= f.dive[1] ? clamp01((t - f.dive[0]) / 0.22) * (1 - clamp01((t - f.dive[1] + 0.25) / 0.25)) : 0;
    return { pos, id: sc.align[pos], p, alpha: 1, hot: f.tracks.length > 0, dive };
  });

  const scripted = new Set(s.runners.map((r) => r.id));
  const runners: FrameActor[] = [];
  sc.bases.forEach((id, i) => { if (id && !scripted.has(id)) runners.push({ id, p: BASE[i + 1], alpha: 1 }); });
  if (sc.batterId && !scripted.has(sc.batterId)) runners.push({ id: sc.batterId, p: batterSpot(sc.bats ?? 'R'), alpha: 1 });
  for (const r of s.runners) {
    const p = r.tracks.length ? sampleTrack(r.start, r.tracks, t) : r.batter && r.start === PLATE ? batterSpot(sc.bats ?? 'R') : r.start;
    let alpha = 1;
    let out = false;
    if (r.fate === 'out' && r.outT != null && t >= r.outT) { out = true; alpha = 1 - clamp01((t - r.outT - 0.35) / 0.5); }
    if (r.fate === 'score' && r.scoreT != null && t >= r.scoreT) alpha = 1 - clamp01((t - r.scoreT) / 0.35);
    if (alpha > 0.01) runners.push({ id: r.id, p, alpha, out });
  }

  const ball = sampleBall(s, t);
  const trace = traceOf(s, t);
  let tail: Pt[] | undefined;
  const cur = [...s.legs].reverse().find((l) => t >= l.t0 && t <= l.t1);
  if (cur && cur.kind === 'throw') {
    tail = [0.12, 0.08, 0.04, 0].map((k) => legAt(cur, Math.max(cur.t0, t - k)).p);
  }

  let circles: Frame['circles'];
  if (opts.circles !== false && s.circles) {
    const { hang, list } = s.circles;
    const tc = Math.min(t, hang);
    const fade = t <= hang ? 1 : 1 - clamp01((t - hang) / 0.9);
    if (fade > 0.01) {
      circles = list.map((c) => ({ c: c.c, r: M(Math.max(0, c.mps * (tc - c.react))), strong: c.strong, alpha: fade }));
    }
  }

  const marks = opts.marks === false ? [] : s.marks
    .filter((m) => t >= m.t && t <= m.until)
    .map((m) => ({ at: m.at, text: m.text, tone: m.tone, dy: m.dy ?? -10, kLook: m.kLook, alpha: clamp01((t - m.t) / 0.18) * (m.until < 90 ? 1 - clamp01((t - m.until + 0.3) / 0.3) : 1) }));

  const landing = s.landing && t >= s.landing.t ? { at: s.landing.at, kind: s.landing.kind, alpha: clamp01((t - s.landing.t) / 0.2) } : undefined;
  const cause = s.cause && t >= s.cause.t ? { at: s.cause.at, text: s.cause.text, alpha: clamp01((t - s.cause.t) / 0.3) } : undefined;
  const readout = s.readout && t >= s.readout.t ? s.readout : undefined;
  return { ball, trace, tail, fielders, runners, circles, marks, landing, cause, readout };
}

/** 투구 한 공의 모습 — u: 0(손에서 놓음) ~ 1(포수 미트) */
export function pitchFrame(pitch: PitchEv, throws: 'R' | 'L', u: number, sc: BaseScene, color?: string): Frame {
  const base = idleFrame(sc);
  if (u < 0) return base;
  const { rel, end, ctrl } = pitchPath(pitch, throws);
  const k = clamp01(u);
  const p = bez(rel, ctrl, end, k);
  const tail = [0.28, 0.2, 0.12, 0.05, 0].map((d) => bez(rel, ctrl, end, Math.max(0, k - d)));
  if (u > 1.25) return base;
  return { ...base, ball: { p, h: 1.6 * (1 - k) + 0.6 }, tail, tailColor: color };
}

/** 대본이 끝난 뒤 남길 표시 (자취·낙구) — 기록지처럼 */
export function residue(s: PlayScript): { trace?: Pt[]; landing?: PlayScript['landing']; label?: string } {
  return { trace: traceOf(s, s.dur), landing: s.landing, label: s.marks.find((m) => m.tone !== 'run')?.text };
}

export const _test = { planRunners, CATCHER, MOUND, dist, distM };
