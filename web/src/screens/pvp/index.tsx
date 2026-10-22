// 대전 #/pvp — 비동기 대전 (담당: 선수 상세·대전 개발자, 이 폴더만 고친다)
//   다른 감독이 저장해 둔 라인업과 혼자 붙는다(상대 접속 필요 없음). 랭킹 · 내 전적.
//   ?tab=opp|rank|log · ?by=rating|pct|power|collection · ?vs=<상대 id> 경기(경기 전 → 빨리 보기 → 결과)
import { useMemo, useState } from 'react';
import type { ScreenProps } from '../../app/screen';
import { navigate } from '../../app/router';
import { Button, Emblem, Icon, Sheet, Tabs, fmt } from '../../ui';
import { CardMini } from '../../cards';
import { POS_KO } from '../../game/labels';
import { teamById } from '../../game/mock';
import type { PvpOpponent } from '../../game/types';
import { Battle } from './Battle';
import { Spark } from './Spark';
import { ME, MY_RANK, PVP_OPPONENTS, meRow, myLog, oppSide, rankingTop, ratingSeries, vsClubs, type RankBy } from './local-mock';
import s from './pvp.module.css';

type Tab = 'opp' | 'rank' | 'log';

function setQueryQuiet(patch: Record<string, string | null>) {
  try {
    const h = location.hash;
    const i = h.indexOf('?');
    const path = i >= 0 ? h.slice(0, i) : h;
    const q = new URLSearchParams(i >= 0 ? h.slice(i + 1) : '');
    Object.entries(patch).forEach(([k, v]) => (v == null ? q.delete(k) : q.set(k, v)));
    const qs = q.toString();
    history.replaceState(history.state, '', path + (qs ? '?' + qs : ''));
  } catch { /* */ }
}

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
  const t = query.get('tab');
  const [tab, setTabS] = useState<Tab>(t === 'rank' || t === 'log' ? t : 'opp');
  const b = query.get('by');
  const [by, setByS] = useState<RankBy>(b === 'pct' || b === 'power' || b === 'collection' ? b : 'rating');
  const [peek, setPeek] = useState<PvpOpponent | null>(null);
  const setTab = (v: Tab) => { setTabS(v); setQueryQuiet({ tab: v === 'opp' ? null : v }); };
  const setBy = (v: RankBy) => { setByS(v); setQueryQuiet({ by: v === 'rating' ? null : v }); };
  const series = useMemo(() => { const x = ratingSeries(); if (extra.rating) x.push(x[x.length - 1] + extra.rating); return x; }, [extra.rating]);
  const w = ME.record.w + extra.w, d = ME.record.d + extra.d, l = ME.record.l + extra.l;
  const rating = ME.rating + extra.rating;
  const log = useMemo(() => myLog(), []);
  const recent = log.map((x) => x.res);
  const me = teamById(ME.teamId);

  return (
    <div className={s.screen}>
      {/* 내 전적 — 점수판 */}
      <section className={s.board} aria-label="내 대전 전적">
        <div className={s.boardTop}>
          <p className={s.who}><Emblem team={me} size={22} /><b>{ME.user}</b><span>감독 · {me.name}</span></p>
          <p className={s.left}>오늘 대전 <b className="num">{left}</b><span className="num">/10</span></p>
        </div>
        <div className={s.wdl}>
          <span><b className="num-display">{w}</b><i>승</i></span>
          <span><b className="num-display">{d}</b><i>무</i></span>
          <span><b className="num-display">{l}</b><i>패</i></span>
          <span className={s.pct}><i>승률</i><b className="num">{fmt.avg(w / Math.max(1, w + l))}</b></span>
        </div>
        <div className={s.rate}>
          <div className={s.rateNum}>
            <i>레이팅</i>
            <b className="num-display">{fmt.int(rating)}</b>
            <span className={['num', s.delta].join(' ')}>{fmt.signed(ME.ratingDelta + extra.rating)}</span>
            <small>전체 <span className="num">{MY_RANK.rating.rank}</span>위 · 상위 <span className="num">{Math.max(1, Math.round((MY_RANK.rating.rank / MY_RANK.rating.of) * 100))}%</span></small>
          </div>
          <Spark values={series} className={s.spark} label="최근 20판 레이팅" />
        </div>
        <div className={s.recent} aria-label="최근 10판">
          <i>최근 10판</i>
          {recent.map((x, i) => <b key={i} className={[s.res, s['r' + x]].join(' ')}>{x === 'W' ? '승' : x === 'D' ? '무' : '패'}</b>)}
        </div>
      </section>

      <div className={s.tabsWrap}>
        <Tabs items={[{ value: 'opp' as Tab, label: '대전 상대' }, { value: 'rank' as Tab, label: '랭킹' }, { value: 'log' as Tab, label: '내 기록' }]} value={tab} onChange={setTab} fill aria-label="대전" />
      </div>

      {tab === 'opp' && (
        <section className={s.sec}>
          <header className={s.secHead}>
            <h3 className="head">오늘의 상대</h3>
            <span className={s.secMeta}>저장된 라인업과 혼자 붙어요 · 상대는 접속 안 해도 돼요</span>
          </header>
          <ul className={s.opps}>
            {PVP_OPPONENTS.map((o, i) => {
              const tm = teamById(o.teamId);
              const pct = o.record.w / Math.max(1, o.record.w + o.record.l);
              return (
                <li key={o.id} className={[s.opp, o.rival && s.oppRival].filter(Boolean).join(' ')}>
                  <button type="button" className={s.oppMain} onClick={() => setPeek(o)} aria-label={`${o.user} 라인업 보기`}>
                    <Emblem team={tm} size={34} />
                    <span className={s.oppBody}>
                      <span className={s.oppName}>
                        <b>{tm.name}</b>
                        {o.rival && <em className={s.tag}>{o.rival === 'rival' ? '라이벌 · 보상 2배' : '설욕전'}</em>}
                      </span>
                      <span className={s.oppSub}>
                        {o.user} 감독 · <span className="num">{o.record.w}</span>승 <span className="num">{o.record.d}</span>무 <span className="num">{o.record.l}</span>패 <span className="num">{fmt.avg(pct)}</span>
                      </span>
                      <span className={s.oppForm}>
                        {o.recent.map((x, k) => <b key={k} className={[s.res, s.resS, s['r' + x]].join(' ')}>{x === 'W' ? '승' : x === 'D' ? '무' : '패'}</b>)}
                        <span className={s.oppRt}>레이팅 <span className="num">{fmt.int(o.rating)}</span></span>
                      </span>
                    </span>
                    <span className={s.oppPow}>
                      <b className="num-display">{o.lineupOvr}</b>
                      <small>전력 <span className="num">{fmt.int(o.power)}</span></small>
                    </span>
                  </button>
                  <Button size="s" variant={i === 0 ? 'primary' : 'secondary'} className={s.go} onClick={() => navigate(`/pvp?vs=${o.id}`)} disabled={left <= 0}>도전</Button>
                </li>
              );
            })}
          </ul>
          <p className={s.note}>내 팀 종합 ±8 범위에서 골라요. 보상 있는 판은 하루 10판, 그 뒤로도 랭킹에는 반영돼요.</p>
        </section>
      )}

      {tab === 'rank' && <Ranking by={by} setBy={setBy} rating={rating} w={w} d={d} l={l} />}
      {tab === 'log' && <MyLog />}

      <OpponentSheet opp={peek} onClose={() => setPeek(null)} disabled={left <= 0} />
    </div>
  );
}

/* ───────── 상대 라인업 미리 보기 ───────── */
function OpponentSheet({ opp, onClose, disabled }: { opp: PvpOpponent | null; onClose: () => void; disabled: boolean }) {
  const side = useMemo(() => (opp ? oppSide(opp) : null), [opp]);
  return (
    <Sheet
      open={!!opp}
      onClose={onClose}
      title={side ? `${side.team.name} · ${side.user}` : ''}
      sub={side ? `저장 라인업 「${side.lineupName}」 · ${side.savedAgo} 저장 · ${side.style}` : undefined}
      footer={opp ? <Button block disabled={disabled} onClick={() => { onClose(); navigate(`/pvp?vs=${opp.id}`); }} trailing={<span>승 {fmt.int(opp.reward)} GP</span>}>이 라인업에 도전</Button> : undefined}
    >
      {side && (
        <div className={s.peek}>
          <div className={s.peekAce}>
            <CardMini player={side.sp.player} grade={side.sp.card.grade} enhance={side.sp.card.enhance} width={64} />
            <div>
              <p className={s.peekLab}>선발</p>
              <p className={s.peekName}>{side.sp.player.name} <span className="num">{side.sp.player.ovr}</span></p>
              {side.sp.card.signaturePitch && <p className={s.peekSig} style={{ ['--sig' as string]: side.sp.card.signaturePitch.color }}>{side.sp.card.signaturePitch.name}</p>}
            </div>
          </div>
          <ol className={s.peekList}>
            {side.batting.map((b) => (
              <li key={b.order}>
                <span className="num">{b.order}</span>
                <span className={s.peekPos}>{POS_KO[b.pos]}</span>
                <b>{b.player.name}</b>
                <span className={s.peekTeam}>{teamById(b.player.teamId).short}</span>
                <span className={['num', s.peekOvr].join(' ')}>{b.player.ovr}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Sheet>
  );
}

/* ───────── 랭킹 ───────── */
const BY: { value: RankBy; label: string; col: string }[] = [
  { value: 'rating', label: '레이팅', col: '레이팅' },
  { value: 'pct', label: '승률', col: '승률' },
  { value: 'power', label: '구단 전력', col: '선수 점수 합' },
  { value: 'collection', label: '수집', col: '수집 점수' },
];
function Ranking({ by, setBy, rating, w, d, l }: { by: RankBy; setBy: (v: RankBy) => void; rating: number; w: number; d: number; l: number }) {
  const rows = rankingTop(by);
  const me = { ...meRow(), rating, w, d, l };
  const val = (x: typeof me) => (by === 'rating' ? fmt.int(x.rating) : by === 'pct' ? fmt.avg(x.w / Math.max(1, x.w + x.l)) : by === 'power' ? fmt.int(x.power) : fmt.int(x.collection));
  const col = BY.find((x) => x.value === by)!.col;
  return (
    <section className={s.sec}>
      <header className={s.secHead}>
        <h3 className="head">랭킹</h3>
        <span className={s.secMeta}>매주 일요일 24:00 정산 · 하루 4번 갱신</span>
      </header>
      <Tabs variant="box" size="s" items={BY.map((x) => ({ value: x.value, label: x.label }))} value={by} onChange={setBy} aria-label="랭킹 기준" className={s.byTabs} />
      <table className={s.rank}>
        <thead>
          <tr><th className={s.cR}>순위</th><th>감독 · 구단</th><th className={s.cR}>승-무-패</th><th className={s.cR}>{col}</th></tr>
        </thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.user} className={x.rank <= 3 ? s.podium : undefined}>
              <td className={['num', s.cR, s.rk].join(' ')}>{x.rank}</td>
              <td className={s.rkWho}><Emblem team={teamById(x.teamId)} size={18} /><b>{x.user}</b><span>{teamById(x.teamId).short}</span></td>
              <td className={['num', s.cR, s.wdlCell].join(' ')}>{x.w}-{x.d}-{x.l}</td>
              <td className={['num', s.cR, s.val].join(' ')}>{val(x)}{by === 'rating' && <em className={x.delta >= 0 ? s.up : s.down}>{fmt.signed(x.delta)}</em>}</td>
            </tr>
          ))}
          <tr className={s.gap} aria-hidden><td colSpan={4}>⋮</td></tr>
          <tr className={s.meRow}>
            <td className={['num', s.cR, s.rk].join(' ')}>{MY_RANK[by].rank}</td>
            <td className={s.rkWho}><Emblem team={teamById(me.teamId)} size={18} /><b>{me.user}</b><span>나</span></td>
            <td className={['num', s.cR, s.wdlCell].join(' ')}>{me.w}-{me.d}-{me.l}</td>
            <td className={['num', s.cR, s.val].join(' ')}>{val(me)}</td>
          </tr>
        </tbody>
      </table>
      <p className={s.note}>
        {by === 'power' ? '구단 전력 = 1군 22명 최종 능력치 합(강화·레벨 포함).' : by === 'collection' ? '수집 점수 = 도감에 모은 카드 등급 점수.' : by === 'pct' ? '승률은 30판 이상 감독만.' : '레이팅은 이길수록 오르고, 강한 상대를 이기면 더 올라요(시작 1,500).'}
        {' '}상위 3% 골든볼 300 · 상위 10% 골든볼 100.
      </p>
    </section>
  );
}

/* ───────── 내 기록 ───────── */
function MyLog() {
  const log = useMemo(() => myLog(), []);
  const clubs = useMemo(() => vsClubs(), []);
  const maxG = Math.max(...clubs.map((c) => c.w + c.d + c.l));
  return (
    <>
      <section className={s.sec}>
        <header className={s.secHead}>
          <h3 className="head">최근 대전</h3>
          <span className={s.secMeta}>2027 시즌 · 다시 보기는 하이라이트만</span>
        </header>
        <ul className={s.log}>
          {log.map((x, i) => {
            const tm = teamById(x.oppTeam);
            return (
              <li key={i}>
                <b className={[s.res, s['r' + x.res]].join(' ')}>{x.res === 'W' ? '승' : x.res === 'D' ? '무' : '패'}</b>
                <span className={['num', s.lgScore].join(' ')}>{x.my}<i>:</i>{x.their}</span>
                <span className={s.lgWho}><b>{x.oppUser}</b><span>{tm.short}{x.tag ? <em> · {x.tag}</em> : null}</span></span>
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
          <span className={s.secMeta}>상대 감독이 고른 구단 기준</span>
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
      <p className={s.foot}><Icon name="info" size={14} /> 대전 결과는 서버 엔진이 정하고, 새로고침해도 바뀌지 않아요.</p>
    </>
  );
}
