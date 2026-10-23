// 옛 시즌 선수단 — 연도팩·구단팩·옛 구단 지명 후보가 '그 해 · 그 구단' 선수를 쓰는 한 곳.
//  · 실제 선수 카탈로그(game/kbo — 실제 KBO 기록을 바뀐 이름·고정 ID 로 옮긴 값)의 그 해 · 그 구단(가상 코드) 선수.
//  · 카탈로그에 그 구단·그 해 선수가 하나도 없을 때만(수집되지 않은 해) 레거시 가상 선수단(game/legacy/history)으로 채운다.
//  · 2027(게임 속 이번 시즌)은 실제 기록이 없어 그 구단의 '지금' 선수단(최근 세 시즌 중 마지막 시즌을 그 구단에서 보낸 선수)을 쓴다.
import { currentRoster, kboRoster } from './kbo';
import { legacyRoster } from './legacy/history';
import { clubsIn, eraOfCode } from './world';
import type { ClubCode, Player } from './types';

/** 실제 기록이 있는 마지막 해 */
export const LAST_REAL_SEASON = 2026;

/** 그 해 그 구단 선수단 (그 해 리그에 없던 구단이면 빈 배열) */
export function seasonRoster(code: ClubCode, year: number): Player[] {
  const [from, to] = eraOfCode(code);
  if (year < from || year > to) return [];
  if (year > LAST_REAL_SEASON) {
    const now = currentRoster(code, LAST_REAL_SEASON);
    return now.length ? now : legacyRoster(code, year);
  }
  const real = kboRoster(code, year);
  return real.length ? real : legacyRoster(code, year);
}

/** 연도팩 — 그 해 리그에 있던 모든 구단 선수 */
export function yearPool(year: number): Player[] {
  return clubsIn(year).flatMap((c) => seasonRoster(c, year));
}
