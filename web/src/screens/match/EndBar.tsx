// 경기 끝 — 시즌 경기는 '다음 경기 바로' · 시즌 성적 · 오늘 다른 구장 결과, 대전은 레이팅 변화 · 전적.
import { navigate } from '../../app/router';
import type { ReactNode } from 'react';
import { Button, Emblem, Icon, Sheet, fmt } from '../../ui';
import { ME, teamById } from '../../game/mock';
import { longDate, shortDate } from '../../season/schedule';
import { allDays, isOver, pctLabel, rankLabel, standingsOf, teamLine, useSeason, yearOf } from '../../season/store';
import { SERIES_KO, nextPostGame } from '../../season/post';
import { LeaguePanel } from '../season/LeaguePanel';
import { nextMyGame } from '../../season/run';
import s from './EndBar.module.css';

export interface PvpEnd {
  oppName: string;
  oppTeamName: string;
  oppClub: string;
  my: number;
  their: number;
  result: 'W' | 'D' | 'L';
  ratingBefore: number;
  ratingDelta: number;
  meRecord?: { w: number; d: number; l: number };
  oppRecord?: { w: number; d: number; l: number; rating: number };
  replay?: boolean;
}
export type MatchCtx =
  | { kind: 'last'; onDone?: () => void }
  | { kind: 'over'; onDone?: () => void }
  | { kind: 'season'; idx: number; date: string; onDone?: () => void; onStart?: () => void }
  | { kind: 'post'; label: string; onDone?: () => void; onStart?: () => void }
  | { kind: 'pvp'; end: PvpEnd; onDone?: () => void };

const RES_KO = { W: '승', D: '무', L: '패' } as const;

export function EndBar({ ctx, standalone }: { ctx: MatchCtx; standalone?: boolean }) {
  if (ctx.kind === 'pvp') return <PvpBar end={ctx.end} />;
  if (ctx.kind === 'over') return <SeasonOver standalone={standalone} />;
  if (ctx.kind === 'season') return <SeasonBar idx={ctx.idx} />;
  if (ctx.kind === 'post') return <PostBar label={ctx.label} />;
  return null;
}

/** 포스트시즌 경기 끝 — 시리즈 상황 · 다음 우리 경기 / 포스트시즌 판으로 */
function PostBar({ label }: { label: string }) {
  const st = useSeason();
  const p = st.post;
  const nx = nextPostGame(p);
  const sr = p?.series.slice().reverse().find((x) => x.hi === ME.teamId || x.lo === ME.teamId);
  const short = (id: string) => teamById(id).short;
  return (
    <section className={s.end} aria-label="포스트시즌 다음">
      <p className={s.kicker}><span className="num">{yearOf(st)}</span> 포스트시즌 · {label}</p>
      {sr && (
        <div className={s.rec}>
          <Emblem team={teamById(ME.teamId)} size={30} />
          <p className={s.recMain}>
            <b>{SERIES_KO[sr.id]} {short(sr.hi)} <span className="num">{sr.wins[0]}</span> : <span className="num">{sr.wins[1]}</span> {short(sr.lo)}</b>
            <small>{p?.champion ? (p.champion === ME.teamId ? '한국시리즈 우승!' : `${short(p.champion)} 우승`) : sr.winner ? (sr.winner === ME.teamId ? '시리즈 승리 — 다음 단계로' : '시리즈 탈락') : '시리즈 진행 중'}</small>
          </p>
        </div>
      )}
      <div className={s.btns}>
        {nx?.mine
          ? <Button size="l" block icon="play" onClick={() => navigate(`/match?g=post&n=${p?.n ?? 0}`)}>다음 우리 경기 · {SERIES_KO[nx.series.id]} {nx.no}차전</Button>
          : <Button size="l" block icon="play" onClick={() => navigate('/season')}>포스트시즌 판으로</Button>}
      </div>
    </section>
  );
}

function SeasonBar({ idx }: { idx: number }) {
  const st = useSeason();
  const applied = st.next > idx;
  const me = teamById(ME.teamId);
  // 헤더 · 홈 · 순위 탭과 같은 값 (season/store 의 teamLine)
  const ln = teamLine(ME.teamId, st);
  const rec = ln.row;
  const rows = standingsOf(st);
  const day = allDays(st)[idx];
  const others = (st.results[idx] ?? []).filter((g) => g.a !== ME.teamId && g.h !== ME.teamId);
  const nx = applied ? nextMyGame() : null;
  const over = applied && isOver(st);
  const gb = rec.gb;
  return (
    <section className={s.end} aria-label="시즌 다음">
      <p className={s.kicker}><span className="num">{yearOf(st)}</span> 정규 시즌 · <span className="num">{ln.played}</span>경기째 · {day ? longDate(day.date) : ''}</p>
      <div className={s.rec}>
        <Emblem team={me} size={30} />
        <p className={s.recMain}>
          <b>{me.short} <span className="num">{rec.w}</span>승 <span className="num">{rec.d}</span>무 <span className="num">{rec.l}</span>패</b>
          <small>{applied ? <>{rankLabel(ln)} · {ln.rank === 1 ? (ln.tied ? '선두 경쟁' : '선두') : <>1위와 <span className="num">{gb.toFixed(1)}</span>경기</>} · 최근 {rec.last10.slice(0, 5).split('').map((c) => (c === 'W' ? '승' : c === 'L' ? '패' : '무')).join('')}</> : '오늘 결과를 넣는 중이에요…'}</small>
        </p>
      </div>
      {others.length > 0 && (
        <div className={s.others}>
          <p className={s.othersH}>오늘 다른 구장</p>
          <ul>
            {others.map((g, i) => (
              <li key={i}>
                {g.c ? <span className={s.rain}>{teamById(g.a).short} — {teamById(g.h).short} 비로 취소</span> : (
                  <>
                    <span className={g.s[0] > g.s[1] ? s.win : undefined}>{teamById(g.a).short}</span>
                    <b className="num">{g.s[0]}:{g.s[1]}</b>
                    <span className={g.s[1] > g.s[0] ? s.win : undefined}>{teamById(g.h).short}</span>
                    {g.wo && <em>끝내기</em>}
                    {g.inn && g.inn > 9 ? <em className="num">{g.inn}회</em> : null}
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className={s.btns}>
        {over ? (
          <Button size="l" block icon="arrow-right" onClick={() => navigate('/season')}>시즌 결과 보기</Button>
        ) : (
          <Button size="l" block icon="arrow-right" disabled={!applied || !nx} onClick={() => navigate(`/match?g=season&n=${Date.now()}`)}
            trailing={nx ? <span className="num">{shortDate(nx.day.date)}</span> : undefined}>
            {nx ? `다음 경기 — ${teamById(nx.home === ME.teamId ? nx.away : nx.home).short}전 · ${nx.home === ME.teamId ? '홈' : '원정'}` : '다음 경기'}
          </Button>
        )}
        <Button variant="secondary" onClick={() => navigate('/season')}>남은 시즌 빨리 감기</Button>
      </div>
      {nx && nx.rainedBefore > 0 && <p className={s.note}><Icon name="rain" size={13} /> 사이에 비로 취소되는 내 경기 <span className="num">{nx.rainedBefore}</span>개는 시즌 끝에 다시 해요.</p>}
    </section>
  );
}

function SeasonOver({ standalone }: { standalone?: boolean }) {
  const st = useSeason();
  const rows = standingsOf(st).slice(0, 5);
  return (
    <section className={[s.end, standalone && s.standalone].filter(Boolean).join(' ')} aria-label="시즌 끝">
      <p className={s.kicker}><span className="num">{yearOf(st)}</span> 정규 시즌</p>
      <h2 className={['head', s.overH].join(' ')}>정규 시즌이 끝났어요</h2>
      <ol className={s.final}>
        {rows.map((r) => (
          <li key={r.teamId} className={r.teamId === ME.teamId ? s.mine : undefined}>
            <span className="num">{r.rank}</span>
            <Emblem team={teamById(r.teamId)} size={20} />
            <b>{teamById(r.teamId).short}</b>
            <span className="num">{r.w}-{r.d}-{r.l}</span>
            <span className="num">{pctLabel(r)}</span>
          </li>
        ))}
      </ol>
      <div className={s.btns}>
        <Button size="l" block icon="play" onClick={() => navigate('/season')}>{st.post?.champion ? '시즌 결과 · 다음 시즌' : '포스트시즌 · 시즌 결과'}</Button>
      </div>
      {/* 다음 해로 — 리그 단계가 성적대로 오르내린다 */}
      <LeaguePanel endOnly />
    </section>
  );
}

function PvpBar({ end }: { end: PvpEnd }) {
  const after = end.ratingBefore + end.ratingDelta;
  return (
    <section className={s.end} aria-label="대전 결과">
      <p className={s.kicker}>비동기 대전{end.replay ? ' · 다시 보기' : ''}</p>
      <div className={s.rec}>
        <Emblem team={teamById(end.oppClub)} size={30} />
        <p className={s.recMain}>
          <b>{end.oppName} 감독의 {end.oppTeamName}에 <span className="num">{end.my}:{end.their}</span> {RES_KO[end.result]}</b>
          <small>레이팅 <span className="num">{fmt.int(end.ratingBefore)}</span> → <b className="num">{fmt.int(after)}</b> <em className={end.ratingDelta >= 0 ? s.up : s.down}>{fmt.signed(end.ratingDelta)}</em>
            {end.meRecord && <> · 내 전적 <span className="num">{end.meRecord.w}승 {end.meRecord.d}무 {end.meRecord.l}패</span></>}</small>
        </p>
      </div>
      {end.oppRecord && <p className={s.note}>{end.oppName} 감독 · <span className="num">{end.oppRecord.w}승 {end.oppRecord.d}무 {end.oppRecord.l}패</span> · 레이팅 <span className="num">{fmt.int(end.oppRecord.rating)}</span></p>}
      <div className={s.btns}>
        <Button size="l" block icon="arrow-right" onClick={() => navigate('/pvp')}>대전으로</Button>
        <Button variant="secondary" onClick={() => navigate('/pvp?tab=log')}>내 기록</Button>
      </div>
    </section>
  );
}

/**
 * 경기 끝 팝업 — 끝까지 본 시즌 · 포스트시즌 우리 경기에서 한 번: 점수 + 다음 우리 경기 → [닫기] [다음 경기 진행].
 * 다음 우리 경기가 없으면(정규 시즌 끝 · 포스트시즌 끝/탈락) [닫기] [홈으로]. 다음 경기는 아래 끝 줄(SeasonBar · PostBar)과 같은 계산.
 */
export function NextGameSheet({ ctx, final, awayId, homeId, open, onClose }: {
  ctx: MatchCtx; final: [number, number]; awayId: string; homeId: string; open: boolean; onClose: () => void;
}) {
  const st = useSeason();
  if (ctx.kind !== 'season' && ctx.kind !== 'post') return null;
  const meAway = awayId === ME.teamId;
  const my = meAway ? final[0] : final[1];
  const their = meAway ? final[1] : final[0];
  const res = my > their ? 'W' : my < their ? 'L' : 'D';
  const away = teamById(awayId), home = teamById(homeId);

  // 다음 우리 경기 — 시즌은 그날 결과가 들어간 뒤(applied)에 정한다
  let next: { label: string; go: () => void } | null = null;
  let none = '';
  let applied = true;
  let sub: ReactNode = null;
  if (ctx.kind === 'season') {
    applied = st.next > ctx.idx;
    const nx = applied ? nextMyGame() : null;
    const ln = teamLine(ME.teamId, st);
    sub = applied ? <><span className="num">{ln.row.w}</span>승 <span className="num">{ln.row.d}</span>무 <span className="num">{ln.row.l}</span>패 · {rankLabel(ln)}</> : '오늘 결과를 넣는 중이에요…';
    if (nx) {
      const opp = teamById(nx.home === ME.teamId ? nx.away : nx.home);
      next = { label: `${longDate(nx.day.date)} · ${opp.short}전 · ${nx.home === ME.teamId ? '홈' : '원정'}`, go: () => navigate(`/match?g=season&n=${Date.now()}`) };
    } else if (applied) none = isOver(st) ? '정규 시즌이 끝났어요. 최종 순위와 가을야구는 홈에서 확인해요.' : '남은 우리 경기가 없어요.';
  } else {
    const p = st.post;
    const nx = nextPostGame(p);
    sub = ctx.label;
    if (nx?.mine) next = { label: `${SERIES_KO[nx.series.id]} ${nx.no}차전`, go: () => navigate(`/match?g=post&n=${p?.n ?? 0}`) };
    else none = p?.champion ? (p.champion === ME.teamId ? '한국시리즈 우승! 올 시즌 우리 경기는 여기까지예요.' : '올 시즌 우리 경기는 여기까지예요.') : '남은 우리 경기가 없어요.';
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="경기 끝"
      sub={sub}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>닫기</Button>
          {next || !applied
            ? <Button icon="play" disabled={!applied || !next} onClick={() => { onClose(); next?.go(); }}>다음 경기 진행</Button>
            : <Button icon="home" onClick={() => { onClose(); navigate('/home'); }}>홈으로</Button>}
        </>
      }
    >
      <div className={s.ngScore} aria-label={`${away.short} ${final[0]} 대 ${home.short} ${final[1]}, ${RES_KO[res]}`}>
        <span className={s.ngTeam}><Emblem team={away} size={34} /><b>{away.short}</b></span>
        <b className={['num', s.ngNum].join(' ')}>{final[0]}<i>:</i>{final[1]}</b>
        <span className={s.ngTeam}><Emblem team={home} size={34} /><b>{home.short}</b></span>
      </div>
      <p className={[s.ngRes, s['ng' + res]].join(' ')}>{res === 'W' ? '승리' : res === 'L' ? '패배' : '무승부'}</p>
      {next ? (
        <div className={s.ngNext}>
          <small>다음 경기</small>
          <b>{next.label}</b>
        </div>
      ) : none ? <p className={s.ngNone}>{none}</p> : null}
    </Sheet>
  );
}

/** 경기 준비 중 (엔진 계산 · 기록 만들기) */
export function MatchLoading({ text, failed }: { text: string; failed?: boolean }) {
  return (
    <div className={s.loading} role="status">
      <span className={[s.ball, failed && s.stop].filter(Boolean).join(' ')} aria-hidden />
      <p>{text}</p>
      {failed && <Button variant="secondary" onClick={() => navigate('/home')}>홈으로</Button>}
    </div>
  );
}
