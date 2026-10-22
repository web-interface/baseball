// 구단 엠블럼 20종(현재 10 + 옛 10) — 직접 그린 기하 문장 (실제 로고·마스코트 아님). 세계관 04_world.json 의 emblemIdea 를 따르되
// '작게도 알아보게'를 먼저 지킨다: 구단마다 바깥 실루엣이 다르다(육각 방패 · 원 · 갈기 별 · 발자국 · 곰 머리 · 겹친 원 ·
// 망토 방패 · 닻 · 둥근 사각 · 마법사 모자). 그래서 16px 에서도 모양만으로 구분된다.
// 48 격자 · 평면(그라디언트·그림자 없음) · 구단색 3가지 + 강조 한 점.
// 상세도 2단 — L(32px 이상): 무늬·결까지 / S(32px 미만): 가는 선·작은 점은 빼고 핵심 선은 굵게.
// 어두운 바탕에서 어두운 면(남색·검정)이 묻히지 않게 바깥 실루엣에 --emblem-edge 테두리 (테마가 정함, S 는 더 굵게).
import type { ReactElement } from 'react';
import type { ClubCode } from '../../game/types';

export type Detail = 's' | 'l';
export interface Ink { p: string; s: string; a: string }

const EDGE = 'var(--emblem-edge, rgba(127,127,127,.4))';
/** 호랑이 주둥이 · 곰 귀 안쪽 같은 '흰 점' 한 곳 */
const CREAM = '#F7F1E6';
const f = (n: number) => Math.round(n * 100) / 100;
/** 바깥 테두리 굵기 — 어두운 면일수록, 작을수록 굵게 */
const ew = (d: Detail, dark = false) => (d === 's' ? (dark ? 2.2 : 1.2) : dark ? 1.1 : 0.7);

/** 5각 별 */
export function starPath(cx: number, cy: number, r: number, inner = 0.44) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * inner : r;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${f(cx + rr * Math.cos(a))} ${f(cy + rr * Math.sin(a))}`);
  }
  return `M${pts.join('L')}Z`;
}

/** n 각 톱니 별 (갈기) */
function burst(cx: number, cy: number, rOut: number, rIn: number, n: number, rot = 0) {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? rIn : rOut;
    const a = rot + (i * Math.PI) / n - Math.PI / 2;
    pts.push(`${f(cx + r * Math.cos(a))} ${f(cy + r * Math.sin(a))}`);
  }
  return `M${pts.join('L')}Z`;
}

type P2 = [number, number];
/** 3차 베지어 위 점과 접선 */
function cubic(p0: P2, c1: P2, c2: P2, p3: P2, t: number) {
  const u = 1 - t;
  const pt: P2 = [
    u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p3[1],
  ];
  const tg: P2 = [
    3 * u * u * (c1[0] - p0[0]) + 6 * u * t * (c2[0] - c1[0]) + 3 * t * t * (p3[0] - c2[0]),
    3 * u * u * (c1[1] - p0[1]) + 6 * u * t * (c2[1] - c1[1]) + 3 * t * t * (p3[1] - c2[1]),
  ];
  const l = Math.hypot(tg[0], tg[1]) || 1;
  return { pt, tg: [tg[0] / l, tg[1] / l] as P2 };
}

/* ───────── 대전 독수리스 — 모서리 깎은 육각 방패 + 왼쪽을 보는 독수리 옆머리 + 뒤로 젖힌 깃털 3개 ───────── */
const DJ_SHIELD = 'M11 7.4H37L43.6 16.4V29.2L24 45.2 4.4 29.2V16.4Z';
const DJ_SHIELD_IN = 'M12.4 10.2H35.6L40.8 17.3V27.9L24 41.6 7.2 27.9V17.3Z';
function DJ({ c, d, uid }: { c: Ink; d: Detail; uid: string }) {
  return (
    <>
      <defs>
        <clipPath id={`dj${uid}`}><path d={DJ_SHIELD_IN} /></clipPath>
      </defs>
      {/* 깃털 — 방패 윗변 뒤로, 오른쪽으로 젖혀 솟음 */}
      <path
        d={d === 'l'
          ? 'M14.8 8.6C16.6 5.6 19 3.2 22.4 1.6 21.4 4.4 21 6.6 21.2 8.6ZM21.6 8.6C23.6 5.2 26.6 2.6 30.6 .8 29.2 3.8 28.6 6.4 28.8 8.6ZM29 8.6C30.8 6 33.4 4 36.8 2.8 35.8 5 35.6 6.9 36 8.6Z'
          : 'M15.4 8.6C17.2 5.4 19.8 3 23.4 1.4 22.2 4.4 21.8 6.6 22 8.6ZM23.4 8.6C25.4 5.2 28.4 2.8 32.4 1.2 31 4.2 30.6 6.6 30.8 8.6Z'}
        fill={c.s}
        stroke={EDGE}
        strokeWidth={ew(d)}
        strokeLinejoin="round"
      />
      <path d={DJ_SHIELD} fill={c.s} stroke={EDGE} strokeWidth={ew(d)} strokeLinejoin="round" />
      <path d={DJ_SHIELD_IN} fill={c.p} />
      <g clipPath={`url(#dj${uid})`}>
        {/* 머리 + 목 (꺾은선) — 목은 방패 밖으로 흘러 잘림 */}
        <path
          d={d === 'l'
            ? 'M18.4 16.4 24.6 12.2 33 11.6 38.8 15.4 36.2 19.4 40.6 22.8 37.2 26.4 41.4 31.6 38 34.4 42 48H27.6L23.4 29.4 19.6 26.2Z'
            : 'M18 16.4 24.4 12 33.2 11.4 39.4 15.6 37.4 20.4 41.6 24 38.6 28.6 43 48H27.2L23 29.6 19.4 26.4Z'}
          fill={c.s}
        />
        {/* 눈썹 뼈 (음각) */}
        {d === 'l' && <path d="M20.6 15.2 30.6 16.4 29.4 18 21.8 16.9Z" fill={c.p} />}
      </g>
      {/* 부리 — 긴 삼각형, 끝이 아래로 굽음 */}
      <path d={d === 'l' ? 'M19.6 15.6 6.6 21.4 8.4 25.6 11.2 23.6 20 25Z' : 'M19.4 15.4 6 21.6 8 26.4 20 25.6Z'} fill={c.a} stroke={c.s} strokeWidth={d === 'l' ? 1 : 1.4} strokeLinejoin="round" />
      {d === 'l' && <path d="M19.8 21.4 11.4 22.4" stroke={c.s} strokeWidth="1" strokeLinecap="round" />}
      {/* 눈 — 크림 마름모 */}
      <path d={d === 'l' ? 'M23.2 18.6 25.8 16.8 28.4 18.6 25.8 20.4Z' : 'M22.6 18.8 25.8 16.4 29 18.8 25.8 21.2Z'} fill={c.a} />
    </>
  );
}

/* ───────── 광주 호랑이즈 — 원형 배지 + 정면 호랑이 얼굴: 앰버 얼굴 · 둥근 귀 · 검은 줄무늬 · 흰 주둥이 ───────── */
function GJ({ c, d }: { c: Ink; d: Detail }) {
  const face = 'M12.6 12.8H35.4C38.8 14.2 41.2 19.6 41.2 25.6 41.2 29.6 39.4 32.6 36 35L27.4 41C25.4 42.4 22.6 42.4 20.6 41L12 35C8.6 32.6 6.8 29.6 6.8 25.6 6.8 19.6 9.2 14.2 12.6 12.8Z';
  return (
    <>
      <circle cx="24" cy="24" r="22.6" fill={c.p} stroke={EDGE} strokeWidth={ew(d)} />
      {d === 'l' && <circle cx="24" cy="24" r="20.4" fill="none" stroke={c.s} strokeWidth=".9" opacity=".55" />}
      {/* 둥근 귀 */}
      <circle cx="12.4" cy="12.6" r={d === 'l' ? 5 : 5.4} fill={c.a} />
      <circle cx="35.6" cy="12.6" r={d === 'l' ? 5 : 5.4} fill={c.a} />
      {d === 'l' && <><circle cx="12.4" cy="12.6" r="2.3" fill={CREAM} /><circle cx="35.6" cy="12.6" r="2.3" fill={CREAM} /></>}
      <path d={face} fill={c.a} />
      {/* 이마 '가로줄 3' — 굵기가 다르다 */}
      <path d={d === 'l' ? 'M19 15.4H29L28.2 17.6H19.8ZM20.6 19.2H27.4L26.8 20.8H21.2ZM22 22.2H26L25.6 23.2H22.4Z' : 'M18.6 15H29.4L28.2 18H19.8ZM20.8 20.2H27.2L26.4 22.2H21.6Z'} fill={c.s} />
      {/* 볼 줄무늬 — 양옆에서 안으로 */}
      <path
        d={d === 'l'
          ? 'M7 21.8 15.4 23.8 7.4 25.6ZM7.6 28.2 14.6 28.6 9.4 31ZM41 21.8 32.6 23.8 40.6 25.6ZM40.4 28.2 33.4 28.6 38.6 31ZM12.8 14.6 16.6 18.4 12.4 17.6ZM35.2 14.6 31.4 18.4 35.6 17.6Z'
          : 'M6.8 21.6 16.2 24.2 7.4 26.6ZM41.2 21.6 31.8 24.2 40.6 26.6Z'}
        fill={c.s}
      />
      {/* 눈 — 검은 아몬드, 바깥 끝이 치켜 올라감 (매서운 눈) */}
      <path d={d === 'l' ? 'M15.4 22.2C17.6 22 20.6 22.6 22.4 24.4 20.4 25.6 17.4 25 15.4 22.2ZM32.6 22.2C30.4 22 27.4 22.6 25.6 24.4 27.6 25.6 30.6 25 32.6 22.2Z' : 'M14.8 21.6C17.4 21.4 21 22.2 22.8 24.6 20.4 26.2 16.8 25.4 14.8 21.6ZM33.2 21.6C30.6 21.4 27 22.2 25.2 24.6 27.6 26.2 31.2 25.4 33.2 21.6Z'} fill={c.s} />
      {d === 'l' && <><circle cx="19.6" cy="23.9" r=".75" fill={c.p} /><circle cx="28.4" cy="23.9" r=".75" fill={c.p} /></>}
      {/* 흰 주둥이 + 코 */}
      <path d={d === 'l' ? 'M18.6 31.4C18.6 28.9 21.2 28.3 24 29.7 26.8 28.3 29.4 28.9 29.4 31.4 29.4 34 27 35.8 24 35.8S18.6 34 18.6 31.4Z' : 'M17.8 31.4C17.8 28.6 20.8 28 24 29.6 27.2 28 30.2 28.6 30.2 31.4 30.2 34.4 27.4 36.4 24 36.4S17.8 34.4 17.8 31.4Z'} fill={CREAM} />
      <path d={d === 'l' ? 'M21.2 27.6H26.8L24 30.8Z' : 'M20.6 27.2H27.4L24 31.4Z'} fill={c.s} />
      {d === 'l' && <path d="M24 30.8V32.6M24 32.6 21.8 34.2M24 32.6 26.2 34.2" stroke={c.s} strokeWidth="1.05" strokeLinecap="round" fill="none" />}
    </>
  );
}

/* ───────── 대구 사자즈 — 12갈래 기하 갈기 + 흰 역오각형 얼굴 ───────── */
function DG({ c, d }: { c: Ink; d: Detail }) {
  return (
    <>
      <path d={burst(24, 24.4, 23, d === 'l' ? 15.8 : 16.6, 12)} fill={c.p} stroke={EDGE} strokeWidth={ew(d)} strokeLinejoin="round" />
      {d === 'l' && <circle cx="24" cy="24.4" r="14.6" fill="none" stroke={c.s} strokeOpacity=".28" strokeWidth=".9" />}
      <path d="M13.6 15.6H34.4L36.6 25.4 24 37.6 11.4 25.4Z" fill={c.s} />
      {/* 눈 — 가로로 긴 마름모 (갈기 금색) */}
      <path d={d === 'l' ? 'M15.8 22.6 19.4 21 23 22.6 19.4 24.2ZM25 22.6 28.6 21 32.2 22.6 28.6 24.2Z' : 'M15.2 22.6 19.2 20.4 23.2 22.6 19.2 24.8ZM24.8 22.6 28.8 20.4 32.8 22.6 28.8 24.8Z'} fill={c.a} stroke={c.p} strokeWidth={d === 'l' ? .6 : .9} strokeLinejoin="round" />
      {/* 코 + 입 */}
      <path d={d === 'l' ? 'M21.4 27.8H26.6L24 31Z' : 'M20.8 27.4H27.2L24 31.6Z'} fill={c.p} />
      {d === 'l' && <path d="M24 31V32.6M24 32.6 21.4 34.2M24 32.6 26.6 34.2" stroke={c.p} strokeWidth="1.1" strokeLinecap="round" fill="none" />}
    </>
  );
}

/* ───────── 부산 거인츠 — 큰 발자국(오른발) + 파도 + 실밥 ───────── */
const BS_SOLE = 'M12.6 21.2C12.2 16.6 17.4 13.8 24.2 13.8S36.6 15.8 36.4 21.2C36.2 26 34.4 29.6 33.8 34.2 33.2 40.6 30 46.2 23.8 46.2 18.4 46.2 15.4 42 15.6 37.2 15.8 33.4 17.2 31.4 16 28.4 15 25.8 12.9 24.4 12.6 21.2Z';
function BS({ c, d, uid }: { c: Ink; d: Detail; uid: string }) {
  const toes: [number, number, number][] = [[14.6, 9.6, 4.5], [21.9, 6.4, 3.5], [28, 6, 3.1], [33.2, 8, 2.7], [37.3, 11.6, 2.3]];
  return (
    <>
      <defs>
        <clipPath id={`bs${uid}`}><path d={BS_SOLE} /></clipPath>
      </defs>
      {toes.map(([x, y, r]) => <circle key={x} cx={x} cy={y} r={r} fill={c.p} stroke={EDGE} strokeWidth={ew(d, true)} />)}
      <path d={BS_SOLE} fill={c.p} stroke={EDGE} strokeWidth={ew(d, true)} />
      {toes.map(([x, y, r]) => <circle key={'f' + x} cx={x} cy={y} r={r} fill={c.p} />)}
      <g clipPath={`url(#bs${uid})`} fill="none" strokeLinecap="round">
        {d === 'l' ? (
          <>
            <path d="M11 23.6c3.2-2.4 6.4-2.4 9.6 0s6.4 2.4 9.6 0" stroke={c.a} strokeWidth="2.1" />
            <path d="M11 29.8c3.2-2.4 6.4-2.4 9.6 0s6.4 2.4 9.6 0 6.4-2.4 9.6 0" stroke={c.a} strokeWidth="2.1" />
            <path d="M13 36c3.2-2.4 6.4-2.4 9.6 0s6.4 2.4 9.6 0" stroke={c.a} strokeWidth="2.1" />
          </>
        ) : (
          <>
            <path d="M10 25c3.6-2.8 7.2-2.8 10.8 0s7.2 2.8 10.8 0 7.2-2.8 10.8 0" stroke={c.a} strokeWidth="3" />
            <path d="M12 34c3.6-2.8 7.2-2.8 10.8 0s7.2 2.8 10.8 0" stroke={c.a} strokeWidth="3" />
          </>
        )}
      </g>
      {/* 맨 위 파도 끝이 실밥으로 — 빨강 V */}
      {d === 'l'
        ? <path d="m30.6 22 1.1 1.3 1.3-1.1M32.8 20.7l1.1 1.3 1.3-1.1" stroke={c.s} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        : <path d="m31.2 21.4 1.6 1.8 1.8-1.6" stroke={c.s} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />}
    </>
  );
}

/* ───────── 서울 곰스 — 반달가슴곰 정면: 둥근 귀 · 둥근 오각 얼굴 · 가슴 V 반달 · 빨강 코 한 점 ───────── */
const SB_HEAD = 'M10.8 11.4H37.2C39.6 11.4 41.4 13.2 41.6 15.6L42.2 27.4C42.3 29 41.7 30.4 40.6 31.4L27 44.4C25.3 46 22.7 46 21 44.4L7.4 31.4C6.3 30.4 5.7 29 5.8 27.4L6.4 15.6C6.6 13.2 8.4 11.4 10.8 11.4Z';
function SB({ c, d }: { c: Ink; d: Detail }) {
  return (
    <>
      <g stroke={EDGE} strokeWidth={ew(d, true)}>
        <circle cx="12.4" cy="10.8" r="5.8" fill={c.p} />
        <circle cx="35.6" cy="10.8" r="5.8" fill={c.p} />
        <path d={SB_HEAD} fill={c.p} />
      </g>
      <circle cx="12.4" cy="10.8" r="5.8" fill={c.p} />
      <circle cx="35.6" cy="10.8" r="5.8" fill={c.p} />
      <path d={SB_HEAD} fill={c.p} />
      {d === 'l' && <><circle cx="12.4" cy="10.8" r="2.5" fill={c.s} opacity=".55" /><circle cx="35.6" cy="10.8" r="2.5" fill={c.s} opacity=".55" /></>}
      {/* 눈 */}
      <circle cx="17.8" cy="20.8" r={d === 'l' ? 1.7 : 2.2} fill={c.s} />
      <circle cx="30.2" cy="20.8" r={d === 'l' ? 1.7 : 2.2} fill={c.s} />
      {/* 주둥이 + 코 (빨강 한 점) */}
      {d === 'l' && <path d="M19.6 25.2C19.6 22.9 28.4 22.9 28.4 25.2 28.4 28.2 26.4 29.6 24 29.6S19.6 28.2 19.6 25.2Z" fill={c.s} opacity=".2" />}
      <circle cx="24" cy="25" r={d === 'l' ? 2.4 : 3} fill={c.a} />
      {/* 반달 — 두꺼운 V 초승달 */}
      <path d={d === 'l' ? 'M9.4 29.2 24 39.8 38.6 29.2 36 34.6 24 43.4 12 34.6Z' : 'M8.6 28.8 24 40 39.4 28.8 36.4 35.4 24 44.2 11.6 35.4Z'} fill={c.s} />
    </>
  );
}

/* ───────── 서울 쌍둥이스 — 같은 크기 원 두 개가 1/3 겹침, 렌즈 안 실밥 ───────── */
function ST({ c, d, uid }: { c: Ink; d: Detail; uid: string }) {
  const r = 13.6, lx = 16.2, rx = 31.8, cy = 24;
  return (
    <>
      <defs>
        <clipPath id={`st${uid}`}><circle cx={lx} cy={cy} r={r} /></clipPath>
      </defs>
      <circle cx={lx} cy={cy} r={r} fill={c.p} stroke={EDGE} strokeWidth={ew(d)} />
      {/* 오른쪽 원 — 선만 (테 아래 얇은 먹 선으로 밝은 바탕에서도 보이게) */}
      <circle cx={rx} cy={cy} r={r - 1.7} fill="none" stroke={EDGE} strokeWidth={d === 'l' ? 4.6 : 6} />
      <circle cx={rx} cy={cy} r={r - 1.7} fill="none" stroke={c.s} strokeWidth={d === 'l' ? 3.4 : 4.4} />
      {/* 렌즈 */}
      <g clipPath={`url(#st${uid})`}>
        <circle cx={rx} cy={cy} r={r} fill={c.a} />
      </g>
      {d === 'l' && (
        <path d="M22.2 15.6C23.8 19 23.8 29 22.2 32.4M25.8 15.6C24.2 19 24.2 29 25.8 32.4M22.4 18.4l1.4.3M22.9 21.4l1.3.1M22.9 26.6l1.3-.1M22.4 29.6l1.4-.3M25.6 18.4l-1.4.3M25.1 21.4l-1.3.1M25.1 26.6l-1.3-.1M25.6 29.6l-1.4-.3" fill="none" stroke={c.s} strokeWidth="1" strokeLinecap="round" />
      )}
      {d === 's' && <path d="M24 16.6V31.4" stroke={c.s} strokeWidth="1.8" strokeLinecap="round" />}
    </>
  );
}

/* ───────── 서울 영웅즈 — 망토를 두른 오각 방패 + 위로 오르는 셰브론 3개 ───────── */
function SH({ c, d }: { c: Ink; d: Detail }) {
  return (
    <>
      {/* 망토 자락 */}
      <path d="M11.4 9 2.6 44.6 14.6 35.4ZM36.6 9 45.4 44.6 33.4 35.4Z" fill={c.s} stroke={EDGE} strokeWidth={ew(d)} strokeLinejoin="round" />
      <path d="M8.6 5.6H39.4V28.4L24 44.4 8.6 28.4Z" fill={c.s} stroke={EDGE} strokeWidth={ew(d)} strokeLinejoin="round" />
      <path d="M11.2 8.2H36.8V27.4L24 40.8 11.2 27.4Z" fill={c.p} />
      {d === 'l' ? (
        <path d="M16.6 33 24 26.2 31.4 33M16.6 26.4 24 19.6 31.4 26.4M16.6 19.8 24 13 31.4 19.8" fill="none" stroke={c.a} strokeWidth="2.8" strokeLinecap="square" strokeLinejoin="miter" />
      ) : (
        <path d="M15.6 31.6 24 24 32.4 31.6M15.6 22.6 24 15 32.4 22.6" fill="none" stroke={c.a} strokeWidth="3.8" strokeLinecap="square" strokeLinejoin="miter" />
      )}
    </>
  );
}

/* ───────── 인천 상륙스 — 상륙정 뱃머리 V + 닻 + 직선 파도 2줄 ───────── */
function IC({ c, d }: { c: Ink; d: Detail }) {
  const anchor = 'M24 12.2V38.6M16.2 17.4H31.8M11.4 28.6C12.6 35 17.6 39.4 24 39.4S35.4 35 36.6 28.6';
  const w = d === 'l' ? 3.2 : 4;
  return (
    <>
      <path d="M4.6 11.4H43.4L24 39.6Z" fill={c.s} stroke={EDGE} strokeWidth={ew(d)} strokeLinejoin="round" />
      {/* 흰 테 (아래) */}
      <g fill="none" stroke={c.a} strokeWidth={w + 2.6} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="24" cy="8.4" r="3.6" />
        <path d={anchor} />
      </g>
      <path d="M8.2 31.2 10.6 25.4 15.2 29.4ZM39.8 31.2 37.4 25.4 32.8 29.4Z" fill={c.a} stroke={c.a} strokeWidth="2.6" strokeLinejoin="round" />
      {/* 닻 */}
      <g fill="none" stroke={c.p} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="24" cy="8.4" r="3.6" />
        <path d={anchor} />
      </g>
      <path d="M8.2 31.2 10.6 25.4 15.2 29.4ZM39.8 31.2 37.4 25.4 32.8 29.4Z" fill={c.p} />
      {/* 파도 */}
      <path d={d === 'l' ? 'M7 43.4H41M12.4 47H35.6' : 'M7 44.4H41'} stroke={c.s} strokeWidth={d === 'l' ? 2.2 : 3} strokeLinecap="round" />
    </>
  );
}

/* ───────── 창원 공룡스 — 둥근 사각 배지 + 초식 공룡(등 원호 + 골판 5개, 가운데가 가장 큼) ───────── */
const CW_BACK: [P2, P2, P2, P2][] = [
  [[14.2, 31], [17.2, 26.6], [20.8, 24], [25.4, 24]],
  [[25.4, 24], [31, 24], [35.2, 27], [37.8, 30.4]],
];
const CW_BODY =
  'M7.4 33.6C7.4 31.6 9 30.4 10.8 30.6 12.2 30.8 13.2 31.6 14.2 31 17.2 26.6 20.8 24 25.4 24 31 24 35.2 27 37.8 30.4L41.2 34.4 36.4 34.6 34.4 35.2 34.2 38.8H30.4L30.2 36.2H21.8L21.6 38.8H17.8L17.6 35.6C15.6 35.6 14 35 12.8 34.6 11.4 35.4 9.6 35.6 8.6 35.2 7.9 34.9 7.4 34.4 7.4 33.6Z';
function CW({ c, d }: { c: Ink; d: Detail }) {
  const at = [0.42, 0.86, 1.2, 1.52, 1.82];
  const hs = d === 'l' ? [5.4, 8, 10, 7.8, 5.4] : [6, 8.8, 10.8, 8.6, 6];
  let plates = '';
  at.forEach((u, i) => {
    const seg = CW_BACK[Math.min(1, Math.floor(u))];
    const { pt, tg } = cubic(seg[0], seg[1], seg[2], seg[3], u - Math.floor(u));
    const nx = tg[1], ny = -tg[0]; // 바깥(위쪽) 법선
    const w = hs[i] * 0.42;
    const bx = pt[0] - nx * 0.8, by = pt[1] - ny * 0.8;
    plates += `M${f(bx - tg[0] * w)} ${f(by - tg[1] * w)}L${f(bx + nx * hs[i])} ${f(by + ny * hs[i])}L${f(bx + tg[0] * w)} ${f(by + tg[1] * w)}Z`;
  });
  return (
    <>
      <rect x="3.2" y="3.2" width="41.6" height="41.6" rx="9.4" fill={c.s} stroke={EDGE} strokeWidth={ew(d, true)} />
      <rect x="6.2" y="6.2" width="35.6" height="35.6" rx="6.8" fill={c.a} />
      <path d={plates} fill={c.p} stroke={c.s} strokeWidth={d === 'l' ? 1 : 1.4} strokeLinejoin="round" />
      <path d={CW_BODY} fill={c.s} />
      {d === 'l' && <path d="M38.6 31.6 41.6 27.8 40.6 32.4ZM36.8 29.4 38.8 25.6 38.4 30.2Z" fill={c.s} />}
      {d === 'l' && <circle cx="10.2" cy="32.4" r=".8" fill={c.a} />}
      <rect x="6.2" y="38.6" width="35.6" height="1.8" fill={c.s} />
    </>
  );
}

/* ───────── 수원 마법사즈 — 끝이 꺾인 마법사 모자 + 바이올렛 챙 + X 배트 + 별 3개 ───────── */
const SW_HAT = 'M12.6 31 22.2 7.8C22.9 6.2 24.8 5.6 26.3 6.6L34.6 11.6 29.6 11.2 34.6 31Z';
function SW({ c, d }: { c: Ink; d: Detail }) {
  const bats = 'M14.2 33.8 37.8 46.2M33.8 33.8 10.2 46.2';
  return (
    <>
      <path d={bats} stroke={EDGE} strokeWidth={d === 'l' ? 4.6 : 6.4} strokeLinecap="round" />
      <path d={bats} stroke={c.p} strokeWidth={d === 'l' ? 3 : 4} strokeLinecap="round" />
      <path d={SW_HAT} fill={c.p} stroke={EDGE} strokeWidth={ew(d, true)} strokeLinejoin="round" />
      {d === 'l' && <path d="M14.7 26 32.9 26 33.7 29.2 13.6 29.2Z" fill={c.s} />}
      <ellipse cx="23.8" cy="31.2" rx="17.6" ry="4.2" fill={c.s} stroke={EDGE} strokeWidth={ew(d)} />
      <path d={d === 'l' ? starPath(8.4, 18.6, 3.4) + starPath(40, 20.6, 2.8) + starPath(38.4, 5.8, 2.3) : starPath(8.2, 18.2, 4.4) + starPath(40.2, 20.6, 3.8)} fill={c.a} />
    </>
  );
}

/* ═════════ 옛 구단 10 — 펠트 패치·페넌트·홈플레이트 같은 옛 응원 용품 모양 (레트로). 바깥 실루엣은 현재 구단과도 겹치지 않게 ═════════ */
/** 박음질 — 펠트 패치 가장자리 점선 (L 상세도에서만) */
const stitch = (color: string, w = 0.9) => ({ fill: 'none', stroke: color, strokeWidth: w, strokeDasharray: '1.5 1.3', strokeLinecap: 'round' as const });

/* ───────── 동대문 곰스 — 크림 펠트 원형 배지 + 성문 기와지붕(처마 끝이 들림) + 곰 얼굴 ───────── */
function DDG({ c, d }: { c: Ink; d: Detail }) {
  const roof = 'M4.6 19.2C8.6 20.4 12 19.4 14.8 16.4L17.8 12.6H30.2L33.2 16.4C36 19.4 39.4 20.4 43.4 19.2 41.2 22 37.6 23.2 33.6 22.6H14.4C10.4 23.2 6.8 22 4.6 19.2Z';
  return (
    <>
      <circle cx="24" cy="24" r="22.6" fill={c.s} stroke={EDGE} strokeWidth={ew(d)} />
      <circle cx="24" cy="24" r={d === 'l' ? 21 : 20.6} fill="none" stroke={c.p} strokeWidth={d === 'l' ? 2 : 3} />
      {d === 'l' && <circle cx="24" cy="24" r="18.6" {...stitch(c.p, 0.8)} />}
      {/* 기와지붕 + 용마루 */}
      <path d={roof} fill={c.p} />
      {d === 'l' && <path d="M16.6 12.6 18.2 10.4H29.8L31.4 12.6Z" fill={c.p} />}
      {d === 'l' && <path d="M15.6 20.6H32.4" stroke={c.s} strokeWidth=".8" strokeLinecap="round" opacity=".7" />}
      {/* 곰 — 둥근 귀 · 둥근 얼굴 · 크림 주둥이 · 벽돌 빨강 코 */}
      <circle cx="16.4" cy="26.8" r={d === 'l' ? 3.3 : 3.7} fill={c.p} />
      <circle cx="31.6" cy="26.8" r={d === 'l' ? 3.3 : 3.7} fill={c.p} />
      <circle cx="24" cy="33.2" r={d === 'l' ? 9 : 9.6} fill={c.p} />
      <ellipse cx="24" cy="36.2" rx={d === 'l' ? 4.4 : 5} ry={d === 'l' ? 3.2 : 3.6} fill={c.s} />
      <ellipse cx="24" cy="34.6" rx={d === 'l' ? 1.9 : 2.3} ry={d === 'l' ? 1.4 : 1.7} fill={c.a} />
      <circle cx="20.3" cy="30.8" r={d === 'l' ? 1.15 : 1.5} fill={c.s} />
      <circle cx="27.7" cy="30.8" r={d === 'l' ? 1.15 : 1.5} fill={c.s} />
      {d === 'l' && <><circle cx="16.4" cy="26.8" r="1.4" fill={c.s} opacity=".5" /><circle cx="31.6" cy="26.8" r="1.4" fill={c.s} opacity=".5" /></>}
    </>
  );
}

/* ───────── 무등 호랑이즈 — 홈플레이트 오각형(끝이 아래) + 세모 귀 + 이마 '王' 무늬 · 볼 줄무늬 ───────── */
function MDH({ c, d }: { c: Ink; d: Detail }) {
  const plate = 'M5.6 7.6H42.4V27.4L24 45 5.6 27.4Z';
  return (
    <>
      {/* 귀 */}
      <path d="M6.4 10.6 8.6 1.6 16.6 7.6ZM41.6 10.6 39.4 1.6 31.4 7.6Z" fill={c.p} stroke={EDGE} strokeWidth={ew(d)} strokeLinejoin="round" />
      <path d={plate} fill={c.p} stroke={EDGE} strokeWidth={ew(d)} strokeLinejoin="round" />
      {d === 'l' && <path d="M9 4.6 10.1 8.2 13.2 7.4ZM39 4.6 37.9 8.2 34.8 7.4Z" fill={c.s} />}
      {d === 'l' && <path d="M8.2 10.2H39.8V26.3L24 41.4 8.2 26.3Z" fill="none" stroke={c.a} strokeWidth="1.1" strokeLinejoin="round" />}
      {/* 이마 무늬 — 굵기가 다른 가로줄 셋 + 가운데 세로줄 */}
      <path
        d={d === 'l'
          ? 'M14.8 12.4H33.2L31.8 15.4H16.2ZM17.2 18.4H30.8L29.8 20.8H18.2ZM19.4 23.8H28.6L27.9 25.6H20.1ZM22.7 11.6H25.3V27.2L24 29 22.7 27.2Z'
          : 'M13.8 11.8H34.2L32.4 16H15.6ZM17.4 20H30.6L29.2 23.4H18.8ZM22.2 11.6H25.8V26.4L24 28.6 22.2 26.4Z'}
        fill={c.s}
      />
      {/* 볼 줄무늬 */}
      <path
        d={d === 'l'
          ? 'M6.2 15.2 13.4 18 6.2 20.8ZM41.8 15.2 34.6 18 41.8 20.8ZM6.4 23.2 12.2 25.2 8.8 27.8ZM41.6 23.2 35.8 25.2 39.2 27.8Z'
          : 'M6 15 14.6 18.4 6 21.8ZM42 15 33.4 18.4 42 21.8Z'}
        fill={c.s}
      />
      {/* 눈 — 크림 아몬드 · 코 */}
      <path d={d === 'l' ? 'M14.6 29.4C17 28.6 20 29.2 21.4 31.2 19.2 32.4 16.4 31.8 14.6 29.4ZM33.4 29.4C31 28.6 28 29.2 26.6 31.2 28.8 32.4 31.6 31.8 33.4 29.4Z' : 'M13.6 28.8C16.6 27.8 20.2 28.6 21.8 31.2 19 32.8 15.8 32 13.6 28.8ZM34.4 28.8C31.4 27.8 27.8 28.6 26.2 31.2 29 32.8 32.2 32 34.4 28.8Z'} fill={c.a} />
      <path d={d === 'l' ? 'M21.6 34.4H26.4L24 37.4Z' : 'M21 34H27L24 37.8Z'} fill={c.s} />
    </>
  );
}

/* ───────── 한밭 독수리스 — 내야 다이아몬드 위로 날개를 활짝 편 독수리 (날개 끝 깃털 톱니) ───────── */
function HBE({ c, d }: { c: Ink; d: Detail }) {
  const wings = d === 'l'
    ? 'M21.4 23.4C16.6 21.6 10.6 18.8 2.6 11.4L4.2 18.6 1.6 18.8 5.6 24.2 3.2 25 8.8 28.8 7.2 30 13.6 31.2C16.6 29.8 19.4 28.2 21.8 26.6ZM26.6 23.4C31.4 21.6 37.4 18.8 45.4 11.4L43.8 18.6 46.4 18.8 42.4 24.2 44.8 25 39.2 28.8 40.8 30 34.4 31.2C31.4 29.8 28.6 28.2 26.2 26.6Z'
    : 'M21.4 22.8C16.4 21 10.4 18 2.4 10.6L4.4 20.2 1.8 20.6 7.6 27.6 6 28.8 14 31.4C17 30 19.6 28.4 22 26.8ZM26.6 22.8C31.6 21 37.6 18 45.6 10.6L43.6 20.2 46.2 20.6 40.4 27.6 42 28.8 34 31.4C31 30 28.4 28.4 26 26.8Z';
  return (
    <>
      {/* 다이아몬드 */}
      <path d="M24 20.4 37.4 33.8 24 47.2 10.6 33.8Z" fill={c.s} stroke={EDGE} strokeWidth={ew(d, true)} strokeLinejoin="round" />
      {d === 'l' && <path d="M24 24.4 33.4 33.8 24 43.2 14.6 33.8Z" fill="none" stroke={c.a} strokeWidth="1" strokeLinejoin="round" />}
      {d === 'l' && <path d="M22.6 41.8H25.4L24 43.2Z" fill={c.a} />}
      {/* 날개 */}
      <path d={wings} fill={c.p} stroke={EDGE} strokeWidth={ew(d)} strokeLinejoin="round" />
      {d === 'l' && <path d="M9.4 17.6 15.8 24.4M15.2 21 19.6 26.4M38.6 17.6 32.2 24.4M32.8 21 28.4 26.4" stroke={c.s} strokeWidth=".9" strokeLinecap="round" opacity=".55" />}
      {/* 몸통 + 크림 머리(오른쪽을 봄, 각진 윤곽) + 갈고리 부리 */}
      <path d="M21.2 21.6H26.8L25.6 31.6H22.4Z" fill={c.p} />
      <path d="M19.4 14.2 23.6 10.4 29.6 10.6 33 13.4 30.6 15.6 29 19.6 23.8 21.4 19.6 19Z" fill={c.a} stroke={EDGE} strokeWidth={ew(d)} strokeLinejoin="round" />
      <path d={d === 'l' ? 'M30 12.2C32.8 12.2 35.4 13.2 36.2 14.8 36.6 15.8 35.8 17 34.6 17.6L34.8 15.9 30.8 16.6Z' : 'M29.6 11.8C32.8 11.8 35.8 13 36.6 15 37 16.2 36 17.6 34.6 18.2L34.8 16.4 30.2 17.2Z'} fill={c.p} stroke={EDGE} strokeWidth={ew(d) * 0.8} strokeLinejoin="round" />
      <path d={d === 'l' ? 'M25.6 14 27.2 12.6 28.8 14 27.2 15.4Z' : 'M25.2 14 27.2 12.2 29.2 14 27.2 15.8Z'} fill={c.s} />
      {d === 'l' && <path d="M24.4 12.4 29.6 12.6" stroke={c.s} strokeWidth=".8" strokeLinecap="round" />}
    </>
  );
}

/* ───────── 서울 청룡스 — 펠트 페넌트(오른쪽으로 뾰족) + 크림 깃대 띠 + S자 용 + 빨강 여의주(야구공) ───────── */
function SCR({ c, d }: { c: Ink; d: Detail }) {
  const flag = 'M4.4 7.4 44.6 24 4.4 40.6Z';
  return (
    <>
      <path d={flag} fill={c.p} stroke={EDGE} strokeWidth={ew(d, true)} strokeLinejoin="round" />
      <path d="M4.4 7.4H9.6V38.4L4.4 40.6Z" fill={c.s} />
      {d === 'l' && <path d="M11.4 11.6 38.6 23.9 11.4 36.4" {...stitch(c.s, 0.8)} />}
      {d === 'l' && <path d="M7 11V36.6" stroke={c.p} strokeWidth=".8" strokeDasharray="1.4 1.6" />}
      {/* 용 몸통 — S자 */}
      <path
        d="M13.8 33.4C11.4 30.2 12.8 26.4 16.6 26.4 20.4 26.4 23.4 24.6 22.6 21.2 22 18.6 23.6 16.2 26.6 16.4"
        fill="none" stroke={c.s} strokeWidth={d === 'l' ? 3.6 : 4.8} strokeLinecap="round"
      />
      {/* 등 비늘 */}
      {d === 'l' && <path d="M12.2 29.4 10.2 28.2 12.6 27.4ZM17.4 24.6 17 22.6 19.2 23.6ZM21.6 19.4 20.4 17.8 22.6 17.8Z" fill={c.s} />}
      {/* 머리 — 뿔 둘 · 벌린 입(여의주 쪽) · 수염 */}
      {d === 'l' ? (
        <>
          <path d="M25.4 14.6 22.2 10.2 26.8 13.2ZM27.6 13.8 26.2 8.8 29.4 13.2Z" fill={c.s} />
          <path d="M24.8 14.6 30.6 13.2 34.6 15.2 29.6 16.4ZM25.4 17.4H29.8L33.4 19.8 27.2 20.2Z" fill={c.s} />
          <path d="M24.4 14.4 25.6 20.2 23.6 19.4Z" fill={c.s} />
          <circle cx="28" cy="14.8" r=".75" fill={c.p} />
          <path d="M30.8 16.8C33.4 17.4 35.8 16.6 37.2 14.8" fill="none" stroke={c.s} strokeWidth=".8" strokeLinecap="round" />
        </>
      ) : (
        <path d="M23.8 14.4 22.4 9.4 26.4 12.8 33.4 14.4 30 17 33.4 19.8 25 20.2Z" fill={c.s} />
      )}
      {/* 여의주 = 야구공 */}
      <circle cx="31.4" cy="25.6" r={d === 'l' ? 3.6 : 4.2} fill={c.a} />
      {d === 'l' && <path d="M29.4 23.2C30.4 24.6 30.4 26.6 29.4 28M33.4 23.2C32.4 24.6 32.4 26.6 33.4 28" fill="none" stroke={c.s} strokeWidth=".7" strokeLinecap="round" />}
    </>
  );
}

/* ───────── 인천 슈퍼별즈 — 꼬리 달린 큰 별(혜성): 노랑 별 + 빨강·파랑 속도선 석 줄 ───────── */
function ISB({ c, d }: { c: Ink; d: Detail }) {
  const star = starPath(29.4, 19.4, d === 'l' ? 16.4 : 17.2, 0.46);
  const tail = d === 'l'
    ? [['M18.2 27.4 4.2 41.4', c.s, 3.6], ['M22.8 31.8 11.2 43.4', c.p, 3.6], ['M14.6 22.4 3 34', c.p, 3]] as const
    : [['M18 27.6 3.6 42', c.s, 4.6], ['M23 32.4 11.6 43.8', c.p, 4.6]] as const;
  return (
    <>
      {tail.map(([p, col, w]) => <path key={p} d={p} stroke={EDGE} strokeWidth={w + 1.4} strokeLinecap="round" />)}
      {tail.map(([p, col, w]) => <path key={'c' + p} d={p} stroke={col} strokeWidth={w} strokeLinecap="round" />)}
      <g transform="rotate(-10 29.4 19.4)">
        <path d={star} fill={c.a} stroke={EDGE} strokeWidth={ew(d)} strokeLinejoin="round" />
        {d === 'l' && <path d={starPath(29.4, 19.4, 10.6, 0.46)} fill="none" stroke={c.s} strokeWidth="1" strokeLinejoin="round" />}
      </g>
      {d === 'l' && <><circle cx="6.6" cy="27.4" r="1" fill={c.a} /><circle cx="15.4" cy="44.4" r=".9" fill={c.a} /></>}
    </>
  );
}

/* ───────── 인천 조랑말스 — 말발굽(U) + 초록 원판 + 얼룩무늬 조랑말 옆얼굴(톱니 갈기) ───────── */
function IJR({ c, d }: { c: Ink; d: Detail }) {
  const shoe = 'M5.6 6.6C5.6 30.6 12.4 45 24 45S42.4 30.6 42.4 6.6H34.8C34.8 25.4 30.8 37.6 24 37.6S13.2 25.4 13.2 6.6Z';
  const head = 'M29.4 10.2C25.2 9.6 21.4 12 19.6 16L16.8 22.8C16.2 24.6 17.2 26 19 25.8L22 25.4C23 27.8 24.6 29.6 26.8 30.4L29.8 25.6C30.8 21 31.2 14.4 29.4 10.2Z';
  return (
    <>
      <path d={shoe} fill={c.a} stroke={EDGE} strokeWidth={ew(d, true)} strokeLinejoin="round" />
      {d === 'l' && (
        <g fill={c.s}>
          {[[8.4, 12], [9, 19.8], [10.8, 27.4], [39.6, 12], [39, 19.8], [37.2, 27.4]].map(([x, y]) => <rect key={`${x}-${y}`} x={x - 0.9} y={y - 1.5} width="1.8" height="3" rx=".4" />)}
        </g>
      )}
      <circle cx="24" cy="19.8" r={d === 'l' ? 11.4 : 12} fill={c.p} stroke={EDGE} strokeWidth={ew(d)} />
      {/* 갈기 — 톱니 */}
      <path d={d === 'l' ? 'M29.4 10.2 32 11.4 30.6 13 33 14.6 31 16 33 18 30.6 19 31.6 21.6 30 22.6Z' : 'M29.4 10 33 12 31 14.8 33.4 18 30.2 20.4Z'} fill={c.a} />
      <path d={head} fill={c.s} />
      {/* 얼룩 */}
      {d === 'l' && <path d="M24.6 13.4C26.6 13 28 14.4 27.6 16.2 27 18 24.8 18.2 23.8 16.8 23 15.6 23.4 13.8 24.6 13.4ZM21.8 21.6C23 21.2 24 22.2 23.6 23.2 23.2 24.2 21.8 24.2 21.4 23.2Z" fill={c.a} opacity=".85" />}
      <path d="M27.6 9.8 29.6 6.2 30.6 10.8Z" fill={c.s} />
      <circle cx="23.2" cy="17.6" r={d === 'l' ? .9 : 1.2} fill={c.p} />
      {d === 'l' && <circle cx="18.8" cy="23.4" r=".6" fill={c.p} />}
    </>
  );
}

/* ───────── 인천 돌고래스 — 반원 파도 위로 활처럼 뛰어오른 돌고래 + 주둥이 끝 야구공 ───────── */
function IDR({ c, d }: { c: Ink; d: Detail }) {
  const body = 'M6.8 30.6C8.4 17.4 17.8 8.8 29.2 9.4 34.6 9.8 38.8 12.6 41.4 16.8L37.4 16.6C35.4 14.6 32.4 13.6 29.2 13.8 20.6 14.4 13.4 21.2 11.8 30.6Z';
  return (
    <>
      {/* 파도 받침 — 반 타원 */}
      <path d="M3.6 31.4H44.4C44.4 39.4 35.6 45.6 24 45.6S3.6 39.4 3.6 31.4Z" fill={c.p} stroke={EDGE} strokeWidth={ew(d, true)} strokeLinejoin="round" />
      <path d={d === 'l' ? 'M7.4 35.6c2.8-1.8 5.6-1.8 8.4 0s5.6 1.8 8.4 0 5.6-1.8 8.4 0 5.6 1.8 8.4 0M11.8 40.6c2.4-1.6 4.8-1.6 7.2 0s4.8 1.6 7.2 0 4.8-1.6 7.2 0' : 'M7 36.4c3.4-2.2 6.8-2.2 10.2 0s6.8 2.2 10.2 0 6.8-2.2 10.2 0'} fill="none" stroke={c.s} strokeWidth={d === 'l' ? 1.5 : 2.4} strokeLinecap="round" />
      {/* 돌고래 — 크림 테 위에 청록 몸 */}
      <path d={body} fill={c.s} stroke={c.s} strokeWidth={d === 'l' ? 3 : 3.6} strokeLinejoin="round" />
      <path d={body} fill={c.p} stroke={EDGE} strokeWidth={ew(d)} strokeLinejoin="round" />
      {/* 등지느러미 · 꼬리 */}
      <path d="M19.2 13.6 18.4 7.6 23.6 11.4Z" fill={c.p} stroke={EDGE} strokeWidth={ew(d)} strokeLinejoin="round" />
      <path d="M8.6 28.6 3.4 26.6 6.4 31.4 9.6 34.4Z" fill={c.p} stroke={EDGE} strokeWidth={ew(d)} strokeLinejoin="round" />
      {d === 'l' && <circle cx="34.4" cy="12.8" r=".9" fill={c.s} />}
      {/* 공 */}
      <circle cx="42.2" cy="11.8" r={d === 'l' ? 3.6 : 4.2} fill={c.a} stroke={EDGE} strokeWidth={ew(d)} />
      {d === 'l' && <path d="M40.4 9.8C41.2 11 41.2 12.6 40.4 13.8M44 9.8C43.2 11 43.2 12.6 44 13.8" fill="none" stroke={c.s} strokeWidth=".7" strokeLinecap="round" />}
    </>
  );
}

/* ───────── 수원 일각수스 — 내야 다이아몬드 배지를 가로지르는 금빛 꼬인 뿔 + 반짝임 ───────── */
function SUC({ c, d }: { c: Ink; d: Detail }) {
  // 뿔: 아래 왼쪽(두꺼운 밑동) → 위 오른쪽 끝
  const horn = 'M14.6 41.2 34.4 2.2 20.8 43.6Z';
  return (
    <>
      <path d="M24 9.6 41.6 27.2 24 44.8 6.4 27.2Z" fill={c.p} stroke={EDGE} strokeWidth={ew(d, true)} strokeLinejoin="round" />
      {d === 'l' && <path d="M24 13.6 37.6 27.2 24 40.8 10.4 27.2Z" fill="none" stroke={c.s} strokeWidth="1" strokeLinejoin="round" />}
      <path d={horn} fill={c.a} stroke={EDGE} strokeWidth={ew(d)} strokeLinejoin="round" />
      {/* 꼬임 홈 */}
      <path
        d={d === 'l'
          ? 'M16.4 36.6 21.6 39.4M18.6 31.6 23.4 34.2M20.8 26.6 25 29M23 21.6 26.6 23.8M25.2 16.6 28.2 18.4M27.4 11.8 29.8 13.2'
          : 'M17.4 34.6 22.6 37.4M20.6 27.6 25.2 30M23.8 20.6 27.4 22.6'}
        stroke={c.p} strokeWidth={d === 'l' ? 1.1 : 1.6} strokeLinecap="round"
      />
      {/* 반짝임 — 네 꼭짓점 별 */}
      <path d={d === 'l' ? 'M33 30.2 34 33.2 37 34.2 34 35.2 33 38.2 32 35.2 29 34.2 32 33.2ZM12.6 21.6 13.3 23.5 15.2 24.2 13.3 24.9 12.6 26.8 11.9 24.9 10 24.2 11.9 23.5Z' : 'M32.6 29.6 33.8 33 37.2 34.2 33.8 35.4 32.6 38.8 31.4 35.4 28 34.2 31.4 33Z'} fill={c.s} />
    </>
  );
}

/* ───────── 전주 돌격대스 — 가로로 긴 둥근 펠트 패치 + 앞으로 내닫는 스파이크(징 박은 야구화) + 빨강 속도선 ───────── */
function JDR({ c, d }: { c: Ink; d: Detail }) {
  const shoe = 'M14.6 18C14.6 15.8 16 14.6 18 14.6H24C25.4 14.6 26.6 15.4 27.2 16.6L28.6 19.4C33 20 37.4 21.2 40.2 23.4 42 24.8 42 27.6 40 28.6H15.8C15 28.6 14.6 28 14.6 27.2Z';
  return (
    <>
      <rect x="2.8" y="9.4" width="42.4" height="29.2" rx="7.4" fill={c.s} stroke={EDGE} strokeWidth={ew(d, true)} />
      {d === 'l' && <rect x="5.2" y="11.8" width="37.6" height="24.4" rx="5.4" {...stitch(c.p, 0.8)} />}
      {/* 속도선 */}
      <path d={d === 'l' ? 'M7.8 17.4H12.2M6.8 22.6H12.2M7.8 27.8H12.2' : 'M6.6 18.4H12.4M6.6 27.4H12.4'} stroke={c.a} strokeWidth={d === 'l' ? 2.2 : 3} strokeLinecap="round" />
      {/* 야구화 + 징 */}
      <path d={shoe} fill={c.p} />
      <path d={d === 'l' ? 'M15.6 29.6H40.2V31H15.6ZM17.4 31 18.6 34 19.8 31ZM22.6 31 23.8 34 25 31ZM32 31 33.2 34 34.4 31ZM36.8 31 38 34 39.2 31Z' : 'M15.2 29.6H40.6V31.6H15.2ZM17.6 31.6 19.2 35 20.8 31.6ZM34 31.6 35.6 35 37.2 31.6Z'} fill={c.p} />
      {d === 'l' && <path d="M24.8 18.6 26.4 21.8M27.4 19.8 28.8 22.4M30.2 20.6 31.2 23" stroke={c.s} strokeWidth="1" strokeLinecap="round" />}
    </>
  );
}

/* ───────── 인천 비룡스 — 야구공 몸통 + 박쥐 같은 비룡 날개 하나 + 말린 꼬리 ───────── */
function IBY({ c, d }: { c: Ink; d: Detail }) {
  const wing = d === 'l'
    ? 'M22.6 21.4 7.4 3.4 8.8 11.6 2.8 11.4 6.4 18.8 1.6 20.6 9 24.6 5 28.6 16.6 29.4Z'
    : 'M22.6 21.4 6.6 2.6 8.4 12.2 2 12.6 6.8 21.2 2.6 24.6 16.4 29.6Z';
  return (
    <>
      <path d={wing} fill={c.p} stroke={EDGE} strokeWidth={ew(d)} strokeLinejoin="round" />
      {d === 'l' && <path d="M21.4 21.8 8.6 6.4M20.4 23 4.6 13.4M19.6 24.8 4.4 20.6M18.8 26.8 7.4 27" stroke={c.a} strokeWidth=".9" strokeLinecap="round" />}
      {/* 꼬리 */}
      <path d="M36.2 36.6C41.8 39.8 46 34.4 42.6 31 40.6 29.2 38 30.6 38.8 32.8" fill="none" stroke={EDGE} strokeWidth={d === 'l' ? 4.2 : 5.4} strokeLinecap="round" />
      <path d="M36.2 36.6C41.8 39.8 46 34.4 42.6 31 40.6 29.2 38 30.6 38.8 32.8" fill="none" stroke={c.p} strokeWidth={d === 'l' ? 2.8 : 3.8} strokeLinecap="round" />
      <path d="M37.4 34.4 40.6 33.8 38.8 31.2Z" fill={c.p} />
      {/* 머리 — 공 오른쪽 위로 내민 뿔 난 머리 (L) */}
      {d === 'l' && (
        <>
          <path d="M33.2 21.4 37.2 15.8 43.8 16.2 41 18.6 44.4 20.8 37.6 22.8Z" fill={c.p} stroke={EDGE} strokeWidth={ew(d)} strokeLinejoin="round" />
          <path d="M36.8 16.4 37.4 11.2 39.6 16.4Z" fill={c.a} />
          <circle cx="39.6" cy="18" r=".8" fill={c.s} />
        </>
      )}
      {/* 공 — 빨강 테로 밝은 바탕에서도 보이게 */}
      <circle cx="28.4" cy="28.2" r={d === 'l' ? 11.6 : 12.4} fill={c.s} stroke={EDGE} strokeWidth={ew(d)} />
      <circle cx="28.4" cy="28.2" r={d === 'l' ? 10.9 : 11.4} fill="none" stroke={c.p} strokeWidth={d === 'l' ? 1.2 : 1.8} />
      <path
        d={d === 'l' ? 'M21.6 19.4C24.6 23 24.6 33.4 21.6 37M35.2 19.4C32.2 23 32.2 33.4 35.2 37' : 'M21 19C24.4 23 24.4 33.4 21 37.4M35.8 19C32.4 23 32.4 33.4 35.8 37.4'}
        fill="none" stroke={c.p} strokeWidth={d === 'l' ? 1.4 : 2.2} strokeLinecap="round"
      />
      {d === 'l' && <path d="M22.3 22.4l1.6.4M23 26l1.5.1M23 30.4l1.5-.1M22.3 34l1.6-.4M34.5 22.4l-1.6.4M33.8 26l-1.5.1M33.8 30.4l-1.5-.1M34.5 34l-1.6-.4" stroke={c.a} strokeWidth=".9" strokeLinecap="round" />}
    </>
  );
}

export const MARKS: Record<ClubCode, (p: { c: Ink; d: Detail; uid: string }) => ReactElement> = {
  DJ, GJ, DG, BS, SB, ST, SH, IC, CW, SW,
  DDG, MDH, HBE, SCR, ISB, IJR, IDR, SUC, JDR, IBY,
};
