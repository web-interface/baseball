// 잠재력 — 선수마다 후보 3개(보통 · 상급 · 최고) 중 하나가 확률로 열린다. 한 카드에 하나만 켜진다.
//  · 레전드급(레전드 · 프랜차이즈 · 블랙 · 시그니처) 선수는 실제 별명 · 특성으로 만든 전용 잠재력(data/potentials.json — 선수 ID 열쇠)
//  · 그 밖의 선수는 가장 두드러진 능력으로 고른 일반 잠재력
//  · 최고 잠재력은 확률이 아주 낮은 대신 팀 선수들(타자 전원 또는 투수 전원)도 같이 능력치를 받는다
// 저장: localStorage 'bb.pot' { v: 1, cards: { 카드 id: { pick, rolls } } } — 카드마다(같은 선수라도 카드가 다르면 따로)
import type { CardInst, GradeId, Player } from './types';
import type { BatKey, PitKey } from './sets';
import LEGEND from './data/potentials.json';

export type PotTier = 'C' | 'A' | 'S';
export type PotScope = 'self' | 'teamBat' | 'teamPit';
export interface PotEffect { scope: PotScope; key: string; v: number }
export interface Potential { tier: PotTier; name: string; desc: string; fx: PotEffect[] }
export const TIER_KO: Record<PotTier, string> = { C: '보통', A: '상급', S: '최고' };
/** 레전드급 — 한 팀에 타자 2명 · 투수 2명까지 */
export const LEGEND_GRADES = new Set<GradeId>(['legend', 'franchise', 'black', 'signature']);
export const isLegendGrade = (g: GradeId) => LEGEND_GRADES.has(g);
export const LEGEND_MAX = { bat: 2, pit: 2 };
/** MVP 카드 — 한 팀에 4명까지 (타자 · 투수 합쳐서). 사용자 지시 10-24 */
export const MVP_MAX = 4;
export const isMvpGrade = (g: GradeId) => g === 'mvp';

/** 확률(%) — 레전드급은 최고가 3%, 그 밖은 2% */
export const oddsOf = (legend: boolean): Record<PotTier, number> => (legend ? { C: 72, A: 25, S: 3 } : { C: 74, A: 24, S: 2 });
/** 한 번 돌리는 값 (GP) */
export const rollCost = (legend: boolean) => (legend ? 500_000 : 50_000);

const KO: Record<string, string> = {
  CON: '컨택', POW: '파워', EYE: '선구', SPD: '주루', DEF: '수비', ARM: '송구', BLK: '블로킹', FRM: '프레이밍', CS: '도루저지',
  VEL: '구속', STF: '구위', BRK: '변화', CTL: '제구', STA: '체력', REC: '회복', MNT: '위기관리',
};
type Kind = 'power' | 'contact' | 'speed' | 'eye' | 'clutch' | 'defense' | 'catcher' | 'allround' | 'ace' | 'fire' | 'control' | 'breaking' | 'closer' | 'iron';
const S = (key: string, v: number): PotEffect => ({ scope: 'self', key, v });
const TB = (key: string, v: number): PotEffect => ({ scope: 'teamBat', key, v });
const TP = (key: string, v: number): PotEffect => ({ scope: 'teamPit', key, v });
/** 유형별 효과 [보통, 상급, 최고] */
const FX: Record<Kind, [PotEffect[], PotEffect[], PotEffect[]]> = {
  power: [[S('POW', 5)], [S('POW', 8), S('CON', 2)], [S('POW', 4), TB('POW', 2)]],
  contact: [[S('CON', 5)], [S('CON', 8), S('EYE', 2)], [S('CON', 4), TB('CON', 2)]],
  speed: [[S('SPD', 6)], [S('SPD', 9), S('DEF', 2)], [S('SPD', 4), TB('SPD', 3)]],
  eye: [[S('EYE', 6)], [S('EYE', 8), S('CON', 3)], [S('EYE', 4), TB('EYE', 3)]],
  clutch: [[S('CON', 3), S('POW', 3)], [S('CON', 5), S('POW', 5)], [S('CON', 3), S('POW', 3), TB('CON', 1), TB('POW', 1)]],
  defense: [[S('DEF', 6)], [S('DEF', 8), S('ARM', 4)], [S('DEF', 4), TB('DEF', 3)]],
  catcher: [[S('BLK', 5), S('FRM', 3)], [S('FRM', 7), S('CS', 5)], [S('FRM', 4), TP('CTL', 2), TP('MNT', 2)]],
  allround: [[S('CON', 3), S('SPD', 3)], [S('CON', 5), S('POW', 3), S('SPD', 3)], [S('CON', 2), S('POW', 2), S('SPD', 2), TB('CON', 1), TB('POW', 1), TB('SPD', 1)]],
  ace: [[S('STF', 5)], [S('STF', 6), S('MNT', 4)], [S('STF', 4), TP('MNT', 3)]],
  fire: [[S('VEL', 5)], [S('VEL', 7), S('STF', 3)], [S('VEL', 4), TP('VEL', 2)]],
  control: [[S('CTL', 6)], [S('CTL', 8), S('MNT', 2)], [S('CTL', 4), TP('CTL', 3)]],
  breaking: [[S('BRK', 6)], [S('BRK', 8), S('STF', 2)], [S('BRK', 4), TP('BRK', 3)]],
  closer: [[S('MNT', 6)], [S('MNT', 8), S('VEL', 3)], [S('MNT', 4), TP('MNT', 3)]],
  iron: [[S('STA', 7)], [S('STA', 9), S('MNT', 2)], [S('STA', 4), TP('STA', 3)]],
};
/** 일반 잠재력 이름 [보통, 상급, 최고] */
const NAMES: Record<Kind, [string, string, string]> = {
  power: ['장타 본능', '거포 각성', '타선의 심장'],
  contact: ['정교한 배트', '타격 기계', '연속 안타 행진'],
  speed: ['번개 발', '대도의 스타트', '그라운드의 바람'],
  eye: ['좋은 눈', '선구안 각성', '출루 릴레이'],
  clutch: ['찬스에 강함', '해결사 본능', '역전의 주인공'],
  defense: ['안정된 수비', '철벽 수비', '수비 지휘관'],
  catcher: ['든든한 안방', '포수 리드', '안방마님의 리드'],
  allround: ['다재다능', '호타준족', '팀의 엔진'],
  ace: ['묵직한 공', '에이스 본능', '에이스의 무게'],
  fire: ['강속구', '불같은 직구', '파이어볼 군단'],
  control: ['칼제구', '핀포인트', '제구의 교과서'],
  breaking: ['예리한 변화구', '마구', '변화구 연구회'],
  closer: ['강심장', '수호신', '철벽 뒷문'],
  iron: ['철완', '이닝이터', '마운드의 버팀목'],
};
/** 유형 설명 (최고 잠재력 효과 글에 쓴다) */
const scopeKo = (s: PotScope) => (s === 'teamBat' ? '팀 타자 전원' : s === 'teamPit' ? '팀 투수 전원' : '');
export function fxText(fx: PotEffect[]) {
  const self = fx.filter((x) => x.scope === 'self').map((x) => `${KO[x.key] ?? x.key} +${x.v}`);
  const team = fx.filter((x) => x.scope !== 'self');
  const out = self.length ? [self.join(' · ')] : [];
  for (const sc of ['teamBat', 'teamPit'] as const) {
    const xs = team.filter((x) => x.scope === sc);
    if (xs.length) out.push(`${scopeKo(sc)} ${xs.map((x) => `${KO[x.key] ?? x.key} +${x.v}`).join(' · ')}`);
  }
  return out.join(' / ');
}

/** 능력으로 유형 고르기 (일반 선수) */
function kindOf(p: Player): Kind {
  if (p.pos === 'P') {
    if (p.role === 'CL') return 'closer';
    const top = [...p.face].sort((a, b) => b.v - a.v)[0]?.code;
    return top === 'VEL' ? 'fire' : top === 'CTL' ? 'control' : top === 'BRK' ? 'breaking' : top === 'STA' || top === 'REC' ? 'iron' : top === 'MNT' ? 'closer' : 'ace';
  }
  if (p.pos === 'C') return 'catcher';
  const f = (c: string) => p.face.find((x) => x.code === c)?.v ?? 0;
  const top = [...p.face].filter((x) => ['CON', 'POW', 'EYE', 'SPD', 'DEF'].includes(x.code)).sort((a, b) => b.v - a.v)[0]?.code;
  if (f('POW') >= 70 && f('SPD') >= 70) return 'allround';
  return top === 'POW' ? 'power' : top === 'CON' ? 'contact' : top === 'EYE' ? 'eye' : top === 'SPD' ? 'speed' : top === 'DEF' ? 'defense' : 'clutch';
}
const personOf = (id: string) => id.replace(/~\d{4}$/, '');
const LEG = LEGEND as unknown as Record<string, [string, Kind, string]>;

/** 그 선수의 잠재력 후보 3개 [보통, 상급, 최고] */
export function potentialsOf(p: Player, grade: GradeId): Potential[] {
  const leg = isLegendGrade(grade) ? LEG[personOf(p.id)] : undefined;
  const kind: Kind = leg ? leg[1] : kindOf(p);
  const [c, a, s] = FX[kind];
  if (leg) {
    const [nick, , best] = leg;
    return [
      { tier: 'C', name: `${nick} — ${NAMES[kind][0]}`, desc: `${nick}다운 한 방이 살아나요.`, fx: c },
      { tier: 'A', name: `${nick} 각성`, desc: `전성기의 ${nick}가 돌아와요.`, fx: a },
      { tier: 'S', name: best, desc: `${best} — 그 기운이 팀 전체로 번져요.`, fx: s },
    ];
  }
  const [n0, n1, n2] = NAMES[kind];
  return [
    { tier: 'C', name: n0, desc: '조금씩 몸에 익은 장점이에요.', fx: c },
    { tier: 'A', name: n1, desc: '숨어 있던 재능이 깨어나요.', fx: a },
    { tier: 'S', name: n2, desc: '한 사람의 힘이 팀 전체를 끌어올려요.', fx: s.map((x) => (x.scope === 'self' ? x : { ...x, v: Math.max(1, x.v - 1) })) },
  ];
}

/* ───────── 저장 ───────── */
interface PotSave { v: 1; cards: Record<string, { pick: number; rolls: number }> }
const KEY = 'bb.pot';
const listeners = new Set<() => void>();
let cache: PotSave | null = null;
let version = 0;
function read(): PotSave {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as PotSave) : null;
    if (v && v.v === 1 && v.cards) return (cache = v);
  } catch { /* 새로 */ }
  return (cache = { v: 1, cards: {} });
}
function write(v: PotSave) {
  cache = v;
  version++;
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* 이번 방문만 */ }
  listeners.forEach((l) => l());
}
export const potVersion = () => version;
export function subscribePot(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
/** 그 카드에 켜진 잠재력 번호 (0 보통 · 1 상급 · 2 최고, 없으면 -1) */
export const pickOf = (cardId: string) => read().cards[cardId]?.pick ?? -1;
export const rollsOf = (cardId: string) => read().cards[cardId]?.rolls ?? 0;

/** 돌리기 — 확률로 하나를 고르고 저장한다 (값은 pay 가 낸다 · 못 내면 null) */
export function rollPotential(card: Pick<CardInst, 'id' | 'grade'>, pay: (gp: number) => boolean): number | null {
  const legend = isLegendGrade(card.grade);
  if (!pay(rollCost(legend))) return null;
  const o = oddsOf(legend);
  const r = rand() * 100;
  const pick = r < o.S ? 2 : r < o.S + o.A ? 1 : 0;
  const v = read();
  const prev = v.cards[card.id];
  write({ ...v, cards: { ...v.cards, [card.id]: { pick, rolls: (prev?.rolls ?? 0) + 1 } } });
  return pick;
}
function rand() {
  try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; } catch { return Math.random(); }
}

/* ───────── 효과 ───────── */
/** 카드에 켜진 잠재력 (없으면 null) */
export function activePotential(card: Pick<CardInst, 'id' | 'grade'>, p: Player): Potential | null {
  const k = pickOf(card.id);
  return k >= 0 ? potentialsOf(p, card.grade)[k] ?? null : null;
}

/* ───────── 팀에 모으기 — 라인업 계산(screens/lineup/calc) · 경기 엔진(season/rosters) 이 같이 쓴다 ───────── */
export type FaceFx = Record<string, number>;
export interface TeamPot {
  /** 카드 id → 자기 몫 (앞면 코드별) */
  self: Map<string, FaceFx>;
  /** 최고 잠재력이 팀 타자 전원 · 투수 전원에게 주는 몫 */
  bat: FaceFx;
  pit: FaceFx;
}
const addTo = (o: FaceFx, k: string, v: number) => { o[k] = (o[k] ?? 0) + v; };
/** 엔트리 카드들의 켜진 잠재력을 모은다 (팀 몫은 엔트리에 선 카드만 — 벤치는 자기 몫만) */
export function teamPotential(entry: { card: Pick<CardInst, 'id' | 'grade'>; player: Player }[], bench: { card: Pick<CardInst, 'id' | 'grade'>; player: Player }[] = []): TeamPot {
  const tp: TeamPot = { self: new Map(), bat: {}, pit: {} };
  const take = (u: { card: Pick<CardInst, 'id' | 'grade'>; player: Player }, team: boolean) => {
    const pot = activePotential(u.card, u.player);
    if (!pot) return;
    for (const x of pot.fx) {
      if (x.scope === 'self') {
        const o = tp.self.get(u.card.id) ?? {};
        addTo(o, x.key, x.v);
        tp.self.set(u.card.id, o);
      } else if (team) addTo(x.scope === 'teamBat' ? tp.bat : tp.pit, x.key, x.v);
    }
  };
  entry.forEach((u) => take(u, true));
  bench.forEach((u) => take(u, false));
  return tp;
}
/** 이 카드가 받는 잠재력 — 자기 몫 + 팀 몫 (앞면 코드별) */
export function potFaceOf(tp: TeamPot, cardId: string, isP: boolean): FaceFx {
  const out: FaceFx = { ...(tp.self.get(cardId) ?? {}) };
  for (const [k, v] of Object.entries(isP ? tp.pit : tp.bat)) addTo(out, k, v);
  return out;
}
/** 팀 종합에 더하는 값 — 받는 잠재력 합 ÷ 4 (훈련과 같은 몫) */
export const potOvrBonus = (f: FaceFx) => Object.values(f).reduce((a, b) => a + b, 0) / 4;

/** 앞면 코드 → 경기 엔진 보너스 칸 (game/training 의 훈련 몫과 같은 길) */
const ENGINE_OF: Record<string, [BatKey | PitKey, number][]> = {
  CON: [['con', 1]], POW: [['pow', 1]], EYE: [['eye', 1]], SPD: [['spd', 1], ['stl', 0.5]], DEF: [['def', 1]], ARM: [['arm', 1]],
  BLK: [['def', 1]], FRM: [['def', 0.8]], CS: [['arm', 1]],
  VEL: [['vel', 1]], STF: [['stf', 1]], BRK: [['brk', 1]], CTL: [['ctl', 1]], STA: [['sta', 1]], REC: [['rec', 1]], MNT: [['mnt', 1]],
};
const BAT_K = new Set<string>(['con', 'pow', 'gap', 'eye', 'spd', 'stl', 'def', 'arm']);
/** 받는 잠재력 → 엔진 보너스 { k, v } — 타자는 타자 칸, 투수는 투수 칸만 */
export function potEngineFx(f: FaceFx, isP: boolean): { k: BatKey | PitKey; v: number }[] {
  const acc = new Map<BatKey | PitKey, number>();
  for (const [code, g] of Object.entries(f)) {
    if (!g) continue;
    for (const [k, w] of ENGINE_OF[code] ?? []) {
      if (BAT_K.has(k) === isP) continue;
      acc.set(k, (acc.get(k) ?? 0) + g * w);
    }
  }
  return [...acc].map(([k, v]) => ({ k, v: Math.round(v * 10) / 10 }));
}

/* ───────── 연출 중 감추기 — 돌리는 동안 다른 화면(선수 머리 등)에는 전의 잠재력을 보인다 ───────── */
const hold = new Map<string, number>();
const ping = () => { version++; listeners.forEach((l) => l()); };
export function holdShown(cardId: string, prev: number) { hold.set(cardId, prev); ping(); }
export function releaseShown(cardId: string) { if (hold.delete(cardId)) ping(); }
/** 화면에 보일 잠재력 번호 — 연출 중이면 전의 것 */
export const shownPickOf = (cardId: string) => (hold.has(cardId) ? hold.get(cardId)! : pickOf(cardId));
