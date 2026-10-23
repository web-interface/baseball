// 잠재력 — 후보 3개(보통 · 상급 · 최고)와 확률. '잠재력 개방'을 누르면 불빛이 세 칸을 돌다가(점점 느리게) 하나에 멈추고,
// 고른 칸이 크게 튀며 등급 도장이 찍힌다(최고면 무지개 섬광 · 불꽃 · 흔들림). 한 카드에 하나만 켜진다.
// 결과는 누르는 순간 저장되고(중간에 나가도 그대로), 연출이 끝날 때까지 다른 화면에는 전의 잠재력이 보인다(holdShown).
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { Button, useToast } from '../../ui';
import type { CardInst, Player } from '../../game/types';
import { spend } from '../../game/wallet';
import {
  LEGEND_MAX, TIER_KO, fxText, holdShown, isLegendGrade, oddsOf, pickOf, potentialsOf, potVersion, releaseShown, rollCost, rollPotential, rollsOf, subscribePot,
} from '../../game/potential';
import { potentialMax } from './Hero';
import { Stars } from './common';
import s from './PotentialPanel.module.css';

const won = (n: number) => n.toLocaleString('ko-KR');
/** 최고 잠재력 불꽃 — 각도 · 거리 · 늦게 */
const SPARKS = Array.from({ length: 14 }, (_, i) => ({ a: (i / 14) * 360 + (i % 2 ? 9 : -6), d: 70 + ((i * 37) % 60), t: (i % 4) * 40 }));

export function PotentialPanel({ p, card, owned }: { p: Player; card: CardInst; owned: boolean }) {
  useSyncExternalStore(subscribePot, potVersion);
  const toast = useToast();
  const legend = isLegendGrade(card.grade);
  const pots = potentialsOf(p, card.grade);
  const odds = oddsOf(legend);
  const pick = pickOf(card.id);
  const grow = potentialMax(p);
  const [lit, setLit] = useState<number | null>(null);
  const [hit, setHit] = useState<{ k: number; n: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const timers = useRef<number[]>([]);
  useEffect(() => () => { timers.current.forEach((t) => window.clearTimeout(t)); releaseShown(card.id); }, [card.id]);

  const roll = () => {
    if (busy) return;
    const prev = pick;
    holdShown(card.id, prev);
    const res = rollPotential(card, (gp) => spend({ gp }));
    if (res == null) { releaseShown(card.id); toast({ text: 'GP 가 모자라요', tone: 'bad' }); return; }
    setBusy(true);
    setHit(null);
    // 세 칸을 돌다가 res 에서 멈춤 — 처음엔 빠르게, 끝으로 갈수록 느리게
    const start = prev >= 0 ? prev : 0;
    let steps = 15;
    while ((start + steps) % 3 !== res) steps++;
    let t = 0;
    for (let i = 1; i <= steps; i++) {
      const k = (start + i) % 3;
      const x = i / steps;
      t += 55 + 420 * x * x * x;
      timers.current.push(window.setTimeout(() => setLit(k), t));
    }
    timers.current.push(window.setTimeout(() => {
      setLit(null);
      setHit({ k: res, n: Date.now() });
      setBusy(false);
      releaseShown(card.id);
      const pot = pots[res];
      toast({ text: `${TIER_KO[pot.tier]} 잠재력 — ${pot.name}`, tone: pot.tier === 'S' ? 'good' : 'info', duration: 5000 });
    }, t + 120));
  };

  const landed = hit ? pots[hit.k] : null;
  return (
    <section className={[s.panel, landed?.tier === 'S' && s.shake].filter(Boolean).join(' ')} key={landed?.tier === 'S' ? hit!.n : undefined} aria-label="잠재력">
      <div className={s.head}>
        <h3>잠재력</h3>
        <small>
          보통 <b className="num">{odds.C}%</b> · 상급 <b className="num">{odds.A}%</b> · 최고 <b className="num">{odds.S}%</b>
          {rollsOf(card.id) > 0 && <> · 돌린 횟수 <span className="num">{rollsOf(card.id)}</span></>}
        </small>
      </div>
      {legend && (
        <p className={s.legend}>레전드급 전용 잠재력이에요. 레전드급은 한 팀에 타자 <b className="num">{LEGEND_MAX.bat}</b>명 · 투수 <b className="num">{LEGEND_MAX.pit}</b>명까지 넣을 수 있어요.</p>
      )}
      <div className={s.stage}>
        <ol className={s.list}>
          {pots.map((pot, k) => {
            const on = pick === k && !busy;
            return (
              <li key={pot.tier} className={[s.pot, s['t' + pot.tier], lit === k && s.lit, on && s.on, hit?.k === k && s.impact].filter(Boolean).join(' ')}>
                <span className={s.tier}>{TIER_KO[pot.tier]}</span>
                <div className={s.body}>
                  <b className={s.name}>{pot.name}</b>
                  <span className={s.fx}>{fxText(pot.fx)}</span>
                  <small className={s.desc}>{pot.desc}</small>
                </div>
                {on && <em className={s.tag}>적용 중</em>}
              </li>
            );
          })}
        </ol>
        {landed && hit && (
          <div key={hit.n} className={[s.reveal, s['r' + landed.tier]].join(' ')} aria-live="polite">
            {landed.tier === 'S' && (
              <i className={s.sparks} aria-hidden>
                {SPARKS.map((x, i) => <i key={i} style={{ '--a': `${x.a}deg`, '--d': `${x.d}px`, '--t': `${x.t}ms` } as CSSProperties} />)}
              </i>
            )}
            <b>{landed.tier === 'S' ? '최고 잠재력!' : landed.tier === 'A' ? '상급 잠재력!' : '보통 잠재력'}</b>
            <span>{landed.name}</span>
          </div>
        )}
      </div>
      {landed?.tier === 'S' && hit && <i key={hit.n} className={s.flash} aria-hidden />}
      {owned ? (
        <Button size="l" block icon="refresh" disabled={busy} onClick={roll}>
          {busy ? '잠재력 개방 중…' : pick >= 0 ? '다시 돌리기' : '잠재력 개방'} · <span className="num">{won(rollCost(legend))}</span> GP
        </Button>
      ) : (
        <p className={s.note}>내 카드가 되면 잠재력을 열 수 있어요.</p>
      )}
      <p className={s.note}>켜진 잠재력은 라인업 · 경기 계산에 바로 들어가요. 최고 잠재력은 팀 선수들도 같이 받아요.</p>
      <div className={s.grow}>
        <span>성장 한계 {owned ? '' : '(추정) '}<b className="num">{owned ? grow : `${Math.max(p.ovr, grow - 3)}–${Math.min(99, grow + 3)}`}</b></span>
        <Stars v={p.potential} size={12} />
        <small>지금 <span className="num">{p.ovr}</span>{grow > p.ovr ? <> · 더 자랄 수 있는 폭 <span className="num">+{grow - p.ovr}</span></> : ' · 완성형'}</small>
      </div>
    </section>
  );
}
