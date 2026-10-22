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

export class ApiError extends Error { constructor(public status: number, msg: string) { super(msg); } }

async function call<T>(method: 'GET' | 'POST' | 'PUT', path: string, data?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (data !== undefined) headers['Content-Type'] = 'application/json';
  const t = session.get();
  if (t) headers.Authorization = `Bearer ${t}`;
  let res: Response;
  try {
    res = await fetch(API + path, { method, headers, body: data === undefined ? undefined : JSON.stringify(data) });
  } catch {
    throw new ApiError(0, '서버에 연결하지 못했어요');
  }
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (out as { error?: string }).error || `오류 ${res.status}`);
  return out as T;
}

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

  /* 비동기 대전 · 순위 (로그인 필요) */
  pvpPutMe: (snap: PvpSnapshot) => call<{ me: PvpClub }>('PUT', '/pvp/me', snap),
  pvpOpponents: () => call<PvpOpponentsRes>('GET', '/pvp/opponents'),
  /** 같은 requestId 로 다시 보내면 서버가 저장된 결과를 돌려준다(두 번 처리 안 함) — 연결이 끊기면 같은 번호로 다시 */
  pvpBattle: (opponentId: number, requestId: string) => call<PvpBattleRes>('POST', '/pvp/battle', { opponentId, requestId }),
  rankings: (by: RankingBy) => call<RankingsRes>('GET', `/rankings?by=${by}`),
};

/* ───────── 대전 · 순위 타입 ───────── */
export type PvpResult = 'W' | 'D' | 'L';
/** 라인업 한 칸 — 이름 · 카드 연도(2자리) · 선수 구단은 다시 보기 이름표용 */
export interface PvpLineupItem { id: string; pos: string; ovr: number; name?: string; y?: number; c?: string }
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
