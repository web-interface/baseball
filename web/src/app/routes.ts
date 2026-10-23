// 경로 표 — 새 화면은 여기 한 줄 + src/screens/<이름>/index.tsx 하나로 끝난다 (README-ui.md 참고)
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { ScreenProps } from './screen';

export interface RouteDef {
  key: string;
  /** '#/player/:id' 의 '/player/:id' */
  path: string;
  /** 헤더 제목 */
  title: string;
  /** 위쪽 가로 메뉴 이름 — 있으면 메뉴에 나온다 (순서 = 이 표 순서) */
  menu?: string;
  /** 미리보기 목록 설명 */
  desc: string;
  /** 경로 변수가 있을 때 미리보기에서 열 예시 */
  sample?: string;
  /** 뒤로 버튼 — 앱 밖에서 바로 들어왔을 때 갈 곳 */
  back?: string;
  /** full = 헤더 + 메뉴 · bare = 헤더만 (몰입 화면·하위 화면) */
  chrome?: 'full' | 'bare';
  /** 넓은 화면에서 본문을 넓게 */
  wide?: boolean;
  /** 맡은 사람 (README 의 파일 소유) */
  owner: string;
  load: () => Promise<{ default: ComponentType<ScreenProps> }>;
}

export const ROUTES: RouteDef[] = [
  { key: 'home', path: '/home', title: '홈', menu: '홈', owner: '홈 화면 개발자', desc: '다음 경기 · 날씨 · 구단 소식 · 바로가기', load: () => import('../screens/home') },
  { key: 'lineup', path: '/lineup', title: '라인업', menu: '라인업', owner: '라인업 화면 개발자', desc: '경기장 위 카드 배치 · 세트덱 진행 · 케미 선 · 왕조(능력치 폭발) · 팀 종합 게이지 · 선수 정보 시트', load: () => import('../screens/lineup') },
  { key: 'sets', path: '/sets', title: '세트덱', menu: '세트덱', owner: '라인업 화면 개발자', desc: '세트 종류별 조건 · 단계별 효과 표 · 내 엔트리 진행 · 모을 카드 · 구단·연도 조합별 효과', load: () => import('../screens/sets') },
  { key: 'schedule', path: '/schedule', title: '시즌 일정', menu: '시즌 일정', owner: '경기 운영 개발자', desc: '월별 달력(우리 경기 · 결과 · 시작 시각 · 날씨 · 휴식 · 취소) · 전체 일정(날짜별 · 우리 경기/모든 경기) · ?view=list · ?m=6 · ?all=1', load: () => import('../screens/schedule') },
  { key: 'season', path: '/season', title: '경기 준비·진행', menu: '경기 준비·진행', owner: '경기 화면 개발자', desc: '경기 운영의 가운데 — 다음 경기 · AI 뉴스 · 감독 인터뷰 · 라인업 점검 · 경기 시작 · 결과 · 남은 시즌 빨리 감기 · 포스트시즌 판', load: () => import('../screens/season') },
  { key: 'league', path: '/league', title: '순위·리그 기록', menu: '순위·리그 기록', owner: '경기 운영 개발자', desc: '팀 순위(경기 · 승무패 · 승률 · 게임차 · 연속 · 최근10 · 득실) · 순위 경쟁 그래프 · 포스트시즌 요약 · 개인 기록 TOP 10(타자 · 투수, 규정타석 · 규정이닝) · ?tab=pit&cat=era', load: () => import('../screens/league') },
  { key: 'games', path: '/games', title: '경기 기록', menu: '경기 기록', owner: '경기 운영 개발자', desc: '지난 경기 목록(우리 경기/모든 경기 · 달별 · 포스트시즌) · ?g=<경기 키> 박스스코어(이닝 점수 · 타자 · 투수 · 홈런 · 결승타)', load: () => import('../screens/games') },
  { key: 'match', path: '/match', title: '경기', owner: '경기 화면 개발자', desc: '빨리 보기(10초) · 주요 장면 · 이닝별 · 자세히(2D) · 강조 문구 · 원인 표시 · ?g=season 지금 바로 경기(엔진) · ?pvp=<id> 대전 다시 보기', load: () => import('../screens/match') },
  { key: 'cards', path: '/cards', title: '카드', menu: '카드', owner: '카드 화면 개발자', desc: '보관함 · 등급 11종 · 강화 I~X · 레벨 · 도감', load: () => import('../screens/cards') },
  { key: 'combine', path: '/combine', title: '선수조합', owner: '선수조합 개발자', desc: '선수조합 — 카드 3~5장으로 새 카드 1장 · 조합 공식(같은 구단 · 연도 · 포지션 · 짝)에 따라 상위 등급 · 마구마구식 조합 룰렛', load: () => import('../screens/combine') },
  { key: 'enhance', path: '/enhance', title: '훈련', owner: '카드 화면 개발자', desc: '훈련 — 카드 한 장 · 능력치 하나씩 골라 훈련(단계 0~10, 5부터 카드 불빛 · 10 최종) · 장소 13곳 · 특수구질 훈련 · ?card=<카드 id> (같은 카드 강화 I~X 목록은 #/cards?mode=enhance)', load: () => import('../screens/train') },
  { key: 'gacha', path: '/gacha', title: '카드구매', menu: '카드구매', owner: '뽑기 화면 개발자', desc: '스카우트(카드 뽑기) · 확률 공개 · 천장 · 레전드 이펙트', load: () => import('../screens/gacha') },
  { key: 'shop', path: '/shop', title: '스카우터', menu: '스카우터', owner: '상점 화면 개발자', desc: 'AI 스카우트가 매일 진열 · 하루 살 수 있는 인원 제한', load: () => import('../screens/shop') },
  { key: 'pvp', path: '/pvp', title: '대전', menu: '대전', owner: '대전 화면 개발자', desc: '다른 감독 구단과 혼자 대결(상대 접속 필요 없음) · AI 구단 연습 · 레이팅 · 내 기록', load: () => import('../screens/pvp') },
  { key: 'rank', path: '/rank', title: '순위', menu: '순위', owner: '대전 화면 개발자', desc: '감독 순위(레이팅 · 승률 · 구단 전력, 실제 가입자) · 구단 순위는 순위·리그 기록(#/league)', load: () => import('../screens/rank') },
  { key: 'chat', path: '/chat', title: '로비 채팅', back: '/home', chrome: 'bare', owner: '채팅 개발자', desc: '로비 실시간 채팅 · 대화는 5분 뒤 사라짐 · 신고 · 이 감독 숨기기 · ?demo=1 예시', load: () => import('../screens/chat') },
  { key: 'player', path: '/player/:id', title: '선수 정보', sample: '/player/p03', back: '/cards', chrome: 'bare', owner: '선수 화면 개발자', desc: 'FM 식 상세 능력치 · 고유 구종 · 시즌 기록 · 폼 · 날씨 체질', load: () => import('../screens/player') },
  { key: 'club-select', path: '/club-select', title: '구단 선택', back: '/home', chrome: 'bare', owner: '구단 선택 화면 개발자', desc: '2027 시즌을 함께할 구단 고르기 · 엠블럼·연고·구장·난이도', load: () => import('../screens/club-select') },
  { key: 'settings', path: '/settings', title: '설정', back: '/home', chrome: 'bare', owner: '설정 화면 개발자', desc: '테마 · 경기 보기 방식 · 소리 · 로그아웃', load: () => import('../screens/settings') },
  { key: 'fx', path: '/fx', title: '홈런 연출', back: '/preview', chrome: 'bare', owner: '연출 개발자', desc: '홈런 폭죽 · 큰 글자 · 만루 세리머니 — 종류 17가지 재생 · ?play=grandslam&t=900 (src/fx/homerun)', load: () => import('../fx/homerun/FxLab') },
];

/** 위쪽 메뉴 — 큰 묶음 5개, 묶음 안 화면은 아래 작은 탭. 기존 경로(#/lineup 등)는 그대로 쓴다 */
export interface MenuGroup {
  key: string;
  label: string;
  items: { route: string; label: string }[];
  /** 큰 메뉴를 누르면 갈 화면 (없으면 첫 작은 탭) */
  landing?: string;
  /** 작은 탭은 아니지만 이 묶음에 속하는 화면 → 그때 밝힐 작은 탭 (예: 경기 화면 #/match → 경기 준비·진행) */
  members?: Record<string, string>;
}
export const GROUPS: MenuGroup[] = [
  { key: 'home', label: '홈', items: [{ route: 'home', label: '홈' }] },
  { key: 'team', label: '팀관리', items: [
    { route: 'lineup', label: '라인업' }, { route: 'cards', label: '선수보관' }, { route: 'combine', label: '선수조합' }, { route: 'sets', label: '세트덱' }, { route: 'enhance', label: '훈련' },
  ] },
  { key: 'play', label: '경기 운영', landing: 'season', items: [
    { route: 'schedule', label: '시즌 일정' }, { route: 'season', label: '경기 준비·진행' }, { route: 'league', label: '순위·리그 기록' }, { route: 'games', label: '경기 기록' },
  ], members: { match: 'season' } },
  { key: 'scout', label: '상점', items: [{ route: 'gacha', label: '카드구매' }, { route: 'shop', label: '스카우터' }] },
  { key: 'versus', label: '대전·순위', items: [{ route: 'pvp', label: '대전' }, { route: 'rank', label: '순위' }] },
];

/** 화면 key → 속한 묶음 (작은 탭이거나 members 에 있는 화면) */
export function groupOf(routeKey?: string): MenuGroup | undefined {
  if (!routeKey) return undefined;
  return GROUPS.find((g) => g.items.some((i) => i.route === routeKey) || !!g.members?.[routeKey]);
}
/** 그 화면에서 밝힐 작은 탭 (작은 탭이면 자기, members 면 맡긴 탭) */
export function subTabOf(group: MenuGroup | undefined, routeKey?: string): string | undefined {
  if (!group || !routeKey) return undefined;
  return group.items.some((i) => i.route === routeKey) ? routeKey : group.members?.[routeKey];
}

/** (이전 호환) 메뉴에 나오던 화면 목록 */
export const MENU = ROUTES.filter((r) => r.menu);

/** 화면 컴포넌트 (처음 열 때 불러옴) */
export const SCREENS: Record<string, LazyExoticComponent<ComponentType<ScreenProps>>> = Object.fromEntries(
  ROUTES.map((r) => [r.key, lazy(r.load)]),
);
