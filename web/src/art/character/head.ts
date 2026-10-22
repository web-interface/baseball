// 머리 그리기 — 3D 머리 모형을 원하는 각도(yaw)로 투영해서 평면 벡터 일러스트로 칠한다.
// 결과는 머리 원점(귓구멍 가운데) 기준 cm 좌표의 SVG 조각들. 호출하는 쪽에서 배치·크기를 정한다.
//
// 층: back(머리 뒤로 보이는 머리카락·모자 뒷부분) → neck → (몸통) → chin(턱 아래 수염) → head

import type { Appearance, Kit, Expression } from './types';
import type { P, Q, V3, Cam } from './geom';
import {
  cam, proj, proj2, projDir, lerp, clamp, sstep, smooth01, vadd, vsub, vmul, vnorm, vdot, vcross, D2R,
  smoothPath, polyPath, taperPts, brush, fx, norm, sub, add, mul, lerpP, area, movePts, bbox, dist,
} from './geom';
import { uid, clipDef, clipped, outsideD } from './svg';
import { adj, mix, lum, toneOf } from './color';
import { headModel, surfHead, normHead, surfScalp, normScalp, frontZ, phiAtX, neckRingPts } from './headModel';
import type { HeadModel } from './headModel';
import { Rng } from './rng';

export interface HeadOpts {
  yaw: number;
  pitch?: number;
  /** 카메라 공간 빛 방향 (x 오른쪽, y 아래, z 카메라 쪽) — 빛이 오는 쪽 */
  light: V3;
  gear: 'cap' | 'helmet' | 'none';
  /** 헬멧 귀덮개 쪽 (캐릭터 기준) */
  flap?: 'L' | 'R';
  detail?: number;
  line?: number;
  neckLen?: number;
  /** 0 = 정면 보기, 1 = 얼굴 방향 그대로 */
  gaze?: number;
  expression?: Expression;
  /** 거울 쌍둥이로 그리는 중(글자만 다시 뒤집음) */
  mirror?: boolean;
}

export interface HeadOut { back: string; neck: string; chin: string; head: string; m: HeadModel; c: Cam; near: 1 | -1 }

interface Ctx {
  ap: Appearance; kit: Kit; m: HeadModel; c: Cam; o: HeadOpts;
  L: V3; L2: P; Lh: V3;
  det: number; lw: number;
  near: 1 | -1; farScr: number;
  expr: Expression;
  cap: boolean; helmet: boolean; capLow: number; brimCurve: number;
  r: Rng;
  pp: (p: V3) => P;
  face: (n: V3) => number;
  lit: (n: V3) => number;
  sil: P[];
  silD: string;
  shadowY?: ((sx: number) => number) | null;
}

const SCLERA = '#f1ece4';
const LASH = '#1a1311';

// ───────────────────────── 기본 도구 ─────────────────────────
const tq = (pts: P[], w: number[] | ((t: number) => number)) => taperPts(pts, w);
const pathD = (pts: readonly Q[]) => smoothPath(pts);
const fillP = (pts: readonly Q[], fill: string, extra = '') => (pts.length > 2 ? `<path d="${pathD(pts)}" fill="${fill}"${extra ? ' ' + extra : ''}/>` : '');

/** 시트(격자 면) → 다각형들. mode 'front' 는 카메라를 향한 칸만, 'all' 은 전부(감김 방향 통일) */
function sheetPolys(grid: V3[][], c: Cam, mode: 'front' | 'all' | 'back'): P[][] {
  const cols = grid.length;
  if (cols < 2) return [];
  const rows = grid[0].length;
  const pr = grid.map((col) => col.map((p) => proj2(c, p)));
  const qa = (a: P, b: P, cc: P, d: P) => area([a, b, cc, d]);
  const polys: P[][] = [];
  for (let k = 0; k < cols - 1; k++) {
    const A = pr[k], B = pr[k + 1];
    let r = 0;
    while (r < rows - 1) {
      const facing = qa(A[r], B[r], B[r + 1], A[r + 1]) >= 0;
      let r1 = r;
      while (r1 + 1 < rows - 1 && (qa(A[r1 + 1], B[r1 + 1], B[r1 + 2], A[r1 + 2]) >= 0) === facing) r1++;
      if (mode === 'all' || (mode === 'front' && facing) || (mode === 'back' && !facing)) {
        const poly: P[] = [];
        for (let i = r; i <= r1 + 1; i++) poly.push(A[i]);
        for (let i = r1 + 1; i >= r; i--) poly.push(B[i]);
        if (!facing) poly.reverse();
        polys.push(poly);
      }
      r = r1 + 1;
    }
  }
  return polys;
}
const polysD = (ps: P[][]) => ps.map((p) => polyPath(p)).join('');

/** 돔(링 묶음, rings[t][φ]) 외곽: 앞(보이는) 영역과 뒤 영역 */
function domeOutline(rings: V3[][], c: Cam): { front: P[]; back: P[] } {
  const L: P[] = [], R: P[] = [];
  let bandFront: P[] = [], bandBack: P[] = [];
  rings.forEach((ring, ti) => {
    const pr = ring.map((p) => proj(c, p));
    let imn = 0, imx = 0, idp = 0;
    for (let j = 1; j < pr.length; j++) {
      if (pr[j][0] < pr[imn][0]) imn = j;
      if (pr[j][0] > pr[imx][0]) imx = j;
      if (pr[j][2] > pr[idp][2]) idp = j;
    }
    L.push([pr[imn][0], pr[imn][1]]);
    R.push([pr[imx][0], pr[imx][1]]);
    if (ti === 0) {
      const n = pr.length;
      const walk = (from: number, to: number, st: number) => {
        const out = [from];
        let j = from;
        let guard = 0;
        while (j !== to && guard++ < n + 2) { j = (j + st + n) % n; out.push(j); }
        return out;
      };
      let arc = walk(imn, imx, 1);
      let other = walk(imx, imn, 1);
      if (!arc.includes(idp)) { arc = walk(imn, imx, -1); other = walk(imx, imn, -1); }
      bandFront = arc.map((j) => [pr[j][0], pr[j][1]] as P);
      bandBack = other.map((j) => [pr[j][0], pr[j][1]] as P);
    }
  });
  const front: P[] = [...bandFront, ...R.slice(1), ...L.slice(1).reverse()];
  const back: P[] = [...bandBack, ...L.slice(1), ...R.slice(1).reverse()];
  return { front, back };
}

// ───────────────────────── 얼굴 외곽 + 명암 ─────────────────────────
function headSilhouette(x: Ctx): { sil: P[]; shadow: P[]; left: P[]; right: P[]; ys: number[] } {
  const { m, c } = x;
  const left: P[] = [], right: P[] = [], term: P[] = [], ys: number[] = [];
  const shadowLeft = x.L[0] > 0;
  const thr = 0.16;
  const nL = m.lv.length;
  for (let i = 0; i < nL; i++) {
    const lv = m.lv[i];
    const n = lv.ring.length;
    const pr = lv.ring.map(([X, Z]) => proj(c, [X, lv.y, Z]));
    let imn = 0, imx = 0, idp = 0;
    for (let j = 1; j < n; j++) {
      if (pr[j][0] < pr[imn][0]) imn = j;
      if (pr[j][0] > pr[imx][0]) imx = j;
      if (pr[j][2] > pr[idp][2]) idp = j;
    }
    let lp: P = [pr[imn][0], pr[imn][1]], rp: P = [pr[imx][0], pr[imx][1]];
    if (lv.y >= m.midY0 && lv.y <= m.midY1) {
      const z = m.mid(lv.y);
      if (z > lv.fz + 0.01) {
        const q = proj(c, [0, lv.y, z]);
        if (q[0] < lp[0]) lp = [q[0], q[1]];
        if (q[0] > rp[0]) rp = [q[0], q[1]];
      }
    }
    left.push(lp); right.push(rp); ys.push(lv.y);
    // 명암 경계
    const up = m.lv[Math.max(0, i - 1)], dn = m.lv[Math.min(nL - 1, i + 1)];
    const lum: number[] = [];
    for (let j = 0; j < n; j++) {
      const a = lv.ring[(j + 1) % n], b = lv.ring[(j - 1 + n) % n];
      const tu: V3 = [a[0] - b[0], 0, a[1] - b[1]];
      const tv: V3 = [dn.ring[j][0] - up.ring[j][0], dn.y - up.y, dn.ring[j][1] - up.ring[j][1]];
      let nn = vnorm(vcross(tu, tv));
      if (vdot(nn, [lv.ring[j][0], 0, lv.ring[j][1] - lv.cz]) < 0) nn = vmul(nn, -1);
      if (i === 0) nn = [0, -1, 0];
      lum.push(vdot(projDir(c, nn), x.L));
    }
    const start = shadowLeft ? imn : imx, end = shadowLeft ? imx : imn;
    const walk = (st: number) => { const out = [start]; let j = start; let g = 0; while (j !== end && g++ < n + 2) { j = (j + st + n) % n; out.push(j); } return out; };
    let arc = walk(1);
    if (!arc.includes(idp)) arc = walk(-1);
    let k = arc.findIndex((j) => lum[j] >= thr);
    let tp: P;
    if (k === 0) tp = [pr[start][0], pr[start][1]];
    else if (k < 0) tp = [pr[end][0], pr[end][1]];
    else {
      const a = arc[k - 1], b = arc[k];
      const t = clamp((thr - lum[a]) / (lum[b] - lum[a] || 1), 0, 1);
      tp = [lerp(pr[a][0], pr[b][0], t), lerp(pr[a][1], pr[b][1], t)];
    }
    term.push(tp);
  }
  // 경계 다듬기(이동평균) — 손으로 그은 듯 매끈하게
  const sm = term.map((p, i) => {
    let sx = 0, cnt = 0;
    for (let d = -3; d <= 3; d++) { const q = term[i + d]; if (q) { sx += q[0]; cnt++; } }
    return [sx / cnt, p[1]] as P;
  });
  const side = shadowLeft ? left : right;
  // 경계가 외곽 밖으로 나가지 않게
  for (let i = 0; i < sm.length; i++) {
    if (shadowLeft) sm[i][0] = clamp(sm[i][0], left[i][0], right[i][0]);
    else sm[i][0] = clamp(sm[i][0], left[i][0], right[i][0]);
  }
  const shadow: P[] = [...sm, ...side.slice().reverse()];
  const sil: P[] = [...right, ...left.slice().reverse()];
  return { sil, shadow, left, right, ys };
}

// ───────────────────────── 목 ─────────────────────────
function neckLayer(x: Ctx, headSil: P[]): string {
  const { m, c, ap } = x;
  const end = (x.o.neckLen ?? 20.5) + 2.2;
  const L: P[] = [], R: P[] = [];
  for (const nl of m.neck) {
    if (nl.y > end + 0.01) break;
    const pr = neckRingPts(nl, 40).map(([X, Z]) => proj2(c, [X, nl.y, Z]));
    let a = pr[0], b = pr[0];
    for (const p of pr) { if (p[0] < a[0]) a = p; if (p[0] > b[0]) b = p; }
    L.push(a); R.push(b);
  }
  const pts: P[] = [...R, ...L.slice().reverse()];
  const s = ap.skin;
  const d = polyPath(pts);
  const id = uid('n');
  let inner = '';
  // 몸통 쪽 그림자(빛 반대편) + 턱이 드리우는 그림자
  inner += `<path fill-rule="evenodd" fill="${s.shade}" d="${outsideD(movePts(pts, mul(x.L2, 2.2)))}"/>`;
  const jaw = movePts(headSil, [-x.L2[0] * 0.8, 2.0]);
  inner += fillP(jaw, s.shade);
  inner += fillP(movePts(headSil, [-x.L2[0] * 0.4, 0.7]), s.deep, 'opacity="0.45"');
  // 흉쇄유돌근 — 근육질/마른 목에서 보이는 선
  if (x.det > 0.4) {
    for (const sd of [x.near] as const) {
      const pts3: V3[] = [[sd * 4.6, 2.2, -3.0], [sd * 4.2, 8, -0.6], [sd * 2.6, 14, 2.4], [sd * 0.9, 19.5, 4.6]];
      const pp = pts3.map((p) => x.pp(p));
      inner += fillP(tq(pp, brush(0.02, 0.22, 0.05, 0.55)), s.shade, 'opacity="0.55"');
    }
    // 목젖
    const ad = x.pp([0, 12.2, (m.neck[12]?.cz ?? -0.8) + (m.neck[12]?.f ?? 5.3) + 0.3]);
    inner += fillP(tq([add(ad, [0, -1.2]), add(ad, [0.15 * x.farScr, 0]), add(ad, [0, 1.1])], brush(0.02, 0.16, 0.02)), s.shade, 'opacity="0.5"');
  }
  return `<path d="${d}" fill="${s.base}"/>` + clipDef(id, d) + clipped(id, inner);
}

// ───────────────────────── 귀 ─────────────────────────
const EAR_OUT: P[] = [
  [0.35, -2.95], [-0.45, -3.62], [-1.55, -3.5], [-2.35, -2.68], [-2.66, -1.35], [-2.52, 0.1], [-2.08, 1.3],
  [-1.58, 2.22], [-0.98, 2.85], [-0.36, 2.92], [0.05, 2.38], [0.14, 1.55], [0.52, 0.85], [0.46, 0.1], [0.55, -1.2], [0.5, -2.3],
];
const EAR_ANTI: P[] = [[-0.55, -2.55], [-1.45, -2.3], [-1.88, -1.25], [-1.8, 0.05], [-1.3, 0.95]];
const EAR_HELIX: P[] = [[-0.25, -2.92], [-1.4, -3.02], [-2.08, -2.36], [-2.3, -1.15], [-2.12, 0.45], [-1.7, 1.45]];

function earLayer(x: Ctx, s: 1 | -1): string {
  const { m, ap } = x;
  const f = m.face;
  const k = f.earSize;
  const yE = m.ys(-0.45);
  const base = surfHead(m, s * 96, yE);
  const ctr: V3 = [base[0] - s * 0.15, yE, base[2] + 0.2];
  const tilt = 13 * D2R;
  const U: V3 = vnorm([s * -0.12 * (0.6 + f.earOut), 0, 1]);
  const map = ([u0, v0]: P): V3 => {
    const u = (u0 * Math.cos(tilt) - v0 * Math.sin(tilt)) * k;
    const v = (u0 * Math.sin(tilt) + v0 * Math.cos(tilt)) * k;
    const outw = s * Math.max(0, -u0) * (0.2 + 0.32 * f.earOut);
    return [ctr[0] + U[0] * u + outw, ctr[1] + v, ctr[2] + U[2] * u];
  };
  const nrm = vnorm([s, 0, 0.25 + 0.4 * f.earOut]);
  const facing = x.face(nrm);
  if (facing < -0.15 && s === x.near) return '';
  const lit = x.lit(nrm) > 0.12;
  const sk = ap.skin;
  const out = EAR_OUT.map((p) => x.pp(map(p)));
  const id = uid('e');
  const d = pathD(out);
  let g = `<path d="${d}" fill="${lit ? sk.base : sk.shade}"/>`;
  let inner = `<path fill-rule="evenodd" fill="${lit ? sk.shade : sk.deep}" d="${outsideD(movePts(out, mul(x.L2, 0.5)))}"/>`;
  if (facing > 0.15) {
    const con = [[-0.25, -0.55], [-0.95, -0.95], [-1.45, -0.35], [-1.35, 0.6], [-0.75, 1.15], [-0.15, 0.85], [0.15, 0.15]] as P[];
    inner += fillP(con.map((p) => x.pp(map(p))), sk.deep, `opacity="${lit ? 0.75 : 0.9}"`);
    inner += fillP(tq(EAR_ANTI.map((p) => x.pp(map(p))), brush(0.03, 0.17, 0.05)), lit ? sk.shade : sk.deep, 'opacity="0.85"');
    inner += fillP(tq(EAR_HELIX.map((p) => x.pp(map(p))), brush(0.02, 0.12, 0.02)), sk.deep, 'opacity="0.45"');
  }
  g += clipDef(id, d) + clipped(id, inner);
  if (x.lw) g = `<path d="${d}" fill="none" stroke="${sk.line}" stroke-width="${fx(x.lw * 1.6)}" stroke-linejoin="round"/>` + g;
  return g;
}

// ───────────────────────── 눈·눈썹 ─────────────────────────
function eyeGeom(x: Ctx, s: 1 | -1) {
  const { m } = x;
  const f = m.face;
  const X = s * 3.15 * f.eyeGap;
  const Y = m.eyeY;
  const Z = frontZ(m, X, Y) - 0.62 - 0.25 * Math.max(0, f.browRidge);
  const C: V3 = [X, Y, Z];
  const n = vnorm([s * 0.34, -0.04, 1]);
  // 바깥 눈꼬리 쪽 접선 (옆으로 + 살짝 뒤로)
  const Uc: V3 = vnorm([s * n[2], 0, -Math.abs(n[0])]);
  const V: V3 = [0, -1, 0];
  const w = 2.85 * f.eyeW;
  let h = 1.0 * f.eyeH;
  if (x.expr === 'smile') h *= 0.8;
  if (x.expr === 'determined') h *= 0.92;
  const tilt = 0.34 * f.eyeTilt;
  const heavy = clamp(f.lidHeavy + (x.expr === 'determined' ? 0.25 : 0), 0, 1.2);
  const up = h * (0.53 - 0.13 * heavy);
  const map = (u: number, v: number): V3 => {
    const bulge = 0.32 * (1 - Math.min(1, ((2 * u) / w) ** 2));
    return vadd(vadd(vadd(C, vmul(Uc, u)), vmul(V, v)), vmul(n, bulge));
  };
  const mono = f.lid === 'mono';
  const upper: P[] = [
    [-0.5 * w, 0.03], [-0.33 * w, (mono ? 0.22 : 0.33) * h + (mono ? 0 : 0.02)], [-0.07 * w, up],
    [0.22 * w, up * 0.93 + tilt * 0.4], [0.42 * w, up * 0.5 + tilt * 0.8], [0.5 * w, tilt],
  ];
  const lower: P[] = [
    [0.5 * w, tilt], [0.3 * w, -0.3 * h + tilt * 0.3 + (x.expr === 'smile' ? 0.14 : 0)], [0.02 * w, -0.4 * h + (x.expr === 'smile' ? 0.18 : 0)],
    [-0.3 * w, -0.3 * h + (x.expr === 'smile' ? 0.1 : 0)], [-0.5 * w, 0.03],
  ];
  return { C, n, Uc, V, w, h, tilt, up, map, upper, lower, mono };
}

function eyeLayer(x: Ctx, s: 1 | -1, clipFar: string): string {
  const { ap, m } = x;
  const f = m.face;
  const G = eyeGeom(x, s);
  const fc = x.face(G.n);
  if (fc < 0.06) return '';
  const pp = (uv: P) => x.pp(G.map(uv[0], uv[1]));
  const up2 = G.upper.map(pp), lo2 = G.lower.map(pp);
  const open: Q[] = [...up2.map((p, i) => (i === 0 || i === up2.length - 1 ? [p[0], p[1], 0] as Q : p)), ...lo2.slice(1, -1)];
  const id = uid('y');
  const dOpen = smoothPath(open);
  const sk = ap.skin;
  let g = '';
  // 눈두덩 그늘 (눈과 눈썹 사이, 코 쪽)
  if (x.det > 0.3) {
    const sock: P[] = [[-0.62 * G.w, 0.2], [-0.4 * G.w, 0.95 + 0.25 * Math.max(0, f.browRidge)], [0.1 * G.w, 1.15], [0.48 * G.w, 0.7], [0.4 * G.w, G.up * 0.7], [-0.1 * G.w, G.up + 0.05], [-0.45 * G.w, 0.35]];
    g += fillP(sock.map(pp), sk.shade, `opacity="${fx(0.32 + 0.3 * Math.max(0, f.browRidge) + (x.lit(G.n) < 0.35 ? 0.2 : 0))}"`);
  }
  // 흰자
  const ec = x.pp(G.C);
  const inBrim = !!x.shadowY && ec[1] < x.shadowY(ec[0]);
  const scl = inBrim ? mix(SCLERA, sk.deep, 0.4) : mix(SCLERA, sk.shade, 0.22);
  g += `<path d="${dOpen}" fill="${scl}"/>`;
  let inner = '';
  // 홍채
  const gz = (x.o.gaze ?? 0) * (s === x.near ? 1 : -1) * 0.13 * G.w;
  const ir = 0.6 * Math.pow(f.eyeH, 0.25);
  const ic: P = [0.02 * G.w + gz, -0.04 * G.h];
  const circ = (r: number, cx: number, cy: number): P[] => {
    const out: P[] = [];
    for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; out.push(pp([cx + Math.cos(a) * r, cy + Math.sin(a) * r])); }
    return out;
  };
  const irisC = mix(f.iris, '#000000', 0.05);
  inner += fillP(circ(ir, ic[0], ic[1]), irisC);
  inner += fillP(circ(ir * 0.66, ic[0] + 0.04, ic[1] - 0.06), mix(f.iris, '#ffffff', 0.1), 'opacity="0.35"');
  inner += fillP(circ(ir * 0.42, ic[0], ic[1]), '#0c0908');
  // 윗눈꺼풀 그림자
  inner += fillP([...up2, ...G.upper.slice().reverse().map(([u, v]) => pp([u, v - 0.3 * G.h - 0.08]))], adj(sk.deep, { l: -0.05 }), 'opacity="0.55"');
  // 눈동자 반사광 (작게)
  if (x.det > 0.45) {
    const cl = pp([ic[0] - 0.22 * ir * x.farScr * (s === x.near ? 1 : 1), ic[1] + 0.32 * ir]);
    inner += `<circle cx="${fx(cl[0])}" cy="${fx(cl[1])}" r="${fx(0.1)}" fill="#fff9f0" opacity="0.9"/>`;
  }
  g += clipDef(id, dOpen) + clipped(id, inner);
  // 속눈썹 선(윗눈꺼풀) — 바깥쪽이 두껍고 꼬리가 살짝
  const lashPts = [...up2];
  const tail = pp([0.5 * G.w + 0.22, G.tilt + 0.1]);
  lashPts.push(tail);
  const lw = (0.15 + (G.mono ? 0.03 : 0)) * (0.9 + 0.2 * f.lidHeavy);
  g += fillP(tq(lashPts, (t) => (t < 0.15 ? lerp(0.02, lw * 0.6, t / 0.15) : t < 0.8 ? lerp(lw * 0.6, lw, (t - 0.15) / 0.65) : lerp(lw, 0.015, (t - 0.8) / 0.2))), mix(LASH, ap.hair.shade, 0.2));
  // 쌍꺼풀/속쌍 선
  if (f.lid !== 'mono' && x.det > 0.3) {
    const gap = f.lid === 'double' ? 0.36 : 0.22;
    const u0 = f.lid === 'double' ? -0.38 : 0.0;
    const crease: P[] = [];
    for (let i = 0; i <= 6; i++) {
      const u = lerp(u0, 0.48, i / 6) * G.w;
      const t = (u / G.w + 0.5);
      const v = lerp(0.03, G.up, Math.sin(Math.PI * clamp(t * 0.95, 0, 1)) ** 0.8) + gap * (0.6 + 0.4 * Math.sin(Math.PI * t)) + G.tilt * t * 0.6;
      crease.push(pp([u, v]));
    }
    g += fillP(tq(crease, brush(0.01, 0.055, 0.01, 0.6)), sk.deep, 'opacity="0.8"');
  } else if (x.det > 0.3) {
    // 홑꺼풀: 눈꺼풀 위 살짝 그늘
    const lid: P[] = [];
    for (let i = 0; i <= 5; i++) { const u = lerp(-0.2, 0.45, i / 5) * G.w; lid.push(pp([u, G.up + 0.32])); }
    g += fillP(tq(lid, brush(0.01, 0.06, 0.01)), sk.shade, 'opacity="0.7"');
  }
  // 아랫눈꺼풀 (바깥 절반만, 연하게)
  if (x.det > 0.3) {
    const lo = lo2.slice(0, 3);
    g += fillP(tq(lo, brush(0.035, 0.05, 0.01, 0.3)), sk.deep, 'opacity="0.45"');
    if (f.bags > 0.35) {
      const bag: P[] = [];
      for (let i = 0; i <= 5; i++) { const u = lerp(0.35, -0.3, i / 5) * G.w; bag.push(pp([u, -0.52 * G.h - 0.2 - 0.12 * Math.sin((i / 5) * Math.PI)])); }
      g += fillP(tq(bag, brush(0.01, 0.045, 0.01)), sk.shade, `opacity="${fx(0.3 + 0.4 * (f.bags - 0.35))}"`);
    }
  }
  return clipFar && s !== x.near ? `<g clip-path="url(#${clipFar})">${g}</g>` : g;
}

function browLayer(x: Ctx, s: 1 | -1): string {
  const { m, ap } = x;
  const f = m.face;
  const nrm = vnorm([s * 0.45, -0.1, 1]);
  if (x.face(nrm) < 0.02) return '';
  const pts: P[] = [];
  const n = 8;
  const det = x.expr === 'determined', sm = x.expr === 'smile';
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const X = s * (1.1 * f.browGap * (det ? 0.9 : 1) + t * 4.7 * f.browLen);
    let Y = m.browY - f.browArch * 0.55 * Math.sin(Math.PI * Math.pow(t, 0.8)) * (1 - 0.3 * t) - f.browAngle * 0.62 * (t - 0.35);
    if (det) Y += 0.36 * Math.pow(1 - t, 2) - 0.06;
    if (sm) Y -= 0.12;
    Y += 0.35 * Math.max(0, -f.browRidge) * 0;
    const Z = frontZ(m, X, Y) + 0.1;
    pts.push(x.pp([X, Y, Z]));
  }
  const th = f.browThick * 1.3;
  const sh = f.browShape;
  // 굵기: 머리(안쪽) 넓고 꼬리로 가늘게. 일자형/꺾인형 차이
  const wf = (t: number) => {
    const head = 0.3 * th, peak = (0.32 + 0.06 * sh) * th, tail = 0.04 + 0.03 * th;
    return t < 0.12 ? lerp(head * 0.75, head, t / 0.12) : t < 0.5 ? lerp(head, peak, (t - 0.12) / 0.38) : lerp(peak, tail, Math.pow((t - 0.5) / 0.5, 1.4));
  };
  const lightHair = lum(ap.hair.color) > 0.5 && (ap.origin === 'KR' || ap.origin === 'JP' || ap.origin === 'TW');
  const col = lightHair ? '#2c2420' : mix(ap.hair.color, '#120e0c', 0.25);
  let g = '';
  if (f.browSlit === s) {
    const k = Math.round(n * 0.6);
    g += fillP(tq(pts.slice(0, k), (t) => wf(t * 0.6)), col);
    g += fillP(tq(pts.slice(k + 1), (t) => wf(0.65 + t * 0.35)), col);
  } else g += fillP(tq(pts, wf), col);
  // 눈썹 머리 쪽 결(몇 가닥)
  if (x.det > 0.65 && th > 0.5) {
    for (let i = 0; i < 4; i++) {
      const a = pts[Math.min(n, i)], b = pts[Math.min(n, i + 1)];
      const p0 = add(a, [0, 0.18]), p1 = add(lerpP(a, b, 0.8), [0, -0.22]);
      g += fillP(tq([p0, lerpP(p0, p1, 0.5), p1], brush(0.01, 0.05, 0.01)), col, 'opacity="0.7"');
    }
  }
  return g;
}

// ───────────────────────── 코 ─────────────────────────
function noseLayer(x: Ctx): string {
  const { m, ap } = x;
  const f = m.face;
  const sk = ap.skin;
  const nw = f.noseW;
  const cr = f.noseCrook * 0.35;
  const yN = m.ys(-2.4), yB = m.ys(-2.4 + 3.1 * f.noseL);
  const tipY = m.noseTipY, subY = m.subY;
  const mz = (y: number) => m.mid(y);
  const alaY = lerp(tipY, subY, 0.55), alaZ = mz(subY) - 0.95 - 0.25 * f.flat;
  let g = '';
  // 빛 반대쪽 콧등 면
  const nL = vnorm([1, 0, 0.75]), nR = vnorm([-1, 0, 0.75]);
  const lumL = x.lit(nL), lumR = x.lit(nR);
  const sd: 1 | -1 = lumL < lumR ? 1 : -1;
  const sideFacing = x.face(sd === 1 ? nL : nR);
  const side: V3[] = [
    [sd * 0.42 + cr * 0.3, yN + 0.35, mz(yN + 0.35) - 0.12],
    [sd * 0.62 + cr * 0.6, yB, mz(yB) - 0.2],
    [sd * 0.78 + cr, tipY - 0.35, mz(tipY - 0.35) - 0.45],
    [sd * 1.25 * nw + cr, alaY - 0.55, alaZ + 0.75],
    [sd * 1.78 * nw + cr * 0.6, alaY, alaZ],
    [sd * 1.4 * nw + cr * 0.5, subY - 0.05, alaZ + 0.35],
    [sd * 1.45, subY - 0.7, alaZ - 0.2],
    [sd * 1.1, yB, mz(yB) - 1.1],
    [sd * 0.8, yN + 0.6, mz(yN) - 0.7],
  ];
  const sp = side.map((p) => x.pp(p));
  g += fillP(sp, sk.shade, `opacity="${sideFacing > 0.1 ? 0.8 : 0.65}"`);
  // 코끝 아래(콧방울 밑) 그늘
  const under: V3[] = [
    [-1.3 * nw + cr, subY - 0.15, alaZ + 0.5], [cr, tipY + 0.55, mz(tipY + 0.55) - 0.05], [1.3 * nw + cr, subY - 0.15, alaZ + 0.5],
    [0.9 * nw + cr, subY + 0.05, alaZ + 0.75], [cr * 0.5, subY + 0.02, mz(subY) + 0.05], [-0.9 * nw + cr, subY + 0.05, alaZ + 0.75],
  ];
  g += fillP(under.map((p) => x.pp(p)), sk.shade, 'opacity="0.85"');
  // 콧구멍
  for (const s of [-1, 1] as const) {
    const nn = vnorm([s * 0.5, 0.75, 0.45]);
    const fcn = x.face(nn);
    if (fcn < 0.05 && s !== x.near) continue;
    const c0: V3 = [s * 0.62 * nw + cr, subY - 0.12, mz(subY) + 0.32];
    const pts: P[] = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      pts.push(x.pp([c0[0] + Math.cos(a) * 0.42 * nw * s, c0[1] + Math.sin(a) * 0.12, c0[2] + Math.sin(a) * 0.1 - Math.cos(a) * 0.18]));
    }
    g += fillP(pts, mix(sk.deep, '#1a0e0c', 0.35), `opacity="${fx(clamp(0.35 + fcn, 0.5, 0.95))}"`);
  }
  // 콧방울 선 (가까운 쪽 + 보이면 먼 쪽)
  for (const s of [x.near, (-x.near) as 1 | -1]) {
    const al: V3[] = [
      [s * 1.15 * nw + cr, alaY - 0.62, alaZ + 0.85],
      [s * 1.72 * nw + cr * 0.7, alaY - 0.15, alaZ + 0.1],
      [s * 1.62 * nw + cr * 0.6, subY - 0.2, alaZ + 0.2],
      [s * 1.12 * nw + cr * 0.5, subY + 0.02, alaZ + 0.6],
    ];
    if (s !== x.near && x.face(vnorm([s, 0.2, 0.5])) < 0.15) continue;
    g += fillP(tq(al.map((p) => x.pp(p)), brush(0.015, 0.11, 0.03, 0.4)), sk.deep, 'opacity="0.9"');
  }
  // 코 아래 인중 그림자 (빛 반대쪽으로 드리움)
  const cast: V3[] = [[cr, subY + 0.05, mz(subY) + 0.1], [sd * 1.0, subY + 0.15, mz(subY) - 0.3], [sd * 0.55, subY + 0.75, mz(subY + 0.75) - 0.1], [-sd * 0.2, subY + 0.55, mz(subY + 0.5) + 0.05]];
  g += fillP(cast.map((p) => x.pp(p)), sk.shade, 'opacity="0.55"');
  // 콧등·코끝 하이라이트
  if (x.det > 0.35) {
    const hs = -sd;
    const hl: P[] = [x.pp([hs * 0.12 + cr * 0.4, yN + 1.0, mz(yN + 1.0) + 0.02]), x.pp([hs * 0.2 + cr * 0.8, yB + 0.2, mz(yB + 0.2) + 0.02]), x.pp([hs * 0.18 + cr, tipY - 0.2, mz(tipY - 0.2) + 0.02])];
    g += fillP(tq(hl, brush(0.01, 0.13, 0.05, 0.7)), sk.light, 'opacity="0.8"');
    const tip = x.pp([hs * 0.25 + cr, tipY - 0.1, mz(tipY) + 0.03]);
    g += `<ellipse cx="${fx(tip[0])}" cy="${fx(tip[1])}" rx="${fx(0.32 * nw)}" ry="${fx(0.2)}" fill="${sk.light}" opacity="0.7"/>`;
  }
  return g;
}

// ───────────────────────── 입 ─────────────────────────
function mouthGeom(x: Ctx) {
  const { m } = x;
  const f = m.face;
  const smile = x.expr === 'smile', det = x.expr === 'determined';
  const mw = 2.42 * f.mouthW * (smile ? 1.06 : det ? 0.96 : 1);
  const corner = smile ? -0.46 : det ? 0.14 : 0.06;
  const Ym = m.mouthY;
  const line: V3[] = [];
  const N = 10;
  for (let i = 0; i <= N; i++) {
    const t = -1 + (2 * i) / N;
    const X = t * mw;
    const Y = Ym + corner * Math.pow(Math.abs(t), 3.2) - (smile ? 0.06 : 0) * (1 - t * t) + 0.03 * Math.sin(t * 9);
    const Z = frontZ(m, X, Y) + 0.12 * (1 - t * t);
    line.push([X, Y, Z]);
  }
  return { mw, Ym, line, corner, smile, det };
}

function mouthLayer(x: Ctx): string {
  const { m, ap } = x;
  const f = m.face;
  const sk = ap.skin;
  const G = mouthGeom(x);
  const mw = G.mw;
  let g = '';
  const lip = (t: number, dy: number, dz: number): V3 => {
    const X = t * mw * 0.94;
    const Y = G.Ym + dy;
    return [X, Y, frontZ(m, X, Y) + dz];
  };
  // 윗입술 (조금 어두운 면) — 큐피드 활 모양
  const thinU = (G.det ? 0.75 : 1) * f.lipU;
  const upTop: V3[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = -1 + (2 * i) / 10;
    const bow = 0.1 * Math.exp(-((t * 6) ** 2)) - 0.08 * Math.exp(-(((Math.abs(t) - 0.28) * 7) ** 2));
    upTop.push(lip(t, -0.5 * thinU * (1 - 0.65 * t * t) + bow + G.corner * Math.pow(Math.abs(t), 3.2) * 0.9, 0.05));
  }
  const ul: P[] = [...upTop.map((p) => x.pp(p)), ...G.line.slice().reverse().map((p) => x.pp(p))];
  g += fillP(ul, mix(sk.lip, sk.shade, 0.45), 'opacity="0.9"');
  // 아랫입술: 아래쪽 그늘만 (밝은 면은 피부색에 가깝게)
  const thinL = (G.det ? 0.8 : 1) * f.lipL;
  const lowB: V3[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = -1 + (2 * i) / 10;
    lowB.push(lip(t * 0.8, 0.62 * thinL * (1 - 0.5 * t * t) + G.corner * Math.pow(Math.abs(t), 3) * 0.5, 0.1));
  }
  const ll: P[] = [...G.line.map((p) => x.pp(p)), ...lowB.slice().reverse().map((p) => x.pp(p))];
  g += fillP(ll, mix(sk.lip, sk.base, 0.45), 'opacity="0.85"');
  // 아랫입술 아래 그늘
  const sh: V3[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = -0.6 + (1.2 * i) / 8;
    sh.push(lip(t, 0.62 * thinL * (1 - 0.5 * t * t) + 0.18, 0.02));
  }
  g += fillP(tq(sh.map((p) => x.pp(p)), brush(0.02, 0.2, 0.02, 0.5)), sk.shade, 'opacity="0.85"');
  // 아랫입술 하이라이트
  if (x.det > 0.4) {
    const hl: P[] = [lip(-0.22, 0.32 * thinL, 0.14), lip(0.05, 0.36 * thinL, 0.14), lip(0.28, 0.3 * thinL, 0.12)].map((p) => x.pp(p));
    g += fillP(tq(hl, brush(0.01, 0.08, 0.01)), sk.light, 'opacity="0.55"');
  }
  // 이 (웃을 때 일부)
  if (G.smile && x.r.fork('teeth').chance(0.6)) {
    const tt: V3[] = [];
    for (let i = 0; i <= 8; i++) { const t = -0.62 + (1.24 * i) / 8; tt.push(lip(t, -0.02 + 0.22 * (1 - t * t), 0.06)); }
    const top = G.line.slice(2, 9).map((p) => x.pp(p));
    g += fillP([...top, ...tt.slice().reverse().map((p) => x.pp(p))], '#efe8de');
  }
  // 입술 선 — 가운데 진하고 끝은 가늘게, 입꼬리 살짝 진하게
  const lp = G.line.map((p) => x.pp(p));
  g += fillP(tq(lp, brush(0.012, 0.075, 0.012, 0.5)), mix(sk.line, sk.lip, 0.3));
  for (const s of [-1, 1]) {
    const end = x.pp(G.line[s < 0 ? 0 : G.line.length - 1]);
    const dirY = G.smile ? -0.28 : G.det ? 0.22 : 0.12;
    const e2 = x.pp(vadd(G.line[s < 0 ? 0 : G.line.length - 1], [s * 0.18, dirY, -0.15]));
    g += fillP(tq([end, lerpP(end, e2, 0.5), e2], brush(0.03, 0.05, 0.01)), sk.deep, 'opacity="0.6"');
  }
  return g;
}

// ───────────────────────── 얼굴 잔디테일 ─────────────────────────
function faceDetails(x: Ctx): string {
  const { m, ap } = x;
  const f = m.face;
  const sk = ap.skin;
  let g = '';
  // 광대 아래 그늘 (마른/각진 얼굴)
  const hollow = clamp(0.55 - f.cheekFull, 0, 0.6) * (0.7 + 0.5 * Math.max(0, f.cheekProm));
  for (const s of [-1, 1] as const) {
    const nn = vnorm([s * 0.85, 0.1, 0.55]);
    if (x.face(nn) < 0.08) continue;
    const ph = (X: number, y: number): V3 => [X, y, frontZ(m, X, y)];
    if (hollow > 0.05) {
      const pts: V3[] = [ph(s * 6.5, m.ys(1.9)), ph(s * 4.9, m.ys(2.6)), ph(s * 4.4, m.ys(4.4)), ph(s * 5.2, m.ys(6.2)), ph(s * 6.0, m.ys(5.0))];
      g += fillP(pts.map((p) => x.pp(p)), sk.shade, `opacity="${fx(hollow * (x.lit(nn) < 0.3 ? 0.9 : 0.55))}"`);
    }
    // 팔자 주름
    const nlab = f.nasolabial + (x.expr === 'smile' ? 0.45 : 0);
    if (nlab > 0.2 && x.det > 0.35) {
      const yA = lerp(m.noseTipY, m.subY, 0.5);
      const mw = 2.42 * f.mouthW;
      const pts: V3[] = [ph(s * 2.05 * f.noseW, yA - 0.1), ph(s * 2.55, m.subY + 0.5), ph(s * (mw + 0.42), m.mouthY + 0.15), ph(s * (mw + 0.35), m.mouthY + 1.0)];
      const lineP = pts.map((p) => x.pp(vadd(p, [0, 0, 0.05])));
      g += fillP(tq(lineP, brush(0.02, 0.09 + 0.05 * nlab, 0.01, 0.35)), sk.shade, `opacity="${fx(clamp(nlab, 0, 1) * 0.85)}"`);
    }
  }
  // 이마 주름
  if (f.foreheadLines > 0.2 && !x.cap && !x.helmet) {
    for (let k = 0; k < 2; k++) {
      const y = m.ys(-6.3 - k * 0.85);
      const pts: P[] = [];
      for (let i = 0; i <= 6; i++) { const X = lerp(-3.3, 3.3, i / 6); pts.push(x.pp([X, y + 0.12 * Math.sin(i), frontZ(m, X, y) + 0.05])); }
      g += fillP(tq(pts, brush(0.01, 0.05, 0.01)), sk.shade, `opacity="${fx(f.foreheadLines * 0.7)}"`);
    }
  }
  // 미간 주름 (결연)
  if (x.expr === 'determined' && x.det > 0.4) {
    for (const s of [-1, 1]) {
      const X = s * 0.45;
      const pts = [x.pp([X, m.browY + 0.1, frontZ(m, X, m.browY + 0.1) + 0.05]), x.pp([X * 1.2, m.browY - 0.7, frontZ(m, X, m.browY - 0.7) + 0.05])];
      g += fillP(tq([pts[0], lerpP(pts[0], pts[1], 0.5), pts[1]], brush(0.01, 0.05, 0.01)), sk.shade, 'opacity="0.7"');
    }
  }
  // 턱 보조개
  if (f.chinCleft > 0) {
    const y0 = m.ys(8.4), y1 = m.ys(9.4);
    const pts = [x.pp([0, y0, m.mid(y0) + 0.05]), x.pp([0.05, (y0 + y1) / 2, m.mid((y0 + y1) / 2) + 0.05]), x.pp([0, y1, m.mid(y1)])];
    g += fillP(tq(pts, brush(0.01, 0.07 * f.chinCleft, 0.01)), sk.shade, 'opacity="0.8"');
  }
  // 광대 하이라이트 (빛 쪽)
  if (x.det > 0.4) {
    const s: 1 | -1 = x.lit(vnorm([1, 0, 0.6])) > x.lit(vnorm([-1, 0, 0.6])) ? 1 : -1;
    const y = m.ys(0.9);
    const pts: V3[] = [[s * 4.3, y - 0.2, frontZ(m, s * 4.3, y - 0.2) + 0.03], [s * 5.4, y + 0.1, frontZ(m, s * 5.4, y + 0.1) + 0.03], [s * 6.0, y + 0.6, frontZ(m, s * 6.0, y + 0.6) + 0.03]];
    g += fillP(tq(pts.map((p) => x.pp(p)), brush(0.02, 0.3, 0.02, 0.4)), sk.light, 'opacity="0.55"');
    // 이마 하이라이트
    if (!x.cap && !x.helmet) {
      const fy = m.ys(-6.2);
      const fp: V3[] = [[-1.5 + s, fy, frontZ(m, -1.5 + s, fy) + 0.03], [s * 1.5, fy - 0.4, frontZ(m, s * 1.5, fy - 0.4) + 0.03], [s * 3.2, fy - 0.1, frontZ(m, s * 3.2, fy) + 0.03]];
      g += fillP(tq(fp.map((p) => x.pp(p)), brush(0.02, 0.45, 0.02, 0.5)), sk.light, 'opacity="0.45"');
    }
  }
  // 점
  if (f.mole) {
    const X = f.mole.x * 4.5, Y = m.ys(lerp(0.5, 6.5, f.mole.y));
    if (Math.abs(X) > 1.3 || Y > m.mouthY + 1) {
      const p = x.pp([X, Y, frontZ(m, X, Y) + 0.05]);
      g += `<circle cx="${fx(p[0])}" cy="${fx(p[1])}" r="0.13" fill="${sk.deep}" opacity="0.85"/>`;
    }
  }
  // 주근깨
  if (f.freckles > 0 && x.det > 0.5) {
    const fr = new Rng(ap.id).fork('freckle');
    for (let i = 0; i < 26; i++) {
      const X = fr.range(-4.6, 4.6), Y = m.ys(fr.range(-0.6, 2.4));
      if (Math.abs(X) < 1.2 && Y > m.ys(-1)) continue;
      const p = x.pp([X, Y, frontZ(m, X, Y) + 0.05]);
      g += `<circle cx="${fx(p[0])}" cy="${fx(p[1])}" r="${fx(fr.range(0.05, 0.1))}" fill="${sk.shade}" opacity="${fx(0.5 * f.freckles)}"/>`;
    }
  }
  return g;
}

// ───────────────────────── 머리카락 ─────────────────────────
function capBandY(x: Ctx, phi: number): number {
  const a = Math.abs(((phi + 540) % 360) - 180);
  return -6.15 + x.capLow + 4.05 * (1 - Math.cos(a * D2R)) / 2 + (x.helmet ? 0.5 : 0);
}

function hairBottom(x: Ctx, a: number): number {
  const { ap, m } = x;
  const h = ap.hair;
  const f = m.face;
  const st = h.style;
  const rec = h.hairline;
  const front = m.ys(-8.35) - rec * 1.4 + (st === 'buzz' ? 0.15 : 0);
  const temple = front - rec * 1.7 - 0.25;
  const fh = ap.facialHair.kind;
  const sb = fh === 'sideburns' ? 2.6 : fh === 'beard' || fh === 'full' || fh === 'chinstrap' ? 1.6 : h.sideburn;
  const earTop = -3.8 * f.earSize - 0.25;
  const long = st === 'flow' || st === 'locs';
  const bushy = st === 'perm' || st === 'curls';
  const earY = bushy ? earTop + 1.3 : earTop;
  const nape = 3.0 + (bushy ? 1.2 : 0) + (st === 'buzz' ? -0.4 : 0);
  if (a < 34) return lerp(front, temple, (a / 34) ** 2);
  if (a < 58) return lerp(temple, -3.4, smooth01((a - 34) / 24));
  if (a < 67) return lerp(-3.4, sb, smooth01((a - 58) / 9));
  if (a < 80) return sb;
  if (a < 88) return lerp(sb, earY, smooth01((a - 80) / 8));
  if (long) {
    const L = (st === 'locs' ? 13 : 8.5) * h.length;
    if (a < 96) return earY;
    return lerp(earY, L, smooth01((a - 96) / 34));
  }
  if (a < 110) return earY;
  if (a < 132) return lerp(earY, nape - 0.9, smooth01((a - 110) / 22));
  return lerp(nape - 0.9, nape, smooth01((a - 132) / 48));
}

function hairVol(x: Ctx, a: number, t: number, y: number, phi: number): number {
  const h = x.ap.hair;
  const st = h.style;
  const v = h.volume;
  let top: number, side: number;
  switch (st) {
    case 'buzz': top = 0.14; side = 0.1; break;
    case 'crew': top = 1.0 * v; side = 0.42; break;
    case 'twoblock': top = 2.1 * v; side = 0.12; break;
    case 'textured': top = 2.5 * v; side = 0.85; break;
    case 'flow': top = 1.5 * v; side = 1.25; break;
    case 'tied': top = 0.9; side = 0.55; break;
    case 'perm': top = 2.0 * v; side = 1.8; break;
    case 'curls': top = 1.5 * v; side = 1.15; break;
    case 'locs': top = 1.4 * v; side = 1.2; break;
  }
  let vol = st === 'twoblock' ? (t < 0.5 ? top : lerp(top, side, smooth01((t - 0.5) / 0.12))) : lerp(top, side, Math.pow(t, 1.4));
  if (st === 'flow' || st === 'locs') vol += (a > 95 ? 1.8 * Math.pow(clamp((y - 0) / 9, 0, 1), 2) : 0);
  if (st === 'perm' || st === 'curls') vol += 0.4 * Math.abs(Math.sin(phi * (st === 'perm' ? 0.16 : 0.24) + t * 9));
  // 모자/헬멧 아래는 눌려 있다가 모자 끝 아래로 살짝 부풂
  if (x.cap || x.helmet) {
    const band = capBandY(x, phi);
    const flare = st === 'perm' || st === 'curls' ? 0.75 : st === 'flow' || st === 'locs' ? 0.6 : st === 'textured' ? 0.38 : st === 'crew' || st === 'tied' ? 0.22 : 0.1;
    if (y < band + 0.3) vol = Math.min(vol, 0.3);
    else if (st !== 'buzz') vol = Math.min(vol, 0.5 + (y - band) * flare);
  }
  return vol;
}

function hairLayer(x: Ctx): { back: string; front: string } {
  const { m, ap, c } = x;
  const h = ap.hair;
  const cols: V3[][] = [];
  const ROWS_N = 12;
  for (let k = 0; k <= 120; k++) {
    const phi = -180 + k * 3;
    const a = Math.abs(phi);
    const yb = hairBottom(x, a);
    const y0 = m.yTop + 0.25;
    const col: V3[] = [];
    for (let r = 0; r <= ROWS_N; r++) {
      const t = r / ROWS_N;
      const y = lerp(y0, yb, Math.pow(t, 0.9));
      const p = surfScalp(m, phi, y);
      const n = normScalp(m, phi, y);
      col.push(vadd(p, vmul(n, hairVol(x, a, t, y, phi))));
    }
    cols.push(col);
  }
  const back = sheetPolys(cols, c, 'all');
  const front = sheetPolys(cols, c, 'front');
  const buzzy = h.style === 'buzz' || (h.style === 'twoblock' && (x.cap || x.helmet));
  const fadeOp = buzzy ? 0.62 - h.fade * 0.2 : 1;
  const col = buzzy ? mix(h.color, ap.skin.shade, 0.25) : h.color;
  const backD = polysD(back);
  const frontD = polysD(front);
  let bk = `<path d="${backD}" fill="${mix(col, h.shade, 0.5)}" opacity="${fx(fadeOp)}"/>`;
  // 묶은 머리(번) — 모자 뒤 아래로
  if (h.style === 'tied') {
    const bunC: V3 = [0, (x.cap || x.helmet) ? capBandY(x, 180) + 1.4 : m.ys(-7.5), -10.6];
    const pts: P[] = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      pts.push(proj2(c, [bunC[0] + Math.cos(a) * 1.9, bunC[1] + Math.sin(a) * 1.5, bunC[2] - 0.6 + Math.sin(a) * 0.2]));
    }
    bk += fillP(pts, h.shade);
  }
  let fr = '';
  if (frontD) {
    const id = uid('hr');
    let inner = '';
    const fpts = front.flat();
    if (fpts.length > 2) {
      // 그림자: 빛 반대쪽 — 모양 전체를 빛 쪽으로 밀어 낸 차집합
      const [x0, y0, x1, y1] = bbox(fpts);
      const off = mul(x.L2, 0.9);
      inner += `<path fill-rule="evenodd" fill="${h.shade}" d="M${fx(x0 - 30)} ${fx(y0 - 30)}H${fx(x1 + 30)}V${fx(y1 + 30)}H${fx(x0 - 30)}Z${polysD(front.map((p) => movePts(p, off) as P[]))}"/>`;
      // 결: 정수리에서 아래로 흐르는 몇 가닥 (모자 없을 때 위주)
      if (x.det > 0.5) {
        const sr = new Rng(ap.id).fork('strand');
        const nS = x.cap || x.helmet ? 10 : 22;
        for (let i = 0; i < nS; i++) {
          const k = sr.int(0, 119);
          const colm = cols[k];
          const r0 = sr.int(x.cap || x.helmet ? 7 : 1, ROWS_N - 3);
          const seg = [colm[r0], colm[Math.min(ROWS_N, r0 + 2)], colm[Math.min(ROWS_N, r0 + 3)]].map((p) => proj2(c, p));
          if (area([seg[0], seg[1], add(seg[2], [0.01, 0.01])]) === 0 && dist(seg[0], seg[2]) < 0.2) continue;
          inner += fillP(tq(seg, brush(0.01, 0.1, 0.01, 0.4)), sr.chance(0.5) ? h.light : h.shade, 'opacity="0.6"');
        }
      }
    }
    // 파마·곱슬: 작은 컬 무늬
    if ((h.style === 'perm' || h.style === 'curls' || h.style === 'locs') && x.det > 0.4) {
      const cr = new Rng(ap.id).fork('curl');
      for (let i = 0; i < 70; i++) {
        const k = cr.int(0, 119), rr = cr.int(2, ROWS_N - 1);
        const p3 = cols[k][rr];
        const n3 = normScalp(m, -180 + k * 3, p3[1]);
        if (x.face(n3) < 0.12) continue;
        const q = proj2(c, p3);
        const rad = (h.style === 'curls' ? 0.32 : 0.42) * cr.range(0.8, 1.2);
        const a0 = cr.range(0, 6.28);
        const arc: P[] = [];
        for (let j = 0; j <= 5; j++) { const a = a0 + (j / 5) * 3.6; arc.push([q[0] + Math.cos(a) * rad, q[1] + Math.sin(a) * rad * 0.8]); }
        inner += fillP(tq(arc, brush(0.01, 0.09, 0.01, 0.5)), cr.chance(0.35) ? h.light : h.shade, 'opacity="0.75"');
      }
    }
    fr = `<path d="${frontD}" fill="${col}" opacity="${fx(fadeOp)}"/>` + clipDef(id, frontD) + clipped(id, inner);
    if (buzzy) fr = `<g opacity="${fx(Math.min(1, fadeOp + 0.15))}">` + fr.replace(`opacity="${fx(fadeOp)}"`, '') + '</g>';
  }
  // 모자 아래로 삐져나온 머리 끝 — 머리 모양 차이가 모자 쓴 상태에서도 보이게
  if ((x.cap || x.helmet) && h.style !== 'buzz' && h.style !== 'twoblock') {
    const cfg: Record<string, [number, number]> = { crew: [7, 0.55], textured: [14, 1.05], flow: [16, 1.7], tied: [8, 0.7], perm: [20, 1.15], curls: [20, 0.85], locs: [12, 1.4] };
    const [nT, lenK] = cfg[h.style] ?? [8, 0.6];
    const tr = new Rng(ap.id).fork('tuft');
    for (const s of [-1, 1] as const) {
      for (let i = 0; i < nT; i++) {
        const phi = s * lerp(62, 176, (i + tr.range(0.2, 0.8)) / nT);
        const a = Math.abs(phi);
        if (a > 86 && a < 108 && h.style !== 'flow' && h.style !== 'locs') continue; // 귀 위는 짧게 생략
        const yb = capBandY(x, phi) + 0.2;
        const root = vadd(surfScalp(m, phi, yb), vmul(normScalp(m, phi, yb), 0.45));
        const n3 = normScalp(m, phi, yb);
        const L = lenK * tr.range(0.7, 1.25);
        const tip: V3 = vadd(vadd(root, vmul(n3, 0.55 * L)), [0, (h.style === 'perm' || h.style === 'curls' ? 0.7 : 1.15) * L, 0]);
        const mid: V3 = vadd(vlerp3(root, tip, 0.5), vmul(n3, 0.25 * L));
        const pts = [root, mid, tip].map((p) => proj2(c, p));
        const stroke = fillP(tq(pts, brush(0.32 * Math.min(1.3, L), 0.24 * Math.min(1.3, L), 0.02, 0.3)), tr.chance(0.3) ? h.shade : col);
        if (x.face(n3) > 0.02) fr += stroke;
        else bk += stroke;
      }
    }
  }
  return { back: bk, front: fr };
}

// ───────────────────────── 수염 ─────────────────────────
function beardLayer(x: Ctx): { front: string; chin: string } {
  const { m, ap, c } = x;
  const fh = ap.facialHair;
  if (fh.kind === 'none' || fh.kind === 'sideburns') return { front: '', chin: '' };
  const f = m.face;
  const mw = 2.42 * f.mouthW;
  const Ym = m.mouthY;
  const subY = m.subY;
  const lipB = m.lipBotY;
  const sb = 1.6;
  const backPhi = (y: number) => lerp(80, 116, sstep(0.5, 7.8, y));
  const wob = (u: number, k: number) => 0.12 * Math.sin(u * 23 + k) + 0.07 * Math.sin(u * 41 + k * 2.3);
  const sheets: { grid: V3[][]; op: number }[] = [];
  const stub = fh.kind === 'stubble';
  const L0 = stub ? 0.04 : fh.length;
  const mkGrid = (cols: number, rows: number, fn: (u: number, v: number) => { phi: number; y: number; off: number }): V3[][] => {
    const g: V3[][] = [];
    for (let i = 0; i <= cols; i++) {
      const u = -1 + (2 * i) / cols;
      const col: V3[] = [];
      for (let j = 0; j <= rows; j++) {
        const v = j / rows;
        const q = fn(u, v);
        const p = surfHead(m, q.phi, q.y);
        const n = normHead(m, q.phi, q.y);
        col.push(vadd(p, vmul(n, q.off)));
      }
      g.push(col);
    }
    return g;
  };
  const mcPhi = phiAtX(m, mw + 0.35, Ym);
  const cheekTop = (au: number) => {
    // |u|: 1 = 구레나룻 아래, 0.34 = 입꼬리 바깥
    const t = clamp((au - 0.34) / 0.66, 0, 1);
    return lerp(Ym - 0.3, sb, Math.pow(t, 0.85)) + (fh.kind === 'full' ? -0.6 * t : 0);
  };
  const jawBand = fh.kind === 'chinstrap';
  if (fh.kind === 'beard' || fh.kind === 'full' || fh.kind === 'stubble' || jawBand) {
    sheets.push({
      op: stub ? 0.2 + 0.14 * fh.density : 1,
      grid: mkGrid(40, 14, (u, v) => {
        const au = Math.abs(u);
        const inner = au < 0.34;
        let yTop = inner ? lipB + 0.22 : cheekTop(au);
        if (jawBand) yTop = inner ? m.ys(8.0) : lerp(m.ys(7.6), sb + 0.6, Math.pow((au - 0.34) / 0.66, 0.7));
        const yBot = m.yBot;
        const y = lerp(yTop + (v === 0 ? wob(u, 1) * 0.6 : 0), yBot, Math.pow(v, 0.85));
        const span = backPhi(y);
        const phiW = inner ? lerp(0, mcPhi, au / 0.34) : lerp(mcPhi, span, (au - 0.34) / 0.66);
        const chinBoost = fh.kind === 'full' ? 1.4 * Math.pow(v, 1.5) * (1 - 0.5 * au) : 0.35 * Math.pow(v, 2) * (1 - au);
        // 턱 옆·뒤로 갈수록 얇게 — 털이 옆으로 부풀면 목도리처럼 보인다
        const sideThin = 1 - 0.55 * sstep(0.5, 1, au);
        return { phi: Math.sign(u) * phiW, y, off: (L0 * (0.55 + 0.45 * v) + chinBoost * L0) * sideThin + (v > 0.95 ? wob(u, 3) * L0 * 0.4 : 0) };
      }),
    });
  }
  const wantMus = fh.kind === 'mustache' || fh.kind === 'goatee' || fh.kind === 'beard' || fh.kind === 'full' || fh.kind === 'stubble';
  if (wantMus) {
    const drop = fh.kind === 'goatee' ? lipB + 0.5 - Ym : 0.25;
    sheets.push({
      op: stub ? 0.2 + 0.14 * fh.density : 1,
      grid: mkGrid(22, 6, (u, v) => {
        const au = Math.abs(u);
        const y0 = subY + 0.2 + 0.42 * Math.pow(au, 1.6);
        const y1 = Ym - 0.08 + Math.pow(au, 3) * drop + (fh.kind === 'mustache' ? 0.3 * au * au : 0);
        const y = lerp(y0, y1, v);
        return { phi: u * (mcPhi + (fh.kind === 'goatee' ? 3 : 1)), y, off: (stub ? 0.03 : Math.min(0.45, L0 * 0.6)) * (0.6 + 0.4 * v) };
      }),
    });
  }
  if (fh.kind === 'goatee' || fh.kind === 'chin') {
    const chinPhi = fh.kind === 'goatee' ? mcPhi : 16 + 8 * f.chinW;
    sheets.push({
      op: 1,
      grid: mkGrid(20, 10, (u, v) => {
        const au = Math.abs(u);
        const yTop = fh.kind === 'goatee' ? lipB + 0.2 - (au > 0.85 ? (au - 0.85) * 6 * (lipB - Ym + 0.4) : 0) : lipB + 0.45 + 0.4 * au;
        const y = lerp(yTop, m.yBot, Math.pow(v, 0.9));
        const narrow = fh.kind === 'chin' ? 1 - 0.55 * v : 1 - 0.35 * v;
        return { phi: u * chinPhi * narrow, y, off: fh.length * (0.5 + 0.9 * Math.pow(v, 1.6)) * (1 - 0.4 * au) };
      }),
    });
  }
  const col = stub ? mix(fh.color, ap.skin.shade, 0.35) : fh.color;
  const shadeC = adj(col, { l: -0.07 });
  const lightC = adj(col, { l: 0.08, c: -0.01 });
  let front = '', chin = '';
  for (const s of sheets) {
    // 맨 윗줄(볼 경계)은 반투명 — 칼로 자른 듯한 경계를 피한다
    const edge = s.grid.map((cl) => cl.slice(0, 2));
    const body = s.grid.map((cl) => cl.slice(1));
    const fpE = sheetPolys(edge, c, 'front');
    const fp = sheetPolys(body, c, 'front');
    const bp = sheetPolys(s.grid, c, 'back');
    const fd = polysD(fp), bd = polysD(bp), ed = polysD(fpE);
    if (bd && !stub) chin += `<path d="${bd}" fill="${shadeC}" opacity="${fx(s.op)}"/>`;
    if (ed) front += `<path d="${ed}" fill="${col}" opacity="${fx(s.op * (stub ? 0.6 : 0.55))}"/>`;
    if (fd) {
      const id = uid('bd');
      const all = fp.flat();
      let inner = '';
      if (!stub && all.length) {
        const [x0, y0, x1, y1] = bbox(all);
        const off = mul(x.L2, 0.9);
        inner += `<path fill-rule="evenodd" fill="${shadeC}" d="M${fx(x0 - 30)} ${fx(y0 - 30)}H${fx(x1 + 30)}V${fx(y1 + 30)}H${fx(x0 - 30)}Z${polysD(fp.map((p) => movePts(p, off) as P[]))}"/>`;
        // 털 결 — 짧은 획 몇 개
        if (x.det > 0.55) {
          const cols = s.grid.length, rows = s.grid[0].length;
          for (let i = 1; i < cols - 1; i += 2) {
            for (let j = 1; j < rows - 2; j += 3) {
              const a = proj2(c, s.grid[i][j]), b2 = proj2(c, s.grid[i][Math.min(rows - 1, j + 2)]);
              if (area([a, b2, add(b2, [0.05, 0.05])]) === 0 && dist(a, b2) < 0.05) continue;
              const wv = ((i * 7 + j * 13) % 5) / 5;
              const mid = lerpP(a, b2, 0.5);
              const tip = add(b2, [(wv - 0.5) * 0.3, 0]);
              inner += fillP(tq([a, mid, tip], brush(0.01, 0.07, 0.005, 0.4)), wv > 0.5 ? lightC : shadeC, 'opacity="0.55"');
            }
          }
        }
      }
      front += `<g opacity="${fx(s.op)}"><path d="${fd}" fill="${col}"/>${inner ? clipDef(id, fd) + clipped(id, inner) : ''}</g>`;
    }
  }
  return { front, chin };
}

// ───────────────────────── 모자 ─────────────────────────
interface Brim { inner: V3[]; outer: V3[] }

function capGeom(x: Ctx): { rings: V3[][]; brim: Brim } {
  const { m } = x;
  const rings: V3[][] = [];
  const helmet = x.helmet;
  const T = [0, 0.06, 0.14, 0.24, 0.35, 0.47, 0.6, 0.72, 0.83, 0.92, 0.97, 1];
  const flapS = x.o.flap === 'L' ? 1 : -1; // 캐릭터 왼쪽 = +X
  for (const t of T) {
    const ring: V3[] = [];
    for (let k = 0; k < 90; k++) {
      const phi = -180 + k * 4;
      const a = Math.abs(phi);
      let yb = capBandY(x, phi);
      if (helmet) {
        // 귀 쪽은 귀를 감싸고, 귀덮개 쪽은 턱선 근처까지
        const onFlap = Math.sign(phi) === flapS;
        const earZone = sstep(52, 70, a) * (1 - sstep(118, 136, a));
        if (onFlap) yb = lerp(yb, 2.6, earZone);
        else yb = lerp(yb, -3.0, earZone * 0.7);
        yb = lerp(yb, 0.4, sstep(140, 180, a));
      }
      const yTopC = m.yTop + 0.05;
      const y = lerp(yb, yTopC, Math.pow(t, 1.15));
      const p = surfScalp(m, phi, y);
      const n = normScalp(m, phi, y);
      let clr = helmet ? 1.45 + 0.3 * t : 0.55 + 0.22 * t;
      if (!helmet) clr += 0.95 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 1.1) * Math.pow(Math.max(0, Math.cos(phi * D2R)), 3);
      if (helmet && Math.sign(phi) === flapS) clr += 0.5 * sstep(50, 80, a) * (1 - sstep(115, 140, a)) * (1 - t);
      ring.push(vadd(p, vmul(n, clr)));
    }
    rings.push(ring);
  }
  // 챙
  const inner: V3[] = [], outer: V3[] = [];
  const NB = 24;
  const span = helmet ? 58 : 80;
  const band0 = rings[0];
  const at = (phi: number) => {
    const k = (phi + 180) / 4;
    const i = Math.floor(k), t = k - i;
    return vlerp3(band0[((i % 90) + 90) % 90], band0[(((i + 1) % 90) + 90) % 90], t);
  };
  const front = at(0);
  const side = at(span);
  const D = helmet ? 4.4 : 7.3;
  const tilt = (helmet ? 14 : 9 + 5 * x.brimCurve) * D2R;
  const Xe = side[0] + (helmet ? 0.3 : 0.7);
  for (let i = 0; i <= NB; i++) {
    const s = -1 + (2 * i) / NB;
    const I = at(s * span);
    inner.push([I[0], I[1] + 0.12, I[2]]);
    const psi = s * Math.PI * 0.5;
    const cz = Math.cos(psi);
    const zf = front[2] + D * Math.cos(tilt);
    const zc = side[2];
    const Z = zc + (zf - zc) * Math.pow(Math.max(0, cz), helmet ? 0.55 : 0.68);
    const X = Math.sign(s) * Xe * Math.pow(Math.abs(Math.sin(psi)), 0.92);
    const yFront = front[1] + D * Math.sin(tilt);
    const Y = lerp(yFront, helmet ? capBandY(x, span) : side[1], Math.sin(psi) ** 2) + (helmet ? 0.15 : 0.95 * x.brimCurve) * Math.sin(2 * psi) ** 2;
    outer.push([X, Y, Z]);
  }
  return { rings, brim: { inner, outer } };
}

function vlerp3(a: V3, b: V3, t: number): V3 { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }

function capLayer(x: Ctx, geo: { rings: V3[][]; brim: Brim }): { back: string; front: string } {
  const { c, kit } = x;
  const helmet = x.helmet;
  const baseCol = helmet ? kit.helmet : kit.cap;
  const tn = toneOf(baseCol, { shade: 0.085 });
  const { front, back } = domeOutline(geo.rings, c);
  let bk = fillP(back.map((p) => [p[0], p[1]] as Q), tn.shade);
  // 앞 돔
  const id = uid('cp');
  const fd = polyPath(front);
  let inner = '';
  const fpts = front as Q[];
  inner += `<path fill-rule="evenodd" fill="${tn.shade}" d="${outsideD(movePts(fpts, mul(x.L2, helmet ? 2.2 : 2.6)))}"/>`;
  inner += `<path fill-rule="evenodd" fill="${tn.deep}" d="${outsideD(movePts(fpts, mul(x.L2, 0.7)))}" opacity="0.6"/>`;
  // 패널 솔기
  if (!helmet && x.det > 0.35) {
    for (const ph of [0, 60, -60, 120, -120]) {
      const k = Math.round((ph + 180) / 4) % 90;
      const seg: P[] = [];
      for (let ti = 1; ti < geo.rings.length - 1; ti++) {
        const p = geo.rings[ti][k];
        const n = vnorm(vsub(p, [0, -6, -1]));
        if (x.face(n) > 0.05) seg.push(proj2(c, p));
      }
      if (seg.length > 2) inner += `<path d="${smoothPath(seg, false)}" fill="none" stroke="${tn.deep}" stroke-width="0.09" opacity="0.55"/>`;
    }
    // 단추
    const top = proj2(c, geo.rings[geo.rings.length - 1][0]);
    inner += `<ellipse cx="${fx(top[0])}" cy="${fx(top[1] + 0.1)}" rx="0.6" ry="0.3" fill="${tn.light}"/>`;
    // 숨구멍
    for (const ph of [32, -32, 92, -92]) {
      const k = Math.round((ph + 180) / 4) % 90;
      const p = geo.rings[8][k];
      const n = vnorm(vsub(p, [0, -6, -1]));
      if (x.face(n) < 0.2) continue;
      const q = proj2(c, p);
      inner += `<ellipse cx="${fx(q[0])}" cy="${fx(q[1])}" rx="${fx(0.18 * clamp(x.face(n), 0.3, 1))}" ry="0.18" fill="${tn.deep}"/>`;
    }
  }
  if (helmet) {
    // 귀덮개 귓구멍
    const fs = x.o.flap === 'L' ? 1 : -1;
    const ear = surfScalp(x.m, fs * 96, -0.3);
    const ep: V3 = [ear[0] + fs * 1.7, -0.3, ear[2] - 0.2];
    const nn = vnorm([fs, 0, 0.2]);
    if (x.face(nn) > 0.1) {
      const pts: P[] = [];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        pts.push(proj2(c, [ep[0], ep[1] + Math.sin(a) * 1.0, ep[2] + Math.cos(a) * 0.8]));
      }
      inner += fillP(pts, tn.deep);
    }
    // 광택 (절제)
    if (!kit.helmetMatte) {
      const hl: P[] = [];
      for (let i = 0; i <= 8; i++) {
        const ph = lerp(-50, 40, i / 8) + (x.L[0] > 0 ? 20 : -20);
        const k = Math.round((ph + 180) / 4) % 90;
        hl.push(proj2(c, geo.rings[7][(k + 90) % 90]));
      }
      inner += fillP(tq(hl, brush(0.02, 0.55, 0.02, 0.5)), '#ffffff', 'opacity="0.28"');
    }
    // 통풍 구멍
    for (const ph of [25, -25]) {
      const k = Math.round((ph + 180) / 4) % 90;
      const p = geo.rings[9][k];
      const n = vnorm(vsub(p, [0, -6, -1]));
      if (x.face(n) < 0.15) continue;
      const q = proj2(c, p);
      inner += `<ellipse cx="${fx(q[0])}" cy="${fx(q[1])}" rx="${fx(0.45 * clamp(x.face(n), 0.3, 1))}" ry="0.28" fill="${tn.deep}"/>`;
    }
  }
  // 로고
  const lp = geo.rings[helmet ? 4 : 4][45];
  const ln = vnorm(vsub(geo.rings[5][45], geo.rings[3][45]));
  const nrm = vnorm(vcross([1, 0, 0], ln));
  const fc = x.face(vmul(nrm, -1)) > 0 ? x.face(vmul(nrm, -1)) : x.face(nrm);
  const fcx = Math.cos(x.o.yaw * D2R);
  if (fcx > 0.2 && fc > 0.1) {
    const q = proj2(c, lp);
    const sz = helmet ? 3.2 : 4.0;
    const k = x.kit.team.cap;
    inner += `<text x="0" y="0" transform="translate(${fx(q[0])} ${fx(q[1] + sz * 0.36)}) scale(${fx(x.o.mirror ? -fcx : fcx)} 1)" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-style="italic" font-size="${fx(sz)}" fill="${kit.capLogo}" stroke="${kit.capLogoLine}" stroke-width="0.22" paint-order="stroke" letter-spacing="-0.2">${k}</text>`;
  }
  let fr = '';
  if (x.lw) fr += `<path d="${fd}" fill="none" stroke="${tn.line}" stroke-width="${fx(x.lw * 2)}" stroke-linejoin="round"/>`;
  fr += `<path d="${fd}" fill="${baseCol}"/>` + clipDef(id, fd) + clipped(id, inner);
  // 챙
  fr += brimLayer(x, geo.brim, helmet ? kit.helmet : kit.capBrim);
  bk += '';
  return { back: bk, front: fr };
}

function brimLayer(x: Ctx, b: Brim, color: string): string {
  const { c } = x;
  const tn = toneOf(color, { shade: 0.09 });
  const I = b.inner.map((p) => proj2(c, p));
  const O = b.outer.map((p) => proj2(c, p));
  const Ot = b.outer.map((p) => proj2(c, [p[0], p[1] + 0.38, p[2]]));
  // 윗면이 보이는지
  const mid = Math.floor(b.inner.length / 2);
  const tA = vsub(b.outer[mid + 1], b.outer[mid - 1]);
  const tB = vsub(b.outer[mid], b.inner[mid]);
  let up = vnorm(vcross(tA, tB));
  if (up[1] > 0) up = vmul(up, -1);
  const topVis = x.face(up) > 0;
  let g = '';
  // 두께(앞 테두리)
  g += fillP([...O, ...Ot.slice().reverse()] as Q[], tn.deep);
  const poly: P[] = [...I, ...O.slice().reverse()];
  const id = uid('br');
  const d = polyPath(poly);
  if (x.lw) g += `<path d="${d}" fill="none" stroke="${tn.line}" stroke-width="${fx(x.lw * 2)}" stroke-linejoin="round"/>`;
  g += `<path d="${d}" fill="${topVis ? color : tn.shade}"/>`;
  let inner = '';
  inner += `<path fill-rule="evenodd" fill="${tn.shade}" d="${outsideD(movePts(poly, mul(x.L2, 1.6)))}"/>`;
  // 스티치
  if (x.det > 0.5 && topVis && !x.helmet) {
    for (const k of [0.82, 0.7, 0.58, 0.46]) {
      const ln: P[] = [];
      for (let i = 2; i < b.inner.length - 2; i++) ln.push(proj2(c, vlerp3(b.inner[i], b.outer[i], k)));
      inner += `<path d="${smoothPath(ln, false)}" fill="none" stroke="${tn.deep}" stroke-width="0.06" opacity="0.5"/>`;
    }
  }
  // 챙 아래 그림자 띠 (안쪽)
  g += clipDef(id, d) + clipped(id, inner);
  return g;
}

/** 챙이 얼굴에 드리우는 그림자 다각형 (투영 좌표) */
function brimShadow(x: Ctx, b: Brim): P[] {
  const { m, c } = x;
  const Lh = x.Lh;
  // 챙이 얼굴 앞으로 나온 만큼 × 빛 높이각 → 그림자가 내려오는 길이
  const tanE = clamp(-Lh[1] / Math.max(0.3, Lh[2]), 0.3, 1.25) * 0.8;
  const tanX = clamp(-Lh[0] / Math.max(0.3, Lh[2]), -1.2, 1.2);
  const out: P[] = [];
  for (const O of b.outer) {
    const X0 = clamp(O[0], -7.2, 7.2);
    const zf = frontZ(m, X0, clamp(O[1] + 2.5, m.yTop, m.yBot));
    const over = Math.max(0, O[2] - zf);
    const side = Math.min(1, Math.abs(X0) / 7.2);
    const drop = Math.min(5.4, over * tanE) * (1 - 0.42 * side * side);
    const X = clamp(O[0] + tanX * over * 0.6, -7.3, 7.3);
    const Y = O[1] + drop;
    out.push(proj2(c, [X, Y, frontZ(m, X, clamp(Y, m.yTop, m.yBot)) + 0.1]));
  }
  const top = b.inner.map((p) => proj2(c, [p[0], p[1] - 4, p[2]]));
  return [...out, ...top.reverse()];
}

// ───────────────────────── 안경·선글라스·아이블랙 ─────────────────────────
function eyewearLayer(x: Ctx, b: Brim | null): string {
  const { ap, m, c } = x;
  const kind = ap.eyewear;
  if (kind === 'none') return '';
  let g = '';
  if (kind === 'shadesUp') {
    if (!b) return '';
    // 챙 위에 얹은 선글라스
    const lens = (s: 1 | -1): P[] => {
      const out: P[] = [];
      const mid = Math.floor(b.inner.length / 2);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const uu = 0.5 + s * 0.2 + Math.cos(a) * 0.17;
        const vv = 0.42 + Math.sin(a) * 0.26;
        const idx = clamp(Math.round(mid + (uu - 0.5) * b.inner.length * 0.9), 0, b.inner.length - 1);
        const p = vlerp3(b.inner[idx], b.outer[idx], vv);
        out.push(proj2(c, [p[0], p[1] - 0.35, p[2]]));
      }
      return out;
    };
    for (const s of [-1, 1] as const) {
      const L = lens(s);
      g += fillP(L, ap.shadesTint);
      g += `<path d="${smoothPath(L)}" fill="none" stroke="#151515" stroke-width="0.18"/>`;
      const hl = L.slice(1, 4);
      g += fillP(tq(hl, brush(0.01, 0.12, 0.01)), '#ffffff', 'opacity="0.35"');
    }
    return g;
  }
  const fG = (s: 1 | -1) => eyeGeom(x, s);
  if (kind === 'shades') {
    // 감싸는 스포츠 고글형: 두 눈을 한 장으로
    const pts: P[] = [];
    const Yc = m.eyeY - 0.15;
    const N = 16;
    for (let i = 0; i <= N; i++) {
      const X = lerp(-6.3, 6.3, i / N);
      const top = Yc - 1.55 + 0.25 * Math.pow(Math.abs(X) / 6.3, 2);
      pts.push(proj2(c, [X, top, frontZ(m, X * 0.98, top) + 0.65]));
    }
    for (let i = N; i >= 0; i--) {
      const X = lerp(-6.3, 6.3, i / N);
      const ax = Math.abs(X);
      const bot = Yc + 1.25 - (ax < 1.1 ? 0.75 * (1 - ax / 1.1) : 0) - 0.5 * Math.pow(ax / 6.3, 3);
      pts.push(proj2(c, [X, bot, frontZ(m, X * 0.98, bot) + 0.6]));
    }
    // 보이는 부분만 (얼굴 외곽으로 잘라냄)
    const id = uid('sg');
    g += clipDef(id, smoothPath(x.sil));
    const tint = ap.shadesTint;
    let s = fillP(pts, tint);
    s += `<path d="${smoothPath(pts)}" fill="none" stroke="#141414" stroke-width="0.2"/>`;
    // 반사 띠 (은은하게)
    const hl: P[] = [proj2(c, [-4.5, Yc - 0.9, frontZ(m, -4.5, Yc) + 0.8]), proj2(c, [-1, Yc - 1.1, frontZ(m, -1, Yc) + 0.8]), proj2(c, [3.5, Yc - 0.7, frontZ(m, 3.5, Yc) + 0.8])];
    s += fillP(tq(hl, brush(0.02, 0.22, 0.02, 0.4)), '#ffffff', 'opacity="0.22"');
    s += fillP(tq(hl.map((p) => add(p, [0.3, 0.9])), brush(0.02, 0.12, 0.02, 0.6)), mix(tint, '#7fb8ff', 0.5), 'opacity="0.25"');
    g += `<g clip-path="url(#${id})">${s}</g>`;
    // 다리
    const nr = x.near;
    const a = proj2(c, [nr * 6.3, Yc - 0.9, frontZ(m, nr * 6.2, Yc) + 0.4]);
    const e = proj2(c, [nr * 7.6, Yc - 0.6, -0.5]);
    g += `<path d="M${fx(a[0])} ${fx(a[1])}L${fx(e[0])} ${fx(e[1])}" stroke="#141414" stroke-width="0.32" stroke-linecap="round"/>`;
    return g;
  }
  // 일반 안경 (가는 테)
  for (const s of [-1, 1] as const) {
    const G = fG(s);
    const nrm = G.n;
    if (x.face(nrm) < 0.05) continue;
    const rim: P[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const u = Math.cos(a) * G.w * 0.68, v = Math.sin(a) * 1.25 + 0.1;
      const p = vadd(G.map(u, v), vmul(nrm, 0.75));
      rim.push(proj2(c, p));
    }
    g += fillP(rim, '#dfe9f0', 'opacity="0.12"');
    g += `<path d="${smoothPath(rim)}" fill="none" stroke="#1d1d1f" stroke-width="0.17"/>`;
  }
  const br0 = proj2(c, vadd(fG(-1).map(fG(-1).w * -0.68, 0.2), [0, 0, 0.75]));
  const br1 = proj2(c, vadd(fG(1).map(fG(1).w * -0.68, 0.2), [0, 0, 0.75]));
  g += `<path d="M${fx(br0[0])} ${fx(br0[1])}Q${fx((br0[0] + br1[0]) / 2)} ${fx(Math.min(br0[1], br1[1]) - 0.4)} ${fx(br1[0])} ${fx(br1[1])}" fill="none" stroke="#1d1d1f" stroke-width="0.17"/>`;
  return g;
}

function eyeBlackLayer(x: Ctx): string {
  const { m } = x;
  let g = '';
  for (const s of [-1, 1] as const) {
    const nn = vnorm([s * 0.6, 0.1, 1]);
    if (x.face(nn) < 0.1) continue;
    const pts: P[] = [];
    const cx = s * 3.6, cy = m.eyeY + 1.95;
    // 손가락으로 바른 듯한 렌즈꼴 — 양끝이 가늘고 바깥쪽이 살짝 처진다
    const N = 14;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const u = Math.cos(a) * 1.55;
      const hh = 0.3 * Math.pow(Math.max(0, 1 - (u * u) / 2.41), 0.6) + 0.03;
      const X = cx + u * s;
      const Y = cy + Math.sin(a) * hh + 0.1 * (u + 1.55) * 0.5;
      pts.push(x.pp([X, Y, frontZ(m, X, Y) + 0.06]));
    }
    g += fillP(pts.map((p) => [p[0], p[1], 0.35] as Q), '#1d1b1a', 'opacity="0.86"');
  }
  return g;
}

// ───────────────────────── 조립 ─────────────────────────
export function renderHead(ap: Appearance, kit: Kit, o: HeadOpts): HeadOut {
  const m = headModel(ap, o.neckLen ?? 20.5);
  const c = cam(o.yaw, o.pitch ?? 0);
  const L = vnorm(o.light);
  const L2 = norm([L[0], L[1]]);
  // 빛을 머리 좌표로 (투영의 역변환)
  const d0 = L[1] * c.sp + L[2] * c.cp;
  const Lh: V3 = vnorm([L[0] * c.cy - d0 * c.sy, L[1] * c.cp - L[2] * c.sp, L[0] * c.sy + d0 * c.cy]);
  const r = new Rng(ap.id).fork('head');
  const near: 1 | -1 = o.yaw < 0 ? 1 : -1;
  const x: Ctx = {
    ap, kit, m, c, o, L, L2, Lh,
    det: o.detail ?? 1,
    lw: o.line ?? 0,
    near,
    farScr: o.yaw < 0 ? -1 : 1,
    expr: o.expression ?? ap.expression,
    cap: o.gear === 'cap',
    helmet: o.gear === 'helmet',
    capLow: r.around(0.15, 0.3, -0.35, 0.75),
    brimCurve: r.around(0.65, 0.25, 0.1, 1),
    r,
    pp: (p) => proj2(c, p),
    face: (n) => projDir(c, n)[2],
    lit: (n) => vdot(projDir(c, n), L),
    sil: [],
    silD: '',
  };
  const sk = ap.skin;
  const hs = headSilhouette(x);
  x.sil = hs.sil;
  x.silD = smoothPath(hs.sil);

  // 층별 조립
  let back = '';
  let head = '';
  const hair = hairLayer(x);
  const geo = x.cap || x.helmet ? capGeom(x) : null;
  const capL = geo ? capLayer(x, geo) : null;
  back += hair.back;
  if (Math.abs(o.yaw) < 55) back += earLayer(x, (-near) as 1 | -1);
  if (capL) back += capL.back;

  const neck = neckLayer(x, hs.sil);

  // 머리(피부)
  const hid = uid('hd');
  if (x.lw) head += `<path d="${x.silD}" fill="none" stroke="${mix(sk.line, sk.deep, 0.45)}" stroke-width="${fx(x.lw * 1.7)}" stroke-linejoin="round"/>`;
  head += `<path d="${x.silD}" fill="${sk.base}"/>`;
  let inner = '';
  inner += fillP(hs.shadow, sk.shade);
  // 림라이트 (그림자 쪽 외곽 얇게)
  inner += `<path fill-rule="evenodd" fill="${sk.rim}" opacity="0.36" d="${outsideD(movePts(hs.sil, [L2[0] * 0.26, 0]))}"/>`;
  // 볼·코끝 홍조 (야외 선수 일부)
  if (m.face.ruddy > 0.05) {
    for (const s of [-1, 1] as const) {
      const nn = vnorm([s * 0.7, 0.1, 0.7]);
      if (x.face(nn) < 0.1) continue;
      const cy = m.ys(1.6), cxp = s * 4.0;
      const pts: P[] = [];
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const X = cxp + Math.cos(a) * 1.7, Y = cy + Math.sin(a) * 1.0; pts.push(x.pp([X, Y, frontZ(m, X, Y) + 0.04])); }
      inner += fillP(pts, sk.blush, `opacity="${fx(0.35 * m.face.ruddy)}"`);
    }
  }
  inner += faceDetails(x);
  // 먼 쪽 눈 가리개(콧대 뒤)
  let farClip = '';
  if (Math.abs(o.yaw) > 18) {
    const nas = x.pp([0, m.ys(-2.4), m.mid(m.ys(-2.4))]);
    const brg = x.pp([0, m.ys(0.4), m.mid(m.ys(0.4))]);
    const dd = norm(sub(brg, nas));
    const a = add(nas, mul(dd, -20)), b = add(nas, mul(dd, 20));
    const fs = x.farScr;
    farClip = uid('fc');
    inner += clipDef(farClip, polyPath([a, b, add(b, [fs * 40, 0]), add(a, [fs * 40, 0])]));
  }
  inner += noseLayer(x);
  inner += mouthLayer(x);
  // 챙 그림자 — 눈·눈썹보다 먼저 깔아서 눈매가 묻히지 않게
  if (geo) {
    const bs = brimShadow(x, geo.brim);
    const bsc = mix(sk.deep, '#2a1c18', 0.35);
    inner += `<path d="${smoothPath(bs)}" fill="${bsc}" opacity="0.16"/>`;
    inner += `<path d="${smoothPath(movePts(bs, [0, -0.7]))}" fill="${bsc}" opacity="0.14"/>`;
    const edge = bs.slice(0, geo.brim.outer.length).slice().sort((a, b) => a[0] - b[0]);
    x.shadowY = (sx: number) => {
      for (let i = 0; i < edge.length - 1; i++) if (sx >= edge[i][0] && sx <= edge[i + 1][0]) return lerp(edge[i][1], edge[i + 1][1], (sx - edge[i][0]) / (edge[i + 1][0] - edge[i][0] || 1));
      return -999;
    };
  }
  for (const s of [-near, near] as (1 | -1)[]) inner += eyeLayer(x, s, farClip);
  for (const s of [-near, near] as (1 | -1)[]) inner += browLayer(x, s);
  if (kit.eyeBlack) inner += eyeBlackLayer(x);
  head += clipDef(hid, x.silD) + clipped(hid, inner);

  // 머리카락 → 귀 → 수염
  head += hair.front;
  head += earLayer(x, near);
  const beard = beardLayer(x);
  head += beard.front;
  // 수염이 덮은 입 다시 (콧수염 아래 입술선만 보이게) — 콧수염 없으면 생략
  // 안경류
  const shadesOnFace = ap.eyewear === 'shades' || ap.eyewear === 'glasses';
  if (shadesOnFace) head += eyewearLayer(x, null);
  if (capL) head += capL.front;
  if (ap.eyewear === 'shadesUp' && geo && x.cap) head += eyewearLayer(x, geo.brim);

  return { back, neck, chin: beard.chin, head, m, c, near };
}

export { headModel };
