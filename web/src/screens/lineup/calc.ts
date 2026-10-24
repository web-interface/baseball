// 라인업 계산 (목업) — 카드를 바꾸면 바로 다시 계산해서 케미 선 굵기 · 팀컬러 · 팀 종합이 따라 움직인다.
// 서버·엔진이 붙으면 같은 모양(Eval)을 서버가 채운다. 수치는 손맛을 보기 위한 임시값이다.
//
// 규칙 (화면에 그대로 보이는 것)
//  · 케미 선: 이웃한 두 자리의 공통점 — 같은 구단 2 · 같은 권역 1 · 같은 시즌 카드 1
//            + 자리 짝(키스톤·배터리·외야·테이블세터·클린업·뒷문)은 공통점이 하나라도 있으면 1 더
//            점수 1·2·3 = 1~3단, 4 이상 = 형광. 공통점이 없거나 한쪽이 적성 밖 자리면 끊김.
//  · 세트덱: 1군 엔트리 20명 기준 — 구단+연도 5·9·14·20명, 구단 5·9·14·20명, 연도 9·14·20명 (game/sets)
//            동시에 2개까지, 한 선수는 가장 센 세트 하나. 오르는 능력치는 조합마다 다르다.
//  · 팀 종합: 선발 10명(타자 9 + 1선발)의 '기본(종합 + 강화 + 훈련 + 잠재력) + 세트덱 + 케미' 평균.
//  · 레전드급(레전드 · 프랜차이즈 · 블랙 · 시그니처) 카드는 1군 엔트리에 타자 2명 · 투수 2명까지 (game/potential LEGEND_MAX).
//  · MVP 카드는 1군 엔트리에 타자 · 투수 합쳐 4명까지 (MVP_MAX).
import type { CardInst, Player, Team } from '../../game/types';
import type { TacState } from '../../game/tactics';
import { ME, teamByCode, teamById } from '../../game/mock';
import { DYNASTY_V, computeSets, faceBonus, sideLine, type EntryMember, type SetProgress } from '../../game/sets';
import { fullYear } from '../../game/clubSeasons';
import { yearTag } from '../../ui/format';
import { getCard, getPlayer, owned, startLayout } from './local-mock';
import { enhGainTotal, invVersion, loadLineup, saveLineup } from '../../game/inventory';
import { cardLite } from '../../game/kbo';
import { LEGEND_MAX, MVP_MAX, isLegendGrade, isMvpGrade, potFaceOf, teamPotential, type FaceFx, type TeamPot } from '../../game/potential';
import { cardBonusOf, ovrBonusOf, type CardBonus } from '../../game/cardBonus';

/* ───────── 자리 ───────── */
export type BatSlot = 'C' | '1B' | '2B' | '3B' | 'SS' | 'LF' | 'CF' | 'RF' | 'DH';
export type StaffSlot = 'R0' | 'R1' | 'R2' | 'R3' | 'R4' | 'B0' | 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'B6' | 'B7' | 'B8' | 'B9' | 'CL';
export type Slot = BatSlot | StaffSlot;
/** 경기장 판 위 자리 — P 는 1선발(R0) */
export type BoardSlot = BatSlot | 'P';

export const BAT_SLOTS: BatSlot[] = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
export const ROT_SLOTS: StaffSlot[] = ['R0', 'R1', 'R2', 'R3', 'R4'];
/** 불펜 10칸 — 앞 다섯(셋업맨 · 필승조 · 좌완 원포인트 · 추격조 · 롱릴리프)이 주력, 뒤 다섯은 두 번째 줄 */
export const PEN_SLOTS: StaffSlot[] = ['B0', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9'];
export const STAFF_SLOTS: StaffSlot[] = [...ROT_SLOTS, ...PEN_SLOTS, 'CL'];
export const isBat = (s: Slot): s is BatSlot => (BAT_SLOTS as string[]).includes(s);
export const boardToSlot = (b: BoardSlot): Slot => (b === 'P' ? 'R0' : b);

export const SLOT_KO: Record<Slot, string> = {
  C: '포수', '1B': '1루수', '2B': '2루수', '3B': '3루수', SS: '유격수', LF: '좌익수', CF: '중견수', RF: '우익수', DH: '지명타자',
  R0: '1선발', R1: '2선발', R2: '3선발', R3: '4선발', R4: '5선발',
  B0: '셋업맨', B1: '필승조', B2: '좌완 원포인트', B3: '추격조', B4: '롱릴리프',
  B5: '필승조 2', B6: '중간 계투', B7: '추격조 2', B8: '롱릴리프 2', B9: '패전조', CL: '마무리',
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
  /** 셋업맨 · 필승조 · 좌완 원포인트 · 추격조 · 롱릴리프 · 필승조 2 · 중간 계투 · 추격조 2 · 롱릴리프 2 · 패전조 (10칸, 예전 저장은 5칸) */
  bullpen: (string | null)[];
  closer: string | null;
  bench: string[];
  /** 경기에 쓸 때 같이 얼린 전술 (스냅샷에만 — 저장된 라인업엔 없다, game/tactics) */
  tac?: TacState;
}

/** 처음 라인업 — 기본 선수단 배치를 지금 보유 카드에 맞춰서 */
export function initialLineup(): LineupState {
  return sanitize(startState()) ?? startState();
}

function startState(): LineupState {
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
  return owned().filter((id) => !used.has(id));
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
    nx.bench = benchFor(nx);
  }
  return nx;
}

/** 같은 사람 키 — 실제 선수는 시즌마다 보기 id 가 달라('k1a2b3c~2015' · '~2016') 시즌 꼬리를 뗀다 */
const personOfId = (id: string) => id.replace(/~\d{4}$/, '');
const personOfCard = (id: string) => personOfId(unit(id).player.id);
/** 벤치 정리 — 경기에 나서는 자리(수비 · 투수)에 이미 있는 사람, 벤치에 두 번 있는 사람은 뺀다 (로스터에 같은 선수는 한 번) */
export function benchFor(st: LineupState): string[] {
  const seen = new Set<string>();
  for (const s of BAT_SLOTS) { const id = st.field[s]; if (id) seen.add(personOfCard(id)); }
  for (const s of STAFF_SLOTS) { const id = getSlot(st, s); if (id) seen.add(personOfCard(id)); }
  return st.bench.filter((id) => { const who = personOfCard(id); if (seen.has(who)) return false; seen.add(who); return true; });
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
let unitVer = -1;
export function unit(id: string): Unit {
  // 보유 카드가 바뀌면(강화 · 레벨) 다시 만든다
  const v = invVersion();
  if (v !== unitVer) { unitCache.clear(); unitVer = v; }
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
/** 잠재력 몫 (팀 종합에 더해진 것 중 잠재력만 — 표시용) */
const ovrPotOf = (b: CardBonus, p: Player) => Object.values(b.parts.pot ?? {}).reduce((x, v) => x + v, 0) / (p.face.length || 6);
/** 이 카드의 종합 — 카드에 따로 적혀 있으면 그것, 없으면 선수 종합 */
export const cardOvr = (u: Unit) => u.card.ovr ?? u.player.ovr;

/* ───────── 자리 적성 ───────── */
export type Fit = 'main' | 'sub' | 'near' | 'any' | 'off';
const IF = ['1B', '2B', '3B', 'SS'];
const OF = ['LF', 'CF', 'RF'];
const group = (p: string) => (IF.includes(p) ? 'IF' : OF.includes(p) ? 'OF' : p);

export function fitOf(p: Pick<Player, 'pos' | 'subPos' | 'role' | 'throws'>, s: Slot): Fit {
  if (isBat(s)) {
    if (p.pos === 'P') return 'off';
    if (s === 'DH') return p.pos === 'DH' ? 'main' : 'any';
    if (p.pos === s) return 'main';
    if (p.subPos?.includes(s)) return 'sub';
    if (p.pos === 'C' || s === 'C' || p.pos === 'DH') return 'off';
    return group(p.pos) === group(s) ? 'near' : 'off';
  }
  if (p.pos !== 'P') return 'off';
  if (s[0] === 'R') return p.role === 'SP' ? 'main' : 'near';   // 불펜 투수를 선발로 — 보직 밖
  if (s === 'B4' || s === 'B8') return 'main';                     // 롱릴리프 — 선발도 좋다
  if (p.role === 'SP') return 'near';                              // 선발 투수를 짧은 불펜 · 마무리로 — 보직 밖
  if (s === 'CL') return p.role === 'CL' ? 'main' : 'sub';         // 불펜 투수가 마무리 — 조금
  if (s === 'B2') return p.throws === 'L' ? 'main' : 'sub';        // 좌완 원포인트에 우완 — 조금
  return 'main';
}
/** 적성 감점 — 타자 자리 (투수 자리는 STAFF_FIT_PENALTY) */
export const FIT_PENALTY: Record<Fit, number> = { main: 0, any: 0, sub: 1, near: 3, off: 8 };
/** 투수 보직 감점 — 선발 ↔ 불펜이 엇갈리면(near) 크게. 팀 종합 · 카드 숫자 · 경기 엔진(season/rosters) 모두 같은 값 */
export const STAFF_FIT_PENALTY: Record<Fit, number> = { main: 0, any: 0, sub: 2, near: 10, off: 20 };
/** 그 자리 적성 감점 */
export const fitPenalty = (fit: Fit, slot: Slot) => (isBat(slot) ? FIT_PENALTY : STAFF_FIT_PENALTY)[fit];
export const FIT_KO: Record<Fit, string> = { main: '주 포지션', any: '지명', sub: '볼 수 있는 자리', near: '비슷한 자리', off: '적성 밖' };
/** 투수 보직 적성 글 */
export const STAFF_FIT_KO: Record<Fit, string> = { main: '제 보직', any: '제 보직', sub: '보직이 조금 달라요', near: '보직 밖', off: '투수가 아니에요' };

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
// 1군 엔트리(타자 9 · 선발 5 · 불펜 최대 10 · 마무리 1 — 최대 25명) 안에서 같은 구단·같은 연도 카드 수로 단계가 켜진다(5 · 9 · 14 · 20명).
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
  /** 종합 + 강화 + 훈련 + 잠재력 − 적성 */
  base: number;
  /** 받는 잠재력 몫 (자기 + 팀 최고 잠재력) */
  pot: number;
  /** 받는 잠재력 — 앞면 코드별 (선수 시트의 '더해진 값') */
  potFace?: FaceFx;
  /** 받는 보너스 전부 (강화 · 훈련 · 잠재력 · 플레이스타일 · 세트덱 — game/cardBonus) — 카드 숫자 · 능력치 · 엔진이 같이 쓴다 */
  bonus?: CardBonus;
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
  /** 레전드급 인원 (1군 엔트리) — 타자 · 투수 각 LEGEND_MAX 까지 · MVP 는 합쳐 MVP_MAX 까지 */
  legend: { bat: number; pit: number; mvp: number };
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
  /* 잠재력 — 엔트리 카드의 켜진 잠재력 (최고는 팀 타자 · 투수 전원에게) */
  const tp: TeamPot = teamPotential([...bat.map((x) => x.u), ...STAFF_SLOTS.map((s) => U(getSlot(st, s))).filter((u): u is Unit => !!u)]);
  const pf = (u: Unit) => potFaceOf(tp, u.card.id, u.player.pos === 'P');

  /* 세트덱 — 엔트리 20명 */
  const members = entryMembers(st);
  const sets = computeSets(members);
  const exploded = !!sets.dynasty;
  const lead = sets.dynasty ?? sets.active[0] ?? sets.all.find((x) => x.kind !== 'year' && x.code);
  const club = lead?.code ? teamByCode(lead.code) : teamById(ME.teamId);
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
    const bonus = cardBonusOf(u.card, u.player, { potFace: pf(u), set: sp?.cur ?? null });
    const pot = ovrPotOf(bonus, u.player);
    const base = cardOvr(u) + ovrBonusOf(bonus, u.player) - FIT_PENALTY[fit] + (of === 'good' ? 0.5 : of === 'poor' ? -0.5 : 0);
    units[s] = { slot: s, id: u.id, fit, base, pot, potFace: pf(u), bonus, tc, chem: ch, total: base + tc + ch, tcText: setText(sp, false), set: sp, orderIdx: idx, orderFit: of };
  });

  STAFF_SLOTS.forEach((s, i) => {
    const u = U(getSlot(st, s));
    if (!u) return;
    const fit = fits[s]!;
    const injured = !!u.player.injury;
    const sp = setOf(s);
    const bonus = cardBonusOf(u.card, u.player, { potFace: pf(u), set: sp?.cur ?? null });
    const pot = ovrPotOf(bonus, u.player);
    const base = cardOvr(u) + ovrBonusOf(bonus, u.player) - STAFF_FIT_PENALTY[fit] - (injured ? 10 : 0);
    const tc = sp?.cur?.v ?? 0;
    let ch = 0;
    if (s === 'R0') ch = chemOf('P');
    else if (s[0] === 'R') ch = r1((battery[i]?.level ?? 0) * 0.45);
    else if (s === 'B0' || s === 'CL') ch = r1((backdoor?.level ?? 0) * 0.45);
    units[s] = { slot: s, id: u.id, fit, base, pot, potFace: pf(u), bonus, tc, chem: ch, total: base + tc + ch, tcText: setText(sp, true), set: sp, injured };
  });

  /* 팀 종합 — 선발 10명 */
  const starters = [...bat.map(({ s }) => units[s]!), ...(units.R0 ? [units.R0] : [])];
  const raw = mean(starters.map((x) => x.total));
  const baseAvg = mean(starters.map((x) => x.base));
  const tcAvg = mean(starters.map((x) => x.tc));
  const chemAvg = mean(starters.map((x) => x.chem));
  const potRaw = exploded ? raw : mean(starters.map((x) => x.total - x.tc + DYNASTY_V));

  /* 묶음 점수 — 받는 세트의 능력치 칸만큼 */
  // 받는 보너스 전부 (강화 · 훈련 · 잠재력 · 플레이스타일 · 세트덱) — 앞면 코드별 (game/cardBonus)
  const fb = (s: Slot, _isP: boolean): Record<string, number> => units[s]?.bonus?.total ?? {};
  const batPart = mean(bat.map(({ s, u }) => {
    const x = units[s]!;
    const b = fb(s, false);
    return (face(u.player, 'CON') + face(u.player, 'POW') + face(u.player, 'EYE') + (b.CON ?? 0) + (b.POW ?? 0) + (b.EYE ?? 0)) / 3 + x.chem
      + (x.orderFit === 'good' ? 1.5 : x.orderFit === 'poor' ? -1.5 : 0);
  }));
  const defPart = mean(bat.filter(({ s }) => s !== 'DH').map(({ s, u }) => {
    const x = units[s]!;
    const b = fb(s, false);
    const d = s === 'C'
      ? (face(u.player, 'BLK') + face(u.player, 'FRM') + face(u.player, 'CS') + (b.BLK ?? 0) + (b.FRM ?? 0) + (b.CS ?? 0)) / 3
      : (face(u.player, 'DEF') + face(u.player, 'ARM') + (b.DEF ?? 0) + (b.ARM ?? 0)) / 2;
    return d + x.chem - FIT_PENALTY[x.fit] * 1.5;
  }));
  const runPart = mean(bat.map(({ s, u }) => face(u.player, 'SPD') + (fb(s, false).SPD ?? 0)));
  const rot = ROT_SLOTS.slice(1).map((s) => units[s]?.total).filter((v): v is number => v != null);
  const penTop = PEN_SLOTS.map((s) => units[s]?.total).filter((v): v is number => v != null).sort((a, b) => b - a).slice(0, 5);
  const pen = units.CL ? [...penTop, units.CL.total] : penTop;
  const pitPart = 0.5 * (units.R0?.total ?? 60) + 0.3 * (rot.length ? mean(rot) : 60) + 0.2 * (pen.length ? mean(pen) : 60);

  return {
    // 팀 종합은 99 에서 자르지 않는다 — 세트덱 · 강화 · 케미로 100 을 넘길 수 있어야 1군(리그 단계)에 들어간다
    overall: Math.max(1, Math.min(150, Math.round(raw))),
    raw,
    base: clamp99(baseAvg),
    potential: Math.max(1, Math.min(150, Math.round(potRaw))),
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
    legend: legendCount(st),
  };
}

/**
 * 게이지의 '완성하면' 글 — 엔트리 전원이 구단+연도 세트(20명)를 받으면 오를 팀 종합(ev.potential) 앞에 붙는 말.
 * 같은 구단 · 연도 카드를 5명 이상 모으는 중이면 그 세트로('’27 독수리스 6명 더 모으면'), 아니면 '세트덱 완성 시'.
 */
export function potentialLead(ev: Eval): string {
  const ty = ev.sets.filter((x) => x.kind === 'teamYear' && x.code && x.year != null).sort((a, b) => b.have - a.have)[0];
  if (ty && ty.have >= 5 && ty.have < ENTRY_FULL) return `${yearTag(ty.year! % 100)} ${shortLabelOf(ty.code!)} ${ENTRY_FULL - ty.have}명 더 모으면`;
  return '세트덱 완성 시';
}
const ENTRY_FULL = 20;
const shortLabelOf = (code: string) => teamByCode(code as Team['code']).short;

/* ───────── 레전드급 — 1군 엔트리에 타자 2명 · 투수 2명까지 · MVP 는 합쳐 4명까지 ───────── */
export { LEGEND_MAX, MVP_MAX } from '../../game/potential';
const isLeg = (id: string | null | undefined) => !!id && isLegendGrade(unit(id).card.grade);
const isMvp = (id: string | null | undefined) => !!id && isMvpGrade(unit(id).card.grade);
/** 1군 엔트리의 레전드급 · MVP 인원 (타자 = 수비 9자리, 투수 = 선발 · 불펜 · 마무리) */
export function legendCount(st: LineupState) {
  const all: Slot[] = [...BAT_SLOTS, ...STAFF_SLOTS];
  return {
    bat: BAT_SLOTS.filter((s) => isLeg(st.field[s])).length,
    pit: STAFF_SLOTS.filter((s) => isLeg(getSlot(st, s))).length,
    mvp: all.filter((s) => isMvp(getSlot(st, s))).length,
  };
}
/** 바꾸면 레전드급 · MVP 제한을 새로 넘기나 — 넘기면 이유 글 (이미 넘친 라인업은 줄이는 쪽만 허락) */
export function legendBlock(st: LineupState, next: LineupState): string | null {
  const a = legendCount(st);
  const b = legendCount(next);
  if (b.bat > LEGEND_MAX.bat && b.bat > a.bat) return `레전드급 타자는 ${LEGEND_MAX.bat}명까지`;
  if (b.pit > LEGEND_MAX.pit && b.pit > a.pit) return `레전드급 투수는 ${LEGEND_MAX.pit}명까지`;
  if (b.mvp > MVP_MAX && b.mvp > a.mvp) return `MVP 카드는 ${MVP_MAX}명까지`;
  return null;
}
/** 넘친 라인업 맞추기 — 약한 레전드급 · MVP 부터 벤치로 (빈 타자 자리는 sanitize 가 벤치 타자로 채운다) */
function legendFit(st: LineupState): LineupState {
  const n = legendCount(st);
  if (n.bat <= LEGEND_MAX.bat && n.pit <= LEGEND_MAX.pit && n.mvp <= MVP_MAX) return st;
  const nx = clone(st);
  const out: string[] = [];
  const trim = (slots: Slot[], max: number, is: (id: string | null | undefined) => boolean) => {
    const leg = slots.map((s) => ({ s, id: getSlot(nx, s) })).filter((x): x is { s: Slot; id: string } => is(x.id))
      .sort((a, b) => cardOvr(unit(b.id)) - cardOvr(unit(a.id)));
    for (const x of leg.slice(max)) { setSlot(nx, x.s, null); out.push(x.id); }
  };
  trim(BAT_SLOTS, LEGEND_MAX.bat, isLeg);
  trim(STAFF_SLOTS, LEGEND_MAX.pit, isLeg);
  trim([...BAT_SLOTS, ...STAFF_SLOTS], MVP_MAX, isMvp);
  nx.bench = [...out, ...nx.bench.filter((b) => !out.includes(b))].slice(0, 9);
  return nx;
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
  /** 넣을 수 없는 까닭 (레전드급 제한) */
  blocked?: string | null;
}

/** 같은 선수(같은 사람)가 다른 자리에 이미 있나 */
function playerBusy(st: LineupState, slot: Slot, playerId: string) {
  const me = personOfId(playerId);
  for (const s of [...BAT_SLOTS, ...STAFF_SLOTS] as Slot[]) {
    if (s === slot) continue;
    const id = getSlot(st, s);
    if (id && personOfId(unit(id).player.id) === me) return true;
  }
  return false;
}

/** 카드 세기 — 종합 + 강화 · 훈련 · 잠재력(자기) − 부상 (세트덱 · 케미 빼고, 후보를 먼저 추릴 때) */
export function cardPower(u: Unit): number {
  return cardOvr(u) + ovrBonusOf(cardBonusOf(u.card, u.player), u.player) - (u.player.injury ? 10 : 0);
}

/**
 * 가벼운 후보 정보 — 수천 장을 거르고 줄 세울 때(선수 능력치를 만들지 않는다). 실제 선수 카드는 카탈로그에서,
 * 옛 목업 카드는 unit 그대로. 세기(power)는 카드 종합 + 강화 몫(대략) — 정밀 계산은 위쪽 후보만 evaluate/cardPower.
 */
export interface LiteU { id: string; pid: string; pos: Player['pos']; subPos?: Player['subPos']; role?: Player['role']; throws: Player['throws']; code: string; yearKey: string; grade: CardInst['grade']; power: number }
const liteMemo = new Map<string, LiteU>();
let liteVer = -1;
export function liteUnit(id: string): LiteU {
  const v = invVersion();
  if (v !== liteVer) { liteMemo.clear(); liteVer = v; }
  const hit = liteMemo.get(id);
  if (hit) return hit;
  const card = getCard(id)!;
  const l = cardLite(id);
  const enh = enhGainTotal(card.enhance ?? 0);
  const yearKey = card.year != null ? String(fullYear(card.year)) : 'none';
  const out: LiteU = l
    ? { id, pid: l.pid, pos: l.pos, subPos: l.subPos, role: l.role, throws: l.throws, code: teamById(l.teamId).code, yearKey, grade: card.grade, power: (card.ovr ?? l.ovr) + enh }
    : (() => { const u = unit(id); return { id, pid: u.player.id, pos: u.player.pos, subPos: u.player.subPos, role: u.player.role, throws: u.player.throws, code: u.team.code, yearKey, grade: card.grade, power: cardOvr(u) + enh - (u.player.injury ? 10 : 0) }; })();
  liteMemo.set(id, out);
  return out;
}

export interface PoolItem { id: string; src: CandSrc; from?: Slot; l: LiteU }
/** 이 자리에 넣을 수 있는 카드 (벤치 · 보관함 · 맞바꿀 자리) — 계산 없이 목록만 (거르기 칩 · 장수 세기용) */
export function candidatePool(st: LineupState, slot: Slot): PoolItem[] {
  const curId = getSlot(st, slot);
  const wantP = !isBat(slot);
  const pool: { id: string; src: CandSrc; from?: Slot }[] = [
    ...(isBat(slot) ? BAT_SLOTS : STAFF_SLOTS).filter((s) => s !== slot && getSlot(st, s)).map((s) => ({ id: getSlot(st, s)!, src: 'swap' as const, from: s as Slot })),
    ...st.bench.map((id) => ({ id, src: 'bench' as const })),
    ...boxOf(st).map((id) => ({ id, src: 'box' as const })),
  ];
  const seen = new Set<string>();
  const out: PoolItem[] = [];
  for (const c of pool) {
    if (c.id === curId || seen.has(c.id)) continue;
    seen.add(c.id);
    const l = liteUnit(c.id);
    if ((l.pos === 'P') !== wantP) continue;
    if (c.src !== 'swap' && playerBusy(st, slot, l.pid)) continue;
    out.push({ ...c, l });
  }
  return out;
}

/**
 * 바꿀 후보 — 넣으면 팀 종합이 얼마나 되는지 순서로.
 *  filter: 구단 · 연도 거르기 / limit: 카드가 많으면 카드 세기(cardPower − 적성) 높은 순으로 그만큼만 다시 계산 (맞바꿈은 늘 포함)
 */
export function candidates(st: LineupState, slot: Slot, cur: Eval, opt: { filter?: (l: LiteU) => boolean; limit?: number } = {}): Cand[] {
  let pool = candidatePool(st, slot);
  if (opt.filter) pool = pool.filter((c) => opt.filter!(c.l));
  if (opt.limit != null && pool.length > opt.limit) {
    const rank = (c: PoolItem) => c.l.power - fitPenalty(fitOf(c.l, slot), slot);
    const swaps = pool.filter((c) => c.src === 'swap');
    const rest = pool.filter((c) => c.src !== 'swap').sort((a, b) => rank(b) - rank(a)).slice(0, Math.max(0, opt.limit - swaps.length));
    pool = [...swaps, ...rest];
  }
  const out: Cand[] = [];
  const curPit = cur.parts.find((p) => p.k === 'pit')!.v;
  for (const c of pool) {
    const fit = fitOf(c.l, slot);
    const next = place(st, slot, c.id);
    const ev = evaluate(next);
    out.push({ id: c.id, src: c.src, from: c.from, next, ev, fit, delta: ev.overall - cur.overall, pitDelta: ev.parts.find((p) => p.k === 'pit')!.v - curPit, blocked: legendBlock(st, next) });
  }
  return out.sort((a, b) => (Number(!!a.blocked) - Number(!!b.blocked)) || (b.ev.raw - a.ev.raw) || (b.pitDelta - a.pitDelta) || (unit(b.id).player.ovr - unit(a.id).player.ovr));
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
      return { slot: s, cur: getSlot(st, s), next, ev, fit: fitOf(u.player, s), delta: ev.overall - cur.overall, pitDelta: ev.parts.find((p) => p.k === 'pit')!.v - curPit, blocked: legendBlock(st, next) };
    })
    .sort((a, b) => (Number(!!a.blocked) - Number(!!b.blocked)) || (b.ev.raw - a.ev.raw) || (b.pitDelta - a.pitDelta));
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

/** 투수진 비교 점수 — 팀 종합(타자 9 + 1선발, 세트덱 포함)을 먼저, 그다음 투수 묶음(선발 · 불펜 · 마무리) */
const staffScore = (e: Eval) => e.raw * 10 + e.parts.find((p) => p.k === 'pit')!.v;

/** 투수 칸에 놓기 — 다른 투수 칸에 있으면 맞바꾸고, 벤치 · 보관함에서 오면 원래 투수는 보관함으로 (벤치의 타자를 밀어내지 않게) */
function placeStaff(st: LineupState, slot: StaffSlot, id: string): LineupState {
  const cur = getSlot(st, slot);
  if (cur === id) return st;
  const from = slotOf(st, id);
  if (from) return place(st, slot, id);
  const nx = clone(st);
  nx.bench = nx.bench.filter((b) => b !== id);
  setSlot(nx, slot, id);
  return nx;
}

/**
 * 투수진 짜기 — 선발 5(가장 센 선발이 1선발) → 마무리 → 불펜 10 순서로, 보직 적성 + 카드 세기로 고른다.
 * 켜진 세트덱(같은 구단 · 연도)에 드는 카드는 그 단계 가치만큼 더 쳐서 세트가 쉽게 깨지지 않게.
 * 레전드급 투수는 LEGEND_MAX.pit 명까지 · MVP 는 타자와 합쳐 MVP_MAX 명까지 · 같은 사람은 한 번 · 다친 투수는 −10. 결과는 '이렇게 두면 좋다'는 목표 배치.
 */
export function staffPlan(st: LineupState, cur: Eval = evaluate(st)): Partial<Record<StaffSlot, string>> {
  const pool = new Set<string>();
  for (const s of STAFF_SLOTS) { const id = getSlot(st, s); if (id) pool.add(id); }
  for (const id of st.bench) pool.add(id);
  for (const id of boxOf(st)) pool.add(id);
  const batPeople = new Set(BAT_SLOTS.map((s) => st.field[s]).filter(isStr).map((id) => personOfId(liteUnit(id).pid)));
  const setV = (l: LiteU) => {
    const y = l.yearKey === 'none' ? undefined : Number(l.yearKey);
    let v = 0;
    for (const sp of cur.active) {
      const hit = sp.kind === 'teamYear' ? sp.code === l.code && sp.year === y : sp.kind === 'team' ? sp.code === l.code : sp.year === y;
      if (hit) v = Math.max(v, sp.cur?.v ?? 0);
    }
    return v;
  };
  // 투수가 수천 장이어도 — 가벼운 세기로 사람마다 가장 센 카드만 남기고 위쪽 60장, 그 카드들만 정밀 세기(강화 · 훈련 · 잠재력)
  const bestOfPerson = new Map<string, LiteU>();
  for (const id of pool) {
    const l = liteUnit(id);
    if (l.pos !== 'P' || batPeople.has(personOfId(l.pid))) continue;
    const who = personOfId(l.pid);
    const prev = bestOfPerson.get(who);
    if (!prev || l.power + setV(l) * 1.5 > prev.power + setV(prev) * 1.5) bestOfPerson.set(who, l);
  }
  const lineupNow = new Set(STAFF_SLOTS.map((s) => getSlot(st, s)).filter(isStr));
  const pre = [...bestOfPerson.values()].sort((a, b) => (b.power + setV(b) * 1.5) - (a.power + setV(a) * 1.5));
  // 보직마다 위쪽을 따로 남긴다 — 선발 25 · 불펜 30 · 마무리 12 (센 선발만 남아 불펜 칸을 보직 밖으로 채우지 않게) + 지금 투수진
  const quota: Record<string, number> = { SP: 25, RP: 30, CL: 12 };
  const taken0 = new Map<string, number>();
  const shortlist = pre.filter((l) => {
    const r = l.role ?? 'RP';
    const k = taken0.get(r) ?? 0;
    if (k < (quota[r] ?? 20)) { taken0.set(r, k + 1); return true; }
    return lineupNow.has(l.id);
  });
  const cands = shortlist.map((l) => { const u = unit(l.id); return { u, power: cardPower(u) + setV(l) * 1.5, leg: isLegendGrade(u.card.grade), mvp: isMvpGrade(u.card.grade) }; });
  const plan: Partial<Record<StaffSlot, string>> = {};
  const taken = new Set<string>();
  const people = new Set<string>();
  let legLeft = LEGEND_MAX.pit;
  let mvpLeft = MVP_MAX - BAT_SLOTS.filter((s) => isMvp(st.field[s])).length;
  const fill = (slot: StaffSlot) => {
    let best: (typeof cands)[number] | null = null;
    let bv = -Infinity;
    for (const c of cands) {
      if (taken.has(c.u.id) || people.has(personOfId(c.u.player.id)) || (c.leg && legLeft <= 0) || (c.mvp && mvpLeft <= 0)) continue;
      const v = c.power - STAFF_FIT_PENALTY[fitOf(c.u.player, slot)] * 1.5;
      if (v > bv) { bv = v; best = c; }
    }
    if (!best) return;
    plan[slot] = best.u.id;
    taken.add(best.u.id);
    people.add(personOfId(best.u.player.id));
    if (best.leg) legLeft -= 1;
    if (best.mvp) mvpLeft -= 1;
  };
  ROT_SLOTS.forEach(fill);
  fill('CL');
  PEN_SLOTS.forEach(fill);
  return plan;
}

/** 투수진 자동 편성 — 목표 배치(staffPlan)대로 한 칸씩 옮기되, 팀 종합 · 투수 묶음이 나빠지는 한 수는 건너뛴다. 끝까지 나빠지면 그대로 */
export function autoStaff(st: LineupState): LineupState {
  const e0 = evaluate(st);
  const plan = staffPlan(st, e0);
  let cur = st;
  let sc = staffScore(e0);
  for (const slot of STAFF_SLOTS) {
    const want = plan[slot];
    if (!want || getSlot(cur, slot) === want) continue;
    const nx = placeStaff(cur, slot, want);
    if (legendBlock(cur, nx)) continue;
    const v = staffScore(evaluate(nx));
    if (v >= sc - 0.3) { cur = nx; sc = Math.max(sc, v); }
  }
  // 같은 사람이 두 칸에 남았으면(건너뛴 한 수 때문에) 뒤 칸을 비운다
  const seenP = new Set<string>();
  for (const slot of STAFF_SLOTS) {
    const id = getSlot(cur, slot);
    if (!id) continue;
    const who = personOfId(unit(id).player.id);
    if (seenP.has(who)) { const nx = clone(cur); setSlot(nx, slot, null); cur = nx; } else seenP.add(who);
  }
  // 1선발 — 선발 다섯 중 케미까지 따져 팀 종합이 가장 높은 투수를 마운드에
  let best = cur;
  let bv = evaluate(cur).raw;
  for (const s of ROT_SLOTS.slice(1)) {
    const id = getSlot(cur, s);
    if (!id) continue;
    const nx = place(cur, 'R0', id);
    const v = evaluate(nx).raw;
    if (v > bv + 0.05) { best = nx; bv = v; }
  }
  return staffScore(evaluate(best)) >= staffScore(e0) - 0.01 ? best : st;
}

/** 자동 편성 — 타자는 가장 많이 오르는 한 수를 반복 + 추천 타순, 투수진은 보직 · 세기대로(autoStaff).
 *  자리마다 보관함 후보는 처음에 한 번만 추린다(카드 세기 − 적성 상위 12장) — 1만 장이어도 한 수마다 보관함을 다시 훑지 않게.
 *  맞바꿈(다른 수비 자리 선수)은 매번 본다. */
export function autoLineup(st: LineupState): LineupState {
  let cur = st;
  let ce = evaluate(cur);
  const TOP = 12;
  const top = new Map<BatSlot, string[]>();
  for (const slot of BAT_SLOTS) {
    const rank = (c: PoolItem) => c.l.power - fitPenalty(fitOf(c.l, slot), slot);
    top.set(slot, candidatePool(cur, slot).filter((c) => c.src !== 'swap').sort((a, b) => rank(b) - rank(a)).slice(0, TOP).map((c) => c.id));
  }
  for (let it = 0; it < 14; it++) {
    let best: { st: LineupState; sc: number } | null = null;
    const base = score(ce);
    for (const slot of BAT_SLOTS) {
      const cur0 = cur.field[slot];
      const swaps = BAT_SLOTS.filter((x) => x !== slot).map((x) => cur.field[x]).filter(isStr);
      for (const id of [...top.get(slot)!, ...swaps]) {
        if (id === cur0) continue;
        const from = slotOf(cur, id);
        if (from && !isBat(from)) continue;
        if (!from && playerBusy(cur, slot, liteUnit(id).pid)) continue;
        if (liteUnit(id).pos === 'P') continue;
        const next = place(cur, slot, id);
        if (legendBlock(cur, next)) continue;
        const sc = score(evaluate(next));
        if (sc > base + 0.5 && (!best || sc > best.sc)) best = { st: next, sc };
      }
    }
    if (!best) break;
    cur = best.st;
    ce = evaluate(cur);
  }
  cur = autoOrder(cur);
  return autoStaff(cur);
}

/* ───────── 저장 — 보유 카드 저장소(game/inventory)에 같이 둔다: 새로고침해도 유지 ───────── */
const isStr = (x: unknown): x is string => typeof x === 'string';
/**
 * 라인업을 지금 보유 카드에 맞춘다 — 형식이 틀리면 null(처음 라인업으로).
 * 없는 카드 · 같은 카드가 두 자리에 있으면 빼고, 빈 타자 자리는 벤치 타자로만 채운다(보관함 카드는 자동으로 넣지 않는다).
 * 새로 얻은 카드(카드구매 · 조합 · 스카우터)는 보관함으로만 가고, 라인업은 감독이 바꿀 때(교체 시트 · 자동 편성 버튼)만 바뀐다.
 * (라인업 카드는 조합 재료로 마지막 1장을 쓸 수 없게 막혀 있어 보통은 그대로 지나간다)
 */
export function sanitize(raw: LineupState | null | undefined): LineupState | null {
  if (!raw || typeof raw !== 'object' || !raw.field || typeof raw.field !== 'object' || !Array.isArray(raw.order)) return null;
  const have = new Set(owned());
  const seen = new Set<string>();
  const ok = (id: unknown): string | null => {
    if (!isStr(id) || !have.has(id) || seen.has(id)) return null;
    seen.add(id);
    return id;
  };
  const field = Object.fromEntries(BAT_SLOTS.map((s) => [s, ok(raw.field[s])])) as Record<BatSlot, string | null>;
  const order = raw.order.length === 9 && BAT_SLOTS.every((s) => raw.order.includes(s)) ? [...raw.order] : [...BAT_SLOTS];
  const slots = (xs: unknown, n: number) => Array.from({ length: n }, (_, i) => ok(Array.isArray(xs) ? xs[i] : null));
  const rotation = slots(raw.rotation, ROT_SLOTS.length);
  const bullpen = slots(raw.bullpen, PEN_SLOTS.length);
  const closer = ok(raw.closer);
  const bench = (Array.isArray(raw.bench) ? raw.bench : []).map(ok).filter(isStr);
  let st: LineupState = legendFit({ field, order, rotation, bullpen, closer, bench });
  st = { ...st, bench: benchFor(st) };
  for (const s of BAT_SLOTS) {
    if (st.field[s]) continue;
    const cur = st;
    const n = legendCount(cur);
    const full = n.bat >= LEGEND_MAX.bat;
    const mvpFull = n.mvp >= MVP_MAX;
    const pick = cur.bench.find((id) => unit(id).player.pos !== 'P' && !playerBusy(cur, s, unit(id).player.id) && !(full && isLeg(id)) && !(mvpFull && isMvp(id)));
    if (pick) st = place(st, s, pick);
  }
  return st;
}
let cache: { v: number; raw: LineupState | null; st: LineupState | null } | null = null;
export const store = {
  /** 저장된 라인업 (보유 카드에 맞춘 것) — 없으면 null */
  get: (): LineupState | null => {
    const v = invVersion();
    const raw = loadLineup();
    if (cache && cache.v === v && cache.raw === raw) return cache.st;
    const st = sanitize(raw);
    cache = { v, raw, st };
    return st;
  },
  set: (s: LineupState) => { saveLineup(s); },
  clear: () => { saveLineup(null); },
};
