// 구단 선택 · 클럽 창단 · 특별 선수 · 개막 — 화면 전용 목업
// 서버가 붙으면: 지명 후보·기본 선수단·특별 선수 카드는 서버가 만들고(같은 Player/CardInst 모양), 여기 값은 버린다.
import { PLAYERS, isTeamId, teamByCode, teamById } from '../../game/mock';
import { SPECIAL_PLAYER_NAMES } from '../../game/world';
import type { FacialHair, HairStyle } from '../../art/character';
import { ATTR_KO, PITCH_KO } from '../../game/labels';
import type { AttrKey, AttrMap, BatSide, GradeId, Hand, Pitch, PitcherRole, PitchType, Player, Pos, SignaturePitch, Team } from '../../game/types';

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
  if (t.old) {
    const [a, b] = t.era ?? [t.founded, t.founded];
    return `지명 후보는 ${a}~${b} 시절 주축 선수예요. 이 구단 카드는 그 시절 연도로만 나와서, 구단+연도 세트를 맞추는 맛이 남달라요.`;
  }
  if (t.tier === '강') return '스타가 많아 처음부터 강해요. 대신 같은 구단 카드를 다 모으기는 오래 걸려요.';
  if (t.tier === '약') return '전력은 아래지만 같은 구단 카드가 빨리 모여요. 키워 가는 맛이 있어요.';
  return '전력과 모으는 속도가 고르게 섞인 구단이에요.';
}
/** 옛 구단이 2027 리그에서 대신 들어가는 자리 */
export const revivalSlot = (t: Team) => (t.revives ? teamByCode(t.revives) : undefined);

/* ───────── 2. 지명 후보 (구단마다 8명 — 유망주) ───────── */
// 만드는 곳은 game/starter (기본 선수단과 같이 맞춘다). 지명 카드는 스페셜, 연도는 지명 순서대로 ’27 · ’26 · ’25 (옛 구단은 그 선수가 뛴 해).
export { DRAFT_GRADE, DRAFT_YEARS, draftGradeOf, draftPool, draftYearOf } from '../../game/starter';

/* ───────── 3. 특별 선수 (요구 29) ───────── */
// 이름은 추천 11명 중에서 고르거나 직접 쓴다(한글 완성 글자 2~4자). 투수는 결정구 20가지 + 특징 3개 중 하나, 타자는 타격 특기 1~3개.
// 고른 값은 카드 앞면 숫자로 끝나지 않고 상세 능력치(attrs)·구종표(pitches)로 내려가 시즌 경기 엔진(season/sim)이 그대로 쓴다.
export type SpecialName = (typeof SPECIAL_PLAYER_NAMES)[number];
export const SPECIAL_NAMES = SPECIAL_PLAYER_NAMES;
const has = (o: object, k: unknown) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);

/* ── 결정구 — 엔진 구종 9가지(PitchType) 위에 이름을 붙인 20가지 ── */
export type FinisherId =
  | 'four' | 'rising' | 'twoSeam' | 'sinker' | 'cutter'
  | 'slider' | 'hardSlider' | 'vertSlider' | 'sweeper' | 'slurve'
  | 'curve' | 'knuckleCurve' | 'powerCurve'
  | 'change' | 'circleChange' | 'screwball' | 'fork' | 'splitter'
  | 'knuckle' | 'palm';
export type PitchFamily = 'fast' | 'slider' | 'curve' | 'drop' | 'special';
export const PITCH_FAMILIES: { id: PitchFamily; ko: string }[] = [
  { id: 'fast', ko: '직구 계열' }, { id: 'slider', ko: '슬라이더 계열' }, { id: 'curve', ko: '커브 계열' }, { id: 'drop', ko: '떨어지는 공' }, { id: 'special', ko: '특수' },
];
/**
 * 특징 숫자 — stf 이 공 위력 · cmd 이 공 제구 · use 구사율(0.05 = 5%p) · kmh 이 공 구속(km/h)
 *   vel 구속 능력치(모든 공) · dec 디셉션 · gb 땅볼 성향(− 면 뜬공) · ext 익스텐션 · mnt 위기관리(침착·집중)
 * 저울: 위력 + 제구 + 구속 + 디셉션/2 + 위기관리/2 + 익스텐션/4 = +2 — 어느 특징을 골라도 셈은 같고 쓰임새만 다르다.
 */
export interface PitchFx { stf?: number; cmd?: number; use?: number; kmh?: number; vel?: number; dec?: number; gb?: number; ext?: number; mnt?: number }
export interface PitchTrait { t: string; d: string; fx: PitchFx }
export interface Finisher {
  ko: string;
  /** 고르는 판에 쓰는 짧은 이름 */
  short: string;
  family: PitchFamily;
  /** 엔진 구종 */
  base: PitchType;
  /** 같은 엔진 구종 대비 구속 (km/h) */
  kmh: number;
  /** 같이 던지는 공 (앞에서부터) */
  pair: PitchType[];
  /** 2D 중계 궤적 · 배지 색 */
  color: string;
  desc: string;
  traits: [PitchTrait, PitchTrait, PitchTrait];
}
export const FINISHERS: Record<FinisherId, Finisher> = {
  // 직구 계열
  four: {
    ko: '포심 패스트볼', short: '포심', family: 'fast', base: 'FF', kmh: 0, pair: ['SL', 'CH'], color: '#FF6B4A', desc: '가장 빠르고 곧게 오는 공',
    traits: [
      { t: '돌직구', d: '공이 묵직해서 맞아도 멀리 못 가요', fx: { stf: 4, cmd: -2, gb: 4 } },
      { t: '불같은 강속구', d: '한 계단 더 빨라요 · 헛스윙 ↑', fx: { vel: 3, cmd: -1 } },
      { t: '칼제구', d: '원하는 곳에 꽂아요 · 볼넷 ↓', fx: { cmd: 4, stf: -2, use: 0.04 } },
    ],
  },
  rising: {
    ko: '라이징 패스트볼', short: '라이징', family: 'fast', base: 'FF', kmh: 1, pair: ['CU', 'CH'], color: '#FF4FA3', desc: '회전이 많아 떠오르듯 들어오는 공',
    traits: [
      { t: '하이 패스트볼', d: '높은 쪽에서 솟아올라요 · 헛스윙·뜬공 ↑', fx: { stf: 4, cmd: -2, gb: -12 } },
      { t: '긴 익스텐션', d: '타자 코앞에서 놓아 체감 구속 ↑', fx: { ext: 8, vel: 1, cmd: -1 } },
      { t: '터널링', d: '변화구와 같은 길로 와서 속기 쉬워요', fx: { dec: 4, stf: 1, cmd: -1 } },
    ],
  },
  twoSeam: {
    ko: '투심 패스트볼', short: '투심', family: 'fast', base: 'SI', kmh: 0, pair: ['SL', 'CH'], color: '#7CE38B', desc: '끝에서 몸쪽으로 휘어 드는 직구',
    traits: [
      { t: '뱀직구', d: '끝에서 뱀처럼 휘어요 · 같은 손 타자에 강해요', fx: { stf: 4, cmd: -2 } },
      { t: '몸쪽 승부', d: '배트 손잡이 쪽을 파고들어요 · 땅볼 ↑', fx: { stf: 2, gb: 8 } },
      { t: '맞혀 잡기', d: '초구부터 존에 넣어요 · 투구 수 ↓', fx: { cmd: 4, stf: -2, use: 0.05 } },
    ],
  },
  sinker: {
    ko: '싱커', short: '싱커', family: 'fast', base: 'SI', kmh: -1, pair: ['SL', 'CH'], color: '#3FBF7F', desc: '아래로 가라앉는 직구 · 땅볼용',
    traits: [
      { t: '무거운 싱커', d: '뚝 가라앉아요 · 땅볼 ↑↑', fx: { gb: 14, stf: 1, cmd: 1 } },
      { t: '고속 싱커', d: '직구만큼 빨라요 · 위력 ↑', fx: { vel: 2, stf: 2, cmd: -2, gb: 4 } },
      { t: '위기 탈출', d: '주자가 쌓여도 흔들리지 않아요 · 병살 ↑', fx: { mnt: 4, stf: 1, cmd: -1, gb: 6 } },
    ],
  },
  cutter: {
    ko: '커터', short: '커터', family: 'fast', base: 'FC', kmh: 0, pair: ['SL', 'CH'], color: '#9AD0FF', desc: '직구처럼 오다 마지막에 살짝 꺾이는 공',
    traits: [
      { t: '배트 브레이커', d: '손잡이 쪽에 맞아 약한 타구 ↑', fx: { stf: 4, cmd: -2, gb: 4 } },
      { t: '백도어 커터', d: '바깥에서 존으로 들어와요 · 루킹 삼진 ↑', fx: { cmd: 4, stf: -2, use: 0.03 } },
      { t: '빠르고 짧게', d: '직구와 구별이 안 돼요 · 구속 ↑', fx: { vel: 1, stf: 2, cmd: -1, kmh: 3 } },
    ],
  },
  // 슬라이더 계열
  slider: {
    ko: '슬라이더', short: '슬라이더', family: 'slider', base: 'SL', kmh: 0, pair: ['CH', 'CU'], color: '#7FE3D4', desc: '옆으로 꺾이는 변화구의 기본',
    traits: [
      { t: '늦게 꺾이는 공', d: '홈 앞에서 꺾여요 · 헛스윙 ↑', fx: { stf: 4, cmd: -2 } },
      { t: '옆으로 길게', d: '옆으로 크게 휘어요 · 같은 손 타자에 강해요', fx: { stf: 2, dec: 2, cmd: -1, kmh: -3 } },
      { t: '빠르고 짧게', d: '짧게 꺾여 존에 남아요 · 구속·제구 ↑', fx: { cmd: 3, stf: -1, kmh: 4 } },
    ],
  },
  hardSlider: {
    ko: '고속 슬라이더', short: '고속 슬라이더', family: 'slider', base: 'SL', kmh: 5, pair: ['FS', 'CH'], color: '#FFB547', desc: '직구에 가까운 속도로 꺾이는 슬라이더',
    traits: [
      { t: '직구처럼 오다 뚝', d: '직구 궤적에서 늦게 꺾여요 · 헛스윙 ↑', fx: { stf: 3, dec: 2, cmd: -2 } },
      { t: '칼날 슬라이더', d: '직구만큼 빠르게 날아와요 · 위력 ↑', fx: { vel: 1, stf: 2, cmd: -1, kmh: 3 } },
      { t: '카운트 잡기', d: '존 안에서 꺾여 스트라이크를 벌어요 · 볼넷 ↓', fx: { cmd: 4, stf: -2, use: 0.05 } },
    ],
  },
  vertSlider: {
    ko: '종 슬라이더', short: '종 슬라이더', family: 'slider', base: 'SL', kmh: -2, pair: ['CH', 'CU'], color: '#5CC8E8', desc: '옆보다 아래로 떨어지는 슬라이더',
    traits: [
      { t: '수직 낙하', d: '아래로 뚝 떨어져요 · 헛스윙 ↑', fx: { stf: 4, cmd: -2, gb: 2 } },
      { t: '원바운드 유인', d: '땅에 박히는 공으로 2스트라이크를 끝내요', fx: { stf: 5, cmd: -3, use: -0.04 } },
      { t: '무릎 걸치기', d: '무릎 높이로 낮게 걸쳐요 · 땅볼 ↑', fx: { cmd: 3, stf: -1, gb: 8 } },
    ],
  },
  sweeper: {
    ko: '스위퍼', short: '스위퍼', family: 'slider', base: 'SW', kmh: 0, pair: ['CH', 'CU'], color: '#FFD84F', desc: '옆으로 크게 휩쓸고 지나가는 공',
    traits: [
      { t: '크게 휘감기', d: '옆으로 40cm 넘게 휘어요 · 같은 손 타자에 강해요', fx: { stf: 4, cmd: -2 } },
      { t: '백도어 스위퍼', d: '반대 손 타자 바깥에 걸쳐요 · 루킹 삼진 ↑', fx: { cmd: 4, stf: -2, use: 0.03 } },
      { t: '빠른 스위퍼', d: '빠르게 휘어 따라가기 어려워요', fx: { vel: 1, stf: 2, cmd: -1, kmh: 4 } },
    ],
  },
  slurve: {
    ko: '슬러브', short: '슬러브', family: 'slider', base: 'SW', kmh: -1, pair: ['CH', 'SL'], color: '#F28CFF', desc: '슬라이더와 커브 사이 · 대각선으로 떨어지는 공',
    traits: [
      { t: '대각선 낙차', d: '옆과 아래로 같이 떨어져요 · 헛스윙 ↑', fx: { stf: 3, cmd: -1, gb: 4 } },
      { t: '느린 슬러브', d: '구속 차로 타이밍을 뺏어요', fx: { dec: 4, kmh: -4 } },
      { t: '제구형 슬러브', d: '원하는 코스에 넣어요 · 볼넷 ↓', fx: { cmd: 4, stf: -2, use: 0.04 } },
    ],
  },
  // 커브 계열
  curve: {
    ko: '커브', short: '커브', family: 'curve', base: 'CU', kmh: 0, pair: ['CH', 'SL'], color: '#6EC1FF', desc: '크게 떴다가 떨어지는 공',
    traits: [
      { t: '폭포수 커브', d: '높이 떠서 크게 떨어져요 · 2스트라이크 헛스윙 ↑', fx: { stf: 5, cmd: -3 } },
      { t: '카운트 커브', d: '초구 스트라이크를 잡는 느린 커브', fx: { cmd: 4, stf: -2, use: 0.05 } },
      { t: '슬로 커브', d: '아주 느려서 다음 직구가 더 빨라 보여요', fx: { dec: 4, kmh: -8 } },
    ],
  },
  knuckleCurve: {
    ko: '너클 커브', short: '너클 커브', family: 'curve', base: 'CU', kmh: 3, pair: ['SL', 'CH'], color: '#B48CFF', desc: '손가락을 세워 던지는 날카로운 커브',
    traits: [
      { t: '급강하', d: '직구처럼 오다 뚝 떨어져요 · 헛스윙 ↑', fx: { stf: 4, cmd: -2 } },
      { t: '숨긴 그립', d: '그립이 안 보여 노림수를 피해요', fx: { dec: 4, stf: 1, cmd: -1 } },
      { t: '낮게 깔기', d: '무릎 아래로 떨어뜨려요 · 땅볼 ↑', fx: { cmd: 2, gb: 10 } },
    ],
  },
  powerCurve: {
    ko: '파워 커브', short: '파워 커브', family: 'curve', base: 'CU', kmh: 6, pair: ['SL', 'CH'], color: '#4F8BFF', desc: '빠르게 꺾여 떨어지는 커브',
    traits: [
      { t: '강속 낙차', d: '빠르고 날카롭게 떨어져요 · 위력 ↑', fx: { stf: 4, cmd: -2, kmh: 2 } },
      { t: '아껴 둔 한 방', d: '2스트라이크에서만 꺼내요 · 위력 ↑↑', fx: { stf: 5, cmd: -3, use: -0.06 } },
      { t: '하이 앤 로우', d: '높은 직구 다음에 떨어뜨려 헛스윙 ↑', fx: { dec: 2, stf: 1, gb: -4 } },
    ],
  },
  // 떨어지는 공
  change: {
    ko: '체인지업', short: '체인지업', family: 'drop', base: 'CH', kmh: 0, pair: ['SL', 'CU'], color: '#4FD1C5', desc: '직구 팔 스윙으로 느리게 · 타이밍 뺏기',
    traits: [
      { t: '같은 팔 스윙', d: '직구와 똑같은 동작이에요 · 타이밍 뺏기 ↑', fx: { dec: 4, stf: 1, cmd: -1 } },
      { t: '뚝 떨어지는 공', d: '끝에서 가라앉아요 · 땅볼·헛스윙 ↑', fx: { stf: 3, cmd: -1, gb: 6 } },
      { t: '카운트 체인지업', d: '반대 손 타자에게 자주 던져요 · 볼넷 ↓', fx: { cmd: 4, stf: -2, use: 0.05 } },
    ],
  },
  circleChange: {
    ko: '서클 체인지업', short: '서클 체인지업', family: 'drop', base: 'CH', kmh: -1, pair: ['CU', 'SL'], color: '#2FB89F', desc: '바깥으로 흐르며 떨어지는 체인지업',
    traits: [
      { t: '흘러 떨어지는 공', d: '바깥으로 흐르며 떨어져요 · 헛스윙 ↑', fx: { stf: 4, cmd: -2 } },
      { t: '느린 낙차', d: '구속 차가 커서 타이밍을 뺏어요', fx: { dec: 4, kmh: -5 } },
      { t: '땅볼 머신', d: '낮게 깔려요 · 땅볼 ↑↑', fx: { stf: 1, cmd: 1, gb: 12 } },
    ],
  },
  screwball: {
    ko: '스크루볼', short: '스크루볼', family: 'drop', base: 'CH', kmh: -2, pair: ['SL', 'CU'], color: '#FFE36E', desc: '슬라이더와 반대로 휘는 공',
    traits: [
      { t: '역회전', d: '반대로 휘어요 · 좌우 상성을 뒤집어요', fx: { stf: 4, dec: 2, cmd: -3 } },
      { t: '위기의 한 방', d: '위기에서 꺼내는 공이에요 · 위기관리 ↑', fx: { mnt: 4, stf: 2, cmd: -2 } },
      { t: '정교한 역회전', d: '덜 휘는 대신 원하는 곳에 · 볼넷 ↓', fx: { cmd: 4, stf: -2 } },
    ],
  },
  fork: {
    ko: '포크볼', short: '포크볼', family: 'drop', base: 'FS', kmh: 0, pair: ['SL', 'CU'], color: '#C3A6FF', desc: '손가락 사이에 끼워 뚝 떨어지는 공',
    traits: [
      { t: '고속 포크', d: '빠르게 떨어져요 · 땅볼·헛스윙 ↑', fx: { stf: 3, cmd: -1, kmh: 4, gb: 4 } },
      { t: '낙차 큰 포크', d: '무릎 아래로 뚝 · 헛스윙 ↑↑', fx: { stf: 5, cmd: -3 } },
      { t: '스트라이크 포크', d: '존 안에서 떨어져 카운트를 잡아요', fx: { cmd: 4, stf: -2, use: 0.04 } },
    ],
  },
  splitter: {
    ko: '스플리터', short: '스플리터', family: 'drop', base: 'FS', kmh: 3, pair: ['SL', 'CU'], color: '#A98BFF', desc: '빠르게 오다 짧게 떨어지는 공',
    traits: [
      { t: '직구 같은 스플리터', d: '직구처럼 오다 가라앉아요 · 헛스윙 ↑', fx: { stf: 3, dec: 2, cmd: -2 } },
      { t: '땅볼 스플리터', d: '짧게 떨어져 낮은 땅볼 ↑', fx: { stf: 1, cmd: 1, gb: 12 } },
      { t: '아껴 둔 한 방', d: '2스트라이크에서만 꺼내요 · 위력 ↑↑', fx: { stf: 5, cmd: -3, use: -0.06 } },
    ],
  },
  // 특수
  knuckle: {
    ko: '너클볼', short: '너클볼', family: 'special', base: 'KN', kmh: 0, pair: ['CU', 'CH'], color: '#E8E4D8', desc: '회전 없이 흔들리며 오는 공 · 치기 어렵지만 볼넷이 늘어요',
    traits: [
      { t: '춤추는 너클', d: '어디로 갈지 몰라요 · 헛스윙 ↑ · 포일 ↑', fx: { stf: 5, cmd: -3 } },
      { t: '느린 너클', d: '더 느리게 흔들려 타이밍을 뺏어요', fx: { dec: 4, kmh: -5 } },
      { t: '잡히는 너클', d: '덜 흔들려 포수가 받기 쉬워요 · 볼넷 ↓', fx: { cmd: 5, stf: -3 } },
    ],
  },
  palm: {
    ko: '팜볼', short: '팜볼', family: 'special', base: 'CH', kmh: -6, pair: ['SL', 'CU'], color: '#D9B38C', desc: '손바닥으로 밀어 던지는 느린 낙차',
    traits: [
      { t: '무회전 낙하', d: '회전 없이 가라앉아요 · 헛스윙 ↑', fx: { stf: 4, cmd: -2 } },
      { t: '느린 공', d: '구속 차로 속여요 · 타이밍 뺏기 ↑', fx: { dec: 4, kmh: -4 } },
      { t: '땅볼형', d: '낮게 깔려요 · 땅볼 ↑', fx: { cmd: 2, gb: 10 } },
    ],
  },
};
export const FINISHER_IDS = Object.keys(FINISHERS) as FinisherId[];
export const isFinisher = (v: unknown): v is FinisherId => has(FINISHERS, v);
/** 옛 저장 — 결정구가 엔진 구종 코드였을 때 */
const OLD_PITCH: Record<PitchType, FinisherId> = { FF: 'four', SI: 'sinker', FC: 'cutter', SL: 'slider', SW: 'sweeper', CU: 'curve', CH: 'change', FS: 'fork', KN: 'knuckle' };

/** 추천 이름 — 영문 이니셜 · 부르는 이름 · 기본 결정구 */
export const SPECIAL_META: Record<SpecialName, { init: string; given: string; pitch: FinisherId }> = {
  이동규: { init: 'DK', given: '동규', pitch: 'slider' },
  엄승재: { init: 'SJ', given: '승재', pitch: 'fork' },
  박광원: { init: 'KW', given: '광원', pitch: 'four' },
  한유락: { init: 'YR', given: '유락', pitch: 'curve' },
  신희준: { init: 'HJ', given: '희준', pitch: 'change' },
  김범수: { init: 'BS', given: '범수', pitch: 'hardSlider' },
  이상준: { init: 'SJ', given: '상준', pitch: 'cutter' },
  박정환: { init: 'JH', given: '정환', pitch: 'sinker' },
  김정호: { init: 'JH', given: '정호', pitch: 'sweeper' },
  홍한길: { init: 'HG', given: '한길', pitch: 'knuckle' },
  장재관: { init: 'JG', given: '재관', pitch: 'knuckleCurve' },
};

/* ── 이름 — 직접 쓰면 한글 완성 글자만 2~4자 ── */
export const NAME_MIN = 2;
export const NAME_MAX = 4;
export const isSpecialName = (s: string) => /^[가-힣]{2,4}$/.test(s);
export const isPresetName = (s: string): s is SpecialName => has(SPECIAL_META, s);
const COMPOUND_SURNAMES = ['남궁', '제갈', '선우', '독고', '황보', '사공', '서문', '동방'];
/** 영문 표기가 개정 로마자 첫 글자와 다른 흔한 성 (김 KIM · 이 LEE · 조 CHO …) — 외자 이름 이니셜에만 쓴다 */
const SURNAME_INIT: Record<string, string> = { 김: 'K', 강: 'K', 고: 'K', 곽: 'K', 구: 'K', 권: 'K', 기: 'K', 금: 'K', 공: 'K', 경: 'K', 국: 'K', 감: 'K', 이: 'L', 임: 'L', 리: 'L', 림: 'L', 조: 'C' };
/** 초성 19자 순서의 첫 글자 (ㅇ 은 빈칸 — 모음으로) */
const CHO_INIT = 'GKNDTRMBPSS JJCKTPH';
/** 중성 21자 ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ */
const VOWEL_INIT = 'AAYYEEYYOWWOYUWWWYEEI';
/** 음절 하나의 영문 첫 글자 — 개정 로마자 초성, ㅇ 은 모음으로 (아 A · 유 Y · 은 E · 우 W · 운 U · 이 I) */
export function initialOf(ch: string): string {
  const c = ch.charCodeAt(0) - 0xac00;
  if (c < 0 || c > 11171) return '';
  const cho = Math.floor(c / 588), jung = Math.floor((c % 588) / 28), jong = c % 28;
  if (cho !== 11) return CHO_INIT[cho];
  // 받침 없는 '우'는 카드 영문 이름(cards/meta enName)처럼 WOO → W
  if (jung === 13) return jong === 0 ? 'W' : 'U';
  return VOWEL_INIT[jung];
}
/** 이름 → 영문 이니셜 · 부르는 이름 — 추천 이름은 정해 둔 값, 직접 쓴 이름은 홍길동 GD · 길동 / 남궁민수 MS · 민수 / 외자 이준 LJ · 이준 */
export function metaOfName(name: string): { init: string; given: string } {
  if (isPresetName(name)) return SPECIAL_META[name];
  const sur = name.length >= 3 && COMPOUND_SURNAMES.includes(name.slice(0, 2)) ? name.slice(0, 2) : name.slice(0, 1);
  const given = name.slice(sur.length);
  if (given.length >= 2) return { init: [...given].map(initialOf).join(''), given };
  // 외자 이름 — 부를 땐 성까지 붙이고, 이니셜은 성 + 이름
  return { init: (SURNAME_INIT[sur] ?? initialOf(sur)) + initialOf(given), given: name };
}

export type ArmSlot = 'over' | 'three' | 'side' | 'under';
export type Stance = 'open' | 'square' | 'closed';
export type Timing = 'kick' | 'tap' | 'none';
export type BatSkill = 'laser' | 'cannon' | 'bolt' | 'eye' | 'spray' | 'clutch' | 'firstPitch' | 'cut' | 'bunt' | 'lefty' | 'righty' | 'fastball' | 'breaking';
export type BuildPreset = 'lean' | 'balanced' | 'power';

export interface SpecialCfg {
  /** 추천 이름(SPECIAL_NAMES) 또는 직접 쓴 한글 2~4자 */
  name: string;
  type: 'P' | 'B';
  role: PitcherRole;
  pos: Exclude<Pos, 'P'>;
  throws: Hand;
  bats: BatSide;
  arm: ArmSlot;
  stance: Stance;
  timing: Timing;
  /** 결정구 */
  pitch: FinisherId;
  /** 결정구 특징 0~2 */
  pitchFx: number;
  sigStyle: 'initials' | 'given';
  /** 타격 특기 1~3개 — 맨 앞이 대표(이름이 붙는 특기) */
  skills: BatSkill[];
  build: BuildPreset;
  hair: HairStyle;
  beard: FacialHair;
  /** 얼굴 돌리기 횟수 */
  seed: number;
  chant: number;
}
export const SKILL_MAX = 3;

export const DEFAULT_SPECIAL: SpecialCfg = {
  name: '이동규', type: 'P', role: 'SP', pos: 'SS', throws: 'R', bats: 'R', arm: 'side', stance: 'square', timing: 'kick',
  pitch: 'slider', pitchFx: 0, sigStyle: 'initials', skills: ['laser'], build: 'balanced', hair: 'crew', beard: 'none', seed: 0, chant: 0,
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
export const STANCE_KO: Record<Stance, string> = { open: '오픈', square: '스퀘어', closed: '클로즈드' };
export const TIMING_KO: Record<Timing, string> = { kick: '레그킥', tap: '토탭', none: '노스텝' };

/* ── 타격 특기 — r 은 타자 칸(컨택·파워·갭·선구·삼진 회피·주루·수비·송구), a 는 상세 능력치에 바로 ── */
type BatR = 'con' | 'pow' | 'gap' | 'eye' | 'avk' | 'spd' | 'dfn' | 'arm';
export interface SkillInfo {
  /** 판 · 대표 특기 이름 ('DK 레이저') */
  ko: string;
  /** 대표가 아닐 때 이름 */
  full: string;
  /** 판 아래 한 줄 */
  sub: string;
  lines: [string, string];
  r?: Partial<Record<BatR, number>>;
  a?: Partial<Record<AttrKey, number>>;
}
export const SKILLS: Record<BatSkill, SkillInfo> = {
  laser: { ko: '레이저', full: '레이저 라인드라이브', sub: '안타 ↑', lines: ['낮고 빠른 타구로 안타를 쌓아요', '컨택 ↑ · 뜬공 ↓'], r: { con: 3, gap: 4 }, a: { launchTend: -4 } },
  cannon: { ko: '대포', full: '대포', sub: '홈런 ↑', lines: ['당겨친 뜬공이 담장을 넘어가요', '스윙이 커서 삼진은 조금 ↑'], r: { pow: 7, avk: -4 }, a: { strength: 7, pullTend: 10, launchTend: 5 } },
  bolt: { ko: '번개 주루', full: '번개 주루', sub: '도루 ↑', lines: ['도루 스타트가 빨라요 · 한 베이스 더', '빠른 발로 내야 안타 ↑'], r: { spd: 4, pow: -2 }, a: { stealJump: 4, baserunning: 2 } },
  eye: { ko: '현미경', full: '현미경 선구안', sub: '볼넷 ↑', lines: ['볼을 잘 골라 출루 ↑', '나쁜 공엔 방망이가 안 나가요'], r: { eye: 6, pow: -1 }, a: { swingTend: -10 } },
  spray: { ko: '스프레이', full: '스프레이 히터', sub: '밀어치기', lines: ['타구가 좌우로 고르게 퍼져요', '수비 시프트에 강해요'], r: { con: 3, gap: 1, pow: -1 }, a: { pullTend: -14 } },
  clutch: { ko: '클러치', full: '클러치 히터', sub: '찬스 ↑', lines: ['득점권에서 더 침착해요', '접전일수록 정확하게 맞혀요'], r: { con: 3 }, a: { composure: 10, concentration: 6 } },
  firstPitch: { ko: '초구 사냥꾼', full: '초구 사냥꾼', sub: '초구 공략', lines: ['초구부터 노려 쳐요 · 적극성 ↑', '빠른 카운트 장타 ↑ · 볼넷 ↓'], r: { pow: 3, con: 1, eye: -2 }, a: { swingTend: 16 } },
  cut: { ko: '커트 장인', full: '커트 장인', sub: '삼진 ↓', lines: ['2스트라이크에서 끈질겨요 · 삼진 ↓', '투수의 투구 수를 늘려요'], r: { avk: 8, con: 1, pow: -2 } },
  bunt: { ko: '번트 장인', full: '번트 장인', sub: '번트 ↑', lines: ['희생·기습 번트 성공 ↑', '1루까지 빨라요'], r: { spd: 2, pow: -1 }, a: { bunt: 18 } },
  lefty: { ko: '좌완 킬러', full: '좌완 킬러', sub: '좌투 상대 ↑', lines: ['좌투수 공이 잘 보여요 · 컨택 ↑↑', '우투수 상대로는 조금 ↓'], a: { contactL: 9, contactR: -2 } },
  righty: { ko: '우완 킬러', full: '우완 킬러', sub: '우투 상대 ↑', lines: ['우투수 공이 잘 보여요 · 컨택 ↑', '좌투수 상대로는 조금 ↓'], a: { contactR: 5, contactL: -3 } },
  fastball: { ko: '직구 킬러', full: '직구 킬러', sub: '강속구 ↑', lines: ['빠른 공에 늦지 않아요 · 직구 장타 ↑', '변화구엔 조금 약해요'], r: { pow: 1 }, a: { vsFast: 10, vsBreak: -3 } },
  breaking: { ko: '변화구 킬러', full: '변화구 킬러', sub: '변화구 ↑', lines: ['떨어지는 공에 속지 않아요', '빠른 공엔 조금 약해요'], r: { eye: 1 }, a: { vsBreak: 10, vsFast: -3 } },
};
export const SKILL_IDS = Object.keys(SKILLS) as BatSkill[];
export const isSkill = (v: unknown): v is BatSkill => has(SKILLS, v);

export const BUILD_KO: Record<BuildPreset, { ko: string; h: number; w: number }> = {
  lean: { ko: '날렵', h: 181, w: 75 },
  balanced: { ko: '균형', h: 185, w: 86 },
  power: { ko: '거포', h: 188, w: 102 },
};
export const HAIR_KO: [HairStyle, string][] = [['crew', '짧게'], ['twoblock', '투블럭'], ['buzz', '삭발'], ['perm', '파마'], ['flow', '장발'], ['tied', '묶음']];
export const BEARD_KO: [FacialHair, string][] = [['none', '없음'], ['stubble', '까칠'], ['goatee', '염소'], ['mustache', '콧수염'], ['beard', '턱수염']];
export const POS_SHORT: Record<Exclude<Pos, 'P'>, string> = { C: '포수', '1B': '1루', '2B': '2루', '3B': '3루', SS: '유격', LF: '좌익', CF: '중견', RF: '우익', DH: '지명' };

/** 고른 결정구의 특징 */
export const pitchTrait = (c: SpecialCfg): PitchTrait => FINISHERS[c.pitch].traits[clamp(Math.round(c.pitchFx) || 0, 0, 2)];
/** 좌투가 드문 자리(포수·2루·유격·3루) — 송구 −3 */
export const oddThrow = (c: SpecialCfg) => c.type === 'B' && c.throws === 'L' && ['C', '2B', 'SS', '3B'].includes(c.pos);

/* ── 효과 숫자 → 짧은 글 ('위력 +4' · '제구 −2') ── */
export interface FxChip { text: string; tone: 'up' | 'down' | 'tend' }
const sgn = (v: number) => (v > 0 ? `+${v}` : `−${-v}`);
const TONE_ORDER = { up: 0, tend: 1, down: 2 } as const;
const byTone = (xs: FxChip[]) => xs.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
export function pitchFxChips(fx: PitchFx): FxChip[] {
  const out: FxChip[] = [];
  const num = (v: number | undefined, ko: string) => { if (v) out.push({ text: `${ko} ${sgn(v)}`, tone: v > 0 ? 'up' : 'down' }); };
  num(fx.stf, '위력'); num(fx.cmd, '제구'); num(fx.vel, '구속'); num(fx.dec, '디셉션'); num(fx.ext, '익스텐션'); num(fx.mnt, '위기관리');
  if (fx.kmh) out.push({ text: `${sgn(fx.kmh)}km/h`, tone: 'tend' });
  if (fx.gb) out.push({ text: fx.gb > 0 ? `땅볼 +${fx.gb}` : `뜬공 +${-fx.gb}`, tone: 'tend' });
  if (fx.use) out.push({ text: `구사 ${sgn(Math.round(fx.use * 100))}%`, tone: 'tend' });
  return byTone(out);
}
const R_KO: Record<BatR, string> = { con: '컨택', pow: '파워', gap: '갭', eye: '선구', avk: '삼진 회피', spd: '주루', dfn: '수비', arm: '송구' };
/** 성향은 좋고 나쁨이 아니라 방향 — [올릴 때, 내릴 때] */
const TEND_KO: Partial<Record<AttrKey, [string, string]>> = { pullTend: ['당겨치기', '밀어치기'], launchTend: ['띄워 치기', '낮은 탄도'], swingTend: ['적극 스윙', '공 기다리기'] };
export function skillChips(k: BatSkill): FxChip[] {
  const s = SKILLS[k];
  const out: FxChip[] = [];
  for (const [key, v] of Object.entries(s.r ?? {})) if (v) out.push({ text: `${R_KO[key as BatR]} ${sgn(v)}`, tone: v > 0 ? 'up' : 'down' });
  for (const [key, v] of Object.entries(s.a ?? {})) {
    if (!v) continue;
    const t = TEND_KO[key as AttrKey];
    out.push(t ? { text: t[v > 0 ? 0 : 1], tone: 'tend' } : { text: `${ATTR_KO[key as AttrKey]} ${sgn(v)}`, tone: v > 0 ? 'up' : 'down' });
  }
  return byTone(out);
}

/** 고유 구종 — 이름 약자형 'DK 고속 슬라이더' 또는 이름형 '동규 고속 슬라이더' */
export function specialSignature(c: SpecialCfg): SignaturePitch {
  const m = metaOfName(c.name);
  const f = FINISHERS[c.pitch];
  const tr = pitchTrait(c);
  return {
    name: `${c.sigStyle === 'initials' ? m.init : m.given} ${f.ko}`,
    base: f.base,
    style: 'initials',
    effect: `${tr.t} — ${tr.d} (특별 선수 전용)`,
    color: f.color,
  };
}
/** 타격 특기 — 대표는 'DK 레이저', 나머지는 특기 이름 그대로 */
export function specialSkills(c: SpecialCfg): { id: BatSkill; name: string; effect: string; main: boolean }[] {
  const m = metaOfName(c.name);
  return c.skills.map((k, i) => ({
    id: k,
    name: i === 0 ? `${c.sigStyle === 'initials' ? m.init : m.given} ${SKILLS[k].ko}` : SKILLS[k].full,
    effect: SKILLS[k].lines.join(' · '),
    main: i === 0,
  }));
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

/** 얼굴 시드 — 고른 머리 · 수염은 SD 그림(src/art/sd)이 그대로 따르도록 시드 끝에 붙인다: 'sp:이름:번호~머리~수염' */
export function findLook(c: SpecialCfg): string {
  return `sp:${c.name}:${c.seed}~${c.hair}~${c.beard}`;
}

/* ── 몸 만들기 — 칸(투수 6 · 타자 8) → 상세 능력치 45 → 카드 앞면 6 ──
   실제 선수 카탈로그와 같은 식(game/kbo 의 buildAttrs · faceOf — docs/실제선수데이터.md 6절)을 따른다. 그 함수들은 kbo 밖으로
   나와 있지 않아 여기서 같은 식을 쓴다(해시 흔들림만 뺌 — 같은 설정이면 늘 같은 선수). 그래서 리그의 실제 선수들과 같은 눈금으로 엔진에 들어간다. */
const R15 = (v: number) => clamp(Math.round(v), 15, 99);
const RT = (v: number) => clamp(Math.round(v), 10, 95);
const wsum = (a: AttrMap, parts: [AttrKey, number][]) => Math.round(parts.reduce((s, [k, x]) => s + (a[k] ?? 50) * x, 0));
const DEF_KEYS: Record<string, [AttrKey, number][]> = {
  C: [['block', 0.4], ['framing', 0.3], ['armStr', 0.3]],
  '1B': [['hands', 0.5], ['range', 0.3], ['firstStep', 0.2]],
  '2B': [['range', 0.3], ['firstStep', 0.25], ['hands', 0.2], ['turnDP', 0.25]],
  '3B': [['firstStep', 0.35], ['hands', 0.3], ['armStr', 0.35]],
  SS: [['range', 0.35], ['firstStep', 0.25], ['hands', 0.2], ['armStr', 0.2]],
  LF: [['range', 0.5], ['firstStep', 0.3], ['hands', 0.2]],
  CF: [['range', 0.5], ['firstStep', 0.35], ['hands', 0.15]],
  RF: [['range', 0.4], ['firstStep', 0.25], ['armStr', 0.35]],
};
const VELO_OFF: Record<PitchType, number> = { FF: 0, SI: -2, FC: -5, SL: -12, SW: -16, CU: -22, CH: -14, FS: -10, KN: -36 };
const FAST_TYPES: PitchType[] = ['FF', 'SI', 'FC'];
/** 팔 각도 — 구속 · 변화 · 디셉션 · 땅볼 성향 · 익스텐션 · 구속 표시(사이드 −4 · 언더 −10 km/h) */
const ARM_FX: Record<ArmSlot, { vel: number; brk: number; dec: number; gb: number; ext: number; kmh: number }> = {
  over: { vel: 2, brk: 0, dec: 0, gb: -4, ext: 3, kmh: 0 },
  three: { vel: 0, brk: 1, dec: 1, gb: 0, ext: 0, kmh: 0 },
  side: { vel: -2, brk: 3, dec: 3, gb: 12, ext: -2, kmh: 4 },
  under: { vel: -5, brk: 2, dec: 5, gb: 18, ext: -4, kmh: 10 },
};
/** 종합 − 1 (kbo 식의 lvl) — 투수 86 · 타자 85 */
const P_LVL = 85, B_LVL = 84;

/** 투수 칸 — 구속 · 구위 · 변화 · 제구 · 체력 · 회복 · 위기관리 (팔 각도 · 보직 · 체격 · 특징이 더해진다) */
function pitcherRatings(c: SpecialCfg, fx: PitchFx) {
  const a = ARM_FX[c.arm];
  return {
    vel: 85 + a.vel + (c.role === 'CL' ? 3 : c.role === 'RP' ? 1 : 0) + (c.build === 'power' ? 1 : c.build === 'lean' ? -1 : 0) + (fx.vel ?? 0),
    stf: 85 + (c.build === 'power' ? 1 : 0),
    brk: 82 + a.brk,
    ctl: 81 - (c.arm === 'under' ? 2 : 0) + (c.build === 'lean' ? 1 : 0),
    sta: c.role === 'SP' ? 90 + (c.build === 'power' ? 2 : c.build === 'lean' ? -2 : 0) : 64,
    rec: c.role === 'SP' ? 62 : 86,
    mnt: 88 + (fx.mnt ?? 0),
  };
}
const kmhOf = (vel: number, t: PitchType, arm: ArmSlot, extra = 0) => Math.round(118 + 0.36 * vel + VELO_OFF[t] * 0.85 - ARM_FX[arm].kmh + extra);
/** 결정구 판에 보이는 구속 — 지금 고른 공이면 특징까지 넣어서 */
export function finisherKmh(c: SpecialCfg, id: FinisherId): number {
  const f = FINISHERS[id];
  const fx = id === c.pitch ? pitchTrait(c).fx : {};
  return kmhOf(pitcherRatings(c, fx).vel, f.base, c.arm, f.kmh + (fx.kmh ?? 0));
}

/**
 * 구종표 — 직구 + 결정구(가장 셈) + 짝 하나. 결정구가 포심 계열이면 그 공이 곧 직구이고 짝이 둘. 사이드·언더는 직구가 투심.
 * 엔진 맞춤(시즌 엔진으로 잰 평균자책이 결정구끼리 비슷하게): 투심·싱커 결정구는 포심을 직구로 두고(엔진의 투심은 맞히기 쉬운 공이라
 * 절반을 던지면 크게 손해), 직구 계열 결정구(커터·투심·싱커)는 2스트라이크 결정구 몫을 할 짝 변화구를 더 다듬는다.
 * 너클볼은 엔진이 이미 제구를 크게 흔들어서(위치 흔들림 ×1.5) 여기선 제구를 깎지 않고, 구사율을 낮추고 위력을 조금 얹는다(그래도 볼넷은 많은 편).
 */
function arsenal(c: SpecialCfg, r: ReturnType<typeof pitcherRatings>, fx: PitchFx, sigName: string): Pitch[] {
  const f = FINISHERS[c.pitch];
  const fbFin = f.base === 'FF';
  const primary: PitchType = fbFin || f.base === 'SI' ? 'FF' : c.arm === 'side' || c.arm === 'under' ? 'SI' : 'FF';
  const fastFin = FAST_TYPES.includes(f.base);
  const rest = f.pair.filter((t) => t !== primary && t !== f.base);
  const types: PitchType[] = fbFin ? [f.base, ...rest.slice(0, 2)] : [primary, f.base, ...rest.slice(0, 1)];
  const fi = fbFin ? 0 : 1;
  const rp = c.role !== 'SP';
  const use = f.base === 'KN' ? (rp ? [0.6, 0.3, 0.1] : [0.55, 0.3, 0.15]) : fbFin ? (rp ? [0.6, 0.3, 0.1] : [0.52, 0.28, 0.2]) : rp ? [0.55, 0.35, 0.1] : [0.48, 0.32, 0.2];
  const du = fx.use ?? 0;
  use[fi] += du;
  use[fbFin ? 1 : 0] -= du;
  return types.map((t, i) => {
    const fin = i === fi;
    const base = FAST_TYPES.includes(t) ? r.stf : r.brk;
    return {
      type: t,
      ko: fin ? sigName : PITCH_KO[t],
      stuff: R15(base + (fin ? 1 + (f.base === 'KN' ? 2 : 0) + (fx.stf ?? 0) : t === primary ? -1 : fastFin && !fbFin ? 0 : -3)),
      command: R15(r.ctl + (fin ? fx.cmd ?? 0 : t === primary ? -1 : -2) - (t === 'CU' ? 3 : 0)),
      usage: Math.round(use[i] * 100) / 100,
      kmh: kmhOf(r.vel, t, c.arm, fin ? f.kmh + (fx.kmh ?? 0) : 0),
    };
  });
}

function pitcherBody(c: SpecialCfg, sigName: string, heightCm: number) {
  const fx = pitchTrait(c).fx;
  const r = pitcherRatings(c, fx);
  const arm = ARM_FX[c.arm];
  const L = P_LVL;
  const attrs: AttrMap = {
    velocity: R15(r.vel), control: R15(r.ctl),
    deception: R15((r.stf + r.brk) / 2 + arm.dec + (fx.dec ?? 0)),
    extension: R15(r.vel - 2 + arm.ext + (heightCm - 185) * 0.5 + (fx.ext ?? 0)),
    stamina: R15(r.sta), recovery: R15(r.rec),
    pickoff: R15(52 + (c.throws === 'L' ? 8 : 0)), slideStep: 56, pFielding: R15(50 + (L - 60) * 0.3),
    gbTend: RT(50 + arm.gb + (r.ctl - r.stf) * 0.4 + (fx.gb ?? 0)),
    composure: R15(r.mnt), concentration: R15(r.mnt - 2), competitiveness: L - 6,
    leadership: L - 10, teamwork: L - 6, baseballIQ: L - 4,
    durability: R15(50 + (r.sta - 50) * 0.5), agility: L - 8,
    strength: R15(r.vel - 4 + (c.build === 'power' ? 4 : c.build === 'lean' ? -3 : 0)),
  };
  const pitches = arsenal(c, r, fx, sigName);
  // 카드 앞면 — kbo · 목업과 같은 식
  const best = Math.max(...pitches.map((x) => x.stuff), 40);
  const brk = pitches.filter((x) => !FAST_TYPES.includes(x.type)).map((x) => x.stuff).sort((x, y) => y - x);
  const brkV = brk.length >= 2 ? Math.round((brk[0] + brk[1]) / 2) : brk.length === 1 ? Math.round(brk[0] * 0.85 + 10) : 50;
  const cmd = pitches.reduce((t, x) => t + x.command * x.usage, 0);
  const mntF = { code: 'MNT', ko: '위기관리', v: wsum(attrs, [['composure', 0.5], ['concentration', 0.3], ['baseballIQ', 0.2]]) };
  const face: Player['face'] = [
    { code: 'VEL', ko: '구속', v: attrs.velocity ?? 50 }, { code: 'STF', ko: '구위', v: best }, { code: 'BRK', ko: '변화', v: brkV },
    { code: 'CTL', ko: '제구', v: Math.round(0.6 * (attrs.control ?? 50) + 0.4 * cmd) },
    c.role === 'SP' ? { code: 'STA', ko: '체력', v: attrs.stamina ?? 50 } : { code: 'REC', ko: '회복', v: attrs.recovery ?? 50 },
    mntF,
  ];
  return { attrs, pitches, face };
}

/** 타자 칸 기본 — 야수 · 포수 · 지명 */
const BAT_BASE: Record<'F' | 'C' | 'DH', Record<BatR, number>> = {
  F: { con: 84, pow: 80, gap: 80, eye: 80, avk: 80, spd: 79, dfn: 82, arm: 82 },
  C: { con: 82, pow: 80, gap: 79, eye: 81, avk: 80, spd: 72, dfn: 86, arm: 84 },
  DH: { con: 86, pow: 84, gap: 82, eye: 82, avk: 80, spd: 72, dfn: 45, arm: 50 },
};
function batterBody(c: SpecialCfg) {
  const r = { ...BAT_BASE[c.pos === 'C' ? 'C' : c.pos === 'DH' ? 'DH' : 'F'] };
  if (c.build === 'power') { r.pow += 5; r.gap += 1; r.spd -= 5; } else if (c.build === 'lean') { r.pow -= 4; r.spd += 5; }
  if (oddThrow(c)) r.arm -= 3;
  for (const k of c.skills) for (const [key, v] of Object.entries(SKILLS[k].r ?? {})) r[key as BatR] += v ?? 0;
  const { con, pow, gap, eye, avk, spd, dfn, arm } = r;
  const L = B_LVL;
  // 좌우 상성: 좌타는 우투 상대가 더 낫다 (kbo 와 같은 폭)
  const plat = c.bats === 'L' ? [3, -5] : c.bats === 'R' ? [-2, 3] : [0, 0];
  const a: AttrMap = {
    contactR: con + plat[0], contactL: con + plat[1], power: pow, gap, eye, avoidK: avk,
    vsFast: (con + pow) / 2, vsBreak: (con + eye) / 2, bunt: (con + spd) / 2 - 6,
    speed: spd, baserunning: spd - 2, stealJump: spd, sliding: spd - 4,
    range: dfn + (spd - 60) * 0.2, firstStep: dfn, hands: dfn,
    armStr: arm, armAcc: (arm + dfn) / 2, turnDP: dfn - (c.pos === '2B' || c.pos === 'SS' ? 0 : 8),
    composure: L - 8, concentration: (con + eye) / 2 - 6, competitiveness: L - 6,
    leadership: L - 10, teamwork: L - 6, baseballIQ: (eye + dfn) / 2 - 4,
    durability: 70, agility: (spd + dfn) / 2, strength: pow - 2 + (c.build === 'power' ? 4 : c.build === 'lean' ? -3 : 0),
  };
  if (c.pos === 'C') Object.assign(a, { block: dfn, framing: dfn - 2, popTime: (arm + dfn) / 2, pitcherLead: dfn });
  const tend: AttrMap = { pullTend: 50 + (pow - 60) * 0.8, launchTend: 50 + (pow - 60) * 1.0, swingTend: 50 + (avk < 55 ? 8 : -4) - (eye - 60) * 0.4 };
  for (const k of c.skills) {
    for (const [key, v] of Object.entries(SKILLS[k].a ?? {})) {
      const kk = key as AttrKey;
      if (kk in tend) tend[kk] = (tend[kk] ?? 50) + (v ?? 0);
      else a[kk] = (a[kk] ?? 50) + (v ?? 0);
    }
  }
  const attrs: AttrMap = {};
  for (const [k, v] of Object.entries(a)) attrs[k as AttrKey] = R15(v ?? 50);
  for (const [k, v] of Object.entries(tend)) attrs[k as AttrKey] = RT(v ?? 50);
  // 카드 앞면 — kbo · 목업과 같은 식
  const CON = { code: 'CON', ko: '컨택', v: wsum(attrs, [['contactR', 0.7], ['contactL', 0.3]]) };
  const POW = { code: 'POW', ko: '파워', v: wsum(attrs, [['power', 0.8], ['gap', 0.2]]) };
  const EYE = { code: 'EYE', ko: '선구', v: wsum(attrs, [['eye', 0.7], ['avoidK', 0.3]]) };
  const SPD = { code: 'SPD', ko: '주루', v: wsum(attrs, [['speed', 0.7], ['baserunning', 0.2], ['stealJump', 0.1]]) };
  const face: Player['face'] = c.pos === 'C'
    ? [CON, POW, EYE, { code: 'BLK', ko: '블로킹', v: attrs.block ?? 50 }, { code: 'FRM', ko: '프레이밍', v: wsum(attrs, [['framing', 0.75], ['pitcherLead', 0.25]]) }, { code: 'CS', ko: '도루저지', v: wsum(attrs, [['popTime', 0.6], ['armStr', 0.4]]) }]
    : c.pos === 'DH'
      ? [CON, POW, EYE, { code: 'GAP', ko: '장타', v: wsum(attrs, [['gap', 0.6], ['power', 0.4]]) }, { code: 'ADJ', ko: '대처', v: wsum(attrs, [['vsFast', 0.5], ['vsBreak', 0.5]]) }, SPD]
      : [CON, POW, EYE, SPD, { code: 'DEF', ko: '수비', v: wsum(attrs, DEF_KEYS[c.pos] ?? DEF_KEYS.LF) }, { code: 'ARM', ko: '송구', v: wsum(attrs, [['armStr', 0.7], ['armAcc', 0.3]]) }];
  return { attrs, face };
}

/** 설정 → 선수 (처음엔 강하지만 대전 밸런스를 깨지 않게: 종합 85~86 · 잠재력 최고) — 특징·특기는 서로 맞바꾸는 값이라 어느 쪽을 골라도 종합은 같다 */
export function buildSpecial(c: SpecialCfg, team: Team): Player {
  const isP = c.type === 'P';
  const b = BUILD_KO[c.build];
  const pb = isP ? pitcherBody(c, specialSignature(c).name, b.h) : null;
  const body = pb ?? batterBody(c);
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
    ovr: isP ? 86 : 85,
    face: body.face,
    attrs: body.attrs,
    ...(pb ? { pitches: pb.pitches } : {}),
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

/** 저장된 특별 선수 설정 읽기 — 옛 저장(추천 11명 이름 · 결정구가 엔진 구종 코드 · 특기 하나 skill)도 그대로 열린다 */
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : d);
export function normalizeSpecial(raw: unknown): SpecialCfg {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SPECIAL;
  const p = v.pitch;
  const skills = [...new Set((Array.isArray(v.skills) ? v.skills : [v.skill]).filter(isSkill))].slice(0, SKILL_MAX);
  const fxI = typeof v.pitchFx === 'number' ? Math.round(v.pitchFx) : 0;
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
  return {
    name: typeof v.name === 'string' && isSpecialName(v.name) ? v.name : d.name,
    type: oneOf(v.type, ['P', 'B'] as const, d.type),
    role: oneOf(v.role, ['SP', 'RP', 'CL'] as const, d.role),
    pos: oneOf(v.pos, Object.keys(POS_SHORT) as Exclude<Pos, 'P'>[], d.pos),
    throws: oneOf(v.throws, ['R', 'L'] as const, d.throws),
    bats: oneOf(v.bats, ['R', 'L', 'S'] as const, d.bats),
    arm: oneOf(v.arm, Object.keys(ARM_KO) as ArmSlot[], d.arm),
    stance: oneOf(v.stance, Object.keys(STANCE_KO) as Stance[], d.stance),
    timing: oneOf(v.timing, Object.keys(TIMING_KO) as Timing[], d.timing),
    pitch: isFinisher(p) ? p : has(OLD_PITCH, p) ? OLD_PITCH[p as PitchType] : d.pitch,
    pitchFx: fxI >= 0 && fxI <= 2 ? fxI : 0,
    sigStyle: oneOf(v.sigStyle, ['initials', 'given'] as const, d.sigStyle),
    skills: skills.length ? skills : d.skills.slice(),
    build: oneOf(v.build, Object.keys(BUILD_KO) as BuildPreset[], d.build),
    hair: oneOf(v.hair, HAIR_KO.map(([k]) => k), d.hair),
    beard: oneOf(v.beard, BEARD_KO.map(([k]) => k), d.beard),
    seed: num(v.seed),
    chant: num(v.chant),
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
      club: v.club && isTeamId(v.club) ? v.club : DEFAULT_START.club,
      picks: Array.isArray(v.picks) ? v.picks.slice(0, 3) : [],
      special: normalizeSpecial(v.special),
      level: AI_LEVELS.some((l) => l.id === v.level) ? v.level! : RECOMMENDED,
    };
  } catch {
    return DEFAULT_START;
  }
}
export function saveStart(s: StartState) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 이번 방문만 */ }
}

/** 예전에 능력치 없이 저장된 특별 선수(bb.special — attrs 가 비어 경기 계산에서 힘을 못 쓰던 것)를 지금 설정으로 다시 만든다.
 *  앱이 뜰 때(main.tsx, 기본 선수단을 만들기 전) 한 번 */
export function repairSpecial() {
  try {
    const raw = localStorage.getItem('bb.special');
    if (!raw) return;
    const p = JSON.parse(raw) as Player;
    const ok = !!p?.attrs && Object.keys(p.attrs).length > 0 && (p.pos !== 'P' || (p.pitches?.length ?? 0) > 0);
    if (ok) return;
    const st = loadStart();
    localStorage.setItem('bb.special', JSON.stringify(buildSpecial(st.special, teamById(st.club))));
  } catch { /* 그대로 둔다 */ }
}
