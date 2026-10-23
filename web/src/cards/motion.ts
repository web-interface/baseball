// 카드 빛·기울임 — 마우스를 따라가고(터치는 안 따라감 — 스크롤만), 손을 떼면 아주 느린 자동 움직임(리사주 곡선)으로 돌아간다.
// CSS 변수 5개만 바꾼다: --mx --my(빛 위치 %) · --act(활동도 0~1) · --rx --ry(기울기).
// requestAnimationFrame 루프 하나로 '살아 있는' 카드 전부를 돌리고, 화면에 보이는 카드만, 값이 멈추면 루프도 멈춘다.
// 움직임 줄이기 설정이면 붙이지 않는다(정지 광택만 남음).

interface State {
  x: number; y: number; tx: number; ty: number;
  act: number; tact: number; rx: number; ry: number;
  hover: boolean; ph: number; max: number; idle: boolean; vis: boolean;
}

const S = new WeakMap<HTMLElement, State>();
const live = new Set<HTMLElement>();
let raf = 0;
let io: IntersectionObserver | null = null;

export const reducedMotion = () => {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

function wake() { if (!raf) raf = requestAnimationFrame(tick); }

function tick(t: number) {
  raf = 0;
  let busy = false;
  for (const el of live) {
    if (!el.isConnected) { live.delete(el); continue; }
    const s = S.get(el);
    if (!s || !s.vis) continue;
    if (!s.hover) {
      if (s.idle) {
        const k = (t / 1000) * 0.42 + s.ph;
        s.tx = 0.5 + 0.3 * Math.sin(k);
        s.ty = 0.36 + 0.2 * Math.sin(k * 1.63 + 1.2);
        s.tact = 0.5;
        busy = true;
      } else { s.tx = 0.5; s.ty = 0.3; s.tact = 0; }
    }
    const e = s.hover ? 0.18 : 0.08;
    s.x += (s.tx - s.x) * e;
    s.y += (s.ty - s.y) * e;
    s.act += (s.tact - s.act) * 0.1;
    const k = s.hover ? s.max : s.idle ? s.max * 0.25 : 0;
    const ry = (s.x - 0.5) * 2 * k, rx = (0.5 - s.y) * 2 * k;
    s.rx += (rx - s.rx) * 0.2;
    s.ry += (ry - s.ry) * 0.2;
    if (Math.abs(s.tx - s.x) > 0.0015 || Math.abs(s.ty - s.y) > 0.0015 || Math.abs(s.tact - s.act) > 0.004 || Math.abs(rx - s.rx) > 0.02 || Math.abs(ry - s.ry) > 0.02) busy = true;
    const st = el.style;
    st.setProperty('--mx', (s.x * 100).toFixed(1) + '%');
    st.setProperty('--my', (s.y * 100).toFixed(1) + '%');
    st.setProperty('--act', s.act.toFixed(3));
    st.setProperty('--rx', s.rx.toFixed(2) + 'deg');
    st.setProperty('--ry', s.ry.toFixed(2) + 'deg');
  }
  if (busy) raf = requestAnimationFrame(tick);
}

/** 카드에 빛·기울임을 붙인다. 돌려받은 함수로 뗀다. */
export function attachMotion(el: HTMLElement, opts: { max?: number; idle?: boolean } = {}) {
  if (reducedMotion()) return () => {};
  const s: State = {
    x: 0.5, y: 0.3, tx: 0.5, ty: 0.3, act: 0, tact: 0, rx: 0, ry: 0,
    hover: false, ph: Math.random() * 6.283, max: opts.max ?? 9, idle: opts.idle ?? true, vis: true,
  };
  S.set(el, s);
  live.add(el);
  if (!io && typeof IntersectionObserver !== 'undefined') {
    io = new IntersectionObserver((es) => {
      for (const e of es) { const st = S.get(e.target as HTMLElement); if (st) st.vis = e.isIntersecting; }
      wake();
    });
  }
  io?.observe(el);
  const move = (e: PointerEvent) => {
    // 손가락(터치)은 따라가지 않는다 — 스크롤하려고 카드를 밀 때 카드가 휘청이며 '날아다니지' 않게 (마우스 · 펜만)
    if (e.pointerType === 'touch') return;
    const r = el.getBoundingClientRect();
    s.tx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    s.ty = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    s.hover = true;
    s.tact = 1;
    wake();
  };
  const leave = () => { s.hover = false; s.tact = 0; wake(); };
  el.addEventListener('pointermove', move, { passive: true });
  el.addEventListener('pointerdown', move, { passive: true });
  el.addEventListener('pointerleave', leave);
  el.addEventListener('pointercancel', leave);
  el.addEventListener('pointerup', leave);
  wake();
  return () => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerdown', move);
    el.removeEventListener('pointerleave', leave);
    el.removeEventListener('pointercancel', leave);
    el.removeEventListener('pointerup', leave);
    io?.unobserve(el);
    live.delete(el);
    S.delete(el);
  };
}
