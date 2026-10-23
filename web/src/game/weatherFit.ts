// 날씨 궁합 — 선수마다 궁합 날씨 하나(+) · 그 반대가 상극(−): 더위 ↔ 추위 · 비 ↔ 낮 경기.
//  · 실제 선수 기록엔 날씨 체질이 없어서 선수 ID 로 정해 둔다(늘 같음). 카드 오른쪽 위 동그라미 = 궁합 날씨.
//  · 경기 조건(season/weather gameWx): 더위 27°C 이상 · 추위 13°C 이하 · 비(경기 중 약한 비 — 돔은 없음) · 낮 경기(17시까지 시작).
//    돔 구장은 더위 · 추위 · 비가 없다(낮 경기만).
//  · 효과(경기 엔진 · 라인업 표시): 궁합이 맞으면 주요 능력 +FIT(타자 컨택 · 파워, 투수 제구 · 구위), 상극이면 −FIT.
//    조건이 여럿이면 더하고 −1~+1 로 자른다. 우리 구단 · AI 구단 똑같이.
import type { Player, WeatherKey } from './types';
import type { BatKey, PitKey } from './sets';

export const WX_KEYS: WeatherKey[] = ['heat', 'cold', 'rain', 'day'];
export const OPPOSITE: Record<WeatherKey, WeatherKey> = { heat: 'cold', cold: 'heat', rain: 'day', day: 'rain' };
export const WX_LABEL: Record<WeatherKey, string> = { heat: '더위', cold: '추위', rain: '비', day: '낮 경기' };
/** 궁합 · 상극 한 번에 오르내리는 엔진 능력치 */
export const FIT = 3;

function h32(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** 실제 선수 날씨 체질 — 선수 ID 로 고정. 궁합 +2 · 상극 −2 (더위 30% · 낮 25% · 비 23% · 추위 22%) */
export function defaultWeather(kid: string): Partial<Record<WeatherKey, number>> {
  const r = h32('wx:' + kid) % 100;
  const good: WeatherKey = r < 30 ? 'heat' : r < 55 ? 'day' : r < 78 ? 'rain' : 'cold';
  return { [good]: 2, [OPPOSITE[good]]: -2 };
}

/** 그 선수의 궁합 · 상극 날씨 (없으면 null) */
export function fitOf(p: Pick<Player, 'weather'>): { good: WeatherKey | null; bad: WeatherKey | null } {
  let good: WeatherKey | null = null, bad: WeatherKey | null = null, hi = 0, lo = 0;
  for (const k of WX_KEYS) {
    const v = p.weather?.[k] ?? 0;
    if (v > hi) { hi = v; good = k; }
    if (v < lo) { lo = v; bad = k; }
  }
  return { good, bad };
}

/** 경기 조건 → 그날 걸리는 날씨들 */
export function condsOf(w: { tC: number; dome: boolean; wet: boolean; day: boolean }): WeatherKey[] {
  const c: WeatherKey[] = [];
  if (!w.dome && w.tC >= 27) c.push('heat');
  if (!w.dome && w.tC <= 13) c.push('cold');
  if (!w.dome && w.wet) c.push('rain');
  if (w.day) c.push('day');
  return c;
}

/** 오늘 이 선수 — +1 궁합 · −1 상극 · 0 */
export function fitScore(p: Pick<Player, 'weather'>, conds: WeatherKey[]): -1 | 0 | 1 {
  let s = 0;
  for (const k of conds) {
    const v = p.weather?.[k] ?? 0;
    if (v >= 1) s += 1;
    else if (v <= -1) s -= 1;
  }
  return (s > 0 ? 1 : s < 0 ? -1 : 0);
}

/** 엔진 보너스 { k, v } — 타자 컨택 · 파워, 투수 제구 · 구위 */
export function weatherFx(p: Pick<Player, 'weather' | 'pos'>, conds: WeatherKey[]): { k: BatKey | PitKey; v: number }[] {
  const sc = fitScore(p, conds);
  if (!sc) return [];
  const v = sc * FIT;
  return p.pos === 'P' ? [{ k: 'ctl', v }, { k: 'stf', v }] : [{ k: 'con', v }, { k: 'pow', v }];
}

/** 조건 글 ('더위 · 낮 경기') */
export const condsText = (conds: WeatherKey[]) => conds.map((k) => WX_LABEL[k]).join(' · ');
