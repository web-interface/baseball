// 1단계 — 구단 고르기: 10개 구단(엠블럼·연고·홈구장·팀 컬러·성향·난이도)
import type { CSSProperties } from 'react';
import { Button, Field, Icon } from '../../ui';
import { ClubCrest, ClubEmblem } from '../../art/emblems';
import { TEAMS, teamById } from '../../game/mock';
import { REGION_GROUPS } from '../../game/world';
import type { Team } from '../../game/types';
import { DIFF_KO, TIER_KO, clubTip } from './local-mock';
import type { StepProps } from './index';
import s from './cs.module.css';
import c from './StepClub.module.css';

const yy = (y: number) => `’${String(y).slice(2)}`;

function ClubDetail({ t }: { t: Team }) {
  const rival = TEAMS.find((x) => x.code === t.rival)!;
  const st = t.stadium;
  const walls = st.wallM.map((m, i) => (m >= 4 ? `${['좌측', '가운데', '우측'][i]} 담장 ${m}m` : null)).filter(Boolean);
  const feats = [
    st.roof === 'dome' ? '돔' : '개방형',
    st.surface === 'turf' ? '인조잔디' : '천연잔디',
    st.foul === 'wide' ? '파울 지역 넓음' : st.foul === 'narrow' ? '파울 지역 좁음' : '파울 지역 보통',
    ...walls,
  ];
  const vars = { '--c1': t.colors.primary, '--c2': t.colors.secondary, '--c3': t.colors.accent } as CSSProperties;
  return (
    <article className={c.detail} style={vars} aria-label={`${t.name} 소개`}>
      <div className={c.hero}>
        <span className={c.glow} aria-hidden />
        <ClubCrest team={t} size={96} className={c.crest} />
        <div className={c.heroText}>
          <p className={c.region}>{t.region} · {t.zone}</p>
          <h2 className={c.name}>{t.name}</h2>
          <p className={c.style}>{t.style}</p>
          <p className={c.styleDesc}>{t.styleDesc}</p>
        </div>
      </div>

      <dl className={c.facts}>
        <div>
          <dt>전력</dt>
          <dd>{TIER_KO[t.tier]}</dd>
        </div>
        <div>
          <dt>난이도</dt>
          <dd>
            <span className={c.diff} aria-hidden>{[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= t.difficulty ? c.on : undefined} />)}</span>
            {DIFF_KO[t.difficulty]}
          </dd>
        </div>
        <div>
          <dt>우승</dt>
          <dd><b className="num">{t.titles.length}</b>회</dd>
        </div>
        <div>
          <dt>창단</dt>
          <dd className="num">{t.founded}</dd>
        </div>
      </dl>
      {t.titles.length > 0 && <p className={c.titles}><span className="num">{t.titles.map(yy).join('  ')}</span></p>}

      <div className={c.colors} aria-label="팀 컬러">
        {(['primary', 'secondary', 'accent'] as const).map((k) => (
          <span key={k} className={c.swatch}>
            <i style={{ background: t.colors[k] }} />
            <span>
              <b>{t.colorNames[k]}</b>
              <small className="num">{t.colors[k].toUpperCase()}</small>
            </span>
          </span>
        ))}
      </div>

      <div className={c.park}>
        <div className={c.parkField} aria-hidden>
          <Field stadium={st} distances={false} label={st.name} />
        </div>
        <div className={c.parkText}>
          <p className={c.parkName}><Icon name="stadium" size={16} /> {st.name}</p>
          <p className={c.parkDesc}>{st.desc}</p>
          <p className={c.fence}>
            <span>좌 <b className="num">{st.fence[0]}</b></span>
            <span>중 <b className="num">{st.fence[1]}</b></span>
            <span>우 <b className="num">{st.fence[2]}</b></span>
            <small>m</small>
          </p>
          <p className={c.feats}>{feats.join(' · ')}</p>
          <p className={c.note}>↳ {st.note}</p>
        </div>
      </div>

      <div className={c.rival}>
        <ClubEmblem team={rival} size={28} decorative />
        <span><b>{t.rivalry}</b> — 라이벌 {rival.name}</span>
      </div>
      <p className={c.mascot}><span>마스코트</span>{t.mascot}</p>
      <p className={c.tip}>{clubTip(t)}</p>
    </article>
  );
}

export function StepClub({ st, set, go, Dock }: StepProps) {
  const t = teamById(st.club);
  const order = REGION_GROUPS.flatMap((g) => g.clubs.map((code) => TEAMS.find((x) => x.code === code)!));
  return (
    <>
      <header className={s.head}>
        <p className={s.kicker}><span className="num">2027</span> 시즌 · 한별 리그 10개 구단</p>
        <h1 className={s.title}>함께할 구단을 고르세요</h1>
        <p className={s.lead}>처음 한 번만 정해요. 고른 구단에서 선수 3명을 바로 데려와요.</p>
      </header>

      <div className={c.grid} role="radiogroup" aria-label="구단">
        {order.map((x) => {
          const on = x.id === t.id;
          return (
            <button
              key={x.id}
              type="button"
              role="radio"
              aria-checked={on}
              className={[c.cell, on && c.cellOn].filter(Boolean).join(' ')}
              style={{ ['--c1' as string]: x.colors.primary }}
              onClick={() => set({ club: x.id })}
            >
              <ClubEmblem team={x} size={34} decorative />
              <b>{x.short}</b>
              <small>{x.region}</small>
            </button>
          );
        })}
      </div>

      <ClubDetail t={t} />

      <Dock note={<><ClubEmblem team={t} size={22} decorative /><span><b>{t.name}</b><small>{TIER_KO[t.tier]} · 난이도 {DIFF_KO[t.difficulty]}</small></span></>}>
        <Button size="l" onClick={() => go('draft')} trailing={<Icon name="arrow-right" size={18} />}>이 구단으로</Button>
      </Dock>
    </>
  );
}
