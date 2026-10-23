// 경기 준비·진행 #/season — 경기 운영의 가운데. 다음 경기(상대 · 승리 예상 · 예상 선발 · 구장 · 날씨) → 경기 전 준비(라인업 점검 ·
// 감독 인터뷰) → 진행(지금 바로 경기 · 남은 시즌 빨리 감기) → AI 뉴스(커뮤니티 글) → 지난 경기 → 포스트시즌 · 리그 단계.
// 순위표 · 개인 기록은 순위·리그 기록(#/league), 지난 경기 박스스코어는 경기 기록(#/games), 일정은 시즌 일정(#/schedule).
// 빨리 감기: 남은 정규 시즌을 하루씩 공용 엔진으로(한 날 = 다섯 경기) — 속도 1·2·4배 · 끝까지, 하이라이트 경기에서 잠깐 멈춤.
//   ?go=1 바로 시작 · ?speed=1|2|4|end
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ScreenProps } from '../../app/screen';
import { navigate } from '../../app/router';
import { Button, Emblem, Tabs, useToast } from '../../ui';
import { ME, playerById, teamById } from '../../game/mock';
import { longDate, openingDate, shortDate } from '../../season/schedule';
import { allDays, getSeason, isOver, rankLabel, teamLine, useSeason, yearOf, type DayHighlight, type NewsRec } from '../../season/store';
import { markFastDay } from '../../game/press';
import { LeaguePanel, useStartNextSeason } from './LeaguePanel';
import { PostPanel } from './PostPanel';
import { playNextDay } from '../../season/run';
import { LEVEL_KO, aiLevel } from '../../season/rosters';
import type { GameOut } from '../../season/sim';
import { NextGame } from '../home/NextGame';
import { LastGame } from '../home/LastGame';
import { LEGEND_MAX, evaluate, initialLineup, store as lineupStore } from '../lineup/calc';
import { useInventory } from '../../game/inventory';
import { InterviewCard, NewsFeed } from '../press';
import { boxKeyOfMyGame } from '../../season/box';
import s from './season.module.css';

type Speed = '1' | '2' | '4' | 'end';
const DAY_MS: Record<Exclude<Speed, 'end'>, number> = { '1': 900, '2': 450, '4': 200 };
const HL_MS: Record<Exclude<Speed, 'end'>, number> = { '1': 3200, '2': 2400, '4': 1600 };
const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function SeasonScreen({ query }: ScreenProps) {
  const toast = useToast();
  const startNext = useStartNextSeason();
  const st = useSeason();
  const days = allDays(st);
  const over = isOver(st);
  const q = query.get('speed');
  const [speed, setSpeed] = useState<Speed>(q === '1' || q === '4' || q === 'end' ? q : '2');
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hl, setHl] = useState<DayHighlight | null>(null);
  const runRef = useRef(false);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; runRef.current = false; }; }, []);

  const loop = useCallback(async () => {
    if (runRef.current) return;
    runRef.current = true;
    setRunning(true);
    try {
      while (runRef.current && alive.current) {
        setBusy(true);
        { const cur = getSeason(); markFastDay(yearOf(cur), cur.next); } // 빨리 감기로 넘긴 날 — AI 특이사항 뉴스 없음 (문구 틀만)
        const r = await playNextDay();
        setBusy(false);
        if (!r) break;
        const sp = speedRef.current;
        if (sp === 'end') { await new Promise((ok) => setTimeout(ok, 0)); continue; }
        // 하이라이트 경기 — 잠깐 멈춰 보여 준다 (움직임 줄이기면 짧게)
        const h = r.hl.sort((a, b) => rankHl(a) - rankHl(b))[0];
        if (h && !reduced()) {
          setHl(h);
          await new Promise((ok) => setTimeout(ok, HL_MS[sp]));
          if (!alive.current) break;
          setHl(null);
        }
        await new Promise((ok) => setTimeout(ok, DAY_MS[sp]));
      }
    } catch (e) {
      console.error(e);
      toast({ text: '경기 계산 중 문제가 생겼어요', tone: 'bad' });
    } finally {
      runRef.current = false;
      setBusy(false);
      if (alive.current) setRunning(false);
    }
  }, [toast]);
  const stop = () => { runRef.current = false; setRunning(false); };

  useEffect(() => { if (query.get('go') === '1' && !over) void loop(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const me = teamById(ME.teamId);
  const ln = teamLine(ME.teamId, st);
  const rec = ln.row;
  const cur = days[Math.min(st.next, days.length - 1)];
  const doneN = st.next, totalN = days.length;
  const news = st.news.slice(-12).reverse();

  return (
    <div className={s.screen}>
      <header className={s.top}>
        <p className={s.kicker}><span className="num">{yearOf(st)}</span> {over ? (st.post ? '포스트시즌' : '정규 시즌 끝') : '정규 시즌'} · 리그 단계 {LEVEL_KO[aiLevel()]}</p>
        <h2 className={['head', s.title].join(' ')}>경기 준비·진행</h2>
        <div className={s.meRow}>
          <Emblem team={me} size={34} />
          <p className={s.meMain}>
            <b>{me.short} <span className="num">{rec.w}</span>승 <span className="num">{rec.d}</span>무 <span className="num">{rec.l}</span>패</b>
            <small>{rankLabel(ln)} · <span className="num">{ln.played}</span>경기 · 최근 {ln.form.split('').reverse().map((c) => (c === 'W' ? '승' : c === 'L' ? '패' : '무')).join('') || '—'}</small>
          </p>
          <span className={['num-display', s.rankBig].join(' ')}>{ln.started ? <>{ln.rank}<i>위</i></> : <>—<i>개막 전</i></>}</span>
        </div>
      </header>

      {/* 포스트시즌 (정규 시즌이 끝나면 — KBO 방식) */}
      <PostPanel />
      {/* 시즌 결산 인터뷰 (정규 시즌이 끝난 뒤 — 가을야구면 포스트시즌 첫 3경기 효과) */}
      {over && <section className={s.sec} aria-label="시즌 결산 인터뷰"><InterviewCard /></section>}

      {/* 다음 경기 — 상대 · 승리 예상 · 예상 선발 · 구장 · 날씨, 지금 바로 경기 / 라인업 */}
      {!over && <div className={s.nextWrap}><NextGame inHub /></div>}

      {/* 경기 전 준비 — 라인업 점검 · 감독 인터뷰 */}
      {!over && (
        <section className={s.sec} aria-label="경기 전 준비">
          <p className={s.secH}>경기 전 준비 <small>다음 경기 전에 해 두면 좋아요</small></p>
          <Prep />
          <InterviewCard />
        </section>
      )}

      {/* 진행 — 남은 정규 시즌 빨리 감기 */}
      {!over && (
        <section className={s.sec} aria-label="남은 시즌 빨리 감기">
          <p className={s.secH}>남은 시즌 빨리 감기 <small>내 경기도 결과만 — 직접 보려면 '지금 바로 경기'</small></p>
          <div className={s.prog}>
            <div className={s.progTop}>
              <b>{cur ? longDate(cur.date) : ''}</b>
              <span className="num">{doneN}/{totalN}일 {busy && <i className={s.busy}>계산 중</i>}</span>
            </div>
            <div className={s.bar} role="progressbar" aria-valuemin={0} aria-valuemax={totalN} aria-valuenow={doneN} aria-label="시즌 진행">
              <i style={{ width: `${(doneN / Math.max(1, totalN)) * 100}%` }} />
            </div>
            <div className={s.progEnds}><span>{shortDate(days[0]?.date ?? openingDate())} 개막</span><span>{shortDate(days[days.length - 1]?.date ?? openingDate())}</span></div>
          </div>
          <div className={s.ctrl}>
            <Tabs variant="box" size="s" fill aria-label="속도" value={speed} onChange={setSpeed}
              items={[{ value: '1', label: '1배' }, { value: '2', label: '2배' }, { value: '4', label: '4배' }, { value: 'end', label: '끝까지' }]} />
            <div className={s.ctrlBtns}>
              {running
                ? <Button size="l" block variant="secondary" icon="pause" onClick={stop}>멈춤</Button>
                : <Button size="l" block variant="secondary" icon="fast" onClick={() => void loop()}>{doneN === 0 ? '빨리 감기 시작' : '빨리 감기 이어서'}</Button>}
            </div>
          </div>
          {hl && <HighlightCard h={hl} />}
          {running && news.length > 0 && (
            <ul className={s.ticker} aria-live="polite">
              {news.slice(0, 4).map((n, i) => <NewsLine key={`${n.idx}-${i}-${n.text}`} n={n} />)}
            </ul>
          )}
        </section>
      )}

      {/* AI 뉴스 — 커뮤니티 글 */}
      <section className={s.sec} aria-label="야구 커뮤니티 소식">
        <p className={s.secH}>리그 소식 <small>오늘 커뮤니티에서 뜨거운 글</small></p>
        <NewsFeed limit={6} />
        {!running && news.length > 0 && (
          <details className={s.moreNews}>
            <summary>지난 소식 <span className="num">{news.length}</span>개</summary>
            <ul>{news.map((n, i) => <NewsLine key={`${n.idx}-${i}-${n.text}`} n={n} />)}</ul>
          </details>
        )}
      </section>

      {/* 지난 경기 — 점수판 · 승리 확률 흐름 · 명장면 (+ 박스스코어는 경기 기록에서) */}
      <div className={s.lastWrap}><LastGame /></div>
      {st.my.length > 0 && (
        <p className={s.boxLink}>
          <button type="button" onClick={() => navigate(`/games?g=${boxKeyOfMyGame(st.my[st.my.length - 1])}`)}>지난 경기 박스스코어 보기 ›</button>
        </p>
      )}

      {/* 리그 단계 (AI 상대 난이도 — 자동) · 포스트시즌까지 끝났으면 다음 해 시작 */}
      <LeaguePanel />

      {over && (
        <section className={s.sec}>
          <div className={s.endBtns}>
            {st.post?.champion
              ? <Button size="l" block icon="play" onClick={startNext}><span className="num">{yearOf(st) + 1}</span> 시즌 시작</Button>
              : <Button size="l" block variant="secondary" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>위로 — 포스트시즌</Button>}
          </div>
        </section>
      )}

      {/* 경기 운영 다른 화면 */}
      <nav className={s.jump} aria-label="경기 운영 더 보기">
        <button type="button" onClick={() => navigate('/schedule')}><b>시즌 일정</b><small>월별 · 전체 일정</small></button>
        <button type="button" onClick={() => navigate('/league')}><b>순위·리그 기록</b><small>팀 순위 · 개인 기록</small></button>
        <button type="button" onClick={() => navigate('/games')}><b>경기 기록</b><small>지난 경기 · 박스스코어</small></button>
      </nav>
    </div>
  );
}

/** 경기 전 점검 — 팀 종합 · 레전드급 인원 · 비어 있는 자리 · 부상 선수 */
function Prep() {
  const inv = useInventory();
  const st = useSeason();
  const info = useMemo(() => {
    const lu = lineupStore.get() ?? initialLineup();
    const ev = evaluate(lu);
    const empty = Object.values(lu.field).filter((x) => !x).length + (lu.rotation[0] ? 0 : 1);
    const hurt = Object.values(ev.units).filter((u) => u?.injured).length;
    return { ev, empty, hurt };
  }, [inv, st.next]); // eslint-disable-line react-hooks/exhaustive-deps
  const { ev, empty, hurt } = info;
  const warn = empty > 0 || hurt > 0;
  return (
    <div className={[s.prep, warn && s.prepWarn].filter(Boolean).join(' ')}>
      <div className={s.prepMain}>
        <span className={s.prepK}>팀 종합</span>
        <b className="num-display">{ev.overall}</b>
      </div>
      <ul className={s.prepList}>
        <li>타격 <b className="num">{ev.parts.find((p) => p.k === 'bat')?.v}</b> · 수비 <b className="num">{ev.parts.find((p) => p.k === 'def')?.v}</b> · 투수 <b className="num">{ev.parts.find((p) => p.k === 'pit')?.v}</b></li>
        <li>레전드급 타자 <b className="num">{ev.legend.bat}</b>/{LEGEND_MAX.bat} · 투수 <b className="num">{ev.legend.pit}</b>/{LEGEND_MAX.pit}{ev.active.length > 0 && <> · 세트 <b className="num">{ev.active.length}</b>개 켜짐</>}</li>
        {empty > 0 && <li className={s.prepBad}>비어 있는 자리 <b className="num">{empty}</b>곳</li>}
        {hurt > 0 && <li className={s.prepBad}>부상 선수 <b className="num">{hurt}</b>명이 엔트리에 있어요</li>}
      </ul>
      <Button size="m" variant={warn ? 'primary' : 'secondary'} onClick={() => navigate('/lineup')}>라인업 {warn ? '고치기' : '확인'}</Button>
    </div>
  );
}

const rankHl = (h: DayHighlight) => (h.kind === 'nohit' ? 0 : h.kind === 'walkoff' ? 1 : h.kind === 'comeback' ? 2 : 3);
const HL_KO: Record<DayHighlight['kind'], string> = { walkoff: '끝내기', nohit: '노히트노런', comeback: '대역전', extra: '12회 혈투', blowout: '대승' };

function HighlightCard({ h }: { h: DayHighlight }) {
  const g: GameOut = h.game;
  const a = teamById(g.away), hm = teamById(g.home);
  const n = Math.max(9, g.line[0].length, g.line[1].length);
  const win = g.score[0] > g.score[1] ? a : g.score[1] > g.score[0] ? hm : null;
  return (
    <section className={s.hl} role="status" style={{ ['--tc' as string]: (win ?? hm).colors.primary }}>
      <p className={s.hlKind}>{HL_KO[h.kind]}</p>
      <p className={s.hlText}>{h.text}</p>
      <table className={s.hlLine}>
        <thead><tr><th />{Array.from({ length: n }, (_, i) => <th key={i} className="num">{i + 1}</th>)}<th className="num">R</th></tr></thead>
        <tbody>
          {[0, 1].map((side) => (
            <tr key={side}>
              <th><Emblem team={side === 0 ? a : hm} size={14} /> {(side === 0 ? a : hm).short}</th>
              {Array.from({ length: n }, (_, i) => <td key={i} className="num">{g.line[side][i] ?? (side === 1 && i < n ? 'X' : '')}</td>)}
              <td className={['num', s.hlR].join(' ')}>{g.score[side]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={s.hlSub}>{g.decision.win ? <>승 {playerById(g.decision.win)?.name ?? ''}</> : null}{g.decision.save ? <> · 세 {playerById(g.decision.save)?.name ?? ''}</> : null} · {longDate(g.date)}</p>
    </section>
  );
}

const KIND_TONE: Partial<Record<NewsRec['kind'], string>> = { 끝내기: 'hot', 노히트: 'hot', 역전: 'hot', 기록: 'rec', 부상: 'bad', 취소: 'rain', 시즌: 'hot' };
function NewsLine({ n }: { n: NewsRec }) {
  return (
    <li className={[s.nl, n.mine && s.nlMine, KIND_TONE[n.kind] && s['k-' + KIND_TONE[n.kind]]].filter(Boolean).join(' ')}>
      <span className={s.nlKind}>{n.kind}</span>
      <span className={s.nlText}>{n.text}</span>
      <span className={['num', s.nlDate].join(' ')}>{shortDate(n.date)}</span>
    </li>
  );
}
