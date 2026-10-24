// 대전 상대 목록에 내 구단 올리기 — 대전 화면에 들어가지 않아도 다른 감독 목록에 나오게.
//  · 로그인한 채 앱을 켜면 곧바로(마지막으로 올린 지 1시간이 지났을 때 — 아니면 남은 시간 뒤), 켜 둔 동안 1시간마다.
//  · 대전 화면에서 올린 것도 '올린 시각'으로 친다(online.ts markPvpSynced).
//  · 구단을 아직 안 고른 새 감독은 건너뛴다. 실패(연결 끊김 · 서버 오류)는 조용히 — 다음 차례에 다시.
import { api } from '../../api';
import { savedStartClub } from '../../game/mock';
import { lastPvpSync, markPvpSynced, mySnapshot } from './online';

const HOUR = 60 * 60 * 1000;
let timer: number | null = null;
let running = false;

async function syncNow() {
  if (running || !savedStartClub()) return;
  running = true;
  try {
    await api.pvpPutMe(mySnapshot());
    markPvpSynced();
  } catch { /* 다음 차례에 */ } finally {
    running = false;
  }
}

/** 로그인 상태가 되면 시작 — 돌려준 함수로 멈춘다(로그아웃 · 연결 끊김) */
export function startPvpSync(): () => void {
  stopPvpSync();
  const wait = Math.max(5_000, HOUR - (Date.now() - lastPvpSync()));
  const tick = () => {
    void syncNow();
    timer = window.setTimeout(tick, HOUR);
  };
  timer = window.setTimeout(tick, wait);
  return stopPvpSync;
}

export function stopPvpSync() {
  if (timer != null) { window.clearTimeout(timer); timer = null; }
}
