// 이 기기에 기억하는 설정 — 경기 보기 방식 · 강조 문구 흔들림 · 소리.
// localStorage 를 쓰되 막혀 있으면(사생활 보호 모드) 이번 방문 동안만 기억한다. 모든 읽기·쓰기는 try/catch.
// 다른 화면(경기·홈)도 같은 값을 읽는다: import { useWatchMode, paceOf } from '../settings/prefs'
// (공용으로 옮길 때는 app/prefs.ts 로 — 마지막 보고에 적어 둠)
import { useSyncExternalStore } from 'react';
import type { CalloutPace } from '../../ui';

/** 경기 보기 방식 — 기본 빨리 보기 (요구 16) */
export type WatchMode = 'quick' | 'key' | 'inning' | 'detail';

export interface WatchInfo {
  id: WatchMode;
  ko: string;
  /** 얼마나 걸리나 */
  time: string;
  desc: string;
  /** 1~9회 중 화면에 머무는 비율 (그림용) */
  dwell: number[];
}

export const WATCH_MODES: WatchInfo[] = [
  { id: 'quick', ko: '빨리 보기', time: '10초 안', desc: '1~9회를 감아 결과까지. 명장면 자막은 그대로 떠요.', dwell: [1, 1, 1, 1, 1, 1, 1, 1, 1] },
  { id: 'key', ko: '주요 장면', time: '30초 안팎', desc: '승리 확률이 크게 바뀐 순간만 골라 2D 로 짧게.', dwell: [0, 0, 1, 0, 2, 1, 3, 3, 4] },
  { id: 'inning', ko: '이닝별', time: '이닝마다 멈춤', desc: '한 이닝씩 요약을 보고 다음 이닝으로 넘겨요.', dwell: [2, 2, 2, 2, 2, 2, 2, 2, 2] },
  { id: 'detail', ko: '자세히 보기', time: '공 하나하나', desc: '2D 로 공 하나하나. 대타·작전 지시는 여기서만 돼요.', dwell: [4, 4, 4, 4, 4, 4, 4, 4, 4] },
];

const isWatch = (v: unknown): v is WatchMode => v === 'quick' || v === 'key' || v === 'inning' || v === 'detail';

/** 강조 문구 빠르기 — 보기 방식에 맞춘다 */
export const paceOf = (m: WatchMode): CalloutPace => (m === 'quick' ? 'quick' : m === 'detail' ? 'slow' : 'normal');

export interface SoundPrefs {
  /** 0~10 */
  bgm: number;
  cheer: number;
  sfx: number;
  mute: boolean;
}

export interface Prefs {
  watch: WatchMode;
  /** 강조 문구 때 화면 흔들림 */
  shake: boolean;
  sound: SoundPrefs;
}

const KEY = 'bb.prefs';
const DEFAULTS: Prefs = { watch: 'quick', shake: true, sound: { bgm: 6, cheer: 8, sfx: 7, mute: false } };

function read(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const v = JSON.parse(raw) as Partial<Prefs>;
    return {
      watch: isWatch(v.watch) ? v.watch : DEFAULTS.watch,
      shake: typeof v.shake === 'boolean' ? v.shake : DEFAULTS.shake,
      sound: { ...DEFAULTS.sound, ...(v.sound ?? {}) },
    };
  } catch {
    return DEFAULTS;
  }
}

let current: Prefs = read();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) { current = read(); emit(); }
  });
}

export function setPrefs(patch: Partial<Prefs>) {
  current = { ...current, ...patch, sound: { ...current.sound, ...(patch.sound ?? {}) } };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* 이번 방문만 */ }
  emit();
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => current,
    () => DEFAULTS,
  );
}

export function useWatchMode(): [WatchMode, (m: WatchMode) => void] {
  const p = usePrefs();
  return [p.watch, (m) => setPrefs({ watch: m })];
}
