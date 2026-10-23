// SD 선수 그림 — 코드로 그리는 2D 캐릭터(벡터). drawSd(opts) → SVG 문자열. 이미지 AI·외부 파일 없음.
// 좌표: viewBox 0 0 240 280, 몸 중심 x=120, 발 y≈266. 머리 크게(SD 비율), 굵은 외곽선 + 한 단계 그림자(셀 칠).
// 반전 전 그림은 좌타 · 우투 기준(타자는 손이 그림 오른쪽 어깨, 투수 글러브는 그림 오른쪽 팔) — 우타 · 좌투는 mirror.
// 자세는 POSES — 손 위치만 정하면 팔꿈치는 두 마디 IK 로 잡고, 배트·글러브는 손과 아래팔을 따라간다.
export const INK = '#2b1d17';
type Pt = [number, number];

const hx = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const th = (a: number[]) => '#' + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export const shade = (c: string, k: number) => th(hx(c).map((v) => v * k));
export const mix = (a: string, b: string, t: number) => { const A = hx(a), B = hx(b); return th(A.map((v, i) => v + (B[i] - v) * t)); };
/** 밝기 0~1 (대충 — 글자색 고를 때) */
export const lum = (c: string) => { const [r, g, b] = hx(c); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
const r1 = (n: number) => Math.round(n * 10) / 10;
const P = (x: number, y: number) => `${r1(x)},${r1(y)}`;

export const SKIN = ['#FFE2C8', '#F8CBA3', '#E9B085', '#CC8D62', '#9B6545'];
export const HAIR = ['#1c1613', '#33241b', '#583a25', '#7d5a3c'];

function ell(cx: number, cy: number, rx: number, ry: number, rot = 0) {
  const a = (rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), k = 0.5523;
  const pt = (x: number, y: number) => P(cx + x * c - y * s, cy + x * s + y * c);
  return `M${pt(rx, 0)} C${pt(rx, ry * k)} ${pt(rx * k, ry)} ${pt(0, ry)} C${pt(-rx * k, ry)} ${pt(-rx, ry * k)} ${pt(-rx, 0)} C${pt(-rx, -ry * k)} ${pt(-rx * k, -ry)} ${pt(0, -ry)} C${pt(rx * k, -ry)} ${pt(rx, -ry * k)} ${pt(rx, 0)} Z`;
}

/** 두 원(반지름 ra→rb)을 잇는 캡슐 — 팔 · 다리 · 손가락 */
function capsule(x1: number, y1: number, ra: number, x2: number, y2: number, rb: number) {
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const sa = Math.max(-0.95, Math.min(0.95, (ra - rb) / L)), ca = Math.sqrt(1 - sa * sa);
  const m = [nx * ca + ux * sa, ny * ca + uy * sa], m2 = [-nx * ca + ux * sa, -ny * ca + uy * sa];
  const a1 = P(x1 + m[0] * ra, y1 + m[1] * ra), a2 = P(x2 + m[0] * rb, y2 + m[1] * rb);
  const b2 = P(x2 + m2[0] * rb, y2 + m2[1] * rb), b1 = P(x1 + m2[0] * ra, y1 + m2[1] * ra);
  return `M${a1} L${a2} A${r1(rb)} ${r1(rb)} 0 ${sa < 0 ? 1 : 0} 0 ${b2} L${b1} A${r1(ra)} ${r1(ra)} 0 ${sa > 0 ? 1 : 0} 0 ${a1} Z`;
}

/** 어깨 S → 손 H, 위팔 a · 아래팔 b, hint 쪽으로 팔꿈치 */
function elbow(S: Pt, H: Pt, a: number, b: number, hint: Pt): Pt {
  const dx = H[0] - S[0], dy = H[1] - S[1];
  let d = Math.hypot(dx, dy);
  if (d > a + b - 0.5) { const k = a / (a + b); return [S[0] + dx * k, S[1] + dy * k]; }
  d = Math.max(d, Math.abs(a - b) + 1);
  const ang = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))));
  const base = Math.atan2(dy, dx);
  const e1: Pt = [S[0] + Math.cos(base + ang) * a, S[1] + Math.sin(base + ang) * a];
  const e2: Pt = [S[0] + Math.cos(base - ang) * a, S[1] + Math.sin(base - ang) * a];
  const dist = (p: Pt) => Math.hypot(p[0] - hint[0], p[1] - hint[1]);
  return dist(e1) < dist(e2) ? e1 : e2;
}

function batPath(K: Pt, T: Pt) {
  const dx = T[0] - K[0], dy = T[1] - K[1], L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
  const w = (s: number) => {
    if (s < 0.36) return 3.2 + s * 1.4;
    const t = Math.min(1, (s - 0.36) / 0.42);
    return 3.7 + (8.1 - 3.7) * (t * t * (3 - 2 * t));
  };
  const N = 18, left: string[] = [], right: string[] = [];
  for (let i = 0; i <= N; i++) {
    const s = 0.02 + ((0.955 - 0.02) * i) / N, x = K[0] + dx * s, y = K[1] + dy * s, ww = w(s);
    left.push(P(x + nx * ww, y + ny * ww));
    right.push(P(x - nx * ww, y - ny * ww));
  }
  const we = w(0.955);
  return `M${left.join(' L')} A${r1(we)} ${r1(we)} 0 0 0 ${right[N]} L${right.slice().reverse().join(' L')} Z`;
}

// 눈 — 왼눈 기준(+x 가 코 쪽). 오른눈은 좌우 반전
interface EyeDef { white: string | null; lid: string; lw: number; ix?: number; iy?: number; ir?: number; low?: string; brow: string }
const EYES: EyeDef[] = [
  { // 0 매서운
    white: 'M-9,-1 Q-3,-6.5 9,0 Q4,5 -2,5 Q-7,4 -9,-1 Z', lid: 'M-11,-2.5 Q-3,-8.5 10.5,0', lw: 3.3, ix: 1, iy: 1, ir: 4.7,
    brow: 'M-13,-11.5 Q-2,-15.5 11,-7 L10,-4.5 Q-2,-11 -12.5,-8 Z' },
  { // 1 부릅뜬
    white: ell(0, 0, 8, 6.8), lid: 'M-9,-2.5 Q0,-9.8 9,-2.5', lw: 2.8, ix: 0, iy: 0.5, ir: 3.6,
    brow: 'M-12,-14 Q0,-20 11,-14 L11,-10.5 Q0,-15.5 -12,-10.5 Z' },
  { // 2 실눈
    white: null, lid: 'M-9.5,0.5 Q0,-5 9.5,1.5', lw: 3.5, low: 'M-6,3.8 Q0,4.8 6,3.8',
    brow: 'M-12.5,-10.5 Q-1,-14 11,-6 L10,-3.5 Q-1,-10 -12,-7.5 Z' },
  { // 3 동그란
    white: ell(0, 0.5, 7.5, 7.5), lid: 'M-8.6,-3 Q0,-9.2 8.6,-3', lw: 2.6, ix: 0.5, iy: 1, ir: 5.2,
    brow: 'M-11,-13.5 Q0,-17.5 10,-13 L10,-10.5 Q0,-14.5 -11,-10.5 Z' },
  { // 4 반쯤 감은
    white: 'M-9,1 Q0,-1.5 9,1.5 Q4,6.5 -1,6.5 Q-6,6 -9,1 Z', lid: 'M-10.5,1 Q0,-2.8 10,1.5', lw: 3.8, ix: 1, iy: 3.6, ir: 4.7,
    brow: 'M-12.5,-8.5 Q0,-10 11.5,-7 L11.5,-3.8 Q0,-7 -12.5,-5.2 Z' },
];

const MOUTHS = [
  `<path d="M-6,0 Q0,1.6 6,0" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>`,
  `<path d="M-6,1 Q1,2.2 7,-3" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>`,
  `<rect x="-8" y="-3.5" width="16" height="7.5" rx="2.6" fill="#fff" stroke="${INK}" stroke-width="2"/><path d="M-7,0.2 L7,0.2 M-3,-3 L-3,3.5 M1,-3 L1,3.5 M4.6,-3 L4.6,3.5" stroke="${INK}" stroke-width="0.9"/>`,
  `<path d="M-8,-3 Q0,-5 8,-3 Q6,10 0,10.5 Q-6,10 -8,-3 Z" fill="#6b1d1d" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><path d="M-4.5,7.5 Q0,3.5 4.5,7.5 Q0,10 -4.5,7.5 Z" fill="#e2807a"/><path d="M-7,-2.4 Q0,-4.4 7,-2.4 L6.4,0.4 Q0,-1.4 -6.4,0.4 Z" fill="#fff"/>`,
  `<path d="M-6,2 Q0,-2.2 6,2" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>`,
  `<path d="M-6.5,-1 Q0,4.5 6.5,-1" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>`,
];

interface LegDef { kL: Pt; fL: Pt; kR: Pt; fR: Pt; rL?: number; rR?: number; oL?: Pt; oR?: Pt; front?: 'L' | 'R' }
// 무릎 · 발 위치(x 는 몸 중심 기준). rL/rR 신발 기울기, oL/oR 신발 위치 보정, front 몸 앞으로 든 다리
const LEGS: Record<string, LegDef> = {
  stand: { kL: [-17, 243], fL: [-19, 266], kR: [17, 243], fR: [19, 266] },
  wide: { kL: [-31, 240], fL: [-38, 266], kR: [31, 240], fR: [38, 266] },
  stride: { kL: [-28, 239], fL: [-39, 266], kR: [24, 243], fR: [33, 266] },
  bunt: { kL: [-33, 238], fL: [-36, 266], kR: [31, 238], fR: [35, 266] },
  ready: { kL: [-39, 248], fL: [-40, 268], kR: [39, 248], fR: [40, 268] },
  kick: { kL: [-8, 243], fL: [-9, 266], kR: [17, 192], fR: [21, 236], rR: 80, oR: [2, 7], front: 'R' },
};

interface HandDef { grip?: number; hand?: Pt; hint: Pt; type?: 'fist' | 'mitt' | 'ball'; twist?: number; back?: boolean; bo?: Pt }
interface PoseDef {
  name: string; gear: 'helmet' | 'cap'; legs: keyof typeof LEGS; dy?: number; sL?: number; sR?: number;
  bat?: { K: Pt; T: Pt }; L: HandDef; R: HandDef; ball?: Pt; order: string[];
}
// 자세 — x 는 몸 중심 기준, y 는 절대. grip: 배트 위 위치(0 손잡이 끝 → 1 배트 끝)
// mitt: 손목에서 아래팔 방향으로 이어지고(twist 로 손목 꺾기), back 이면 글러브 손등 쪽
export const POSES = {
  shoulder: { name: '어깨 배트', gear: 'helmet', legs: 'stand', bat: { K: [6, 197], T: [68, 44] },
    L: { hand: [-31, 202], hint: [-62, 182], type: 'fist' }, R: { grip: 0.09, hint: [54, 188] },
    order: ['legs', 'torso', 'armL', 'handL', 'armR', 'bat', 'head', 'handR'] },
  stance: { name: '타격 준비', gear: 'helmet', legs: 'wide', sL: 28, bat: { K: [56, 136], T: [88, 4] },
    L: { grip: 0.06, hint: [20, 170] }, R: { grip: 0.155, hint: [80, 150] },
    order: ['legs', 'torso', 'bat', 'head', 'armL', 'armR', 'handL', 'handR'] },
  lean: { name: '배트 짚기', gear: 'helmet', legs: 'stand', bat: { K: [2, 151], T: [9, 271] },
    L: { grip: 0.075, hint: [-60, 186] }, R: { grip: 0.0, hint: [60, 184] },
    order: ['legs', 'torso', 'armL', 'armR', 'bat', 'handL', 'handR', 'head'] },
  bunt: { name: '번트', gear: 'helmet', legs: 'bunt', dy: 8, bat: { K: [-60, 188], T: [88, 168] },
    L: { grip: 0.07, hint: [-10, 192] }, R: { grip: 0.45, hint: [54, 182] },
    order: ['legs', 'torso', 'armL', 'armR', 'head', 'bat', 'handL', 'handR'] },
  neck: { name: '배트 걸치기', gear: 'helmet', legs: 'stand', bat: { K: [-98, 147], T: [102, 139] },
    L: { grip: 0.17, hint: [-58, 186] }, R: { grip: 0.83, hint: [58, 186] },
    order: ['legs', 'torso', 'bat', 'head', 'armL', 'armR', 'handL', 'handR'] },
  fist: { name: '주먹 불끈', gear: 'helmet', legs: 'stand', bat: { K: [53, 198], T: [74, 284] },
    L: { hand: [-57, 99], hint: [-78, 142], type: 'fist' }, R: { grip: 0.05, hint: [60, 172] },
    order: ['legs', 'torso', 'armR', 'bat', 'handR', 'head', 'armL', 'handL'] },
  set: { name: '세트 포지션', gear: 'cap', legs: 'stand', L: { hand: [-2, 170], hint: [-54, 192], type: 'fist' },
    R: { hand: [12, 178], hint: [46, 204], type: 'mitt', twist: 40, back: true },
    order: ['legs', 'torso', 'armL', 'handL', 'armR', 'handR', 'head'] },
  windup: { name: '와인드업', gear: 'cap', legs: 'kick', L: { hand: [-2, 150], hint: [-52, 176], type: 'fist' },
    R: { hand: [12, 158], hint: [46, 186], type: 'mitt', twist: 40, back: true },
    order: ['legs', 'torso', 'legFront', 'armL', 'handL', 'armR', 'handR', 'head'] },
  cock: { name: '테이크백', gear: 'cap', legs: 'stride', L: { hand: [-66, 108], hint: [-82, 150], type: 'ball', bo: [-8, -10] },
    R: { hand: [60, 140], hint: [50, 186], type: 'mitt', twist: -20 },
    order: ['legs', 'torso', 'armL', 'handL', 'head', 'armR', 'handR'] },
  ready: { name: '수비 준비', gear: 'cap', legs: 'ready', dy: 14, L: { hand: [-20, 226], hint: [-56, 204], type: 'fist' },
    R: { hand: [17, 222], hint: [58, 200], type: 'mitt', twist: 150 },
    order: ['legs', 'torso', 'head', 'armL', 'handL', 'armR', 'handR'] },
  fly: { name: '플라이 캐치', gear: 'cap', legs: 'stand', L: { hand: [-59, 119], hint: [-74, 152], type: 'fist' },
    R: { hand: [58, 104], hint: [78, 152], type: 'mitt', twist: -8 }, ball: [72, 50],
    order: ['legs', 'torso', 'armL', 'handL', 'head', 'armR', 'handR', 'ball'] },
} satisfies Record<string, PoseDef>;
export type SdPose = keyof typeof POSES;

/** 유니폼 색 — 모자/헬멧, 상의, 바지, 띠(속셔츠 · 줄 · 등번호), 모자 글자 */
export interface SdKit { cap: string; uni: string; pants: string; acc: string; letter: string; letterColor: string; num: string; pin?: boolean }

export interface SdOpts {
  /** 같은 화면에 여러 장 있어도 clipPath id 가 겹치지 않게 */
  id: string;
  pose: SdPose;
  kit: SdKit;
  /** 좌타 · 좌투 — 좌우 반전 */
  mirror?: boolean;
  /** 얼굴 방향 −1(왼쪽)~1(오른쪽) · 숙임 · 젖힘 · 고개 기울기(도) */
  look?: number; down?: boolean; up?: boolean; tilt?: number;
  /** 0 마름 · 1 보통 · 2 큰 체격 */
  build?: 0 | 1 | 2;
  skin?: number; hair?: number; hairStyle?: 0 | 1 | 2; iris?: string;
  /** 0 없음 · 1 거뭇 · 2 염소+콧수염 · 3 덥수룩 · 4 콧수염 */
  beard?: number;
  eyes?: number; mouth?: number; nose?: number; brow?: number;
  faceW?: number; jaw?: number; chin?: number; eyeGap?: number; lines?: boolean;
  eyeBlack?: boolean; shades?: boolean; band?: boolean; bandColor?: string;
  gloveColor?: string; batColor?: string; mittColor?: string;
  /** 바닥 그림자 */
  shadow?: boolean;
}

/** 자세의 뼈대 — 어깨 · 팔꿈치 · 손 · 배트(손잡이 K → 끝 T). 그림과 장비 표시(sdPoints)가 같이 쓴다 */
function rig(pose: PoseDef, b: 0 | 1 | 2) {
  const cx = 120, dy = pose.dy || 0, sy = 150 + dy, wy = 206 + dy;
  const sw = [31, 35, 42][b], ww = [25, 29, 37][b];
  const armA = 34, armB = 33;
  const ab = (p: Pt): Pt => [cx + p[0], p[1]];
  const SL: Pt = [cx - sw + 6 + (pose.sL || 0), sy + 2], SR: Pt = [cx + sw - 6 + (pose.sR || 0), sy + 2];
  const K: Pt = pose.bat ? ab(pose.bat.K) : [cx, sy];
  const Tt: Pt = pose.bat ? ab(pose.bat.T) : [cx, sy];
  const bang = pose.bat ? (Math.atan2(Tt[1] - K[1], Tt[0] - K[0]) * 180) / Math.PI : 0;
  const handPos = (h: HandDef): Pt => (h.grip != null ? [K[0] + (Tt[0] - K[0]) * h.grip, K[1] + (Tt[1] - K[1]) * h.grip] : ab(h.hand ?? [0, sy]));
  const HL = handPos(pose.L), HR = handPos(pose.R);
  const EL = elbow(SL, HL, armA, armB, ab(pose.L.hint)), ER = elbow(SR, HR, armA, armB, ab(pose.R.hint));
  return { cx, dy, sy, wy, sw, ww, ab, SL, SR, K, Tt, bang, HL, HR, EL, ER };
}

/** 글러브 가운데 — 손목에서 아래팔 방향으로 (그림 mitt 와 같은 계산) */
function mittCenter(H: Pt, E: Pt, spec: HandDef, b: number): Pt {
  const fl = Math.hypot(H[0] - E[0], H[1] - E[1]) || 1;
  const tw = ((spec.twist || 0) * Math.PI) / 180;
  const u0 = [(H[0] - E[0]) / fl, (H[1] - E[1]) / fl];
  const u = [u0[0] * Math.cos(tw) - u0[1] * Math.sin(tw), u0[0] * Math.sin(tw) + u0[1] * Math.cos(tw)];
  const sc = 1 + b * 0.05;
  return [H[0] + u[0] * 16 * sc, H[1] + u[1] * 16 * sc];
}

/** 몸 위치(viewBox 240×280 좌표, 반전 반영) — 장비 화면이 선을 이을 자리 */
export interface SdPoints { head: Pt; chest: Pt; hip: Pt; elbow: Pt; wrist: Pt; hand: Pt; grip: Pt | null; glove: Pt | null; foot: Pt }
export function sdPoints(opt: Pick<SdOpts, 'pose' | 'build' | 'mirror'>): SdPoints {
  const pose: PoseDef = POSES[opt.pose], b = opt.build ?? 1;
  const r = rig(pose, b);
  const fx = (q: Pt): Pt => (opt.mirror ? [240 - q[0], q[1]] : q);
  const fl = Math.hypot(r.HL[0] - r.EL[0], r.HL[1] - r.EL[1]) || 1;
  const wrist: Pt = [r.HL[0] - ((r.HL[0] - r.EL[0]) / fl) * 9, r.HL[1] - ((r.HL[1] - r.EL[1]) / fl) * 9];
  const lg = LEGS[pose.legs];
  const glove = pose.R.type === 'mitt' ? mittCenter(r.HR, r.ER, pose.R, b) : null;
  return {
    head: fx([r.cx, 30 + r.dy]),
    chest: fx([r.cx, r.sy + 24]),
    hip: fx([r.cx + 24, r.wy + 6]),
    elbow: fx(r.EL),
    wrist: fx(wrist),
    hand: fx(r.HL),
    grip: pose.bat ? fx(r.HL) : null,
    glove: glove ? fx(glove) : null,
    foot: fx(r.ab([lg.fL[0] - 4, lg.fL[1] + 2])),
  };
}

export function drawSd(opt: SdOpts): string {
  const o = {
    look: 0, down: false, up: false, tilt: 0, build: 1 as 0 | 1 | 2, skin: 1, hair: 0, hairStyle: 0, beard: 0, eyes: 0, mouth: 0, nose: 0, brow: 0,
    faceW: 0, jaw: 0, chin: 0, eyeGap: 0, lines: false, eyeBlack: false, shades: false, band: false, bandColor: '#F4F4F2',
    batColor: '#E8C28A', mittColor: '#9B5A2B', shadow: true, mirror: false, iris: '#3a2418', ...opt,
  };
  const pose: PoseDef = POSES[o.pose], K0 = o.kit, b = o.build;
  const pre = `sd${o.id.replace(/[^\w-]/g, '')}`;
  let n = 0;
  const id = () => pre + '_' + n++;
  /** 칠 · 그림자(오른쪽 아래) · 바깥 외곽선(겹친 안쪽 선은 안 보임). 여러 조각(배열)은 각각 칠해 합친다 */
  const part = (d: string | string[], fill: string, q: { sx?: number; sy?: number; w?: number; k?: number; dark?: string; inner?: string } = {}) => {
    const ds = Array.isArray(d) ? d : [d];
    const k = id(), sx = q.sx ?? 4, sy = q.sy ?? 4, w = q.w ?? 2.6;
    const dark = q.dark ?? shade(fill, q.k ?? 0.8);
    let s = w ? `<path d="${ds.join(' ')}" fill="none" stroke="${INK}" stroke-width="${w * 2}" stroke-linejoin="round"/>` : '';
    s += `<clipPath id="${k}">${ds.map((x) => `<path d="${x}"/>`).join('')}</clipPath><g clip-path="url(#${k})">`;
    s += ds.map((x) => `<path d="${x}" fill="${dark}"/>`).join('');
    s += `<g transform="translate(${r1(-sx)},${r1(-sy)})">${ds.map((x) => `<path d="${x}" fill="${fill}"/>`).join('')}</g>${q.inner ?? ''}</g>`;
    return s;
  };
  // 좌우 반전일 때 글자만 다시 뒤집는다
  const txt = (x: number, y: number, size: number, fill: string, sw0: number, t: string) =>
    `<text x="${r1(x)}" y="${r1(y)}" font-family="'Arial Black',Arial,'Helvetica Neue',sans-serif" font-weight="900" font-size="${size}" text-anchor="middle" fill="${fill}" stroke="${INK}" stroke-width="${sw0}" paint-order="stroke"${o.mirror ? ` transform="matrix(-1,0,0,1,${r1(2 * x)},0)"` : ''}>${t}</text>`;

  const { cx, dy, sy, wy, sw, ww, ab, SL, SR, K, Tt, bang, HL, HR, EL, ER } = rig(pose, b);
  const skin = SKIN[o.skin] ?? SKIN[1], hair = HAIR[o.hair] ?? HAIR[0];
  const uni = K0.uni, pants = K0.pants, acc = K0.acc;
  const batter = pose.gear === 'helmet';
  const ru = [8.4, 9.4, 11.2][b], rf = [7.6, 8.4, 10][b], rh = [7.4, 8, 9][b];
  const glove = o.gloveColor ?? (batter ? '#F4F4F2' : skin);

  const L: Record<string, string> = {};
  // ── 다리
  {
    const lg = LEGS[pose.legs];
    const hipL: Pt = [cx - 14, wy + 10], hipR: Pt = [cx + 14, wy + 10];
    let s = '';
    const pantsD = [`M${P(cx - ww, wy - 6)} L${P(cx + ww, wy - 6)} L${P(cx + ww + 2, wy + 12)} Q${P(cx, wy + 20)} ${P(cx - ww - 2, wy + 12)} Z`];
    let piping = '';
    const sides: [Pt, Pt, Pt, number, number | undefined, Pt | undefined][] = [[hipL, lg.kL, lg.fL, -1, lg.rL, lg.oL], [hipR, lg.kR, lg.fR, 1, lg.rR, lg.oR]];
    for (const [hip, k0, f0, side, sr, so] of sides) {
      const knee = ab(k0), foot = ab(f0);
      const lifted = lg.front === (side < 0 ? 'L' : 'R');
      let t = part(capsule(knee[0], knee[1], 10.5 + b * 0.6, foot[0], foot[1] - 5, 8.4), acc, { sx: 3, sy: 2 });
      const shoe = ell(foot[0] + (so ? so[0] : side * 5), foot[1] + (so ? so[1] : 1), 12.5, 7, sr ?? side * 6);
      t += part(shoe, '#232327', { sx: 2, sy: 2, inner: `<path d="M${P(foot[0] - side * 5, foot[1] + 6.2)} L${P(foot[0] + side * 16, foot[1] + 3.6)}" stroke="#d9d9d9" stroke-width="2.2"/><path d="M${P(foot[0] + side * 1, foot[1] - 3)} L${P(foot[0] + side * 9, foot[1] + 2)}" stroke="#fff" stroke-width="2" opacity=".8"/>` });
      const pk: Pt = [knee[0] + (foot[0] - knee[0]) * 0.4, knee[1] + (foot[1] - knee[1]) * 0.4];
      const hp: Pt = lifted ? [hip[0] - side * 2, hip[1] - 4] : hip;
      const legD = [capsule(hp[0], hp[1], 15 + b * 1.2, knee[0], knee[1], (lifted ? 14.5 : 12.6) + b * 0.6), capsule(knee[0], knee[1], 12.6 + b * 0.6, pk[0], pk[1], 12.4 + b * 0.6)];
      let pp = `<path d="M${P(knee[0] - 7, knee[1] - 2)} q7,4 13,-1 M${P(knee[0] - 5, knee[1] + 5)} q5,3 10,0" stroke="${shade(pants, 0.72)}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;
      if (lifted) { // 앞으로 들어 올린 다리(와인드업)는 몸통 앞에 따로
        pp += `<path d="M${P(knee[0] + side * 13, knee[1] - 4)} L${P(knee[0] + side * 12, pk[1])}" stroke="${acc}" stroke-width="2.4" fill="none"/>`;
        L.legFront = t + part(legD, pants, { sx: 5, sy: 3, inner: pp });
        continue;
      }
      s += t;
      pantsD.push(...legD);
      piping += `<path d="M${P(hip[0] + side * (13 + b), hip[1] - 2)} L${P(knee[0] + side * (11.5 + b * 0.6), knee[1])}" stroke="${acc}" stroke-width="2.4" fill="none"/>` + pp;
    }
    if (K0.pin) piping += pinstripes(cx - 70, wy - 10, 140, 80, shade(pants, 0.8));
    s += part(pantsD, pants, { sx: 5, sy: 3, inner: piping });
    L.legs = s;
  }
  // ── 몸통(목 · 속셔츠 · 유니폼 · 벨트)
  {
    const hy = 86 + dy;
    let s = part(`M${P(cx - 12, hy + 26)} L${P(cx + 12, hy + 26)} L${P(cx + 12, sy - 4)} L${P(cx - 12, sy - 4)} Z`, shade(skin, 0.9), { sx: 4, sy: 0, inner: `<path d="${ell(cx + o.look * 5, hy + 34, 15, 7)}" fill="${shade(skin, 0.68)}"/>` });
    s += part(`M${P(cx - 15, sy - 15)} L${P(cx + 15, sy - 15)} L${P(cx, sy + 4)} Z`, acc, { sx: 2, sy: 2 });
    const belly = b === 2 ? 7 : 1;
    const torso = `M${P(cx - 12, sy - 14)} C${P(cx - 22, sy - 12)} ${P(cx - sw + 3, sy - 10)} ${P(cx - sw - 1, sy)} C${P(cx - sw - 3, sy + 22)} ${P(cx - ww - belly, sy + 40)} ${P(cx - ww, wy)} L${P(cx + ww, wy)} C${P(cx + ww + belly, sy + 40)} ${P(cx + sw + 3, sy + 22)} ${P(cx + sw + 1, sy)} C${P(cx + sw - 3, sy - 10)} ${P(cx + 22, sy - 12)} ${P(cx + 12, sy - 14)} Q${P(cx + 4, sy - 4)} ${P(cx, sy + 3)} Q${P(cx - 4, sy - 4)} ${P(cx - 12, sy - 14)} Z`;
    const pl = shade(uni, 0.62);
    let inner = K0.pin ? pinstripes(cx - 50, sy - 20, 100, 80, shade(uni, 0.8)) : '';
    inner += `<path d="M${P(cx - 12, sy - 14)} Q${P(cx - 4, sy - 4)} ${P(cx, sy + 3)} Q${P(cx + 4, sy - 4)} ${P(cx + 12, sy - 14)}" fill="none" stroke="${acc}" stroke-width="4"/>`;
    inner += `<path d="M${P(cx - 3.4, sy + 3)} L${P(cx - 3, wy)} M${P(cx + 3.4, sy + 3)} L${P(cx + 3.8, wy)}" stroke="${acc}" stroke-width="1.7"/><path d="M${P(cx, sy + 3)} L${P(cx + 0.4, wy)}" stroke="${pl}" stroke-width="1.2"/>`;
    for (const yy of [sy + 13, sy + 27, sy + 41]) inner += `<circle cx="${r1(cx + 0.2)}" cy="${yy}" r="1.6" fill="${pl}"/>`;
    inner += txt(cx + sw * 0.5, sy + 36, 15, acc, 1.6, K0.num);
    inner += `<path d="M${P(cx - sw * 0.6, sy + 10)} q6,-3 12,0" stroke="${acc}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    const fc = shade(uni, 0.74);
    inner += `<path d="M${P(cx - sw + 7, sy + 7)} q5,7 3,15 M${P(cx + sw - 7, sy + 7)} q-5,7 -3,15 M${P(cx - ww + 5, wy - 13)} q7,3 12,-1 M${P(cx + ww - 5, wy - 13)} q-7,3 -12,-1" stroke="${fc}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`;
    s += part(torso, uni, { sx: 6, sy: 4, inner });
    s += part(`M${P(cx - ww - 1, wy - 8)} L${P(cx + ww + 1, wy - 8)} L${P(cx + ww + 1, wy)} L${P(cx - ww - 1, wy)} Z`, '#2a2a2e', { sx: 0, sy: 2, w: 2 });
    s += part(`M${P(cx - 5, wy - 8.5)} L${P(cx + 5, wy - 8.5)} L${P(cx + 5, wy + 0.5)} L${P(cx - 5, wy + 0.5)} Z`, '#d6d6d6', { sx: 1, sy: 1, w: 1.4 });
    L.torso = s;
  }
  // ── 팔(위팔 · 소매 · 아래팔 · 손목 밴드)
  const arm = (S: Pt, E: Pt, H: Pt) => {
    let s = part(capsule(S[0], S[1], ru, E[0], E[1], ru * 0.92), acc, { sx: 3, sy: 3 });
    const ul = Math.hypot(E[0] - S[0], E[1] - S[1]) || 1, ux = (E[0] - S[0]) / ul, uy = (E[1] - S[1]) / ul;
    const M: Pt = [S[0] + (E[0] - S[0]) * 0.6, S[1] + (E[1] - S[1]) * 0.6];
    const tc: Pt = [M[0] - ux * 2.5, M[1] - uy * 2.5];
    const trim = `<path d="M${P(tc[0] - uy * 24, tc[1] + ux * 24)} L${P(tc[0] + uy * 24, tc[1] - ux * 24)}" stroke="${acc}" stroke-width="3.4"/>`;
    s += part(capsule(S[0], S[1], ru + 3.6, M[0], M[1], ru + 2.9), uni, { sx: 4, sy: 3, inner: trim });
    s += part(capsule(E[0], E[1], rf, H[0], H[1], rf * 0.82), acc, { sx: 3, sy: 3 });
    if (o.band) {
      const fl = Math.hypot(H[0] - E[0], H[1] - E[1]) || 1, fx = (H[0] - E[0]) / fl, fy = (H[1] - E[1]) / fl;
      s += part(capsule(H[0] - fx * 11, H[1] - fy * 11, rf * 0.92, H[0] - fx * 5, H[1] - fy * 5, rf * 0.9), o.bandColor, { sx: 1.5, sy: 1.5, w: 2 });
    }
    return s;
  };
  L.armL = arm(SL, EL, HL);
  L.armR = arm(SR, ER, HR);

  // ── 손
  const fist = (x: number, y: number, ang: number, col: string) => {
    const a = (ang * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
    let lines = '';
    for (const t of [-0.5, 0, 0.5]) {
      const px = x + ux * t * rh, py = y + uy * t * rh;
      lines += `M${P(px + nx * rh * 0.1, py + ny * rh * 0.1)} L${P(px + nx * rh * 0.85, py + ny * rh * 0.85)} `;
    }
    return part(ell(x, y, rh * 1.1, rh * 1.18, ang), col, { sx: 2.5, sy: 2.5, w: 2.4, inner: `<path d="${lines}" stroke="${shade(col, 0.55)}" stroke-width="1.5" stroke-linecap="round" fill="none"/>` });
  };
  /** 야구 글러브 — 손가락 4개 · 엄지 · 격자 웹 · 포켓 · 끈. 손목(H)에서 아래팔(E→H) 방향으로 이어진다.
   *  기본은 포켓(안쪽)이 보이고 엄지가 왼쪽, back 이면 손등 쪽(엄지 오른쪽 · 손목 끈) */
  const mitt = (H: Pt, E: Pt, spec: HandDef, col: string) => {
    const sc = 1 + b * 0.05, back = !!spec.back;
    const C = mittCenter(H, E, spec, b);
    const rot = (Math.atan2(C[1] - H[1], C[0] - H[0]) * 180) / Math.PI + 90;
    const darkLeather = hx(col).reduce((a, v) => a + v, 0) < 200;
    const lace = darkLeather ? '#8d939c' : shade(col, 0.42), seam = shade(col, 0.62);
    const F = [[-8, -2, -12.5, -24, 5.8], [-1, -3, -2, -28.5, 5.8], [6, -2, 8.5, -26.5, 5.6], [12.5, 1, 17.5, -19.5, 5.3]];
    let g = `<g transform="translate(${r1(C[0])},${r1(C[1])}) rotate(${r1(rot)}) scale(${back ? -sc : sc},${sc})">`;
    g += part('M-24,-9 Q-26.5,-20 -18.5,-28 L-12.5,-12 L-13.5,5 Z', shade(col, 0.9), { sx: 1.5, sy: 1.5, w: 2,
      inner: `<path d="M-27,-22 L-11,-25 M-28,-15 L-11,-17.5 M-28,-8 L-11,-10 M-28,-1 L-11,-2.5 M-22,-31 L-19.5,6 M-16.5,-31 L-15,6" stroke="${lace}" stroke-width="1.7" fill="none"/>` });
    for (const [bx, by, tx, ty, r] of F) {
      g += part(capsule(bx, by, r, tx, ty, r * 0.96), col, { sx: 2, sy: 1.5, w: 2.2,
        inner: `<path d="M${P(tx + (bx - tx) * 0.15, ty + (by - ty) * 0.15)} L${P(tx + (bx - tx) * 0.8, ty + (by - ty) * 0.8)}" stroke="${seam}" stroke-width="1.2" fill="none" stroke-linecap="round"/>` });
    }
    let laces = '';
    for (let i = 0; i < 3; i++) {
      const [, , ax, ay, ar] = F[i], [, , bx2, by2, br] = F[i + 1];
      laces += `<path d="M${P(ax + ar * 0.55, ay + 1)} Q${P((ax + bx2) / 2, Math.min(ay, by2) - 1.5)} ${P(bx2 - br * 0.55, by2 + 1)}" stroke="${lace}" stroke-width="2.3" fill="none" stroke-linecap="round"/>`;
    }
    for (const [, , tx, ty] of F) laces += `<circle cx="${tx}" cy="${r1(ty - 3.4)}" r="1.5" fill="${lace}"/>`;
    g += laces;
    const palm = 'M-15.5,-5 Q0,-11 17.5,-3 C21.5,6 19.5,16 12.5,21.5 Q0,26.5 -12.5,21.5 C-18.5,16 -19.5,6 -15.5,-5 Z';
    const heel = `<path d="M-13,21.5 Q0,27 13,21.5 L12.5,17.2 Q0,22.4 -12.5,17.2 Z" fill="${shade(col, 0.74)}"/><path d="M-10.5,20.2 Q0,24.2 10.5,20.2" stroke="${lace}" stroke-width="1.2" stroke-dasharray="2 2" fill="none"/>`;
    const face = back
      ? `<path d="M-16,8 Q0,4 17,8 L17,15.5 Q0,11.5 -16,15.5 Z" fill="${shade(col, 0.82)}"/><rect x="-4.5" y="6.8" width="10" height="6.6" rx="1.6" fill="${acc}" stroke="${INK}" stroke-width="1"/><path d="${ell(0, 22, 9.5, 3.4)}" fill="#1b120c"/>`
      : `<path d="${ell(1.5, 7, 10.5, 11.5)}" fill="${mix(col, '#ffffff', 0.2)}"/><path d="M-8,13.5 Q1.5,18.5 11,12.5" stroke="${seam}" stroke-width="1.3" fill="none"/>`;
    g += part(palm, col, { sx: 2.5, sy: 2.5, w: 2.4, inner: face + heel });
    g += part(capsule(-13, 15, 6.4, -25, -7.5, 5.7), col, { sx: 2, sy: 2, w: 2.3,
      inner: `<path d="M-15,9 L-23,-5" stroke="${seam}" stroke-width="1.2" fill="none" stroke-linecap="round"/><path d="M-30,-6 L-27,-11 M-31,0 L-28,-4" stroke="${lace}" stroke-width="1.6"/>` });
    return g + '</g>';
  };
  const ball = (x: number, y: number, r = 6.2) => `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r}" fill="#fafafa" stroke="${INK}" stroke-width="2"/><path d="M${P(x - r * 0.45, y - r * 0.8)} Q${P(x - r * 0.1, y)} ${P(x - r * 0.45, y + r * 0.8)} M${P(x + r * 0.45, y - r * 0.8)} Q${P(x + r * 0.1, y)} ${P(x + r * 0.45, y + r * 0.8)}" stroke="#d0342c" stroke-width="1.3" fill="none"/>`;
  const hand = (spec: HandDef, H: Pt, E: Pt) => {
    if (spec.grip != null) return fist(H[0], H[1], bang, glove);
    const fa = (Math.atan2(H[1] - E[1], H[0] - E[0]) * 180) / Math.PI;
    if (spec.type === 'mitt') return mitt(H, E, spec, o.mittColor);
    if (spec.type === 'ball') return fist(H[0], H[1] + 1, fa, skin) + ball(H[0] + (spec.bo?.[0] ?? 2), H[1] + (spec.bo?.[1] ?? -8));
    return fist(H[0], H[1], fa, batter ? glove : skin);
  };
  L.handL = hand(pose.L, HL, EL);
  L.handR = hand(pose.R, HR, ER);
  if (pose.ball) {
    const B = ab(pose.ball);
    L.ball = `<path d="M${P(B[0] + 9, B[1] - 8)} l14,-12 M${P(B[0] + 4, B[1] - 11)} l10,-14 M${P(B[0] + 11, B[1] - 2)} l15,-8" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".85"/>` + ball(B[0], B[1], 6.6);
  }
  // ── 배트
  if (pose.bat) {
    const dx = Tt[0] - K[0], dy2 = Tt[1] - K[1], Lb = Math.hypot(dx, dy2), nx = -dy2 / Lb, ny = dx / Lb;
    const lit = nx + ny < 0 ? 1 : -1;
    const at = (s: number, off: number) => P(K[0] + dx * s + nx * off * lit, K[1] + dy2 * s + ny * off * lit);
    const bc = o.batColor;
    let inner = `<path d="M${at(0.5, 2.2)} L${at(0.93, 4.4)}" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity="${lum(bc) > 0.5 ? 0.55 : 0.32}"/>`;
    inner += `<path d="M${at(0.6, -9)} L${at(0.6, 9)} M${at(0.64, -9)} L${at(0.64, 9)}" stroke="${shade(bc, 0.6)}" stroke-width="1.2"/>`;
    let s = part(batPath(K, Tt), bc, { sx: -nx * lit * 2.6, sy: -ny * lit * 2.6, w: 2.4, inner });
    s += part(capsule(K[0] + dx * 0.03, K[1] + dy2 * 0.03, 3.9, K[0] + dx * 0.25, K[1] + dy2 * 0.25, 4.1), '#2b2b30', { sx: 0, sy: 0, w: 1.8 });
    s += part(ell(K[0] + (dx / Lb) * 1.2, K[1] + (dy2 / Lb) * 1.2, 5.6, 5.6), bc, { sx: 1.5, sy: 1.5, w: 2.2 });
    L.bat = s;
  }

  // ── 머리
  {
    const hy = 86 + dy + (o.up ? -2 : 0);
    const hw = 44 + (b === 2 ? 3 : b === 0 ? -1 : 0) + o.faceW;
    const look = o.look;
    const fx = cx + look * 12;
    const chinY = hy + 47 + (b === 0 ? 2 : 0) + o.chin, chinX = cx + look * 6, jaw = (b === 2 ? 20 : 14) + o.jaw;
    const face = `M${P(cx - hw, hy - 22)} C${P(cx - hw - 2, hy + 10)} ${P(cx - hw + 6, hy + 32)} ${P(chinX - jaw, chinY - 6)} Q${P(chinX, chinY + 2)} ${P(chinX + jaw, chinY - 6)} C${P(cx + hw - 6, hy + 32)} ${P(cx + hw + 2, hy + 10)} ${P(cx + hw, hy - 22)} Z`;
    const hd = o.down ? 5 : o.up ? -3 : 0, H0 = hy + hd;
    const brimX = cx + look * 16;
    const brim = batter
      ? `M${P(brimX - 54, H0 - 6)} Q${P(brimX, H0 + 8)} ${P(brimX + 54, H0 - 6)} L${P(brimX + 52, H0 - 11)} Q${P(brimX, H0 - 4)} ${P(brimX - 52, H0 - 11)} Z`
      : `M${P(brimX - 60, H0 - 5)} Q${P(brimX, H0 + 11)} ${P(brimX + 60, H0 - 5)} L${P(brimX + 56, H0 - 11)} Q${P(brimX, H0 - 3)} ${P(brimX - 56, H0 - 11)} Z`;
    let s = '';
    if (!batter && o.hairStyle > 0) {
      const hl = o.hairStyle === 2 ? 30 : 22;
      s += part(`M${P(cx - hw - 5, hy - 14)} C${P(cx - hw - 9, hy + 10)} ${P(cx - hw - 6, hy + hl - 4)} ${P(cx - hw + 4, hy + hl)} L${P(cx + hw - 4, hy + hl)} C${P(cx + hw + 6, hy + hl - 4)} ${P(cx + hw + 9, hy + 10)} ${P(cx + hw + 5, hy - 14)} Z`, hair, { k: 0.7 });
    }
    const ear = (ex: number, side: number) => part(ell(ex, hy + 12, 7.5, 10.5), skin, { sx: 2, sy: 2, inner: `<path d="M${P(ex - side * 1, hy + 7)} Q${P(ex + side * 4, hy + 12)} ${P(ex - side * 1.5, hy + 17)}" stroke="${shade(skin, 0.62)}" stroke-width="1.7" fill="none"/>` });
    // 헬멧 귀 덮개는 투수 쪽(그림 왼쪽) 귀를 덮는다 — 반전 전 그림은 좌타 기준
    if (!batter) s += ear(cx - hw + 1 + Math.max(0, look) * 5, -1);
    s += ear(cx + hw - 1 + Math.min(0, look) * 5, 1);
    // 얼굴(수염 · 챙 그늘 · 볼 빛)
    const mx = fx + look * 3, my = hy + 36;
    const jawBand = `M${P(cx - hw - 4, hy + 14)} Q${P(cx - hw + 12, hy + 30)} ${P(mx - 11, my - 7)} Q${P(mx, my - 11)} ${P(mx + 11, my - 7)} Q${P(cx + hw - 12, hy + 30)} ${P(cx + hw + 4, hy + 14)} L${P(cx + hw + 4, chinY + 8)} L${P(cx - hw - 4, chinY + 8)} Z`;
    let inner = '';
    if (o.beard === 1) inner += `<path d="${jawBand}" fill="${hair}" opacity=".24"/>`;
    if (o.beard === 3) inner += `<path d="${jawBand}" fill="${hair}"/><path d="${jawBand}" fill="#fff" opacity=".06" transform="translate(-3,-3)"/>`;
    inner += `<path d="${brim}" fill="${shade(skin, 0.74)}" transform="translate(0,8)" opacity=".85"/>`;
    if (b === 2) inner += `<path d="M${P(chinX - 12, chinY - 3)} Q${P(chinX, chinY + 2)} ${P(chinX + 12, chinY - 3)}" stroke="${shade(skin, 0.7)}" stroke-width="1.6" fill="none"/>`;
    inner += `<path d="${ell(cx - hw * 0.56 + look * 7, hy + 25, 6.5, 3.6, -10)}" fill="#fff" opacity=".2"/>`;
    s += part(face, skin, { sx: 7, sy: 5, k: 0.86, inner });
    // 옆머리(구레나룻)
    if (!batter) s += `<path d="M${P(cx - hw + 1, hy - 4)} L${P(cx - hw + 1, hy + 9)} Q${P(cx - hw + 5, hy + 5)} ${P(cx - hw + 7, hy - 4)} Z" fill="${hair}"/>`;
    s += `<path d="M${P(cx + hw - 1, hy - 4)} L${P(cx + hw - 1, hy + 9)} Q${P(cx + hw - 5, hy + 5)} ${P(cx + hw - 7, hy - 4)} Z" fill="${hair}"/>`;
    // 눈 · 눈썹
    const eyeY = hy + 15 + (o.down ? 2 : 0) - (o.up ? 2 : 0);
    const gx = look * 2.2, gy = o.down ? -2.4 : o.up ? -1.6 : 0.3;
    const E = EYES[o.eyes] ?? EYES[0];
    const es = 19 + o.eyeGap;
    const eye = (ex: number, mir: number, sc: number) => {
      const k = id();
      let g = `<g transform="translate(${r1(ex)},${r1(eyeY)}) scale(${r1(mir * sc * 100) / 100},1)">`;
      g += `<path d="${E.brow}" fill="${hair}" stroke="${hair}" stroke-width="${1 + o.brow * 1.5}" stroke-linejoin="round"/>`;
      if (E.white) {
        g += `<clipPath id="${k}"><path d="${E.white}"/></clipPath><path d="${E.white}" fill="#fff"/>`;
        const ix = (E.ix ?? 0) + gx * mir, iy = (E.iy ?? 0) + gy, ir = E.ir ?? 4.5;
        g += `<g clip-path="url(#${k})"><circle cx="${r1(ix)}" cy="${r1(iy)}" r="${ir}" fill="${o.iris}"/><circle cx="${r1(ix)}" cy="${r1(iy)}" r="${r1(ir * 0.52)}" fill="#0c0806"/><circle cx="${r1(ix - 1.6 * mir)}" cy="${r1(iy - 1.7)}" r="1.5" fill="#fff"/><circle cx="${r1(ix + 1.7 * mir)}" cy="${r1(iy + 1.6)}" r="0.8" fill="#fff" opacity=".8"/></g>`;
        g += `<path d="${E.white}" fill="none" stroke="${INK}" stroke-width="1.2"/>`;
      }
      g += `<path d="${E.lid}" fill="none" stroke="${INK}" stroke-width="${E.lw}" stroke-linecap="round"/>`;
      if (E.low) g += `<path d="${E.low}" fill="none" stroke="${INK}" stroke-width="1.5" stroke-linecap="round"/>`;
      return g + '</g>';
    };
    const eL = fx - es * (1 - Math.max(0, -look) * 0.2), eR = fx + es * (1 - Math.max(0, look) * 0.2);
    s += eye(eL, 1, 1 - Math.max(0, -look) * 0.22) + eye(eR, -1, 1 - Math.max(0, look) * 0.22);
    if (o.eyeBlack) for (const ex of [eL, eR]) s += `<path d="${ell(ex, eyeY + 11.5, 7, 2.6, -4)}" fill="#161616" opacity=".9"/>`;
    // 코
    const nx0 = fx + look * 4, ny0 = hy + 27;
    const nc = shade(skin, 0.5);
    if (o.nose === 1) { // 큰 코
      s += `<path d="M${P(nx0 - 1, ny0 - 8)} Q${P(nx0 + 6, ny0 + 1)} ${P(nx0 - 0.5, ny0 + 4)}" stroke="${nc}" stroke-width="2.3" fill="none" stroke-linecap="round"/><path d="M${P(nx0 - 7, ny0 + 2.5)} Q${P(nx0 - 4.5, ny0 + 4.5)} ${P(nx0 - 2.5, ny0 + 3.5)}" stroke="${nc}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
    } else if (o.nose === 2) { // 동그란 코
      s += `<path d="${ell(nx0, ny0 + 1, 4, 3)}" fill="${shade(skin, 0.8)}"/><circle cx="${r1(nx0 - 1.2)}" cy="${r1(ny0)}" r="1.2" fill="#fff" opacity=".6"/>`;
    } else {
      s += `<path d="M${P(nx0 - 1, ny0 - 5)} Q${P(nx0 + 3.6, ny0)} ${P(nx0 - 1.6, ny0 + 3)}" stroke="${nc}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
    }
    if (o.lines) s += `<path d="M${P(mx - 10, my - 10)} Q${P(mx - 13, my - 3)} ${P(mx - 10, my + 2)} M${P(mx + 10, my - 10)} Q${P(mx + 13, my - 3)} ${P(mx + 10, my + 2)}" stroke="${shade(skin, 0.68)}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`;
    // 수염(콧수염 · 염소수염)
    if (o.beard === 2 || o.beard === 4) s += `<path d="M${P(mx - 10, my - 4)} Q${P(mx, my - 9.5)} ${P(mx + 10, my - 4)} Q${P(mx + 6, my - 2)} ${P(mx, my - 4.5)} Q${P(mx - 6, my - 2)} ${P(mx - 10, my - 4)} Z" fill="${hair}" stroke="${INK}" stroke-width="1"/>`;
    if (o.beard === 2) s += `<path d="M${P(mx - 6, my + 5)} Q${P(mx, my + 17)} ${P(mx + 6, my + 5)} Q${P(mx, my + 8)} ${P(mx - 6, my + 5)} Z" fill="${hair}" stroke="${INK}" stroke-width="1"/>`;
    if (o.beard === 3) s += `<path d="${ell(mx, my + 0.5, 8, 4.2)}" fill="${shade(skin, 0.9)}"/>`;
    // 입
    s += `<g transform="translate(${r1(mx)},${r1(my)})">${MOUTHS[o.mouth] ?? MOUTHS[0]}</g>`;
    // 헬멧 / 모자
    const cap = K0.cap;
    if (batter) {
      const dome = `M${P(cx - 57, H0 - 4)} C${P(cx - 62, H0 - 58)} ${P(cx - 30, H0 - 74)} ${P(cx, H0 - 74)} C${P(cx + 30, H0 - 74)} ${P(cx + 62, H0 - 58)} ${P(cx + 57, H0 - 4)} Q${P(cx + 40, H0 - 8)} ${P(cx, H0 - 8)} Q${P(cx - 40, H0 - 8)} ${P(cx - 57, H0 - 4)} Z`;
      const flap = `M${P(cx - 38, H0 - 10)} C${P(cx - 62, H0 - 14)} ${P(cx - 67, H0 + 16)} ${P(cx - 58, H0 + 25)} C${P(cx - 51, H0 + 32)} ${P(cx - 37, H0 + 29)} ${P(cx - 35, H0 + 16)} Z`;
      const gloss = `<path d="${ell(cx - 27, H0 - 47, 17, 8.5, -30)}" fill="#fff" opacity=".42"/><circle cx="${cx - 7}" cy="${r1(H0 - 61)}" r="3.2" fill="#fff" opacity=".55"/><path d="${ell(cx - 55, H0 + 6, 3, 7, 10)}" fill="#fff" opacity=".3"/><path d="M${P(cx - 55, H0 - 10)} Q${P(cx, H0 - 15)} ${P(cx + 55, H0 - 10)}" stroke="${shade(cap, 0.55)}" stroke-width="2" fill="none" opacity=".7"/>`;
      s += part([dome, flap], cap, { sx: 7, sy: 6, k: 0.72, inner: gloss });
    } else {
      const crown = `M${P(cx - 55, H0 - 4)} C${P(cx - 60, H0 - 54)} ${P(cx - 32, H0 - 72)} ${P(cx, H0 - 72)} C${P(cx + 32, H0 - 72)} ${P(cx + 60, H0 - 54)} ${P(cx + 55, H0 - 4)} Q${P(cx + 40, H0 - 8)} ${P(cx, H0 - 8)} Q${P(cx - 40, H0 - 8)} ${P(cx - 55, H0 - 4)} Z`;
      const seams = `<path d="M${P(cx, H0 - 71)} Q${P(cx - 20, H0 - 50)} ${P(cx - 27, H0 - 8)} M${P(cx, H0 - 71)} Q${P(cx + 20, H0 - 50)} ${P(cx + 27, H0 - 8)}" stroke="${shade(cap, 0.66)}" stroke-width="1.4" fill="none"/><path d="${ell(cx - 26, H0 - 46, 14, 7, -30)}" fill="#fff" opacity=".16"/>`;
      s += part(crown, cap, { sx: 7, sy: 6, k: 0.74, inner: seams });
      s += `<circle cx="${cx}" cy="${r1(H0 - 72)}" r="3.6" fill="${shade(cap, 0.85)}" stroke="${INK}" stroke-width="2"/>`;
    }
    s += txt(cx + look * 14, H0 - 26, 31, K0.letterColor, 2.4, K0.letter);
    s += part(brim, shade(cap, 0.86), { sx: 0, sy: 3.5, k: 0.7 });
    if (o.shades && !batter) {
      const gx0 = cx + look * 12;
      s += `<path d="M${P(gx0 - 25, H0 - 15)} Q${P(gx0, H0 - 20)} ${P(gx0 + 25, H0 - 15)}" stroke="${INK}" stroke-width="2.4" fill="none"/>`;
      for (const sx0 of [gx0 - 13, gx0 + 13]) s += `<path d="${ell(sx0, H0 - 14, 12, 6.2)}" fill="#2f3a48" stroke="${INK}" stroke-width="2.2"/><path d="M${P(sx0 - 7, H0 - 16)} L${P(sx0 - 1, H0 - 18)}" stroke="#9fd4ff" stroke-width="1.8" stroke-linecap="round" opacity=".8"/>`;
    }
    L.head = `<g transform="rotate(${r1(o.tilt)} ${cx} ${sy - 14})">${s}</g>`;
  }

  let body = pose.order.map((k) => L[k] || '').join('');
  if (o.mirror) body = `<g transform="translate(240,0) scale(-1,1)">${body}</g>`; // 좌타 · 좌투
  const shadow = o.shadow ? `<ellipse cx="${cx}" cy="270" rx="58" ry="7.5" fill="#000" opacity=".28"/>` : '';
  return `${shadow}${body}`;
}

/** 세로 줄무늬(핀스트라이프) — 부모 clip 안에서만 보인다 */
function pinstripes(x: number, y: number, w: number, h: number, col: string) {
  let d = '';
  for (let xx = x; xx <= x + w; xx += 7) d += `M${r1(xx)},${r1(y)} L${r1(xx)},${r1(y + h)} `;
  return `<path d="${d}" stroke="${col}" stroke-width="1" fill="none"/>`;
}
