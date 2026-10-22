// 경기 화면 작은 도우미 — 움직임 줄이기 · 기기 저장(try/catch)
import { useEffect, useState } from 'react';

const RM = '(prefers-reduced-motion: reduce)';

export function useReducedMotion() {
  const [r, setR] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(RM).matches);
  useEffect(() => {
    const m = window.matchMedia?.(RM);
    if (!m) return;
    const on = () => setR(m.matches);
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, []);
  return r;
}

export const store = {
  get(k: string): string | null {
    try { return localStorage.getItem(k); } catch { return null; }
  },
  set(k: string, v: string) {
    try { localStorage.setItem(k, v); } catch { /* 사생활 보호 모드 — 이번만 */ }
  },
};

/** 설정 화면이 쓰는 '경기 보기 방식' 기본값 키 (설정 담당과 같이 씀 — 공용으로 옮겨 달라고 보고) */
export const VIEW_KEY = 'bb.matchView';
/** 이 경기를 끝까지 봤는지 */
export const seenKey = (id: string) => `bb.match.seen.${id}`;
