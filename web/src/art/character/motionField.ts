// 수비·주루 동작 — 포수(앉은 자세 → 받기 → 2루 송구), 내야(준비 → 크리프 → 스플릿 스텝 → 땅볼 → 송구),
// 외야(뜬공 아래로 → 머리 위 캐치 → 크로우 홉 송구), 달리기(체격·스피드로 보폭·발 구름 빈도).
// 기준 시점: 3루 쪽 옆모습, 선수는 화면 오른쪽(+x)을 본다. 왼손잡이는 거울 쌍둥이.

import type { Appearance, Side } from './types';
import type { V3 } from './geom';
import { clamp, lerp, vadd, vmul, D2R, crSample } from './geom';
import type { Pose3 } from './rig3';
import { solve3, toLocal } from './rig3';
import { torsoModel } from './torso';
import type { Motion } from './motion';
import { basePose, foot, rot, kneePole, fitRoot, KeyList, looped, hipWorld } from './motion';
import { ballFromAnkle } from './rig3';
import { Rng } from './rng';

const throwerReady = (p: Pose3) => { p.glove = 'L'; p.ballHand = null; };

/** 공을 던진 뒤 날아가는 공 (월드) */
function flight(from: V3, v: V3, dt: number): V3 { return vadd(from, vmul(v, dt)); }

// ───────────────────────── 포수 ─────────────────────────
export function catcherMotion(ap: Appearance): Motion {
  const b = ap.build, tm = torsoModel(b);
  const hipY = b.hipY;
  const r = new Rng(ap.id).fork('catcher');
  const p0 = basePose(b);
  throwerReady(p0);
  p0.mask = true;
  p0.foot.R = foot(2, 26, 58, 12, 0, 1);
  p0.foot.L = foot(4, -26, 122, 12, 0, 1);
  p0.knee.R = [0.55, -0.45, 0.7];
  p0.knee.L = [0.55, -0.45, -0.7];
  p0.pelvis = rot(90, 34, 0);
  p0.chest = rot(90, 12 + r.range(-3, 3), 0);
  p0.root = fitRoot(b, tm, p0.pelvis, { R: { f: p0.foot.R, max: 0.62 }, L: { f: p0.foot.L, max: 0.62 } }, -10, -(hipY * 0.36), 0);
  p0.neck = -8;
  p0.head = -2;
  p0.hand.L = { p: [7, 24, 38], pole: [0.7, 0.5, -0.3], shape: 'glove', rot: 18 };
  p0.hand.R = { p: [-13, 46, -12], pole: [-0.6, 0.2, -0.7], shape: 'fist', rot: 0 };
  const kl = new KeyList(p0, 0);
  kl.add(0.35, (p) => { p.hand.L.p = [7, 22, 37]; p.root[1] += 0.6; });
  const tCatch = 0.72;
  kl.add(tCatch - 0.08, (p) => { p.hand.L.p = [7, 21, 39]; });
  kl.add(tCatch, (p) => { p.hand.L.p = [6, 25, 33]; p.hand.L.rot = 10; });
  // 받자마자 일어서며 오른쪽 귀 옆에서 공을 옮겨 쥠 + 오른발 잽 스텝
  const tUp = tCatch + 0.13;
  kl.add(tUp, (p) => {
    p.mask = true;
    p.pelvis = rot(70, 18, 0);
    p.chest = rot(58, 8, -4);
    p.foot.R = foot(12, 12, 20, 10, -6, 0);
    p.knee.R = [0.4, -0.3, 0.8];
    p.root = fitRoot(b, tm, p.pelvis, { L: { f: p.foot.L, max: 0.86 } }, 4, -(hipY - 26), 2);
    p.hand.L = { p: [-6, 2, 14], pole: [0.6, 0.8, -0.2], shape: 'glove', rot: -10 };
    p.hand.R = { p: [-12, -3, 8], pole: [-0.6, 0.8, -0.3], shape: 'fist', rot: 0 };
    p.neck = -2;
  });
  const tStep = tUp + 0.1;
  kl.add(tStep, (p) => {
    p.foot.R = foot(16, 8, 4, 0);
    p.knee.R = kneePole(30);
    p.pelvis = rot(40, 10, -4);
    p.chest = rot(22, 6, -8);
    p.foot.L = foot(26, -12, 80, 0, -10, 0);
    p.knee.L = [1, -0.4, 0];
    p.root = fitRoot(b, tm, p.pelvis, { R: { f: p.foot.R, max: 0.95 } }, 20, -(hipY - 12), 0);
    p.hand.R = { p: [-30, -12, -12], pole: [-0.4, 0.6, -0.7], shape: 'fist', rot: 0 };
    p.hand.L = { p: [36, 8, 16], pole: [0.2, 1, -0.4], shape: 'glove', rot: 20 };
  });
  const tFS = tStep + 0.09;
  kl.add(tFS, (p) => {
    p.foot.L = foot(66, -8, 78, 0);
    p.knee.L = kneePole(80, 0.1);
    p.foot.R = foot(17, 8, 30, 28, 0, 1);
    p.pelvis = rot(56, 10, -4);
    p.chest = rot(30, 10, -6);
    p.root = fitRoot(b, tm, p.pelvis, { R: { f: p.foot.R, max: 0.99 }, L: { f: p.foot.L, max: 0.95 } }, 40, -(hipY - 14), 0);
    p.hand.R = { p: [-38, -16, -18], pole: [-0.3, 0.5, -0.8], shape: 'fist', rot: 0 };
  });
  const tREL = tFS + 0.08;
  kl.add(tREL, (p) => {
    p.pelvis = rot(94, 16, -2);
    p.chest = rot(98, 28, 24);
    p.foot.R = foot(22, 6, 72, 50, 0, 1);
    p.root = fitRoot(b, tm, p.pelvis, { R: { f: p.foot.R, max: 0.995 }, L: { f: p.foot.L, max: 0.96 } }, 52, -(hipY - 12), 0);
    p.hand.R = { p: [-36, -36, 26], pole: [-0.4, 0.8, -0.4], shape: 'open', rot: 0 };
    p.hand.L = { p: [12, 22, 14], pole: [0.8, 0.5, -0.3], shape: 'glove', rot: 0 };
  });
  kl.add(tREL + 0.22, (p) => {
    p.pelvis = rot(104, 24, 0);
    p.chest = rot(112, 46, 6);
    p.foot.R = foot(56, 4, 88, 40, -14, 0);
    p.knee.R = [1, -0.4, 0];
    p.root = fitRoot(b, tm, p.pelvis, { L: { f: p.foot.L, max: 0.94 } }, 60, -(hipY - 16), 0);
    p.hand.R = { p: [8, 16, 46], pole: [-0.8, -0.3, -0.4], shape: 'relax', rot: 0 };
    p.hand.L = { p: [14, 24, 6], pole: [0.6, 0.8, -0.2], shape: 'glove', rot: 0 };
  });
  kl.add(tREL + 0.5, (p) => {
    p.foot.R = foot(84, 14, 96, 0);
    p.knee.R = kneePole(96);
    p.pelvis = rot(92, 10, 0);
    p.chest = rot(94, 12, 0);
    p.root = fitRoot(b, tm, p.pelvis, { R: { f: p.foot.R, max: 0.96 }, L: { f: p.foot.L, max: 0.96 } }, 74, -(hipY - 9), 0);
    p.hand.R = { p: [-6, 32, 18], pole: [-0.8, 0.5, -0.3], shape: 'relax', rot: 0 };
    p.hand.L = { p: [10, 28, 16], pole: [0.8, 0.5, -0.3], shape: 'glove', rot: 0 };
  });
  const track = kl.track();
  const dur = tREL + 0.95, loop = dur + 0.35;
  let relPt: V3 | null = null;
  const extra = (tt: number, p: Pose3) => {
    p.mask = true;
    if (tt < tCatch) {
      const dt = tt - tCatch;
      if (dt > -0.12) { const c = solve3(b, track.at(tCatch), tm); p.ball = flight(vadd(c.palm.L, [6, -2, 2]), [-3600, 30, 0], dt); }
      return;
    }
    if (tt < tREL) { p.ballHand = tt > tUp - 0.03 ? 'R' : null; p.ball = null; return; }
    if (!relPt) { const pr = track.at(tREL); relPt = solve3(b, pr, tm).palm.R; }
    const dt = tt - tREL;
    p.ball = dt < 0.1 ? flight(relPt, [3300, -260, -60], dt) : null;
  };
  return {
    kind: 'catcher', dur, loop,
    phases: [{ t: 0, label: '앉은 자세' }, { t: tCatch, label: '포구' }, { t: tUp, label: '일어서며 옮겨 쥐기' }, { t: tFS, label: '2루 송구' }, { t: tREL + 0.2, label: '팔로스루' }],
    events: { catch: tCatch, release: tREL },
    headYaw: 86, gear: 'none', mask: true, catcherGear: true,
    smear: (tt) => (tt > tREL - 0.03 && tt < tREL + 0.08 ? 1 : 0),
    sample: looped(track, dur, loop, 0.12, 0.2, extra),
    keyTime: 0.3,
  };
}

// ───────────────────────── 내야 ─────────────────────────
export function infieldMotion(ap: Appearance): Motion {
  const b = ap.build, tm = torsoModel(b);
  const hipY = b.hipY;
  const p0 = basePose(b);
  throwerReady(p0);
  // 내야 준비: 발은 어깨보다 넓게·왼발 반 걸음 앞, 엉덩이를 뒤로 빼고 등은 평평하게, 두 손은 무릎 앞 낮게
  p0.foot.R = foot(-14, 32, 76, 10, 0, 1);
  p0.foot.L = foot(16, -30, 102, 10, 0, 1);
  p0.knee.R = [0.8, -0.3, 0.6];
  p0.knee.L = [0.8, -0.3, -0.6];
  p0.pelvis = rot(90, 36, 0);
  p0.chest = rot(90, 38, 0);
  p0.root = fitRoot(b, tm, p0.pelvis, { R: { f: p0.foot.R, max: 0.8 }, L: { f: p0.foot.L, max: 0.8 } }, -12, -(hipY - 26), 0);
  p0.neck = -22;
  p0.head = -4;
  p0.hand.L = { p: [10, 40, 40], pole: [0.8, 0.4, -0.4], shape: 'glove', rot: 34 };
  p0.hand.R = { p: [-8, 40, 36], pole: [-0.8, 0.4, -0.4], shape: 'open', rot: 0 };
  const kl = new KeyList(p0, 0);
  // 크리프 스텝 두 번
  const step = (t: number, s: Side, dx: number) => {
    kl.add(t - 0.12, (p) => { const f = p.foot[s]; p.foot[s] = { ...f, p: [f.p[0] + dx * 0.5, -5, f.p[2]], lift: 0 }; p.root[0] += dx * 0.25; });
    kl.add(t, (p) => { const f = p.foot[s]; p.foot[s] = { ...f, p: [f.p[0] + dx * 0.5, 0, f.p[2]], lift: 8 }; p.root[0] += dx * 0.25; });
  };
  step(0.5, 'L', 18);
  step(0.78, 'R', 18);
  // 스플릿 스텝: 살짝 떴다가 넓게 착지
  kl.add(0.92, (p) => { p.root[1] -= 7; p.foot.R = { ...p.foot.R, p: [p.foot.R.p[0], -4, p.foot.R.p[2]] }; p.foot.L = { ...p.foot.L, p: [p.foot.L.p[0], -4, p.foot.L.p[2]] }; });
  kl.add(1.04, (p) => {
    p.foot.R = foot(p.foot.R.p[0] - 2, 34, 78, 6, 0, 1);
    p.foot.L = foot(p.foot.L.p[0] + 2, -32, 102, 6, 0, 1);
    p.root = fitRoot(b, tm, p.pelvis, { R: { f: p.foot.R, max: 0.84 }, L: { f: p.foot.L, max: 0.84 } }, p.root[0], -(hipY - 22), 0);
  });
  // 앞으로 두 걸음 → 공 앞에서 글러브를 바닥에
  const run = (t: number, s: Side, x: number, z: number) => kl.add(t, (p) => {
    p.foot[s] = foot(x, z, 90, 0);
    p.knee[s] = kneePole(90, 0.2);
    p.root = [x - 22, -(hipY - 14), 0];
  });
  const x0 = kl.last.root[0];
  kl.add(1.16, (p) => { p.foot.L = foot(x0 + 30, -14, 90, 10, -10, 0); p.root[0] += 10; p.root[1] -= 4; p.pelvis.pitch = 20; p.chest.pitch = 24; });
  run(1.26, 'L', x0 + 52, -12);
  kl.add(1.36, (p) => { p.foot.R = foot(x0 + 70, 14, 90, 10, -10, 0); p.root[0] += 16; });
  const tField = 1.62;
  kl.add(1.46, (p) => {
    p.foot.R = foot(x0 + 86, 18, 80, 6, 0, 1);
    p.knee.R = kneePole(70, 0.2);
    p.foot.L = foot(x0 + 118, -18, 100, 0, 0, 1);
    p.knee.L = kneePole(110, 0.2);
    p.pelvis = rot(90, 34, 0);
    p.chest = rot(90, 50, 0);
    p.root = fitRoot(b, tm, p.pelvis, { R: { f: p.foot.R, max: 0.8 }, L: { f: p.foot.L, max: 0.8 } }, x0 + 92, -(hipY - 30), 0);
    p.hand.L = { p: [10, 56, 34], pole: [0.7, 0.4, -0.5], shape: 'glove', rot: 40 };
    p.hand.R = { p: [-6, 54, 30], pole: [-0.7, 0.4, -0.5], shape: 'open', rot: 0 };
  });
  kl.add(tField, (p) => {
    p.chest = rot(90, 62, 0);
    p.pelvis = rot(90, 42, 0);
    p.root = fitRoot(b, tm, p.pelvis, { R: { f: p.foot.R, max: 0.76 }, L: { f: p.foot.L, max: 0.76 } }, x0 + 94, -(hipY - 34), 0);
    p.hand.L = { p: [10, 62, 36], pole: [0.7, 0.4, -0.5], shape: 'glove', rot: 50 };
    p.hand.R = { p: [-2, 58, 38], pole: [-0.7, 0.4, -0.5], shape: 'open', rot: 0 };
  });
  // 배꼽 앞으로 모아 일어서며 송구 준비
  kl.add(tField + 0.14, (p) => {
    p.chest = rot(70, 24, -4);
    p.pelvis = rot(76, 18, 0);
    p.root = fitRoot(b, tm, p.pelvis, { R: { f: p.foot.R, max: 0.9 }, L: { f: p.foot.L, max: 0.9 } }, x0 + 96, -(hipY - 18), 0);
    p.hand.L = { p: [0, 24, 22], pole: [0.8, 0.6, -0.2], shape: 'glove', rot: 0 };
    p.hand.R = { p: [-4, 24, 20], pole: [-0.8, 0.6, -0.2], shape: 'fist', rot: 0 };
    p.neck = -4;
  });
  const tHop = tField + 0.26;
  kl.add(tHop, (p) => {
    p.foot.R = foot(x0 + 112, 6, 10, 0);
    p.knee.R = kneePole(30);
    p.foot.L = foot(x0 + 128, -10, 80, 0, -12, 0);
    p.pelvis = rot(40, 10, -4);
    p.chest = rot(24, 8, -8);
    p.root = fitRoot(b, tm, p.pelvis, { R: { f: p.foot.R, max: 0.96 } }, x0 + 112, -(hipY - 10), 0);
    p.hand.R = { p: [-34, -10, -16], pole: [-0.4, 0.6, -0.7], shape: 'fist', rot: 0 };
    p.hand.L = { p: [40, 6, 16], pole: [0.2, 1, -0.4], shape: 'glove', rot: 20 };
  });
  const tFS = tHop + 0.1;
  kl.add(tFS, (p) => {
    p.foot.L = foot(x0 + 168, -8, 78, 0);
    p.knee.L = kneePole(80, 0.1);
    p.foot.R = foot(x0 + 113, 6, 30, 26, 0, 1);
    p.pelvis = rot(58, 10, -4);
    p.chest = rot(34, 10, -6);
    p.root = fitRoot(b, tm, p.pelvis, { R: { f: p.foot.R, max: 0.99 }, L: { f: p.foot.L, max: 0.95 } }, x0 + 142, -(hipY - 13), 0);
    p.hand.R = { p: [-40, -14, -20], pole: [-0.3, 0.5, -0.8], shape: 'fist', rot: 0 };
  });
  const tREL = tFS + 0.08;
  kl.add(tREL, (p) => {
    p.pelvis = rot(96, 16, -2);
    p.chest = rot(98, 30, 18);
    p.foot.R = foot(x0 + 118, 6, 74, 52, 0, 1);
    p.root = fitRoot(b, tm, p.pelvis, { R: { f: p.foot.R, max: 0.995 }, L: { f: p.foot.L, max: 0.96 } }, x0 + 154, -(hipY - 12), 0);
    p.hand.R = { p: [-44, -30, 24], pole: [-0.4, 0.8, -0.4], shape: 'open', rot: 0 };
    p.hand.L = { p: [12, 22, 14], pole: [0.8, 0.5, -0.3], shape: 'glove', rot: 0 };
  });
  kl.add(tREL + 0.24, (p) => {
    p.pelvis = rot(106, 24, 0);
    p.chest = rot(114, 44, 6);
    p.foot.R = foot(x0 + 152, 4, 88, 40, -16, 0);
    p.knee.R = [1, -0.4, 0];
    p.root = fitRoot(b, tm, p.pelvis, { L: { f: p.foot.L, max: 0.94 } }, x0 + 160, -(hipY - 16), 0);
    p.hand.R = { p: [8, 16, 46], pole: [-0.8, -0.3, -0.4], shape: 'relax', rot: 0 };
    p.hand.L = { p: [14, 24, 6], pole: [0.6, 0.8, -0.2], shape: 'glove', rot: 0 };
  });
  kl.add(tREL + 0.5, (p) => {
    p.foot.R = foot(x0 + 186, 14, 96, 0);
    p.knee.R = kneePole(96);
    p.pelvis = rot(92, 10, 0);
    p.chest = rot(94, 12, 0);
    p.root = fitRoot(b, tm, p.pelvis, { R: { f: p.foot.R, max: 0.96 }, L: { f: p.foot.L, max: 0.96 } }, x0 + 176, -(hipY - 9), 0);
    p.hand.R = { p: [-6, 32, 18], pole: [-0.8, 0.5, -0.3], shape: 'relax', rot: 0 };
    p.hand.L = { p: [10, 28, 16], pole: [0.8, 0.5, -0.3], shape: 'glove', rot: 0 };
    p.neck = 0;
  });
  const track = kl.track();
  const dur = tREL + 0.9, loop = dur + 0.35;
  let relPt: V3 | null = null, gPt: V3 | null = null;
  const extra = (tt: number, p: Pose3) => {
    if (tt < tField) {
      // 땅볼: 오른쪽에서 튀며 굴러옴
      const dt = tt - tField;
      if (dt > -0.5) {
        if (!gPt) gPt = solve3(b, track.at(tField), tm).palm.L;
        const x = gPt[0] - dt * 520;
        const bounce = Math.abs(Math.sin(dt * 14)) * 22 * Math.exp(dt * 3);
        p.ball = [x, -3.7 - bounce, gPt[2]];
      }
      return;
    }
    if (tt < tREL) { p.ballHand = tt > tField + 0.1 ? 'R' : null; if (tt <= tField + 0.1) { const J = solve3(b, p, tm); p.ball = vadd(J.palm.L, [2, -2, 3]); } else p.ball = null; return; }
    if (!relPt) { const pr = track.at(tREL); relPt = solve3(b, pr, tm).palm.R; }
    const dt = tt - tREL;
    p.ball = dt < 0.1 ? flight(relPt, [3200, -200, -40], dt) : null;
  };
  void run;
  return {
    kind: 'infield', dur, loop,
    phases: [{ t: 0, label: '준비 자세' }, { t: 0.36, label: '크리프 스텝' }, { t: 0.88, label: '스플릿 스텝' }, { t: 1.1, label: '대시' }, { t: 1.5, label: '포구' }, { t: tHop, label: '송구' }],
    events: { field: tField, release: tREL },
    headYaw: 86, gear: 'cap',
    smear: (tt) => (tt > tREL - 0.03 && tt < tREL + 0.08 ? 1 : 0),
    sample: looped(track, dur, loop, 0.12, 0.2, extra),
    keyTime: 0.2,
  };
}

// ───────────────────────── 외야 ─────────────────────────
export function outfieldMotion(ap: Appearance): Motion {
  const b = ap.build, tm = torsoModel(b);
  const hipY = b.hipY;
  const p0 = basePose(b);
  throwerReady(p0);
  p0.foot.R = foot(-4, 20, 86, 4, 0, 1);
  p0.foot.L = foot(10, -18, 96, 4, 0, 1);
  p0.pelvis = rot(90, 16, 0);
  p0.chest = rot(90, 18, 0);
  p0.root = fitRoot(b, tm, p0.pelvis, { R: { f: p0.foot.R, max: 0.93 }, L: { f: p0.foot.L, max: 0.93 } }, 0, -(hipY - 9), 0);
  p0.hand.L = { p: [10, 40, 22], pole: [0.8, 0.4, -0.4], shape: 'glove', rot: 20 };
  p0.hand.R = { p: [-10, 40, 18], pole: [-0.8, 0.4, -0.4], shape: 'relax', rot: 0 };
  p0.neck = -18;
  p0.head = -6;
  const kl = new KeyList(p0, 0);
  // 공을 올려다보며 뒤로 두 걸음 (드롭 스텝)
  kl.add(0.35, (p) => { p.neck = -30; p.head = -14; p.chest.pitch = 6; p.pelvis.pitch = 8; p.root[1] -= 3; });
  kl.add(0.55, (p) => { p.foot.R = foot(-34, 16, 70, 10, -9, 0); p.root[0] -= 12; p.chest.yaw = 82; });
  kl.add(0.72, (p) => { p.foot.R = foot(-46, 14, 80, 0); p.root[0] -= 10; });
  kl.add(0.9, (p) => { p.foot.L = foot(-30, -16, 96, 10, -10, 0); p.root[0] -= 8; });
  kl.add(1.06, (p) => {
    p.foot.L = foot(-14, -16, 98, 0);
    p.pelvis = rot(90, 6, 0);
    p.chest = rot(90, -6, 0);
    p.root = fitRoot(b, tm, p.pelvis, { R: { f: p.foot.R, max: 0.97 }, L: { f: p.foot.L, max: 0.97 } }, -28, -(hipY - 3), 0);
    p.hand.L = { p: [4, -34, 22], pole: [0.8, 0.6, -0.3], shape: 'glove', rot: 12 };
    p.hand.R = { p: [-6, -30, 20], pole: [-0.8, 0.6, -0.3], shape: 'open', rot: 0 };
    p.neck = -34;
    p.head = -14;
  });
  const tCatch = 1.24;
  kl.add(tCatch, (p) => { p.hand.L.p = [6, -30, 24]; p.hand.R.p = [-4, -27, 22]; });
  kl.add(tCatch + 0.08, (p) => { p.hand.L.p = [6, -24, 22]; p.hand.R.p = [-4, -22, 21]; p.root[1] += 2; });
  // 크로우 홉 → 송구
  const tHop = tCatch + 0.3;
  kl.add(tCatch + 0.18, (p) => {
    p.hand.L = { p: [-2, 6, 16], pole: [0.8, 0.6, -0.2], shape: 'glove', rot: 0 };
    p.hand.R = { p: [-8, 2, 12], pole: [-0.8, 0.6, -0.2], shape: 'fist', rot: 0 };
    p.chest = rot(80, 6, 0);
    p.neck = -6;
    p.head = 0;
    p.foot.R = foot(p.foot.R.p[0] + 14, 14, 30, 8, -12, 0);
    p.root[0] += 10;
  });
  kl.add(tHop, (p) => {
    p.foot.R = foot(-8, 8, 12, 0);
    p.knee.R = kneePole(30);
    p.foot.L = foot(12, -10, 80, 0, -16, 0);
    p.pelvis = rot(38, 10, -4);
    p.chest = rot(20, 6, -8);
    p.root = fitRoot(b, tm, p.pelvis, { R: { f: p.foot.R, max: 0.96 } }, -6, -(hipY - 10), 0);
    p.hand.R = { p: [-30, 34, -26], pole: [-0.5, 0, -0.85], shape: 'fist', rot: 0 };
    p.hand.L = { p: [42, 4, 16], pole: [0.2, 1, -0.4], shape: 'glove', rot: 20 };
  });
  const tFS = tHop + 0.12;
  kl.add(tFS, (p) => {
    p.foot.L = foot(66, -10, 76, 0);
    p.knee.L = kneePole(80, 0.1);
    p.foot.R = foot(-7, 8, 30, 28, 0, 1);
    p.pelvis = rot(56, 10, -4);
    p.chest = rot(30, 10, -8);
    p.root = fitRoot(b, tm, p.pelvis, { R: { f: p.foot.R, max: 0.99 }, L: { f: p.foot.L, max: 0.95 } }, 30, -(hipY - 14), 0);
    p.hand.R = { p: [-40, -24, -16], pole: [-0.3, 0.5, -0.8], shape: 'fist', rot: 0 };
  });
  const tREL = tFS + 0.085;
  kl.add(tREL, (p) => {
    p.pelvis = rot(96, 16, -2);
    p.chest = rot(98, 32, 30);
    p.foot.R = foot(-2, 6, 74, 52, 0, 1);
    p.root = fitRoot(b, tm, p.pelvis, { R: { f: p.foot.R, max: 0.995 }, L: { f: p.foot.L, max: 0.96 } }, 42, -(hipY - 12), 0);
    p.hand.R = { p: [-34, -44, 26], pole: [-0.4, 0.8, -0.4], shape: 'open', rot: 0 };
    p.hand.L = { p: [12, 22, 14], pole: [0.8, 0.5, -0.3], shape: 'glove', rot: 0 };
  });
  kl.add(tREL + 0.24, (p) => {
    p.pelvis = rot(106, 24, 0);
    p.chest = rot(116, 48, 8);
    p.foot.R = foot(36, 4, 88, 40, -16, 0);
    p.knee.R = [1, -0.4, 0];
    p.root = fitRoot(b, tm, p.pelvis, { L: { f: p.foot.L, max: 0.94 } }, 50, -(hipY - 16), 0);
    p.hand.R = { p: [8, 16, 46], pole: [-0.8, -0.3, -0.4], shape: 'relax', rot: 0 };
    p.hand.L = { p: [14, 24, 6], pole: [0.6, 0.8, -0.2], shape: 'glove', rot: 0 };
  });
  kl.add(tREL + 0.52, (p) => {
    p.foot.R = foot(78, 14, 96, 0);
    p.knee.R = kneePole(96);
    p.pelvis = rot(92, 10, 0);
    p.chest = rot(94, 12, 0);
    p.root = fitRoot(b, tm, p.pelvis, { R: { f: p.foot.R, max: 0.96 }, L: { f: p.foot.L, max: 0.96 } }, 68, -(hipY - 9), 0);
    p.hand.R = { p: [-6, 32, 18], pole: [-0.8, 0.5, -0.3], shape: 'relax', rot: 0 };
    p.hand.L = { p: [10, 28, 16], pole: [0.8, 0.5, -0.3], shape: 'glove', rot: 0 };
  });
  const track = kl.track();
  const dur = tREL + 0.9, loop = dur + 0.35;
  let relPt: V3 | null = null, cPt: V3 | null = null;
  const extra = (tt: number, p: Pose3) => {
    if (tt < tCatch) {
      const dt = tt - tCatch;
      if (dt > -0.7) {
        if (!cPt) cPt = solve3(b, track.at(tCatch), tm).palm.L;
        // 높이 뜬 공이 비스듬히 떨어짐
        p.ball = [cPt[0] + 70 * dt, cPt[1] + 520 * dt - 4, cPt[2]];
      }
      return;
    }
    if (tt < tREL) {
      if (tt < tCatch + 0.16) { const J = solve3(b, p, tm); p.ball = vadd(J.palm.L, [2, -3, 3]); } else { p.ball = null; p.ballHand = 'R'; }
      return;
    }
    if (!relPt) { const pr = track.at(tREL); relPt = solve3(b, pr, tm).palm.R; }
    const dt = tt - tREL;
    p.ball = dt < 0.1 ? flight(relPt, [3300, -420, -40], dt) : null;
  };
  return {
    kind: 'outfield', dur, loop,
    phases: [{ t: 0, label: '준비' }, { t: 0.4, label: '드롭 스텝' }, { t: 1.0, label: '뜬공 아래' }, { t: tCatch, label: '캐치' }, { t: tCatch + 0.2, label: '크로우 홉' }, { t: tREL, label: '송구' }],
    events: { catch: tCatch, release: tREL },
    headYaw: 86, gear: 'cap',
    smear: (tt) => (tt > tREL - 0.03 && tt < tREL + 0.08 ? 1 : 0),
    sample: looped(track, dur, loop, 0.12, 0.2, extra),
    keyTime: tCatch,
  };
}

// ───────────────────────── 달리기 ─────────────────────────
/**
 * 달리기 한 주기(두 걸음). speed: 0..1 (선수 주력), 체격이 무거울수록 보폭↓·발 구름↑.
 * 표시 속도는 실제의 slow 배(기본 0.62) — 작은 칸에서 다리가 읽히게.
 */
export function runMotion(ap: Appearance, speed = 0.6, slow = 0.62): Motion {
  const b = ap.build, tm = torsoModel(b);
  const hipY = b.hipY;
  const bmi = b.bmi;
  const v = clamp(7.1 + 2.0 * speed - (bmi - 25) * 0.12, 6.4, 9.4) * 100; // cm/s (실제)
  const cadence = clamp(4.15 + 0.5 * speed + (bmi - 25) * 0.05 - (b.h - 182) * 0.012, 3.8, 4.9); // 걸음/초
  const stepLen = v / cadence; // cm
  const T = (2 / cadence) / slow; // 표시 주기
  const vDisp = v * slow;
  const stance = clamp(0.27 - speed * 0.04 + (bmi - 25) * 0.006, 0.2, 0.32);
  const lean = 10 + 6 * speed;
  const reachF = stepLen * 0.36, reachB = stepLen * 0.62;
  // 발 경로(엉덩이 기준 x, 높이) — 흔들 때: 발뒤꿈치가 엉덩이로 → 무릎이 앞으로 → 정강이 뻗음 → 땅을 긁듯 착지
  const swingPts: [number, number][] = [
    [-reachB, 0], [-reachB * 0.92, -0.2 * hipY], [-reachB * 0.5, -0.5 * hipY * (0.75 + 0.35 * speed)],
    [0, -0.48 * hipY * (0.8 + 0.3 * speed)], [reachF * 1.15, -0.26 * hipY], [reachF * 1.08, -0.05 * hipY], [reachF, 0],
  ];
  const sw = crSample(swingPts, false, 10);
  const swingAt = (u: number): [number, number] => {
    const f = clamp(u, 0, 1) * (sw.length - 1);
    const i = Math.min(sw.length - 2, Math.floor(f));
    const k = f - i;
    return [lerp(sw[i][0], sw[i + 1][0], k), lerp(sw[i][1], sw[i + 1][1], k)];
  };
  const footAt = (ph: number, side: Side, root: V3): { p: V3; lift: number; pole: V3 } => {
    const z = side === 'R' ? 9 : -9;
    if (ph < stance) {
      const u = ph / stance;
      const x = lerp(reachF, -reachB, u);
      return { p: [root[0] + x, 0, z], lift: u < 0.55 ? 0 : (u - 0.55) / 0.45 * 46, pole: [1, -0.3, 0] };
    }
    const u = (ph - stance) / (1 - stance);
    const [x, y] = swingAt(u);
    const lift = u < 0.3 ? lerp(46, 70, u / 0.3) : u < 0.8 ? lerp(70, 20, (u - 0.3) / 0.5) : lerp(20, -8, (u - 0.8) / 0.2);
    return { p: [root[0] + x, y, z], lift, pole: [1, -0.5, 0] };
  };
  const sample = (t: number): Pose3 => {
    const ph = ((t / T) % 1 + 1) % 1;
    const p = basePose(b);
    p.glove = null;
    p.ballHand = null;
    const bounce = Math.cos((ph * 2 - 0.12) * Math.PI * 2);
    p.root = [0, -(hipY * 0.955) - 2.6 * (1 - bounce) * 0.5 - 1.5, 0];
    const sway = Math.sin(ph * Math.PI * 2);
    p.pelvis = rot(90 + 7 * sway, lean * 0.5, 2 * Math.cos(ph * Math.PI * 2));
    p.chest = rot(90 - 9 * sway, lean, -2 * Math.cos(ph * Math.PI * 2));
    p.neck = -lean * 0.9 + 4;
    p.head = 2;
    for (const s of ['R', 'L'] as Side[]) {
      const fph = (ph + (s === 'R' ? 0 : 0.5)) % 1;
      const ft = footAt(fph, s, p.root);
      // 발 앞꿈치 기준 → 발목에서 다시 계산(발 각도 반영)
      p.foot[s] = { p: ft.p, yaw: 90, lift: ft.lift, toe: fph < stance ? 1 : 0 };
      p.knee[s] = ft.pole;
      // 팔: 반대쪽 다리와 같은 박자
      const aph = Math.sin((fph + 0.5) * Math.PI * 2 - 0.4);
      const fwd = (aph + 1) / 2;
      const X = s === 'R' ? -1 : 1;
      p.hand[s] = {
        p: [X * lerp(17, 9, fwd), lerp(36, 2, fwd), lerp(-26, 28, fwd)],
        pole: [X * 0.4, lerp(-0.2, 0.9, fwd), lerp(-1, -0.4, fwd)],
        shape: 'fist', rot: 0,
      };
    }
    return p;
  };
  void hipWorld; void ballFromAnkle; void toLocal; void vmul; void D2R;
  return {
    kind: 'run', dur: T, loop: T, seamless: true,
    phases: [{ t: 0, label: `달리기 · 보폭 ${(stepLen / 100).toFixed(2)}m · ${cadence.toFixed(1)}보/초` }],
    events: {},
    headYaw: 90, gear: 'helmet',
    smear: () => 0,
    sample,
    scroll: vDisp,
    keyTime: T * 0.62,
  };
}
