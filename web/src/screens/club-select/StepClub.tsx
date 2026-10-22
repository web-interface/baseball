// 1단계 — 구단 고르기: 지금 구단 10개(엠블럼·연고·홈구장·팀 컬러·성향·난이도) + 옛 구단 10개(없어진 구단 · 이름이 바뀌기 전 시대)
// 옛 구단을 고르면 2027 리그에서 같은 연고 계보의 지금 구단 자리를 대신해 '부활 구단'으로 뛴다 (game/mock applyRevival).
import type { CSSProperties } from 'react';
import { Button, Field, Icon } from '../../ui';
import { ClubCrest, ClubEmblem } from '../../art/emblems';
import { CURRENT_TEAMS, OLD_TEAMS, teamByCode, teamById } from '../../game/mock';
import { CURRENT_SEASON, LINEAGE, REGION_GROUPS } from '../../game/world';
import type { Team } from '../../game/types';
import { DIFF_KO, TIER_KO, clubTip } from './local-mock';
import type { StepProps } from './index';
import s from './cs.module.css';
import c from './StepClub.module.css';

const yy = (y: number) => `’${String(y).slice(2)}`;
const eraTag = (t: Team) => (t.era ? `${yy(t.era[0])}–${t.era[1] >= CURRENT_SEASON ? '' : yy(t.era[1])}` : '');

/** 계보 — 이어진 구단 줄 (둘 이상일 때만) */
function Lineage({ t }: { t: Team }) {
  const line = LINEAGE.find((l) => l.includes(t.code));
  if (!line || line.length < 2) return null;
  return (
    <div className={c.lineage} aria-label="구단 계보">
      <span className={c.lineageHead}>계보</span>
      <ol>
        {line.map((code) => {
          const x = teamByCode(code);
          return (
            <li key={code} className={code === t.code ? c.lineOn : undefined}>
              <ClubEmblem team={x} size={20} decorative />
              <span>{x.name}</span>
              <small className="num">{eraTag(x)}</small>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ClubDetail({ t }: { t: Team }) {
  const rival = teamByCode(t.rival);
  const slot = t.revives ? teamByCode(t.revives) : undefined;
  const st = t.stadium;
  const walls = st.wallM.map((m, i) => (m >= 4 ? `${['좌측', '가운데', '우측'][i]} 담장 ${m}m` : null)).filter(Boolean);
  const feats = [
    st.roof === 'dome' ? '돔' : '개방형',
    st.surface === 'turf' ? '인조잔디' : '천연잔디',
    st.foul === 'wide' ? '파울 지역 넓음' : st.foul === 'narrow' ? '파울 지역 좁음' : '파울 지역 보통',
    ...walls,
  ];
  const homes = t.homes && t.homes.length > 1 ? t.homes.map((h) => `${h.from}~${String(h.to).slice(2)} ${h.region}`).join(' · ') : null;
  const vars = { '--c1': t.colors.primary, '--c2': t.colors.secondary, '--c3': t.colors.accent } as CSSProperties;
  return (
    <article className={c.detail} style={vars} aria-label={`${t.name} 소개`}>
      <div className={c.hero}>
        <span className={c.glow} aria-hidden />
        <ClubCrest team={t} size={96} className={c.crest} />
        <div className={c.heroText}>
          <p className={c.region}>{t.old ? `옛 구단 · ${homes ?? t.region}` : `${t.region} · ${t.zone}`}</p>
          <h2 className={c.name}>{t.name}</h2>
          <p className={c.style}>{t.style}</p>
          <p className={c.styleDesc}>{t.old ? t.blurb : t.styleDesc}</p>
        </div>
      </div>

      {slot && (
        <div className={c.revive}>
          <span className={c.reviveTag}>2027 부활</span>
          <p>
            2027 시즌엔 <b>{slot.name}</b> 자리를 대신해 리그에 돌아와요 — 홈구장 {st.name}, 리그는 그대로 10개 구단.
          </p>
          <span className={c.reviveSwap} aria-hidden>
            <ClubEmblem team={slot} size={22} decorative />
            <Icon name="arrow-right" size={14} />
            <ClubEmblem team={t} size={26} decorative />
          </span>
        </div>
      )}

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
          <dt>{t.old ? '뛴 해' : '창단'}</dt>
          <dd className="num">{t.old && t.era ? `${yy(t.era[0])}–${yy(t.era[1])}` : t.founded}</dd>
        </div>
      </dl>
      {t.titles.length > 0 && <p className={c.titles}><span className="num">{t.titles.map(yy).join('  ')}</span></p>}

      <Lineage t={t} />

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

function ClubCell({ x, on, onPick, old }: { x: Team; on: boolean; onPick: () => void; old?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      aria-label={`${x.name}${old ? ` ${eraTag(x)}` : ''}`}
      className={[c.cell, on && c.cellOn].filter(Boolean).join(' ')}
      style={{ ['--c1' as string]: x.colors.primary }}
      onClick={onPick}
    >
      <ClubEmblem team={x} size={34} decorative />
      <b>{x.short}</b>
      <small>{old ? <>{x.name.split(' ')[0]} <span className="num">{eraTag(x)}</span></> : x.region}</small>
    </button>
  );
}

export function StepClub({ st, set, go, Dock }: StepProps) {
  const t = teamById(st.club);
  const order = REGION_GROUPS.flatMap((g) => g.clubs.map((code) => CURRENT_TEAMS.find((x) => x.code === code)!));
  return (
    <>
      <header className={s.head}>
        <p className={s.kicker}><span className="num">2027</span> 시즌 · 한별 리그 10개 구단 + 옛 구단 10개</p>
        <h1 className={s.title}>함께할 구단을 고르세요</h1>
        <p className={s.lead}>처음 한 번만 정해요. 고른 구단에서 선수 3명을 바로 데려와요.</p>
      </header>

      <div className={c.grid} role="radiogroup" aria-label="지금 구단">
        {order.map((x) => <ClubCell key={x.id} x={x} on={x.id === t.id} onPick={() => set({ club: x.id })} />)}
      </div>

      <div className={c.oldHead}>
        <h2>옛 구단 <small>없어진 구단 · 지금 이름이 되기 전 시대</small></h2>
        <p>고르면 2027 시즌에 같은 연고 계보의 지금 구단 자리를 대신해 <b>부활 구단</b>으로 뛰어요.</p>
      </div>
      <div className={[c.grid, c.oldGrid].join(' ')} role="radiogroup" aria-label="옛 구단">
        {OLD_TEAMS.map((x) => <ClubCell key={x.id} x={x} on={x.id === t.id} onPick={() => set({ club: x.id })} old />)}
      </div>

      <ClubDetail t={t} />

      <Dock note={<><ClubEmblem team={t} size={22} decorative /><span><b>{t.name}</b><small>{t.old ? `2027 부활 · ${teamByCode(t.revives ?? t.code).name} 자리` : `${TIER_KO[t.tier]} · 난이도 ${DIFF_KO[t.difficulty]}`}</small></span></>}>
        <Button size="l" onClick={() => go('draft')} trailing={<Icon name="arrow-right" size={18} />}>이 구단으로</Button>
      </Dock>
    </>
  );
}
