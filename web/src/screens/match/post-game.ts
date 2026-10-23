// 포스트시즌 우리 경기 — 엔진으로 계산한 경기를 경기 화면 기록으로. 이닝별로 끝까지 보면 시리즈에 결과를 넣는다.
import { finishPostMyGame, preparePostMyGame, SERIES_KO } from '../../season/post';
import { getSeason } from '../../season/store';
import { fromEngine } from './engine-game';
import type { FullGame } from './local-mock';
import type { MatchCtx } from './EndBar';

export async function preparePostGame(): Promise<{ game: FullGame; ctx: MatchCtx } | null> {
  const r = await preparePostMyGame();
  if (!r) return null;
  const s = getSeason();
  const time = new Date(`${r.date}T00:00:00Z`).getUTCDay() % 6 === 0 ? (new Date(`${r.date}T00:00:00Z`).getUTCDay() === 6 ? '17:00' : '14:00') : '18:30';
  // 경기 id — 시즌 시드 · 시리즈 · 차전 (같은 경기를 '이미 본 경기'로 착각하지 않게)
  const game = fromEngine(r.run, { id: `s27-${s.seed}-post-${r.series.id}-${r.no}-${r.away}-${r.home}`, date: r.date, time, awayId: r.away, homeId: r.home });
  let done = false;
  const ctx: MatchCtx = {
    kind: 'post',
    label: `${SERIES_KO[r.series.id]} ${r.no}차전`,
    onDone: () => { if (done) return; done = true; finishPostMyGame({ away: r.away, home: r.home, date: r.date, no: r.no }, r.run); },
  };
  return { game, ctx };
}
