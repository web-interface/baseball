// 장비 탭 — 몸에 걸친 장비(전신 그림 + 슬롯 표시) · 슬롯 목록 · 세트 효과 · 상한 · 가방
// 장비 시트: 착용/해제 · 바꾸기 · 장비 강화(+1~+5, 100/90/70/55/40%, 실패마다 +15%p, 단계·장비 그대로)
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Button, Sheet, fmt, useToast } from '../../ui';
import { PlayerArt } from '../../art/PlayerArt';
import { sdFigurePins } from '../../art/sd';
import type { Player, Team } from '../../game/types';
import { Pips, Sec } from './common';
import { LIcon, type LocalIconName } from './icons';
import {
  BRANDS, GEAR_CAP, GEAR_ENH, GEAR_ENH_GP, TIERS, gearBonus, gloveName, itemValue, rollGear, setsOf, slotsFor,
  type GearItem, type GearSlot, type SlotDef,
} from './local-mock';
import s from './gear.module.css';

export interface GearState { equipped: Partial<Record<GearSlot, GearItem>>; bag: GearItem[] }

const SLOT_ICON: Record<GearSlot, LocalIconName> = {
  bat: 'bat', glove: 'glove', spikes: 'spikes', bgloves: 'bgloves', helmet: 'helmet', wrist: 'wrist', guard: 'guard', cap: 'cap', shirt: 'shirt',
};
type Pt = [number, number];
/** 전신 그림에서 장비가 닿는 몸 위치 — SD 그림의 뼈대(sdFigurePins)로 정확히 (그림 상자 기준 0~1) */
function figureGeom(p: Player, team: Team) {
  try {
    const f = sdFigurePins(p, team);
    const pts: Record<GearSlot, Pt> = {
      helmet: f.head, cap: f.head, shirt: f.chest, guard: f.elbow, wrist: f.wrist, bgloves: f.hand,
      bat: f.grip ?? f.hip, glove: f.glove ?? f.hand, spikes: f.foot,
    };
    return { aspect: f.aspect, pts };
  } catch {
    return { aspect: 0.38, pts: { helmet: [0.3, 0.03], cap: [0.3, 0.03], shirt: [0.3, 0.25], guard: [0.3, 0.4], wrist: [0.5, 0.45], bgloves: [0.35, 0.55], bat: [0.4, 0.6], glove: [0.8, 0.42], spikes: [0.4, 0.96] } as Record<GearSlot, Pt> };
  }
}

/** 요소 폭 (ResizeObserver) */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const DOLL_H = 312, COL_W = 58, GAP = 6;
const LEFT_SLOTS: GearSlot[] = ['helmet', 'cap', 'guard', 'wrist', 'bgloves', 'shirt'];

export function slotLabel(d: SlotDef, p: Player) {
  return d.slot === 'glove' ? gloveName(p) : d.ko;
}

export function GearPanel({ p, team, gear, onChange, onTry }: { p: Player; team: Team; gear: GearState; onChange: (g: GearState) => void; onTry: (gp: number) => void }) {
  const slots = slotsFor(p);
  const [open, setOpen] = useState<GearSlot | null>(null);
  const bonus = gearBonus(p, gear.equipped);
  const sets = setsOf(p, gear.equipped);
  const worn = slots.filter((d) => gear.equipped[d.slot]).length;
  const geo = useMemo(() => figureGeom(p, team), [p, team]);
  const [dollRef, W] = useWidth<HTMLDivElement>();
  const vars = { '--team': team.colors.primary } as CSSProperties;
  // 그림 상자 (가운데, 높이 꽉)
  const figH = DOLL_H * 0.97, figW = figH * geo.aspect;
  const figX = (W - figW) / 2, figY = DOLL_H - figH;
  const pin = (sl: GearSlot): Pt => [figX + geo.pts[sl][0] * figW, figY + geo.pts[sl][1] * figH];
  // 왼쪽·오른쪽 기둥 — 몸 위치 높이 순으로 놓아 선이 엇갈리지 않게
  const byY = (a: SlotDef, b: SlotDef) => geo.pts[a.slot][1] - geo.pts[b.slot][1];
  const left = slots.filter((d) => LEFT_SLOTS.includes(d.slot)).sort(byY);
  const right = slots.filter((d) => !LEFT_SLOTS.includes(d.slot)).sort(byY);
  const markY = (i: number, n: number) => (n === 1 ? DOLL_H / 2 : 30 + (i * (DOLL_H - 60)) / (n - 1));
  const items = [...left.map((d, i) => ({ d, side: 'L' as const, y: markY(i, left.length) })), ...right.map((d, i) => ({ d, side: 'R' as const, y: markY(i, right.length) }))];

  const marker = ({ d, side, y }: { d: SlotDef; side: 'L' | 'R'; y: number }) => {
    const it = gear.equipped[d.slot];
    return (
      <button
        key={d.slot}
        type="button"
        className={[s.mark, !it && s.mEmpty].filter(Boolean).join(' ')}
        style={{ top: y, left: side === 'L' ? 0 : undefined, right: side === 'R' ? 0 : undefined }}
        onClick={() => setOpen(d.slot)}
        aria-label={`${slotLabel(d, p)} ${it ? `${it.model} +${itemValue(it)} ${d.stat}` : '비어 있음'}`}
      >
        <LIcon name={SLOT_ICON[d.slot]} size={20} />
        <span className="num">{it ? (d.statKey === 'INJ' ? `−${itemValue(it) * 2}%` : `+${itemValue(it)}`) : '—'}</span>
      </button>
    );
  };

  return (
    <div className={s.panel} style={vars}>
      <Sec title="장비" meta={<>착용 <span className="num">{worn}/{slots.length}</span></>}>
        <div ref={dollRef} className={s.doll} style={{ height: DOLL_H }}>
          {W > 0 && (
            <>
              <div className={s.figure} style={{ left: figX, top: figY, width: figW, height: figH }}>
                <PlayerArt player={p} team={team} variant="full" className={s.art} />
              </div>
              <svg className={s.leaders} width={W} height={DOLL_H} viewBox={`0 0 ${W} ${DOLL_H}`} aria-hidden>
                {items.map(({ d, side, y }) => {
                  const [bx, by] = pin(d.slot);
                  const x0 = side === 'L' ? COL_W + GAP : W - COL_W - GAP;
                  const kx = side === 'L' ? x0 + 10 : x0 - 10;
                  return <path key={d.slot} d={`M${x0} ${y}H${kx}L${bx} ${by}`} className={gear.equipped[d.slot] ? s.lead : s.leadOff} />;
                })}
              </svg>
              {items.map(({ d }) => {
                const [bx, by] = pin(d.slot);
                return <i key={d.slot} className={[s.pin, !gear.equipped[d.slot] && s.pinOff].filter(Boolean).join(' ')} style={{ left: bx, top: by }} aria-hidden />;
              })}
              {items.map(marker)}
            </>
          )}
        </div>

        <div className={s.cap}>
          <p className={s.capHead}>
            <span>장비 보너스</span>
            <b className="num">+{bonus.total}</b>
            <span className={s.capOf}>/ 상한 <span className="num">+{GEAR_CAP.total}</span> · 능력치 하나 <span className="num">+{GEAR_CAP.perStat}</span>까지</span>
          </p>
          <span className={s.capBar} role="meter" aria-valuemin={0} aria-valuemax={GEAR_CAP.total} aria-valuenow={bonus.total} aria-label="장비 보너스">
            {Array.from({ length: GEAR_CAP.total }, (_, i) => <i key={i} className={i < bonus.total ? s.capOn : undefined} />)}
          </span>
          {bonus.raw > bonus.total && <p className={s.capOver}>상한에 걸려 <span className="num">{bonus.raw - bonus.total}</span>만큼은 안 붙어요</p>}
        </div>

        <ul className={s.list}>
          {slots.map((d) => {
            const it = gear.equipped[d.slot];
            return (
              <li key={d.slot}>
                <button type="button" className={s.item} onClick={() => setOpen(d.slot)}>
                  <span className={s.iIcon} aria-hidden><LIcon name={SLOT_ICON[d.slot]} size={20} /></span>
                  <span className={s.iBody}>
                    <span className={s.iSlot}>{slotLabel(d, p)}</span>
                    {it ? <b className={s.iName}>{it.model}</b> : <b className={[s.iName, s.iEmpty].join(' ')}>비어 있음 · 끼우기</b>}
                    {it && (
                      <span className={s.iMeta}>
                        <Pips n={it.tier + 1} of={5} className={s.tierPips} label={`${TIERS[it.tier]} 등급`} />
                        <span>{TIERS[it.tier]}</span>
                        {it.enh > 0 && <span className="num">+{it.enh}강</span>}
                      </span>
                    )}
                  </span>
                  <span className={s.iStat}>
                    {it ? (
                      d.statKey === 'INJ'
                        ? <><b className="num">−{itemValue(it) * 2}%</b><small>{d.stat}</small></>
                        : <><b className="num">+{itemValue(it)}</b><small>{d.stat}</small></>
                    ) : <small>{d.stat}</small>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Sec>

      <Sec title="세트 효과" meta="같은 브랜드 3부위 +2 · 5부위 +4">
        {sets.length === 0 ? (
          <p className={s.none}>같은 브랜드를 3부위 맞추면 세트 효과가 붙어요.</p>
        ) : (
          <ul className={s.sets}>
            {sets.map((st) => (
              <li key={st.brand} className={st.bonus > 0 ? s.setOn : undefined}>
                <span className={s.brand} aria-hidden>{BRANDS[st.brand].mark}</span>
                <div className={s.setBody}>
                  <p><b>{st.ko}</b> <span className="num">{st.n}/5</span></p>
                  <p className={s.setFx}>
                    {st.bonus > 0 ? <>{st.stat} <b className="num">+{st.bonus}</b> 적용 중</> : <>{st.stat} +2 까지 <span className="num">{3 - st.n}</span>부위</>}
                    {st.n < 5 && st.bonus > 0 && <> · 5부위면 <span className="num">+4</span></>}
                  </p>
                </div>
                <Pips n={st.n} of={5} className={s.setPips} label={`${st.n}부위`} />
              </li>
            ))}
          </ul>
        )}
        <p className={s.note}>브랜드는 모두 가상 이름이에요. 장비는 언제든 끼우고 뺄 수 있고, 캐릭터 그림에도 보여요.</p>
      </Sec>

      <GearSheet
        p={p}
        slot={open}
        gear={gear}
        onClose={() => setOpen(null)}
        onChange={onChange}
        onTry={onTry}
      />
    </div>
  );
}

/* ───────── 장비 시트 ───────── */
function GearSheet({ p, slot, gear, onClose, onChange, onTry }: { p: Player; slot: GearSlot | null; gear: GearState; onClose: () => void; onChange: (g: GearState) => void; onTry: (gp: number) => void }) {
  const toast = useToast();
  const [last, setLast] = useState<{ ok: boolean; text: string } | null>(null);
  const d = slot ? slotsFor(p).find((x) => x.slot === slot) : undefined;
  const it = slot ? gear.equipped[slot] : undefined;
  const spare = slot ? gear.bag.filter((b) => b.slot === slot) : [];
  const next = it && it.enh < 5 ? it.enh : null;
  const chance = it && next != null ? (it.fails >= 3 ? 100 : Math.min(100, GEAR_ENH[next] + 15 * it.fails)) : 0;
  const gp = next != null ? GEAR_ENH_GP[next] : 0;

  const setEq = (eq: Partial<Record<GearSlot, GearItem>>, bag: GearItem[]) => onChange({ equipped: eq, bag });
  const equip = (b: GearItem) => {
    if (!slot) return;
    const eq = { ...gear.equipped, [slot]: b };
    const bag = gear.bag.filter((x) => x.id !== b.id);
    if (it) bag.push(it);
    setEq(eq, bag);
    setLast(null);
    toast({ text: `${b.model} 착용`, tone: 'good' });
  };
  const unequip = () => {
    if (!slot || !it) return;
    const eq = { ...gear.equipped };
    delete eq[slot];
    setEq(eq, [...gear.bag, it]);
    setLast(null);
  };
  const enhance = () => {
    if (!slot || !it || next == null) return;
    const tryNo = (it.fails ?? 0) + it.enh * 7;
    const ok = rollGear(it.id, next + 1, tryNo, chance);
    onTry(gp);
    const nit: GearItem = ok ? { ...it, enh: it.enh + 1, fails: 0 } : { ...it, fails: it.fails + 1 };
    setEq({ ...gear.equipped, [slot]: nit }, gear.bag);
    const nextChance = !ok && nit.enh < 5 ? (nit.fails >= 3 ? 100 : Math.min(100, GEAR_ENH[nit.enh] + 15 * nit.fails)) : null;
    setLast(ok
      ? { ok: true, text: `+${nit.enh} 성공 — ${d?.stat} +${itemValue(nit)}` }
      : { ok: false, text: `아쉽게 실패 — 단계는 +${it.enh} 그대로, 다음 확률 ${nextChance}%` });
  };

  return (
    <Sheet
      open={!!slot}
      onClose={() => { setLast(null); onClose(); }}
      title={d ? slotLabel(d, p) : ''}
      sub={d ? `${d.stat}${d.statKey === 'INJ' ? ' 줄이기' : ''} 슬롯 · 등급 +1~+5, 강화 +1~+5` : undefined}
      footer={it && next != null ? (
        <>
          <Button variant="secondary" onClick={unequip}>빼기</Button>
          <Button onClick={enhance} trailing={<><span>{chance}%</span></>}>+{next + 1} 강화</Button>
        </>
      ) : it ? <Button variant="secondary" onClick={unequip}>빼기</Button> : undefined}
    >
      {it && d && (
        <div className={s.sheetItem}>
          <div className={s.sIcon} aria-hidden><LIcon name={SLOT_ICON[d.slot]} size={30} stroke={1.5} /></div>
          <div className={s.sBody}>
            <p className={s.sName}>{it.model}</p>
            <p className={s.sMeta}>{BRANDS[it.brand].ko} · {TIERS[it.tier]} · 강화 <span className="num">+{it.enh}</span></p>
          </div>
          <p className={s.sVal}>
            <b className="num-display">{d.statKey === 'INJ' ? `−${itemValue(it) * 2}%` : `+${itemValue(it)}`}</b>
            <small>{d.stat}</small>
          </p>
        </div>
      )}
      {it && next != null && (
        <div className={s.enh}>
          <p className={s.enhHead}>장비 강화 <span className="num">+{it.enh} → +{next + 1}</span></p>
          <div className={s.ladder} role="list" aria-label="실패 보정">
            {[0, 1, 2, 3].map((k) => {
              const c = k >= 3 ? 100 : Math.min(100, GEAR_ENH[next] + 15 * k);
              return (
                <span key={k} role="listitem" className={[s.rung, k === Math.min(3, it.fails) && s.rungOn, k < it.fails && s.rungDone].filter(Boolean).join(' ')}>
                  <i className="num">{k + 1}번째</i>
                  <b className="num">{c >= 100 ? '확정' : `${c}%`}</b>
                </span>
              );
            })}
          </div>
          <p className={s.enhNote}>실패해도 단계와 장비는 그대로예요. 실패마다 +15%p, 세 번 실패하면 네 번째는 확정.</p>
          <p className={s.enhCost}>비용 <b className="num">{fmt.int(gp)}</b> GP</p>
          {last && <p className={last.ok ? s.ok : s.fail} role="status">{last.text}</p>}
        </div>
      )}
      {it && next == null && <p className={s.maxed}>+5 완성 장비예요.</p>}
      {!it && <p className={s.emptyNote}>비어 있어요. 아래 가방에서 골라 끼우세요.</p>}
      <p className={s.bagHead}>가방 · 이 슬롯 <span className="num">{spare.length}</span>개</p>
      {spare.length === 0 ? (
        <p className={s.none}>여분이 없어요. 대전 보상·장비 상자로 얻을 수 있어요.</p>
      ) : (
        <ul className={s.bag}>
          {spare.map((b) => (
            <li key={b.id}>
              <span className={s.bagName}>
                <b>{b.model}</b>
                <span><Pips n={b.tier + 1} of={5} className={s.tierPips} /> {TIERS[b.tier]} · <span className="num">+{itemValue(b)}</span> {d?.stat}</span>
              </span>
              <Button size="s" variant={it && itemValue(b) <= itemValue(it) ? 'ghost' : 'secondary'} onClick={() => equip(b)}>{it ? '바꾸기' : '끼우기'}</Button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
