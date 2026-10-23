// 투수진 — 선발 로테이션 5 · 불펜 5 · 마무리. 선발마다 주전 포수와의 배터리 케미, 셋업맨–마무리 '뒷문' 케미.
// 손잡이를 누르고 같은 묶음의 다른 줄을 누르면 순서(보직)가 바뀐다. 줄을 누르면 투수 정보(교체는 그 안에서).
import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { PlayerArt } from '../../art/PlayerArt';
import { NameYear } from '../../cards';
import { Button, Icon, fmt } from '../../ui';
import { GRADES } from '../../game/grades';
import { LEVEL_KO, PEN_SLOTS, ROT_SLOTS, SLOT_KO, getSlot, unit, type Eval, type Link, type LineupState, type StaffSlot } from './calc';
import { useFlip } from './hooks';
import s from './Lists.module.css';

/** 빛이 지나가는 줄 — 엘리트 이상 */
const GLOW_ROW = new Set(['elite', 'legend', 'franchise', 'black', 'signature', 'mvp', 'gg', 'th', 'unique']);

const ARMS = ['오버핸드', '스리쿼터', '사이드암', '언더핸드'];
const armOf = (form?: string) => (form ? ARMS.find((a) => form.includes(a)) ?? form : '');

export interface PitchTabProps {
  st: LineupState;
  ev: Eval;
  onOpen: (slot: StaffSlot) => void;
  onSwap: (a: StaffSlot, b: StaffSlot) => void;
}

/** 케미 표시 — 짧은 선 견본 + 단계 */
export function ChemMark({ link, label }: { link: Link | null; label?: string }) {
  if (!link) return null;
  return (
    <span className={s.chemMark} title={link.why.join(' · ') || '공통점 없음'}>
      <svg width="18" height="8" viewBox="0 0 18 8" aria-hidden className={s['m' + link.level]}><path d="M1 4h16" /></svg>
      {label && <span>{label}</span>}
      <b className={s['t' + link.level]}>{LEVEL_KO[link.level]}</b>
    </span>
  );
}

export function PitchTab({ st, ev, onOpen, onSwap }: PitchTabProps) {
  const [pick, setPick] = useState<StaffSlot | null>(null);
  const rotRef = useRef<HTMLOListElement>(null);
  const penRef = useRef<HTMLOListElement>(null);
  useFlip(rotRef, [st.rotation.join(',')]);
  useFlip(penRef, [st.bullpen.join(',')]);
  const sameGroup = (a: StaffSlot, b: StaffSlot) => a[0] === b[0];

  const tap = (slot: StaffSlot) => {
    if (!pick) { onOpen(slot); return; }
    if (pick !== slot && sameGroup(pick, slot)) onSwap(pick, slot);
    setPick(null);
  };
  const tapHandle = (slot: StaffSlot) => {
    if (!pick) setPick(slot);
    else { if (pick !== slot && sameGroup(pick, slot)) onSwap(pick, slot); setPick(null); }
  };

  const row = (slot: StaffSlot, side?: ReactNode, movable = true) => {
    const id = getSlot(st, slot);
    const u = id ? unit(id) : null;
    const ue = ev.units[slot];
    const pl = u?.player.season.pit;
    const sig = u?.card.signaturePitch;
    const blocked = pick != null && !sameGroup(pick, slot);
    const arm = armOf(u?.player.form.pitch);
    return (
      <li key={slot} data-flip={id ?? slot}
        className={[s.row, s.pRow, u && s.graded, u && s['g-' + u.card.grade], u && GLOW_ROW.has(u.card.grade) && s.shine, pick === slot && s.picked, blocked && s.blocked, ue?.injured && s.hurt].filter(Boolean).join(' ')}
        style={u ? ({ ['--gr' as string]: `var(--gr-${u.card.grade})` } as CSSProperties) : undefined}>
        <button type="button" className={s.body} onClick={() => tap(slot)} disabled={blocked}
          aria-label={u ? `${SLOT_KO[slot]} ${u.player.name} — 정보 보기` : `${SLOT_KO[slot]} 비어 있음 — 채우기`}>
          <span className={s.role}>{SLOT_KO[slot]}</span>
          {u ? (
            <>
              <span className={s.face}><PlayerArt player={u.player} variant="mini" /></span>
              <span className={s.who}>
                <b className={s.name}><NameYear name={u.player.name} year={u.card.year} /></b>
                <small className={s.meta}>
                  <span style={{ color: `var(--gr-${u.card.grade})` }}>{GRADES[u.card.grade].ko}</span>
                  <span>{u.player.throws === 'L' ? '좌투' : '우투'}</span>
                  {arm && <span>{arm}</span>}
                  {ue?.fit === 'near' && <span className={s.warn}>{u.player.role === 'SP' ? '선발 투수' : '불펜 투수'}</span>}
                </small>
                {ue?.injured
                  ? <small className={[s.fit, s.hurtText].join(' ')}><Icon name="alert" size={12} /> {u.player.injury}</small>
                  : sig && <small className={s.fit}><span className={s.sig} style={{ ['--sig' as string]: sig.color } as CSSProperties}>{sig.name}</span><span className={s.sigFx}>{sig.effect.split(' · ')[0]}</span></small>}
              </span>
              <span className={s.stat}>
                <b className="num">{pl ? fmt.era(pl.era) : '—'}</b>
                <small className="num">
                  {pl ? (slot === 'CL' ? `${pl.sv}세이브` : slot[0] === 'R' ? `${pl.w}승 ${pl.l}패` : u.player.role === 'CL' ? `${pl.sv}세이브` : `${pl.hld}홀드`) : ''}
                </small>
                {side}
              </span>
            </>
          ) : (
            <span className={s.emptyRow}><Icon name="plus" size={16} /> 비어 있어요 · 눌러서 채우기</span>
          )}
        </button>
        {movable && (
          <button type="button" className={s.handle} onClick={() => tapHandle(slot)} aria-pressed={pick === slot} disabled={blocked}
            aria-label={pick === slot ? '고른 것 취소' : `${SLOT_KO[slot]} 순서 옮기기`}>
            <Icon name="swap" size={18} className={s.handleIco} />
          </button>
        )}
      </li>
    );
  };

  const catcher = st.field.C ? unit(st.field.C).player.name : '포수';
  return (
    <section className={s.tab} aria-label="투수진">
      <header className={s.top}>
        <p className={s.lead}>
          {pick == null ? <>손잡이를 누르고 같은 묶음의 다른 줄을 누르면 순서가 바뀌어요.</> : <><b>{SLOT_KO[pick]}</b> 자리와 바꿀 줄을 누르세요</>}
        </p>
        {pick != null && <Button variant="ghost" size="s" onClick={() => setPick(null)}>취소</Button>}
      </header>

      <h3 className={s.sec}><b>선발 로테이션</b><span>오른쪽은 주전 포수 {catcher}와의 배터리 케미</span></h3>
      <ol ref={rotRef} className={s.list}>
        {ROT_SLOTS.map((slot, i) => row(slot, <ChemMark link={ev.battery[i]} label="배터리" />))}
      </ol>

      <h3 className={s.sec}><b>불펜</b><span>셋업맨부터 롱릴리프까지</span></h3>
      <ol ref={penRef} className={s.list}>
        {PEN_SLOTS.map((slot) => row(slot))}
      </ol>

      <h3 className={s.sec}><b>마무리</b><span>셋업맨과 이어지는 뒷문</span></h3>
      <ol className={s.list}>{row('CL', <ChemMark link={ev.backdoor} label="뒷문" />, false)}</ol>
      <p className={s.foot}>1선발은 수비 배치 판의 마운드에 서요 · 다친 투수는 종합이 10 깎여요</p>
    </section>
  );
}
