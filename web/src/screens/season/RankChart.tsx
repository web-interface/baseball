// 순위 경쟁 그래프 — 날마다 10개 구단 순위(1위가 위). 내 구단만 구단색으로 굵게, 나머지는 옅은 회색 실선.
// 오른쪽 끝 이름표가 범례. 구단 이름표를 누르면 그 구단도 구단색으로 따라가 본다. 그래프 위를 대면 그날 순위.
import { useMemo, useRef, useState, type PointerEvent } from 'react';
import { ME, TEAMS, teamById } from '../../game/mock';
import { shortDate } from '../../season/schedule';
import s from './season.module.css';

export interface RankChartProps {
  /** 구단 → 날마다 순위 (첫 칸 = 시작 순위) */
  hist: Record<string, number[]>;
  /** 칸마다 날짜 (hist 와 같은 길이 — 첫 칸은 시작) */
  dates: string[];
  /** 총 칸 수 (남은 시즌까지) — 가로 폭을 미리 잡아 둔다 */
  total: number;
}

const W = 340, H = 236, PL = 18, PR = 62, PT = 10, PB = 20;

export function RankChart({ hist, dates, total }: RankChartProps) {
  const [pick, setPick] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const n = Math.max(2, total);
  const x = (i: number) => PL + (i / (n - 1)) * (W - PL - PR);
  const y = (r: number) => PT + ((r - 1) / 9) * (H - PT - PB);
  const len = Math.max(0, ...Object.values(hist).map((a) => a.length));
  const lines = useMemo(() => TEAMS.map((t) => {
    const a = hist[t.id] ?? [];
    const d = a.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(r).toFixed(1)}`).join('');
    return { t, d, last: a[a.length - 1] ?? 10 };
  }), [hist, n]); // eslint-disable-line react-hooks/exhaustive-deps
  const focus = (id: string) => id === ME.teamId || id === pick;
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r || len < 1) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - PL) / (W - PL - PR)) * (n - 1));
    setHover(Math.max(0, Math.min(len - 1, i)));
  };
  const hv = hover != null ? hover : null;
  const order = hv != null ? TEAMS.map((t) => ({ t, r: hist[t.id]?.[hv] ?? 10 })).sort((a, b) => a.r - b.r) : [];
  const meT = teamById(ME.teamId);
  return (
    <figure className={s.chart}>
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className={s.chartSvg} role="img" aria-label={`순위 경쟁 — ${meT.short} 지금 ${hist[ME.teamId]?.[len - 1] ?? '-'}위`}
        onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
        {/* 순위 눈금 — 1·5·10위 */}
        {[1, 5, 10].map((r) => (
          <g key={r}>
            <line x1={PL} x2={W - PR + 4} y1={y(r)} y2={y(r)} className={s.grid} />
            <text x={PL - 6} y={y(r) + 3.5} className={s.axis} textAnchor="end">{r}</text>
          </g>
        ))}
        {/* 가을야구 선 (6위까지) */}
        <line x1={PL} x2={W - PR + 4} y1={(y(6) + y(7)) / 2} y2={(y(6) + y(7)) / 2} className={s.cut} />
        {/* 옅은 구단 먼저, 따라가는 구단은 위에 */}
        {lines.filter((l) => !focus(l.t.id)).map((l) => <path key={l.t.id} d={l.d} className={s.line} />)}
        {lines.filter((l) => focus(l.t.id)).map((l) => <path key={l.t.id} d={l.d} className={[s.line, l.t.id === ME.teamId ? s.mine : s.picked].join(' ')} style={{ stroke: l.t.colors.primary }} />)}
        {/* 끝 이름표 = 범례 (누르면 따라가기) */}
        {lines.map((l) => (
          <g key={`lb-${l.t.id}`} className={s.endLabel} onClick={() => setPick((p) => (p === l.t.id ? null : l.t.id))}>
            <circle cx={x(Math.max(0, len - 1))} cy={y(l.last)} r={focus(l.t.id) ? 3.6 : 2.4} className={s.endDot} style={focus(l.t.id) ? { fill: l.t.colors.primary } : undefined} />
            <rect x={W - PR + 6} y={y(l.last) - 8} width={PR - 6} height={16} className={s.hit} />
            <text x={W - PR + 10} y={y(l.last) + 3.5} className={[s.lbl, focus(l.t.id) && s.lblOn].filter(Boolean).join(' ')}>{l.last}·{l.t.short}</text>
          </g>
        ))}
        {/* 대고 있는 날 */}
        {hv != null && (
          <g>
            <line x1={x(hv)} x2={x(hv)} y1={PT - 4} y2={H - PB + 2} className={s.cross} />
            <text x={x(hv)} y={H - 4} className={s.axis} textAnchor="middle">{dates[hv] ? shortDate(dates[hv]) : ''}</text>
          </g>
        )}
        {hv == null && dates.length > 0 && (
          <>
            <text x={PL} y={H - 4} className={s.axis}>{shortDate(dates[0])}</text>
            <text x={x(len - 1)} y={H - 4} className={s.axis} textAnchor="middle">{len > 1 ? shortDate(dates[len - 1]) : ''}</text>
          </>
        )}
      </svg>
      {hv != null ? (
        <figcaption className={s.tip}>
          <b className="num">{dates[hv] ? shortDate(dates[hv]) : ''}</b>
          {order.slice(0, 5).map((o) => <span key={o.t.id} className={o.t.id === ME.teamId ? s.tipMe : undefined}><span className="num">{o.r}</span> {o.t.short}</span>)}
          {!order.slice(0, 5).some((o) => o.t.id === ME.teamId) && <span className={s.tipMe}><span className="num">{hist[ME.teamId]?.[hv]}</span> {meT.short}</span>}
        </figcaption>
      ) : (
        <figcaption className={s.cap}>날마다 순위 · {meT.short}는 구단색 · 이름을 누르면 그 구단도 따라가요 · 점선 위 6위까지 가을야구</figcaption>
      )}
    </figure>
  );
}
