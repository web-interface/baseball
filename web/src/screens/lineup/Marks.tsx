// 라인업 표시 — 강화 · 훈련 · 잠재력을 줄마다 멋지게, 별 둘 · 셋 잠재력이 켜지면 위에 '잠재력 발동' 띠.
// 잠재력은 글자 등급 대신 별 배지(ui/PotBadge) + 별명. 별 셋은 1군 엔트리에서 2명만 켜진다 — 3명 이상이면 띠에서 고르기 시트(PotPickSheet)
import { useState, useSyncExternalStore } from 'react';
import type { CardInst, Player } from '../../game/types';
import { roman } from '../../ui/format';
import { Icon } from '../../ui';
import { PotBadge } from '../../ui/PotBadge';
import { trainLvOf } from '../../cards';
import { S_MAX, fxText, hasPotential, potOf, potVersion, sPlan, shownPotOf, subscribePot, tierMark, type Potential } from '../../game/potential';
import { potEntryOf, type LineupState } from './calc';
import { cardNow } from './ctx';
import { PotPickSheet } from './PotPickSheet';
import m from './Marks.module.css';

const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

/** 표시할 것이 있나 (강화 · 훈련 · 잠재력) */
export const hasMarks = (card: CardInst) => card.enhance > 0 || trainLvOf(card) > 0 || hasPotential(card.id);

/** 줄 안 표시 — 강화 · 훈련 · 잠재력 (별 셋이 꺼졌으면 흐리게 '꺼짐') */
export function Marks({ card, player }: { card: CardInst; player: Player }) {
  useSyncExternalStore(subscribePot, potVersion);
  const tl = trainLvOf(card);
  const pot = shownPotOf(card, player);
  if (!card.enhance && !tl && !pot) return null;
  const off = !!pot && pot.tier === 'S' && !!cardNow(card)?.potOff;
  return (
    <span className={m.marks}>
      {card.enhance > 0 && <span className={cx(m.enh, card.enhance >= 10 && m.enhMax)} title={`강화 ${roman(card.enhance)}`}>강화 {roman(card.enhance)}</span>}
      {tl > 0 && <span className={cx(m.tr, tl >= 5 && m.trLit, tl >= 10 && m.trMax)} title={`훈련 ${tl}단계`}>{tl >= 10 ? '훈련 MAX' : `훈련 ${tl}`}</span>}
      {pot && <PotMark pot={pot} off={off} />}
    </span>
  );
}

function PotMark({ pot, off }: { pot: Potential; off?: boolean }) {
  return (
    <span className={cx(m.pot, m['p' + pot.tier], off && m.pOff)} title={`잠재력 ${tierMark(pot.tier)} ${pot.name} · ${off ? '꺼짐 (★★★ 는 엔트리에서 2명만)' : fxText(pot.fx)}`}>
      <PotBadge tier={pot.tier} size="xs" off={off} />
      <b>{pot.name}</b>
      {off && <em>꺼짐</em>}
    </span>
  );
}

/** 라인업 위 — 엔트리에 별 둘 · 셋이 켜져 있으면 발동 띠. 별 셋이 3명 이상이면 켤 2명 고르기 */
export function PotBanner({ st }: { st: LineupState }) {
  useSyncExternalStore(subscribePot, potVersion);
  const [open, setOpen] = useState(false);
  const entry = potEntryOf(st);
  const plan = sPlan(entry);
  const good = entry.map((u) => ({ id: u.card.id, player: u.player, pot: potOf(u.card, u.player) })).filter((x): x is { id: string; player: Player; pot: Potential } => x.pot?.tier === 'A');
  const best = [...plan.rows].sort((a, b) => Number(b.on) - Number(a.on));
  const lit = best.filter((r) => r.on).length;
  if (!best.length && !good.length) return null;
  return (
    <section className={cx(m.banner, lit > 0 && m.bannerS)} aria-label="잠재력 발동">
      {lit > 0 && <i className={m.shine} aria-hidden />}
      <p className={m.bHead}>
        <b>잠재력 발동</b>
        <span><span className="num">{lit + good.length}</span>명</span>
      </p>
      {plan.choose && (
        <button type="button" className={m.pick} onClick={() => setOpen(true)}>
          <PotBadge tier="S" size="s" />
          <span className={m.pickText}>
            <b><span className="num">{best.length}</span>명 중 <span className="num">{S_MAX}</span>명만 켜져요</b>
            <small>{plan.auto ? '지금은 자동 — 팀 종합이 많이 오르는 순' : '감독이 고른 2명'}</small>
          </span>
          <span className={m.pickGo}>고르기<Icon name="chevron" size={14} /></span>
        </button>
      )}
      <ul className={m.bList}>
        {best.map((r) => (
          <li key={r.card.id} className={cx(m.liS, !r.on && m.liOff)}>
            <PotBadge tier="S" size="s" off={!r.on} />
            <b className={m.nick}>{r.pot.name}</b>
            <span className={m.who}>{r.player.name}</span>
            {r.on ? <small>{fxText(r.pot.fx)}</small> : <em className={m.offTag}>꺼짐</em>}
          </li>
        ))}
        {good.map((x) => (
          <li key={x.id} className={m.liA}>
            <PotBadge tier="A" size="s" />
            <b className={m.nick}>{x.pot.name}</b>
            <span className={m.who}>{x.player.name}</span>
            <small>{fxText(x.pot.fx)}</small>
          </li>
        ))}
      </ul>
      <PotPickSheet open={open} onClose={() => setOpen(false)} st={st} />
    </section>
  );
}
