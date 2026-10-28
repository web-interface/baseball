// 서버(Cloudflare Worker) 호출 — 비밀번호는 브라우저에서 PBKDF2 로 바꾼 키만 보낸다
const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || 'https://baseball-api.get943.workers.dev';
const TOKEN_KEY = 'bb9.session';

const b64u = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** 비밀번호 → 32바이트 키 (아이디마다 다른 소금, 21만 번 반복) */
export async function passwordKey(username: string, password: string) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('baseball9:' + username.toLowerCase()), iterations: 210_000 },
    base, 256,
  );
  return b64u(bits);
}

export const session = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t: string) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* 사생활 보호 모드 */ } },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* */ } },
};

/** data — 서버가 오류와 함께 준 본문 (저장 409 의 서버 판 · 기기 · 요약 등) */
export class ApiError extends Error { constructor(public status: number, msg: string, public data?: unknown) { super(msg); } }

/** 로비 채팅 WebSocket 주소 — 로그인 토큰은 주소에 넣지 않고 연결 뒤 첫 메시지로 보낸다 (screens/chat) */
export const chatSocketUrl = () => API.replace(/^http/, 'ws') + '/chat/ws';

/** opts — signal: 시간 끊기(AbortController) · keepalive: 화면을 닫는 중에도 보내기(본문 64KB 이하일 때만) */
async function call<T>(method: 'GET' | 'POST' | 'PUT', path: string, data?: unknown, opts: { signal?: AbortSignal; keepalive?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (data !== undefined) headers['Content-Type'] = 'application/json';
  const t = session.get();
  if (t) headers.Authorization = `Bearer ${t}`;
  let res: Response;
  try {
    const body = data === undefined ? undefined : JSON.stringify(data);
    const keepalive = !!opts.keepalive && (body?.length ?? 0) < 60_000;
    res = await fetch(API + path, { method, headers, body, signal: opts.signal, keepalive });
  } catch {
    throw new ApiError(0, '서버에 연결하지 못했어요');
  }
  const out = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && (out as { code?: unknown }).code === 'replaced') markReplaced(t);
    throw new ApiError(res.status, (out as { error?: string }).error || `오류 ${res.status}`, out);
  }
  return out as T;
}

/* ───────── 다른 기기 로그인으로 끊김 (401 code 'replaced') — 같은 아이디는 한 기기에서만 ───────── */
const replacedFns = new Set<() => void>();
/** 끊겼을 때 부를 함수 등록 (app/auth 가 팝업을 띄운다) — 돌려준 함수로 해제 */
export function onReplaced(fn: () => void): () => void {
  replacedFns.add(fn);
  return () => { replacedFns.delete(fn); };
}
/** token — 그 요청(또는 채팅 hello)에 쓴 토큰. 지금 토큰과 다르면(이미 [확인] · 다시 로그인) 무시 */
export function markReplaced(token: string | null | undefined) {
  if (!token || session.get() !== token) return;
  replacedFns.forEach((f) => f());
}
export const isReplaced = (e: unknown) =>
  e instanceof ApiError && e.status === 401 && (e.data as { code?: unknown } | undefined)?.code === 'replaced';

export type Health = { ok: boolean; db: boolean; ai: boolean; pepper: boolean };
export type Auth = { token: string; username: string; recoveryCode?: string };
export type Ping = { model: string; text: string; usage: { input: number; output: number }; left: number };

export const api = {
  health: () => call<Health>('GET', '/health'),
  me: () => call<{ username: string }>('GET', '/me'),
  register: async (username: string, password: string) =>
    call<Auth>('POST', '/auth/register', { username, key: await passwordKey(username, password) }),
  login: async (username: string, password: string) =>
    call<Auth>('POST', '/auth/login', { username, key: await passwordKey(username, password) }),
  reset: async (username: string, recoveryCode: string, password: string) =>
    call<Auth>('POST', '/auth/reset', { username, recoveryCode, key: await passwordKey(username, password) }),
  logout: () => call<{ ok: boolean }>('POST', '/auth/logout', {}),
  aiPing: () => call<Ping>('POST', '/ai/ping', {}),
  /** 팀 분석 · 추천 (Claude — game/advice). 결과는 game/advice cleanAdvice 가 다시 거른다 */
  aiAdvice: (input: unknown) => call<unknown>('POST', '/ai/advice', input),

  /* 비동기 대전 · 순위 (로그인 필요) */
  pvpPutMe: (snap: PvpSnapshot) => call<{ me: PvpClub }>('PUT', '/pvp/me', snap),
  pvpOpponents: () => call<PvpOpponentsRes>('GET', '/pvp/opponents'),
  /** 같은 requestId 로 다시 보내면 서버가 저장된 결과를 돌려준다(두 번 처리 안 함) — 연결이 끊기면 같은 번호로 다시 */
  pvpBattle: (opponentId: number, requestId: string) => call<PvpBattleRes>('POST', '/pvp/battle', { opponentId, requestId }),
  rankings: (by: RankingBy) => call<RankingsRes>('GET', `/rankings?by=${by}`),

  /* 기기 간 이어하기 — 계정별 게임 진행 저장 (app/sync · worker/src/save.ts). 409 면 ApiError.data 가 서버 판(SaveMeta) */
  saveMeta: (signal?: AbortSignal) => call<SaveMeta>('GET', '/save/meta', undefined, { signal }),
  saveGet: (signal?: AbortSignal) => call<SaveAll>('GET', '/save', undefined, { signal }),
  savePut: (b: SavePutBody, opts: { signal?: AbortSignal; keepalive?: boolean } = {}) => call<SavePutRes>('PUT', '/save', b, opts),
};

/* ───────── 저장 타입 ───────── */
/** 서버 판 — rev 0 이면 아직 저장 없음. updatedAt 밀리초 · summary 는 JSON 글(app/sync SaveSummary) */
export interface SaveMeta { rev: number; updatedAt: number; device: string | null; summary: string | null }
export interface SaveAll { rev: number; updatedAt: number; keys: Record<string, string> }
export interface SavePutBody { baseRev: number; device: string; summary: string; set: Record<string, string>; del?: string[]; force?: boolean }
export interface SavePutRes { rev: number; updatedAt: number; written?: number }

/* ───────── 대전 · 순위 타입 ───────── */
export type PvpResult = 'W' | 'D' | 'L';
/** 라인업 한 칸 — 이름 · 카드 연도(2자리) · 선수 구단은 다시 보기 이름표용 */
export interface PvpLineupItem { id: string; pos: string; ovr: number; name?: string; y?: number; c?: string }
/** 서버는 선수 번호에 영문 · 숫자 · _ · - 만 받는다(worker/src/pvp.ts ID_RE) — 실제 선수 번호의 '~'(k559b15~2024)는 '_' 로 바꿔 보내고, 받을 때 되돌린다 */
export const toWireId = (id: string) => id.replace(/~/g, '_').slice(0, 24);
export const fromWireId = (id: string) => id.replace(/_(\d{4})$/, '~$1');
/** PUT /pvp/me — 대전 상대로 보일 내 구단 스냅샷 */
export interface PvpSnapshot { club: string; teamName: string; power: number; ovr: number; lineup: PvpLineupItem[] }
export interface PvpClub {
  userId: number; username: string; club: string; teamName: string;
  power: number; ovr: number; rating: number; w: number; d: number; l: number; updatedAt: number;
  lineup?: PvpLineupItem[];
}
export interface PvpToday { used: number; limit: number }
export interface PvpOpponentsRes { me: PvpClub | null; opponents: PvpClub[]; today: PvpToday }
export interface PvpGame {
  id: string; opponentId: number; myScore: number; oppScore: number; result: PvpResult; ratingDelta: number;
  /** 이닝별 점수 — away = 나(도전), home = 상대(null = 9회 말 공격 없음) */
  line: { away: number[]; home: (number | null)[] };
  createdAt: number;
  /** 같은 요청 번호로 다시 받은 저장된 결과 */
  replay: boolean;
}
export interface PvpBattleRes { game: PvpGame; me: PvpClub | null; opponent: PvpClub | null; today: PvpToday }
export type RankingBy = 'rating' | 'winrate' | 'power';
export interface RankingRow extends PvpClub { rank: number; value: number; me?: boolean }
export interface RankingsRes {
  by: RankingBy; minGames: number; total: number; rows: RankingRow[];
  me: (PvpClub & { rank: number | null; value: number }) | null;
}

/** 대전 요청 번호 (브라우저 난수) */
export const newRequestId = () =>
  (crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join(''));
