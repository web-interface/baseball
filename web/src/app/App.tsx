// 앱 뿌리 — 테마 · 토스트 · 로그인 상태 · 경로
import { useEffect } from 'react';
import { ThemeProvider } from '../theme/ThemeProvider';
import { Button, Sheet, ToastProvider, useToast } from '../ui';
import { AuthProvider, useAuth } from './auth';
import { AuthScreen } from './AuthScreen';
import { Preview } from './Preview';
import { ROUTES, SCREENS, type RouteDef } from './routes';
import { Link, matchPath, navigate, useLocation, type Loc } from './router';
import { Shell } from './Shell';
import { savedStartClub } from '../game/mock';
import s from './App.module.css';

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <Routes />
          <RecoverySheet />
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

const PREVIEW_ROUTE: RouteDef = {
  key: 'preview', path: '/preview', title: '미리보기', wide: true, owner: '화면 기반 개발자',
  desc: '모든 화면 · 테마 전환 · 부품', load: async () => ({ default: () => null }),
};

const PV_KEY = 'bb.preview';
/** 처음 들어온 감독(아직 구단을 안 고름)을 구단 선택으로 — 이 탭에서 한 번만 (둘러보다 나가도 다시 끌고 가지 않게) */
const GUIDE_KEY = 'bb.clubGuide';
const guided = () => { try { return sessionStorage.getItem(GUIDE_KEY) === '1'; } catch { return true; } };
const markGuided = () => { try { sessionStorage.setItem(GUIDE_KEY, '1'); } catch { /* */ } };
const pvGet = () => { try { return sessionStorage.getItem(PV_KEY) === '1'; } catch { return false; } };
const pvSet = () => { try { sessionStorage.setItem(PV_KEY, '1'); } catch { /* */ } };

/**
 * 로그인 없이 화면을 볼 수 있나
 *  - #/preview 를 한 번 열면 이 탭에서는 둘러보기 허용 (사용자가 휴대폰으로 보는 곳)
 *  - 주소에 ?pv=1
 *  - 개발 서버(npm run dev)는 기본 허용 — 스크린샷용. ?gate=1 이면 로그인 화면을 확인할 수 있다
 */
function previewAllowed(loc: Loc) {
  if (loc.query.get('gate') === '1') return false;
  if (loc.path === '/preview' || loc.query.get('pv') === '1') { pvSet(); return true; }
  if (import.meta.env.DEV) return true;
  return pvGet();
}

function findRoute(path: string) {
  for (const r of ROUTES) {
    const params = matchPath(r.path, path);
    if (params) return { route: r, params };
  }
  return null;
}

function Routes() {
  const loc = useLocation();
  const { status, recoveryCode } = useAuth();

  // 첫 주소 · 로그인 뒤 이동
  useEffect(() => {
    if (status === 'checking') return;
    if (loc.path === '/') navigate(status === 'in' ? '/home' : previewAllowed(loc) ? '/preview' : '/login', { replace: true });
    else if (loc.path === '/login' && status === 'in' && !recoveryCode) navigate(loc.query.get('next') || '/home', { replace: true });
    else if (status === 'in' && !recoveryCode && loc.path !== '/club-select' && loc.path !== '/settings' && !savedStartClub() && !guided()) {
      // 처음 들어옴 — 2027 시즌을 함께할 구단부터 (고른 구단이 앱 전체의 내 구단이 된다)
      markGuided();
      navigate('/club-select', { replace: true });
    }
  }, [loc, status, recoveryCode]);

  if (status === 'checking') return <Splash />;
  if (loc.path === '/login' || loc.path === '/') return <AuthScreen />;

  const preview = status !== 'in';
  if (loc.path === '/preview') {
    previewAllowed(loc);
    return <Shell route={PREVIEW_ROUTE} preview={preview}><Preview /></Shell>;
  }

  const found = findRoute(loc.path);
  if (!found) {
    return (
      <Shell route={null} preview={preview}>
        <div className={s.missing}>
          <p className="num-display">404</p>
          <h2>없는 화면이에요</h2>
          <Link to="/home">홈으로</Link>
        </div>
      </Shell>
    );
  }
  if (status !== 'in' && !previewAllowed(loc)) return <AuthScreen />;

  const Screen = SCREENS[found.route.key];
  return (
    <Shell route={found.route} preview={preview}>
      <Screen params={found.params} query={loc.query} />
    </Shell>
  );
}

function Splash() {
  return (
    <div className={s.splash} aria-label="불러오는 중">
      <b>야구 매니저</b>
      <span className={s.bar} />
    </div>
  );
}

/** 가입 직후 복구 코드 — 한 번만, 닫기 전에 꼭 확인 */
function RecoverySheet() {
  const { recoveryCode, clearRecovery } = useAuth();
  const toast = useToast();
  const copy = async () => {
    try { await navigator.clipboard.writeText(recoveryCode ?? ''); toast({ text: '복구 코드를 복사했어요', tone: 'good' }); } catch { toast({ text: '복사하지 못했어요. 직접 적어 주세요', tone: 'bad' }); }
  };
  return (
    <Sheet
      open={!!recoveryCode}
      onClose={() => {}}
      dismissible={false}
      title="복구 코드를 적어 두세요"
      sub="비밀번호를 잊으면 이 코드로만 되찾을 수 있어요. 지금 한 번만 보여 드려요."
      footer={
        <>
          <Button variant="secondary" onClick={copy}>복사</Button>
          <Button onClick={() => { clearRecovery(); navigate('/club-select', { replace: true }); }}>적어 뒀어요</Button>
        </>
      }
    >
      <code className={['num', s.code].join(' ')}>{recoveryCode}</code>
    </Sheet>
  );
}
