// 팀컬러 진행 — 구단(주인공 줄) + 권역 · 시즌 · 더비.
// 구단 단계 3·5·7·9명을 베이스 1루·2루·3루·홈에 빗대어: 7명이면 만루, 9명이면 그랜드슬램 = 능력치 폭발.
import type { CSSProperties } from 'react';
import { Emblem, Icon } from '../../ui';
import { BOOM, SLOT_KO, type BatSlot, type Eval, type TcSet } from './calc';
import s from './TeamColor.module.css';

const RUNNERS = ['', '1루', '1·2루', '만루', '그랜드슬램'];

function clubNote(set: TcSet) {
  const lit = set.idx + 1;
  if (set.have >= set.need) return { lead: '그랜드슬램', text: `1군 전원 전 능력치 +${BOOM}` };
  const n = set.next!;
  const more = n.at - set.have;
  const goal = n.at >= 9 ? '능력치 폭발' : n.text;
  return { lead: lit ? RUNNERS[lit] : '', text: `${more}명 더 모으면 ${goal}` };
}

/** 칸 막대 — 칸 수 = 목표 인원, 단계 문턱에 눈금 */
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

export interface TeamColorProps {
  ev: Eval;
  /** 폭발까지 남은 자리 고르기 */
  onHint: (slot: BatSlot) => void;
}

export function TeamColorPanel({ ev, onHint }: TeamColorProps) {
  const [club, ...rest] = ev.sets;
  const note = clubNote(club);
  const tone = club.team?.colors.primary;
  const missing = ev.missing.slice(0, 3);
  return (
    <section className={s.panel} aria-label="팀컬러">
      <div className={[s.hero, ev.exploded && s.done].filter(Boolean).join(' ')} style={{ ['--tc' as string]: tone } as CSSProperties}>
        {club.team && <Emblem team={club.team} size={34} className={s.emb} />}
        <div className={s.heroMain}>
          <p className={s.heroTop}>
            <b className={s.heroName}>{club.label}</b>
            <span className={s.kind}>구단 팀컬러</span>
          </p>
          <div className={s.track}>
            <Segments have={club.have} need={club.need} ticks={[2, 4, 6]} tone={tone} />
            <span className={s.scale} aria-hidden>
              {club.steps.map((st, i) => (
                <i key={st.at} className={['num', i <= club.idx && s.reached].filter(Boolean).join(' ')} style={{ left: `${(st.at / club.need) * 100}%` }}>
                  {st.at >= 9 ? '폭발' : `+${st.v}`}
                </i>
              ))}
            </span>
          </div>
          <p className={s.note}>
            {club.current ? <b className={s.cur}>{ev.exploded ? `전 능력치 +${BOOM}` : club.current.text}</b> : <b className={s.cur}>{club.steps[0].at}명부터 {club.steps[0].text}</b>}
            {note.lead && <span className={s.lead}>{note.lead}</span>}
            {!ev.exploded && club.current && <span>{note.text}</span>}
            {ev.exploded && <span>{note.text}</span>}
          </p>
        </div>
        <div className={s.count}>
          <span><b className="num-display">{club.have}</b><i className="num">/{club.need}</i></span>
          <Bases lit={club.idx + 1} />
        </div>
      </div>

      {!ev.exploded && ev.remain <= 3 && missing.length > 0 && (
        <button type="button" className={s.hint} onClick={() => onHint(missing[0])}>
          <span className={s.hintN}>폭발까지 <b className="num">{ev.remain}</b>명</span>
          <span className={s.hintT}>{missing.map((m) => SLOT_KO[m]).join(' · ')} 자리를 {club.team?.short ?? ''}로</span>
          <Icon name="chevron" size={16} className={s.hintIco} />
        </button>
      )}

      <ul className={s.rows}>
        {rest.map((set) => (
          <li key={set.id} className={s.row} style={set.team ? ({ ['--tc' as string]: set.team.colors.primary } as CSSProperties) : undefined}>
            <span className={s.rowKind}>{set.kindKo}</span>
            <span className={s.rowLabel}>{set.label}</span>
            <span className={['num', s.rowN].join(' ')}>{set.have}<i>/{set.need}</i></span>
            <Segments have={set.have} need={set.need} ticks={set.steps.map((x) => x.at - 1).filter((x) => x < set.need - 1)} />
            <span className={s.rowBonus}>
              {set.current ? <b>{set.current.text}</b> : <span className={s.none}>아직 없음</span>}
              {set.next && <small>{set.next.at - set.have}명 더 → {set.next.text}</small>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
