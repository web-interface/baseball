// 시즌 결산 — 선수 · 팀 시즌 기록과 시상식(MVP · 신인왕 · 골든글러브 · 개인 타이틀).
//  · 숫자는 모두 시즌 저장(season/store 의 bat · pit · table · results) 그대로다. 순위·리그 기록(#/league)의 개인 기록 TOP 10 ·
//    선수 기록 · 팀 기록과 시상식(#/awards)이 이 파일의 같은 줄을 쓴다. 비율 식은 선수 화면과 같다(출루율 = (안타 + 볼넷) ÷ 타석).
//    규정타석 = 소속 팀 경기 × 3.1, 규정이닝 = 소속 팀 경기 × 1 (store.leaders · 리그 기록 화면과 같은 기준).
//  · 선수 한 줄 = 같은 사람(실제 선수는 시즌 꼬리를 뗀 선수 ID — season/career careerKey) · 같은 구단. 카드를 바꿔 끼워
//    보기 id 가 둘로 나뉘어도 한 줄로 합친다(링크 · 그림은 타석 · 아웃이 많은 쪽 id).
//  · 상은 코드가 기록으로 정한다. 기사 제목 · 짧은 기사 · 매체 · 기자도 기기 안 템플릿 — 서버 AI(Claude)는 부르지 않는다(비용 규칙).
//  · 시상식은 포스트시즌 우승팀이 정해진 뒤(store.nextSeason 과 같은 때) 열리고, 열린 시상식은 'bb.awards.v1' 에 남긴다
//    (다음 시즌에도 지난 시상식 · 선수별 수상 기록 — awardsOfPerson).
import { TEAMS, playerById, teamById } from '../game/mock';
import { OUTLETS, REPORTERS } from '../game/press';
import { POS_KO, ROLE_KO } from '../game/labels';
import type { Player, Pos } from '../game/types';
import { careerKey } from './career';
import { boxesOf } from './box';
import { ensureClubRosters, rosterOf } from './rosters';
import { gamesPlayed, isOver, standingsOf, yearOf, type SeasonState } from './store';

/* ═════════════ 모양 ═════════════ */
type BatAgg = SeasonState['bat'][string];
type PitAgg = SeasonState['pit'][string];
export type BatSum = Omit<BatAgg, 'team'>;
export type PitSum = Omit<PitAgg, 'team'>;
const BAT0 = (): BatSum => ({ G: 0, PA: 0, AB: 0, H: 0, D: 0, T: 0, HR: 0, RBI: 0, R: 0, BB: 0, SO: 0, SB: 0 });
const PIT0 = (): PitSum => ({ G: 0, GS: 0, outs: 0, H: 0, R: 0, ER: 0, BB: 0, SO: 0, HR: 0, W: 0, L: 0, SV: 0, HLD: 0 });
function addInto<T extends object>(a: T, b: Partial<T>) {
  const A = a as Record<string, number>, B = b as Record<string, unknown>;
  for (const k of Object.keys(A)) if (typeof B[k] === 'number') A[k] += B[k] as number;
}

export type Role = 'SP' | 'RP' | 'CL';
export interface PlayerRow<T> {
  /** 사람 · 구단 열쇠 */
  key: string;
  /** 대표 보기 id (선수 정보 링크 · 그림) */
  id: string;
  team: string;
  name: string;
  player?: Player;
  /** 주 포지션 (타자: 저장된 경기 기록에서 가장 많이 선 자리 → 선수단 자리 → 선수 포지션) · 투수 'P' */
  pos: Pos;
  rec: T;
  /** 규정 — 타자 타석 · 투수 아웃 수 (소속 팀 경기 기준) */
  need: number;
  /** 규정 채움 (비율 기록 순위에 들어감) */
  ok: boolean;
}
export type BatRow = PlayerRow<BatSum>;
export type PitRow = PlayerRow<PitSum> & { role: Role };

/* ── 비율 기록 (선수 화면 · 리그 기록 TOP 10 과 같은 식) ── */
export const avgOf = (b: BatSum) => (b.AB ? b.H / b.AB : 0);
export const obpOf = (b: BatSum) => (b.PA ? (b.H + b.BB) / b.PA : 0);
export const slgOf = (b: BatSum) => (b.AB ? (b.H + b.D + 2 * b.T + 3 * b.HR) / b.AB : 0);
export const opsOf = (b: BatSum) => obpOf(b) + slgOf(b);
export const eraOf = (p: PitSum) => (p.outs ? (p.ER * 27) / p.outs : 0);
export const whipOf = (p: PitSum) => (p.outs ? (p.H + p.BB) / (p.outs / 3) : 0);
export const wpctOf = (p: PitSum) => (p.W + p.L ? p.W / (p.W + p.L) : 0);
/** .342 · 1.021 */
export const r3 = (x: number) => (x >= 1 ? x.toFixed(3) : x.toFixed(3).replace(/^0/, ''));
/** 2.31 */
export const r2 = (x: number) => x.toFixed(2);
/** 이닝 — 6⅔ */
export const ipText = (outs: number) => {
  const w = Math.floor(outs / 3), f = outs % 3;
  const frac = f === 1 ? '⅓' : f === 2 ? '⅔' : '';
  return w === 0 && frac ? frac : `${w}${frac}`;
};
/** 선발 · 불펜 · 마무리 — 이번 시즌 등판 모양으로 (선발 등판이 절반 이상이면 선발) */
export const roleOf = (p: PitSum): Role => (p.GS > 0 && p.GS * 2 >= p.G ? 'SP' : p.SV >= 5 && p.SV >= p.HLD ? 'CL' : 'RP');
export { ROLE_KO };
/** 좁은 칸 포지션 — 포 · 1루 · 유 · 중 · 지 */
export const POS_SHORT: Record<Pos, string> = { P: '투', C: '포', '1B': '1루', '2B': '2루', '3B': '3루', SS: '유격', LF: '좌익', CF: '중견', RF: '우익', DH: '지명' };

/* ═════════════ 선수 · 팀 시즌 기록 ═════════════ */
const FIELD: Pos[] = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
const isPos = (x: string): x is Pos => (FIELD as string[]).includes(x) || x === 'P';

/** 타자 주 포지션 — 저장된 내 경기 박스스코어(상대 팀 줄 포함)에서 가장 많이 선 자리 → 지금 선수단 자리 */
function positionsOf(s: SeasonState): Map<string, Pos> {
  const count = new Map<string, Map<Pos, number>>();
  try {
    for (const bx of boxesOf(s.seed)) {
      for (const side of bx.bat) for (const r of side) {
        if (!r.id || !isPos(r.pos) || r.pos === 'P') continue;
        const m = count.get(r.id) ?? new Map<Pos, number>();
        m.set(r.pos, (m.get(r.pos) ?? 0) + 1);
        count.set(r.id, m);
      }
    }
  } catch { /* 박스스코어가 없으면 선수단 자리로 */ }
  const out = new Map<string, Pos>();
  for (const [id, m] of count) out.set(id, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  for (const t of TEAMS) {
    try {
      const r = rosterOf(t.id);
      for (const b of r.batting) if (!out.has(b.player.id)) out.set(b.player.id, b.pos);
    } catch { /* 선수단을 못 만들면 선수 포지션 */ }
  }
  return out;
}

export interface WDL { w: number; d: number; l: number }
const wdl0 = (): WDL => ({ w: 0, d: 0, l: 0 });
export interface TeamRow {
  teamId: string;
  /** 순위 (standingsOf — 공동 그대로) */
  rank: number;
  g: number; w: number; d: number; l: number; pct: number;
  /** 득점 · 실점 (순위표와 같은 값) */
  rs: number; ra: number;
  bat: BatSum;
  pit: PitSum;
  home: WDL; away: WDL;
}
export interface SeasonBook {
  bat: BatRow[];
  pit: PitRow[];
  teams: TeamRow[];
  /** 팀 간 승패 — h2h[a][b] = a 가 b 에게 */
  h2h: Record<string, Record<string, WDL>>;
  /** 리그 평균 (가치 계산 기준) */
  lg: { woba: number; era: number; games: number };
}

const bookCache = new WeakMap<SeasonState, SeasonBook>();
/** 이번 시즌 선수 · 팀 기록 (같은 시즌 상태면 한 번만 계산) */
export function seasonBook(s: SeasonState): SeasonBook {
  const hit = bookCache.get(s);
  if (hit) return hit;
  try { ensureClubRosters(); } catch { /* 가상 선수 이름만 못 찾음 */ }
  const posMap = positionsOf(s);
  const nameOf = (id: string) => playerById(id)?.name ?? '선수';

  // 사람 · 구단 단위로 묶기
  const group = <A extends { team: string }, T>(src: Record<string, A>, zero: () => T, weight: (a: A) => number) => {
    const m = new Map<string, { team: string; ids: [string, number][]; rec: T }>();
    for (const [id, a] of Object.entries(src)) {
      const key = `${careerKey(id)}@${a.team}`;
      const g = m.get(key) ?? { team: a.team, ids: [], rec: zero() };
      addInto(g.rec as object, a as Partial<object>);
      g.ids.push([id, weight(a)]);
      m.set(key, g);
    }
    return [...m.entries()].map(([key, g]) => {
      const ids = g.ids.sort((x, y) => y[1] - x[1]).map((x) => x[0]);
      return { key, team: g.team, ids, rec: g.rec };
    });
  };

  const bat: BatRow[] = group(s.bat, BAT0, (a) => a.PA).map((g) => {
    const id = g.ids[0];
    const player = playerById(id);
    const pos = g.ids.map((x) => posMap.get(x)).find(Boolean) ?? (player && player.pos !== 'P' ? player.pos : 'DH');
    const need = gamesPlayed(g.team, s) * 3.1;
    return { key: g.key, id, team: g.team, name: nameOf(id), player, pos, rec: g.rec, need, ok: g.rec.PA >= need && g.rec.AB > 0 };
  });
  const pit: PitRow[] = group(s.pit, PIT0, (a) => a.outs).map((g) => {
    const id = g.ids[0];
    const player = playerById(id);
    const need = gamesPlayed(g.team, s) * 3;
    return { key: g.key, id, team: g.team, name: nameOf(id), player, pos: 'P' as Pos, rec: g.rec, need, ok: g.rec.outs > 0 && g.rec.outs >= need, role: roleOf(g.rec) };
  });

  // 팀 — 선수 기록 합 + 순위표(득점 · 실점 · 승패) + 경기 결과(홈 · 방문 · 팀 간 승패)
  const stand = standingsOf(s);
  const h2h: SeasonBook['h2h'] = {};
  const home = new Map<string, WDL>(), away = new Map<string, WDL>();
  for (const t of TEAMS) { h2h[t.id] = {}; home.set(t.id, wdl0()); away.set(t.id, wdl0()); for (const u of TEAMS) if (u.id !== t.id) h2h[t.id][u.id] = wdl0(); }
  for (const day of s.results) for (const g of day ?? []) {
    if (!g || g.c) continue;
    const [as, hs] = g.s;
    const put = (x: WDL | undefined, mine: number, opp: number) => { if (!x) return; if (mine > opp) x.w++; else if (mine < opp) x.l++; else x.d++; };
    put(h2h[g.a]?.[g.h], as, hs);
    put(h2h[g.h]?.[g.a], hs, as);
    put(away.get(g.a), as, hs);
    put(home.get(g.h), hs, as);
  }
  const teams: TeamRow[] = stand.map((r) => {
    const b = BAT0(), p = PIT0();
    for (const x of bat) if (x.team === r.teamId) addInto(b, x.rec);
    for (const x of pit) if (x.team === r.teamId) addInto(p, x.rec);
    return { teamId: r.teamId, rank: r.rank, g: r.g, w: r.w, d: r.d, l: r.l, pct: r.pct, rs: r.rs, ra: r.ra, bat: b, pit: p, home: home.get(r.teamId) ?? wdl0(), away: away.get(r.teamId) ?? wdl0() };
  });

  // 리그 평균 — wOBA(대략 가중치) · 평균자책
  let wN = 0, wD = 0, er = 0, outs = 0;
  for (const x of bat) { wN += wobaNum(x.rec); wD += x.rec.PA; }
  for (const x of pit) { er += x.rec.ER; outs += x.rec.outs; }
  const games = Math.max(1, ...teams.map((t) => t.g));
  const book: SeasonBook = { bat, pit, teams, h2h, lg: { woba: wD ? wN / wD : 0.32, era: outs ? (er * 27) / outs : 4.5, games } };
  bookCache.set(s, book);
  return book;
}

/* ═════════════ 가치 (MVP · 골든글러브 · 신인왕 줄 세우기) ═════════════ */
// 대체 선수보다 얼마나 더 막고 쳤나(점수) — 세이버메트릭스식 근사. 수비 기록은 저장하지 않아 포지션 보정으로만 반영한다.
//   타자: (wOBA − 리그 wOBA) ÷ 1.2 × 타석 + 도루 0.2점 + 포지션 보정(한 시즌 기준 포수 +12 … 지명 −17) + 대체 수준 20점/600타석
//   투수: (대체 평균자책 − 평균자책) × 이닝 ÷ 9 — 대체 평균자책은 리그 평균의 1.32배(선발) · 1.18배(불펜), 불펜은 접전 무게 1.35배
const wobaNum = (b: BatSum) => 0.69 * b.BB + 0.89 * (b.H - b.D - b.T - b.HR) + 1.27 * b.D + 1.62 * b.T + 2.1 * b.HR;
const POS_ADJ: Record<Pos, number> = { C: 12, SS: 7, '2B': 3, CF: 3, '3B': 2, LF: -7, RF: -7, '1B': -12, DH: -17, P: 0 };
export function batValue(r: BatRow, lg: SeasonBook['lg']): number {
  const b = r.rec;
  if (!b.PA) return 0;
  const raa = ((wobaNum(b) / b.PA - lg.woba) / 1.2) * b.PA;
  return raa + 0.2 * b.SB + POS_ADJ[r.pos] * Math.min(1, b.G / lg.games) + (20 * b.PA) / 600;
}
export function pitValue(r: PitRow, lg: SeasonBook['lg']): number {
  const p = r.rec;
  if (!p.outs) return 0;
  const relief = r.role !== 'SP';
  const rep = lg.era * (relief ? 1.18 : 1.32);
  return (rep - eraOf(p)) * (p.outs / 27) * (relief ? 1.35 : 1);
}

/* ═════════════ 시상식 ═════════════ */
export type AwardKind = 'mvp' | 'roy' | 'gg' | 'title';
export interface AwardWin {
  /** 'mvp' · 'roy' · 'gg-SS' · 'gg-OF' · 't-hr' … */
  key: string;
  kind: AwardKind;
  /** '정규 시즌 MVP' · '유격수' · '홈런왕' */
  label: string;
  id: string; name: string; team: string; pos: Pos;
  side: 'bat' | 'pit';
  role?: Role;
  /** 대표 숫자 ('.342' · '38') · 단위 ('홈런') */
  value: string;
  unit: string;
  /** 한 줄 기록 ('타율 .342 · 홈런 38 · 타점 112') */
  line: string;
  /** 큰 숫자 칸 (MVP · 신인왕) */
  cells?: [string, string][];
  /** 공동 수상 */
  shared?: boolean;
  /** 우리 구단 선수 */
  mine: boolean;
  /** 기사 (MVP · 신인왕) */
  head?: string; lede?: string;
}
export interface PressNote { head: string; lede: string }
export interface Ceremony {
  v: 1;
  seed: string; year: number; club: string;
  /** 시상식 날 (포스트시즌이 끝난 다음 날) */
  date: string;
  champion: string;
  mvp?: AwardWin;
  roy?: AwardWin;
  /** 신인왕 후보가 없을 때 한 줄 */
  royNote?: string;
  gg: AwardWin[];
  titles: AwardWin[];
  ggNote?: PressNote;
  titleNote?: PressNote;
  outlet: string; reporter: string;
}

/* ── 글 도구 (받침 · 조사) ── */
const DIGIT_JONG = [21, 8, 0, 16, 0, 0, 1, 8, 8, 0]; // 영 일 이 삼 사 오 육 칠 팔 구 — 받침 번호(0 = 없음, 8 = ㄹ)
function jongOf(w: string): number {
  const ch = w.trim().slice(-1);
  if (/[0-9]/.test(ch)) return DIGIT_JONG[Number(ch)];
  const c = ch.charCodeAt(0) - 0xac00;
  return c >= 0 && c < 11172 ? c % 28 : 0;
}
/** 조사 — josa('전민제', '이/가') → '전민제가' · '(으)로' 는 ㄹ 받침이면 '로' */
export function josa(w: string, pair: '이/가' | '은/는' | '을/를' | '과/와' | '으로/로'): string {
  const j = jongOf(w);
  const [a, b] = pair.split('/');
  if (pair === '으로/로') return w + (j === 0 || j === 8 ? b : a);
  return w + (j ? a : b);
}
const hash = (x: string) => { let h = 2166136261; for (let i = 0; i < x.length; i++) { h ^= x.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const pick = <T,>(seed: string, xs: readonly T[]): T => xs[hash(seed) % xs.length];

/** 타자 한 줄 · 큰 숫자 칸 */
function batLineOf(b: BatSum, extra: string[] = []) {
  const line = [`타율 ${r3(avgOf(b))}`, `홈런 ${b.HR}`, `타점 ${b.RBI}`, ...extra].join(' · ');
  const cells: [string, string][] = [['타율', r3(avgOf(b))], ['홈런', String(b.HR)], ['타점', String(b.RBI)], ['OPS', r3(opsOf(b))]];
  return { line, cells };
}
function pitLineOf(p: PitSum, role: Role) {
  if (role === 'CL') return { line: `${p.SV}세이브 · 평균자책 ${r2(eraOf(p))} · ${ipText(p.outs)}이닝`, cells: [['세이브', String(p.SV)], ['평균자책', r2(eraOf(p))], ['경기', String(p.G)], ['탈삼진', String(p.SO)]] as [string, string][] };
  if (role === 'RP') return { line: `${p.HLD}홀드 · 평균자책 ${r2(eraOf(p))} · ${ipText(p.outs)}이닝`, cells: [['홀드', String(p.HLD)], ['평균자책', r2(eraOf(p))], ['경기', String(p.G)], ['탈삼진', String(p.SO)]] as [string, string][] };
  return { line: `${p.W}승 ${p.L}패 · 평균자책 ${r2(eraOf(p))} · 탈삼진 ${p.SO}`, cells: [['승', String(p.W)], ['평균자책', r2(eraOf(p))], ['탈삼진', String(p.SO)], ['이닝', ipText(p.outs)]] as [string, string][] };
}

/* ── 개인 타이틀 ── */
interface TitleDef { key: string; label: string; side: 'bat' | 'pit'; unit: string; val: (r: BatRow & PitRow) => number; ok?: (r: BatRow & PitRow, s: SeasonState) => boolean; asc?: boolean; show: (v: number) => string }
const sc = (n: number, tg: number) => Math.max(1, Math.round((n * tg) / 144)); // 144경기 기준 숫자를 팀 경기 수에 맞춤
const TITLES: TitleDef[] = [
  { key: 'avg', label: '타격왕', side: 'bat', unit: '타율', val: (r) => avgOf(r.rec), ok: (r) => r.ok, show: r3 },
  { key: 'hr', label: '홈런왕', side: 'bat', unit: '홈런', val: (r) => r.rec.HR, show: String },
  { key: 'rbi', label: '타점왕', side: 'bat', unit: '타점', val: (r) => r.rec.RBI, show: String },
  { key: 'h', label: '최다안타', side: 'bat', unit: '안타', val: (r) => r.rec.H, show: String },
  { key: 'r', label: '득점왕', side: 'bat', unit: '득점', val: (r) => r.rec.R, show: String },
  { key: 'sb', label: '도루왕', side: 'bat', unit: '도루', val: (r) => r.rec.SB, show: String },
  { key: 'obp', label: '출루율왕', side: 'bat', unit: '출루율', val: (r) => obpOf(r.rec), ok: (r) => r.ok, show: r3 },
  { key: 'slg', label: '장타율왕', side: 'bat', unit: '장타율', val: (r) => slgOf(r.rec), ok: (r) => r.ok, show: r3 },
  { key: 'w', label: '다승왕', side: 'pit', unit: '승', val: (r) => r.rec.W, show: String },
  { key: 'era', label: '평균자책왕', side: 'pit', unit: '평균자책', val: (r) => eraOf(r.rec), ok: (r) => r.ok, asc: true, show: r2 },
  { key: 'so', label: '탈삼진왕', side: 'pit', unit: '탈삼진', val: (r) => r.rec.SO, show: String },
  { key: 'sv', label: '세이브왕', side: 'pit', unit: '세이브', val: (r) => r.rec.SV, show: String },
  { key: 'hld', label: '홀드왕', side: 'pit', unit: '홀드', val: (r) => r.rec.HLD, show: String },
  { key: 'wpct', label: '승률왕', side: 'pit', unit: '승률', val: (r) => wpctOf(r.rec), ok: (r, s) => r.rec.W >= sc(10, gamesPlayed(r.team, s)), show: r3 },
];

/** 골든글러브 자리 — 외야는 세 명 */
const GG_SLOTS: { key: string; label: string; pos: Pos[]; n: number }[] = [
  { key: 'P', label: '투수', pos: ['P'], n: 1 }, { key: 'C', label: '포수', pos: ['C'], n: 1 }, { key: '1B', label: '1루수', pos: ['1B'], n: 1 },
  { key: '2B', label: '2루수', pos: ['2B'], n: 1 }, { key: '3B', label: '3루수', pos: ['3B'], n: 1 }, { key: 'SS', label: '유격수', pos: ['SS'], n: 1 },
  { key: 'OF', label: '외야수', pos: ['LF', 'CF', 'RF'], n: 3 }, { key: 'DH', label: '지명타자', pos: ['DH'], n: 1 },
];

/**
 * 신인 — 근사 규칙.
 * 실제 KBO 신인상 자격(입단 5년 이내 · 지난 시즌까지 60타석 · 30이닝 이하)을 그대로 쓰면, 게임 리그는 실제 기록 다음 해(2027)에
 * 열려 선수단이 모두 최근 실제 시즌에 많이 뛴 선수라 후보가 거의 없다. 그래서 게임 리그 기준으로 근사한다:
 *   ① 입단 3년 차 이내 (시즌 연도 − 입단 연도 ≤ 3 — 실제 선수는 실제 입단 연도, 가상 선수는 만든 입단 연도)
 *   ② 이 게임 지난 시즌(게임 통산 'bb.career', 이번 해보다 앞선 해)까지 60타석 · 30이닝(90아웃) 이하
 *   ③ 이번 시즌 타자 규정타석의 절반 · 투수 규정이닝의 절반 또는 30경기 이상 (조금 뛴 선수가 받지 않게)
 */
function priorGameTime(year: number): Map<string, { pa: number; outs: number }> {
  const out = new Map<string, { pa: number; outs: number }>();
  try {
    const raw = localStorage.getItem('bb.career');
    const v = raw ? (JSON.parse(raw) as { v?: number; seasons?: { year?: number; bat?: Record<string, { PA?: number }>; pit?: Record<string, { outs?: number }> }[] }) : null;
    for (const se of v?.seasons ?? []) {
      if ((se.year ?? 2027) >= year) continue;
      for (const [k, b] of Object.entries(se.bat ?? {})) { const x = out.get(k) ?? { pa: 0, outs: 0 }; x.pa += b.PA ?? 0; out.set(k, x); }
      for (const [k, p] of Object.entries(se.pit ?? {})) { const x = out.get(k) ?? { pa: 0, outs: 0 }; x.outs += p.outs ?? 0; out.set(k, x); }
    }
  } catch { /* 통산 기록이 없으면 모두 처음 */ }
  return out;
}

/** 이번 시즌 시상식 — 정규 시즌 · 포스트시즌이 끝나 우승팀이 정해졌을 때만 */
export function ceremonyOf(s: SeasonState): Ceremony | null {
  if (!isOver(s) || !s.post?.champion) return null;
  const book = seasonBook(s);
  const year = yearOf(s);
  const lg = book.lg;
  const club = s.club;
  const seed = `${s.seed}:${year}`;
  const stand = standingsOf(s);
  const rankOfTeam = (t: string) => stand.find((r) => r.teamId === t)?.rank ?? 0;
  const pctOfTeam = (t: string) => stand.find((r) => r.teamId === t)?.pct ?? 0.5;
  const tg = (t: string) => Math.max(1, gamesPlayed(t, s));

  /* 타이틀 — 같은 값이면 공동 */
  const titles: AwardWin[] = [];
  const titleCount = new Map<string, string[]>();
  for (const d of TITLES) {
    const list = (d.side === 'bat' ? book.bat : book.pit) as (BatRow & PitRow)[];
    const ok = list.filter((r) => (d.ok ? d.ok(r, s) : true));
    if (!ok.length) continue;
    const best = ok.reduce((m, r) => (d.asc ? Math.min(m, d.val(r)) : Math.max(m, d.val(r))), d.asc ? Infinity : -Infinity);
    if (!d.asc && best <= 0) continue;
    const win = ok.filter((r) => Math.abs(d.val(r) - best) < 1e-9).sort((a, b) => a.name.localeCompare(b.name));
    for (const r of win) {
      titleCount.set(r.key, [...(titleCount.get(r.key) ?? []), d.label]);
      const pl = d.side === 'bat' ? batLineOf(r.rec) : pitLineOf(r.rec, r.role);
      titles.push({
        key: `t-${d.key}`, kind: 'title', label: d.label, id: r.id, name: r.name, team: r.team, pos: r.pos, side: d.side, role: d.side === 'pit' ? r.role : undefined,
        value: d.show(best), unit: d.unit, line: pl.line, shared: win.length > 1 || undefined, mine: r.team === club,
      });
    }
  }

  /* 가치 */
  const bv = new Map(book.bat.map((r) => [r.key, batValue(r, lg)]));
  const pv = new Map(book.pit.map((r) => [r.key, pitValue(r, lg)]));

  /* MVP — 가치(점수 ÷ 10 ≈ 승) + 팀 성적(승률 .600 이면 +0.5) + 타이틀마다 0.3 */
  const mvpScore = (key: string, team: string, runs: number) => runs / 10 + (pctOfTeam(team) - 0.5) * 5 + 0.3 * (titleCount.get(key)?.length ?? 0);
  type Cand = { side: 'bat'; r: BatRow; score: number } | { side: 'pit'; r: PitRow; score: number };
  const cands: Cand[] = [
    ...book.bat.filter((r) => r.rec.PA >= r.need * 0.8).map((r) => ({ side: 'bat' as const, r, score: mvpScore(r.key, r.team, bv.get(r.key) ?? 0) })),
    ...book.pit.filter((r) => r.rec.outs >= r.need * 0.5 || r.rec.SV + r.rec.HLD >= sc(25, tg(r.team))).map((r) => ({ side: 'pit' as const, r, score: mvpScore(r.key, r.team, pv.get(r.key) ?? 0) })),
  ].sort((a, b) => b.score - a.score || a.r.name.localeCompare(b.r.name));
  const champion = s.post.champion;
  const winOf = (c: Cand, kind: 'mvp' | 'roy', label: string): AwardWin => {
    const t = titleCount.get(c.r.key) ?? [];
    const pl = c.side === 'bat' ? batLineOf(c.r.rec, c.r.rec.SB >= 20 ? [`도루 ${c.r.rec.SB}`] : []) : pitLineOf(c.r.rec, c.r.role);
    const w: AwardWin = {
      key: kind, kind, label, id: c.r.id, name: c.r.name, team: c.r.team, pos: c.r.pos, side: c.side, role: c.side === 'pit' ? c.r.role : undefined,
      value: c.side === 'bat' ? r3(opsOf(c.r.rec)) : r2(eraOf(c.r.rec)), unit: c.side === 'bat' ? 'OPS' : '평균자책', line: pl.line, cells: pl.cells, mine: c.r.team === club,
    };
    const art = kind === 'mvp' ? mvpArticle(c, t, { year, seed, rank: rankOfTeam(c.r.team), champ: champion === c.r.team }) : royArticle(c, { year, seed });
    return { ...w, ...art };
  };
  const mvp = cands[0] ? winOf(cands[0], 'mvp', '정규 시즌 MVP') : undefined;

  /* 신인왕 (근사 — 위 priorGameTime 설명) */
  const prior = priorGameTime(year);
  const rookie = (r: BatRow | PitRow) => {
    const p = r.player;
    if (!p) return false;
    if (year - (p.draftYear ?? 0) > 3) return false;
    const pr = prior.get(careerKey(r.id));
    return !pr || (pr.pa <= 60 && pr.outs <= 90);
  };
  const royC: Cand[] = [
    ...book.bat.filter((r) => rookie(r) && r.rec.PA >= r.need * 0.5).map((r) => ({ side: 'bat' as const, r, score: (bv.get(r.key) ?? 0) / 10 })),
    ...book.pit.filter((r) => rookie(r) && (r.rec.outs >= r.need * 0.5 || r.rec.G >= sc(30, tg(r.team)))).map((r) => ({ side: 'pit' as const, r, score: (pv.get(r.key) ?? 0) / 10 })),
  ].sort((a, b) => b.score - a.score || a.r.name.localeCompare(b.r.name));
  // MVP 가 신인이면 신인왕도 함께 받을 수 있다 (같은 해 두 상)
  const royPick = royC[0];
  const roy = royPick ? winOf(royPick, 'roy', '신인왕') : undefined;

  /* 골든글러브 — 자리마다 가치 1위 (외야 셋). 자격: 야수 팀 경기 55% 이상 · 지명 규정타석의 2/3 · 투수 규정이닝 또는 10승 · 30세이브 · 30홀드 */
  const gg: AwardWin[] = [];
  for (const slot of GG_SLOTS) {
    if (slot.key === 'P') {
      const list = book.pit.filter((r) => r.ok || r.rec.W >= sc(10, tg(r.team)) || r.rec.SV >= sc(30, tg(r.team)) || r.rec.HLD >= sc(30, tg(r.team)))
        .sort((a, b) => (pv.get(b.key) ?? 0) - (pv.get(a.key) ?? 0));
      const r = list[0];
      if (r) { const pl = pitLineOf(r.rec, r.role); gg.push({ key: 'gg-P', kind: 'gg', label: slot.label, id: r.id, name: r.name, team: r.team, pos: 'P', side: 'pit', role: r.role, value: r2(eraOf(r.rec)), unit: '평균자책', line: pl.line, mine: r.team === club }); }
      continue;
    }
    const list = book.bat.filter((r) => slot.pos.includes(r.pos) && (slot.key === 'DH' ? r.rec.PA >= r.need * (2 / 3) : r.rec.G >= tg(r.team) * 0.55))
      .sort((a, b) => (bv.get(b.key) ?? 0) - (bv.get(a.key) ?? 0));
    for (const r of list.slice(0, slot.n)) {
      gg.push({ key: `gg-${slot.key}`, kind: 'gg', label: slot.label, id: r.id, name: r.name, team: r.team, pos: r.pos, side: 'bat', value: r3(avgOf(r.rec)), unit: '타율', line: batLineOf(r.rec).line, mine: r.team === club });
    }
  }

  const ceremony: Ceremony = {
    v: 1, seed: s.seed, year, club, date: s.post.date, champion,
    mvp, roy, royNote: roy ? undefined : '올해는 자격을 채운 신인이 없어요',
    gg, titles,
    ggNote: ggArticle(gg, { year, seed }),
    titleNote: titleArticle(titles, { year, seed }),
    outlet: pick(`${seed}:outlet`, OUTLETS), reporter: pick(`${seed}:rep`, REPORTERS),
  };
  return ceremony;
}

/* ── 기사 템플릿 (기사체 · 짧게) ── */
const tName = (id: string) => teamById(id).name;
const tShort = (id: string) => teamById(id).short;
function mvpArticle(c: { side: 'bat' | 'pit'; r: BatRow | PitRow }, titles: string[], o: { year: number; seed: string; rank: number; champ: boolean }) {
  const { r } = c;
  const nm = r.name;
  const tail = o.champ ? ' 팀의 한국시리즈 우승에도 앞장섰다.' : o.rank === 1 ? ' 팀도 정규 시즌 1위로 마쳤다.' : '';
  if (c.side === 'bat') {
    const b = (r as BatRow).rec;
    const crown = ['타격왕', '홈런왕', '타점왕'].every((x) => titles.includes(x));
    const hook = crown ? '타격 3관왕'
      : titles.length >= 2 ? `${titles.slice(0, 3).map((x) => x.replace(/왕$/, '')).join(' · ')} ${titles.length}관왕`
      : b.HR >= 30 ? `${b.HR}홈런 시즌`
      : avgOf(b) >= 0.33 ? `타율 ${r3(avgOf(b))}`
      : `OPS ${r3(opsOf(b))}`;
    const head = pick(`${o.seed}:mvp`, [`${nm}, ${o.year} 정규 시즌 MVP… ${hook}`, `'${hook}' ${nm}, MVP 올랐다`, `${tShort(r.team)} ${nm} MVP… ${hook}`]);
    const lede = `${tName(r.team)} ${josa(nm, '이/가')} ${o.year} 한별 리그 정규 시즌 MVP에 뽑혔다. ${b.G}경기에 나와 타율 ${r3(avgOf(b))}, 홈런 ${b.HR}개, 타점 ${b.RBI}개를 올렸다.${tail}`;
    return { head, lede };
  }
  const p = (r as PitRow).rec;
  const role = (r as PitRow).role;
  const hook = role === 'CL' ? `${p.SV}세이브 뒷문` : role === 'RP' ? `${p.HLD}홀드 허리` : `${p.W}승 · 평균자책 ${r2(eraOf(p))}`;
  const head = pick(`${o.seed}:mvp`, [`${nm}, 투수로 MVP… ${hook}`, `'${hook}' ${nm}, ${o.year} MVP`, `${tShort(r.team)} ${nm} MVP… ${hook}`]);
  const stat = role === 'SP' ? `${p.G}경기 ${ipText(p.outs)}이닝을 던져 ${p.W}승 ${p.L}패, 탈삼진 ${p.SO}개를 남겼다.` : `${p.G}경기에 나와 ${role === 'CL' ? `${p.SV}세이브` : `${p.HLD}홀드`}, 평균자책 ${josa(r2(eraOf(p)), '을/를')} 기록했다.`;
  const lede = `${tName(r.team)} ${josa(nm, '이/가')} ${o.year} 한별 리그 정규 시즌 MVP에 뽑혔다. ${stat}${tail}`;
  return { head, lede };
}
function royArticle(c: { side: 'bat' | 'pit'; r: BatRow | PitRow }, o: { year: number; seed: string }) {
  const { r } = c;
  const nm = r.name;
  const age = r.player?.age;
  const who = `${age ? `${age}세 ` : ''}${c.side === 'pit' ? ROLE_KO[(r as PitRow).role] + ' 투수' : POS_KO[r.pos]}`;
  if (c.side === 'bat') {
    const b = (r as BatRow).rec;
    const hook = b.HR >= 20 ? `데뷔 시즌 ${b.HR}홈런` : `타율 ${r3(avgOf(b))}`;
    return {
      head: pick(`${o.seed}:roy`, [`신인왕 ${nm}… ${hook}`, `${tShort(r.team)} ${who} ${nm}, 신인왕`]),
      lede: `${tName(r.team)}의 ${who} ${josa(nm, '이/가')} ${o.year} 신인왕에 올랐다. ${b.G}경기 타율 ${r3(avgOf(b))}, 홈런 ${b.HR}개, 타점 ${b.RBI}개.`,
    };
  }
  const p = (r as PitRow).rec;
  const role = (r as PitRow).role;
  const hook = role === 'SP' ? `${p.W}승` : role === 'CL' ? `${p.SV}세이브` : `${p.HLD}홀드`;
  return {
    head: pick(`${o.seed}:roy`, [`신인왕 ${nm}… 첫해 ${hook}`, `${tShort(r.team)} ${who} ${nm}, 신인왕`]),
    lede: `${tName(r.team)}의 ${who} ${josa(nm, '이/가')} ${o.year} 신인왕에 올랐다. ${p.G}경기 ${ipText(p.outs)}이닝, ${role === 'SP' ? `${p.W}승 ${p.L}패` : hook}, 평균자책 ${r2(eraOf(p))}.`,
  };
}
function ggArticle(gg: AwardWin[], o: { year: number; seed: string }): PressNote | undefined {
  if (!gg.length) return undefined;
  const by = new Map<string, number>();
  gg.forEach((g) => by.set(g.team, (by.get(g.team) ?? 0) + 1));
  const top = [...by.entries()].sort((a, b) => b[1] - a[1]);
  const lone = top[0] && top[0][1] >= 2 && (top[1]?.[1] ?? 0) < top[0][1];
  const head = lone ? `골든글러브 ${gg.length}명… ${tShort(top[0][0])} ${top[0][1]}명 최다` : `골든글러브 ${gg.length}명… ${by.size}개 구단 나눠 가져`;
  const lede = lone
    ? `${o.year} 골든글러브 수상자 ${gg.length}명이 정해졌다. ${tName(top[0][0])}에서 ${gg.filter((g) => g.team === top[0][0]).map((g) => g.name).join(' · ')} 등 ${top[0][1]}명이 나왔다.`
    : `${o.year} 골든글러브 수상자 ${gg.length}명이 정해졌다. ${by.size}개 구단이 고르게 나눠 가졌다.`;
  return { head, lede };
}
function titleArticle(titles: AwardWin[], o: { year: number; seed: string }): PressNote | undefined {
  if (!titles.length) return undefined;
  const by = new Map<string, AwardWin[]>();
  titles.forEach((t) => by.set(`${t.id}@${t.team}`, [...(by.get(`${t.id}@${t.team}`) ?? []), t]));
  const multi = [...by.values()].sort((a, b) => b.length - a.length)[0];
  if (multi && multi.length >= 2) {
    const p = multi[0];
    const names = multi.map((t) => t.label.replace(/왕$/, ''));
    return {
      head: `${p.name} ${multi.length}관왕… ${names.slice(0, 4).join(' · ')}`,
      lede: `${tName(p.team)} ${josa(p.name, '이/가')} ${josa(multi.map((t) => t.label).join(' · '), '을/를')} 차지했다. 개인 타이틀 ${titles.length}개 주인이 모두 가려졌다.`,
    };
  }
  return { head: `개인 타이틀 ${titles.length}개 주인 가려져`, lede: `${o.year} 정규 시즌 개인 타이틀 ${titles.length}개 주인이 모두 가려졌다.` };
}

/* ═════════════ 저장 — 열린 시상식 ═════════════ */
const KEY = 'bb.awards.v1';
const MAX = 12;
interface AwardsSave { v: 1; list: Ceremony[] }
function readSave(): AwardsSave {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as AwardsSave) : null;
    if (v && v.v === 1 && Array.isArray(v.list)) return v;
  } catch { /* 깨졌으면 새로 */ }
  return { v: 1, list: [] };
}
/** 열린 시상식을 남긴다 — 같은 시즌(시드)은 새 값으로 바꾼다 */
export function saveCeremony(c: Ceremony) {
  const sv = readSave();
  const i = sv.list.findIndex((x) => x.seed === c.seed);
  if (i >= 0 && JSON.stringify(sv.list[i]) === JSON.stringify(c)) return;
  if (i >= 0) sv.list[i] = c; else sv.list.push(c);
  while (sv.list.length > MAX) sv.list.shift();
  try { localStorage.setItem(KEY, JSON.stringify(sv)); } catch { /* 저장이 막히면 이번 방문만 */ }
}
/** 남긴 시상식 (옛 것부터) */
export const pastCeremonies = (): Ceremony[] => readSave().list;
/** 그 사람의 게임 수상 기록 (선수 정보 '수상' 칸용) — careerKey(선수 id) 로 찾는다 */
export function awardsOfPerson(key: string): { year: number; label: string; kind: AwardKind; team: string }[] {
  const out: { year: number; label: string; kind: AwardKind; team: string }[] = [];
  for (const c of readSave().list) {
    for (const w of [c.mvp, c.roy, ...c.gg, ...c.titles]) {
      if (w && careerKey(w.id) === key) out.push({ year: c.year, kind: w.kind, team: w.team, label: w.kind === 'gg' ? `골든글러브 ${w.label}` : w.label });
    }
  }
  return out;
}
