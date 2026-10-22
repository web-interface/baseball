// 시즌 상태 — 순위표 · 날마다 결과 · 선수 시즌 기록 · 소식 · 내 경기. 지금은 이 기기(localStorage)에만 둔다(서버 저장은 다음 단계).
// 2027 개막일(3월 27일 토)에 모든 구단 0승 0무 0패로 시작해, 친 경기만 쌓는다(목업 순위표는 쓰지 않는다).
// 헤더 · 홈 · 순위 탭 · 시즌 빨리 감기 · 경기 화면은 모두 이 파일의 standingsOf · teamLine · batLine · pitLine 을 쓴다 — 어디서 봐도 같은 값.
// 저장 형식 2(bb.season.v2). 예전 형식 1(목업 71경기 뒤 6월 15일부터 이어 치던 것)은 일정이 달라 이어 쓸 수 없어 지우고 새 시즌으로(안내 한 줄).
// 시즌은 내 구단(ME.teamId — 구단 선택에서 고른 구단)의 것 — 내 구단이 바뀌면 새 시즌으로 시작한다.
import { useSyncExternalStore } from 'react';
import { ME, TEAMS, playerById, teamById } from '../game/mock';
import type { LineupState } from '../screens/lineup/calc';
import { FIRST_DAY, OPENING_DATE, SEASON_GAMES, regularDays, rescheduled, type DayGames } from './schedule';
import type { BatRow, GameOut, PitRow } from './sim';

export interface TeamRec { w: number; d: number; l: number; rs: number; ra: number; streak: number; last10: string }
export interface GameRec { a: string; h: string; s: [number, number]; inn?: number; wo?: 1; c?: 1 }
export type NewsKind = '연승' | '연패' | '기록' | '부상' | '취소' | '끝내기' | '역전' | '노히트' | '내 경기' | '순위' | '시즌';
export interface NewsRec { idx: number; date: string; kind: NewsKind; text: string; team?: string; mine?: boolean }
export interface MyGameRec {
  idx: number; date: string; opp: string; home: boolean; my: number; their: number; res: 'W' | 'L' | 'D'; inn: number; wo?: boolean;
  /** 이닝 점수 [원정, 홈] · 안타 · 실책 · 승/패/세이브 투수 — 홈 '지난 경기' 점수판 */
  line?: [number[], number[]]; hits?: [number, number]; errors?: [number, number]; dec?: { w?: string; l?: string; s?: string };
}
type BatAgg = { team: string; G: number; PA: number; AB: number; H: number; D: number; T: number; HR: number; RBI: number; R: number; BB: number; SO: number; SB: number };
type PitAgg = { team: string; G: number; GS: number; outs: number; H: number; R: number; ER: number; BB: number; SO: number; HR: number; W: number; L: number; SV: number; HLD: number };
export interface SeasonState {
  v: 2;
  /** 이 시즌을 치르는 내 구단 (구단 선택에서 고른 구단) */
  club: string;
  seed: string;
  /** 다음에 칠 날 (allDays 의 순번, 0 = 개막전) */
  next: number;
  table: Record<string, TeamRec>;
  /** 친 날마다 결과 (순번 = allDays 순번) */
  results: GameRec[][];
  postponed: [string, string][];
  bat: Record<string, BatAgg>;
  pit: Record<string, PitAgg>;
  news: NewsRec[];
  my: MyGameRec[];
  /** 친 날마다 순위 (구단 → 순위 배열, 공동 순위 그대로) — 순위 경쟁 그래프 */
  rankHist: Record<string, number[]>;
  /** 보는 중인 내 경기 — 다시 열어도 같은 경기가 되게 라인업을 얼려 둔다 (started: 경기를 시작함 — 그 뒤로는 라인업을 바꿔도 그대로) */
  pending?: { idx: number; snap: LineupState; started?: boolean };
  /** 내 마지막 경기에 쓴 라인업 — 홈 '지난 경기'가 같은 경기를 다시 계산해 승리 확률 흐름 · 명장면을 보여 준다 */
  lastSnap?: { idx: number; snap: LineupState };
  /** 한 번 보여 줄 안내 (예전 저장 정리) — Shell 이 토스트로 띄우고 지운다 */
  notice?: string;
}

const KEY = 'bb.season.v2';
/** 다시 불러온 뒤 한 번 보여 줄 안내 { club, text } — bb.season* 가 아닌 이름(리그 구성이 바뀌면 bb.season* 은 지워진다) */
const NOTICE_KEY = 'bb.notice';
/** 예전 형식 — 보이면 지우고 새로 시작 */
const OLD_KEYS = ['bb.season.v1'];
const listeners = new Set<() => void>();
let state: SeasonState | null = null;

const emptyRec = (): TeamRec => ({ w: 0, d: 0, l: 0, rs: 0, ra: 0, streak: 0, last10: '' });
/** '로/으로' — 끝 글자 받침(ㄹ 빼고)이 있으면 '으로' */
const ro = (word: string) => { const c = word.charCodeAt(word.length - 1) - 0xac00; const j = c >= 0 && c < 11172 ? c % 28 : 0; return word + (j === 0 || j === 8 ? '로' : '으로'); };
const newSeed = () => {
  try { return Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join(''); } catch { return String(Date.now()); }
};
/** 개막일 — 모든 구단 0승 0무 0패 */
function fresh(): SeasonState {
  const table: Record<string, TeamRec> = {};
  const rankHist: Record<string, number[]> = {};
  for (const t of TEAMS) { table[t.id] = emptyRec(); rankHist[t.id] = []; }
  return { v: 2, club: ME.teamId, seed: newSeed(), next: FIRST_DAY, table, results: [], postponed: [], bat: {}, pit: {}, news: [], my: [], rankHist };
}
/** 경기 화면이 '본 경기'로 적어 둔 시즌 경기 표시 — 새 시즌에서 같은 순번 경기를 본 것으로 착각하지 않게 지운다 */
function clearSeen() {
  try { for (const k of Object.keys(localStorage)) if (k.startsWith('bb.match.seen.s27-')) localStorage.removeItem(k); } catch { /* */ }
}
/** 개발 서버: 주소에 reset=season 이 있으면 시즌을 처음(개막일)부터 — 스크린샷 · 시험용 */
const devReset = () => {
  try { return import.meta.env.DEV && /[?&]reset=season\b/.test(location.hash + location.search); } catch { return false; }
};
const valid = (v: SeasonState | null): v is SeasonState =>
  !!v && v.v === 2 && !!v.table && Array.isArray(v.results) && Array.isArray(v.my) && TEAMS.every((t) => !!v.table[t.id]);

function load(): SeasonState {
  if (state) return state;
  let notice: string | undefined;
  try {
    if (devReset()) { localStorage.removeItem(KEY); clearSeen(); }
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw) as SeasonState;
      if (valid(v) && v.club === ME.teamId) { state = v; return v; }
      // 다른 구단으로 치던 시즌 — 구단 선택에서 구단을 바꿨다 (진행이 있었으면 알려 준다)
      if (valid(v) && v.next > 0) notice = `내 구단이 ${ro(teamById(ME.teamId).name)} 바뀌어 2027 개막전부터 새로 시작해요`;
    }
    if (OLD_KEYS.some((k) => localStorage.getItem(k) != null)) {
      for (const k of OLD_KEYS) localStorage.removeItem(k);
      clearSeen();
      notice = '예전 진행(6월 15일부터 이어 치던 기록)은 새 일정과 맞지 않아 정리했어요 — 2027 개막전부터 새로 시작해요';
    }
  } catch { /* 새로 */ }
  state = fresh();
  // 구단 선택 '개막'이 남긴 안내 (그 구단으로 다시 떴을 때만)
  try {
    const raw = localStorage.getItem(NOTICE_KEY);
    const nx = raw ? (JSON.parse(raw) as { club?: string; text?: string }) : null;
    if (nx?.club === ME.teamId && nx.text) { notice = nx.text; localStorage.removeItem(NOTICE_KEY); }
  } catch { /* */ }
  if (notice) state.notice = notice;
  persist(); // 시드를 바로 적어 둔다 — 첫 경기 전에 다시 열어도 같은 날씨 · 같은 비 취소
  return state;
}
function persist() {
  try { if (state) localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* 저장이 막히면 이번 방문만 */ }
}
function save() {
  if (!state) return;
  state = { ...state }; // 새 참조 — useSyncExternalStore 가 바뀐 줄 알게
  persist();
  listeners.forEach((l) => l());
}

export const getSeason = (): SeasonState => load();
export function useSeason(): SeasonState {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, load);
}
/** 처음부터 다시 (2027 개막일 · 모든 구단 0승 0무 0패) */
export function resetSeason() { clearSeen(); state = fresh(); save(); }
/** 저장된 시즌을 지운다 — 구단을 바꿔 화면을 다시 불러오기 직전(다시 뜨면 새 구단으로 개막일부터, 안내 없이) */
export function clearSeason() {
  try { localStorage.removeItem(KEY); for (const k of OLD_KEYS) localStorage.removeItem(k); } catch { /* */ }
  clearSeen();
  state = null;
}
/** 화면을 다시 불러온 뒤(새 내 구단으로) 한 번 보여 줄 안내 */
export function setNextNotice(text: string, club: string) {
  try { localStorage.setItem(NOTICE_KEY, JSON.stringify({ club, text })); } catch { /* */ }
}
/** 한 번 보여 줄 안내를 꺼내고 지운다 */
export function takeNotice(): string | undefined {
  const s = load();
  if (!s.notice) return undefined;
  const n = s.notice;
  delete s.notice;
  persist();
  return n;
}

/* ───────── 일정 ───────── */
/** 정규 + (정규가 끝났으면) 비로 밀린 경기 */
export function allDays(s: SeasonState = load()): DayGames[] {
  const reg = regularDays();
  return s.postponed.length ? [...reg, ...rescheduled(s.postponed)] : reg;
}
export const isOver = (s: SeasonState = load()) => s.next >= allDays(s).length;
/** 아직 개막 전 (리그 전체가 한 경기도 안 침) */
export const notStarted = (s: SeasonState = load()) => s.next === 0;
export const regularCount = () => regularDays().length;
/** '오늘' — 다음에 칠 날의 날짜 (시즌이 끝났으면 마지막 날) */
export function seasonToday(s: SeasonState = load()): string {
  const days = allDays(s);
  return days[Math.min(s.next, days.length - 1)]?.date ?? OPENING_DATE;
}
/** 그날 내 구단 경기 [원정, 홈] */
export const myGameOf = (d: DayGames) => d.games.find(([a, h]) => a === ME.teamId || h === ME.teamId);
/** 지금까지 그 구단 경기 수 */
export const gamesPlayed = (teamId: string, s: SeasonState = load()) => { const r = s.table[teamId]; return r ? r.w + r.d + r.l : 0; };

/* ───────── 순위 ───────── */
export interface StandRow {
  teamId: string; w: number; d: number; l: number;
  /** 승률 (승 ÷ (승 + 패), 무승부 빼고) — 아직 승패가 없으면 0 */
  pct: number;
  gb: number; streak: string;
  /** 최근 10경기 (최근 것이 앞) */
  last10: string;
  rs: number; ra: number; g: number;
  /** 순위 — 승률이 같으면 공동 순위 (개막일엔 모두 1위) */
  rank: number;
}
/** 순위 매길 때 승률 — 승패가 없는 구단은 5할로 (1승 0패 아래 · 0승 1패 위, 게임 차와 같은 순서) */
const rankPct = (r: { w: number; l: number }) => (r.w + r.l ? r.w / (r.w + r.l) : 0.5);
export function standingsOf(s: SeasonState = load()): StandRow[] {
  const order = new Map(TEAMS.map((t, i) => [t.id, i]));
  const rows: StandRow[] = TEAMS.map((t) => {
    const r = s.table[t.id] ?? emptyRec();
    const pct = r.w + r.l ? r.w / (r.w + r.l) : 0;
    return { teamId: t.id, w: r.w, d: r.d, l: r.l, pct, gb: 0, streak: r.streak > 0 ? `${r.streak}승` : r.streak < 0 ? `${-r.streak}패` : '-', last10: r.last10, rs: r.rs, ra: r.ra, g: r.w + r.d + r.l, rank: 1 };
  }).sort((a, b) => rankPct(b) - rankPct(a) || (b.w - b.l) - (a.w - a.l) || b.w - a.w || (b.rs - b.ra) - (a.rs - a.ra) || order.get(a.teamId)! - order.get(b.teamId)!);
  const top = rows[0];
  rows.forEach((r, i) => {
    r.gb = ((top.w - r.w) + (r.l - top.l)) / 2;
    const prev = rows[i - 1];
    r.rank = prev && Math.abs(rankPct(prev) - rankPct(r)) < 1e-9 ? prev.rank : i + 1;
  });
  return rows;
}
export const rankOf = (teamId: string, s: SeasonState = load()) => standingsOf(s).find((r) => r.teamId === teamId)?.rank ?? 0;
/** 승률 글자 — '.583', 승패가 없으면 '-' */
export const pctLabel = (r: { w: number; l: number }) => (r.w + r.l ? (r.w / (r.w + r.l)).toFixed(3).replace(/^0/, '') : '-');
/** 게임 차 글자 — 1위는 '—' */
export const gbLabel = (r: { gb: number }) => (r.gb === 0 ? '—' : r.gb.toFixed(1));

export interface TeamLine {
  /** 순위 (공동 포함) */
  rank: number;
  /** 같은 순위 구단이 더 있나 (공동) */
  tied: boolean;
  row: StandRow;
  /** 친 경기 · 남은 경기 (정규 135 기준) · 다음은 몇 번째 경기 */
  played: number; left: number; nextNo: number;
  /** 최근 10경기 (옛 것 → 최근, 화면 왼쪽부터) */
  form: string;
  /** 리그가 개막했나 (개막 전엔 순위 대신 '개막 전') */
  started: boolean;
}
/** 구단 한 줄 — 헤더 · 홈 · 시즌 화면 · 경기 끝이 모두 이 값을 쓴다 */
export function teamLine(teamId: string, s: SeasonState = load()): TeamLine {
  const rows = standingsOf(s);
  const row = rows.find((r) => r.teamId === teamId) ?? rows[0];
  const played = row.g;
  return {
    rank: row.rank, tied: rows.some((r) => r !== row && r.rank === row.rank), row,
    played, left: Math.max(0, SEASON_GAMES - played), nextNo: played + 1,
    form: [...row.last10].reverse().join(''), started: !notStarted(s),
  };
}
/** 순위 글자 — '3위' · '공동 3위' · 개막 전이면 '개막 전' */
export const rankLabel = (ln: TeamLine, short = false) => (!ln.started ? '개막 전' : `${ln.tied && !short ? '공동 ' : ''}${ln.rank}위`);

/* ───────── 선수 시즌 기록 (개막부터 친 경기) ───────── */
export interface BatLine { g: number; pa: number; ab: number; h: number; hr: number; rbi: number; sb: number; bb: number; so: number; avg: number }
export interface PitLine { g: number; gs: number; w: number; l: number; sv: number; hld: number; outs: number; er: number; so: number; era: number }
export function batLine(id: string, s: SeasonState = load()): BatLine {
  const a = s.bat[id];
  if (!a) return { g: 0, pa: 0, ab: 0, h: 0, hr: 0, rbi: 0, sb: 0, bb: 0, so: 0, avg: 0 };
  return { g: a.G, pa: a.PA, ab: a.AB, h: a.H, hr: a.HR, rbi: a.RBI, sb: a.SB, bb: a.BB, so: a.SO, avg: a.AB ? a.H / a.AB : 0 };
}
export function pitLine(id: string, s: SeasonState = load()): PitLine {
  const a = s.pit[id];
  if (!a) return { g: 0, gs: 0, w: 0, l: 0, sv: 0, hld: 0, outs: 0, er: 0, so: 0, era: 0 };
  return { g: a.G, gs: a.GS, w: a.W, l: a.L, sv: a.SV, hld: a.HLD, outs: a.outs, er: a.ER, so: a.SO, era: a.outs ? (a.ER * 27) / a.outs : 0 };
}
/** 타율 글자 — 타수가 없으면 '-' */
export const avgLabel = (b: BatLine) => (b.ab ? b.avg.toFixed(3).replace(/^0/, '') : '-');
/** 평균자책 글자 — 아웃이 없으면 '-' */
export const eraLabel = (p: PitLine) => (p.outs ? p.era.toFixed(2) : '-');

/* ───────── 하루 결과 넣기 ───────── */
export interface DayOutcome {
  idx: number;
  /** 친 경기 (취소는 cancelled) */
  games: (GameOut | { cancelled: true; away: string; home: string })[];
  /** 내 경기에 쓴 라인업 (내 경기가 열렸을 때) */
  mySnap?: LineupState;
}
export interface DayHighlight { kind: 'walkoff' | 'nohit' | 'comeback' | 'extra' | 'blowout'; text: string; game: GameOut }

const isGame = (g: DayOutcome['games'][number]): g is GameOut => !('cancelled' in g);
const tShort = (id: string) => teamById(id).short;
const pName = (id: string) => playerById(id)?.name ?? '선수';

/** 하루 결과를 순위표·기록·소식에 넣고 다음 날로. 강조할 경기(끝내기·노히트·대역전)를 돌려준다 */
export function applyDay(out: DayOutcome): DayHighlight[] {
  const s = load();
  const days = allDays(s);
  const d = days[out.idx];
  if (!d || out.idx !== s.next) return [];
  const recs: GameRec[] = [];
  const hl: DayHighlight[] = [];
  const news: NewsRec[] = [];
  const isRegular = out.idx < regularCount();
  const cancelled = out.games.filter((g) => !isGame(g)) as { cancelled: true; away: string; home: string }[];
  for (const c of cancelled) { recs.push({ a: c.away, h: c.home, s: [0, 0], c: 1 }); if (isRegular) s.postponed.push([c.away, c.home]); }
  if (cancelled.length) news.push({ idx: out.idx, date: d.date, kind: '취소', text: `${/0[67]-/.test(d.date.slice(5)) ? '장마' : '비'}로 ${cancelled.length}경기 취소 — 시즌 끝에 다시 열려요`, mine: cancelled.some((c) => c.away === ME.teamId || c.home === ME.teamId) });
  let myPlayed = false;
  for (const g of out.games.filter(isGame)) {
    const [as, hs] = g.score;
    recs.push({ a: g.away, h: g.home, s: [as, hs], inn: g.innings, ...(g.walkoff ? { wo: 1 as const } : {}) });
    const res = (team: string, mine: number, opp: number) => {
      const r = (s.table[team] ??= emptyRec());
      r.rs += mine; r.ra += opp;
      const ch = mine > opp ? 'W' : mine < opp ? 'L' : 'D';
      if (ch === 'W') { r.w++; r.streak = r.streak > 0 ? r.streak + 1 : 1; } else if (ch === 'L') { r.l++; r.streak = r.streak < 0 ? r.streak - 1 : -1; } else { r.d++; }
      r.last10 = (ch + r.last10).slice(0, 10);
      if (Math.abs(r.streak) >= 5 && (Math.abs(r.streak) === 5 || Math.abs(r.streak) % 2 === 0)) news.push({ idx: out.idx, date: d.date, kind: r.streak > 0 ? '연승' : '연패', text: `${tShort(team)} ${Math.abs(r.streak)}${r.streak > 0 ? '연승' : '연패'}`, team, mine: team === ME.teamId });
    };
    res(g.away, as, hs);
    res(g.home, hs, as);
    // 선수 기록
    for (const b of g.bat) addBat(s, b);
    for (const p of g.pit) addPit(s, p);
    // 소식 · 강조
    const winner = as > hs ? g.away : hs > as ? g.home : null;
    const mine = g.away === ME.teamId || g.home === ME.teamId;
    if (g.walkoff) { hl.push({ kind: 'walkoff', text: `${tShort(g.home)} 끝내기 — ${tShort(g.away)}에 ${hs}:${as}`, game: g }); news.push({ idx: out.idx, date: d.date, kind: '끝내기', text: `${tShort(g.home)}, ${g.innings}회말 끝내기로 ${tShort(g.away)}를 꺾었어요`, team: g.home, mine }); }
    for (const side of [0, 1] as const) {
      const allowed = g.hits[1 - side];
      if (allowed === 0 && g.innings >= 9) {
        const team = side === 0 ? g.away : g.home;
        hl.push({ kind: 'nohit', text: `${tShort(team)} 노히트노런!`, game: g });
        news.push({ idx: out.idx, date: d.date, kind: '노히트', text: `${tShort(team)} 투수진 노히트노런 — ${tShort(side === 0 ? g.home : g.away)} 타선 무안타`, team, mine });
      }
    }
    if (winner) {
      // 이닝별로 따져 이긴 팀이 4점 이상 뒤졌다 뒤집었나
      let a = 0, h = 0, worst = 0;
      const n = Math.max(g.line[0].length, g.line[1].length);
      for (let k = 0; k < n; k++) {
        a += g.line[0][k] ?? 0;
        worst = Math.min(worst, winner === g.home ? h - a : a - h);
        h += g.line[1][k] ?? 0;
        worst = Math.min(worst, winner === g.home ? h - a : a - h);
      }
      if (worst <= -4) { hl.push({ kind: 'comeback', text: `${tShort(winner)} ${-worst}점 차 대역전`, game: g }); news.push({ idx: out.idx, date: d.date, kind: '역전', text: `${tShort(winner)}, ${-worst}점 차를 뒤집었어요 (${as}:${hs})`, team: winner, mine }); }
    }
    if (g.innings >= 12 && as === hs) hl.push({ kind: 'extra', text: `${tShort(g.away)}·${tShort(g.home)} 12회 무승부`, game: g });
    // 개인 기록
    for (const b of g.bat) {
      if (b.HR >= 3) news.push({ idx: out.idx, date: d.date, kind: '기록', text: `${pName(b.id)}(${tShort(b.team)}) 한 경기 홈런 ${b.HR}개`, team: b.team, mine: b.team === ME.teamId });
      else if (b.H >= 5) news.push({ idx: out.idx, date: d.date, kind: '기록', text: `${pName(b.id)}(${tShort(b.team)}) 5안타 경기`, team: b.team, mine: b.team === ME.teamId });
    }
    for (const p of g.pit) if (p.SO >= 12) news.push({ idx: out.idx, date: d.date, kind: '기록', text: `${pName(p.id)}(${tShort(p.team)}) 탈삼진 ${p.SO}개`, team: p.team, mine: p.team === ME.teamId });
    for (const inj of g.injuries) news.push({ idx: out.idx, date: d.date, kind: '부상', text: `${pName(inj.id)}(${tShort(inj.team)}) 경기 중 다쳐 교체`, team: inj.team, mine: inj.team === ME.teamId });
    if (mine) {
      myPlayed = true;
      const home = g.home === ME.teamId;
      const my = home ? hs : as, their = home ? as : hs;
      s.my.push({
        idx: out.idx, date: d.date, opp: home ? g.away : g.home, home, my, their, res: my > their ? 'W' : my < their ? 'L' : 'D', inn: g.innings, wo: g.walkoff || undefined,
        line: [g.line[0].slice(), g.line[1].slice()], hits: [g.hits[0], g.hits[1]], errors: [g.errors[0], g.errors[1]],
        dec: { w: g.decision.win, l: g.decision.loss, s: g.decision.save },
      });
    }
  }
  s.results[out.idx] = recs;
  // 순위 기록 (공동 순위 그대로)
  const order = standingsOf(s);
  order.forEach((r) => { (s.rankHist[r.teamId] ??= []).push(r.rank); });
  const lead = order[0];
  const leadHist = s.rankHist[lead.teamId];
  if (out.idx > 0 && leadHist.length > 1 && leadHist[leadHist.length - 2] !== 1) news.push({ idx: out.idx, date: d.date, kind: '순위', text: `${tShort(lead.teamId)} ${order[1]?.rank === 1 ? '공동 ' : ''}1위로`, team: lead.teamId, mine: lead.teamId === ME.teamId });
  s.news.push(...news);
  if (s.news.length > 160) s.news.splice(0, s.news.length - 160);
  // 내 경기에 쓴 라인업 (보는 중이던 경기면 얼려 둔 것)
  const snap = s.pending && s.pending.idx === out.idx ? s.pending.snap : out.mySnap;
  if (myPlayed && snap) s.lastSnap = { idx: out.idx, snap: JSON.parse(JSON.stringify(snap)) as LineupState };
  s.next = out.idx + 1;
  if (s.pending && s.pending.idx <= out.idx) delete s.pending;
  if (s.next >= allDays(s).length) s.news.push({ idx: out.idx, date: d.date, kind: '시즌', text: `정규 시즌 끝 — ${tShort(lead.teamId)} 1위`, team: lead.teamId });
  save();
  return hl;
}

function addBat(s: SeasonState, b: BatRow) {
  if (!b.id) return;
  const a = (s.bat[b.id] ??= { team: b.team, G: 0, PA: 0, AB: 0, H: 0, D: 0, T: 0, HR: 0, RBI: 0, R: 0, BB: 0, SO: 0, SB: 0 });
  a.G++; a.PA += b.PA; a.AB += b.AB; a.H += b.H; a.D += b.D; a.T += b.T; a.HR += b.HR; a.RBI += b.RBI; a.R += b.R; a.BB += b.BB; a.SO += b.SO; a.SB += b.SB;
}
function addPit(s: SeasonState, p: PitRow) {
  if (!p.id) return;
  const a = (s.pit[p.id] ??= { team: p.team, G: 0, GS: 0, outs: 0, H: 0, R: 0, ER: 0, BB: 0, SO: 0, HR: 0, W: 0, L: 0, SV: 0, HLD: 0 });
  a.G++; a.GS += p.GS; a.outs += p.outs; a.H += p.H; a.R += p.R; a.ER += p.ER; a.BB += p.BB; a.SO += p.SO; a.HR += p.HR; a.W += p.W; a.L += p.L; a.SV += p.SV; a.HLD += p.HLD;
}

/** 보는 중인 내 경기 표시 (라인업을 얼려 둠) */
export function setPending(idx: number, snap: LineupState) { const s = load(); s.pending = { idx, snap }; save(); }
/** 내 경기를 시작함 — 이제부터는 다시 열어도 얼린 라인업 그대로 (새로 고쳐 결과 바꾸기 막기) */
export function markPendingStarted(idx: number) {
  const s = load();
  if (s.pending && s.pending.idx === idx && !s.pending.started) { s.pending = { ...s.pending, started: true }; save(); }
}

/* ───────── 개인 기록 1위 (개막부터 친 경기) ───────── */
export interface Leader { key: string; label: string; id: string; team: string; value: string; sub: string }
export function leaders(s: SeasonState = load()): Leader[] {
  const out: Leader[] = [];
  const teamGames = Math.max(1, Math.round(s.my.length || s.next));
  const bats = Object.entries(s.bat);
  const pits = Object.entries(s.pit);
  const best = <T,>(list: [string, T][], score: (x: T) => number, ok: (x: T) => boolean = () => true) => list.filter(([, x]) => ok(x)).sort((a, b) => score(b[1]) - score(a[1]))[0];
  const avg = best(bats, (x) => x.H / Math.max(1, x.AB), (x) => x.PA >= teamGames * 3.1);
  if (avg) out.push({ key: 'avg', label: '타율', id: avg[0], team: avg[1].team, value: (avg[1].H / Math.max(1, avg[1].AB)).toFixed(3).replace(/^0/, ''), sub: `${avg[1].AB}타수 ${avg[1].H}안타` });
  const hr = best(bats, (x) => x.HR * 1000 + x.RBI);
  if (hr) out.push({ key: 'hr', label: '홈런', id: hr[0], team: hr[1].team, value: `${hr[1].HR}`, sub: `타점 ${hr[1].RBI}` });
  const rbi = best(bats, (x) => x.RBI * 1000 + x.HR);
  if (rbi) out.push({ key: 'rbi', label: '타점', id: rbi[0], team: rbi[1].team, value: `${rbi[1].RBI}`, sub: `홈런 ${rbi[1].HR}` });
  const sb = best(bats, (x) => x.SB * 1000 + x.H);
  if (sb && sb[1].SB > 0) out.push({ key: 'sb', label: '도루', id: sb[0], team: sb[1].team, value: `${sb[1].SB}`, sub: `안타 ${sb[1].H}` });
  const w = best(pits, (x) => x.W * 1000 - x.L);
  if (w) out.push({ key: 'w', label: '다승', id: w[0], team: w[1].team, value: `${w[1].W}`, sub: `${w[1].W}승 ${w[1].L}패` });
  const era = best(pits, (x) => -(x.ER * 27) / Math.max(1, x.outs), (x) => x.outs >= teamGames * 3);
  if (era) out.push({ key: 'era', label: '평균자책', id: era[0], team: era[1].team, value: ((era[1].ER * 27) / Math.max(1, era[1].outs)).toFixed(2), sub: `${Math.floor(era[1].outs / 3)}이닝` });
  const so = best(pits, (x) => x.SO * 1000 + x.outs);
  if (so) out.push({ key: 'so', label: '탈삼진', id: so[0], team: so[1].team, value: `${so[1].SO}`, sub: `${Math.floor(so[1].outs / 3)}이닝` });
  const sv = best(pits, (x) => x.SV * 1000 + x.HLD);
  if (sv && sv[1].SV > 0) out.push({ key: 'sv', label: '세이브', id: sv[0], team: sv[1].team, value: `${sv[1].SV}`, sub: `홀드 ${sv[1].HLD}` });
  return out;
}

export { FIRST_DAY, OPENING_DATE, SEASON_GAMES };
