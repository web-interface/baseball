// React 로 쓰기 — 경기장(position: relative) 안에 한 줄:
//   {hr && <HomerunFx info={hr} length={mode === 'quick' ? 'short' : 'long'} onDone={() => setHr(null)} />}
// 같은 info 로 다시 그려도 다시 시작하지 않는다 (info 내용이 바뀌면 새로 재생).
import { useEffect, useRef, type CSSProperties } from 'react';
import { playHomerunFx } from './player';
import type { HomerunInfo, HrLength, HrTheme } from './types';

export interface HomerunFxProps {
  info: HomerunInfo;
  /** short = 빨리 보기(0.8~1.2초) · long = 주요 장면·자세히(2~4초) — 기본 long */
  length?: HrLength;
  /** 만루 세리머니 (long 에서만) — 기본 true */
  ceremony?: boolean;
  /** 눌러서 건너뛰기 — 기본 true */
  skippable?: boolean;
  /** 경기장 흔들기 — 기본 true (이 부품을 감싼 요소를 흔든다) */
  shake?: boolean;
  /** 테마 강제 (기본: 화면 테마) */
  theme?: HrTheme;
  /** 움직임 줄이기 강제 (기본: 기기 설정 prefers-reduced-motion) */
  reducedMotion?: boolean;
  onDone?: () => void;
  className?: string;
  style?: CSSProperties;
}

const HOST: CSSProperties = { position: 'absolute', inset: 0, zIndex: 6, pointerEvents: 'none' };

export function HomerunFx({ info, length = 'long', ceremony = true, skippable = true, shake = true, theme, reducedMotion, onDone, className, style }: HomerunFxProps) {
  const ref = useRef<HTMLDivElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const key = JSON.stringify([info, length, ceremony, skippable, shake, theme, reducedMotion]);
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const h = playHomerunFx(host, info, {
      length, ceremony, skippable, theme, reducedMotion,
      shake: shake ? host.parentElement ?? true : false,
      onDone: () => doneRef.current?.(),
    });
    return () => h.stop();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={ref} className={className} style={{ ...HOST, ...style }} />;
}
