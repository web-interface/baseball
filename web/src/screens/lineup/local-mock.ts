// 라인업 화면 전용 목업 — game/mock 을 이어 붙여 쓴다 (공용 파일은 고치지 않는다).
// 처음 라인업은 기본 선수단(game/starter — 여러 구단·연도의 노멀·스페셜 + 지명 3 + 특별 선수, 팀 종합 65~68)에서.
import type { CardInst, Player } from '../../game/types';
import { MY_CARD_IDS, cardById, playerById } from '../../game/mock';
import { starter } from '../../game/starter';

export const getCard = (id: string): CardInst | undefined => cardById(id);
export const getPlayer = (id: string): Player | undefined => playerById(id);
/** 선수 화면 #/player/:id 로 보낼 수 있나 */
export const isSharedPlayer = (id: string) => !!playerById(id);

/** 내가 가진 카드 전부 */
export const OWNED: string[] = MY_CARD_IDS;

/** 처음 라인업 — 기본 선수단 (선발 5 · 셋업맨 · 필승조 · 좌완 원포인트 · 추격조 · 롱릴리프 · 마무리) */
export const startLayout = () => starter().lineup;
