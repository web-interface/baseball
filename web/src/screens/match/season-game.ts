// 시즌 다음 내 경기 — 엔진으로 계산한 경기를 경기 화면 기록으로. 끝나면 그날 결과를 시즌에 넣는다.
import { finishMyGame, prepareMyGame } from '../../season/run';
import { getSeason, markPendingStarted } from '../../season/store';
import { fromEngine } from './engine-game';
import type { FullGame } from './local-mock';
import type { MatchCtx } from './EndBar';

/** 오늘 결과를 시즌에 넣지 못했을 때 보내는 신호 (detail = 그날 순번) — 경기 끝 팝업이 듣는다 */
export const APPLY_FAILED = 'bb:season-apply-failed';

export async function prepareSeasonGame(): Promise<{ game: FullGame; ctx: MatchCtx } | null> {
  const r = await prepareMyGame();
  if (!r) return null;
  // 경기 id 에 시즌 시드 — 새 시즌(개막부터 다시)에서 같은 순번 경기를 '이미 본 경기'로 착각하지 않게
  const game = fromEngine(r.run, { id: `s27-${getSeason().seed}-${r.idx}-${r.away}-${r.home}`, date: r.day.date, time: r.time, awayId: r.away, homeId: r.home });
  let done = false;
  const ctx: MatchCtx = {
    kind: 'season', idx: r.idx, date: r.day.date,
    onStart: () => markPendingStarted(r.idx),
    // 결과 넣기 — 실패하면 한 번 더, 그래도 안 되면 경기 끝 팝업에 알린다(기다리는 글에서 멈추지 않게)
    onDone: () => {
      if (done) return;
      done = true;
      finishMyGame(r.idx, r.run)
        .catch(() => finishMyGame(r.idx, r.run))
        .catch((e) => {
          console.error('[season] 오늘 결과를 넣지 못함', e);
          window.dispatchEvent(new CustomEvent(APPLY_FAILED, { detail: r.idx }));
        });
    },
  };
  return { game, ctx };
}
