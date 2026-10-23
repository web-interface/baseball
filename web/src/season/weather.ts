// 경기 날씨 · 비 취소 — 날짜 · 홈 구장 · 시즌 시드로 정해진다(엔진 없이 계산 — 홈 화면이 바로 쓴다).
import { teamById } from '../game/mock';
import type { WeatherKey } from '../game/types';
import { condsOf } from '../game/weatherFit';

function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const u01 = (s: string) => hash(s) / 4294967296;
export function weatherOf(date: string, homeId: string, seed: string) {
  const m = Number(date.slice(5, 7));
  // 개막(3월 말) 저녁은 쌀쌀하다 — 3월 10° · 4월 15° · 5월 20° …
  const base = m <= 3 ? 10 : m === 4 ? 15 : m === 5 ? 20 : m === 6 ? 24 : m === 7 ? 28 : m === 8 ? 29 : m === 9 ? 25 : 18;
  const tC = Math.round(base + (u01(`t:${seed}:${date}:${homeId}`) - 0.5) * 6);
  const dome = teamById(homeId).stadium.roof === 'dome';
  const windMs = dome ? 0 : Math.round(u01(`w:${seed}:${date}:${homeId}`) * 55) / 10;
  const windFromDeg = Math.round(u01(`d:${seed}:${date}:${homeId}`) * 359);
  // 경기 중 약한 비 (취소될 만큼은 아님) — 장마 열에 셋 · 8월 열에 하나 · 그 밖엔 스물에 하나. 돔은 없음
  const md = date.slice(5);
  const wetP = md >= '06-25' && md <= '07-25' ? 0.3 : md >= '08-01' && md <= '08-31' ? 0.1 : 0.05;
  const wet = !dome && u01(`wet:${seed}:${date}:${homeId}`) < wetP;
  // 낮 경기 — 토 17시 · 일 14시 (schedule startTime 과 같은 규칙)
  const dow = new Date(date + 'T00:00:00Z').getUTCDay();
  const day = dow === 6 || dow === 0;
  return { tC, windMs, windFromDeg, dome, wet, day };
}
/** 그 경기에 걸리는 날씨 (날씨 궁합 — game/weatherFit) */
export function gameConds(date: string, homeId: string, seed: string): WeatherKey[] {
  return condsOf(weatherOf(date, homeId, seed));
}
/** 비로 취소되나 — 장마(6/25~7/25) 열에 하나쯤, 그 밖엔 드물게. 돔은 안 취소 */
export function rainedOut(date: string, homeId: string, seed: string) {
  if (teamById(homeId).stadium.roof === 'dome') return false;
  const md = date.slice(5);
  const p = md >= '06-25' && md <= '07-25' ? 0.09 : md >= '08-01' && md <= '08-31' ? 0.03 : 0.015;
  return u01(`rain:${seed}:${date}:${homeId}`) < p;
}

