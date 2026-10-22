// 재생기 — 여러 선수 그림을 requestAnimationFrame 하나로 돌린다.
//  · 화면 밖(IntersectionObserver)·탭 숨김이면 멈춤, 기본 30fps 상한(휴대폰 배터리·발열)
//  · 빠른 순간(팔 휘두름·배트 스윙)에만 잔상(지난 1/60초 간격 4장)을 계산
//  · prefers-reduced-motion 이면 대표 장면 한 장으로 멈춰 둔다

import type { LiveFigure } from './live';
import type { Motion } from './motion';
import type { Pose3 } from './rig3';

export interface StageItem {
  fig: LiveFigure;
  motion: Motion;
  /** 반복 주기 안에서 시작 위치(초) — 같은 동작이 동시에 맞물리지 않게 */
  offset: number;
  /** 이 그림만의 속도 배율 */
  speed: number;
  el: Element;
  onPhase?: (label: string) => void;
  /** 매 프레임 시각(초, 반복 주기 안) — 바닥 흐름 같은 곁그림용 */
  onTime?: (t: number) => void;
  visible?: boolean;
  lastPhase?: number;
  lastT?: number;
}

export class Stage {
  items: StageItem[] = [];
  speed = 1;
  fpsCap: number;
  private raf = 0;
  private clock = 0;
  private lastNow = 0;
  private lastDraw = 0;
  /** 그림 하나 그리는 데 드는 시간(ms) 지수 평균 — 예산을 넘으면 돌아가며 일부만 그린다 */
  private costEma = 0.5;
  private rr = 0;
  /** 한 프레임 그리기 예산(ms) */
  budget = 7;
  private running = false;
  private io: IntersectionObserver | null = null;
  readonly reduced: boolean;

  constructor(o: { fpsCap?: number } = {}) {
    this.fpsCap = o.fpsCap ?? 30;
    this.reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (typeof IntersectionObserver !== 'undefined') {
      this.io = new IntersectionObserver((ents) => {
        for (const e of ents) { const it = this.items.find((i) => i.el === e.target); if (it) it.visible = e.isIntersecting; }
      }, { rootMargin: '80px' });
    }
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.hidden) this.stop(); else if (this.wantRun) this.start(); });
  }
  private wantRun = false;

  add(it: StageItem): void {
    it.visible = true;
    this.items.push(it);
    if (this.io) this.io.observe(it.el);
    this.drawItem(it, this.reduced ? it.motion.keyTime : it.offset, true);
  }

  start(): void {
    this.wantRun = true;
    if (this.running || this.reduced) return;
    this.running = true;
    this.lastNow = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - this.lastNow) / 1000);
      this.lastNow = now;
      this.clock += dt * this.speed;
      if (now - this.lastDraw < 1000 / this.fpsCap - 3) return;
      this.lastDraw = now;
      const vis = this.items.filter((i) => i.visible);
      if (!vis.length) return;
      // 예산 안에서 그릴 수 있는 수만큼만 차례로 (느린 휴대폰은 각 그림의 fps 가 낮아질 뿐 화면은 멈추지 않음)
      const can = Math.max(1, Math.floor(this.budget / Math.max(0.05, this.costEma)));
      const n = Math.min(vis.length, can);
      const s0 = performance.now();
      for (let k = 0; k < n; k++) {
        const it = vis[(this.rr + k) % vis.length];
        this.drawItem(it, this.clock * it.speed + it.offset);
      }
      this.rr = (this.rr + n) % vis.length;
      const per = (performance.now() - s0) / n;
      this.costEma = this.costEma * 0.9 + per * 0.1;
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  pause(): void { this.wantRun = false; this.stop(); }

  /** 모든 그림을 같은 시각으로 (스크린숏·점검용) */
  freeze(t: number | ((m: Motion) => number)): void {
    this.pause();
    for (const it of this.items) this.drawItem(it, typeof t === 'number' ? t : t(it.motion), true);
  }

  drawItem(it: StageItem, time: number, force = false): void {
    const m = it.motion;
    const t = ((time % m.loop) + m.loop) % m.loop;
    if (!force && it.lastT !== undefined && Math.abs(it.lastT - t) < 1e-4) return;
    it.lastT = t;
    const pose = m.sample(t);
    let trail: Pose3[] | undefined;
    if (m.smear(t) > 0) {
      trail = [];
      for (let k = 1; k <= 4; k++) trail.push(m.sample(Math.max(0, t - k / 60)));
    }
    it.fig.draw(pose, trail);
    if (it.onTime) it.onTime(t);
    if (it.onPhase) {
      let pi = 0;
      for (let i = 0; i < m.phases.length; i++) if (t >= m.phases[i].t) pi = i;
      if (it.lastPhase !== pi) { it.lastPhase = pi; it.onPhase(m.phases[pi].label); }
    }
  }
}

/** 동작 전체를 덮는 화면 상자 (몇 장면을 표본으로) */
export function motionBox(fig: LiveFigure, m: Motion, n = 28, pad = 6): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i <= n; i++) {
    const t = (m.dur * i) / n;
    const out = fig.compute(m.sample(t), undefined, false);
    const b = out.box;
    x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]);
  }
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
}
