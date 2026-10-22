// 상점 화면만 쓰는 목업 — game/mock 의 SCOUT_SHOP 을 이어 붙인다 (서버가 붙으면 GET /shop/today 응답으로).
// 진열·가격·하루 한도는 코드(가치 평가·수요)가 정하고, 스카우트 말은 Claude 가 말맛만 낸다.
import { useSyncExternalStore } from 'react';
import { ME, PLAYERS, SCOUT_SHOP } from '../../game/mock';
import type { Player, ShopItem } from '../../game/types';

/** 스카우트 — 선수 그림 생성기로 그린 사람 (나이 56 · 구단 점퍼) */
export const SCOUT: { person: Player; name: string; role: string; years: number } = {
  person: {
    ...PLAYERS[0],
    id: 'scout-no', name: '노 스카우트', teamId: ME.teamId, number: 0, pos: 'C', role: undefined,
    bats: 'R', throws: 'R', age: 56, heightCm: 174, weightKg: 82, origin: 'KR', look: 'look:scout-no-3',
  },
  name: '노 스카우트',
  role: '스카우트 팀장',
  years: 22,
};

/** 진열 — 시세(가치 평가 값)와 오늘 가격. 다 팔림은 '오늘 내가 이미 데려온 선수' */
export interface ShelfItem extends ShopItem { market?: number }

export const SHELF: ShelfItem[] = SCOUT_SHOP.items.map((it) => ({
  ...it,
  market: it.valueTag === '시세보다 싸요' && it.price.gp ? Math.round((it.price.gp * 1.28) / 1000) * 1000 : undefined,
  scoutNote: it.soldOut ? '중견수 수비는 이제 걱정 없어요. 오늘 아침에 데려오셨죠.' : it.scoutNote,
}));

/** 스카우트 한마디 — 상황마다 (말맛만, 결과·가격은 코드가 정함) */
export const SCOUT_LINES = {
  open: SCOUT_SHOP.scout.line,
  last: '한 명 남았어요. 오늘 진열에서 제일 아까운 선수로 고르세요.',
  done: '오늘은 여기까지예요. 내일 다섯 시에 새로 데려올게요.',
};

/* ───────── 오늘 산 기록 (목업 서버 — 하루 한도) ───────── */
const state = {
  bought: new Set(SHELF.filter((x) => x.soldOut).map((x) => x.id)),
  version: 0,
};
const listeners = new Set<() => void>();

export function useShop() {
  useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => state.version);
  const used = Math.max(SCOUT_SHOP.bought, state.bought.size);
  return {
    limit: SCOUT_SHOP.dailyLimit,
    used,
    left: Math.max(0, SCOUT_SHOP.dailyLimit - used),
    isMine: (id: string) => state.bought.has(id),
  };
}

/** 데려오기 (목업 서버 — 하루 한도를 넘으면 거절) */
export function buy(id: string): boolean {
  const used = Math.max(SCOUT_SHOP.bought, state.bought.size);
  if (used >= SCOUT_SHOP.dailyLimit || state.bought.has(id)) return false;
  state.bought.add(id);
  state.version++;
  listeners.forEach((l) => l());
  return true;
}

/** 다음 05:00 까지 남은 초 */
export function secondsToRefresh(now = new Date()) {
  const next = new Date(now);
  next.setHours(5, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return Math.max(0, Math.round((next.getTime() - now.getTime()) / 1000));
}
