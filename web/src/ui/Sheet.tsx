import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './Button';
import { lockScroll } from './scrollLock';
import s from './Sheet.module.css';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** 제목 아래 작은 설명 */
  sub?: ReactNode;
  /** 아래 고정 버튼 줄 */
  footer?: ReactNode;
  /** 바깥 누름·Esc 로 닫기 (기본 켬) — 복구 코드처럼 꼭 읽어야 하면 끔 */
  dismissible?: boolean;
  /** 높이: auto 내용만큼(최대 88%) · tall 88% 고정 */
  height?: 'auto' | 'tall';
  children?: ReactNode;
  className?: string;
}

const EXIT_MS = 220;

/** 아래에서 올라오는 시트 */
export function Sheet({ open, onClose, title, sub, footer, dismissible = true, height = 'auto', children, className }: SheetProps) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<Element | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (open) {
      lastFocus.current = document.activeElement;
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    setClosing(true);
    const t = window.setTimeout(() => { setMounted(false); setClosing(false); }, EXIT_MS);
    return () => window.clearTimeout(t);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // 열려 있는 동안 뒤 화면 스크롤 막기 + Esc — onClose 는 ref 로(부모가 그릴 때마다 새 함수를 넘겨도
  // 잠금 · 초점이 다시 걸리지 않게: 경기 화면처럼 초당 여러 번 다시 그리는 곳에서 초점이 시트 밖으로 튀던 것)
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!mounted || closing) return;
    const unlock = lockScroll();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && dismissible) closeRef.current(); };
    window.addEventListener('keydown', onKey);
    requestAnimationFrame(() => panel.current?.focus());
    return () => {
      unlock();
      window.removeEventListener('keydown', onKey);
      (lastFocus.current as HTMLElement | null)?.focus?.();
    };
  }, [mounted, closing, dismissible]);

  // 휴대폰 — 시트 안에서는 목록만 스크롤된다. 머리 · 바깥을 밀거나, 목록 끝에서 더 당겨도 뒤 화면이 움직이거나
  // '당겨서 새로고침'으로 화면이 날아가지 않게 (overscroll-behavior 를 모르는 옛 iOS 까지 — 터치 이동을 직접 막는다)
  useEffect(() => {
    const el = root.current;
    if (!el || !mounted) return;
    let x0 = 0, y0 = 0;
    const start = (e: TouchEvent) => { x0 = e.touches[0]?.clientX ?? 0; y0 = e.touches[0]?.clientY ?? 0; };
    const move = (e: TouchEvent) => {
      if (e.touches.length > 1) return; // 두 손가락 확대는 그대로
      const t = e.target as Element | null;
      const body = t?.closest?.('[data-sheet-body]') as HTMLElement | null;
      if (!body) { if (e.cancelable) e.preventDefault(); return; }
      const dx = (e.touches[0]?.clientX ?? 0) - x0, dy = (e.touches[0]?.clientY ?? 0) - y0;
      if (Math.abs(dx) > Math.abs(dy)) return; // 가로로 미는 목록은 그대로
      const atTop = body.scrollTop <= 0;
      const atEnd = body.scrollTop + body.clientHeight >= body.scrollHeight - 1;
      if (((dy > 0 && atTop) || (dy < 0 && atEnd)) && e.cancelable) e.preventDefault();
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    return () => { el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move); };
  }, [mounted]);

  if (!mounted) return null;
  return createPortal(
    <div ref={root} className={[s.root, closing && s.closing].filter(Boolean).join(' ')}>
      <div className={s.scrim} onClick={dismissible ? onClose : undefined} aria-hidden />
      <div
        ref={panel}
        className={[s.panel, height === 'tall' && s.tall, className].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
      >
        <div className={s.grip} aria-hidden />
        {(title || dismissible) && (
          <header className={s.head}>
            <div className={s.titles}>
              {title && <h2 id={titleId} className={s.title}>{title}</h2>}
              {sub && <p className={s.sub}>{sub}</p>}
            </div>
            {dismissible && <IconButton icon="close" label="닫기" onClick={onClose} className={s.close} />}
          </header>
        )}
        <div className={s.body} data-sheet-body>{children}</div>
        {footer && <footer className={s.foot}>{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
