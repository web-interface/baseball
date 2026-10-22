import type { CSSProperties, ReactNode } from 'react';
import * as f from './format';
import s from './Num.module.css';

export type NumFormat = 'int' | 'avg' | 'era' | 'ip' | 'pct' | 'signed' | 'level' | 'roman' | 'man' | 'kr' | 'raw';

export interface NumProps {
  value: number;
  format?: NumFormat;
  /** pct·signed 소수 자리 */
  digits?: number;
  /** xs 12 · s 14 · m 17 · l 22 · xl 30 · xxl 44 · xxxl 56 */
  size?: 'xs' | 's' | 'm' | 'l' | 'xl' | 'xxl' | 'xxxl';
  /** 큰 숫자 서체 (broadcast 는 기울임) */
  display?: boolean;
  /** 색 — signed 면 auto 가 올라감/내려감 색 */
  tone?: 'auto' | 'fg' | 'fg2' | 'fg3' | 'accent' | 'good' | 'bad' | 'gold' | 'up' | 'down';
  /** 뒤에 붙는 작은 단위 (km/h, m, %) */
  unit?: ReactNode;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

/** 숫자 표시 — 모든 숫자는 이걸로 (자리 맞춤 숫자 + 테마 숫자 글꼴) */
export function Num({ value, format = 'raw', digits, size, display, tone = 'auto', unit, className, style, title }: NumProps) {
  let text: string;
  switch (format) {
    case 'int': text = f.int(value); break;
    case 'avg': text = f.avg(value); break;
    case 'era': text = f.era(value); break;
    case 'ip': text = f.ip(value); break;
    case 'pct': text = f.pct(value, digits); break;
    case 'signed': text = f.signed(value, digits); break;
    case 'level': text = f.level(value); break;
    case 'roman': text = f.roman(value); break;
    case 'man': text = f.man(value); break;
    case 'kr': text = f.kr(value); break;
    default: text = String(value);
  }
  const autoTone = tone === 'auto' ? (format === 'signed' ? (value > 0 ? 'up' : value < 0 ? 'down' : 'fg3') : undefined) : tone;
  const cls = [display ? 'num-display' : 'num', s.n, size && s[size], autoTone && s['t-' + autoTone], className].filter(Boolean).join(' ');
  return (
    <span className={cls} style={style} title={title}>
      {text}
      {unit != null && <small className={s.unit}>{unit}</small>}
    </span>
  );
}
