// 화면 틀 — 위쪽 헤더(뒤로·제목·재화) + 가로 메뉴 + 본문. 아래 탭바는 없다(앱처럼 X).
import { Component, Suspense, useEffect, useLayoutEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { IconButton, TopBar, Emblem, useToast } from '../ui';
import { myTeam } from '../game/mock';
import { takeNotice, teamLine, useSeason } from '../season/store';
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
  // 순위 · 전적 — 저장된 시즌 진행(지금 바로 경기 · 빨리 감기)에서. 개막일엔 모든 구단 0승 0무 0패
  const season = useSeason();
  const ln = teamLine(team.id, season);
  const row = ln.row;
  // 예전 저장(6월 15일 시작 형식)을 정리하고 새 시즌으로 시작했으면 한 번 알려 준다
  const toast = useToast();
  useEffect(() => {
    const n = takeNotice();
    if (n) toast({ text: n, tone: 'info', duration: 7000 });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const lead = (
    <Link to="/home" className={s.club} aria-label={`${team.name} 홈`}>
      <Emblem team={team} size={30} />
      <span className={s.clubText}>
        <b>{team.name}</b>
        <small>
          {preview && <em className={s.pv}>미리보기 · </em>}
          <span className="num">2027</span> · {ln.started ? <><span className="num">{ln.rank}</span>위</> : '개막 전'} · {record(row.w, row.d, row.l)}
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
  // 메뉴는 누른 자리에 가만히 있는다 — 지금 메뉴가 화면 밖에 완전히 숨어 있을 때만(주소로 바로 들어온 경우 등)
  // 메뉴 줄 안에서만, 움직임 없이 보이게 옮긴다. (예전엔 누를 때마다 줄이 굴러가고 밑줄이 미끄러져 날아다녔다)
  useLayoutEffect(() => {
    const ul = list.current;
    const el = ul?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!ul || !el) return;
    const left = el.offsetLeft, right = left + el.offsetWidth;
    const viewL = ul.scrollLeft, viewR = viewL + ul.clientWidth;
    if (right <= viewL + 8) ul.scrollLeft = Math.max(0, left - 16);
    else if (left >= viewR - 8) ul.scrollLeft = right - ul.clientWidth + 16;
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
