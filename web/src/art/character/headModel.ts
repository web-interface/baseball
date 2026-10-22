// 머리 3D 모형 — 높이별 가로 단면(링)을 쌓은 형태. 같은 모형을 정면·3/4·옆모습 어느 각도로도 투영한다.
// 좌표(cm): 원점 = 양쪽 귓구멍 가운데, X = 캐릭터 왼쪽(+), Y = 아래(+), Z = 앞(+).

import type { Appearance, Face } from './types';
import type { P, V3 } from './geom';
import { crSample, lerp, spline1, vcross, vnorm, vdot, vmul, vsub, D2R } from './geom';

const PER = 6;
export const RING_N = 8 * PER;

/** 기준 얼굴 단면표: Y, 앞중앙Z, A(x,z) 앞모서리, B(x,z) 최대폭, C(x,z) 뒤모서리, 뒤중앙Z */
const ROWS: number[][] = [
  [-13.1, 0.4, 0.6, 0.2, 0.8, -0.6, 0.6, -1.4, -1.6],
  [-12.4, 3.6, 2.9, 2.9, 4.4, -0.9, 3.4, -4.9, -5.8],
  [-10.8, 6.3, 4.5, 5.0, 6.5, -1.1, 5.1, -7.2, -8.5],
  [-8.4, 8.1, 5.2, 6.5, 7.5, -1.3, 6.0, -8.5, -9.9],
  [-6.0, 8.9, 5.5, 7.3, 7.7, -1.1, 6.3, -8.8, -10.3],
  [-3.9, 9.5, 5.7, 7.5, 7.6, -0.6, 6.4, -8.6, -10.1],
  [-2.2, 9.0, 6.0, 6.5, 7.5, -0.2, 6.3, -8.0, -9.4],
  [-0.4, 8.7, 6.1, 6.1, 7.3, 0.6, 6.1, -7.4, -8.7],
  [1.2, 8.6, 5.9, 6.0, 7.1, 1.8, 5.9, -6.4, -7.6],
  [2.9, 8.9, 5.4, 6.2, 6.6, 2.0, 5.6, -3.8, -4.6],
  [4.6, 9.3, 4.8, 6.4, 6.1, 2.2, 5.7, -0.9, -1.6],
  [6.2, 9.3, 4.2, 6.7, 5.8, 2.4, 5.7, -0.4, -0.6],
  [7.6, 9.0, 3.5, 7.2, 5.3, 2.6, 5.2, 0.3, 0.6],
  [8.8, 9.0, 2.6, 7.8, 3.8, 4.6, 3.2, 2.8, 2.8],
  [9.7, 8.6, 1.9, 7.9, 2.6, 6.2, 1.8, 5.0, 5.0],
  [10.3, 7.8, 0.9, 7.6, 1.2, 7.0, 0.8, 6.5, 6.4],
];

/** 목 단면: Y, 중심Z, 반폭, 앞깊이, 뒤깊이 */
const NECK_ROWS: number[][] = [
  [0.0, -2.4, 5.9, 5.4, 6.0],
  [3.0, -2.1, 5.8, 5.3, 6.1],
  [7.0, -1.5, 5.9, 5.2, 6.1],
  [11.0, -0.9, 6.1, 5.3, 6.1],
  [15.0, -0.5, 6.5, 5.4, 6.2],
  [18.5, -0.3, 7.2, 5.5, 6.4],
  [22.0, -0.2, 8.2, 5.6, 6.6],
  [26.0, -0.2, 9.2, 5.7, 6.8],
];

export interface Level { y: number; ring: P[]; cz: number; fz: number; polar: Float32Array }
export interface NeckLevel { y: number; cz: number; hw: number; f: number; b: number }

export interface HeadModel {
  face: Face;
  lv: Level[];
  yTop: number; yBot: number;
  mid: (y: number) => number; midY0: number; midY1: number;
  /** 머리카락·모자용 두피 표면 (뒤통수에서 목덜미로 이어짐), 중심 (0, SCZ) */
  scalp: { y: number; r: Float32Array }[];
  neck: NeckLevel[];
  ys: (y0: number) => number; // 기준 Y → 이 얼굴의 Y
  // 주요 위치 (이 얼굴 기준 Y/Z)
  eyeY: number; browY: number; noseTipY: number; tipZ: number; subY: number; mouthY: number; lipBotY: number; chinY: number;
}

export const SCZ = -1.0;
const POLAR_STEP = 2; // deg
const POLAR_N = 360 / POLAR_STEP;

/** 링(다각형)과 중심에서 나가는 광선의 가장 먼 교점까지 거리 */
function rayFar(ring: readonly P[], cx: number, cz: number, ang: number): number {
  const dx = Math.sin(ang * D2R), dz = Math.cos(ang * D2R);
  let best = 0;
  const n = ring.length;
  for (let j = 0; j < n; j++) {
    const a = ring[j], b = ring[(j + 1) % n];
    const ex = b[0] - a[0], ez = b[1] - a[1];
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-9) continue;
    const ax = a[0] - cx, az = a[1] - cz;
    const t = (ax * ez - az * ex) / den;
    const u = (ax * dz - az * dx) / den;
    if (t > 0 && u >= -1e-6 && u <= 1 + 1e-6 && t > best) best = t;
  }
  return best;
}

function polarOf(ring: readonly P[], cz: number): Float32Array {
  const out = new Float32Array(POLAR_N + 1);
  for (let k = 0; k <= POLAR_N; k++) out[k] = rayFar(ring, 0, cz, k * POLAR_STEP);
  return out;
}

const polarAt = (tab: Float32Array, phiDeg: number) => {
  let a = phiDeg % 360;
  if (a < 0) a += 360;
  const f = a / POLAR_STEP;
  const i = Math.floor(f);
  return lerp(tab[i], tab[Math.min(POLAR_N, i + 1)], f - i);
};

function neckRing(n: NeckLevel, steps = 36): P[] {
  const out: P[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const s = Math.sin(a), c = Math.cos(a);
    out.push([n.hw * s, n.cz + (c >= 0 ? n.f : n.b) * c]);
  }
  return out;
}

export function headModel(ap: Appearance, neckLen = 21.5): HeadModel {
  const f = ap.face;
  const ys = (y0: number) => {
    let y = y0 < -3.9 ? -3.9 + (y0 + 3.9) * f.foreheadH : -3.9 + (y0 + 3.9) * f.faceL;
    if (y0 > 7.6) {
      const g = -3.9 + 11.5 * f.faceL;
      y = g + (y - g) * f.chinL;
    }
    return y;
  };

  const kY: number[] = [];
  const cols: number[][] = [[], [], [], [], [], [], [], []];
  for (const row of ROWS) {
    const y0 = row[0];
    let [, Fz, Ax, Az, Bx, Bz, Cx, Cz, Kz] = row;
    if (y0 <= 1.2) {
      Ax *= lerp(1, f.headW, 0.5); Bx *= f.headW; Cx *= f.headW; Cz *= f.headD; Kz *= f.headD;
    }
    if (y0 === -3.9) { Fz += 0.5 * f.browRidge; Az += 0.45 * f.browRidge; }
    if (y0 === -6.0) { Fz += 0.12 * f.browRidge; }
    if (y0 >= -2.2 && y0 <= 7.6) { Az += 0.6 * (f.flat - 0.4); Fz -= 0.15 * f.flat; }
    if (y0 === -0.4 || y0 === 1.2) {
      Ax += 0.35 * f.cheekProm; Az += 0.4 * f.cheekProm;
      Bx = Bx * f.cheekW + 0.28 * f.cheekProm;
    }
    if (y0 >= 2.9 && y0 <= 6.2) {
      const k = (y0 - 2.9) / 3.3;
      Ax += 0.75 * f.cheekFull; Az += 0.3 * f.cheekFull;
      Bx = Bx * lerp(f.cheekW, f.jawW, k) + 0.55 * f.cheekFull * (1 - k * 0.4);
      Cx *= lerp(1, f.jawW, k);
    }
    if (y0 === 7.6) {
      Ax *= Math.sqrt(f.chinW);
      Bx *= f.jawW;
      Cx = lerp(Cx * 0.8, Bx * 0.985, f.jawSharp) * lerp(1, f.jawW, 0.3);
      Bx += 0.35 * f.cheekFull;
    }
    if (y0 >= 8.8) {
      Ax *= f.chinW; Bx *= f.chinW; Cx *= f.chinW;
      if (y0 === 8.8) { Bx += 1.1 * f.jawSharp * Math.max(0, f.jawW - 0.86); Cx += 0.8 * f.jawSharp * Math.max(0, f.jawW - 0.86); }
    }
    if (y0 >= 7.6) { Fz += 0.5 * f.chinProj; Az += 0.32 * f.chinProj; }
    kY.push(ys(y0));
    [Fz, Ax, Az, Bx, Bz, Cx, Cz, Kz].forEach((v, i) => cols[i].push(v));
  }
  const sp = cols.map((c) => spline1(kY, c));

  // 콧날·입술·턱의 옆선 (얼굴 가운데 세로선)
  const nl = f.noseL;
  const tipZ = 11.4 + 0.85 * f.noseProj + 0.18 * f.noseBulb;
  const ny = (y: number) => -2.4 + (y + 2.4) * nl;
  const subY0 = ny(3.95);
  const dl = subY0 - 3.95;
  const midRaw: [number, number][] = [
    [-6.0, 8.9 + 0.12 * f.browRidge],
    [-3.9, 9.5 + 0.5 * f.browRidge],
    [-2.4, 8.92 + 0.45 * f.noseRoot - 0.2 * f.flat + 0.22 * f.browRidge],
    [ny(-1.0), 9.45 + 0.55 * f.noseRoot - 0.15 * f.flat],
    [ny(0.7), 10.2 + 0.45 * f.noseRoot + 0.32 * f.noseBridge + 0.3 * f.noseProj],
    [ny(1.95), tipZ - 0.42 - 0.1 * f.noseBulb + 0.1 * f.noseBridge],
    [ny(2.65 - 0.22 * f.noseTip), tipZ],
    [ny(3.28 - 0.2 * f.noseTip), tipZ - 0.62 - 0.1 * f.noseBulb],
    [ny(3.66), tipZ - 1.5 - 0.22 * f.noseTip],
    [subY0, 9.42 - 0.1 * f.flat],
    [4.75 + dl * 0.6, 9.88 + 0.4 * (f.lipU - 1)],
    [5.55 + dl * 0.4 + 0.22 * f.mouthY, 9.52 + 0.22 * (f.lipU - 1)],
    [6.38 + dl * 0.3 + 0.18 * f.mouthY, 9.68 + 0.45 * (f.lipL - 1)],
    [7.4, 8.92 + 0.35 * f.chinProj],
    [8.6, 9.28 + 0.62 * f.chinProj],
    [9.7, 8.6 + 0.5 * f.chinProj],
    [10.3, 7.8 + 0.2 * f.chinProj],
  ];
  const midK = midRaw.map(([y, z]) => [ys(y), z] as [number, number]);
  const mid = spline1(midK.map((k) => k[0]), midK.map((k) => k[1]));

  const yTop = kY[0], yBot = kY[kY.length - 1];
  const lv: Level[] = [];
  const N = 72;
  for (let i = 0; i <= N; i++) {
    const y = lerp(yTop, yBot, i / N);
    const [Fz, Ax, Az, Bx, Bz, Cx, Cz, Kz] = sp.map((s) => s(y));
    const ctrl: P[] = [[0, Fz], [Ax, Az], [Bx, Bz], [Cx, Cz], [0, Kz], [-Cx, Cz], [-Bx, Bz], [-Ax, Az]];
    const ring = crSample(ctrl, true, PER);
    const cz = (Fz + Kz) / 2;
    lv.push({ y, ring, cz, fz: Fz, polar: polarOf(ring, cz) });
  }

  // 목
  const nwK = ap.build.neckW / 6.1 / ap.build.headScale;
  const ndK = ap.build.neckD / 5.6 / ap.build.headScale;
  const neck: NeckLevel[] = [];
  const nys = NECK_ROWS.map((r) => r[0]);
  const nsp = [1, 2, 3, 4].map((c) => spline1(nys, NECK_ROWS.map((r) => r[c])));
  const nEnd = Math.max(22, neckLen + 2.5);
  for (let y = 0; y <= nEnd + 0.01; y += 1.0) {
    const t = Math.min(1, y / 22);
    const wk = lerp(Math.min(nwK, 1.08), nwK, t); // 굵은 목은 아래로 갈수록 더 굵게(승모근)
    neck.push({ y, cz: nsp[0](y), hw: nsp[1](y) * wk, f: nsp[2](y) * lerp(1, ndK, 0.7), b: nsp[3](y) * ndK });
  }

  // 두피(머리카락·모자 기준면): 머리 링 ∪ 목 링, 중심 (0, SCZ)
  const scalp: { y: number; r: Float32Array }[] = [];
  const sEnd = 16;
  const SN = 64;
  for (let i = 0; i <= SN; i++) {
    const y = lerp(yTop, sEnd, i / SN);
    const r = new Float32Array(POLAR_N + 1);
    let hl: P[] | null = null;
    if (y <= yBot) {
      const fl = (y - yTop) / (yBot - yTop) * N;
      const a = lv[Math.max(0, Math.min(N, Math.floor(fl)))], b = lv[Math.max(0, Math.min(N, Math.ceil(fl)))];
      const t = fl - Math.floor(fl);
      hl = a.ring.map((p, j) => [lerp(p[0], b.ring[j][0], t), lerp(p[1], b.ring[j][1], t)] as P);
    }
    let nr: P[] | null = null;
    if (y >= 0.4) {
      let k = 0;
      while (k < neck.length - 2 && neck[k + 1].y < y) k++;
      const n0 = neck[k], n1 = neck[k + 1];
      const t = Math.max(0, Math.min(1, (y - n0.y) / (n1.y - n0.y)));
      nr = neckRing({ y, cz: lerp(n0.cz, n1.cz, t), hw: lerp(n0.hw, n1.hw, t), f: lerp(n0.f, n1.f, t), b: lerp(n0.b, n1.b, t) });
    }
    for (let k = 0; k <= POLAR_N; k++) {
      const ang = k * POLAR_STEP;
      let rr = 0;
      if (hl) rr = Math.max(rr, rayFar(hl, 0, SCZ, ang));
      if (nr) rr = Math.max(rr, rayFar(nr, 0, SCZ, ang));
      r[k] = rr;
    }
    scalp.push({ y, r });
  }

  return {
    face: f, lv, yTop, yBot, mid, midY0: midK[0][0], midY1: midK[midK.length - 1][0], scalp, neck, ys,
    eyeY: ys(-1.35 + 0.3 * f.eyeY),
    browY: ys(-3.5 + 0.3 * f.browY),
    noseTipY: ys(ny(2.65 - 0.22 * f.noseTip)),
    tipZ,
    subY: ys(subY0),
    mouthY: ys(5.55 + dl * 0.4 + 0.22 * f.mouthY),
    lipBotY: ys(6.38 + dl * 0.3 + 0.18 * f.mouthY + 0.35 * (f.lipL - 1)),
    chinY: yBot,
  };
}

// ── 표면 조회 ──
function levelPair(m: HeadModel, y: number): [Level, Level, number] {
  const N = m.lv.length - 1;
  const fl = ((y - m.yTop) / (m.yBot - m.yTop)) * N;
  const i = Math.max(0, Math.min(N - 1, Math.floor(fl)));
  return [m.lv[i], m.lv[i + 1], Math.max(0, Math.min(1, fl - i))];
}

/** 얼굴 표면: 각도 φ(0=앞, +90=캐릭터 왼쪽), 높이 y → 3D 점 */
export function surfHead(m: HeadModel, phi: number, y: number): V3 {
  const [a, b, t] = levelPair(m, y);
  const r = lerp(polarAt(a.polar, phi), polarAt(b.polar, phi), t);
  const cz = lerp(a.cz, b.cz, t);
  return [r * Math.sin(phi * D2R), y, cz + r * Math.cos(phi * D2R)];
}

export function normHead(m: HeadModel, phi: number, y: number): V3 {
  const dp = vsub(surfHead(m, phi + 2, y), surfHead(m, phi - 2, y));
  const dy = vsub(surfHead(m, phi, y + 0.3), surfHead(m, phi, y - 0.3));
  let n = vnorm(vcross(dp, dy));
  const p = surfHead(m, phi, y);
  const [a] = levelPair(m, y);
  if (vdot(n, [p[0], 0, p[2] - a.cz]) < 0) n = vmul(n, -1);
  return n;
}

/** 두피 표면 (머리카락·모자용) */
export function surfScalp(m: HeadModel, phi: number, y: number): V3 {
  const S = m.scalp;
  const n = S.length - 1;
  const fl = ((y - S[0].y) / (S[n].y - S[0].y)) * n;
  const i = Math.max(0, Math.min(n - 1, Math.floor(fl)));
  const t = Math.max(0, Math.min(1, fl - i));
  const r = lerp(polarAt(S[i].r, phi), polarAt(S[i + 1].r, phi), t);
  return [r * Math.sin(phi * D2R), y, SCZ + r * Math.cos(phi * D2R)];
}

export function normScalp(m: HeadModel, phi: number, y: number): V3 {
  const dp = vsub(surfScalp(m, phi + 3, y), surfScalp(m, phi - 3, y));
  const dy = vsub(surfScalp(m, phi, y + 0.35), surfScalp(m, phi, y - 0.35));
  let n = vnorm(vcross(dp, dy));
  const p = surfScalp(m, phi, y);
  if (y < m.yTop + 0.6) return vnorm([p[0] * 0.3, -1, (p[2] - SCZ) * 0.3]);
  if (vdot(n, [p[0], 0, p[2] - SCZ]) < 0) n = vmul(n, -1);
  return n;
}

/** 얼굴 앞면에서 가로 위치 X 의 Z (가장 앞쪽 교점) */
export function frontZ(m: HeadModel, X: number, y: number): number {
  const [a, b, t] = levelPair(m, y);
  const fz = (L: Level) => {
    let best = -Infinity;
    const n = L.ring.length;
    for (let j = 0; j < n; j++) {
      const p = L.ring[j], q = L.ring[(j + 1) % n];
      if ((p[0] - X) * (q[0] - X) <= 0 && p[0] !== q[0]) {
        const z = p[1] + ((q[1] - p[1]) * (X - p[0])) / (q[0] - p[0]);
        if (z > best) best = z;
      }
    }
    return best === -Infinity ? L.cz : best;
  };
  let z = lerp(fz(a), fz(b), t);
  if (Math.abs(X) < 0.9 && y >= m.midY0 && y <= m.midY1) z = Math.max(z, lerp(m.mid(y), z, Math.abs(X) / 0.9));
  return z;
}

/** 얼굴 표면 위 가로 X 지점의 φ */
export function phiAtX(m: HeadModel, X: number, y: number): number {
  const [a, b, t] = levelPair(m, y);
  const cz = lerp(a.cz, b.cz, t);
  return Math.atan2(X, frontZ(m, X, y) - cz) / D2R;
}

export function neckRingPts(n: NeckLevel, steps = 36): P[] { return neckRing(n, steps); }
