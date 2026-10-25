// 카드 한 장의 '지금' 값 — 어디서 카드를 그리든(라인업 · 선수 상세 · 보관함 · 카드 시트) 같은 숫자가 나오게.
//  · 라인업에 선 카드: 라인업 계산(evaluate) 그대로 — 종합 = 그 자리 total(강화 · 훈련 · 잠재력 · 플레이스타일 · 세트덱 · 케미 · 적성),
//    대표 능력치 = 받는 보너스 전부(팀 별 셋 잠재력 · 세트덱 포함). 별 셋이 꺼졌으면(엔트리에서 2명만) potOff
//  · 벤치 카드: 카드 자체 보너스만 — 단 별 셋은 꺼짐(엔트리에서만 켜진다 · game/potential teamPotential 과 같게)
//  · 라인업 밖 카드: 카드 자체 보너스만(강화 · 훈련 · 자기 잠재력 · 플레이스타일)
// 라인업 계산은 보유 카드 · 잠재력 · 라인업이 바뀔 때만 다시 한다.
import type { CardInst } from '../../game/types';
import { invVersion, loadLineup } from '../../game/inventory';
import { potTierOf, potVersion } from '../../game/potential';
import { cardBonusOf, ovrBonusOf, type CardBonus } from '../../game/cardBonus';
import { playerOfCard } from '../../game/mock';
import type { SetEffect } from '../../game/sets';
import { evaluate, initialLineup, slotOf, store, type Eval, type LineupState } from './calc';

let cache: { key: string; raw: unknown; st: LineupState; ev: Eval } | null = null;
function current() {
  const key = `${invVersion()}|${potVersion()}`;
  const raw = loadLineup();
  if (cache && cache.key === key && cache.raw === raw) return cache;
  const st = store.get() ?? initialLineup();
  cache = { key, raw, st, ev: evaluate(st) };
  return cache;
}

export interface CardNow {
  ovr: number;
  bonus: CardBonus;
  inLineup: boolean;
  set: SetEffect | null;
  /** 별 셋 잠재력이 꺼짐 (1군 엔트리에서 2명만 · 벤치는 꺼짐) */
  potOff?: boolean;
}
/** 내 카드의 지금 종합 · 받는 보너스 (내 카드가 아니면 null) */
export function cardNow(c: CardInst): CardNow | null {
  if (!c.id) return null;
  try {
    const { st, ev } = current();
    const slot = slotOf(st, c.id);
    const ue = slot ? ev.units[slot] : undefined;
    if (ue?.bonus) return { ovr: Math.round(ue.total), bonus: ue.bonus, inLineup: true, set: ue.set?.cur ?? null, potOff: ue.potOff };
    const p = playerOfCard(c);
    const benchOff = potTierOf(c) === 'S' && st.bench.includes(c.id);
    const bonus = cardBonusOf(c, p, benchOff ? { potFace: {} } : {});
    const base = c.ovr ?? p.ovr;
    return { ovr: Math.round(base + ovrBonusOf(bonus, p)), bonus, inLineup: false, set: null, potOff: benchOff || undefined };
  } catch {
    return null;
  }
}
