// 홈런 연출 연결 지점 — 다른 개발자가 만드는 web/src/fx/homerun 모듈이 index.ts 에서 playHomerun(opts) 를 내보내면 그걸 부른다.
// 모듈이 아직 없으면 아무것도 안 한다(빌드도 안 깨짐 — import.meta.glob 은 없는 파일이면 빈 묶음).
// 빨리 보기는 짧은 판(short), 주요 장면·이닝별·자세히는 긴 판. 만루 홈런은 grandSlam.
const mods = import.meta.glob('../../fx/homerun/index.ts');

export interface HrFxOpts {
  /** 이 홈런으로 들어온 점수 (1~4) */
  runs: number;
  grandSlam: boolean;
  /** 빨리 보기 — 짧은 판 */
  short: boolean;
  batterId: string;
  /** 친 팀 색 */
  teamColor: string;
  /** 경기 화면 무대 (연출을 얹을 곳) */
  host?: HTMLElement | null;
  /** 끝내기 · 역전 같은 상황 */
  walkoff?: boolean;
}

export async function homerunFx(o: HrFxOpts): Promise<void> {
  const load = Object.values(mods)[0];
  if (!load) return;
  try {
    const m = (await load()) as { playHomerun?: (opts: HrFxOpts) => unknown };
    await m.playHomerun?.(o);
  } catch { /* 연출이 실패해도 경기는 그대로 */ }
}
