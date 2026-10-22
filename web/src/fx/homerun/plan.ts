// 연출 계획 — 홈런 정보 → 폭죽 프로그램 · 큰 글자 · 화면 효과 · 길이.
// 같은 정보면 같은 계획(시드 고정), 정보가 하나라도 다르면 시드가 달라 모양·색·자리·박자가 바뀐다.
//
// 3막 구성
//   1막 여는 불꽃 — 장외(공이 구장 밖으로 나가는 혜성) · 선두타자(축포) · 대타(십자 분열) · 역전(상대 쪽 은빛이 꺼짐)
//   2막 본 불꽃   — 주자 수만큼 · 배치는 종류마다(쓸기 · 쌍둥이 · 계단 · 엇갈림 · 메아리 · 한 점씩)
//   3막 마무리    — 세기(tier)마다: 버드나무 · 토성 · 금빛 왕관 + 마인 · 끝내기는 분수 + 버드나무 천막 + 축포
import type { HomerunInfo, HrDir, HrLength, HrTheme } from './types';
import { Rand, hashStr } from './rng';

export type ShellType =
  | 'peony' | 'chrys' | 'willow' | 'palm' | 'ring' | 'double-ring' | 'saturn' | 'crossette'
  | 'kamuro' | 'strobe' | 'pistil' | 'salute' | 'mine' | 'gerb' | 'tracer';

/** 미리보기 · 설명용 이름 */
export const SHELL_KO: Record<ShellType, string> = {
  peony: '모란', chrys: '국화', willow: '버드나무', palm: '야자', ring: '링', 'double-ring': '이중 링', saturn: '토성',
  crossette: '십자 분열', kamuro: '금빛 왕관', strobe: '점멸', pistil: '꽃술', salute: '축포', mine: '마인', gerb: '분수', tracer: '장외 혜성',
};

/** 팔레트 번호 */
export const C_TEAM = 0, C_TEAM2 = 1, C_GOLD = 2, C_SILVER = 3, C_WHITE = 4, C_AMBER = 5;

export interface Shell {
  type: ShellType;
  /** 터지는 시각 ms (gerb·mine 은 뿜기 시작, tracer 는 출발) */
  t: number;
  /** 꼬리가 올라가는 시간 ms (0 = 꼬리 없이 바로) */
  rise: number;
  /** 터지는 곳 (0..1, 연출 판 기준. y 는 위 0) */
  x: number;
  y: number;
  /** 쏘는 곳 x (바닥) */
  x0: number;
  /** 반지름 — 판의 짧은 변 비율 */
  r: number;
  /** 색 (팔레트 번호) · c2 = 속·고리 색 */
  c: number;
  c2?: number;
  /** 수명 중간에 바뀌는 색 (모란 · 국화 · 꽃술 · 토성 속) */
  c3?: number;
  /** 별 수 */
  n: number;
  /** 고리 납작함 (0 납작 ~ 1 정원) · 돌림(rad) */
  tilt: number;
  roll: number;
  /** 별 수명 ms */
  life: number;
  /** gerb: 뿜는 시간 ms */
  span?: number;
  /** 대표 불꽃 — 짧은 판은 이것만 쓴다 */
  sig?: boolean;
  /** 별마다 다른 값의 씨 */
  seed: number;
}

export type TitleLook = 'wipe' | 'slam' | 'letters' | 'band' | 'flip' | 'meet' | 'rise' | 'count' | 'echo' | 'ticker' | 'card' | 'mark';

export type MainKind =
  | 'walkoff' | 'slam' | 'reverse' | 'tie' | 'go-ahead' | 'oop' | 'b2b' | 'milestone' | 'pinch' | 'leadoff' | 'solo' | 'two' | 'three';

export interface FxPlan {
  seed: number;
  /** 세기 1~5 */
  tier: number;
  main: MainKind;
  /** 같은 종류 안의 변형 번호 */
  variant: number;
  title: string;
  /** 큰 글자를 둘로 나눌 때 (역전 · 동점 · 대타 …) — [앞, 뒤] */
  split?: [string, string];
  look: TitleLook;
  kicker: string;
  sub: string;
  /** 큰 숫자 (장외 거리 · 시즌 n호 · 타점) */
  stat?: { label: string; value: number; unit: string };
  /** 백투백 겹 수 */
  echo?: number;
  palette: string[];
  shells: Shell[];
  /** 번쩍 — a: 세기 0..1 */
  flashes: { t: number; a: number; warm: boolean }[];
  /** 흔들림 — amp: px */
  shakes: { t: number; amp: number }[];
  /** 폭죽 판 길이 ms (세리머니 제외) */
  dur: number;
  textIn: number;
  textOut: number;
  letterbox: boolean;
  ceremony: boolean;
  /** 물리 배속 (짧은 판은 빠르게 퍼진다) */
  speed: number;
  theme: HrTheme;
  length: HrLength;
  /** 화면 읽기 프로그램용 한 줄 */
  speech: string;
}

/** 만루 세리머니 길이 · 폭죽 끝과 겹치는 시간 (ms) */
export const CEREMONY_MS = 3300;
export const CEREMONY_OVERLAP = 320;
/** 움직임 줄이기일 때 길이 (ms) */
export const REDUCED_MS = { short: 900, long: 1600 } as const;

/* ───────── 작은 도구 ───────── */
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const RUN_WORD = ['솔로', '투런', '스리런', '그랜드슬램'] as const;

export function dirOf(info: Pick<HomerunInfo, 'angle' | 'dir'>): HrDir {
  if (info.angle != null) return info.angle < -15 ? 'left' : info.angle > 15 ? 'right' : 'center';
  return info.dir ?? 'center';
}
export function dirKo(info: Pick<HomerunInfo, 'angle' | 'dir'>): string {
  const a = info.angle;
  if (a != null) return a < -27 ? '좌월' : a < -9 ? '좌중월' : a <= 9 ? '중월' : a <= 27 ? '우중월' : '우월';
  return { left: '좌월', center: '중월', right: '우월' }[dirOf(info)];
}
/** 판 위 가로 중심 (공이 넘어간 쪽 하늘) */
function sideX(info: HomerunInfo): number {
  if (info.angle != null) return 0.5 + clamp(info.angle / 45, -1, 1) * 0.2;
  return { left: 0.31, center: 0.5, right: 0.69 }[dirOf(info)];
}

/** 이 홈런으로 점수 흐름이 어떻게 바뀌었나 — 타격 팀·수비 팀 점수(홈런 전)와 홈런 점수 */
export function leadOf(batBefore: number, fieldBefore: number, runs: number): HomerunInfo['lead'] {
  const a = batBefore + runs;
  if (batBefore < fieldBefore && a > fieldBefore) return 'reverse';
  if (batBefore < fieldBefore && a === fieldBefore) return 'tie';
  if (batBefore === fieldBefore && a > fieldBefore) return 'go-ahead';
  return null;
}
/** 엔진 hit.angle(−45~45) → 좌·중·우 */
export const dirFromAngle = (angle: number): HrDir => dirOf({ angle });

/* ───────── 색 ───────── */
function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (!Number.isFinite(n)) return [200, 200, 200];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h, s, l];
}
function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}
const hsl = (hex: string) => rgbToHsl(hexToRgb(hex));
const relLum = (hex: string) => {
  const c = hexToRgb(hex).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
/** 불꽃으로 보일 만큼 채도가 있는 색인가 */
const chromatic = (hex?: string) => { if (!hex || !hex.startsWith('#')) return false; const [, s, l] = hsl(hex); return s >= 0.25 && l >= 0.1 && l <= 0.9; };
/** 구단색 → 밤하늘에서 보이는 불꽃 색 (어두운 남색·와인도 밝힌다) */
export function fireColor(hex: string): string {
  const [h, s, l] = hsl(hex);
  return hslToHex(h, clamp(s, 0.58, 0.86), clamp(l, 0.56, 0.68));
}
/** 너무 어두운 색은 밝기를 minL 까지 올린다 (색상은 그대로) */
export function liftL(hex: string, minL: number): string {
  const [h, s, l] = hsl(hex);
  return l >= minL ? hex : hslToHex(h, s, minL);
}
const hueGap = (a: string, b: string) => { const d = Math.abs(hsl(a)[0] - hsl(b)[0]) % 360; return d > 180 ? 360 - d : d; };

export const INK = '#1D1E21';
const PENCIL = '#6F6E68';
const GOLD = '#FFC766';
const SILVER = '#E6ECF5';
const AMBER = '#F4A647';

function makePalette(info: HomerunInfo, theme: HrTheme): string[] {
  const t = info.team;
  if (theme === 'classic') {
    // 인쇄물 — 먹 + 내 구단 별색 한 가지 (남의 홈런은 먹만)
    let spot = INK;
    if (t?.primary && info.mine !== false) {
      spot = t.primary;
      const L = relLum(spot);
      if (L > 0.18) { const [h, s, l] = hsl(spot); spot = hslToHex(h, s, clamp(l * (L > 0.4 ? 0.58 : 0.72), 0, 1)); }
    }
    return [spot, INK, INK, PENCIL, INK, spot];
  }
  const cands = [t?.primary, t?.secondary, t?.accent].filter((c): c is string => chromatic(c));
  const team = cands[0] ? fireColor(cands[0]) : GOLD;
  const second = cands.slice(1).find((c) => hueGap(fireColor(c), team) > 28);
  const team2 = second ? fireColor(second) : SILVER;
  return [team, team2, GOLD, SILVER, '#FFFFFF', AMBER];
}

/* ───────── 제목 ───────── */
function mainKind(info: HomerunInfo): MainKind {
  if (info.walkoff) return 'walkoff';
  if (info.runners === 3) return 'slam';
  if (info.lead === 'reverse') return 'reverse';
  if (info.lead === 'tie') return 'tie';
  if (info.lead === 'go-ahead') return 'go-ahead';
  if (info.outOfPark) return 'oop';
  if ((info.streak ?? 0) >= 2) return 'b2b';
  if (milestoneOf(info)) return 'milestone';
  if (info.pinch) return 'pinch';
  if (info.leadoff) return 'leadoff';
  return (['solo', 'two', 'three'] as const)[info.runners];
}
function milestoneOf(info: HomerunInfo): string | null {
  if (info.milestone) return info.milestone;
  const n = info.seasonNo ?? 0;
  return n >= 10 && n % 10 === 0 ? `시즌 ${n}호` : null;
}
const b2bWord = (n: number) => (n === 2 ? '백투백' : n === 3 ? '백투백투백' : `${n}타자 연속`);

interface TitleOut { title: string; split?: [string, string]; look: TitleLook; used: Set<string> }
function titleOf(info: HomerunInfo, main: MainKind): TitleOut {
  const r = info.runners;
  const word = RUN_WORD[r];
  const used = new Set<string>();
  const dist = info.distM ? Math.round(info.distM) : 0;
  switch (main) {
    case 'walkoff': {
      used.add('walkoff');
      const w = r === 0 ? '홈런' : word;
      if (info.lead === 'reverse') { used.add('reverse'); return { title: `역전 끝내기 ${w}`, split: ['역전 끝내기', w], look: 'band', used }; }
      return { title: `끝내기 ${w}`, split: ['끝내기', w], look: 'band', used };
    }
    case 'slam':
      if (info.lead === 'reverse') { used.add('reverse'); return { title: '역전 그랜드슬램', split: ['역전', '그랜드슬램'], look: 'letters', used }; }
      if (info.lead === 'tie') { used.add('tie'); return { title: '동점 그랜드슬램', split: ['동점', '그랜드슬램'], look: 'letters', used }; }
      if (info.pinch) { used.add('pinch'); return { title: '대타 그랜드슬램', split: ['대타', '그랜드슬램'], look: 'letters', used }; }
      return { title: '그랜드슬램', look: 'letters', used };
    case 'reverse': used.add('reverse'); return { title: `역전 ${word}`, split: ['역전', word], look: 'flip', used };
    case 'tie': used.add('tie'); return { title: `동점 ${word}`, split: ['동점', word], look: 'meet', used };
    case 'go-ahead': used.add('go-ahead'); return { title: `앞서가는 ${word}`, split: ['앞서가는', word], look: 'rise', used };
    case 'oop': used.add('oop'); return { title: dist ? `장외 ${dist}m` : '장외 홈런', split: ['장외', dist ? `${dist}m` : '홈런'], look: 'count', used };
    case 'b2b': used.add('b2b'); return { title: b2bWord(info.streak ?? 2), look: 'echo', used };
    case 'milestone': used.add('milestone'); return { title: milestoneOf(info)!, look: 'mark', used };
    case 'pinch': used.add('pinch'); return { title: r === 0 ? '대타 홈런' : `대타 ${word}`, split: ['대타', r === 0 ? '홈런' : word], look: 'card', used };
    case 'leadoff': used.add('leadoff'); return { title: '선두타자 홈런', split: ['선두타자', '홈런'], look: 'ticker', used };
    case 'solo': return { title: '솔로 홈런', look: 'wipe', used };
    case 'two': return { title: '투런!', look: 'slam', used };
    case 'three': return { title: '스리런!', look: 'slam', used };
  }
}

/** 작은 줄 — 이닝 · 아웃 · (제목에 안 들어간) 꼬리표 */
function kickerOf(info: HomerunInfo, used: Set<string>): string {
  const parts: string[] = [];
  if (info.inning) parts.push(`${info.inning}회${info.half === 'bot' ? '말' : info.half === 'top' ? '초' : ''}`);
  const outs = info.outs != null && info.inning ? ['무사', '1사', '2사'][info.outs] : '';
  if (info.runners === 3) parts.push(outs ? `${outs} 만루` : '만루');
  else if (outs) parts.push(outs);
  if (info.walkoff && !used.has('walkoff')) parts.push('끝내기');
  if (info.lead === 'reverse' && !used.has('reverse')) parts.push('역전');
  if (info.lead === 'tie' && !used.has('tie')) parts.push('동점');
  if (info.lead === 'go-ahead' && !used.has('go-ahead')) parts.push('앞서가는 점수');
  if (info.pinch && !used.has('pinch')) parts.push('대타');
  if (info.leadoff === 'game') parts.push('경기 첫 타자');
  else if (info.leadoff && !used.has('leadoff')) parts.push('선두타자');
  if ((info.streak ?? 0) >= 2 && !used.has('b2b')) parts.push(b2bWord(info.streak!));
  if (info.outOfPark && !used.has('oop')) parts.push('장외');
  const ms = milestoneOf(info);
  if (ms && !used.has('milestone')) parts.push(ms);
  return parts.join(' · ');
}

function subOf(info: HomerunInfo, used: Set<string>): string {
  const parts: string[] = [];
  if (info.batter) parts.push(info.batter);
  // 시즌 n호 — 제목이나 작은 줄에 이미 '시즌 n호' 가 있으면 빼고
  if (info.seasonNo && milestoneOf(info) !== `시즌 ${info.seasonNo}호`) parts.push(`시즌 ${info.seasonNo}호`);
  // 어디로 · 얼마나 (장외는 제목에 거리가 있으니 방향만)
  const where = [dirKo(info), info.distM && !used.has('oop') ? `${Math.round(info.distM)}m` : ''].filter(Boolean).join(' ');
  if (info.distM || info.dir || info.angle != null) parts.push(where);
  return parts.join(' · ');
}

/* ───────── 프로그램 짜기 ───────── */
interface Ctx {
  R: Rand;
  sx: number;
  /** 기본 높이 (y) */
  alt: number;
  /** 크기 배율 */
  big: number;
  home: boolean;
  runs: number;
}

const DEF: Record<ShellType, { n: number; life: number }> = {
  peony: { n: 72, life: 1300 }, chrys: { n: 66, life: 1550 }, willow: { n: 46, life: 2600 }, palm: { n: 10, life: 1900 },
  ring: { n: 46, life: 1250 }, 'double-ring': { n: 38, life: 1300 }, saturn: { n: 40, life: 1450 }, crossette: { n: 14, life: 1400 },
  kamuro: { n: 96, life: 2700 }, strobe: { n: 46, life: 1700 }, pistil: { n: 64, life: 1450 }, salute: { n: 30, life: 420 },
  mine: { n: 26, life: 1250 }, gerb: { n: 0, life: 760 }, tracer: { n: 1, life: 900 },
};

class Prog {
  shells: Shell[] = [];
  flashes: FxPlan['flashes'] = [];
  shakes: FxPlan['shakes'] = [];
  constructor(public c: Ctx) {}
  add(type: ShellType, t: number, x: number, y: number, r: number, color: number, o: Partial<Shell> = {}): Shell {
    const R = this.c.R;
    const d = DEF[type];
    const bx = clamp(x + R.range(-0.025, 0.025), 0.1, 0.9);
    const by = clamp(y + R.range(-0.02, 0.02), 0.08, 0.6);
    const sh: Shell = {
      type, t: Math.round(t + R.range(-24, 24)),
      rise: type === 'mine' || type === 'gerb' || type === 'tracer' ? 0 : Math.round(380 + (0.62 - by) * 520),
      x: bx, y: by,
      x0: clamp(bx + R.range(-0.1, 0.1), 0.06, 0.94),
      r: r * this.c.big,
      c: color,
      n: Math.round(d.n * (0.92 + R.next() * 0.16)),
      tilt: R.range(0.3, 0.62), roll: R.range(-0.5, 0.5),
      life: Math.round(d.life * R.range(0.94, 1.08)),
      seed: (R.next() * 4294967296) >>> 0,
      ...o,
    };
    // 색이 한 번 바뀌는 꽃불 — 같은 모양이라도 홈런마다 끝 색이 다르다
    if ((type === 'peony' || type === 'chrys' || type === 'pistil' || type === 'saturn') && sh.c3 == null && R.chance(0.5)) {
      sh.c3 = R.pick([C_SILVER, C_GOLD, C_WHITE, color === C_TEAM ? C_TEAM2 : C_TEAM]);
    }
    this.shells.push(sh);
    return sh;
  }
  flash(t: number, a: number, warm = false) { this.flashes.push({ t, a, warm }); }
  shake(t: number, amp: number) { this.shakes.push({ t, amp }); }
}

/** 가로 위치를 가운데 쪽으로 k 배 당긴다 (1 = 그대로) */
const SIDE = (sx: number, k: number) => clamp(0.5 + (sx - 0.5) * k, 0.12, 0.88);

/** 종류마다 변형 수 — 가장 흔한 솔로는 더 많이 */
const VARIANTS: Partial<Record<MainKind, number>> = { solo: 5, b2b: 4 };

function buildLong(main: MainKind, info: HomerunInfo, c: Ctx, seedVariant: number): { p: Prog; dur: number; tier: number; variant: number } {
  const p = new Prog(c);
  const variant = seedVariant % (VARIANTS[main] ?? 3);
  const { R, sx, alt } = c;
  const away = !c.home;
  let dur = 2200;
  let tier = 1;
  switch (main) {
    case 'solo': {
      tier = 1; dur = 2100;
      if (variant === 0) {
        p.add('ring', 430, sx, alt, 0.2, C_TEAM, { sig: true, tilt: R.range(0.34, 0.5) });
        p.add('chrys', 780, SIDE(sx, 0.5) + (sx < 0.5 ? 0.2 : -0.2), alt + 0.09, 0.13, C_SILVER);
      } else if (variant === 1) {
        p.add('pistil', 430, sx, alt, 0.2, C_TEAM, { sig: true, c2: C_SILVER });
        p.add('strobe', 840, sx < 0.5 ? sx + 0.24 : sx - 0.24, alt + 0.07, 0.12, C_SILVER);
      } else if (variant === 2) {
        p.add('palm', 450, sx, alt - 0.02, 0.21, C_GOLD, { sig: true });
        p.add('peony', 820, sx < 0.5 ? sx + 0.22 : sx - 0.22, alt + 0.1, 0.12, C_TEAM);
      } else if (variant === 3) {
        p.add('double-ring', 440, sx, alt, 0.19, C_TEAM, { sig: true, c2: C_SILVER });
        p.add('chrys', 800, sx < 0.5 ? sx + 0.21 : sx - 0.21, alt + 0.08, 0.12, C_GOLD);
      } else {
        p.add('crossette', 430, sx, alt, 0.2, C_TEAM, { sig: true, c2: C_GOLD });
        p.add('willow', 860, sx < 0.5 ? sx + 0.18 : sx - 0.18, alt + 0.02, 0.17, C_AMBER);
      }
      p.flash(440, 0.22);
      p.shake(440, 1.5);
      break;
    }
    case 'two': {
      tier = 2; dur = 2400;
      const a = SIDE(sx, 0.6) - 0.14, b = SIDE(sx, 0.6) + 0.14;
      if (variant === 0) {
        p.add('peony', 420, a, alt + 0.02, 0.17, C_TEAM, { sig: true });
        p.add('peony', 600, b, alt - 0.02, 0.17, C_TEAM2, { sig: true });
      } else if (variant === 1) {
        p.add('chrys', 420, a, alt, 0.18, C_TEAM, { sig: true });
        p.add('ring', 610, b, alt - 0.03, 0.18, C_GOLD, { sig: true, tilt: R.range(0.3, 0.42) });
      } else {
        p.add('crossette', 420, a, alt, 0.19, C_TEAM, { sig: true });
        p.add('double-ring', 640, b, alt - 0.03, 0.17, C_TEAM, { sig: true, c2: C_SILVER });
      }
      p.add('willow', 1020, SIDE(sx, 0.4), alt - 0.05, 0.26, C_AMBER);
      p.flash(610, 0.32);
      p.shake(610, 2.2);
      break;
    }
    case 'three': {
      tier = 3; dur = 2800;
      const ltr = variant === 2 ? sx >= 0.5 : sx < 0.5;
      const xs = ltr ? [0.24, 0.5, 0.76] : [0.76, 0.5, 0.24];
      const pool = R.shuffle(['peony', 'chrys', 'ring', 'crossette', 'strobe'] as ShellType[]).slice(0, 3);
      const cols = [C_TEAM, C_GOLD, C_TEAM2];
      xs.forEach((x, i) => p.add(pool[i], 400 + i * 150, x, alt + 0.06 - i * 0.025, 0.14 + i * 0.01, cols[i], { sig: i === 2 }));
      if (variant === 1) p.add('pistil', 1150, sx, alt - 0.05, 0.3, C_TEAM, { sig: true, c2: C_GOLD });
      else p.add('saturn', 1150, sx, alt - 0.05, 0.3, C_TEAM, { sig: true, c2: C_GOLD, tilt: R.range(0.22, 0.32) });
      p.flash(1160, 0.45, true);
      p.shake(1160, 3);
      break;
    }
    case 'slam': {
      tier = 4; dur = 3400;
      // 한 점씩 — 1 · 2 · 3 · 4 (점점 크게), 마지막에 금빛 왕관
      const sets: ShellType[][] = [['ring', 'ring', 'ring', 'saturn'], ['peony', 'chrys', 'pistil', 'double-ring'], ['crossette', 'crossette', 'crossette', 'saturn']];
      const types = sets[variant % 3];
      const cols = [C_TEAM2, C_TEAM, C_TEAM2, C_TEAM];
      const xs = R.chance(0.5) ? [0.22, 0.78, 0.36, 0.64] : [0.78, 0.22, 0.64, 0.36];
      types.forEach((ty, i) => p.add(ty, 380 + i * 220, SIDE(xs[i], 1) * 0.8 + sx * 0.2, alt + 0.05 - i * 0.02, 0.13 + i * 0.03, cols[i], { sig: i === 3, c2: i === 3 ? C_GOLD : C_SILVER }));
      if (info.lead === 'reverse') {
        // 역전 만루 — 양쪽에서 엇갈려 올라가는 혜성 둘
        p.add('chrys', 1250, 0.7, alt - 0.06, 0.16, C_TEAM, { x0: 0.12, rise: 560 });
        p.add('chrys', 1280, 0.3, alt - 0.06, 0.16, C_TEAM2, { x0: 0.88, rise: 560 });
      }
      p.add('kamuro', 1480, 0.5, alt - 0.07, 0.38, C_GOLD, { sig: true });
      if (!away) [0.18, 0.5, 0.82].forEach((x, i) => p.add('mine', 1420 + i * 40, x, 1, 0.5, i === 1 ? C_GOLD : C_TEAM, { x0: x }));
      p.add('strobe', 2050, sx, alt + 0.04, 0.16, C_SILVER);
      p.flash(1490, 0.7, true);
      p.shake(1490, 5);
      p.shake(380 + 3 * 220, 2.5);
      break;
    }
    case 'walkoff': {
      tier = 5; dur = 3800;
      p.add('salute', 260, sx, alt + 0.02, 0.2, C_WHITE, { sig: true, rise: 0 });
      p.flash(260, 0.85);
      p.shake(260, 6);
      if (!away) [0.14, 0.38, 0.62, 0.86].forEach((x, i) => p.add('gerb', 300 + i * 60, x, 1, 0.55, i % 2 ? C_GOLD : C_SILVER, { x0: x, span: 1750 }));
      const pool = R.shuffle(['peony', 'chrys', 'ring', 'pistil', 'crossette', 'strobe'] as ShellType[]);
      const cols = [C_TEAM, C_TEAM2, C_TEAM, C_SILVER, C_TEAM, C_GOLD];
      for (let i = 0; i < 6; i++) {
        const x = i % 2 ? 0.2 + R.next() * 0.25 : 0.55 + R.next() * 0.25;
        p.add(pool[i], 520 + i * 140, x, alt + 0.06 - R.next() * 0.1, 0.13 + R.next() * 0.04, cols[i], { sig: i === 0 || i === 3, c2: C_GOLD });
      }
      p.add('willow', 1560, 0.3, alt - 0.07, 0.4, C_AMBER, { sig: true });
      p.add('willow', 1600, 0.7, alt - 0.07, 0.4, C_AMBER, { sig: true });
      if (info.runners === 3) p.add('kamuro', 1700, 0.5, alt - 0.1, 0.34, C_GOLD, { sig: true });
      else p.add('double-ring', 1700, 0.5, alt - 0.06, 0.3, C_TEAM, { sig: true, c2: C_GOLD });
      p.add('salute', 2080, 0.5, alt + 0.04, 0.22, C_WHITE, { rise: 0 });
      p.flash(1710, 0.55, true);
      p.flash(2080, 0.7);
      p.shake(2080, 4.5);
      break;
    }
    case 'reverse': {
      tier = 4; dur = 3200;
      // 상대 리드가 꺼진다 — 반대쪽 하늘에 은빛 점멸
      p.add('strobe', 300, 1 - sx, alt + 0.04, 0.16, C_SILVER);
      // 엇갈림 — 왼쪽에서 쏜 것이 오른쪽에서, 오른쪽에서 쏜 것이 왼쪽에서 터진다
      const tyA = variant === 0 ? 'chrys' : variant === 1 ? 'crossette' : 'palm';
      p.add(tyA, 740, 0.7, alt - 0.02, 0.18, C_TEAM, { x0: 0.1, rise: 600, sig: true });
      p.add(tyA, 780, 0.3, alt - 0.02, 0.18, variant === 2 ? C_GOLD : C_TEAM2, { x0: 0.9, rise: 600, sig: true });
      p.add('saturn', 1260, 0.5, alt - 0.07, 0.32 + c.runs * 0.02, C_TEAM, { sig: true, c2: C_GOLD, tilt: R.range(0.2, 0.3) });
      for (let i = 0; i < c.runs; i++) p.add('peony', 1700 + i * 140, i % 2 ? 0.26 : 0.74, alt + 0.1, 0.1, C_GOLD);
      p.flash(1270, 0.6, true);
      p.shake(1270, 4.5);
      p.shake(760, 2);
      break;
    }
    case 'tie': {
      tier = 3; dur = 2600;
      const ty: ShellType = variant === 1 ? 'pistil' : variant === 2 ? 'double-ring' : 'ring';
      const roll = R.range(0.15, 0.45);
      // 쌍둥이 — 같은 순간, 거울처럼 (같은 씨 · 반대로 돌림)
      const a = p.add(ty, 430, 0.29, alt, 0.17, C_TEAM, { sig: true, roll, c2: C_SILVER, tilt: 0.42 });
      p.shells.push({ ...a, x: 1 - a.x, x0: 1 - a.x0, roll: -roll });
      const b = p.add('peony', 820, 0.16, alt + 0.12, 0.09, C_SILVER);
      p.shells.push({ ...b, x: 1 - b.x, x0: 1 - b.x0 });
      p.add('pistil', 1160, 0.5, alt - 0.06, 0.26, C_TEAM, { sig: true, c2: C_GOLD });
      p.flash(1170, 0.42);
      p.shake(1170, 3);
      break;
    }
    case 'go-ahead': {
      tier = 3; dur = 2600;
      const ltr = sx >= 0.5;
      const xs = ltr ? [0.22, 0.48, 0.74] : [0.78, 0.52, 0.26];
      const types: ShellType[] = variant === 0 ? ['peony', 'ring', 'chrys'] : variant === 1 ? ['strobe', 'crossette', 'pistil'] : ['ring', 'ring', 'palm'];
      xs.forEach((x, i) => p.add(types[i], 400 + i * 220, x, alt + 0.15 - i * 0.1, 0.13 + i * 0.05, i === 2 ? C_GOLD : i ? C_TEAM2 : C_TEAM, { sig: i >= 1, c2: C_TEAM }));
      p.add('strobe', 1250, xs[2], alt - 0.05, 0.18, C_SILVER);
      p.flash(850, 0.4, true);
      p.shake(850, 3);
      break;
    }
    case 'oop': {
      tier = 3; dur = 2800;
      // 공이 구장 밖으로 — 홈에서 하늘 끝까지 긴 은빛 혜성
      p.add('tracer', 0, sx + (sx - 0.5) * 0.6, -0.12, 0.5, C_SILVER, { x0: 0.5, sig: true, life: 760 });
      p.add(variant === 1 ? 'palm' : 'chrys', 820, sx, alt - 0.12, 0.34, C_TEAM, { sig: true, rise: 0 });
      p.add('strobe', 1180, sx, alt - 0.12, 0.22, C_SILVER, { rise: 0 });
      if (variant === 2) p.add('ring', 1000, 1 - sx, alt - 0.02, 0.16, C_GOLD);
      p.flash(830, 0.45);
      p.shake(830, 3.2);
      break;
    }
    case 'b2b': {
      const n = Math.min(4, Math.max(2, info.streak ?? 2));
      tier = n >= 3 ? 3 : 2; dur = 2400 + (n - 2) * 420;
      // 메아리 — 같은 불꽃이 자리를 바꿔 다시
      const ty: ShellType = (['ring', 'pistil', 'crossette', 'palm'] as const)[variant % 4];
      const xs = [SIDE(sx, 0.8), 1 - SIDE(sx, 0.8), 0.5, 0.5];
      for (let i = 0; i < n; i++) p.add(ty, 420 + i * 420, xs[i], alt - i * 0.03, 0.17 + i * 0.025, C_TEAM, { sig: true, c2: C_SILVER, roll: (i % 2 ? -1 : 1) * 0.3 });
      p.add('willow', 420 + n * 420 + 160, 0.5, alt - 0.04, 0.24, C_AMBER);
      for (let i = 1; i < n; i++) p.shake(420 + i * 420, 2 + i);
      p.flash(420 + (n - 1) * 420, 0.35);
      break;
    }
    case 'milestone': {
      tier = 3; dur = 3000;
      // 금빛 고리가 한 겹씩 — 기념 메달
      const rings = clamp(Math.floor((info.seasonNo ?? 30) / 10), 2, 4);
      const tilt = R.range(0.82, 0.95);
      for (let i = 0; i < rings; i++) p.add('ring', 420 + i * 150, 0.5, alt, 0.12 + i * 0.07, C_GOLD, { sig: i === rings - 1, tilt, roll: 0, rise: i ? 0 : 520 });
      for (let i = 1; i < rings; i++) { p.shells[i].x = p.shells[0].x; p.shells[i].y = p.shells[0].y; p.shells[i].rise = 0; }
      p.add('kamuro', 1200, 0.5, alt - 0.06, 0.32, C_GOLD, { sig: true });
      p.add('peony', 1500, sx < 0.5 ? 0.24 : 0.76, alt + 0.1, 0.1, C_TEAM);
      p.flash(1210, 0.4, true);
      p.shake(1210, 2.5);
      break;
    }
    case 'pinch': {
      tier = 2; dur = 2300;
      p.add('crossette', 420, sx, alt, 0.22, C_TEAM, { sig: true });
      p.add('strobe', 780, 1 - sx, alt + 0.06, 0.15, C_SILVER);
      p.add(c.runs >= 1 ? 'double-ring' : 'ring', 1050, 0.5, alt - 0.05, 0.2 + c.runs * 0.03, C_TEAM2, { sig: c.runs >= 1, c2: C_GOLD });
      p.flash(430, 0.3);
      p.shake(430, 2.4);
      break;
    }
    case 'leadoff': {
      tier = 2; dur = 2200;
      p.add('salute', 300, sx, alt + 0.04, 0.16, C_WHITE, { sig: true });
      p.add('ring', 560, sx < 0.5 ? sx + 0.2 : sx - 0.2, alt - 0.02, 0.18, C_SILVER, { tilt: 0.5 });
      p.add('pistil', 840, sx, alt - 0.05, 0.22, C_TEAM, { sig: true, c2: C_GOLD });
      p.flash(310, 0.5);
      p.shake(310, 2.6);
      break;
    }
  }

  // ── 곁들임 (제목이 되지 못한 꼬리표) ──
  if (info.outOfPark && main !== 'oop') {
    p.add('tracer', 0, sx + (sx - 0.5) * 0.6, -0.12, 0.5, C_SILVER, { x0: 0.5, life: 760 });
    p.shells.forEach((s) => { if (s.type !== 'tracer' && s.type !== 'mine' && s.type !== 'gerb') s.y = clamp(s.y - 0.05, 0.08, 0.6); });
  }
  if (info.pinch && main !== 'pinch' && main !== 'slam') {
    const first = p.shells.find((s) => ['peony', 'chrys', 'ring', 'pistil', 'strobe'].includes(s.type));
    if (first) first.type = 'crossette';
  }
  // 백투백 — 대표 불꽃이 자리를 바꿔 한 번 더 (대타로 바뀐 모양까지 그대로)
  if ((info.streak ?? 0) >= 2 && main !== 'b2b') {
    const first = p.shells.find((s) => s.sig && s.type !== 'salute' && s.type !== 'tracer');
    if (first) p.shells.push({ ...first, t: first.t + 360, x: 1 - first.x, roll: -first.roll, seed: first.seed ^ 0x5bd1e995, sig: false });
  }
  if (info.leadoff && main !== 'leadoff') p.add('salute', 200, sx, alt + 0.06, 0.12, C_WHITE, { rise: 0 });
  const ms = milestoneOf(info);
  if (ms && main !== 'milestone') {
    const last = Math.max(...p.shells.map((s) => s.t));
    p.add('ring', last + 260, 0.5, alt - 0.08, 0.26, C_GOLD, { tilt: 0.9, roll: 0, rise: 0 });
    dur += 300;
  }
  if (away) {
    // 원정 홈런 — 바닥 불꽃 없이, 조금 낮고 적게
    p.shells = p.shells.filter((s) => s.type !== 'mine' && s.type !== 'gerb');
    p.shells.forEach((s) => { if (s.type !== 'tracer') { s.y = clamp(s.y + 0.04, 0.08, 0.6); s.n = Math.round(s.n * 0.82); } });
  }
  return { p, dur, tier, variant };
}

/** 짧은 판 — 대표 불꽃만 몰아서 (0.8~1.2초) */
function toShort(long: Prog, tier: number): { p: Prog; dur: number } {
  const sig = long.shells.filter((s) => s.sig);
  // 큰 것부터 몇 개 고른 뒤 원래 순서대로
  const pick = (sig.length ? sig : long.shells.slice(0, 2)).slice().sort((a, b) => b.r - a.r).slice(0, tier >= 5 ? 4 : 3).sort((a, b) => a.t - b.t);
  const p = new Prog(long.c);
  const t0 = pick[0]?.t ?? 0;
  const tracer = pick.find((s) => s.type === 'tracer');
  pick.forEach((s) => {
    const t = s.type === 'tracer' ? 0 : (tracer ? 200 : 30) + Math.round(Math.min(1, (s.t - t0) / 900) * 260);
    p.shells.push({ ...s, t, rise: 0, life: s.type === 'tracer' ? 360 : s.life });
  });
  // 번쩍·흔들림은 가장 큰 불꽃에 한 번
  const big = long.flashes.reduce((a, b) => (b.a > a.a ? b : a), { t: 0, a: 0, warm: false });
  const mainShell = p.shells.reduce((a, b) => (b.r > a.r ? b : a), p.shells[0]);
  if (big.a > 0) p.flash(mainShell.t + 10, Math.min(0.75, big.a), big.warm);
  const shk = long.shakes.reduce((a, b) => Math.max(a, b.amp), 0);
  if (shk > 0) p.shake(mainShell.t + 10, shk * 0.8);
  return { p, dur: [800, 900, 1000, 1100, 1200][tier - 1] };
}

/* ───────── 계획 ───────── */
function seedOf(info: HomerunInfo): number {
  const t = info.team;
  const key = [
    info.id ?? '', info.runners, info.walkoff ? 1 : 0, info.lead ?? '', info.distM ? Math.round(info.distM) : '', info.dir ?? '', info.angle != null ? Math.round(info.angle) : '',
    info.outOfPark ? 1 : 0, info.streak ?? '', info.leadoff ?? '', info.pinch ? 1 : 0, info.seasonNo ?? '', info.milestone ?? '', info.batter ?? '',
    t?.primary ?? '', t?.secondary ?? '', info.home === false ? 0 : 1, info.inning ?? '', info.half ?? '', info.outs ?? '',
  ].join('|');
  return hashStr(key);
}

export function planHomerun(info: HomerunInfo, length: HrLength = 'long', theme: HrTheme = 'night', opts: { ceremony?: boolean } = {}): FxPlan {
  const seed = seedOf(info);
  const R = new Rand(seed);
  const main = mainKind(info);
  const seedVariant = R.fork('variant').int(0, 59);
  const dist = info.distM ?? 118;
  const df = clamp((dist - 105) / 35, 0, 1);
  const ctx: Ctx = {
    R: R.fork('prog'),
    sx: sideX(info),
    alt: 0.33 - df * 0.05 + R.fork('alt').range(-0.02, 0.02),
    big: 0.9 + df * 0.22,
    home: info.home !== false,
    runs: info.runners,
  };
  const built = buildLong(main, info, ctx, seedVariant);
  const variant = built.variant;
  let prog = built.p;
  let dur = built.dur;
  const tier = built.tier;
  if (length === 'short') { const s = toShort(prog, tier); prog = s.p; dur = s.dur; }
  prog.shells.sort((a, b) => a.t - b.t);
  // 첫 불꽃의 꼬리는 연출이 시작된 뒤에 올라가게
  prog.shells.forEach((s) => { s.rise = Math.max(0, Math.min(s.rise, s.t - 30)); });

  const T = titleOf(info, main);
  const kicker = kickerOf(info, T.used);
  const sub = subOf(info, T.used);
  const firstBurst = Math.min(...prog.shells.filter((s) => s.type !== 'tracer' && s.type !== 'gerb').map((s) => s.t), dur * 0.3);
  const textIn = length === 'short' ? 40 : main === 'oop' ? 420 : Math.max(120, firstBurst - 90);
  const textOut = length === 'short' ? dur - 170 : dur - 430;
  let stat: FxPlan['stat'];
  if (main === 'oop' && info.distM) stat = { label: '비거리', value: Math.round(info.distM), unit: 'm' };
  else if (main === 'milestone' && info.seasonNo && !info.milestone) stat = { label: '시즌', value: info.seasonNo, unit: '호' };
  else if (main === 'slam' || (main === 'walkoff' && info.runners === 3)) stat = { label: '타점', value: 4, unit: '' };

  const palette = makePalette(info, theme);
  const ceremony = info.runners === 3 && length === 'long' && opts.ceremony !== false;
  const speech = [T.title, info.batter, kicker].filter(Boolean).join(', ');
  return {
    seed, tier, main, variant, title: T.title, split: T.split, look: T.look, kicker, sub, stat,
    echo: main === 'b2b' ? Math.min(4, info.streak ?? 2) : undefined,
    palette, shells: prog.shells, flashes: prog.flashes, shakes: prog.shakes,
    dur, textIn, textOut,
    letterbox: length === 'long' && (main === 'walkoff' || main === 'slam'),
    ceremony, speed: length === 'short' ? 1.7 : 1, theme, length, speech,
  };
}

/**
 * 연출 전체 길이(ms, 세리머니 포함) — 재생 전에 박자를 짤 때 (빨리 보기 10초 예산 등).
 * playHomerunFx(...).duration 과 같은 값.
 */
export function homerunDuration(info: HomerunInfo, length: HrLength = 'long', opts: { ceremony?: boolean; reducedMotion?: boolean } = {}): number {
  if (opts.reducedMotion) return REDUCED_MS[length];
  const p = planHomerun(info, length, 'night', { ceremony: opts.ceremony });
  return p.dur + (p.ceremony ? CEREMONY_MS - CEREMONY_OVERLAP : 0);
}
