// 엔진 입력·출력 타입 — 지울 수 있는 문법만(type·interface·문자열 유니온). enum·namespace·parameter property 금지.

export type Hand = 'R' | 'L';
export type Bats = 'R' | 'L' | 'S';
export type Pos = 'P' | 'C' | '1B' | '2B' | '3B' | 'SS' | 'LF' | 'CF' | 'RF' | 'DH';
export type PitchKey = 'FF' | 'SI' | 'FC' | 'SL' | 'SW' | 'CU' | 'CH' | 'FS' | 'KN';
export type ArmSlot = 'over' | 'threeQuarter' | 'side' | 'under';
export type Lv5 = -2 | -1 | 0 | 1 | 2;
export type PitRole = 'SP' | 'CL' | 'SU' | 'MID' | 'LONG' | 'LOOGY' | 'MOP';

/** 선수 입력 — 15 데이터 그대로(진짜 값 1~100, 소수 가능). 카드·조합 보너스는 bonus 로 따로 받는다. */
export interface PlayerIn {
  id: number;
  age: number; throws: Hand; bats: Bats;
  heightCm: number; weightKg?: number; armSlot?: ArmSlot;
  /** 45개, player.ts ATTR 순서(15 attributes 배열 순서). 값 1~100 */
  attrs: ArrayLike<number>;
  /** 포지션 숙련 1~20: P,C,1B,2B,3B,SS,LF,CF,RF,DH */
  pos: ArrayLike<number>;
  pitches?: { t: PitchKey; stuff: number; cmd: number; use: number; sig?: string }[];
  /** 숨은 13 + 날씨 6 (player.ts HID 순서), 1~20 */
  hidden?: ArrayLike<number>;
  traits?: string[];
  /** 시그니처 타격 특기 id(효과 1.5배판) */
  sigBat?: string;
  /** 능력치별 보너스 B(압축 전 점수) = 카드층 + 경기층. 길이 47: 45 능력치 + [45] 구종 위력 전부 + [46] 구종 커맨드 전부 */
  bonus?: ArrayLike<number>;
  mech?: MechBonus;
  state?: PlayerState;
  /** 이 구장 출장 수(구장 숙련) */
  parkGames?: number;
  /** 투수 역할(생성기·서버가 정함) */
  role?: 'SP' | 'RP' | 'CL';
  /** 폼 효과(15 forms: zoneSizeMult 등) */
  formFx?: Record<string, number>;
}

/** 조합의 메커니즘 효과(상한 적용 후) — 11 설계 2.4 */
export interface MechBonus {
  dpPP?: number; sbPP?: number; leadMult?: number; wpPbMult?: number; ofHoldPP?: number;
  hitRel?: number; stuffRel?: number; diveThrow?: boolean; quickStand?: boolean; wxShield?: number;
}

/** 12 상태(경기 직전 값) */
export interface PlayerState {
  cond?: -2 | -1 | 0 | 1 | 2;
  /** 야수 피로 0~100 */
  fatigue?: number;
  /** 투수 팔 피로 0~100 */
  arm?: number;
  /** 경기 감각 0~100(낮으면 녹슮) */
  sense?: number;
  conf?: number; morale?: number;
  pain?: boolean;
  /** 'hot','slump','scouted','rust','pitchGroove','pitchLost','rookieSurge','outOfPos','newArrival' … */
  flags?: string[];
  /** 어제·그제·사흘 전 투구 수 */
  b2b?: [number, number, number];
  /** 이적·승격 뒤 적응 경기 수(적응 패널티) */
  adaptGames?: number;
}

export interface LeagueRules {
  maxInnings: number;              // 11(KBO 2025~) — 끝까지 동점이면 무승부
  dh: boolean;
  zone: 'HUMAN' | 'ABS';
  shift: 'restricted' | 'free';
  pitchClock: boolean;
  heatRule: boolean;               // 폭염 쿨링브레이크
  reviews: number;                 // 비디오 판독 횟수
}

export interface GameContext {
  date: string;                    // 'YYYY-MM-DD'
  startMin: number;                // KST 분(18:30 = 1110)
  importance: 0 | 1 | 2 | 3;
  dh2?: boolean;                   // 더블헤더 2차전(9회 제한)
  runEnv?: number;                 // 리그 득점 환경 배율(기본 1.0)
  /** 원정 팬 우세·더비 등 관중 정보(12) */
  crowd?: { fan: number; derby?: boolean; weekend?: boolean; awayFans?: boolean };
}

export interface Park {
  id: string; name: string;
  /** ang −45(좌 파울선)…0(중견)…+45(우 파울선), 거리 m·높이 m */
  fence: { ang: number; dist: number; h: number }[];
  foul: number;                    // 파울 지역 배율 0.8/1.0/1.25
  roof: 'open' | 'dome'; surface: 'grass' | 'turf'; elevM: number;
  orientDeg: number;               // 홈→중견 방위(0=북, 시계)
  expoHigh: number; expoLow: number;
  drainage: 'A' | 'B' | 'C'; seaFog: boolean; wallBounce: number;
  lat: number; lon: number;
  city: string;                    // 기후 도시 id(seoul…)
}

/** 10분 칸 날씨(경기 시작 −3시간 ~ +6시간) */
export interface WxSlot {
  tC: number; rh: number; atC: number; pHpa: number;
  windMs: number; windFromDeg: number; gustMs: number;
  rainMmH: number; rainLv: 0 | 1 | 2 | 3; field: 0 | 1 | 2 | 3;
  sky: 0 | 1 | 2 | 3;              // 0 맑음 · 1 구름 조금 · 2 흐림 · 3 비
  sunAlt: number; sunAz: number; visKm: number; pm25: number;
}
export interface WxTimeline {
  t0Min: number;                   // 첫 칸 시각(KST 분)
  slots: WxSlot[];
  precheck: 'play' | 'cancelled' | 'delayedStart';
  cancelReason?: string;
  dome: boolean;
}

export interface Umpire {
  id: string; size: number; low: number; high: number; inside: number; outside: number;
  consistency: number; countBias: number; closeCall: number;
}

export interface Tactics {
  aggression: Lv5; stealFreq: Lv5; buntFreq: Lv5; hitRunFreq: Lv5; firstPitch: Lv5;
  twoStrike: 'shorten' | 'normal' | 'full'; extraBase: Lv5; ph: 'auto' | 'lateOnly' | 'never';
  infieldIn: 'auto' | 'never' | 'late' | 'always'; ofDepth: 'auto' | 'shallow' | 'normal' | 'deep';
  pickoffFreq: Lv5; ibb: 'auto' | 'never' | 'aggressive'; calling: 'balanced' | 'attack' | 'nibble';
  hookPitches: number; hookRuns: number; tto3Hook: boolean;
  closer: 'saveOnly' | 'tieHome' | 'multiInning'; matchup: boolean;
  /** 선수별 덮어쓰기(타자) */
  bat?: Record<number, { approach?: 'auto' | 'aggressive' | 'patient' | 'power' | 'contact'; steal?: 'green' | 'situational' | 'never'; bunt?: 'none' | 'sac' | 'drag' | 'both' }>;
  /** 선수별 덮어쓰기(투수) */
  pit?: Record<number, { limit?: number; mix?: Lv5; inside?: Lv5; chase?: Lv5; jam?: 'challenge' | 'auto' | 'pitchAround' }>;
}

export interface TeamIn {
  id: string; isUser?: boolean;
  players: PlayerIn[];
  lineup: { pid: number; pos: Pos }[];      // 타순 1~9
  sp: number;
  pen: { pid: number; role: PitRole; avail: 0 | 1 | 2 }[];   // 2 가능 · 1 비상시만 · 0 불가
  bench: number[];
  tac?: Partial<Tactics>;
  mgr?: { style: Lv5; level: 1 | 2 | 3 | 4 | 5 | 6 };
  /** 팀 상태(12): 분위기 15~95, 연승(+)/연패(−), 케미 단계 0~3 */
  mood?: number; streak?: number; chemTier?: number;
}

export type Command = { id?: string; team: 'home' | 'away'; at: number } & (
  | { k: 'steal'; base: 2 | 3 } | { k: 'hitRun' } | { k: 'bunt'; type: 'sac' | 'drag' | 'squeeze' }
  | { k: 'take' } | { k: 'swingAway' } | { k: 'approach'; v: 'aggressive' | 'patient' | 'power' | 'contact' | 'auto' }
  | { k: 'ibb' } | { k: 'pitchout' } | { k: 'pickoff'; base: 1 | 2 } | { k: 'visit' }
  | { k: 'infield'; v: 'normal' | 'dp' | 'in' | 'cornersIn' } | { k: 'outfield'; v: 'normal' | 'deep' | 'shallow' }
  | { k: 'pinchHit'; inPid: number } | { k: 'pinchRun'; base: 1 | 2 | 3; inPid: number }
  | { k: 'pitcher'; inPid: number } | { k: 'auto'; v: boolean });

export interface GameOpts {
  log?: boolean;            // 2D 중계 테이프 기록
  attrib?: boolean;         // 원인 표시(반사실)
  events?: boolean;         // 12 이벤트(기본 켬)
  liveHorizon?: number;     // 이 투구 번호까지만 계산(라이브)
  collector?: Collector;    // 보정·검증용 통계 훅(서비스에서는 없음)
}

export interface GameInput {
  engineVer: string; gameId: string;
  seed: [number, number, number, number];
  rules: LeagueRules; ctx: GameContext; park: Park; wx: WxTimeline; ump: Umpire;
  home: TeamIn; away: TeamIn;
  cmds?: Command[];
  opts?: GameOpts;
  /** 리그 수준 기준점 R(경기엔진.md 3.4) — 서버가 양 팀 종합 수준으로 계산해 넘긴다. 모든 선수의 능력치(성향 4개 제외)·구종 위력·커맨드에서 똑같이 뺀다. 기본 0, −20~60 */
  levelRef?: number;
}

// ───────────── 출력 ─────────────
export interface BatLine {
  pid: number; pos: string; ord: number; PA: number; AB: number; R: number; H: number; D: number; T: number; HR: number;
  RBI: number; BB: number; IBB: number; HBP: number; SO: number; SH: number; SF: number; GDP: number; SB: number; CS: number; ROE: number;
  pitches: number;
}
export interface PitLine {
  pid: number; GS: number; outs: number; BF: number; H: number; R: number; ER: number; BB: number; IBB: number; HBP: number; SO: number; HR: number;
  WP: number; BK: number; pitches: number; strikes: number; inh: number; inhScored: number; vMax: number;
  W: number; L: number; SV: number; HLD: number; BS: number; QS: number; CG: number;
}
export interface FldLine { pid: number; pos: string; PO: number; A: number; E: number; DP: number; PB: number; SBA: number; CSc: number; hardCaught: number }
export interface BoxScore {
  line: { inn: [number[], number[]]; R: [number, number]; H: [number, number]; E: [number, number]; LOB: [number, number] };
  bat: [BatLine[], BatLine[]]; pit: [PitLine[], PitLine[]]; fld: [FldLine[], FldLine[]];
  flags: string[];
}
export interface InjuryOut { pid: number; type: string; inning: number; exposure: string; days?: number }
export interface GameResult {
  status: 'final' | 'called' | 'suspended' | 'noGame' | 'tie';
  score: [number, number];          // [원정, 홈]
  innings: number; outsLastHalf: number;
  winner: 'home' | 'away' | null;
  box: BoxScore;
  /** 투수별 이 경기 투구 수(다음 날 피로·연투 계산용) */
  usage: { pid: number; pitches: number; team: 0 | 1 }[];
  injuries: InjuryOut[];
  events: { id: string; n: number }[];
  durationMin: number;
  delays: number;                   // 우천 중단 횟수
  record?: GameRecord;
  hash: number;                     // 결정성 확인용 결과 해시
  pitchesTotal: number;
}

export interface GameRecord {
  v: 1; eng: string; gid: string; seedTag: string; status: string;
  park: string; ump: string; date: string; start: number; durMin: number;
  teams: [string, string];
  dict: number[];                   // 기록 번호 → pid
  lineups: [number[], number[]];
  wx: number[]; pa: number[]; pt: number[]; bb: number[]; fd: number[]; th: number[]; rn: number[];
  ev: number[]; why: number[]; wp: number[]; hl: number[];
}

// ───────────── 보정·검증 훅(서비스에서는 쓰지 않음) ─────────────
export interface PitchEvt {
  balls: number; strikes: number; type: number; inZone: boolean; d: number; x: number; z: number;
  swing: boolean; contact: boolean; foul: boolean; inPlay: boolean; calledStrike: boolean; hbp: boolean; foulTip: boolean;
  wild: boolean; velo: number; pitchNo: number; pitcherPitches: number; isStarter: boolean; inning: number; tto: number;
  batterHand: Hand; pitcherHand: Hand; outOfZoneCalledStrike: boolean; intent: number; wp: boolean; pb: boolean; rainLv: number;
}
export interface BipEvt {
  ev: number; la: number; phi: number; kind: number; result: number; dist: number; hang: number; catchProb: number;
  fielder: number; pulled: number; tempC: number; windOut: number; park: string; rainLv: number; bunt: boolean;
  batterHand: Hand; hrDist: number; fenceDist: number; wall: boolean; error: boolean;
}
export interface PaEvt {
  result: number; batter: number; pitcher: number; bHand: Hand; pHand: Hand; outsBefore: number; basesBefore: number;
  runs: number; rbi: number; pitches: number; balls: number; strikes: number; countsSeen: number;
  tto: number; isStarter: boolean; inning: number; half: number; homeBatting: boolean; li: number;
  tempC: number; rainLv: number; dayClear: boolean; windOut: number; batterPlatoonAdv: boolean; scoreDiff: number;
  ibb: boolean; sh: boolean; sf: boolean; gdp: boolean; roe: boolean; foulOut?: boolean;
  /** 타석 미완료(타석 중 주루사로 이닝 끝·타석 중 끝내기) — 타석 수에 넣지 않는다 */
  incomplete?: boolean;
}
export interface RunEvt { kind: string; outs: number; field: number; result: number }
export interface StealEvt { base: number; success: boolean; combinedTime: number; pickoff: boolean }
export interface GameEvt { res: GameResult; input: GameInput; starterIP: [number, number]; starterPitches: [number, number]; relievers: [number, number]; extra: boolean; tempC: number; dayClear: boolean; rain: boolean }
export interface Collector {
  pitch?(e: PitchEvt): void;
  bip?(e: BipEvt): void;
  pa?(e: PaEvt): void;
  run?(e: RunEvt): void;
  steal?(e: StealEvt): void;
  game?(e: GameEvt): void;
  reliever?(e: { outs: number; pitches: number; role: string }): void;
  starter?(e: { outs: number; pitches: number; runs: number; er: number; tto3: boolean }): void;
  velo?(e: { pitcherPitches: number; inning: number; velo: number; isStarter: boolean; fast: boolean }): void;
  event?(id: string): void;
}
