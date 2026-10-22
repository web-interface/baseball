// 레이팅 추이 — 한 줄(2px) + 옅은 면 + 끝점. 손가락/마우스를 대면 그 판 값
import { useState, type PointerEvent } from 'react';
import s from './pvp.module.css';

export function Spark({ values, className, label, min: minIn, max: maxIn, mid }: { values: number[]; className?: string; label: string; min?: number; max?: number; mid?: number }) {
  const [hi, setHi] = useState<number | null>(null);
  const W = 160, H = 46, pad = 4;
  const min = minIn ?? Math.min(...values), max = maxIn ?? Math.max(...values);
  const x = (i: number) => pad + (i / Math.max(1, values.length - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - ((v - min) / Math.max(1e-6, max - min)) * (H - pad * 2);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  const area = `${d}L${x(values.length - 1).toFixed(1)} ${H}L${x(0).toFixed(1)} ${H}Z`;
  const last = values.length - 1;
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const rel = ((e.clientX - r.left) / r.width) * W;
    setHi(Math.max(0, Math.min(last, Math.round(((rel - pad) / (W - pad * 2)) * last))));
  };
  const i = hi ?? last;
  return (
    <div className={[s.sparkWrap, className].filter(Boolean).join(' ')}>
      <svg viewBox={`0 0 ${W} ${H}`} className={s.sparkSvg} role="img" aria-label={`${label}: ${values[0]} → ${values[last]}`} onPointerMove={onMove} onPointerLeave={() => setHi(null)}>
        {mid != null && <line x1={pad} x2={W - pad} y1={y(mid)} y2={y(mid)} className={s.sparkMid} />}
        <path d={area} className={s.sparkArea} />
        <path d={d} className={s.sparkLine} />
        {hi != null && <line x1={x(i)} x2={x(i)} y1={0} y2={H} className={s.sparkCross} />}
        <circle cx={x(i)} cy={y(values[i])} r="4" className={s.sparkDot} />
      </svg>
      {hi != null && <span className={['num', s.sparkTip].join(' ')} style={{ left: `${(x(i) / W) * 100}%` }}>{Math.round(values[i]).toLocaleString('en-US')}</span>}
    </div>
  );
}
