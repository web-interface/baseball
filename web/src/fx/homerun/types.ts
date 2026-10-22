// 홈런 연출 — 입력 정보와 옵션 (경기 화면이 채워서 넘긴다). 자세한 연결법은 README.md.

/** 타구 방향 — 좌월 · 중월 · 우월 */
export type HrDir = 'left' | 'center' | 'right';

/**
 * 점수 흐름 — 이 홈런으로
 *  reverse  역전 (지고 있다가 앞섬)
 *  tie      동점 (지고 있다가 같아짐)
 *  go-ahead 앞서감 (비기다가 앞섬)
 */
export type HrLead = 'reverse' | 'tie' | 'go-ahead';

/** 구단 색 — game/types 의 TeamColors(team.colors)를 그대로 넘겨도 된다 */
export interface HrTeam {
  primary: string;
  secondary?: string;
  accent?: string;
  /** primary 위 글자색 */
  ink?: string;
}

export interface HomerunInfo {
  /** 플레이 id 등 — 시드에 들어간다. 같은 홈런을 다시 보여 줄 땐 같은 값 */
  id?: string;
  /** 홈런 전 주자 수 — 0 솔로 · 1 투런 · 2 스리런 · 3 만루(그랜드슬램) */
  runners: 0 | 1 | 2 | 3;
  /** 끝내기 */
  walkoff?: boolean;
  /** 역전 · 동점 · 앞서감 (없으면 평범한 점수) */
  lead?: HrLead | null;
  /** 비거리 (m) */
  distM?: number;
  /** 방향 — 좌·중·우 */
  dir?: HrDir;
  /** 더 고운 방향 (엔진 hit.angle: −45 3루 선 · 0 중견 · +45 1루 선). 있으면 dir 대신 쓴다 */
  angle?: number;
  /** 장외 (구장 밖으로) */
  outOfPark?: boolean;
  /** 연속 타자 홈런 — 이 홈런이 몇 번째인가 (2 = 백투백, 3 = 백투백투백) */
  streak?: number;
  /** 선두타자 홈런 — true 이닝 첫 타자 · 'game' 경기 첫 타자 */
  leadoff?: boolean | 'game';
  /** 대타 */
  pinch?: boolean;
  /** 시즌 n호 (10·20·30… 이면 이정표로 친다) */
  seasonNo?: number;
  /** 이정표 글 — '통산 100호' · '팀 첫 홈런' (있으면 금빛 마무리) */
  milestone?: string;
  /** 타자 이름 */
  batter?: string;
  /** 타자 구단 색 */
  team?: HrTeam;
  /** 홈 팀 홈런인가 (기본 true). 원정 홈런은 구장 바닥 불꽃(분수·마인) 없이 조금 작게 */
  home?: boolean;
  /** 내 구단 홈런인가 (기본 true) — classic 테마는 내 구단 별색만 쓰므로, 남의 홈런은 먹 한 색 */
  mine?: boolean;
  /** 이닝 — 작은 줄 '9회말 · 2사' */
  inning?: number;
  half?: 'top' | 'bot';
  outs?: 0 | 1 | 2;
}

/** short = 빨리 보기 (0.8~1.2초) · long = 주요 장면·이닝별·자세히 (2~4초, 만루면 세리머니 +3초) */
export type HrLength = 'short' | 'long';

export type HrTheme = 'night' | 'broadcast' | 'classic';

export interface HomerunFxOptions {
  /** 기본 'long' */
  length?: HrLength;
  /** 만루 홈런 세리머니 (long 에서만, 기본 true) */
  ceremony?: boolean;
  /** 화면을 누르거나 Esc · '건너뛰기' 로 끝내기 (기본 true) */
  skippable?: boolean;
  /** 흔들 요소 — true(기본) 면 연출을 덮은 요소(경기장), false 면 흔들지 않음 */
  shake?: boolean | HTMLElement;
  /** 기본: 가장 가까운 [data-theme] */
  theme?: HrTheme;
  /** 움직임 줄이기 — 기본: 기기 설정(prefers-reduced-motion) */
  reducedMotion?: boolean;
  /** 다 보여 준 뒤 (건너뛰어도 한 번 불린다) */
  onDone?: () => void;
  /** 처음에 멈춘 채로 (미리보기·스크린샷용) */
  paused?: boolean;
}

export interface HomerunFxHandle {
  /** 끝나면(건너뛰기 포함) 풀린다 */
  done: Promise<void>;
  /** 세리머니 그림까지 다 불러오면 풀린다 */
  ready: Promise<void>;
  /** 전체 길이 (ms, 세리머니 포함) */
  duration: number;
  skip(): void;
  /** 바로 정리 (onDone 은 부르지 않음) — 화면을 떠날 때 */
  stop(): void;
  pause(): void;
  resume(): void;
  /** ms 시점으로 (멈춘 상태면 그 장면을 그린다) */
  seek(ms: number): void;
}
