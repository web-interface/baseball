// 색 계산 — OKLab/OKLCH 기반. 명암 단계를 사람 눈 기준으로 고르게 만들기 위해 쓴다.

type RGB = [number, number, number];

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function hexToRgb(hex: string): RGB {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex(c: RGB): string {
  const to = (v: number) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0');
  return '#' + to(c[0]) + to(c[1]) + to(c[2]);
}

const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toGam = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

export function rgbToOklab(c: RGB): RGB {
  const r = toLin(c[0]), g = toLin(c[1]), b = toLin(c[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToRgb(c: RGB): RGB {
  const l_ = c[0] + 0.3963377774 * c[1] + 0.2158037573 * c[2];
  const m_ = c[0] - 0.1055613458 * c[1] - 0.0638541728 * c[2];
  const s_ = c[0] - 0.0894841775 * c[1] - 1.291485548 * c[2];
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  return [
    toGam(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toGam(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toGam(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** [L 0..1, C 0..~0.37, H deg] */
export function toLch(hex: string): RGB {
  const [L, a, b] = rgbToOklab(hexToRgb(hex));
  const C = Math.hypot(a, b);
  let H = (Math.atan2(b, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return [L, C, H];
}

export function lch(L: number, C: number, H: number): string {
  const h = (H * Math.PI) / 180;
  // 색역을 벗어나면 채도를 줄여 맞춘다
  let c = Math.max(0, C);
  for (let i = 0; i < 12; i++) {
    const rgb = oklabToRgb([clamp01(L), c * Math.cos(h), c * Math.sin(h)]);
    if (rgb.every((v) => v >= -0.002 && v <= 1.002)) return rgbToHex(rgb);
    c *= 0.82;
  }
  return rgbToHex(oklabToRgb([clamp01(L), 0, 0]));
}

/** 밝기·채도·색상 조정. l, c 는 더하기, h 는 각도 더하기, cMul 은 채도 곱 */
export function adj(hex: string, o: { l?: number; c?: number; h?: number; cMul?: number }): string {
  const [L, C, H] = toLch(hex);
  return lch(L + (o.l ?? 0), (C + (o.c ?? 0)) * (o.cMul ?? 1), H + (o.h ?? 0));
}

export function mix(a: string, b: string, t: number): string {
  const A = rgbToOklab(hexToRgb(a)), B = rgbToOklab(hexToRgb(b));
  return rgbToHex(oklabToRgb([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]));
}

export function lum(hex: string): number { return toLch(hex)[0]; }

/** 천·가죽 같은 일반 재질의 3~4단계 톤. 그림자는 살짝 차갑게(파랑 쪽), 하이라이트는 따뜻하게. */
export interface Tone { base: string; shade: string; deep: string; light: string; line: string }

export function toneOf(base: string, o: { shade?: number; cool?: number; light?: number } = {}): Tone {
  const [L, C, H] = toLch(base);
  const sh = o.shade ?? 0.1;
  const cool = o.cool ?? 1;
  // 무채색 그림자는 푸른 회색 쪽으로, 유채색은 색상을 약간 비틀어 탁하지 않게
  const towardBlue = (h: number, amt: number) => {
    let d = 255 - h;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return h + d * amt;
  };
  const shadeH = C < 0.03 ? 255 : towardBlue(H, 0.12 * cool);
  return {
    base,
    shade: lch(L - sh, C < 0.03 ? Math.max(C, 0.012 * cool) : C * 1.04, shadeH),
    deep: lch(L - sh * 1.9, C < 0.03 ? Math.max(C, 0.016 * cool) : C * 1.02, C < 0.03 ? 255 : towardBlue(H, 0.18 * cool)),
    light: lch(Math.min(0.985, L + (o.light ?? 0.045)), C * 0.92, H + (C < 0.03 ? 0 : -4)),
    line: lch(Math.max(0.12, L * 0.42), Math.min(0.06, C * 0.8 + 0.01), C < 0.03 ? 260 : H),
  };
}
