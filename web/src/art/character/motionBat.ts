// 타격 동작 — 폼 변수(BatForm) → 키프레임.
// 기준: 우타자를 정면 쪽(홈플레이트 너머)에서 본 모습. 투수는 화면 오른쪽 +x, 홈플레이트는 타자 앞(카메라 쪽 +z).
// 좌타자는 거울 쌍둥이로 그린다. 단계: 준비(왜글) → 타이밍(레그킥·토탭·노스트라이드) → 스트라이드 → 스윙 → 컨택 → 팔로스루.
// 배트는 굳은 몸(노브 위치 + 방향)으로 움직이고, 두 손은 손잡이에 붙어 있도록 팔을 IK 로 푼다.

import type { Appearance, Side } from './types';
import type { V3 } from './geom';
import { clamp, lerp, vadd, vmul, D2R } from './geom';
import type { Pose3 } from './rig3';
import { solve3, toLocal } from './rig3';
import { torsoModel } from './torso';
import type { BatForm } from './forms';
import type { Motion } from './motion';
import { basePose, foot, rot, kneePole, fitRoot, liftLeg, hipWorld, KeyList, looped } from './motion';
import { Rng } from './rng';

export function batMotion(ap: Appearance, f: BatForm): Motion {
  const b = ap.build;
  const tm = torsoModel(b);
  const r = new Rng(f.seed).fork('batMotion');
  const j = (sd: number) => r.gauss(0, sd);
  const H = b.h, hipY = b.hipY;
  const W = f.width * H;
  const op = f.openness;
  const ck = f.crouchK;
  const tp = f.tempo;
  const shoulders = (p: Pose3) => solve3(b, { ...p, bat: null }, tm).shoulder;
  const batDir = (az: number, el: number): V3 => [Math.cos(el * D2R) * Math.sin(az * D2R), -Math.sin(el * D2R), Math.cos(el * D2R) * Math.cos(az * D2R)];

  const p0 = basePose(b);
  p0.glove = null;
  p0.batTop = 'R';
  p0.grip = [2.5, 10.5];
  const zBack = 8, zFront = 8 - 24 * op;
  p0.foot.R = foot(-W / 2, zBack, -6 + j(3), 0);
  p0.foot.L = foot(W / 2, zFront, 8 + 22 * Math.max(0, op) - 6 * Math.max(0, -op) + j(3), 0);
  p0.knee.R = kneePole(-16, 0.1);
  p0.knee.L = kneePole(26, 0.1);
  p0.pelvis = rot(-4 + 24 * op + j(2), 14 + 16 * ck, 2);
  p0.chest = rot(p0.pelvis.yaw - 10 - 10 * Math.max(0, op) + j(2), 9 + 12 * ck, -4);
  p0.root = fitRoot(b, tm, p0.pelvis, { R: { f: p0.foot.R, max: 0.97 - 0.08 * ck }, L: { f: p0.foot.L, max: 0.97 - 0.08 * ck } }, -0.05 * W, -(hipY - 5 - 14 * ck), -7);
  p0.neck = 2 + 4 * ck;
  p0.head = 3;
  const S0 = shoulders(p0);
  const tilt = f.batTilt, wrap = f.batWrap;
  const knob0: V3 = vadd(S0.R, [11, f.handsY + 9, 15]);
  // 랩: 배트 끝이 머리 뒤를 지나 투수 쪽을 가리킬수록(az → -190°) 감긴 것
  p0.bat = { knob: knob0, az: -104 - 86 * wrap + j(4), el: 90 - tilt };
  // 손은 배트에서 자동으로 — 팔꿈치 방향만
  p0.hand.R = { p: [0, 0, 0], pole: [-0.8, 0.9, -0.2], shape: 'grip', rot: 0 };
  p0.hand.L = { p: [0, 0, 0], pole: [0.2, 1, 0.1], shape: 'grip', rot: 0 };

  const kl = new KeyList(p0, 0);
  const phases: { t: number; label: string }[] = [{ t: 0, label: '준비' }];
  let t = 0;
  // ── 대기 (왜글) ──
  const wA = f.waggle === 'big' ? 1 : f.waggle === 'small' ? 0.45 : 0.12;
  const nW = f.waggle === 'none' ? 2 : 4;
  const waitT = (0.95 + 0.25 * r.next()) * tp;
  for (let i = 1; i <= nW; i++) {
    t = (waitT * i) / (nW + 0.6);
    const ph = i % 2 === 1 ? 1 : -1;
    kl.add(t, (p) => {
      p.bat!.az = p0.bat!.az + ph * 13 * wA;
      p.bat!.el = p0.bat!.el - (ph > 0 ? 9 : -3) * wA;
      p.bat!.knob = vadd(knob0, [ph * 2.5 * wA, ph > 0 ? -1.5 * wA : 1, 0]);
      p.root = vadd(p0.root, [0, ph > 0 ? 0.6 : -0.3, 0]);
    });
  }
  // ── 로드 / 타이밍 동작 ──
  t = waitT;
  phases.push({ t, label: '타이밍' });
  const big = f.legKick === 'big', small = f.legKick === 'small', tap = f.legKick === 'toeTap', none = f.legKick === 'noStride';
  const loadDur = (big ? 0.42 : small ? 0.32 : tap ? 0.3 : 0.2) * tp;
  const hitchDrop = f.hitch * 10;
  if (f.hitch > 0) {
    kl.add(t + loadDur * 0.35, (p) => { p.bat!.knob = vadd(knob0, [-2, hitchDrop, 2]); p.bat!.el = p0.bat!.el + 6; });
  }
  t += loadDur;
  const load = kl.add(t, (p) => {
    p.pelvis = rot(p0.pelvis.yaw - (big ? 16 : small ? 9 : 5), p0.pelvis.pitch, 3);
    p.chest = rot(p0.chest.yaw - (big ? 18 : small ? 11 : 6), p0.chest.pitch, -6);
    const backFoot = { R: { f: p.foot.R, max: 0.97 - 0.06 * ck } };
    p.root = fitRoot(b, tm, p.pelvis, backFoot, p0.root[0] - (big ? 10 : small ? 7 : 4), p0.root[1] - (big ? 2 : 0.5), p0.root[2]);
    const hip = hipWorld(tm, p.root, p.pelvis, 'L');
    if (big || small) {
      const lg = liftLeg(b, hip, p.pelvis.yaw - 38, big ? 62 + j(4) : 30 + j(3), big ? 74 : 42, 26, -0.05);
      p.foot.L = lg.f;
      p.knee.L = lg.pole;
    } else if (tap) {
      // 토탭: 무릎을 살짝 들어 앞발을 뒷발 쪽으로 당겼다가 발끝으로 찍는다
      const lg = liftLeg(b, hip, p.pelvis.yaw - 30, 24 + f.kickH * 0.6, 34 + f.kickH, 30, -0.03);
      p.foot.L = lg.f;
      p.knee.L = lg.pole;
    } else {
      p.foot.L = { ...p0.foot.L, lift: 22 };
      p.knee.L = kneePole(20, 0.2);
    }
    const S = shoulders(p);
    p.bat = { knob: vadd(S.R, [5 - (big ? 3 : 0), f.handsY + 6, 10]), az: p0.bat!.az - 10, el: p0.bat!.el - 8 };
  });
  if (tap) {
    // 발끝으로 톡 — 내려 찍었다가 다시 들어 내딛기
    t += 0.12 * tp;
    kl.add(t, (p) => { p.foot.L = foot(W / 2 - 10, zFront + 2, p0.foot.L.yaw - 4, 30, 0, 1); p.root[0] += 1.5; });
    t += 0.1 * tp;
    kl.add(t, (p) => { p.foot.L = foot(W / 2 - 4, zFront + 2, p0.foot.L.yaw, 12, -f.kickH * 0.7, 0); });
  } else if (none) {
    t += 0.08 * tp;
    kl.add(t, (p) => { p.foot.L = { ...p0.foot.L, lift: 12 }; });
  }
  // ── 스트라이드 (앞발 착지) ──
  const strideDur = (big ? 0.3 : small ? 0.24 : tap ? 0.16 : 0.12) * tp;
  t += strideDur;
  const tFS = t;
  phases.push({ t: tFS, label: '스트라이드' });
  const fx = W / 2 + f.strideLen;
  const fs = kl.add(t, (p) => {
    p.foot.L = foot(fx, zFront + 3, 30 + 14 * Math.max(0, op) + j(3), 0);
    p.knee.L = kneePole(34, 0.1);
    p.pelvis = rot(p0.pelvis.yaw - 8, p0.pelvis.pitch + 2, 1);
    p.chest = rot(load.chest.yaw - 2, p0.chest.pitch + 2, -6);
    p.root = fitRoot(b, tm, p.pelvis, { R: { f: p.foot.R, max: 0.98 }, L: { f: p.foot.L, max: 0.95 } }, p0.root[0] + f.strideLen * 0.4, p0.root[1] + 2, p0.root[2]);
    const S = shoulders(p);
    p.bat = { knob: vadd(S.R, [2, f.handsY + 7, 8]), az: load.bat!.az - 6, el: load.bat!.el - 4 };
  });
  // ── 스윙 ──
  const tSlot = tFS + 0.075;
  phases.push({ t: tSlot, label: '스윙' });
  const hipX = fs.root[0];
  const up = f.attack; // 공격각
  kl.add(tSlot, (p) => {
    p.pelvis = rot(fs.pelvis.yaw + 38, fs.pelvis.pitch, 0);
    p.chest = rot(fs.chest.yaw + 16, fs.chest.pitch + 2, -10);
    p.foot.R = foot(-W / 2 + 1, zBack, 22, 14, 0, 1);
    p.knee.R = [0.6, 0.5, 0.6];
    p.root = fitRoot(b, tm, p.pelvis, { R: { f: p.foot.R, max: 0.985 }, L: { f: p.foot.L, max: 0.95 } }, hipX + 3, fs.root[1] + 2, p0.root[2] + 2);
    const S = shoulders(p);
    p.bat = { knob: vadd(S.R, [16, 26, 22]), az: -96, el: 14 - 0.4 * up };
  });
  const tCon = tFS + 0.135;
  const con = kl.add(tCon, (p) => {
    p.pelvis = rot(74, fs.pelvis.pitch - 2, -2);
    p.chest = rot(44 + j(3), fs.chest.pitch + 6, -16);
    p.foot.R = foot(-W / 2 + 3, zBack - 1, 58, 34, 0, 1);
    p.knee.R = [0.95, 0.6, 0.4];
    p.knee.L = kneePole(40, 0.05);
    p.root = fitRoot(b, tm, p.pelvis, { R: { f: p.foot.R, max: 0.99 }, L: { f: p.foot.L, max: 0.965 } }, hipX + 5, fs.root[1] + 1, p0.root[2] + 3);
    p.bat = { knob: [fx * 0.5 - 2, -(hipY + 8), 40], az: 10 + j(3), el: -24 + 0.45 * up };
  });
  phases.push({ t: tCon, label: '컨택' });
  const tExt = tFS + 0.205;
  const ext = kl.add(tExt, (p) => {
    p.pelvis = rot(92, fs.pelvis.pitch - 3, -2);
    p.chest = rot(84, fs.chest.pitch + 2, -8);
    p.foot.R = foot(-W / 2 + 6, zBack - 2, 76, 44, 0, 1);
    p.root = fitRoot(b, tm, p.pelvis, { R: { f: p.foot.R, max: 0.99 }, L: { f: p.foot.L, max: 0.965 } }, hipX + 6, fs.root[1], p0.root[2] + 2);
    p.bat = { knob: [fx * 0.55 + 18, -(hipY + 10 + 0.3 * up), 30], az: 74, el: 6 + 0.9 * up };
    // 한 손을 놓을 때 튀지 않게: 지금 위 손 위치를 가슴 좌표로 저장
    const J = solve3(b, p, tm);
    p.hand.R = { ...p.hand.R, p: toLocal(J.neck, J.chestAx, J.wrist.R) };
  });
  phases.push({ t: tExt, label: '팔로스루' });
  // ── 팔로스루 ──
  const one = f.finish === 'oneHand';
  if (one) {
    kl.add(tExt + 0.06, (p) => {
      p.batFree = 'R';
      p.hand.R = { p: [-6, 20, 26], pole: [-0.8, 0.6, -0.2], shape: 'relax', rot: 0 };
      p.chest = rot(100, ext.chest.pitch, -4);
      p.bat = { knob: [fx * 0.55 + 26, -(hipY + 30), 18], az: 140, el: 30 + 0.6 * up };
    });
  }
  const tFin = tFS + 0.46;
  kl.add(tFin, (p) => {
    p.pelvis = rot(102, fs.pelvis.pitch - 6, 0);
    p.chest = rot(122 + j(3), 4, 2);
    p.foot.R = foot(-W / 2 + 9, zBack - 3, 84, 52, 0, 1);
    p.root = fitRoot(b, tm, p.pelvis, { R: { f: p.foot.R, max: 0.99 }, L: { f: p.foot.L, max: 0.97 } }, hipX + 5, fs.root[1] - 6, p0.root[2] + 1);
    const S = shoulders(p);
    if (one) {
      p.batFree = 'R';
      p.hand.R = { p: [-8, 24, 22], pole: [-0.8, 0.6, -0.2], shape: 'relax', rot: 0 };
      // 한 손: 앞 어깨 위·뒤로 배트를 높이 들어 올림 (가슴 쪽으로 오지 않게)
      p.bat = { knob: vadd(S.L, [-2, -30, -8]), az: 228, el: 56 };
    } else {
      p.bat = { knob: vadd(S.L, [-6, -12, -2]), az: 236, el: 30 };
    }
    p.neck = 0;
  });
  phases.push({ t: tFin, label: '마무리' });
  kl.add(tFin + 0.35, (p) => { p.chest.yaw -= 6; p.chest.pitch += 3; p.root[1] += 1; if (p.bat) p.bat.el -= 6; });
  const track = kl.track();
  const dur = tFin + 0.85;
  const loop = dur + 0.4;
  // 공: 투수 쪽에서 날아와 배트 스윗스폿에 맞고 당겨져 나감
  const sweet = (pp: Pose3): V3 => { const d = batDir(pp.bat!.az, pp.bat!.el); return vadd(pp.bat!.knob, vmul(d, 70)); };
  const hit = sweet(con);
  const vin: V3 = [-3800, 25, 6];
  const vout: V3 = [2900, -700 - 60 * up, 900];
  const extra = (tt: number, p: Pose3) => {
    const dt = tt - tCon;
    if (dt < -0.16 || dt > 0.14) { p.ball = null; return; }
    p.ball = dt <= 0 ? vadd(hit, vmul(vin, dt)) : vadd(hit, vmul(vout, dt));
  };
  void clamp; void lerp; void con;
  return {
    kind: 'bat', dur, loop, phases,
    events: { load: waitT, footStrike: tFS, contact: tCon, extension: tExt },
    headYaw: 82, gear: 'helmet', view: 12,
    smear: (tt) => (tt > tSlot && tt < tExt + 0.05 ? 1 : 0),
    sample: looped(track, dur, loop, 0.14, 0.22, extra),
    keyTime: tCon,
  };
}

/** 번트 — 투수 쪽으로 몸을 돌려 배트를 수평으로 내밀고 공을 받아 죽인다 */
export function buntMotion(ap: Appearance, f: BatForm): Motion {
  const b = ap.build;
  const tm = torsoModel(b);
  const H = b.h, hipY = b.hipY;
  const W = f.width * H;
  const shoulders = (p: Pose3) => solve3(b, { ...p, bat: null }, tm).shoulder;
  const p0 = basePose(b);
  p0.glove = null;
  p0.batTop = 'R';
  p0.grip = [2.5, 10.5];
  p0.foot.R = foot(-W / 2, 8, -6, 0);
  p0.foot.L = foot(W / 2, 8, 10, 0);
  p0.knee.R = kneePole(-16, 0.1);
  p0.knee.L = kneePole(26, 0.1);
  p0.pelvis = rot(-4, 18, 2);
  p0.chest = rot(-12, 14, -4);
  p0.root = fitRoot(b, tm, p0.pelvis, { R: { f: p0.foot.R, max: 0.93 }, L: { f: p0.foot.L, max: 0.93 } }, -0.05 * W, -(hipY - 10), -7);
  const S0 = shoulders(p0);
  p0.bat = { knob: vadd(S0.R, [11, 6, 15]), az: -110, el: 50 };
  p0.hand.R = { p: [0, 0, 0], pole: [-0.8, 0.9, -0.2], shape: 'grip', rot: 0 };
  p0.hand.L = { p: [0, 0, 0], pole: [0.2, 1, 0.1], shape: 'grip', rot: 0 };
  const kl = new KeyList(p0, 0);
  kl.add(0.7, (p) => { p.bat!.el += 4; });
  // 피벗: 두 발끝을 투수 쪽으로, 가슴을 투수 쪽으로
  const tPiv = 1.05;
  const piv = kl.add(tPiv, (p) => {
    p.foot.R = foot(-W / 2 + 4, 6, 50, 28, 0, 1);
    p.foot.L = foot(W / 2 + 2, 6, 64, 0);
    p.knee.R = kneePole(60, 0.2);
    p.knee.L = kneePole(64, 0.2);
    p.pelvis = rot(60, 20, 0);
    p.chest = rot(70, 22, 0);
    p.root = fitRoot(b, tm, p.pelvis, { R: { f: p.foot.R, max: 0.9 }, L: { f: p.foot.L, max: 0.9 } }, 0, -(hipY - 18), -2);
    const S = shoulders(p);
    p.grip = [2.5, 40];
    p.bat = { knob: vadd(S.R, [14, 20, 30]), az: 8, el: 12 };
    p.neck = -6;
  });
  const tCatch = 1.55;
  kl.add(tCatch - 0.1, (p) => { p.bat!.knob = vadd(piv.bat!.knob, [2, 2, 2]); });
  kl.add(tCatch, (p) => { p.bat!.knob = vadd(piv.bat!.knob, [-3, 3, -2]); p.bat!.el = 9; });
  kl.add(tCatch + 0.5, (p) => { p.root[1] -= 4; p.chest.pitch -= 6; });
  const track = kl.track();
  const dur = tCatch + 0.95;
  const loop = dur + 0.35;
  const batDir = (az: number, el: number): V3 => [Math.cos(el * D2R) * Math.sin(az * D2R), -Math.sin(el * D2R), Math.cos(el * D2R) * Math.cos(az * D2R)];
  const pc = track.at(tCatch);
  const hit = vadd(pc.bat!.knob, vmul(batDir(pc.bat!.az, pc.bat!.el), 58));
  const extra = (tt: number, p: Pose3) => {
    const dt = tt - tCatch;
    if (dt < -0.16 || dt > 0.55) { p.ball = null; return; }
    if (dt <= 0) { p.ball = vadd(hit, vmul([-3400, 20, 0], dt)); return; }
    // 죽은 공: 앞으로 굴러 떨어짐
    const g = 980;
    const y = Math.min(-3.7, hit[1] + 60 * dt + 0.5 * g * dt * dt);
    p.ball = [hit[0] + 90 * dt, y, hit[2] + 120 * dt];
  };
  return {
    kind: 'bunt', dur, loop,
    phases: [{ t: 0, label: '준비' }, { t: 0.85, label: '번트 자세' }, { t: tCatch, label: '공 죽이기' }],
    events: { pivot: tPiv, contact: tCatch },
    headYaw: 82, gear: 'helmet',
    smear: () => 0,
    sample: looped(track, dur, loop, 0.14, 0.22, extra),
    keyTime: tCatch,
  };
}

export const _unused: Side | null = null;
