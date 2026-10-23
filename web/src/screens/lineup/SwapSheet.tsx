// 바꾸기 시트 — 자리를 누르면: 지금 선수 + 넣을 수 있는 선수(벤치 · 보관함 · 다른 자리와 맞바꿈)를
// '넣으면 팀 종합이 얼마나 되는지' 순서로. 벤치 카드를 누르면 반대로 '어느 자리에 넣을지'.
import { useEffect, useMemo, useState } from 'react';
import { CardMini, NameYear } from '../../cards';
import { Sheet, fmt } from '../../ui';
import { GRADES } from '../../game/grades';
import { POS_KO } from '../../game/labels';
import {
  BOOM, FIT_KO, FIT_PENALTY, LEVEL_KO, SLOT_KO, candidates, getSlot, isBat, placesFor, unit,
  type BoardSlot, type Cand, type Eval, type Fit, type Link, type LineupState, type Slot,
} from './calc';
import s from './SwapSheet.module.css';

/** 받침 있으면 a, 없으면 b — '1선발과' · '포수와' */
export const josa = (w: string, a: string, b: string) => {
  const c = w.charCodeAt(w.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0 ? a : b;
};

const fitText = (f: Fit, slot: Slot) => {
  if (f === 'any') return '지명타자로';
  if (!isBat(slot) && f === 'near') return '보직이 달라요 −3';
  return FIT_PENALTY[f] ? `${FIT_KO[f]} −${FIT_PENALTY[f]}` : FIT_KO[f];
};

type Fx = { text: string; tone?: 'boom' | 'bad' | 'up' | 'down' };
/** 바꾸면 달라지는 것 — 왕조 · 세트 단계 · 세트 인원 · 케미 선 */
function effects(cur: Eval, nx: Eval): Fx[] {
  const out: Fx[] = [];
  if (nx.exploded && !cur.exploded) out.push({ text: '왕조 — 능력치 폭발', tone: 'boom' });
  else if (cur.exploded && !nx.exploded) out.push({ text: '왕조 풀림', tone: 'bad' });
  else {
    const a = new Map(cur.sets.map((x) => [x.id, x]));
    const b = new Map(nx.sets.map((x) => [x.id, x]));
    const ids = [...new Set([...a.keys(), ...b.keys()])];
    // 켜진 세트의 단계가 바뀐 것
    const changed = ids.map((id) => ({ o: a.get(id), n: b.get(id) }))
      .filter(({ o, n }) => (o?.active || n?.active) && ((o?.active ? o.tier : -1) !== (n?.active ? n.tier : -1)));
    changed.slice(0, 2).forEach(({ o, n }) => {
      const up = (n?.active ? n.tier : -1) > (o?.active ? o.tier : -1);
      const x = (n ?? o)!;
      out.push({ text: `세트 ${x.name} ${up ? `+${n!.cur!.v} 켜짐` : '꺼짐'}`, tone: up ? 'up' : 'down' });
    });
    if (!changed.length) {
      // 모으는 중 — 인원이 바뀐 세트 중 다음 단계에 가장 가까운 것
      const moved = ids.map((id) => ({ o: a.get(id), n: b.get(id) }))
        .filter(({ o, n }) => (o?.have ?? 0) !== (n?.have ?? 0) && (n?.next || o?.next))
        .sort((p, q) => ((p.n?.next?.at ?? 99) - (p.n?.have ?? 0)) - ((q.n?.next?.at ?? 99) - (q.n?.have ?? 0)))[0];
      if (moved) {
        const x = (moved.n ?? moved.o)!;
        const up = (moved.n?.have ?? 0) > (moved.o?.have ?? 0);
        out.push({ text: `${x.name} ${moved.n?.have ?? 0}/${(moved.n ?? moved.o)!.next?.at ?? 20}`, tone: up ? 'up' : 'down' });
      }
    }
  }
  const all = (e: Eval) => [...e.links, ...e.orderLinks, ...e.battery.filter((l): l is Link => !!l), ...(e.backdoor ? [e.backdoor] : [])];
  const before = new Map(all(cur).map((l) => [l.id, l.level as number]));
  let up = 0;
  let down = 0;
  all(nx).forEach((l) => { const o = before.get(l.id) ?? 0; if (l.level > o) up += 1; else if (l.level < o) down += 1; });
  if (up) out.push({ text: `케미 ${up}개 ↑`, tone: 'up' });
  if (down) out.push({ text: `${up ? '' : '케미 '}${down}개 ↓`, tone: 'down' });
  if (!out.length) out.push({ text: '케미 그대로' });
  return out;
}

function Effects({ fx }: { fx: Fx[] }) {
  return (
    <small className={s.fx}>
      {fx.map((f) => <span key={f.text} className={f.tone ? s[f.tone] : undefined}>{f.text}</span>)}
    </small>
  );
}

function Score({ cur, nx, slot }: { cur: Eval; nx: Eval; slot: Slot }) {
  const pit = !isBat(slot) && slot !== 'R0';
  const v = pit ? nx.parts.find((p) => p.k === 'pit')!.v : nx.overall;
  const d = v - (pit ? cur.parts.find((p) => p.k === 'pit')!.v : cur.overall);
  return (
    <span className={s.num}>
      {pit && <small>투수</small>}
      <b className="num">{v}</b>
      <i className={['num', d > 0 ? s.up : d < 0 ? s.down : s.same].join(' ')}>{d ? fmt.signed(d) : '±0'}</i>
    </span>
  );
}

/** 이 자리 케미 선 목록 — '3루수 끊김 · 유격수 1단' */
function slotLinks(ev: Eval, slot: Slot): string[] {
  const b: BoardSlot | null = isBat(slot) ? slot : slot === 'R0' ? 'P' : null;
  const name = (x: string) => (x === 'P' ? '1선발' : SLOT_KO[x as Slot] ?? x);
  if (b) {
    return ev.links.filter((l) => l.a === b || l.b === b).map((l) => `${name(l.a === b ? l.b : l.a)} ${LEVEL_KO[l.level]}${l.name ? `(${l.name})` : ''}`);
  }
  if (slot[0] === 'R') { const l = ev.battery[Number(slot[1])]; return l ? [`포수 ${LEVEL_KO[l.level]}(배터리)`] : []; }
  if ((slot === 'B0' || slot === 'CL') && ev.backdoor) return [`${slot === 'B0' ? '마무리' : '셋업맨'} ${LEVEL_KO[ev.backdoor.level]}(뒷문)`];
  return [];
}

export interface SwapSheetProps {
  /** 연 자리 (null 이면 닫힘) */
  slot: Slot | null;
  st: LineupState;
  ev: Eval;
  onClose: () => void;
  onApply: (next: LineupState, msg: { slot: Slot; id: string }) => void;
}

export function SwapSheet({ slot, st, ev, onClose, onApply }: SwapSheetProps) {
  const [shown, setShown] = useState<Slot | null>(slot);
  useEffect(() => { if (slot) setShown(slot); }, [slot]);
  const at = slot ?? shown;
  const list = useMemo(() => (slot ? candidates(st, slot, ev) : []), [slot, st, ev]);
  if (!at) return null;

  const curId = getSlot(st, at);
  const cu = curId ? unit(curId) : null;
  const ue = ev.units[at];
  const links = slotLinks(ev, at);
  const best = list[0];
  const srcText = (c: Cand) => (c.src === 'bench' ? '벤치' : c.src === 'box' ? '보관함' : `${SLOT_KO[c.from!]}${josa(SLOT_KO[c.from!], '과', '와')} 맞바꿈`);

  return (
    <Sheet
      open={!!slot}
      onClose={onClose}
      height="tall"
      title={`${SLOT_KO[at]} ${cu ? '바꾸기' : '채우기'}`}
      sub={cu ? '위에서부터 넣으면 더 강해지는 순서예요' : '비어 있는 자리예요. 넣을 선수를 골라요'}
    >
      {cu && ue && (
        <div className={s.cur}>
          <CardMini player={cu.player} grade={cu.card.grade} enhance={cu.card.enhance} year={cu.card.year} width={56} />
          <div className={s.curText}>
            <p className={s.curName}><b><NameYear name={cu.player.name} year={cu.card.year} /></b><span>{cu.team.name}</span></p>
            <p className={s.curMeta}>
              <span style={{ color: `var(--gr-${cu.card.grade})` }}>{GRADES[cu.card.grade].ko}{cu.card.year ? ` ${fmt.yearTag(cu.card.year)}` : ''}</span>
              <span>{fitText(ue.fit, at)}</span>
              <span className="num">Lv {fmt.level(cu.card.level)}</span>
            </p>
            <p className={s.sum}>
              <span>기본 <b className="num">{Math.round(ue.base)}</b></span>
              <span>세트 <b className="num">+{ue.tc % 1 ? ue.tc.toFixed(1) : ue.tc}</b></span>
              <span>케미 <b className="num">+{ue.chem.toFixed(1)}</b></span>
              <span className={s.eq}>= <b className="num">{Math.round(ue.total)}</b></span>
            </p>
            {links.length > 0 && <p className={s.curLinks}>케미 선 · {links.join(' · ')}</p>}
            {ue.tcText.length > 0 && <p className={s.curLinks}>받는 세트 · {ue.tcText.join(' · ')}</p>}
          </div>
        </div>
      )}

      <p className={s.listHead}><span>바꿀 선수</span><span>넣으면 팀 종합</span></p>
      <ul className={s.list}>
        {list.map((c) => {
          const u = unit(c.id);
          const fx = effects(ev, c.ev);
          const boom = c.ev.exploded && !ev.exploded;
          return (
            <li key={c.id}>
              <button type="button" className={[s.cand, boom && s.candBoom, c.blocked && s.candOff].filter(Boolean).join(' ')}
                disabled={!!c.blocked} title={c.blocked ?? undefined}
                onClick={() => onApply(c.next, { slot: at, id: c.id })}>
                <span className={s.card}><CardMini player={u.player} grade={u.card.grade} enhance={u.card.enhance} year={u.card.year} width={44} /></span>
                <span className={s.who}>
                  <span className={s.nameRow}>
                    <b><NameYear name={u.player.name} year={u.card.year} /></b>
                    <span>{u.team.short}</span>
                    {c === best && !c.blocked && c.delta >= 0 && c.ev.raw > ev.raw && <em className={s.pick}>추천</em>}
                  </span>
                  <small className={s.meta}>
                    <span>{srcText(c)}</span>
                    <span className={c.fit === 'off' ? s.bad : c.fit === 'near' ? s.down : undefined}>{fitText(c.fit, at)}</span>
                    <span style={{ color: `var(--gr-${u.card.grade})` }}>{GRADES[u.card.grade].ko}</span>
                    {c.blocked && <span className={s.bad}>{c.blocked}</span>}
                  </small>
                  <Effects fx={fx} />
                </span>
                <Score cur={ev} nx={c.ev} slot={at} />
              </button>
            </li>
          );
        })}
        {!list.length && <li className={s.emptyList}>넣을 수 있는 선수가 없어요. 카드구매 · 스카우터에서 데려오면 보관함에 들어와 여기 후보로 나와요.</li>}
      </ul>
      {list.some((c) => c.ev.exploded && !ev.exploded) && (
        <p className={s.note}>왕조 — 엔트리 20명이 모두 한 구단·한 연도면 전원 능력치 폭발 (단계 가치 +{BOOM})</p>
      )}
    </Sheet>
  );
}

export interface BenchSheetProps {
  /** 벤치 카드 (null 이면 닫힘) */
  cardId: string | null;
  st: LineupState;
  ev: Eval;
  onClose: () => void;
  onApply: (next: LineupState, msg: { slot: Slot; id: string }) => void;
}

/** 벤치 카드 → 어느 자리에 넣을까 */
export function BenchSheet({ cardId, st, ev, onClose, onApply }: BenchSheetProps) {
  const [shown, setShown] = useState<string | null>(cardId);
  useEffect(() => { if (cardId) setShown(cardId); }, [cardId]);
  const id = cardId ?? shown;
  const rows = useMemo(() => (cardId ? placesFor(st, cardId, ev) : []), [cardId, st, ev]);
  if (!id) return null;
  const u = unit(id);
  return (
    <Sheet
      open={!!cardId}
      onClose={onClose}
      height="tall"
      title={`${u.player.name} 넣을 자리`}
      sub={`${u.team.name} · ${POS_KO[u.player.pos]} · 종합 ${u.player.ovr}`}
    >
      <p className={s.listHead}><span>자리</span><span>넣으면 팀 종합</span></p>
      <ul className={s.list}>
        {rows.map((r) => {
          const cur = r.cur ? unit(r.cur) : null;
          return (
            <li key={r.slot}>
              <button type="button" className={[s.cand, s.place, r.ev.exploded && !ev.exploded && s.candBoom, r.blocked && s.candOff].filter(Boolean).join(' ')}
                disabled={!!r.blocked} title={r.blocked ?? undefined}
                onClick={() => onApply(r.next, { slot: r.slot, id })}>
                <span className={s.slotBox}>
                  <b>{SLOT_KO[r.slot]}</b>
                  <small>{cur ? `지금 ${cur.player.name}` : '비어 있음'}</small>
                </span>
                <span className={s.who}>
                  <small className={s.meta}>
                    <span className={r.fit === 'off' ? s.bad : r.fit === 'near' ? s.down : undefined}>{fitText(r.fit, r.slot)}</span>
                    {cur && <span>{cur.player.name}{josa(cur.player.name, '은', '는')} 벤치로</span>}
                    {r.blocked && <span className={s.bad}>{r.blocked}</span>}
                  </small>
                  <Effects fx={effects(ev, r.ev)} />
                </span>
                <Score cur={ev} nx={r.ev} slot={r.slot} />
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
