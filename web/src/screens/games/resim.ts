// 다른 구단끼리 경기 박스스코어 — 저장하지 않고 볼 때 다시 계산한다.
// 시즌이 쓴 것과 같은 입력: 정규 = runGame(시즌 시드, 그날 순번, 날짜, 원정, 홈) (run.computeDay 와 같음),
// 포스트시즌 = runGame(시즌 시드, 1000 + n, 날짜, 원정, 홈, { post }) (post.playOtherPostGame 과 같음).
// 엔진은 결정적이고 AI 세기는 시즌 첫 경기 때 고정(league.freezeAiRef)이라 같은 경기가 나온다 — 그래도 점수 · 이닝이
// 기록과 다르면(엔진이 바뀐 옛 기록 등) 박스를 보여 주지 않고 점수만.
import { ME } from '../../game/mock';
import { allDays, getSeason } from '../../season/store';
import { loadSim } from '../../season/run';
import { notesOfRun, parseBoxKey, viewOfOut, type BoxView } from '../../season/box';
import { postGames } from './shared';

export type Resim =
  | { kind: 'box'; view: BoxView }
  | { kind: 'mismatch'; score: [number, number]; innings?: number }
  | { kind: 'none'; why: string };

const cache = new Map<string, Resim>();

export async function resimGame(key: string): Promise<Resim> {
  const s = getSeason();
  const ck = `${s.seed}:${key}`;
  const hit = cache.get(ck);
  if (hit) return hit;
  const k = parseBoxKey(key);
  if (!k) return { kind: 'none', why: '경기를 찾지 못했어요' };
  if (k.away === ME.teamId || k.home === ME.teamId) return { kind: 'none', why: '박스스코어가 없어요' };
  let res: Resim;
  if (!k.post) {
    const d = allDays(s)[k.n];
    const rec = k.n < s.next ? s.results[k.n]?.find((r) => r.a === k.away && r.h === k.home) : undefined;
    if (!d || !rec) res = { kind: 'none', why: '아직 치르지 않은 경기예요' };
    else if (rec.c) res = { kind: 'none', why: '비로 취소된 경기예요' };
    else {
      const sim = await loadSim();
      const run = sim.runGame(s.seed, d.day, d.date, k.away, k.home, { log: true });
      const ok = run.out.score[0] === rec.s[0] && run.out.score[1] === rec.s[1] && (rec.inn == null || rec.inn === run.out.innings);
      res = ok ? { kind: 'box', view: viewOfOut(key, run.out, notesOfRun(run)) } : { kind: 'mismatch', score: rec.s, innings: rec.inn };
    }
  } else {
    const at = postGames(s.post).find((x) => x.n === k.n && x.rec.away === k.away && x.rec.home === k.home);
    if (!at) res = { kind: 'none', why: '아직 치르지 않은 경기예요' };
    else {
      const sim = await loadSim();
      const run = sim.runGame(s.seed, 1000 + at.n, at.rec.date, k.away, k.home, { post: true, log: true });
      const ok = run.out.score[0] === at.rec.s[0] && run.out.score[1] === at.rec.s[1] && run.out.innings === at.rec.inn;
      res = ok ? { kind: 'box', view: viewOfOut(key, run.out, notesOfRun(run), { series: at.series, no: at.rec.no }) } : { kind: 'mismatch', score: at.rec.s, innings: at.rec.inn };
    }
  }
  cache.set(ck, res);
  if (cache.size > 40) cache.delete(cache.keys().next().value!);
  return res;
}
