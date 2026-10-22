// 야구 게임 서버 (Cloudflare Worker) — 로그인 · 저장(D1) · Claude 호출
// 비밀값(Claude 열쇠 ANTHROPIC_API_KEY, 비밀번호 후추 PEPPER)은 Worker 비밀값으로만 둔다. 사이트에는 없다.
import Anthropic from '@anthropic-ai/sdk';

export interface Env {
  DB: D1Database;
  ANTHROPIC_API_KEY?: string;
  PEPPER?: string;
  ALLOWED_ORIGINS?: string; // 쉼표로 구분
  AI_BUDGET_USD?: string; // 전체 누적 사용액 상한 (달러) — 넘으면 Claude 를 부르지 않는다
  AI_DAILY_CALLS?: string; // 한 사람 하루 AI 호출 한도
}

const DEFAULT_ORIGINS = ['https://web-interface.github.io', 'http://localhost:5173', 'http://127.0.0.1:5173'];
const SESSION_DAYS = 30;
const MAX_FAILS = 5; // 이만큼 틀리면
const LOCK_SEC = 15 * 60; // 이만큼 잠근다

const enc = new TextEncoder();
const b64u = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sha256 = async (s: string) => b64u(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const randomToken = (n = 32) => b64u(crypto.getRandomValues(new Uint8Array(n)));
const now = () => Math.floor(Date.now() / 1000);
/** 길이가 같으면 끝까지 비교 (시간 차로 정답을 짐작하지 못하게) */
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
/** 복구 코드: 헷갈리는 글자(0·O·1·I) 없이 4글자씩 4묶음 */
function recoveryCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const s = [...bytes].map((b) => A[b % A.length]).join('');
  return s.match(/.{4}/g)!.join('-');
}
const normCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '');

const USER_RE = /^[A-Za-z0-9가-힣_]{3,16}$/;
const KEY_RE = /^[A-Za-z0-9_-]{43}$/; // 브라우저가 PBKDF2 로 만든 32바이트 키 (base64url)

// 같은 곳에서 1분에 너무 많이 시도하면 막는다 (Worker 메모리 기준 — 대략적)
const hits = new Map<string, { start: number; n: number }>();
function tooMany(ip: string, max: number) {
  const t = Date.now();
  let h = hits.get(ip);
  if (!h || t - h.start > 60_000) { h = { start: t, n: 0 }; hits.set(ip, h); }
  h.n++;
  if (hits.size > 5000) for (const [k, v] of hits) if (t - v.start > 60_000) hits.delete(k);
  return h.n > max;
}

class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  const allowed = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()) : DEFAULT_ORIGINS;
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
const json = (obj: unknown, status: number, cors: Record<string, string>) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors } });

async function body<T>(req: Request): Promise<T> {
  try { return (await req.json()) as T; } catch { throw new HttpError(400, '요청 형식이 잘못됐어요'); }
}

async function newSession(env: Env, userId: number) {
  const token = randomToken();
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256(token), userId, now() + SESSION_DAYS * 86400).run();
  return token;
}

async function currentUser(req: Request, env: Env) {
  const m = (req.headers.get('Authorization') || '').match(/^Bearer ([A-Za-z0-9_-]{20,})$/);
  if (!m) throw new HttpError(401, '로그인이 필요해요');
  const row = await env.DB.prepare(
    'SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?',
  ).bind(await sha256(m[1]), now()).first<{ id: number; username: string }>();
  if (!row) throw new HttpError(401, '로그인이 만료됐어요. 다시 로그인해 주세요');
  return row;
}

function pepper(env: Env) {
  if (!env.PEPPER || env.PEPPER.length < 16) throw new HttpError(500, '서버 설정(PEPPER)이 아직 없어요');
  return env.PEPPER;
}

async function register(req: Request, env: Env) {
  const { username, key } = await body<{ username?: string; key?: string }>(req);
  if (!username || !USER_RE.test(username)) throw new HttpError(400, '아이디는 3~16자 (한글·영문·숫자·_)로 정해 주세요');
  if (!key || !KEY_RE.test(key)) throw new HttpError(400, '비밀번호 처리에 문제가 있어요');
  const p = pepper(env);
  if (await env.DB.prepare('SELECT 1 FROM users WHERE username = ?').bind(username).first()) throw new HttpError(409, '이미 있는 아이디예요');
  const salt = randomToken(16);
  const code = recoveryCode();
  const res = await env.DB.prepare('INSERT INTO users (username, pw_hash, salt, recovery_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(username, await sha256(p + salt + key), salt, await sha256(p + salt + normCode(code)), now()).run();
  const token = await newSession(env, Number(res.meta.last_row_id));
  return { token, username, recoveryCode: code };
}

async function checkPassword(env: Env, username: string, secret: string, field: 'pw_hash' | 'recovery_hash') {
  const p = pepper(env);
  const u = await env.DB.prepare('SELECT id, username, pw_hash, recovery_hash, salt, failed, locked_until FROM users WHERE username = ?')
    .bind(username).first<{ id: number; username: string; pw_hash: string; recovery_hash: string; salt: string; failed: number; locked_until: number }>();
  const fail = new HttpError(401, field === 'pw_hash' ? '아이디 또는 비밀번호가 맞지 않아요' : '아이디 또는 복구 코드가 맞지 않아요');
  if (!u) { await sha256(p + 'x' + secret); throw fail; } // 없는 아이디도 같은 시간이 걸리게
  if (u.locked_until > now()) throw new HttpError(429, `너무 많이 틀려서 잠겼어요. ${Math.ceil((u.locked_until - now()) / 60)}분 뒤에 다시 해 주세요`);
  if (!same(await sha256(p + u.salt + secret), u[field])) {
    const failed = u.failed + 1;
    await env.DB.prepare('UPDATE users SET failed = ?, locked_until = ? WHERE id = ?')
      .bind(failed >= MAX_FAILS ? 0 : failed, failed >= MAX_FAILS ? now() + LOCK_SEC : 0, u.id).run();
    throw fail;
  }
  if (u.failed) await env.DB.prepare('UPDATE users SET failed = 0 WHERE id = ?').bind(u.id).run();
  return u;
}

async function login(req: Request, env: Env) {
  const { username, key } = await body<{ username?: string; key?: string }>(req);
  if (!username || !key || !KEY_RE.test(key)) throw new HttpError(400, '아이디와 비밀번호를 넣어 주세요');
  const u = await checkPassword(env, username, key, 'pw_hash');
  return { token: await newSession(env, u.id), username: u.username };
}

/** 비밀번호를 잊었을 때 — 복구 코드로 새 비밀번호 (복구 코드도 새로 준다, 다른 기기 로그인은 모두 끝낸다) */
async function reset(req: Request, env: Env) {
  const { username, recoveryCode: code, key } = await body<{ username?: string; recoveryCode?: string; key?: string }>(req);
  if (!username || !code || !key || !KEY_RE.test(key)) throw new HttpError(400, '아이디·복구 코드·새 비밀번호를 넣어 주세요');
  const u = await checkPassword(env, username, normCode(code), 'recovery_hash');
  const p = pepper(env);
  const salt = randomToken(16);
  const next = recoveryCode();
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET pw_hash = ?, salt = ?, recovery_hash = ? WHERE id = ?')
      .bind(await sha256(p + salt + key), salt, await sha256(p + salt + normCode(next)), u.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id),
  ]);
  return { token: await newSession(env, u.id), username: u.username, recoveryCode: next };
}

// Claude 는 Sonnet 5.5 하나만 쓴다 (사용자 지시 — 다른 모델 금지)
const MODEL = 'claude-sonnet-5-5';
const PRICE_IN = 2 / 1e6, PRICE_OUT = 10 / 1e6; // 달러/토큰 (생각 토큰도 출력에 포함돼 계산된다)
const MAX_TOKENS = 1024;

/** 지금까지 모든 사용자가 쓴 금액 (달러) */
async function spentUsd(env: Env) {
  const r = await env.DB.prepare('SELECT COALESCE(SUM(in_tokens), 0) AS i, COALESCE(SUM(out_tokens), 0) AS o FROM ai_usage').first<{ i: number; o: number }>();
  return (r?.i ?? 0) * PRICE_IN + (r?.o ?? 0) * PRICE_OUT;
}

/** 조직 크레딧($200)을 넘지 않게 — 이번 호출이 최대로 써도 상한 안일 때만 통과. 설정이 없으면 막는다 */
async function checkBudget(env: Env, maxOut: number) {
  const cap = Number(env.AI_BUDGET_USD);
  if (!Number.isFinite(cap) || cap <= 0) throw new HttpError(503, 'AI 예산 설정이 없어서 Claude 를 쓰지 않아요');
  if ((await spentUsd(env)) + 4000 * PRICE_IN + maxOut * PRICE_OUT > cap) throw new HttpError(503, '이번 달 AI 예산을 다 써서 Claude 를 멈췄어요');
}

/** 연결 확인용 Claude 호출 — 한 사람 하루 한도와 전체 예산 안에서만 */
async function aiPing(req: Request, env: Env) {
  const user = await currentUser(req, env);
  if (!env.ANTHROPIC_API_KEY) throw new HttpError(503, 'Claude 열쇠(ANTHROPIC_API_KEY)가 아직 없어요');
  const day = new Date().toISOString().slice(0, 10);
  const limit = Number(env.AI_DAILY_CALLS || 20);
  const used = await env.DB.prepare('SELECT calls FROM ai_usage WHERE user_id = ? AND day = ?').bind(user.id, day).first<{ calls: number }>();
  if ((used?.calls ?? 0) >= limit) throw new HttpError(429, `오늘 AI 사용 한도(${limit}번)를 다 썼어요. 내일 오전 9시에 다시 채워져요`);
  await checkBudget(env, MAX_TOKENS);

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const model = MODEL;
  let msg: Anthropic.Message;
  try {
    msg = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      output_config: { effort: 'low' },
      system: '너는 웹 야구 매니지먼트 게임의 문자 중계 캐스터다. 한국어로, 짧고 생생하게.',
      messages: [{ role: 'user', content: '연결 테스트예요. 9회 말 2사 만루에서 터진 끝내기 안타를 두 문장으로 중계해 주세요.' }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new HttpError(502, 'Claude 열쇠가 맞지 않아요');
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(503, 'Claude 사용량 한도에 걸렸어요. 잠시 뒤 다시 해 주세요');
    if (e instanceof Anthropic.APIError) throw new HttpError(502, `Claude 오류 (${e.status ?? '연결'})`);
    throw e;
  }
  const text = msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n').trim();
  await env.DB.prepare(
    `INSERT INTO ai_usage (user_id, day, calls, in_tokens, out_tokens) VALUES (?, ?, 1, ?, ?)
     ON CONFLICT (user_id, day) DO UPDATE SET calls = calls + 1, in_tokens = in_tokens + excluded.in_tokens, out_tokens = out_tokens + excluded.out_tokens`,
  ).bind(user.id, day, msg.usage.input_tokens, msg.usage.output_tokens).run();
  return { model, text, usage: { input: msg.usage.input_tokens, output: msg.usage.output_tokens }, left: limit - (used?.calls ?? 0) - 1 };
}

async function health(env: Env) {
  let db = false;
  try { db = !!(await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first()); } catch { db = false; }
  return { ok: true, service: 'baseball-api', db, ai: !!env.ANTHROPIC_API_KEY, pepper: !!env.PEPPER, model: MODEL };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(req.url);
    const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
    try {
      if (tooMany(ip, 120)) throw new HttpError(429, '요청이 너무 많아요. 잠시 뒤 다시 해 주세요');
      const route = `${req.method} ${url.pathname}`;
      if (route.startsWith('POST /auth/') && tooMany('auth:' + ip, 20)) throw new HttpError(429, '로그인 시도가 너무 많아요. 1분 뒤 다시 해 주세요');
      switch (route) {
        case 'GET /': case 'GET /health': return json(await health(env), 200, cors);
        case 'POST /auth/register': return json(await register(req, env), 200, cors);
        case 'POST /auth/login': return json(await login(req, env), 200, cors);
        case 'POST /auth/reset': return json(await reset(req, env), 200, cors);
        case 'POST /auth/logout': {
          const m = (req.headers.get('Authorization') || '').match(/^Bearer (.+)$/);
          if (m) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(m[1])).run();
          return json({ ok: true }, 200, cors);
        }
        case 'GET /me': { const u = await currentUser(req, env); return json({ username: u.username }, 200, cors); }
        case 'POST /ai/ping': return json(await aiPing(req, env), 200, cors);
        default: throw new HttpError(404, '없는 경로예요');
      }
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status, cors);
      console.error(e);
      return json({ error: '서버 오류가 났어요' }, 500, cors);
    }
  },
} satisfies ExportedHandler<Env>;
