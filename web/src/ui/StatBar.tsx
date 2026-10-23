import type { ReactNode } from 'react';
import s from './StatBar.module.css';

export interface StatBarProps {
  label: ReactNode;
  /** 기본 값 (1~100) */
  value: number;
  /** 강화·레벨·팀컬러로 더해진 값 — 빗금 칸 */
  bonus?: number;
  max?: number;
  /** fm = 1~20 눈금으로 숫자 표시 (상세 화면), 막대는 그대로 */
  scale?: '100' | 'fm';
  /** 이름 칸 폭 */
  labelWidth?: number;
  size?: 's' | 'm';
  /** 숫자 오른쪽 작은 메모 */
  note?: ReactNode;
  className?: string;
}

/** 100 을 넘으면(보너스 포함) 10 단위로 다른 색 — 100 · 110 · 120 · 130 · 140 이상 */
const band100 = (v: number) => (v >= 140 ? 'o140' : v >= 130 ? 'o130' : v >= 120 ? 'o120' : v >= 110 ? 'o110' : v >= 100 ? 'o100' : v >= 90 ? 'top' : v >= 80 ? 'hi' : v >= 60 ? 'mid' : 'lo');
const bandFm = (v: number) => (v >= 18 ? 'fm5' : v >= 15 ? 'fm4' : v >= 11 ? 'fm3' : v >= 6 ? 'fm2' : 'fm1');

/** 능력치 막대 — 이름 · 막대 · 숫자 */
export function StatBar({ label, value, bonus = 0, max = 100, scale = '100', labelWidth, size = 'm', note, className }: StatBarProps) {
  const total = value + bonus;
  const shown = scale === 'fm' ? Math.max(1, Math.min(20, Math.round(total / 5))) : Math.round(total);
  const band = scale === 'fm' ? bandFm(shown) : band100(total);
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  return (
    <div className={[s.row, s[size], className].filter(Boolean).join(' ')} style={labelWidth ? { gridTemplateColumns: `${labelWidth}px 1fr auto` } : undefined}>
      <span className={s.label}>{label}</span>
      <span className={s.bar} aria-hidden>
        <i className={s.fill} style={{ width: pct(value) }} />
        {bonus > 0 && <i className={s.bonus} style={{ left: pct(value), width: `calc(${pct(total)} - ${pct(value)})` }} />}
      </span>
      <span className={s.val}>
        <b className={['num', s[band]].join(' ')}>{shown}</b>
        {bonus > 0 && scale === '100' && <em className="num">+{bonus}</em>}
        {note && <small>{note}</small>}
      </span>
    </div>
  );
}
