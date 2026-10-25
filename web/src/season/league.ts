// 리그 단계 = AI 상대 난이도 — 고르지 않는다. 연습생에서 시작해, 시즌이 끝날 때 성적과 팀 조건으로 저절로 오르내린다.
//  · 오르기: 정규 시즌 1위 + 다음 단계 조건(팀 종합 · 강화 · 팀 타격 · 팀 투수 성적)을 모두 채웠을 때 한 단계씩
//  · 내리기: 9 · 10위면 한 단계, 지금 단계 조건이 깨졌으면 조건을 채우는 단계까지
//  · AI 구단 = 단계 기준(처음 팀보다 조금 셈) + 내 팀이 기준보다 센 만큼의 70%(고무줄) + 같은 단계에 오래 머물수록 조금씩 — 성적 올리기가 쉽지 않게
//  · 1군부터는 '팀 타율 · 팀 평균자책점 리그 순위'(그 시즌 성적)가 붙고, 올스타부터는 강화까지
//    (사용자 지시 10-25 밤 — 세트덱 조건(단일팀 연도덱 · 우승덱 · 왕조)은 빼고 타자 · 투수 성적으로)
// 저장: localStorage 'bb.ladder' { v: 1, club, year, level, stay, aiRef, history } — 시즌 연도도 여기서 센다(2027 → 2028 …).
import { useSyncExternalStore } from 'react';
import { ME, teamById } from '../game/mock';
import type { GradeId } from '../game/types';
import { showOvr } from '../game/ovrShow';
import { BAT_SLOTS, evaluate, initialLineup, store as lineupStore, unit, type LineupState } from '../screens/lineup/calc';

export type AiLevel = 'trainee' | 'futures' | 'first' | 'allstar' | 'national' | 'legend';
export const LEVELS: AiLevel[] = ['trainee', 'futures', 'first', 'allstar', 'national', 'legend'];
export const LEVEL_KO: Record<AiLevel, string> = { trainee: '연습생', futures: '2군', first: '1군', allstar: '올스타', national: '국가대표', legend: '레전드' };
/** 단계마다 AI 구단 평균 팀 종합 — 내 팀 종합(세트덱 · 강화 · 케미까지 더한 값)과 같은 잣대 */
export const LEVEL_BASE: Record<AiLevel, number> = { trainee: 67, futures: 79, first: 99, allstar: 105, national: 109, legend: 113 };
/** 단계 설명 · 보상 */
export const LEVEL_INFO: Record<AiLevel, { desc: string; grades: GradeId[]; reward: number; prize: string }> = {
  trainee: { desc: '노멀·스페셜 위주 · 교체가 늦어요', grades: ['normal', 'special'], reward: 0.6, prize: '레어 확정 팩' },
  futures: { desc: '스페셜·레어 · 작전 실수가 잦아요', grades: ['special', 'rare'], reward: 0.8, prize: '레어 확정 팩 ×2' },
  first: { desc: '리그 정상급 · 보통 감독', grades: ['rare', 'elite'], reward: 1, prize: '엘리트 확정 팩' },
  allstar: { desc: '엘리트 위주 · 레전드 섞임', grades: ['elite', 'legend'], reward: 1.3, prize: '레전드 확정 팩' },
  national: { desc: '팀컬러·케미까지 챙겨요', grades: ['elite', 'legend', 'franchise'], reward: 1.6, prize: '프랜차이즈 확정 팩' },
  legend: { desc: '승리 확률표대로 최적 판단', grades: ['legend', 'black', 'signature'], reward: 2, prize: '블랙 이상 확정 팩' },
};

/** 단계에 들어가는 조건 — ovr 팀 종합(힘 눈금) · enh 선발 10명 평균 강화 · bat 팀 타율 리그 몇 위 이내 · pit 팀 평균자책점 리그 몇 위 이내.
 *  성적(bat · pit)은 그 시즌을 치른 결과라 오를 때만 본다 — '조건이 깨져 내려감' 판단(metLevel)엔 넣지 않는다 */
export interface Gate { ovr: number; enh?: number; bat?: number; pit?: number }
export const GATE: Record<AiLevel, Gate> = {
  trainee: { ovr: 0 },
  futures: { ovr: 80 },
  first: { ovr: 100, bat: 3, pit: 3 },
  allstar: { ovr: 104, enh: 5, bat: 3, pit: 3 },
  national: { ovr: 107, enh: 7, bat: 2, pit: 2 },
  legend: { ovr: 110, enh: 9, bat: 1, pit: 1 },
};
/** 리그 순위 글 — '1위' · '3위 이내' */
export const rankKo = (n: number) => (n === 1 ? '1위' : `${n}위 이내`);
/** 오르는 성적 · 내려가는 성적 */
export const PROMOTE_RANK = 1;
export const RELEGATE_RANK = 9;

export const FIRST_YEAR = 2027;
/** 내 팀이 단계 기준보다 센 만큼 AI 가 따라오는 비율 */
export const RUBBER = 0.7;

export interface LeagueYear {
  year: number;
  level: AiLevel;
  rank: number; w: number; d: number; l: number;
  /** 시즌 끝 팀 종합 */
  ovr: number;
  move: 'up' | 'down' | 'stay' | 'drop';
  to: AiLevel;
  note: string;
  /** 포스트시즌 결과 (내 구단) */
  post?: string;
}
interface LeagueSave {
  v: 1;
  /** 이 리그 진행의 내 구단 — 구단이 바뀌면 처음부터 */
  club: string;
  /** 지금 치르는 시즌 연도 */
  year: number;
  level: AiLevel;
  /** 지금 단계에서 보낸 시즌 수 (들어온 시즌 = 0) */
  stay: number;
  /** AI 고무줄 기준 — 이번 시즌 첫 경기 때 내 팀 종합 (그 전엔 지금 라인업으로 계산) */
  aiRef: number | null;
  history: LeagueYear[];
}

// 'bb.league' 는 game/mock 의 리그 구성 표시가 쓰는 열쇠 — 겹치면 시즌 기록이 지워진다
const KEY = 'bb.ladder';
const listeners = new Set<() => void>();
let cache: LeagueSave | null = null;

const fresh = (): LeagueSave => ({ v: 1, club: ME.teamId, year: FIRST_YEAR, level: 'trainee', stay: 0, aiRef: null, history: [] });
function read(): LeagueSave {
  if (cache && cache.club === ME.teamId) return cache;
  let v: LeagueSave | null = null;
  try {
    const raw = localStorage.getItem(KEY);
    const x = raw ? (JSON.parse(raw) as LeagueSave) : null;
    if (x && x.v === 1 && x.club === ME.teamId && LEVELS.includes(x.level) && typeof x.year === 'number') v = x;
  } catch { /* 새로 */ }
  cache = v ?? fresh();
  if (!v) write(cache, false);
  return cache;
}
function write(v: LeagueSave, notify = true) {
  cache = { ...v };
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* 이번 방문만 */ }
  if (notify) listeners.forEach((l) => l());
}

export const league = () => read();
export function useLeague() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, read);
}
/** 지금 시즌 연도 (2027부터 한 해씩) */
export const seasonYear = () => read().year;
/** 지금 AI 상대 단계 */
export const aiLevel = (): AiLevel => read().level;
/** 처음부터 (새 구단 · 새로 시작) — 2027 · 연습생 */
export function resetLeague() { write(fresh()); }

/* ───────── 내 팀 조건 ───────── */
/** 이번 시즌 팀 타율 · 평균자책점과 리그 순위 (season/store teamStatOf) */
export interface TeamStat { avg: number; avgRank: number; era: number; eraRank: number; games: number }
export interface TeamStatus {
  /** 팀 종합 (힘 눈금, 99 위로도 셈) */
  ovr: number;
  /** 선발 10명(타순 9 + 1선발) 평균 강화 */
  enhAvg: number;
  /** 이번 시즌 팀 성적 — 없으면 성적 조건은 아직 못 채운 것으로 */
  stat?: TeamStat | null;
}
export function teamStatus(st: LineupState = lineupStore.get() ?? initialLineup(), stat: TeamStat | null = null): TeamStatus {
  const ev = evaluate(st);
  const ids = [...BAT_SLOTS.map((s) => st.field[s]), st.rotation[0]].filter((x): x is string => !!x);
  const enh = ids.map((id) => { try { return unit(id).card.enhance ?? 0; } catch { return 0; } });
  return {
    ovr: Math.round(ev.raw),
    enhAvg: enh.length ? enh.reduce((a, b) => a + b, 0) / enh.length : 0,
    stat,
  };
}
export interface GateItem { label: string; ok: boolean; now: string }
/** 그 단계 조건을 하나씩 — 화면 체크 목록. withStats: 시즌 성적 조건까지 (오를 때) — 팀 종합은 화면 눈금으로 보여 준다 */
export function gateItems(level: AiLevel, t: TeamStatus, withStats = true): GateItem[] {
  const g = GATE[level];
  const out: GateItem[] = [{ label: `팀 종합 ${showOvr(g.ovr)} 이상`, ok: t.ovr >= g.ovr, now: `지금 ${showOvr(t.ovr)}` }];
  if (g.enh) out.push({ label: `선발 10명 평균 강화 ${roman(g.enh)} 이상`, ok: t.enhAvg >= g.enh, now: `지금 ${t.enhAvg.toFixed(1)}` });
  const st = t.stat && t.stat.games > 0 ? t.stat : null;
  if (withStats && g.bat) out.push({ label: `팀 타율 리그 ${rankKo(g.bat)}`, ok: !!st && st.avgRank <= g.bat, now: st ? `지금 ${st.avg.toFixed(3).replace(/^0/, '')} · ${st.avgRank}위` : '시즌 기록 없음' });
  if (withStats && g.pit) out.push({ label: `팀 평균자책점 리그 ${rankKo(g.pit)}`, ok: !!st && st.eraRank <= g.pit, now: st ? `지금 ${st.era.toFixed(2)} · ${st.eraRank}위` : '시즌 기록 없음' });
  return out;
}
export const gateOk = (level: AiLevel, t: TeamStatus, withStats = true) => gateItems(level, t, withStats).every((x) => x.ok);
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const roman = (n: number) => ROMAN[Math.max(0, Math.min(10, n))];
/** 조건을 채운 가장 높은 단계 — 팀 조건(종합 · 강화)만 (성적은 오를 때만 본다) */
export function metLevel(t: TeamStatus): AiLevel {
  let out: AiLevel = 'trainee';
  for (const l of LEVELS) if (gateOk(l, t, false)) out = l;
  return out;
}
export const nextLevel = (l: AiLevel): AiLevel | null => LEVELS[LEVELS.indexOf(l) + 1] ?? null;

/* ───────── AI 구단 세기 ───────── */
/** 이번 시즌 AI 구단의 목표 팀 종합 — 단계 기준 + 고무줄 + 머문 시즌 + 구단 전력(강 +3 · 약 −3) */
export function aiTargetOf(teamId: string): number {
  const L = read();
  const base = LEVEL_BASE[L.level] + Math.min(4, L.stay * 0.8);
  const me = L.aiRef ?? safeOvr();
  const rubber = RUBBER * Math.max(0, me - base);
  const tier = teamById(teamId).tier;
  const adj = tier === '강' ? 3 : tier === '약' ? -3 : 0;
  return Math.round((base + rubber + adj) * 10) / 10;
}
function safeOvr() {
  try { return Math.round(evaluate(lineupStore.get() ?? initialLineup()).raw); } catch { return LEVEL_BASE.trainee; }
}
/** 첫 경기를 치를 때 AI 기준을 이번 시즌 내내 고정 (시즌 중엔 단계·세기가 안 바뀜) */
export function freezeAiRef() {
  const L = read();
  if (L.aiRef != null) return;
  write({ ...L, aiRef: safeOvr() }, false);
}

/* ───────── 시즌 끝 → 다음 해 ───────── */
export function closeYear(r: { rank: number; w: number; d: number; l: number; post?: string; stat?: TeamStat | null }): LeagueYear {
  const L = read();
  const t = teamStatus(undefined, r.stat ?? null);
  const cur = L.level;
  const i = LEVELS.indexOf(cur);
  const up = nextLevel(cur);
  let to: AiLevel = cur;
  let move: LeagueYear['move'] = 'stay';
  let note = `${r.rank}위 — 그대로 ${LEVEL_KO[cur]}`;
  if (r.rank <= PROMOTE_RANK && up) {
    if (gateOk(up, t)) { to = up; move = 'up'; note = `정규 시즌 1위 — ${LEVEL_KO[up]}로 올라가요`; }
    else note = `1위지만 ${LEVEL_KO[up]} 조건이 모자라 그대로예요`;
  } else if (r.rank <= PROMOTE_RANK) {
    note = '1위 — 가장 높은 단계를 지켰어요';
  } else if (r.rank >= RELEGATE_RANK && i > 0) {
    to = LEVELS[i - 1]; move = 'down'; note = `${r.rank}위 — ${LEVEL_KO[to]}로 내려가요`;
  }
  const met = metLevel(t);
  if (LEVELS.indexOf(met) < LEVELS.indexOf(to)) { to = met; move = 'drop'; note = `${LEVEL_KO[cur]} 조건이 깨져 ${LEVEL_KO[met]}로 내려가요`; }
  const rec: LeagueYear = { year: L.year, level: cur, rank: r.rank, w: r.w, d: r.d, l: r.l, ovr: t.ovr, move, to, note, post: r.post || undefined };
  write({ ...L, year: L.year + 1, level: to, stay: to === cur ? L.stay + 1 : 0, aiRef: null, history: [...L.history, rec].slice(-40) });
  return rec;
}
