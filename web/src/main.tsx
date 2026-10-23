import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './theme/fonts';
import './theme/tokens.css';
import './theme/base.css';
import { applyClubColors, applyTheme, initialTheme } from './theme/themes';
import { myTeam } from './game/mock';
import { ensureStarter } from './game/starter';
import { repairSpecial } from './screens/club-select/local-mock';
import App from './app/App';

// 첫 그림 전에 테마 (index.html 의 작은 스크립트와 같은 규칙)
applyTheme(initialTheme());
// 예전에 능력치 없이 저장된 특별 선수는 지금 설정으로 다시 (경기에서 제 실력이 나오게)
repairSpecial();
// 기본 선수단 (구단 선택에서 고른 구단·지명·특별 선수) — 내 카드 · 개막 라인업
ensureStarter();
// 내 구단 색 (지금은 목업 — 서버가 붙으면 로그인한 구단으로)
{ const t = myTeam(); applyClubColors(t.colors.primary, t.colors.secondary); }

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
