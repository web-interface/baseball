// 순위 #/rank — 감독 순위(서버: 레이팅 · 승률 · 구단 전력). 구단 10개 리그 순위는 경기 운영 > 순위·리그 기록(#/league)으로 옮겼다.
//   ?by=winrate|power  (예전 주소 ?tab=league 는 #/league 로 넘긴다)
//   감독 순위는 실제 가입한 감독만 나온다(AI 구단은 순위에 없다). 로그인해야 내 순위가 보인다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ScreenProps } from '../../app/screen';
import { Link, navigate, setQueryQuiet } from '../../app/router';
import { useAuth } from '../../app/auth';
import { Button, Emblem, Icon, Sheet, Tabs, fmt } from '../../ui';
import { isTeamId, myTeam, teamById } from '../../game/mock';
import { rankLabel, teamLine, useSeason } from '../../season/store';
import { ApiError, api, type PvpLineupItem, type RankingBy, type RankingsRes, type RankingRow } from '../../api';
import { TeamLineup, cardsFromRoster, cardsFromSnapshot, type LineupCards } from '../pvp/TeamLineup';
import { myRoster } from '../../season/rosters';
import { DeckBadge } from '../../ui/DeckBadge';
import { deckOf, deckOfSnapshot } from '../../game/deck';
import { entryMembers, initialLineup, store as lineupStore } from '../lineup/calc';
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

  // 감독을 누르면 그 감독이 올려 둔 라인업 카드 — 순위 응답엔 라인업이 없어서 대전 상대 목록(GET /pvp/opponents)에서 찾는다(나는 내 라인업)
  const [peek, setPeek] = useState<Pick<RankingRow, 'userId' | 'username' | 'teamName' | 'club' | 'ovr' | 'power' | 'rating'> & { me?: boolean } | null>(null);
  const [lineups, setLineups] = useState<Map<number, PvpLineupItem[]> | 'loading' | 'error' | null>(null);
  const fetchedAt = useRef(0);
  const openPeek = (row: NonNullable<typeof peek>) => {
    setPeek(row);
    if (demo || row.me || lineups === 'loading') return;
    // 받은 지 1분이 지났으면 다시 (다른 감독이 라인업을 바꿨을 수 있다)
    if (lineups instanceof Map && Date.now() - fetchedAt.current < 60_000) return;
    setLineups('loading');
    api.pvpOpponents()
      .then((r) => { fetchedAt.current = Date.now(); setLineups(new Map(r.opponents.map((o) => [o.userId, o.lineup ?? []]))); })
      .catch(() => setLineups('error'));
  };
  // 덱 배지 — 순위 응답엔 라인업이 없어서, 들어오면 대전 상대 목록(레이팅이 가까운 20명)을 한 번 받아 그 감독들 덱을 붙인다. 나는 내 라인업
  useEffect(() => {
    if (demo || status !== 'in' || lineups !== null) return;
    setLineups('loading');
    api.pvpOpponents()
      .then((r) => { fetchedAt.current = Date.now(); setLineups(new Map(r.opponents.map((o) => [o.userId, o.lineup ?? []]))); })
      .catch(() => setLineups('error'));
  }, [demo, status]); // eslint-disable-line react-hooks/exhaustive-deps
  const myDeck = useMemo(() => deckOf(entryMembers(lineupStore.get() ?? initialLineup())), []);
  const deckFor = (row: { userId: number; me?: boolean }) => (row.me ? myDeck : lineups instanceof Map ? deckOfSnapshot(lineups.get(row.userId)) : null);
  // 나는 내 카드 그대로(등급 · 강화 · 특별 선수), 다른 감독은 올려 둔 라인업에서 되살린 카드
  const peekCards: LineupCards | null = (() => {
    if (!peek) return null;
    if (peek.me) { try { return cardsFromRoster(myRoster()); } catch { return null; } }
    const l = lineups instanceof Map ? lineups.get(peek.userId) : undefined;
    return l?.length ? cardsFromSnapshot(l) : null;
  })();

  const col = BY.find((x) => x.value === by)!.col;
  const data = load.kind === 'ok' && load.data.by === by ? load.data : null;
  const me = data?.me ?? null;
  const meInTop = !!data?.rows.some((r) => r.me);

  return (
    <section className={s.sec}>
      <header className={s.head}>
        <h2 className={['head', s.h].join(' ')}>감독 순위</h2>
        {data && (
          <p className={s.meta}>
            <span className="num">{fmt.int(data.total)}</span>명{me?.rank ? <> · 나 <b className="num">{me.rank}</b>위</> : null}
          </p>
        )}
      </header>
      <Tabs variant="box" size="s" items={BY.map((x) => ({ value: x.value, label: x.label }))} value={by} onChange={setBy} aria-label="정렬 기준" className={s.by} />

      {demo && <p className={s.demo}>예시 화면</p>}
      {status === 'out' && (
        <div className={s.empty}>
          <p><b>로그인이 필요해요</b></p>
          <Button size="s" variant="secondary" onClick={() => navigate('/login')}>로그인</Button>
        </div>
      )}
      {status !== 'out' && (load.kind === 'loading' || load.kind === 'idle' || (load.kind === 'ok' && !data)) && <p className={s.emptyLine}>불러오는 중…</p>}
      {load.kind === 'error' && (
        <div className={s.empty}>
          <p><b>못 불러왔어요</b> {load.msg}</p>
          <Button size="s" variant="secondary" onClick={() => void fetchIt(by)}>다시 시도</Button>
        </div>
      )}
      {data && data.rows.length === 0 && (
        <div className={s.empty}>
          <p><b>{by === 'winrate' ? `${data.minGames}경기 넘긴 감독이 아직 없어요` : '아직 순위에 오른 감독이 없어요'}</b></p>
          <Button size="s" variant="secondary" onClick={() => navigate('/pvp')}>대전</Button>
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
                    <button type="button" className={[s.who, s.whoBtn].join(' ')} onClick={() => openPeek({ ...x, me: x.me })} aria-label={`${x.username} 감독 라인업 보기`}>
                      <Emblem team={tm} size={26} />
                      <span className={s.whoTxt}>
                        <b>{x.teamName}</b>
                        <small>{x.username}{x.me ? ' · 나' : ''}</small>
                        {(() => { const d = deckFor(x); return d ? <DeckBadge deck={d} size="s" className={s.deck} /> : null; })()}
                      </span>
                    </button>
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
                    <button type="button" className={[s.who, s.whoBtn].join(' ')} onClick={() => openPeek({ ...me, me: true })} aria-label="내 라인업 보기">
                      <Emblem team={clubTeam(me.club)} size={26} />
                      <span className={s.whoTxt}><b>{me.teamName}</b><small>{me.username} · 나</small><DeckBadge deck={myDeck} size="s" className={s.deck} /></span>
                    </button>
                  </td>
                  <td className={['num', s.cR, s.wdl].join(' ')}>{me.w}-{me.d}-{me.l}</td>
                  <td className={['num', s.cR, s.val].join(' ')}>{showVal(by, me.value)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      )}
      {data && (by === 'winrate' || (!me && status === 'in')) && (
        <p className={s.note}>
          {by === 'winrate' && <><span className="num">{data.minGames}</span>경기 이상{me && me.rank == null ? <> · 나 <b className="num">{Math.max(0, data.minGames - (me.w + me.d + me.l))}</b>경기 더</> : ''}</>}
          {by !== 'winrate' && '대전 탭에 들어가면 등록돼요'}
        </p>
      )}
      <Sheet
        open={!!peek}
        onClose={() => setPeek(null)}
        title={peek ? `${peek.teamName} · ${peek.username}` : ''}
        sub={peek ? <>팀 종합 <span className="num">{peek.ovr}</span> · 전력 <span className="num">{fmt.int(peek.power)}</span></> : undefined}
        height="tall"
      >
        {peek && (demo
          ? <p className={s.peekNote}>라인업 없음</p>
          : peekCards
            ? <TeamLineup cards={peekCards} onOpen={() => setPeek(null)} />
            : lineups === 'loading' ? <p className={s.peekNote}>불러오는 중…</p>
              : lineups === 'error' ? <p className={s.peekNote}>못 불러왔어요</p>
                : <p className={s.peekNote} title="레이팅이 가까운 20명만 볼 수 있어요">라인업을 볼 수 없어요</p>)}
      </Sheet>
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
          <small>우리 구단 {rankLabel(ln)}</small>
        </span>
        <Icon name="chevron" size={16} />
      </Link>
    </section>
  );
}
