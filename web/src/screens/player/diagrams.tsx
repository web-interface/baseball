// 폼 해부 — 네 칸 그림 (타자: 스탠스·다리·손·스윙 / 투수: 팔 각도·다리·보폭·템포). 색은 토큰
import type { ReactNode } from 'react';
import type { BatForm, PitchForm } from '../../art/character/forms';
import { SLOT_KO, STANCE_KO, KICK_KO } from '../../art/character/forms';
import s from './attr.module.css';

const R2D = Math.PI / 180;

function Cell({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  return (
    <figure className={s.fCell}>
      <svg viewBox="0 0 64 52" className={s.fSvg} aria-hidden>{children}</svg>
      <figcaption>
        <span>{label}</span>
        <b>{value}</b>
      </figcaption>
    </figure>
  );
}

/** 팔 각도 부채꼴 — 90° 머리 위, 0° 옆, 음수 잠수함 */
function ArmFan({ f }: { f: PitchForm }) {
  const cx = 18, cy = 40, R = 30;
  const pt = (deg: number, r: number) => [cx + Math.cos(deg * R2D) * r, cy - Math.sin(deg * R2D) * r] as const;
  const arc = (a0: number, a1: number) => {
    const [x0, y0] = pt(a0, R), [x1, y1] = pt(a1, R);
    return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${R} ${R} 0 0 0 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  };
  const zones: [number, number, PitchForm['armSlot']][] = [[-40, -6, 'under'], [-4, 27, 'side'], [29, 57, 'threeQuarter'], [59, 90, 'over']];
  const [hx, hy] = pt(f.armAngle, R - 4);
  return (
    <>
      {zones.map(([a0, a1, k]) => <path key={k} d={arc(a0, a1)} className={k === f.armSlot ? s.zOn : s.zOff} />)}
      <circle cx={cx - 6} cy={cy - 12} r="4" className={s.stroke} />
      <path d={`M${cx - 6} ${cy - 8}V${cy + 10}M${cx - 6} ${cy - 3}L${cx} ${cy}`} className={s.stroke} />
      <path d={`M${cx} ${cy}L${hx.toFixed(1)} ${hy.toFixed(1)}`} className={s.strong} />
      <circle cx={hx} cy={hy} r="3" className={s.dotOn} />
    </>
  );
}

/** 다리 들기 — 옆에서 본 다리, 높이 0..1 */
function Leg({ h }: { h: number }) {
  const hipX = 24, hipY = 14, knee = 15, shin = 16;
  const thighA = -90 + 95 * Math.min(1, h * 1.15); // 아래(−90°)에서 앞쪽 위로
  const kx = hipX + Math.cos(thighA * R2D) * knee, ky = hipY - Math.sin(thighA * R2D) * knee;
  const ax = kx - 2, ay = ky + shin;
  return (
    <>
      <path d="M4 48H60" className={s.ground} />
      <path d={`M${hipX - 3} ${hipY}L${hipX - 4} 48`} className={s.stroke} />
      <path d={`M${hipX} ${hipY}L${kx.toFixed(1)} ${ky.toFixed(1)}L${ax.toFixed(1)} ${Math.min(48, ay).toFixed(1)}`} className={s.strong} />
      <path d={`M54 48V${(48 - 40 * h).toFixed(1)}`} className={s.meter} />
      <circle cx="54" cy={(48 - 40 * h).toFixed(1)} r="2.6" className={s.dotOn} />
    </>
  );
}

/** 위에서 본 스탠스 — 오픈이면 앞발이 열린다 */
function Stance({ open }: { open: number }) {
  const rot = -open * 28;
  return (
    <>
      <path d="M32 4V14" className={s.ground} />
      <path d="M28 12l4-6 4 6" className={s.ground} />
      <path d="M26 46h12v-4l-6-5-6 5Z" className={s.stroke} />
      <rect x="10" y="20" width="9" height="18" rx="4" className={s.dotOff} transform="rotate(4 14 29)" />
      <rect x="40" y="18" width="9" height="18" rx="4" className={s.dotOn} transform={`rotate(${rot.toFixed(1)} 44 27)`} />
    </>
  );
}

/** 손 높이 — 높음·중간·낮음 */
function Hands({ pos }: { pos: BatForm['hands'] }) {
  const ys = { high: 12, mid: 26, low: 40 } as const;
  return (
    <>
      <path d="M20 8V44" className={s.ground} />
      {(['high', 'mid', 'low'] as const).map((k) => <path key={k} d={`M16 ${ys[k]}H24`} className={s.ground} />)}
      <circle cx="34" cy={ys[pos]} r="5" className={s.dotOn} />
      <path d={`M37 ${ys[pos] - 3}L56 ${ys[pos] - 15}`} className={s.strong} />
    </>
  );
}

/** 스윙 궤도 — 공격각 */
function Plane({ attack }: { attack: number }) {
  const a = attack * 1.6;
  const y0 = 30 + a * 0.5, y1 = 30 - a * 0.5;
  return (
    <>
      <path d="M4 30H60" className={s.ground} />
      <path d={`M6 ${y0.toFixed(1)}Q32 ${(30 + Math.abs(a) * 0.2).toFixed(1)} 58 ${y1.toFixed(1)}`} className={s.strong} />
      <circle cx="58" cy={y1} r="3" className={s.dotOn} />
    </>
  );
}

/** 보폭 막대 */
function Stride({ v }: { v: number }) {
  const w = Math.max(0, Math.min(1, (v - 0.7) / 0.3));
  return (
    <>
      <path d="M4 40H60" className={s.ground} />
      <rect x="6" y="22" width="52" height="8" className={s.dotOff} />
      <rect x="6" y="22" width={(52 * (0.2 + 0.8 * w)).toFixed(1)} height="8" className={s.dotOn} />
    </>
  );
}

/** 템포 — 빠름·보통·느림 */
function Tempo({ t }: { t: PitchForm['tempo'] }) {
  const n = t === 'quick' ? 3 : t === 'normal' ? 2 : 1;
  return (
    <>
      {[0, 1, 2].map((i) => <path key={i} d={`M${10 + i * 16} 38l10-12-10-12`} className={i < n ? s.strong : s.ground} />)}
    </>
  );
}

export function BatFormCells({ f }: { f: BatForm }) {
  const plane = f.plane === 'up' ? '어퍼' : f.plane === 'down' ? '다운' : '레벨';
  return (
    <div className={s.fCells}>
      <Cell label="스탠스" value={STANCE_KO[f.stance].replace(' 스탠스', '')}><Stance open={f.openness} /></Cell>
      <Cell label="다리" value={f.kickH > 3 ? `${KICK_KO[f.legKick]} ${Math.round(f.kickH)}cm` : KICK_KO[f.legKick]}><Leg h={Math.min(1, f.kickH / 38)} /></Cell>
      <Cell label="손 위치" value={f.hands === 'high' ? '높게' : f.hands === 'low' ? '낮게' : '중간'}><Hands pos={f.hands} /></Cell>
      <Cell label="스윙" value={`${plane} ${f.attack > 0 ? '+' : ''}${Math.round(f.attack)}°`}><Plane attack={f.attack} /></Cell>
    </div>
  );
}

export function PitchFormCells({ f }: { f: PitchForm }) {
  return (
    <div className={s.fCells}>
      <Cell label="팔 각도" value={`${SLOT_KO[f.armSlot]} ${Math.round(f.armAngle)}°`}><ArmFan f={f} /></Cell>
      <Cell label="다리 들기" value={f.legLift === 'high' ? '하이킥' : f.legLift === 'slide' ? '슬라이드' : '보통'}><Leg h={f.liftH} /></Cell>
      <Cell label="보폭" value={`키의 ${Math.round(f.stride * 100)}%`}><Stride v={f.stride} /></Cell>
      <Cell label="템포" value={f.tempo === 'quick' ? '빠름' : f.tempo === 'slow' ? '느림' : '보통'}><Tempo t={f.tempo} /></Cell>
    </div>
  );
}
