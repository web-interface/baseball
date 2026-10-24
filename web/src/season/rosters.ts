// 시즌 선수단 — 내 구단은 라인업 화면의 1군 엔트리(카드 · 세트덱 효과 그대로), AI 구단은 리그 단계(season/league — 자동으로 오르내림)만큼.
// AI 구단: 그 구단의 마지막 실제 시즌 선수(실제 선수 카탈로그 game/kbo — 바뀐 이름) + 모자란 자리는 가상 선수.
// 엔진에 넣을 때 종합을 목표에 맞춘다 — 능력치를 더하거나 빼되 92 위로 넘치는 만큼은 엔진 보너스(강화와 같은 길)로.
import { ME, PLAYERS, TEAMS, registerPlayers } from '../game/mock';
import { synthPlayer } from '../game/starter';
import { seasonRoster } from '../game/history';
import { eraOfCode } from '../game/world';
import type { Player, PitcherRole, Pos } from '../game/types';
import type { BatKey, PitKey, SetEffect } from '../game/sets';
import { cardBonusOf, engineFxOf } from '../game/cardBonus';
import { LEGEND_MAX, MVP_MAX, isLegendGrade, isMvpGrade, potEngineFx, potFaceOf, teamPotential } from '../game/potential';
import { interviewFx } from '../game/press';
import { loadTactics, type TacState } from '../game/tactics';
import { PEN_SLOTS, ROT_SLOTS, STAFF_FIT_PENALTY, evaluate, fitOf, getSlot, initialLineup, store as lineupStore, unit, type LineupState, type StaffSlot } from '../screens/lineup/calc';

import { LEVEL_KO, aiLevel, aiTargetOf, type AiLevel } from './league';
export { LEVEL_KO, aiLevel, aiTargetOf, type AiLevel };
/** 능력치로 올리는 한도 — 넘치는 만큼은 엔진 보너스 */
const ATTR_ROOM = 92;

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
  /** 카드 훈련으로 오른 능력치 + 켜진 잠재력 — 엔진 칸별 { k, v } (내 구단, game/training trainFx · game/potential potEngineFx) */
  train?: Map<string, { k: BatKey | PitKey; v: number }[]>;
  /** 팀 종합 (표시용) */
  ovr: number;
  /** 경기 전 전술 (내 구단 — game/tactics). 없으면 엔진 기본 */
  tac?: TacState;
}

/** 지금 라인업 + 지금 전술 — 경기에 쓸 때 같이 얼린다(다시 보기 · 경기 기록이 같은 경기가 되게) */
export const withTac = (st: LineupState): LineupState => ({ ...st, tac: loadTactics() });

const BAT_POS: Exclude<Pos, 'P'>[] = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];

const aiCache = new Map<string, ClubRoster>();
/** AI 구단 선수단 (리그 단계 목표 · 구단마다 늘 같은 선수) */
export function clubRoster(teamId: string, target: number = aiTargetOf(teamId)): ClubRoster {
  const key = `${teamId}:${target}`;
  const hit = aiCache.get(key);
  if (hit) return hit;
  const team = TEAMS.find((t) => t.id === teamId) ?? TEAMS[0];
  // 그 구단 2027 선수단 = 마지막 실제 시즌 선수단 (부활 옛 구단은 그 이름의 마지막 시즌)
  const real = seasonRoster(team.code, team.old ? eraOfCode(team.code)[1] : 2027).filter((p) => !!p.real);
  const own = real.length >= 12 ? real : PLAYERS.filter((p) => p.teamId === teamId && /^p\d+$/.test(p.id) && p.id !== 'p41');
  const used = new Set<string>();
  const delta = new Map<string, number>();
  const enh = new Map<string, number>();
  const names = new Set(PLAYERS.map((p) => p.name));
  const made: Player[] = [];
  let k = 0;
  const take = (pred: (p: Player) => boolean, pos: Pos, role: PitcherRole | undefined, off: number, sub?: Pos[]): Player => {
    const real = own.find((p) => !used.has(p.id) && pred(p));
    if (real) {
      used.add(real.id);
      const want = target + off + 2; // 주전은 그 구단에서 조금 더 세게
      delta.set(real.id, Math.min(want, ATTR_ROOM) - real.ovr);
      if (want > ATTR_ROOM) enh.set(real.id, Math.round(want - ATTR_ROOM));
      return real;
    }
    const id = `ai-${teamId}-${String(k++).padStart(2, '0')}`;
    const want = target + off;
    const p = synthPlayer({ id, teamId, pos, role, sub, ovr: Math.round(Math.min(want, ATTR_ROOM)), seed: `ai:${teamId}:${pos}:${k}`, usedNames: names });
    made.push(p);
    delta.set(id, 0);
    if (want > ATTR_ROOM) enh.set(id, Math.round(want - ATTR_ROOM));
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
  const strength = (p: Player) => p.ovr + (delta.get(p.id) ?? 0) + (enh.get(p.id) ?? 0);
  const sorted = batting.slice().sort((a, b) => strength(b.player) - strength(a.player));
  const spd = (p: Player) => p.face.find((f) => f.code === 'SPD')?.v ?? 50;
  const top = sorted.slice(0, 5);
  const lead = top.slice().sort((a, b) => spd(b.player) - spd(a.player))[0];
  const rest = sorted.filter((x) => x !== lead);
  const order = [lead, rest[1], rest[0], rest[2], rest[3], ...rest.slice(4)].filter(Boolean);
  const r: ClubRoster = { teamId, mine: false, batting: order, rotation, bullpen, closer, bench, delta, setFx: new Map(), enh, ovr: Math.round(target) };
  aiCache.set(key, r);
  return r;
}

/** 내 구단 — 라인업 화면의 1군 엔트리 (세트덱 효과 · 강화 포함) */
export function myRoster(st: LineupState = withTac(lineupStore.get() ?? initialLineup())): ClubRoster {
  const ev = evaluate(st);
  const setFx = new Map<string, SetEffect>();
  const enh = new Map<string, number>();
  const train = new Map<string, { k: BatKey | PitKey; v: number }[]>();
  const pl = (id: string | null) => (id ? unit(id) : undefined);
  // 잠재력 — 엔트리(타자 9 · 투수 11) 카드의 최고 잠재력은 팀 타자 · 투수 전원에게, 벤치 카드는 자기 몫만
  const entryIds = [...st.order.map((slot) => st.field[slot]), ...st.rotation, ...st.bullpen, st.closer].filter((id): id is string => !!id);
  const tp = teamPotential(entryIds.map((id) => unit(id)), st.bench.filter((id) => !entryIds.includes(id)).map((id) => unit(id)));
  /** 카드 보너스 → 엔진 보너스 — 강화 · 훈련 · 잠재력(팀 몫 포함) · 플레이스타일 (game/cardBonus — 카드 숫자 · 능력치 · 팀 종합과 같은 계산).
   *  세트덱은 setFx 로 따로. 벤치 카드도 — 대타로 나오면 그대로 */
  const noteTrain = (id: string | null) => {
    const u = pl(id);
    if (!u) return;
    const isP = u.player.pos === 'P';
    const tf = engineFxOf(cardBonusOf(u.card, u.player, { potFace: potFaceOf(tp, u.card.id, isP) }), isP);
    if (tf.length) train.set(u.player.id, tf);
  };
  const note = (slot: string, id: string | null) => {
    const u = pl(id);
    if (!u) return;
    const fx = ev.units[slot as keyof typeof ev.units]?.set?.cur;
    if (fx) setFx.set(u.player.id, fx);
    // 강화는 이제 카드 보너스(noteTrain)로 — 대표 능력치마다 강화 단계 상승분 (화면 숫자와 같게)
    noteTrain(id);
  };
  const batting = st.order.map((slot) => {
    note(slot, st.field[slot]);
    const u = pl(st.field[slot]);
    return u ? { player: u.player, pos: slot } : null; // 빈 자리(레전드급 정리 · 카드 없음)는 건너뜀
  }).filter((b): b is { player: Player; pos: typeof st.order[number] } => !!b);
  const rotation = st.rotation.map((id, i) => { note(`R${i}`, id); return pl(id)?.player; }).filter((p): p is Player => !!p);
  const bullpen = st.bullpen.map((id, i) => { note(`B${i}`, id); return pl(id)?.player; }).filter((p): p is Player => !!p);
  note('CL', st.closer);
  const closer = pl(st.closer)?.player ?? null;
  // 같은 사람은 로스터에 한 번 — 실제 선수는 시즌마다 보기 id 가 달라('…~2015' · '…~2016') 시즌 꼬리를 떼고 비교
  const person = (id: string) => id.replace(/~\d{4}$/, '');
  const inUse = new Set([...batting.map((b) => b.player.id), ...rotation.map((p) => p.id), ...bullpen.map((p) => p.id), ...(closer ? [closer.id] : [])].map(person));
  // 투수 보직 감점 — 선발 ↔ 불펜이 엇갈리면(라인업 화면 '보직 밖') 투구 능력치를 그만큼 깎는다 (팀 종합의 감점과 같은 값)
  const staffSlots: StaffSlot[] = [...ROT_SLOTS, ...PEN_SLOTS, 'CL'];
  for (const slot of staffSlots) {
    const u = pl(getSlot(st, slot));
    if (!u) continue;
    const pen = STAFF_FIT_PENALTY[fitOf(u.player, slot)];
    if (pen > 0) train.set(u.player.id, [...(train.get(u.player.id) ?? []), ...(['vel', 'stf', 'brk', 'ctl'] as const).map((k) => ({ k, v: -pen }))]);
  }
  // 레전드급 — 경기에 나서는 선수단 전체(벤치 포함)에서 타자 2명 · 투수 2명까지, MVP 는 합쳐 4명까지. 엔트리가 먼저, 남는 몫만큼 벤치
  const legLeft = { ...LEGEND_MAX };
  let mvpLeft = MVP_MAX;
  entryIds.forEach((id) => {
    const u = unit(id);
    if (isLegendGrade(u.card.grade)) legLeft[u.player.pos === 'P' ? 'pit' : 'bat']--;
    if (isMvpGrade(u.card.grade)) mvpLeft--;
  });
  const benchIds = st.bench.filter((id) => {
    const u = pl(id);
    if (!u || inUse.has(person(u.player.id))) return false;
    if (isMvpGrade(u.card.grade) && mvpLeft <= 0) return false;
    if (isLegendGrade(u.card.grade) && legLeft[u.player.pos === 'P' ? 'pit' : 'bat'] <= 0) return false;
    inUse.add(person(u.player.id));
    if (isMvpGrade(u.card.grade)) mvpLeft--;
    if (isLegendGrade(u.card.grade)) legLeft[u.player.pos === 'P' ? 'pit' : 'bat']--;
    return true;
  });
  const bench = benchIds.map((id) => pl(id)!.player);
  benchIds.forEach(noteTrain);
  // 감독 인터뷰 효과 (game/press) — 인터뷰한 그 몇 경기에서만, 훈련 · 잠재력과 같은 엔진 칸 { k, v } 로 더한다
  for (const [pid, fx] of interviewFx(st, [...batting.map((b) => b.player), ...bench, ...rotation, ...bullpen, ...(closer ? [closer] : [])])) {
    train.set(pid, [...(train.get(pid) ?? []), ...fx]);
  }
  // 전술은 스냅샷에 얼린 것만(예전 기록의 스냅샷엔 없다 → 엔진 기본, 그때와 같은 경기)
  return { teamId: ME.teamId, mine: true, batting, rotation, bullpen, closer, bench, delta: new Map(), setFx, enh, train, ovr: Math.round(ev.raw), tac: st.tac };
}

/** 그 구단 선수단 (내 구단이면 내 엔트리) */
export const rosterOf = (teamId: string) => (teamId === ME.teamId ? myRoster() : clubRoster(teamId));

/** AI 구단 선수단을 미리 만들어 둔다 — 가상 선수 이름(개인 기록 1위 · 소식)을 화면을 다시 열어도 찾을 수 있게 */
export function ensureClubRosters() { for (const t of TEAMS) if (t.id !== ME.teamId) clubRoster(t.id); }
