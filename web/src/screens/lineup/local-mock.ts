// 라인업 화면 전용 목업 — game/mock 을 이어 붙여 쓴다 (공용 파일은 고치지 않는다).
// 독수리스 좌익수 사공린(lp1·lc1)·지명타자 서문혁(lp2·lc2)은 공용 목업(game/mock)으로 옮겼다.
import type { CardInst, Player } from '../../game/types';
import { LINEUP, MY_CARD_IDS, cardById, playerById } from '../../game/mock';

export const getCard = (id: string): CardInst | undefined => cardById(id);
export const getPlayer = (id: string): Player | undefined => playerById(id);
/** 선수 화면 #/player/:id 로 보낼 수 있나 */
export const isSharedPlayer = (id: string) => !!playerById(id);

/** 내가 가진 카드 전부 */
export const OWNED: string[] = MY_CARD_IDS;

/** 처음 라인업 — game/mock LINEUP + 투수진 5·5 칸 + 벤치에 독수리스 두 명 */
export const START = {
  batting: LINEUP.batting,
  rotation: [LINEUP.sp, ...LINEUP.rotation.filter((c) => c !== LINEUP.sp), 'c46', null] as (string | null)[],
  // 셋업맨 · 필승조 · 좌완 원포인트 · 추격조 · 롱릴리프
  bullpen: ['c40', 'c20', 'c12', 'c11', null] as (string | null)[],
  closer: LINEUP.closer,
  bench: [...LINEUP.bench, 'lc1', 'lc2'],
};
