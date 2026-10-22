// 공용 뼈대(rig) — 옆모습 2D 관절 + 몸통 3D 링 배치.
// 자세(Pose)의 각도(도)를 받아 모든 관절의 화면 좌표(cm, 바닥 y=0, 위쪽 음수)를 계산한다.
//
// 각도 규약: 0 = 아래, +90 = 앞(캐릭터가 보는 쪽). 캐릭터는 기본으로 화면 오른쪽을 본다.
// 팔: sh 는 몸통(가슴) 기준 위팔 각도, el 은 팔꿈치 굽힘(+ 앞으로 접힘), wr 은 손목.
// 다리: hip 은 골반 기준 허벅지 각도(+ 앞으로 듦), knee 는 무릎 굽힘(+ 뒤로 접힘), ankle 은 발등 펴기(+ 발끝 내림).
// 부위 앞뒤: 화면 쪽(가까운 쪽) = 캐릭터 오른쪽(R). 왼쪽을 보게 그릴 땐 figure 가 거울 쌍둥이로 처리.

import type { Build, Pose, Side } from './types';
import type { P, V3 } from './geom';
import { add, mul, dir, lerp, D2R, rot } from './geom';
import { torsoModel } from './torso';
import type { TorsoModel } from './torso';

export interface Joints {
  tm: TorsoModel;
  /** 몸통 높이 y(목밑 0 → 골반) 의 척추 위치·방향(위쪽 단위벡터)·앞쪽 단위벡터·yaw */
  spineAt: (y: number) => { p: P; up: P; fwd: P; yaw: number };
  hip: P;
  neck: P;          // 목 밑 (흉골 위)
  headO: P;         // 머리 원점(귓구멍 가운데) — 머리 그림의 기준점
  headAngle: number; // 머리 기울기(화면, 0 = 똑바로)
  shoulder: Record<Side, P>;
  elbow: Record<Side, P>;
  wrist: Record<Side, P>;
  hand: Record<Side, P>; // 손바닥 중심
  hipJ: Record<Side, P>;
  knee: Record<Side, P>;
  ankle: Record<Side, P>;
  heel: Record<Side, P>;
  toe: Record<Side, P>;
  a: {
    upper: Record<Side, number>; fore: Record<Side, number>; hand: Record<Side, number>;
    thigh: Record<Side, number>; shin: Record<Side, number>; foot: Record<Side, number>;
    pelvis: number; lumbar: number; chest: number; neck: number;
  };
  /** 배트 손잡이·끝, 글러브 중심 (부착점) */
  batGrip: P | null; batTip: P | null; gloveC: P | null;
  neckLen: number; // 머리 모형 기준 목 길이
}

const SIDES: Side[] = ['R', 'L'];
/** 캐릭터 쪽 → 몸 좌표 X 부호 (왼쪽 +) */
export const sideX = (s: Side) => (s === 'L' ? 1 : -1);

export function solveRig(b: Build, pose: Pose, tmIn?: TorsoModel): Joints {
  const tm = tmIn ?? torsoModel(b);
  const ky = tm.ky;
  const yHip = tm.yHip;
  const yL = 40 * ky, yT = 17 * ky;
  const aP = pose.pelvis, aS = pose.pelvis + pose.spine, aC = pose.pelvis + pose.spine + pose.chest;
  const hip: P = [pose.root[0], pose.root[1]];
  // 척추 세 마디: 골반(hip→L), 허리(L→T), 가슴(T→N). 각 마디 방향 = 위쪽을 앞으로 기울임
  const upv = (lean: number): P => [Math.sin(lean * D2R), -Math.cos(lean * D2R)];
  const L = add(hip, mul(upv(aP), yHip - yL));
  const T = add(L, mul(upv(aS), yL - yT));
  const N = add(T, mul(upv(aC), yT));
  const yawAt = (y: number) => (y >= yL ? pose.hipYaw : y <= yT ? pose.chestYaw : lerp(pose.chestYaw, pose.hipYaw, (y - yT) / (yL - yT)));
  const leanK: [number, number][] = [[0, aC], [yT, (aS + aC) / 2], [(yT + yL) / 2, aS], [yL, (aP + aS) / 2], [yHip, aP]];
  const leanAt = (y: number) => {
    for (let i = 0; i < leanK.length - 1; i++) {
      if (y <= leanK[i + 1][0]) return lerp(leanK[i][1], leanK[i + 1][1], Math.max(0, (y - leanK[i][0]) / (leanK[i + 1][0] - leanK[i][0])));
    }
    return aP;
  };
  const spineAt = (y: number) => {
    // y: 0(목밑) … yHip(고관절) … 그 아래도 연장
    let p: P;
    if (y >= yL) p = add(hip, mul(upv(aP), yHip - y));
    else if (y >= yT) p = add(L, mul(upv(aS), yL - y));
    else p = add(T, mul(upv(aC), yT - y));
    const up = upv(leanAt(y));
    return { p, up, fwd: [-up[1], up[0]] as P, yaw: yawAt(y) };
  };
  const place = (v: V3, y: number): P => {
    const s = spineAt(y);
    const yaw = s.yaw * D2R;
    const sx = v[0] * Math.cos(yaw) + v[2] * Math.sin(yaw);
    // 링 평면은 척추에 수직 — 높이 차(v[1]-y)는 척추 방향으로
    return add(add(s.p, mul(s.fwd, sx)), mul(s.up, -(v[1] - y)));
  };
  const shoulder = {} as Record<Side, P>, elbow = {} as Record<Side, P>, wrist = {} as Record<Side, P>, hand = {} as Record<Side, P>;
  const hipJ = {} as Record<Side, P>, knee = {} as Record<Side, P>, ankle = {} as Record<Side, P>, heel = {} as Record<Side, P>, toe = {} as Record<Side, P>;
  const A = {
    upper: {} as Record<Side, number>, fore: {} as Record<Side, number>, hand: {} as Record<Side, number>,
    thigh: {} as Record<Side, number>, shin: {} as Record<Side, number>, foot: {} as Record<Side, number>,
    pelvis: aP, lumbar: aS, chest: aC, neck: aC + pose.neck,
  };
  for (const s of SIDES) {
    const sj = tm.shoulderJ(sideX(s) as 1 | -1);
    shoulder[s] = place(sj, sj[1]);
    const arm = pose.arm[s];
    A.upper[s] = aC + arm.sh;
    A.fore[s] = A.upper[s] + arm.el;
    A.hand[s] = A.fore[s] + arm.wr;
    elbow[s] = add(shoulder[s], mul(dir(A.upper[s]), b.upperArm));
    wrist[s] = add(elbow[s], mul(dir(A.fore[s]), b.foreArm));
    hand[s] = add(wrist[s], mul(dir(A.hand[s]), b.hand * 0.42));
    const hj = tm.hipJ(sideX(s) as 1 | -1);
    hipJ[s] = place(hj, hj[1]);
    const leg = pose.leg[s];
    A.thigh[s] = aP + leg.hip;
    A.shin[s] = A.thigh[s] - leg.knee;
    A.foot[s] = A.shin[s] + 90 - leg.ankle;
    knee[s] = add(hipJ[s], mul(dir(A.thigh[s]), b.thigh));
    ankle[s] = add(knee[s], mul(dir(A.shin[s]), b.shin));
    const fd = dir(A.foot[s]);
    const down = rot(fd, -90); // 발바닥 쪽
    heel[s] = add(add(ankle[s], mul(fd, -b.footL * 0.24)), mul(down, b.ankleH));
    toe[s] = add(add(ankle[s], mul(fd, b.footL * 0.76)), mul(down, b.ankleH));
  }
  // 목·머리
  const hs = b.headScale;
  const neckLen = b.neckL / hs;
  const aN = aC + pose.neck;
  // 머리 기울기: 척추와 같은 규약(+ = 정수리가 앞으로). SVG rotate(+) 와 같은 방향
  const headAngle = aN + pose.head;
  // 머리 원점(대략) — 정확한 위치는 figure 가 머리 yaw 투영으로 다시 맞춘다
  const headO = add(N, mul(upv(aN), neckLen * hs));
  let batGrip: P | null = null, batTip: P | null = null;
  if (pose.bat) {
    const hs2 = pose.bat.side;
    batGrip = add(hand[hs2], mul(dir(A.hand[hs2] + 90), 0.6));
    batTip = add(batGrip, mul(dir(pose.bat.angle), 84));
  }
  const gloveC = pose.glove ? add(wrist[pose.glove], mul(dir(A.hand[pose.glove]), b.hand * 0.75)) : null;
  return {
    tm, spineAt, hip, neck: N, headO, headAngle,
    shoulder, elbow, wrist, hand, hipJ, knee, ankle, heel, toe, a: A, batGrip, batTip, gloveC, neckLen,
  };
}

/** 발이 바닥(y=0)에 닿도록 root 높이를 맞춘다 */
export function groundPose(b: Build, pose: Pose): Pose {
  const j = solveRig(b, pose);
  const low = Math.max(j.heel.R[1], j.heel.L[1], j.toe.R[1], j.toe.L[1]);
  return { ...pose, root: [pose.root[0], pose.root[1] - low] };
}

/** 2관절 IK: 시작점 a, 길이 l1, l2, 목표 t, 굽힘 방향(+1 앞으로/-1 뒤로) → [첫 마디 각도, 둘째 마디 상대 각도] */
export function ik2(a: P, l1: number, l2: number, t: P, bend: 1 | -1): [number, number] {
  const dx = t[0] - a[0], dy = t[1] - a[1];
  const d = Math.min(l1 + l2 - 1e-3, Math.max(Math.abs(l1 - l2) + 1e-3, Math.hypot(dx, dy)));
  const base = Math.atan2(dx, dy) / D2R;
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const A = Math.acos(Math.max(-1, Math.min(1, cosA))) / D2R;
  const cosB = (l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2);
  const B = 180 - Math.acos(Math.max(-1, Math.min(1, cosB))) / D2R;
  return [base - bend * A, bend * B];
}
