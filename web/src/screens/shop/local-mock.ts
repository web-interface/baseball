// 상점 화면만 쓰는 목업 — game/mock 의 SCOUT_SHOP 을 이어 붙인다 (서버가 붙으면 GET /shop/today 응답으로).
// 진열·가격·하루 한도는 코드(가치 평가·수요)가 정하고, 스카우트 말은 Claude 가 말맛만 낸다.
import { ME, PLAYERS, SCOUT_SHOP, cardById } from '../../game/mock';
import { buyFromShop, shopBoughtToday, useInventory, type AddResult } from '../../game/inventory';
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

/** 진열 — 시세(가치 평가 값)와 오늘 가격. soldOut = 다른 감독이 먼저 데려간 선수(내 보관함과 무관) */
export interface ShelfItem extends ShopItem { market?: number }

export const SHELF: ShelfItem[] = SCOUT_SHOP.items.map((it) => ({
  ...it,
  market: it.valueTag === '시세보다 싸요' && it.price.gp ? Math.round((it.price.gp * 1.28) / 1000) * 1000 : undefined,
  scoutNote: it.scoutNote,
}));

/** 스카우트 한마디 — 상황마다 (말맛만, 결과·가격은 코드가 정함) */
export const SCOUT_LINES = {
  open: SCOUT_SHOP.scout.line,
  last: '한 명 남았어요. 오늘 진열에서 제일 아까운 선수로 고르세요.',
  done: '오늘은 여기까지예요. 내일 다섯 시에 새로 데려올게요.',
};

/* ───────── 오늘 산 기록 — 보유 카드 저장소(game/inventory)에 05:00 기준 하루치로 저장(새로고침해도 한도 유지) ───────── */
export function useShop() {
  useInventory();
  const bought = shopBoughtToday();
  const used = bought.length;
  return {
    limit: SCOUT_SHOP.dailyLimit,
    used,
    left: Math.max(0, SCOUT_SHOP.dailyLimit - used),
    isMine: (id: string) => bought.includes(id),
    isTaken: (id: string) => !!SHELF.find((x) => x.id === id)?.soldOut && !bought.includes(id),
  };
}

/** 데려오기 (목업 서버 — 하루 한도 · 다른 감독이 데려감 · 이미 데려옴이면 거절) → 보관함에 바로 넣는다 */
export function buy(id: string): AddResult | null {
  const it = SHELF.find((x) => x.id === id);
  const card = it ? cardById(it.cardId) : undefined;
  if (!it || !card || it.soldOut) return null;
  const bought = shopBoughtToday();
  if (bought.length >= SCOUT_SHOP.dailyLimit || bought.includes(id)) return null;
  return buyFromShop(id, { ...card, enhance: 0, dup: 0, isNew: false });
}

/** 다음 05:00 까지 남은 초 */
export function secondsToRefresh(now = new Date()) {
  const next = new Date(now);
  next.setHours(5, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return Math.max(0, Math.round((next.getTime() - now.getTime()) / 1000));
}
