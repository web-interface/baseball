// 화면 틀 — 위쪽 헤더(뒤로·제목·재화) + 가로 메뉴 + 본문. 아래 탭바는 없다(앱처럼 X).
import { Component, Suspense, useEffect, useLayoutEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { IconButton, TopBar, Emblem, useToast } from '../ui';
import { myTeam } from '../game/mock';
import { takeNotice, teamLine, useSeason } from '../season/store';
import { takeInvNotice } from '../game/inventory';
import { useWallet } from '../game/wallet';
import { useTitleOverride } from './title';
import { record } from '../ui/format';
import { GROUPS, ROUTES, groupOf, subTabOf, type RouteDef } from './routes';
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
    // 보유 카드 저장이 깨져 처음 선수단으로 다시 시작했으면
    const inv = takeInvNotice();
    if (inv) window.setTimeout(() => toast({ text: inv, tone: 'info', duration: 7000 }), n ? 7200 : 0);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const lead = (
    <Link to="/home" className={s.club} aria-label={`${team.name} 홈`}>
      <Emblem team={team} size={30} />
      <span className={s.clubText}>
        <b>{team.name}</b>
        <small>
          {preview && <em className={s.pv}>미리보기 · </em>}
          <span className="num">{season.year ?? 2027}</span> · {ln.started ? <><span className="num">{ln.rank}</span>위</> : '개막 전'} · {record(row.w, row.d, row.l)}
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

/** 큰 메뉴 5개 + (묶음에 화면이 여럿이면) 아래 작은 탭. 둘 다 좌우로만 움직인다.
 *  작은 탭이 아닌 화면도 묶음에 속할 수 있다(routes.ts members — 경기 화면 #/match 는 경기 운영 · 경기 준비·진행) */
function NavMenu({ current }: { current?: string }) {
  const group = groupOf(current);
  const subOn = subTabOf(group, current);
  const keep = (ul: HTMLUListElement | null) => {
    const el = ul?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!ul || !el) return;
    const left = el.offsetLeft, right = left + el.offsetWidth;
    const viewL = ul.scrollLeft, viewR = viewL + ul.clientWidth;
    if (right <= viewL + 8) ul.scrollLeft = Math.max(0, left - 16);
    else if (left >= viewR - 8) ul.scrollLeft = right - ul.clientWidth + 16;
  };
  const top = useRef<HTMLUListElement>(null);
  const sub = useRef<HTMLUListElement>(null);
  // 메뉴는 누른 자리에 가만히 있고, 화면 밖에 완전히 숨은 경우에만 조용히 보이게 옮긴다
  useLayoutEffect(() => { keep(top.current); keep(sub.current); }, [current]);
  const path = (key: string) => ROUTES.find((r) => r.key === key)?.path ?? '/home';
  return (
    <nav className={s.menu} aria-label="주 메뉴">
      <ul ref={top} className={s.menuList}>
        {GROUPS.map((g) => {
          const on = g === group;
          return (
            <li key={g.key}>
              <Link to={path(g.landing ?? g.items[0].route)} className={[s.item, on && s.on].filter(Boolean).join(' ')} aria-current={on ? 'page' : undefined}>
                {g.label}
              </Link>
            </li>
          );
        })}
      </ul>
      {group && group.items.length > 1 && (
        <ul ref={sub} className={s.subList} aria-label={`${group.label} 메뉴`}>
          {group.items.map((it) => {
            const on = it.route === subOn;
            return (
              <li key={it.route}>
                <Link to={path(it.route)} className={[s.subItem, on && s.subOn].filter(Boolean).join(' ')} aria-current={on ? 'page' : undefined}>
                  {it.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
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
