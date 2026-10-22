// 임시 초상 — 캐릭터 생성기가 오기 전까지 쓰는 단순한 얼굴 그림 (시드 고정, 같은 선수는 늘 같은 얼굴)
// 평면 일러스트: 모자(구단색 + 글자) · 얼굴 · 귀 · 눈썹 · 눈 · 코 · 입 · 수염 · 아이블랙 · 유니폼 깃
import type { Origin, Player, Team } from '../game/types';

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rand(seed: string) {
  let a = hash(seed) || 7;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length) % xs.length];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const f = (n: number) => Math.round(n * 10) / 10;

const SKIN: Record<Origin, string[]> = {
  KR: ['#F2CBA8', '#EBBE97', '#E2B088', '#D9A37A', '#CF9870'],
  JP: ['#F1CAA6', '#E9BC94', '#DDAC83'],
  TW: ['#EEC6A0', '#E3B58C', '#D6A47A'],
  US: ['#F3D0B5', '#E8BA9A', '#C99372', '#A9714F'],
  USB: ['#8A5A3C', '#704530', '#5C3826'],
  LATAM: ['#D9A47C', '#C48D63', '#A9734E', '#8E5C3D'],
  AU: ['#F2CDB1', '#E5B893', '#D3A07B'],
};
const HAIR: Record<Origin, string[]> = {
  KR: ['#17130F', '#1E1813', '#2A211A', '#3A2B20'],
  JP: ['#17130F', '#241B15', '#3B2B1F'],
  TW: ['#17130F', '#211913'],
  US: ['#3A2A1E', '#5A3F28', '#8A6A44', '#1C1612'],
  USB: ['#120E0C', '#1A1411'],
  LATAM: ['#130F0C', '#241A13', '#3A2A1E'],
  AU: ['#5A3F28', '#8A6A44', '#B08A56'],
};

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const m = (c: number) => Math.max(0, Math.min(255, Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k)));
  return `#${((1 << 24) | (m(r) << 16) | (m(g) << 8) | m(b)).toString(16).slice(1)}`;
}
const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};

export function interimPortrait(p: Player, team: Team, variant: 'portrait' | 'full' | 'mini', set: 'home' | 'away'): string {
  const r = rand(p.look);
  const skin = pick(r, SKIN[p.origin]);
  const skinSh = shade(skin, -0.16);
  const skinDp = shade(skin, -0.32);
  const hair = pick(r, HAIR[p.origin]);
  const bmi = p.weightKg / ((p.heightCm / 100) ** 2);
  const hw = f(lerp(15.6, 19.2, Math.min(1, Math.max(0, (bmi - 21) / 9))) + (r() - 0.5) * 1.2); // 얼굴 반폭
  const jw = f(hw * lerp(0.52, 0.72, r()));                // 턱 반폭
  const chin = f(lerp(78.5, 81.5, r()));                   // 턱 끝 y
  const eg = f(lerp(6.4, 7.6, r()));                       // 눈 간격(반)
  const eyeY = f(lerp(58.4, 60, r()));
  const browT = f(lerp(1.5, 2.6, r()));
  const browA = f(lerp(-1.6, 1.2, r()));                   // 눈썹 기울기
  const mw = f(lerp(4.4, 6, r()));
  const smile = r() < 0.32 ? f(lerp(0.8, 1.8, r())) : f(lerp(-0.3, 0.3, r()));
  const beard = r() < 0.3 ? pick(r, ['stubble', 'goatee', 'mustache', 'stubble'] as const) : 'none';
  const eyeBlack = p.pos !== 'P' && r() < 0.28;
  const capColor = team.colors.primary;
  const capDark = shade(capColor, -0.28);
  const capInk = lum(capColor) > 0.6 ? team.colors.secondary : team.colors.ink;
  const jersey = set === 'home' ? '#F2F0EA' : team.colors.secondary;
  const trim = set === 'home' ? team.colors.primary : team.colors.primary;
  const jerseySh = shade(jersey, -0.12);

  const cx = 50;
  const L = cx - hw, R = cx + hw;
  const face = `M${L} 46 C${L} ${f(eyeY + 8)} ${f(cx - jw - 1)} ${f(chin - 4)} ${cx} ${chin} C${f(cx + jw + 1)} ${f(chin - 4)} ${R} ${f(eyeY + 8)} ${R} 46 Z`;
  const shadeSide = `M${cx + 3} 44 L${R + 0.5} 44 C${R + 0.5} ${f(eyeY + 8)} ${f(cx + jw + 1)} ${f(chin - 4)} ${cx} ${chin} C${cx + 4} ${f(chin - 8)} ${cx + 5} 66 ${cx + 3} 44 Z`;

  const parts: string[] = [];
  // 몸 (유니폼)
  parts.push(`<path d="M4 120 C7 103 19 95.5 33 92.5 L43 89.5 L50 95 L57 89.5 L67 92.5 C81 95.5 93 103 96 120 Z" fill="${jersey}"/>`);
  parts.push(`<path d="M67 92.5 C81 95.5 93 103 96 120 L70 120 C71 108 70 99 67 92.5 Z" fill="${jerseySh}" opacity=".7"/>`);
  // 목
  parts.push(`<path d="M${cx - 8.4} 76 L${cx - 8.4} 91 Q${cx} 97.5 ${cx + 8.4} 91 L${cx + 8.4} 76 Z" fill="${skinSh}"/>`);
  parts.push(`<path d="M${cx - 8.4} 84 Q${cx} 90 ${cx + 8.4} 84 L${cx + 8.4} 80 Q${cx} 86 ${cx - 8.4} 80 Z" fill="${skinDp}" opacity=".35"/>`);
  // 깃 (V넥 + 단추줄)
  parts.push(`<path d="M42.2 89.6 L50 100.5 L57.8 89.6" fill="none" stroke="${trim}" stroke-width="2.6" stroke-linejoin="round"/>`);
  parts.push(`<path d="M50 100.5 V120" stroke="${trim}" stroke-width="1" opacity=".55"/>`);
  parts.push(`<circle cx="50" cy="106" r=".9" fill="${trim}" opacity=".7"/><circle cx="50" cy="113" r=".9" fill="${trim}" opacity=".7"/>`);
  // 귀
  parts.push(`<ellipse cx="${L + 0.4}" cy="${f(eyeY + 1.5)}" rx="3.1" ry="5" fill="${skinSh}"/><ellipse cx="${R - 0.4}" cy="${f(eyeY + 1.5)}" rx="3.1" ry="5" fill="${skinSh}"/>`);
  // 얼굴 + 그늘
  parts.push(`<path d="${face}" fill="${skin}"/>`);
  parts.push(`<path d="${shadeSide}" fill="${skinSh}" opacity=".55"/>`);
  // 구레나룻
  parts.push(`<path d="M${L} 45 L${f(L + 3.4)} 45 L${f(L + 2.6)} ${f(eyeY - 1)} L${L} ${f(eyeY + 1)} Z" fill="${hair}"/>`);
  parts.push(`<path d="M${R} 45 L${f(R - 3.4)} 45 L${f(R - 2.6)} ${f(eyeY - 1)} L${R} ${f(eyeY + 1)} Z" fill="${hair}"/>`);
  // 수염
  if (beard === 'stubble') parts.push(`<path d="M${f(cx - jw - 2)} ${f(chin - 9)} C${f(cx - jw)} ${f(chin - 2)} ${f(cx - 4)} ${chin} ${cx} ${chin} C${f(cx + 4)} ${chin} ${f(cx + jw)} ${f(chin - 2)} ${f(cx + jw + 2)} ${f(chin - 9)} C${f(cx + 6)} ${f(chin - 5)} ${f(cx - 6)} ${f(chin - 5)} ${f(cx - jw - 2)} ${f(chin - 9)} Z" fill="${hair}" opacity=".2"/>`);
  if (beard === 'goatee') parts.push(`<path d="M${cx - 4.6} ${f(chin - 6)} Q${cx} ${f(chin - 4)} ${cx + 4.6} ${f(chin - 6)} L${cx + 3.6} ${f(chin - 0.6)} Q${cx} ${f(chin + 1.4)} ${cx - 3.6} ${f(chin - 0.6)} Z" fill="${hair}" opacity=".85"/>`);
  if (beard === 'mustache' || beard === 'goatee') parts.push(`<path d="M${f(cx - mw - 0.6)} 70.6 Q${cx} 67.4 ${f(cx + mw + 0.6)} 70.6 Q${cx} 69.4 ${f(cx - mw - 0.6)} 70.6 Z" fill="${hair}" opacity=".85"/>`);
  // 눈썹
  const brow = (x: number, dir: 1 | -1) => {
    const x0 = x - dir * 3.8, x1 = x + dir * 3.2;
    const y0 = eyeY - 4.2 + (dir === 1 ? browA : browA) * 0.5, y1 = eyeY - 4.9 - browA * 0.6;
    return `<path d="M${f(x0)} ${f(y0)} Q${f(x)} ${f(Math.min(y0, y1) - 1.1)} ${f(x1)} ${f(y1)}" fill="none" stroke="${hair}" stroke-width="${browT}" stroke-linecap="round"/>`;
  };
  parts.push(brow(cx - eg, -1), brow(cx + eg, 1));
  // 눈
  const eye = (x: number) => `<path d="M${f(x - 2.7)} ${eyeY} Q${x} ${f(eyeY - 1.8)} ${f(x + 2.7)} ${eyeY} Q${x} ${f(eyeY + 1.2)} ${f(x - 2.7)} ${eyeY} Z" fill="#1B1512"/><circle cx="${f(x + 0.7)}" cy="${f(eyeY - 0.5)}" r=".45" fill="#fff" opacity=".7"/>`;
  parts.push(eye(cx - eg), eye(cx + eg));
  if (eyeBlack) parts.push(`<path d="M${f(cx - eg - 3)} ${f(eyeY + 3.2)} h6 l-.6 1.9 h-4.8 Z M${f(cx + eg - 3)} ${f(eyeY + 3.2)} h6 l-.6 1.9 h-4.8 Z" fill="#141416" opacity=".88"/>`);
  // 코
  parts.push(`<path d="M${cx + 0.6} ${f(eyeY + 1.5)} L${cx - 1.4} ${f(eyeY + 8)} Q${cx + 0.4} ${f(eyeY + 9.4)} ${cx + 2.2} ${f(eyeY + 8.2)}" fill="none" stroke="${skinDp}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" opacity=".8"/>`);
  // 입
  parts.push(`<path d="M${f(cx - mw)} 72 Q${cx} ${f(72 + smile)} ${f(cx + mw)} 72" fill="none" stroke="${shade(skin, -0.42)}" stroke-width="1.35" stroke-linecap="round"/>`);
  parts.push(`<path d="M${f(cx - mw * 0.6)} ${f(73.6 + smile * 0.5)} Q${cx} ${f(75 + smile * 0.5)} ${f(cx + mw * 0.6)} ${f(73.6 + smile * 0.5)}" fill="none" stroke="${skinDp}" stroke-width="1" stroke-linecap="round" opacity=".35"/>`);
  // 모자 그늘
  parts.push(`<path d="M${f(L - 0.5)} 46 Q${cx} 53.5 ${f(R + 0.5)} 46 L${f(R + 0.5)} 49 Q${cx} 56 ${f(L - 0.5)} 49 Z" fill="${skinDp}" opacity=".28"/>`);
  // 모자: 정수리 + 챙
  parts.push(`<path d="M${f(L - 2)} 47 C${f(L - 2.4)} 30.5 ${f(cx - 8)} 24 ${cx} 24 C${f(cx + 8)} 24 ${f(R + 2.4)} 30.5 ${f(R + 2)} 47 Z" fill="${capColor}"/>`);
  parts.push(`<path d="M${cx + 2} 24.2 C${f(cx + 9)} 24.8 ${f(R + 2.4)} 31 ${f(R + 2)} 47 L${cx + 6} 47 C${cx + 7} 38 ${cx + 6} 29 ${cx + 2} 24.2 Z" fill="${capDark}" opacity=".5"/>`);
  parts.push(`<path d="M${cx} 24.3 V46.6" stroke="${capDark}" stroke-width=".6" opacity=".8"/>`);
  parts.push(`<circle cx="${cx}" cy="24.6" r="1.3" fill="${capDark}"/>`);
  parts.push(`<path d="M${f(L - 3.6)} 46.4 C${f(cx - 9)} 53.4 ${f(cx + 9)} 53.4 ${f(R + 3.6)} 46.4 C${f(cx + 9)} 48.6 ${f(cx - 9)} 48.6 ${f(L - 3.6)} 46.4 Z" fill="${capDark}"/>`);
  parts.push(`<text x="${cx}" y="41.6" text-anchor="middle" font-family="Barlow Condensed, Pretendard Variable, sans-serif" font-weight="800" font-size="11" fill="${capInk}">${team.cap}</text>`);

  const body = parts.join('');
  const vb = variant === 'mini' ? '23 21 54 54' : variant === 'full' ? '0 10 100 110' : '0 12 100 108';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" preserveAspectRatio="xMidYMax meet">${body}</svg>`;
}
