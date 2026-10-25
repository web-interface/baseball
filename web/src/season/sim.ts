// 시즌 경기 계산 — 공용 경기 엔진(shared/engine)으로 한 경기씩. 이 파일은 엔진을 싣고 있어서 필요할 때만 불러온다(import()).
// 같은 시즌 시드 · 같은 날 · 같은 선수단이면 늘 같은 경기(엔진은 결정적). 피로·부상은 날을 넘겨 이어 가지 않는다(하루하루 새로).
import {
  ATTR_KEYS, ENGINE_VER, POS_KEYS, CITY_IDS, neutralTimeline, seedFromString, simulateGame,
  type Command, type GameInput, type GameResult, type Park, type PitRole, type PlayerIn, type TeamIn, type Tactics,
} from '../../../shared/engine/index.ts';
import { personKey, teamVal, type TeamKey } from '../game/tactics';
import { TEAMS, playerById, teamById } from '../game/mock';
import type { AttrKey, Player, Pos, WeatherKey } from '../game/types';
import { condsOf, weatherFx } from '../game/weatherFit';
import type { BatKey, PitKey, SetEffect } from '../game/sets';
import { rosterOf, type ClubRoster } from './rosters';
import { playerShift } from '../game/ovrShow';
import { armLoads, relieverAvail, starterRelief, type ArmLoad } from './arm';
import { getSeason } from './store';
import { leagueEnv } from './env';
import { startTime } from './schedule';
import { weatherOf } from './weather';
export { rainedOut, weatherOf } from './weather';

export { simulateGame };

/* ───────── 선수 → 엔진 입력 ───────── */
const DEF_B: Record<string, number> = { contactR: 15, contactL: 15, power: 10, gap: 12, eye: 15, avoidK: 15, vsFast: 15, vsBreak: 15, bunt: 35, pullTend: 50, launchTend: 45, swingTend: 50,
  speed: 35, baserunning: 35, stealJump: 25, sliding: 30, range: 40, firstStep: 40, hands: 45, armStr: 50, armAcc: 45, turnDP: 25, block: 15, framing: 15, popTime: 15, pitcherLead: 15 };
const DEF_P: Record<string, number> = { velocity: 15, control: 15, deception: 20, extension: 30, stamina: 20, recovery: 40, pickoff: 20, slideStep: 30, pFielding: 30, gbTend: 50 };
const clamp = (v: number, lo = 1, hi = 99) => Math.max(lo, Math.min(hi, v));
const AIDX = new Map<string, number>(ATTR_KEYS.map((k, i) => [k as string, i]));

/** 세트덱 효과 칸 → 엔진 능력치 (보너스 배열 47칸: 45 능력치 + [45] 구종 위력 + [46] 구종 제구) */
const B_MAP: Record<BatKey, [string | number, number][]> = {
  con: [['contactR', 1], ['contactL', 1]], pow: [['power', 1]], gap: [['gap', 1]], eye: [['eye', 1], ['avoidK', 0.5]],
  spd: [['speed', 1], ['baserunning', 0.5]], stl: [['stealJump', 1], ['sliding', 0.5]],
  def: [['range', 1], ['firstStep', 0.7], ['hands', 0.7], ['block', 0.7], ['framing', 0.5]], arm: [['armStr', 1], ['armAcc', 0.7], ['popTime', 0.7]],
};
const P_MAP: Record<PitKey, [string | number, number][]> = {
  vel: [['velocity', 1]], stf: [[45, 1]], brk: [[45, 0.6]], ctl: [['control', 1], [46, 0.8]], sta: [['stamina', 1]], rec: [['recovery', 1]], mnt: [['composure', 1], ['concentration', 0.6]],
};
function bonusArr(fx: SetEffect | undefined, enh: number, isP: boolean, train?: { k: string; v: number }[]): number[] | undefined {
  if (!fx && !enh && !train?.length) return undefined;
  const out = new Array(47).fill(0);
  if (enh) for (let i = 0; i < 47; i++) if (!/Tend$/.test(String(ATTR_KEYS[i] ?? ''))) out[i] += enh;
  if (fx || train?.length) {
    // 세트덱 효과 + 카드 훈련으로 오른 능력치(game/training trainFx — 같은 { k, v } 칸)
    const list: { k: string; v: number }[] = [...(fx ? (isP ? fx.pit : fx.bat) : []), ...(train ?? [])];
    for (const x of list) {
      const map = (isP ? P_MAP : B_MAP)[x.k as never] as [string | number, number][] | undefined;
      for (const [key, w] of map ?? []) {
        const i = typeof key === 'number' ? key : AIDX.get(key);
        if (i != null) out[i] += x.v * w;
      }
    }
  }
  return out;
}
const armSlot = (p: Player): PlayerIn['armSlot'] => {
  const f = p.form?.pitch ?? '';
  return /사이드/.test(f) ? 'side' : /언더/.test(f) ? 'under' : /오버/.test(f) ? 'over' : 'threeQuarter';
};
/** shift — 화면 눈금 몫(game/ovrShow): 엔진도 화면에 보이는 능력치 숫자를 그대로 받는다 (성향 칸 '…Tend' 은 그대로).
 *  리그 공통 수준은 GameInput.levelRef(두 팀 평균 몫)로 맞춘다 — runGame */
export function toPlayerIn(p: Player, id: number, delta: number, fx?: SetEffect, enh = 0, train?: { k: string; v: number }[], shift = 0): PlayerIn {
  const isP = p.pos === 'P';
  const attrs = ATTR_KEYS.map((k) => {
    const raw = p.attrs[k as AttrKey];
    if (/Tend$/.test(k)) return raw ?? (DEF_B[k] ?? DEF_P[k] ?? 50);
    return raw != null ? clamp(raw + delta + shift) : (DEF_B[k] ?? DEF_P[k] ?? 50) + shift;
  });
  const pos = POS_KEYS.map((q) => (q === p.pos ? 20 : p.subPos?.includes(q as Pos) ? 15 : q === 'DH' && !isP ? 16 : isP ? (q === 'P' ? 20 : 1) : 4));
  return {
    id, age: p.age, throws: p.throws, bats: p.bats, heightCm: p.heightCm, weightKg: p.weightKg, armSlot: armSlot(p),
    attrs, pos,
    pitches: isP ? (p.pitches ?? [{ type: 'FF', ko: '포심', stuff: 50, command: 50, usage: 1, kmh: 140 }]).map((x) => ({ t: x.type, stuff: clamp(x.stuff + delta + shift), cmd: clamp(x.command + delta + shift), use: Math.round(x.usage * 100) })) : [],
    traits: [],
    role: isP ? (p.role === 'SP' ? 'SP' : p.role === 'CL' ? 'CL' : 'RP') : undefined,
    bonus: bonusArr(fx, enh, isP, train),
  };
}

/** 구장 → 엔진 구장 */
const parkCache = new Map<string, Park>();
export function parkOf(teamId: string): Park {
  const hit = parkCache.get(teamId);
  if (hit) return hit;
  const t = teamById(teamId);
  const st = t.stadium;
  const [L, C, R] = st.fence;
  const [wl, wc, wr] = st.wallM;
  const dome = st.roof === 'dome';
  const p: Park = {
    id: t.id, name: st.name,
    fence: [{ ang: -45, dist: L, h: wl }, { ang: -22.5, dist: (L + C) / 2 + 6, h: (wl + wc) / 2 }, { ang: 0, dist: C, h: wc }, { ang: 22.5, dist: (C + R) / 2 + 6, h: (wc + wr) / 2 }, { ang: 45, dist: R, h: wr }],
    foul: st.foul === 'narrow' ? 0.8 : st.foul === 'wide' ? 1.25 : 1,
    roof: dome ? 'dome' : 'open', surface: st.surface === 'turf' ? 'turf' : 'grass', elevM: 40, orientDeg: 45,
    expoHigh: dome ? 0 : 0.6, expoLow: dome ? 0 : 0.4, drainage: 'B', seaFog: st.backdrop === 'sea', wallBounce: 0.3,
    lat: 36.3, lon: 127.4, city: CITY_IDS[0],
  };
  parkCache.set(teamId, p);
  return p;
}

/** 엔진을 KBO 기록에 맞춘 리그 수준(연습생 단계 — AI 팀 종합 64~70, 기본 선수단 66) — 두 팀 평균 팀 종합이 이보다 높으면 그만큼 기준점을 올린다 */
export const LEVEL_P0 = 67;

const UMP = { id: 'u-std', size: 0, low: 0, high: 0, inside: 0, outside: 0, consistency: 1, countBias: 0, closeCall: 1 };
const RULES = { maxInnings: 12, dh: true, zone: 'ABS' as const, shift: 'restricted' as const, pitchClock: true, heatRule: false, reviews: 2 };
/** 포스트시즌 — 연장 15회까지 (KBO) */
const POST_RULES = { ...RULES, maxInnings: 15 };

/* ───────── 선수단 → 엔진 팀 ───────── */
export interface SideIn { team: TeamIn; webOf: Map<number, string>; idOf: Map<string, number>; roster: ClubRoster; /** 화면 눈금 몫 합 · 선수 수 (levelRef) */ shift: { sum: number; n: number } }
/** conds — 그 경기에 걸리는 날씨(더위 · 추위 · 비 · 낮 경기): 선수마다 궁합이면 +, 상극이면 − (game/weatherFit) */
/** load — 투수마다 지난 며칠 팔 상태(season/arm). 없으면 모두 쉬고 온 상태 */
export function teamIn(r: ClubRoster, day: number, idBase: number, conds: WeatherKey[] = [], load?: Map<string, ArmLoad>): SideIn {
  const list: Player[] = [];
  const seen = new Set<string>();
  const add = (p: Player | null | undefined) => { if (p && !seen.has(p.id)) { seen.add(p.id); list.push(p); } };
  r.batting.forEach((b) => add(b.player));
  r.bench.forEach(add);
  r.rotation.forEach(add);
  r.bullpen.forEach(add);
  add(r.closer);
  const idOf = new Map<string, number>();
  const webOf = new Map<number, string>();
  const shift = { sum: 0, n: 0 };
  const players = list.map((p, i) => {
    const id = idBase + i;
    idOf.set(p.id, id); webOf.set(id, p.id);
    const wfx = conds.length ? weatherFx(p, conds) : [];
    const extra = wfx.length ? [...(r.train?.get(p.id) ?? []), ...wfx] : r.train?.get(p.id);
    const delta = r.delta.get(p.id) ?? 0, enh = r.enh.get(p.id) ?? 0;
    // 화면 눈금 몫 — 내 카드는 그 등급 구간(rosters.myRoster), AI · 카드 없는 선수는 엔진 힘(종합 + 보정 + 보너스)의 꺾은선
    const sh = r.show?.get(p.id) ?? playerShift(p.ovr + delta + enh);
    shift.sum += sh; shift.n++;
    return toPlayerIn(p, id, delta, r.setFx.get(p.id), enh, extra, sh);
  });
  const rot = r.rotation.length ? r.rotation : r.bullpen.slice(0, 1);
  const sp = rot[((day % rot.length) + rot.length) % rot.length];
  // 불펜 보직 — 셋업맨 · 필승조 · 좌완 원포인트 · 추격조 · 롱릴리프 · 필승조 2 · 중간 계투 · 추격조 2 · 롱릴리프 2 · 패전조 (라인업 10칸)
  const roles: PitRole[] = ['SU', 'SU', 'MID', 'MID', 'LONG', 'SU', 'MID', 'MID', 'LONG', 'MID'];
  const pen: TeamIn['pen'] = [];
  // 등판 가능 — 연투 · 투구 수 · 팔 피로(season/arm, 엔진 availability 규칙): 2 가능 · 1 비상시만 · 0 불가
  const av = (p: Player) => relieverAvail(load?.get(p.id));
  if (r.closer) pen.push({ pid: idOf.get(r.closer.id)!, role: 'CL', avail: av(r.closer) });
  r.bullpen.forEach((p, i) => { if (p.id !== sp.id) pen.push({ pid: idOf.get(p.id)!, role: p.throws === 'L' && (i === 2 || i === 6) ? 'LOOGY' : roles[i] ?? 'MID', avail: av(p) }); });
  // 오늘 쉬는 선발은 롱릴리프로 비상시만 — 마지막 등판 사흘 뒤부터, 내일 · 모레 선발이면 쉰다
  const soon = new Set([1, 2].map((k) => rot[(((day + k) % rot.length) + rot.length) % rot.length]?.id));
  rot.forEach((p) => { if (p.id !== sp.id && !pen.some((x) => x.pid === idOf.get(p.id))) pen.push({ pid: idOf.get(p.id)!, role: 'LONG', avail: starterRelief(load?.get(p.id), soon.has(p.id)) }); });
  const team: TeamIn = {
    id: r.teamId, isUser: r.mine, players,
    lineup: r.batting.map((b) => ({ pid: idOf.get(b.player.id)!, pos: b.pos })),
    sp: idOf.get(sp.id)!,
    pen,
    bench: r.bench.map((p) => idOf.get(p.id)!).filter((x) => x != null),
    mgr: { style: 0, level: 3 },
    mood: 55, streak: 0, chemTier: r.mine ? Math.min(3, r.setFx.size ? 2 : 0) : 1,
  };
  if (r.tac) applyTac(team, r, list, idBase);
  return { team, webOf, idOf, roster: r, shift };
}

/**
 * 내 전술(game/tactics) → 엔진 — 팀 판단은 TeamIn.tac(엔진 Tactics, 범위는 엔진이 한 번 더 막는다), 선수별은 tac.bat · tac.pit(엔진 숫자 id).
 * 타자 적극성 · 타구 방향은 엔진에 선수별 칸이 없어서 성향 능력치(swingTend · pullTend)로 — 팀 '적극/신중'은 ±10, 선수별은 ±18.
 */
function applyTac(team: TeamIn, r: ClubRoster, list: Player[], idBase: number) {
  const t = r.tac!;
  const v = (k: TeamKey) => teamVal(t, k);
  const lv = (k: TeamKey) => (v(k) === 'more' ? 2 : v(k) === 'less' ? -2 : 0);
  const bat: NonNullable<Tactics['bat']> = {};
  const pit: NonNullable<Tactics['pit']> = {};
  const tac: Partial<Tactics> = {
    firstPitch: v('bat') === 'aggr' ? 2 : v('bat') === 'pat' ? -2 : 0,
    twoStrike: v('two') === 'short' ? 'shorten' : v('two') === 'full' ? 'full' : 'normal',
    extraBase: v('run') === 'aggr' ? 2 : v('run') === 'safe' ? -2 : 0,
    aggression: v('run') === 'aggr' ? 2 : 0,
    stealFreq: lv('steal'), buntFreq: lv('bunt'), hitRunFreq: lv('hitrun'), pickoffFreq: lv('pick'),
    ph: v('ph') === 'late' ? 'lateOnly' : v('ph') === 'never' ? 'never' : 'auto',
    infieldIn: v('inf') === 'in' ? 'always' : v('inf') === 'back' ? 'never' : 'auto',
    ofDepth: v('of') === 'shallow' ? 'shallow' : v('of') === 'deep' ? 'deep' : 'auto',
    ibb: v('ibb') === 'more' ? 'aggressive' : v('ibb') === 'never' ? 'never' : 'auto',
    calling: v('call') === 'attack' ? 'attack' : v('call') === 'nibble' ? 'nibble' : 'balanced',
    hookPitches: v('hook') === 'quick' ? -15 : v('hook') === 'long' ? 15 : 0,
    hookRuns: v('hook') === 'quick' ? 3 : v('hook') === 'long' ? 7 : 0,
    tto3Hook: v('hook') === 'quick',
    closer: v('closer') === 'tie' ? 'tieHome' : v('closer') === 'multi' ? 'multiInning' : 'saveOnly',
    matchup: v('match') !== 'off',
    bat, pit,
  };
  const teamSwing = v('bat') === 'aggr' ? 10 : v('bat') === 'pat' ? -10 : 0;
  const SW = AIDX.get('swingTend')!, PU = AIDX.get('pullTend')!;
  list.forEach((p, i) => {
    const eid = idBase + i;
    const pin = team.players[i];
    if (!pin || pin.id !== eid) return;
    const pk = personKey(p.id);
    if (p.pos !== 'P') {
      const o = t.bat[pk] ?? {};
      const a = pin.attrs as number[]; // toPlayerIn 이 만든 배열 — 성향 칸만 고친다
      const sw = o.bat === 'aggr' ? 18 : o.bat === 'pat' ? -18 : teamSwing;
      if (sw) a[SW] = clamp(a[SW] + sw);
      if (o.spray === 'pull') a[PU] = clamp(a[PU] + 18);
      else if (o.spray === 'oppo') a[PU] = clamp(a[PU] - 18);
      const b: NonNullable<Tactics['bat']>[number] = {};
      if (o.steal === 'green' || o.steal === 'never') b.steal = o.steal;
      if (o.bunt === 'sac' || o.bunt === 'none') b.bunt = o.bunt;
      if (Object.keys(b).length) bat[eid] = b;
    } else {
      const o = t.pit[pk] ?? {};
      const x: NonNullable<Tactics['pit']>[number] = {};
      if (o.call === 'attack') { x.chase = -2; x.jam = 'challenge'; } else if (o.call === 'nibble') { x.chase = 2; x.jam = 'pitchAround'; }
      if (o.limit === 'short') x.limit = 85; else if (o.limit === 'long') x.limit = 115;
      if (o.mix === 'fast') x.mix = 2; else if (o.mix === 'break') x.mix = -2;
      if (o.inside === 'in') x.inside = 2; else if (o.inside === 'out') x.inside = -2;
      if (Object.keys(x).length) pit[eid] = x;
    }
  });
  team.tac = tac;
}

/* ───────── 한 경기 ───────── */
export interface BatRow {
  id: string; team: string; PA: number; AB: number; H: number; D: number; T: number; HR: number; RBI: number; R: number; BB: number; SO: number; SB: number;
  /** [경기 기록] 박스스코어용 — 타순 1~9(교체 선수는 들어간 자리) · 포지션 ('CF' · 'PH' …). season/box 가 저장한다 */
  ord?: number; pos?: string;
}
export interface PitRow { id: string; team: string; outs: number; H: number; R: number; ER: number; BB: number; SO: number; HR: number; W: number; L: number; SV: number; HLD: number; GS: number; /** 던진 공 수 — 다음 날 팔 상태(season/arm) */ np: number }
export interface GameOut {
  away: string; home: string; date: string;
  score: [number, number];
  innings: number;
  line: [number[], number[]];
  hits: [number, number];
  errors: [number, number];
  walkoff: boolean;
  bat: BatRow[];
  pit: PitRow[];
  injuries: { id: string; team: string; type: string }[];
  decision: { win?: string; loss?: string; save?: string };
  durationMin: number;
  wx: { tC: number; windMs: number; windFromDeg: number; dome: boolean };
}
export interface GameRun { out: GameOut; result: GameResult; input: GameInput; away: SideIn; home: SideIn }

/** 한 경기 — post 면 포스트시즌(연장 15회 · 큰 경기 압박 ↑ · 다른 시드) */
export function runGame(seasonSeed: string, day: number, date: string, awayId: string, homeId: string, opts: { log?: boolean; away?: ClubRoster; home?: ClubRoster; post?: boolean; cmds?: Command[] } = {}): GameRun {
  const ai = TEAMS.findIndex((t) => t.id === awayId), hi = TEAMS.findIndex((t) => t.id === homeId);
  const wx = weatherOf(date, homeId, seasonSeed);
  const conds = condsOf(wx); // 날씨 궁합 — 두 팀 모두 같은 규칙
  // 투수 팔 상태 — 이 경기 날짜 전까지 시즌 기록에서 (다시 계산해도 같은 상태)
  const load = armLoads(getSeason(), date, (id) => playerById(id)?.attrs.recovery ?? 50);
  const away = teamIn(opts.away ?? rosterOf(awayId), day + ai, 1000 + ai * 100, conds, load);
  const home = teamIn(opts.home ?? rosterOf(homeId), day + hi, 1000 + hi * 100, conds, load);
  const time = startTime(date);
  const startMin = Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const input: GameInput = {
    engineVer: ENGINE_VER,
    gameId: `s27-${opts.post ? 'p' : ''}${day}-${awayId}-${homeId}`,
    seed: seedFromString(`${seasonSeed}|${opts.post ? 'post|' : ''}${day}|${awayId}|${homeId}`),
    rules: opts.post ? POST_RULES : RULES,
    ctx: { date, startMin, importance: opts.post ? 2 : 1 },
    park: parkOf(homeId),
    wx: neutralTimeline(startMin, wx.tC, wx.windMs, wx.windFromDeg, 0),
    ump: UMP,
    home: home.team,
    away: away.team,
    // 리그 기준점 R(경기엔진.md 3.4) — 두 팀 공통 수준을 모든 선수에게서 똑같이 뺀다(두 팀 · 선수 사이 차이는 그대로):
    //  · 화면 눈금 몫(능력치가 힘 눈금보다 평균 14쯤 낮게 들어간다)은 두 팀 평균만큼 되돌리고
    //  · 리그 단계가 올라 두 팀이 다 세지면(팀 종합 평균 − LEVEL_P0) 그만큼 뺀다 — 예전엔 이걸 빼지 않아 1군 단계부터 '홈런 더비'
    //    (사용자 지시 10-26 "평균자책 최저가 4점대 · 50홈런이 20명 가까이": 1군 50홈런 20명 · 평균자책 1위 3.45 · 리그 6.36, 레전드 24명 · 4.91 · 6.95)
    levelRef: Math.round(((away.shift.sum + home.shift.sum) / Math.max(1, away.shift.n + home.shift.n) + ((away.roster.ovr + home.roster.ovr) / 2 - LEVEL_P0)) * 10) / 10,
    // 리그 환경 — 시즌마다 공인구 반발력(타고투저 · 투고타저, season/env). 그 시즌 내내 같다
    env: (({ powerAdj, contactAdj }) => ({ powerAdj, contactAdj }))(leagueEnv(seasonSeed)),
    // 경기 중 작전(내 팀만 — 엔진이 isUser 팀 명령만 받는다). 명령 앞 투구까지는 명령 없는 경기와 똑같다
    cmds: opts.cmds?.length ? opts.cmds : undefined,
    opts: opts.log ? { log: true, attrib: true } : undefined,
  };
  const result = simulateGame(input);
  const web = (side: 0 | 1, id: number) => (side === 0 ? away : home).webOf.get(id) ?? '';
  const teamOf = (side: 0 | 1) => (side === 0 ? awayId : homeId);
  const bat: BatRow[] = [];
  const pit: PitRow[] = [];
  const decision: GameOut['decision'] = {};
  ([0, 1] as const).forEach((side) => {
    for (const b of result.box.bat[side]) bat.push({ id: web(side, b.pid), team: teamOf(side), PA: b.PA, AB: b.AB, H: b.H, D: b.D, T: b.T, HR: b.HR, RBI: b.RBI, R: b.R, BB: b.BB + b.HBP, SO: b.SO, SB: b.SB, ord: b.ord, pos: b.pos });
    for (const p of result.box.pit[side]) {
      pit.push({ id: web(side, p.pid), team: teamOf(side), outs: p.outs, H: p.H, R: p.R, ER: p.ER, BB: p.BB + p.HBP, SO: p.SO, HR: p.HR, W: p.W, L: p.L, SV: p.SV, HLD: p.HLD, GS: p.GS, np: p.pitches });
      if (p.W) decision.win = web(side, p.pid);
      if (p.L) decision.loss = web(side, p.pid);
      if (p.SV) decision.save = web(side, p.pid);
    }
  });
  const out: GameOut = {
    away: awayId, home: homeId, date,
    score: [result.score[0], result.score[1]],
    innings: result.innings,
    line: [result.box.line.inn[0].slice(), result.box.line.inn[1].slice()],
    hits: [result.box.line.H[0], result.box.line.H[1]],
    errors: [result.box.line.E[0], result.box.line.E[1]],
    walkoff: result.box.flags.includes('walkoff'),
    bat, pit,
    injuries: result.injuries.map((x) => { const side = home.webOf.has(x.pid) ? 1 : 0; return { id: web(side as 0 | 1, x.pid), team: teamOf(side as 0 | 1), type: x.type }; }),
    decision,
    durationMin: result.durationMin,
    wx,
  };
  return { out, result, input, away, home };
}
