// 선수 데이터 → 경기용 실효 능력치 캐시. 값이 지나가는 길(11 설계 4.1)을 한 곳에서 한 번만:
// 진짜 값(15) → + 카드층·경기층 보너스(압축) → + 경기 단위 점수(큰 경기·홈·적응·통증) → 포지션 숙련 배율(수비) → 소프트캡 → z
// 타석·투구 단위 보정(플래툰·압박감·피로·기억)은 pitch.ts 에서 덧셈 몇 개로.
import { P } from './params.ts';
import type { PlayerIn, MechBonus, PitchKey } from './types.ts';
import { clamp } from './rng.ts';

export const ATTR_KEYS = ['contactR', 'contactL', 'power', 'gap', 'eye', 'avoidK', 'vsFast', 'vsBreak', 'bunt', 'pullTend', 'launchTend', 'swingTend',
  'speed', 'baserunning', 'stealJump', 'sliding', 'range', 'firstStep', 'hands', 'armStr', 'armAcc', 'turnDP', 'block', 'framing', 'popTime', 'pitcherLead',
  'velocity', 'control', 'deception', 'extension', 'stamina', 'recovery', 'pickoff', 'slideStep', 'pFielding', 'gbTend',
  'composure', 'concentration', 'competitiveness', 'leadership', 'teamwork', 'baseballIQ', 'durability', 'agility', 'strength'] as const;
export const A = Object.fromEntries(ATTR_KEYS.map((k, i) => [k, i])) as Record<typeof ATTR_KEYS[number], number>;
export const N_ATTR = 45;
export const HID_KEYS = ['consistency', 'bigGame', 'pressure', 'injuryProne', 'versatility', 'adaptability', 'professionalism', 'temperament', 'ambition',
  'loyalty', 'sportsmanship', 'controversy', 'ego', 'heat_tolerance', 'cold_tolerance', 'rain_play', 'sun_tracking', 'wind_reading', 'night_vision'] as const;
export const HD = Object.fromEntries(HID_KEYS.map((k, i) => [k, i])) as Record<typeof HID_KEYS[number], number>;
export const PITCH_KEYS: PitchKey[] = ['FF', 'SI', 'FC', 'SL', 'SW', 'CU', 'CH', 'FS', 'KN'];
export const POS_KEYS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'] as const;
/** 성향(좋고 나쁨이 아닌 방향) — (v−50)/50 */
const TENDENCY = new Set([A.pullTend, A.launchTend, A.swingTend, A.gbTend]);
/** 포지션 숙련 배율이 붙는 수비 능력 [11 4.1 ④] */
const DEF_ATTRS = [A.range, A.firstStep, A.hands, A.turnDP, A.armAcc];
const DEF_MULT: [number, number][] = [[1, 0.5], [5, 0.68], [7, 0.76], [10, 0.84], [12, 0.88], [15, 0.94], [18, 0.98], [20, 1]];
export function defMult(prof: number): number {
  if (prof <= 1) return 0.5; if (prof >= 20) return 1;
  for (let i = 1; i < DEF_MULT.length; i++) if (prof <= DEF_MULT[i][0]) { const [a, va] = DEF_MULT[i - 1], [b, vb] = DEF_MULT[i]; return va + (vb - va) * (prof - a) / (b - a); }
  return 1;
}
/** 팔 각도: 좌우 기본(15 armSlots.platoonBase) */
const SLOT_PLATOON: Record<string, number> = { over: 0.6, threeQuarter: 0.8, side: 1.2, under: 1.45 };

/** 보너스 압축 — 15·11: 20(1−e^(−B/20)) / 'linear' 이면 그대로(기획서 안) */
export function compressBonus(B: number): number {
  if (!B) return 0;
  if (P.bonus.mode === 'linear') return B;
  const k = P.bonus.k;
  return B >= 0 ? k * (1 - Math.exp(-B / k)) : B;   // 음수(적성 손실 등)는 그대로
}
export function softCap(x: number): number { const c = P.bonus.softCap, w = P.bonus.softW; return x <= c ? x : c + w * (1 - Math.exp(-(x - c) / w)); }

// 특성 비트(엔진이 쓰는 것만)
export const TR = {
  firstPitchSwinger: 1, patientHitter: 2, grinder: 4, oppoMaster: 8, pullPower: 16, fastballHunter: 32, lowBallHitter: 64, highBallHitter: 128,
  freeSwinger: 256, bigSwing: 512, dragBunter: 1024, plateCrowder: 2048, clutchBat: 4096, stealsOften: 8192, aggressiveRunner: 16384, headfirstSlide: 32768,
  hardSlide: 65536, showArm: 131072, quickThrow: 262144, highJump: 524288, diver: 1048576, wallClimber: 2097152, runnerKiller: 4194304, blockMaster: 8388608,
  quickWorker: 16777216, nibbler: 33554432, bigHeart: 67108864, inningsEater: 134217728, rubberArm: 268435456, ironArm: 536870912, brushback: 1073741824,
  pickoffArtist: 2 ** 31, slowStarter: 2 ** 32, fastballReliant: 2 ** 33, stopper: 2 ** 34, mentor: 2 ** 35, moodMaker: 2 ** 36,
} as const;
export const hasT = (pc: PC, t: number): boolean => Math.floor(pc.traits / t) % 2 === 1;

// 시그니처 구종 코드
export const SIG = ['', 'waterfallCurve', 'heavyFastball', 'snakeFastball', 'risingFastball', 'hardSlider', 'backdoorSlider', 'screwball', 'eephus', 'forkball', 'circleChange', 'batBreaker', 'dancingKnuckle', 'sweeper'];

export interface PitchC { t: number; stuff: number; cmd: number; use: number; sig: number; zs: number; zc: number }
/** 경기용 선수 캐시(경기 시작 때 1회). 동적 값(피로·투구 수·기억)은 game 상태에 따로. */
export interface PC {
  id: number; rec: number; team: 0 | 1;
  throwsL: boolean; bats: 0 | 1 | 2;   // 0 우 · 1 좌 · 2 양
  height: number; age: number;
  v: Float64Array; z: Float64Array;
  tPull: number; tLaunch: number; tSwing: number; tGb: number;
  zConR: number; zConL: number; split: number;
  sprint: number; h1: number; bunt: number;
  // 투수
  pitches: PitchC[]; velo: number; ext: number; limit: number; deliv: number; pPlat: number; slotPlat: number; slot: string; kn: boolean;
  parkGames: number;
  // 포수
  pop: number;
  posMult: Float64Array;           // 포지션별 수비 배율(P..DH)
  posProf: Float64Array;
  traits: number; sigBat: string;
  /** 숨은 1~20 */
  h: Float64Array;
  /** 날씨 특성 민감 배율 T = 1 − k(t−10): 더위·추위·비·햇빛·바람·박명 */
  wxT: Float64Array;
  mech: MechBonus;
  /** 12 상태가 만든 채널 값(물리층·심리층): bat.contact, bat.power, bat.eye, bat.aggr, pit.stuff, pit.control, fld.error(log) */
  chP: Float64Array; chS: Float64Array;
  injMult: number;                 // 부상 배율(경향·내구성·나이·프로의식)
  zoneMult: number;                // '웅크림' 폼 존 높이 배율
  role: string;
}
export const CH = { contact: 0, power: 1, eye: 2, aggr: 3, stuff: 4, control: 5, error: 6, range: 7, speed: 8, velo: 9 } as const;
export const N_CH = 10;

const WX_K = [0.05, 0.05, 0.05, 0.06, 0.06, 0.04];

/** 경기 단위 문맥(큰 경기·홈) */
export interface CacheCtx { team: 0 | 1; home: boolean; importance: number; rec: number }

export function buildCache(p: PlayerIn, cx: CacheCtx): PC {
  const v = new Float64Array(N_ATTR), z = new Float64Array(N_ATTR);
  const B = p.bonus;
  const hid = new Float64Array(19);
  for (let i = 0; i < 19; i++) hid[i] = p.hidden ? (p.hidden[i] ?? 10) : 10;
  // 특성 비트
  let traits = 0;
  for (const t of p.traits ?? []) { const b = (TR as any)[t]; if (b) traits += b; }
  const st = p.state ?? {};
  // ③ 경기 단위 점수
  const big = cx.importance * (hid[HD.bigGame] - 10) * P.ctx.bigGame;
  const adapt = st.adaptGames != null && st.adaptGames > 0 ? -P.ctx.adapt * clamp(1 - st.adaptGames / Math.max(10, 40 - 1.5 * hid[HD.adaptability]), 0, 1) : 0;
  for (let i = 0; i < N_ATTR; i++) {
    let x = p.attrs[i] ?? 50;
    if (B && B[i]) x += compressBonus(B[i]);
    if (!TENDENCY.has(i)) {
      x += adapt;
      if (big && (i <= A.vsBreak || (i >= A.velocity && i <= A.deception))) x += big;
      if (st.pain) x *= 0.9;
    }
    v[i] = x;
  }
  if (cx.home) { v[A.contactR] += P.home.contact; v[A.contactL] += P.home.contact; v[A.eye] += P.home.eye; }
  if (traits && hasTraitBits(traits, TR.bigSwing)) { v[A.power] += 3; v[A.avoidK] -= 5; v[A.launchTend] += 8; }
  if (traits && hasTraitBits(traits, TR.diver)) { v[A.range] += 3; }
  // 포지션 숙련
  const posProf = new Float64Array(10), posMult = new Float64Array(10);
  for (let i = 0; i < 10; i++) { posProf[i] = p.pos[i] ?? 1; posMult[i] = defMult(posProf[i]); }
  const C = P.center;
  for (let i = 0; i < N_ATTR; i++) {
    if (TENDENCY.has(i)) { v[i] = clamp(v[i], 1, 100); z[i] = (v[i] - 50) / 50; continue; }
    v[i] = softCap(v[i]);
    z[i] = (v[i] - (C[i] ?? 60)) / 10;
  }
  // 플래툰 컨택
  const zConR = z[A.contactR], zConL = z[A.contactL];
  const bats = p.bats === 'R' ? 0 : p.bats === 'L' ? 1 : 2;
  const split = bats === 0 ? v[A.contactL] - v[A.contactR] : bats === 1 ? v[A.contactR] - v[A.contactL] : 0;
  // 투수
  const pitches: PitchC[] = [];
  let kn = false;
  const bS = B ? (B[45] ?? 0) : 0, bC = B ? (B[46] ?? 0) : 0;
  for (const x of p.pitches ?? []) {
    const t = PITCH_KEYS.indexOf(x.t); if (t < 0) continue;
    let stuff = softCap(x.stuff + compressBonus(bS) + (p.mech?.stuffRel ? 30 * p.mech.stuffRel : 0) + big);
    let cmd = softCap(x.cmd + compressBonus(bC) + big);
    const sig = x.sig ? Math.max(0, SIG.indexOf(x.sig)) : 0;
    if (sig === 1) cmd -= 4;
    if (t === 8) kn = true;
    pitches.push({ t, stuff, cmd, use: Math.max(0.5, x.use), sig, zs: (stuff - P.centerStuff) / 10, zc: (cmd - P.centerCmd) / 10 });
  }
  let useSum = 0; for (const x of pitches) useSum += x.use;
  for (const x of pitches) x.use /= useSum || 1;
  const ext = 1.55 + 0.0075 * v[A.extension] + (p.heightCm - 186) * 0.004;
  const slot = p.armSlot ?? 'threeQuarter';
  let pPlat = 0; for (const x of pitches) pPlat += x.use * P.pt.platoon[x.t];
  pPlat += (SLOT_PLATOON[slot] ?? 0.8) - 0.8;
  const armF = st.arm ?? 0;
  const limit = P.fat.limitA + (v[A.stamina] - 50) * P.fat.limitK - armF * P.fat.armK;
  const wxT = new Float64Array(6);
  for (let i = 0; i < 6; i++) wxT[i] = clamp(1 - WX_K[i] * (hid[13 + i] - 10), 0.3, 1.6);
  // 12 상태 → 채널 값(물리층 chP / 심리층 chS) [12 stateVars]
  const chP = new Float64Array(N_CH), chS = new Float64Array(N_CH);
  const cond = st.cond ?? 0;
  const condV = cond === 2 ? 0.03 : cond === 1 ? 0.015 : cond === -1 ? -0.02 : cond === -2 ? -0.04 : 0;
  if (condV) { chP[CH.contact] += condV; chP[CH.power] += condV; chP[CH.stuff] += condV; chP[CH.control] += condV; chP[CH.range] += condV * 0.5; }
  const fat = st.fatigue ?? 0;
  if (fat > 40) { const f = -(fat - 40) / 60 * 0.04; chP[CH.contact] += f; chP[CH.power] += f; chP[CH.speed] += f * 0.5; chP[CH.range] += f; }
  const sense = st.sense ?? 100;
  if (sense < 60) { const f = (sense - 60) / 60; chS[CH.contact] += 0.04 * f; chS[CH.eye] += 0.02 * f; chS[CH.control] += 0.05 * f; }
  const conf = st.conf ?? 50, mor = st.morale ?? 60;
  chS[CH.contact] += (conf - 50) / 50 * 0.01 + (mor - 60) / 40 * 0.005;
  chS[CH.stuff] += (conf - 50) / 50 * 0.008;
  for (const f of st.flags ?? []) {
    if (f === 'hot') { chS[CH.contact] += 0.015; chS[CH.power] += 0.02; chS[CH.eye] += 0.005; }
    else if (f === 'slump') { chS[CH.contact] -= 0.015; chS[CH.power] -= 0.015; chS[CH.aggr] += 0.05; }
    else if (f === 'scouted') chS[CH.contact] -= 0.02;
    else if (f === 'pitchGroove') { chS[CH.control] += 0.025; chS[CH.stuff] += 0.02; }
    else if (f === 'pitchLost') { chS[CH.control] -= 0.04; chS[CH.stuff] -= 0.01; }
    else if (f === 'rookieSurge') { chS[CH.contact] += 0.015; chS[CH.aggr] += 0.04; }
    else if (f === 'outOfPos') { chS[CH.error] += Math.log(1.3); chP[CH.range] -= 0.05; chS[CH.contact] -= 0.01; }
    else if (f === 'overuse') { chP[CH.velo] -= 0.8; }
  }
  const age = p.age;
  const injMult = Math.exp(0.0788 * (hid[HD.injuryProne] - 10)) * (1.25 - 0.005 * v[A.durability]) * (1 + 0.035 * Math.max(0, age - 29)) * (1.1 - 0.01 * hid[HD.professionalism]) * (st.pain ? 2 : 1) * (cond === -2 ? 1.15 : 1);
  return {
    id: p.id, rec: cx.rec, team: cx.team, throwsL: p.throws === 'L', bats, height: p.heightCm, age,
    v, z, tPull: z[A.pullTend], tLaunch: z[A.launchTend], tSwing: z[A.swingTend], tGb: z[A.gbTend],
    zConR, zConL, split,
    sprint: P.run.v0 + P.run.vK * v[A.speed], h1: P.run.h1A - P.run.h1K * v[A.speed] - (bats === 1 ? P.run.lhb : 0), bunt: z[A.bunt],
    pitches, velo: 130 + 0.30 * v[A.velocity], ext, limit, deliv: P.steal.deliv - P.steal.delivK * v[A.slideStep], pPlat, slotPlat: (SLOT_PLATOON[slot] ?? 0.8) - 0.8, slot, kn, parkGames: p.parkGames ?? 0,
    pop: P.steal.pop - P.steal.popK * v[A.popTime],
    posMult, posProf, traits, sigBat: p.sigBat ?? '', h: hid, wxT, mech: p.mech ?? {}, chP, chS, injMult,
    zoneMult: p.formFx?.zoneSizeMult ?? 1, role: p.role ?? '',
  };
}
function hasTraitBits(traits: number, t: number): boolean { return Math.floor(traits / t) % 2 === 1; }

/** 수비 능력 z(포지션 숙련 배율 적용) — 그 자리에서의 실효 */
export function defZ(pc: PC, attr: number, posIdx: number): number {
  const m = pc.posMult[posIdx];
  if (m >= 0.999) return pc.z[attr];
  return (pc.v[attr] * m - (P.center[attr] ?? 60)) / 10;
}

/** 팀 전원에 같은 보너스(조합 시험용): 모든 능력(성향 제외)·구종에 B 점 */
export function uniformBonus(B: number): number[] {
  const out = new Array(47).fill(0);
  for (let i = 0; i < N_ATTR; i++) if (!TENDENCY.has(i)) out[i] = B;
  out[45] = B; out[46] = B;
  return out;
}
