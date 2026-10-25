// 명장면 컷 — 장타 · 적시타 · 결정적 삼진 순간, 2D 경기장 위로 3초 남짓. 사용자 지시 10-25 (마구마구 임팩트 컷처럼)
//  타자 뒤 높은 곳에서 본 중계 구도: 원근 경기장(관중석 · 전광판 · 잔디 결) · 마운드 투수(와인드업 → 테이크백 → 마무리) · 크게 보이는 타자 뒷모습(SD)
//  → 공이 투수 손에서 존까지(구종 색 궤적 · 변화) → 맞는 순간 큰 노란 섬광(빛살 · 충격파 · 불꽃) · 흰 화면 한 장 · 멈칫 · 흔들림
//  → 타구가 원근 궤적을 따라 날아감(홈런은 관중석으로) · 왼쪽 위 투구 정보 · 오른쪽 아래 타격 결과(타구 속도 · 발사각 · 비거리).
//  삼진은 공이 존에 꽂히는 순간 푸른 섬광. 누르면 건너뛰기, 움직임 줄이기면 멈춘 한 장면.
//  시간은 모두 CSS 애니메이션 + Web Animations — document.getAnimations() 로 멈추고 넘겨 볼 수 있다.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type AnimationEvent, type CSSProperties } from 'react';
import { kitOf } from '../../art/sd';
import { playerById, teamById } from '../../game/mock';
import { GAME, type FullPlay } from './local-mock';
import { PLAYS, STATES } from './timeline';
import { mySide } from './Stage';
import { H, W, fenceAt, proj } from './cut/stadium';
import { backBox, batterUrls, pitcherUrls, preload, stadiumUrl } from './cut/sprites';
import s from './BroadcastCut.module.css';

/** 컷으로 보여 줄 만한 플레이인가 — 홈런 · 장타 · 적시타 · 득점권 2아웃 삼진 · 150km/h 삼진 · 강조 장면 */
export function cutWorthy(p: FullPlay): boolean {
  if (!p.isPA || p.fake) return false;
  if (p.code === 'HR' || p.code === '2B' || p.code === '3B') return true;
  if (p.code === '1B' && p.rbi > 0) return true;
  if (p.code === 'K') {
    const risp = !!(p.basesBefore[1] || p.basesBefore[2]);
    return (p.outsBefore === 2 && risp) || (p.lastPitch?.kmh ?? 0) >= 150;
  }
  return !!p.highlight && ['1B', '2B', '3B', 'HR', 'K', 'SF'].includes(p.code);
}

type Pt = [number, number];
type Kind = 'hr' | 'xbh' | 'hit' | 'sf' | 'k';
/** 시간표(ms) — BroadcastCut.module.css 와 같은 값: 공 놓음 · 임팩트 · 멈칫 */
const REL = 380, HIT = 720, STOP = 110;
const FLY: Record<Kind, number> = { hr: 1500, xbh: 1050, hit: 850, sf: 1200, k: 0 };
const END: Record<Kind, number> = { hr: 3800, xbh: 3300, hit: 3100, sf: 3200, k: 2700 };
/** 타자 그림 배율 · 몸 중심 x · 발 y (컷 좌표 400 × 378) */
const BK = 0.9, BODY_X = 74, FEET_Y = 398;

const kindOf = (p: FullPlay): Kind => (p.code === 'HR' ? 'hr' : p.code === '2B' || p.code === '3B' ? 'xbh' : p.code === 'SF' ? 'sf' : p.code === 'K' ? 'k' : 'hit');
const rad = (d: number) => (d * Math.PI) / 180;
const pc = (v: number, of: number) => `${((v / of) * 100).toFixed(3)}%`;

const PITCH_COL: Record<string, string> = { FF: '#ffffff', SI: '#ffe7a6', FC: '#cfe8ff', SL: '#6fe0ff', SW: '#57cfff', CU: '#c6a0ff', CH: '#8ff0b0', FS: '#ffae6b', KN: '#e6e6e6', SIG: '#ffd34d' };
/** 구종 변화 — 처음 겨누는 곳(존에서 bx, by 떨어진 곳)과 꺾이는 늦기. armSide: 투수 팔 쪽(화면 x 방향) */
function breakOf(type: string, armSide: number): [number, number, number] {
  const glove = -armSide;
  switch (type) {
    case 'FF': return [0, 8, 2];
    case 'SI': return [-armSide * 11, -9, 2.2];
    case 'FC': return [-glove * 9, -3, 2.6];
    case 'SL': return [-glove * 16, -9, 2.6];
    case 'SW': return [-glove * 25, -4, 2.2];
    case 'CU': return [-glove * 5, -28, 1.8];
    case 'CH': return [-armSide * 8, -16, 2.4];
    case 'FS': return [0, -20, 3.2];
    case 'KN': return [6, -8, 2];
    default: return [-glove * 13, -10, 2.6];
  }
}
function pitchAt(S: Pt, E: Pt, B: [number, number, number], u: number): Pt {
  const g = Math.pow(u, 1.25), k = Math.pow(g, B[2]);
  return [S[0] + (E[0] + B[0] - S[0]) * g - B[0] * k, S[1] + (E[1] + B[1] - S[1]) * g - B[1] * k];
}

function titleOf(p: FullPlay): [string, string] {
  const r = p.rbi > 0 ? `${p.rbi}타점` : '';
  switch (p.code) {
    case 'HR': return [p.rbi >= 4 ? '만루 홈런' : p.rbi <= 1 ? '솔로 홈런' : `${p.rbi}점 홈런`, ''];
    case '3B': return ['3루타', r];
    case '2B': return ['2루타', r];
    case '1B': return [p.rbi ? '적시타' : '안타', r];
    case 'SF': return ['희생플라이', r];
    case 'K': return ['삼진', p.seq[p.seq.length - 1]?.res === 'called' ? '루킹' : '헛스윙'];
    default: return ['', ''];
  }
}

/** 타구 궤적 — 맞은 곳(가까운 그림 좌표 C)에서 시작해 원근 경기장 위 낙구점까지 [X, Y, 공 지름 px] */
function flightOf(p: FullPlay, C: Pt, lefty: boolean, n = 30): [number, number, number][] {
  const h = p.hit;
  const kind = h?.kind ?? 'line';
  const d = Math.max(20, h?.distM ?? 70), phi = Math.max(-44, Math.min(44, h?.angle ?? 0));
  const la = h?.la ?? (p.code === 'HR' ? 28 : p.code === 'SF' || kind === 'fly' ? 33 : kind === 'pop' ? 55 : kind === 'line' ? 15 : 5);
  const x0 = lefty ? -0.4 : 0.4, y0 = 0.9, z0 = 0.95;
  const xl = d * Math.sin(rad(phi)), yl = d * Math.cos(rad(phi));
  let zl = 0;
  if (p.code === 'HR') zl = Math.min(13, 3.3 + Math.max(0, d - fenceAt(phi) - 1.6) * 0.34);
  else if (p.code === 'SF' || kind === 'fly' || kind === 'pop') zl = 1.7;
  const span = Math.hypot(xl - x0, yl - y0);
  const rise = span * Math.tan(rad(Math.max(-4, Math.min(70, la))));
  const zAt = (v: number) => (kind === 'ground' && p.code !== 'HR'
    ? z0 * (1 - v) * (1 - v) + 0.5 * Math.abs(Math.sin(v * Math.PI * 2.6)) * (1 - v)
    : z0 + rise * v - (rise - (zl - z0)) * v * v);
  const P0 = proj(x0, y0, z0);
  const out: [number, number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, v = 1 - Math.pow(1 - t, 1.35);
    const q = proj(x0 + (xl - x0) * v, y0 + (yl - y0) * v, Math.max(0, zAt(v)));
    const w = Math.pow(1 - t, 2.4);
    out.push([q[0] + (C[0] - P0[0]) * w, q[1] + (C[1] - P0[1]) * w, 9 * w + Math.max(2.4, q[2] * 0.074 * 3) * (1 - w)]);
  }
  return out;
}

const pathOf = (list: Pt[] | [number, number, number][]) => list.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ');
const lenOf = (list: Pt[] | [number, number, number][]) => { const c = [0]; for (let i = 1; i < list.length; i++) c.push(c[i - 1] + Math.hypot(list[i][0] - list[i - 1][0], list[i][1] - list[i - 1][1])); return c; };

/* 빛살 — 맞은 곳을 가운데로 길고 짧은 뾰족한 삼각형 */
function raysOf(n: number, len: [number, number], wid: [number, number], seed: number) {
  let a = seed;
  const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  let d = '';
  for (let i = 0; i < n; i++) {
    const th = rad((i / n) * 360 + rnd() * (300 / n)), L = len[0] + (i % 2 ? 0.35 : 1) * (len[1] - len[0]) * (0.55 + rnd() * 0.45), w = wid[0] + rnd() * (wid[1] - wid[0]);
    const ux = Math.cos(th), uy = Math.sin(th);
    d += `M${(-uy * w).toFixed(1)},${(ux * w).toFixed(1)} L${(ux * L).toFixed(1)},${(uy * L).toFixed(1)} L${(uy * w).toFixed(1)},${(-ux * w).toFixed(1)} Z `;
  }
  return d;
}

export function BroadcastCut({ play, onDone }: { play: FullPlay; onDone: () => void }) {
  const [out, setOut] = useState(false);
  const [ready, setReady] = useState(false);
  const done = useRef(onDone);
  done.current = onDone;
  const fired = useRef(false);
  const finish = () => { if (!fired.current) { fired.current = true; done.current(); } };
  const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const v = useMemo(() => {
    const i = Math.max(0, PLAYS.indexOf(play));
    const kind = kindOf(play);
    const hit = kind !== 'k';
    const away = teamById(GAME.match.awayId), home = teamById(GAME.match.homeId);
    const batTeam = play.half === 'top' ? away : home, fldTeam = play.half === 'top' ? home : away;
    const batSet: 'home' | 'away' = play.half === 'top' ? 'away' : 'home', fldSet: 'home' | 'away' = play.half === 'top' ? 'home' : 'away';
    const batter = playerById(play.batterId), pitcher = playerById(play.pitcherId);
    const last = play.seq[play.seq.length - 1];
    const pThrows = pitcher?.throws ?? 'R';
    const lefty = batter ? (batter.bats === 'S' ? pThrows === 'R' : batter.bats === 'L') : false;
    const side = mySide();
    const batMine = side != null && batSet === side, pitMine = side != null && fldSet === side;
    const wx = GAME.wx[play.wx] ?? GAME.wx[0];
    const night = !!wx && (wx.sky.startsWith('night') || wx.skyKo === '돔');
    const dome = wx?.skyKo === '돔';
    const score = (STATES.before[i]?.score ?? [0, 0]) as [number, number];
    const fk = pitcher ? kitOf(pitcher, fldTeam, fldSet) : { uni: '#F5F5F2', pants: '#F1F1EE', cap: fldTeam.colors.primary };
    const bg = stadiumUrl({
      night, dome, score, seed: [...home.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0,
      home: { primary: home.colors.primary, secondary: home.colors.secondary, short: home.short },
      away: { primary: away.colors.primary, short: away.short },
      fld: { uni: fk.uni, pants: fk.pants, cap: fk.cap },
    });

    // 타자 자리 · 방망이 맞는 곳(C) — 높은 공이면 방망이도 높게
    const box = backBox(lefty);
    const bodyX = lefty ? W - BODY_X : BODY_X;
    const left = bodyX - (120 - box.x) * BK, top = FEET_Y - 268 * BK;
    const toCut = (q: Pt): Pt => [left + (q[0] - box.x) * BK, top + (q[1] - box.y) * BK];
    const base = batter ? batterUrls(batter, batTeam, batSet, lefty, 0).pts.sweet : ([253, 174] as Pt);
    const Cb = toCut(base);
    const zone = { x: Cb[0] - 30, y: Cb[1] - 42, w: 60, h: 78 };
    const lz = last?.zone ?? [0.5, 0.5];
    const Z: Pt = [zone.x + (lz[0] - 0.3) * (zone.w / 0.4), zone.y + (lz[1] - 0.25) * (zone.h / 0.5)];
    const swingY = hit ? Math.max(-24, Math.min(24, (Z[1] - Cb[1]) / (0.89 * BK))) : 0;
    const bat = batter ? batterUrls(batter, batTeam, batSet, lefty, swingY) : null;
    const C: Pt = hit && bat ? toCut(bat.pts.sweet) : Z;
    const imgBox = { left: pc(left, W), top: pc(top, H), width: pc(box.w * BK, W), height: pc(box.h * BK, H) };

    // 투수 — 마운드 위, 원근보다 조금 크게
    const pit = pitcher ? pitcherUrls(pitcher, fldTeam, fldSet) : null;
    const mound = proj(0, 18.44, 0.25);
    const PH = 60, PW = (PH * 240) / 280;
    const pBox = { left: pc(mound[0] - PW / 2, W), top: pc(mound[1] - (266 / 280) * PH, H), width: pc(PW, W), height: pc(PH, H) };
    const armSide = pThrows === 'L' ? 1 : -1;
    const R0: Pt = [mound[0] + armSide * PW * 0.16, mound[1] - PH * 0.66];

    // 공 — 던진 공(구종 변화) · 타구(원근)
    const ptype = last?.type ?? 'FF';
    const pcol = last?.sig ?? PITCH_COL[ptype] ?? '#ffffff';
    const B = breakOf(last?.sig ? 'SL' : ptype, armSide);
    const pitchPts: Pt[] = Array.from({ length: 19 }, (_, k) => pitchAt(R0, C, B, k / 18));
    const flight = hit ? flightOf(play, C, lefty) : [];

    // 스윙 잔상 — 맞는 순간 손을 축으로 방망이 끝이 휩쓴 부채꼴
    let smear = '';
    if (bat && (hit || last?.res === 'swing')) {
      const Hh = toCut(bat.pts.hands), T2 = toCut(bat.pts.tip);
      const r = Math.hypot(T2[0] - Hh[0], T2[1] - Hh[1]) * 1.04;
      const a2 = Math.atan2(T2[1] - Hh[1], T2[0] - Hh[0]), a1 = a2 + (lefty ? 1 : -1) * rad(78);
      const P = (a: number, rr: number) => `${(Hh[0] + Math.cos(a) * rr).toFixed(1)},${(Hh[1] + Math.sin(a) * rr).toFixed(1)}`;
      const sw = lefty ? 0 : 1;
      smear = `M${P(a1, r * 0.42)} L${P(a1, r)} A${r.toFixed(1)} ${r.toFixed(1)} 0 0 ${sw} ${P(a2, r)} L${P(a2, r * 0.42)} A${(r * 0.42).toFixed(1)} ${(r * 0.42).toFixed(1)} 0 0 ${1 - sw} ${P(a1, r * 0.42)} Z`;
    }

    const [title, chip] = titleOf(play);
    const hitInfo = play.hit;
    // 2D 무대 숫자판(script.ts)과 같은 값
    const la = hitInfo?.la ?? (hitInfo?.kind === 'ground' ? -6 : hitInfo?.kind === 'line' ? 14 : hitInfo?.kind === 'pop' ? 58 : 31);
    return {
      i, kind, hit, batter, pitcher, batTeam, fldTeam, batMine, pitMine, last, lefty, bg, bat, pit, imgBox, pBox, zone, Z, C,
      pitchPts, flight, pcol, smear, title, chip, la, end: END[kind], fly: FLY[kind],
      swing: hit || last?.res === 'swing',
    };
  }, [play]);

  // 그림이 다 준비되면 시작 (빈 화면으로 시간표가 흐르지 않게) — 늦어도 0.7초
  useEffect(() => {
    let alive = true;
    const list = [v.bg, v.bat?.load, v.bat?.contact, v.pit?.windup, v.pit?.cock, v.pit?.ready].filter(Boolean) as string[];
    preload(list).then(() => { if (alive) setReady(true); });
    const t = window.setTimeout(() => { if (alive) setReady(true); }, 700);
    return () => { alive = false; window.clearTimeout(t); };
  }, [v]);
  // 움직임 줄이기면 멈춘 한 장면을 1.8초(전역 규칙이 애니메이션을 바로 끝내므로 시간으로) · 아니면 끝 알림이 안 올 때 대비
  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(finish, reduced ? 1800 : v.end + 12000);
    return () => window.clearTimeout(t);
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // 공 · 궤적 — Web Animations (컷 전체 길이 한 줄 시간표)
  const ballRef = useRef<SVGGElement>(null);
  const pTrailRef = useRef<SVGPathElement>(null);
  const hTrailRef = useRef<SVGPathElement>(null);
  const hGlowRef = useRef<SVGPathElement>(null);
  useLayoutEffect(() => {
    if (!ready || reduced) return;
    const T = v.end, anims: Animation[] = [];
    const tf = (x: number, y: number, k: number) => `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${k.toFixed(3)})`;
    const fr: Keyframe[] = [];
    const R0 = v.pitchPts[0];
    fr.push({ offset: 0, transform: tf(R0[0], R0[1], 0.32), opacity: 0 });
    fr.push({ offset: (REL - 1) / T, transform: tf(R0[0], R0[1], 0.32), opacity: 0 });
    v.pitchPts.forEach((q, k) => { const u = k / (v.pitchPts.length - 1); fr.push({ offset: (REL + (HIT - REL) * u) / T, transform: tf(q[0], q[1], 0.32 + 1.15 * Math.pow(u, 1.7)), opacity: 1 }); });
    if (v.hit) {
      const fly = v.flight, t0 = HIT + STOP;
      fr.push({ offset: t0 / T, transform: tf(v.C[0], v.C[1], 1.5), opacity: 1 });
      fly.forEach((q, k) => { if (!k) return; const u = k / (fly.length - 1); fr.push({ offset: Math.min(1, (t0 + v.fly * u) / T), transform: tf(q[0], q[1], q[2] / 6.4), opacity: v.kind === 'hr' && u > 0.86 ? Math.max(0, (1 - u) / 0.14) : 1 }); });
      const tl = Math.min(0.999, (t0 + v.fly + 160) / T);
      fr.push({ offset: tl, transform: fr[fr.length - 1].transform, opacity: 0 });
      // 타구 궤적 — 공을 따라 그려진다
      const cum = lenOf(fly), L = cum[cum.length - 1] || 1;
      for (const el of [hTrailRef.current, hGlowRef.current]) {
        if (!el) continue;
        el.style.strokeDasharray = `${L} ${L}`;
        const kf: Keyframe[] = [{ offset: 0, strokeDashoffset: L }, { offset: t0 / T, strokeDashoffset: L }];
        cum.forEach((c, k) => { if (k) kf.push({ offset: Math.min(1, (t0 + v.fly * (k / (fly.length - 1))) / T), strokeDashoffset: L - c }); });
        anims.push(el.animate(kf, { duration: T, fill: 'both' }));
      }
    } else {
      const Z = v.Z;
      fr.push({ offset: (HIT + 90) / T, transform: tf(Z[0] + (v.lefty ? 6 : -6), Z[1] + 34, 2.1), opacity: 0 });
    }
    fr.push({ offset: 1, transform: fr[fr.length - 1].transform, opacity: 0 });
    if (ballRef.current) anims.push(ballRef.current.animate(fr, { duration: T, fill: 'both' }));
    // 던진 공 궤적
    const pe = pTrailRef.current;
    if (pe) {
      const cum = lenOf(v.pitchPts), L = cum[cum.length - 1] || 1;
      pe.style.strokeDasharray = `${L} ${L}`;
      const kf: Keyframe[] = [{ offset: 0, strokeDashoffset: L }, { offset: REL / T, strokeDashoffset: L }];
      cum.forEach((c, k) => { if (k) kf.push({ offset: (REL + (HIT - REL) * (k / (cum.length - 1))) / T, strokeDashoffset: L - c }); });
      anims.push(pe.animate(kf, { duration: T, fill: 'both' }));
    }
    return () => anims.forEach((a) => a.cancel());
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const skip = () => { if (!out) setOut(true); };
  const onEnd = (e: AnimationEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (/life|skip/.test(e.animationName)) finish();
  };

  const { kind, hit, C, Z, zone, batter, pitcher, batTeam, fldTeam, last } = v;
  const ox = (C[0] / W) * 100, oy = (C[1] / H) * 100;
  const vars = {
    '--end': `${reduced ? 1800 : v.end}ms`, '--fly': `${v.fly}ms`,
    '--ox': `${ox}%`, '--oy': `${oy}%`, '--sx': `${((ox + 20) / 1.4).toFixed(2)}%`, '--sy': `${((oy + 20) / 1.4).toFixed(2)}%`,
    '--panY': kind === 'hr' ? '9%' : kind === 'k' ? '0%' : '4%', '--bat': batTeam.colors.primary, '--fld': fldTeam.colors.primary,
  } as CSSProperties;
  const cls = [s.cut, s['k-' + kind], ready && !reduced && s.live, out && s.out, reduced && s.still, !v.swing && s.look].filter(Boolean).join(' ');
  const zx = last?.zone ? Math.max(4, Math.min(96, ((last.zone[0] - 0.12) / 0.76) * 100)) : 50;
  const zy = last?.zone ? Math.max(4, Math.min(96, ((last.zone[1] - 0.08) / 0.84) * 100)) : 50;
  const stats = hit && play.hit ? [
    { k: '타구 속도', v: play.hit.kmh, u: 'km/h' },
    { k: '발사각', v: v.la, u: '°' },
    { k: '비거리', v: play.hit.distM, u: 'm' },
  ] : [];

  return (
    <div className={cls} style={vars} onClick={skip} onAnimationEnd={onEnd} role="img" aria-label={`명장면 — ${batter?.name ?? ''} ${v.title}`}>
      {ready && (
        <>
          <div className={s.cam}><div className={s.pan}><div className={s.punch}><div className={s.shake}>
            <img className={s.bg} src={v.bg} alt="" draggable={false} />
            <i className={s.dim} aria-hidden />
            {v.pit && (
              <>
                <img className={[s.pf, s.pf1].join(' ')} style={v.pBox} src={v.pit.windup} alt="" draggable={false} />
                <img className={[s.pf, s.pf2].join(' ')} style={v.pBox} src={v.pit.cock} alt="" draggable={false} />
                <img className={[s.pf, s.pf3].join(' ')} style={v.pBox} src={v.pit.ready} alt="" draggable={false} />
              </>
            )}
            {/* 존 · 던진 공 · 타구 */}
            <svg className={s.back} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
              <g className={s.zone}>
                <rect x={zone.x} y={zone.y} width={zone.w} height={zone.h} />
                <path d={`M${zone.x + zone.w / 3} ${zone.y}v${zone.h}M${zone.x + (zone.w * 2) / 3} ${zone.y}v${zone.h}M${zone.x} ${zone.y + zone.h / 3}h${zone.w}M${zone.x} ${zone.y + (zone.h * 2) / 3}h${zone.w}`} />
              </g>
              <path ref={pTrailRef} className={s.pTrail} d={pathOf(v.pitchPts)} style={{ stroke: v.pcol }} />
              {hit && <path ref={hGlowRef} className={s.hGlow} d={pathOf(v.flight)} />}
              {hit && <path ref={hTrailRef} className={s.hTrail} d={pathOf(v.flight)} />}
              <g ref={ballRef} className={s.ball}>
                <circle r="7" className={s.ballGlow} style={{ fill: v.pcol }} />
                <circle r="3.2" className={s.ballCore} />
              </g>
            </svg>
            {/* 타자 — 준비 · 맞는 순간 */}
            {v.bat && <img className={[s.bat, s.bLoad].join(' ')} style={v.imgBox} src={v.bat.load} alt="" draggable={false} />}
            {v.bat && v.swing && <img className={[s.bat, s.bHit].join(' ')} style={v.imgBox} src={v.bat.contact} alt="" draggable={false} />}
            {v.smear && (
              <svg className={s.front} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
                <defs>
                  <linearGradient id="bcSmear" gradientUnits="userSpaceOnUse" x1={C[0] + (v.lefty ? 60 : -60)} y1={C[1] - 120} x2={C[0]} y2={C[1]}>
                    <stop offset="0" stopColor="#fff" stopOpacity="0" />
                    <stop offset=".7" stopColor="#fff6dc" stopOpacity=".55" />
                    <stop offset="1" stopColor="#fff" stopOpacity=".95" />
                  </linearGradient>
                </defs>
                <path className={s.smear} d={v.smear} fill="url(#bcSmear)" />
              </svg>
            )}
            {/* 임팩트 — 맞은 곳(삼진은 공이 꽂힌 곳) 가운데 */}
            <Burst at={hit ? C : Z} hit={hit} />
          </div></div></div></div>
          <i className={s.speed} aria-hidden />
          <i className={s.white} aria-hidden />
          <i className={s.vignette} aria-hidden />
          {kind === 'hr' && <Flashes />}

          {/* 왼쪽 위 — 투구 정보 */}
          {pitcher && last && (
            <div className={[s.hud, s.pcard].join(' ')} style={{ '--tc': fldTeam.colors.primary, '--pc': v.pcol } as CSSProperties}>
              <div className={s.pWho}><b>{pitcher.name}</b><span>{fldTeam.short}</span>{v.pitMine && <em>우리</em>}</div>
              <div className={s.pType}><i />{last.name}</div>
              <div className={s.pSpd}><b className="num">{last.kmh}</b><small>km/h</small></div>
              <div className={s.mz} aria-hidden><i className={s.mzDot} style={{ left: `${zx}%`, top: `${zy}%` }} /></div>
            </div>
          )}
          {/* 오른쪽 아래 — 타격 결과 */}
          {v.title && (
            <div className={[s.hud, s.rcard].join(' ')} style={{ '--tc': batTeam.colors.primary } as CSSProperties}>
              <div className={s.rHead}><b>{v.title}</b>{v.chip && <em>{v.chip}</em>}</div>
              {stats.length > 0 && (
                <dl className={s.rStats}>
                  {stats.map((x) => (
                    <div key={x.k}><dt>{x.k}</dt><dd><Count v={x.v} delay={HIT + 300} still={reduced} /><small className={x.u === '°' ? s.deg : undefined}>{x.u}</small></dd></div>
                  ))}
                </dl>
              )}
              <div className={s.rWho}><i />{batter?.name ?? ''}<span>{batTeam.short}</span>{v.batMine && <em>우리</em>}</div>
            </div>
          )}
          {kind === 'hr' && <div className={s.hrBan} aria-hidden><b>HOME RUN</b></div>}
        </>
      )}
    </div>
  );
}

/* ───────── 임팩트 섬광 — 맞은 곳 가운데: 빛 무리 · 굵은 빛살 · 가는 빛살 · 충격파 둘 · 하얀 심 · 가로 빛줄기 · 불꽃 ───────── */
function Burst({ at, hit }: { at: Pt; hit: boolean }) {
  const g = useMemo(() => ({
    outer: raysOf(hit ? 18 : 12, hit ? [120, 230] : [60, 112], hit ? [9, 15] : [5, 8], 97),
    mid: raysOf(hit ? 18 : 12, hit ? [80, 160] : [44, 80], hit ? [7, 11] : [4, 6], 53),
    inner: raysOf(hit ? 14 : 10, hit ? [40, 88] : [26, 48], hit ? [5, 8] : [3, 5], 11),
    thin: raysOf(hit ? 36 : 22, hit ? [70, 190] : [40, 100], [0.7, 1.5], 31),
    sparks: Array.from({ length: hit ? 18 : 10 }, (_, k) => {
      const a = rad(k * (360 / (hit ? 18 : 10)) + (k % 3) * 7), r = (hit ? 70 : 40) + (k % 4) * 22;
      return { x: Math.cos(a) * r, y: Math.sin(a) * r + (hit ? 26 : 0), a: (a * 180) / Math.PI, l: 6 + (k % 3) * 4 };
    }),
  }), [hit]);
  const vb = '-220 -220 440 440';
  return (
    <div className={[s.burst, hit ? s.bHitFx : s.bK].join(' ')} style={{ left: pc(at[0], W), top: pc(at[1], H) }} aria-hidden>
      <svg className={s.glow} viewBox={vb}>
        <defs>
          <radialGradient id="bcGlow">
            <stop offset="0" stopColor="#fff" stopOpacity="1" />
            <stop offset=".14" stopColor={hit ? '#fff2a8' : '#e8f6ff'} stopOpacity=".95" />
            <stop offset=".4" stopColor={hit ? '#ffb11f' : '#62b8ff'} stopOpacity=".6" />
            <stop offset=".75" stopColor={hit ? '#ff6a00' : '#2a7bff'} stopOpacity=".16" />
            <stop offset="1" stopColor={hit ? '#ff6a00' : '#2a7bff'} stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle r={hit ? 150 : 96} fill="url(#bcGlow)" />
      </svg>
      <svg className={s.rays} viewBox={vb}>
        <defs>
          <radialGradient id="bcRayO" gradientUnits="userSpaceOnUse" cx="0" cy="0" r={hit ? 230 : 112}>
            <stop offset=".25" stopColor={hit ? '#ff9a14' : '#4aa8ff'} />
            <stop offset=".8" stopColor={hit ? '#ff6200' : '#2a6dff'} stopOpacity=".85" />
            <stop offset="1" stopColor={hit ? '#ff4d00' : '#2a5cff'} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="bcRayY" gradientUnits="userSpaceOnUse" cx="0" cy="0" r={hit ? 160 : 80}>
            <stop offset=".2" stopColor="#fffbe0" />
            <stop offset=".55" stopColor={hit ? '#ffe03a' : '#bfe6ff'} />
            <stop offset="1" stopColor={hit ? '#ffc400' : '#8fd0ff'} stopOpacity=".2" />
          </radialGradient>
        </defs>
        <path d={g.outer} fill="url(#bcRayO)" />
        <path d={g.mid} fill="url(#bcRayY)" />
        <path d={g.inner} fill="#ffffff" />
      </svg>
      <svg className={s.rays2} viewBox={vb}><path d={g.thin} fill="#fffbe8" /></svg>
      <svg className={s.ring} viewBox={vb}><circle r="200" /></svg>
      <svg className={[s.ring, s.ring2].join(' ')} viewBox={vb}><circle r="200" /></svg>
      <svg className={s.streak} viewBox={vb}><ellipse rx="210" ry="3.2" /></svg>
      <svg className={s.core} viewBox={vb}><circle r={hit ? 20 : 12} /></svg>
      <svg className={s.sparks} viewBox={vb}>
        {g.sparks.map((p, k) => (
          <line key={k} x1={0} y1={0} x2={Math.cos(rad(p.a)) * p.l} y2={Math.sin(rad(p.a)) * p.l} style={{ '--dx': `${p.x}px`, '--dy': `${p.y}px`, animationDelay: `${720 + (k % 4) * 18}ms` } as CSSProperties} />
        ))}
      </svg>
    </div>
  );
}

/* 홈런 — 관중석 카메라 플래시 */
function Flashes() {
  const list = useMemo(() => Array.from({ length: 22 }, (_, k) => ({
    x: 4 + ((k * 37) % 92), y: 8 + ((k * 53) % 22), d: 1150 + ((k * 211) % 1500),
  })), []);
  return (
    <div className={s.flashes} aria-hidden>
      {list.map((f, k) => <i key={k} style={{ left: `${f.x}%`, top: `${f.y}%`, animationDelay: `${f.d}ms` }} />)}
    </div>
  );
}

/* 숫자 올라가기 */
function Count({ v, delay, still }: { v: number; delay: number; still: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (still) return;
    let raf = 0;
    const t0 = performance.now() + delay;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - t0) / 700));
      if (ref.current) ref.current.textContent = String(Math.round(v * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [v, delay, still]);
  return <b ref={ref} className="num">{still ? v : 0}</b>;
}

