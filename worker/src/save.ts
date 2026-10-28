// 기기 간 이어하기 — 계정별 게임 진행 저장 (D1). 사이트(web/src/app/sync.ts)가 localStorage 의 게임 진행 열쇠를 그대로 올리고 받는다.
//  · 표 두 개(save_meta · save_kv)는 워커가 처음 쓸 때 스스로 만든다(CREATE TABLE IF NOT EXISTS — 원격 DB 명령을 따로 돌리지 않게). 같은 DDL 문서: schema-save.sql
//  · 판(rev): 올릴 때마다 1씩 오른다. 사이트는 마지막으로 맞춘 판(baseRev)을 같이 보내고, 그사이 다른 기기가 올렸으면(판이 다르면) 409 — 사이트가 고르기 창을 띄운다.
//  · 한 번 올리기 = D1 batch 한 묶음(원자적). 판 확인을 묶음 안에서 한 번 더 한다 — 두 기기가 같은 판에서 동시에 올려도 한쪽만 들어간다(나머지는 409).
//  · 검사: 열쇠는 허용 목록만 · 값 하나 1,500,000자 이하(D1 한 줄 2MB 한도 아래) · 사람마다 합계 10,000,000자 이하(넘으면 413) · 사람마다 1분 30번.
//  · D1 쓰기: 한 번 올리기에 save_meta 1줄 + 바뀐 열쇠마다 1줄(처음 생기는 열쇠는 기본 키 색인까지 2줄).

type User = { id: number; username: string };
export type SaveOut = { status: number; body: unknown };

/** 동기화 열쇠 — web/src/app/sync.ts SYNC_KEYS 와 같은 목록 (기기 설정 · 로그인 토큰은 넣지 않는다) */
export const SAVE_KEYS = [
  'bb.start', 'bb.special', 'bb.starterKind', 'bb.league', 'bb.inv', 'bb.season.v2', 'bb.box.v1', 'bb.ladder',
  'bb.tactics.v1', 'bb.pot', 'bb.career', 'bb.awards.v1', 'bb.press.v1', 'bb.press.fast.v1', 'bb.pvp.battles', 'bb.autoQuota', 'bb.advice.v1',
] as const;
const KEYSET = new Set<string>(SAVE_KEYS);

const MAX_VALUE = 1_500_000; // 값 하나 (글자)
const MAX_VALUE_BYTES = 1_900_000; // D1 한 줄 한도(2MB) 아래 — UTF-8 바이트
const MAX_TOTAL = 10_000_000; // 사람마다 합계 (글자)
const MAX_SUMMARY = 2048;
const MAX_BODY = 12_000_000;
const DEVICE_RE = /^[A-Za-z0-9_-]{4,64}$/;
const PER_MIN = 30;

const DDL = [
  `CREATE TABLE IF NOT EXISTS save_meta (
    user_id INTEGER PRIMARY KEY,
    rev INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    device TEXT,
    summary TEXT,
    bytes INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS save_kv (
    user_id INTEGER NOT NULL,
    k TEXT NOT NULL,
    v TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, k)
  )`,
];
/** 표 만들기 — 이 워커(인스턴스)에서 한 번만. 실패하면 다음 요청에서 다시 */
let ready: Promise<unknown> | null = null;
const ensureTables = (db: D1Database) =>
  (ready ??= db.batch(DDL.map((s) => db.prepare(s))).catch((e: unknown) => { ready = null; throw e; }));

// 사람마다 1분에 너무 많이 부르면 막는다 (index.ts tooMany 와 같은 방식 — 워커 메모리 기준, 대략적)
const hits = new Map<number, { start: number; n: number }>();
function tooMany(id: number) {
  const t = Date.now();
  let h = hits.get(id);
  if (!h || t - h.start > 60_000) { h = { start: t, n: 0 }; hits.set(id, h); }
  h.n++;
  if (hits.size > 5000) for (const [k, v] of hits) if (t - v.start > 60_000) hits.delete(k);
  return h.n > PER_MIN;
}

interface MetaRow { rev: number; updated_at: number; device: string | null; summary: string | null; bytes: number }
const metaOf = (r: MetaRow | null) => ({ rev: r?.rev ?? 0, updatedAt: r?.updated_at ?? 0, device: r?.device ?? null, summary: r?.summary ?? null });
const ok = (body: unknown): SaveOut => ({ status: 200, body });
const fail = (status: number, error: string, extra?: object): SaveOut => ({ status, body: { error, ...extra } });

const META_SQL = 'SELECT rev, updated_at, device, summary, bytes FROM save_meta WHERE user_id = ?';

/** UTF-8 바이트가 한도를 넘나 — 거의 모든 큰 값은 'gz1:' base64(아스키)라 빨리 끝난다 */
function tooManyBytes(v: string) {
  if (v.length * 3 <= MAX_VALUE_BYTES) return false;
  if (/^[\x00-\x7f]*$/.test(v)) return v.length > MAX_VALUE_BYTES;
  return new TextEncoder().encode(v).length > MAX_VALUE_BYTES;
}

/**
 * GET /save/meta · GET /save · PUT /save (로그인은 index.ts 가 currentUser 로 확인하고 넘긴다).
 * 요청 형식 · 크기 · 판이 틀리면 { status, body: { error } } 로 돌려준다 — D1 오류만 위로 던진다(index.ts 가 500).
 */
export async function saveRoute(route: string, req: Request, db: D1Database, u: User): Promise<SaveOut> {
  if (tooMany(u.id)) return fail(429, '저장 요청이 너무 잦아요. 잠시 뒤 다시 해 주세요');
  await ensureTables(db);
  if (route === 'GET /save/meta') return ok(metaOf(await db.prepare(META_SQL).bind(u.id).first<MetaRow>()));
  if (route === 'GET /save') return getAll(db, u.id);
  return put(req, db, u.id);
}

/** 전부 받기 — 판과 값을 한 묶음(같은 순간)으로 읽는다 */
async function getAll(db: D1Database, id: number): Promise<SaveOut> {
  const [m, kv] = await db.batch([
    db.prepare(META_SQL).bind(id),
    db.prepare('SELECT k, v FROM save_kv WHERE user_id = ?').bind(id),
  ]);
  const meta = (m.results as unknown as MetaRow[])[0] ?? null;
  const keys: Record<string, string> = {};
  for (const r of kv.results as unknown as { k: string; v: string }[]) if (KEYSET.has(r.k)) keys[r.k] = r.v;
  return ok({ rev: meta?.rev ?? 0, updatedAt: meta?.updated_at ?? 0, keys });
}

interface PutBody { baseRev?: unknown; device?: unknown; summary?: unknown; set?: unknown; del?: unknown; force?: unknown }

async function put(req: Request, db: D1Database, id: number): Promise<SaveOut> {
  const text = await req.text();
  if (text.length > MAX_BODY) return fail(413, '저장할 기록이 너무 커요');
  let b: PutBody;
  try { b = JSON.parse(text) as PutBody; } catch { return fail(400, '요청 형식이 잘못됐어요'); }
  if (!b || typeof b !== 'object') return fail(400, '요청 형식이 잘못됐어요');
  const { baseRev, device } = b;
  const force = b.force === true;
  if (typeof baseRev !== 'number' || !Number.isInteger(baseRev) || baseRev < 0) return fail(400, '판 번호(baseRev)가 잘못됐어요');
  if (typeof device !== 'string' || !DEVICE_RE.test(device)) return fail(400, '기기 번호가 잘못됐어요');
  let summary: string | null = null;
  if (b.summary != null) {
    if (typeof b.summary !== 'string' || b.summary.length > MAX_SUMMARY) return fail(400, '요약은 2KB 이하 글이에요');
    try { JSON.parse(b.summary); } catch { return fail(400, '요약은 JSON 글이에요'); }
    summary = b.summary;
  }
  const rawSet = b.set ?? {};
  if (!rawSet || typeof rawSet !== 'object' || Array.isArray(rawSet)) return fail(400, '저장할 값(set) 형식이 잘못됐어요');
  const set = Object.entries(rawSet as Record<string, unknown>);
  for (const [k, v] of set) {
    if (!KEYSET.has(k)) return fail(400, `저장할 수 없는 열쇠예요 (${k.slice(0, 40)})`);
    if (typeof v !== 'string') return fail(400, '저장할 값은 글이어야 해요');
    if (v.length > MAX_VALUE || tooManyBytes(v)) return fail(413, `기록 하나가 너무 커요 (${k})`);
  }
  const rawDel = b.del ?? [];
  if (!Array.isArray(rawDel) || rawDel.length > SAVE_KEYS.length) return fail(400, '지울 열쇠(del) 형식이 잘못됐어요');
  const del = [...new Set(rawDel as unknown[])];
  for (const k of del) if (typeof k !== 'string' || !KEYSET.has(k) || k in (rawSet as object)) return fail(400, '지울 열쇠가 잘못됐어요');
  const dels = del as string[];

  // 지금 판 · 열쇠별 크기 (한 묶음으로 읽기)
  const [m, lens] = await db.batch([
    db.prepare(META_SQL).bind(id),
    db.prepare('SELECT k, length(v) AS n FROM save_kv WHERE user_id = ?').bind(id),
  ]);
  const meta = (m.results as unknown as MetaRow[])[0] ?? null;
  const rev = meta?.rev ?? 0;
  if (!force && rev !== baseRev) return fail(409, '다른 기기에서 먼저 저장했어요', metaOf(meta));
  const sizes = new Map((lens.results as unknown as { k: string; n: number }[]).map((r) => [r.k, r.n]));
  for (const [k, v] of set) sizes.set(k, (v as string).length);
  for (const k of dels) sizes.delete(k);
  let total = 0;
  for (const n of sizes.values()) total += n;
  if (total > MAX_TOTAL) return fail(413, '기록이 너무 커서 저장하지 못했어요 (계정마다 1,000만 자까지)');

  // 한 묶음 쓰기 — 1) 판 올리기(지금 판일 때만) 2) 값 넣기 · 지우기(1번이 들어갔을 때만: 판 · 시각 · 기기가 이번 것과 같을 때)
  const t = Date.now();
  const next = rev + 1;
  const guard = 'EXISTS (SELECT 1 FROM save_meta WHERE user_id = ?1 AND rev = ?2 AND updated_at = ?3 AND device = ?4)';
  const stmts: D1PreparedStatement[] = [
    rev === 0
      ? db.prepare('INSERT INTO save_meta (user_id, rev, updated_at, device, summary, bytes) VALUES (?, 1, ?, ?, ?, ?) ON CONFLICT (user_id) DO NOTHING')
        .bind(id, t, device, summary, total)
      : db.prepare('UPDATE save_meta SET rev = ?, updated_at = ?, device = ?, summary = ?, bytes = ? WHERE user_id = ? AND rev = ?')
        .bind(next, t, device, summary, total, id, rev),
    ...set.map(([k, v]) => db.prepare(
      `INSERT INTO save_kv (user_id, k, v, updated_at) SELECT ?1, ?5, ?6, ?3 WHERE ${guard}
       ON CONFLICT (user_id, k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at`,
    ).bind(id, next, t, device, k, v as string)),
    ...dels.map((k) => db.prepare(`DELETE FROM save_kv WHERE user_id = ?1 AND k = ?5 AND ${guard}`).bind(id, next, t, device, k)),
  ];
  const res = await db.batch(stmts);
  if ((res[0]?.meta.changes ?? 0) !== 1) {
    // 읽은 뒤 · 쓰기 전에 다른 기기가 먼저 올렸다 — 아무것도 쓰지 않았다
    return fail(409, '다른 기기에서 먼저 저장했어요', metaOf(await db.prepare(META_SQL).bind(id).first<MetaRow>()));
  }
  const written = res.reduce((s, r) => s + (r.meta.rows_written ?? 0), 0);
  return ok({ rev: next, updatedAt: t, written });
}
