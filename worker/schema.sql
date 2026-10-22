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

-- 비동기 대전 · 순위 (2단계) — 기존 테이블은 건드리지 않는다
-- 대전 상대로 보일 내 구단 스냅샷 (라인업은 선수 id·포지션·ovr 정도만, 8KB 이하)
CREATE TABLE IF NOT EXISTS pvp_clubs (
  user_id INTEGER PRIMARY KEY,
  username TEXT NOT NULL,
  club_code TEXT NOT NULL,
  team_name TEXT NOT NULL,
  power INTEGER NOT NULL DEFAULT 0,      -- 구단 선수 점수 합계
  ovr INTEGER NOT NULL DEFAULT 0,        -- 팀 종합
  lineup_json TEXT NOT NULL DEFAULT '[]',
  rating INTEGER NOT NULL DEFAULT 1500,
  w INTEGER NOT NULL DEFAULT 0,
  d INTEGER NOT NULL DEFAULT 0,
  l INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS pvp_clubs_rating ON pvp_clubs(rating);
CREATE INDEX IF NOT EXISTS pvp_clubs_power ON pvp_clubs(power);
-- 대전 한 판 (도전한 쪽 기준 · 결과는 서버가 정함)
CREATE TABLE IF NOT EXISTS pvp_games (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  opp_id INTEGER NOT NULL,
  my_score INTEGER NOT NULL,
  opp_score INTEGER NOT NULL,
  result TEXT NOT NULL,                  -- W · D · L (도전한 쪽)
  rating_delta INTEGER NOT NULL,
  seed INTEGER NOT NULL,
  line_json TEXT NOT NULL DEFAULT '{}',  -- 이닝별 점수
  created_at INTEGER NOT NULL,
  request_id TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS pvp_games_user ON pvp_games(user_id, created_at);
CREATE INDEX IF NOT EXISTS pvp_games_opp ON pvp_games(opp_id, created_at);
