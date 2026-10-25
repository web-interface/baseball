// 투수 팔 상태 — 지난 며칠 던진 공 수(시즌 저장의 경기 기록 GameRec.u · 포스트시즌 PostGameRec.u)로 오늘 등판 가능 여부를 정한다.
// 예전엔 피로가 날을 넘겨 이어지지 않아(하루하루 새로) 불펜 투수가 매일 나와 시즌 100경기 넘게 던졌다 — 사용자 지시 10-25 "불펜투수 문제 해결".
// 규칙은 공용 엔진과 같다(shared/engine/fatigue — dayPitcher 회복 · availability 연투 규칙):
//   · 어제 · 그제 이틀 연속 던졌으면 오늘 불가 · 어제 30구↑ 불가 · 어제 15구↑ 또는 팔 피로 60↑ 이면 비상시만
//   · 팔 피로 = 날마다 회복(18 × (0.7 + 0.006 × 회복력)) 뒤 그날 던진 공 × 0.55
//   · 한 주 관리: 최근 5일 3번 등판이면 비상시만 · 최근 7일 4번이면 쉰다
// 같은 날짜보다 앞선 날만 본다 — 지난 경기를 다시 계산해도(박스스코어 · 다시 보기) 그때와 같은 상태(결정적). 기록이 없는 옛 저장은 '안 던짐'.
import { availability } from '../../../shared/engine/fatigue.ts';
import { allDays, type SeasonState } from './store';

export interface ArmLoad {
  /** 어제 · 그제 · 사흘 전 던진 공 수 */
  b2b: [number, number, number];
  /** 팔 피로 0~100 */
  arm: number;
  /** 마지막 등판이 며칠 전인가 (없으면 99) */
  since: number;
  /** 최근 5일 · 7일 등판 횟수 */
  apps5: number;
  apps7: number;
}
const DAY_MS = 86400000;
const t = (date: string) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
/** 살펴보는 날 수 — 팔 피로는 1주일이면 거의 다 풀린다 */
const LOOK = 7;

/** 그 날짜 경기 전 투수마다 팔 상태 (선수 보기 id → 상태). recovery = 선수 회복력(없으면 50) */
export function armLoads(s: SeasonState, date: string, recovery: (id: string) => number = () => 50): Map<string, ArmLoad> {
  const today = t(date);
  // 날마다 던진 공 — dayBack(1 = 어제 … LOOK) → id → 공 수
  const thrown = new Map<string, number[]>();
  const add = (d: string, u: [string, number][] | undefined) => {
    if (!u) return;
    const back = Math.round((today - t(d)) / DAY_MS);
    if (back < 1 || back > LOOK) return;
    for (const [id, n] of u) {
      const a = thrown.get(id) ?? new Array<number>(LOOK + 1).fill(0);
      a[back] += n;
      thrown.set(id, a);
    }
  };
  const days = allDays(s);
  for (let i = Math.min(s.results.length, days.length) - 1; i >= 0; i--) {
    const d = days[i];
    if (!d) continue;
    const back = (today - t(d.date)) / DAY_MS;
    if (back > LOOK) break;
    for (const g of s.results[i] ?? []) add(d.date, g.u);
  }
  for (const sr of s.post?.series ?? []) for (const g of sr.games) add(g.date, g.u);
  const out = new Map<string, ArmLoad>();
  for (const [id, a] of thrown) {
    const rec = 18 * (0.7 + 0.006 * recovery(id));
    let arm = 0;
    for (let back = LOOK; back >= 1; back--) arm = Math.min(100, Math.max(0, arm - rec) + a[back] * 0.55);
    let since = 99;
    for (let back = 1; back <= LOOK; back++) if (a[back] > 0) { since = back; break; }
    let apps5 = 0, apps7 = 0;
    for (let back = 1; back <= LOOK; back++) if (a[back] > 0) { apps7++; if (back <= 5) apps5++; }
    out.set(id, { b2b: [a[1], a[2], a[3]], arm, since, apps5, apps7 });
  }
  return out;
}

/** 구원 투수 오늘 등판: 2 가능 · 1 비상시만 · 0 불가 — 엔진 availability(연투 · 투구 수 · 팔 피로) +
 *  한 주 관리(KBO 불펜 운용): 최근 5일 3번 나왔으면 비상시만, 최근 7일 4번이면 쉰다 */
export function relieverAvail(l: ArmLoad | undefined): 0 | 1 | 2 {
  if (!l) return 2;
  const base = availability({ b2b: l.b2b, arm: l.arm }, false, 0, false);
  if (l.apps7 >= 4) return 0;
  if (l.apps5 >= 3) return Math.min(base, 1) as 0 | 1;
  return base;
}
/** 오늘 선발이 아닌 선발 투수의 롱릴리프: 마지막 등판 사흘 뒤부터 비상시만, 다음 날 · 모레 선발이면 쉰다 */
export function starterRelief(l: ArmLoad | undefined, startsSoon: boolean): 0 | 1 {
  if (startsSoon) return 0;
  return !l || l.since >= 3 ? 1 : 0;
}
