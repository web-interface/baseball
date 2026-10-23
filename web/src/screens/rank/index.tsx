// 순위 #/rank — 감독 순위(서버: 레이팅 · 승률 · 구단 전력). 구단 10개 리그 순위는 경기 운영 > 순위·리그 기록(#/league)으로 옮겼다.
//   ?by=winrate|power  (예전 주소 ?tab=league 는 #/league 로 넘긴다)
//   감독 순위는 실제 가입한 감독만 나온다(AI 구단은 순위에 없다). 로그인해야 내 순위가 보인다.
import { useCallback, useEffect, useState } from 'react';
import type { ScreenProps } from '../../app/screen';
import { Link, navigate, setQueryQuiet } from '../../app/router';
import { useAuth } from '../../app/auth';
import { Button, Emblem, Icon, Tabs, fmt } from '../../ui';
import { isTeamId, myTeam, teamById } from '../../game/mock';
import { rankLabel, teamLine, useSeason } from '../../season/store';
import { ApiError, api, type RankingBy, type RankingsRes } from '../../api';
import { demoRankings } from './demo';
import s from './rank.module.css';

const BY: { value: RankingBy; label: string; col: string }[] = [
  { value: 'rating', label: '레이팅', col: '레이팅' },
  { value: 'winrate', label: '승률', col: '승률' },
  { value: 'power', label: '구단 전력', col: '선수 점수 합' },
];
const clubTeam = (code: string) => (isTeamId(code) ? teamById(code) : teamById('dj'));
const showVal = (by: RankingBy, v: number) => (by === 'winrate' ? fmt.avg(v) : fmt.int(v));

type Load = { kind: 'idle' | 'loading' } | { kind: 'error'; msg: string } | { kind: 'ok'; data: RankingsRes };

export default function RankScreen({ query }: ScreenProps) {
  const toLeague = query.get('tab') === 'league';
  // 예전 주소(리그 순위 탭) — 순위·리그 기록으로
  useEffect(() => { if (toLeague) navigate('/league', { replace: true }); }, [toLeague]);
  const b = query.get('by');
  const [by, setByS] = useState<RankingBy>(b === 'winrate' || b === 'power' ? b : 'rating');
  const setBy = (v: RankingBy) => { setByS(v); setQueryQuiet({ by: v === 'rating' ? null : v }); };
  if (toLeague) return null;
  return (
    <div className={s.screen}>
      <Managers by={by} setBy={setBy} demo={query.get('demo') === '1'} />
      <LeagueLink />
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

/* ───────── 구단 순위는 순위·리그 기록(#/league)에 — 여기서는 한 줄로 이어 준다 ───────── */
function LeagueLink() {
  const season = useSeason();
  const ln = teamLine(myTeam().id, season);
  return (
    <section className={s.sec}>
      <Link to="/league" className={s.leagueLink}>
        <span className={s.llText}>
          <b>구단 순위 · 개인 기록</b>
          <small><span className="num">{season.year ?? 2027}</span> 시즌 · 우리 구단 {rankLabel(ln)} · 순위·리그 기록에서 봐요</small>
        </span>
        <Icon name="chevron" size={16} />
      </Link>
    </section>
  );
}
