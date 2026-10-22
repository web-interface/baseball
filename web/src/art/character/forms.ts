// 투구·타격 폼 변수 — 선수 id 시드로 정한다(같은 선수 = 항상 같은 폼).
// 범주 값(armSlot·legLift·tempo·stance·legKick …)은 15_선수데이터 스키마(forms)와 같은 키를 쓰고,
// 그림에 필요한 연속 값(팔 각도°, 다리 높이, 보폭, 몸 비틀기 …)을 덧붙인다. 효과표·분포 근거는 forms.md.

import type { PlayerSpec, Origin, Hand } from './types';
import { Rng } from './rng';
import { clamp } from './geom';

// ───────── 투구 ─────────
export type ArmSlot = 'over' | 'threeQuarter' | 'side' | 'under';
export type Delivery = 'windup' | 'set';
export type LegLift = 'high' | 'normal' | 'slide';
export type Tempo = 'quick' | 'normal' | 'slow';
export type HideBall = 'normal' | 'good' | 'exposed';
export type ArmAction = 'long' | 'short';
export type PitchFinish = 'balanced' | 'fallOff' | 'hop';
export type SetHands = 'belt' | 'chest' | 'high';

export interface PitchForm {
  throws: Hand;
  /** 팔 각도 분류 (스키마 armSlots 키) */
  armSlot: ArmSlot;
  /** 팔 각도(도) — Statcast 식: 90 = 머리 위 수직, 0 = 수평(옆), 음수 = 수평 아래(잠수함) */
  armAngle: number;
  /** 시작 동작 (주자 없을 때) */
  delivery: Delivery;
  /** 세트 때 두 손 높이 */
  setHands: SetHands;
  /** 와인드업 때 두 손을 머리 위로 */
  overhead: boolean;
  /** 다리 들기 (스키마 legLift 키) */
  legLift: LegLift;
  /** 무릎 높이 0(거의 안 듦) … 0.5(허벅지 수평) … 1(가슴까지) */
  liftH: number;
  /** 든 다리를 몸 안쪽으로 감는 정도 0..1 */
  tuck: number;
  /** 다리 든 채 멈추는 시간(초) */
  hang: number;
  tempo: Tempo;
  /** 셋업~스트라이드 시간 배율 (0.8 빠름 … 1.3 느림) */
  tempoMul: number;
  /** 보폭(키 대비) — 익스텐션 */
  stride: number;
  /** 크로스 스텝 (몸 앞을 가로질러 디딤) */
  crossfire: boolean;
  /** 디딤발 좌우 위치(cm, + 3루 쪽 = 닫힘) */
  strideZ: number;
  /** 공 숨김 (스키마 hideBall 키) */
  hideBall: HideBall;
  /** 몸 비틀기 0..1 (등번호를 타자에게 보여 줌) */
  coil: number;
  /** 스트라이드 때 글러브를 얼굴 앞에 드는 정도 0..1 */
  gloveHigh: number;
  /** 팔 동작: 크게 돌림 / 짧게 (포수식) */
  armAction: ArmAction;
  /** 축발 무릎 굽힘(드롭 앤 드라이브) 0..1 */
  drop: number;
  /** 릴리스 때 상체 숙임(도) */
  trunkFlex: number;
  /** 피니시 */
  finish: PitchFinish;
  /** 릴리스 때 머리가 1루 쪽으로 쏠림 0..1 */
  headWhip: number;
  /** 사람마다 조금씩 다른 값의 씨앗 */
  seed: string;
}

// ───────── 타격 ─────────
export type Stance = 'square' | 'open' | 'closed';
export type LegKick = 'big' | 'small' | 'toeTap' | 'noStride';
export type HandsPos = 'high' | 'mid' | 'low';
export type Crouch = 'upright' | 'normal' | 'crouch';
export type Waggle = 'none' | 'small' | 'big';
export type SwingPlane = 'up' | 'level' | 'down';
export type BatFinish = 'twoHands' | 'oneHand';

export interface BatForm {
  /** 이번 그림의 타석 (양타는 상대 투수에 따라 바꿔 넣음) */
  bats: Hand;
  switchHitter: boolean;
  stance: Stance;
  /** -1 클로즈드 … 0 스퀘어 … +1 오픈 */
  openness: number;
  /** 스탠스 폭(키 대비, 발 사이) */
  width: number;
  crouch: Crouch;
  /** 무릎·허리 굽힘 0..1 */
  crouchK: number;
  hands: HandsPos;
  /** 손 높이(cm, 뒤 어깨 기준, − 위) */
  handsY: number;
  /** 배트 기울기(도): 0 세움 … 80 눕힘 */
  batTilt: number;
  /** 배트 끝이 머리 뒤로 감긴 정도 0..1 (랩) */
  batWrap: number;
  waggle: Waggle;
  /** 타이밍 동작 (스키마 legKick 키) */
  legKick: LegKick;
  /** 다리 드는 높이(cm) */
  kickH: number;
  /** 내딛는 거리(cm) */
  strideLen: number;
  /** 손을 한 번 내렸다 올리는 히치 0..1 */
  hitch: number;
  plane: SwingPlane;
  /** 공격각(도): + 어퍼 */
  attack: number;
  finish: BatFinish;
  /** 대기·로드 시간 배율 */
  tempo: number;
  seed: string;
}

type W<T> = ReadonlyArray<readonly [T, number]>;

/** 출신(리그) 별 팔 각도 비율 — 근거는 forms.md 2장 */
export const ARM_SLOT_SHARE: Record<'KBO' | 'NPB' | 'MLB', Record<ArmSlot, number>> = {
  KBO: { over: 0.18, threeQuarter: 0.66, side: 0.10, under: 0.06 },
  NPB: { over: 0.2, threeQuarter: 0.65, side: 0.11, under: 0.04 },
  MLB: { over: 0.2, threeQuarter: 0.73, side: 0.065, under: 0.005 },
};
const leagueOf = (o: Origin | undefined): 'KBO' | 'NPB' | 'MLB' => (o === 'JP' ? 'NPB' : o === 'KR' || o === 'TW' || !o ? 'KBO' : 'MLB');

export interface PitchPick { delivery?: Delivery; armSlot?: ArmSlot; legLift?: LegLift; tempo?: Tempo; hideBall?: HideBall; finish?: PitchFinish; crossfire?: boolean; armAction?: ArmAction; overhead?: boolean; setHands?: SetHands }

/** o: 범주를 고정(특별 선수·미리보기). 고정하지 않은 값은 시드 분포에서 뽑는다 */
export function makePitchForm(spec: PlayerSpec, o: PitchPick = {}): PitchForm {
  const r = new Rng(spec.id).fork('pitchForm');
  const lg = ARM_SLOT_SHARE[leagueOf(spec.origin)];
  const lefty = spec.throws === 'L';
  const tall = clamp((spec.heightCm - 185) / 10, -1.5, 1.5);
  const armSlot0 = r.weighted<ArmSlot>([
    ['over', lg.over * (1 + 0.35 * tall)],
    ['threeQuarter', lg.threeQuarter],
    ['side', lg.side * (lefty ? 0.6 : 1) * (1 - 0.2 * tall)],
    ['under', lg.under * (lefty ? 0.3 : 1) * (1 - 0.25 * tall)],
  ]);
  const armSlot = o.armSlot ?? armSlot0;
  const armAngle = armSlot === 'over' ? r.around(73, 5, 63, 86) : armSlot === 'threeQuarter' ? r.around(45, 6, 32, 56) : armSlot === 'side' ? r.around(13, 7, -2, 26) : r.around(-24, 12, -58, -8);
  const legLift = o.legLift ?? r.weighted<LegLift>([['high', 0.35], ['normal', 0.5], ['slide', 0.15]]);
  const liftH = legLift === 'high' ? r.around(0.88, 0.07, 0.75, 1) : legLift === 'normal' ? r.around(0.55, 0.08, 0.38, 0.7) : r.around(0.12, 0.05, 0.04, 0.22);
  const tempo = o.tempo ?? r.weighted<Tempo>([['quick', 0.3], ['normal', 0.5], ['slow', 0.2]]);
  const tempoMul = (tempo === 'quick' ? 0.84 : tempo === 'slow' ? 1.24 : 1) * r.around(1, 0.04, 0.92, 1.08);
  const hideBall = o.hideBall ?? r.weighted<HideBall>([['normal', 0.7], ['good', 0.2], ['exposed', 0.1]]);
  const low = armSlot === 'side' || armSlot === 'under';
  const cf = r.chance(0.15 * (low ? 1.6 : 1));
  const crossfire = o.crossfire ?? cf;
  const delivery: Delivery = o.delivery ?? (r.chance(0.55) ? 'windup' : 'set');
  return {
    throws: spec.throws,
    armSlot, armAngle,
    delivery,
    setHands: o.setHands ?? r.weighted<SetHands>([['belt', 0.45], ['chest', 0.4], ['high', 0.15]]),
    overhead: o.overhead ?? r.chance(0.22),
    legLift, liftH,
    tuck: clamp(r.around(0.3, 0.2, 0, 0.9) + (hideBall === 'good' ? 0.3 : 0), 0, 1),
    hang: legLift === 'slide' ? 0 : r.chance(0.3) ? r.range(0.08, 0.22) : r.range(0, 0.04),
    tempo, tempoMul,
    stride: clamp(r.around(0.82, 0.035, 0.72, 0.92) + (armSlot === 'under' ? 0.07 : armSlot === 'side' ? 0.03 : armSlot === 'over' ? -0.02 : 0), 0.7, 1.0),
    crossfire,
    strideZ: crossfire ? r.range(16, 26) : r.around(0, 5, -12, 10),
    hideBall,
    coil: hideBall === 'good' ? r.range(0.7, 1) : hideBall === 'exposed' ? r.range(0, 0.25) : r.range(0.25, 0.6),
    gloveHigh: hideBall === 'good' ? r.range(0.55, 1) : hideBall === 'exposed' ? 0 : r.chance(0.25) ? r.range(0.3, 0.7) : r.range(0, 0.2),
    armAction: o.armAction ?? (r.chance(hideBall === 'good' ? 0.55 : hideBall === 'exposed' ? 0.05 : 0.25) ? 'short' : 'long'),
    drop: clamp((armSlot === 'under' ? 0.92 : armSlot === 'side' ? 0.6 : armSlot === 'over' ? 0.18 : 0.38) + r.gauss(0, 0.1), 0, 1),
    trunkFlex: (armSlot === 'under' ? 60 : armSlot === 'side' ? 28 : armSlot === 'over' ? 38 : 33) + r.gauss(0, 4),
    finish: o.finish ?? r.weighted<PitchFinish>([['balanced', 0.52], ['fallOff', armSlot === 'over' ? 0.4 : 0.3], ['hop', low ? 0.1 : 0.18]]),
    headWhip: clamp(r.around(0.25, 0.22, 0, 1), 0, 1),
    seed: spec.id,
  };
}

/** 체격이 무거울수록 큰 레그킥, 가벼운 중앙 내야·중견수는 토탭 (스키마 archBias 방향과 같게) */
export interface BatPick { vsHand?: Hand; stance?: Stance; legKick?: LegKick; hands?: HandsPos; crouch?: Crouch; waggle?: Waggle; plane?: SwingPlane; finish?: BatFinish; wrap?: boolean; hitch?: boolean }

export function makeBatForm(spec: PlayerSpec, o: BatPick = {}): BatForm {
  const r = new Rng(spec.id).fork('batForm');
  const bmi = spec.weightKg / ((spec.heightCm / 100) ** 2);
  const power = clamp((bmi - 26) / 4, -1, 1.5) + (spec.pos === '1B' || spec.pos === 'DH' ? 0.6 : 0) + (spec.pos === 'SS' || spec.pos === '2B' || spec.pos === 'CF' ? -0.5 : 0);
  const stance = o.stance ?? r.weighted<Stance>([['square', 0.55], ['open', 0.3], ['closed', 0.15]]);
  const openness = stance === 'open' ? r.around(0.62, 0.18, 0.3, 1) : stance === 'closed' ? r.around(-0.6, 0.15, -1, -0.3) : r.around(0, 0.1, -0.2, 0.2);
  const crouch = o.crouch ?? r.weighted<Crouch>([['upright', 0.35], ['normal', 0.5], ['crouch', 0.15]]);
  const hands = o.hands ?? r.weighted<HandsPos>([['high', 0.35], ['mid', 0.45], ['low', 0.2]]);
  const legKick0 = r.weighted<LegKick>([
    ['big', 0.25 * (1 + 0.8 * Math.max(0, power))], ['small', 0.4], ['toeTap', 0.25 * (1 + 0.8 * Math.max(0, -power))], ['noStride', 0.1 * (power < 0 ? 1.3 : 0.8)],
  ]);
  const legKick = o.legKick ?? legKick0;
  const plane0 = r.weighted<SwingPlane>([['up', 0.32 * (1 + 0.5 * Math.max(0, power))], ['level', 0.5], ['down', 0.18 * (power < 0 ? 1.4 : 0.7)]]);
  const plane = o.plane ?? plane0;
  const wrap0 = r.chance(0.15);
  const wrap = o.wrap ?? wrap0;
  const bats: Hand = spec.bats === 'S' ? (o.vsHand === 'L' ? 'R' : o.vsHand === 'R' ? 'L' : (r.chance(0.5) ? 'L' : 'R')) : spec.bats;
  return {
    bats, switchHitter: spec.bats === 'S',
    stance, openness,
    width: clamp(r.around(0.37, 0.045, 0.27, 0.5) + (crouch === 'crouch' ? 0.04 : 0) + (legKick === 'noStride' ? 0.05 : 0), 0.26, 0.54),
    crouch, crouchK: crouch === 'upright' ? r.range(0.05, 0.25) : crouch === 'crouch' ? r.range(0.75, 1) : r.range(0.35, 0.6),
    hands, handsY: hands === 'high' ? r.around(-13, 3, -20, -8) : hands === 'low' ? r.around(10, 3, 5, 16) : r.around(-2, 3, -7, 3),
    batTilt: wrap ? r.range(30, 55) : r.around(40, 16, 2, 78),
    batWrap: wrap ? r.range(0.6, 1) : r.range(0, 0.3),
    waggle: o.waggle ?? r.weighted<Waggle>([['none', 0.5], ['small', 0.4], ['big', 0.1]]),
    legKick,
    kickH: legKick === 'big' ? r.range(26, 38) : legKick === 'small' ? r.range(10, 17) : legKick === 'toeTap' ? r.range(8, 13) : 0,
    strideLen: legKick === 'big' ? r.range(24, 34) : legKick === 'small' ? r.range(16, 26) : legKick === 'toeTap' ? r.range(10, 18) : r.range(0, 5),
    hitch: (o.hitch ?? r.chance(0.2)) ? r.range(0.5, 1) : 0,
    plane, attack: plane === 'up' ? r.range(12, 20) : plane === 'down' ? r.range(-9, -3) : r.range(3, 9),
    finish: o.finish ?? (r.chance(0.42 + 0.15 * Math.max(0, power)) ? 'oneHand' : 'twoHands'),
    tempo: r.around(1, 0.08, 0.85, 1.2),
    seed: spec.id,
  };
}

// ───────── 이름 ─────────
export const SLOT_KO: Record<ArmSlot, string> = { over: '오버핸드', threeQuarter: '스리쿼터', side: '사이드암', under: '잠수함' };

/** 카드에 붙일 짧은 폼 이름 (예: "하이킥 스리쿼터", "슬라이드 스텝 사이드암", "잠수함") */
export function pitchFormName(f: PitchForm): string {
  const slot = SLOT_KO[f.armSlot];
  const lift = f.legLift === 'high' ? '하이킥' : f.legLift === 'slide' ? '슬라이드 스텝' : '';
  if (f.armSlot === 'under') return lift ? `${lift} 잠수함` : '잠수함';
  return lift ? `${lift} ${slot}` : slot;
}

export function pitchFormTags(f: PitchForm): string[] {
  const t: string[] = [];
  t.push(`팔 각도 ${Math.round(f.armAngle)}°`);
  t.push(f.delivery === 'windup' ? (f.overhead ? '와인드업(머리 위)' : '와인드업') : '세트');
  if (f.tempo !== 'normal') t.push(f.tempo === 'quick' ? '빠른 템포' : '느린 템포');
  if (f.hang > 0.07) t.push('정지 동작');
  if (f.hideBall === 'good') t.push('공 숨김');
  if (f.hideBall === 'exposed') t.push('공 보임');
  if (f.armAction === 'short') t.push('짧은 팔');
  if (f.crossfire) t.push('크로스파이어');
  t.push(`보폭 ${Math.round(f.stride * 100)}%`);
  if (f.finish === 'fallOff') t.push('1루 쪽 쏠림');
  if (f.finish === 'hop') t.push('뛰는 피니시');
  return t;
}

export const STANCE_KO: Record<Stance, string> = { square: '스퀘어 스탠스', open: '오픈 스탠스', closed: '클로즈드 스탠스' };
export const KICK_KO: Record<LegKick, string> = { big: '레그킥', small: '작은 레그킥', toeTap: '토탭', noStride: '노스트라이드' };

/** 예: "오픈 스탠스 · 토탭" */
export function batFormName(f: BatForm): string {
  return `${STANCE_KO[f.stance]} · ${KICK_KO[f.legKick]}`;
}

export function batFormTags(f: BatForm): string[] {
  const t: string[] = [];
  t.push(f.switchHitter ? `양타(${f.bats === 'L' ? '좌' : '우'}타석)` : f.bats === 'L' ? '좌타' : '우타');
  if (f.hands !== 'mid') t.push(f.hands === 'high' ? '높은 손' : '낮은 손');
  if (f.crouch !== 'normal') t.push(f.crouch === 'crouch' ? '웅크림' : '곧게 섬');
  if (f.batWrap > 0.5) t.push('배트 감기(랩)');
  else if (f.batTilt > 58) t.push('배트 눕힘');
  else if (f.batTilt < 18) t.push('배트 세움');
  if (f.waggle !== 'none') t.push(f.waggle === 'big' ? '큰 왜글' : '왜글');
  if (f.hitch > 0) t.push('히치');
  t.push(f.plane === 'up' ? '어퍼 스윙' : f.plane === 'down' ? '다운 스윙' : '레벨 스윙');
  t.push(f.finish === 'oneHand' ? '한 손 팔로스루' : '두 손 팔로스루');
  return t;
}

// ───────── 경기 엔진 효과 (제안) ─────────
// 값은 15_선수데이터 1~100 척도의 '진짜 값' 보정(생성 때 1회) 또는 엔진 배율. forms.md 3장에 근거.

export interface FormEffect { label: string; mods: Record<string, number>; note?: string }

export const PITCH_EFFECTS: Record<string, FormEffect> = {
  'armSlot.over': { label: '오버핸드', mods: { platoonBase: 0.6, gbTend: -4, deception: -2, velocity: 1, popupRate: 1.05 }, note: '수직 낙차 큰 직구·커브. 좌우 차 작음' },
  'armSlot.threeQuarter': { label: '스리쿼터', mods: { platoonBase: 0.8 } },
  'armSlot.side': { label: '사이드암', mods: { platoonBase: 1.25, gbTend: 6, deception: 6, velocity: -1 }, note: '같은 손 타자 상대 삼진↑, 반대 손 타자 상대 장타 허용↑' },
  'armSlot.under': { label: '잠수함', mods: { platoonBase: 1.5, gbTend: 10, deception: 10, velocity: -3, firstTimeThrough: -0.012 }, note: '처음 보는 타자 상대 wOBA −12점, 반대 손에 약함' },
  'legLift.high': { label: '하이킥', mods: { velocity: 1, control: -1, timeToPlate: 0.12, sbSuccess: 0.05 } },
  'legLift.normal': { label: '보통', mods: {} },
  'legLift.slide': { label: '슬라이드 스텝', mods: { velocity: -1, timeToPlate: -0.15, sbSuccess: -0.07, slideStep: 5 } },
  'tempo.quick': { label: '빠른 템포', mods: { slideStep: 4, timeToPlate: -0.05, pitchesPerPA: -0.1, defenseRange: 0.5 } },
  'tempo.slow': { label: '느린 템포', mods: { slideStep: -4, deception: 1, timeToPlate: 0.08, pitchClockViolation: 0.004 } },
  'hideBall.good': { label: '공 숨김', mods: { deception: 3, kPctBonus: 0.006 } },
  'hideBall.exposed': { label: '공 보임(쿠세)', mods: { deception: -3, tippedPitch: 0.03 } },
  crossfire: { label: '크로스파이어', mods: { deception: 4, control: -2, platoonAdd: 0.1 } },
  'armAction.short': { label: '짧은 팔', mods: { deception: 2, velocity: -0.5 } },
  'finish.fallOff': { label: '1루 쪽 쏠림', mods: { pFielding: -2, buntDefense: -0.04 } },
  'finish.balanced': { label: '균형 피니시', mods: { pFielding: 1 } },
};

export const BAT_EFFECTS: Record<string, FormEffect> = {
  'stance.open': { label: '오픈 스탠스', mods: { insideContact: 2, outsideContact: -1, pullTendShift: 5, vsSameHandBreak: 1 } },
  'stance.closed': { label: '클로즈드 스탠스', mods: { outsideContact: 2, insideContact: -1, pullTendShift: -5 } },
  'legKick.big': { label: '레그킥', mods: { power: 2, vsFast: -2, avoidK: -1, vsChangeup: -2 } },
  'legKick.toeTap': { label: '토탭', mods: { contactR: 1, contactL: 1, vsBreak: 1, power: -1 } },
  'legKick.noStride': { label: '노스트라이드', mods: { avoidK: 2, power: -2, vsFast: 1 } },
  'hands.high': { label: '높은 손', mods: { launchTendShift: 3, highFastball: -1 } },
  'hands.low': { label: '낮은 손', mods: { launchTendShift: -3, contactR: 0.5, contactL: 0.5 } },
  'crouch.crouch': { label: '웅크림', mods: { zoneSizeMult: 0.96, power: -1, eye: 1 } },
  'plane.up': { label: '어퍼 스윙', mods: { launchTendShift: 6, power: 1, avoidK: -1, highFastball: -2 } },
  'plane.down': { label: '다운 스윙', mods: { launchTendShift: -6, gbBabip: 0.008, power: -1 } },
  'finish.oneHand': { label: '한 손 팔로스루', mods: { power: 0.5, contactR: -0.5, contactL: -0.5 } },
  'waggle.big': { label: '큰 왜글', mods: {}, note: '연출 전용(효과 없음)' },
  hitch: { label: '히치', mods: { power: 1, vsFast: -1.5 } },
};
