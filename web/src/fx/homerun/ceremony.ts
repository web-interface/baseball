// 만루 홈런 세리머니 (약 3초) — 화면이 홈 플레이트 옆 카메라로 바뀐다(옆으로 닦아 내는 전환).
//   타자가 3루 쪽에서 뛰어 들어와 홈을 밟고(먼지 · +4) → 먼저 들어온 주자 셋과 차례로 하이파이브, 마지막 주자는 헬멧을 툭
//   → 뒤쪽 더그아웃 난간에서 동료들이 박수 · 관중석엔 사진 플래시.
// 몸 움직임은 캐릭터 생성기(art/character)의 체격 · 달리기 동작 · 3D 뼈대(solve3)를 그대로 쓰고,
// 그림은 무거운 전신 SVG 대신 관절을 이은 깔끔한 실루엣(캔버스)으로 — 휴대폰에서도 가볍게.
// 이 파일은 만루 홈런 때만 불러온다 (player.ts 의 import()).
import { makeAppearance } from '../../art/character/appearance';
import { runMotion } from '../../art/character/motionField';
import { basePose, rot } from '../../art/character/motion';
import { solve3, type Joints3, type Pose3 } from '../../art/character/rig3';
import { flatten, unflatten } from '../../art/character/anim';
import type { Build, HandShape, Side } from '../../art/character/types';
import type { V3 } from '../../art/character/geom';
import type { Motion } from '../../art/character/motion';
import { liftL, type FxPlan } from './plan';
import type { HomerunInfo } from './types';
import { Rand, hash01 } from './rng';
import s from './homerun.module.css';

export interface Ceremony {
  resize(w: number, h: number): void;
  /** τ: 세리머니 시각(s) · alpha: 보이기(0/1) · left: 전체 남은 시간(s) */
  render(tau: number, alpha: number, left: number): void;
  dispose(): void;
}

const T_WIPE = 0.26;     // 화면 전환
const T_ARRIVE = 1.12;   // 홈을 밟는 때
const T_WALK = 1.46;     // 주자 쪽으로 걷기 시작
const GAP = [100, 205, 310]; // 주자 자리 (홈에서 cm)
const HAND_MEET = 64;    // 하이파이브 때 두 사람 사이 (cm)
const BACK = 0.88;       // 주자는 한 걸음 뒤(작게 · 조금 위) — 지나가는 타자와 덜 겹치게

interface Tone { body: string; far: string; sleeve: string; sleeveFar: string; helmet: string; sock: string; skin: string; shoe: string; line: string | null }
interface Fig { b: Build; run: Motion; stand: Pose3 }

const smooth = (x: number) => { const t = x < 0 ? 0 : x > 1 ? 1 : x; return t * t * (3 - 2 * t); };
/** t 가 [a,b] 에서 올라가 [c,d] 에서 내려오는 무게 */
const win = (t: number, a: number, b: number, c: number, d: number) => (t <= a || t >= d ? 0 : t < b ? smooth((t - a) / (b - a)) : t <= c ? 1 : 1 - smooth((t - c) / (d - c)));

function lerpPose(a: Pose3, b: Pose3, u: number): Pose3 {
  if (u <= 0) return a;
  if (u >= 1) return b;
  const fa = flatten(a), fb = flatten(b);
  return unflatten(fa.map((v, i) => v + (fb[i] - v) * u), u < 0.5 ? a : b);
}
function hand(p: Pose3, side: Side, at: V3, pole: V3, shape: HandShape = 'open') {
  p.hand[side] = { p: at, pole, shape, rot: 0 };
}
/** 서서 몸을 조금 카메라 쪽으로 (yaw 90 = 옆모습) */
function stand(b: Build, yaw: number): Pose3 {
  const p = basePose(b);
  p.pelvis = rot(yaw + 8);
  p.chest = rot(yaw - 6);
  return p;
}
function clapPose(b: Build, t: number, ph: number): Pose3 {
  const p = stand(b, 74);
  const beat = Math.abs(Math.sin((t * 3.1 + ph) * Math.PI));
  const g = 3 + 7 * beat;
  hand(p, 'R', [-g, 28, 30], [-0.9, 1, -0.2]);
  hand(p, 'L', [g, 28, 30], [0.9, 1, -0.2]);
  p.root = [0, -b.hipY - beat * 1.6, 0];
  return p;
}
function cheerPose(b: Build, hop: number, one = false): Pose3 {
  const p = stand(b, 82);
  hand(p, 'R', [-15, -54, 8], [-1, 0.3, -0.2], 'fist');
  if (one) hand(p, 'L', [16, 26, 14], [1, 1, -0.3], 'relax');
  else hand(p, 'L', [15, -54, 8], [1, 0.3, -0.2], 'fist');
  p.root = [0, -b.hipY - hop, 0];
  p.neck = -6;
  return p;
}

function shade(hex: string, k: number) {
  const h = hex.replace('#', '');
  if (h.length < 6) return hex;
  const n = parseInt(h.slice(0, 6), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 - k)))).toString(16).padStart(2, '0');
  return '#' + f((n >> 16) & 255) + f((n >> 8) & 255) + f(n & 255);
}
const lum = (hex: string) => { const n = parseInt(hex.replace('#', '').slice(0, 6), 16); return (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255; };
const mix3 = (a: V3, b: V3, u: number): V3 => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
const mid = (p: V3, q: V3, u: number): V3 => mix3(p, q, u);
function mixHex(a: string, b: string, u: number) {
  const pa = parseInt(a.replace('#', '').slice(0, 6), 16), pb = parseInt(b.replace('#', '').slice(0, 6), 16);
  const ch = (sh: number) => Math.round(((pa >> sh) & 255) * (1 - u) + ((pb >> sh) & 255) * u).toString(16).padStart(2, '0');
  return '#' + ch(16) + ch(8) + ch(0);
}

export function makeCeremony(canvas: HTMLCanvasElement, root: HTMLElement, plan: FxPlan, info: HomerunInfo): Ceremony {
  const ctx = canvas.getContext('2d')!;
  const R = new Rand(plan.seed ^ 0x51ed);
  const classic = plan.theme === 'classic';
  const home = info.home !== false;
  const team = info.team?.primary ?? '#1C2A44';
  const team2 = info.team?.secondary ?? '#F2F0EA';
  // 너무 밝은 구단색(크림 등)은 소매·헬멧에 보조색을
  // 너무 밝은 구단색(크림 등)은 보조색 · 너무 어두운 색(남색·검정)은 밤 배경에서 보이게 밝힌다
  const kitCol = classic ? (lum(team) > 0.75 ? team2 : team) : liftL(lum(team) > 0.75 ? team2 : team, 0.36);
  /** 언더셔츠 소매 — 구단색을 어둡게 (밝은 헬멧과 팔이 한 덩어리로 보이지 않게) */
  const under = lum(kitCol) > 0.3 ? mixHex(kitCol, '#0B0E14', 0.58) : liftL(mixHex(kitCol, '#0B0E14', 0.25), 0.22);
  const spot = plan.palette[0];
  const ink = '#1D1E21';
  const notMine = info.mine === false;
  const tone: Tone = classic
    ? { body: '#F6F1E6', far: '#E3DDCF', sleeve: notMine ? ink : spot, sleeveFar: notMine ? '#46474B' : shade(spot, 0.15), helmet: notMine ? ink : spot, sock: notMine ? ink : spot, skin: '#EADFCB', shoe: ink, line: ink }
    : home
      ? { body: '#F2F0EA', far: '#C7C4BC', sleeve: under, sleeveFar: shade(under, 0.3), helmet: kitCol, sock: kitCol, skin: '#C99B78', shoe: '#14161A', line: null }
      : { body: '#ABB0B8', far: '#868B93', sleeve: under, sleeveFar: shade(under, 0.3), helmet: kitCol, sock: kitCol, skin: '#C99B78', shoe: '#14161A', line: null };

  const body = (tag: string): Fig => {
    const ap = makeAppearance({ id: `hrfx-${plan.seed}-${tag}`, heightCm: Math.round(R.range(176, 191)), weightKg: Math.round(R.range(76, 99)), throws: 'R', bats: 'R', pos: 'LF' });
    return { b: ap.build, run: runMotion(ap, 0.35), stand: stand(ap.build, 90) };
  };
  const batter = body('b');
  const runners = [body('r1'), body('r2'), body('r3')];
  const runPh = R.range(0, 1);
  const clapPh = runners.map(() => R.range(0, 1));
  // 걷기 = 생성기 달리기 동작을 서 있기와 WALK_A 만큼만 섞어 RATE 배로 — 디딘 발이 미끄러지지 않는 바닥 속도
  const WALK_A = 0.5, RATE = 0.9;
  const vW = WALK_A * RATE * (batter.run.scroll ?? 450);
  const walkPose = (tw: number) => lerpPose(batter.stand, batter.run.sample(RATE * tw + runPh * batter.run.dur), WALK_A);
  const hiT = GAP.map((g) => T_WALK + (g - HAND_MEET - 12) / vW);
  // 뒤쪽 더그아웃 동료들 · 관중석 불빛
  const mates = Array.from({ length: 7 }, (_, i) => ({ x: 0.035 + i * 0.062 + R.range(-0.012, 0.012), s: R.range(0.88, 1.08), ph: R.range(0, 1), f: R.range(2.6, 3.6), wave: i === 2 || i === 5 }));
  const crowd = Array.from({ length: 190 }, (_, i) => ({ x: R.next(), row: i % 9, a: R.range(0.1, 0.38), warm: R.chance(0.62), fl: R.chance(0.1) ? R.range(0, 3) : -1 }));
  const glitter = Array.from({ length: 34 }, () => ({ x: R.range(0.05, 0.95), y0: R.range(0.02, 0.3), v: R.range(0.025, 0.06), ph: R.next() }));

  // 자막 (+4)
  const cap = document.createElement('div');
  cap.className = s.cer;
  const k1 = document.createElement('p'); k1.className = s.cerKick; k1.textContent = info.walkoff ? '끝내기 만루 홈런' : '만루 홈런';
  const big = document.createElement('p'); big.className = s.cerBig; big.innerHTML = '<b>+4</b>';
  const who = document.createElement('p'); who.className = s.cerWho; who.textContent = [info.batter, '4타점'].filter(Boolean).join(' · ');
  cap.append(k1, big, who);
  root.insertBefore(cap, root.querySelector('.' + s.skip));
  const capAnims = [
    cap.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: T_WIPE * 1000, fill: 'both' }),
    big.animate([{ opacity: 0, transform: 'scale(1.7)' }, { opacity: 1, transform: 'none' }], { duration: 320, delay: T_ARRIVE * 1000, fill: 'both', easing: 'cubic-bezier(.3,1.45,.45,1)' }),
    who.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 260, delay: T_ARRIVE * 1000 + 160, fill: 'both' }),
  ];
  capAnims.forEach((a) => a.pause());

  let W = 1, H = 1, dpr = 1;
  const P = { ground: 0, back: 0, horizon: 0, plate: 0, k: 1 };
  const layout = () => {
    P.ground = H * 0.81;
    P.back = H * 0.748;
    P.horizon = H * 0.585;
    P.plate = W * 0.36;
    P.k = Math.min(H * 0.29, W * 0.34) / 184;
  };

  /** 사람 하나 — 화면 x(px) · 바닥 y · 크기 배율 · face: 1 오른쪽 / −1 왼쪽 */
  const drawFig = (f: Fig, J: Joints3, x: number, gy: number, sc: number, face: 1 | -1) => {
    const k = P.k * sc;
    const X = (v: V3) => x + face * v[0] * k;
    const Y = (v: V3) => gy + v[1] * k;
    const T = tone;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const seg = (p: V3, q: V3, w: number, col: string) => {
      if (T.line) {
        ctx.strokeStyle = T.line;
        ctx.lineWidth = w * k + 1.8;
        ctx.beginPath(); ctx.moveTo(X(p), Y(p)); ctx.lineTo(X(q), Y(q)); ctx.stroke();
      }
      ctx.strokeStyle = col;
      ctx.lineWidth = w * k;
      ctx.beginPath(); ctx.moveTo(X(p), Y(p)); ctx.lineTo(X(q), Y(q)); ctx.stroke();
    };
    // 카메라에서 먼 쪽 → 가까운 쪽 (z 가 클수록 가깝다)
    const sides: Side[] = J.hip.R[2] > J.hip.L[2] ? ['L', 'R'] : ['R', 'L'];
    const leg = (sd: Side, far: boolean) => {
      const pant = far ? T.far : T.body;
      seg(J.heel[sd], J.toe[sd], 7.5, T.shoe);
      seg(J.knee[sd], J.ankle[sd], 12, far ? shade(T.sock, 0.22) : T.sock);
      seg(J.hip[sd], J.knee[sd], 16.5, pant);
      seg(J.knee[sd], mid(J.knee[sd], J.ankle[sd], 0.42), 13, pant);
    };
    const arm = (sd: Side, far: boolean) => {
      seg(J.shoulder[sd], J.elbow[sd], 10.5, far ? T.sleeveFar : T.sleeve);
      seg(J.elbow[sd], J.wrist[sd], 8.5, far ? T.sleeveFar : T.sleeve);
      seg(J.wrist[sd], J.palm[sd], 8.5, T.skin);
    };
    leg(sides[0], true);
    arm(sides[0], true);
    const sh = mid(J.shoulder.R, J.shoulder.L, 0.5);
    const hp = mid(J.hip.R, J.hip.L, 0.5);
    seg(mid(sh, hp, 0.08), mid(sh, hp, 0.92), 27, T.body);
    seg(mid(sh, hp, 0.86), mid(sh, hp, 0.9), 27.5, T.line ?? shade(T.body, 0.34)); // 벨트
    leg(sides[1], false);
    // 머리 · 헬멧
    const head: V3 = [J.neck[0] + J.headUp[0] * 15, J.neck[1] + J.headUp[1] * 15, J.neck[2]];
    seg(J.neck, mid(J.neck, head, 0.6), 10, T.skin);
    const hr = 11.2 * f.b.headScale * k;
    const hx = X(head), hy = Y(head);
    ctx.fillStyle = T.line ?? 'rgba(4,6,10,.75)';
    ctx.beginPath(); ctx.arc(hx, hy, hr + (T.line ? 0.9 : 1.1), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = T.skin;
    ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI * 2); ctx.fill();
    // 타자 헬멧 — 정수리 · 뒤통수 · 귀덮개를 덮고, 앞쪽 얼굴은 드러난다 (u 앞, v 아래)
    const H2 = (u: number, v: number): [number, number] => [hx + face * u * hr, hy + v * hr];
    ctx.fillStyle = T.helmet;
    ctx.beginPath();
    ctx.moveTo(...H2(0.98, -0.28));
    ctx.bezierCurveTo(...H2(0.9, -1.25), ...H2(-1.25, -1.3), ...H2(-1.12, 0.08));
    ctx.lineTo(...H2(-0.98, 0.5));
    ctx.lineTo(...H2(-0.32, 0.66));
    ctx.lineTo(...H2(0.1, 0.16));
    ctx.lineTo(...H2(0.9, -0.1));
    ctx.lineTo(...H2(1.58, -0.06));
    ctx.lineTo(...H2(1.52, -0.22));
    ctx.closePath();
    ctx.fill();
    if (T.line) { ctx.strokeStyle = T.line; ctx.lineWidth = 1; ctx.stroke(); }
    else { ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(...H2(-0.6, -0.86)); ctx.quadraticCurveTo(...H2(0.2, -1.16), ...H2(0.8, -0.62)); ctx.stroke(); }
    arm(sides[1], false);
  };

  /** 타자 — 뛰어 들어옴 → 홈 → 만세 → 걸으며 하이파이브 */
  const batterAt = (tau: number): { pose: Pose3; x: number } => {
    const k = P.k;
    const b = batter.b;
    if (tau < T_ARRIVE) {
      const m = batter.run;
      return { pose: m.sample(tau + runPh * m.dur), x: P.plate - (T_ARRIVE - tau) * (m.scroll ?? 450) * k };
    }
    if (tau < T_WALK) {
      const u = (tau - T_ARRIVE) / (T_WALK - T_ARRIVE);
      const hop = Math.sin(Math.min(1, u * 1.6) * Math.PI) * 9;
      const runEnd = batter.run.sample(T_ARRIVE + runPh * batter.run.dur);
      return { pose: lerpPose(runEnd, cheerPose(b, hop), smooth(u * 2.4)), x: P.plate + u * 12 * k };
    }
    const tw = tau - T_WALK;
    let pose = walkPose(tw);
    if (tw < 0.25) pose = lerpPose(cheerPose(b, 0), pose, smooth(tw / 0.25));
    const x = P.plate + 12 * k + tw * vW * k;
    // 하이파이브 — 주자 앞에 올 때 오른손을 높이 · 마지막은 고개를 숙여 헬멧을 내민다
    const w = Math.max(win(tau, hiT[0] - 0.24, hiT[0] - 0.04, hiT[0] + 0.08, hiT[0] + 0.3), win(tau, hiT[1] - 0.24, hiT[1] - 0.04, hiT[1] + 0.08, hiT[1] + 0.3));
    const tap = win(tau, hiT[2] - 0.26, hiT[2] - 0.04, hiT[2] + 0.12, hiT[2] + 0.34);
    if (w > 0) {
      pose = { ...pose, hand: { ...pose.hand, R: { p: mix3(pose.hand.R.p, [-6, -36, 34], w), pole: mix3(pose.hand.R.pole, [-1, 0.5, -0.3], w), shape: 'open', rot: 0 } } };
    }
    if (tap > 0) pose = { ...pose, neck: pose.neck + 16 * tap };
    return { pose, x };
  };

  /** 주자 i — 박수 → (타자가 홈을 밟으면) 만세 → 하이파이브 / 헬멧 툭 → 주먹 */
  const runnerAt = (i: number, tau: number): { pose: Pose3; x: number; contact: number } => {
    const b = runners[i].b;
    const x = P.plate + GAP[i] * P.k;
    let pose = clapPose(b, tau, clapPh[i]);
    const ch = win(tau, T_ARRIVE - 0.05, T_ARRIVE + 0.1, T_ARRIVE + 0.3, T_ARRIVE + 0.55);
    if (ch > 0) pose = lerpPose(pose, cheerPose(b, 4 * ch), ch);
    const ti = hiT[i];
    const p2 = stand(b, 84);
    if (i < 2) hand(p2, 'R', [-6, -36, 34], [-1, 0.5, -0.3]);
    else hand(p2, 'R', [-4, -16, 44], [-1, 0.2, -0.4]);
    hand(p2, 'L', [14, 30, 6], [1, 1, -0.3], 'relax');
    const w = win(tau, ti - 0.3, ti - 0.05, ti + (i < 2 ? 0.08 : 0.12), ti + (i < 2 ? 0.3 : 0.36));
    if (w > 0) pose = lerpPose(pose, p2, w);
    // 하이파이브 뒤 — 한 팔 주먹
    const pump = win(tau, ti + 0.3, ti + 0.42, ti + 0.62, ti + 0.85);
    if (pump > 0) pose = lerpPose(pose, cheerPose(b, 2, true), pump);
    return { pose, x, contact: Math.max(0, 1 - Math.abs(tau - ti) / (i < 2 ? 0.16 : 0.14)) };
  };

  /* ── 배경: 하늘 · 관중석(불빛·사진 플래시) · 담장 · 잔디 · 흙 · 홈 플레이트 ── */
  const backdrop = (tau: number) => {
    const g = P.ground, hz = P.horizon;
    if (classic) {
      ctx.fillStyle = '#EEEBE3';
      ctx.fillRect(0, 0, W, H);
      // 관중석 — 망점 띠
      ctx.fillStyle = 'rgba(29,30,33,.16)';
      for (let y = H * 0.2; y < hz - H * 0.05; y += 4) for (let x = ((y / 4) % 2) * 2; x < W; x += 4) ctx.fillRect(x, y, 1.15, 1.15);
      // 담장 — 겹줄
      ctx.fillStyle = ink;
      ctx.fillRect(0, hz - H * 0.05, W, 1.2);
      ctx.fillRect(0, hz - H * 0.042, W, 0.8);
      ctx.fillStyle = notMine ? ink : spot;
      ctx.fillRect(0, hz - 2, W, 2);
      // 잔디 — 가는 가로 빗금
      ctx.fillStyle = 'rgba(47,88,72,.22)';
      for (let y = hz + 3, i = 0; y < g; y += 3 + i * 0.4, i++) ctx.fillRect(0, y, W, 0.7);
      // 흙
      ctx.fillStyle = '#D6C9AE';
      ctx.fillRect(0, g - H * 0.03, W, H);
      ctx.fillStyle = ink;
      ctx.fillRect(0, g - H * 0.03, W, 1);
      return;
    }
    const sky = ctx.createLinearGradient(0, 0, 0, hz);
    sky.addColorStop(0, '#03050B');
    sky.addColorStop(1, '#0B1322');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, hz);
    // 조명탑 빛
    for (const lx of [0.08, 0.92]) {
      const gr = ctx.createRadialGradient(lx * W, H * 0.06, 0, lx * W, H * 0.06, H * 0.32);
      gr.addColorStop(0, 'rgba(255,248,230,.5)');
      gr.addColorStop(0.08, 'rgba(255,244,220,.22)');
      gr.addColorStop(1, 'rgba(255,240,210,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, W, hz);
    }
    // 관중석 — 지붕 선 · 층 · 줄지은 작은 불빛(휴대폰 조명) · 가끔 사진 플래시
    const st0 = H * 0.26, st1 = hz - H * 0.055;
    const stands = ctx.createLinearGradient(0, st0, 0, st1);
    stands.addColorStop(0, '#0A0F1A');
    stands.addColorStop(1, '#111827');
    ctx.fillStyle = stands;
    ctx.fillRect(0, st0, W, st1 - st0);
    ctx.fillStyle = '#1C2536';
    ctx.fillRect(0, st0, W, 1.5);
    ctx.fillStyle = 'rgba(255,255,255,.035)';
    for (let r = 1; r < 9; r += 2) ctx.fillRect(0, st0 + ((st1 - st0) * r) / 9, W, (st1 - st0) / 9);
    for (let i = 0; i < crowd.length; i++) {
      const c = crowd[i];
      const x = c.x * W, y = st0 + ((st1 - st0) * (c.row + 0.5)) / 9;
      let a = c.a;
      if (c.fl >= 0) { const d = (tau + c.fl) % 1.7; a = d < 0.08 ? 1 : a; }
      ctx.globalAlpha = a;
      ctx.fillStyle = a >= 1 ? '#FFFFFF' : c.warm ? '#FFD9A0' : '#BFD4FF';
      ctx.fillRect(x, y, a >= 1 ? 2.2 : 1.3, a >= 1 ? 2.2 : 1.3);
    }
    ctx.globalAlpha = 1;
    // 담장 — 패드 + 구단색 줄
    ctx.fillStyle = '#0E1522';
    ctx.fillRect(0, hz - H * 0.055, W, H * 0.055);
    ctx.fillStyle = kitCol;
    ctx.fillRect(0, hz - H * 0.055, W, 2);
    // 잔디 — 깎은 줄무늬 (멀수록 촘촘)
    const grass = ctx.createLinearGradient(0, hz, 0, g);
    grass.addColorStop(0, '#0C2316');
    grass.addColorStop(1, '#14351F');
    ctx.fillStyle = grass;
    ctx.fillRect(0, hz, W, g - hz);
    ctx.fillStyle = 'rgba(255,255,255,.035)';
    for (let i = 0, y = hz; y < g; i++) { const hgt = 3 + i * 2.2; if (i % 2) ctx.fillRect(0, y, W, hgt); y += hgt; }
    // 흙 + 홈 쪽 빛
    const dirt = ctx.createLinearGradient(0, g - H * 0.035, 0, H);
    dirt.addColorStop(0, '#4A3426');
    dirt.addColorStop(1, '#2E1F15');
    ctx.fillStyle = dirt;
    ctx.fillRect(0, g - H * 0.035, W, H);
    const spotL = ctx.createRadialGradient(P.plate + W * 0.12, g, 0, P.plate + W * 0.12, g, W * 0.6);
    spotL.addColorStop(0, 'rgba(255,240,215,.14)');
    spotL.addColorStop(1, 'rgba(255,240,215,0)');
    ctx.fillStyle = spotL;
    ctx.fillRect(0, hz, W, H - hz);
    // 그라운드 조명이 선수들 뒤(담장·관중석 아래)를 밝힌다 — 어두운 헬멧·소매도 실루엣으로 읽히게
    const back = ctx.createRadialGradient(W * 0.58, hz - H * 0.02, 0, W * 0.58, hz - H * 0.02, W * 0.62);
    back.addColorStop(0, 'rgba(255,244,222,.2)');
    back.addColorStop(0.5, 'rgba(255,244,222,.07)');
    back.addColorStop(1, 'rgba(255,244,222,0)');
    ctx.fillStyle = back;
    ctx.fillRect(0, H * 0.3, W, g - H * 0.3);
    // 하늘에 남은 금빛 불티
    for (let i = 0; i < glitter.length; i++) {
      const q = glitter[i];
      const y = (q.y0 + q.v * (tau + 0.6)) * H;
      if (y > hz - H * 0.06) continue;
      ctx.globalAlpha = (hash01(i, Math.floor(tau * 18 + q.ph * 9)) > 0.4 ? 0.85 : 0.25) * (1 - y / hz);
      ctx.fillStyle = '#FFD58A';
      ctx.fillRect(q.x * W, y, 1.6, 1.6);
    }
    ctx.globalAlpha = 1;
  };

  const plateLines = () => {
    const g = P.ground, k = P.k, px = P.plate;
    ctx.fillStyle = classic ? '#F6F1E6' : '#F4F1EA';
    ctx.beginPath();
    ctx.moveTo(px - 22 * k, g + 1); ctx.lineTo(px + 22 * k, g + 1); ctx.lineTo(px + 26 * k, g + 4); ctx.lineTo(px - 26 * k, g + 4); ctx.closePath();
    ctx.fill();
    if (classic) { ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.stroke(); }
    ctx.strokeStyle = classic ? 'rgba(29,30,33,.55)' : 'rgba(244,241,234,.5)';
    ctx.lineWidth = 1.2;
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(px + sx * 40 * k, g + 2); ctx.lineTo(px + sx * 54 * k, g + 18);
      ctx.moveTo(px + sx * 40 * k, g + 2); ctx.lineTo(px + sx * 150 * k, g + 2);
      ctx.stroke();
    }
  };

  /** 뒤쪽(왼편) 더그아웃 — 지붕 · 어두운 안 · 난간 너머 동료들의 머리와 박수 */
  const dugout = (tau: number) => {
    const x1 = W * 0.47;
    const roof = P.horizon - H * 0.135, rail = P.horizon - H * 0.012;
    const hr = H * 0.021;
    if (classic) {
      ctx.strokeStyle = 'rgba(29,30,33,.55)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (let x = -H; x < x1; x += 3.2) { ctx.moveTo(x, rail); ctx.lineTo(x + (rail - roof), roof); }
      ctx.save(); ctx.beginPath(); ctx.rect(0, roof, x1, rail - roof); ctx.clip();
      ctx.beginPath();
      for (let x = -H; x < x1; x += 3.2) { ctx.moveTo(x, rail); ctx.lineTo(x + (rail - roof), roof); }
      ctx.stroke(); ctx.restore();
      ctx.fillStyle = ink;
      ctx.fillRect(0, roof - 2, x1, 2);
    } else {
      ctx.fillStyle = '#040508';
      ctx.fillRect(0, roof, x1, rail - roof);
      ctx.fillStyle = '#121A28';
      ctx.fillRect(0, roof - H * 0.02, x1 + 4, H * 0.02);
      ctx.fillStyle = kitCol;
      ctx.fillRect(0, roof - H * 0.02, x1 + 4, 1.5);
    }
    const headCol = classic ? '#F6F1E6' : '#262E3B';
    const capCol = classic ? (notMine ? ink : spot) : shade(kitCol, 0.1);
    const armCol = classic ? ink : '#1E2531';
    for (const m of mates) {
      const x = m.x * W, r = hr * m.s;
      const hy = rail - r * 1.25;
      const beat = Math.abs(Math.sin((tau * m.f + m.ph) * Math.PI));
      ctx.strokeStyle = armCol;
      ctx.lineCap = 'round';
      ctx.lineWidth = r * 0.62;
      if (m.wave) {
        const sw = Math.sin((tau * 2.4 + m.ph) * Math.PI * 2) * r * 1.1;
        ctx.beginPath(); ctx.moveTo(x + r * 0.9, rail); ctx.lineTo(x + r * 1.2 + sw * 0.3, hy - r * 1.4); ctx.lineTo(x + r * 1.1 + sw, hy - r * 2.9); ctx.stroke();
      } else {
        const g = 1 + beat * r * 0.6;
        const top = hy - r * 2.1 - beat * r * 0.25;
        ctx.beginPath(); ctx.moveTo(x - r * 1.1, rail); ctx.lineTo(x - g - r * 0.35, top + r * 0.9); ctx.lineTo(x - g, top); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + r * 1.1, rail); ctx.lineTo(x + g + r * 0.35, top + r * 0.9); ctx.lineTo(x + g, top); ctx.stroke();
      }
      ctx.fillStyle = headCol;
      ctx.beginPath(); ctx.arc(x, hy, r, 0, Math.PI * 2); ctx.fill();
      if (classic) { ctx.strokeStyle = ink; ctx.lineWidth = 0.9; ctx.stroke(); }
      ctx.fillStyle = capCol;
      ctx.beginPath(); ctx.arc(x, hy - r * 0.12, r * 1.04, Math.PI, Math.PI * 2); ctx.lineTo(x + r * 1.55, hy - r * 0.06); ctx.lineTo(x - r, hy); ctx.closePath(); ctx.fill();
    }
    // 난간
    ctx.fillStyle = classic ? ink : '#2A3240';
    ctx.fillRect(0, rail, x1, classic ? 1.4 : 2.2);
  };

  const dust = (tau: number) => {
    const d = tau - T_ARRIVE;
    if (d < 0 || d > 0.6) return;
    const k = P.k;
    const R2 = new Rand(plan.seed ^ 0x77);
    for (let i = 0; i < 7; i++) {
      const dir = (i - 3) / 3;
      const x = P.plate + dir * (14 + d * 110) * k;
      const y = P.ground - (4 + Math.abs(dir) * 2 + d * 26 * R2.range(0.6, 1.2)) * k;
      const r = (5 + d * 26) * k * R2.range(0.8, 1.2);
      ctx.globalAlpha = 0.34 * (1 - d / 0.6);
      ctx.fillStyle = classic ? '#BCAC8A' : '#B08A66';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  const spark = (x: number, y: number, c: number) => {
    if (c <= 0) return;
    ctx.globalAlpha = c;
    ctx.strokeStyle = classic ? ink : '#FFF3D6';
    ctx.lineWidth = classic ? 1 : 1.6;
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const ang = (i / 7) * Math.PI * 2 + 0.3;
      const r0 = 4 + (1 - c) * 5, r1 = r0 + 4 + c * 5;
      ctx.moveTo(x + Math.cos(ang) * r0, y + Math.sin(ang) * r0);
      ctx.lineTo(x + Math.cos(ang) * r1, y + Math.sin(ang) * r1);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  return {
    resize(w, h) {
      W = Math.max(1, w); H = Math.max(1, h);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      layout();
    },
    render(tau, alpha, left) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const a of capAnims) a.currentTime = tau * 1000;
      const out = Math.max(0, Math.min(1, left / 0.34));
      const a = alpha > 0 ? out : 0;
      cap.style.opacity = a >= 0.999 ? '' : String(a);
      if (a <= 0.001) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = 1;
      // 전환 — 오른쪽에서 왼쪽으로 닦아 내며 카메라가 바뀐다
      const wipe = tau < T_WIPE ? 1 - (1 - tau / T_WIPE) ** 3 : 1;
      const edge = W * (1 - wipe);
      ctx.save();
      if (wipe < 1) { ctx.beginPath(); ctx.rect(edge, 0, W - edge, H); ctx.clip(); }
      backdrop(tau);
      dugout(tau);
      plateLines();
      const rs = runners.map((_, i) => runnerAt(i, tau));
      const bt = batterAt(tau);
      // 주자 — 한 걸음 뒤에서 왼쪽(타자 쪽)을 본다
      rs.forEach((r, i) => drawFig(runners[i], solve3(runners[i].b, r.pose), r.x, P.back, BACK, -1));
      dust(tau);
      const JB = solve3(batter.b, bt.pose);
      drawFig(batter, JB, bt.x, P.ground, 1, 1);
      // 손이 맞닿는 순간
      rs.forEach((r, i) => {
        if (r.contact <= 0) return;
        const k = P.k;
        if (i < 2) spark(bt.x + JB.wrist.R[0] * k + 4, P.ground + JB.wrist.R[1] * k, r.contact);
        else spark(bt.x + JB.neck[0] * k + 6, P.ground + (JB.neck[1] - 30) * k, r.contact);
      });
      ctx.restore();
      if (wipe < 1) { ctx.fillStyle = classic ? ink : kitCol; ctx.fillRect(edge - 1.5, 0, 3, H); }
      // 끝 — 경기장이 다시 비쳐 보이게 흐려진다
      canvas.style.opacity = out >= 0.999 ? '' : String(out);
    },
    dispose() {
      capAnims.forEach((x) => x.cancel());
      cap.remove();
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}
