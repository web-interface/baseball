// 지금 경기 바꿔 끼우기 — 경기 기록(GAME)을 바꾸고 재생 순서표(timeline)를 새로 계산한다.
// 화면(MatchScreen)은 경기마다 key 를 바꿔 새로 그린다.
import { LAST_GAME, setGame, type FullGame } from './local-mock';
import { rebuildTimeline } from './timeline';

let currentId = LAST_GAME.match.id;
export function activate(g: FullGame) {
  if (g.match.id === currentId) return;
  setGame(g);
  rebuildTimeline();
  currentId = g.match.id;
}
/** 공용 목업 '어제 경기'로 되돌리기 */
export const activateLast = () => activate(LAST_GAME);
export const activeId = () => currentId;
