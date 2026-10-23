// 상점 화면만 쓰는 목업 — game/mock 의 SCOUT_SHOP 을 이어 붙인다 (서버가 붙으면 GET /shop/today 응답으로).
// 진열·가격·하루 한도는 코드(가치 평가·수요)가 정하고, 스카우트 말은 Claude 가 말맛만 낸다.
import { ME, PLAYERS, SCOUT_SHOP, cardById } from '../../game/mock';
import { buyFromShop, gameDay, shopBoughtToday, useInventory, type AddResult } from '../../game/inventory';
import { kboCardsWhere, kboPerson, playerOfKCard, type KCard } from '../../game/kbo';
import { shortLabel } from '../../game/world';
import type { GradeId } from '../../game/types';
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

//  · 진열은 실제 선수 카탈로그(game/kbo)에서 하루(05시 기준)마다 6장 — 같은 날엔 늘 같은 진열(날짜 시드).
//    자리: 레어 2 · 엘리트 1 · GG 1 · MVP 또는 TH 1 · 스페셜 1. 가격은 등급표. 다섯째 칸은 '다른 감독이 먼저 데려감'.
//    카탈로그가 비어 있으면(수집 전 자료) 목업 진열 그대로.
function h32(s2: string) {
  let h = 2166136261;
  for (let i = 0; i < s2.length; i++) { h ^= s2.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const PRICE: Partial<Record<GradeId, ShopItem['price']>> = {
  special: { gp: 39000 }, rare: { gp: 132000 }, elite: { gp: 168000 }, gg: { ball: 260 }, th: { ball: 300 }, mvp: { ball: 900 },
};
function noteOf(c: KCard): string {
  const p = playerOfKCard(c);
  const person = kboPerson(c.kid);
  const yy = c.year != null ? `’${String(c.year).slice(-2)} ` : '';
  const club = shortLabel(c.code);
  if (!p || !person) return '오늘 눈여겨본 선수예요.';
  if (p.season.pit) {
    const t = p.season.pit;
    const main = p.role === 'CL' ? `${t.sv}세이브` : p.role === 'RP' ? `${t.hld}홀드` : `${t.w}승`;
    return `${yy}${club} 시절 평균자책 ${t.era.toFixed(2)} · ${main}. ${c.grade === 'mvp' ? '그 해 MVP예요.' : c.grade === 'th' ? '그 해 타이틀을 땄어요.' : '마운드가 급하면 이 친구예요.'}`;
  }
  const b = p.season.bat;
  if (!b) return '오늘 눈여겨본 선수예요.';
  return `${yy}${club} 시절 타율 ${b.avg.toFixed(3).replace(/^0/, '')} · 홈런 ${b.hr}. ${c.grade === 'gg' ? '그 해 골든글러브예요.' : b.sb >= 25 ? '발이 진짜 빨라요.' : b.hr >= 25 ? '한 방이 필요하면 이 친구예요.' : '빈 자리를 메우기 좋아요.'}`;
}
function shelfOf(day: string): ShelfItem[] {
  const slots: GradeId[][] = [['rare'], ['elite'], ['rare'], ['gg'], ['mvp', 'th'], ['special']];
  const used = new Set<string>();
  const out: ShelfItem[] = [];
  slots.forEach((gs, i) => {
    const pool = gs.flatMap((g) => kboCardsWhere({ grade: g })).filter((c) => !used.has(c.kid));
    if (!pool.length) return;
    const c = pool[h32(`shop:${day}:${i}`) % pool.length];
    used.add(c.kid);
    out.push({
      id: `s-${day}-${i}`, cardId: c.id, price: PRICE[c.grade] ?? { gp: 50000 },
      valueTag: i === 0 ? '시세보다 싸요' : i === 2 ? '오늘만' : c.grade === 'mvp' || c.grade === 'gg' ? '잘 안 나와요' : undefined,
      scoutNote: noteOf(c), soldOut: i === 4,
    });
  });
  return out;
}
const kboShelf = shelfOf(gameDay());
const baseShelf: ShopItem[] = kboShelf.length >= 4 ? kboShelf : SCOUT_SHOP.items;
export const SHELF: ShelfItem[] = baseShelf.map((it) => ({
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
