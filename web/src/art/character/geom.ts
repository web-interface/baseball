// 기하 도구 — 2D 벡터, 3D 투영, 부드러운 경로(캣멀–롬 → 3차 베지에), 테이퍼(끝이 가는) 획.
// 각도 규약(옆모습 뼈대): 0° = 아래(+y), +90° = 앞(+x). SVG 는 y 가 아래로 증가.

export type P = [number, number];
/** 세 번째 값 = 그 점의 접선 크기 배율 (0 이면 뾰족한 모서리, 1 기본) */
export type Q = [number, number] | [number, number, number];
export type V3 = [number, number, number];

export const D2R = Math.PI / 180;
export const R2D = 180 / Math.PI;

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => (b === a ? 0 : (v - a) / (b - a));
export const smooth01 = (t: number) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };
export const sstep = (e0: number, e1: number, x: number) => smooth01((x - e0) / (e1 - e0));

export const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
export const mul = (a: P, k: number): P => [a[0] * k, a[1] * k];
export const len = (a: P) => Math.hypot(a[0], a[1]);
export const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const norm = (a: P): P => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
export const lerpP = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const dot = (a: P, b: P) => a[0] * b[0] + a[1] * b[1];
/** 뼈 방향 각도 → 단위벡터 (0=아래, 90=앞) */
export const dir = (deg: number): P => [Math.sin(deg * D2R), Math.cos(deg * D2R)];
export const angleOf = (v: P) => Math.atan2(v[0], v[1]) * R2D;
/** 같은 규약으로 회전 (양수 = 아래→앞 방향으로 돎) */
export const rot = (v: P, deg: number): P => {
  const c = Math.cos(deg * D2R), s = Math.sin(deg * D2R);
  return [v[0] * c + v[1] * s, -v[0] * s + v[1] * c];
};
/** 뼈 방향 d 의 '앞쪽' 법선 (아래로 뻗은 뼈면 +x) */
export const frontN = (d: P): P => [d[1], -d[0]];

// ── 3D ──
export const v3 = (x: number, y: number, z: number): V3 => [x, y, z];
export const vadd = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vsub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vmul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const vdot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vcross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const vlen = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const vnorm = (a: V3): V3 => { const l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const vlerp = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/**
 * 카메라: 몸(머리) 기준 좌표 X=캐릭터 왼쪽(+), Y=아래, Z=앞.
 * yaw 0 = 정면을 봄, +90 = 화면 오른쪽을 보는 옆모습(가까운 쪽 = 캐릭터 오른쪽).
 * pitch > 0 = 카메라가 살짝 위에서 내려다봄.
 */
export interface Cam { yaw: number; pitch: number; cy: number; sy: number; cp: number; sp: number }
export function cam(yaw: number, pitch = 0): Cam {
  return { yaw, pitch, cy: Math.cos(yaw * D2R), sy: Math.sin(yaw * D2R), cp: Math.cos(pitch * D2R), sp: Math.sin(pitch * D2R) };
}
/** → [화면x, 화면y, 깊이(카메라 쪽 +)] */
export function proj(c: Cam, p: V3): V3 {
  const x = p[0] * c.cy + p[2] * c.sy;
  const d0 = -p[0] * c.sy + p[2] * c.cy;
  return [x, p[1] * c.cp + d0 * c.sp, -p[1] * c.sp + d0 * c.cp];
}
export const proj2 = (c: Cam, p: V3): P => { const r = proj(c, p); return [r[0], r[1]]; };
/** 방향벡터(법선)를 카메라 공간으로 */
export const projDir = (c: Cam, n: V3): V3 => proj(c, n);

// ── 경로 ──
export const fx = (n: number): string => {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? '0' : String(r);
};

/** 캣멀–롬 스플라인을 3차 베지에로. closed 면 Z 로 닫음. */
export function smoothPath(pts: readonly Q[], closed = true, k = 1): string {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M${fx(pts[0][0])} ${fx(pts[0][1])}`;
  const get = (i: number): Q => (closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  let d = `M${fx(pts[0][0])} ${fx(pts[0][1])}`;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const t1 = ((p1[2] ?? 1) * k) / 6, t2 = ((p2[2] ?? 1) * k) / 6;
    const c1x = p1[0] + (p2[0] - p0[0]) * t1, c1y = p1[1] + (p2[1] - p0[1]) * t1;
    const c2x = p2[0] - (p3[0] - p1[0]) * t2, c2y = p2[1] - (p3[1] - p1[1]) * t2;
    d += `C${fx(c1x)} ${fx(c1y)} ${fx(c2x)} ${fx(c2y)} ${fx(p2[0])} ${fx(p2[1])}`;
  }
  return closed ? d + 'Z' : d;
}

export function polyPath(pts: readonly P[], closed = true): string {
  if (!pts.length) return '';
  let d = `M${fx(pts[0][0])} ${fx(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) d += `L${fx(pts[i][0])} ${fx(pts[i][1])}`;
  return closed ? d + 'Z' : d;
}

export const movePts = (pts: readonly Q[], v: P): Q[] =>
  pts.map((p) => (p.length === 3 ? [p[0] + v[0], p[1] + v[1], p[2]] : [p[0] + v[0], p[1] + v[1]]) as Q);

export function bbox(pts: readonly (P | Q)[]): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    if (p[0] < x0) x0 = p[0];
    if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[1] > y1) y1 = p[1];
  }
  return [x0, y0, x1, y1];
}

/** 캣멀–롬 곡선을 촘촘한 점열로 (닫힘/열림) */
export function crSample(pts: readonly P[], closed: boolean, perSeg: number): P[] {
  const n = pts.length;
  const out: P[] = [];
  const get = (i: number) => (closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let j = 0; j < perSeg; j++) {
      const t = j / perSeg, t2 = t * t, t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
      out.push([
        h00 * p1[0] + h10 * (p2[0] - p0[0]) * 0.5 + h01 * p2[0] + h11 * (p3[0] - p1[0]) * 0.5,
        h00 * p1[1] + h10 * (p2[1] - p0[1]) * 0.5 + h01 * p2[1] + h11 * (p3[1] - p1[1]) * 0.5,
      ]);
    }
  }
  if (!closed) out.push([pts[n - 1][0], pts[n - 1][1]]);
  return out;
}

/** 1차원 부드러운 보간기 (x 오름차순 키). 단조 3차(Fritsch–Carlson) — 넘침 없이 매끈. */
export function spline1(xs: readonly number[], ys: readonly number[]): (x: number) => number {
  const n = xs.length;
  const d: number[] = [];
  const m: number[] = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else {
      const w1 = 2 * (xs[i + 1] - xs[i]) + (xs[i] - xs[i - 1]);
      const w2 = (xs[i + 1] - xs[i]) + 2 * (xs[i] - xs[i - 1]);
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0] + m[0] * (x - xs[0]) * 0;
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

/**
 * 테이퍼 획(붓 터치 같은 끝이 가는 선)을 닫힌 도형 점열로.
 * pts: 중심선, w: 각 점의 반폭 또는 t(0..1)→반폭 함수.
 */
export function taperPts(pts: readonly P[], w: readonly number[] | ((t: number) => number)): Q[] {
  const n = pts.length;
  if (n < 2) return [];
  // 누적 길이로 t 계산 → 점 간격이 고르지 않아도 굵기 변화가 고르다
  const acc = [0];
  for (let i = 1; i < n; i++) acc.push(acc[i - 1] + dist(pts[i - 1], pts[i]));
  const total = acc[n - 1] || 1;
  const L: Q[] = [], R: Q[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const dd = norm(sub(b, a));
    const nr: P = [-dd[1], dd[0]];
    const wi = typeof w === 'function' ? w(acc[i] / total) : w[i];
    L.push([pts[i][0] + nr[0] * wi, pts[i][1] + nr[1] * wi]);
    R.push([pts[i][0] - nr[0] * wi, pts[i][1] - nr[1] * wi]);
  }
  const w0 = typeof w === 'function' ? w(0) : w[0];
  const w1 = typeof w === 'function' ? w(1) : w[n - 1];
  const out: Q[] = [];
  if (w0 < 0.02) out.push([pts[0][0], pts[0][1], 0]);
  else { out.push([R[0][0], R[0][1], 0.4]); out.push([L[0][0], L[0][1], 0.4]); }
  for (let i = 1; i < n - 1; i++) out.push(L[i]);
  if (w1 < 0.02) out.push([pts[n - 1][0], pts[n - 1][1], 0]);
  else { out.push([L[n - 1][0], L[n - 1][1], 0.4]); out.push([R[n - 1][0], R[n - 1][1], 0.4]); }
  for (let i = n - 2; i >= 1; i--) out.push(R[i]);
  return out;
}

/** 붓 획 모양 굵기 함수: 시작 a, 가운데 b(위치 at), 끝 c */
export const brush = (a: number, b: number, c: number, at = 0.45) => (t: number) =>
  t < at ? lerp(a, b, Math.sin((t / at) * Math.PI * 0.5)) : lerp(c, b, Math.sin(((1 - t) / (1 - at)) * Math.PI * 0.5));

export function ellipsePts(cx: number, cy: number, rx: number, ry: number, n = 16, rotDeg = 0): P[] {
  const out: P[] = [];
  const c = Math.cos(rotDeg * D2R), s = Math.sin(rotDeg * D2R);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    out.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return out;
}

/** 점열을 부드러운 곡선 위 촘촘한 점으로 재표본 */
export function resample(pts: readonly P[], closed: boolean, step: number): P[] {
  const dense = crSample(pts, closed, 8);
  const out: P[] = [dense[0]];
  let acc = 0;
  for (let i = 1; i < dense.length; i++) {
    acc += dist(dense[i - 1], dense[i]);
    if (acc >= step) { out.push(dense[i]); acc = 0; }
  }
  return out;
}

/** 다각형 부호 면적 (y 아래 기준) */
export function area(pts: readonly P[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}
