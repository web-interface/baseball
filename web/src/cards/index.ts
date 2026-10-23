// 공용 카드 — 화면은 여기서만 가져다 쓴다.
//   <Card {...cardProps(card)} size="m" />          앞면 (live 를 주면 포인터를 따라 빛·기울임 — 상세·뽑기 공개용)
//   <Card {...cardProps(card)} fluid />             격자 칸에 맞춤 (배치는 실제 너비로 자동)
//   <CardMini {...cardProps(card)} badge={1} />     라인업 경기장 위 작은 카드
//   <CardBack grade="signature" />                  뽑기 뒷면 (등급 빛이 살짝)
//   <CardBack {...cardProps(card)} />               기록 뒷면 (대표 능력치 6 · 시즌 기록 · 장비)
export { Card, CardMini, CardBack, cardProps, trainLvOf } from './Card';
export { NameYear } from './front';
export type { CardProps, CardMiniProps, CardBackProps, CardSize } from './Card';
export type { GearPiece, GearSlot, GearGrade } from './gear';
export { SLOT_KO, GEAR_GRADE_KO, gearSet, slotsOf } from './gear';
export type { Serial } from './meta';
export { enName, PARALLEL, cardCode } from './meta';
