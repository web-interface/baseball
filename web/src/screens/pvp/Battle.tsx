// 비동기 대전 경기 — 경기 전(맞대결) → 빨리 보기(1~9회 10초 안팎, 강조 문구는 멈춰서 띄움) → 결과
// 강조 문구: 호수비 · 동점/역전/결승타 · 위기 탈출 · 끝내기 — sim 이 승리 확률 변화로 고른 것만(한 경기 4번까지)
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { navigate, goBack } from '../../app/router';
import { Button, CalloutAnnouncer, CalloutStage, Emblem, Field, Icon, Tabs, fmt, useCalloutQueue, type CalloutData, type CalloutPace } from '../../ui';
import { readPrefs } from '../../app/prefs';
import { PlayerArt } from '../../art/PlayerArt';
import { POS_KO } from '../../game/labels';
import { BASES } from '../../game/field';
import type { PvpOpponent } from '../../game/types';
import { Spark } from './Spark';
import { expected, mySide, oppSide, ratingDelta, simulate, type Beat, type Side, type Sim } from './local-mock';
import s from './battle.module.css';

type Phase = 'pre' | 'live' | 'done';
const SPEED: Record<'quick' | 'normal', { idle: number; run: number }> = { quick: { idle: 260, run: 620 }, normal: { idle: 480, run: 1150 } };

export function Battle({ opp, auto, rating, left, onFinish }: { opp: PvpOpponent; auto: boolean; rating: number; left: number; onFinish: (res: 'W' | 'D' | 'L', delta: number) => void }) {
  // 경기 시작 때 레이팅을 고정 (끝난 뒤 부모가 레이팅을 올려도 이 판 계산은 그대로)
  const [base, setBase] = useState(rating);
  const me = useMemo(() => ({ ...mySide(), rating: base }), [base]);
  const them = useMemo(() => oppSide(opp), [opp]);
  const [tries, setTries] = useState(0);
  const sim = useMemo(() => simulate(me, them, `${opp.id}:${tries}`), [me, them, opp.id, tries]);
  const [phase, setPhase] = useState<Phase>(auto ? 'live' : 'pre');
  const [pace, setPace] = useState<'quick' | 'normal'>(() => (readPrefs().watch === 'quick' ? 'quick' : 'normal'));
  const [at, setAt] = useState(-1);
  const [delta, setDelta] = useState(0);
  const q = useCalloutQueue();
  const waiting = useRef(false);
  const finished = useRef(false);

  const beat = at >= 0 ? sim.beats[at] : null;

  // 진행 — 강조 장면이면 문구가 끝날 때까지 멈춘다
  useEffect(() => {
    if (phase !== 'live') return;
    if (q.current) return; // 문구가 떠 있는 동안 멈춤
    if (at >= sim.beats.length - 1) {
      const tmr = window.setTimeout(() => finish(), 700);
      return () => window.clearTimeout(tmr);
    }
    const nb = sim.beats[at + 1];
    const wait = at < 0 ? 400 : (sim.beats[at].runs > 0 || sim.beats[at].text ? SPEED[pace].run : SPEED[pace].idle);
    const tmr = window.setTimeout(() => {
      setAt((x) => x + 1);
      if (nb.highlight) {
        waiting.current = true;
        const tm = nb.highlight.teamKey === 'me' ? me.team : them.team;
        const data: CalloutData = {
          id: `${tries}:${at + 1}`, kind: nb.highlight.kind, title: nb.highlight.title, sub: nb.highlight.sub, meta: nb.highlight.meta,
          causes: nb.causes?.map((c) => c.text), team: { primary: tm.colors.primary, secondary: tm.colors.secondary, ink: tm.colors.ink },
        };
        window.setTimeout(() => q.push(data), 180);
      }
    }, wait);
    return () => window.clearTimeout(tmr);
  }, [phase, at, q.current, pace, sim]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    const dl = ratingDelta(me.rating, them.rating, sim.result);
    setDelta(dl);
    setPhase('done');
    setAt(sim.beats.length - 1);
    onFinish(sim.result, dl);
  };
  const start = () => { finished.current = false; setAt(-1); q.clear(); setPhase('live'); window.scrollTo(0, 0); };
  const again = () => { setBase(rating); setTries((x) => x + 1); finished.current = false; setAt(-1); q.clear(); setPhase('live'); window.scrollTo(0, 0); };
  const skip = () => { q.clear(); finish(); };

  return (
    <div className={s.screen}>
      <div className={s.topRow}>
        <button type="button" className={s.back} onClick={() => goBack('/pvp')}><Icon name="back" size={18} />대전 상대</button>
        <span className={s.mode}>AI 연습 · {them.user}</span>
      </div>
      {phase === 'pre' && <Pre me={me} them={them} opp={opp} pace={pace} setPace={setPace} onStart={start} left={left} />}
      {phase !== 'pre' && (
        <Live
          sim={sim} at={at} beat={beat} phase={phase} pace={pace}
          callout={q.current} onCalloutDone={() => { q.next(); waiting.current = false; }}
          onSkip={skip}
          onReplay={(b) => {
            const tm = b.highlight!.teamKey === 'me' ? me.team : them.team;
            q.push({ id: `r${Date.now()}`, kind: b.highlight!.kind, title: b.highlight!.title, sub: b.highlight!.sub, meta: b.highlight!.meta, causes: b.causes?.map((c) => c.text), team: { primary: tm.colors.primary, secondary: tm.colors.secondary, ink: tm.colors.ink } });
          }}
        />
      )}
      {phase === 'done' && <Result sim={sim} me={me} them={them} delta={delta} opp={opp} onAgain={again} left={left} />}
      <CalloutAnnouncer callout={q.current} />
    </div>
  );
}

/* ───────── 경기 전 ───────── */
function Pre({ me, them, opp, pace, setPace, onStart, left }: { me: Side; them: Side; opp: PvpOpponent; pace: 'quick' | 'normal'; setPace: (p: 'quick' | 'normal') => void; onStart: () => void; left: number }) {
  const exp = expected(me.rating, them.rating) * 0.6 + (0.5 + (me.ovr - them.ovr) * 0.02) * 0.4;
  const st = them.team.stadium;
  const winD = ratingDelta(me.rating, them.rating, 'W'), lossD = ratingDelta(me.rating, them.rating, 'L');
  return (
    <div className={s.pre}>
      <section className={s.match} style={{ '--a': me.team.colors.primary, '--b': them.team.colors.primary } as CSSProperties}>
        <SideHead side={me} align="L" tag="원정" />
        <div className={s.vs}><span className="num-display">VS</span></div>
        <SideHead side={them} align="R" tag="홈" />
      </section>
      <div className={s.expect}>
        <div className={s.expHead}><span>예상 승리 확률</span><b className="num">{Math.round(exp * 100)}%</b></div>
        <div className={s.expBar} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(exp * 100)} aria-label="내 예상 승리 확률">
          <i style={{ width: `${exp * 100}%`, background: me.team.colors.primary }} />
          <i style={{ flex: 1, background: them.team.colors.primary }} />
        </div>
      </div>

      <section className={s.block}>
        <h3 className={['head', s.h].join(' ')}>선발 맞대결</h3>
        <div className={s.duel}>
          {[me, them].map((sd) => (
            <div key={sd.key} className={[s.sp, sd.key === 'opp' && s.spR].filter(Boolean).join(' ')}>
              <span className={s.face}><PlayerArt player={sd.sp.player} team={sd.team} variant="mini" /></span>
              <span className={s.spBody}>
                <b>{sd.sp.player.name}</b>
                <span>{sd.team.short} · <span className="num">{sd.sp.player.ovr}</span> · 평균자책 <span className="num">{fmt.era(sd.sp.player.season.pit?.era ?? 4)}</span></span>
                {sd.sp.card.signaturePitch && <em style={{ '--sig': sd.sp.card.signaturePitch.color } as CSSProperties}>{sd.sp.card.signaturePitch.name}</em>}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className={s.block}>
        <h3 className={['head', s.h].join(' ')}>구장 <span className={s.hSub}>{them.team.short} 홈</span></h3>
        <div className={s.park}>
          <div className={s.parkField}><Field stadium={st} distances lights={false} label={st.name} /></div>
          <div className={s.parkBody}>
            <b title={st.desc}>{st.name}</b>
            <p className={s.parkNote}>{st.note}</p>
            <p className={['num', s.parkDist].join(' ')}>{st.fence[0]} · {st.fence[1]} · {st.fence[2]}m</p>
          </div>
        </div>
      </section>

      <section className={s.block}>
        <h3 className={['head', s.h].join(' ')}>타순 맞대결</h3>
        <ol className={s.order}>
          {me.batting.map((b, i) => {
            const o = them.batting[i];
            return (
              <li key={b.order}>
                <span className={s.oL}><b>{b.player.name}</b><span>{POS_KO[b.pos]}</span></span>
                <span className={['num', s.oOvr, b.player.ovr >= (o?.player.ovr ?? 0) && s.oWin].filter(Boolean).join(' ')}>{b.player.ovr}</span>
                <span className={['num', s.oNo].join(' ')}>{b.order}</span>
                <span className={['num', s.oOvr, (o?.player.ovr ?? 0) > b.player.ovr && s.oWin].filter(Boolean).join(' ')}>{o?.player.ovr}</span>
                <span className={s.oR}><b>{o?.player.name}</b><span>{o ? POS_KO[o.pos] : ''}</span></span>
              </li>
            );
          })}
        </ol>
      </section>

      <div className={s.reward}>
        <span>승 <b className="num">+{fmt.int(opp.rival === 'rival' ? opp.reward * 2 : opp.reward)}</b> GP · 레이팅 <b className="num">{fmt.signed(winD)}</b></span>
        <span>패 <b className="num">+300</b> GP · 레이팅 <b className="num">{fmt.signed(lossD)}</b></span>
      </div>

      <div className={s.startBar}>
        <Tabs variant="box" size="s" value={pace} onChange={setPace} aria-label="보기 방식" items={[{ value: 'quick', label: '빨리 보기' }, { value: 'normal', label: '주요 장면' }]} />
        <Button className={s.startBtn} onClick={onStart} disabled={left <= 0} trailing={<span>남은 <span className="num">{left}</span></span>}>경기 시작</Button>
      </div>
    </div>
  );
}

function SideHead({ side, align, tag }: { side: Side; align: 'L' | 'R'; tag: string }) {
  return (
    <div className={[s.side, align === 'R' && s.sideR].filter(Boolean).join(' ')}>
      <Emblem team={side.team} size={44} />
      <p className={s.sTag}>{tag}</p>
      <p className={['head', s.sName].join(' ')}>{side.team.name}</p>
      <p className={s.sUser}>{side.key === 'me' ? '나' : side.user} · 레이팅 <span className="num">{fmt.int(side.rating)}</span></p>
      <p className={s.sOvr}><b className="num-display">{side.ovr}</b><span>팀 종합</span></p>
    </div>
  );
}

/* ───────── 경기 중 · 끝난 뒤 판 ───────── */
function Live({ sim, at, beat, phase, pace, callout, onCalloutDone, onSkip, onReplay }: {
  sim: Sim; at: number; beat: Beat | null; phase: Phase; pace: 'quick' | 'normal';
  callout: CalloutData | null; onCalloutDone: () => void; onSkip: () => void; onReplay: (b: Beat) => void;
}) {
  const shown = sim.beats.slice(0, at + 1);
  const cell = (side: 'away' | 'home', i: number) => {
    const idx = sim.beats.findIndex((b) => b.inning === i + 1 && b.half === (side === 'away' ? 'top' : 'bot'));
    if (idx < 0) return side === 'home' && at >= sim.beats.length - 1 && sim.line.home[i] === null && i + 1 >= 9 ? 'X' : '';
    return idx <= at ? String(sim.beats[idx].runs) : '';
  };
  const score: [number, number] = beat ? beat.score : [0, 0];
  const hits = (half: 'top' | 'bot') => shown.filter((b) => b.half === half).reduce((a, b) => a + b.hits, 0);
  const cur = beat;
  const ticker = shown.filter((b) => b.text).slice(-3).reverse();
  const wp = [0.5, ...shown.map((b) => b.wpMe)];
  const calloutPace: CalloutPace = pace === 'quick' ? 'quick' : 'normal';
  const inn = Math.max(sim.innings, 9);
  const cols = Array.from({ length: inn }, (_, i) => i);
  const st = sim.home.team.stadium;
  const curIdx = phase === 'live' && at + 1 < sim.beats.length ? at + 1 : -1;
  const curBeat = curIdx >= 0 ? sim.beats[curIdx] : null;
  return (
    <div className={s.live}>
      <div className={s.score} role="table" aria-label="점수판" style={{ '--cols': inn } as CSSProperties}>
        <div className={[s.sRow, s.sHead].join(' ')} role="row">
          <span role="columnheader" />
          {cols.map((i) => <span key={i} role="columnheader" className="num">{i + 1}</span>)}
          <span role="columnheader" className={s.sR}>R</span><span role="columnheader">H</span>
        </div>
        {(['away', 'home'] as const).map((side) => {
          const sd = side === 'away' ? sim.away : sim.home;
          return (
            <div key={side} className={s.sRow} role="row">
              <span className={s.sTeam} role="rowheader"><i style={{ background: sd.team.colors.primary }} />{sd.team.short}</span>
              {cols.map((i) => {
                const now = curBeat && curBeat.inning === i + 1 && curBeat.half === (side === 'away' ? 'top' : 'bot');
                return <span key={i} role="cell" className={['num', now && s.sNow].filter(Boolean).join(' ')}>{cell(side, i)}</span>;
              })}
              <span role="cell" className={['num-display', s.sR].join(' ')}>{side === 'away' ? score[0] : score[1]}</span>
              <span role="cell" className="num">{hits(side === 'away' ? 'top' : 'bot')}</span>
            </div>
          );
        })}
      </div>

      <CalloutStage callout={callout} pace={calloutPace} onDone={onCalloutDone} className={s.stage}>
        <div className={s.fieldBox}>
          <div className={s.fieldIn}>
            <Field
              stadium={st}
              distances={false}
              label={`${st.name} — ${cur?.text ?? '경기 전'}`}
              svg={cur ? <BeatMarks b={cur} /> : undefined}
            />
          </div>
          <div className={s.hud}>
            <span className={s.inn}>
              {cur ? <><b className="num">{cur.inning}</b>회{cur.half === 'top' ? '초' : '말'}</> : '플레이볼'}
            </span>
            <Bases b={cur?.bases ?? [false, false, false]} />
            <span className={s.outs} aria-label={`${cur?.outs ?? 0} 아웃`}>{[0, 1, 2].map((k) => <i key={k} className={k < (cur?.outs ?? 0) ? s.outOn : undefined} />)}</span>
          </div>
          {phase === 'done' && (
            <div className={[s.final, sim.result === 'W' ? s.fW : sim.result === 'L' ? s.fL : s.fD].join(' ')}>
              <b className="head">{sim.result === 'W' ? '승리' : sim.result === 'L' ? '패배' : '무승부'}</b>
              <span className="num-display">{sim.final[0]} : {sim.final[1]}</span>
            </div>
          )}
        </div>
      </CalloutStage>

      <div className={s.ticker} aria-live="polite">
        {ticker.length === 0 && <p className={s.tkIdle}>{phase === 'live' ? '1회초' : ''}</p>}
        {ticker.map((b, i) => (
          <div key={`${b.inning}${b.half}`} className={[s.tk, i === 0 && s.tkNew].filter(Boolean).join(' ')}>
            <span className={['num', s.tkInn].join(' ')}>{b.inning}{b.half === 'top' ? '초' : '말'}</span>
            <div className={s.tkBody}>
              <p>{b.text}{b.runs > 0 && <b className="num"> {b.score[0]}:{b.score[1]}</b>}</p>
              {i === 0 && b.causes?.slice(0, 2).map((c) => <p key={c.text} className={s.cause}>↳ {c.text}</p>)}
            </div>
          </div>
        ))}
      </div>

      <div className={s.wp}>
        <div className={s.wpHead}>
          <span>내 승리 확률</span>
          <b className="num">{Math.round(wp[wp.length - 1] * 100)}%</b>
        </div>
        <Spark values={wp} min={0} max={1} mid={0.5} className={s.wpSpark} label="내 승리 확률 흐름" />
      </div>

      {phase === 'live' && (
        <div className={s.liveBar}>
          <span className={s.paceNote}>{pace === 'quick' ? '빨리 보기' : '주요 장면'}</span>
          <Button variant="secondary" size="s" icon="fast" onClick={onSkip}>결과 보기</Button>
        </div>
      )}
      {phase === 'done' && sim.beats.some((b) => b.highlight) && (
        <section className={s.block}>
          <h3 className={['head', s.h].join(' ')}>명장면</h3>
          <ul className={s.hls}>
            {sim.beats.filter((b) => b.highlight).map((b) => (
              <li key={`${b.inning}${b.half}`}>
                <button type="button" className={s.hl} onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); onReplay(b); }}>
                  <span className={s.hlKind} style={{ background: b.highlight!.teamKey === 'me' ? sim.away.team.colors.primary : sim.home.team.colors.primary }} aria-hidden />
                  <span className={s.hlBody}>
                    <b>{b.highlight!.title}</b>
                    <span>{b.inning}회{b.half === 'top' ? '초' : '말'} · {b.highlight!.sub.split(' · ')[0]} · {b.highlight!.meta}</span>
                  </span>
                  <Icon name="play" size={16} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Bases({ b }: { b: [boolean, boolean, boolean] }) {
  return (
    <svg className={s.bases} viewBox="0 0 34 24" aria-label={`주자 ${b.map((x, i) => (x ? `${i + 1}루` : '')).filter(Boolean).join('·') || '없음'}`}>
      <rect x="20" y="9" width="8" height="8" transform="rotate(45 24 13)" className={b[0] ? s.baseOn : s.base} />
      <rect x="13" y="2" width="8" height="8" transform="rotate(45 17 6)" className={b[1] ? s.baseOn : s.base} />
      <rect x="6" y="9" width="8" height="8" transform="rotate(45 10 13)" className={b[2] ? s.baseOn : s.base} />
    </svg>
  );
}

/** 경기장 위 — 공 떨어진 곳 · 수비 범위 원 · 주자 */
function BeatMarks({ b }: { b: Beat }) {
  const S = 400;
  const runner = (k: 'first' | 'second' | 'third') => <circle key={k} cx={BASES[k].x * S} cy={BASES[k].y * S} r="6" className={s.runner} />;
  return (
    <g>
      {b.range && <circle cx={b.range.x * S} cy={b.range.y * S} r={b.range.r * S} className={s.range} />}
      {b.ball && <path d={`M200 400Q${(200 + b.ball.x * S) / 2} ${Math.min(b.ball.y * S, 400) - (b.ball.kind === 'fly' ? 90 : 30)} ${b.ball.x * S} ${b.ball.y * S}`} className={s.flight} />}
      {b.ball && <circle cx={b.ball.x * S} cy={b.ball.y * S} r="6" className={s.ball} />}
      {b.bases?.[0] && runner('first')}
      {b.bases?.[1] && runner('second')}
      {b.bases?.[2] && runner('third')}
    </g>
  );
}

/* ───────── 결과 ───────── */
function Result({ sim, me, them, delta, opp, onAgain, left }: { sim: Sim; me: Side; them: Side; delta: number; opp: PvpOpponent; onAgain: () => void; left: number }) {
  const [shown, setShown] = useState(me.rating);
  useEffect(() => {
    const to = me.rating + delta;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setShown(to); return; }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 900);
      setShown(Math.round(me.rating + delta * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [me.rating, delta]);
  const gp = sim.result === 'W' ? (opp.rival === 'rival' ? opp.reward * 2 : opp.reward) : sim.result === 'D' ? Math.round(opp.reward / 2) : 300;
  return (
    <div className={s.result}>
      <dl className={s.resList}>
        <div><dt>레이팅</dt><dd><span className="num">{fmt.int(me.rating)}</span> → <b className="num">{fmt.int(shown)}</b> <em className={['num', delta >= 0 ? s.up : s.down].join(' ')}>{fmt.signed(delta)}</em></dd></div>
        <div><dt>보상</dt><dd><b className="num">+{fmt.int(gp)}</b> GP{opp.rival === 'rival' && sim.result === 'W' ? ' · 라이벌 2배' : ''}</dd></div>
        <div><dt>오늘 남은 대전</dt><dd><b className="num">{left}</b>/10</dd></div>
      </dl>
      {sim.keyFactors.length > 0 && (
        <section className={s.block}>
          <h3 className={['head', s.h].join(' ')}>결정적 요인</h3>
          <ul className={s.factors}>
            {sim.keyFactors.map((c) => <li key={c.text}>↳ {c.text}{c.decisive && <em> · 결정적</em>}</li>)}
          </ul>
        </section>
      )}
      <div className={s.resBtns}>
        <Button variant="secondary" onClick={() => navigate('/pvp')}>다른 상대</Button>
        <Button onClick={onAgain} disabled={left <= 0}>한 번 더</Button>
      </div>
    </div>
  );
}
