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
import { affordCount, packTitle, pullPack, rarity, summarize, type Pick, type PullResult, type PulledCard } from './draw';
import { CARD_CAP, batchInventory, totalCards } from '../../game/inventory';
import { readWallet } from '../../game/wallet';
import type { Pack } from '../../game/types';
import { PulledSheet, SpaceKey, isSpace, spaceGuard, typingIn, upText } from './Opening';
import { Price, Swatch, gradeFill, gradeShort } from './bits';
import { quotaPacks, spendQuota } from './autoQuota';
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
  /** 한 번 더를 못 하는 까닭 (자동 열기 한도를 다 써 쉬는 중) */
  note?: string;
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

export function AutoOpen({ runs, asked, onClose, onAgain, againN = 0, note, onCombo }: AutoOpenProps) {
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

          {done && <ResultBlock sum={sum} n={n} asked={asked} onDetail={setDetail} />}
        </div>
      </main>

      <footer className={o.foot}>
        {done ? (
          <div className={o.actions}>
            {onAgain && againN > 0 && (
              <Button variant="primary" size="l" block onClick={onAgain} className={o.again}
                trailing={<Price price={first.pack.price.ball != null ? { ball: (first.pack.price.ball ?? 0) * againN } : { gp: (first.pack.price.gp ?? 0) * againN }} />}>
                <span className="num">{againN}</span>팩 더 열기<SpaceKey />
              </Button>
            )}
            {note && !(onAgain && againN > 0) && <p className={s.quotaNote}>{note}</p>}
            <div className={o.actions2}>
              <Button variant="secondary" onClick={onCombo}>선수조합</Button>
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

      <PulledSheet pc={detail} onClose={() => setDetail(null)} onPlayer={(id, cid) => { setDetail(null); onClose(); navigate(`/player/${id}?card=${cid}`); }} />

      <p className="sr-only" aria-live="polite">{said}</p>
    </div>,
    document.body,
  );
}

/** 결과 요약 — 빛나는 카드 · 등급별 장수 · 새 카드/중복 · 자동 강화 · 천장 · 쓴 재화 (자동 열기 · 가득 찰 때까지가 같이 쓴다) */
function ResultBlock({ sum, n, asked, onDetail }: { sum: ReturnType<typeof summarize>; n: number; asked: number; onDetail: (pc: PulledCard) => void }) {
  const glowN = sum.topIsGlow ? sum.top.length : 0;
  const TOP_MAX = 12;
  const setDetail = onDetail;
  return (
    <section className={s.result} aria-label="자동 열기 결과">
          <p className={s.h}>
            <span>{sum.topIsGlow ? <>빛나는 카드 <b className="num">{glowN}</b>장</> : '가장 좋은 카드'}</span>
            {sum.topIsGlow && <span className={s.hSub}>엘리트 이상</span>}
          </p>
          <ul className={s.top}>
            {sum.top.slice(0, TOP_MAX).map((c, i) => (
              <li key={`${c.card.id}-${i}`}>
                <FlipCard pc={c} on onOpen={() => setDetail(c)} label={`${GRADES[c.card.grade].ko} ${c.player.name}${c.isNew ? ', 새 카드' : ', 중복'}`} />
              </li>
            ))}
          </ul>
          {sum.top.length > TOP_MAX && <p className={s.more}>외 <span className="num">{sum.top.length - TOP_MAX}</span>장</p>}
    
          <ul className={o.counts} aria-label="등급별 장수">
            {sum.counts.map((c) => (
              <li key={c.grade}><Swatch grade={c.grade} /><span>{gradeShort(c.grade)}</span><b className="num">{c.n}</b></li>
            ))}
          </ul>
          <p className={o.sumLine}>
            새 카드 <b className="num">{sum.fresh}</b> · 중복 <b className="num">{sum.dups}</b>
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
            {sum.hits.length > 0 && <>천장 보상 <b>{sum.hits[0].reward}</b>{sum.hits.length > 1 && <> ×<b className="num">{sum.hits.length}</b></>} · </>}
            천장까지 <b className="num">{sum.pity.max - sum.pity.after}</b>팩
          </p>
          <p className={o.sumLine}>
            쓴 재화 <Price price={sum.spent.ball ? { ball: sum.spent.ball } : { gp: sum.spent.gp }} className={s.spent} />
            {n < asked && <span> · 재화 부족으로 <span className="num">{n}</span>팩만</span>}
          </p>
        </section>
  );
}

/* ───────── 가득 찰 때까지 — 한 번 눌러 두면 보관함 상한(CARD_CAP, 10만 장) 또는 재화까지 같은 팩을 계속 연다 (휴대폰용, 멈추기 가능) ───────── */
const BULK_MAX = 2000;
type BulkEnd = 'cap' | 'gp' | 'stop' | 'max' | 'quota';
const BULK_END_KO: Record<Exclude<BulkEnd, 'quota'>, string> = {
  cap: '보관함이 가득 찼어요',
  gp: '재화가 다 됐어요',
  stop: '멈췄어요',
  max: `한 번에 ${BULK_MAX.toLocaleString()}팩까지예요`,
};
/** 리그 단계 한도로 멈췄을 때 */
const quotaEndText = () => '한도를 다 썼어요. 1분 뒤 다시 열 수 있어요';

export function BulkOpen({ pack, pick, onClose, onClean, onCombo }: { pack: Pack; pick: Pick | null; onClose: () => void; onClean: () => void; onCombo: () => void }) {
  const [runs, setRuns] = useState<PullResult[]>([]);
  const [end, setEnd] = useState<BulkEnd | null>(null);
  const [detail, setDetail] = useState<PulledCard | null>(null);
  const stop = useRef(false);
  const acc = useRef<PullResult[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const done = end != null;
  // 리그 단계 한도 — 시작할 때 남은 만큼만 (레전드는 끝없이)
  const budget = useRef(quotaPacks(pack.size));
  const limited = Number.isFinite(budget.current);

  // 조금씩 나눠 연다 — 한 번에 팩 4개(저장은 한 번), 그 사이 화면이 숨 쉰다
  useEffect(() => {
    let timer = 0;
    let alive = true;
    const tick = () => {
      if (!alive) return;
      let why: BulkEnd | null = stop.current ? 'stop' : null;
      let got = 0;
      if (!why) batchInventory(() => {
        for (let k = 0; k < 4; k++) {
          if (totalCards() > CARD_CAP) { why = 'cap'; break; }
          if (affordCount(pack, readWallet(), 1) < 1) { why = 'gp'; break; }
          if (acc.current.length >= budget.current) { why = 'quota'; break; }
          if (acc.current.length >= BULK_MAX) { why = 'max'; break; }
          acc.current.push(pullPack(pack, pick));
          got++;
        }
      });
      if (got) spendQuota(got * pack.size, pack.size);
      if (!why && acc.current.length >= budget.current) why = 'quota';
      setRuns(acc.current.slice());
      if (why) setEnd(why); else timer = window.setTimeout(tick, 24);
    };
    timer = window.setTimeout(tick, 150);
    return () => { alive = false; window.clearTimeout(timer); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const unlock = lockScroll();
    const last = document.activeElement as HTMLElement | null;
    root.current?.focus();
    return () => { unlock(); last?.focus?.(); };
  }, []);
  // 스페이스 · Esc — 여는 중이면 멈추기, 끝났으면 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (detail) return;
      if (e.key !== 'Escape' && (!isSpace(e) || typingIn(e))) return;
      e.preventDefault();
      if (e.repeat) return;
      if (!done) stop.current = true; else onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', spaceGuard);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', spaceGuard); };
  });

  const sum = useMemo(() => (done && runs.length ? summarize(runs) : null), [done, runs]);
  const total = totalCards();
  const cards = runs.length * pack.size;
  const glow = useMemo(() => runs.reduce((a, r) => a + r.cards.filter((c) => rarity(c.card.grade) >= rarity('legend')).length, 0), [runs]);
  const lastBest = runs.length ? runs[runs.length - 1].cards[runs[runs.length - 1].best] : null;
  const pct = Math.min(100, Math.round((total / CARD_CAP) * 1000) / 10);
  const title = packTitle(pack, pick);

  return createPortal(
    <div ref={root} className={o.root} role="dialog" aria-modal="true" aria-label={`${title} 가득 찰 때까지 열기`} tabIndex={-1}>
      <div className={o.bg} aria-hidden />
      <header className={o.bar}>
        <p className={o.barTitle}>
          <b>{title} 계속 열기</b>
          <span><span className="num">{runs.length}</span>팩 · <span className="num">{cards.toLocaleString()}</span>장</span>
        </p>
        {done && <IconButton icon="close" label="닫기" onClick={onClose} className={o.close} />}
      </header>
      <main className={[o.body, s.body].join(' ')}>
        <div className={s.wrap}>
          <section className={s.bulk} aria-label="계속 열기 진행">
            <p className={s.bulkBig}><b className="num">{runs.length.toLocaleString()}</b><span>팩</span></p>
            <div className={s.bar} role="progressbar" aria-valuemin={0} aria-valuemax={CARD_CAP} aria-valuenow={total} aria-label="보관함 카드 수">
              <i style={{ width: `${pct}%` }} />
            </div>
            <p className={s.bulkLine}>
              보관함 <b className="num">{total.toLocaleString()}</b> / <span className="num">{CARD_CAP.toLocaleString()}</span>장
            </p>
            {limited && (
              <p className={s.bulkLine}>
                한도 <b className="num">{cards.toLocaleString()}</b> / <span className="num">{(budget.current * pack.size).toLocaleString()}</span>장
              </p>
            )}
            <p className={s.bulkLine}>엘리트 이상 <b className="num">{glow.toLocaleString()}</b>장</p>
            {!done && lastBest && (
              <div className={s.bulkNow}>
                <span className={s.bulkCard}><FlipCard pc={lastBest} on onOpen={() => {}} label={`방금 팩 최고 ${lastBest.player.name}`} /></span>
                <small>{GRADES[lastBest.card.grade].ko} {lastBest.player.name}</small>
              </div>
            )}
            {done && end && <p className={[s.bulkEnd, end === 'cap' && s.bulkCap].filter(Boolean).join(' ')}>{end === 'quota' ? quotaEndText() : BULK_END_KO[end]}</p>}
          </section>
          {sum && <ResultBlock sum={sum} n={runs.length} asked={runs.length} onDetail={setDetail} />}
        </div>
      </main>
      <footer className={o.foot}>
        {done ? (
          <div className={o.actions}>
            {end === 'cap' && <Button variant="primary" size="l" block onClick={onClean}>자동 정리</Button>}
            <div className={o.actions2}>
              <Button variant="secondary" onClick={onCombo}>선수조합</Button>
              <Button variant="secondary" onClick={onClose}>닫기<SpaceKey /></Button>
            </div>
          </div>
        ) : (
          <div className={s.runFoot}>
            <p className={s.running}><span className={s.spinner} aria-hidden /><span>여는 중</span></p>
            <Button variant="primary" size="l" onClick={() => { stop.current = true; }}>멈추기<SpaceKey /></Button>
          </div>
        )}
      </footer>
      <PulledSheet pc={detail} onClose={() => setDetail(null)} onPlayer={(id, cid) => { setDetail(null); onClose(); navigate(`/player/${id}?card=${cid}`); }} />
    </div>,
    document.body,
  );
}
