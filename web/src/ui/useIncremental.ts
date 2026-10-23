// 긴 목록을 조금씩 — 처음 step 개만 그리고, 목록 끝 표시(sentinel)가 화면 가까이 오면 step 개씩 더 그린다.
// 카드 수천 장(보관함 · 선수조합 재료)이어도 처음 화면이 가볍게. resetKey(거르기 · 정렬 · 탭)가 바뀌면 처음부터.
// IntersectionObserver 가 없는 브라우저는 전부 그린다(예전처럼).
import { useEffect, useRef, useState } from 'react';

export function useIncremental<T>(list: T[], step = 60, resetKey?: unknown) {
  const ok = typeof IntersectionObserver !== 'undefined';
  const [n, setN] = useState(step);
  const ref = useRef<HTMLLIElement | null>(null);
  useEffect(() => { setN(step); }, [resetKey, step]);
  useEffect(() => {
    const el = ref.current;
    if (!ok || !el || n >= list.length) return;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) setN((x) => Math.min(list.length, x + step));
    }, { rootMargin: '900px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [ok, n, list.length, step]);
  const shown = ok ? list.slice(0, n) : list;
  return { shown, more: ok && n < list.length, left: Math.max(0, list.length - n), sentinelRef: ref };
}
