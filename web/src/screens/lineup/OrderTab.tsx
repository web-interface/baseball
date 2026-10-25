// 타순 — 마구마구 '세트덱 종합'처럼 1~9번 타자를 열로 세운 전력표 (공용 조각은 ./StatTable).
//   열 = 타순 1~9번: 타순 번호(옮기기 손잡이) · 이웃 타순 케미 사슬 · 포지션 · 타순 적성(적임 · 무난 · 어색) · 작은 카드
//   줄 = 대표 능력치 6 (컨택 · 파워 · 선구 · 주루 · 수비 · 송구 — 카드 앞면과 같은 숫자, 막대는 기본 + 더해진 값)
//        + 이번 시즌 · 잠재력 · 강화와 훈련 · 백업(그 자리를 맡을 벤치 선수 1~2명), 맨 아래 평균 띠(+ 파워+컨택 · 수비+송구)
// 번호를 누르고 다른 열을 누르면 두 타자의 순서가 바뀐다. 열(카드)을 누르면 선수 정보(교체는 그 안에서).
import { useState, useSyncExternalStore, type MouseEvent } from 'react';
import { Button, Icon, fmt } from '../../ui';
import { showWith } from '../../game/ovrShow';
import { potVersion, subscribePot } from '../../game/potential';
import {
  FIT_KO, LEVEL_KO, ORDER_FIT_KO, ORDER_ROLE, SLOT_KO, benchFor, cardOvr, fitOf, unit,
  type BatSlot, type Eval, type Fit, type Level, type Link, type LineupState, type Slot, type Unit, type UnitEval,
} from './calc';
import { cardNow } from './ctx';
import {
  AvgCards, BAT_ROWS, CardCell, MarksCell, PotCell, StatCells, StatCol, StatGrid, avgOf, cellsOf, chemTone, cx, statRows,
  type Band, type Cells, type GridRow,
} from './StatTable';
import s from './StatTable.module.css';

/** 묶음 띠 — 테이블세터 · 클린업 · 하위 타선 (links = 묶음 안 케미 사슬의 앞 타순 0~) */
const GROUPS = [
  { ko: '테이블세터', sub: '1·2번', from: 0, to: 1, links: [0], cls: s.bandHot },
  { ko: '클린업', sub: '3·4·5번', from: 2, to: 4, links: [2, 3], cls: s.bandHot },
  { ko: '하위 타선', sub: '6~9번', from: 5, to: 8, links: [] as number[], cls: undefined },
];

/** 백업 순서 — 주 포지션 → 볼 수 있는 자리(지명) → 비슷한 자리 */
const FIT_RANK: Record<Fit, number> = { main: 0, sub: 1, any: 1, near: 2, off: 9 };
const FIT_SHORT: Partial<Record<Fit, string>> = { sub: '부', near: '비슷' };

interface Backup { id: string; u: Unit; fit: Fit; ovr: number }
interface Col { i: number; slot: BatSlot; u: Unit | null; ue?: UnitEval; cells: Cells; backups: Backup[] }

/** 화면 종합 — 카드 앞면 종합 칸과 같은 값 (벤치 카드: 카드 자체 보너스까지) */
const shownOvr = (u: Unit) => showWith(u.card, u.player.ovr, cardNow(u.card)?.ovr ?? cardOvr(u));

/** 그 자리를 맡을 벤치 선수 1~2명 (적성 밖은 빼고) */
function backupsFor(slot: BatSlot, bench: Unit[]): Backup[] {
  return bench
    .map((u) => ({ id: u.id, u, fit: fitOf(u.player, slot) }))
    .filter((x) => x.fit !== 'off')
    .map((x) => ({ ...x, ovr: shownOvr(x.u) }))
    .sort((a, b) => FIT_RANK[a.fit] - FIT_RANK[b.fit] || b.ovr - a.ovr)
    .slice(0, 2);
}

const ROWS: GridRow[] = [
  { kind: 'band', label: '묶음' },
  { kind: 'head', label: '타순' },
  { kind: 'card', label: '카드' },
  ...statRows(BAT_ROWS),
  { kind: 'more', label: '이번 시즌' },
  { kind: 'more', label: '잠재력' },
  { kind: 'more', label: '강화 · 훈련' },
  { kind: 'more', label: '백업' },
];

export interface OrderTabProps {
  st: LineupState;
  ev: Eval;
  onOpen: (slot: Slot) => void;
  onSwap: (i: number, j: number) => void;
  onAuto: () => void;
  /** 처음 고른 줄 (미리보기·스크린샷용) */
  initialPick?: number | null;
}

export function OrderTab({ st, ev, onOpen, onSwap, onAuto, initialPick = null }: OrderTabProps) {
  useSyncExternalStore(subscribePot, potVersion);
  const [pick, setPick] = useState<number | null>(initialPick);

  const bench = benchFor(st).map(unit);
  const cols: Col[] = st.order.map((slot, i) => {
    const id = st.field[slot];
    const u = id ? unit(id) : null;
    const ue = ev.units[slot];
    return { i, slot, u, ue, cells: u ? cellsOf(u, ue, BAT_ROWS) : {}, backups: backupsFor(slot, bench) };
  });

  // 평균 — 위 열의 숫자 그대로 (그 능력치가 없는 지명 · 포수 칸은 빼고)
  const avg = avgOf(cols.filter((c) => c.u).map((c) => c.cells), BAT_ROWS);
  const combo = (a: string, b: string) => {
    const x = avg[a], y = avg[b];
    return x && y ? { v: (x.v + y.v) / 2, up: (x.up + y.up) / 2 } : null;
  };

  const linkAt = (i: number): Link | undefined => ev.orderLinks.find((l) => l.a === String(i + 1));
  const bands: Band[] = GROUPS.map((g) => {
    const ls = g.links.map(linkAt).filter((l): l is Link => !!l);
    return {
      key: g.ko, from: g.from, to: g.to, className: g.cls,
      children: (
        <>
          <b>{g.ko}</b>
          <span className={s.bandSub}>{g.sub}</span>
          {ls.length > 0 && (
            <em className={s.bandChem} title={ls.map((l) => l.why.join(' · ')).join(' / ')}>
              케미 {ls.map((l) => <i key={l.id} className={chemTone(l.level as Level)}>{LEVEL_KO[l.level as Level]}</i>)}
            </em>
          )}
        </>
      ),
    };
  });

  const tapCol = (i: number, slot: BatSlot) => {
    if (pick == null) { onOpen(slot); return; }
    if (pick !== i) onSwap(pick, i);
    setPick(null);
  };
  const tapHandle = (e: MouseEvent, i: number) => {
    e.stopPropagation();
    if (pick == null) setPick(i);
    else { if (pick !== i) onSwap(pick, i); setPick(null); }
  };
  const picked = pick != null ? cols[pick] : null;

  return (
    <section className={s.tab} aria-label="타순">
      <header className={s.top}>
        <p className={s.lead}>
          {picked
            ? <><b className="num">{picked.i + 1}</b>번 타자{picked.u ? `(${picked.u.player.name})` : ''}와 바꿀 타자를 누르세요</>
            : <>번호를 누르고 다른 타자를 누르면 순서가 바뀌어요</>}
        </p>
        {pick == null
          ? <Button variant="ghost" size="s" onClick={onAuto}>추천 타순</Button>
          : <Button variant="ghost" size="s" onClick={() => setPick(null)}>취소</Button>}
      </header>

      <StatGrid n={9} rows={ROWS} bands={bands} picking={pick != null} flipKey={st.order.join(',')}>
        {cols.map((c) => {
          const { i, slot, u, ue } = c;
          const link = i < 8 ? linkAt(i) : undefined;
          const bl = u?.player.season.bat;
          const who = u ? `${i + 1}번 ${u.player.name}` : `${i + 1}번 ${SLOT_KO[slot]} 빈 자리`;
          return (
            <StatCol key={slot} flip={slot} label={who} grade={u?.card.grade} className={cx(pick === i && s.picked)} onClick={() => tapCol(i, slot)}>
              {/* 타순 번호(옮기기 손잡이) · 이웃 타순과 케미 사슬 · 포지션 · 타순 적성 */}
              <div className={s.head}>
                {link && <i className={cx(s.link, s['c' + link.level])} title={`${i + 1}·${i + 2}번 케미 ${LEVEL_KO[link.level as Level]} — ${link.why.join(' · ')}`} aria-hidden />}
                <button type="button" className={s.no} onClick={(e) => tapHandle(e, i)} aria-pressed={pick === i}
                  aria-label={pick === i ? '고른 것 취소' : pick == null ? `${i + 1}번 타순 옮기기` : `${i + 1}번과 순서 바꾸기`}>
                  <span className="num-display">{i + 1}</span>
                  <i className={s.noIco} aria-hidden><Icon name="swap" size={9} stroke={2.4} /></i>
                </button>
                <span className={s.pos}>
                  <b className="num" title={SLOT_KO[slot]}>{slot}</b>
                  {ue?.orderFit && <span className={s['f-' + ue.orderFit]} title={ORDER_ROLE[i] ? `${i + 1}번 · ${ORDER_ROLE[i]}` : undefined}>{ORDER_FIT_KO[ue.orderFit]}</span>}
                </span>
              </div>

              <CardCell u={u} ue={ue} empty={SLOT_KO[slot]}
                label={pick == null ? `${who} — ${u ? '정보 보기' : '채우기'}` : pick === i ? '고른 것 취소' : `${i + 1}번과 순서 바꾸기`} />

              <StatCells rows={BAT_ROWS} cells={c.cells} none={() => (u ? (slot === 'DH' ? '지명' : '—') : '')} />

              {/* 이번 시즌 */}
              <div className={s.season}>
                {bl ? (
                  <>
                    <b className="num">{fmt.avg(bl.avg)}</b>
                    <small className="num">{bl.hr}홈런 · {fmt.avg(bl.ops)}</small>
                  </>
                ) : u ? <small className={s.dim}>기록 없음</small> : null}
              </div>

              <PotCell u={u} ue={ue} />
              <MarksCell u={u} />

              {/* 백업 — 이 자리를 맡을 벤치 선수 */}
              <ul className={s.backups}>
                {c.backups.map((b) => (
                  <li key={b.id} title={`${b.u.player.name} · ${FIT_KO[b.fit]} · 종합 ${b.ovr}`}>
                    <span className={s.bName}>{b.u.player.name}</span>
                    <b className="num">{b.ovr}</b>
                    {FIT_SHORT[b.fit] && <em className={s.bFit}>{FIT_SHORT[b.fit]}</em>}
                  </li>
                ))}
                {!c.backups.length && <li className={s.dim}>없음</li>}
              </ul>
            </StatCol>
          );
        })}
      </StatGrid>

      <AvgCards title="평균" sub={<>타자 <span className="num">{cols.filter((c) => c.u).length}</span>명</>} rows={BAT_ROWS} avg={avg}
        extra={[
          { k: 'pc', ko: '파워+컨택', v: combo('POW', 'CON') },
          { k: 'da', ko: '수비+송구', v: combo('DEF', 'ARM') },
        ]} />

      <p className={s.foot}>
        막대 끝 빗금 = 더해진 값(강화 · 훈련 · 잠재력 · 플레이스타일 · 세트덱) · 포수는 수비 줄에 블로킹, 송구 줄에 도루저지 ·
        케미 사슬은 이웃한 타순끼리, 테이블세터와 클린업은 짝이 맞으면 한 단 더
      </p>
    </section>
  );
}
