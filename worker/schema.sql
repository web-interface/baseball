-- 야구 게임 데이터베이스 (Cloudflare D1 · SQLite)
-- 비밀번호는 저장하지 않는다: 브라우저가 PBKDF2 로 섞은 값을 서버가 한 번 더 섞어(소금+후추) 그 결과만 둔다.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pw_hash TEXT NOT NULL,          -- SHA-256(후추 · 소금 · 브라우저 키)
  salt TEXT NOT NULL,             -- 사용자별 무작위 소금
  recovery_hash TEXT NOT NULL,    -- 복구 코드도 섞은 값만
  failed INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,    -- 입장권도 섞은 값만
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
-- 사람별 하루 AI 사용량 (Claude 비용 한도)
CREATE TABLE IF NOT EXISTS ai_usage (
  user_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  in_tokens INTEGER NOT NULL DEFAULT 0,
  out_tokens INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
