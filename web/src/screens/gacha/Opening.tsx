// 팩 열기 — 팩 찢기 → 30장이 뒷면으로 깔림 → 전부 뒤집기(낮은 등급부터 빠르게) → 가장 좋은 카드는 마지막에 따로(레전드 이펙트) → 요약
// 정직한 연출: 팩 옆 빛줄·카드 뒷면 빛은 실제 결과와 같다. 300ms 뒤부터 '건너뛰기'. 움직임 줄이기면 페이드로만.
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Card, CardBack, CardMini } from '../../cards';
import { GRADES } from '../../game/grades';
import { POS_KO, ROLE_KO } from '../../game/labels';
import { teamById } from '../../game/mock';
import { navigate } from '../../app/router';
import { Button, IconButton, Sheet, StatBar, fmt } from '../../ui';
import { roman, yearTag } from '../../ui/format';
import { lockScroll } from '../../ui/scrollLock';
import { PackArt } from './PackArt';
import { PACK_LOOK, isSynthetic } from './local-mock';
import { packTitle, rarity, type PullResult, type PulledCard } from './draw';
import { Reveal, lightOf } from './Reveal';
import { Price, Swatch, gradeFill, gradeShort } from './bits';
import s from './Opening.module.css';

export type OpeningStep = 'pack' | 'grid' | 'flip' | 'cine' | 'done';
type Phase = 'pack' | 'deal' | 'grid' | 'done';

const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const COLS = 6;

/** 스페이스 단축키 — 글 쓰는 칸이 아니면 화면 어디서든 (팩 열기 · 자동 열기가 같이 쓴다) */
export const isSpace = (e: KeyboardEvent) => e.key === ' ' || e.code === 'Space';
export const typingIn = (e: KeyboardEvent) => !!(e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]');
/** 스페이스 keyup 막기 — 초점 있던 단추가 keyup 에 한 번 더 눌리지 않게 */
export const spaceGuard = (e: KeyboardEvent) => { if (isSpace(e) && !typingIn(e)) e.preventDefault(); };
/** 단추 안 '스페이스' 표시 (마우스 · 키보드가 있는 화면에서만 보인다) */
export const SpaceKey = () => <kbd className={s.kbd} aria-hidden>Space</kbd>;

export interface OpeningProps {
  result: PullResult;
  /** 데모 — 바로 그 단계로 */
  step?: OpeningStep;
  onClose: () => void;
  /** 같은 팩 한 번 더 (재화 모자라면 없음) */
  onAgain?: () => void;
  onCombo: () => void;
}

export function Opening({ result, step, onClose, onAgain, onCombo }: OpeningProps) {
  const n = result.cards.length;
  const best = result.best;
  const bestCard = result.cards[best];
  const look = PACK_LOOK[result.pack.id] ?? PACK_LOOK.basic;
  const team = result.pick?.kind === 'club' ? teamById(result.pick.club.toLowerCase()) : undefined;

  const [phase, setPhase] = useState<Phase>(() => (step === 'done' ? 'done' : step && step !== 'pack' ? 'grid' : 'pack'));
  const [flipped, setFlipped] = useState<boolean[]>(() => Array(n).fill(step === 'done'));
  const [cine, setCine] = useState<number | null>(null);
  const [tear, setTear] = useState(0);
  const [torn, setTorn] = useState(step != null && step !== 'pack');
  const [canSkip, setCanSkip] = useState(false);
  const [detail, setDetail] = useState<PulledCard | null>(null);
  const [said, setSaid] = useState('');

  const flippedRef = useRef(flipped);
  flippedRef.current = flipped;
  const timers = useRef<number[]>([]);
  const raf = useRef(0);
  const flippingAll = useRef(false);
  const root = useRef<HTMLDivElement>(null);

  const later = useCallback((ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)); }, []);
  const clearTimers = () => { timers.current.forEach((t) => window.clearTimeout(t)); timers.current = []; cancelAnimationFrame(raf.current); };

  useEffect(() => () => clearTimers(), []);
  useEffect(() => { const t = window.setTimeout(() => setCanSkip(true), 300); return () => window.clearTimeout(t); }, []);

  // 뒤 화면 스크롤 막기 + 처음 초점
  useEffect(() => {
    const unlock = lockScroll();
    const last = document.activeElement as HTMLElement | null;
    root.current?.focus();
    return () => { unlock(); last?.focus?.(); };
  }, []);

  /* ── 뒤집기 ── */
  const flip = useCallback((i: number) => {
    setFlipped((f) => { if (f[i]) return f; const c = [...f]; c[i] = true; return c; });
  }, []);

  const startCine = useCallback((i: number) => {
    const c = result.cards[i];
    if (c.tier >= 1 && !reduced()) setCine(i);
    else flip(i);
  }, [flip, result.cards]);

  const flipAll = useCallback(() => {
    if (flippingAll.current) return;
    flippingAll.current = true;
    const order = result.cards
      .filter((c) => c.slot !== best && !flippedRef.current[c.slot])
      .sort((a, b) => rarity(a.card.grade) - rarity(b.card.grade) || a.slot - b.slot);
    const fast = reduced();
    let t = 0;
    for (const c of order) {
      later(t, () => flip(c.slot));
      t += fast ? 10 : c.tier === 0 ? 34 : c.tier === 1 ? 150 : 320;
    }
    later(t + (fast ? 100 : 520), () => { if (!flippedRef.current[best]) startCine(best); });
  }, [best, flip, later, result.cards, startCine]);

  // 데모 단계
  useEffect(() => {
    if (step === 'flip') later(600, flipAll);
    if (step === 'cine') later(250, () => setCine(best));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 다 뒤집으면 요약
  useEffect(() => {
    if ((phase === 'grid' || phase === 'deal') && cine == null && flipped.every(Boolean)) {
      const t = window.setTimeout(() => setPhase('done'), 420);
      return () => window.clearTimeout(t);
    }
  }, [phase, cine, flipped]);

  const tapCard = (i: number) => {
    if (phase === 'done') { setDetail(result.cards[i]); return; }
    if (phase !== 'grid' || flipped[i] || cine != null) return;
    if (i === best) { startCine(i); return; }
    flip(i);
    const c = result.cards[i];
    setSaid(`${GRADES[c.card.grade].ko} ${c.player.name}`);
  };

  const endCine = () => {
    if (cine != null) {
      const c = result.cards[cine];
      flip(cine);
      setSaid(`${GRADES[c.card.grade].ko} ${c.player.name}${c.isNew ? ', 새 카드' : ', 중복'}`);
    }
    setCine(null);
  };

  const skipAll = () => {
    clearTimers();
    flippingAll.current = true;
    setTorn(true);
    setCine(null);
    setFlipped(Array(n).fill(true));
    setPhase('done');
  };

  /* ── 찢기 (손가락으로 위 띠를 오른쪽으로) ── */
  const drag = useRef<{ x0: number; w: number } | null>(null);
  const tearRef = useRef(0);
  tearRef.current = tear;

  const dealNow = () => {
    setPhase('deal');
    later(reduced() ? 200 : 30 * 22 + 620, () => setPhase((p) => (p === 'deal' ? 'grid' : p)));
  };
  const finishTear = () => {
    setTear(1);
    setTorn(true);
    later(reduced() ? 60 : 400, dealNow);
  };
  const animateTear = (to: number, ms: number, then?: () => void) => {
    cancelAnimationFrame(raf.current);
    const from = tearRef.current;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      setTear(from + (to - from) * e);
      if (k < 1) raf.current = requestAnimationFrame(tick);
      else then?.();
    };
    raf.current = requestAnimationFrame(tick);
  };
  const openNow = () => (reduced() ? finishTear() : animateTear(1, 420, finishTear));

  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (torn) return;
    drag.current = { x0: e.clientX, w: e.currentTarget.getBoundingClientRect().width };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    cancelAnimationFrame(raf.current);
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    setTear(Math.max(0, Math.min(1, (e.clientX - d.x0) / (d.w * 0.8))));
  };
  const onUp = () => {
    if (!drag.current) return;
    drag.current = null;
    if (tearRef.current >= 0.6) animateTear(1, 160, finishTear);
    else animateTear(0, 260);
  };

  // Esc — 끝났으면 닫기, 아니면 건너뛰기 · 스페이스 — 그 단계의 주 단추(바로 열기 → 전부 뒤집기 → 건너뛰기 → 한 번 더)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (detail) return;
      if (e.key === 'Escape') { if (phase === 'done') onClose(); else skipAll(); return; }
      if (!isSpace(e) || typingIn(e)) return;
      e.preventDefault(); // 초점 있는 단추가 스페이스로 눌리지 않게 (keyup 도 막는다 — spaceGuard)
      if (e.repeat) return;
      if (phase === 'pack') { if (!torn) openNow(); }
      else if (phase === 'done') onAgain?.();
      else if (cine != null) endCine();
      else if (phase === 'grid' && !flippingAll.current) flipAll();
      else skipAll();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', spaceGuard);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', spaceGuard); };
  }); // 매번 최신 상태로

  const flippedCount = flipped.filter(Boolean).length;
  const light = lightOf(bestCard.card.grade, team?.colors.primary ?? teamById(bestCard.player.teamId).colors.primary);
  const title = packTitle(result.pack, result.pick);

  return createPortal(
    <div
      ref={root}
      className={[s.root, s['ph-' + phase]].join(' ')}
      role="dialog"
      aria-modal="true"
      aria-label={`${title} 30장 열기`}
      tabIndex={-1}
      style={{ '--light': light } as CSSProperties}
    >
      <div className={s.bg} aria-hidden />

      <header className={s.bar}>
        <p className={s.barTitle}>
          <b>{title}</b>
          <span><span className="num">30</span>장</span>
        </p>
        {phase === 'done' ? (
          <IconButton icon="close" label="닫기" onClick={onClose} className={s.close} />
        ) : (
          <button type="button" className={[s.skip, canSkip && s.skipOn].filter(Boolean).join(' ')} onClick={skipAll} disabled={!canSkip}>
            건너뛰기
          </button>
        )}
      </header>

      <main className={s.body}>
        {phase === 'pack' ? (
          <div className={s.packStage}>
            <div
              className={[s.packWrap, tear > 0 && s.held].filter(Boolean).join(' ')}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            >
              <PackArt
                skin={look.skin}
                name={result.pack.name}
                en={look.en}
                tag={`30장 · ${look.tag}`}
                year={result.pick?.kind === 'year' ? result.pick.year : undefined}
                team={team}
                tear={tear}
                torn={torn}
                signal={bestCard.tier}
                light={light}
              />
              {!torn && <span className={s.swipeHint} aria-hidden><i /></span>}
            </div>
          </div>
        ) : (
          <div className={s.grid} style={{ '--cols': COLS } as CSSProperties}>
            {result.cards.map((c, i) => {
              const on = flipped[i];
              const col = i % COLS, row = Math.floor(i / COLS);
              return (
                <button
                  key={i}
                  type="button"
                  className={[s.cell, on && s.on, s['t' + c.tier], i === best && s.best, phase === 'deal' && s.dealing].filter(Boolean).join(' ')}
                  style={{ '--cx': 2.5 - col, '--cy': 2 - row, '--i': i, '--gr': gradeFill(c.card.grade), '--grs': c.card.grade === 'signature' ? '#F3E9FF' : `var(--gr-${c.card.grade})` } as CSSProperties}
                  onClick={() => tapCard(i)}
                  aria-label={on ? `${c.player.name} ${GRADES[c.card.grade].ko}${c.isNew ? ' 새 카드' : ' 중복'}` : `${i + 1}번째 카드 뒤집기`}
                >
                  <span className={s.flip}>
                    <span className={[s.face, s.back].join(' ')}>
                      <CardBack grade={c.tier >= 1 ? c.card.grade : undefined} style={{ width: '100%' }} />
                      {c.tier >= 1 && <i className={s.glow} />}
                    </span>
                    <span className={[s.face, s.front].join(' ')}>
                      <CardMini player={c.player} grade={c.card.grade} year={c.card.year} style={{ width: '100%' }} />
                    </span>
                  </span>
                  {on && (c.isNew ? <em className={s.newMark}>NEW</em>
                    : c.up ? <em className={['num', s.dupMark, s.upMark].join(' ')} title={`강화 ${upText(c.up)}`}>{roman(c.up.to)}</em>
                    : <em className={['num', s.dupMark].join(' ')}>+1</em>)}
                </button>
              );
            })}
          </div>
        )}
      </main>

      <footer className={s.foot}>
        {phase === 'pack' && (
          <div className={s.packFoot}>
            <p className={s.hint}>띠를 밀어서 뜯어요</p>
            <Button variant="primary" size="l" block onClick={openNow} disabled={torn}>바로 열기<SpaceKey /></Button>
          </div>
        )}
        {(phase === 'deal' || phase === 'grid') && (
          <div className={s.gridFoot}>
            <p className={s.count}>
              <b className="num">{flippedCount}</b><span className="num">/30</span>
            </p>
            <Button variant="primary" size="l" onClick={flipAll} disabled={phase !== 'grid' || cine != null || flippingAll.current}>전부 뒤집기<SpaceKey /></Button>
          </div>
        )}
        {phase === 'done' && (
          <Summary result={result} onAgain={onAgain} onClose={onClose} onCombo={onCombo} onBest={() => setDetail(bestCard)} />
        )}
      </footer>

      {cine != null && <Reveal pc={result.cards[cine]} pick={result.pick} onDone={endCine} />}

      <PulledSheet pc={detail} onClose={() => setDetail(null)} onPlayer={(id, cid) => { setDetail(null); onClose(); navigate(`/player/${id}?card=${cid}`); }} />

      <p className="sr-only" aria-live="polite">{said}</p>
    </div>,
    document.body,
  );
}

/** 뽑은 카드 자세히 (시트) — 팩 열기 · 자동 열기가 같이 쓴다. onPlayer: '선수 정보'(가상 선수는 없음) */
export function PulledSheet({ pc, onClose, onPlayer }: { pc: PulledCard | null; onClose: () => void; onPlayer: (playerId: string, cardId: string) => void }) {
  return (
    <Sheet
      open={!!pc}
      onClose={onClose}
      title={pc ? pc.player.name : ''}
      sub={pc ? cardLine(pc) : undefined}
      footer={pc && !isSynthetic(pc.player) ? (
        <Button variant="secondary" onClick={() => onPlayer(pc.player.id, pc.card.id)}>선수 정보</Button>
      ) : undefined}
    >
      {pc && (
        <div className={s.detail}>
          <Card
            player={pc.player}
            grade={pc.card.grade}
            year={pc.card.year}
            level={pc.card.level}
            signaturePitch={pc.card.signaturePitch ?? null}
            award={pc.card.award}
            size="l"
          />
          <div className={s.detailInfo}>
            <p className={s.detailGrade} style={{ color: `var(--gr-${pc.card.grade})` }}>
              {GRADES[pc.card.grade].ko}{pc.card.year && GRADES[pc.card.grade].yearTagged ? ` ${yearTag(pc.card.year)}` : ''}
            </p>
            <p className={pc.isNew ? s.isNew : s.isDup}>{pc.isNew ? '새 카드' : pc.up ? <>강화 +1 <span className="num">({upText(pc.up)})</span></> : '중복 +1'}</p>
            {!pc.isNew && !pc.up && <p className={s.detailNote}>보유 <b className="num">{pc.had}</b>장</p>}
            {pc.card.signaturePitch && <p className={s.detailNote}>고유 구종 <b>{pc.card.signaturePitch.name}</b></p>}
          </div>
        </div>
      )}
      {pc && <DetailStats pc={pc} />}
    </Sheet>
  );
}

/** 상세 아래 능력치 — 카드 앞면 대표 6개 · 투수는 구종 · 이번 시즌 한 줄 */
function DetailStats({ pc }: { pc: PulledCard }) {
  const p = pc.player;
  const isP = p.pos === 'P';
  const bat = p.season.bat, pit = p.season.pit;
  return (
    <section className={s.stats} aria-label="능력치">
      <h3 className={s.statsH}>능력치</h3>
      <div className={s.statList}>
        {p.face.map((f) => <StatBar key={f.code} label={f.ko} value={f.v} size="s" labelWidth={56} />)}
      </div>
      {isP && p.pitches && p.pitches.length > 0 && (
        <>
          <h3 className={s.statsH}>구종</h3>
          <div className={s.statList}>
            {p.pitches.map((x) => <StatBar key={x.type} label={x.ko} value={x.stuff} size="s" labelWidth={56} note={<span className="num">{x.kmh}</span>} />)}
          </div>
        </>
      )}
      {(bat || pit) && (
        <p className={s.seasonLine}>
          <span>’27 시즌</span>
          {bat && <>타율 <b className="num">{fmt.avg(bat.avg)}</b> · 홈런 <b className="num">{bat.hr}</b> · 타점 <b className="num">{bat.rbi}</b> · OPS <b className="num">{fmt.avg(bat.ops)}</b></>}
          {pit && <>평균자책 <b className="num">{fmt.era(pit.era)}</b> · <b className="num">{pit.w}</b>승 <b className="num">{pit.l}</b>패 · 탈삼진 <b className="num">{pit.so}</b></>}
        </p>
      )}
    </section>
  );
}

const cardLine = (c: PulledCard) => {
  const t = teamById(c.player.teamId);
  const pos = c.player.pos === 'P' ? (c.player.role ? ROLE_KO[c.player.role] : '투수') : POS_KO[c.player.pos];
  return `${pos} · ${t.name}${c.card.award ? ' · ' + c.card.award : ''}`;
};

/** 'VI → VII' · '0 → I' */
export const upText =(u: { from: number; to: number }) => `${u.from > 0 ? roman(u.from) : '0'} → ${roman(u.to)}`;

function Summary({ result, onAgain, onClose, onCombo, onBest }: {
  result: PullResult; onAgain?: () => void; onClose: () => void; onCombo: () => void; onBest: () => void;
}) {
  const b = result.cards[result.best];
  return (
    <div className={s.summary}>
      <button type="button" className={s.sumBest} onClick={onBest}>
        <span className={s.sumBestK}>이번 팩 최고</span>
        <Swatch grade={b.card.grade} size={9} />
        <b>{GRADES[b.card.grade].ko}</b>
        <span className={s.sumBestName}>{b.player.name}</span>
        <span className={b.isNew ? s.isNew : s.isDup}>{b.isNew ? '새 카드' : b.up ? `강화 ${upText(b.up)}` : '중복 +1'}</span>
      </button>
      <ul className={s.counts} aria-label="등급별 장수">
        {result.counts.map((c) => (
          <li key={c.grade}><Swatch grade={c.grade} /><span>{gradeShort(c.grade)}</span><b className="num">{c.n}</b></li>
        ))}
      </ul>
      <p className={s.sumLine}>
        새 카드 <b className="num">{result.fresh}</b> · 중복 <b className="num">{result.dups}</b>
      </p>
      {result.ups.length > 0 && (
        <p className={[s.sumLine, s.sumUps].join(' ')}>
          강화 <b className="num">{result.ups.length}</b>
          <span className={s.sumUpList}>
            {result.ups.slice(0, 3).map((u) => (
              <span key={u.card.id}>{u.player.name} <b className="num">+1</b> <span className="num">({upText(u)})</span></span>
            ))}
            {result.ups.length > 3 && <span>외 <span className="num">{result.ups.length - 3}</span>장</span>}
          </span>
        </p>
      )}
      <p className={s.sumLine}>
        {result.pity.hit
          ? <>천장 보상 <b>{result.pity.reward}</b></>
          : <>천장까지 <b className="num">{result.pity.max - result.pity.after}</b>팩</>}
      </p>
      <div className={s.actions}>
        {onAgain && (
          <Button variant="primary" size="l" block onClick={onAgain} trailing={<Price price={result.price} />} className={s.again}>
            한 번 더<SpaceKey />
          </Button>
        )}
        <div className={s.actions2}>
          <Button variant="secondary" onClick={onCombo}>선수조합</Button>
          <Button variant="secondary" onClick={onClose}>닫기</Button>
        </div>
      </div>
    </div>
  );
}
