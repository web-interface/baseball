// 구단 엠블럼 — 세계관(04_world.json emblemIdea)대로 직접 그린 기하 문장. 실제 로고·마스코트 금지.
// 48 격자. 색은 구단색(primary · secondary · accent). 어두운 바탕에서 어두운 면이 묻히지 않게 --emblem-edge 테두리.
import type { ClubCode, Team } from '../game/types';
import s from './Emblem.module.css';

type C = { p: string; s: string; a: string };
const EDGE = 'var(--emblem-edge)';

/** 5각 별 (cx, cy, 바깥 반지름) */
function star(cx: number, cy: number, r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

/** 갈기 — 원 둘레에 삼각형 n 개 */
function mane(cx: number, cy: number, r0: number, r1: number, n: number, half: number) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = (i * 2 * Math.PI) / n - Math.PI / 2;
    const p = (rr: number, da: number) => `${(cx + rr * Math.cos(a + da)).toFixed(2)} ${(cy + rr * Math.sin(a + da)).toFixed(2)}`;
    d += `M${p(r0, -half)}L${p(r1, 0)}L${p(r0, half)}Z`;
  }
  return d;
}

/** 공룡 골판 — 원호 위에 서는 삼각형 5개 (가운데가 가장 큼) */
function plates() {
  const cx = 24, cy = 44, R = 17;
  const angs = [-62, -31, 0, 31, 62];
  const hs = [7, 10, 13.5, 10, 7];
  let d = '';
  angs.forEach((deg, i) => {
    const a = ((deg - 90) * Math.PI) / 180;
    const nx = Math.cos(a), ny = Math.sin(a);
    const tx = -ny, ty = nx;
    const bx = cx + R * nx, by = cy + R * ny;
    const w = hs[i] * 0.42;
    d += `M${(bx - tx * w).toFixed(2)} ${(by - ty * w).toFixed(2)}L${(bx + nx * hs[i]).toFixed(2)} ${(by + ny * hs[i]).toFixed(2)}L${(bx + tx * w).toFixed(2)} ${(by + ty * w).toFixed(2)}Z`;
  });
  return d;
}

function Mark({ code, c }: { code: ClubCode; c: C }) {
  switch (code) {
    case 'DJ': // 깎은 육각 방패 + 왼쪽을 보는 독수리 옆머리(꺾은선) + 긴 삼각 부리 + 크림 눈 + 깃털 3개
      return (
        <>
          <path d="M15 11 18.5 2.5 21 11ZM22 11 24.5 1 27 11ZM29 11 31.5 3 34 11Z" fill={c.s} stroke={EDGE} strokeWidth=".6" />
          <path d="M8 9.5h32l4.2 13.3-8.6 17.4H12.4L3.8 22.8Z" fill={c.p} stroke={c.s} strokeWidth="2.6" strokeLinejoin="round" />
          <path d="M35.4 38.6 36.8 31 35 25.2 36.4 21.6 31.6 15.6 23.4 14.6 18.6 17.6 19.4 23.4 24 28.8 25.4 38.6Z" fill={c.s} />
          <path d="M19.6 17.2 7.8 21 10.8 26.2 13 23.4 20 23.8Z" fill={c.a} stroke={c.s} strokeWidth=".8" strokeLinejoin="round" />
          <path d="M22.6 19.8 28 17.8 26.4 21.4Z" fill={c.a} />
        </>
      );
    case 'GJ': // 원형 배지 + 역오각형 호랑이 얼굴
      return (
        <>
          <circle cx="24" cy="24" r="21.5" fill={c.p} stroke={c.s} strokeWidth="2.6" />
          <path d="M12.5 15 15 9.5 19 13.6M35.5 15 33 9.5 29 13.6" fill="none" stroke={c.s} strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M11.4 14.2H36.6L38.4 25.8 24 39.4 9.6 25.8Z" fill="none" stroke={c.s} strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M17.6 16.6h12.8v2.6H17.6ZM19.2 20.6h9.6v1.7h-9.6ZM20.8 23.6h6.4v1.1h-6.4Z" fill={c.s} />
          <path d="M14.4 26.6c1.8-1.6 4.1-1.8 6-.2-1.9 1.4-4.2 1.5-6 .2ZM33.6 26.6c-1.8-1.6-4.1-1.8-6-.2 1.9 1.4 4.2 1.5 6 .2Z" fill={c.a} />
          <path d="M11.6 29.6 16 31.4M12.6 33 16.6 34M36.4 29.6 32 31.4M35.4 33 31.4 34" stroke={c.s} strokeWidth="1.6" strokeLinecap="round" />
          <path d="M22.2 33.4h3.6L24 35.6Z" fill={c.s} />
        </>
      );
    case 'DG': // 방사형 갈기 12개 + 흰 얼굴
      return (
        <>
          <path d={mane(24, 24, 12.6, 22.8, 12, 0.26)} fill={c.p} stroke={EDGE} strokeWidth=".6" strokeLinejoin="round" />
          <circle cx="24" cy="24" r="13.4" fill={c.p} />
          <path d="M14.6 16.4H33.4L35.2 25.2 24 36 12.8 25.2Z" fill={c.s} />
          <path d="M16.6 22.4 19.8 21 23 22.4 19.8 23.8ZM25 22.4 28.2 21 31.4 22.4 28.2 23.8Z" fill={c.a} />
          <path d="M21.6 27.6h4.8L24 30.8Z" fill={c.p} />
        </>
      );
    case 'BS': // 큰 발자국 + 파도 3줄 + 실밥
      return (
        <>
          <circle cx="12.6" cy="12" r="3.9" fill={c.p} stroke={EDGE} strokeWidth=".6" />
          <circle cx="19.8" cy="8" r="3.4" fill={c.p} stroke={EDGE} strokeWidth=".6" />
          <circle cx="26.8" cy="7.2" r="3.1" fill={c.p} stroke={EDGE} strokeWidth=".6" />
          <circle cx="33.2" cy="9.2" r="2.8" fill={c.p} stroke={EDGE} strokeWidth=".6" />
          <circle cx="38.2" cy="13.4" r="2.5" fill={c.p} stroke={EDGE} strokeWidth=".6" />
          <path d="M11.2 17.6h25.6c2.2 0 3.6 2 3 4.1l-5.2 19.4c-.5 1.8-2.1 3.1-4 3.1H17.4c-1.9 0-3.5-1.3-4-3.1L8.2 21.7c-.6-2.1.8-4.1 3-4.1Z" fill={c.p} stroke={EDGE} strokeWidth=".6" />
          <path d="M13 25.4c3.6-2.4 7.2-2.4 10.8 0s7.2 2.4 10.8 0M14.6 31c3.2-2.1 6.4-2.1 9.6 0s6.4 2.1 9.6 0M16.6 36.6c2.5-1.7 5-1.7 7.4 0s5 1.7 7.4 0" fill="none" stroke={c.a} strokeWidth="1.8" strokeLinecap="round" />
          <path d="m28.6 22.4 1.3 1.2 1.1-1.4M31.4 22.6l1.3 1.2 1.1-1.4M34 23.2l1.2 1.1 1-1.3" fill="none" stroke={c.s} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
    case 'SB': // 반달가슴곰 — 귀 · 둥근 오각형 얼굴 · V 반달 · 빨강 코
      return (
        <>
          <circle cx="12.6" cy="10.6" r="5.4" fill={c.p} stroke={EDGE} strokeWidth=".6" />
          <circle cx="35.4" cy="10.6" r="5.4" fill={c.p} stroke={EDGE} strokeWidth=".6" />
          <path d="M11 12.6h26c1.6 0 2.8 1.2 3 2.7l1 11.2c.1 1.2-.3 2.3-1.1 3.1L25.6 42.4c-.9.8-2.3.8-3.2 0L8.1 29.6C7.3 28.8 6.9 27.7 7 26.5l1-11.2c.2-1.5 1.4-2.7 3-2.7Z" fill={c.p} stroke={EDGE} strokeWidth=".6" />
          <circle cx="18.4" cy="21.4" r="1.6" fill={c.s} />
          <circle cx="29.6" cy="21.4" r="1.6" fill={c.s} />
          <circle cx="24" cy="26.6" r="2.4" fill={c.a} />
          <path d="M13.6 30.2 24 37.6 34.4 30.2 31.6 35.4 24 40.6 16.4 35.4Z" fill={c.s} />
          <rect x="15" y="44.2" width="18" height="2.6" rx="1.3" fill={c.s} />
        </>
      );
    case 'ST': // 겹친 두 원 + 렌즈 안 실밥
      return (
        <>
          <circle cx="17" cy="24" r="13.2" fill={c.p} stroke={EDGE} strokeWidth=".6" />
          <circle cx="31" cy="24" r="12.1" fill="none" stroke={c.s} strokeWidth="2.2" />
          <path d="M24 12.8a13.2 13.2 0 0 1 0 22.4 13.2 13.2 0 0 1 0-22.4Z" fill={c.a} />
          <path d="M22.4 18.4c1 1.6 1 9.6 0 11.2M25.6 18.4c-1 1.6-1 9.6 0 11.2" fill="none" stroke={c.s} strokeWidth="1.2" strokeLinecap="round" />
        </>
      );
    case 'SH': // 망토 자락 + 오각 방패 + 위로 오르는 셰브론 3개
      return (
        <>
          <path d="M10.4 9.2 3.6 43.4 13.4 34.6ZM37.6 9.2l6.8 34.2-9.8-8.8Z" fill={c.s} />
          <path d="M10 7.6h28v21.2L24 42.2 10 28.8Z" fill={c.p} stroke={c.s} strokeWidth="2.4" strokeLinejoin="round" />
          <path d="M16.4 33.2 24 26.6l7.6 6.6M16.4 26.8 24 20.2l7.6 6.6M16.4 20.4 24 13.8l7.6 6.6" fill="none" stroke={c.a} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
    case 'IC': // 뱃머리 V + 닻 + 직선 파도 2줄
      return (
        <>
          <path d="M5.6 12.4h36.8L24 36.6Z" fill={c.s} opacity=".85" />
          <g fill="none" stroke={c.a} strokeWidth="5.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="24" cy="8.4" r="3.2" />
            <path d="M24 11.6v25.6M17 16.4h14M12.2 29.2c1.6 5.4 6.2 8.6 11.8 8.6s10.2-3.2 11.8-8.6" />
          </g>
          <g fill="none" stroke={c.p} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="24" cy="8.4" r="3.2" />
            <path d="M24 11.6v25.6M17 16.4h14M12.2 29.2c1.6 5.4 6.2 8.6 11.8 8.6s10.2-3.2 11.8-8.6" />
            <path d="m10 31.4 2.2-2.4 2.8 1.6M38 31.4l-2.2-2.4-2.8 1.6" />
          </g>
          <path d="M8 42.2h32M11 46h26" stroke={c.s} strokeWidth="2.2" strokeLinecap="round" />
        </>
      );
    case 'CW': // 아이보리 배지 + 남색 등 원호 + 브론즈 골판 5개
      return (
        <>
          <circle cx="24" cy="24" r="21.6" fill={c.a} stroke={c.s} strokeWidth="2.4" />
          <path d={plates()} fill={c.p} stroke={c.s} strokeWidth=".9" strokeLinejoin="round" />
          <path d="M8.6 38.4a17 17 0 0 1 30.8 0" fill="none" stroke={c.s} strokeWidth="3.4" strokeLinecap="round" />
        </>
      );
    case 'SW': // 끝이 꺾인 마법사 모자 + 바이올렛 챙 + X 배트 + 별 3개
      return (
        <>
          <path d="M14.6 33.6 38.4 46M33.4 33.6 9.6 46" stroke={c.s} strokeWidth="3" strokeLinecap="round" />
          <path d="M14.6 33.6 38.4 46M33.4 33.6 9.6 46" stroke={EDGE} strokeWidth=".6" strokeLinecap="round" opacity=".6" />
          <path d="M13.4 30.2 22.4 7.8c.6-1.5 2.4-2.2 3.8-1.3l7.6 4.6-4.6-.6 3.6 19.7Z" fill={c.p} stroke={EDGE} strokeWidth=".7" strokeLinejoin="round" />
          <ellipse cx="24" cy="31" rx="16.4" ry="3.8" fill={c.s} />
          <path d={star(8.8, 18.4, 3.2) + star(39.6, 21.2, 2.6) + star(35.6, 6.8, 2.2)} fill={c.a} />
        </>
      );
  }
}

export interface EmblemProps {
  team: Pick<Team, 'emblem' | 'colors' | 'name'>;
  size?: number;
  className?: string;
}

export function Emblem({ team, size = 24, className }: EmblemProps) {
  const c: C = { p: team.colors.primary, s: team.colors.secondary, a: team.colors.accent };
  return (
    <svg className={[s.em, className].filter(Boolean).join(' ')} width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={team.name}>
      <Mark code={team.emblem} c={c} />
    </svg>
  );
}
