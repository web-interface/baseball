// 가상 선수 생성 — 15_player_schema.json(S) 기반(참조 구현 gen.mts 이식). 이름은 넣지 않는다(자리만: name='' — 이름은 세계관 팀이 정함).
// 스키마 JSON 은 호출하는 쪽(서버·도구)이 읽어서 넘긴다 — 엔진 번들에 270KB 를 싣지 않기 위해.
import { seqRng, type SeqRng, clamp } from './rng.ts';
import type { PlayerIn, PitchKey } from './types.ts';
import { ATTR_KEYS, HID_KEYS } from './player.ts';

const squash = (x: number): number => (x > 78 ? 78 + 22 * (1 - Math.exp(-(x - 78) / 22)) : x < 20 ? 20 - 15 * (1 - Math.exp(-(20 - x) / 15)) : x);
const r1 = (x: number): number => Math.round(x * 10) / 10;

export function interp(table: Record<string, number>, x: number): number {
  const ks = Object.keys(table).map(Number).sort((p, q) => p - q);
  if (x <= ks[0]) return table[ks[0]];
  if (x >= ks[ks.length - 1]) return table[ks[ks.length - 1]];
  for (let i = 1; i < ks.length; i++) if (x <= ks[i]) { const a = ks[i - 1], b = ks[i]; return table[a] + (table[b] - table[a]) * (x - a) / (b - a); }
  return 0;
}
function cholesky(R: number[][]): number[][] {
  const n = R.length; const L: number[][] = R.map(() => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = R[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
    if (i === j) { if (s <= 0) throw new Error('상관행렬이 양의 정부호가 아님 ' + i); L[i][i] = Math.sqrt(s); } else L[i][j] = s / L[j][j];
  }
  return L;
}

// ── 규칙 문자열용 작은 식 계산기(eval 없음) ──
type Env = (name: string) => any;
const exprCache = new Map<string, (env: Env) => any>();
export function compileExpr(src: string): (env: Env) => any {
  const hit = exprCache.get(src); if (hit) return hit;
  const toks: string[] = []; const re = /\s*(>=|<=|==|!=|&&|\|\||[()!<>+\-*/]|'[^']*'|[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?)/y;
  let pos = 0;
  while (pos < src.length) { re.lastIndex = pos; const m = re.exec(src); if (!m) { if (/^\s*$/.test(src.slice(pos))) break; throw new Error('식 해석 실패: ' + src); } toks.push(m[1]); pos = re.lastIndex; }
  let i = 0; const peek = () => toks[i]; const eat = (t?: string) => { const x = toks[i++]; if (t && x !== t) throw new Error('기대 ' + t + ' / ' + src); return x; };
  type N = (e: Env) => any;
  const primary = (): N => {
    const t = eat();
    if (t === '(') { const n = or(); eat(')'); return n; }
    if (t === '!') { const n = primary(); return (e) => !n(e); }
    if (t === '-') { const n = primary(); return (e) => -n(e); }
    if (/^\d/.test(t)) { const v = Number(t); return () => v; }
    if (t[0] === "'") { const v = t.slice(1, -1); return () => v; }
    if (t === 'true') return () => true; if (t === 'false') return () => false;
    return (e) => e(t);
  };
  const prod = (): N => { let l = primary(); while (peek() === '*' || peek() === '/') { const op = eat(); const r = primary(); const a = l; l = op === '*' ? (e) => a(e) * r(e) : (e) => a(e) / r(e); } return l; };
  const sum = (): N => { let l = prod(); while (peek() === '+' || peek() === '-') { const op = eat(); const r = prod(); const a = l; l = op === '+' ? (e) => a(e) + r(e) : (e) => a(e) - r(e); } return l; };
  const cmp = (): N => {
    const l = sum(); const op = peek();
    if (op === '>=' || op === '<=' || op === '==' || op === '!=' || op === '>' || op === '<') {
      eat(); const r = sum();
      if (op === '>=') return (e) => l(e) >= r(e); if (op === '<=') return (e) => l(e) <= r(e); if (op === '>') return (e) => l(e) > r(e);
      if (op === '<') return (e) => l(e) < r(e); if (op === '==') return (e) => l(e) === r(e); return (e) => l(e) !== r(e);
    }
    return l;
  };
  const and = (): N => { let l = cmp(); while (peek() === '&&') { eat(); const r = cmp(); const a = l; l = (e) => a(e) && r(e); } return l; };
  const or = (): N => { let l = and(); while (peek() === '||') { eat(); const r = and(); const a = l; l = (e) => a(e) || r(e); } return l; };
  const fn = or(); if (i !== toks.length) throw new Error('남은 토큰: ' + src);
  exprCache.set(src, fn); return fn;
}

// ── 스키마 보조 ──
const PREP = new WeakMap<object, any>();
function prep(S: any): any {
  const hit = PREP.get(S); if (hit) return hit;
  const kind: Record<string, string> = {}; for (const a of S.attributes) kind[a.key] = a.kind; kind.contact = 'skill';
  const curveOf: Record<string, string> = {}; for (const g in S.curves) for (const k of S.curves[g].attrs) curveOf[k] = g;
  curveOf.contact = 'G_contact';
  const arch: Record<string, any> = {}; for (const a of S.archetypes) arch[a.id] = a;
  const p = { kind, curveOf, arch, LB: cholesky(S.factors.batter.corr), LP: cholesky(S.factors.pitcher.corr), LQ: cholesky(S.factors.personality.corr),
    pt: Object.fromEntries(S.pitchTypes.map((t: any) => [t.key, t])) };
  PREP.set(S, p); return p;
}
const BATTER_KEYS = ['contact', 'power', 'gap', 'eye', 'avoidK', 'vsFast', 'vsBreak', 'bunt', 'speed', 'baserunning', 'stealJump', 'sliding', 'range', 'firstStep', 'hands', 'armStr', 'armAcc', 'turnDP', 'block', 'framing', 'popTime', 'pitcherLead', 'composure', 'concentration', 'competitiveness', 'leadership', 'teamwork', 'baseballIQ', 'durability', 'agility', 'strength', 'pullTend', 'launchTend', 'swingTend'];
const PITCHER_KEYS = ['velocity', 'control', 'deception', 'extension', 'stamina', 'recovery', 'pickoff', 'slideStep', 'pFielding', 'gbTend', 'composure', 'concentration', 'competitiveness', 'leadership', 'teamwork', 'baseballIQ', 'durability', 'agility', 'strength'];
const CATCHER_ONLY = ['block', 'framing', 'popTime', 'pitcherLead'];
const keysOf = (side: string) => (side === 'B' ? BATTER_KEYS : PITCHER_KEYS);
function sdOf(S: any, a: any, k: string): number {
  const sd = S.baseMeans.sd; const kind = prep(S).kind[k];
  if (a.side === 'B' && CATCHER_ONLY.includes(k) && !a.pos.C) return sd.offRoleCatcher;
  if (k === 'pitchStuff' || k === 'pitchCmd') return sd.pitch;
  return kind === 'tendency' ? sd.tendency : kind === 'mental' ? sd.mental : kind === 'physical' ? sd.physical : sd.skill;
}
function wOf(S: any, a: any, k: string): number {
  const q = S.qualityWeights;
  if (a.key.includes(k)) return q.key; if (a.sec.includes(k)) return q.secondary;
  if (k in q.fixed) return q.fixed[k]; return q.other;
}
function meanOf(S: any, a: any, k: string): number {
  if (a.means && k in a.means) return a.means[k];
  const base = a.side === 'B' ? S.baseMeans.batter : S.baseMeans.pitcher;
  return (base[k] ?? 50) + (a.d[k] ?? 0);
}
function loadingsFor(S: any, side: string, k: string): Array<[number, number]> {
  const F = side === 'B' ? S.factors.batter : S.factors.pitcher; const names: string[] = F.names; const nS = names.length;
  const out: Array<[number, number]> = [];
  const L1 = F.loadings[k]; if (L1 && typeof L1 === 'object') for (const f in L1) out.push([names.indexOf(f), L1[f]]);
  const L2 = S.factors.personality.loadings[k];
  if (L2) for (const f in L2) { if (f === 'Qs') out.push([names.indexOf('Q'), L2[f]]); else out.push([nS + S.factors.personality.names.indexOf(f), L2[f]]); }
  return out;
}
function corrOf(S: any, side: string, i: number, j: number): number {
  const F = side === 'B' ? S.factors.batter : S.factors.pitcher; const nS = F.names.length;
  if (i < nS && j < nS) return F.corr[i][j]; if (i >= nS && j >= nS) return S.factors.personality.corr[i - nS][j - nS]; return 0;
}
function communality(S: any, side: string, L: Array<[number, number]>): number { let h = 0; for (const [i, a] of L) for (const [j, b] of L) h += a * b * corrOf(S, side, i, j); return h; }
function latent(S: any, side: string, rng: SeqRng): number[] {
  const Pp = prep(S); const L = side === 'B' ? Pp.LB : Pp.LP; const n = L.length;
  const e = Array.from({ length: n }, () => rng.normal()); const z = new Array(n).fill(0);
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) z[i] += L[i][j] * e[j];
  const e2 = [0, 1, 2, 3].map(() => rng.normal()); const q = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) for (let j = 0; j <= i; j++) q[i] += Pp.LQ[i][j] * e2[j];
  return z.concat(q);
}
function draw(S: any, side: string, k: string, z: number[], rng: SeqRng): number {
  const L = loadingsFor(S, side, k); let v = 0; for (const [i, a] of L) v += a * z[i];
  return v + Math.sqrt(Math.max(0.05, 1 - communality(S, side, L))) * rng.normal();
}
function ageAdjAbs(S: any, k: string, age: number, gt: string): number {
  const g = prep(S).curveOf[k]; if (!g) return 0; const C = S.curves[g]; const G = S.development.growthTypes[gt] ?? {};
  const aG = age + (G.growthShift ?? 0); const aD = age + (G.declineShift ?? 0);
  let grow = 0; for (let a = Math.floor(aG); a <= 40; a++) grow += interp(C.growth, a) * (a - (G.growthShift ?? 0) <= 22 ? (G.youngBoost ?? 1) : 1);
  let dec = 0; for (let a = 17; a < Math.floor(aD); a++) dec += interp(C.decline, a);
  return -grow * 0.14 * 38 * 0.45 - dec * (G.declineMult ?? 1);
}
function ageAdj(S: any, k: string, age: number, gt: string): number { return ageAdjAbs(S, k, age, gt) - ageAdjAbs(S, k, 28, 'normal'); }

// ── OVR(카드에 보이는 요약 — 15 composites·ovr 가중치) ──
export function famMult(S: any, f: number): number { return interp(S.positions.defenseMultiplier, f); }
const velEff = (p: any): number => p.attrs.velocity + 0.3 * (p.attrs.extension - 50);
export function pitchEff(p: any, x: any): number {
  const ve = velEff(p);
  if (x.t === 'FF') return 0.55 * x.stuff + 0.45 * ve; if (x.t === 'SI') return 0.7 * x.stuff + 0.3 * ve; if (x.t === 'FC') return 0.8 * x.stuff + 0.2 * ve;
  return x.stuff;
}
const FASTS = ['FF', 'SI', 'FC'];
function comp(S: any, p: any, name: string, pos: string): number {
  if (name === 'VEL') return velEff(p);
  if (name === 'STF') { let m = 25; for (const x of p.pitches) m = Math.max(m, pitchEff(p, x)); return m; }
  if (name === 'BRK') { const br = p.pitches.filter((x: any) => !FASTS.includes(x.t)).map((x: any) => x.stuff).sort((a: number, b: number) => b - a); return br.length >= 2 ? (br[0] + br[1]) / 2 : br.length === 1 ? br[0] * 0.85 : 25; }
  if (name === 'CTL') { let cu = 0, us = 0; for (const x of p.pitches) { const u = x.use || 1; cu += x.cmd * u; us += u; } return 0.6 * p.attrs.control + 0.4 * (us ? cu / us : 25); }
  if (name === 'DEF') return comp(S, p, 'DEF_' + pos, pos);
  if (name === 'ARM' && pos === 'C') return comp(S, p, 'ARM_C', pos);
  const def = S.composites[name];
  if (!def) return p.attrs[name];
  let s = 0; for (const k in def) s += def[k] * comp(S, p, k, pos);
  if (name.startsWith('DEF_')) s *= famMult(S, p.pos?.[pos] ?? 20);
  return s;
}
export function ovrAt(S: any, p: any, pos: string): number {
  const W = p.side === 'P' ? S.ovr.pitchers[pos] : S.ovr.positions[pos]; let s = 0; for (const k in W) s += W[k] * comp(S, p, k, pos); return s;
}
export function cardSix(S: any, p: any): Array<[string, string, number]> {
  const F = p.side === 'P' ? S.cardFace.pitcher : S.cardFace.batter; const pos = p.side === 'P' ? p.role : p.primary;
  return F.map((c: any) => [c.code, c.ko, Math.round(clamp(comp(S, p, c.code, pos), 1, 99))]);
}

export interface GenOpts { seed: string; slot?: string; tier?: string; grade?: string; targetOvr?: number; ovrShift?: number; age?: number; archetype?: string; noAgeAdj?: boolean; foreign?: boolean }
/** 생성된 선수(15 레코드). name 은 비워 둔다. */
export interface GenPlayer {
  side: 'B' | 'P'; archetype: string; role: 'SP' | 'RP' | 'CL' | null; primary: string; throws: 'R' | 'L'; bats: 'R' | 'L' | 'S';
  age: number; growthType: string; height: number; weight: number; foreign: boolean;
  attrs: Record<string, number>; pos: Record<string, number>; pitches: { t: PitchKey; stuff: number; cmd: number; use: number; sig?: string }[];
  armSlot?: string; form: Record<string, string>; formFx: Record<string, number>; ovrRaw: number; ovr: number; ca: number; pa: number;
  hidden: Record<string, number>; birthplace: string; personality: { main: string; tags: string[] }; traits: string[];
  signature?: any; injuries: { seasonAgo: number; type: string; days: number }[]; name: string; tier: string;
}

export function generatePlayer(S: any, o: GenOpts): GenPlayer {
  let p = genOnce(S, o);
  for (let t = 1; t <= 4 && !o.archetype && (p as any).targetMiss > 1.5; t++) p = genOnce(S, { ...o, seed: o.seed + '#r' + t });
  delete (p as any).targetMiss; return p;
}
const BIRTH: Record<string, number> = { 서울: 0.22, 경기: 0.2, '부산·경남': 0.14, '대구·경북': 0.1, '광주·전남': 0.08, '대전·충청': 0.08, 인천: 0.06, 강원: 0.04, 전북: 0.04, 제주: 0.02, 울산: 0.02 };
const FBIRTH: Record<string, number> = { 중남미: 0.5, '북미 북부': 0.2, '미국 남부': 0.2, 일본: 0.1 };

function genOnce(S: any, o: GenOpts): GenPlayer {
  const Pp = prep(S); const rng = seqRng(o.seed);
  const slot = o.slot ?? 'SS';
  const archId = o.archetype ?? rng.pickW(S.archetypeByRole[slot]);
  const a = Pp.arch[archId]; const side = a.side as 'B' | 'P';
  const role = side === 'P' ? (slot === 'SP' ? 'SP' : slot === 'CL' ? 'CL' : slot === 'RP' ? 'RP' : a.role) : null;
  const primary = side === 'P' ? 'P' : (['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'].includes(slot) ? slot : rng.pickW(a.pos));
  const foreign = !!o.foreign;
  const tier = o.tier ?? 'first';
  const T = S.generation.tiers[tier];
  const age = o.age ?? Math.round(clamp(T.age[0] + T.age[1] * rng.normal(), T.age[2], T.age[3]));
  const gtW: Record<string, number> = {}; for (const g in S.development.growthTypes) gtW[g] = S.development.growthTypes[g].share;
  const gt = rng.pickW(gtW);
  const H = S.handedness;
  const lShare = side === 'P' ? (a.throwsLShare ?? H.throwsLShareByPos.P) : (H.throwsLShareByPos[primary] ?? 0);
  const throws = rng.next() < lShare ? 'L' : 'R';
  let bats: string;
  if (side === 'P') bats = rng.next() < H.pitcherBatsSameAsThrows ? throws : (throws === 'R' ? 'L' : 'R');
  else {
    const bw = { ...H.batsGivenThrows[throws] };
    if (throws === 'R' && a.batsLShare) { bw.L = a.batsLShare; bw.R = 1 - a.batsLShare - bw.S; }
    if (a.batsSShare) { bw.S = a.batsSShare; bw.R = Math.max(0.05, 1 - bw.L - bw.S); }
    bats = rng.pickW(bw);
  }
  const pg = S.physique.groups[side === 'P' ? 'P' : primary];
  const hz = rng.normal(), bz = rng.normal();
  const height = Math.round(pg.h[0] + pg.h[1] * hz);
  const bmi = pg.bmi[0] + pg.bmi[1] * (bz + (a.bmi ?? 0));
  const weight = Math.round(bmi * (height / 100) ** 2);
  const z = latent(S, side, rng);
  const keys = keysOf(side); const base: Record<string, number> = {};
  for (const k of keys) {
    let v = meanOf(S, a, k) + sdOf(S, a, k) * draw(S, side, k, z, rng);
    const cb = S.physique.coupling.perBmiSD[k]; if (cb) v += cb * bz;
    const ch = S.physique.coupling.perHeightSD[side === 'P' ? 'pitcher' : 'batter'][k]; if (ch) v += ch * hz;
    if (!o.noAgeAdj && Pp.kind[k] !== 'tendency') v += ageAdj(S, k, age, gt);
    base[k] = v;
  }
  let pitches: any[] = [];
  if (side === 'P') {
    let types: string[];
    if (a.pitchesFixed) { types = [...a.pitchesFixed]; for (const t in a.pitchesOpt) if (rng.next() < a.pitchesOpt[t]) types.push(t); }
    else {
      const cnt = Number(rng.pickW(a.count ?? S.pitchRules.countByRole[role as string]));
      const pool: Record<string, number> = { ...a.pitches }; types = [];
      while (types.length < cnt && Object.keys(pool).length) { const t = rng.pickW(pool); types.push(t); delete pool[t]; }
      if (!types.some((t) => FASTS.includes(t))) types[types.length - 1] = a.pitches.SI > (a.pitches.FF ?? 0) ? 'SI' : 'FF';
    }
    const ms = meanOf(S, a, 'pitchStuff'), mc = meanOf(S, a, 'pitchCmd'), sd = S.baseMeans.sd.pitch;
    const names = S.factors.pitcher.names;
    pitches = types.map((t) => {
      const f = Pp.pt[t].factor; let lv = 0; const L: Array<[number, number]> = [];
      for (const k in f) L.push([names.indexOf(k), f[k]]);
      for (const [i, w] of L) lv += w * z[i]; const h = communality(S, 'P', L);
      let stuff = ms + sd * (lv + Math.sqrt(Math.max(0.05, 1 - h)) * rng.normal());
      if (Pp.pt[t].family !== 'fast' && a.breakingBonus) stuff += a.breakingBonus;
      if (t === 'KN') stuff += a.knStuffBonus ?? 0; if (a.sigBias === t) stuff += 8;
      let cmd = mc + sd * (0.8 * z[names.indexOf('C')] + 0.6 * rng.normal()) + (t === 'KN' ? -6 : 0) + (t === 'FS' ? -2 : 0);
      if (!o.noAgeAdj) { stuff += ageAdj(S, 'pitchStuff', age, gt); cmd += ageAdj(S, 'pitchCmd', age, gt); }
      return { t, b: stuff, c: cmd };
    });
  }
  const wk: Record<string, number> = {}; for (const k of keys) wk[k] = wOf(S, a, k);
  const wS = wOf(S, a, 'pitchStuff'), wC = wOf(S, a, 'pitchCmd');
  const p: any = { side, archetype: archId, role, primary, throws, bats, age, growthType: gt, height, weight, foreign, attrs: {}, pos: {}, pitches: [], tier };
  const versRaw = 10.5 + 3.6 * (0.2 * z[S.factors[side === 'B' ? 'batter' : 'pitcher'].names.indexOf('Q')] + 0.98 * rng.normal()) + (a.hidden?.versatility ?? 0);
  const vers = Math.round(clamp(versRaw, 1, 20));
  for (const q of S.positions.list) p.pos[q] = 1;
  if (side === 'P') p.pos.P = 20;
  else {
    p.pos[primary] = 18 + Math.floor(rng.next() * 3); p.pos.DH = 20;
    const sim = S.positions.similarity[primary] ?? {};
    for (const q in sim) if (q !== 'DH') p.pos[q] = Math.round(clamp(sim[q] + (vers - 10) * 0.4 + 1.5 * rng.normal(), 1, 17));
    for (let n = 0; n < (a.extraPositions ?? 0); n++) { const q = ['2B', '3B', 'SS', 'LF', 'CF', 'RF', '1B'][Math.floor(rng.next() * 7)]; if (q !== primary) p.pos[q] = Math.max(p.pos[q], 13 + Math.floor(rng.next() * 4)); }
    if (throws === 'L') for (const q of ['C', '2B', '3B', 'SS']) p.pos[q] = Math.min(p.pos[q], 4);
  }
  const apply = (s: number) => {
    for (const k of keys) p.attrs[k] = clamp(Pp.kind[k] === 'tendency' ? base[k] + s * wk[k] : squash(base[k] + s * wk[k]), 1, 100);
    p.pitches = pitches.map((x) => ({ t: x.t, stuff: clamp(squash(x.b + s * wS), 1, 100), cmd: clamp(squash(x.c + s * wC), 1, 100), use: 0 }));
    if (side === 'B') { p.attrs.contactR = p.attrs.contact; p.attrs.contactL = p.attrs.contact; }
  };
  const ovrOf = () => ovrAt(S, p, side === 'P' ? (role as string) : primary);
  let target: number | undefined = o.targetOvr;
  if (target === undefined && o.grade) { const g = S.generation.grades[o.grade]; target = g.ovr[0] + (g.ovr[1] - g.ovr[0]) * Math.pow(rng.next(), 1.3); }
  if (target === undefined) target = T.ovr[0] + T.ovr[1] * rng.normal();
  const tgt: number = (target ?? 61) + (o.ovrShift ?? 0);
  let s = 0;
  { apply(0); let s0 = 0, f0 = ovrOf() - tgt; let s1 = -f0 / 0.75; apply(s1); let f1 = ovrOf() - tgt;
    for (let it = 0; it < 6 && Math.abs(f1) > 0.05; it++) { const d = f1 - f0; const s2 = Math.abs(d) < 1e-6 ? s1 - f1 : s1 - f1 * (s1 - s0) / d; s0 = s1; f0 = f1; s1 = clamp(s2, -80, 80); apply(s1); f1 = ovrOf() - tgt; }
    s = s1; }
  apply(s);
  const targetMiss = tgt - ovrOf();
  if (side === 'B') {
    const sp = H.platoonSplit[bats]; const split = Math.max(-2, sp.mean + sp.sd * rng.normal()); const c = p.attrs.contact;
    if (bats === 'L') { p.attrs.contactR = clamp(c + split * 0.35, 1, 100); p.attrs.contactL = clamp(c - split * 0.65, 1, 100); }
    else if (bats === 'R') { p.attrs.contactL = clamp(c + split * 0.65, 1, 100); p.attrs.contactR = clamp(c - split * 0.35, 1, 100); }
    else { const sg = rng.next() < 0.5 ? 1 : -1; p.attrs.contactR = clamp(c + sg * split / 2, 1, 100); p.attrs.contactL = clamp(c - sg * split / 2, 1, 100); }
    p.platoonSplit = split;
    delete p.attrs.contact;
  } else {
    const vals = p.pitches.map((x: any) => Math.pow(Math.max(5, 0.65 * pitchEff(p, x) + 0.35 * x.cmd), 1.6));
    const tot = vals.reduce((u: number, v: number) => u + v, 0); p.pitches.forEach((x: any, i: number) => { x.use = vals[i] / tot * 100; });
    const fu = p.pitches.filter((x: any) => FASTS.includes(x.t)).reduce((u: number, x: any) => u + x.use, 0);
    if (a.id !== 'knuckleballer' && fu < 30) { const k = 30 / fu, rest = (100 - 30) / (100 - fu); p.pitches.forEach((x: any) => { x.use *= FASTS.includes(x.t) ? k : rest; }); }
    if (a.id === 'knuckleballer') { const kn = p.pitches.find((x: any) => x.t === 'KN'); const others = 100 - kn.use; const k = 25 / Math.max(1, others); p.pitches.forEach((x: any) => { x.use = x.t === 'KN' ? 75 : x.use * k; }); }
    p.pitches.forEach((x: any) => { x.use = Math.round(x.use); x.stuff = r1(x.stuff); x.cmd = r1(x.cmd); });
    const slots = a.armSlot ?? Object.fromEntries(Object.entries(S.armSlots).map(([k, v]: any) => [k, v.share]));
    p.armSlot = rng.pickW(slots);
    p.attrs.gbTend = clamp(p.attrs.gbTend + S.armSlots[p.armSlot].gbAdj, 1, 100);
    p.attrs.deception = clamp(p.attrs.deception + S.armSlots[p.armSlot].deceptionAdj, 1, 100);
  }
  p.form = {}; p.formFx = {};
  const FG = side === 'P' ? S.forms.pitching : S.forms.batting;
  for (const g in FG) {
    if (typeof FG[g] !== 'object') continue;
    const w: Record<string, number> = {}; for (const k in FG[g].options) w[k] = FG[g].options[k].share * (FG[g].options[k].archBias?.[archId] ?? 1);
    const pick = rng.pickW(w); p.form[g] = pick;
    const fx = FG[g].options[pick].effect ?? {};
    for (const k in fx) {
      if (k === 'note') continue;
      if (k === 'pullTendShift') p.attrs.pullTend = clamp(p.attrs.pullTend + fx[k], 1, 100);
      else if (k === 'launchTendShift') p.attrs.launchTend = clamp(p.attrs.launchTend + fx[k], 1, 100);
      else if (k in p.attrs) p.attrs[k] = clamp(p.attrs[k] + fx[k], 1, 100);
      else p.formFx[k] = (p.formFx[k] ?? 0) + fx[k];
    }
  }
  for (const k in p.attrs) p.attrs[k] = r1(p.attrs[k]);
  p.ovrRaw = ovrOf(); p.ovr = Math.round(clamp(p.ovrRaw, 1, 99)); p.ca = Math.round(p.ovrRaw * 2);
  const hd = S.factors.personality.hiddenDist; const hid: Record<string, number> = {};
  for (const h of S.hidden) {
    let v = hd.mean + hd.sd * draw(S, side, h.key, z, rng) + (a.hidden?.[h.key] ?? 0);
    if (h.key === 'ego') v += (p.ovr - 60) * 0.08;
    hid[h.key] = Math.round(clamp(v, hd.min, hd.max));
  }
  hid.versatility = vers;
  if (age > 25) hid.professionalism = Math.round(clamp(hid.professionalism + 0.08 * (age - 25), 1, 20));
  if (age > 24) hid.temperament = Math.round(clamp(hid.temperament + 0.1 * (age - 24), 1, 20));
  const sk = side === 'P' ? 'stamina' : 'durability'; const zS = clamp((p.attrs[sk] - 50) / 15, -3, 3);
  for (const w of S.weather.traits) {
    const e = w.corr ? 0.3 * zS + Math.sqrt(1 - 0.09) * rng.normal() : rng.normal();
    hid[w.key] = Math.round(clamp(hd.weatherMean + hd.weatherSd * e, 1, 20));
  }
  p.hidden = hid; p.birthplace = rng.pickW(foreign ? FBIRTH : BIRTH);
  const hr = S.potential.headroomByAge.find((x: any) => age >= x.age[0] && age <= x.age[1]) ?? S.potential.headroomByAge[5];
  let head = hr.median * Math.exp(hr.sigma * rng.normal()); if (gt === 'late') head += S.potential.lateBloomerBonus;
  if (age >= 30) head = rng.next() * 3;
  p.pa = Math.round(clamp(p.ca + head, p.ca, Math.max(p.ca, S.potential.cap)));
  const env: Env = (n) => (n in p.hidden ? p.hidden[n] : n in p.attrs ? p.attrs[n] : n === 'pa' ? p.pa : n === 'age' ? age : n === 'pos' ? primary : n === 'role' ? role : n === 'ovr' ? p.ovr : 0);
  const hits = S.personalities.filter((x: any) => x.id !== 'balanced' && compileExpr(x.rule)(env)).map((x: any) => x.id);
  p.personality = { main: hits[0] ?? 'balanced', tags: hits.slice(1, 3) };
  const chosen: Array<[string, number]> = []; const conf = new Set<string>();
  for (const t of S.traits) {
    if (side === 'P' ? !['pitch', 'team'].includes(t.side) : t.side === 'pitch') continue;
    if (!compileExpr(t.elig)(env)) continue; if (conf.has(t.id)) continue;
    const pr = t.rate * (a.trait?.[t.id] ?? 1) * S.traitRules.rateScale * (1.05 - p.ovr / 250);
    if (rng.next() < pr) { chosen.push([t.id, pr]); for (const c of t.conflicts ?? []) conf.add(c); }
  }
  p.traits = chosen.sort((u, v) => v[1] - u[1]).slice(0, S.traitRules.maxPerPlayer).map((x) => x[0]);
  p.name = '';   // 이름 자리 — 세계관 팀이 채운다
  const SIGP = ['RARE', 'ELITE', 'LEGEND', 'FRANCHISE', 'BLACK', 'SIGNATURE', 'MVP', 'GG', 'TH'];
  if (side === 'P' && ((o.grade && SIGP.includes(o.grade)) || rng.next() < 0.03)) {
    const cands = S.signaturePitches.variants.filter((v: any) => p.pitches.some((x: any) => x.t === v.base));
    if (cands.length) {
      const w: Record<string, number> = {}; for (const v of cands) { const x = p.pitches.find((y: any) => y.t === v.base); w[v.id] = x.stuff * x.stuff; }
      const vid = rng.pickW(w); const v = cands.find((c: any) => c.id === vid); const x = p.pitches.find((y: any) => y.t === v.base);
      const bonus = S.signaturePitches.rule.stuffBonusByGrade[o.grade ?? 'NORMAL'] ?? 1; x.stuff = r1(clamp(x.stuff + bonus, 1, 100)); x.sig = v.id;
      p.signature = { kind: 'pitch', variant: v.id, base: v.base, bonus, name: '' };
    }
  }
  if (side === 'B') {
    const chance = o.grade && ['BLACK', 'SIGNATURE', 'MVP'].includes(o.grade) ? 1 : o.grade && ['ELITE', 'LEGEND', 'FRANCHISE'].includes(o.grade) ? 0.3 : 0;
    if (chance > 0 && rng.next() < chance) {
      const own = S.signatureBatting.variants.filter((v: any) => p.traits.includes(v.baseTrait));
      const pool = own.length ? own : S.signatureBatting.variants.filter((v: any) => { const t = S.traits.find((q: any) => q.id === v.baseTrait); return t && compileExpr(t.elig)(env); });
      if (pool.length) {
        const v = pool[Math.floor(rng.next() * pool.length)];
        if (!p.traits.includes(v.baseTrait)) p.traits = [v.baseTrait, ...p.traits].slice(0, S.traitRules.maxPerPlayer);
        p.signature = { kind: 'batting', variant: v.id, baseTrait: v.baseTrait, mult: v.mult, name: '' };
      }
    }
  }
  p.ovrRaw = ovrOf(); p.ovr = Math.round(clamp(p.ovrRaw, 1, 99)); p.ca = Math.round(p.ovrRaw * 2); p.pa = Math.max(p.pa, p.ca); p.targetMiss = targetMiss;
  p.injuries = [];
  const pm = Math.exp(0.0788 * (hid.injuryProne - 10));
  const pool = S.injuries.filter((x: any) => x.side === 'all' || x.side === side || (x.side === 'C' && primary === 'C'));
  const wts: Record<string, number> = {}; for (const x of pool) { let e = 0; for (const u in x.hazard) e += x.hazard[u] * S.exposures[u].perTeamSeason; wts[x.key] = e; }
  for (let y = 1; y <= Math.min(6, age - 22); y++) {
    let n = 0; const lam = 0.3 * pm; const L = Math.exp(-lam); let q = 1; do { n++; q *= rng.next(); } while (q > L); n -= 1;
    for (let j = 0; j < n; j++) { const key = rng.pickW(wts); const def = pool.find((x: any) => x.key === key); const d = Math.round(clamp(def.dur[0] * Math.exp(def.dur[1] * rng.normal()), def.dur[2], def.dur[3])); p.injuries.push({ seasonAgo: y, type: key, days: d }); }
  }
  return p;
}

/** 15 레코드 → 엔진 입력(PlayerIn). 안 가진 능력치(투수의 타격 등)는 낮은 기본값. */
const DEF_B: Record<string, number> = { contactR: 15, contactL: 15, power: 10, gap: 12, eye: 15, avoidK: 15, vsFast: 15, vsBreak: 15, bunt: 35, pullTend: 50, launchTend: 45, swingTend: 50,
  speed: 35, baserunning: 35, stealJump: 25, sliding: 30, range: 40, firstStep: 40, hands: 45, armStr: 50, armAcc: 45, turnDP: 25, block: 15, framing: 15, popTime: 15, pitcherLead: 15 };
const DEF_P: Record<string, number> = { velocity: 15, control: 15, deception: 20, extension: 30, stamina: 20, recovery: 40, pickoff: 20, slideStep: 30, pFielding: 30, gbTend: 50 };
export function toPlayerIn(p: GenPlayer, id: number): PlayerIn {
  const attrs = ATTR_KEYS.map((k) => (k in p.attrs ? p.attrs[k] : (DEF_B[k] ?? DEF_P[k] ?? 50)));
  const pos = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'].map((q) => p.pos[q] ?? 1);
  const hidden = HID_KEYS.map((k) => p.hidden[k] ?? 10);
  return { id, age: p.age, throws: p.throws, bats: p.bats, heightCm: p.height, weightKg: p.weight, armSlot: (p.armSlot as any) ?? 'threeQuarter',
    attrs, pos, pitches: p.side === 'P' ? p.pitches.map((x) => ({ ...x })) : [], hidden, traits: p.traits.slice(), sigBat: p.signature?.kind === 'batting' ? p.signature.variant : undefined,
    role: p.role ?? undefined, formFx: { ...p.formFx } };
}

// ── 구단 로스터 ──
export interface GenTeam { id: string; players: GenPlayer[]; ids: number[]; strength: number }
/** 15 generation.rosterTemplate 대로 1군 27명 + 대체 선수(2군) 11명. 용병: SP 2 + 타자 1. */
export function generateTeam(S: any, seed: string, teamId: string, opts: { strength?: number; idBase: number; depth?: boolean } = { idBase: 1 }): GenTeam {
  const R = S.generation.rosterTemplate.first;
  const rng = seqRng(seed + '|team');
  const strength = opts.strength ?? 0;
  const out: GenPlayer[] = []; const ids: number[] = [];
  let n = 0;
  const add = (slot: string, tier: string, foreign = false) => {
    const p = generatePlayer(S, { seed: `${seed}|${teamId}|${n}`, slot, tier, foreign, ovrShift: strength });
    out.push(p); ids.push(opts.idBase + n); n++;
  };
  const foreignSP = 2, foreignBat = 1;
  for (let i = 0; i < R.SP; i++) add('SP', i < foreignSP ? 'foreign' : 'first', i < foreignSP);
  for (let i = 0; i < R.RP; i++) add('RP', 'first');
  for (let i = 0; i < R.CL; i++) add('CL', 'first');
  const batSlots: string[] = [];
  for (const q of ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH']) for (let i = 0; i < (R[q] ?? 0); i++) batSlots.push(q);
  const fIdx = Math.floor(rng.next() * 3); const fSlot = ['1B', 'LF', 'DH'][fIdx];
  let cSeen = 0;
  for (const q of batSlots) { const isF = q === fSlot && foreignBat > 0; const tier = isF ? 'foreign' : q === 'C' && cSeen++ >= 1 ? 'bench' : 'first'; add(q, tier, isF); }
  for (let i = 0; i < R.UT; i++) add('UT', 'bench');
  if (opts.depth !== false) {
    for (let i = 0; i < 5; i++) add('RP', 'second');
    add('SP', 'second'); add('C', 'second');
    for (const q of ['SS', 'CF', '3B', '1B']) add(q, 'second');
  }
  return { id: teamId, players: out, ids, strength };
}
