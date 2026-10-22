import { useEffect, useState } from 'react';

/** 1초마다 바뀌는 지금 시각 (화면이 보일 때만) */
export function useClock(stepMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let t = 0;
    const tick = () => {
      setNow(new Date());
      t = window.setTimeout(tick, stepMs - (Date.now() % stepMs));
    };
    t = window.setTimeout(tick, stepMs - (Date.now() % stepMs));
    return () => window.clearTimeout(t);
  }, [stepMs]);
  return now;
}

/** 'HH:MM' 경기 시각까지 남은 시간 — 지났으면 다음 날 같은 시각으로 */
export function untilKickoff(now: Date, hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  const t = new Date(now);
  t.setHours(h, m, 0, 0);
  let today = true;
  if (t.getTime() <= now.getTime()) { t.setDate(t.getDate() + 1); today = false; }
  const s = Math.max(0, Math.round((t.getTime() - now.getTime()) / 1000));
  const p2 = (n: number) => String(n).padStart(2, '0');
  return { today, text: `${p2(Math.floor(s / 3600))}:${p2(Math.floor((s % 3600) / 60))}:${p2(s % 60)}`, soon: s < 3600 };
}
