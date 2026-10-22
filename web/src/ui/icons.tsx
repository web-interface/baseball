// 직접 그린 아이콘 — 24 격자, 선 1.7, 끝 둥글게, 색은 currentColor. 이모지 대신 이것만 쓴다.
// 재화 아이콘(GP 동전·골든볼)은 색이 있어서 따로: <CoinGP/> <GoldenBall/>
import { useId, type CSSProperties, type ReactElement } from 'react';
import s from './icons.module.css';

const f2 = (n: number) => Math.round(n * 100) / 100;

/** 톱니 (설정) */
function gear(cx = 12, cy = 12, rOut = 9.2, rIn = 7.2, n = 8) {
  const step = (Math.PI * 2) / n;
  const pt = (r: number, a: number) => `${f2(cx + r * Math.cos(a))} ${f2(cy + r * Math.sin(a))}`;
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = i * step - Math.PI / 2;
    const w1 = step * 0.3, w2 = step * 0.2;
    d += `${i === 0 ? 'M' : 'L'}${pt(rIn, a - w1)}L${pt(rOut, a - w2)}L${pt(rOut, a + w2)}L${pt(rIn, a + w1)}`;
    d += `A${rIn} ${rIn} 0 0 1 ${pt(rIn, a + step - w1)}`;
  }
  return d + 'Z';
}
const GEAR = gear();

const dot = (cx: number, cy: number, r = 1.15) => <circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />;

const ICONS = {
  back: <path d="M15 5 8 12l7 7" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  chevron: <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />,
  'chevron-down': <path d="m5.5 9.5 6.5 6.5 6.5-6.5" />,
  'arrow-up': <path d="M12 19V5.5M6.5 11 12 5.5l5.5 5.5" />,
  'arrow-down': <path d="M12 5v13.5M6.5 13l5.5 5.5 5.5-5.5" />,
  'arrow-right': <path d="M5 12h13.5M13 6.5l5.5 5.5-5.5 5.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  settings: <><path d={GEAR} /><circle cx="12" cy="12" r="2.9" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5" /></>,
  search: <><circle cx="11" cy="11" r="6.2" /><path d="m15.6 15.6 4.4 4.4" /></>,
  info: <><circle cx="12" cy="12" r="8.6" /><path d="M12 11v5.2" />{dot(12, 7.9)}</>,
  alert: <><path d="M10.4 4.6 3.2 17.4A1.8 1.8 0 0 0 4.8 20h14.4a1.8 1.8 0 0 0 1.6-2.6L13.6 4.6a1.8 1.8 0 0 0-3.2 0Z" /><path d="M12 9.5v4.5" />{dot(12, 16.9)}</>,
  refresh: <><path d="M19.6 13.2A7.8 7.8 0 1 1 17.4 6.4" /><path d="M18.4 3.2v3.9h-3.9" /></>,
  swap: <path d="M4.5 8h14l-3.5-3.5M19.5 16h-14l3.5 3.5" />,
  sub: <><path d="M4.5 8h14l-3.5-3.5M19.5 16h-14l3.5 3.5" /></>,
  eye: <><path d="M2.6 12S6.2 5.6 12 5.6 21.4 12 21.4 12 17.8 18.4 12 18.4 2.6 12 2.6 12Z" /><circle cx="12" cy="12" r="2.9" /></>,
  logout: <path d="M14 4.5h4a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-4M10 8l-4 4 4 4M6 12h10" />,
  user: <><circle cx="12" cy="8.2" r="3.6" /><path d="M5 20c.4-3.8 3.3-6.3 7-6.3s6.6 2.5 7 6.3" /></>,
  users: <><circle cx="9" cy="8.6" r="3.2" /><path d="M3 19.5c.3-3.3 2.8-5.5 6-5.5s5.7 2.2 6 5.5" /><path d="M15.2 5.6a3.1 3.1 0 0 1 0 6M17 14.2c2.3.6 3.7 2.5 4 5.3" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  play: <path d="M8 5.6v12.8a.8.8 0 0 0 1.2.7l10-6.4a.8.8 0 0 0 0-1.4l-10-6.4a.8.8 0 0 0-1.2.7Z" />,
  pause: <path d="M8.5 5.5v13M15.5 5.5v13" />,
  fast: <path d="M3.8 6.6v10.8a.6.6 0 0 0 1 .5l7-5.4a.6.6 0 0 0 0-1L4.8 6.1a.6.6 0 0 0-1 .5ZM12.3 6.6v10.8a.6.6 0 0 0 1 .5l7-5.4a.6.6 0 0 0 0-1l-7-5.4a.6.6 0 0 0-1 .5Z" />,
  clock: <><circle cx="12" cy="12" r="8.6" /><path d="M12 7.4V12l3.1 2" /></>,
  calendar: <><rect x="4" y="5.5" width="16" height="14.5" rx="1.6" /><path d="M4 10h16M8.2 3.5v4M15.8 3.5v4" /></>,
  home: <path d="M4 11 12 4.6 20 11M6 9.6V20h12V9.6M10 20v-5.4h4V20" />,

  // 야구
  ball: <><circle cx="12" cy="12" r="8.4" /><path d="M7.5 5.2c1.9 1.7 2.9 4 2.9 6.8s-1 5.1-2.9 6.8M16.5 5.2c-1.9 1.7-2.9 4-2.9 6.8s1 5.1 2.9 6.8" /></>,
  bat: <><path d="M5.2 17.6 15.9 5.3a2.4 2.4 0 0 1 3.4 3.4L6.4 18.8" /><circle cx="4.7" cy="19.3" r="1.3" /></>,
  glove: <><path d="M7.4 20.8c-1.5-1.8-2.3-4-2.5-6.5L3.6 11.5a1.6 1.6 0 0 1 2.6-1.8l1.6 1.9V6.2a1.6 1.6 0 0 1 3.1-.5 1.6 1.6 0 0 1 3.1-.1 1.6 1.6 0 0 1 3 .7 1.6 1.6 0 0 1 2.8 1.1v6.4c0 2.6-.8 5-2.3 7Z" /><path d="M10.9 5.8v5.4M14 5.6v5.6M17 6.4v5.2M7.6 17.9h9.4" /></>,
  base: <path d="M12 4.5 19.5 12 12 19.5 4.5 12Z" />,
  diamond: <><path d="M12 4 20 12l-8 8-8-8Z" /><circle cx="12" cy="12.4" r="1.4" /><path d="M12 4v2.2M20 12h-2.2M4 12h2.2" /></>,
  pitch: <><circle cx="16.4" cy="8" r="3.4" /><path d="M3.8 13.6c3.1-.6 5.9-2.1 8.2-4.2M3.8 18c4-.7 7.6-2.9 10.2-6.1" /></>,
  steal: <><path d="M2.8 9h4.4M2.4 12h5.6M2.8 15h4.4M9.6 12h5" /><path d="m12.2 9.6 2.4 2.4-2.4 2.4" /><path d="M19.2 9.4 21.8 12l-2.6 2.6-2.6-2.6Z" /></>,
  bunt: <><path d="M3.5 11.4h11.6a2 2 0 0 1 0 4H3.5a2 2 0 0 1 0-4Z" /><circle cx="18.6" cy="7.4" r="2.2" /><path d="M2.6 12.3v2.2" /></>,
  helmet: <path d="M4 15.5C4 10.8 7.4 7.4 12 7.4s8 3.4 8 8.1v1.6H9.5M20 17.1h1.4a1 1 0 0 0 1-1.2l-.4-1.4M4 15.5v1.6h5.5V13.5" />,
  stadium: <><path d="M3 19c.6-5.6 4.4-9.5 9-9.5s8.4 3.9 9 9.5M3 19h18M8 19c.5-2.6 2-4.2 4-4.2s3.5 1.6 4 4.2" /><path d="M4.5 4v5M19.5 4v5M3.2 4h2.6M18.2 4h2.6" /></>,

  // 날씨
  sun: <><circle cx="12" cy="12" r="3.9" /><path d="M12 3.2v2M12 18.8v2M3.2 12h2M18.8 12h2M5.8 5.8l1.4 1.4M16.8 16.8l1.4 1.4M5.8 18.2l1.4-1.4M16.8 7.2l1.4-1.4" /></>,
  moon: <path d="M18.6 14.6A7.2 7.2 0 0 1 9.4 5.4a7.4 7.4 0 1 0 9.2 9.2Z" />,
  cloud: <path d="M7.2 18.2a4.2 4.2 0 0 1-.5-8.4 5.6 5.6 0 0 1 10.8 1.6 3.4 3.4 0 0 1-.2 6.8Z" />,
  rain: <><path d="M7.2 14.6a4.2 4.2 0 0 1-.5-8.4 5.6 5.6 0 0 1 10.8 1.6 3.4 3.4 0 0 1-.2 6.8Z" /><path d="m8.4 17.4-.9 2.2M12.2 17.4l-.9 2.2M16 17.4l-.9 2.2" /></>,
  wind: <path d="M3 9.2h10.6a2.6 2.6 0 1 0-2.6-2.6M3 13h15.4a2.6 2.6 0 1 1-2.6 2.6M3 16.8h6.6" />,
  temp: <><path d="M10 13.8V5a2 2 0 0 1 4 0v8.8a4 4 0 1 1-4 0Z" /><path d="M12 9v7" /></>,
  humidity: <path d="M12 3.6c3.3 4 5.6 7.1 5.6 10a5.6 5.6 0 0 1-11.2 0c0-2.9 2.3-6 5.6-10Z" />,
  dust: <>{dot(6, 8, 1.2)}{dot(11.2, 5.6, 1)}{dot(16.6, 8.4, 1.3)}{dot(8.4, 13, 1)}{dot(13.8, 12.4, 1.2)}{dot(19, 13.4, 1)}{dot(6.4, 18, 1.1)}{dot(11.4, 18.6, 1.3)}{dot(16.8, 17.6, 1)}</>,

  // 게임
  card: <><rect x="7" y="3.6" width="11.6" height="16.8" rx="1.6" /><path d="M5.2 6.2v12.4a1.6 1.6 0 0 0 1.6 1.6" /></>,
  pack: <><path d="M6 4.2 7.5 5.6 9 4.2l1.5 1.4L12 4.2l1.5 1.4L15 4.2l1.5 1.4L18 4.2v15.6l-1.5-1.4-1.5 1.4-1.5-1.4-1.5 1.4-1.5-1.4L9 19.8l-1.5-1.4L6 19.8Z" /><circle cx="12" cy="12" r="2.8" /></>,
  shop: <><path d="M4.2 9 5.6 4.5h12.8L19.8 9" /><path d="M4.2 9a2.6 2.6 0 0 0 5.2 0 2.6 2.6 0 0 0 5.2 0 2.6 2.6 0 0 0 5.2 0" /><path d="M5.6 11.6V20h12.8v-8.4M10 20v-4.6h4V20" /></>,
  versus: <><path d="M5 4.5 17.6 17.1M19 4.5 6.4 17.1" /><path d="m15.6 19.1 4-4M8.4 19.1l-4-4" /></>,
  trophy: <><path d="M8 4h8v5.4a4 4 0 0 1-8 0Z" /><path d="M8 6H5.4a2.6 2.6 0 0 0 2.8 3.4M16 6h2.6a2.6 2.6 0 0 1-2.8 3.4M12 13.4v3.4M8.6 20h6.8M9.6 16.8h4.8V20H9.6Z" /></>,
  crown: <><path d="m4 8.4 4 3.8 4-6 4 6 4-3.8-1.6 9.4H5.6Z" /><path d="M5.6 20.2h12.8" /></>,
  laurel: <><path d="M11 20.2c-3.9-.8-6.6-4.4-6.6-8.8 0-1.9.5-3.6 1.4-5" /><path d="M13 20.2c3.9-.8 6.6-4.4 6.6-8.8 0-1.9-.5-3.6-1.4-5" /><path d="M5.2 15.4c-1.6.2-2.7-.6-3.2-2 1.5-.4 2.7.2 3.2 2ZM4.4 11.2c-1.5-.4-2.2-1.5-2.2-3 1.5.1 2.4 1.1 2.2 3ZM5.8 7.4c-1.2-.9-1.5-2.2-1-3.6 1.3.6 1.8 1.9 1 3.6ZM8 18.4c-1.4.8-2.8.6-3.9-.4 1.3-.9 2.6-.8 3.9.4ZM18.8 15.4c1.6.2 2.7-.6 3.2-2-1.5-.4-2.7.2-3.2 2ZM19.6 11.2c1.5-.4 2.2-1.5 2.2-3-1.5.1-2.4 1.1-2.2 3ZM18.2 7.4c1.2-.9 1.5-2.2 1-3.6-1.3.6-1.8 1.9-1 3.6ZM16 18.4c1.4.8 2.8.6 3.9-.4-1.3-.9-2.6-.8-3.9.4Z" /></>,
  star: <path d="m12 3.8 2.5 5.2 5.7.8-4.2 3.9 1.1 5.6L12 16.6l-5.1 2.7L8 13.7 3.8 9.8l5.7-.8Z" />,
  chart: <path d="M4 18.5 9 12.6l3.8 3 7.2-8.6M4 4.5v14h16" />,
  lineup: <><path d="M12 4 20 12l-8 8-8-8Z" /><path d="M8.6 12h6.8M12 8.6v6.8" opacity=".55" /></>,
  bolt: <path d="M13.4 3.2 5.6 13.4h5.6l-1 7.4 7.8-10.2h-5.6Z" />,
  flame: <path d="M12 21c-3.6 0-6.2-2.5-6.2-6 0-3.2 2.2-5.1 3.6-7.5.6 1.7 1.6 2.6 2.7 3 .2-2.6 1.4-5.2 3.4-7.2.2 3.1 2.7 5.4 2.7 9.8 0 4.6-2.6 7.9-6.2 7.9Z" />,
  shield: <path d="M12 3.6 19 6.2v5.4c0 4.4-2.9 7.6-7 8.8-4.1-1.2-7-4.4-7-8.8V6.2Z" />,
  sparkline: <path d="M3 15.5 7 11l3 2.6 4.2-6 3 3.4 3.8-4.5" />,
} satisfies Record<string, ReactElement>;

export type IconName = keyof typeof ICONS;
export const ICON_NAMES = Object.keys(ICONS) as IconName[];

export interface IconProps {
  name: IconName;
  size?: number;
  stroke?: number;
  className?: string;
  style?: CSSProperties;
  /** 글자 없이 아이콘만 있을 때 읽어 줄 이름 */
  label?: string;
}

export function Icon({ name, size = 20, stroke = 1.7, className, style, label }: IconProps) {
  return (
    <svg
      className={[s.icon, className].filter(Boolean).join(' ')}
      style={style}
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
      {ICONS[name]}
    </svg>
  );
}

/** GP 동전 (경기 보상 재화) */
export function CoinGP({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg className={[s.icon, className].filter(Boolean).join(' ')} width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r="7.2" fill="var(--coin)" />
      <circle cx="8" cy="8" r="7.2" fill="none" stroke="var(--coin-edge)" strokeWidth=".8" opacity=".55" />
      <circle cx="8" cy="8" r="4.8" fill="none" stroke="var(--coin-edge)" strokeWidth="1.1" />
      <path d="M9.6 6.6A1.9 1.9 0 0 0 6.2 8a1.9 1.9 0 0 0 3.5 1.1V8.3H8.2" fill="none" stroke="var(--coin-edge)" strokeWidth="1.05" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 골든볼 (귀한 재화) */
export function GoldenBall({ size = 16, className }: { size?: number; className?: string }) {
  const id = 'gb' + useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <svg className={[s.icon, className].filter(Boolean).join(' ')} width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <defs>
        <radialGradient id={id} cx=".36" cy=".32" r=".8">
          <stop offset="0" stopColor="#FFF3C9" />
          <stop offset=".45" stopColor="var(--goldball)" />
          <stop offset="1" stopColor="#A87A22" />
        </radialGradient>
      </defs>
      <circle cx="8" cy="8" r="7.2" fill={`url(#${id})`} />
      <path d="M4.3 2.6c1.5 1.4 2.3 3.2 2.3 5.4s-.8 4-2.3 5.4M11.7 2.6C10.2 4 9.4 5.8 9.4 8s.8 4 2.3 5.4" fill="none" stroke="var(--goldball-seam)" strokeWidth=".95" strokeLinecap="round" />
    </svg>
  );
}
