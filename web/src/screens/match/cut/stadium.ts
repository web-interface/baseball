// 명장면 컷 — 홈 뒤 높은 곳에서 외야를 본 경기장(원근 투영). 하늘 · 조명탑 · 관중석 2층 · 전광판 · 외야 담장 · 잔디 결 · 내야 흙 · 마운드 · 수비수.
// 정적인 그림이라 SVG 문자열 하나로 만들어 <img> 로 한 번만 그린다(움직이는 공 · 섬광은 위에 따로). 좌표: 컷 상자 400 × 378 (무대와 같은 비율).
import { mix, shade } from '../../../art/sd/draw';

export const W = 400, H = 378;
const CAM = { D: 8.6, h: 5.9, th: (10.57 * Math.PI) / 180, f: 520, cx: 200, cy: 189 };
const CO = Math.cos(CAM.th), SI = Math.sin(CAM.th);
type V3 = [number, number, number];
type Pt = [number, number];

/** 경기장 좌표(m — x 1루 쪽 +, y 중견수 쪽 +, z 높이) → 화면 [X, Y, 1m 당 px] */
export function proj(x: number, y: number, z = 0): V3 {
  const vy = y + CAM.D, vz = z - CAM.h;
  const zc = Math.max(0.4, vy * CO - vz * SI), yc = vy * SI + vz * CO;
  return [CAM.cx + (CAM.f * x) / zc, CAM.cy - (CAM.f * yc) / zc, CAM.f / zc];
}
const rad = (d: number) => (d * Math.PI) / 180;
/** 외야 담장까지 거리 — 좌우 99m · 가운데 122m (φ: 0 가운데, + 1루 쪽) */
export const fenceAt = (phi: number) => 99 + 23 * Math.cos(rad(2 * Math.max(-45, Math.min(45, phi))));
export const polar = (phi: number, d: number, z = 0) => proj(d * Math.sin(rad(phi)), d * Math.cos(rad(phi)), z);

const f1 = (n: number) => Math.round(n * 10) / 10;
const pts = (list: (V3 | Pt)[]) => list.map((p) => `${f1(p[0])},${f1(p[1])}`).join(' ');
const poly = (list: (V3 | Pt)[], attrs: string) => `<polygon points="${pts(list)}" ${attrs}/>`;

/** φ a~b 사이 띠 — (담장 + d1, 높이 z1) 에서 (담장 + d2, 높이 z2) 까지 */
function band(a: number, b: number, d1: number, z1: number, d2: number, z2: number, step = 1) {
  const fw: V3[] = [], bw: V3[] = [];
  for (let phi = a; phi <= b + 1e-6; phi += step) { fw.push(polar(phi, fenceAt(phi) + d1, z1)); bw.push(polar(phi, fenceAt(phi) + d2, z2)); }
  return [...fw, ...bw.reverse()];
}
/** 바닥 다각형(월드 xy) — 카메라 뒤로 넘어가지 않게 y ≥ ymin 으로 자르고 투영 */
function ground(list: Pt[], ymin = 1): V3[] {
  const out: Pt[] = [];
  for (let i = 0; i < list.length; i++) {
    const A = list[i], B = list[(i + 1) % list.length];
    const ina = A[1] >= ymin, inb = B[1] >= ymin;
    if (ina) out.push(A);
    if (ina !== inb) { const t = (ymin - A[1]) / (B[1] - A[1]); out.push([A[0] + (B[0] - A[0]) * t, ymin]); }
  }
  return out.map(([x, y]) => proj(x, y, 0));
}
const circle = (cx: number, cy: number, r: number, n = 40, a0 = 0, a1 = 360): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => { const a = rad(a0 + ((a1 - a0) * i) / n); return [cx + Math.sin(a) * r, cy + Math.cos(a) * r] as Pt; });

function rng(seed: number) {
  let a = seed >>> 0 || 7;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export interface StadiumOpts {
  night: boolean;
  dome?: boolean;
  /** 홈 · 원정 구단 주색 (관중석 응원색 · 전광판) */
  home: { primary: string; secondary: string; short: string };
  away: { primary: string; short: string };
  /** 전광판 점수 (원정, 홈) */
  score: [number, number];
  /** 수비수 유니폼 (상의 · 바지 · 모자) */
  fld: { uni: string; pants: string; cap: string };
  seed: number;
}

/** 수비수 — 아주 작은 SD 몸(모자 · 얼굴 · 상의 · 바지), 무릎에 손 짚은 준비 자세 */
function fielder(x: number, y: number, k: { uni: string; pants: string; cap: string }) {
  const [X, Y, s] = proj(x, y, 0);
  const h = 1.9 * s * 1.25; // 조금 크게 (먼 곳이라 안 보이지 않게)
  const u = h / 10, ink = '#1b1712';
  return `<g transform="translate(${f1(X)},${f1(Y)})">`
    + `<ellipse cx="0" cy="0" rx="${f1(u * 3.6)}" ry="${f1(u * 0.9)}" fill="#000" opacity=".3"/>`
    + `<path d="M${f1(-u * 2.4)},${f1(-u * 0.2)} L${f1(-u * 1.6)},${f1(-u * 3.6)} L${f1(u * 1.6)},${f1(-u * 3.6)} L${f1(u * 2.4)},${f1(-u * 0.2)}" fill="none" stroke="${k.pants}" stroke-width="${f1(u * 1.5)}" stroke-linecap="round" stroke-linejoin="round"/>`
    + `<path d="M${f1(-u * 2.3)},${f1(-u * 3.2)} Q0,${f1(-u * 7.6)} ${f1(u * 2.3)},${f1(-u * 3.2)} Z" fill="${k.uni}" stroke="${ink}" stroke-width="${f1(u * 0.35)}"/>`
    + `<circle cx="0" cy="${f1(-u * 7.4)}" r="${f1(u * 2.1)}" fill="#f1c9a5" stroke="${ink}" stroke-width="${f1(u * 0.35)}"/>`
    + `<path d="M${f1(-u * 2.2)},${f1(-u * 7.6)} Q0,${f1(-u * 10.4)} ${f1(u * 2.2)},${f1(-u * 7.6)} L${f1(u * 3)},${f1(-u * 7.3)} L${f1(-u * 2.2)},${f1(-u * 7.3)} Z" fill="${k.cap}" stroke="${ink}" stroke-width="${f1(u * 0.35)}"/>`
    + `</g>`;
}

/** 경기장 SVG 문자열 (viewBox 0 0 400 378) */
export function stadiumSvg(o: StadiumOpts): string {
  const R = rng(o.seed);
  const night = o.night || !!o.dome;
  let s = '';
  let defs = '';

  // ── 하늘
  const sky = o.dome ? ['#0d1118', '#1a212d', '#2c3646'] : night ? ['#04070f', '#0c1633', '#1e3062'] : ['#2b6fc4', '#5ea8e8', '#b9def8'];
  defs += `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset=".55" stop-color="${sky[1]}"/><stop offset="1" stop-color="${sky[2]}"/></linearGradient>`;
  s += `<rect width="${W}" height="${H}" fill="url(#sky)"/>`;
  if (!night) { // 구름
    for (let i = 0; i < 7; i++) {
      const x = R() * W, y = 6 + R() * 38, rx = 24 + R() * 40;
      s += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(rx)}" ry="${f1(rx * 0.22)}" fill="#fff" opacity="${f1(0.35 + R() * 0.3)}" filter="url(#soft)"/>`;
    }
  } else if (o.dome) { // 돔 지붕 — 철골 원호
    for (let i = 1; i <= 6; i++) s += `<path d="M-20,${i * 9} Q200,${i * 9 - 26} 420,${i * 9}" stroke="#3a4558" stroke-width="1" fill="none" opacity=".7"/>`;
  }

  // ── 조명탑(밤) — 지붕 위 좌우, 빛 무리
  const towers: Pt[] = [];
  if (night) {
    for (const phi of [-19, 19]) {
      const d = fenceAt(phi) + 50;
      const base = polar(phi, d, 22), top = polar(phi, d, 31);
      const w = 5.5 * top[2];
      towers.push([top[0], top[1]]);
      s += `<path d="M${f1(base[0])},${f1(base[1])} L${f1(top[0])},${f1(top[1] + w * 0.5)}" stroke="#2a3346" stroke-width="${f1(top[2] * 0.7)}"/>`;
      s += `<rect x="${f1(top[0] - w)}" y="${f1(top[1] - w * 0.45)}" width="${f1(w * 2)}" height="${f1(w * 0.9)}" rx="1" fill="#2a3346"/>`;
      for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) s += `<circle cx="${f1(top[0] - w + (c + 0.5) * (w / 3))}" cy="${f1(top[1] - w * 0.45 + (r + 0.5) * (w * 0.3))}" r="${f1(w * 0.11)}" fill="#fffbe6"/>`;
    }
  }

  // ── 관중석 — 아래층 · 띠 전광판 · 위층 · 지붕. 가운데(|φ|<6.5)는 타자 눈(검은 벽) + 큰 전광판
  const crowd = (id: string, w: number, h: number, dot: number, base: string, n: number) => {
    let p = `<pattern id="${id}" width="${w}" height="${h}" patternUnits="userSpaceOnUse"><rect width="${w}" height="${h}" fill="${base}"/>`;
    const pal = [o.home.primary, o.home.primary, o.home.primary, o.home.primary, mix(o.home.primary, '#ffffff', 0.4), mix(o.home.primary, '#ffffff', 0.4), '#d9dde3', o.home.secondary, '#5a6272', '#5a6272', o.away.primary, '#f2c94c', '#e05a4f', '#e8b996'];
    for (let i = 0; i < n; i++) {
      const x = R() * w, y = Math.floor(R() * 3) * (h / 3) + R() * 0.6;
      const c = pal[Math.floor(R() * pal.length)];
      p += `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(dot)}" height="${f1(dot * 1.35)}" rx="${f1(dot * 0.4)}" fill="${c}" opacity="${f1(0.4 + R() * 0.45)}"/>`;
    }
    return p + '</pattern>';
  };
  const standBase = night ? '#101624' : '#343c4b';
  defs += crowd('crowdLo', 13, 6.3, 1.25, standBase, 34) + crowd('crowdHi', 10, 4.2, 0.85, shade(standBase, 0.85), 30);
  defs += `<linearGradient id="deckLo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset=".5" stop-color="#000" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></linearGradient>`;
  defs += `<filter id="soft" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>`;
  defs += `<filter id="dof" x="-2%" y="-5%" width="104%" height="110%"><feGaussianBlur stdDeviation=".7"/></filter>`;
  let st = '';
  const E = 6.5; // 가운데 타자 눈 반폭(도)
  // 위층
  for (const [a, b] of [[-36, -E], [E, 36]]) {
    st += poly(band(a, b, 31, 16, 46, 22), `fill="url(#crowdHi)"`);
    st += poly(band(a, b, 31, 16, 46, 22), `fill="url(#deckLo)"`);
  }
  // 지붕 (위층 위 차양) + 지붕 밑 조명 줄
  st += poly(band(-36, 36, 44.5, 22, 49, 24.2), `fill="${night ? '#1c2232' : '#59606d'}"`);
  if (night) { for (let phi = -34; phi <= 34; phi += 2.2) { const q = polar(phi, fenceAt(phi) + 45.5, 21.7); st += `<circle cx="${f1(q[0])}" cy="${f1(q[1])}" r="${f1(q[2] * 0.28)}" fill="#fff6d6" opacity=".9"/>`; } }
  // 띠 전광판(두 층 사이) — 구단색 흐름
  defs += `<linearGradient id="ribbon" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${o.home.primary}"/><stop offset=".25" stop-color="${mix(o.home.primary, '#ffffff', 0.35)}"/><stop offset=".5" stop-color="${o.home.primary}"/><stop offset=".75" stop-color="${mix(o.home.primary, '#ffffff', 0.35)}"/><stop offset="1" stop-color="${o.home.primary}"/></linearGradient>`;
  st += poly(band(-36, 36, 29.6, 13, 31, 16), `fill="url(#ribbon)" opacity="${night ? 0.95 : 0.85}"`);
  st += poly(band(-36, 36, 29.6, 13, 29.9, 13.6), `fill="#0d1016" opacity=".6"`);
  // 아래층
  for (const [a, b] of [[-36, -E], [E, 36]]) {
    st += poly(band(a, b, 1.6, 3.3, 29.6, 13), `fill="url(#crowdLo)"`);
    st += poly(band(a, b, 1.6, 3.3, 29.6, 13), `fill="url(#deckLo)"`);
    // 줄(좌석 열) · 통로(계단)
    for (const t of [0.22, 0.45, 0.68]) {
      const line = []; for (let phi = a; phi <= b; phi += 1) line.push(polar(phi, fenceAt(phi) + 1.6 + 28 * t, 3.3 + 9.7 * t));
      st += `<polyline points="${pts(line)}" fill="none" stroke="#000" stroke-opacity=".28" stroke-width=".7"/>`;
    }
    for (let phi = a + 4; phi < b - 1; phi += 7.5) {
      const p0 = polar(phi, fenceAt(phi) + 1.6, 3.3), p1 = polar(phi, fenceAt(phi) + 29.6, 13);
      st += `<line x1="${f1(p0[0])}" y1="${f1(p0[1])}" x2="${f1(p1[0])}" y2="${f1(p1[1])}" stroke="#c9ced6" stroke-opacity=".35" stroke-width="${f1(p0[2] * 1.1)}"/>`;
    }
  }
  // 타자 눈(가운데 검은 벽) + 큰 전광판
  st += poly(band(-E, E, 1.2, 3.3, 22, 11), `fill="${night ? '#0b1a14' : '#173326'}"`);
  {
    const SB = 4.6; // 전광판 반폭(도)
    const a = polar(-SB, fenceAt(0) + 24, 10.5), b = polar(SB, fenceAt(0) + 24, 10.5), c = polar(SB, fenceAt(0) + 24, 24), d = polar(-SB, fenceAt(0) + 24, 24);
    st += poly([a, b, c, d], `fill="#0a0d13" stroke="#3a4252" stroke-width="1.6"`);
    const x0 = d[0], y0 = d[1], w = b[0] - a[0], h = a[1] - d[1];
    // 화면 — 두 팀 · 점수 (점등 글자)
    st += `<rect x="${f1(x0 + w * 0.04)}" y="${f1(y0 + h * 0.08)}" width="${f1(w * 0.92)}" height="${f1(h * 0.84)}" fill="#050608"/>`;
    const fs = h * 0.27;
    const row = (k: number, name: string, col: string, sc: number) =>
      `<rect x="${f1(x0 + w * 0.09)}" y="${f1(y0 + h * (0.2 + k * 0.34))}" width="${f1(w * 0.05)}" height="${f1(fs * 0.9)}" fill="${col}"/>`
      + `<text x="${f1(x0 + w * 0.18)}" y="${f1(y0 + h * (0.2 + k * 0.34) + fs * 0.82)}" font-family="'Malgun Gothic','Apple SD Gothic Neo',sans-serif" font-weight="800" font-size="${f1(fs)}" fill="#f4f6f8"${name.length > 3 ? ` textLength="${f1(w * 0.5)}" lengthAdjust="spacingAndGlyphs"` : ''}>${name}</text>`
      + `<text x="${f1(x0 + w * 0.86)}" y="${f1(y0 + h * (0.2 + k * 0.34) + fs * 0.86)}" text-anchor="end" font-family="'Arial Black',Arial,sans-serif" font-weight="900" font-size="${f1(fs * 1.05)}" fill="#ffd34d">${sc}</text>`;
    st += row(0, esc(o.away.short), o.away.primary, o.score[0]) + row(1, esc(o.home.short), o.home.primary, o.score[1]);
    // 다리
    const m0 = polar(-E * 0.5, fenceAt(0) + 24, 3.3), m1 = polar(-E * 0.5, fenceAt(0) + 24, 10.5), n0 = polar(E * 0.5, fenceAt(0) + 24, 3.3), n1 = polar(E * 0.5, fenceAt(0) + 24, 10.5);
    st += `<path d="M${f1(m0[0])},${f1(m0[1])} L${f1(m1[0])},${f1(m1[1])} M${f1(n0[0])},${f1(n0[1])} L${f1(n1[0])},${f1(n1[1])}" stroke="#2a313f" stroke-width="${f1(m0[2] * 1.2)}"/>`;
  }
  s += `<g filter="url(#dof)">${st}</g>`;
  // 조명 빛 무리 (관중석 위에 덮는 빛)
  if (night) {
    defs += `<radialGradient id="glow"><stop offset="0" stop-color="#fffdf0" stop-opacity=".95"/><stop offset=".12" stop-color="#fff3c4" stop-opacity=".55"/><stop offset=".45" stop-color="#9fb8ff" stop-opacity=".14"/><stop offset="1" stop-color="#9fb8ff" stop-opacity="0"/></radialGradient>`;
    for (const [x, y] of towers) s += `<circle cx="${f1(x)}" cy="${f1(y)}" r="74" fill="url(#glow)"/>`;
    s += `<rect width="${W}" height="120" fill="url(#haze)"/>`;
    defs += `<linearGradient id="haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7f9cff" stop-opacity="0"/><stop offset=".85" stop-color="#9fb6ff" stop-opacity=".16"/><stop offset="1" stop-color="#9fb6ff" stop-opacity="0"/></linearGradient>`;
  }

  // ── 외야 담장(쿠션 · 노란 홈런선 · 거리 표시)
  {
    const wall = band(-36, 36, 0, 0, 0, 3.2);
    s += poly(wall, `fill="${night ? '#123b31' : '#1a4d3f'}"`);
    for (let phi = -35; phi <= 35; phi += 2.5) {
      const a = polar(phi, fenceAt(phi), 0.15), b = polar(phi, fenceAt(phi), 3.05);
      s += `<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke="#0a241d" stroke-width=".6" opacity=".8"/>`;
    }
    const top = []; for (let phi = -36; phi <= 36; phi += 1) top.push(polar(phi, fenceAt(phi), 3.2));
    s += `<polyline points="${pts(top)}" fill="none" stroke="#ffd23f" stroke-width="1.3"/>`;
    const m = polar(0, fenceAt(0), 1.6);
    s += `<text x="${f1(m[0])}" y="${f1(m[1] + m[2] * 0.75)}" text-anchor="middle" font-family="'Arial Black',Arial,sans-serif" font-weight="900" font-size="${f1(m[2] * 2.1)}" fill="#f4f4ef" opacity=".9">122</text>`;
    for (const phi of [-22, 22]) { const q = polar(phi, fenceAt(phi), 1.6); s += `<text x="${f1(q[0])}" y="${f1(q[1] + q[2] * 0.75)}" text-anchor="middle" font-family="'Arial Black',Arial,sans-serif" font-weight="900" font-size="${f1(q[2] * 2.1)}" fill="#f4f4ef" opacity=".9">${Math.round(fenceAt(phi))}</text>`; }
  }

  // ── 바닥: 잔디(결) · 경고 트랙 · 내야 흙 · 내야 잔디 · 마운드 · 2루
  const grassC = night ? '#2f7a3e' : '#3f9147';
  const fair: Pt[] = [];
  for (let phi = -40; phi <= 40; phi += 1) { const d = fenceAt(phi) - 4.5; fair.push([d * Math.sin(rad(phi)), d * Math.cos(rad(phi))]); }
  fair.push([120, -2], [-120, -2]);
  s += poly(ground(fair), `fill="${grassC}"`);
  const track: Pt[] = [];
  for (let phi = -40; phi <= 40; phi += 1) { const d = fenceAt(phi); track.push([d * Math.sin(rad(phi)), d * Math.cos(rad(phi))]); }
  for (let phi = 40; phi >= -40; phi -= 1) { const d = fenceAt(phi) - 4.5; track.push([d * Math.sin(rad(phi)), d * Math.cos(rad(phi))]); }
  s += poly(ground(track), `fill="${night ? '#8a5d3b' : '#a06c45'}"`);
  // 잔디 결 — 두 방향(1루선 · 3루선과 나란히) 띠가 겹쳐 바둑판
  const stripes = (clip: string) => {
    let g = `<g clip-path="url(#${clip})">`;
    for (const [dir, col, op] of [[1, '#ffffff', 0.075], [-1, '#000000', 0.085]] as [number, string, number][]) {
      for (let k = -2; k < 24; k += 2) {
        const a0 = k * 5.2, a1 = a0 + 5.2;
        // a = 선 방향 거리, b = 수직 — (a,b) → 월드
        const toW = (a: number, b: number): Pt => dir > 0 ? [(a - b) * 0.7071, (a + b) * 0.7071] : [(b - a) * 0.7071, (a + b) * 0.7071];
        g += poly(ground([toW(a0, -30), toW(a1, -30), toW(a1, 140), toW(a0, 140)]), `fill="${col}" opacity="${op}"`);
      }
    }
    return g + '</g>';
  };
  defs += `<clipPath id="cFair"><polygon points="${pts(ground(fair))}"/></clipPath>`;
  s += stripes('cFair');
  // 내야 흙 — 마운드 중심 반지름 29m 호
  const dirtC = night ? '#a8754c' : '#bf8656';
  const arc = circle(0, 18.44, 29, 48, -105, 105);
  s += poly(ground([...arc.slice(0, 49), [30, 2], [0, -1], [-30, 2]]), `fill="${dirtC}"`);
  // 내야 잔디 (베이스 길 안쪽)
  const inf: Pt[] = [[0, 2.6], [18.5, 19.4], [0, 37.0], [-18.5, 19.4]];
  defs += `<clipPath id="cInf"><polygon points="${pts(ground(inf))}"/></clipPath>`;
  s += poly(ground(inf), `fill="${grassC}"`);
  s += stripes('cInf');
  // 흙 · 잔디 경계 살짝 어둡게
  s += `<polygon points="${pts(ground(inf))}" fill="none" stroke="#000" stroke-opacity=".12" stroke-width="1"/>`;
  // 마운드 + 투수판
  s += poly(ground(circle(0, 18.44, 2.74, 30)), `fill="${dirtC}"`);
  s += poly(ground(circle(0, 18.44, 2.0, 24)), `fill="${mix(dirtC, '#ffffff', 0.1)}"`);
  s += poly(ground([[-0.31, 18.36], [0.31, 18.36], [0.31, 18.52], [-0.31, 18.52]]), `fill="#f4f4f0"`);
  // 2루
  s += poly(ground([[0, 38.55], [0.27, 38.82], [0, 39.09], [-0.27, 38.82]]), `fill="#f4f4f0"`);
  // 조명 · 원근 — 가운데(내야) 밝고 가장자리 어둡게
  defs += `<radialGradient id="lit" cx=".5" cy=".55" r=".7"><stop offset="0" stop-color="#fff" stop-opacity="${night ? 0.09 : 0.06}"/><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></radialGradient>`;
  const field = proj(0, 130, 0);
  s += `<rect y="${f1(field[1] - 4)}" width="${W}" height="${f1(H - field[1] + 4)}" fill="url(#lit)"/>`;

  // ── 수비수 (투수는 컷이 따로 그린다)
  for (const [x, y] of [[-26, 84], [0, 96], [26, 84], [-10, 41], [10, 41]] as Pt[]) s += fielder(x, y, o.fld);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs>${defs}</defs>${s}</svg>`;
}

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
