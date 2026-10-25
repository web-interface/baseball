// 대전 #/pvp — 비동기 대전 (담당: 선수 상세·대전 개발자, 이 폴더만 고친다)
//   다른 감독이 저장해 둔 구단과 혼자 붙는다(상대 접속 필요 없음). 실제 감독은 서버가 결과를 정하고,
//   아래 'AI 구단'은 이 기기에서만 도는 연습 상대(목업)다. 순위는 위 메뉴 '순위' 탭(#/rank).
//   ?tab=opp|log · ?vs=<AI 상대 id> AI 경기(경기 전 → 빨리 보기 → 결과)
import { DeckBadge } from '../../ui/DeckBadge';
import { deckOfSnapshot } from '../../game/deck';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ScreenProps } from '../../app/screen';
import { navigate, setQueryQuiet } from '../../app/router';
import { useAuth } from '../../app/auth';
import { Button, Emblem, Sheet, Tabs, fmt, useToast } from '../../ui';
import { CardMini } from '../../cards';
import { POS_KO } from '../../game/labels';
import { teamById } from '../../game/mock';
import type { PvpOpponent } from '../../game/types';
import type { PvpClub } from '../../api';
import { Battle } from './Battle';
import { Spark } from './Spark';
import { ME, MY_RANK, PVP_OPPONENTS, myLog, oppSide, ratingSeries, vsClubs } from './local-mock';
import { clubTeam, mySnapshot, usePvpOnline, type SessionGame } from './online';
import { listBattles, saveBattle, type BattleRec } from './battles';
import { TeamLineup, cardsFromMockSide, cardsFromSnapshot } from './TeamLineup';
import s from './pvp.module.css';
import { showOvr } from '../../game/ovrShow';

type Tab = 'opp' | 'log';
const RES_KO = { W: '승', D: '무', L: '패' } as const;
const pctOf = (w: number, l: number) => fmt.avg(w / Math.max(1, w + l));

export default function PvpScreen({ query }: ScreenProps) {
  const vs = query.get('vs');
  const opp = vs ? PVP_OPPONENTS.find((o) => o.id === vs) : undefined;
  const [left, setLeft] = useState(ME.pvpLeft);
  const [extra, setExtra] = useState<{ rating: number; w: number; d: number; l: number }>({ rating: 0, w: 0, d: 0, l: 0 });
  if (opp) {
    return (
      <Battle
        opp={opp}
        auto={query.get('play') === '1'}
        rating={ME.rating + extra.rating}
        left={left}
        onFinish={(res, delta) => {
          setLeft((x) => Math.max(0, x - 1));
          setExtra((e) => ({ rating: e.rating + delta, w: e.w + (res === 'W' ? 1 : 0), d: e.d + (res === 'D' ? 1 : 0), l: e.l + (res === 'L' ? 1 : 0) }));
        }}
      />
    );
  }
  return <Lobby query={query} left={left} extra={extra} />;
}

function Lobby({ query, left, extra }: { query: URLSearchParams; left: number; extra: { rating: number; w: number; d: number; l: number } }) {
  const toast = useToast();
  const { user } = useAuth();
  const t = query.get('tab');
  const [tab, setTabS] = useState<Tab>(t === 'log' ? 'log' : 'opp');
  const [peek, setPeek] = useState<PvpOpponent | null>(null);
  const [peekReal, setPeekReal] = useState<PvpClub | null>(null);
  const setTab = (v: Tab) => { setTabS(v); setQueryQuiet({ tab: v === 'opp' ? null : v }); };
  const demo = query.get('demo') === '1';
  const on = usePvpOnline(demo);
  // 미리보기: ?demo=1&fight=1 이면 첫 상대와 바로 한 판 (결과 시트 모양 보기)
  const autoFought = useRef(false);
  useEffect(() => {
    if (!demo || query.get('fight') !== '1' || autoFought.current || on.st.kind !== 'ready' || !on.st.opponents[0]) return;
    autoFought.current = true;
    void start(on.st.opponents[0]);
  }, [on.st]); // eslint-disable-line react-hooks/exhaustive-deps
  const real = on.st.kind === 'ready' ? on.st.me : null;

  const start = async (o: PvpClub) => {
    setPeekReal(null);
    const r = await on.fight(o);
    if (!r.ok) { toast({ text: r.msg, tone: 'bad' }); return; }
    // 서버가 정한 결과를 이 기기에 남기고, 경기 화면에서 그 점수에 꼭 맞는 경기로 보여 준다
    const g = r.game.res.game;
    const snap = mySnapshot();
    const meNow = r.game.res.me;
    const oppNow = r.game.res.opponent;
    const rec: BattleRec = {
      id: g.id, at: g.createdAt ? g.createdAt * 1000 : Date.now(),
      me: { userId: real?.userId, username: real?.username ?? user ?? '나', club: snap.club, teamName: snap.teamName, lineup: snap.lineup, ovr: snap.ovr, power: snap.power },
      opp: { userId: o.userId, username: o.username, club: o.club, teamName: o.teamName, lineup: o.lineup ?? [], ovr: o.ovr, power: o.power },
      line: g.line, myScore: g.myScore, oppScore: g.oppScore, result: g.result,
      ratingBefore: r.game.before, ratingDelta: g.ratingDelta,
      meRecord: meNow ? { w: meNow.w, d: meNow.d, l: meNow.l } : undefined,
      oppRecord: oppNow ? { w: oppNow.w, d: oppNow.d, l: oppNow.l, rating: oppNow.rating } : undefined,
      replay: g.replay,
    };
    saveBattle(rec);
    navigate(`/match?pvp=${encodeURIComponent(g.id)}`);
  };

  return (
    <div className={s.screen}>
      {demo && <p className={s.demo}>예시 화면</p>}
      {real ? <RealBoard me={real} today={on.st.kind === 'ready' ? on.st.today : null} games={on.games} /> : <MockBoard left={left} extra={extra} user={user} />}

      <div className={s.tabsWrap}>
        <Tabs items={[{ value: 'opp' as Tab, label: '대전 상대' }, { value: 'log' as Tab, label: '내 기록' }]} value={tab} onChange={setTab} fill aria-label="대전" />
      </div>

      {tab === 'opp' && (
        <>
          <section className={s.sec}>
            <header className={s.secHead}>
              <h3 className="head">다른 감독</h3>
            </header>
            <RealList on={on} onPeek={setPeekReal} onStart={start} />
          </section>

          <section className={s.sec}>
            <header className={s.secHead}>
              <h3 className="head">AI 구단</h3>
              <span className={s.secMeta}>연습용</span>
            </header>
            <ul className={s.opps}>
              {PVP_OPPONENTS.map((o) => {
                const tm = teamById(o.teamId);
                return (
                  <li key={o.id} className={[s.opp, o.rival && s.oppRival].filter(Boolean).join(' ')}>
                    <button type="button" className={s.oppMain} onClick={() => setPeek(o)} aria-label={`${o.user} (AI) 라인업 보기`}>
                      <Emblem team={tm} size={34} />
                      <span className={s.oppBody}>
                        <span className={s.oppName}>
                          <b>{tm.name}</b>
                          {o.rival && <em className={s.tag}>{o.rival === 'rival' ? '라이벌 ×2' : '설욕전'}</em>}
                        </span>
                        <span className={s.oppSub}>
                          {o.user} <span className={s.ai}>(AI)</span> · <span className="num">{o.record.w}</span>승 <span className="num">{o.record.d}</span>무 <span className="num">{o.record.l}</span>패 <span className="num">{pctOf(o.record.w, o.record.l)}</span>
                        </span>
                        <span className={s.oppForm}>
                          {o.recent.map((x, k) => <b key={k} className={[s.res, s.resS, s['r' + x]].join(' ')}>{RES_KO[x]}</b>)}
                          <span className={s.oppRt}>레이팅 <span className="num">{fmt.int(o.rating)}</span></span>
                        </span>
                      </span>
                      <span className={s.oppPow}>
                        <b className="num-display">{o.lineupOvr}</b>
                        <small>전력 <span className="num">{fmt.int(o.power)}</span></small>
                      </span>
                    </button>
                    <Button size="s" variant="secondary" className={s.go} onClick={() => navigate(`/pvp?vs=${o.id}`)} disabled={left <= 0}>도전</Button>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}

      {tab === 'log' && <MyLog games={on.games} />}

      <OpponentSheet opp={peek} onClose={() => setPeek(null)} disabled={left <= 0} />
      <RealSheet opp={peekReal} onClose={() => setPeekReal(null)} onStart={start} busy={on.busy != null} />
    </div>
  );
}

/* ───────── 내 전적 점수판 — 실제(서버) ───────── */
function RealBoard({ me, today, games }: { me: PvpClub; today: { used: number; limit: number } | null; games: SessionGame[] }) {
  const tm = clubTeam(me.club);
  const series = useMemo(() => (games.length ? [games[games.length - 1].before, ...games.slice().reverse().map((g) => g.res.me?.rating ?? g.before + g.res.game.ratingDelta)] : []), [games]);
  const sessionDelta = games.reduce((a, g) => a + g.res.game.ratingDelta, 0);
  return (
    <section className={s.board} aria-label="내 대전 전적">
      <div className={s.boardTop}>
        <p className={s.who}><Emblem team={tm} size={22} /><b>{me.username}</b><span>감독 · {me.teamName}</span></p>
        {today && <p className={s.left}>오늘 대전 <b className="num">{today.limit - today.used}</b><span className="num">/{today.limit}</span></p>}
      </div>
      <div className={s.wdl}>
        <span><b className="num-display">{me.w}</b><i>승</i></span>
        <span><b className="num-display">{me.d}</b><i>무</i></span>
        <span><b className="num-display">{me.l}</b><i>패</i></span>
        <span className={s.pct}><i>승률</i><b className="num">{pctOf(me.w, me.l)}</b></span>
      </div>
      <div className={s.rate}>
        <div className={s.rateNum}>
          <i>레이팅</i>
          <b className="num-display">{fmt.int(me.rating)}</b>
          {games.length > 0 && <span className={['num', s.delta].join(' ')}>{fmt.signed(sessionDelta)}</span>}
          <small>팀 종합 <span className="num">{showOvr(me.ovr)}</span> · 전력 <span className="num">{fmt.int(me.power)}</span></small>
        </div>
        {series.length >= 2 ? <Spark values={series} className={s.spark} label="이번 접속 레이팅" /> : null}
      </div>
      {games.length > 0 && (
        <div className={s.recent} aria-label="이번 접속 대전">
          <i>방금 대전</i>
          {games.slice(0, 10).map((g) => <b key={g.res.game.id} className={[s.res, s['r' + g.res.game.result]].join(' ')}>{RES_KO[g.res.game.result]}</b>)}
        </div>
      )}
    </section>
  );
}

/* ───────── 내 전적 점수판 — 로그인 전(목업) ───────── */
function MockBoard({ left, extra, user }: { left: number; extra: { rating: number; w: number; d: number; l: number }; user: string | null }) {
  const series = useMemo(() => { const x = ratingSeries(); if (extra.rating) x.push(x[x.length - 1] + extra.rating); return x; }, [extra.rating]);
  const w = ME.record.w + extra.w, d = ME.record.d + extra.d, l = ME.record.l + extra.l;
  const rating = ME.rating + extra.rating;
  const recent = useMemo(() => myLog().map((x) => x.res), []);
  const me = teamById(ME.teamId);
  return (
    <section className={s.board} aria-label="내 대전 전적 (예시)">
      <div className={s.boardTop}>
        <p className={s.who}><Emblem team={me} size={22} /><b>{user ?? ME.user}</b><span>감독 · {me.name}</span></p>
        <p className={s.left}>오늘 대전 <b className="num">{left}</b><span className="num">/10</span></p>
      </div>
      <div className={s.wdl}>
        <span><b className="num-display">{w}</b><i>승</i></span>
        <span><b className="num-display">{d}</b><i>무</i></span>
        <span><b className="num-display">{l}</b><i>패</i></span>
        <span className={s.pct}><i>승률</i><b className="num">{pctOf(w, l)}</b></span>
      </div>
      <div className={s.rate}>
        <div className={s.rateNum}>
          <i>레이팅 · 예시</i>
          <b className="num-display">{fmt.int(rating)}</b>
          <span className={['num', s.delta].join(' ')}>{fmt.signed(ME.ratingDelta + extra.rating)}</span>
          <small>전체 <span className="num">{MY_RANK.rating.rank}</span>위</small>
        </div>
        <Spark values={series} className={s.spark} label="최근 20판 레이팅" />
      </div>
      <div className={s.recent} aria-label="최근 10판">
        <i>최근 10판</i>
        {recent.map((x, i) => <b key={i} className={[s.res, s['r' + x]].join(' ')}>{RES_KO[x]}</b>)}
      </div>
    </section>
  );
}

/* ───────── 실제 감독 목록 ───────── */
function RealList({ on, onPeek, onStart }: { on: ReturnType<typeof usePvpOnline>; onPeek: (o: PvpClub) => void; onStart: (o: PvpClub) => void }) {
  const st = on.st;
  if (st.kind === 'out') {
    return (
      <div className={s.empty}>
        <p><b>로그인이 필요해요</b></p>
        <Button size="s" variant="secondary" onClick={() => navigate('/login')}>로그인</Button>
      </div>
    );
  }
  if (st.kind === 'loading') return <p className={s.emptyLine}>불러오는 중…</p>;
  if (st.kind === 'error') {
    return (
      <div className={s.empty}>
        <p><b>못 불러왔어요</b> {st.msg}</p>
        <Button size="s" variant="secondary" onClick={() => void on.reload()}>다시 시도</Button>
      </div>
    );
  }
  if (st.opponents.length === 0) {
    return <div className={s.empty}><p><b>아직 다른 감독이 없어요</b></p></div>;
  }
  const out = st.today.used >= st.today.limit;
  return (
    <>
      <ul className={s.opps}>
        {st.opponents.map((o, i) => {
          const tm = clubTeam(o.club);
          const n = o.w + o.d + o.l;
          return (
            <li key={o.userId} className={s.opp}>
              <button type="button" className={s.oppMain} onClick={() => onPeek(o)} aria-label={`${o.username} 감독 구단 보기`}>
                <Emblem team={tm} size={34} />
                <span className={s.oppBody}>
                  <span className={s.oppName}><b>{o.teamName}</b></span>
                  <span className={s.oppSub}>
                    <b className={s.mgr}>{o.username}</b> 감독 · {n ? <><span className="num">{o.w}</span>승 <span className="num">{o.d}</span>무 <span className="num">{o.l}</span>패 <span className="num">{pctOf(o.w, o.l)}</span></> : '첫 대전 전'}
                  </span>
                  <span className={s.oppForm}>
                    {(() => { const d = deckOfSnapshot(o.lineup); return d ? <DeckBadge deck={d} size="s" /> : null; })()}
                    <span className={[s.oppRt, s.oppRt0].join(' ')}>레이팅 <span className="num">{fmt.int(o.rating)}</span></span>
                    <span className={s.oppRt}>{ago(o.updatedAt)} 저장</span>
                  </span>
                </span>
                <span className={s.oppPow}>
                  <b className="num-display">{showOvr(o.ovr)}</b>
                  <small>전력 <span className="num">{fmt.int(o.power)}</span></small>
                </span>
              </button>
              <Button size="s" variant={i === 0 ? 'primary' : 'secondary'} className={s.go} onClick={() => onStart(o)} disabled={out || on.busy != null}>
                {on.busy === o.userId ? '경기 중' : '대전 시작'}
              </Button>
            </li>
          );
        })}
      </ul>
      {out && <p className={s.note}>오전 9시에 다시 채워져요</p>}
    </>
  );
}

function ago(sec: number) {
  const d = Math.max(0, Date.now() / 1000 - sec);
  if (d < 3600) return `${Math.max(1, Math.round(d / 60))}분 전`;
  if (d < 86400) return `${Math.round(d / 3600)}시간 전`;
  return `${Math.round(d / 86400)}일 전`;
}

/* ───────── 실제 감독 구단 미리 보기 ───────── */
function RealSheet({ opp, onClose, onStart, busy }: { opp: PvpClub | null; onClose: () => void; onStart: (o: PvpClub) => void; busy: boolean }) {
  return (
    <Sheet
      open={!!opp}
      onClose={onClose}
      title={opp ? `${opp.teamName} · ${opp.username}` : ''}
      sub={opp ? <>팀 종합 <span className="num">{showOvr(opp.ovr)}</span> · 전력 <span className="num">{fmt.int(opp.power)}</span></> : undefined}
      footer={opp ? <Button block disabled={busy} onClick={() => onStart(opp)}>대전 시작</Button> : undefined}
    >
      {opp && <TeamLineup cards={cardsFromSnapshot(opp.lineup ?? [])} onOpen={onClose} />}
    </Sheet>
  );
}

/* ───────── AI 상대 라인업 미리 보기 ───────── */
function OpponentSheet({ opp, onClose, disabled }: { opp: PvpOpponent | null; onClose: () => void; disabled: boolean }) {
  const side = useMemo(() => (opp ? oppSide(opp) : null), [opp]);
  return (
    <Sheet
      open={!!opp}
      onClose={onClose}
      title={side ? `${side.team.name} · ${side.user}` : ''}
      sub={side ? `「${side.lineupName}」 · ${side.style}` : undefined}
      footer={opp ? <Button block disabled={disabled} onClick={() => { onClose(); navigate(`/pvp?vs=${opp.id}`); }} trailing={<span>승 {fmt.int(opp.reward)} GP</span>}>도전</Button> : undefined}
    >
      {side && <TeamLineup cards={cardsFromMockSide(side)} onOpen={onClose} />}
    </Sheet>
  );
}

/* ───────── 내 기록 ───────── */
function MyLog({ games }: { games: SessionGame[] }) {
  const log = useMemo(() => myLog(), []);
  const saved = useMemo(() => listBattles(), [games.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const clubs = useMemo(() => vsClubs(), []);
  const maxG = Math.max(...clubs.map((c) => c.w + c.d + c.l));
  return (
    <>
      {saved.length > 0 && (
        <section className={s.sec}>
          <header className={s.secHead}>
            <h3 className="head">다른 감독과 한 대전</h3>
          </header>
          <ul className={s.log}>
            {saved.map((x) => (
              <li key={x.id} className={s.logRow}>
                <button type="button" className={s.logBtn} onClick={() => navigate(`/match?pvp=${encodeURIComponent(x.id)}`)} aria-label={`${x.opp.username} 감독과 한 경기 다시 보기`}>
                  <b className={[s.res, s['r' + x.result]].join(' ')}>{RES_KO[x.result]}</b>
                  <span className={['num', s.lgScore].join(' ')}>{x.myScore}<i>:</i>{x.oppScore}</span>
                  <span className={s.lgWho}><b>{x.opp.username}</b><span>{clubTeam(x.opp.club).short}{x.line.away.length > 9 ? <em> · 연장 {x.line.away.length}회</em> : null}</span></span>
                  <span className={['num', s.lgDelta, x.ratingDelta >= 0 ? s.up : s.down].join(' ')}>{fmt.signed(x.ratingDelta)}</span>
                  <span className={['num', s.lgDate].join(' ')}>{new Date(x.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className={s.sec}>
        <header className={s.secHead}>
          <h3 className="head">AI 구단과 한 대전</h3>
          <span className={s.secMeta}>예시</span>
        </header>
        <ul className={s.log}>
          {log.map((x, i) => {
            const tm = teamById(x.oppTeam);
            return (
              <li key={i}>
                <b className={[s.res, s['r' + x.res]].join(' ')}>{RES_KO[x.res]}</b>
                <span className={['num', s.lgScore].join(' ')}>{x.my}<i>:</i>{x.their}</span>
                <span className={s.lgWho}><b>{x.oppUser} <span className={s.ai}>(AI)</span></b><span>{tm.short}{x.tag ? <em> · {x.tag}</em> : null}</span></span>
                <span className={['num', s.lgDelta, x.delta >= 0 ? s.up : s.down].join(' ')}>{fmt.signed(x.delta)}</span>
                <span className={['num', s.lgDate].join(' ')}>{x.date}</span>
              </li>
            );
          })}
        </ul>
      </section>
      <section className={s.sec}>
        <header className={s.secHead}>
          <h3 className="head">구단별 상대 전적</h3>
          <span className={s.secMeta}>예시</span>
        </header>
        <ul className={s.clubs}>
          {clubs.map((c) => {
            const tm = teamById(c.teamId);
            const g = c.w + c.d + c.l;
            return (
              <li key={c.teamId}>
                <span className={s.clName}><Emblem team={tm} size={20} />{tm.short}</span>
                <span className={s.clBar} aria-hidden style={{ width: `${(g / maxG) * 100}%` }}>
                  <i className={s.clW} style={{ flex: c.w }} />
                  {c.d > 0 && <i className={s.clD} style={{ flex: c.d }} />}
                  <i className={s.clL} style={{ flex: c.l }} />
                </span>
                <span className={['num', s.clNum].join(' ')}>{c.w}-{c.d}-{c.l}</span>
              </li>
            );
          })}
        </ul>
        <p className={s.legend}><i className={s.clW} />승 <i className={s.clD} />무 <i className={s.clL} />패</p>
      </section>
    </>
  );
}
