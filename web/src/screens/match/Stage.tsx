// 2D 경기장 무대 — 고정 경기장(Field) 위에 매 프레임 바뀌는 층(공·야수·주자·수비 범위 원)과
// 중계 그래픽(볼카운트 · 투구 위치 · 날씨 · 타구 정보)을 얹는다.
import { memo, useMemo, type CSSProperties, type ReactNode } from 'react';
import { Field, Icon } from '../../ui';
import { playerById, teamById } from '../../game/mock';
import type { Stadium } from '../../game/types';
import { useTheme } from '../../theme/ThemeProvider';
import { GAME, ZONE, type PitchEv, type WxState } from './local-mock';
import { FIELD_BOX, S, VIEWBOX, WIND_DEG, pctOf, type Pt } from './geometry';
import { breakOf, type Frame } from './script';
import { frameOf, residuesFor, cursorOf, PLAYS, type Live, type Residue } from './timeline';
import { useSnap, type Player } from './player';
import { useReducedMotion } from './hooks';
import { nameOf, tagOf } from './tags';
import s from './Stage.module.css';

const StaticField = memo(function StaticField({ stadium }: { stadium: Stadium }) {
  return <Field stadium={stadium} label={`${stadium.name} — 위에서 본 경기장`} />;
});

export interface StageProps {
  player: Player;
  live: Live;
  showZone: boolean;
  /** 주자·수비 팀 색 — 수비는 [원정, 홈] 순 */
  children?: ReactNode;
  idle?: boolean;
}

export function Stage({ player, live, showZone, children, idle }: StageProps) {
  const home = teamById(GAME.match.homeId);
  const wx = GAME.wx[live.play.wx] ?? GAME.wx[0];
  return (
    <div className={s.stage} data-stage="">
      <div className={s.fieldBox} style={{ top: FIELD_BOX.top, height: FIELD_BOX.height }}>
        <StaticField stadium={home.stadium} />
      </div>
      <Wind wx={wx} />
      <FieldLayer player={player} idle={idle} />
      <CountBug live={live} />
      {showZone && <ZonePanel live={live} />}
      <WeatherChip wx={wx} />
      <Readout player={player} />
      {children}
    </div>
  );
}

/* ───────── 바람 결 (night · broadcast) ───────── */
function Wind({ wx }: { wx: WxState }) {
  const deg = WIND_DEG[wx.windTo];
  const reduced = useReducedMotion();
  if (deg == null || reduced) return null;
  const dur = Math.max(1.6, 5.2 - wx.windMps * 0.55);
  const lines = [[18, 12], [42, 64], [66, 30], [30, 86], [78, 74], [56, 8], [88, 46]];
  return (
    <div className={s.wind} aria-hidden style={{ '--wdeg': `${deg}deg`, '--wdur': `${dur}s` } as CSSProperties}>
      <div className={s.windRot}>
        {lines.map(([x, y], i) => <i key={i} style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${-(i * dur) / lines.length}s` }} />)}
      </div>
    </div>
  );
}

/* ───────── 매 프레임 층 ───────── */
const M2U = S / 140;

function FieldLayer({ player, idle }: { player: Player; idle?: boolean }) {
  const snap = useSnap(player);
  const reduced = useReducedMotion();
  const { theme } = useTheme();
  const beat = player.beats[snap.idx];
  // 움직임 줄이기 — 날아가는 공 대신 끝난 모습을 바로
  const local = reduced && (beat.k === 'bip' || beat.k === 'result' || beat.k === 'steal' || (beat.k === 'fill' && beat.flash != null)) ? beat.dur : snap.local;
  const frame = useMemo(() => frameOf(beat, local), [beat, local]);
  const cursor = cursorOf(beat, local);
  const residues = useMemo(() => (beat.k === 'fill' ? [] : residuesFor(cursor).filter((r) => !(r.id === PLAYS[cursor.play].id && (beat.k === 'bip' || beat.k === 'callout' || beat.k === 'end')))), [beat.k, cursor.play, cursor.applied]); // eslint-disable-line react-hooks/exhaustive-deps
  const play = PLAYS[cursor.play];
  const fieldTeam = teamById(play.half === 'top' ? GAME.match.homeId : GAME.match.awayId);
  const batTeam = teamById(play.half === 'top' ? GAME.match.awayId : GAME.match.homeId);
  const classic = theme === 'classic';
  const mine = (id: string) => id === 'dj';
  const fill = (teamId: string, color: string) => (classic ? (mine(teamId) ? 'var(--club)' : 'var(--surface)') : color);
  const fFill = fill(fieldTeam.id, fieldTeam.colors.primary);
  const rFill = fill(batTeam.id, batTeam.colors.primary);
  return (
    <svg className={s.layer} viewBox={VIEWBOX} preserveAspectRatio="xMidYMid slice" aria-hidden>
      {!idle && frame.circles && <Circles circles={frame.circles} color={classic ? 'var(--fg)' : fieldTeam.colors.primary} />}
      <Residues list={residues} classic={classic} />
      {frame.trace && <polyline className={s.trace} points={pts(frame.trace)} />}
      {frame.landing && <Landing l={frame.landing} />}
      {frame.fielders.map((f) => (
        <g key={f.pos} className={[s.fielder, f.hot && s.hot].filter(Boolean).join(' ')} transform={`translate(${f.p.x * S} ${f.p.y * S})`}>
          {!!f.dive && <ellipse className={s.dive} rx={7 * f.dive + 4} ry={3.6} opacity={0.35 * f.dive} />}
          <circle r={f.hot ? 5.2 : 4.5} style={{ fill: fFill }} />
        </g>
      ))}
      {frame.runners.map((r) => (
        <g key={r.id} className={[s.runner, r.out && s.out].filter(Boolean).join(' ')} transform={`translate(${r.p.x * S} ${r.p.y * S})`} opacity={r.alpha}>
          <circle r={4.9} style={{ fill: rFill }} />
          {r.out && <path className={s.x} d="M-3 -3 3 3M3 -3-3 3" />}
        </g>
      ))}
      <ActorLabels frame={frame} idle={idle} />
      {frame.tail && <polyline className={s.tail} points={pts(frame.tail)} style={frame.tailColor && !classic ? { stroke: frame.tailColor } : undefined} />}
      {frame.ball && <Ball b={frame.ball} />}
      {frame.marks.map((m, i) => <MarkText key={i + m.text} m={m} />)}
      {frame.cause && <Cause c={frame.cause} />}
    </svg>
  );
}

const pts = (a: Pt[]) => a.map((p) => `${(p.x * S).toFixed(1)},${(p.y * S).toFixed(1)}`).join(' ');

function Circles({ circles, color }: { circles: NonNullable<Frame['circles']>; color: string }) {
  return (
    <g className={s.circles} style={{ '--cc': color } as CSSProperties}>
      {circles.map((c, i) => c.r > 0.3 / 140 && (
        <circle key={i} className={c.strong ? s.cStrong : s.cFaint} cx={c.c.x * S} cy={c.c.y * S} r={c.r * S} opacity={c.alpha} />
      ))}
    </g>
  );
}

function Residues({ list, classic }: { list: Residue[]; classic: boolean }) {
  if (!list.length) return null;
  return (
    <g className={s.residue}>
      {list.map((r) => (
        <g key={r.id} className={r.tone === 'hit' ? s.rHit : s.rOut}>
          {r.trace && <polyline points={pts(r.trace)} />}
          {r.landing && <circle cx={r.landing.at.x * S} cy={r.landing.at.y * S} r={r.tone === 'hit' ? 2.2 : 2.6} />}
          {classic && r.label && r.landing && (
            <text className="hand" x={r.landing.at.x * S + 5} y={r.landing.at.y * S - 4}>{r.label}</text>
          )}
        </g>
      ))}
    </g>
  );
}

function Landing({ l }: { l: NonNullable<Frame['landing']> }) {
  const x = l.at.x * S, y = l.at.y * S;
  return (
    <g className={[s.landing, s['l-' + l.kind]].join(' ')} opacity={l.alpha}>
      {l.kind === 'out' && <circle cx={x} cy={y} r={7 + 5 * (1 - l.alpha)} />}
      {l.kind === 'hit' && <path d={`M${x} ${y - 3.2}L${x + 3.2} ${y}L${x} ${y + 3.2}L${x - 3.2} ${y}Z`} />}
      {l.kind === 'hr' && <circle cx={x} cy={y} r={5} />}
      {l.kind === 'wall' && <path d={`M${x - 6} ${y}h12`} />}
    </g>
  );
}

function Ball({ b }: { b: NonNullable<Frame['ball']> }) {
  const x = b.p.x * S, y = b.p.y * S;
  const lift = b.h * 0.62;           // 높이 → 화면 위로
  const r = 2.2 + Math.min(3.2, b.h * 0.07);
  return (
    <g className={s.ball}>
      <ellipse cx={x} cy={y} rx={2 + b.h * 0.03} ry={1.2 + b.h * 0.015} className={s.shadow} opacity={Math.max(0.12, 0.45 - b.h * 0.01)} />
      <circle cx={x - lift * 0.18} cy={y - lift} r={r + 2.4} className={s.glow} />
      <circle cx={x - lift * 0.18} cy={y - lift} r={r} className={s.ballCore} />
    </g>
  );
}

/**
 * 이름표 — 야수 · 주자 · 타자 · 투수 옆에 '이름 ’연도'. 공에 관여한 야수(쫓고 · 잡고 · 던지는)는 진하게 크게, 나머지는 옅게.
 * 좁은 화면이면 성을 빼고 이름만. 겹치면 아래 → 위 → 오른쪽 → 왼쪽으로 비켜 놓고, 그래도 자리가 없으면 옅은 이름표부터 뺀다.
 */
function ActorLabels({ frame, idle }: { frame: Frame; idle?: boolean }) {
  if (idle) return null;
  const compact = typeof window !== 'undefined' && window.innerWidth < 360;
  const items = [
    ...frame.fielders.map((f) => ({ id: f.id, p: f.p, hot: f.hot, run: false, alpha: 1 })),
    ...frame.runners.filter((r) => r.alpha > 0.4).map((r) => ({ id: r.id, p: r.p, hot: false, run: true, alpha: r.alpha })),
  ].sort((a, b) => Number(b.hot) - Number(a.hot) || Number(b.run) - Number(a.run));
  const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
  // 점 자체도 비켜 갈 자리로
  for (const it of items) boxes.push({ x0: it.p.x * S - 5, y0: it.p.y * S - 5, x1: it.p.x * S + 5, y1: it.p.y * S + 5 });
  const out: ReactNode[] = [];
  for (const it of items) {
    const nm = nameOf(it.id, compact && !it.hot);
    if (!nm) continue;
    const txt = compact && !it.hot ? nm : `${nm} ${tagOf(it.id)}`;
    const fs = it.hot ? 9.6 : it.run ? 8.6 : 8;
    const w = [...txt].reduce((a, ch) => a + (/[가-힣]/.test(ch) ? fs * 0.98 : fs * 0.56), 0) + 3;
    const h = fs + 2;
    const x = it.p.x * S, y = it.p.y * S;
    const cands: [number, number][] = [[0, 14], [0, -8], [w / 2 + 7, 3.5], [-(w / 2 + 7), 3.5], [0, 23]];
    for (const [dx, dy] of cands) {
      const bx = { x0: x + dx - w / 2, x1: x + dx + w / 2, y0: y + dy - fs, y1: y + dy + 2 };
      const hit = boxes.some((o) => bx.x0 < o.x1 && bx.x1 > o.x0 && bx.y0 < o.y1 && bx.y1 > o.y0);
      if (hit) continue;
      boxes.push(bx);
      out.push(
        <text key={`${it.id}-${it.run ? 'r' : 'f'}`} x={x + dx} y={y + dy} textAnchor="middle" opacity={it.alpha}
          className={it.hot ? s.lblHot : it.run ? s.lblRun : s.lblDim} style={{ fontSize: fs }}>{txt}</text>,
      );
      void h;
      break;
    }
  }
  return <g className={s.labels}>{out}</g>;
}

/** (예전) 다이빙한 야수 이름 — 이름표(ActorLabels)로 바뀜 */
export function HotLabel({ frame }: { frame: Frame }) {
  const hot = frame.fielders.find((f) => f.hot && f.dive);
  const f = hot ?? frame.fielders.find((x) => x.hot && frame.marks.some((m) => m.tone === 'out'));
  if (!f) return null;
  const name = playerById(f.id)?.name;
  if (!name) return null;
  const x = f.p.x * S, y = f.p.y * S;
  return <text className={s.hotName} x={x} y={y + 15} textAnchor="middle">{name}</text>;
}

function MarkText({ m }: { m: Frame['marks'][number] }) {
  const x = m.at.x * S, y = m.at.y * S + m.dy;
  return (
    <g className={[s.mark, s['m-' + m.tone]].join(' ')} opacity={m.alpha}>
      <text x={x} y={y} textAnchor="middle" className={m.kLook ? s.kLook : undefined}>{m.text}</text>
    </g>
  );
}

function Cause({ c }: { c: NonNullable<Frame['cause']> }) {
  const x = c.at.x * S, y = c.at.y * S;
  const left = x > S * 0.62;
  return (
    <g className={s.cause} opacity={c.alpha}>
      <text x={left ? x - 8 : x + 8} y={y + 13} textAnchor={left ? 'end' : 'start'}>↳ {c.text.split(' — ')[0]}</text>
    </g>
  );
}

/* ───────── 볼카운트 (왼쪽 위) ───────── */
export function CountBug({ live }: { live: Live }) {
  const p = live.play;
  const [b, st] = live.count;
  const outs = Math.min(3, live.outs);
  return (
    <div className={s.bug} aria-label={`${p.inning}회${p.half === 'top' ? '초' : '말'} ${outs}아웃 볼카운트 ${b}-${st}`}>
      <span className={s.inn}>
        <i className={p.half === 'top' ? s.up : s.down} aria-hidden />
        <b className="num">{p.inning}</b>
      </span>
      <Bases bases={live.bases} />
      <span className={s.bso}>
        <Lamps label="B" n={b} max={3} cls={s.lb} />
        <Lamps label="S" n={st} max={2} cls={s.ls} />
        <Lamps label="O" n={outs} max={2} cls={s.lo} />
      </span>
      <span className={s.pc}><small>투구</small><b className="num">{live.pitcherPitches}</b></span>
    </div>
  );
}

function Lamps({ label, n, max, cls }: { label: string; n: number; max: number; cls: string }) {
  return (
    <span className={[s.lamps, cls].join(' ')}>
      <em className="num">{label}</em>
      {Array.from({ length: max }, (_, i) => <i key={i} className={i < n ? s.on : undefined} />)}
    </span>
  );
}

export function Bases({ bases, size = 30 }: { bases: (string | null)[]; size?: number }) {
  const on = (k: number) => (bases[k] ? s.bOn : undefined);
  return (
    <svg className={s.bases} width={size} height={size * 0.74} viewBox="0 0 30 22" aria-hidden>
      <rect x="18.6" y="8.6" width="7" height="7" transform="rotate(45 22.1 12.1)" className={on(0)} />
      <rect x="11.5" y="1.5" width="7" height="7" transform="rotate(45 15 5)" className={on(1)} />
      <rect x="4.4" y="8.6" width="7" height="7" transform="rotate(45 7.9 12.1)" className={on(2)} />
    </svg>
  );
}

/* ───────── 투구 위치 미니 존 (오른쪽 위) ───────── */
const RES_KO: Record<PitchEv['res'], string> = { ball: '볼', called: '스트라이크', swing: '헛스윙', foul: '파울', inplay: '타격', hbp: '몸에 맞음' };

export function ZonePanel({ live }: { live: Live }) {
  const p = live.play;
  const thrown = p.seq.slice(0, live.thrown);
  const last = thrown[thrown.length - 1];
  const thr = playerById(p.pitcherId)?.throws ?? 'R';
  const W = 64, H = 74, PX = 6, PY = 4;
  const zx = (x: number) => PX + x * (W - PX * 2);
  const zy = (y: number) => PY + y * (H - PY * 2 - 8);
  return (
    <div className={s.zone} aria-label={last ? `${last.no}구 ${last.name} ${last.kmh}km/h ${RES_KO[last.res]}` : '투구 전'}>
      <svg viewBox={`0 0 ${W} ${H}`} className={s.zsvg}>
        <rect className={s.zbox} x={zx(ZONE.x0)} y={zy(ZONE.y0)} width={zx(ZONE.x1) - zx(ZONE.x0)} height={zy(ZONE.y1) - zy(ZONE.y0)} />
        {[1, 2].map((k) => (
          <g key={k} className={s.zgrid}>
            <line x1={zx(ZONE.x0 + ((ZONE.x1 - ZONE.x0) * k) / 3)} x2={zx(ZONE.x0 + ((ZONE.x1 - ZONE.x0) * k) / 3)} y1={zy(ZONE.y0)} y2={zy(ZONE.y1)} />
            <line y1={zy(ZONE.y0 + ((ZONE.y1 - ZONE.y0) * k) / 3)} y2={zy(ZONE.y0 + ((ZONE.y1 - ZONE.y0) * k) / 3)} x1={zx(ZONE.x0)} x2={zx(ZONE.x1)} />
          </g>
        ))}
        <path className={s.plate} d={`M${W / 2 - 9} ${H - 7}h18v2.4l-9 3.6-9-3.6Z`} />
        {thrown.map((pt, i) => {
          const isLast = i === thrown.length - 1;
          const x = zx(pt.zone[0]), y = zy(pt.zone[1]);
          const [bx, by] = breakOf(pt.type, thr);
          return (
            <g key={pt.no} className={[s.pm, s['r-' + pt.res], isLast && s.pmLast].filter(Boolean).join(' ')}>
              {isLast && <path className={s.ptail} d={`M${x - bx * 46} ${y - by * 46}Q${x - bx * 12} ${y - by * 30} ${x} ${y}`} style={pt.sig ? { stroke: pt.sig } : undefined} />}
              <circle cx={x} cy={y} r={isLast ? 4.2 : 3.4} />
              <text x={x} y={y + 1.7} textAnchor="middle">{pt.no}</text>
            </g>
          );
        })}
      </svg>
      <p className={s.zcap}>
        {last ? (
          <>
            {last.sig ? <i className={s.sigBar} style={{ background: last.sig }} aria-hidden /> : null}
            <span className={last.sig ? s.sigName : undefined}>{last.name}</span>
            <b className="num">{last.kmh}</b>
          </>
        ) : <span className={s.zwait}>투구 전</span>}
      </p>
    </div>
  );
}

/* ───────── 날씨 (왼쪽 아래) ───────── */
export function WeatherChip({ wx }: { wx: WxState }) {
  const deg = WIND_DEG[wx.windTo];
  return (
    <div className={s.wx} aria-label={`기온 ${wx.tempC}도 ${wx.skyKo}, 바람 ${wx.windKo} ${wx.windMps}미터, 비 ${wx.rainPct}%`}>
      <p className={s.wxTop}>
        <Icon name={wx.sky === 'night-clear' ? 'moon' : wx.sky === 'clear' ? 'sun' : wx.sky === 'rain' || wx.sky === 'drizzle' ? 'rain' : 'cloud'} size={14} />
        <b className="num">{wx.tempC}°</b>
        <span>{wx.skyKo}</span>
      </p>
      <p className={s.wxRow}>
        {deg != null && (
          <svg viewBox="0 0 12 12" width="12" height="12" style={{ transform: `rotate(${deg}deg)` }} aria-hidden className={s.arrow}>
            <path d="M6 1.2 9.4 5.6H7v5.2H5V5.6H2.6Z" />
          </svg>
        )}
        <b className="num">{wx.windMps.toFixed(1)}</b><small>m/s</small>
        <span className={s.dim}>비</span><b className="num">{wx.rainPct}</b><small>%</small>
      </p>
    </div>
  );
}

/* ───────── 타구 정보 (오른쪽 아래) ───────── */
function Readout({ player }: { player: Player }) {
  const snap = useSnap(player);
  const beat = player.beats[snap.idx];
  if (beat.k !== 'bip' && beat.k !== 'callout' && !(beat.k === 'fill' && beat.flash != null)) return null;
  const f = frameOf(beat, snap.local);
  const r = f.readout;
  if (!r) return null;
  return (
    <div className={s.readout}>
      <p><span>타구 속도</span><b className="num">{r.ev}<small>km/h</small></b></p>
      <p><span>발사각</span><b className="num">{r.la}<small>°</small></b></p>
      <p><span>비거리</span><b className="num">{r.dist}<small>m</small></b></p>
      {r.catchProb != null && <p className={s.cp}><span>잡을 확률</span><b className="num">{Math.round(r.catchProb * 100)}<small>%</small></b></p>}
    </div>
  );
}

/** 무대 위 HTML 위치 */
export const posStyle = (p: Pt): CSSProperties => pctOf(p);
