// 큰 글자 — 종류마다 다른 짜임과 움직임 (같은 '쾅' 반복이 되지 않게)
//   wipe 솔로 · slam 투런/스리런 · letters 그랜드슬램 · band 끝내기 · flip 역전 · meet 동점 · rise 앞서가는
//   count 장외(거리 숫자가 올라감) · echo 백투백(겹친 글자) · ticker 선두타자 · card 대타(교체 판) · mark 시즌 n호(고리)
// 움직임은 Web Animations 를 멈춘 채 만들고, 재생기 시계로 currentTime 을 맞춘다 → 아무 시점이나 그릴 수 있다.
import type { FxPlan } from './plan';
import s from './homerun.module.css';

export interface TextRig {
  el: HTMLDivElement;
  /** t ms 장면 · fade: 바깥 투명도 (세리머니로 넘어갈 때) */
  seek(t: number, fade?: number): void;
  /** 판 폭에 맞춰 큰 글자 크기 줄이기 */
  fit(width: number): void;
  dispose(): void;
}

const E_OUT = 'cubic-bezier(.2,.75,.2,1)';
const E_SNAP = 'cubic-bezier(.3,1.45,.45,1)';
const E_IN = 'cubic-bezier(.55,0,.75,.35)';

function mk<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function buildText(p: FxPlan, reduced: boolean): TextRig {
  const outer = mk('div', s.text);
  const el = mk('div', s.inner);
  outer.append(el);
  const anims: Animation[] = [];
  const A = (target: Element, kf: Keyframe[], dur: number, delay: number, easing = E_OUT, fill: FillMode = 'both') => {
    const a = target.animate(kf, { duration: Math.max(1, dur), delay: Math.max(0, delay), easing, fill });
    a.pause();
    anims.push(a);
    return a;
  };
  const sp = p.length === 'short' ? 0.62 : 1;
  const tIn = p.textIn;
  const tOut = p.textOut;
  const counters: { el: HTMLElement; from: number; to: number; t0: number; dur: number }[] = [];

  const kick = p.kicker ? mk('p', s.kicker) : null;
  if (kick) kick.append(mk('span', undefined, p.kicker));
  const box = mk('div', s.titleBox);
  const title = mk('p', s.title);
  box.append(title);
  const sub = p.sub ? mk('p', s.sub, p.sub) : null;
  const [pre, word] = p.split ?? ['', p.title];

  const fadeUp = (e: Element, d: number, dur = 260) => A(e, [{ opacity: 0, transform: 'translateY(7px)' }, { opacity: 1, transform: 'none' }], dur * sp, d);

  if (reduced) {
    title.textContent = p.title;
    el.append(...[kick, box, sub].filter(Boolean) as Element[]);
    A(el, [{ opacity: 0 }, { opacity: 1 }], 200, 0, 'linear');
  } else {
    switch (p.look) {
      case 'wipe': {
        title.textContent = p.title;
        const rule = mk('i', s.rule);
        box.append(rule);
        A(title, [{ clipPath: 'inset(-25% 100% -25% 0)' }, { clipPath: 'inset(-25% -2% -25% 0)' }], 420 * sp, tIn);
        A(title, [{ transform: 'translateX(-10px)' }, { transform: 'none' }], 520 * sp, tIn);
        A(rule, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], 520 * sp, tIn + 120 * sp);
        break;
      }
      case 'slam': {
        const blk = mk('i', s.block);
        box.prepend(blk);
        title.textContent = p.title;
        A(blk, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], 240 * sp, tIn - 50 * sp, E_OUT);
        A(title, [{ opacity: 0, transform: 'scale(1.6)', filter: 'blur(3px)' }, { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' }], 300 * sp, tIn, E_SNAP);
        break;
      }
      case 'letters': {
        const over = mk('span', s.over, 'GRAND SLAM');
        box.prepend(over);
        if (pre) { const tg = mk('span', s.tag, pre); title.append(tg); A(tg, [{ opacity: 0, transform: 'translateX(-12px)' }, { opacity: 1, transform: 'none' }], 260 * sp, tIn); }
        const chars = [...word];
        const stagger = (p.length === 'short' ? 34 : 62);
        const t1 = tIn + (pre ? 140 : 0) * sp;
        chars.forEach((ch, i) => {
          const c = mk('span', s.ch, ch);
          title.append(c);
          A(c, [{ opacity: 0, transform: 'translateY(-55%) scale(1.25)' }, { opacity: 1, transform: 'none' }], 300 * sp, t1 + i * stagger, E_SNAP);
        });
        const gold = mk('i', s.goldRule);
        box.append(gold);
        const tEnd = t1 + chars.length * stagger;
        A(over, [{ opacity: 0, letterSpacing: '.8em' }, { opacity: 1, letterSpacing: '.34em' }], 520 * sp, tIn - 60 * sp);
        A(gold, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], 600 * sp, tIn + 80 * sp);
        if (p.stat) {
          const st = mk('span', s.stat);
          st.append(mk('b', undefined, String(p.stat.value)), mk('small', undefined, p.stat.label));
          title.append(st);
          A(st, [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'none' }], 280 * sp, tEnd + 60 * sp, E_SNAP);
        }
        break;
      }
      case 'band': {
        const band = mk('div', s.band);
        box.replaceChildren(band);
        band.append(title);
        if (pre) { title.append(mk('span', s.pre, pre + ' '), mk('span', undefined, word)); } else title.textContent = p.title;
        A(band, [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], 300 * sp, tIn - 70 * sp, 'cubic-bezier(.2,.8,.2,1)');
        A(title, [{ opacity: 0, transform: 'translateX(-18px) scale(1.08)' }, { opacity: 1, transform: 'none' }], 380 * sp, tIn + 40 * sp, E_SNAP);
        const sheen = mk('i', s.sheen);
        band.append(sheen);
        A(sheen, [{ transform: 'skewX(-18deg) translateX(-120%)' }, { transform: 'skewX(-18deg) translateX(420%)' }], 900 * sp, tIn + 260 * sp, 'cubic-bezier(.4,0,.2,1)');
        break;
      }
      case 'flip': {
        const tg = mk('span', s.tag, pre);
        const w = mk('span', s.word, word);
        title.append(tg, w);
        A(tg, [{ opacity: 0, transform: 'perspective(360px) rotateX(-100deg)' }, { opacity: 1, transform: 'perspective(360px) rotateX(0)' }], 380 * sp, tIn, E_SNAP);
        A(w, [{ opacity: 0, transform: 'translateX(38%)' }, { opacity: 1, transform: 'none' }], 340 * sp, tIn + 150 * sp);
        break;
      }
      case 'meet': {
        const l = mk('span', s.word, pre);
        const eq = mk('i', s.eq);
        const r = mk('span', s.word, word);
        title.append(l, eq, r);
        A(l, [{ opacity: 0, transform: 'translateX(-60%)' }, { opacity: 1, transform: 'none' }], 400 * sp, tIn, 'cubic-bezier(.16,.9,.3,1)');
        A(r, [{ opacity: 0, transform: 'translateX(60%)' }, { opacity: 1, transform: 'none' }], 400 * sp, tIn, 'cubic-bezier(.16,.9,.3,1)');
        A(eq, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], 220 * sp, tIn + 340 * sp, E_SNAP);
        break;
      }
      case 'rise': {
        const a = mk('span', s.lineClip);
        const b = mk('span', s.lineClip);
        const ai = mk('span', s.word, pre);
        const bi = mk('span', s.word, word);
        a.append(ai); b.append(bi);
        title.append(a, ' ', b);
        A(ai, [{ transform: 'translateY(105%)' }, { transform: 'none' }], 380 * sp, tIn, 'cubic-bezier(.2,.9,.25,1)');
        A(bi, [{ transform: 'translateY(105%)' }, { transform: 'none' }], 380 * sp, tIn + 130 * sp, 'cubic-bezier(.2,.9,.25,1)');
        const rule = mk('i', s.riseRule);
        box.append(rule);
        A(rule, [{ transform: 'scaleX(0) skewY(-4deg)' }, { transform: 'scaleX(1) skewY(-4deg)' }], 520 * sp, tIn + 160 * sp);
        break;
      }
      case 'count': {
        const tg = mk('span', s.tag, pre || '장외');
        const num = mk('span', s.cnum, '0');
        const unit = mk('span', s.cunit, p.stat ? p.stat.unit : '');
        title.append(tg, num, unit);
        if (!p.stat) num.textContent = word;
        else num.style.minWidth = String(p.stat.value).length + 'ch'; // 숫자가 차오르는 동안 폭이 흔들리지 않게
        const track = mk('i', s.track);
        box.append(track);
        A(tg, [{ opacity: 0, transform: 'translateY(30%)' }, { opacity: 1, transform: 'none' }], 240 * sp, tIn);
        A(num, [{ opacity: 0 }, { opacity: 1 }], 120 * sp, tIn + 60 * sp, 'linear');
        A(unit, [{ opacity: 0 }, { opacity: 1 }], 200 * sp, tIn + 520 * sp, 'linear');
        A(track, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], 720 * sp, tIn + 60 * sp, 'cubic-bezier(.15,.8,.3,1)');
        if (p.stat) counters.push({ el: num, from: 0, to: p.stat.value, t0: tIn + 60 * sp, dur: 720 * sp });
        break;
      }
      case 'echo': {
        const n = p.echo ?? 2;
        const w = mk('span', s.word, p.title);
        title.append(w);
        title.classList.add(s.echoBox);
        for (let i = n - 1; i >= 1; i--) {
          const g = mk('span', s.ghost, p.title);
          g.style.setProperty('--k', String(i));
          title.append(g);
          const at = tIn + (n - 1 - i) * 200 * sp;
          A(g, [{ opacity: 0, transform: `translate(calc(var(--k) * .09em), calc(var(--k) * -.09em)) scale(1.25)` }, { opacity: 1, transform: `translate(calc(var(--k) * .09em), calc(var(--k) * -.09em))` }], 260 * sp, at, E_SNAP);
        }
        A(w, [{ opacity: 0, transform: 'scale(1.45)' }, { opacity: 1, transform: 'none' }], 300 * sp, tIn + (n - 1) * 200 * sp, E_SNAP);
        break;
      }
      case 'ticker': {
        const tg = mk('span', s.tag, pre);
        const w = mk('span', s.word, word);
        title.append(tg, w);
        const top = mk('i', s.tickRule);
        box.prepend(top);
        A(top, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], 360 * sp, tIn - 60 * sp, 'cubic-bezier(.3,.7,.2,1)');
        A(title, [{ transform: 'translateX(105vw)' }, { transform: 'none' }], 520 * sp, tIn, 'cubic-bezier(.12,.75,.25,1)');
        break;
      }
      case 'card': {
        const cd = mk('span', s.card, pre);
        const w = mk('span', s.word, word);
        title.append(cd, w);
        A(cd, [{ opacity: 0, transform: 'perspective(300px) rotateY(95deg)' }, { opacity: 1, transform: 'perspective(300px) rotateY(0)' }], 360 * sp, tIn, E_SNAP);
        A(w, [{ opacity: 0, transform: 'scale(1.5)' }, { opacity: 1, transform: 'none' }], 300 * sp, tIn + 230 * sp, E_SNAP);
        break;
      }
      case 'mark': {
        // '시즌 30호' · '통산 100호' — 숫자를 크게, 금빛 고리를 한 바퀴
        const m = p.title.match(/^(.*?)(\d+)(.*)$/);
        if (m) {
          const preT = m[1].trim(), num = m[2], unit = m[3].trim();
          if (preT) title.append(mk('span', s.mpre, preT));
          const nb = mk('span', s.mnum);
          const nt = mk('span', undefined, num);
          nb.append(nt);
          nb.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" pathLength="100"/></svg>');
          title.append(nb, mk('span', s.munit, unit));
          const ring = nb.querySelector('circle')!;
          A(ring, [{ strokeDashoffset: '100' }, { strokeDashoffset: '0' }], 700 * sp, tIn + 120 * sp, 'cubic-bezier(.3,.6,.2,1)');
          A(nt, [{ opacity: 0, transform: 'scale(.7)' }, { opacity: 1, transform: 'none' }], 320 * sp, tIn, E_SNAP);
          counters.push({ el: nt, from: Math.max(0, +num - 9), to: +num, t0: tIn, dur: 420 * sp });
        } else {
          title.textContent = p.title;
          A(title, [{ opacity: 0, transform: 'translateY(20%)' }, { opacity: 1, transform: 'none' }], 360 * sp, tIn);
        }
        break;
      }
    }
    el.append(...[kick, box, sub].filter(Boolean) as Element[]);
    if (kick) fadeUp(kick, tIn - 80 * sp);
    if (sub) fadeUp(sub, tIn + (p.look === 'letters' ? 420 : 220) * sp, 300);
  }
  // 나가기 — 모든 모양 공통
  A(el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-6px)' }], 240 * sp, tOut, E_IN, 'forwards');

  let lastFit = 0;
  const rig: TextRig = {
    el: outer,
    seek(t, fade = 1) {
      for (const a of anims) a.currentTime = t;
      for (const c of counters) {
        const u = Math.max(0, Math.min(1, (t - c.t0) / c.dur));
        const e = 1 - (1 - u) ** 3;
        const v = String(Math.round(c.from + (c.to - c.from) * e));
        if (c.el.textContent !== v) c.el.textContent = v;
      }
      outer.style.opacity = fade >= 0.999 ? '' : String(fade);
    },
    fit(width) {
      if (!width || Math.abs(width - lastFit) < 2) return;
      lastFit = width;
      title.style.fontSize = '';
      // 큰 글자 폭(변형 전 · max-content) 이 판 안쪽 폭을 넘으면 줄인다
      const avail = width - 40 - (p.look === 'band' ? 36 : p.look === 'slam' ? 18 : 0);
      const need = title.offsetWidth;
      if (need > avail && need > 0) {
        const cur = parseFloat(getComputedStyle(title).fontSize) || 40;
        title.style.fontSize = `${Math.max(18, Math.floor(cur * (avail / need) * 0.98))}px`;
      }
    },
    dispose() {
      for (const a of anims) a.cancel();
      anims.length = 0;
    },
  };
  // 글꼴을 늦게 받으면 폭이 달라지니 한 번 더 맞춘다
  document.fonts?.ready.then(() => { const w = lastFit; lastFit = 0; if (outer.isConnected) rig.fit(w); }).catch(() => {});
  return rig;
}
