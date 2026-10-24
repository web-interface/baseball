// 뽑기 화면 작은 부품 — 등급 색 네모 · 천장 눈금(classic 은 연필 正 자) · 확률 막대
import type { CSSProperties } from 'react';
import type { GradeId, Pack } from '../../game/types';
import { CoinGP, GoldenBall, fmt } from '../../ui';
import { GRADES } from '../../game/grades';
import { useTheme } from '../../theme/ThemeProvider';
import type { OddsRow } from './draw';
import s from './bits.module.css';

/** 등급 색 — 시그니처는 홀로 그라디언트 */
export const gradeFill = (g: GradeId) => (g === 'signature' ? 'var(--gr-holo)' : `var(--gr-${g})`);

/** 등급 색 네모 (알약 칩 아님 — 8×8 네모 + 글자) */
export function Swatch({ grade, size = 8, className }: { grade: GradeId; size?: number; className?: string }) {
  return <i className={[s.sw, className].filter(Boolean).join(' ')} style={{ width: size, height: size, background: gradeFill(grade) }} aria-hidden />;
}

/** 등급 이름 (짧게) — 프랜차이즈 엘리트는 좁은 곳에서 '프랜차이즈' */
export const gradeShort = (g: GradeId) => (g === 'franchise' ? '프랜차이즈' : g === 'gg' ? 'GG' : g === 'th' ? 'TH' : GRADES[g].ko);

/** 확률 막대 — 칸 폭 = 확률 (아주 작은 등급도 보이게 최소 2px) */
export function OddsBar({ rows, className, height = 8 }: { rows: OddsRow[]; className?: string; height?: number }) {
  const asc = [...rows].reverse();
  return (
    <div className={[s.bar, className].filter(Boolean).join(' ')} style={{ height }} role="img" aria-label={rows.map((r) => `${GRADES[r.grade].ko} ${r.pct.toFixed(2)}%`).join(', ')}>
      {asc.map((r) => (
        <i key={r.grade} style={{ flexGrow: r.pct, background: gradeFill(r.grade) }} />
      ))}
    </div>
  );
}

/** 천장 눈금 — night·broadcast 는 칸, classic 은 연필로 긋는 正 자 (5개씩) */
export function PityTally({ count, max, className }: { count: number; max: number; className?: string }) {
  const { theme } = useTheme();
  // 천장이 길면(40팩 넘게) 칸 · 正 대신 막대 하나 — 칸이 너무 잘아지거나 옆으로 넘치지 않게
  if (max > 40) {
    return (
      <div className={[s.bar, theme === 'classic' && s.barPencil, className].filter(Boolean).join(' ')} role="img" aria-label={`천장 ${count}/${max}`}>
        <i style={{ width: `${Math.min(100, (count / max) * 100)}%` }} />
      </div>
    );
  }
  if (theme === 'classic') return <PencilTally count={count} max={max} className={className} />;
  return (
    <div className={[s.cells, className].filter(Boolean).join(' ')} style={{ '--n': max } as CSSProperties} role="img" aria-label={`천장 ${count}/${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <i key={i} className={[i < count && s.cellOn, i === max - 1 && s.cellLast].filter(Boolean).join(' ')} />
      ))}
    </div>
  );
}

/* 正 — 획 순서: 위 가로 · 가운데 세로 · 오른쪽 짧은 가로 · 왼쪽 세로 · 아래 가로 */
const JEONG = ['M3 3.4H17.2', 'M10.1 3.4V19.2', 'M10.1 11.2H15.6', 'M4.9 11V19.2', 'M2.2 19.6H18'];

function PencilTally({ count, max, className }: { count: number; max: number; className?: string }) {
  const groups = Math.ceil(max / 5);
  return (
    <svg className={[s.pencil, className].filter(Boolean).join(' ')} viewBox={`0 0 ${groups * 24} 23`} width={groups * 24} height={23} role="img" aria-label={`천장 ${count}/${max}`}>
      {Array.from({ length: groups }, (_, gi) => (
        <g key={gi} transform={`translate(${gi * 24} 0)`}>
          {JEONG.map((d, k) => {
            const i = gi * 5 + k;
            if (i >= max) return null;
            return <path key={k} d={d} className={i < count ? s.lead : s.ghost} style={{ transform: `rotate(${((i * 37) % 7) - 3}deg)` }} />;
          })}
        </g>
      ))}
    </svg>
  );
}

/** 가격 — GP 동전 또는 골든볼 + 자리 맞춤 숫자 */
export function Price({ price, className }: { price: Pack['price']; className?: string }) {
  return price.ball != null ? (
    <span className={[s.price, className].filter(Boolean).join(' ')}><GoldenBall size={14} /><span className="num">{fmt.int(price.ball)}</span></span>
  ) : (
    <span className={[s.price, className].filter(Boolean).join(' ')}><CoinGP size={14} /><span className="num">{fmt.int(price.gp ?? 0)}</span></span>
  );
}
