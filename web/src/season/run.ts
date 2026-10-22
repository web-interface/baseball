// 시즌 진행 — 하루 치기 · 다음 내 경기 준비/마무리. 경기 엔진(sim.ts)은 처음 쓸 때 불러온다(import()).
import { ME } from '../game/mock';
import { initialLineup, store as lineupStore, type LineupState } from '../screens/lineup/calc';
import { myRoster } from './rosters';
import { startTime, type DayGames } from './schedule';
import { allDays, applyDay, getSeason, isOver, myGameOf, regularCount, setPending, type DayHighlight, type DayOutcome } from './store';
import { rainedOut } from './weather';
import type { GameRun } from './sim';

export const loadSim = () => import('./sim');

/** 그날 내 경기가 비로 취소되나 */
export function myGameRained(idx: number) {
  const s = getSeason();
  const d = allDays(s)[idx];
  if (!d || idx >= regularCount()) return false;
  const g = myGameOf(d);
  return !!g && rainedOut(d.date, g[1], s.seed);
}
/** 다음에 할 수 있는 내 경기 (비로 취소되는 날은 건너뜀) */
export function nextMyGame(): { idx: number; day: DayGames; away: string; home: string; rainedBefore: number } | null {
  const s = getSeason();
  const days = allDays(s);
  let rained = 0;
  for (let i = s.next; i < days.length; i++) {
    const g = myGameOf(days[i]);
    if (!g) continue;
    if (myGameRained(i)) { rained++; continue; }
    return { idx: i, day: days[i], away: g[0], home: g[1], rainedBefore: rained };
  }
  return null;
}

/** 하루 계산 — 내 경기는 넘긴 run(이미 본 경기) 또는 지금 라인업으로 */
export async function computeDay(idx: number, opts: { myRun?: GameRun; snap?: LineupState } = {}): Promise<DayOutcome> {
  const sim = await loadSim();
  const s = getSeason();
  const d = allDays(s)[idx];
  const regular = idx < regularCount();
  const games: DayOutcome['games'] = d.games.map(([a, h]) => {
    if (regular && rainedOut(d.date, h, s.seed)) return { cancelled: true as const, away: a, home: h };
    const mine = a === ME.teamId || h === ME.teamId;
    if (mine && opts.myRun) return opts.myRun.out;
    const roster = mine ? myRoster(opts.snap ?? lineupStore.get() ?? initialLineup()) : undefined;
    return sim.runGame(s.seed, d.day, d.date, a, h, roster ? (a === ME.teamId ? { away: roster } : { home: roster }) : {}).out;
  });
  return { idx, games };
}

/** 하루 치고 넣기 */
export async function playNextDay(): Promise<{ idx: number; hl: DayHighlight[]; out: DayOutcome } | null> {
  const s = getSeason();
  if (isOver(s)) return null;
  const idx = s.next;
  const pend = s.pending && s.pending.idx === idx ? s.pending.snap : undefined;
  const out = await computeDay(idx, { snap: pend });
  const hl = applyDay(out);
  return { idx, hl, out };
}

/** 내 경기 준비 — 그 앞날들을 다 치고(비 취소 포함), 라인업을 얼린 뒤 내 경기를 기록과 함께 계산 */
export async function prepareMyGame(): Promise<{ idx: number; day: DayGames; run: GameRun; away: string; home: string; time: string } | null> {
  const target = nextMyGame();
  if (!target) return null;
  while (getSeason().next < target.idx) {
    const r = await playNextDay();
    if (!r) break;
  }
  const s = getSeason();
  const snap = s.pending && s.pending.idx === target.idx ? s.pending.snap : (lineupStore.get() ?? initialLineup());
  if (!s.pending || s.pending.idx !== target.idx) setPending(target.idx, JSON.parse(JSON.stringify(snap)) as LineupState);
  const sim = await loadSim();
  const roster = myRoster(snap);
  const run = sim.runGame(s.seed, target.day.day, target.day.date, target.away, target.home, { log: true, ...(target.away === ME.teamId ? { away: roster } : { home: roster }) });
  return { idx: target.idx, day: target.day, run, away: target.away, home: target.home, time: startTime(target.day.date) };
}

/** 내 경기 끝 — 그날 나머지 경기를 치고 결과를 넣는다 (이미 넣었으면 그대로) */
export async function finishMyGame(idx: number, run: GameRun): Promise<DayHighlight[]> {
  if (getSeason().next !== idx) return [];
  const out = await computeDay(idx, { myRun: run });
  return applyDay(out);
}
