-- 기기 간 이어하기 — 계정별 게임 진행 저장 (worker/src/save.ts)
-- 문서용: 워커가 처음 쓸 때 같은 DDL(CREATE TABLE IF NOT EXISTS)로 스스로 만든다 — 따로 돌릴 필요 없다.
-- 사이트(web/src/app/sync.ts)는 localStorage 의 게임 진행 열쇠(허용 목록 17개)를 그대로 올리고 받는다. 기기 설정 · 로그인 토큰은 올리지 않는다.
CREATE TABLE IF NOT EXISTS save_meta (
  user_id INTEGER PRIMARY KEY,
  rev INTEGER NOT NULL,              -- 판: 올릴 때마다 1씩 (사이트가 마지막으로 맞춘 판과 다르면 409 — 두 기기에서 따로 진행)
  updated_at INTEGER NOT NULL,       -- 마지막으로 올린 때 (밀리초, Date.now())
  device TEXT,                       -- 마지막으로 올린 기기 (사이트가 만든 무작위 번호)
  summary TEXT,                      -- 고르기 창에 보일 요약 (JSON 글, 2KB 이하 — 구단 · 연도 · 진행 · 카드 수 · 리그 단계)
  bytes INTEGER NOT NULL DEFAULT 0   -- 값 글자 수 합계 SUM(length(v)) — 사람마다 1,000만 자까지
);
CREATE TABLE IF NOT EXISTS save_kv (
  user_id INTEGER NOT NULL,
  k TEXT NOT NULL,                   -- localStorage 열쇠 (허용 목록만)
  v TEXT NOT NULL,                   -- 값 그대로 — 8KB 넘으면 'gz1:' + gzip base64 (값 하나 150만 자까지)
  updated_at INTEGER NOT NULL,       -- 밀리초
  PRIMARY KEY (user_id, k)
);

-- 같은 아이디는 한 기기에서만 (worker/src/kick.ts — 이것도 워커가 처음 쓸 때 스스로 만든다. 기존 sessions 표는 바꾸지 않는다)
-- 새 세션(로그인 · 가입 · 비밀번호 다시 정하기)이 생기면 그 사람의 다른 세션을 sessions 에서 지우고 여기로 옮긴다.
-- 끊긴 기기가 부르면 '그냥 만료'가 아니라 401 + code 'replaced' → 사이트가 '다른 기기에서 로그인했어요' 팝업. 30일 지난 줄은 가끔 지운다.
CREATE TABLE IF NOT EXISTS session_kicks (
  token_hash TEXT PRIMARY KEY,       -- 끊긴 세션의 토큰 해시 (토큰 자체는 저장하지 않는다)
  user_id INTEGER NOT NULL,
  at INTEGER NOT NULL                -- 끊은 때 (초)
);
