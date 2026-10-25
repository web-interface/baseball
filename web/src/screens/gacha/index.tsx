// 영입(카드 뽑기) — 담당: 뽑기 화면 개발자
// 모든 팩 30장(요구 39) · 일반/프리미엄/스페셜/레전드 + 연도팩/구단팩(요구 40) · 확률 공개 · 천장 · 등급별 레전드 이펙트(요구 17)
// 카드 조합은 팀관리 › 선수조합(#/combine)으로 옮겼다 — 예전 주소 #/gacha?tab=combo 는 그리로 넘긴다
import { useEffect, useMemo, useState } from 'react';
import type { ScreenProps } from '../../app/screen';
import { navigate } from '../../app/router';
import { CURRENT_TEAMS, OLD_TEAMS, PACKS, isTeamId, myTeam, teamByCode } from '../../game/mock';
import { CURRENT_SEASON, FIRST_SEASON } from '../../game/world';
import { LAST_REAL_SEASON } from '../../game/history';
import { SET_KIND_KO } from '../../game/sets';
import { evaluate, initialLineup, store as lineupStore } from '../lineup/calc';
import { GRADES } from '../../game/grades';
import type { ClubCode, GradeId, Pack } from '../../game/types';
import { Button, CoinGP, Emblem, GoldenBall, Icon, Tabs, YearPicker, fmt, useToast, type YearCell } from '../../ui';
import { AUTO_MAX, affordCount, atLeastOne, oddsFor, pctStr, pullMany, pullPack, useGacha, type Pick, type PullResult } from './draw';
import { readWallet } from '../../game/wallet';
import { CARD_CAP, totalCards } from '../../game/inventory';
import { PACK_LOOK, YEAR_OPTIONS, clubShort, eraText, yearOption } from './local-mock';
import { PackArt } from './PackArt';
import { OddsBar, PityTally, Price, Swatch, gradeShort } from './bits';
import { OddsSheet } from './OddsSheet';
import { Opening, type OpeningStep } from './Opening';
import { AutoOpen, BulkOpen } from './AutoOpen';
import { coolText, nextQuota, quotaKo, quotaPacks, quotaView, useAutoQuota } from './autoQuota';
import { LEVEL_KO } from '../../season/league';
import s from './Gacha.module.css';

const TAB_LABEL: Record<string, string> = { basic: '일반', premium: '프리미엄', special: '스페셜', legend: '레전드', year: '연도', club: '구단' };
/** 팩 k개 값 */
const times = (p: Pack['price'], k: number): Pack['price'] => (p.ball != null ? { ball: p.ball * k } : { gp: (p.gp ?? 0) * k });


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
      next: { bonus: `+${x.next!.v}단계` },
      current: x.cur ? `+${x.cur.v}단계` : '',
    }));
}

const DEMO_DONE = new Set<string>();

export default function GachaScreen({ query }: ScreenProps) {
  const combo = query.get('tab') === 'combo';
  useEffect(() => { if (combo) navigate('/combine', { replace: true }); }, [combo]);
  if (combo) return null;
  return <Store query={query} />;
}

function Store({ query }: { query: URLSearchParams }) {
  const g = useGacha();
  const toast = useToast();
  const qp = query.get('pack');
  const [packId, setPackId] = useState(() => (qp && PACKS.some((p) => p.id === qp) ? qp : 'premium'));
  const [year, setYear] = useState(() => { const y = Number(query.get('year')); return y >= FIRST_SEASON && y <= LAST_REAL_SEASON ? y : LAST_REAL_SEASON; });
  const [club, setClub] = useState<ClubCode>(() => { const q = query.get('club')?.toLowerCase(); return q && isTeamId(q) ? (q.toUpperCase() as ClubCode) : myTeam().code; });
  const [oddsOpen, setOddsOpen] = useState(query.get('odds') === '1');
  const [result, setResult] = useState<PullResult | null>(null);
  const [demoStep, setDemoStep] = useState<OpeningStep | undefined>();
  // 자동 열기 — 고른 팩 수(1~10) · 연 결과
  const [autoN, setAutoN] = useState(AUTO_MAX);
  const [auto, setAuto] = useState<{ runs: PullResult[]; asked: number } | null>(null);
  // 가득 찰 때까지 (휴대폰용 — 한 번 눌러 두면 상한까지)
  const [bulk, setBulk] = useState(0);
  // '한도까지 열기' 한도 — 리그 단계마다 (연습생 1만 장 … 레전드 한도 없음), 다 쓰면 1분 쉬기. 'N팩 자동 열기'(1~10팩)는 시간 제한 없음 (사용자 지시 10-25)
  const aq = useAutoQuota();

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

  // 보관함이 상한(10만 장)을 넘으면 카드구매를 막는다 — 선수조합 › 자동 정리로 줄이고 오게 (사용자 지시)
  const total = totalCards();
  const full = total > CARD_CAP;
  const goClean = () => { setResult(null); setAuto(null); navigate('/combine?auto=1'); };
  const open = () => {
    if (totalCards() > CARD_CAP) { toast({ text: '보관함이 가득 찼어요', tone: 'bad' }); goClean(); return; }
    setDemoStep(undefined); setResult(pullPack(pack, pick));
  };
  // 자동 열기 — 살 수 있는 만큼(최대 고른 수) 한 번에 열고 요약으로. 한도 · 쉬는 시간과 상관없음
  const qPacks = quotaPacks(pack.size, aq);
  const nAuto = Math.min(autoN, affordCount(pack, g.wallet));
  const coolMsg = () => `한도를 다 썼어요. ${coolText(aq)} 뒤 다시 열 수 있어요`;
  const autoOpen = () => {
    if (totalCards() > CARD_CAP) { toast({ text: '보관함이 가득 찼어요', tone: 'bad' }); goClean(); return; }
    const want = Math.min(autoN, affordCount(pack, readWallet()));
    const runs = pullMany(pack, pick, want);
    if (runs.length) { setResult(null); setAuto({ runs, asked: want }); }
  };
  const startBulk = () => {
    if (totalCards() > CARD_CAP) { goClean(); return; }
    if (quotaView().cooling) { toast({ text: coolMsg(), tone: 'bad' }); return; }
    setBulk(Date.now());
  };
  const nextQ = nextQuota(aq.level);

  return (
    <div className={s.screen}>
      <Tabs
        className={s.tabs}
        aria-label="팩 고르기"
        value={pack.id}
        onChange={(v) => setPackId(v)}
        items={PACKS.map((p) => ({ value: p.id, label: TAB_LABEL[p.id] ?? p.name }))}
      />

      {full && (
        <div className={s.capBar} role="alert">
          <p><b>보관함 가득</b> <span className="num">{total.toLocaleString()}</span>/<span className="num">{CARD_CAP.toLocaleString()}</span>장</p>
          <Button size="s" onClick={goClean}>자동 정리</Button>
        </div>
      )}
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
            {pick?.kind === 'club' && team ? `${team.name} ${eraText(team.code)}`
              : pick?.kind === 'year' ? `${year} 시즌 카드만`
              : look.blurb}
          </p>
          <dl className={s.facts}>
            {[top, second].filter(Boolean).map((r) => (
              <div key={r.grade} className={s.fact}>
                <dt><Swatch grade={r.grade} /> {gradeShort(r.grade)}</dt>
                <dd>
                  <b className="num">{pctStr(r.pct)}%</b>
                  <span>팩당 <span className="num">{pctStr(atLeastOne(r.pct) * 100)}%</span></span>
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
            disabled={!affordable || full}
            trailing={<Price price={pack.price} className={s.buyPrice} />}
          >
            30장 열기
          </Button>
          <div className={s.auto}>
            <div className={s.autoRow}>
              <span className={s.autoK}>자동 열기</span>
              <div className={s.stepper} role="group" aria-label="자동으로 열 팩 수">
                <button type="button" onClick={() => setAutoN((x) => Math.max(1, x - 1))} disabled={autoN <= 1} aria-label="1팩 줄이기"><Icon name="minus" size={15} /></button>
                <span><b className="num">{autoN}</b>팩</span>
                <button type="button" onClick={() => setAutoN((x) => Math.min(AUTO_MAX, x + 1))} disabled={autoN >= AUTO_MAX} aria-label="1팩 늘리기"><Icon name="plus" size={15} /></button>
              </div>
            </div>
            <Button
              variant="secondary"
              size="s"
              block
              className={s.autoBtn}
              onClick={autoOpen}
              disabled={nAuto < 1 || full}
              trailing={<Price price={times(pack.price, Math.max(1, nAuto))} className={s.buyPrice} />}
            >
              {nAuto > 0 && nAuto < autoN ? <><span className="num">{nAuto}</span>팩만 자동</> : <><span className="num">{autoN}</span>팩 자동 열기</>}
            </Button>
            <button type="button" className={s.bulkBtn} onClick={startBulk} disabled={nAuto < 1 || full || aq.cooling || qPacks < 1}>
              {aq.cooling ? <span><span className="num">{coolText(aq)}</span> 뒤 다시 한도까지 열기</span> : aq.unlimited ? '가득 찰 때까지 열기' : '한도까지 열기'}
            </button>
            {/* '한도까지 열기' 한도 — 리그 단계마다. 다 쓰면 1분 쉬기 */}
            <div className={[s.quota, aq.cooling && s.quotaCool].filter(Boolean).join(' ')} aria-live="polite">
              <p className={s.quotaTop}>
                <span className={s.quotaLv}>{LEVEL_KO[aq.level]}</span>
                {aq.unlimited
                  ? <span>한도까지 열기 <b>한도 없음</b></span>
                  : aq.cooling
                    ? <span>쉬는 중 <b className="num">{coolText(aq)}</b></span>
                    : <span>한도까지 열기 <b className="num">{aq.left.toLocaleString()}</b><i>/{aq.quota.toLocaleString()}장</i></span>}
              </p>
              {!aq.unlimited && (
                <div className={s.quotaBar} aria-hidden>
                  <i style={{ width: `${aq.cooling ? Math.max(0, Math.min(100, 100 - ((aq.until - Date.now()) / 600))) : Math.round((aq.left / aq.quota) * 100)}%` }} />
                </div>
              )}
              {nextQ && <small className={s.quotaNext}>다음 {nextQ.ko} {quotaKo(nextQ.quota)}</small>}
            </div>
          </div>
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
          <div className={s.secHead}><h3 className="head">시즌 고르기</h3><span className="num">{FIRST_SEASON}~{LAST_REAL_SEASON}</span></div>
          <YearPicker className={s.yearPicker} cells={YEAR_CELLS} value={year} onChange={setYear} aria-label="시즌" />
          <YearNote year={year} />
        </section>
      )}
      {pack.pick?.kind === 'club' && (
        <section className={s.pick} aria-label="구단 고르기">
          <div className={s.secHead}><h3 className="head">구단 고르기</h3></div>
          <ClubGrid label="지금 구단" teams={CURRENT_TEAMS} club={club} setClub={setClub} />
          <ClubGrid label="옛 구단" teams={OLD_TEAMS} club={club} setClub={setClub} old />
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
              <b className="num">{pctStr(r.pct)}%</b>
            </li>
          ))}
        </ul>
        {view.missing.length > 0 && (
          <p className={s.missing} title="빠진 몫은 남은 등급에 비율대로 나눠요">
            <Icon name="info" size={15} />
            <span>
              <b>없는 등급</b> {view.missing.map((m) => gradeShort(m.grade)).join(' · ')}
            </span>
          </p>
        )}
      </section>

      {/* ───── 천장 ───── */}
      <section className={s.sec}>
        <div className={s.secHead}>
          <h3 className="head">천장</h3>
          <span>{pack.pity.guaranteed}</span>
        </div>
        <div className={s.pityRow}>
          <p className={s.pityBig}>천장까지 <b className="num-display">{toPity}</b>팩</p>
          <div className={s.pityRight}>
            <PityTally count={pity} max={pack.pity.max} />
            <p><span className="num">{pity}</span>/<span className="num">{pack.pity.max}</span></p>
          </div>
        </div>
      </section>

      {/* ───── 조합 ───── */}
      <section className={s.sec}>
        <div className={s.secHead}>
          <h3 className="head">맞출 수 있는 세트</h3>
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
                <p>{c.left > 0 ? <><b className="num">{c.left}</b>명 더 → <em>{c.next.bonus}</em></> : <>완성 {c.current}</>}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className={s.empty}>아직 없어요</p>
        )}
      </section>

      {/* ───── 선수조합 입구 (팀관리 › 선수조합) ───── */}
      <button type="button" className={s.toCombo} onClick={() => navigate('/combine')}>
        <span className={s.toComboText}>
          <b className="head">선수조합</b>
          <span>카드 3~5장으로 새 카드 1장</span>
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
          onCombo={() => { setResult(null); navigate('/combine'); }}
        />
      )}
      {bulk > 0 && (
        <BulkOpen
          key={bulk}
          pack={pack}
          pick={pick}
          onClose={() => setBulk(0)}
          onClean={() => { setBulk(0); navigate('/combine?auto=1'); }}
          onCombo={() => { setBulk(0); navigate('/combine'); }}
        />
      )}
      {auto && (
        <AutoOpen
          key={auto.runs[0].requestId}
          runs={auto.runs}
          asked={auto.asked}
          onClose={() => setAuto(null)}
          onAgain={nAuto > 0 ? autoOpen : undefined}
          againN={nAuto}
          onCombo={() => { setAuto(null); navigate('/combine'); }}
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

function ClubGrid({ label, teams, club, setClub, old }: { label: string; teams: ReturnType<typeof teamByCode>[]; club: ClubCode; setClub: (c: ClubCode) => void; old?: boolean }) {
  return (
    <div className={s.clubGroup}>
      <p className={s.clubGroupHead}><b>{label}</b></p>
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
    </div>
  );
}
