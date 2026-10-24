// 실제 선수 카탈로그 — 실제 KBO 기록(출처: 나무위키, CC BY-NC-SA 2.0 KR)을 바뀐 이름 · 고정 ID 로 옮긴 값.
// 데이터: game/data/kbo/core.json (tools/kbo/build_kbo.py 가 만든다 — 손으로 고치지 않는다). 규칙: docs/실제선수데이터.md
//
//  두 층으로 나눈다 — 선수 정보는 한 번만, 카드는 ID 로 참조만
//   ① 선수 본체(KPerson): 고정 ID(k + 6자리) · 바뀐 이름 · 생년 · 투타 · 팔 각도 · 체격 · 포지션 + 카드가 생기는 시즌 목록
//      (시즌 = 연도 · 구단 코드 · 그 해 종합 · 등급 · 능력치 8/6칸 · 그 해 기록 요약)
//   ② 카드 종류(KCard): 선수 ID + 시즌(또는 상징 등급은 연도 없음) + 등급 + 구단 코드 + 카드 종합 + 능력치를 가져올 시즌.
//      시즌 카드 id = `{선수 ID}-{연도}{n|s|r|e}` · 수상 `{선수 ID}-{연도}mvp|gg|th-{부문}` · 상징 `{선수 ID}-lg|fr|bk|sg`
//   화면·엔진이 쓰는 Player 는 (선수 ID, 시즌) 마다 그때그때 만드는 '보기'다 — id `{선수 ID}~{연도}`. 저장하지 않는다.
//   연도별 상세 기록(구단별 줄 · WAR)은 rec-<0~f>.json 에 선수 ID 앞자리별로 나뉘어 있어, 선수 정보 '실제 기록' 탭에서만 불러온다.
import coreJson from './data/kbo/core.json';
import { defaultWeather } from './weatherFit';
import { registerResolver } from './mock';
import { POS_KO } from './labels';
import type { AttrKey, AttrMap, BatSide, BattingLine, CardInst, ClubCode, GradeId, Hand, Origin, Pitch, PitcherRole, PitchType, PitchingLine, Player, Pos, SignaturePitch } from './types';

/* ───────── 원자료 모양 ───────── */
type SeasonRow = (number | string | null)[];
type PersonRow = [string, number | null, string, number, number, number | null, number | null, number | null, string, string[], SeasonRow[]];
type CardRow = [string, GradeId, number | null, string, number, number, string | null, number | null, number | null];
interface Core { v: number; src: string; persons: Record<string, PersonRow>; cards: CardRow[] }
const CORE = coreJson as unknown as Core;

/** 기록 출처 (화면 아래 작게) */
export const KBO_SOURCE = CORE.src;
export const KBO_SOURCE_NOTE = `실제 시즌 기록 출처: ${CORE.src} · 선수 이름은 바꿔 표기`;

export interface KSeason {
  year: number;
  code: ClubCode;
  ovr: number;
  /** 0 노멀 · 1 스페셜 · 2 레어 · 3 엘리트 */
  grade: number;
  pos: Pos;
  role?: PitcherRole;
  age: number;
  /** 타자: 컨택 · 파워 · 갭 · 선구 · 삼진 회피 · 스피드 · 수비 · 어깨 / 투수: 구속 · 구위 · 변화 · 제구 · 체력 · 위기관리 */
  r: number[];
  bat?: BattingLine;
  pit?: PitchingLine;
}
export interface KPerson {
  id: string;
  name: string;
  birth: number | null;
  throws: Hand;
  bats: BatSide;
  /** 0 오버·스리쿼터 · 1 사이드암 · 2 언더핸드 */
  arm: number;
  foreign: boolean;
  heightCm: number | null;
  weightKg: number | null;
  entry: number | null;
  pos: Pos | 'P';
  sub: Pos[];
  seasons: KSeason[];
}
export interface KCard {
  id: string;
  kid: string;
  grade: GradeId;
  /** 카드 연도 (4자리) — 상징 카드(프랜차이즈·블랙·시그니처)는 없음, 레전드는 황금기 시즌 */
  year?: number;
  code: ClubCode;
  ovr: number;
  /** 능력치를 가져온 시즌 */
  view: number;
  /** 수상 부문 (GG 포지션 · TH 부문 코드) */
  sub?: string;
  /** 그 구단 계보에서 뛴 해 */
  span?: [number, number];
}

const SEASON_GRADES: GradeId[] = ['normal', 'special', 'rare', 'elite'];
const SEASON_LETTER = 'nsre';
const ROLES = new Set(['SP', 'RP', 'CL']);
const ICON_SUF: Partial<Record<GradeId, string>> = { legend: 'lg', franchise: 'fr', black: 'bk', signature: 'sg' };

function seasonOf(row: SeasonRow): KSeason {
  const [year, code, ovr, grade, pr, age, ...rest] = row as [number, string, number, number, string, number, ...(number | null)[]];
  const isP = ROLES.has(pr);
  const n = isP ? 6 : 8;
  const r = rest.slice(0, n).map((x) => x ?? 50);
  const L = rest.slice(n);
  const v = (i: number) => (L[i] ?? 0) as number;
  const s: KSeason = { year, code: code as ClubCode, ovr, grade, pos: (isP ? 'P' : pr) as Pos, role: isP ? (pr as PitcherRole) : undefined, age, r };
  if (isP) {
    const outs = v(6);
    s.pit = {
      g: v(0), gs: L[1] ?? (s.role === 'SP' ? v(0) : 0), w: v(2), l: v(3), sv: v(4), hld: v(5),
      ip: Math.floor(outs / 3) + (outs % 3) / 10, h: v(7), hr: v(8), bb: v(9), so: v(10),
      era: L[11] ?? 0, whip: L[12] ?? 0,
    };
  } else {
    const avg = v(12) / 1000, obp = v(13) / 1000, slg = v(14) / 1000;
    s.bat = {
      g: v(0), pa: v(1), ab: v(2), h: v(3), d2: v(4), d3: v(5), hr: v(6), rbi: v(7), r: v(8), sb: v(9), bb: v(10), so: v(11),
      avg, obp, slg, ops: Math.round((obp + slg) * 1000) / 1000,
    };
  }
  return s;
}

/* ───────── 읽기 (한 번) ───────── */
const persons = new Map<string, KPerson>();
for (const [id, row] of Object.entries(CORE.persons)) {
  const [name, birth, h, arm, fo, ht, wt, entry, pos, sub, seasons] = row;
  persons.set(id, {
    id, name, birth, throws: (h[0] === 'L' ? 'L' : 'R') as Hand, bats: (h[1] === 'L' ? 'L' : h[1] === 'S' ? 'S' : 'R') as BatSide,
    arm, foreign: fo === 1, heightCm: ht, weightKg: wt, entry, pos: pos as Pos, sub: (sub ?? []) as Pos[],
    seasons: seasons.map(seasonOf),
  });
}
const seasonCardId = (kid: string, s: KSeason) => `${kid}-${s.year}${SEASON_LETTER[s.grade]}`;
const AWARD_TH: Record<string, string> = {
  W: '다승왕', HR: '홈런왕', AVG: '타격왕', RBI: '타점왕', ERA: '평균자책왕', SO: '탈삼진왕', SV: '세이브왕', SB: '도루왕',
  H: '최다안타', R: '득점왕', OBP: '출루율왕', SLG: '장타율왕', WPCT: '승률왕', HLD: '홀드왕',
};
const GG_KO: Record<string, string> = { P: '투수', C: '포수', '1B': '1루수', '2B': '2루수', '3B': '3루수', SS: '유격수', OF: '외야수', DH: '지명타자' };
/** 카드에 쓰는 수상 이름 ('홈런왕' · '유격수') */
export const awardLabel = (c: KCard) => (c.grade === 'th' ? AWARD_TH[c.sub ?? ''] ?? '타이틀' : c.grade === 'gg' ? GG_KO[c.sub ?? ''] ?? '' : undefined);

const cards: KCard[] = [];
const cardMap = new Map<string, KCard>();
const cardsByPerson = new Map<string, KCard[]>();
const add = (c: KCard) => {
  cards.push(c);
  cardMap.set(c.id, c);
  const l = cardsByPerson.get(c.kid) ?? [];
  l.push(c);
  cardsByPerson.set(c.kid, l);
};
for (const p of persons.values()) {
  for (const s of p.seasons) add({ id: seasonCardId(p.id, s), kid: p.id, grade: SEASON_GRADES[s.grade], year: s.year, code: s.code, ovr: s.ovr, view: s.year });
}
for (const [kid, g, y, code, ovr, view, sub, a, b] of CORE.cards) {
  if (!persons.has(kid)) continue;
  const id = ICON_SUF[g] ? `${kid}-${ICON_SUF[g]}` : `${kid}-${y}${g}${g === 'th' ? `-${(sub ?? '').toLowerCase()}` : ''}`;
  add({ id, kid, grade: g, year: y ?? undefined, code: code as ClubCode, ovr, view, sub: sub ?? undefined, span: a != null && b != null ? [a, b] : undefined });
}

/* ───────── 찾기 ───────── */
export const kboPerson = (kid: string) => persons.get(kid);
export const kboPersons = () => [...persons.values()];
export const kboCards = (): readonly KCard[] => cards;
export const kboCard = (id: string) => cardMap.get(id);
export const kboCardsOf = (kid: string): readonly KCard[] => cardsByPerson.get(kid) ?? [];
/** 실제 선수 카드 id 인가 */
export const isKboCardId = (id: string) => cardMap.has(id);
/** 선수 보기 id `{선수 ID}~{연도}` → [선수 ID, 연도] */
export function parseViewId(id: string): [string, number] | null {
  const m = /^(k[0-9a-f]{6,8})~(\d{4})$/.exec(id);
  return m ? [m[1], Number(m[2])] : null;
}
export const viewIdOf = (kid: string, year: number) => `${kid}~${year}`;
/** 선수 보기 id · 카드 id → 선수 ID (실제 선수가 아니면 null) */
export function personIdOf(id: string): string | null {
  const v = parseViewId(id);
  if (v) return v[0];
  const c = cardMap.get(id);
  return c ? c.kid : null;
}
export const seasonOfPerson = (p: KPerson, year: number) => p.seasons.find((s) => s.year === year);
/** 그 시즌 시즌 카드 (등급은 그 해 성적으로 정해져 있어 하나) */
export function seasonCardOf(kid: string, year: number): KCard | undefined {
  const p = persons.get(kid);
  const s = p && seasonOfPerson(p, year);
  return s ? cardMap.get(seasonCardId(kid, s)) : undefined;
}

/* ───────── 해시 (결정적) ───────── */
function h32(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const u01 = (s: string) => h32(s) / 4294967296;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const R = (v: number) => clamp(Math.round(v), 15, 99);

/* ───────── 능력치 → 상세 능력치 (docs/실제선수데이터.md 4절) ───────── */
const DEF_KEYS: Record<string, [AttrKey, number][]> = {
  C: [['block', 0.4], ['framing', 0.3], ['armStr', 0.3]],
  '1B': [['hands', 0.5], ['range', 0.3], ['firstStep', 0.2]],
  '2B': [['range', 0.3], ['firstStep', 0.25], ['hands', 0.2], ['turnDP', 0.25]],
  '3B': [['firstStep', 0.35], ['hands', 0.3], ['armStr', 0.35]],
  SS: [['range', 0.35], ['firstStep', 0.25], ['hands', 0.2], ['armStr', 0.2]],
  LF: [['range', 0.5], ['firstStep', 0.3], ['hands', 0.2]],
  CF: [['range', 0.5], ['firstStep', 0.35], ['hands', 0.15]],
  RF: [['range', 0.4], ['firstStep', 0.25], ['armStr', 0.35]],
};
const wsum = (a: AttrMap, parts: [AttrKey, number][]) => Math.round(parts.reduce((s, [k, x]) => s + (a[k] ?? 50) * x, 0));
const VELO_OFF: Record<PitchType, number> = { FF: 0, SI: -2, FC: -5, SL: -12, SW: -16, CU: -22, CH: -14, FS: -10, KN: -36 };
const PITCH_KO: Record<PitchType, string> = { FF: '포심', SI: '투심', FC: '커터', SL: '슬라이더', SW: '스위퍼', CU: '커브', CH: '체인지업', FS: '포크', KN: '너클볼' };

function repertoire(p: KPerson, s: KSeason): [PitchType, number][] {
  const [vel, stf, brk, ctl] = s.r;
  if (p.arm === 2) return [['SI', 0.42], ['CU', 0.22], ['SL', 0.2], ['CH', 0.16]];
  if (p.arm === 1) return [['SI', 0.46], ['SL', 0.34], ['CH', 0.2]];
  if (s.role !== 'SP') return vel >= stf ? [['FF', 0.6], ['FS', 0.4]] : [['FF', 0.55], ['SL', 0.45]];
  if (ctl >= vel + 4) return [['FF', 0.36], ['CH', 0.24], ['CU', 0.18], ['FC', 0.22]];
  if (brk >= stf) return [['FF', 0.42], ['SL', 0.22], ['CU', 0.16], ['CH', 0.2]];
  return [['FF', 0.5], ['SL', 0.3], ['FS', 0.2]];
}

function buildAttrs(p: KPerson, s: KSeason): { attrs: AttrMap; pitches?: Pitch[] } {
  const a: AttrMap = {};
  const n = (k: string, sd = 4) => (u01(`${p.id}:${s.year}:${k}`) - 0.5) * 2 * sd;
  const lvl = s.ovr - 1;
  if (s.pos === 'P') {
    const [vel, stf, brk, ctl, sta, mnt] = s.r;
    a.velocity = R(vel); a.control = R(ctl); a.deception = R((stf + brk) / 2 + (p.arm ? 4 : 0) + n('dec'));
    a.extension = R(vel - 2 + n('ext')); a.stamina = R(sta); a.recovery = R((s.role === 'SP' ? 50 : 62) + (lvl - 60) * 0.4 + n('rec'));
    a.pickoff = R(50 + (p.throws === 'L' ? 8 : 0) + n('pk', 8)); a.slideStep = R(52 + n('ss', 8)); a.pFielding = R(50 + (lvl - 60) * 0.3 + n('pf', 6));
    a.gbTend = clamp(Math.round(50 + (p.arm ? 18 : 0) + (ctl - stf) * 0.4 + n('gb', 8)), 10, 95);
    a.composure = R(mnt); a.concentration = R(mnt - 2 + n('con')); a.competitiveness = R(lvl - 6 + n('cmp', 6));
    const v = vel;
    const pitches = repertoire(p, s).map(([t, u], i) => ({
      type: t, ko: PITCH_KO[t],
      stuff: R((t === 'FF' || t === 'SI' ? stf : brk) + (i === 0 ? 0 : -2) + n(`st${i}`)),
      command: R(ctl + n(`cm${i}`) - (t === 'CU' || t === 'KN' ? 3 : 0)),
      usage: u,
      kmh: Math.round(118 + 0.36 * v + VELO_OFF[t] * 0.85 + n(`kmh${i}`, 1.5) - (p.arm === 2 ? 10 : p.arm === 1 ? 4 : 0)),
    }));
    a.leadership = R(lvl - 10 + Math.min(10, (s.age - 24)) + n('ld', 6)); a.teamwork = R(lvl - 6 + n('tw', 6)); a.baseballIQ = R(lvl - 4 + n('iq', 5));
    a.durability = R(50 + (sta - 50) * 0.5 + n('du', 6)); a.agility = R(lvl - 8 + n('ag', 6)); a.strength = R(vel - 4 + n('sg', 6));
    return { attrs: a, pitches };
  }
  const [con, pow, gap, eye, avk, spd, dfn, arm] = s.r;
  const plat = p.bats === 'L' ? [3, -5] : p.bats === 'R' ? [-2, 3] : [0, 0];
  a.contactR = R(con + plat[0] + n('cr', 2)); a.contactL = R(con + plat[1] + n('cl', 2));
  a.power = R(pow); a.gap = R(gap); a.eye = R(eye); a.avoidK = R(avk);
  a.vsFast = R((con + pow) / 2 + n('vf')); a.vsBreak = R((con + eye) / 2 + n('vb')); a.bunt = R((con + spd) / 2 - 6 + n('bu', 6));
  a.speed = R(spd); a.baserunning = R(spd - 2 + n('br')); a.stealJump = R(spd + n('sj', 5)); a.sliding = R(spd - 4 + n('sl'));
  a.range = R(dfn + (spd - 60) * 0.2 + n('ra')); a.firstStep = R(dfn + n('fs')); a.hands = R(dfn + n('ha'));
  a.armStr = R(arm); a.armAcc = R((arm + dfn) / 2 + n('aa')); a.turnDP = R(dfn - (s.pos === '2B' || s.pos === 'SS' ? 0 : 8) + n('dp'));
  if (s.pos === 'C') { a.block = R(dfn + n('bk')); a.framing = R(dfn - 2 + n('fr', 6)); a.popTime = R((arm + dfn) / 2 + n('pt')); a.pitcherLead = R(dfn + n('pl', 6)); }
  a.pullTend = clamp(Math.round(50 + (pow - 60) * 0.8 + n('pull', 10)), 10, 95);
  a.launchTend = clamp(Math.round(50 + (pow - 60) * 1.0 + n('la', 10)), 10, 95);
  a.swingTend = clamp(Math.round(50 + (avk < 55 ? 8 : -4) - (eye - 60) * 0.4 + n('sw', 10)), 10, 95);
  a.composure = R(lvl - 8 + n('co', 6)); a.concentration = R((con + eye) / 2 - 6 + n('cc', 6)); a.competitiveness = R(lvl - 6 + n('cp', 6));
  a.leadership = R(lvl - 10 + Math.min(10, (s.age - 24)) + n('ld', 6)); a.teamwork = R(lvl - 6 + n('tw', 6)); a.baseballIQ = R((eye + dfn) / 2 - 4 + n('iq', 5));
  a.durability = R(50 + Math.min(20, ((s.bat?.g ?? 60) - 60) * 0.3) + n('du', 6)); a.agility = R((spd + dfn) / 2 + n('ag', 5)); a.strength = R(pow - 2 + n('sg', 6));
  return { attrs: a };
}

function faceOf(p: KPerson, s: KSeason, a: AttrMap, pitches?: Pitch[]): Player['face'] {
  if (s.pos === 'P') {
    const ps = pitches ?? [];
    const best = Math.max(...ps.map((x) => x.stuff), 40);
    const brk = ps.filter((x) => !['FF', 'SI', 'FC'].includes(x.type)).map((x) => x.stuff).sort((x, y) => y - x);
    const brkV = brk.length >= 2 ? Math.round((brk[0] + brk[1]) / 2) : brk.length === 1 ? Math.round(brk[0] * 0.85 + 10) : 50;
    const cmd = ps.reduce((t, x) => t + x.command * x.usage, 0);
    const base = [
      { code: 'VEL', ko: '구속', v: a.velocity ?? 50 }, { code: 'STF', ko: '구위', v: best }, { code: 'BRK', ko: '변화', v: brkV },
      { code: 'CTL', ko: '제구', v: Math.round(0.6 * (a.control ?? 50) + 0.4 * cmd) },
    ];
    const mnt = { code: 'MNT', ko: '위기관리', v: wsum(a, [['composure', 0.5], ['concentration', 0.3], ['baseballIQ', 0.2]]) };
    return s.role === 'SP' ? [...base, { code: 'STA', ko: '체력', v: a.stamina ?? 50 }, mnt] : [...base, { code: 'REC', ko: '회복', v: a.recovery ?? 50 }, mnt];
  }
  const CON = { code: 'CON', ko: '컨택', v: wsum(a, [['contactR', 0.7], ['contactL', 0.3]]) };
  const POW = { code: 'POW', ko: '파워', v: wsum(a, [['power', 0.8], ['gap', 0.2]]) };
  const EYE = { code: 'EYE', ko: '선구', v: wsum(a, [['eye', 0.7], ['avoidK', 0.3]]) };
  const SPD = { code: 'SPD', ko: '주루', v: wsum(a, [['speed', 0.7], ['baserunning', 0.2], ['stealJump', 0.1]]) };
  if (s.pos === 'C') return [CON, POW, EYE, { code: 'BLK', ko: '블로킹', v: a.block ?? 50 }, { code: 'FRM', ko: '프레이밍', v: wsum(a, [['framing', 0.75], ['pitcherLead', 0.25]]) }, { code: 'CS', ko: '도루저지', v: wsum(a, [['popTime', 0.6], ['armStr', 0.4]]) }];
  if (s.pos === 'DH') return [CON, POW, EYE, { code: 'GAP', ko: '장타', v: wsum(a, [['gap', 0.6], ['power', 0.4]]) }, { code: 'ADJ', ko: '대처', v: wsum(a, [['vsFast', 0.5], ['vsBreak', 0.5]]) }, SPD];
  return [CON, POW, EYE, SPD, { code: 'DEF', ko: '수비', v: wsum(a, DEF_KEYS[s.pos] ?? DEF_KEYS.LF) }, { code: 'ARM', ko: '송구', v: wsum(a, [['armStr', 0.7], ['armAcc', 0.3]]) }];
}

const ORIGINS: Origin[] = ['US', 'US', 'USB', 'LATAM', 'LATAM', 'AU'];
const LINEAGE: string[][] = [['DDG', 'SB'], ['MDH', 'GJ'], ['HBE', 'DJ'], ['SCR', 'ST'], ['ISB', 'IJR', 'IDR', 'SUC'], ['IBY', 'IC'], ['JDR'], ['DG'], ['BS'], ['SH'], ['CW'], ['SW']];
const lineOf = (code: string) => LINEAGE.findIndex((l) => l.includes(code));

/** 그 구단 계보에서 뛴 해 [첫 해, 끝 해] */
export function spanIn(p: KPerson, code: string): [number, number] {
  const ln = lineOf(code);
  const ys = p.seasons.filter((s) => lineOf(s.code) === ln).map((s) => s.year);
  return ys.length ? [Math.min(...ys), Math.max(...ys)] : [p.seasons[0]?.year ?? 2000, p.seasons[p.seasons.length - 1]?.year ?? 2000];
}

const viewCache = new Map<string, Player>();
/** (선수 ID, 시즌) → 화면·엔진용 Player (같은 입력 → 같은 값, 저장하지 않음) */
export function viewPlayer(kid: string, year: number): Player | undefined {
  const id = viewIdOf(kid, year);
  const hit = viewCache.get(id);
  if (hit) return hit;
  const p = persons.get(kid);
  const s = p && seasonOfPerson(p, year);
  if (!p || !s) return undefined;
  const { attrs, pitches } = buildAttrs(p, s);
  const face = faceOf(p, s, attrs, pitches);
  const sub = p.sub.filter((x) => x !== s.pos && x !== 'P');
  const age = s.age || (p.birth ? year - p.birth : 28);
  const pl: Player = {
    id, name: p.name, teamId: s.code.toLowerCase(), number: 1 + (h32(`no:${kid}`) % 99),
    pos: s.pos, role: s.role, subPos: sub.length ? sub : undefined,
    bats: p.bats, throws: p.throws, age,
    heightCm: p.heightCm ?? 176 + Math.round(u01(`ht:${kid}`) * 12), weightKg: p.weightKg ?? 76 + Math.round(u01(`wt:${kid}`) * 18),
    origin: p.foreign ? ORIGINS[h32(`or:${kid}`) % ORIGINS.length] : 'KR',
    draftYear: p.entry ?? p.seasons[0]?.year ?? year,
    career: spanIn(p, s.code),
    ovr: s.ovr, face, attrs, pitches,
    potential: clamp(Math.round((age <= 22 ? 4.5 : age <= 25 ? 4 : age <= 28 ? 3.5 : age <= 32 ? 3 : 2.5) * 2) / 2, 1.5, 5),
    traits: [], personality: '균형형', weather: defaultWeather(kid), form: {},
    look: `look:${kid}`,
    season: { bat: s.bat, pit: s.pit },
    condition: 3, fatigue: 0,
    real: { kid, year },
  };
  viewCache.set(id, pl);
  return pl;
}

const SIG_COLORS = ['#7FE3D4', '#FFB547', '#6EC1FF', '#FF6B4A', '#B48CFF', '#7CE38B', '#FF4FA3', '#FFD84F'];
const SIG_ALIAS: [string, PitchType][] = [['폭포수 커브', 'CU'], ['고속 슬라이더', 'SL'], ['돌직구', 'FF'], ['뱀직구', 'SI'], ['백도어 슬라이더', 'SL'], ['고속 포크', 'FS']];
const RARE_PLUS = new Set<GradeId>(['rare', 'elite', 'legend', 'franchise', 'black', 'signature', 'mvp', 'gg', 'th']);
/** 레어 이상 투수 카드의 고유 구종 (선수 ID 로 정해져 늘 같다) */
function signatureOf(c: KCard): SignaturePitch | undefined {
  if (!RARE_PLUS.has(c.grade)) return undefined;
  const p = viewPlayer(c.kid, c.view);
  if (!p || p.pos !== 'P') return undefined;
  const hv = h32(`sig:${c.kid}`);
  const color = SIG_COLORS[hv % SIG_COLORS.length];
  const pitches = (p.pitches ?? []).filter((x) => x.type !== 'FF').sort((a, b) => b.stuff - a.stuff);
  if (hv % 3 === 0 || !pitches.length) {
    const [name, base] = SIG_ALIAS[hv % SIG_ALIAS.length];
    return { name, base, style: 'alias', effect: '등급이 높을수록 위력 ↑', color };
  }
  const given = p.name.includes(' ') ? p.name.split(' ').pop()! : p.name.slice(-2);
  return { name: `${given} ${PITCH_KO[pitches[0].type]}`, base: pitches[0].type, style: 'initials', effect: '이름을 딴 고유 구종 · 등급이 높을수록 위력 ↑', color };
}

/** 카드 종류 → 게임 카드 (CardInst) — 연도는 2자리 (상징 카드 중 연도가 붙는 것은 없음, 레전드는 황금기 연도를 카드 정보로만) */
export function cardInst(c: KCard): CardInst {
  return {
    id: c.id, playerId: viewIdOf(c.kid, c.view), grade: c.grade,
    year: c.year != null && c.grade !== 'legend' && c.grade !== 'franchise' && c.grade !== 'black' && c.grade !== 'signature' ? c.year % 100 : undefined,
    level: 1, enhance: 0, dup: 0, ovr: c.ovr, award: awardLabel(c), signaturePitch: signatureOf(c),
  };
}
/** 카드의 Player — 카드 종합(등급 보정)·상징 카드의 계보 기간을 반영한 보기 */
/** 가벼운 카드 정보 — 목록 거르기 · 정렬용. 선수 능력치(viewPlayer)를 만들지 않아 수천 장이어도 빠르다 (playerOfKCard 와 같은 값) */
export interface CardLite {
  name: string; ovr: number; teamId: string; pos: Pos | 'P';
  /** 선수 보기 id (같은 사람 · 적성 판단용) */
  pid: string; role?: PitcherRole; throws: Hand; subPos?: Pos[];
}
const liteCache = new Map<string, CardLite | null>();
export function cardLite(cardId: string): CardLite | undefined {
  const hit = liteCache.get(cardId);
  if (hit !== undefined) return hit ?? undefined;
  const c = cardMap.get(cardId);
  const p = c && persons.get(c.kid);
  const s = p && c && seasonOfPerson(p, c.view);
  const sub = p && s ? p.sub.filter((x) => x !== s.pos && x !== 'P') : [];
  const out: CardLite | null = c && p && s
    ? { name: p.name, ovr: c.ovr, teamId: (c.span ? c.code : s.code).toLowerCase(), pos: s.pos, pid: viewIdOf(c.kid, c.view), role: s.role, throws: p.throws, subPos: sub.length ? sub : undefined }
    : null;
  liteCache.set(cardId, out);
  return out ?? undefined;
}

export function playerOfKCard(c: KCard): Player | undefined {
  const base = viewPlayer(c.kid, c.view);
  if (!base) return undefined;
  if (!c.span && c.ovr === base.ovr) return base;
  return { ...base, ovr: c.ovr, ...(c.span ? { career: c.span, teamId: c.code.toLowerCase() } : {}) };
}

// 공용 찾기(mock.playerById · cardById)에 실제 선수를 잇는다 — 미리 다 만들지 않고 찾을 때 만든다
registerResolver({
  player: (id) => { const v = parseViewId(id); return v ? viewPlayer(v[0], v[1]) : undefined; },
  card: (id) => { const c = cardMap.get(id); return c ? cardInst(c) : undefined; },
});

/* ───────── 선수단 · 풀 ───────── */
const rosterCache = new Map<string, Player[]>();
/** 그 해 그 구단(가상 코드) 선수 — 카드가 있는 시즌만 (종합 높은 순) */
export function kboRoster(code: string, year: number): Player[] {
  const key = `${code}:${year}`;
  const hit = rosterCache.get(key);
  if (hit) return hit;
  const out: Player[] = [];
  for (const p of persons.values()) {
    const s = seasonOfPerson(p, year);
    if (s && s.code === code) { const v = viewPlayer(p.id, year); if (v) out.push(v); }
  }
  out.sort((a, b) => b.ovr - a.ovr || a.id.localeCompare(b.id));
  rosterCache.set(key, out);
  return out;
}
const currentCache = new Map<string, Player[]>();
/**
 * 그 구단 '지금' 선수단 — 최근 세 시즌(upTo−2 ~ upTo) 안에 뛴 선수 중 마지막 시즌을 그 구단에서 보낸 사람, 그 마지막 시즌 보기로.
 * (가장 최근 해 기록은 문서마다 덜 들어 있어서 한 해만 보면 구단마다 선수 수가 들쭉날쭉하다)
 */
export function currentRoster(code: string, upTo = 2026): Player[] {
  const key = `${code}:${upTo}`;
  const hit = currentCache.get(key);
  if (hit) return hit;
  const out: Player[] = [];
  for (const p of persons.values()) {
    let last: KSeason | undefined;
    for (const s of p.seasons) if (s.year <= upTo && (!last || s.year > last.year)) last = s;
    if (last && last.year >= upTo - 2 && last.code === code) { const v = viewPlayer(p.id, last.year); if (v) out.push(v); }
  }
  out.sort((a, b) => b.ovr - a.ovr || a.id.localeCompare(b.id));
  currentCache.set(key, out);
  return out;
}
/** 그 구단 기록이 있는 마지막 해 (≤ 기준 해) */
export function lastYearOf(code: string, upTo = 2026): number | null {
  let best: number | null = null;
  for (const c of cards) if (c.code === code && c.year != null && c.year <= upTo && SEASON_GRADES.includes(c.grade) && (best == null || c.year > best)) best = c.year;
  return best;
}
/** 카드 고르기 — 등급 · 연도 · 구단으로 거른 카드 종류 */
export function kboCardsWhere(f: { grade?: GradeId; year?: number; code?: string; kid?: string }): KCard[] {
  return cards.filter((c) => (f.grade == null || c.grade === f.grade) && (f.year == null || c.year === f.year) && (f.code == null || c.code === f.code) && (f.kid == null || c.kid === f.kid));
}
/** 포지션 이름 (수상 칸용) */
export const posKo = (p: Pos) => POS_KO[p];

/* ───────── 연도별 상세 기록 (선수 ID 앞자리별 파일 — 필요할 때만) ───────── */
export interface RecBat { year: number; code: ClubCode; g: number; pa: number; ab: number; r: number; h: number; d2: number; d3: number; hr: number; rbi: number; sb: number; bb: number | null; so: number | null; avg: number; obp: number; slg: number; war: number | null }
export interface RecPit { year: number; code: ClubCode; g: number; gs: number | null; w: number; l: number; sv: number; hld: number; outs: number; h: number; hr: number | null; bb: number | null; so: number; era: number | null; whip: number | null; war: number | null }
export interface KRecord { bat: RecBat[]; pit: RecPit[] }
type RecFile = { r: Record<string, { b?: (number | string | null)[][]; p?: (number | string | null)[][] }> };
const recLoaders = import.meta.glob('./data/kbo/rec-*.json', { import: 'default' }) as Record<string, () => Promise<unknown>>;
const recFiles = new Map<string, Promise<RecFile | null>>();
/** 선수 연도별 기록 불러오기 (그 선수 ID 앞자리 파일 하나만) */
export function loadRecord(kid: string): Promise<KRecord | null> {
  const ch = kid[1];
  let pr = recFiles.get(ch);
  if (!pr) {
    const fn = recLoaders[`./data/kbo/rec-${ch}.json`];
    pr = fn ? fn().then((x) => x as RecFile).catch(() => null) : Promise.resolve(null);
    recFiles.set(ch, pr);
  }
  return pr.then((f) => {
    const r = f?.r[kid];
    if (!r) return null;
    const N = (x: unknown) => (typeof x === 'number' ? x : 0);
    const M = (x: unknown) => (typeof x === 'number' ? x : null);
    return {
      bat: (r.b ?? []).map((x) => ({ year: N(x[0]), code: x[1] as ClubCode, g: N(x[2]), pa: N(x[3]), ab: N(x[4]), r: N(x[5]), h: N(x[6]), d2: N(x[7]), d3: N(x[8]), hr: N(x[9]), rbi: N(x[10]), sb: N(x[11]), bb: M(x[12]), so: M(x[13]), avg: N(x[14]) / 1000, obp: N(x[15]) / 1000, slg: N(x[16]) / 1000, war: M(x[17]) })),
      pit: (r.p ?? []).map((x) => ({ year: N(x[0]), code: x[1] as ClubCode, g: N(x[2]), gs: M(x[3]), w: N(x[4]), l: N(x[5]), sv: N(x[6]), hld: N(x[7]), outs: N(x[8]), h: N(x[9]), hr: M(x[10]), bb: M(x[11]), so: N(x[12]), era: M(x[13]), whip: M(x[14]), war: M(x[15]) })),
    };
  });
}
