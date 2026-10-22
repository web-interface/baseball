// 폼 미리보기 — 투수 8명·타자 8명 반복 재생 + 수비·주루·번트
//   ?zoom=p3      한 명 크게 (60fps) + 폼 변수표 + 엔진 효과
//   ?strip=b2&n=10&from=0.8&to=1.6&w=320&h=400   프레임 띠 (점검용)
//   ?t=1.2 / ?ev=release&dt=0.02                  모두 같은 시각에 멈춤 (스크린숏용)
//   ?slow=1        0.5배속
// 번들: esbuild --bundle --format=esm → 데스크톱 디자인초안/캐릭터/preview-forms.js (폼.html 이 읽음)

import { makeAppearance, makeKit, TEAMS } from '../index';
import type { PlayerSpec, TeamColors, Appearance, Kit } from '../index';
import { makePitchForm, pitchFormName, pitchFormTags, makeBatForm, batFormName, batFormTags, SLOT_KO, STANCE_KO, KICK_KO, PITCH_EFFECTS, BAT_EFFECTS } from '../forms';
import type { PitchPick, BatPick, PitchForm, BatForm, FormEffect } from '../forms';
import { pitchMotion } from '../motionPitch';
import { batMotion, buntMotion } from '../motionBat';
import { catcherMotion, infieldMotion, outfieldMotion, runMotion } from '../motionField';
import { LiveFigure } from '../live';
import { Stage, motionBox } from '../stage';
import type { Motion } from '../motion';

type Kind = 'pitch' | 'bat' | 'bunt' | 'catcher' | 'infield' | 'outfield' | 'run';
interface Row { key: string; kind: Kind; spec: PlayerSpec; team: TeamColors; set: 'home' | 'away'; pp?: PitchPick; bp?: BatPick; speed?: number }

const T = (id: string) => TEAMS.find((t) => t.id === id)!;
const S = (id: string, pos: PlayerSpec['pos'], h: number, w: number, th: 'R' | 'L', bt: 'R' | 'L' | 'S', origin: PlayerSpec['origin'], age: number, number: number): PlayerSpec =>
  ({ id, pos, heightCm: h, weightKg: w, throws: th, bats: bt, origin, age, number });

// 미리보기용 가상 선수 — 폼 범주는 보여 주려고 고정, 연속 값(각도·높이·보폭·템포…)은 선수 id 시드에서
const PITCHERS: Row[] = [
  { key: 'p1', kind: 'pitch', spec: S('f-p01', 'P', 191, 92, 'R', 'R', 'KR', 29, 47), team: T('comets'), set: 'home', pp: { armSlot: 'threeQuarter', legLift: 'high', delivery: 'windup', hideBall: 'normal', finish: 'balanced' } },
  { key: 'p2', kind: 'pitch', spec: S('f-p02', 'P', 181, 80, 'R', 'R', 'KR', 31, 21), team: T('owls'), set: 'home', pp: { armSlot: 'under', legLift: 'normal', delivery: 'set', tempo: 'slow', finish: 'balanced' } },
  { key: 'p3', kind: 'pitch', spec: S('f-p03', 'P', 184, 88, 'R', 'R', 'KR', 26, 17), team: T('foxes'), set: 'away', pp: { armSlot: 'side', legLift: 'slide', delivery: 'set', tempo: 'quick', crossfire: true } },
  { key: 'p4', kind: 'pitch', spec: S('f-p04', 'P', 196, 104, 'R', 'R', 'US', 28, 55), team: T('waves'), set: 'away', pp: { armSlot: 'over', legLift: 'high', delivery: 'windup', overhead: true, finish: 'fallOff' } },
  { key: 'p5', kind: 'pitch', spec: S('f-p05', 'P', 186, 86, 'L', 'L', 'KR', 24, 29), team: T('comets'), set: 'home', pp: { armSlot: 'threeQuarter', legLift: 'normal', delivery: 'set', hideBall: 'good', armAction: 'short', setHands: 'chest' } },
  { key: 'p6', kind: 'pitch', spec: S('f-p06', 'P', 183, 95, 'L', 'L', 'LATAM', 30, 61), team: T('foxes'), set: 'away', pp: { armSlot: 'side', legLift: 'normal', delivery: 'windup', crossfire: true, finish: 'hop' } },
  { key: 'p7', kind: 'pitch', spec: S('f-p07', 'P', 188, 99, 'R', 'R', 'LATAM', 27, 38), team: T('waves'), set: 'away', pp: { armSlot: 'threeQuarter', legLift: 'slide', delivery: 'set', tempo: 'quick', finish: 'fallOff', hideBall: 'exposed' } },
  { key: 'p8', kind: 'pitch', spec: S('f-p08', 'P', 190, 90, 'R', 'R', 'JP', 25, 18), team: T('owls'), set: 'home', pp: { armSlot: 'over', legLift: 'high', delivery: 'set', tempo: 'slow', setHands: 'high' } },
];

const BATTERS: Row[] = [
  { key: 'b1', kind: 'bat', spec: S('f-b01', 'SS', 178, 76, 'R', 'R', 'KR', 27, 6), team: T('comets'), set: 'home', bp: { stance: 'open', legKick: 'toeTap', hands: 'mid', plane: 'level', finish: 'twoHands', waggle: 'small' } },
  { key: 'b2', kind: 'bat', spec: S('f-b02', '1B', 190, 112, 'R', 'R', 'US', 30, 44), team: T('waves'), set: 'away', bp: { stance: 'square', legKick: 'big', hands: 'high', plane: 'up', finish: 'oneHand', waggle: 'none' } },
  { key: 'b3', kind: 'bat', spec: S('f-b03', 'CF', 174, 70, 'L', 'L', 'KR', 25, 1), team: T('foxes'), set: 'away', bp: { stance: 'closed', legKick: 'noStride', hands: 'low', crouch: 'crouch', plane: 'down', finish: 'twoHands' } },
  { key: 'b4', kind: 'bat', spec: S('f-b04', 'RF', 185, 93, 'L', 'L', 'KR', 28, 25), team: T('owls'), set: 'home', bp: { stance: 'square', legKick: 'small', hands: 'high', wrap: true, waggle: 'big', plane: 'level', finish: 'oneHand' } },
  { key: 'b5', kind: 'bat', spec: S('f-b05', 'LF', 183, 98, 'R', 'R', 'LATAM', 29, 23), team: T('foxes'), set: 'away', bp: { stance: 'open', legKick: 'big', hands: 'mid', plane: 'up', finish: 'oneHand', waggle: 'small', crouch: 'upright' } },
  { key: 'b6', kind: 'bat', spec: S('f-b06', '2B', 175, 74, 'R', 'S', 'KR', 26, 4), team: T('comets'), set: 'home', bp: { vsHand: 'R', stance: 'square', legKick: 'toeTap', hands: 'low', plane: 'level', finish: 'twoHands', crouch: 'normal' } },
  { key: 'b7', kind: 'bat', spec: S('f-b07', 'C', 181, 96, 'R', 'R', 'KR', 31, 22), team: T('waves'), set: 'away', bp: { stance: 'closed', legKick: 'small', hands: 'mid', hitch: true, plane: 'level', finish: 'twoHands', crouch: 'normal' } },
  { key: 'b8', kind: 'bat', spec: S('f-b08', 'DH', 187, 104, 'R', 'L', 'JP', 33, 50), team: T('owls'), set: 'home', bp: { stance: 'square', legKick: 'noStride', hands: 'high', crouch: 'upright', plane: 'up', finish: 'oneHand', waggle: 'big' } },
];

const EXTRAS: Row[] = [
  { key: 'x1', kind: 'catcher', spec: S('f-c01', 'C', 180, 95, 'R', 'R', 'KR', 30, 27), team: T('comets'), set: 'home' },
  { key: 'x2', kind: 'infield', spec: S('f-i01', 'SS', 177, 74, 'R', 'R', 'KR', 26, 7), team: T('owls'), set: 'home' },
  { key: 'x3', kind: 'outfield', spec: S('f-o01', 'CF', 183, 82, 'R', 'L', 'LATAM', 27, 24), team: T('waves'), set: 'away' },
  { key: 'x4', kind: 'run', spec: S('f-r01', 'CF', 176, 71, 'R', 'L', 'KR', 23, 2), team: T('foxes'), set: 'away', speed: 0.9 },
  { key: 'x5', kind: 'run', spec: S('f-r02', '1B', 188, 113, 'L', 'L', 'US', 31, 33), team: T('waves'), set: 'away', speed: 0.15 },
  { key: 'x6', kind: 'bunt', spec: S('f-b09', '2B', 172, 70, 'R', 'R', 'KR', 24, 9), team: T('owls'), set: 'home', bp: { stance: 'square', legKick: 'small' } },
];

const ALL = [...PITCHERS, ...BATTERS, ...EXTRAS];
const POS_KO: Record<string, string> = { P: '투수', C: '포수', '1B': '1루수', '2B': '2루수', '3B': '3루수', SS: '유격수', LF: '좌익수', CF: '중견수', RF: '우익수', DH: '지명타자' };
const ORIGIN_KO: Record<string, string> = { KR: '한국', JP: '일본', TW: '대만', US: '미국', USB: '미국', LATAM: '중남미', AU: '호주' };

const q = new URLSearchParams(location.search);
const root = document.getElementById('app')!;
const detail = q.get('zoom') || q.get('strip') ? 1 : 0.8;

interface Built { row: Row; ap: Appearance; kit: Kit; motion: Motion; fig: LiveFigure; name: string; tags: string[]; meta: string; pf?: PitchForm; bf?: BatForm }

function build(row: Row): Built {
  const ap = makeAppearance(row.spec);
  const kit = makeKit(row.spec, ap, row.team, row.set);
  const s = row.spec;
  const meta = `#${kit.number} ${POS_KO[s.pos]} · ${s.throws === 'R' ? '우투' : '좌투'}${s.bats === 'R' ? '우타' : s.bats === 'L' ? '좌타' : '양타'} · ${s.heightCm}cm ${s.weightKg}kg · ${ORIGIN_KO[s.origin ?? 'KR']}`;
  if (row.kind === 'pitch') {
    const pf = makePitchForm(s, row.pp);
    const motion = pitchMotion(ap, pf);
    const fig = new LiveFigure(ap, kit, { gear: 'cap', headYaw: motion.headYaw, mirror: pf.throws === 'L', pinstripe: true, detail });
    return { row, ap, kit, motion, fig, name: pitchFormName(pf), tags: pitchFormTags(pf), meta, pf };
  }
  if (row.kind === 'catcher' || row.kind === 'infield' || row.kind === 'outfield' || row.kind === 'run') {
    const motion = row.kind === 'catcher' ? catcherMotion(ap) : row.kind === 'infield' ? infieldMotion(ap) : row.kind === 'outfield' ? outfieldMotion(ap) : runMotion(ap, row.speed ?? 0.5);
    const fig = new LiveFigure(ap, kit, { gear: motion.gear, headYaw: motion.headYaw, mirror: s.throws === 'L', mask: motion.mask, catcherGear: motion.catcherGear, view: motion.view, pinstripe: true, detail });
    const NAME: Record<string, string> = { catcher: '포수 · 2루 송구', infield: '내야 · 준비 → 땅볼', outfield: '외야 · 뜬공 캐치', run: (row.speed ?? 0.5) > 0.6 ? '주루 · 빠른 발' : '주루 · 거구' };
    const tags = row.kind === 'run' ? [motion.phases[0].label.replace('달리기 · ', '')] : motion.phases.map((x) => x.label);
    return { row, ap, kit, motion, fig, name: NAME[row.kind], tags, meta };
  }
  const bf = makeBatForm(s, row.bp);
  const motion = row.kind === 'bunt' ? buntMotion(ap, bf) : batMotion(ap, bf);
  const fig = new LiveFigure(ap, kit, { gear: 'helmet', headYaw: motion.headYaw, mirror: bf.bats === 'L', view: motion.view, pinstripe: true, detail });
  const name = row.kind === 'bunt' ? '번트 · 피벗' : batFormName(bf);
  return { row, ap, kit, motion, fig, name, tags: row.kind === 'bunt' ? [bf.bats === 'L' ? '좌타' : '우타', '배트 수평', '위 손은 배럴 쪽'] : batFormTags(bf), meta, bf: row.kind === 'bat' ? bf : undefined };
}

const svgOf = (inner: string, box: [number, number, number, number], w: number, h: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box[0].toFixed(1)} ${box[1].toFixed(1)} ${(box[2] - box[0]).toFixed(1)} ${(box[3] - box[1]).toFixed(1)}" width="${w}" height="${h}" preserveAspectRatio="xMidYMax meet" role="img">${inner}</svg>`;

/** 같은 축척: 한 묶음 안 모든 칸이 같은 cm→px 비율 (키·체격 차이가 그대로 보이게) */
function unifyBoxes(boxes: [number, number, number, number][]): [number, number, number, number][] {
  const W = Math.max(...boxes.map((b) => b[2] - b[0]));
  const H = Math.max(...boxes.map((b) => b[3] - b[1]));
  return boxes.map((b) => { const cx = (b[0] + b[2]) / 2; return [cx - W / 2, b[3] - H, cx + W / 2, b[3]]; });
}

/** 바닥 띠 (발이 서는 자리) + 달리기면 흐르는 바닥 표시 */
function groundOf(bx: [number, number, number, number], scroll?: number): string {
  const w = bx[2] - bx[0];
  let g = `<rect x="${(bx[0] - 2).toFixed(1)}" y="0" width="${(w + 4).toFixed(1)}" height="${(bx[3] + 2).toFixed(1)}" fill="#cbc4b6"/><rect x="${(bx[0] - 2).toFixed(1)}" y="0" width="${(w + 4).toFixed(1)}" height="0.8" fill="#b9b1a2"/>`;
  if (scroll) g += `<g class="gs">${Array.from({ length: Math.ceil(w / 40) + 3 }, (_, k) => `<rect x="${(bx[0] + k * 40).toFixed(1)}" y="2.2" width="16" height="1.2" rx="0.6" fill="#a59c8b"/>`).join('')}</g>`;
  return g;
}

const strip = q.get('strip');
if (strip) {
  const row = ALL.find((r) => r.key === strip) ?? ALL[0];
  const B = build(row);
  const m = B.motion;
  const n = parseInt(q.get('n') ?? '12', 10);
  const t0 = parseFloat(q.get('from') ?? '0'), t1 = parseFloat(q.get('to') ?? String(m.dur));
  const box = motionBox(B.fig, m);
  const cw = parseInt(q.get('w') ?? '260', 10), ch = parseInt(q.get('h') ?? '300', 10);
  const cells: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? t0 + ((t1 - t0) * i) / (n - 1) : t0;
    const p = m.sample(t);
    const trail = m.smear(t) > 0 ? [1, 2, 3, 4].map((k) => m.sample(Math.max(0, t - k / 60))) : undefined;
    const fr = B.fig.svgFrame(p, trail);
    let ph = '';
    for (const x of m.phases) if (t >= x.t - 1e-6) ph = x.label;
    cells.push(`<div class="sc"><div class="st">${svgOf(groundOf(box) + fr.g, box, cw, ch)}</div><div class="sl">${t.toFixed(2)}s · ${ph}</div></div>`);
  }
  document.body.classList.add('stripmode');
  document.querySelector('.top')?.remove();
  root.innerHTML = `<div class="strip-h">${B.name} — ${B.tags.join(' · ')}</div><div class="strip">${cells.join('')}</div>`;
} else {
  const zoom = q.get('zoom');
  const sections: { title: string; sub: string; rows: Row[] }[] = zoom
    ? [{ title: '', sub: '', rows: ALL.filter((r) => r.key === zoom) }]
    : [
      { title: '투수', sub: '팔 각도 · 다리 들기 · 템포 · 공 숨김 · 보폭 · 피니시', rows: PITCHERS },
      { title: '타자', sub: '스탠스 · 타이밍 동작 · 손 높이 · 배트 각도 · 스윙 궤도 · 팔로스루', rows: BATTERS },
      { title: '수비 · 주루 · 번트', sub: '포수 송구, 내야 준비, 외야 캐치, 체격에 따른 보폭', rows: EXTRAS },
    ];
  const all: { B: Built; id: string }[] = [];
  let html = zoom ? '' : `<p class="intro">같은 동작이라도 사람마다 다르게 보이도록, 선수 id 로 정해지는 <b>폼 변수</b>(팔 각도·다리 높이·템포·보폭·스탠스·타이밍 동작 …)가 키프레임을 바꿉니다. 체격(키·몸무게)도 관절 길이와 무게중심을 바꿉니다. 카드를 누르면 크게(60fps) 보고, 폼 변수와 경기 엔진 효과를 확인할 수 있습니다.</p>`;
  for (const sec of sections) {
    const built = sec.rows.map(build);
    const boxes = unifyBoxes(built.map((B) => motionBox(B.fig, B.motion)));
    html += `<section class="sec">${sec.title ? `<div class="sec-h"><h2>${sec.title}</h2><p>${sec.sub}</p></div>` : ''}<div class="grid${zoom ? ' one' : ''}">`;
    built.forEach((B, i) => {
      const id = `c${all.length}`;
      all.push({ B, id });
      const bx = boxes[i];
      const tag = zoom ? 'figure' : 'a';
      html += `<${tag} class="cell" id="${id}"${zoom ? '' : ` href="?zoom=${B.row.key}"`}><div class="stage">${svgOf(groundOf(bx, B.motion.scroll) + B.fig.markup, bx, zoom ? 900 : 300, zoom ? 700 : 250)}<span class="ph"></span></div>` +
        `<figcaption><b>${B.name}</b><div class="meta">${B.meta}</div><div class="tags">${B.tags.map((t) => `<i>${t}</i>`).join('')}</div></figcaption></${tag}>`;
    });
    html += '</div></section>';
  }
  if (zoom && all[0]) html += zoomInfo(all[0].B);
  html += `<p class="note">그림은 모두 코드(SVG)로 그린다 · 시드 고정(같은 선수 = 같은 폼) · 화면 밖 그림은 멈추고, 느린 기기에서는 그림마다 프레임을 나눠 그린다${matchMedia('(prefers-reduced-motion: reduce)').matches ? ' · 동작 줄이기 설정이라 대표 장면으로 멈춤' : ''}.</p>`;
  root.innerHTML = html;
  const stage = new Stage({ fpsCap: zoom ? 60 : 30 });
  if (q.get('slow')) stage.speed = 0.5;
  all.forEach(({ B, id }, i) => {
    const cell = document.getElementById(id)!;
    const svg = cell.querySelector('svg')!;
    B.fig.bind(svg);
    const ph = cell.querySelector('.ph') as HTMLElement;
    const gs = cell.querySelector('.gs');
    const sc = B.motion.scroll ?? 0;
    const tl = zoom ? Array.from(document.querySelectorAll<HTMLElement>('.timeline span')) : [];
    stage.add({
      fig: B.fig, motion: B.motion, offset: (i * 0.41) % B.motion.loop, speed: 1, el: cell,
      onPhase: (l) => { ph.textContent = l; tl.forEach((s) => s.classList.toggle('on', s.dataset.l === l)); },
      onTime: gs ? (t) => { gs.setAttribute('transform', `translate(${(-((t * sc) % 40)).toFixed(1)} 0)`); } : undefined,
    });
  });
  // 재생 조절
  const bPlay = document.getElementById('bPlay'), bSlow = document.getElementById('bSlow');
  let playing = !stage.reduced;
  const syncBtn = () => { if (bPlay) { bPlay.textContent = playing ? '일시정지' : '재생'; bPlay.setAttribute('aria-pressed', String(!playing)); } };
  bPlay?.addEventListener('click', () => { playing = !playing; if (playing) stage.start(); else stage.pause(); syncBtn(); });
  bSlow?.addEventListener('click', () => { stage.speed = stage.speed === 1 ? 0.5 : 1; bSlow.setAttribute('aria-pressed', String(stage.speed !== 1)); });
  if (stage.speed !== 1) bSlow?.setAttribute('aria-pressed', 'true');
  const tq = q.get('t'), ev = q.get('ev');
  if (tq) { stage.freeze(parseFloat(tq)); playing = false; }
  else if (ev) { stage.freeze((m) => (m.events[ev] ?? m.keyTime) + parseFloat(q.get('dt') ?? '0')); playing = false; }
  else stage.start();
  syncBtn();
  if (q.get('perf')) {
    // 실제 시간으로 3초 동안 프레임 간격과 그리기 시간 측정 → 머리말에 표시
    const gaps: number[] = [];
    let last = performance.now();
    const t0 = last;
    const tick = (now: number) => { gaps.push(now - last); last = now; if (now - t0 < 3200) requestAnimationFrame(tick); else report(); };
    requestAnimationFrame(tick);
    const report = () => {
      const g = gaps.slice(5).sort((a, b) => a - b);
      const med = g[Math.floor(g.length / 2)], p95 = g[Math.floor(g.length * 0.95)];
      const nodes = document.querySelectorAll('svg *').length;
      const el = document.createElement('div');
      el.id = 'perfout';
      el.style.cssText = 'position:fixed;left:0;top:0;right:0;z-index:99;background:#e3b45a;color:#111;font:600 14px monospace;padding:8px 12px';
      el.textContent = 'frames ' + g.length + ' | rAF gap median ' + med.toFixed(1) + 'ms p95 ' + p95.toFixed(1) + 'ms | draw/figure EMA ' + (stage as unknown as { costEma: number }).costEma.toFixed(2) + 'ms | svg nodes ' + nodes + ' | figures ' + all.length;
      document.body.appendChild(el);
    };
  }
  (window as unknown as { stage: Stage }).stage = stage;
}

/** 크게 보기: 단계 타임라인 + 폼 변수표 + 엔진 효과 */
function zoomInfo(B: Built): string {
  const m = B.motion;
  const ph = m.phases;
  const tl = ph.map((p, i) => { const end = i + 1 < ph.length ? ph[i + 1].t : m.dur; return `<span data-l="${p.label}" style="flex-grow:${Math.max(0.05, end - p.t).toFixed(2)}">${p.label}</span>`; }).join('');
  const rows: [string, string][] = [];
  const effects: FormEffect[] = [];
  if (B.pf) {
    const f = B.pf;
    rows.push(['팔 각도', `${SLOT_KO[f.armSlot]} · ${Math.round(f.armAngle)}°`], ['시작 동작', f.delivery === 'windup' ? (f.overhead ? '와인드업 (두 손 머리 위)' : '와인드업') : `세트 (손 ${f.setHands === 'belt' ? '허리' : f.setHands === 'chest' ? '가슴' : '턱'} 높이)`],
      ['다리 들기', `${f.legLift === 'high' ? '하이킥' : f.legLift === 'slide' ? '슬라이드 스텝' : '보통'} · 무릎 높이 ${Math.round(f.liftH * 100)}% · 감기 ${Math.round(f.tuck * 100)}%`],
      ['멈춤(밸런스)', `${f.hang.toFixed(2)}초`], ['템포', `${f.tempo === 'quick' ? '빠름' : f.tempo === 'slow' ? '느림' : '보통'} · ×${f.tempoMul.toFixed(2)}`],
      ['보폭(익스텐션)', `키의 ${Math.round(f.stride * 100)}%`], ['디딤 방향', f.crossfire ? `크로스파이어 (${Math.round(f.strideZ)}cm 닫힘)` : `${Math.round(f.strideZ)}cm`],
      ['공 숨김', `${f.hideBall === 'good' ? '잘 숨김' : f.hideBall === 'exposed' ? '보임' : '보통'} · 몸 비틀기 ${Math.round(f.coil * 100)}% · 글러브 높이 ${Math.round(f.gloveHigh * 100)}%`],
      ['팔 동작', f.armAction === 'short' ? '짧게 (포수식)' : '크게 돌림'], ['축발 굽힘', `${Math.round(f.drop * 100)}%`], ['릴리스 상체 숙임', `${Math.round(f.trunkFlex)}°`],
      ['피니시', `${f.finish === 'fallOff' ? '1루 쪽 쏠림' : f.finish === 'hop' ? '뛰는 피니시' : '균형'} · 머리 쏠림 ${Math.round(f.headWhip * 100)}%`]);
    for (const k of [`armSlot.${f.armSlot}`, `legLift.${f.legLift}`, `tempo.${f.tempo}`, `hideBall.${f.hideBall}`, f.crossfire ? 'crossfire' : '', f.armAction === 'short' ? 'armAction.short' : '', `finish.${f.finish}`]) if (PITCH_EFFECTS[k]) effects.push(PITCH_EFFECTS[k]);
  }
  if (B.bf) {
    const f = B.bf;
    rows.push(['타석', f.switchHitter ? `양타 (${f.bats === 'L' ? '좌' : '우'}타석)` : f.bats === 'L' ? '좌타' : '우타'], ['스탠스', `${STANCE_KO[f.stance]} · 열림 ${f.openness.toFixed(2)} · 폭 키의 ${Math.round(f.width * 100)}%`],
      ['자세 높이', `${f.crouch === 'crouch' ? '웅크림' : f.crouch === 'upright' ? '곧게' : '보통'} · 굽힘 ${Math.round(f.crouchK * 100)}%`], ['손 높이', `${f.hands === 'high' ? '높게' : f.hands === 'low' ? '낮게' : '중간'} (${Math.round(f.handsY)}cm)`],
      ['배트', `기울기 ${Math.round(f.batTilt)}° · 감기 ${Math.round(f.batWrap * 100)}%`], ['왜글', f.waggle === 'big' ? '크게' : f.waggle === 'small' ? '작게' : '없음'],
      ['타이밍 동작', `${KICK_KO[f.legKick]} · 다리 ${Math.round(f.kickH)}cm · 내딛기 ${Math.round(f.strideLen)}cm`], ['히치', f.hitch > 0 ? `있음 (${Math.round(f.hitch * 10)}cm)` : '없음'],
      ['스윙 궤도', `${f.plane === 'up' ? '어퍼' : f.plane === 'down' ? '다운' : '레벨'} · 공격각 ${Math.round(f.attack)}°`], ['팔로스루', f.finish === 'oneHand' ? '한 손 (위 손을 놓음)' : '두 손 끝까지'], ['대기 템포', `×${f.tempo.toFixed(2)}`]);
    for (const k of [`stance.${f.stance}`, `legKick.${f.legKick}`, `hands.${f.hands}`, `crouch.${f.crouch}`, `plane.${f.plane}`, `finish.${f.finish}`, f.hitch > 0 ? 'hitch' : '', f.waggle === 'big' ? 'waggle.big' : '']) if (BAT_EFFECTS[k]) effects.push(BAT_EFFECTS[k]);
  }
  const KO: Record<string, string> = { platoonBase: '좌우 차 기본', platoonAdd: '좌우 차 +', gbTend: '땅볼 성향', deception: '디셉션', velocity: '구속', control: '제구력', popupRate: '내야 뜬공 ×', firstTimeThrough: '첫 대면 wOBA', timeToPlate: '홈까지 시간(초)', sbSuccess: '도루 성공률', slideStep: '퀵모션', pitchesPerPA: '타석당 투구 수', defenseRange: '수비 범위', pitchClockViolation: '피치클락 위반', kPctBonus: '삼진율', tippedPitch: '구종 읽힘', pFielding: '투수 수비', buntDefense: '번트 수비', insideContact: '몸쪽 컨택', outsideContact: '바깥쪽 컨택', pullTendShift: '당겨치기 성향', vsSameHandBreak: '같은 손 변화구', power: '파워', vsFast: '강속구 대처', avoidK: '삼진 회피', vsChangeup: '체인지업 대처', contactR: '우투 상대 컨택', contactL: '좌투 상대 컨택', vsBreak: '변화구 대처', launchTendShift: '발사각 성향', highFastball: '높은 직구', zoneSizeMult: '존 크기 ×', eye: '선구안', gbBabip: '땅볼 BABIP' };
  const fx = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => `${KO[k] ?? k} ${v > 0 ? '+' : ''}${v}`).join(', ') || '효과 없음';
  return `<div class="zoominfo"><div class="timeline">${tl}</div>` +
    (rows.length ? `<h3 style="font-size:14px;margin:18px 0 8px">폼 변수</h3><table>${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table>` : '') +
    (effects.length ? `<h3 style="font-size:14px;margin:18px 0 8px">경기 엔진 효과 (제안)</h3><table>${effects.map((e) => `<tr><td>${e.label}</td><td>${fx(e.mods)}${e.note ? ` — ${e.note}` : ''}</td></tr>`).join('')}</table>` : '') +
    '</div>';
}
