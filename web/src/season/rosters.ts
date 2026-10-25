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
import { cardShow, playerShift } from '../game/ovrShow';
import { LEGEND_MAX, MVP_MAX, isLegendGrade, isMvpGrade, potFaceOf, teamPotential } from '../game/potential';
import { interviewFx } from '../game/press';
import { loadTactics, type TacState } from '../game/tactics';
import { PEN_SLOTS, ROT_SLOTS, STAFF_FIT_PENALTY, evaluate, fitOf, getSlot, initialLineup, potEntryOf, store as lineupStore, unit, type LineupState, type StaffSlot } from '../screens/lineup/calc';

import { LEVEL_KO, aiLevel, aiTargetOf, seasonYear, type AiLevel } from './league';
export { LEVEL_KO, aiLevel, aiTargetOf, type AiLevel };
/** 능력치로 올리는 한도 — 넘치는 만큼은 엔진 보너스 */
const ATTR_ROOM = 92;
/** AI 구단 실제 선수의 실력 차이를 얼마나 살리나 — 0 이면 모두 목표 세기로 같아진다(에이스 · 강타자가 사라져 평균자책 1위가 3~5점대).
 *  평균보다 잘하는 쪽(up)은 크게, 못하는 쪽(down)은 덜 벌린다(규정타석 꼴찌 타율이 너무 떨어지지 않게). 벌린 뒤 묶음(선발 · 불펜 · 주전 · 벤치) 평균은 목표로 되돌린다.
 *  사용자 지시 10-26 "평균자책 2~3점대 몇 명 · 특출한 시즌엔 1점대" · "KBO 1위 수치 편차 기준" — 맞춘 결과는 shared/engine/params bonus.softCap 주석 */
export const AI_SPREAD = { P: { up: 2.5, down: 0.8 }, B: { up: 1.75, down: 0.6 } };
/** 올해 커리어 하이 — 시즌마다 AI 1 · 2선발 중 몇 명(리그 전체 1~2명꼴)이 특출한 시즌(평균자책 1점대 언저리)을 보낸다. 연도 · 선수로 정해져 그 시즌 내내 같다 */
const BREAKOUT = { chance: 0.08, boost: 10 };
const hash01 = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };

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
  /** 화면 눈금 몫 (내 구단 — 카드 등급 구간, game/ovrShow cardShow). 없으면 엔진 힘의 꺾은선(playerShift) — season/sim teamIn */
  show?: Map<string, number>;
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
/** 같은 사람 — 실제 선수는 시즌마다 보기 id 가 달라('…~2015' · '…~2016') 시즌 꼬리를 떼고 비교 */
const person = (id: string) => id.replace(/~\d{4}$/, '');
/** 내 선수단(1군 엔트리 + 벤치)의 사람들 — 라인업이 바뀔 때만 다시 센다 */
let mineMemo: { st: LineupState; set: Set<string>; sig: string } | null = null;
function myPersons(): { set: Set<string>; sig: string } {
  const st = lineupStore.get() ?? initialLineup();
  if (mineMemo && mineMemo.st === st) return mineMemo;
  const ids = [...Object.values(st.field), ...st.rotation, ...st.bullpen, st.closer, ...st.bench].filter((x): x is string => !!x);
  const set = new Set<string>();
  for (const id of ids) { try { set.add(person(unit(id).player.id)); } catch { /* 보관함에 없는 카드 */ } }
  mineMemo = { st, set, sig: [...set].sort().join(',') };
  return mineMemo;
}
/** AI 구단 선수단 (리그 단계 목표 · 구단마다 늘 같은 선수).
 *  내 선수단에 있는 사람은 빼고 다음 선수로 채운다 — 같은 선수가 두 구단에서 동시에 뛰면 시즌 기록이 한 줄로 합쳐진다(288경기 · 타이틀 독식) */
export function clubRoster(teamId: string, target: number = aiTargetOf(teamId)): ClubRoster {
  const mine = myPersons();
  const year = seasonYear();
  const key = `${teamId}:${target}:${year}:${mine.sig}`;
  const hit = aiCache.get(key);
  if (hit) return hit;
  const team = TEAMS.find((t) => t.id === teamId) ?? TEAMS[0];
  // 그 구단 2027 선수단 = 마지막 실제 시즌 선수단 (부활 옛 구단은 그 이름의 마지막 시즌) — 내 선수단에 있는 사람은 빼고
  const real = seasonRoster(team.code, team.old ? eraOfCode(team.code)[1] : 2027).filter((p) => !!p.real && !mine.set.has(person(p.id)));
  const own = real.length >= 12 ? real : PLAYERS.filter((p) => p.teamId === teamId && /^p\d+$/.test(p.id) && p.id !== 'p41');
  const used = new Set<string>();
  const delta = new Map<string, number>();
  const enh = new Map<string, number>();
  const names = new Set(PLAYERS.map((p) => p.name));
  const made: Player[] = [];
  /** 뽑은 실제 선수 — 세기는 다 뽑은 뒤 구단 평균에 맞춰 정한다(실력 차이를 살리려고) */
  const chosen: { p: Player; off: number; g: string }[] = [];
  /** 지금 뽑는 묶음 — 실력 차이는 묶음 안에서만 벌린다(선발 · 불펜 · 주전 타자 · 벤치 각자 평균은 예전 그대로) */
  let group = 'bat';
  let k = 0;
  const take = (pred: (p: Player) => boolean, pos: Pos, role: PitcherRole | undefined, off: number, sub?: Pos[]): Player => {
    const real = own.find((p) => !used.has(p.id) && pred(p));
    if (real) {
      used.add(real.id);
      chosen.push({ p: real, off, g: group });
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
  group = 'bench';
  const bench = [take((p) => p.pos === 'C', 'C', undefined, -4), take((p) => p.pos !== 'P', '2B', undefined, -3, ['SS', '3B'])];
  group = 'rot';
  const rotation = [2, 1, 0, -1, -2].map((off) => take((p) => p.pos === 'P' && p.role === 'SP', 'P', 'SP', off));
  group = 'pen';
  const bullpen = [0, -1, -1, -2, -3].map((off) => take((p) => p.pos === 'P' && p.role === 'RP', 'P', 'RP', off));
  const closer = take((p) => p.pos === 'P' && p.role === 'CL', 'P', 'CL', 1);
  // 실제 선수 세기 = 목표 + 자리 몫 + 2(주전은 조금 더 세게) + 실력 차이(그 선수 종합 − 같은 묶음 평균) × AI_SPREAD — 묶음 평균은 0 으로 되돌린다
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const spread = new Map<string, number>();
  for (const grp of ['bat', 'bench', 'rot', 'pen']) {
    const g = chosen.filter((c) => c.g === grp);
    const m = avg(g.map((c) => c.p.ovr));
    const k = grp === 'rot' || grp === 'pen' ? AI_SPREAD.P : AI_SPREAD.B;
    const raw = g.map((c) => { const d = c.p.ovr - m; return d > 0 ? k.up * d : k.down * d; });
    const back = avg(raw); // 벌린 뒤 평균을 0 으로 — 구단 세기는 목표 그대로
    g.forEach((c, i) => spread.set(c.p.id, raw[i] - back));
  }
  const aces = new Set(chosen.filter((c) => c.g === 'rot').slice(0, 2).map((c) => c.p.id));
  for (const { p, off } of chosen) {
    const career = aces.has(p.id) && hash01(`${year}|${p.id}|breakout`) < BREAKOUT.chance ? BREAKOUT.boost : 0;
    const want = target + off + 2 + (spread.get(p.id) ?? 0) + career;
    delta.set(p.id, Math.round(Math.min(want, ATTR_ROOM) - p.ovr));
    if (want > ATTR_ROOM) enh.set(p.id, Math.round(want - ATTR_ROOM));
  }
  registerPlayers(made);
  // 타순 — 종합 순으로 3·4·5번에 세고, 1·2번은 빠른 선수
  const strength = (p: Player) => p.ovr + (delta.get(p.id) ?? 0) + (enh.get(p.id) ?? 0);
  const sorted = batting.slice().sort((a, b) => strength(b.player) - strength(a.player));
  const spd = (p: Player) => p.face.find((f) => f.code === 'SPD')?.v ?? 50;
  const top = sorted.slice(0, 5);
  const lead = top.slice().sort((a, b) => spd(b.player) - spd(a.player))[0];
  const rest = sorted.filter((x) => x !== lead);
  const order = [lead, rest[1], rest[0], rest[2], rest[3], ...rest.slice(4)].filter(Boolean);
  // 화면 눈금 몫은 구단 하나에 한 값(그 구단 세기 눈금) — 선수마다 꺾은선(playerShift)을 따로 쓰면 등급 구간 기울기(힘 92~110 은 ×2, 그 아래는 ×0.5~0.7)가
  // 리그 단계마다 AI 스타를 지나치게 누르거나(연습생) 괴물로 만들었다(2군: AI 타자 6명 50홈런). 구단 안 실력 차이는 힘 눈금 그대로 1:1
  const show = new Map<string, number>();
  const teamShift = playerShift(target + 2);
  for (const p of [...order.map((b) => b.player), ...bench, ...rotation, ...bullpen, ...(closer ? [closer] : [])]) show.set(p.id, teamShift);
  const r: ClubRoster = { teamId, mine: false, batting: order, rotation, bullpen, closer, bench, delta, setFx: new Map(), enh, show, ovr: Math.round(target) };
  if (aiCache.size > 40) aiCache.clear(); // 라인업을 바꿀 때마다 열쇠가 새로 생긴다 — 오래된 것은 버린다
  aiCache.set(key, r);
  return r;
}

/** 내 구단 — 라인업 화면의 1군 엔트리 (세트덱 효과 · 강화 포함) */
export function myRoster(st: LineupState = withTac(lineupStore.get() ?? initialLineup())): ClubRoster {
  const ev = evaluate(st);
  const setFx = new Map<string, SetEffect>();
  const enh = new Map<string, number>();
  const train = new Map<string, { k: BatKey | PitKey; v: number }[]>();
  const show = new Map<string, number>();
  const pl = (id: string | null) => (id ? unit(id) : undefined);
  // 잠재력 — 엔트리(타자 9 · 투수 16) 카드의 별 셋은 팀 타자 · 투수 전원에게(엔트리에서 2명만 켜진다 — 라인업 계산과 같은 potEntryOf),
  // 벤치 카드는 자기 몫만(별 셋은 꺼짐)
  const entryIds = [...st.order.map((slot) => st.field[slot]), ...st.rotation, ...st.bullpen, st.closer].filter((id): id is string => !!id);
  const tp = teamPotential(potEntryOf(st), st.bench.filter((id) => !entryIds.includes(id)).map((id) => unit(id)));
  /** 카드 보너스 → 엔진 보너스 — 강화 · 훈련 · 잠재력(팀 몫 포함) · 플레이스타일 (game/cardBonus — 카드 숫자 · 능력치 · 팀 종합과 같은 계산).
   *  세트덱은 setFx 로 따로. 벤치 카드도 — 대타로 나오면 그대로 */
  const noteTrain = (id: string | null) => {
    const u = pl(id);
    if (!u) return;
    const isP = u.player.pos === 'P';
    show.set(u.player.id, cardShow(u.card, u.player.ovr).shift);
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
  return { teamId: ME.teamId, mine: true, batting, rotation, bullpen, closer, bench, delta: new Map(), setFx, enh, train, show, ovr: Math.round(ev.raw), tac: st.tac };
}

/** 그 구단 선수단 (내 구단이면 내 엔트리) */
export const rosterOf = (teamId: string) => (teamId === ME.teamId ? myRoster() : clubRoster(teamId));

/** AI 구단 선수단을 미리 만들어 둔다 — 가상 선수 이름(개인 기록 1위 · 소식)을 화면을 다시 열어도 찾을 수 있게 */
export function ensureClubRosters() { for (const t of TEAMS) if (t.id !== ME.teamId) clubRoster(t.id); }
