// 순위 #/rank — 감독 순위(서버: 레이팅 · 승률 · 구단 전력) + 리그 순위(구단 10개, 이 기기의 시즌 진행 — season/store)
//   ?tab=league · ?by=winrate|power
//   감독 순위는 실제 가입한 감독만 나온다(AI 구단은 순위에 없다). 로그인해야 내 순위가 보인다.
import { useCallback, useEffect, useState } from 'react';
import type { ScreenProps } from '../../app/screen';
import { navigate, setQueryQuiet } from '../../app/router';
import { useAuth } from '../../app/auth';
import { Button, Emblem, Icon, Tabs, fmt } from '../../ui';
import { isTeamId, myTeam, teamById } from '../../game/mock';
import { gbLabel, pctLabel, standingsOf, useSeason } from '../../season/store';
import { ApiError, api, type RankingBy, type RankingsRes } from '../../api';
import { demoRankings } from './demo';
import s from './rank.module.css';

type Tab = 'mgr' | 'league';
const BY: { value: RankingBy; label: string; col: string }[] = [
  { value: 'rating', label: '레이팅', col: '레이팅' },
  { value: 'winrate', label: '승률', col: '승률' },
  { value: 'power', label: '구단 전력', col: '선수 점수 합' },
];
const clubTeam = (code: string) => (isTeamId(code) ? teamById(code) : teamById('dj'));
const showVal = (by: RankingBy, v: number) => (by === 'winrate' ? fmt.avg(v) : fmt.int(v));

type Load = { kind: 'idle' | 'loading' } | { kind: 'error'; msg: string } | { kind: 'ok'; data: RankingsRes };

export default function RankScreen({ query }: ScreenProps) {
  const [tab, setTabS] = useState<Tab>(query.get('tab') === 'league' ? 'league' : 'mgr');
  const b = query.get('by');
  const [by, setByS] = useState<RankingBy>(b === 'winrate' || b === 'power' ? b : 'rating');
  const setTab = (v: Tab) => { setTabS(v); setQueryQuiet({ tab: v === 'mgr' ? null : v }); };
  const setBy = (v: RankingBy) => { setByS(v); setQueryQuiet({ by: v === 'rating' ? null : v }); };
  return (
    <div className={s.screen}>
      <div className={s.tabsWrap}>
        <Tabs items={[{ value: 'mgr' as Tab, label: '감독 순위' }, { value: 'league' as Tab, label: '리그 순위' }]} value={tab} onChange={setTab} fill aria-label="순위 종류" />
      </div>
      {tab === 'mgr' ? <Managers by={by} setBy={setBy} demo={query.get('demo') === '1'} /> : <League />}
    </div>
  );
}

/* ───────── 감독 순위 (서버) ───────── */
function Managers({ by, setBy, demo }: { by: RankingBy; setBy: (v: RankingBy) => void; demo: boolean }) {
  const auth = useAuth();
  const status = demo ? 'in' : auth.status;
  const [load, setLoad] = useState<Load>({ kind: 'idle' });
  const fetchIt = useCallback(async (k: RankingBy) => {
    setLoad({ kind: 'loading' });
    try { setLoad({ kind: 'ok', data: await api.rankings(k) }); }
    catch (e) { setLoad({ kind: 'error', msg: e instanceof ApiError ? e.message : '문제가 생겼어요' }); }
  }, []);
  useEffect(() => {
    if (demo) { setLoad({ kind: 'ok', data: demoRankings(by) }); return; }
    if (status === 'in') void fetchIt(by);
  }, [status, by, fetchIt, demo]);

  const col = BY.find((x) => x.value === by)!.col;
  const data = load.kind === 'ok' && load.data.by === by ? load.data : null;
  const me = data?.me ?? null;
  const meInTop = !!data?.rows.some((r) => r.me);

  return (
    <section className={s.sec}>
      <header className={s.head}>
        <h2 className={['head', s.h].join(' ')}>감독 순위</h2>
        <p className={s.meta}>
          {data ? <>순위에 오른 감독 <span className="num">{fmt.int(data.total)}</span>명{me?.rank ? <> · 나 <b className="num">{me.rank}</b>위</> : null}</> : '실제 가입한 감독만 · 대전할 때마다 바로 반영'}
        </p>
      </header>
      <Tabs variant="box" size="s" items={BY.map((x) => ({ value: x.value, label: x.label }))} value={by} onChange={setBy} aria-label="정렬 기준" className={s.by} />

      {demo && <p className={s.demo}>예시 화면이에요 — 실제 순위가 아니에요.</p>}
      {status === 'out' && (
        <div className={s.empty}>
          <p><b>로그인하면 감독 순위가 보여요.</b> 대전 탭에 들어가면 내 구단도 자동으로 순위에 올라가요.</p>
          <Button size="s" variant="secondary" onClick={() => navigate('/login')}>로그인</Button>
        </div>
      )}
      {status !== 'out' && (load.kind === 'loading' || load.kind === 'idle' || (load.kind === 'ok' && !data)) && <p className={s.emptyLine}>순위를 불러오는 중이에요…</p>}
      {load.kind === 'error' && (
        <div className={s.empty}>
          <p><b>순위를 못 불러왔어요.</b> {load.msg}</p>
          <Button size="s" variant="secondary" onClick={() => void fetchIt(by)}>다시 불러오기</Button>
        </div>
      )}
      {data && data.rows.length === 0 && (
        <div className={s.empty}>
          <p>
            <b>{by === 'winrate' ? `아직 ${data.minGames}경기를 넘긴 감독이 없어요.` : '아직 순위에 오른 감독이 없어요.'}</b>{' '}
            {by === 'winrate' ? '대전을 더 하면 승률 순위가 열려요.' : '대전 탭에서 첫 경기를 해 보세요.'}
          </p>
          <Button size="s" variant="secondary" onClick={() => navigate('/pvp')}>대전하러 가기</Button>
        </div>
      )}

      {data && data.rows.length > 0 && (
        <table className={s.table}>
          <thead>
            <tr>
              <th className={s.cRank}>순위</th>
              <th>구단 · 감독</th>
              <th className={s.cR}>승-무-패</th>
              <th className={s.cR}>{col}</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((x) => {
              const tm = clubTeam(x.club);
              return (
                <tr key={x.userId} className={[x.me && s.me, x.rank <= 3 && s.top].filter(Boolean).join(' ') || undefined}>
                  <td className={['num', s.cRank, s.rk].join(' ')}>{x.rank}</td>
                  <td>
                    <span className={s.who}>
                      <Emblem team={tm} size={26} />
                      <span className={s.whoTxt}>
                        <b>{x.teamName}</b>
                        <small>{x.username}{x.me ? ' · 나' : ''}</small>
                      </span>
                    </span>
                  </td>
                  <td className={['num', s.cR, s.wdl].join(' ')}>{x.w}-{x.d}-{x.l}</td>
                  <td className={['num', s.cR, s.val].join(' ')}>{showVal(by, x.value)}</td>
                </tr>
              );
            })}
            {me && !meInTop && (
              <>
                <tr className={s.gap} aria-hidden><td colSpan={4}>⋮</td></tr>
                <tr className={s.me}>
                  <td className={['num', s.cRank, s.rk].join(' ')}>{me.rank ?? '—'}</td>
                  <td>
                    <span className={s.who}>
                      <Emblem team={clubTeam(me.club)} size={26} />
                      <span className={s.whoTxt}><b>{me.teamName}</b><small>{me.username} · 나</small></span>
                    </span>
                  </td>
                  <td className={['num', s.cR, s.wdl].join(' ')}>{me.w}-{me.d}-{me.l}</td>
                  <td className={['num', s.cR, s.val].join(' ')}>{showVal(by, me.value)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      )}
      {data && (
        <p className={s.note}>
          {by === 'rating' && '레이팅은 1,500에서 시작해요. 이기면 오르고, 강한 상대를 이길수록 더 올라요(수비로 진 판도 반영).'}
          {by === 'winrate' && <>승률 = 승 ÷ (승+패), 무승부는 빼요. {data.minGames}경기 이상 한 감독만{me && me.rank == null ? <> — 나는 <b className="num">{Math.max(0, data.minGames - (me.w + me.d + me.l))}</b>경기 더 하면 올라요</> : ''}.</>}
          {by === 'power' && '구단 전력 = 등록한 라인업 선수 점수 합이에요. 대전 탭에 들어갈 때 새로 올라가요.'}
          {!me && status === 'in' && ' 아직 내 구단이 없어요 — 대전 탭에 한 번 들어가면 등록돼요.'}
          {' '}상위 50명까지 보여요.
        </p>
      )}
    </section>
  );
}

/* ───────── 리그 순위 (구단 10개 · 이 기기의 시즌 진행 — 개막일엔 모두 0승 0무 0패) ───────── */
function League() {
  const mine = myTeam().id;
  const season = useSeason();
  const rows = standingsOf(season);
  const started = season.next > 0;
  return (
    <section className={s.sec}>
      <header className={s.head}>
        <h2 className={['head', s.h].join(' ')}><span className="num">{season.year ?? 2027}</span> 리그 순위</h2>
        <p className={s.meta}>{started ? '정규 시즌 · 10개 구단' : '개막 전 · 10개 구단'}</p>
      </header>
      <table className={[s.table, s.league].join(' ')}>
        <thead>
          <tr>
            <th className={s.cRank}>순위</th>
            <th>구단</th>
            <th className={s.cR}>승-무-패</th>
            <th className={s.cR}>승률</th>
            <th className={s.cR}>차</th>
            <th className={[s.cR, s.hideS].join(' ')}>연속</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const tm = teamById(r.teamId);
            return (
              <tr key={r.teamId} className={[r.teamId === mine && s.me, i === 5 && s.cut].filter(Boolean).join(' ') || undefined}>
                <td className={['num', s.cRank, s.rk].join(' ')}>{started ? r.rank : '—'}</td>
                <td>
                  <span className={s.who}>
                    <Emblem team={tm} size={24} />
                    <span className={s.whoTxt}><b>{tm.name}</b>{r.teamId === mine && <small>내 구단</small>}</span>
                  </span>
                </td>
                <td className={['num', s.cR, s.wdl].join(' ')}>{r.w}-{r.d}-{r.l}</td>
                <td className={['num', s.cR, s.val].join(' ')}>{pctLabel(r)}</td>
                <td className={['num', s.cR, s.gb].join(' ')}>{gbLabel(r)}</td>
                <td className={[s.cR, s.streak, s.hideS].join(' ')}>{r.streak}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className={s.note}><Icon name="info" size={13} /> 굵은 선 위 6위까지 가을야구. 지금 바로 경기 · 시즌 빨리 감기 결과가 그대로 반영돼요(이 기기).</p>
    </section>
  );
}
