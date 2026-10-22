// 해시 라우터 — GitHub Pages(/baseball/)에서 새로고침해도 안 깨지게 #/경로?쿼리
import { useSyncExternalStore, type AnchorHTMLAttributes, type ReactNode } from 'react';

export interface Loc {
  /** '/player/p03' */
  path: string;
  query: URLSearchParams;
}

function read(): Loc {
  const h = location.hash.replace(/^#/, '');
  const i = h.indexOf('?');
  let path = (i >= 0 ? h.slice(0, i) : h) || '/';
  if (!path.startsWith('/')) path = '/' + path;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return { path, query: new URLSearchParams(i >= 0 ? h.slice(i + 1) : '') };
}

let current = read();
let lastHash = location.hash;
const listeners = new Set<() => void>();
/** 앱 안에서 몇 번 들어왔나 — 0 이면 '뒤로'가 사이트 밖으로 나가지 않게 */
let depth = 0;

function emit() {
  if (location.hash === lastHash) return;
  lastHash = location.hash;
  current = read();
  listeners.forEach((l) => l());
}
window.addEventListener('hashchange', emit);
window.addEventListener('popstate', emit);

export function useLocation(): Loc {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => current,
  );
}

/** 이동 — navigate('/player/p03') */
export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const hash = '#' + (to.startsWith('/') ? to : '/' + to);
  if (hash === location.hash) return;
  if (opts.replace) {
    history.replaceState(history.state, '', hash);
  } else {
    history.pushState(history.state, '', hash);
    depth += 1;
  }
  emit();
  window.scrollTo(0, 0);
}

/** 뒤로 — 앱 안에서 온 길이 있으면 브라우저 뒤로, 없으면 fallback 으로 */
export function goBack(fallback = '/home') {
  if (depth > 0) {
    depth -= 1;
    history.back();
  } else {
    navigate(fallback, { replace: true });
  }
}

/** '/player/:id' 와 '/player/p03' → { id: 'p03' } */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split('/').filter(Boolean);
  const b = path.split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string;
  replace?: boolean;
  children?: ReactNode;
}

/** 앱 안 링크 — 새 탭 열기(가운데 클릭)도 된다 */
export function Link({ to, replace, onClick, children, ...rest }: LinkProps) {
  return (
    <a
      href={'#' + to}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(to, { replace });
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
