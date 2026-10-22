// 카드 초상 — 정면~3/4 각도의 상반신. 머리(3D 모형) + 몸통 링 모형 + 유니폼.
// 층: 배경 → 머리 뒤(머리카락·모자 뒤) → 먼 팔 → 저지(승모근까지, 목 뒤) → 목 → 속셔츠 칼라·목걸이
//     → 저지 앞판(목둘레 아래만 다시) → 가까운 팔 → 턱 아래 수염 → 머리

import type { Appearance, Kit } from './types';
import type { P, Q, V3, Cam } from './geom';
import { cam, proj, proj2, lerp, clamp, vnorm, smoothPath, polyPath, fx, norm, mul, add, sub, movePts, taperPts, brush, lerpP, D2R } from './geom';
import { uid, clipDef, clipped, outsideD } from './svg';
import { adj, lum, toneOf } from './color';
import { renderHead } from './head';
import { torsoModel, collarLoop, frontArc } from './torso';
import type { TorsoModel } from './torso';
import { Rng } from './rng';

export interface PortraitOpts {
  /** 출력 크기(px). viewBox 는 cm */
  width?: number;
  height?: number;
  yaw?: number;
  gear?: 'cap' | 'helmet' | 'none';
  background?: 'team' | 'none' | 'plain';
  detail?: number;
  line?: number;
}

const fillP = (pts: readonly Q[], fill: string, extra = '') => (pts.length > 2 ? `<path d="${smoothPath(pts)}" fill="${fill}"${extra ? ' ' + extra : ''}/>` : '');

/** Arial Black 대문자 대략 폭(em) — 글자 간격 계산용 */
const ADV: Record<string, number> = {
  A: 0.78, B: 0.78, C: 0.78, D: 0.8, E: 0.72, F: 0.67, G: 0.84, H: 0.84, I: 0.39, J: 0.67, K: 0.83, L: 0.67, M: 0.95,
  N: 0.84, O: 0.84, P: 0.73, Q: 0.84, R: 0.78, S: 0.72, T: 0.72, U: 0.83, V: 0.78, W: 1.02, X: 0.78, Y: 0.78, Z: 0.72,
};
export const advOf = (ch: string) => ADV[ch] ?? 0.72;

/** 링 묶음 투영 외곽 (레벨별 좌우 끝점) */
function ringSil(lv: { y: number; ring: P[] }[], c: Cam, y0: number, y1: number): { L: P[]; R: P[] } {
  const L: P[] = [], R: P[] = [];
  for (const l of lv) {
    if (l.y < y0 || l.y > y1) continue;
    let a: P | null = null, b: P | null = null;
    for (const [X, Z] of l.ring) {
      const p = proj2(c, [X, l.y, Z]);
      if (!a || p[0] < a[0]) a = p;
      if (!b || p[0] > b[0]) b = p;
    }
    if (a && b) { L.push(a); R.push(b); }
  }
  return { L, R };
}

interface ArmShape { outline: P[]; sleeve: P[]; hem: [P, P]; axis: [P, P]; s: 1 | -1; nrm: P }

function armShape(tm: TorsoModel, c: Cam, s: 1 | -1, sleeveT: number, loose: number): ArmShape {
  const b = tm.b;
  const S = tm.shoulderJ(s);
  const len = b.upperArm * 1.02;
  const out = 1.2 + 3.0 * b.fat + 1.0 * b.muscle;
  const E: V3 = [S[0] + s * out, S[1] + len, S[2] + 1.5];
  const pS = proj2(c, S), pE = proj2(c, E);
  const d = norm(sub(pE, pS));
  const nrm: P = [-d[1], d[0]];
  const rD = b.deltoid + 0.5, rM = b.upperArmD / 2 + 0.3, rE = (b.upperArmD / 2) * 0.8;
  const r = (t: number) => (t < 0.3 ? lerp(rD, rM * 1.03, Math.sin((t / 0.3) * Math.PI * 0.5)) : lerp(rM * 1.03, rE, (t - 0.3) / 0.7));
  const side = (sg: number, t0: number, t1: number, extra: number): P[] => {
    const pts: P[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = lerp(t0, t1, i / 10);
      pts.push(add(lerpP(pS, pE, t), mul(nrm, sg * (r(t) + extra))));
    }
    return pts;
  };
  const cap = (extra: number): P[] => {
    const pts: P[] = [];
    const rr = rD + extra;
    // 오른쪽 끝(-nrm)에서 시작해 어깨 위를 넘어 왼쪽(+nrm)으로 — 외곽 순서와 맞춤
    for (let i = 9; i >= 1; i--) {
      const a = Math.PI * (i / 10);
      pts.push(add(add(pS, mul(d, -Math.sin(a) * rr * 0.58)), mul(nrm, Math.cos(a) * rr)));
    }
    return pts;
  };
  const L = side(1, 0, 1, 0), R = side(-1, 0, 1, 0);
  const outline = [...L, ...R.reverse(), ...cap(0)];
  const Ls = side(1, 0, sleeveT, loose), Rs = side(-1, 0, sleeveT, loose);
  const sleeve = [...Ls, ...Rs.reverse(), ...cap(loose)];
  const hp = lerpP(pS, pE, sleeveT);
  return { outline, sleeve, hem: [add(hp, mul(nrm, r(sleeveT) + loose)), add(hp, mul(nrm, -(r(sleeveT) + loose)))], axis: [pS, pE], s, nrm };
}

/** 가슴 글자 — 글자마다 몸 표면에 붙여 원근에 맞게 눌러 그린다 */
export function wordmark(kit: Kit, at: (X: number, y: number) => { p: P; face: number; rot: number }, y0: number, size: number, mirror = false): string {
  const word = kit.team.name.toUpperCase();
  const track = 0.06;
  const ws = [...word].map((ch) => advOf(ch) * size);
  const total = ws.reduce((a, b) => a + b, 0) + track * size * (word.length - 1);
  let x = -total / 2 + 0.6;
  let g = '';
  for (let i = 0; i < word.length; i++) {
    const cx = x + ws[i] / 2;
    x += ws[i] + track * size;
    const t = (cx + total / 2) / total;
    const y = y0 - 1.5 * Math.sin(Math.PI * t);
    // 거울 쌍둥이로 그릴 때는 글자 자리를 좌우 반대로, 글자 모양은 다시 뒤집어 둔다
    const q = at(mirror ? -cx : cx, y);
    if (q.face < 0.12) continue;
    const slope = -(1.5 * Math.PI * Math.cos(Math.PI * t)) / total;
    const ang = q.rot + (mirror ? -1 : 1) * Math.atan(slope * 1) / D2R;
    g += `<text transform="translate(${fx(q.p[0])} ${fx(q.p[1])}) rotate(${fx(ang)}) scale(${fx((mirror ? -1 : 1) * clamp(q.face, 0.12, 1))} 1) skewX(-9)" text-anchor="middle" font-family="'Arial Black','Segoe UI Black','Helvetica Neue',Arial,sans-serif" font-weight="900" font-size="${fx(size)}" fill="${kit.letter}" stroke="${kit.letterLine}" stroke-width="${fx(size * 0.1)}" paint-order="stroke" stroke-linejoin="round">${word[i]}</text>`;
  }
  return g;
}

export function renderPortraitBody(ap: Appearance, kit: Kit, tm: TorsoModel, c: Cam, L: V3, det: number, lw: number, yBottom: number) {
  const L2 = norm([L[0], L[1]]);
  const b = tm.b;
  const jt = toneOf(kit.jersey, { shade: lum(kit.jersey) > 0.8 ? 0.085 : 0.1 });
  const ut = toneOf(kit.undershirt, { shade: 0.08 });
  const loose = 1.2;
  const near: 1 | -1 = c.yaw < 0 ? 1 : -1;
  const sleeveT = 0.52 - 0.06 * b.muscle;
  const jm = torsoModel(b, loose);
  const jer = ringSil(jm.lv, c, jm.lv[0].y, yBottom);
  const arms = ([-1, 1] as const).map((s) => armShape(tm, c, s, sleeveT, loose));
  const armN = arms.find((a) => a.s === near)!, armF = arms.find((a) => a.s !== near)!;
  const sk = ap.skin;
  const pr = (p: V3) => proj(c, p);

  const armSkin = (a: ArmShape) => {
    const id = uid('pa');
    const d = smoothPath(a.outline);
    const comp = kit.armSleeve && kit.armSleeve.full ? kit.armSleeve.color : null;
    const col = comp ?? (kit.longSleeve ? kit.undershirt : sk.base);
    const tn = comp ? toneOf(comp, { shade: 0.08 }) : kit.longSleeve ? ut : { base: sk.base, shade: sk.shade, deep: sk.deep, light: sk.light, line: sk.line };
    let g = '';
    if (lw) g += `<path d="${d}" fill="none" stroke="${tn.line}" stroke-width="${fx(lw * 2)}"/>`;
    g += `<path d="${d}" fill="${col}"/>`;
    g += clipDef(id, d) + clipped(id, `<path fill-rule="evenodd" fill="${tn.shade}" d="${outsideD(movePts(a.outline, mul(L2, 2.6)))}"/>`);
    return g;
  };
  const sleeveSvg = (a: ArmShape) => {
    const id = uid('ps');
    const d = smoothPath(a.sleeve);
    let g = '';
    g += `<path d="${d}" fill="${kit.jersey}"/>`;
    let inner = '';
    if (kit.team.pinstripe && kit.set === 'home') {
      for (let k = -4; k <= 4; k++) {
        const o = mul(a.nrm, k * 1.9);
        inner += `<path d="M${fx(a.axis[0][0] + o[0])} ${fx(a.axis[0][1] + o[1] - 8)}L${fx(a.axis[1][0] + o[0])} ${fx(a.axis[1][1] + o[1])}" stroke="${kit.team.primary}" stroke-width="0.12" opacity="0.5"/>`;
      }
    }
    inner += `<path fill-rule="evenodd" fill="${jt.shade}" d="${outsideD(movePts(a.sleeve, mul(L2, 3.0)))}"/>`;
    const [h0, h1] = a.hem;
    const dd = norm(sub(a.axis[1], a.axis[0]));
    const band = (o0: number, o1: number, col: string) => {
      const p = [add(h0, mul(dd, -o0)), add(h1, mul(dd, -o0)), add(h1, mul(dd, -o1)), add(h0, mul(dd, -o1))];
      return `<path d="${polyPath(p)}" fill="${col}"/>`;
    };
    inner += band(-0.5, 0.6, kit.jerseyTrim) + band(1.0, 1.4, kit.jerseyTrim2);
    if (det > 0.4) {
      const top = lerpP(a.axis[0], a.axis[1], 0.14);
      const sgn = a.s * near;
      const f1 = [add(top, mul(a.nrm, sgn * 3.0)), add(lerpP(a.axis[0], a.axis[1], 0.3), mul(a.nrm, sgn * 1.4)), add(lerpP(a.axis[0], a.axis[1], 0.44), mul(a.nrm, sgn * 3.2))];
      inner += fillP(taperPts(f1, brush(0.02, 0.32, 0.02, 0.5)), jt.shade, 'opacity="0.8"');
    }
    g += clipDef(id, d) + clipped(id, inner);
    return g;
  };

  // ── 저지 (전체) ──
  const jPts: P[] = [...jer.R, ...jer.L.slice().reverse()];
  const jd = smoothPath(jPts);
  const gid = uid('pjg');
  const cid = uid('pjc');
  let jin = '';
  if (kit.team.pinstripe && kit.set === 'home') {
    // 몸통 둘레 각도마다 한 줄 — 카메라를 향한 면만
    const sy0 = Math.sin(c.yaw * D2R), cy0 = Math.cos(c.yaw * D2R);
    for (let phi = -180; phi < 180; phi += 6.5) {
      const face = -Math.sin(phi * D2R) * sy0 + Math.cos(phi * D2R) * cy0;
      if (face < 0.03) continue;
      const ln: P[] = [];
      for (let y = jm.lv[0].y + 1; y <= yBottom + 2; y += 2) ln.push(proj2(c, jm.surf(phi, y)));
      if (ln.length > 1) jin += `<path d="${polyPath(ln, false)}" fill="none" stroke="${kit.team.primary}" stroke-width="0.12" opacity="0.5"/>`;
    }
  }
  jin += `<path fill-rule="evenodd" fill="${jt.shade}" d="${outsideD(movePts(jPts, mul(L2, 4.5)))}"/>`;
  jin += `<path fill-rule="evenodd" fill="${jt.deep}" d="${outsideD(movePts(jPts, mul(L2, 1.1)))}" opacity="0.45"/>`;
  // 플래킷(단추줄) + 파이핑
  const vBot = 6.4 + 0.9 * b.fat;
  const plk = (dx: number): P[] => {
    const out: P[] = [];
    for (let y = vBot; y <= yBottom + 2; y += 1.5) out.push(proj2(c, [dx, y, jm.frontZ(dx, y) + 0.05]));
    return out;
  };
  const pipeW = 0.42;
  jin += `<path d="${polyPath(plk(-1.6), false)}" fill="none" stroke="${kit.jerseyTrim}" stroke-width="${pipeW}"/>`;
  jin += `<path d="${polyPath(plk(1.7), false)}" fill="none" stroke="${jt.shade}" stroke-width="0.12"/>`;
  for (let y = vBot + 2.6; y <= yBottom; y += 7.2) {
    const p = proj2(c, [0.05, y, jm.frontZ(0, y) + 0.12]);
    const fz = Math.cos(c.yaw * D2R);
    jin += `<ellipse cx="${fx(p[0])}" cy="${fx(p[1])}" rx="${fx(0.4 * fz)}" ry="0.4" fill="${adj(kit.jersey, { l: lum(kit.jersey) > 0.6 ? -0.05 : 0.07 })}" stroke="${jt.shade}" stroke-width="0.08"/>`;
  }
  // 가슴 글자
  const cy = Math.cos(c.yaw * D2R), sy = Math.sin(c.yaw * D2R);
  jin += wordmark(kit, (X, y) => {
    const z = jm.frontZ(X, y) + 0.1;
    const dz = (jm.frontZ(X + 0.6, y) - jm.frontZ(X - 0.6, y)) / 1.2;
    const n = vnorm([-dz, 0, 1]);
    const face = -n[0] * sy + n[2] * cy;
    const p0 = proj2(c, [X - 0.5, y, jm.frontZ(X - 0.5, y)]), p1 = proj2(c, [X + 0.5, y, jm.frontZ(X + 0.5, y)]);
    return { p: proj2(c, [X, y, z]), face, rot: Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) / D2R };
  }, 13.2, 4.9);
  // 주름 (겨드랑이 → 가슴 가운데로)
  if (det > 0.4) {
    for (const s of [-1, 1] as const) {
      const pts = [proj2(c, [s * 14, 8, jm.frontZ(s * 14, 8) + 0.05]), proj2(c, [s * 10, 12.5, jm.frontZ(s * 10, 12.5) + 0.05]), proj2(c, [s * 6.5, 18.5, jm.frontZ(s * 6.5, 18.5) + 0.05])];
      jin += fillP(taperPts(pts, brush(0.02, 0.42, 0.02, 0.45)), jt.shade, 'opacity="0.5"');
    }
  }
  // 저지 앞판 위 V 파이핑
  const jLoop = collarLoop(b, jm, 0.9, -3.3, -6.3, vBot + 3.3, 38);
  const arcJ = frontArc(jLoop, pr, c.yaw);
  jin += `<path d="${smoothPath(arcJ, false)}" fill="none" stroke="${kit.jerseyTrim}" stroke-width="${pipeW * 1.25}" stroke-linejoin="round"/>`;
  const jerseyG = `<g id="${gid}">${lw ? `<path d="${jd}" fill="none" stroke="${jt.line}" stroke-width="${fx(lw * 2)}"/>` : ''}<path d="${jd}" fill="${kit.jersey}"/>${clipDef(cid, jd)}${clipped(cid, jin)}</g>`;

  // ── 뒤 층: 먼 팔 + 저지 전체 ──
  const back = armSkin(armF) + sleeveSvg(armF) + jerseyG;

  // ── 앞 층: 속셔츠(크루넥) + 목걸이 + 저지 앞판 다시 ──
  let front = '';
  const uLoop = collarLoop(b, tm, 0.3, -2.6, -5.4, 0);
  const arcU = frontArc(uLoop, pr, c.yaw);
  const far = 60;
  const below = (arc: P[]): P[] => {
    const a0 = arc[0], a1 = arc[arc.length - 1];
    return [[a0[0] - far, a0[1]], ...arc, [a1[0] + far, a1[1]], [a1[0] + far, a1[1] + 120], [a0[0] - far, a0[1] + 120]];
  };
  const above = (arc: P[]): P[] => {
    const a0 = arc[0], a1 = arc[arc.length - 1];
    return [[a0[0], a0[1] - 120], ...arc, [a1[0], a1[1] - 120]];
  };
  const uid1 = uid('pu'), uid2 = uid('pv');
  const uBody: P[] = [...ringSil(tm.lv, c, -6, yBottom).R, ...ringSil(tm.lv, c, -6, yBottom).L.reverse()];
  let uin = `<path d="${polyPath(uBody)}" fill="${kit.undershirt}"/>`;
  // 립 칼라 밴드
  const band: P[] = [...arcU, ...arcU.slice().reverse().map((p) => add(p, [0, 1.25]))];
  uin += `<path d="${polyPath(band)}" fill="${ut.light}" opacity="0.35"/>`;
  uin += `<path d="${smoothPath(arcU.map((p) => add(p, [0, 1.25])), false)}" fill="none" stroke="${ut.shade}" stroke-width="0.16"/>`;
  uin += `<path fill-rule="evenodd" fill="${ut.shade}" d="${outsideD(movePts(uBody, mul(L2, 3)))}"/>`;
  // 속셔츠는 저지 목둘레 위(=V 안쪽)에서만 보이게: 두 영역의 교집합
  front += clipDef(uid1, polyPath(below(arcU))) + clipDef(uid2, polyPath(above(arcJ))) + `<g clip-path="url(#${uid2})">${clipped(uid1, uin)}</g>`;
  if (kit.necklace) {
    const nk: P[] = [];
    for (let i = 0; i <= 18; i++) {
      const a = -78 + (156 * i) / 18;
      const sag = Math.pow(Math.cos(a * D2R), 2);
      nk.push(proj2(c, [Math.sin(a * D2R) * (b.neckW + 0.9), -2.0 + sag * 5.6, Math.cos(a * D2R) * (b.neckD + 1.0) + sag * 1.6]));
    }
    const col = kit.necklace.color;
    front += `<path d="${smoothPath(nk, false)}" fill="none" stroke="${adj(col, { l: -0.12 })}" stroke-width="0.38" stroke-linecap="round"/>`;
    front += kit.necklace.beads
      ? `<path d="${smoothPath(nk, false)}" fill="none" stroke="${adj(col, { l: 0.14 })}" stroke-width="0.3" stroke-dasharray="0.01 0.42" stroke-linecap="round"/>`
      : `<path d="${smoothPath(nk, false)}" fill="none" stroke="${adj(col, { l: 0.2 })}" stroke-width="0.12" stroke-dasharray="0.25 0.22" opacity="0.85"/>`;
  }
  const fcl = uid('pf');
  front += clipDef(fcl, polyPath(below(arcJ))) + `<use href="#${gid}" clip-path="url(#${fcl})"/>`;

  // ── 가까운 팔 ──
  let nearArm = armSkin(armN) + sleeveSvg(armN);
  // 가까운 팔이 몸통에 드리우는 그림자는 생략 — 소매 그림자로 충분
  return { back, front, near: nearArm };
}

/** 카드 초상 SVG (문자열) */
export function renderPortrait(ap: Appearance, kit: Kit, o: PortraitOpts = {}): string {
  const r = new Rng(ap.id).fork('portrait');
  const det = o.detail ?? 1;
  const lw = o.line ?? 0.07;
  const sign = r.chance(0.5) ? -1 : 1;
  const yaw = o.yaw ?? sign * r.range(9, 34);
  const bodyYaw = clamp(yaw * 1.7 + Math.sign(yaw) * r.range(0, 8), -56, 56);
  const tilt = r.range(-3, 3);
  const pitch = 5;
  const hs = ap.build.headScale;
  // 빛은 얼굴이 향한 쪽 위에서 (짧은 조명)
  const Lp: V3 = vnorm([Math.sign(yaw) * 0.62, -0.58, 0.55]);
  const gear = o.gear ?? 'cap';
  const H = renderHead(ap, kit, { yaw, pitch: pitch + r.range(1, 6), light: Lp, gear, detail: det, line: lw, gaze: 0.85, flap: ap.bats === 'L' ? 'R' : 'L' });
  const cb = cam(bodyYaw, pitch);
  const tm = torsoModel(ap.build);
  // 목 밑: 머리 좌표 (0, 목길이, -0.5) → 화면
  const nLen = ap.build.neckL / hs - 1.2;
  const nb = proj2(H.c, [0, nLen, -0.5]);
  const N: P = [nb[0] * hs, nb[1] * hs];
  const yBottom = 30;
  const B = renderPortraitBody(ap, kit, tm, cb, Lp, det, lw, yBottom);
  // 화면 틀 (cm)
  const W = 39, Hh = 52;
  const ox = -yaw * 0.1;
  const vx = -W / 2 + ox, vy = -19.4;
  const bg = o.background ?? 'team';
  const id = uid('pt');
  let bgSvg = '';
  if (bg === 'team') {
    const t1 = kit.team.primary;
    bgSvg = `<defs><linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${adj(t1, { l: 0.07 })}"/><stop offset="1" stop-color="${adj(t1, { l: -0.1 })}"/></linearGradient></defs>`;
    bgSvg += `<rect x="${fx(vx)}" y="${fx(vy)}" width="${W}" height="${Hh}" fill="url(#${id}g)"/>`;
    bgSvg += `<text x="${fx(vx + W - 1.5)}" y="${fx(vy + 15.5)}" text-anchor="end" font-family="'Arial Black','Segoe UI Black',Arial,sans-serif" font-weight="900" font-size="16" fill="${adj(t1, { l: 0.08 })}" opacity="0.55">${kit.number}</text>`;
  } else if (bg === 'plain') {
    bgSvg = `<rect x="${fx(vx)}" y="${fx(vy)}" width="${W}" height="${Hh}" fill="#e9e6df"/>`;
  }
  // 머리를 목밑 기준으로 살짝 기울임
  const headG = (s: string) => (s ? `<g transform="rotate(${fx(tilt)} ${fx(N[0])} ${fx(N[1] - 6)}) scale(${fx(hs)})">${s}</g>` : '');
  const bodyG = (s: string) => (s ? `<g transform="translate(${fx(N[0])} ${fx(N[1])})">${s}</g>` : '');
  const content = bgSvg + headG(H.back) + bodyG(B.back) + headG(H.neck) + bodyG(B.front) + headG(H.chin) + bodyG(B.near) + headG(H.head);
  const w = o.width ?? 300, h = o.height ?? 400;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fx(vx)} ${fx(vy)} ${W} ${fx(Hh)}" width="${w}" height="${h}" role="img"><clipPath id="${id}c"><rect x="${fx(vx)}" y="${fx(vy)}" width="${W}" height="${fx(Hh)}"/></clipPath><g clip-path="url(#${id}c)">${content}</g></svg>`;
}
