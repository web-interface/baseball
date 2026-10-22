// 승리 확률 흐름 — 한 계열(홈 팀 승리 확률), 가운데 50% 기준선, 명장면 표시점(누르면 다시 보기).
// x 는 반 이닝 칸(18칸)에 고르게, y 는 위 = 홈 승리. 선은 2px, 표시점 8px + 2px 바탕 고리, 맞힘 영역 32px.
import { useId, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { Play } from '../../game/types';
import s from './WpChart.module.css';

export interface WpChartProps {
  plays: Play[];
  homeShort: string;
  awayShort: string;
  /** 표시점으로 보일 플레이 id */
  marks: string[];
  active?: string | null;
  onPick?: (id: string) => void;
  /** 표시점 옆 짧은 이름 */
  markLabel?: (p: Play) => string;
}

const halfKo = (p: Play) => `${p.inning}회${p.half === 'top' ? '초' : '말'}`;

export function WpChart({ plays, homeShort, awayShort, marks, active, onPick, markLabel }: WpChartProps) {
  const pts = useMemo(() => {
    const bySlot = new Map<number, Play[]>();
    plays.forEach((p) => {
      const h = (p.inning - 1) * 2 + (p.half === 'bot' ? 1 : 0);
      bySlot.set(h, [...(bySlot.get(h) ?? []), p]);
    });
    const out: { x: number; y: number; wp: number; play?: Play }[] = [{ x: 0, y: 0.5, wp: 0.5 }];
    [...bySlot.entries()].sort((a, b) => a[0] - b[0]).forEach(([h, ps]) => {
      ps.forEach((p, k) => {
        const x = (h + (k + 1) / (ps.length + 1)) / 18;
        out.push({ x, y: 1 - p.wp[1], wp: p.wp[1], play: p });
      });
    });
    return out;
  }, [plays]);

  const PAD = 0.1; // 위아래 여백 (높이 비율)
  const Y = (y: number) => PAD + y * (1 - PAD * 2);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${(p.x * 1000).toFixed(1)} ${(Y(p.y) * 100).toFixed(2)}`).join('');
  const last = pts[pts.length - 1];
  const area = `${line}L${(last.x * 1000).toFixed(1)} 50L0 50Z`;

  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const onMove = (e: PointerEvent) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const fx = (e.clientX - r.left) / r.width;
    let best = 1, bd = Infinity;
    pts.forEach((p, i) => { if (i && Math.abs(p.x - fx) < bd) { bd = Math.abs(p.x - fx); best = i; } });
    setHover(best);
  };
  const shown = hover != null ? pts[hover] : active ? pts.find((p) => p.play?.id === active) ?? null : null;

  return (
    <figure className={s.fig}>
      <figcaption className={s.cap}>
        <span>승리 확률 흐름</span>
        {shown?.play ? (
          <span className={s.read}>
            <b className="num">{Math.round(shown.play.wp[0] * 100)}%</b>
            <i aria-hidden>→</i>
            <b className="num">{Math.round(shown.play.wp[1] * 100)}%</b>
            <small>{halfKo(shown.play)} · {shown.play.text}</small>
          </span>
        ) : (
          <span className={s.hintCap}>{homeShort} 기준 · 점을 누르면 다시 보기</span>
        )}
      </figcaption>
      <div
        ref={box}
        className={s.plot}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <span className={[s.edge, s.top].join(' ')}>{homeShort} 승</span>
        <span className={[s.edge, s.bot].join(' ')}>{awayShort} 승</span>
        <svg className={s.svg} viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden>
          <defs>
            <clipPath id={`wpUp${uid}`}><rect x="0" y="0" width="1000" height="50" /></clipPath>
            <clipPath id={`wpDn${uid}`}><rect x="0" y="50" width="1000" height="50" /></clipPath>
          </defs>
          {Array.from({ length: 8 }, (_, i) => <line key={i} x1={((i + 1) * 2 / 18) * 1000} x2={((i + 1) * 2 / 18) * 1000} y1="0" y2="100" className={s.tick} />)}
          <line x1="0" x2="1000" y1="50" y2="50" className={s.mid} />
          <path d={area} className={s.areaUp} clipPath={`url(#wpUp${uid})`} />
          <path d={area} className={s.areaDn} clipPath={`url(#wpDn${uid})`} />
          <path d={line} className={s.line} />
          {shown && <line x1={shown.x * 1000} x2={shown.x * 1000} y1="0" y2="100" className={s.cross} />}
        </svg>
        {shown && <span className={s.dot} style={{ left: `${shown.x * 100}%`, top: `${Y(shown.y) * 100}%` }} aria-hidden />}
        {pts.filter((p) => p.play && marks.includes(p.play.id)).map((p) => (
          <button
            key={p.play!.id}
            type="button"
            className={[s.mark, active === p.play!.id && s.on, p.y < 0.5 ? s.markHi : s.markLo].filter(Boolean).join(' ')}
            style={{ left: `${p.x * 100}%`, top: `${Y(p.y) * 100}%` }}
            onClick={() => onPick?.(p.play!.id)}
            onFocus={() => setHover(pts.indexOf(p))}
            onBlur={() => setHover(null)}
            aria-label={`${halfKo(p.play!)} ${p.play!.highlight?.title ?? ''} 다시 보기`}
          >
            <i />
            {markLabel && <span>{markLabel(p.play!)}</span>}
          </button>
        ))}
      </div>
      <div className={s.axis} aria-hidden>
        {Array.from({ length: 9 }, (_, i) => <span key={i} className="num" style={{ left: `${((i * 2 + 1) / 18) * 100}%` }}>{i + 1}</span>)}
      </div>
      <table className="sr-only">
        <caption>명장면 승리 확률</caption>
        <tbody>
          {pts.filter((p) => p.play && marks.includes(p.play.id)).map((p) => (
            <tr key={p.play!.id}><th>{halfKo(p.play!)}</th><td>{p.play!.highlight?.title}</td><td>{Math.round(p.play!.wp[0] * 100)}% → {Math.round(p.play!.wp[1] * 100)}%</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
