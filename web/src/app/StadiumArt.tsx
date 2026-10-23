// 로그인 첫 화면 그림 — 개막전 밤 경기장(홈플레이트 뒤 높은 곳에서 본 장면) · 조명탑 빛줄기 · 전광판 'PLAY BALL' · 날아오르는 타구.
//  · 무대 = 정사각형(설계 720 × 720). 그림 칸을 늘 덮게(칸의 가로 · 세로 중 긴 쪽) 아래 가운데에 붙인다 — SVG 'xMidYMax slice' 와 같은 셈을 CSS 로.
//  · 멈춘 그림(하늘 · 관중석 · 조명탑 · 전광판 · 그라운드)은 SVG 한 장 — 한 번만 그린다.
//    움직이는 것(조명 켜짐 · 빛줄기 숨 · 빛 번짐 · 먼지 · 관중석 플래시 · 전광판 훑는 빛 · 타구)은 그 위 얇은 층으로 띄워 transform · opacity 만 바꾼다
//    (휴대폰에서 큰 SVG 를 매 프레임 다시 그리지 않게). 움직임 줄이기 설정이면 모두 멈춘다.
//  · 색은 테마 변수(--hs-*)로 갈아입는다 (StadiumArt.module.css).
import { memo, type CSSProperties } from 'react';
import s from './StadiumArt.module.css';

const W = 720;
const pct = (v: number) => `${(v / W) * 100}%`;

/** 시드 난수 (같은 그림이 늘 같게) */
function rng(seed: number) {
  let x = seed;
  return () => (x = (x * 16807) % 2147483647) / 2147483647;
}

/* ───────── 관중석 ───────── */
/** 위층 관중석 윗선 (가운데가 높은 둥근 지붕선) */
const standTop = (dy = 0) => `M-20 ${250 + dy}C120 ${214 + dy} 250 ${200 + dy} 360 ${200 + dy}S600 ${214 + dy} 740 ${250 + dy}`;
const CANOPY = `M-20 234C120 194 250 180 360 180S600 194 740 234L740 250C600 214 470 200 360 200S120 214 -20 250Z`;
const CROWD = (() => {
  const r = rng(29);
  const out: string[] = [];
  for (let i = 0; i < 420; i++) {
    const x = -10 + r() * 740;
    const top = 252 - 46 * Math.cos(((x - 360) / 380) * (Math.PI / 2)) + 4; // 윗선 아래로
    const y = top + 6 + r() * (338 - top - 8);
    out.push(`M${x.toFixed(1)} ${y.toFixed(1)}h.01`);
  }
  return out.join('');
})();

/** 지붕 끝 조명 — 지붕선을 따라 작은 등 */
const ROOF_LIGHTS = (() => {
  const out: string[] = [];
  for (let x = -10; x <= 730; x += 19) {
    const y = 236 - 54 * Math.cos(((x - 360) / 400) * (Math.PI / 2)) - 1;
    out.push(`M${x} ${y.toFixed(1)}h.01`);
  }
  return out.join('');
})();

/* ───────── 조명탑 ───────── */
function Bank({ x, y, sc }: { x: number; y: number; sc: number }) {
  const lamps: string[] = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) lamps.push(`M${-48 + c * 16.6} ${-22.6 + r * 11.6}h12.6v8.4h-12.6z`);
  return (
    <g transform={`translate(${x} ${y}) scale(${sc})`}>
      <path d="M-3 26V250h6V26z" className={s.pole} />
      <path d="M-56 -30h112v60h-112z" className={s.bank} />
      <path d={lamps.join('')} className={s.lamp} />
    </g>
  );
}
const BIG = [{ x: 150, y: 112 }, { x: 570, y: 112 }];
const SMALL = [{ x: 228, y: 150 }, { x: 492, y: 150 }];

/* ───────── 전광판 — 5 × 7 점 글꼴 ───────── */
const GLYPH: Record<string, string[]> = {
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  ' ': ['000', '000', '000', '000', '000', '000', '000'],
};
const LED = (() => {
  const cols: number[][] = []; // 열마다 켜진 줄
  for (const [i, ch] of [...'PLAY BALL'].entries()) {
    const g = GLYPH[ch];
    if (i > 0) cols.push([]);
    for (let c = 0; c < g[0].length; c++) cols.push(g.map((row, r) => (row[c] === '1' ? r : -1)).filter((r) => r >= 0));
  }
  const pitch = 3.3;
  const x0 = 360 - ((cols.length - 1) * pitch) / 2;
  const y0 = 130;
  let on = '', off = '';
  cols.forEach((lit, c) => {
    for (let r = 0; r < 7; r++) {
      const d = `M${(x0 + c * pitch).toFixed(2)} ${(y0 + r * pitch).toFixed(2)}h.01`;
      if (lit.includes(r)) on += d; else off += d;
    }
  });
  return { on, off };
})();

/* ───────── 그라운드 ───────── */
const STRIPES = (() => {
  const out: string[] = [];
  const vx = 360, vy = 120, top = 366, bot = 720;
  const k = (top - vy) / (bot - vy);
  for (let i = -10; i < 12; i += 2) {
    const xb = 360 + i * 70, xb2 = xb + 70;
    out.push(`M${(vx + (xb - vx) * k).toFixed(1)} ${top}L${(vx + (xb2 - vx) * k).toFixed(1)} ${top}L${xb2} ${bot}L${xb} ${bot}Z`);
  }
  return out.join('');
})();

/* ───────── 타구 — 공 · 실밥 · 빛 꼬리 ───────── */
const BALL = { x: 522, y: 254, r: 30 };
/** 3차 베지어 위 점 */
const bez = (p: number[][], t: number) => {
  const u = 1 - t;
  return [0, 1].map((k) => u * u * u * p[0][k] + 3 * u * u * t * p[1][k] + 3 * u * t * t * p[2][k] + t * t * t * p[3][k]);
};
const SEAMS = (() => {
  const { x, y } = BALL;
  const L = [[x - 19, y - 23], [x - 5, y - 10], [x - 5, y + 10], [x - 19, y + 23]];
  const R = [[x + 19, y - 23], [x + 5, y - 10], [x + 5, y + 10], [x + 19, y + 23]];
  const seam = (p: number[][]) => `M${p[0].join(' ')}C${p[1].join(' ')} ${p[2].join(' ')} ${p[3].join(' ')}`;
  let st = '';
  for (const p of [L, R]) {
    for (let i = 1; i < 9; i++) {
      const t = i / 9;
      const [px, py] = bez(p, t);
      const [qx, qy] = bez(p, Math.min(1, t + 0.01));
      const len = Math.hypot(qx - px, qy - py) || 1;
      const tx = (qx - px) / len, ty = (qy - py) / len; // 실밥 줄 방향
      const nx = -ty, ny = tx; // 수직
      // V 자 바늘땀 — 줄 양쪽으로
      const a = 3.4, b = 1.6;
      st += `M${(px + nx * a - tx * b).toFixed(2)} ${(py + ny * a - ty * b).toFixed(2)}L${px.toFixed(2)} ${py.toFixed(2)}L${(px - nx * a - tx * b).toFixed(2)} ${(py - ny * a - ty * b).toFixed(2)}`;
    }
  }
  return { seam: seam(L) + seam(R), stitch: st };
})();
const TRAIL = (() => {
  const { x, y } = BALL;
  // 홈플레이트(360, 760) 쪽으로 꼬리
  const dx = 360 - x, dy = 760 - y;
  const l = Math.hypot(dx, dy);
  const ux = dx / l, uy = dy / l, nx = -uy, ny = ux;
  const len = 250, w0 = 25, w1 = 1.5;
  const p = (along: number, side: number) => `${(x + ux * along + nx * side).toFixed(1)} ${(y + uy * along + ny * side).toFixed(1)}`;
  const tail = `M${p(0, w0)}L${p(len, w1)}L${p(len, -w1)}L${p(0, -w0)}Z`;
  const lines = [-15, 9, 19].map((side, i) => `M${p(14 + i * 10, side)}L${p(150 + i * 34, side * 0.35)}`).join('');
  return { tail, lines, x1: x, y1: y, x2: x + ux * len, y2: y + uy * len };
})();

/* ───────── 움직이는 층 — 먼지 · 플래시 ───────── */
const DUST = (() => {
  const r = rng(7);
  return Array.from({ length: 18 }, (_, i) => {
    const left = i % 2 === 0;
    const t = r();
    const y = 170 + t * 380;
    const x = left ? 150 + (t * 200) - 50 + r() * 110 : 570 - (t * 200) + 50 - r() * 110;
    return { x, y, d: 2 + r() * 2.4, dur: 9 + r() * 8, delay: -r() * 16, dx: (r() - 0.5) * 30 };
  });
})();
const FLASH = (() => {
  const r = rng(91);
  return Array.from({ length: 14 }, () => {
    const x = 20 + r() * 680;
    const top = 252 - 46 * Math.cos(((x - 360) / 380) * (Math.PI / 2)) + 10;
    return { x, y: top + r() * (330 - top), dur: 3.5 + r() * 6, delay: -r() * 9 };
  });
})();

export const StadiumArt = memo(function StadiumArt({ className }: { className?: string }) {
  return (
    <div className={[s.art, className].filter(Boolean).join(' ')} aria-hidden>
      <div className={s.stage}>
        {/* ── 멈춘 그림 ── */}
        <svg className={s.scene} viewBox={`0 0 ${W} ${W}`}>
          <defs>
            <linearGradient id="tsSky" x1="0" y1="0" x2="0" y2="340" gradientUnits="userSpaceOnUse">
              <stop offset="0" style={{ stopColor: 'var(--hs-sky1)' }} />
              <stop offset=".55" style={{ stopColor: 'var(--hs-sky2)' }} />
              <stop offset="1" style={{ stopColor: 'var(--hs-sky3)' }} />
            </linearGradient>
            <radialGradient id="tsBloom" cx=".5" cy=".5" r=".5">
              <stop offset="0" style={{ stopColor: 'var(--hs-light)', stopOpacity: 'var(--hs-bloom-a)' }} />
              <stop offset=".3" style={{ stopColor: 'var(--hs-light)', stopOpacity: 'calc(var(--hs-bloom-a) * .35)' }} />
              <stop offset="1" style={{ stopColor: 'var(--hs-light)', stopOpacity: 0 }} />
            </radialGradient>
            <radialGradient id="tsHaze" cx=".5" cy=".5" r=".5">
              <stop offset="0" style={{ stopColor: 'var(--hs-haze)', stopOpacity: 'var(--hs-haze-a)' }} />
              <stop offset="1" style={{ stopColor: 'var(--hs-haze)', stopOpacity: 0 }} />
            </radialGradient>
            <linearGradient id="tsTurf" x1="0" y1="366" x2="0" y2="720" gradientUnits="userSpaceOnUse">
              <stop offset="0" style={{ stopColor: 'var(--hs-turf1)' }} />
              <stop offset="1" style={{ stopColor: 'var(--hs-turf2)' }} />
            </linearGradient>
            <radialGradient id="tsPool" cx=".5" cy=".5" r=".5">
              <stop offset="0" style={{ stopColor: 'var(--hs-light)', stopOpacity: 'var(--hs-pool-a)' }} />
              <stop offset="1" style={{ stopColor: 'var(--hs-light)', stopOpacity: 0 }} />
            </radialGradient>
          </defs>

          <rect width={W} height={W} fill="url(#tsSky)" />
          <ellipse cx="360" cy="300" rx="560" ry="150" fill="url(#tsHaze)" />
          {/* 조명 번짐(멈춘 몫) */}
          {BIG.map((b) => <circle key={b.x} cx={b.x} cy={b.y} r="150" fill="url(#tsBloom)" />)}
          {SMALL.map((b) => <circle key={b.x} cx={b.x} cy={b.y} r="74" fill="url(#tsBloom)" />)}
          {/* 조명탑 기둥은 관중석 뒤로 */}
          {SMALL.map((b) => <Bank key={b.x} x={b.x} y={b.y} sc={0.5} />)}
          {BIG.map((b) => <Bank key={b.x} x={b.x} y={b.y} sc={1} />)}
          {/* 전광판 */}
          <path d="M318 162v24M402 162v24" className={s.boardLeg} />
          <rect x="270" y="118" width="180" height="44" rx="2" className={s.boardFrame} />
          <rect x="275" y="123" width="170" height="34" className={s.boardFace} />
          <path d={LED.off} className={s.ledOff} />
          <path d={LED.on} className={s.ledOn} />
          {/* 위층 관중석 · 지붕 */}
          <path d={`${standTop()}L740 344L-20 344Z`} className={s.stand} />
          {Array.from({ length: 7 }, (_, i) => <path key={i} d={standTop(12 + i * 12)} className={s.row} />)}
          <path d={CROWD} className={s.crowd} />
          <path d={CANOPY} className={s.canopy} />
          <path d={ROOF_LIGHTS} className={s.roofLights} />
          <path d={standTop()} className={s.fascia} />
          <path d={standTop(5)} className={s.ribbon} />
          <path d={standTop(5)} className={s.ribbonText} />
          <ellipse cx="150" cy="280" rx="170" ry="64" fill="url(#tsPool)" />
          <ellipse cx="570" cy="280" rx="170" ry="64" fill="url(#tsPool)" />
          {/* 담장 · 경고 트랙 · 잔디 */}
          <rect x="-20" y="342" width="760" height="14" className={s.wall} />
          <rect x="-20" y="342" width="760" height="2" className={s.wallTop} />
          <rect x="-20" y="356" width="760" height="10" className={s.track} />
          <rect x="-20" y="366" width="760" height="360" fill="url(#tsTurf)" />
          <path d={STRIPES} className={s.stripes} />
          {/* 내야 · 파울 선 */}
          <ellipse cx="360" cy="830" rx="430" ry="250" className={s.dirt} />
          <ellipse cx="360" cy="850" rx="300" ry="215" className={s.infield} />
          <path d="M360 860L-160 366M360 860L880 366" className={s.chalk} />
          <ellipse cx="360" cy="700" rx="34" ry="9" className={s.dirt} />
          <path d="M360 596l10 4.4-10 4.4-10-4.4zM590 686l10 4.4-10 4.4-10-4.4zM130 686l10 4.4-10 4.4-10-4.4z" className={s.base} />
          <ellipse cx="360" cy="610" rx="420" ry="170" fill="url(#tsPool)" />
        </svg>

        {/* ── 움직이는 층 ── */}
        <svg className={[s.layer, s.beamsL].join(' ')} viewBox={`0 0 ${W} ${W}`}>
          <defs>
            <linearGradient id="tsBeam" x1="0" y1="130" x2="0" y2="640" gradientUnits="userSpaceOnUse">
              <stop offset="0" style={{ stopColor: 'var(--hs-light)', stopOpacity: 'var(--hs-beam-a)' }} />
              <stop offset="1" style={{ stopColor: 'var(--hs-light)', stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <path d="M112 136L188 136L500 720L50 720ZM221 166L235 166L380 640L180 640Z" fill="url(#tsBeam)" />
        </svg>
        <svg className={[s.layer, s.beamsR].join(' ')} viewBox={`0 0 ${W} ${W}`}>
          <path d="M532 136L608 136L670 720L220 720ZM485 166L499 166L540 640L340 640Z" fill="url(#tsBeam)" />
        </svg>
        <svg className={[s.layer, s.blooms].join(' ')} viewBox={`0 0 ${W} ${W}`}>
          {BIG.map((b) => <circle key={b.x} cx={b.x} cy={b.y} r="76" fill="url(#tsBloom)" />)}
          {BIG.map((b) => <ellipse key={'f' + b.x} cx={b.x} cy={b.y} rx="150" ry="1" className={s.flare} />)}
          {SMALL.map((b) => <circle key={b.x} cx={b.x} cy={b.y} r="38" fill="url(#tsBloom)" />)}
        </svg>
        <div className={s.dust}>
          {DUST.map((d, i) => (
            <i key={i} style={{ left: pct(d.x), top: pct(d.y), width: d.d, height: d.d, animationDuration: `${d.dur}s`, animationDelay: `${d.delay}s`, '--dx': `${d.dx}px` } as CSSProperties} />
          ))}
        </div>
        <div className={s.flashes}>
          {FLASH.map((f, i) => (
            <i key={i} style={{ left: pct(f.x), top: pct(f.y), animationDuration: `${f.dur}s`, animationDelay: `${f.delay}s` }} />
          ))}
        </div>
        <div className={s.scan} style={{ left: pct(275), top: pct(123), width: pct(170), height: pct(34) }} />
        <svg className={[s.layer, s.ball].join(' ')} viewBox={`0 0 ${W} ${W}`}>
          <defs>
            <linearGradient id="tsTrail" x1={TRAIL.x1} y1={TRAIL.y1} x2={TRAIL.x2} y2={TRAIL.y2} gradientUnits="userSpaceOnUse">
              <stop offset="0" style={{ stopColor: 'var(--hs-trail)', stopOpacity: 0.62 }} />
              <stop offset="1" style={{ stopColor: 'var(--hs-trail)', stopOpacity: 0 }} />
            </linearGradient>
            <radialGradient id="tsLeather" cx=".38" cy=".3" r=".75">
              <stop offset="0" stopColor="#FFFFFF" />
              <stop offset=".45" stopColor="#F3EFE6" />
              <stop offset=".82" stopColor="#D5CDBD" />
              <stop offset="1" stopColor="#ADA493" />
            </radialGradient>
            <radialGradient id="tsBallGlow" cx=".5" cy=".5" r=".5">
              <stop offset="0" style={{ stopColor: 'var(--hs-light)', stopOpacity: 0.5 }} />
              <stop offset="1" style={{ stopColor: 'var(--hs-light)', stopOpacity: 0 }} />
            </radialGradient>
          </defs>
          <circle cx={BALL.x} cy={BALL.y} r={BALL.r * 3} fill="url(#tsBallGlow)" />
          <path d={TRAIL.tail} fill="url(#tsTrail)" />
          <path d={TRAIL.lines} className={s.speed} />
          <circle cx={BALL.x} cy={BALL.y} r={BALL.r} fill="url(#tsLeather)" />
          <path d={SEAMS.seam} className={s.seam} />
          <path d={SEAMS.stitch} className={s.stitch} />
          <path d={`M${BALL.x + 8} ${BALL.y - BALL.r + 1.2}A${BALL.r - 1.2} ${BALL.r - 1.2} 0 0 1 ${BALL.x + BALL.r - 1.2} ${BALL.y + 6}`} className={s.rim} />
        </svg>
      </div>
    </div>
  );
});
