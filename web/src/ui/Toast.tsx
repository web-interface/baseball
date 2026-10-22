import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import s from './Toast.module.css';

export interface ToastInput {
  text: ReactNode;
  /** 왼쪽 띠 색 */
  tone?: 'info' | 'good' | 'bad' | 'accent';
  /** 오른쪽 글자 버튼 */
  action?: { label: string; onClick: () => void };
  /** ms (기본 2600) */
  duration?: number;
}
interface ToastItem extends ToastInput { id: number; leaving?: boolean }

type ToastFn = (t: ToastInput | string) => void;
const Ctx = createContext<ToastFn | null>(null);

/** 토스트 — 화면 아래 가운데 짧은 알림 (최대 3개) */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const remove = useCallback((id: number) => {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    window.setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 200);
  }, []);

  const toast = useCallback<ToastFn>((t) => {
    const input: ToastInput = typeof t === 'string' ? { text: t } : t;
    const id = ++seq.current;
    setItems((xs) => [...xs.slice(-2), { ...input, id }]);
    window.setTimeout(() => remove(id), input.duration ?? 2600);
  }, [remove]);

  const value = useMemo(() => toast, [toast]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {createPortal(
        <div className={s.wrap} aria-live="polite" role="status">
          {items.map((t) => (
            <div key={t.id} className={[s.toast, s[t.tone ?? 'info'], t.leaving && s.leaving].filter(Boolean).join(' ')}>
              <span className={s.text}>{t.text}</span>
              {t.action && (
                <button type="button" className={s.action} onClick={() => { t.action!.onClick(); remove(t.id); }}>
                  {t.action.label}
                </button>
              )}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  );
}

export function useToast(): ToastFn {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast 는 ToastProvider 안에서만 써요');
  return v;
}
