// 포스트시즌 판 — 정규 시즌이 끝나면: KBO 방식 대진(WC → 준PO → PO → KS) · 시리즈 승수 · 차전 결과 · 다음 경기.
// 내 구단 경기는 경기 화면에서 이닝별로 끝까지 봐야 넘어가고, 다른 구단 경기는 바로 계산한다.
// 우리 경기는 '가을야구 출사표' 인터뷰를 끝내야 할 수 있다 (사용자 지시 10-25) — 다른 구단 경기는 그대로.
import { useState } from 'react';
import { navigate } from '../../app/router';
import { Button, Emblem, useToast } from '../../ui';
import { ME, teamById } from '../../game/mock';
import { postIvGate, usePress } from '../../game/press';
import { InterviewSheet } from '../press';
import { shortDate } from '../../season/schedule';
import { isOver, useSeason, yearOf } from '../../season/store';
import { BASE_GAMES, SERIES_KO, SERIES_ORDER, nextPostGame, playOtherPostGame, playOthersUntilMine, startPost, stillAlive, type SeriesId, type SeriesRec } from '../../season/post';
import s from './PostPanel.module.css';

const short = (id: string) => teamById(id).short;
const FORMAT: Record<SeriesId, string> = {
  wc: '최대 2경기',
  spo: '5전 3선승',
  po: '5전 3선승',
  ks: '7전 4선승',
};

function SeriesRow({ sr, live }: { sr?: SeriesRec; live: boolean; id: SeriesId }) {
  if (!sr) return null;
  const mine = sr.hi === ME.teamId || sr.lo === ME.teamId;
  return (
    <div className={[s.series, live && s.live, mine && s.mine].filter(Boolean).join(' ')}>
      <div className={s.sHead}>
        <b>{SERIES_KO[sr.id]}</b>
        <small>{FORMAT[sr.id]}</small>
      </div>
      <div className={s.vs}>
        {([sr.hi, sr.lo] as const).map((id, i) => (
          <span key={id} className={[s.team, sr.winner === id && s.win, sr.winner && sr.winner !== id && s.lose].filter(Boolean).join(' ')}>
            <Emblem team={teamById(id)} size={22} />
            <b>{short(id)}</b>
            <span className={['num', s.w].join(' ')}>{sr.wins[i]}</span>
          </span>
        ))}
      </div>
      {sr.games.length > 0 && (
        <ol className={s.games}>
          {sr.games.map((g) => {
            const w = g.s[0] > g.s[1] ? g.away : g.s[1] > g.s[0] ? g.home : null;
            return (
              <li key={g.no} className={g.mine ? s.gMine : undefined}>
                <span className="num">{g.no}차전</span>
                <span className="num">{shortDate(g.date)}</span>
                <span>{short(g.away)} <b className="num">{g.s[0]}</b> : <b className="num">{g.s[1]}</b> {short(g.home)}{g.inn > 9 ? <small className="num"> ({g.inn}회)</small> : null}</span>
                <em>{w ? `${short(w)} 승` : '무'}</em>
              </li>
            );
          })}
        </ol>
      )}
      {sr.id === 'wc' && <p className={s.note}>4위 1승 안고 시작</p>}
      {sr.draws > 0 && sr.id !== 'wc' && <p className={s.note} title={`기본 ${BASE_GAMES[sr.id]}경기에서 늘어날 수 있어요`}>무승부 {sr.draws}</p>}
    </div>
  );
}

export function PostPanel() {
  const season = useSeason();
  const press = usePress();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [ivOpen, setIvOpen] = useState(false);
  if (!isOver(season)) return null;
  const post = season.post;
  const year = yearOf(season);

  if (!post) {
    return (
      <section className={s.panel} aria-label="포스트시즌">
        <p className={s.kicker}><span className="num">{year}</span> 포스트시즌</p>
        <h3 className={s.title}>가을야구</h3>
        <p className={s.lead}>정규 시즌 1~5위가 나가요</p>
        <Button size="l" block icon="play" onClick={() => startPost()}>포스트시즌 시작</Button>
      </section>
    );
  }

  const nx = nextPostGame(post);
  const alive = stillAlive(post);
  const gate = nx?.mine ? postIvGate(season, press.saved) : null;
  const run = async (f: () => Promise<unknown>) => { setBusy(true); try { await f(); } finally { setBusy(false); } };

  return (
    <section className={s.panel} aria-label="포스트시즌">
      <p className={s.kicker}><span className="num">{year}</span> 포스트시즌</p>
      {post.champion ? (
        <div className={[s.champ, post.champion === ME.teamId && s.champMine].filter(Boolean).join(' ')}>
          <Emblem team={teamById(post.champion)} size={44} />
          <div>
            <small><span className="num">{year}</span> 한국시리즈 우승</small>
            <b>{teamById(post.champion).name}</b>
            {post.champion === ME.teamId && <em>우리 구단 우승!</em>}
          </div>
        </div>
      ) : (
        <h3 className={s.title}>{nx ? `${SERIES_KO[nx.series.id]} ${nx.no}차전` : '가을야구'}</h3>
      )}

      {nx && (
        <div className={s.next}>
          <p>
            <span className="num">{shortDate(nx.date)}</span> · {short(nx.away)} vs {short(nx.home)} <small>({short(nx.home)} 홈)</small>
            {nx.mine && <b className={s.mineTag}>우리 경기</b>}
          </p>
          {nx.mine && gate ? (
            <div className={s.gate}>
              <p><b>{gate.title}</b> 인터뷰를 마쳐야 우리 경기를 할 수 있어요</p>
              <Button size="l" block icon="play" onClick={() => setIvOpen(true)}>인터뷰 하기</Button>
              <InterviewSheet m={gate} open={ivOpen} onClose={() => setIvOpen(false)} />
            </div>
          ) : nx.mine ? (
            <Button size="l" block icon="play" onClick={() => navigate('/match?g=post')}>우리 경기 보기</Button>
          ) : (
            <div className={s.btns}>
              <Button size="l" block icon="fast" disabled={busy} onClick={() => run(async () => {
                const g = await playOtherPostGame();
                if (g) toast({ text: `${g.no}차전 ${short(g.away)} ${g.s[0]} : ${g.s[1]} ${short(g.home)}`, tone: 'info' });
              })}>다음 경기 결과</Button>
              <Button variant="secondary" disabled={busy} onClick={() => run(() => playOthersUntilMine())}>{alive ? '우리 경기까지' : '끝까지'}</Button>
            </div>
          )}
        </div>
      )}
      {!post.seeds.includes(ME.teamId) && <p className={s.lead}>이번 가을야구엔 못 나갔어요</p>}

      <div className={s.bracket}>
        {SERIES_ORDER.slice().reverse().map((id) => {
          const sr = post.series.find((x) => x.id === id);
          return <SeriesRow key={id} id={id} sr={sr} live={!!sr && !sr.winner} />;
        })}
      </div>
      <p className={s.seeds}>정규 시즌 {post.seeds.map((id, i) => `${i + 1}위 ${short(id)}`).join(' · ')}</p>
    </section>
  );
}
