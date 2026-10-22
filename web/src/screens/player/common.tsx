// 선수 화면 공통 조각 — 구역 머리, 별(잠재력), 상태 줄
import type { ReactNode } from 'react';
import s from './player.module.css';

/** 구역 — 제목 · 오른쪽 작은 메모 · 내용 */
export function Sec({ title, meta, id, children, className }: { title: ReactNode; meta?: ReactNode; id?: string; children: ReactNode; className?: string }) {
  return (
    <section className={[s.sec, className].filter(Boolean).join(' ')} id={id} aria-labelledby={id ? id + '-h' : undefined}>
      <header className={s.secHead}>
        <h3 id={id ? id + '-h' : undefined} className="head">{title}</h3>
        {meta != null && <span className={s.secMeta}>{meta}</span>}
      </header>
      {children}
    </section>
  );
}

/** 잠재력 별 — 0.5 단위 (FM 스카우트 추정) */
export function Stars({ v, size = 13, className }: { v: number; size?: number; className?: string }) {
  const star = 'M12 3.4l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.8l-5.2 2.8 1-5.9L3.5 9.6l5.9-.8Z';
  return (
    <span className={[s.stars, className].filter(Boolean).join(' ')} role="img" aria-label={`잠재력 별 ${v}개`}>
      {Array.from({ length: 5 }, (_, i) => {
        const fill = Math.max(0, Math.min(1, v - i));
        return (
          <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
            <path d={star} className={s.starEmpty} />
            {fill > 0 && (
              <path d={star} className={s.starFull} style={fill < 1 ? { clipPath: 'inset(0 50% 0 0)' } : undefined} />
            )}
          </svg>
        );
      })}
    </span>
  );
}

/** 작은 칸 막대 (강화 I~X · 위험 4단) */
export function Pips({ n, of, className, label }: { n: number; of: number; className?: string; label?: string }) {
  return (
    <span className={[s.pips, className].filter(Boolean).join(' ')} role="img" aria-label={label ?? `${of}칸 중 ${n}칸`}>
      {Array.from({ length: of }, (_, i) => <i key={i} className={i < n ? s.pipOn : undefined} />)}
    </span>
  );
}
