// 게임 데이터 타입 — 지금은 목업(mock.ts)이 채우고, 다음 단계에서 서버·엔진이 같은 모양으로 채운다.
// 능력치 눈금은 엔진 기준(15_player_schema.json)을 따른다: 진짜 값 1~100, 카드 표시 1~99, 상세 FM 1~20, 숨은 값 1~20.

/* ───────── 기본 ───────── */
export type Pos = 'P' | 'C' | '1B' | '2B' | '3B' | 'SS' | 'LF' | 'CF' | 'RF' | 'DH';
export type FieldPos = Exclude<Pos, 'P' | 'DH'>;
export type PitcherRole = 'SP' | 'RP' | 'CL';
export type Hand = 'R' | 'L';
export type BatSide = 'R' | 'L' | 'S';
/** 외모 분포 묶음 (캐릭터 생성기와 같은 값) */
export type Origin = 'KR' | 'JP' | 'TW' | 'US' | 'USB' | 'LATAM' | 'AU';

/* ───────── 구단 (세계관 04_world.json · 요구사항 34번 확정 이름) ───────── */
/** 현재 구단 10 (2027 한별 리그) */
export type CurrentClubCode = 'DJ' | 'GJ' | 'DG' | 'BS' | 'SB' | 'ST' | 'SH' | 'IC' | 'CW' | 'SW';
/** 옛 구단 10 — 동대문 곰스 · 무등 호랑이즈 · 한밭 독수리스 · 서울 청룡스 · 인천 슈퍼별즈 · 인천 조랑말스 · 인천 돌고래스 · 수원 일각수스 · 전주 돌격대스 · 인천 비룡스 */
export type OldClubCode = 'DDG' | 'MDH' | 'HBE' | 'SCR' | 'ISB' | 'IJR' | 'IDR' | 'SUC' | 'JDR' | 'IBY';
export type ClubCode = CurrentClubCode | OldClubCode;

export interface TeamColors {
  /** 주색 (모자·띠·엠블럼 바탕) */
  primary: string;
  /** 보조색 */
  secondary: string;
  /** 강조색 (작은 줄·글자) */
  accent: string;
  /** primary 위에 올릴 글자색 */
  ink: string;
}

export interface Stadium {
  name: string;
  /** 한 줄 소개 */
  desc: string;
  /** 담장 거리 m (좌·중·우) */
  fence: [number, number, number];
  /** 담장 높이 m (좌·중·우) — 대전 우측 7m '갑천 벽' 같은 구장 특색 */
  wallM: [number, number, number];
  roof: 'open' | 'dome';
  surface: 'natural' | 'turf';
  /** 파울 지역 넓이 */
  foul: 'narrow' | 'normal' | 'wide';
  wind: string;
  climate: string;
  /** 구장 효과 한 줄 (엔진이 실제로 반영) */
  note: string;
  /** 외야 너머 풍경 — 2D 경기장 배경 */
  backdrop: 'sea' | 'river' | 'city' | 'mountain' | 'fortress' | 'none';
}

export interface Team {
  /** 'dj' (코드 소문자) */
  id: string;
  code: ClubCode;
  region: string;        // '대전'
  /** 짧은 이름 — 점수판처럼 좁은 곳 */
  short: string;         // '독수리스'
  /** 정식 이름 — 화면 기본 */
  name: string;          // '대전 독수리스'
  /** 점수판 두 글자 영문 = code */
  abbr: string;          // 'DJ'
  /** 모자 글자 */
  cap: string;
  /** 유니폼 가슴 글자 (로마자 지역명 — 캐릭터 생성기가 씀) */
  wordmark: string;
  /** 원정 유니폼 바탕 · 줄무늬 */
  uniform?: { awayBase: 'primary' | 'gray'; pinstripe?: boolean };
  colors: TeamColors;
  /** 색 이름 (설명용) */
  colorNames: { primary: string; secondary: string; accent: string };
  emblem: ClubCode;
  stadium: Stadium;
  /** 권역 (팀컬러 조합 태그) */
  zone: '한강 권역' | '중부·호남 권역' | '낙동 권역';
  /** 구단 성향 한 줄 */
  style: string;
  styleKey: string;
  styleDesc: string;
  tier: '강' | '중' | '약';
  /** 시작 난이도 1(쉬움)~5(어려움) — 전력(tier)으로 정함 */
  difficulty: 1 | 2 | 3 | 4 | 5;
  founded: number;
  /** 우승 연도 */
  titles: number[];
  rival: ClubCode;
  rivalry: string;
  mascot: string;
  /** 구단 소개 한 줄 */
  blurb: string;
  /** 그 이름으로 뛴 해 [첫 해, 끝 해] — 현재 구단은 끝 해 2027 */
  era?: [number, number];
  /** 옛 구단 (없어진 구단 · 지금 이름이 되기 전 시대) */
  old?: boolean;
  /** 옛 구단을 시작 구단으로 고르면 2027 리그에서 대신 들어가는 현재 구단 자리 */
  revives?: ClubCode;
  /** 2027 리그에서 부활 구단으로 뛰는 중 */
  revived?: boolean;
  /** 연고 이력 (옮긴 구단만 둘 이상) */
  homes?: { from: number; to: number; region: string }[];
}

/* ───────── 선수 ───────── */
export type BatAttr =
  | 'contactR' | 'contactL' | 'power' | 'gap' | 'eye' | 'avoidK' | 'vsFast' | 'vsBreak' | 'bunt'
  | 'speed' | 'baserunning' | 'stealJump' | 'sliding'
  | 'range' | 'firstStep' | 'hands' | 'armStr' | 'armAcc' | 'turnDP'
  | 'block' | 'framing' | 'popTime' | 'pitcherLead';
export type PitchAttr =
  | 'velocity' | 'control' | 'deception' | 'extension' | 'stamina' | 'recovery' | 'pickoff' | 'slideStep' | 'pFielding';
export type MentalAttr = 'composure' | 'concentration' | 'competitiveness' | 'leadership' | 'teamwork' | 'baseballIQ';
export type PhysAttr = 'durability' | 'agility' | 'strength';
export type TendAttr = 'pullTend' | 'launchTend' | 'swingTend' | 'gbTend';
export type AttrKey = BatAttr | PitchAttr | MentalAttr | PhysAttr | TendAttr;

/** 능력치 이름 (한국어) — 상세 화면 표 */
export type AttrMap = Partial<Record<AttrKey, number>>;

export type PitchType = 'FF' | 'SI' | 'FC' | 'SL' | 'SW' | 'CU' | 'CH' | 'FS' | 'KN';

export interface Pitch {
  type: PitchType;
  ko: string;           // '슬라이더'
  /** 위력 1~100 */
  stuff: number;
  /** 제구 1~100 */
  command: number;
  /** 구사율 0~1 */
  usage: number;
  /** 평균 구속 km/h */
  kmh: number;
}

/** 레어 이상 투수의 고유 구종 */
export interface SignaturePitch {
  /** '도빈 체인지업' · '폭포수 커브' */
  name: string;
  base: PitchType;
  /** initials = 이름 약자형, alias = 유명 구질 별칭형 */
  style: 'initials' | 'alias';
  /** 엔진 효과 한 줄 */
  effect: string;
  /** 2D 중계 궤적·배지 색 */
  color: string;
}

/** 날씨 체질 (엔진 스키마 wxHeat·wxCold·wxRain·wxDay) */
export type WeatherKey = 'heat' | 'cold' | 'rain' | 'day';

export interface BattingLine {
  g: number; pa: number; ab: number; h: number; d2: number; d3: number; hr: number; rbi: number; r: number;
  sb: number; bb: number; so: number;
  avg: number; obp: number; slg: number; ops: number;
}
export interface PitchingLine {
  g: number; gs: number; w: number; l: number; sv: number; hld: number;
  /** 이닝 (6.2 = 6과 2/3) */
  ip: number;
  h: number; hr: number; bb: number; so: number;
  era: number; whip: number;
}

export interface Player {
  id: string;
  name: string;
  /** 영문 이름 (카드 아랫단) — 없으면 카드가 한글에서 만든다 */
  nameEn?: string;
  teamId: string;
  number: number;
  pos: Pos;
  /** 투수 보직 */
  role?: PitcherRole;
  /** 볼 수 있는 다른 포지션 */
  subPos?: Pos[];
  bats: BatSide;
  throws: Hand;
  age: number;
  heightCm: number;
  weightKg: number;
  origin: Origin;
  /** 가상 입단 연도 (조합 태그) */
  draftYear: number;
  /** 그 구단에서 뛴 해 [첫 해, 끝 해] — 옛 시즌 카드 선수(레전드 활약 기간 표시) */
  career?: [number, number];

  /** 종합 (카드 기본, 강화·레벨 전) */
  ovr: number;
  /** 카드 앞면 대표 6개 — code: CON POW EYE SPD DEF ARM / BLK FRM CS / VEL STF BRK CTL STA MNT REC */
  face: { code: string; ko: string; v: number }[];
  /** FM 식 상세 능력치 (1~100) */
  attrs: AttrMap;
  /** 투수 구종 */
  pitches?: Pitch[];
  /** 잠재력 별 (0.5 단위, 스카우트 추정) */
  potential: number;
  /** 특성 */
  traits: string[];
  /** 성격 */
  personality: string;
  /** 밝혀진 날씨 체질 −2~+2 */
  weather: Partial<Record<WeatherKey, number>>;
  /** 타격 폼 / 투구 폼 이름 (엔진 효과 있음) */
  form: { bat?: string; pitch?: string };
  /** 외모 시드 — 그림이 매번 같게 */
  look: string;
  /** 2027 시즌 기록 */
  season: { bat?: BattingLine; pit?: PitchingLine };
  /** 컨디션 1(최악)~5(최고) */
  condition: 1 | 2 | 3 | 4 | 5;
  /** 피로 0~100 */
  fatigue: number;
  /** 부상 중이면 설명 */
  injury?: string;
  /** 실제 선수 카탈로그(game/kbo)에서 만든 보기 — 선수 ID · 능력치를 가져온 시즌 (season 은 그 해 실제 기록) */
  real?: { kid: string; year: number };
}

/* ───────── 카드 ───────── */
/** 사용자 지정 등급 11종 (이름 그대로) */
export type GradeId =
  | 'normal' | 'special' | 'rare' | 'elite'          // 시즌 성적 ('27 연도 표시)
  | 'legend' | 'franchise' | 'black' | 'signature'   // 상징성·누적
  | 'mvp' | 'gg' | 'th'                               // 특별 (수상)
  | 'unique';                                         // 특별 선수 (요구사항 29번 — 단 하나의 테두리)

export interface GradeInfo {
  id: GradeId;
  ko: string;          // '레어'
  short: string;       // 'R'
  kind: 'season' | 'icon' | 'award' | 'unique';
  /** 능력치 서열 (클수록 높음) — 시그니처 > 블랙 > 프랜차이즈 > 엘리트 > 레전드 > 레어 > 스페셜 > 노멀, 특별 등급은 엘리트 급 */
  rank: number;
  /** 연도가 붙는 등급 ('27) */
  yearTagged: boolean;
  /** 최대 레벨 */
  levelMax: number;
  /** 테두리 연출 설명 (카드 디자이너용) */
  frame: string;
}

export interface CardInst {
  id: string;
  playerId: string;
  grade: GradeId;
  /** 시즌 등급·수상 연도 (2자리, 예: 27) */
  year?: number;
  /** 레벨 8.99 = 8레벨 99% */
  level: number;
  /** 강화 0~10 (I~X) */
  enhance: number;
  signaturePitch?: SignaturePitch;
  /** 수상 내용 (TH: '홈런왕', GG: '우익수') */
  award?: string;
  /** 같은 카드 남은 장수 (강화·각성 재료) */
  dup: number;
  isNew?: boolean;
  locked?: boolean;
  /** 이 카드의 종합 (같은 선수라도 등급·연도마다 다르다) — 없으면 선수 ovr */
  ovr?: number;
  /** 일련번호 (한정 등급) — 서버가 뽑는 순간 매긴다. null = 번호 없음 */
  serial?: { no: number; of: number; match: boolean } | null;
  /** 낀 장비 — 모양은 cards/gear.ts 의 GearPiece */
  gear?: { slot: string; name: string; grade: string; plus: number; set?: string }[];
}

/* ───────── 라인업 · 조합 ───────── */
export interface LineupSlot {
  order: number;        // 1~9
  pos: Exclude<Pos, 'P'>;
  cardId: string;
}

export interface Lineup {
  name: string;
  batting: LineupSlot[];
  sp: string;            // cardId
  rotation: string[];    // 선발 로테이션 cardId
  bullpen: string[];
  closer: string;
  bench: string[];
}

export interface TeamColorSet {
  id: string;
  /** 세계관 teamColorHooks: 같은 구단 · 같은 권역 · 같은 카드 연도 · 같은 황금기 · 라이벌 섞기 */
  kind: 'club' | 'zone' | 'season' | 'era' | 'rival';
  label: string;             // '대전 독수리스'
  have: number;
  need: number;
  /** 단계 — at 명 이상이면 bonus */
  steps: { at: number; bonus: string }[];
  /** 지금 받는 보너스 */
  current?: string;
}

export interface ChemLink {
  a: Exclude<Pos, 'P'> | 'P';
  b: Exclude<Pos, 'P'> | 'P';
  /** 0 끊김 · 1~3 단 */
  level: 0 | 1 | 2 | 3;
  reason: string;
}

export interface LineupEval {
  overall: number;     // 팀 종합 (지금)
  base: number;        // 조합 전
  potential: number;   // 폭발하면
  parts: { k: string; ko: string; v: number }[];  // 타격·수비·투수·주루
  teamColors: TeamColorSet[];
  chem: ChemLink[];
  explosion: { ready: boolean; remain: number; label: string; bonus: string; hint: string };
}

/* ───────── 날씨 ───────── */
export type Sky = 'clear' | 'cloudy' | 'overcast' | 'drizzle' | 'rain' | 'night-clear';

export interface Weather {
  city: string;
  sky: Sky;
  skyKo: string;
  tempC: number;
  humidity: number;      // %
  windMps: number;
  /** 바람이 부는 방향 (경기장 기준) */
  windTo: 'out-lf' | 'out-cf' | 'out-rf' | 'in-lf' | 'in-cf' | 'in-rf' | 'cross-l' | 'cross-r' | 'calm';
  windKo: string;        // '좌측 담장 쪽으로'
  rainPct: number;
  dust: '좋음' | '보통' | '나쁨' | '매우 나쁨';
  /** 엔진이 계산한 영향 (작게 표시) */
  effects: string[];
}

/* ───────── 경기 기록 ───────── */
export type HalfInning = 'top' | 'bot';

export type CauseFactor =
  | 'wind' | 'weather' | 'fatigue' | 'adapt' | 'platoon' | 'signature' | 'form' | 'hidden'
  | 'affinity' | 'chem' | 'teamcolor' | 'explosion' | 'gear' | 'enhance' | 'park' | 'range';

/** 원인 표시 — "↳ 바람 +6m" (한 장면 최대 2개) */
export interface Cause {
  factor: CauseFactor;
  text: string;
  /** 이 요인이 없었다면 결과가 달랐음 */
  decisive?: boolean;
}

/** 강조 장면 종류 — 화면 강조 문구(Callout) 와 같은 값 */
export type HighlightKind = 'defense' | 'clutch' | 'go-ahead' | 'comeback' | 'walkoff' | 'escape' | 'record';

export interface Play {
  id: string;
  inning: number;
  half: HalfInning;
  outsBefore: 0 | 1 | 2;
  /** 주자 [1루,2루,3루] (playerId 또는 null) — 플레이 전 */
  basesBefore: [string | null, string | null, string | null];
  batterId: string;
  pitcherId: string;
  /** 볼카운트 (결과 직전) */
  count: { b: number; s: number };
  pitches: number;
  /** 결과 코드 */
  code: '1B' | '2B' | '3B' | 'HR' | 'BB' | 'HBP' | 'K' | 'GO' | 'FO' | 'LO' | 'DP' | 'SF' | 'SAC' | 'E' | 'FC' | 'SB' | 'CS';
  /** 문자 중계 한 줄 */
  text: string;
  /** 수비 기록 (6-4-3) */
  notation?: string;
  rbi: number;
  /** 플레이 뒤 점수 [원정, 홈] */
  score: [number, number];
  outsAfter: number;
  /**
   * 타구 — angle: 0 = 중견수 쪽, −45 = 3루 선, +45 = 1루 선 / distM: 낙구(또는 멈춘) 거리
   * x·y: 위에서 본 경기장 좌표 (game/field.ts) — 홈 (0.5, 1), 좌·우 폴 (0, 0.5)·(1, 0.5), 1 = 140m
   */
  hit?: { x: number; y: number; kind: 'ground' | 'line' | 'fly' | 'pop'; kmh: number; distM: number; angle: number };
  /** 마지막 공 */
  lastPitch?: { type: PitchType | 'SIG'; name: string; kmh: number; zone: [number, number] };
  causes?: Cause[];
  /**
   * 수비 범위 (요구사항 30번) — 타구가 나는 동안 야수마다 '닿을 수 있는 원'이 커진다.
   * 반지름(m) ≈ mps × (t − reactS), t 는 0 ~ hangS. 공이 원 안에 떨어지면 잡을 수 있는 공.
   */
  defense?: {
    hangS: number;
    /** 잡을 확률 (엔진) */
    catchProb: number;
    fielders: { pos: Exclude<Pos, 'DH'>; playerId: string; from: { x: number; y: number }; reactS: number; mps: number; arriveS?: number; dive?: boolean }[];
  };
  /** 승리 확률(홈 기준 0~1) 플레이 전·후 */
  wp: [number, number];
  highlight?: {
    kind: HighlightKind;
    title: string;     // '호수비!'
    sub: string;       // '연이준 · 다이빙 캐치'
    meta?: string;     // '잡을 확률 18%'
    /** 띠 색을 낼 구단 */
    teamId: string;
  };
}

export interface LineScore {
  /** 회마다 점수 (안 한 회는 null, 끝내기 회는 x 대신 실제 점수) */
  innings: (number | null)[];
  r: number; h: number; e: number; b: number;
}

export interface MatchRecord {
  id: string;
  date: string;          // '2027-06-14'
  time: string;          // '18:30'
  stadium: string;
  awayId: string;
  homeId: string;
  weather: Weather;
  line: { away: LineScore; home: LineScore };
  final: [number, number];
  walkoff: boolean;
  /** 결승타·승리 투수 등 */
  decision: { win: string; loss: string; save?: string; gwrbi?: string };
  starters: { away: string; home: string };
  plays: Play[];
  /** 오늘의 결정적 요인 */
  keyFactors: Cause[];
  /** 관중 */
  attendance: number;
  duration: string;      // '3:12'
}

/* ───────── 랭킹 · 대전 ───────── */
export interface StandingRow {
  teamId: string;
  w: number; d: number; l: number;
  pct: number;
  gb: number;
  streak: string;        // '3승'
  last10: string;        // 'WWLWDWWLWW'
}

export interface UserRankRow {
  rank: number;
  user: string;          // 가입자 이름 (가상)
  teamId: string;
  rating: number;
  delta: number;         // 지난주 대비
  w: number; d: number; l: number;
  /** 구단 선수 점수 합계 (전력) */
  power: number;
  /** 수집 점수 */
  collection: number;
  me?: boolean;
}

export interface PvpOpponent {
  id: string;
  user: string;
  teamId: string;
  rating: number;
  power: number;
  lineupOvr: number;
  record: { w: number; d: number; l: number };
  recent: ('W' | 'D' | 'L')[];
  /** 내게 진 적 있는 상대 / 나를 이긴 상대 */
  rival?: 'revenge' | 'rival';
  reward: number;        // GP
  /** 대표 선수 cardId */
  ace: string;
}

/* ───────── 뽑기 · 상점 ───────── */
export interface PackOdds { grade: GradeId; pct: number }

export interface Pack {
  id: string;
  name: string;           // '프리미엄팩'
  desc: string;
  /** 한 묶음 장수 — 모든 팩 30장 (요구사항 39번) */
  size: number;
  price: { gp?: number; ball?: number };
  odds: PackOdds[];
  /** 천장 — 이 팩을 n 번 사면 guaranteed 확정 (팩 종류별 따로) */
  pity: { count: number; max: number; guaranteed: string };
  /** 골라 뽑기 (요구사항 40번) — year: 연도만 고름(그 해 있던 모든 구단) · club: 구단만 고름(그 구단이 있던 모든 연도). 둘 다 고정하는 팩은 없다 */
  pick?: { kind: 'year'; options: number[] } | { kind: 'club'; options: ClubCode[] };
  /** 같은 등급 기본 팩 대비 가격 배율 */
  priceMul?: number;
  limited?: string;
}

/** 카드 조합(룰렛) — 안 쓰는 카드 넣고 돌려 새 카드 1장. 칸 크기 = 실제 확률 */
export interface Roulette {
  /** 넣는 장수 */
  input: number;
  /** 넣는 카드 등급 */
  grade: GradeId;
  slots: { label: string; grade: GradeId; pct: number }[];
}

export interface ShopItem {
  id: string;
  cardId: string;
  price: { gp?: number; ball?: number };
  /** 시세 대비 */
  valueTag?: '시세보다 싸요' | '오늘만' | '잘 안 나와요';
  /** 스카우트 한마디 (Claude 가 말맛만) */
  scoutNote: string;
  soldOut?: boolean;
}

export interface ScoutShop {
  refreshAt: string;          // '내일 05:00'
  dailyLimit: number;         // 하루 살 수 있는 인원
  bought: number;
  scout: { name: string; line: string };
  items: ShopItem[];
}

/* ───────── 나 ───────── */
export interface Me {
  user: string;
  teamId: string;
  managerName: string;
  season: number;
  /** GP — 처음 10시즌은 거의 무한(1조), 11시즌부터 정상 경제 */
  gp: number;
  /** 골든볼 — 처음 10시즌 1억 */
  ball: number;
  /** 내 구단이 치르는 몇 번째 시즌 */
  seasonNo: number;
  /** 이 시즌까지 무한 자금 (8시즌부터 '자금 정리' 예고) */
  richUntil: number;
  rating: number;
  ratingDelta: number;
  record: { w: number; d: number; l: number };
  rank: number;
  collection: { have: number; total: number };
  /** 오늘 남은 대전 */
  pvpLeft: number;
}

export interface NextGame {
  opponentId: string;
  home: boolean;
  date: string;
  time: string;
  stadium: string;
  weather: Weather;
  probable: { mine: string; theirs: string };  // cardId / playerId
  /** 승리 확률 예상 */
  wpPreview: number;
}

export interface NewsItem {
  kind: '부상' | '슬럼프' | '불방망이' | '기록' | '이적' | '구단';
  text: string;
  when: string;
  playerId?: string;
}
