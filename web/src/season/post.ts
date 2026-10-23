// 포스트시즌 — KBO 방식 (정규 시즌 1~5위)
//   와일드카드 결정전  4위 vs 5위 — 4위가 1승을 안고 시작(무승부여도 4위 진출), 최대 2경기, 모두 4위 홈
//   준플레이오프      3위 vs WC 승자 — 5전 3선승, 1 · 2 · 5차전 3위 홈
//   플레이오프        2위 vs 준PO 승자 — 5전 3선승, 1 · 2 · 5차전 2위 홈
//   한국시리즈        1위 vs PO 승자 — 7전 4선승, 1 · 2 · 6 · 7차전 1위 홈
//   연장은 15회까지(sim POST_RULES), 무승부는 승리로 치지 않는다(시리즈가 그만큼 길어짐 — 최대 2경기 더, 그래도 안 끝나면 승수 · 윗 순위).
//   날마다 한 경기, 시리즈 사이 하루 쉼. 비 취소는 없다. 선수 시즌 기록에는 넣지 않는다(정규 시즌과 따로).
// 내 구단 경기는 경기 화면에서 이닝별로 끝까지 봐야 결과가 들어간다(screens/match — ?g=post). 다른 구단 경기는 바로 계산.
import { ME } from '../game/mock';
import { myRoster } from './rosters';
import { allDays, getSeason, isOver, setPost, standingsOf } from './store';
import { savePostBox } from './box';
import type { GameRun } from './sim';

export type SeriesId = 'wc' | 'spo' | 'po' | 'ks';
export const SERIES_ORDER: SeriesId[] = ['wc', 'spo', 'po', 'ks'];
export const SERIES_KO: Record<SeriesId, string> = { wc: '와일드카드 결정전', spo: '준플레이오프', po: '플레이오프', ks: '한국시리즈' };
export const SERIES_SHORT: Record<SeriesId, string> = { wc: 'WC', spo: '준PO', po: 'PO', ks: 'KS' };
/** 올라가는 승수 [윗 순위, 아랫 순위] — WC 는 4위가 1승을 안고 시작해 1승만 더 */
const NEED: Record<SeriesId, [number, number]> = { wc: [2, 2], spo: [3, 3], po: [3, 3], ks: [4, 4] };
/** 기본 경기 수 (무승부가 나면 2경기까지 더) */
export const BASE_GAMES: Record<SeriesId, number> = { wc: 2, spo: 5, po: 5, ks: 7 };
/** 윗 순위 구단이 홈인 차전 (그 밖의 차전은 아랫 순위 홈 · 더 붙는 경기는 윗 순위 홈) */
const HI_HOME: Record<SeriesId, number[]> = { wc: [1, 2], spo: [1, 2, 5], po: [1, 2, 5], ks: [1, 2, 6, 7] };
/** 그 시리즈 윗 순위 = 정규 시즌 몇 위 (0부터) */
const HI_SEED: Record<SeriesId, number> = { wc: 3, spo: 2, po: 1, ks: 0 };

export interface PostGameRec { no: number; date: string; away: string; home: string; s: [number, number]; inn: number; mine?: boolean }
export interface SeriesRec {
  id: SeriesId;
  /** 윗 순위 · 아랫 순위 구단 */
  hi: string; lo: string;
  /** 승수 [윗 순위, 아랫 순위] — WC 는 4위 1승 안고 시작 */
  wins: [number, number];
  draws: number;
  games: PostGameRec[];
  winner?: string;
}
export interface PostState {
  /** 정규 시즌 1~5위 */
  seeds: string[];
  series: SeriesRec[];
  champion?: string;
  /** 다음 경기 날짜 */
  date: string;
  /** 치른 포스트시즌 경기 수 (엔진 시드용) */
  n: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
function addDays(date: string, k: number) {
  const t = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) + k * 86400000;
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export const postOf = () => getSeason().post;
/** 진행 중인 시리즈 */
export const openSeries = (p: PostState) => p.series.find((x) => !x.winner) ?? null;
/** 그 시리즈의 다음 경기 — 몇 차전 · 원정/홈 · 날짜 · 내 경기인가 */
export function nextPostGame(p: PostState | undefined = postOf()) {
  if (!p || p.champion) return null;
  const sr = openSeries(p);
  if (!sr) return null;
  const no = sr.games.length + 1;
  const hiHome = HI_HOME[sr.id].includes(no) || no > BASE_GAMES[sr.id];
  const home = hiHome ? sr.hi : sr.lo, away = hiHome ? sr.lo : sr.hi;
  return { series: sr, no, away, home, date: p.date, mine: away === ME.teamId || home === ME.teamId };
}
/** 정규 시즌이 끝났으면 포스트시즌을 연다 (이미 열렸으면 그대로) */
export function startPost(): PostState | null {
  const s = getSeason();
  if (!isOver(s)) return null;
  if (s.post) return s.post;
  const seeds = standingsOf(s).slice(0, 5).map((r) => r.teamId);
  const days = allDays(s);
  const last = days[days.length - 1]?.date ?? `${s.year ?? 2027}-09-30`;
  const p: PostState = {
    seeds,
    series: [{ id: 'wc', hi: seeds[3], lo: seeds[4], wins: [1, 0], draws: 0, games: [] }],
    date: addDays(last, 2),
    n: 0,
  };
  setPost(p);
  return p;
}
/** 내 구단이 아직 포스트시즌에 남아 있나 */
export function stillAlive(p: PostState | undefined = postOf()) {
  if (!p || !p.seeds.includes(ME.teamId)) return false;
  if (p.champion) return p.champion === ME.teamId;
  return !p.series.some((sr) => sr.winner && sr.winner !== ME.teamId && (sr.hi === ME.teamId || sr.lo === ME.teamId));
}

/** 경기 결과 넣기 — 시리즈 승수 · 다음 시리즈 · 우승 */
function apply(p: PostState, g: { away: string; home: string; score: [number, number]; innings: number }, mine: boolean): PostState {
  const next: PostState = { ...p, series: p.series.map((x) => ({ ...x, wins: [...x.wins] as [number, number], games: x.games.slice() })) };
  const sr = openSeries(next);
  if (!sr) return next;
  const no = sr.games.length + 1;
  sr.games.push({ no, date: next.date, away: g.away, home: g.home, s: g.score, inn: g.innings, mine: mine || undefined });
  const [as, hs] = g.score;
  const win = as > hs ? g.away : hs > as ? g.home : null;
  if (win) sr.wins[win === sr.hi ? 0 : 1] += 1;
  else sr.draws += 1;
  const need = NEED[sr.id];
  if (!win && sr.id === 'wc') sr.winner = sr.hi; // WC 무승부 — 4위 진출
  else if (sr.wins[0] >= need[0]) sr.winner = sr.hi;
  else if (sr.wins[1] >= need[1]) sr.winner = sr.lo;
  else if (sr.games.length >= BASE_GAMES[sr.id] + 2) sr.winner = sr.wins[1] > sr.wins[0] ? sr.lo : sr.hi;
  next.n += 1;
  next.date = addDays(next.date, 1);
  if (sr.winner) {
    const i = SERIES_ORDER.indexOf(sr.id);
    const up = SERIES_ORDER[i + 1];
    if (up) {
      next.series.push({ id: up, hi: next.seeds[HI_SEED[up]], lo: sr.winner, wins: [0, 0], draws: 0, games: [] });
      next.date = addDays(next.date, 1); // 시리즈 사이 하루 쉼
    } else {
      next.champion = sr.winner;
    }
  }
  return next;
}

const loadSim = () => import('./sim');

/** 다른 구단 경기 하나 계산해 넣기 (내 경기면 안 함 — 경기 화면에서 봐야 한다) */
export async function playOtherPostGame(): Promise<PostGameRec | null> {
  const p = postOf() ?? startPost();
  const nx = nextPostGame(p ?? undefined);
  if (!p || !nx || nx.mine) return null;
  const sim = await loadSim();
  const s = getSeason();
  const run = sim.runGame(s.seed, 1000 + p.n, nx.date, nx.away, nx.home, { post: true });
  const np = apply(p, { away: nx.away, home: nx.home, score: run.out.score, innings: run.out.innings }, false);
  setPost(np);
  const sr = np.series.find((x) => x.id === nx.series.id)!;
  return sr.games[sr.games.length - 1];
}
/** 다음 내 경기까지(또는 끝까지) 다른 구단 경기를 모두 계산 */
export async function playOthersUntilMine(): Promise<void> {
  for (let k = 0; k < 40; k++) {
    const nx = nextPostGame();
    if (!nx || nx.mine) return;
    await playOtherPostGame();
  }
}
/** 내 다음 포스트시즌 경기 계산 (기록과 함께) — 경기 화면이 이닝별로 보여 준다 */
export async function preparePostMyGame(): Promise<{ run: GameRun; away: string; home: string; date: string; no: number; series: SeriesRec } | null> {
  await playOthersUntilMine();
  const p = postOf();
  const nx = nextPostGame(p);
  if (!p || !nx || !nx.mine) return null;
  const sim = await loadSim();
  const roster = myRoster();
  const run = sim.runGame(getSeason().seed, 1000 + p.n, nx.date, nx.away, nx.home, { post: true, log: true, ...(nx.away === ME.teamId ? { away: roster } : { home: roster }) });
  return { run, away: nx.away, home: nx.home, date: nx.date, no: nx.no, series: nx.series };
}
/** 내 경기를 끝까지 본 뒤 결과 넣기 (같은 경기를 두 번 넣지 않게 차전 · 날짜를 확인) */
export function finishPostMyGame(m: { away: string; home: string; date: string; no: number }, run: GameRun) {
  const p = postOf();
  const nx = nextPostGame(p);
  if (!p || !nx || !nx.mine || nx.no !== m.no || nx.date !== m.date || nx.away !== m.away) return;
  setPost(apply(p, { away: m.away, home: m.home, score: run.out.score, innings: run.out.innings }, true));
  // [경기 기록] 포스트시즌 내 경기 박스스코어 (season/box — 키 p<n>, n = 이 경기 앞까지 치른 포스트시즌 경기 수)
  savePostBox(getSeason(), p.n, nx.series.id, m.no, run);
}
/** 시리즈 상황 글 — '사자즈 2승 1패 · 4차전' */
export function seriesLine(sr: SeriesRec, teamShort: (id: string) => string) {
  const w = `${teamShort(sr.hi)} ${sr.wins[0]} : ${sr.wins[1]} ${teamShort(sr.lo)}${sr.draws ? ` (무 ${sr.draws})` : ''}`;
  return sr.winner ? `${w} — ${teamShort(sr.winner)} 진출` : w;
}
