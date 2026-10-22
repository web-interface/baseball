// 전신(옆모습) — 뼈대(rig) 관절 위에 살 붙은 팔다리, 링 몸통, 유니폼·장비, 3D 머리를 얹는다.
// 기본: 화면 오른쪽을 봄, 가까운 쪽 = 캐릭터 오른쪽(R). 좌표 cm, 바닥 y=0.

import type { Appearance, Kit, Pose, Side } from './types';
import type { P, Q, V3 } from './geom';
import {
  add, sub, mul, norm, dot, lerp, lerpP, clamp, dir, rot, frontN, smoothPath, polyPath, fx, taperPts, brush,
  movePts, proj2, D2R, bbox, smooth01,
} from './geom';
import { shaded, uid, clipDef, clipped, outsideD } from './svg';
import type { ToneSet } from './svg';
import { adj, lum, toneOf } from './color';
import { solveRig } from './rig';
import type { Joints } from './rig';
import { renderHead } from './head';
import { torsoModel, collarLoop, frontArc } from './torso';
import type { TorsoModel } from './torso';
import { wordmark } from './portrait';

export interface FigureOpts {
  detail?: number;
  line?: number;
  gear?: 'cap' | 'helmet' | 'none';
  /** 바닥 그림자 */
  shadow?: boolean;
}

type Prof = (t: number) => [number, number];
type K = [number, number][];

function interp(k: K, t: number): number {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 0; i < k.length - 1; i++) {
    if (t <= k[i + 1][0]) {
      const u = (t - k[i][0]) / (k[i + 1][0] - k[i][0]);
      return lerp(k[i][1], k[i + 1][1], smooth01(u));
    }
  }
  return k[k.length - 1][1];
}
const mkProf = (f: K, b: K, add0 = 0): Prof => (t) => [interp(f, t) + add0, interp(b, t) + add0];

function segSide(a: P, b: P, pr: Prof, sg: 1 | -1, n = 9, t0 = 0, t1 = 1): P[] {
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

/** 두 마디(위팔+아래팔, 허벅지+정강이)를 이어진 하나의 외곽으로. 굽은 바깥쪽은 둥글게, 안쪽은 접힘 */
function limb2(J0: P, J1: P, J2: P, p1: Prof, p2: Prof, capTop = 0.9): Q[] {
  const d1 = norm(sub(J1, J0)), d2 = norm(sub(J2, J1));
  const n1 = frontN(d1), n2 = frontN(d2);
  const sides: Q[][] = [];
  for (const sg of [1, -1] as const) {
    const A = segSide(J0, J1, p1, sg);
    const B = segSide(J1, J2, p2, sg);
    const bis = norm(add(mul(n1, sg), mul(n2, sg)));
    const wj = sg > 0 ? (p1(1)[0] + p2(0)[0]) / 2 : (p1(1)[1] + p2(0)[1]) / 2;
    const bend = dot(n1, n2);
    const pts: Q[] = [];
    if (bend > 0.995) {
      pts.push(...A.slice(0, -1), ...B);
    } else if (dot(bis, sub(d2, d1)) < 0) {
      // 바깥쪽: 관절을 감싸는 호
      pts.push(...A.slice(0, -1));
      const a0 = Math.atan2(sg * n1[1], sg * n1[0]);
      let da = Math.atan2(sg * n2[1], sg * n2[0]) - a0;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      for (let k = 0; k <= 4; k++) { const a = a0 + (da * k) / 4; pts.push([J1[0] + Math.cos(a) * wj, J1[1] + Math.sin(a) * wj]); }
      pts.push(...B.slice(1));
    } else {
      // 안쪽: 접히는 점에서 자름
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
  const tipTop = add(lerpP(startF as P, startB as P, 0.5), mul(d1, -r0 * capTop));
  const capPts: Q[] = [];
  if (capTop > 0) {
    // 둥근 위쪽 (어깨·엉덩이 쪽)
    const c0 = lerpP(startF as P, startB as P, 0.5);
    for (let k = 1; k < 6; k++) {
      const a = Math.PI * (k / 6);
      capPts.push(add(add(c0, mul(n1, -Math.cos(a) * r0 * -1)), mul(d1, -Math.sin(a) * r0 * capTop)) as Q);
    }
  }
  return [...F, tipEnd, ...Bk.slice().reverse(), ...(capTop > 0 ? capPts.reverse() : [tipTop])];
}

/** 한 마디 외곽 */
function limb1(a: P, b: P, pr: Prof, capA = 0.6, capB = 0.4): Q[] {
  const d = norm(sub(b, a));
  const F = segSide(a, b, pr, 1), Bk = segSide(a, b, pr, -1);
  const eB = add(lerpP(F[F.length - 1], Bk[Bk.length - 1], 0.5), mul(d, ((pr(1)[0] + pr(1)[1]) / 2) * capB));
  const eA = add(lerpP(F[0], Bk[0], 0.5), mul(d, -((pr(0)[0] + pr(0)[1]) / 2) * capA));
  return [...F, eB, ...Bk.reverse(), eA];
}

/** 로컬 도형(+y = 방향 d, +x = 앞쪽 법선) → 화면 */
function place(o: P, ang: number, pts: readonly Q[], sx = 1, sy = 1): Q[] {
  const d = dir(ang), f = frontN(d);
  return pts.map((p) => {
    const x = p[0] * sx, y = p[1] * sy;
    const q: Q = [o[0] + f[0] * x + d[0] * y, o[1] + f[1] * x + d[1] * y];
    if (p.length === 3) q.push(p[2]);
    return q;
  });
}

const fillP = (pts: readonly Q[], fill: string, extra = '') => (pts.length > 2 ? `<path d="${smoothPath(pts)}" fill="${fill}"${extra ? ' ' + extra : ''}/>` : '');

// ── 손 모양 (로컬: 손목 원점, +y 손가락 방향, +x 엄지/앞) ──
const HAND: Record<string, Q[]> = {
  relax: [[-1.9, 0], [-2.25, 3.4], [-2.15, 7.4], [-1.55, 10.6], [-0.4, 13.4], [1.0, 14.2], [1.65, 12.9], [1.35, 10.6], [1.85, 8.4], [3.05, 7.7], [3.1, 6.2], [2.55, 3.5], [2.15, 0.3]],
  fist: [[-2.0, 0], [-2.45, 3.5], [-2.4, 7.0], [-1.5, 9.3], [0.6, 10.0], [2.6, 8.9], [3.25, 6.2], [3.1, 3.2], [2.2, 0.3]],
  open: [[-1.9, 0], [-2.2, 3.6], [-2.0, 8.4], [-1.4, 13.6], [0.0, 15.6], [1.2, 14.8], [1.4, 11.0], [2.2, 8.8], [3.6, 8.6], [3.5, 6.6], [2.6, 3.6], [2.1, 0.3]],
};

export interface FigureOut { svg: string; box: [number, number, number, number]; j: Joints }

/** 거울 쌍둥이 — 좌우를 바꾼 사람 (왼쪽을 보게 그릴 때 이 사람을 오른쪽 보게 그린 뒤 화면을 뒤집는다) */
function mirrorAppearance(ap: Appearance): Appearance {
  const sw = (h: 'R' | 'L') => (h === 'R' ? 'L' : 'R');
  return {
    ...ap,
    throws: sw(ap.throws),
    bats: ap.bats === 'S' ? 'S' : sw(ap.bats),
    face: { ...ap.face, mole: ap.face.mole ? { ...ap.face.mole, x: -ap.face.mole.x } : null, browSlit: (-ap.face.browSlit) as 0 | 1 | -1, noseCrook: -ap.face.noseCrook },
    hair: { ...ap.hair, part: (-ap.hair.part) as -1 | 0 | 1 },
  };
}
function mirrorPose(p: Pose): Pose {
  const sw = (s: Side): Side => (s === 'R' ? 'L' : 'R');
  return {
    ...p,
    arm: { R: p.arm.L, L: p.arm.R },
    leg: { R: p.leg.L, L: p.leg.R },
    front: p.front ? { armR: p.front.armL, armL: p.front.armR, legR: p.front.legL, legL: p.front.legR } : undefined,
    bat: p.bat ? { ...p.bat, side: sw(p.bat.side) } : p.bat,
    glove: p.glove ? sw(p.glove) : p.glove,
    faceLeft: false,
  };
}

/**
 * 전신 렌더. pose.faceLeft 면 왼쪽을 보는 그림(가까운 쪽 = 캐릭터 왼쪽).
 * 반환 j(관절)는 화면 좌표 그대로(왼쪽을 볼 땐 x 가 뒤집힌 값, R/L 은 캐릭터 기준).
 */
export function renderFigure(ap: Appearance, kit: Kit, pose: Pose, o: FigureOpts = {}): FigureOut {
  if (!pose.faceLeft) return renderFigureCore(ap, kit, pose, o, false);
  const f = renderFigureCore(mirrorAppearance(ap), kit, mirrorPose(pose), o, true);
  const fl = (p: P): P => [-p[0], p[1]];
  const flr = (r: Record<Side, P>): Record<Side, P> => ({ R: fl(r.L), L: fl(r.R) });
  const j = f.j;
  const jm: Joints = {
    ...j, hip: fl(j.hip), neck: fl(j.neck), headO: fl(j.headO), headAngle: -j.headAngle,
    shoulder: flr(j.shoulder), elbow: flr(j.elbow), wrist: flr(j.wrist), hand: flr(j.hand),
    hipJ: flr(j.hipJ), knee: flr(j.knee), ankle: flr(j.ankle), heel: flr(j.heel), toe: flr(j.toe),
    batGrip: j.batGrip && fl(j.batGrip), batTip: j.batTip && fl(j.batTip), gloveC: j.gloveC && fl(j.gloveC),
  };
  return { svg: `<g transform="scale(-1 1)">${f.svg}</g>`, box: [-f.box[2], f.box[1], -f.box[0], f.box[3]], j: jm };
}

function renderFigureCore(ap: Appearance, kit: Kit, pose: Pose, o: FigureOpts, mirror: boolean): FigureOut {
  const b = ap.build;
  const tm = torsoModel(b);
  const J = solveRig(b, pose, tm);
  const det = o.detail ?? 1;
  const lw = o.line ?? 0;
  const L2: P = norm([0.72, -0.69]);
  const sk = ap.skin;
  const skinT: ToneSet = { base: sk.base, shade: sk.shade, deep: sk.deep, light: sk.light, line: sk.line, rim: sk.rim };
  const farT = (t: ToneSet): ToneSet => ({ base: t.shade, shade: t.deep ?? t.shade, deep: adj(t.deep ?? t.shade, { l: -0.05 }), light: t.base, line: t.line, rim: t.shade });
  const jT = toneOf(kit.jersey, { shade: lum(kit.jersey) > 0.8 ? 0.09 : 0.1 });
  const pT = toneOf(kit.pants, { shade: lum(kit.pants) > 0.8 ? 0.09 : 0.1 });
  const uT = toneOf(kit.undershirt, { shade: 0.075 });
  const sT = toneOf(kit.sock, { shade: 0.08 });
  const gloveSide: Side = ap.throws === 'R' ? 'L' : 'R';
  const isNear = (s: Side) => s === 'R';
  const sil: string[] = [];
  const part = (pts: Q[], t: ToneSet, w: number, extra = '', o2: { deep?: number; hi?: number; rim?: number } = {}) => {
    if (lw) sil.push(smoothPath(pts));
    return shaded(pts, t, { light: L2, shade: w, deep: o2.deep, hi: o2.hi, rim: o2.rim }, extra);
  };

  // ── 프로필(반폭) ──
  const D = b.upperArmD, dl = b.deltoid, F = b.foreArmD, Wd = b.wristD;
  const upperP = mkProf([[0, 0.92 * dl], [0.2, 0.8 * dl], [0.45, 0.52 * D], [0.78, 0.43 * D], [1, 0.37 * D]], [[0, 0.95 * dl], [0.25, 0.57 * D], [0.5, 0.55 * D], [0.85, 0.43 * D], [1, 0.38 * D]]);
  const foreP = mkProf([[0, 0.42 * F], [0.22, 0.53 * F], [0.62, 0.42 * F], [1, 0.52 * Wd]], [[0, 0.4 * F], [0.2, 0.5 * F], [0.62, 0.4 * F], [1, 0.5 * Wd]]);
  const Th = b.thighD, Kn = b.kneeD, Ca = b.calfD, An = b.ankleD;
  const shinP = mkProf([[0, 0.52 * Kn], [0.25, 0.43 * Ca], [0.7, 0.35 * Ca], [1, 0.5 * An]], [[0, 0.48 * Kn], [0.25, 0.6 * Ca], [0.55, 0.46 * Ca], [1, 0.5 * An]]);
  // 바지: 헐렁하게, 정강이는 거의 일자
  const pantThighP = mkProf([[0, 0.5 * Th + 2.2], [0.35, 0.55 * Th + 1.7], [0.8, 0.46 * Th + 1.7], [1, 0.52 * Kn + 2.0]], [[0, 0.6 * Th + 2.6], [0.3, 0.54 * Th + 2.0], [0.75, 0.45 * Th + 1.9], [1, 0.5 * Kn + 2.2]]);
  const pantShinP = (bottom: number): Prof => mkProf([[0, 0.52 * Kn + 2.0], [0.4, 0.42 * Ca + 2.0], [1, 0.42 * Ca + 1.6 + bottom]], [[0, 0.5 * Kn + 2.2], [0.35, 0.55 * Ca + 1.7], [1, 0.45 * Ca + 1.5 + bottom]]);

  // ── 팔 ──
  const sleeveT = 0.5 - 0.05 * b.muscle;
  const armShapes: Record<Side, Q[]> = { R: [], L: [] };
  const drawArm = (s: Side): string => {
    const far = !isNear(s);
    const S = J.shoulder[s], E = J.elbow[s], W = J.wrist[s];
    const ap2 = limb2(S, E, W, upperP, foreP);
    armShapes[s] = ap2;
    let g = '';
    const longS = kit.longSleeve;
    const comp = kit.armSleeve && ((kit.armSleeve.arm === 'throw') === (s !== gloveSide)) ? kit.armSleeve : null;
    const base = longS ? uT : skinT;
    g += part(ap2, far ? farT(base) : base, (b.upperArmD * 0.32));
    // 팔 토시 (압박 슬리브)
    if (comp) {
      const tc = toneOf(comp.color, { shade: 0.08 });
      const t0 = comp.full ? 0.0 : 0.0;
      const sp = comp.full ? limb2(S, E, W, mkProf([[0, 0], [1, 0]], [[0, 0], [1, 0]]), foreP) : limb1(lerpP(E, W, t0), lerpP(E, W, 0.93), (t) => { const v = foreP(lerp(t0, 0.93, t)); return [v[0] + 0.15, v[1] + 0.15]; }, 0.6, 0.1);
      if (comp.full) {
        const full = limb2(S, E, W, (t) => { const v = upperP(t); return [v[0] + 0.1, v[1] + 0.1]; }, (t) => { const v = foreP(Math.min(t, 0.94)); return [v[0] + 0.15, v[1] + 0.15]; });
        g += part(full, far ? farT(tc) : tc, b.upperArmD * 0.3);
      } else g += part(sp, far ? farT(tc) : tc, b.foreArmD * 0.3);
    }
    // 팔꿈치 보호대 (타자, 배트 들 때 앞팔)
    if (kit.elbowGuard && pose.bat && ((ap.bats === 'L' ? 'R' : 'L') === s)) {
      const eg = toneOf(kit.elbowGuard, { shade: 0.08 });
      const gp = limb1(lerpP(S, E, 0.72), lerpP(E, W, 0.3), () => [0.48 * D + 0.9, 0.5 * D + 0.9], 0.5, 0.5);
      g += part(gp, far ? farT(eg) : eg, 1.6);
    }
    // 손목 밴드
    if (kit.wristband && (kit.wristband.arm === 'both' || (kit.wristband.arm === 'throw') === (s !== gloveSide))) {
      const wb = toneOf(kit.wristband.color, { shade: 0.08 });
      const wpts = limb1(lerpP(E, W, 0.8), lerpP(E, W, 0.98), (t) => { const v = foreP(lerp(0.8, 0.98, t)); return [v[0] + 0.45, v[1] + 0.45]; }, 0.2, 0.2);
      g += part(wpts, far ? farT(wb) : wb, 1.2);
    }
    // 저지 소매
    const sl = limb1(add(S, mul(norm(sub(E, S)), -1.5)), lerpP(S, E, sleeveT), (t) => { const v = upperP(t * sleeveT); return [v[0] + 1.35, v[1] + 1.35]; }, 0.95, 0.15);
    const dd = norm(sub(E, S));
    const hem = lerpP(S, E, sleeveT);
    const nrm = frontN(dd);
    const stripe = (o0: number, o1: number, col: string) => {
      const w0 = upperP(sleeveT)[0] + 1.6, w1 = upperP(sleeveT)[1] + 1.6;
      const a = add(hem, mul(dd, -o0)), c = add(hem, mul(dd, -o1));
      return `<path d="${polyPath([add(a, mul(nrm, w0)), add(a, mul(nrm, -w1)), add(c, mul(nrm, -w1)), add(c, mul(nrm, w0))])}" fill="${col}"/>`;
    };
    let sx = stripe(0, 0.55, far ? adj(kit.jerseyTrim, { l: -0.08 }) : kit.jerseyTrim) + stripe(0.95, 1.3, far ? adj(kit.jerseyTrim2, { l: -0.08 }) : kit.jerseyTrim2);
    if (det > 0.4) {
      // 소매 주름
      const f1 = [add(lerpP(S, E, 0.1), mul(nrm, 2.2)), add(lerpP(S, E, 0.26), mul(nrm, 0.6)), add(lerpP(S, E, 0.36), mul(nrm, -1.5))];
      sx += fillP(taperPts(f1, brush(0.02, 0.35, 0.02, 0.5)), far ? jT.deep : jT.shade, 'opacity="0.8"');
    }
    g += part(sl, far ? farT(jT) : jT, 3.2, sx);
    // 손
    g += drawHand(s, far);
    return g;
  };

  const drawHand = (s: Side, far: boolean): string => {
    const arm = pose.arm[s];
    const W = J.wrist[s];
    const aH = J.a.hand[s];
    const scale = b.hand / 17.5;
    if (arm.hand === 'glove' || pose.glove === s) return drawGlove(s, far);
    const gloved = !!pose.bat;
    const base = gloved ? toneOf(s === 'R' ? kit.batGlove : kit.batGlove2, { shade: 0.08 }) : skinT;
    const shape = arm.hand === 'grip' || arm.hand === 'fist' || arm.hand === 'hold' ? HAND.fist : arm.hand === 'open' ? HAND.open : HAND.relax;
    const pts = place(W, aH, shape, scale, scale);
    let extra = '';
    if (det > 0.5) {
      // 손가락 마디 선
      const lines = arm.hand === 'relax'
        ? [[[-1.3, 10.8], [-0.2, 11.6], [0.9, 11.2]], [[-1.6, 8.0], [-0.4, 8.6], [1.0, 8.4]], [[1.5, 4.6], [1.9, 6.0], [2.1, 7.5]]]
        : [[[-1.6, 7.2], [0.2, 7.6], [2.4, 6.6]], [[-1.2, 5.0], [0.6, 5.2], [2.6, 4.4]]];
      for (const ln of lines) extra += fillP(taperPts(place(W, aH, ln as Q[], scale, scale) as P[], brush(0.01, 0.13, 0.01)), (far ? (base.deep ?? base.shade) : base.shade), 'opacity="0.8"');
    }
    let g = part(pts, far ? farT(base) : base, 1.3, extra);
    // 공을 쥔 손
    if (arm.hand === 'fist' && !pose.bat) {
      const bc = place(W, aH, [[1.6, 8.6]], scale, scale)[0] as P;
      const br = 3.7;
      g += `<circle cx="${fx(bc[0])}" cy="${fx(bc[1])}" r="${br}" fill="${far ? '#d9d4ca' : '#f3f0e8'}"/>`;
      g += `<path d="M${fx(bc[0] - br * 0.5)} ${fx(bc[1] - br * 0.85)}Q${fx(bc[0] - br * 0.05)} ${fx(bc[1])} ${fx(bc[0] - br * 0.5)} ${fx(bc[1] + br * 0.85)}" fill="none" stroke="#c23a32" stroke-width="0.35" stroke-dasharray="0.45 0.35"/>`;
      // 손가락이 공을 감쌈
      g += fillP(place(W, aH, [[-1.2, 6.8], [0.6, 7.6], [2.4, 7.0], [1.0, 9.6], [-1.0, 9.2]], scale, scale), far ? sk.deep : sk.shade, 'opacity="0.9"');
    }
    return g;
  };

  const drawGlove = (s: Side, far: boolean): string => {
    const W = J.wrist[s];
    const aH = J.a.hand[s];
    const isC = ap.pos === 'C', is1B = ap.pos === '1B';
    const sc = (isC ? 1.08 : ap.pos === 'P' ? 0.98 : ['LF', 'CF', 'RF'].includes(ap.pos) ? 1.06 : 0.94) * (b.hand / 19);
    const gt = toneOf(kit.glove, { shade: 0.1 });
    const shape: Q[] = isC
      ? [[-4.5, -0.8], [-6.6, 5], [-7.2, 12], [-5.8, 19], [-2.2, 23.6], [2.6, 23.8], [6.6, 20.4], [8.6, 14.0], [8.0, 7.0], [5.4, 2.0], [3.4, -0.6]]
      : is1B
        ? [[-4.2, -0.8], [-5.6, 5], [-5.8, 13], [-4.6, 21], [-2.2, 27], [1.2, 28.4], [4.4, 26], [7.2, 19], [8.0, 11.5], [7.0, 5.6], [5.2, 1.6], [3.6, -0.6]]
        : [[-4.2, -1.0], [-5.6, 4.0], [-5.9, 10.0], [-5.3, 17.0], [-4.0, 22.5], [-2.2, 25.8], [0.2, 27.0], [2.4, 26.0], [3.6, 23.0], [5.6, 21.5], [7.6, 17.5], [8.4, 12.5], [7.6, 7.5], [5.6, 3.0], [3.8, -0.5]];
    const pts = place(W, aH, shape, sc, sc);
    let extra = '';
    // 손가락 칸 구분선
    const lines: Q[][] = isC || is1B ? [[[-3, 6], [-2.6, 13], [-1.2, 19]], [[0.5, 6.5], [1.2, 14], [2.4, 20]]] : [[[-3.2, 7], [-3.4, 14], [-2.8, 21.5]], [[-1.0, 7.5], [-1.1, 15], [-0.7, 24]], [[1.2, 8], [1.4, 15], [1.6, 23.2]]];
    for (const ln of lines) extra += fillP(taperPts(place(W, aH, ln, sc, sc) as P[], brush(0.02, 0.22, 0.02)), far ? gt.deep : gt.shade, 'opacity="0.9"');
    // 웹(엄지-검지 사이 그물)
    if (!isC && det > 0.4) {
      const web: Q[] = [[4.2, 21.5], [6.8, 18.2], [7.6, 13.5], [5.8, 13.0], [4.6, 17.5]];
      extra += fillP(place(W, aH, web, sc, sc), far ? gt.deep : gt.shade, 'opacity="0.9"');
      if (kit.gloveWeb === 'h') {
        const hb = place(W, aH, [[5.2, 14.2], [5.6, 19.6]], sc, sc), hb2 = place(W, aH, [[4.6, 16.8], [7.0, 16.2]], sc, sc);
        extra += `<path d="M${fx(hb[0][0])} ${fx(hb[0][1])}L${fx(hb[1][0])} ${fx(hb[1][1])}M${fx(hb2[0][0])} ${fx(hb2[0][1])}L${fx(hb2[1][0])} ${fx(hb2[1][1])}" stroke="${kit.gloveLace}" stroke-width="0.45"/>`;
      }
    }
    // 끈(레이스) — 가장자리 따라 점선
    if (det > 0.5) {
      // 가장자리 가죽끈: 테두리에서 0.6cm 안쪽에 굵은 땀 — 가장자리 위 점선은 '절취선'처럼 보여서 피함
      const cxy = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length], [0, 0]);
      const ins = pts.map((p) => { const v = norm(sub([cxy[0], cxy[1]], [p[0], p[1]])); return [p[0] + v[0] * 0.65, p[1] + v[1] * 0.65] as Q; });
      extra += `<path d="${smoothPath(ins)}" fill="none" stroke="${far ? gt.deep : adj(kit.gloveLace, { l: -0.05 })}" stroke-width="0.55" stroke-dasharray="0.75 0.55" stroke-linecap="round" opacity="0.95"/>`;
    }
    // 손목 띠 + 패치
    const band = place(W, aH, [[-4.4, 0.6], [4.0, 0.6], [4.6, 3.2], [-5.0, 3.2]] as Q[], sc, sc);
    extra += `<path d="${polyPath(band as P[])}" fill="${far ? gt.deep : adj(kit.glove, { l: -0.06 })}"/>`;
    return part(pts, far ? farT(gt) : gt, 3.0, extra);
  };

  // ── 다리 ──
  const legShapes: Record<Side, Q[]> = { R: [], L: [] };
  const drawLeg = (s: Side): string => {
    const far = !isNear(s);
    const H = J.hipJ[s], Kj = J.knee[s], A = J.ankle[s];
    let g = '';
    const high = kit.socks === 'high';
    // 양말/스타킹 (높게 신을 때 보임)
    if (high) {
      const sp = limb1(lerpP(Kj, A, 0.12), A, (t) => { const v = shinP(lerp(0.12, 1, t)); return [v[0] + 0.25, v[1] + 0.25]; }, 0.3, 0.3);
      let stripes = '';
      if (kit.sockStripe) {
        const d2 = norm(sub(A, Kj));
        const nr = frontN(d2);
        for (const [a0, a1] of [[0.3, 0.36], [0.4, 0.43]]) {
          const p0 = lerpP(Kj, A, a0), p1 = lerpP(Kj, A, a1);
          stripes += `<path d="${polyPath([add(p0, mul(nr, 9)), add(p1, mul(nr, 9)), add(p1, mul(nr, -9)), add(p0, mul(nr, -9))])}" fill="${far ? adj(kit.sockStripe, { l: -0.1 }) : kit.sockStripe}"/>`;
        }
      }
      g += part(sp, far ? farT(sT) : sT, 2.2, stripes);
    }
    // 바지
    const pantEnd = high ? lerpP(Kj, A, 0.26) : add(A, mul(norm(sub(A, Kj)), 1.2));
    const pShin = high ? (t: number): [number, number] => { const v = pantShinP(0)(t * 0.26); return [v[0] + 0.6 * smooth01((t - 0.5) * 2), v[1] + 0.6 * smooth01((t - 0.5) * 2)]; } : pantShinP(0.7);
    const pl = limb2(H, Kj, pantEnd, pantThighP, pShin, 0.9);
    legShapes[s] = pl;
    let px = '';
    // 바지 옆선
    if (kit.pantsStripe) {
      const d1 = norm(sub(Kj, H));
      const ln = [add(H, mul(d1, -6)), lerpP(H, Kj, 0.5), Kj, lerpP(Kj, pantEnd, 0.8)];
      px += `<path d="${polyPath(ln, false)}" fill="none" stroke="${far ? adj(kit.pantsStripe, { l: -0.08 }) : kit.pantsStripe}" stroke-width="1.0"/>`;
    }
    // 무릎 주름, 오금 주름
    if (det > 0.35) {
      const d1 = norm(sub(Kj, H)), n1 = frontN(d1);
      const k1 = [add(Kj, add(mul(d1, -7), mul(n1, 2))), add(Kj, add(mul(d1, -3), mul(n1, -1))), add(Kj, add(mul(d1, -1.5), mul(n1, -5)))];
      px += fillP(taperPts(k1, brush(0.02, 0.4, 0.02, 0.5)), far ? pT.deep : pT.shade, 'opacity="0.85"');
      const k2 = [add(Kj, add(mul(d1, 2.5), mul(n1, 3.5))), add(Kj, add(mul(d1, 4.5), mul(n1, 0.5))), add(Kj, add(mul(d1, 5.5), mul(n1, -3)))];
      px += fillP(taperPts(k2, brush(0.02, 0.3, 0.02, 0.5)), far ? pT.deep : pT.shade, 'opacity="0.7"');
      if (!high) {
        // 발목 위 바지 주름(쌓임)
        const d2 = norm(sub(A, Kj)), n2 = frontN(d2);
        for (const t of [0.72, 0.84]) {
          const c = lerpP(Kj, A, t);
          const z = [add(c, mul(n2, 4.5)), add(add(c, mul(d2, 1.2)), mul(n2, 0.5)), add(add(c, mul(d2, 0.4)), mul(n2, -4))];
          px += fillP(taperPts(z, brush(0.02, 0.3, 0.02, 0.5)), far ? pT.deep : pT.shade, 'opacity="0.75"');
        }
      }
    }
    g += part(pl, far ? farT(pT) : pT, 4.2, px);
    // 포수 레그가드
    if (kit.catcher && ap.pos === 'C') {
      const ct = toneOf(kit.catcher.gear, { shade: 0.08 });
      const lg = limb1(lerpP(H, Kj, 0.82), add(A, mul(norm(sub(A, Kj)), 3)), (t) => { const v = shinP(clamp(t, 0, 1)); return [v[0] + 2.6 + (t < 0.18 ? 1.4 * (1 - t / 0.18) : 0), v[1] + 1.2]; }, 0.7, 0.4);
      const d2 = norm(sub(A, Kj)), n2 = frontN(d2);
      let lx = '';
      for (const t of [0.12, 0.42, 0.7]) {
        const c = lerpP(Kj, A, t);
        lx += `<path d="M${fx(add(c, mul(n2, 9))[0])} ${fx(add(c, mul(n2, 9))[1])}L${fx(add(c, mul(n2, -9))[0])} ${fx(add(c, mul(n2, -9))[1])}" stroke="${kit.catcher.gearTrim}" stroke-width="0.5" opacity="0.9"/>`;
      }
      g += part(lg, far ? farT(ct) : ct, 2.4, lx);
    }
    g += drawShoe(s, far);
    return g;
  };

  const drawShoe = (s: Side, far: boolean): string => {
    const A = J.ankle[s];
    const aF = J.a.foot[s];
    const Lf = b.footL, ah = b.ankleH;
    const fd = dir(aF), dn = rot(fd, -90);
    const loc = (x: number, y: number): Q => [A[0] + fd[0] * x + dn[0] * y, A[1] + fd[1] * x + dn[1] * y];
    const ct = toneOf(kit.cleat, { shade: 0.1 });
    const shape: Q[] = [
      loc(-3.4, -3.4), loc(-4.8, 0.6), loc(-4.6, ah - 0.9), [...loc(-3.4, ah + 0.15), 0.5] as Q, loc(Lf * 0.3, ah + 0.25), loc(Lf * 0.62, ah + 0.15),
      loc(Lf * 0.74, ah - 0.8), loc(Lf * 0.74, ah - 2.6), loc(Lf * 0.62, ah - 4.3), loc(Lf * 0.36, -0.2), loc(3.0, -3.2), loc(0.4, -4.4),
    ];
    let ex = '';
    // 밑창
    const sole = [loc(-4.7, ah - 1.6), loc(Lf * 0.3, ah - 1.0), loc(Lf * 0.7, ah - 1.4), loc(Lf * 0.76, ah - 0.4), loc(Lf * 0.62, ah + 0.4), loc(-3.4, ah + 0.4), loc(-4.8, ah - 0.4)];
    const soleCol = lum(kit.cleat) < 0.4 ? '#e9e6df' : '#1d1c20';
    ex += fillP(sole, far ? adj(soleCol, { l: -0.1 }) : soleCol);
    // 옆 줄무늬
    if (det > 0.3) {
      const st = [loc(-2.8, ah - 2.2), loc(Lf * 0.18, -0.4), loc(Lf * 0.34, -1.4), loc(Lf * 0.22, ah - 2.2)];
      ex += fillP(st, far ? adj(kit.cleatTrim, { l: -0.1 }) : kit.cleatTrim, 'opacity="0.95"');
    }
    // 끈
    if (det > 0.55 && !far) {
      for (let i = 0; i < 4; i++) {
        const p0 = loc(1.2 + i * 2.2, -3.0 + i * 0.75), p1 = loc(2.3 + i * 2.2, -2.2 + i * 0.75);
        ex += `<path d="M${fx(p0[0])} ${fx(p0[1])}L${fx(p1[0])} ${fx(p1[1])}" stroke="${ct.light}" stroke-width="0.35" stroke-linecap="round"/>`;
      }
    }
    let g = part(shape, far ? farT(ct) : ct, 1.6, ex);
    // 스파이크
    for (const x of [-2.4, Lf * 0.22, Lf * 0.45, Lf * 0.62]) {
      const sp = [loc(x - 0.7, ah + 0.3), loc(x + 0.7, ah + 0.3), loc(x + 0.35, ah + 1.2), loc(x - 0.35, ah + 1.2)];
      g = `<path d="${polyPath(sp as P[])}" fill="${far ? '#3a3a3e' : '#55565c'}"/>` + g;
    }
    return g;
  };

  // ── 몸통 ──
  const jm = torsoModel(b, 2.0);
  const torsoSil = (m: TorsoModel, y0: number, y1: number) => {
    const Fr: P[] = [], Bk: P[] = [];
    for (const lv of m.lv) {
      if (lv.y < y0 || lv.y > y1) continue;
      const sp = J.spineAt(lv.y);
      const ya = sp.yaw * D2R;
      let mn = Infinity, mx = -Infinity;
      for (const [X, Z] of lv.ring) { const v = X * Math.cos(ya) + Z * Math.sin(ya); if (v < mn) mn = v; if (v > mx) mx = v; }
      Fr.push(add(sp.p, mul(sp.fwd, mx)));
      Bk.push(add(sp.p, mul(sp.fwd, mn)));
    }
    return { Fr, Bk };
  };
  const surfPt = (X: number, y: number, Z: number): P => {
    const sp = J.spineAt(y);
    const ya = sp.yaw * D2R;
    return add(sp.p, mul(sp.fwd, X * Math.cos(ya) + Z * Math.sin(ya)));
  };
  const drawTorso = (): { full: string; overlay: string } => {
    const yEnd = tm.yHip + 6 * tm.ky;
    const { Fr, Bk } = torsoSil(jm, jm.lv[0].y, yEnd);
    const outline: Q[] = [...Fr, ...Bk.slice().reverse()];
    const d = smoothPath(outline);
    if (lw) sil.push(d);
    const id = uid('to');
    const beltHalf = 2.1;
    // 허리띠 위(저지) / 아래(바지) 나누기
    const cut = (y: number, upper: boolean): P[] => {
      const s0 = J.spineAt(y);
      const a = add(s0.p, mul(s0.fwd, -60)), c = add(s0.p, mul(s0.fwd, 60));
      const far = mul(s0.up, upper ? 120 : -120);
      return [a, c, add(c, far), add(a, far)];
    };
    let g = '';
    g += `<path d="${d}" fill="${kit.pants}"/>`;
    let pin = '';
    // 바지 명암
    pin += `<path fill-rule="evenodd" fill="${pT.shade}" d="${outsideD(movePts(outline, mul(L2, 6)))}"/>`;
    // 뒷주머니
    if (det > 0.4) {
      const yb = tm.yHip - 3 * tm.ky;
      const bk = surfPt(0, yb, -b.butt - 1.2);
      const bx = J.spineAt(yb).fwd;
      const pk = [add(bk, mul(bx, 1.0)), add(bk, mul(bx, 6.5)), add(add(bk, mul(bx, 6.0)), [0, 6]), add(add(bk, mul(bx, 1.4)), [0, 6.2])];
      pin += `<path d="${polyPath(pk)}" fill="none" stroke="${pT.deep}" stroke-width="0.35" opacity="0.8"/>`;
    }
    // 저지 부분
    const jid = uid('tj');
    const jclip = polyPath(cut(tm.yBelt - beltHalf + 0.6, true));
    let jin = `<path d="${d}" fill="${kit.jersey}"/>`;
    // 핀스트라이프 — 몸통 둘레를 따라 일정 각도마다, 카메라를 향한 면만 (가장자리로 갈수록 촘촘해짐)
    if (kit.team.pinstripe && kit.set === 'home') {
      let st = '';
      for (let phi = -180; phi < 180; phi += 7.5) {
        let seg: P[] = [];
        const flush = () => { if (seg.length > 1) st += `<path d="${polyPath(seg, false)}" fill="none" stroke="${kit.team.primary}" stroke-width="0.16" opacity="0.5"/>`; seg = []; };
        for (let y = jm.lv[0].y + 2; y <= tm.yBelt; y += 2.5) {
          const ya = J.spineAt(y).yaw * D2R;
          const face = -Math.sin(phi * D2R) * Math.sin(ya) + Math.cos(phi * D2R) * Math.cos(ya);
          if (face < 0.02) { flush(); continue; }
          const p = jm.surf(phi, y);
          seg.push(surfPt(p[0], y, p[2]));
        }
        flush();
      }
      jin += st;
    }
    jin += `<path fill-rule="evenodd" fill="${jT.shade}" d="${outsideD(movePts(outline, mul(L2, 6.5)))}" opacity="0.92"/>`;
    jin += `<path fill-rule="evenodd" fill="${jT.deep}" d="${outsideD(movePts(outline, mul(L2, 1.6)))}" opacity="0.55"/>`;
    // 단추줄(플래킷)
    const cy = Math.cos(J.spineAt(10).yaw * D2R);
    if (cy > 0.12) {
      const pl: P[] = [];
      for (let y = 6; y <= tm.yBelt - 1; y += 2) pl.push(surfPt(-1.5, y, jm.frontZ(-1.5, y) + 0.05));
      jin += `<path d="${polyPath(pl, false)}" fill="none" stroke="${kit.jerseyTrim}" stroke-width="0.55"/>`;
      // 가슴 글자 (표면을 따라 글자마다 눌러 배치)
      jin += wordmark(kit, (X, y) => {
        const ya = J.spineAt(y).yaw * D2R;
        const dz = (jm.frontZ(X + 0.6, y) - jm.frontZ(X - 0.6, y)) / 1.2;
        const l = Math.hypot(dz, 1);
        const face = (dz / l) * Math.sin(ya) + (1 / l) * Math.cos(ya);
        const p0 = surfPt(X - 0.5, y, jm.frontZ(X - 0.5, y)), p1 = surfPt(X + 0.5, y, jm.frontZ(X + 0.5, y));
        return { p: surfPt(X, y, jm.frontZ(X, y) + 0.1), face, rot: Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) / D2R };
      }, 13 * tm.ky, 4.8, mirror);
    }
    // 등번호 (등이 보일 때)
    const yawB = J.spineAt(20).yaw;
    if (yawB > 100) {
      const q = surfPt(0, 18, -b.chestBack - 1.2);
      const sc = clamp(-Math.cos(yawB * D2R), 0.2, 1);
      jin += `<text transform="translate(${fx(q[0])} ${fx(q[1])}) scale(${fx(mirror ? -sc : sc)} 1)" text-anchor="middle" font-family="'Arial Black',Arial,sans-serif" font-weight="900" font-size="13" fill="${kit.letter}" stroke="${kit.letterLine}" stroke-width="0.7" paint-order="stroke">${kit.number}</text>`;
    }
    // 주름: 허리띠 위로 블라우스처럼 접힌 선, 겨드랑이
    if (det > 0.35) {
      const yb = tm.yBelt - 3;
      for (const [xa, k] of [[-6, 1], [4, 0.8]] as [number, number][]) {
        const p0 = surfPt(xa, yb - 5, jm.frontZ(xa, yb - 5)), p1 = surfPt(xa + 3, yb - 1.5, jm.frontZ(xa + 3, yb)), p2 = surfPt(xa + 7, yb + 0.5, jm.frontZ(xa + 7, yb));
        jin += fillP(taperPts([p0, p1, p2], brush(0.02, 0.45 * k, 0.02, 0.6)), jT.shade, 'opacity="0.75"');
      }
      const ax = surfPt(-b.chestHalf * 0.4, 8, b.chestFront * 0.6);
      const ax2 = surfPt(-b.chestHalf * 0.1, 16, b.chestFront * 0.9);
      jin += fillP(taperPts([ax, lerpP(ax, ax2, 0.5), ax2], brush(0.02, 0.5, 0.02, 0.4)), jT.shade, 'opacity="0.6"');
    }
    // 가까운 팔이 몸통에 드리우는 그림자
    if (armShapes.R.length) jin += fillP(movePts(armShapes.R, mul(L2, -2.4)), jT.deep, 'opacity="0.55"');
    pin += clipDef(jid, jclip) + clipped(jid, jin);
    // 허리띠
    const bF = torsoSil(jm, tm.yBelt - beltHalf, tm.yBelt + beltHalf);
    if (bF.Fr.length > 1) {
      const belt: P[] = [...bF.Fr, ...bF.Bk.slice().reverse()];
      pin += `<path d="${polyPath(belt)}" fill="${kit.belt}"/>`;
      pin += `<path d="${polyPath(belt)}" fill="none" stroke="${adj(kit.belt, { l: -0.08 })}" stroke-width="0.25"/>`;
      // 벨트 고리
      for (const X of [-b.waistHalf * 0.75, b.waistHalf * 0.2]) {
        const zz = jm.frontZ(X, tm.yBelt);
        const p0 = surfPt(X, tm.yBelt - beltHalf - 0.4, zz), p1 = surfPt(X, tm.yBelt + beltHalf + 0.4, zz);
        pin += `<path d="M${fx(p0[0])} ${fx(p0[1])}L${fx(p1[0])} ${fx(p1[1])}" stroke="${kit.pants}" stroke-width="1.1"/>`;
      }
    }
    // 포수 가슴 보호대 — 가슴 앞 표면에서 2cm 띄운 껍데기. 앞 실루엣 + 가까운 쪽 가장자리로 외곽
    if (kit.catcher && ap.pos === 'C') {
      const ct = toneOf(kit.catcher.gear, { shade: 0.08 });
      const fr: P[] = [], nearE: P[] = [];
      const yTop = -1.5, yBot = tm.yBelt + 1.5;
      const halfW = (y: number) => b.chestHalf * (0.97 - 0.12 * smooth01((y - 20) / 25));
      for (let y = yTop; y <= yBot + 0.01; y += 1.5) {
        let best = -Infinity;
        const W = halfW(y);
        for (let X = -W; X <= W; X += W / 6) {
          const v = surfPt(X, y, jm.frontZ(X, y) + 2.2);
          const sp = J.spineAt(y);
          const s = dot(sub(v, sp.p), sp.fwd);
          if (s > best) best = s;
        }
        const sp = J.spineAt(y);
        fr.push(add(sp.p, mul(sp.fwd, best)));
        nearE.push(surfPt(-W, y, jm.frontZ(-W, y) + 1.6));
      }
      // 아래는 둥글게, 위는 목 앞 패드
      const cp: Q[] = [...fr.map((p, i) => (i === fr.length - 1 ? ([p[0], p[1], 0.6] as Q) : p)), ...nearE.slice().reverse().map((p, i) => (i === 0 ? ([p[0], p[1], 0.6] as Q) : p))];
      let cx = '';
      // 칸 나눔(가로 패드 줄) — 표면을 따라 휘게
      for (let y = 7; y < yBot - 3; y += 7.5) {
        const ln: P[] = [];
        const W = halfW(y);
        for (let X = -W; X <= W * 0.6; X += W / 5) ln.push(surfPt(X, y + 0.8 * Math.cos((X / W) * 1.4), jm.frontZ(X, y) + 2.3));
        cx += `<path d="${smoothPath(ln, false)}" fill="none" stroke="${ct.deep}" stroke-width="0.55" opacity="0.9"/>`;
      }
      // 가장자리 테두리 (구단 보조색)
      cx += `<path d="${smoothPath(cp)}" fill="none" stroke="${kit.catcher.gearTrim}" stroke-width="0.9" opacity="0.95"/>`;
      pin += shaded(cp, ct, { light: L2, shade: 3.0, hi: 0.8 }, cx);
      // 어깨 덮개
      const sh = J.shoulder.R;
      const shp: Q[] = [add(sh, [-5.5, -3.5]), add(sh, [0, -5.8]), add(sh, [5.2, -3.2]), add(sh, [4.6, 2.2]), add(sh, [-4.8, 2.4])];
      pin += shaded(shp, ct, { light: L2, shade: 1.8 }, `<path d="${smoothPath(shp)}" fill="none" stroke="${kit.catcher.gearTrim}" stroke-width="0.7"/>`);
    }
    g += clipDef(id, d) + clipped(id, pin);
    // ── 목둘레: 몸통 전체는 목 뒤에, 목둘레 아래 앞판만 목 위에 다시 ──
    const gid = uid('tg');
    const full = `<g id="${gid}">${g}</g>`;
    const pr = (p: V3): V3 => {
      const sp = J.spineAt(p[1]);
      const ya = sp.yaw * D2R;
      const q = add(sp.p, mul(sp.fwd, p[0] * Math.cos(ya) + p[2] * Math.sin(ya)));
      return [q[0], q[1], -p[0] * Math.sin(ya) + p[2] * Math.cos(ya)];
    };
    const s0 = J.spineAt(0);
    const dn = mul(s0.up, -1);
    const below = (arc: P[]): P[] => {
      const a0 = arc[0], a1 = arc[arc.length - 1];
      return [add(a0, mul(s0.fwd, -60)), ...arc, add(a1, mul(s0.fwd, 60)), add(add(a1, mul(s0.fwd, 60)), mul(dn, 160)), add(add(a0, mul(s0.fwd, -60)), mul(dn, 160))];
    };
    const vD = 9.2 + b.fat;
    const arcJ = frontArc(collarLoop(b, jm, 0.9, -3.3, -6.3, vD, 38), pr, s0.yaw);
    const arcU = frontArc(collarLoop(b, tm, 0.3, -2.6, -5.4, 0), pr, s0.yaw);
    // 속셔츠 (V 안쪽)
    const uc = uid('tu');
    const uT2 = toneOf(kit.undershirt, { shade: 0.08 });
    const tight = torsoSil(tm, -6, 30);
    const uPts: P[] = [...tight.Fr, ...tight.Bk.slice().reverse()];
    const above = (arc: P[]): P[] => { const a0 = arc[0], a1 = arc[arc.length - 1]; return [add(a0, mul(dn, -160)), ...arc, add(a1, mul(dn, -160))]; };
    const uc2 = uid('tv');
    let neckl = '';
    if (kit.necklace) {
      // 목걸이: 목 둘레에서 앞으로 처지는 고리 → 보이는 쪽만
      const loop: V3[] = [];
      for (let i = 0; i < 48; i++) {
        const a = -180 + i * 7.5;
        const c = Math.cos(a * D2R), s = Math.sin(a * D2R);
        const sag = Math.pow(Math.max(0, c), 2);
        loop.push([s * (b.neckW + 0.8), -3.2 + 6.2 * sag, c * (b.neckD + 0.9) - 0.4 + 1.4 * sag]);
      }
      const arcN = frontArc(loop, pr, s0.yaw);
      neckl = `<path d="${smoothPath(arcN, false)}" fill="none" stroke="${adj(kit.necklace.color, { l: -0.08 })}" stroke-width="0.42" stroke-linecap="round"/>`;
    }
    let under = clipDef(uc, polyPath(below(arcU))) + clipDef(uc2, polyPath(above(arcJ))) + `<g clip-path="url(#${uc2})">` + clipped(uc, `<path d="${polyPath(uPts)}" fill="${kit.undershirt}"/><path d="${smoothPath(arcU.map((p) => add(p, mul(dn, 1.2))), false)}" fill="none" stroke="${uT2.shade}" stroke-width="0.3"/>${neckl}`) + '</g>';
    const oc = uid('tc');
    under += clipDef(oc, polyPath(below(arcJ))) + `<use href="#${gid}" clip-path="url(#${oc})"/>`;
    under += `<path d="${smoothPath(arcJ, false)}" fill="none" stroke="${kit.jerseyTrim}" stroke-width="0.55" stroke-linejoin="round"/>`;
    return { full, overlay: under };
  };

  // ── 배트 ──
  const drawBat = (): string => {
    if (!pose.bat || !J.batGrip || !J.batTip) return '';
    const a = pose.bat.angle;
    const grip = J.batGrip;
    const knob = add(grip, mul(dir(a), -4.5));
    const prof: K = [[0, 1.9], [1.0, 1.9], [1.7, 1.25], [30, 1.32], [46, 1.72], [60, 2.9], [70, 3.25], [83, 3.2], [84.5, 2.5]];
    const len = 84.5;
    const Fp: P[] = [], Bp: P[] = [];
    const dd = dir(a), nn = frontN(dd);
    for (let i = 0; i <= 40; i++) {
      const s = (len * i) / 40;
      const rr = interp(prof, s);
      const c = add(knob, mul(dd, s));
      Fp.push(add(c, mul(nn, rr)));
      Bp.push(add(c, mul(nn, -rr)));
    }
    const pts: Q[] = [...Fp, ...Bp.reverse()];
    const bt = toneOf(kit.bat, { shade: 0.1 });
    let ex = '';
    if (kit.batBarrel) {
      const cut = [add(knob, add(mul(dd, 52), mul(nn, 6))), add(knob, add(mul(dd, 52), mul(nn, -6))), add(knob, add(mul(dd, 90), mul(nn, -6))), add(knob, add(mul(dd, 90), mul(nn, 6)))];
      ex += `<path d="${polyPath(cut)}" fill="${kit.batBarrel}"/>`;
    }
    // 손잡이 테이프
    const tp = [add(knob, add(mul(dd, 1.8), mul(nn, 1.6))), add(knob, add(mul(dd, 14), mul(nn, 1.6))), add(knob, add(mul(dd, 14), mul(nn, -1.6))), add(knob, add(mul(dd, 1.8), mul(nn, -1.6)))];
    ex += `<path d="${polyPath(tp)}" fill="${kit.batTape}"/>`;
    // 하이라이트 (나무결 느낌 한 줄)
    ex += `<path d="M${fx(add(knob, add(mul(dd, 20), mul(nn, 0.5)))[0])} ${fx(add(knob, add(mul(dd, 20), mul(nn, 0.5)))[1])}L${fx(add(knob, add(mul(dd, 80), mul(nn, 1.4)))[0])} ${fx(add(knob, add(mul(dd, 80), mul(nn, 1.4)))[1])}" stroke="${bt.light}" stroke-width="0.5" opacity="0.6"/>`;
    return part(pts, bt, 1.5, ex);
  };

  // ── 포수 마스크(손에) ──
  const drawMaskInHand = (): string => {
    if (pose.mask !== 'hand' || !kit.catcher) return '';
    const s: Side = gloveSide === 'R' ? 'L' : 'R';
    const W = J.wrist[s];
    const aH = J.a.hand[s];
    // 손에 든 마스크: 비스듬히 본 얼굴 보호구 — 껍데기(구단색) + 철망 + 안쪽 패드
    const c0 = place(W, aH, [[2.2, 11.5]])[0] as P;
    const mt = toneOf(kit.catcher.mask, { shade: 0.08 });
    const tilt = -18;
    const rotp = (x: number, y: number): Q => { const a = tilt * D2R; return [c0[0] + x * Math.cos(a) - y * Math.sin(a), c0[1] + x * Math.sin(a) + y * Math.cos(a)]; };
    const shell: Q[] = [rotp(-7.2, -9.5), rotp(0, -12), rotp(6.8, -9.8), rotp(8.2, -1), rotp(6.4, 8.5), rotp(2.2, 12.5), rotp(-3.2, 12.2), rotp(-7.6, 6.5), rotp(-8.6, -2)];
    const inner: Q[] = [rotp(-5.4, -7.6), rotp(0, -9.6), rotp(5.0, -7.8), rotp(6.2, -0.8), rotp(4.8, 7.0), rotp(1.6, 10.2), rotp(-2.6, 9.8), rotp(-5.8, 5.2), rotp(-6.6, -1.6)];
    let ex = fillP(inner, adj(kit.catcher.mask, { l: -0.2 }), 'opacity="0.85"');
    // 이마·턱 패드
    ex += fillP([rotp(-4.6, -7.2), rotp(0, -8.8), rotp(4.4, -7.3), rotp(3.8, -4.6), rotp(-4.0, -4.4)], '#2b2422');
    ex += fillP([rotp(-2.4, 6.8), rotp(2.6, 6.8), rotp(1.8, 9.4), rotp(-1.8, 9.2)], '#2b2422');
    // 철망(가로 3줄 + 세로 2줄), 바깥으로 살짝 휜 선
    const cage = kit.catcher.cage;
    for (const yy of [-2.4, 1.6, 5.4]) {
      const a = rotp(-7.6, yy), m2 = rotp(0, yy + 1.4), c2 = rotp(7.0, yy);
      ex += `<path d="M${fx(a[0])} ${fx(a[1])}Q${fx(m2[0])} ${fx(m2[1])} ${fx(c2[0])} ${fx(c2[1])}" fill="none" stroke="${cage}" stroke-width="0.85" stroke-linecap="round"/>`;
    }
    for (const xx of [-2.2, 2.2]) {
      const a = rotp(xx, -4.6), c2 = rotp(xx * 0.8, 11.4);
      ex += `<path d="M${fx(a[0])} ${fx(a[1])}L${fx(c2[0])} ${fx(c2[1])}" stroke="${cage}" stroke-width="0.85" stroke-linecap="round"/>`;
    }
    const g = part(shell, mt, 1.8, ex);
    // 마스크를 쥔 손가락이 테두리를 덮음
    const fingers = place(W, aH, [[-1.6, 7.5], [1.4, 8.6], [3.6, 8.2], [2.8, 10.6], [-0.8, 10.4]], b.hand / 17.5, b.hand / 17.5);
    return g + fillP(fingers, sk.base) + fillP(fingers.map((p) => [p[0] + 0.4, p[1] + 0.3] as Q), sk.shade, 'opacity="0.35"');
  };

  // ── 머리 ──
  const hs = b.headScale;
  const gear = o.gear ?? (pose.helmet ? 'helmet' : 'cap');
  const H = renderHead(ap, kit, {
    yaw: pose.headYaw, pitch: 4, light: [0.66, -0.62, 0.42], gear, detail: det, line: lw * 0.8,
    neckLen: J.neckLen, gaze: 0, flap: ap.bats === 'L' ? 'R' : 'L', mirror,
  });
  const nb = proj2(H.c, [0, J.neckLen, -0.5]);
  const headT = `transform="translate(${fx(J.neck[0])} ${fx(J.neck[1])}) rotate(${fx(J.headAngle)}) scale(${fx(hs)}) translate(${fx(-nb[0])} ${fx(-nb[1])})"`;
  const hg = (s: string) => (s ? `<g ${headT}>${s}</g>` : '');

  // ── 순서대로 조립 ──
  const frontArm = (s: Side) => (pose.front && pose.front[s === 'R' ? 'armR' : 'armL'] !== undefined ? !!pose.front[s === 'R' ? 'armR' : 'armL'] : isNear(s));
  let out = '';
  const legL = drawLeg('L');
  const armL = drawArm('L');
  const armR = drawArm('R');
  const legR = drawLeg('R');
  if (!frontArm('L')) out += armL;
  out += legL;
  out += hg(H.back);
  const torso = drawTorso();
  out += torso.full;
  out += hg(H.neck);
  out += torso.overlay;
  out += legR;
  // 가까운 다리가 먼 다리에 드리우는 그림자는 생략(겹침 적음)
  out += hg(H.chin);
  out += hg(H.head);
  if (pose.bat && J.batGrip) out += drawBat();
  if (frontArm('L')) out += armL;
  if (!frontArm('R')) out = armR + out;
  else out += armR;
  out += drawMaskInHand();

  // 바닥 그림자
  let shadow = '';
  if (o.shadow !== false) {
    const xs = [J.heel.R[0], J.toe.R[0], J.heel.L[0], J.toe.L[0]];
    const x0 = Math.min(...xs) - 6, x1 = Math.max(...xs) + 6;
    shadow = `<ellipse cx="${fx((x0 + x1) / 2)}" cy="0.3" rx="${fx((x1 - x0) / 2 + 4)}" ry="2.6" fill="#000" opacity="0.13"/>`;
  }
  let silSvg = '';
  if (lw && sil.length) silSvg = `<g fill="none" stroke="#1e2229" stroke-width="${fx(lw * 2)}" stroke-linejoin="round" opacity="0.85">${sil.map((d) => `<path d="${d}"/>`).join('')}</g>`;
  // 상자
  const pts: P[] = [J.heel.R, J.toe.R, J.heel.L, J.toe.L, J.hand.R, J.hand.L, J.shoulder.R, J.shoulder.L, J.neck, J.hip];
  if (J.batTip) pts.push(J.batTip);
  const [bx0, , bx1] = bbox(pts);
  const top = J.neck[1] - (J.neckLen + 16) * hs;
  return { svg: shadow + silSvg + out, box: [Math.min(bx0, J.neck[0] - 16) - 8, top - 2, Math.max(bx1, J.neck[0] + 16) + 8, 3], j: J };
}

/** 전신 SVG 문자열 (단독 사용) */
export function figureSvg(ap: Appearance, kit: Kit, pose: Pose, o: FigureOpts & { width?: number; height?: number; box?: [number, number, number, number] } = {}): string {
  const f = renderFigure(ap, kit, pose, o);
  const [x0, y0, x1, y1] = o.box ?? f.box;
  const w = x1 - x0, h = y1 - y0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fx(x0)} ${fx(y0)} ${fx(w)} ${fx(h)}" width="${o.width ?? Math.round(w * 2)}" height="${o.height ?? Math.round(h * 2)}">${f.svg}</svg>`;
}
