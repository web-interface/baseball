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
  { key: 'season', path: '/season', title: '시즌 빨리 감기', menu: '시즌', owner: '경기 화면 개발자', desc: '남은 시즌 한 번에 — 속도 1·2·4배·끝까지 · 날짜 막대 · 순위 경쟁 그래프 · 소식 띠 · 하이라이트 · 최종 순위 · 개인 기록 1위', load: () => import('../screens/season') },
  { key: 'match', path: '/match', title: '경기', menu: '경기', owner: '경기 화면 개발자', desc: '빨리 보기(10초) · 주요 장면 · 이닝별 · 자세히(2D) · 강조 문구 · 원인 표시 · ?g=season 지금 바로 경기(엔진) · ?pvp=<id> 대전 다시 보기', load: () => import('../screens/match') },
  { key: 'cards', path: '/cards', title: '카드', menu: '카드', owner: '카드 화면 개발자', desc: '보관함 · 등급 11종 · 강화 I~X · 레벨 · 도감', load: () => import('../screens/cards') },
  { key: 'gacha', path: '/gacha', title: '영입', menu: '영입', owner: '뽑기 화면 개발자', desc: '스카우트(카드 뽑기) · 확률 공개 · 천장 · 레전드 이펙트', load: () => import('../screens/gacha') },
  { key: 'shop', path: '/shop', title: '스카우트 상점', menu: '상점', owner: '상점 화면 개발자', desc: 'AI 스카우트가 매일 진열 · 하루 살 수 있는 인원 제한', load: () => import('../screens/shop') },
  { key: 'pvp', path: '/pvp', title: '대전', menu: '대전', owner: '대전 화면 개발자', desc: '다른 감독 구단과 혼자 대결(상대 접속 필요 없음) · AI 구단 연습 · 레이팅 · 내 기록', load: () => import('../screens/pvp') },
  { key: 'rank', path: '/rank', title: '순위', menu: '순위', owner: '대전 화면 개발자', desc: '감독 순위(레이팅 · 승률 · 구단 전력, 실제 가입자) · 리그 순위', load: () => import('../screens/rank') },
  { key: 'player', path: '/player/:id', title: '선수 정보', sample: '/player/p03', back: '/cards', chrome: 'bare', owner: '선수 화면 개발자', desc: 'FM 식 상세 능력치 · 고유 구종 · 시즌 기록 · 폼 · 날씨 체질', load: () => import('../screens/player') },
  { key: 'club-select', path: '/club-select', title: '구단 선택', back: '/home', chrome: 'bare', owner: '구단 선택 화면 개발자', desc: '2027 시즌을 함께할 구단 고르기 · 엠블럼·연고·구장·난이도', load: () => import('../screens/club-select') },
  { key: 'settings', path: '/settings', title: '설정', back: '/home', chrome: 'bare', owner: '설정 화면 개발자', desc: '테마 · 경기 보기 방식 · 소리 · 로그아웃', load: () => import('../screens/settings') },
];

/** 위쪽 메뉴 */
export const MENU = ROUTES.filter((r) => r.menu);

/** 화면 컴포넌트 (처음 열 때 불러옴) */
export const SCREENS: Record<string, LazyExoticComponent<ComponentType<ScreenProps>>> = Object.fromEntries(
  ROUTES.map((r) => [r.key, lazy(r.load)]),
);
