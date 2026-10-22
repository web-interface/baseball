// 비동기 대전 · 순위 — 상대가 접속해 있을 필요 없이, 저장된 구단 스냅샷과 붙는다. 결과는 서버가 정한다.
// D1 쓰기: 대전 한 판에 3번(기록 1 + 내 전적 1 + 상대 전적 1)을 한 묶음(batch)으로.

export class PvpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

type User = { id: number; username: string };
const now = () => Math.floor(Date.now() / 1000);

const CLUBS = ['dj', 'gj', 'dg', 'bs', 'sb', 'st', 'sh', 'ic', 'cw', 'sw'];
const POS = ['P', 'SP', 'RP', 'CP', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
const ID_RE = /^[A-Za-z0-9_-]{1,24}$/;
const REQ_RE = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_LINEUP_BYTES = 8192;
export const DAILY_BATTLES = 200;
const K = 24;
const START_RATING = 1500;

interface ClubRow {
  user_id: number; username: string; club_code: string; team_name: string; power: number; ovr: number;
  lineup_json: string; rating: number; w: number; d: number; l: number; updated_at: number;
}
/** 라인업 한 칸 — 이름 · 카드 연도(2자리) · 선수 구단 코드는 경기 다시 보기 이름표용(없어도 됨) */
type LineupItem = { id: string; pos: string; ovr: number; name?: string; y?: number; c?: string };
const NAME_RE = /^[가-힣A-Za-z .·'-]{1,16}$/;
const CLUB_RE = /^[a-z]{2,4}$/;

const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

function publicClub(r: ClubRow, withLineup = false) {
  let lineup: LineupItem[] | undefined;
  if (withLineup) { try { lineup = JSON.parse(r.lineup_json); } catch { lineup = []; } }
  return {
    userId: r.user_id, username: r.username, club: r.club_code, teamName: r.team_name,
    power: r.power, ovr: r.ovr, rating: r.rating, w: r.w, d: r.d, l: r.l, updatedAt: r.updated_at,
    ...(lineup ? { lineup } : {}),
  };
}

async function body<T>(req: Request): Promise<T> {
  try { return (await req.json()) as T; } catch { throw new PvpError(400, '요청 형식이 잘못됐어요'); }
}

/** PUT /pvp/me — 내 구단·라인업 스냅샷 등록/갱신 (레이팅·전적은 그대로) */
export async function putMe(req: Request, db: D1Database, u: User) {
  const b = await body<{ club?: unknown; teamName?: unknown; power?: unknown; ovr?: unknown; lineup?: unknown }>(req);
  if (typeof b.club !== 'string' || !CLUBS.includes(b.club)) throw new PvpError(400, '구단 코드가 잘못됐어요');
  if (typeof b.teamName !== 'string' || !b.teamName.trim() || b.teamName.length > 24) throw new PvpError(400, '구단 이름은 1~24자예요');
  if (!isInt(b.ovr, 1, 120)) throw new PvpError(400, '팀 종합은 1~120 이에요');
  if (!isInt(b.power, 0, 6000)) throw new PvpError(400, '구단 전력은 0~6000 이에요');
  if (!Array.isArray(b.lineup) || b.lineup.length < 1 || b.lineup.length > 40) throw new PvpError(400, '라인업은 1~40명이에요');
  const lineup: LineupItem[] = b.lineup.map((x: unknown) => {
    const o = x as Partial<LineupItem>;
    if (!o || typeof o.id !== 'string' || !ID_RE.test(o.id) || typeof o.pos !== 'string' || !POS.includes(o.pos) || !isInt(o.ovr, 1, 120))
      throw new PvpError(400, '라인업 선수 값이 잘못됐어요');
    const it: LineupItem = { id: o.id, pos: o.pos, ovr: o.ovr };
    if (typeof o.name === 'string' && NAME_RE.test(o.name)) it.name = o.name;
    if (isInt(o.y, 0, 99)) it.y = o.y;
    if (typeof o.c === 'string' && CLUB_RE.test(o.c)) it.c = o.c;
    return it;
  });
  const lineupJson = JSON.stringify(lineup);
  if (new TextEncoder().encode(lineupJson).length > MAX_LINEUP_BYTES) throw new PvpError(413, '라인업이 너무 커요');
  const row = await db.prepare(
    `INSERT INTO pvp_clubs (user_id, username, club_code, team_name, power, ovr, lineup_json, rating, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET username = excluded.username, club_code = excluded.club_code, team_name = excluded.team_name,
       power = excluded.power, ovr = excluded.ovr, lineup_json = excluded.lineup_json, updated_at = excluded.updated_at
     RETURNING *`,
  ).bind(u.id, u.username, b.club, b.teamName.trim(), b.power, b.ovr, lineupJson, START_RATING, now()).first<ClubRow>();
  return { me: publicClub(row!) };
}

async function myClub(db: D1Database, u: User) {
  return db.prepare('SELECT * FROM pvp_clubs WHERE user_id = ?').bind(u.id).first<ClubRow>();
}
const dayStart = () => { const t = now(); return t - (t % 86400); }; // UTC 0시 = 한국 오전 9시

async function battlesToday(db: D1Database, u: User) {
  const r = await db.prepare('SELECT COUNT(*) AS n FROM pvp_games WHERE user_id = ? AND created_at >= ?').bind(u.id, dayStart()).first<{ n: number }>();
  return r?.n ?? 0;
}

/** GET /pvp/opponents — 나 빼고 실제 유저 20명 (최근 2주 안에 갱신한 감독 먼저, 그 안에서 레이팅 가까운 순) + 내 기록 */
export async function opponents(db: D1Database, u: User) {
  const me = await myClub(db, u);
  const rating = me?.rating ?? START_RATING;
  const { results } = await db.prepare(
    `SELECT * FROM pvp_clubs WHERE user_id != ?
     ORDER BY (updated_at > ?) DESC, ABS(rating - ?) ASC, updated_at DESC LIMIT 20`,
  ).bind(u.id, now() - 14 * 86400, rating).all<ClubRow>();
  const used = await battlesToday(db, u);
  return { me: me ? publicClub(me) : null, opponents: results.map((r) => publicClub(r, true)), today: { used, limit: DAILY_BATTLES } };
}

/* ───────── 경기 모델 ───────── */
// 두 팀 힘 차이(팀 종합 + 전력 비율)로 이닝당 득점 기대치를 만들고, 시드 난수로 이닝마다 점수를 뽑는다.
// 이닝당 기본 0.5점(9이닝 4.5점). 힘 차이는 ±12 로 자르고 득점 배율 exp(±0.015·차이) → 강팀 승률 약 50~70%.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** 한 이닝 점수 — 기대치를 조금 흔든 포아송(점수가 몰리는 이닝이 있게), 한 이닝 최대 9점 */
function inningRuns(rand: () => number, lambda: number) {
  const g = (rand() + rand() + rand()) / 1.5; // 평균 1, 0~2
  const lam = lambda * (0.4 + 0.6 * g);
  const L = Math.exp(-lam);
  let k = 0, p = 1;
  do { k++; p *= rand(); } while (p > L && k < 20);
  return Math.min(9, k - 1);
}
/** a = 도전한 쪽(원정, 초 공격) · h = 도전받는 쪽(홈) */
export function playGame(a: { ovr: number; power: number }, h: { ovr: number; power: number }, seed: number) {
  const rand = mulberry32(seed);
  const maxPow = Math.max(a.power, h.power, 1);
  const diff = Math.max(-12, Math.min(12, (a.ovr - h.ovr) + (10 * (a.power - h.power)) / maxPow));
  const base = 0.5;
  const lamA = base * Math.exp(0.015 * diff);
  const lamH = base * Math.exp(-0.015 * diff) * 1.02; // 홈 아주 조금 유리
  const away: number[] = [], home: (number | null)[] = [];
  let sa = 0, sh = 0;
  for (let inn = 1; inn <= 12; inn++) {
    const ra = inningRuns(rand, lamA); away.push(ra); sa += ra;
    if (inn >= 9 && sh > sa) { home.push(null); break; } // 9회 말 이후 — 홈이 앞서면 공격 없음
    let rh = inningRuns(rand, lamH);
    if (inn >= 9 && sh + rh > sa) rh = Math.min(rh, sa - sh + 4); // 끝내기 — 만루 홈런까지만
    home.push(rh); sh += rh;
    if (inn >= 9 && sa !== sh) break;
  }
  return { my: sa, opp: sh, line: { away, home } };
}

const expectedScore = (me: number, opp: number) => 1 / (1 + 10 ** ((opp - me) / 400));

interface GameRow { id: string; user_id: number; opp_id: number; my_score: number; opp_score: number; result: string; rating_delta: number; seed: number; line_json: string; created_at: number; request_id: string }

function gameOut(g: GameRow, replay: boolean) {
  let line: unknown = {};
  try { line = JSON.parse(g.line_json); } catch { /* */ }
  return { id: g.id, opponentId: g.opp_id, myScore: g.my_score, oppScore: g.opp_score, result: g.result, ratingDelta: g.rating_delta, line, createdAt: g.created_at, replay };
}

async function standing(db: D1Database, u: User, oppId: number) {
  const { results } = await db.prepare('SELECT * FROM pvp_clubs WHERE user_id IN (?, ?)').bind(u.id, oppId).all<ClubRow>();
  const me = results.find((r) => r.user_id === u.id), opp = results.find((r) => r.user_id === oppId);
  return { me: me ? publicClub(me) : null, opponent: opp ? publicClub(opp) : null, today: { used: await battlesToday(db, u), limit: DAILY_BATTLES } };
}

/** POST /pvp/battle {opponentId, requestId} */
export async function battle(req: Request, db: D1Database, u: User) {
  const b = await body<{ opponentId?: unknown; requestId?: unknown }>(req);
  if (typeof b.requestId !== 'string' || !REQ_RE.test(b.requestId)) throw new PvpError(400, '요청 번호가 잘못됐어요');
  if (!isInt(b.opponentId, 1, 2 ** 31)) throw new PvpError(400, '상대가 잘못됐어요');

  // 같은 요청 번호면 저장된 결과 그대로 (다시 계산·기록하지 않는다)
  const prev = await db.prepare('SELECT * FROM pvp_games WHERE request_id = ?').bind(b.requestId).first<GameRow>();
  if (prev) {
    if (prev.user_id !== u.id) throw new PvpError(409, '이미 쓰인 요청 번호예요');
    return { game: gameOut(prev, true), ...(await standing(db, u, prev.opp_id)) };
  }
  if (b.opponentId === u.id) throw new PvpError(400, '내 구단과는 붙을 수 없어요');
  const [me, opp] = await Promise.all([myClub(db, u), db.prepare('SELECT * FROM pvp_clubs WHERE user_id = ?').bind(b.opponentId).first<ClubRow>()]);
  if (!me) throw new PvpError(409, '먼저 내 구단을 등록해 주세요');
  if (!opp) throw new PvpError(404, '없는 상대예요');
  const used = await battlesToday(db, u);
  if (used >= DAILY_BATTLES) throw new PvpError(429, `오늘 대전(${DAILY_BATTLES}번)을 다 했어요. 오전 9시에 다시 채워져요`);

  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const g = playGame(me, opp, seed);
  const result = g.my > g.opp ? 'W' : g.my < g.opp ? 'L' : 'D';
  const sc = result === 'W' ? 1 : result === 'D' ? 0.5 : 0;
  const delta = Math.round(K * (sc - expectedScore(me.rating, opp.rating)));
  const oppDelta = Math.round(K * (1 - sc - expectedScore(opp.rating, me.rating)));
  const id = crypto.randomUUID();
  const t = now();
  const lineJson = JSON.stringify(g.line);
  const inserted = 'EXISTS (SELECT 1 FROM pvp_games WHERE id = ?)';
  const upd = `UPDATE pvp_clubs SET rating = MAX(100, rating + ?), w = w + ?, d = d + ?, l = l + ? WHERE user_id = ? AND ${inserted}`;
  const res = await db.batch([
    db.prepare(`INSERT INTO pvp_games (id, user_id, opp_id, my_score, opp_score, result, rating_delta, seed, line_json, created_at, request_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (request_id) DO NOTHING`)
      .bind(id, u.id, opp.user_id, g.my, g.opp, result, delta, seed, lineJson, t, b.requestId),
    db.prepare(upd).bind(delta, +(result === 'W'), +(result === 'D'), +(result === 'L'), u.id, id),
    // 상대는 수비 기록 — 내가 지면 상대 승
    db.prepare(upd).bind(oppDelta, +(result === 'L'), +(result === 'D'), +(result === 'W'), opp.user_id, id),
  ]);
  if (!res[0].meta.changes) {
    // 같은 요청이 동시에 두 번 들어와 다른 쪽이 먼저 기록함 — 그 결과를 돌려준다
    const won = await db.prepare('SELECT * FROM pvp_games WHERE request_id = ?').bind(b.requestId).first<GameRow>();
    if (!won || won.user_id !== u.id) throw new PvpError(409, '이미 쓰인 요청 번호예요');
    return { game: gameOut(won, true), ...(await standing(db, u, won.opp_id)) };
  }
  const bump = (r: ClubRow, dl: number, w: boolean, d: boolean, l: boolean) =>
    ({ ...publicClub(r), rating: Math.max(100, r.rating + dl), w: r.w + +w, d: r.d + +d, l: r.l + +l });
  return {
    game: gameOut({ id, user_id: u.id, opp_id: opp.user_id, my_score: g.my, opp_score: g.opp, result, rating_delta: delta, seed, line_json: lineJson, created_at: t, request_id: b.requestId }, false),
    me: bump(me, delta, result === 'W', result === 'D', result === 'L'),
    opponent: bump(opp, oppDelta, result === 'L', result === 'D', result === 'W'),
    today: { used: used + 1, limit: DAILY_BATTLES },
  };
}

/** GET /rankings?by=rating|winrate|power — 상위 50 + 내 순위 (승률은 10경기 이상) */
const MIN_GAMES = 10;
export async function rankings(url: URL, db: D1Database, u: User) {
  const by = url.searchParams.get('by') || 'rating';
  const pct = '(CASE WHEN w + l = 0 THEN 0.0 ELSE w * 1.0 / (w + l) END)';
  const spec: Record<string, { value: string; where: string }> = {
    rating: { value: 'rating', where: '1' },
    winrate: { value: pct, where: `w + d + l >= ${MIN_GAMES}` },
    power: { value: 'power', where: '1' },
  };
  const s = spec[by];
  if (!s) throw new PvpError(400, '정렬 기준은 rating · winrate · power 중 하나예요');
  const [top, total, me] = await Promise.all([
    db.prepare(`SELECT *, ${s.value} AS v FROM pvp_clubs WHERE ${s.where} ORDER BY v DESC, rating DESC, updated_at ASC LIMIT 50`).all<ClubRow & { v: number }>(),
    db.prepare(`SELECT COUNT(*) AS n FROM pvp_clubs WHERE ${s.where}`).first<{ n: number }>(),
    db.prepare(`SELECT *, ${s.value} AS v, (${s.where}) AS ok FROM pvp_clubs WHERE user_id = ?`).bind(u.id).first<ClubRow & { v: number; ok: number }>(),
  ]);
  let myRank: number | null = null;
  if (me && me.ok) {
    const r = await db.prepare(`SELECT COUNT(*) AS n FROM pvp_clubs WHERE ${s.where} AND ${s.value} > ?`).bind(me.v).first<{ n: number }>();
    myRank = (r?.n ?? 0) + 1;
  }
  let prevRank = 0, prevV: number | null = null;
  const rows = top.results.map((r, i) => {
    const rank = prevV !== null && r.v === prevV ? prevRank : i + 1; // 같은 값은 같은 순위
    prevRank = rank; prevV = r.v;
    return { rank, value: r.v, ...publicClub(r), me: r.user_id === u.id };
  });
  return { by, minGames: MIN_GAMES, total: total?.n ?? 0, rows, me: me ? { rank: myRank, value: me.v, ...publicClub(me) } : null };
}
