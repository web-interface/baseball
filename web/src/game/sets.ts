// 세트덱 — 1군 엔트리(20명: 타자 9 · 선발 5 · 불펜 5 · 마무리 1) 안에서 같은 구단·같은 연도 카드를 모으면
// 인원 단계(5 · 9 · 14 · 전원)마다 그 선수들의 능력치가 오른다.
//  · 세트 3종: 구단+연도(가장 셈) · 구단(연도 무관) · 연도(구단 무관)
//  · 오르는 능력치는 조합마다 다르다 — 구단 성향(세계관) + 그 해 성격(구단 연도 기록) / 연도 세트는 그 해 리그 특징
//  · 공정: 같은 종류·같은 단계면 모든 조합의 '총합 가치'가 같다 — 타자 8칸 합 = 8×v, 투수 7칸 합 = 7×v
//    (v = 단계 가치. 상황 효과는 반만 쳐서, +2v 상황 효과 하나가 v 만큼 예산을 쓴다)
//    나누는 비율: 칸마다 평균의 0.3~2.2배 — 성향이 센 칸일수록 크게(구단·연도 색이 또렷하게), 한 칸에 몰리지는 않게
//  · 동시에 2개까지(센 것부터), 한 선수는 받는 세트 중 가장 센 것 하나만. 케미 선 보너스는 따로.
import { CLUBS } from './world';
import type { ClubCode } from './types';
import { clubSeason, clubTitles, fullYear, leagueYear, type RankKey, type SeasonRec } from './clubSeasons';

export const ENTRY_SIZE = 20;
export type SetKind = 'teamYear' | 'team' | 'year';
export const SET_KIND_KO: Record<SetKind, string> = { teamYear: '구단+연도', team: '구단', year: '연도' };
export const SET_KIND_DESC: Record<SetKind, string> = {
  teamYear: '같은 구단 · 같은 연도 카드 — 가장 세요',
  team: '같은 구단 카드 (연도는 달라도 돼요)',
  year: '같은 연도 카드 (구단은 달라도 돼요)',
};

export interface Tier { at: number; v: number }
export const TIERS: Record<SetKind, Tier[]> = {
  teamYear: [{ at: 5, v: 2 }, { at: 9, v: 4 }, { at: 14, v: 7 }, { at: ENTRY_SIZE, v: 12 }],
  team: [{ at: 5, v: 1 }, { at: 9, v: 2 }, { at: 14, v: 4 }, { at: ENTRY_SIZE, v: 7 }],
  year: [{ at: 9, v: 1 }, { at: 14, v: 2 }, { at: ENTRY_SIZE, v: 3 }],
};
/** 엔트리 전원이 구단+연도 한 세트 = 왕조 — 능력치 폭발 */
export const DYNASTY_V = 12;
export const MAX_ACTIVE = 2;

/* ───────── 능력치 칸 ───────── */
export type BatKey = 'con' | 'pow' | 'gap' | 'eye' | 'spd' | 'stl' | 'def' | 'arm';
export type PitKey = 'vel' | 'stf' | 'brk' | 'ctl' | 'sta' | 'rec' | 'mnt';
export const BAT_KEYS: BatKey[] = ['con', 'pow', 'gap', 'eye', 'spd', 'stl', 'def', 'arm'];
export const PIT_KEYS: PitKey[] = ['vel', 'stf', 'brk', 'ctl', 'sta', 'rec', 'mnt'];
export const STAT_KO: Record<BatKey | PitKey, string> = {
  con: '컨택', pow: '파워', gap: '장타', eye: '선구', spd: '주루', stl: '도루', def: '수비 범위', arm: '송구',
  vel: '구속', stf: '구위', brk: '변화', ctl: '제구', sta: '체력', rec: '회복', mnt: '위기관리',
};
/** 카드 앞면 6칸(face code)에 닿는 몫 — 라인업 묶음 점수 계산용 */
export const FACE_OF: Record<BatKey | PitKey, [string, number][]> = {
  con: [['CON', 1]], pow: [['POW', 1]], gap: [['POW', 0.5]], eye: [['EYE', 1]], spd: [['SPD', 1]], stl: [['SPD', 0.5]],
  def: [['DEF', 1], ['BLK', 1], ['FRM', 0.5]], arm: [['ARM', 1], ['CS', 1]],
  vel: [['VEL', 1]], stf: [['STF', 1]], brk: [['BRK', 1]], ctl: [['CTL', 1]], sta: [['STA', 1]], rec: [['REC', 1]], mnt: [['MNT', 1]],
};

type BatW = Record<BatKey, number>;
type PitW = Record<PitKey, number>;
const bw = (o: Partial<BatW>): BatW => ({ con: 1, pow: 1, gap: 1, eye: 1, spd: 1, stl: 1, def: 1, arm: 1, ...o });
const pw = (o: Partial<PitW>): PitW => ({ vel: 1, stf: 1, brk: 1, ctl: 1, sta: 1, rec: 1, mnt: 1, ...o });

/* ───────── 구단 기본 성향 (세계관 styleKey) ───────── */
const STYLE: Record<string, { bat: BatW; pit: PitW; label: string }> = {
  ace: { label: '에이스 계보', bat: bw({ con: 1.2, stl: 0.8, def: 1.6, arm: 1.4 }), pit: pw({ vel: 1.6, stf: 2.2, brk: 1.6, ctl: 2, sta: 2.6, rec: 0.8, mnt: 1.2 }) },
  contact: { label: '불방망이', bat: bw({ con: 3, gap: 1.8, eye: 1.4, stl: 0.6, def: 0.8, arm: 0.6 }), pit: pw({ ctl: 1.6, mnt: 1.4, stf: 1.2 }) },
  balance: { label: '공수주 밸런스', bat: bw({}), pit: pw({ mnt: 1.3 }) },
  power: { label: '거포 군단', bat: bw({ pow: 3.2, gap: 2.2, eye: 0.8, spd: 0.6, stl: 0.4, def: 0.8 }), pit: pw({ vel: 2, stf: 1.8, ctl: 0.8 }) },
  eye: { label: '선구안 야구', bat: bw({ eye: 3.2, con: 1.8, gap: 1.2, pow: 0.8, stl: 0.6, def: 0.9, arm: 0.7 }), pit: pw({ ctl: 2.4, mnt: 1.6, brk: 1.2, vel: 0.8 }) },
  speed: { label: '발야구', bat: bw({ spd: 3, stl: 3, def: 1.8, con: 1.2, eye: 0.8, gap: 0.6, pow: 0.4 }), pit: pw({ ctl: 1.2, brk: 1.2 }) },
  youth: { label: '신예 돌풍', bat: bw({ spd: 1.8, con: 1.6, pow: 1.4, gap: 1.2, eye: 0.8, stl: 1.2 }), pit: pw({ vel: 2.4, stf: 1.8, rec: 1.6, ctl: 0.8, sta: 0.8, mnt: 0.6 }) },
  foreign: { label: '외국인 명가', bat: bw({ pow: 2.4, gap: 1.8, con: 1.4, spd: 0.8, stl: 0.6, def: 0.8 }), pit: pw({ vel: 2, stf: 2, sta: 1.8, brk: 1.2, rec: 0.8 }) },
  bullpen: { label: '철벽 불펜', bat: bw({ def: 1.4, arm: 1.2, con: 1.2, eye: 1.2, stl: 0.8 }), pit: pw({ rec: 2.8, mnt: 2.4, stf: 2, vel: 1.6, ctl: 1.4, brk: 1.2, sta: 0.6 }) },
  trick: { label: '작전 야구', bat: bw({ stl: 2.4, spd: 2, con: 1.6, eye: 1.4, gap: 0.8, pow: 0.6, arm: 0.8 }), pit: pw({ brk: 2.4, ctl: 2, mnt: 1.4, vel: 0.8 }) },
};
const clubOf = (code: ClubCode) => CLUBS.find((c) => c.code === code);
const styleOf = (code: ClubCode) => STYLE[clubOf(code)?.styleKey ?? 'balance'] ?? STYLE.balance;

/* ───────── 그 해 성격 ───────── */
interface Trait { label: string; bat: Partial<BatW>; pit: Partial<PitW> }
/** 기록이 없을 때 시드로 고르는 그 해 성격 */
const TEAM_TRAITS: Trait[] = [
  { label: '홈런 1위의 해', bat: { pow: 3, gap: 1.5 }, pit: { vel: 1 } },
  { label: '팀 타율 1위', bat: { con: 3, gap: 1 }, pit: { ctl: 1 } },
  { label: '출루율 1위', bat: { eye: 3, con: 1 }, pit: { ctl: 1 } },
  { label: '도루 1위', bat: { stl: 3, spd: 2 }, pit: { brk: 1 } },
  { label: '철벽 불펜', bat: { def: 1 }, pit: { rec: 3, mnt: 2 } },
  { label: '선발 왕국', bat: { def: 1 }, pit: { sta: 3, stf: 1.5, ctl: 1 } },
  { label: '수비 1위', bat: { def: 3, arm: 2 }, pit: { ctl: 1 } },
  { label: '탈삼진 1위', bat: { pow: 1 }, pit: { vel: 2.5, stf: 2 } },
  { label: '역전승의 해', bat: { con: 1.5, eye: 1 }, pit: { mnt: 2.5 } },
  { label: '신인 돌풍', bat: { spd: 1.5, con: 1.5 }, pit: { vel: 2 } },
];
const LEAGUE_TRAITS: Trait[] = [
  { label: '타고투저', bat: { con: 2, pow: 2, gap: 2 }, pit: { ctl: 2, mnt: 1.5 } },
  { label: '투고타저', bat: { eye: 2, con: 1.5 }, pit: { stf: 2, vel: 2, brk: 1.5 } },
  { label: '홈런 시대', bat: { pow: 3, gap: 1.5 }, pit: { stf: 2, brk: 1 } },
  { label: '뛰는 야구', bat: { stl: 3, spd: 2 }, pit: { ctl: 1.5 } },
  { label: '불펜 야구', bat: { eye: 1.5 }, pit: { rec: 3, mnt: 2 } },
  { label: '수비 야구', bat: { def: 3, arm: 2 }, pit: { ctl: 1.5 } },
  { label: '선발 야구', bat: { con: 1 }, pit: { sta: 3, stf: 1.5 } },
];

/** 태그 낱말 → 성향 */
const TAG_RULES: [RegExp, Partial<BatW>, Partial<PitW>][] = [
  [/거포|홈런|장타|대포/, { pow: 3, gap: 1.5 }, {}],
  [/타율|컨택|안타|불방망이|타격/, { con: 3, gap: 1 }, {}],
  [/출루|선구|볼넷/, { eye: 3, con: 0.8 }, {}],
  [/뛰는|도루|발야구|기동/, { stl: 3, spd: 2 }, {}],
  [/수비|그물|철벽 내야|외야/, { def: 3, arm: 1.5 }, {}],
  [/마운드|투수 왕국|선발|에이스|다승|이닝/, {}, { sta: 2.5, stf: 2, ctl: 1 }],
  [/불펜|마무리|세이브|뒷문|필승조/, {}, { rec: 3, mnt: 2 }],
  [/탈삼진|강속구|파이어볼/, {}, { vel: 3, stf: 1.5 }],
  [/평균자책|방어율|짠물/, {}, { ctl: 2.5, stf: 1.5 }],
  [/신인|돌풍|육성|젊은/, { spd: 1.5, con: 1 }, { vel: 1.5 }],
  [/역전|끈기|뒷심|기적/, { con: 1, eye: 1 }, { mnt: 2.5 }],
  [/타고투저/, { con: 2, pow: 2 }, { ctl: 1.5 }],
  [/투고타저/, { eye: 1.5 }, { stf: 2, vel: 1.5 }],
];
/** 팀 기록 순위 → 성향 (1위에 가까울수록 강하게) */
const RANK_RULES: [RankKey, Partial<BatW>, Partial<PitW>, string][] = [
  ['hr', { pow: 2.4, gap: 1 }, {}, '팀 홈런'],
  ['avg', { con: 2.4, gap: 0.5 }, {}, '팀 타율'],
  ['obp', { eye: 2.4, con: 0.4 }, {}, '팀 출루율'],
  ['slg', { gap: 1.4, pow: 0.8 }, {}, '팀 장타율'],
  ['sb', { stl: 2.4, spd: 1.4 }, {}, '팀 도루'],
  ['runs', { con: 0.8, pow: 0.8, eye: 0.6 }, {}, '팀 득점'],
  ['era', {}, { stf: 1.4, ctl: 1.4, mnt: 0.6 }, '팀 평균자책'],
  ['so', {}, { vel: 1.6, stf: 1.2 }, '팀 탈삼진'],
  ['whip', {}, { ctl: 1.8 }, '팀 WHIP'],
  ['sv', {}, { rec: 1.4, mnt: 1.2 }, '팀 세이브'],
  ['bullpen', {}, { rec: 1.8, mnt: 1.4 }, '불펜 평균자책'],
  ['def', { def: 2.2, arm: 1.2 }, {}, '팀 수비'],
];

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function addW<T extends string>(into: Record<T, number>, from: Partial<Record<T, number>>, k = 1) {
  for (const key of Object.keys(from) as T[]) into[key] = (into[key] ?? 0) + (from[key] ?? 0) * k;
}
const zeroB = (): BatW => ({ con: 0, pow: 0, gap: 0, eye: 0, spd: 0, stl: 0, def: 0, arm: 0 });
const zeroP = (): PitW => ({ vel: 0, stf: 0, brk: 0, ctl: 0, sta: 0, rec: 0, mnt: 0 });

/** 구단 그 해의 성격 — 기록(태그 · 팀 기록 순위)이 있으면 그것, 없으면 시드 */
export function seasonTrait(code: ClubCode, year: number): { label: string; bat: BatW; pit: PitW; from: 'record' | 'seed'; rec?: SeasonRec } {
  const rec = clubSeason(code, year);
  const bat = zeroB(), pit = zeroP();
  const labels: string[] = [];
  if (rec) {
    for (const t of rec.tags) for (const [re, b, p] of TAG_RULES) if (re.test(t)) { addW(bat, b); addW(pit, p); }
    const teams = Math.max(2, rec.teams || 10);
    let bestQ = 0, bestLabel = '';
    for (const [k, b, p, ko] of RANK_RULES) {
      const r = rec.ranks[k];
      if (r == null) continue;
      const q = Math.max(0, 1 - (r - 1) / (teams - 1));
      const s = q * q;
      addW(bat, b, s); addW(pit, p, s);
      if (r === 1 && q > bestQ) { bestQ = q; bestLabel = `${ko} 1위`; }
    }
    const tag = rec.tags.find((t) => !/^우승$|^준우승$/.test(t));
    if (tag) labels.push(tag);
    else if (bestLabel) labels.push(bestLabel);
    if (rec.post && /우승/.test(rec.post)) labels.unshift(/준우승/.test(rec.post) ? '준우승' : '우승');
  }
  const sum = Object.values(bat).reduce((a, b) => a + b, 0) + Object.values(pit).reduce((a, b) => a + b, 0);
  if (sum > 0.5) return { label: labels.join(' · ') || `${year} 시즌`, bat, pit, from: 'record', rec };
  const t = TEAM_TRAITS[hash(`${code}:${year}`) % TEAM_TRAITS.length];
  addW(bat, t.bat); addW(pit, t.pit);
  const title = clubTitles(code).includes(year) ? '우승 · ' : '';
  const era = labels.filter((l) => l !== '우승');
  return { label: title + [...era, t.label].join(' · '), bat, pit, from: 'seed', rec };
}

/** 그 해 리그 특징 (연도 세트) */
export function leagueTrait(year: number): { label: string; bat: BatW; pit: PitW } {
  const ly = leagueYear(year);
  const bat = zeroB(), pit = zeroP();
  if (ly) for (const t of ly.tags) for (const [re, b, p] of TAG_RULES) if (re.test(t)) { addW(bat, b); addW(pit, p); }
  const sum = Object.values(bat).reduce((a, b) => a + b, 0) + Object.values(pit).reduce((a, b) => a + b, 0);
  if (ly && sum > 0.5) return { label: ly.tags[0] ?? `${year} 리그`, bat, pit };
  const t = LEAGUE_TRAITS[hash(`league:${year}`) % LEAGUE_TRAITS.length];
  addW(bat, t.bat); addW(pit, t.pit);
  return { label: t.label, bat, pit };
}

/* ───────── 효과 ───────── */
export interface Special { side: 'bat' | 'pit'; key: BatKey | PitKey; text: string; v: number }
export interface SetEffect {
  kind: SetKind;
  code?: ClubCode;
  year?: number;
  tier: number;
  at: number;
  v: number;
  bat: { k: BatKey; v: number }[];
  pit: { k: PitKey; v: number }[];
  special?: Special;
  /** 그 해 성격 · 구단 성향 이름 ('거포 군단', "홈런 1위의 해") */
  trait: string;
}

const SPECIAL_TEXT: Record<BatKey | PitKey, string> = {
  con: '득점권 컨택', pow: '주자 있을 때 파워', gap: '좌중간·우중간 장타', eye: '2스트라이크 뒤 선구', spd: '한 베이스 더 주루', stl: '도루 스타트',
  def: '7회 이후 수비 범위', arm: '주자 잡는 송구',
  vel: '1~3회 구속', stf: '7회까지 선발 구위', brk: '결정구 변화', ctl: '주자 있을 때 제구', sta: '6회 이후 체력', rec: '7회 이후 불펜 구위', mnt: '1점 차 위기관리',
};

/** 예산을 성향 비율로 나눈다 — 칸마다 0.3~2.2배(성향이 센 칸일수록 크게), 합은 정확히 budget */
function spread<K extends string>(keys: K[], w: Record<K, number>, budget: number, v: number): { k: K; v: number }[] {
  const n = keys.length;
  const top = Math.max(...keys.map((k) => Math.max(0, w[k]))) || 1;
  let m = keys.map((k) => 0.3 + 1.7 * Math.pow(Math.max(0, w[k]) / top, 1.5));
  for (let it = 0; it < 4; it++) {
    const sum = m.reduce((a, b) => a + b, 0);
    m = m.map((x) => Math.min(2.2, Math.max(0.3, (x * n) / sum)));
  }
  const sum = m.reduce((a, b) => a + b, 0);
  const raw = keys.map((k, i) => ({ k, x: (budget * m[i]) / sum }));
  const out = raw.map((r) => ({ k: r.k, v: Math.floor(r.x), f: r.x - Math.floor(r.x) }));
  let left = budget - out.reduce((a, r) => a + r.v, 0);
  out.slice().sort((a, b) => b.f - a.f).forEach((r) => { if (left > 0) { r.v++; left--; } });
  void v;
  return out.map(({ k, v: val }) => ({ k, v: val })).sort((a, b) => b.v - a.v || keys.indexOf(a.k) - keys.indexOf(b.k));
}

function blend<T extends string>(a: Record<T, number>, b: Record<T, number>, ka: number, kb: number): Record<T, number> {
  const norm = (x: Record<T, number>) => { const s = Object.values<number>(x).reduce((p, q) => p + q, 0) || 1; return s; };
  const sa = norm(a), sb = norm(b);
  const out = {} as Record<T, number>;
  for (const k of Object.keys(a) as T[]) out[k] = (a[k] / sa) * ka + ((b[k] ?? 0) / sb) * kb;
  return out;
}

const cache = new Map<string, SetEffect>();
/** (종류, 구단, 연도, 단계) 효과 — 시드로 결정, 같은 입력이면 늘 같은 값 */
export function setEffect(kind: SetKind, code: ClubCode | undefined, year: number | undefined, tier: number): SetEffect {
  const key = `${kind}|${code ?? ''}|${year ?? ''}|${tier}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const t = TIERS[kind][Math.max(0, Math.min(TIERS[kind].length - 1, tier))];
  let batW: BatW, pitW: PitW, trait: string;
  if (kind === 'team') {
    const st = styleOf(code!);
    batW = st.bat; pitW = st.pit; trait = st.label;
  } else if (kind === 'year') {
    const lt = leagueTrait(year!);
    batW = blend(bw({}), lt.bat, 0.3, 0.7); pitW = blend(pw({}), lt.pit, 0.3, 0.7); trait = lt.label;
  } else {
    const st = styleOf(code!);
    const se = seasonTrait(code!, year!);
    batW = blend(st.bat, se.bat, 0.55, 0.45); pitW = blend(st.pit, se.pit, 0.55, 0.45); trait = se.label;
  }
  let batBudget = BAT_KEYS.length * t.v, pitBudget = PIT_KEYS.length * t.v;
  let special: Special | undefined;
  const wantSpecial = kind === 'team' || (kind === 'teamYear' && hash(`sp:${code}:${year}`) % 2 === 0);
  if (wantSpecial) {
    const topB = BAT_KEYS.slice().sort((a, b) => batW[b] - batW[a])[0];
    const topP = PIT_KEYS.slice().sort((a, b) => pitW[b] - pitW[a])[0];
    const bShare = batW[topB] / (Object.values(batW).reduce((a, b) => a + b, 0) || 1);
    const pShare = pitW[topP] / (Object.values(pitW).reduce((a, b) => a + b, 0) || 1);
    const side: 'bat' | 'pit' = bShare >= pShare ? 'bat' : 'pit';
    const k = side === 'bat' ? topB : topP;
    special = { side, key: k, v: t.v * 2, text: `${SPECIAL_TEXT[k]} +${t.v * 2}` };
    if (side === 'bat') batBudget -= t.v; else pitBudget -= t.v;
  }
  const eff: SetEffect = {
    kind, code, year, tier, at: t.at, v: t.v,
    bat: spread(BAT_KEYS, batW, batBudget, t.v),
    pit: spread(PIT_KEYS, pitW, pitBudget, t.v),
    special, trait,
  };
  cache.set(key, eff);
  return eff;
}

/** 효과 한 줄 — '파워 +4 · 장타 +3 · 컨택 +2' (0 은 빼고, 많으면 앞 n개) */
export function statLine(list: { k: BatKey | PitKey; v: number }[], n = 4): string {
  const nz = list.filter((x) => x.v > 0);
  const head = nz.slice(0, n).map((x) => `${STAT_KO[x.k]} +${x.v}`).join(' · ');
  return nz.length > n ? `${head} …` : head;
}
/** 한 선수가 받는 몫 (타자면 타자 줄, 투수면 투수 줄) */
export function sideLine(e: SetEffect, isP: boolean, n = 3): string {
  const l = statLine(isP ? e.pit : e.bat, n);
  const sp = e.special && (e.special.side === 'pit') === isP ? ` · ${e.special.text}` : '';
  return l + sp;
}

/** 세트 이름 — "'27 독수리스" · '독수리스' · "'27 시즌" */
export function setName(kind: SetKind, code?: ClubCode, year?: number): string {
  const short = code ? clubOf(code)?.short ?? code : '';
  const yy = year != null ? `’${String(fullYear(year) % 100).padStart(2, '0')}` : '';
  if (kind === 'teamYear') return `${yy} ${short}`;
  if (kind === 'team') return short;
  return `${yy} 시즌`;
}
/** 한 줄 설명 — "'27 독수리스 — 홈런 1위의 해: 타자 파워 +4 · 장타 +3 …" */
export function setTitle(e: SetEffect): string {
  return `${setName(e.kind, e.code, e.year)} — ${e.trait}`;
}

/* ───────── 엔트리 → 세트 진행 ───────── */
export interface EntryMember {
  /** 자리 키 (라인업 슬롯) */
  key: string;
  code: ClubCode;
  /** 카드 연도 (4자리) — 없으면 연도 세트에 안 들어감 */
  year?: number;
  isP: boolean;
}
export interface SetProgress {
  id: string;
  kind: SetKind;
  code?: ClubCode;
  year?: number;
  name: string;
  have: number;
  members: string[];
  /** 지금 단계 (없으면 −1) */
  tier: number;
  cur: SetEffect | null;
  next: SetEffect | null;
  /** 동시에 켜진 세트(최대 2)에 들었나 */
  active: boolean;
  /** 왕조 — 엔트리 전원 구단+연도 */
  dynasty: boolean;
}
export interface SetsResult {
  all: SetProgress[];
  active: SetProgress[];
  /** 선수(자리)마다 받는 세트 — 가장 센 것 하나 */
  bonusOf: Map<string, SetProgress>;
  dynasty: SetProgress | null;
}

const KIND_ORDER: Record<SetKind, number> = { teamYear: 0, team: 1, year: 2 };

export function computeSets(members: EntryMember[]): SetsResult {
  const groups = new Map<string, { kind: SetKind; code?: ClubCode; year?: number; members: EntryMember[] }>();
  const add = (id: string, kind: SetKind, m: EntryMember, code?: ClubCode, year?: number) => {
    let g = groups.get(id);
    if (!g) { g = { kind, code, year, members: [] }; groups.set(id, g); }
    g.members.push(m);
  };
  for (const m of members) {
    add(`team:${m.code}`, 'team', m, m.code);
    if (m.year != null) {
      add(`ty:${m.code}:${m.year}`, 'teamYear', m, m.code, m.year);
      add(`year:${m.year}`, 'year', m, undefined, m.year);
    }
  }
  const all: SetProgress[] = [...groups.entries()].map(([id, g]) => {
    const have = g.members.length;
    const tiers = TIERS[g.kind];
    let tier = -1;
    tiers.forEach((t, i) => { if (have >= t.at) tier = i; });
    return {
      id, kind: g.kind, code: g.code, year: g.year, name: setName(g.kind, g.code, g.year), have,
      members: g.members.map((m) => m.key), tier,
      cur: tier >= 0 ? setEffect(g.kind, g.code, g.year, tier) : null,
      next: tier + 1 < tiers.length ? setEffect(g.kind, g.code, g.year, tier + 1) : null,
      active: false,
      dynasty: g.kind === 'teamYear' && have >= ENTRY_SIZE,
    };
  });
  // 켜질 세트 고르기 — 센 것부터, 받는 선수에게 더해 주는 게 있을 때만, 2개까지
  const best = new Map<string, SetProgress>();
  const cands = all.filter((s) => s.cur).sort((a, b) => b.cur!.v - a.cur!.v || b.have - a.have || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  const active: SetProgress[] = [];
  for (const c of cands) {
    if (active.length >= MAX_ACTIVE) break;
    const gain = c.members.some((k) => (best.get(k)?.cur?.v ?? 0) < c.cur!.v);
    if (!gain) continue;
    c.active = true;
    active.push(c);
    for (const k of c.members) if ((best.get(k)?.cur?.v ?? 0) < c.cur!.v) best.set(k, c);
  }
  const dynasty = active.find((s) => s.dynasty) ?? null;
  // 보여 줄 순서 — 켜진 것 → 다음 단계까지 적게 남은 것 → 많이 모은 것
  const left = (s: SetProgress) => (s.next ? s.next.at - s.have : 99);
  all.sort((a, b) => Number(b.active) - Number(a.active) || left(a) - left(b) || b.have - a.have || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  return { all, active, bonusOf: best, dynasty };
}

/** 한 선수의 능력치 보너스 (face code 기준) — 라인업 묶음 점수 */
export function faceBonus(e: SetEffect | null | undefined, isP: boolean): Record<string, number> {
  const out: Record<string, number> = {};
  if (!e) return out;
  for (const x of isP ? e.pit : e.bat) for (const [code, k] of FACE_OF[x.k]) out[code] = (out[code] ?? 0) + x.v * k;
  return out;
}
