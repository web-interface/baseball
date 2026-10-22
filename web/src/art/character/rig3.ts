// 3D 뼈대 — 투구·타격처럼 몸이 카메라 쪽 ↔ 옆 ↔ 등 쪽으로 크게 도는 동작용.
// 기존 rig.ts(옆모습 2D)와 같은 몸 모형(torsoModel)·체격(Build)을 쓰고, 관절만 3D 로 푼 뒤 정사영한다.
//
// 월드 좌표(cm): x = 화면 오른쪽(투수 → 홈, 타자 → 투수 방향), y = 아래(바닥 0, 위는 음수), z = 카메라 쪽.
// 몸 회전 yaw: 0 = 카메라를 봄, 90 = 화면 오른쪽을 봄(가까운 쪽 = 캐릭터 오른쪽 R) — head/portrait 의 cam 규약과 같다.
// pitch: + = 위쪽이 앞으로 숙음. roll: + = 위쪽이 캐릭터 왼쪽으로 기욺.
// 몸 기준 축: l = 캐릭터 왼쪽, d = 아래, f = 앞.  (l × d = f)

import type { Build, HandShape, Side } from './types';
import type { V3 } from './geom';
import { D2R, clamp, lerp, smooth01, vadd, vsub, vmul, vdot, vnorm, vlen, vcross } from './geom';
import { torsoModel } from './torso';
import type { TorsoModel } from './torso';

export interface Rot3 { yaw: number; pitch: number; roll: number }
export interface Axes { l: V3; d: V3; f: V3 }

export function axesOf(yaw: number, pitch: number, roll: number): Axes {
  const t = yaw * D2R, a = pitch * D2R, b = roll * D2R;
  const ct = Math.cos(t), st = Math.sin(t), ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
  // yaw → pitch(왼쪽 축 둘레) → roll(앞 축 둘레)
  const l0: V3 = [ct, 0, -st], f0: V3 = [st, 0, ct];
  const f1: V3 = [f0[0] * ca, sa, f0[2] * ca];
  const d1: V3 = [-f0[0] * sa, ca, -f0[2] * sa];
  return {
    l: [l0[0] * cb + d1[0] * sb, d1[1] * sb, l0[2] * cb + d1[2] * sb],
    d: [d1[0] * cb - l0[0] * sb, d1[1] * cb, d1[2] * cb - l0[2] * sb],
    f: f1,
  };
}

/** 몸 기준 좌표(X 왼쪽, Y 아래, Z 앞) → 월드 */
export const toWorld = (o: V3, a: Axes, x: number, y: number, z: number): V3 => [
  o[0] + a.l[0] * x + a.d[0] * y + a.f[0] * z,
  o[1] + a.l[1] * x + a.d[1] * y + a.f[1] * z,
  o[2] + a.l[2] * x + a.d[2] * y + a.f[2] * z,
];
export const dirWorld = (a: Axes, v: V3): V3 => toWorld([0, 0, 0], a, v[0], v[1], v[2]);
export const toLocal = (o: V3, a: Axes, p: V3): V3 => { const v = vsub(p, o); return [vdot(v, a.l), vdot(v, a.d), vdot(v, a.f)]; };

/** 손: 목밑(N) 기준 가슴 좌표의 손목 위치 + 팔꿈치가 향할 방향 */
export interface HandTarget { p: V3; pole: V3; shape: HandShape; rot: number }
/** 발: 월드 좌표의 앞꿈치(볼) 위치, 발끝 방향(yaw), 뒤꿈치 들기(lift, + 뒤꿈치 올라감), 발가락 꺾임(toe: 1 = 발가락은 바닥에 평평) */
export interface FootTarget { p: V3; yaw: number; lift: number; toe: number }
/** 배트: 노브(손잡이 끝) 월드 위치, 방향 az(0 카메라 쪽, 90 화면 오른쪽), el(위로 +) */
export interface Bat3 { knob: V3; az: number; el: number }

export interface Pose3 {
  root: V3;                  // 골반 가운데(고관절 높이)
  pelvis: Rot3;
  chest: Rot3;
  neck: number;              // 목 숙임(가슴 기준)
  head: number;              // 머리 기울기 추가(화면)
  hand: Record<Side, HandTarget>;
  foot: Record<Side, FootTarget>;
  knee: Record<Side, V3>;    // 무릎이 향할 방향(월드)
  bat: Bat3 | null;
  /** 배트 위 손(top hand) — 우타 = R */
  batTop: Side;
  /** 노브에서 아래 손·위 손까지(cm) */
  grip: [number, number];
  /** 배트를 놓은 손(한 손 팔로스루) */
  batFree: Side | null;
  glove: Side | null;
  ballHand: Side | null;     // 공을 쥔 손
  ball: V3 | null;           // 손을 떠난 공
  fade: number;              // 1 = 보임 (반복 재생 이음새)
  mask: boolean;             // 포수 마스크 씀
}

export interface Joints3 {
  tm: TorsoModel;
  /** 몸통 높이 y(목밑 0 → 아래 +)의 척추 점과 축 */
  spine: (y: number) => { p: V3; a: Axes };
  pelvisAx: Axes; chestAx: Axes;
  root: V3; neck: V3; headUp: V3;
  shoulder: Record<Side, V3>; elbow: Record<Side, V3>; wrist: Record<Side, V3>; palm: Record<Side, V3>;
  hip: Record<Side, V3>; knee: Record<Side, V3>; ankle: Record<Side, V3>;
  heel: Record<Side, V3>; ballF: Record<Side, V3>; toe: Record<Side, V3>;
  footAx: Record<Side, { d: V3; u: V3; t: V3 }>;
  batKnob: V3 | null; batTip: V3 | null; batDir: V3 | null;
  reach: Record<Side, number>; // 손목 목표까지 모자란 거리(0 = 닿음)
}

export const SIDES: Side[] = ['R', 'L'];
export const sgn = (s: Side) => (s === 'L' ? 1 : -1); // 몸 X 부호 (왼쪽 +)
export const other = (s: Side): Side => (s === 'R' ? 'L' : 'R');

/** 2관절 IK (3D): 시작 a, 길이 l1·l2, 목표 t, 가운데 관절이 향할 방향 pole → 가운데·끝 */
export function ik3(a: V3, l1: number, l2: number, t: V3, pole: V3): { mid: V3; end: V3; short: number } {
  const d = vsub(t, a);
  const dist0 = vlen(d);
  const dn: V3 = dist0 > 1e-6 ? vmul(d, 1 / dist0) : [0, 1, 0];
  const maxR = l1 + l2 - 0.02, minR = Math.abs(l1 - l2) + 0.5;
  const dist = clamp(dist0, minR, maxR);
  const x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  let pp = vsub(pole, vmul(dn, vdot(pole, dn)));
  if (vlen(pp) < 1e-5) pp = vlen(vcross(dn, [0, 0, 1])) > 0.1 ? vcross(dn, [0, 0, 1]) : vcross(dn, [1, 0, 0]);
  pp = vnorm(pp);
  return { mid: vadd(a, vadd(vmul(dn, x), vmul(pp, h))), end: vadd(a, vmul(dn, dist)), short: Math.max(0, dist0 - maxR) };
}

/** 발 축: 발끝 방향 d(뒤꿈치→발끝), 발등 위 u, 발가락 방향 t */
export function footAxes(f: FootTarget): { d: V3; u: V3; t: V3 } {
  const y = f.yaw * D2R, a = f.lift * D2R;
  const h: V3 = [Math.sin(y), 0, Math.cos(y)];
  const d: V3 = [h[0] * Math.cos(a), Math.sin(a), h[2] * Math.cos(a)];
  const u: V3 = [h[0] * Math.sin(a), -Math.cos(a), h[2] * Math.sin(a)];
  const at = (f.lift - f.toe * Math.max(0, f.lift)) * D2R; // 뒤꿈치를 들어도 발가락은 바닥에
  const t: V3 = [h[0] * Math.cos(at), Math.sin(at), h[2] * Math.cos(at)];
  return { d, u, t };
}

/** 발 앞꿈치(볼)의 발 길이 비율 위치 — 뒤꿈치 0, 발끝 1 */
export const BALL_T = 0.72;

export function anklePos(b: Build, f: FootTarget): V3 {
  const ax = footAxes(f);
  const L = b.footL;
  // 발목 = 뒤꿈치에서 0.24L 앞, 바닥에서 ankleH 위
  return vadd(vadd(f.p, vmul(ax.d, -(BALL_T - 0.24) * L)), vmul(ax.u, b.ankleH));
}

/** 바닥 위 발 하나를 발목 위치에서 거꾸로: 주어진 발목에 맞는 앞꿈치 위치 */
export function ballFromAnkle(b: Build, ankle: V3, yaw: number, lift: number, toe = 0): FootTarget {
  const f: FootTarget = { p: [0, 0, 0], yaw, lift, toe };
  const a0 = anklePos(b, f);
  return { p: vsub(ankle, a0), yaw, lift, toe };
}

// 척추 높이별 보간 가중치: 0 = 가슴 축, 1 = 골반 축
function spineW(y: number, yT: number, yL: number): number {
  return smooth01((y - yT * 0.55) / (yL * 1.08 - yT * 0.55));
}

export function solve3(b: Build, pose: Pose3, tmIn?: TorsoModel): Joints3 {
  const tm = tmIn ?? torsoModel(b);
  const ky = tm.ky;
  const yHip = tm.yHip, yL = 40 * ky, yT = 17 * ky;
  const P = pose.pelvis, C = pose.chest;
  const pelvisAx = axesOf(P.yaw, P.pitch, P.roll);
  const chestAx = axesOf(C.yaw, C.pitch, C.roll);
  // 척추: 아래(골반)에서 위로 적분. 높이 표 y0..y1, 1cm 남짓 간격
  const y0 = -11 * ky, y1 = 62 * ky, N = 48;
  const step = (y1 - y0) / N;
  const axAt: Axes[] = new Array(N + 1);
  const pos: V3[] = new Array(N + 1);
  for (let i = 0; i <= N; i++) {
    const y = y0 + i * step;
    const w = spineW(y, yT, yL);
    axAt[i] = w >= 0.999 ? pelvisAx : w <= 0.001 ? chestAx : axesOf(lerp(C.yaw, P.yaw, w), lerp(C.pitch, P.pitch, w), lerp(C.roll, P.roll, w));
  }
  const iHip = (yHip - y0) / step;
  const i0 = Math.floor(iHip);
  // 고관절 높이(분수 위치) 기준으로 위아래 적분
  const fr = iHip - i0;
  pos[i0] = vadd(pose.root, vmul(axAt[i0].d, -fr * step));
  for (let i = i0 - 1; i >= 0; i--) {
    const a = axAt[i], c = axAt[i + 1];
    pos[i] = vsub(pos[i + 1], vmul(vadd(a.d, c.d), step / 2));
  }
  for (let i = i0 + 1; i <= N; i++) {
    const a = axAt[i], c = axAt[i - 1];
    pos[i] = vadd(pos[i - 1], vmul(vadd(a.d, c.d), step / 2));
  }
  const spine = (y: number) => {
    const fi = clamp((y - y0) / step, 0, N);
    const i = Math.min(N - 1, Math.floor(fi));
    const t = fi - i;
    const A = axAt[i], B = axAt[i + 1];
    const p = vadd(vmul(pos[i], 1 - t), vmul(pos[i + 1], t));
    if (A === B) return { p, a: A };
    return { p, a: { l: vnorm(vadd(vmul(A.l, 1 - t), vmul(B.l, t))), d: vnorm(vadd(vmul(A.d, 1 - t), vmul(B.d, t))), f: vnorm(vadd(vmul(A.f, 1 - t), vmul(B.f, t))) } };
  };
  const nk = spine(0);
  const neck = nk.p;
  const shoulder = {} as Record<Side, V3>, elbow = {} as Record<Side, V3>, wrist = {} as Record<Side, V3>, palm = {} as Record<Side, V3>;
  const hip = {} as Record<Side, V3>, knee = {} as Record<Side, V3>, ankle = {} as Record<Side, V3>;
  const heel = {} as Record<Side, V3>, ballF = {} as Record<Side, V3>, toe = {} as Record<Side, V3>;
  const footAx = {} as Record<Side, { d: V3; u: V3; t: V3 }>;
  const reach = { R: 0, L: 0 } as Record<Side, number>;
  const sY = tm.shoulderJ(1)[1];
  const sh = spine(sY);
  for (const s of SIDES) {
    const sj = tm.shoulderJ(sgn(s) as 1 | -1);
    shoulder[s] = toWorld(sh.p, sh.a, sj[0], 0, sj[2]);
    const hj = tm.hipJ(sgn(s) as 1 | -1);
    hip[s] = toWorld(pose.root, pelvisAx, hj[0], 0, hj[2]);
  }
  // 배트 → 두 손 목표
  let batKnob: V3 | null = null, batTip: V3 | null = null, batDir: V3 | null = null;
  const handW = {} as Record<Side, V3>;
  const handPole = {} as Record<Side, V3>;
  for (const s of SIDES) {
    const h = pose.hand[s];
    handW[s] = toWorld(neck, chestAx, h.p[0], h.p[1], h.p[2]);
    handPole[s] = dirWorld(chestAx, h.pole);
  }
  const armL = b.upperArm + b.foreArm;
  if (pose.bat) {
    const az = pose.bat.az * D2R, el = pose.bat.el * D2R;
    batDir = [Math.cos(el) * Math.sin(az), -Math.sin(el), Math.cos(el) * Math.cos(az)];
    let knob = pose.bat.knob;
    const top = pose.batTop, bot = other(top);
    const gripOf = (s: Side, k: V3) => vadd(k, vmul(batDir!, s === top ? pose.grip[1] : pose.grip[0]));
    // 손목은 손잡이에서 어깨 쪽으로 손 반 길이만큼
    const wristOf = (s: Side, k: V3) => { const g = gripOf(s, k); return vadd(g, vmul(vnorm(vsub(shoulder[s], g)), b.hand * 0.3)); };
    // 두 손이 닿도록 배트 전체를 끌어당김 (배트는 굳은 몸)
    for (let it = 0; it < 4; it++) {
      let shift: V3 = [0, 0, 0];
      let n = 0;
      for (const s of [bot, top]) {
        if (pose.batFree === s) continue;
        const w = wristOf(s, knob);
        const v = vsub(shoulder[s], w);
        const dd = vlen(v);
        const ex = dd - armL * 0.985;
        if (ex > 0) { shift = vadd(shift, vmul(v, ex / dd)); n++; }
      }
      if (!n) break;
      knob = vadd(knob, vmul(shift, 1 / n));
    }
    batKnob = knob;
    batTip = vadd(knob, vmul(batDir, 84));
    for (const s of SIDES) {
      if (pose.batFree === s) continue;
      handW[s] = wristOf(s, knob);
    }
  }
  for (const s of SIDES) {
    const r = ik3(shoulder[s], b.upperArm, b.foreArm, handW[s], handPole[s]);
    elbow[s] = r.mid;
    wrist[s] = r.end;
    reach[s] = r.short;
    const fd = vnorm(vsub(r.end, r.mid));
    palm[s] = vadd(r.end, vmul(fd, b.hand * 0.42));
    // 다리
    const f = pose.foot[s];
    const fa = footAxes(f);
    footAx[s] = fa;
    const aT = anklePos(b, f);
    const lg = ik3(hip[s], b.thigh, b.shin, aT, pose.knee[s]);
    knee[s] = lg.mid;
    ankle[s] = lg.end;
    // 발은 실제 발목(닿지 못했으면 당겨진 위치) 기준으로 다시 놓는다
    const off = vsub(lg.end, aT);
    ballF[s] = vadd(f.p, off);
    heel[s] = vadd(ballF[s], vmul(fa.d, -BALL_T * b.footL));
    toe[s] = vadd(ballF[s], vmul(fa.t, (1 - BALL_T) * b.footL));
  }
  const n = pose.neck * D2R;
  const up = vmul(chestAx.d, -1);
  const headUp = vnorm(vadd(vmul(up, Math.cos(n)), vmul(chestAx.f, Math.sin(n))));
  return {
    tm, spine, pelvisAx, chestAx, root: pose.root, neck, headUp,
    shoulder, elbow, wrist, palm, hip, knee, ankle, heel, ballF, toe, footAx,
    batKnob, batTip, batDir, reach,
  };
}

/** 어깨의 가슴 좌표 (목밑 기준) — 손 위치를 정할 때 기준점 */
export function shoulderLocal(tm: TorsoModel, s: Side): V3 {
  const sj = tm.shoulderJ(sgn(s) as 1 | -1);
  return [sj[0], sj[1], sj[2]];
}
