// 같은 아이디는 한 기기에서만 — 새 세션이 생기면(로그인 · 가입 · 비밀번호 다시 정하기) 그 사람의 다른 세션을 모두 끊는다.
//  · 끊는 세션의 token_hash 는 session_kicks 로 옮기고 sessions 에서 지운다 — 끊긴 기기가 다음에 부르면 '그냥 만료'가 아니라
//    401 + code 'replaced'(다른 기기에서 로그인)로 알려 준다(index.ts currentUser · 채팅 hello).
//  · 표는 워커가 처음 쓸 때 스스로 만든다(CREATE TABLE IF NOT EXISTS — 기존 sessions 표는 건드리지 않는다). 30일 지난 기록은 가끔 지운다
//    (세션도 30일이면 끝나니 그 뒤엔 '만료'와 같다).
export const REPLACED_MSG = '다른 기기에서 로그인해서 이 기기 접속이 끊겼어요';
const KEEP_S = 30 * 86400;
const SWEEP_GAP_S = 6 * 3600;

let ready: Promise<unknown> | null = null;
export const ensureKicks = (db: D1Database) =>
  (ready ??= db.prepare('CREATE TABLE IF NOT EXISTS session_kicks (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, at INTEGER NOT NULL)').run()
    .catch((e: unknown) => { ready = null; throw e; }));

let lastSweep = 0;
/**
 * 새 세션(keep)만 남기고 그 사람의 다른 세션을 끊는 문장들 — 새 세션 넣기와 한 묶음(batch)으로 돌린다.
 * 돌려준 묶음의 [1] 번(DELETE)이 지운 줄 수 = 끊은 세션 수.
 */
export function kickOthers(db: D1Database, userId: number, keep: string, t: number): D1PreparedStatement[] {
  const out = [
    db.prepare(
      'INSERT OR REPLACE INTO session_kicks (token_hash, user_id, at) SELECT token_hash, user_id, ? FROM sessions WHERE user_id = ? AND token_hash != ? AND expires_at > ?',
    ).bind(t, userId, keep, t),
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(userId, keep),
  ];
  if (t - lastSweep > SWEEP_GAP_S) {
    lastSweep = t;
    out.push(db.prepare('DELETE FROM session_kicks WHERE at < ?').bind(t - KEEP_S));
  }
  return out;
}

/** 이 토큰(해시)이 다른 기기 로그인으로 끊긴 것인가 — 표가 아직 없으면(아무도 다시 로그인 안 함) 아니다 */
export async function wasKicked(db: D1Database, tokenHash: string): Promise<boolean> {
  try { return !!(await db.prepare('SELECT 1 FROM session_kicks WHERE token_hash = ?').bind(tokenHash).first()); } catch { return false; }
}
