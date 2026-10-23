// 선수 상세 머리 — 큰 카드(얼굴 초상) + 이름·구단·투타·체격 + 컨디션 + 레벨·강화·잠재력 세 칸
import { useSyncExternalStore, type CSSProperties } from 'react';
import { Card, CardMini, cardProps } from '../../cards';
import { Emblem, fmt } from '../../ui';
import { GRADES } from '../../game/grades';
import { POS_KO, ROLE_KO, handKo } from '../../game/labels';
import type { CardInst, Player, Team } from '../../game/types';
import { initialLineup, store as lineupStore } from '../lineup/calc';
import { CondArrow } from './icons';
import { Pips } from './common';
import { chanceAfter, enhTable } from './local-mock';
import { TIER_KO, potVersion, potentialsOf, shownPickOf, subscribePot } from '../../game/potential';
import s from './hero.module.css';

const COND_KO = { 5: '최상', 4: '좋음', 3: '보통', 2: '나쁨', 1: '최악' } as const;

export interface HeroProps {
  p: Player;
  team: Team;
  card: CardInst;
  cards: CardInst[];
  owned: boolean;
  isMineCard: (id: string) => boolean;
  enh: number;
  fails: number;
  level: number;
  onPickCard: (id: string) => void;
  onKpi: (k: 'level' | 'enhance' | 'potential') => void;
}

/** 잠재력 최대 추정 — 나이가 어릴수록 별이 많을수록 남은 성장이 크다 */
export function potentialMax(p: Player) {
  const room = p.potential * 2.2 * Math.max(0.15, Math.min(1, (31 - p.age) / 8));
  return Math.min(99, Math.max(p.ovr, Math.round(p.ovr + room)));
}

export function Hero({ p, team, card, cards, owned, isMineCard, enh, fails, level, onPickCard, onKpi }: HeroProps) {
  const g = GRADES[card.grade];
  // 지금 라인업(저장된 것)에서 이 카드 자리
  const lu = lineupStore.get() ?? initialLineup();
  const fieldPos = (Object.keys(lu.field) as (keyof typeof lu.field)[]).find((k) => lu.field[k] === card.id);
  const order = fieldPos ? lu.order.indexOf(fieldPos) + 1 || undefined : undefined;
  const role = p.pos === 'P' ? (p.role ? ROLE_KO[p.role] : '투수') : null;
  const isSp = lu.rotation[0] === card.id;
  const posLine = p.pos === 'P'
    ? [`${role} 투수`, isSp ? '오늘 선발' : lu.closer === card.id ? '마무리' : null].filter(Boolean).join(' · ')
    : [POS_KO[p.pos], p.subPos?.length ? `${p.subPos.map((x) => POS_KO[x]).join('·')} 가능` : null, order ? `${order}번 타자` : null].filter(Boolean).join(' · ');
  const lv = fmt.levelParts(level);
  const lvMax = g.levelMax;
  const atMax = lv.lv >= lvMax;
  const table = enhTable(card.grade);
  const next = table[enh];
  const nextChance = next ? chanceAfter(next.base, fails) : null;
  useSyncExternalStore(subscribePot, potVersion);
  const potK = shownPickOf(card.id);
  const pot = potK >= 0 ? potentialsOf(p, card.grade)[potK] : null;
  const vars = { '--team': team.colors.primary, '--team-2': team.colors.secondary, '--gr': `var(--gr-${card.grade})` } as CSSProperties;

  return (
    <div className={s.top} style={vars}>
      <span className={['num-display', s.bigNo].join(' ')} aria-hidden>{p.number}</span>
      <div className={s.hero}>
        <div className={s.cardWrap}>
          <Card {...cardProps(card)} enhance={enh} level={level} width={148} />
        </div>
        <div className={s.ident}>
          <p className={s.eyebrow}>{posLine}</p>
          <h2 className={['head', s.name].join(' ')}>{p.name}</h2>
          <p className={s.teamLine}>
            <Emblem team={team} size={18} />
            <span>{team.name}</span>
            <span className={s.dot} aria-hidden />
            <span className="num">No.{p.number}</span>
          </p>
          <p className={s.bio}>
            {handKo(p.throws, p.bats)} · <span className="num">{p.age}</span>세 · <span className="num">{p.heightCm}</span>cm <span className="num">{p.weightKg}</span>kg
          </p>
          <p className={s.grade}>
            <i className={s.grMark} aria-hidden />
            <b>{g.ko}</b>
            {card.year != null && g.yearTagged && <span className="num">{fmt.yearTag(card.year)}</span>}
            {card.award && <span>· {card.award}</span>}
          </p>
          <div className={s.state}>
            <span className={[s.cond, s['c' + p.condition]].join(' ')} title={`컨디션 ${COND_KO[p.condition]}`}>
              <CondArrow v={p.condition} size={15} />
              <span>컨디션 <b>{COND_KO[p.condition]}</b></span>
            </span>
            <span className={s.fat} title={`피로 ${p.fatigue}`}>
              <span>피로</span>
              <span className={s.fatBar} aria-hidden><i style={{ width: `${p.fatigue}%` }} className={p.fatigue >= 45 ? s.fatHi : undefined} /></span>
              <b className="num">{p.fatigue}</b>
            </span>
          </div>
          {p.injury && <p className={s.inj}>부상 · {p.injury}</p>}
        </div>
      </div>

      <div className={s.kpis} role="list">
        <button type="button" role="listitem" className={s.kpi} onClick={() => onKpi('level')}>
          <span className={s.kLabel}>레벨</span>
          <b className={['num-display', s.kVal].join(' ')} style={{ color: fmt.levelColor(level) }}>{fmt.level(level)}</b>
          <span className={s.lvBar} aria-hidden><i style={{ width: atMax ? '100%' : `${lv.progress}%` }} /></span>
          <span className={s.kSub}>{atMax ? <>최대 레벨 <span className="num">{lvMax}</span></> : <>Lv <span className="num">{lv.lv + 1}</span>까지 <span className="num">{100 - lv.progress}%</span></>}</span>
        </button>
        <button type="button" role="listitem" className={s.kpi} onClick={() => onKpi('enhance')}>
          <span className={s.kLabel}>강화</span>
          <b className={['num-display', s.kVal, s.roman].join(' ')}>{enh > 0 ? fmt.roman(enh) : '—'}</b>
          <Pips n={enh} of={10} className={s.enhPips} label={`강화 10단계 중 ${enh}단계`} />
          <span className={s.kSub}>
            {next ? <>{fmt.roman(next.stage)} <span className="num">{nextChance}%</span>{fails > 0 && <em> 보정 +{fails * 15}%p</em>}</> : '완성 · X'}
          </span>
        </button>
        <button type="button" role="listitem" className={s.kpi} onClick={() => onKpi('potential')}>
          <span className={s.kLabel}>잠재력</span>
          {pot
            ? <b className={[s.kVal, s.potVal, s['pot' + pot.tier]].join(' ')}>{TIER_KO[pot.tier]}</b>
            : <b className={[s.kVal, s.potVal, s.potNone].join(' ')}>{owned ? '미개방' : '—'}</b>}
          <span className={[s.kSub, s.potName].join(' ')}>{pot ? pot.name : owned ? '눌러서 열기' : '후보 보기'}</span>
        </button>
      </div>

      {cards.length > 1 && (
        <div className={s.switcher}>
          <p className={s.swLabel}>이 선수 카드 <span className="num">{cards.length}</span>장 — 강화·장비는 카드마다 따로</p>
          <div className={s.swList}>
            {cards.map((c) => {
              const gi = GRADES[c.grade];
              const on = c.id === card.id;
              const mineC = isMineCard(c.id);
              return (
                <button key={c.id} type="button" className={[s.sw, on && s.swOn, !mineC && s.swOff].filter(Boolean).join(' ')} onClick={() => onPickCard(c.id)} aria-pressed={on}>
                  <CardMini {...cardProps(c)} width={52} selected={on} dimmed={!mineC} />
                  <span className={s.swText}>
                    <b style={{ color: `var(--gr-${c.grade})` }}>{gi.short}</b>
                    {c.year != null && gi.yearTagged && <span className="num">{fmt.yearTag(c.year)}</span>}
                    {c.dup > 0 && <span className={['num', s.dup].join(' ')}>+{c.dup}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
