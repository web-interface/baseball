// 세트덱 #/sets — 세트 종류별 조건 · 단계별 효과 표 · 지금 내 엔트리 진행 · 모으면 되는 카드 · 구단·연도 조합별 효과
//   ?club=DJ (조합 표에서 볼 구단)
import { useMemo, useState } from 'react';
import type { ScreenProps } from '../../app/screen';
import { navigate, setQueryQuiet } from '../../app/router';
import { Button, Emblem, Icon, fmt } from '../../ui';
import { CardMini } from '../../cards';
import { CLUBS } from '../../game/world';
import { TEAMS, myTeam } from '../../game/mock';
import type { ClubCode, Team } from '../../game/types';
import { HAS_REAL_SEASONS, clubSeason, clubTitles, fullYear } from '../../game/clubSeasons';
import {
  ENTRY_SIZE, MAX_ACTIVE, SET_KIND_DESC, SET_KIND_KO, STAT_KO, TIERS, setEffect, setName, statLine,
  type SetEffect, type SetKind, type SetProgress,
} from '../../game/sets';
import { boxOf, evaluate, initialLineup, store, unit } from '../lineup/calc';
import s from './sets.module.css';

const KINDS: SetKind[] = ['teamYear', 'team', 'year'];
const CURRENT_YEARS = [2027, 2026, 2025];
const teamOfCode = (c: ClubCode) => TEAMS.find((t) => t.code === c)!;
const tierHead = (at: number) => (at >= ENTRY_SIZE ? '전원' : `${at}명`);

export default function SetsScreen({ query }: ScreenProps) {
  const q = query.get('club')?.toUpperCase();
  const [club, setClubS] = useState<ClubCode>(() => (TEAMS.some((t) => t.code === q) ? (q as ClubCode) : myTeam().code));
  const setClub = (c: ClubCode) => { setClubS(c); setQueryQuiet({ club: c }); };
  const st = useMemo(() => store.get() ?? initialLineup(), []);
  const ev = useMemo(() => evaluate(st), [st]);

  return (
    <div className={s.screen}>
      <header className={s.top}>
        <h2 className={['head', s.title].join(' ')}>세트덱</h2>
        <p className={s.lead}>
          1군 엔트리 <b className="num">{ENTRY_SIZE}</b>명(타자 9 · 선발 5 · 불펜 5 · 마무리 1) 안에서 같은 구단 · 같은 연도 카드를 모으면,
          모인 인원 단계마다 <b>그 선수들의</b> 능력치가 올라요. 오르는 능력치는 구단과 연도마다 달라요.
        </p>
      </header>

      <Rules />
      <Mine ev={ev} st={st} />
      <Combos club={club} setClub={setClub} />
    </div>
  );
}

/* ───────── 규칙 표 ───────── */
function Rules() {
  const cols = [5, 9, 14, ENTRY_SIZE];
  return (
    <section className={s.sec} aria-labelledby="rules-h">
      <header className={s.secHead}><h3 id="rules-h" className="head">단계</h3><span className={s.meta}>단계 가치 = 능력치 칸마다 평균 몇 점</span></header>
      <table className={s.tiers}>
        <thead>
          <tr><th>세트</th>{cols.map((c) => <th key={c} className={s.cR}>{tierHead(c)}</th>)}</tr>
        </thead>
        <tbody>
          {KINDS.map((k) => (
            <tr key={k} className={k === 'teamYear' ? s.best : undefined}>
              <th scope="row">
                <b>{SET_KIND_KO[k]}</b>
                <small>{SET_KIND_DESC[k]}</small>
              </th>
              {cols.map((c) => {
                const t = TIERS[k].find((x) => x.at === c);
                return <td key={c} className={['num', s.cR, !t && s.dim].filter(Boolean).join(' ')}>{t ? `+${t.v}` : '—'}{t && k === 'teamYear' && c === ENTRY_SIZE && <em>왕조</em>}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className={s.ruleList}>
        <li><b>동시에 {MAX_ACTIVE}개까지</b> — 켜진 세트가 많으면 센 것부터 {MAX_ACTIVE}개만 켜져요.</li>
        <li><b>그 선수에게만</b> — 세트에 든 선수만 받고, 한 선수가 여러 세트에 들면 가장 센 것 하나만 받아요.</li>
        <li><b>공정하게</b> — 같은 종류·같은 단계면 어느 구단·연도든 총합이 같아요. 타자는 8칸 합 = 8 × 단계 가치, 투수는 7칸 합 = 7 × 단계 가치. 상황 효과(득점권 컨택 등)는 반만 쳐요 — 색깔만 다르고 손해는 없어요.</li>
        <li><b>왕조</b> — 엔트리 {ENTRY_SIZE}명이 모두 한 구단 · 한 연도면 능력치 폭발.</li>
        <li>케미 선(이웃한 자리의 공통점) 보너스는 세트와 따로 붙어요.</li>
      </ul>
    </section>
  );
}

/* ───────── 지금 내 엔트리 ───────── */
function Mine({ ev, st }: { ev: ReturnType<typeof evaluate>; st: ReturnType<typeof initialLineup> }) {
  // 엔트리 밖 내 카드 (벤치 + 보관함)
  const spare = useMemo(() => [...st.bench, ...boxOf(st)].map((id) => unit(id)), [st]);
  const list = ev.sets.filter((x) => x.active || x.next).slice(0, 6);
  return (
    <section className={s.sec} aria-labelledby="mine-h">
      <header className={s.secHead}>
        <h3 id="mine-h" className="head">지금 내 엔트리</h3>
        <span className={s.meta}>엔트리 <span className="num">{ev.entry}</span>/<span className="num">{ENTRY_SIZE}</span> · 켜진 세트 <span className="num">{ev.active.length}</span>/{MAX_ACTIVE}</span>
      </header>
      {!ev.active.length && <p className={s.note}>아직 켜진 세트가 없어요. 아래에서 가장 가까운 세트부터 모아 보세요.</p>}
      <ul className={s.mine}>
        {list.map((x) => <MineRow key={x.id} sp={x} spare={spare} />)}
      </ul>
      <Button variant="secondary" size="s" onClick={() => navigate('/lineup')} className={s.toLineup}>라인업에서 바꾸기</Button>
    </section>
  );
}

function MineRow({ sp, spare }: { sp: SetProgress; spare: ReturnType<typeof unit>[] }) {
  const t = sp.code ? teamOfCode(sp.code) : undefined;
  const need = sp.next ? sp.next.at : ENTRY_SIZE;
  const fits = spare.filter((u) => (sp.code ? u.team.code === sp.code : true) && (sp.year != null ? (u.card.year != null && fullYear(u.card.year) === sp.year) : true));
  const more = sp.next ? sp.next.at - sp.have : 0;
  const want = sp.kind === 'teamYear' ? `${t?.short} ${fmt.yearTag(sp.year! % 100)} 카드` : sp.kind === 'team' ? `${t?.short} 카드(연도 무관)` : `${fmt.yearTag(sp.year! % 100)} 카드(구단 무관)`;
  const pack = sp.kind === 'year' ? `연도팩 ${sp.year}` : sp.kind === 'team' ? `구단팩 ${t?.short}` : `연도팩 ${sp.year} · 구단팩 ${t?.short}`;
  return (
    <li className={[s.mineRow, sp.active && s.on].filter(Boolean).join(' ')} style={t ? ({ ['--tc' as string]: t.colors.primary }) : undefined}>
      <div className={s.mineTop}>
        {t ? <Emblem team={t} size={26} /> : <span className={['num-display', s.yy].join(' ')}>{fmt.yearTag(sp.year! % 100)}</span>}
        <span className={s.mineName}>
          <b>{sp.name}</b>
          <small>{SET_KIND_KO[sp.kind]}{sp.active ? ' · 켜짐' : ''}</small>
        </span>
        <span className={['num', s.mineN].join(' ')}>{sp.have}<i>/{need}</i></span>
      </div>
      <span className={s.bar} aria-hidden>
        {Array.from({ length: need }, (_, i) => <i key={i} className={i < sp.have ? s.fill : undefined} />)}
      </span>
      {sp.cur && <p className={s.effNow}><b>지금 +{sp.cur.v}</b> 타자 {statLine(sp.cur.bat, 3)} · 투수 {statLine(sp.cur.pit, 3)}</p>}
      {sp.next && (
        <p className={s.effNext}>
          <b className="num">{more}</b>명 더 모으면 <b>+{sp.next.v}</b> — 타자 {statLine(sp.next.bat, 3)} · 투수 {statLine(sp.next.pit, 2)}
          {sp.next.special && <> · {sp.next.special.text}</>}
        </p>
      )}
      <div className={s.cands}>
        <span className={s.candsH}>모을 카드 · {want}</span>
        {fits.length ? (
          <span className={s.candList}>
            {fits.slice(0, 5).map((u) => (
              <span key={u.id} className={s.cand}>
                <CardMini player={u.player} grade={u.card.grade} enhance={u.card.enhance} width={34} />
                <small>{u.player.name}</small>
              </span>
            ))}
            <small className={s.candNote}>내 카드 중 후보 {fits.length}장 — 라인업에 넣으면 돼요</small>
          </span>
        ) : (
          <small className={s.candNote}>내 카드엔 없어요 — 영입의 {pack}에서 나와요</small>
        )}
      </div>
    </li>
  );
}

/* ───────── 조합별 효과 ───────── */
function Combos({ club, setClub }: { club: ClubCode; setClub: (c: ClubCode) => void }) {
  const t = teamOfCode(club);
  const info = CLUBS.find((c) => c.code === club)!;
  const titles = clubTitles(club).slice().reverse();
  const years = useMemo(() => {
    const ys = [...CURRENT_YEARS, ...titles.filter((y) => !CURRENT_YEARS.includes(y))];
    return ys.filter((y) => !!clubSeason(club, y) || CURRENT_YEARS.includes(y));
  }, [club]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className={s.sec} aria-labelledby="combo-h">
      <header className={s.secHead}>
        <h3 id="combo-h" className="head">조합별 효과</h3>
        <span className={s.meta}>{HAS_REAL_SEASONS ? '연도 성격은 그 해 실제 팀 기록에서' : '연도 성격은 세계관 기록에서'}</span>
      </header>
      <div className={s.clubs} role="tablist" aria-label="구단">
        {TEAMS.map((x) => (
          <button key={x.code} type="button" role="tab" aria-selected={x.code === club} className={[s.clubBtn, x.code === club && s.clubOn].filter(Boolean).join(' ')} onClick={() => setClub(x.code)}>
            <Emblem team={x} size={28} />
            <span>{x.short}</span>
          </button>
        ))}
      </div>

      <div className={s.clubHead} style={{ ['--tc' as string]: t.colors.primary }}>
        <Emblem team={t} size={40} />
        <div>
          <p className={s.clubName}>{t.name}</p>
          <p className={s.clubStyle}>{info.style}</p>
          {titles.length > 0 && <p className={s.titles}>우승 <span className="num">{titles.length}</span>회 · {titles.slice(0, 8).map((y) => fmt.yearTag(y % 100)).join(' ')}{titles.length > 8 ? ' …' : ''}</p>}
        </div>
      </div>

      <h4 className={s.h4}>구단 세트 <small>{SET_KIND_DESC.team}</small></h4>
      <EffectTable kind="team" code={club} team={t} />

      <h4 className={s.h4}>구단+연도 세트 <small>{SET_KIND_DESC.teamYear}</small></h4>
      <ul className={s.yearList}>
        {years.map((y) => <YearCombo key={y} code={club} year={y} team={t} champion={titles.includes(y)} />)}
      </ul>

      <h4 className={s.h4}>연도 세트 <small>{SET_KIND_DESC.year} — 그 해 리그 특징</small></h4>
      <ul className={s.yearList}>
        {CURRENT_YEARS.map((y) => {
          const e = setEffect('year', undefined, y, 0);
          return (
            <li key={y} className={s.yearRow}>
              <details>
                <summary>
                  <span className={['num-display', s.yy].join(' ')}>{fmt.yearTag(y % 100)}</span>
                  <span className={s.yrMain}>
                    <b>{setName('year', undefined, y)} — {e.trait}</b>
                    <small>9명부터 · 타자 {statLine(e.bat, 3)} · 투수 {statLine(e.pit, 2)}</small>
                  </span>
                  <Icon name="chevron" size={16} className={s.chev} />
                </summary>
                <EffectTable kind="year" year={y} />
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function YearCombo({ code, year, team, champion }: { code: ClubCode; year: number; team: Team; champion: boolean }) {
  const e = setEffect('teamYear', code, year, 0);
  const rec = clubSeason(code, year);
  const recLine = rec && rec.w != null && rec.l != null ? `${rec.rank ? `${rec.rank}위 · ` : ''}${rec.w}승${rec.d ? ` ${rec.d}무` : ''} ${rec.l}패${rec.post ? ` · ${rec.post}` : ''}` : '';
  return (
    <li className={[s.yearRow, champion && s.champ].filter(Boolean).join(' ')} style={{ ['--tc' as string]: team.colors.primary }}>
      <details>
        <summary>
          <span className={['num-display', s.yy].join(' ')}>{fmt.yearTag(year % 100)}</span>
          <span className={s.yrMain}>
            <b>{setName('teamYear', code, year)} — {e.trait}</b>
            <small>{recLine && <>{recLine} · </>}5명부터 · 타자 {statLine(e.bat, 3)} · 투수 {statLine(e.pit, 2)}{e.special ? ` · ${e.special.text}` : ''}</small>
          </span>
          <Icon name="chevron" size={16} className={s.chev} />
        </summary>
        <EffectTable kind="teamYear" code={code} year={year} team={team} />
      </details>
    </li>
  );
}

/** 단계마다 무엇이 얼마나 — 타자 줄 · 투수 줄 · 상황 효과 */
function EffectTable({ kind, code, year, team }: { kind: SetKind; code?: ClubCode; year?: number; team?: Team }) {
  const tiers = TIERS[kind].map((_, i) => setEffect(kind, code, year, i));
  return (
    <div className={s.effWrap} style={team ? ({ ['--tc' as string]: team.colors.primary }) : undefined}>
      <table className={s.eff}>
        <thead>
          <tr><th>단계</th><th>타자</th><th>투수</th></tr>
        </thead>
        <tbody>
          {tiers.map((e: SetEffect) => (
            <tr key={e.tier}>
              <th scope="row" className="num">{tierHead(e.at)}<small>+{e.v}</small></th>
              <td>{e.bat.filter((x) => x.v > 0).map((x) => <span key={x.k}>{STAT_KO[x.k]} <b className="num">+{x.v}</b></span>)}{e.special?.side === 'bat' && <span className={s.spx}>{e.special.text}</span>}</td>
              <td>{e.pit.filter((x) => x.v > 0).map((x) => <span key={x.k}>{STAT_KO[x.k]} <b className="num">+{x.v}</b></span>)}{e.special?.side === 'pit' && <span className={s.spx}>{e.special.text}</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
