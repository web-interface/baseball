// 어제 경기 — 이닝 점수판 · 승리 확률 흐름 · 명장면(누르면 강조 문구로 다시 보기) · 오늘의 결정적 요인
import { useState } from 'react';
import { CalloutAnnouncer, CalloutStage, Icon, useCalloutQueue, type CalloutData } from '../../ui';
import { ClubEmblem } from '../../art/emblems';
import { playerById, teamById } from '../../game/mock';
import { int } from '../../ui/format';
import type { Play } from '../../game/types';
import { paceOf, usePrefs } from '../settings/prefs';
import { HIGHLIGHTS, LAST } from './local-mock';
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

export function LastGame() {
  const m = LAST;
  const away = teamById(m.awayId);
  const home = teamById(m.homeId);
  const prefs = usePrefs();
  const q = useCalloutQueue();
  const [active, setActive] = useState<string | null>(null);
  const replay = (id: string) => {
    const p = HIGHLIGHTS.find((x) => x.id === id);
    if (!p) return;
    setActive(id);
    q.clear();
    q.push(toCallout(p));
  };
  const decisive = m.keyFactors.find((f) => f.decisive) ?? m.keyFactors[0];
  const win = playerById(m.decision.win);
  const loss = playerById(m.decision.loss);
  const gw = m.decision.gwrbi ? playerById(m.decision.gwrbi) : undefined;
  const homeWon = m.final[1] > m.final[0];
  const rows = [
    { t: away, line: m.line.away, won: !homeWon },
    { t: home, line: m.line.home, won: homeWon },
  ];
  const [, mo, d] = m.date.split('-').map(Number);

  return (
    <section className={s.last} aria-labelledby="last-h">
      <header className={s.head}>
        <h2 id="last-h" className={s.h}>어제 경기</h2>
        <span className={s.meta}><span className="num">{mo}</span>월 <span className="num">{d}</span>일 · {m.stadium} · <span className="num">{int(m.attendance)}</span>명</span>
      </header>

      <CalloutStage callout={q.current} pace={paceOf(prefs.watch)} onDone={() => { q.next(); }} noShake={!prefs.shake} className={s.stage}>
        <table className={s.score} aria-label={`${away.short} ${m.final[0]} 대 ${home.short} ${m.final[1]}${m.walkoff ? ', 9회말 끝내기' : ''}`}>
          <thead>
            <tr>
              <th scope="col" className={s.teamCol}><span className="sr-only">구단</span></th>
              {Array.from({ length: 9 }, (_, i) => <th key={i} scope="col" className="num">{i + 1}</th>)}
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
                {line.innings.map((v, i) => {
                  const wo = m.walkoff && ri === 1 && i === line.innings.length - 1;
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
          <b>{homeWon ? home.short : away.short} 승</b>
          {m.walkoff && <span className={s.wo}>9회말 끝내기</span>}
          <span className={s.dec}>
            승 {win?.name} · 패 {loss?.name}{gw && <> · 결승타 {gw.name}</>}
          </span>
        </p>
        <div className={s.chart}>
          <WpChart
            plays={m.plays}
            homeShort={home.short}
            awayShort={away.short}
            marks={HIGHLIGHTS.map((p) => p.id)}
            active={active}
            onPick={replay}
            markLabel={(p) => shortHalf(p)}
          />
        </div>
      </CalloutStage>
      <CalloutAnnouncer callout={q.current} />

      <ol className={s.moments} aria-label="명장면 — 누르면 다시 보기">
        {HIGHLIGHTS.map((p) => (
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

      {decisive && (
        <p className={s.factor}>
          <span>결정적 요인</span>
          ↳ {decisive.text}
        </p>
      )}
    </section>
  );
}
