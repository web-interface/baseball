// 로그인 상태 — 기존 서버 흐름(가입·로그인·복구 코드로 비밀번호 다시 정하기·로그아웃)을 그대로 쓴다.
// 같은 기기면 저장된 토큰으로 자동 로그인. 서버에 잠깐 못 닿아도(네트워크) 로그아웃시키지 않는다.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, isReplaced, onReplaced, session } from '../api';

const USER_KEY = 'bb.user';
const store = {
  get: () => { try { return localStorage.getItem(USER_KEY); } catch { return null; } },
  set: (u: string) => { try { localStorage.setItem(USER_KEY, u); } catch { /* */ } },
  clear: () => { try { localStorage.removeItem(USER_KEY); } catch { /* */ } },
};

type Status = 'checking' | 'in' | 'out';

interface AuthCtx {
  status: Status;
  user: string | null;
  /** 서버에 못 닿아 저장된 이름으로 들어온 상태 */
  offline: boolean;
  /** 가입 직후 한 번만 보여 주는 복구 코드 */
  recoveryCode: string | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  reset: (username: string, code: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearRecovery: () => void;
  /** 같은 아이디로 다른 기기에서 로그인해 이 기기 접속이 끊겼다 (어느 API 든 401 code 'replaced') — App 이 팝업을 띄운다 */
  replaced: boolean;
  /** 팝업 [확인] — 저장된 토큰만 지우고(게임 기록은 그대로) 로그아웃 상태로 */
  ackReplaced: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(session.get() ? 'checking' : 'out');
  const [user, setUser] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [recoveryCode, setRecovery] = useState<string | null>(null);
  const [replaced, setReplaced] = useState(false);

  // 다른 기기 로그인으로 끊김 — 어느 API 호출에서 알아채든 팝업
  useEffect(() => onReplaced(() => setReplaced(true)), []);

  useEffect(() => {
    if (!session.get()) return;
    let alive = true;
    api.me()
      .then((r) => { if (!alive) return; setUser(r.username); store.set(r.username); setStatus('in'); })
      .catch((e) => {
        if (!alive) return;
        if (isReplaced(e)) { setReplaced(true); return; } // 팝업 [확인] 때 토큰을 지우고 로그인 화면으로
        if (e instanceof ApiError && e.status === 0 && store.get()) {
          // 네트워크만 끊김 — 토큰은 지키고 저장된 이름으로
          setUser(store.get()); setOffline(true); setStatus('in');
        } else {
          session.clear(); store.clear(); setStatus('out');
        }
      });
    return () => { alive = false; };
  }, []);

  const done = useCallback((username: string, token: string, code?: string) => {
    session.set(token);
    store.set(username);
    setUser(username);
    setOffline(false);
    setReplaced(false);
    setStatus('in');
    if (code) setRecovery(code);
  }, []);

  const login = useCallback(async (u: string, p: string) => { const r = await api.login(u, p); done(r.username, r.token, r.recoveryCode); }, [done]);
  const register = useCallback(async (u: string, p: string) => { const r = await api.register(u, p); done(r.username, r.token, r.recoveryCode); }, [done]);
  const reset = useCallback(async (u: string, c: string, p: string) => { const r = await api.reset(u, c, p); done(r.username, r.token, r.recoveryCode); }, [done]);
  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    session.clear();
    store.clear();
    setUser(null);
    setStatus('out');
  }, []);
  const clearRecovery = useCallback(() => setRecovery(null), []);
  const ackReplaced = useCallback(() => {
    session.clear();
    store.clear();
    setUser(null);
    setOffline(false);
    setReplaced(false);
    setStatus('out');
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({ status, user, offline, recoveryCode, login, register, reset, logout, clearRecovery, replaced, ackReplaced }),
    [status, user, offline, recoveryCode, login, register, reset, logout, clearRecovery, replaced, ackReplaced],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth 는 AuthProvider 안에서만 써요');
  return v;
}

/** 오류 문구 — 서버 문구가 있으면 그것, 없으면 짧게 */
export const authError = (e: unknown) => (e instanceof ApiError ? e.message : '문제가 생겼어요. 잠시 뒤 다시 해 주세요');
