// 라인업 계산 (목업) — 카드를 바꾸면 바로 다시 계산해서 케미 선 굵기 · 팀컬러 · 팀 종합이 따라 움직인다.
// 서버·엔진이 붙으면 같은 모양(Eval)을 서버가 채운다. 수치는 손맛을 보기 위한 임시값이다.
//
// 규칙 (화면에 그대로 보이는 것)
//  · 케미 선: 이웃한 두 자리의 공통점 — 같은 구단 2 · 같은 권역 1 · 같은 시즌 카드 1
//            + 자리 짝(키스톤·배터리·외야·테이블세터·클린업·뒷문)은 공통점이 하나라도 있으면 1 더
//            점수 1·2·3 = 1~3단, 4 이상 = 형광. 공통점이 없거나 한쪽이 적성 밖 자리면 끊김.
//  · 세트덱: 1군 엔트리 20명 기준 — 구단+연도 5·9·14·20명, 구단 5·9·14·20명, 연도 9·14·20명 (game/sets)
//            동시에 2개까지, 한 선수는 가장 센 세트 하나. 오르는 능력치는 조합마다 다르다.
//  · 팀 종합: 선발 10명(타자 9 + 1선발)의 '기본(종합 + 강화) + 세트덱 + 케미' 평균. 최대 99.
import type { CardInst, Player, Team } from '../../game/types';
import { ME, TEAMS, teamById } from '../../game/mock';
import { DYNASTY_V, computeSets, faceBonus, sideLine, type EntryMember, type SetProgress } from '../../game/sets';
import { fullYear } from '../../game/clubSeasons';
import { yearTag } from '../../ui/format';
import { OWNED, getCard, getPlayer, startLayout } from './local-mock';

/* ───────── 자리 ───────── */
export type BatSlot = 'C' | '1B' | '2B' | '3B' | 'SS' | 'LF' | 'CF' | 'RF' | 'DH';
export type StaffSlot = 'R0' | 'R1' | 'R2' | 'R3' | 'R4' | 'B0' | 'B1' | 'B2' | 'B3' | 'B4' | 'CL';
export type Slot = BatSlot | StaffSlot;
/** 경기장 판 위 자리 — P 는 1선발(R0) */
export type BoardSlot = BatSlot | 'P';

export const BAT_SLOTS: BatSlot[] = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
export const ROT_SLOTS: StaffSlot[] = ['R0', 'R1', 'R2', 'R3', 'R4'];
export const PEN_SLOTS: StaffSlot[] = ['B0', 'B1', 'B2', 'B3', 'B4'];
export const STAFF_SLOTS: StaffSlot[] = [...ROT_SLOTS, ...PEN_SLOTS, 'CL'];
export const isBat = (s: Slot): s is BatSlot => (BAT_SLOTS as string[]).includes(s);
export const boardToSlot = (b: BoardSlot): Slot => (b === 'P' ? 'R0' : b);

export const SLOT_KO: Record<Slot, string> = {
  C: '포수', '1B': '1루수', '2B': '2루수', '3B': '3루수', SS: '유격수', LF: '좌익수', CF: '중견수', RF: '우익수', DH: '지명타자',
  R0: '1선발', R1: '2선발', R2: '3선발', R3: '4선발', R4: '5선발',
  B0: '셋업맨', B1: '필승조', B2: '좌완 원포인트', B3: '추격조', B4: '롱릴리프', CL: '마무리',
};
/** 기록지 수비 번호 (6-4-3) */
export const SCORE_NO: Record<BoardSlot, string> = { P: '1', C: '2', '1B': '3', '2B': '4', '3B': '5', SS: '6', LF: '7', CF: '8', RF: '9', DH: 'DH' };

/* ───────── 라인업 상태 ───────── */
export interface LineupState {
  field: Record<BatSlot, string | null>;
  /** 타순 — order[0] 이 1번 타자가 서는 자리 */
  order: BatSlot[];
  /** 선발 5 — [0] 이 1선발(경기장 마운드) */
  rotation: (string | null)[];
  /** 셋업맨 · 필승조 · 좌완 원포인트 · 추격조 · 롱릴리프 */
  bullpen: (string | null)[];
  closer: string | null;
  bench: string[];
}

export function initialLineup(): LineupState {
  const field = Object.fromEntries(BAT_SLOTS.map((s) => [s, null])) as Record<BatSlot, string | null>;
  const START = startLayout();
  START.batting.forEach((b) => { field[b.pos as BatSlot] = b.cardId; });
  return {
    field,
    order: [...START.batting].sort((a, b) => a.order - b.order).map((b) => b.pos as BatSlot),
    rotation: [...START.rotation],
    bullpen: [...START.bullpen],
    closer: START.closer,
    bench: [...START.bench],
  };
}

export function getSlot(st: LineupState, s: Slot): string | null {
  if (isBat(s)) return st.field[s];
  if (s === 'CL') return st.closer;
  const i = Number(s[1]);
  return s[0] === 'R' ? st.rotation[i] ?? null : st.bullpen[i] ?? null;
}
function setSlot(st: LineupState, s: Slot, id: string | null) {
  if (isBat(s)) st.field[s] = id;
  else if (s === 'CL') st.closer = id;
  else if (s[0] === 'R') st.rotation[Number(s[1])] = id;
  else st.bullpen[Number(s[1])] = id;
}
const clone = (st: LineupState): LineupState => ({
  field: { ...st.field }, order: [...st.order], rotation: [...st.rotation], bullpen: [...st.bullpen], closer: st.closer, bench: [...st.bench],
});

/** 이 카드가 지금 선 자리 (없으면 null) */
export function slotOf(st: LineupState, id: string): Slot | null {
  for (const s of BAT_SLOTS) if (st.field[s] === id) return s;
  for (const s of STAFF_SLOTS) if (getSlot(st, s) === id) return s;
  return null;
}

/** 안 쓰는 내 카드 (벤치 밖 보관함) */
export function boxOf(st: LineupState) {
  const used = new Set<string>(st.bench);
  BAT_SLOTS.forEach((s) => st.field[s] && used.add(st.field[s]!));
  STAFF_SLOTS.forEach((s) => { const id = getSlot(st, s); if (id) used.add(id); });
  return OWNED.filter((id) => !used.has(id));
}

/**
 * 자리에 카드 놓기 — 다른 자리에 있던 카드면 서로 맞바꾸고(타순은 선수를 따라감),
 * 벤치·보관함에서 오면 원래 카드는 벤치 맨 앞으로.
 */
export function place(st: LineupState, slot: Slot, id: string): LineupState {
  const cur = getSlot(st, slot);
  if (cur === id) return st;
  const nx = clone(st);
  const from = slotOf(st, id);
  if (from) {
    setSlot(nx, from, cur);
    setSlot(nx, slot, id);
    if (isBat(slot) && isBat(from)) nx.order = nx.order.map((x) => (x === slot ? from : x === from ? slot : x));
  } else {
    nx.bench = nx.bench.filter((b) => b !== id);
    setSlot(nx, slot, id);
    if (cur) nx.bench = [cur, ...nx.bench].slice(0, 9);
  }
  return nx;
}

/** 타순 두 칸 맞바꾸기 */
export function swapOrder(st: LineupState, i: number, j: number): LineupState {
  if (i === j) return st;
  const nx = clone(st);
  [nx.order[i], nx.order[j]] = [nx.order[j], nx.order[i]];
  return nx;
}

/* ───────── 카드 · 선수 묶음 ───────── */
export interface Unit { id: string; card: CardInst; player: Player; team: Team }
const unitCache = new Map<string, Unit>();
export function unit(id: string): Unit {
  let u = unitCache.get(id);
  if (!u) {
    const card = getCard(id)!;
    const player = getPlayer(card.playerId)!;
    u = { id, card, player, team: teamById(player.teamId) };
    unitCache.set(id, u);
  }
  return u;
}
export const face = (p: Player, code: string, d = 55) => p.face.find((f) => f.code === code)?.v ?? d;
const enhBonus = (c: CardInst) => Math.round(c.enhance * 0.5);
/** 이 카드의 종합 — 카드에 따로 적혀 있으면 그것, 없으면 선수 종합 */
export const cardOvr = (u: Unit) => u.card.ovr ?? u.player.ovr;

/* ───────── 자리 적성 ───────── */
export type Fit = 'main' | 'sub' | 'near' | 'any' | 'off';
const IF = ['1B', '2B', '3B', 'SS'];
const OF = ['LF', 'CF', 'RF'];
const group = (p: string) => (IF.includes(p) ? 'IF' : OF.includes(p) ? 'OF' : p);

export function fitOf(p: Player, s: Slot): Fit {
  if (isBat(s)) {
    if (p.pos === 'P') return 'off';
    if (s === 'DH') return p.pos === 'DH' ? 'main' : 'any';
    if (p.pos === s) return 'main';
    if (p.subPos?.includes(s)) return 'sub';
    if (p.pos === 'C' || s === 'C' || p.pos === 'DH') return 'off';
    return group(p.pos) === group(s) ? 'near' : 'off';
  }
  if (p.pos !== 'P') return 'off';
  if (s[0] === 'R') return p.role === 'SP' ? 'main' : 'near';
  if (s === 'CL') return p.role === 'CL' ? 'main' : 'near';
  if (s === 'B4') return 'main';                       // 롱릴리프 — 선발도 좋다
  if (s === 'B2') return p.throws === 'L' && p.role !== 'SP' ? 'main' : 'near';
  return p.role === 'SP' ? 'near' : 'main';
}
export const FIT_PENALTY: Record<Fit, number> = { main: 0, any: 0, sub: 1, near: 3, off: 8 };
export const FIT_KO: Record<Fit, string> = { main: '주 포지션', any: '지명', sub: '볼 수 있는 자리', near: '비슷한 자리', off: '적성 밖' };

/* ───────── 케미 ───────── */
export type Level = 0 | 1 | 2 | 3 | 4;
export const LEVEL_KO: Record<Level, string> = { 0: '끊김', 1: '1단', 2: '2단', 3: '3단', 4: '형광' };

export interface Link {
  id: string;
  a: string;
  b: string;
  /** 키스톤 · 배터리 · 외야 · 테이블세터 · 클린업 · 뒷문 */
  name?: string;
  level: Level;
  /** 맞는 공통점 ('같은 구단', "같은 시즌 '27", '키스톤') */
  why: string[];
}

function chem(id: string, a: string, b: string, ua: Unit | undefined, ub: Unit | undefined, name?: string, broken?: boolean): Link | null {
  if (!ua || !ub) return null;
  if (broken) return { id, a, b, name, level: 0, why: ['적성 밖 자리'] };
  const why: string[] = [];
  let pts = 0;
  if (ua.player.teamId === ub.player.teamId) { pts += 2; why.push('같은 구단'); } else if (ua.team.zone === ub.team.zone) { pts += 1; why.push('같은 권역'); }
  if (ua.card.year != null && ua.card.year === ub.card.year) { pts += 1; why.push(`같은 시즌 ${yearTag(ua.card.year)}`); }
  if (name && pts > 0) { pts += 1; why.push(name); }
  return { id, a, b, name, level: (pts >= 4 ? 4 : pts) as Level, why };
}

/** 경기장 판 위 케미 선 15개 (아트 디렉션 8-4) */
export const FIELD_LINKS: [BoardSlot, BoardSlot, string?][] = [
  ['P', 'C', '배터리'], ['P', 'SS'], ['P', '2B'], ['SS', '2B', '키스톤'], ['3B', 'SS'], ['2B', '1B'],
  ['3B', 'LF'], ['SS', 'LF'], ['SS', 'CF'], ['2B', 'CF'], ['2B', 'RF'], ['1B', 'RF'],
  ['LF', 'CF', '외야'], ['CF', 'RF', '외야'], ['DH', 'C'],
];
const ORDER_NAMES: Record<number, string> = { 0: '테이블세터', 2: '클린업', 3: '클린업' };

/* ───────── 세트덱 (game/sets) ───────── */
// 1군 엔트리 20명(타자 9 · 선발 5 · 불펜 5 · 마무리 1) 안에서 같은 구단·같은 연도 카드 수로 단계가 켜진다.
// 동시에 2개까지(센 것부터), 한 선수는 받는 세트 중 가장 센 것 하나. 오르는 능력치는 조합마다 다르다.
export { ENTRY_SIZE, DYNASTY_V, TIERS, SET_KIND_KO } from '../../game/sets';
export type { SetProgress } from '../../game/sets';
/** 예전 이름 — 왕조(엔트리 전원 구단+연도) 때 오르는 값 */
export const BOOM = DYNASTY_V;

/** 라인업 → 엔트리 구성원 (빈 자리 빼고) */
export function entryMembers(st: LineupState): EntryMember[] {
  const out: EntryMember[] = [];
  const push = (key: Slot, id: string | null) => {
    if (!id) return;
    const u = unit(id);
    out.push({ key, code: u.team.code, year: u.card.year != null ? fullYear(u.card.year) : undefined, isP: u.player.pos === 'P' });
  };
  BAT_SLOTS.forEach((s) => push(s, st.field[s]));
  STAFF_SLOTS.forEach((s) => push(s, getSlot(st, s)));
  return out;
}


/* ───────── 타순 적성 ───────── */
export type OrderFit = 'good' | 'ok' | 'poor';
const ORDER_SCORE: ((p: Player) => number)[] = [
  (p) => (face(p, 'EYE') + face(p, 'SPD')) / 2,
  (p) => (face(p, 'CON') + face(p, 'EYE')) / 2,
  (p) => (face(p, 'CON') + face(p, 'POW')) / 2,
  (p) => face(p, 'POW'),
  (p) => face(p, 'POW') * 0.6 + face(p, 'CON') * 0.4,
];
export const ORDER_ROLE = ['출루·주루', '작전·컨택', '정교함·장타', '장타', '장타·타점'];
export function orderFit(p: Player, idx: number): OrderFit | undefined {
  const f = ORDER_SCORE[idx];
  if (!f) return undefined;
  const v = f(p);
  return v >= 82 ? 'good' : v >= 70 ? 'ok' : 'poor';
}
export const ORDER_FIT_KO: Record<OrderFit, string> = { good: '적임', ok: '무난', poor: '어색' };

/* ───────── 평가 ───────── */
export interface UnitEval {
  slot: Slot;
  id: string;
  fit: Fit;
  /** 종합 + 강화 − 적성 */
  base: number;
  /** 세트덱 (종합 기준 단계 가치) */
  tc: number;
  chem: number;
  total: number;
  /** 받는 세트 글 ("’27 독수리스 · 파워 +4 · 장타 +3") */
  tcText: string[];
  /** 받는 세트 */
  set?: SetProgress;
  orderIdx?: number;
  orderFit?: OrderFit;
  injured?: boolean;
}

export interface Eval {
  overall: number;
  /** 반올림 전 (자동 편성 비교용) */
  raw: number;
  base: number;
  potential: number;
  tcAvg: number;
  chemAvg: number;
  parts: { k: 'bat' | 'def' | 'pit' | 'run'; ko: string; v: number }[];
  units: Partial<Record<Slot, UnitEval>>;
  links: Link[];
  orderLinks: Link[];
  battery: (Link | null)[];
  backdoor: Link | null;
  /** 세트 진행 — 켜진 것 → 다음 단계까지 적게 남은 것 순 */
  sets: SetProgress[];
  /** 지금 켜진 세트 (최대 2) */
  active: SetProgress[];
  /** 엔트리 인원 (빈 자리 뺀) */
  entry: number;
  /** 대표 구단 — 켜진 세트(없으면 가장 많이 모은 구단)의 구단 */
  club: Team;
  /** 왕조 — 엔트리 전원이 한 구단·한 연도 */
  exploded: boolean;
}

const clamp99 = (v: number) => Math.max(1, Math.min(99, Math.round(v)));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const r1 = (v: number) => Math.round(v * 10) / 10;

export function evaluate(st: LineupState): Eval {
  const U = (id: string | null) => (id ? unit(id) : undefined);
  const bat = BAT_SLOTS.map((s) => ({ s, u: U(st.field[s]) })).filter((x): x is { s: BatSlot; u: Unit } => !!x.u);
  const P = U(st.rotation[0]);
  const fits: Partial<Record<Slot, Fit>> = {};
  bat.forEach(({ s, u }) => { fits[s] = fitOf(u.player, s); });
  STAFF_SLOTS.forEach((s) => { const u = U(getSlot(st, s)); if (u) fits[s] = fitOf(u.player, s); });

  /* 세트덱 — 엔트리 20명 */
  const members = entryMembers(st);
  const sets = computeSets(members);
  const exploded = !!sets.dynasty;
  const lead = sets.dynasty ?? sets.active[0] ?? sets.all.find((x) => x.kind !== 'year' && x.code);
  const club = lead?.code ? (TEAMS.find((t) => t.code === lead.code) ?? teamById(ME.teamId)) : teamById(ME.teamId);
  const setOf = (s: Slot) => sets.bonusOf.get(s);

  /* 케미 선 */
  const at = (b: BoardSlot) => (b === 'P' ? P : U(st.field[b]));
  const off = (b: BoardSlot) => (b === 'P' ? fits.R0 === 'off' : fits[b] === 'off');
  const links = FIELD_LINKS.map(([a, b, name]) => chem(`${a}-${b}`, a, b, at(a), at(b), name, off(a) || off(b))).filter((l): l is Link => !!l);
  const orderLinks: Link[] = [];
  for (let i = 0; i < 8; i++) {
    const l = chem(`o${i}`, String(i + 1), String(i + 2), U(st.field[st.order[i]]), U(st.field[st.order[i + 1]]), ORDER_NAMES[i]);
    if (l) orderLinks.push(l);
  }
  const C = U(st.field.C);
  const battery = st.rotation.map((id, i) => chem(`bat${i}`, 'C', `R${i}`, C, U(id), '배터리', fits.C === 'off'));
  const backdoor = chem('back', 'B0', 'CL', U(st.bullpen[0]), U(st.closer), '뒷문');

  const chemOf = (key: string, extra: Link[] = []) => {
    const mine = [...links.filter((l) => l.a === key || l.b === key), ...extra];
    return mine.length ? r1(mean(mine.map((l) => l.level)) * 0.45) : 0;
  };
  const setText = (sp: SetProgress | undefined, isP: boolean) => (sp?.cur ? [`${sp.dynasty ? '왕조 · ' : ''}${sp.name} · ${sideLine(sp.cur, isP)}`] : []);

  /* 선수마다 */
  const units: Partial<Record<Slot, UnitEval>> = {};
  bat.forEach(({ s, u }) => {
    const fit = fits[s]!;
    const idx = st.order.indexOf(s);
    const of = orderFit(u.player, idx);
    const sp = setOf(s);
    const tc = sp?.cur?.v ?? 0;
    const orderL = orderLinks.filter((l) => l.a === String(idx + 1) || l.b === String(idx + 1));
    const ch = chemOf(s, orderL);
    const base = cardOvr(u) + enhBonus(u.card) - FIT_PENALTY[fit] + (of === 'good' ? 0.5 : of === 'poor' ? -0.5 : 0);
    units[s] = { slot: s, id: u.id, fit, base, tc, chem: ch, total: base + tc + ch, tcText: setText(sp, false), set: sp, orderIdx: idx, orderFit: of };
  });

  STAFF_SLOTS.forEach((s, i) => {
    const u = U(getSlot(st, s));
    if (!u) return;
    const fit = fits[s]!;
    const injured = !!u.player.injury;
    const base = cardOvr(u) + enhBonus(u.card) - FIT_PENALTY[fit] - (injured ? 10 : 0);
    const sp = setOf(s);
    const tc = sp?.cur?.v ?? 0;
    let ch = 0;
    if (s === 'R0') ch = chemOf('P');
    else if (s[0] === 'R') ch = r1((battery[i]?.level ?? 0) * 0.45);
    else if (s === 'B0' || s === 'CL') ch = r1((backdoor?.level ?? 0) * 0.45);
    units[s] = { slot: s, id: u.id, fit, base, tc, chem: ch, total: base + tc + ch, tcText: setText(sp, true), set: sp, injured };
  });

  /* 팀 종합 — 선발 10명 */
  const starters = [...bat.map(({ s }) => units[s]!), ...(units.R0 ? [units.R0] : [])];
  const raw = mean(starters.map((x) => x.total));
  const baseAvg = mean(starters.map((x) => x.base));
  const tcAvg = mean(starters.map((x) => x.tc));
  const chemAvg = mean(starters.map((x) => x.chem));
  const potRaw = exploded ? raw : mean(starters.map((x) => x.total - x.tc + DYNASTY_V));

  /* 묶음 점수 — 받는 세트의 능력치 칸만큼 */
  const fb = (s: Slot, isP: boolean) => faceBonus(setOf(s)?.cur, isP);
  const batPart = mean(bat.map(({ s, u }) => {
    const x = units[s]!;
    const b = fb(s, false);
    return (face(u.player, 'CON') + face(u.player, 'POW') + face(u.player, 'EYE') + (b.CON ?? 0) + (b.POW ?? 0) + (b.EYE ?? 0)) / 3 + enhBonus(u.card) + x.chem
      + (x.orderFit === 'good' ? 1.5 : x.orderFit === 'poor' ? -1.5 : 0);
  }));
  const defPart = mean(bat.filter(({ s }) => s !== 'DH').map(({ s, u }) => {
    const x = units[s]!;
    const b = fb(s, false);
    const d = s === 'C'
      ? (face(u.player, 'BLK') + face(u.player, 'FRM') + face(u.player, 'CS') + (b.BLK ?? 0) + (b.FRM ?? 0) + (b.CS ?? 0)) / 3
      : (face(u.player, 'DEF') + face(u.player, 'ARM') + (b.DEF ?? 0) + (b.ARM ?? 0)) / 2;
    return d + enhBonus(u.card) + x.chem - FIT_PENALTY[x.fit] * 1.5;
  }));
  const runPart = mean(bat.map(({ s, u }) => face(u.player, 'SPD') + (fb(s, false).SPD ?? 0) + enhBonus(u.card)));
  const rot = ROT_SLOTS.slice(1).map((s) => units[s]?.total).filter((v): v is number => v != null);
  const pen = [...PEN_SLOTS, 'CL' as const].map((s) => units[s]?.total).filter((v): v is number => v != null);
  const pitPart = 0.5 * (units.R0?.total ?? 60) + 0.3 * (rot.length ? mean(rot) : 60) + 0.2 * (pen.length ? mean(pen) : 60);

  return {
    overall: clamp99(raw),
    raw,
    base: clamp99(baseAvg),
    potential: clamp99(potRaw),
    tcAvg: r1(tcAvg),
    chemAvg: r1(chemAvg),
    parts: [
      { k: 'bat', ko: '타격', v: clamp99(batPart) },
      { k: 'def', ko: '수비', v: clamp99(defPart) },
      { k: 'pit', ko: '투수', v: clamp99(pitPart) },
      { k: 'run', ko: '주루', v: clamp99(runPart) },
    ],
    units,
    links,
    orderLinks,
    battery,
    backdoor,
    sets: sets.all,
    active: sets.active,
    entry: members.length,
    club,
    exploded,
  };
}


/* ───────── 바꿀 후보 ───────── */
export type CandSrc = 'bench' | 'box' | 'swap';
export interface Cand {
  id: string;
  src: CandSrc;
  /** 맞바꿀 때 상대 자리 */
  from?: Slot;
  next: LineupState;
  ev: Eval;
  fit: Fit;
  delta: number;
  /** 투수 묶음 변화 (불펜 자리) */
  pitDelta: number;
}

/** 같은 선수가 다른 자리에 이미 있나 */
function playerBusy(st: LineupState, slot: Slot, playerId: string) {
  for (const s of [...BAT_SLOTS, ...STAFF_SLOTS] as Slot[]) {
    if (s === slot) continue;
    const id = getSlot(st, s);
    if (id && unit(id).player.id === playerId) return true;
  }
  return false;
}

export function candidates(st: LineupState, slot: Slot, cur: Eval): Cand[] {
  const curId = getSlot(st, slot);
  const wantP = !isBat(slot);
  const pool: { id: string; src: CandSrc; from?: Slot }[] = [
    ...st.bench.map((id) => ({ id, src: 'bench' as const })),
    ...boxOf(st).map((id) => ({ id, src: 'box' as const })),
    ...(isBat(slot) ? BAT_SLOTS : STAFF_SLOTS).filter((s) => s !== slot && getSlot(st, s)).map((s) => ({ id: getSlot(st, s)!, src: 'swap' as const, from: s as Slot })),
  ];
  const seen = new Set<string>();
  const out: Cand[] = [];
  const curPit = cur.parts.find((p) => p.k === 'pit')!.v;
  for (const c of pool) {
    if (c.id === curId || seen.has(c.id)) continue;
    seen.add(c.id);
    const u = unit(c.id);
    if ((u.player.pos === 'P') !== wantP) continue;
    if (c.src !== 'swap' && playerBusy(st, slot, u.player.id)) continue;
    const fit = fitOf(u.player, slot);
    const next = place(st, slot, c.id);
    const ev = evaluate(next);
    out.push({ ...c, next, ev, fit, delta: ev.overall - cur.overall, pitDelta: ev.parts.find((p) => p.k === 'pit')!.v - curPit });
  }
  return out.sort((a, b) => (b.ev.raw - a.ev.raw) || (b.pitDelta - a.pitDelta) || (unit(b.id).player.ovr - unit(a.id).player.ovr));
}

/** 벤치 카드 한 장을 넣을 수 있는 자리들 (넣으면 어떻게 되나) */
export function placesFor(st: LineupState, id: string, cur: Eval) {
  const u = unit(id);
  const slots: Slot[] = u.player.pos === 'P' ? STAFF_SLOTS : BAT_SLOTS;
  const curPit = cur.parts.find((p) => p.k === 'pit')!.v;
  return slots
    .filter((s) => !playerBusy(st, s, u.player.id))
    .map((s) => {
      const next = place(st, s, id);
      const ev = evaluate(next);
      return { slot: s, cur: getSlot(st, s), next, ev, fit: fitOf(u.player, s), delta: ev.overall - cur.overall, pitDelta: ev.parts.find((p) => p.k === 'pit')!.v - curPit };
    })
    .sort((a, b) => (b.ev.raw - a.ev.raw) || (b.pitDelta - a.pitDelta));
}

/* ───────── 자동 편성 ───────── */
const score = (e: Eval) => e.raw * 10 + e.parts.reduce((s, p) => s + p.v, 0) * 0.02;

/** 추천 타순 — 4번 파워 → 3번 → 1번 → 2번 → 5번, 나머지는 종합 순 */
export function autoOrder(st: LineupState): LineupState {
  const left = new Set(st.order);
  const order: (BatSlot | null)[] = Array(9).fill(null);
  const p = (s: BatSlot) => unit(st.field[s]!).player;
  for (const idx of [3, 2, 0, 1, 4]) {
    let best: BatSlot | null = null;
    let bv = -1;
    left.forEach((s) => { const v = ORDER_SCORE[idx](p(s)); if (v > bv) { bv = v; best = s; } });
    if (best) { order[idx] = best; left.delete(best); }
  }
  const rest = [...left].sort((a, b) => p(b).ovr - p(a).ovr);
  for (let i = 5; i < 9; i++) order[i] = rest.shift() ?? null;
  const nx = clone(st);
  nx.order = order.map((s, i) => s ?? st.order[i]);
  return nx;
}

/** 자동 편성 — 가장 많이 오르는 한 수를 반복 + 추천 타순 + 빈 투수 칸 채우기 */
export function autoLineup(st: LineupState): LineupState {
  let cur = st;
  let ce = evaluate(cur);
  for (let it = 0; it < 14; it++) {
    let best: { st: LineupState; sc: number } | null = null;
    for (const slot of [...BAT_SLOTS, 'R0'] as Slot[]) {
      for (const c of candidates(cur, slot, ce).slice(0, 6)) {
        const sc = score(c.ev);
        if (sc > score(ce) + 0.5 && (!best || sc > best.sc)) best = { st: c.next, sc };
      }
    }
    if (!best) break;
    cur = best.st;
    ce = evaluate(cur);
  }
  cur = autoOrder(cur);
  // 비어 있는 투수 칸 — 가장 좋은 투수로
  for (const slot of STAFF_SLOTS) {
    if (getSlot(cur, slot)) continue;
    const c = candidates(cur, slot, evaluate(cur)).find((x) => x.src !== 'swap' && x.fit === 'main');
    if (c) cur = c.next;
  }
  return cur;
}

/** 저장 (이 탭이 열려 있는 동안 — 서버 저장은 다음 단계) */
let saved: LineupState | null = null;
export const store = { get: () => saved, set: (s: LineupState) => { saved = s; }, clear: () => { saved = null; } };
