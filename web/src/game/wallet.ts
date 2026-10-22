// 지갑 — 헤더·뽑기·상점이 같이 쓰는 재화 (목업: 이 탭이 열린 동안만. 서버가 붙으면 서버 값으로)
import { useSyncExternalStore } from 'react';
import { ME } from './mock';

export interface Wallet { gp: number; ball: number }

let current: Wallet = { gp: ME.gp, ball: ME.ball };
const listeners = new Set<() => void>();

export const readWallet = (): Wallet => current;

/** 값 쓰기 — 모자라면 false (아무것도 안 바꿈) */
export function spend(cost: { gp?: number; ball?: number }): boolean {
  const gp = cost.gp ?? 0, ball = cost.ball ?? 0;
  if (current.gp < gp || current.ball < ball) return false;
  current = { gp: current.gp - gp, ball: current.ball - ball };
  listeners.forEach((l) => l());
  return true;
}

export function useWallet(): Wallet {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => current,
  );
}
