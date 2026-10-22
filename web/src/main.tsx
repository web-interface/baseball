import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './theme/fonts';
import './theme/tokens.css';
import './theme/base.css';
import { applyClubColors, applyTheme, initialTheme } from './theme/themes';
import { myTeam } from './game/mock';
import App from './app/App';

// 첫 그림 전에 테마 (index.html 의 작은 스크립트와 같은 규칙)
applyTheme(initialTheme());
// 내 구단 색 (지금은 목업 — 서버가 붙으면 로그인한 구단으로)
{ const t = myTeam(); applyClubColors(t.colors.primary, t.colors.secondary); }

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
