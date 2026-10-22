// 테마 목록과 적용 — React 밖에서도 쓴다 (main.tsx 가 첫 그림 전에 적용해서 깜빡임 없음)

export type ThemeId = 'night' | 'broadcast' | 'classic';

export interface ThemeInfo {
  id: ThemeId;
  ko: string;
  desc: string;
  /** 브라우저 주소창 색 (헤더 바탕과 같게) */
  chrome: string;
  /** 미리보기 견본 색 [바탕, 면, 강조, 글자] */
  swatch: [string, string, string, string];
}

export const THEMES: ThemeInfo[] = [
  { id: 'night', ko: '나이트 스타디움', desc: '조명 켜진 밤 경기장', chrome: '#070C16', swatch: ['#070C16', '#121B2B', '#FF7A2A', '#EDF1F7'] },
  { id: 'broadcast', ko: '중계방송', desc: 'TV 중계 그래픽', chrome: '#0B0E12', swatch: ['#F4F3EF', '#0B0E12', '#F2641E', '#0B0E12'] },
  { id: 'classic', ko: '클래식 카드', desc: '종이 카드와 수동 점수판', chrome: '#F1EBDD', swatch: ['#F1EBDD', '#1C3025', '#B4372A', '#1C1E24'] },
];

export const DEFAULT_THEME: ThemeId = 'night';
const KEY = 'bb.theme';

export const isTheme = (v: unknown): v is ThemeId => v === 'night' || v === 'broadcast' || v === 'classic';

/** 주소에 붙은 ?theme= (해시 뒤 #/home?theme=classic 또는 앞 ?theme=classic#/home) */
export function themeFromUrl(): ThemeId | null {
  try {
    const h = location.hash;
    const qi = h.indexOf('?');
    const hq = qi >= 0 ? new URLSearchParams(h.slice(qi + 1)).get('theme') : null;
    const sq = new URLSearchParams(location.search).get('theme');
    const v = hq ?? sq;
    return isTheme(v) ? v : null;
  } catch {
    return null;
  }
}

export function savedTheme(): ThemeId | null {
  try {
    const v = localStorage.getItem(KEY);
    return isTheme(v) ? v : null;
  } catch {
    return null;
  }
}

export function saveTheme(t: ThemeId) {
  try { localStorage.setItem(KEY, t); } catch { /* 사생활 보호 모드 — 이번 방문만 적용 */ }
}

/** 주소 > 기기에 기억한 값 > 기본(night) */
export function initialTheme(): ThemeId {
  return themeFromUrl() ?? savedTheme() ?? DEFAULT_THEME;
}

export function applyTheme(t: ThemeId) {
  const root = document.documentElement;
  root.dataset.theme = t;
  const info = THEMES.find((x) => x.id === t)!;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = info.chrome;
}

/* ── 내 구단 색 (classic 별색 · 구단 띠 등) ── */
const hexToRgb = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const relLum = (hex: string) => {
  const c = hexToRgb(hex).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const darken = (hex: string, k: number) => '#' + hexToRgb(hex).map((v) => Math.round(v * (1 - k)).toString(16).padStart(2, '0')).join('');

/** 내 구단 색을 CSS 변수로 — --club(별색) · --club-2(보조) · --club-ink(별색 위 글자) · --club-text(종이 위 글자로 쓸 때) */
export function applyClubColors(primary: string, secondary: string) {
  const root = document.documentElement.style;
  const L = relLum(primary);
  root.setProperty('--club', primary);
  root.setProperty('--club-2', secondary);
  root.setProperty('--club-ink', L > 0.32 ? '#14110D' : '#F6F4EE');
  root.setProperty('--club-text', L > 0.18 ? darken(primary, L > 0.4 ? 0.42 : 0.28) : primary);
}
