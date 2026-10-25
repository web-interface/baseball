// 화면 종합 점수 눈금 — 사용자 지시 10-25 밤 "등급마다 5씩 차이, 블랙 이하는 100 이하, 시그니처만 100 넘게".
//   노멀 45~55 · 스페셜 56~60 · 레어 61~65 · 엘리트 66~70 · GG 71~75 · 레전드 76~80 · TH 81~85 · MVP 86~90 · 프랜차이즈 91~95 · 블랙 96~100 · 시그니처 101~105
//   경기 엔진도 이 눈금 숫자를 받는다 — season/sim toPlayerIn 이 능력치 · 구종에 같은 몫을 더하고, 리그 기준점(levelRef)을 두 팀 평균 몫으로 맞춘다.
//   AI 세기 · 리그 단계 기준 · 저장된 숫자 · 팀 종합 계산은 예전 눈금(힘 눈금) 그대로 — 화면에 보일 때만 이 눈금으로.
//   · 카드 한 장: 그 등급 구간 안에서 원래 순서 그대로 — showCardOvr
//   · 팀 종합 · AI 구단 · 카드 없는 선수: 등급 구간을 잇는 꺾은선 — showOvr
//   · 대표 능력치 · 깊은 능력치: 그 카드 종합이 바뀐 만큼 같이 — faceShift
//   · 강화 · 훈련 같은 더해진 값은 1:1 그대로 더한다 (경기 엔진도 1:1)
import type { CardInst, GradeId, Player } from './types';
import { kboCards } from './kbo';

/** 화면 눈금 — 등급마다 5씩 */
export const SHOW_BAND: Partial<Record<GradeId, [number, number]>> = {
  normal: [45, 55], special: [56, 60], rare: [61, 65], elite: [66, 70],
  gg: [71, 75], legend: [76, 80], th: [81, 85], mvp: [86, 90], franchise: [91, 95], black: [96, 100], signature: [101, 105],
};
const ORDER: GradeId[] = ['normal', 'special', 'rare', 'elite', 'gg', 'legend', 'th', 'mvp', 'franchise', 'black', 'signature'];

/** 힘 눈금에서 등급마다 실제 카드 종합의 범위 (카탈로그에서 한 번 잰다) */
let POWER: Partial<Record<GradeId, [number, number]>> | null = null;
let KNOTS: [number, number][] | null = null;
function powerBands() {
  if (POWER) return POWER;
  const out: Partial<Record<GradeId, [number, number]>> = {};
  for (const c of kboCards()) {
    const b = out[c.grade];
    out[c.grade] = b ? [Math.min(b[0], c.ovr), Math.max(b[1], c.ovr)] : [c.ovr, c.ovr];
  }
  POWER = out;
  return out;
}
/** 꺾은선 마디 — 등급 구간 끝점들(붙어 있는 경계는 가운데 한 점으로) */
function knots() {
  if (KNOTS) return KNOTS;
  const P = powerBands();
  const k: [number, number][] = [];
  for (const g of ORDER) {
    const p = P[g], s = SHOW_BAND[g];
    if (!p || !s) continue;
    const lo: [number, number] = [p[0], s[0]], hi: [number, number] = [Math.max(p[1], p[0] + 1), s[1]];
    const last = k[k.length - 1];
    if (last && lo[0] <= last[0]) { k[k.length - 1] = [(last[0] + lo[0]) / 2, (last[1] + lo[1]) / 2]; } else k.push(lo);
    k.push(hi);
  }
  KNOTS = k;
  return k;
}

/** 힘 눈금 숫자 → 화면 숫자 (팀 종합 · AI 구단 · 카드 없는 선수) */
export function showOvr(power: number): number {
  const k = knots();
  if (!k.length || !Number.isFinite(power)) return Math.round(power);
  if (power <= k[0][0]) return Math.round(k[0][1] - (k[0][0] - power));
  for (let i = 1; i < k.length; i++) {
    const [x0, y0] = k[i - 1], [x1, y1] = k[i];
    if (power <= x1) return Math.round(y0 + ((power - x0) / Math.max(1e-6, x1 - x0)) * (y1 - y0));
  }
  const [xl, yl] = k[k.length - 1];
  return Math.round(yl + (power - xl) * 0.5);
}

/** 카드 한 장의 기본 종합(강화 등 더해진 값 빼고) → 화면 숫자 — 그 등급 구간 안 자리 그대로 */
export function showCardOvr(grade: GradeId, power: number): number {
  const s = SHOW_BAND[grade], p = powerBands()[grade];
  if (!s || !p) return showOvr(power);
  const t = p[1] > p[0] ? (power - p[0]) / (p[1] - p[0]) : 0.5;
  return Math.round(s[0] + Math.max(0, Math.min(1, t)) * (s[1] - s[0]));
}

/** 카드 → 화면 기본 종합 · 바뀐 몫(대표 능력치 · 깊은 능력치에 같이 더한다) */
export function cardShow(c: Pick<CardInst, 'grade' | 'ovr'>, playerOvr: number): { ovr: number; shift: number } {
  const base = c.ovr ?? playerOvr;
  const ovr = showCardOvr(c.grade, base);
  return { ovr, shift: ovr - base };
}
/** 화면 숫자 — 카드 기본 종합(힘) + 더해진 값(1:1) */
export const showWith = (c: Pick<CardInst, 'grade' | 'ovr'>, playerOvr: number, powerNow: number) => Math.round(powerNow + cardShow(c, playerOvr).shift);
/** 대표 능력치 · 깊은 능력치 화면 몫 */
export const faceShift = (c: Pick<CardInst, 'grade' | 'ovr'>, playerOvr: number) => cardShow(c, playerOvr).shift;
/** 카드 없는 선수(상대 · 스냅숏)의 화면 몫 */
export const playerShift = (powerOvr: number) => showOvr(powerOvr) - powerOvr;

/** 눈금 몫을 더한 선수 사본 — 종합 · 깊은 능력치 · 구종 위력/제구 · 대표 능력치 (성향 칸 '…Tend' 은 그대로).
 *  경기 엔진도 같은 몫을 받는다(season/sim toPlayerIn) — 여기 보이는 능력치가 경기에 들어가는 능력치 */
export function shiftPlayer(p: Player, shift: number, ovr?: number): Player {
  if (!shift && ovr == null) return p;
  const attrs = { ...p.attrs };
  for (const k of Object.keys(attrs) as (keyof typeof attrs)[]) {
    const v = attrs[k];
    if (typeof v === 'number' && !/Tend$/.test(String(k))) attrs[k] = v + shift;
  }
  return {
    ...p, ovr: ovr ?? Math.round(p.ovr + shift), attrs,
    face: p.face.map((f) => ({ ...f, v: f.v + shift })),
    pitches: p.pitches?.map((x) => ({ ...x, stuff: x.stuff + shift, command: x.command + shift })),
  };
}
/** 카드 → 화면용 선수 (카드 종합 · 등급 몫(boost) · 눈금 몫) */
export function cardViewPlayer(c: Pick<CardInst, 'grade' | 'ovr' | 'boost'>, p: Player): Player {
  const { ovr, shift } = cardShow(c, p.ovr);
  return shiftPlayer(p, shift, ovr);
}

/** 팀 종합 게이지 눈금 (화면 눈금) — 리그 단계 기준선(힘 눈금 80 · 100 · 110)도 화면 눈금으로 */
export const GAUGE = { min: 45, max: 105, ticks: () => [80, 100, 110].map(showOvr) };
