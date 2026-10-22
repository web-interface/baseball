// 로비 채팅 연결 — 홈 로비 칸과 #/chat 이 연결 하나를 같이 쓴다 (WebSocket → Worker → Durable Object).
//  · 보이는 화면이 하나라도 있으면 연결, 다 사라지면 30초 뒤 끊는다(홈 ↔ 채팅을 오갈 때 다시 잇지 않게).
//  · 탭이 숨으면 60초 뒤 끊고, 다시 보이면 바로 잇는다. 끊기면 1·2·4·8·16·30초로 점점 길게 다시 시도.
//  · 30초마다 'ping' — 서버(DO)는 깨지 않고 런타임이 'pong' 으로 답한다. 10초 안에 아무 답이 없으면 끊긴 걸로 보고 다시 잇는다.
//  · 대화는 5분 뒤 사라진다 — 서버 시각 기준으로 6초 전부터 흐려지고 5분이 되면 목록에서 뺀다.
//  · 로그인 토큰은 주소에 넣지 않고 연결 뒤 첫 메시지(hello)로 보낸다.
import { chatSocketUrl, session } from '../../api';
import { TEAMS } from '../../game/mock';
import { FADE_MS, type ChatMsg, type ChatSource, type ChatState, type ConnStatus, type ReqResult, type ServerEvent } from './types';

const PING_MS = 30_000;
const PONG_WAIT = 10_000;
const IDLE_CLOSE = 30_000;
const HIDDEN_CLOSE = 60_000;
const ACK_WAIT = 12_000;
const BACKOFF = [1000, 2000, 4000, 8000, 16000, 30000];
const KEEP_LOCAL = 120;

let state: ChatState = {
  status: 'idle', loaded: false, msgs: [], fading: [], pending: [], online: null, me: null, meChecked: false,
  retryAt: null, notice: null, restore: null, ttl: 5 * 60_000, maxLen: 200, skew: 0,
};
const listeners = new Set<() => void>();
const set = (patch: Partial<ChatState>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };

let ws: WebSocket | null = null;
let refs = 0;
let attempt = 0;
let openedAt = 0;
let lastSendAt = 0;
let seq = 0;
let retryT = 0, idleT = 0, hiddenT = 0, pingT = 0, pongT = 0, sweepT = 0;
const ackT = new Map<string, number>();
const reqs = new Map<string, { res: (r: ReqResult) => void; t: number }>();

const now = () => Date.now();
const serverNow = () => now() + state.skew;
const visible = () => document.visibilityState !== 'hidden';
const netUp = () => navigator.onLine !== false;
const nextId = (p: string) => `${p}${now().toString(36)}${(++seq).toString(36)}`;

/** 구단 선택 화면에서 고른 내 구단 (localStorage 'bb.start') — 없으면 서버가 대전 기록의 구단을 쓴다 */
function myClub(): string | undefined {
  try {
    const raw = localStorage.getItem('bb.start');
    if (!raw) return undefined;
    const c = (JSON.parse(raw) as { club?: unknown }).club;
    return typeof c === 'string' && TEAMS.some((t) => t.id === c) ? c : undefined;
  } catch { return undefined; }
}

/* ───────── 연결 ───────── */

function hello(sock: WebSocket) {
  set({ meChecked: false });
  try { sock.send(JSON.stringify({ t: 'hello', token: session.get() ?? undefined, club: myClub() })); } catch { /* 닫히는 중 */ }
}

function connect() {
  clearTimeout(retryT); retryT = 0;
  if (ws) return;
  set({ status: 'connecting', retryAt: null });
  let sock: WebSocket;
  try { sock = new WebSocket(chatSocketUrl()); } catch { closed(); return; }
  ws = sock;
  sock.onopen = () => { if (ws === sock) { hello(sock); startPing(sock); } };
  sock.onmessage = (e) => { if (ws === sock) onData(e.data); };
  sock.onclose = () => { if (ws === sock) { ws = null; closed(); } };
  sock.onerror = () => { /* onclose 가 이어서 온다 */ };
}

/** 소켓을 버리고 (닫기 답을 기다리지 않음) 끊긴 뒤처리 */
function drop(sock: WebSocket) {
  if (ws !== sock) return;
  ws = null;
  try { sock.close(4000, 'gone'); } catch { /* */ }
  closed();
}

function closed() {
  stopPing();
  for (const p of state.pending) clearTimeout(ackT.get(p.cid));
  ackT.clear();
  const lost = state.pending.at(-1);
  for (const [, r] of reqs) { clearTimeout(r.t); r.res({ ok: false, text: '연결이 끊겼어요. 다시 해 주세요' }); }
  reqs.clear();
  if (openedAt && now() - openedAt > 15_000) attempt = 0; // 잘 붙어 있다 끊긴 거면 처음 간격부터
  openedAt = 0;
  set({
    pending: [], meChecked: false,
    ...(lost ? { notice: { text: '연결이 끊겨 보내지 못했어요', at: now() }, restore: { text: lost.text, at: now() } } : {}),
  });
  if (refs > 0 && visible() && netUp()) scheduleRetry();
  else set({ status: !netUp() ? 'offline' : refs > 0 ? 'paused' : 'idle', retryAt: null });
}

function scheduleRetry() {
  clearTimeout(retryT);
  const base = BACKOFF[Math.min(attempt, BACKOFF.length - 1)];
  const delay = Math.round(base * (0.8 + Math.random() * 0.4));
  attempt++;
  set({ status: 'retry', retryAt: now() + delay });
  retryT = window.setTimeout(() => { retryT = 0; ensure(); }, delay);
}

function ensure() {
  if (ws || retryT || refs === 0) return;
  if (!netUp()) { set({ status: 'offline', retryAt: null }); return; }
  if (!visible()) { set({ status: 'paused', retryAt: null }); return; }
  connect();
}

function stop(status: ConnStatus) {
  clearTimeout(retryT); retryT = 0;
  const s = ws;
  ws = null;
  if (s) { try { s.close(1000, 'bye'); } catch { /* */ } closed(); }
  set({ status, retryAt: null });
}

function startPing(sock: WebSocket) {
  stopPing();
  pingT = window.setInterval(() => {
    if (ws !== sock || sock.readyState !== WebSocket.OPEN) return;
    try { sock.send('ping'); } catch { drop(sock); return; }
    clearTimeout(pongT);
    pongT = window.setTimeout(() => drop(sock), PONG_WAIT);
  }, PING_MS);
}
function stopPing() { clearInterval(pingT); clearTimeout(pongT); pingT = 0; pongT = 0; }

/* ───────── 받은 것 ───────── */

function onData(raw: unknown) {
  clearTimeout(pongT); pongT = 0; // 무엇이든 오면 살아 있다
  if (raw === 'pong' || typeof raw !== 'string') return;
  let ev: ServerEvent;
  try { ev = JSON.parse(raw) as ServerEvent; } catch { return; }
  switch (ev.t) {
    case 'init': {
      openedAt = now();
      const skew = typeof ev.now === 'number' ? ev.now - now() : 0;
      // 서버가 지금 가진 것이 정답 — 끊긴 동안 지워진 줄도 정리된다
      set({
        status: 'open', loaded: true, retryAt: null, msgs: (ev.msgs ?? []).slice(-KEEP_LOCAL), online: ev.online ?? null,
        ttl: ev.ttl ?? state.ttl, maxLen: ev.maxLen ?? state.maxLen, skew,
      });
      sweep();
      break;
    }
    case 'me':
      set({ me: ev.me, meChecked: true });
      break;
    case 'msg': {
      const m = ev.m;
      const msgs = state.msgs.some((x) => x.id === m.id) ? state.msgs : [...state.msgs, m].sort((a, b) => a.id - b.id).slice(-KEEP_LOCAL);
      if (ev.cid) { clearTimeout(ackT.get(ev.cid)); ackT.delete(ev.cid); }
      set({ msgs, pending: ev.cid ? state.pending.filter((p) => p.cid !== ev.cid) : state.pending });
      sweep();
      break;
    }
    case 'del':
      set({ msgs: state.msgs.filter((x) => x.id !== ev.id) });
      sweep();
      break;
    case 'online':
      set({ online: ev.n });
      break;
    case 'ok':
      settle(ev.rid, { ok: true });
      break;
    case 'err':
      if (ev.rid) settle(ev.rid, { ok: false, text: ev.text });
      else if (ev.cid) failPending(ev.cid, ev.text);
      else set({ notice: { text: ev.text, at: now() } });
      break;
  }
}

function settle(rid: string | undefined, r: ReqResult) {
  if (!rid) return;
  const q = reqs.get(rid);
  if (!q) return;
  clearTimeout(q.t);
  reqs.delete(rid);
  q.res(r);
}

function failPending(cid: string, text: string) {
  clearTimeout(ackT.get(cid));
  ackT.delete(cid);
  const p = state.pending.find((x) => x.cid === cid);
  set({
    pending: state.pending.filter((x) => x.cid !== cid),
    notice: { text, at: now() },
    ...(p ? { restore: { text: p.text, at: now() } } : {}),
  });
}

/** 5분 지난 줄 빼기 · 곧 사라질 줄 흐리기 — 다음 바뀌는 때에 맞춰 한 번씩만 깨어난다 */
function sweep() {
  clearTimeout(sweepT); sweepT = 0;
  const t = serverNow();
  const ttl = state.ttl;
  const keep = state.msgs.filter((m) => t - m.ts < ttl);
  const fading = keep.filter((m) => t - m.ts >= ttl - FADE_MS).map((m) => m.id);
  if (keep.length !== state.msgs.length || fading.join() !== state.fading.join()) set({ msgs: keep, fading });
  let next = Infinity;
  for (const m of keep) {
    const fadeAt = m.ts + ttl - FADE_MS;
    next = Math.min(next, fadeAt > t ? fadeAt : m.ts + ttl);
  }
  if (next !== Infinity) sweepT = window.setTimeout(sweep, Math.max(100, next - t + 30));
}

/* ───────── 화면이 부르는 것 ───────── */

let wired = false;
function wire() {
  if (wired) return;
  wired = true;
  document.addEventListener('visibilitychange', () => {
    if (visible()) {
      clearTimeout(hiddenT); hiddenT = 0;
      sweep();
      if (refs > 0 && !ws) { attempt = 0; clearTimeout(retryT); retryT = 0; ensure(); }
    } else if (ws) {
      clearTimeout(hiddenT);
      hiddenT = window.setTimeout(() => { hiddenT = 0; if (!visible()) stop('paused'); }, HIDDEN_CLOSE);
    }
  });
  window.addEventListener('online', () => { if (refs > 0 && !ws) { attempt = 0; clearTimeout(retryT); retryT = 0; ensure(); } });
  window.addEventListener('offline', () => { if (ws) stop('offline'); else if (refs > 0) set({ status: 'offline', retryAt: null }); });
}

export const liveChat: ChatSource = {
  subscribe(l) { listeners.add(l); return () => { listeners.delete(l); }; },
  get: () => state,

  retain() {
    wire();
    refs++;
    clearTimeout(idleT); idleT = 0;
    ensure();
    let done = false;
    return () => {
      if (done) return;
      done = true;
      refs = Math.max(0, refs - 1);
      if (refs > 0) return;
      clearTimeout(idleT);
      idleT = window.setTimeout(() => { idleT = 0; if (refs === 0) stop('idle'); }, IDLE_CLOSE);
    };
  },

  send(raw) {
    const text = raw.replace(/\s+/g, ' ').trim();
    if (!text) return '내용을 써 주세요';
    if ([...text].length > state.maxLen) return `${state.maxLen}자까지 쓸 수 있어요`;
    if (!state.me) return state.meChecked || !ws ? '로그인하면 채팅할 수 있어요' : '로그인을 확인하는 중이에요. 잠시 뒤 보내 주세요';
    const sock = ws;
    if (!sock || sock.readyState !== WebSocket.OPEN || state.status !== 'open') return '연결되면 보낼 수 있어요';
    const wait = 3000 - (now() - lastSendAt);
    if (wait > 0) return `${Math.ceil(wait / 1000)}초 뒤에 보낼 수 있어요`;
    const cid = nextId('c');
    try { sock.send(JSON.stringify({ t: 'send', cid, text })); } catch { return '보내지 못했어요'; }
    lastSendAt = now();
    set({ pending: [...state.pending, { cid, text, ts: serverNow() }] });
    ackT.set(cid, window.setTimeout(() => failPending(cid, '답이 없어 보내지 못했어요'), ACK_WAIT));
    return null;
  },

  request(kind, id) {
    const sock = ws;
    if (!sock || sock.readyState !== WebSocket.OPEN) return Promise.resolve<ReqResult>({ ok: false, text: '연결되면 다시 해 주세요' });
    const rid = nextId('r');
    return new Promise<ReqResult>((res) => {
      const t = window.setTimeout(() => { reqs.delete(rid); res({ ok: false, text: '답이 없어요. 잠시 뒤 다시 해 주세요' }); }, 8000);
      reqs.set(rid, { res, t });
      try { sock.send(JSON.stringify({ t: kind, id, rid })); } catch { clearTimeout(t); reqs.delete(rid); res({ ok: false, text: '보내지 못했어요' }); }
    });
  },

  reauth() {
    if (ws && ws.readyState === WebSocket.OPEN) hello(ws);
  },

  reconnect() {
    attempt = 0;
    clearTimeout(retryT); retryT = 0;
    if (ws) drop(ws);
    clearTimeout(retryT); retryT = 0;
    ensure();
  },
};

/** 화면에 보일 메시지 — 숨긴 사람 빼기 */
export const visibleMsgs = (msgs: ChatMsg[], hidden: ReadonlySet<number>) => (hidden.size ? msgs.filter((m) => !hidden.has(m.uid)) : msgs);
