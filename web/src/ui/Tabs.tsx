import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import s from './Tabs.module.css';

export interface TabItem<V extends string> {
  value: V;
  label: ReactNode;
  /** 오른쪽 작은 숫자 (개수) */
  count?: number;
  disabled?: boolean;
}

export interface TabsProps<V extends string> {
  items: TabItem<V>[];
  value: V;
  onChange: (v: V) => void;
  /** underline 밑줄 탭(화면 안 구역) · box 상자 세그먼트(보기 방식 전환) */
  variant?: 'underline' | 'box';
  size?: 's' | 'm';
  /** 가로로 꽉 채워 같은 폭 */
  fill?: boolean;
  className?: string;
  'aria-label'?: string;
}

/** 세그먼트 탭 — 방향키로 이동 */
export function Tabs<V extends string>({ items, value, onChange, variant = 'underline', size = 'm', fill, className, ...aria }: TabsProps<V>) {
  const ref = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const enabled = items.filter((i) => !i.disabled);
    const idx = enabled.findIndex((i) => i.value === value);
    const next = enabled[(idx + (e.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length];
    onChange(next.value);
    requestAnimationFrame(() => ref.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus());
    e.preventDefault();
  };
  return (
    <div
      ref={ref}
      role="tablist"
      aria-label={aria['aria-label']}
      className={[s.tabs, s[variant], s[size], fill && s.fill, className].filter(Boolean).join(' ')}
      onKeyDown={onKey}
    >
      {items.map((it) => {
        const on = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            disabled={it.disabled}
            className={[s.tab, on && s.on].filter(Boolean).join(' ')}
            onClick={() => onChange(it.value)}
          >
            <span>{it.label}</span>
            {it.count != null && <em className="num">{it.count}</em>}
          </button>
        );
      })}
    </div>
  );
}
