// 시즌 선수단 — 내 구단은 라인업 화면의 1군 엔트리(카드 · 세트덱 효과 그대로), AI 구단은 구단 선택에서 고른 난이도만큼.
// AI 구단: 그 구단의 마지막 실제 시즌 선수(실제 선수 카탈로그 game/kbo — 바뀐 이름) + 모자란 자리는 가상 선수.
// 엔진에 넣을 때 종합을 난이도에 맞춘다(능력치를 더하거나 빼서).
import { ME, PLAYERS, TEAMS, registerPlayers } from '../game/mock';
import { synthPlayer } from '../game/starter';
import { seasonRoster } from '../game/history';
import { eraOfCode } from '../game/world';
import type { Player, PitcherRole, Pos } from '../game/types';
import type { SetEffect } from '../game/sets';
import { evaluate, getSlot, initialLineup, store as lineupStore, unit, type LineupState } from '../screens/lineup/calc';

export type AiLevel = 'trainee' | 'futures' | 'first' | 'allstar' | 'national' | 'legend';
/** 난이도별 AI 구단 팀 종합 목표 (기본 선수단 65~68 이 2군과 비슷) */
export const LEVEL_OVR: Record<AiLevel, number> = { trainee: 62, futures: 67, first: 72, allstar: 78, national: 83, legend: 88 };
export const LEVEL_KO: Record<AiLevel, string> = { trainee: '연습생', futures: '2군', first: '1군', allstar: '올스타', national: '국가대표', legend: '레전드' };

export function aiLevel(): AiLevel {
  try {
    const raw = localStorage.getItem('bb.start');
    const v = raw ? (JSON.parse(raw) as { level?: string }).level : undefined;
    if (v && v in LEVEL_OVR) return v as AiLevel;
  } catch { /* 기본값 */ }
  return 'futures';
}

export interface ClubRoster {
  teamId: string;
  mine: boolean;
  /** 타순 1~9 */
  batting: { player: Player; pos: Exclude<Pos, 'P'> }[];
  rotation: Player[];
  bullpen: Player[];
  closer: Player | null;
  bench: Player[];
  /** 엔진 능력치 보정 — 목표 종합 − 선수 종합 (AI 구단) */
  delta: Map<string, number>;
  /** 세트덱 효과 (내 구단) */
  setFx: Map<string, SetEffect>;
  /** 카드 강화 보너스 (내 구단) */
  enh: Map<string, number>;
  /** 팀 종합 (표시용) */
  ovr: number;
}

const BAT_POS: Exclude<Pos, 'P'>[] = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
const TIER_ADJ: Record<string, number> = { 강: 2, 중: 0, 약: -2 };

const aiCache = new Map<string, ClubRoster>();
/** AI 구단 선수단 (난이도 · 구단마다 늘 같은 선수) */
export function clubRoster(teamId: string, level: AiLevel = aiLevel()): ClubRoster {
  const key = `${teamId}:${level}`;
  const hit = aiCache.get(key);
  if (hit) return hit;
  const team = TEAMS.find((t) => t.id === teamId) ?? TEAMS[0];
  const target = LEVEL_OVR[level] + (TIER_ADJ[team.tier] ?? 0);
  // 그 구단 2027 선수단 = 마지막 실제 시즌 선수단 (부활 옛 구단은 그 이름의 마지막 시즌)
  const real = seasonRoster(team.code, team.old ? eraOfCode(team.code)[1] : 2027).filter((p) => !!p.real);
  const own = real.length >= 12 ? real : PLAYERS.filter((p) => p.teamId === teamId && /^p\d+$/.test(p.id) && p.id !== 'p41');
  const used = new Set<string>();
  const delta = new Map<string, number>();
  const names = new Set(PLAYERS.map((p) => p.name));
  const made: Player[] = [];
  let k = 0;
  const take = (pred: (p: Player) => boolean, pos: Pos, role: PitcherRole | undefined, off: number, sub?: Pos[]): Player => {
    const real = own.find((p) => !used.has(p.id) && pred(p));
    if (real) {
      used.add(real.id);
      delta.set(real.id, target + off + 2 - real.ovr); // 주전은 그 구단에서 조금 더 세게
      return real;
    }
    const id = `ai-${teamId}-${String(k++).padStart(2, '0')}`;
    const p = synthPlayer({ id, teamId, pos, role, sub, ovr: target + off, seed: `ai:${teamId}:${pos}:${k}`, usedNames: names });
    made.push(p);
    delta.set(id, 0);
    return p;
  };
  const OFF: Record<string, number> = { C: -1, '1B': 2, '2B': 0, '3B': 1, SS: 1, LF: 0, CF: 1, RF: 1, DH: 2 };
  const batting = BAT_POS.map((pos) => ({ pos, player: take((p) => p.pos === pos, pos, undefined, OFF[pos]) }));
  const bench = [take((p) => p.pos === 'C', 'C', undefined, -4), take((p) => p.pos !== 'P', '2B', undefined, -3, ['SS', '3B'])];
  const rotation = [2, 1, 0, -1, -2].map((off) => take((p) => p.pos === 'P' && p.role === 'SP', 'P', 'SP', off));
  const bullpen = [0, -1, -1, -2, -3].map((off) => take((p) => p.pos === 'P' && p.role === 'RP', 'P', 'RP', off));
  const closer = take((p) => p.pos === 'P' && p.role === 'CL', 'P', 'CL', 1);
  registerPlayers(made);
  // 타순 — 종합 순으로 3·4·5번에 세고, 1·2번은 빠른 선수
  const strength = (p: Player) => p.ovr + (delta.get(p.id) ?? 0);
  const sorted = batting.slice().sort((a, b) => strength(b.player) - strength(a.player));
  const spd = (p: Player) => p.face.find((f) => f.code === 'SPD')?.v ?? 50;
  const top = sorted.slice(0, 5);
  const lead = top.slice().sort((a, b) => spd(b.player) - spd(a.player))[0];
  const rest = sorted.filter((x) => x !== lead);
  const order = [lead, rest[1], rest[0], rest[2], rest[3], ...rest.slice(4)].filter(Boolean);
  const r: ClubRoster = { teamId, mine: false, batting: order, rotation, bullpen, closer, bench, delta, setFx: new Map(), enh: new Map(), ovr: target };
  aiCache.set(key, r);
  return r;
}

/** 내 구단 — 라인업 화면의 1군 엔트리 (세트덱 효과 · 강화 포함) */
export function myRoster(st: LineupState = lineupStore.get() ?? initialLineup()): ClubRoster {
  const ev = evaluate(st);
  const setFx = new Map<string, SetEffect>();
  const enh = new Map<string, number>();
  const pl = (id: string | null) => (id ? unit(id) : undefined);
  const note = (slot: string, id: string | null) => {
    const u = pl(id);
    if (!u) return;
    const fx = ev.units[slot as keyof typeof ev.units]?.set?.cur;
    if (fx) setFx.set(u.player.id, fx);
    if (u.card.enhance) enh.set(u.player.id, Math.round(u.card.enhance * 0.5));
  };
  const batting = st.order.map((slot) => {
    note(slot, st.field[slot]);
    return { player: pl(st.field[slot])!.player, pos: slot };
  }).filter((b) => !!b.player);
  const rotation = st.rotation.map((id, i) => { note(`R${i}`, id); return pl(id)?.player; }).filter((p): p is Player => !!p);
  const bullpen = st.bullpen.map((id, i) => { note(`B${i}`, id); return pl(id)?.player; }).filter((p): p is Player => !!p);
  note('CL', st.closer);
  const closer = pl(st.closer)?.player ?? null;
  const inUse = new Set([...batting.map((b) => b.player.id), ...rotation.map((p) => p.id), ...bullpen.map((p) => p.id), closer?.id]);
  const bench = st.bench.map((id) => pl(id)?.player).filter((p): p is Player => !!p && !inUse.has(p.id));
  void getSlot;
  return { teamId: ME.teamId, mine: true, batting, rotation, bullpen, closer, bench, delta: new Map(), setFx, enh, ovr: ev.overall };
}

/** 그 구단 선수단 (내 구단이면 내 엔트리) */
export const rosterOf = (teamId: string) => (teamId === ME.teamId ? myRoster() : clubRoster(teamId));

/** AI 구단 선수단을 미리 만들어 둔다 — 가상 선수 이름(개인 기록 1위 · 소식)을 화면을 다시 열어도 찾을 수 있게 */
export function ensureClubRosters() { for (const t of TEAMS) if (t.id !== ME.teamId) clubRoster(t.id); }
