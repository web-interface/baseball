// 라인업 · 조합 — 담당: 라인업 화면 개발자 (이 폴더만 고친다)
// 풋볼데이처럼 경기장 위 자리마다 카드(수비 9 + 지명 + 1선발). 누르면 바꾸기 시트,
// 바꾸는 즉시 케미 선 굵기 · 팀컬러 칸 · 팀 종합 게이지가 다시 계산되어 움직인다. 타자 9명이 한 구단이면 '능력치 폭발'.
//
// 선수를 누르면 먼저 선수 정보 시트(능력치·성적), 거기서 '교체'로 바꾸기 시트. 빈 자리는 바로 바꾸기 시트.
//
// 주소 (미리보기·스크린샷용): ?tab=order|pitch · ?slot=LF (그 자리 바꾸기 시트) · ?info=CF · ?info=S1 (그 자리 선수 정보 시트, S1~S5 = 1~5선발)
//   ?bench=<카드 id> — 그 카드를 넣을 자리 고르기(누구와 바꿀지). 벤치 카드뿐 아니라 보관함 카드도 — 선수보관 · 선수 정보의 '라인업에 넣기'가 여기로 온다.
// 새로 얻은 카드는 보관함으로만 들어온다. 라인업은 여기서 감독이 바꿀 때만(교체 · 자동 편성 버튼) 바뀌고 바로 저장된다.
//   ?demo=set (’27 독수리스 5명 — 세트 +2) · ?demo=set9 (9명 — +4) · ?demo=boom (5명 → 잠시 뒤 9명, 단계가 오르는 순간) · ?pick=2 (타순 고르는 중)
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ScreenProps } from '../../app/screen';
import { CardMini } from '../../cards';
import { Button, Tabs, fmt, useToast } from '../../ui';
import { myTeam } from '../../game/mock';
import { isOwned } from '../../game/inventory';
import { POS_KO } from '../../game/labels';
import { Board, LinkLegend } from './Board';
import { GaugeBox } from './GaugeBox';
import { TeamColorPanel } from './TeamColor';
import { OrderTab } from './OrderTab';
import { PitchTab } from './PitchTab';
import { BenchSheet, SwapSheet } from './SwapSheet';
import { PlayerSheet } from './PlayerSheet';
import {
  BAT_SLOTS, STAFF_SLOTS, SLOT_KO, autoLineup, autoOrder, evaluate, getSlot, initialLineup, isBat, place, store, swapOrder, unit,
  type LineupState, type Slot, type StaffSlot,
} from './calc';
import s from './Lineup.module.css';

type Tab = 'field' | 'order' | 'pitch';
const TABS: { value: Tab; label: string }[] = [
  { value: 'field', label: '수비 배치' },
  { value: 'order', label: '타순' },
  { value: 'pitch', label: '투수진' },
];
const ALL_SLOTS = [...BAT_SLOTS, ...STAFF_SLOTS] as string[];

/** 미리보기 — ’27 독수리스 카드로 세트덱 켜 보기 (목업 카드: 연이준·표건우·탁민재·진서율·사공린 / 서문혁·도하람·독고현·황보결) */
const SET_DEMO: [Slot, string][] = [['CF', 'c03'], ['SS', 'c06'], ['C', 'c07'], ['2B', 'c08'], ['LF', 'lc1'], ['DH', 'lc2'], ['R1', 'c10'], ['B0', 'c11'], ['B1', 'c12']];
function demoStart(q: URLSearchParams): LineupState | null {
  const d = q.get('demo');
  if (!d) return null;
  let st = initialLineup();
  const n = d === 'set9' ? 9 : d === 'set' || d === 'boom' ? 5 : 0;
  for (const [slot, id] of SET_DEMO.slice(0, n)) st = place(st, slot, id);
  return st;
}

export default function LineupScreen({ query }: ScreenProps) {
  const toast = useToast();
  const home = myTeam();
  const q = useRef(query).current;

  const [tab, setTab] = useState<Tab>(() => (q.get('tab') === 'order' ? 'order' : q.get('tab') === 'pitch' ? 'pitch' : 'field'));
  const [st, setSt] = useState<LineupState>(() => demoStart(q) ?? store.get() ?? initialLineup());
  const ev = useMemo(() => evaluate(st), [st]);
  const stRef = useRef(st);
  stRef.current = st;

  const [slot, setSlot] = useState<Slot | null>(() => { const v = q.get('slot'); return v && ALL_SLOTS.includes(v) ? (v as Slot) : null; });
  // ?info=CF · ?info=R0 — 선발은 S1~S5 · 투수 P 로도 (S1 = 1선발)
  const [info, setInfo] = useState<Slot | null>(() => {
    const raw = q.get('info');
    const v = raw && /^S[1-5]$/.test(raw) ? `R${Number(raw[1]) - 1}` : raw === 'P' ? 'R0' : raw;
    return v && ALL_SLOTS.includes(v) ? (v as Slot) : null;
  });
  /** 선수가 있으면 정보 시트, 비었으면 바로 바꾸기 시트 */
  const open = (x: Slot) => { if (getSlot(stRef.current, x)) setInfo(x); else setSlot(x); };
  // '교체' — 정보 시트가 다 내려간 뒤 바꾸기 시트를 올린다 (시트 둘이 겹치면 스크롤 잠금·포커스 되돌리기가 꼬인다)
  const [pending, setPending] = useState<Slot | null>(null);
  const swapTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(swapTimer.current), []);
  const swapFromInfo = (x: Slot) => {
    setInfo(null);
    setPending(x);
    window.clearTimeout(swapTimer.current);
    swapTimer.current = window.setTimeout(() => { setPending(null); setSlot(x); }, 240);
  };
  const [benchCard, setBenchCard] = useState<string | null>(() => { const b = q.get('bench'); return b && isOwned(b) ? b : null; });
  const [boom, setBoom] = useState<number | null>(null);

  /* 되돌리기 */
  const hist = useRef<LineupState[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const commit = (next: LineupState) => {
    if (next === stRef.current) return;
    hist.current = [...hist.current.slice(-19), stRef.current];
    setCanUndo(true);
    setSt(next);
    store.set(next);
  };
  const undo = () => {
    const last = hist.current.pop();
    if (!last) return;
    setCanUndo(hist.current.length > 0);
    setSt(last);
    store.set(last);
  };

  /* 능력치 폭발 — 다 맞춘 순간에만 연출 */
  const wasBoom = useRef(ev.exploded);
  useEffect(() => {
    if (ev.exploded && !wasBoom.current) setBoom(Date.now());
    wasBoom.current = ev.exploded;
  }, [ev.exploded]);

  // 미리보기: 잠시 뒤 마지막 한 명을 채워 폭발 연출을 본다
  useEffect(() => {
    if (q.get('demo') !== 'boom') return;
    const t = window.setTimeout(() => { let nx = stRef.current; for (const [slot, id] of SET_DEMO.slice(5)) nx = place(nx, slot, id); commit(nx); }, Number(q.get('at') ?? 1100));
    return () => window.clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** 바꾼 뒤 알림 — 팀 종합(투수진은 투수 묶음) 변화 */
  const report = (text: string, next: LineupState, staff = false) => {
    const ne = evaluate(next);
    const pick = (e: typeof ev) => (staff ? e.parts.find((p) => p.k === 'pit')!.v : e.overall);
    const a = pick(ev);
    const b = pick(ne);
    if (ne.exploded && !ev.exploded) return; // 폭발 연출이 대신 알린다
    toast({
      text: <>{text} · {staff ? '투수' : '팀 종합'} <b className="num">{b}</b>{a !== b && <> ({fmt.signed(b - a)})</>}</>,
      tone: b > a ? 'good' : b < a ? 'bad' : 'info',
      action: { label: '되돌리기', onClick: undo },
    });
  };

  const applyFromSheet = (next: LineupState, m: { slot: Slot; id: string }) => {
    setSlot(null);
    setBenchCard(null);
    report(`${SLOT_KO[m.slot]} ${unit(m.id).player.name}`, next, !isBat(m.slot) && m.slot !== 'R0');
    commit(next);
  };

  const swapBatOrder = (i: number, j: number) => {
    const next = swapOrder(st, i, j);
    const n = (k: number) => unit(next.field[next.order[k]]!).player.name;
    report(`${i + 1}번 ${n(i)} · ${j + 1}번 ${n(j)}`, next);
    commit(next);
  };
  const swapStaff = (a: StaffSlot, b: StaffSlot) => {
    const ida = getSlot(st, a);
    const idb = getSlot(st, b);
    const next = idb ? place(st, a, idb) : ida ? place(st, b, ida) : st;
    if (next === st) return;
    const who = getSlot(next, a);
    report(`${SLOT_KO[a]} ${who ? unit(who).player.name : '비움'}`, next, a !== 'R0' && b !== 'R0');
    commit(next);
  };
  const runAuto = () => {
    const next = autoLineup(st);
    if (evaluate(next).raw <= ev.raw + 0.01 && next.order.join() === st.order.join()) {
      toast({ text: '지금이 가장 좋은 라인업이에요', tone: 'info' });
      return;
    }
    report('자동 편성', next);
    commit(next);
  };
  const runAutoOrder = () => {
    const next = autoOrder(st);
    if (next.order.join() === st.order.join()) { toast({ text: '지금 타순이 추천 타순이에요', tone: 'info' }); return; }
    report('추천 타순', next);
    commit(next);
  };

  return (
    <div className={s.page}>
      <div className={s.head}>
        <Tabs items={TABS} value={tab} onChange={setTab} aria-label="라인업 보기" className={s.tabs} />
        <div className={s.actions}>
          {canUndo && <Button variant="ghost" size="s" onClick={undo}>되돌리기</Button>}
          <Button variant="ghost" size="s" onClick={runAuto}>자동 편성</Button>
        </div>
      </div>

      <GaugeBox ev={ev} boom={boom} />

      {tab === 'field' && (
        <div className={s.field}>
          <Board st={st} ev={ev} home={home} active={slot ?? info ?? pending} onPick={open} boom={boom} onBoomDone={() => setBoom(null)} />
          <div className={s.legend}>
            <LinkLegend />
            <p>같은 구단 · 권역 · 시즌 카드일수록 선이 굵어져요. 키스톤 · 배터리 · 외야 짝은 한 단 더. 카드 밑은 타순과 조합으로 오른 종합이에요.</p>
          </div>
          <TeamColorPanel ev={ev} onHint={setSlot} />
          <section className={s.bench} aria-label="벤치">
            <h3 className={s.h}>
              <b>벤치</b><span className="num">{st.bench.length}</span>
              <small>누르면 넣을 자리를 골라요</small>
            </h3>
            <ul className={s.benchRow}>
              {st.bench.map((id) => {
                const u = unit(id);
                return (
                  <li key={id}>
                    <button type="button" className={s.benchCard} onClick={() => setBenchCard(id)} aria-label={`${u.player.name} 넣을 자리 고르기`}>
                      <CardMini player={u.player} grade={u.card.grade} enhance={u.card.enhance} width={60} />
                      <small>{POS_KO[u.player.pos]} · {u.team.short}</small>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      )}
      {tab === 'order' && (
        <OrderTab st={st} ev={ev} onOpen={open} onSwap={swapBatOrder} onAuto={runAutoOrder}
          initialPick={q.get('pick') ? Number(q.get('pick')) - 1 : null} />
      )}
      {tab === 'pitch' && <PitchTab st={st} ev={ev} onOpen={open} onSwap={swapStaff} />}

      <p className={s.foot}>바꾸는 즉시 저장돼요 · 수치는 아직 목업이에요</p>

      <PlayerSheet slot={info} st={st} ev={ev} onClose={() => setInfo(null)} onSwap={swapFromInfo} />
      <SwapSheet slot={slot} st={st} ev={ev} onClose={() => setSlot(null)} onApply={applyFromSheet} />
      <BenchSheet cardId={benchCard} st={st} ev={ev} onClose={() => setBenchCard(null)} onApply={applyFromSheet} />
    </div>
  );
}
