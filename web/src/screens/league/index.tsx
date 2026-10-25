// 순위·리그 기록 #/league — 보기 세 개 (?view=team|player, 없으면 순위)
//   순위: 팀 순위(경기 · 승 · 무 · 패 · 승률 · 게임차 · 연속 · 최근10 · 홈 · 방문 · 득점 · 실점 · 득실, 표는 안에서만 가로로 · 구단 칸 고정)
//         · 순위 경쟁 그래프(screens/season/RankChart 그대로) · 포스트시즌 요약(#/season · 시상식 #/awards) · 개인 기록 TOP 10(타자 · 투수).
//         ?tab=bat|pit · ?cat=avg|hr|rbi|h|sb|ops|era|w|sv|hld|so|whip
//   팀 기록: 팀 타격 · 팀 투구 · 팀 간 승패 (records.tsx) — 구단을 누르면 그 팀 선수 기록
//   선수 기록: 리그 전체 타자 · 투수 시즌 기록, 구단 거르기 · 머리 칸 정렬 (records.tsx) — ?side=pit&team=dj&sort=hr
//   숫자는 시즌 저장(season/store)과 같은 값 — 선수 · 팀 줄은 season/awards seasonBook(OPS · WHIP 는 선수 화면과 같은 식).
//   비율 기록은 규정타석(소속 팀 경기 × 3.1) · 규정이닝(소속 팀 경기 × 1.0)을 채운 선수만.
import { useEffect, useMemo, useState } from 'react';
import type { ScreenProps } from '../../app/screen';
import { Link, setQueryQuiet, useLocation } from '../../app/router';
import { Button, Emblem, Icon, Sheet, Tabs } from '../../ui';
import { ME, teamById } from '../../game/mock';
import { showOvr } from '../../game/ovrShow';
import { allDays, gamesPlayed, gbLabel, isOver, pctLabel, standingsOf, useSeason, yearOf, type SeasonState } from '../../season/store';
import { leagueEnv } from '../../season/env';
import { tierName } from '../../game/sets';
import { avgOf, eraOf, obpOf, r2, r3, seasonBook, slgOf, whipOf, type TeamRow, type WDL } from '../../season/awards';
import { SERIES_ORDER, type SeriesRec } from '../../season/post';
import { RankChart } from '../season/RankChart';
import { SERIES_KO, ipText, useKeepSelected, useRosters } from '../games/shared';
import { rosterOf } from '../../season/rosters';
import { TeamLineup, cardsFromRoster } from '../pvp/TeamLineup';
import { PlayerRecords, TeamRecords, recOfQuery, recQuery, type RecState } from './records';
import s from './league.module.css';

type View = 'rank' | 'team' | 'player';
const viewOf = (v: string | null): View => (v === 'team' || v === 'player' ? v : 'rank');

export default function LeagueScreen({ query }: ScreenProps) {
  useRosters();
  const st = useSeason();
  const year = yearOf(st);
  const days = allDays(st);
  const played = Math.min(st.next, days.length);
  const dates = useMemo(() => days.slice(0, played).map((d) => d.date), [days, played]);
  // 보기 · 선수 기록 상태 — 주소에 조용히 남기고(setQueryQuiet), 링크로 주소가 바뀌면(같은 주소로 다시 와도) 따라간다
  const loc = useLocation();
  const [view, setViewS] = useState<View>(viewOf(query.get('view')));
  const [rec, setRecS] = useState<RecState>(() => recOfQuery(query));
  useEffect(() => { setViewS(viewOf(loc.query.get('view'))); setRecS(recOfQuery(loc.query)); }, [loc]);
  const setView = (v: View) => { setViewS(v); setQueryQuiet({ view: v === 'rank' ? null : v, ...(v === 'player' ? recQuery(rec) : { side: null, team: null, sort: null }) }); };
  const setRec = (r: RecState) => { setRecS(r); setQueryQuiet(recQuery(r)); };
  /** 구단 → 그 팀 선수 기록 */
  const openTeam = (teamId: string) => {
    const r: RecState = { side: 'bat', team: teamId, sort: null };
    setRecS(r); setViewS('player');
    setQueryQuiet({ view: 'player', ...recQuery(r) });
    window.scrollTo({ top: 0 });
  };
  return (
    <div className={s.screen}>
      <header className={s.head}>
        <h2 className={['head', s.h].join(' ')}><span className="num">{year}</span> 순위·리그 기록</h2>
        <p className={s.meta}>
          {/* 리그 환경(시즌마다 공인구 반발력 — season/env) */}
          <span className={s.envTag} title="시즌마다 공인구 반발력이 달라요 — 실제 KBO 범위 안에서">리그 환경 · {leagueEnv(st.seed).label}</span>{' '}
          {played === 0 ? '개막 전' : isOver(st) ? '정규 시즌 끝' : <><span className="num">{played}</span>/<span className="num">{days.length}</span>일</>}
        </p>
      </header>
      <div className={s.views}>
        <Tabs fill aria-label="보기" value={view} onChange={setView} items={[{ value: 'rank', label: '순위' }, { value: 'team', label: '팀 기록' }, { value: 'player', label: '선수 기록' }]} />
      </div>

      {view === 'rank' && (
        <>
          <Standings st={st} onTeamRecords={openTeam} />

          {played > 0 && (
            <section className={s.sec} aria-label="순위 경쟁">
              <h3 className={s.secH}>순위 경쟁</h3>
              <RankChart hist={st.rankHist} dates={dates} total={days.length} />
            </section>
          )}

          {st.post && <PostSummary st={st} />}

          <Leaders st={st} query={query} />
        </>
      )}
      {view === 'team' && <TeamRecords st={st} onTeam={openTeam} />}
      {view === 'player' && <PlayerRecords st={st} rec={rec} onRec={setRec} />}
    </div>
  );
}

/* ───────── 팀 순위 ───────── */
const last10Of = (s10: string) => {
  const w = [...s10].filter((c) => c === 'W').length, l = [...s10].filter((c) => c === 'L').length, d = s10.length - w - l;
  return s10.length ? `${w}승${d}무${l}패` : '-';
};
/** 승-무-패 */
const wdlText = (x: WDL | undefined) => (x ? `${x.w}-${x.d}-${x.l}` : '-');
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
function Standings({ st, onTeamRecords }: { st: SeasonState; onTeamRecords: (teamId: string) => void }) {
  const rows = standingsOf(st);
  const book = useMemo(() => seasonBook(st), [st]);
  const teamOf = (id: string): TeamRow | undefined => book.teams.find((t) => t.teamId === id);
  // 구단을 누르면 그 팀의 지금 선수단 카드 (AI 구단은 시즌 선수단, 내 구단은 내 라인업)
  const [peek, setPeek] = useState<string | null>(null);
  const peekRoster = useMemo(() => { if (!peek) return null; try { return rosterOf(peek); } catch { return null; } }, [peek]);
  const started = st.next > 0;
  const seeds = st.post?.seeds.length ?? 5;
  return (
    <section className={s.sec} aria-label="팀 순위">
      <h3 className={s.secH}>팀 순위</h3>
      <div className={s.tblWrap}>
        <table className={s.stand}>
          <thead>
            <tr>
              <th scope="col" className={[s.sticky, s.cRank].join(' ')}>순위</th>
              <th scope="col" className={[s.sticky, s.cClub].join(' ')}>구단</th>
              <th scope="col">경기</th>
              <th scope="col">승</th>
              <th scope="col">무</th>
              <th scope="col">패</th>
              <th scope="col">승률</th>
              <th scope="col">게임차</th>
              <th scope="col">연속</th>
              <th scope="col">최근10</th>
              <th scope="col" title="홈 승-무-패">홈</th>
              <th scope="col" title="방문 승-무-패">방문</th>
              <th scope="col">득점</th>
              <th scope="col">실점</th>
              <th scope="col">득실</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const t = teamById(r.teamId);
              const mine = r.teamId === ME.teamId;
              return (
                <tr key={r.teamId} className={[mine && s.me, i === seeds - 1 && s.cut].filter(Boolean).join(' ') || undefined}>
                  <td className={['num', s.sticky, s.cRank, s.rk].join(' ')}>{started ? r.rank : '—'}</td>
                  <th scope="row" className={[s.sticky, s.cClub].join(' ')}>
                    <button type="button" className={[s.club, s.clubBtn].join(' ')} onClick={() => setPeek(r.teamId)} aria-label={`${t.name} 라인업 보기`}><Emblem team={t} size={20} /><b>{t.short}</b></button>
                  </th>
                  <td className="num">{r.g}</td>
                  <td className="num">{r.w}</td>
                  <td className="num">{r.d}</td>
                  <td className="num">{r.l}</td>
                  <td className={['num', s.pct].join(' ')}>{pctLabel(r)}</td>
                  <td className="num">{gbLabel(r)}</td>
                  <td className={s.txt}>{r.streak}</td>
                  <td className={s.txt}>{last10Of(r.last10)}</td>
                  <td className="num">{wdlText(teamOf(r.teamId)?.home)}</td>
                  <td className="num">{wdlText(teamOf(r.teamId)?.away)}</td>
                  <td className="num">{r.rs}</td>
                  <td className="num">{r.ra}</td>
                  <td className={['num', r.rs - r.ra > 0 ? s.plus : r.rs - r.ra < 0 ? s.minus : ''].join(' ')}>{signed(r.rs - r.ra)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={s.hint}>굵은 선 위가 포스트시즌</p>
      <Sheet
        open={!!peek}
        onClose={() => setPeek(null)}
        title={peek ? teamById(peek).name : ''}
        sub={peekRoster ? <>팀 종합 <span className="num">{showOvr(peekRoster.ovr)}</span>{peekRoster.deck && <> · ’<span className="num">{String(peekRoster.deck.year % 100).padStart(2, '0')}</span> 시즌 선수단 · {tierName('teamYear', peekRoster.deck.tier)} 세트</>}</> : undefined}
        height="tall"
      >
        {peek && started && <PeekStat t={teamOf(peek)} onMore={() => { const id = peek; setPeek(null); onTeamRecords(id); }} />}
        {peekRoster ? <TeamLineup cards={cardsFromRoster(peekRoster)} onOpen={() => setPeek(null)} /> : peek ? <p className={s.peekNote}>선수단을 불러오지 못했어요</p> : null}
      </Sheet>
    </section>
  );
}

/** 구단 시트 위 — 이번 시즌 팀 기록 한 줄 + 선수 기록으로 */
function PeekStat({ t, onMore }: { t?: TeamRow; onMore: () => void }) {
  if (!t) return null;
  return (
    <div className={s.peekStat}>
      <dl>
        <div><dt>타율</dt><dd className="num">{t.bat.AB ? (avgOf(t.bat)).toFixed(3).replace(/^0/, '') : '-'}</dd></div>
        <div><dt>OPS</dt><dd className="num">{t.bat.PA ? (obpOf(t.bat) + slgOf(t.bat)).toFixed(3).replace(/^0/, '') : '-'}</dd></div>
        <div><dt>홈런</dt><dd className="num">{t.bat.HR}</dd></div>
        <div><dt>평균자책</dt><dd className="num">{t.pit.outs ? r2(eraOf(t.pit)) : '-'}</dd></div>
        <div><dt>WHIP</dt><dd className="num">{t.pit.outs ? r2(whipOf(t.pit)) : '-'}</dd></div>
      </dl>
      <Button size="s" variant="secondary" onClick={onMore}>선수 기록</Button>
    </div>
  );
}

/* ───────── 포스트시즌 요약 ───────── */
function PostSummary({ st }: { st: SeasonState }) {
  const p = st.post!;
  const champ = p.champion ? teamById(p.champion) : null;
  const list = SERIES_ORDER.map((id) => p.series.find((x) => x.id === id)).filter((x): x is SeriesRec => !!x);
  return (
    <section className={s.sec} aria-label="포스트시즌">
      <h3 className={s.secH}>
        포스트시즌
        {p.champion && <Link to="/awards" className={s.secLink}>시상식 <Icon name="chevron" size={13} /></Link>}
        <Link to="/season" className={[s.secLink, p.champion && s.secLink2].filter(Boolean).join(' ')}>포스트시즌 판 <Icon name="chevron" size={13} /></Link>
      </h3>
      {champ && (
        <p className={[s.champ, p.champion === ME.teamId && s.champMine].filter(Boolean).join(' ')}>
          <Emblem team={champ} size={24} />
          <span><small>한국시리즈 우승</small><b>{champ.name}</b></span>
        </p>
      )}
      <ul className={s.series}>
        {list.map((sr) => {
          const hi = teamById(sr.hi), lo = teamById(sr.lo);
          const mine = sr.hi === ME.teamId || sr.lo === ME.teamId;
          const side = (t: typeof hi, id: string, right: boolean) => (
            <span className={[s.srT, right && s.srR, sr.winner === id && s.srWin, sr.winner && sr.winner !== id && s.srLose].filter(Boolean).join(' ')}>
              <Emblem team={t} size={18} /><b>{t.short}</b>
            </span>
          );
          return (
            <li key={sr.id} className={mine ? s.srMine : undefined}>
              <p className={s.srTop}>
                <span className={s.srName}>{SERIES_KO[sr.id]}</span>
                <span className={s.srState}>{sr.winner ? `${teamById(sr.winner).short} ${sr.id === 'ks' ? '우승' : '진출'}` : '진행 중'}{sr.draws ? ` · 무 ${sr.draws}` : ''}</span>
              </p>
              <p className={s.srVs}>
                {side(hi, sr.hi, false)}
                <b className={['num', s.srW].join(' ')}>{sr.wins[0]}<i>:</i>{sr.wins[1]}</b>
                {side(lo, sr.lo, true)}
              </p>
            </li>
          );
        })}
      </ul>
      <p className={s.hint}>정규 시즌 {p.seeds.map((id, i) => `${i + 1}위 ${teamById(id).short}`).join(' · ')}</p>
    </section>
  );
}

/* ───────── 개인 기록 TOP 10 ───────── */
type Side = 'bat' | 'pit';
type Cat = 'avg' | 'hr' | 'rbi' | 'h' | 'sb' | 'ops' | 'era' | 'w' | 'sv' | 'hld' | 'so' | 'whip';
const CATS: Record<Side, { value: Cat; label: string; rate?: boolean }[]> = {
  bat: [{ value: 'avg', label: '타율', rate: true }, { value: 'hr', label: '홈런' }, { value: 'rbi', label: '타점' }, { value: 'h', label: '안타' }, { value: 'sb', label: '도루' }, { value: 'ops', label: 'OPS', rate: true }],
  pit: [{ value: 'era', label: '평균자책점', rate: true }, { value: 'w', label: '승' }, { value: 'sv', label: '세이브' }, { value: 'hld', label: '홀드' }, { value: 'so', label: '탈삼진' }, { value: 'whip', label: 'WHIP', rate: true }],
};
interface Entry { id: string; team: string; name: string; v: number; tie: number; shown: string; sub: string; rank: number }

/** 부문 TOP 10 — v 로 줄 세우고(같으면 둘째 기준), tie(그 부문 값)가 같으면 공동 순위. 선수 줄은 seasonBook(같은 사람 · 구단은 한 줄) */
function rankList(st: SeasonState, cat: Cat): Entry[] {
  const out: Omit<Entry, 'rank'>[] = [];
  const book = seasonBook(st);
  const put = (r: { id: string; team: string; name: string }, v: number, tie: number, shown: string, sub: string) => out.push({ id: r.id, team: r.team, name: r.name, v, tie, shown, sub });
  const asc = cat === 'era' || cat === 'whip';
  const avgL = (b: { AB: number; H: number }) => (b.AB ? r3(b.H / b.AB) : '-');
  const eraL = (p: { outs: number; ER: number }) => (p.outs ? r2(eraOf(p as Parameters<typeof eraOf>[0])) : '-');
  if (['avg', 'hr', 'rbi', 'h', 'sb', 'ops'].includes(cat)) {
    for (const r of book.bat) {
      const b = r.rec;
      if (cat === 'avg') { if (r.ok) put(r, avgOf(b), avgOf(b), avgL(b), `${b.AB}타수 ${b.H}안타`); }
      else if (cat === 'ops') {
        if (r.ok) { const obp = obpOf(b), slg = slgOf(b); put(r, obp + slg, obp + slg, r3(obp + slg), `출루 ${r3(obp)} · 장타 ${r3(slg)}`); }
      }
      else if (cat === 'hr' && b.HR > 0) put(r, b.HR * 1000 + b.RBI / 1000, b.HR, `${b.HR}`, `타점 ${b.RBI} · 타율 ${avgL(b)}`);
      else if (cat === 'rbi' && b.RBI > 0) put(r, b.RBI * 1000 + b.HR / 1000, b.RBI, `${b.RBI}`, `홈런 ${b.HR} · 타율 ${avgL(b)}`);
      else if (cat === 'h' && b.H > 0) put(r, b.H * 1000 - b.AB / 1000, b.H, `${b.H}`, `${b.AB}타수 · 타율 ${avgL(b)}`);
      else if (cat === 'sb' && b.SB > 0) put(r, b.SB * 1000 + b.H / 1000, b.SB, `${b.SB}`, `${b.G}경기 · 안타 ${b.H}`);
    }
  } else {
    for (const r of book.pit) {
      const p = r.rec;
      const ip = ipText(p.outs);
      if (cat === 'era') { if (r.ok) put(r, eraOf(p), eraOf(p), eraL(p), `${ip}이닝 · ${p.W}승 ${p.L}패`); }
      else if (cat === 'whip') { if (r.ok) { const v = whipOf(p); put(r, v, v, r2(v), `${ip}이닝 · 피안타 ${p.H} · 볼넷 ${p.BB}`); } }
      else if (cat === 'w' && p.W > 0) put(r, p.W * 1000 - p.L, p.W, `${p.W}`, `${p.W}승 ${p.L}패 · ${eraL(p)}`);
      else if (cat === 'sv' && p.SV > 0) put(r, p.SV * 1000 + p.G / 1000, p.SV, `${p.SV}`, `${p.G}경기 · ${eraL(p)}`);
      else if (cat === 'hld' && p.HLD > 0) put(r, p.HLD * 1000 + p.G / 1000, p.HLD, `${p.HLD}`, `${p.G}경기 · ${eraL(p)}`);
      else if (cat === 'so' && p.SO > 0) put(r, p.SO * 1000 + p.outs / 1000, p.SO, `${p.SO}`, `${ip}이닝`);
    }
  }
  out.sort((x, y) => (asc ? x.v - y.v : y.v - x.v) || x.id.localeCompare(y.id));
  const ranked: Entry[] = [];
  out.slice(0, 10).forEach((e, i) => {
    const prev = ranked[i - 1];
    ranked.push({ ...e, rank: prev && Math.abs(prev.tie - e.tie) < 1e-9 ? prev.rank : i + 1 });
  });
  return ranked;
}

function Leaders({ st, query }: { st: SeasonState; query: URLSearchParams }) {
  const t0 = query.get('tab') === 'pit' ? 'pit' : 'bat';
  const [side, setSideS] = useState<Side>(t0);
  const c0 = query.get('cat') as Cat | null;
  const [cat, setCatS] = useState<Cat>(c0 && CATS[t0].some((x) => x.value === c0) ? c0 : CATS[t0][0].value);
  const setSide = (v: Side) => { setSideS(v); setCatS(CATS[v][0].value); setQueryQuiet({ tab: v === 'bat' ? null : v, cat: null }); };
  const setCat = (v: Cat) => { setCatS(v); setQueryQuiet({ cat: v }); };
  // 같은 화면에서 주소만 바뀌어도(다른 곳의 링크) 따라간다
  useEffect(() => {
    setSideS(t0);
    setCatS(c0 && CATS[t0].some((x) => x.value === c0) ? c0 : CATS[t0][0].value);
  }, [t0, c0]);
  const catsRef = useKeepSelected(cat);
  const list = useMemo(() => rankList(st, cat), [st, cat]);
  const info = CATS[side].find((x) => x.value === cat)!;
  const myGames = gamesPlayed(ME.teamId, st);
  return (
    <section className={s.sec} aria-label="개인 기록">
      <h3 className={s.secH}>
        개인 기록 <small>TOP 10</small>
        <Tabs className={s.sideTabs} variant="box" size="s" aria-label="타자 · 투수" value={side} onChange={setSide} items={[{ value: 'bat', label: '타자' }, { value: 'pit', label: '투수' }]} />
      </h3>
      <div ref={catsRef} className={s.cats}>
        <Tabs size="s" aria-label="부문" value={cat} onChange={setCat} items={CATS[side].map((x) => ({ value: x.value, label: x.label }))} />
      </div>
      {info.rate && myGames > 0 && (
        <p className={s.rule} title={side === 'bat' ? '팀 경기 × 3.1' : '팀 경기 × 1.0'}>
          {side === 'bat'
            ? <>규정타석 <b className="num">{Math.ceil(myGames * 3.1)}</b></>
            : <>규정이닝 <b className="num">{myGames}</b></>}
        </p>
      )}
      {list.length ? (
        <ol className={s.leaders}>
          {list.map((e) => {
            const t = teamById(e.team);
            const mine = e.team === ME.teamId;
            return (
              <li key={e.id}>
                <Link to={`/player/${e.id}`} className={[s.ld, mine && s.ldMine, e.rank === 1 && s.ldTop].filter(Boolean).join(' ')}>
                  <span className={['num', s.ldRank].join(' ')}>{e.rank}</span>
                  <span className={s.ldWho}>
                    <b>{e.name}</b>
                    <small><Emblem team={t} size={13} decorative />{t.short}{mine ? ' · 우리' : ''}</small>
                  </span>
                  <span className={s.ldVal}>
                    <b className="num">{e.shown}</b>
                    <small>{e.sub}</small>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className={s.empty}>{st.next === 0 ? '아직 기록이 없어요' : info.rate ? `${side === 'bat' ? '규정타석' : '규정이닝'}을 채운 선수가 없어요` : '아직 기록이 없어요'}</p>
      )}
    </section>
  );
}
