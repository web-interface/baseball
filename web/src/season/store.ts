// 시즌 상태 — 순위표 · 날마다 결과 · 선수 시즌 기록(6월 15일부터) · 소식 · 내 경기. 지금은 이 기기(localStorage)에만 둔다(서버 저장은 다음 단계).
// 시작점은 목업 순위표(71경기) — 72번째 경기부터 이어서 친다.
import { useSyncExternalStore } from 'react';
import { ME, STANDINGS, TEAMS, playerById, teamById } from '../game/mock';
import type { LineupState } from '../screens/lineup/calc';
import { FIRST_DAY, SEASON_GAMES, regularDays, rescheduled, type DayGames } from './schedule';
import type { BatRow, GameOut, PitRow } from './sim';

export interface TeamRec { w: number; d: number; l: number; rs: number; ra: number; streak: number; last10: string }
export interface GameRec { a: string; h: string; s: [number, number]; inn?: number; wo?: 1; c?: 1 }
export type NewsKind = '연승' | '연패' | '기록' | '부상' | '취소' | '끝내기' | '역전' | '노히트' | '내 경기' | '순위' | '시즌';
export interface NewsRec { idx: number; date: string; kind: NewsKind; text: string; team?: string; mine?: boolean }
export interface MyGameRec { idx: number; date: string; opp: string; home: boolean; my: number; their: number; res: 'W' | 'L' | 'D'; inn: number; wo?: boolean }
type BatAgg = { team: string; G: number; PA: number; AB: number; H: number; D: number; T: number; HR: number; RBI: number; R: number; BB: number; SO: number; SB: number };
type PitAgg = { team: string; G: number; GS: number; outs: number; H: number; R: number; ER: number; BB: number; SO: number; HR: number; W: number; L: number; SV: number; HLD: number };
export interface SeasonState {
  v: 1;
  seed: string;
  /** 다음에 칠 날 (allDays 의 순번) */
  next: number;
  table: Record<string, TeamRec>;
  /** 친 날마다 결과 (순번 = allDays 순번) */
  results: GameRec[][];
  postponed: [string, string][];
  bat: Record<string, BatAgg>;
  pit: Record<string, PitAgg>;
  news: NewsRec[];
  my: MyGameRec[];
  /** 날마다 순위 (구단 → 순위 배열) — 순위 경쟁 그래프 */
  rankHist: Record<string, number[]>;
  /** 보는 중인 내 경기 — 다시 열어도 같은 경기가 되게 라인업을 얼려 둔다 */
  pending?: { idx: number; snap: LineupState };
}

const KEY = 'bb.season.v1';
const listeners = new Set<() => void>();
let state: SeasonState | null = null;

function initialTable(): Record<string, TeamRec> {
  const t: Record<string, TeamRec> = {};
  for (const r of STANDINGS) {
    const g = r.w + r.d + r.l;
    const streak = r.streak.endsWith('승') ? Number(r.streak.replace(/\D/g, '')) : -Number(r.streak.replace(/\D/g, '') || 0);
    t[r.teamId] = { w: r.w, d: r.d, l: r.l, rs: Math.round(g * 4.6 + (r.pct - 0.5) * 70), ra: Math.round(g * 4.6 - (r.pct - 0.5) * 70), streak, last10: [...r.last10].reverse().join('') };
  }
  for (const team of TEAMS) if (!t[team.id]) t[team.id] = { w: 0, d: 0, l: 0, rs: 0, ra: 0, streak: 0, last10: '' };
  return t;
}
const newSeed = () => {
  try { return Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join(''); } catch { return String(Date.now()); }
};
function fresh(): SeasonState {
  const table = initialTable();
  const s: SeasonState = { v: 1, seed: newSeed(), next: 0, table, results: [], postponed: [], bat: {}, pit: {}, news: [], my: [], rankHist: {} };
  standingsOf(s).forEach((r, i) => { s.rankHist[r.teamId] = [i + 1]; });
  return s;
}
function load(): SeasonState {
  if (state) return state;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw) as SeasonState;
      if (v && v.v === 1 && v.table && Array.isArray(v.results)) { state = v; return v; }
    }
  } catch { /* 새로 */ }
  state = fresh();
  return state;
}
function save() {
  if (!state) return;
  state = { ...state }; // 새 참조 — useSyncExternalStore 가 바뀐 줄 알게
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* 저장이 막히면 이번 방문만 */ }
  listeners.forEach((l) => l());
}

export const getSeason = (): SeasonState => load();
export function useSeason(): SeasonState {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, load);
}
/** 처음부터 다시 (6월 15일 · 목업 순위표로) */
export function resetSeason() { state = fresh(); save(); }

/* ───────── 일정 ───────── */
/** 정규 + (정규가 끝났으면) 비로 밀린 경기 */
export function allDays(s: SeasonState = load()): DayGames[] {
  const reg = regularDays();
  return s.postponed.length ? [...reg, ...rescheduled(s.postponed)] : reg;
}
export const isOver = (s: SeasonState = load()) => s.next >= allDays(s).length;
export const regularCount = () => regularDays().length;
/** 그날 내 구단 경기 [원정, 홈] */
export const myGameOf = (d: DayGames) => d.games.find(([a, h]) => a === ME.teamId || h === ME.teamId);
/** 지금까지 내 구단 경기 수 (목업 71 + 친 것) */
export const gamesPlayed = (teamId: string, s: SeasonState = load()) => { const r = s.table[teamId]; return r ? r.w + r.d + r.l : 0; };

/* ───────── 순위 ───────── */
export interface StandRow { teamId: string; w: number; d: number; l: number; pct: number; gb: number; streak: string; last10: string; rs: number; ra: number; g: number }
export function standingsOf(s: SeasonState = load()): StandRow[] {
  const rows = TEAMS.map((t) => {
    const r = s.table[t.id] ?? { w: 0, d: 0, l: 0, rs: 0, ra: 0, streak: 0, last10: '' };
    const pct = r.w + r.l ? r.w / (r.w + r.l) : 0;
    return { teamId: t.id, w: r.w, d: r.d, l: r.l, pct, gb: 0, streak: r.streak > 0 ? `${r.streak}승` : r.streak < 0 ? `${-r.streak}패` : '-', last10: r.last10, rs: r.rs, ra: r.ra, g: r.w + r.d + r.l };
  }).sort((a, b) => b.pct - a.pct || b.w - a.w || (b.rs - b.ra) - (a.rs - a.ra));
  const top = rows[0];
  rows.forEach((r) => { r.gb = ((top.w - r.w) + (r.l - top.l)) / 2; });
  return rows;
}
export const rankOf = (teamId: string, s: SeasonState = load()) => standingsOf(s).findIndex((r) => r.teamId === teamId) + 1;

/* ───────── 하루 결과 넣기 ───────── */
export interface DayOutcome {
  idx: number;
  /** 친 경기 (취소는 cancelled) */
  games: (GameOut | { cancelled: true; away: string; home: string })[];
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
  for (const g of out.games.filter(isGame)) {
    const [as, hs] = g.score;
    recs.push({ a: g.away, h: g.home, s: [as, hs], inn: g.innings, ...(g.walkoff ? { wo: 1 as const } : {}) });
    const res = (team: string, mine: number, opp: number) => {
      const r = s.table[team];
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
      const home = g.home === ME.teamId;
      const my = home ? hs : as, their = home ? as : hs;
      s.my.push({ idx: out.idx, date: d.date, opp: home ? g.away : g.home, home, my, their, res: my > their ? 'W' : my < their ? 'L' : 'D', inn: g.innings, wo: g.walkoff || undefined });
    }
  }
  s.results[out.idx] = recs;
  // 순위 기록
  const order = standingsOf(s);
  order.forEach((r, i) => { (s.rankHist[r.teamId] ??= []).push(i + 1); });
  const lead = order[0];
  if (out.idx > 0 && s.rankHist[lead.teamId] && s.rankHist[lead.teamId][s.rankHist[lead.teamId].length - 2] !== 1) news.push({ idx: out.idx, date: d.date, kind: '순위', text: `${tShort(lead.teamId)} 1위로`, team: lead.teamId, mine: lead.teamId === ME.teamId });
  s.news.push(...news);
  if (s.news.length > 160) s.news.splice(0, s.news.length - 160);
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

/* ───────── 개인 기록 1위 (6월 15일부터 친 경기) ───────── */
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

export { FIRST_DAY, SEASON_GAMES };
