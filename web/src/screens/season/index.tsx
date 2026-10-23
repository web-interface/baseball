// 시즌 빨리 감기 #/season — 남은 정규 시즌을 한 번에. 속도 1·2·4배 · 끝까지, 날짜 막대, 순위 경쟁 그래프, 소식 띠,
// 하이라이트 경기(끝내기 · 노히트 · 대역전)에서 잠깐 멈춰 보여 주고 계속. 끝나면 최종 순위와 개인 기록 1위.
// 경기는 모두 공용 엔진으로 하루씩 계산(한 날 = 다섯 경기, 날마다 쉬어 가며 — 휴대폰에서 끊기지 않게). 기록은 이 기기에.
//   ?go=1 바로 시작 · ?speed=1|2|4|end
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ScreenProps } from '../../app/screen';
import { navigate } from '../../app/router';
import { Button, Emblem, Icon, Tabs, useToast } from '../../ui';
import { ME, playerById, teamById } from '../../game/mock';
import { longDate, openingDate, shortDate } from '../../season/schedule';
import { allDays, gbLabel, isOver, leaders, pctLabel, rankLabel, standingsOf, teamLine, useSeason, yearOf, type DayHighlight, type NewsRec } from '../../season/store';
import { LeaguePanel, useStartNextSeason } from './LeaguePanel';
import { PostPanel } from './PostPanel';
import { playNextDay } from '../../season/run';
import { LEVEL_KO, aiLevel, ensureClubRosters } from '../../season/rosters';
import type { GameOut } from '../../season/sim';
import { RankChart } from './RankChart';
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

  // 순위 경쟁 — 친 날마다 한 칸 (개막 전엔 비어 있음)
  const dates = useMemo(() => days.slice(0, st.next).map((d) => d.date), [days, st.next]);
  const me = teamById(ME.teamId);
  const ln = teamLine(ME.teamId, st);
  const rec = ln.row;
  const cur = days[Math.min(st.next, days.length - 1)];
  const doneN = st.next, totalN = days.length;
  const news = st.news.slice(-40).reverse();

  return (
    <div className={s.screen}>
      <header className={s.top}>
        <p className={s.kicker}><span className="num">{yearOf(st)}</span> 정규 시즌 · AI 상대 {LEVEL_KO[aiLevel()]}</p>
        <h2 className={['head', s.title].join(' ')}>{over ? '정규 시즌 끝' : '남은 시즌 빨리 감기'}</h2>
        <div className={s.meRow}>
          <Emblem team={me} size={34} />
          <p className={s.meMain}>
            <b>{me.short} <span className="num">{rec.w}</span>승 <span className="num">{rec.d}</span>무 <span className="num">{rec.l}</span>패</b>
            <small>{rankLabel(ln)} · <span className="num">{ln.played}</span>경기 · 최근 {ln.form.split('').reverse().map((c) => (c === 'W' ? '승' : c === 'L' ? '패' : '무')).join('') || '—'}</small>
          </p>
          <span className={['num-display', s.rankBig].join(' ')}>{ln.started ? <>{ln.rank}<i>위</i></> : <>—<i>개막 전</i></>}</span>
        </div>
      </header>

      {/* 날짜 막대 */}
      <section className={s.prog} aria-label="진행">
        <div className={s.progTop}>
          <b>{over ? '모든 경기 끝' : cur ? longDate(cur.date) : ''}</b>
          <span className="num">{doneN}/{totalN}일 {busy && <i className={s.busy}>계산 중</i>}</span>
        </div>
        <div className={s.bar} role="progressbar" aria-valuemin={0} aria-valuemax={totalN} aria-valuenow={doneN} aria-label="시즌 진행">
          <i style={{ width: `${(doneN / Math.max(1, totalN)) * 100}%` }} />
        </div>
        <div className={s.progEnds}><span>{shortDate(days[0]?.date ?? openingDate())} 개막</span><span>{shortDate(days[days.length - 1]?.date ?? openingDate())}</span></div>
      </section>

      {/* 포스트시즌 (정규 시즌이 끝나면 — KBO 방식) */}
      <PostPanel />
      {/* 리그 단계 (AI 상대 난이도 — 자동) · 포스트시즌까지 끝났으면 다음 해 시작 */}
      <LeaguePanel />

      {/* 조작 */}
      {!over && (
        <section className={s.ctrl}>
          <Tabs variant="box" size="s" fill aria-label="속도" value={speed} onChange={setSpeed}
            items={[{ value: '1', label: '1배' }, { value: '2', label: '2배' }, { value: '4', label: '4배' }, { value: 'end', label: '끝까지' }]} />
          <div className={s.ctrlBtns}>
            {running
              ? <Button size="l" block variant="secondary" icon="pause" onClick={stop}>멈춤</Button>
              : <Button size="l" block icon="play" onClick={() => void loop()}>{doneN === 0 ? '시작' : '이어서'}</Button>}
            <Button size="l" variant="ghost" onClick={() => navigate('/match?g=season')} disabled={running}>내 경기 직접 보기</Button>
          </div>
        </section>
      )}

      {/* 하이라이트 */}
      {hl && <HighlightCard h={hl} />}

      {/* 소식 띠 */}
      <section className={s.news} aria-label="소식" aria-live="polite">
        <p className={s.secH}>소식</p>
        {news.length ? (
          <ul>
            {news.slice(0, 6).map((n, i) => <NewsLine key={`${n.idx}-${i}-${n.text}`} n={n} />)}
          </ul>
        ) : <p className={s.empty}>시작하면 연승 · 기록 · 부상 · 비 취소 소식이 여기 흘러요.</p>}
      </section>

      {/* 순위 경쟁 */}
      <section className={s.sec} aria-label="순위 경쟁">
        <p className={s.secH}>순위 경쟁 <small>{shortDate(days[0]?.date ?? openingDate())} 개막부터</small></p>
        <RankChart hist={st.rankHist} dates={dates} total={totalN} />
      </section>

      {/* 지금 순위 / 최종 순위 */}
      <Standings final={over} />

      {over && <Leaders />}
      {over && (
        <section className={s.sec}>
          <div className={s.endBtns}>
            {st.post?.champion
              ? <Button size="l" block icon="play" onClick={startNext}><span className="num">{yearOf(st) + 1}</span> 시즌 시작</Button>
              : <Button size="l" block variant="secondary" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>위로 — 포스트시즌</Button>}
            <Button variant="ghost" onClick={() => navigate('/home')}>홈으로</Button>
          </div>
        </section>
      )}
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

function Standings({ final }: { final: boolean }) {
  const st = useSeason();
  const rows = standingsOf(st);
  const started = st.next > 0;
  return (
    <section className={s.sec} aria-label={final ? '최종 순위' : '지금 순위'}>
      <p className={s.secH}>{final ? '최종 순위' : '지금 순위'} <small>6위까지 가을야구</small></p>
      <table className={s.tbl}>
        <thead><tr><th className={s.cR}>순위</th><th>구단</th><th className={s.cR}>승-무-패</th><th className={s.cR}>승률</th><th className={s.cR}>차</th><th className={[s.cR, s.hideS].join(' ')}>최근</th></tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const t = teamById(r.teamId);
            return (
              <tr key={r.teamId} className={[r.teamId === ME.teamId && s.mine, i === 5 && s.cut].filter(Boolean).join(' ') || undefined}>
                <td className={['num', s.cR, s.rk].join(' ')}>{started ? r.rank : '—'}</td>
                <td><span className={s.who}><Emblem team={t} size={20} /><b>{t.short}</b></span></td>
                <td className={['num', s.cR].join(' ')}>{r.w}-{r.d}-{r.l}</td>
                <td className={['num', s.cR, s.pct].join(' ')}>{pctLabel(r)}</td>
                <td className={['num', s.cR].join(' ')}>{gbLabel(r)}</td>
                <td className={[s.cR, s.hideS, s.streak].join(' ')}>{r.streak}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function Leaders() {
  const st = useSeason();
  // AI 구단 가상 선수 이름 — 화면을 다시 열었을 때도 찾게 선수단을 먼저 만든다
  const list = useMemo(() => { ensureClubRosters(); return leaders(st); }, [st]);
  return (
    <section className={s.sec} aria-label="개인 기록 1위">
      <p className={s.secH}>개인 기록 1위 <small>개막부터 친 경기</small></p>
      <ul className={s.leaders}>
        {list.map((l) => {
          const p = playerById(l.id);
          const t = teamById(l.team);
          return (
            <li key={l.key} className={l.team === ME.teamId ? s.mine : undefined}>
              <span className={s.ldLabel}>{l.label}</span>
              <span className={s.ldWho}><Emblem team={t} size={16} /><b>{p?.name ?? '선수'}</b><small>{t.short}</small></span>
              <span className={['num-display', s.ldVal].join(' ')}>{l.value}</span>
              <small className={s.ldSub}>{l.sub}</small>
            </li>
          );
        })}
      </ul>
      {!list.length && <p className={s.empty}><Icon name="info" size={13} /> 아직 기록이 없어요.</p>}
    </section>
  );
}
