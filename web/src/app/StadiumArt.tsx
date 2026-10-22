// 로그인 첫 화면 그림 — 홈플레이트 뒤에서 본 밤 경기장. 색은 테마 변수(--hs-*)로 갈아입는다.
import { memo, type ReactElement } from 'react';
import s from './StadiumArt.module.css';

const W = 390, H = 360;

function crowd() {
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const dots: string[] = [];
  for (let i = 0; i < 170; i++) {
    const x = rnd() * W;
    const y = 132 + rnd() * 84;
    if (y < 136 + Math.abs(x - W / 2) * 0.16) continue;
    dots.push(`M${x.toFixed(1)} ${y.toFixed(1)}h.9`);
  }
  return dots.join('');
}
const CROWD = crowd();

function stripes() {
  const out: string[] = [];
  const vx = W / 2, top = 246, bot = H;
  const k = (top - 120) / (bot - 120);
  for (let i = -8; i < 16; i += 2) {
    const xb = -150 + i * 50, xb2 = xb + 50;
    out.push(`M${(vx + (xb - vx) * k).toFixed(1)} ${top}L${(vx + (xb2 - vx) * k).toFixed(1)} ${top}L${xb2} ${bot}L${xb} ${bot}Z`);
  }
  return out.join('');
}
const STRIPES = stripes();

function Tower({ x, y, sc }: { x: number; y: number; sc: number }) {
  const lamps: ReactElement[] = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) lamps.push(<rect key={`${r}${c}`} x={-18.6 + c * 6.4} y={1.6 + r * 4.6} width="4.4" height="3" rx=".6" className={s.lamp} />);
  return (
    <>
      <circle cx={x} cy={y + 7 * sc} r={84 * sc} className={s.glow} />
      <g transform={`translate(${x} ${y}) scale(${sc})`}>
        <rect x="-1.6" y="14" width="3.2" height="130" className={s.pole} />
        <rect x="-21" y="-1" width="42" height="17" rx="1.5" className={s.head} />
        {lamps}
      </g>
    </>
  );
}

export const StadiumArt = memo(function StadiumArt({ className }: { className?: string }) {
  return (
    <svg className={[s.art, className].filter(Boolean).join(' ')} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" aria-hidden>
      <defs>
        <linearGradient id="hsSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--hs-sky1)' }} />
          <stop offset="1" style={{ stopColor: 'var(--hs-sky2)' }} />
        </linearGradient>
        <radialGradient id="hsGlow" cx=".5" cy=".5" r=".5">
          <stop offset="0" style={{ stopColor: 'var(--hs-light)', stopOpacity: 'var(--hs-glow-a)' }} />
          <stop offset=".35" style={{ stopColor: 'var(--hs-light)', stopOpacity: 'calc(var(--hs-glow-a) * .3)' }} />
          <stop offset="1" style={{ stopColor: 'var(--hs-light)', stopOpacity: 0 }} />
        </radialGradient>
        <linearGradient id="hsBeam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--hs-light)', stopOpacity: 'var(--hs-beam-a)' }} />
          <stop offset="1" style={{ stopColor: 'var(--hs-light)', stopOpacity: 0 }} />
        </linearGradient>
        <linearGradient id="hsTurf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--hs-turf1)' }} />
          <stop offset="1" style={{ stopColor: 'var(--hs-turf2)' }} />
        </linearGradient>
      </defs>

      <rect width={W} height={H} fill="url(#hsSky)" />
      <ellipse cx={W / 2} cy="214" rx="300" ry="70" className={s.haze} />
      {/* 빛줄기 */}
      <path d="M52 86 L156 246 L-40 246Z M338 86 L430 246 L234 246Z" fill="url(#hsBeam)" className={s.beams} />
      {/* 위층 관중석 */}
      <path d={`M-10 172C70 142 140 134 ${W / 2} 134S320 142 400 172V246H-10Z`} className={s.stand} />
      {Array.from({ length: 7 }, (_, i) => {
        const y = 146 + i * 12.5, b = i * 2.4;
        return <path key={i} d={`M-10 ${y + 24 - b}C70 ${y - 2} 140 ${y - 8} ${W / 2} ${y - 8}S320 ${y - 2} 400 ${y + 24 - b}`} className={s.row} />;
      })}
      <path d={CROWD} className={s.crowd} />
      {/* 전광판 */}
      <g className={s.board}>
        <rect x="140" y="92" width="110" height="42" className={s.boardFrame} />
        <rect x="144" y="96" width="102" height="34" className={s.boardFace} />
        <text x="150" y="109.5" className={s.boardText}>BS</text>
        <text x="150" y="124" className={s.boardText}>DJ</text>
        <path d="M168 106H226M168 120.5H226" className={s.boardDots} />
        <text x="240" y="109.5" textAnchor="end" className={s.boardText}>0</text>
        <text x="240" y="124" textAnchor="end" className={s.boardText}>0</text>
      </g>
      <Tower x={52} y={78} sc={1} />
      <Tower x={338} y={78} sc={1} />
      <Tower x={130} y={112} sc={0.55} />
      <Tower x={260} y={112} sc={0.55} />
      {/* 담장 · 경고 트랙 · 잔디 */}
      <rect x="0" y="236" width={W} height="12" className={s.wall} />
      <rect x="0" y="236" width={W} height="1.3" className={s.wallTop} />
      <rect x="0" y="248" width={W} height="9" className={s.track} />
      <rect x="0" y="257" width={W} height={H - 257} fill="url(#hsTurf)" />
      <path d={STRIPES} className={s.stripes} transform="translate(0 11)" />
      {/* 내야 — 원근으로 누운 흙 · 마운드 · 2루 */}
      <ellipse cx={W / 2} cy={H + 56} rx="250" ry="92" className={s.dirt} />
      <ellipse cx={W / 2} cy={H + 62} rx="176" ry="58" className={s.infield} />
      <ellipse cx={W / 2} cy={H - 12} rx="22" ry="6.5" className={s.dirt} />
      <path d={`M${W / 2 - 4} ${H - 63}l4-2.2 4 2.2-4 2.2z`} className={s.base} />
      <rect x="0" y="257" width={W} height="34" className={s.lightPool} />
    </svg>
  );
});
