// 2단계 — 클럽 창단: 고른 구단에서 선수 3명 지명 (풋볼데이 창단처럼). 지명한 선수는 '27 레어 카드로 온다.
import { useMemo, useState } from 'react';
import { Button, Icon, Tabs, useToast } from '../../ui';
import { Card } from '../../cards';
import { PlayerArt } from '../../art/PlayerArt';
import { teamById } from '../../game/mock';
import { shortLabel } from '../../game/world';
import { POS_KO, ROLE_KO, handKo } from '../../game/labels';
import type { Player } from '../../game/types';
import { draftGradeOf, draftPool, draftYearOf } from './local-mock';
import type { StepProps } from './index';
import s from './cs.module.css';
import d from './StepDraft.module.css';

type Filter = 'all' | 'P' | 'B';

export function StepDraft({ st, set, go, Dock }: StepProps) {
  const t = teamById(st.club);
  const pool = useMemo(() => draftPool(t.id), [t.id]);
  const [filter, setFilter] = useState<Filter>('all');
  const toast = useToast();
  const picked = st.picks.map((id) => pool.find((p) => p.id === id)).filter(Boolean) as Player[];
  const list = pool.filter((p) => filter === 'all' || (filter === 'P' ? p.pos === 'P' : p.pos !== 'P'));

  const toggle = (p: Player) => {
    if (st.picks.includes(p.id)) { set({ picks: st.picks.filter((x) => x !== p.id) }); return; }
    if (st.picks.length >= 3) { toast({ text: '세 명까지예요', tone: 'bad' }); return; }
    set({ picks: [...st.picks, p.id] });
  };

  return (
    <>
      <header className={s.head}>
        <p className={s.kicker}>{t.old ? '부활 구단 창단' : '클럽 창단'} · {t.name}</p>
        <h1 className={s.title}>{shortLabel(t.code)}에서 세 명을 데려와요</h1>
      </header>

      <div className={d.slots} aria-label="지명한 선수">
        {[0, 1, 2].map((i) => {
          const p = picked[i];
          return (
            <div key={i} className={d.slot}>
              {p ? (
                <button type="button" className={d.slotCard} onClick={() => toggle(p)} aria-label={`${p.name} 지명 취소`}>
                  <Card player={p} team={t} grade={draftGradeOf(p)} year={draftYearOf(p, i)} level={1} width={98} showStats={false} />
                </button>
              ) : (
                <span className={d.empty}><span className="num-display">{i + 1}</span><small>지명</small></span>
              )}
            </div>
          );
        })}
      </div>

      <div className={d.bar}>
        <Tabs
          variant="underline"
          size="s"
          aria-label="후보 나누기"
          value={filter}
          onChange={setFilter}
          items={[
            { value: 'all', label: '전체', count: pool.length },
            { value: 'P', label: '투수', count: pool.filter((p) => p.pos === 'P').length },
            { value: 'B', label: '야수', count: pool.filter((p) => p.pos !== 'P').length },
          ]}
        />
      </div>

      <ul className={d.list}>
        {list.map((p) => {
          const n = st.picks.indexOf(p.id);
          const on = n >= 0;
          return (
            <li key={p.id}>
              <button type="button" className={[d.row, on && d.on].filter(Boolean).join(' ')} onClick={() => toggle(p)} aria-pressed={on}>
                <span className={d.face}><PlayerArt player={p} team={t} variant="mini" /></span>
                <span className={d.who}>
                  <b>{p.name}</b>
                  <small>
                    {(t.old || p.real) && <><span className="num">{p.real ? p.real.year : draftYearOf(p, 0) + (draftYearOf(p, 0) > 27 ? 1900 : 2000)}</span> 시즌 · </>}
                    {p.pos === 'P' ? (p.role ? ROLE_KO[p.role] : '투수') : POS_KO[p.pos]} · {handKo(p.throws, p.bats)} · <span className="num">{p.age}</span>세
                  </small>
                  <span className={d.stats}>
                    {p.face.slice(0, 4).map((f) => <span key={f.code}><i>{f.ko}</i><b className="num">{f.v}</b></span>)}
                  </span>
                </span>
                <span className={d.ovr}>
                  <b className="num-display">{p.ovr}</b>
                  <small>종합</small>
                </span>
                <span className={d.mark} aria-hidden>{on ? <span className="num">{n + 1}</span> : <Icon name="plus" size={16} />}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <Dock note={<span><b>지명 <span className="num">{st.picks.length}</span>/3</b>{picked.length > 0 && <small>{picked.map((p) => p.name).join(' · ')}</small>}</span>}>
        <Button size="l" disabled={st.picks.length < 3} onClick={() => go('special')} trailing={<Icon name="arrow-right" size={18} />}>다음</Button>
      </Dock>
    </>
  );
}
