// 도감 — 실제 선수 카드 13,159장 중 무엇을 모았나. 사용자 지시 10-24 "팀별로 · 연도별로 어느 정도 모았는지, 굉장히 이쁘게,
// 못 모은 카드는 비활성화된 느낌으로".
//  · 맨 위: 전체 진행 고리 · 모은 카드 / 선수 · 등급별 띠
//  · 구단별: 구단 타일(구단 색 · 엠블럼 · 진행 막대) → 구단 안: 시즌 판(해마다 모은 만큼 구단 색이 짙어짐) → 그 시즌 카드 판
//  · 연도별: 연대마다 시즌 타일 → 그 해: 구단 칩 → 그 구단 · 그 해 카드 판
//  · 카드 판: 모은 카드는 그대로(여러 장이면 ×n), 못 모은 카드는 흑백 · 어둡게 · 자물쇠 — 누르면 나오는 팩으로
// 주소: ?mode=club|year · ?club=DJ · ?year=2025 (미리보기 · 공유용)
import { useMemo, useState, type CSSProperties } from 'react';
import type { ScreenProps } from '../../app/screen';
import { navigate, setQueryQuiet } from '../../app/router';
import { CardMini, cardProps } from '../../cards';
import { Emblem, Icon, Tabs, useToast } from '../../ui';
import { CURRENT_TEAMS, OLD_TEAMS, myTeam, teamByCode } from '../../game/mock';
import { shortLabel } from '../../game/world';
import { GRADES } from '../../game/grades';
import { cardInst, type KCard } from '../../game/kbo';
import { ownedCard, ownedCount, useInventory } from '../../game/inventory';
import { clubTitles } from '../../game/clubSeasons';
import { dexCards, dexIndex, pctOf, pctText, type Tally } from '../../game/dex';
import { rarity } from '../gacha/draw';
import type { ClubCode, GradeId } from '../../game/types';
import s from './dex.module.css';

type Mode = 'club' | 'year';
const yy = (y: number) => `’${String(y).slice(-2)}`;
const n = (v: number) => v.toLocaleString('en-US');

export default function DexScreen({ query }: ScreenProps) {
  useInventory(); // 카드가 바뀌면 다시 센다
  const idx = dexIndex();
  const [mode, setModeS] = useState<Mode>(() => (query.get('mode') === 'year' ? 'year' : 'club'));
  const [club, setClubS] = useState<ClubCode | null>(() => { const c = query.get('club')?.toUpperCase() as ClubCode | undefined; return c && idx.club.has(c) ? c : null; });
  const [year, setYearS] = useState<number | null>(() => { const y = Number(query.get('year')); return idx.year.has(y) ? y : null; });
  const setMode = (m: Mode) => { setModeS(m); setClubS(null); setYearS(null); setQueryQuiet({ mode: m, club: null, year: null }); };
  const setClub = (c: ClubCode | null) => { setClubS(c); setQueryQuiet({ club: c }); };
  const setYear = (y: number | null) => { setYearS(y); setQueryQuiet({ year: y != null ? String(y) : null }); };

  const detail = mode === 'club' ? club != null : year != null;
  return (
    <div className={s.screen}>
      {!detail && <Hero idx={idx} />}
      {!detail && (
        <div className={s.modeRow}>
          <Tabs value={mode} onChange={setMode} aria-label="도감 보기" items={[{ value: 'club', label: '구단별' }, { value: 'year', label: '연도별' }]} />
        </div>
      )}
      {mode === 'club' && !club && <ClubList onPick={(c) => { setClub(c); setYear(null); window.scrollTo(0, 0); }} />}
      {mode === 'club' && club && <ClubView code={club} year={year} onYear={setYear} onBack={() => { setClub(null); setYear(null); }} />}
      {mode === 'year' && year == null && <YearList onPick={(y) => { setYear(y); setClub(null); window.scrollTo(0, 0); }} />}
      {mode === 'year' && year != null && <YearView year={year} club={club} onClub={setClub} onBack={() => { setYear(null); setClub(null); }} />}
    </div>
  );
}

/* ───────── 진행 고리 ───────── */
function Ring({ t, size = 92, stroke = 9, label }: { t: Pick<Tally, 'have' | 'total'>; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, t.total ? t.have / t.total : 0);
  const full = t.total > 0 && t.have >= t.total;
  return (
    <span className={[s.ring, full && s.ringFull].filter(Boolean).join(' ')} style={{ width: size, height: size }} role="img" aria-label={`${label ?? '모은 정도'} ${pctText(t)}%`}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} className={s.ringBg} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} className={s.ringFg} strokeWidth={stroke} strokeDasharray={`${c * p} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <b className="num">{pctText(t)}<small>%</small></b>
    </span>
  );
}

/* ───────── 맨 위 — 전체 ───────── */
const GRADE_KO: Partial<Record<GradeId, string>> = { franchise: '프랜차이즈', th: 'TH', gg: 'GG' };
const GRADE_SHOW: GradeId[] = (['signature', 'black', 'franchise', 'mvp', 'gg', 'th', 'legend', 'elite', 'rare', 'special', 'normal'] as GradeId[]).sort((a, b) => rarity(b) - rarity(a));
function Hero({ idx }: { idx: ReturnType<typeof dexIndex> }) {
  const a = idx.all;
  return (
    <header className={s.hero}>
      <div className={s.heroTop}>
        <Ring t={a} size={104} stroke={10} label="전체 도감" />
        <div className={s.heroText}>
          <h1 className={['head', s.h1].join(' ')}>카드 도감</h1>
          <p>모은 카드 <b className="num">{n(a.have)}</b><span className="num"> / {n(a.total)}</span>종</p>
          <p>모은 선수 <b className="num">{n(a.peopleHave)}</b><span className="num"> / {n(a.people)}</span>명</p>
          <small>구단 <span className="num">{idx.club.size}</span> · 시즌 <span className="num">{idx.year.size}</span> · 같은 카드는 한 종으로 세요</small>
        </div>
      </div>
      <ul className={s.grades} aria-label="등급별">
        {GRADE_SHOW.filter((g) => idx.grade.has(g)).map((g) => {
          const t = idx.grade.get(g)!;
          return (
            <li key={g} className={t.have >= t.total ? s.gDone : undefined} style={{ '--g': `var(--gr-${g})` } as CSSProperties}>
              <span className={s.gName}><i aria-hidden />{GRADE_KO[g] ?? GRADES[g].ko}</span>
              <span className={s.gNum}><b className="num">{n(t.have)}</b><span className="num">/{n(t.total)}</span></span>
              <span className={s.gBar} aria-hidden><i style={{ width: `${pctOf(t)}%` }} /></span>
            </li>
          );
        })}
      </ul>
    </header>
  );
}

/* ───────── 구단별 ───────── */
const CLUB_ORDER: ClubCode[] = [...CURRENT_TEAMS, ...OLD_TEAMS].map((t) => t.code);
function ClubList({ onPick }: { onPick: (c: ClubCode) => void }) {
  const idx = dexIndex();
  const mine = myTeam().code;
  const list = CLUB_ORDER.filter((c) => idx.club.has(c));
  return (
    <section className={s.sec} aria-label="구단별 도감">
      <ul className={s.clubGrid}>
        {list.map((c) => {
          const t = idx.club.get(c)!;
          const team = teamByCode(c);
          const full = t.have >= t.total;
          const first = t.years[0];
          const last = t.years[t.years.length - 1];
          return (
            <li key={c}>
              <button type="button" className={[s.clubTile, full && s.tileDone].filter(Boolean).join(' ')} style={{ '--c1': team.colors.primary, '--c2': team.colors.secondary } as CSSProperties} onClick={() => onPick(c)}>
                <span className={s.ctTop}>
                  <Emblem team={team} size={38} decorative />
                  <span className={s.ctName}>
                    <b>{shortLabel(c)}{c === mine && <em className={s.mine}>내 구단</em>}</b>
                    <small><span className="num">{first}</span>–<span className="num">{last}</span> · <span className="num">{t.years.length}</span>시즌</small>
                  </span>
                  <span className={s.ctPct}><b className="num">{pctText(t)}</b><small>%</small></span>
                </span>
                <span className={s.bar} aria-hidden><i style={{ width: `${pctOf(t)}%` }} /></span>
                <span className={s.ctNums}>
                  카드 <b className="num">{n(t.have)}</b><span className="num">/{n(t.total)}</span>
                  <span className={s.dot}>·</span>
                  선수 <b className="num">{n(t.peopleHave)}</b><span className="num">/{n(t.people)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ClubView({ code, year, onYear, onBack }: { code: ClubCode; year: number | null; onYear: (y: number | null) => void; onBack: () => void }) {
  const idx = dexIndex();
  const t = idx.club.get(code)!;
  const team = teamByCode(code);
  const titles = useMemo(() => new Set(clubTitles(code)), [code]);
  // 처음엔 가장 최근 시즌 (연도 카드가 없으면 상징 카드)
  const last = t.years.length ? t.years[t.years.length - 1] : null;
  const [noYear, setNoYear] = useState(last == null);
  const showNone = noYear && !!t.noYear;
  const curKey: number | null = showNone ? null : (year ?? last);
  const cy = idx.clubYear.get(`${code}:${curKey ?? '-'}`);
  return (
    <section className={s.detail} style={{ '--c1': team.colors.primary, '--c2': team.colors.secondary } as CSSProperties}>
      <button type="button" className={s.back} onClick={onBack}><Icon name="back" size={18} />구단 목록</button>
      <header className={s.band}>
        <Emblem team={team} size={56} decorative />
        <div className={s.bandText}>
          <h1 className="head">{team.name}</h1>
          <p>카드 <b className="num">{n(t.have)}</b><span className="num">/{n(t.total)}</span> · 선수 <b className="num">{n(t.peopleHave)}</b><span className="num">/{n(t.people)}</span></p>
          <small><span className="num">{t.years[0]}</span>–<span className="num">{t.years[t.years.length - 1]}</span> · <span className="num">{t.years.length}</span>시즌{titles.size > 0 && <> · 우승 <span className="num">{titles.size}</span>번</>}</small>
        </div>
        <Ring t={t} size={74} stroke={8} label={`${team.short} 도감`} />
      </header>

      <div className={s.secHead}>
        <h2>시즌 판</h2>
        <small>모은 만큼 구단 색이 짙어져요 · <span className={s.crownKey}>★</span> 우승 시즌</small>
      </div>
      <ul className={s.heat} aria-label="시즌별 모은 정도">
        {t.years.map((y) => {
          const x = idx.clubYear.get(`${code}:${y}`)!;
          const p = pctOf(x);
          const on = !showNone && curKey === y;
          return (
            <li key={y}>
              <button
                type="button"
                className={[s.cell, on && s.cellOn, x.have >= x.total && s.cellDone, x.have === 0 && s.cellZero].filter(Boolean).join(' ')}
                style={{ '--p': `${Math.max(p, x.have ? 8 : 0)}%` } as CSSProperties}
                onClick={() => { setNoYear(false); onYear(y); }}
                aria-pressed={on}
                aria-label={`${y} 시즌 ${x.have}/${x.total}`}
              >
                {titles.has(y) && <i className={s.crown} aria-hidden>★</i>}
                <b className="num">{yy(y)}</b>
                <small className="num">{x.have}/{x.total}</small>
              </button>
            </li>
          );
        })}
        {t.noYear && (
          <li className={s.cellWide}>
            <button type="button" className={[s.cell, s.cellSpecial, showNone && s.cellOn, t.noYear.have >= t.noYear.total && s.cellDone].filter(Boolean).join(' ')} style={{ '--p': `${pctOf(t.noYear)}%` } as CSSProperties} onClick={() => setNoYear(true)} aria-pressed={showNone}>
              <b>상징</b>
              <small className="num">{t.noYear.have}/{t.noYear.total}</small>
            </button>
          </li>
        )}
      </ul>

      {cy && (
        <>
          <div className={s.secHead}>
            <h2>{showNone ? `${team.short} 상징 카드` : `${yy(curKey!)} ${team.short}`}{!showNone && titles.has(curKey!) && <span className={s.titleTag}>우승</span>}</h2>
            <small>카드 <b className="num">{cy.have}</b>/{cy.total} · 선수 <b className="num">{cy.peopleHave}</b>/{cy.people}</small>
          </div>
          {showNone && <p className={s.note}>프랜차이즈 · 블랙 · 시그니처 — 연도 없이 그 구단을 대표하는 카드예요</p>}
          <Grid cards={dexCards(code, curKey)} club={code} year={curKey} key={`${code}:${curKey ?? '-'}`} />
        </>
      )}
    </section>
  );
}

/* ───────── 연도별 ───────── */
function YearList({ onPick }: { onPick: (y: number) => void }) {
  const idx = dexIndex();
  const decades = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const y of idx.year.keys()) { const d = Math.floor(y / 10) * 10; m.set(d, [...(m.get(d) ?? []), y]); }
    return [...m].sort((a, b) => b[0] - a[0]);
  }, [idx]);
  return (
    <section className={s.sec} aria-label="연도별 도감">
      {decades.map(([d, ys]) => {
        const tot = ys.reduce((a, y) => { const t = idx.year.get(y)!; return { have: a.have + t.have, total: a.total + t.total }; }, { have: 0, total: 0 });
        return (
          <div key={d} className={s.decade}>
            <div className={s.secHead}>
              <h2><span className="num">{d}</span>년대</h2>
              <small>카드 <b className="num">{n(tot.have)}</b>/{n(tot.total)} · <span className="num">{pctText(tot)}</span>%</small>
            </div>
            <ul className={s.yearGrid}>
              {[...ys].sort((a, b) => b - a).map((y) => {
                const t = idx.year.get(y)!;
                return (
                  <li key={y}>
                    <button type="button" className={[s.yearTile, t.have >= t.total && s.tileDone, t.have === 0 && s.yearZero].filter(Boolean).join(' ')} style={{ '--p': `${pctOf(t)}%` } as CSSProperties} onClick={() => onPick(y)}>
                      <b className="num">{yy(y)}</b>
                      <small><span className="num">{pctText(t)}</span>%</small>
                      <span className={s.yBar} aria-hidden><i /></span>
                      <span className={s.yClubs} aria-hidden>
                        {t.clubs.slice(0, 10).map((c) => <i key={c} style={{ background: teamByCode(c).colors.primary }} />)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function YearView({ year, club, onClub, onBack }: { year: number; club: ClubCode | null; onClub: (c: ClubCode | null) => void; onBack: () => void }) {
  const idx = dexIndex();
  const t = idx.year.get(year)!;
  const clubs = useMemo(() => [...t.clubs].sort((a, b) => CLUB_ORDER.indexOf(a) - CLUB_ORDER.indexOf(b)), [t]);
  const mine = myTeam().code;
  const sel = club && clubs.includes(club) ? club : clubs.includes(mine) ? mine : clubs[0];
  const team = teamByCode(sel);
  const cy = idx.clubYear.get(`${sel}:${year}`)!;
  const champ = clubs.find((c) => clubTitles(c).includes(year));
  return (
    <section className={s.detail} style={{ '--c1': team.colors.primary, '--c2': team.colors.secondary } as CSSProperties}>
      <button type="button" className={s.back} onClick={onBack}><Icon name="back" size={18} />연도 목록</button>
      <header className={[s.band, s.bandYear].join(' ')}>
        <span className={s.bigYear}><b className="num">{year}</b><small>시즌</small></span>
        <div className={s.bandText}>
          <p>카드 <b className="num">{n(t.have)}</b><span className="num">/{n(t.total)}</span> · 선수 <b className="num">{n(t.peopleHave)}</b><span className="num">/{n(t.people)}</span></p>
          <small>구단 <span className="num">{clubs.length}</span>{champ && <> · 우승 {shortLabel(champ)}</>}</small>
        </div>
        <Ring t={t} size={74} stroke={8} label={`${year} 도감`} />
      </header>
      <div className={s.secHead}>
        <h2>구단</h2>
        <small>누르면 그 구단 카드</small>
      </div>
      <ul className={s.clubChips} role="group" aria-label="구단 고르기">
        {clubs.map((c) => {
          const x = idx.clubYear.get(`${c}:${year}`)!;
          const tm = teamByCode(c);
          return (
            <li key={c}>
              <button type="button" className={[s.cchip, sel === c && s.cchipOn, x.have >= x.total && s.cchipDone].filter(Boolean).join(' ')} style={{ '--c1': tm.colors.primary, '--p': `${pctOf(x)}%` } as CSSProperties} onClick={() => onClub(c)} aria-pressed={sel === c}>
                <Emblem team={tm} size={20} decorative />
                <span>{shortLabel(c)}{champ === c && <i className={s.crownMini} aria-label="우승">★</i>}</span>
                <small className="num">{pctText(x)}%</small>
              </button>
            </li>
          );
        })}
      </ul>
      <div className={s.secHead}>
        <h2>{yy(year)} {team.short}{champ === sel && <span className={s.titleTag}>우승</span>}</h2>
        <small>카드 <b className="num">{cy.have}</b>/{cy.total} · 선수 <b className="num">{cy.peopleHave}</b>/{cy.people}</small>
      </div>
      <Grid cards={dexCards(sel, year)} club={sel} year={year} key={`${sel}:${year}`} />
    </section>
  );
}

/* ───────── 카드 판 ───────── */
type Show = 'all' | 'have' | 'miss';
function Grid({ cards, club, year }: { cards: KCard[]; club: ClubCode; year: number | null }) {
  const toast = useToast();
  const [show, setShow] = useState<Show>('all');
  const rows = useMemo(() => [...cards].sort((a, b) => rarity(b.grade) - rarity(a.grade) || b.ovr - a.ovr).map((k) => ({ k, own: ownedCount(k.id) })), [cards]);
  const list = rows.filter((r) => (show === 'all' ? true : show === 'have' ? r.own > 0 : r.own === 0));
  const have = rows.filter((r) => r.own > 0).length;
  const hint = (k: KCard) => {
    const viaYear = k.year != null && year != null;
    toast({
      text: <>아직 못 모은 카드예요 — {viaYear ? <>연도팩 <b>{yy(year!)}</b> · 구단팩 <b>{shortLabel(club)}</b></> : <>구단팩 <b>{shortLabel(club)}</b></>}에서 나와요</>,
      tone: 'info',
      action: { label: '팩 보기', onClick: () => navigate(viaYear ? `/gacha?pack=year&year=${year}` : `/gacha?pack=club&club=${club.toLowerCase()}`) },
    });
  };
  return (
    <div className={s.gridWrap}>
      <div className={s.showRow} role="group" aria-label="보기">
        {([['all', `전체 ${rows.length}`], ['have', `모은 카드 ${have}`], ['miss', `못 모은 카드 ${rows.length - have}`]] as [Show, string][]).map(([v, label]) => (
          <button key={v} type="button" className={[s.showBtn, show === v && s.showOn].filter(Boolean).join(' ')} aria-pressed={show === v} onClick={() => setShow(v)}>{label}</button>
        ))}
      </div>
      {list.length ? (
        <ul className={s.grid}>
          {list.map(({ k, own }) => {
            const inst = (own > 0 && ownedCard(k.id)) || cardInst(k);
            const p = cardProps(inst);
            return (
              <li key={k.id} className={own > 0 ? s.got : s.locked}>
                <CardMini
                  {...p}
                  fluid
                  still
                  isNew={false}
                  onClick={() => (own > 0 ? navigate(`/player/${inst.playerId}`) : hint(k))}
                />
                {own > 1 && <span className={[s.copies, 'num'].join(' ')}>×{own}</span>}
                {own === 0 && <span className={s.lock} aria-hidden><Icon name="lock" size={16} /></span>}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={s.empty}>{show === 'have' ? '아직 모은 카드가 없어요 — 연도팩 · 구단팩으로 모아 보세요' : '이 시즌 카드를 다 모았어요!'}</p>
      )}
    </div>
  );
}
