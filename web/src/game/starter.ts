// 기본 선수단 — 처음 시작할 때 받는 카드: 여러 구단·연도의 노멀·스페셜 22장 + 지명 3 + 특별 선수 1.
//  · 팀 종합(라인업 게이지)이 65~68 이 되게 기본 카드의 종합을 맞춘다 (특별 선수·지명 선수가 세면 기본 카드가 낮아짐)
//  · 처음엔 어떤 세트덱도 켜지지 않게: 기본 카드는 내 구단을 빼고 9개 구단에 고루(엔트리에 구단당 3명 이하),
//    연도는 ’25·’26·’27 을 섞어 한 해 8명 이하. 지명 3명은 내 구단이지만 연도가 모두 달라(’27·’26·’25) 구단+연도 세트가 안 생기고,
//    특별 선수까지 내 구단 4명이라 구단 세트(5명)도 아직 — 한 명만 더 모으면 열린다.
//  · 저장: 시작 설정(구단·지명·특별 선수)은 club-select 가 localStorage 'bb.start'(+ 'bb.special') 에 둔다. 여기서는 읽기만.
import { CARDS, LINEUP, ME, MY_CARD_IDS, PLAYERS, TEAMS, registerPlayers } from './mock';
import type { BatSide, CardInst, GradeId, Hand, PitcherRole, Player, Pos } from './types';

/* ───────── 시드 난수 ───────── */
function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed: string) {
  let a = hashStr(seed) || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 처음 팀 종합 목표 (65~68 가운데) */
export const STARTER_TARGET = 66.5;

/* ───────── 이름 ───────── */
const SURNAMES = ['남궁', '독고', '황보', '선우', '사공', '서문', '편', '탁', '용', '반', '기', '금', '옥', '소', '길', '방', '모', '피', '승', '빈', '위', '엄', '여', '국', '맹', '인', '설', '봉', '석', '진', '구', '도', '은', '연', '하', '추', '마', '채', '육', '함'];
const GIVEN = ['하진', '도윤', '시우', '지후', '은찬', '태윤', '건후', '서준', '민결', '유찬', '라온', '다겸', '해람', '이안', '우빈', '재희', '윤재', '한솔', '태하', '지운', '로운', '시헌', '다율', '온유', '규빈', '서진', '무결', '찬솔', '이든', '해온', '도겸', '라율', '주원', '하람', '윤슬', '태오'];

/* ───────── 지명 후보 (구단마다 8명 — 유망주, 종합 70~76) ───────── */
const DRAFT_NAMES: Record<string, string[]> = {
  dj: ['경다온', '함로운', '빙하담', '묵시안', '견도율', '사공태이', '감이솔', '단새온'],
  gj: ['곽해찬', '도윤슬', '명가람', '범라온', '소다인', '채누리', '추하율', '탄무진'],
  dg: ['강마루', '계한솔', '마도겸', '봉이든', '변시우', '엽서강', '온유찬', '종태윤'],
  bs: ['강해솔', '나도헌', '류시온', '부지환', '서문결', '연다빈', '하태율', '형민결'],
  sb: ['곽은찬', '남궁이안', '마하준', '반지오', '복태림', '선우람', '안도경', '예서준'],
  st: ['감리안', '공태하', '동방윤', '묘시헌', '변하늘', '상도윤', '신다율', '왕이결'],
  sh: ['권새율', '길태오', '도은결', '매로아', '석가람', '어도현', '육시원', '진하온'],
  ic: ['갈태호', '경이안', '단우진', '모하람', '섭다온', '엄시후', '펠릭스 오르다', '팽도율'],
  cw: ['국도한', '기라온', '금태산', '담서후', '명지안', '봉도하', '순태겸', '여울찬'],
  sw: ['견이수', '계도람', '마시헌', '반하율', '설윤찬', '편도경', '하라온', '은새결'],
};
type Tmpl = { pos: Pos; role?: PitcherRole; ovr: number };
const DRAFT_TEMPLATE: Tmpl[] = [
  { pos: 'P', role: 'SP', ovr: 76 }, { pos: 'SS', ovr: 75 }, { pos: 'CF', ovr: 74 }, { pos: 'P', role: 'CL', ovr: 74 },
  { pos: 'C', ovr: 72 }, { pos: '3B', ovr: 73 }, { pos: 'RF', ovr: 72 }, { pos: 'P', role: 'RP', ovr: 70 },
];
/** 지명 카드 — 스페셜, 연도는 지명 순서대로 ’27 · ’26 · ’25 (같은 해가 안 겹쳐 구단+연도 세트가 안 생김) */
export const DRAFT_GRADE: GradeId = 'special';
export const DRAFT_YEARS = [27, 26, 25];

/* ───────── 선수 만들기 — 같은 자리 목업 선수를 본으로 능력치를 옮긴다 ───────── */
const templates = (pos: Pos, role?: PitcherRole) => {
  const base = PLAYERS.filter((p) => p.id !== 'p41' && /^p\d+$/.test(p.id) && p.pos === pos && (pos !== 'P' || (p.role ?? 'RP') === (role ?? 'RP')));
  return base.length ? base : PLAYERS.filter((p) => /^p\d+$/.test(p.id) && (pos === 'P' ? p.pos === 'P' : p.pos !== 'P'));
};

function scaled(tpl: Player, ovr: number, o: { id: string; name: string; teamId: string; number: number; seed: string; pos: Pos; role?: PitcherRole; subPos?: Pos[] }): Player {
  const r = rng(o.seed);
  const d = ovr - tpl.ovr;
  const v = (x: number, k = 1) => clamp(Math.round(x + d * k + (r() - 0.5) * 6), 25, 97);
  const isP = o.pos === 'P';
  const throws: Hand = isP ? (r() < 0.3 ? 'L' : 'R') : (['C', 'SS', '2B', '3B'].includes(o.pos) ? 'R' : r() < 0.15 ? 'L' : 'R');
  const bats: BatSide = isP ? throws : r() < 0.32 ? 'L' : r() < 0.06 ? 'S' : 'R';
  const attrs = Object.fromEntries(Object.entries(tpl.attrs).map(([k, x]) => [k, typeof x === 'number' ? (/Tend$/.test(k) ? x : v(x)) : x])) as Player['attrs'];
  const k = Math.max(0.55, Math.min(1.1, 1 + d / 60));
  const bat = tpl.season.bat;
  const pit = tpl.season.pit;
  return {
    ...tpl,
    id: o.id,
    name: o.name,
    nameEn: undefined,
    teamId: o.teamId,
    number: o.number,
    pos: o.pos,
    role: isP ? o.role ?? 'RP' : undefined,
    subPos: o.subPos ?? tpl.subPos,
    bats, throws,
    age: 21 + Math.floor(r() * 13),
    heightCm: 172 + Math.round(r() * 18),
    weightKg: 70 + Math.round(r() * 26),
    origin: 'KR',
    draftYear: 2012 + Math.floor(r() * 14),
    ovr,
    face: tpl.face.map((f) => ({ ...f, v: v(f.v) })),
    attrs,
    pitches: tpl.pitches?.map((p) => ({ ...p, stuff: v(p.stuff), command: v(p.command), kmh: Math.round(p.kmh + d * 0.25) })),
    potential: clamp(Math.round((2 + r() * 2.5) * 2) / 2, 1.5, 4.5),
    traits: [],
    look: `look:${o.id}`,
    injury: undefined,
    condition: (2 + Math.floor(r() * 3)) as Player['condition'],
    fatigue: Math.round(r() * 30),
    season: {
      bat: bat ? {
        ...bat,
        h: Math.round(bat.h * k), hr: Math.round(bat.hr * k * k), rbi: Math.round(bat.rbi * k), r: Math.round(bat.r * k), sb: Math.round(bat.sb * k), bb: Math.round(bat.bb * k),
        so: Math.round(bat.so / k), d2: Math.round(bat.d2 * k), d3: Math.round(bat.d3 * k),
        avg: Math.round(bat.avg * (0.82 + 0.18 * k) * 1000) / 1000, obp: Math.round(bat.obp * (0.85 + 0.15 * k) * 1000) / 1000,
        slg: Math.round(bat.slg * (0.75 + 0.25 * k) * 1000) / 1000,
        ops: 0,
      } : undefined,
      pit: pit ? {
        ...pit,
        w: Math.round(pit.w * k), l: Math.round(pit.l / k), so: Math.round(pit.so * k), sv: Math.round(pit.sv * k), hld: Math.round(pit.hld * k),
        era: Math.round(pit.era / Math.pow(k, 1.6) * 100) / 100, whip: Math.round(pit.whip / Math.pow(k, 0.8) * 100) / 100,
      } : undefined,
    },
  };
}
const fixOps = (p: Player) => { if (p.season.bat) p.season.bat.ops = Math.round((p.season.bat.obp + p.season.bat.slg) * 1000) / 1000; return p; };

const draftCache = new Map<string, Player[]>();
/** 그 구단 지명 후보 8명 — 유망주(종합 70~76), 실제 목업 스타는 넣지 않는다 */
export function draftPool(teamId: string): Player[] {
  const hit = draftCache.get(teamId);
  if (hit) return hit;
  const names = DRAFT_NAMES[teamId] ?? DRAFT_NAMES.dj;
  const out = DRAFT_TEMPLATE.map((t, i) => {
    const tpl = templates(t.pos, t.role)[hashStr(`${teamId}:${i}`) % templates(t.pos, t.role).length];
    return fixOps(scaled(tpl, t.ovr + (hashStr(`d:${teamId}:${i}`) % 3) - 1, {
      id: `d-${teamId}-${i}`, name: names[i % names.length], teamId, number: 10 + (hashStr(`no:${teamId}:${i}`) % 80),
      seed: `draft:${teamId}:${i}`, pos: t.pos, role: t.role,
    }));
  }).sort((a, b) => b.ovr - a.ovr);
  registerPlayers(out);
  draftCache.set(teamId, out);
  return out;
}

/* ───────── 기본 22장 ───────── */
interface BaseSpec { pos: Pos; role?: PitcherRole; sub?: Pos[]; off: number; special?: boolean }
const BASE: BaseSpec[] = [
  { pos: 'C', off: 0 }, { pos: '1B', off: 1 }, { pos: '2B', off: 0, special: true }, { pos: '3B', off: 1 }, { pos: 'SS', off: 0 },
  { pos: 'LF', off: 0 }, { pos: 'CF', off: 1, special: true }, { pos: 'RF', off: 0 }, { pos: 'DH', off: 2, special: true },
  { pos: 'C', off: -4 }, { pos: '2B', sub: ['SS', '3B'], off: -3 }, { pos: 'LF', sub: ['RF', 'CF'], off: -3 },
  { pos: 'P', role: 'SP', off: 2, special: true }, { pos: 'P', role: 'SP', off: 1 }, { pos: 'P', role: 'SP', off: 0 }, { pos: 'P', role: 'SP', off: -1 }, { pos: 'P', role: 'SP', off: -2 },
  { pos: 'P', role: 'RP', off: 0, special: true }, { pos: 'P', role: 'RP', off: -1 }, { pos: 'P', role: 'RP', off: -2 }, { pos: 'P', role: 'RP', off: -3 },
  { pos: 'P', role: 'CL', off: 1, special: true },
];
/** 연도 — 한 해 8명 이하가 되게 고루 */
const BASE_YEARS = [27, 26, 25, 26, 27, 25, 27, 26, 25, 26, 27, 25, 25, 27, 26, 27, 25, 26, 26, 25, 27, 25];

/* ───────── 시작 설정 읽기 ───────── */
export interface StartPicks { club: string; picks: string[]; special: Player | null }
function readStart(): StartPicks {
  let club = ME.teamId, picks: string[] = [], special: Player | null = null;
  try {
    const raw = localStorage.getItem('bb.start');
    if (raw) {
      const v = JSON.parse(raw) as { club?: string; picks?: unknown };
      if (v.club && TEAMS.some((t) => t.id === v.club)) club = v.club;
      if (Array.isArray(v.picks)) picks = v.picks.filter((x): x is string => typeof x === 'string').slice(0, 3);
    }
    const sp = localStorage.getItem('bb.special');
    if (sp) { const p = JSON.parse(sp) as Player; if (p && p.id && p.name && Array.isArray(p.face)) special = p; }
  } catch { /* 저장이 막혀 있으면 기본값 */ }
  return { club, picks, special };
}

export interface StarterLineup {
  batting: { order: number; pos: Exclude<Pos, 'P'>; cardId: string }[];
  rotation: (string | null)[];
  bullpen: (string | null)[];
  closer: string | null;
  bench: string[];
}
export interface Starter { key: string; club: string; cards: string[]; lineup: StarterLineup; level: number }

const BAT_ORDER: Exclude<Pos, 'P'>[] = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];

function buildStarter(st: StartPicks): Starter {
  const myClub = st.club;
  const others = TEAMS.filter((t) => t.id !== myClub);
  // 구단 배정 — 시드로 섞은 9개 구단을 돌아가며 (엔트리에 구단당 3명 이하)
  const order = others.slice().sort((a, b) => hashStr(`club:${myClub}:${a.id}`) - hashStr(`club:${myClub}:${b.id}`));
  // 고정 선수 (특별 · 지명)
  const special = st.special ?? PLAYERS.find((p) => p.id === 'p41')!;
  const specialCard: CardInst = st.special
    ? { id: 'c-special', playerId: special.id, grade: 'unique', level: 1, enhance: 0, dup: 0 }
    : CARDS.find((c) => c.id === 'c46')!;
  const pool = draftPool(myClub);
  const picks = st.picks.map((id) => pool.find((p) => p.id === id)).filter((p): p is Player => !!p);
  const pickCards: CardInst[] = picks.map((p, i) => ({ id: `kd-${p.id}`, playerId: p.id, grade: DRAFT_GRADE, year: DRAFT_YEARS[i] ?? 25, level: 1, enhance: 0, dup: 0 }));

  // 선발 10명(타자 9 + 1선발) 중 고정 선수 몫 → 기본 카드 수준 L 을 맞춘다
  const fixedBat = [...picks, special].filter((p) => p.pos !== 'P');
  const fixedSP = [...picks, special].filter((p) => p.pos === 'P' && p.role === 'SP').sort((a, b) => b.ovr - a.ovr);
  const batTaken = new Set<string>();
  let fixedSum = 0, fixedN = 0;
  for (const p of fixedBat.sort((a, b) => b.ovr - a.ovr)) {
    const slot = BAT_ORDER.includes(p.pos as Exclude<Pos, 'P'>) && !batTaken.has(p.pos) ? p.pos : !batTaken.has('DH') ? 'DH' : null;
    if (!slot) continue;
    batTaken.add(slot); fixedSum += p.ovr; fixedN++;
  }
  const r0Fixed = fixedSP[0];
  if (r0Fixed) { fixedSum += r0Fixed.ovr; fixedN++; }
  // 기본 카드가 맡는 선발 자리의 오프셋 합
  const baseStarters = BASE.map((b, i) => ({ b, i })).filter(({ b }) => (b.pos !== 'P' && !b.sub && b.off > -4 && !batTaken.has(b.pos)) || (!r0Fixed && b.pos === 'P' && b.role === 'SP' && b.off === 2));
  const offSum = baseStarters.reduce((a, x) => a + x.b.off, 0);
  const nBase = baseStarters.length || 1;
  const CHEM = 0.35; // 섞인 선수단의 평균 케미(대략)
  const level = clamp((STARTER_TARGET * 10 - CHEM * 10 - fixedSum - offSum) / nBase, 54, 72);

  // 기본 22장
  const usedNames = new Set(PLAYERS.map((p) => p.name));
  const players: Player[] = [];
  const cards: CardInst[] = [];
  BASE.forEach((b, i) => {
    const team = order[i % order.length];
    const tpls = templates(b.pos, b.role);
    const tpl = tpls[hashStr(`tpl:${myClub}:${i}`) % tpls.length];
    let name = '';
    for (let k = 0; k < 12 && (!name || usedNames.has(name)); k++) {
      const h = hashStr(`name:${myClub}:${i}:${k}`);
      name = SURNAMES[h % SURNAMES.length] + GIVEN[(h >>> 8) % GIVEN.length];
    }
    usedNames.add(name);
    const ovr = Math.round(level + b.off);
    const id = `s-${myClub}-${String(i + 1).padStart(2, '0')}`;
    const p = fixOps(scaled(tpl, ovr, { id, name, teamId: team.id, number: 2 + (hashStr(`no:${id}`) % 96), seed: `starter:${id}`, pos: b.pos, role: b.role, subPos: b.sub }));
    players.push(p);
    cards.push({ id: `k-${myClub}-${String(i + 1).padStart(2, '0')}`, playerId: id, grade: b.special ? 'special' : 'normal', year: BASE_YEARS[i], level: 1 + Math.round(hashStr(`lv:${id}`) % 300) / 100, enhance: 0, dup: 0 });
  });
  // 등록 (같은 id 가 이미 있으면 그대로)
  // 등록 — 같은 id 가 이미 있으면 내용만 바꿔 끼운다 (특별 선수 설정·지명 순서가 바뀐 경우)
  for (const p of [...players, ...(st.special ? [special] : [])]) upsertPlayer(p);
  for (const c of [...cards, ...pickCards, ...(st.special ? [specialCard] : [])]) upsertCard(c);

  // 라인업 — 고정 선수 먼저, 나머지 자리는 기본 카드
  const all = [
    ...[special].map((p) => ({ p, c: specialCard })),
    ...picks.map((p, i) => ({ p, c: pickCards[i] })),
    ...players.map((p, i) => ({ p, c: cards[i] })),
  ];
  const used = new Set<string>();
  const batting: StarterLineup['batting'] = [];
  const fixed = (c: CardInst) => c.grade === 'unique' || c.id.startsWith('kd-');
  for (const slot of BAT_ORDER) {
    const free = all.filter(({ p, c }) => !used.has(c.id) && p.pos !== 'P');
    let pick: (typeof all)[number] | undefined;
    if (slot !== 'DH') {
      pick = free.filter(({ p }) => p.pos === slot).sort((a, b) => Number(fixed(b.c)) - Number(fixed(a.c)) || b.p.ovr - a.p.ovr)[0];
    } else {
      // 지명타자 — 자리를 못 잡은 지명·특별 선수 먼저, 없으면 기본 지명타자
      pick = free.filter(({ c }) => fixed(c)).sort((a, b) => b.p.ovr - a.p.ovr)[0]
        ?? free.filter(({ p }) => p.pos === 'DH')[0]
        ?? free.sort((a, b) => b.p.ovr - a.p.ovr)[0];
    }
    if (pick) { used.add(pick.c.id); batting.push({ order: 0, pos: slot, cardId: pick.c.id }); }
  }
  // 타순 — 종합 순으로 대충 (라인업 화면에서 추천 타순으로 다시 짤 수 있음)
  const byOvr = batting.slice().sort((a, b) => ovrOf(b.cardId, all) - ovrOf(a.cardId, all));
  const orderIdx = [3, 2, 4, 0, 1, 5, 6, 7, 8];
  byOvr.forEach((b, i) => { b.order = (orderIdx[i] ?? i) + 1; });
  batting.sort((a, b) => a.order - b.order);
  const pitchers = all.filter(({ p, c }) => !used.has(c.id) && p.pos === 'P');
  const sps = pitchers.filter(({ p }) => p.role === 'SP').sort((a, b) => b.p.ovr - a.p.ovr);
  const rotation: (string | null)[] = sps.slice(0, 5).map(({ c }) => c.id);
  rotation.forEach((id) => id && used.add(id));
  const cl = pitchers.filter(({ p, c }) => !used.has(c.id) && p.role === 'CL').sort((a, b) => b.p.ovr - a.p.ovr)[0];
  if (cl) used.add(cl.c.id);
  const rps = pitchers.filter(({ c }) => !used.has(c.id)).sort((a, b) => b.p.ovr - a.p.ovr);
  const bullpen: (string | null)[] = rps.slice(0, 5).map(({ c }) => c.id);
  bullpen.forEach((id) => id && used.add(id));
  while (rotation.length < 5) rotation.push(null);
  while (bullpen.length < 5) bullpen.push(null);
  const bench = all.filter(({ c }) => !used.has(c.id)).map(({ c }) => c.id);
  const lineup: StarterLineup = { batting, rotation, bullpen, closer: cl?.c.id ?? null, bench };
  return { key: '', club: myClub, cards: all.map(({ c }) => c.id), lineup, level };
}
const ovrOf = (id: string, all: { p: Player; c: CardInst }[]) => all.find((x) => x.c.id === id)?.p.ovr ?? 0;
function upsertPlayer(p: Player) {
  const ex = PLAYERS.find((x) => x.id === p.id);
  if (ex) { if (ex !== p) Object.assign(ex, p); return; }
  PLAYERS.push(p);
  registerPlayers([p]);
}
function upsertCard(c: CardInst) {
  const ex = CARDS.find((x) => x.id === c.id);
  if (ex) { if (ex !== c) Object.assign(ex, c); return; }
  CARDS.push(c);
  registerPlayers([], [c]);
}

/**
 * 가상 선수 한 명 — 같은 자리 목업 선수를 본으로 종합 ovr 에 맞춰 만든다 (시즌 AI 구단 선수단 등).
 * 같은 seed 면 늘 같은 선수. 이름이 겹치지 않게 usedNames 를 넘기면 거기에 더한다.
 */
export function synthPlayer(o: { id: string; teamId: string; pos: Pos; role?: PitcherRole; sub?: Pos[]; ovr: number; seed: string; usedNames?: Set<string> }): Player {
  const tpls = templates(o.pos, o.role);
  const tpl = tpls[hashStr(`tpl:${o.seed}`) % tpls.length];
  const used = o.usedNames ?? new Set(PLAYERS.map((p) => p.name));
  let name = '';
  for (let k = 0; k < 16 && (!name || used.has(name)); k++) {
    const h = hashStr(`name:${o.seed}:${k}`);
    name = SURNAMES[h % SURNAMES.length] + GIVEN[(h >>> 8) % GIVEN.length];
  }
  used.add(name);
  const p = fixOps(scaled(tpl, o.ovr, { id: o.id, name, teamId: o.teamId, number: 2 + (hashStr(`no:${o.id}`) % 96), seed: o.seed, pos: o.pos, role: o.role, subPos: o.sub }));
  return p;
}

let current: Starter | null = null;
/**
 * 기본 선수단을 (다시) 만든다 — 시작 설정이 바뀌었으면 새로. 공용 목업 MY_CARD_IDS · LINEUP 도 이 선수단으로 바꾼다.
 * 앱이 처음 뜰 때(App) 한 번, 구단 선택 '개막' 뒤에 한 번 부른다.
 */
export function ensureStarter(): Starter {
  const st = readStart();
  const key = JSON.stringify([st.club, st.picks, st.special?.id ?? '', st.special?.name ?? '', st.special?.pos ?? '']);
  if (current && current.key === key) return current;
  const s = buildStarter(st);
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
