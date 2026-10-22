// 팀 종합 게이지 + 팀컬러 진행 (하나씩 맞아 갈 때의 손맛)
import { Gauge, Icon } from '../../ui';
import { Link } from '../../app/router';
import { LINEUP_EVAL } from '../../game/mock';
import s from './TeamPower.module.css';

export function TeamPower() {
  const ev = LINEUP_EVAL;
  const sets = ev.teamColors.filter((t) => t.kind !== 'rival').slice(0, 3);
  return (
    <section className={s.power} aria-labelledby="power-h">
      <header className={s.head}>
        <h2 id="power-h" className={s.h}>팀 종합</h2>
        <Link to="/lineup" className={s.link}>라인업에서 맞추기 <Icon name="chevron" size={14} /></Link>
      </header>
      <Gauge value={ev.overall} base={ev.base} potential={ev.potential} parts={ev.parts.map((p) => ({ ko: p.ko, v: p.v }))} label="지금" />
      <div className={s.boom}>
        <p className={s.boomHead}>
          <Icon name="bolt" size={16} />
          <b>{ev.explosion.label}</b>
          <span>{ev.explosion.bonus}</span>
        </p>
        <p className={s.hint}>{ev.explosion.hint}</p>
      </div>
      <ul className={s.sets} aria-label="팀컬러">
        {sets.map((t) => (
          <li key={t.id}>
            <span className={s.setName}>{t.label}</span>
            <span className={[s.pips, t.kind === 'club' && s.lead].filter(Boolean).join(' ')} aria-hidden>
              {Array.from({ length: t.need }, (_, i) => <i key={i} className={i < t.have ? s.on : undefined} />)}
            </span>
            <span className={s.count}><b className="num">{t.have}</b><span className="num">/{t.need}</span></span>
            <span className={s.bonus}>{t.current ?? '—'}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
