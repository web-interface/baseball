// 캔버스 폭죽 — 별 하나하나의 위치를 '시각의 함수'로 바로 계산한다 (쌓아 두는 상태 없음).
//  · 아무 시각이나 바로 그릴 수 있다 (미리보기 t=900 · 건너뛰기) · 같은 계획이면 언제나 같은 그림
//  · 공기 저항 k · 중력 g 를 넣은 닫힌 식: x = u(1−e^{−kτ}),  y = u(1−e^{−kτ}) + g(τ − (1−e^{−kτ})/k)
//  · 한 프레임 별 수 상한(MAX_STARS) · devicePixelRatio 상한 2 · 느린 기기는 꼬리·반짝임을 줄인다
//  · night·broadcast = 빛을 더하는 합성(lighter) · classic = 종이에 찍은 먹·별색 점과 선, 망점 빛
import type { FxPlan, Shell } from './plan';
import { C_GOLD, C_SILVER, C_WHITE } from './plan';
import { Rand, hash01 } from './rng';

const MAX_STARS = 1100;
const DPR_MAX = 2;

interface Star {
  /** 끝 위치 (반지름 단위) */
  ux: number;
  uy: number;
  /** 공기 저항 1/s */
  k: number;
  /** 떨어지는 빠르기 (반지름/s) */
  g: number;
  life: number;
  size: number;
  c: number;
  ph: number;
  /** 꼬리 길이 s · 마디 수 */
  trail: number;
  seg: number;
  /** 0 보통 · 1 반짝 · 2 점멸 */
  mode: 0 | 1 | 2;
  /** 태어나는 때 (터진 뒤 s) · 곳 (반지름 단위) */
  t0: number;
  ox: number;
  oy: number;
  fade: number;
  bright: number;
  /** classic — 터진 곳에서 뻗는 판화 선 */
  ray: boolean;
  /** 수명의 cAt 지점에서 c2 색으로 바뀜 (진짜 꽃불처럼 색이 한 번 변한다) */
  c2: number;
  cAt: number;
}

interface Burst {
  sh: Shell;
  stars: Star[];
  t: number;
  rise: number;
  end: number;
  bloom: number;
  bloomC: number;
  idx: number;
}

/* ───────── 별 만들기 ───────── */
function sphere(n: number, R: Rand): [number, number, number][] {
  // 피보나치 구 — 손으로 고르게 채운 진짜 꽃불처럼 (막 뿌린 점보다 단정하다)
  const out: [number, number, number][] = [];
  const rot = R.range(0, Math.PI * 2);
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const z = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const th = i * ga + rot;
    out.push([Math.cos(th) * r, Math.sin(th) * r, z]);
  }
  return out;
}

const base = (o: Partial<Star>): Star => ({
  ux: 0, uy: 0, k: 3, g: 0.2, life: 1.3, size: 1, c: 0, ph: 0, trail: 0.05, seg: 1, mode: 0,
  t0: 0, ox: 0, oy: 0, fade: 0.35, bright: 1, ray: false, c2: -1, cAt: 2, ...o,
});

/** 한 별이 τ 초에 있는 곳 (반지름 단위) */
function disp(s: Star, tau: number): [number, number] {
  const e = Math.exp(-s.k * tau);
  const f = 1 - e;
  return [s.ox + s.ux * f, s.oy + s.uy * f + s.g * (tau - f / s.k)];
}

function starsFor(sh: Shell): Star[] {
  const R = new Rand(sh.seed);
  const L = sh.life / 1000;
  const out: Star[] = [];
  const c2 = sh.c2 ?? C_SILVER;
  const ringPts = (n: number, rad: number, tilt: number, roll: number, color: number, o: Partial<Star> = {}) => {
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const off = R.range(0, Math.PI * 2);
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * Math.PI * 2 + R.range(-0.02, 0.02);
      const x = Math.cos(a), y = Math.sin(a) * tilt;
      const s = rad * R.range(0.988, 1.012);
      // 고리에서 앞쪽 반(sin>0)은 조금 밝게 — 기울어진 고리의 앞뒤
      out.push(base({ ux: (x * cr - y * sr) * s, uy: (x * sr + y * cr) * s, k: 3.1, g: 0.18, life: L * R.range(0.95, 1.05), size: 1.1, c: color, trail: 0.07, fade: 0.3, bright: 0.82 + 0.18 * Math.sin(a), ph: R.next(), ...o }));
    }
  };
  const ball = (n: number, rad: number, color: number, o: Partial<Star> = {}) => {
    for (const [x, y, z] of sphere(n, R)) {
      const s = rad * R.range(0.96, 1.04);
      const zn = z * 0.5 + 0.5;
      const st = base({ ux: x * s, uy: y * s, life: L * R.range(0.86, 1.1), c: color, bright: 0.7 + 0.3 * zn, ph: R.next(), ray: R.chance(0.5), ...o });
      st.size *= 0.82 + 0.36 * zn;
      out.push(st);
    }
  };
  // 색이 한 번 바뀌는 별 (계획에서 c3 를 받은 껍질만)
  const chg: Partial<Star> = sh.c3 != null ? { c2: sh.c3, cAt: 0.56 } : {};
  switch (sh.type) {
    case 'peony':
      ball(sh.n, 1, sh.c, { k: 3, g: 0.2, trail: 0.06, fade: 0.38, size: 1.2, ray: false, ...chg });
      break;
    case 'chrys':
      ball(sh.n, 1, sh.c, { k: 2.8, g: 0.22, trail: 0.26, seg: 3, mode: 1, fade: 0.32, ...chg });
      break;
    case 'willow':
      ball(sh.n, 1, sh.c, { k: 4.6, g: 0.5, trail: 0.85, seg: 6, mode: 1, fade: 0.45, size: 0.7, bright: 0.85, ray: false });
      break;
    case 'kamuro':
      ball(sh.n, 1, sh.c, { k: 3.9, g: 0.4, trail: 0.5, seg: 4, mode: 1, fade: 0.5, size: 0.7, ray: false });
      break;
    case 'strobe':
      ball(sh.n, 1, sh.c, { k: 3, g: 0.16, trail: 0, mode: 2, fade: 0.25, size: 1.25, ray: false });
      break;
    case 'pistil':
      ball(Math.round(sh.n * 0.34), 0.45, c2, { k: 3, g: 0.18, trail: 0.04, size: 1, fade: 0.4, life: L * 0.85, ray: false });
      ball(sh.n, 1, sh.c, { k: 2.9, g: 0.2, trail: 0.12, seg: 2, fade: 0.34, ...chg });
      break;
    case 'ring':
      ringPts(sh.n, 1, sh.tilt, sh.roll, sh.c);
      ball(8, 0.18, c2, { k: 3, g: 0.15, trail: 0, size: 0.8, life: L * 0.7, ray: false });
      break;
    case 'double-ring':
      ringPts(sh.n, 1, sh.tilt, sh.roll, sh.c);
      ringPts(sh.n, 0.8, sh.tilt * 0.9, sh.roll + Math.PI / 2.2, c2);
      break;
    case 'saturn':
      ball(sh.n, 0.55, sh.c, { k: 3, g: 0.17, trail: 0.06, fade: 0.36, ray: false, ...chg });
      ringPts(Math.round(sh.n * 1.3), 1, sh.tilt, sh.roll, c2, { size: 0.95, life: L * 1.08 });
      break;
    case 'palm': {
      // 야자 — 굵은 혜성 팔이 위·옆으로 솟았다가 무겁게 휘어 내려온다 (아래쪽은 비워 둔다: 별표처럼 고르게 퍼지지 않게)
      const arms = sh.n;
      const tilt = R.range(-0.12, 0.12);
      for (let i = 0; i < arms; i++) {
        const a = -Math.PI / 2 + tilt + ((i + 0.5) / arms - 0.5) * Math.PI * 1.62 + R.range(-0.13, 0.13);
        const len = R.range(0.7, 1.05);
        const arm = base({ ux: Math.cos(a) * len, uy: Math.sin(a) * len - 0.08, k: 1.7, g: 0.85, life: L * R.range(0.88, 1.06), size: 1.8, c: sh.c, trail: 0.5, seg: 5, fade: 0.42, ray: true });
        out.push(arm);
        // 팔에서 떨어지는 금 가루
        for (let j = 0; j < 9; j++) {
          const t0 = 0.06 + j * 0.1;
          if (t0 > arm.life * 0.85) break;
          const [ox, oy] = disp(arm, t0);
          out.push(base({ ux: R.range(-0.05, 0.05), uy: R.range(-0.02, 0.06), k: 2, g: 0.3, life: R.range(0.45, 0.8), size: 0.65, c: C_GOLD, trail: 0, mode: 1, t0, ox, oy, fade: 0.6, bright: 0.85, ph: R.next() }));
        }
      }
      break;
    }
    case 'crossette': {
      const n = sh.n;
      const off = R.range(0, Math.PI * 2);
      const ts = 0.42;
      for (let i = 0; i < n; i++) {
        const a = off + (i / n) * Math.PI * 2;
        const len = 0.62 * R.range(0.85, 1);
        const p = base({ ux: Math.cos(a) * len, uy: Math.sin(a) * len, k: 2.4, g: 0.18, life: ts, size: 1.5, c: sh.c, trail: 0.12, seg: 2, fade: 0.05, ray: true });
        out.push(p);
        const [ox, oy] = disp(p, ts);
        const keep = Math.exp(-p.k * ts);
        for (let q = 0; q < 4; q++) {
          const b = a + Math.PI / 4 + (q * Math.PI) / 2;
          out.push(base({
            ux: p.ux * keep + Math.cos(b) * 0.42, uy: p.uy * keep + Math.sin(b) * 0.42, k: 2.6, g: 0.22,
            life: (L - ts) * R.range(0.9, 1.05), size: 1, c: q % 2 ? sh.c : (sh.c2 ?? sh.c), trail: 0.1, t0: ts, ox, oy, fade: 0.4, ph: R.next(),
          }));
        }
      }
      break;
    }
    case 'salute':
      for (let i = 0; i < sh.n; i++) {
        const a = R.range(0, Math.PI * 2), s = R.range(0.45, 0.95);
        out.push(base({ ux: Math.cos(a) * s, uy: Math.sin(a) * s, k: 6, g: 0.1, life: R.range(0.22, L), size: 0.7, c: C_WHITE, trail: 0.05, mode: 1, fade: 0.5, ph: R.next() }));
      }
      break;
    case 'mine':
      for (let i = 0; i < sh.n; i++) {
        const a = -Math.PI / 2 + R.range(-0.45, 0.45), s = R.range(1.5, 2.15);
        out.push(base({ ux: Math.cos(a) * s, uy: Math.sin(a) * s, k: 1.2, g: 1, life: L * R.range(0.8, 1.05), size: 1.1, c: i % 3 === 0 ? C_GOLD : sh.c, trail: 0.14, seg: 2, mode: 1, t0: i * 0.012, fade: 0.4, ph: R.next() }));
      }
      break;
    case 'gerb': {
      const span = (sh.span ?? 1500) / 1000;
      const n = Math.round(span * 46);
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + R.range(-0.14, 0.14), s = R.range(1.3, 1.7);
        out.push(base({ ux: Math.cos(a) * s, uy: Math.sin(a) * s, k: 1, g: 1.6, life: R.range(0.55, 0.8), size: 0.8, c: i % 4 === 0 ? C_GOLD : sh.c, trail: 0.07, mode: 1, t0: i / 46, fade: 0.5, ph: R.next() }));
      }
      break;
    }
    case 'tracer':
      break;
  }
  return out;
}

const BLOOM: Partial<Record<Shell['type'], number>> = {
  peony: 1, chrys: 1, willow: 0.85, palm: 0.75, ring: 0.8, 'double-ring': 0.9, saturn: 1, crossette: 0.7, kamuro: 1.15, strobe: 0.55, pistil: 1, salute: 1.9,
};

/* ───────── 그리개 ───────── */
export class Fireworks {
  private ctx: CanvasRenderingContext2D;
  private bursts: Burst[];
  private W = 1;
  private H = 1;
  private dpr = 1;
  private sprites: HTMLCanvasElement[] = [];
  private whiteSprite: HTMLCanvasElement | null = null;
  private haze: HTMLCanvasElement[] = [];
  private halftone: HTMLCanvasElement[] = [];
  private classic: boolean;
  private quality = 1;
  private costEma = 0;
  private segs: number[][][] = [];

  constructor(private canvas: HTMLCanvasElement, private plan: FxPlan) {
    this.ctx = canvas.getContext('2d', { alpha: true })!;
    this.classic = plan.theme === 'classic';
    this.bursts = plan.shells.map((sh, idx) => {
      const stars = starsFor(sh);
      const t = sh.t / 1000;
      const lastStar = stars.reduce((m, s) => Math.max(m, s.t0 + s.life), 0);
      const end = sh.type === 'tracer' ? t + sh.life / 1000 + 0.8 : t + lastStar / plan.speed + 0.05;
      return { sh, stars, t, rise: sh.rise / 1000, end, bloom: BLOOM[sh.type] ?? 0, bloomC: sh.type === 'salute' ? C_WHITE : sh.c, idx };
    });
    this.segs = plan.palette.map(() => [[], [], []]);
  }

  /** 판 크기 (CSS px) */
  resize(w: number, h: number) {
    const dpr = Math.min(DPR_MAX, window.devicePixelRatio || 1);
    this.W = Math.max(1, w);
    this.H = Math.max(1, h);
    this.dpr = dpr;
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    if (!this.sprites.length) this.makeSprites();
  }

  private makeSprites() {
    const mk = (draw: (g: CanvasRenderingContext2D, n: number) => void, n = 64) => {
      const c = document.createElement('canvas');
      c.width = c.height = n;
      draw(c.getContext('2d')!, n);
      return c;
    };
    if (this.classic) {
      // 망점 빛 — 가운데가 큰 점, 바깥으로 갈수록 작은 점 (인쇄 망점)
      this.halftone = this.plan.palette.map((col) => mk((g, n) => {
        g.fillStyle = col;
        const step = 5, h = n / 2;
        for (let y = step / 2; y < n; y += step) {
          for (let x = (Math.round(y / step) % 2) * (step / 2) + step / 2; x < n; x += step) {
            const d = Math.hypot(x - h, y - h) / h;
            if (d >= 1) continue;
            const r = (1 - d) ** 1.3 * step * 0.46;
            if (r < 0.25) continue;
            g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
          }
        }
      }, 128));
      return;
    }
    this.sprites = this.plan.palette.map((col) => mk((g, n) => {
      const h = n / 2;
      const gr = g.createRadialGradient(h, h, 0, h, h, h);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.16, col);
      gr.addColorStop(0.36, withA(col, 0.38));
      gr.addColorStop(0.7, withA(col, 0.08));
      gr.addColorStop(1, withA(col, 0));
      g.fillStyle = gr;
      g.fillRect(0, 0, n, n);
    }));
    this.haze = this.plan.palette.map((col) => mk((g, n) => {
      const h = n / 2;
      const gr = g.createRadialGradient(h, h, 0, h, h, h);
      gr.addColorStop(0, withA(col, 0.9));
      gr.addColorStop(0.35, withA(col, 0.38));
      gr.addColorStop(0.7, withA(col, 0.08));
      gr.addColorStop(1, withA(col, 0));
      g.fillStyle = gr;
      g.fillRect(0, 0, n, n);
    }, 48));
    this.whiteSprite = mk((g, n) => {
      const h = n / 2;
      const gr = g.createRadialGradient(h, h, 0, h, h, h);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.3, 'rgba(255,250,236,.55)');
      gr.addColorStop(1, 'rgba(255,244,220,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, n, n);
    });
  }

  /** 끝난 시각 (s) — 마지막 별이 꺼질 때 */
  get lastEnd() { return this.bursts.reduce((m, b) => Math.max(m, b.end), 0); }

  /**
   * t 초의 장면을 그린다. master: 전체 투명도(끝날 때 흐려짐) · still: 움직임 줄이기용 정지 장면
   */
  render(t: number, master = 1, still = false) {
    const t0 = performance.now();
    const { ctx, W, H, dpr } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (master <= 0.001) return;
    const minD = Math.min(W, H);
    const spd = this.plan.speed;
    ctx.globalCompositeOperation = this.classic ? 'source-over' : 'lighter';

    // 이번 프레임에 켜진 별 수 → 상한을 넘으면 고르게 덜어 낸다
    let active = 0;
    for (const b of this.bursts) if (t >= b.t && t <= b.end) active += b.stars.length;
    const keep = Math.min(1, (MAX_STARS * this.quality) / Math.max(1, active));

    for (const seg of this.segs) { seg[0].length = 0; seg[1].length = 0; seg[2].length = 0; }
    const heads: number[] = []; // x, y, size, alpha, color, white

    for (const b of this.bursts) {
      const sh = b.sh;
      if (sh.type === 'tracer') { this.tracer(b, t, master); continue; }
      // 올라가는 꼬리
      if (b.rise > 0 && t >= b.t - b.rise && t < b.t) this.riser(b, t, master);
      if (t < b.t || t > b.end) continue;
      const R = sh.r * minD;
      const cx = sh.x * W;
      const cy = sh.type === 'mine' || sh.type === 'gerb' ? H + 2 : sh.y * H;
      const tau = (t - b.t) * spd;
      // 터질 때 빛
      if (b.bloom > 0 && tau < (this.classic ? 0.5 : 1.1)) this.bloom(cx, cy, R, b, tau, master);
      if ((sh.type === 'gerb' || sh.type === 'mine') && !this.classic) {
        const span = sh.type === 'gerb' ? (sh.span ?? 1500) / 1000 : 0.25;
        if (tau < span + 0.1) this.groundGlow(cx, cy, b.sh.c, Math.min(1, tau * 6) * Math.min(1, (span + 0.1 - tau) * 4) * master);
      }
      const stars = b.stars;
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        if (keep < 1 && hash01(i, b.idx * 977) > keep) continue;
        const ts = tau - s.t0;
        if (ts < 0 || ts > s.life) continue;
        // 밝기 — 불붙는 순간 · 수명 끝에서 흐려짐
        const fadeStart = s.life * (1 - s.fade);
        let a = ts < 0.05 ? ts / 0.05 : ts > fadeStart ? 1 - (ts - fadeStart) / (s.life - fadeStart) : 1;
        a = a * a * (3 - 2 * a) * s.bright * master;
        if (s.mode === 1) {
          const h = hash01(i * 131 + b.idx, Math.floor(ts * 22 + s.ph * 7));
          a *= h > 0.3 ? 1 : 0.35;
        } else if (s.mode === 2 && ts > 0.3) {
          a *= ((ts * 7.5 + s.ph) % 1) < 0.45 ? 1 : 0.07;
        }
        // 다 타 들어갈 때 불규칙하게 깜빡이며 꺼진다
        if (ts > s.life * 0.84) a *= hash01(i * 7 + b.idx * 13, Math.floor(ts * 30)) > 0.45 ? 1 : 0.3;
        if (a < 0.02) continue;
        const col = s.c2 >= 0 && ts > s.life * s.cAt ? s.c2 : s.c;
        const [dx, dy] = disp(s, ts);
        const x = cx + dx * R, y = cy + dy * R;
        // 꼬리 — 머리 쪽은 밝고 굵게, 뒤로 갈수록 흐리고 가늘게
        if (s.trail > 0 && (this.quality > 0.5 || s.trail > 0.2)) {
          const tt = Math.max(0, ts - s.trail);
          const n = this.quality < 0.8 ? Math.min(2, s.seg) : s.seg;
          const segs = this.segs[col];
          let [px, py] = disp(s, tt);
          px = cx + px * R; py = cy + py * R;
          for (let k = 1; k <= n; k++) {
            const tk = tt + ((ts - tt) * k) / n;
            const [qx, qy] = k === n ? [dx, dy] : disp(s, tk);
            const X = cx + qx * R, Y = cy + qy * R;
            const sa = a * ((k / n) ** 1.35) * (n === 1 ? 0.7 : 1);
            if (sa > 0.04) segs[sa > 0.5 ? 0 : sa > 0.22 ? 1 : 2].push(px, py, X, Y);
            px = X; py = Y;
          }
        }
        // classic — 판화 선 (터진 곳 → 별)
        if (this.classic && s.ray && ts < 0.75) this.segs[col][2].push(cx + dx * R * 0.3, cy + dy * R * 0.3, x, y);
        // classic — 막 터진 순간엔 점을 찍지 않는다(좁은 곳에 몰린 점이 먹 덩어리가 됨). 점선 꼬리와 망점 빛이 먼저.
        const ha = this.classic && s.t0 === 0 ? a * Math.min(1, Math.max(0, (ts - 0.1) / 0.12)) : a;
        if (ha > 0.02) heads.push(x, y, s.size, ha, col, ts < 0.1 ? 1 - ts / 0.1 : 0);
      }
    }
    this.flush(heads);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    // 느린 기기면 줄인다 (정지 장면은 재지 않음)
    if (!still) {
      const cost = performance.now() - t0;
      this.costEma = this.costEma ? this.costEma * 0.85 + cost * 0.15 : cost;
      if (this.costEma > 9 && this.quality > 0.55) this.quality = 0.55;
      else if (this.costEma < 4 && this.quality < 1) this.quality = Math.min(1, this.quality + 0.05);
    }
  }

  private flush(heads: number[]) {
    const { ctx } = this;
    const pal = this.plan.palette;
    // 꼬리 — 색 · 밝기 묶음마다 한 번에 (밝은 묶음일수록 굵게)
    const A = this.classic ? [0.95, 0.7, 0.42] : [0.95, 0.62, 0.3];
    const LW = this.classic ? [1.15, 0.9, 0.7] : [1.8, 1.25, 0.8];
    ctx.lineCap = 'round';
    // classic — 점선(판화 점각)으로
    if (this.classic) ctx.setLineDash([1.3, 2.1]);
    for (let c = 0; c < pal.length; c++) {
      for (let b = 0; b < 3; b++) {
        const arr = this.segs[c][b];
        if (!arr.length) continue;
        ctx.globalAlpha = A[b];
        ctx.strokeStyle = pal[c];
        ctx.lineWidth = LW[b];
        ctx.beginPath();
        for (let i = 0; i < arr.length; i += 4) { ctx.moveTo(arr[i], arr[i + 1]); ctx.lineTo(arr[i + 2], arr[i + 3]); }
        if (this.classic && c === 0) { ctx.save(); ctx.translate(0.6, 0.45); ctx.stroke(); ctx.restore(); } else ctx.stroke();
      }
    }
    if (this.classic) ctx.setLineDash([]);
    // 별 머리
    if (this.classic) {
      for (let c = 0; c < pal.length; c++) {
        ctx.fillStyle = pal[c];
        ctx.globalAlpha = 1;
        ctx.beginPath();
        let any = false;
        for (let i = 0; i < heads.length; i += 6) {
          // 막 터진 순간(흰 불)엔 점을 작게 — 한 점에 몰려 먹 덩어리가 되지 않게
          if (heads[i + 4] !== c || heads[i + 3] < 0.3) continue;
          const r = (0.8 + heads[i + 2] * 0.85) * (1 - heads[i + 5] * 0.75);
          ctx.moveTo(heads[i] + r, heads[i + 1]);
          ctx.arc(heads[i], heads[i + 1], r, 0, Math.PI * 2);
          any = true;
        }
        if (!any) continue;
        if (c === 0) { ctx.save(); ctx.translate(0.6, 0.45); ctx.fill(); ctx.restore(); } else ctx.fill();
      }
      return;
    }
    for (let i = 0; i < heads.length; i += 6) {
      const x = heads[i], y = heads[i + 1], size = heads[i + 2], a = heads[i + 3], c = heads[i + 4], w = heads[i + 5];
      const d = 6 + size * 6.5;
      ctx.globalAlpha = a;
      ctx.drawImage(this.sprites[c], x - d / 2, y - d / 2, d, d);
      if (w > 0 && this.whiteSprite) {
        const e = d * 1.15;
        ctx.globalAlpha = w * 0.42 * a;
        ctx.drawImage(this.whiteSprite, x - e / 2, y - e / 2, e, e);
      }
    }
  }

  private bloom(cx: number, cy: number, R: number, b: Burst, tau: number, master: number) {
    const { ctx } = this;
    const u = Math.min(1, tau / 0.36);
    const k = (1 - u) * (1 - u);
    if (this.classic) {
      const img = this.halftone[b.bloomC === C_WHITE ? 1 : b.bloomC] ?? this.halftone[1];
      const d = R * 1.5 * b.bloom * (0.7 + 0.3 * u);
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.85 * k * master;
      ctx.drawImage(img, cx - d / 2, cy - d / 2, d, d);
      ctx.restore();
      if (b.sh.type === 'salute') {
        // 축포 — 판화 충격선 두 겹
        ctx.strokeStyle = this.plan.palette[1];
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.8 * (1 - u) * master;
        for (const m of [0.55, 0.9]) { ctx.beginPath(); ctx.arc(cx, cy, R * m * (0.4 + u * 0.8), 0, Math.PI * 2); ctx.stroke(); }
      }
      return;
    }
    const d = R * (b.sh.type === 'salute' ? 2.1 : 1.55) * b.bloom * (0.72 + 0.28 * u);
    ctx.globalAlpha = (b.sh.type === 'salute' ? 0.95 : 0.4) * k * master;
    ctx.drawImage(b.bloomC === C_WHITE && this.whiteSprite ? this.whiteSprite : this.sprites[b.bloomC], cx - d / 2, cy - d / 2, d, d);
    // 하늘(연기)이 불빛을 받아 넓게 밝아짐
    const hz = this.haze[b.bloomC === C_WHITE ? C_GOLD : b.bloomC];
    if (hz) {
      const v = Math.min(1, tau / 1.1);
      const e = R * 3.4 * b.bloom;
      ctx.globalAlpha = 0.2 * (1 - v) ** 1.6 * master;
      ctx.drawImage(hz, cx - e / 2, cy - e / 2, e, e);
    }
  }

  private groundGlow(x: number, y: number, c: number, a: number) {
    if (a <= 0) return;
    const d = 70;
    this.ctx.globalAlpha = a * 0.55;
    this.ctx.drawImage(this.sprites[c], x - d / 2, y - d / 2, d, d);
  }

  /** 올라가는 꼬리 — 터지기 전 */
  private riser(b: Burst, t: number, master: number) {
    const { ctx, W, H } = this;
    const sh = b.sh;
    const u = (t - (b.t - b.rise)) / b.rise;
    const ease = (v: number) => 1 - (1 - v) ** 2.1;
    const x0 = sh.x0 * W, y0 = H + 4, x1 = sh.x * W, y1 = sh.y * H;
    const at = (v: number): [number, number] => [x0 + (x1 - x0) * v, y0 + (y1 - y0) * ease(v)];
    const col = this.classic ? this.plan.palette[1] : this.plan.palette[C_GOLD];
    // 꼬리 선
    ctx.strokeStyle = col;
    ctx.lineWidth = this.classic ? 0.9 : 1.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const v0 = Math.max(0, u - 0.16);
    let [px, py] = at(v0);
    ctx.moveTo(px, py);
    for (let k = 1; k <= 4; k++) { [px, py] = at(v0 + ((u - v0) * k) / 4); ctx.lineTo(px, py); }
    ctx.globalAlpha = 0.55 * master;
    ctx.stroke();
    const [hx, hy] = at(u);
    // 떨어지는 불티
    const R = new Rand(sh.seed ^ 0xa5a5);
    for (let j = 0; j < 9; j++) {
      const vj = (j + 0.5) / 9;
      if (vj > u) break;
      const age = (u - vj) * b.rise;
      if (age > 0.32) continue;
      const [sx, sy] = at(vj);
      const jx = R.range(-14, 14);
      const x = sx + jx * age, y = sy + 70 * age * age + 6 * age;
      const a = (1 - age / 0.32) * 0.8 * master;
      if (this.classic) { ctx.globalAlpha = a; ctx.fillStyle = col; ctx.fillRect(x - 0.6, y - 0.6, 1.2, 1.2); }
      else { ctx.globalAlpha = a; ctx.drawImage(this.sprites[C_GOLD], x - 2.5, y - 2.5, 5, 5); }
    }
    if (this.classic) { ctx.globalAlpha = master; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(hx, hy, 1.5, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.globalAlpha = master; ctx.drawImage(this.whiteSprite!, hx - 6, hy - 6, 12, 12); }
  }

  /** 장외 — 공이 구장 밖으로 나가는 긴 혜성 */
  private tracer(b: Burst, t: number, master: number) {
    const { ctx, W, H } = this;
    const sh = b.sh;
    const L = sh.life / 1000;
    const tau = t - b.t;
    if (tau < 0 || tau > L + 0.8) return;
    const x0 = sh.x0 * W, y0 = H * 1.02, x1 = sh.x * W, y1 = sh.y * H;
    const cxp = x0 + (x1 - x0) * 0.15, cyp = H * 0.35;
    const B = (e: number): [number, number] => {
      const m = 1 - e;
      return [m * m * x0 + 2 * m * e * cxp + e * e * x1, m * m * y0 + 2 * m * e * cyp + e * e * y1];
    };
    const ease = (u: number) => 1 - (1 - u) ** 1.5;
    const u = Math.min(1, tau / L);
    const e = ease(u);
    const col = this.classic ? this.plan.palette[1] : this.plan.palette[C_SILVER];
    // 남는 불티 (지나간 길)
    const R = new Rand(sh.seed ^ 0x3c3c);
    for (let j = 0; j < 26; j++) {
      const ej = (j + 0.5) / 26;
      if (ej > e) break;
      const uj = 1 - (1 - ej) ** (1 / 1.5);
      const age = tau - uj * L;
      if (age > 0.75) continue;
      const [sx, sy] = B(ej);
      const x = sx + R.range(-10, 10) * age, y = sy + 26 * age * age;
      let a = (1 - age / 0.75) * master;
      a *= hash01(j * 17, Math.floor(age * 20)) > 0.3 ? 1 : 0.3;
      ctx.globalAlpha = a;
      if (this.classic) { ctx.fillStyle = col; ctx.fillRect(x - 0.7, y - 0.7, 1.4, 1.4); }
      else ctx.drawImage(this.sprites[C_SILVER], x - 3, y - 3, 6, 6);
    }
    if (u >= 1) return;
    // 꼬리 — 뒤로 갈수록 흐림
    ctx.lineCap = 'round';
    const e0 = Math.max(0, e - 0.22);
    let [px, py] = B(e0);
    for (let k = 1; k <= 7; k++) {
      const [qx, qy] = B(e0 + ((e - e0) * k) / 7);
      ctx.globalAlpha = (k / 7) * 0.9 * master;
      ctx.strokeStyle = col;
      ctx.lineWidth = (this.classic ? 0.6 : 0.9) + (k / 7) * (this.classic ? 1.2 : 2.6);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(qx, qy); ctx.stroke();
      px = qx; py = qy;
    }
    const [hx, hy] = B(e);
    ctx.globalAlpha = master;
    if (this.classic) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(hx, hy, 2.4, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.drawImage(this.whiteSprite!, hx - 11, hy - 11, 22, 22); ctx.drawImage(this.sprites[C_SILVER], hx - 7, hy - 7, 14, 14); }
  }

  /** 캔버스 메모리까지 비운다 (iOS 는 캔버스 메모리 상한이 낮다) */
  dispose() {
    this.canvas.width = 0;
    this.canvas.height = 0;
    for (const c of [...this.sprites, ...this.halftone, ...this.haze]) { c.width = 0; c.height = 0; }
    if (this.whiteSprite) { this.whiteSprite.width = 0; this.whiteSprite.height = 0; }
    this.sprites = [];
    this.halftone = [];
    this.haze = [];
    this.whiteSprite = null;
    this.bursts = [];
  }
}

/** '#rrggbb' + 투명도 → rgba() */
function withA(hex: string, a: number) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
