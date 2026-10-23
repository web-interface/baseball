// 훈련 #/enhance (팀관리 › 훈련) — 내 카드 한 장을 골라 능력치 하나씩 훈련한다. 규칙 · 표는 game/training, 저장 · 시도는 game/inventory.
//   ?card=<보유 카드 id> 그 카드로 열기 · ?place=<장소 id> 그 장소로
//   카드(라인업 먼저) → 훈련 장소 13곳(그림) → 능력치(지금 값 + 훈련으로 오른 값) · 특수구질(따로 · 더 어려움)
//   → 성공 확률(기본 · 특수구질 ×0.55 · 장소 · 연속 실패 보정) · 비용 → 훈련(짧은 성공/실패 연출) · 단계 0~10 (5부터 불빛 · 10 최종)
//   같은 카드 중복으로 오르는 강화(I~X)는 따로 — 선수보관 카드 시트 · 선수 정보 강화 탭 · #/cards?mode=enhance 목록.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { ScreenProps } from '../../app/screen';
import { Link, setQueryQuiet } from '../../app/router';
import { Card, CardMini, cardProps } from '../../cards';
import { Button, CoinGP, GoldenBall, Icon, Sheet, Tabs, fmt, useToast } from '../../ui';
import { GRADES } from '../../game/grades';
import { POS_KO, ROLE_KO } from '../../game/labels';
import { playerOfCard, teamById } from '../../game/mock';
import { lineupIds, ownedCard, ownedIds, trainOf, trainQuote, tryTrain, useInventory, type TrainState, type TrainTry } from '../../game/inventory';
import { useWallet, type Wallet } from '../../game/wallet';
import {
  BASIC_PLACE, CHANCE_CAP, CODE_KO, GLOW_FROM, PLACES, SIG, SIG_MUL, TRAIN_BASE, TRAIN_MAX, TR_PITY_MAX, TR_PITY_STEP,
  costOf, gainAt, pctText, placeBonus, placeById, placeLock, specText, stageLabel, sumGains, trainOvrBonus, trainStats,
  type PlaceId, type TrainCost, type TrainOdds, type TrainPlace,
} from '../../game/training';
import type { CardInst } from '../../game/types';
import { PlaceArt } from './PlaceArt';
import s from './Train.module.css';

/* ───────── 이 기기에 기억 (고른 카드 · 장소 · 카드별 능력치) ───────── */
const PREF_KEY = 'bb.train';
interface Pref { card?: string; place?: string; keys?: Record<string, string> }
function readPref(): Pref {
  try {
    const v = JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') as Pref;
    return v && typeof v === 'object' ? v : {};
  } catch { return {}; }
}
function savePref(patch: Pref) {
  try {
    const cur = readPref();
    localStorage.setItem(PREF_KEY, JSON.stringify({ ...cur, ...patch, keys: { ...cur.keys, ...patch.keys } }));
  } catch { /* 저장이 막혀 있으면 이번 방문만 */ }
}

const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ');
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const yy = (c: CardInst) => (c.year != null && GRADES[c.grade].yearTagged ? ` ${fmt.yearTag(c.year)}` : '');

/** 비용 — GP 동전 '10.2만' · 골든볼 '1,264' */
function CostText({ cost }: { cost: TrainCost }) {
  if (cost.ball != null) return <span className={s.cost}><GoldenBall size={15} /><span className="num">{fmt.int(cost.ball)}</span></span>;
  return <span className={s.cost}><CoinGP size={15} /><span className="num">{fmt.kr(cost.gp ?? 0)}</span></span>;
}
const canPay = (w: Wallet, c: TrainCost) => w.gp >= (c.gp ?? 0) && w.ball >= (c.ball ?? 0);

/* ───────── 화면 ───────── */
interface LogItem { at: number; cardId: string; name: string; ko: string; place: string; success: boolean; from: number; to: number; gain: number; chance: number }

export default function TrainScreen({ query }: ScreenProps) {
  const ver = useInventory();
  const owned = useMemo(() => ownedIds(), [ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const ownedSet = useMemo(() => new Set(owned), [owned]);
  // 라인업 카드 먼저 (포수 · 내야 · 외야 · 지명 → 선발 → 불펜 → 마무리 → 벤치)
  const lineup = useMemo(() => [...lineupIds()].filter((id) => ownedSet.has(id)), [ownedSet]);

  const qCard = query.get('card');
  const [cardKey, setCardKey] = useState<string | null>(() => qCard ?? readPref().card ?? null);
  useEffect(() => { if (qCard) setCardKey(qCard); }, [qCard]);
  const id = cardKey && ownedSet.has(cardKey) ? cardKey : lineup[0] ?? owned[0] ?? null;

  const qPlace = query.get('place');
  const [placeId, setPlaceIdS] = useState<PlaceId>(() => (placeById(qPlace) ?? placeById(readPref().place) ?? BASIC_PLACE).id);
  const setPlaceId = useCallback((pid: PlaceId) => { setPlaceIdS(pid); savePref({ place: pid }); setQueryQuiet({ place: pid === 'club' ? null : pid }); }, []);

  const [picking, setPicking] = useState(false);
  const [log, setLog] = useState<LogItem[]>([]);
  const choose = (cid: string) => { setCardKey(cid); savePref({ card: cid }); setQueryQuiet({ card: cid }); setPicking(false); };
  const onLog = useCallback((x: LogItem) => setLog((xs) => [x, ...xs].slice(0, 6)), []);

  return (
    <div className={s.page}>
      <header className={s.head}>
        <div className={s.titleRow}>
          <h1 className={cx('head', s.h1)}>훈련</h1>
          <Link to="/cards?mode=enhance" className={s.toEnh}>카드 강화 I~X<Icon name="chevron" size={16} /></Link>
        </div>
        <p className={s.lead}>능력치 하나를 골라 훈련해요. 성공하면 단계가 오르고 그 능력치가 올라요. 실패하면 비용만 들어요.</p>
      </header>

      {id ? (
        <Trainer key={id} id={id} placeId={placeId} setPlaceId={setPlaceId} onPickCard={() => setPicking(true)} log={log} onLog={onLog} onOpen={choose} />
      ) : (
        <>
          <p className={s.empty}>훈련할 카드가 없어요.</p>
          <RulesTable lv={0} />
        </>
      )}

      <CardPicker open={picking} onClose={() => setPicking(false)} cur={id} owned={owned} lineup={lineup} onPick={choose} />
    </div>
  );
}

/* ───────── 한 카드 훈련 ───────── */
interface Roll {
  phase: 'roll' | 'done';
  /** 누르기 전 모습 — 연출이 끝날 때까지 결과를 미리 보여 주지 않게 */
  before: { card: CardInst; tr: TrainState; odds: TrainOdds; cost: TrainCost; gain: number };
  res: Extract<TrainTry, { ok: true }>;
  ko: string;
}

function Trainer({ id, placeId, setPlaceId, onPickCard, log, onLog, onOpen }: {
  id: string; placeId: PlaceId; setPlaceId: (p: PlaceId) => void; onPickCard: () => void;
  log: LogItem[]; onLog: (x: LogItem) => void; onOpen: (id: string) => void;
}) {
  const wallet = useWallet();
  const toast = useToast();
  const live = ownedCard(id)!;
  const liveTr = trainOf(id);
  const [roll, setRoll] = useState<Roll | null>(null);
  const rolling = roll?.phase === 'roll';
  const card = rolling ? roll.before.card : live;
  const tr = rolling ? roll.before.tr : liveTr;
  const p = playerOfCard(card);
  const { stats, sig } = trainStats(p, card);
  const keys = [...stats.map((x) => x.key), ...(sig ? [SIG] : [])];

  const [keyS, setKeyS] = useState<string>(() => {
    const k = readPref().keys?.[id];
    return k && keys.includes(k) ? k : stats[0]?.key ?? SIG;
  });
  const place = placeById(placeId) ?? BASIC_PLACE;
  const lock = placeLock(place, p, card, tr.lv);
  // 고른 장소를 이 카드가 못 쓰면 기본 연습장으로 (카드를 바꿨을 때)
  useEffect(() => { if (lock && !rolling) setPlaceId('club'); }, [lock, rolling, setPlaceId]);
  const key = place.sigOnly ? SIG : keyS;

  const quote = trainQuote(id, key, place.id);
  const q = rolling ? { odds: roll.before.odds, cost: roll.before.cost, gain: roll.before.gain, lv: roll.before.tr.lv } : 'odds' in quote ? quote : null;

  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const statKo = (k: string) => (k === SIG ? '특수구질' : stats.find((x) => x.key === k)?.ko ?? CODE_KO[k] ?? k);
  const pickKey = (k: string) => { if (rolling) return; setKeyS(k); setRoll(null); savePref({ keys: { [id]: k } }); };
  const pickPlace = (pid: PlaceId) => { if (rolling) return; setPlaceId(pid); setRoll(null); };

  const go = () => {
    if (rolling || !('odds' in quote)) return;
    const before = { card: live, tr: liveTr, odds: quote.odds, cost: quote.cost, gain: quote.gain };
    const r = tryTrain(id, key, place.id);
    if (!r.ok) {
      toast({ text: r.why === 'pay' ? (place.pay === 'ball' ? '골든볼이 모자라요' : 'GP가 모자라요') : r.why === 'locked' ? `${place.name}: ${r.text}` : '지금은 훈련할 수 없어요', tone: 'bad' });
      return;
    }
    const ko = statKo(key);
    setRoll({ phase: 'roll', before, res: r, ko });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setRoll((x) => (x ? { ...x, phase: 'done' } : x));
      onLog({ at: Date.now(), cardId: id, name: p.name, ko, place: place.name, success: r.success, from: r.from, to: r.to, gain: r.gain, chance: r.chance });
    }, reduced() ? 160 : ROLL_MS);
  };

  const team = teamById(p.teamId);
  const posKo = p.pos === 'P' ? `${ROLE_KO[p.role ?? 'SP']} 투수` : POS_KO[p.pos];
  const maxed = tr.lv >= TRAIN_MAX;
  const nextNote = maxed ? '훈련을 모두 마쳤어요' : tr.lv < GLOW_FROM ? `불빛까지 ${GLOW_FROM - tr.lv}단계` : `최종까지 ${TRAIN_MAX - tr.lv}단계`;
  const cur = key === SIG ? tr.gains[SIG] ?? 0 : (stats.find((x) => x.key === key)?.v ?? 0) + (tr.gains[key] ?? 0);
  const openCount = PLACES.filter((pl) => !placeLock(pl, p, card, tr.lv)).length;

  return (
    <>
      {/* 카드 · 단계 */}
      <section className={s.hero} aria-label="훈련할 카드">
        <div className={s.heroCard}><Card {...cardProps(card)} width={124} eager onClick={onPickCard} /></div>
        <div className={s.heroInfo}>
          <p className={s.who}>
            <b className="head">{p.name}</b>
            <span className={s.grade} style={{ color: `var(--gr-${card.grade})` }}>{GRADES[card.grade].ko}{yy(card)}</span>
          </p>
          <p className={s.sub}>{team.short} · {posKo} · 종합 <span className="num">{card.ovr ?? p.ovr}</span></p>
          <div className={s.stage}>
            <span className={s.stageLab}>훈련 단계</span>
            <b className="num-display">{tr.lv}</b><small className="num">/ {TRAIN_MAX}</small>
            <em className={cx(s.stageTag, tr.lv >= GLOW_FROM && s.stageTagGlow, maxed && s.stageTagFinal)}>{stageLabel(tr.lv)}</em>
          </div>
          <StageMeter lv={tr.lv} />
          <div className={s.meterLegend} aria-hidden><span>1</span><span className={s.legGlow}>5 불빛</span><span className={s.legFinal}>10 최종</span></div>
          <p className={s.stageNote}>{nextNote}</p>
          <Button size="s" variant="secondary" icon="swap" onClick={onPickCard} className={s.change}>카드 바꾸기</Button>
        </div>
      </section>

      {/* 장소 */}
      <section className={s.sec} aria-labelledby="tr-place">
        <header className={s.secHead}>
          <h2 id="tr-place" className="head">훈련 장소</h2>
          <span className={s.meta}><span className="num">{openCount}</span>곳 열림 · 전체 <span className="num">{PLACES.length}</span>곳</span>
        </header>
        <PlacePicker cur={place.id} onPick={pickPlace} lockOf={(pl) => placeLock(pl, p, card, tr.lv)} bonusOf={(pl) => specText(pl, keys)} />
        <p className={s.placeLine}><b>{place.name}</b> {place.line}</p>
      </section>

      {/* 능력치 */}
      <section className={s.sec} aria-labelledby="tr-stat">
        <header className={s.secHead}>
          <h2 id="tr-stat" className="head">능력치</h2>
          {!maxed && <span className={s.meta}>성공하면 <b className="num">+{gainAt(tr.lv)}</b>{sig && <> · 특수구질 <b className="num">+{gainAt(tr.lv, true)}</b></>}</span>}
        </header>
        {place.sigOnly && <p className={s.note}><Icon name="info" size={15} />{place.name}에서는 특수구질만 훈련해요.</p>}
        <div className={cx(s.stats, maxed && s.done)} role="radiogroup" aria-label="훈련할 능력치">
          {stats.map((st) => {
            const g = tr.gains[st.key] ?? 0;
            const bonus = placeBonus(place, st.key);
            const on = key === st.key;
            return (
              <button key={st.key} type="button" role="radio" aria-checked={on} disabled={place.sigOnly || maxed} className={cx(s.stat, on && s.on)} onClick={() => pickKey(st.key)}>
                <span className={s.statKo}>{st.ko}</span>
                <span className={s.statV}><b className="num">{st.v + g}</b>{g > 0 && <em className="num">+{g}</em>}</span>
                {bonus > 0 && !place.sigOnly && <span className={s.statBonus}>확률 <span className="num">+{bonus}</span>%p</span>}
              </button>
            );
          })}
        </div>
        {sig && (
          <button type="button" role="radio" aria-checked={key === SIG} disabled={maxed} className={cx(s.sig, key === SIG && s.on, maxed && s.done)} style={{ '--sig': sig.color } as CSSProperties} onClick={() => pickKey(SIG)}>
            <span className={s.sigHead}>
              <span className={s.sigTag}>특수구질 훈련</span>
              <span className={s.sigHard}>확률 <b className="num">×{SIG_MUL}</b> · 더 어려워요</span>
            </span>
            <b className={s.sigName}>{sig.name}</b>
            <span className={s.sigMeta}>
              {tr.sig > 0 ? <>특수구질 <b className="num">{tr.sig}</b>단계 · 위력·제구 <b className="num">+{tr.gains[SIG] ?? 0}</b></> : '아직 훈련 전'}
              {placeBonus(place, SIG) > 0 && <> · 이 장소 확률 <b className="num">+{placeBonus(place, SIG)}</b>%p</>}
            </span>
          </button>
        )}
      </section>

      {/* 훈련 판 */}
      <section className={s.board} aria-label="훈련">
        <div className={cx(s.scene, rolling && s.rolling)} style={{ '--roll': `${ROLL_MS}ms` } as CSSProperties}>
          <PlaceArt id={place.id} className={s.sceneArt} />
          <span className={s.sceneShade} aria-hidden />
          <div className={cx(s.sceneText, roll?.phase === 'done' && s.hide)}>
            <span className={s.sceneWhere}>{place.name}</span>
            <b className={s.sceneStep}>{maxed ? '최종 단계' : <><span className="num">{tr.lv}</span>단계 → <span className="num">{tr.lv + 1}</span>단계 · {statKo(key)}</>}</b>
          </div>
          {rolling && <><span className={s.rollBar} aria-hidden /><span className={s.rollText}>훈련 중</span></>}
          {roll?.phase === 'done' && <Result r={roll.res} ko={roll.ko} />}
        </div>

        {q ? (
          <>
            <div className={s.odds}>
              <div className={s.pct}>
                <span>성공 확률</span>
                <b className="num-display">{pctText(q.odds.total)}<small>%</small></b>
              </div>
              <dl className={s.break}>
                <div><dt>기본 ({q.lv}→{q.lv + 1}단계)</dt><dd className="num">{q.odds.base}%</dd></div>
                {q.odds.mul !== 1 && <div><dt>특수구질</dt><dd className="num">×{q.odds.mul}</dd></div>}
                <div><dt>장소</dt><dd className="num">{q.odds.place ? `+${q.odds.place}%p` : '—'}</dd></div>
                <div><dt>연속 실패{tr.streak > 0 && <> <span className="num">{tr.streak}</span>번</>}</dt><dd className="num">{q.odds.pity ? `+${q.odds.pity}%p` : '—'}</dd></div>
                {q.odds.capped && <div><dt>최대</dt><dd className="num">{CHANCE_CAP}%</dd></div>}
              </dl>
            </div>
            <p className={s.after}>
              성공하면 <b>{statKo(key)}</b> {key === SIG ? '위력·제구' : ''} <span className="num">{key === SIG ? `+${cur}` : cur}</span> → <b className="num">{key === SIG ? `+${cur + q.gain}` : cur + q.gain}</b>
              {q.lv + 1 === GLOW_FROM && <> · 카드에 불빛</>}{q.lv + 1 === TRAIN_MAX && <> · 최종 단계</>}
            </p>
            <div className={s.go}>
              <Button size="l" block disabled={rolling || !canPay(wallet, q.cost)} onClick={go} trailing={<CostText cost={q.cost} />}>
                {rolling ? '훈련 중' : '훈련하기'}
              </Button>
              <p className={s.fine}>실패해도 단계는 그대로예요 · 연속 실패마다 다음 확률 +{TR_PITY_STEP}%p (최대 +{TR_PITY_MAX}%p)</p>
            </div>
          </>
        ) : (
          <p className={s.maxed}>
            {maxed ? <>최종 단계까지 마쳤어요. 카드에 최종 표시가 들어가요.</>
              : 'why' in quote && quote.why === 'locked' ? <>{place.name}: {quote.text}</> : <>지금은 이 훈련을 할 수 없어요.</>}
          </p>
        )}
      </section>

      {/* 아래도 연출이 끝날 때까지 누르기 전 모습 (결과를 미리 보여 주지 않게) */}
      <Summary tr={tr} statKo={statKo} />
      {log.length > 0 && <Recent log={log} onOpen={onOpen} />}
      <RulesTable lv={tr.lv} />
    </>
  );
}

const ROLL_MS = 950;

/** 결과 — 크게 한 번 보이고 그대로 머문다 (다시 누르거나 고르면 사라짐) */
function Result({ r, ko }: { r: Extract<TrainTry, { ok: true }>; ko: string }) {
  const final = r.success && r.to >= TRAIN_MAX;
  const glowNow = r.success && r.to === GLOW_FROM;
  const pityUp = Math.min(TR_PITY_MAX, TR_PITY_STEP * r.streak) - Math.min(TR_PITY_MAX, TR_PITY_STEP * (r.streak - 1));
  return (
    <div className={cx(s.result, r.success ? s.win : s.lose, final && s.final)} role="status">
      <b className={s.resBig}>{r.success ? (final ? '최종 단계' : '성공') : '실패'}</b>
      <span className={s.resSub}>
        {r.success
          ? <>{ko} <b className="num">+{r.gain}</b> · <span className="num">{r.from}</span>단계 → <span className="num">{r.to}</span>단계</>
          : <>비용만 들었어요 · {pityUp > 0 ? <>다음 확률 <b className="num">+{pityUp}%p</b></> : <>보정 최대 <b className="num">+{TR_PITY_MAX}%p</b></>}</>}
      </span>
      {glowNow && <span className={s.resNote}>카드에 불빛이 들어왔어요</span>}
      {final && <span className={s.resNote}>카드에 최종 표시가 붙어요</span>}
    </div>
  );
}

/** 단계 막대 10칸 — 5~9 불빛 · 10 최종 · 다음 칸 테두리 */
function StageMeter({ lv }: { lv: number }) {
  return (
    <div className={s.meter} role="img" aria-label={`훈련 ${lv}단계 / ${TRAIN_MAX}단계`}>
      {Array.from({ length: TRAIN_MAX }, (_, i) => {
        const n = i + 1;
        return <i key={n} className={cx(s.seg, n <= lv && s.segOn, n >= GLOW_FROM && s.segGlow, n === TRAIN_MAX && s.segFinal, n === lv + 1 && s.segNext)} />;
      })}
    </div>
  );
}

/** 장소 고르기 — 가로로 미는 그림 목록 (잠긴 곳은 까닭) */
function PlacePicker({ cur, onPick, lockOf, bonusOf }: {
  cur: PlaceId; onPick: (p: PlaceId) => void; lockOf: (p: TrainPlace) => string | null; bonusOf: (p: TrainPlace) => string;
}) {
  const ref = useRef<HTMLUListElement>(null);
  // 고른 장소가 보이게 (처음 열 때만 — 화면 세로 위치는 건드리지 않는다)
  useLayoutEffect(() => {
    const ul = ref.current;
    const li = ul?.querySelector<HTMLElement>('[aria-checked="true"]')?.parentElement;
    if (!ul || !li) return;
    const d = li.getBoundingClientRect().left - ul.getBoundingClientRect().left;
    if (d < 0 || d + li.offsetWidth > ul.clientWidth) ul.scrollLeft = Math.max(0, ul.scrollLeft + d - 16);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <ul ref={ref} className={s.places} role="radiogroup" aria-label="훈련 장소">
      {PLACES.map((pl) => {
        const lk = lockOf(pl);
        const on = pl.id === cur;
        const bonus = bonusOf(pl);
        return (
          <li key={pl.id} className={s.placeLi}>
            <button type="button" role="radio" aria-checked={on} disabled={!!lk} className={cx(s.place, on && s.on, !!lk && s.locked)} onClick={() => onPick(pl.id)}>
              <span className={s.placeArt}>
                <PlaceArt id={pl.id} />
                {lk && <span className={s.lock}><Icon name="lock" size={13} />{lk}</span>}
                {pl.pay === 'ball' && <span className={s.premium}>골든볼</span>}
              </span>
              <span className={s.placeBody}>
                <b className={s.placeName}>{pl.name}</b>
                <span className={bonus ? s.placeBonus : s.placeNone}>{pl.sigOnly ? `특수구질 +${pl.spec.SIG}%p` : bonus || '보너스 없음'}</span>
                <span className={s.placeCost}>비용 <span className="num">×{pl.mul}</span>{pl.pay === 'ball' ? ' 골든볼' : ''}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** 이 카드 훈련 — 오른 능력치 · 시도 · 팀 종합에 더해지는 값 */
function Summary({ tr, statKo }: { tr: TrainState; statKo: (k: string) => string }) {
  const list = Object.entries(tr.gains).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const bonus = trainOvrBonus({ lv: tr.lv, gains: tr.gains });
  return (
    <section className={s.sec} aria-labelledby="tr-sum">
      <header className={s.secHead}>
        <h2 id="tr-sum" className="head">이 카드 훈련</h2>
        <span className={s.meta}>시도 <span className="num">{tr.tries}</span>번 · 성공 <span className="num">{tr.lv}</span>번</span>
      </header>
      {list.length ? (
        <ul className={s.gains}>
          {list.map(([k, v]) => <li key={k}><span>{statKo(k)}</span><b className="num">+{v}</b></li>)}
        </ul>
      ) : <p className={s.muted}>아직 오른 능력치가 없어요.</p>}
      <p className={s.effect}>
        라인업에 서면 팀 종합 <b className="num">+{bonus}</b> <small>(오른 값 합 <span className="num">{sumGains(tr.gains)}</span> ÷ 4)</small> · 시즌·경기에서도 오른 능력치로 뛰어요.
      </p>
    </section>
  );
}

/** 방금 훈련 (이번 방문) */
function Recent({ log, onOpen }: { log: LogItem[]; onOpen: (id: string) => void }) {
  return (
    <section className={s.sec} aria-labelledby="tr-log">
      <header className={s.secHead}><h2 id="tr-log" className="head">방금 훈련</h2></header>
      <ol className={s.log}>
        {log.map((x) => (
          <li key={x.at}>
            <button type="button" onClick={() => onOpen(x.cardId)}>
              <em className={x.success ? s.logWin : s.logLose}>{x.success ? '성공' : '실패'}</em>
              <b>{x.name}</b>
              <span>{x.ko}{x.success ? <> <span className="num">+{x.gain}</span></> : null} · {x.place}</span>
              <small className="num">{x.success ? `${x.from}→${x.to}` : `${pctText(x.chance)}%`}</small>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** 단계별 확률 · 오르는 값 · 기본 비용 (확률 공개) */
function RulesTable({ lv }: { lv: number }) {
  return (
    <section className={s.sec} aria-labelledby="tr-rules">
      <header className={s.secHead}><h2 id="tr-rules" className="head">단계별 확률</h2><span className={s.meta}>확률 공개</span></header>
      <table className={s.table}>
        <thead>
          <tr><th>단계</th><th>확률</th><th>특수구질</th><th>오르는 값</th><th>기본 비용</th></tr>
        </thead>
        <tbody>
          {TRAIN_BASE.map((b, i) => (
            <tr key={i} className={cx(i === lv && s.rowNow, i + 1 >= GLOW_FROM && s.rowGlow, i + 1 === TRAIN_MAX && s.rowFinal)}>
              <th scope="row" className="num">{i}→{i + 1}</th>
              <td className="num">{b}%</td>
              <td className="num">{pctText(Math.round(b * SIG_MUL * 10) / 10)}%</td>
              <td className="num">+{gainAt(i)} <small>/ +{gainAt(i, true)}</small></td>
              <td className="num">{fmt.kr(costOf(i, 'CON', BASIC_PLACE).gp ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className={s.rules}>
        <li>실패해도 단계와 오른 능력치는 그대로예요. 비용만 들어요.</li>
        <li>연속으로 실패하면 다음 확률이 <b className="num">+{TR_PITY_STEP}%p</b>씩 올라요(최대 <span className="num">+{TR_PITY_MAX}%p</span>). 성공하면 처음부터예요.</li>
        <li>장소마다 잘하는 능력치가 있어요(<span className="num">+2~6%p</span>). 특수구질은 확률 <span className="num">×{SIG_MUL}</span>, 대신 더 많이 올라요(오르는 값의 작은 숫자).</li>
        <li><span className="num">{GLOW_FROM}</span>단계부터 카드에 불빛이 들어오고, <span className="num">{TRAIN_MAX}</span>단계는 최종 표시가 붙어요.</li>
        <li>기본 비용은 구단 실내 연습장 기준이에요. 장소 배율 · 특수구질(×2)만큼 달라져요.</li>
      </ul>
    </section>
  );
}

/* ───────── 카드 고르기 ───────── */
type PickTab = 'line' | 'box' | 'done';
const PAGE = 60;
function CardPicker({ open, onClose, cur, owned, lineup, onPick }: {
  open: boolean; onClose: () => void; cur: string | null; owned: string[]; lineup: string[]; onPick: (id: string) => void;
}) {
  const [tab, setTab] = useState<PickTab>('line');
  const [more, setMore] = useState(1);
  const lists = useMemo(() => {
    if (!open) return { line: [], box: [], done: [] } as Record<PickTab, CardInst[]>;
    const inLine = new Set(lineup);
    const cards = (ids: string[]) => ids.map((x) => ownedCard(x)).filter(Boolean) as CardInst[];
    const ovr = (c: CardInst) => c.ovr ?? playerOfCard(c).ovr;
    const byTrain = (a: CardInst, b: CardInst) => (b.train?.lv ?? 0) - (a.train?.lv ?? 0) || ovr(b) - ovr(a);
    return {
      line: cards(lineup),
      box: cards(owned.filter((x) => !inLine.has(x))).sort(byTrain),
      done: cards(owned).filter((c) => (c.train?.lv ?? 0) > 0).sort(byTrain),
    };
  }, [open, owned, lineup]);
  const list = lists[tab];
  const shown = list.slice(0, PAGE * more);
  return (
    <Sheet open={open} onClose={onClose} height="tall" title="훈련할 카드" sub="라인업 카드가 먼저예요 · 카드 아래 숫자는 훈련 단계">
      <Tabs
        items={[{ value: 'line', label: '라인업', count: lists.line.length }, { value: 'box', label: '보관함', count: lists.box.length }, { value: 'done', label: '훈련한 카드', count: lists.done.length }]}
        value={tab} onChange={(v) => { setTab(v); setMore(1); }} size="s" fill aria-label="카드 묶음"
      />
      {shown.length === 0 ? <p className={s.muted}>{tab === 'done' ? '아직 훈련한 카드가 없어요.' : '카드가 없어요.'}</p> : (
        <ul className={s.pickGrid}>
          {shown.map((c) => {
            const lv = c.train?.lv ?? 0;
            return (
              <li key={c.id}>
                <button type="button" className={cx(s.pick, c.id === cur && s.on)} onClick={() => onPick(c.id)} aria-label={`${playerOfCard(c).name} ${GRADES[c.grade].ko} 훈련 ${lv}단계`}>
                  <CardMini {...cardProps(c)} fluid />
                  <span className={cx(s.pickLv, lv >= GLOW_FROM && s.pickGlow, lv >= TRAIN_MAX && s.pickFinal)}>
                    <i style={{ '--p': `${lv * 10}%` } as CSSProperties} aria-hidden /><span className="num">{lv}</span>단계
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {list.length > shown.length && <Button variant="secondary" size="s" block className={s.more} onClick={() => setMore((m) => m + 1)}>더 보기 <span className="num">{list.length - shown.length}</span>장</Button>}
    </Sheet>
  );
}
