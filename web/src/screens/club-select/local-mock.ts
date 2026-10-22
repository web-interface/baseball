// 구단 선택 · 클럽 창단 · 특별 선수 · 개막 — 화면 전용 목업
// 서버가 붙으면: 지명 후보·기본 선수단·특별 선수 카드는 서버가 만들고(같은 Player/CardInst 모양), 여기 값은 버린다.
import { PLAYERS, TEAMS } from '../../game/mock';
import { SPECIAL_PLAYER_NAMES } from '../../game/world';
import { makeAppearance, type FacialHair, type HairStyle } from '../../art/character';
import type { BatSide, GradeId, Hand, PitcherRole, PitchType, Player, Pos, SignaturePitch, Team } from '../../game/types';

/* ── 시드 난수 ── */
function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed: string) {
  let a = hashStr(seed) || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ───────── 1. 구단 ───────── */
export const TIER_KO: Record<Team['tier'], string> = { 강: '우승 후보', 중: '중위권', 약: '하위권' };
export const DIFF_KO = ['', '아주 쉬움', '쉬움', '보통', '어려움', '아주 어려움'];

/** 구단 소개 한 줄 — '먼저 모이는 팀' 조언 (풋볼데이 창단 팁의 야구판) */
export function clubTip(t: Team) {
  if (t.tier === '강') return '스타가 많아 처음부터 강해요. 대신 같은 구단 카드를 다 모으기는 오래 걸려요.';
  if (t.tier === '약') return '전력은 아래지만 같은 구단 카드가 빨리 모여요. 키워 가는 맛이 있어요.';
  return '전력과 모으는 속도가 고르게 섞인 구단이에요.';
}

/* ───────── 2. 지명 후보 (구단마다 8명 — 유망주) ───────── */
// 만드는 곳은 game/starter (기본 선수단과 같이 맞춘다). 지명 카드는 스페셜, 연도는 지명 순서대로 ’27 · ’26 · ’25.
export { DRAFT_GRADE, DRAFT_YEARS, draftPool } from '../../game/starter';

/* ───────── 3. 특별 선수 (요구 29) ───────── */
export type SpecialName = (typeof SPECIAL_PLAYER_NAMES)[number];
export const SPECIAL_NAMES = SPECIAL_PLAYER_NAMES;

/** 영문 이니셜 · 부르는 이름 · 기본 결정구 */
export const SPECIAL_META: Record<SpecialName, { init: string; given: string; pitch: PitchType }> = {
  이동규: { init: 'DK', given: '동규', pitch: 'SL' },
  엄승재: { init: 'SJ', given: '승재', pitch: 'FS' },
  박광원: { init: 'KW', given: '광원', pitch: 'FF' },
  한유락: { init: 'YR', given: '유락', pitch: 'CU' },
  신희준: { init: 'HJ', given: '희준', pitch: 'CH' },
  김범수: { init: 'BS', given: '범수', pitch: 'SL' },
  이상준: { init: 'SJ', given: '상준', pitch: 'FC' },
  박정환: { init: 'JH', given: '정환', pitch: 'SI' },
  김정호: { init: 'JH', given: '정호', pitch: 'SW' },
  홍한길: { init: 'HG', given: '한길', pitch: 'KN' },
  장재관: { init: 'JG', given: '재관', pitch: 'CU' },
};

export type ArmSlot = 'over' | 'three' | 'side' | 'under';
export type Stance = 'open' | 'square' | 'closed';
export type Timing = 'kick' | 'tap' | 'none';
export type BatSkill = 'laser' | 'cannon' | 'bolt' | 'eye' | 'spray';
export type BuildPreset = 'lean' | 'balanced' | 'power';

export interface SpecialCfg {
  name: SpecialName;
  type: 'P' | 'B';
  role: PitcherRole;
  pos: Exclude<Pos, 'P'>;
  throws: Hand;
  bats: BatSide;
  arm: ArmSlot;
  stance: Stance;
  timing: Timing;
  pitch: PitchType;
  sigStyle: 'initials' | 'given';
  skill: BatSkill;
  build: BuildPreset;
  hair: HairStyle;
  beard: FacialHair;
  /** 얼굴 돌리기 횟수 */
  seed: number;
  chant: number;
}

export const DEFAULT_SPECIAL: SpecialCfg = {
  name: '이동규', type: 'P', role: 'SP', pos: 'SS', throws: 'R', bats: 'R', arm: 'side', stance: 'square', timing: 'kick',
  pitch: 'SL', sigStyle: 'initials', skill: 'laser', build: 'balanced', hair: 'crew', beard: 'none', seed: 0, chant: 0,
};

export const ARM_KO: Record<ArmSlot, { ko: string; deg: number; note: string }> = {
  over: { ko: '오버핸드', deg: 78, note: '높은 타점 · 구속 +2' },
  three: { ko: '스리쿼터', deg: 42, note: '균형 · 무브먼트 +1' },
  side: { ko: '사이드암', deg: 4, note: '횡 무브먼트 · 같은 손 타자 +4' },
  under: { ko: '언더핸드', deg: -34, note: '떠오르는 공 · 디셉션 +5' },
};
export const ROLE_INFO: Record<PitcherRole, { ko: string; note: string }> = {
  SP: { ko: '선발', note: '6이닝 · 로테이션' },
  RP: { ko: '중계', note: '7~8회 · 필승조' },
  CL: { ko: '마무리', note: '9회 · 세이브' },
};
export const STANCE_KO: Record<Stance, string> = { open: '오픈', square: '스퀘어', closed: '크로즈드' };
export const TIMING_KO: Record<Timing, string> = { kick: '레그킥', tap: '토탭', none: '노스텝' };
export const PITCH_CHOICES: PitchType[] = ['FF', 'SL', 'CU', 'CH', 'FS', 'SI', 'SW', 'FC', 'KN'];
export const PITCH_NAME: Record<PitchType, string> = { FF: '패스트볼', SI: '싱커', FC: '커터', SL: '슬라이더', SW: '스위퍼', CU: '커브', CH: '체인지업', FS: '포크', KN: '너클볼' };
const PITCH_EFFECT: Record<PitchType, string> = {
  FF: '공 끝이 살아 있다 · 헛스윙·뜬공 ↑',
  SI: '몸쪽으로 휘어 든다 · 땅볼 ↑',
  FC: '배트 끝에 맞는다 · 약한 타구 ↑',
  SL: '늦게 꺾인다 · 헛스윙 ↑',
  SW: '옆으로 크게 휜다 · 같은 손 타자에 강함',
  CU: '크게 떨어진다 · 2스트라이크 뒤 헛스윙 ↑',
  CH: '직구와 같은 팔 스윙 · 타이밍 뺏기 ↑',
  FS: '빠르게 떨어진다 · 땅볼·헛스윙 ↑',
  KN: '예측 불가 · 헛스윙 ↑ · 포일 ↑',
};
const PITCH_COLOR: Record<PitchType, string> = {
  FF: '#FF6B4A', SI: '#7CE38B', FC: '#9AD0FF', SL: '#7FE3D4', SW: '#FFB547', CU: '#6EC1FF', CH: '#4FD1C5', FS: '#C3A6FF', KN: '#E8E4D8',
};
export const SKILL_KO: Record<BatSkill, { ko: string; effect: string }> = {
  laser: { ko: '레이저', effect: '라인드라이브 ↑ · 득점권 컨택 +5' },
  cannon: { ko: '대포', effect: '비거리 ↑ · 당겨친 뜬공 홈런 ↑' },
  bolt: { ko: '번개', effect: '도루 스타트 ↑ · 내야 안타 ↑' },
  eye: { ko: '현미경', effect: '볼 고르기 ↑ · 풀카운트에 강함' },
  spray: { ko: '스프레이', effect: '밀어치기 ↑ · 수비 시프트 무력화' },
};
export const BUILD_KO: Record<BuildPreset, { ko: string; h: number; w: number }> = {
  lean: { ko: '날렵', h: 181, w: 75 },
  balanced: { ko: '균형', h: 185, w: 86 },
  power: { ko: '거포', h: 188, w: 102 },
};
export const HAIR_KO: [HairStyle, string][] = [['crew', '짧게'], ['twoblock', '투블럭'], ['buzz', '삭발'], ['perm', '파마'], ['flow', '장발'], ['tied', '묶음']];
export const BEARD_KO: [FacialHair, string][] = [['none', '없음'], ['stubble', '까칠'], ['goatee', '염소'], ['mustache', '콧수염'], ['beard', '턱수염']];
export const POS_SHORT: Record<Exclude<Pos, 'P'>, string> = { C: '포수', '1B': '1루', '2B': '2루', '3B': '3루', SS: '유격', LF: '좌익', CF: '중견', RF: '우익', DH: '지명' };

/** 고유 구종 — 이름 약자형 'DK 슬라이더' 또는 이름형 '동규 슬라이더' */
export function specialSignature(c: SpecialCfg): SignaturePitch {
  const m = SPECIAL_META[c.name];
  return {
    name: `${c.sigStyle === 'initials' ? m.init : m.given} ${PITCH_NAME[c.pitch]}`,
    base: c.pitch,
    style: 'initials',
    effect: `${PITCH_EFFECT[c.pitch]} (특별 선수 전용)`,
    color: PITCH_COLOR[c.pitch],
  };
}
/** 타자 특기 — 'DK 레이저' */
export function specialSkill(c: SpecialCfg) {
  const m = SPECIAL_META[c.name];
  return { name: `${c.sigStyle === 'initials' ? m.init : m.given} ${SKILL_KO[c.skill].ko}`, effect: SKILL_KO[c.skill].effect };
}

/** 이름이 들어간 전용 응원 구호 */
export function chants(c: SpecialCfg, team: Team) {
  const n = c.name, t = team.short;
  if (c.type === 'P') {
    return c.role === 'CL'
      ? [`9회는 ${n}! 문 닫아라 ${n}!`, `${n}! ${n}! 경기 끝!`, `${t}의 수호신 ${n}!`]
      : [`${n}! ${n}! 삼진 하나 더!`, `던져라 ${n}, 막아라 ${t}!`, `${t}의 에이스 ${n}!`];
  }
  return [`날려라 ${n}! ${t}의 ${n}!`, `안타 ${n}! 안타 ${n}!`, `${n} 홈런! ${t} 승리!`];
}

/** 얼굴 시드 찾기 — 고른 머리·수염이 나오는 시드를 생성기에서 골라 쓴다 (그림은 PlayerArt 그대로) */
const LOOKS = new Map<string, string>();
export function findLook(c: SpecialCfg): string {
  const pos: Pos = c.type === 'P' ? 'P' : c.pos;
  const b = BUILD_KO[c.build];
  const key = `${c.name}|${pos}|${c.build}|${c.hair}|${c.beard}|${c.seed}|${c.throws}${c.bats}`;
  const hit = LOOKS.get(key);
  if (hit) return hit;
  let found = 0;
  let pick = `sp:${c.name}:0`;
  let best = pick, bestScore = -1;
  for (let i = 0; i < 6000; i++) {
    const id = `sp:${c.name}:${i}`;
    const ap = makeAppearance({ id, heightCm: b.h, weightKg: b.w, throws: c.throws, bats: c.bats, pos, origin: 'KR', age: 24, number: 77 });
    const score = (ap.hair.style === c.hair ? 2 : 0) + (ap.facialHair.kind === c.beard ? 1 : 0) + (ap.eyewear === 'none' ? 0.5 : 0);
    if (score >= 3) {
      if (found === c.seed) { pick = id; bestScore = 99; break; }
      found++;
    }
    if (score > bestScore) { bestScore = score; best = id; }
  }
  const out = bestScore === 99 ? pick : best;
  LOOKS.set(key, out);
  return out;
}

/** 설정 → 선수 (처음엔 강하지만 대전 밸런스를 깨지 않게: OVR 84~86 · 잠재력 최고) */
export function buildSpecial(c: SpecialCfg, team: Team): Player {
  const isP = c.type === 'P';
  const b = BUILD_KO[c.build];
  const arm = { over: { vel: 2, brk: 0, dec: 0 }, three: { vel: 0, brk: 1, dec: 1 }, side: { vel: -2, brk: 3, dec: 3 }, under: { vel: -5, brk: 2, dec: 5 } }[c.arm];
  const bodyPow = c.build === 'power' ? 5 : c.build === 'lean' ? -4 : 0;
  const bodySpd = c.build === 'lean' ? 5 : c.build === 'power' ? -5 : 0;
  const sk = { laser: [3, 0, 0, 0], cannon: [-2, 5, -1, 0], bolt: [1, -3, 0, 6], eye: [1, 0, 5, 0], spray: [3, -1, 1, 0] }[c.skill];
  const face: Player['face'] = isP
    ? [
        { code: 'VEL', ko: '구속', v: 86 + arm.vel + (c.role === 'CL' ? 3 : 0) + (c.build === 'power' ? 1 : 0) },
        { code: 'STF', ko: '구위', v: 87 },
        { code: 'BRK', ko: '변화', v: 85 + arm.brk },
        { code: 'CTL', ko: '제구', v: 80 - (c.arm === 'under' ? 2 : 0) },
        c.role === 'SP' ? { code: 'STA', ko: '체력', v: 84 } : { code: 'REC', ko: '회복', v: 86 },
        { code: 'MNT', ko: '위기관리', v: 88 },
      ]
    : c.pos === 'C'
      ? [{ code: 'CON', ko: '컨택', v: 82 + sk[0] }, { code: 'POW', ko: '파워', v: 80 + sk[1] + bodyPow }, { code: 'EYE', ko: '선구', v: 81 + sk[2] },
          { code: 'BLK', ko: '블로킹', v: 86 }, { code: 'FRM', ko: '프레이밍', v: 85 }, { code: 'CS', ko: '도루저지', v: 84 }]
      : [{ code: 'CON', ko: '컨택', v: 85 + sk[0] }, { code: 'POW', ko: '파워', v: 82 + sk[1] + bodyPow }, { code: 'EYE', ko: '선구', v: 81 + sk[2] },
          { code: 'SPD', ko: '주루', v: 80 + sk[3] + bodySpd }, { code: 'DEF', ko: '수비', v: c.pos === 'DH' ? 40 : 82 }, { code: 'ARM', ko: '송구', v: c.pos === 'DH' ? 45 : 83 }];
  const ovr = isP ? 86 : 85;
  return {
    id: 'p-special',
    name: c.name,
    teamId: team.id,
    number: 77,
    pos: isP ? 'P' : c.pos,
    role: isP ? c.role : undefined,
    bats: c.bats,
    throws: c.throws,
    age: 24,
    heightCm: b.h,
    weightKg: b.w,
    origin: 'KR',
    draftYear: 2027,
    ovr,
    face,
    attrs: {},
    potential: 5,
    traits: isP ? ['위기에 강한 강심장'] : ['찬스에 강한 타자'],
    personality: '큰 무대 체질',
    weather: {},
    form: isP ? { pitch: ARM_KO[c.arm].ko } : { bat: `${STANCE_KO[c.stance]} ${TIMING_KO[c.timing]}` },
    look: findLook(c),
    season: {},
    condition: 5,
    fatigue: 0,
  };
}

/* ───────── 4. 개막 — AI 상대 난이도 6단계 (요구 38) ───────── */
export type AiLevel = 'trainee' | 'futures' | 'first' | 'allstar' | 'national' | 'legend';
export const AI_LEVELS: { id: AiLevel; ko: string; grades: GradeId[]; reward: number; desc: string; prize: string }[] = [
  { id: 'trainee', ko: '연습생', grades: ['normal', 'special'], reward: 0.6, desc: '노멀·스페셜 위주 · 교체가 늦어요', prize: '레어 확정 팩' },
  { id: 'futures', ko: '2군', grades: ['special', 'rare'], reward: 0.8, desc: '스페셜·레어 · 작전 실수가 잦아요', prize: '레어 확정 팩 ×2' },
  { id: 'first', ko: '1군', grades: ['rare', 'elite'], reward: 1, desc: '리그 평균 · 보통 감독', prize: '엘리트 확정 팩' },
  { id: 'allstar', ko: '올스타', grades: ['elite', 'legend'], reward: 1.3, desc: '엘리트 위주 · 레전드 섞임', prize: '레전드 확정 팩' },
  { id: 'national', ko: '국가대표', grades: ['elite', 'legend', 'franchise'], reward: 1.6, desc: '팀컬러·케미까지 챙겨요', prize: '프랜차이즈 확정 팩' },
  { id: 'legend', ko: '레전드', grades: ['legend', 'black', 'signature'], reward: 2, desc: '승리 확률표대로 최적 판단', prize: '블랙 이상 확정 팩' },
];
/** 지금 전력으로 추천 — 막 창단한 구단(팀 종합 74 안팎)은 2군 */
export const RECOMMENDED: AiLevel = 'futures';
/** 처음 팀 종합 목표 — 실제 값은 기본 선수단으로 계산 (game/starter) */
export const STARTER_OVR = 66;

/* ───────── 저장 (이 기기) ───────── */
export interface StartState {
  club: string;
  picks: string[];
  special: SpecialCfg;
  level: AiLevel;
}
const KEY = 'bb.start';
export const DEFAULT_START: StartState = { club: 'dj', picks: [], special: DEFAULT_SPECIAL, level: RECOMMENDED };
export function loadStart(): StartState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_START;
    const v = JSON.parse(raw) as Partial<StartState>;
    return {
      club: TEAMS.some((t) => t.id === v.club) ? v.club! : DEFAULT_START.club,
      picks: Array.isArray(v.picks) ? v.picks.slice(0, 3) : [],
      special: { ...DEFAULT_SPECIAL, ...(v.special ?? {}) },
      level: AI_LEVELS.some((l) => l.id === v.level) ? v.level! : RECOMMENDED,
    };
  } catch {
    return DEFAULT_START;
  }
}
export function saveStart(s: StartState) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 이번 방문만 */ }
}
