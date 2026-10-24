// 팀 종합 게이지 + 세트덱 진행 (하나씩 맞아 갈 때의 손맛) — 라인업 화면과 같은 계산
import { useMemo } from 'react';
import { Gauge, Icon } from '../../ui';
import { Link } from '../../app/router';
import { ENTRY_SIZE, SET_KIND_KO, statLine } from '../../game/sets';
import { evaluate, initialLineup, store } from '../lineup/calc';
import s from './TeamPower.module.css';

export function TeamPower() {
  const ev = useMemo(() => evaluate(store.get() ?? initialLineup()), []);
  const lead = ev.active[0];
  const near = ev.sets.filter((x) => x.next).slice(0, 3);
  return (
    <section className={s.power} aria-labelledby="power-h">
      <header className={s.head}>
        <h2 id="power-h" className={s.h}>팀 종합</h2>
        <Link to="/lineup" className={s.link}>라인업에서 맞추기 <Icon name="chevron" size={14} /></Link>
      </header>
      <Gauge value={ev.overall} base={ev.base} potential={ev.exploded ? undefined : ev.potential}
        potentialLabel={<>왕조 시 <b className="num">{ev.potential}</b></>} parts={ev.parts.map((p) => ({ ko: p.ko, v: p.v }))} label="지금" />
      <div className={s.boom}>
        <p className={s.boomHead}>
          <Icon name="bolt" size={16} />
          <b>{lead ? `세트 ${lead.name} +${lead.cur!.v} 단계` : '아직 켜진 세트덱이 없어요'}</b>
          <span>{lead ? `${SET_KIND_KO[lead.kind]} · ${lead.cur!.trait}` : '같은 구단·연도 5명부터'}</span>
        </p>
        <p className={s.hint}>
          {lead ? <>타자 {statLine(lead.cur!.bat, 3)} · 투수 {statLine(lead.cur!.pit, 2)}</> : <>엔트리에서 같은 구단·같은 연도 카드를 {ENTRY_SIZE}명까지 모을수록 그 선수들의 능력치가 올라요.</>}
          {' '}<Link to="/sets" className={s.link}>세트덱 보기</Link>
        </p>
      </div>
      <ul className={s.sets} aria-label="세트덱 진행">
        {near.map((t) => (
          <li key={t.id}>
            <span className={s.setName}>{t.name}<small> · {SET_KIND_KO[t.kind]}</small></span>
            <span className={[s.pips, t.active && s.lead].filter(Boolean).join(' ')} aria-hidden>
              {Array.from({ length: Math.min(t.next!.at, 14) }, (_, i) => <i key={i} className={i < t.have ? s.on : undefined} />)}
            </span>
            <span className={s.count}><b className="num">{t.have}</b><span className="num">/{t.next!.at}</span></span>
            <span className={s.bonus}>{t.cur ? `지금 +${t.cur.v} · ` : ''}{t.next!.at - t.have}명 더 → +{t.next!.v} ({t.next!.trait})</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
