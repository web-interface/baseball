// 세트덱 진행 — 1군 엔트리 20명 기준. 켜진 세트(최대 2)는 주인공 줄로, 그다음 가까운 세트는 헤어라인 줄로.
// 단계 4개(5·9·14·전원)를 베이스 1루·2루·3루·홈에 빗대어: 전원이면 홈 = 왕조(능력치 폭발).
import type { CSSProperties } from 'react';
import { Emblem, Icon } from '../../ui';
import { navigate } from '../../app/router';
import { teamByCode } from '../../game/mock';
import { ENTRY_SIZE, SET_KIND_KO, TIERS, statLine, type SetProgress } from '../../game/sets';
import type { BatSlot, Eval } from './calc';
import s from './TeamColor.module.css';

const teamOf = (sp: SetProgress) => (sp.code ? teamByCode(sp.code) : undefined);
const goal = (sp: SetProgress) => sp.next?.at ?? ENTRY_SIZE;

/** 칸 막대 — 칸 수 = 엔트리 20, 단계 문턱에 눈금 */
function Segments({ have, need, ticks, tone }: { have: number; need: number; ticks: number[]; tone?: string }) {
  return (
    <span className={s.seg} style={tone ? ({ ['--tc' as string]: tone } as CSSProperties) : undefined} aria-hidden>
      {Array.from({ length: need }, (_, i) => (
        <i key={i} className={[i < have && s.fill, ticks.includes(i) && s.tick].filter(Boolean).join(' ')} style={{ ['--k' as string]: i } as CSSProperties} />
      ))}
    </span>
  );
}

/** 베이스 넷 — 켜진 단계만큼 1루 → 2루 → 3루 → 홈 */
export function Bases({ lit, size = 34 }: { lit: number; size?: number }) {
  const pts: [number, number][] = [[27, 17], [17, 7], [7, 17]];
  return (
    <svg className={s.bases} width={size} height={size} viewBox="0 0 34 34" aria-hidden>
      <path d="M17 7 27 17 17 27 7 17Z" className={s.dLine} />
      {pts.map(([x, y], i) => (
        <rect key={i} x={x - 3.6} y={y - 3.6} width="7.2" height="7.2" transform={`rotate(45 ${x} ${y})`} className={i < lit ? s.on : s.off} />
      ))}
      <path d="M13.4 25.2h7.2v3.4l-3.6 3.2-3.6-3.2z" className={lit >= 4 ? [s.on, s.home].join(' ') : s.off} />
    </svg>
  );
}

/** 효과 두 줄 (타자 · 투수) + 상황 효과 */
function EffectLines({ sp, eff }: { sp: SetProgress; eff: NonNullable<SetProgress['cur']> }) {
  return (
    <span className={s.eff}>
      <span><i>타자</i>{statLine(eff.bat, 4)}</span>
      <span><i>투수</i>{statLine(eff.pit, 4)}</span>
      {eff.special && <span className={s.sp}><i>특수</i>{eff.special.side === 'bat' ? '타자' : '투수'} · {eff.special.text}</span>}
      {sp.dynasty && <span className={s.sp}><i>왕조</i>엔트리 전원 능력치 폭발</span>}
    </span>
  );
}

function Hero({ sp }: { sp: SetProgress }) {
  const t = teamOf(sp);
  const tone = t?.colors.primary;
  const tiers = TIERS[sp.kind];
  const more = sp.next ? sp.next.at - sp.have : 0;
  return (
    <div className={[s.hero, sp.dynasty && s.done].filter(Boolean).join(' ')} style={tone ? ({ ['--tc' as string]: tone } as CSSProperties) : undefined}>
      {t ? <Emblem team={t} size={34} className={s.emb} /> : <span className={['num-display', s.yearMark].join(' ')}>{sp.name.replace(' 시즌', '')}</span>}
      <div className={s.heroMain}>
        <p className={s.heroTop}>
          <b className={s.heroName}>{sp.name}</b>
          <span className={s.kind}>{SET_KIND_KO[sp.kind]} 세트{sp.cur ? ` · ${sp.cur.trait}` : ''}</span>
        </p>
        <div className={s.track}>
          <Segments have={sp.have} need={ENTRY_SIZE} ticks={tiers.map((x) => x.at - 1).filter((x) => x < ENTRY_SIZE - 1)} tone={tone} />
          <span className={s.scale} aria-hidden>
            {tiers.map((x, i) => (
              <i key={x.at} className={['num', i <= sp.tier && s.reached].filter(Boolean).join(' ')} style={{ left: `${(x.at / ENTRY_SIZE) * 100}%` }}>
                {x.at >= ENTRY_SIZE ? (sp.kind === 'teamYear' ? '왕조' : '전원') : `+${x.v}`}
              </i>
            ))}
          </span>
        </div>
        {sp.cur && <EffectLines sp={sp} eff={sp.cur} />}
        {sp.next && <p className={s.note}><span className={s.lead}>{more}명 더</span><span>모으면 +{sp.next.v} 단계 — {statLine(sp.next.bat, 2)} · {statLine(sp.next.pit, 2)}</span></p>}
      </div>
      <div className={s.count}>
        <span><b className="num-display">{sp.have}</b><i className="num">/{goal(sp)}</i></span>
        <Bases lit={sp.tier + 1} />
      </div>
    </div>
  );
}

export interface TeamColorProps {
  ev: Eval;
  /** (예전) 폭발까지 남은 자리 고르기 — 지금은 세트덱 페이지로 */
  onHint?: (slot: BatSlot) => void;
}

export function TeamColorPanel({ ev }: TeamColorProps) {
  const active = ev.active;
  const rest = ev.sets.filter((x) => !x.active && x.next).slice(0, active.length ? 3 : 4);
  return (
    <section className={s.panel} aria-label="세트덱">
      <header className={s.head}>
        <h3 className={s.h}>세트덱 <small>엔트리 <span className="num">{ev.entry}</span>/<span className="num">{ENTRY_SIZE}</span> · 켜진 세트 <span className="num">{active.length}</span>/2</small></h3>
        <button type="button" className={s.more} onClick={() => navigate('/sets')}>효과 표 <Icon name="chevron" size={14} /></button>
      </header>
      {active.map((sp) => <Hero key={sp.id} sp={sp} />)}
      {!active.length && (
        <p className={s.empty}>아직 켜진 세트가 없어요. 같은 구단·같은 연도 카드를 엔트리에 <b className="num">5</b>명 모으면 첫 단계가 켜져요.</p>
      )}
      <ul className={s.rows}>
        {rest.map((sp) => {
          const t = teamOf(sp);
          const need = sp.next!.at;
          return (
            <li key={sp.id} className={s.row} style={t ? ({ ['--tc' as string]: t.colors.primary } as CSSProperties) : undefined}>
              <span className={s.rowKind}>{SET_KIND_KO[sp.kind]}</span>
              <span className={s.rowLabel}>{sp.name}<small> · {sp.next!.trait}</small></span>
              <span className={['num', s.rowN].join(' ')}>{sp.have}<i>/{need}</i></span>
              <Segments have={sp.have} need={need} ticks={[]} />
              <span className={s.rowBonus}>
                {sp.cur ? <b>+{sp.cur.v} 단계</b> : <span className={s.none}>아직 없음</span>}
                <small>{need - sp.have}명 더 → +{sp.next!.v} · 타자 {statLine(sp.next!.bat, 2)} · 투수 {statLine(sp.next!.pit, 2)}</small>
              </span>
            </li>
          );
        })}
      </ul>
      <p className={s.rule}>세트는 동시에 2개까지(센 것부터) 켜지고, 한 선수는 받는 세트 중 가장 센 것 하나만 받아요.</p>
    </section>
  );
}
