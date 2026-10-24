// 자동 열기 — 같은 팩 여러 개(최대 10)를 한 번에, 빠르게. 결과는 이미 정해져 보관함에 들어가 있고(draw.pullMany) 화면은 따라갈 뿐(정직한 연출).
// 팩마다 가장 좋은 카드를 한 장씩 차례로 뒤집는다(레전드급이 나온 팩 뒤에선 잠깐 멈춤) → 다 뒤집으면 요약:
//   빛나는 카드(엘리트 이상, 없으면 가장 좋은 카드) · 등급별 장수 · 새 카드 · 중복 · 자동 강화 · 천장 · 쓴 재화.
// 300ms 뒤부터 건너뛰기. 움직임 줄이기면 바로 요약. 카드를 누르면 자세히(팩 열기와 같은 시트).
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { CardBack, CardMini } from '../../cards';
import { GRADES } from '../../game/grades';
import { navigate } from '../../app/router';
import { Button, IconButton } from '../../ui';
import { roman } from '../../ui/format';
import { lockScroll } from '../../ui/scrollLock';
import { packTitle, summarize, type PullResult, type PulledCard } from './draw';
import { PulledSheet, SpaceKey, isSpace, spaceGuard, typingIn, upText } from './Opening';
import { Price, Swatch, gradeFill, gradeShort } from './bits';
import o from './Opening.module.css';
import s from './AutoOpen.module.css';

const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export interface AutoOpenProps {
  runs: PullResult[];
  /** 고른 팩 수 — 재화가 모자라 덜 열었으면 runs 보다 크다 */
  asked: number;
  onClose: () => void;
  /** 같은 팩 자동 열기 한 번 더 (재화가 모자라면 없음) */
  onAgain?: () => void;
  /** 한 번 더 누르면 열 팩 수 */
  againN?: number;
  onCombo: () => void;
}

/** 카드 한 장 (뒷면 → 앞면). 뒷면 빛은 실제 등급과 같다(레어 이상) */
function FlipCard({ pc, on, onOpen, label }: { pc: PulledCard; on: boolean; onOpen: () => void; label: string }) {
  return (
    <button
      type="button"
      className={[o.cell, s.flipBtn, on && o.on, o['t' + pc.tier]].filter(Boolean).join(' ')}
      style={{ '--gr': gradeFill(pc.card.grade), '--grs': pc.card.grade === 'signature' ? '#F3E9FF' : `var(--gr-${pc.card.grade})` } as CSSProperties}
      onClick={() => on && onOpen()}
      aria-label={label}
      tabIndex={on ? 0 : -1}
    >
      <span className={o.flip}>
        <span className={[o.face, o.back].join(' ')}>
          <CardBack grade={pc.tier >= 1 ? pc.card.grade : undefined} style={{ width: '100%' }} />
          {pc.tier >= 1 && <i className={o.glow} />}
        </span>
        <span className={[o.face, o.front].join(' ')}>
          <CardMini player={pc.player} grade={pc.card.grade} year={pc.card.year} style={{ width: '100%' }} />
        </span>
      </span>
      {on && !pc.isNew && (pc.up
        ? <em className={['num', o.dupMark, o.upMark].join(' ')} title={`강화 ${upText(pc.up)}`}>{roman(pc.up.to)}</em>
        : <em className={['num', o.dupMark].join(' ')}>+1</em>)}
    </button>
  );
}

export function AutoOpen({ runs, asked, onClose, onAgain, againN = 0, onCombo }: AutoOpenProps) {
  const n = runs.length;
  const sum = useMemo(() => summarize(runs), [runs]);
  const bests = useMemo(() => runs.map((r) => r.cards[r.best]), [runs]);
  const [shown, setShown] = useState(() => (reduced() ? n : 0));
  const [canSkip, setCanSkip] = useState(false);
  const [detail, setDetail] = useState<PulledCard | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const done = shown >= n;

  // 한 팩씩 차례로 — 레전드급이 나온 팩 뒤에선 잠깐 멈춘다
  useEffect(() => {
    if (done) return;
    const prev = bests[shown - 1];
    const t = window.setTimeout(() => setShown((k) => k + 1), shown === 0 ? 260 : prev && prev.tier >= 2 ? 640 : 170);
    return () => window.clearTimeout(t);
  }, [shown, done, bests]);
  useEffect(() => { const t = window.setTimeout(() => setCanSkip(true), 300); return () => window.clearTimeout(t); }, []);

  // 뒤 화면 스크롤 막기 + 처음 초점
  useEffect(() => {
    const unlock = lockScroll();
    const last = document.activeElement as HTMLElement | null;
    root.current?.focus();
    return () => { unlock(); last?.focus?.(); };
  }, []);
  // Esc — 끝났으면 닫기, 아니면 건너뛰기 · 스페이스 — 여는 중이면 바로 결과, 끝났으면 'N팩 더 자동 열기'
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (detail) return;
      if (e.key === 'Escape') { if (done) onClose(); else setShown(n); return; }
      if (!isSpace(e) || typingIn(e)) return;
      e.preventDefault();
      if (e.repeat) return;
      if (!done) { if (canSkip) setShown(n); }
      else if (onAgain && againN > 0) onAgain();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', spaceGuard);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', spaceGuard); };
  });

  const first = runs[0];
  const title = packTitle(first.pack, first.pick);
  const glowN = sum.topIsGlow ? sum.top.length : 0;
  const TOP_MAX = 12;
  const said = done
    ? `${n}팩 ${sum.cards}장을 열었어요. ${glowN ? `엘리트 이상 ${glowN}장` : '엘리트 이상은 없어요'}. 새 카드 ${sum.fresh}장.`
    : '';

  return createPortal(
    <div ref={root} className={o.root} role="dialog" aria-modal="true" aria-label={`${title} ${n}팩 자동 열기`} tabIndex={-1}>
      <div className={o.bg} aria-hidden />

      <header className={o.bar}>
        <p className={o.barTitle}>
          <b>{title} 자동 열기</b>
          <span><span className="num">{n}</span>팩 · <span className="num">{sum.cards}</span>장</span>
        </p>
        {done ? (
          <IconButton icon="close" label="닫기" onClick={onClose} className={o.close} />
        ) : (
          <button type="button" className={[o.skip, canSkip && o.skipOn].filter(Boolean).join(' ')} onClick={() => setShown(n)} disabled={!canSkip}>
            건너뛰기
          </button>
        )}
      </header>

      <main className={[o.body, s.body].join(' ')}>
        <div className={s.wrap}>
          <section aria-label="팩마다 가장 좋은 카드">
            <p className={s.h}><span>팩마다 가장 좋은 카드</span><span className={s.hSub}><span className="num">{Math.min(shown, n)}</span>/<span className="num">{n}</span></span></p>
            <ol className={s.packs} style={{ '--cols': Math.min(5, n) } as CSSProperties}>
              {bests.map((c, i) => (
                <li key={runs[i].requestId} className={s.pack}>
                  <FlipCard
                    pc={c}
                    on={i < shown}
                    onOpen={() => setDetail(c)}
                    label={i < shown ? `${i + 1}번째 팩 최고 — ${GRADES[c.card.grade].ko} ${c.player.name}${c.isNew ? ', 새 카드' : ', 중복'}` : `${i + 1}번째 팩`}
                  />
                  <span className={s.packNo}><span className="num">{i + 1}</span></span>
                </li>
              ))}
            </ol>
          </section>

          {done && (
            <section className={s.result} aria-label="자동 열기 결과">
              <p className={s.h}>
                <span>{sum.topIsGlow ? <>빛나는 카드 <b className="num">{glowN}</b>장</> : '가장 좋은 카드'}</span>
                <span className={s.hSub}>{sum.topIsGlow ? '엘리트 이상' : '엘리트 이상은 안 나왔어요'}</span>
              </p>
              <ul className={s.top}>
                {sum.top.slice(0, TOP_MAX).map((c, i) => (
                  <li key={`${c.card.id}-${i}`}>
                    <FlipCard pc={c} on onOpen={() => setDetail(c)} label={`${GRADES[c.card.grade].ko} ${c.player.name}${c.isNew ? ', 새 카드' : ', 중복'}`} />
                  </li>
                ))}
              </ul>
              {sum.top.length > TOP_MAX && <p className={s.more}>외 <span className="num">{sum.top.length - TOP_MAX}</span>장 — 보관함에서 볼 수 있어요</p>}

              <ul className={o.counts} aria-label="등급별 장수">
                {sum.counts.map((c) => (
                  <li key={c.grade}><Swatch grade={c.grade} /><span>{gradeShort(c.grade)}</span><b className="num">{c.n}</b></li>
                ))}
              </ul>
              <p className={o.sumLine}>
                새 카드 <b className="num">{sum.fresh}</b> · 중복 <b className="num">{sum.dups}</b>
                <span> — 같은 카드가 모이면 자동 강화</span>
              </p>
              {sum.ups.length > 0 && (
                <p className={[o.sumLine, o.sumUps].join(' ')}>
                  강화 <b className="num">{sum.ups.length}</b>
                  <span className={o.sumUpList}>
                    {sum.ups.slice(0, 3).map((u, i) => (
                      <span key={`${u.card.id}-${i}`}>{u.player.name} <b className="num">+1</b> <span className="num">({upText(u)})</span></span>
                    ))}
                    {sum.ups.length > 3 && <span>외 <span className="num">{sum.ups.length - 3}</span>장</span>}
                  </span>
                </p>
              )}
              <p className={o.sumLine}>
                {sum.hits.length > 0 && <>천장 도달 <b className="num">{sum.hits.length}</b>번 — <b>{sum.hits[0].reward}</b> · </>}
                천장까지 <b className="num">{sum.pity.max - sum.pity.after}</b>팩
                <span> · <span className="num">{sum.pity.after}</span>/<span className="num">{sum.pity.max}</span></span>
              </p>
              <p className={o.sumLine}>
                쓴 재화 <Price price={sum.spent.ball ? { ball: sum.spent.ball } : { gp: sum.spent.gp }} className={s.spent} />
                {n < asked && <span> · 재화가 모자라 <span className="num">{asked}</span>팩 중 <span className="num">{n}</span>팩만 열었어요</span>}
              </p>
            </section>
          )}
        </div>
      </main>

      <footer className={o.foot}>
        {done ? (
          <div className={o.actions}>
            {onAgain && againN > 0 && (
              <Button variant="primary" size="l" block onClick={onAgain} className={o.again}
                trailing={<Price price={first.pack.price.ball != null ? { ball: (first.pack.price.ball ?? 0) * againN } : { gp: (first.pack.price.gp ?? 0) * againN }} />}>
                <span className="num">{againN}</span>팩 더 자동 열기<SpaceKey />
              </Button>
            )}
            <div className={o.actions2}>
              <Button variant="secondary" onClick={onCombo}>조합으로 보내기</Button>
              <Button variant="secondary" onClick={onClose}>닫기</Button>
            </div>
          </div>
        ) : (
          <div className={s.runFoot}>
            <p className={s.running}><b className="num">{Math.min(shown, n)}</b><span className="num">/{n}</span><span>팩 여는 중</span></p>
            <Button variant="primary" size="l" onClick={() => setShown(n)} disabled={!canSkip}>바로 결과<SpaceKey /></Button>
          </div>
        )}
      </footer>

      <PulledSheet pc={detail} onClose={() => setDetail(null)} onPlayer={(id) => { setDetail(null); onClose(); navigate(`/player/${id}`); }} />

      <p className="sr-only" aria-live="polite">{said}</p>
    </div>,
    document.body,
  );
}
