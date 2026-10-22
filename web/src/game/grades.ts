// 카드 등급 11종 + 특별 선수 — 사용자 지정 이름 그대로 (노멀 < 스페셜 < 레어 < 엘리트 / 레전드·프랜차이즈 엘리트·블랙·시그니처 / MVP·GG·TH)
import type { GradeId, GradeInfo } from './types';

export const GRADES: Record<GradeId, GradeInfo> = {
  normal:    { id: 'normal',    ko: '노멀',             short: 'N',   kind: 'season', rank: 1, yearTagged: true,  levelMax: 8,  frame: '은회색 얇은 테' },
  special:   { id: 'special',   ko: '스페셜',           short: 'S',   kind: 'season', rank: 2, yearTagged: true,  levelMax: 8,  frame: '주황 테' },
  rare:      { id: 'rare',      ko: '레어',             short: 'R',   kind: 'season', rank: 3, yearTagged: true,  levelMax: 9,  frame: '진홍 테 + 광택' },
  elite:     { id: 'elite',     ko: '엘리트',           short: 'E',   kind: 'season', rank: 5, yearTagged: true,  levelMax: 9,  frame: '보라 테 + 테두리를 따라 흐르는 빛' },
  legend:    { id: 'legend',    ko: '레전드',           short: 'L',   kind: 'icon',   rank: 4, yearTagged: false, levelMax: 10, frame: '금박 + 문양' },
  franchise: { id: 'franchise', ko: '프랜차이즈 엘리트', short: 'FR',  kind: 'icon',   rank: 6, yearTagged: false, levelMax: 10, frame: '구단색 + 금 FR 명판' },
  black:     { id: 'black',     ko: '블랙',             short: 'BK',  kind: 'icon',   rank: 7, yearTagged: false, levelMax: 10, frame: '무광 검정 + 크롬 테에 빛이 스침' },
  signature: { id: 'signature', ko: '시그니처',         short: 'SIG', kind: 'icon',   rank: 8, yearTagged: false, levelMax: 10, frame: '움직이는 무지개 홀로그램 테' },
  mvp:       { id: 'mvp',       ko: 'MVP',              short: 'MVP', kind: 'award',  rank: 5, yearTagged: true,  levelMax: 10, frame: '월계관 장식' },
  gg:        { id: 'gg',        ko: '골든글러브',       short: 'GG',  kind: 'award',  rank: 5, yearTagged: true,  levelMax: 10, frame: '황금 글러브 장식' },
  th:        { id: 'th',        ko: '타이틀 홀더',      short: 'TH',  kind: 'award',  rank: 5, yearTagged: true,  levelMax: 10, frame: '왕관 장식' },
  unique:    { id: 'unique',    ko: '특별 선수',        short: '1/1', kind: 'unique', rank: 6, yearTagged: false, levelMax: 10, frame: '단 하나뿐인 전용 테두리 (11등급과 다른 디자인)' },
};

/** 화면에 늘어놓는 순서 (높은 것부터) */
export const GRADE_ORDER: GradeId[] = ['signature', 'black', 'franchise', 'elite', 'legend', 'rare', 'special', 'normal', 'mvp', 'gg', 'th'];
/** 특별 선수까지 */
export const GRADE_ORDER_ALL: GradeId[] = ['unique', ...GRADE_ORDER];

/** 등급 고유색 CSS 변수 (tokens.css 의 --gr-*) */
export const gradeVar = (g: GradeId) => `var(--gr-${g})`;

/** 서열 비교: 양수면 a 가 높음 */
export const gradeCmp = (a: GradeId, b: GradeId) => GRADES[a].rank - GRADES[b].rank;

/** 레어 이상 (고유 구종 자격) — 특별 등급 포함 */
export const isRarePlus = (g: GradeId) => GRADES[g].rank >= GRADES.rare.rank;
