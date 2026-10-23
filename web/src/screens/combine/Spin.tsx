// 조합 룰렛 — 마구마구식 '메시지 · 조합 중' 상자. 결과는 이미 정해져 저장된 뒤다(rollComboWith): 카드 한 장 틀이 결과 풀의
// 후보 카드들을 빠르게 돌다가 느려져(약 3초) 결과에서 멈춘다. 연출은 결과를 따라갈 뿐, 바꾸지 않는다.
//   같은 등급: 짧은 충격 · 위 등급: 큰 빛 + '상위 카드!' · 레전드급(레전드 · 프랜차이즈): 가장 큰 빛 → 뽑기의 레전드 연출(Reveal) → 결과
//   상자를 누르면 바로 결과. 움직임 줄이기면 돌리지 않고 결과부터.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Card, CardMini, NameYear, cardProps } from '../../cards';
import { GRADES } from '../../game/grades';
import { POS_KO, ROLE_KO } from '../../game/labels';
import { ownedCard } from '../../game/inventory';
import { teamById } from '../../game/mock';
import { STEP_KO, reelTimings, type CombineRoll, type CombineView } from '../../game/combine';
import type { CardInst, Player } from '../../game/types';
import { Button } from '../../ui';
import { roman } from '../../ui/format';
import { lockScroll } from '../../ui/scrollLock';
import type { PulledCard } from '../gacha/draw';
import { Reveal, lightOf } from '../gacha/Reveal';
import { Swatch, gradeFill } from '../gacha/bits';
import { relaxText } from './Recipe';
import o from '../gacha/Opening.module.css';
import s from './Spin.module.css';

export interface SpinRun {
  key: string;
  result: PulledCard;
  roll: CombineRoll;
  view: CombineView;
  /** 돌아가는 카드 — 마지막 장이 결과 */
  reel: { card: CardInst; player: Player }[];
}

type Phase = 'spin' | 'land' | 'cine' | 'done';
const isReduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const SPIN_MS = 3000;
const INTRO_MS = 320;

export function Spin({ run, onAgain, onClose }: { run: SpinRun; onAgain: () => void; onClose: () => void }) {
  const reduced = useMemo(isReduced, []);
  const [phase, setPhase] = useState<Phase>(reduced ? 'done' : 'spin');
  const [frame, setFrame] = useState(0);
  const timer = useRef(0);
  const box = useRef<HTMLElement>(null);
  const lastIdx = run.reel.length - 1;
  const g = run.result.card.grade;
  const up = run.roll.up;
  const legendClass = g === 'legend' || g === 'franchise';
  const team = teamById(run.result.player.teamId);
  const glow = lightOf(g, team.colors.primary);
  const times = useMemo(() => reelTimings(run.reel.length, SPIN_MS), [run.reel.length]);
  const after = legendClass ? 'cine' : 'done';

  useEffect(() => lockScroll(), []);
  useEffect(() => { if (phase === 'spin') box.current?.focus(); }, [phase]);

  // 릴 — 처음엔 빠르게, 끝으로 갈수록 느리게. 마지막 장(결과)에 닿으면 멈춤
  useEffect(() => {
    if (phase !== 'spin') return;
    if (lastIdx <= 0) { setPhase('land'); return; }
    let i = 0;
    const tick = () => {
      i += 1;
      setFrame(i);
      if (i >= lastIdx) { setPhase('land'); return; }
      timer.current = window.setTimeout(tick, times[i]);
    };
    timer.current = window.setTimeout(tick, INTRO_MS + times[0]);
    return () => window.clearTimeout(timer.current);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // 멈춘 뒤 — 충격을 보여 주고 결과로 (레전드급은 Reveal 먼저)
  useEffect(() => {
    if (phase !== 'land') return;
    const t = window.setTimeout(() => setPhase(after), legendClass ? 1500 : up ? 1250 : 820);
    return () => window.clearTimeout(t);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const skip = useCallback(() => {
    if (phase === 'spin') { window.clearTimeout(timer.current); setFrame(lastIdx); setPhase('land'); }
    else if (phase === 'land') setPhase(after);
  }, [phase, lastIdx, after]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase === 'done') onClose();
      else if ((e.key === 'Enter' || e.key === ' ') && (phase === 'spin' || phase === 'land')) { e.preventDefault(); skip(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, onClose, skip]);

  const cls = (...xs: (string | false | undefined)[]) => xs.filter(Boolean).join(' ');
  const landed = phase === 'land';
  const vars = { '--glow': glow, '--glow-ink': g === 'franchise' ? team.colors.ink : '#14110D', '--gc': gradeFill(g), '--team': team.colors.primary } as CSSProperties;

  return createPortal(
    <div className={cls(s.root, landed && s.landed, landed && up && s.up, landed && legendClass && s.legend)} style={vars} role="dialog" aria-modal="true" aria-label="선수조합">
      <div className={s.scrim} aria-hidden />
      {landed && (up || legendClass) && <i className={s.flood} aria-hidden />}

      {(phase === 'spin' || phase === 'land') && (
        <section ref={box} className={s.box} onClick={skip} tabIndex={-1} aria-busy={phase === 'spin'}>
          <header className={s.bar}>
            <b>메시지</b>
            <span><span className="num">{run.view.n}</span>장 조합</span>
          </header>
          <div className={s.stage}>
            {landed && legendClass && <i className={s.rays} aria-hidden />}
            <div className={cls(s.frame, landed && s.hit)}>
              {run.reel.map((r, i) => (
                <div key={i} className={cls(s.cell, i === frame && s.on)} aria-hidden={i !== frame}>
                  <CardMini {...cardProps(r.card)} player={r.player} fluid eager still={i !== lastIdx} />
                </div>
              ))}
              <i className={s.flash} aria-hidden />
              <i className={s.shock} aria-hidden />
              {landed && up && <b className={s.stamp}>상위 카드!</b>}
            </div>
          </div>
          <p className={s.msg} aria-live="polite">
            {phase === 'spin' ? '조합 중이에요' : up ? '상위 카드가 나왔어요' : '조합이 끝났어요'}
          </p>
          <div className={s.prog} aria-hidden><i style={{ transform: `scaleX(${lastIdx ? frame / lastIdx : 1})` }} /></div>
          <p className={s.tap} aria-hidden>{phase === 'spin' ? '누르면 바로 결과' : ''}</p>
        </section>
      )}

      {phase === 'cine' && (
        <div className={cls(o.root, s.cine)}>
          <div className={o.bg} aria-hidden />
          <Reveal pc={run.result} pick={null} onDone={() => setPhase('done')} />
        </div>
      )}

      {phase === 'done' && <Result run={run} onAgain={onAgain} onClose={onClose} reduced={reduced} />}
    </div>,
    document.body,
  );
}

/* ───────── 결과 ───────── */
function Result({ run, onAgain, onClose, reduced }: { run: SpinRun; onAgain: () => void; onClose: () => void; reduced: boolean }) {
  const pc = run.result;
  const g = pc.card.grade;
  const card = ownedCard(pc.card.id) ?? pc.card; // 같은 카드가 모여 자동 강화됐으면 반영
  const p = pc.player;
  const team = teamById(p.teamId);
  const row = run.view.rows[run.roll.row];
  const pos = p.pos === 'P' ? (p.role ? ROLE_KO[p.role] : '투수') : POS_KO[p.pos];
  const status = pc.isNew ? '새 카드 · 보관함에 넣었어요'
    : pc.up ? `같은 카드가 모여 강화 +1 (${pc.up.from > 0 ? roman(pc.up.from) : '0'} → ${roman(pc.up.to)})`
    : '중복 +1 · 강화 재료';
  return (
    <section className={[s.box, s.result, reduced && s.still].filter(Boolean).join(' ')} aria-live="polite">
      <header className={s.bar}>
        <b>조합 결과</b>
        <span><span className="num">{run.view.n}</span>장 조합</span>
      </header>
      <div className={s.resStage}>
        {run.roll.up && <b className={s.upTag}>상위 카드!</b>}
        <div className={s.resCard}>
          <Card {...cardProps(card)} player={p} fluid live eager />
        </div>
      </div>
      <div className={s.resInfo}>
        <p className={s.resGrade}>
          <Swatch grade={g} size={9} />
          <b>{GRADES[g].ko}</b>
          <span>· 기본 {GRADES[run.view.base!].ko}에서 {row.step === 'hidden' ? '히든 칸' : STEP_KO[String(row.step)]}</span>
        </p>
        <h2 className={['head', s.resName].join(' ')}><NameYear name={p.name} year={card.year} /></h2>
        <p className={s.resMeta}>{pos} · {team.name}</p>
        <p className={pc.isNew ? s.resNew : s.resDup}>{status}</p>
        {run.roll.relaxed.length > 0 && <p className={s.resNote}>{row.byMats ? '넣은 카드 말고는 맞는 카드가 없어' : '맞는 카드가 없어'} {relaxText(run.roll.relaxed)}</p>}
      </div>
      <div className={s.actions}>
        <Button variant="secondary" size="l" block onClick={onAgain}>한 번 더</Button>
        <Button variant="primary" size="l" block onClick={onClose} autoFocus>확인</Button>
      </div>
    </section>
  );
}
