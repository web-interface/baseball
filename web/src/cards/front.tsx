// SD 카드 앞면 부품 — 능력 유형 배경 · 날씨 동그라미 그림
import type { Player, WeatherKey } from '../game/types';
import power from './bg/power.webp';
import contact from './bg/contact.webp';
import speed from './bg/speed.webp';
import defense from './bg/defense.webp';
import fastball from './bg/fastball.webp';
import control from './bg/control.webp';
import breaking from './bg/breaking.webp';
import balance from './bg/balance.webp';

/** 능력 유형 — 카드 배경 그림 (파워형이면 용암 · 스피드형이면 번개 …) */
export type CardType = 'power' | 'contact' | 'speed' | 'defense' | 'fastball' | 'control' | 'breaking' | 'balance';
export const CARD_BG: Record<CardType, string> = { power, contact, speed, defense, fastball, control, breaking, balance };
export const TYPE_KO: Record<CardType, string> = {
  power: '파워형', contact: '정교형', speed: '스피드형', defense: '수비형', fastball: '강속구형', control: '제구형', breaking: '변화구형', balance: '균형형',
};
const TYPE_OF: Record<string, CardType> = {
  POW: 'power', CON: 'contact', EYE: 'contact', SPD: 'speed', DEF: 'defense', ARM: 'defense', BLK: 'defense', FRM: 'defense', CS: 'defense',
  VEL: 'fastball', CTL: 'control', MNT: 'control', STF: 'breaking', BRK: 'breaking', STA: 'balance', REC: 'balance',
};

/** 대표 능력치 중 가장 두드러진 것 — 고르게 높으면 균형형 */
export function cardTypeOf(p: Player): CardType {
  if (!p.face.length) return 'balance';
  const top = p.face.reduce((a, b) => (b.v > a.v ? b : a));
  const mean = p.face.reduce((a, b) => a + b.v, 0) / p.face.length;
  if (top.v - mean < 4) return 'balance';
  return TYPE_OF[top.code] ?? 'balance';
}

/** 밝혀진 날씨 체질 중 가장 강한 것 (없으면 null) */
export function weatherOf(p: Player): WeatherKey | null {
  let best: WeatherKey | null = null, v = 0;
  for (const [k, x] of Object.entries(p.weather) as [WeatherKey, number][]) if (x > v) { v = x; best = k; }
  return best;
}
export const WEATHER_KO: Record<WeatherKey, string> = { heat: '더위에 강함', cold: '추위에 강함', rain: '비에 강함', day: '낮 경기에 강함' };

/** 날씨 동그라미 안 그림 — 더위 불꽃 · 추위 눈송이 · 비 우산 · 낮 해 */
export function WxIcon({ k }: { k: WeatherKey | null }) {
  if (!k) return null;
  if (k === 'heat') return (
    <svg viewBox="0 0 20 20" aria-hidden><path d="M10 1.5c1 3.2 5.5 5.2 5.5 10a5.5 5.5 0 0 1-11 0c0-2.6 1.4-4.2 2.7-5.6.2 1.7 1 2.8 2.1 3.3C8.6 6.8 9 4 10 1.5z" fill="#ef4b2a" /><path d="M10 10c.6 1.6 2.6 2.4 2.6 4.4a2.6 2.6 0 0 1-5.2 0c0-1.5 1.2-2.6 2.6-4.4z" fill="#ffc23d" /></svg>
  );
  if (k === 'cold') return (
    <svg viewBox="0 0 20 20" aria-hidden><g stroke="#2f8fe0" strokeWidth="2" strokeLinecap="round"><path d="M10 2v16M3.1 6l13.8 8M3.1 14l13.8-8" /><path d="M7.6 3.4 10 5l2.4-1.6M7.6 16.6 10 15l2.4 1.6" /></g></svg>
  );
  if (k === 'rain') return (
    <svg viewBox="0 0 20 20" aria-hidden><path d="M2 10a8 7 0 0 1 16 0z" fill="#2f6fd6" /><path d="M10 10v6a2 2 0 0 1-4 0" fill="none" stroke="#2a2a30" strokeWidth="1.8" strokeLinecap="round" /><path d="M10 2.5v1.5" stroke="#2a2a30" strokeWidth="1.8" strokeLinecap="round" /></svg>
  );
  return (
    <svg viewBox="0 0 20 20" aria-hidden><circle cx="10" cy="10" r="4.2" fill="#ffb21e" /><g stroke="#ffb21e" strokeWidth="2" strokeLinecap="round"><path d="M10 1.6v2.2M10 16.2v2.2M1.6 10h2.2M16.2 10h2.2M4 4l1.6 1.6M14.4 14.4 16 16M4 16l1.6-1.6M14.4 5.6 16 4" /></g></svg>
  );
}
