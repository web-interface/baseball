// 시즌 일정 #/schedule — 월별 달력(우리 경기 · 상대 · 홈/원정 · 결과 · 시작 시각 · 날씨 · 휴식 · 취소, 다음 경기 날 강조)
// · 전체 일정(날짜별 목록, 우리 경기/모든 경기). 지난 경기를 누르면 박스스코어(#/games?g=), 남은 우리 경기는 경기 준비·진행(#/season).
//   ?view=list 전체 일정 · ?m=6 그 달(m=post 포스트시즌) · ?all=1 모든 경기
//   일정 = season/schedule(정규 144경기 · 월요일 · 올스타 휴식) + 비로 밀린 경기(시즌 끝 뒤) + 포스트시즌(season/post).
import { useEffect, useMemo, useState } from 'react';
import type { ScreenProps } from '../../app/screen';
import { Link, navigate, setQueryQuiet } from '../../app/router';
import { Emblem, Icon, Tabs, type IconName } from '../../ui';
import { ME, teamById } from '../../game/mock';
import { allDays, isOver, regularCount, teamLine, useSeason, yearOf, type SeasonState } from '../../season/store';
import { allstarBreak, longDate, openingDate, shortDate, startTime } from '../../season/schedule';
import { rainedOut, weatherOf } from '../../season/weather';
import { nextPostGame, type SeriesId } from '../../season/post';
import { boxKeyOf, postBoxKeyOf } from '../../season/box';
import { RES_KO, SERIES_KO, SERIES_SHORT, postGames, resOf, useKeepSelected, useRosters, type Res } from '../games/shared';
import s from './schedule.module.css';

type View = 'month' | 'list';

/* ───────── 하루 · 경기 모양 ───────── */
interface Game {
  key: string;
  away: string; home: string;
  /** 'played' 친 경기 · 'cancelled' 비 취소 · 'next' 다음에 칠 경기 · 'later' 그 뒤 */
  state: 'played' | 'cancelled' | 'next' | 'later';
  score?: [number, number];
  inn?: number;
  wo?: boolean;
  /** 남은 경기 날씨 — 비 예보(정규 시즌만) */
  rain?: boolean;
  post?: { series: SeriesId; no: number };
  mine: boolean;
}
interface Day { date: string; idx: number; games: Game[]; post?: SeriesId }

function buildDays(st: SeasonState): Day[] {
  const days = allDays(st);
  const reg = regularCount();
  const out: Day[] = days.map((d, idx) => {
    const done = idx < st.next;
    const recs = done ? st.results[idx] ?? [] : [];
    return {
      date: d.date, idx,
      games: d.games.map(([a, h]): Game => {
        const r = recs.find((x) => x.a === a && x.h === h);
        const mine = a === ME.teamId || h === ME.teamId;
        if (done && r) return { key: boxKeyOf(idx, a, h), away: a, home: h, state: r.c ? 'cancelled' : 'played', score: r.s, inn: r.inn, wo: !!r.wo, mine };
        return { key: boxKeyOf(idx, a, h), away: a, home: h, state: idx === st.next ? 'next' : 'later', rain: idx < reg && rainedOut(d.date, h, st.seed), mine };
      }),
    };
  });
  // 포스트시즌 — 친 경기 + 다음 경기(날짜가 정해진 것만)
  const post = st.post;
  if (post) {
    const add = (date: string, g: Game) => {
      let day = out.find((x) => x.date === date && x.idx < 0);
      if (!day) { day = { date, idx: -1, games: [], post: g.post?.series }; out.push(day); }
      day.games.push(g);
    };
    for (const at of postGames(post)) {
      const mine = at.rec.away === ME.teamId || at.rec.home === ME.teamId;
      add(at.rec.date, { key: postBoxKeyOf(at.n, at.rec.away, at.rec.home), away: at.rec.away, home: at.rec.home, state: 'played', score: at.rec.s, inn: at.rec.inn, post: { series: at.series, no: at.rec.no }, mine });
    }
    const nx = nextPostGame(post);
    if (nx) add(nx.date, { key: postBoxKeyOf(post.n, nx.away, nx.home), away: nx.away, home: nx.home, state: 'next', post: { series: nx.series.id, no: nx.no }, mine: nx.mine });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.idx - b.idx);
}

const myGameOfDay = (d: Day | undefined) => d?.games.find((g) => g.mine);
const myRes = (g: Game): Res | null => {
  if (!g.score || g.state !== 'played') return null;
  const home = g.home === ME.teamId;
  return resOf(home ? g.score[1] : g.score[0], home ? g.score[0] : g.score[1]);
};
const myScore = (g: Game) => {
  const home = g.home === ME.teamId;
  return g.score ? (home ? [g.score[1], g.score[0]] : [g.score[0], g.score[1]]) : [0, 0];
};
/** 남은 경기 날씨 아이콘 — 비 예보 · 돔 · 낮/밤 경기 */
function wxOf(date: string, home: string, rain?: boolean): { icon: IconName; ko: string } {
  if (rain) return { icon: 'rain', ko: '비 예보' };
  if (teamById(home).stadium.roof === 'dome') return { icon: 'stadium', ko: '돔' };
  return Number(startTime(date).slice(0, 2)) >= 18 ? { icon: 'moon', ko: '저녁 경기' } : { icon: 'sun', ko: '낮 경기' };
}
/** 지난 경기는 박스스코어로, 남은 우리 경기는 경기 준비·진행으로 */
const hrefOf = (g: Game) => (g.state === 'played' ? `/games?g=${g.key}` : g.mine && g.state !== 'cancelled' ? '/season' : null);

const pad = (n: number) => String(n).padStart(2, '0');

export default function ScheduleScreen({ query }: ScreenProps) {
  useRosters();
  const st = useSeason();
  const days = useMemo(() => buildDays(st), [st]);
  const year = yearOf(st);
  const byDate = useMemo(() => {
    const m = new Map<string, Day[]>();
    for (const d of days) m.set(d.date, [...(m.get(d.date) ?? []), d]);
    return m;
  }, [days]);
  // 오늘 = 다음에 칠 날 (정규가 끝났으면 다음 포스트시즌 경기 날)
  const nextDay = days.find((d) => d.games.some((g) => g.state === 'next'));
  const today = nextDay?.date ?? null;
  const hasPost = !!st.post;
  // 달 — 3월 ~ 10월 (+ 포스트시즌)
  const last = days[days.length - 1]?.date ?? `${year}-09-30`;
  const lastMonth = Math.max(10, Number(last.slice(5, 7)));
  const months = Array.from({ length: lastMonth - 2 }, (_, i) => i + 3);
  const qm = query.get('m');
  const defMonth = today ? String(Number(today.slice(5, 7))) : isOver(st) && hasPost ? 'post' : String(Number(last.slice(5, 7)));
  const [month, setMonthS] = useState<string>(qm && (qm === 'post' ? hasPost : months.includes(Number(qm))) ? qm : defMonth);
  const [view, setViewS] = useState<View>(query.get('view') === 'list' ? 'list' : 'month');
  const [all, setAllS] = useState(query.get('all') === '1');
  const setMonth = (v: string) => { setMonthS(v); setQueryQuiet({ m: v }); };
  const setView = (v: View) => { setViewS(v); setQueryQuiet({ view: v === 'list' ? 'list' : null }); };
  const setAll = (v: boolean) => { setAllS(v); setQueryQuiet({ all: v ? '1' : null }); };
  // 같은 화면에서 주소만 바뀌어도(다른 곳의 링크) 따라간다
  const qView = query.get('view'), qAll = query.get('all');
  useEffect(() => { setViewS(qView === 'list' ? 'list' : 'month'); }, [qView]);
  useEffect(() => { setAllS(qAll === '1'); }, [qAll]);
  useEffect(() => { if (qm && (qm === 'post' ? hasPost : months.includes(Number(qm)))) setMonthS(qm); }, [qm]); // eslint-disable-line react-hooks/exhaustive-deps

  const ln = teamLine(ME.teamId, st);
  const reg = days.filter((d) => d.idx >= 0);
  const m = month === 'post' && !hasPost ? defMonth : month;
  const stripRef = useKeepSelected(m);

  return (
    <div className={s.screen}>
      <header className={s.head}>
        <div className={s.headTop}>
          <h2 className={['head', s.h].join(' ')}><span className="num">{year}</span> 시즌 일정</h2>
          <Tabs variant="box" size="s" aria-label="보기" value={view} onChange={setView} items={[{ value: 'month', label: '월별' }, { value: 'list', label: '전체 일정' }]} />
        </div>
        <p className={s.meta}>
          <span>정규 <span className="num">{regularCount()}</span>경기 · <span className="num">{shortDate(openingDate(year))}</span> 개막 ~ <span className="num">{shortDate(reg[reg.length - 1]?.date ?? last)}</span></span>
          <span>우리 <b className="num">{ln.played}</b>경기 치름 · <span className="num">{ln.left}</span>경기 남음</span>
        </p>
      </header>

      <div ref={stripRef} className={s.months}>
        <Tabs size="s" aria-label="달" value={m} onChange={setMonth}
          items={[...months.map((x) => ({ value: String(x), label: `${x}월` })), ...(hasPost ? [{ value: 'post', label: '포스트시즌' }] : [])]} />
      </div>

      {m === 'post' ? (
        <PostList days={days.filter((d) => d.idx < 0)} />
      ) : view === 'month' ? (
        <Calendar year={year} month={Number(m)} byDate={byDate} today={today} />
      ) : (
        <>
          <div className={s.listBar}>
            <Tabs variant="box" size="s" aria-label="경기" value={all ? 'all' : 'mine'} onChange={(v) => setAll(v === 'all')} items={[{ value: 'mine', label: '우리 경기' }, { value: 'all', label: '모든 경기' }]} />
          </div>
          <DayList days={days.filter((d) => Number(d.date.slice(5, 7)) === Number(m))} all={all} today={today} seed={st.seed} />
        </>
      )}
    </div>
  );
}

/* ───────── 월별 달력 ───────── */
function Calendar({ year, month, byDate, today }: { year: number; month: number; byDate: Map<string, Day[]>; today: string | null }) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const lead = first.getUTCDay();
  const len = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: len }, (_, i) => `${year}-${pad(month)}-${pad(i + 1)}`)];
  while (cells.length % 7) cells.push(null);
  const br = allstarBreak(year);
  // 시즌 기간 — 개막일 ~ 마지막 경기 날 (그 사이 경기 없는 날 = 휴식)
  const dates = [...byDate.keys()].sort();
  const from = dates[0] ?? openingDate(year), to = dates[dates.length - 1] ?? from;
  // 이 달 우리 성적
  let w = 0, d = 0, l = 0, left = 0, games = 0, rained = 0;
  for (const c of cells) {
    if (!c) continue;
    for (const day of byDate.get(c) ?? []) {
      const g = myGameOfDay(day);
      if (!g) continue;
      games++;
      const r = myRes(g);
      if (r === 'W') w++; else if (r === 'L') l++; else if (r === 'D') d++;
      else if (g.state === 'cancelled') rained++;
      else if (g.state === 'next' || g.state === 'later') left++;
    }
  }
  return (
    <section className={s.cal} aria-label={`${month}월 달력`}>
      <p className={s.calSum}>
        <b><span className="num">{month}</span>월</b>
        {games ? <>
          <span>우리 <span className="num">{games}</span>경기</span>
          {w + d + l > 0 && <span><span className="num">{w}</span>승 <span className="num">{d}</span>무 <span className="num">{l}</span>패</span>}
          {rained > 0 && <span>취소 <span className="num">{rained}</span></span>}
          {left > 0 && <span>남은 <span className="num">{left}</span>경기</span>}
        </> : <span>경기 없음</span>}
      </p>
      <div className={s.grid} role="grid">
        <div className={s.wk} role="row">
          {'일월화수목금토'.split('').map((x, i) => <span key={x} role="columnheader" className={i === 0 ? s.sun : i === 6 ? s.sat : undefined}>{x}</span>)}
        </div>
        {Array.from({ length: cells.length / 7 }, (_, r) => (
          <div key={r} className={s.week} role="row">
            {cells.slice(r * 7, r * 7 + 7).map((c, i) => <CalCell key={c ?? `e${r}-${i}`} date={c} dow={i} days={c ? byDate.get(c) : undefined} today={today} inSeason={!!c && c >= from && c <= to} allstar={!!c && c >= br[0] && c <= br[1]} />)}
          </div>
        ))}
      </div>
      <p className={s.legend}>
        <span><i className={s.lgToday} />다음 경기</span>
        <span><Icon name="moon" size={11} />저녁</span>
        <span><Icon name="sun" size={11} />낮</span>
        <span><Icon name="rain" size={11} />비 예보</span>
        <span><Icon name="stadium" size={11} />돔</span>
      </p>
    </section>
  );
}

function CalCell({ date, dow, days, today, inSeason, allstar }: { date: string | null; dow: number; days?: Day[]; today: string | null; inSeason: boolean; allstar: boolean }) {
  if (!date) return <div className={[s.cell, s.blank].join(' ')} role="gridcell" />;
  const dn = Number(date.slice(8, 10));
  const day = days?.find((x) => myGameOfDay(x)) ?? days?.[0];
  const g = myGameOfDay(day);
  const isToday = date === today;
  const dateEl = <span className={[s.cDate, dow === 0 && s.sun, dow === 6 && s.sat].filter(Boolean).join(' ')}>{dn}</span>;
  // 우리 경기 없는 날 — 휴식 · 올스타 · (포스트시즌 다른 구단 경기) · 시즌 밖
  if (!g) {
    const pg = day?.games[0];
    if (pg?.post) {
      const href = hrefOf(pg);
      const inner = <>{dateEl}<span className={s.cOther}>{SERIES_SHORT[pg.post.series]}</span><span className={s.cOtherSub}>{pg.state === 'played' && pg.score ? <span className="num">{pg.score[0]}:{pg.score[1]}</span> : '다른 구단'}</span></>;
      return href ? <Link to={href} className={[s.cell, s.other, isToday && s.today].filter(Boolean).join(' ')} role="gridcell">{inner}</Link>
        : <div className={[s.cell, s.other, isToday && s.today].filter(Boolean).join(' ')} role="gridcell">{inner}</div>;
    }
    return (
      <div className={[s.cell, !inSeason && s.outside].filter(Boolean).join(' ')} role="gridcell">
        {dateEl}
        {inSeason && <span className={s.cOff}>{allstar ? '올스타' : '휴식'}</span>}
      </div>
    );
  }
  const homeGame = g.home === ME.teamId;
  const opp = teamById(homeGame ? g.away : g.home);
  const res = myRes(g);
  const [my, their] = myScore(g);
  const wx = g.state === 'next' || g.state === 'later' ? wxOf(date, g.home, g.rain) : null;
  const tag = g.post ? SERIES_SHORT[g.post.series] : homeGame ? '홈' : '원정';
  const label = `${Number(date.slice(5, 7))}월 ${dn}일 ${opp.short}전 ${homeGame ? '홈' : '원정'} — ${res ? `${RES_KO[res]} ${my}대${their}` : g.state === 'cancelled' ? '비로 취소' : `${startTime(date)} ${wx?.ko ?? ''}`}`;
  const inner = (
    <>
      {dateEl}
      <span className={[s.cTag, homeGame && s.cHome, g.post && s.cPost].filter(Boolean).join(' ')}>{tag}</span>
      <span className={s.cOpp}>
        <Emblem team={opp} size={20} decorative />
        <small>{opp.short}</small>
      </span>
      {res ? (
        <span className={[s.cRes, s['r' + res]].join(' ')}><em>{RES_KO[res]}</em><b className="num">{my}:{their}</b></span>
      ) : g.state === 'cancelled' ? (
        <span className={[s.cRes, s.cCancel].join(' ')}><Icon name="rain" size={10} />취소</span>
      ) : (
        <span className={[s.cRes, s.cUp].join(' ')}><b className="num">{startTime(date)}</b>{wx && <Icon name={wx.icon} size={10} className={wx.icon === 'rain' ? s.wxRain : undefined} />}</span>
      )}
    </>
  );
  const href = hrefOf(g);
  const cls = [s.cell, s.game, res && s['g' + res], g.state === 'cancelled' && s.gC, isToday && s.today].filter(Boolean).join(' ');
  return href
    ? <Link to={href} className={cls} role="gridcell" aria-label={label} title={label}>{inner}</Link>
    : <div className={cls} role="gridcell" aria-label={label} title={label}>{inner}</div>;
}

/* ───────── 전체 일정 (날짜별 목록) ───────── */
function DayList({ days, all, today, seed }: { days: Day[]; all: boolean; today: string | null; seed: string }) {
  const shown = days.filter((d) => (all ? d.games.length > 0 : !!myGameOfDay(d)));
  if (!shown.length) return <p className={s.empty}>이 달에는 {all ? '경기가' : '우리 경기가'} 없어요.</p>;
  return (
    <div className={s.dlist}>
      {shown.map((d) => {
        const isToday = d.date === today;
        const games = all ? d.games.slice().sort((a, b) => Number(b.mine) - Number(a.mine)) : [myGameOfDay(d)!];
        return (
          <section key={`${d.date}-${d.idx}`} className={[s.dsec, isToday && s.dToday].filter(Boolean).join(' ')} aria-label={longDate(d.date)}>
            <p className={s.dH}>
              <b>{longDate(d.date)}</b>
              {isToday && <em className={s.todayTag}>다음 경기</em>}
              {d.post && <small>{SERIES_KO[d.post]}</small>}
              {!d.post && d.idx >= regularCount() && <small>밀린 경기</small>}
            </p>
            <ul>
              {games.map((g) => all ? <AllLine key={g.key} g={g} date={d.date} /> : <MineLine key={g.key} g={g} date={d.date} seed={seed} />)}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function MineLine({ g, date, seed }: { g: Game; date: string; seed: string }) {
  const homeGame = g.home === ME.teamId;
  const opp = teamById(homeGame ? g.away : g.home);
  const res = myRes(g);
  const [my, their] = myScore(g);
  const venue = teamById(g.home).stadium.name;
  const wx = g.state === 'next' || g.state === 'later' ? wxOf(date, g.home, g.rain) : null;
  const tC = wx && !g.rain && wx.icon !== 'stadium' ? weatherOf(date, g.home, seed).tC : null;
  const href = hrefOf(g);
  const body = (
    <>
      <span className={s.lWhen}>
        {res ? <span className={[s.lRes, s['r' + res]].join(' ')}><em>{RES_KO[res]}</em><b className="num">{my}:{their}</b></span>
          : g.state === 'cancelled' ? <span className={s.lCancel}>취소</span>
          : <b className="num">{startTime(date)}</b>}
      </span>
      <span className={s.lOpp}>
        <Emblem team={opp} size={22} />
        <span className={s.lOppTxt}>
          <b>{homeGame ? 'vs' : '@'} {opp.short}</b>
          <small>{g.post ? <>{SERIES_SHORT[g.post.series]} <span className="num">{g.post.no}</span>차전 · </> : null}{homeGame ? '홈' : '원정'} · {venue}</small>
        </span>
      </span>
      <span className={s.lSide}>
        {wx ? <span className={[s.lWx, g.rain && s.wxRain].filter(Boolean).join(' ')}><Icon name={wx.icon} size={13} />{g.rain ? '비 예보' : tC != null ? <span className="num">{tC}°</span> : wx.ko}</span>
          : g.state === 'played' && g.inn && g.inn > 9 ? <span className={s.lNote}><span className="num">{g.inn}</span>회</span>
          : g.wo ? <span className={s.lNote}>끝내기</span> : null}
        {href && <Icon name="chevron" size={14} className={s.lGo} />}
      </span>
    </>
  );
  return <li>{href ? <Link to={href} className={s.mline}>{body}</Link> : <div className={s.mline}>{body}</div>}</li>;
}

function AllLine({ g, date }: { g: Game; date: string }) {
  const a = teamById(g.away), h = teamById(g.home);
  const win = g.score && g.state === 'played' ? (g.score[0] > g.score[1] ? 0 : g.score[1] > g.score[0] ? 1 : -1) : -2;
  const href = g.state === 'played' ? `/games?g=${g.key}` : g.mine && g.state !== 'cancelled' ? '/season' : null;
  const body = (
    <>
      <span className={[s.aT, s.aAway, win === 0 && s.aWin].filter(Boolean).join(' ')}><b>{a.short}</b><Emblem team={a} size={18} /></span>
      <span className={s.aMid}>
        {g.state === 'played' && g.score ? <><b className={['num', win === 0 && s.aWinN].filter(Boolean).join(' ')}>{g.score[0]}</b><i>:</i><b className={['num', win === 1 && s.aWinN].filter(Boolean).join(' ')}>{g.score[1]}</b></>
          : g.state === 'cancelled' ? <em className={s.lCancel}>취소</em>
          : <span className={['num', s.aTime].join(' ')}>{startTime(date)}</span>}
      </span>
      <span className={[s.aT, win === 1 && s.aWin].filter(Boolean).join(' ')}><Emblem team={h} size={18} /><b>{h.short}</b></span>
      <span className={s.aEnd}>{g.rain && g.state !== 'played' ? <Icon name="rain" size={12} className={s.wxRain} /> : g.post ? <><span className="num">{g.post.no}</span>차전</> : g.inn && g.inn > 9 ? <><span className="num">{g.inn}</span>회</> : ''}</span>
    </>
  );
  return (
    <li className={g.mine ? s.aMine : undefined}>
      {href ? <Link to={href} className={s.aline} aria-label={`${a.short} 대 ${h.short}`}>{body}</Link> : <div className={s.aline}>{body}</div>}
    </li>
  );
}

/* ───────── 포스트시즌 ───────── */
function PostList({ days }: { days: Day[] }) {
  if (!days.length) return <p className={s.empty}>포스트시즌 경기가 아직 없어요.</p>;
  return (
    <div className={s.dlist}>
      {days.map((d) => (
        <section key={d.date} className={s.dsec} aria-label={longDate(d.date)}>
          <p className={s.dH}><b>{longDate(d.date)}</b>{d.post && <small>{SERIES_KO[d.post]}</small>}</p>
          <ul>{d.games.map((g) => <AllLine key={g.key} g={g} date={d.date} />)}</ul>
        </section>
      ))}
      <button type="button" className={s.toHub} onClick={() => navigate('/season')}>포스트시즌 판 · 다음 경기 <Icon name="chevron" size={14} /></button>
    </div>
  );
}
