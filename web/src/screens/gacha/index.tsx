// 영입(카드 뽑기) — 담당: 뽑기 화면 개발자
// 모든 팩 30장(요구 39) · 일반/프리미엄/스페셜/레전드 + 연도팩/구단팩(요구 40) · 확률 공개 · 천장 · 등급별 레전드 이펙트(요구 17)
// 카드 조합(룰렛)은 #/gacha?tab=combo
import { useEffect, useMemo, useState } from 'react';
import type { ScreenProps } from '../../app/screen';
import { navigate } from '../../app/router';
import { PACKS, TEAMS, myTeam, teamById } from '../../game/mock';
import { SET_KIND_KO, statLine } from '../../game/sets';
import { evaluate, initialLineup, store as lineupStore } from '../lineup/calc';
import { GRADES } from '../../game/grades';
import type { ClubCode, GradeId, Pack } from '../../game/types';
import { Button, CoinGP, Emblem, GoldenBall, Icon, Tabs, fmt } from '../../ui';
import { atLeastOne, oddsFor, pullPack, useGacha, type Pick, type PullResult } from './draw';
import { PACK_LOOK, YEAR_OPTIONS } from './local-mock';
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
  const [year, setYear] = useState(() => Number(query.get('year')) || 2027);
  const [club, setClub] = useState<ClubCode>(() => (query.get('club')?.toUpperCase() as ClubCode) || myTeam().code);
  const [oddsOpen, setOddsOpen] = useState(query.get('odds') === '1');
  const [result, setResult] = useState<PullResult | null>(null);
  const [demoStep, setDemoStep] = useState<OpeningStep | undefined>();

  const pack = PACKS.find((p) => p.id === packId) ?? PACKS[1];
  const pick: Pick | null = pack.pick?.kind === 'year' ? { kind: 'year', year } : pack.pick?.kind === 'club' ? { kind: 'club', club } : null;
  const view = useMemo(() => oddsFor(pack, pick), [pack, pick?.kind, year, club]); // eslint-disable-line react-hooks/exhaustive-deps
  const look = PACK_LOOK[pack.id] ?? PACK_LOOK.basic;
  const team = pick?.kind === 'club' ? teamById(pick.club.toLowerCase()) : undefined;
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
          <h2 className={['head', s.title].join(' ')}>{pack.name}{pick && <small>{pick.kind === 'year' ? YEAR_OPTIONS.find((o) => o.year === year)?.tag : team?.short}</small>}</h2>
          <p className={s.desc}>{pick?.kind === 'club' ? `${team?.name} · 그 구단의 모든 연도` : pick?.kind === 'year' ? `${year} 시즌 카드만 · 모든 구단` : look.blurb}</p>
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
          <div className={s.secHead}><h3 className="head">시즌 고르기</h3><span>모든 구단 · 고른 시즌 카드만</span></div>
          <div className={s.years} role="radiogroup" aria-label="시즌">
            {YEAR_OPTIONS.map((o) => (
              <button
                key={o.year}
                type="button"
                role="radio"
                aria-checked={o.year === year}
                className={[s.yearBtn, o.year === year && s.on, o.year < 2025 && s.legendYear, !!o.champ && s.champYear].filter(Boolean).join(' ')}
                onClick={() => setYear(o.year)}
              >
                <b className="num-display">{o.tag}</b>
                <small>{o.year >= 2025 ? (o.year === 2027 ? '이번' : o.year === 2026 ? '지난' : '2년 전') : o.champ ? `${teamById(o.champ.toLowerCase()).short} 우승` : '레전드'}</small>
              </button>
            ))}
          </div>
          <YearNote year={year} />
        </section>
      )}
      {pack.pick?.kind === 'club' && (
        <section className={s.pick} aria-label="구단 고르기">
          <div className={s.secHead}><h3 className="head">구단 고르기</h3><span>연도는 고를 수 없어요 — 그 구단의 모든 연도</span></div>
          <div className={s.clubs} role="radiogroup" aria-label="구단">
            {TEAMS.map((t) => (
              <button
                key={t.code}
                type="button"
                role="radio"
                aria-checked={t.code === club}
                className={[s.clubBtn, t.code === club && s.on].filter(Boolean).join(' ')}
                onClick={() => setClub(t.code)}
                style={{ ['--team' as string]: t.colors.primary }}
              >
                <Emblem team={t} size={34} />
                <span>{t.short}</span>
              </button>
            ))}
          </div>
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

function YearNote({ year }: { year: number }) {
  const o = YEAR_OPTIONS.find((x) => x.year === year);
  if (!o) return null;
  return (
    <div className={s.yearNote}>
      <p><b className="num">{year}</b> · {o.note}{o.champ && o.year < 2027 ? <> · 우승 <b>{teamById(o.champ.toLowerCase()).short}</b>{o.runnerUp ? <> · 준우승 {teamById(o.runnerUp.toLowerCase()).short}</> : null}</> : null}</p>
      {o.legends.length > 0 && (
        <ul>
          {o.legends.map((l) => {
            const t = teamById(l.club.toLowerCase());
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
