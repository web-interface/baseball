// 테마 고르기 — 견본 타일 3개. 타일마다 data-theme 를 붙여 그 테마의 진짜 토큰으로 그린다.
import { useTheme } from '../theme/ThemeProvider';
import type { ThemeId } from '../theme/themes';
import s from './ThemePicker.module.css';

const SAMPLE: Record<ThemeId, { score: [number, number]; inn: string }> = {
  night: { score: [4, 5], inn: '9회말' },
  broadcast: { score: [4, 5], inn: '9회말' },
  classic: { score: [4, 5], inn: '9회말' },
};

export function ThemePicker({ className, compact }: { className?: string; compact?: boolean }) {
  const { theme, themes, setTheme } = useTheme();
  return (
    <div className={[s.grid, compact && s.compact, className].filter(Boolean).join(' ')} role="radiogroup" aria-label="테마">
      {themes.map((t) => {
        const on = t.id === theme;
        const smp = SAMPLE[t.id];
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={on}
            data-theme={t.id}
            className={[s.tile, on && s.on].filter(Boolean).join(' ')}
            onClick={() => setTheme(t.id)}
          >
            <span className={s.bar} aria-hidden>
              <span className={s.bug}>
                <i className={s.team} />
                <b className="num">{smp.score[0]}</b>
                <i className={s.team2} />
                <b className="num">{smp.score[1]}</b>
              </span>
              <span className={s.inn}>{smp.inn}</span>
            </span>
            <span className={s.body} aria-hidden>
              <b className={['num-display', s.ovr].join(' ')}>91</b>
              <span className={s.lines}><i /><i /><i /></span>
            </span>
            <span className={s.name}>
              <b>{t.ko}</b>
              <small>{t.desc}</small>
            </span>
            <span className={s.check} aria-hidden>{on ? '사용 중' : ''}</span>
          </button>
        );
      })}
    </div>
  );
}
