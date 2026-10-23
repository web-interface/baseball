// 훈련 규칙 — 카드 한 장(보유 카드 id)마다 단계 0~10 + 능력치별로 오른 값. 같은 카드 중복으로 오르는 강화(I~X, game/inventory)와는 따로 가는 길.
//  · 한 번에 능력치 하나를 골라 훈련한다 — 카드 앞면 대표 능력치 6개 그대로
//      타자 컨택 CON · 파워 POW · 선구 EYE · 주루 SPD · 수비 DEF · 송구 ARM (포수는 블로킹 BLK · 프레이밍 FRM · 도루저지 CS, 지명은 장타 GAP · 대처 ADJ)
//      투수 구속 VEL · 구위 STF · 변화 BRK · 제구 CTL · 체력 STA(선발)/회복 REC(불펜) · 위기관리 MNT
//    + 특수구질 SIG — 고유 구종이 있는 투수 카드만. 확률 ×0.55 로 더 어렵고, 성공하면 더 많이 오른다(구종 위력·제구).
//  · 성공 확률(단계 s → s+1): 80 68 55 44 34 25 18 12 7 4 % · 특수구질 ×0.55 · 장소 특기 +0~6%p
//    · 연속 실패 보정 +2%p 씩(최대 +10%p, 성공하면 처음부터) · 최대 95%. 결과는 누를 때 crypto 난수로 — 미리 정해진 결과 없음.
//  · 성공: 단계 +1, 고른 능력치 +(1 + ⌊s/3⌋) = +1~+4 (특수구질 +(2 + ⌊s/3⌋) = +2~+5 · 특수구질 단계 +1). 실패: 비용만 (단계는 그대로).
//  · 5단계부터 카드에 불빛(카드 그림은 cards/ 가 CardInst.train.lv 로), 10단계 = 최종.
//  · 효과: 라인업 팀 종합(screens/lineup/calc — 오른 값 합 ÷ 4) · 경기 엔진(season/rosters → season/sim, 능력치 칸별 보너스).
// 저장 · 시도(tryTrain)는 game/inventory — 이 파일은 표와 계산만 (저장소를 부르지 않는다).
import type { CardInst, Player, SignaturePitch } from './types';
import type { BatKey, PitKey } from './sets';

export const TRAIN_MAX = 10;
/** 이 단계부터 카드에 불빛 */
export const GLOW_FROM = 5;
/** 단계 s → s+1 성공 확률 % (s = 0~9) */
export const TRAIN_BASE = [80, 68, 55, 44, 34, 25, 18, 12, 7, 4] as const;
/** 특수구질 확률 배율 */
export const SIG_MUL = 0.55;
/** 연속 실패 보정 — 실패마다 +2%p, 최대 +10%p */
export const TR_PITY_STEP = 2;
export const TR_PITY_MAX = 10;
/** 아무리 보태도 이 % 를 넘지 않는다 */
export const CHANCE_CAP = 95;
/** 특수구질 훈련 키 */
export const SIG = 'SIG';

/** 훈련 키 — 대표 능력치 코드(CON · VEL …) 또는 'SIG' */
export type TrainKey = string;

/** 카드에 붙는 훈련 (보유 카드 보기 ownedCard 가 채움) */
export type CardTrain = NonNullable<CardInst['train']>;

/* ───────── 오르는 값 · 비용 ───────── */
/** 단계 lv 에서 성공하면 오르는 값 — 일반 1~4, 특수구질 2~5 */
export const gainAt = (lv: number, sig = false) => (sig ? 2 : 1) + Math.floor(lv / 3);
/** 0 → lv 까지 오른 값 합 (그중 특수구질 단계 sig 번은 1씩 더) — 저장 검사용 */
export function gainTotal(lv: number, sig = 0): number {
  let t = sig;
  for (let s = 0; s < lv; s++) t += gainAt(s);
  return t;
}
export const sumGains = (g: Partial<Record<string, number>> | undefined) => Object.values(g ?? {}).reduce<number>((a, b) => a + (b ?? 0), 0);

export interface TrainCost { gp?: number; ball?: number }
/** 한 번 훈련 비용 — GP 1만 × (단계+1)^1.7 × 장소 배율 (골든볼 장소는 30 × (단계+1)^1.6 × 배율), 특수구질 ×2 */
export function costOf(lv: number, key: TrainKey, place: TrainPlace): TrainCost {
  const k = lv + 1;
  const sig = key === SIG ? 2 : 1;
  if (place.pay === 'ball') return { ball: Math.round(30 * k ** 1.6 * place.mul * sig) };
  return { gp: Math.round((10_000 * k ** 1.7 * place.mul * sig) / 100) * 100 };
}

/* ───────── 확률 ───────── */
export interface TrainOdds {
  /** 이 단계 기본 % */
  base: number;
  /** 특수구질 배율 (일반 1) */
  mul: number;
  /** 장소 보너스 %p */
  place: number;
  /** 연속 실패 보정 %p */
  pity: number;
  /** 최종 % (소수 한 자리) */
  total: number;
  /** 95% 에서 잘렸나 */
  capped: boolean;
}
export function placeBonus(place: TrainPlace, key: TrainKey): number {
  return place.spec[key] ?? place.spec['*'] ?? 0;
}
/** 성공 확률 — lv 가 최종이면 null */
export function oddsOf(lv: number, key: TrainKey, place: TrainPlace, streak = 0): TrainOdds | null {
  if (lv < 0 || lv >= TRAIN_MAX) return null;
  const base = TRAIN_BASE[lv];
  const mul = key === SIG ? SIG_MUL : 1;
  const pl = placeBonus(place, key);
  const pity = Math.min(TR_PITY_MAX, TR_PITY_STEP * Math.max(0, streak));
  const raw = base * mul + pl + pity;
  return { base, mul, place: pl, pity, total: Math.round(Math.min(CHANCE_CAP, raw) * 10) / 10, capped: raw > CHANCE_CAP };
}
/** 확률 글자 — 44 · 24.2 */
export const pctText = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));

/** 훈련 난수 0 이상 1 미만 — crypto (없으면 Math.random) */
export function trainRandom(): number {
  try {
    const a = new Uint32Array(1);
    globalThis.crypto.getRandomValues(a);
    return a[0] / 4294967296;
  } catch {
    return Math.random();
  }
}

/* ───────── 단계 이름 ───────── */
export const isGlow = (lv: number) => lv >= GLOW_FROM;
export function stageLabel(lv: number): string {
  if (lv >= TRAIN_MAX) return '최종 단계';
  if (lv >= GLOW_FROM) return '불빛 단계';
  return lv > 0 ? '기초 단계' : '훈련 전';
}

/* ───────── 훈련할 능력치 ───────── */
export interface TrainStat {
  key: TrainKey;
  ko: string;
  /** 카드 앞면 값 (훈련 전) */
  v: number;
}
/** 이 카드로 훈련할 수 있는 것 — 앞면 대표 능력치 6개 + (고유 구종 투수면) 특수구질 */
export function trainStats(p: Player, c: Pick<CardInst, 'signaturePitch'>): { stats: TrainStat[]; sig: SignaturePitch | null } {
  const stats = p.face.map((f) => ({ key: f.code, ko: f.ko, v: f.v }));
  const sig = p.pos === 'P' && c.signaturePitch ? c.signaturePitch : null;
  return { stats, sig };
}
export const canTrainKey = (p: Player, c: Pick<CardInst, 'signaturePitch'>, key: TrainKey) =>
  key === SIG ? p.pos === 'P' && !!c.signaturePitch : p.face.some((f) => f.code === key);

/* ───────── 훈련 장소 ───────── */
export type PlaceId =
  | 'club' | 'futures' | 'cage' | 'weight' | 'bullpen' | 'track' | 'fungo' | 'video'
  | 'okinawa' | 'arizona' | 'highland' | 'night' | 'academy';
export interface TrainPlace {
  id: PlaceId;
  name: string;
  /** 한 줄 소개 */
  line: string;
  /** 쓸 수 있는 선수 — 없으면 모두 */
  for?: 'bat' | 'pit';
  /** 특수구질만 훈련하는 곳 */
  sigOnly?: boolean;
  /** 특기 능력치 → 성공 확률 +%p ('*' = 모든 능력치) */
  spec: Partial<Record<TrainKey, number>>;
  /** 비용 화폐 · 배율 */
  pay: 'gp' | 'ball';
  mul: number;
  /** 카드 훈련 단계가 이만큼 이상이어야 열림 */
  need?: number;
}
export const PLACES: TrainPlace[] = [
  { id: 'club', name: '구단 실내 연습장', line: '비가 와도 열려 있는 기본 훈련장이에요.', spec: {}, pay: 'gp', mul: 1 },
  { id: 'futures', name: '퓨처스 구장', line: '2군 선수들과 같이 굴러요. 싸지만 보너스는 없어요.', spec: {}, pay: 'gp', mul: 0.5 },
  { id: 'cage', name: '배팅 케이지', line: '기계 공 300개. 공을 끝까지 봐요.', for: 'bat', spec: { CON: 4, EYE: 4, ADJ: 4 }, pay: 'gp', mul: 1.4 },
  { id: 'weight', name: '웨이트 센터', line: '쇳소리 울리는 지하 체력실이에요.', spec: { POW: 4, GAP: 3, VEL: 4, STA: 4 }, pay: 'gp', mul: 1.4 },
  { id: 'bullpen', name: '불펜 피칭장', line: '포수 미트 소리만 들리는 곳이에요.', for: 'pit', spec: { STF: 4, BRK: 4, CTL: 4, SIG: 2 }, pay: 'gp', mul: 1.4 },
  { id: 'track', name: '스피드 트랙', line: '출발 신호와 초시계뿐이에요.', for: 'bat', spec: { SPD: 5 }, pay: 'gp', mul: 1.3 },
  { id: 'fungo', name: '펑고 훈련장', line: '코치가 쳐 주는 땅볼 천 개.', for: 'bat', spec: { DEF: 4, ARM: 4, BLK: 4, FRM: 3, CS: 4 }, pay: 'gp', mul: 1.3 },
  { id: 'video', name: '전력분석실', line: '영상을 돌려 보며 약점을 찾아요.', spec: { EYE: 3, ADJ: 3, FRM: 4, CTL: 3, MNT: 4 }, pay: 'gp', mul: 1.6, need: 1 },
  { id: 'okinawa', name: '오키나와 캠프', line: '따뜻한 바닷바람 속 2월 전지훈련.', spec: { '*': 2 }, pay: 'gp', mul: 2.5, need: 2 },
  { id: 'arizona', name: '애리조나 캠프', line: '마른 사막 공기에 타구가 멀리 날아요.', for: 'bat', spec: { CON: 3, POW: 5, EYE: 3, GAP: 5, ADJ: 3 }, pay: 'gp', mul: 2.8, need: 3 },
  { id: 'highland', name: '고지대 캠프', line: '해발 1,800m. 숨이 차도 버티면 강해져요.', spec: { STA: 5, REC: 5, MNT: 5, SPD: 3 }, pay: 'gp', mul: 2.2, need: 3 },
  { id: 'night', name: '야간 특타', line: '다들 퇴근한 뒤, 조명 아래 특별 타격.', for: 'bat', spec: { POW: 6, CON: 5, GAP: 6 }, pay: 'ball', mul: 1, need: 4 },
  { id: 'academy', name: '레전드 아카데미', line: '은퇴한 레전드가 특수구질을 직접 가르쳐요.', for: 'pit', sigOnly: true, spec: { SIG: 6 }, pay: 'ball', mul: 3, need: 5 },
];
export const placeById = (id: string | null | undefined): TrainPlace | undefined => PLACES.find((p) => p.id === id);
export const BASIC_PLACE = PLACES[0];

/** 능력치 코드 이름 (장소 특기 표시 — 카드 앞면 이름과 같게) */
export const CODE_KO: Record<string, string> = {
  CON: '컨택', POW: '파워', EYE: '선구', SPD: '주루', DEF: '수비', ARM: '송구', BLK: '블로킹', FRM: '프레이밍', CS: '도루저지', GAP: '장타', ADJ: '대처',
  VEL: '구속', STF: '구위', BRK: '변화', CTL: '제구', STA: '체력', REC: '회복', MNT: '위기관리', SIG: '특수구질',
};
/** 장소 특기 글 — '컨택 · 선구 +4%p · 장타 +3%p' (keys 를 주면 그 능력치만, 없으면 '' ) */
export function specText(place: TrainPlace, keys?: TrainKey[]): string {
  if (place.spec['*'] != null) return `모든 능력치 +${place.spec['*']}%p`;
  const by = new Map<number, string[]>();
  const list = keys ?? Object.keys(place.spec);
  for (const k of list) {
    const v = placeBonus(place, k);
    if (v > 0) by.set(v, [...(by.get(v) ?? []), CODE_KO[k] ?? k]);
  }
  return [...by].sort((a, b) => b[0] - a[0]).map(([v, ns]) => `${ns.join(' · ')} +${v}%p`).join(' · ');
}

/** 이 카드가 이 장소를 못 쓰는 까닭 (쓸 수 있으면 null) */
export function placeLock(place: TrainPlace, p: Player, c: Pick<CardInst, 'signaturePitch'>, lv: number): string | null {
  const isP = p.pos === 'P';
  if (place.for === 'bat' && isP) return '타자 전용';
  if (place.for === 'pit' && !isP) return '투수 전용';
  if (place.sigOnly && !c.signaturePitch) return '특수구질 투수 전용';
  if (place.need && lv < place.need) return `${place.need}단계부터`;
  return null;
}
/** 이 장소에서 이 능력치를 훈련할 수 있나 */
export const keyAtPlace = (place: TrainPlace, key: TrainKey) => (place.sigOnly ? key === SIG : true);

/* ───────── 효과 ───────── */
/** 라인업 팀 종합에 더하는 값 — 오른 값 합 ÷ 4 (반올림, 10단계 다 하면 +6 안팎) */
export const trainOvrBonus = (t: CardTrain | undefined | null) => (t ? Math.round(sumGains(t.gains) / 4) : 0);

/** 대표 능력치 코드 → 경기 엔진 보너스 칸 (season/sim 의 B_MAP · P_MAP 키와 몫). 특수구질은 엔진에 구종별 칸이 없어 구위 · 변화로 */
export const ENGINE_OF: Record<string, [BatKey | PitKey, number][]> = {
  CON: [['con', 1]], POW: [['pow', 1]], EYE: [['eye', 1]], SPD: [['spd', 1], ['stl', 0.5]], DEF: [['def', 1]], ARM: [['arm', 1]],
  BLK: [['def', 1]], FRM: [['def', 0.8]], CS: [['arm', 1]], GAP: [['gap', 1], ['pow', 0.3]], ADJ: [['con', 0.5], ['eye', 0.5]],
  VEL: [['vel', 1]], STF: [['stf', 1]], BRK: [['brk', 1]], CTL: [['ctl', 1]], STA: [['sta', 1]], REC: [['rec', 1]], MNT: [['mnt', 1]],
  SIG: [['stf', 1], ['brk', 0.5]],
};
const BAT_SET = new Set<string>(['con', 'pow', 'gap', 'eye', 'spd', 'stl', 'def', 'arm']);
/** 훈련으로 오른 값 → 엔진 보너스 목록 (세트덱 효과와 같은 모양 { k, v }) — 타자는 타자 칸, 투수는 투수 칸만 */
export function trainFx(t: CardTrain | undefined | null, isP: boolean): { k: BatKey | PitKey; v: number }[] {
  if (!t) return [];
  const acc = new Map<BatKey | PitKey, number>();
  for (const [code, g] of Object.entries(t.gains)) {
    if (!g) continue;
    for (const [k, w] of ENGINE_OF[code] ?? []) {
      if (BAT_SET.has(k) === isP) continue;
      acc.set(k, (acc.get(k) ?? 0) + g * w);
    }
  }
  return [...acc].map(([k, v]) => ({ k, v: Math.round(v * 10) / 10 }));
}
