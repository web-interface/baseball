// 홈런 연출 재생기 — React 없이도 쓴다: playHomerunFx(el, info, opts)
//  · el 위에 판(div)을 덮고: 배경 어둡게 · 캔버스 폭죽 · 빛 번쩍 · 위아래 검은 띠 · 큰 글자 · 건너뛰기
//  · 시계는 하나(requestAnimationFrame) — 글자 움직임(Web Animations)도 이 시계로 currentTime 을 맞춘다 → 아무 시점으로 갈 수 있다
//  · 탭이 숨으면 rAF 가 멈추고, 돌아와도 한 프레임 최대 50ms 만 흐른다 (그동안 연출이 몰래 끝나지 않게)
//  · 끝나면 DOM · 캔버스 메모리 · 이벤트 · 흔든 요소의 translate 까지 되돌린다
import type { HomerunFxHandle, HomerunFxOptions, HomerunInfo, HrTheme } from './types';
import { CEREMONY_MS, CEREMONY_OVERLAP, REDUCED_MS, planHomerun, type FxPlan } from './plan';
import { Fireworks } from './fireworks';
import { buildText, type TextRig } from './text';
import type { Ceremony } from './ceremony';
import s from './homerun.module.css';

const CER_OVERLAP = CEREMONY_OVERLAP;

/**
 * 요소마다 '원래 값' 기록 — 연출이 겹쳐도(빨리 보기에서 연달아 · 개발 모드 두 번 실행) 원래 translate · position 을 정확히 되돌린다.
 * 마지막 연출이 떠날 때만 되돌림.
 */
const held = new WeakMap<HTMLElement, { translate: string; position: string | null; n: number }>();
function hold(el: HTMLElement, needPosition: boolean) {
  let r = held.get(el);
  if (!r) {
    r = { translate: el.style.translate, position: null, n: 0 };
    held.set(el, r);
  }
  if (needPosition && r.position == null && getComputedStyle(el).position === 'static') {
    r.position = el.style.position;
    el.style.position = 'relative';
  }
  r.n++;
  return r;
}
function release(el: HTMLElement) {
  const r = held.get(el);
  if (!r) return;
  if (--r.n > 0) return;
  el.style.translate = r.translate;
  if (r.position != null) el.style.position = r.position;
  held.delete(el);
}

function themeOf(el: HTMLElement): HrTheme {
  const t = (el.closest('[data-theme]') as HTMLElement | null)?.dataset.theme ?? document.documentElement.dataset.theme;
  return t === 'broadcast' || t === 'classic' ? t : 'night';
}
const prefersReduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function playHomerunFx(el: HTMLElement, info: HomerunInfo, opts: HomerunFxOptions = {}): HomerunFxHandle {
  return new HomerunPlayer(el, info, opts).handle;
}

class HomerunPlayer {
  readonly plan: FxPlan;
  readonly handle: HomerunFxHandle;
  private root: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private cerCanvas: HTMLCanvasElement | null = null;
  private scrim: HTMLDivElement;
  private flash: HTMLDivElement;
  private lb: HTMLDivElement[] = [];
  private skipBtn: HTMLButtonElement | null = null;
  private fw: Fireworks;
  private text: TextRig;
  private cer: Ceremony | null = null;
  private cerWanted: boolean;
  private reduced: boolean;
  private t = 0;
  private total: number;
  private raf = 0;
  private last = 0;
  private playing = false;
  private finished = false;
  private disposed = false;
  private ro: ResizeObserver | null = null;
  private shakeEl: HTMLElement | null;
  /** 흔들 요소의 원래 translate (겹친 연출과 같이 씀) */
  private shakeBase: { translate: string } | null = null;
  private resolveDone!: () => void;
  private resolveReady!: () => void;
  private onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') this.skip(); };

  constructor(private host: HTMLElement, info: HomerunInfo, private opts: HomerunFxOptions) {
    const theme = opts.theme ?? themeOf(host);
    this.reduced = opts.reducedMotion ?? prefersReduced();
    const length = opts.length ?? 'long';
    this.plan = planHomerun(info, length, theme, { ceremony: opts.ceremony !== false && !this.reduced });
    this.cerWanted = this.plan.ceremony;
    const p = this.plan;
    if (this.reduced) {
      // 움직임 줄이기 — 짧은 글자와 정적인 빛만
      p.textIn = 0;
      p.dur = REDUCED_MS[length];
      p.textOut = p.dur - 200;
    }
    this.total = p.dur + (this.cerWanted ? CEREMONY_MS - CER_OVERLAP : 0);

    hold(host, true); // position: static 이면 잠시 relative (끝나면 되돌림)
    const root = (this.root = document.createElement('div'));
    root.className = [s.root, s['th-' + theme], s['lk-' + (this.reduced ? 'wipe' : p.look)], p.tier >= 4 ? s.big : '', length === 'short' ? s.short : '', this.reduced ? s.reduced : '', p.letterbox && !this.reduced ? s.hasLb : ''].filter(Boolean).join(' ');
    root.style.setProperty('--hr-team', info.team?.primary ?? 'var(--accent)');
    root.style.setProperty('--hr-team2', info.team?.secondary ?? 'var(--fg)');
    root.style.setProperty('--hr-ink', info.team?.ink ?? '#fff');
    root.style.setProperty('--hr-spot', p.palette[0]);
    root.style.setProperty('--hr-fire', p.palette[0]);
    root.style.setProperty('--hr-fire2', p.palette[1]);
    this.scrim = div(s.scrim);
    this.canvas = document.createElement('canvas');
    this.canvas.className = s.canvas;
    this.flash = div(s.flash);
    root.append(this.scrim, this.canvas, this.flash);
    if (p.letterbox && !this.reduced) { this.lb = [div(s.lb + ' ' + s.lbTop), div(s.lb + ' ' + s.lbBot)]; root.append(...this.lb); }
    this.text = buildText(p, this.reduced);
    root.append(this.text.el);
    // 화면 읽기 프로그램용
    const sr = document.createElement('p');
    sr.className = s.sr;
    sr.setAttribute('aria-live', 'assertive');
    sr.textContent = p.speech;
    root.append(sr);
    if (opts.skippable !== false) {
      const b = (this.skipBtn = document.createElement('button'));
      b.type = 'button';
      b.className = s.skip;
      b.innerHTML = '<span>건너뛰기</span><i aria-hidden="true"></i>';
      b.addEventListener('click', (e) => { e.stopPropagation(); this.skip(); });
      root.append(b);
      root.addEventListener('pointerdown', (e) => { if (e.target === b || b.contains(e.target as Node)) return; if (this.t > 450) this.skip(); });
      document.addEventListener('keydown', this.onKey);
    } else {
      root.style.pointerEvents = 'none';
    }
    host.append(root);

    this.fw = new Fireworks(this.canvas, p);
    this.resize();
    if (typeof ResizeObserver !== 'undefined') { this.ro = new ResizeObserver(() => { this.resize(); this.draw(); }); this.ro.observe(root); }
    this.shakeEl = this.reduced || opts.shake === false ? null : opts.shake instanceof HTMLElement ? opts.shake : host;
    if (this.shakeEl) this.shakeBase = this.shakeEl === host ? held.get(host)! : hold(this.shakeEl, false);

    const done = new Promise<void>((r) => (this.resolveDone = r));
    const ready = new Promise<void>((r) => (this.resolveReady = r));
    if (this.cerWanted) this.loadCeremony(info);
    else this.resolveReady();

    this.handle = {
      done, ready, duration: this.total,
      skip: () => this.skip(),
      stop: () => this.dispose(),
      pause: () => this.pause(),
      resume: () => this.play(),
      seek: (ms: number) => { this.t = Math.max(0, Math.min(this.total, ms)); this.draw(); },
    };
    this.draw();
    if (!opts.paused) this.play();
  }

  private async loadCeremony(info: HomerunInfo) {
    try {
      const m = await import('./ceremony');
      if (this.disposed) return;
      const c = document.createElement('canvas');
      c.className = s.canvas + ' ' + s.cerCanvas;
      this.root.insertBefore(c, this.text.el);
      this.cerCanvas = c;
      this.cer = m.makeCeremony(c, this.root, this.plan, info);
      this.resize();
      this.draw();
    } catch (e) {
      console.warn('[홈런 연출] 세리머니를 불러오지 못해 건너뜀', e);
      this.cerWanted = false;
      this.total = this.plan.dur;
      this.handle.duration = this.total;
    }
    this.resolveReady();
  }

  private resize() {
    const r = this.root.getBoundingClientRect();
    this.fw.resize(r.width, r.height);
    this.stillDrawn = false;
    this.text.fit(r.width);
    if (this.cer) this.cer.resize(r.width, r.height);
  }

  private play() {
    if (this.playing || this.finished || this.disposed) return;
    this.playing = true;
    this.last = performance.now();
    const tick = (now: number) => {
      if (!this.playing) return;
      const dt = Math.min(50, now - this.last);
      this.last = now;
      // 세리머니 그림을 아직 못 불러왔으면 그 앞에서 잠깐 기다린다 (최대 1.2초)
      const cerAt = this.plan.dur - CER_OVERLAP;
      if (this.cerWanted && !this.cer && this.t + dt >= cerAt) {
        this.waited = (this.waited ?? 0) + dt;
        if (this.waited > 1200) { this.cerWanted = false; this.total = this.plan.dur; this.handle.duration = this.total; }
      } else this.t += dt;
      if (this.t >= this.total) { this.t = this.total; this.draw(); this.finish(); return; }
      this.draw();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
  private waited?: number;
  private stillDrawn = false;

  private pause() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
  }

  /** 지금 시각(this.t)의 장면 */
  private draw() {
    if (this.disposed) return;
    const p = this.plan;
    const t = this.t;
    const cerStart = p.dur - CER_OVERLAP;
    const inCer = this.cerWanted && this.cer && t >= cerStart;
    // 배경 어둡게 — 들어오고 · 나가고 (세리머니가 이어지면 계속)
    const endAt = this.cerWanted ? this.total : p.dur;
    const scrimA = Math.min(1, t / (p.length === 'short' ? 110 : 280)) * Math.min(1, (endAt - t) / 340);
    this.scrim.style.opacity = String(Math.max(0, scrimA));
    // 폭죽
    const master = Math.max(0, Math.min(1, (p.dur - t) / 320));
    if (this.reduced) {
      // 정지 장면 — 대표 불꽃이 가장 활짝 핀 순간 하나를 한 번 그리고, 나타났다 사라지기만
      if (!this.stillDrawn) {
        const main = p.shells.filter((x) => x.type !== 'tracer').reduce((a, b) => (b.r > a.r ? b : a), p.shells[0]);
        this.fw.render(main ? main.t / 1000 + 0.42 / p.speed : 0.5, 0.8, true);
        this.stillDrawn = true;
      }
      this.canvas.style.opacity = (Math.min(1, t / 200) * Math.max(0, Math.min(1, (p.dur - t) / 300))).toFixed(3);
    } else {
      this.fw.render(t / 1000, master);
    }
    // 빛 번쩍
    if (!this.reduced && p.theme !== 'classic') {
      let a = 0, warm = false;
      for (const f of p.flashes) {
        const d = t - f.t;
        if (d < 0 || d > 700) continue;
        const v = f.a * (d < 40 ? d / 40 : Math.exp(-(d - 40) / 150));
        if (v > a) { a = v; warm = f.warm; }
      }
      this.flash.style.opacity = a.toFixed(3);
      this.flash.classList.toggle(s.warm, warm);
    }
    // 흔들림 — 경기장 요소를 translate 로 (transform 은 건드리지 않음)
    if (this.shakeEl) {
      let x = 0, y = 0;
      for (const k of p.shakes) {
        const d = t - k.t;
        if (d < 0 || d > 380) continue;
        const e = Math.exp(-d / 110) * k.amp;
        x += Math.sin(d * 0.093 + k.t) * e;
        y += Math.cos(d * 0.117 + k.t * 0.7) * e * 0.6;
      }
      const base = this.shakeBase?.translate ?? '';
      this.shakeEl.style.translate = Math.abs(x) + Math.abs(y) > 0.05 ? `${x.toFixed(2)}px ${y.toFixed(2)}px` : base;
    }
    // 위아래 검은 띠
    if (this.lb.length) {
      const k = Math.min(1, t / 260) * Math.min(1, (endAt - t) / 300);
      const e = 1 - (1 - Math.max(0, k)) ** 3;
      for (const b of this.lb) b.style.transform = `scaleY(${e.toFixed(3)})`;
    }
    // 글자
    this.text.seek(t, inCer ? Math.max(0, 1 - (t - cerStart) / 260) : 1);
    if (this.skipBtn) this.skipBtn.classList.toggle(s.skipOn, t > 300 && t < this.total - 200);
    // 세리머니
    if (this.cer) this.cer.render(Math.max(0, t - cerStart) / 1000, inCer ? 1 : 0, (this.total - t) / 1000);
  }

  private skip() {
    if (this.finished || this.disposed) return;
    this.finish();
  }

  private finish() {
    if (this.finished) return;
    this.finished = true;
    this.pause();
    this.dispose();
    this.resolveDone();
    try { this.opts.onDone?.(); } catch (e) { console.error(e); }
  }

  private dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.pause();
    this.ro?.disconnect();
    this.ro = null;
    document.removeEventListener('keydown', this.onKey);
    if (this.shakeEl && this.shakeEl !== this.host) release(this.shakeEl);
    release(this.host);
    this.fw.dispose();
    this.cer?.dispose();
    this.text.dispose();
    this.root.remove();
    if (!this.finished) this.resolveDone();
    this.resolveReady();
  }
}

function div(cls: string) {
  const d = document.createElement('div');
  d.className = cls;
  return d;
}
