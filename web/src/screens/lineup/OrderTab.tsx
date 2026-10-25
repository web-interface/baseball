// 타순 — 1~9번. 줄 사이 케미 사슬(테이블세터 · 클린업), 타순 적성(적임·무난·어색).
// 오른쪽 손잡이를 누르고 다른 줄을 누르면 두 타자의 순서가 바뀐다. 줄을 누르면 선수 정보(교체는 그 안에서).
import { useRef, useState, type CSSProperties } from 'react';
import { PlayerArt } from '../../art/PlayerArt';
import { NameYear } from '../../cards';
import { Button, Icon, fmt } from '../../ui';
import { GRADES } from '../../game/grades';
import {
  LEVEL_KO, ORDER_FIT_KO, ORDER_ROLE, SLOT_KO, unit,
  type BatSlot, type Eval, type Level, type LineupState, type Slot,
} from './calc';
import { useFlip } from './hooks';
import s from './Lists.module.css';
import { Marks, hasMarks } from './Marks';

/** 빛이 지나가는 줄 — 엘리트 이상 */
const GLOW_ROW = new Set(['elite', 'legend', 'franchise', 'black', 'signature', 'mvp', 'gg', 'th', 'unique']);

const GROUPS: Record<number, { ko: string; sub: string; links: number[] }> = {
  0: { ko: '테이블세터', sub: '1·2번', links: [0] },
  2: { ko: '클린업', sub: '3·4·5번', links: [2, 3] },
  5: { ko: '하위 타선', sub: '6~9번', links: [] },
};
const ROW_H = 66;
/** 강화 · 훈련 · 잠재력 표시 줄이 있는 타순 — 줄 높이를 늘린다 (케미 선 길이도 같이) */
const ROW_H_MARKS = 94;
const HEAD_H = 34;

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
  const [pick, setPick] = useState<number | null>(initialPick);
  const list = useRef<HTMLOListElement>(null);
  useFlip(list, [st.order.join(',')]);
  // 강화 · 훈련 · 잠재력 표시가 한 명이라도 있으면 모든 줄을 같은 높이로 늘린다 (케미 선이 줄 사이를 정확히 잇게)
  const rowH = st.order.some((slot) => { const id = st.field[slot]; return !!id && hasMarks(unit(id).card); }) ? ROW_H_MARKS : ROW_H;

  const tapRow = (i: number, slot: BatSlot) => {
    if (pick == null) { onOpen(slot); return; }
    if (pick !== i) onSwap(pick, i);
    setPick(null);
  };
  const tapHandle = (i: number) => {
    if (pick == null) setPick(i);
    else { if (pick !== i) onSwap(pick, i); setPick(null); }
  };

  return (
    <section className={s.tab} aria-label="타순">
      <header className={s.top}>
        <p className={s.lead}>
          {pick != null && <><b className="num">{pick + 1}</b>번과 바꿀 타순</>}
        </p>
        {pick == null
          ? <Button variant="ghost" size="s" onClick={onAuto}>추천 타순</Button>
          : <Button variant="ghost" size="s" onClick={() => setPick(null)}>취소</Button>}
      </header>

      <ol ref={list} className={[s.list, pick != null && s.picking].filter(Boolean).join(' ')}>
        {st.order.map((slot, i) => {
          const id = st.field[slot];
          if (!id) return null;
          const u = unit(id);
          const ue = ev.units[slot];
          const bl = u.player.season.bat;
          const g = GROUPS[i];
          const link = ev.orderLinks[i];
          const nextHead = GROUPS[i + 1] ? HEAD_H : 0;
          const groupLinks = g?.links.map((k) => ev.orderLinks[k]).filter(Boolean) ?? [];
          return [
            g && (
              <li key={`g${i}`} className={s.group} aria-hidden style={{ height: HEAD_H }}>
                <b>{g.ko}</b><span>{g.sub}</span>
                {groupLinks.length > 0 && (
                  <em className={s.groupChem}>
                    케미 {groupLinks.map((l) => <i key={l!.id} className={s['t' + l!.level]}>{LEVEL_KO[l!.level as Level]}</i>)}
                  </em>
                )}
              </li>
            ),
            <li
              key={slot}
              data-flip={slot}
              className={[s.row, s.graded, s['g-' + u.card.grade], GLOW_ROW.has(u.card.grade) && s.shine, pick === i && s.picked].filter(Boolean).join(' ')}
              style={{ height: rowH, ['--link-h' as string]: `${rowH + nextHead}px`, ['--gr' as string]: `var(--gr-${u.card.grade})` } as CSSProperties}
            >
              <span className={s.rail} aria-hidden>
                <i className={s.node} />
                {link && <i className={[s.chain, s['c' + link.level]].join(' ')} title={link.why.join(' · ')} />}
              </span>
              <button type="button" className={s.body} onClick={() => tapRow(i, slot)}
                aria-label={pick == null ? `${i + 1}번 ${u.player.name} — 정보 보기` : `${i + 1}번과 순서 바꾸기`}>
                <span className={['num-display', s.no].join(' ')}>{i + 1}</span>
                <span className={s.face}><PlayerArt player={u.player} variant="mini" /></span>
                <span className={s.who}>
                  <b className={s.name}><NameYear name={u.player.name} year={u.card.year} /></b>
                  <small className={s.meta}>
                    <span className="num" title={SLOT_KO[slot]}>{slot}</span>
                    <span>{u.player.bats === 'L' ? '좌타' : u.player.bats === 'S' ? '양타' : '우타'}</span>
                    <span style={{ color: `var(--gr-${u.card.grade})` }}>{GRADES[u.card.grade].ko}{u.card.year ? ` ${fmt.yearTag(u.card.year)}` : ''}</span>
                  </small>
                  <Marks card={u.card} player={u.player} />
                  {ue?.orderFit && (
                    <small className={s.fit}>
                      <span className={s['f-' + ue.orderFit]}>{i + 1}번 {ORDER_FIT_KO[ue.orderFit]}</span>
                      <span>{ORDER_ROLE[i]}</span>
                    </small>
                  )}
                </span>
                <span className={s.stat}>
                  <b className="num">{bl ? fmt.avg(bl.avg) : '—'}</b>
                  <small className="num">{bl ? `${bl.hr}홈런 · OPS ${fmt.avg(bl.ops)}` : ''}</small>
                </span>
              </button>
              <button type="button" className={s.handle} onClick={() => tapHandle(i)} aria-pressed={pick === i}
                aria-label={pick === i ? '고른 것 취소' : `${i + 1}번 타순 옮기기`}>
                <Icon name="swap" size={18} className={s.handleIco} />
              </button>
            </li>,
          ];
        })}
      </ol>
      <p className={s.foot}>케미 사슬은 이웃한 타순끼리 · 테이블세터와 클린업은 짝이 맞으면 한 단 더</p>
    </section>
  );
}
