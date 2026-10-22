// 위에서 본 야구장 — 좌표는 game/field.ts (홈 (0.5,1), 좌·우 폴 (0,0.5)·(1,0.5), 1 = 140m).
// 정사각형이라 자식 HTML 은 left: x*100%, top: y*100% 로 올리면 같은 자리에 선다.
// 구장마다 다르게(요구사항 33번): 담장 거리·높이(높은 벽은 두껍게 + 높이 숫자), 파울 지역 넓이, 인조잔디, 돔, 외야 너머 풍경.
// 색은 테마 토큰(--field-*)만 쓴다.
import { useId, type ReactNode } from 'react';
import type { Stadium } from '../game/types';
import { BASES, FIELD_M, fenceAt, mToField, polarToField } from '../game/field';
import s from './Field.module.css';

const S = 400; // SVG 한 변
type Pt = { x: number; y: number };
const P = (p: Pt) => `${(p.x * S).toFixed(1)} ${(p.y * S).toFixed(1)}`;
const m2u = (m: number) => (m / FIELD_M) * S;
const path = (pts: Pt[], close = true) => `M${pts.map(P).join(' L')}${close ? ' Z' : ''}`;
const smooth = (t: number) => t * t * (3 - 2 * t);

type FieldStadium = Pick<Stadium, 'fence'> & Partial<Pick<Stadium, 'wallM' | 'roof' | 'surface' | 'foul' | 'backdrop'>>;

export interface FieldProps {
  /** 구장 — 거리·담장 높이·파울 지역·잔디·지붕·풍경. 없으면 표준 구장 */
  stadium?: FieldStadium;
  /** (예전 방식) 담장 거리만 */
  fence?: [number, number, number];
  /** 담장 거리 숫자 */
  distances?: boolean;
  /** 조명 웅덩이 (night 테마에서만 보임) */
  lights?: boolean;
  /** 외야 너머 풍경 그리기 */
  scenery?: boolean;
  /** SVG 안에 같이 그릴 것 (좌표: 0~400) */
  svg?: ReactNode;
  /** 위에 올릴 HTML (선수 카드 등) */
  children?: ReactNode;
  className?: string;
  /** 접근성 설명 */
  label?: string;
}

/** 각도별 담장 높이 (좌·중·우 사이를 부드럽게) */
function wallAt(w: [number, number, number], ang: number) {
  const t = Math.max(-1, Math.min(1, ang / 45));
  return t < 0 ? w[1] + (w[0] - w[1]) * smooth(-t) : w[1] + (w[2] - w[1]) * smooth(t);
}

function Scenery({ kind }: { kind: NonNullable<FieldStadium['backdrop']> }) {
  switch (kind) {
    case 'sea':
      return (
        <g className={s.sea}>
          <rect x="-60" y="-60" width={S + 120} height="96" />
          <path d="M-20 14c16-5 32-5 48 0s32 5 48 0 32-5 48 0 32 5 48 0 32-5 48 0 32 5 48 0 32-5 48 0 32 5 48 0 32-5 48 0M-20 26c16-5 32-5 48 0s32 5 48 0 32-5 48 0 32 5 48 0 32-5 48 0 32 5 48 0 32-5 48 0 32 5 48 0 32-5 48 0" className={s.wave} />
        </g>
      );
    case 'river':
      return <path d={`M-40 30C80 6 160 44 240 20S360 0 ${S + 40} 16V-40H-40Z`} className={s.river} />;
    case 'city': {
      const xs = [0, 18, 30, 52, 70, 84, 104, 126, 140, 158, 178, 196, 214, 236, 252, 270, 290, 308, 326, 344, 362, 384];
      const hs = [22, 34, 18, 40, 26, 46, 30, 20, 38, 28, 52, 24, 36, 30, 44, 22, 34, 48, 26, 38, 20, 30];
      return <path d={xs.map((x, i) => `M${x} 0h${(xs[i + 1] ?? S + 20) - x - 2}v${hs[i] * 0.5}h-${(xs[i + 1] ?? S + 20) - x - 2}Z`).join('')} className={s.city} transform="translate(0 -6)" />;
    }
    case 'mountain':
      return <path d="M-40 34 30 4 76 26 128 -2 190 30 246 6 300 28 352 2 440 32V-40H-40Z" className={s.mountain} />;
    case 'fortress': {
      let d = 'M-20 22H420V-40H-20Z';
      for (let x = -20; x < 420; x += 16) d += `M${x} 22h9v6h-9Z`;
      return <path d={d} className={s.fortress} />;
    }
    default:
      return null;
  }
}

export function Field({
  stadium, fence: fenceProp, distances = true, lights = true, scenery = true, svg, children, className, label = '야구장',
}: FieldProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const fence = stadium?.fence ?? fenceProp ?? [99, 122, 99];
  const wallM = stadium?.wallM ?? [3, 3, 3];
  const foulK = stadium?.foul === 'narrow' ? 0.72 : stadium?.foul === 'wide' ? 1.32 : 1;
  const turf = stadium?.surface === 'turf';
  const dome = stadium?.roof === 'dome';
  const home = BASES.home;

  const steps = 48;
  const angs = Array.from({ length: steps + 1 }, (_, i) => -45 + (90 * i) / steps);
  const wall = angs.map((a) => polarToField(a, fenceAt(fence, a)));
  const wallOut = angs.map((a) => polarToField(a, fenceAt(fence, a) + 0.9 + wallAt(wallM, a) * 0.62));
  const grassEdge = angs.map((a) => polarToField(a, fenceAt(fence, a) - 4.6));
  const outer = angs.map((a) => polarToField(a, fenceAt(fence, a) + 4.4 + wallAt(wallM, a) * 0.62));
  const side = 4 * foulK;
  const lfOut = mToField(-fence[0] * Math.SQRT1_2 - side, fence[0] * Math.SQRT1_2 - side);
  const rfOut = mToField(fence[2] * Math.SQRT1_2 + side, fence[2] * Math.SQRT1_2 - side);
  const back = 18 * foulK;
  const ground = path([
    mToField(-24 * foulK, -9 * foulK), mToField(-13 * foulK, -0.9 * back), mToField(0, -back), mToField(13 * foulK, -0.9 * back), mToField(24 * foulK, -9 * foulK),
    rfOut, ...outer.slice().reverse(), lfOut,
  ]);
  const fair = path([home, ...wall]);
  const grass = path([home, ...grassEdge]);
  const wallBand = path([...wall, ...wallOut.slice().reverse()]);
  const { first, second, third, mound } = BASES;
  const mx = mound.x * S, my = mound.y * S;
  const lf = wall[0], cf = wall[steps / 2], rf = wall[steps];
  const skin = 0.84;
  const ig = (b: Pt) => ({ x: home.x + (b.x - home.x) * skin, y: home.y + (b.y - home.y) * skin - 0.012 });
  const hi = (h: number) => (h >= 5 ? ` · ${h}m` : '');

  return (
    <div className={[s.field, className].filter(Boolean).join(' ')}>
      <svg className={s.svg} viewBox={`0 0 ${S} ${S}`} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
        <defs>
          {turf ? (
            <pattern id={`mow${uid}`} width="12" height="12" patternUnits="userSpaceOnUse" patternTransform={`translate(${S / 2} ${S})`}>
              <rect width="12" height="12" className={s.g1} />
              <rect width="12" height="6" className={s.g2} />
            </pattern>
          ) : (
            <pattern id={`mow${uid}`} width="28" height="28" patternUnits="userSpaceOnUse" patternTransform={`translate(${S / 2} ${S}) rotate(45)`}>
              <rect width="28" height="28" className={s.g1} />
              <rect width="14" height="14" className={s.g2} />
              <rect x="14" y="14" width="14" height="14" className={s.g2} />
            </pattern>
          )}
          <radialGradient id={`pool${uid}`} cx=".5" cy=".5" r=".5">
            <stop offset="0" style={{ stopColor: 'var(--field-light)', stopOpacity: 'var(--field-light-a)' }} />
            <stop offset=".6" style={{ stopColor: 'var(--field-light)', stopOpacity: 'calc(var(--field-light-a) * .3)' }} />
            <stop offset="1" style={{ stopColor: 'var(--field-light)', stopOpacity: 0 }} />
          </radialGradient>
          <clipPath id={`fair${uid}`}><path d={fair} /></clipPath>
        </defs>

        <rect x="-60" y="-60" width={S + 120} height={S + 120} className={s.stands} />
        {scenery && stadium?.backdrop && <Scenery kind={stadium.backdrop} />}
        {dome && <circle cx={S / 2} cy={S * 0.62} r={S * 0.62} className={s.dome} />}
        <path d={ground} className={s.foul} />
        <path d={fair} className={s.track} />
        <path d={grass} fill={`url(#mow${uid})`} />

        {/* 내야 흙 — 인조잔디 구장은 베이스 둘레만 */}
        {turf ? (
          <g className={s.dirt}>
            {[first, second, third].map((b, i) => <circle key={i} cx={b.x * S} cy={b.y * S} r={m2u(3)} />)}
          </g>
        ) : (
          <g clipPath={`url(#fair${uid})`}>
            <circle cx={mx} cy={my} r={m2u(29)} className={s.dirt} />
          </g>
        )}
        {!turf && <path d={path([ig(home), ig(first), ig(second), ig(third)])} fill={`url(#mow${uid})`} className={s.infieldGrass} />}
        <circle cx={home.x * S} cy={home.y * S - 2} r={m2u(4.2)} className={s.dirt} />
        <path d={path([home, first, second, third])} className={turf ? s.pathTurf : s.path} />
        <path d={`M${P(home)} L${P(lf)} M${P(home)} L${P(rf)}`} className={s.lines} />
        <circle cx={mx} cy={my} r={m2u(2.7)} className={s.mound} />
        <rect x={mx - 2.6} y={my - 0.6} width="5.2" height="1.2" className={s.base} />
        {[first, second, third].map((b, i) => (
          <rect key={i} x={b.x * S - 2.6} y={b.y * S - 2.6} width="5.2" height="5.2" transform={`rotate(45 ${b.x * S} ${b.y * S})`} className={s.base} />
        ))}
        <path d={`M${home.x * S - 2.6} ${home.y * S - 3.4}h5.2v2.2l-2.6 2.4-2.6-2.4z`} className={s.base} />
        <path d={`M${home.x * S - 9} ${home.y * S - 8}h5v10h-5z M${home.x * S + 4} ${home.y * S - 8}h5v10h-5z`} className={s.box} />

        {/* 담장 — 높을수록 두껍게 */}
        <path d={wallBand} className={s.wall} />
        <path d={path(wall, false)} className={s.wallTop} />
        {distances && (
          <g className={s.dist}>
            <text x={lf.x * S + 18} y={lf.y * S - 6}>{fence[0]}{hi(wallM[0])}</text>
            <text x={cf.x * S} y={cf.y * S + 16} textAnchor="middle">{fence[1]}{hi(wallM[1])}</text>
            <text x={rf.x * S - 18} y={rf.y * S - 6} textAnchor="end">{fence[2]}{hi(wallM[2])}</text>
          </g>
        )}

        {lights && !dome && (
          <g className={s.lights}>
            <ellipse cx={S * 0.3} cy={S * 0.38} rx={S * 0.38} ry={S * 0.32} fill={`url(#pool${uid})`} />
            <ellipse cx={S * 0.7} cy={S * 0.38} rx={S * 0.38} ry={S * 0.32} fill={`url(#pool${uid})`} />
            <ellipse cx={S * 0.5} cy={S * 0.74} rx={S * 0.3} ry={S * 0.24} fill={`url(#pool${uid})`} />
          </g>
        )}
        {svg}
      </svg>
      {children && <div className={s.over}>{children}</div>}
    </div>
  );
}
