// 타구 — 충돌 오프셋 모형(타구 속도·발사각을 함께), 방향, 비행표 조회(공기 밀도·바람 보정은 weather.ts 계수), 땅볼 시간.
import { FLIGHT_META as FM, FLIGHT_B64 } from './data/flight.ts';
import { P } from './params.ts';
import { Sfc32, invN, sig, clamp } from './rng.ts';

// ── 비행표(번들 정적 자원 → 모듈 로드 때 1회 해독, 약 0.2ms) ──
let TAB: Uint16Array | null = null;
function b64decode(s: string): Uint8Array {
  const T = new Uint8Array(128); const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < 64; i++) T[A.charCodeAt(i)] = i;
  let n = s.length; while (n > 0 && s[n - 1] === '=') n--;
  const out = new Uint8Array((n * 3) >> 2); let j = 0;
  for (let i = 0; i < n; i += 4) {
    const a = T[s.charCodeAt(i)], b = T[s.charCodeAt(i + 1)], c = i + 2 < n ? T[s.charCodeAt(i + 2)] : 0, d = i + 3 < n ? T[s.charCodeAt(i + 3)] : 0;
    const v = (a << 18) | (b << 12) | (c << 6) | d;
    if (j < out.length) out[j++] = (v >> 16) & 255; if (j < out.length) out[j++] = (v >> 8) & 255; if (j < out.length) out[j++] = v & 255;
  }
  return out;
}
function tab(): Uint16Array { if (!TAB) { const b = b64decode(FLIGHT_B64); TAB = new Uint16Array(b.buffer, b.byteOffset, b.byteLength >> 1); } return TAB; }
export const NFR = FM.fr.length;
export const FR = FM.fr;
/** 비행 결과(재사용 객체 — 할당 0) */
export const FL = { d: 0, T: 0, apex: 0, vl: 0, h: new Float64Array(NFR), t: new Float64Array(NFR) };
/** EV(km/h)·LA(°) → 기준 대기 비행(쌍선형 보간) */
export function flight(ev: number, la: number): void {
  const t = tab(); const nf = FM.nf, nla = FM.nla;
  let fi = (ev - FM.ev0) / FM.evs, fj = (la - FM.la0) / FM.las;
  if (fi < 0) fi = 0; if (fi > FM.nev - 1.001) fi = FM.nev - 1.001; if (fj < 0) fj = 0; if (fj > nla - 1.001) fj = nla - 1.001;
  const i = fi | 0, j = fj | 0, a = fi - i, b = fj - j;
  const o00 = (i * nla + j) * nf, o01 = o00 + nf, o10 = o00 + nla * nf, o11 = o10 + nf;
  const w00 = (1 - a) * (1 - b), w01 = (1 - a) * b, w10 = a * (1 - b), w11 = a * b;
  const g = (k: number) => w00 * t[o00 + k] + w01 * t[o01 + k] + w10 * t[o10 + k] + w11 * t[o11 + k];
  FL.d = g(0) / 10; FL.T = g(1) / 1000; FL.apex = g(2) / 100; FL.vl = g(3) / 100;
  for (let q = 0; q < NFR; q++) { FL.h[q] = g(4 + q) / 100; FL.t[q] = g(4 + NFR + q) / 1000; }
}
/** 비행 중 거리 비율 f(0~1) 지점의 높이(m) */
export function heightAtFrac(f: number): number {
  if (f <= 0) return 0.9; if (f >= 1) return 0;
  if (f < FR[0]) return 0.9 + (FL.h[0] - 0.9) * f / FR[0];
  for (let q = 1; q < NFR; q++) if (f <= FR[q]) return FL.h[q - 1] + (FL.h[q] - FL.h[q - 1]) * (f - FR[q - 1]) / (FR[q] - FR[q - 1]);
  return FL.h[NFR - 1] * (1 - f) / (1 - FR[NFR - 1]);
}
export function timeAtFrac(f: number, T: number): number {
  if (f <= 0) return 0; if (f >= 1) return T;
  if (f < FR[0]) return FL.t[0] * f / FR[0];
  for (let q = 1; q < NFR; q++) if (f <= FR[q]) return FL.t[q - 1] + (FL.t[q] - FL.t[q - 1]) * (f - FR[q - 1]) / (FR[q] - FR[q - 1]);
  return FL.t[NFR - 1] + (T - FL.t[NFR - 1]) * (f - FR[NFR - 1]) / (1 - FR[NFR - 1]);
}

// ── 충돌 오프셋 모형 [11 6.1 맞춤] ──
export interface BatIn {
  zc: number; zk: number; zs: number; gbPitch: number; tLaunch: number; tGbPit: number; dEdge: number; zRel: number;
  vPlate: number; vb: number; mem: number; weakAdj: number;
  /** 이 공의 구속 − 같은 구종 리그 평균(km/h, ±15 자름; 너클·이퓨스 0) — 빠를수록 타이밍이 밀려 빗맞음↑ [18 심사] */
  veloDev: number; muAdj: number; sdMult: number; move: number; heavy: boolean; rainLv: number; tempC: number; coldT: number;
}
export const BB = { ev: 0, la: 0, weak: false, theta: 0, bar: 0 };
export function battedBall(r: Sfc32, a: BatIn): void {
  const p = P.bat;
  const pWeak = sig(p.weak0 - p.weakC * a.zc - p.weakK * a.zk + p.weakS * a.zs * a.move - p.weakD * clamp(a.dEdge, -15, 15) - p.weakMem * a.mem + a.weakAdj + p.weakV * a.veloDev);
  const weak = r.next() < pWeak;
  let delta: number;
  const u1 = r.next(), u2 = r.next();
  if (weak) delta = (u1 < p.weakTop ? -1 : 1) * (p.weakMean + p.weakSd * Math.abs(invN(u2)));
  else {
    const mu = p.mu + p.launch * a.tLaunch - p.gbP * a.tGbPit - p.gbPitch * a.gbPitch + p.zHeight * a.zRel + a.muAdj;
    const sd = p.sd * Math.exp(-p.sdC * a.zc + p.sdS * a.zs) * a.sdMult;
    delta = mu + sd * invN(u2);
  }
  const th = Math.asin(clamp(delta / p.R, -0.999, 0.999));
  const la = p.laA + p.laK * th * 57.29578 + p.laSd * invN(r.next());
  const bar = weak ? p.weakB[0] + p.weakB[1] * r.next() : Math.max(0.5, 1 - p.barrel * Math.exp(-p.barrelC * a.zc) * (1 + p.barrelV * a.veloDev) * Math.abs(invN(r.next())));
  let ev = (p.plateW * a.vPlate + p.batW * a.vb) * Math.pow(Math.cos(th), th < 0 ? p.cosNeg : p.cosPos) * bar;
  if (a.heavy) ev -= 5;
  ev *= 1 - p.rainEv[a.rainLv];
  if (a.tempC < 15) ev *= 1 - p.coldEv * (15 - a.tempC) / 10 * a.coldT;
  BB.ev = ev; BB.la = la; BB.weak = weak; BB.theta = th; BB.bar = bar;
}

/** 방향(필드 각도, + = 우익 쪽) — 당김 각을 손에 맞게 */
export function sprayAngle(r: Sfc32, tPull: number, insideCm: number, la: number, vPerc: number, adj: number, batsL: boolean): number {
  const s = P.spray;
  let pull = s.base + s.tPull * tPull + s.inside * insideCm + (la < 10 ? s.gb : la > 25 ? s.fb : 0) + s.slow * (s.vRef - vPerc) + adj + s.sd * invN(r.next());
  if (pull > 44.5) pull = 89 - pull; if (pull < -44.5) pull = -89 - pull;
  pull = clamp(pull, -44.5, 44.5);
  return batsL ? pull : -pull;
}
/** 타구 종류: 0 땅볼 · 1 라이너 · 2 뜬공 · 3 팝업 (Statcast 경계) */
export const kindOf = (la: number): number => (la < 10 ? 0 : la < 25 ? 1 : la <= 50 ? 2 : 3);

/** 구르는 공: 감속 = c(마찰) + k·v²(풀·바운드 저항). 닫힌 식 — 반복 적분 없음 */
export interface Roll { c: number; k: number }
/** 거리 s 까지 걸리는 시간(초). 그 전에 멈추면 Infinity */
export function gbTime(s: number, v0: number, r: Roll): number {
  if (s <= 0) return 0;
  const th0 = Math.atan(v0 * Math.sqrt(r.k / r.c)); const x = Math.cos(th0) * Math.exp(r.k * s);
  if (x >= 1) return Infinity;
  return (th0 - Math.acos(x)) / Math.sqrt(r.c * r.k);
}
/** 거리 s 지점의 속도 */
export function rollSpeed(s: number, v0: number, r: Roll): number { const ck = r.c / r.k; const v2 = (v0 * v0 + ck) * Math.exp(-2 * r.k * s) - ck; return v2 > 0 ? Math.sqrt(v2) : 0; }
/** 멈추는 거리 */
export function rollStop(v0: number, r: Roll): number { return Math.log(1 + r.k * v0 * v0 / r.c) / (2 * r.k); }
