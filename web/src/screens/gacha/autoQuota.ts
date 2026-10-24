// 자동 열기 한도 — 리그 단계(연습생 → 레전드)가 오를수록 한 번에 자동으로 열 수 있는 카드가 늘어난다. 사용자 지시 10-24
//  "초반엔 600장 정도 · 쿨타임 1분 · 마지막엔 다 갈 수 있게, 리그 단계에 따라 나눠"
//  · 연습생 600장(20팩) · 2군 1,500장 · 1군 3,000장 · 올스타 6,000장 · 국가대표 15,000장 · 레전드는 한도 없이(보관함 상한까지)
//  · 한도를 다 쓰면 1분 쉬고 다시 가득 — 'N팩 자동 열기' · '계속 열기'가 같은 한도를 쓴다 (한 팩씩 여는 '30장 열기'는 상관없음)
//  · 이 기기에 저장 (localStorage 'bb.autoQuota') — 보관함 · 지갑처럼 이 브라우저 기준
import { useEffect, useState, useSyncExternalStore } from 'react';
import { LEVELS, LEVEL_KO, aiLevel, useLeague, type AiLevel } from '../../season/league';

export const AUTO_COOLDOWN_MS = 60_000;
export const AUTO_QUOTA: Record<AiLevel, number> = { trainee: 600, futures: 1_500, first: 3_000, allstar: 6_000, national: 15_000, legend: Infinity };

const KEY = 'bb.autoQuota';
interface Q { used: number; until: number }
const listeners = new Set<() => void>();
let q: Q = load();

function load(): Q {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Q> | null;
    if (v && Number.isFinite(v.used) && Number.isFinite(v.until)) return { used: Math.max(0, v.used!), until: Math.max(0, v.until!) };
  } catch { /* 처음 */ }
  return { used: 0, until: 0 };
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(q)); } catch { /* 저장을 못 해도 이 탭에선 센다 */ }
  listeners.forEach((l) => l());
}

export interface QuotaView {
  level: AiLevel;
  /** 이 단계 한도 (장) — 레전드는 Infinity */
  quota: number;
  /** 지금 남은 장수 — 쉬는 중이면 0, 레전드는 Infinity */
  left: number;
  cooling: boolean;
  /** 쉬는 시간이 끝나는 때 (ms) */
  until: number;
  unlimited: boolean;
}
/** 지금 한도 (읽기만 — 쉬는 시간이 지났으면 가득으로 본다) */
export function quotaView(level: AiLevel = aiLevel(), now = Date.now()): QuotaView {
  const quota = AUTO_QUOTA[level];
  const unlimited = !Number.isFinite(quota);
  const over = q.until > 0 && now >= q.until;
  const cooling = !unlimited && !over && q.until > now;
  const used = over ? 0 : q.used;
  return { level, quota, left: unlimited ? Infinity : cooling ? 0 : Math.max(0, quota - used), cooling, until: q.until, unlimited };
}
/** 한도 안에서 자동으로 열 수 있는 팩 수 */
export const quotaPacks = (packSize: number, v: QuotaView = quotaView()) => (v.left === Infinity ? Infinity : Math.floor(v.left / packSize));

/** 자동으로 연 만큼 쓰기 — 남은 한도가 한 팩보다 적어지면 그때부터 1분 쉬기 */
export function spendQuota(cards: number, packSize: number, level: AiLevel = aiLevel()) {
  const quota = AUTO_QUOTA[level];
  if (!Number.isFinite(quota) || cards <= 0) return;
  const now = Date.now();
  if (q.until > 0 && now >= q.until) q = { used: 0, until: 0 };
  q = { ...q, used: q.used + cards };
  if (quota - q.used < packSize) q = { used: quota, until: now + AUTO_COOLDOWN_MS };
  save();
}

/** 화면용 — 한도 바뀜 · 쉬는 동안 1초마다 다시 그림 */
export function useAutoQuota(): QuotaView {
  const L = useLeague();
  useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => q);
  const [now, setNow] = useState(() => Date.now());
  const v = quotaView(L.level, Date.now());
  useEffect(() => {
    if (!v.cooling) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [v.cooling, v.until]);
  void now;
  return v;
}

/** 남은 쉬는 시간 'm:ss' */
export function coolText(v: QuotaView, now = Date.now()): string {
  const sec = Math.max(0, Math.ceil((v.until - now) / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
/** 다음 단계 한도 — 레전드면 null */
export function nextQuota(level: AiLevel): { level: AiLevel; ko: string; quota: number } | null {
  const i = LEVELS.indexOf(level);
  const up = LEVELS[i + 1];
  return up ? { level: up, ko: LEVEL_KO[up], quota: AUTO_QUOTA[up] } : null;
}
export const quotaKo = (n: number) => (Number.isFinite(n) ? `${n.toLocaleString()}장` : '한도 없음');
