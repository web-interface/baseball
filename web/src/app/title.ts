// 화면이 헤더 제목을 바꾸는 법 — useScreenTitle('표건우', '중견수 · 독수리스')
// 화면이 사라지면 원래 제목(routes.ts 의 title)으로 돌아간다.
import { useEffect, useSyncExternalStore, type ReactNode } from 'react';

interface T { title: ReactNode; sub?: ReactNode }
let cur: T | null = null;
const ls = new Set<() => void>();
const set = (t: T | null) => { cur = t; ls.forEach((l) => l()); };

export function useScreenTitle(title: ReactNode | null | undefined, sub?: ReactNode) {
  useEffect(() => {
    if (title == null) return;
    set({ title, sub });
    return () => set(null);
  }, [title, sub]);
}

export function useTitleOverride(): T | null {
  return useSyncExternalStore((l) => { ls.add(l); return () => { ls.delete(l); }; }, () => cur);
}
