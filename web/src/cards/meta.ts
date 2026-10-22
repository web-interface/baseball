// 카드 표기 도우미 — 구단 띠 색 · 영문 이름 · 카드 번호 · 패럴렐 이름 · 일련번호 · 강화 단계.
// 실물 트레이딩 카드(20_실물카드_디자인.md)의 '진짜 인쇄물 신호'를 데이터에서 계산한다. 화면 코드는 쓰지 않아도 된다.
import type { CardInst, ClubCode, GradeId, Player, Team } from '../game/types';

/* ───────── 난수 (같은 카드는 늘 같은 모양) ───────── */
export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function seeded(seed: string) {
  let a = hash(seed) || 1;
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

/* ───────── 구단 띠 색 — 흰 글자가 읽히는 '띠 색' + 띠 위 가는 선 (실물 카드 시제품에서 고른 값) ───────── */
const BAND: Record<ClubCode, { band: string; line: string }> = {
  DJ: { band: '#C9580C', line: '#1F2024' },
  GJ: { band: '#B1102B', line: '#F2A007' },
  DG: { band: '#2C6BD1', line: '#F0A63A' },
  BS: { band: '#123A7A', line: '#D7263D' },
  SB: { band: '#1C1B3F', line: '#C8102E' },
  ST: { band: '#A1124A', line: '#C9CED6' },
  SH: { band: '#6E1C2E', line: '#E3B04B' },
  IC: { band: '#D63A28', line: '#0E5E6F' },
  CW: { band: '#1D3557', line: '#B38B4D' },
  SW: { band: '#15151A', line: '#E0352F' },
};

const lum = (hex: string) => {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const darken = (hex: string, k: number) => {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * (1 - k)).toString(16).padStart(2, '0')).join('');
};

export function bandOf(t: Team) {
  const b = BAND[t.code];
  if (b) return b;
  // 표에 없는 구단: 밝은 주색은 어둡게 (흰 글자 대비)
  const p = t.colors.primary;
  return { band: lum(p) > 0.2 ? darken(p, 0.3) : p, line: t.colors.accent };
}

/* ───────── 영문 이름 — 실물 카드처럼 성 먼저, 음절 띄어 쓰기 ('EUN DO BIN') ───────── */
const COMPOUND: Record<string, string> = {
  제갈: 'JEGAL', 남궁: 'NAMGOONG', 독고: 'DOKGO', 황보: 'HWANGBO', 선우: 'SUNWOO', 서문: 'SEOMUN', 사공: 'SAGONG', 동방: 'DONGBANG',
};
const SURNAME: Record<string, string> = {
  이: 'LEE', 박: 'PARK', 김: 'KIM', 최: 'CHOI', 정: 'JUNG', 강: 'KANG', 조: 'CHO', 윤: 'YOON', 장: 'JANG', 임: 'LIM', 한: 'HAN',
  오: 'OH', 서: 'SEO', 신: 'SHIN', 권: 'KWON', 황: 'HWANG', 안: 'AHN', 송: 'SONG', 류: 'RYU', 유: 'YOO', 전: 'JEON', 홍: 'HONG',
  고: 'KO', 문: 'MOON', 양: 'YANG', 손: 'SON', 배: 'BAE', 백: 'BAEK', 허: 'HEO', 남: 'NAM', 심: 'SHIM', 노: 'NOH', 하: 'HA',
  곽: 'KWAK', 성: 'SUNG', 차: 'CHA', 주: 'JOO', 우: 'WOO', 구: 'KOO', 민: 'MIN', 진: 'JIN', 나: 'NA', 지: 'JI', 엄: 'EOM',
  채: 'CHAE', 원: 'WON', 천: 'CHEON', 방: 'BANG', 공: 'KONG', 현: 'HYUN', 함: 'HAM', 변: 'BYUN', 염: 'YEOM', 여: 'YEO',
  추: 'CHOO', 도: 'DO', 소: 'SO', 석: 'SEOK', 선: 'SUN', 설: 'SEOL', 마: 'MA', 길: 'GIL', 연: 'YEON', 위: 'WI', 표: 'PYO',
  명: 'MYUNG', 기: 'KI', 반: 'BAN', 라: 'RA', 왕: 'WANG', 금: 'KEUM', 옥: 'OK', 육: 'YOOK', 인: 'IN', 맹: 'MAENG', 제: 'JE',
  모: 'MO', 탁: 'TAK', 국: 'KOOK', 어: 'EO', 은: 'EUN', 편: 'PYEON', 용: 'YONG', 예: 'YE', 경: 'KYUNG', 봉: 'BONG', 사: 'SA',
  부: 'BOO', 피: 'PI', 승: 'SEUNG', 빈: 'BIN', 태: 'TAE', 견: 'KYEON', 탄: 'TAN', 판: 'PAN', 범: 'BEOM', 감: 'KAM',
};
const CHO = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const JUNG = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
const JONG = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];

/** 이름 음절 하나 — 개정 로마자 + 이름에서 흔한 표기(받침 없는 '우·주·수·후' → WOO·JOO·SOO·HOO) */
function syllable(ch: string) {
  const c = ch.charCodeAt(0) - 0xac00;
  if (c < 0 || c > 11171) return ch.toUpperCase();
  const cho = Math.floor(c / 588), jung = Math.floor((c % 588) / 28), jong = c % 28;
  let v = JUNG[jung];
  if (v === 'u' && jong === 0) v = 'oo';
  let head = CHO[cho];
  if (head === '' && v === 'oo') head = 'w';
  return (head + v + JONG[jong]).toUpperCase();
}

/** 외국인 선수는 한글 표기를 거꾸로 맞추기 어려워 표로 — 서버가 nameEn 을 주면 그걸 쓴다 */
const EN_OVERRIDE: Record<string, string> = {
  '디에고 살바르': 'DIEGO SALVAR',
  '케일럽 윈터스': 'CALEB WINTERS',
  '오카베 류': 'OKABE RYU',
};

export function enName(p: Player): string {
  const given = (p as Player & { nameEn?: string }).nameEn;
  if (given) return given.toUpperCase();
  const name = p.name.trim();
  if (EN_OVERRIDE[name]) return EN_OVERRIDE[name];
  if (/\s/.test(name)) return name.split(/\s+/).map((w) => [...w].map(syllable).join('')).join(' ');
  const two = name.slice(0, 2);
  let sur: string, rest: string;
  if (name.length >= 3 && COMPOUND[two]) { sur = COMPOUND[two]; rest = name.slice(2); }
  else { sur = SURNAME[name[0]] ?? syllable(name[0]); rest = name.slice(1); }
  return [sur, ...[...rest].map(syllable)].join(' ');
}

/* ───────── 패럴렐 이름 · 카드 번호 · 일련번호 ───────── */
/** 카드 번호 줄의 영문 패럴렐 이름 — 상표(Refractor·Prizm) 대신 일반어 */
export const PARALLEL: Record<GradeId, string> = {
  normal: 'BASE',
  special: 'ORANGE',
  rare: 'CRIMSON WAVE',
  elite: 'PURPLE PRISM',
  legend: 'GOLD RAY',
  franchise: 'FRANCHISE ELITE',
  black: 'BLACK CHROME',
  signature: 'AUTOGRAPH HOLO',
  mvp: 'MOST VALUABLE PLAYER',
  gg: 'GOLDEN GLOVE',
  th: 'TITLE HOLDER',
  unique: 'ONE STAR',
};

/** 발행 한도 (실물의 /99 · /25 …) — 노멀~엘리트는 번호 없음 */
export const SERIAL_LIMIT: Partial<Record<GradeId, number>> = {
  legend: 99, franchise: 50, black: 25, signature: 10, mvp: 27, gg: 27, th: 27, unique: 1,
};

const PREFIX: Partial<Record<GradeId, string>> = { legend: 'LG', franchise: 'FR', black: 'BK', signature: 'SG', mvp: 'AW', gg: 'AW', th: 'AW', unique: 'OS' };

/** '27-DJ-011' · 'LG-DJ-052' · 'AW-GJ-044' · 'OS-DJ-001' */
export function cardCode(grade: GradeId, team: Team, number: number, year?: number) {
  const pre = PREFIX[grade] ?? String(year ?? 27).slice(-2).padStart(2, '0');
  const no = grade === 'unique' ? 1 : number;
  return `${pre}-${team.code}-${String(no).padStart(3, '0')}`;
}

export interface Serial { no: number; of: number; match: boolean }

/**
 * 일련번호 — 서버가 뽑는 순간 매기는 값(요청 id 로 한 번만). 지금은 목업이라 카드 id 로 고정된 값을 만든다.
 * 등번호와 같으면 '등번호 매치'(꾸밈만, 능력치 없음).
 */
export function mockSerial(grade: GradeId, cardId: string, number: number): Serial | null {
  const of = SERIAL_LIMIT[grade];
  if (!of) return null;
  if (of === 1) return { no: 1, of: 1, match: false };
  let no = 1 + (hash('serial:' + cardId) % of);
  // 목업에서 하나쯤은 등번호 매치가 보이게
  if (hash('match:' + cardId) % 4 === 0 && number <= of) no = number;
  return { no, of, match: no === number };
}

/** 오른쪽 위 '연도' 자리 — 시즌 '27 · 레전드 활약 기간 · FR · BLK · SIG · 수상 연도 · 1/1 */
export function yearTag2(y: number) {
  return `’${String(y).slice(-2).padStart(2, '0')}`;
}

/** 레전드 활약 기간 — 서버가 주기 전까지 입단 연도 ~ 지난 시즌 */
export function legendSpan(p: Player) {
  const from = p.draftYear;
  return `${yearTag2(from)}–${yearTag2(Math.max(from + 1, 2026))}`;
}

/** 신인 카드(RC) — 데뷔 시즌의 국내 선수 (특별 선수는 1/1 이 대신) */
export function isRookie(p: Player, grade: GradeId) {
  return grade !== 'unique' && p.origin === 'KR' && p.draftYear >= 2027;
}

/** 강화 단계 판 — I~III 먹 · IV~VI 은 · VII~IX 금 · X 금빛 소용돌이(움직임) */
export function enhanceTier(n: number): 'ink' | 'silver' | 'gold' | 'max' | null {
  if (n <= 0) return null;
  if (n >= 10) return 'max';
  if (n >= 7) return 'gold';
  if (n >= 4) return 'silver';
  return 'ink';
}

/** 홈/원정 유니폼 사진 변형 — 같은 선수라도 카드마다 다르게 (실물의 이미지 배리에이션) */
export function uniformOf(c: Pick<CardInst, 'id' | 'grade'>): 'home' | 'away' {
  if (c.grade === 'unique') return 'home';
  return hash('set:' + c.id) % 10 < 3 ? 'away' : 'home';
}

/** 수상 내용 → GG 문장 안 포지션 글자 */
const AWARD_POS: Record<string, string> = {
  투수: 'P', 포수: 'C', '1루수': '1B', '2루수': '2B', '3루수': '3B', 유격수: 'SS', 좌익수: 'LF', 중견수: 'CF', 우익수: 'RF', 지명타자: 'DH',
};
export const awardPos = (award: string | undefined, fallback: string) => (award && AWARD_POS[award]) || fallback;

/** 프랜차이즈 테 색 — 구단 주색이 너무 어두우면(검정·남색) 구단이 떠오르는 다른 색으로 */
const FRAME: Partial<Record<ClubCode, string>> = {
  BS: '#1F4C9A', SB: '#2E2C66', SH: '#8A2438', SW: '#D23A2E', GJ: '#C8183A',
};
export const frameColorOf = (t: Team) => FRAME[t.code] ?? t.colors.primary;
