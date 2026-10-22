// 팩 그림 — 위·아래 톱니 봉합 + 절취선 + 찢는 곳(V). 테마마다 재질이 다르다.
//   night      금속 포일 (그래파이트 · 금 · 진홍 · 세피아 종이 + 밀랍 봉인 · 시즌 은박 · 구단색)
//   broadcast  중계 그래픽처럼 평평한 면 + 굵은 사선 띠
//   classic    왁스 종이 포장에 먹 + 별색 한 가지로 찍은 인쇄 (망점 · 판 어긋남)
// tear(0~1) 를 주면 절취선 위 띠가 들리고, 틈으로 빛이 샌다(찢기 연출). signal(0~3)은 팩 옆선 빛줄 — 결과와 반드시 일치.
import { useId, type CSSProperties } from 'react';
import type { Team } from '../../game/types';
import { Emblem } from '../../ui';
import { useTheme } from '../../theme/ThemeProvider';
import type { PackSkin } from './local-mock';
import s from './PackArt.module.css';

const W = 200, H = 300, TOOTH = 8, DEPTH = 5, PERF = 40;

function zig(y0: number, y1: number, fromLeft: boolean) {
  const pts: string[] = [];
  const n = W / (TOOTH / 2);
  for (let i = 0; i <= n; i++) {
    const x = fromLeft ? i * (TOOTH / 2) : W - i * (TOOTH / 2);
    pts.push(`${x} ${i % 2 ? y1 : y0}`);
  }
  return pts;
}
const TOP = zig(0, DEPTH, true);
const BOT = zig(H, H - DEPTH, false);
const OUTLINE = `M${TOP.join('L')}L${BOT.join('L')}Z`;
const TOP_PART = `M${TOP.join('L')}L${W} ${PERF}L0 ${PERF}Z`;
const BODY_PART = `M0 ${PERF}L${W} ${PERF}L${BOT.join('L')}Z`;

export interface PackArtProps {
  skin: PackSkin;
  /** 한글 이름 (프리미엄팩) */
  name: string;
  en: string;
  /** 아래 작은 꼬리표 (스페셜 이상) */
  tag: string;
  /** 연도팩 — 2027 */
  year?: number;
  /** 구단팩 */
  team?: Team;
  /** 고른 팩 — 반사 띠가 지나감 */
  shine?: boolean;
  /** 찢기 진행 0~1 */
  tear?: number;
  /** 찢어서 띠가 날아감 */
  torn?: boolean;
  /** 결과 신호 빛줄 0~3 (연출 세기 — 결과와 같다) */
  signal?: 0 | 1 | 2 | 3;
  /** 신호 빛 색 */
  light?: string;
  className?: string;
  style?: CSSProperties;
}

/** 리그 공통 장식 — 아홉 꼭짓점 별 */
function star9(cx: number, cy: number, r: number, k = 0.52) {
  const pts: string[] = [];
  for (let i = 0; i < 18; i++) {
    const rr = i % 2 ? r * k : r;
    const a = -Math.PI / 2 + (i * Math.PI) / 9;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

/** 밀랍 봉인 가장자리 — 살짝 울퉁불퉁한 원 */
function seal(cx: number, cy: number, r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const rr = r * (1 + (i % 3 === 0 ? 0.06 : i % 2 ? -0.025 : 0.02));
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

function Mark({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g className={s.mark} transform={`translate(${cx} ${cy})`}>
      <rect x="-30" y="-30" width="60" height="60" transform="rotate(45)" fill="none" strokeWidth="2.2" />
      <rect x="-22.5" y="-22.5" width="45" height="45" transform="rotate(45)" fill="none" strokeWidth="1" opacity=".5" />
      <circle r="13.5" fill="none" strokeWidth="2" />
      <path d="M-7.6 -11.2c3.2 3 4.8 6.8 4.8 11.2s-1.6 8.2-4.8 11.2M7.6 -11.2c-3.2 3-4.8 6.8-4.8 11.2s1.6 8.2 4.8 11.2" fill="none" strokeWidth="1.4" strokeLinecap="round" />
    </g>
  );
}

export function PackArt({ skin, name, en, tag, year, team, shine, tear = 0, torn, signal = 0, light, className, style }: PackArtProps) {
  const { theme } = useTheme();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (k: string) => `pk${uid}${k}`;
  const t = Math.max(0, Math.min(1, tear));
  const vars = {
    '--team': team?.colors.primary ?? '#555',
    '--team2': team?.colors.secondary ?? '#222',
    '--team-ink': team?.colors.ink ?? '#fff',
    '--light': light ?? '#FFF4DE',
    '--tear': t,
    ...style,
  } as CSSProperties;

  const flat = theme === 'broadcast';
  const print = theme === 'classic';
  const yy = year != null ? `’${String(year).slice(-2)}` : '';

  /* 몸통 그림 (위 띠·몸통 두 조각에서 같이 씀) */
  const art = (
    <g>
      <rect width={W} height={H} fill={`url(#${id('base')})`} className={s.base} />
      {print && <rect width={W} height={H} className={s.paperGrain} />}
      {!flat && !print && (
        <g className={s.facets}>
          <path d="M0 0 120 0 0 170Z" opacity=".07" fill="#fff" />
          <path d="M200 70 200 300 60 300Z" opacity=".12" fill="#000" />
          <path d="M0 210 110 300 0 300Z" opacity=".06" fill="#fff" />
        </g>
      )}
      {flat && (
        <g className={s.stripes}>
          <path d="M-20 158 220 72 220 110 -20 196Z" className={s.stripeA} />
          <path d="M-20 203 220 117 220 124 -20 210Z" className={s.stripeB} />
        </g>
      )}
      {print && (
        <g>
          <rect x="16" y="140" width="168" height="120" fill={`url(#${id('dots')})`} mask={`url(#${id('fade')})`} />
          <rect x="11.5" y="47.5" width="177" height="215" className={s.frameOuter} />
          <rect x="15.5" y="51.5" width="169" height="207" className={s.frameInner} />
        </g>
      )}

      {/* 가운데 그림 */}
      {skin === 'year' ? (
        <g className={s.yearArt}>
          <text x="100" y="78" className={s.yearKicker} textAnchor="middle">SEASON</text>
          <text x="100" y="168" className={s.yearBig} textAnchor="middle">{yy || '’27'}</text>
          <text x="100" y="190" className={s.yearSmall} textAnchor="middle">{year ?? 2027}</text>
        </g>
      ) : skin === 'club' && team ? (
        <g transform="translate(56 66)">
          <circle cx="44" cy="44" r="50" className={s.clubDisc} />
          <Emblem team={team} size={88} />
        </g>
      ) : skin === 'sepia' ? (
        <g className={s.sealG}>
          <path d={seal(100, 124, 34)} className={s.seal} />
          <circle cx="100" cy="124" r="25" className={s.sealRing} />
          <path d={star9(100, 124, 15)} className={s.sealStar} />
        </g>
      ) : (
        <Mark cx={100} cy={122} />
      )}

      {/* 이름 — classic 은 별색 판이 살짝 어긋남 */}
      {print && <text x="100.9" y={(skin === 'year' ? 222 : 212) + 0.7} textAnchor="middle" className={[s.nameKo, s.misreg].join(' ')}>{name}</text>}
      <text x="100" y={skin === 'year' ? 222 : 212} textAnchor="middle" className={s.nameKo}>{name}</text>
      <text x="100" y={skin === 'year' ? 238 : 229} textAnchor="middle" className={s.nameEn}>{en}</text>
      <g transform={`translate(100 ${skin === 'year' ? 247 : 240})`}>
        <rect x="-38" y="0" width="76" height="17" rx={print ? 0 : 2} className={s.tagBox} />
        <text x="0" y="12" textAnchor="middle" className={s.tagText}>{tag}</text>
      </g>

      {/* 위 봉합 띠 + 절취선 · 아래 봉합 띠 */}
      <rect width={W} height="30" className={s.crimp} />
      <rect y="30" width={W} height="1" className={s.crimpLine} />
      <rect width={W} height="30" fill={`url(#${id('ridge')})`} className={s.ridges} />
      <line x1="6" y1={PERF} x2="194" y2={PERF} className={s.perf} />
      <path d="M172 30 178 36 184 30" className={s.notch} />
      <rect y={H - 26} width={W} height="26" className={s.crimp} />
      <rect y={H - 27} width={W} height="1" className={s.crimpLine} />
      <rect y={H - 26} width={W} height="26" fill={`url(#${id('ridge')})`} className={s.ridges} />
      {print && <text x="14" y={H - 9} className={s.printFine}>30 CARDS · 2027 · 한별 리그</text>}

      {/* 반사 띠 */}
      {!print && (
        <g className={[s.sheen, shine && s.sheenOn].filter(Boolean).join(' ')}>
          <rect x="34" y="-20" width="58" height={H + 40} fill={`url(#${id('sheen')})`} transform={`skewX(-14)`} />
        </g>
      )}
    </g>
  );

  return (
    <svg
      viewBox={`-8 -8 ${W + 16} ${H + 16}`}
      className={[s.pack, s['k-' + skin], s['t-' + theme], torn && s.torn, className].filter(Boolean).join(' ')}
      style={vars}
      role="img"
      aria-label={`${name} 팩${year ? ' ' + year : ''}${team ? ' ' + team.name : ''}`}
    >
      <defs>
        <linearGradient id={id('base')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className={s.s0} />
          <stop offset=".2" className={s.s1} />
          <stop offset=".42" className={s.s2} />
          <stop offset=".62" className={s.s3} />
          <stop offset=".82" className={s.s4} />
          <stop offset="1" className={s.s5} />
        </linearGradient>
        <linearGradient id={id('sheen')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".34" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <pattern id={id('ridge')} width="5" height="30" patternUnits="userSpaceOnUse">
          <rect width="1" height="30" className={s.ridge} />
        </pattern>
        <pattern id={id('dots')} width="4.2" height="4.2" patternUnits="userSpaceOnUse" patternTransform="rotate(15)">
          <circle cx="2.1" cy="2.1" r="1" className={s.dot} />
        </pattern>
        <linearGradient id={id('fadeG')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#fff" stopOpacity="1" />
        </linearGradient>
        <mask id={id('fade')} maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
          <rect x="16" y="140" width="168" height="120" fill={`url(#${id('fadeG')})`} />
        </mask>
        <clipPath id={id('top')}><path d={TOP_PART} /></clipPath>
        <clipPath id={id('body')}><path d={BODY_PART} /></clipPath>
        <clipPath id={id('all')}><path d={OUTLINE} /></clipPath>
      </defs>

      {/* 바닥 그림자 */}
      <ellipse cx="100" cy={H + 2} rx="88" ry="6" className={s.floor} />

      {/* 틈으로 새는 빛 */}
      {t > 0 && <rect x="0" y={PERF - 3} width={W} height="6" className={s.leak} style={{ opacity: Math.min(1, t * 1.4) }} />}

      <g clipPath={`url(#${id('body')})`}>{art}</g>
      <path d={BODY_PART} className={s.edge} />

      <g className={s.strip} style={{ transform: `translate(${t * 6}px, ${-t * 22}px) rotate(${-t * 13}deg)` }}>
        <g clipPath={`url(#${id('top')})`}>{art}</g>
        <path d={TOP_PART} className={s.edge} />
      </g>

      {/* 결과 신호 — 팩 옆선 빛줄 (0~3) */}
      {signal > 0 && (
        <g clipPath={`url(#${id('all')})`} className={s.signal}>
          {Array.from({ length: signal }, (_, i) => (
            <g key={i} style={{ animationDelay: `${i * 260}ms` }} className={s.ray}>
              <rect x="0" y="0" width="2.4" height="90" />
              <rect x={W - 2.4} y="0" width="2.4" height="90" />
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}
