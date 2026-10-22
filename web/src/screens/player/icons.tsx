// 선수 화면 전용 선 아이콘 — 공용 Icon 과 같은 규칙(24 격자 · 선 1.7 · 끝 둥글게 · currentColor).
// 공용에 없는 장비 슬롯 · 플레이스타일 · 컨디션 화살표. (쓸 만하면 기반 담당에게 ui/icons 로 올려 달라고 요청)
import type { CSSProperties, ReactElement } from 'react';
import type { PitchType } from '../../game/types';

const P = {
  // 장비
  spikes: <><path d="M3.4 15.6c0-2.5 1.6-4.3 3.8-5.1l2.5-.9 2.1-3.4h3.6l.4 3.1c1 1 2.5 1.7 4.4 2.1 1.3.3 2.3 1.4 2.3 2.7v1.5Z" /><path d="M6.2 15.6v2.4M10.2 15.6v2.4M14.2 15.6v2.4M18.2 15.6v2.4" /></>,
  bgloves: <><path d="M8.2 20.6v-6.4L5.6 11a1.4 1.4 0 0 1 2.1-1.9l1.9 1.9V5.4a1.3 1.3 0 0 1 2.6 0V10V4.6a1.3 1.3 0 0 1 2.6 0V10V5.6a1.3 1.3 0 0 1 2.6 0V11 8a1.3 1.3 0 0 1 2.6 0v6c0 3.7-2.5 6.6-6.1 6.6Z" /><path d="M8.2 17.4h8" /></>,
  wrist: <><path d="M6 8.8c0-1.4 2.7-2.6 6-2.6s6 1.2 6 2.6v6.4c0 1.4-2.7 2.6-6 2.6s-6-1.2-6-2.6Z" /><path d="M6 8.8c0 1.4 2.7 2.6 6 2.6s6-1.2 6-2.6M6 12.4c0 1.4 2.7 2.6 6 2.6s6-1.2 6-2.6" /></>,
  guard: <><path d="M2.8 9.2h8.4a2.6 2.6 0 0 1 2.6 2.6v8.8" /><path d="M9 5.6h5.4a3 3 0 0 1 3 3v5.2l-2.6 1.8H9Z" /><path d="M11.6 8.6h3.2M11.6 11.2h3.2" /></>,
  cap: <><path d="M3.8 14.6c0-4.5 3.4-7.8 7.9-7.8s7.5 3.2 7.5 7.6v.2Z" /><path d="M19.2 14.6h1.5c.9 0 1.4 1 .8 1.7l-.4.5H9.6" /><path d="M11.7 6.8V5.6M8.2 8.1c-.9 1.8-1.3 4-1.2 6.5" /></>,
  shirt: <path d="M8.6 4.4 4.2 6.8v7.4l2.6.5v5.5h10.4v-5.5l2.6-.5V6.8l-4.4-2.4c-.7 1.3-2 2.1-3.4 2.1s-2.7-.8-3.4-2.1Z" />,
  // 플레이스타일
  contact: <><circle cx="12" cy="12" r="8.2" /><circle cx="12" cy="12" r="4.4" /><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" /></>,
  power: <><path d="M4.5 18.5 10 13l3 3 6.5-6.5" /><path d="M14.6 9.5h4.9v4.9" /></>,
  speed: <path d="M4.5 6.8 9.7 12l-5.2 5.2M11.6 6.8l5.2 5.2-5.2 5.2" />,
  eye: <><path d="M2.6 12S6.2 5.6 12 5.6 21.4 12 21.4 12 17.8 18.4 12 18.4 2.6 12 2.6 12Z" /><circle cx="12" cy="12" r="2.9" /></>,
  glove: <><path d="M7.4 20.8c-1.5-1.8-2.3-4-2.5-6.5L3.6 11.5a1.6 1.6 0 0 1 2.6-1.8l1.6 1.9V6.2a1.6 1.6 0 0 1 3.1-.5 1.6 1.6 0 0 1 3.1-.1 1.6 1.6 0 0 1 3 .7 1.6 1.6 0 0 1 2.8 1.1v6.4c0 2.6-.8 5-2.3 7Z" /><path d="M7.6 17.9h9.4" /></>,
  arm: <><circle cx="17.4" cy="8.4" r="3" /><path d="M3 12.6h7.4M5 16.4h8M7.4 8.8h5" /></>,
  fire: <><path d="M3.6 18.4 16.2 8.6" strokeWidth="2.6" /><circle cx="18.4" cy="7" r="2.4" /></>,
  curve: <><path d="M3.6 6.4c6.4.2 11 3.6 13.4 9.6" /><circle cx="17.8" cy="18.2" r="2.2" /></>,
  aim: <><rect x="6" y="5" width="12" height="14" rx=".6" /><path d="M10 5v14M14 5v14M6 9.7h12M6 14.3h12" opacity=".5" /><circle cx="14" cy="14.3" r="1.6" fill="currentColor" stroke="none" /></>,
  stamina: <><rect x="3.4" y="7.4" width="15.6" height="9.2" rx="1.6" /><path d="M21 10.4v3.2M6.6 10.4v3.2M9.8 10.4v3.2M13 10.4v3.2" /></>,
  heart: <path d="M2.8 12.4h4.1l2.1-5.2 3.6 10.2 2.6-6.4 1.5 2.9h4.5" />,
  // 기타
  arrow: <path d="M4.5 12h14M13.5 7l5 5-5 5" />,
  lock: <><rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5" /></>,
  swap: <path d="M4.5 8h14l-3.5-3.5M19.5 16h-14l3.5 3.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  bat: <><path d="M5.2 17.6 15.9 5.3a2.4 2.4 0 0 1 3.4 3.4L6.4 18.8" /><circle cx="4.7" cy="19.3" r="1.3" /></>,
  helmet: <path d="M4 15.5C4 10.8 7.4 7.4 12 7.4s8 3.4 8 8.1v1.6H9.5M20 17.1h1.4a1 1 0 0 0 1-1.2l-.4-1.4M4 15.5v1.6h5.5V13.5" />,
} satisfies Record<string, ReactElement>;

export type LocalIconName = keyof typeof P;

export function LIcon({ name, size = 20, stroke = 1.7, className, style, label }: { name: LocalIconName; size?: number; stroke?: number; className?: string; style?: CSSProperties; label?: string }) {
  return (
    <svg
      className={className}
      style={{ display: 'block', flex: 'none', ...style }}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {P[name]}
    </svg>
  );
}

/** 컨디션 화살표 — 5 최상(↑) … 1 최악(↓). 색은 부모가 */
export function CondArrow({ v, size = 16, className }: { v: 1 | 2 | 3 | 4 | 5; size?: number; className?: string }) {
  const rot = { 5: -90, 4: -45, 3: 0, 2: 45, 1: 90 }[v];
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: 'block', flex: 'none' }}>
      <g transform={`rotate(${rot} 12 12)`}><path d="M4.5 12h14M13 6.5l5.5 5.5-5.5 5.5" /></g>
    </svg>
  );
}

/** 구종 궤적 — 투수 손(왼쪽 위) → 홈플레이트(오른쪽). 고유 구종 배지·구종표에 쓴다 */
export function PitchPath({ type, color, w = 92, h = 46, tail = true, className }: { type: PitchType; color: string; w?: number; h?: number; tail?: boolean; className?: string }) {
  // 0..100 x 0..50 좌표
  const D: Record<PitchType, string> = {
    FF: 'M6 16 C 40 17, 70 18, 94 20',
    SI: 'M6 16 C 42 17, 72 22, 94 30',
    FC: 'M6 16 C 46 17, 76 19, 94 25',
    SL: 'M6 16 C 46 15, 70 18, 94 32',
    SW: 'M6 14 C 40 10, 74 16, 94 34',
    CU: 'M6 10 C 30 0, 64 6, 94 42',
    CH: 'M6 16 C 44 16, 74 22, 94 36',
    FS: 'M6 16 C 52 15, 78 20, 94 42',
    KN: 'M6 16 C 24 10, 34 26, 50 18 S 74 10, 94 30',
  };
  const end = { FF: [94, 20], SI: [94, 30], FC: [94, 25], SL: [94, 32], SW: [94, 34], CU: [94, 42], CH: [94, 36], FS: [94, 42], KN: [94, 30] }[type];
  return (
    <svg className={className} width={w} height={h} viewBox="0 0 100 50" fill="none" aria-hidden style={{ display: 'block', flex: 'none', overflow: 'visible' }}>
      {/* 존 (오른쪽 끝) */}
      <rect x="88" y="14" width="10" height="28" stroke="currentColor" strokeOpacity=".28" strokeWidth="1" />
      {tail && <path d={D[type]} stroke={color} strokeOpacity=".22" strokeWidth="7" strokeLinecap="round" />}
      <path d={D[type]} stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeDasharray={type === 'KN' ? '0' : undefined} />
      <circle cx={end[0]} cy={end[1]} r="3.4" fill={color} />
      <circle cx="6" cy={type === 'CU' ? 10 : type === 'SW' ? 14 : 16} r="2" fill="currentColor" fillOpacity=".5" />
    </svg>
  );
}
