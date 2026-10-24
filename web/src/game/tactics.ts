// 경기 전 기본 전술 — 팀 전체 + 선수별(타자 · 투수). 시즌 경기 · 빨리 감기 · 가을야구의 내 경기에 그대로 들어간다(season/sim engineTac).
// 엔진(shared/engine Tactics)에 이미 있는 판단만 쓴다 — 결과는 엔진이 정하고, 전술은 판단의 기울기만 바꾼다(같은 실력이면 승률 ±3%p 안).
// 선수별 전술은 사람 기준(카드 시즌이 달라도 같은 선수면 그대로). 값이 없으면 팀 전술(타자 '팀 따름').
// 저장: localStorage 'bb.tactics.v1'. 경기에 쓸 때는 라인업 스냅샷(LineupState.tac)에 같이 얼린다 — 다시 보기 · 경기 기록이 같은 경기가 되게.
// 대전(PvP)은 서버가 팀 종합으로 정해서 전술이 들어가지 않는다.
import { useSyncExternalStore } from 'react';

export interface Opt { v: string; ko: string; fx?: string }

/* ───────── 팀 전술 ───────── */
export type TeamKey = 'bat' | 'two' | 'run' | 'steal' | 'bunt' | 'hitrun' | 'ph' | 'inf' | 'of' | 'pick' | 'ibb' | 'call' | 'hook' | 'closer' | 'match';
export type TacGroup = 'att' | 'def' | 'pit';
export interface TeamOptDef { key: TeamKey; group: TacGroup; ko: string; help: string; def: string; opts: Opt[] }
export const GROUP_KO: Record<TacGroup, string> = { att: '공격', def: '수비', pit: '투수 운용' };

const LMH = (more: string, less: string): Opt[] => [{ v: 'more', ko: more }, { v: 'norm', ko: '보통' }, { v: 'less', ko: less }];
export const TEAM_OPTS: TeamOptDef[] = [
  { key: 'bat', group: 'att', ko: '타격 성향', help: '타자들이 공을 대하는 태도', def: 'norm', opts: [
    { v: 'aggr', ko: '적극적으로', fx: '초구 · 빠른 카운트부터 친다 — 볼넷 ↓ · 투구 수 ↓ · 노림수 장타 ↑' },
    { v: 'norm', ko: '보통' },
    { v: 'pat', ko: '신중하게', fx: '공을 많이 본다 — 볼넷 ↑ · 상대 투구 수 ↑ · 삼진 ↑' }] },
  { key: 'two', group: 'att', ko: '2스트라이크', help: '몰렸을 때 스윙', def: 'norm', opts: [
    { v: 'short', ko: '짧게 맞히기', fx: '배트를 짧게 — 삼진 ↓ · 장타 ↓' },
    { v: 'norm', ko: '보통' },
    { v: 'full', ko: '풀스윙', fx: '끝까지 크게 — 장타 ↑ · 삼진 ↑' }] },
  { key: 'run', group: 'att', ko: '주루', help: '안타 · 뜬공 · 땅볼 때 한 베이스 더', def: 'norm', opts: [
    { v: 'aggr', ko: '한 베이스 더', fx: '추가 진루 · 3루 주자 홈 쇄도 ↑ — 주루사 위험 ↑' },
    { v: 'norm', ko: '보통' },
    { v: 'safe', ko: '안전하게', fx: '무리하지 않는다 — 주루사 ↓' }] },
  { key: 'steal', group: 'att', ko: '도루', help: '빠른 주자 도루 시도', def: 'norm', opts: LMH('많이', '적게') },
  { key: 'bunt', group: 'att', ko: '번트', help: '희생번트 · 스퀴즈', def: 'norm', opts: LMH('자주', '적게') },
  { key: 'hitrun', group: 'att', ko: '히트앤런', help: '주자 스타트 + 타자는 무조건 스윙', def: 'norm', opts: LMH('자주', '적게') },
  { key: 'ph', group: 'att', ko: '대타 · 대주자', help: '벤치 기용', def: 'auto', opts: [
    { v: 'auto', ko: '상황에 따라' },
    { v: 'late', ko: '7회부터' },
    { v: 'never', ko: '쓰지 않음', fx: '주전이 끝까지 — 대주자도 안 쓴다' }] },
  { key: 'inf', group: 'def', ko: '내야 수비', help: '3루 주자가 있을 때 내야 위치', def: 'auto', opts: [
    { v: 'auto', ko: '상황에 따라', fx: '접전 후반엔 전진' },
    { v: 'in', ko: '늘 전진', fx: '홈에서 막는다 — 내야 안타 ↑' },
    { v: 'back', ko: '정상 위치', fx: '1점은 주고 아웃 카운트를 잡는다' }] },
  { key: 'of', group: 'def', ko: '외야 수비', help: '외야수 위치', def: 'auto', opts: [
    { v: 'auto', ko: '타자에 맞춰' },
    { v: 'shallow', ko: '앞으로', fx: '짧은 안타 · 홈 송구 ↑ — 머리 넘는 장타 ↑' },
    { v: 'deep', ko: '뒤로', fx: '장타 방지 — 앞에 떨어지는 안타 ↑' }] },
  { key: 'pick', group: 'def', ko: '주자 견제', help: '1루 견제 · 도루 막기', def: 'norm', opts: LMH('자주', '적게') },
  { key: 'ibb', group: 'def', ko: '고의사구', help: '1루가 비었을 때 강타자 거르기', def: 'auto', opts: [
    { v: 'auto', ko: '상황에 따라' },
    { v: 'more', ko: '적극', fx: '1루가 비면 강타자는 거른다' },
    { v: 'never', ko: '안 함' }] },
  { key: 'call', group: 'pit', ko: '승부 성향', help: '포수 리드 · 볼 배합', def: 'norm', opts: [
    { v: 'attack', ko: '정면 승부', fx: '존 안으로 — 볼넷 ↓ · 투구 수 ↓ · 피안타 ↑' },
    { v: 'norm', ko: '보통' },
    { v: 'nibble', ko: '유인구 위주', fx: '구석 · 바깥으로 — 헛스윙 ↑ · 볼넷 ↑' }] },
  { key: 'hook', group: 'pit', ko: '선발 교체', help: '선발을 언제 내릴지', def: 'norm', opts: [
    { v: 'quick', ko: '빠르게', fx: '투구 수 −15 · 3실점 · 타순 세 바퀴째 위기면 교체' },
    { v: 'norm', ko: '보통' },
    { v: 'long', ko: '길게', fx: '투구 수 +15 · 7실점까지 맡긴다' }] },
  { key: 'closer', group: 'pit', ko: '마무리', help: '마무리 투수를 쓰는 때', def: 'save', opts: [
    { v: 'save', ko: '세이브 상황만' },
    { v: 'tie', ko: '동점에도', fx: '9회 이후 동점 홈 경기 · 연장에도' },
    { v: 'multi', ko: '2이닝까지', fx: '20구 안이면 다음 이닝도 맡긴다' }] },
  { key: 'match', group: 'pit', ko: '좌우 원포인트', help: '7회 이후 위기에 좌완 원포인트', def: 'on', opts: [{ v: 'on', ko: '쓴다' }, { v: 'off', ko: '안 쓴다' }] },
];
export const TEAM_DEF = Object.fromEntries(TEAM_OPTS.map((o) => [o.key, o.def])) as Record<TeamKey, string>;

/* ───────── 선수별 ───────── */
export type BatTacKey = 'bat' | 'steal' | 'bunt' | 'spray';
export type PitTacKey = 'call' | 'limit' | 'mix' | 'inside';
export interface PlayerOptDef<K extends string> { key: K; ko: string; opts: Opt[]; spOnly?: boolean }
export const BAT_OPTS: PlayerOptDef<BatTacKey>[] = [
  { key: 'bat', ko: '타격', opts: [{ v: 'team', ko: '팀 따름' }, { v: 'aggr', ko: '적극적으로', fx: '초구부터 노린다' }, { v: 'pat', ko: '신중하게', fx: '공을 많이 본다' }] },
  { key: 'steal', ko: '도루', opts: [{ v: 'team', ko: '팀 따름' }, { v: 'green', ko: '그린라이트', fx: '알아서 뛴다 — 시도 ×1.5' }, { v: 'never', ko: '금지' }] },
  { key: 'bunt', ko: '번트', opts: [{ v: 'team', ko: '팀 따름' }, { v: 'sac', ko: '희생번트 맡김', fx: '번트 상황이면 대개 댄다' }, { v: 'none', ko: '안 시킴' }] },
  { key: 'spray', ko: '타구 방향', opts: [{ v: 'team', ko: '자연스럽게' }, { v: 'pull', ko: '당겨치기', fx: '장타 ↑ · 시프트에 걸리기 쉽다' }, { v: 'oppo', ko: '밀어치기', fx: '진루타 ↑ · 장타 ↓' }] },
];
export const PIT_OPTS: PlayerOptDef<PitTacKey>[] = [
  { key: 'call', ko: '승부', opts: [{ v: 'team', ko: '팀 따름' }, { v: 'attack', ko: '정면 승부', fx: '피하지 않는다' }, { v: 'nibble', ko: '피해 간다', fx: '유인구 · 강타자는 피해서' }] },
  { key: 'limit', ko: '투구 수', spOnly: true, opts: [{ v: 'team', ko: '팀 따름' }, { v: 'short', ko: '85구', fx: '짧게 끊는다' }, { v: 'long', ko: '115구', fx: '길게 맡긴다' }] },
  { key: 'mix', ko: '구종', opts: [{ v: 'team', ko: '보통' }, { v: 'fast', ko: '직구 위주' }, { v: 'break', ko: '변화구 위주' }] },
  { key: 'inside', ko: '코스', opts: [{ v: 'team', ko: '보통' }, { v: 'in', ko: '몸쪽 적극' }, { v: 'out', ko: '바깥쪽 위주' }] },
];

export interface TacState {
  v: 1;
  team: Partial<Record<TeamKey, string>>;
  /** 사람 키(personKey) → 타자 전술 */
  bat: Record<string, Partial<Record<BatTacKey, string>>>;
  /** 사람 키 → 투수 전술 */
  pit: Record<string, Partial<Record<PitTacKey, string>>>;
}
export const EMPTY_TAC: TacState = { v: 1, team: {}, bat: {}, pit: {} };

/** 같은 사람 키 — 실제 선수는 시즌마다 보기 id 가 달라('…~2015') 시즌 꼬리를 뗀다 */
export const personKey = (playerId: string) => playerId.replace(/~\d{4}$/, '');

/** 팀 전술 값 (없으면 기본) */
export const teamVal = (t: TacState | undefined, key: TeamKey) => t?.team[key] ?? TEAM_DEF[key];

/* ───────── 검사 — 저장 · AI 추천 · 스냅샷 모두 이걸 지난다(모르는 값은 버린다) ───────── */
const has = (opts: Opt[], v: unknown): v is string => typeof v === 'string' && opts.some((o) => o.v === v);
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
function cleanPlayers<K extends string>(raw: unknown, defs: PlayerOptDef<K>[]): Record<string, Partial<Record<K, string>>> {
  const out: Record<string, Partial<Record<K, string>>> = {};
  if (!isObj(raw)) return out;
  for (const [pk, v] of Object.entries(raw).slice(0, 400)) {
    if (!isObj(v) || !/^[\w~-]{1,40}$/.test(pk)) continue;
    const o: Partial<Record<K, string>> = {};
    for (const d of defs) { const x = v[d.key]; if (has(d.opts, x) && x !== 'team') o[d.key] = x; }
    if (Object.keys(o).length) out[pk] = o;
  }
  return out;
}
export function cleanTac(raw: unknown): TacState {
  if (!isObj(raw)) return { ...EMPTY_TAC, team: {}, bat: {}, pit: {} };
  const team: TacState['team'] = {};
  const t = isObj(raw.team) ? raw.team : {};
  for (const d of TEAM_OPTS) { const x = t[d.key]; if (has(d.opts, x) && x !== d.def) team[d.key] = x; }
  return { v: 1, team, bat: cleanPlayers(raw.bat, BAT_OPTS), pit: cleanPlayers(raw.pit, PIT_OPTS) };
}

/* ───────── 저장 ───────── */
const KEY = 'bb.tactics.v1';
let state: TacState | null = null;
const listeners = new Set<() => void>();
export function loadTactics(): TacState {
  if (state) return state;
  try { const raw = localStorage.getItem(KEY); state = cleanTac(raw ? JSON.parse(raw) : null); } catch { state = cleanTac(null); }
  return state;
}
export function saveTactics(t: TacState) {
  state = cleanTac(t);
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* 저장이 막히면 이번 방문만 */ }
  listeners.forEach((l) => l());
}
export function useTactics(): TacState {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, loadTactics);
}
/** 팀 전술 하나 바꾸기 */
export function setTeamTac(key: TeamKey, v: string) {
  const t = loadTactics();
  saveTactics({ ...t, team: { ...t.team, [key]: v } });
}
/** 선수 전술 하나 바꾸기 ('team' = 팀 따름 → 지움) */
export function setPlayerTac(kind: 'bat' | 'pit', person: string, key: string, v: string) {
  const t = loadTactics();
  const cur = { ...(t[kind][person] ?? {}) } as Record<string, string>;
  if (v === 'team') delete cur[key]; else cur[key] = v;
  const next = { ...t[kind], [person]: cur };
  if (!Object.keys(cur).length) delete next[person];
  saveTactics({ ...t, [kind]: next });
}
/** 바뀐 전술 수 (팀 · 선수) — 화면 요약용 */
export function tacCount(t: TacState) {
  return { team: Object.keys(t.team).length, bat: Object.keys(t.bat).length, pit: Object.keys(t.pit).length };
}
