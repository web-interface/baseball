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

async function call<T>(method: 'GET' | 'POST', path: string, data?: unknown): Promise<T> {
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
};
