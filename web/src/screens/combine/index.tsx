// 선수조합 #/combine — 팀관리. 안 쓰는 카드 3~5장 → 새 카드 1장 (마구마구식 조합 룰렛)
//   위: 조합 대기 5칸(1~3 필수 · 4~5 선택, 넣은 카드를 누르면 빠짐) · 가운데: 조합 공식(맞으면 ✓) + 결과 확률
//   아래: 타자 / 투수 카드 목록 — 재료로 쓸 수 있는 카드만, 남는 장수와 함께(등급 거르기 · 정렬). 누르면 다음 빈 칸에.
//   맨 아래 줄: 조합하기(3장 1만 · 4장 2만 · 5장 3만 GP). 결과는 누르는 순간 정해 바로 저장(screens/gacha/draw 의 rollComboWith)하고,
//   룰렛(Spin)은 그 결과를 따라갈 뿐이다. 공식 · 확률 계산은 game/combine (시험: scripts/combine.test.ts)
//   결과의 '한 번 더'는 같은 공식(같은 등급 · 구단 · 연도 · 포지션)이 맞는 다른 카드로 칸을 다시 채운다(방금 받은 카드는 빼고). 주소: ?tab=P 투수 목록부터
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { ScreenProps } from '../../app/screen';
import { navigate } from '../../app/router';
import { CardMini, cardProps } from '../../cards';
import { GRADES } from '../../game/grades';
import { cardInst, playerOfKCard } from '../../game/kbo';
import { CARD_CAP, totalCards, useInventory } from '../../game/inventory';
import { spend, useWallet } from '../../game/wallet';
import { shortLabel } from '../../game/world';
import { MAX_MATS, MIN_MATS, analyze, reelOf, type CombineView, type Side } from '../../game/combine';
import type { GradeId } from '../../game/types';
import { Button, CoinGP, Icon, Tabs, fmt, useToast } from '../../ui';
import { useIncremental } from '../../ui/useIncremental';
import { rollComboWith } from '../gacha/draw';
import { Swatch, gradeFill, gradeShort } from '../gacha/bits';
import { Recipe, pctText } from './Recipe';
import { Spin, type SpinRun } from './Spin';
import { SORTS, gradeOrder, readMaterials, refill, sortMats, type Mat, type SortKey } from './materials';
import { CleanSheet } from './CleanSheet';
import s from './Combine.module.css';

const REQUIRED = MIN_MATS;

export default function CombineScreen({ query }: ScreenProps) {
  const ver = useInventory();
  const wallet = useWallet();
  const toast = useToast();
  const mats = useMemo(() => readMaterials(), [ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const byId = useMemo(() => new Map(mats.map((m) => [m.id, m])), [mats]);

  const [slots, setSlots] = useState<string[]>([]);
  const [tab, setTab] = useState<Side>(() => (query.get('tab') === 'P' ? 'P' : 'B'));
  const [grade, setGrade] = useState<GradeId | 'all'>('all');
  const [sort, setSort] = useState<SortKey>('grade');
  const [run, setRun] = useState<SpinRun | null>(null);
  const last = useRef<{ view: CombineView; grades: GradeId[]; resultId: string } | null>(null);
  const [cleanOpen, setCleanOpen] = useState(() => query.get('auto') === '1');
  const total = useMemo(() => totalCards(), [ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const top = useRef<HTMLElement>(null);

  // 보관함이 바뀌면(다른 화면 · 조합) 남는 장보다 많이 넣은 칸을 뺀다
  useEffect(() => {
    setSlots((xs) => {
      const used = new Map<string, number>();
      const keep = xs.filter((id) => {
        const m = byId.get(id);
        const k = (used.get(id) ?? 0) + 1;
        used.set(id, k);
        return !!m && k <= m.spare;
      });
      return keep.length === xs.length ? xs : keep;
    });
  }, [byId]);

  // 넣은 칸 → 재료 정보 (보관함이 막 바뀌어 없어진 칸은 위 정리 전까지 건너뜀)
  const view = useMemo(() => analyze(slots.flatMap((id) => { const m = byId.get(id); return m ? [m.info] : []; })), [slots, byId]);
  const usedOf = (id: string) => slots.reduce((n, x) => n + (x === id ? 1 : 0), 0);

  const side = useMemo(() => mats.filter((m) => m.side === tab), [mats, tab]);
  const counts = useMemo(() => {
    const c = new Map<GradeId, number>();
    for (const m of side) c.set(m.info.grade, (c.get(m.info.grade) ?? 0) + 1);
    return c;
  }, [side]);
  const grades = useMemo(() => [...counts.keys()].sort((a, b) => gradeOrder(a) - gradeOrder(b)), [counts]);
  useEffect(() => { if (grade !== 'all' && !counts.has(grade)) setGrade('all'); }, [counts, grade]);
  const list = useMemo(() => sortMats(grade === 'all' ? side : side.filter((m) => m.info.grade === grade), sort), [side, grade, sort]);
  // 카드가 수천 장이어도 가볍게 — 60장씩 이어 그린다 (탭 · 등급 · 정렬이 바뀌면 처음부터)
  const inc = useIncremental(list, 60, `${tab}|${grade}|${sort}`);
  const nB = useMemo(() => mats.filter((m) => m.side === 'B').length, [mats]);
  const nP = mats.length - nB;

  const add = (m: Mat) => {
    if (run) return;
    if (usedOf(m.id) >= m.spare) return;
    if (slots.length >= MAX_MATS) { toast(`${MAX_MATS}장까지예요`); return; }
    setSlots([...slots, m.id]);
  };
  const removeAt = (i: number) => { if (!run) setSlots(slots.filter((_, k) => k !== i)); };

  const go = () => {
    if (run || !view.ready) return;
    if (wallet.gp < view.fee) { toast({ text: 'GP가 모자라요', tone: 'bad' }); return; }
    const use: Record<string, number> = {};
    for (const id of slots) use[id] = (use[id] ?? 0) + 1;
    const r = rollComboWith({ view, use, pay: () => spend({ gp: view.fee }) });
    if (!r.ok) {
      toast({ text: r.why === 'gp' ? 'GP가 모자라요' : r.why === 'material' ? '재료가 바뀌었어요' : '지금은 조합할 수 없어요', tone: 'bad' });
      if (r.why === 'material') setSlots([]);
      return;
    }
    // 릴 — 결과 풀에서 고른 후보들, 마지막 장은 방금 받은 카드 그대로
    const reel = reelOf(view, r.roll.card, 24).flatMap((kc, i, arr) => {
      if (i === arr.length - 1) return [{ card: r.result.card, player: r.result.player }];
      const player = playerOfKCard(kc);
      return player ? [{ card: cardInst(kc), player }] : [];
    });
    last.current = { view, grades: slots.flatMap((id) => { const m = byId.get(id); return m ? [m.info.grade] : []; }), resultId: r.result.card.id };
    setRun({ key: r.requestId, result: r.result, roll: r.roll, view, reel });
    setSlots([]);
  };

  /** 한 번 더 — 같은 공식으로 다시 채우기 (모자라면 채운 만큼) */
  const again = () => {
    const prev = last.current;
    setRun(null);
    if (!prev) return;
    const fresh = readMaterials();
    const ids = refill(prev.view, prev.grades, fresh, new Set([prev.resultId]));
    setSlots(ids);
    const want = prev.view.n;
    toast(ids.length >= want ? '같은 공식으로 다시 채웠어요' : ids.length ? `같은 공식 카드가 ${ids.length}장뿐이에요` : '같은 공식으로 채울 카드가 없어요');
    top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const upUnits = view.rows.filter((r) => r.step !== 0).reduce((a, r) => a + r.units, 0);
  const met = view.formulas.filter((f) => f.met && !(f.id === 'hidden' && !f.avail)).length;
  const short = wallet.gp < view.fee;

  return (
    <div className={s.page}>
      <header className={s.head} ref={top}>
        <h1 className={['head', s.h1].join(' ')}>선수조합</h1>
        <p className={s.lead}>카드 3~5장으로 새 카드 1장</p>
      </header>

      {/* ───── 자동 정리 — 카드가 많이 쌓였을 때 (상한 10만 장을 넘으면 카드구매가 막힌다) ───── */}
      <button type="button" className={[s.autoEntry, total > CARD_CAP && s.autoOver].filter(Boolean).join(' ')} onClick={() => setCleanOpen(true)}>
        <span className={s.autoText}>
          <b>자동 정리</b>
          <small>
            보유 <span className="num">{fmt.int(total)}</span>장{total > CARD_CAP ? ' · 상한 초과' : ''}
          </small>
        </span>
        <Icon name="chevron" size={18} />
      </button>
      <CleanSheet open={cleanOpen} onClose={() => setCleanOpen(false)} />

      {/* ───── 조합 대기 ───── */}
      <section className={s.wait} aria-labelledby="combine-wait">
        <div className={s.secHead}>
          <h2 id="combine-wait" className={['head', s.h2].join(' ')}>조합 대기</h2>
          <span className={s.secSub}><b className="num">{slots.length}</b>/<span className="num">{MAX_MATS}</span> · 3장부터</span>
        </div>
        <ol className={s.slots}>
          {Array.from({ length: MAX_MATS }, (_, i) => {
            const m = slots[i] ? byId.get(slots[i]) : undefined;
            if (!m) {
              return (
                <li key={'e' + i} className={[s.slot, s.slotEmpty, i < REQUIRED && s.slotReq, i === slots.length && s.slotNext].filter(Boolean).join(' ')}>
                  <span className={['num', s.slotNo].join(' ')}>{i + 1}</span>
                  <small>{i < REQUIRED ? '필수' : '선택'}</small>
                </li>
              );
            }
            return (
              <li key={m.id + '#' + i} className={s.slot}>
                <button type="button" className={s.slotBtn} onClick={() => removeAt(i)} aria-label={`${m.player.name} 빼기`}>
                  <CardMini {...cardProps(m.card)} fluid still />
                  <i className={s.slotX} aria-hidden><Icon name="close" size={12} stroke={2.4} /></i>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <Recipe view={view} />

      {/* ───── 카드 목록 ───── */}
      <section className={s.list} aria-labelledby="combine-list">
        <h2 id="combine-list" className="sr-only">재료 카드</h2>
        <Tabs
          items={[{ value: 'B' as Side, label: '타자', count: nB }, { value: 'P' as Side, label: '투수', count: nP }]}
          value={tab}
          onChange={(v) => { setTab(v); setGrade('all'); }}
          fill
          aria-label="타자 · 투수"
        />
        {side.length > 0 && (
          <div className={s.tools}>
            <div className={s.grades} role="radiogroup" aria-label="등급">
              <button type="button" role="radio" aria-checked={grade === 'all'} className={[s.gf, grade === 'all' && s.on].filter(Boolean).join(' ')} onClick={() => setGrade('all')}>
                <span>전체</span>
              </button>
              {grades.map((g) => (
                <button key={g} type="button" role="radio" aria-checked={grade === g} aria-label={`${GRADES[g].ko} ${counts.get(g)}종`}
                  className={[s.gf, grade === g && s.on].filter(Boolean).join(' ')} onClick={() => setGrade(grade === g ? 'all' : g)}>
                  <Swatch grade={g} size={8} />
                  <span>{gradeShort(g)}</span>
                  <em className="num">{counts.get(g)}</em>
                </button>
              ))}
            </div>
            <div className={s.listBar}>
              <p className={s.listCount}><b className="num">{list.length}</b>종 · 남는 <span className="num">{list.reduce((a, m) => a + m.spare, 0)}</span>장</p>
              <Tabs variant="box" size="s" items={SORTS} value={sort} onChange={setSort} aria-label="정렬" className={s.sort} />
            </div>
          </div>
        )}

        {mats.length === 0 ? (
          <div className={s.empty}>
            <p>조합에 쓸 카드가 없어요</p>
            <Button variant="secondary" size="s" onClick={() => navigate('/gacha')}>카드구매</Button>
          </div>
        ) : side.length === 0 ? (
          <div className={s.empty}><p>쓸 수 있는 {tab === 'P' ? '투수' : '타자'} 카드가 없어요</p></div>
        ) : (
          <ul className={s.grid}>
            {inc.shown.map((m) => {
              const used = usedOf(m.id);
              const left = m.spare - used;
              const club = m.info.club ? shortLabel(m.info.club) : '';
              return (
                <li key={m.id} className={s.cell}>
                  <button
                    type="button"
                    className={[s.item, used > 0 && s.itemIn].filter(Boolean).join(' ')}
                    onClick={() => add(m)}
                    disabled={left <= 0 || !!run}
                    aria-label={`${m.player.name} ${GRADES[m.info.grade].ko}${m.info.year ? ` ${m.info.year}` : ''} ${club} — 남는 ${left}장${used ? `, ${used}장 넣음` : ''}${m.owned > m.spare ? ' · 1장은 남김' : ''}`}
                  >
                    <CardMini {...cardProps(m.card)} fluid dimmed={left <= 0} />
                    {used > 0 && <span className={['num', s.inBadge].join(' ')}>{used}</span>}
                  </button>
                  <p className={s.itemMeta} title={m.owned > m.spare ? '라인업 · 강화 · 훈련 카드라 1장은 남겨요' : undefined}>
                    <span>{club}</span>
                    <b className="num">{m.owned > m.spare && <Icon name="lock" size={10} stroke={2} className={s.keepIcon} />}×{left}</b>
                  </p>
                </li>
              );
            })}
          {inc.more && <li ref={inc.sentinelRef} className={s.moreRow} aria-hidden>카드 <span className="num">{inc.left}</span>장 더 불러오는 중…</li>}
          </ul>
        )}
      </section>

      {/* ───── 아래 조합 줄 (화면 아래 고정 — 포털) ───── */}
      {createPortal(
        <div className={s.dock} role="region" aria-label="조합하기">
          <div className={s.dockIn}>
            <div className={s.dockInfo}>
              <span className={s.pips} aria-hidden>
                {Array.from({ length: MAX_MATS }, (_, i) => {
                  const m = slots[i] ? byId.get(slots[i]) : undefined;
                  return <i key={i} className={[s.pip, m && s.pipOn, i < REQUIRED && s.pipReq].filter(Boolean).join(' ')} style={m ? ({ '--c': gradeFill(m.info.grade) } as CSSProperties) : undefined} />;
                })}
              </span>
              <span className={s.dockText}>
                {view.ready
                  ? <>위 등급 <b className="num">{pctText(upUnits)}%</b>{met > 0 && <> · 공식 <b className="num">{met}</b></>}</>
                  : <><b className="num">{REQUIRED - slots.length}</b>장 더 넣어요</>}
              </span>
            </div>
            <Button
              variant="primary"
              size="m"
              className={s.go}
              onClick={go}
              disabled={!view.ready || !!run}
              trailing={<span className={[s.fee, short && view.ready && s.feeShort].filter(Boolean).join(' ')}><CoinGP size={13} /><span className="num">{fmt.man(view.fee)}</span></span>}
            >
              조합하기
            </Button>
          </div>
        </div>,
        document.body,
      )}

      {run && <Spin key={run.key} run={run} onAgain={again} onClose={() => setRun(null)} />}
    </div>
  );
}
