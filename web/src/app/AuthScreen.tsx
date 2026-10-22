// 로그인 게이트 — 기존 흐름(로그인 · 새로 시작 · 복구 코드로 비밀번호 다시 정하기) 그대로, 새 옷만
import { useState, type FormEvent } from 'react';
import { Button, Tabs, TextField } from '../ui';
import { StadiumArt } from './StadiumArt';
import { PlayerArt } from '../art/PlayerArt';
import { playerById } from '../game/mock';
import { authError, useAuth } from './auth';
import { Link } from './router';
import s from './AuthScreen.module.css';

type Mode = 'login' | 'register' | 'reset';

const CTA: Record<Mode, string> = { login: '로그인', register: '시작하기', reset: '비밀번호 바꾸기' };

export function AuthScreen() {
  const { login, register, reset } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const switchTo = (m: Mode) => { setMode(m); setError(''); setPassword(''); setPassword2(''); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (mode !== 'login' && password.length < 8) return setError('비밀번호는 8자 이상으로 해 주세요');
    if (mode !== 'login' && password !== password2) return setError('비밀번호 확인이 달라요');
    setBusy(true);
    try {
      const u = username.trim();
      if (mode === 'login') await login(u, password);
      else if (mode === 'register') await register(u, password);
      else await reset(u, code.trim(), password);
    } catch (err) {
      setError(authError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={s.page}>
      <section className={s.hero}>
        <StadiumArt className={s.art} />
        <div className={s.stars} aria-hidden>
          <span className={s.star2}><PlayerArt player={playerById('p14')!} variant="portrait" /></span>
          <span className={s.star1}><PlayerArt player={playerById('p01')!} variant="portrait" /></span>
        </div>
        <div className={['halftone', s.dots].join(' ')} aria-hidden />
        <div className={s.shade} aria-hidden />
        <div className={s.brand}>
          <p className={s.season}>
            <b className="num-display">2027</b>
            <span>시즌 개막</span>
          </p>
          <h1 className={s.title}>야구 매니저</h1>
          <p className={s.tagline}>카드를 모아 라인업을 짜고, 9이닝은 10초 만에.</p>
        </div>
      </section>

      <section className={s.panel}>
        {mode === 'reset' ? (
          <div className={s.resetHead}>
            <h2>비밀번호 다시 정하기</h2>
            <p>가입할 때 받은 복구 코드가 있으면 새 비밀번호로 바꿀 수 있어요.</p>
          </div>
        ) : (
          <Tabs
            aria-label="로그인 또는 새로 시작"
            items={[{ value: 'login', label: '로그인' }, { value: 'register', label: '새로 시작' }]}
            value={mode}
            onChange={(v) => switchTo(v)}
            className={s.tabs}
          />
        )}

        <form className={s.form} onSubmit={submit} noValidate={false}>
          <TextField
            label="아이디"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            minLength={3}
            maxLength={16}
            placeholder="한글·영문·숫자 3~16자"
            autoCapitalize="off"
            spellCheck={false}
          />
          {mode === 'reset' && (
            <TextField
              label="복구 코드"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              placeholder="XXXX-XXXX-XXXX-XXXX"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
            />
          )}
          <TextField
            label={mode === 'reset' ? '새 비밀번호' : '비밀번호'}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            hint={mode !== 'login' ? '8자 이상' : undefined}
          />
          {mode !== 'login' && (
            <TextField
              label="비밀번호 확인"
              type="password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              required
              autoComplete="new-password"
            />
          )}
          {error && <p className={s.error} role="alert">{error}</p>}
          <Button type="submit" block size="l" loading={busy} className={s.cta}>
            {busy ? '잠시만요' : CTA[mode]}
          </Button>
          <p className={s.note}>이 기기에서는 다음부터 로그인 없이 바로 들어와요.</p>
        </form>

        <div className={s.links}>
          {mode === 'reset'
            ? <button type="button" onClick={() => switchTo('login')}>로그인으로 돌아가기</button>
            : <button type="button" onClick={() => switchTo('reset')}>비밀번호를 잊었어요</button>}
          <Link to="/preview" className={s.peek}>로그인 없이 둘러보기</Link>
        </div>
      </section>
    </div>
  );
}
