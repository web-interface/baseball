// 캐릭터 아트 공용 타입

export type Hand = 'R' | 'L';
export type BatSide = 'R' | 'L' | 'S';
export type Position = 'P' | 'C' | '1B' | '2B' | '3B' | 'SS' | 'LF' | 'CF' | 'RF' | 'DH';
/** 외모 분포를 고르는 출신 묶음 (게임 데이터의 국적 → 이 값으로 매핑) */
export type Origin = 'KR' | 'JP' | 'TW' | 'US' | 'USB' | 'LATAM' | 'AU';

/** 그림을 만드는 데 필요한 선수 데이터 (게임 선수 데이터의 일부) */
export interface PlayerSpec {
  id: string;
  heightCm: number;
  weightKg: number;
  throws: Hand;
  bats: BatSide;
  pos: Position;
  origin?: Origin;
  age?: number;
  number?: number;
}

// ── 체격 ──
export type BuildType = 'lean' | 'athletic' | 'power' | 'heavy' | 'lanky';
export interface Build {
  h: number; w: number; bmi: number;
  type: BuildType;
  fat: number;      // 0..1
  muscle: number;   // 0..1
  frame: number;    // 0..1 뼈대 폭
  headScale: number;
  // 길이(cm)
  hipY: number;     // 바닥→고관절 높이
  thigh: number; shin: number; ankleH: number; footL: number;
  torsoL: number;   // 고관절 중심 → 목 밑(흉골 위) 길이
  neckL: number;    // 목 밑 → 머리 원점(귓구멍 높이)
  upperArm: number; foreArm: number; hand: number;
  // 굵기(cm) — 반폭/깊이
  shoulderHalf: number; chestHalf: number; chestFront: number; chestBack: number;
  waistHalf: number; belly: number; hipHalf: number; butt: number;
  neckW: number; neckD: number;
  deltoid: number; upperArmD: number; foreArmD: number; wristD: number;
  thighD: number; kneeD: number; calfD: number; ankleD: number;
}

// ── 외모 ──
export type FaceShape = 'round' | 'square' | 'long' | 'oval';
export type HairStyle = 'buzz' | 'crew' | 'twoblock' | 'textured' | 'flow' | 'tied' | 'perm' | 'curls' | 'locs';
export type FacialHair = 'none' | 'stubble' | 'mustache' | 'goatee' | 'chin' | 'beard' | 'full' | 'sideburns' | 'chinstrap';
export type Eyewear = 'none' | 'glasses' | 'shades' | 'shadesUp';
export type Expression = 'neutral' | 'determined' | 'smile';
export type LidType = 'mono' | 'inner' | 'double';

export interface SkinTone { base: string; shade: string; deep: string; light: string; rim: string; lip: string; line: string; blush: string }

export interface Face {
  shape: FaceShape;
  headW: number; headD: number; foreheadH: number; faceL: number;
  flat: number;          // 0..1 얼굴 앞면 평평함
  cheekW: number; cheekProm: number; cheekFull: number;
  jawW: number; jawSharp: number; chinW: number; chinL: number; chinProj: number; chinCleft: number;
  browRidge: number;
  eyeW: number; eyeH: number; eyeGap: number; eyeTilt: number; eyeY: number; lid: LidType; lidHeavy: number; bags: number;
  iris: string;
  browThick: number; browAngle: number; browArch: number; browLen: number; browGap: number; browY: number; browShape: number;
  noseL: number; noseW: number; noseProj: number; noseBridge: number; noseRoot: number; noseTip: number; noseBulb: number; noseCrook: number;
  mouthW: number; lipU: number; lipL: number; mouthY: number;
  earSize: number; earOut: number;
  nasolabial: number; foreheadLines: number;
  mole: null | { x: number; y: number };
  browSlit: 0 | -1 | 1;
  freckles: number;
  /** 볼 홍조 0..1 */
  ruddy: number;
}

export interface HairSpec {
  style: HairStyle;
  color: string; shade: string; light: string;
  hairline: number;  // 0 꽉 참 … 1 많이 올라감
  volume: number;    // 윗머리 부피 배율
  length: number;    // 긴 머리 길이 배율
  sideburn: number;  // 구레나룻 길이 (Y, cm, 귀 높이 기준)
  fade: number;      // 옆머리 짧게 친 정도 0..1
  part: -1 | 0 | 1;  // 가르마 방향
}

export interface FacialHairSpec {
  kind: FacialHair;
  color: string;
  density: number;   // 0..1
  length: number;    // cm (덥수룩함)
}

export interface Appearance {
  id: string;
  origin: Origin;
  skinL: number;     // 0(밝음)..1(어두움) 기록용
  skin: SkinTone;
  face: Face;
  hair: HairSpec;
  facialHair: FacialHairSpec;
  eyewear: Eyewear;
  shadesTint: string;
  expression: Expression;
  build: Build;
  throws: Hand;
  bats: BatSide;
  pos: Position;
  age: number;
}

// ── 구단·유니폼 ──
export interface TeamColors {
  id: string;
  name: string;      // 가슴 글자 (가상 구단)
  cap: string;       // 모자 글자
  primary: string;   // 주색
  secondary: string; // 보조
  accent: string;    // 강조
  pinstripe?: boolean;
  awayBase?: 'primary' | 'gray';
}

export type SockStyle = 'high' | 'low';
export interface Kit {
  team: TeamColors;
  set: 'home' | 'away';
  number: number;
  jersey: string; jerseyTrim: string; jerseyTrim2: string; letter: string; letterLine: string;
  pants: string; pantsStripe: string | null;
  undershirt: string; longSleeve: boolean;
  belt: string;
  socks: SockStyle; sock: string; sockStripe: string | null;
  cleat: string; cleatTrim: string;
  cap: string; capBrim: string; capLogo: string; capLogoLine: string;
  helmet: string; helmetMatte: boolean;
  armSleeve: null | { arm: 'throw' | 'glove'; color: string; full: boolean };
  elbowGuard: string | null;
  batGlove: string; batGlove2: string;
  wristband: null | { color: string; arm: 'both' | 'throw' | 'glove' };
  eyeBlack: boolean;
  necklace: null | { color: string; beads: boolean };
  glove: string; gloveLace: string; gloveWeb: 'basket' | 'h' | 'closed';
  bat: string; batTape: string; batBarrel: string;
  catcher: null | { mask: string; cage: string; gear: string; gearTrim: string };
}

// ── 뼈대 / 자세 ──
export interface ArmPose { sh: number; el: number; wr: number; hand: HandShape }
export interface LegPose { hip: number; knee: number; ankle: number; toe?: number }
export type HandShape = 'relax' | 'fist' | 'grip' | 'open' | 'glove' | 'hold';
export type Side = 'R' | 'L';

export interface Pose {
  /** 고관절 중심. 바닥 y=0, 위로 갈수록 음수 (cm) */
  root: [number, number];
  /** 몸통 숙임(앞 +) — 골반, 허리, 가슴, 목, 머리 (deg) */
  pelvis: number; spine: number; chest: number; neck: number; head: number;
  /** 몸통 회전(yaw): 90 = 옆모습(화면 오른쪽 봄), 작을수록 카메라 쪽으로 돎 */
  hipYaw: number; chestYaw: number; headYaw: number;
  arm: Record<Side, ArmPose>;
  leg: Record<Side, LegPose>;
  /** 앞에 그릴 팔/다리 (기본: 가까운 쪽) */
  front?: Partial<Record<'armR' | 'armL' | 'legR' | 'legL', boolean>>;
  bat?: null | { side: Side; angle: number; slide?: number };
  glove?: null | Side;
  mask?: 'on' | 'up' | 'hand' | null;
  helmet?: boolean;
  /** 왼쪽을 보게 그림 (거울 쌍둥이로 그린 뒤 뒤집음) */
  faceLeft?: boolean;
}
