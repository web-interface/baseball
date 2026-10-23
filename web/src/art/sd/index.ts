// 선수 → SD 그림. 외모는 외모 시드(p.look)로 고정(같은 선수는 늘 같은 얼굴), 자세는 포지션 · 투타로 고른다.
//   sdSvg(player, team, 'portrait' | 'full' | 'mini', 'home' | 'away')
import type { Origin, Player, Team } from '../../game/types';
import { drawSd, lum, sdPoints, type SdKit, type SdOpts, type SdPose } from './draw';

export { drawSd, sdPoints, POSES, type SdKit, type SdOpts, type SdPoints, type SdPose } from './draw';

export type SdVariant = 'portrait' | 'full' | 'mini';
/** 화면이 바라는 자세 — 없으면 포지션으로 고른다 */
export type SdPoseKind = 'idle' | 'batting' | 'pitching' | 'fielding' | 'celebrate';

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed: string) {
  let a = hash(seed) || 7;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 출신별 피부 · 머리색 (draw.ts SKIN/HAIR 번호)
const SKIN_BY: Record<Origin, number[]> = { KR: [0, 1, 1, 2], JP: [0, 1, 1], TW: [0, 1, 2], US: [0, 1, 2, 3], USB: [3, 4, 4], LATAM: [2, 3, 3, 4], AU: [0, 1, 2] };
const HAIR_BY: Record<Origin, number[]> = { KR: [0, 0, 1], JP: [0, 1], TW: [0, 1], US: [0, 1, 2, 3], USB: [0], LATAM: [0, 0, 1], AU: [1, 2, 3] };
const IRIS_LIGHT = ['#3b5f8a', '#4f6b3a', '#5a4632'];
const BAT = ['#E8C28A', '#E8C28A', '#E8C28A', '#3a2a22', '#3a2a22', '#8a3d22'];
const MITT = ['#9B5A2B', '#C8843E', '#2E2E33', '#7E3A1E', '#D08A3A'];

const faceOf = (p: Player, code: string) => p.face.find((f) => f.code === code)?.v ?? 0;

/** 포지션 · 능력으로 자세 고르기 (같은 선수는 늘 같은 자세) */
function poseOf(p: Player, r: () => number, kind?: SdPoseKind): SdPose {
  const pitcher = p.pos === 'P';
  if (kind === 'pitching') return 'cock';
  if (kind === 'batting') return 'stance';
  if (kind === 'fielding') return p.pos === 'LF' || p.pos === 'CF' || p.pos === 'RF' ? 'fly' : 'ready';
  if (kind === 'celebrate') return pitcher ? 'cock' : 'fist';
  if (kind === 'idle') return pitcher ? 'set' : 'shoulder';
  if (pitcher) return (['set', 'cock', 'windup'] as const)[Math.floor(r() * 3)];
  const list: SdPose[] = ['shoulder', 'stance', 'lean', 'neck', 'stance', 'shoulder'];
  if (faceOf(p, 'POW') >= 75) list.push('fist', 'fist');
  if (faceOf(p, 'SPD') >= 75) list.push('bunt');
  if (faceOf(p, 'DEF') >= 75 && p.pos !== 'DH' && p.pos !== 'C' && p.pos !== '1B') list.push(p.pos === 'LF' || p.pos === 'CF' || p.pos === 'RF' ? 'fly' : 'ready');
  return list[Math.floor(r() * list.length)];
}

/** 구단색 → 유니폼 (홈 흰색 · 원정은 구단 설정대로 주색/회색) */
export function kitOf(p: Player, t: Team, set: 'home' | 'away'): SdKit {
  const { primary: pr, secondary: se, accent: ac } = t.colors;
  let uni = '#F5F5F2', pants = '#F1F1EE';
  if (set === 'away') {
    if (t.uniform?.awayBase === 'primary') { uni = pr; pants = '#CDD1D6'; }
    else { uni = '#BFC5CC'; pants = '#BFC5CC'; }
  }
  // 띠(속셔츠 · 줄 · 등번호)는 상의와 잘 구분되는 구단색 — 없으면 검정/흰색
  const lu = lum(uni);
  const acc = [pr, se, ac].find((c) => Math.abs(lum(c) - lu) > 0.32) ?? (lu > 0.5 ? '#1d1d22' : '#ffffff');
  const letterColor = lum(pr) > 0.62 ? ([se, ac].find((c) => lum(c) < 0.42) ?? '#1d1d22') : '#ffffff';
  return { cap: pr, uni, pants, acc, letter: t.cap, letterColor, num: String(p.number), pin: !!t.uniform?.pinstripe };
}

// 특별 선수처럼 외모를 직접 고른 경우 시드 끝에 '~머리~수염' 이 붙는다 (club-select findLook)
const BEARD_OF: Record<string, number> = { none: 0, stubble: 1, goatee: 2, beard: 3, mustache: 4 };
const HAIR_OF: Record<string, 0 | 1 | 2> = { crew: 0, buzz: 0, twoblock: 0, perm: 1, flow: 2, tied: 2 };

export function sdOptsOf(p: Player, t: Team, set: 'home' | 'away', kind?: SdPoseKind): SdOpts {
  const [seed, hairHint, beardHint] = (p.look || p.id).split('~');
  const r = rng(seed);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length) % xs.length];
  const chance = (x: number) => r() < x;
  const bmi = p.weightKg / (p.heightCm / 100) ** 2;
  const build: 0 | 1 | 2 = bmi >= 27.6 ? 2 : bmi < 23.4 ? 0 : 1;
  const western = p.origin === 'US' || p.origin === 'AU' || p.origin === 'LATAM' || p.origin === 'USB';
  const skin = pick(SKIN_BY[p.origin] ?? SKIN_BY.KR);
  const hair = pick(HAIR_BY[p.origin] ?? HAIR_BY.KR);
  const eyes = pick([0, 0, 1, 2, 3, 4, 4]);
  const mouth = pick([0, 0, 1, 1, 4, 5]);
  const nose = western ? pick([0, 1, 1, 2]) : pick([0, 0, 2, 1]);
  const beardP = (p.age >= 30 ? 0.55 : 0.32) + (western ? 0.2 : 0);
  const beard = chance(beardP) ? pick([1, 1, 2, 3, 4]) : 0;
  const look = Math.round((r() * 1.2 - 0.6) * 10) / 10;
  const tiltV = Math.round((r() * 10 - 5) * 10) / 10;
  const head = r();
  const pose = poseOf(p, r, kind);
  const pitcherPose = pose === 'set' || pose === 'cock' || pose === 'windup' || pose === 'ready' || pose === 'fly';
  // 반전 전 그림은 좌타 · 우투 — 우타는 반전, 스위치는 반반, 좌투(투수 · 수비 자세)는 반전
  const mirror = pitcherPose ? p.throws === 'L' : p.bats === 'R' || (p.bats === 'S' && r() < 0.5);
  const team = kitOf(p, t, set);
  const glovePool = ['#F4F4F2', '#F4F4F2', '#1b1b1f', t.colors.primary, '#9aa3ad'];
  let gloveColor = pick(glovePool);
  if (gloveColor === team.acc) gloveColor = '#F4F4F2';
  const hairStyle = pick([0, 1, 1, 2] as const);
  return {
    id: `${p.id}-${t.id}-${set}-${pose}`,
    pose, kit: team, mirror, build, skin, hair,
    hairStyle: hairHint && hairHint in HAIR_OF ? HAIR_OF[hairHint] : hairStyle,
    iris: western && skin <= 1 && chance(0.4) ? pick(IRIS_LIGHT) : '#3a2418',
    eyes, mouth: pose === 'fist' ? 3 : pose === 'cock' && chance(0.4) ? 2 : mouth, nose,
    beard: beardHint && beardHint in BEARD_OF ? BEARD_OF[beardHint] : beard,
    brow: Math.round(r() * 10) / 10,
    faceW: Math.round(r() * 5 - 2), jaw: Math.round(r() * 6 - 1), chin: Math.round(r() * 4 - 1), eyeGap: Math.round(r() * 2 - 1),
    lines: p.age >= 33 && chance(0.6),
    look: pose === 'stance' ? Math.min(look, 0.2) - 0.2 : look,
    down: head < 0.22, up: head > 0.9 || pose === 'fist' || pose === 'fly', tilt: tiltV,
    eyeBlack: !pitcherPose && chance(0.18),
    shades: (pose === 'ready' || pose === 'fly') && chance(0.35),
    band: chance(0.3), bandColor: chance(0.5) ? '#F4F4F2' : team.acc,
    gloveColor, batColor: pick(BAT), mittColor: pick(MITT),
  };
}

// 보이는 범위 — 초상(머리~허벅지) · 전신 · 얼굴
const VIEW: Record<SdVariant, string> = { portrait: '6 0 228 236', full: '0 0 240 280', mini: '52 6 136 136' };

/** 선수 SVG 문자열 */
export function sdSvg(p: Player, t: Team, variant: SdVariant, set: 'home' | 'away', opts: { kind?: SdPoseKind; background?: 'none' | 'team' } = {}) {
  const o = sdOptsOf(p, t, set, opts.kind);
  if (variant === 'mini') o.shadow = false;
  const body = drawSd(o);
  let bg = '';
  if (opts.background === 'team') {
    const [x, y, w, h] = VIEW[variant].split(' ').map(Number);
    bg = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${t.colors.primary}"/><text x="${x + w / 2}" y="${y + h * 0.72}" font-family="'Arial Black',Arial,sans-serif" font-weight="900" font-size="${h * 0.62}" text-anchor="middle" fill="#fff" opacity=".14">${p.number}</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW[variant]}" preserveAspectRatio="xMidYMax meet">${bg}${body}</svg>`;
}

type Pt01 = [number, number];
/** 전신 그림(full) 위 몸 위치 — 그림 상자 기준 0~1. 장비 화면이 장비 칸에서 몸까지 선을 잇는다 */
export function sdFigurePins(p: Player, t: Team) {
  const q = sdPoints(sdOptsOf(p, t, 'home'));
  const n = (v: [number, number]): Pt01 => [v[0] / 240, v[1] / 280];
  return {
    aspect: 240 / 280,
    head: n(q.head), chest: n(q.chest), hip: n(q.hip), elbow: n(q.elbow), wrist: n(q.wrist), hand: n(q.hand),
    grip: q.grip ? n(q.grip) : null, glove: q.glove ? n(q.glove) : null, foot: n(q.foot),
  };
}
