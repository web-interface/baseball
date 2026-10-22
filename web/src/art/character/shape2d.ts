// 움직이는 그림용 2D 도형 도구 — 매 프레임 다시 계산하므로 가볍게.
//  · 팔다리 외곽: 관절 2D 좌표 + 굵기 프로필 → 이어진 한 덩어리 외곽 (figure.ts 와 같은 방식)
//  · 명암 띠: 외곽을 '빛 반대쪽 법선 방향'으로 안쪽으로 민 곡선과 외곽 사이 → 클립 없이 2~3단 명암
//  · 경로 문자열: 소수 1자리 (cm 단위라 화면에선 1px 이하 오차)

import type { P, Q } from './geom';
import { add, sub, mul, norm, dot, lerp, lerpP, clamp, frontN, smooth01, dir } from './geom';

export type Prof = (t: number) => [number, number];
export type K = [number, number][];

export function interpK(k: K, t: number): number {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 0; i < k.length - 1; i++) {
    if (t <= k[i + 1][0]) {
      const u = (t - k[i][0]) / (k[i + 1][0] - k[i][0]);
      return lerp(k[i][1], k[i + 1][1], smooth01(u));
    }
  }
  return k[k.length - 1][1];
}
export const mkProf = (f: K, b: K, add0 = 0): Prof => (t) => [interpK(f, t) + add0, interpK(b, t) + add0];
export const grow = (p: Prof, a: number, b = a): Prof => (t) => { const v = p(t); return [v[0] + a, v[1] + b]; };

function segSide(a: P, b: P, pr: Prof, sg: 1 | -1, n: number, t0 = 0, t1 = 1): P[] {
  const d = norm(sub(b, a));
  const fn = frontN(d);
  const out: P[] = [];
  for (let i = 0; i <= n; i++) {
    const t = lerp(t0, t1, i / n);
    const c = lerpP(a, b, t);
    const [f, bk] = pr(t);
    out.push(add(c, mul(fn, sg > 0 ? f : -bk)));
  }
  return out;
}

/** 짧아진(카메라를 향한) 마디도 방향이 흔들리지 않게 최소 길이 보장 */
function safeEnd(a: P, b: P, fallback: P, min = 0.6): P {
  const v = sub(b, a);
  const l = Math.hypot(v[0], v[1]);
  if (l >= min) return b;
  const d = l > 1e-4 ? mul(v, 1 / l) : norm(fallback);
  return add(a, mul(d, min));
}

/** 두 마디(위팔+아래팔, 허벅지+정강이)를 이어진 하나의 외곽으로 */
export function limb2(J0: P, J1in: P, J2in: P, p1: Prof, p2: Prof, capTop = 0.9, n = 6): Q[] {
  const J1 = safeEnd(J0, J1in, [0, 1]);
  const J2 = safeEnd(J1, J2in, sub(J1, J0));
  const d1 = norm(sub(J1, J0)), d2 = norm(sub(J2, J1));
  const n1 = frontN(d1), n2 = frontN(d2);
  const sides: Q[][] = [];
  for (const sg of [1, -1] as const) {
    const A = segSide(J0, J1, p1, sg, n);
    const B = segSide(J1, J2, p2, sg, n);
    const bis = norm(add(mul(n1, sg), mul(n2, sg)));
    const wj = sg > 0 ? (p1(1)[0] + p2(0)[0]) / 2 : (p1(1)[1] + p2(0)[1]) / 2;
    const bend = dot(n1, n2);
    const pts: Q[] = [];
    if (bend > 0.995) {
      pts.push(...A.slice(0, -1), ...B);
    } else if (dot(bis, sub(d2, d1)) < 0) {
      pts.push(...A.slice(0, -1));
      const a0 = Math.atan2(sg * n1[1], sg * n1[0]);
      let da = Math.atan2(sg * n2[1], sg * n2[0]) - a0;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      for (let k = 0; k <= 3; k++) { const a = a0 + (da * k) / 3; pts.push([J1[0] + Math.cos(a) * wj, J1[1] + Math.sin(a) * wj]); }
      pts.push(...B.slice(1));
    } else {
      const half = Math.acos(clamp(bend, -1, 1)) / 2;
      const C = add(J1, mul(bis, wj / Math.max(0.4, Math.cos(half))));
      const kA = A.filter((p) => dot(sub(p, C), d1) < -0.2);
      const kB = B.filter((p) => dot(sub(p, C), d2) > 0.2);
      pts.push(...kA, [C[0], C[1], 0.5], ...kB);
    }
    sides.push(pts);
  }
  const [F, Bk] = sides;
  const endF = F[F.length - 1], endB = Bk[Bk.length - 1];
  const tipEnd = add(lerpP(endF as P, endB as P, 0.5), mul(d2, Math.min(p2(1)[0], p2(1)[1]) * 0.35));
  const startF = F[0], startB = Bk[0];
  const r0 = (p1(0)[0] + p1(0)[1]) / 2;
  const capPts: Q[] = [];
  if (capTop > 0) {
    const c0 = lerpP(startF as P, startB as P, 0.5);
    for (let k = 1; k < 5; k++) {
      const a = Math.PI * (k / 5);
      capPts.push(add(add(c0, mul(n1, Math.cos(a) * r0)), mul(d1, -Math.sin(a) * r0 * capTop)) as Q);
    }
  } else capPts.push(add(lerpP(startF as P, startB as P, 0.5), mul(d1, -r0 * 0.2)));
  return [...F, tipEnd, ...Bk.slice().reverse(), ...capPts.reverse()];
}

/** 한 마디 외곽 */
export function limb1(a: P, bIn: P, pr: Prof, capA = 0.6, capB = 0.4, n = 5): Q[] {
  const b = safeEnd(a, bIn, [0, 1], 0.4);
  const d = norm(sub(b, a));
  const F = segSide(a, b, pr, 1, n), Bk = segSide(a, b, pr, -1, n);
  const eB = add(lerpP(F[F.length - 1], Bk[Bk.length - 1], 0.5), mul(d, ((pr(1)[0] + pr(1)[1]) / 2) * capB));
  const eA = add(lerpP(F[0], Bk[0], 0.5), mul(d, -((pr(0)[0] + pr(0)[1]) / 2) * capA));
  return [...F, eB, ...Bk.reverse(), eA];
}

/** 로컬 도형(+y = 각도 ang 방향, +x = 앞쪽 법선) → 화면 */
export function placeAt(o: P, ang: number, pts: readonly Q[], sx = 1, sy = 1): Q[] {
  const d = dir(ang), f = frontN(d);
  return pts.map((p) => {
    const x = p[0] * sx, y = p[1] * sy;
    const q: Q = [o[0] + f[0] * x + d[0] * y, o[1] + f[1] * x + d[1] * y];
    if (p.length === 3) q.push(p[2]);
    return q;
  });
}

// ── 경로 문자열 ──
// 매 프레임 수백 개 경로를 만들므로 숫자→문자열이 가장 비싸다(측정: 전체의 40%).
// 0.1cm 정수로 반올림해 정수만 문자열로 바꾸고, 상대 좌표(c/s/l)로 숫자를 짧게 쓴다.
const R10 = (x: number) => Math.round(x * 10);
/** 0.1 단위 정수 → "12.3" */
function t10(v: number): string {
  if (v === 0) return '0';
  let s = '';
  if (v < 0) { s = '-'; v = -v; }
  const i = (v / 10) | 0, f = v - i * 10;
  return f ? s + i + '.' + f : s + i;
}
/** 앞 숫자와 구분: 음수면 '-' 가 구분자 역할 */
const sep = (v: number) => (v < 0 ? t10(v) : ' ' + t10(v));

export const f1 = (n: number): string => t10(R10(n));

/**
 * 캣멀–롬 → 3차 베지에. 첫 구간만 c, 나머지는 s(앞 제어점 반사) — 캣멀–롬은 한 점의 양쪽 제어점이
 * 그 점에 대해 대칭이라 s 로 정확히 같은 곡선이 된다. 좌표는 0.1cm 정수로 맞춘 상대값(누적 오차 없음).
 */
export function sp1(pts: readonly Q[], closed = true): string {
  const n = pts.length;
  if (n < 2) return '';
  const get = (i: number): Q => (closed ? pts[((i % n) + n) % n] : pts[i < 0 ? 0 : i > n - 1 ? n - 1 : i]);
  let cx = R10(pts[0][0]), cy = R10(pts[0][1]);
  let d = 'M' + t10(cx) + sep(cy);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const t2 = (p2[2] ?? 1) / 6;
    const c2x = R10(p2[0] - (p3[0] - p1[0]) * t2), c2y = R10(p2[1] - (p3[1] - p1[1]) * t2);
    const ex = R10(p2[0]), ey = R10(p2[1]);
    if (i === 0) {
      const t1 = (p1[2] ?? 1) / 6;
      const c1x = R10(p1[0] + (p2[0] - p0[0]) * t1), c1y = R10(p1[1] + (p2[1] - p0[1]) * t1);
      d += 'c' + t10(c1x - cx) + sep(c1y - cy) + sep(c2x - cx) + sep(c2y - cy) + sep(ex - cx) + sep(ey - cy);
    } else {
      d += 's' + t10(c2x - cx) + sep(c2y - cy) + sep(ex - cx) + sep(ey - cy);
    }
    cx = ex; cy = ey;
  }
  return closed ? d + 'z' : d;
}

export function poly1(pts: readonly P[], closed = true): string {
  if (!pts.length) return '';
  let cx = R10(pts[0][0]), cy = R10(pts[0][1]);
  let d = 'M' + t10(cx) + sep(cy);
  for (let i = 1; i < pts.length; i++) {
    const x = R10(pts[i][0]), y = R10(pts[i][1]);
    d += 'l' + t10(x - cx) + sep(y - cy);
    cx = x; cy = y;
  }
  return closed ? d + 'z' : d;
}

// ── 명암 띠 ──
function signedArea(pts: readonly Q[]): number {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}

/** 바깥 법선 (단위) */
export function normals(pts: readonly Q[]): P[] {
  const n = pts.length;
  const sg = signedArea(pts) > 0 ? 1 : -1;
  const out: P[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const tx = b[0] - a[0], ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    out[i] = [(sg * ty) / l, (-sg * tx) / l];
  }
  return out;
}

/**
 * 빛 반대쪽 띠(lit=false) 또는 빛 쪽 띠(lit=true) — 외곽을 법선 안쪽으로 w·|n·L| 만큼 민 곡선과 외곽 사이.
 * 볼록한 도형이면 '빛 쪽으로 민 도형 바깥' 셰이딩과 같고, 접힌(오목한) 곳에서도 도형 밖으로 새지 않는다.
 * keep: 이 점들만 띠에 넣음(몸통을 저지/바지로 나눌 때)
 */
export function band(pts: readonly Q[], L: P, w: number, lit = false, keep?: (i: number) => boolean, pow = 1): string {
  const n = pts.length;
  if (n < 3 || w <= 0) return '';
  const nr = normals(pts);
  const k = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const c = nr[i][0] * L[0] + nr[i][1] * L[1];
    const v = lit ? c : -c;
    k[i] = v > 0 && (!keep || keep(i)) ? (pow === 1 ? v : Math.pow(v, pow)) : 0;
  }
  // 띠가 시작하는 점(앞 점이 0, 자기는 >0)부터 연속 구간
  let d = '';
  let start = -1;
  for (let i = 0; i < n; i++) if (k[i] > 0.015 && k[(i - 1 + n) % n] <= 0.015) { start = i; break; }
  if (start < 0) {
    if (k[0] <= 0.015) return '';
    // 전부 어두움 — 고리 전체
    const inner: Q[] = [];
    for (let i = n - 1; i >= 0; i--) inner.push([pts[i][0] - nr[i][0] * w * k[i], pts[i][1] - nr[i][1] * w * k[i]]);
    return sp1(pts) + sp1(inner);
  }
  let i = start, guard = 0;
  while (guard++ < n) {
    if (k[i] > 0.015 && k[(i - 1 + n) % n] <= 0.015) {
      const outer: Q[] = [pts[(i - 1 + n) % n]];
      const inner: Q[] = [];
      let j = i, c = 0;
      while (k[j] > 0.015 && c++ < n) {
        outer.push(pts[j]);
        inner.push([pts[j][0] - nr[j][0] * w * k[j], pts[j][1] - nr[j][1] * w * k[j]]);
        j = (j + 1) % n;
      }
      outer.push(pts[j]);
      if (inner.length >= 1) {
        const poly: Q[] = [...outer, ...inner.reverse()];
        d += sp1(poly);
      }
      i = j;
    } else i = (i + 1) % n;
    if (i === start) break;
  }
  return d;
}

/** 2D 볼록 껍질 (앤드루 단조 사슬) — 반시계(화면 기준) 순서 */
export function hull(ptsIn: P[]): P[] {
  const pts = ptsIn.slice().sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  if (pts.length < 3) return pts;
  const cross = (o: P, a: P, b: P) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: P[] = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  const upper: P[] = [];
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

/** 붓 획 (테이퍼) 외곽: 중심선 + 굵기 함수 */
export function stroke2(pts: readonly P[], w: (t: number) => number): Q[] {
  const n = pts.length;
  if (n < 2) return [];
  const acc = [0];
  for (let i = 1; i < n; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const tot = acc[n - 1] || 1;
  const L: Q[] = [], R: Q[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const dd = norm(sub(b, a));
    const nr: P = [-dd[1], dd[0]];
    const wi = w(acc[i] / tot);
    L.push([pts[i][0] + nr[0] * wi, pts[i][1] + nr[1] * wi]);
    R.push([pts[i][0] - nr[0] * wi, pts[i][1] - nr[1] * wi]);
  }
  return [[pts[0][0], pts[0][1], 0], ...L.slice(1, -1), [pts[n - 1][0], pts[n - 1][1], 0], ...R.slice(1, -1).reverse()];
}

/**
 * 미리 그린 SVG 조각(머리 등)의 경로 숫자를 0.1 단위로 줄인다 — 모양은 그대로, 크기 약 20~30%↓.
 * d="…" 안의 숫자만 반올림(색·변환은 건드리지 않음).
 */
export function compactSvg(svg: string): string {
  return svg.replace(/ d="([^"]*)"/g, (_m, d: string) => ' d="' + d.replace(/-?\d*\.\d+|-?\d+/g, (n) => {
    const v = Math.round(parseFloat(n) * 10) / 10;
    let s = String(v === 0 ? 0 : v);
    if (s.startsWith('0.')) s = s.slice(1); else if (s.startsWith('-0.')) s = '-' + s.slice(2);
    return s;
  }).replace(/ (?=-)/g, '') + '"');
}
