// 화면 틀 — 위쪽 헤더(뒤로·제목·재화) + 가로 메뉴 + 본문. 아래 탭바는 없다(앱처럼 X).
import { Component, Suspense, useEffect, useLayoutEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { IconButton, TopBar, Emblem } from '../ui';
import { STANDINGS, myTeam } from '../game/mock';
import { useWallet } from '../game/wallet';
import { useTitleOverride } from './title';
import { record } from '../ui/format';
import { MENU, type RouteDef } from './routes';
import { Link, goBack, navigate } from './router';
import s from './Shell.module.css';

export function Shell({ route, preview, children }: { route: RouteDef | null; preview: boolean; children: ReactNode }) {
  const chrome = route?.chrome ?? 'full';
  const wallet = useWallet();
  const over = useTitleOverride();
  const team = myTeam();
  const st = STANDINGS.findIndex((x) => x.teamId === team.id);
  const row = STANDINGS[st];

  const lead = (
    <Link to="/home" className={s.club} aria-label={`${team.name} 홈`}>
      <Emblem team={team} size={30} />
      <span className={s.clubText}>
        <b>{team.name}</b>
        <small>
          {preview && <em className={s.pv}>미리보기 · </em>}
          <span className="num">2027</span> · <span className="num">{st + 1}</span>위 · {record(row.w, row.d, row.l)}
        </small>
      </span>
    </Link>
  );

  // 내려 읽으면 헤더 아래 그림자 (깊이)
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  return (
    <div className={[s.app, route?.wide && s.wide].filter(Boolean).join(' ')}>
      <header className={[s.chrome, scrolled && s.scrolled].filter(Boolean).join(' ')}>
        <div className={s.top}>
          {route?.back ? (
            <TopBar
              title={over?.title ?? route.title}
              sub={over?.sub}
              tag={preview ? '미리보기' : undefined}
              onBack={() => goBack(route.back)}
              wallet={wallet}
            />
          ) : (
            <TopBar
              lead={route ? lead : undefined}
              title={route ? undefined : '야구 매니저'}
              wallet={route ? wallet : null}
              right={route && <IconButton icon="settings" label="설정" onClick={() => navigate('/settings')} />}
            />
          )}
        </div>
        {chrome === 'full' && <NavMenu current={route?.key} />}
      </header>
      <main className={s.main}>
        <ScreenBoundary key={route?.key}>
          <Suspense fallback={<div className={s.loading} aria-label="불러오는 중" />}>
            <div key={route?.key ?? 'none'} className={s.enter}>{children}</div>
          </Suspense>
        </ScreenBoundary>
      </main>
    </div>
  );
}

function NavMenu({ current }: { current?: string }) {
  const list = useRef<HTMLUListElement>(null);
  const [bar, setBar] = useState<{ x: number; w: number; ready: boolean } | null>(null);
  // 밑줄이 메뉴 사이를 미끄러져 옮겨 간다
  useLayoutEffect(() => {
    const el = list.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!el || !list.current) { setBar(null); return; }
    const x = el.offsetLeft, w = el.offsetWidth;
    setBar((b) => ({ x, w, ready: !!b }));
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [current]);
  return (
    <nav className={s.menu} aria-label="주 메뉴">
      <ul ref={list} className={s.menuList}>
        {MENU.map((r) => (
          <li key={r.key}>
            <Link to={r.path} className={[s.item, r.key === current && s.on].filter(Boolean).join(' ')} aria-current={r.key === current ? 'page' : undefined}>
              {r.menu}
            </Link>
          </li>
        ))}
        {bar && <li aria-hidden className={[s.bar, bar.ready && s.barMove].filter(Boolean).join(' ')} style={{ transform: `translateX(${bar.x}px)`, width: bar.w }} />}
      </ul>
    </nav>
  );
}

/** 화면 하나가 깨져도 앱 전체가 하얗게 되지 않게 */
class ScreenBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[화면 오류]', error, info.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className={s.crash} role="alert">
        <b>이 화면을 그리다 멈췄어요</b>
        <p>{this.state.error.message}</p>
        <button type="button" onClick={() => this.setState({ error: null })}>다시 그리기</button>
      </div>
    );
  }
}
