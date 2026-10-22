// 이름표 옆 카드 표시 — "연이준 ’27" · 레전드처럼 연도 없는 카드는 등급 약자(FR · BK …).
// 경기 기록에 따로 적혀 있으면(대전 스냅샷 · 시즌 경기) 그것, 아니면 그 선수 카드(내 카드 먼저), 카드가 없는 선수는 이번 시즌 ’27.
import { CARDS, MY_CARD_IDS, playerById } from '../../game/mock';
import { GRADES } from '../../game/grades';
import { GAME } from './local-mock';

const cache = new Map<string, string>();
export function tagOf(id: string): string {
  const t = GAME.tags?.[id];
  if (t) return t;
  const hit = cache.get(id);
  if (hit != null) return hit;
  const cards = CARDS.filter((c) => c.playerId === id);
  const c = cards.find((x) => MY_CARD_IDS.includes(x.id)) ?? cards[0];
  const tag = c ? (c.year != null ? `’${String(c.year % 100).padStart(2, '0')}` : GRADES[c.grade].short) : '’27';
  cache.set(id, tag);
  return tag;
}

/** 좁은 화면 — 성(첫 글자)은 빼고 이름만 */
export function nameOf(id: string, compact: boolean): string {
  const n = playerById(id)?.name ?? '';
  if (!compact || n.length <= 2 || n.includes(' ')) return n;
  return n.slice(-2);
}
