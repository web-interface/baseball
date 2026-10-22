// 로비 채팅 — Durable Object(SQLite 저장소, 무료 플랜 가능) + WebSocket 하이버네이션 API.
//  · 방은 하나('lobby'). 대화는 보낸 지 5분이 지나면 지운다 — 저장소에서도(알람으로 정리), 화면에서도(브라우저 타이머).
//    새로 들어온 사람에게는 최근 5분 안의 메시지(최대 50개)만 보낸다. 저장은 최근 100개까지.
//  · 아무도 말하지 않으면 DO 는 잠든다 — 잠든 동안은 시간 요금이 없다. 연결 유지용 'ping' 은 DO 를 깨우지 않고 런타임이 'pong' 으로 답한다.
//    DO 안에서 setTimeout·setInterval 을 쓰지 않는다(쓰면 잠들지 못한다). 메모리 값도 잠들면 사라지니 상태는 SQLite·소켓 꼬리표(attachment)에만.
//  · 로그인은 연결 뒤 첫 메시지 {t:'hello', token} 로 확인한다(주소에 토큰을 넣지 않는다). 로그인 안 했으면 읽기만.
//  · IP 는 받지도 저장하지도 않는다(Worker 가 필요한 머리글만 넘긴다). 메시지 줄에는 아이디·구단·시각·본문만.
//  · 신고는 본문 없이 '누가 · 누구를 · 언제'만 D1 chat_reports 에 7일. 1시간 안에 서로 다른 3명이 신고하면 그 사람은 1시간 동안 보내기 막힘.
import { DurableObject } from 'cloudflare:workers';

export interface ChatEnv {
  DB: D1Database;
  /** 시험용 — 대화 보관 시간(ms). 운영에는 넣지 않는다(기본 5분) */
  CHAT_TTL_MS?: string;
}

const TTL_MS = 5 * 60_000; // 대화는 5분 뒤 사라진다
const SWEEP_GAP_MS = 10_000; // 정리 알람은 10초에 한 번까지 (알람 1번 = 요청 1건)
const KEEP = 100; // 저장하는 최근 메시지 수 (5분 안이라도)
const ON_JOIN = 50; // 접속하면 보내는 수
const MAX_LEN = 200; // 글자 수 (코드 포인트)
const GAP_MS = 3000; // 사람당 3초에 1개
const PER_MIN = 15; // 사람당 1분에 15개
const REPEAT_MS = 120_000; // 이 안에 같은 말(최근 3개와 같음)은 막음
const ROOM_BURST = { n: 40, ms: 10_000 }; // 방 전체가 10초에 40개를 넘으면 잠깐 막음
const MAX_CONN = 1000; // 동시 연결 상한 (무료 한도 보호)
const MUTE = { reporters: 3, windowS: 3600, ms: 3600_000 };
const REPORTS_PER_HOUR = 10;
const REPORT_KEEP_S = 7 * 86400;
const CLUBS = ['dj', 'gj', 'dg', 'bs', 'sb', 'st', 'sh', 'ic', 'cw', 'sw'];

/** 소켓 꼬리표 — 잠들었다 깨어나도 남는다 (uid 0 = 로그인 안 함) */
interface Att { uid: number; name: string; club: string | null }
const ANON: Att = { uid: 0, name: '', club: null };

/** 시스템 메시지 형식 (나중을 위해) — 예: 왕조 완성 */
export type SysEvent =
  | { type: 'dynasty'; user: string; club: string | null; set: string }
  | { type: 'notice'; text: string };

type Row = { id: number; ts: number; uid: number; name: string; club: string | null; body: string; sys: string | null };
/** 화면으로 보내는 메시지 */
export interface WireMsg { id: number; ts: number; uid: number; name: string; club: string | null; text: string; kind?: 'sys'; sys?: SysEvent }

const toWire = (r: Row): WireMsg => {
  const m: WireMsg = { id: r.id, ts: r.ts, uid: r.uid, name: r.name, club: r.club, text: r.body };
  if (r.sys) { try { m.kind = 'sys'; m.sys = JSON.parse(r.sys) as SysEvent; } catch { /* 형식이 깨졌으면 글자만 */ } }
  return m;
};

const sysText = (e: SysEvent) => (e.type === 'dynasty' ? `${e.user} 감독이 ${e.set} 왕조를 완성했어요` : e.text);

const enc = new TextEncoder();
const sha256 = async (s: string) =>
  btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/* ───────── 글자 정리 · 욕설 가리기 ───────── */

// 보이지 않는 글자(폭 없는 공백·방향 바꾸기·한글 채움 문자)는 지운다 — 빈 메시지·뒤집힌 글자·금칙어 피하기 방지
const INVISIBLE = /[\u{AD}\u{34F}\u{61C}\u{115F}\u{1160}\u{17B4}\u{17B5}\u{180E}\u{200B}\u{200C}\u{200E}\u{200F}\u{202A}-\u{202E}\u{2060}-\u{2064}\u{2066}-\u{206F}\u{3164}\u{FEFF}\u{FFA0}]/gu;

export function clean(v: unknown): string {
  if (typeof v !== 'string') return '';
  let t = v.slice(0, 2000).normalize('NFC');
  t = t.replace(/[\r\n\t\v\f\u{2028}\u{2029}]+/gu, ' ').replace(INVISIBLE, '').replace(/[\x00-\x1F\x7F-\x9F]/g, '');
  t = t.replace(/(\p{M}{2})\p{M}+/gu, '$1'); // 결합 문자 탑 쌓기 막기
  t = t.replace(/(.)\1{9,}/gu, (_m, c: string) => c.repeat(10)); // 같은 글자는 10개까지
  return t.replace(/\s+/g, ' ').trim();
}

// 기본 금칙어 — 글자 사이에 숫자·기호를 끼워도 잡는다(띄어쓰기는 '도시 발전' 같은 말이 걸려서 뺐다).
// [단어, 뒤에 오면 봐주는 말]. '보지·자지·새끼·미친'처럼 평범한 말에 흔히 섞이는 건 넣지 않았다.
const BAD: [string, string?][] = [
  ['씨발'], ['시발', '점|역'], ['씨빨'], ['시빨'], ['씨바'], ['쓰발'], ['씨팔'], ['시팔'], ['씨펄'],
  ['씹새'], ['씹할'], ['씹년'], ['씹놈'], ['씹창'], ['씹팔'], ['좆'], ['존나'], ['존니'],
  ['병신'], ['븅신'], ['빙신'], ['병싄'], ['개새끼'], ['개새키'], ['개새기'], ['개색기'], ['개색끼'], ['개세끼'], ['개쉐이'], ['개쌔끼'],
  ['미친놈'], ['미친년'], ['지랄'], ['염병'], ['엠창'], ['앰창'], ['니애미'], ['니애비'], ['니미럴'], ['느금'], ['느개비'], ['애미뒤'], ['애비뒤'],
  ['썅'], ['쌍놈'], ['쌍년'], ['창녀'], ['화냥'], ['걸레년'], ['한남충'], ['김치녀'], ['맘충'], ['틀딱'],
  ['ㅅㅂ'], ['ㅆㅂ'], ['ㅄ'], ['ㅂㅅ'], ['ㅈㄹ'], ['ㅈㄴ'],
  ['fuck'], ['shit'], ['bitch'], ['asshole'], ['sibal'], ['ssibal'], ['tlqkf'], ['qudtls'], ['wlfkf'],
];
const SEP = "[\\d._\\-~!@#$%^&*()+=|\\\\/:;'\"<>,?`·ㆍ\\u{200D}]*";
const esc = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BAD_RE = new RegExp(
  BAD.map(([w, not]) => [...w].map(esc).join(SEP) + (not ? `(?!${not})` : '')).join('|'),
  'giu',
);

/** 금칙어를 별표로 — 글자 수는 그대로 */
export const maskBad = (t: string) => t.replace(BAD_RE, (m) => m.replace(/\S/gu, '*'));
/** 같은 말 비교용 — 띄어쓰기·기호·대소문자 무시 (기호뿐이면 그대로) */
const sameKey = (t: string) => t.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '') || t;

/* ───────── Worker 입구 — GET /chat/ws ───────── */

const DEFAULT_ORIGINS = ['https://web-interface.github.io'];

/** WebSocket 연결을 로비 방(DO)으로 넘긴다 — 브라우저 Origin 은 허용 목록·개발용 localhost 만 */
export async function chatConnect(req: Request, env: { CHAT: DurableObjectNamespace<LobbyChat>; ALLOWED_ORIGINS?: string }) {
  if ((req.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return new Response('WebSocket 으로 연결해 주세요', { status: 426 });
  const origin = req.headers.get('Origin');
  const allowed = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()) : DEFAULT_ORIGINS;
  if (origin && !allowed.includes(origin) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return new Response('허용되지 않은 곳이에요', { status: 403 });
  }
  // IP 같은 머리글은 넘기지 않는다
  return env.CHAT.getByName('lobby').fetch('https://lobby/ws', { headers: { Upgrade: 'websocket' } });
}

/* ───────── 로비 방 ───────── */

export class LobbyChat extends DurableObject<ChatEnv> {
  private sql: SqlStorage;
  private ttl: number;

  constructor(ctx: DurableObjectState, env: ChatEnv) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    const t = Number(env.CHAT_TTL_MS);
    this.ttl = Number.isFinite(t) && t >= 5_000 && t <= 3600_000 ? t : TTL_MS;
    // 첫 판(msgs 표, 7일 보관)에서 넘어올 때 한 번만 — 옛 표와 시험 때 남은 막힘을 지운다
    let old = false;
    try { this.sql.exec('SELECT 1 FROM msgs LIMIT 1').toArray(); old = true; } catch { /* 없음 — 이미 넘어옴 */ }
    if (old) {
      this.sql.exec('DROP TABLE msgs');
      this.sql.exec('DROP TABLE IF EXISTS mutes');
    }
    // gone = 1: 보낸 사람이 지운 줄 — 본문은 바로 비우고, 보내기 제한 계산용 시각만 5분 동안 남는다
    this.sql.exec(`CREATE TABLE IF NOT EXISTS lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      uid INTEGER NOT NULL,
      name TEXT NOT NULL,
      club TEXT,
      body TEXT NOT NULL,
      sys TEXT,
      gone INTEGER NOT NULL DEFAULT 0
    )`);
    this.sql.exec('CREATE TABLE IF NOT EXISTS mutes (uid INTEGER PRIMARY KEY, until INTEGER NOT NULL)');
    // 연결 유지 — 깨우지 않고 런타임이 바로 답한다 (시간 요금 없음)
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(req: Request): Promise<Response> {
    if ((req.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return new Response('WebSocket 만 받아요', { status: 426 });
    if (this.ctx.getWebSockets().length >= MAX_CONN) return new Response('채팅방이 꽉 찼어요', { status: 503 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(ANON);
    const now = this.expire();
    this.sql.exec('DELETE FROM mutes WHERE until < ?', now);
    this.json(server, { t: 'init', msgs: this.recent(ON_JOIN, now), online: this.online(), now, ttl: this.ttl, maxLen: MAX_LEN });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer) {
    if (typeof data !== 'string' || data.length > 4096) return this.err(ws, 'bad', '메시지 형식이 잘못됐어요');
    let m: { t?: unknown; [k: string]: unknown };
    try { m = JSON.parse(data); } catch { return this.err(ws, 'bad', '메시지 형식이 잘못됐어요'); }
    if (!m || typeof m !== 'object') return;
    const rid = typeof m.rid === 'string' && m.rid.length <= 40 ? m.rid : undefined;
    switch (m.t) {
      case 'hello': return this.hello(ws, m.token, m.club);
      case 'send': return this.send(ws, m.text, typeof m.cid === 'string' && m.cid.length <= 40 ? m.cid : undefined);
      case 'report': return this.report(ws, m.id, rid);
      case 'del': return this.del(ws, m.id, rid);
      default: return this.err(ws, 'bad', '모르는 요청이에요', { rid });
    }
  }

  async webSocketClose(ws: WebSocket) {
    // 닫기 답장은 런타임이 자동으로 한다(compatibility_date 2026-04-07 이후) — 남은 사람에게 접속 수만 알린다
    this.broadcastOnline(ws);
  }

  async webSocketError(ws: WebSocket) {
    this.broadcastOnline(ws);
  }

  /** 5분 지난 대화를 저장소에서 지우고, 남은 게 있으면 다음 정리를 예약한다 */
  async alarm() {
    this.expire();
    await this.scheduleSweep(true);
  }

  /** 시스템 메시지 — 나중에 서버가 부른다: env.CHAT.getByName('lobby').system({ type: 'dynasty', user, club, set }) */
  async system(ev: SysEvent): Promise<number> {
    const now = this.expire();
    const club = ev.type === 'dynasty' && ev.club && CLUBS.includes(ev.club) ? ev.club : null;
    const row = this.sql.exec<{ id: number }>(
      'INSERT INTO lines (ts, uid, name, club, body, sys) VALUES (?, 0, ?, ?, ?, ?) RETURNING id',
      now, '', club, sysText(ev), JSON.stringify(ev),
    ).one();
    this.sql.exec('DELETE FROM lines WHERE id <= ?', row.id - KEEP);
    await this.scheduleSweep();
    this.broadcast({ t: 'msg', m: toWire({ id: row.id, ts: now, uid: 0, name: '', club, body: sysText(ev), sys: JSON.stringify(ev) }) });
    return row.id;
  }

  /* ── 요청 ── */

  private async hello(ws: WebSocket, token: unknown, club: unknown) {
    let me: Att = ANON;
    let expired = false;
    if (typeof token === 'string' && /^[A-Za-z0-9_-]{20,200}$/.test(token)) {
      try {
        const row = await this.env.DB.prepare(
          `SELECT u.id, u.username, p.club_code AS club FROM sessions s JOIN users u ON u.id = s.user_id
           LEFT JOIN pvp_clubs p ON p.user_id = u.id WHERE s.token_hash = ? AND s.expires_at > ?`,
        ).bind(await sha256(token), Math.floor(Date.now() / 1000)).first<{ id: number; username: string; club: string | null }>();
        if (row) {
          const c = typeof club === 'string' && CLUBS.includes(club) ? club : row.club && CLUBS.includes(row.club) ? row.club : null;
          me = { uid: row.id, name: row.username, club: c };
        } else expired = true;
      } catch (e) {
        console.error('chat hello', e);
        this.err(ws, 'server', '로그인을 확인하지 못했어요. 잠시 뒤 다시 연결할게요');
      }
    }
    ws.serializeAttachment(me);
    this.json(ws, { t: 'me', me: me.uid ? me : null, expired });
    this.broadcastOnline();
  }

  private async send(ws: WebSocket, raw: unknown, cid?: string) {
    const me = (ws.deserializeAttachment() as Att | null) ?? ANON;
    if (!me.uid) return this.err(ws, 'login', '로그인하면 채팅할 수 있어요', { cid });
    const text = clean(raw);
    if (!text) return this.err(ws, 'empty', '내용을 써 주세요', { cid });
    if ([...text].length > MAX_LEN) return this.err(ws, 'long', `${MAX_LEN}자까지 쓸 수 있어요`, { cid });
    const now = this.expire();

    const mute = this.sql.exec<{ until: number }>('SELECT until FROM mutes WHERE uid = ?', me.uid).toArray()[0];
    if (mute && mute.until > now) {
      return this.err(ws, 'muted', `신고가 여러 번 들어와 ${Math.ceil((mute.until - now) / 60_000)}분 동안 채팅을 쉬어요`, { cid, wait: mute.until - now });
    }
    // 보내기 제한은 저장된 내 줄(지운 줄 포함)로 센다 — 잠들었다 깨어나도, 지우고 다시 보내도 그대로
    const mine = this.sql.exec<{ ts: number; body: string; gone: number }>(
      'SELECT ts, body, gone FROM lines WHERE uid = ? ORDER BY id DESC LIMIT ?', me.uid, PER_MIN,
    ).toArray();
    if (mine[0] && now - mine[0].ts < GAP_MS) {
      return this.err(ws, 'rate', '3초에 한 번 보낼 수 있어요', { cid, wait: GAP_MS - (now - mine[0].ts) });
    }
    if (mine.length >= PER_MIN && now - mine[PER_MIN - 1].ts < 60_000) {
      return this.err(ws, 'rate', `1분에 ${PER_MIN}개까지 보낼 수 있어요`, { cid, wait: 60_000 - (now - mine[PER_MIN - 1].ts) });
    }
    const body = maskBad(text);
    const key = sameKey(body);
    if (mine.slice(0, 3).some((r) => !r.gone && now - r.ts < REPEAT_MS && sameKey(r.body) === key)) {
      return this.err(ws, 'repeat', '같은 말을 잇달아 보낼 수 없어요', { cid });
    }
    const burst = this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM lines WHERE ts > ?', now - ROOM_BURST.ms).one().n;
    if (burst >= ROOM_BURST.n) return this.err(ws, 'busy', '채팅이 너무 빨라요. 잠시 뒤 다시 보내 주세요', { cid, wait: 3000 });

    const row = this.sql.exec<{ id: number }>(
      'INSERT INTO lines (ts, uid, name, club, body) VALUES (?, ?, ?, ?, ?) RETURNING id',
      now, me.uid, me.name, me.club, body,
    ).one();
    this.sql.exec('DELETE FROM lines WHERE id <= ?', row.id - KEEP); // 최근 100개만
    const m: WireMsg = { id: row.id, ts: now, uid: me.uid, name: me.name, club: me.club, text: body };
    this.broadcast({ t: 'msg', m }, ws, { t: 'msg', m, cid });
    await this.scheduleSweep();
  }

  private async report(ws: WebSocket, idRaw: unknown, rid?: string) {
    const me = (ws.deserializeAttachment() as Att | null) ?? ANON;
    if (!me.uid) return this.err(ws, 'login', '로그인하면 신고할 수 있어요', { rid });
    const id = Number(idRaw);
    if (!Number.isInteger(id) || id <= 0) return this.err(ws, 'bad', '메시지 번호가 잘못됐어요', { rid });
    this.expire();
    const row = this.sql.exec<{ uid: number; name: string }>('SELECT uid, name FROM lines WHERE id = ? AND gone = 0', id).toArray()[0];
    if (!row || !row.uid) return this.err(ws, 'gone', '이미 사라진 메시지예요', { rid });
    if (row.uid === me.uid) return this.err(ws, 'self', '내 메시지는 신고할 수 없어요', { rid });
    const nowS = Math.floor(Date.now() / 1000);
    const db = this.env.DB;
    try {
      const mineRecent = await db.prepare('SELECT COUNT(*) AS n FROM chat_reports WHERE reporter_id = ? AND created_at > ?')
        .bind(me.uid, nowS - 3600).first<{ n: number }>();
      if ((mineRecent?.n ?? 0) >= REPORTS_PER_HOUR) return this.err(ws, 'rate', `신고는 1시간에 ${REPORTS_PER_HOUR}번까지예요`, { rid });
      // 본문은 남기지 않는다 (대화는 5분 뒤 사라진다는 약속 · 개인정보 최소화) — 누가 · 누구를 · 언제만
      await db.batch([
        db.prepare('INSERT OR IGNORE INTO chat_reports (msg_id, reporter_id, target_id, target_name, created_at) VALUES (?, ?, ?, ?, ?)')
          .bind(id, me.uid, row.uid, row.name, nowS),
        db.prepare('DELETE FROM chat_reports WHERE created_at < ?').bind(nowS - REPORT_KEEP_S),
      ]);
      const r = await db.prepare('SELECT COUNT(DISTINCT reporter_id) AS n FROM chat_reports WHERE target_id = ? AND created_at > ?')
        .bind(row.uid, nowS - MUTE.windowS).first<{ n: number }>();
      if ((r?.n ?? 0) >= MUTE.reporters) {
        this.sql.exec(
          'INSERT INTO mutes (uid, until) VALUES (?, ?) ON CONFLICT (uid) DO UPDATE SET until = MAX(until, excluded.until)',
          row.uid, Date.now() + MUTE.ms,
        );
      }
    } catch (e) {
      console.error('chat report', e);
      return this.err(ws, 'server', '신고를 저장하지 못했어요. 잠시 뒤 다시 해 주세요', { rid });
    }
    this.json(ws, { t: 'ok', rid, what: 'report' });
  }

  /** 내 메시지 지우기 — 모두의 화면에서 사라지고 본문도 바로 지운다 */
  private del(ws: WebSocket, idRaw: unknown, rid?: string) {
    const me = (ws.deserializeAttachment() as Att | null) ?? ANON;
    if (!me.uid) return this.err(ws, 'login', '로그인해야 지울 수 있어요', { rid });
    const id = Number(idRaw);
    if (!Number.isInteger(id) || id <= 0) return this.err(ws, 'bad', '메시지 번호가 잘못됐어요', { rid });
    const gone = this.sql.exec<{ id: number }>(
      "UPDATE lines SET body = '', sys = NULL, gone = 1 WHERE id = ? AND uid = ? AND gone = 0 RETURNING id", id, me.uid,
    ).toArray();
    if (!gone.length) return this.err(ws, 'gone', '지울 수 없는 메시지예요', { rid });
    this.broadcast({ t: 'del', id });
    this.json(ws, { t: 'ok', rid, what: 'del' });
  }

  /* ── 5분 정리 ── */

  /** 5분 지난 줄을 지우고 지금 시각을 돌려준다 */
  private expire() {
    const now = Date.now();
    this.sql.exec('DELETE FROM lines WHERE ts <= ?', now - this.ttl);
    return now;
  }

  /** 가장 오래된 줄이 5분 되는 때에 알람 — 이미 알람이 있으면 그대로(새 줄은 더 늦게 만료) */
  private async scheduleSweep(force = false) {
    const oldest = this.sql.exec<{ ts: number }>('SELECT ts FROM lines ORDER BY id ASC LIMIT 1').toArray()[0];
    if (!oldest) return;
    if (!force && (await this.ctx.storage.getAlarm()) != null) return;
    await this.ctx.storage.setAlarm(Math.max(oldest.ts + this.ttl + 250, Date.now() + SWEEP_GAP_MS));
  }

  /* ── 보내기 도우미 ── */

  private recent(n: number, now: number): WireMsg[] {
    return this.sql.exec<Row>(
      'SELECT id, ts, uid, name, club, body, sys FROM lines WHERE gone = 0 AND ts > ? ORDER BY id DESC LIMIT ?', now - this.ttl, n,
    ).toArray().reverse().map(toWire);
  }

  /** 지금 보고 있는 사람 수 — 로그인한 사람은 탭이 여럿이어도 한 명 */
  private online(exclude?: WebSocket) {
    const users = new Set<number>();
    let anon = 0;
    for (const w of this.ctx.getWebSockets()) {
      if (w === exclude || w.readyState === 2 || w.readyState === 3) continue; // 닫히는 중
      const a = w.deserializeAttachment() as Att | null;
      if (a?.uid) users.add(a.uid); else anon++;
    }
    return users.size + anon;
  }

  private broadcastOnline(exclude?: WebSocket) {
    const s = JSON.stringify({ t: 'online', n: this.online(exclude) });
    for (const w of this.ctx.getWebSockets()) if (w !== exclude) { try { w.send(s); } catch { /* 닫히는 중 */ } }
  }

  private broadcast(obj: unknown, self?: WebSocket, selfObj?: unknown) {
    const s = JSON.stringify(obj);
    const mine = selfObj ? JSON.stringify(selfObj) : s;
    for (const w of this.ctx.getWebSockets()) { try { w.send(w === self ? mine : s); } catch { /* 닫히는 중 */ } }
  }

  private json(ws: WebSocket, obj: unknown) {
    try { ws.send(JSON.stringify(obj)); } catch { /* 닫히는 중 */ }
  }

  private err(ws: WebSocket, code: string, text: string, opt: { cid?: string; rid?: string; wait?: number } = {}) {
    this.json(ws, { t: 'err', code, text, ...opt });
  }
}
