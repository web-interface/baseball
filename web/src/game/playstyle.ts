// 플레이스타일 — 강화 V(+5)부터 고르는 카드 성향 (바꾸기 무료). 카드 보너스(game/cardBonus) · 선수 화면이 같이 쓴다.
import type { Player } from './types';

export interface Playstyle { id: string; ko: string; text: string; parts: [string, number][]; icon: 'contact' | 'power' | 'speed' | 'eye' | 'glove' | 'arm' | 'fire' | 'curve' | 'aim' | 'stamina' | 'heart' }
export const PLAYSTYLES_BAT: Playstyle[] = [
  { id: 'contact', ko: '교타자', text: '컨택 +3 · 선구 +2', parts: [['CON', 3], ['EYE', 2]], icon: 'contact' },
  { id: 'slugger', ko: '거포', text: '파워 +4 · 컨택 +1', parts: [['POW', 4], ['CON', 1]], icon: 'power' },
  { id: 'fivetool', ko: '호타준족', text: '파워 +2 · 주루 +3', parts: [['POW', 2], ['SPD', 3]], icon: 'speed' },
  { id: 'onbase', ko: '출루 머신', text: '선구 +4 · 컨택 +1', parts: [['EYE', 4], ['CON', 1]], icon: 'eye' },
  { id: 'glove', ko: '수비 장인', text: '수비 +3 · 송구 +2', parts: [['DEF', 3], ['ARM', 2]], icon: 'glove' },
  { id: 'arm', ko: '강견', text: '송구 +3 · 수비 +2', parts: [['ARM', 3], ['DEF', 2]], icon: 'arm' },
];
export const PLAYSTYLES_PIT: Playstyle[] = [
  { id: 'power', ko: '파이어볼러', text: '구속 +3 · 구위 +2', parts: [['VEL', 3], ['STF', 2]], icon: 'fire' },
  { id: 'finesse', ko: '기교파', text: '변화 +3 · 제구 +2', parts: [['BRK', 3], ['CTL', 2]], icon: 'curve' },
  { id: 'command', ko: '제구 아티스트', text: '제구 +4 · 위기관리 +1', parts: [['CTL', 4], ['MNT', 1]], icon: 'aim' },
  { id: 'eater', ko: '이닝 이터', text: '체력 +4 · 구위 +1', parts: [['STA', 4], ['STF', 1]], icon: 'stamina' },
  { id: 'closer', ko: '클로저 본능', text: '위기관리 +3 · 구속 +2', parts: [['MNT', 3], ['VEL', 2]], icon: 'heart' },
];
export const playstylesFor = (p: Player) => (p.pos === 'P' ? PLAYSTYLES_PIT : PLAYSTYLES_BAT);

/** +5 이상 카드의 지금 플레이스타일 — 대표 능력치가 가장 높은 쪽으로 (목업) */
export function defaultPlaystyle(p: Player): string {
  const f = Object.fromEntries(p.face.map((x) => [x.code, x.v]));
  const list = playstylesFor(p);
  let best = list[0], bestV = -1;
  list.forEach((ps) => {
    const v = ps.parts.reduce((s, [k, w]) => s + (f[k] ?? 50) * w, 0) / ps.parts.reduce((s, [, w]) => s + w, 0);
    if (v > bestV) { bestV = v; best = ps; }
  });
  return best.id;
}

