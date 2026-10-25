// 경기 화면 전용 보충 목업 — 공용 LAST_MATCH(부산 4 : 5 대전, 9회말 끝내기)의 '주요 플레이 29개'를
// 한 경기 전체(타석 80개 · 투구 약 300개)로 채운다. 서버·엔진이 붙으면 엔진 테이프(GameRecord)를 이 모양으로 풀어 쓰면 된다.
//
// 공용 목업과 다른 점 (공용 쪽을 맞춰 주면 좋은 것 — 마지막 보고에 적음)
//  · 공용 a22~a29 는 타순이 이어지지 않는다(8회말이 6번에서 끝났는데 9회말이 9번부터). 그래서 이 경기의 타순을
//    정하고, 8회말을 '4번 삼진 → 5번 2루타 → 6번 안타 → 7번 대타 위태건 동점타 → 8번 탁민재 병살'로 이었다.
//    (a22 의 주자 [봉시혁, 구해솔] → [남궁찬, 석윤호], a23 타자 석윤호 → 탁민재)
//  · 공용 line 의 안타·4사구 수(8·9 / 4·5)는 플레이 수와 맞지 않아서, 화면은 아래 플레이에서 다시 센다.
//  · 공용 a28(도루)은 타석이 아니라 a29 타석 첫 공에 붙은 사건으로 다룬다.

import { LAST_MATCH, cardsOfPlayer, playerById, teamById } from '../../game/mock';
import { PITCH_KO } from '../../game/labels';
import { fenceAt, mToField, polarToField } from '../../game/field';
import type { Cause, HalfInning, MatchRecord, PitchType, Play, Player, Pos, Weather } from '../../game/types';

/** 담장 거리를 잴 구장 (지금 경기의 홈) — GAME 보다 먼저 있어야 build() 안에서 쓸 수 있다 */
let fenceHome: string = LAST_MATCH.homeId;

/* ───────── 타입 ───────── */
export type Bases = [string | null, string | null, string | null];
export type PitchRes = 'ball' | 'called' | 'swing' | 'foul' | 'inplay' | 'hbp';
export type HitKind = 'ground' | 'line' | 'fly' | 'pop';

export interface PitchEv {
  /** 타석 안 몇 번째 공 */
  no: number;
  type: PitchType;
  /** '포심' · 'JH 커브' */
  name: string;
  /** 고유 구종이면 그 색 (꼬리·배지) */
  sig?: string;
  kmh: number;
  /** 존 좌표 0~1 (포수 쪽에서 본 모습, x 0 = 3루 쪽) — 스트라이크 존은 ZONE */
  zone: [number, number];
  res: PitchRes;
  /** 이 공 뒤 볼카운트 */
  b: number;
  s: number;
  /** 이 공에 붙은 도루 */
  steal?: { runner: string; from: 1 | 2; to: 2 | 3; ok: boolean };
}

export interface WxState {
  tempC: number;
  windMps: number;
  windTo: Weather['windTo'];
  windKo: string;
  sky: Weather['sky'];
  skyKo: string;
  rainPct: number;
  /** 엔진이 계산한 영향 한 줄 */
  effect: string;
}

export interface GameEvent {
  kind: 'pitching' | 'pinch-hit' | 'weather' | 'note';
  team?: 'away' | 'home';
  /** 짧은 머리말 — '투수 교체' */
  head: string;
  /** '옥태민 → 승지후' */
  text: string;
  outId?: string;
  inId?: string;
  /** 날씨 변화면 바뀐 날씨 번호 */
  wx?: number;
}

/** 수비 범위 원 (요구 30) — 공용 Play.defense 와 같은 모양 */
export type Defense = NonNullable<Play['defense']>;

export interface FullPlay extends Play {
  /** 경기 안 순번 */
  idx: number;
  /** 타석인가 (도루처럼 타석 중간 사건은 false) */
  isPA: boolean;
  /** 타순 1~9 */
  slot: number;
  /** 공 하나하나 */
  seq: PitchEv[];
  basesAfter: Bases;
  /** 이 타석 전에 생긴 일 (교체 · 대타 · 날씨) */
  pre: GameEvent[];
  /** 그때 날씨 번호 */
  wx: number;
  /** 원정 실책으로 나감 등 — 수비 실책을 한 팀 */
  errorBy?: 'away' | 'home';
  /** 반 이닝 키 '5T' */
  half: HalfInning;
  halfKey: string;
  /** 엔진 타석의 첫 투구 번호 · 투구 수 (경기 중 작전을 그 투구부터 — 시즌 경기만) */
  p0?: number;
  np?: number;
  /** 화면용으로 지어낸 공(고의4구 · 공 없이 끝난 타석) */
  fake?: boolean;
}

/** 교체 사건 (엔진 투구 번호 — 그 투구 앞) */
export interface SubEv { pitch: number; kind: 'pitcher' | 'pinchHit' | 'pinchRun' | 'defense'; side: 'away' | 'home'; outId?: string; inId?: string }

export interface LineupSlot { slot: number; pid: string; pos: Pos }

export interface GameSide {
  teamId: string;
  batting: LineupSlot[];
  /** 수비 위치 (투수 제외 — 투수는 플레이의 pitcherId) */
  defense: Record<Exclude<Pos, 'P' | 'DH'>, string>;
  starter: string;
  bench: string[];
  bullpen: string[];
}

export interface FullGame {
  /** 교체 사건 — 시즌 경기만 (엔진 기록) */
  subs?: SubEv[];
  match: MatchRecord;
  away: GameSide;
  home: GameSide;
  plays: FullPlay[];
  wx: WxState[];
  /** 다시 센 줄 점수 */
  line: { away: SideLine; home: SideLine };
  /** 선수 이름표 옆 카드 표시 (선수 id → '’27' · 'FR') — 없으면 그 선수 카드에서 찾는다 */
  tags?: Record<string, string>;
}

export interface SideLine { inn: (number | null)[]; r: number; h: number; e: number; b: number }

/** 존 안 스트라이크 영역 (존 좌표 0~1) */
export const ZONE = { x0: 0.3, x1: 0.7, y0: 0.25, y1: 0.75 };

/* ───────── 시드 난수 ───────── */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rng(seed: string) {
  let a = hash(seed) || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ───────── 이 경기 타순 (6월 13일 · 부산 거인츠 @ 대전 독수리스) ───────── */
const AWAY: GameSide = {
  teamId: 'bs',
  batting: [
    { slot: 1, pid: 'p16', pos: 'CF' }, { slot: 2, pid: 'p15', pos: 'SS' }, { slot: 3, pid: 'p24', pos: '3B' },
    { slot: 4, pid: 'p35', pos: 'LF' }, { slot: 5, pid: 'p19', pos: '1B' }, { slot: 6, pid: 'p38', pos: 'RF' },
    { slot: 7, pid: 'p18', pos: 'C' }, { slot: 8, pid: 'p22', pos: '2B' }, { slot: 9, pid: 'p27', pos: 'DH' },
  ],
  defense: { C: 'p18', '1B': 'p19', '2B': 'p22', '3B': 'p24', SS: 'p15', LF: 'p35', CF: 'p16', RF: 'p38' },
  starter: 'p23',
  bench: ['p25', 'p34'],
  bullpen: ['p36', 'p31', 'p28'],
};
const HOME: GameSide = {
  teamId: 'dj',
  batting: [
    { slot: 1, pid: 'p03', pos: 'CF' }, { slot: 2, pid: 'p06', pos: 'SS' }, { slot: 3, pid: 'p09', pos: 'RF' },
    { slot: 4, pid: 'p04', pos: '3B' }, { slot: 5, pid: 'p05', pos: '1B' }, { slot: 6, pid: 'p13', pos: 'LF' },
    { slot: 7, pid: 'p37', pos: 'DH' }, { slot: 8, pid: 'p07', pos: 'C' }, { slot: 9, pid: 'p08', pos: '2B' },
  ],
  defense: { C: 'p07', '1B': 'p05', '2B': 'p08', '3B': 'p04', SS: 'p06', LF: 'p13', CF: 'p03', RF: 'p09' },
  starter: 'p01',
  bench: ['p14', 'p21', 'p29', 'p30'],
  bullpen: ['p20', 'p12', 'p40', 'p02'],
};

/* ───────── 날씨 흐름 (경기 중 변화 알림) ───────── */
const WX: WxState[] = [
  { tempC: 23, windMps: 4.4, windTo: 'out-lf', windKo: '좌측 담장 쪽', sky: 'night-clear', skyKo: '맑음', rainPct: 0, effect: '좌측 비거리 +5m' },
  { tempC: 22, windMps: 5.6, windTo: 'out-lf', windKo: '좌측 담장 쪽', sky: 'night-clear', skyKo: '맑음', rainPct: 0, effect: '좌측 비거리 +6m' },
  { tempC: 21, windMps: 2.9, windTo: 'cross-r', windKo: '1루 쪽으로', sky: 'night-clear', skyKo: '맑음', rainPct: 10, effect: '바람 영향 거의 없음' },
];

/* ───────── 계획표 — 반 이닝마다 타석 (공용 플레이는 ref 로) ───────── */
export type Code = Play['code'];
interface Filler {
  id: string;
  b: string;
  code: Code;
  text: string;
  n?: string;
  /** 마지막 공 직전 볼카운트 · 이 타석 투구 수 */
  c: [number, number];
  p: number;
  /** 각도(0 중견 · −45 3루 선) · 거리 m · 종류 · 타구 속도 */
  hit?: [number, number, HitKind, number];
  after?: Bases;
  last?: { type: PitchType | 'SIG'; kmh?: number; zone?: [number, number] };
  causes?: Cause[];
  error?: boolean;
}
interface Ref { ref: string; o?: Partial<Play> & { after?: Bases } }
interface HalfPlan { inning: number; half: HalfInning; pitcher: string; pre?: GameEvent[]; pas: (Filler | Ref)[] }

const E: Bases = [null, null, null];

const PLAN: HalfPlan[] = [
  { inning: 1, half: 'top', pitcher: 'p01', pas: [
    { ref: 'a1', o: { after: [null, 'p16', null] } },
    { ref: 'a2', o: { after: [null, null, 'p16'] } },
    { ref: 'a3' }, { ref: 'a4' },
  ] },
  { inning: 1, half: 'bot', pitcher: 'p23', pas: [{ ref: 'a5' }, { ref: 'a6' }, { ref: 'a7' }] },
  { inning: 2, half: 'top', pitcher: 'p01', pas: [
    { id: 'f2t1', b: 'p19', code: 'GO', n: '3-1', text: '국지환, 1루수 앞 땅볼 — 투수가 1루 커버', c: [1, 1], p: 3, hit: [38, 26, 'ground', 118] },
    { id: 'f2t2', b: 'p38', code: '1B', text: '디에고 살바르, 초구를 받아쳐 중전 안타', c: [0, 0], p: 1, hit: [4, 64, 'line', 152], last: { type: 'FF' } },
    { id: 'f2t3', b: 'p18', code: 'FO', n: 'F9', text: '여시헌, 우익수 뜬공', c: [1, 0], p: 2, hit: [27, 84, 'fly', 128] },
    { id: 'f2t4', b: 'p22', code: 'BB', text: '엄주완, 볼넷 — 2사 1·2루', c: [3, 1], p: 5 },
    { id: 'f2t5', b: 'p27', code: 'K', text: '소마루, 헛스윙 삼진 — JH 커브', c: [0, 2], p: 3, last: { type: 'SIG', zone: [0.52, 0.93] } },
  ] },
  { inning: 2, half: 'bot', pitcher: 'p23', pas: [
    { id: 'f2b1', b: 'p04', code: 'GO', n: '5-3', text: '봉시혁, 3루 땅볼', c: [0, 1], p: 2, hit: [-32, 30, 'ground', 131] },
    { id: 'f2b2', b: 'p05', code: 'BB', text: '석윤호, 풀카운트 끝에 볼넷', c: [3, 2], p: 7 },
    { id: 'f2b3', b: 'p13', code: 'FO', n: 'F7', text: '남궁찬, 좌익수 뜬공', c: [1, 0], p: 2, hit: [-30, 80, 'fly', 126] },
    { id: 'f2b4', b: 'p37', code: 'K', text: '빈우석, 헛스윙 삼진 — 고속 슬라이더', c: [2, 2], p: 6, last: { type: 'SIG', zone: [0.8, 0.82] } },
  ] },
  { inning: 3, half: 'top', pitcher: 'p01', pas: [
    { id: 'f3t1', b: 'p16', code: 'K', text: '반태오, 높은 직구에 헛스윙 삼진', c: [1, 2], p: 4, last: { type: 'FF', zone: [0.56, 0.14] } },
    { id: 'f3t2', b: 'p15', code: '1B', text: '선우겸, 좌전 안타', c: [1, 1], p: 3, hit: [-24, 58, 'ground', 140] },
    { id: 'f3t3', b: 'p24', code: 'FC', n: '5-4', text: '설한결, 3루 땅볼 — 1루 주자 2루에서 아웃', c: [0, 1], p: 2, hit: [-30, 32, 'ground', 124], after: ['p24', null, null] },
    { id: 'f3t4', b: 'p35', code: '1B', text: '남궁율, 우전 안타 — 2사 1·2루', c: [1, 1], p: 3, hit: [24, 60, 'line', 146], after: ['p35', 'p24', null] },
    { id: 'f3t5', b: 'p19', code: 'FO', n: 'F8', text: '국지환, 중견수 뜬공', c: [1, 0], p: 2, hit: [-6, 92, 'fly', 133] },
  ] },
  { inning: 3, half: 'bot', pitcher: 'p23', pas: [
    { ref: 'a8' }, { ref: 'a9' },
    { ref: 'a10', o: { after: [null, 'p08', null] } },
    { ref: 'a11' },
    { ref: 'a12', o: { after: [null, 'p09', null] } },
    { ref: 'a13' },
  ] },
  { inning: 4, half: 'top', pitcher: 'p01', pas: [
    { id: 'f4t1', b: 'p38', code: 'K', text: '디에고 살바르, 헛스윙 삼진 — JH 커브', c: [0, 2], p: 3, last: { type: 'SIG', zone: [0.47, 0.9] } },
    { id: 'f4t2', b: 'p18', code: 'E', n: 'E5', text: '여시헌, 3루수 포구 실책으로 출루', c: [1, 0], p: 2, hit: [-36, 28, 'ground', 138], error: true },
    { id: 'f4t3', b: 'p22', code: 'FO', n: 'F7', text: '엄주완, 좌익수 뜬공', c: [0, 1], p: 2, hit: [-28, 78, 'fly', 124] },
    { id: 'f4t4', b: 'p27', code: 'FC', n: '6-4', text: '소마루, 유격수 땅볼 — 1루 주자 2루에서 아웃', c: [1, 1], p: 3, hit: [-10, 37, 'ground', 129], after: ['p27', null, null] },
  ] },
  { inning: 4, half: 'bot', pitcher: 'p23', pas: [
    { id: 'f4b1', b: 'p05', code: 'GO', n: '3-1', text: '석윤호, 1루수 앞 땅볼', c: [1, 1], p: 3, hit: [36, 27, 'ground', 120] },
    { id: 'f4b2', b: 'p13', code: 'K', text: '남궁찬, 바깥쪽 꽉 찬 직구에 루킹 삼진', c: [2, 2], p: 6, last: { type: 'FF', zone: [0.71, 0.5] } },
    { id: 'f4b3', b: 'p37', code: '1B', text: '빈우석, 우전 안타', c: [0, 1], p: 2, hit: [30, 60, 'ground', 142] },
    { id: 'f4b4', b: 'p07', code: 'FO', n: 'F8', text: '탁민재, 중견수 뜬공', c: [1, 2], p: 5, hit: [6, 90, 'fly', 130] },
  ] },
  { inning: 5, half: 'top', pitcher: 'p01',
    pre: [{ kind: 'weather', head: '날씨 변화', text: '바람이 세졌어요 — 좌측으로 5.6m/s · 좌측 비거리 +6m', wx: 1 }],
    pas: [
      { ref: 'a14' }, { ref: 'a15' }, { ref: 'a16' }, { ref: 'a17' }, { ref: 'a18' }, { ref: 'a19' },
    ] },
  { inning: 5, half: 'bot', pitcher: 'p23', pas: [
    { id: 'f5b1', b: 'p08', code: 'GO', n: '4-3', text: '진서율, 2루 땅볼', c: [1, 0], p: 2, hit: [18, 33, 'ground', 116] },
    { id: 'f5b2', b: 'p03', code: 'FO', n: 'F7', text: '연이준, 좌익수 뜬공', c: [2, 1], p: 4, hit: [-22, 84, 'fly', 131] },
    { id: 'f5b3', b: 'p06', code: 'K', text: '표건우, 헛스윙 삼진 — 고속 슬라이더', c: [1, 2], p: 4, last: { type: 'SIG', zone: [0.79, 0.8] } },
  ] },
  { inning: 6, half: 'top', pitcher: 'p01', pas: [
    { id: 'f6t1', b: 'p18', code: 'FO', n: 'F8', text: '여시헌, 초구 중견수 뜬공', c: [0, 0], p: 1, hit: [8, 94, 'fly', 134] },
    { id: 'f6t2', b: 'p22', code: '1B', text: '엄주완, 중전 안타', c: [1, 1], p: 3, hit: [-3, 62, 'ground', 137] },
    { id: 'f6t3', b: 'p27', code: 'K', text: '소마루, 헛스윙 삼진 — JH 커브', c: [1, 2], p: 4, last: { type: 'SIG', zone: [0.44, 0.91] } },
    { id: 'f6t4', b: 'p16', code: 'GO', n: '4-3', text: '반태오, 2루 땅볼', c: [0, 1], p: 2, hit: [16, 34, 'ground', 119] },
  ] },
  { inning: 6, half: 'bot', pitcher: 'p23', pas: [
    { id: 'f6b1', b: 'p09', code: 'GO', n: '6-3', text: '구해솔, 유격수 땅볼', c: [1, 1], p: 3, hit: [-12, 36, 'ground', 127] },
    { ref: 'a20' },
    { id: 'f6b2', b: 'p05', code: '1B', text: '석윤호, 우전 안타', c: [1, 1], p: 3, hit: [32, 58, 'line', 147] },
    { id: 'f6b3', b: 'p13', code: 'FO', n: 'F8', text: '남궁찬, 중견수 뜬공', c: [2, 2], p: 6, hit: [-8, 96, 'fly', 137] },
    { id: 'f6b4', b: 'p37', code: 'GO', n: '4-3', text: '빈우석, 2루 땅볼', c: [0, 2], p: 4, hit: [20, 31, 'ground', 114] },
  ] },
  { inning: 7, half: 'top', pitcher: 'p01',
    pre: [{ kind: 'note', head: '투구 수', text: '제갈현 투구 수 90 — 공이 높게 뜨기 시작' }],
    pas: [
      { id: 'f7t1', b: 'p15', code: 'FO', n: 'F9', text: '선우겸, 우익수 뜬공', c: [1, 1], p: 3, hit: [30, 86, 'fly', 132] },
      { id: 'f7t2', b: 'p24', code: 'K', text: '설한결, 몸쪽 직구에 루킹 삼진', c: [1, 2], p: 4, last: { type: 'FF', zone: [0.31, 0.46] } },
      { id: 'f7t3', b: 'p35', code: 'BB', text: '남궁율, 끈질긴 승부 끝에 볼넷', c: [3, 2], p: 6 },
      { id: 'f7t4', b: 'p19', code: '1B', text: '국지환, 초구 우전 안타 — 2사 1·2루', c: [0, 0], p: 1, hit: [28, 56, 'ground', 141], after: ['p19', 'p35', null], last: { type: 'FF' } },
      { ref: 'a21' },
    ] },
  { inning: 7, half: 'bot', pitcher: 'p36',
    pre: [{ kind: 'pitching', team: 'away', head: '투수 교체', text: '옥태민 → 승지후', outId: 'p23', inId: 'p36' }],
    pas: [
      { id: 'f7b1', b: 'p07', code: 'K', text: '탁민재, 헛스윙 삼진', c: [0, 2], p: 4, last: { type: 'SL', zone: [0.82, 0.8] } },
      { id: 'f7b2', b: 'p08', code: '1B', n: '번트', text: '진서율, 3루 쪽 기습 번트 안타!', c: [0, 0], p: 1, hit: [-38, 14, 'ground', 46], causes: [{ factor: 'hidden', text: '기습 번트 특성 — 3루수 깊은 수비 봄' }] },
      { id: 'f7b3', b: 'p03', code: 'FO', n: 'F8', text: '연이준, 중견수 뜬공', c: [1, 1], p: 3, hit: [2, 95, 'fly', 138] },
      { id: 'f7b4', b: 'p06', code: 'BB', text: '표건우, 볼넷 — 2사 1·2루', c: [3, 1], p: 5 },
      { id: 'f7b5', b: 'p09', code: 'FC', n: '5-4', text: '구해솔, 3루 땅볼 — 1루 주자 2루에서 아웃', c: [1, 2], p: 4, hit: [-34, 31, 'ground', 133], after: ['p09', null, 'p08'] },
    ] },
  { inning: 8, half: 'top', pitcher: 'p20',
    pre: [
      { kind: 'pitching', team: 'home', head: '투수 교체', text: '제갈현 → 기우람', outId: 'p01', inId: 'p20' },
      { kind: 'weather', head: '날씨 변화', text: '기온 21° · 바람이 1루 쪽으로 바뀌었어요 — 비거리 영향 거의 없음', wx: 2 },
    ],
    pas: [
      { id: 'f8t1', b: 'p18', code: 'GO', n: '6-3', text: '여시헌, 유격수 땅볼 — 뱀직구', c: [0, 1], p: 2, hit: [-14, 38, 'ground', 126], last: { type: 'SIG', zone: [0.38, 0.7] } },
      { id: 'f8t2', b: 'p22', code: '1B', text: '엄주완, 좌전 안타', c: [1, 1], p: 3, hit: [-26, 57, 'line', 144] },
      { id: 'f8t3', b: 'p27', code: 'K', text: '소마루, 헛스윙 삼진 — 뱀직구', c: [1, 2], p: 4, last: { type: 'SIG', zone: [0.27, 0.62] }, causes: [{ factor: 'signature', text: '뱀직구 — 같은 손 타자에게 바깥으로 도망가는 공' }] },
      { id: 'f8t4', b: 'p16', code: 'BB', text: '반태오, 볼넷 — 2사 1·2루', c: [3, 0], p: 4 },
      { id: 'f8t5', b: 'p15', code: 'FO', n: 'F8', text: '선우겸, 중견수 뜬공', c: [2, 2], p: 6, hit: [-4, 99, 'fly', 140] },
    ] },
  { inning: 8, half: 'bot', pitcher: 'p31',
    pre: [{ kind: 'pitching', team: 'away', head: '투수 교체', text: '승지후 → 금시온 (좌완)', outId: 'p36', inId: 'p31' }],
    pas: [
      { id: 'f8b1', b: 'p04', code: 'K', text: '봉시혁, 루킹 삼진 — 백도어 슬라이더', c: [1, 2], p: 4, last: { type: 'SIG', zone: [0.69, 0.58] } },
      { id: 'f8b2', b: 'p05', code: '2B', text: '석윤호, 우중간 2루타', c: [2, 1], p: 4, hit: [18, 98, 'line', 158], after: [null, 'p05', null] },
      { id: 'f8b3', b: 'p13', code: '1B', text: '남궁찬, 좌전 안타 — 1사 1·3루', c: [0, 1], p: 2, hit: [-30, 54, 'ground', 139], after: ['p13', null, 'p05'] },
      { ref: 'a22', o: { basesBefore: ['p13', null, 'p05'], after: ['p14', 'p13', null] } },
      { ref: 'a23', o: { batterId: 'p07', text: '탁민재, 1루수 앞 병살', basesBefore: ['p14', 'p13', null] } },
    ] },
  { inning: 9, half: 'top', pitcher: 'p02',
    pre: [{ kind: 'pitching', team: 'home', head: '투수 교체', text: '기우람 → 은도빈 (마무리)', outId: 'p20', inId: 'p02' }],
    pas: [
      { id: 'f9t1', b: 'p24', code: '1B', text: '설한결, 좌전 안타', c: [1, 1], p: 3, hit: [-20, 60, 'line', 149] },
      { id: 'f9t2', b: 'p35', code: 'BB', text: '남궁율, 볼넷 — 무사 1·2루', c: [3, 1], p: 5, after: ['p35', 'p24', null] },
      { ref: 'a24', o: { after: ['p19', 'p35', 'p24'] } },
      { ref: 'a25' },
      { ref: 'a26' },
    ] },
  { inning: 9, half: 'bot', pitcher: 'p28',
    pre: [{ kind: 'pitching', team: 'away', head: '투수 교체', text: '금시온 → 어진석 (마무리)', outId: 'p31', inId: 'p28' }],
    pas: [
      { ref: 'a27' },
      { ref: 'a28', o: { after: [null, 'p08', null] } },
      { ref: 'a29', o: { after: ['p03', null, null] } },
    ] },
];

/** 8회말 대타 — a22 바로 앞 */
const PINCH: Record<string, GameEvent> = {
  a22: { kind: 'pinch-hit', team: 'home', head: '대타', text: '빈우석 → 위태건 (좌완 상대 우타자)', outId: 'p37', inId: 'p14' },
};

/* ───────── 주자 규칙 (after 를 안 적은 타석) ───────── */
export function defaultAfter(code: Code, before: Bases, batter: string): { after: Bases; runs: number; outs: number } {
  const [r1, r2, r3] = before;
  switch (code) {
    case 'K': case 'FO': case 'LO': return { after: before, runs: 0, outs: 1 };
    case 'GO': return { after: [null, r1 ?? null, r2 ?? r3 ?? null], runs: r3 && r2 ? 1 : 0, outs: 1 };
    case 'SF': return { after: [r1, r2, null], runs: r3 ? 1 : 0, outs: 1 };
    case 'BB': case 'HBP': {
      if (!r1) return { after: [batter, r2, r3], runs: 0, outs: 0 };
      if (!r2) return { after: [batter, r1, r3], runs: 0, outs: 0 };
      if (!r3) return { after: [batter, r1, r2], runs: 0, outs: 0 };
      return { after: [batter, r1, r2], runs: 1, outs: 0 };
    }
    case '1B': case 'E': return { after: [batter, r1, r2], runs: r3 ? 1 : 0, outs: 0 };
    case '2B': return { after: [null, batter, r1], runs: (r2 ? 1 : 0) + (r3 ? 1 : 0), outs: 0 };
    case '3B': return { after: [null, null, batter], runs: [r1, r2, r3].filter(Boolean).length, outs: 0 };
    case 'HR': return { after: E, runs: 1 + [r1, r2, r3].filter(Boolean).length, outs: 0 };
    case 'DP': return { after: [null, null, r3 && !r1 ? r3 : null], runs: 0, outs: 2 };
    case 'FC': return { after: [batter, r2, r3], runs: 0, outs: 1 };
    case 'SB': return { after: [null, r1, r2], runs: 0, outs: 0 };
    default: return { after: before, runs: 0, outs: 0 };
  }
}

/* ───────── 투구 ───────── */
export const HIT_CODES: Code[] = ['1B', '2B', '3B', 'HR'];
const IN_PLAY: Code[] = ['1B', '2B', '3B', 'HR', 'GO', 'FO', 'LO', 'DP', 'SF', 'SAC', 'E', 'FC'];

export interface Arsenal { type: PitchType; name: string; kmh: number; usage: number; sig?: string }

export function arsenalOf(p: Player): Arsenal[] {
  const sig = cardsOfPlayer(p.id).map((c) => c.signaturePitch).find(Boolean);
  return (p.pitches ?? [{ type: 'FF' as PitchType, ko: '포심', stuff: 50, command: 50, usage: 1, kmh: 140 }]).map((x) => ({
    type: x.type,
    name: sig && sig.base === x.type ? sig.name : PITCH_KO[x.type],
    kmh: x.kmh,
    usage: x.usage,
    sig: sig && sig.base === x.type ? sig.color : undefined,
  }));
}

const BREAKING: PitchType[] = ['SL', 'SW', 'CU', 'CH', 'FS', 'KN'];

/** 마지막 공 (위치는 없어도 됨 — 없으면 결과에 맞게 고른다) */
export interface LastIn { type: PitchType | 'SIG'; name: string; kmh: number; zone?: [number, number] }
export const lastOf = (seq: PitchEv[]): Play['lastPitch'] => {
  const l = seq[seq.length - 1];
  return l ? { type: l.sig ? 'SIG' : l.type, name: l.name, kmh: l.kmh, zone: l.zone } : undefined;
};

export function pickPitch(ars: Arsenal[], rnd: () => number, prefer?: 'break' | 'fast'): Arsenal {
  let list = ars;
  if (prefer === 'break') { const b = ars.filter((a) => BREAKING.includes(a.type)); if (b.length) list = b; }
  if (prefer === 'fast') { const f = ars.filter((a) => !BREAKING.includes(a.type)); if (f.length) list = f; }
  const tot = list.reduce((s, a) => s + a.usage, 0);
  let x = rnd() * tot;
  for (const a of list) { x -= a.usage; if (x <= 0) return a; }
  return list[list.length - 1];
}

/** 결과별 투구 위치 */
function locate(res: PitchRes, rnd: () => number, bats: 'R' | 'L', type: PitchType): [number, number] {
  const { x0, x1, y0, y1 } = ZONE;
  const brk = BREAKING.includes(type);
  const inZone = (): [number, number] => [x0 + 0.04 + rnd() * (x1 - x0 - 0.08), y0 + 0.05 + rnd() * (y1 - y0 - 0.1)];
  const edge = (): [number, number] => {
    const side = Math.floor(rnd() * 4);
    if (side === 0) return [x0 + rnd() * 0.06, y0 + rnd() * (y1 - y0)];
    if (side === 1) return [x1 - rnd() * 0.06, y0 + rnd() * (y1 - y0)];
    if (side === 2) return [x0 + rnd() * (x1 - x0), y0 + rnd() * 0.07];
    return [x0 + rnd() * (x1 - x0), y1 - rnd() * 0.07];
  };
  switch (res) {
    case 'ball': {
      const r = rnd();
      if (brk && r < 0.55) return [0.34 + rnd() * 0.36, y1 + 0.06 + rnd() * 0.14];          // 바닥으로
      if (r < 0.72) return [rnd() < 0.5 ? x0 - 0.05 - rnd() * 0.12 : x1 + 0.05 + rnd() * 0.12, 0.3 + rnd() * 0.45];
      return [0.36 + rnd() * 0.3, y0 - 0.06 - rnd() * 0.1];                                     // 높게
    }
    case 'called': return edge();
    case 'swing': return brk ? [0.36 + rnd() * 0.36, y1 + 0.02 + rnd() * 0.16] : [0.4 + rnd() * 0.22, y0 - 0.04 + rnd() * 0.16];
    case 'foul': return rnd() < 0.6 ? edge() : inZone();
    case 'hbp': return [bats === 'R' ? 0.04 + rnd() * 0.06 : 0.9 + rnd() * 0.06, 0.38 + rnd() * 0.3];
    default: return inZone();
  }
}

export function genSeq(
  pl: { id: string; code: Code; count: { b: number; s: number }; pitches: number; text: string; lastPitch?: LastIn },
  pitcher: Player, batter: Player, startNo: number, start: [number, number], late: number,
): PitchEv[] {
  const rnd = rng('seq:' + pl.id);
  const ars = arsenalOf(pitcher);
  const bats: 'R' | 'L' = batter.bats === 'S' ? (pitcher.throws === 'R' ? 'L' : 'R') : batter.bats;
  const mine = pl.pitches - (startNo - 1);
  // 공용 목업의 볼카운트는 '마지막 공 직전'인데 볼넷만 4볼(뒤)로 적혀 있다 — 맞춰 읽는다
  let cb = Math.min(3, pl.count.b);
  const cs = Math.min(2, pl.count.s);
  if (pl.code === 'SB' && pl.count.b > start[0]) cb = pl.count.b - 1;
  const balls = Math.max(0, cb - start[0]);
  const strikes = Math.max(0, cs - start[1]);
  let extra = mine - 1 - balls - strikes;
  if (extra < 0) extra = 0;
  if (cs < 2) extra = 0;

  // 볼·스트라이크 순서 (시드 섞기) — 2스트라이크 뒤에 파울 extra 개
  const toks: ('B' | 'S')[] = [...Array(balls).fill('B'), ...Array(strikes).fill('S')];
  for (let i = toks.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [toks[i], toks[j]] = [toks[j], toks[i]]; }
  const seq: PitchEv[] = [];
  let b = start[0], s = start[1], no = startNo;
  const fade = (k: number) => Math.round(k - late * (0.6 + rnd() * 0.8));

  const push = (res: PitchRes, a: Arsenal, zone?: [number, number], kmh?: number) => {
    if (res === 'ball') b++;
    else if (res === 'called' || res === 'swing') s++;
    else if (res === 'foul' && s < 2) s++;
    seq.push({
      no: no++, type: a.type, name: a.name, sig: a.sig,
      kmh: kmh ?? fade(a.kmh + (rnd() - 0.5) * 3),
      zone: zone ?? locate(res, rnd, bats, a.type), res, b, s,
    });
  };
  const strikeRes = (): PitchRes => { const r = rnd(); return r < 0.38 ? 'called' : r < 0.68 ? 'swing' : 'foul'; };

  toks.forEach((t) => {
    if (t === 'B') push('ball', pickPitch(ars, rnd));
    else push(strikeRes(), pickPitch(ars, rnd, s === 1 ? 'break' : undefined));
    if (s === 2 && extra > 0 && t === 'S') {
      while (extra > 0) { push('foul', pickPitch(ars, rnd)); extra--; }
    }
  });
  while (extra > 0) { push('foul', pickPitch(ars, rnd)); extra--; }

  // 마지막 공
  const lp = pl.lastPitch;
  const lastRes: PitchRes =
    pl.code === 'K' ? (/루킹/.test(pl.text) ? 'called' : 'swing')
      : pl.code === 'BB' || pl.code === 'SB' ? 'ball'
        : pl.code === 'HBP' ? 'hbp'
          : 'inplay';
  let a: Arsenal;
  if (lp) {
    a = lp.type === 'SIG' ? ars.find((x) => x.sig) ?? pickPitch(ars, rnd) : ars.find((x) => x.type === lp.type) ?? { type: lp.type, name: PITCH_KO[lp.type], kmh: lp.kmh, usage: 1 };
    a = { ...a, name: lp.name || a.name };
  } else {
    a = pickPitch(ars, rnd, lastRes === 'swing' ? 'break' : undefined);
  }
  push(lastRes, a, lp?.zone ?? undefined, lp?.kmh);
  return seq;
}

/* ───────── 수비 범위 원 만들기 (뜬공·직선타) ───────── */
/** 체공 시간(초) — 거리와 타구 속도로 */
export function hangOf(h: { kind: HitKind; distM: number; kmh: number }) {
  if (h.kind === 'pop') return 4.4;
  if (h.kind === 'fly') return r3(1.2 + (h.distM / 30) * (140 / Math.max(90, h.kmh)));
  if (h.kind === 'line') return r3(0.5 + h.distM / ((h.kmh / 3.6) * 0.8));
  return r3(h.distM / ((h.kmh / 3.6) * 0.55));
}
const DEF_SPOT_M: Record<Exclude<Pos, 'DH'>, [number, number]> = {
  P: [0, 18.4], C: [0, -1.2], '1B': [21, 25], '2B': [14, 38], SS: [-13.5, 38], '3B': [-21, 24],
  LF: [-50, 74], CF: [-2, 98], RF: [48, 72],
};
export const defaultSpot = (pos: Exclude<Pos, 'DH'>) => mToField(DEF_SPOT_M[pos][0], DEF_SPOT_M[pos][1]);

function mpsOf(p: Player | undefined) {
  const a = p?.attrs ?? {};
  return r3(6.4 + (((a.range ?? 60) + (a.speed ?? 60) + (a.firstStep ?? 60)) / 3 - 50) * 0.062);
}
function reactOf(p: Player | undefined, rnd: () => number) {
  const fs = p?.attrs.firstStep ?? 60;
  return r3(clamp(0.62 - (fs - 50) * 0.006 + (rnd() - 0.5) * 0.06, 0.22, 0.7));
}

export function makeDefense(play: { id: string; code: Code; notation?: string; hit: NonNullable<Play['hit']> }, def: GameSide['defense'], pitcherId: string): Defense | undefined {
  if (play.hit.kind === 'ground') return undefined;
  const rnd = rng('def:' + play.id);
  const L = play.hit;
  const lm = { x: (L.x - 0.5) * 140, y: (1 - L.y) * 140 };
  const posList: Exclude<Pos, 'DH' | 'C'>[] = ['P', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
  const all = posList.map((pos) => {
    const pid = pos === 'P' ? pitcherId : def[pos];
    const pl = playerById(pid);
    const [sx, sy] = DEF_SPOT_M[pos];
    const d = Math.hypot(lm.x - sx, lm.y - sy);
    const mps = mpsOf(pl);
    const reactS = reactOf(pl, rnd);
    return { pos, playerId: pid, from: mToField(sx, sy), reactS, mps, need: reactS + d / mps, d };
  });
  const isOut = ['FO', 'LO', 'SF'].includes(play.code);
  const catcherPos = isOut ? (Number(play.notation?.replace(/\D/g, '')) || 8) : 0;
  const NUM: Record<number, Exclude<Pos, 'DH'>> = { 1: 'P', 2: 'C', 3: '1B', 4: '2B', 5: '3B', 6: 'SS', 7: 'LF', 8: 'CF', 9: 'RF' };
  let hang = hangOf(L);
  const minNeed = Math.min(...all.map((f) => f.need));
  const wall = L.distM >= fenceOf(L.angle) - 1.5;
  if (isOut) {
    const c = all.find((f) => f.pos === NUM[catcherPos]);
    if (c && c.need > hang - 0.15) hang = r3(c.need + 0.2 + rnd() * 0.3);
  } else if (!wall && minNeed < hang + 0.15) {
    hang = r3(Math.max(0.9, minNeed - 0.25 - rnd() * 0.2));
  }
  const catcher = isOut ? all.find((f) => f.pos === NUM[catcherPos]) : undefined;
  const margin = catcher ? hang - catcher.need : -1;
  const catchProb = catcher ? r3(clamp(0.55 + margin * 0.35, 0.4, 0.99)) : r3(clamp(0.2 + (hang - minNeed) * 0.3, 0.02, 0.3));
  const fielders = all
    .map(({ need, d, ...f }) => ({ ...f, arriveS: catcher && f.pos === catcher.pos ? r3(Math.min(hang, need)) : undefined, _d: d }))
    .sort((a, b) => a._d - b._d)
    .map(({ _d, ...f }) => f);
  return { hangS: r3(hang), catchProb, fielders };
}

/* ───────── 승리 확률 — 고정 플레이 사이를 매끄럽게 잇는다 ───────── */
export function bridgeWp(segment: { good: boolean; top: boolean; lev: number }[], from: number, to: number): [number, number][] {
  if (!segment.length) return [];
  const raw = segment.map((e) => {
    const toBat = e.good ? 0.022 * e.lev : -0.011 * e.lev;
    return e.top ? -toBat : toBat;           // 홈 기준
  });
  const sum = raw.reduce((a, b) => a + b, 0);
  const fix = (to - from - sum) / raw.length;
  const out: [number, number][] = [];
  let w = from;
  raw.forEach((d) => {
    const nw = r3(clamp(w + d + fix, 0.03, 0.97));
    out.push([r3(w), nw]);
    w = nw;
  });
  out[out.length - 1][1] = to;
  return out;
}

/* ───────── 조립 ───────── */
function build(): FullGame {
  const m = LAST_MATCH;
  const byId = new Map(m.plays.map((p) => [p.id, p]));
  const plays: FullPlay[] = [];
  const score: [number, number] = [0, 0];
  const slotPtr = { top: 0, bot: 0 };
  const sideOf = (half: HalfInning) => (half === 'top' ? AWAY : HOME);
  const pitchCount = new Map<string, number>();
  let wxIdx = 0;
  const subs = new Map<number, string>(); // 홈 대타가 들어선 타순 → 선수

  // 1단계: 상태를 따라가며 플레이 만들기 (승리 확률은 나중에)
  for (const h of PLAN) {
    const side = sideOf(h.half);
    const fieldSide = h.half === 'top' ? HOME : AWAY;
    let outs = 0;
    let bases: Bases = [...E];
    let firstPre = true;
    let pendingCount: [number, number] | null = null;
    let pendingNo = 1;

    for (const item of h.pas) {
      const pre: GameEvent[] = [];
      if (firstPre) {
        pre.push(...(h.pre ?? []));
        firstPre = false;
      }
      pre.forEach((e) => { if (e.wx != null) wxIdx = e.wx; });
      const isRef = 'ref' in item;
      const base = isRef ? byId.get(item.ref)! : undefined;
      if (isRef && !base) throw new Error('없는 플레이 ' + item.ref);
      const id = isRef ? item.ref : item.id;
      if (PINCH[id]) pre.push(PINCH[id]);
      if (PINCH[id]?.inId) {
        const slot = HOME.batting.find((x) => x.pid === PINCH[id].outId)!.slot;
        subs.set(slot, PINCH[id].inId!);
      }

      const code: Code = isRef ? base!.code : item.code;
      const isPA = code !== 'SB' && code !== 'CS';
      const slotIdx = slotPtr[h.half] % 9;
      const lineupSlot = side.batting[slotIdx];
      const ovBatter = isRef ? item.o?.batterId : undefined;
      const batterId = ovBatter ?? (isRef ? base!.batterId : item.b);
      const expected = h.half === 'bot' && subs.has(lineupSlot.slot) ? subs.get(lineupSlot.slot)! : lineupSlot.pid;
      if (import.meta.env.DEV && isPA && batterId !== expected) console.warn('[경기 목업] 타순 어긋남', id, batterId, '≠', expected);

      const basesBefore: Bases = isRef && item.o?.basesBefore ? (item.o.basesBefore as Bases) : [...bases] as Bases;
      if (import.meta.env.DEV && isRef && base!.outsBefore !== outs) console.warn('[경기 목업] 아웃 어긋남', id, base!.outsBefore, outs);

      const spec = isRef ? undefined : (item as Filler);
      const rule = defaultAfter(code, basesBefore, batterId);
      const after: Bases = (isRef ? item.o?.after : spec!.after) ?? rule.after;
      let runs: number;
      let outsAfter: number;
      if (isRef) {
        const sc = base!.score;
        const prevRuns = h.half === 'top' ? score[0] : score[1];
        runs = (h.half === 'top' ? sc[0] : sc[1]) - prevRuns;
        outsAfter = base!.outsAfter;
      } else {
        // 사라진 주자 = 득점 또는 아웃
        const gone = [...basesBefore.filter(Boolean), batterId].filter((r) => !after.includes(r)).length;
        outsAfter = outs + rule.outs;
        runs = code === 'HR' ? gone : Math.max(0, gone - rule.outs);
      }
      if (h.half === 'top') score[0] += runs; else score[1] += runs;

      const pitcherId = isRef ? base!.pitcherId : h.pitcher;
      const pitcher = playerById(pitcherId)!;
      const batter = playerById(batterId)!;

      let hit = isRef ? base!.hit : undefined;
      if (!isRef && spec!.hit) {
        const [ang, dist, kind, kmh] = spec!.hit;
        const p = polarToField(ang, dist);
        hit = { x: r3(p.x), y: r3(p.y), kind, kmh, distM: dist, angle: ang };
      }

      const count = isRef ? base!.count : { b: spec!.c[0], s: spec!.c[1] };
      const pitches = isRef ? base!.pitches : spec!.p;
      let lastPitch: LastIn | undefined = isRef ? base!.lastPitch : undefined;
      if (!isRef && spec!.last) {
        const ars = arsenalOf(pitcher);
        const l = spec!.last;
        const a = l.type === 'SIG' ? ars.find((x) => x.sig) : ars.find((x) => x.type === l.type);
        if (a) lastPitch = { type: l.type, name: a.name, kmh: l.kmh ?? a.kmh, zone: l.zone };
      }

      const startCount: [number, number] = pendingCount ?? [0, 0];
      const startNo = pendingNo;
      const before = pitchCount.get(pitcherId) ?? 0;
      const late = Math.max(0, (before - 70) / 30);
      const text = isRef ? (item.o?.text ?? base!.text) : spec!.text;
      const seq = genSeq({ id, code, count, pitches, text, lastPitch }, pitcher, batter, startNo, startCount, late);
      // 공 수 세기
      pitchCount.set(pitcherId, before + seq.length);
      if (code === 'SB') {
        const last = seq[seq.length - 1];
        last.steal = { runner: basesBefore[0]!, from: 1, to: 2, ok: true };
        pendingCount = [last.b, last.s];
        pendingNo = last.no + 1;
      } else {
        pendingCount = null;
        pendingNo = 1;
      }

      const notation = isRef ? base!.notation : spec!.n;
      let defense = isRef ? base!.defense : undefined;
      if (!defense && hit && ['FO', 'LO', 'SF', '1B', '2B', '3B'].includes(code) && hit.kind !== 'ground') {
        defense = makeDefense({ id, code, notation, hit }, fieldSide.defense, pitcherId);
      }

      const play: FullPlay = {
        ...(base ?? ({} as Play)),
        id, idx: plays.length, isPA, slot: lineupSlot.slot,
        inning: h.inning, half: h.half, halfKey: `${h.inning}${h.half === 'top' ? 'T' : 'B'}`,
        outsBefore: outs as 0 | 1 | 2, basesBefore, batterId, pitcherId,
        count, pitches, code, text, notation,
        rbi: isRef ? base!.rbi : (code === 'E' || code === 'DP' ? 0 : runs),
        score: [score[0], score[1]], outsAfter,
        hit, lastPitch: lastOf(seq),
        causes: isRef ? base!.causes : spec!.causes,
        defense,
        wp: isRef ? base!.wp : [0.5, 0.5],
        highlight: base?.highlight,
        seq, basesAfter: after, pre, wx: wxIdx,
        errorBy: spec?.error ? (h.half === 'top' ? 'home' : 'away') : undefined,
      };
      plays.push(play);

      outs = outsAfter;
      bases = after;
      if (isPA) slotPtr[h.half] += 1;
    }
    if (import.meta.env.DEV && outs !== 3 && !(h.inning === 9 && h.half === 'bot')) console.warn('[경기 목업] 아웃 수', h.inning, h.half, outs);
  }

  // 2단계: 승리 확률 — 공용 플레이 값은 그대로, 사이는 다리 놓기
  let lastWp = m.plays[0].wp[0];
  let run: FullPlay[] = [];
  const flush = (to: number) => {
    const seg = run.map((p) => ({
      good: HIT_CODES.includes(p.code) || ['BB', 'HBP', 'E'].includes(p.code),
      top: p.half === 'top',
      lev: 0.8 + p.inning * 0.08 + (p.basesBefore.filter(Boolean).length * 0.15),
    }));
    bridgeWp(seg, lastWp, to).forEach((w, i) => { run[i].wp = w; });
    run = [];
  };
  for (const p of plays) {
    if (byId.has(p.id)) {
      flush(p.wp[0]);
      lastWp = p.wp[1];
    } else run.push(p);
  }
  flush(lastWp);

  // 3단계: 줄 점수 다시 세기
  const line = {
    away: { inn: Array(9).fill(null) as (number | null)[], r: 0, h: 0, e: 0, b: 0 },
    home: { inn: Array(9).fill(null) as (number | null)[], r: 0, h: 0, e: 0, b: 0 },
  };
  let prev: [number, number] = [0, 0];
  for (const p of plays) {
    const bat = p.half === 'top' ? line.away : line.home;
    const fld = p.half === 'top' ? line.home : line.away;
    const i = p.inning - 1;
    const runs = p.half === 'top' ? p.score[0] - prev[0] : p.score[1] - prev[1];
    bat.inn[i] = (bat.inn[i] ?? 0) + runs;
    bat.r += runs;
    if (HIT_CODES.includes(p.code)) bat.h += 1;
    if (p.code === 'BB' || p.code === 'HBP') bat.b += 1;
    if (p.code === 'E') fld.e += 1;
    prev = p.score;
  }
  if (import.meta.env.DEV) {
    const want = m.line;
    line.away.inn.forEach((v, i) => { if (v !== want.away.innings[i]) console.warn('[경기 목업] 원정 점수', i + 1, v, want.away.innings[i]); });
    line.home.inn.forEach((v, i) => { if (v !== want.home.innings[i]) console.warn('[경기 목업] 홈 점수', i + 1, v, want.home.innings[i]); });
  }

  return { match: m, away: AWAY, home: HOME, plays, wx: WX, line };
}

/** 지금 화면에 띄운 경기 — 처음엔 공용 목업 '어제 경기'. 시즌 경기 · 대전 경기는 setGame 으로 바꿔 끼운다 (timeline 은 active.ts 가 다시 계산) */
export let GAME: FullGame = build();
/** 공용 목업 '어제 경기' (바꿔 끼우기 전 원래 경기) */
export const LAST_GAME: FullGame = GAME;
export function setGame(g: FullGame) { GAME = g; fenceHome = g.match.homeId; }

/* ───────── 쓰기 편한 도우미 ───────── */
export const awayTeam = () => teamById(GAME.match.awayId);
export const homeTeam = () => teamById(GAME.match.homeId);
export const IN_PLAY_CODES = IN_PLAY;
export const HIT_CODE_LIST = HIT_CODES;
/** 담장까지 거리 (이 경기 구장) */
export function fenceOf(angle: number) { return fenceAt(teamById(fenceHome).stadium.fence, angle); }
