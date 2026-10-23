// 실제 선수 카탈로그 시험 — node scripts/run-ts.mjs scripts/kbo.test.ts [옛 저장 fixture.json]
//  1. 옛 저장(v1, 가상 선수 시절 코드로 만든 것 — scripts/legacy-fixture.ts) → v2 이전: 카드 종류 · 보유 수량 합 · 카드마다 이름·등급·종합이 같다
//  2. 카탈로그: 카드 id 규칙 · 겹침 없음 · 모든 카드가 선수 본체를 ID 로 찾음 · 같은 입력 → 같은 보기
//  3. 시작 선수단: 20개 구단 모두 팀 종합 65~68 · 기본 카드는 실제 선수 카드
//  4. 연도팩 · 구단팩: 그 해 · 그 구단 실제 선수 카드만
//  5. 종합 분포: 기존 가상 선수(목업)와 크게 어긋나지 않음
import './shim-storage';
import { existsSync, readFileSync } from 'node:fs';

let failed = 0, passed = 0;
function ok(cond: unknown, name: string, detail?: unknown) {
  if (cond) { passed++; return; }
  failed++;
  console.log('  실패:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 400) : '');
}
const sec = (t: string) => console.log('\n■ ' + t);
const fxPath = process.argv[2];

// 저장을 먼저 깔고 앱 모듈을 불러온다 (처음 켤 때와 같은 순서)
localStorage.clear();
const fx = fxPath && existsSync(fxPath) ? (JSON.parse(readFileSync(fxPath, 'utf8')) as { storage: Record<string, string>; expect: { ids: string[]; sumN: number; got: number; cards: Record<string, [string, string, number]> } }) : null;
if (fx) for (const [k, v] of Object.entries(fx.storage)) localStorage.setItem(k, v);

const mock = await import('../src/game/mock');
const inv = await import('../src/game/inventory');
const kbo = await import('../src/game/kbo');
const starterM = await import('../src/game/starter');
const calc = await import('../src/screens/lineup/calc');
const draw = await import('../src/screens/gacha/draw');
const world = await import('../src/game/world');

/* ───── 1. 옛 저장 이전 ───── */
sec('1. 옛 저장(v1) → v2 이전');
if (!fx) console.log('  (fixture 없음 — 건너뜀)');
else {
  inv.reloadInventory();
  const ids = inv.ownedIds().sort();
  const s = inv.snapshot();
  const sumN = Object.values(s.cards).reduce((a, e) => a + e.n, 0);
  ok(s.v === 2 && !!s.legacy, 'v2 로 옮기고 시작 설정을 legacy 에', { v: s.v });
  ok(inv.takeInvNotice() === null, '이전은 조용히 (안내 없음)');
  ok(sumN === fx.expect.sumN, `보유 수량 합 같음 ${sumN} = ${fx.expect.sumN}`);
  ok(s.stats.got === fx.expect.got, '받은 장수 합 같음', [s.stats.got, fx.expect.got]);
  ok(ids.length === fx.expect.ids.length && ids.every((x, i) => x === fx.expect.ids[i]), `보이는 카드 종류 같음 ${ids.length} = ${fx.expect.ids.length}`, fx.expect.ids.filter((x) => !ids.includes(x)).slice(0, 5));
  let same = 0;
  const diff: string[] = [];
  for (const id of fx.expect.ids) {
    const c = inv.ownedCard(id);
    if (!c) { diff.push(id); continue; }
    const p = mock.playerOfCard(c);
    const [nm, g, o] = fx.expect.cards[id];
    if (p.name === nm && c.grade === g && (c.ovr ?? p.ovr) === o) same++; else diff.push(id);
  }
  ok(diff.length === 0, `카드마다 이름·등급·종합 같음 ${same}/${fx.expect.ids.length}`, diff.slice(0, 5));
  ok(inv.checkInventory().length === 0, '검사 통과', inv.checkInventory().slice(0, 3));
  const lineupOk = [...inv.lineupIds()].every((id) => !!mock.cardById(id));
  ok(lineupOk, '라인업 카드 모두 찾음');
  // 다시 읽어도 (v2 로 저장된 것) 그대로
  inv.reloadInventory();
  ok(inv.ownedIds().length === ids.length, 'v2 저장 다시 읽기 그대로');
  console.log(`  카드 종류 ${ids.length} · 보유 합 ${sumN} · 레거시 시작 구단 ${s.legacy?.start.club}`);
}

/* ───── 2. 카탈로그 ───── */
sec('2. 카탈로그 — 카드 id 규칙 · 선수 본체 참조');
const cards = kbo.kboCards();
const idSet = new Set(cards.map((c) => c.id));
ok(idSet.size === cards.length, '카드 id 겹침 없음', cards.length - idSet.size);
const RULE = /^k[0-9a-f]{6,8}-(?:\d{4}[nsre]|\d{4}mvp|\d{4}gg|\d{4}th-[a-z]+|lg|fr|bk|sg)$/;
ok(cards.every((c) => RULE.test(c.id)), '카드 id 규칙', cards.filter((c) => !RULE.test(c.id)).slice(0, 3).map((c) => c.id));
let badRef = 0;
for (const c of cards) {
  const ci = mock.cardById(c.id);
  const p = ci && mock.playerById(ci.playerId);
  if (!ci || !p || !p.real || p.real.kid !== c.kid || !kbo.kboPerson(c.kid)) badRef++;
}
ok(badRef === 0, '모든 카드 → 선수 본체 (ID 로)', badRef);
const anyC = cards[Math.floor(cards.length / 2)];
const v1 = JSON.stringify(kbo.viewPlayer(anyC.kid, anyC.view));
ok(v1 === JSON.stringify(kbo.viewPlayer(anyC.kid, anyC.view)), '같은 입력 → 같은 보기');
const byG: Record<string, number> = {};
for (const c of cards) byG[c.grade] = (byG[c.grade] ?? 0) + 1;
console.log(`  선수 ${kbo.kboPersons().length}명 · 카드 ${cards.length}장`, JSON.stringify(byG));

/* ───── 3. 시작 선수단 ───── */
sec('3. 시작 선수단 — 20개 구단 팀 종합 65~68');
const res: string[] = [];
for (const t of mock.ALL_TEAMS) {
  localStorage.clear();
  const pool = starterM.draftPool(t.id);
  const c = pool.find((p) => p.pos === 'C');
  const picks = [c, ...pool.filter((p) => p !== c)].filter(Boolean).slice(0, 3).map((p) => p!.id);
  localStorage.setItem('bb.start', JSON.stringify({ club: t.id, picks }));
  starterM.setStarterKind('kbo');
  const st = starterM.resetStarter();
  inv.reloadInventory();
  const ovr = calc.evaluate(calc.initialLineup()).overall;
  const realBase = st.cards.filter((id) => kbo.isKboCardId(id)).length;
  res.push(`${t.short} ${ovr.toFixed(1)}(실제 ${realBase}/${st.cards.length})`);
  ok(ovr >= 65 && ovr <= 68, `${t.name} 팀 종합 ${ovr.toFixed(1)}`);
  ok(pool.length === 8 && pool.every((p) => !!p.real), `${t.name} 지명 후보 8명 모두 실제 선수`, pool.length);
  ok(realBase >= 24, `${t.name} 기본·지명 카드가 실제 선수 카드`, realBase);
}
console.log('  ' + res.join(' · '));

/* ───── 4. 연도팩 · 구단팩 ───── */
sec('4. 연도팩 · 구단팩 — 그 해 · 그 구단 실제 선수만');
const yearPack = mock.PACKS.find((p) => p.pick?.kind === 'year')!;
const clubPack = mock.PACKS.find((p) => p.pick?.kind === 'club')!;
for (const y of [1983, 1999, 2010, 2026]) {
  const r = draw.pullPack(yearPack, { kind: 'year', year: y }, { seed: `t-y-${y}` });
  const bad = r.cards.filter((c) => {
    const k = kbo.kboCard(c.card.id);
    if (!k) return true;
    if (k.year != null && k.year !== y) return true;
    const p = kbo.kboPerson(k.kid)!;
    return !p.seasons.some((s) => s.year === y && s.code === k.code) || !world.clubsIn(y).includes(k.code);
  });
  ok(bad.length === 0, `${y} 연도팩 30장 모두 그 해 그 구단에서 뛴 선수`, bad.slice(0, 3).map((c) => c.card.id));
}
for (const code of ['DDG', 'GJ', 'SW', 'IBY'] as const) {
  const r = draw.pullPack(clubPack, { kind: 'club', club: code }, { seed: `t-c-${code}` });
  const bad = r.cards.filter((c) => kbo.kboCard(c.card.id)?.code !== code);
  ok(bad.length === 0, `${code} 구단팩 30장 모두 그 구단 카드`, bad.slice(0, 3).map((c) => c.card.id));
}

/* ───── 5. 종합 분포 ───── */
sec('5. 종합 분포 — 기존 가상 선수와 비교');
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const mockBy: Record<string, number[]> = {};
for (const c of mock.CARDS) if (/^c\d+$/.test(c.id)) (mockBy[c.grade] ??= []).push(c.ovr ?? mock.playerOfCard(c).ovr);
const kBy: Record<string, number[]> = {};
for (const c of cards) (kBy[c.grade] ??= []).push(c.ovr);
const rows: string[] = [];
for (const g of ['normal', 'special', 'rare', 'elite', 'legend', 'franchise', 'black', 'signature', 'mvp', 'gg', 'th']) {
  const a = mean(mockBy[g] ?? []), b = mean(kBy[g] ?? []);
  rows.push(`${g} 목업 ${a ? a.toFixed(1) : '-'} / 실제 ${b.toFixed(1)}`);
  if (mockBy[g]?.length && kBy[g]?.length) ok(Math.abs(a - b) <= 9, `${g} 평균 차 9 이하`, [a, b]);
}
console.log('  ' + rows.join(' · '));

/* ───── 6. 내 시즌 → 게임 통산 ───── */
sec('6. 시즌 기록 → 게임 통산 (시즌을 새로 시작하면 옮겨 적음)');
{
  localStorage.clear();
  starterM.setStarterKind('kbo');
  starterM.resetStarter();
  inv.reloadInventory();
  const run = await import('../src/season/run');
  const store = await import('../src/season/store');
  const career = await import('../src/season/career');
  for (let i = 0; i < 5; i++) await run.playNextDay();
  const s = store.getSeason();
  const key = Object.keys(s.bat).find((x) => x.includes('~'));
  ok(!!key, '실제 선수가 시즌 경기에 나섬', Object.keys(s.bat).slice(0, 5));
  if (key) {
    const live = career.careerOf(career.careerKey(key), s);
    ok(live.length === 1 && live[0].live && (live[0].bat?.G ?? 0) > 0, '이번 시즌 기록이 사람 단위로', live);
    store.resetSeason();
    const after = career.careerOf(career.careerKey(key), store.getSeason());
    ok(career.archivedCount() === 1 && after.length === 1 && !after[0].live && after[0].bat?.G === live[0].bat?.G, '개막부터 다시 → 1번째 시즌으로 옮겨 적음', after);
  }
}

console.log(`\n결과: 통과 ${passed} · 실패 ${failed}`);
if (failed) process.exit(1);
