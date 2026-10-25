// 투수진 — 타순 탭과 같은 전력표 (공용 조각은 ./StatTable). 열 = 선발 1~5 → 불펜 10칸(셋업맨 · 필승조 · 좌완 원포인트 …) → 마무리.
//   열 머리: 옮기기 손잡이 · 보직 이름 · 보직 적성(보직 밖 −10 · 조금 달라요 −2) · 부상 · 오늘 선발(./today — 경기 계산과 같은 순번)
//   줄 = 투수 대표 능력치 6 (구속 · 구위 · 변화 · 제구 · 체력(선발)/회복(불펜) · 위기관리 — 카드 앞면과 같은 숫자, 막대는 기본 + 더해진 값)
//        + 이번 시즌 · 케미(선발–주전 포수 배터리, 셋업맨–마무리 뒷문) · 잠재력 · 강화와 훈련 · 고유 구종, 맨 아래 평균(선발 · 불펜 · 전체)
// 손잡이를 누르고 같은 묶음의 다른 열을 누르면 순서(보직)가 바뀐다. 열(카드)을 누르면 투수 정보(교체는 그 안에서).
import { useState, useSyncExternalStore, type CSSProperties, type MouseEvent } from 'react';
import { Button, Icon, fmt } from '../../ui';
import { teamById } from '../../game/mock';
import { potVersion, subscribePot } from '../../game/potential';
import { useSeason } from '../../season/store';
import { shortDate } from '../../season/schedule';
import { PEN_SLOTS, ROT_SLOTS, SLOT_KO, STAFF_FIT_PENALTY, getSlot, unit, type Eval, type LineupState, type StaffSlot } from './calc';
import { todayStarter } from './today';
import {
  AvgTable, CardCell, ChemLine, MarksCell, PIT_ROWS, PotCell, StatCells, StatCol, StatGrid, avgOf, cellsOf, cx, statRows,
  type Band, type GridRow,
} from './StatTable';
import s from './StatTable.module.css';

const SLOTS: StaffSlot[] = [...ROT_SLOTS, ...PEN_SLOTS, 'CL'];

const ROWS: GridRow[] = [
  { kind: 'band', label: '묶음' },
  { kind: 'head', label: '보직' },
  { kind: 'card', label: '카드' },
  ...statRows(PIT_ROWS),
  { kind: 'more', label: '이번 시즌' },
  { kind: 'more', label: '케미' },
  { kind: 'more', label: '잠재력' },
  { kind: 'more', label: '강화 · 훈련' },
  { kind: 'more', label: '고유 구종' },
];

const ARMS = ['오버핸드', '스리쿼터', '사이드암', '언더핸드'];
const armOf = (form?: string) => (form ? ARMS.find((a) => form.includes(a)) ?? form : '');

export interface PitchTabProps {
  st: LineupState;
  ev: Eval;
  onOpen: (slot: StaffSlot) => void;
  onSwap: (a: StaffSlot, b: StaffSlot) => void;
}

export function PitchTab({ st, ev, onOpen, onSwap }: PitchTabProps) {
  useSyncExternalStore(subscribePot, potVersion);
  const [pick, setPick] = useState<StaffSlot | null>(null);
  const sameGroup = (a: StaffSlot, b: StaffSlot) => a[0] === b[0];
  const season = useSeason();
  const today = todayStarter(st, season);

  const tap = (slot: StaffSlot) => {
    if (!pick) { onOpen(slot); return; }
    if (pick !== slot && !sameGroup(pick, slot)) return; // 다른 묶음은 못 바꾼다 (흐리게)
    if (pick !== slot) onSwap(pick, slot);
    setPick(null);
  };
  const tapHandle = (e: MouseEvent, slot: StaffSlot) => {
    e.stopPropagation();
    if (!pick) setPick(slot);
    else { if (pick !== slot && sameGroup(pick, slot)) onSwap(pick, slot); setPick(null); }
  };

  const cols = SLOTS.map((slot, i) => {
    const id = getSlot(st, slot);
    const u = id ? unit(id) : null;
    const ue = ev.units[slot];
    return { i, slot, id, u, ue, cells: u ? cellsOf(u, ue, PIT_ROWS) : {} };
  });
  const filled = (xs: typeof cols) => xs.filter((c) => c.u).map((c) => c.cells);
  const rot = filled(cols.slice(0, 5));
  const pen = filled(cols.slice(5));
  const all = filled(cols);

  const catcher = st.field.C ? unit(st.field.C).player.name : null;
  const bands: Band[] = [
    { key: 'rot', from: 0, to: 4, className: s.bandHot, children: <><b>선발 로테이션</b><span className={s.bandSub}>{catcher ? `포수 ${catcher} 배터리` : '5명'}</span></> },
    { key: 'pen', from: 5, to: 14, children: <><b>불펜</b><span className={s.bandSub}>10명 · 앞 다섯이 주력</span></> },
    { key: 'cl', from: 15, to: 15, className: s.bandHot, children: <b>마무리</b> },
  ];

  return (
    <section className={cx(s.tab, s.tabWide)} aria-label="투수진">
      <header className={s.top}>
        <p className={s.lead}>
          {pick
            ? <><b>{SLOT_KO[pick]}</b> 자리와 바꿀 투수를 누르세요 ({pick[0] === 'R' ? '선발' : '불펜'}끼리)</>
            : <>손잡이를 누르고 같은 묶음의 다른 투수를 누르면 보직이 바뀌어요</>}
        </p>
        {pick && <Button variant="ghost" size="s" onClick={() => setPick(null)}>취소</Button>}
      </header>

      {today && (
        <p className={s.todayLine}>
          <em>오늘 선발</em>
          <b>{SLOT_KO[today.slot]} {unit(today.cardId).player.name}</b>
          <span>{shortDate(today.date)} · {today.home ? '홈' : '원정'} {teamById(today.opp).short}전</span>
        </p>
      )}

      <StatGrid n={SLOTS.length} rows={ROWS} bands={bands} picking={!!pick} flipKey={[...st.rotation, ...st.bullpen, st.closer].join(',')}>
        {cols.map(({ i, slot, id, u, ue, cells }) => {
          const movable = slot !== 'CL';
          const blocked = !!pick && !sameGroup(pick, slot);
          const isToday = !!u && today?.slot === slot && !today.frozen;
          const pen = ue ? STAFF_FIT_PENALTY[ue.fit] : 0;
          const pl = u?.player.season.pit;
          const sig = u?.card.signaturePitch;
          const arm = armOf(u?.player.form.pitch);
          const who = u ? `${SLOT_KO[slot]} ${u.player.name}${isToday ? ' — 오늘 선발' : ''}` : `${SLOT_KO[slot]} 빈 자리`;
          const chem = slot[0] === 'R' ? { link: ev.battery[i], label: '배터리' } : slot === 'B0' || slot === 'CL' ? { link: ev.backdoor, label: '뒷문' } : null;
          return (
            <StatCol key={slot} flip={id ?? slot} label={who} grade={u?.card.grade}
              className={cx(pick === slot && s.picked, blocked && s.blocked, isToday && s.today, ue?.injured && s.hurt)}
              onClick={() => tap(slot)}>
              {/* 손잡이 · 보직 · 적성 / 부상 / 오늘 선발 */}
              <div className={s.head}>
                {movable ? (
                  <button type="button" className={cx(s.no, s.noSwap)} onClick={(e) => tapHandle(e, slot)} aria-pressed={pick === slot} aria-disabled={blocked || undefined}
                    aria-label={pick === slot ? '고른 것 취소' : pick ? `${SLOT_KO[slot]} 자리와 바꾸기` : `${SLOT_KO[slot]} 순서 옮기기`}>
                    <Icon name="swap" size={14} stroke={2} />
                  </button>
                ) : (
                  <span className={cx(s.no, s.noStatic)} aria-hidden><Icon name="shield" size={13} stroke={2} /></span>
                )}
                <span className={s.role}>{SLOT_KO[slot]}</span>
                {isToday ? <em className={s.todayTag}>오늘 선발</em>
                  : ue?.injured ? <span className={s.hurtTag} title={u?.player.injury}><Icon name="alert" size={11} /> 부상 −10</span>
                  : pen > 0 && u ? <span className={s.warnTag} title={ue?.fit === 'near' ? `${u.player.role === 'SP' ? '선발 투수' : '불펜 투수'} · 보직 밖` : '보직이 조금 달라요'}>{ue?.fit === 'near' ? '보직 밖' : '조금 달라요'} −{pen}</span>
                  : u ? <span className={s.hand}>{u.player.throws === 'L' ? '좌투' : '우투'}{arm ? ` · ${arm}` : ''}</span> : null}
              </div>

              <CardCell u={u} ue={ue} empty={SLOT_KO[slot]}
                label={!pick ? `${who} — ${u ? '정보 보기' : '채우기'}` : pick === slot ? '고른 것 취소' : blocked ? `${SLOT_KO[slot]} — 다른 묶음이라 못 바꿔요` : `${SLOT_KO[slot]} 자리와 바꾸기`} />

              <StatCells rows={PIT_ROWS} cells={cells} none={() => (u ? '—' : '')} />

              {/* 이번 시즌 */}
              <div className={s.season}>
                {pl ? (
                  <>
                    <b className="num">{fmt.era(pl.era)}</b>
                    <small className="num">
                      {slot === 'CL' ? `${pl.sv}세이브` : slot[0] === 'R' ? `${pl.w}승 ${pl.l}패` : u?.player.role === 'CL' ? `${pl.sv}세이브` : `${pl.hld}홀드`}
                    </small>
                  </>
                ) : u ? <small className={s.dim}>기록 없음</small> : null}
              </div>

              {/* 케미 — 배터리(선발–주전 포수) · 뒷문(셋업맨–마무리) */}
              <div className={s.chem}>
                {chem && u ? <ChemLine link={chem.link} label={chem.label} /> : null}
              </div>

              <PotCell u={u} ue={ue} />
              <MarksCell u={u} />

              {/* 고유 구종 */}
              <div className={s.sigCell} title={sig ? `${sig.name} · ${sig.effect}` : undefined}>
                {sig ? <span className={s.sigName} style={{ ['--sig' as string]: sig.color } as CSSProperties}>{sig.name}</span>
                  : u ? <small className={s.dim}>—</small> : null}
              </div>
            </StatCol>
          );
        })}
      </StatGrid>

      <AvgTable title="평균" rows={PIT_ROWS} groups={[
        { k: 'rot', ko: '선발', n: rot.length, avg: avgOf(rot, PIT_ROWS) },
        { k: 'pen', ko: '불펜 · 마무리', n: pen.length, avg: avgOf(pen, PIT_ROWS) },
        { k: 'all', ko: '전체', n: all.length, avg: avgOf(all, PIT_ROWS), strong: true },
      ]} />

      <p className={s.foot}>
        막대 끝 빗금 = 더해진 값(강화 · 훈련 · 잠재력 · 플레이스타일 · 세트덱) · 체력은 선발, 회복은 불펜 · 마무리 · 보직 밖 −10 · 부상 −10
      </p>
    </section>
  );
}
