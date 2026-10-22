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

  // 열려 있는 동안 뒤 화면 스크롤 막기 + Esc
  useEffect(() => {
    if (!mounted || closing) return;
    const unlock = lockScroll();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && dismissible) onClose(); };
    window.addEventListener('keydown', onKey);
    requestAnimationFrame(() => panel.current?.focus());
    return () => {
      unlock();
      window.removeEventListener('keydown', onKey);
      (lastFocus.current as HTMLElement | null)?.focus?.();
    };
  }, [mounted, closing, dismissible, onClose]);

  if (!mounted) return null;
  return createPortal(
    <div className={[s.root, closing && s.closing].filter(Boolean).join(' ')}>
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
        <div className={s.body}>{children}</div>
        {footer && <footer className={s.foot}>{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
