// 경기장 좌표 — 위에서 본 정사각형 0~1. 홈 (0.5, 1), 좌·우 폴 (0, 0.5)·(1, 0.5), 1 = 140m.
// ui/Field.tsx 가 이 좌표로 그림을 그리고, 라인업·경기 화면이 같은 좌표에 선수·타구를 올린다.
// 담장은 '좌폴 · 중앙 · 우폴' 세 점을 지나는 원호 (실제 구장처럼 2루 뒤쪽이 중심).
import type { Pos } from './types';

export const FIELD_M = 140;

/** 포지션 기본 자리 (수비 위치) */
export const FIELD_SPOTS: Record<Pos, { x: number; y: number }> = {
  P: { x: 0.5, y: 0.8 },
  C: { x: 0.5, y: 0.965 },
  '1B': { x: 0.665, y: 0.735 },
  '2B': { x: 0.595, y: 0.625 },
  SS: { x: 0.405, y: 0.625 },
  '3B': { x: 0.335, y: 0.735 },
  LF: { x: 0.215, y: 0.43 },
  CF: { x: 0.5, y: 0.285 },
  RF: { x: 0.785, y: 0.43 },
  DH: { x: 0.11, y: 0.93 },
};

/** 베이스 (1루·2루·3루·홈) — 베이스 사이 27.43m */
export const BASES = {
  home: { x: 0.5, y: 1 },
  first: { x: 0.5 + 27.43 * Math.SQRT1_2 / FIELD_M, y: 1 - 27.43 * Math.SQRT1_2 / FIELD_M },
  second: { x: 0.5, y: 1 - 27.43 * Math.SQRT2 / FIELD_M },
  third: { x: 0.5 - 27.43 * Math.SQRT1_2 / FIELD_M, y: 1 - 27.43 * Math.SQRT1_2 / FIELD_M },
  mound: { x: 0.5, y: 1 - 18.44 / FIELD_M },
};

/** 미터(홈 원점, x 오른쪽, y 중견 쪽) → 경기장 좌표 */
export const mToField = (x: number, y: number) => ({ x: 0.5 + x / FIELD_M, y: 1 - y / FIELD_M });

/** 각도(0 = 중견, −45 = 3루 선)·거리(m) → 경기장 좌표 */
export function polarToField(angleDeg: number, distM: number) {
  const a = (angleDeg * Math.PI) / 180;
  return mToField(distM * Math.sin(a), distM * Math.cos(a));
}

/** 담장 원 — 좌폴·중앙·우폴을 지나는 원의 중심(m)과 반지름 */
export function fenceCircle(fence: [number, number, number]) {
  const s = Math.SQRT1_2;
  const A = [-fence[0] * s, fence[0] * s];
  const B = [0, fence[1]];
  const C = [fence[2] * s, fence[2] * s];
  const d = 2 * (A[0] * (B[1] - C[1]) + B[0] * (C[1] - A[1]) + C[0] * (A[1] - B[1]));
  const a2 = A[0] ** 2 + A[1] ** 2, b2 = B[0] ** 2 + B[1] ** 2, c2 = C[0] ** 2 + C[1] ** 2;
  const cx = (a2 * (B[1] - C[1]) + b2 * (C[1] - A[1]) + c2 * (A[1] - B[1])) / d;
  const cy = (a2 * (C[0] - B[0]) + b2 * (A[0] - C[0]) + c2 * (B[0] - A[0])) / d;
  return { cx, cy, r: Math.hypot(A[0] - cx, A[1] - cy) };
}

/** 그 각도로 날아간 공이 담장에 닿는 거리(m) — 홈런 판정·원인 표시용 */
export function fenceAt(fence: [number, number, number], angleDeg: number) {
  const { cx, cy, r } = fenceCircle(fence);
  const a = (angleDeg * Math.PI) / 180;
  const ux = Math.sin(a), uy = Math.cos(a);
  // |t·u − c| = r  →  t² − 2t(u·c) + |c|² − r² = 0
  const uc = ux * cx + uy * cy;
  const disc = uc * uc - (cx * cx + cy * cy - r * r);
  return uc + Math.sqrt(Math.max(0, disc));
}

/** 담장 점들 (경기장 좌표) — 안쪽으로 inset m 만큼 들인 선도 */
export function fencePoints(fence: [number, number, number], inset = 0, steps = 48) {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const ang = -45 + (90 * i) / steps;
    pts.push(polarToField(ang, fenceAt(fence, ang) - inset));
  }
  return pts;
}
