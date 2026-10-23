// 언론 바탕 — AI 뉴스(스포츠 기사 + 독자 댓글) · 감독 인터뷰의 저장 · 서버 호출 · 특이사항 판정 · 인터뷰 효과.
// Claude(서버 POST /ai/news · /ai/interview — Haiku 5.5)는 시즌마다 몇 번만 부른다 (사용자 지시):
//   · 개막 특집 — 내 첫 정규 시즌 경기 전: 뉴스 1번 + 개막 미디어데이 인터뷰 1번 (효과: 내 첫 3경기)
//   · 시즌 결산 — 정규 시즌이 끝나면: 뉴스 1번 + 인터뷰 1번 (가을야구 진출이면 효과: 내 포스트시즌 첫 3경기, 아니면 효과 없음)
//   · 특이사항 뉴스 — 직접 치른 날(빨리 감기로 넘긴 날 빼고)의 큰일. 큰 사건은 늘, 보통 사건은 반반(시드로 정해 다시 열어도 같음).
//     5경기일 간격 · 시즌 15번까지(포스트시즌은 따로 4번). 같은 사건은 한 번만. 뉴스 화면이 보일 때 하나씩 만든다.
//   그 밖의 날마다 뉴스는 기기 안 템플릿(screens/press/local)이 경기 자료로 쓴다 — 돈이 안 든다.
//   AI 를 못 쓰면(로그인 안 함 · 한도 · 예산 · 연결 · 형식 오류) 같은 자리의 템플릿 글로 — 화면에 오류를 띄우지 않는다.
// Claude 는 글만 쓴다. 경기 결과 · 숫자 · 인터뷰 효과(능력치)는 모두 코드가 정한다.
// 저장: 'bb.press.v1' (AI 글 · 인터뷰 · 특이사항 기록 · 시도 횟수) · 'bb.press.fast.v1' (빨리 감기로 넘긴 날)
// 이 파일은 season/run · season/rosters 를 가져오지 않는다 (rosters 가 이 파일의 interviewFx 를 쓴다 — 고리 막기).
import { useSyncExternalStore } from 'react';
import { ApiError, session } from '../api';
import { ME, TEAMS, playerById, teamById } from './mock';
import { GRADES } from './grades';
import { isLegendGrade } from './potential';
import type { GradeId, Player } from './types';
import type { BatKey, PitKey } from './sets';
import {
  allDays, avgLabel, batLine, eraLabel, getSeason, isOver, leaders, myGameOf, pitLine, regularCount, standingsOf, yearOf,
  type GameRec, type MyGameRec, type NewsRec, type SeasonState, type StandRow,
} from '../season/store';
import { longDate, shortDate, type DayGames } from '../season/schedule';
import { rainedOut } from '../season/weather';
import { LEVEL_KO, aiLevel, aiTargetOf } from '../season/league';
import { boxKeyOf, getBox, type BoxView } from '../season/box';
import type { PostState, SeriesId } from '../season/post';
import { evaluate, initialLineup, store as lineupStore, unit, type LineupState, type Unit } from '../screens/lineup/calc';

/* ═════════════ 모양 ═════════════ */
/** 기사 분류 (목록의 [속보] 같은 머리) — 서버 worker/src/press.ts 의 TAGS 와 같은 이름 */
export type PressTag = '속보' | '단독' | '충격' | '화제' | '분석' | '이슈';
export const PRESS_TAGS: PressTag[] = ['속보', '단독', '충격', '화제', '분석', '이슈'];
/** 옛 분류 이름(커뮤니티 게시판 시절) → 지금 이름. 이 기기에 저장된 글 · 아직 배포 전인 옛 서버의 응답에 남아 있을 수 있다 */
const OLD_TAG = new Map<string, PressTag>([['실화냐', '화제'], ['루머', '이슈']]);
/** 분류 읽기 — 지금 이름 · 옛 이름 모두 받는다 (모르는 값이면 null) */
export function pressTagOf(v: unknown): PressTag | null {
  if (typeof v !== 'string') return null;
  return (PRESS_TAGS as string[]).includes(v) ? (v as PressTag) : OLD_TAG.get(v) ?? null;
}
/** 서버로 보내는 사건 분류 — 옛 서버(배포 전)는 새 이름을 400 으로 막으니 옛 이름으로 보낸다. 새 서버는 둘 다 받는다 */
const WIRE_TAG = new Map<PressTag, string>([['화제', '실화냐'], ['이슈', '루머']]);
/** 기사 하나 (Claude 나 템플릿이 쓴 제목 · 리드 · 댓글 — 매체 · 기자 · 시각 · 공감 수는 화면이 코드로 붙인다) */
export interface RawPost { tag: PressTag; title: string; body: string; comments: string[] }
export type Moment = 'open' | 'close';
export type AnsType = 'trust' | 'push' | 'calm';
export const ANS_KO: Record<AnsType, string> = { trust: '감싸기', push: '채찍', calm: '여유' };
export interface IvOpt { type: AnsType; text: string; head: string }
/** 질문 하나 — 기자 · 매체는 코드가 붙인 가상 이름 */
export interface IvQ { by: string; outlet: string; q: string; target: string | null; opts: IvOpt[] }
export interface IvRec {
  key: string; moment: Moment; year: number; club: string;
  src: 'ai' | 'tpl';
  /** 가을야구 첫 시리즈 (결산 · 진출) */
  stage: SeriesId | '';
  /** 효과가 붙는 경기 수 (0 = 효과 없음) */
  games: number;
  qs: IvQ[];
  picks: (number | null)[];
  at: number;
}
/** 효과 한 칸 — pid '*bat' 타자 전원 · '*pit' 투수 전원 */
export interface FxItem { pid: string; k: BatKey | PitKey; v: number }

export type EvKind = 'nohit' | 'first' | 'streakW' | 'streakL' | 'record' | 'dropout' | 'walkoffW' | 'walkoffL' | 'comeback' | 'injury' | 'marathon' | 'myRecord' | 'postWin' | 'postLose' | 'champion';
/** 특이사항 하나 */
export interface EvRec {
  id: string;
  /** 날 순번 (포스트시즌은 POST_BASE + 시리즈 순서) */
  day: number;
  date: string;
  kind: EvKind;
  big: boolean;
  mine: boolean;
  team: string;
  opp?: string;
  who?: string;
  n?: number;
  s?: [number, number];
  /** 사건 한 줄 (템플릿 글 · AI 자료) */
  text: string;
  /** q AI 기다림 · ai AI 글 있음 · tpl 템플릿 */
  st: 'q' | 'ai' | 'tpl';
}
interface EvLog { scanned: number; postSeen: string[]; list: EvRec[]; ai: number; postAi: number }
export interface PressSaved {
  v: 1;
  /** AI 가 쓴 글 묶음 — 'open:<연도>:<구단>' · 'close:<연도>:<구단>' · 'ev:<시드>:<사건 id>' */
  news: Record<string, { at: number; posts: RawPost[] }>;
  /** 인터뷰 — 'iv:open:<연도>:<구단>' · 'iv:close:<연도>:<구단>' */
  iv: Record<string, IvRec>;
  /** 시즌(시드)별 특이사항 기록 */
  ev: Record<string, EvLog>;
  /** AI 시도 횟수 (같은 자리 다시 부르기 막기) */
  tries: Record<string, number>;
  /** 이 시각(ms)까지 AI 쉬기 — 서버가 'quota' 라고 하면 다음 UTC 0시(한국 오전 9시)까지 */
  quota: number;
}

/* ═════════════ 작은 도구 ═════════════ */
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
/** 시드 난수 (0~1) — 같은 시드면 늘 같은 순서 */
export function rng(seed: string): () => number {
  let a = hash(seed) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pickOf = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length) % xs.length];
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const short = (id: string) => teamById(id).short;
const nextUtcMidnight = () => { const d = new Date(); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) + 60_000; };

/* ═════════════ 빨리 감기로 넘긴 날 — 특이사항 AI 뉴스를 만들지 않는 날 ═════════════ */
// 'bb.press.fast.v1' { v: 1, y: { [연도]: { seed, r: [[처음, 끝], …] } } } — 날 순번(allDays) 구간. 시즌 시드가 바뀌면(새로 시작) 그 해 구간을 비운다.
const FAST_KEY = 'bb.press.fast.v1';
interface FastSave { v: 1; y: Record<string, { seed: string; r: [number, number][] }> }
let fastCache: FastSave | null = null;
function fastLoad(): FastSave {
  if (fastCache) return fastCache;
  let v: FastSave = { v: 1, y: {} };
  try {
    const raw = JSON.parse(localStorage.getItem(FAST_KEY) ?? 'null') as FastSave | null;
    if (raw && raw.v === 1 && isObj(raw.y)) v = raw;
  } catch { /* 새로 */ }
  fastCache = v;
  return v;
}
/** 시즌 빨리 감기(#/season)가 그날을 치기 직전에 부른다 — 그날은 특이사항 AI 뉴스를 만들지 않는다(템플릿 뉴스만) */
export function markFastDay(year: number, dayIdx: number): void {
  if (!Number.isInteger(year) || !Number.isInteger(dayIdx) || dayIdx < 0) return;
  const seed = getSeason().seed;
  const f = fastLoad();
  const k = String(year);
  const cur = f.y[k] && f.y[k].seed === seed ? f.y[k].r : [];
  if (cur.some(([a, b]) => dayIdx >= a && dayIdx <= b)) return;
  const all = [...cur, [dayIdx, dayIdx] as [number, number]].sort((a, b) => a[0] - b[0]);
  const r: [number, number][] = [];
  for (const [a, b] of all) {
    const last = r[r.length - 1];
    if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b);
    else r.push([a, b]);
  }
  f.y[k] = { seed, r };
  for (const y of Object.keys(f.y)) if (Number(y) < year - 1) delete f.y[y]; // 지난 두 해만
  try { localStorage.setItem(FAST_KEY, JSON.stringify(f)); } catch { /* 저장이 막히면 이번 방문만 */ }
}
/** 그날을 빨리 감기로 넘겼나 */
export function isFastDay(year: number, dayIdx: number, seed: string = getSeason().seed): boolean {
  const e = fastLoad().y[String(year)];
  return !!e && e.seed === seed && e.r.some(([a, b]) => dayIdx >= a && dayIdx <= b);
}

/* ═════════════ 저장 'bb.press.v1' ═════════════ */
const KEY = 'bb.press.v1';
const LOCK_KEY = 'bb.press.lock';
const fresh = (): PressSaved => ({ v: 1, news: {}, iv: {}, ev: {}, tries: {}, quota: 0 });
let saved: PressSaved | null = null;
/** 지금 만드는 AI 글 자리 (화면이 '새 글 올라오는 중'을 그린다) */
let gen: string | null = null;
const listeners = new Set<() => void>();
export interface PressSnap { saved: PressSaved; gen: string | null }
let snap: PressSnap | null = null;

function load(): PressSaved {
  if (saved) return saved;
  let v = fresh();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as PressSaved | null;
    if (raw && raw.v === 1 && isObj(raw.news) && isObj(raw.iv) && isObj(raw.ev) && isObj(raw.tries)) v = { ...fresh(), ...raw, news: fixNews(raw.news) };
  } catch { /* 새로 */ }
  saved = v;
  return v;
}
/**
 * 저장된 AI 글 고치기 — 옛 분류(실화냐 · 루머)는 지금 이름(화제 · 이슈)으로, 커뮤니티 시절 글의 초성(ㅋㅋ · ㄹㅇ)은 지우고, 모양이 틀린 글은 뺀다.
 * 글이 다 빠져도 자리(키)는 남긴다 — 자리가 없어지면 같은 AI 글을 다시 부르게 되니까. 다음 저장 때 고친 모양으로 남는다.
 */
function fixNews(news: Record<string, unknown>): PressSaved['news'] {
  const out: PressSaved['news'] = {};
  for (const [k, g] of Object.entries(news)) {
    if (!isObj(g)) continue;
    const posts: RawPost[] = [];
    for (const p of Array.isArray(g.posts) ? g.posts : []) {
      if (!isObj(p) || typeof p.title !== 'string' || typeof p.body !== 'string') continue;
      const comments = Array.isArray(p.comments) ? p.comments.filter((c): c is string => typeof c === 'string').map(stripJamo).filter((c) => c.length >= 2) : [];
      posts.push({ tag: pressTagOf(p.tag) ?? '속보', title: stripJamo(p.title) || p.title, body: stripJamo(p.body) || p.body, comments });
    }
    out[k] = { at: typeof g.at === 'number' ? g.at : 0, posts };
  }
  return out;
}
function emit() { snap = null; listeners.forEach((l) => l()); }
/** 고쳐 쓰고 저장 (오래된 것 정리 — AI 글 40묶음 · 인터뷰 8 · 특이사항 기록 2시즌) */
function commit(mut: (s: PressSaved) => void) {
  const s = load();
  mut(s);
  const news = Object.entries(s.news).sort((a, b) => b[1].at - a[1].at);
  if (news.length > 40) s.news = Object.fromEntries(news.slice(0, 40));
  const iv = Object.entries(s.iv).sort((a, b) => b[1].at - a[1].at);
  if (iv.length > 8) s.iv = Object.fromEntries(iv.slice(0, 8));
  const seed = getSeason().seed;
  const others = Object.keys(s.ev).filter((k) => k !== seed);
  for (const k of others.slice(0, Math.max(0, others.length - 1))) delete s.ev[k];
  const tries = Object.keys(s.tries);
  if (tries.length > 80) for (const k of tries.slice(0, tries.length - 80)) delete s.tries[k];
  saved = { ...s };
  try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* 저장이 막히면 이번 방문만 */ }
  emit();
}
function setGen(k: string | null) { gen = k; emit(); }
if (typeof window !== 'undefined') {
  // 다른 탭이 쓴 것 — 다시 읽는다
  window.addEventListener('storage', (e) => { if (e.key === KEY) { saved = null; emit(); } if (e.key === FAST_KEY) fastCache = null; });
}
const getSnap = (): PressSnap => (snap ??= { saved: load(), gen });
export function usePress(): PressSnap {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, getSnap);
}
export const pressSaved = () => load();

/* ═════════════ 글 다듬기 (서버 worker/src/press.ts 와 같은 거름 — 받은 글은 사이트에서도 한 번 더) ═════════════ */
const REAL_NICK: [string, string][] = [
  ['슈퍼스타즈', '슈퍼별즈'], ['라이온즈', '사자즈'], ['타이거즈', '호랑이즈'], ['자이언츠', '거인츠'], ['히어로즈', '영웅즈'],
  ['다이노스', '공룡스'], ['와이번스', '비룡스'], ['유니콘스', '일각수스'], ['레이더스', '돌격대스'], ['이글스', '독수리스'],
  ['베어스', '곰스'], ['트윈스', '쌍둥이스'], ['랜더스', '상륙스'], ['돌핀스', '돌고래스'], ['핀토스', '조랑말스'], ['위즈', '마법사즈'],
];
const BLOCK: RegExp[] = [
  /(롯데|삼성|한화|두산|키움|넥센|쌍방울|신세계|이마트|엔씨소프트|엔씨|케이티|엘지|에스케이|해태)/,
  /(?<![A-Za-z])(KIA|SSG|NC|KT|LG|SK|OB|MBC|SBS|KBS|JTBC|SPOTV|CJ)(?![A-Za-z])/i,
  /(현대|기아|빙그레|태평양|청보|삼미)\s?(팬|구단|야구단|시절|왕조|유니폼|선수단)/,
  /(디시|디씨|엠팍|엠엘비파크|펨코|에펨|더쿠|네이버|다음 ?카페|카카오|유튜브|인스타|트위터|페이스북|쿠팡|배민)/,
  /(병신|븅신|ㅂㅅ|애자|장애인|정신병|홍어|전라디언|경상디언|개쌍도|멍청도|과메기|짱깨|쪽바리|깜둥이|흑형|틀딱|한남|김치녀|된장녀|맘충|급식충|씨발|시발|ㅅㅂ|ㅆㅂ|좆|새끼|니애미|느금|엠창|섹스|야동|자위|강간|성폭행|창녀|걸레|성매매)/,
  /(일베|메갈|워마드|좌빨|수꼴|대깨|국민의힘|민주당|정의당|윤석열|이재명|문재인|박근혜|이명박|노무현|김정은|트럼프)/,
];
/**
 * 글 한 토막 다듬기 — 이모지 · 마크다운 기호 빼기, 걸리는 말(실제 기업 · 사이트 · 욕설 · 비하 · 정치)이 있으면 null.
 * 실제 구단 별명 → 게임 별명 바꾸기는 서버가 자료 이름을 가린 채로 이미 했다 — 여기서 또 바꾸면 '위즈뎜' 같은 바뀐 선수 이름이 깨진다.
 * names: 요청에 보낸 이름(선수 · 구단) — 가린 채로 거른다
 */
export function pressClean(v: unknown, max: number, names: Set<string> = new Set()): string | null {
  if (typeof v !== 'string') return null;
  let t = v.normalize('NFC')
    .replace(/[​-‍⁠︎️]/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[*#`_~]{2,}|[*#`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/KBO/gi, '한별 리그');
  if (!t) return null;
  let masked = t;
  for (const n of [...names].filter((x) => x.length >= 2).sort((a, b) => b.length - a.length)) masked = masked.split(n).join(' ');
  if (BLOCK.some((re) => re.test(masked)) || REAL_NICK.some(([real]) => masked.includes(real) && real.length >= 3)) return null;
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + '…';
}
/**
 * 뉴스 말투 다듬기 (서버와 같은 거름) — 초성(ㅋㅋ · ㄷㄷ · ㄹㅇ …)은 지운다.
 * 댓글이면 커뮤니티 속어(실화냐 · 미쳤다 · 반박 안 받음 · .txt …)가 남거나 너무 짧을 때 그 댓글을 뺀다(null).
 */
const JAMO_RUN = /[\u1100-\u11ff\u3131-\u318e]+/g;
const SLANG = /(실화냐|실화임|미쳤다|미쳤네|미쳤음|개꿀|꿀잼|노잼|반박\s?(안|불가)|\.txt|가즈아|지렸|지린다|오진다|오지네|각이다|각 나온다)/;
/** 초성 묶음 지우기 (띄어쓰기 · 문장 부호 앞 빈칸 정리) */
function stripJamo(t: string): string {
  return t.replace(JAMO_RUN, ' ').replace(/\s+([.,!?…])/g, '$1').replace(/\s+/g, ' ').trim();
}
export function newsTone(t: string | null, comment = false): string | null {
  if (!t) return null;
  const s = stripJamo(t);
  if (!s || (comment && (s.length < 6 || SLANG.test(s)))) return null;
  return s;
}
/** 요청에 들어간 이름들 (선수 · 구단) — 받은 글을 거를 때 가린다 */
export function namesOf(req: unknown): Set<string> {
  const out = new Set<string>();
  const walk = (x: unknown) => {
    if (typeof x === 'string') { if (NAME_OK.test(x) && x.length >= 2) out.add(x); }
    else if (Array.isArray(x)) x.forEach(walk);
    else if (isObj(x)) Object.values(x).forEach(walk);
  };
  walk(req);
  return out;
}
/** 서버 자료 한 줄로 보낼 수 있게 (허용 글자만 · 길이) */
const LINE_OK = /[^\p{Script=Hangul}A-Za-z0-9 .,·:;()\-+'"%/!?~→—–…]/gu;
const safeLine = (t: string | undefined, max: number) => { const s = (t ?? '').replace(LINE_OK, ' ').replace(/\s+/g, ' ').trim().slice(0, max); return s || undefined; };
const NAME_OK = /^[가-힣A-Za-z][가-힣A-Za-z .·'-]{0,15}$/;
const okName = (n: string | undefined) => (n && NAME_OK.test(n) ? n : undefined);

/** 서버가 준 뉴스 글 읽기 (사이트 쪽 검사) — 모자라면 null. names: 요청에 보낸 이름. 분류는 옛 이름(실화냐 · 루머)도 받아 지금 이름으로 */
export function readPosts(v: unknown, min: number, max: number, names: Set<string> = new Set()): RawPost[] | null {
  if (!isObj(v) || !Array.isArray(v.posts)) return null;
  const out: RawPost[] = [];
  for (const p of v.posts.slice(0, max + 2)) {
    if (!isObj(p)) continue;
    const tag = pressTagOf(p.tag);
    const title = newsTone(pressClean(p.title, 40, names)), body = newsTone(pressClean(p.body, 180, names));
    const comments = (Array.isArray(p.comments) ? p.comments : []).map((c) => newsTone(pressClean(c, 60, names), true)).filter((c): c is string => !!c).slice(0, 4);
    if (tag && title && body && comments.length) out.push({ tag, title, body, comments });
  }
  return out.length >= min ? out.slice(0, max) : null;
}
/** 서버가 준 인터뷰 읽기 — 겨냥한 선수는 보낸 선수 중에서만. 답 3개(trust · push · calm)가 다 맞는 질문만 */
export function readQuestions(v: unknown, ids: Set<string>, names: Set<string> = new Set()): Omit<IvQ, 'by' | 'outlet'>[] | null {
  if (!isObj(v) || !Array.isArray(v.questions)) return null;
  const out: Omit<IvQ, 'by' | 'outlet'>[] = [];
  for (const q of v.questions) {
    if (!isObj(q) || !Array.isArray(q.answers)) continue;
    const qt = pressClean(q.q, 80, names);
    if (!qt) continue;
    const target = typeof q.target === 'string' && ids.has(q.target) ? q.target : null;
    const seen = new Set<string>();
    const opts: IvOpt[] = [];
    for (const a of q.answers) {
      if (!isObj(a) || (a.type !== 'trust' && a.type !== 'push' && a.type !== 'calm') || seen.has(a.type)) continue;
      const text = pressClean(a.text, 50, names), head = pressClean(a.head, 40, names);
      if (!text || !head) continue;
      seen.add(a.type);
      opts.push({ type: a.type, text, head });
    }
    if (opts.length === 3) out.push({ q: qt, target, opts });
    if (out.length === 3) break;
  }
  return out.length ? out : null;
}

/* ═════════════ 서버 호출 ═════════════ */
const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || 'https://baseball-api.get943.workers.dev';
/** 서버 오류 — code: 'quota' 한도 · 예산 / 'ai' Claude 실패 / 'bad' 요청 형식 (status 0 = 연결 안 됨 · 시간 초과) */
export class PressHttpError extends ApiError { constructor(status: number, msg: string, public code: string) { super(status, msg); } }
/** 이 탭에서 로그인이 막혔으면(401) 다시 로그인할 때까지 AI 를 부르지 않는다 */
let authOff = false;
let authToken: string | null = null;
/** AI 를 불러도 되나 (로그인 · 쉬는 시간) */
export function aiReady(): boolean {
  const t = session.get();
  if (t !== authToken) { authToken = t; authOff = false; }
  return !!t && !authOff && Date.now() >= load().quota;
}
async function postJson(path: string, data: unknown, ms: number): Promise<unknown> {
  const t = session.get();
  if (!t) throw new PressHttpError(401, '로그인이 필요해요', 'auth');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  let res: Response;
  try {
    res = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify(data), signal: ctl.signal });
  } catch {
    throw new PressHttpError(0, '서버에 연결하지 못했어요', 'net');
  } finally {
    clearTimeout(timer);
  }
  const out: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const o = isObj(out) ? out : {};
    throw new PressHttpError(res.status, typeof o.error === 'string' ? o.error : `오류 ${res.status}`, typeof o.code === 'string' ? o.code : res.status === 401 ? 'auth' : 'http');
  }
  return out;
}
/** 실패 정리 — 한도면 다음 UTC 0시까지 쉬고, 서버 · Claude 가 안 되면 10분 쉬고, 로그인 문제면 이 탭에선 그만 */
function onFail(e: unknown) {
  if (e instanceof PressHttpError) {
    if (e.code === 'quota' || e.status === 429) commit((s) => { s.quota = nextUtcMidnight(); });
    else if (e.status === 401 || e.code === 'auth') authOff = true;
    else if (e.status === 0 || e.status >= 500) commit((s) => { s.quota = Math.max(s.quota, Date.now() + 10 * 60_000); });
  }
  if (import.meta.env.DEV) console.info('[언론] AI 대신 템플릿', e instanceof Error ? e.message : e);
}

/* ═════════════ 경기 자료 (AI 요청 · 템플릿이 같이 쓴다) ═════════════ */
export type PlayerTag = 'hurt' | 'tired' | 'low' | 'hot' | 'cold' | 'legend' | 'star' | 'ace' | 'closer';
export interface PlayerFact {
  /** 자료 키 — b1~b9 타순 · sp 선발 · cl 마무리 · x1·x2 걱정거리 투수 */
  key: string;
  p: Player;
  /** 'CF' · 'SP' · 'CL' · 'RP' */
  pos: string;
  ovr: number;
  grade: GradeId;
  cond: number;
  fat: number;
  inj?: string;
  /** 시즌 기록 한 줄 ('타율 .312 · 14홈런 · 61타점' · '12승 3패 · 평균자책 2.98') — 없으면 '' */
  line: string;
  tags: PlayerTag[];
}
export interface FirstGame { idx: number; day: DayGames; opp: string; home: boolean }
export interface OpenFacts {
  year: number; date: string; me: string; lv: string; ovr: number;
  /** 예상 전력 순 [구단, 세기] */
  power: [string, number][];
  predRank: number;
  first: FirstGame | null;
  rival: { id: string; name: string } | null;
  players: PlayerFact[];
  topics: string[];
}
export interface CloseFacts {
  year: number; date: string; me: string; lv: string; ovr: number;
  rows: StandRow[];
  rank: number;
  row: StandRow;
  /** 가을야구 — stage '' 면 탈락 · seed 내 순위 */
  post: { stage: SeriesId | ''; seed: number; opp?: string };
  leaders: ReturnType<typeof leaders>;
  players: PlayerFact[];
  topics: string[];
  champion?: string;
}
export interface DayFacts {
  idx: number; date: string; year: number; me: string;
  /** 시즌 시드 (템플릿 글 고르기) */
  seed: string;
  my?: MyGameRec;
  box: BoxView | null;
  news: NewsRec[];
  results: GameRec[];
  /** 그날 뒤 내 순위 · 그 전날 순위 (모르면 0) */
  rank: number; prevRank: number;
  /** 그날까지 내 경기 수 */
  played: number;
  /** 마지막으로 친 날인가 (지금 순위표 · 연승을 써도 되는 날) */
  latest: boolean;
  rows: StandRow[] | null;
  streak: number;
  /** 팀 타율 · 평균자책과 리그 순위 (마지막 날만) */
  team: { avg: number; avgRank: number; era: number; eraRank: number } | null;
}

/** 가을야구 진출 순위 (season/post — 정규 시즌 1~5위) */
export const POST_SEEDS = 5;
const SERIES_KO: Record<SeriesId, string> = { wc: '와일드카드 결정전', spo: '준플레이오프', po: '플레이오프', ks: '한국시리즈' };
export const seriesKo = (id: SeriesId) => SERIES_KO[id];

/** 다음 내 경기 (비로 취소되는 날은 건너뜀) — season/run 의 nextMyGame 과 같은 규칙 (run 을 가져오지 않으려고 여기 둠) */
export function firstGameFrom(s: SeasonState, from = s.next): FirstGame | null {
  const days = allDays(s);
  for (let i = from; i < days.length; i++) {
    const g = myGameOf(days[i]);
    if (!g) continue;
    if (i < regularCount() && rainedOut(days[i].date, g[1], s.seed)) continue;
    const home = g[1] === ME.teamId;
    return { idx: i, day: days[i], opp: home ? g[0] : g[1], home };
  }
  return null;
}

const lineupNow = (): LineupState => lineupStore.get() ?? initialLineup();
function unitOf(id: string | null | undefined): Unit | null {
  if (!id) return null;
  try { const u = unit(id); return u && u.player ? u : null; } catch { return null; }
}
function seasonLineOf(p: Player, s: SeasonState): string {
  if (p.pos === 'P') {
    const l = pitLine(p.id, s);
    return l.outs ? `${l.w}승 ${l.l}패${l.sv ? ` ${l.sv}세` : ''} · 평균자책 ${eraLabel(l)}` : '';
  }
  const l = batLine(p.id, s);
  return l.ab ? `타율 ${avgLabel(l)} · ${l.hr}홈런 · ${l.rbi}타점` : '';
}
function factOf(key: string, u: Unit, pos: string, s: SeasonState, season: boolean): PlayerFact {
  const p = u.player;
  const tags: PlayerTag[] = [];
  if (p.injury) tags.push('hurt');
  if (p.fatigue >= 40) tags.push('tired');
  if (p.condition <= 2) tags.push('low');
  if (isLegendGrade(u.card.grade)) tags.push('legend');
  if (season) {
    if (p.pos === 'P') {
      const l = pitLine(p.id, s);
      if (l.outs >= 240 && (l.era <= 2.9 || l.w >= 14)) tags.push('hot');
      if (l.outs >= 150 && l.era >= 5.2) tags.push('cold');
      if (l.sv >= 20) tags.push('closer');
    } else {
      const l = batLine(p.id, s);
      if (l.ab >= 150 && (l.avg >= 0.315 || l.hr >= 25)) tags.push('hot');
      if (l.ab >= 150 && l.avg < 0.235) tags.push('cold');
    }
  }
  return {
    key, p, pos, ovr: u.card.ovr ?? p.ovr, grade: u.card.grade, cond: p.condition, fat: p.fatigue, inj: p.injury,
    line: season ? seasonLineOf(p, s) : '', tags,
  };
}
/** 내 1군 — 타순 9 · 그날 선발 · 마무리 · 걱정거리 투수 2 (spDay: 그날 엔진이 고를 선발 — 로테이션 순서) */
function entryFacts(s: SeasonState, opts: { spDay?: number; season?: boolean } = {}): PlayerFact[] {
  const st = lineupNow();
  const out: PlayerFact[] = [];
  const add = (key: string, id: string | null | undefined, pos: string) => { const u = unitOf(id); if (u) out.push(factOf(key, u, pos, s, !!opts.season)); };
  st.order.forEach((slot, i) => add(`b${i + 1}`, st.field[slot], slot));
  const rot = st.rotation.filter((x): x is string => !!x && !!unitOf(x));
  const ti = TEAMS.findIndex((t) => t.id === ME.teamId);
  let spId: string | undefined = rot[0];
  if (opts.spDay !== undefined && rot.length) spId = rot[(((opts.spDay + ti) % rot.length) + rot.length) % rot.length];
  if (opts.season) {
    // 결산 — 다승 · 평균자책이 가장 좋은 선발을 '에이스'로
    const best = rot.map((id) => unitOf(id)!).sort((a, b) => pitLine(b.player.id, s).w - pitLine(a.player.id, s).w || pitLine(a.player.id, s).era - pitLine(b.player.id, s).era)[0];
    if (best) spId = best.id;
  }
  add('sp', spId, 'SP');
  if (spId) { const f = out[out.length - 1]; if (f?.key === 'sp' && !f.tags.includes('ace')) f.tags.push('ace'); }
  add('cl', st.closer, 'CL');
  let x = 1;
  for (const id of [...rot, ...st.bullpen.filter((b): b is string => !!b)]) {
    if (x > 2) break;
    if (id === spId || id === st.closer) continue;
    const u = unitOf(id);
    if (u && (u.player.injury || u.player.fatigue >= 40 || u.player.condition <= 2)) add(`x${x++}`, id, rot.includes(id) ? 'SP' : 'RP');
  }
  return out.filter((f) => !!okName(f.p.name));
}
const gradeKo = (g: GradeId) => GRADES[g]?.ko ?? '';
function worryTopics(ps: PlayerFact[]): string[] {
  const out: string[] = [];
  for (const f of ps) {
    if (f.inj) out.push(`${f.p.name} 부상(${f.inj})`);
    else if (f.tags.includes('tired')) out.push(`${f.p.name} 피로 ${f.fat}`);
    else if (f.tags.includes('low')) out.push(`${f.p.name} 컨디션 ${f.cond}/5`);
  }
  return out;
}
function myOvr(): number {
  try { return Math.round(evaluate(lineupNow()).raw); } catch { return 0; }
}
function rivalOf(me: string): { id: string; name: string } | null {
  const t = teamById(me);
  const rid = (t.rival ?? '').toLowerCase();
  return rid && TEAMS.some((x) => x.id === rid) && t.rivalry ? { id: rid, name: t.rivalry } : null;
}

/** 개막 특집 자료 */
export function openFacts(s: SeasonState = getSeason()): OpenFacts {
  const me = ME.teamId;
  const ovr = myOvr();
  const power = TEAMS.map((t) => [t.id, t.id === me ? ovr : aiTargetOf(t.id)] as [string, number]).sort((a, b) => b[1] - a[1]);
  const first = firstGameFrom(s, s.next);
  const players = entryFacts(s, { spDay: first?.day.day });
  const stars = players.slice().sort((a, b) => b.ovr - a.ovr).slice(0, 3);
  stars.forEach((f) => { if (!f.tags.includes('star')) f.tags.push('star'); });
  const predRank = power.findIndex(([id]) => id === me) + 1;
  const rival = rivalOf(me);
  const lv = LEVEL_KO[aiLevel()];
  const topics = [
    ...worryTopics(players),
    ...players.filter((f) => f.tags.includes('legend')).slice(0, 2).map((f) => `${f.p.name} ${gradeKo(f.grade)} 카드`),
    ...(first && rival && first.opp === rival.id ? [`개막전 상대가 라이벌 ${short(rival.id)} (${rival.name})`] : []),
    `전력 예상 ${predRank}위 · 리그 단계 ${lv}`,
  ];
  return {
    year: yearOf(s), date: first?.day.date ?? allDays(s)[0]?.date ?? `${yearOf(s)}-03-27`, me, lv, ovr, power, predRank, first, rival, players, topics,
  };
}

/** 내 포스트시즌 경기 수 (끝난 것) */
export function myPostPlayed(p: PostState | undefined): number {
  if (!p) return 0;
  return p.series.reduce((n, sr) => n + sr.games.filter((g) => g.mine || g.away === ME.teamId || g.home === ME.teamId).length, 0);
}
/** 내 가을야구 — 첫 시리즈 · 순위 · 첫 상대 */
function postEntry(s: SeasonState, rows: StandRow[]): CloseFacts['post'] {
  const seeds = s.post?.seeds ?? rows.slice(0, POST_SEEDS).map((r) => r.teamId);
  const seed = seeds.indexOf(ME.teamId) + 1;
  const rank = rows.findIndex((r) => r.teamId === ME.teamId) + 1;
  if (!seed) return { stage: '', seed: rank };
  const stage: SeriesId = seed === 1 ? 'ks' : seed === 2 ? 'po' : seed === 3 ? 'spo' : 'wc';
  const opp = stage === 'wc' ? seeds[seed === 4 ? 4 : 3] : undefined;
  return { stage, seed, opp };
}
/** 시즌 결산 자료 */
export function closeFacts(s: SeasonState = getSeason()): CloseFacts {
  const me = ME.teamId;
  const rows = standingsOf(s);
  const row = rows.find((r) => r.teamId === me) ?? rows[0];
  const rank = rows.indexOf(row) + 1;
  const days = allDays(s);
  const players = entryFacts(s, { season: true });
  const post = postEntry(s, rows);
  const hot = players.filter((f) => f.tags.includes('hot')).slice(0, 2);
  const cold = players.filter((f) => f.tags.includes('cold')).slice(0, 1);
  const topics = [
    post.stage ? `${seriesKo(post.stage)}부터${post.opp ? ` · 첫 상대 ${short(post.opp)}` : ''}` : `${rank}위 · 가을야구 탈락`,
    ...hot.map((f) => `${f.p.name} ${f.line}`),
    ...cold.map((f) => `${f.p.name} 부진 (${f.line})`),
    ...worryTopics(players).slice(0, 2),
  ];
  return {
    year: yearOf(s), date: days[days.length - 1]?.date ?? `${yearOf(s)}-09-30`, me, lv: LEVEL_KO[aiLevel()], ovr: myOvr(),
    rows, rank, row, post, leaders: leaders(s), players, topics, champion: s.post?.champion,
  };
}

/** 그날 자료 (날마다 뉴스 · 특이사항) */
export function dayFacts(s: SeasonState, idx: number): DayFacts {
  const me = ME.teamId;
  const days = allDays(s);
  const d = days[idx];
  const my = s.my.find((m) => m.idx === idx);
  let box: BoxView | null = null;
  if (my) {
    try { box = getBox(boxKeyOf(idx, my.home ? my.opp : me, my.home ? me : my.opp), s.seed); } catch { box = null; }
  }
  const rh = s.rankHist[me] ?? [];
  const latest = idx === s.next - 1;
  const rows = latest ? standingsOf(s) : null;
  return {
    idx, date: d?.date ?? '', year: yearOf(s), me, seed: s.seed, my, box,
    news: s.news.filter((n) => n.idx === idx),
    results: s.results[idx] ?? [],
    rank: rh[idx] ?? 0, prevRank: idx > 0 ? rh[idx - 1] ?? 0 : 0,
    played: s.my.filter((m) => m.idx <= idx).length,
    latest, rows,
    streak: latest ? s.table[me]?.streak ?? 0 : 0,
    team: latest ? teamStats(s, me) : null,
  };
}
/** 팀 타율 · 평균자책 (선수 시즌 기록 합)과 리그 순위 */
function teamStats(s: SeasonState, me: string): DayFacts['team'] {
  const agg = new Map<string, { h: number; ab: number; er: number; outs: number }>();
  for (const t of TEAMS) agg.set(t.id, { h: 0, ab: 0, er: 0, outs: 0 });
  for (const b of Object.values(s.bat)) { const a = agg.get(b.team); if (a) { a.h += b.H; a.ab += b.AB; } }
  for (const p of Object.values(s.pit)) { const a = agg.get(p.team); if (a) { a.er += p.ER; a.outs += p.outs; } }
  const rows = [...agg.entries()].map(([id, a]) => ({ id, avg: a.ab ? a.h / a.ab : 0, era: a.outs ? (a.er * 27) / a.outs : 0, ok: a.ab > 0 && a.outs > 0 }));
  const mine = rows.find((r) => r.id === me);
  if (!mine || !mine.ok) return null;
  const avgRank = rows.filter((r) => r.avg > mine.avg).length + 1;
  const eraRank = rows.filter((r) => r.ok && r.era < mine.era).length + 1;
  return { avg: mine.avg, avgRank, era: mine.era, eraRank };
}

/** 박스스코어에서 수훈 선수 (내 구단 타자 2명 + 잘 던진 선발) — [이름, 한 줄] */
export function starsOf(box: BoxView | null, mine = true): [string, string][] {
  if (!box) return [];
  const side = box.home === ME.teamId ? 1 : 0;
  const s = mine ? side : (1 - side) as 0 | 1;
  const out: [string, string][] = [];
  const bats = box.bat[s].slice().sort((a, b) => (b.HR * 4 + b.H * 1.5 + b.RBI * 1.5 + b.BB * 0.5) - (a.HR * 4 + a.H * 1.5 + a.RBI * 1.5 + a.BB * 0.5));
  for (const b of bats.slice(0, 2)) {
    if (b.H + b.BB === 0 && !b.RBI) continue;
    const bits = [`${b.AB}타수 ${b.H}안타`];
    if (b.HR) bits.push(`${b.HR}홈런`);
    if (b.RBI) bits.push(`${b.RBI}타점`);
    out.push([b.name, bits.join(' ')]);
  }
  const sp = box.pit[s].find((p) => p.gs);
  if (sp && sp.outs >= 15 && sp.ER <= 2) out.push([sp.name, `${Math.floor(sp.outs / 3)}${sp.outs % 3 ? `.${sp.outs % 3}` : ''}이닝 ${sp.ER}자책 ${sp.SO}삼진`]);
  return out.filter(([n]) => !!okName(n)).slice(0, 3);
}

/* ═════════════ AI 요청 만들기 ═════════════ */
const tableRows = (rows: StandRow[]) => rows.map((r) => [r.teamId, r.w, r.d, r.l, r.streak.endsWith('승') ? parseInt(r.streak, 10) : r.streak.endsWith('패') ? -parseInt(r.streak, 10) : 0] as [string, number, number, number, number]);
const squadOf = (ps: PlayerFact[], season: boolean) => ps.slice(0, 6).map((f) => [
  f.p.name, f.pos === 'SP' || f.pos === 'CL' || f.pos === 'RP' ? f.pos : f.p.pos === 'P' ? 'P' : f.pos,
  safeLine(season ? (f.line || (f.inj ? `부상: ${f.inj}` : '')) : [`종합 ${f.ovr}`, f.tags.includes('legend') ? `${gradeKo(f.grade)} 카드` : '', f.inj ? `부상: ${f.inj}` : ''].filter(Boolean).join(' · '), 40) ?? '',
] as [string, string, string]);
function gameIn(f: DayFacts) {
  const m = f.my;
  if (!m) return undefined;
  const box = f.box;
  return {
    opp: m.opp, home: m.home, s: [m.my, m.their], inn: m.inn, wo: !!m.wo,
    line: m.line ? [m.line[0].slice(0, 15), m.line[1].slice(0, 15)] : undefined,
    w: okName(m.dec?.w ? playerById(m.dec.w)?.name : undefined),
    l: okName(m.dec?.l ? playerById(m.dec.l)?.name : undefined),
    sv: okName(m.dec?.s ? playerById(m.dec.s)?.name : undefined),
    gw: okName(box?.gw?.name),
    stars: starsOf(box),
  };
}

/** tv — 분류 이름 판. 2 = 화제 · 이슈를 아는 사이트 (서버는 이게 없으면 옛 사이트로 보고 옛 이름 실화냐 · 루머로 돌려준다) */
const TAG_V = 2;
export function newsReqOpen(f: OpenFacts) {
  return {
    v: 1, tv: TAG_V, moment: 'open', year: f.year, date: f.date, me: f.me, lv: f.lv, ovr: f.ovr || undefined,
    power: f.power.map(([id, p]) => [id, Math.max(0, Math.round(p))]),
    first: f.first ? { opp: f.first.opp, home: f.first.home, sp: okName(f.players.find((x) => x.key === 'sp')?.p.name) } : undefined,
    rival: f.rival ?? undefined,
    squad: squadOf(f.players.filter((x) => x.tags.includes('star') || x.tags.includes('hurt') || x.tags.includes('tired')), false),
    table: [], leaders: [],
    notes: f.topics.map((t) => safeLine(t, 70)).filter((t): t is string => !!t).slice(0, 5),
  };
}
const leaderRows = (ls: CloseFacts['leaders']) => ls.map((l) => [l.label, playerById(l.id)?.name ?? '', l.team, l.value] as [string, string, string, string]).filter((x) => !!okName(x[1]) && /^[0-9.\-]{1,7}$/.test(x[3]));
export function newsReqClose(f: CloseFacts) {
  return {
    v: 1, tv: TAG_V, moment: 'close', year: f.year, date: f.date, me: f.me, lv: f.lv, ovr: f.ovr || undefined,
    table: tableRows(f.rows), power: [],
    leaders: leaderRows(f.leaders),
    squad: squadOf(f.players.filter((x) => !!x.line).sort((a, b) => (b.tags.includes('hot') ? 1 : 0) - (a.tags.includes('hot') ? 1 : 0)), true),
    post: { stage: f.post.stage, seed: f.post.seed, opp: f.post.opp },
    notes: f.topics.map((t) => safeLine(t, 70)).filter((t): t is string => !!t).slice(0, 5),
  };
}
export function newsReqEvent(ev: EvRec, f: DayFacts, s: SeasonState) {
  const rows = f.rows ?? standingsOf(s);
  const tag = evTag(ev);
  return {
    v: 1, tv: TAG_V, moment: 'event', year: f.year, date: ev.date || f.date, me: f.me,
    table: f.latest || ev.day >= POST_BASE ? tableRows(rows) : [],
    power: [], leaders: [], squad: [],
    game: ev.day < POST_BASE ? gameIn(f) : undefined,
    ev: {
      kind: ev.kind, tag: WIRE_TAG.get(tag) ?? tag, big: ev.big, mine: ev.mine, team: ev.team, opp: ev.opp, who: okName(ev.who), n: ev.n,
      text: safeLine(ev.text, 80) ?? `${short(ev.team)} 소식`,
    },
    notes: [
      ...(!f.latest && f.rank && ev.day < POST_BASE ? [`그날 ${short(f.me)} ${f.rank}위`] : []),
      ...f.news.filter((n) => n.text !== ev.text).slice(0, 3).map((n) => safeLine(`${n.kind} ${n.text}`, 70)).filter((t): t is string => !!t),
    ],
  };
}

/* ═════════════ 특이사항 ═════════════ */
/** 포스트시즌 사건의 날 번호 (정규 시즌 날과 섞이지 않게) */
export const POST_BASE = 1000;
const MID_CAP = 15;
const POST_CAP = 4;
const COOLDOWN = 5;
export const EV_TAG: Record<EvKind, PressTag> = {
  nohit: '화제', first: '속보', streakW: '화제', streakL: '충격', record: '화제', dropout: '충격', walkoffW: '속보', walkoffL: '충격',
  comeback: '화제', injury: '속보', marathon: '화제', myRecord: '속보', postWin: '속보', postLose: '충격', champion: '속보',
};
const EV_RANK: Record<EvKind, number> = {
  champion: 100, nohit: 90, postWin: 86, postLose: 85, first: 80, record: 75, streakW: 70, streakL: 70, dropout: 66,
  walkoffW: 50, walkoffL: 48, comeback: 45, injury: 40, myRecord: 38, marathon: 30,
};
/** 특이사항 기사 분류 — 역전패 · 내 구단이 당한 노히트는 '충격' */
export function evTag(e: EvRec): PressTag {
  if (e.kind === 'comeback' && e.team !== ME.teamId) return '충격';
  if (e.kind === 'nohit' && e.mine && e.team !== ME.teamId) return '충격';
  return EV_TAG[e.kind];
}
/** 뉴스 화면이 보여 주는 날 수 (마지막으로 친 날부터) — 이보다 오래된 특이사항은 AI 로 만들지 않는다(보이지 않으니) */
export const FEED_DAYS = 4;
const notable = (a: EvRec, b: EvRec) => Number(b.big) - Number(a.big) || Number(b.mine) - Number(a.mine) || EV_RANK[b.kind] - EV_RANK[a.kind] || b.day - a.day;

function keyPlayerNames(): Set<string> {
  const st = lineupNow();
  const ids = [...st.order.map((slot) => st.field[slot]), ...st.rotation, st.closer];
  return new Set(ids.map((id) => unitOf(id)?.player.name).filter((n): n is string => !!n));
}
const whoOf = (t: string) => /^(.+?)\(/.exec(t)?.[1];
/** 그날 특이사항 (판정만 — AI 를 쓸지는 select 가) */
export function detectDay(s: SeasonState, d: number): EvRec[] {
  const days = allDays(s);
  const day = days[d];
  if (!day) return [];
  const me = ME.teamId;
  const news = s.news.filter((n) => n.idx === d);
  const my = s.my.find((m) => m.idx === d);
  const rh = s.rankHist[me] ?? [];
  const out: EvRec[] = [];
  const add = (e: Omit<EvRec, 'id' | 'day' | 'date' | 'st'>) => {
    if (out.some((x) => x.kind === e.kind)) return;
    out.push({ ...e, id: `${d}:${e.kind}:${e.team}`, day: d, date: day.date, st: 'tpl' });
  };
  let keys: Set<string> | null = null;
  for (const n of news) {
    if (n.kind === '노히트' && n.team) add({ kind: 'nohit', big: true, mine: n.team === me || !!n.mine, team: n.team, text: n.text });
    if (n.kind === '기록' && n.team) {
      const hr = Number(/홈런 (\d+)개/.exec(n.text)?.[1] ?? 0), so = Number(/탈삼진 (\d+)개/.exec(n.text)?.[1] ?? 0);
      if (hr >= 4 || so >= 15) add({ kind: 'record', big: true, mine: n.team === me, team: n.team, who: whoOf(n.text), n: hr || so, text: n.text });
      else if (n.team === me) add({ kind: 'myRecord', big: false, mine: true, team: me, who: whoOf(n.text), n: hr || so || 5, text: n.text });
    }
    if ((n.kind === '연승' || n.kind === '연패') && n.team === me) {
      const k = Number(/(\d+)연[승패]/.exec(n.text)?.[1] ?? 0);
      if (k >= 5) add({ kind: n.kind === '연승' ? 'streakW' : 'streakL', big: k >= 8, mine: true, team: me, n: k, text: n.text });
    }
    if (n.kind === '부상' && n.team === me) {
      const who = whoOf(n.text);
      keys ??= keyPlayerNames();
      if (who && keys.has(who)) add({ kind: 'injury', big: false, mine: true, team: me, who, text: n.text });
    }
    if (n.kind === '역전' && n.mine && my) {
      const k = Number(/(\d+)점 차/.exec(n.text)?.[1] ?? 0);
      const won = (n.team ?? me) === me;
      add({
        kind: 'comeback', big: false, mine: true, team: n.team ?? me, opp: my.opp, n: k, s: [my.my, my.their],
        text: won ? `${short(me)}, ${short(my.opp)} 상대로 ${k}점 차 뒤집고 ${my.my}:${my.their} 승` : `${short(me)}, ${short(my.opp)}에 ${k}점 차 리드 못 지키고 ${my.my}:${my.their} 역전패`,
      });
    }
  }
  const prev = d > 0 ? rh[d - 1] : undefined;
  if (d >= 10 && rh[d] === 1 && prev !== undefined && prev !== 1) add({ kind: 'first', big: true, mine: true, team: me, text: `${short(me)} 1위 등극 — ${longDate(day.date)}` });
  const playedThen = s.my.filter((m) => m.idx <= d).length;
  if (playedThen >= 100 && (rh[d] ?? 0) > POST_SEEDS && prev !== undefined && prev <= POST_SEEDS) {
    add({ kind: 'dropout', big: true, mine: true, team: me, n: rh[d], text: `${short(me)} ${rh[d]}위로 밀려 가을야구 선(${POST_SEEDS}위) 밖으로 — ${playedThen}경기째` });
  }
  if (my) {
    const sc = `${my.my}:${my.their}`;
    if (my.wo) {
      add(my.res === 'W'
        ? { kind: 'walkoffW', big: false, mine: true, team: me, opp: my.opp, n: my.inn, s: [my.my, my.their], text: `${short(me)} ${my.inn}회말 끝내기 승 — ${short(my.opp)}에 ${sc}` }
        : { kind: 'walkoffL', big: false, mine: true, team: me, opp: my.opp, n: my.inn, s: [my.my, my.their], text: `${short(me)}, ${short(my.opp)}에 ${my.inn}회말 끝내기 패 ${sc}` });
    }
    if (my.inn >= 12) add({ kind: 'marathon', big: false, mine: true, team: me, opp: my.opp, n: my.inn, s: [my.my, my.their], text: `${short(me)}·${short(my.opp)} ${my.inn}회 연장 혈투 — ${sc} ${my.res === 'W' ? '승' : my.res === 'L' ? '패' : '무승부'}` });
  }
  return out;
}
/** 포스트시즌 사건 — 내 시리즈가 끝날 때 (통과 · 탈락 · 우승) */
export function detectPost(s: SeasonState): EvRec[] {
  const p = s.post;
  if (!p) return [];
  const me = ME.teamId;
  const out: EvRec[] = [];
  p.series.forEach((sr, i) => {
    if (!sr.winner || (sr.hi !== me && sr.lo !== me)) return;
    const opp = sr.hi === me ? sr.lo : sr.hi;
    const w = sr.hi === me ? sr.wins[0] : sr.wins[1], l = sr.hi === me ? sr.wins[1] : sr.wins[0];
    const last = sr.games[sr.games.length - 1];
    const won = sr.winner === me;
    const kind: EvKind = won ? (sr.id === 'ks' ? 'champion' : 'postWin') : 'postLose';
    const text = won
      ? sr.id === 'ks' ? `${short(me)} 한국시리즈 우승 — ${short(opp)}를 ${w}승 ${l}패로` : `${short(me)} ${SERIES_KO[sr.id]} 통과 — ${short(opp)}를 ${w}승 ${l}패로`
      : `${short(me)} ${SERIES_KO[sr.id]}에서 탈락 — ${short(opp)}에 ${w}승 ${l}패`;
    out.push({ id: `p:${sr.id}`, day: POST_BASE + i, date: last?.date ?? p.date, kind, big: true, mine: true, team: me, opp, n: w, s: [w, l], text, st: 'tpl' });
  });
  return out;
}
/** 보통 사건이 AI 후보가 되나 — 반반, 시즌 시드 · 날 · 종류로 정해 다시 열어도 같다 */
const rollOf = (seed: string, day: number, kind: EvKind) => rng(`press:${seed}:${day}:${kind}`)();

/** AI 후보 고르기 — 큰 사건 > 보통, 내 구단 > 다른 구단, 5경기일 간격, 시즌 15번(포스트시즌 4번)까지. 못 고른 것은 템플릿 */
function select(log: EvLog, fresh: EvRec[]) {
  const pool = [...log.list.filter((e) => e.st === 'q'), ...fresh].sort(notable);
  const done = log.list.filter((e) => e.st === 'ai');
  const chosen: EvRec[] = [];
  for (const e of pool) {
    const post = e.day >= POST_BASE;
    const left = (post ? POST_CAP - log.postAi : MID_CAP - log.ai) - chosen.filter((x) => (x.day >= POST_BASE) === post).length;
    const far = post || [...done, ...chosen].every((x) => x.day >= POST_BASE || Math.abs(x.day - e.day) >= COOLDOWN);
    e.st = left > 0 && far ? 'q' : 'tpl';
    if (e.st === 'q') chosen.push(e);
  }
  const ids = new Set(pool.map((e) => e.id));
  log.list = [...log.list.filter((e) => !ids.has(e.id)), ...pool].sort((a, b) => a.day - b.day).slice(-80);
}
/**
 * 새로 친 날을 살펴 특이사항을 적는다 (뉴스 화면이 보일 때). 빨리 감기로 넘긴 날은 건너뛴다.
 * 이 시즌을 처음 볼 때는 지난 날을 살피지 않는다(지난 기록으로 AI 를 한꺼번에 부르지 않게).
 */
export function scanEvents(s: SeasonState = getSeason()): void {
  if (!s.seed) return;
  const st = load();
  const last = s.next - 1;
  const log = st.ev[s.seed];
  if (!log) {
    commit((x) => { x.ev[s.seed] = { scanned: last, postSeen: (s.post?.series ?? []).filter((r) => r.winner).map((r) => `p:${r.id}`), list: [], ai: 0, postAi: 0 }; });
    return;
  }
  const postNew = detectPost(s).filter((e) => !log.postSeen.includes(e.id));
  if (log.scanned >= last && !postNew.length) return;
  const year = yearOf(s);
  const found: EvRec[] = [];
  for (let d = Math.max(0, log.scanned + 1); d <= last; d++) {
    if (isFastDay(year, d, s.seed)) continue;
    for (const e of detectDay(s, d)) if (e.big || rollOf(s.seed, d, e.kind) < 0.5) found.push(e);
  }
  // 화면에 안 보일 만큼 오래된 사건은 AI 로 만들지 않는다 (템플릿)
  const recent = (e: EvRec) => e.day >= POST_BASE || last - e.day < FEED_DAYS;
  commit((x) => {
    const lg = x.ev[s.seed];
    if (!lg) return;
    lg.scanned = Math.max(lg.scanned, last);
    lg.postSeen = [...lg.postSeen, ...postNew.map((e) => e.id)];
    for (const e of lg.list) if (e.st === 'q' && !recent(e)) e.st = 'tpl';
    const fresh = [...found, ...postNew].filter((e) => !lg.list.some((y) => y.id === e.id));
    const old = fresh.filter((e) => !recent(e));
    old.forEach((e) => { e.st = 'tpl'; });
    if (old.length) lg.list = [...lg.list, ...old].sort((a, b) => a.day - b.day).slice(-80);
    const now = fresh.filter(recent);
    if (now.length) select(lg, now);
  });
}
/** 이 시즌 특이사항 (판정된 것 — AI · 템플릿 모두) */
export function eventsOf(s: SeasonState, sv: PressSaved = load()): EvRec[] {
  return sv.ev[s.seed]?.list ?? [];
}

/* ═════════════ AI 일 — 개막 특집 · 시즌 결산 · 특이사항 ═════════════ */
export const openKey = (year: number, club = ME.teamId) => `open:${year}:${club}`;
export const closeKey = (year: number, club = ME.teamId) => `close:${year}:${club}`;
export const evKey = (seed: string, id: string) => `ev:${seed}:${id}`;
export type Job = { kind: 'open' | 'close'; key: string } | { kind: 'event'; key: string; ev: EvRec };
/** 개막 특집 자리 — 내 첫 정규 시즌 경기 전 */
export const isOpenTime = (s: SeasonState) => !isOver(s) && s.my.length === 0;
/** 다음에 만들 AI 글 (없으면 null) — AI 를 못 쓰는 때도 null */
export function nextJob(s: SeasonState = getSeason()): Job | null {
  if (!aiReady()) return null;
  return pendingJobs(s)[0] ?? null;
}
/** 만들 차례인 AI 글 자리들 (순서대로) */
export function pendingJobs(s: SeasonState = getSeason(), sv: PressSaved = load()): Job[] {
  const year = yearOf(s);
  const out: Job[] = [];
  const tries = (k: string) => sv.tries[k] ?? 0;
  if (isOpenTime(s)) { const k = openKey(year); if (!sv.news[k] && tries(k) < 2) out.push({ kind: 'open', key: k }); }
  if (isOver(s)) { const k = closeKey(year); if (!sv.news[k] && tries(k) < 2) out.push({ kind: 'close', key: k }); }
  const last = s.next - 1;
  const q = (sv.ev[s.seed]?.list ?? []).filter((e) => e.st === 'q' && (e.day >= POST_BASE || last - e.day < FEED_DAYS)).sort((a, b) => b.day - a.day || notable(a, b));
  for (const e of q) { const k = evKey(s.seed, e.id); if (!sv.news[k] && tries(k) < 1) out.push({ kind: 'event', key: k, ev: e }); }
  return out;
}
/** 다른 탭이 같은 글을 만들고 있으면 기다린다 (60초) */
function lockTab(k: string): boolean {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCK_KEY) ?? 'null') as { k?: string; t?: number } | null;
    if (raw && raw.k === k && typeof raw.t === 'number' && Date.now() - raw.t < 60_000) return false;
    localStorage.setItem(LOCK_KEY, JSON.stringify({ k, t: Date.now() }));
  } catch { /* 저장이 막혀도 이 탭은 한다 */ }
  return true;
}
function unlockTab() { try { localStorage.removeItem(LOCK_KEY); } catch { /* */ } }
function markEvent(seed: string, id: string, st: EvRec['st']) {
  commit((x) => {
    const lg = x.ev[seed];
    const e = lg?.list.find((y) => y.id === id);
    if (!lg || !e) return;
    if (st === 'ai' && e.st !== 'ai') { if (e.day >= POST_BASE) lg.postAi++; else lg.ai++; }
    e.st = st;
  });
}
async function runJob(job: Job): Promise<void> {
  const s = getSeason();
  commit((x) => { x.tries[job.key] = (x.tries[job.key] ?? 0) + 1; });
  setGen(job.key);
  try {
    const req = job.kind === 'event' ? newsReqEvent(job.ev, dayFacts(s, Math.min(job.ev.day, s.next - 1)), s) : job.kind === 'open' ? newsReqOpen(openFacts(s)) : newsReqClose(closeFacts(s));
    const res = await postJson('/ai/news', req, 30_000);
    const names = namesOf(req);
    const posts = job.kind === 'event' ? readPosts(res, 1, 3, names) : readPosts(res, 3, 6, names);
    if (!posts) throw new PressHttpError(502, '글 형식이 맞지 않아요', 'ai');
    if (job.kind === 'event') posts[0] = { ...posts[0], tag: evTag(job.ev) };
    commit((x) => { x.news[job.key] = { at: Date.now(), posts }; });
    if (job.kind === 'event') markEvent(s.seed, job.ev.id, 'ai');
  } catch (e) {
    onFail(e);
    if (job.kind === 'event') markEvent(s.seed, job.ev.id, 'tpl');
  } finally {
    setGen(null);
  }
}
let pumping: Promise<void> | null = null;
/** 만들 차례인 AI 글을 하나씩 (뉴스 화면이 보일 때 부른다 — 이미 돌고 있으면 그 약속을 돌려준다) */
export function pumpJobs(): Promise<void> {
  if (pumping) return pumping;
  pumping = (async () => {
    for (let i = 0; i < 6; i++) {
      const job = nextJob();
      if (!job || !lockTab(job.key)) break;
      try { await runJob(job); } finally { unlockTab(); }
    }
  })().finally(() => { pumping = null; });
  return pumping;
}

/* ═════════════ 감독 인터뷰 ═════════════ */
export interface IvMoment {
  moment: Moment; key: string; year: number;
  /** 효과가 붙는 경기 수 (0 = 효과 없음) */
  games: number;
  stage: SeriesId | '';
  title: string; sub: string;
  opp?: string; home?: boolean; date: string;
}
export const ivKey = (m: Moment, year: number, club = ME.teamId) => `iv:${m}:${year}:${club}`;
/** 지금 열 수 있는 인터뷰 자리 — 개막 전(내 첫 경기 전)이면 개막 미디어데이, 정규 시즌이 끝났으면 결산. 그 밖엔 null */
export function ivMomentOf(s: SeasonState = getSeason()): IvMoment | null {
  const year = yearOf(s);
  if (isOpenTime(s)) {
    const first = firstGameFrom(s, s.next);
    return {
      moment: 'open', key: ivKey('open', year), year, games: 3, stage: '',
      title: '개막 미디어데이',
      sub: first ? `${longDate(first.day.date)} ${teamById(first.opp).name}전 앞` : '개막을 앞두고',
      opp: first?.opp, home: first?.home, date: first?.day.date ?? allDays(s)[0]?.date ?? '',
    };
  }
  if (isOver(s)) {
    const rows = standingsOf(s);
    const post = postEntry(s, rows);
    const days = allDays(s);
    return {
      moment: 'close', key: ivKey('close', year), year, games: post.stage ? 3 : 0, stage: post.stage,
      title: post.stage ? '가을야구 출사표' : '시즌 결산 인터뷰',
      sub: post.stage ? `${post.seed}위 · ${SERIES_KO[post.stage]}${post.opp ? ` ${teamById(post.opp).short}전` : ''} 앞` : `${post.seed}위로 시즌을 마치고`,
      opp: post.opp, date: days[days.length - 1]?.date ?? '',
    };
  }
  return null;
}
/** 인터뷰 자료 (AI 요청 · 템플릿 질문이 같이 쓴다) */
export interface IvFacts { m: IvMoment; open: OpenFacts | null; close: CloseFacts | null; players: PlayerFact[]; topics: string[] }
export function ivFacts(m: IvMoment, s: SeasonState = getSeason()): IvFacts {
  if (m.moment === 'open') { const o = openFacts(s); return { m, open: o, close: null, players: o.players, topics: o.topics }; }
  const c = closeFacts(s);
  return { m, open: null, close: c, players: c.players, topics: c.topics };
}
function ivReq(f: IvFacts) {
  const c = f.close, o = f.open;
  return {
    v: 1, moment: f.m.moment, year: f.m.year, date: f.m.date || (o?.date ?? c?.date ?? ''), me: ME.teamId,
    lv: o?.lv ?? c?.lv, ovr: (o?.ovr ?? c?.ovr) || undefined,
    rank: c ? c.rank : undefined, rec: c ? [c.row.w, c.row.d, c.row.l] : undefined,
    opp: f.m.opp, home: f.m.home, stage: c ? c.post.stage : undefined,
    rival: o?.rival && o.first && o.first.opp === o.rival.id ? o.rival.name : undefined,
    players: f.players.slice(0, 13).map((p) => ({
      k: p.key, id: p.p.id, n: p.p.name, pos: p.pos === 'SP' || p.pos === 'CL' || p.pos === 'RP' ? p.pos : p.p.pos === 'P' ? 'P' : p.pos,
      c: Math.max(1, Math.min(5, Math.round(p.cond))), f: Math.max(0, Math.min(100, Math.round(p.fat))),
      inj: safeLine(p.inj, 24),
      note: safeLine(c ? p.line : [`종합 ${p.ovr}`, p.tags.includes('legend') ? `${gradeKo(p.grade)} 카드` : ''].filter(Boolean).join(' · '), 40),
    })),
    topics: f.topics.map((t) => safeLine(t, 70)).filter((t): t is string => !!t).slice(0, 5),
  };
}
/** 가상 매체 · 기자 (실제 언론사 이름 아님) — 인터뷰 기사와 리그 뉴스 목록(screens/press/feed)이 같이 쓴다 */
export const OUTLETS = ['한별스포츠', '별빛일보', '한별데일리', '9회말뉴스', '마운드통신', '외야석일보', '스탠드리포트', '불펜타임스', '그라운드저널', '베이스라인', '데일리볼', '다이아몬드뉴스'];
// 가상 기자 — 실제 인물과 겹치지 않게 드문 성으로 (게임 가상 선수 이름 규칙과 같게)
export const REPORTERS = ['남궁태식', '제갈서윤', '독고하람', '황보가람', '선우하율', '사공재민', '서문지후', '편세린', '탁준혁', '용채아', '반다온', '옥하진'];
function withReporters(key: string, qs: Omit<IvQ, 'by' | 'outlet'>[]): IvQ[] {
  const r = rng(`iv:${key}`);
  const outs = OUTLETS.slice().sort(() => r() - 0.5);
  const reps = REPORTERS.slice().sort(() => r() - 0.5);
  return qs.map((q, i) => ({ ...q, by: reps[i % reps.length], outlet: outs[i % outs.length] }));
}
const ivBusy = new Map<string, Promise<IvRec>>();
/** 인터뷰 시작 — 이미 있으면 그대로. AI 질문(되면) 또는 템플릿 질문 3개를 정해 둔다(다시 열어도 같은 질문).
 *  같은 인터뷰를 두 번 부르면(StrictMode 등) 처음 약속을 돌려준다 — AI 를 두 번 부르지 않게 */
export function beginInterview(m: IvMoment, local: (f: IvFacts) => Omit<IvQ, 'by' | 'outlet'>[]): Promise<IvRec> {
  const have = load().iv[m.key];
  if (have) return Promise.resolve(have);
  const busy = ivBusy.get(m.key);
  if (busy) return busy;
  const p = makeInterview(m, local).finally(() => { ivBusy.delete(m.key); });
  ivBusy.set(m.key, p);
  return p;
}
async function makeInterview(m: IvMoment, local: (f: IvFacts) => Omit<IvQ, 'by' | 'outlet'>[]): Promise<IvRec> {
  const f = ivFacts(m);
  let qs: Omit<IvQ, 'by' | 'outlet'>[] | null = null;
  let src: IvRec['src'] = 'tpl';
  if (aiReady() && (load().tries[m.key] ?? 0) < 2 && lockTab(m.key)) {
    commit((x) => { x.tries[m.key] = (x.tries[m.key] ?? 0) + 1; });
    setGen(m.key);
    try {
      const req = ivReq(f);
      const res = await postJson('/ai/interview', req, 25_000);
      qs = readQuestions(res, new Set(f.players.map((p) => p.p.id)), namesOf(req));
      if (qs) src = 'ai';
      else throw new PressHttpError(502, '질문 형식이 맞지 않아요', 'ai');
    } catch (e) {
      onFail(e);
    } finally {
      unlockTab();
      setGen(null);
    }
  }
  const fill = local(f);
  if (!qs) qs = fill;
  else if (qs.length < 3) {
    const used = new Set(qs.map((q) => q.target));
    qs = [...qs, ...fill.filter((q) => !q.target || !used.has(q.target))].slice(0, 3);
  }
  const again = load().iv[m.key]; // 기다리는 동안 다른 탭이 만들었으면 그것
  if (again) return again;
  const rec: IvRec = {
    key: m.key, moment: m.moment, year: m.year, club: ME.teamId, src, stage: m.stage, games: m.games,
    qs: withReporters(m.key, qs.slice(0, 3)), picks: qs.slice(0, 3).map(() => null), at: Date.now(),
  };
  commit((x) => { x.iv[m.key] = rec; });
  return rec;
}
/** 답 고르기 — 앞 질문부터 차례로, 한 번 고르면 못 바꾼다 */
export function answerInterview(key: string, qi: number, oi: number): void {
  commit((x) => {
    const r = x.iv[key];
    if (!r || r.picks[qi] != null || !r.qs[qi]?.opts[oi]) return;
    if (r.picks.slice(0, qi).some((p) => p == null)) return;
    r.picks = r.picks.map((p, i) => (i === qi ? oi : p));
    r.at = Date.now();
  });
}
export const ivDone = (r: IvRec | undefined) => !!r && r.picks.length > 0 && r.picks.every((p) => p != null);
export const ivOf = (key: string, sv: PressSaved = load()): IvRec | undefined => sv.iv[key];

/* ───────── 효과 (코드가 정함 — 작게, 그 몇 경기에만) ─────────
 *  감싸기(trust): 그 선수 주 능력 +2 (타자 컨택 · 파워 / 투수 제구 · 구위) · 겨냥한 선수가 없으면 타선 컨택 +1 · 마운드 제구 +1
 *  채찍(push):   그 선수 주 능력 하나 +3 대신 선구(타자) · 위기관리(투수) −1 · 없으면 타선 파워 +1 · 선구 −1 / 마운드 구위 +1 · 위기관리 −1
 *  여유(calm):   팀 전체 — 타자 선구 +1 · 투수 위기관리 +1
 *  쌓이면 선수 칸마다 −2 ~ +4, 팀 전체 칸마다 −1 ~ +2 까지 */
export function fxOfAnswer(type: AnsType, target: Player | undefined): FxItem[] {
  if (type === 'calm') return [{ pid: '*bat', k: 'eye', v: 1 }, { pid: '*pit', k: 'mnt', v: 1 }];
  if (target) {
    const pid = target.id, P = target.pos === 'P';
    if (type === 'trust') return P ? [{ pid, k: 'ctl', v: 2 }, { pid, k: 'stf', v: 2 }] : [{ pid, k: 'con', v: 2 }, { pid, k: 'pow', v: 2 }];
    return P ? [{ pid, k: 'stf', v: 3 }, { pid, k: 'mnt', v: -1 }] : [{ pid, k: 'pow', v: 3 }, { pid, k: 'eye', v: -1 }];
  }
  if (type === 'trust') return [{ pid: '*bat', k: 'con', v: 1 }, { pid: '*pit', k: 'ctl', v: 1 }];
  return [{ pid: '*bat', k: 'pow', v: 1 }, { pid: '*bat', k: 'eye', v: -1 }, { pid: '*pit', k: 'stf', v: 1 }, { pid: '*pit', k: 'mnt', v: -1 }];
}
/** 고른 답들 → 효과 (같은 칸은 더하고 범위 안으로) */
export function fxOfRec(r: IvRec): FxItem[] {
  const sum = new Map<string, FxItem>();
  r.qs.forEach((q, i) => {
    const oi = r.picks[i];
    if (oi == null) return;
    const opt = q.opts[oi];
    if (!opt) return;
    const t = q.target ? playerById(q.target) : undefined;
    for (const fx of fxOfAnswer(opt.type, t)) {
      const k = `${fx.pid}|${fx.k}`;
      const cur = sum.get(k);
      sum.set(k, { ...fx, v: (cur?.v ?? 0) + fx.v });
    }
  });
  return [...sum.values()].map((fx) => ({ ...fx, v: fx.pid.startsWith('*') ? Math.max(-1, Math.min(2, fx.v)) : Math.max(-2, Math.min(4, fx.v)) })).filter((fx) => fx.v !== 0);
}

/** 지금 계산하는 경기에 붙는 인터뷰 (없으면 null)
 *  · 개막 미디어데이: 내 정규 시즌 1~3번째 경기 — 새로 계산하는 경기(내 경기 수 < 3)거나, 지난 경기 다시 계산(store.lastSnap 그대로)이 3번째 안쪽일 때
 *  · 가을야구 출사표: 내 포스트시즌 1~3번째 경기 */
function fxRecFor(st: LineupState | undefined): IvRec | null {
  const s = getSeason();
  const sv = load();
  const year = yearOf(s);
  if (!isOver(s)) {
    const r = sv.iv[ivKey('open', year)];
    if (!r || !ivDone(r) || r.games <= 0) return null;
    const n = s.my.length;
    const replay = !!st && !!s.lastSnap && st === s.lastSnap.snap;
    return n < r.games || (replay && n <= r.games) ? r : null;
  }
  if (!s.post) return null;
  const r = sv.iv[ivKey('close', year)];
  if (!r || !ivDone(r) || r.games <= 0) return null;
  return myPostPlayed(s.post) < r.games ? r : null;
}
/**
 * 경기 엔진에 넣을 인터뷰 효과 (season/rosters 의 myRoster 가 부른다) — 선수 id → [{ k, v }] (세트덱 · 훈련과 같은 칸).
 * 인터뷰한 그 몇 경기에서만, 그 경기를 치르고 나면 저절로 끝난다.
 */
export function interviewFx(st: LineupState | undefined, players: Player[]): Map<string, { k: BatKey | PitKey; v: number }[]> {
  const out = new Map<string, { k: BatKey | PitKey; v: number }[]>();
  let r: IvRec | null = null;
  try { r = fxRecFor(st); } catch { r = null; }
  if (!r) return out;
  const fx = fxOfRec(r);
  if (!fx.length) return out;
  const put = (pid: string, k: BatKey | PitKey, v: number) => { const l = out.get(pid) ?? []; l.push({ k, v }); out.set(pid, l); };
  const seen = new Set<string>();
  for (const p of players) {
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    for (const x of fx) {
      if (x.pid === p.id || (x.pid === '*bat' && p.pos !== 'P') || (x.pid === '*pit' && p.pos === 'P')) put(p.id, x.k, x.v);
    }
  }
  return out;
}
/** 화면용 — 지금 남아 있는 인터뷰 효과 (몇 경기 남았나 · 효과 글) */
export interface ActiveFx { rec: IvRec; left: number; label: string; items: FxItem[] }
export function activeFx(s: SeasonState = getSeason(), sv: PressSaved = load()): ActiveFx | null {
  const year = yearOf(s);
  if (!isOver(s)) {
    const r = sv.iv[ivKey('open', year)];
    if (!r || !ivDone(r) || r.games <= 0 || s.my.length >= r.games) return null;
    return { rec: r, left: r.games - s.my.length, label: '개막 3연전', items: fxOfRec(r) };
  }
  const r = sv.iv[ivKey('close', year)];
  if (!r || !ivDone(r) || r.games <= 0) return null;
  const played = myPostPlayed(s.post);
  const me = ME.teamId;
  const out = !!s.post && (!!s.post.champion || s.post.series.some((x) => !!x.winner && x.winner !== me && (x.hi === me || x.lo === me)));
  if (played >= r.games || out) return null;
  return { rec: r, left: r.games - played, label: '가을야구 첫 3경기', items: fxOfRec(r) };
}
const STAT_KO: Record<BatKey | PitKey, string> = {
  con: '컨택', pow: '파워', gap: '장타', eye: '선구', spd: '주루', stl: '도루', def: '수비 범위', arm: '송구',
  vel: '구속', stf: '구위', brk: '변화', ctl: '제구', sta: '체력', rec: '회복', mnt: '위기관리',
};
/** 효과 글 — '독고현 제구 +2 · 구위 +2' · '타선 선구 +1' · '마운드 위기관리 +1' */
export function fxText(items: FxItem[]): string[] {
  const by = new Map<string, FxItem[]>();
  for (const x of items) by.set(x.pid, [...(by.get(x.pid) ?? []), x]);
  const sign = (v: number) => (v > 0 ? `+${v}` : `−${Math.abs(v)}`);
  const order = (pid: string) => (pid === '*bat' ? 1 : pid === '*pit' ? 2 : 0);
  return [...by.entries()].sort((a, b) => order(a[0]) - order(b[0])).map(([pid, xs]) => {
    const who = pid === '*bat' ? '타선' : pid === '*pit' ? '마운드' : playerById(pid)?.name ?? '선수';
    return `${who} ${xs.map((x) => `${STAT_KO[x.k]} ${sign(x.v)}`).join(' · ')}`;
  });
}
/** 날짜 짧게 (화면 · 템플릿) */
export const shortDay = (date: string) => (date ? shortDate(date) : '');
