import type { ReactNode } from 'react';
import s from './Gauge.module.css';

export interface GaugeProps {
  /** 지금 값 (팀 종합) */
  value: number;
  /** 조합 전 값 — 있으면 '조합 +5' 표시 */
  base?: number;
  /** 다 맞추면 (능력치 폭발) — 점선 칸으로 */
  potential?: number;
  /** 막대 눈금 범위 (차이가 잘 보이게 60~100) */
  min?: number;
  max?: number;
  label?: ReactNode;
  /** 막대 위 묶음 (타격 90 · 수비 92 …) */
  parts?: { ko: string; v: number }[];
  /** potential 위 작은 글자 (기본 '폭발 시 96') */
  potentialLabel?: ReactNode;
  ticks?: number[];
  className?: string;
}

/** 팀 종합 게이지 — 큰 숫자 + 막대 + 폭발 목표 */
export function Gauge({
  value, base, potential, min = 60, max = 100, label = '팀 종합', parts, potentialLabel, ticks = [70, 80, 90], className,
}: GaugeProps) {
  const pos = (v: number) => `${Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100))}%`;
  const bonus = base != null ? value - base : 0;
  return (
    <div className={[s.gauge, className].filter(Boolean).join(' ')}>
      <div className={s.big}>
        <span className={s.label}>{label}</span>
        <b className={["num-display", s.value].join(" ")}>{value}</b>
      </div>
      <div className={s.right}>
        {(parts || bonus > 0) && (
          <div className={s.parts}>
            {parts?.map((p) => (
              <span key={p.ko}>{p.ko}<b className="num">{p.v}</b></span>
            ))}
            {bonus > 0 && <span className={s.bonus}>조합<b className="num">+{bonus}</b></span>}
          </div>
        )}
        <div className={s.bar} role="meter" aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-label={typeof label === 'string' ? label : '팀 종합'}>
          <div className={s.track} />
          {base != null && bonus > 0 && <div className={s.base} style={{ width: pos(base) }} />}
          <div className={s.fill} style={{ width: pos(value) }} />
          {potential != null && potential > value && (
            <>
              <div className={s.ghost} style={{ left: pos(value), width: `calc(${pos(potential)} - ${pos(value)})` }} />
              <span className={s.pl} style={{ left: pos(potential) }}>{potentialLabel ?? <>폭발 시 <b className="num">{potential}</b></>}</span>
            </>
          )}
          {ticks.map((t) => (
            <span key={t} className={s.tick} style={{ left: pos(t) }}><i className="num">{t}</i></span>
          ))}
        </div>
      </div>
    </div>
  );
}
