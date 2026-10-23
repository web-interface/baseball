// 경기 기록 — 내 경기 박스스코어 저장 · 경기 키 · 박스스코어 보기 모양. 화면은 #/games (screens/games).
//  저장: localStorage 'bb.box.v1' — 내 경기(정규 · 포스트시즌)만, 결과가 들어가는 순간에
//        (정규: store.applyDay · 포스트시즌: post.finishPostMyGame). 다른 구단끼리 경기는 저장하지 않고 볼 때 다시 계산한다
//        (같은 시즌 시드 · 같은 날 · 같은 구단 → 엔진은 결정적, AI 세기는 시즌 첫 경기 때 고정 — screens/games/resim).
//    { v: 1, seasons: [{ seed, year, club, ids: [선수 id], nm: [이름], g: { 경기 키: Box } }] }
//    · 시즌 = 시즌 시드. 지금 시즌 + 바로 앞 시즌까지만 둔다(새 시즌 박스가 들어오면 더 옛 시즌은 지움).
//    · 선수는 시즌 사전(ids · nm)의 번호로 — 줄마다 숫자 배열(아래 PackedBat · PackedPit). 경기 하나 1KB 안팎.
//    · 너무 커지거나(시즌 진행 저장을 막지 않게) 저장소가 꽉 차면 지난 시즌 → 이번 시즌 오래된 경기 절반 순으로 지우고 다시.
//  경기 키(#/games?g=<키>): 정규(비로 밀린 경기 포함) '45-dj-dg' = allDays 순번-원정-홈 · 포스트시즌 'p3-dj-dg' = 포스트시즌 몇 번째 경기(0부터)-원정-홈.
//  기록(log)이 있는 경기(경기 화면에서 본 경기 · 빨리 감기의 내 경기)는 홈런 이닝 · 점수 · 상대 투수와 결승타까지 적는다.
import { useSyncExternalStore } from 'react';
import { ME, playerById } from '../game/mock';
import { initialLineup, store as lineupStore, unit, type LineupState } from '../screens/lineup/calc';
import type { GameOut, GameRun } from './sim';
import type { MyGameRec, SeasonState } from './store';

/* ───────── 경기 키 ───────── */
/** 정규 시즌(밀린 경기 포함) 경기 키 — allDays 순번 · 원정 · 홈 */
export const boxKeyOf = (dayIdx: number, away: string, home: string) => `${dayIdx}-${away}-${home}`;
/** 포스트시즌 경기 키 — 포스트시즌 몇 번째 경기(0부터, 엔진 시드 1000 + n 과 같은 순서) · 원정 · 홈 */
export const postBoxKeyOf = (n: number, away: string, home: string) => `p${n}-${away}-${home}`;
/** 내 정규 시즌 경기 기록 → 경기 키 */
export function boxKeyOfMyGame(rec: MyGameRec, club: string = ME.teamId): string {
  return boxKeyOf(rec.idx, rec.home ? rec.opp : club, rec.home ? club : rec.opp);
}
/** 경기 키 풀기 — 정규 { idx } · 포스트시즌 { post: n } */
export function parseBoxKey(key: string): { post: boolean; n: number; away: string; home: string } | null {
  const m = /^(p?)(\d+)-([a-z0-9]+)-([a-z0-9]+)$/i.exec(key);
  if (!m) return null;
  return { post: m[1] === 'p', n: Number(m[2]), away: m[3], home: m[4] };
}

/* ───────── 보기 모양 (화면이 쓰는 것) ───────── */
export type Dec = 'W' | 'L' | 'S' | 'H' | '';
export interface BoxBat {
  id: string; name: string;
  /** 카드 연도 (내 선수 — NameYear) */
  year?: number;
  /** 타순 1~9 (교체 선수는 들어간 자리 · 모르면 0) */
  ord: number;
  /** 'CF' · 'DH' · 'PH' … */
  pos: string;
  /** 교체로 들어온 선수 */
  sub: boolean;
  AB: number; R: number; H: number; RBI: number; HR: number; BB: number; SO: number; D: number; T: number; SB: number;
}
export interface BoxPit {
  id: string; name: string; year?: number;
  outs: number; H: number; R: number; ER: number; BB: number; SO: number; HR: number;
  dec: Dec;
  gs: boolean;
}
export interface BoxHr {
  id: string; name: string;
  /** 0 원정 · 1 홈 */
  side: 0 | 1;
  /** 시즌 몇 호 (정규 시즌 내 경기만 · 모르면 0) */
  no: number;
  /** 이닝 · 점수 (기록이 있을 때만 · 모르면 0) */
  inn: number; runs: number;
  /** 상대 투수 */
  pit?: string; pitName?: string;
}
export interface BoxView {
  key: string;
  date: string;
  away: string; home: string;
  score: [number, number];
  innings: number;
  line: [number[], number[]];
  hits: [number, number];
  errors: [number, number];
  walkoff: boolean;
  /** 타자 [원정, 홈] — 선발 9명 타순대로, 교체 선수는 그 자리 아래 */
  bat: [BoxBat[], BoxBat[]];
  /** 투수 [원정, 홈] — 나온 순서 */
  pit: [BoxPit[], BoxPit[]];
  hr: BoxHr[];
  /** 결승타 (기록이 있을 때만) */
  gw?: { id: string; name: string; side: 0 | 1; inn: number };
  /** 포스트시즌 [시리즈 id, 차전] */
  post?: { series: string; no: number };
}

/* ───────── 저장 모양 ───────── */
/** [선수, 타순, 포지션, 타수, 득점, 안타, 타점, 홈런, 볼넷, 삼진, 2루타, 3루타, 도루] */
type PackedBat = number[];
/** [선수, 아웃, 피안타, 실점, 자책, 볼넷, 삼진, 피홈런, 결과(0 · 1 승 · 2 패 · 3 세 · 4 홀), 선발(1/0)] */
type PackedPit = number[];
interface PackedBox {
  /** 날짜 */
  d: string;
  /** [원정, 홈] */
  t: [string, string];
  /** 점수 [원정, 홈] */
  s: [number, number];
  /** 이닝 수 */
  n: number;
  /** 이닝 점수 [원정, 홈] */
  l: [number[], number[]];
  /** [안타 원정, 안타 홈, 실책 원정, 실책 홈] */
  he: [number, number, number, number];
  b: [PackedBat[], PackedBat[]];
  p: [PackedPit[], PackedPit[]];
  /** 끝내기 */
  w?: 1;
  /** 포스트시즌 [시리즈, 차전] */
  ps?: [string, number];
  /** 홈런 [선수, 시즌 몇 호(0 모름), 이닝(0 모름), 점수(0 모름), 상대 투수(-1 모름), 쪽(0 원정 · 1 홈)] */
  hr?: number[][];
  /** 결승타 [선수, 이닝, 쪽] */
  gw?: [number, number, number];
  /** 카드 연도 [선수, 연도, 선수, 연도 …] (내 선수) */
  y?: number[];
}
interface BoxSeason { seed: string; year: number; club: string; ids: string[]; nm: string[]; g: Record<string, PackedBox> }
interface BoxSave { v: 1; seasons: BoxSeason[] }

const KEY = 'bb.box.v1';
/** 이만큼(글자 수) 넘으면 지난 시즌부터 줄인다 — 시즌 진행(bb.season.v2) 저장 자리를 남겨 두려고 */
const CAP = 900_000;
const POS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'PH', 'PR'];
const DEC: Dec[] = ['', 'W', 'L', 'S', 'H'];

let cache: BoxSave | null = null;
let ver = 0;
const listeners = new Set<() => void>();

function read(): BoxSave {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as BoxSave) : null;
    if (v && v.v === 1 && Array.isArray(v.seasons)) { cache = v; return v; }
  } catch { /* 깨졌으면 새로 */ }
  cache = { v: 1, seasons: [] };
  return cache;
}
/** 줄이기 한 번 — 지난 시즌을 지우거나, 하나 남은 시즌의 오래된 경기 절반을 지운다. 더 줄일 게 없으면 false */
function trim(st: BoxSave): boolean {
  if (st.seasons.length > 1) { st.seasons.shift(); return true; }
  const cur = st.seasons[0];
  const keys = cur ? Object.keys(cur.g) : [];
  if (keys.length <= 1) return false;
  keys.sort((a, b) => cur.g[a].d.localeCompare(cur.g[b].d));
  for (const k of keys.slice(0, Math.ceil(keys.length / 2))) delete cur.g[k];
  return true;
}
function write(st: BoxSave) {
  let txt = JSON.stringify(st);
  while (txt.length > CAP && trim(st)) txt = JSON.stringify(st);
  for (let k = 0; k < 6; k++) {
    try { localStorage.setItem(KEY, txt); break; } catch {
      // 저장소가 꽉 참 — 줄여서 다시, 더 못 줄이면 이번 방문만(메모리에는 남는다)
      if (!trim(st)) break;
      txt = JSON.stringify(st);
    }
  }
  cache = st;
  ver++;
  listeners.forEach((l) => l());
}
/** 그 시즌 칸 (없으면 만들고, 옛 시즌은 하나만 남긴다) */
function seasonOf(st: BoxSave, s: Pick<SeasonState, 'seed' | 'year' | 'club'>): BoxSeason {
  let se = st.seasons.find((x) => x.seed === s.seed);
  if (!se) {
    se = { seed: s.seed, year: s.year ?? 2027, club: s.club, ids: [], nm: [], g: {} };
    st.seasons.push(se);
    while (st.seasons.length > 2) st.seasons.shift();
  }
  return se;
}

/* ───────── 기록(log)에서 홈런 이닝 · 결승타 ───────── */
// 엔진 타석 기록 rec.pa — 타석마다 12칸 [이닝*2+초말, 아웃, 주자, 타석 전 점수 차(공격 쪽 − 수비 쪽), 타자, 투수, 결과, 타점, …]
// (shared/engine/game.ts L.pa.push · screens/match/engine-game.ts PA_N 과 같은 모양). 결과 7 = 홈런(state.ts R.HR), 16 = 마치지 못한 타석
const PA_N = 12, R_HR = 7, R_OTHER = 16;
export interface RunNotes {
  /** 홈런마다 [타자 web id, 이닝, 점수, 투수 web id, 쪽] */
  hr: { id: string; inn: number; runs: number; pit: string; side: 0 | 1 }[];
  gw?: { id: string; inn: number; side: 0 | 1 };
}
/** 기록이 있는 경기에서 홈런 이닝 · 점수 · 상대 투수, 결승타(이긴 팀이 마지막으로 앞서게 된 타점 타석) */
export function notesOfRun(run: GameRun): RunNotes | null {
  const rec = run.result.record;
  if (!rec) return null;
  const web = (side: number, r: number) => (side === 0 ? run.away : run.home).webOf.get(rec.dict[r]) ?? '';
  const n = Math.floor(rec.pa.length / PA_N);
  const at = (i: number, k: number) => rec.pa[i * PA_N + k];
  const hr: RunNotes['hr'] = [];
  for (let i = 0; i < n; i++) {
    if (at(i, 6) !== R_HR) continue;
    const half = at(i, 0) & 1;
    hr.push({ id: web(half, at(i, 4)), inn: at(i, 0) >> 1, runs: at(i, 7), pit: web(1 - half, at(i, 5)), side: half as 0 | 1 });
  }
  const [as, hs] = run.out.score;
  let gw: RunNotes['gw'];
  if (as !== hs) {
    const W = as > hs ? 0 : 1;
    const leadBefore = (i: number) => ((at(i, 0) & 1) === W ? at(i, 3) : -at(i, 3));
    const finalLead = W === 0 ? as - hs : hs - as;
    for (let i = n - 1; i >= 0; i--) {
      const after = i + 1 < n ? leadBefore(i + 1) : finalLead;
      if (leadBefore(i) <= 0 && after > 0) {
        const half = at(i, 0) & 1;
        if (half === W && at(i, 7) > 0 && at(i, 6) !== R_OTHER) gw = { id: web(half, at(i, 4)), inn: at(i, 0) >> 1, side: W as 0 | 1 };
        break;
      }
    }
  }
  return { hr, gw };
}
/** 엔진 기록이 있는 내 경기 — 결과를 넣기 전에 적어 두고(run.computeDay · finishMyGame) 저장할 때 붙인다 */
const pendingNotes = new Map<string, RunNotes>();
export function noteRun(run: GameRun) {
  const nt = notesOfRun(run);
  if (!nt) return;
  pendingNotes.set(run.input.gameId, nt);
  while (pendingNotes.size > 6) pendingNotes.delete(pendingNotes.keys().next().value!);
}
/** sim.runGame 의 경기 id 와 같은 모양 */
const gameIdOf = (day: number, away: string, home: string, post = false) => `s27-${post ? 'p' : ''}${day}-${away}-${home}`;

/* ───────── 저장 ───────── */
/** 내 선수 카드 연도 — 경기에 쓴 라인업(얼려 둔 것)의 카드에서 */
function cardYears(snap: LineupState | undefined): Map<string, number> {
  const out = new Map<string, number>();
  const st = snap ?? lineupStore.get() ?? initialLineup();
  const ids = [...Object.values(st.field ?? {}), ...(st.rotation ?? []), ...(st.bullpen ?? []), st.closer, ...(st.bench ?? [])];
  for (const id of ids) {
    if (!id) continue;
    try { const u = unit(id); if (u.card.year != null) out.set(u.player.id, u.card.year); } catch { /* 없어진 카드 */ }
  }
  return out;
}
const nameOfId = (id: string) => playerById(id)?.name ?? '선수';

function pack(se: BoxSeason, g: GameOut, extra: { notes?: RunNotes | null; hrNo?: (id: string) => number; years?: Map<string, number>; post?: [string, number] }): PackedBox {
  const dict = new Map(se.ids.map((id, i) => [id, i]));
  const ix = (id: string) => {
    let i = dict.get(id);
    if (i == null) { i = se.ids.length; se.ids.push(id); se.nm.push(nameOfId(id)); dict.set(id, i); }
    return i;
  };
  const sideOf = (team: string) => (team === g.home ? 1 : 0);
  const b: [PackedBat[], PackedBat[]] = [[], []];
  for (const r of g.bat) {
    if (!r.id) continue;
    const pos = POS.indexOf(r.pos ?? '');
    b[sideOf(r.team)].push([ix(r.id), r.ord ?? 0, pos < 0 ? 10 : pos, r.AB, r.R, r.H, r.RBI, r.HR, r.BB, r.SO, r.D, r.T, r.SB]);
  }
  const p: [PackedPit[], PackedPit[]] = [[], []];
  for (const r of g.pit) {
    if (!r.id) continue;
    const dec = r.W ? 1 : r.L ? 2 : r.SV ? 3 : r.HLD ? 4 : 0;
    p[sideOf(r.team)].push([ix(r.id), r.outs, r.H, r.R, r.ER, r.BB, r.SO, r.HR, dec, r.GS ? 1 : 0]);
  }
  // 홈런 — 기록이 있으면 타석 순서대로(이닝 · 점수 · 투수), 없으면 타자 줄에서. 시즌 몇 호는 경기 뒤 합계에서 거꾸로 센다
  const hr: number[][] = [];
  const seen = new Map<string, number>();
  const total = new Map<string, number>();
  g.bat.forEach((r) => { if (r.id && r.HR) total.set(r.id, (total.get(r.id) ?? 0) + r.HR); });
  const noOf = (id: string) => {
    const k = (seen.get(id) ?? 0) + 1;
    seen.set(id, k);
    const after = extra.hrNo?.(id) ?? 0;
    return after ? after - (total.get(id) ?? k) + k : 0;
  };
  if (extra.notes && extra.notes.hr.length) {
    for (const h of extra.notes.hr) if (h.id) hr.push([ix(h.id), noOf(h.id), h.inn, h.runs, h.pit ? ix(h.pit) : -1, h.side]);
  } else {
    for (const r of g.bat) for (let k = 0; k < (r.id ? r.HR : 0); k++) hr.push([ix(r.id), noOf(r.id), 0, 0, -1, sideOf(r.team)]);
  }
  const out: PackedBox = {
    d: g.date, t: [g.away, g.home], s: [g.score[0], g.score[1]], n: g.innings,
    l: [g.line[0].slice(), g.line[1].slice()], he: [g.hits[0], g.hits[1], g.errors[0], g.errors[1]], b, p,
  };
  if (g.walkoff) out.w = 1;
  if (extra.post) out.ps = extra.post;
  if (hr.length) out.hr = hr;
  const gw = extra.notes?.gw;
  if (gw?.id) out.gw = [ix(gw.id), gw.inn, gw.side];
  if (extra.years?.size) {
    const y: number[] = [];
    const done = new Set<string>();
    for (const r of [...g.bat, ...g.pit]) {
      if (!r.id || r.team !== ME.teamId || done.has(r.id)) continue;
      done.add(r.id);
      const yr = extra.years.get(r.id);
      if (yr != null) y.push(ix(r.id), yr);
    }
    if (y.length) out.y = y;
  }
  return out;
}

/** 정규 시즌 내 경기 결과를 넣을 때 (store.applyDay) — 시즌 몇 호는 이 경기까지 넣은 선수 시즌 기록에서 */
export function saveMyBox(s: SeasonState, idx: number, g: GameOut, snap?: LineupState) {
  try {
    const st = read();
    const se = seasonOf(st, s);
    const key = boxKeyOf(idx, g.away, g.home);
    const gid = gameIdOf(idx, g.away, g.home);
    const notes = pendingNotes.get(gid) ?? null;
    pendingNotes.delete(gid);
    se.g[key] = pack(se, g, { notes, hrNo: (id) => s.bat[id]?.HR ?? 0, years: cardYears(snap) });
    write(st);
  } catch (e) {
    console.warn('[경기 기록] 박스스코어를 저장하지 못했어요', e);
  }
}
/** 포스트시즌 내 경기 결과를 넣을 때 (post.finishPostMyGame) — n: 이 경기 앞까지 치른 포스트시즌 경기 수 */
export function savePostBox(s: SeasonState, n: number, series: string, no: number, run: GameRun) {
  try {
    const st = read();
    const se = seasonOf(st, s);
    const g = run.out;
    se.g[postBoxKeyOf(n, g.away, g.home)] = pack(se, g, { notes: notesOfRun(run), years: cardYears(undefined), post: [series, no] });
    write(st);
  } catch (e) {
    console.warn('[경기 기록] 포스트시즌 박스스코어를 저장하지 못했어요', e);
  }
}

/* ───────── 읽기 ───────── */
function unpack(key: string, se: BoxSeason, x: PackedBox): BoxView {
  const id = (i: number) => se.ids[i] ?? '';
  const nm = (i: number) => se.nm[i] || nameOfId(id(i));
  const years = new Map<number, number>();
  for (let i = 0; i + 1 < (x.y?.length ?? 0); i += 2) years.set(x.y![i], x.y![i + 1]);
  const bat = x.b.map((rows) => orderBat(rows.map((r) => ({
    id: id(r[0]), name: nm(r[0]), year: years.get(r[0]), ord: r[1], pos: POS[r[2]] ?? 'PH', sub: false,
    AB: r[3], R: r[4], H: r[5], RBI: r[6], HR: r[7], BB: r[8], SO: r[9], D: r[10] ?? 0, T: r[11] ?? 0, SB: r[12] ?? 0,
  })))) as [BoxBat[], BoxBat[]];
  const pit = x.p.map((rows) => rows.map((r) => ({
    id: id(r[0]), name: nm(r[0]), year: years.get(r[0]), outs: r[1], H: r[2], R: r[3], ER: r[4], BB: r[5], SO: r[6], HR: r[7], dec: DEC[r[8]] ?? '', gs: r[9] === 1,
  }))) as [BoxPit[], BoxPit[]];
  return {
    key, date: x.d, away: x.t[0], home: x.t[1], score: [x.s[0], x.s[1]], innings: x.n, line: [x.l[0], x.l[1]],
    hits: [x.he[0], x.he[1]], errors: [x.he[2], x.he[3]], walkoff: !!x.w, bat, pit,
    hr: (x.hr ?? []).map((h) => ({ id: id(h[0]), name: nm(h[0]), no: h[1], inn: h[2], runs: h[3], pit: h[4] >= 0 ? id(h[4]) : undefined, pitName: h[4] >= 0 ? nm(h[4]) : undefined, side: (h[5] === 1 ? 1 : 0) as 0 | 1 })),
    gw: x.gw ? { id: id(x.gw[0]), name: nm(x.gw[0]), inn: x.gw[1], side: (x.gw[2] === 1 ? 1 : 0) as 0 | 1 } : undefined,
    post: x.ps ? { series: x.ps[0], no: x.ps[1] } : undefined,
  };
}
/** 선발 9명 타순대로, 교체 선수는 들어간 자리 바로 아래 (타순을 모르는 줄은 맨 끝) */
function orderBat(rows: BoxBat[]): BoxBat[] {
  const firstOf = new Map<number, BoxBat>();
  rows.forEach((r) => { if (r.ord > 0 && !firstOf.has(r.ord)) firstOf.set(r.ord, r); });
  rows.forEach((r) => { r.sub = r.ord <= 0 || firstOf.get(r.ord) !== r; });
  const slot = (r: BoxBat) => (r.ord > 0 ? r.ord : 99);
  return rows.map((r, i) => ({ r, i })).sort((a, b) => slot(a.r) - slot(b.r) || a.i - b.i).map((x) => x.r);
}

/** 저장된 박스스코어 — seed 를 주지 않으면 그 키를 가진 가장 최근 시즌 */
export function getBox(key: string, seed?: string): BoxView | null {
  const st = read();
  for (let i = st.seasons.length - 1; i >= 0; i--) {
    const se = st.seasons[i];
    if (seed && se.seed !== seed) continue;
    const x = se.g[key];
    if (x) return unpack(key, se, x);
  }
  return null;
}
/** 다시 계산한 경기(GameOut) → 보기 모양 (저장하지 않음) */
export function viewOfOut(key: string, g: GameOut, notes?: RunNotes | null, post?: { series: string; no: number }): BoxView {
  const se: BoxSeason = { seed: '', year: 0, club: '', ids: [], nm: [], g: {} };
  return unpack(key, se, pack(se, g, { notes, post: post ? [post.series, post.no] : undefined }));
}

export interface BoxSeasonInfo { seed: string; year: number; club: string; count: number }
/** 저장된 시즌들 (옛 것부터) */
export function boxSeasons(): BoxSeasonInfo[] {
  return read().seasons.map((se) => ({ seed: se.seed, year: se.year, club: se.club, count: Object.keys(se.g).length }));
}
/** 그 시즌에 저장된 박스스코어 모두 (목록 — 지난 시즌 경기 기록) */
export function boxesOf(seed: string): BoxView[] {
  const se = read().seasons.find((x) => x.seed === seed);
  if (!se) return [];
  return Object.entries(se.g).map(([k, x]) => unpack(k, se, x)).sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
}
/** 박스스코어 저장이 바뀌면 다시 그린다 (값 = 바뀐 횟수) */
export function useBoxVersion(): number {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => ver);
}
