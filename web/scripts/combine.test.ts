// 선수조합 공식 시험 — node scripts/run-ts.mjs scripts/combine.test.ts
//  1. 확률 합은 늘 정확히 100% · 음수 없음 (무작위 재료 3,000세트)
//  2. 공식 판정 · 기본 등급(평균 내림) · 레전드 위 합치기 · 정확한 예시 값
//  3. 카드 풀 넓히기 (연도 → 같은 계보 → 구단 → 투수/타자) · 히든 프랜차이즈 풀
//  4. 10,000번 뽑기가 보여 준 확률과 맞음 · 결과 카드가 고정(구단 · 연도 · 투수/타자)을 지킴
//  5. 보관함과 함께 (draw.rollComboWith): 재료 빠짐 · 결과 들어옴 · 비용 한 번 · 실패하면 그대로 · 저장 검사
import './shim-storage';

let failed = 0, passed = 0;
function ok(cond: unknown, name: string, detail?: unknown) {
  if (cond) { passed++; return; }
  failed++;
  console.log('  실패:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 500) : '');
}
const sec = (t: string) => console.log('\n■ ' + t);

localStorage.clear();
const cb = await import('../src/game/combine');
const kbo = await import('../src/game/kbo');
const inv = await import('../src/game/inventory');
const mock = await import('../src/game/mock');
const draw = await import('../src/screens/gacha/draw');
const wallet = await import('../src/game/wallet');
type MatInfo = import('../src/game/combine').MatInfo;
type GradeId = import('../src/game/types').GradeId;
type Pos = import('../src/game/types').Pos;

/** 시드 난수 (mulberry32) */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let uid = 0;
const M = (grade: GradeId, club: string | null, year: number | null, pos: Pos): MatInfo => ({ id: `m${uid++}`, grade, club, year, pos });
const pctOf = (v: ReturnType<typeof cb.analyze>) => v.rows.map((r) => `${r.step}:${r.grade}:${r.pct}`).join(' ');
const metOf = (v: ReturnType<typeof cb.analyze>) => v.formulas.filter((f) => f.met).map((f) => f.id).sort().join(',');

/* ───── 1. 합 100 ───── */
sec('1. 확률 합 = 100% (무작위 재료)');
{
  const r = seeded(7);
  const G: GradeId[] = ['normal', 'special', 'rare', 'elite', 'legend', 'franchise', 'black', 'signature', 'mvp', 'gg', 'th'];
  const C = ['DJ', 'GJ', 'DG', 'SH', 'IC', 'JDR', 'HBE'];
  const P: Pos[] = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
  let bad = 0, neg = 0, sets = 0;
  for (let i = 0; i < 3000; i++) {
    const n = 1 + Math.floor(r() * 5);
    // 같은 값이 잘 겹치게 좁은 범위에서 고른다 (공식이 자주 맞게)
    const narrow = r() < 0.5;
    const mats = Array.from({ length: n }, () => M(
      G[Math.floor(r() * (narrow ? 3 : G.length))],
      C[Math.floor(r() * (narrow ? 2 : C.length))],
      r() < 0.15 ? null : 2010 + Math.floor(r() * (narrow ? 2 : 8)),
      P[Math.floor(r() * (narrow ? 3 : P.length))],
    ));
    const v = cb.analyze(mats);
    sets++;
    if (cb.unitsTotal(v) !== 1000 || Math.abs(v.rows.reduce((a, x) => a + x.pct, 0) - 100) > 1e-9) bad++;
    if (v.rows.some((x) => x.units <= 0 || !Number.isInteger(x.units))) neg++;
  }
  ok(bad === 0, `합이 늘 1000/1000 (${sets}세트)`, bad);
  ok(neg === 0, '줄마다 양의 정수 몫', neg);
  ok(cb.analyze([]).rows.length === 0, '재료 없으면 확률 줄 없음');
}

/* ───── 2. 공식 · 기본 등급 · 예시 값 ───── */
sec('2. 공식 판정 · 기본 등급 · 예시 값');
{
  // A. 아무 공식도 없음 — 노멀·스페셜·레어 평균 1 → 스페셜 기본 80/18/2
  const a = cb.analyze([M('normal', 'DJ', 2010, '1B'), M('special', 'GJ', 2011, 'LF'), M('rare', 'DG', 2012, 'P')]);
  ok(metOf(a) === '', '공식 없음', metOf(a));
  ok(a.base === 'special' && pctOf(a) === '0:special:80 1:rare:18 2:elite:2', 'A 스페셜 80 · 레어 18 · 엘리트 2', pctOf(a));
  ok(a.fee === 10_000 && a.ready, '3장 1만 GP');

  // B. 레어 5장 · 같은 구단 · 같은 연도 · 2루수+유격수 · 모두 타자 → 50 / 40 / 10
  const b = cb.analyze([M('rare', 'DG', 2015, '2B'), M('rare', 'DG', 2015, 'SS'), M('rare', 'DG', 2015, '1B'), M('rare', 'DG', 2015, 'LF'), M('rare', 'DG', 2015, 'CF')]);
  ok(metOf(b) === 'club,dynasty,grade,pair,side,year', 'B 같은 등급 · 구단 · 연도 · 왕조 · 포지션 · 짝', metOf(b));
  ok(pctOf(b) === '0:rare:50 1:elite:40 2:legend:10', 'B 레어 50 · 엘리트 40 · 레전드 10', pctOf(b));
  ok(b.fix.club === 'DG' && b.fix.year === 2015 && b.fix.side === 'B', 'B 결과 고정 구단 · 연도 · 타자', b.fix);
  ok(b.fee === 30_000 && b.moved === 120, 'B 5장 3만 GP · 옮긴 몫 12%p', [b.fee, b.moved]);

  // C. 엘리트 3장 (같은 등급) → 엘리트 76 · 레전드 24 (두 단계 위가 레전드로 합쳐짐)
  const c = cb.analyze([M('elite', 'DJ', 2010, 'P'), M('elite', 'GJ', 2011, '1B'), M('elite', 'SH', 2012, 'LF')]);
  ok(pctOf(c) === '0:elite:76 1:legend:24' && c.rows[1].merged.join() === '2', 'C 엘리트 76 · 레전드 24 (합침)', [pctOf(c), c.rows[1]?.merged]);
  ok(metOf(c) === 'grade', 'C 같은 등급만', metOf(c));

  // C2. 짝 조합까지: 엘리트 3장 같은 등급 + 투수+포수 → 760-20=740 / 220+20 / 20 → 엘리트 74 · 레전드 26
  const c2 = cb.analyze([M('elite', 'DJ', 2010, 'P'), M('elite', 'GJ', 2011, 'C'), M('elite', 'SH', 2012, 'LF')]);
  ok(metOf(c2) === 'grade,pair' && c2.rows[0].units === 740 && c2.rows[1].units === 260, 'C2 같은 등급 + 짝 → 74 / 26', [metOf(c2), c2.rows.map((x) => x.units)]);

  // D. 레전드로 쳐지는 등급만 (블랙 · 시그니처 · MVP · 레전드) → 레전드 100
  const d = cb.analyze([M('black', 'DJ', null, '1B'), M('signature', 'GJ', null, 'LF'), M('mvp', 'DG', 2019, 'P'), M('legend', 'SH', null, 'CF')]);
  ok(d.base === 'legend' && pctOf(d) === '0:legend:100' && d.capped === 3, 'D 모두 레전드 칸 → 레전드 100 · 쳐진 3장', [pctOf(d), d.capped]);
  ok(d.fee === 20_000, '4장 2만 GP');

  // E. 히든 — 엘리트 5장 · 같은 구단(프랜차이즈 있음) → 프랜차이즈 0.5% (같은 등급 몫에서)
  const e = cb.analyze([M('elite', 'SH', 2016, 'P'), M('elite', 'SH', 2017, 'C'), M('elite', 'SH', 2018, '2B'), M('elite', 'SH', 2019, 'SS'), M('elite', 'SH', 2020, 'LF')]);
  ok(metOf(e) === 'club,grade,hidden,pair', 'E 같은 등급 · 구단 · 짝 · 히든', metOf(e));
  ok(pctOf(e) === '0:elite:52.5 1:legend:47 hidden:franchise:0.5', 'E 엘리트 52.5 · 레전드 47 · 프랜차이즈 0.5', pctOf(e));
  ok(e.formulas.find((f) => f.id === 'hidden')?.avail === true, 'E 히든 칸 열림');

  // E2. 히든 — 4장이면 안 맞음 · 레어 섞이면 안 맞음 · 구단 다르면 안 맞음
  const e2 = cb.analyze([M('elite', 'SH', 2016, 'P'), M('elite', 'SH', 2017, 'C'), M('elite', 'SH', 2018, '2B'), M('elite', 'SH', 2019, 'SS')]);
  const e3 = cb.analyze([M('elite', 'SH', 2016, 'P'), M('elite', 'SH', 2017, 'C'), M('rare', 'SH', 2018, '2B'), M('elite', 'SH', 2019, 'SS'), M('elite', 'SH', 2020, 'LF')]);
  const e4 = cb.analyze([M('elite', 'SH', 2016, 'P'), M('elite', 'SH', 2017, 'C'), M('elite', 'DG', 2018, '2B'), M('elite', 'SH', 2019, 'SS'), M('legend', 'SH', null, 'LF')]);
  ok(![e2, e3, e4].some((v) => v.formulas.find((f) => f.id === 'hidden')!.met), '히든: 4장 · 레어 섞임 · 구단 다름 → 안 맞음');
  // E5. 엘리트 이상이면 레전드 · 수상 · 블랙도 됨
  const e5 = cb.analyze([M('elite', 'DG', 2016, 'P'), M('legend', 'DG', null, 'C'), M('gg', 'DG', 2018, '2B'), M('black', 'DG', null, 'SS'), M('elite', 'DG', 2020, 'LF')]);
  ok(e5.formulas.find((f) => f.id === 'hidden')!.met && e5.rows.some((r) => r.step === 'hidden'), '히든: 엘리트 · 레전드 · GG · 블랙 섞여도 맞음', pctOf(e5));
  // E6. 그 구단에 프랜차이즈가 없으면 같은 계보(인천 상륙스 → 인천 비룡스), 계보에도 없으면(전주 돌격대스) 칸이 안 생김
  const ic = cb.analyze(['P', 'C', '1B', 'LF', 'RF'].map((p, i) => M('elite', 'IC', 2018 + i, p as Pos)));
  const icRow = ic.rows.find((r) => r.step === 'hidden');
  ok(!!icRow && icRow.relaxed.join() === 'lineage', '히든: 인천 상륙스 → 같은 계보 프랜차이즈', icRow);
  const jd = cb.analyze(['P', 'C', '1B', 'LF', 'RF'].map((p, i) => M('elite', 'JDR', 1996 + i, p as Pos)));
  const jdH = jd.formulas.find((f) => f.id === 'hidden')!;
  ok(jdH.met && jdH.avail === false && !jd.rows.some((r) => r.step === 'hidden') && cb.unitsTotal(jd) === 1000, '히든: 전주 돌격대스는 칸 없음 · 합 100', [jdH, pctOf(jd)]);

  // F. 기본 등급 = 평균 내림 (노멀 0 · 레어 2 · 레어 2 → 1.33 → 스페셜)
  const f = cb.analyze([M('normal', 'DJ', 2010, '1B'), M('rare', 'GJ', 2011, 'LF'), M('rare', 'DG', 2012, 'P')]);
  ok(f.base === 'special' && Math.abs(f.avg - 4 / 3) < 1e-9, 'F 평균 1.33 → 스페셜', [f.base, f.avg]);
  const f2 = cb.analyze([M('elite', 'DJ', 2010, '1B'), M('legend', 'GJ', null, 'LF'), M('th', 'DG', 2012, 'P'), M('black', 'SH', null, 'C')]);
  ok(f2.base === 'elite', 'F2 3 · 4 · 4 · 4 → 3.75 → 엘리트', f2.avg);

  // G. 3장 미만 — 조합은 못 하지만 3장 기준 미리 보기
  const g = cb.analyze([M('rare', 'DJ', 2010, '1B'), M('rare', 'DJ', 2010, 'LF')]);
  ok(!g.ready && cb.unitsTotal(g) === 1000 && g.fee === 10_000, 'G 2장: 준비 아님 · 3장 기준 미리 보기');
  ok(cb.rollCombine(g, seeded(1)) === null, 'G 2장은 뽑기 안 됨');
  const one = cb.analyze([M('rare', 'DJ', 2010, '1B')]);
  ok(metOf(one) === '', '한 장일 땐 공식 판정 안 함', metOf(one));

  // H. 연도: 연도가 안 찍힌 카드(레전드)가 섞이면 연도 · 왕조 조합 안 됨
  const h = cb.analyze([M('elite', 'DG', 2015, '1B'), M('elite', 'DG', 2015, 'LF'), M('legend', 'DG', null, 'P')]);
  ok(metOf(h) === 'club', 'H 레전드 섞이면 구단만', metOf(h));

  // I. 포지션: 모두 투수 → 결과 투수 · 투수+포수는 짝이지만 포지션 조합은 아님
  const i = cb.analyze([M('normal', 'DJ', 2010, 'P'), M('special', 'GJ', 2011, 'P'), M('normal', 'DG', 2012, 'P')]);
  ok(i.fix.side === 'P' && metOf(i) === 'side', 'I 모두 투수 → 투수로 고정', [i.fix, metOf(i)]);
  const i2 = cb.analyze([M('normal', 'DJ', 2010, 'P'), M('special', 'GJ', 2011, 'C'), M('normal', 'DG', 2012, '1B')]);
  ok(i2.fix.side === null && metOf(i2) === 'pair', 'I2 투수+포수 → 짝, 포지션 조합 아님', metOf(i2));

  // J. 레전드 기본 + 공식 보너스는 모두 레전드 한 줄로
  const j = cb.analyze([M('legend', 'DG', null, 'P'), M('legend', 'DG', null, 'C'), M('legend', 'DG', null, '1B')]);
  ok(pctOf(j) === '0:legend:100', 'J 레전드 3장 → 레전드 100', pctOf(j));

  // K. 재료 정보 — 실제 선수 카드는 카탈로그 구단 · 4자리 연도, 레전드는 연도 없음
  const nk = kbo.kboCardsWhere({ grade: 'normal' })[0];
  const lk = kbo.kboCardsWhere({ grade: 'legend' })[0];
  const ni = cb.matInfoOf(kbo.cardInst(nk), kbo.playerOfKCard(nk)!);
  const li = cb.matInfoOf(kbo.cardInst(lk), kbo.playerOfKCard(lk)!);
  ok(ni.club === nk.code && ni.year === nk.year && li.year === null && li.club === lk.code, 'K 카탈로그 카드 → 구단 · 연도', [ni, li]);
}

/* ───── 3. 카드 풀 넓히기 ───── */
sec('3. 카드 풀 넓히기');
{
  const fix = (club: string | null, year: number | null, side: 'P' | 'B' | null) => ({ club, year, side });
  const p0 = cb.poolOf('rare', fix('DG', 2015, 'B'));
  ok(p0.cards.length > 0 && p0.relaxed.length === 0 && p0.cards.every((c) => c.code === 'DG' && c.year === 2015 && cb.sideOfCard(c) === 'B'), '대구 2015 레어 타자 — 그대로', p0.relaxed);
  // 수원 마법사즈(2015~)의 1990 엘리트는 없음 → 연도를 풂
  const p1 = cb.poolOf('elite', fix('SW', 1990, null));
  ok(p1.relaxed.join() === 'year' && p1.cards.every((c) => c.code === 'SW'), '없는 해 → 연도 풀고 그 구단', p1.relaxed);
  // 인천 상륙스는 레전드가 없음 → 같은 계보(인천 비룡스)
  const p2 = cb.poolOf('legend', fix('IC', null, null));
  ok(p2.relaxed.join() === 'lineage' && p2.cards.length > 0 && p2.cards.every((c) => c.code === 'IBY' || c.code === 'IC'), '인천 상륙스 레전드 → 같은 계보', [p2.relaxed, p2.cards.length]);
  // 전주 돌격대스는 계보에도 레전드가 없음 → 구단을 풂
  const p3 = cb.poolOf('legend', fix('JDR', 1998, 'B'));
  ok(p3.relaxed.join() === 'year,club' && p3.cards.every((c) => cb.sideOfCard(c) === 'B'), '전주 돌격대스 레전드 → 연도 · 구단 풀고 타자는 지킴', p3.relaxed);
  // 히든 프랜차이즈 칸 — 포지션 조합이 맞으면 투수/타자도 지킴 (없으면 '투수·타자' 를 풂)
  for (const club of ['DG', 'SH', 'BS', 'SW', 'GJ', 'HBE']) {
    for (const side of ['P', 'B'] as const) {
      const hp = cb.poolOf('franchise', fix(club, null, side), true);
      const keepSide = !hp.relaxed.includes('side');
      const okk = hp.cards.length > 0 && hp.cards.every((c) => c.grade === 'franchise' && (!keepSide || cb.sideOfCard(c) === side) && (hp.relaxed.includes('lineage') ? cb.lineageOf(club).includes(c.code) : c.code === club));
      if (!okk) ok(false, `히든 풀 ${club} ${side}`, [hp.relaxed, hp.cards.map((c) => c.code + cb.sideOfCard(c))]);
    }
  }
  ok(true, '히든 풀: 구단 · 계보 · 투수/타자 지킴');
  // 왕조: 그 해 그 구단 → 없으면 구단만
  const dyn = cb.poolOf('legend', fix('DG', 1983, null));
  ok(dyn.cards.length > 0 && dyn.cards.every((c) => c.code === 'DG'), '왕조 풀이 비면 구단만 (연도 풂)', dyn.relaxed);
  // 무작위 고정 — 넓히지 않은 조건은 모든 카드가 지킨다
  const r = seeded(3);
  const clubs = ['DJ', 'GJ', 'DG', 'BS', 'SB', 'ST', 'SH', 'IC', 'CW', 'SW', 'DDG', 'MDH', 'HBE', 'SCR', 'ISB', 'IJR', 'IDR', 'SUC', 'JDR', 'IBY'];
  let viol = 0, empty = 0;
  for (let k = 0; k < 400; k++) {
    const g = cb.LADDER[Math.floor(r() * 5)];
    const f = fix(r() < 0.8 ? clubs[Math.floor(r() * clubs.length)] : null, r() < 0.5 ? 1982 + Math.floor(r() * 45) : null, r() < 0.5 ? (r() < 0.5 ? 'P' : 'B') : null);
    const p = cb.poolOf(g, f);
    if (!p.cards.length) { empty++; continue; }
    const line = f.club ? cb.lineageOf(f.club) : null;
    for (const c of p.cards) {
      if (c.grade !== g) viol++;
      if (f.year != null && !p.relaxed.includes('year') && c.year !== f.year) viol++;
      if (f.club && !p.relaxed.includes('lineage') && !p.relaxed.includes('club') && c.code !== f.club) viol++;
      if (f.club && p.relaxed.includes('lineage') && !line!.includes(c.code)) viol++;
      if (f.side && !p.relaxed.includes('side') && cb.sideOfCard(c) !== f.side) viol++;
    }
  }
  ok(viol === 0 && empty === 0, '무작위 400 고정 — 풀이 비지 않고, 풀지 않은 조건은 지킴', { viol, empty });
}

/* ───── 4. 10,000번 뽑기 ───── */
sec('4. 10,000번 뽑기 = 보여 준 확률');
{
  const views = {
    '레어 왕조 50/40/10': cb.analyze([M('rare', 'DG', 2015, '2B'), M('rare', 'DG', 2015, 'SS'), M('rare', 'DG', 2015, '1B'), M('rare', 'DG', 2015, 'LF'), M('rare', 'DG', 2015, 'CF')]),
    '엘리트 히든 52.5/47/0.5': cb.analyze([M('elite', 'SH', 2016, 'P'), M('elite', 'SH', 2017, 'C'), M('elite', 'SH', 2018, '2B'), M('elite', 'SH', 2019, 'SS'), M('elite', 'SH', 2020, 'LF')]),
    '노멀 투수 3장': cb.analyze([M('normal', 'DJ', 2010, 'P'), M('normal', 'GJ', 2011, 'P'), M('normal', 'DG', 2012, 'P')]),
    '4장 짝 조합': cb.analyze([M('normal', 'DJ', 2010, '1B'), M('special', 'GJ', 2011, 'LF'), M('rare', 'DG', 2012, 'P'), M('special', 'SH', 2013, 'C')]),
  };
  const N = 10_000;
  for (const [name, v] of Object.entries(views)) {
    const r = seeded(name.length * 7919 + 13);
    const cnt = new Array(v.rows.length).fill(0);
    let fixBad = 0, gradeBad = 0;
    for (let k = 0; k < N; k++) {
      const x = cb.rollCombine(v, r)!;
      cnt[x.row]++;
      if (x.card.grade !== v.rows[x.row].grade) gradeBad++;
      if (v.fix.club && !x.relaxed.includes('club') && !x.relaxed.includes('lineage') && x.card.code !== v.fix.club) fixBad++;
      if (v.fix.year != null && x.step !== 'hidden' && !x.relaxed.includes('year') && x.card.year !== v.fix.year) fixBad++;
      if (v.fix.side && x.step !== 'hidden' && !x.relaxed.includes('side') && cb.sideOfCard(x.card) !== v.fix.side) fixBad++;
      if (x.up !== (x.step === 'hidden' || cb.ladderOf(x.grade) > v.baseIdx)) gradeBad++;
    }
    const worst = v.rows.map((row, i) => {
      const p = row.units / 1000, f = cnt[i] / N;
      const tol = 4 * Math.sqrt((p * (1 - p)) / N) + 0.001;
      return { g: row.grade, shown: row.pct, got: +(f * 100).toFixed(2), okk: Math.abs(f - p) <= tol };
    });
    const line = `${name}: ${worst.map((w) => `${w.g} ${w.shown}%→${w.got}%`).join(' · ')}`;
    console.log('  ' + line);
    ok(worst.every((w) => w.okk), line, worst);
    ok(fixBad === 0 && gradeBad === 0, `${name}: 결과가 고정 · 등급을 지킴`, { fixBad, gradeBad });
  }
  // 재료 카드는 결과에서 뺀다 — view.exclude(넣은 재료 id). 묶인 풀이 재료뿐이면 더 푼다 · 등급 확률은 그대로
  {
    const groups = new Map<string, import('../src/game/kbo').KCard[]>();
    for (const c of kbo.kboCardsWhere({ grade: 'rare' })) {
      if (cb.sideOfCard(c) !== 'B') continue;
      const k = `${c.code}|${c.year}`;
      const l = groups.get(k) ?? [];
      l.push(c);
      groups.set(k, l);
    }
    const exact = [...groups.values()].find((l) => l.length === 5)!; // 그 해 그 구단 레어 타자가 딱 5장 → 모두 재료
    const mats = exact.map((c) => cb.matInfoOf(kbo.cardInst(c), kbo.playerOfKCard(c)!));
    const v = cb.analyze(mats);
    ok(v.exclude.size === 5 && v.fix.club === exact[0].code && v.fix.year === exact[0].year, '재료 5장 → 빼둘 카드 5장 · 왕조 고정', [v.exclude.size, v.fix]);
    ok(v.rows[0].grade === 'rare' && v.rows[0].relaxed.join() === 'year', '같은 등급 풀이 재료뿐 → 연도를 풀어 같은 구단 다른 카드', v.rows[0].relaxed);
    const r = seeded(4242);
    let hitEx = 0, rare = 0, wrongClub = 0;
    for (let k = 0; k < 3000; k++) {
      const x = cb.rollCombine(v, r)!;
      if (v.exclude.has(x.card.id)) hitEx++;
      if (x.grade === 'rare') { rare++; if (x.card.code !== v.fix.club) wrongClub++; }
    }
    ok(hitEx === 0 && wrongClub === 0, '3,000번 — 재료 카드는 한 번도 안 나옴 · 레어는 그 구단', { hitEx, wrongClub });
    ok(Math.abs(rare / 3000 - v.rows[0].pct / 100) < 0.04, '등급 확률은 그대로', [rare / 3000, v.rows[0].pct]);
    const res0 = cb.rollCombine(v, seeded(9))!;
    const reel0 = cb.reelOf(v, res0.card, 24, seeded(6));
    ok(reel0.slice(0, 23).every((c) => !v.exclude.has(c.id) && c.id !== res0.card.id), '릴에도 재료 · 결과 카드는 먼저 안 나옴');
    // 레전드 풀이 재료(뺄 카드)뿐 → 같은 계보 구단으로 넓힘 (한밭 독수리스 → 대전 독수리스)
    const v2 = cb.analyze([M('legend', 'HBE', null, 'P'), M('legend', 'HBE', null, 'C'), M('legend', 'HBE', null, '1B')]);
    const hbe = new Set(cb.poolOf('legend', v2.fix).cards.map((c) => c.id));
    const x2 = cb.rollCombine(v2, seeded(1), hbe);
    ok(!!x2 && x2.grade === 'legend' && !hbe.has(x2.card.id) && x2.relaxed.includes('lineage'), '레전드 풀이 재료뿐 → 같은 계보 구단 레전드', x2 && [x2.card.code, x2.relaxed]);
  }
  // 릴: 마지막 장 = 결과, 장수
  const v = views['레어 왕조 50/40/10'];
  const res = cb.rollCombine(v, seeded(99))!;
  const reel = cb.reelOf(v, res.card, 24, seeded(5));
  ok(reel.length === 24 && reel[23].id === res.card.id && reel.slice(0, 23).every((c) => c.id !== res.card.id), '릴 24장 · 마지막이 결과', reel.length);
  const t = cb.reelTimings(24, 3000);
  ok(Math.abs(t.reduce((a, b) => a + b, 0) - 3000) < 30 && t[0] < t[23], '릴 간격 합 3초 · 점점 느리게', [t[0], t[23]]);
}

/* ───── 5. 보관함과 함께 ───── */
sec('5. 보관함과 함께 (rollComboWith)');
{
  inv.resetInventory();
  // 같은 구단 · 같은 연도 노멀 5장(서로 다른 카드)을 받는다
  const byKey = new Map<string, import('../src/game/kbo').KCard[]>();
  for (const c of kbo.kboCardsWhere({ grade: 'normal' })) {
    const k = `${c.code}|${c.year}`;
    const l = byKey.get(k) ?? [];
    l.push(c);
    byKey.set(k, l);
  }
  const owned = new Set(inv.ownedIds());
  const set = [...byKey.values()].find((l) => l.filter((c) => !owned.has(c.id)).length >= 5)!.filter((c) => !owned.has(c.id)).slice(0, 5);
  const ids = inv.addCards(set.map(kbo.cardInst)).map((x) => x.id);
  const infoOf = (id: string) => { const c = inv.ownedCard(id)!; return cb.matInfoOf(c, mock.playerOfCard(c)); };
  const view = cb.analyze(ids.map(infoOf));
  ok(view.ready && view.fix.club === set[0].code && view.fix.year === set[0].year, '받은 5장 → 구단 · 연도 조합', [view.fix, metOf(view)]);
  const use = Object.fromEntries(ids.map((id) => [id, 1]));
  const before = inv.snapshot();

  // 비용을 못 내면 아무것도 안 바뀜
  const noPay = draw.rollComboWith({ view, use, pay: () => false, seed: 'a' });
  ok(!noPay.ok && noPay.why === 'gp' && JSON.stringify(inv.snapshot()) === JSON.stringify(before), '비용 모자람 → 그대로');
  // 남는 장보다 많이 → 비용도 안 냄
  let paid = 0;
  const tooMany = draw.rollComboWith({ view, use: { ...use, [ids[0]]: 2 }, pay: () => { paid++; return true; }, seed: 'b' });
  ok(!tooMany.ok && tooMany.why === 'material' && paid === 0 && JSON.stringify(inv.snapshot()) === JSON.stringify(before), '재료 모자람 → 비용 안 내고 그대로');
  // 라인업 카드 마지막 1장은 못 씀
  const lineupId = [...inv.lineupIds()].find((id) => inv.ownedCount(id) === 1)!;
  const lu = draw.rollComboWith({ view: cb.analyze([infoOf(ids[0]), infoOf(ids[1]), infoOf(lineupId)]), use: { [ids[0]]: 1, [ids[1]]: 1, [lineupId]: 1 }, pay: () => { paid++; return true; }, seed: 'c' });
  ok(!lu.ok && lu.why === 'material' && paid === 0, '라인업 카드 마지막 1장 → 못 씀');

  // 진짜 조합 — 지갑에서 비용
  const gp0 = wallet.readWallet().gp;
  const res = draw.rollComboWith({ view, use, pay: () => wallet.spend({ gp: view.fee }), seed: 'combine-test' });
  ok(res.ok, '조합 성공', res);
  if (res.ok) {
    ok(wallet.readWallet().gp === gp0 - 30_000, '비용 3만 GP 한 번', [gp0, wallet.readWallet().gp]);
    ok(ids.every((id) => inv.ownedCount(id) === 0), '재료 5장 빠짐');
    ok(inv.isOwned(res.result.card.id), '결과 카드가 보관함에', res.result.card.id);
    ok(!ids.includes(res.result.card.id), '결과는 넣은 재료와 다른 카드', res.result.card.id);
    ok(inv.stats().rouletteUsed === before.stats.rouletteUsed + 5, '조합에 쓴 장수 +5');
    ok(inv.checkInventory().length === 0, '저장 검사 통과', inv.checkInventory().slice(0, 3));
    const row = view.rows[res.roll.row];
    ok(res.result.card.grade === row.grade && cb.ladderOf(row.grade) >= view.baseIdx, '결과 등급 = 뽑힌 줄', [res.result.card.grade, row.grade]);
    if (!res.roll.relaxed.includes('club') && !res.roll.relaxed.includes('lineage')) ok(kbo.kboCard(res.result.card.id)?.code === view.fix.club, '결과가 그 구단 카드');
    // 같은 재료로 다시 → 이미 다 썼으니 실패
    const again = draw.rollComboWith({ view, use, pay: () => { paid++; return true; }, seed: 'd' });
    ok(!again.ok && again.why === 'material' && paid === 0, '다 쓴 재료로 다시 → 실패');
  }
  // 저장 왕복
  inv.reloadInventory();
  ok(inv.checkInventory().length === 0 && ids.every((id) => inv.ownedCount(id) === 0), '다시 읽어도 그대로');
}

console.log(`\n결과: 통과 ${passed} · 실패 ${failed}`);
if (failed) process.exit(1);
