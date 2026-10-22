// 연도 고르기 — 1982~2027 한 해 단위. 위에 연대 탭(80년대 … 2020년대), 아래 그 연대의 해를 5칸 격자로.
// 칸마다 큰 숫자(’95)와 작은 한 줄(우승 구단 · '우승' · '이번' 등). 우승한 해는 tone='champ' 로 강조.
// 쓰는 곳: 영입 연도팩(그 해 리그 전체) · 세트덱 조합별 효과(구단이 있던 해 / 리그 연도)
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Tabs } from './Tabs';
import s from './YearPicker.module.css';

export interface YearCell {
  year: number;
  /** 숫자 아래 작은 글자 */
  sub?: ReactNode;
  /** champ 우승 · legend 레전드 시즌(금) · dim 흐리게 */
  tone?: 'champ' | 'legend' | 'dim';
  disabled?: boolean;
  /** 읽어 줄 설명 (기본: '1995년') */
  label?: string;
}

export interface YearPickerProps {
  cells: YearCell[];
  value: number;
  onChange: (year: number) => void;
  /** 연대 탭 옆에 그 연대 우승(tone='champ') 수 — 한 구단의 해를 고를 때 */
  champCount?: boolean;
  'aria-label'?: string;
  className?: string;
}

const decadeOf = (y: number) => Math.floor(y / 10) * 10;
const decadeKo = (d: number) => (d < 2000 ? `${String(d).slice(2)}년대` : `${d}년대`);
const yy = (y: number) => `’${String(y).slice(-2)}`;

export function YearPicker({ cells, value, onChange, champCount, className, ...aria }: YearPickerProps) {
  const decades = useMemo(() => [...new Set(cells.map((c) => decadeOf(c.year)))].sort((a, b) => a - b), [cells]);
  const [dec, setDec] = useState(() => decadeOf(value));
  // 밖에서 다른 연대의 해로 바뀌면 그 연대를 연다
  useEffect(() => { setDec(decadeOf(value)); }, [value]);
  const shown = decades.includes(dec) ? dec : decades[decades.length - 1];
  const list = cells.filter((c) => decadeOf(c.year) === shown).sort((a, b) => a.year - b.year);
  return (
    <div className={[s.wrap, className].filter(Boolean).join(' ')}>
      {decades.length > 1 && (
        <Tabs
          className={s.decades}
          size="s"
          fill
          aria-label="연대"
          value={String(shown)}
          onChange={(v) => setDec(Number(v))}
          items={decades.map((d) => ({ value: String(d), label: decadeKo(d), count: champCount ? cells.filter((c) => decadeOf(c.year) === d && c.tone === 'champ').length || undefined : undefined }))}
        />
      )}
      <div className={s.grid} role="radiogroup" aria-label={aria['aria-label'] ?? '연도'}>
        {list.map((c) => {
          const on = c.year === value;
          return (
            <button
              key={c.year}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={c.label ?? `${c.year}년`}
              disabled={c.disabled}
              className={[s.cell, on && s.on, c.tone && s[c.tone]].filter(Boolean).join(' ')}
              onClick={() => onChange(c.year)}
            >
              <b className="num-display">{yy(c.year)}</b>
              <small>{c.sub ?? <>&nbsp;</>}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}
