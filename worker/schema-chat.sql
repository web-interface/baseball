-- 로비 채팅 신고 — 메시지 자체는 Durable Object 저장소에 5분만(최근 100개까지) 있고, D1 에는 신고 기록만.
-- npx wrangler d1 execute baseball --remote --file=schema-chat.sql
-- 개인정보 최소화: 신고된 본문·IP 는 남기지 않는다 — 누가 · 누구를 · 언제만. 7일 지나면 지운다(신고가 들어올 때 함께 정리).
CREATE TABLE IF NOT EXISTS chat_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  msg_id INTEGER NOT NULL,           -- 방 안 메시지 번호
  reporter_id INTEGER NOT NULL,
  target_id INTEGER NOT NULL,
  target_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (msg_id, reporter_id)
);
CREATE INDEX IF NOT EXISTS chat_reports_target ON chat_reports(target_id, created_at);
CREATE INDEX IF NOT EXISTS chat_reports_reporter ON chat_reports(reporter_id, created_at);
