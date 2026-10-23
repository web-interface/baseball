// 시즌 경기 계산 — 공용 경기 엔진(shared/engine)으로 한 경기씩. 이 파일은 엔진을 싣고 있어서 필요할 때만 불러온다(import()).
// 같은 시즌 시드 · 같은 날 · 같은 선수단이면 늘 같은 경기(엔진은 결정적). 피로·부상은 날을 넘겨 이어 가지 않는다(하루하루 새로).
import {
  ATTR_KEYS, ENGINE_VER, POS_KEYS, CITY_IDS, neutralTimeline, seedFromString, simulateGame,
  type GameInput, type GameResult, type Park, type PitRole, type PlayerIn, type TeamIn,
} from '../../../shared/engine/index.ts';
import { TEAMS, teamById } from '../game/mock';
import type { AttrKey, Player, Pos } from '../game/types';
import type { BatKey, PitKey, SetEffect } from '../game/sets';
import { rosterOf, type ClubRoster } from './rosters';
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
export function toPlayerIn(p: Player, id: number, delta: number, fx?: SetEffect, enh = 0, train?: { k: string; v: number }[]): PlayerIn {
  const isP = p.pos === 'P';
  const attrs = ATTR_KEYS.map((k) => {
    const raw = p.attrs[k as AttrKey];
    if (/Tend$/.test(k)) return raw ?? (DEF_B[k] ?? DEF_P[k] ?? 50);
    return raw != null ? clamp(raw + delta) : (DEF_B[k] ?? DEF_P[k] ?? 50);
  });
  const pos = POS_KEYS.map((q) => (q === p.pos ? 20 : p.subPos?.includes(q as Pos) ? 15 : q === 'DH' && !isP ? 16 : isP ? (q === 'P' ? 20 : 1) : 4));
  return {
    id, age: p.age, throws: p.throws, bats: p.bats, heightCm: p.heightCm, weightKg: p.weightKg, armSlot: armSlot(p),
    attrs, pos,
    pitches: isP ? (p.pitches ?? [{ type: 'FF', ko: '포심', stuff: 50, command: 50, usage: 1, kmh: 140 }]).map((x) => ({ t: x.type, stuff: clamp(x.stuff + delta), cmd: clamp(x.command + delta), use: Math.round(x.usage * 100) })) : [],
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

const UMP = { id: 'u-std', size: 0, low: 0, high: 0, inside: 0, outside: 0, consistency: 1, countBias: 0, closeCall: 1 };
const RULES = { maxInnings: 12, dh: true, zone: 'ABS' as const, shift: 'restricted' as const, pitchClock: true, heatRule: false, reviews: 2 };
/** 포스트시즌 — 연장 15회까지 (KBO) */
const POST_RULES = { ...RULES, maxInnings: 15 };

/* ───────── 선수단 → 엔진 팀 ───────── */
export interface SideIn { team: TeamIn; webOf: Map<number, string>; idOf: Map<string, number>; roster: ClubRoster }
export function teamIn(r: ClubRoster, day: number, idBase: number): SideIn {
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
  const players = list.map((p, i) => {
    const id = idBase + i;
    idOf.set(p.id, id); webOf.set(id, p.id);
    return toPlayerIn(p, id, r.delta.get(p.id) ?? 0, r.setFx.get(p.id), r.enh.get(p.id) ?? 0, r.train?.get(p.id));
  });
  const rot = r.rotation.length ? r.rotation : r.bullpen.slice(0, 1);
  const sp = rot[((day % rot.length) + rot.length) % rot.length];
  const roles: PitRole[] = ['SU', 'SU', 'MID', 'MID', 'LONG'];
  const pen: TeamIn['pen'] = [];
  if (r.closer) pen.push({ pid: idOf.get(r.closer.id)!, role: 'CL', avail: 2 });
  r.bullpen.forEach((p, i) => { if (p.id !== sp.id) pen.push({ pid: idOf.get(p.id)!, role: p.throws === 'L' && i === 2 ? 'LOOGY' : roles[i] ?? 'MID', avail: 2 }); });
  rot.forEach((p) => { if (p.id !== sp.id && !pen.some((x) => x.pid === idOf.get(p.id))) pen.push({ pid: idOf.get(p.id)!, role: 'LONG', avail: 1 }); });
  const team: TeamIn = {
    id: r.teamId, isUser: r.mine, players,
    lineup: r.batting.map((b) => ({ pid: idOf.get(b.player.id)!, pos: b.pos })),
    sp: idOf.get(sp.id)!,
    pen,
    bench: r.bench.map((p) => idOf.get(p.id)!).filter((x) => x != null),
    mgr: { style: 0, level: 3 },
    mood: 55, streak: 0, chemTier: r.mine ? Math.min(3, r.setFx.size ? 2 : 0) : 1,
  };
  return { team, webOf, idOf, roster: r };
}

/* ───────── 한 경기 ───────── */
export interface BatRow { id: string; team: string; PA: number; AB: number; H: number; D: number; T: number; HR: number; RBI: number; R: number; BB: number; SO: number; SB: number }
export interface PitRow { id: string; team: string; outs: number; H: number; R: number; ER: number; BB: number; SO: number; HR: number; W: number; L: number; SV: number; HLD: number; GS: number }
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
export function runGame(seasonSeed: string, day: number, date: string, awayId: string, homeId: string, opts: { log?: boolean; away?: ClubRoster; home?: ClubRoster; post?: boolean } = {}): GameRun {
  const ai = TEAMS.findIndex((t) => t.id === awayId), hi = TEAMS.findIndex((t) => t.id === homeId);
  const away = teamIn(opts.away ?? rosterOf(awayId), day + ai, 1000 + ai * 100);
  const home = teamIn(opts.home ?? rosterOf(homeId), day + hi, 1000 + hi * 100);
  const time = startTime(date);
  const startMin = Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const wx = weatherOf(date, homeId, seasonSeed);
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
    opts: opts.log ? { log: true, attrib: true } : undefined,
  };
  const result = simulateGame(input);
  const web = (side: 0 | 1, id: number) => (side === 0 ? away : home).webOf.get(id) ?? '';
  const teamOf = (side: 0 | 1) => (side === 0 ? awayId : homeId);
  const bat: BatRow[] = [];
  const pit: PitRow[] = [];
  const decision: GameOut['decision'] = {};
  ([0, 1] as const).forEach((side) => {
    for (const b of result.box.bat[side]) bat.push({ id: web(side, b.pid), team: teamOf(side), PA: b.PA, AB: b.AB, H: b.H, D: b.D, T: b.T, HR: b.HR, RBI: b.RBI, R: b.R, BB: b.BB + b.HBP, SO: b.SO, SB: b.SB });
    for (const p of result.box.pit[side]) {
      pit.push({ id: web(side, p.pid), team: teamOf(side), outs: p.outs, H: p.H, R: p.R, ER: p.ER, BB: p.BB + p.HBP, SO: p.SO, HR: p.HR, W: p.W, L: p.L, SV: p.SV, HLD: p.HLD, GS: p.GS });
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
