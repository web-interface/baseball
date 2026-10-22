// 동작 공통 — 동작(Motion) 형식, 기본 자세, 키 만들기 도구(다리 들기, 엉덩이 높이 맞추기 등).

import type { Build, Side } from './types';
import type { V3 } from './geom';
import { D2R, clamp, lerp, vadd, vmul, vsub, vlen } from './geom';
import type { Pose3, FootTarget, Rot3 } from './rig3';
import { axesOf, anklePos, ballFromAnkle, toWorld } from './rig3';
import type { TorsoModel } from './torso';
import { Track, clonePose } from './anim';
import type { Key } from './anim';

export type MotionKind = 'pitch' | 'bat' | 'bunt' | 'catcher' | 'infield' | 'outfield' | 'run';

export interface Motion {
  kind: MotionKind;
  /** 움직이는 부분 길이(초) */
  dur: number;
  /** 반복 주기(초) — dur 뒤 멈춤 + 사라졌다 나타남 */
  loop: number;
  /** 단계 이름 (시각 오름차순) */
  phases: { t: number; label: string }[];
  /** 주요 순간 (release, contact, footStrike …) */
  events: Record<string, number>;
  headYaw: number;
  gear: 'cap' | 'helmet' | 'none';
  /** 카메라를 몸 둘레로 돌린 각도(도) — 그림(LiveFigure)에 같은 값을 넘긴다 */
  view?: number;
  /** 포수 장비(마스크·보호대)를 입고 하는 동작 */
  catcherGear?: boolean;
  mask?: boolean;
  /** 잔상 세기 0..1 */
  smear: (t: number) => number;
  /** t: 0..loop */
  sample: (t: number) => Pose3;
  /** 달리기처럼 끊김 없이 도는 동작 */
  seamless?: boolean;
  /** 바닥이 흐르는 속도(cm/초, 달리기) */
  scroll?: number;
  /** 정지 그림·썸네일에 쓸 시각 */
  keyTime: number;
}

export const kneePole = (yaw: number, up = 0.15): V3 => [Math.sin(yaw * D2R), -up, Math.cos(yaw * D2R)];
export const foot = (x: number, z: number, yaw: number, lift = 0, y = 0, toe = 1): FootTarget => ({ p: [x, y, z], yaw, lift, toe });
export const rot = (yaw: number, pitch = 0, roll = 0): Rot3 => ({ yaw, pitch, roll });

/** 기본 자세(옆모습으로 서 있기) */
export function basePose(b: Build): Pose3 {
  return {
    root: [0, -b.hipY, 0],
    pelvis: rot(90), chest: rot(90),
    neck: 6, head: 0,
    hand: {
      R: { p: [-20, 48, 2], pole: [-1, 0.2, -0.4], shape: 'relax', rot: 0 },
      L: { p: [20, 48, 2], pole: [1, 0.2, -0.4], shape: 'relax', rot: 0 },
    },
    foot: { R: foot(4, 10, 90), L: foot(-4, -10, 90) },
    knee: { R: kneePole(90), L: kneePole(90) },
    bat: null, batTop: 'R', grip: [3, 11], batFree: null,
    glove: null, ballHand: null, ball: null, fade: 1, mask: false,
  };
}

/** 골반 회전을 반영한 고관절 월드 위치 */
export function hipWorld(tm: TorsoModel, root: V3, pelvis: Rot3, s: Side): V3 {
  const ax = axesOf(pelvis.yaw, pelvis.pitch, pelvis.roll);
  const hj = tm.hipJ(s === 'L' ? 1 : -1);
  return toWorld(root, ax, hj[0], 0, hj[2]);
}

/**
 * 두 발(또는 한 발)이 닿도록 엉덩이 위치를 맞춘다.
 * yWant 부터 내려가며, 다리별 '최대 길이 비율' 안에 들어오는 x 구간을 찾고 xWant 에 가장 가까운 값을 고른다.
 */
export function fitRoot(b: Build, tm: TorsoModel, pelvis: Rot3, feet: Partial<Record<Side, { f: FootTarget; max: number }>>, xWant: number, yWant: number, zWant: number): V3 {
  const legL = b.thigh + b.shin;
  for (let k = 0; k < 40; k++) {
    const y = yWant + k * 1.5;
    let lo = -Infinity, hi = Infinity, ok = true;
    for (const s of ['R', 'L'] as Side[]) {
      const ft = feet[s];
      if (!ft) continue;
      const A = anklePos(b, ft.f);
      const off = vsub(hipWorld(tm, [0, 0, 0], pelvis, s), [0, 0, 0]);
      const dy = y + off[1] - A[1], dz = zWant + off[2] - A[2];
      const R = legL * ft.max;
      const h2 = R * R - dy * dy - dz * dz;
      if (h2 <= 0) { ok = false; break; }
      const h = Math.sqrt(h2);
      const cx = A[0] - off[0];
      lo = Math.max(lo, cx - h);
      hi = Math.min(hi, cx + h);
    }
    if (ok && lo <= hi) return [clamp(xWant, lo, hi), y, zWant];
  }
  return [xWant, yWant + 60, zWant];
}

/**
 * 든 다리: 고관절에서 허벅지 각도(0 아래, 90 앞 수평)·무릎 굽힘·발끝 내림으로 발 목표를 만든다.
 * legYaw: 다리를 드는 방향(월드 yaw). 반환 pole = 무릎 방향 힌트.
 */
export function liftLeg(b: Build, hip: V3, legYaw: number, thigh: number, knee: number, footDown: number, side = 0): { f: FootTarget; pole: V3; knee: V3 } {
  const fy = legYaw * D2R;
  const fw: V3 = [Math.sin(fy), 0, Math.cos(fy)];
  const lat: V3 = [Math.cos(fy), 0, -Math.sin(fy)];
  const dirAt = (a: number): V3 => vadd(vadd(vmul(fw, Math.sin(a * D2R)), [0, Math.cos(a * D2R), 0]), vmul(lat, side));
  const K = vadd(hip, vmul(dirAt(thigh), b.thigh));
  const A = vadd(K, vmul(dirAt(thigh - knee), b.shin));
  return { f: ballFromAnkle(b, A, legYaw, footDown, 0), pole: dirAt(thigh), knee: K };
}

/** 키 목록을 만들기 쉽게 — 직전 키를 복사해 고쳐 쓴다 */
export class KeyList {
  keys: Key[] = [];
  last: Pose3;
  constructor(first: Pose3, t = 0) { this.last = first; this.keys.push({ t, p: first }); }
  add(t: number, edit: (p: Pose3) => void): Pose3 {
    const p = clonePose(this.last);
    edit(p);
    this.keys.push({ t, p });
    this.last = p;
    return p;
  }
  track(): Track { return new Track(this.keys); }
}

/** 반복 재생 래퍼: dur 이후 멈춤, 끝에서 사라졌다가 처음에 나타남 */
export function looped(track: Track, dur: number, loop: number, fadeIn = 0.12, fadeOut = 0.2, extra?: (t: number, p: Pose3) => void) {
  return (t: number): Pose3 => {
    const tt = clamp(t, 0, loop);
    const p = track.at(Math.min(tt, dur));
    let fade = 1;
    if (tt < fadeIn) fade = tt / fadeIn;
    if (tt > loop - fadeOut) fade = Math.max(0, (loop - tt) / fadeOut);
    p.fade = fade;
    if (extra) extra(tt, p);
    return p;
  };
}

export const len3 = vlen;
export const lerp3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
