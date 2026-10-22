// 시드 고정 난수 — sfc32. Math.random 은 쓰지 않는다.
// 같은 문자열 키 → 항상 같은 수열. fork(label) 로 항목별 독립 수열을 만든다
// (예: 머리 모양 항목을 하나 추가해도 피부색·얼굴형 값은 바뀌지 않게).

export function hash32(str: string): number {
  let h1 = 0xdeadbeef ^ str.length;
  let h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

export class Rng {
  readonly key: string;
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(key: string) {
    this.key = key;
    this.a = hash32(key + '#a');
    this.b = hash32(key + '#b');
    this.c = hash32(key + '#c');
    this.d = hash32(key + '#d');
    for (let i = 0; i < 12; i++) this.u32();
  }

  /** sfc32 한 걸음 → 0 이상 2^32 미만 정수 */
  u32(): number {
    this.a |= 0; this.b |= 0; this.c |= 0; this.d |= 0;
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** [0, 1) */
  next(): number { return this.u32() / 4294967296; }
  range(lo: number, hi: number): number { return lo + (hi - lo) * this.next(); }
  /** lo..hi (양끝 포함) */
  int(lo: number, hi: number): number { return lo + Math.floor(this.next() * (hi - lo + 1)); }
  chance(p: number): boolean { return this.next() < p; }
  sign(): number { return this.next() < 0.5 ? -1 : 1; }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }

  weighted<T>(entries: ReadonlyArray<readonly [T, number]>): T {
    let total = 0;
    for (const e of entries) total += Math.max(0, e[1]);
    let r = this.next() * total;
    for (const e of entries) {
      r -= Math.max(0, e[1]);
      if (r < 0) return e[0];
    }
    return entries[entries.length - 1][0];
  }

  /** 근사 정규분포 (Irwin–Hall 4항). ±3.4σ 안으로 자연히 묶인다. */
  gauss(mean = 0, sd = 1): number {
    const s = this.next() + this.next() + this.next() + this.next() - 2;
    return mean + sd * (s / 0.57735);
  }

  /** mean 근처, [lo, hi] 로 자른 정규값 */
  around(mean: number, sd: number, lo: number, hi: number): number {
    const v = this.gauss(mean, sd);
    return v < lo ? lo : v > hi ? hi : v;
  }

  fork(label: string): Rng { return new Rng(this.key + '/' + label); }
}
