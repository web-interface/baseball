// 2027 정규 시즌 남은 일정 — 목업 순위표가 71경기를 치른 상태라, 72번째 경기(6월 15일 화)부터 135번째까지 64일.
// 3연전 21번 + 마지막 하루. 월요일은 쉰다. 첫 3연전은 목업 '다음 경기'(NEXT_GAME)와 같은 상대·홈/원정.
// 비로 취소된 경기는 시즌 끝 뒤 빈 날로 다시 잡는다(store 가 들고 있음).
import { ME, NEXT_GAME, TEAMS } from '../game/mock';

export const FIRST_DAY = 71;          // 0부터 센 경기일 — 72번째 경기
export const SEASON_GAMES = 135;
export const FIRST_DATE = '2027-06-15';

export interface DayGames { day: number; date: string; games: [string, string][] }

const pad = (n: number) => String(n).padStart(2, '0');
const toDate = (t: number) => { const d = new Date(t); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const parse = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
const DAY_MS = 86400000;

/** 그 날짜 다음 경기일 (월요일 건너뜀) */
export function nextGameDate(date: string): string {
  let t = parse(date) + DAY_MS;
  while (new Date(t).getUTCDay() === 1) t += DAY_MS;
  return toDate(t);
}
/** '2027-06-15' → '6.15' */
export const shortDate = (date: string) => `${Number(date.slice(5, 7))}.${Number(date.slice(8, 10))}`;
/** '2027-06-15' → '6월 15일 (화)' */
export function longDate(date: string) {
  const d = new Date(parse(date));
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${'일월화수목금토'[d.getUTCDay()]})`;
}
/** 경기 시작 시각 — 평일 18:30 · 토 17:00 · 일 14:00 */
export function startTime(date: string) {
  const dow = new Date(parse(date)).getUTCDay();
  return dow === 6 ? '17:00' : dow === 0 ? '14:00' : '18:30';
}

let cache: DayGames[] | null = null;
/** 남은 정규 시즌 (72~135번째 경기일) */
export function regularDays(): DayGames[] {
  if (cache) return cache;
  const me = ME.teamId;
  const opp = NEXT_GAME.opponentId;
  // 원형 순환 — 0번(내 구단)은 고정, 첫 판에 상대가 마지막 자리
  const others = TEAMS.map((t) => t.id).filter((id) => id !== me && id !== opp);
  const arr = [me, ...others, opp];
  const n = arr.length;
  const rounds: [string, string][][] = [];
  const rot = arr.slice();
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    for (let k = 0; k < n / 2; k++) {
      const a = rot[k], b = rot[n - 1 - k];
      pairs.push((r + k) % 2 === 0 ? [b, a] : [a, b]); // [원정, 홈]
    }
    rounds.push(pairs);
    rot.splice(1, 0, rot.pop()!);
  }
  // 첫 판(내 구단 vs 상대)의 홈/원정을 목업 다음 경기에 맞춘다
  const p0 = rounds[0].findIndex(([a, b]) => a === me || b === me);
  const wantHome = NEXT_GAME.home;
  if ((rounds[0][p0][1] === me) !== wantHome) rounds[0][p0] = [rounds[0][p0][1], rounds[0][p0][0]];
  const out: DayGames[] = [];
  let date = FIRST_DATE;
  let day = FIRST_DAY;
  let r = 0;
  while (day < SEASON_GAMES) {
    const base = rounds[r % rounds.length];
    // 한 바퀴(9판)마다 홈/원정을 뒤집는다
    const flip = Math.floor(r / rounds.length) % 2 === 1;
    const games = base.map(([a, b]) => (flip ? [b, a] : [a, b]) as [string, string]);
    for (let k = 0; k < 3 && day < SEASON_GAMES; k++) {
      out.push({ day, date, games });
      day++;
      date = nextGameDate(date);
    }
    r++;
  }
  cache = out;
  return out;
}

/** 취소된 경기를 시즌 끝 뒤로 — 하루에 한 구단 한 경기 */
export function rescheduled(postponed: [string, string][]): DayGames[] {
  const reg = regularDays();
  const out: DayGames[] = [];
  let date = nextGameDate(reg[reg.length - 1].date);
  let day = SEASON_GAMES;
  let todo = postponed.slice();
  while (todo.length) {
    const used = new Set<string>();
    const today: [string, string][] = [];
    const rest: [string, string][] = [];
    for (const g of todo) {
      if (!used.has(g[0]) && !used.has(g[1])) { today.push(g); used.add(g[0]); used.add(g[1]); } else rest.push(g);
    }
    out.push({ day, date, games: today });
    todo = rest;
    day++;
    date = nextGameDate(date);
  }
  return out;
}
