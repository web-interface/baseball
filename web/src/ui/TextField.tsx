import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import s from './TextField.module.css';

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: ReactNode;
  /** 입력칸 아래 작은 도움말 */
  hint?: ReactNode;
  /** 오류 — 있으면 빨간 줄 */
  error?: ReactNode;
  className?: string;
}

/** 글자 입력칸 — 이름표 위, 도움말·오류 아래 */
export function TextField({ label, hint, error, className, id, ...rest }: TextFieldProps) {
  const auto = useId();
  const fid = id ?? auto;
  const hid = hint || error ? fid + '-h' : undefined;
  return (
    <div className={[s.field, error ? s.bad : null, className].filter(Boolean).join(' ')}>
      <label htmlFor={fid} className={s.label}>{label}</label>
      <input id={fid} className={s.input} aria-invalid={!!error || undefined} aria-describedby={hid} {...rest} />
      {(hint || error) && <p id={hid} className={s.hint}>{error ?? hint}</p>}
    </div>
  );
}
