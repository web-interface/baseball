// 라인업 화면 작은 훅 — 숫자 세기, 움직임 줄이기, 줄 바뀜 애니메이션(FLIP)
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

export const prefersReduced = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** 숫자가 목표값까지 세어 올라가거나 내려간다 (정수) */
export function useTween(target: number, ms = 420) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  const cur = useRef(target);
  useEffect(() => {
    if (prefersReduced() || ms <= 0) { cur.current = target; setV(target); return; }
    from.current = cur.current;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const e = 1 - (1 - k) ** 3;
      const x = Math.round(from.current + (target - from.current) * e);
      cur.current = x;
      setV(x);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/** 값이 바뀌면 잠깐 차이를 보여 준다 (+2 · −1) */
export function useDelta(value: number, holdMs = 2200) {
  const prev = useRef(value);
  const [d, setD] = useState<{ v: number; n: number } | null>(null);
  useEffect(() => {
    const diff = value - prev.current;
    prev.current = value;
    if (!diff) return;
    setD({ v: diff, n: Date.now() });
    const t = window.setTimeout(() => setD(null), holdMs);
    return () => window.clearTimeout(t);
  }, [value, holdMs]);
  return d;
}

/**
 * 줄이 자리를 바꾸면 원래 자리에서 미끄러져 온다 (FLIP).
 * 목록 안 [data-flip="키"] 요소를 렌더마다 재서 비교한다.
 */
export function useFlip(ref: RefObject<HTMLElement | null>, deps: unknown[]) {
  const last = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const host = ref.current;
    if (!host) return;
    const els = host.querySelectorAll<HTMLElement>('[data-flip]');
    const now = new Map<string, number>();
    const top0 = host.getBoundingClientRect().top;
    els.forEach((el) => now.set(el.dataset.flip!, el.getBoundingClientRect().top - top0));
    if (!prefersReduced()) {
      els.forEach((el) => {
        const before = last.current.get(el.dataset.flip!);
        const after = now.get(el.dataset.flip!)!;
        if (before == null || Math.abs(before - after) < 1) return;
        el.animate?.([{ transform: `translateY(${before - after}px)` }, { transform: 'translateY(0)' }], { duration: 320, easing: 'cubic-bezier(.2,.7,.2,1)' });
      });
    }
    last.current = now;
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}
