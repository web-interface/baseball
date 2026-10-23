// 라인업 판 — 위에서 본 경기장(카드가 들어가게 내야를 키운 판, 아트 디렉션 8-2) + 케미 선 + 카드 11장.
// 공용 Field 는 실제 비율(경기 화면용)이라 카드 11장이 겹친다. 그래서 판은 여기서 그리되 색은 --field-* 토큰만 쓴다.
// 구장 특색(담장 거리 · 높은 담장)은 내 구단 홈구장 값으로 그린다.
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import type { Team } from '../../game/types';
import { CardMini, cardProps } from '../../cards';
import { Emblem, Icon } from '../../ui';
import {
  BOOM, FIELD_LINKS, LEVEL_KO, SLOT_KO, boardToSlot, cardOvr, unit,
  type BoardSlot, type Eval, type Level, type LineupState, type Slot,
} from './calc';
import s from './Board.module.css';

export const BW = 390;
export const BH = 496;
/** 카드 중심 (판 좌표 390×480) */
export const SPOT: Record<BoardSlot, { x: number; y: number }> = {
  CF: { x: 195, y: 70 }, LF: { x: 74, y: 128 }, RF: { x: 316, y: 128 },
  SS: { x: 128, y: 230 }, '2B': { x: 262, y: 230 },
  P: { x: 195, y: 306 }, '3B': { x: 62, y: 318 }, '1B': { x: 328, y: 318 },
  C: { x: 195, y: 430 }, DH: { x: 56, y: 434 },
};
/** 카드 크기 (판 좌표) — 이름표를 둘 만큼 선이 보이는지 판단할 때 */
const CW = 60;
const CH = 84;
/** 두 카드 사이 선이 카드 밖으로 보이는 길이 */
function visibleLen(a: BoardSlot, b: BoardSlot) {
  const dx = Math.abs(SPOT[a].x - SPOT[b].x);
  const dy = Math.abs(SPOT[a].y - SPOT[b].y);
  const len = Math.hypot(dx, dy);
  // 카드 상자 밖으로 나가는 지점까지 (중심에서 반 너비·반 높이 상자)
  const t = Math.min(dx ? (CW / 2) / dx : Infinity, dy ? (CH / 2) / dy : Infinity);
  return len * Math.max(0, 1 - 2 * t);
}
const BOARD_SLOTS: BoardSlot[] = ['CF', 'LF', 'RF', 'SS', '2B', 'P', '3B', '1B', 'C', 'DH'];
/** 투수에서 몇 칸 (폭발 연출 순서) */
const HOP: Record<BoardSlot, number> = { P: 0, C: 1, SS: 1, '2B': 1, '3B': 2, '1B': 2, LF: 2, CF: 2, RF: 2, DH: 2 };

/* 경기장 모양 */
const POLE = 187;
const HOME = { x: 195, y: 382 };
const B1 = { x: 292.5, y: 284.5 };
const B2 = { x: 195, y: 187 };
const B3 = { x: 97.5, y: 284.5 };
const MOUND = { x: 195, y: 290 };
const ARC = { cx: 195, cy: 210.4, r: 196.4 };
const TH_L = Math.atan2(POLE - ARC.cy, 0 - ARC.cx);
const TH_R = Math.atan2(POLE - ARC.cy, 390 - ARC.cx);
const f1 = (n: number) => n.toFixed(1);
const arcPt = (r: number, a: number) => `${f1(ARC.cx + r * Math.cos(a))} ${f1(ARC.cy + r * Math.sin(a))}`;
const arc = (r: number, a0: number, a1: number) => `M${arcPt(r, a0)}A${f1(r)} ${f1(r)} 0 0 1 ${arcPt(r, a1)}`;
const FAIR = `M${HOME.x} ${HOME.y}L0 ${POLE}A${ARC.r} ${ARC.r} 0 0 1 390 ${POLE}Z`;
const GROUND = `M0 ${POLE}A${ARC.r} ${ARC.r} 0 0 1 390 ${POLE}L390 ${BH}L0 ${BH}Z`;
const FENCE = `M0 ${POLE}A${ARC.r} ${ARC.r} 0 0 1 390 ${POLE}`;
const skin = (p: { x: number; y: number }) => `${f1(HOME.x + (p.x - HOME.x) * 0.84)} ${f1(HOME.y + (p.y - HOME.y) * 0.84 - 3)}`;
const INFIELD = `M${skin(HOME)}L${skin(B1)}L${skin(B2)}L${skin(B3)}Z`;
const DIAMOND = `M${HOME.x} ${HOME.y}L${B1.x} ${B1.y}L${B2.x} ${B2.y}L${B3.x} ${B3.y}Z`;

const seg = (a: BoardSlot, b: BoardSlot) => `M${SPOT[a].x} ${SPOT[a].y}L${SPOT[b].x} ${SPOT[b].y}`;
const mid = (a: BoardSlot, b: BoardSlot) => ({ x: (SPOT[a].x + SPOT[b].x) / 2, y: (SPOT[a].y + SPOT[b].y) / 2 });
const pctX = (x: number) => `${(x / BW) * 100}%`;
const pctY = (y: number) => `${(y / BH) * 100}%`;

export interface BoardProps {
  st: LineupState;
  ev: Eval;
  /** 홈구장 주인 (내 구단) */
  home: Team;
  /** 시트가 열린 자리 */
  active?: Slot | null;
  onPick: (slot: Slot) => void;
  /** 능력치 폭발 연출 번호 (null 이면 없음) */
  boom: number | null;
  onBoomDone: () => void;
}

export function Board({ st, ev, home, active, onPick, boom, onBoomDone }: BoardProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const stad = home.stadium;
  const wallW = stad.wallM.map((h) => 2.2 + h * 0.7);
  const third = (TH_R - TH_L) / 3;
  const hiWall = stad.wallM.reduce((m, h, i) => (h >= 5 ? { h, i } : m), null as { h: number; i: number } | null);

  // 선 굵기가 바뀐 선 — 잠깐 번쩍
  const prev = useRef<Map<string, Level> | null>(null);
  const [flash, setFlash] = useState<Record<string, { up: boolean; n: number }>>({});
  useEffect(() => {
    const p = prev.current;
    const now = new Map(ev.links.map((l) => [l.id, l.level]));
    if (p) {
      const ch: Record<string, { up: boolean; n: number }> = {};
      ev.links.forEach((l) => { const o = p.get(l.id); if (o != null && o !== l.level) ch[l.id] = { up: l.level > o, n: performance.now() }; });
      if (Object.keys(ch).length) setFlash((f) => ({ ...f, ...ch }));
    }
    prev.current = now;
  }, [ev.links]);

  // 처음 그릴 때만 카드가 차례로 들어온다
  const first = useRef(true);
  useEffect(() => { const t = window.setTimeout(() => { first.current = false; }, 900); return () => window.clearTimeout(t); }, []);

  // 이름표는 3단 이상이고 카드 사이로 선이 충분히 보일 때만 (배터리는 카드 사이가 짧아 투수진 탭에서)
  const named = ev.links.filter((l) => l.name && l.level >= 3 && visibleLen(l.a as BoardSlot, l.b as BoardSlot) >= 48);

  return (
    <div className={s.board} data-boom={boom != null ? '' : undefined} data-exploded={ev.exploded ? '' : undefined}
      style={{ ['--club-c' as string]: ev.club.colors.primary, ['--club-c2' as string]: ev.club.colors.secondary } as CSSProperties}>
      <div className={s.fieldWrap}>
        <svg className={s.svg} viewBox={`0 0 ${BW} ${BH}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
          <defs>
            <radialGradient id={`rings${uid}`} gradientUnits="userSpaceOnUse" cx={HOME.x} cy={HOME.y} r="34" spreadMethod="repeat">
              <stop offset="0" style={{ stopColor: 'var(--field-grass)' }} />
              <stop offset=".5" style={{ stopColor: 'var(--field-grass)' }} />
              <stop offset=".5" style={{ stopColor: 'var(--field-grass-2)' }} />
              <stop offset="1" style={{ stopColor: 'var(--field-grass-2)' }} />
            </radialGradient>
            <pattern id={`stripes${uid}`} width={BW} height="30" patternUnits="userSpaceOnUse">
              <rect width={BW} height="30" className={s.g1} />
              <rect width={BW} height="15" className={s.g2} />
            </pattern>
            <pattern id={`check${uid}`} width="22" height="22" patternUnits="userSpaceOnUse" patternTransform={`translate(${HOME.x} ${HOME.y}) rotate(45)`}>
              <rect width="22" height="22" className={s.g1} />
              <rect width="11" height="11" className={s.g2} />
              <rect x="11" y="11" width="11" height="11" className={s.g2} />
            </pattern>
            <radialGradient id={`pool${uid}`} cx=".5" cy=".5" r=".5">
              <stop offset="0" style={{ stopColor: 'var(--field-light)', stopOpacity: 'var(--field-light-a)' }} />
              <stop offset=".55" style={{ stopColor: 'var(--field-light)', stopOpacity: 'calc(var(--field-light-a) * .35)' }} />
              <stop offset="1" style={{ stopColor: 'var(--field-light)', stopOpacity: 0 }} />
            </radialGradient>
            <radialGradient id={`vig${uid}`} cx=".5" cy=".46" r=".78">
              <stop offset=".55" style={{ stopColor: 'var(--bg-deep)', stopOpacity: 0 }} />
              <stop offset="1" style={{ stopColor: 'var(--bg-deep)', stopOpacity: 0.62 }} />
            </radialGradient>
            <clipPath id={`fair${uid}`}><path d={FAIR} /></clipPath>
            <pattern id={`ht${uid}`} width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".95" className={s.htDot} /></pattern>
          </defs>

          {/* 관중석 · 파울 지역 · 페어 지역 */}
          <rect width={BW} height={BH} className={s.stands} />
          <path d={GROUND} className={s.foul} />
          <path d={FAIR} fill={`url(#rings${uid})`} className={s.mowRings} />
          <path d={FAIR} fill={`url(#stripes${uid})`} className={s.mowStripes} />
          <path d={FAIR} className={s.mowPlain} />
          <path d={FENCE} className={s.track} clipPath={`url(#fair${uid})`} />

          {/* 내야 */}
          <g clipPath={`url(#fair${uid})`}>
            <circle cx={MOUND.x} cy={MOUND.y + 3} r="128" className={s.dirt} />
            <circle cx={MOUND.x} cy={MOUND.y + 3} r="128" className={s.inkEdge} />
            <circle cx={MOUND.x} cy={MOUND.y + 3} r="128" fill={`url(#ht${uid})`} className={s.ht} />
            <path d={FENCE} className={s.htTrack} stroke={`url(#ht${uid})`} />
          </g>
          <circle cx={HOME.x} cy={HOME.y - 2} r="25" className={s.dirt} />
          <path d={INFIELD} fill={`url(#check${uid})`} className={s.infield} />
          <path d={DIAMOND} className={s.paths} />
          <circle cx={MOUND.x} cy={MOUND.y} r="14" className={s.mound} />
          <rect x={MOUND.x - 5} y={MOUND.y - 1.2} width="10" height="2.4" className={s.base} />
          {[B1, B2, B3].map((b, i) => (
            <rect key={i} x={b.x - 4.5} y={b.y - 4.5} width="9" height="9" transform={`rotate(45 ${b.x} ${b.y})`} className={s.base} />
          ))}
          <path d={`M${HOME.x - 4.5} ${HOME.y - 3.5}h9v4l-4.5 4-4.5-4z`} className={s.base} />

          {/* 파울 선 · 담장 (높은 담장은 두껍게) */}
          <g className={s.ink}>
            <path d={`M${HOME.x} ${HOME.y}L0 ${POLE}M${HOME.x} ${HOME.y}L390 ${POLE}`} className={s.lines} />
            {[0, 1, 2].map((k) => (
              <path key={k} d={arc(ARC.r + wallW[k] / 2, TH_L + third * k, TH_L + third * (k + 1))} className={s.wall} style={{ strokeWidth: wallW[k] }} />
            ))}
            <path d={FENCE} className={s.wallTop} />
          </g>
          <g className={s.dist}>
            {/* 좌·우는 담장 안쪽(워닝 트랙) — 실제 구장처럼 담장에 쓴 거리 */}
            <text x="12" y="168">{stad.fence[0]}</text>
            <text x={BW / 2} y="9.5" textAnchor="middle">{stad.fence[1]}</text>
            <text x={BW - 12} y="168" textAnchor="end">{stad.fence[2]}</text>
            {hiWall && <text x={hiWall.i === 0 ? 12 : BW - 12} y="180" textAnchor={hiWall.i === 0 ? 'start' : 'end'} className={s.hiWall}>{hiWall.h}m 담장</text>}
          </g>

          {/* 조명 (night 에서만) */}
          <g className={s.lights}>
            <ellipse cx="44" cy="28" rx="150" ry="120" fill={`url(#pool${uid})`} />
            <ellipse cx="346" cy="28" rx="150" ry="120" fill={`url(#pool${uid})`} />
            <ellipse cx="195" cy="330" rx="170" ry="120" fill={`url(#pool${uid})`} />
          </g>
          <rect width={BW} height={BH} fill={`url(#vig${uid})`} className={s.vignette} />

          {/* 케미 선 */}
          <g className={s.links}>
            {ev.links.map((l) => {
              const [a, b] = [l.a as BoardSlot, l.b as BoardSlot];
              const d = seg(a, b);
              return (
                <g key={l.id} className={s['l' + l.level]}>
                  {l.level === 4 && <><path d={d} className={s.glowA} /><path d={d} className={s.glowB} /></>}
                  <path d={d} className={s.case} />
                  <path d={d} className={s.core} />
                  {l.level === 4 && <path d={d} className={s.inner} />}
                </g>
              );
            })}
            {Object.entries(flash).map(([id, f]) => {
              const [a, b] = id.split('-') as [BoardSlot, BoardSlot];
              return <path key={`${id}${f.n}`} d={seg(a, b)} className={f.up ? s.flashUp : s.flashDown} />;
            })}
          </g>
        </svg>
      </div>

      {/* 이름 붙은 선 */}
      {named.map((l) => {
        const m = mid(l.a as BoardSlot, l.b as BoardSlot);
        return (
          <span key={l.id} className={[s.tag, l.level === 4 && s.tagVolt].filter(Boolean).join(' ')} style={{ left: pctX(m.x), top: pctY(m.y) }}>
            {l.name}{l.level === 4 && <i> 형광</i>}
          </span>
        );
      })}

      {/* 카드 */}
      <div className={s.cards}>
        {BOARD_SLOTS.map((b, i) => {
          const slot = boardToSlot(b);
          const id = b === 'P' ? st.rotation[0] : st.field[b];
          const u = id ? unit(id) : null;
          const ue = ev.units[slot];
          const ord = b === 'P' ? null : st.order.indexOf(b) + 1;
          // 카드 밑 숫자 — 라인업에서 오른 종합: 강화 · 훈련 · 잠재력 · 세트덱 · 케미 (+ 타순 적성, − 자리 적성)
          const bonus = ue && u ? Math.round(ue.total - cardOvr(u)) : 0;
          const p = SPOT[b];
          const label = u
            ? `${SLOT_KO[slot]} ${u.player.name}, 종합 ${cardOvr(u)}${bonus ? `, 라인업에서 ${bonus > 0 ? '+' : ''}${bonus}` : ''}${ue?.fit === 'off' ? ', 적성 밖 자리' : ''} — 정보 보기`
            : `${SLOT_KO[slot]} 비어 있음 — 채우기`;
          return (
            <button
              key={b}
              type="button"
              className={[s.slot, active === slot && s.on].filter(Boolean).join(' ')}
              style={{ left: pctX(p.x), top: pctY(p.y), ['--i' as string]: i, ['--hop' as string]: HOP[b] } as CSSProperties}
              onClick={() => onPick(slot)}
              aria-label={label}
            >
              <span className={s.lift}>
                {u ? (
                  <span key={u.id} className={[s.cardIn, first.current && s.intro].filter(Boolean).join(' ')}>
                    <CardMini {...cardProps(u.card)} ovrShown={ue ? Math.round(ue.total) : undefined} selected={active === slot} style={{ width: '100%' }} />
                  </span>
                ) : (
                  <span className={s.empty}><Icon name="plus" size={20} /><small>{SLOT_KO[slot]}</small></span>
                )}
              </span>
              <span className={s.under} aria-hidden>
                {ord != null && <span className={['num', s.ord].join(' ')}>{ord}</span>}
                {ue && (ue.fit === 'off'
                  ? <span className={[s.bonus, s.bad].join(' ')}>적성 밖</span>
                  : bonus !== 0 && <span key={bonus} className={['num', s.bonus, bonus < 0 && s.bad, ev.exploded && s.boomed].filter(Boolean).join(' ')}>{bonus > 0 ? '+' : ''}{bonus}</span>)}
              </span>
            </button>
          );
        })}
      </div>

      <p className={s.caption} aria-hidden>
        <Emblem team={home} size={16} />
        <span><b>{stad.name}</b><small>{stad.surface === 'turf' ? '인조잔디' : '천연잔디'} · {stad.roof === 'dome' ? '돔' : '개방형'}</small></span>
      </p>

      {boom != null && <Boom key={boom} ev={ev} onDone={onBoomDone} />}
    </div>
  );
}

/* ───────── 능력치 폭발 연출 ─────────
   0.0s 판이 어두워짐 → 0.3s 투수에서부터 케미 선이 차례로 충전 → 0.4s 카드가 차례로 튐
   → 0.65s 가운데 '능력치 폭발' → 2.4s 걷힘. 누르면 바로 끝. 움직임 줄이기면 제목만 나타났다 사라짐. */
const CHARGE = FIELD_LINKS
  .map(([a, b]) => (HOP[a] <= HOP[b] ? [a, b] : [b, a]) as [BoardSlot, BoardSlot])
  .sort((x, y) => Math.min(HOP[x[0]], HOP[x[1]]) - Math.min(HOP[y[0]], HOP[y[1]]));

function Boom({ ev, onDone }: { ev: Eval; onDone: () => void }) {
  const [out, setOut] = useState(false);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const t1 = window.setTimeout(() => setOut(true), 2500);
    const t2 = window.setTimeout(() => done.current(), 2950);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, []);
  const skip = () => { setOut(true); window.setTimeout(() => done.current(), 260); };
  return (
    <div className={[s.boom, out && s.boomOut].filter(Boolean).join(' ')}>
      <div className={s.boomScrim} />
      <svg className={s.charge} viewBox={`0 0 ${BW} ${BH}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
        {CHARGE.map(([a, b], k) => (
          <path key={`${a}${b}`} d={seg(a, b)} pathLength={1} style={{ ['--d' as string]: `${300 + k * 60}ms` } as CSSProperties} />
        ))}
      </svg>
      <div className={s.boomTitle} role="status">
        <p className={s.boomKicker}><Emblem team={ev.club} size={18} /><span>{ev.active[0]?.name ?? ev.club.name}</span><b className="num">20/20</b></p>
        <p className={s.boomBig}>왕조 — 능력치 폭발</p>
        <p className={s.boomSub}>엔트리 전원 세트 <b className="num">+{BOOM}</b> 단계</p>
      </div>
      <button type="button" className={s.boomCatch} onClick={skip} aria-label="연출 건너뛰기" />
    </div>
  );
}

/** 케미 단계 견본 (범례) */
export function LinkLegend() {
  const levels: Level[] = [1, 2, 3, 4, 0];
  return (
    <div className={s.legend} aria-label="케미 선 단계: 1단, 2단, 3단, 형광, 끊김">
      <span className={s.legendH}>케미</span>
      {levels.map((lv) => (
        <span key={lv} className={s.legendItem}>
          <svg width="22" height="10" viewBox="0 0 22 10" aria-hidden className={s['l' + lv]}>
            {lv === 4 && <><path d="M2 5h18" className={s.glowA} /><path d="M2 5h18" className={s.glowB} /></>}
            <path d="M2 5h18" className={s.case} />
            <path d="M2 5h18" className={s.core} />
            {lv === 4 && <path d="M2 5h18" className={s.inner} />}
          </svg>
          {LEVEL_KO[lv]}
        </span>
      ))}
    </div>
  );
}
