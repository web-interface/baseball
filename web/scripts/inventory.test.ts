// 보유 카드 저장소 시험 — `npm test` (scripts/test-inventory.mjs 가 이 파일을 esbuild 로 묶어 node 에서 돌린다)
//  1. 처음: 기본 선수단으로 시작, 검사 통과
//  2. 같은 카드 중복 → 필요 수량 표대로 자동 강화 (노멀 · 스페셜 · 레어, +1~+5) · +6~+10 도전
//  3. 뽑기 1,000번(+ 조합 50번) 뒤: 총 획득 = 남은 보유 + 강화에 쓴 수량 + 조합에 쓴 수량, 카드마다 강화 단계 = 표
//  4. 라인업 보호 · 라인업 저장 정리
//  5. 저장 → 다시 읽기 왕복이 같음
//  6. 옛 형식 · 깨진 저장 → 처음 선수단으로 + 안내 (앱이 깨지지 않음)
import './shim-storage';
import { PACKS, CARDS, playerById } from '../src/game/mock';
import {
  ENH_STEPS, INV_KEY, addCards, autoMatTotal, checkInventory, entryOf, inLineup, lineupIds, needFor, ownedCard, ownedIds,
  reloadInventory, snapshot, spareOf, stats, takeInvNotice, tryEnhance, useForRoulette, resetInventory,
} from '../src/game/inventory';
import { pullPack, rollCombo, type Pick } from '../src/screens/gacha/draw';
import { initialLineup, store as lineupStore, place, BAT_SLOTS } from '../src/screens/lineup/calc';
import { CURRENT_SEASON } from '../src/game/world';
import { draftPool, resetStarter } from '../src/game/starter';
import type { CardInst, ClubCode, GradeId } from '../src/game/types';

let failed = 0, passed = 0;
function ok(cond: unknown, name: string, detail?: unknown) {
  if (cond) { passed++; return; }
  failed++;
  console.log('  실패:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 400) : '');
}
const sec = (t: string) => console.log('\n■ ' + t);
const sumN = () => Object.values(snapshot().cards).reduce((a, e) => a + e.n, 0);

/* ───── 1. 처음 ───── */
sec('1. 처음 시작 — 기본 선수단');
localStorage.clear();
// 구단 선택을 마친 상태 — 독수리스 · 지명 3명(포수 포함)
const pool = draftPool('dj');
const picks = [pool.find((p) => p.pos === 'C')!, ...pool.filter((p) => p.pos !== 'C').slice(0, 2)].map((p) => p.id);
localStorage.setItem('bb.start', JSON.stringify({ club: 'dj', picks }));
resetStarter();
reloadInventory();
const START_N = 26;
const start = ownedIds();
ok(start.length === 26, '기본 선수단 26장 (기본 22 + 지명 3 + 특별 1)', start.length);
ok(stats().got === 26, '받은 장수 26', stats());
ok(checkInventory().length === 0, '검사 통과', checkInventory());
ok(lineupIds().size === start.length, '처음 라인업(1군 + 벤치) 카드 모두 보호', lineupIds().size);
console.log(`  보유 ${start.length}종 · 라인업 ${lineupIds().size}명`);

/* ───── 2. 중복 → 자동 강화 ───── */
sec('2. 같은 카드 중복 → 필요 수량 표대로 자동 강화');
const target = (grade: GradeId, pid: string): CardInst => ({ id: 'x', playerId: pid, grade, year: 25, level: 1, enhance: 0, dup: 0 });
for (const [grade, pid] of [['normal', 'p05'], ['special', 'p06'], ['rare', 'p07']] as [GradeId, string][]) {
  const c = target(grade, pid);
  const id = addCards([c])[0].id;
  const steps: string[] = [];
  let given = 1;
  for (let stage = 1; stage <= 5; stage++) {
    const need = needFor(grade, stage);
    // need − 1 장까지는 오르지 않는다
    for (let k = 0; k < need - 1; k++) { const r = addCards([c])[0]; given++; ok(!r.up, `${grade} +${stage} 전 ${k + 1}장째엔 그대로`, r); }
    const r = addCards([c])[0];
    given++;
    ok(r.up && r.up.from === stage - 1 && r.up.to === stage, `${grade} ${need}장째에 +${stage}`, r);
    ok(entryOf(id)!.n === 1, `${grade} +${stage} 뒤 보유 1장`, entryOf(id));
    steps.push(`+${stage}:${need}장`);
  }
  const e = entryOf(id)!;
  ok(e.enh === 5 && e.mat === autoMatTotal(grade, 5), `${grade} +5 까지 쓴 장수 = 표 합`, e);
  ok(given === e.got && e.got === e.n + e.mat, `${grade} 받은 = 보유 + 강화`, e);
  // +5 에서 넘치는 중복은 쌓인다 (자동으로 +6 안 됨)
  addCards([c, c, c]);
  ok(entryOf(id)!.enh === 5 && entryOf(id)!.n === 4, `${grade} +5 뒤 중복 3장은 쌓임`, entryOf(id));
  // +6~+10 도전 (GP 는 시험이라 통과)
  let tries = 0;
  while (entryOf(id)!.enh < 10 && tries < 40) {
    if (entryOf(id)!.n < 2) addCards([c]);
    const r = tryEnhance(id, () => true);
    ok(r.ok, `${grade} 도전 가능`, r);
    tries++;
  }
  ok(entryOf(id)!.enh === 10, `${grade} X 까지 (도전 ${tries}번)`, entryOf(id));
  ok(tryEnhance(id, () => true).ok === false, `${grade} X 에서 더는 안 됨`);
  console.log(`  ${grade}: ${steps.join(' · ')} → +5 자동, +6~+10 도전 ${tries}번`);
}
const uq = start.find((id) => ownedCard(id)?.grade === 'unique')!;
ok(!!uq && spareOf(uq) === 0, '특별 선수는 재료로 못 씀', uq);
ok(checkInventory().length === 0, '검사 통과', checkInventory());

/* ───── 3. 뽑기 1,000번 ───── */
sec('3. 뽑기 1,000번 + 조합 50번');
resetInventory();
const clubs = ['DJ', 'BS', 'SB', 'DDG', 'IBY'] as ClubCode[];
let pulled = 0, comboIn = 0, comboOut = 0, ups = 0, comboFail = 0;
const lineupBefore = JSON.stringify([...lineupIds()].sort());
const savedBefore = JSON.stringify(lineupStore.get());
const t0 = Date.now();
for (let i = 0; i < 1000; i++) {
  const pack = PACKS[i % PACKS.length];
  const pick: Pick | null = pack.pick?.kind === 'year' ? { kind: 'year', year: CURRENT_SEASON - (i % 40) } : pack.pick?.kind === 'club' ? { kind: 'club', club: clubs[i % clubs.length] } : null;
  const res = pullPack(pack, pick, { seed: `t${i}` });
  pulled += res.cards.length;
  ups += res.ups.length;
  ok(res.cards.every((c) => ownedCard(c.card.id)), `뽑은 카드가 보관함에 있음 #${i}`);
  if (i % 20 === 19) {
    // 조합 — 노멀 5장 (쓸 수 있는 장만)
    const use: Record<string, number> = {};
    let k = 0;
    for (const id of ownedIds()) {
      if (k >= 5) break;
      const c = ownedCard(id)!;
      if (c.grade !== 'normal') continue;
      const n = Math.min(spareOf(id), 5 - k);
      if (n > 0) { use[id] = n; k += n; }
    }
    if (k === 5) {
      const r = rollCombo([{ grade: 'normal', pct: 70, label: '노멀' }, { grade: 'special', pct: 25, label: '스페셜' }, { grade: 'rare', pct: 5, label: '레어' }], use, `c${i}`);
      if (r) { comboIn += 5; comboOut += 1; } else comboFail++;
    }
  }
}
const st = stats();
const left = sumN();
console.log(`  ${((Date.now() - t0) / 1000).toFixed(1)}초 · 뽑은 ${pulled}장 · 조합 결과 ${comboOut}장 · 시작 26장`);
console.log(`  총 획득 ${st.got} = 남은 보유 ${left} + 강화에 쓴 ${st.enhUsed} + 조합에 쓴 ${st.rouletteUsed}  (합 ${left + st.enhUsed + st.rouletteUsed})`);
console.log(`  카드 종류 ${Object.keys(snapshot().cards).length} · 보유 중 ${ownedIds().length} · 자동 강화 ${ups}번(팩 결과 기준) · 조합 실패 ${comboFail}`);
ok(st.got === START_N + pulled + comboOut, '총 획득 = 시작 + 뽑은 + 조합 결과', { got: st.got, want: START_N + pulled + comboOut });
ok(st.got === left + st.enhUsed + st.rouletteUsed, '총 획득 = 남은 보유 + 강화에 쓴 + 조합에 쓴');
ok(st.rouletteUsed === comboIn, '조합에 쓴 수량 = 넣은 재료', { st: st.rouletteUsed, comboIn });
ok(JSON.stringify([...lineupIds()].sort()) === lineupBefore && JSON.stringify(lineupStore.get()) === savedBefore, '새 카드는 보관함으로만 — 라인업은 그대로');
console.log('  라인업 25+벤치 그대로: ' + (JSON.stringify([...lineupIds()].sort()) === lineupBefore));
const bad = checkInventory();
ok(bad.length === 0, '카드마다 강화 단계 = 필요 수량 표 · 받은 = 보유 + 강화 + 조합', bad.slice(0, 5));
// 단계 분포
const dist: Record<number, number> = {};
for (const e of Object.values(snapshot().cards)) dist[e.enh] = (dist[e.enh] ?? 0) + 1;
console.log('  강화 단계 분포', JSON.stringify(dist));
// 표와 직접 대조 (검사 함수와 따로)
let tableOk = 0, tableBad = 0;
for (const [id, e] of Object.entries(snapshot().cards)) {
  const c = CARDS.find((x) => x.id === id);
  if (!c || c.grade === 'unique') continue;
  const want = ENH_STEPS.slice(0, e.enh).reduce((a, x) => a + x.mat[c.grade === 'normal' ? 'C' : c.grade === 'special' ? 'B' : 'A'], 0);
  if (e.enh <= 5 && e.mat === want) tableOk++; else if (e.enh <= 5) tableBad++;
}
ok(tableBad === 0, '표 직접 대조', { tableOk, tableBad });
console.log(`  표 직접 대조: 맞음 ${tableOk} · 틀림 ${tableBad}`);

/* ───── 4. 라인업 ───── */
sec('4. 라인업 보호 · 저장');
for (const id of lineupIds()) ok((entryOf(id)?.n ?? 0) >= 1, `라인업 카드 ${id} 1장 이상`, entryOf(id));
const lu0 = lineupStore.get() ?? initialLineup();
const someLineup = lu0.field.C!;
ok(inLineup(someLineup), '포수 카드는 라인업');
ok(!useForRoulette({ [someLineup]: entryOf(someLineup)!.n }), '라인업 카드 마지막 1장은 조합에 못 씀');
// 새 카드를 라인업에 — 뽑은 카드 중 라인업 밖 1루수(없으면 아무 타자)를 1루에
const outside = (pos?: string) => ownedIds().find((id) => {
  if (lineupIds().has(id)) return false;
  const p = playerById(ownedCard(id)!.playerId);
  return !!p && p.pos !== 'P' && (!pos || p.pos === pos);
});
const batter = outside('1B') ?? outside();
if (batter) {
  const nx = place(lu0, '1B', batter);
  lineupStore.set(nx);
  ok(lineupStore.get()!.field['1B'] === batter, '1루에 새 카드');
  ok(inLineup(batter), '새 카드도 이제 보호');
  // 왕복
  reloadInventory();
  ok(lineupStore.get()!.field['1B'] === batter, '다시 읽어도 1루 그대로');
  console.log(`  1루에 뽑은 카드 ${batter} (${playerById(ownedCard(batter)!.playerId)!.name}) → 다시 읽어도 그대로`);
}
// 없는 카드가 라인업에 있으면 정리
const broken = JSON.parse(JSON.stringify(lineupStore.get()));
broken.field.LF = 'no-such-card';
broken.bench = ['no-such-card-2', ...broken.bench];
lineupStore.set(broken);
const fixed = lineupStore.get()!;
ok(fixed.field.LF !== 'no-such-card' && !!fixed.field.LF, '없는 카드는 빼고 빈 타자 자리는 채움', fixed.field.LF);
ok(!fixed.bench.includes('no-such-card-2'), '벤치에서도 뺌');
ok(BAT_SLOTS.every((s) => !fixed.field[s] || ownedIds().includes(fixed.field[s]!)), '라인업 카드는 모두 보유 카드');

/* ───── 5. 왕복 ───── */
sec('5. 저장 → 다시 읽기 왕복');
const before = snapshot();
const raw1 = localStorage.getItem(INV_KEY)!;
reloadInventory();
const after = snapshot();
ok(JSON.stringify(before) === JSON.stringify(after), '저장 내용이 같음');
ok(localStorage.getItem(INV_KEY) === raw1, '다시 읽어도 저장 글자 그대로');
ok(ownedIds().every((id) => ownedCard(id)?.enhance === after.cards[id].enh), '화면용 카드의 강화 = 저장값');
ok(checkInventory().length === 0, '다시 읽은 뒤 검사 통과', checkInventory().slice(0, 3));
console.log(`  저장 크기 ${(raw1.length / 1024).toFixed(0)}KB · 카드 종류 ${Object.keys(after.cards).length}`);

/* ───── 6. 깨진 저장 ───── */
sec('6. 옛 형식 · 깨진 저장');
const cases: [string, string][] = [
  ['JSON 깨짐', '{"v":1,"club":"dj","cards":{'],
  ['옛 형식 v0', JSON.stringify({ v: 0, cards: ['c01', 'c02'] })],
  ['수량 음수', JSON.stringify({ ...before, cards: { ...before.cards, [start[0]]: { ...before.cards[start[0]], n: -3 } } })],
  ['강화 11', JSON.stringify({ ...before, cards: { ...before.cards, [start[0]]: { ...before.cards[start[0]], enh: 11 } } })],
  ['null', 'null'],
  ['숫자', '42'],
  ['stats 없음', JSON.stringify({ ...before, stats: undefined })],
];
for (const [name, raw] of cases) {
  localStorage.setItem(INV_KEY, raw);
  let threw = false;
  try { reloadInventory(); } catch (e) { threw = true; console.log(e); }
  ok(!threw, `${name}: 앱이 깨지지 않음`);
  ok(ownedIds().length === 26 && stats().got === 26, `${name}: 처음 선수단으로`, { n: ownedIds().length, got: stats().got });
  ok(!!takeInvNotice(), `${name}: 안내 한 번`);
  ok(takeInvNotice() === null, `${name}: 안내는 한 번만`);
  ok(checkInventory().length === 0, `${name}: 검사 통과`);
  ok(lineupStore.get() === null && !!initialLineup().field.C, `${name}: 처음 라인업`);
}
// 다른 구단 저장 → 그 구단 선수단으로 (안내 없음 — 구단이 바뀐 것)
localStorage.setItem(INV_KEY, JSON.stringify({ ...before, club: 'zz' }));
reloadInventory();
ok(ownedIds().length === 26 && takeInvNotice() === null, '다른 구단 저장 → 이 구단 처음 선수단');
// 저장이 막혀도
const realSet = localStorage.setItem.bind(localStorage);
(localStorage as any).setItem = () => { throw new Error('quota'); };
let threw2 = false;
try { addCards([target('normal', 'p09')]); } catch { threw2 = true; }
ok(!threw2, '저장 공간이 차도 앱은 계속');
(localStorage as any).setItem = realSet;

console.log(`\n결과: 통과 ${passed} · 실패 ${failed}`);
if (failed) process.exitCode = 1;
