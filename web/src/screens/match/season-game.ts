// 시즌 다음 내 경기 — 엔진으로 계산한 경기를 경기 화면 기록으로. 끝나면 그날 결과를 시즌에 넣는다.
import { finishMyGame, prepareMyGame } from '../../season/run';
import { fromEngine } from './engine-game';
import type { FullGame } from './local-mock';
import type { MatchCtx } from './EndBar';

export async function prepareSeasonGame(): Promise<{ game: FullGame; ctx: MatchCtx } | null> {
  const r = await prepareMyGame();
  if (!r) return null;
  const game = fromEngine(r.run, { id: `s27-${r.idx}-${r.away}-${r.home}`, date: r.day.date, time: r.time, awayId: r.away, homeId: r.home });
  let done = false;
  const ctx: MatchCtx = {
    kind: 'season', idx: r.idx, date: r.day.date,
    onDone: () => { if (done) return; done = true; void finishMyGame(r.idx, r.run); },
  };
  return { game, ctx };
}
