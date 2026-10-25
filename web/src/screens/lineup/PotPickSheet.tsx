// 별 셋 잠재력 고르기 — 1군 엔트리(타자 9 · 선발 5 · 불펜 10 · 마무리)에 별 셋이 3명 이상이면 켤 2명을 고른다. 사용자 지시 10-25
//  줄마다: 별 메달 · 별명(크게) · 선수 · 자리 · 효과 · 켜면 오르는 팀 종합(라인업 evaluate 와 같은 셈 — game/potential sPlan).
//  눌러서 2명을 담고 '이대로 켜기' — 둘이 찬 채로 새로 누르면 먼저 담은 쪽이 빠진다. 고른 값은 'bb.pot' sOn (setSChosen).
//  '자동으로' = 고른 것을 지우고 팀 종합이 많이 오르는 2명. 꺼진 별 셋은 자기 · 팀 효과 모두 없다.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Button, Sheet, useToast } from '../../ui';
import { PotBadge } from '../../ui/PotBadge';
import { GRADES } from '../../game/grades';
import { S_MAX, fxText, potVersion, sPlan, setSChosen, subscribePot } from '../../game/potential';
import { SLOT_KO, potEntryOf, slotOf, type LineupState } from './calc';
import s from './PotPickSheet.module.css';

const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');
const plus = (v: number) => `+${(Math.round(v * 10) / 10).toFixed(1)}`;

export function PotPickSheet({ open, onClose, st }: { open: boolean; onClose: () => void; st: LineupState }) {
  const toast = useToast();
  const potV = useSyncExternalStore(subscribePot, potVersion);
  const entry = useMemo(() => (open ? potEntryOf(st) : []), [open, st]);
  const plan = useMemo(() => sPlan(entry), [entry, potV]); // eslint-disable-line react-hooks/exhaustive-deps
  const [draft, setDraft] = useState<string[]>([]);
  // 열 때마다 지금 켜진 2명에서 시작
  useEffect(() => { if (open) setDraft(plan.rows.filter((r) => r.on).map((r) => r.card.id)); }, [open, entry]); // eslint-disable-line react-hooks/exhaustive-deps
  const nBat = entry.filter((u) => u.player.pos !== 'P').length;
  const nPit = entry.length - nBat;
  const toggle = (id: string) => setDraft((d) => (d.includes(id) ? d.filter((x) => x !== id) : d.length < S_MAX ? [...d, id] : [...d.slice(1), id]));
  const picked = plan.rows.filter((r) => draft.includes(r.card.id));
  const gain = picked.reduce((a, r) => a + r.ovr, 0);
  const full = draft.length === S_MAX;

  const apply = () => {
    setSChosen(draft);
    onClose();
    toast({ text: <><PotBadge tier="S" size="s" /> <b>{picked.map((r) => r.pot.name).join(' · ')}</b> 켰어요</>, tone: 'good' });
  };
  const auto = () => {
    setSChosen(null);
    onClose();
    toast({ text: '팀 종합이 많이 오르는 2명으로 켰어요', tone: 'info' });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="켤 잠재력 고르기"
      sub={<span className={s.sub}><PotBadge tier="S" size="xs" /><span>잠재력은 1군 엔트리에서 <b className="num">{S_MAX}</b>명만 켜져요</span></span>}
      footer={(
        <>
          <Button variant="secondary" className={s.autoBtn} onClick={auto}>자동으로</Button>
          <Button onClick={apply} disabled={!full} trailing={<span className="num">{draft.length}/{S_MAX}</span>}>이대로 켜기</Button>
        </>
      )}
    >
      <p className={s.lead}>
        <span>
          {full
            ? <>고른 두 명으로 팀 종합 <b className="num">{plus(gain)}</b></>
            : <>켤 선수를 <b className="num">{S_MAX - draft.length}</b>명 더 골라요</>}
        </span>
        {plan.auto && <small>지금은 자동으로 켜져 있어요</small>}
      </p>
      <ul className={s.list}>
        {plan.rows.map((r) => {
          const on = draft.includes(r.card.id);
          const slot = slotOf(st, r.card.id);
          const team = r.pot.fx.some((x) => x.scope === 'teamPit') ? nPit : r.pot.fx.some((x) => x.scope === 'teamBat') ? nBat : 0;
          return (
            <li key={r.card.id}>
              <button type="button" className={cx(s.row, on && s.on)} onClick={() => toggle(r.card.id)} aria-pressed={on}>
                <PotBadge tier="S" size="l" off={!on} />
                <span className={s.text}>
                  <b className={s.nick}>{r.pot.name}</b>
                  <span className={s.meta}>{r.player.name}{slot && <> · {SLOT_KO[slot]}</>} · {GRADES[r.card.grade].ko}</span>
                  <span className={s.fx}>{fxText(r.pot.fx)}</span>
                </span>
                <span className={s.gain}>
                  <small>팀 종합</small>
                  <b className="num">{plus(r.ovr)}</b>
                  {team > 0 && <i>함께 <span className="num">{team}</span>명</i>}
                </span>
                <span className={s.check} aria-hidden>
                  <svg viewBox="0 0 20 20"><path d="M5 10.4l3.2 3.1L15 6.6" /></svg>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className={s.note}>꺼진 선수는 자기 효과도, 팀에 주는 효과도 없어요. 벤치에 두면 늘 꺼져요.</p>
    </Sheet>
  );
}
