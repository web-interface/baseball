import { useEffect, useState } from 'react';
import { api, ApiError, session, type Ping } from './api';

type Mode = 'login' | 'register' | 'reset';

export default function App() {
  const [user, setUser] = useState<string | null>(null);
  const [checking, setChecking] = useState(!!session.get());
  const [recovery, setRecovery] = useState<string | null>(null);

  useEffect(() => {
    if (!session.get()) return;
    api.me().then((r) => setUser(r.username)).catch(() => session.clear()).finally(() => setChecking(false));
  }, []);

  const onAuth = (username: string, token: string, code?: string) => {
    session.set(token);
    setUser(username);
    if (code) setRecovery(code);
  };
  const logout = async () => {
    await api.logout().catch(() => {});
    session.clear();
    setUser(null);
  };

  return (
    <div className="page">
      <header className="top">
        <span className="logo">야구 매니저</span>
        {user && <span className="who">{user} <button className="link" onClick={logout}>로그아웃</button></span>}
      </header>
      <main>
        {recovery && <RecoveryNotice code={recovery} onDone={() => setRecovery(null)} />}
        {checking ? <p className="muted">확인하는 중…</p> : user ? <Home /> : <AuthForm onAuth={onAuth} />}
      </main>
    </div>
  );
}

function AuthForm({ onAuth }: { onAuth: (u: string, t: string, code?: string) => void }) {
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (mode !== 'login' && password.length < 8) return setError('비밀번호는 8자 이상으로 해 주세요');
    if (mode !== 'login' && password !== password2) return setError('비밀번호 확인이 달라요');
    setBusy(true);
    try {
      const u = username.trim();
      const r = mode === 'login' ? await api.login(u, password)
        : mode === 'register' ? await api.register(u, password)
          : await api.reset(u, code, password);
      onAuth(r.username, r.token, r.recoveryCode);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '문제가 생겼어요');
    } finally {
      setBusy(false);
    }
  };

  const title = { login: '로그인', register: '새로 시작하기', reset: '비밀번호 다시 정하기' }[mode];
  return (
    <form className="card auth" onSubmit={submit}>
      <h1>{title}</h1>
      <label>아이디<input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required minLength={3} maxLength={16} placeholder="한글·영문·숫자 3~16자" /></label>
      {mode === 'reset' && <label>복구 코드<input value={code} onChange={(e) => setCode(e.target.value)} required placeholder="XXXX-XXXX-XXXX-XXXX" autoComplete="off" /></label>}
      <label>{mode === 'reset' ? '새 비밀번호' : '비밀번호'}<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
      {mode !== 'login' && <label>비밀번호 확인<input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} required autoComplete="new-password" /></label>}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? '잠시만요…' : title}</button>
      <div className="switch">
        {mode !== 'login' && <button type="button" className="link" onClick={() => setMode('login')}>로그인</button>}
        {mode !== 'register' && <button type="button" className="link" onClick={() => setMode('register')}>새로 시작하기</button>}
        {mode !== 'reset' && <button type="button" className="link" onClick={() => setMode('reset')}>비밀번호를 잊었어요</button>}
      </div>
    </form>
  );
}

function RecoveryNotice({ code, onDone }: { code: string; onDone: () => void }) {
  return (
    <div className="card notice">
      <h2>복구 코드를 적어 두세요</h2>
      <p>비밀번호를 잊으면 이 코드로만 되찾을 수 있어요. 지금 한 번만 보여 드려요.</p>
      <code className="code">{code}</code>
      <div className="row">
        <button className="link" onClick={() => navigator.clipboard?.writeText(code)}>복사</button>
        <button className="primary small" onClick={onDone}>적어 뒀어요</button>
      </div>
    </div>
  );
}

function Home() {
  const [ping, setPing] = useState<Ping | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async () => {
    setBusy(true); setError('');
    try { setPing(await api.aiPing()); } catch (e) { setError(e instanceof ApiError ? e.message : '문제가 생겼어요'); } finally { setBusy(false); }
  };
  return (
    <section className="card">
      <h2>Claude 문자 중계 시험</h2>
      <p className="muted">버튼을 누르면 서버가 Claude 에게 끝내기 안타 중계를 부탁해요.</p>
      <button className="primary" onClick={run} disabled={busy}>{busy ? '중계 받는 중…' : '중계 받아 보기'}</button>
      {error && <p className="error" role="alert">{error}</p>}
      {ping && (
        <div className="ping">
          <p>{ping.text}</p>
          <p className="muted small">{ping.model} · 입력 {ping.usage.input} / 출력 {ping.usage.output} 토큰 · 오늘 남은 횟수 {ping.left}</p>
        </div>
      )}
    </section>
  );
}
