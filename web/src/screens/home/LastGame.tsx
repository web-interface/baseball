// 지난 경기 — 내 구단의 가장 최근 경기(저장된 시즌 진행): 이닝 점수판 · 승리 확률 흐름 · 명장면(누르면 강조 문구로 다시 보기) · 결정적 요인
// 점수판은 저장된 기록으로 바로 그리고, 흐름 · 명장면은 같은 경기를 엔진으로 다시 계산해 붙인다(같은 시드 · 같은 라인업이면 같은 경기).
// 개막 전(아직 경기 없음)에는 그리지 않는다.
import { useEffect, useMemo, useState } from 'react';
import { CalloutAnnouncer, CalloutStage, Icon, useCalloutQueue, type CalloutData } from '../../ui';
import { ClubEmblem } from '../../art/emblems';
import { ME, playerById, teamById } from '../../game/mock';
import { int } from '../../ui/format';
import type { MatchRecord, Play } from '../../game/types';
import { useSeason } from '../../season/store';
import { replayMyGame } from '../../season/run';
import { startTime } from '../../season/schedule';
import { paceOf, usePrefs } from '../settings/prefs';
import { lastMyRec, recordOf } from './local-mock';
import { WpChart } from './WpChart';
import s from './LastGame.module.css';

const halfKo = (p: Play) => `${p.inning}회${p.half === 'top' ? '초' : '말'}`;
const shortHalf = (p: Play) => `${p.inning}${p.half === 'top' ? '초' : '말'}`;

function toCallout(p: Play): CalloutData {
  const h = p.highlight!;
  const t = teamById(h.teamId);
  return {
    id: p.id + ':' + Date.now(),
    kind: h.kind,
    title: h.title,
    sub: h.sub,
    meta: h.meta,
    causes: p.causes?.map((c) => c.text),
    team: { primary: t.colors.primary, secondary: t.colors.secondary, ink: t.colors.ink },
  };
}

/** 같은 경기 다시 계산 — 한 번 계산한 경기는 기억 (시즌 시드 · 경기 순번) */
const replayCache = new Map<string, MatchRecord | null>();

export function LastGame() {
  const season = useSeason();
  const rec = lastMyRec(season);
  const key = rec ? `${season.seed}:${rec.idx}` : '';
  const [done, setDone] = useState(0); // 다시 계산이 끝나면 다시 그리기
  useEffect(() => {
    if (!rec || replayCache.has(key)) return;
    let alive = true;
    (async () => {
      let m: MatchRecord | null = null;
      try {
        const run = await replayMyGame(rec.idx);
        if (run) {
          const { fromEngine } = await import('../match/engine-game');
          const away = rec.home ? rec.opp : ME.teamId, home = rec.home ? ME.teamId : rec.opp;
          m = fromEngine(run, { id: `last-${key}`, date: rec.date, time: startTime(rec.date), awayId: away, homeId: home }).match;
        }
      } catch (e) {
        console.warn('[지난 경기] 다시 계산 못 함', e);
      }
      replayCache.set(key, m);
      if (alive) setDone((x) => x + 1);
    })();
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!rec) return null;
  void done;
  const full = replayCache.get(key) ?? null;
  return <LastGameView key={key} m={full ?? recordOf(rec)} rich={!!full} />;
}

function LastGameView({ m, rich }: { m: MatchRecord; rich: boolean }) {
  const away = teamById(m.awayId);
  const home = teamById(m.homeId);
  const prefs = usePrefs();
  const q = useCalloutQueue();
  const [active, setActive] = useState<string | null>(null);
  const highlights = useMemo(() => m.plays.filter((p) => p.highlight), [m]);
  const replay = (id: string) => {
    const p = highlights.find((x) => x.id === id);
    if (!p) return;
    setActive(id);
    q.clear();
    q.push(toCallout(p));
  };
  const decisive = m.keyFactors.find((f) => f.decisive) ?? m.keyFactors[0];
  const win = m.decision.win ? playerById(m.decision.win) : undefined;
  const loss = m.decision.loss ? playerById(m.decision.loss) : undefined;
  const save = m.decision.save ? playerById(m.decision.save) : undefined;
  const gw = m.decision.gwrbi ? playerById(m.decision.gwrbi) : undefined;
  const homeWon = m.final[1] > m.final[0];
  const draw = m.final[0] === m.final[1];
  const n = Math.max(9, m.line.away.innings.length, m.line.home.innings.length);
  const rows = [
    { t: away, line: m.line.away, won: !draw && !homeWon },
    { t: home, line: m.line.home, won: !draw && homeWon },
  ];
  const [, mo, d] = m.date.split('-').map(Number);
  const lastInn = m.line.home.innings.length;

  return (
    <section className={s.last} aria-labelledby="last-h">
      <header className={s.head}>
        <h2 id="last-h" className={s.h}>지난 경기</h2>
        <span className={s.meta}><span className="num">{mo}</span>월 <span className="num">{d}</span>일 · {m.stadium}{m.attendance ? <> · <span className="num">{int(m.attendance)}</span>명</> : null}</span>
      </header>

      <CalloutStage callout={q.current} pace={paceOf(prefs.watch)} onDone={() => { q.next(); }} noShake={!prefs.shake} className={s.stage}>
        <table className={s.score} aria-label={`${away.short} ${m.final[0]} 대 ${home.short} ${m.final[1]}${m.walkoff ? `, ${lastInn}회말 끝내기` : ''}`}>
          <thead>
            <tr>
              <th scope="col" className={s.teamCol}><span className="sr-only">구단</span></th>
              {Array.from({ length: n }, (_, i) => <th key={i} scope="col" className="num">{i + 1}</th>)}
              <th scope="col" className={['num', s.r].join(' ')}>R</th>
              <th scope="col" className="num">H</th>
              <th scope="col" className="num">E</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ t, line, won }, ri) => (
              <tr key={t.id} className={won ? s.won : undefined}>
                <th scope="row" className={s.teamCol}>
                  <span className={s.teamIn}><ClubEmblem team={t} size={18} decorative /><span>{t.short}</span></span>
                </th>
                {Array.from({ length: n }, (_, i) => {
                  const v = line.innings[i];
                  const wo = m.walkoff && ri === 1 && i === lastInn - 1;
                  return (
                    <td key={i} className={['num', v ? s.scored : '', wo ? s.walkoff : ''].join(' ')} title={wo ? '끝내기' : undefined}>
                      {v ?? 'x'}
                    </td>
                  );
                })}
                <td className={['num', s.r].join(' ')}>{line.r}</td>
                <td className="num">{line.h}</td>
                <td className="num">{line.e}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={s.result}>
          <b>{draw ? '무승부' : `${homeWon ? home.short : away.short} 승`}</b>
          {m.walkoff && <span className={s.wo}>{lastInn}회말 끝내기</span>}
          <span className={s.dec}>
            {win && <>승 {win.name}</>}{loss && <> · 패 {loss.name}</>}{save && <> · 세 {save.name}</>}{gw && <> · 결승타 {gw.name}</>}
          </span>
        </p>
        {rich && m.plays.length > 0 && (
          <div className={s.chart}>
            <WpChart
              plays={m.plays}
              homeShort={home.short}
              awayShort={away.short}
              marks={highlights.map((p) => p.id)}
              active={active}
              onPick={replay}
              markLabel={(p) => shortHalf(p)}
            />
          </div>
        )}
      </CalloutStage>
      <CalloutAnnouncer callout={q.current} />

      {highlights.length > 0 && (
        <ol className={s.moments} aria-label="명장면 — 누르면 다시 보기">
          {highlights.map((p) => (
            <li key={p.id}>
              <button type="button" className={[s.moment, active === p.id && s.momentOn].filter(Boolean).join(' ')} onClick={() => replay(p.id)}>
                <span className={s.inn}>{halfKo(p)}</span>
                <span className={s.mText}>
                  <b>{p.highlight!.title}</b>
                  <small>{p.highlight!.sub.split(' · ').slice(1).join(' · ') || p.highlight!.sub}</small>
                </span>
                <span className={s.mMeta}>{p.highlight!.meta?.split(' · ')[0]}</span>
                <Icon name="play" size={13} className={s.mPlay} />
              </button>
            </li>
          ))}
        </ol>
      )}

      {decisive && (
        <p className={s.factor}>
          <span>결정적 요인</span>
          ↳ {decisive.text}
        </p>
      )}
    </section>
  );
}
