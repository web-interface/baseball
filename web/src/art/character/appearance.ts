// 외모 생성 — 선수 id(시드) → 얼굴·피부·머리·수염·안경·표정.
// 항목마다 rng.fork() 로 독립 수열을 쓰므로, 나중에 항목을 추가해도 기존 선수 얼굴이 바뀌지 않는다.

import type {
  Appearance, Expression, Eyewear, Face, FaceShape, FacialHair, FacialHairSpec, HairSpec, HairStyle,
  LidType, Origin, PlayerSpec, SkinTone,
} from './types';
import { Rng } from './rng';
import { lch, toLch, mix } from './color';
import { clamp } from './geom';
import { makeBuild } from './build';

type W<T> = ReadonlyArray<readonly [T, number]>;

const EAST_ASIA = (o: Origin) => o === 'KR' || o === 'JP' || o === 'TW';

// ── 피부 ──
function skinBase(r: Rng, o: Origin): [number, number, number] {
  switch (o) {
    case 'US': case 'AU':
      return [r.around(0.815, 0.03, 0.73, 0.875), r.around(0.066, 0.009, 0.048, 0.085), r.around(47, 5, 36, 58)];
    case 'USB':
      return [r.around(0.5, 0.065, 0.36, 0.62), r.around(0.068, 0.01, 0.05, 0.09), r.around(52, 5, 42, 62)];
    case 'LATAM':
      return [r.around(0.655, 0.075, 0.46, 0.79), r.around(0.074, 0.01, 0.055, 0.092), r.around(56, 5, 46, 66)];
    default: // 동아시아 — 야외 운동선수라 살짝 그을린 쪽
      return [r.around(0.775, 0.045, 0.66, 0.865), r.around(0.064, 0.009, 0.046, 0.082), r.around(61, 5, 50, 72)];
  }
}

export function skinTone(L: number, C: number, H: number): SkinTone {
  const dark = clamp((0.72 - L) / 0.3, 0, 1); // 어두운 피부는 그림자 단계를 조금 좁히고 채도를 살린다
  return {
    base: lch(L, C, H),
    shade: lch(L - 0.072 + dark * 0.012, C + 0.012, H - 8),
    deep: lch(L - 0.165 + dark * 0.03, C + 0.016, H - 13),
    light: lch(L + 0.045 - dark * 0.005, C - 0.008, H + 5),
    rim: lch(Math.min(0.95, L + 0.085), C * 0.62, H + 18),
    lip: lch(L - 0.075 + dark * 0.02, C + 0.032, H - 20),
    line: lch(L * 0.42, C * 0.9 + 0.012, H - 14),
    blush: lch(L - 0.03, C + 0.035, H - 24),
  };
}

// ── 머리색 ──
interface HairCol { c: string; w: number }
const HAIR_NATURAL_EA: HairCol[] = [{ c: '#1b1a1e', w: 5 }, { c: '#231d1b', w: 3 }, { c: '#30251f', w: 1.4 }];
const HAIR_DYED_EA: HairCol[] = [
  { c: '#5b3e2c', w: 3 }, { c: '#6f655e', w: 2 }, { c: '#c9ab80', w: 1.2 }, { c: '#9d9ca2', w: 1 },
  { c: '#4a2427', w: 1 }, { c: '#a87d4c', w: 1 },
];
const HAIR_US: HairCol[] = [{ c: '#b8915a', w: 2 }, { c: '#7a5a3c', w: 3 }, { c: '#4a3324', w: 3 }, { c: '#2a201b', w: 2 }, { c: '#8a4426', w: 0.8 }];
const HAIR_DARK: HairCol[] = [{ c: '#17161a', w: 5 }, { c: '#221a16', w: 2 }];

function hairPalette(base: string) {
  const [L, C, H] = toLch(base);
  const darkHair = L < 0.32;
  return {
    color: base,
    shade: lch(Math.max(0.08, L - (darkHair ? 0.05 : 0.11)), C * 1.05, H - 4),
    // 검은 머리 윤기는 푸른 쪽, 밝은 머리는 노란 쪽
    light: darkHair ? lch(L + 0.14, Math.max(0.012, C * 0.6), 250) : lch(Math.min(0.94, L + 0.12), C * 0.9, H + 6),
  };
}

const pickCol = (r: Rng, list: HairCol[]) => r.weighted(list.map((h) => [h.c, h.w] as const));

const STYLE_W: Record<Origin, W<HairStyle>> = {
  KR: [['crew', 26], ['twoblock', 24], ['buzz', 12], ['textured', 10], ['perm', 10], ['flow', 8], ['tied', 6]],
  JP: [['crew', 30], ['twoblock', 20], ['buzz', 16], ['textured', 15], ['perm', 8], ['flow', 7], ['tied', 4]],
  TW: [['crew', 30], ['twoblock', 22], ['buzz', 16], ['textured', 14], ['perm', 8], ['flow', 6], ['tied', 4]],
  US: [['crew', 28], ['buzz', 14], ['flow', 22], ['textured', 14], ['tied', 9], ['curls', 6], ['perm', 3]],
  AU: [['crew', 28], ['buzz', 14], ['flow', 22], ['textured', 14], ['tied', 9], ['curls', 6], ['perm', 3]],
  USB: [['buzz', 30], ['crew', 14], ['curls', 26], ['locs', 22], ['tied', 4]],
  LATAM: [['crew', 24], ['buzz', 20], ['curls', 20], ['flow', 10], ['locs', 10], ['twoblock', 10], ['tied', 6]],
};

const FH_W: Record<Origin, W<FacialHair>> = {
  KR: [['none', 42], ['stubble', 20], ['goatee', 9], ['mustache', 6], ['beard', 7], ['chin', 5], ['sideburns', 8], ['chinstrap', 3]],
  JP: [['none', 48], ['stubble', 18], ['goatee', 9], ['mustache', 6], ['beard', 6], ['chin', 6], ['sideburns', 5], ['chinstrap', 2]],
  TW: [['none', 50], ['stubble', 18], ['goatee', 8], ['mustache', 6], ['beard', 5], ['chin', 6], ['sideburns', 5], ['chinstrap', 2]],
  US: [['none', 18], ['stubble', 20], ['beard', 26], ['full', 14], ['goatee', 10], ['mustache', 6], ['chinstrap', 6]],
  AU: [['none', 18], ['stubble', 20], ['beard', 26], ['full', 14], ['goatee', 10], ['mustache', 6], ['chinstrap', 6]],
  USB: [['none', 18], ['stubble', 14], ['beard', 26], ['full', 10], ['goatee', 16], ['chinstrap', 10], ['mustache', 6]],
  LATAM: [['none', 18], ['stubble', 14], ['beard', 20], ['goatee', 20], ['chinstrap', 12], ['mustache', 10], ['full', 6]],
};

const SHAPE_W: Record<Origin, W<FaceShape>> = {
  KR: [['round', 24], ['square', 30], ['long', 16], ['oval', 30]],
  JP: [['round', 22], ['square', 26], ['long', 22], ['oval', 30]],
  TW: [['round', 26], ['square', 28], ['long', 16], ['oval', 30]],
  US: [['round', 14], ['square', 36], ['long', 26], ['oval', 24]],
  AU: [['round', 14], ['square', 36], ['long', 26], ['oval', 24]],
  USB: [['round', 18], ['square', 34], ['long', 22], ['oval', 26]],
  LATAM: [['round', 22], ['square', 32], ['long', 20], ['oval', 26]],
};

const SHAPE_BASE: Record<FaceShape, Partial<Face>> = {
  round: { faceL: 0.93, cheekW: 1.06, cheekFull: 0.75, jawW: 1.06, jawSharp: 0.2, chinW: 1.1, chinL: 0.9, chinProj: -0.2, headW: 1.05 },
  square: { faceL: 1.0, cheekW: 1.02, cheekFull: 0.12, jawW: 1.17, jawSharp: 0.95, chinW: 1.28, chinL: 1.0, chinProj: 0.25, headW: 1.01 },
  long: { faceL: 1.1, cheekW: 0.95, cheekFull: 0.06, jawW: 0.96, jawSharp: 0.5, chinW: 0.95, chinL: 1.16, chinProj: 0.2, headW: 0.95 },
  oval: { faceL: 1.03, cheekW: 0.99, cheekFull: 0.2, jawW: 0.87, jawSharp: 0.25, chinW: 0.8, chinL: 1.04, chinProj: 0.05, headW: 0.99 },
};

function makeFace(r: Rng, o: Origin, fat: number, age: number): Face {
  const ea = EAST_ASIA(o);
  const shape = r.weighted(SHAPE_W[o]);
  const b = SHAPE_BASE[shape];
  const n = (sd: number) => r.gauss(0, sd);
  const lid: LidType = ea ? r.weighted([['mono', 34], ['inner', 36], ['double', 30]] as const) : r.weighted([['double', 88], ['inner', 12]] as const);
  const iris = ea
    ? r.pick(['#2a1a12', '#311f15', '#3a2518', '#24170f'])
    : o === 'US' || o === 'AU'
      ? r.weighted([['#4f6b86', 3], ['#5a6a4c', 2], ['#6b5232', 2], ['#3d2718', 3], ['#6d7f8c', 1]] as const)
      : r.weighted([['#2a1a12', 4], ['#3d2718', 3], ['#5a4026', 1]] as const);
  const thick = clamp(0.62 + n(0.22) + (ea ? 0.05 : 0.08), 0.3, 1.15);
  return {
    shape,
    headW: (b.headW ?? 1) * clamp(1 + n(0.04) + (ea ? 0.015 : -0.01), 0.9, 1.1),
    headD: clamp(1 + n(0.03) + (ea ? -0.035 : 0.02), 0.9, 1.08),
    foreheadH: clamp(1 + n(0.05), 0.88, 1.12),
    faceL: (b.faceL ?? 1) * clamp(1 + n(0.045), 0.9, 1.1),
    flat: clamp((ea ? 0.6 : o === 'US' || o === 'AU' ? 0.18 : 0.34) + n(0.14), 0, 1),
    cheekW: (b.cheekW ?? 1) * clamp(1 + n(0.045) + (ea ? 0.03 : 0), 0.9, 1.13),
    cheekProm: clamp((ea ? 0.25 : 0) + n(0.3), -0.8, 1),
    cheekFull: clamp((b.cheekFull ?? 0.2) + fat * 0.55 + n(0.12), 0, 1),
    jawW: (b.jawW ?? 1) * clamp(1 + n(0.06) + fat * 0.07, 0.82, 1.24),
    jawSharp: clamp((b.jawSharp ?? 0.5) - fat * 0.35 + n(0.12), 0, 1),
    chinW: (b.chinW ?? 1) * clamp(1 + n(0.09), 0.76, 1.3),
    chinL: (b.chinL ?? 1) * clamp(1 + n(0.05), 0.88, 1.15),
    chinProj: clamp((b.chinProj ?? 0) + n(0.28) + (ea ? -0.1 : 0.05), -0.9, 0.9),
    chinCleft: !ea && r.chance(0.18) ? r.range(0.4, 1) : 0,
    browRidge: clamp((ea ? -0.35 : o === 'US' || o === 'AU' ? 0.45 : 0.15) + n(0.28), -1, 1),
    eyeW: clamp(1 + n(0.08), 0.84, 1.18),
    eyeH: clamp((ea ? 0.86 : 1) + n(0.1) - (lid === 'mono' ? 0.1 : lid === 'double' ? -0.04 : 0), 0.6, 1.25),
    eyeGap: clamp(1 + n(0.04) + (ea ? 0.03 : 0), 0.92, 1.1),
    eyeTilt: clamp((ea ? 0.18 : 0.02) + n(0.16), -0.35, 0.5),
    eyeY: n(0.18),
    lid,
    lidHeavy: clamp(0.4 + n(0.2) + (lid === 'mono' ? 0.15 : 0), 0, 1),
    bags: clamp((age - 27) * 0.04 + n(0.15), 0, 1),
    iris,
    browThick: thick,
    browAngle: clamp(n(0.35), -0.8, 0.9),
    browArch: clamp(0.35 + n(0.25), 0, 1),
    browLen: clamp(1 + n(0.07), 0.82, 1.15),
    browGap: clamp(1 + n(0.1), 0.75, 1.3),
    browY: n(0.2),
    browShape: r.next(),
    noseL: clamp(1 + n(0.08), 0.84, 1.18),
    noseW: clamp((o === 'USB' ? 1.22 : o === 'LATAM' ? 1.08 : ea ? 1.04 : 0.95) + n(0.1), 0.8, 1.42),
    noseProj: clamp((ea ? -0.18 : o === 'US' || o === 'AU' ? 0.25 : 0.05) + n(0.22), -0.7, 0.8),
    noseBridge: clamp((ea ? -0.1 : 0.15) + n(0.35), -0.9, 1),
    noseRoot: clamp((ea ? -0.4 : o === 'US' || o === 'AU' ? 0.35 : 0) + n(0.22), -1, 1),
    noseTip: clamp(n(0.3), -0.8, 0.8),
    noseBulb: clamp(0.4 + n(0.22) + (ea ? 0.08 : 0), 0, 1),
    noseCrook: r.chance(0.12) ? r.range(-1, 1) : 0,
    mouthW: clamp(1 + n(0.09), 0.82, 1.2),
    lipU: clamp((o === 'USB' ? 1.3 : o === 'LATAM' ? 1.1 : 0.95) + n(0.12), 0.65, 1.6),
    lipL: clamp((o === 'USB' ? 1.35 : o === 'LATAM' ? 1.12 : 1.0) + n(0.12), 0.7, 1.65),
    mouthY: n(0.12),
    earSize: clamp(1 + n(0.08), 0.84, 1.2),
    earOut: clamp(0.3 + n(0.3), 0, 1),
    nasolabial: clamp((age - 25) * 0.05 + fat * 0.2 + n(0.15), 0, 1),
    foreheadLines: clamp((age - 31) * 0.08 + n(0.12), 0, 1),
    mole: r.chance(0.2) ? { x: r.range(-1, 1), y: r.range(0, 1) } : null,
    browSlit: r.chance(0.07) ? (r.chance(0.5) ? -1 : 1) : 0,
    freckles: (o === 'US' || o === 'AU') && r.chance(0.22) ? r.range(0.3, 1) : 0,
    ruddy: r.chance(0.3) ? r.range(0.4, 1) : 0,
  };
}

function makeHair(r: Rng, o: Origin, age: number, pos: string): HairSpec {
  const ea = EAST_ASIA(o);
  let style = r.weighted(STYLE_W[o]);
  if (pos === 'C' && style === 'flow' && r.chance(0.5)) style = 'crew';
  const dyed = ea && r.chance(style === 'perm' || style === 'textured' || style === 'twoblock' ? 0.24 : 0.12);
  const base = ea ? (dyed ? pickCol(r, HAIR_DYED_EA) : pickCol(r, HAIR_NATURAL_EA)) : o === 'US' || o === 'AU' ? pickCol(r, HAIR_US) : pickCol(r, HAIR_DARK);
  // 서른 중반부터 관자놀이·뒷머리에 흰머리가 섞임
  const gray = age >= 33 ? Math.min(0.45, (age - 32) * 0.11) : 0;
  const pal = hairPalette(gray ? mix(base, '#a3a2a4', gray) : base);
  return {
    style,
    ...pal,
    hairline: clamp((age - 27) * 0.035 + r.gauss(0.05, 0.14), 0, 1),
    volume: clamp(1 + r.gauss(0, 0.15), 0.7, 1.35),
    length: clamp(1 + r.gauss(0, 0.18), 0.6, 1.5),
    sideburn: r.around(style === 'buzz' ? -1.2 : -0.6, 0.9, -2.5, 1.6),
    fade: style === 'twoblock' ? r.range(0.65, 1) : style === 'buzz' ? r.range(0.3, 0.8) : style === 'crew' ? r.range(0.2, 0.6) : r.range(0, 0.25),
    part: r.pick([-1, 0, 1] as const),
  };
}

function makeFacialHair(r: Rng, o: Origin, age: number, hairColor: string, skinL: number): FacialHairSpec {
  const w = FH_W[o].map(([k, v]) => [k, k === 'none' ? v * clamp(1.3 - (age - 24) * 0.04, 0.4, 1.4) : v] as const);
  const kind = r.weighted(w);
  const [L, C, H] = toLch(hairColor);
  // 수염은 머리보다 아주 조금 따뜻하고 탁하게. 탈색 머리여도 수염은 원래 색에 가깝게.
  const color = L > 0.45 && EAST_ASIA(o) ? '#2a221e' : lch(Math.min(L + 0.02, 0.7), C * 0.9, H + 6);
  return {
    kind,
    color: skinL < 0.5 ? mix(color, '#0d0b0b', 0.3) : color,
    density: clamp(0.65 + r.gauss(0, 0.18) + (EAST_ASIA(o) ? -0.1 : 0.05), 0.25, 1),
    length: kind === 'full' ? r.range(1.2, 2.6) : kind === 'beard' ? r.range(0.45, 1.0) : kind === 'goatee' || kind === 'chin' ? r.range(0.4, 1.4) : r.range(0.2, 0.5),
  };
}

function makeEyewear(r: Rng, pos: string): Eyewear {
  const of = pos === 'LF' || pos === 'CF' || pos === 'RF';
  const inf = pos === '2B' || pos === 'SS' || pos === '3B' || pos === '1B';
  if (pos === 'C') return r.chance(0.04) ? 'glasses' : 'none';
  return r.weighted([
    ['none', of ? 52 : inf ? 78 : 86],
    ['shadesUp', of ? 30 : inf ? 11 : 2],
    ['shades', of ? 12 : inf ? 6 : 7],
    ['glasses', 4],
  ] as const);
}

export function makeAppearance(spec: PlayerSpec): Appearance {
  const root = new Rng(spec.id);
  const origin: Origin = spec.origin ?? 'KR';
  const age = spec.age ?? 27;
  const build = makeBuild(spec);
  const [L, C, H] = skinBase(root.fork('skin'), origin);
  const skin = skinTone(L, C, H);
  const face = makeFace(root.fork('face'), origin, build.fat, age);
  const hair = makeHair(root.fork('hair'), origin, age, spec.pos);
  const facialHair = makeFacialHair(root.fork('beard'), origin, age, hair.color, L);
  const er = root.fork('eyewear');
  const eyewear = makeEyewear(er, spec.pos);
  const exprW: W<Expression> = spec.pos === 'P'
    ? [['neutral', 40], ['determined', 45], ['smile', 15]]
    : [['neutral', 44], ['determined', 30], ['smile', 26]];
  return {
    id: spec.id,
    origin,
    skinL: clamp((0.87 - L) / 0.5, 0, 1),
    skin,
    face,
    hair,
    facialHair,
    eyewear,
    shadesTint: er.pick(['#2b3440', '#3b2f2a', '#26323a', '#5a3b2a', '#304a5a']),
    expression: root.fork('expr').weighted(exprW),
    build,
    throws: spec.throws,
    bats: spec.bats,
    pos: spec.pos,
    age,
  };
}
