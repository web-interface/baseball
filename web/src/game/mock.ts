// 목업 데이터 — 2027 시즌. 서버·엔진이 붙기 전까지 모든 화면이 이것만 본다.
// 값은 시드 난수로 만들어 매번 같다. 실제 선수·구단 이름은 쓰지 않는다(지역명 + 우리말 별명 + 즈).
// 구단 10개는 세계관(04_world.json → game/world.ts) 그대로 — 요구사항 34번 확정 이름. 옛 구단 10개(카드·부활 구단)는 world.ts OLD_CLUBS.

import { GRADES } from './grades';
import { ALL_CLUBS, CURRENT_SEASON, FIRST_SEASON, OLD_CLUBS, SPECIAL_PLAYER_NAMES } from './world';
import { clubTitles } from './clubSeasons';
import { PITCH_KO } from './labels';
import { fenceAt, mToField, polarToField } from './field';
import type {
  AttrKey, AttrMap, BatSide, BattingLine, CardInst, ClubCode, GradeId, Hand, Lineup, LineupEval, Me, MatchRecord, NewsItem,
  NextGame, Origin, Pack, Pitch, PitcherRole, PitchingLine, PitchType, Play, Player, Pos, PvpOpponent, Roulette, ScoutShop,
  SignaturePitch, StandingRow, Team, UserRankRow, Weather, WeatherKey,
} from './types';

/* ───────── 시드 난수 ───────── */
function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed: string) {
  let a = hashStr(seed) || 1;
  const next = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => {
    let u = 0, v = 0;
    while (u === 0) u = next();
    while (v === 0) v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return { next, gauss };
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r2 = (v: number) => Math.round(v * 100) / 100;

/* ───────── 시즌 ───────── */
export const SEASON = 2027;
export const TODAY = '2027-06-14';

/* ───────── 구단 — 세계관(world.ts, 요구사항 34번 확정 이름) 현재 10 + 옛 10 ───────── */
const lumOf = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const CAP: Record<ClubCode, string> = {
  DJ: 'D', GJ: 'G', DG: 'D', BS: 'B', SB: 'S', ST: 'T', SH: 'H', IC: 'I', CW: 'C', SW: 'W',
  DDG: 'D', MDH: 'M', HBE: 'H', SCR: 'C', ISB: 'S', IJR: 'J', IDR: 'D', SUC: 'S', JDR: 'J', IBY: 'B',
};
const WORDMARK: Record<ClubCode, string> = {
  DJ: 'DAEJEON', GJ: 'GWANGJU', DG: 'DAEGU', BS: 'BUSAN', SB: 'SEOUL', ST: 'SEOUL', SH: 'SEOUL', IC: 'INCHEON', CW: 'CHANGWON', SW: 'SUWON',
  DDG: 'SEOUL', MDH: 'MUDEUNG', HBE: 'HANBAT', SCR: 'SEOUL', ISB: 'INCHEON', IJR: 'INCHEON', IDR: 'INCHEON', SUC: 'SUWON', JDR: 'JEONJU', IBY: 'INCHEON',
};
const AWAY: Record<ClubCode, 'primary' | 'gray'> = {
  DJ: 'primary', GJ: 'primary', DG: 'gray', BS: 'gray', SB: 'gray', ST: 'primary', SH: 'primary', IC: 'primary', CW: 'gray', SW: 'primary',
  DDG: 'gray', MDH: 'primary', HBE: 'gray', SCR: 'gray', ISB: 'primary', IJR: 'gray', IDR: 'primary', SUC: 'gray', JDR: 'primary', IBY: 'primary',
};
const PIN: Partial<Record<ClubCode, boolean>> = { ST: true, SB: true, DDG: true, SCR: true };
const BACKDROP: Record<ClubCode, Team['stadium']['backdrop']> = {
  DJ: 'river', GJ: 'river', DG: 'mountain', BS: 'sea', SB: 'city', ST: 'city', SH: 'none', IC: 'sea', CW: 'sea', SW: 'fortress',
  DDG: 'city', MDH: 'mountain', HBE: 'mountain', SCR: 'river', ISB: 'sea', IJR: 'sea', IDR: 'sea', SUC: 'fortress', JDR: 'mountain', IBY: 'sea',
};
const ZONE: Record<string, Team['zone']> = { han: '한강 권역', jungbu: '중부·호남 권역', nakdong: '낙동 권역' };
type ClubInfo = (typeof ALL_CLUBS)[number];
const oldOf = (c: ClubInfo) => OLD_CLUBS.find((o) => o.code === c.code);

function toTeam(c: ClubInfo): Team {
  const code = c.code as ClubCode;
  const st = c.stadiumTraits;
  const o = oldOf(c);
  return {
    id: code.toLowerCase(),
    code,
    region: c.regionName,
    short: c.short,
    name: c.name,
    abbr: code,
    cap: CAP[code],
    wordmark: WORDMARK[code],
    uniform: { awayBase: AWAY[code], pinstripe: PIN[code] },
    colors: { primary: c.colors.primary, secondary: c.colors.secondary, accent: c.colors.accent, ink: lumOf(c.colors.primary) > 0.32 ? '#14110D' : '#F7F4EC' },
    colorNames: c.colorNames,
    emblem: code,
    stadium: {
      name: c.stadium,
      desc: c.stadiumDesc,
      fence: [st.lf, st.cf, st.rf],
      wallM: [st.fenceM.lf, st.fenceM.cf, st.fenceM.rf],
      roof: st.roof === '돔' ? 'dome' : 'open',
      surface: st.surface === '인조잔디' ? 'turf' : 'natural',
      foul: st.foul === '좁음' ? 'narrow' : st.foul === '넓음' ? 'wide' : 'normal',
      wind: st.wind,
      climate: st.climate,
      note: st.parkNote,
      backdrop: BACKDROP[code],
    },
    zone: ZONE[c.regionGroup],
    style: c.style,
    styleKey: c.styleKey,
    styleDesc: c.styleDesc,
    tier: c.tier as Team['tier'],
    difficulty: c.tier === '강' ? 2 : c.tier === '중' ? 3 : 4,
    founded: c.founded,
    titles: clubTitles(code).slice(),
    rival: c.rival as ClubCode,
    rivalry: c.rivalry,
    mascot: c.mascot,
    blurb: o ? o.blurb : c.stadiumDesc,
    era: [c.era[0], c.era[1]],
    ...(o ? { old: true, revives: o.revives as ClubCode, homes: o.homes.map((h) => ({ ...h })) } : {}),
  } satisfies Team;
}

/** 현재 구단 10 (2027 리그 기본 구성 — 부활과 상관없이 늘 같다) */
export const CURRENT_TEAMS: Team[] = ALL_CLUBS.filter((c) => !oldOf(c)).map(toTeam);
/** 옛 구단 10 */
export const OLD_TEAMS: Team[] = OLD_CLUBS.map(toTeam);
/** 현재 + 옛 20 — 카드·구단팩·세트덱 */
export const ALL_TEAMS: Team[] = [...CURRENT_TEAMS, ...OLD_TEAMS];
/** 2027 한별 리그 10개 구단 — 옛 구단을 시작 구단으로 고르면 그 계보 자리를 부활 구단이 대신한다(아래 applyRevival) */
export const TEAMS: Team[] = CURRENT_TEAMS.slice();

/* ───────── 고유 구종 (레어 이상 투수) ───────── */
const SIG: Record<string, SignaturePitch> = {
  jh: { name: 'JH 커브', base: 'CU', style: 'initials', effect: '큰 낙차 · 2스트라이크 뒤 헛스윙 ↑', color: '#B48CFF' },
  dobin: { name: '도빈 체인지업', base: 'CH', style: 'initials', effect: '직구와 같은 팔 스윙 · 타이밍 뺏기 ↑', color: '#4FD1C5' },
  waterfall: { name: '폭포수 커브', base: 'CU', style: 'alias', effect: '큰 낙차 · 헛스윙 ↑ · 제구 난도 ↑', color: '#6EC1FF' },
  stone: { name: '돌직구', base: 'FF', style: 'alias', effect: '공이 무겁다 · 타구 속도 ↓', color: '#FF6B4A' },
  snake: { name: '뱀직구', base: 'SI', style: 'alias', effect: '횡 무브먼트 · 같은 손 타자에 강함', color: '#7CE38B' },
  hardSlider: { name: '고속 슬라이더', base: 'SL', style: 'alias', effect: '직구처럼 오다 꺾임 · 헛스윙 ↑', color: '#FFB547' },
  rising: { name: '라이징 패스트볼', base: 'FF', style: 'alias', effect: '높은 공 · 뜬공·헛스윙 ↑', color: '#FF4FA3' },
  screw: { name: '스크루볼', base: 'CH', style: 'alias', effect: '반대로 휘는 공 · 좌우 상성 뒤집기', color: '#FFD84F' },
  backdoor: { name: '백도어 슬라이더', base: 'SL', style: 'alias', effect: '바깥에서 들어오는 공 · 루킹 삼진 ↑', color: '#9AD0FF' },
  knuckle: { name: '너클볼', base: 'KN', style: 'alias', effect: '예측 불가 · 헛스윙 ↑ · 포일 ↑', color: '#E8E4D8' },
  fork: { name: '고속 포크', base: 'FS', style: 'alias', effect: '빠르게 떨어짐 · 땅볼 ↑', color: '#C3A6FF' },
};

/* ───────── 선수 40 — 정체성은 손으로, 능력치는 유형 + 시드로 ───────── */
type Arch =
  | 'leadoff' | 'contact' | 'power' | 'gap' | 'defSS' | 'allround' | 'catcherD' | 'catcherO' | 'armRF' | 'cfHawk' | 'dh'
  | 'aceSP' | 'powerSP' | 'finesseSP' | 'sinker' | 'closer' | 'setup' | 'lefty';

interface Spec {
  id: string; name: string; team: string; pos: Pos; role?: PitcherRole; subPos?: Pos[];
  bats: BatSide; throws: Hand; age: number; h: number; w: number; no: number; origin?: Origin; draft: number;
  arch: Arch; ovr: number; grade: GradeId; year?: number; award?: string; enh: number; lv: number; sig?: SignaturePitch;
  pot: number; traits: string[]; pers: string; wx?: Partial<Record<WeatherKey, number>>;
  formBat?: string; formPitch?: string; cond?: 1 | 2 | 3 | 4 | 5; fat?: number; injury?: string;
}

const SPECS: Spec[] = [
  // 대전 독수리스 (내 구단)
  { id: 'p01', name: '제갈현', team: 'dj', pos: 'P', role: 'SP', bats: 'R', throws: 'R', age: 28, h: 187, w: 88, no: 11, draft: 2017, arch: 'aceSP', ovr: 93, grade: 'signature', enh: 10, lv: 10, sig: SIG.jh, pot: 5, traits: ['위기에 강한 강심장', '이닝이터'], pers: '강철 멘탈', wx: { heat: 1 }, formPitch: '오버핸드 하이킥', cond: 5, fat: 12 },
  { id: 'p02', name: '은도빈', team: 'dj', pos: 'P', role: 'CL', bats: 'L', throws: 'L', age: 26, h: 184, w: 82, no: 47, draft: 2019, arch: 'closer', ovr: 91, grade: 'black', enh: 8, lv: 9.4, sig: SIG.dobin, pot: 5, traits: ['위기에 강한 강심장', '유인구 승부'], pers: '큰 무대 체질', wx: { cold: 1 }, formPitch: '스리쿼터 숨김 동작', cond: 4, fat: 30 },
  { id: 'p03', name: '연이준', team: 'dj', pos: 'CF', bats: 'L', throws: 'R', age: 25, h: 181, w: 76, no: 24, draft: 2020, arch: 'cfHawk', ovr: 89, grade: 'elite', year: 27, enh: 7, lv: 8.99, pot: 5, traits: ['몸 날리는 수비', '찬스에 강한 타자'], pers: '의욕파', wx: { day: 1 }, formBat: '오픈 스탠스 레그킥', cond: 5, fat: 22 },
  { id: 'p04', name: '봉시혁', team: 'dj', pos: '3B', bats: 'R', throws: 'R', age: 30, h: 184, w: 92, no: 13, draft: 2015, arch: 'power', ovr: 88, grade: 'franchise', enh: 5, lv: 9.35, pot: 4, traits: ['당겨치기 거포', '멘토'], pers: '타고난 리더', wx: { heat: 1, cold: -1 }, formBat: '하이 핸즈', cond: 4, fat: 35 },
  { id: 'p05', name: '석윤호', team: 'dj', pos: '1B', bats: 'L', throws: 'L', age: 32, h: 188, w: 101, no: 52, draft: 2013, arch: 'gap', ovr: 84, grade: 'legend', enh: 2, lv: 7.8, pot: 3, traits: ['기다리는 타자', '분위기 메이커'], pers: '낙천가', wx: { rain: 1 }, formBat: '크라우치', cond: 3, fat: 41 },
  { id: 'p06', name: '표건우', team: 'dj', pos: 'SS', bats: 'R', throws: 'R', age: 27, h: 178, w: 80, no: 6, draft: 2018, arch: 'defSS', ovr: 82, grade: 'rare', year: 27, enh: 3, lv: 6.4, pot: 4, traits: ['퀵스로잉'], pers: '성실파', formBat: '짧게 쥐고 밀어치기', cond: 4, fat: 28 },
  { id: 'p07', name: '탁민재', team: 'dj', pos: 'C', bats: 'R', throws: 'R', age: 29, h: 182, w: 90, no: 22, draft: 2018, arch: 'catcherD', ovr: 79, grade: 'rare', year: 27, enh: 2, lv: 5.72, pot: 3, traits: ['블로킹 마스터', '주자 킬러'], pers: '차분한 성격', formBat: '노스트라이드', cond: 3, fat: 52 },
  { id: 'p08', name: '진서율', team: 'dj', pos: '2B', bats: 'L', throws: 'R', age: 23, h: 175, w: 72, no: 4, draft: 2022, arch: 'leadoff', ovr: 76, grade: 'special', year: 27, enh: 1, lv: 4.12, pot: 4.5, traits: ['기습 번트', '도루 자주 시도'], pers: '의욕파', wx: { day: 1 }, formBat: '토탭', cond: 2, fat: 18 },
  { id: 'p09', name: '구해솔', team: 'dj', pos: 'RF', bats: 'R', throws: 'R', age: 26, h: 183, w: 86, no: 17, draft: 2019, arch: 'armRF', ovr: 86, grade: 'gg', year: 26, award: '우익수', enh: 4, lv: 8.1, pot: 4.5, traits: ['강견 과시', '펜스 플레이어'], pers: '승부욕 강함', formBat: '오픈 스탠스', cond: 4, fat: 25 },
  { id: 'p10', name: '도하람', team: 'dj', pos: 'P', role: 'SP', bats: 'R', throws: 'R', age: 27, h: 190, w: 92, no: 33, draft: 2018, arch: 'powerSP', ovr: 87, grade: 'elite', year: 27, enh: 6, lv: 8.44, sig: SIG.waterfall, pot: 4.5, traits: ['빠른 승부'], pers: '야심가', wx: { cold: -1 }, formPitch: '오버핸드', cond: 4, fat: 8 },
  { id: 'p11', name: '독고현', team: 'dj', pos: 'P', role: 'RP', bats: 'R', throws: 'R', age: 24, h: 179, w: 78, no: 38, draft: 2021, arch: 'setup', ovr: 74, grade: 'special', year: 27, enh: 0, lv: 3.3, pot: 4, traits: ['고무팔'], pers: '근성파', formPitch: '사이드암', cond: 3, fat: 44, injury: '어깨 뭉침 · 이틀 휴식' },
  { id: 'p12', name: '황보결', team: 'dj', pos: 'P', role: 'RP', bats: 'L', throws: 'L', age: 33, h: 182, w: 85, no: 29, draft: 2012, arch: 'lefty', ovr: 68, grade: 'normal', year: 27, enh: 0, lv: 2.85, pot: 2, traits: ['견제 장인'], pers: '모범 프로', formPitch: '스리쿼터', cond: 3, fat: 20 },
  // 다른 구단
  { id: 'p13', name: '남궁찬', team: 'bs', pos: 'LF', bats: 'L', throws: 'R', age: 28, h: 180, w: 84, no: 31, draft: 2017, arch: 'contact', ovr: 72, grade: 'normal', year: 27, enh: 0, lv: 3.55, pot: 3, traits: ['밀어치기 장인'], pers: '균형형', formBat: '스퀘어 스탠스', cond: 3, fat: 30 },
  { id: 'p14', name: '위태건', team: 'gj', pos: 'DH', subPos: ['1B'], bats: 'R', throws: 'R', age: 31, h: 186, w: 98, no: 44, draft: 2014, arch: 'dh', ovr: 90, grade: 'th', year: 26, award: '홈런왕', enh: 6, lv: 9.02, pot: 3.5, traits: ['풀스윙', '직구 노림수'], pers: '거친 승부사', wx: { heat: 2 }, formBat: '어퍼 스윙', cond: 5, fat: 20 },
  { id: 'p15', name: '선우겸', team: 'st', pos: 'SS', bats: 'S', throws: 'R', age: 29, h: 182, w: 81, no: 7, draft: 2016, arch: 'allround', ovr: 92, grade: 'mvp', year: 26, enh: 4, lv: 8.7, pot: 4.5, traits: ['찬스에 강한 타자', '몸 날리는 수비'], pers: '모범 시민', formBat: '스위치', cond: 4 },
  { id: 'p16', name: '반태오', team: 'sw', pos: 'CF', bats: 'L', throws: 'L', age: 24, h: 179, w: 74, no: 9, draft: 2021, arch: 'leadoff', ovr: 81, grade: 'rare', year: 27, enh: 1, lv: 5.1, pot: 4.5, traits: ['공격적 주루'], pers: '의욕파', cond: 4 },
  { id: 'p17', name: '편도윤', team: 'st', pos: 'P', role: 'SP', bats: 'R', throws: 'R', age: 34, h: 191, w: 97, no: 21, draft: 2011, arch: 'aceSP', ovr: 86, grade: 'legend', enh: 3, lv: 9.1, sig: SIG.stone, pot: 2.5, traits: ['철완', '연패 스토퍼'], pers: '완벽주의자', formPitch: '오버핸드 하이킥', cond: 4 },
  { id: 'p18', name: '여시헌', team: 'dg', pos: 'C', bats: 'R', throws: 'R', age: 30, h: 183, w: 93, no: 27, draft: 2015, arch: 'catcherO', ovr: 84, grade: 'gg', year: 26, award: '포수', enh: 2, lv: 7.4, pot: 3, traits: ['블로킹 마스터'], pers: '의리파', cond: 3 },
  { id: 'p19', name: '국지환', team: 'cw', pos: '1B', bats: 'L', throws: 'L', age: 31, h: 189, w: 104, no: 25, draft: 2014, arch: 'power', ovr: 87, grade: 'th', year: 26, award: '타점왕', enh: 3, lv: 8.2, pot: 3, traits: ['찬스에 강한 타자', '당겨치기 거포'], pers: '느긋한 성격', wx: { rain: 1 }, cond: 4 },
  { id: 'p20', name: '기우람', team: 'cw', pos: 'P', role: 'RP', bats: 'R', throws: 'R', age: 25, h: 185, w: 83, no: 59, draft: 2020, arch: 'setup', ovr: 80, grade: 'rare', year: 27, enh: 2, lv: 6.05, sig: SIG.snake, pot: 4, traits: ['몸쪽 승부사'], pers: '다혈질', formPitch: '사이드암', cond: 4 },
  { id: 'p21', name: '맹다온', team: 'ic', pos: 'LF', bats: 'R', throws: 'R', age: 22, h: 184, w: 85, no: 36, draft: 2023, arch: 'power', ovr: 75, grade: 'special', year: 27, enh: 0, lv: 3.8, pot: 5, traits: ['풀스윙'], pers: '게으른 천재', cond: 3 },
  { id: 'p22', name: '엄주완', team: 'gj', pos: '2B', bats: 'R', throws: 'R', age: 27, h: 176, w: 74, no: 3, draft: 2018, arch: 'contact', ovr: 66, grade: 'normal', year: 27, enh: 0, lv: 2.4, pot: 3, traits: ['끈질긴 승부(커트 장인)'], pers: '성실파', cond: 3 },
  { id: 'p23', name: '옥태민', team: 'bs', pos: 'P', role: 'SP', bats: 'R', throws: 'R', age: 29, h: 188, w: 90, no: 18, draft: 2016, arch: 'powerSP', ovr: 92, grade: 'black', enh: 7, lv: 9.6, sig: SIG.hardSlider, pot: 4, traits: ['빠른 승부', '이닝이터'], pers: '승부욕 강함', formPitch: '스리쿼터', cond: 4 },
  { id: 'p24', name: '설한결', team: 'sb', pos: '3B', bats: 'R', throws: 'R', age: 28, h: 185, w: 88, no: 14, draft: 2017, arch: 'gap', ovr: 85, grade: 'elite', year: 27, enh: 3, lv: 7.65, pot: 4, traits: ['로우볼 히터'], pers: '차분한 성격', cond: 4 },
  { id: 'p25', name: '용재하', team: 'dg', pos: 'RF', bats: 'L', throws: 'R', age: 26, h: 181, w: 82, no: 51, draft: 2020, arch: 'armRF', ovr: 74, grade: 'special', year: 27, enh: 0, lv: 3.1, pot: 3.5, traits: ['강견 과시'], pers: '기분파', cond: 3 },
  { id: 'p26', name: '인서진', team: 'ic', pos: 'P', role: 'SP', bats: 'L', throws: 'L', age: 30, h: 186, w: 84, no: 19, draft: 2015, arch: 'aceSP', ovr: 90, grade: 'mvp', year: 25, enh: 5, lv: 9.2, sig: SIG.rising, pot: 3.5, traits: ['위기에 강한 강심장'], pers: '큰 무대 체질', formPitch: '디셉션 큰 와인드업', cond: 5 },
  { id: 'p27', name: '소마루', team: 'cw', pos: 'DH', bats: 'R', throws: 'R', age: 33, h: 183, w: 99, no: 55, draft: 2012, arch: 'dh', ovr: 69, grade: 'normal', year: 27, enh: 0, lv: 2.9, pot: 2, traits: ['배드볼 히터'], pers: '낙천가', cond: 3 },
  { id: 'p28', name: '어진석', team: 'gj', pos: 'P', role: 'CL', bats: 'R', throws: 'R', age: 32, h: 183, w: 89, no: 1, draft: 2013, arch: 'closer', ovr: 88, grade: 'franchise', enh: 4, lv: 9, sig: SIG.screw, pot: 2.5, traits: ['위기에 강한 강심장'], pers: '강철 멘탈', formPitch: '스리쿼터', cond: 4 },
  { id: 'p29', name: '길우진', team: 'sw', pos: 'C', bats: 'R', throws: 'R', age: 26, h: 180, w: 88, no: 42, draft: 2019, arch: 'catcherD', ovr: 64, grade: 'normal', year: 27, enh: 0, lv: 1.7, pot: 3.5, traits: [], pers: '성실파', cond: 3 },
  { id: 'p30', name: '방하율', team: 'sh', pos: 'SS', bats: 'R', throws: 'R', age: 21, h: 177, w: 70, no: 2, draft: 2024, arch: 'defSS', ovr: 73, grade: 'special', year: 27, enh: 1, lv: 3.4, pot: 5, traits: ['몸 날리는 수비'], pers: '의욕파', cond: 4 },
  { id: 'p31', name: '금시온', team: 'sh', pos: 'P', role: 'RP', bats: 'L', throws: 'L', age: 27, h: 183, w: 80, no: 46, draft: 2018, arch: 'lefty', ovr: 79, grade: 'rare', year: 27, enh: 2, lv: 5.9, sig: SIG.backdoor, pot: 3.5, traits: ['유인구 승부'], pers: '차분한 성격', formPitch: '스리쿼터', cond: 4 },
  { id: 'p32', name: '노을찬', team: 'sb', pos: 'CF', bats: 'R', throws: 'R', age: 28, h: 182, w: 79, no: 8, draft: 2017, arch: 'cfHawk', ovr: 85, grade: 'gg', year: 26, award: '중견수', enh: 3, lv: 7.95, pot: 3.5, traits: ['하이점프캐치'], pers: '팀 플레이어', cond: 4 },
  { id: 'p33', name: '모재윤', team: 'sw', pos: 'P', role: 'SP', bats: 'R', throws: 'R', age: 31, h: 181, w: 86, no: 49, draft: 2014, arch: 'finesseSP', ovr: 78, grade: 'rare', year: 27, enh: 1, lv: 5.3, sig: SIG.knuckle, pot: 2.5, traits: ['유인구 승부'], pers: '느긋한 성격', formPitch: '스리쿼터', cond: 3 },
  { id: 'p34', name: '피현수', team: 'dg', pos: '2B', bats: 'R', throws: 'R', age: 24, h: 174, w: 71, no: 16, draft: 2021, arch: 'contact', ovr: 63, grade: 'normal', year: 27, enh: 0, lv: 1.95, pot: 4, traits: [], pers: '의욕파', cond: 3 },
  { id: 'p35', name: '남궁율', team: 'bs', pos: 'LF', bats: 'L', throws: 'R', age: 33, h: 187, w: 95, no: 10, draft: 2011, arch: 'power', ovr: 91, grade: 'signature', enh: 8, lv: 9.8, pot: 2.5, traits: ['당겨치기 거포', '찬스에 강한 타자'], pers: '타고난 리더', wx: { heat: 1 }, cond: 4 },
  { id: 'p36', name: '승지후', team: 'cw', pos: 'P', role: 'RP', bats: 'R', throws: 'R', age: 28, h: 180, w: 84, no: 61, draft: 2018, arch: 'sinker', ovr: 61, grade: 'normal', year: 27, enh: 0, lv: 2.1, pot: 2.5, traits: ['고무팔'], pers: '균형형', formPitch: '사이드암', cond: 3 },
  { id: 'p37', name: '빈우석', team: 'sb', pos: '1B', bats: 'L', throws: 'L', age: 25, h: 186, w: 96, no: 30, draft: 2020, arch: 'power', ovr: 72, grade: 'special', year: 27, enh: 0, lv: 3.2, pot: 4, traits: ['직구 노림수'], pers: '다혈질', cond: 3 },
  { id: 'p38', name: '디에고 살바르', team: 'gj', pos: 'RF', bats: 'R', throws: 'R', age: 29, h: 188, w: 95, no: 28, origin: 'LATAM', draft: 2026, arch: 'power', ovr: 86, grade: 'elite', year: 27, enh: 2, lv: 7.2, pot: 3, traits: ['풀스윙', '강견 과시'], pers: '분위기 메이커', wx: { heat: 2, cold: -2 }, cond: 4 },
  { id: 'p39', name: '케일럽 윈터스', team: 'dg', pos: 'P', role: 'SP', bats: 'R', throws: 'R', age: 30, h: 193, w: 102, no: 40, origin: 'US', draft: 2026, arch: 'sinker', ovr: 77, grade: 'special', year: 27, enh: 0, lv: 4.5, pot: 2.5, traits: ['이닝이터'], pers: '모범 프로', formPitch: '스리쿼터', cond: 4 },
  { id: 'p40', name: '오카베 류', team: 'ic', pos: 'P', role: 'RP', bats: 'R', throws: 'R', age: 27, h: 181, w: 79, no: 66, origin: 'JP', draft: 2025, arch: 'setup', ovr: 80, grade: 'rare', year: 27, enh: 1, lv: 5.5, sig: SIG.fork, pot: 3.5, traits: ['유인구 승부'], pers: '완벽주의자', formPitch: '오버핸드', cond: 4 },
];

/** 특별 선수 예시 — 시작할 때 SPECIAL_PLAYER_NAMES 중 한 명을 골라 직접 만든다 (구단 선택 다음 단계) */
const SPECIAL_SPEC: Spec = {
  id: 'p41', name: '이동규', team: 'dj', pos: 'P', role: 'SP', bats: 'R', throws: 'R', age: 24, h: 186, w: 87, no: 77, draft: 2027,
  arch: 'aceSP', ovr: 88, grade: 'unique', enh: 0, lv: 1,
  sig: { name: 'DK 슬라이더', base: 'SL', style: 'initials', effect: '늦게 꺾이는 슬라이더 · 헛스윙 ↑ (특별 선수 전용)', color: '#7FE3D4' },
  pot: 5, traits: ['위기에 강한 강심장', '빠른 승부'], pers: '큰 무대 체질', formPitch: '사이드암', cond: 5, fat: 0,
};

/* 유형별 능력치 기울기 (진짜 값 기준 ±) */
const ARCH: Record<Arch, Partial<Record<AttrKey, number>>> = {
  leadoff: { contactR: 4, contactL: 2, power: -16, gap: -4, eye: 6, avoidK: 8, bunt: 10, speed: 12, baserunning: 8, stealJump: 12, sliding: 6, range: 4, firstStep: 6 },
  contact: { contactR: 8, contactL: 6, power: -10, gap: 4, eye: 4, avoidK: 10, vsBreak: 4, bunt: 4, speed: -2 },
  power: { contactR: -6, contactL: -8, power: 14, gap: 6, eye: -2, avoidK: -12, vsFast: 6, speed: -12, stealJump: -14, range: -8, firstStep: -6, strength: 12 },
  gap: { contactR: 6, contactL: 4, power: 2, gap: 12, eye: 6, avoidK: 4, speed: -6 },
  defSS: { contactR: -6, contactL: -6, power: -14, gap: -6, range: 12, firstStep: 10, hands: 10, armStr: 6, armAcc: 8, turnDP: 12, speed: 4, agility: 8 },
  allround: { contactR: 4, contactL: 4, power: 2, gap: 4, eye: 4, speed: 4, range: 6, firstStep: 6, hands: 4, armAcc: 4, baseballIQ: 6 },
  catcherD: { contactR: -8, contactL: -8, power: -6, speed: -18, stealJump: -20, block: 12, framing: 12, popTime: 8, pitcherLead: 12, armStr: 6, baseballIQ: 6 },
  catcherO: { contactR: 2, power: 8, gap: 4, speed: -16, stealJump: -20, block: 2, framing: -2, popTime: 0, pitcherLead: 2, armStr: 4 },
  armRF: { power: 6, gap: 2, armStr: 16, armAcc: 6, range: 2, avoidK: -4 },
  cfHawk: { power: -6, range: 14, firstStep: 14, speed: 12, armStr: 4, stealJump: 6, agility: 8 },
  dh: { contactR: 4, contactL: 2, power: 14, gap: 6, eye: 4, avoidK: -6, speed: -16, range: -22, firstStep: -18, hands: -16, armStr: -12, armAcc: -12, turnDP: -20, strength: 12 },
  aceSP: { velocity: 4, control: 8, deception: 6, extension: 2, stamina: 12, composure: 8, concentration: 6 },
  powerSP: { velocity: 12, control: -4, deception: 2, extension: 6, stamina: 6, strength: 8 },
  finesseSP: { velocity: -10, control: 12, deception: 8, stamina: 6, baseballIQ: 8 },
  sinker: { velocity: -2, control: 4, stamina: 6, gbTend: 30 },
  closer: { velocity: 12, deception: 6, stamina: -34, recovery: 10, composure: 8, competitiveness: 8 },
  setup: { velocity: 6, stamina: -28, recovery: 8 },
  lefty: { velocity: -4, deception: 12, stamina: -32, recovery: 6, pickoff: 10 },
};

const BAT_KEYS: AttrKey[] = ['contactR', 'contactL', 'power', 'gap', 'eye', 'avoidK', 'vsFast', 'vsBreak', 'bunt', 'speed', 'baserunning', 'stealJump', 'sliding', 'range', 'firstStep', 'hands', 'armStr', 'armAcc', 'turnDP'];
const CATCH_KEYS: AttrKey[] = ['block', 'framing', 'popTime', 'pitcherLead'];
const PIT_KEYS: AttrKey[] = ['velocity', 'control', 'deception', 'extension', 'stamina', 'recovery', 'pickoff', 'slideStep', 'pFielding'];
const MENTAL_KEYS: AttrKey[] = ['composure', 'concentration', 'competitiveness', 'leadership', 'teamwork', 'baseballIQ'];
const PHYS_KEYS: AttrKey[] = ['durability', 'agility', 'strength'];

const REPERTOIRE: Record<'aceSP' | 'powerSP' | 'finesseSP' | 'sinker' | 'closer' | 'setup' | 'lefty', [PitchType, number][]> = {
  aceSP: [['FF', 0.42], ['SL', 0.22], ['CU', 0.16], ['CH', 0.2]],
  powerSP: [['FF', 0.5], ['SL', 0.3], ['FS', 0.2]],
  finesseSP: [['FF', 0.34], ['CH', 0.26], ['CU', 0.18], ['FC', 0.22]],
  sinker: [['SI', 0.48], ['SL', 0.3], ['CH', 0.22]],
  closer: [['FF', 0.62], ['FS', 0.38]],
  setup: [['FF', 0.55], ['SL', 0.45]],
  lefty: [['FF', 0.45], ['SW', 0.55]],
};
const VELO_OFF: Record<PitchType, number> = { FF: 0, SI: -2, FC: -5, SL: -12, SW: -16, CU: -22, CH: -14, FS: -10, KN: -36 };

const avgOf = (a: AttrMap, keys: AttrKey[]) => keys.reduce((s, k) => s + (a[k] ?? 50), 0) / keys.length;
const w = (a: AttrMap, parts: [AttrKey, number][]) => Math.round(parts.reduce((s, [k, x]) => s + (a[k] ?? 50) * x, 0));

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

function buildPlayer(s: Spec): Player {
  const r = rng('attr:' + s.id);
  const isP = s.pos === 'P';
  const L = s.ovr - 1;
  const off = ARCH[s.arch];
  const attrs: AttrMap = {};
  const put = (k: AttrKey, base: number, sd: number) => { attrs[k] = clamp(Math.round(base + (off[k] ?? 0) + r.gauss() * sd), 18, 99); };

  if (isP) {
    PIT_KEYS.forEach((k) => put(k, L, 4));
    attrs.gbTend = clamp(Math.round(50 + (off.gbTend ?? 0) + r.gauss() * 10), 10, 95);
  } else {
    BAT_KEYS.forEach((k) => put(k, L, 5));
    if (s.pos === 'C') CATCH_KEYS.forEach((k) => put(k, L, 4));
    // 좌우 상성: 좌타는 우투 상대가 더 낫다
    if (s.bats === 'L') { attrs.contactR = clamp((attrs.contactR ?? 60) + 3, 18, 99); attrs.contactL = clamp((attrs.contactL ?? 60) - 5, 18, 99); }
    if (s.bats === 'R') { attrs.contactL = clamp((attrs.contactL ?? 60) + 3, 18, 99); attrs.contactR = clamp((attrs.contactR ?? 60) - 2, 18, 99); }
    attrs.pullTend = clamp(Math.round(50 + (off.power ?? 0) * 1.2 + r.gauss() * 10), 10, 95);
    attrs.launchTend = clamp(Math.round(50 + (off.power ?? 0) * 1.4 + r.gauss() * 10), 10, 95);
    attrs.swingTend = clamp(Math.round(50 + r.gauss() * 14), 10, 95);
  }
  MENTAL_KEYS.forEach((k) => put(k, L - 8, 7));
  PHYS_KEYS.forEach((k) => put(k, L - 6, 7));

  // 구종
  let pitches: Pitch[] | undefined;
  if (isP) {
    const rep = REPERTOIRE[s.arch as keyof typeof REPERTOIRE] ?? REPERTOIRE.aceSP;
    const list = rep.map(([t, u]) => [t, u] as [PitchType, number]);
    if (s.sig && !list.some(([t]) => t === s.sig!.base)) {
      list.sort((a, b) => b[1] - a[1]);
      list[list.length - 1] = [s.sig.base, list[list.length - 1][1]];
    }
    const v = attrs.velocity ?? 60;
    pitches = list.map(([t, u]) => {
      const sigHere = s.sig?.base === t;
      return {
        type: t,
        ko: sigHere ? s.sig!.name : PITCH_KO[t],
        stuff: clamp(Math.round(L + r.gauss() * 6 + (sigHere ? 6 : 0) + (t === 'FF' ? (v - L) * 0.5 : 0)), 25, 99),
        command: clamp(Math.round((attrs.control ?? 60) + r.gauss() * 6 - (t === 'KN' || t === 'CU' ? 3 : 0)), 25, 99),
        usage: u,
        kmh: Math.round(118 + 0.36 * v + VELO_OFF[t] * 0.85 + r.gauss()),
      };
    });
  }

  // 카드 앞면 대표 6
  let face: Player['face'];
  if (isP) {
    const best = Math.max(...(pitches ?? []).map((p) => p.stuff));
    const brk = (pitches ?? []).filter((p) => !['FF', 'SI', 'FC'].includes(p.type)).map((p) => p.stuff).sort((a, b) => b - a);
    const brkV = brk.length >= 2 ? Math.round((brk[0] + brk[1]) / 2) : brk.length === 1 ? Math.round(brk[0] * 0.85 + 10) : 50;
    const cmd = (pitches ?? []).reduce((s2, p) => s2 + p.command * p.usage, 0);
    const base = [
      { code: 'VEL', ko: '구속', v: attrs.velocity ?? 50 },
      { code: 'STF', ko: '구위', v: best },
      { code: 'BRK', ko: '변화', v: brkV },
      { code: 'CTL', ko: '제구', v: Math.round(0.6 * (attrs.control ?? 50) + 0.4 * cmd) },
    ];
    face = s.role === 'SP'
      ? [...base, { code: 'STA', ko: '체력', v: attrs.stamina ?? 50 }, { code: 'MNT', ko: '위기관리', v: w(attrs, [['composure', 0.5], ['concentration', 0.3], ['baseballIQ', 0.2]]) }]
      : [...base, { code: 'REC', ko: '회복', v: attrs.recovery ?? 50 }, { code: 'MNT', ko: '위기관리', v: w(attrs, [['composure', 0.5], ['concentration', 0.3], ['baseballIQ', 0.2]]) }];
  } else {
    const CON = { code: 'CON', ko: '컨택', v: w(attrs, [['contactR', 0.7], ['contactL', 0.3]]) };
    const POW = { code: 'POW', ko: '파워', v: w(attrs, [['power', 0.8], ['gap', 0.2]]) };
    const EYE = { code: 'EYE', ko: '선구', v: w(attrs, [['eye', 0.7], ['avoidK', 0.3]]) };
    const SPD = { code: 'SPD', ko: '주루', v: w(attrs, [['speed', 0.7], ['baserunning', 0.2], ['stealJump', 0.1]]) };
    if (s.pos === 'C') {
      face = [CON, POW, EYE,
        { code: 'BLK', ko: '블로킹', v: attrs.block ?? 50 },
        { code: 'FRM', ko: '프레이밍', v: w(attrs, [['framing', 0.75], ['pitcherLead', 0.25]]) },
        { code: 'CS', ko: '도루저지', v: w(attrs, [['popTime', 0.6], ['armStr', 0.4]]) }];
    } else if (s.pos === 'DH') {
      face = [CON, POW, EYE,
        { code: 'GAP', ko: '장타', v: w(attrs, [['gap', 0.6], ['power', 0.4]]) },
        { code: 'ADJ', ko: '대처', v: w(attrs, [['vsFast', 0.5], ['vsBreak', 0.5]]) },
        SPD];
    } else {
      face = [CON, POW, EYE, SPD,
        { code: 'DEF', ko: '수비', v: w(attrs, DEF_KEYS[s.pos] ?? DEF_KEYS.LF) },
        { code: 'ARM', ko: '송구', v: w(attrs, [['armStr', 0.7], ['armAcc', 0.3]]) }];
    }
  }

  // 2027 시즌 기록 (팀 71경기)
  const season: Player['season'] = {};
  if (isP) {
    const q = avgOf(attrs, ['velocity', 'control', 'deception']) + ((pitches?.[0]?.stuff ?? 60) - 60) * 0.3;
    const era = r2(clamp(6.2 - (q - 50) * 0.085 + r.gauss() * 0.35, 1.2, 7.5));
    const sp = s.role === 'SP';
    const g = sp ? 14 + Math.round(r.next() * 2) : 28 + Math.round(r.next() * 8);
    const ip = sp ? Math.round(g * (5.4 + (attrs.stamina ?? 60) / 60) * 3) / 3 : Math.round(g * 1.02 * 3) / 3;
    const ipDisp = Math.floor(ip) + Math.round((ip - Math.floor(ip)) * 3) / 10;
    const so = Math.round(ip * clamp(6.6 + ((pitches?.[0]?.stuff ?? 60) - 50) * 0.11, 4, 12.5) / 9);
    const bb = Math.round(ip * clamp(4.6 - ((attrs.control ?? 60) - 50) * 0.06, 1.2, 6) / 9);
    const h = Math.round(ip * clamp(9.6 - (q - 50) * 0.09, 5.5, 12) / 9);
    const wins = sp ? Math.round(clamp(g * (0.25 + (q - 55) * 0.012) + r.gauss(), 1, 13)) : Math.round(r.next() * 4);
    const losses = sp ? Math.max(1, g - wins - Math.round(r.next() * 4)) : Math.round(r.next() * 3);
    season.pit = {
      g, gs: sp ? g : 0, w: wins, l: Math.min(losses, sp ? g - wins : 6),
      sv: s.role === 'CL' ? Math.round(12 + (s.ovr - 80) * 0.8 + r.next() * 4) : 0,
      hld: s.role === 'RP' ? Math.round(6 + r.next() * 10) : 0,
      ip: ipDisp, h, hr: Math.round(ip * 0.9 / 9), bb, so,
      era, whip: r2((h + bb) / Math.max(1, ip)),
    } satisfies PitchingLine;
  } else {
    const con = face[0].v, pow = face[1].v, eye = face[2].v;
    const spd = face.find((f) => f.code === 'SPD')?.v ?? 50;
    const g = 60 + Math.round(r.next() * 11);
    const pa = Math.round(g * (3.9 + r.next() * 0.5));
    const bb = Math.round(pa * clamp(0.05 + (eye - 50) * 0.0018, 0.03, 0.17));
    const so = Math.round(pa * clamp(0.24 - ((attrs.avoidK ?? 55) - 50) * 0.0035, 0.07, 0.34));
    const ab = pa - bb - Math.round(pa * 0.012);
    const avgT = clamp(0.198 + (con - 50) * 0.0034 + r.gauss() * 0.008, 0.19, 0.372);
    const h = Math.round(ab * avgT);
    const hr = Math.round(clamp((pow - 42) * 0.5, 0, 34) * (g / 71) + r.next() * 2);
    const d3 = spd > 80 ? Math.round(r.next() * 4) : Math.round(r.next() * 1.4);
    const d2 = Math.round(h * clamp(0.16 + (face[1].v - 50) * 0.002, 0.12, 0.26));
    const singles = Math.max(0, h - d2 - d3 - hr);
    const avg = r3(h / Math.max(1, ab));
    const obp = r3((h + bb) / Math.max(1, ab + bb));
    const slg = r3((singles + 2 * d2 + 3 * d3 + 4 * hr) / Math.max(1, ab));
    season.bat = {
      g, pa, ab, h, d2, d3, hr,
      rbi: Math.round(hr * 2.6 + h * 0.22 + r.next() * 8),
      r: Math.round(h * 0.4 + bb * 0.3 + hr * 0.6),
      sb: Math.round(clamp((spd - 58) * 0.7, 0, 40) * (g / 71)),
      bb, so, avg, obp, slg, ops: r3(obp + slg),
    } satisfies BattingLine;
  }

  return {
    id: s.id, name: s.name, teamId: s.team, number: s.no, pos: s.pos, role: s.role, subPos: s.subPos,
    bats: s.bats, throws: s.throws, age: s.age, heightCm: s.h, weightKg: s.w, origin: s.origin ?? 'KR', draftYear: s.draft,
    ovr: s.ovr, face, attrs, pitches, potential: s.pot, traits: s.traits, personality: s.pers,
    weather: s.wx ?? {}, form: { bat: s.formBat, pitch: s.formPitch }, look: 'look:' + s.id,
    season, condition: s.cond ?? 3, fatigue: s.fat ?? 25, injury: s.injury,
  };
}

export const PLAYERS: Player[] = [...SPECS, SPECIAL_SPEC].map(buildPlayer);

/* ───────── 카드 ───────── */
const baseCards: CardInst[] = SPECS.map((s, i) => ({
  id: 'c' + String(i + 1).padStart(2, '0'),
  playerId: s.id,
  grade: s.grade,
  year: s.year,
  level: s.lv,
  enhance: s.enh,
  signaturePitch: s.sig && GRADES[s.grade].rank >= GRADES.rare.rank ? s.sig : undefined,
  award: s.award,
  dup: 0,
}));
// 같은 선수의 다른 카드·중복 카드 (강화·각성 재료)
const extraCards: CardInst[] = [
  { id: 'c41', playerId: 'p03', grade: 'special', year: 26, level: 8, enhance: 0, dup: 2 },
  { id: 'c42', playerId: 'p02', grade: 'rare', year: 27, level: 6.2, enhance: 2, signaturePitch: SIG.dobin, dup: 1 },
  { id: 'c43', playerId: 'p01', grade: 'elite', year: 26, level: 9, enhance: 3, signaturePitch: SIG.jh, dup: 0 },
  { id: 'c44', playerId: 'p08', grade: 'normal', year: 26, level: 6.05, enhance: 0, dup: 3 },
  { id: 'c45', playerId: 'p14', grade: 'rare', year: 27, level: 5.5, enhance: 1, dup: 0, isNew: true },
  // 특별 선수 카드 — 단 하나뿐
  { id: 'c46', playerId: 'p41', grade: 'unique', level: 1, enhance: 0, signaturePitch: SPECIAL_SPEC.sig, dup: 0 },
];
baseCards[5].dup = 1;  // 표건우 레어 '27 한 장 더
baseCards[12].dup = 2; // 남궁찬 노멀 '27 두 장 더

export const CARDS: CardInst[] = [...baseCards, ...extraCards];

/** 등급별 종합 보정 — 같은 선수라도 윗 등급 카드가 더 세다 */
const GRADE_OVR: Record<GradeId, number> = { normal: -3, special: -1, rare: 0, legend: 1, elite: 2, mvp: 2, gg: 2, th: 2, franchise: 3, unique: 3, black: 4, signature: 5 };

/** 처음 목업 보유 목록 — 화면은 쓰지 않는다. 내 카드(수량 · 강화 · 라인업)는 game/inventory (보유 카드 저장소) */
export const MY_CARD_IDS: string[] = [
  'c01', 'c02', 'c03', 'c04', 'c05', 'c06', 'c07', 'c08', 'c09', 'c10', 'c11', 'c12', 'c13', 'c14',
  'c20', 'c21', 'c22', 'c25', 'c27', 'c29', 'c30', 'c33', 'c34', 'c36', 'c37', 'c40',
  'c41', 'c42', 'c43', 'c44', 'c45', 'c46',
];

/* ───────── 내 라인업 · 조합 결과 ───────── */
export const LINEUP: Lineup = {
  name: '주전 라인업',
  batting: [
    { order: 1, pos: 'CF', cardId: 'c03' },
    { order: 2, pos: 'SS', cardId: 'c06' },
    { order: 3, pos: 'RF', cardId: 'c09' },
    { order: 4, pos: '3B', cardId: 'c04' },
    { order: 5, pos: 'DH', cardId: 'c14' },
    { order: 6, pos: '1B', cardId: 'c05' },
    { order: 7, pos: 'LF', cardId: 'c13' },
    { order: 8, pos: 'C', cardId: 'c07' },
    { order: 9, pos: '2B', cardId: 'c08' },
  ],
  sp: 'c01',
  rotation: ['c01', 'c10', 'c33'],
  bullpen: ['c11', 'c12', 'c20', 'c40'],
  closer: 'c02',
  bench: ['c21', 'c37', 'c29', 'c30'],
};

export const LINEUP_EVAL: LineupEval = {
  overall: 91,
  base: 86,
  potential: 96,
  parts: [
    { k: 'bat', ko: '타격', v: 90 },
    { k: 'def', ko: '수비', v: 92 },
    { k: 'pit', ko: '투수', v: 94 },
    { k: 'run', ko: '주루', v: 84 },
  ],
  teamColors: [
    {
      id: 'club-dj', kind: 'club', label: '대전 독수리스', have: 7, need: 9,
      steps: [{ at: 3, bonus: '전 능력치 +1' }, { at: 5, bonus: '전 능력치 +3' }, { at: 7, bonus: '전 능력치 +5' }, { at: 9, bonus: '능력치 폭발 +12' }],
      current: '전 능력치 +5',
    },
    {
      id: 'zone-jungbu', kind: 'zone', label: '중부·호남 권역', have: 8, need: 9,
      steps: [{ at: 5, bonus: '수비 +1' }, { at: 7, bonus: '수비 +2' }, { at: 9, bonus: '수비 +3' }],
      current: '수비 +2',
    },
    {
      id: 'season-27', kind: 'season', label: "'27 시즌 카드", have: 5, need: 9,
      steps: [{ at: 5, bonus: '타격 +2' }, { at: 7, bonus: '타격 +3' }, { at: 9, bonus: '타격 +5' }],
      current: '타격 +2',
    },
    {
      id: 'rival-dj-sw', kind: 'rival', label: '경부선 더비 — 독수리스 + 마법사즈', have: 0, need: 2,
      steps: [{ at: 2, bonus: '주루 +2' }],
    },
  ],
  chem: [
    { a: 'CF', b: 'RF', level: 3, reason: '같은 구단 · 외야 콤비' },
    { a: 'SS', b: '2B', level: 3, reason: '같은 구단 · 키스톤' },
    { a: 'C', b: 'P', level: 3, reason: '배터리 · 같은 구단' },
    { a: '3B', b: 'SS', level: 2, reason: '같은 구단' },
    { a: '1B', b: '2B', level: 2, reason: '같은 구단' },
    { a: '1B', b: 'RF', level: 2, reason: '같은 구단' },
    { a: 'LF', b: 'CF', level: 1, reason: "같은 시즌 '27" },
    { a: 'LF', b: '3B', level: 0, reason: '연결 없음' },
  ],
  explosion: {
    ready: false, remain: 2, label: '능력치 폭발까지 2명', bonus: '1군 전원 전 능력치 +12',
    hint: '좌익수·지명타자를 대전 독수리스 선수로 바꾸면 9/9',
  },
};

/* ───────── 날씨 ───────── */
export const WEATHER_TODAY: Weather = {
  city: '대전', sky: 'night-clear', skyKo: '맑음', tempC: 24, humidity: 61, windMps: 4.2,
  windTo: 'out-lf', windKo: '좌측 담장 쪽으로', rainPct: 10, dust: '보통',
  effects: ['좌측 비거리 +4m', '변화구 영향 없음'],
};

/* ───────── 어제 경기 — 부산 4 : 5 대전 (9회말 끝내기) ───────── */
const D = TEAMS.find((x) => x.id === 'dj')!;
function hit(angle: number, distM: number, kind: 'ground' | 'line' | 'fly' | 'pop', kmh: number) {
  const p = polarToField(angle, distM);
  return { x: r3(p.x), y: r3(p.y), kind, kmh, distM, angle };
}
const rf = (p: { x: number; y: number }) => ({ x: r3(p.x), y: r3(p.y) });
type PB = [string | null, string | null, string | null];
const E: PB = [null, null, null];

export const LAST_MATCH: MatchRecord = {
  id: 'm-2027-06-13-bs-dj',
  date: '2027-06-13', time: '18:30', stadium: D.stadium.name,
  awayId: 'bs', homeId: 'dj',
  weather: {
    city: '대전', sky: 'night-clear', skyKo: '맑음', tempC: 23, humidity: 64, windMps: 5.1,
    windTo: 'out-lf', windKo: '좌측 담장 쪽으로', rainPct: 0, dust: '좋음', effects: ['좌측 비거리 +6m'],
  },
  line: {
    away: { innings: [1, 0, 0, 0, 3, 0, 0, 0, 0], r: 4, h: 8, e: 0, b: 4 },
    home: { innings: [0, 0, 2, 0, 0, 1, 0, 1, 1], r: 5, h: 9, e: 1, b: 5 },
  },
  final: [4, 5],
  walkoff: true,
  decision: { win: 'p02', loss: 'p28', gwrbi: 'p03' },
  starters: { away: 'p23', home: 'p01' },
  attendance: 16842,
  duration: '3:18',
  keyFactors: [
    { factor: 'wind', text: '바람 +6m — 남궁율 3점 홈런, 바람 없었으면 담장 앞 뜬공', decisive: true },
    { factor: 'signature', text: '도빈 체인지업 — 9회 무사 만루에서 헛스윙 4개' },
    { factor: 'adapt', text: '연이준, 스크루볼 세 번째에 눈이 익어 끝내기' },
  ],
  plays: [
    // 1회초
    { id: 'a1', inning: 1, half: 'top', outsBefore: 0, basesBefore: E, batterId: 'p16', pitcherId: 'p01', count: { b: 1, s: 1 }, pitches: 3, code: '2B', text: '반태오, 좌중간을 가르는 2루타', rbi: 0, score: [0, 0], outsAfter: 0, hit: hit(-18, 96, 'line', 158), lastPitch: { type: 'FF', name: '포심', kmh: 148, zone: [0.62, 0.38] }, wp: [0.55, 0.5] },
    { id: 'a2', inning: 1, half: 'top', outsBefore: 0, basesBefore: [null, 'p16', null], batterId: 'p15', pitcherId: 'p01', count: { b: 0, s: 1 }, pitches: 2, code: 'GO', text: '선우겸, 2루 땅볼 — 주자 3루로', notation: '4-3', rbi: 0, score: [0, 0], outsAfter: 1, hit: hit(14, 34, 'ground', 121), wp: [0.5, 0.49] },
    { id: 'a3', inning: 1, half: 'top', outsBefore: 1, basesBefore: [null, null, 'p16'], batterId: 'p24', pitcherId: 'p01', count: { b: 2, s: 1 }, pitches: 4, code: 'SF', text: '설한결, 중견수 희생플라이 — 3루 주자 홈인', notation: 'F8', rbi: 1, score: [1, 0], outsAfter: 2, hit: hit(4, 98, 'fly', 139), wp: [0.49, 0.45] },
    { id: 'a4', inning: 1, half: 'top', outsBefore: 2, basesBefore: E, batterId: 'p35', pitcherId: 'p01', count: { b: 1, s: 2 }, pitches: 6, code: 'K', text: '남궁율, 헛스윙 삼진 — JH 커브', rbi: 0, score: [1, 0], outsAfter: 3, lastPitch: { type: 'SIG', name: 'JH 커브', kmh: 121, zone: [0.46, 0.92] }, causes: [{ factor: 'signature', text: 'JH 커브 낙차 — 오늘 헛스윙 7개' }], wp: [0.45, 0.46] },
    // 1회말
    { id: 'a5', inning: 1, half: 'bot', outsBefore: 0, basesBefore: E, batterId: 'p03', pitcherId: 'p23', count: { b: 4, s: 1 }, pitches: 6, code: 'BB', text: '연이준, 볼넷', rbi: 0, score: [1, 0], outsAfter: 0, wp: [0.46, 0.49] },
    { id: 'a6', inning: 1, half: 'bot', outsBefore: 0, basesBefore: ['p03', null, null], batterId: 'p06', pitcherId: 'p23', count: { b: 1, s: 0 }, pitches: 2, code: 'DP', text: '표건우, 유격수 땅볼 병살', notation: '6-4-3', rbi: 0, score: [1, 0], outsAfter: 2, hit: hit(-8, 36, 'ground', 128), wp: [0.49, 0.44] },
    { id: 'a7', inning: 1, half: 'bot', outsBefore: 2, basesBefore: E, batterId: 'p09', pitcherId: 'p23', count: { b: 1, s: 2 }, pitches: 5, code: 'FO', text: '구해솔, 우익수 뜬공', notation: 'F9', rbi: 0, score: [1, 0], outsAfter: 3, hit: hit(30, 82, 'fly', 134), wp: [0.44, 0.43] },
    // 3회말
    { id: 'a8', inning: 3, half: 'bot', outsBefore: 0, basesBefore: E, batterId: 'p07', pitcherId: 'p23', count: { b: 2, s: 2 }, pitches: 7, code: 'K', text: '탁민재, 헛스윙 삼진 — 고속 슬라이더', rbi: 0, score: [1, 0], outsAfter: 1, lastPitch: { type: 'SIG', name: '고속 슬라이더', kmh: 141, zone: [0.78, 0.84] }, wp: [0.43, 0.41] },
    { id: 'a9', inning: 3, half: 'bot', outsBefore: 1, basesBefore: E, batterId: 'p08', pitcherId: 'p23', count: { b: 1, s: 1 }, pitches: 3, code: '1B', text: '진서율, 우전 안타', rbi: 0, score: [1, 0], outsAfter: 1, hit: hit(28, 62, 'ground', 132), wp: [0.41, 0.45] },
    { id: 'a10', inning: 3, half: 'bot', outsBefore: 1, basesBefore: ['p08', null, null], batterId: 'p03', pitcherId: 'p23', count: { b: 0, s: 2 }, pitches: 4, code: 'GO', text: '연이준, 2루 땅볼 — 주자 2루로', notation: '4-3', rbi: 0, score: [1, 0], outsAfter: 2, hit: hit(16, 31, 'ground', 112), wp: [0.45, 0.42] },
    { id: 'a11', inning: 3, half: 'bot', outsBefore: 2, basesBefore: [null, 'p08', null], batterId: 'p06', pitcherId: 'p23', count: { b: 4, s: 2 }, pitches: 8, code: 'BB', text: '표건우, 끈질긴 승부 끝에 볼넷', rbi: 0, score: [1, 0], outsAfter: 2, wp: [0.42, 0.45] },
    { id: 'a12', inning: 3, half: 'bot', outsBefore: 2, basesBefore: ['p06', 'p08', null], batterId: 'p09', pitcherId: 'p23', count: { b: 1, s: 1 }, pitches: 3, code: '2B', text: '구해솔, 우측 갑천 벽(7m) 직격 2타점 2루타', rbi: 2, score: [1, 2], outsAfter: 2, hit: hit(31, Math.round(fenceAt(D.stadium.fence, 31) * 10) / 10, 'fly', 171), lastPitch: { type: 'SIG', name: '고속 슬라이더', kmh: 140, zone: [0.4, 0.55] }, causes: [{ factor: 'park', text: '갑천 벽 7m — 다른 구장이면 홈런', decisive: true }], wp: [0.45, 0.62] },
    { id: 'a13', inning: 3, half: 'bot', outsBefore: 2, basesBefore: [null, 'p09', null], batterId: 'p04', pitcherId: 'p23', count: { b: 0, s: 0 }, pitches: 1, code: 'FO', text: '봉시혁, 좌익수 뜬공', notation: 'F7', rbi: 0, score: [1, 2], outsAfter: 3, hit: hit(-30, 88, 'fly', 140), wp: [0.62, 0.61] },
    // 5회초
    { id: 'a14', inning: 5, half: 'top', outsBefore: 0, basesBefore: E, batterId: 'p16', pitcherId: 'p01', count: { b: 1, s: 2 }, pitches: 5, code: '1B', text: '반태오, 좌전 안타', rbi: 0, score: [1, 2], outsAfter: 0, hit: hit(-30, 55, 'line', 146), wp: [0.62, 0.58] },
    { id: 'a15', inning: 5, half: 'top', outsBefore: 0, basesBefore: ['p16', null, null], batterId: 'p15', pitcherId: 'p01', count: { b: 4, s: 1 }, pitches: 6, code: 'BB', text: '선우겸, 볼넷 — 무사 1·2루', rbi: 0, score: [1, 2], outsAfter: 0, wp: [0.58, 0.52] },
    { id: 'a16', inning: 5, half: 'top', outsBefore: 0, basesBefore: ['p15', 'p16', null], batterId: 'p24', pitcherId: 'p01', count: { b: 1, s: 1 }, pitches: 3, code: 'FO', text: '설한결, 중견수 뜬공', notation: 'F8', rbi: 0, score: [1, 2], outsAfter: 1, hit: hit(2, 92, 'fly', 137), wp: [0.52, 0.56] },
    { id: 'a17', inning: 5, half: 'top', outsBefore: 1, basesBefore: ['p15', 'p16', null], batterId: 'p35', pitcherId: 'p01', count: { b: 2, s: 1 }, pitches: 4, code: 'HR', text: '남궁율, 밀어서 넘긴 좌중간 3점 홈런', rbi: 3, score: [4, 2], outsAfter: 1, hit: hit(-22, 119, 'fly', 163), lastPitch: { type: 'FF', name: '포심', kmh: 149, zone: [0.3, 0.42] }, causes: [{ factor: 'wind', text: `바람 +6m — 바람 없었으면 담장(${Math.round(fenceAt(D.stadium.fence, -22))}m) 앞 뜬공`, decisive: true }], wp: [0.56, 0.27] },
    { id: 'a18', inning: 5, half: 'top', outsBefore: 1, basesBefore: E, batterId: 'p19', pitcherId: 'p01', count: { b: 0, s: 1 }, pitches: 2, code: 'GO', text: '국지환, 1루 땅볼', notation: '3-1', rbi: 0, score: [4, 2], outsAfter: 2, hit: hit(38, 24, 'ground', 118), wp: [0.27, 0.28] },
    { id: 'a19', inning: 5, half: 'top', outsBefore: 2, basesBefore: E, batterId: 'p38', pitcherId: 'p01', count: { b: 2, s: 2 }, pitches: 7, code: 'K', text: '디에고 살바르, 헛스윙 삼진 — JH 커브', rbi: 0, score: [4, 2], outsAfter: 3, lastPitch: { type: 'SIG', name: 'JH 커브', kmh: 122, zone: [0.5, 0.95] }, wp: [0.28, 0.29] },
    // 6회말
    { id: 'a20', inning: 6, half: 'bot', outsBefore: 1, basesBefore: E, batterId: 'p04', pitcherId: 'p23', count: { b: 1, s: 2 }, pitches: 6, code: 'HR', text: '봉시혁, 좌측 담장 넘기는 솔로 홈런', rbi: 1, score: [4, 3], outsAfter: 1, hit: hit(-35, 112, 'fly', 168), lastPitch: { type: 'SIG', name: '고속 슬라이더', kmh: 139, zone: [0.45, 0.6] }, causes: [{ factor: 'adapt', text: '세 번째 슬라이더에 눈이 익음' }], wp: [0.28, 0.38] },
    // 7회초 — 호수비
    {
      id: 'a21', inning: 7, half: 'top', outsBefore: 2, basesBefore: ['p19', 'p35', null], batterId: 'p38', pitcherId: 'p01', count: { b: 3, s: 2 }, pitches: 9,
      code: 'LO', text: '디에고 살바르, 우중간 깊숙한 직선타 — 연이준 다이빙 캐치', notation: 'L8', rbi: 0, score: [4, 3], outsAfter: 3,
      hit: hit(10, 106, 'line', 166), lastPitch: { type: 'FF', name: '포심', kmh: 147, zone: [0.55, 0.5] },
      causes: [{ factor: 'chem', text: '케미 3단 — 구해솔과 콜 사인' }, { factor: 'enhance', text: '강화 VII — 수비 범위 +5' }],
      defense: {
        hangS: 2.75,
        catchProb: 0.18,
        fielders: [
          { pos: 'CF', playerId: 'p03', from: rf(mToField(-4, 100)), reactS: 0.3, mps: 9.2, arriveS: 2.75, dive: true },
          { pos: 'RF', playerId: 'p09', from: rf(mToField(48, 72)), reactS: 0.42, mps: 8.1 },
          { pos: 'LF', playerId: 'p13', from: rf(mToField(-50, 74)), reactS: 0.5, mps: 7.4 },
          { pos: '2B', playerId: 'p08', from: rf(mToField(14, 38)), reactS: 0.35, mps: 8.4 },
        ],
      },
      wp: [0.3, 0.43],
      highlight: { kind: 'defense', title: '호수비!', sub: '연이준 · 우중간 다이빙 캐치', meta: '잡을 확률 18% · 2점 지킴', teamId: 'dj' },
    },
    // 8회말 — 동점 적시타
    {
      id: 'a22', inning: 8, half: 'bot', outsBefore: 1, basesBefore: ['p04', null, 'p09'], batterId: 'p14', pitcherId: 'p31', count: { b: 1, s: 1 }, pitches: 3,
      code: '1B', text: '위태건, 좌전 적시타 — 4:4 동점', rbi: 1, score: [4, 4], outsAfter: 1,
      hit: hit(-25, 58, 'line', 162), lastPitch: { type: 'SIG', name: '백도어 슬라이더', kmh: 131, zone: [0.7, 0.55] },
      causes: [{ factor: 'platoon', text: '좌투 상대 컨택 +6 (좌우 상성)' }],
      wp: [0.31, 0.58],
      highlight: { kind: 'clutch', title: '동점 적시타!', sub: '위태건 · 8회말 1사 1·3루', meta: '승리 확률 31% → 58%', teamId: 'dj' },
    },
    { id: 'a23', inning: 8, half: 'bot', outsBefore: 1, basesBefore: ['p14', 'p04', null], batterId: 'p05', pitcherId: 'p31', count: { b: 0, s: 1 }, pitches: 2, code: 'DP', text: '석윤호, 1루수 앞 병살', notation: '3-6-1', rbi: 0, score: [4, 4], outsAfter: 3, hit: hit(40, 30, 'ground', 124), wp: [0.58, 0.52] },
    // 9회초 — 위기 탈출
    { id: 'a24', inning: 9, half: 'top', outsBefore: 0, basesBefore: ['p35', 'p24', null], batterId: 'p19', pitcherId: 'p02', count: { b: 2, s: 2 }, pitches: 6, code: 'HBP', text: '국지환, 몸에 맞는 공 — 무사 만루', rbi: 0, score: [4, 4], outsAfter: 0, wp: [0.4, 0.31] },
    { id: 'a25', inning: 9, half: 'top', outsBefore: 0, basesBefore: ['p19', 'p35', 'p24'], batterId: 'p38', pitcherId: 'p02', count: { b: 1, s: 2 }, pitches: 5, code: 'K', text: '디에고 살바르, 헛스윙 삼진 — 도빈 체인지업', rbi: 0, score: [4, 4], outsAfter: 1, lastPitch: { type: 'SIG', name: '도빈 체인지업', kmh: 128, zone: [0.5, 0.9] }, causes: [{ factor: 'signature', text: '도빈 체인지업 — 헛스윙 4/6' }], wp: [0.31, 0.42] },
    {
      id: 'a26', inning: 9, half: 'top', outsBefore: 1, basesBefore: ['p19', 'p35', 'p24'], batterId: 'p18', pitcherId: 'p02', count: { b: 0, s: 1 }, pitches: 2,
      code: 'DP', text: '여시헌, 투수 앞 병살 — 홈에서 하나, 1루에서 하나', notation: '1-2-3', rbi: 0, score: [4, 4], outsAfter: 3,
      hit: hit(2, 16, 'ground', 109), lastPitch: { type: 'SIG', name: '도빈 체인지업', kmh: 127, zone: [0.48, 0.86] },
      wp: [0.42, 0.66],
      highlight: { kind: 'escape', title: '만루 위기 탈출!', sub: '은도빈 · 무사 만루 무실점', meta: '승리 확률 31% → 66%', teamId: 'dj' },
    },
    // 9회말 — 끝내기
    { id: 'a27', inning: 9, half: 'bot', outsBefore: 0, basesBefore: E, batterId: 'p08', pitcherId: 'p28', count: { b: 4, s: 2 }, pitches: 8, code: 'BB', text: '진서율, 볼넷 — 무사 1루', rbi: 0, score: [4, 4], outsAfter: 0, wp: [0.66, 0.72] },
    { id: 'a28', inning: 9, half: 'bot', outsBefore: 0, basesBefore: ['p08', null, null], batterId: 'p03', pitcherId: 'p28', count: { b: 1, s: 0 }, pitches: 1, code: 'SB', text: '진서율, 2루 도루 성공', rbi: 0, score: [4, 4], outsAfter: 0, causes: [{ factor: 'form', text: '어진석 퀵모션 1.42초 — 스타트 성공' }], wp: [0.72, 0.8] },
    {
      id: 'a29', inning: 9, half: 'bot', outsBefore: 0, basesBefore: [null, 'p08', null], batterId: 'p03', pitcherId: 'p28', count: { b: 1, s: 1 }, pitches: 3,
      code: '1B', text: '연이준, 우중간 끝내기 안타!', rbi: 1, score: [4, 5], outsAfter: 0,
      hit: hit(16, 74, 'line', 158), lastPitch: { type: 'SIG', name: '스크루볼', kmh: 129, zone: [0.36, 0.62] },
      causes: [{ factor: 'adapt', text: '스크루볼 세 번째 — 궤적에 눈이 익음' }],
      wp: [0.8, 1],
      highlight: { kind: 'walkoff', title: '끝내기!', sub: '연이준 · 9회말 우중간 끝내기 안타', meta: '승리 확률 80% → 100%', teamId: 'dj' },
    },
  ] satisfies Play[],
};

/* ───────── 순위 · 랭킹 ───────── */
const st = (teamId: string, w2: number, d: number, l: number, streak: string, last10: string) => ({ teamId, w: w2, d, l, streak, last10 });
const rawStand = [
  st('st', 45, 2, 24, '2승', 'WWLWWDWLWW'),
  st('bs', 43, 3, 25, '1패', 'LWWWLWDWWL'),
  st('dj', 41, 3, 27, '3승', 'WWWLWLWDWW'),
  st('dg', 39, 1, 31, '1승', 'WLWLWWLWLW'),
  st('gj', 36, 2, 33, '2패', 'LLWWWLWDLL'),
  st('sb', 34, 3, 34, '1승', 'WLDLWWLLWW'),
  st('ic', 33, 1, 37, '1패', 'LWLWLLWWLL'),
  st('sw', 31, 2, 38, '3패', 'LLLWWLWLLL'),
  st('cw', 28, 2, 41, '1승', 'WLLLWLLDLW'),
  st('sh', 26, 1, 44, '4패', 'LLLLWLWLLL'),
];
export const STANDINGS: StandingRow[] = rawStand.map((s) => ({
  ...s,
  pct: r3(s.w / (s.w + s.l)),
  gb: ((rawStand[0].w - s.w) + (s.l - rawStand[0].l)) / 2,
}));

export const USER_RANKING: UserRankRow[] = [
  { rank: 1, user: '호랑이3대째', teamId: 'gj', rating: 2481, delta: 12, w: 61, d: 2, l: 13, power: 1104, collection: 1022 },
  { rank: 2, user: '큰발응원단', teamId: 'bs', rating: 2437, delta: -8, w: 58, d: 4, l: 14, power: 1096, collection: 988 },
  { rank: 3, user: '월미등대', teamId: 'ic', rating: 2402, delta: 21, w: 57, d: 1, l: 18, power: 1089, collection: 941 },
  { rank: 4, user: '한강반달', teamId: 'sb', rating: 2366, delta: 4, w: 55, d: 3, l: 19, power: 1077, collection: 915 },
  { rank: 5, user: '팔달요술', teamId: 'sw', rating: 2341, delta: -15, w: 54, d: 2, l: 21, power: 1071, collection: 902 },
  { rank: 128, user: '독수리둥지', teamId: 'dj', rating: 1842, delta: 24, w: 42, d: 3, l: 31, power: 1012, collection: 412, me: true },
];

/* ───────── 비동기 대전 상대 ───────── */
export const PVP_OPPONENTS: PvpOpponent[] = [
  { id: 'o1', user: '큰발응원단', teamId: 'bs', rating: 1866, power: 1031, lineupOvr: 93, record: { w: 44, d: 2, l: 29 }, recent: ['W', 'L', 'W', 'W', 'L'], rival: 'rival', reward: 1500, ace: 'c35' },
  { id: 'o2', user: '월미등대', teamId: 'ic', rating: 1861, power: 1024, lineupOvr: 90, record: { w: 41, d: 1, l: 30 }, recent: ['W', 'W', 'W', 'L', 'W'], rival: 'revenge', reward: 1400, ace: 'c26' },
  { id: 'o3', user: '영산호랑이', teamId: 'gj', rating: 1820, power: 1008, lineupOvr: 89, record: { w: 39, d: 4, l: 31 }, recent: ['L', 'W', 'D', 'W', 'L'], reward: 1200, ace: 'c28' },
  { id: 'o4', user: '노을돔지기', teamId: 'sh', rating: 1798, power: 996, lineupOvr: 88, record: { w: 37, d: 2, l: 33 }, recent: ['W', 'L', 'L', 'W', 'W'], reward: 1100, ace: 'c31' },
  { id: 'o5', user: '합포골판', teamId: 'cw', rating: 1775, power: 981, lineupOvr: 86, record: { w: 35, d: 3, l: 36 }, recent: ['L', 'L', 'W', 'L', 'W'], reward: 1000, ace: 'c19' },
  { id: 'o6', user: '쌍둥이별', teamId: 'st', rating: 1750, power: 970, lineupOvr: 85, record: { w: 33, d: 1, l: 38 }, recent: ['W', 'L', 'L', 'L', 'W'], reward: 900, ace: 'c15' },
];

/* ───────── 뽑기 ───────── */
// 확률은 카드 한 장마다 따로(30장 모두 각자 뽑음 — 한 팩에 좋은 카드가 여러 장 나올 수도 있다).
// 10-24 사용자 요청 "좋은 거 나올 확률이 너무 높다, 확 낮춰 … 마구마구 확률 ×100%" — 예전(프리미엄 팩당 레전드급 90%)에서 크게 낮춤.
//   마구마구 공식 확률 공개(넷마블 가이드)의 '포함팩'(예: TH포함엘리트팩 — 한 팩 1장, 특급 등급 5%)에 맞춰
//   팩당 레전드급(레전드 · MVP · GG · TH · 프랜차이즈 · 블랙 · 시그니처) 1장 이상 — 일반 0.5% · 프리미엄(연도 · 구단) 5% · 스페셜 10% · 레전드팩 15%
// 10-24 다음 요청 "카드구매 확률 조금씩 높이자" — 등급마다 조금씩: 스페셜 ×1.13 · 레어 ×1.2~1.3 · 엘리트 ×1.4 · 레전드급 ×1.5 (맨 아래 등급이 나머지)
//   → 팩당 레전드급 1장 이상: 일반 0.7% · 프리미엄(연도 · 구단) 7.4% · 스페셜 14% · 레전드팩 22%
// 10-24 아침 "조금만 더" — 레어 ×1.1~1.25 · 엘리트 ×1.2~1.3 · 레전드급 ×1.3
//   → 팩당 레전드급 1장 이상: 일반 0.9% · 프리미엄(연도 · 구단) 9.7% · 스페셜 18% · 레전드팩 27%
const PREMIUM_ODDS: Pack['odds'] = [
  { grade: 'special', pct: 75.8614 }, { grade: 'rare', pct: 20 }, { grade: 'elite', pct: 3.8 }, { grade: 'legend', pct: 0.2 },
  { grade: 'mvp', pct: 0.043 }, { grade: 'gg', pct: 0.043 }, { grade: 'th', pct: 0.043 },
  { grade: 'franchise', pct: 0.0065 }, { grade: 'black', pct: 0.0024 }, { grade: 'signature', pct: 0.0007 },
];

/** 모든 팩 30장 묶음 · 가격은 임시(요구사항 39번) · 확률 공개 · 천장은 팩 종류별 */
export const PACKS: Pack[] = [
  {
    id: 'basic', name: '일반팩', desc: '노멀~레전드 30장', size: 30,
    price: { gp: 30_000 },
    odds: [{ grade: 'normal', pct: 78.679 }, { grade: 'special', pct: 18.5 }, { grade: 'rare', pct: 2.5 }, { grade: 'elite', pct: 0.29 }, { grade: 'legend', pct: 0.031 }],
    pity: { count: 0, max: 30, guaranteed: '엘리트 이상 1장' },
  },
  {
    id: 'premium', name: '프리미엄팩', desc: '스페셜 이상 30장 · 특별 등급 포함', size: 30,
    price: { gp: 270_000 },
    odds: PREMIUM_ODDS,
    pity: { count: 0, max: 30, guaranteed: '레전드 이상 선택권' },
  },
  {
    id: 'special', name: '스페셜팩', desc: '레어 이상 30장 · MVP·GG·TH 확률 ↑', size: 30,
    price: { gp: 450_000 },
    odds: [
      { grade: 'rare', pct: 86.326 }, { grade: 'elite', pct: 13 }, { grade: 'legend', pct: 0.43 },
      { grade: 'mvp', pct: 0.065 }, { grade: 'gg', pct: 0.065 }, { grade: 'th', pct: 0.065 },
      { grade: 'franchise', pct: 0.035 }, { grade: 'black', pct: 0.012 }, { grade: 'signature', pct: 0.002 },
    ],
    pity: { count: 0, max: 25, guaranteed: '블랙 이상 1장' },
  },
  {
    id: 'legend', name: '레전드팩', desc: '엘리트 이상 30장 · 이번 주 한정', size: 30,
    price: { ball: 9_000 },
    odds: [
      { grade: 'elite', pct: 98.9492 }, { grade: 'legend', pct: 0.62 }, { grade: 'franchise', pct: 0.088 },
      { grade: 'mvp', pct: 0.098 }, { grade: 'gg', pct: 0.098 }, { grade: 'th', pct: 0.098 },
      { grade: 'black', pct: 0.039 }, { grade: 'signature', pct: 0.0098 },
    ],
    pity: { count: 0, max: 15, guaranteed: '시그니처 선택권' },
    limited: '이번 주 한정',
  },
  {
    id: 'year', name: '연도팩', desc: '고른 시즌만 · 그 해 리그에 있던 모든 구단 · 프리미엄 확률', size: 30,
    price: { gp: 540_000 }, priceMul: 2,
    odds: PREMIUM_ODDS,
    // 1982 ~ 2027 한 해 단위 (요구 40 + 옛 구단)
    pick: { kind: 'year', options: Array.from({ length: CURRENT_SEASON - FIRST_SEASON + 1 }, (_, i) => CURRENT_SEASON - i) },
    pity: { count: 0, max: 30, guaranteed: '그 연도 레전드 이상 선택권' },
  },
  {
    id: 'club', name: '구단팩', desc: '고른 구단만 · 연도는 고를 수 없음(그 구단이 있던 모든 연도)', size: 30,
    price: { gp: 675_000 }, priceMul: 2.5,
    odds: PREMIUM_ODDS,
    pick: { kind: 'club', options: ALL_CLUBS.map((c) => c.code) },
    pity: { count: 0, max: 30, guaranteed: '그 구단 카드 중 선택' },
  },
];

/** 카드 조합(룰렛) 예시 — 칸 크기 = 실제 확률, 더 넣으면 윗 등급 칸이 넓어진다 */
export const ROULETTE_EXAMPLE: Roulette = {
  input: 5,
  grade: 'rare',
  slots: [
    { label: '레어', grade: 'rare', pct: 70 },
    { label: '엘리트', grade: 'elite', pct: 25 },
    { label: '레전드', grade: 'legend', pct: 5 },
  ],
};

/* ───────── AI 스카우트 상점 ───────── */
export const SCOUT_SHOP: ScoutShop = {
  refreshAt: '내일 05:00',
  dailyLimit: 3,
  bought: 1,
  scout: { name: '노 스카우트', line: '오늘은 내야가 좋아요. 셋까지만 데려갈 수 있어요.' },
  items: [
    { id: 's1', cardId: 'c16', price: { gp: 42000 }, valueTag: '시세보다 싸요', scoutNote: '발이 진짜 빨라요. 1번 자리 비었으면 이 친구예요.' },
    { id: 's2', cardId: 'c24', price: { gp: 168000 }, scoutNote: '낮은 공을 걷어 올리는 3루수. 대전 좌측 바람이랑 궁합이 좋아요.' },
    { id: 's3', cardId: 'c31', price: { gp: 39000 }, valueTag: '오늘만', scoutNote: '좌타자 셋이 이어 나오면 이 친구 하나로 끝나요.' },
    { id: 's4', cardId: 'c18', price: { ball: 260 }, valueTag: '잘 안 나와요', scoutNote: '작년 골든글러브 포수. 블로킹은 리그에서 제일 단단해요.' },
    { id: 's5', cardId: 'c32', price: { gp: 132000 }, scoutNote: '중견수 수비는 걱정 끝이었는데, 먼저 데려간 분이 있네요.', soldOut: true },
    { id: 's6', cardId: 'c15', price: { ball: 900 }, valueTag: '잘 안 나와요', scoutNote: '작년 MVP. 이 가격으로 다시 보기 어려워요.' },
  ],
};

/* ───────── 나 · 다음 경기 · 소식 ───────── */
export const ME: Me = {
  user: '독수리둥지',
  teamId: 'dj',
  managerName: '감독님',
  season: SEASON,
  gp: 1_000_000_000_000,
  ball: 100_000_000,
  seasonNo: 1,
  richUntil: 10,
  rating: 1842,
  ratingDelta: 24,
  record: { w: 42, d: 3, l: 31 },
  rank: 128,
  collection: { have: 412, total: 1280 },
  pvpLeft: 7,
};

export const NEXT_GAME: NextGame = {
  opponentId: 'dg',
  home: true,
  date: TODAY,
  time: '18:30',
  stadium: D.stadium.name,
  weather: WEATHER_TODAY,
  probable: { mine: 'c10', theirs: 'p39' },
  wpPreview: 0.57,
};

export const NEWS: NewsItem[] = [
  { kind: '불방망이', text: '위태건, 최근 7경기 홈런 4개', when: '어제', playerId: 'p14' },
  { kind: '기록', text: '제갈현, 시즌 100탈삼진 돌파', when: '어제', playerId: 'p01' },
  { kind: '부상', text: '독고현, 어깨 뭉침 — 이틀 휴식', when: '오늘', playerId: 'p11' },
  { kind: '슬럼프', text: '진서율, 최근 10경기 타율 .182', when: '오늘', playerId: 'p08' },
  { kind: '구단', text: '토요일 홈경기, 새 응원가 첫 공개', when: '3일 뒤' },
];

/* ───────── 찾기 ───────── */
/* ───────── 독수리스 좌익수·지명타자 (라인업 9/9 '능력치 폭발'을 맞출 수 있게 — 벤치) ───────── */
const lineOf = (g: number, ab: number, h: number, d2: number, d3: number, hr: number, rbi: number, r: number, sb: number, bb: number, so: number): BattingLine => {
  const singles = h - d2 - d3 - hr;
  const avg = h / ab;
  const obp = (h + bb) / (ab + bb);
  const slg = (singles + 2 * d2 + 3 * d3 + 4 * hr) / ab;
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  return { g, pa: ab + bb + 4, ab, h, d2, d3, hr, rbi, r, sb, bb, so, avg: r3(avg), obp: r3(obp), slg: r3(slg), ops: r3(obp + slg) };
};

const DJ_EXTRA_PLAYERS: Player[] = [
  {
    ...PLAYERS.find((x) => x.id === 'p21')!,
    id: 'lp1', name: '사공린', teamId: 'dj', number: 35, pos: 'LF', subPos: ['RF'], bats: 'L', throws: 'R',
    age: 24, heightCm: 181, weightKg: 79, draftYear: 2021, ovr: 78, look: 'look:lp1',
    face: [
      { code: 'CON', ko: '컨택', v: 80 }, { code: 'POW', ko: '파워', v: 70 }, { code: 'EYE', ko: '선구', v: 76 },
      { code: 'SPD', ko: '주루', v: 82 }, { code: 'DEF', ko: '수비', v: 77 }, { code: 'ARM', ko: '송구', v: 72 },
    ],
    potential: 4.5, traits: ['밀어치기 장인'], personality: '성실파', form: { bat: '오픈 스탠스' },
    season: { bat: lineOf(66, 238, 70, 13, 2, 6, 31, 38, 9, 26, 48) }, condition: 4, fatigue: 14, injury: undefined,
  },
  {
    ...PLAYERS.find((x) => x.id === 'p14')!,
    id: 'lp2', name: '서문혁', teamId: 'dj', number: 50, pos: 'DH', subPos: ['1B'], bats: 'R', throws: 'R',
    age: 31, heightCm: 188, weightKg: 102, draftYear: 2014, ovr: 83, look: 'look:lp2',
    face: [
      { code: 'CON', ko: '컨택', v: 81 }, { code: 'POW', ko: '파워', v: 90 }, { code: 'EYE', ko: '선구', v: 80 },
      { code: 'GAP', ko: '장타', v: 86 }, { code: 'ADJ', ko: '대처', v: 79 }, { code: 'SPD', ko: '주루', v: 52 },
    ],
    potential: 3, traits: ['직구 노림수'], personality: '느긋한 성격', form: { bat: '어퍼 스윙' },
    season: { bat: lineOf(70, 255, 74, 15, 0, 17, 58, 41, 1, 33, 71) }, condition: 3, fatigue: 22, injury: undefined,
  },
];

const DJ_EXTRA_CARDS: CardInst[] = [
  { id: 'lc1', playerId: 'lp1', grade: 'special', year: 27, level: 4.6, enhance: 1, dup: 0 },
  { id: 'lc2', playerId: 'lp2', grade: 'rare', year: 27, level: 6.35, enhance: 2, dup: 0, isNew: true },
];

PLAYERS.push(...DJ_EXTRA_PLAYERS);
CARDS.push(...DJ_EXTRA_CARDS);
MY_CARD_IDS.push(...DJ_EXTRA_CARDS.map((c) => c.id));

// 카드별 종합 — 선수 ovr 은 그 선수 대표 카드(첫 카드) 기준. 다른 등급·지난 시즌 카드는 보정
{
  const main = new Map<string, CardInst>();
  for (const c of CARDS) if (!main.has(c.playerId)) main.set(c.playerId, c);
  for (const c of CARDS) {
    const p = PLAYERS.find((x) => x.id === c.playerId);
    const m = main.get(c.playerId);
    if (!p || !m || c.ovr != null) continue;
    const old = c.year != null && c.year < SEASON % 100 ? -1 : 0;
    c.ovr = Math.max(40, Math.min(99, p.ovr + GRADE_OVR[c.grade] - GRADE_OVR[m.grade] + old));
  }
}

/* ───────── 부활 구단 — 시작 구단으로 옛 구단을 고르면 2027 리그에서 같은 연고 계보의 현재 구단 자리를 대신한다 ───────── */
//  · 리그 구단 수는 10 그대로. 바뀐 자리는 순위표·다음 경기·어제 경기·내 구단 id 를 부활 구단 id 로 옮긴다(가입자 순위·대전 상대는 다른 사람 구단이라 그대로).
//  · 시작 설정(bb.start)은 club-select 가 이 기기에 둔다. 앱이 뜰 때 한 번 읽고, 개막에서 리그가 바뀌면 화면을 다시 불러 모두 새로 맞춘다.
//  · 리그 구성이 바뀌면 이전 구성으로 쌓은 시즌 기록(bb.season*)은 맞지 않아 지우고 새로 시작한다.
const START_KEY = 'bb.start';
const LEAGUE_KEY = 'bb.league';
/** 이 기기에 저장된 시작 구단 id (없으면 null) */
export function savedStartClub(): string | null {
  try {
    const raw = localStorage.getItem(START_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { club?: unknown };
    return typeof v.club === 'string' ? v.club : null;
  } catch { return null; }
}
/** 이 시작 구단이면 2027 리그 구단 id 10개 (부활 반영) */
export function leagueIdsFor(startClub: string | null): string[] {
  const old = OLD_TEAMS.find((t) => t.id === startClub);
  const slot = old?.revives?.toLowerCase();
  return CURRENT_TEAMS.map((t) => (old && t.id === slot ? old.id : t.id));
}
/** 개막 전에 — 고른 시작 구단으로 리그 구성이 지금과 달라지나 (다르면 화면을 다시 불러야 함) */
export const leagueChangesWith = (startClub: string) => leagueIdsFor(startClub).join(',') !== TEAMS.map((t) => t.id).join(',');

function applyRevival(oldId: string | null) {
  const old = OLD_TEAMS.find((t) => t.id === oldId);
  if (!old?.revives) return;
  const slotId = old.revives.toLowerCase();
  const idx = TEAMS.findIndex((t) => t.id === slotId);
  if (idx < 0) return;
  const slot = TEAMS[idx];
  old.revived = true;
  TEAMS[idx] = old;
  const sw = (id: string) => (id === slotId ? old.id : id);
  for (const r of STANDINGS) r.teamId = sw(r.teamId);
  NEXT_GAME.opponentId = sw(NEXT_GAME.opponentId);
  if (ME.teamId === slotId) {
    ME.teamId = old.id;
    if (NEXT_GAME.home && NEXT_GAME.stadium === slot.stadium.name) NEXT_GAME.stadium = old.stadium.name;
  }
  if (LAST_MATCH.homeId === slotId && LAST_MATCH.stadium === slot.stadium.name) LAST_MATCH.stadium = old.stadium.name;
  LAST_MATCH.awayId = sw(LAST_MATCH.awayId);
  LAST_MATCH.homeId = sw(LAST_MATCH.homeId);
  for (const p of LAST_MATCH.plays) if (p.highlight) p.highlight.teamId = sw(p.highlight.teamId);
}
/* ───────── 내 구단 — 구단 선택(#/club-select)에서 고른 구단 ───────── */
//  · 고른 구단(현재 10 · 옛 10 — 옛 구단이면 위 applyRevival 로 리그에 들어와 있음)이 앱 전체의 '내 구단'(ME.teamId)이다.
//    헤더 · 홈 · 라인업 · 세트덱 · 경기 · 시즌 · 순위 · 대전 스냅샷 · 구단 색(main.tsx)이 모두 ME.teamId 를 본다.
//  · 아직 안 골랐으면(bb.start 없음) 기본 대전 독수리스 — 처음 들어오면 구단 선택으로 안내한다(App · 홈).
//  · 앱이 뜰 때 한 번 정한다. 개막에서 구단이 바뀌면 club-select 가 시즌 진행을 지우고 화면을 다시 불러 모두 새로 맞춘다.
function applyMyClub(id: string | null) {
  const team = TEAMS.find((t) => t.id === id);
  if (!team || team.id === ME.teamId) return; // 리그 밖 구단 · 이미 내 구단
  const prev = ME.teamId;
  ME.teamId = team.id;
  // 목업 '다음 경기'(시즌 첫 상대)가 내 구단 자신이 되지 않게 — 원래 기본 구단과 맞바꾼다
  if (NEXT_GAME.opponentId === team.id) NEXT_GAME.opponentId = prev;
  const host = NEXT_GAME.home ? team : TEAMS.find((t) => t.id === NEXT_GAME.opponentId);
  if (host) NEXT_GAME.stadium = host.stadium.name;
}
applyRevival(savedStartClub());
applyMyClub(savedStartClub());
// 리그 구성이 바뀌었으면 이전 구성의 시즌 기록을 지운다 (순위표에 없는 구단 → 계산이 깨짐)
try {
  const sig = TEAMS.map((t) => t.id).join(',');
  const prev = localStorage.getItem(LEAGUE_KEY);
  if (prev !== sig) {
    const revivedNow = TEAMS.some((t) => t.revived);
    if (prev != null || revivedNow) for (const k of Object.keys(localStorage)) if (k.startsWith('bb.season')) localStorage.removeItem(k);
    localStorage.setItem(LEAGUE_KEY, sig);
  }
} catch { /* 저장이 막혀 있으면 이번 방문만 */ }

const teamMap = new Map(ALL_TEAMS.map((t) => [t.id, t]));
const codeMap = new Map(ALL_TEAMS.map((t) => [t.code, t]));
const playerMap = new Map(PLAYERS.map((p) => [p.id, p]));
const cardMap = new Map(CARDS.map((c) => [c.id, c]));

/** 구단 찾기 — 현재 · 옛 구단 모두 (리그 밖 구단도 카드에 나온다) */
export const teamById = (id: string): Team => teamMap.get(id) ?? TEAMS[0];
/** 코드로 구단 찾기 ('DJ' · 'DDG') */
export const teamByCode = (code: string): Team => codeMap.get(code as ClubCode) ?? TEAMS[0];
/** 있는 구단 id 인가 (현재 · 옛) */
export const isTeamId = (id: string) => teamMap.has(id);
/** 서버(대전 순위)가 아는 구단 코드 — 부활 구단은 대신 들어간 현재 구단 자리로 보낸다 */
export const serverClubId = (id: string) => teamMap.get(id)?.revives?.toLowerCase() ?? id;
/** 미리 만들어 두지 않는 선수·카드(실제 선수 카탈로그 game/kbo)를 찾을 때 만들어 주는 곳 */
export interface Resolver { player?: (id: string) => Player | undefined; card?: (id: string) => CardInst | undefined }
const resolvers: Resolver[] = [];
export function registerResolver(r: Resolver) { resolvers.push(r); }
function resolvePlayerId(id: string): Player | undefined {
  for (const r of resolvers) { const p = r.player?.(id); if (p) return p; }
  return undefined;
}
function resolveCardId(id: string): CardInst | undefined {
  for (const r of resolvers) { const c = r.card?.(id); if (c) { cardMap.set(id, c); return c; } }
  return undefined;
}
export const playerById = (id: string): Player | undefined => playerMap.get(id) ?? resolvePlayerId(id);
export const cardById = (id: string): CardInst | undefined => cardMap.get(id) ?? resolveCardId(id);
/** 카드의 선수 (없으면 첫 선수 — 목업이라 항상 있음) */
export const playerOfCard = (c: CardInst): Player => playerById(c.playerId) ?? PLAYERS[0];

/** 화면이 만든 선수·카드를 찾을 수 있게 등록 (구단팩 가상 선수 등) — 서버가 붙으면 서버 데이터로 */
export function registerPlayers(players: Player[], cards: CardInst[] = []) {
  for (const p of players) if (!playerMap.has(p.id)) playerMap.set(p.id, p);
  for (const c of cards) if (!cardMap.has(c.id)) cardMap.set(c.id, c);
}
export const cardsOfPlayer = (playerId: string) => CARDS.filter((c) => c.playerId === playerId);
export const myTeam = () => teamById(ME.teamId);

/** 한 번에 쓰는 묶음 */
export const mock = {
  season: SEASON, today: TODAY, me: ME, teams: TEAMS, players: PLAYERS, cards: CARDS, myCardIds: MY_CARD_IDS,
  lineup: LINEUP, lineupEval: LINEUP_EVAL, weather: WEATHER_TODAY, nextGame: NEXT_GAME, lastMatch: LAST_MATCH,
  standings: STANDINGS, userRanking: USER_RANKING, pvp: PVP_OPPONENTS, packs: PACKS, roulette: ROULETTE_EXAMPLE, shop: SCOUT_SHOP, news: NEWS,
  specialNames: SPECIAL_PLAYER_NAMES,
};

export { SPECIAL_PLAYER_NAMES };
