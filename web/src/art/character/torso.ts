// 몸통 3D 모형 — 머리와 같은 '단면 링' 방식. 원점 = 목 밑 중심(흉골 위 높이), X 왼쪽(+), Y 아래, Z 앞.
// 체격(Build) 값으로 어깨·가슴·배·엉덩이 단면이 바뀐다. 카드 초상(정면~3/4)과 옆모습 전신이 같이 쓴다.

import type { Build } from './types';
import type { P, V3 } from './geom';
import { crSample, lerp, spline1, D2R } from './geom';

export interface TorsoLevel { y: number; ring: P[]; cz: number }
export interface TorsoModel {
  b: Build;
  lv: TorsoLevel[];
  ky: number; // 길이 배율 (기준 53cm → 실제)
  shoulderJ: (s: 1 | -1) => V3;
  hipJ: (s: 1 | -1) => V3;
  yHip: number;
  yBelt: number;
  /** 몸 표면 (각도 φ, 높이 y) */
  surf: (phi: number, y: number, off?: number) => V3;
  frontZ: (X: number, y: number) => number;
  /** 높이 y 에서 몸통 반폭(가장 넓은 X) */
  halfW: (y: number) => number;
}

const PER = 6;

/**
 * 목둘레(칼라) 3D 고리 — 몸통 좌표. r: 목에서 띄우는 거리, yFront/yBack: 앞/뒤 높이,
 * vDepth: 앞쪽 V 깊이(0 = 둥근 크루넥), vHalf: V 가 시작하는 각도.
 */
export function collarLoop(b: Build, tm: TorsoModel, r: number, yFront: number, yBack: number, vDepth: number, vHalf = 40): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < 72; i++) {
    const phi = -180 + i * 5;
    const c = Math.cos(phi * D2R), s = Math.sin(phi * D2R);
    let y = lerp(yFront, yBack, (1 - c) / 2);
    const a = Math.abs(phi);
    let X = (b.neckW + r) * s;
    let Z = (b.neckD + r) * c - 0.4;
    if (vDepth > 0 && a < vHalf) {
      const k = Math.pow(1 - a / vHalf, 1.1);
      y += vDepth * k;
      X *= 1 - 0.75 * k;
      Z = Math.max(Z, tm.frontZ(X, y) + 0.3);
    }
    out.push([X, y, Z]);
  }
  return out;
}

/**
 * 고리 중 카메라를 향한 쪽(목의 앞·옆)을 화면 점열로. 목 둘레 바깥 법선이 카메라를 향하는 구간을 고른다.
 * pr: 3D → [x, y, 깊이], yaw: 몸통 회전(도) — V넥처럼 고리가 오목해도 양 끝이 목 옆 실루엣에 오도록.
 */
export function frontArc(loop: V3[], pr: (p: V3) => V3, yaw = 0): P[] {
  const q = loop.map(pr);
  const n = q.length;
  const sy = Math.sin(yaw * D2R), cy = Math.cos(yaw * D2R);
  const facing = loop.map((p) => {
    // 목 중심(0, -0.4) 기준 바깥쪽 수평 법선
    const nx = p[0], nz = p[2] + 0.4;
    const l = Math.hypot(nx, nz) || 1;
    return (-nx * sy + nz * cy) / l;
  });
  // 가장 긴 '카메라를 향한' 연속 구간 (원형)
  let bestS = 0, bestL = 0;
  for (let s = 0; s < n; s++) {
    if (facing[s] <= 0 || facing[(s - 1 + n) % n] > 0) continue;
    let L = 0;
    while (L < n && facing[(s + L) % n] > 0) L++;
    if (L > bestL) { bestL = L; bestS = s; }
  }
  if (bestL === 0) { bestS = 0; bestL = n; }
  const out: P[] = [];
  // 양 끝을 하나씩 넓혀 실루엣 경계까지
  for (let k = -1; k <= bestL; k++) {
    const i = (bestS + k + n) % n;
    out.push([q[i][0], q[i][1]]);
  }
  // 왼쪽 → 오른쪽 순서로
  if (out[0][0] > out[out.length - 1][0]) out.reverse();
  return out;
}

export function torsoModel(b: Build, loose = 0): TorsoModel {
  const ky = b.torsoL / 53;
  const SH = b.shoulderHalf, CH = b.chestHalf, CF = b.chestFront, CB = b.chestBack;
  const WH = b.waistHalf, BL = b.belly, HH = b.hipHalf, BT = b.butt;
  const nw = b.neckW, nd = b.neckD;
  const mus = b.muscle;
  // [Y, Fz, Ax, Az, Bx, Bz, Cx, Cz, Kz]
  // 위쪽 세 단: 목 옆 승모근이 어깨로 흘러내리는 경사 (중심은 목 안쪽에 숨음 → 목이 덮는다)
  const trap = 1 + 0.35 * mus;
  const rows: number[][] = [
    [-9.0, nd * 0.05, nw * 0.7, -0.2, nw + 0.4, -1.6, nw * 0.8, -nd - 0.5, -nd - 0.7],
    [-6.3, nd * 0.25, nw * 0.95, nd * 0.1, nw + 3.6 * trap, -1.4, nw * 1.15, -nd - 1.2, -nd - 1.5],
    [-3.4, nd * 0.7, 6.8, nd * 0.55, lerp(nw + 3.6 * trap, SH - 4.2, 0.62), -1.2, 8.2, -CB * 0.78, -CB * 0.82],
    [-0.4, nd + 0.8, 8.8, nd + 0.5, SH - 3.9, -0.9, 9.6, -CB * 0.86, -CB * 0.88],
    [2.6, CF * 0.74, 9.9, CF * 0.7, SH - 2.5, -0.6, 10.6, -CB * 0.92, -CB * 0.93],
    [6.0, CF * 0.86, 10.2, CF * 0.82, SH - 2.6, -0.2, 11.2, -CB * 0.96, -CB * 0.95],
    [10.0, CF * 0.97, 10.4, CF * 0.94, CH, 0.4, 11.8, -CB * 0.97, -CB * 0.95],
    [17.0, CF * 1.0, 10.0, CF * 0.97, CH * 0.99, 0.7, 12.2, -CB * 0.95, -CB * 0.88],
    [25.0, Math.max(CF * 0.92, BL * 0.92), 9.4, Math.max(CF * 0.84, BL * 0.82), lerp(CH, WH, 0.5), 0.5, 11.6, -CB * 0.85, -CB * 0.76],
    [33.0, BL, 9.0, BL * 0.88, WH, 0.4, 10.8, -CB * 0.72, -CB * 0.62],
    [40.0, BL * 0.95, 9.4, BL * 0.84, lerp(WH, HH, 0.45), 0.0, 11.4, -BT * 0.66, -BT * 0.66],
    [47.0, lerp(BL, 9.2, 0.6), 9.8, lerp(BL, 8.4, 0.6), HH, -0.6, 12.8, -BT * 0.86, -BT * 0.93],
    [53.0, 8.6, 9.8, 7.6, HH, -1.2, 12.8, -BT * 0.97, -BT],
    [59.0, 6.2, 8.4, 5.6, HH * 0.94, -1.4, 11.8, -BT * 0.85, -BT * 0.8],
  ];
  const ys = rows.map((r) => r[0] * ky);
  const sp = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => spline1(ys, rows.map((r) => r[i])));
  const lv: TorsoLevel[] = [];
  const y0 = ys[0], y1 = ys[ys.length - 1];
  const N = 60;
  for (let i = 0; i <= N; i++) {
    const y = lerp(y0, y1, i / N);
    let [Fz, Ax, Az, Bx, Bz, Cx, Cz, Kz] = sp.map((s) => s(y));
    if (loose) { Fz += loose; Az += loose * 0.9; Ax += loose * 0.6; Bx += loose; Cx += loose * 0.6; Cz -= loose * 0.9; Kz -= loose; }
    const ctrl: P[] = [[0, Fz], [Ax, Az], [Bx, Bz], [Cx, Cz], [0, Kz], [-Cx, Cz], [-Bx, Bz], [-Ax, Az]];
    lv.push({ y, ring: crSample(ctrl, true, PER), cz: (Fz + Kz) / 2 });
  }
  const pair = (y: number): [TorsoLevel, TorsoLevel, number] => {
    const fl = ((y - y0) / (y1 - y0)) * N;
    const i = Math.max(0, Math.min(N - 1, Math.floor(fl)));
    return [lv[i], lv[i + 1], Math.max(0, Math.min(1, fl - i))];
  };
  const rayFar = (ring: P[], cz: number, ang: number) => {
    const dx = Math.sin(ang * D2R), dz = Math.cos(ang * D2R);
    let best = 0;
    for (let j = 0; j < ring.length; j++) {
      const a = ring[j], bb = ring[(j + 1) % ring.length];
      const ex = bb[0] - a[0], ez = bb[1] - a[1];
      const den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-9) continue;
      const ax = a[0], az = a[1] - cz;
      const t = (ax * ez - az * ex) / den;
      const u = (ax * dz - az * dx) / den;
      if (t > 0 && u >= -1e-6 && u <= 1 + 1e-6 && t > best) best = t;
    }
    return best;
  };
  const surf = (phi: number, y: number, off = 0): V3 => {
    const [a, bb, t] = pair(y);
    const cz = lerp(a.cz, bb.cz, t);
    const r = lerp(rayFar(a.ring, a.cz, phi), rayFar(bb.ring, bb.cz, phi), t) + off;
    return [r * Math.sin(phi * D2R), y, cz + r * Math.cos(phi * D2R)];
  };
  const frontZ = (X: number, y: number) => {
    const [a, bb, t] = pair(y);
    const fz = (L: TorsoLevel) => {
      let best = -Infinity;
      for (let j = 0; j < L.ring.length; j++) {
        const p = L.ring[j], q = L.ring[(j + 1) % L.ring.length];
        if ((p[0] - X) * (q[0] - X) <= 0 && p[0] !== q[0]) {
          const z = p[1] + ((q[1] - p[1]) * (X - p[0])) / (q[0] - p[0]);
          if (z > best) best = z;
        }
      }
      return best === -Infinity ? L.cz : best;
    };
    return lerp(fz(a), fz(bb), t);
  };
  const yHip = 53 * ky;
  const halfW = (y: number) => {
    const [a, bb, t] = pair(y);
    const mx = (L: TorsoLevel) => L.ring.reduce((m, p) => Math.max(m, Math.abs(p[0])), 0);
    return lerp(mx(a), mx(bb), t);
  };
  return {
    b, lv, ky, halfW,
    shoulderJ: (s) => [s * (SH - 3.3), 4.2 * ky, -0.8],
    hipJ: (s) => [s * (HH * 0.55), yHip, 0.8],
    yHip,
    yBelt: 40.5 * ky,
    surf,
    frontZ,
  };
}
