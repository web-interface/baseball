// 옛 저장 만들기 — '실제 선수 카탈로그 전' 커밋(b795765)의 코드로 돌려, 그 시절 이 기기에 남았을 보유 카드 저장(bb.inv v1)을 만든다.
//  node scripts/run-ts.mjs <옛 worktree>/web/scripts/legacy-fixture.ts --node-paths web/node_modules <출력.json>
//  (이 파일을 옛 worktree 의 web/scripts 에 복사해 돌린다 — import 경로가 그 worktree 의 src 를 가리키게)
//  출력: { storage: { bb.inv, bb.start, bb.special? }, expect: { ids, sumN, cards: {id: [이름, 등급, 종합]} } }
import './shim-storage';
import { writeFileSync } from 'node:fs';
import { PACKS, playerOfCard } from '../src/game/mock';
import { ownedCard, ownedIds, reloadInventory, snapshot, tryEnhance } from '../src/game/inventory';
import { pullPack, rollCombo, type Pick } from '../src/screens/gacha/draw';
import { draftPool, resetStarter } from '../src/game/starter';
import type { ClubCode } from '../src/game/types';

localStorage.clear();
const pool = draftPool('dj');
const picks = [pool.find((p) => p.pos === 'C')!, ...pool.filter((p) => p.pos !== 'C').slice(0, 2)].map((p) => p.id);
localStorage.setItem('bb.start', JSON.stringify({ club: 'dj', picks, level: 'futures' }));
resetStarter();
reloadInventory();
// 뽑기 — 기본 팩 · 연도팩 · 구단팩(옛 구단 포함) 섞어서
const pk = (id: string) => PACKS.find((p) => p.id === id)!;
const picksOf: (Pick | null)[] = [null, { kind: 'year', year: 1995 }, { kind: 'year', year: 2026 }, { kind: 'club', club: 'DDG' as ClubCode }, { kind: 'club', club: 'GJ' as ClubCode }];
let n = 0;
for (let k = 0; k < 12; k++) {
  for (const pack of PACKS) {
    const pick = pack.pick ? picksOf[(k % 4) + 1] : null;
    if (pack.pick && pick && pack.pick.kind !== pick.kind) continue;
    pullPack(pack, pick, { seed: `fixture-${k}-${pack.id}` });
    n++;
  }
}
void pk;
// 조합 몇 번 · 강화 도전 몇 번
const spare = ownedIds().filter((id) => (snapshot().cards[id]?.n ?? 0) > 2).slice(0, 3);
for (const id of spare) rollCombo([{ grade: 'rare', pct: 50, label: '레어' }, { grade: 'elite', pct: 50, label: '엘리트' }], { [id]: 1 }, `fx-combo-${id}`);
for (const id of ownedIds().slice(0, 40)) tryEnhance(id, () => true);
const ids = ownedIds();
const s = snapshot();
const cards: Record<string, [string, string, number]> = {};
for (const id of ids) { const c = ownedCard(id)!; cards[id] = [playerOfCard(c).name, c.grade, c.ovr ?? playerOfCard(c).ovr]; }
const out = {
  storage: Object.fromEntries(['bb.inv', 'bb.start', 'bb.special'].map((k) => [k, localStorage.getItem(k)]).filter(([, v]) => v != null)),
  expect: { ids: ids.sort(), sumN: Object.values(s.cards).reduce((a, e) => a + e.n, 0), got: s.stats.got, v: s.v, packs: n, cards },
};
writeFileSync(process.argv[2], JSON.stringify(out));
console.log(`옛 저장 v${s.v} · 카드 종류 ${ids.length} · 보유 합 ${out.expect.sumN} · 팩 ${n}`);
