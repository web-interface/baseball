// 안내 페이지 생성기 (Node 에서 실행) — 데스크톱 디자인초안/캐릭터/index.html 을 만든다.
// 썸네일은 실제 생성기로 그린 정지 장면(초상 1 + 투구 릴리스 1 + 타격 컨택 1)을 SVG 로 넣는다.
//   esbuild preview/index-page.ts --bundle --platform=node --outfile=<tmp>/index-page.js && node <tmp>/index-page.js <출력 html>

// Node 전용 스크립트 — 웹 tsconfig 에 node 타입이 없어서 최소 선언만 둔다
declare const require: (m: string) => { writeFileSync: (p: string, s: string, e: string) => void };
declare const process: { argv: string[] };
const { writeFileSync } = require('fs');
import { makeAppearance, makeKit, TEAMS, renderPortrait } from '../index';
import type { PlayerSpec } from '../index';
import { makePitchForm, makeBatForm } from '../forms';
import { pitchMotion } from '../motionPitch';
import { batMotion } from '../motionBat';
import { LiveFigure } from '../live';
import { motionBox } from '../stage';

const out = process.argv[2];
const T = (id: string) => TEAMS.find((t) => t.id === id)!;

// 외모 카드: 초상 3장
const faces: PlayerSpec[] = [
  { id: 'p13', pos: 'P', heightCm: 189, weightKg: 84, throws: 'R', bats: 'R', origin: 'KR', age: 22, number: 11 },
  { id: 'p07', pos: 'P', heightCm: 196, weightKg: 104, throws: 'R', bats: 'R', origin: 'LATAM', age: 27, number: 55 },
  { id: 'p12', pos: 'DH', heightCm: 183, weightKg: 121, throws: 'R', bats: 'R', origin: 'KR', age: 33, number: 50 },
];
const faceTeams = ['owls', 'foxes', 'foxes'];
const portraits = faces.map((s, i) => { const ap = makeAppearance(s); return renderPortrait(ap, makeKit(s, ap, T(faceTeams[i]), i ? 'away' : 'home'), { width: 150, height: 200, detail: 0.7 }); });

// 폼 카드: 투수 릴리스 + 타자 컨택
const ps: PlayerSpec = { id: 'f-p04', pos: 'P', heightCm: 196, weightKg: 104, throws: 'R', bats: 'R', origin: 'US', age: 28, number: 55 };
const pap = makeAppearance(ps);
const pm = pitchMotion(pap, makePitchForm(ps, { armSlot: 'over', legLift: 'high', delivery: 'windup', overhead: true, finish: 'fallOff' }));
const pfig = new LiveFigure(pap, makeKit(ps, pap, T('waves'), 'away'), { gear: 'cap', headYaw: pm.headYaw, detail: 1 });
const bs: PlayerSpec = { id: 'f-b01', pos: 'SS', heightCm: 178, weightKg: 76, throws: 'R', bats: 'R', origin: 'KR', age: 27, number: 6 };
const bap = makeAppearance(bs);
const bm = batMotion(bap, makeBatForm(bs, { stance: 'open', legKick: 'toeTap', hands: 'mid', plane: 'level', finish: 'twoHands', waggle: 'small' }));
const bfig = new LiveFigure(bap, makeKit(bs, bap, T('comets'), 'home'), { gear: 'helmet', headYaw: bm.headYaw, view: bm.view, detail: 1 });

function still(fig: LiveFigure, m: typeof pm, t: number, w: number, h: number): string {
  const p = m.sample(t);
  const trail = m.smear(t) > 0 ? [1, 2, 3, 4].map((k) => m.sample(Math.max(0, t - k / 60))) : undefined;
  const fr = fig.svgFrame(p, trail);
  const b0 = motionBox(fig, m);
  // 동작 전체 상자 중 이 장면 주변만 (가로는 장면 상자 + 여유)
  const bx: [number, number, number, number] = [fr.box[0] - 30, b0[1], fr.box[2] + 30, b0[3]];
  const W = bx[2] - bx[0], H = bx[3] - bx[1];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bx[0].toFixed(1)} ${bx[1].toFixed(1)} ${W.toFixed(1)} ${H.toFixed(1)}" width="${w}" height="${h}" preserveAspectRatio="xMidYMax meet" role="img">${fr.g}</svg>`;
}
const pThumb = still(pfig, pm, pm.events.release - 0.004, 260, 230);
const bThumb = still(bfig, bm, bm.events.contact + 0.002, 220, 230);

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>캐릭터 초안</title>
<style>
  :root { --bg: #141518; --panel: #1d1e22; --ink: #eceae4; --muted: #9a9890; --line: #2a2b30; --chip: #2a2b31; --stage-top: #ebe7df; --stage-bot: #d9d4c9; color-scheme: dark;
    font-family: Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, sans-serif; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); -webkit-font-smoothing: antialiased; }
  main { max-width: 1080px; margin: 0 auto; padding: 48px 28px 56px; }
  .eyebrow { font-size: 12px; letter-spacing: 0.08em; color: var(--muted); text-transform: uppercase; }
  h1 { margin: 8px 0 10px; font-size: 30px; letter-spacing: -0.02em; font-weight: 800; }
  .lede { margin: 0 0 32px; color: var(--muted); font-size: 14.5px; line-height: 1.7; max-width: 640px; }
  .cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  a.card { display: flex; flex-direction: column; text-decoration: none; color: inherit; background: var(--panel); border: 1px solid var(--line); border-radius: 18px; overflow: hidden; transition: border-color .16s, transform .16s; }
  a.card:hover { border-color: #3d3e45; transform: translateY(-2px); }
  a.card:focus-visible { outline: 2px solid #e3b45a; outline-offset: 2px; }
  .art { display: flex; justify-content: center; align-items: flex-end; gap: 6px; min-height: 236px; background: linear-gradient(var(--stage-top), var(--stage-bot)); box-shadow: inset 0 -11px 0 #cbc4b6, inset 0 -12px 0 #b9b1a2; line-height: 0; padding: 0 12px; }
  .art.faces { gap: 8px; align-items: center; padding: 18px 14px; background: #1a1b1f; box-shadow: none; }
  .art.faces svg { width: 31%; height: auto; border-radius: 10px; }
  .art svg { max-width: 100%; height: auto; }
  .body { padding: 18px 20px 20px; }
  .body h2 { margin: 0 0 6px; font-size: 19px; font-weight: 780; letter-spacing: -0.01em; display: flex; align-items: center; gap: 8px; }
  .body h2 span { font-size: 12px; font-weight: 600; color: var(--muted); }
  .body p { margin: 0; color: var(--muted); font-size: 13.5px; line-height: 1.65; }
  .chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 12px; }
  .chips i { font-style: normal; font-size: 11.5px; padding: 3px 8px; border-radius: 6px; background: var(--chip); color: #d3d0c8; }
  .go { margin-top: 14px; font-size: 13px; font-weight: 650; }
  footer { margin-top: 28px; color: #6f6d67; font-size: 12px; line-height: 1.7; }
  @media (max-width: 760px) { .cards { grid-template-columns: minmax(0, 1fr); } main { padding: 32px 16px 40px; } h1 { font-size: 24px; } .art { min-height: 0; } }
</style>
</head>
<body>
<main>
  <div class="eyebrow">야구 매니저 · 디자인 초안</div>
  <h1>캐릭터</h1>
  <p class="lede">선수 그림은 모두 코드(SVG)로 그립니다. 선수 id 하나로 얼굴·체격·유니폼이 정해지고, 같은 id 는 언제나 같은 사람입니다. 투구·타격 폼도 같은 시드에서 나와 사람마다 다르게 움직입니다.</p>
  <div class="cards">
    <a class="card" href="외모.html">
      <div class="art faces">${portraits.join('')}</div>
      <div class="body">
        <h2>외모 <span>24명</span></h2>
        <p>얼굴형·눈매·코·수염·머리 모양·피부·체형을 시드로 생성. 카드 초상과 전신 옆모습, 같은 축척 줄 세우기.</p>
        <div class="chips"><i>얼굴 변수 40여 개</i><i>출신별 분포</i><i>체형 5종</i><i>유니폼·장비</i></div>
        <div class="go">외모 보기 →</div>
      </div>
    </a>
    <a class="card" href="폼.html">
      <div class="art">${pThumb}${bThumb}</div>
      <div class="body">
        <h2>폼 <span>투수 8 · 타자 8 · 수비/주루</span></h2>
        <p>팔 각도(오버핸드~잠수함), 다리 들기, 템포, 스탠스, 타이밍 동작이 키프레임을 바꿉니다. 반복 재생, 크게 보기에서 폼 변수와 경기 엔진 효과.</p>
        <div class="chips"><i>3D 관절 + 정사영</i><i>단조 3차 보간</i><i>휴대폰 30fps</i></div>
        <div class="go">폼 보기 →</div>
      </div>
    </a>
  </div>
  <footer>코드: <code>web/src/art/character/</code> · 폼 변수·분포·엔진 효과 정리: <code>forms.md</code></footer>
</main>
</body>
</html>
`;
writeFileSync(out, html, 'utf8');
console.log('wrote', out, (html.length / 1024).toFixed(0) + 'KB');
