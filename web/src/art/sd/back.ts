// SD 타자 뒷모습 — 명장면 컷(타자 뒤에서 본 중계 구도)용. drawSd 와 같은 그림체(굵은 외곽선 · 한 단계 그림자 · 같은 유니폼 색).
// 좌표: drawSd 와 같은 몸 기준(몸 중심 x=120, 머리 중심 y=86, 발 y≈266). 방망이가 오른쪽으로 길게 나가므로 그릴 상자는 넓다(BACK_VIEW).
// 반전 전 그림은 우타 — 뒤에서 보면 오른손 · 오른쪽 어깨가 그림 오른쪽, 귀 덮개는 투수 쪽(왼쪽) 귀. 좌타는 mirror.
// 자세: load(타격 준비 — 방망이를 뒤쪽 어깨 위로) · contact(맞히는 순간 — 몸이 열리고 방망이가 홈 위로 뻗음, 뒷발 뒤꿈치가 들림)
import { INK, P, SKIN, HAIR, batPath, capsule, elbow, ell, lum, mix, pinstripes, r1, shade, type Pt, type SdKit } from './draw';

export type BackPose = 'load' | 'contact';
export interface SdBackOpts {
  /** clipPath id 가 겹치지 않게 */
  id: string;
  pose: BackPose;
  kit: SdKit;
  /** 좌타 — 좌우 반전 */
  mirror?: boolean;
  build?: 0 | 1 | 2;
  skin?: number; hair?: number;
  /** 등 이름 */
  name: string;
  gloveColor?: string; batColor?: string; band?: boolean; bandColor?: string;
  /** contact — 공 높이에 맞춰 손 · 방망이를 위(−) · 아래(+)로 (그림 단위, −24 ~ 24) */
  swingY?: number;
}

/** 그릴 상자 (viewBox) — x −10 ~ 320, y 0 ~ 290 */
export const BACK_VIEW = { x: -10, y: 0, w: 330, h: 290 };

interface LegSide { k: Pt; f: Pt; pivot?: boolean }
const LEGS: Record<BackPose, { L: LegSide; R: LegSide }> = {
  load: { L: { k: [-31, 240], f: [-40, 266] }, R: { k: [31, 240], f: [40, 266] } },
  contact: { L: { k: [-29, 238], f: [-42, 266] }, R: { k: [16, 243], f: [22, 262], pivot: true } },
};

/** 몸 뼈대 — 어깨 · 손 · 방망이(손잡이 K → 끝 T). 컷 화면이 방망이 맞는 자리(sweet)를 같이 쓴다 */
function rig(pose: BackPose, b: 0 | 1 | 2, swingY = 0) {
  const cx = 120, sy = 150, wy = 206;
  const sw = [31, 35, 42][b], ww = [25, 29, 37][b];
  const SL: Pt = [cx - sw + 6, sy + 2], SR: Pt = [cx + sw - 6, sy + 2];
  let K: Pt, T: Pt, hintL: Pt, hintR: Pt;
  if (pose === 'load') {
    K = [cx + 31, sy - 4]; T = [cx + 74, 14];
    hintL = [cx + 6, sy + 22]; hintR = [cx + sw + 30, sy - 2];
  } else {
    const y = Math.max(-24, Math.min(24, swingY));
    K = [cx + ww + 5, wy - 2 + y * 0.45]; T = [cx + 152, wy - 60 + y];
    hintL = [cx, sy + 40]; hintR = [cx + sw + 16, sy + 34];
  }
  const at = (s: number): Pt => [K[0] + (T[0] - K[0]) * s, K[1] + (T[1] - K[1]) * s];
  const HL = at(0.06), HR = at(0.155);
  const EL = elbow(SL, HL, 34, 33, hintL), ER = elbow(SR, HR, 34, 33, hintR);
  const bang = (Math.atan2(T[1] - K[1], T[0] - K[0]) * 180) / Math.PI;
  const tilt = pose === 'contact' ? 7 : 0;
  const rot = (q: Pt): Pt => { const a = (tilt * Math.PI) / 180, dx = q[0] - cx, dy = q[1] - wy; return [cx + dx * Math.cos(a) - dy * Math.sin(a), wy + dx * Math.sin(a) + dy * Math.cos(a)]; };
  return { cx, sy, wy, sw, ww, SL, SR, K, T, HL, HR, EL, ER, bang, sweet: rot(at(0.8)), tilt, rot };
}

/** 방망이 맞는 자리 · 손 — BACK_VIEW 좌표(반전 반영) */
export function backPoints(opt: Pick<SdBackOpts, 'pose' | 'build' | 'mirror' | 'swingY'>) {
  const r = rig(opt.pose, opt.build ?? 1, opt.swingY);
  const fx = (q: Pt): Pt => (opt.mirror ? [240 - q[0], q[1]] : q);
  return { sweet: fx(r.sweet), hands: fx(r.rot(r.HR)), knob: fx(r.rot(r.K)), tip: fx(r.rot(r.T)), head: fx(r.rot([r.cx, 40])) };
}

export function drawSdBack(opt: SdBackOpts): string {
  const o = { build: 1 as 0 | 1 | 2, skin: 1, hair: 0, batColor: '#E8C28A', band: false, bandColor: '#F4F4F2', mirror: false, swingY: 0, ...opt };
  const b = o.build, K0 = o.kit;
  const pre = `sdb${o.id.replace(/[^\w-]/g, '')}`;
  let n = 0;
  const id = () => pre + '_' + n++;
  /** drawSd 와 같은 칠 — 바깥 외곽선 · 오른쪽 아래 그림자 · 안쪽 무늬(잘라 넣기) */
  const part = (d: string | string[], fill: string, q: { sx?: number; sy?: number; w?: number; k?: number; dark?: string; inner?: string } = {}) => {
    const ds = Array.isArray(d) ? d : [d];
    const k = id(), sx = q.sx ?? 4, sy = q.sy ?? 4, w = q.w ?? 2.6;
    const dark = q.dark ?? shade(fill, q.k ?? 0.8);
    let s = w ? `<path d="${ds.join(' ')}" fill="none" stroke="${INK}" stroke-width="${w * 2}" stroke-linejoin="round"/>` : '';
    s += `<clipPath id="${k}">${ds.map((x) => `<path d="${x}"/>`).join('')}</clipPath><g clip-path="url(#${k})">`;
    s += ds.map((x) => `<path d="${x}" fill="${dark}"/>`).join('');
    s += `<g transform="translate(${r1(-sx)},${r1(-sy)})">${ds.map((x) => `<path d="${x}" fill="${fill}"/>`).join('')}</g>${q.inner ?? ''}</g>`;
    return s;
  };

  const { cx, sy, wy, sw, ww, SL, SR, K, T, HL, HR, EL, ER, bang, tilt } = rig(o.pose, b, o.swingY);
  const skin = SKIN[o.skin] ?? SKIN[1], hair = HAIR[o.hair] ?? HAIR[0];
  const uni = K0.uni, pants = K0.pants, acc = K0.acc, cap = K0.cap;
  const glove = o.gloveColor ?? '#F4F4F2';
  const ru = [8.4, 9.4, 11.2][b], rf = [7.6, 8.4, 10][b], rh = [7.4, 8, 9][b];
  const L: Record<string, string> = {};

  // ── 다리(뒤에서) — 바지 · 뒷주머니 · 스타킹 · 신발 뒤꿈치(뒷발은 들려 바닥이 보임)
  {
    const lg = LEGS[o.pose];
    const hipL: Pt = [cx - 14, wy + 10], hipR: Pt = [cx + 14, wy + 10];
    let s = '';
    const pantsD = [`M${P(cx - ww, wy - 6)} L${P(cx + ww, wy - 6)} L${P(cx + ww + 2, wy + 14)} Q${P(cx, wy + 22)} ${P(cx - ww - 2, wy + 14)} Z`];
    let piping = '';
    for (const [hip, sd, side] of [[hipL, lg.L, -1], [hipR, lg.R, 1]] as [Pt, LegSide, number][]) {
      const knee: Pt = [cx + sd.k[0], sd.k[1]], foot: Pt = [cx + sd.f[0], sd.f[1]];
      s += part(capsule(knee[0], knee[1], 10.5 + b * 0.6, foot[0], foot[1] - 5, 8.4), acc, { sx: 3, sy: 2 });
      if (sd.pivot) { // 뒷발 — 발끝으로 돌아 뒤꿈치가 들리고 밑창이 보인다
        const sole = ell(foot[0] + side * 2, foot[1] + 2, 9.5, 8, -side * 18);
        s += part(sole, '#d9d9d6', { sx: 1.5, sy: 1.5, inner: `<path d="M${P(foot[0] - 5, foot[1] + 1)} l3,3 M${P(foot[0] + 1, foot[1] + 4)} l3,3 M${P(foot[0] + 6, foot[1] - 1)} l3,3" stroke="#7d7d7d" stroke-width="1.6" stroke-linecap="round"/><path d="${ell(foot[0] + side * 2, foot[1] - 4, 8, 3, -side * 18)}" fill="#232327"/>` });
      } else {
        const shoe = ell(foot[0] + side * 3, foot[1] + 1, 12, 7, side * 4);
        s += part(shoe, '#232327', { sx: 2, sy: 2, inner: `<path d="M${P(foot[0] + side * 3 - 5, foot[1] - 2)} q5,-3 10,0" stroke="#e9e9e9" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M${P(foot[0] - 10, foot[1] + 6)} L${P(foot[0] + 14, foot[1] + 6)}" stroke="#bdbdbd" stroke-width="2"/>` });
      }
      const pk: Pt = [knee[0] + (foot[0] - knee[0]) * 0.4, knee[1] + (foot[1] - knee[1]) * 0.4];
      pantsD.push(capsule(hip[0], hip[1], 15 + b * 1.2, knee[0], knee[1], 12.6 + b * 0.6), capsule(knee[0], knee[1], 12.6 + b * 0.6, pk[0], pk[1], 12.4 + b * 0.6));
      piping += `<path d="M${P(hip[0] + side * (13 + b), hip[1] - 2)} L${P(knee[0] + side * (11.5 + b * 0.6), knee[1])}" stroke="${acc}" stroke-width="2.4" fill="none"/>`;
      piping += `<path d="M${P(knee[0] - 7, knee[1] - 2)} q7,4 13,-1" stroke="${shade(pants, 0.72)}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;
    }
    if (K0.pin) piping += pinstripes(cx - 70, wy - 10, 140, 80, shade(pants, 0.8));
    // 뒷주머니 · 엉덩이 주름
    const pc = shade(pants, 0.7);
    for (const side of [-1, 1]) piping += `<path d="M${P(cx + side * 8, wy + 6)} L${P(cx + side * 21, wy + 5)} L${P(cx + side * 20, wy + 15)} Q${P(cx + side * 14, wy + 17)} ${P(cx + side * 8.5, wy + 15)} Z" fill="none" stroke="${pc}" stroke-width="1.4"/><circle cx="${r1(cx + side * 14.5)}" cy="${r1(wy + 8.5)}" r="1.1" fill="${pc}"/>`;
    piping += `<path d="M${P(cx, wy - 6)} L${P(cx, wy + 19)}" stroke="${pc}" stroke-width="1.3"/>`;
    s += part(pantsD, pants, { sx: 5, sy: 3, inner: piping });
    L.legs = s;
  }

  // ── 몸통(등) — 깃 · 줄무늬 · 등 이름(호) · 등번호(두 겹 테두리) · 벨트
  {
    const belly = b === 2 ? 7 : 1;
    const torso = `M${P(cx - 14, sy - 14)} C${P(cx - 24, sy - 12)} ${P(cx - sw + 3, sy - 10)} ${P(cx - sw - 1, sy)} C${P(cx - sw - 3, sy + 22)} ${P(cx - ww - belly, sy + 40)} ${P(cx - ww, wy)} L${P(cx + ww, wy)} C${P(cx + ww + belly, sy + 40)} ${P(cx + sw + 3, sy + 22)} ${P(cx + sw + 1, sy)} C${P(cx + sw - 3, sy - 10)} ${P(cx + 24, sy - 12)} ${P(cx + 14, sy - 14)} Q${P(cx, sy - 8)} ${P(cx - 14, sy - 14)} Z`;
    let inner = K0.pin ? pinstripes(cx - 50, sy - 20, 100, 80, shade(uni, 0.8)) : '';
    inner += `<path d="M${P(cx - 14, sy - 14)} Q${P(cx, sy - 8)} ${P(cx + 14, sy - 14)}" fill="none" stroke="${acc}" stroke-width="4"/>`;
    // 견갑 주름 · 옆구리 그늘
    const fc = shade(uni, 0.74);
    inner += `<path d="M${P(cx - sw + 9, sy + 4)} q9,4 12,13 M${P(cx + sw - 9, sy + 4)} q-9,4 -12,13 M${P(cx - ww + 5, wy - 13)} q7,3 12,-1 M${P(cx + ww - 5, wy - 13)} q-7,3 -12,-1" stroke="${fc}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`;
    // 등 이름 · 등번호 — 준비 자세는 몸이 닫혀 등이 비스듬히(왼쪽으로 좁게)
    const twist = o.pose === 'load' ? `translate(${r1(cx - 7)},0) scale(.84,1) translate(${-cx},0)` : '';
    const nid = id();
    const trim = lum(uni) > 0.6 ? '#ffffff' : mix(uni, '#ffffff', 0.55);
    const name = o.name.length > 4 ? o.name.slice(0, 4) : o.name;
    let tag = `<path id="${nid}" d="M${P(cx - 32, sy + 15)} Q${P(cx, sy + 1)} ${P(cx + 32, sy + 15)}" fill="none"/>`;
    tag += `<text font-family="'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif" font-weight="900" font-size="${b === 0 ? 10 : 11}" letter-spacing="1.2" fill="${acc}" stroke="${INK}" stroke-width=".6" paint-order="stroke"><textPath href="#${nid}" xlink:href="#${nid}" startOffset="50%" text-anchor="middle">${esc(name)}</textPath></text>`;
    const ny = sy + 49, fs = K0.num.length > 1 ? 33 : 36;
    const num = (stroke: string, w: number, fill: string) =>
      `<text x="${cx}" y="${ny}" font-family="'Arial Black',Arial,'Helvetica Neue',sans-serif" font-weight="900" font-size="${fs}" letter-spacing="-1" text-anchor="middle" fill="${fill}" stroke="${stroke}" stroke-width="${w}" stroke-linejoin="round">${esc(K0.num)}</text>`;
    tag += num(INK, 5.4, INK) + num(trim, 2.6, acc) + num('none', 0, acc);
    inner += o.mirror ? `<g transform="${twist}"><g transform="matrix(-1,0,0,1,${2 * cx},0)">${tag}</g></g>` : `<g transform="${twist}">${tag}</g>`;
    let s = part(torso, uni, { sx: 6, sy: 4, inner });
    s += part(`M${P(cx - ww - 1, wy - 8)} L${P(cx + ww + 1, wy - 8)} L${P(cx + ww + 1, wy)} L${P(cx - ww - 1, wy)} Z`, '#2a2a2e', { sx: 0, sy: 2, w: 2,
      inner: [-ww + 7, -9, 9, ww - 7].map((x) => `<rect x="${r1(cx + x - 2)}" y="${wy - 9}" width="4" height="10" rx="1" fill="${shade(pants, 0.9)}" stroke="${INK}" stroke-width=".8"/>`).join('') });
    L.torso = s;
  }

  // ── 팔(소매 · 아래팔 · 손목 밴드)
  const arm = (S: Pt, E: Pt, H: Pt) => {
    let s = part(capsule(S[0], S[1], ru, E[0], E[1], ru * 0.92), acc, { sx: 3, sy: 3 });
    const ul = Math.hypot(E[0] - S[0], E[1] - S[1]) || 1, ux = (E[0] - S[0]) / ul, uy = (E[1] - S[1]) / ul;
    const M: Pt = [S[0] + (E[0] - S[0]) * 0.6, S[1] + (E[1] - S[1]) * 0.6];
    const tc: Pt = [M[0] - ux * 2.5, M[1] - uy * 2.5];
    const trim = `<path d="M${P(tc[0] - uy * 24, tc[1] + ux * 24)} L${P(tc[0] + uy * 24, tc[1] - ux * 24)}" stroke="${acc}" stroke-width="3.4"/>`;
    s += part(capsule(S[0], S[1], ru + 3.6, M[0], M[1], ru + 2.9), uni, { sx: 4, sy: 3, inner: trim });
    s += part(capsule(E[0], E[1], rf, H[0], H[1], rf * 0.82), acc, { sx: 3, sy: 3 });
    if (o.band) {
      const fl = Math.hypot(H[0] - E[0], H[1] - E[1]) || 1, fx = (H[0] - E[0]) / fl, fy = (H[1] - E[1]) / fl;
      s += part(capsule(H[0] - fx * 11, H[1] - fy * 11, rf * 0.92, H[0] - fx * 5, H[1] - fy * 5, rf * 0.9), o.bandColor, { sx: 1.5, sy: 1.5, w: 2 });
    }
    return s;
  };
  L.armL = arm(SL, EL, HL);
  L.armR = arm(SR, ER, HR);
  // ── 장갑 낀 주먹 (방망이 쥔 손)
  const fist = (x: number, y: number, ang: number) => {
    const a = (ang * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
    let lines = '';
    for (const t of [-0.5, 0, 0.5]) {
      const px = x + ux * t * rh, py = y + uy * t * rh;
      lines += `M${P(px + nx * rh * 0.1, py + ny * rh * 0.1)} L${P(px + nx * rh * 0.85, py + ny * rh * 0.85)} `;
    }
    return part(ell(x, y, rh * 1.1, rh * 1.18, ang), glove, { sx: 2.5, sy: 2.5, w: 2.4, inner: `<path d="${lines}" stroke="${shade(glove, 0.55)}" stroke-width="1.5" stroke-linecap="round" fill="none"/>` });
  };
  L.handL = fist(HL[0], HL[1], bang);
  L.handR = fist(HR[0], HR[1], bang);
  // ── 방망이
  {
    const dx = T[0] - K[0], dy2 = T[1] - K[1], Lb = Math.hypot(dx, dy2), nx = -dy2 / Lb, ny = dx / Lb;
    const lit = nx + ny < 0 ? 1 : -1;
    const at = (s0: number, off: number) => P(K[0] + dx * s0 + nx * off * lit, K[1] + dy2 * s0 + ny * off * lit);
    const bc = o.batColor;
    let inner = `<path d="M${at(0.5, 2.2)} L${at(0.93, 4.4)}" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity="${lum(bc) > 0.5 ? 0.55 : 0.32}"/>`;
    inner += `<path d="M${at(0.6, -9)} L${at(0.6, 9)} M${at(0.64, -9)} L${at(0.64, 9)}" stroke="${shade(bc, 0.6)}" stroke-width="1.2"/>`;
    let s = part(batPath(K, T), bc, { sx: -nx * lit * 2.6, sy: -ny * lit * 2.6, w: 2.4, inner });
    s += part(capsule(K[0] + dx * 0.03, K[1] + dy2 * 0.03, 3.9, K[0] + dx * 0.25, K[1] + dy2 * 0.25, 4.1), '#2b2b30', { sx: 0, sy: 0, w: 1.8 });
    s += part(ell(K[0] + (dx / Lb) * 1.2, K[1] + (dy2 / Lb) * 1.2, 5.6, 5.6), bc, { sx: 1.5, sy: 1.5, w: 2.2 });
    L.bat = s;
  }

  // ── 머리(뒤통수 · 목 · 오른쪽 귀 · 헬멧 뒤 · 귀 덮개)
  {
    const hy = 86, H0 = hy;
    const hw = 44 + (b === 2 ? 3 : b === 0 ? -1 : 0);
    let s = '';
    // 목 — 헬멧 그늘이 진다
    s += part(`M${P(cx - 13, hy + 22)} L${P(cx + 13, hy + 22)} L${P(cx + 13, sy - 6)} L${P(cx - 13, sy - 6)} Z`, shade(skin, 0.92), { sx: 4, sy: 0,
      inner: `<path d="${ell(cx, hy + 26, 18, 9)}" fill="${shade(skin, 0.66)}"/><path d="M${P(cx - 4, hy + 34)} L${P(cx - 3, sy - 8)} M${P(cx + 4, hy + 34)} L${P(cx + 3, sy - 8)}" stroke="${shade(skin, 0.78)}" stroke-width="1.4"/>` });
    // 오른쪽 귀(그림 오른쪽) — 뒤에서 본 귓바퀴
    const ex = cx + hw - 3;
    s += part(ell(ex, hy + 14, 7.5, 10.5, 8), skin, { sx: 2, sy: 2, inner: `<path d="M${P(ex + 2, hy + 7)} Q${P(ex - 3, hy + 14)} ${P(ex + 1.5, hy + 21)}" stroke="${shade(skin, 0.62)}" stroke-width="1.7" fill="none"/>` });
    // 뒤통수 — 짧게 깎은 머리(아래로 갈수록 살빛이 비친다)
    const head = `M${P(cx - hw + 5, hy - 6)} C${P(cx - hw + 2, hy + 16)} ${P(cx - hw + 13, hy + 30)} ${P(cx - 16, hy + 32)} Q${P(cx, hy + 35)} ${P(cx + 16, hy + 32)} C${P(cx + hw - 13, hy + 30)} ${P(cx + hw - 2, hy + 16)} ${P(cx + hw - 5, hy - 6)} Z`;
    const gid = id();
    s += `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset=".35" stop-color="${hair}"/><stop offset=".8" stop-color="${mix(hair, skin, 0.42)}"/><stop offset="1" stop-color="${mix(hair, skin, 0.62)}"/></linearGradient></defs>`;
    s += part(head, hair, { sx: 4, sy: 3, k: 0.8, inner: `<path d="${head}" fill="url(#${gid})" transform="translate(-4,-3)"/>` });
    // 헬멧 — 뒤쪽은 뒤통수를 덮게 아래로 깊다 · 투수 쪽 귀 덮개 · 광택 · 통풍구
    const dome = `M${P(cx - 57, H0 + 2)} C${P(cx - 63, H0 - 56)} ${P(cx - 30, H0 - 75)} ${P(cx, H0 - 75)} C${P(cx + 30, H0 - 75)} ${P(cx + 63, H0 - 56)} ${P(cx + 57, H0 + 2)} Q${P(cx + 40, H0 + 12)} ${P(cx, H0 + 14)} Q${P(cx - 40, H0 + 12)} ${P(cx - 57, H0 + 2)} Z`;
    const flap = `M${P(cx - 32, H0 + 4)} C${P(cx - 58, H0 + 2)} ${P(cx - 68, H0 + 24)} ${P(cx - 60, H0 + 33)} C${P(cx - 52, H0 + 40)} ${P(cx - 38, H0 + 37)} ${P(cx - 33, H0 + 22)} Z`;
    const rim = shade(cap, 0.6);
    const gloss = `<path d="M${P(cx - 55, H0 - 2)} Q${P(cx - 40, H0 + 8)} ${P(cx, H0 + 10)} Q${P(cx + 40, H0 + 8)} ${P(cx + 55, H0 - 2)}" stroke="${rim}" stroke-width="5" fill="none" opacity=".75"/>`
      + `<path d="${ell(cx - 24, H0 - 46, 19, 9, -28)}" fill="#fff" opacity=".4"/><circle cx="${cx - 2}" cy="${r1(H0 - 62)}" r="3.4" fill="#fff" opacity=".55"/>`
      + `<path d="M${P(cx + 30, H0 - 66)} Q${P(cx + 56, H0 - 50)} ${P(cx + 59, H0 - 12)}" stroke="#fff" stroke-width="2.4" fill="none" opacity=".35" stroke-linecap="round"/>`
      + `<path d="${ell(cx - 13, H0 - 64, 5, 2.4, -12)}" fill="${shade(cap, 0.45)}"/><path d="${ell(cx + 13, H0 - 64, 5, 2.4, 12)}" fill="${shade(cap, 0.45)}"/>`
      + `<path d="${ell(cx - 57, H0 + 16, 3, 7, 10)}" fill="#fff" opacity=".28"/>`;
    s += part([dome, flap], cap, { sx: 7, sy: 6, k: 0.72, inner: gloss });
    L.head = s;
  }

  const order = o.pose === 'load'
    ? ['legs', 'armL', 'torso', 'head', 'armR', 'bat', 'handL', 'handR']
    : ['bat', 'armL', 'legs', 'torso', 'head', 'armR', 'handL', 'handR'];
  const upper = new Set(['bat', 'armL', 'torso', 'head', 'armR', 'handL', 'handR']);
  let body = '', run = '';
  const flush = () => { if (run) body += tilt ? `<g transform="rotate(${tilt} ${cx} ${wy})">${run}</g>` : run; run = ''; };
  for (const k of order) { if (upper.has(k)) run += L[k] || ''; else { flush(); body += L[k] || ''; } }
  flush();
  if (o.mirror) body = `<g transform="translate(240,0) scale(-1,1)">${body}</g>`;
  const shadow = `<ellipse cx="${cx}" cy="270" rx="66" ry="8.5" fill="#000" opacity=".3"/>`;
  return `${shadow}${body}`;
}

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** 완성 SVG 문자열 (BACK_VIEW 상자 — 좌타는 반대쪽으로 넓다) */
export function backSvgOf(o: SdBackOpts) {
  const v = o.mirror ? { ...BACK_VIEW, x: 240 - (BACK_VIEW.x + BACK_VIEW.w) } : BACK_VIEW;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${v.x} ${v.y} ${v.w} ${v.h}">${drawSdBack(o)}</svg>`;
}
