// 팀 종합 게이지 — 공용 Gauge 위에 손맛을 얹는다: 숫자 세기 · 바뀐 만큼(+2) · 폭발 때 빛이 훑고 끝에서 터짐 · 폭발 중 충전된 막대.
import { useLayoutEffect, useRef, useState } from 'react';
import { Gauge, fmt } from '../../ui';
import type { Eval } from './calc';
import { useDelta, useTween } from './hooks';
import s from './GaugeBox.module.css';

const MIN = 60;
const MAX = 100;
const pos = (v: number) => Math.max(0, Math.min(1, (v - MIN) / (MAX - MIN)));

export function GaugeBox({ ev, boom }: { ev: Eval; boom: number | null }) {
  const host = useRef<HTMLDivElement>(null);
  const shown = useTween(ev.overall, boom != null ? 1100 : 480);
  const delta = useDelta(ev.overall);
  const [bar, setBar] = useState<{ l: number; t: number; w: number } | null>(null);

  // 공용 Gauge 의 막대([role=meter]) 자리를 재서 그 위에 효과를 얹는다
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const measure = () => {
      const m = el.querySelector<HTMLElement>('[role="meter"]');
      if (!m) return;
      const a = el.getBoundingClientRect();
      const b = m.getBoundingClientRect();
      setBar((o) => (o && Math.abs(o.l - (b.left - a.left)) < .5 && Math.abs(o.w - b.width) < .5 && Math.abs(o.t - (b.top - a.top)) < .5 ? o : { l: b.left - a.left, t: b.top - a.top, w: b.width }));
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  return (
    <div ref={host} className={[s.box, ev.exploded && s.exploded].filter(Boolean).join(' ')}>
      <Gauge
        value={shown}
        base={ev.base}
        potential={ev.exploded ? undefined : ev.potential}
        potentialLabel={<>왕조 시 <b className="num">{ev.potential}</b></>}
        parts={ev.parts.slice(0, 3).map((p) => ({ ko: p.ko, v: p.v }))}
        label={(
          <span className={s.label}>
            팀 종합
            {ev.exploded && <i className={s.tag}>왕조</i>}
            {delta && <em key={delta.n} className={['num', s.delta, delta.v > 0 ? s.up : s.down].join(' ')}>{fmt.signed(delta.v)}</em>}
          </span>
        )}
      />
      {bar && (
        <div className={s.fx} style={{ left: bar.l, top: bar.t, width: bar.w }} aria-hidden>
          {ev.exploded && <i className={s.charged} style={{ width: `${pos(shown) * 100}%` }} />}
          {boom != null && <i key={`s${boom}`} className={s.sweep} />}
          {boom != null && <i key={`b${boom}`} className={s.burst} style={{ left: `${pos(ev.overall) * 100}%` }} />}
        </div>
      )}
    </div>
  );
}
