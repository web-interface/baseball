// 움직이는 전신 — 3D 뼈대(rig3)를 정사영해서 그린다. 요소(DOM)는 한 번만 만들고 매 프레임 경로(d)·변환만 바꾼다.
//   · 머리는 미리 한 번 그려 둔 그림(head.ts)을 목 위치에 옮겨 붙인다(얼굴은 동작 내내 목표를 봄).
//   · 손·글러브·배트는 굳은 그림 + 변환, 팔다리·몸통·신발은 매 프레임 외곽을 다시 계산(클립 없는 명암 띠).
//   · 좌투·좌타는 '거울 쌍둥이'(좌우를 바꾼 사람)로 그린 뒤 화면을 뒤집는다(글자는 다시 바로 세움).
//
//   const fig = new LiveFigure(ap, kit, { gear: 'helmet', mirror: ap.bats === 'L' });
//   svg.innerHTML = fig.markup; fig.bind(svg);    // 한 번
//   fig.draw(motion.sample(t));                    // 매 프레임
//   fig.svgFrame(pose)                             // 정지 장면 문자열(카드·썸네일)

import type { Appearance, Kit, Side } from './types';
import type { P, Q, V3 } from './geom';
import { add, sub, mul, norm, lerp, lerpP, clamp, dot, frontN, D2R, proj2, vadd, vsub, vmul, vnorm, vcross, fx, smoothPath } from './geom';
import { adj, lum, mix, toneOf } from './color';
import { renderHead } from './head';
import { frontZ as headFrontZ, surfScalp, SCZ } from './headModel';
import { torsoModel, collarLoop } from './torso';
import type { TorsoModel } from './torso';
import { advOf } from './portrait';
import { solve3, sgn, SIDES, BALL_T } from './rig3';
import type { Joints3, Pose3 } from './rig3';
import { limb2, limb1, mkProf, grow, band, hull, sp1, poly1, f1, stroke2, compactSvg } from './shape2d';
import type { Prof } from './shape2d';

export interface LiveOpts {
  gear?: 'cap' | 'helmet' | 'none';
  /** 얼굴 방향(카메라 기준 yaw). 기본 84 = 화면 오른쪽 목표를 봄 */
  headYaw?: number;
  /** 카메라를 몸 둘레로 돌림(도) */
  view?: number;
  detail?: number;
  /** 왼쪽을 보게(좌투·좌타) */
  mirror?: boolean;
  /** 포수 마스크를 그릴 수 있게 */
  mask?: boolean;
  /** 핀스트라이프 그리기 */
  pinstripe?: boolean;
  /** 포수 보호대(가슴·다리)를 그림 — 포수가 수비할 때만 */
  catcherGear?: boolean;
}

type Attrs = Record<string, string>;
type Vals = Record<string, Attrs>;
interface Tone { base: string; shade: string; deep: string }

let LIVE_N = 0;
const L2: P = norm([0.72, -0.69]);
const LAYERS = ['legL', 'legR', 'armL', 'armR', 'hb', 'torso', 'hf', 'bat', 'fball', 'smear'] as const;
type Layer = (typeof LAYERS)[number];

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

const toneSet = (hex: string, sh = 0.1): Tone => { const t = toneOf(hex, { shade: sh }); return { base: t.base, shade: t.shade, deep: t.deep }; };
/** 먼 쪽 톤 3단계: 0 가까움 · 1 중간 · 2 멂 */
function tones3(t: Tone): Tone[] {
  const far: Tone = { base: t.shade, shade: t.deep, deep: adj(t.deep, { l: -0.05 }) };
  const mid: Tone = { base: mix(t.base, far.base, 0.5), shade: mix(t.shade, far.shade, 0.5), deep: mix(t.deep, far.deep, 0.5) };
  return [t, mid, far];
}

// 손 모양 (로컬: 손목 원점, +y 손가락 방향, +x 엄지/앞)
const HAND: Record<string, Q[]> = {
  relax: [[-1.9, 0], [-2.25, 3.4], [-2.15, 7.4], [-1.55, 10.6], [-0.4, 13.4], [1.0, 14.2], [1.65, 12.9], [1.35, 10.6], [1.85, 8.4], [3.05, 7.7], [3.1, 6.2], [2.55, 3.5], [2.15, 0.3]],
  fist: [[-2.0, 0], [-2.45, 3.5], [-2.4, 7.0], [-1.5, 9.3], [0.6, 10.0], [2.6, 8.9], [3.25, 6.2], [3.1, 3.2], [2.2, 0.3]],
  open: [[-1.9, 0], [-2.2, 3.6], [-2.0, 8.4], [-1.4, 13.6], [0.0, 15.6], [1.2, 14.8], [1.4, 11.0], [2.2, 8.8], [3.6, 8.6], [3.5, 6.6], [2.6, 3.6], [2.1, 0.3]],
};

const SHOE: [number, number, number][] = [
  [0, 2.9, 6.4], [0.05, 3.7, 8.6], [0.16, 4.1, 10.0], [0.3, 4.2, 9.0], [0.46, 4.5, 6.8], [0.62, 4.8, 5.3], [0.78, 4.6, 4.3], [0.9, 3.8, 3.6], [0.97, 2.6, 2.9], [1.0, 1.4, 2.2],
];

export interface FrameOut { vals: Vals; order: Layer[]; box: [number, number, number, number]; J: Joints3 }

export class LiveFigure {
  readonly ap: Appearance;
  readonly kit: Kit;
  readonly mirror: boolean;
  readonly id: string;
  markup: string;
  private o: LiveOpts;
  private tm: TorsoModel;
  private jm: TorsoModel;
  private cv: number;
  private sv: number;
  private det: number;
  private els: Record<string, Element> = {};
  private layerEls: Partial<Record<Layer, Element>> = {};
  private layerParent: Element | null = null;
  private cur: Record<string, string> = {};
  private curOrder = '';
  private lastHandDir: Record<Side, P> = { R: [0, 1], L: [0, 1] };
  // 정적 그림 조각
  private head: { back: string; neck: string; front: string; mask: string; nb: P; hs: number };
  private T: {
    skin: Tone[]; under: Tone[]; jer: Tone; pants: Tone[]; sock: Tone[]; cleat: Tone[]; comp: Tone[] | null; wb: Tone[] | null; eg: Tone[] | null; gear: Tone[] | null;
    soleCol: string; jerDeep: string;
  };
  private prof: { upper: Prof; fore: Prof; thigh: Prof; shinLow: Prof; shinHigh: Prof; sock: Prof };
  private loopJ: V3[];
  private loopU: V3[];
  private lvIdx: number[];
  private wmLetters: { ch: string; cx: number; t: number }[];
  private wmSize: number;
  private wmY: number;

  constructor(apIn: Appearance, kit: Kit, o: LiveOpts = {}) {
    this.o = o;
    this.mirror = !!o.mirror;
    this.ap = this.mirror ? mirrorAppearance(apIn) : apIn;
    this.kit = kit;
    this.id = 'lf' + (++LIVE_N).toString(36);
    const ap = this.ap, b = ap.build;
    this.tm = torsoModel(b);
    this.jm = torsoModel(b, 2.0);
    const view = (o.view ?? 0) * D2R;
    this.cv = Math.cos(view);
    this.sv = Math.sin(view);
    this.det = o.detail ?? 1;
    const sk = ap.skin;
    const skin: Tone = { base: sk.base, shade: sk.shade, deep: sk.deep };
    this.T = {
      skin: tones3(skin),
      under: tones3(toneSet(kit.undershirt, 0.075)),
      jer: toneSet(kit.jersey, lum(kit.jersey) > 0.8 ? 0.09 : 0.1),
      pants: tones3(toneSet(kit.pants, lum(kit.pants) > 0.8 ? 0.09 : 0.1)),
      sock: tones3(toneSet(kit.sock, 0.08)),
      cleat: tones3(toneSet(kit.cleat, 0.1)),
      comp: kit.armSleeve ? tones3(toneSet(kit.armSleeve.color, 0.08)) : null,
      wb: kit.wristband ? tones3(toneSet(kit.wristband.color, 0.08)) : null,
      eg: kit.elbowGuard ? tones3(toneSet(kit.elbowGuard, 0.08)) : null,
      gear: kit.catcher ? tones3(toneSet(kit.catcher.gear, 0.08)) : null,
      soleCol: lum(kit.cleat) < 0.4 ? '#e9e6df' : '#1d1c20',
      jerDeep: '',
    };
    const jt = toneOf(kit.jersey, { shade: lum(kit.jersey) > 0.8 ? 0.09 : 0.1 });
    this.T.jerDeep = mix(jt.shade, jt.deep, 0.55);
    // 굵기 프로필 (figure.ts 와 같은 값)
    const D = b.upperArmD, dl = b.deltoid, F = b.foreArmD, Wd = b.wristD;
    const Th = b.thighD, Kn = b.kneeD, Ca = b.calfD, An = b.ankleD;
    const upper = mkProf([[0, 0.92 * dl], [0.2, 0.8 * dl], [0.45, 0.52 * D], [0.78, 0.43 * D], [1, 0.37 * D]], [[0, 0.95 * dl], [0.25, 0.57 * D], [0.5, 0.55 * D], [0.85, 0.43 * D], [1, 0.38 * D]]);
    const fore = mkProf([[0, 0.42 * F], [0.22, 0.53 * F], [0.62, 0.42 * F], [1, 0.52 * Wd]], [[0, 0.4 * F], [0.2, 0.5 * F], [0.62, 0.4 * F], [1, 0.5 * Wd]]);
    const shinP = mkProf([[0, 0.52 * Kn], [0.25, 0.43 * Ca], [0.7, 0.35 * Ca], [1, 0.5 * An]], [[0, 0.48 * Kn], [0.25, 0.6 * Ca], [0.55, 0.46 * Ca], [1, 0.5 * An]]);
    const thigh = mkProf([[0, 0.5 * Th + 2.2], [0.35, 0.55 * Th + 1.7], [0.8, 0.46 * Th + 1.7], [1, 0.52 * Kn + 2.0]], [[0, 0.6 * Th + 2.6], [0.3, 0.54 * Th + 2.0], [0.75, 0.45 * Th + 1.9], [1, 0.5 * Kn + 2.2]]);
    const pantShin = (bottom: number): Prof => mkProf([[0, 0.52 * Kn + 2.0], [0.4, 0.42 * Ca + 2.0], [1, 0.42 * Ca + 1.6 + bottom]], [[0, 0.5 * Kn + 2.2], [0.35, 0.55 * Ca + 1.7], [1, 0.45 * Ca + 1.5 + bottom]]);
    const shinHigh: Prof = (t) => { const v = pantShin(0)(t * 0.26); const k = clamp((t - 0.5) * 2, 0, 1); return [v[0] + 0.6 * k * k * (3 - 2 * k), v[1] + 0.6 * k * k * (3 - 2 * k)]; };
    this.prof = { upper, fore, thigh, shinLow: pantShin(0.7), shinHigh, sock: (t) => { const v = shinP(lerp(0.12, 1, t)); return [v[0] + 0.25, v[1] + 0.25]; } };
    // 목둘레 고리 (몸통 좌표, 한 번만)
    const vD = 9.2 + b.fat;
    this.loopJ = collarLoop(b, this.jm, 0.9, -3.3, -6.3, vD, 38).filter((_, i) => i % 2 === 0);
    this.loopU = collarLoop(b, this.tm, 0.3, -2.6, -5.4, 0).filter((_, i) => i % 2 === 0);
    // 몸통 외곽에 쓸 단면 (2칸마다)
    const yEnd = this.tm.yHip + 6 * this.tm.ky;
    this.lvIdx = [];
    const stride = this.det >= 0.9 ? 2 : 3;
    this.jm.lv.forEach((lv, i) => { if (lv.y <= yEnd + 0.01 && (i % stride === 0)) this.lvIdx.push(i); });
    // 가슴 글자 배치
    const word = kit.team.name.toUpperCase();
    this.wmSize = 4.8;
    this.wmY = 13 * this.tm.ky;
    const track = 0.06, size = this.wmSize;
    const ws = [...word].map((ch) => advOf(ch) * size);
    const total = ws.reduce((a, c) => a + c, 0) + track * size * (word.length - 1);
    let x = -total / 2 + 0.6;
    this.wmLetters = [...word].map((ch, i) => { const cx = x + ws[i] / 2; x += ws[i] + track * size; return { ch, cx, t: (cx + total / 2) / total }; });
    // 머리 — 한 번만 그림
    const hs = b.headScale;
    const neckLen = b.neckL / hs;
    const gear = o.gear ?? 'cap';
    const H = renderHead(ap, kit, {
      yaw: (o.headYaw ?? 84) + (o.view ?? 0), pitch: 4, light: [0.66, -0.62, 0.42], gear, detail: this.det, line: 0,
      neckLen, gaze: 0, flap: ap.bats === 'L' ? 'R' : 'L', mirror: this.mirror,
    });
    const nb = proj2(H.c, [0, neckLen, -0.5]);
    let maskSvg = '';
    if (o.mask && kit.catcher) maskSvg = this.maskMarkup(H);
    this.head = { back: compactSvg(H.back), neck: compactSvg(H.neck), front: compactSvg(H.chin + H.head), mask: maskSvg, nb, hs };
    this.markup = this.build({}, [...LAYERS]);
  }

  // ───────────── 정적 조각 ─────────────

  private handMarkup(s: Side, at: (k: string) => string): string {
    const ap = this.ap, kit = this.kit, b = ap.build;
    const sc = b.hand / 17.5;
    const gloveSide: Side = ap.throws === 'R' ? 'L' : 'R';
    const lightL: P = norm([0.72, -0.69]);
    let g = '';
    const disp = (k: string) => at(k) || ' display="none"';
    const one = (name: string, shape: Q[], t: Tone, extra = '') => {
      const pts = shape.map((p) => [p[0] * sc, p[1] * sc] as Q);
      return `<g data-k="hv${s}${name}"${disp('hv' + s + name)}><path d="${sp1(pts)}" fill="${t.base}"/><path d="${band(pts, lightL, 1.3)}" fill="${t.shade}"/>${extra}</g>`;
    };
    const knuckles = (t: Tone) => `<path d="${sp1([[-1.4 * sc, 7.0 * sc], [0.3 * sc, 7.5 * sc], [2.3 * sc, 6.6 * sc]], false)}" fill="none" stroke="${t.shade}" stroke-width="0.35" stroke-linecap="round"/>`;
    for (const q of [0, 2] as const) {
      const sk = this.T.skin[q];
      const tag = q ? 'f' : 'n';
      g += one('relax' + tag, HAND.relax, sk, `<path d="${sp1([[-1.4 * sc, 10.8 * sc], [-0.2 * sc, 11.6 * sc], [0.9 * sc, 11.2 * sc]], false)}" fill="none" stroke="${sk.shade}" stroke-width="0.3"/>`);
      g += one('fist' + tag, HAND.fist, sk, knuckles(sk));
      g += one('open' + tag, HAND.open, sk);
      // 공을 쥔 손
      const bc: P = [1.6 * sc, 8.6 * sc], br = 3.7;
      const ball = `<circle cx="${fx(bc[0])}" cy="${fx(bc[1])}" r="${br}" fill="${q ? '#d9d4ca' : '#f3f0e8'}"/><path d="M${fx(bc[0] - br * 0.5)} ${fx(bc[1] - br * 0.85)}Q${fx(bc[0] - br * 0.05)} ${fx(bc[1])} ${fx(bc[0] - br * 0.5)} ${fx(bc[1] + br * 0.85)}" fill="none" stroke="#c23a32" stroke-width="0.35" stroke-dasharray="0.45 0.35"/>`;
      const fingers: Q[] = [[-1.2, 6.8], [0.6, 7.6], [2.4, 7.0], [1.0, 9.6], [-1.0, 9.2]].map((p) => [p[0] * sc, p[1] * sc] as Q);
      g += one('ball' + tag, HAND.fist, sk, ball + `<path d="${sp1(fingers)}" fill="${sk.shade}" opacity="0.9"/>`);
      // 타격 장갑
      const bg = toneSet(s === 'R' ? kit.batGlove : kit.batGlove2, 0.08);
      const bgt = q ? tones3(bg)[2] : bg;
      g += one('bg' + tag, HAND.fist, bgt, knuckles(bgt));
      g += one('bgr' + tag, HAND.relax, bgt);
      if (s === gloveSide) g += `<g data-k="hv${s}glove${tag}"${disp('hv' + s + 'glove' + tag)}>${this.gloveMarkup(!!q)}</g>`;
    }
    return g;
  }

  private gloveMarkup(far: boolean): string {
    const ap = this.ap, kit = this.kit, b = ap.build;
    const isC = ap.pos === 'C', is1B = ap.pos === '1B';
    const sc = (isC ? 1.08 : ap.pos === 'P' ? 0.98 : ['LF', 'CF', 'RF'].includes(ap.pos) ? 1.06 : 0.94) * (b.hand / 19);
    const gt0 = toneOf(kit.glove, { shade: 0.1 });
    const gt = far ? { base: gt0.shade, shade: gt0.deep, deep: adj(gt0.deep, { l: -0.05 }) } : gt0;
    const S = (pts: Q[]): Q[] => pts.map((p) => [p[0] * sc, p[1] * sc] as Q);
    const shape: Q[] = S(isC
      ? [[-4.5, -0.8], [-6.6, 5], [-7.2, 12], [-5.8, 19], [-2.2, 23.6], [2.6, 23.8], [6.6, 20.4], [8.6, 14.0], [8.0, 7.0], [5.4, 2.0], [3.4, -0.6]]
      : is1B
        ? [[-4.2, -0.8], [-5.6, 5], [-5.8, 13], [-4.6, 21], [-2.2, 27], [1.2, 28.4], [4.4, 26], [7.2, 19], [8.0, 11.5], [7.0, 5.6], [5.2, 1.6], [3.6, -0.6]]
        : [[-4.2, -1.0], [-5.6, 4.0], [-5.9, 10.0], [-5.3, 17.0], [-4.0, 22.5], [-2.2, 25.8], [0.2, 27.0], [2.4, 26.0], [3.6, 23.0], [5.6, 21.5], [7.6, 17.5], [8.4, 12.5], [7.6, 7.5], [5.6, 3.0], [3.8, -0.5]]);
    const lightL: P = norm([0.72, -0.69]);
    let g = `<path d="${sp1(shape)}" fill="${gt.base}"/><path d="${band(shape, lightL, 3.0)}" fill="${gt.shade}"/>`;
    const lines: Q[][] = isC || is1B ? [[[-3, 6], [-2.6, 13], [-1.2, 19]], [[0.5, 6.5], [1.2, 14], [2.4, 20]]] : [[[-3.2, 7], [-3.4, 14], [-2.8, 21.5]], [[-1.0, 7.5], [-1.1, 15], [-0.7, 24]], [[1.2, 8], [1.4, 15], [1.6, 23.2]]];
    for (const ln of lines) g += `<path d="${sp1(stroke2(S(ln) as P[], (t) => 0.02 + 0.2 * Math.sin(Math.PI * t)))}" fill="${far ? gt.deep : gt.shade}" opacity="0.9"/>`;
    if (!isC && this.det > 0.4) {
      g += `<path d="${sp1(S([[4.2, 21.5], [6.8, 18.2], [7.6, 13.5], [5.8, 13.0], [4.6, 17.5]]))}" fill="${far ? gt.deep : gt.shade}" opacity="0.9"/>`;
      if (kit.gloveWeb === 'h') {
        const a = S([[5.2, 14.2], [5.6, 19.6], [4.6, 16.8], [7.0, 16.2]]);
        g += `<path d="M${f1(a[0][0])} ${f1(a[0][1])}L${f1(a[1][0])} ${f1(a[1][1])}M${f1(a[2][0])} ${f1(a[2][1])}L${f1(a[3][0])} ${f1(a[3][1])}" stroke="${kit.gloveLace}" stroke-width="0.45"/>`;
      }
    }
    if (this.det > 0.5) {
      const cxy = shape.reduce((a, p) => [a[0] + p[0] / shape.length, a[1] + p[1] / shape.length], [0, 0]);
      const ins = shape.map((p) => { const v = norm(sub([cxy[0], cxy[1]], [p[0], p[1]])); return [p[0] + v[0] * 0.65, p[1] + v[1] * 0.65] as Q; });
      g += `<path d="${sp1(ins)}" fill="none" stroke="${far ? gt.deep : adj(kit.gloveLace, { l: -0.05 })}" stroke-width="0.55" stroke-dasharray="0.75 0.55" stroke-linecap="round" opacity="0.95"/>`;
    }
    const band0 = S([[-4.4, 0.6], [4.0, 0.6], [4.6, 3.2], [-5.0, 3.2]]);
    g += `<path d="${poly1(band0 as P[])}" fill="${far ? gt.deep : adj(kit.glove, { l: -0.06 })}"/>`;
    return g;
  }

  private batMarkup(): string {
    const kit = this.kit;
    const prof: [number, number][] = [[0, 1.9], [1.0, 1.9], [1.7, 1.25], [30, 1.32], [46, 1.72], [60, 2.9], [70, 3.25], [83, 3.2], [84.5, 2.5]];
    const r = (s: number) => {
      for (let i = 0; i < prof.length - 1; i++) if (s <= prof[i + 1][0]) { const u = (s - prof[i][0]) / (prof[i + 1][0] - prof[i][0]); const k = u * u * (3 - 2 * u); return lerp(prof[i][1], prof[i + 1][1], k); }
      return 2.5;
    };
    const top: Q[] = [], bot: Q[] = [];
    for (let i = 0; i <= 28; i++) { const s = (84.5 * i) / 28; top.push([s, -r(s)]); bot.push([s, r(s)]); }
    const pts: Q[] = [...top, ...bot.reverse()];
    const bt = toneOf(kit.bat, { shade: 0.1 });
    let g = `<path d="${sp1(pts)}" fill="${bt.base}"/>`;
    // 아래(+y)쪽 그림자 띠 — 변환할 때 빛 반대쪽으로 뒤집는다
    const sh: Q[] = [];
    for (let i = 0; i <= 28; i++) { const s = (84.5 * i) / 28; sh.push([s, r(s) * 0.25]); }
    const shade: Q[] = [...bot.slice().reverse(), ...sh.reverse()];
    g += `<path d="${sp1(shade)}" fill="${bt.shade}"/>`;
    if (kit.batBarrel) g += `<path d="${sp1([[52, -3.0], [84.5, -2.6], [84.5, 2.6], [52, 3.0]].map((p) => [p[0], clamp(p[1], -r(p[0]), r(p[0]))] as Q))}" fill="${kit.batBarrel}" opacity="0.92"/>`;
    g += `<path d="M1.8 -1.5L14 -1.4L14 1.4L1.8 1.5Z" fill="${kit.batTape}"/>`;
    g += `<path d="M20 -0.6L80 -1.6" stroke="${bt.light}" stroke-width="0.5" opacity="0.6"/>`;
    return g;
  }

  /** 포수 마스크(옆~3/4 모습) — 머리 그림 좌표계에 철망·패드·껍데기 */
  private maskMarkup(H: ReturnType<typeof renderHead>): string {
    const kit = this.kit;
    if (!kit.catcher) return '';
    const m = H.m, c = H.c;
    const pp = (p: V3) => proj2(c, p);
    const yT = m.browY - 3.2, yB = m.chinY + 2.2;
    const zf = (X: number, y: number) => headFrontZ(m, X, clamp(y, m.yTop + 2, m.yBot - 0.3));
    const cage = kit.catcher.cage;
    const mt = toneOf(kit.catcher.mask, { shade: 0.08 });
    let g = '';
    // 하키형 포수 헬멧 껍데기: 두피를 1.4cm 부풀린 돔, 앞은 눈썹 위·옆과 뒤는 귀 높이까지
    const shellPts: P[] = [];
    for (let phi = -180; phi < 180; phi += 12) {
      const a = Math.abs(phi);
      const yCut = a < 55 ? m.browY - 2.2 : lerp(m.browY - 1, 3.2, clamp((a - 55) / 70, 0, 1));
      for (let k = 0; k <= 5; k++) {
        const y = lerp(m.yTop, yCut, k / 5);
        const s = surfScalp(m, phi, y);
        const rx = s[0], rz = s[2] - SCZ;
        const rl = Math.hypot(rx, rz) || 1;
        const grow = 1.5 + (k === 0 ? 0.4 : 0);
        shellPts.push(pp([rx + (rx / rl) * grow, y - (k === 0 ? 1.2 : 0), s[2] + (rz / rl) * grow]));
      }
    }
    const shell = hull(shellPts);
    g += `<path d="${sp1(shell.map((p) => [p[0], p[1], 0.8] as Q))}" fill="${mt.base}"/><path d="${band(shell, norm([0.72, -0.69]), 2.2)}" fill="${mt.shade}"/>`;
    // 뒤통수 쪽 숨구멍 2개
    for (const [phi, y] of [[-150, m.browY - 4], [-128, m.browY - 1]] as [number, number][]) {
      const s = surfScalp(m, phi, y);
      const q = pp([s[0] * 1.08, y, SCZ + (s[2] - SCZ) * 1.08]);
      g += `<ellipse cx="${fx(q[0])}" cy="${fx(q[1])}" rx="0.9" ry="0.5" fill="${mt.deep}"/>`;
    }
    // 껍데기: 얼굴 둘레 띠 (이마 위 + 볼 옆 + 턱 아래)
    const rim: P[] = [];
    for (let i = 0; i <= 16; i++) {
      const a = -Math.PI / 2 + (i / 16) * Math.PI * 2;
      const X = Math.cos(a) * 7.4, y = lerp(yT, yB, 0.5) + Math.sin(a) * (yB - yT) * 0.55;
      rim.push(pp([X, y, zf(X * 0.8, y) + 2.4]));
    }
    // 패드(검은 안쪽)
    g += `<path d="${smoothPath(rim)}" fill="#2b2422" opacity="0.88"/>`;
    // 가로 철망
    for (const t of [0.12, 0.38, 0.62, 0.86]) {
      const y = lerp(yT, yB, t);
      const pts: P[] = [];
      for (let X = -7; X <= 7.01; X += 1.75) pts.push(pp([X, y, zf(X * 0.85, y) + 3.6]));
      g += `<path d="${smoothPath(pts, false)}" fill="none" stroke="${cage}" stroke-width="0.95" stroke-linecap="round"/>`;
    }
    // 세로 철망 2줄
    for (const X of [-2.3, 2.3]) {
      const pts: P[] = [];
      for (let t = 0; t <= 1.001; t += 0.25) { const y = lerp(yT + 1, yB, t); pts.push(pp([X, y, zf(X, y) + 3.7])); }
      g += `<path d="${smoothPath(pts, false)}" fill="none" stroke="${cage}" stroke-width="0.9" stroke-linecap="round"/>`;
    }
    // 테두리(구단색)
    g += `<path d="${smoothPath(rim)}" fill="none" stroke="${mt.base}" stroke-width="1.6"/>`;
    g += `<path d="${smoothPath(rim)}" fill="none" stroke="${mt.shade}" stroke-width="0.5" transform="translate(0.3 0.3)"/>`;
    return g;
  }

  // ───────────── 마크업 ─────────────

  private build(v: Vals, order: Layer[]): string {
    const id = this.id;
    const at = (k: string) => { const a = v[k]; if (!a) return ''; let s = ''; for (const n in a) s += ` ${n}="${a[n]}"`; return s; };
    const PT = (k: string, stat = '') => `<path data-k="${k}"${stat ? ' ' + stat : ''}${at(k)}/>`;
    const kit = this.kit, ap = this.ap;
    const gloveSide: Side = ap.throws === 'R' ? 'L' : 'R';
    const layer = (L: Layer): string => {
      switch (L) {
        case 'armR': case 'armL': {
          const s: Side = L === 'armR' ? 'R' : 'L';
          let g = PT(`arm${s}`, 'stroke-width="0.45" stroke-linejoin="round"') + PT(`arm${s}s`);
          if (kit.armSleeve && ((kit.armSleeve.arm === 'throw') === (s !== gloveSide))) g += PT(`cmp${s}`) + PT(`cmp${s}s`);
          if (kit.elbowGuard) g += PT(`eg${s}`) + PT(`eg${s}s`);
          if (kit.wristband && (kit.wristband.arm === 'both' || (kit.wristband.arm === 'throw') === (s !== gloveSide))) g += PT(`wb${s}`);
          g += PT(`slv${s}`, `fill="${kit.jersey}" stroke-width="0.55" stroke-linejoin="round"`) + PT(`slv${s}s`) + PT(`slv${s}t1`, `fill="${kit.jerseyTrim}"`) + PT(`slv${s}t2`, `fill="${kit.jerseyTrim2}"`) + PT(`slv${s}w`, 'opacity="0.75"');
          g += `<g data-k="hand${s}"${at('hand' + s)}>${this.handMarkup(s, at)}</g>`;
          return `<g data-l="${L}">${g}</g>`;
        }
        case 'legR': case 'legL': {
          const s: Side = L === 'legR' ? 'R' : 'L';
          let g = '';
          if (kit.socks === 'high') g += PT(`sock${s}`) + PT(`sock${s}s`) + (kit.sockStripe ? PT(`sock${s}t`) : '');
          g += PT(`pnt${s}`) + PT(`pnt${s}s`) + (kit.pantsStripe ? PT(`pnt${s}t`, 'fill="none" stroke-width="1"') : '') + PT(`pnt${s}w`, 'opacity="0.8"');
          if (kit.catcher && ap.pos === 'C' && this.o.catcherGear) g += PT(`lg${s}`) + PT(`lg${s}s`) + PT(`lg${s}t`, `fill="none" stroke="${kit.catcher.gearTrim}" stroke-width="0.6"`);
          g += PT(`shoe${s}`) + PT(`shoe${s}s`) + PT(`sole${s}`) + PT(`shoe${s}t`);
          return `<g data-l="${L}">${g}</g>`;
        }
        case 'hb':
          return `<g data-l="hb"><g data-k="hb"${at('hb')}>${this.head.back}</g></g>`;
        case 'torso': {
          let t = PT('pan') + PT('pans');
          t += PT('jer', `fill="${kit.jersey}"`);
          if (this.o.pinstripe && kit.team.pinstripe && kit.set === 'home') t += PT('pin', `fill="none" stroke="${kit.team.primary}" stroke-width="0.16" opacity="0.5"`);
          t += PT('jers', `fill="${this.T.jer.shade}"`) + PT('jerd', `fill="${this.T.jerDeep}"`) + PT('jerw', `fill="${this.T.jer.shade}" opacity="0.7"`);
          t += PT('plk', `fill="none" stroke="${kit.jerseyTrim}" stroke-width="0.55"`);
          t += `<g data-k="wm"${at('wm')}>` + this.wmLetters.map((l, i) => `<text data-k="wm${i}"${at('wm' + i)} text-anchor="middle" font-family="'Arial Black','Segoe UI Black','Helvetica Neue',Arial,sans-serif" font-weight="900" font-size="${fx(this.wmSize)}" fill="${kit.letter}" stroke="${kit.letterLine}" stroke-width="${fx(this.wmSize * 0.1)}" paint-order="stroke" stroke-linejoin="round">${l.ch}</text>`).join('') + '</g>';
          t += `<text data-k="num"${at('num')} text-anchor="middle" font-family="'Arial Black',Arial,sans-serif" font-weight="900" font-size="13" fill="${kit.letter}" stroke="${kit.letterLine}" stroke-width="0.7" paint-order="stroke">${kit.number}</text>`;
          t += PT('belt', `fill="${kit.belt}"`) + PT('beltl', `fill="none" stroke="${kit.pants}" stroke-width="1.1"`);
          if (kit.catcher && ap.pos === 'C' && this.o.catcherGear) t += PT('cp') + PT('cps') + PT('cpt', `fill="none" stroke="${kit.catcher.gearTrim}" stroke-width="0.9"`);
          let g = `<g id="${id}-t">${t}</g>`;
          g += `<g data-k="hn"${at('hn')}>${this.head.neck}</g>`;
          g += `<clipPath id="${id}-cc">${PT('cc')}</clipPath>`;
          g += PT('und', `fill="${kit.undershirt}"`);
          g += `<use href="#${id}-t" clip-path="url(#${id}-cc)"/>`;
          g += PT('trim', `fill="none" stroke="${kit.jerseyTrim}" stroke-width="0.55" stroke-linejoin="round"`);
          return `<g data-l="torso">${g}</g>`;
        }
        case 'hf':
          return `<g data-l="hf"><g data-k="hf"${at('hf')}>${this.head.front}${this.head.mask ? `<g data-k="mask"${at('mask') || ' display="none"'}>${this.head.mask}</g>` : ''}</g></g>`;
        case 'bat': {
          const bt = toneOf(kit.bat, { shade: 0.1 });
          return `<g data-l="bat">${PT('batsm2', `fill="${bt.base}"`)}${PT('batsm', `fill="${bt.base}"`)}<g data-k="bat"${at('bat')}>${this.batMarkup()}</g><ellipse data-k="batcap"${at('batcap')} rx="1" ry="3.1" fill="${bt.light}"/></g>`;
        }
        case 'fball':
          return `<g data-l="fball"><g data-k="fball"${at('fball')}><circle r="3.7" fill="#f3f0e8"/><path d="M-1.9 -3.1Q-0.2 0 -1.9 3.1" fill="none" stroke="#c23a32" stroke-width="0.4" stroke-dasharray="0.5 0.4"/></g></g>`;
        case 'smear':
          return `<g data-l="smear">${PT('armsm')}</g>`;
      }
    };
    const shadow = PT('shadow', 'fill="#000" opacity="0.13"');
    return `<g data-k="root"${at('root')}>${shadow}<g data-k="body">${order.map(layer).join('')}</g></g>`;
  }

  /** 넣은 마크업의 요소 연결 (root 아래에서 찾음) */
  bind(root: ParentNode): void {
    this.els = {};
    this.cur = {};
    this.curOrder = '';
    root.querySelectorAll('[data-k]').forEach((el) => { this.els[el.getAttribute('data-k')!] = el; });
    this.layerEls = {};
    root.querySelectorAll('[data-l]').forEach((el) => { this.layerEls[el.getAttribute('data-l') as Layer] = el; });
    this.layerParent = this.els['body'] ?? null;
  }

  /** 한 프레임 그리기 (bind 뒤) */
  draw(pose: Pose3, trail?: Pose3[]): FrameOut {
    const out = this.compute(pose, trail, true);
    const v = out.vals;
    for (const k in v) {
      const el = this.els[k];
      if (!el) continue;
      const a = v[k];
      for (const n in a) {
        const key = k + '|' + n;
        const val = a[n];
        if (this.cur[key] !== val) { this.cur[key] = val; el.setAttribute(n, val); }
      }
    }
    const ord = out.order.join(',');
    if (ord !== this.curOrder && this.layerParent) {
      this.curOrder = ord;
      for (const L of out.order) { const el = this.layerEls[L]; if (el) this.layerParent.appendChild(el); }
    }
    return out;
  }

  /** 정지 장면 — <g> 문자열 */
  svgFrame(pose: Pose3, trail?: Pose3[]): { g: string; box: [number, number, number, number] } {
    const out = this.compute(pose, trail, false);
    // 같은 문서에 여러 장면을 넣어도 클립·참조 id 가 겹치지 않게
    const sfx = 's' + (++LIVE_N).toString(36);
    const g = this.build(out.vals, out.order).split(`"${this.id}-`).join(`"${this.id}${sfx}-`).split(`#${this.id}-`).join(`#${this.id}${sfx}-`);
    return { g, box: out.box };
  }

  // ───────────── 프레임 계산 ─────────────

  compute(pose: Pose3, trail: Pose3[] | undefined, live: boolean): FrameOut {
    const ap = this.ap, kit = this.kit, b = ap.build, tm = this.tm, jm = this.jm;
    const T = this.T;
    const det = this.det;
    const cv = this.cv, sv = this.sv;
    const J = solve3(b, pose, tm);
    const pr = (p: V3): P => [p[0] * cv + p[2] * sv, p[1]];
    const zz = (p: V3) => -p[0] * sv + p[2] * cv;
    const prd = (d: V3): P => [d[0] * cv + d[2] * sv, d[1]];
    const v: Vals = {};
    const gloveSide: Side = ap.throws === 'R' ? 'L' : 'R';
    const hide = { display: 'none' };
    const zT = zz(J.spine(20 * tm.ky).p);
    const lvl = (z: number) => { const dz = zT - z; return dz > 10 ? 2 : dz > 3.5 ? 1 : 0; };
    const depth: Record<Layer, number> = { legL: 0, legR: 0, armL: 0, armR: 0, hb: 0, torso: zT, hf: 0, bat: 0, fball: 0, smear: 999 };

    v.root = this.mirror ? { transform: 'scale(-1 1)', opacity: fx(clamp(pose.fade, 0, 1)) } : { opacity: fx(clamp(pose.fade, 0, 1)) };

    // ── 팔 ──
    const sleeveT = 0.5 - 0.05 * b.muscle;
    for (const s of SIDES) {
      const S = J.shoulder[s], E = J.elbow[s], W = J.wrist[s];
      const S2 = pr(S), E2 = pr(E), W2 = pr(W);
      const z = (zz(S) + 2 * zz(E) + 2 * zz(W)) / 5;
      depth[s === 'R' ? 'armR' : 'armL'] = z + (s === 'R' ? 0.01 : 0);
      const q = lvl(z);
      const outline = limb2(S2, E2, W2, this.prof.upper, this.prof.fore, 0.9, 5);
      const bt = (kit.longSleeve ? T.under : T.skin)[q];
      v[`arm${s}`] = { d: sp1(outline), fill: bt.base, stroke: bt.deep };
      v[`arm${s}s`] = { d: band(outline, L2, b.upperArmD * 0.32), fill: bt.shade };
      const comp = kit.armSleeve && ((kit.armSleeve.arm === 'throw') === (s !== gloveSide)) ? kit.armSleeve : null;
      if (comp && T.comp) {
        const ct = T.comp[q];
        const sp = comp.full
          ? limb2(S2, E2, W2, grow(this.prof.upper, 0.1), (t) => { const x = this.prof.fore(Math.min(t, 0.94)); return [x[0] + 0.15, x[1] + 0.15]; }, 0.9, 5)
          : limb1(E2, lerpP(E2, W2, 0.93), (t) => { const x = this.prof.fore(lerp(0, 0.93, t)); return [x[0] + 0.15, x[1] + 0.15]; }, 0.6, 0.1, 4);
        v[`cmp${s}`] = { d: sp1(sp), fill: ct.base };
        v[`cmp${s}s`] = { d: band(sp, L2, b.foreArmD * 0.3), fill: ct.shade };
      }
      if (kit.elbowGuard && T.eg) {
        const batter = !!pose.bat && s === (pose.batTop === 'R' ? 'L' : 'R');
        if (batter) {
          const D = b.upperArmD;
          const gp = limb1(lerpP(S2, E2, 0.72), lerpP(E2, W2, 0.3), () => [0.48 * D + 0.9, 0.5 * D + 0.9], 0.5, 0.5, 3);
          v[`eg${s}`] = { d: sp1(gp), fill: T.eg[q].base, display: 'inline' };
          v[`eg${s}s`] = { d: band(gp, L2, 1.6), fill: T.eg[q].shade, display: 'inline' };
        } else { v[`eg${s}`] = hide; v[`eg${s}s`] = hide; }
      }
      if (kit.wristband && T.wb && (kit.wristband.arm === 'both' || (kit.wristband.arm === 'throw') === (s !== gloveSide))) {
        const wp = limb1(lerpP(E2, W2, 0.8), lerpP(E2, W2, 0.98), (t) => { const x = this.prof.fore(lerp(0.8, 0.98, t)); return [x[0] + 0.45, x[1] + 0.45]; }, 0.2, 0.2, 2);
        v[`wb${s}`] = { d: sp1(wp), fill: T.wb[q].base };
      }
      // 저지 소매
      const dd = norm(sub(E2, S2));
      const slv = limb1(add(S2, mul(dd, -1.5)), lerpP(S2, E2, sleeveT), (t) => { const x = this.prof.upper(t * sleeveT); return [x[0] + 1.35, x[1] + 1.35]; }, 0.95, 0.15, 4);
      const jtn = q === 0 ? this.T.jer : tones3(this.T.jer)[q];
      v[`slv${s}`] = { d: sp1(slv), fill: jtn.base, stroke: jtn.deep };
      v[`slv${s}s`] = { d: band(slv, L2, 3.2), fill: jtn.shade };
      const hem = lerpP(S2, E2, sleeveT);
      const nrm = frontN(dd);
      const w0 = this.prof.upper(sleeveT)[0] + 1.6, w1 = this.prof.upper(sleeveT)[1] + 1.6;
      const stripe = (o0: number, o1: number) => {
        const a = add(hem, mul(dd, -o0)), c = add(hem, mul(dd, -o1));
        return poly1([add(a, mul(nrm, w0)), add(a, mul(nrm, -w1)), add(c, mul(nrm, -w1)), add(c, mul(nrm, w0))]);
      };
      v[`slv${s}t1`] = { d: stripe(0, 0.55), fill: q ? adj(kit.jerseyTrim, { l: -0.06 * q }) : kit.jerseyTrim };
      v[`slv${s}t2`] = { d: stripe(0.95, 1.3), fill: q ? adj(kit.jerseyTrim2, { l: -0.06 * q }) : kit.jerseyTrim2 };
      if (det > 0.4) {
        const fo = [add(lerpP(S2, E2, 0.1), mul(nrm, 2.2)), add(lerpP(S2, E2, 0.26), mul(nrm, 0.6)), add(lerpP(S2, E2, 0.36), mul(nrm, -1.5))];
        v[`slv${s}w`] = { d: sp1(stroke2(fo, (t) => 0.02 + 0.33 * Math.sin(Math.PI * t))), fill: jtn.shade };
      }
      // 손
      v[`hand${s}`] = this.handTransform(s, J, pose, pr, prd);
      const variant = this.handVariant(s, pose) + (q === 2 ? 'f' : 'n');
      for (const name of ['relax', 'fist', 'open', 'ball', 'bg', 'bgr', ...(s === gloveSide ? ['glove'] : [])]) {
        for (const tg of ['n', 'f']) v[`hv${s}${name}${tg}`] = { display: name + tg === variant ? 'inline' : 'none' };
      }
    }

    // ── 다리 ──
    const pts2: P[] = [];
    for (const s of SIDES) {
      const Hh = J.hip[s], Kk = J.knee[s], A = J.ankle[s];
      const H2 = pr(Hh), K2 = pr(Kk), A2 = pr(A);
      const z = (zz(Hh) + 2 * zz(Kk) + 2 * zz(A)) / 5;
      depth[s === 'R' ? 'legR' : 'legL'] = z + (s === 'R' ? 0.01 : 0);
      const q = lvl(z);
      const high = kit.socks === 'high';
      if (high) {
        const spp = limb1(lerpP(K2, A2, 0.12), A2, this.prof.sock, 0.3, 0.3, 4);
        v[`sock${s}`] = { d: sp1(spp), fill: T.sock[q].base };
        v[`sock${s}s`] = { d: band(spp, L2, 2.2), fill: T.sock[q].shade };
        if (kit.sockStripe) {
          const d2 = norm(sub(A2, K2)), nr = frontN(d2);
          const w2 = this.prof.sock(0.3)[0] + 0.3, w3 = this.prof.sock(0.3)[1] + 0.3;
          let st = '';
          for (const [a0, a1] of [[0.3, 0.36], [0.4, 0.43]]) {
            const p0 = lerpP(K2, A2, a0), p1 = lerpP(K2, A2, a1);
            st += poly1([add(p0, mul(nr, w2)), add(p1, mul(nr, w2)), add(p1, mul(nr, -w3)), add(p0, mul(nr, -w3))]);
          }
          v[`sock${s}t`] = { d: st, fill: q ? adj(kit.sockStripe, { l: -0.08 * q }) : kit.sockStripe };
        }
      }
      const pantEnd = high ? lerpP(K2, A2, 0.26) : add(A2, mul(norm(sub(A2, K2)), 1.2));
      const pl = limb2(H2, K2, pantEnd, this.prof.thigh, high ? this.prof.shinHigh : this.prof.shinLow, 0.9, 6);
      v[`pnt${s}`] = { d: sp1(pl), fill: T.pants[q].base };
      v[`pnt${s}s`] = { d: band(pl, L2, 4.2), fill: T.pants[q].shade };
      if (kit.pantsStripe) {
        const out3 = vmul(J.pelvisAx.l, sgn(s));
        const vis = zz(out3) > -0.25;
        if (vis) {
          const d1 = norm(sub(K2, H2));
          v[`pnt${s}t`] = { d: poly1([add(H2, mul(d1, -6)), lerpP(H2, K2, 0.5), K2, lerpP(K2, pantEnd, 0.8)], false), stroke: q ? adj(kit.pantsStripe, { l: -0.08 }) : kit.pantsStripe, display: 'inline' };
        } else v[`pnt${s}t`] = hide;
      }
      if (det > 0.35) {
        const d1 = norm(sub(K2, H2)), n1 = frontN(d1);
        const k1 = [add(K2, add(mul(d1, -7), mul(n1, 2))), add(K2, add(mul(d1, -3), mul(n1, -1))), add(K2, add(mul(d1, -1.5), mul(n1, -5)))];
        const k2 = [add(K2, add(mul(d1, 2.5), mul(n1, 3.5))), add(K2, add(mul(d1, 4.5), mul(n1, 0.5))), add(K2, add(mul(d1, 5.5), mul(n1, -3)))];
        v[`pnt${s}w`] = { d: sp1(stroke2(k1, (t) => 0.02 + 0.38 * Math.sin(Math.PI * t))) + sp1(stroke2(k2, (t) => 0.02 + 0.28 * Math.sin(Math.PI * t))), fill: T.pants[q].shade };
      }
      if (kit.catcher && ap.pos === 'C' && this.o.catcherGear && T.gear) {
        const shinP2 = this.prof.sock;
        const lg = limb1(lerpP(H2, K2, 0.82), add(A2, mul(norm(sub(A2, K2)), 3)), (t) => { const x = shinP2(clamp(t, 0, 1)); return [x[0] + 2.4 + (t < 0.18 ? 1.4 * (1 - t / 0.18) : 0), x[1] + 1.0]; }, 0.7, 0.4, 4);
        v[`lg${s}`] = { d: sp1(lg), fill: T.gear[q].base };
        v[`lg${s}s`] = { d: band(lg, L2, 2.4), fill: T.gear[q].shade };
        const d2 = norm(sub(A2, K2)), n2 = frontN(d2);
        let lt = '';
        for (const t of [0.12, 0.42, 0.7]) { const c = lerpP(K2, A2, t); lt += poly1([add(c, mul(n2, 8)), add(c, mul(n2, -8))], false); }
        v[`lg${s}t`] = { d: lt };
      }
      this.shoe(s, J, pr, zz, q, v, pts2);
    }

    // ── 몸통 ──
    this.torso(J, pose, pr, prd, zz, v);

    // ── 머리 ──
    const N2 = pr(J.neck);
    const hu = prd(J.headUp);
    const hAng = Math.atan2(hu[0], -hu[1]) / D2R + pose.head;
    const hs = this.head.hs, nb = this.head.nb;
    const htf = `translate(${f1(N2[0])} ${f1(N2[1])}) rotate(${f1(hAng)}) scale(${fx(hs)}) translate(${fx(-nb[0])} ${fx(-nb[1])})`;
    v.hb = { transform: htf };
    v.hn = { transform: htf };
    v.hf = { transform: htf };
    if (this.els.mask || !live) v.mask = { display: pose.mask ? 'inline' : 'none' };
    const zN = zz(J.neck);
    // 얼굴은 언제나 몸통 위 (몸통이 크게 기울어도 턱·목이 몸통에 묻히지 않게)
    depth.hf = Math.max(zN + 6, zT + 0.5);
    depth.hb = Math.min(zN - 12, zT - 0.5);

    // ── 배트 ──
    if (pose.bat && J.batKnob && J.batTip && J.batDir) {
      const K2 = pr(J.batKnob), T2 = pr(J.batTip);
      const vv = sub(T2, K2);
      const l = Math.hypot(vv[0], vv[1]);
      const u: P = l > 1e-3 ? [vv[0] / l, vv[1] / l] : [1, 0];
      const s = Math.max(0.03, l / 84);
      const nY: P = [-u[1], u[0]];
      const fy = dot(nY, L2) > 0 ? -1 : 1;
      v.bat = { transform: `matrix(${fx(u[0] * s)} ${fx(u[1] * s)} ${fx(-u[1] * fy)} ${fx(u[0] * fy)} ${f1(K2[0])} ${f1(K2[1])})`, display: 'inline' };
      const dz = zz(J.batDir);
      const cs = Math.sqrt(Math.max(0, 1 - s * s));
      if (dz > 0.15) {
        const tip = add(K2, mul(u, l * (84.3 / 84)));
        v.batcap = { transform: `translate(${f1(tip[0])} ${f1(tip[1])}) rotate(${f1(Math.atan2(u[1], u[0]) / D2R)}) scale(${fx(Math.max(0.05, cs * 3))} 1)`, display: 'inline' };
      } else v.batcap = hide;
      depth.bat = (zz(J.batKnob) * 0.6 + zz(J.batTip) * 0.4);
      // 배트 잔상
      if (trail && trail.length) {
        // 배럴이 쓸고 간 부채꼴 — 가까운 1/60초는 진하게, 그 앞은 옅게 (두 겹)
        const tips: P[] = [T2], mids: P[] = [add(K2, mul(vv, 0.55))];
        for (const tp of trail.slice(0, 3)) {
          if (!tp.bat) break;
          const Jt = solve3(b, tp, tm);
          if (!Jt.batKnob || !Jt.batTip) break;
          const k2 = pr(Jt.batKnob), t2 = pr(Jt.batTip);
          tips.push(t2);
          mids.push(lerpP(k2, t2, 0.55));
        }
        if (tips.length > 2) {
          v.batsm = { d: sp1([tips[0], tips[1], mids[1], mids[0]] as Q[]), opacity: '0.22', display: 'inline' };
          v.batsm2 = { d: sp1([...tips.slice(1), ...mids.slice(1).reverse()] as Q[]), opacity: '0.1', display: 'inline' };
        } else { v.batsm = hide; v.batsm2 = hide; }
      } else { v.batsm = hide; v.batsm2 = hide; }
    } else { v.bat = hide; v.batcap = hide; v.batsm = hide; v.batsm2 = hide; }

    // ── 날아가는 공 ──
    if (pose.ball) {
      const bp = pr(pose.ball);
      v.fball = { transform: `translate(${f1(bp[0])} ${f1(bp[1])})${this.mirror ? ' scale(-1 1)' : ''}`, display: 'inline' };
      depth.fball = zz(pose.ball);
    } else v.fball = hide;

    // ── 팔 잔상 (던지는 손) ──
    if (trail && trail.length && !pose.bat) {
      // 손이 지나간 자리를 따라 가는 가는 속도선 3줄 (끝으로 갈수록 가늘어짐) — 덩어리 잔상 대신
      const s: Side = ap.throws;
      const tips: P[] = [pr(J.palm[s])];
      for (const tp of trail) { const Jt = solve3(b, tp, tm); tips.push(pr(Jt.palm[s])); }
      const len = tips.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - tips[i - 1][0], p[1] - tips[i - 1][1]) : 0), 0);
      if (len > 22) {
        let d = '';
        const offs = [-2.4, 0, 2.4], ws = [0.4, 0.7, 0.4], lens = [0.75, 1, 0.85];
        offs.forEach((o, k) => {
          const pts: P[] = [];
          const nUse = Math.max(2, Math.round(tips.length * lens[k]));
          for (let i = 0; i < nUse; i++) {
            const a = tips[Math.max(0, i - 1)], c = tips[Math.min(tips.length - 1, i + 1)];
            const dd = norm(sub(c, a));
            pts.push(add(tips[i], mul([-dd[1], dd[0]], o)));
          }
          d += sp1(stroke2(pts, (t) => ws[k] * (1 - t)));
        });
        v.armsm = { d, fill: '#5d574d', opacity: '0.42', display: 'inline' };
      } else v.armsm = hide;
    } else v.armsm = hide;

    // ── 바닥 그림자 ──
    const xs = pts2.map((p) => p[0]);
    if (xs.length) {
      const x0 = Math.min(...xs) - 6, x1 = Math.max(...xs) + 6;
      const air = Math.min(J.heel.R[1], J.heel.L[1], J.toe.R[1], J.toe.L[1]);
      const k = clamp(1 + air / 60, 0.4, 1);
      v.shadow = { d: ellipseD((x0 + x1) / 2, 0.3, (x1 - x0) / 2 + 4, 2.6 * k), opacity: f1(0.13 * k) };
    }

    // ── 층 순서 ──
    const order = (Object.keys(depth) as Layer[]).sort((a, c) => depth[a] - depth[c]);
    // 머리 뒤는 몸통보다 먼저, 잔상은 맨 위
    const fix: Layer[] = order.filter((L) => L !== 'hb' && L !== 'smear');
    const ti = fix.indexOf('torso');
    let hbAt = 0;
    for (let i = 0; i < ti; i++) if (depth[fix[i]] < depth.hb) hbAt = i + 1;
    fix.splice(hbAt, 0, 'hb');
    fix.push('smear');

    // ── 상자 ──
    const keyPts: P[] = [...pts2, pr(J.palm.R), pr(J.palm.L), pr(J.elbow.R), pr(J.elbow.L), pr(J.shoulder.R), pr(J.shoulder.L), N2, pr(J.root)];
    if (J.batTip) keyPts.push(pr(J.batTip));
    let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity;
    for (const p of keyPts) { bx0 = Math.min(bx0, p[0]); bx1 = Math.max(bx1, p[0]); by0 = Math.min(by0, p[1]); }
    // 손·글러브 크기만큼 여유
    for (const s of SIDES) { const p = pr(J.palm[s]); const rr = pose.glove === s ? 26 : 12; bx0 = Math.min(bx0, p[0] - rr); bx1 = Math.max(bx1, p[0] + rr); by0 = Math.min(by0, p[1] - rr); }
    const top = N2[1] - (b.neckL + 26 * hs);
    let box: [number, number, number, number] = [Math.min(bx0, N2[0] - 18) - 6, Math.min(by0, top) - 4, Math.max(bx1, N2[0] + 18) + 6, 4];
    if (this.mirror) box = [-box[2], box[1], -box[0], box[3]];
    return { vals: v, order: fix, box, J };
  }

  private handVariant(s: Side, pose: Pose3): string {
    const sh = pose.hand[s].shape;
    if (pose.glove === s) return 'glove';
    if (pose.bat) return pose.batFree === s ? 'bgr' : 'bg';
    if (pose.ballHand === s) return 'ball';
    if (sh === 'open') return 'open';
    if (sh === 'relax') return 'relax';
    return 'fist';
  }

  private handTransform(s: Side, J: Joints3, pose: Pose3, pr: (p: V3) => P, prd: (d: V3) => P): Attrs {
    const b = this.ap.build;
    const W2 = pr(J.wrist[s]);
    const fd3 = vnorm(vsub(J.wrist[s], J.elbow[s]));
    let d2 = prd(fd3);
    let l = Math.hypot(d2[0], d2[1]);
    if (l < 0.3) {
      // 아래팔이 카메라를 향하면 위팔 방향을 섞어 흔들림을 막음
      const ud = prd(vnorm(vsub(J.elbow[s], J.shoulder[s])));
      d2 = add(d2, mul(ud, 0.3 - l));
      l = Math.hypot(d2[0], d2[1]);
    }
    let d: P = l > 1e-4 ? [d2[0] / l, d2[1] / l] : this.lastHandDir[s];
    // 손목 꺾임
    if (pose.hand[s].rot) { const a = pose.hand[s].rot * D2R * (sgn(s) > 0 ? 1 : -1); d = [d[0] * Math.cos(a) - d[1] * Math.sin(a), d[0] * Math.sin(a) + d[1] * Math.cos(a)]; }
    this.lastHandDir[s] = d;
    // 엄지 방향: 가슴 앞 + 몸 안쪽
    const C = J.chestAx;
    const medial = vmul(C.l, s === 'R' ? 1 : -1);
    const th3 = vnorm(vadd(C.f, vmul(medial, 0.6)));
    const th2 = prd(vsub(th3, vmul(fd3, th3[0] * fd3[0] + th3[1] * fd3[1] + th3[2] * fd3[2])));
    const fN = frontN(d);
    const flip = th2[0] * fN[0] + th2[1] * fN[1] < 0 ? -1 : 1;
    const sc = 1;
    void b;
    return { transform: `matrix(${fx(fN[0] * flip * sc)} ${fx(fN[1] * flip * sc)} ${fx(d[0] * sc)} ${fx(d[1] * sc)} ${f1(W2[0])} ${f1(W2[1])})` };
  }

  private shoe(s: Side, J: Joints3, pr: (p: V3) => P, zz: (p: V3) => number, q: number, v: Vals, collect: P[]) {
    const b = this.ap.build, kit = this.kit;
    const L = b.footL;
    const ax = J.footAx[s];
    const ball = J.ballF[s];
    const heel = J.heel[s];
    const up = ax.u;
    const lat = vnorm(vcross(ax.d, up));
    const ws = L / 29;
    const all: P[] = [], sole: P[] = [];
    const base = (u: number): V3 => (u <= BALL_T ? vadd(heel, vmul(ax.d, u * L)) : vadd(ball, vmul(ax.t, (u - BALL_T) * L)));
    for (const [u, hw, h] of SHOE) {
      const c = base(u);
      const w = hw * ws;
      for (const sg of [1, -1]) {
        const e = vmul(lat, sg * w);
        const p0 = vadd(c, e);
        all.push(pr(p0));
        all.push(pr(vadd(vadd(c, vmul(lat, sg * w * 0.98)), vmul(up, h * 0.5))));
        all.push(pr(vadd(vadd(c, vmul(lat, sg * w * 0.55)), vmul(up, h))));
        sole.push(pr(p0), pr(vadd(p0, vmul(up, 1.3))));
      }
      all.push(pr(vadd(c, vmul(up, h + 0.3))));
    }
    const hu = hull(all);
    const ct = this.T.cleat[q];
    v[`shoe${s}`] = { d: sp1(hu.map((p) => [p[0], p[1], 0.7] as Q)), fill: ct.base };
    v[`shoe${s}s`] = { d: band(hu, L2, 1.6), fill: ct.shade };
    const sh = hull(sole);
    v[`sole${s}`] = { d: sp1(sh.map((p) => [p[0], p[1], 0.6] as Q)), fill: q ? adj(this.T.soleCol, { l: -0.08 * q }) : this.T.soleCol };
    const lz = zz(lat);
    if (Math.abs(lz) > 0.3) {
      const sg = lz > 0 ? 1 : -1;
      const P3 = (u: number, h: number): P => { const c = base(u); const hw = interpW(u) * ws; return pr(vadd(vadd(c, vmul(lat, sg * hw * 1.01)), vmul(up, h))); };
      v[`shoe${s}t`] = { d: sp1([P3(0.08, 6.0), P3(0.15, 7.2), P3(0.5, 3.0), P3(0.42, 2.2)]), fill: q ? adj(kit.cleatTrim, { l: -0.08 * q }) : kit.cleatTrim, display: 'inline' };
    } else v[`shoe${s}t`] = { display: 'none' };
    collect.push(pr(heel), pr(J.toe[s]));
  }

  private torso(J: Joints3, pose: Pose3, pr: (p: V3) => P, prd: (d: V3) => P, zz: (p: V3) => number, v: Vals) {
    const ap = this.ap, kit = this.kit, b = ap.build, tm = this.tm, jm = this.jm;
    const T = this.T;
    const beltHalf = 2.1;
    const Fr: P[] = [], Bk: P[] = [], ys: number[] = [];
    let n2Top: P = [1, 0], u2Top: P = [0, -1];
    for (const i of this.lvIdx) {
      const lv = jm.lv[i];
      const sp = J.spine(lv.y);
      const c2 = pr(sp.p);
      let u2 = prd(vmul(sp.a.d, -1));
      const ul = Math.hypot(u2[0], u2[1]);
      u2 = ul > 0.2 ? [u2[0] / ul, u2[1] / ul] : [0, -1];
      const n2: P = [-u2[1], u2[0]];
      if (!ys.length) { n2Top = n2; u2Top = u2; }
      const lx = prd(sp.a.l), fz = prd(sp.a.f);
      const kx = lx[0] * n2[0] + lx[1] * n2[1], kz = fz[0] * n2[0] + fz[1] * n2[1];
      let mn = Infinity, mx = -Infinity;
      for (const [X, Z] of lv.ring) { const w = X * kx + Z * kz; if (w < mn) mn = w; if (w > mx) mx = w; }
      Fr.push(add(c2, mul(n2, mx)));
      Bk.push(add(c2, mul(n2, mn)));
      ys.push(lv.y);
    }
    const n = ys.length;
    const yCut = tm.yBelt - beltHalf + 0.6;
    let jEnd = 0;
    while (jEnd < n - 1 && ys[jEnd + 1] <= yCut) jEnd++;
    let pStart = jEnd;
    while (pStart > 0 && ys[pStart] > tm.yBelt - beltHalf - 1) pStart--;
    const jn = jEnd + 2;
    // 네 모서리는 꺾인 점(접선 0) — 곡선이 모서리에서 부풀어 바지가 삐져나오지 않게
    const sharp = (p: P): Q => [p[0], p[1], 0];
    const jer: Q[] = [...Fr.slice(0, jn), ...Bk.slice(0, jn).reverse()];
    jer[0] = sharp(jer[0] as P); jer[jn - 1] = sharp(jer[jn - 1] as P); jer[jn] = sharp(jer[jn] as P); jer[jer.length - 1] = sharp(jer[jer.length - 1] as P);
    const keepJ = (i: number) => i !== 0 && i !== jer.length - 1 && i !== jn - 1 && i !== jn;
    v.jer = { d: sp1(jer) };
    v.jers = { d: band(jer, L2, 6.5, false, keepJ) };
    v.jerd = { d: band(jer, L2, 1.6, false, keepJ) };
    const pan: Q[] = [...Fr.slice(pStart), ...Bk.slice(pStart).reverse()];
    const pn = n - pStart;
    pan[0] = sharp(pan[0] as P); pan[pan.length - 1] = sharp(pan[pan.length - 1] as P);
    const keepP = (i: number) => i !== 0 && i !== pan.length - 1;
    void pn;
    v.pan = { d: sp1(pan), fill: T.pants[0].base };
    v.pans = { d: band(pan, L2, 6, false, keepP), fill: T.pants[0].shade };
    // 허리띠
    const beltPts = (y: number) => {
      const sp = J.spine(y);
      const c2 = pr(sp.p);
      let u2 = prd(vmul(sp.a.d, -1));
      const ul = Math.hypot(u2[0], u2[1]);
      u2 = ul > 0.2 ? [u2[0] / ul, u2[1] / ul] : [0, -1];
      const n2: P = [-u2[1], u2[0]];
      const lx = prd(sp.a.l), fz = prd(sp.a.f);
      const kx = lx[0] * n2[0] + lx[1] * n2[1], kz = fz[0] * n2[0] + fz[1] * n2[1];
      const lv = jm.lv[Math.max(0, Math.min(jm.lv.length - 1, Math.round(((y - jm.lv[0].y) / (jm.lv[jm.lv.length - 1].y - jm.lv[0].y)) * (jm.lv.length - 1))))];
      let mn = Infinity, mx = -Infinity;
      for (const [X, Z] of lv.ring) { const w = X * kx + Z * kz; if (w < mn) mn = w; if (w > mx) mx = w; }
      return [add(c2, mul(n2, mx + 0.15)), add(c2, mul(n2, mn - 0.15))] as [P, P];
    };
    const bt = beltPts(tm.yBelt - beltHalf), bb = beltPts(tm.yBelt + beltHalf), bm = beltPts(tm.yBelt);
    v.belt = { d: sp1([bt[0], bm[0], bb[0], bb[1], bm[1], bt[1]].map((p, i) => [p[0], p[1], i === 0 || i === 2 || i === 3 || i === 5 ? 0.3 : 1] as Q)) };
    // 몸 표면 점 (X, y, 앞면 Z)
    const surf = (X: number, y: number, off = 0.05): { p: P; face: number; z: number } => {
      const sp = J.spine(y);
      const Z = jm.frontZ(X, y) + off;
      const w: V3 = vadd(vadd(sp.p, vmul(sp.a.l, X)), vmul(sp.a.f, Z));
      const dzdx = (jm.frontZ(X + 0.6, y) - jm.frontZ(X - 0.6, y)) / 1.2;
      const nl = Math.hypot(dzdx, 1);
      const nrm = vadd(vmul(sp.a.l, -dzdx / nl), vmul(sp.a.f, 1 / nl));
      return { p: pr(w), face: zz(nrm), z: zz(w) };
    };
    // 벨트 고리
    let loops = '';
    for (const X of [-b.waistHalf * 0.75, b.waistHalf * 0.2]) {
      const a = surf(X, tm.yBelt - beltHalf - 0.4, 0.1), c = surf(X, tm.yBelt + beltHalf + 0.4, 0.1);
      if (a.face > 0.1) loops += poly1([a.p, c.p], false);
    }
    v.beltl = { d: loops };
    // 단추줄
    const fc = surf(-1.5, 14);
    if (fc.face > 0.1) {
      const pl: P[] = [];
      for (let y = 6; y <= tm.yBelt - 1; y += 4) pl.push(surf(-1.5, y).p);
      v.plk = { d: poly1(pl, false), display: 'inline' };
    } else v.plk = { display: 'none' };
    // 주름 (허리띠 위 블라우스)
    if (this.det > 0.35 && fc.face > -0.2) {
      const yb = tm.yBelt - 3;
      let w = '';
      for (const [xa, k] of [[-6, 1], [4, 0.8]] as [number, number][]) {
        const p0 = surf(xa, yb - 5).p, p1 = surf(xa + 3, yb - 1.5).p, p2 = surf(xa + 7, yb + 0.5).p;
        w += sp1(stroke2([p0, p1, p2], (t) => 0.02 + 0.45 * k * Math.sin(Math.PI * t)));
      }
      v.jerw = { d: w, display: 'inline' };
    } else v.jerw = { display: 'none' };
    // 가슴 글자
    let anyWm = false;
    this.wmLetters.forEach((l, i) => {
      const y = this.wmY - 1.5 * Math.sin(Math.PI * l.t);
      const X = this.mirror ? -l.cx : l.cx;
      const q = surf(X, y, 0.1);
      if (q.face < 0.12) { v['wm' + i] = { display: 'none' }; return; }
      anyWm = true;
      const p0 = surf(X - 0.5, y).p, p1 = surf(X + 0.5, y).p;
      const rot = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) / D2R;
      const slope = -(1.5 * Math.PI * Math.cos(Math.PI * l.t)) / 30;
      // 거울 쌍둥이: 글자 자리는 반대로, 모양은 미리 뒤집어(화면 뒤집기와 상쇄)
      const ang = rot + ((this.mirror ? -1 : 1) * Math.atan(slope)) / D2R;
      const sx = clamp(q.face, 0.12, 1) * (this.mirror ? -1 : 1);
      v['wm' + i] = { transform: `translate(${f1(q.p[0])} ${f1(q.p[1])}) rotate(${f1(ang)}) scale(${fx(sx)} 1) skewX(-9)`, display: 'inline' };
    });
    v.wm = { display: anyWm ? 'inline' : 'none' };
    // 등번호
    const back = J.spine(18);
    const bz = zz(back.a.f);
    if (bz < -0.18) {
      const w: V3 = vadd(back.p, vmul(back.a.f, -b.chestBack - 1.2));
      const p = pr(w);
      const up2 = prd(vmul(back.a.d, -1));
      const ang = Math.atan2(up2[0], -up2[1]) / D2R;
      const sc = clamp(-bz, 0.2, 1);
      v.num = { transform: `translate(${f1(p[0])} ${f1(p[1])}) rotate(${f1(ang)}) translate(0 4) scale(${fx(this.mirror ? -sc : sc)} 1)`, display: 'inline' };
    } else v.num = { display: 'none' };
    // 핀스트라이프 (몇 줄만)
    if (this.o.pinstripe && kit.team.pinstripe && kit.set === 'home') {
      let st = '';
      for (let X = -12; X <= 12.01; X += 3) {
        const seg: P[] = [];
        for (let y = 2; y <= tm.yBelt - 2; y += 6) { const q = surf(X, y, 0.06); if (q.face > 0.05) seg.push(q.p); }
        if (seg.length > 1) st += poly1(seg, false);
      }
      v.pin = { d: st };
    }
    // 포수 가슴 보호대
    if (kit.catcher && ap.pos === 'C' && this.o.catcherGear && T.gear) {
      const fr: P[] = [], bk2: P[] = [];
      for (let y = -1.5; y <= tm.yBelt + 1.6; y += 3) {
        const W = b.chestHalf * (0.97 - 0.12 * clamp((y - 20) / 25, 0, 1));
        const sp = J.spine(y);
        let u2 = prd(vmul(sp.a.d, -1));
        const ul = Math.hypot(u2[0], u2[1]);
        u2 = ul > 0.2 ? [u2[0] / ul, u2[1] / ul] : [0, -1];
        const n2: P = [-u2[1], u2[0]];
        const c2 = pr(sp.p);
        let mn = Infinity, mx = -Infinity;
        for (let X = -W; X <= W + 0.01; X += W / 5) {
          const Z = jm.frontZ(X, y) + 2.2;
          const w = vadd(vadd(sp.p, vmul(sp.a.l, X)), vmul(sp.a.f, Z));
          const p = pr(w);
          const d = (p[0] - c2[0]) * n2[0] + (p[1] - c2[1]) * n2[1];
          if (d < mn) mn = d;
          if (d > mx) mx = d;
        }
        fr.push(add(c2, mul(n2, mx)));
        bk2.push(add(c2, mul(n2, mn)));
      }
      const cp: Q[] = [...fr, ...bk2.reverse()];
      const g = T.gear[0];
      v.cp = { d: sp1(cp), fill: g.base };
      v.cps = { d: band(cp, L2, 3.0), fill: g.shade };
      v.cpt = { d: sp1(cp) };
    }
    // ── 목둘레 ──
    const proj3 = (p: V3) => { const sp = J.spine(p[1]); const w = vadd(vadd(sp.p, vmul(sp.a.l, p[0])), vmul(sp.a.f, p[2])); return { p: pr(w), face: zz(vadd(vmul(sp.a.l, p[0]), vmul(sp.a.f, p[2] + 0.4))) }; };
    const arc = (loop: V3[]): P[] => {
      const q = loop.map(proj3);
      const m = q.length;
      let bestS = 0, bestL = 0;
      for (let s = 0; s < m; s++) {
        if (q[s].face <= 0 || q[(s - 1 + m) % m].face > 0) continue;
        let L = 0;
        while (L < m && q[(s + L) % m].face > 0) L++;
        if (L > bestL) { bestL = L; bestS = s; }
      }
      if (bestL === 0) { bestS = 0; bestL = m; }
      const out: P[] = [];
      for (let k = -1; k <= bestL; k++) out.push(q[(bestS + k + m) % m].p);
      if (out[0][0] > out[out.length - 1][0]) out.reverse();
      return out;
    };
    const aJ = arc(this.loopJ), aU = arc(this.loopU);
    const fw = n2Top, dn: P = [-u2Top[0], -u2Top[1]];
    const a0 = aJ[0], a1 = aJ[aJ.length - 1];
    const sg = dot(sub(a1, a0), fw) >= 0 ? 1 : -1;
    v.cc = { d: poly1([add(a0, mul(fw, -60 * sg)), ...aJ, add(a1, mul(fw, 60 * sg)), add(add(a1, mul(fw, 60 * sg)), mul(dn, 160)), add(add(a0, mul(fw, -60 * sg)), mul(dn, 160))]) };
    v.und = { d: sp1([...aJ, ...aU.slice().reverse()] as Q[]) };
    v.trim = { d: sp1(aJ, false) };
  }
}

const lerpV = (a: V3, c: V3, t: number): V3 => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t];

function interpW(u: number): number {
  for (let i = 0; i < SHOE.length - 1; i++) if (u <= SHOE[i + 1][0]) { const t = (u - SHOE[i][0]) / (SHOE[i + 1][0] - SHOE[i][0]); return lerp(SHOE[i][1], SHOE[i + 1][1], t); }
  return SHOE[SHOE.length - 1][1];
}

function ellipseD(cx: number, cy: number, rx: number, ry: number): string {
  return `M${f1(cx - rx)} ${f1(cy)}A${f1(rx)} ${f1(ry)} 0 1 0 ${f1(cx + rx)} ${f1(cy)}A${f1(rx)} ${f1(ry)} 0 1 0 ${f1(cx - rx)} ${f1(cy)}Z`;
}
