// 오늘(다음 내 경기) 선발 — 경기 계산(season/sim teamIn)과 같은 규칙:
//   빈 칸을 뺀 선발 로테이션을 (날 번호 + 구단 순번)으로 돈다. 정규 시즌 날 번호 = 일정 순번, 포스트시즌 = 1000 + 치른 포스트시즌 경기 수.
//   포스트시즌은 다음 경기가 내 경기일 때만 정해진다(다른 구단 경기가 먼저면 그 수만큼 밀리므로). 경기를 시작해 얼려 둔 라인업이 있으면 그것으로.
import { ME, TEAMS } from '../../game/mock';
import { nextMyGame } from '../../season/run';
import { nextPostGame } from '../../season/post';
import { isOver, type SeasonState } from '../../season/store';
import { ROT_SLOTS, type LineupState, type StaffSlot } from './calc';

export interface TodayStarter {
  slot: StaffSlot;
  /** 그 경기에 쓰는 라인업의 카드 (얼려 둔 라인업이면 지금 라인업과 다를 수 있다) */
  cardId: string;
  opp: string;
  date: string;
  home: boolean;
  /** 경기를 시작해 얼려 둔 라인업 기준 */
  frozen: boolean;
}

export function todayStarter(st: LineupState, s: SeasonState): TodayStarter | null {
  const ti = TEAMS.findIndex((t) => t.id === ME.teamId);
  let day: number;
  let idx = -1;
  let g: { away: string; home: string; date: string };
  if (!isOver(s)) {
    const nx = nextMyGame();
    if (!nx) return null;
    day = nx.day.day;
    idx = nx.idx;
    g = { away: nx.away, home: nx.home, date: nx.day.date };
  } else {
    const p = nextPostGame(s.post);
    if (!p || !p.mine || !s.post) return null;
    day = 1000 + s.post.n;
    g = { away: p.away, home: p.home, date: p.date };
  }
  const frozen = idx >= 0 && !!s.pending && s.pending.idx === idx && !!s.pending.started;
  const src = frozen ? s.pending!.snap : st;
  const filled = ROT_SLOTS.filter((_, i) => !!src.rotation[i]);
  if (!filled.length) return null;
  const k = (((day + ti) % filled.length) + filled.length) % filled.length;
  const slot = filled[k];
  const home = g.home === ME.teamId;
  return { slot, cardId: src.rotation[ROT_SLOTS.indexOf(slot)]!, opp: home ? g.away : g.home, date: g.date, home, frozen };
}
