// 정규 시즌 일정 — 개막(3월 넷째 주 토요일, 2027년은 3월 27일)부터 구단마다 135경기. 시즌 연도는 setScheduleYear 로(2027 → 2028 …). 상대 9구단과 15경기씩(세계관 · 기획서 14.1 '정규 135경기, 상대마다 15경기').
// 3연전 45번 = 9판 × 5바퀴, 바퀴마다 홈/원정을 뒤집는다. 월요일과 7월 중순 별빛 올스타 휴식(목~일)은 쉰다 → 9월 초에 끝.
// 첫 3연전은 목업 '다음 경기'(NEXT_GAME)와 같은 상대·홈/원정. 비로 취소된 경기는 시즌 끝 뒤 빈 날로 다시 잡는다(store 가 들고 있음).
// KBO 식 144경기로 바꾸려면 PER_OPP 를 16 으로 (마지막 바퀴는 남는 경기 수만큼 짧은 시리즈) — 세계관·구단 선택 화면의 '135경기' 글도 같이.
import { ME, NEXT_GAME, TEAMS } from '../game/mock';

/** 상대 구단마다 경기 수 */
export const PER_OPP = 15;
/** 구단마다 정규 시즌 경기 수 (= 정규 경기일 수 — 날마다 모든 구단이 한 경기씩) */
export const SEASON_GAMES = PER_OPP * (TEAMS.length - 1);
/** 0부터 센 첫 경기일 (개막전) */
export const FIRST_DAY = 0;
/** 일정을 짤 시즌 연도 — season/store 가 시즌을 불러올 때 맞춘다 */
let YEAR = 2027;
let cache: DayGames[] | null = null;
export function setScheduleYear(y: number) {
  if (y === YEAR) return;
  YEAR = y;
  cache = null;
  breakCache = null;
}
export const scheduleYear = () => YEAR;
/** 그 해 개막일 — 3월 22~28일 사이 토요일 (2027년 3월 27일) */
export function openingDate(y = YEAR) {
  const t = Date.UTC(y, 2, 22);
  const dow = new Date(t).getUTCDay();
  return toDate(t + ((6 - dow + 7) % 7) * DAY_MS);
}
/** 별빛 올스타 휴식 (경기 없음) — 7월 12~18일 사이 목요일부터 일요일까지 (2027년 7월 15~18일) */
let breakCache: [string, string] | null = null;
export function allstarBreak(y = YEAR): readonly [string, string] {
  if (y === YEAR && breakCache) return breakCache;
  const t = Date.UTC(y, 6, 12);
  const thu = t + ((4 - new Date(t).getUTCDay() + 7) % 7) * DAY_MS;
  const out: [string, string] = [toDate(thu), toDate(thu + 3 * DAY_MS)];
  if (y === YEAR) breakCache = out;
  return out;
}
/** 예전 이름 — 2027 개막일 (화면 기본값) */
export const OPENING_DATE = '2027-03-27';

export interface DayGames { day: number; date: string; games: [string, string][] }

const pad = (n: number) => String(n).padStart(2, '0');
const toDate = (t: number) => { const d = new Date(t); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const parse = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
const DAY_MS = 86400000;
/** 경기 없는 날 — 월요일 · 올스타 휴식 */
const offDay = (t: number) => {
  if (new Date(t).getUTCDay() === 1) return true;
  const d = toDate(t), br = allstarBreak(Number(d.slice(0, 4)));
  return d >= br[0] && d <= br[1];
};

/** 그 날짜 다음 경기일 (월요일 · 올스타 휴식 건너뜀) */
export function nextGameDate(date: string): string {
  let t = parse(date) + DAY_MS;
  while (offDay(t)) t += DAY_MS;
  return toDate(t);
}
/** 두 날짜 사이 날 수 (b − a) */
export const daysBetween = (a: string, b: string) => Math.round((parse(b) - parse(a)) / DAY_MS);
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

/** 정규 시즌 전체 (개막전부터 135번째 경기일까지) */
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
  // 기본 홈/원정 — 지금까지 홈이 적은 쪽이 홈 (구단마다 9판 중 4~5판 홈 → 시즌 홈 경기 66~69).
  // 첫 판(내 구단 vs 상대)은 목업 다음 경기의 홈/원정 그대로
  const homes = new Map<string, number>(arr.map((id) => [id, 0]));
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    for (let k = 0; k < n / 2; k++) {
      const a = rot[k], b = rot[n - 1 - k];
      const ha = homes.get(a)!, hb = homes.get(b)!;
      const aHome = r === 0 && k === 0 ? (a === me ? NEXT_GAME.home : !NEXT_GAME.home) : ha !== hb ? ha < hb : (r + k) % 2 === 1;
      homes.set(aHome ? a : b, (aHome ? ha : hb) + 1);
      pairs.push(aHome ? [b, a] : [a, b]); // [원정, 홈]
    }
    rounds.push(pairs);
    rot.splice(1, 0, rot.pop()!);
  }
  const out: DayGames[] = [];
  let date = openingDate();
  let day = FIRST_DAY;
  // 한 바퀴 = 9판 × 3연전 (마지막 바퀴는 남은 경기 수만큼). 바퀴마다 홈/원정 뒤집기
  const laps = Math.ceil(PER_OPP / 3);
  for (let lap = 0; lap < laps; lap++) {
    const len = Math.min(3, PER_OPP - lap * 3);
    const flip = lap % 2 === 1;
    for (const base of rounds) {
      const games = base.map(([a, b]) => (flip ? [b, a] : [a, b]) as [string, string]);
      for (let k = 0; k < len; k++) {
        out.push({ day, date, games });
        day++;
        date = nextGameDate(date);
      }
    }
  }
  cache = out;
  return out;
}

/** 취소된 경기를 시즌 끝 뒤로 — 하루에 한 구단 한 경기 */
export function rescheduled(postponed: [string, string][]): DayGames[] {
  const reg = regularDays();
  const out: DayGames[] = [];
  let date = nextGameDate(reg[reg.length - 1].date);
  let day = reg.length;
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
