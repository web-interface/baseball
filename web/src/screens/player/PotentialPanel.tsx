// 잠재력 — 별 하나 · 둘 · 셋 세 칸(글자 등급 대신 별 메달 ui/PotBadge)과 확률. '잠재력 개방'을 누르면 불빛이 칸을 돌며(점점 느리게)
// 그 칸에서 나올 수 있는 별명이 스치고, 하나에 멈추면 고른 칸이 크게 튀며 별 메달 도장이 찍힌다(별 셋이면 무지개 섬광 · 불꽃 · 흔들림).
//  · 별 둘 · 셋은 골든글러브 이상 카드만 (game/potential canHighPot) — 그 밖은 별 하나 칸에서 별명만 다시 고른다
//  · 별명은 선수의 두드러진 능력에 맞는 몇 가지 중 하나 (potKindsOf) — 다시 돌리면 다른 별명이 나올 수 있다
//  · 별 셋은 1군 엔트리에서 2명만 켜진다 — 꺼져 있으면 '꺼짐' (라인업 '잠재력 발동' 띠에서 고른다)
// 결과는 누르는 순간 저장되고(중간에 나가도 그대로), 연출이 끝날 때까지 다른 화면에는 전의 잠재력이 보인다(holdShown).
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { Button, Icon, useToast } from '../../ui';
import { PotBadge } from '../../ui/PotBadge';
import type { CardInst, Player } from '../../game/types';
import { spend } from '../../game/wallet';
import {
  LEGEND_MAX, S_MAX, TIERS, canHighPot, fxText, holdShown, isLegendGrade, oddsOf, potAt, potKindsOf, potOf, potVersion, releaseShown,
  rollCost, rollFixed, rollPotential, rollsOf, subscribePot, type PotTier, type Potential,
} from '../../game/potential';
import { cardNow } from '../lineup/ctx';
import { potentialMax } from './Hero';
import { Stars } from './common';
import s from './PotentialPanel.module.css';

const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');
const won = (n: number) => n.toLocaleString('ko-KR');
/** 별 셋 불꽃 — 각도 · 거리 · 늦게 */
const SPARKS = Array.from({ length: 14 }, (_, i) => ({ a: (i / 14) * 360 + (i % 2 ? 9 : -6), d: 70 + ((i * 37) % 60), t: (i % 4) * 40 }));
/** 칸마다 효과 크기 한 줄 */
const TIER_HINT: Record<PotTier, string> = { C: '자기 능력 +5 안팎', A: '자기 능력 +8 · 보조 능력', S: '자기 능력 + 팀 전원' };

export function PotentialPanel({ p, card, owned }: { p: Player; card: CardInst; owned: boolean }) {
  useSyncExternalStore(subscribePot, potVersion);
  const toast = useToast();
  const legend = isLegendGrade(card.grade);
  const hi = canHighPot(card.grade);
  const odds = oddsOf(card.grade);
  const pool = potKindsOf(p, card.grade);
  /** 칸마다 나올 수 있는 별명 [별 하나, 둘, 셋] */
  const names = TIERS.map((t) => pool.map((k) => potAt(p, card.grade, k.kind, t).name));
  const cur = potOf(card, p);
  const fixed = rollFixed(card, p);
  const grow = potentialMax(p);
  const [lit, setLit] = useState<{ k: number; name: string; n: number } | null>(null);
  const [hit, setHit] = useState<{ k: number; n: number; pot: Potential } | null>(null);
  const [busy, setBusy] = useState(false);
  const timers = useRef<number[]>([]);
  useEffect(() => () => { timers.current.forEach((t) => window.clearTimeout(t)); releaseShown(card.id); }, [card.id]);
  const sOff = cur?.tier === 'S' && !!cardNow(card)?.potOff;

  const roll = () => {
    if (busy || fixed) return;
    const prevK = cur ? TIERS.indexOf(cur.tier) : 0;
    holdShown(card.id);
    const res = rollPotential(card, p, (gp) => spend({ gp }));
    if (res == null) { releaseShown(card.id); toast({ text: 'GP 가 모자라요', tone: 'bad' }); return; }
    const landed = potOf(card, p)!;
    const target = TIERS.indexOf(landed.tier);
    setBusy(true);
    setHit(null);
    // 칸을 돌다가 target 에서 멈춤 — 처음엔 빠르게, 끝으로 갈수록 느리게 (별 하나만 나오는 카드는 그 칸에서 별명만 돈다)
    const start = hi ? prevK : 0;
    let steps = hi ? 15 : 12;
    if (hi) while ((start + steps) % 3 !== target) steps++;
    let t = 0;
    for (let i = 1; i <= steps; i++) {
      const k = hi ? (start + i) % 3 : 0;
      const list = names[k];
      const name = i === steps ? landed.name : list[(i * 5 + k) % list.length];
      const x = i / steps;
      t += 55 + 420 * x * x * x;
      timers.current.push(window.setTimeout(() => setLit({ k, name, n: i }), t));
    }
    timers.current.push(window.setTimeout(() => {
      setLit(null);
      setHit({ k: target, n: Date.now(), pot: landed });
      setBusy(false);
      releaseShown(card.id);
      toast({ text: <><PotBadge tier={landed.tier} size="s" /> <b>{landed.name}</b> 잠재력이 열렸어요</>, tone: landed.tier === 'S' ? 'good' : 'info', duration: 5000 });
    }, t + 120));
  };

  const landedS = hit?.pot.tier === 'S';
  return (
    <section className={cx(s.panel, landedS && s.shake)} key={landedS ? hit!.n : undefined} aria-label="잠재력">
      <div className={s.head}>
        <h3>잠재력</h3>
        <small className={s.odds}>
          {TIERS.filter((t) => odds[t] > 0).map((t) => (
            <span key={t}><PotBadge tier={t} size="xs" /><b className="num">{odds[t]}%</b></span>
          ))}
          {rollsOf(card.id) > 0 && <span>돌린 횟수 <b className="num">{rollsOf(card.id)}</b></span>}
        </small>
      </div>
      {!hi && (
        <p className={s.lockNote}>
          <span>이 카드 등급은 <PotBadge tier="C" size="xs" /> 잠재력만 나와요</span>
          <small><PotBadge tier="A" size="xs" /> <PotBadge tier="S" size="xs" /> 는 골든글러브 이상 카드부터</small>
        </p>
      )}
      {legend && (
        <p className={s.legend}>레전드급 전용 잠재력이에요. 레전드급은 한 팀에 타자 <b className="num">{LEGEND_MAX.bat}</b>명 · 투수 <b className="num">{LEGEND_MAX.pit}</b>명까지 넣을 수 있어요.</p>
      )}
      <div className={s.stage}>
        <ol className={s.list}>
          {TIERS.map((t, k) => {
            const locked = !hi && t !== 'C';
            const isCur = !busy && cur?.tier === t;
            const spin = lit?.k === k ? lit : null;
            return (
              <li key={t} className={cx(s.pot, s['t' + t], spin && s.lit, isCur && s.on, isCur && sOff && s.isOff, hit?.k === k && s.impact, locked && s.locked)}>
                <PotBadge tier={t} size="l" off={locked || (isCur && sOff)} />
                <div className={s.body}>
                  {isCur && cur ? (
                    <>
                      <b className={s.name}>{cur.name}</b>
                      <span className={s.fx}>{fxText(cur.fx)}</span>
                      <small className={s.desc}>{cur.desc}</small>
                    </>
                  ) : spin ? (
                    <b key={spin.n} className={cx(s.name, s.spinName)}>{spin.name}</b>
                  ) : locked ? (
                    <>
                      <b className={s.lockName}><Icon name="lock" size={13} />골든글러브 이상 카드부터</b>
                      <small className={s.desc}>{TIER_HINT[t]}</small>
                    </>
                  ) : (
                    <>
                      <span className={s.cands}>{names[k].map((n) => <i key={n}>{n}</i>)}</span>
                      <small className={s.desc}>{TIER_HINT[t]}</small>
                    </>
                  )}
                </div>
                {isCur && <em className={cx(s.tag, sOff && s.tagOff)}>{sOff ? '꺼짐' : '적용 중'}</em>}
              </li>
            );
          })}
        </ol>
        {hit && (
          <div key={hit.n} className={cx(s.reveal, s['r' + hit.pot.tier])} aria-live="polite">
            {hit.pot.tier === 'S' && (
              <i className={s.sparks} aria-hidden>
                {SPARKS.map((x, i) => <i key={i} style={{ '--a': `${x.a}deg`, '--d': `${x.d}px`, '--t': `${x.t}ms` } as CSSProperties} />)}
              </i>
            )}
            <span className={s.stamp}><PotBadge tier={hit.pot.tier} size="xl" /></span>
            <b className={s.revealName}>{hit.pot.name}</b>
            <span className={s.revealFx}>{fxText(hit.pot.fx)}</span>
          </div>
        )}
      </div>
      {landedS && <i key={hit!.n} className={s.flash} aria-hidden />}
      {sOff && !busy && (
        <p className={s.offNote}>
          <PotBadge tier="S" size="xs" off />
          <span>지금 라인업에서 꺼져 있어요. 1군 엔트리에서 <b className="num">{S_MAX}</b>명만 켜져요 — 라인업의 ‘잠재력 발동’에서 골라요.</span>
        </p>
      )}
      {owned ? (
        fixed ? (
          <Button size="l" block icon="lock" disabled>이 카드의 잠재력은 하나뿐이에요</Button>
        ) : (
          <Button size="l" block icon="refresh" disabled={busy} onClick={roll}>
            {busy ? '잠재력 개방 중…' : cur ? '다시 돌리기' : '잠재력 개방'} · <span className="num">{won(rollCost(card.grade))}</span> GP
          </Button>
        )
      ) : (
        <p className={s.note}>내 카드가 되면 잠재력을 열 수 있어요.</p>
      )}
      <p className={s.note}>
        켜진 잠재력은 라인업 · 경기 계산에 바로 들어가요. <PotBadge tier="S" size="xs" /> 는 팀 선수들도 같이 받아요 — 1군 엔트리에서 <span className="num">{S_MAX}</span>명까지.
      </p>
      {pool.length > 1 && (
        <details className={s.book}>
          <summary><span>나올 수 있는 별명 <b className="num">{pool.length}</b>가지</span><small>어울리는 능력일수록 자주 나와요</small></summary>
          <ul>
            {pool.map(({ kind }) => (
              <li key={kind}>
                {TIERS.filter((t) => hi || t === 'C').map((t) => {
                  const x = potAt(p, card.grade, kind, t);
                  return (
                    <span key={t} className={cx(s.bookRow, cur?.kind === kind && cur.tier === t && s.bookOn)}>
                      <PotBadge tier={t} size="xs" />
                      <b>{x.name}</b>
                      <small>{fxText(x.fx)}</small>
                    </span>
                  );
                })}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className={s.grow}>
        <span>성장 한계 {owned ? '' : '(추정) '}<b className="num">{owned ? grow : `${Math.max(p.ovr, grow - 3)}–${Math.min(99, grow + 3)}`}</b></span>
        <Stars v={p.potential} size={12} />
        <small>지금 <span className="num">{p.ovr}</span>{grow > p.ovr ? <> · 더 자랄 수 있는 폭 <span className="num">+{grow - p.ovr}</span></> : ' · 완성형'}</small>
      </div>
    </section>
  );
}
