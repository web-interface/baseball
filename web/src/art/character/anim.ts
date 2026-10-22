// 키프레임 보간 — 자세(Pose3)를 숫자 배열로 펴서 성분마다 단조 3차 곡선(Fritsch–Carlson)으로 잇는다.
// 직선 보간이 아니라: 멈춘 자리에서는 천천히 출발·도착(가속/감속), 같은 방향으로 이어지는 구간은 속도를 이어 받는다.
// 넘침(overshoot)이 없어서 발이 바닥을 뚫거나 디딘 발이 미끄러지지 않는다. 과장(오버슈트)은 키를 하나 더 둬서 직접 만든다.

import type { V3 } from './geom';
import { clamp } from './geom';
import type { Pose3, HandTarget, FootTarget } from './rig3';
import type { Side } from './types';

export interface Key { t: number; p: Pose3 }

const SD: Side[] = ['R', 'L'];

/** 자세 → 숫자 배열 (순서 고정) */
export function flatten(p: Pose3): number[] {
  const o: number[] = [];
  o.push(...p.root, p.pelvis.yaw, p.pelvis.pitch, p.pelvis.roll, p.chest.yaw, p.chest.pitch, p.chest.roll, p.neck, p.head);
  for (const s of SD) { const h = p.hand[s]; o.push(...h.p, ...h.pole, h.rot); }
  for (const s of SD) { const f = p.foot[s]; o.push(...f.p, f.yaw, f.lift, f.toe); }
  for (const s of SD) o.push(...p.knee[s]);
  const b = p.bat;
  o.push(...(b ? b.knob : [0, 0, 0]), b ? b.az : 0, b ? b.el : 0, p.grip[0], p.grip[1]);
  o.push(...(p.ball ?? [0, 0, 0]), p.fade);
  return o;
}

const v3 = (a: number[], i: number): V3 => [a[i], a[i + 1], a[i + 2]];

/** 숫자 배열 + 이산값(손 모양·배트 유무 등은 tpl 에서) → 자세 */
export function unflatten(a: number[], tpl: Pose3): Pose3 {
  let i = 0;
  const root = v3(a, i); i += 3;
  const pelvis = { yaw: a[i++], pitch: a[i++], roll: a[i++] };
  const chest = { yaw: a[i++], pitch: a[i++], roll: a[i++] };
  const neck = a[i++], head = a[i++];
  const hand = {} as Record<Side, HandTarget>;
  for (const s of SD) { hand[s] = { p: v3(a, i), pole: v3(a, i + 3), rot: a[i + 6], shape: tpl.hand[s].shape }; i += 7; }
  const foot = {} as Record<Side, FootTarget>;
  for (const s of SD) { foot[s] = { p: v3(a, i), yaw: a[i + 3], lift: a[i + 4], toe: a[i + 5] }; i += 6; }
  const knee = {} as Record<Side, V3>;
  for (const s of SD) { knee[s] = v3(a, i); i += 3; }
  const bat = tpl.bat ? { knob: v3(a, i), az: a[i + 3], el: a[i + 4] } : null;
  i += 5;
  const grip: [number, number] = [a[i++], a[i++]];
  const ball = tpl.ball ? v3(a, i) : null;
  i += 3;
  const fade = a[i++];
  return { ...tpl, root, pelvis, chest, neck, head, hand, foot, knee, bat, grip, ball, fade };
}

/** 단조 3차 보간기 여러 개를 한 번에 (키 시각 공유) */
export class Track {
  readonly ts: number[];
  private ys: number[][];
  private ms: number[][];
  private tpl: Pose3[];
  readonly n: number;

  constructor(keys: Key[]) {
    const ks = keys.slice().sort((a, b) => a.t - b.t);
    this.ts = ks.map((k) => k.t);
    this.tpl = ks.map((k) => k.p);
    const rows = ks.map((k) => flatten(k.p));
    this.n = rows[0].length;
    // 배트·공이 없는 키는 이웃 키 값으로 채워(없는 동안 값이 튀지 않게)
    const fill = (pick: (p: Pose3) => boolean, from: number, len: number) => {
      for (let i = 0; i < ks.length; i++) {
        if (pick(ks[i].p)) continue;
        let j = -1;
        for (let d = 1; d < ks.length && j < 0; d++) {
          if (i - d >= 0 && pick(ks[i - d].p)) j = i - d;
          else if (i + d < ks.length && pick(ks[i + d].p)) j = i + d;
        }
        if (j >= 0) for (let c = 0; c < len; c++) rows[i][from + c] = rows[j][from + c];
      }
    };
    const batAt = 3 + 6 + 2 + 14 + 12 + 6;
    fill((p) => !!p.bat, batAt, 5);
    fill((p) => !!p.ball, batAt + 7, 3);
    const n = this.n, m = ks.length;
    this.ys = [];
    this.ms = [];
    for (let c = 0; c < n; c++) {
      const y = rows.map((r) => r[c]);
      this.ys.push(y);
      this.ms.push(monoTangents(this.ts, y));
    }
    void m;
  }

  /** 시각 t 의 자세 */
  at(t: number): Pose3 {
    const ts = this.ts, m = ts.length;
    if (t <= ts[0]) return unflatten(this.ys.map((y) => y[0]), this.tpl[0]);
    if (t >= ts[m - 1]) return unflatten(this.ys.map((y) => y[m - 1]), this.tpl[m - 1]);
    let i = 0;
    while (i < m - 2 && t > ts[i + 1]) i++;
    const h = ts[i + 1] - ts[i];
    const u = (t - ts[i]) / h, u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    const out = new Array<number>(this.n);
    for (let c = 0; c < this.n; c++) {
      const y = this.ys[c], mm = this.ms[c];
      out[c] = h00 * y[i] + h10 * h * mm[i] + h01 * y[i + 1] + h11 * h * mm[i + 1];
    }
    // 이산값(손 모양 등)은 가까운 키를 따른다 — 손 모양은 구간 3분의 2 지점에서 바뀜
    const tpl = u < 0.66 ? this.tpl[i] : this.tpl[i + 1];
    return unflatten(out, tpl);
  }

  /** 지금 구간의 키 번호 */
  seg(t: number): number {
    let i = 0;
    while (i < this.ts.length - 1 && t >= this.ts[i + 1]) i++;
    return i;
  }
}

/** Fritsch–Carlson 단조 접선 (비균등 간격) */
export function monoTangents(xs: number[], ys: number[]): number[] {
  const n = xs.length;
  const m = new Array<number>(n).fill(0);
  if (n < 2) return m;
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / Math.max(1e-6, xs[i + 1] - xs[i]));
  m[0] = 0;
  m[n - 1] = 0;
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) { m[i] = 0; continue; }
    const h0 = xs[i] - xs[i - 1], h1 = xs[i + 1] - xs[i];
    const w1 = 2 * h1 + h0, w2 = h1 + 2 * h0;
    m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
  }
  return m;
}

/** 쉬운 곡선들 (0..1) */
export const ease = {
  inOut: (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); },
  out: (x: number) => { const t = clamp(x, 0, 1); return 1 - (1 - t) * (1 - t) * (1 - t); },
  in: (x: number) => { const t = clamp(x, 0, 1); return t * t * t; },
};

/** 자세 복사 (깊은 복사 — 키를 만들 때 이전 키를 고쳐 쓰기용) */
export function clonePose(p: Pose3): Pose3 {
  return {
    ...p,
    root: [...p.root] as V3,
    pelvis: { ...p.pelvis }, chest: { ...p.chest },
    hand: { R: { ...p.hand.R, p: [...p.hand.R.p] as V3, pole: [...p.hand.R.pole] as V3 }, L: { ...p.hand.L, p: [...p.hand.L.p] as V3, pole: [...p.hand.L.pole] as V3 } },
    foot: { R: { ...p.foot.R, p: [...p.foot.R.p] as V3 }, L: { ...p.foot.L, p: [...p.foot.L.p] as V3 } },
    knee: { R: [...p.knee.R] as V3, L: [...p.knee.L] as V3 },
    bat: p.bat ? { ...p.bat, knob: [...p.bat.knob] as V3 } : null,
    grip: [p.grip[0], p.grip[1]],
    ball: p.ball ? ([...p.ball] as V3) : null,
  };
}
