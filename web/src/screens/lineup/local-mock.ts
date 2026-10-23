// 라인업 화면 전용 — 카드는 보유 카드 저장소(game/inventory)에서 읽는다(강화 · 레벨이 반영된 내 카드).
// 처음 라인업은 기본 선수단(game/starter — 여러 구단·연도의 노멀·스페셜 + 지명 3 + 특별 선수, 팀 종합 65~68)에서.
import type { CardInst, Player } from '../../game/types';
import { cardById, playerById } from '../../game/mock';
import { starter } from '../../game/starter';
import { ownedCard, ownedIds } from '../../game/inventory';

/** 내 카드면 내 강화·레벨이 들어간 카드, 아니면 카드 정의 */
export const getCard = (id: string): CardInst | undefined => ownedCard(id) ?? cardById(id);
export const getPlayer = (id: string): Player | undefined => playerById(id);
/** 선수 화면 #/player/:id 로 보낼 수 있나 */
export const isSharedPlayer = (id: string) => !!playerById(id);

/** 내가 가진 카드 전부 (보유 카드 저장소) */
export const owned = (): string[] => ownedIds();

/** 처음 라인업 — 기본 선수단 (선발 5 · 셋업맨 · 필승조 · 좌완 원포인트 · 추격조 · 롱릴리프 · 마무리) */
export const startLayout = () => starter().lineup;
