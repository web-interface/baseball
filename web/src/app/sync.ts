// 기기 간 이어하기 — 게임 진행(localStorage 의 게임 열쇠)을 계정별로 서버(D1 · worker/src/save.ts)에 두고 기기끼리 맞춘다.
//  · 로그인 직후(App 의 status 'in'): 서버 판(GET /save/meta)과 이 기기를 견준다. 판단이 끝나기 전엔 화면 대신 '기록 불러오는 중'
//    (8초 넘게 서버가 없으면 이 기기 기록으로 그냥 진행 — 서버에 닿으면 그때 다시 판단).
//      서버에 없음                     → 이 기기에 게임이 있으면 전부 올리기
//      서버에 있음 + 이 기기에 게임 없음 → 전부 받아 쓰고 새로고침 (새 기기 — 새 구단을 만들지 않게)
//      판이 같음                       → 바뀐 열쇠만 올리기
//      서버가 앞섬 + 이 기기는 그 뒤 안 바뀜 → 받아서 새로고침
//      서버가 앞섬 + 이 기기도 바뀜      → 고르기 창(app/SyncChoice) — 다른 기기 쪽: 받아서 새로고침 · 이 기기 쪽: 강제로 올리기
//  · 진행 중: 15초마다 · 화면이 숨겨질 때 바뀐 열쇠만 올린다(해시 비교). 409 면 위의 '두 기기에서 따로 진행'. 실패는 조용히 다음에 다시.
//    화면으로 돌아오면(보이기 · 창 초점 · 연결 복구) 서버 판을 한 번 더 본다 — 다른 기기에서 이어 했으면 받아서 새로고침.
//  · 기기 상태 'bb.sync' { v:1, user, device, rev, hashes, at } — 다른 아이디로 로그인하면 새로(앞 아이디의 기록은 이 아이디로 올리지 않는다).
//  · 8KB 넘는 값은 gzip + base64 에 'gz1:' 머리를 붙여 올리고, 받을 때 푼다(못 하는 브라우저는 그대로 올린다).
//  · 올리는 열쇠는 SYNC_KEYS 만 — 기기 설정(테마 · 보기 방식 · 화면 기억 …)과 로그인 토큰(bb9.session · bb.user)은 올리지 않는다.
import { useSyncExternalStore } from 'react';
import { ApiError, api, type SaveAll, type SaveMeta, type SavePutRes } from '../api';
import { TEAMS, isTeamId, teamById } from '../game/mock';

/**
 * 동기화 열쇠 (게임 진행) — worker/src/save.ts SAVE_KEYS 와 같은 목록.
 * 지갑(GP · 골든볼)은 저장되지 않는다(game/wallet — 탭이 열린 동안만) — 올릴 것이 없다.
 */
export const SYNC_KEYS = [
  'bb.start', // 구단 선택 (구단 · 지명 · 특별 선수 설정) — 이게 있어야 '이 기기에 게임 있음'
  'bb.special', // 특별 선수
  'bb.starterKind', // 기본 선수단 종류 (레거시 · 실제 선수)
  'bb.league', // 리그 구성 표시 (부활 구단) — 빠지면 새 기기에서 시즌 기록이 지워진다(game/mock)
  'bb.inv', // 보유 카드 · 강화 · 훈련 · 라인업
  'bb.season.v2', // 시즌 진행
  'bb.box.v1', // 내 경기 기록
  'bb.ladder', // 리그 단계 · 시즌 연도
  'bb.tactics.v1', // 작전
  'bb.pot', // 잠재력
  'bb.career', // 게임 통산
  'bb.awards.v1', // 시상식
  'bb.press.v1', // 언론 (AI 뉴스 · 인터뷰)
  'bb.press.fast.v1', // 빨리 감기로 넘긴 날
  'bb.pvp.battles', // 대전 다시 보기
  'bb.autoQuota', // '한도까지 열기' 한도 · 쉬는 시간
  'bb.advice.v1', // AI 분석 (하루 횟수 · 지난 결과)
] as const;
export type SyncKey = (typeof SYNC_KEYS)[number];
const KEYSET = new Set<string>(SYNC_KEYS);

const STATE_KEY = 'bb.sync';
/** 새로고침 뒤 한 번 보일 안내 (sessionStorage) */
const NOTE_KEY = 'bb.sync.note';
const TICK_MS = 15_000;
const GATE_MS = 8_000;
/** 화면으로 돌아올 때 서버 판 보기 — 이 간격 안엔 한 번만 */
const SHOW_GAP = 10_000;
/** 바뀐 게 없어도 화면이 보이는 동안 이만큼 서버에 안 닿았으면 한 번 닿아 본다 — 다른 기기 로그인으로 끊겼는지 알아채게(요청 수를 아끼려고 2분) */
const IDLE_CHECK_MS = 120_000;
const ZIP_MIN = 8 * 1024;
const GZ = 'gz1:';
/** 리그 단계 이름 — season/league LEVEL_KO 와 같은 글 (그 모듈은 무거워서 여기선 부르지 않는다) */
export const LEVEL_KO: Record<string, string> = { trainee: '연습생', futures: '2군', first: '1군', allstar: '올스타', national: '국가대표', legend: '레전드' };

interface SyncState {
  v: 1;
  /** 이 기기 기록의 아이디 */
  user: string;
  /** 이 기기 (무작위 번호) */
  device: string;
  /** 마지막으로 맞춘 서버 판 */
  rev: number;
  /** 마지막으로 맞춘 값의 해시 (열쇠별 — 없는 열쇠는 빠짐) */
  hashes: Record<string, string>;
  /** 마지막으로 서버에 저장한(또는 받은) 때 */
  at: number;
  /** 받아서 새로고침한 판 — 새로고침 뒤 값이 받은 그대로인지 본다(닫히던 화면이 옛 값을 다시 썼으면 한 번 더 받는다) */
  pulled?: number;
  pullTries?: number;
  /** 받거나 지울 때마다 1씩 — 다른 탭이 보면 새로고침(옛 기록을 들고 있는 탭이 덮어쓰지 않게) */
  gen?: number;
}

/* ───────── 화면이 읽는 상태 ───────── */
export type SyncPhase = 'off' | 'wait' | 'ready' | 'conflict';
/** 고르기 창 한쪽 — 요약 · 마지막 저장 시각 */
export interface SyncSide { sum: SaveSummary | null; at: number | null }
export interface SyncConflict { remote: SyncSide; local: SyncSide; serverRev: number }
export interface SyncView {
  phase: SyncPhase;
  /** 화면을 보여도 되나 — 로그인 직후 판단이 끝났거나 8초가 지났다 */
  gate: boolean;
  /** 마지막으로 서버에 저장한 때 (없으면 0) */
  lastAt: number;
  /** 서버에 닿나 (마지막 시도 기준) */
  reach: 'ok' | 'fail' | 'unknown';
  /** 서버에 못 올리는 까닭 (크기 · 저장 공간 · 브라우저) — 설정 줄에 그대로 */
  problem: string | null;
  conflict: SyncConflict | null;
}
export type SyncResult = 'saved' | 'same' | 'pulled' | 'conflict' | 'offline' | 'error' | 'nogame' | 'off';

let view: SyncView = { phase: 'off', gate: false, lastAt: 0, reach: 'unknown', problem: null, conflict: null };
const listeners = new Set<() => void>();
function setView(p: Partial<SyncView>) {
  view = { ...view, ...p };
  listeners.forEach((l) => l());
}
export function useSync(): SyncView {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => view);
}

/* ───────── 저장소 · 상태 ───────── */
const getItem = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
function readState(): SyncState | null {
  try {
    const v = JSON.parse(getItem(STATE_KEY) ?? 'null') as SyncState | null;
    if (v && v.v === 1 && typeof v.user === 'string' && typeof v.device === 'string' && Number.isInteger(v.rev) && v.hashes && typeof v.hashes === 'object') return v;
  } catch { /* 깨졌으면 새로 */ }
  return null;
}
function writeState(st: SyncState) { try { localStorage.setItem(STATE_KEY, JSON.stringify(st)); } catch { /* 저장 공간이 차면 다음에 */ } }
const sameUser = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const newDevice = () => {
  try { return Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => b.toString(16).padStart(2, '0')).join(''); } catch { return 'd' + Date.now().toString(36); }
};
/** 새로고침 뒤 한 번 보일 안내 — App 이 화면을 열 때 토스트로 (app/SyncChoice) */
function note(text: string) { try { sessionStorage.setItem(NOTE_KEY, text); } catch { /* */ } }
export function takeSyncNote(): string | null {
  try { const t = sessionStorage.getItem(NOTE_KEY); if (t) sessionStorage.removeItem(NOTE_KEY); return t; } catch { return null; }
}

/** 문자열 해시 (cyrb53 + 길이) — 바뀐 열쇠 찾기용 */
function hashOf(str: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + '.' + str.length.toString(36);
}

/** 지금 이 기기의 동기화 열쇠 값 · 해시 — 한순간에 모두 읽는다(올릴 때 열쇠끼리 어긋나지 않게). 같은 글이면 지난 해시를 쓴다 */
interface Scan { vals: Partial<Record<SyncKey, string>>; hashes: Record<string, string> }
const memo = new Map<string, { raw: string; h: string }>();
function scan(): Scan {
  const vals: Partial<Record<SyncKey, string>> = {};
  const hashes: Record<string, string> = {};
  for (const k of SYNC_KEYS) {
    const raw = getItem(k);
    if (raw == null) { memo.delete(k); continue; }
    vals[k] = raw;
    const m = memo.get(k);
    let h: string;
    if (m && m.raw === raw) h = m.h;
    else { h = hashOf(raw); memo.set(k, { raw, h }); }
    hashes[k] = h;
  }
  return { vals, hashes };
}
const changedKeys = (cur: Record<string, string>, base: Record<string, string>): SyncKey[] =>
  SYNC_KEYS.filter((k) => (cur[k] ?? null) !== (base[k] ?? null));
/** 이 기기에 게임이 있나 — 구단을 골랐고(bb.start) 보유 카드가 생겼다(bb.inv) */
const hasGame = (vals: Scan['vals']) => !!vals['bb.start'] && !!vals['bb.inv'];

/* ───────── 요약 (고르기 창 · 서버 summary) ───────── */
export interface SaveSummary {
  club: string | null;
  team: string | null;
  year: number | null;
  /** 시즌 진행 — 친 날 · 정규 시즌 날 수 (날마다 모든 구단이 한 경기씩) */
  day: number;
  days: number;
  post: boolean;
  cards: number;
  level: string | null;
}
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
function summarize(vals: Scan['vals']): SaveSummary {
  const j = (k: SyncKey): Record<string, unknown> | null => {
    try { const v = JSON.parse(vals[k] ?? 'null') as unknown; return v && typeof v === 'object' ? (v as Record<string, unknown>) : null; } catch { return null; }
  };
  const start = j('bb.start'), season = j('bb.season.v2'), ladder = j('bb.ladder'), inv = j('bb.inv');
  const club = typeof start?.club === 'string' ? start.club : null;
  const per = num(season?.per) ?? 16;
  const days = per * (TEAMS.length - 1);
  let cards = 0;
  const list = inv?.cards;
  if (list && typeof list === 'object') for (const e of Object.values(list as Record<string, { n?: unknown }>)) { const n = num(e?.n); if (n && n > 0) cards += n; }
  return {
    club,
    team: club && isTeamId(club) ? teamById(club).name : null,
    year: num(season?.year) ?? num(ladder?.year) ?? (season ? 2027 : null),
    day: Math.min(num(season?.next) ?? 0, days),
    days,
    post: !!season?.post,
    cards,
    level: typeof ladder?.level === 'string' ? ladder.level : null,
  };
}
let sumMemo: { key: string; sum: SaveSummary } | null = null;
function summaryOf(cur: Scan): SaveSummary {
  const key = (['bb.start', 'bb.season.v2', 'bb.ladder', 'bb.inv'] as const).map((k) => cur.hashes[k] ?? '-').join('|');
  if (sumMemo?.key !== key) sumMemo = { key, sum: summarize(cur.vals) };
  return sumMemo.sum;
}
function parseSummary(s: string | null): SaveSummary | null {
  if (!s) return null;
  try {
    const v = JSON.parse(s) as Partial<SaveSummary>;
    if (!v || typeof v !== 'object') return null;
    return {
      club: typeof v.club === 'string' ? v.club : null, team: typeof v.team === 'string' ? v.team : null, year: num(v.year),
      day: num(v.day) ?? 0, days: num(v.days) ?? 144, post: !!v.post, cards: num(v.cards) ?? 0, level: typeof v.level === 'string' ? v.level : null,
    };
  } catch { return null; }
}

/* ───────── 압축 (8KB 넘는 값) ───────── */
function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function pack(v: string): Promise<string> {
  if (v.length <= ZIP_MIN || typeof CompressionStream !== 'function') return v;
  try {
    const zipped = new Blob([v]).stream().pipeThrough(new CompressionStream('gzip'));
    return GZ + toB64(new Uint8Array(await new Response(zipped).arrayBuffer()));
  } catch { return v; }
}
class UnzipError extends Error {}
async function unpack(v: string): Promise<string> {
  if (!v.startsWith(GZ)) return v;
  if (typeof DecompressionStream !== 'function') throw new UnzipError('풀 수 없는 브라우저');
  const raw = new Blob([fromB64(v.slice(GZ.length))]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(raw).text();
}

/* ───────── 서버 부르기 (시간 끊기) ───────── */
async function timed<T>(ms: number, f: (sig: AbortSignal) => Promise<T>): Promise<T> {
  const c = new AbortController();
  const t = window.setTimeout(() => c.abort(), ms);
  try { return await f(c.signal); } finally { window.clearTimeout(t); }
}
/** 같은 기기의 탭끼리 한 번에 하나만 (Web Locks — 없으면 그냥) */
async function locked<T>(fn: () => Promise<T>): Promise<T> {
  const lm = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (lm?.request) return (await lm.request('bb.sync', () => fn())) as T;
  return fn();
}

/* ───────── 한 번 로그인 동안의 동기화 ───────── */
interface Session {
  user: string;
  /** 이 기기 기록이 다른 아이디 것 — 이 아이디로 올리지 않는다(받거나 지운다) */
  foreign: boolean;
  /** 서버와 견줘 판단을 마쳤나 — 아니면 차례마다 판단부터 */
  decided: boolean;
  /** 서버에 못 올린다 (풀 수 없는 브라우저 · 저장 공간) — 이번 방문 동안 */
  blocked: boolean;
  /** '이 기기 기록'을 골랐는데 서버에 못 닿음 — 닿으면 강제로 올린다 */
  forceLocal: boolean;
  /** 받아서 새로고침한 뒤인데 값이 받은 것과 다르다 — 서버에 닿으면 한 번 더 받는다 */
  repull: boolean;
  fails: number;
  nextTry: number;
  lastShow: number;
  /** 마지막으로 서버가 답한 때 */
  lastContact: number;
  gen: number;
  device: string;
  queue: Promise<unknown>;
  ticking: boolean;
  dead: boolean;
}
let me: Session | null = null;
let cleanup: (() => void) | null = null;
let gateTimer = 0;
/** 이번 페이지에서 이미 판단을 마친 아이디 — 다시 로그인해도 '불러오는 중'을 또 보이지 않는다 */
let gateOpenFor: string | null = null;
let reloading = false;

const alive = (s: Session) => me === s && !s.dead && !reloading;
/** 한 세션 안의 일은 차례대로 (판단 · 올리기 · 받기가 겹치지 않게) */
function run(s: Session, fn: () => Promise<SyncResult>): Promise<SyncResult> {
  const p = s.queue.then(() => (alive(s) ? fn() : ('off' as const)), () => (alive(s) ? fn() : ('off' as const)));
  s.queue = p.catch(() => undefined);
  return p;
}
function stateFor(s: Session): SyncState {
  const st = readState();
  if (st && sameUser(st.user, s.user)) return st;
  return { v: 1, user: s.user, device: s.device, rev: 0, hashes: {}, at: 0, gen: st?.gen ?? 0 };
}
function openGate(s: Session) {
  if (!alive(s)) return;
  window.clearTimeout(gateTimer);
  gateOpenFor = s.user;
  if (!view.gate || view.phase === 'wait') setView({ gate: true, phase: view.phase === 'conflict' ? 'conflict' : 'ready' });
}
/** 서버에 못 닿음 · 오류 — 조용히, 다음 차례는 조금씩 늦게(최대 5분) */
function failed(s: Session, e: unknown): SyncResult {
  if (!alive(s)) return 'off';
  const st = e instanceof ApiError ? e.status : 0;
  if (st === 401) { openGate(s); s.dead = true; return 'off'; } // 로그인이 끝났다 — 화면은 열고, 다음 로그인 때 다시
  s.fails++;
  // 연결 끊김은 1분까지만 늘린다(다시 닿으면 곧 올리게) · 서버 오류는 5분까지
  s.nextTry = Date.now() + Math.min(st === 0 ? 60_000 : 300_000, TICK_MS * 2 ** Math.min(4, s.fails - 1));
  if (st === 413) { s.nextTry = Date.now() + 600_000; setView({ reach: 'ok', problem: (e as ApiError).message || '기록이 너무 커서 서버에 저장하지 못했어요' }); return 'error'; }
  setView({ reach: 'fail' }); // 연결 끊김 · 서버 오류 · 아직 배포 전(404) — 이 기기에만 저장 중
  return st === 0 || st >= 500 || st === 429 ? 'offline' : 'error';
}
function block(s: Session, problem: string): SyncResult {
  s.blocked = true;
  setView({ problem, reach: 'ok' });
  openGate(s);
  return 'error';
}

/** 서버 판과 견줘 정한다 (로그인 직후 · 화면으로 돌아올 때 · 지금 저장 · 판단 전 차례) */
async function decide(s: Session): Promise<SyncResult> {
  let meta: SaveMeta;
  try { meta = await timed(15_000, (sig) => api.saveMeta(sig)); } catch (e) { return failed(s, e); }
  if (!alive(s)) return 'off';
  window.clearTimeout(gateTimer); // 서버가 답했다 — 이제 '8초' 대신 받기 · 올리기가 끝날 때까지
  s.lastContact = Date.now();
  s.fails = 0;
  s.nextTry = 0;
  setView({ reach: 'ok' });
  const st = stateFor(s);
  const cur = scan();
  const dirty = changedKeys(cur.hashes, st.hashes);
  const game = hasGame(cur.vals);

  // 받아서 새로고침한 바로 뒤 — 값이 받은 그대로가 아니면(닫히던 화면이 옛 값을 다시 씀) 한 번 더 받는다
  if (st.pulled != null) {
    if (s.repull && dirty.length && (st.pullTries ?? 0) < 3) return pull(s, st, 'again');
    delete st.pulled; delete st.pullTries;
    writeState(st);
  }
  s.repull = false;

  if (s.foreign) {
    // 이 기기 기록은 다른 아이디 것 — 그 아이디 서버 저장에 있다
    if (meta.rev > 0) return pull(s, st, 'account');
    if (cur.vals['bb.start'] || cur.vals['bb.inv'] || cur.vals['bb.season.v2']) return wipe(s, st); // 새 아이디 — 구단 선택부터
    s.foreign = false;
    writeState(st);
  }
  if (s.forceLocal) {
    // '이 기기 기록'을 골랐는데 그때 서버에 못 닿았다 — 이제 올린다
    const r = await push(s, st, cur, SYNC_KEYS, meta.rev, true);
    if (r === 'saved') s.forceLocal = false;
    s.decided = true;
    openGate(s);
    return r;
  }
  if (meta.rev === 0) {
    s.decided = true;
    openGate(s);
    if (!game) return 'same';
    return push(s, st, cur, SYNC_KEYS.filter((k) => cur.vals[k] != null), 0, false); // 처음 올리기 — 이 기기 기록 전부
  }
  if (!game) return pull(s, st, 'new'); // 새 기기 — 서버 기록으로 (새 구단을 만들지 않게)
  if (meta.rev === st.rev) {
    s.decided = true;
    openGate(s);
    return dirty.length ? push(s, st, cur, dirty, st.rev, false) : 'same';
  }
  if (meta.rev > st.rev && !dirty.length) return pull(s, st, 'behind');
  // 두 기기에서 따로 진행 (서버 판이 이 기기보다 뒤인 드문 경우 — 서버 기록이 지워졌다 다시 생김 — 도 물어본다)
  return showConflict(s, meta, cur, st);
}

function showConflict(s: Session, meta: SaveMeta, cur: Scan, st: SyncState): SyncResult {
  if (!alive(s)) return 'off';
  s.decided = true;
  window.clearTimeout(gateTimer);
  setView({
    phase: 'conflict',
    conflict: {
      remote: { sum: parseSummary(meta.summary), at: meta.updatedAt || null },
      local: { sum: summaryOf(cur), at: st.at || null },
      serverRev: meta.rev,
    },
  });
  return 'conflict';
}

/** 올리기 — keys 중 값이 있는 열쇠는 그 값으로, 없는 열쇠는 서버에서 지운다. 값은 scan 때 읽은 한순간의 모습 그대로 */
async function push(s: Session, st: SyncState, cur: Scan, keys: readonly SyncKey[], base: number, force: boolean, keepalive = false): Promise<SyncResult> {
  if (s.blocked || !alive(s)) return s.blocked ? 'error' : 'off';
  if (!keys.length && !force) return 'same';
  const sent: Record<string, string | null> = {};
  const del: string[] = [];
  for (const k of keys) {
    const h = cur.hashes[k];
    sent[k] = h ?? null;
    if (h == null) del.push(k);
  }
  const set: Record<string, string> = {};
  for (const k of keys) { const v = cur.vals[k]; if (v != null) set[k] = await pack(v); }
  if (!alive(s)) return 'off';
  let r: SavePutRes;
  try {
    r = await timed(60_000, (sig) => api.savePut({ baseRev: base, device: st.device, summary: JSON.stringify(summaryOf(cur)), set, del, force }, { signal: sig, keepalive }));
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) return conflictFrom(s, e.data, cur);
    return failed(s, e);
  }
  if (!alive(s)) return 'off';
  // 맞춤 — 보낸 값의 해시로 (보내는 사이 또 바뀐 열쇠는 다음 차례에)
  const hashes = { ...st.hashes };
  for (const [k, h] of Object.entries(sent)) { if (h == null) delete hashes[k]; else hashes[k] = h; }
  const next: SyncState = { ...st, user: s.user, rev: r.rev, hashes, at: r.updatedAt || Date.now() };
  delete next.pulled; delete next.pullTries;
  writeState(next);
  s.fails = 0;
  s.foreign = false;
  s.lastContact = Date.now();
  setView({ reach: 'ok', lastAt: next.at, problem: null });
  return 'saved';
}

/** 409 — 그사이 서버 판이 바뀌었다 */
function conflictFrom(s: Session, data: unknown, cur: Scan): SyncResult {
  const d = (data ?? {}) as Partial<SaveMeta>;
  const meta: SaveMeta = { rev: num(d.rev) ?? 0, updatedAt: num(d.updatedAt) ?? 0, device: typeof d.device === 'string' ? d.device : null, summary: typeof d.summary === 'string' ? d.summary : null };
  const st = stateFor(s);
  if (st.rev === meta.rev) return 'same'; // 같은 기기의 다른 탭이 방금 맞췄다 — 다음 차례에
  if (meta.device && meta.device === st.device) {
    // 같은 기기의 다른 탭이 올리고 판을 못 적었다 — 기록은 이 기기 것이니 서버 판으로 맞추고 다음 차례에 전부 다시 올린다
    writeState({ ...st, rev: meta.rev, hashes: {} });
    return 'same';
  }
  return showConflict(s, meta, cur, st);
}

/** 받기 — 서버 기록을 전부 이 기기에 쓰고(서버에 없는 열쇠는 지움) 새로고침. 저장 공간이 모자라면 되돌린다 */
async function pull(s: Session, st: SyncState, why: 'new' | 'behind' | 'account' | 'conflict' | 'again'): Promise<SyncResult> {
  let all: SaveAll;
  try { all = await timed(30_000, (sig) => api.saveGet(sig)); } catch (e) { return failed(s, e); }
  if (!alive(s)) return 'off';
  if (!all.rev) { s.decided = true; openGate(s); return 'same'; } // 그사이 서버 기록이 없어졌다 — 이 기기 기록 그대로
  const vals: Record<string, string> = {};
  try {
    for (const [k, v] of Object.entries(all.keys)) if (KEYSET.has(k) && typeof v === 'string') vals[k] = await unpack(v);
  } catch (e) {
    if (e instanceof UnzipError) return block(s, '이 브라우저는 저장된 기록을 풀지 못해요 — 브라우저를 최신으로 바꿔 주세요');
    return block(s, '저장된 기록이 깨져 있어 불러오지 못했어요');
  }
  if (!alive(s)) return 'off';
  const before = SYNC_KEYS.map((k) => [k, getItem(k)] as const);
  try {
    for (const k of SYNC_KEYS) if (!(k in vals)) localStorage.removeItem(k);
    for (const k of SYNC_KEYS) if (k in vals) localStorage.setItem(k, vals[k]);
  } catch {
    try {
      for (const k of SYNC_KEYS) localStorage.removeItem(k);
      for (const [k, v] of before) if (v != null) localStorage.setItem(k, v);
    } catch { /* 되돌리기도 못 하면 그대로 */ }
    return block(s, '이 기기 저장 공간이 모자라 다른 기기 기록을 불러오지 못했어요');
  }
  const hashes: Record<string, string> = {};
  for (const [k, v] of Object.entries(vals)) hashes[k] = hashOf(v);
  writeState({
    v: 1, user: s.user, device: st.device, rev: all.rev, hashes, at: Date.now(),
    pulled: all.rev, pullTries: why === 'again' ? (st.pullTries ?? 0) + 1 : 1, gen: (st.gen ?? 0) + 1,
  });
  if (why !== 'again') {
    note(why === 'account' ? `${s.user} 감독의 기록을 불러왔어요` : why === 'new' ? '서버에 저장된 기록을 불러왔어요' : '다른 기기에서 이어 한 기록을 불러왔어요');
  }
  reloading = true;
  location.reload();
  return 'pulled';
}

/** 다른 아이디의 기록만 있는 기기에 새 아이디로 — 이 기기의 게임 열쇠를 지우고 새로고침(구단 선택부터). 앞 아이디 기록은 그 아이디 서버 저장에 있다 */
function wipe(s: Session, st: SyncState): SyncResult {
  try { for (const k of SYNC_KEYS) localStorage.removeItem(k); } catch { /* */ }
  writeState({ v: 1, user: s.user, device: st.device, rev: 0, hashes: {}, at: 0, gen: (st.gen ?? 0) + 1 });
  reloading = true;
  location.reload();
  return 'pulled';
}

/** 바뀐 열쇠만 올리기 (판단 전이면 판단부터) — 차례대로 · 탭끼리 잠그고 */
function pushDirty(s: Session, keepalive = false): Promise<SyncResult> {
  return run(s, () => locked(async () => {
    if (s.blocked || view.phase === 'conflict') return 'same';
    if (!s.decided || s.forceLocal) return decide(s);
    const st = stateFor(s); // 잠근 뒤 다시 — 다른 탭이 그사이 맞췄을 수 있다
    const cur = scan();
    const dirty = changedKeys(cur.hashes, st.hashes);
    if (!dirty.length) return 'same';
    if (!hasGame(cur.vals)) return 'nogame'; // 구단을 아직 안 고른 새 감독 — 올리지 않는다
    return push(s, st, cur, dirty, st.rev, false, keepalive);
  }));
}

/** 차례 (15초마다 · 화면이 숨겨질 때) */
async function tick(s: Session, keepalive = false): Promise<void> {
  if (!alive(s) || s.ticking || s.blocked || view.phase === 'conflict' || Date.now() < s.nextTry) return;
  if (s.decided && !s.forceLocal) {
    // 미리 보기 — 바뀐 게 없으면 잠그지도 않는다
    const cur = scan();
    if (!hasGame(cur.vals) || !changedKeys(cur.hashes, stateFor(s).hashes).length) {
      // 바뀐 게 없어도 화면이 보이는 채로 오래 서버에 안 닿았으면 한 번 — 다른 기기 로그인으로 끊겼으면 팝업이 뜨게
      if (!keepalive && document.visibilityState === 'visible' && Date.now() - s.lastContact >= IDLE_CHECK_MS) check(s);
      return;
    }
  }
  s.ticking = true;
  try { await pushDirty(s, keepalive); } finally { s.ticking = false; }
}

/** 서버 판 한 번 보기 (화면으로 돌아옴 · 오래 안 닿음 · 다시 손댐) */
function check(s: Session) {
  if (!alive(s) || view.phase === 'conflict' || s.blocked) return;
  s.lastShow = Date.now();
  void run(s, () => locked(() => decide(s)));
}
function onShow(s: Session) {
  if (!alive(s) || Date.now() - s.lastShow < SHOW_GAP) return;
  s.nextTry = 0;
  check(s);
}
/** 손대면(누르기 · 키) — 15초 넘게 서버에 안 닿았으면 바로 한 번 (돌아온 기기에서 끊김 팝업이 곧바로 뜨게 · 10초에 한 번까지) */
function onInput(s: Session) {
  const t = Date.now();
  if (!alive(s) || !s.decided || t - s.lastContact < TICK_MS || t - s.lastShow < SHOW_GAP) return;
  check(s);
}

/**
 * 로그인하면 시작 (App) — 돌려준 함수로 멈춘다(로그아웃 · 아이디 바뀜).
 * offline: 로그인 확인 때 서버에 못 닿음 — 기다리지 않고 이 기기 기록으로 화면을 연다(닿으면 그때 판단).
 */
export function startSync(user: string, offline = false): () => void {
  stopSync();
  reloading = false;
  const prev = readState();
  const foreign = !!prev && !sameUser(prev.user, user);
  const s: Session = {
    user, foreign, decided: false, blocked: false, forceLocal: false, repull: false, fails: 0, nextTry: 0, lastShow: Date.now(), lastContact: 0,
    gen: prev?.gen ?? 0, device: !prev || foreign ? newDevice() : prev.device, queue: Promise.resolve(), ticking: false, dead: false,
  };
  me = s;
  // 받아서 새로고침한 바로 뒤면 — 값이 받은 그대로인지 지금(화면이 뜨기 전) 본다
  if (prev && !foreign && prev.pulled != null) s.repull = changedKeys(scan().hashes, prev.hashes).length > 0;
  const keep = gateOpenFor != null && sameUser(gateOpenFor, user);
  setView({ phase: 'wait', gate: keep || offline, lastAt: prev && !foreign ? prev.at : 0, reach: offline ? 'fail' : 'unknown', problem: null, conflict: null });
  const giveUp = () => {
    // 8초 넘게 서버가 답이 없다 — 이 기기 기록으로 그냥 진행(받은 직후 확인도 그만 — 이제부터 이 기기에서 바뀌는 것은 진짜 진행)
    if (!alive(s) || view.gate) return;
    s.repull = false;
    setView({ gate: true, phase: view.phase === 'conflict' ? 'conflict' : 'ready', reach: view.reach === 'unknown' ? 'fail' : view.reach });
  };
  if (offline) giveUp();
  else gateTimer = window.setTimeout(giveUp, GATE_MS);
  // 첫 판단 — 연결이 잠깐 끊긴 것이면 8초 안에서 몇 번 더 (서버가 답하면 받기 · 올리기가 끝날 때까지 기다린다)
  const t0 = Date.now();
  void run(s, async () => {
    for (;;) {
      const r = await locked(() => decide(s));
      const retry = r === 'offline' && alive(s) && !view.gate && Date.now() - t0 < GATE_MS - 2500;
      if (!retry) {
        if (r === 'offline' || r === 'error') giveUp();
        return r;
      }
      await new Promise((res) => window.setTimeout(res, 1500));
    }
  });

  const iv = window.setInterval(() => void tick(s), TICK_MS);
  const onVis = () => { if (document.visibilityState === 'hidden') void tick(s, true); else onShow(s); };
  const onFocus = () => onShow(s);
  // 다른 탭이 서버 기록을 받아 새로고침했다 — 이 탭은 옛 기록을 들고 있으니 따라 새로고침(덮어쓰지 않게)
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STATE_KEY || !e.newValue || reloading) return;
    try {
      const v = JSON.parse(e.newValue) as SyncState;
      if ((v.gen ?? 0) !== s.gen) { reloading = true; location.reload(); }
    } catch { /* */ }
  };
  const onPoke = () => onInput(s);
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('focus', onFocus);
  window.addEventListener('online', onFocus);
  window.addEventListener('storage', onStorage);
  window.addEventListener('pointerdown', onPoke, { capture: true, passive: true });
  window.addEventListener('keydown', onPoke, { capture: true, passive: true });
  cleanup = () => {
    window.clearInterval(iv);
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('online', onFocus);
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('pointerdown', onPoke, { capture: true });
    window.removeEventListener('keydown', onPoke, { capture: true });
  };
  return stopSync;
}

export function stopSync() {
  cleanup?.();
  cleanup = null;
  window.clearTimeout(gateTimer);
  if (me) me.dead = true;
  me = null;
  if (view.phase !== 'off') setView({ phase: 'off', conflict: null });
}

/** 고르기 창 — 다른 기기 기록(받아서 새로고침) · 이 기기 기록(강제로 올리기) */
export async function resolveConflict(side: 'remote' | 'local'): Promise<SyncResult> {
  const s = me;
  const c = view.conflict;
  if (!s || !c || !alive(s)) return 'off';
  return run(s, () => locked(async () => {
    const st = stateFor(s);
    if (side === 'remote') return pull(s, st, 'conflict');
    const r = await push(s, st, scan(), SYNC_KEYS, c.serverRev, true);
    if (r === 'saved' || r === 'offline' || r === 'error') {
      // 못 올렸으면 이 기기 기록으로 계속하고, 서버에 닿을 때 올린다 (창에 갇히지 않게)
      s.forceLocal = r !== 'saved';
      setView({ phase: 'ready', conflict: null });
      openGate(s);
    }
    return r;
  }));
}

/** 설정 '지금 저장' — 서버 판을 보고 바뀐 것을 바로 올린다(다른 기기가 앞서 있으면 받거나 묻는다) */
export async function saveNow(): Promise<SyncResult> {
  const s = me;
  if (!s || !alive(s)) return 'off';
  if (s.blocked) return 'error';
  if (!hasGame(scan().vals)) return 'nogame';
  s.nextTry = 0;
  s.lastShow = Date.now();
  return run(s, () => locked(() => decide(s)));
}

/** 로그아웃 전에 — 바뀐 것을 올려 둔다 (최대 ms 기다림) */
export async function flushSync(ms = 5000): Promise<void> {
  const s = me;
  if (!s || !alive(s) || !s.decided || s.forceLocal) return; // 판단 전이면 올리지 않는다 (받기 · 새로고침이 로그아웃을 막지 않게)
  s.nextTry = 0;
  await Promise.race([pushDirty(s), new Promise((r) => window.setTimeout(r, ms))]);
}

/* ───────── 화면 글 ───────── */
/** '방금' · 'n분 전' · 'n시간 전' · 'n일 전' */
export function agoText(t: number, now = Date.now()): string {
  const d = Math.max(0, now - t);
  if (d < 60_000) return '방금';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}분 전`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}시간 전`;
  return `${Math.floor(d / 86_400_000)}일 전`;
}
/** 설정 '기록 저장' 줄 작은 글 */
export function saveLineText(v: SyncView, now = Date.now()): string {
  if (v.phase === 'off') return '로그인하면 기록이 서버에 저장돼요';
  if (v.problem) return v.problem;
  if (v.reach === 'fail') return '이 기기에만 저장 중';
  if (getItem('bb.start') == null) return '구단을 고르면 서버에 저장돼요';
  if (v.lastAt) return `마지막 저장 ${agoText(v.lastAt, now)}`;
  return v.reach === 'ok' ? '곧 저장해요' : '서버 확인 중';
}
/** '지금 저장' 결과 토스트 */
export function saveNowToast(r: SyncResult): { text: string; tone: 'good' | 'info' | 'bad' } {
  switch (r) {
    case 'saved': return { text: '저장했어요', tone: 'good' };
    case 'same': return { text: '이미 저장돼 있어요', tone: 'info' };
    case 'pulled': return { text: '다른 기기에서 이어 한 기록을 불러와요', tone: 'info' };
    case 'conflict': return { text: '두 기기에서 따로 진행했어요 — 이어 할 기록을 골라 주세요', tone: 'info' };
    case 'offline': return { text: '서버에 닿지 않아 이 기기에만 저장했어요', tone: 'bad' };
    case 'nogame': return { text: '구단을 고르면 저장할 수 있어요', tone: 'info' };
    case 'off': return { text: '로그인하면 저장할 수 있어요', tone: 'info' };
    default: return { text: view.problem ?? '저장하지 못했어요. 잠시 뒤 다시 해 주세요', tone: 'bad' };
  }
}
