// 카드에 들어가는 작은 그림들 — 리그 마크 · 네 갈래 별 · 수상 문장(MVP 월계관 · GG 황금 글러브 · TH 왕관)
// · 고유 구종 궤적 · 장비 칸 · 이름 띠(붓 자국 가장자리). 모두 직접 그린 SVG, 이미지 파일·이모지 없음.
import { useId, type ReactElement } from 'react';
import type { PitchType } from '../game/types';
import type { GearSlot } from './gear';
import { seeded } from './meta';

const f2 = (n: number) => Math.round(n * 100) / 100;

/** 리그 마크(가칭 HANBYEOL) — 다이아몬드 + 실밥 */
export function LeagueMark({ className, seam = '#E0384E' }: { className?: string; seam?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden>
      <path d="M8 1.4 14.6 8 8 14.6 1.4 8Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M6.3 5.2q1.5 2.8 0 5.6M9.7 5.2q-1.5 2.8 0 5.6" fill="none" stroke={seam} strokeWidth="1.05" strokeLinecap="round" />
    </svg>
  );
}

/** 네 갈래 별 (특별 선수) */
export function Star4({ className, fill = 'currentColor' }: { className?: string; fill?: string }) {
  return (
    <svg className={className} viewBox="-12 -12 24 24" aria-hidden>
      <path d="M0 -11C1 -3 3 -1 11 0 3 1 1 3 0 11-1 3-3 1-11 0-3-1-1-3 0-11Z" fill={fill} />
    </svg>
  );
}

/* ───────── 고유 구종 궤적 (16 격자) — 구종마다 공이 가는 길이 다르다 ───────── */
const PITCH_PATH: Record<PitchType, string> = {
  FF: 'M2 8.6C6 8.2 9.6 7.6 12.6 7',            // 직구 — 거의 곧게(살짝 떠오름)
  SI: 'M2 5.6C6.4 5.8 10 7.6 12.4 11.4',        // 투심·뱀직구 — 휘며 가라앉음
  FC: 'M2 6.6H8.4C10.6 6.6 11.8 7.6 12.6 9.4',  // 커터 — 끝에서 짧게
  SL: 'M2 5C7.6 5 10.6 7 12.6 11.8',            // 슬라이더 — 옆으로 꺾임
  SW: 'M1.8 6.4C5.6 4.8 10.4 5.6 14 9.2',       // 스위퍼 — 넓게 쓸어 감
  CU: 'M2 6C5.4 1.6 10.6 3.4 12.4 12.8',        // 커브 — 크게 떨어짐
  CH: 'M2 6.4H8.8C10.8 6.6 12 8.6 12.4 11.2',   // 체인지업 — 늦게 짧게 떨어짐
  FS: 'M2 5.8H10C11.6 6 12.2 8.6 12.4 12.8',    // 포크 — 끝에서 뚝
  KN: 'M2 7.4 4.8 5.2 7.4 8.8 10 5.8 12.6 9.8', // 너클 — 어디로 갈지 모름
};
const PITCH_END: Record<PitchType, [number, number]> = {
  FF: [12.6, 7], SI: [12.4, 11.4], FC: [12.6, 9.4], SL: [12.6, 11.8], SW: [14, 9.2], CU: [12.4, 12.8], CH: [12.4, 11.2], FS: [12.4, 12.8], KN: [12.6, 9.8],
};

export function PitchGlyph({ base, className }: { base: PitchType; className?: string }) {
  const [x, y] = PITCH_END[base] ?? [12.6, 9];
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden>
      <path d={PITCH_PATH[base] ?? PITCH_PATH.FF} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2.1 1.5" />
      <circle cx={x} cy={y} r="1.9" fill="currentColor" />
    </svg>
  );
}

/* ───────── 장비 칸 (16 격자) ───────── */
const GEAR_PATH: Record<GearSlot, string> = {
  bat: 'M2.6 13.4 3.8 12.2M4.4 11.6 12.1 3.9a1.45 1.45 0 0 1 2 2.05L6.4 13.6Z',
  glove: 'M5 14.2c-1.6-1.4-2.6-3.4-2.6-5.8V6.6a1.2 1.2 0 0 1 2.4 0V3.8a1.2 1.2 0 0 1 2.4 0v-.4a1.2 1.2 0 0 1 2.4 0v.4a1.2 1.2 0 0 1 2.4.2v4.6c0 2.6-.9 4.4-2.4 5.6ZM5 11.4h6.6',
  spikes: 'M1.8 11.2V7.6l3.4-1 2.4 2.2 5.6 1c1 .2 1.4.9 1.4 1.8v.6H1.8ZM3.6 12.2v1.8M7 12.2v1.8M10.4 12.2v1.8',
  batgloves: 'M4.6 14.2V8.4a1 1 0 0 1 2 0V4.8a1 1 0 0 1 2 0v-.6a1 1 0 0 1 2 0v.8a1 1 0 0 1 2 .2v5.2c0 2.2-1.4 3.8-3.6 3.8ZM4.6 11.4h7.8',
  helmet: 'M2.4 11.4c0-3.6 2.4-6.2 5.8-6.2s5.8 2.6 5.8 6.2v.9H7.6M14 12.3h.8a.6.6 0 0 0 .6-.8l-.5-1.1M2.4 11.4v.9h5.2V9.4',
  band: 'M3.6 5.2h8.8A1.6 1.6 0 0 1 14 6.8v2.4a1.6 1.6 0 0 1-1.6 1.6H3.6A1.6 1.6 0 0 1 2 9.2V6.8a1.6 1.6 0 0 1 1.6-1.6ZM5.6 5.2v5.6M10.4 5.2v5.6',
  guard: 'M3.2 4.2c2.6.6 4.6 2.4 5.4 4.8M9.4 2.8c2.6 1 4.2 3.4 4.2 6.2s-1.6 4.8-4 5.4M3 9.8c1.6 0 3 .8 3.6 2.2M3.2 4.2 3 9.8M9.4 2.8l-.8 6.2',
  cap: 'M2.6 10.8c0-3.4 2.4-6 5.6-6s5.6 2.6 5.6 6ZM8.2 4.8v1.2M13.8 10.8h1.6M2.6 10.8h11.2',
  shirt: 'M5.6 2.6 2.4 4.4l1.2 3 1.4-.6v7.4h6V6.8l1.4.6 1.2-3-3.2-1.8c-.4 1-1.4 1.6-2.4 1.6S6 3.6 5.6 2.6Z',
};

export function GearGlyph({ slot, className }: { slot: GearSlot; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden>
      <path d={GEAR_PATH[slot]} fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ───────── 수상 문장 (64 격자) ───────── */
function Leaves({ cx, cy, r, n, from, step, fill }: { cx: number; cy: number; r: number; n: number; from: number; step: number; fill: string }) {
  const out: ReactElement[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const d = from + i * step;
      const a = side < 0 ? d : 180 - d;
      const rad = (a * Math.PI) / 180;
      const x = cx + r * Math.cos(rad), y = cy + r * Math.sin(rad);
      const rot = a + (side < 0 ? -32 : 32);
      out.push(<ellipse key={`${side}${i}`} cx={f2(x)} cy={f2(y)} rx="1.5" ry="3.6" transform={`rotate(${f2(rot)} ${f2(x)} ${f2(y)})`} fill={fill} />);
    }
  }
  return <>{out}</>;
}

/** MVP = 월계관 · GG = 황금 글러브 · TH = 왕관 */
export function Crest({ kind, year, pos, title, className }: { kind: 'mvp' | 'gg' | 'th'; year: number; pos?: string; title?: string; className?: string }) {
  const id = 'cr' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const yr = String(year < 100 ? (year > 28 ? 1900 : 2000) + year : year);
  const gold = (
    <linearGradient id={id + 'g'} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#FFF4CC" /><stop offset=".35" stopColor="#E2B24A" /><stop offset=".6" stopColor="#8E6014" /><stop offset=".8" stopColor="#F3D27A" /><stop offset="1" stopColor="#9A6A18" />
    </linearGradient>
  );
  if (kind === 'gg') {
    return (
      <svg className={className} viewBox="0 0 64 64" role="img" aria-label={`골든글러브 ${yr}`}>
        <defs>
          <linearGradient id={id + 'l'} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FCE7A8" /><stop offset=".4" stopColor="#D9A33A" /><stop offset=".7" stopColor="#9A6716" /><stop offset="1" stopColor="#E8BE62" />
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r="30.5" fill={`url(#${id}l)`} />
        <circle cx="32" cy="32" r="27" fill="#26160A" />
        <circle cx="32" cy="32" r="24.6" fill="none" stroke="#F3D9A0" strokeWidth=".7" strokeDasharray="1.6 1.3" />
        <g fill={`url(#${id}l)`}>
          <rect x="24.4" y="13.6" width="5.2" height="18" rx="2.6" transform="rotate(-8 27 23.6)" />
          <rect x="30" y="11.4" width="5.4" height="20" rx="2.7" />
          <rect x="35.8" y="12.6" width="5.2" height="19" rx="2.6" transform="rotate(7 38.4 23)" />
          <rect x="41" y="16.4" width="4.8" height="15.6" rx="2.4" transform="rotate(16 43.4 25)" />
          <rect x="15.6" y="26" width="5.4" height="14" rx="2.7" transform="rotate(-38 18.3 33)" />
          <path d="M23.4 27H46.2L44.8 39.6Q41 46.8 33.4 47.2 25.6 46.8 23.4 40.6Z" />
          <path d="M19.8 28.4 24.6 26.4V36.4Z" />
        </g>
        <path d="M25 30.6H44.6" stroke="#26160A" strokeWidth=".7" />
        <text x="34.4" y="42.6" textAnchor="middle" fontFamily="'Barlow Condensed',sans-serif" fontWeight="700" fontSize="8.6" fill="#3A220B">{pos}</text>
        <text x="32" y="55" textAnchor="middle" fontFamily="'Barlow Condensed',sans-serif" fontWeight="700" fontSize="4.1" letterSpacing=".9" fill="#E9C77A">GOLDEN GLOVE {yr}</text>
      </svg>
    );
  }
  if (kind === 'th') {
    return (
      <svg className={className} viewBox="0 0 64 64" role="img" aria-label={`타이틀 홀더 ${title ?? ''} ${yr}`}>
        <defs>{gold}</defs>
        <circle cx="32" cy="32" r="30.5" fill={`url(#${id}g)`} />
        <circle cx="32" cy="32" r="27" fill="#13224E" />
        <circle cx="32" cy="32" r="24.6" fill="none" stroke="#E7C46C" strokeWidth=".6" strokeDasharray="1 1.5" />
        {/* 왕관 */}
        <path d="M19.6 27.2 18 15.4l6.6 6 7.4-9.4 7.4 9.4 6.6-6-1.6 11.8Z" fill={`url(#${id}g)`} />
        <rect x="19.4" y="28.2" width="25.2" height="3.2" rx=".8" fill={`url(#${id}g)`} />
        <circle cx="32" cy="12.4" r="1.6" fill="#F4D98E" /><circle cx="18" cy="14.6" r="1.3" fill="#F4D98E" /><circle cx="46" cy="14.6" r="1.3" fill="#F4D98E" />
        <circle cx="25.6" cy="24.6" r="1" fill="#13224E" /><circle cx="32" cy="23.2" r="1.2" fill="#13224E" /><circle cx="38.4" cy="24.6" r="1" fill="#13224E" />
        <text x="32" y="43" textAnchor="middle" fontFamily="'Pretendard Variable',sans-serif" fontWeight="800" fontSize={title && title.length > 3 ? 7.4 : 8.6} fill="#F4D98E">{title ?? 'TITLE'}</text>
        <text x="32" y="51.6" textAnchor="middle" fontFamily="'Barlow Condensed',sans-serif" fontWeight="700" fontSize="4.6" letterSpacing="1.1" fill="#C7A458">TITLE HOLDER {yr}</text>
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 64 64" role="img" aria-label={`시즌 MVP ${yr}`}>
      <defs>{gold}</defs>
      <circle cx="32" cy="32" r="30.5" fill={`url(#${id}g)`} />
      <circle cx="32" cy="32" r="27" fill="#0E1528" />
      {/* 월계관 — 아래에서 묶여 양쪽으로 올라가는 잎 */}
      <Leaves cx={32} cy={31} r={19.6} n={8} from={100} step={15.5} fill="#D9B158" />
      <path d="M27.6 50.4Q32 47.6 36.4 50.4" fill="none" stroke="#D9B158" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M32 12.6 33.4 16.4 37.4 16.5 34.2 19 35.4 22.8 32 20.6 28.6 22.8 29.8 19 26.6 16.5 30.6 16.4Z" fill={`url(#${id}g)`} />
      <text x="32" y="37.6" textAnchor="middle" fontFamily="'Barlow Condensed',sans-serif" fontWeight="800" fontSize="14" letterSpacing=".4" fill="#F4D98E">MVP</text>
      <text x="32" y="44.4" textAnchor="middle" fontFamily="'Barlow Condensed',sans-serif" fontWeight="700" fontSize="4.6" letterSpacing="1.2" fill="#C7A458">{yr}</text>
    </svg>
  );
}

/* ───────── 이름 띠 — 왼쪽 아래 → 오른쪽 위 14° (기울기 0.25). 붓 자국 가장자리·튄 물감은 선수마다 고정 ───────── */
export const BAND_Y0 = 126;
export const bandY = (x: number) => BAND_Y0 - 0.25 * (x + 2);

const bandCache = new Map<string, { rough: string; clean: string; line: string; streaks: string; dust: [number, number, number][] }>();

export function bandGeometry(seed: string) {
  const hit = bandCache.get(seed);
  if (hit) return hit;
  const r = seeded('band:' + seed);
  const pts: string[] = [];
  const N = 46;
  for (let i = 0; i <= N; i++) {
    const x = -2 + (104 * i) / N;
    const j = (r() - 0.5) * 1.05 + (r() < 0.14 ? -r() * 1.5 : 0);
    pts.push(`${f2(x)} ${f2(bandY(x) + j)}`);
  }
  const rough = `M${pts.join('L')}L102 142L-2 142Z`;
  const clean = `M-2 ${bandY(-2)}L102 ${f2(bandY(102))}L102 142L-2 142Z`;
  const line = `M-2 ${f2(bandY(-2) - 3.6)}L102 ${f2(bandY(102) - 3.6)}`;
  // 마른 붓 결 — 가장자리 바로 위 가는 줄 몇 개
  let streaks = '';
  for (let i = 0; i < 6; i++) {
    const x0 = r() * 92 - 2, len = 5 + r() * 16, off = 0.7 + r() * 1.7;
    streaks += `M${f2(x0)} ${f2(bandY(x0) - off)}L${f2(x0 + len)} ${f2(bandY(x0 + len) - off)}`;
  }
  const dust: [number, number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const x = r() * 104 - 2;
    dust.push([f2(x), f2(bandY(x) - r() * r() * 6.4 + 0.6), f2(0.1 + r() * 0.42)]);
  }
  const out = { rough, clean, line, streaks, dust };
  bandCache.set(seed, out);
  return out;
}

/** 친필 사인 끝 획 — 선수마다 조금씩 다르게 */
export function autographStroke(seed: string) {
  const r = seeded('auto:' + seed);
  const a = f2(2 + r() * 3), b = f2(10 + r() * 3);
  return `M${a} ${b}C${f2(26 + r() * 10)} ${f2(2 + r() * 4)} ${f2(54 + r() * 10)} ${f2(13 + r() * 3)} ${f2(92 + r() * 6)} ${f2(2 + r() * 3)}`;
}

/* ───────── 레전드 기요셰(지폐식 겹원) — 한 번 만들어 그림으로 재사용 ───────── */
function rosetteSvg() {
  let s = '';
  for (let i = 0; i < 36; i++) s += `<ellipse rx='46' ry='16.5' transform='rotate(${i * 5})' fill='none' stroke='%23FFF1C8' stroke-width='.22'/>`;
  for (let i = 0; i < 4; i++) s += `<circle r='${12 + i * 11}' fill='none' stroke='%23FFF1C8' stroke-width='.3'/>`;
  return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='-50 -50 100 100'%3E${s.replace(/</g, '%3C').replace(/>/g, '%3E')}%3C/svg%3E")`;
}
export const ROSETTE = rosetteSvg();
