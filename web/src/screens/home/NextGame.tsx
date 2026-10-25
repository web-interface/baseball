// 다음 경기 — 시각 · 상대 · 승리 예상 · 예상 선발 · 오늘의 구장(담장·바람) · 날씨 예보
import { Button, Field, Icon, type IconName } from '../../ui';
import { ClubEmblem } from '../../art/emblems';
import { PlayerArt } from '../../art/PlayerArt';
import { navigate } from '../../app/router';
import { polarToField } from '../../game/field';
import type { Player, Team, Weather } from '../../game/types';
import { clubLine, nextGameView, pitchLine } from './local-mock';
import { longDate } from '../../season/schedule';
import { useSeason } from '../../season/store';
import { condsText } from '../../game/weatherFit';
import s from './NextGame.module.css';

const SKY_ICON: Record<Weather['sky'], IconName> = {
  clear: 'sun', 'night-clear': 'moon', cloudy: 'cloud', overcast: 'cloud', drizzle: 'rain', rain: 'rain',
};

/** 바람 방향 (0 = 중견 쪽, −45 = 3루 선) — in 은 거꾸로 */
const WIND_ANGLE: Record<Weather['windTo'], number | null> = {
  'out-lf': -28, 'out-cf': 0, 'out-rf': 28, 'in-lf': -28, 'in-cf': 0, 'in-rf': 28, 'cross-l': -90, 'cross-r': 90, calm: null,
};

/** 위에서 본 구장 위 바람 줄 3개 (0~400 좌표) */
function WindStreaks({ w }: { w: Weather }) {
  const ang = WIND_ANGLE[w.windTo];
  if (ang == null) return null;
  const P = (p: { x: number; y: number }) => `${(p.x * 400).toFixed(1)} ${(p.y * 400).toFixed(1)}`;
  const lines: { d: string; head: string }[] = [];
  const mk = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = (b.x - a.x) * 400, dy = (b.y - a.y) * 400;
    const l = Math.hypot(dx, dy) || 1;
    const ux = dx / l, uy = dy / l;
    const hx = b.x * 400, hy = b.y * 400;
    const head = `M${(hx - ux * 16 - uy * 9).toFixed(1)} ${(hy - uy * 16 + ux * 9).toFixed(1)}L${hx.toFixed(1)} ${hy.toFixed(1)}L${(hx - ux * 16 + uy * 9).toFixed(1)} ${(hy - uy * 16 - ux * 9).toFixed(1)}`;
    lines.push({ d: `M${P(a)}L${P(b)}`, head });
  };
  if (Math.abs(ang) === 90) {
    const dir = ang > 0 ? 1 : -1;
    [0.36, 0.5, 0.64].forEach((y, i) => mk({ x: 0.5 - dir * (0.26 - i * 0.03), y }, { x: 0.5 + dir * (0.26 - i * 0.03), y }));
  } else {
    const inward = w.windTo.startsWith('in');
    [-9, 0, 9].forEach((off, i) => {
      const a = polarToField(ang + off, inward ? 108 - i * 4 : 40 + i * 6);
      const b = polarToField(ang + off, inward ? 50 + i * 6 : 100 - i * 4);
      mk(a, b);
    });
  }
  return (
    <g className={s.wind}>
      {lines.map((l, i) => (
        <g key={i} style={{ animationDelay: `${i * -0.4}s` }}>
          <path d={l.d} className={s.windLine} />
          <path d={l.head} className={s.windHead} />
        </g>
      ))}
    </g>
  );
}

function Starter({ p, team, label }: { p?: Player; team: Team; label: string }) {
  const ln = pitchLine(p);
  if (!p) return null;
  return (
    <div className={s.starter}>
      <span className={s.face}><PlayerArt player={p} team={team} variant="mini" /></span>
      <span className={s.starterText}>
        <small>{label}</small>
        <b>{p.name}</b>
        {ln && (ln.first ? (
          <span className={s.pline}>시즌 첫 등판</span>
        ) : (
          <span className={s.pline}>
            <span className="num">{ln.w}</span>승 <span className="num">{ln.l}</span>패
            <i aria-hidden>·</i>
            <span className="num">{ln.era}</span>
          </span>
        ))}
      </span>
    </div>
  );
}

/** inHub — 경기 준비·진행(#/season) 안에 놓일 때: 빨리 감기 버튼은 그 화면에 따로 있어서 뺀다 */
export function NextGame({ inHub = false }: { inHub?: boolean }) {
  const season = useSeason(); // 시즌 진행이 바뀌면 다시 그린다
  const g = nextGameView();
  const myLine = clubLine(g.me.id, season);
  const gameNo = g.over ? '정규 시즌 끝' : g.opener ? '개막전' : myLine.played === 0 ? '첫 경기' : `${myLine.nextNo}번째 경기`;
  const rec = (ln: typeof myLine) => `${ln.started ? `${ln.rank}위 · ` : ''}${ln.row.w}-${ln.row.d}-${ln.row.l}`;
  const w = g.weather;
  const st = g.venue;
  const wpMine = Math.round(g.wp * 100);
  const wallNote = st.wallM.map((m, i) => (m >= 5 ? `${['좌측', '가운데', '우측'][i]} ${m}m 벽` : null)).filter(Boolean).join(' · ');

  return (
    <section className={s.next} aria-labelledby="next-h">
      <header className={s.head}>
        <h2 id="next-h" className={s.h}>다음 경기</h2>
        {g.over && <p className={s.count}>정규 시즌 끝</p>}
      </header>

      <div className={s.board}>
        <div className={s.when}>
          <b className={['num-display', s.time].join(' ')} aria-label={g.time}>
            {g.time.split('').map((ch, i) => <span key={i} className={ch === ':' ? s.colon : s.digit} aria-hidden>{ch}</span>)}
          </b>
          <p className={s.whenText}>
            <span>{g.over ? '시즌 끝' : longDate(g.date)} · {g.isHome ? '홈' : '원정'}</span>
            <span>{gameNo} · {st.name}</span>
          </p>
        </div>

        <div className={s.match}>
          <div className={s.side}>
            <ClubEmblem team={g.me} size={40} className={s.em} decorative />
            <b>{g.me.short}</b>
            <small className="num">{rec(myLine)}</small>
          </div>
          <div className={s.vs}>
            <span>VS</span>
            <small>맞대결 <span className="num">{g.h2h.w}-{g.h2h.d}-{g.h2h.l}</span></small>
          </div>
          <div className={[s.side, s.away].join(' ')}>
            <ClubEmblem team={g.opp} size={40} className={s.em} decorative />
            <b>{g.opp.short}</b>
            <small className="num">{rec(g.oppLine)}</small>
          </div>
        </div>

        <div className={s.wp} role="img" aria-label={`승리 예상 ${g.me.short} ${wpMine}%, ${g.opp.short} ${100 - wpMine}%`}>
          <span className={s.wpNum}><b className="num">{wpMine}</b>%</span>
          <span className={s.wpBar} aria-hidden>
            <i className={s.wpMine} style={{ width: `${wpMine}%` }} />
            <i className={s.wpOpp} />
          </span>
          <span className={[s.wpNum, s.wpNumOpp].join(' ')}><b className="num">{100 - wpMine}</b>%</span>
          <small className={s.wpLabel} title="팀 종합 · 상대 전력 · 홈 이점">승리 예상</small>
        </div>
      </div>

      <div className={s.starters}>
        <Starter p={g.mine} team={g.me} label="우리 선발" />
        <Starter p={g.theirs} team={g.opp} label={`${g.opp.short} 선발`} />
      </div>

      <div className={s.venue}>
        <div className={s.mini} aria-hidden>
          <Field stadium={st} distances={false} scenery={false} svg={<WindStreaks w={w} />} label={`${st.name} 위에서 본 모습`} />
        </div>
        <ul className={s.wx} aria-label="날씨 예보">
          <li>
            <Icon name={SKY_ICON[w.sky]} size={17} />
            <span>{w.skyKo} <b className="num">{w.tempC}°</b> <small>습도 <span className="num">{w.humidity}</span>%</small></span>
          </li>
          <li>
            <Icon name="wind" size={17} />
            <span>{w.windKo} <b className="num">{w.windMps}</b><small>m/s</small></span>
          </li>
          <li>
            <Icon name="rain" size={17} />
            <span>비 <b className="num">{w.rainPct}</b><small>%</small></span>
          </li>
          {w.effects.slice(0, 1).map((e) => <li key={e} className={s.cause}>↳ {e}</li>)}
          {g.wx && g.wx.conds.length > 0 && (g.wx.good.length > 0 || g.wx.bad.length > 0) && (
            <li className={s.fit}>
              <span className={s.fitHead}>날씨 궁합 <small>{condsText(g.wx.conds)}</small></span>
              {g.wx.good.length > 0 && <span className={s.fitGood}>+ {g.wx.good.map((p) => p.name).join(' · ')}</span>}
              {g.wx.bad.length > 0 && <span className={s.fitBad}>− {g.wx.bad.map((p) => p.name).join(' · ')}</span>}
            </li>
          )}
          <li className={s.park} title={st.note}>
            <span className="num">{st.fence[0]}·{st.fence[1]}·{st.fence[2]}</span>m{wallNote && <> · {wallNote}</>}
          </li>
        </ul>
      </div>

      <div className={s.cta}>
        {g.over
          ? <Button size="l" block icon="arrow-right" onClick={() => navigate('/season')}>시즌 결과</Button>
          : <Button size="l" block icon="play" onClick={() => navigate('/match?g=season')}>경기 시작</Button>}
        <Button size="l" variant="secondary" onClick={() => navigate('/lineup')}>라인업</Button>
        {!inHub && <Button size="l" variant="ghost" icon="fast" className={s.ff} onClick={() => navigate('/season')}>빨리 감기</Button>}
      </div>
    </section>
  );
}
