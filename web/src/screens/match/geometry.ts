// 2D 경기장 좌표 — game/field.ts 와 같은 좌표(0~1, 홈 (0.5, 1), 1 = 140m). SVG 는 0~400.
// 경기 화면은 정사각 경기장의 위아래를 조금 잘라 쓴다(VIEW).
import { BASES } from '../../game/field';
import type { Pos } from '../../game/types';

export type Pt = { x: number; y: number };
export type FPos = Exclude<Pos, 'DH'>;

export const S = 400;
/** 보이는 영역 (SVG 단위) — 중견 담장 위 조금 ~ 포수 뒤 */
export const VIEW = { x: 0, y: 34, w: 400, h: 378 };
export const VIEWBOX = `${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`;
/** 경기장 정사각형(Field)을 VIEW 에 맞춰 놓는 위치 (% — 부모 기준) */
export const FIELD_BOX = { top: `${(-VIEW.y / VIEW.h) * 100}%`, height: `${(S / VIEW.h) * 100}%` };

export const M = (m: number) => m / 140;
export const PLATE: Pt = { x: 0.5, y: 0.9955 };
export const MOUND: Pt = BASES.mound;
export const CATCHER: Pt = { x: 0.5, y: 1.016 };
/** 0 홈 · 1 1루 · 2 2루 · 3 3루 · 4 홈 */
export const BASE: Pt[] = [PLATE, BASES.first, BASES.second, BASES.third, PLATE];

export const NUM_POS: Record<number, FPos> = { 1: 'P', 2: 'C', 3: '1B', 4: '2B', 5: '3B', 6: 'SS', 7: 'LF', 8: 'CF', 9: 'RF' };
export const POS_NO: Record<FPos, number> = { P: 1, C: 2, '1B': 3, '2B': 4, '3B': 5, SS: 6, LF: 7, CF: 8, RF: 9 };

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
export const distM = (a: Pt, b: Pt) => dist(a, b) * 140;
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerpPt = (a: Pt, b: Pt, t: number): Pt => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
export const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
export const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
export const scale = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
export const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
export const norm = (a: Pt): Pt => { const l = Math.hypot(a.x, a.y) || 1; return { x: a.x / l, y: a.y / l }; };

export const EASE = {
  lin: (t: number) => t,
  out: (t: number) => 1 - (1 - t) * (1 - t),
  in: (t: number) => t * t,
  inout: (t: number) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2),
  run: (t: number) => (t < 0.18 ? (t / 0.18) ** 2 * 0.1 : 0.1 + (t - 0.18) / 0.82 * 0.9), // 첫발 가속 뒤 일정
};
export type EaseName = keyof typeof EASE;

/** 베이스 k → t 를 잇는 꼭짓점 */
export function basePath(from: number, to: number): Pt[] {
  const pts: Pt[] = [];
  for (let k = from; k <= to; k++) pts.push(BASE[k]);
  return pts;
}

export function pathLen(pts: Pt[]) {
  let tot = 0;
  for (let i = 1; i < pts.length; i++) tot += dist(pts[i - 1], pts[i]);
  return tot;
}

/** 꺾은선 위 u(0~1, 길이 기준) 지점 */
export function along(pts: Pt[], u: number): Pt {
  if (pts.length === 1) return pts[0];
  const tot = pathLen(pts);
  let d = clamp01(u) * tot;
  for (let i = 1; i < pts.length; i++) {
    const l = dist(pts[i - 1], pts[i]);
    if (d <= l || i === pts.length - 1) return lerpPt(pts[i - 1], pts[i], l ? Math.min(1, d / l) : 1);
    d -= l;
  }
  return pts[pts.length - 1];
}

/** 2차 베지어 */
export function bez(a: Pt, c: Pt, b: Pt, t: number): Pt {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}

export const sx = (p: Pt) => p.x * S;
export const sy = (p: Pt) => p.y * S;
/** HTML 겹침용 위치 (%, VIEW 기준) */
export const pctOf = (p: Pt) => ({ left: `${((p.x * S - VIEW.x) / VIEW.w) * 100}%`, top: `${((p.y * S - VIEW.y) / VIEW.h) * 100}%` });

/** 바람 방향 → 화살표 각도 (위 = 중견수 쪽, 시계 방향 +) */
export const WIND_DEG: Record<string, number | null> = {
  'out-lf': -38, 'out-cf': 0, 'out-rf': 38, 'in-lf': 142, 'in-cf': 180, 'in-rf': -142, 'cross-l': -90, 'cross-r': 90, calm: null,
};
