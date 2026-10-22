// 외모 미리보기 — 24명 격자 / ?zoom=번호 / ?mode=lineup|faces
// 번들: esbuild --bundle --format=esm → 데스크톱 디자인초안/캐릭터/preview-appearance.js (외모.html 이 읽음)

import { makeAppearance, makeKit, TEAMS, renderPortrait, renderFigure, standingPose } from '../index';
import type { PlayerSpec, Appearance, Kit, TeamColors } from '../index';

interface Row { spec: PlayerSpec; team: TeamColors; set: 'home' | 'away' }

const T = (id: string) => TEAMS.find((t) => t.id === id)!;
const R = (id: string, pos: PlayerSpec['pos'], h: number, w: number, th: 'R' | 'L', bt: 'R' | 'L' | 'S', origin: PlayerSpec['origin'], age: number, number: number, team: string, set: 'home' | 'away'): Row => ({
  spec: { id, pos, heightCm: h, weightKg: w, throws: th, bats: bt, origin, age, number },
  team: T(team), set,
});

const ROSTER: Row[] = [
  R('p01', 'P', 191, 92, 'R', 'R', 'KR', 29, 47, 'comets', 'home'),
  R('p02', 'C', 179, 96, 'R', 'R', 'KR', 31, 22, 'comets', 'home'),
  R('p03', 'SS', 176, 72, 'R', 'R', 'KR', 24, 6, 'comets', 'home'),
  R('p04', '1B', 189, 114, 'L', 'L', 'US', 30, 44, 'comets', 'home'),
  R('p05', 'CF', 173, 69, 'R', 'L', 'KR', 26, 1, 'comets', 'home'),
  R('p06', 'P', 184, 97, 'L', 'L', 'KR', 34, 29, 'comets', 'home'),
  R('p07', 'P', 196, 104, 'R', 'R', 'LATAM', 27, 55, 'foxes', 'away'),
  R('p08', '2B', 169, 67, 'R', 'R', 'KR', 23, 4, 'foxes', 'away'),
  R('p09', '3B', 182, 91, 'R', 'R', 'KR', 28, 13, 'foxes', 'away'),
  R('p10', 'RF', 185, 93, 'L', 'L', 'KR', 27, 25, 'foxes', 'away'),
  R('p11', 'C', 177, 89, 'R', 'R', 'KR', 25, 12, 'foxes', 'away'),
  R('p12', 'DH', 183, 121, 'R', 'R', 'KR', 33, 50, 'foxes', 'away'),
  R('p13', 'P', 189, 84, 'R', 'R', 'KR', 22, 11, 'owls', 'home'),
  R('p14', 'LF', 180, 85, 'L', 'R', 'USB', 29, 8, 'owls', 'home'),
  R('p15', 'SS', 178, 76, 'R', 'S', 'KR', 30, 7, 'owls', 'home'),
  R('p16', 'P', 186, 101, 'R', 'R', 'US', 31, 38, 'owls', 'home'),
  R('p17', '1B', 186, 105, 'L', 'L', 'KR', 29, 36, 'owls', 'home'),
  R('p18', 'C', 181, 99, 'R', 'R', 'KR', 35, 27, 'owls', 'home'),
  R('p19', 'P', 182, 80, 'R', 'R', 'KR', 26, 19, 'waves', 'away'),
  R('p20', 'CF', 180, 77, 'R', 'L', 'LATAM', 25, 24, 'waves', 'away'),
  R('p21', '3B', 184, 96, 'R', 'R', 'KR', 32, 3, 'waves', 'away'),
  R('p22', 'P', 193, 97, 'L', 'L', 'KR', 28, 61, 'waves', 'away'),
  R('p23', '2B', 172, 73, 'R', 'L', 'KR', 27, 2, 'waves', 'away'),
  R('p24', 'RF', 188, 102, 'R', 'R', 'KR', 26, 34, 'waves', 'away'),
];

const POS_KO: Record<string, string> = { P: '투수', C: '포수', '1B': '1루수', '2B': '2루수', '3B': '3루수', SS: '유격수', LF: '좌익수', CF: '중견수', RF: '우익수', DH: '지명타자' };
const SHAPE_KO: Record<string, string> = { round: '둥근 얼굴', square: '각진 얼굴', long: '긴 얼굴', oval: '갸름한 얼굴' };
const HAIR_KO: Record<string, string> = { buzz: '버즈컷', crew: '짧은 스포츠', twoblock: '투블럭', textured: '볼륨 숏컷', flow: '장발(흘림)', tied: '장발 묶음', perm: '파마', curls: '곱슬', locs: '드레드' };
const BEARD_KO: Record<string, string> = { none: '수염 없음', stubble: '수염 자국', mustache: '콧수염', goatee: '염소+콧수염', chin: '턱 끝 수염', beard: '짧은 턱수염', full: '덥수룩한 수염', sideburns: '긴 구레나룻', chinstrap: '턱선 수염' };
const EYEW_KO: Record<string, string> = { none: '', glasses: '안경', shades: '선글라스', shadesUp: '챙 위 선글라스' };
const EXPR_KO: Record<string, string> = { neutral: '무표정', determined: '결연', smile: '미소' };
const LID_KO: Record<string, string> = { mono: '홑꺼풀', inner: '속쌍', double: '쌍꺼풀' };
const BUILD_KO: Record<string, string> = { lean: '마른 체형', athletic: '탄탄', power: '파워형', heavy: '거구', lanky: '장신 호리' };
const ORIGIN_KO: Record<string, string> = { KR: '한국', JP: '일본', TW: '대만', US: '미국', USB: '미국', LATAM: '중남미', AU: '호주' };
const hand = (s: PlayerSpec) => `${s.throws === 'R' ? '우투' : '좌투'}${s.bats === 'R' ? '우타' : s.bats === 'L' ? '좌타' : '양타'}`;

function tags(ap: Appearance, kit: Kit): string[] {
  const t = [SHAPE_KO[ap.face.shape], HAIR_KO[ap.hair.style], BEARD_KO[ap.facialHair.kind], LID_KO[ap.face.lid], EXPR_KO[ap.expression], BUILD_KO[ap.build.type]];
  if (EYEW_KO[ap.eyewear]) t.push(EYEW_KO[ap.eyewear]);
  if (kit.eyeBlack) t.push('아이블랙');
  if (kit.necklace) t.push('목걸이');
  if (kit.armSleeve) t.push('팔 토시');
  t.push(kit.socks === 'high' ? '양말 올림' : '긴 바지');
  return t.filter(Boolean);
}

const q = new URLSearchParams(location.search);
const zoom = q.get('zoom');
const mode = q.get('mode') ?? 'grid';
const root = document.getElementById('app')!;

function build(row: Row) {
  const ap = makeAppearance(row.spec);
  const kit = makeKit(row.spec, ap, row.team, row.set);
  return { ap, kit };
}

function figureBox(svgInner: string, box: [number, number, number, number], w: number, h: number, pad = 4): string {
  const [x0, y0, x1, y1] = box;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0 - pad} ${y0 - pad} ${x1 - x0 + pad * 2} ${y1 - y0 + pad * 2}" width="${w}" height="${h}" preserveAspectRatio="xMidYMax meet">${svgInner}</svg>`;
}

function label(row: Row, ap: Appearance, kit: Kit, big = false): string {
  const s = row.spec;
  return `<div class="meta${big ? ' big' : ''}"><div class="l1"><b>#${kit.number}</b> ${POS_KO[s.pos]} <span>${hand(s)}</span></div>
  <div class="l2">${s.heightCm}cm · ${s.weightKg}kg · ${ORIGIN_KO[ap.origin]} · ${s.age}세 · ${row.team.name} ${row.set === 'home' ? '홈' : '원정'}</div>
  <div class="tags">${tags(ap, kit).map((t) => `<i>${t}</i>`).join('')}</div></div>`;
}

if (zoom !== null) {
  const i = Math.max(0, Math.min(ROSTER.length - 1, parseInt(zoom, 10) || 0));
  const row = ROSTER[i];
  const { ap, kit } = build(row);
  const gear = (q.get('gear') as 'cap' | 'helmet' | 'none' | null) ?? 'cap';
  const portrait = renderPortrait(ap, kit, { width: 600, height: 800, gear });
  const pose = standingPose(ap);
  if (q.get('flip')) pose.faceLeft = true;
  if (q.get('yaw')) { const y = parseFloat(q.get('yaw')!); pose.hipYaw = y + 8; pose.chestYaw = y; pose.headYaw = y + 6; }
  const fig = renderFigure(ap, kit, pose, { detail: 1 });
  const only = q.get('only');
  document.body.classList.add('zoom');
  root.innerHTML = `<div class="zoomwrap">
    ${only === 'figure' ? '' : `<div class="zp">${portrait}</div>`}
    ${only === 'portrait' ? '' : `<div class="zf">${figureBox(fig.svg, fig.box, only === 'figure' ? 900 : 560, only === 'figure' ? 1150 : 800)}</div>`}
    ${only ? '' : `<div class="zm">${label(row, ap, kit, true)}<pre>${JSON.stringify({ face: ap.face, hair: ap.hair, facialHair: ap.facialHair, eyewear: ap.eyewear, build: { type: ap.build.type, fat: +ap.build.fat.toFixed(2), muscle: +ap.build.muscle.toFixed(2) } }, (k, v) => (typeof v === 'number' ? +v.toFixed(2) : v), 1).slice(0, 2400)}</pre></div>`}
  </div>`;
} else if (mode === 'lineup') {
  // 같은 축척으로 한 줄에 — 실루엣 구분 점검
  const items = ROSTER.map((row) => { const { ap, kit } = build(row); return { row, ap, kit, f: renderFigure(ap, kit, standingPose(ap), { detail: 0.7 }) }; });
  const scale = 1.7;
  root.innerHTML = `<div class="lineup">${items.map(({ row, ap, kit, f }) => {
    const [x0, , x1] = f.box;
    const y0 = -215, y1 = 4;
    return `<div class="li"><svg viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}" width="${(x1 - x0) * scale}" height="${(y1 - y0) * scale}">${f.svg}</svg><div class="ln">#${kit.number} ${POS_KO[row.spec.pos]}<br>${row.spec.heightCm}/${row.spec.weightKg}</div></div>`;
  }).join('')}</div>`;
} else if (mode === 'faces') {
  root.innerHTML = `<div class="faces">${ROSTER.map((row) => { const { ap, kit } = build(row); return `<div class="fc">${renderPortrait(ap, kit, { width: 240, height: 320 })}</div>`; }).join('')}</div>`;
} else {
  root.innerHTML = `<header><h1>캐릭터 외모 초안</h1><p>가상 선수 24명 · 구단 4곳(홈/원정) · 시드 고정 — 같은 id 는 항상 같은 얼굴. 칸을 누르면 크게 봅니다.</p></header>
  <div class="grid">${ROSTER.map((row, i) => {
    const { ap, kit } = build(row);
    const portrait = renderPortrait(ap, kit, { width: 168, height: 224, detail: 0.85 });
    const f = renderFigure(ap, kit, standingPose(ap), { detail: 0.75 });
    return `<a class="cell" href="?zoom=${i}"><div class="pics"><div class="card">${portrait}</div><div class="fig">${figureBox(f.svg, f.box, 132, 224, 2)}</div></div>${label(row, ap, kit)}</a>`;
  }).join('')}</div>`;
}
