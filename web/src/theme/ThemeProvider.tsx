import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { THEMES, applyTheme, initialTheme, saveTheme, themeFromUrl, type ThemeId, type ThemeInfo } from './themes';

interface ThemeCtx {
  theme: ThemeId;
  info: ThemeInfo;
  themes: ThemeInfo[];
  /** 바꾸고 이 기기에 기억 */
  setTheme: (t: ThemeId) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(initialTheme);

  const setTheme = useCallback((t: ThemeId) => {
    setThemeState(t);
    saveTheme(t);
  }, []);

  // 주소의 ?theme= 가 바뀌면 바로 갈아입고 기억 (미리보기·스크린샷용)
  useEffect(() => {
    const fromUrl = themeFromUrl();
    if (fromUrl) saveTheme(fromUrl);
    const onHash = () => {
      const t = themeFromUrl();
      if (t) setTheme(t);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [setTheme]);

  useEffect(() => { applyTheme(theme); }, [theme]);

  const value = useMemo<ThemeCtx>(
    () => ({ theme, info: THEMES.find((x) => x.id === theme)!, themes: THEMES, setTheme }),
    [theme, setTheme],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTheme 은 ThemeProvider 안에서만 써요');
  return v;
}
