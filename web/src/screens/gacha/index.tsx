// 영입(카드 뽑기) — 담당: 뽑기 화면 개발자
// 모든 팩 30장(요구 39) · 일반/프리미엄/스페셜/레전드 + 연도팩/구단팩(요구 40) · 확률 공개 · 천장 · 등급별 레전드 이펙트(요구 17)
// 카드 조합(룰렛)은 #/gacha?tab=combo
import { useEffect, useMemo, useState } from 'react';
import type { ScreenProps } from '../../app/screen';
import { navigate } from '../../app/router';
import { CURRENT_TEAMS, OLD_TEAMS, PACKS, isTeamId, myTeam, teamByCode } from '../../game/mock';
import { CURRENT_SEASON, FIRST_SEASON } from '../../game/world';
import { LAST_REAL_SEASON } from '../../game/history';
import { SET_KIND_KO, statLine } from '../../game/sets';
import { evaluate, initialLineup, store as lineupStore } from '../lineup/calc';
import { GRADES } from '../../game/grades';
import type { ClubCode, GradeId, Pack } from '../../game/types';
import { Button, CoinGP, Emblem, GoldenBall, Icon, Tabs, YearPicker, fmt, type YearCell } from '../../ui';
import { atLeastOne, oddsFor, pullPack, useGacha, type Pick, type PullResult } from './draw';
import { PACK_LOOK, YEAR_OPTIONS, clubShort, eraText, yearOption } from './local-mock';
import { PackArt } from './PackArt';
import { OddsBar, PityTally, Price, Swatch, gradeShort } from './bits';
import { OddsSheet } from './OddsSheet';
import { Opening, type OpeningStep } from './Opening';
import { Roulette } from './Roulette';
import s from './Gacha.module.css';

const TAB_LABEL: Record<string, string> = { basic: '일반', premium: '프리미엄', special: '스페셜', legend: '레전드', year: '연도', club: '구단' };


/** 이 팩으로 맞출 수 있는 세트덱 — 지금 라인업(엔트리 20명) 진행에서 */
function combosFor(pick: Pick | null) {
  const ev = evaluate(lineupStore.get() ?? initialLineup());
  const club = pick?.kind === 'club' ? pick.club : null;
  const year = pick?.kind === 'year' ? pick.year : null;
  return ev.sets.filter((x) => x.next && (club ? x.code === club : year != null ? x.year === year : true))
    .slice(0, 3)
    .map((x) => ({
      id: x.id,
      label: `${x.name} · ${SET_KIND_KO[x.kind]}`,
      have: x.have,
      need: x.next!.at,
      left: Math.max(0, x.next!.at - x.have),
      next: { bonus: `+${x.next!.v} 단계 — ${statLine(x.next!.bat, 2)} · ${statLine(x.next!.pit, 1)}` },
      current: x.cur ? `+${x.cur.v} 단계` : '',
    }));
}

const DEMO_DONE = new Set<string>();

export default function GachaScreen({ query }: ScreenProps) {
  if (query.get('tab') === 'combo') return <Roulette />;
  return <Store query={query} />;
}

function Store({ query }: { query: URLSearchParams }) {
  const g = useGacha();
  const qp = query.get('pack');
  const [packId, setPackId] = useState(() => (qp && PACKS.some((p) => p.id === qp) ? qp : 'premium'));
  const [year, setYear] = useState(() => { const y = Number(query.get('year')); return y >= FIRST_SEASON && y <= LAST_REAL_SEASON ? y : LAST_REAL_SEASON; });
  const [club, setClub] = useState<ClubCode>(() => { const q = query.get('club')?.toLowerCase(); return q && isTeamId(q) ? (q.toUpperCase() as ClubCode) : myTeam().code; });
  const [oddsOpen, setOddsOpen] = useState(query.get('odds') === '1');
  const [result, setResult] = useState<PullResult | null>(null);
  const [demoStep, setDemoStep] = useState<OpeningStep | undefined>();

  const pack = PACKS.find((p) => p.id === packId) ?? PACKS[1];
  const pick: Pick | null = pack.pick?.kind === 'year' ? { kind: 'year', year } : pack.pick?.kind === 'club' ? { kind: 'club', club } : null;
  const view = useMemo(() => oddsFor(pack, pick), [pack, pick?.kind, year, club]); // eslint-disable-line react-hooks/exhaustive-deps
  const look = PACK_LOOK[pack.id] ?? PACK_LOOK.basic;
  const team = pick?.kind === 'club' ? teamByCode(pick.club) : undefined;
  const yo = pick?.kind === 'year' ? yearOption(year) : undefined;
  const pity = g.pityOf(pack.id);
  const toPity = pack.pity.max - pity;
  const combos = combosFor(pick);

  // 데모 — ?demo=open&pack=legend&best=signature&step=grid|flip|cine|done (스크린샷용)
  useEffect(() => {
    if (query.get('demo') !== 'open') return; // 미리보기에서도 열린다 (목업 단계)
    const key = location.hash;
    if (DEMO_DONE.has(key)) return;
    DEMO_DONE.add(key);
    const best = query.get('best') as GradeId | null;
    setDemoStep((query.get('step') as OpeningStep) || undefined);
    setResult(pullPack(pack, pick, { seed: query.get('seed') ?? 'demo', forceBest: best && GRADES[best] ? best : undefined }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const top = view.rows[0];
  const second = view.rows.find((r) => r.grade === 'legend' && r !== top) ?? view.rows[1];
  const affordable = pack.price.ball != null ? g.wallet.ball >= pack.price.ball : g.wallet.gp >= (pack.price.gp ?? 0);

  const open = () => { setDemoStep(undefined); setResult(pullPack(pack, pick)); };

  return (
    <div className={s.screen}>
      <Tabs
        className={s.tabs}
        aria-label="팩 고르기"
        value={pack.id}
        onChange={(v) => setPackId(v)}
        items={PACKS.map((p) => ({ value: p.id, label: TAB_LABEL[p.id] ?? p.name }))}
      />

      {/* ───── 무대: 고른 팩 ───── */}
      <section className={s.stage} aria-label={`${pack.name} 고름`}>
        <div className={s.stageBg} aria-hidden>
          <i className={s.beamL} /><i className={s.beamR} />
          <span className={['num-display', s.bigNum].join(' ')}>30</span>
        </div>
        <div className={s.packCol}>
          <PackArt
            key={pack.id + (team?.id ?? '') + year}
            skin={look.skin}
            name={pack.name}
            en={look.en}
            tag={`30장 · ${look.tag}`}
            year={pick?.kind === 'year' ? year : undefined}
            team={team}
            shine
            className={s.packArt}
          />
        </div>
        <div className={s.info}>
          <p className={s.kicker}>
            <span className="num">{look.en}</span>
            {pack.limited && <em>{pack.limited}</em>}
          </p>
          <h2 className={['head', s.title].join(' ')}>{pack.name}{pick && <small>{pick.kind === 'year' ? yo?.tag : clubShort(pick.club)}</small>}</h2>
          <p className={s.desc}>
            {pick?.kind === 'club' && team ? `${team.name} · ${eraText(team.code)} 모든 연도${team.old ? ' · 옛 구단' : ''}`
              : pick?.kind === 'year' ? `${year} 시즌 카드만 · 그 해 ${yo?.clubs.length ?? 10}개 구단`
              : look.blurb}
          </p>
          <dl className={s.facts}>
            {[top, second].filter(Boolean).map((r) => (
              <div key={r.grade} className={s.fact}>
                <dt><Swatch grade={r.grade} /> {gradeShort(r.grade)}</dt>
                <dd>
                  <b className="num">{r.pct < 1 ? r.pct.toFixed(2) : r.pct.toFixed(1)}%</b>
                  <span>팩당 <span className="num">{(atLeastOne(r.pct) * 100).toFixed(r.pct < 0.5 ? 1 : 0)}%</span></span>
                </dd>
              </div>
            ))}
            <div className={[s.fact, s.factPity].join(' ')}>
              <dt>천장까지</dt>
              <dd><b className="num">{toPity}</b><span>팩</span></dd>
            </div>
          </dl>
          <Button
            variant="primary"
            size="l"
            block
            className={s.buy}
            onClick={open}
            disabled={!affordable}
            trailing={<Price price={pack.price} className={s.buyPrice} />}
          >
            30장 열기
          </Button>
          <p className={s.wallet}>
            보유 {pack.price.ball != null
              ? <><GoldenBall size={11} /> <span className="num">{fmt.int(g.wallet.ball)}</span></>
              : <><CoinGP size={11} /> <span className="num">{fmt.int(g.wallet.gp)}</span></>}
          </p>
        </div>
      </section>

      {/* ───── 골라 뽑기 ───── */}
      {pack.pick?.kind === 'year' && (
        <section className={s.pick} aria-label="시즌 고르기">
          <div className={s.secHead}><h3 className="head">시즌 고르기</h3><span>{FIRST_SEASON}~{LAST_REAL_SEASON} 한 해씩 · 그 해 그 구단에서 뛴 실제 선수 카드만</span></div>
          <YearPicker className={s.yearPicker} cells={YEAR_CELLS} value={year} onChange={setYear} aria-label="시즌" />
          <YearNote year={year} />
        </section>
      )}
      {pack.pick?.kind === 'club' && (
        <section className={s.pick} aria-label="구단 고르기">
          <div className={s.secHead}><h3 className="head">구단 고르기</h3><span>연도는 고를 수 없어요 — 그 구단이 있던 모든 연도</span></div>
          <ClubGrid label="지금 구단" note={`2027 리그 10개 구단`} teams={CURRENT_TEAMS} club={club} setClub={setClub} />
          <ClubGrid label="옛 구단" note="없어진 구단 · 지금 이름이 되기 전 시대" teams={OLD_TEAMS} club={club} setClub={setClub} old />
        </section>
      )}

      {/* ───── 확률 공개 ───── */}
      <section className={s.sec}>
        <div className={s.secHead}>
          <h3 className="head">확률 공개</h3>
          <button type="button" className={s.link} onClick={() => setOddsOpen(true)}>전체 표 <Icon name="chevron" size={14} /></button>
        </div>
        <OddsBar rows={view.rows} className={s.oddsBar} />
        <ul className={s.legendList}>
          {view.rows.map((r) => (
            <li key={r.grade}>
              <Swatch grade={r.grade} />
              <span>{gradeShort(r.grade)}</span>
              <b className="num">{r.pct < 1 ? r.pct.toFixed(2) : r.pct.toFixed(1)}%</b>
            </li>
          ))}
        </ul>
        {view.missing.length > 0 && (
          <p className={s.missing}>
            <Icon name="info" size={15} />
            <span>
              <b>이 조합에 없는 등급</b> {view.missing.map((m) => gradeShort(m.grade)).join(' · ')} — 빠진 몫은 남은 등급에 비율대로 나눴어요.
            </span>
          </p>
        )}
      </section>

      {/* ───── 천장 ───── */}
      <section className={s.sec}>
        <div className={s.secHead}>
          <h3 className="head">천장</h3>
          <span>팩 종류마다 따로</span>
        </div>
        <div className={s.pityRow}>
          <p className={s.pityBig}>천장까지 <b className="num-display">{toPity}</b>팩</p>
          <div className={s.pityRight}>
            <PityTally count={pity} max={pack.pity.max} />
            <p><span className="num">{pity}</span>/<span className="num">{pack.pity.max}</span> · <span className="num">{pack.pity.max}</span>번째 팩에서 {pack.pity.guaranteed}</p>
          </div>
        </div>
      </section>

      {/* ───── 조합 ───── */}
      <section className={s.sec}>
        <div className={s.secHead}>
          <h3 className="head">이 팩으로 맞출 수 있는 조합</h3>
          <span>지금 라인업 기준</span>
        </div>
        {combos.length ? (
          <ul className={s.combos}>
            {combos.map((c) => (
              <li key={c.id}>
                <div className={s.comboTop}>
                  <b>{c.label}</b>
                  <span className="num">{c.have}<i>/{c.need}</i></span>
                </div>
                <div className={s.comboBar} style={{ ['--n' as string]: c.need }}>
                  {Array.from({ length: c.need }, (_, i) => <i key={i} className={i < c.have ? s.on : undefined} />)}
                </div>
                <p>{c.left > 0 ? <><b className="num">{c.left}</b>명 더 모으면 <em>{c.next.bonus}</em></> : <>다 모았어요 · {c.current}</>}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className={s.empty}>{team?.short ?? '이 팩'} 카드로 새 세트를 시작해요 — 같은 구단·같은 연도 5명부터 세트덱이 켜져요</p>
        )}
      </section>

      {/* ───── 카드 조합(룰렛) 입구 ───── */}
      <button type="button" className={s.toCombo} onClick={() => navigate('/gacha?tab=combo')}>
        <span className={s.toComboText}>
          <b className="head">카드 조합</b>
          <span>안 쓰는 카드 5장을 넣고 돌려요. 칸 크기가 곧 확률이에요.</span>
        </span>
        <Icon name="arrow-right" size={20} />
      </button>

      <OddsSheet open={oddsOpen} onClose={() => setOddsOpen(false)} pack={pack} pick={pick} view={view} pity={pity} />

      {result && (
        <Opening
          key={result.requestId}
          result={result}
          step={demoStep}
          onClose={() => setResult(null)}
          onAgain={affordable ? open : undefined}
          onCombo={() => { setResult(null); navigate('/gacha?tab=combo'); }}
        />
      )}
    </div>
  );
}

/** 연도팩 칸 — 숫자 아래 그 해 우승 구단 (최근 세 해는 이번·지난·2년 전, 가을야구가 안 끝난 해는 '가을야구 중') */
const YEAR_CELLS: YearCell[] = YEAR_OPTIONS.map((o) => {
  const champ = o.champ ? teamByCode(o.champ) : undefined;
  const recent = o.year === CURRENT_SEASON ? '이번 시즌' : o.live ? '가을야구 중' : undefined;
  return {
    year: o.year,
    sub: recent ?? champ?.short,
    tone: champ ? 'champ' : undefined,
    label: `${o.year}년${champ ? ` · ${champ.name} 우승` : ''}`,
  };
});

function ClubGrid({ label, note, teams, club, setClub, old }: { label: string; note: string; teams: ReturnType<typeof teamByCode>[]; club: ClubCode; setClub: (c: ClubCode) => void; old?: boolean }) {
  return (
    <div className={s.clubGroup}>
      <p className={s.clubGroupHead}><b>{label}</b><span>{note}</span></p>
      <div className={s.clubs} role="radiogroup" aria-label={label}>
        {teams.map((t) => (
          <button
            key={t.code}
            type="button"
            role="radio"
            aria-checked={t.code === club}
            aria-label={`${t.name} ${eraText(t.code)}`}
            className={[s.clubBtn, t.code === club && s.on].filter(Boolean).join(' ')}
            onClick={() => setClub(t.code)}
            style={{ ['--team' as string]: t.colors.primary }}
          >
            <Emblem team={t} size={34} />
            <span>{t.short}</span>
            {old && <small>{t.name.split(' ')[0]} <span className="num">{`’${String(t.era?.[0] ?? 0).slice(2)}–’${String(t.era?.[1] ?? 0).slice(2)}`}</span></small>}
          </button>
        ))}
      </div>
    </div>
  );
}

function YearNote({ year }: { year: number }) {
  const o = yearOption(year);
  if (!o) return null;
  const champ = o.champ ? teamByCode(o.champ) : undefined;
  const runner = o.runnerUp ? teamByCode(o.runnerUp) : undefined;
  return (
    <div className={s.yearNote}>
      <p><b className="num">{year}</b> · {o.note}</p>
      {champ && (
        <p className={s.champLine}>
          우승 <b>{champ.name}</b>{runner ? <> · 준우승 {runner.name}</> : null}
        </p>
      )}
      <div className={s.yearClubs} aria-label={`${year} 시즌 구단 ${o.clubs.length}개`}>
        {o.clubs.map((c) => {
          const t = teamByCode(c);
          return (
            <span key={c} className={[s.yearClub, c === o.champ && s.yearChamp].filter(Boolean).join(' ')} title={t.name}>
              <Emblem team={t} size={22} />
              <small>{t.short}</small>
            </span>
          );
        })}
      </div>
      {o.legends.length > 0 && (
        <ul>
          {o.legends.map((l) => {
            const t = teamByCode(l.club);
            return (
              <li key={l.club}>
                <Emblem team={t} size={18} />
                <span><b>{t.name}</b> {l.era.endsWith('우승') ? '' : `‘${l.era}’ `}— {l.desc}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
