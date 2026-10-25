// 시상식 #/awards — 포스트시즌이 끝나 우승팀이 정해진 뒤 · 다음 시즌으로 넘어가기 전에 연다 (지난 시상식은 ?y=2027).
// 상은 모두 시즌 기록으로 코드가 정한다(season/awards): 정규 시즌 MVP · 신인왕 · 골든글러브(포지션별, 외야 셋) · 개인 타이틀 14개.
// 보여 주기는 '짧은 기사 + 사진' — 사진은 선수 SD 그림(art/PlayerArt), 기사 제목 · 리드 · 매체 · 기자는 기기 안 템플릿(서버 AI 안 씀).
// 우리 구단 선수 수상은 강조 선 + '우리 구단'. 연 시상식은 이 기기에 남긴다(saveCeremony — 다음 시즌에도 볼 수 있게).
import { useMemo } from 'react';
import type { ScreenProps } from '../../app/screen';
import { Link, setQueryQuiet } from '../../app/router';
import { Emblem, Icon, Tabs } from '../../ui';
import { teamById } from '../../game/mock';
import { longDate } from '../../season/schedule';
import { useRosters } from '../games/shared';
import { pastCeremonies, type AwardWin, type Ceremony } from '../../season/awards';
import { useCeremony } from './useCeremony';
import { Photo } from './Photo';
import s from './awards.module.css';

export default function AwardsScreen({ query }: ScreenProps) {
  useRosters();
  const now = useCeremony();
  const past = useMemo(() => pastCeremonies(), [now]);
  const list = useMemo(() => {
    const all = past.filter((x) => !now || x.seed !== now.seed);
    return now ? [...all, now] : all;
  }, [past, now]);
  const qy = Number(query.get('y'));
  const cur = list.find((x) => x.year === qy) ?? list[list.length - 1] ?? null;

  if (!cur) {
    return (
      <div className={s.screen}>
        <header className={s.top}>
          <p className={s.kicker}>한별 리그</p>
          <h2 className={['head', s.title].join(' ')}>시상식</h2>
        </header>
        <p className={s.wait}>한국시리즈 우승팀이 정해지면 열려요.</p>
        <p className={s.waitLink}><Link to="/season">경기 준비·진행 <Icon name="chevron" size={13} /></Link></p>
      </div>
    );
  }
  return (
    <div className={s.screen}>
      <Head c={cur} live={!!now && cur.seed === now.seed} />
      {list.length > 1 && (
        <div className={s.years}>
          <Tabs size="s" aria-label="시즌" value={String(cur.year)} onChange={(v) => setQueryQuiet({ y: v })}
            items={list.map((x) => ({ value: String(x.year), label: `${x.year}` }))} />
        </div>
      )}
      {cur.mvp && <Lead w={cur.mvp} c={cur} />}
      {cur.roy ? <Side w={cur.roy} c={cur} /> : cur.royNote && <p className={s.none}><b>신인왕</b> {cur.royNote}</p>}
      <GoldenGloves c={cur} />
      <Titles c={cur} />
      <nav className={s.more} aria-label="기록 더 보기">
        <Link to="/league?view=player"><b>선수 기록</b><Icon name="chevron" size={13} /></Link>
        <Link to="/league?view=team"><b>팀 기록</b><Icon name="chevron" size={13} /></Link>
      </nav>
    </div>
  );
}

function Head({ c, live }: { c: Ceremony; live: boolean }) {
  const champ = teamById(c.champion);
  const mine = [c.mvp, c.roy, ...c.gg, ...c.titles].filter((w): w is AwardWin => !!w && w.mine).length;
  return (
    <header className={s.top}>
      <p className={s.kicker}><span className="num">{c.year}</span> 한별 리그{live ? '' : ' · 지난 시상식'}</p>
      <h2 className={['head', s.title].join(' ')}>시상식</h2>
      <p className={s.meta}>
        <span className={s.champ}><Emblem team={champ} size={16} decorative />한국시리즈 우승 <b>{champ.short}</b></span>
        {mine > 0 && <span className={s.mineSum}>우리 구단 수상 <b className="num">{mine}</b></span>}
      </p>
    </header>
  );
}

function Byline({ c }: { c: Ceremony }) {
  return <p className={s.by}><span>{c.outlet}</span><span>{c.reporter} 기자</span>{c.date && <span>{longDate(c.date)}</span>}</p>;
}
const teamLine = (w: AwardWin) => teamById(w.team).name;

/** MVP — 큰 사진 기사 */
function Lead({ w, c }: { w: AwardWin; c: Ceremony }) {
  return (
    <article className={[s.lead, w.mine && s.mine].filter(Boolean).join(' ')} aria-label={w.label}>
      <Link to={`/player/${w.id}`} className={s.leadPhoto} aria-label={`${w.name} 선수 정보`}>
        <Photo win={w} variant="full" pose="celebrate" size="hero" eager />
      </Link>
      <p className={s.cap}><span className="num">{c.year}</span> {w.label} {w.name} · {teamLine(w)}</p>
      <div className={s.body}>
        <p className={s.kick}>{w.label}{w.mine && <em className={s.mineTag}>우리 구단</em>}</p>
        <h3 className={s.headline}>{w.head}</h3>
        <p className={s.lede}>{w.lede}</p>
        {w.cells && <Cells cells={w.cells} />}
        <Byline c={c} />
      </div>
    </article>
  );
}

/** 신인왕 — 옆 사진 기사 */
function Side({ w, c }: { w: AwardWin; c: Ceremony }) {
  return (
    <article className={[s.side, w.mine && s.mine].filter(Boolean).join(' ')} aria-label={w.label}>
      <div className={s.sideRow}>
        <div className={s.sideText}>
          <p className={s.kick}>{w.label}{w.mine && <em className={s.mineTag}>우리 구단</em>}</p>
          <h3 className={s.headlineS}>{w.head}</h3>
        </div>
        <Link to={`/player/${w.id}`} className={s.sidePhoto} aria-label={`${w.name} 선수 정보`}>
          <Photo win={w} variant="portrait" size="side" />
        </Link>
      </div>
      <p className={s.lede}>{w.lede}</p>
      {w.cells && <Cells cells={w.cells} />}
    </article>
  );
}

function Cells({ cells }: { cells: [string, string][] }) {
  return (
    <dl className={s.cells}>
      {cells.map(([k, v]) => (
        <div key={k}><dt>{k}</dt><dd className="num-display">{v}</dd></div>
      ))}
    </dl>
  );
}

/** 골든글러브 — 자리마다 사진 한 장 */
function GoldenGloves({ c }: { c: Ceremony }) {
  if (!c.gg.length) return null;
  return (
    <section className={s.sec} aria-label="골든글러브">
      <h3 className={s.secH}>골든글러브 <small><span className="num">{c.gg.length}</span>명</small></h3>
      {c.ggNote && <Note n={c.ggNote} />}
      <ul className={s.gg}>
        {c.gg.map((w) => (
          <li key={`${w.key}-${w.id}`} className={w.mine ? s.mine : undefined}>
            <Link to={`/player/${w.id}`} className={s.ggItem}>
              <Photo win={w} variant="portrait" size="tile" />
              <span className={s.ggPos}>{w.label}{w.mine && <em className={s.mineTag}>우리 구단</em>}</span>
              <b className={s.ggName}>{w.name}</b>
              <span className={s.ggTeam}><Emblem team={teamById(w.team)} size={13} decorative />{teamById(w.team).short}</span>
              <span className={['num', s.ggLine].join(' ')}>{w.line}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 개인 타이틀 — 타자 · 투수 */
function Titles({ c }: { c: Ceremony }) {
  if (!c.titles.length) return null;
  const part = (side: 'bat' | 'pit') => c.titles.filter((t) => t.side === side);
  return (
    <section className={s.sec} aria-label="개인 타이틀">
      <h3 className={s.secH}>개인 타이틀</h3>
      {c.titleNote && <Note n={c.titleNote} />}
      {(['bat', 'pit'] as const).map((side) => part(side).length > 0 && (
        <div key={side} className={s.tGroup}>
          <p className={s.tGroupH}>{side === 'bat' ? '타자' : '투수'}</p>
          <ol className={s.titles}>
            {part(side).map((w) => (
              <li key={`${w.key}-${w.id}`}>
                <Link to={`/player/${w.id}`} className={[s.tRow, w.mine && s.tMine].filter(Boolean).join(' ')}>
                  <span className={s.tLabel}>{w.label}{w.shared && <small>공동</small>}</span>
                  <Photo win={w} variant="mini" size="mini" />
                  <span className={s.tWho}>
                    <b>{w.name}</b>
                    <small><Emblem team={teamById(w.team)} size={12} decorative />{teamById(w.team).short}{w.mine ? ' · 우리 구단' : ''}</small>
                  </span>
                  <span className={s.tVal}><b className="num">{w.value}</b><small>{w.unit}</small></span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}

function Note({ n }: { n: { head: string; lede: string } }) {
  return (
    <div className={s.note}>
      <p className={s.noteH}>{n.head}</p>
      <p className={s.noteL}>{n.lede}</p>
    </div>
  );
}
