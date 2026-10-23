// 라인업 표시 — 강화 · 훈련 · 잠재력을 줄마다 멋지게, 최고 잠재력이 켜지면 위에 '잠재력 발동' 띠
import { useSyncExternalStore } from 'react';
import type { CardInst, Player } from '../../game/types';
import { roman } from '../../ui/format';
import { trainLvOf } from '../../cards';
import { TIER_KO, fxText, potVersion, potentialsOf, shownPickOf, subscribePot } from '../../game/potential';
import { BAT_SLOTS, STAFF_SLOTS, getSlot, unit, type LineupState } from './calc';
import m from './Marks.module.css';

const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

/** 그 카드에 켜진 잠재력 (없으면 null) */
function potOf(card: CardInst, p: Player) {
  const k = shownPickOf(card.id);
  return k >= 0 ? potentialsOf(p, card.grade)[k] ?? null : null;
}

/** 표시할 것이 있나 (강화 · 훈련 · 잠재력) */
export const hasMarks = (card: CardInst) => card.enhance > 0 || trainLvOf(card) > 0 || shownPickOf(card.id) >= 0;

/** 줄 안 표시 — 강화 · 훈련 · 잠재력 */
export function Marks({ card, player }: { card: CardInst; player: Player }) {
  useSyncExternalStore(subscribePot, potVersion);
  const tl = trainLvOf(card);
  const pot = potOf(card, player);
  if (!card.enhance && !tl && !pot) return null;
  return (
    <span className={m.marks}>
      {card.enhance > 0 && <span className={cx(m.enh, card.enhance >= 10 && m.enhMax)} title={`강화 ${roman(card.enhance)}`}>강화 {roman(card.enhance)}</span>}
      {tl > 0 && <span className={cx(m.tr, tl >= 5 && m.trLit, tl >= 10 && m.trMax)} title={`훈련 ${tl}단계`}>{tl >= 10 ? '훈련 MAX' : `훈련 ${tl}`}</span>}
      {pot && <span className={cx(m.pot, m['p' + pot.tier])} title={`${TIER_KO[pot.tier]} 잠재력 · ${fxText(pot.fx)}`}><i aria-hidden />{pot.name}</span>}
    </span>
  );
}

/** 라인업 위 — 엔트리에 최고 잠재력(팀 전원 효과)이 켜져 있으면 발동 띠, 상급은 작은 줄 */
export function PotBanner({ st }: { st: LineupState }) {
  useSyncExternalStore(subscribePot, potVersion);
  const ids = [...BAT_SLOTS.map((s) => st.field[s]), ...STAFF_SLOTS.map((s) => getSlot(st, s))].filter((x): x is string => !!x);
  const on = ids.map((id) => { const u = unit(id); return { u, pot: potOf(u.card, u.player) }; }).filter((x) => x.pot && x.pot.tier !== 'C');
  if (!on.length) return null;
  const best = on.filter((x) => x.pot!.tier === 'S');
  const good = on.filter((x) => x.pot!.tier === 'A');
  return (
    <section className={cx(m.banner, best.length > 0 && m.bannerS)} aria-label="잠재력 발동">
      {best.length > 0 && <i className={m.shine} aria-hidden />}
      <p className={m.bHead}>
        <b>{best.length ? '최고 잠재력 발동' : '잠재력 발동'}</b>
        <span><span className="num">{on.length}</span>명</span>
      </p>
      <ul className={m.bList}>
        {[...best, ...good].map(({ u, pot }) => (
          <li key={u.id} className={pot!.tier === 'S' ? m.liS : m.liA}>
            <span className={cx(m.pot, m['p' + pot!.tier])}><i aria-hidden />{pot!.name}</span>
            <span className={m.who}>{u.player.name}</span>
            <small>{fxText(pot!.fx)}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}
