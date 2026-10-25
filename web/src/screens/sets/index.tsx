// 세트덱 #/sets — 세트 종류별 조건 · 단계별 효과 표 · 지금 내 엔트리 진행 · 모으면 되는 카드 · 구단·연도 조합별 효과
//   ?club=DJ (조합 표에서 볼 구단 — 현재 10 + 옛 10) · ?year=1995 (구단+연도 세트에서 볼 해)
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ScreenProps } from '../../app/screen';
import { navigate, setQueryQuiet } from '../../app/router';
import { Button, Emblem, YearPicker, fmt, type YearCell } from '../../ui';
import { CardMini } from '../../cards';
import { CURRENT_SEASON, FIRST_SEASON, shortLabel } from '../../game/world';
import { CURRENT_TEAMS, OLD_TEAMS, cardById, isTeamId, myTeam, teamByCode, teamById } from '../../game/mock';
import { cardLite } from '../../game/kbo';
import type { ClubCode, Team } from '../../game/types';
import { HAS_REAL_SEASONS, clubPennants, clubRunnerUps, clubSeason, clubTitles, clubYears, fullYear, leagueYear, leagueYears, postLabel, seasonLine } from '../../game/clubSeasons';
import {
  ENTRY_SIZE, FULL_SIZE, SET_KIND_DESC, SET_KIND_KO, STAT_KO, TIERS, TIER_NAMES, sameLine, setEffect, setName, statLine,
  type SetEffect, type SetKind, type SetProgress,
} from '../../game/sets';
import { boxOf, evaluate, initialLineup, store, unit } from '../lineup/calc';
import s from './sets.module.css';

const KINDS: SetKind[] = ['teamYear', 'team', 'year'];
const tierHead = (at: number) => `${at}명`;
const yyOf = (y: number) => `’${String(y).slice(-2)}`;

export default function SetsScreen({ query }: ScreenProps) {
  const q = query.get('club')?.toLowerCase();
  const [club, setClubS] = useState<ClubCode>(() => (q && isTeamId(q) ? (q.toUpperCase() as ClubCode) : myTeam().code));
  const setClub = (c: ClubCode) => { setClubS(c); setQueryQuiet({ club: c }); };
  const st = useMemo(() => store.get() ?? initialLineup(), []);
  const ev = useMemo(() => evaluate(st), [st]);

  return (
    <div className={s.screen}>
      <header className={s.top}>
        <h2 className={['head', s.title].join(' ')}>세트덱</h2>
        <p className={s.lead}>같은 구단·연도 카드를 모으면 <b>엔트리 전원</b> 능력치가 올라요</p>
      </header>

      <Rules />
      <Mine ev={ev} st={st} />
      <Combos club={club} setClub={setClub} initialYear={Number(query.get('year')) || undefined} />
    </div>
  );
}

/* ───────── 규칙 표 ───────── */
function Rules() {
  const cols = [5, 9, 14, ENTRY_SIZE, FULL_SIZE];
  return (
    <section className={s.sec} aria-labelledby="rules-h">
      <header className={s.secHead}><h3 id="rules-h" className="head">단계</h3></header>
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
                const name = t ? TIER_NAMES[k][TIERS[k].indexOf(t)] : '';
                return <td key={c} className={['num', s.cR, !t && s.dim].filter(Boolean).join(' ')}>{t ? `+${t.v}` : '—'}{t && <em>{name}</em>}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className={s.ruleList}>
        <li><b>엔트리 전원</b> 가장 센 세트 하나가 모두에게</li>
        <li><b>왕조</b> 구단+연도 {ENTRY_SIZE}명 · <b>황금 왕조</b> {FULL_SIZE}명</li>
        <li><b>연도 없는 카드</b> 같은 계보 구단(옛 이름 포함) · 아무 연도로</li>
      </ul>
    </section>
  );
}

/* ───────── 지금 내 엔트리 ───────── */
function Mine({ ev, st }: { ev: ReturnType<typeof evaluate>; st: ReturnType<typeof initialLineup> }) {
  // 엔트리 밖 내 카드 (벤치 + 보관함) — 구단 · 연도만 가볍게(수천 장이어도 선수 능력치를 만들지 않게), 보여 줄 다섯 장만 unit()
  const spare = useMemo(() => [...st.bench, ...boxOf(st)].map((id): Spare => {
    const lite = cardLite(id);
    if (lite) { const y = cardById(id)?.year; return { id, code: teamById(lite.teamId).code, year: y != null ? fullYear(y) : null }; }
    const u = unit(id);
    return { id, code: u.team.code, year: u.card.year != null ? fullYear(u.card.year) : null };
  }), [st]);
  const list = ev.sets.filter((x) => x.active || x.next).slice(0, 6);
  return (
    <section className={s.sec} aria-labelledby="mine-h">
      <header className={s.secHead}>
        <h3 id="mine-h" className="head">지금 내 엔트리</h3>
        <span className={s.meta}>엔트리 <span className="num">{ev.entry}</span>/<span className="num">{FULL_SIZE}</span></span>
      </header>
      {!ev.active.length && <p className={s.note}>켜진 세트 없음</p>}
      <ul className={s.mine}>
        {list.map((x) => <MineRow key={x.id} sp={x} spare={spare} />)}
      </ul>
      <Button variant="secondary" size="s" onClick={() => navigate('/lineup')} className={s.toLineup}>라인업에서 바꾸기</Button>
    </section>
  );
}

interface Spare { id: string; code: string; year: number | null }
function MineRow({ sp, spare }: { sp: SetProgress; spare: Spare[] }) {
  const t = sp.code ? teamByCode(sp.code) : undefined;
  const need = sp.next ? sp.next.at : FULL_SIZE;
  // 연도 없는 카드(레전드급 · 특별 선수)는 아무 연도 · 같은 계보 구단 — 구단 세트 · 구단+연도 세트 · 연도 세트에도 든다
  const fits = spare.filter((u) => (sp.code ? u.code === sp.code || (u.year == null && sameLine(u.code, sp.code)) : true) && (sp.year != null ? u.year === sp.year || u.year == null : true));
  const more = sp.next ? sp.next.at - sp.have : 0;
  const short = sp.code ? shortLabel(sp.code) : '';
  const want = sp.kind === 'teamYear' ? `${short} ${fmt.yearTag(sp.year! % 100)} 카드` : sp.kind === 'team' ? `${short} 카드(연도 무관)` : `${fmt.yearTag(sp.year! % 100)} 카드(구단 무관)`;
  const pack = sp.kind === 'year' ? `연도팩 ${sp.year}` : sp.kind === 'team' ? `구단팩 ${short}` : `연도팩 ${sp.year} · 구단팩 ${short}`;
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
      {sp.cur && <p className={s.effNow}><b>+{sp.cur.v}</b> 타자 {statLine(sp.cur.bat, 3)} · 투수 {statLine(sp.cur.pit, 3)}</p>}
      {sp.next && <p className={s.effNext}><b className="num">{more}</b>명 더 → <b>+{sp.next.v}</b></p>}
      <div className={s.cands}>
        <span className={s.candsH}>모을 카드 · {want}</span>
        {fits.length ? (
          <span className={s.candList}>
            {fits.slice(0, 5).map((x) => { const u = unit(x.id); return (
              <span key={u.id} className={s.cand}>
                <CardMini player={u.player} grade={u.card.grade} enhance={u.card.enhance} width={34} still />
                <small>{u.player.name}</small>
              </span>
            ); })}
            <small className={s.candNote}>후보 {fits.length}장</small>
          </span>
        ) : (
          <small className={s.candNote}>{pack}</small>
        )}
      </div>
    </li>
  );
}

/* ───────── 조합별 효과 ───────── */
/** 구단+연도 세트에서 처음 보여 줄 해 — 마지막 우승, 없으면 마지막 해 */
const defaultYear = (code: ClubCode, want?: number) => {
  const ys = clubYears(code);
  if (want && ys.includes(want)) return want;
  return clubTitles(code).at(-1) ?? ys.at(-1) ?? CURRENT_SEASON;
};

/** 한 구단이 있던 해 칸 — 우승 · 준우승 · 순위 */
function clubCells(code: ClubCode): YearCell[] {
  const titles = new Set(clubTitles(code)), runners = new Set(clubRunnerUps(code)), pennants = new Set(clubPennants(code));
  return clubYears(code).map((y) => {
    const rec = clubSeason(code, y);
    const live = rec?.post === '진행중';
    const sub = titles.has(y) ? '우승' : runners.has(y) ? '준우승' : y === CURRENT_SEASON ? '이번' : live ? '가을야구 중' : pennants.has(y) ? '정규 1위' : rec?.rank ? `${rec.rank}위` : undefined;
    return { year: y, sub, tone: titles.has(y) ? 'champ' : undefined, label: `${y}년${sub ? ` · ${sub}` : ''}` };
  });
}

/** 리그 연도 칸 — 그 해 리그 특징 첫 태그 */
const LEAGUE_CELLS: YearCell[] = leagueYears().map((y) => {
  const lg = leagueYear(y);
  const sub = y === CURRENT_SEASON ? '이번' : lg?.tags[0];
  return { year: y, sub, label: `${y}년${sub ? ` · ${sub}` : ''}` };
});

function Combos({ club, setClub, initialYear }: { club: ClubCode; setClub: (c: ClubCode) => void; initialYear?: number }) {
  const t = teamByCode(club);
  const titles = clubTitles(club).slice().reverse();
  const [pickYear, setPickYear] = useState(() => defaultYear(club, initialYear));
  const [lgYear, setLgYear] = useState(CURRENT_SEASON);
  const cells = useMemo(() => clubCells(club), [club]);
  // 구단을 바꾸면 그 구단이 있던 해로 맞춘다
  const year = cells.some((c) => c.year === pickYear) ? pickYear : defaultYear(club);
  const choose = (c: ClubCode) => { setClub(c); setPickYear(defaultYear(c)); };
  const [from, to] = t.era ?? [FIRST_SEASON, CURRENT_SEASON];
  const le = setEffect('year', undefined, lgYear, 0);
  const lg = leagueYear(lgYear);
  return (
    <section className={s.sec} aria-labelledby="combo-h">
      <header className={s.secHead}>
        <h3 id="combo-h" className="head">조합별 효과</h3>
        <span className={s.meta}>{HAS_REAL_SEASONS ? '연도 성격은 그 해 실제 팀 기록에서' : '연도 성격은 세계관 기록에서'}</span>
      </header>
      <ClubRow label="지금 구단" teams={CURRENT_TEAMS} club={club} onPick={choose} />
      <ClubRow label="옛 구단" teams={OLD_TEAMS} club={club} onPick={choose} old />

      <div className={s.clubHead} style={{ ['--tc' as string]: t.colors.primary }}>
        <Emblem team={t} size={40} />
        <div>
          <p className={s.clubName}>{t.name}{t.old && <small className={s.oldTag}>옛 구단</small>}</p>
          <p className={s.clubStyle}>{t.style} · <span className="num">{from}~{to >= CURRENT_SEASON ? '' : to}</span></p>
          {titles.length > 0 && <p className={s.titles}>우승 <span className="num">{titles.length}</span>회 · {titles.slice(0, 9).map((y) => fmt.yearTag(y % 100)).join(' ')}{titles.length > 9 ? ' …' : ''}</p>}
        </div>
      </div>

      <h4 className={s.h4}>구단 세트 <small>{SET_KIND_DESC.team}</small></h4>
      <EffectTable kind="team" code={club} team={t} />

      <h4 className={s.h4}>구단+연도 세트 <small>{SET_KIND_DESC.teamYear}</small></h4>
      <YearPicker className={s.yearPick} cells={cells} value={year} onChange={setPickYear} champCount aria-label={`${t.name} 연도`} />
      <YearCombo code={club} year={year} team={t} champion={titles.includes(year)} />

      <h4 className={s.h4}>연도 세트 <small>{SET_KIND_DESC.year} — 그 해 리그 특징</small></h4>
      <YearPicker className={s.yearPick} cells={LEAGUE_CELLS} value={lgYear} onChange={setLgYear} aria-label="리그 연도" />
      <div className={s.yearPanel}>
        <p className={s.panelHead}>
          <span className={['num-display', s.yy].join(' ')}>{yyOf(lgYear)}</span>
          <span className={s.yrMain}>
            <b>{setName('year', undefined, lgYear)} — {le.trait}</b>
            <small>{lg?.note ? `${lg.note.replace(/\s*·\s*포스트시즌 진행 중.*$/, '')} · ` : ''}9명부터 · 타자 {statLine(le.bat, 3)} · 투수 {statLine(le.pit, 2)}</small>
          </span>
        </p>
        <EffectTable kind="year" year={lgYear} />
      </div>
    </section>
  );
}

/** 구단 고르기 줄 — 지금 구단 / 옛 구단 (가로로 미는 목록) */
function ClubRow({ label, teams, club, onPick, old }: { label: string; teams: Team[]; club: ClubCode; onPick: (c: ClubCode) => void; old?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  // 고른 구단이 줄 밖에 있으면 가로로만 당겨 보여 준다 (화면 세로 위치는 그대로)
  useEffect(() => {
    const b = box.current, el = b?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!b || !el) return;
    const br = b.getBoundingClientRect(), er = el.getBoundingClientRect();
    if (er.left < br.left || er.right > br.right) b.scrollLeft += er.left + er.width / 2 - (br.left + br.width / 2);
  }, [club]);
  return (
    <div className={s.clubRow}>
      <p className={s.clubRowHead}>{label}</p>
      <div ref={box} className={s.clubs} role="tablist" aria-label={label}>
        {teams.map((x) => (
          <button key={x.code} type="button" role="tab" aria-selected={x.code === club} className={[s.clubBtn, x.code === club && s.clubOn].filter(Boolean).join(' ')} onClick={() => onPick(x.code)}>
            <Emblem team={x} size={28} />
            <span>{x.short}</span>
            {old && <small className="num">{yyOf(x.era?.[0] ?? 0)}–{yyOf(x.era?.[1] ?? 0)}</small>}
          </button>
        ))}
      </div>
    </div>
  );
}

function YearCombo({ code, year, team, champion }: { code: ClubCode; year: number; team: Team; champion: boolean }) {
  const e = setEffect('teamYear', code, year, 0);
  const rec = clubSeason(code, year);
  const line = seasonLine(code, year, { post: false });
  // 우승·준우승은 이름(성격) 쪽에 이미 있다 — 가을야구 결과만 덧붙인다
  const post = rec?.post && !/우승/.test(rec.post) ? postLabel(rec.post) : '';
  return (
    <div className={[s.yearPanel, champion && s.champ].filter(Boolean).join(' ')} style={{ ['--tc' as string]: team.colors.primary }}>
      <p className={s.panelHead}>
        <span className={['num-display', s.yy].join(' ')}>{yyOf(year)}</span>
        <span className={s.yrMain}>
          <b>{setName('teamYear', code, year)} — {e.trait}</b>
          <small>
            {line && <>{line}{post ? ` · ${post}` : ''} · </>}5명부터 · 타자 {statLine(e.bat, 3)} · 투수 {statLine(e.pit, 2)}{e.special ? ` · ${e.special.text}` : ''}
          </small>
        </span>
      </p>
      <EffectTable kind="teamYear" code={code} year={year} team={team} />
    </div>
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
