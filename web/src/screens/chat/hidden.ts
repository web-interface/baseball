// 내 화면에서 숨긴 감독 — 이 브라우저(localStorage 'bb.chat.hidden')에만 둔다. 서버는 모른다.
import { useMemo, useSyncExternalStore } from 'react';

export interface HiddenUser { uid: number; name: string }

const KEY = 'bb.chat.hidden';
const MAX = 500;

function load(): HiddenUser[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]') as unknown;
    if (!Array.isArray(v)) return [];
    return v
      .filter((x): x is HiddenUser => !!x && Number.isInteger((x as HiddenUser).uid) && typeof (x as HiddenUser).name === 'string')
      .slice(-MAX);
  } catch { return []; }
}

let list: HiddenUser[] = load();
const ls = new Set<() => void>();
const emit = () => ls.forEach((l) => l());
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* 저장이 막혀 있으면 이번 방문만 */ }
  emit();
}

// 다른 탭에서 바꾸면 따라간다
window.addEventListener('storage', (e) => { if (e.key === KEY) { list = load(); emit(); } });

export const hiddenUsers = {
  subscribe(l: () => void) { ls.add(l); return () => { ls.delete(l); }; },
  get: () => list,
  hide(uid: number, name: string) {
    if (!uid || list.some((x) => x.uid === uid)) return;
    list = [...list, { uid, name }].slice(-MAX);
    save();
  },
  show(uid: number) {
    list = list.filter((x) => x.uid !== uid);
    save();
  },
};

export function useHidden() {
  const l = useSyncExternalStore(hiddenUsers.subscribe, hiddenUsers.get);
  const set = useMemo(() => new Set(l.map((x) => x.uid)), [l]);
  return { list: l, set };
}
