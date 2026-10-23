// 기본 선수단 — 처음 시작할 때 받는 카드: 실제 선수 카탈로그(game/kbo)의 노멀·스페셜 시즌 카드 22장 + 지명 3 + 특별 선수 1.
//  · 팀 종합(라인업 게이지)이 65~68 이 되게 기본 카드를 고른다 (특별 선수·지명 선수가 세면 기본 카드는 낮은 종합 쪽으로).
//  · 처음엔 어떤 세트덱도 켜지지 않게: 기본 카드는 내 구단을 빼고 9개 구단에 고루(구단당 3명 이하), 연도는 최근 세 시즌('24·'25·'26)을
//    섞어 한 해 8명 이하. 같은 인물은 한 장만.
//  · 지명 후보 = 내 구단의 최근 세 시즌 젊은 선수 8명(현재 구단) · 옛 구단은 우승·황금기 시즌의 주축 8명 — 지명 카드는 그 선수의 그 시즌 카드.
//  · 이 기기에 실제 선수 카탈로그 전의 저장(보유 카드 형식 v1)이 있으면 '레거시' 선수단(game/legacy/starter — 가상 선수)을 그대로 쓴다.
//    구단을 다시 고르거나(개막) 다시 창단하면 실제 선수 선수단으로 바뀐다. 레거시 카드는 계속 보유·사용할 수 있다.
//  · 저장: 시작 설정(구단·지명·특별 선수)은 club-select 가 localStorage 'bb.start'(+ 'bb.special') 에 둔다. 여기서는 읽기만.
import { CARDS, LINEUP, MY_CARD_IDS, PLAYERS, leagueIdsFor, teamById } from './mock';
import { clubTitles } from './clubSeasons';
import { ALL_CLUBS, eraOfCode } from './world';
import { cardInst, currentRoster, kboRoster, seasonCardOf } from './kbo';
import { LAST_REAL_SEASON, seasonRoster } from './history';
import {
  BASE, BASE_YEARS, BAT_ORDER, PICKED, STARTER_TARGET, assembleLineup, hashStr, legacyBuildStarter, legacyDraftPool, legacyDraftYearOf,
  readStart, synthPlayer, upsertCard, upsertPlayer, type StartPicks, type Starter, type StarterLineup,
} from './legacy/starter';
import type { CardInst, ClubCode, GradeId, PitcherRole, Player, Pos } from './types';

export { STARTER_TARGET, synthPlayer, readStart };
export type { StartPicks, Starter, StarterLineup };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ───────── 선수단 종류 (레거시 · 실제 선수) ───────── */
export type StarterKind = 'legacy' | 'kbo';
const KIND_KEY = 'bb.starterKind';
/** 이 기기의 시작 선수단 종류 — 정해 두지 않았고 옛 형식(v1) 보유 카드 저장이 있으면 레거시 */
export function starterKind(): StarterKind {
  try {
    const k = localStorage.getItem(KIND_KEY);
    if (k === 'legacy' || k === 'kbo') return k;
    const raw = localStorage.getItem('bb.inv');
    if (raw) {
      const v = JSON.parse(raw) as { v?: unknown };
      if (v && v.v === 1) { localStorage.setItem(KIND_KEY, 'legacy'); return 'legacy'; }
    }
  } catch { /* 저장이 막혀 있으면 실제 선수 */ }
  return 'kbo';
}
export function setStarterKind(k: StarterKind) {
  try { localStorage.setItem(KIND_KEY, k); } catch { /* 이번 방문만 */ }
}

/* ───────── 지명 후보 ───────── */
type Tmpl = { pos: Pos; role?: PitcherRole; ovr: number };
const DRAFT_TEMPLATE: Tmpl[] = [
  { pos: 'P', role: 'SP', ovr: 76 }, { pos: 'SS', ovr: 75 }, { pos: 'CF', ovr: 74 }, { pos: 'P', role: 'CL', ovr: 74 },
  { pos: 'C', ovr: 72 }, { pos: '3B', ovr: 73 }, { pos: 'RF', ovr: 72 }, { pos: 'P', role: 'RP', ovr: 70 },
];
/** 레거시 지명 카드 등급 (가상 선수) */
export const DRAFT_GRADE: GradeId = 'special';
export const DRAFT_YEARS = [27, 26, 25];
/** 지명 카드 연도(2자리) — 실제 선수는 그 시즌, 레거시는 지명 순서대로 */
export const draftYearOf = (p: Player, i: number) => (p.real ? p.real.year % 100 : legacyDraftYearOf(p, i));
/** 지명 카드 — 실제 선수는 그 선수의 그 시즌 카드 */
export function pickCardOf(p: Player): CardInst | undefined {
  if (!p.real) return undefined;
  const c = seasonCardOf(p.real.kid, p.real.year);
  return c ? cardInst(c) : undefined;
}
/** 지명 카드 등급 */
export const draftGradeOf = (p: Player): GradeId => pickCardOf(p)?.grade ?? DRAFT_GRADE;

const fitPos = (p: Player, t: Tmpl) => (t.pos === 'P' ? p.pos === 'P' && (p.role ?? 'RP') === (t.role ?? 'RP') : p.pos === t.pos);
const fitGroup = (p: Player, t: Tmpl) => (t.pos === 'P' ? p.pos === 'P' : p.pos !== 'P' && (['LF', 'CF', 'RF'].includes(t.pos) === ['LF', 'CF', 'RF'].includes(p.pos)));

/** 고르기 — 자리가 맞는 사람 중 목표 종합에 가까운 사람 (같은 인물 한 번) */
function choose(cands: Player[], t: Tmpl, used: Set<string>, score = (p: Player) => -Math.abs(p.ovr - t.ovr)): Player | undefined {
  for (const fit of [fitPos, fitGroup, () => true]) {
    const xs = cands.filter((p) => p.real && !used.has(p.real.kid) && fit(p, t)).sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
    if (xs[0]) return xs[0];
  }
  return undefined;
}

/** 지명 후보 8명 — 현재 구단은 최근 세 시즌의 젊은 선수(만 27세 이하 우선), 옛 구단은 우승·황금기 시즌의 주축 */
function kboDraft(teamId: string): Player[] {
  const team = teamById(teamId);
  const code = team.code as ClubCode;
  const used = new Set<string>();
  const out: Player[] = [];
  if (team.old) {
    const club = ALL_CLUBS.find((c) => c.code === code)!;
    const [from, to] = eraOfCode(code);
    const pref = [...clubTitles(code), ...(club.goldenEras as readonly { legendSeason: number }[]).map((e) => e.legendSeason)].sort((a, b) => b - a);
    const years: number[] = [];
    for (const y of pref) if (y >= from && y <= to && !years.includes(y)) years.push(y);
    for (let y = to; y >= from; y--) if (!years.includes(y)) years.push(y);
    DRAFT_TEMPLATE.forEach((t, i) => {
      // 종합 64~79 유망주 먼저, 그 구단 시절 선수가 모자라면 범위 밖에서도
      for (const inRange of [true, false]) {
        for (let k = 0; k < years.length; k++) {
          const y = years[(i + k) % years.length];
          const p = choose(kboRoster(code, y).filter((x) => !inRange || (x.ovr >= 64 && x.ovr <= 79)), t, used, (x) => -Math.abs(x.ovr - t.ovr) - (fitPos(x, t) ? 0 : 50));
          if (p) { used.add(p.real!.kid); out.push(p); return; }
        }
      }
    });
  } else {
    const last = LAST_REAL_SEASON;
    // 지금 그 구단 선수(최근 세 시즌 중 마지막 시즌을 그 구단에서 보낸 사람) 중 유망주 — 종합 64~78 (엘리트·레어급 스타는 지명 후보에 넣지 않음)
    const all = currentRoster(code, last);
    const cands = all.filter((p) => p.ovr >= 64 && p.ovr <= 78);
    DRAFT_TEMPLATE.forEach((t) => {
      const sc = (x: Player) => -Math.abs(x.ovr - t.ovr) - Math.max(0, x.age - 27) * 2 + (x.real!.year === last ? 1 : 0);
      const p = choose(cands, t, used, sc) ?? choose(all, t, used, sc);
      if (p) { used.add(p.real!.kid); out.push(p); }
    });
  }
  return out.sort((a, b) => b.ovr - a.ovr);
}

const draftCache = new Map<string, Player[]>();
/** 그 구단 지명 후보 8명 (구단 선택 · 개막) */
export function draftPool(teamId: string): Player[] {
  const hit = draftCache.get(teamId);
  if (hit) return hit;
  let out = kboDraft(teamId);
  if (out.length < 3) out = legacyDraftPool(teamId); // 카탈로그에 그 구단 선수가 거의 없을 때 (수집 전 자료)
  draftCache.set(teamId, out);
  return out;
}

/* ───────── 실제 선수 기본 선수단 ───────── */
function kboBuildStarter(st: StartPicks): Starter {
  const myClub = st.club;
  const others = leagueIdsFor(myClub).filter((id) => id !== myClub).map((id) => teamById(id));
  const order = others.slice().sort((a, b) => hashStr(`club:${myClub}:${a.id}`) - hashStr(`club:${myClub}:${b.id}`));
  const special = st.special ?? PLAYERS.find((p) => p.id === 'p41')!;
  const specialCard: CardInst = st.special
    ? { id: 'c-special', playerId: special.id, grade: 'unique', level: 1, enhance: 0, dup: 0 }
    : CARDS.find((c) => c.id === 'c46')!;
  const pool = draftPool(myClub);
  const picks = st.picks.map((id) => pool.find((p) => p.id === id)).filter((p): p is Player => !!p);
  const pickCards: CardInst[] = picks.map((p, i) => pickCardOf(p) ?? { id: `kd-${p.id}`, playerId: p.id, grade: DRAFT_GRADE, year: legacyDraftYearOf(p, i), level: 1, enhance: 0, dup: 0 });
  PICKED.clear();
  pickCards.forEach((c) => PICKED.add(c.id));

  // 고정 선수 몫 → 기본 카드 수준 L (레거시와 같은 식)
  const fixedBat = [...picks, special].filter((p) => p.pos !== 'P');
  const fixedSP = [...picks, special].filter((p) => p.pos === 'P' && p.role === 'SP').sort((a, b) => b.ovr - a.ovr);
  const batTaken = new Set<string>();
  let fixedSum = 0;
  for (const p of fixedBat.sort((a, b) => b.ovr - a.ovr)) {
    const slot = BAT_ORDER.includes(p.pos as Exclude<Pos, 'P'>) && !batTaken.has(p.pos) ? p.pos : !batTaken.has('DH') ? 'DH' : null;
    if (!slot) continue;
    batTaken.add(slot); fixedSum += p.ovr;
  }
  const r0Fixed = fixedSP[0];
  if (r0Fixed) fixedSum += r0Fixed.ovr;
  const baseStarters = BASE.filter((b) => (b.pos !== 'P' && !b.sub && b.off > -4 && !batTaken.has(b.pos)) || (!r0Fixed && b.pos === 'P' && b.role === 'SP' && b.off === 2));
  const offSum = baseStarters.reduce((a, b) => a + b.off, 0);
  const CHEM = 0.35;
  const level = clamp((STARTER_TARGET * 10 - CHEM * 10 - fixedSum - offSum) / (baseStarters.length || 1), 54, 72);

  // 기본 22장 — 다른 9개 구단의 최근 세 시즌(옛 구단은 그 이름의 마지막 세 시즌) 노멀·스페셜 카드 중
  //   자리가 맞고 목표 종합(수준 L + 자리 오프셋)에 가장 가까운 것. 구단당 3장 · 한 해 8장 · 같은 인물 1장까지.
  const used = new Set<string>(picks.map((p) => p.real?.kid ?? p.id));
  const players: Player[] = [];
  const cards: CardInst[] = [];
  const perClub = new Map<string, number>();
  const perYear = new Map<number, number>();
  const cand: { p: Player; code: string; y: number; grade: GradeId }[] = [];
  for (const team of order) {
    const code = team.code as ClubCode;
    const [, to] = eraOfCode(code);
    const last = Math.min(to, LAST_REAL_SEASON);
    for (const y of [last, last - 1, last - 2]) {
      for (const p of kboRoster(code, y)) {
        const c = seasonCardOf(p.real!.kid, y);
        if (c && (c.grade === 'normal' || c.grade === 'special')) cand.push({ p, code, y, grade: c.grade });
      }
    }
  }
  const fitPenalty = (p: Player, b: (typeof BASE)[number]) => {
    if (b.pos === 'P') return p.pos !== 'P' ? 99 : (p.role ?? 'RP') === (b.role ?? 'RP') ? 0 : 4;
    if (p.pos === 'P') return 99;
    if (p.pos === b.pos || b.sub?.includes(p.pos)) return 0;
    const of = (x: string) => ['LF', 'CF', 'RF'].includes(x);
    return b.pos === 'DH' ? 2 : of(p.pos) === of(b.pos) && p.pos !== 'C' && b.pos !== 'C' ? 3 : 9;
  };
  BASE.forEach((b, i) => {
    const want: GradeId = b.special ? 'special' : 'normal';
    const target = level + b.off;
    const pref = order[i % order.length].code;
    let best: (typeof cand)[number] | undefined, bestS = -Infinity;
    for (const x of cand) {
      if (used.has(x.p.real!.kid) || (perClub.get(x.code) ?? 0) >= 3 || (perYear.get(x.y) ?? 0) >= 8) continue;
      const sc = -Math.abs(x.p.ovr - target) - fitPenalty(x.p, b) - (x.grade === want ? 0 : 1) - (x.code === pref ? 0 : 0.5);
      if (sc > bestS || (sc === bestS && best && x.p.id < best.p.id)) { best = x; bestS = sc; }
    }
    if (!best || bestS < -40) return;
    used.add(best.p.real!.kid);
    perClub.set(best.code, (perClub.get(best.code) ?? 0) + 1);
    perYear.set(best.y, (perYear.get(best.y) ?? 0) + 1);
    const c = seasonCardOf(best.p.real!.kid, best.y)!;
    players.push(best.p);
    cards.push({ ...cardInst(c), level: 1 + Math.round(hashStr(`lv:${c.id}`) % 300) / 100 });
  });
  // 모자라면(수집 전 자료) 가상 선수로 채운다
  while (cards.length < BASE.length) {
    const b = BASE[cards.length];
    const id = `s-${myClub}-k${String(cards.length + 1).padStart(2, '0')}`;
    const p = synthPlayer({ id, teamId: order[cards.length % order.length].id, pos: b.pos, role: b.role, sub: b.sub, ovr: Math.round(level + b.off), seed: `kstarter:${id}` });
    upsertPlayer(p);
    players.push(p);
    cards.push({ id: `k-${myClub}-k${String(cards.length + 1).padStart(2, '0')}`, playerId: id, grade: b.special ? 'special' : 'normal', year: BASE_YEARS[cards.length], level: 1, enhance: 0, dup: 0 });
  }
  if (st.special) upsertPlayer(special);
  for (const c of [...cards, ...pickCards, ...(st.special ? [specialCard] : [])]) upsertCard(c);

  const all = [
    { p: special, c: specialCard },
    ...picks.map((p, i) => ({ p, c: pickCards[i] })),
    ...players.map((p, i) => ({ p, c: cards[i] })),
  ];
  return { key: '', club: myClub, cards: all.map(({ c }) => c.id), lineup: assembleLineup(all), level };
}

let current: Starter | null = null;
/**
 * 기본 선수단을 (다시) 만든다 — 시작 설정이 바뀌었으면 새로. 공용 목업 MY_CARD_IDS · LINEUP 도 이 선수단으로 바꾼다.
 * 실제 내 카드 · 라인업은 game/inventory 가 처음 한 번 이 선수단으로 채운 뒤 저장해 둔 것을 쓴다.
 */
export function ensureStarter(): Starter {
  const st = readStart();
  const kind = starterKind();
  const key = JSON.stringify([kind, st.club, st.picks, st.special?.id ?? '', st.special?.name ?? '', st.special?.pos ?? '']);
  if (current && current.key === key) return current;
  const s = kind === 'legacy' ? legacyBuildStarter(st) : kboBuildStarter(st);
  s.key = key;
  current = s;
  MY_CARD_IDS.splice(0, MY_CARD_IDS.length, ...s.cards);
  LINEUP.name = '개막 라인업';
  LINEUP.batting = s.lineup.batting;
  LINEUP.sp = s.lineup.rotation[0] ?? '';
  LINEUP.rotation = s.lineup.rotation.filter((x): x is string => !!x);
  LINEUP.bullpen = s.lineup.bullpen.filter((x): x is string => !!x);
  LINEUP.closer = s.lineup.closer ?? '';
  LINEUP.bench = s.lineup.bench;
  return s;
}
/** 지금 기본 선수단 (없으면 만든다) */
export const starter = (): Starter => current ?? ensureStarter();
/** 시작 설정이 바뀐 뒤(구단 선택 '개막') 다시 만들기 */
export function resetStarter() { current = null; return ensureStarter(); }
/**
 * 레거시 카드 다시 만들기 — 저장된 보유 카드에 레거시 선수단 카드('k-구단-NN' · 'kd-…')가 있으면 그때의 시작 설정으로 한 번 등록한다.
 * (지금 선수단이 실제 선수여도 옛 카드가 보이고 쓰이게)
 */
const legacyDone = new Set<string>();
export function registerLegacyStarter(st: StartPicks) {
  const key = JSON.stringify([st.club, st.picks, st.special?.id ?? '']);
  if (legacyDone.has(key)) return;
  legacyDone.add(key);
  legacyBuildStarter(st);
}
export { seasonRoster };
