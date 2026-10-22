// 난수 — sfc32 + 키로 갈라 쓰는 서브스트림 + 카운터 해시. Math.random 금지(결정성).
// 같은 시드·같은 키 → 언제나 같은 수. 유저가 개입해 한 공의 결정이 바뀌어도 다른 공의 난수는 밀리지 않는다.

export class Sfc32 {
  a = 0; b = 0; c = 0; d = 0;
  next(): number {
    const a = this.a, b = this.b, c0 = this.c, d = this.d;
    const t = (((a + b) | 0) + d) | 0;
    this.d = (d + 1) | 0;
    this.a = b ^ (b >>> 9);
    this.b = (c0 + (c0 << 3)) | 0;
    let c = (c0 << 21) | (c0 >>> 11);
    this.c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  }
  /** 정규난수 1개 = 균등 1개(역누적분포) — 슬롯이 고정된다 */
  normal(): number { return invN(this.next()); }
}

export function fmix(h: number): number {
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0;
}

/** 서브스트림: (종류, 키1, 키2) → r 의 상태를 새로 정하고 8회 예열. 객체 재사용(할당 0). */
export function sub(r: Sfc32, s: ArrayLike<number>, kind: number, k1: number, k2: number): Sfc32 {
  r.a = fmix(s[0] ^ Math.imul(k1 + 0x9e3779b9, 0x85ebca6b) ^ kind) | 0;
  r.b = fmix(s[1] ^ Math.imul(k2 + 0x7f4a7c15, 0xc2b2ae35) ^ Math.imul(kind, 0x27d4eb2f)) | 0;
  r.c = fmix(s[2] ^ k1 ^ (k2 << 16) ^ (kind << 8)) | 0;
  r.d = fmix(s[3] ^ 0x6a09e667 ^ Math.imul(kind + 1, 0x165667b1)) | 0;
  for (let i = 0; i < 8; i++) r.next();
  return r;
}

/** 카운터 해시 난수(12 이벤트·부상 판정용): 상태 없이 (시드, 스트림, 키1, 키2) → [0,1) */
export function u01(seed: number, stream: number, k1: number, k2: number): number {
  let h = fmix(seed ^ Math.imul(stream + 1, 0x9e3779b1));
  h = fmix(h ^ Math.imul(k1 + 0x632be5ab, 0x85ebca6b));
  h = fmix(h ^ Math.imul(k2 + 0x1b873593, 0xcc9e2d51));
  return h / 4294967296;
}

/** 역정규누적분포(Acklam). 균등 1개 → 표준정규 1개 */
export function invN(p: number): number {
  let q: number, r: number;
  if (p < 1e-12) p = 1e-12; else if (p > 1 - 1e-12) p = 1 - 1e-12;
  if (p < 0.02425) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((-7.784894002430293e-03 * q - 3.223964580411365e-01) * q - 2.400758277161838e+00) * q - 2.549732539343734e+00) * q + 4.374664141464968e+00) * q + 2.938163982698783e+00) /
      ((((7.784695709041462e-03 * q + 3.224671290700398e-01) * q + 2.445134137142996e+00) * q + 3.754408661907416e+00) * q + 1);
  }
  if (p <= 0.97575) {
    q = p - 0.5; r = q * q;
    return (((((-3.969683028665376e+01 * r + 2.209460984245205e+02) * r - 2.759285104469687e+02) * r + 1.383577518672690e+02) * r - 3.066479806614716e+01) * r + 2.506628277459239e+00) * q /
      (((((-5.447609879822406e+01 * r + 1.615858368580409e+02) * r - 1.556989798598866e+02) * r + 6.680131188771972e+01) * r - 1.328068155288572e+01) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((-7.784894002430293e-03 * q - 3.223964580411365e-01) * q - 2.400758277161838e+00) * q - 2.549732539343734e+00) * q + 4.374664141464968e+00) * q + 2.938163982698783e+00) /
    ((((7.784695709041462e-03 * q + 3.224671290700398e-01) * q + 2.445134137142996e+00) * q + 3.754408661907416e+00) * q + 1);
}

/** FNV-1a 32비트(이벤트 ID·문자열 키 해시용 — 보안용 아님) */
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** 도구·시험용 시드(서버 비밀 없음). 실제 서비스는 hmacSeed 를 쓴다. */
export function seedFromString(s: string): [number, number, number, number] {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < s.length; i++) {
    const k = s.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067); h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213); h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067); h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213); h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

/** HMAC 출력 앞 16바이트 → 4×uint32 */
export function seedFromBytes(b: Uint8Array): [number, number, number, number] {
  const w = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  return [w(0), w(4), w(8), w(12)];
}

/** 서버용: HMAC-SHA256(비밀, 메시지) → 시드. WebCrypto(Workers·Node 24 공통). 결과 계산 전에 1회. */
export async function hmacSeed(secret: string, msg: string): Promise<[number, number, number, number]> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
  return seedFromBytes(sig);
}

/** 도구·생성기용 간단 난수 객체(시드 문자열 → 순서대로 뽑기) */
export interface SeqRng { next(): number; normal(): number; pick<T>(arr: readonly T[]): T; pickW(w: Record<string, number>): string; }
export function seqRng(seed: string | [number, number, number, number]): SeqRng {
  const s = typeof seed === 'string' ? seedFromString(seed) : seed;
  const r = new Sfc32(); r.a = s[0] | 0; r.b = s[1] | 0; r.c = s[2] | 0; r.d = s[3] | 0;
  for (let i = 0; i < 12; i++) r.next();
  return {
    next: () => r.next(),
    normal: () => invN(r.next()),
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(r.next() * arr.length)],
    pickW: (w: Record<string, number>): string => {
      let tot = 0; for (const k in w) tot += w[k];
      let x = r.next() * tot, last = '';
      for (const k in w) { last = k; x -= w[k]; if (x <= 0) return k; }
      return last;
    },
  };
}

export const sig = (x: number): number => 1 / (1 + Math.exp(-x));
export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
