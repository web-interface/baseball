// 투구 동작 — 폼 변수(PitchForm) → 키프레임 → 매끈한 동작.
// 기준: 우투수를 3루 쪽에서 본 모습(홈은 화면 오른쪽 +x, 투수판 x=0). 좌투수는 거울 쌍둥이로 그린다(그림 단계에서 뒤집음).
// 단계: 셋업 → 다리 들기 → (멈춤) → 스트라이드 → 팔 회전(최대 외회전) → 릴리스 → 팔로스루 → 수비 자세.
//
// 시간 기준(실제 투수 측정치에 맞춤): 다리 들기~디딤 0.75~1.2초, 디딤→릴리스 0.13~0.16초, 슬라이드 스텝은 디딤까지 0.5초 남짓.

import type { Appearance, Side } from './types';
import type { V3 } from './geom';
import { clamp, lerp, D2R, vadd, vmul, vsub, vnorm } from './geom';
import type { Pose3 } from './rig3';
import { solve3, shoulderLocal } from './rig3';
import { torsoModel } from './torso';
import type { PitchForm } from './forms';
import type { Motion } from './motion';
import { basePose, foot, rot, kneePole, fitRoot, liftLeg, hipWorld, KeyList, looped } from './motion';
import { Rng } from './rng';

const SL = (s: Side) => s; // 가독성용

export function pitchMotion(ap: Appearance, f: PitchForm): Motion {
  const b = ap.build;
  const tm = torsoModel(b);
  const r = new Rng(f.seed).fork('pitchMotion');
  const j = (sd: number) => r.gauss(0, sd);
  const H = b.h, hipY = b.hipY;
  const T = f.tempoMul;
  const uA = b.upperArm, fA = b.foreArm, armLen = uA + fA;
  const SR = shoulderLocal(tm, 'R');
  const Sx = -SR[0], sY = SR[1];
  const slotUp = clamp((f.armAngle + 30) / 110, 0, 1);
  const beta = clamp((f.armAngle - 15) * 0.55, -22, 34); // 릴리스 때 몸통 옆 기울기(+ 글러브 쪽)
  const stride = f.stride * H * 0.94;
  const drop = f.drop;
  const legYawLift = (pelvisYaw: number) => pelvisYaw - 34 - 30 * f.tuck + j(3);
  const sideFoot = 0.24 * H + j(2);
  const pivot = foot(3, 6, j(4), 0);

  // 손 높이 (세트)
  const hy = f.setHands === 'belt' ? 30 : f.setHands === 'chest' ? 19 : 6;

  const base = basePose(b);
  base.glove = 'L';
  base.ballHand = 'R';
  base.neck = 6;
  base.head = 4;

  // ── 시작 자세 ──
  const k0 = base;
  let t = 0;
  const kl = new KeyList(k0, 0);
  const setPose = (p: Pose3) => {
    p.pelvis = rot(6 + j(2), 6, 0);
    p.chest = rot(2 + j(2), 4 + j(1.5), 0);
    p.foot.R = { ...pivot, p: [...pivot.p] as V3 };
    p.foot.L = foot(sideFoot, 2 + j(2), 12 + j(4));
    p.knee.R = kneePole(4, 0.1);
    p.knee.L = kneePole(18, 0.1);
    p.root = fitRoot(b, tm, p.pelvis, { R: { f: p.foot.R, max: 0.97 }, L: { f: p.foot.L, max: 0.97 } }, (3 + sideFoot) / 2 - 3, -(hipY - 3.5), -8);
    p.hand.R = { p: [-2, hy + 1, 15], pole: [-0.8, 0.6, -0.2], shape: 'fist', rot: 0 };
    p.hand.L = { p: [5, hy, 17.5], pole: [0.8, 0.6, -0.2], shape: 'glove', rot: 0 };
    p.neck = 7;
    p.head = 5;
  };

  const phases: { t: number; label: string }[] = [];
  if (f.delivery === 'windup') {
    // 홈을 보고 선 와인드업 시작
    kl.last.pelvis = rot(82, 4, 0);
    kl.last.chest = rot(84, 4, 0);
    kl.last.foot.R = foot(6, 6, 84);
    kl.last.foot.L = foot(-6, -16, 80);
    kl.last.knee.R = kneePole(84);
    kl.last.knee.L = kneePole(80);
    kl.last.root = fitRoot(b, tm, kl.last.pelvis, { R: { f: kl.last.foot.R, max: 0.97 }, L: { f: kl.last.foot.L, max: 0.97 } }, 0, -(hipY - 2.5), -4);
    kl.last.hand.R = { p: [-2, 19, 17], pole: [-0.8, 0.6, -0.2], shape: 'fist', rot: 0 };
    kl.last.hand.L = { p: [4, 18, 19], pole: [0.8, 0.6, -0.2], shape: 'glove', rot: 0 };
    phases.push({ t: 0, label: '와인드업' });
    t = 0.32 * T;
    kl.add(t, (p) => { p.hand.R.p[1] += 1.5; p.hand.L.p[1] += 1.5; });
    // 뒤로 한 발 (로커 스텝)
    t += 0.36 * T;
    kl.add(t, (p) => {
      p.foot.L = foot(-0.17 * H, -22, 66, 8);
      p.knee.L = kneePole(66);
      p.pelvis = rot(74, 2, 0);
      p.chest = rot(78, -2, 0);
      p.root = fitRoot(b, tm, p.pelvis, { R: { f: p.foot.R, max: 0.98 }, L: { f: p.foot.L, max: 0.98 } }, -0.08 * H, -(hipY - 2), -6);
      if (f.overhead) {
        p.hand.R = { p: [-3, -34, 8], pole: [-0.8, 0.4, -0.3], shape: 'fist', rot: 0 };
        p.hand.L = { p: [3, -35, 10], pole: [0.8, 0.4, -0.3], shape: 'glove', rot: 0 };
      } else { p.hand.R.p = [-2, 14, 17]; p.hand.L.p = [4, 13, 19]; }
      p.neck = 6;
    });
    // 축발을 투수판 앞으로 돌려 놓음 (몸이 3루 쪽을 봄)
    t += 0.22 * T;
    kl.add(t, (p) => {
      p.foot.R = foot(4, 6, 40, 10, -4, 0);
      p.knee.R = kneePole(40);
      p.pelvis = rot(44, 2, 0);
      p.chest = rot(48, 0, 0);
      p.root = fitRoot(b, tm, p.pelvis, { L: { f: p.foot.L, max: 0.98 } }, -0.06 * H, -(hipY - 1.5), -7);
    });
    t += 0.2 * T;
    kl.add(t, (p) => {
      p.foot.R = { ...pivot, p: [...pivot.p] as V3 };
      p.knee.R = kneePole(4, 0.1);
      p.pelvis = rot(12, 3, 0);
      p.chest = rot(10, 2, 0);
      p.root = fitRoot(b, tm, p.pelvis, { R: { f: p.foot.R, max: 0.98 }, L: { f: p.foot.L, max: 0.99 } }, -0.02 * H, -(hipY - 2), -8);
      const yh = f.overhead ? -8 : hy - 6;
      p.hand.R = { p: [-2, yh + 1, 14], pole: [-0.8, 0.6, -0.2], shape: 'fist', rot: 0 };
      p.hand.L = { p: [5, yh, 16.5], pole: [0.8, 0.6, -0.2], shape: 'glove', rot: 0 };
    });
  } else {
    setPose(kl.last);
    phases.push({ t: 0, label: '세트' });
    t = 0.42 * T;
    kl.add(t, (p) => { p.hand.R.p[1] += 1.2; p.hand.L.p[1] += 1.2; p.root[1] += 0.6; p.neck = 8; });
    t += 0.18 * T;
    kl.add(t, (p) => { p.root[1] -= 0.8; });
  }

  // ── 다리 들기 ──
  const tLift0 = t;
  phases.push({ t: tLift0, label: '다리 들기' });
  const liftDur = (f.legLift === 'slide' ? 0.17 : 0.34 + 0.26 * f.liftH) * T;
  const coilYaw = 6 - 30 * f.coil;
  // 들기 시작: 무게를 축발로
  kl.add(t + liftDur * 0.35, (p) => {
    p.pelvis = rot(lerp(p.pelvis.yaw, coilYaw, 0.35), 4, -1);
    p.chest = rot(lerp(p.chest.yaw, coilYaw - 10 * f.coil, 0.3), 3, -1);
    const pr = rot(p.pelvis.yaw, p.pelvis.pitch, p.pelvis.roll);
    p.root = fitRoot(b, tm, pr, { R: { f: p.foot.R, max: 0.985 } }, 7, -(hipY - 1.5), -8);
    const hip = hipWorld(tm, p.root, pr, 'L');
    const lg = liftLeg(b, hip, legYawLift(p.pelvis.yaw), lerp(8, 40, f.liftH), lerp(12, 40, f.liftH), 20);
    p.foot.L = lg.f;
    p.knee.L = lg.pole;
  });
  t += liftDur;
  const peak = kl.add(t, (p) => {
    p.pelvis = rot(coilYaw + j(2), 4, -2);
    p.chest = rot(coilYaw - 12 * f.coil + j(2), 2, -3);
    p.root = fitRoot(b, tm, p.pelvis, { R: { f: p.foot.R, max: 0.99 } }, 4, -(hipY - 0.3), -8);
    const hip = hipWorld(tm, p.root, p.pelvis, 'L');
    const lg = liftLeg(b, hip, legYawLift(p.pelvis.yaw), lerp(22, 118, f.liftH), lerp(26, 104, f.liftH), 28);
    p.foot.L = lg.f;
    p.knee.L = lg.pole;
    const up = 4 + 7 * f.liftH;
    p.hand.R.p = [p.hand.R.p[0] - 1, p.hand.R.p[1] - up, p.hand.R.p[2] - 1];
    p.hand.L.p = [p.hand.L.p[0] - 1, p.hand.L.p[1] - up, p.hand.L.p[2] - 1];
    p.neck = 6;
  });
  // 멈춤(밸런스)
  if (f.hang > 0.02) {
    t += f.hang;
    kl.add(t, (p) => { p.root[1] += 0.6; p.hand.R.p[1] += 0.8; p.hand.L.p[1] += 0.8; });
  }

  // ── 스트라이드 ──
  phases.push({ t, label: '스트라이드' });
  const tFall = t + 0.11 * T;
  kl.add(tFall, (p) => {
    p.pelvis = rot(peak.pelvis.yaw + 6, 5, -3);
    p.chest = rot(peak.chest.yaw - 2, 3, -4);
    p.root = fitRoot(b, tm, p.pelvis, { R: { f: p.foot.R, max: 0.99 } }, 12, -(hipY - 2.5 - 7 * drop), -7);
    const hip = hipWorld(tm, p.root, p.pelvis, 'L');
    const lg = liftLeg(b, hip, legYawLift(p.pelvis.yaw) + 10, lerp(18, 86, f.liftH), lerp(24, 92, f.liftH), 22);
    p.foot.L = lg.f;
    p.knee.L = lg.pole;
    // 손을 뗌
    p.hand.R = { p: [-9, hy + 6, 9], pole: [-0.8, 0.5, -0.3], shape: 'fist', rot: 0 };
    p.hand.L = { p: [9, hy - 1, 17], pole: [0.8, 0.6, -0.2], shape: 'glove', rot: 0 };
  });
  const tMid = tFall + 0.19 * T;
  const gH = f.gloveHigh;
  kl.add(tMid, (p) => {
    p.pelvis = rot(16, 6, -6);
    p.chest = rot(Math.min(peak.chest.yaw, -6) - 6 * f.coil, 2, -8);
    p.root = fitRoot(b, tm, p.pelvis, { R: { f: p.foot.R, max: 0.995 } }, 0.32 * stride, -(hipY - 6 - 16 * drop), -6);
    p.foot.L = foot(0.56 * stride, f.strideZ * 0.5 + 6, 52, -10, -(16 + 14 * f.liftH), 0);
    p.knee.L = [0.85, -0.55, 0.25];
    p.foot.R = { ...p.foot.R, yaw: 8, lift: 6 };
    if (f.armAction === 'short') p.hand.R = { p: [-Sx - 10, sY - 9, -10], pole: [-0.5, 0.75, -0.45], shape: 'fist', rot: 0 };
    else p.hand.R = { p: [-Sx - 7 - 8 * (1 - slotUp), 44 - 6 * slotUp, -14 - 6 * (1 - slotUp)], pole: [-0.6, 0.1, -0.8], shape: 'fist', rot: 0 };
    p.hand.L = { p: [Sx + 0.62 * armLen, sY + 10 - 30 * gH, 10 + 14 * gH], pole: [0, 1, -0.8], shape: 'glove', rot: 30 - 30 * gH };
    p.neck = 4;
  });

  // ── 디딤 (Foot strike) ──
  const tFS = tMid + 0.15 * T;
  const fsPelvisYaw = 40 + 8 * (1 - f.coil);
  const fs = kl.add(tFS, (p) => {
    p.pelvis = rot(fsPelvisYaw, 6, -6);
    p.chest = rot(-2 - 12 * f.coil + j(2), 3, -10);
    p.foot.L = foot(stride, f.strideZ, f.crossfire ? 62 : 74, 0);
    p.knee.L = [1, -0.25, 0.12];
    p.foot.R = foot(5, 6, 26, 32, 0, 1);
    p.knee.R = [0.7, 0.35, 0.6];
    p.root = fitRoot(b, tm, p.pelvis, { R: { f: p.foot.R, max: 0.995 }, L: { f: p.foot.L, max: 0.95 } }, 0.52 * stride, -(hipY - 8 - 14 * drop), -4);
    const high: V3 = [-Sx - 0.72 * uA, sY - 0.9 * fA - 2, -0.45 * uA];
    const low: V3 = [-Sx - 0.55 * uA, sY + 0.45 * fA + 20, -0.8 * uA];
    const k = Math.pow(slotUp, 0.8);
    p.hand.R = { p: [lerp(low[0], high[0], k), lerp(low[1], high[1], k), lerp(low[2], high[2], k)], pole: [lerp(-0.7, -0.3, k), lerp(-0.1, 0.5, k), lerp(-0.7, -0.8, k)], shape: 'fist', rot: 0 };
    p.hand.L = { p: [Sx + 0.84 * armLen - 10 * gH, sY + 9 - 26 * gH, 8 + 14 * gH], pole: [0, 1, -0.8], shape: 'glove', rot: 28 - 28 * gH };
    p.neck = 2;
    p.head = 2;
  });
  phases.push({ t: tFS, label: '디딤' });

  // ── 최대 외회전 (팔이 뒤로 젖혀짐) ──
  const tMER = tFS + 0.08;
  kl.add(tMER, (p) => {
    p.pelvis = rot(84, 9, -4);
    p.chest = rot(58, 14 + 0.25 * f.trunkFlex, 0.6 * beta);
    p.foot.R = foot(6, 5, 52, 46, 0, 1);
    p.knee.R = [0.9, 0.5, 0.4];
    p.root = fitRoot(b, tm, p.pelvis, { R: { f: p.foot.R, max: 0.998 }, L: { f: p.foot.L, max: 0.95 } }, fs.root[0] + 10, -(hipY - 9 - 13 * drop), -3);
    const high: V3 = [-Sx - 0.8 * uA, sY - 0.12 * fA, -0.25 * uA - 0.92 * fA];
    const low: V3 = [-Sx - 0.7 * uA, sY + 0.5 * fA + 22, -0.55 * uA - 0.6 * fA];
    const k = Math.pow(slotUp, 0.8);
    p.hand.R = { p: [lerp(low[0], high[0], k), lerp(low[1], high[1], k), lerp(low[2], high[2], k)], pole: [-0.9, 0.3, 0.1], shape: 'fist', rot: 0 };
    p.hand.L = { p: [Sx + 0.42 * armLen, 10 - 8 * gH, 22], pole: [0.4, 1, -0.4], shape: 'glove', rot: 0 };
    p.neck = -2;
    p.head = 0;
  });
  phases.push({ t: tMER, label: '팔 회전' });

  // ── 릴리스 ──
  const tREL = tMER + 0.05;
  const A = 90 + f.armAngle - beta;
  const dl = vnorm([-Math.sin(A * D2R), Math.cos(A * D2R), 0.24]);
  const rel = kl.add(tREL, (p) => {
    p.pelvis = rot(96, 15, -2);
    p.chest = rot(97, f.trunkFlex, beta);
    p.foot.R = foot(11, 4, 74, 56, 0, 1);
    p.knee.R = [1, 0.65, 0.2];
    p.root = fitRoot(b, tm, p.pelvis, { R: { f: p.foot.R, max: 0.998 }, L: { f: p.foot.L, max: 0.965 } }, fs.root[0] + 22, -(hipY - 8 - 11 * drop), -2);
    p.hand.R = { p: vadd(SR, vmul(dl, armLen * 0.955)), pole: [-0.4, 0.8, -0.4], shape: 'open', rot: 0 };
    p.hand.L = { p: [Sx * 0.6, 22, 13], pole: [0.8, 0.5, -0.3], shape: 'glove', rot: 0 };
    p.neck = -0.55 * f.trunkFlex + 8;
    p.head = -4;
    p.ballHand = null;
  });
  phases.push({ t: tREL, label: '릴리스' });

  // ── 팔로스루 ──
  const fall = f.finish === 'fallOff' ? 1 : 0;
  const hop = f.finish === 'hop' ? 1 : 0;
  const tLift2 = tREL + 0.07;
  kl.add(tLift2, (p) => {
    p.pelvis = rot(104 + 6 * fall, 26, -1);
    p.chest = rot(110 + 10 * fall, f.trunkFlex + 20, beta * 0.6);
    p.foot.R = foot(26, 0, 82, 62, -8 - 6 * hop, 0);
    p.knee.R = [1, 0.2, 0];
    p.root = fitRoot(b, tm, p.pelvis, { L: { f: p.foot.L, max: 0.95 } }, rel.root[0] + 14, -(hipY - 12 - 9 * drop), -4);
    // 몸통이 크게 숙여지면 가슴 좌표 '앞(Z)'이 땅 쪽 — 손은 앞(Z)으로 보내야 앞무릎 바깥에서 끝난다
    p.hand.R = { p: [2, 16, 46], pole: [-0.7, -0.2, -0.6], shape: 'relax', rot: 0 };
    p.hand.L = { p: [Sx * 0.75, 22, 8], pole: [0.6, 0.8, -0.1], shape: 'glove', rot: 0 };
    p.neck = -0.5 * f.trunkFlex + 6 + 10 * f.headWhip;
    p.head = -6;
  });
  const tFT = tREL + 0.2;
  kl.add(tFT, (p) => {
    p.pelvis = rot(112 + 12 * fall, 38, 0);
    p.chest = rot(118 + 18 * fall, f.trunkFlex + 40, beta * 0.35);
    p.foot.R = foot(0.45 * stride, -10 * fall, 88, 40, -(18 + 30 * hop), 0);
    p.knee.R = [1, -0.5, 0];
    p.root = fitRoot(b, tm, p.pelvis, { L: { f: p.foot.L, max: 0.92 } }, stride - 26, -(hipY - 18 - 9 * drop), -6 - 6 * fall);
    p.hand.R = { p: [Sx * 0.5, 14, 50], pole: [-0.8, -0.3, -0.4], shape: 'relax', rot: 0 };
    p.hand.L = { p: [Sx * 0.8, 24, 4], pole: [0.6, 0.8, -0.2], shape: 'glove', rot: 0 };
    p.neck = -10 + 14 * f.headWhip;
    p.head = -6;
  });
  phases.push({ t: tFT, label: '팔로스루' });

  // ── 수비 자세 ──
  const tLand = tFT + 0.2;
  kl.add(tLand, (p) => {
    p.pelvis = rot(98 + 8 * fall, 18, 0);
    p.chest = rot(100 + 10 * fall, 22, 0);
    p.foot.R = foot(stride + 6, -26 - 30 * fall, 104 + 10 * fall, 0);
    p.knee.R = kneePole(100, 0.2);
    p.knee.L = kneePole(80, 0.2);
    p.root = fitRoot(b, tm, p.pelvis, { R: { f: p.foot.R, max: 0.96 }, L: { f: p.foot.L, max: 0.96 } }, stride - 8, -(hipY - 14), -12 - 14 * fall);
    p.hand.R = { p: [-6, 34, 20], pole: [-0.8, 0.5, -0.3], shape: 'relax', rot: 0 };
    p.hand.L = { p: [8, 26, 26], pole: [0.8, 0.6, -0.2], shape: 'glove', rot: 0 };
    p.neck = 2;
    p.head = 0;
  });
  const tFin = tLand + 0.3;
  kl.add(tFin, (p) => {
    p.pelvis = rot(94 + 4 * fall, 12, 0);
    p.chest = rot(94 + 4 * fall, 14, 0);
    p.root = fitRoot(b, tm, p.pelvis, { R: { f: p.foot.R, max: 0.95 }, L: { f: p.foot.L, max: 0.95 } }, stride - 6, -(hipY - 11), -12 - 14 * fall);
    p.hand.R = { p: [-5, 30, 22], pole: [-0.8, 0.5, -0.3], shape: 'relax', rot: 0 };
    p.hand.L = { p: [7, 22, 27], pole: [0.8, 0.6, -0.2], shape: 'glove', rot: 0 };
    p.neck = 4;
  });
  phases.push({ t: tLand, label: '수비 자세' });

  const track = kl.track();
  const dur = tFin + 0.3;
  const loop = dur + 0.4;
  // 공: 릴리스까지 손에, 그 뒤로 홈 쪽으로 날아감
  let relPt: V3 | null = null;
  const relDir: V3 = vnorm([1, 0.03 - 0.0025 * f.armAngle, -0.04]);
  const extra = (tt: number, p: Pose3) => {
    if (tt < tREL) { p.ballHand = 'R'; p.ball = null; return; }
    p.ballHand = null;
    if (!relPt) {
      const pr = track.at(tREL);
      pr.ballHand = 'R';
      const J = solve3(b, pr, tm);
      relPt = J.palm.R;
    }
    const dt = tt - tREL;
    p.ball = dt < 0.09 ? vadd(relPt, vmul(relDir, 3600 * dt)) : null;
  };
  const sample = looped(track, dur, loop, 0.14, 0.22, extra);
  void SL;
  void vsub;
  return {
    kind: 'pitch', dur, loop, phases,
    events: { liftStart: tLift0, footStrike: tFS, mer: tMER, release: tREL, followThrough: tFT },
    headYaw: 84, gear: 'cap',
    smear: (tt) => (tt > tMER + 0.01 && tt < tREL + 0.08 ? 1 : 0),
    sample,
    keyTime: tREL,
  };
}
