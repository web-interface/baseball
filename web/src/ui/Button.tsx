import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './icons';
import s from './Button.module.css';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** primary 강조(주황/진홍) · secondary 테두리 · ink 반대색 · ghost 글자만 */
  variant?: 'primary' | 'secondary' | 'ink' | 'ghost';
  /** l 52 · m 46 · s 36 */
  size?: 'l' | 'm' | 's';
  /** 가로로 꽉 */
  block?: boolean;
  icon?: IconName;
  /** 오른쪽 작은 글자 (가격·남은 횟수) — block 이면 양 끝 정렬 */
  trailing?: ReactNode;
  loading?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = 'primary', size = 'm', block, icon, trailing, loading, className, children, disabled, type = 'button', ...rest
}: ButtonProps) {
  const cls = [s.btn, s[variant], s[size], block && s.block, trailing != null && s.split, loading && s.loading, className]
    .filter(Boolean).join(' ');
  return (
    <button type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      <span className={s.main}>
        {icon && <Icon name={icon} size={size === 's' ? 16 : 18} />}
        <span className={s.label}>{children}</span>
      </span>
      {trailing != null && <span className={s.trailing}>{trailing}</span>}
    </button>
  );
}

/** 아이콘만 있는 둥근 손잡이 (헤더 뒤로·닫기) — 손가락 크기 44px 보장 */
export function IconButton({ icon, label, className, size = 22, ...rest }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & { icon: IconName; label: string; size?: number }) {
  return (
    <button type="button" className={[s.iconBtn, className].filter(Boolean).join(' ')} aria-label={label} title={label} {...rest}>
      <Icon name={icon} size={size} />
    </button>
  );
}
