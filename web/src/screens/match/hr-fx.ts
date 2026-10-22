// 홈런 연출 연결 — 다른 개발자가 만드는 web/src/fx/homerun 모듈의 playHomerunFx(무대, 정보, { length }) 를 부른다. fx 폴더는 고치지 않는다.
// 모듈이 아직 저장소에 없으면 아무것도 안 한다(import.meta.glob 은 없는 파일이면 빈 묶음 — 빌드도 안 깨짐).
// 빨리 보기는 짧은 판(short), 주요 장면·이닝별·자세히는 긴 판(long · 만루면 세리머니까지).
import { ME, playerById, teamById } from '../../game/mock';
import { GAME, type FullPlay } from './local-mock';

const mods = import.meta.glob('../../fx/homerun/index.ts');

/** fx/homerun 의 HomerunInfo 와 같은 모양 — 모듈이 없을 때도 빌드되게 여기 따로 적는다 */
export interface HrInfo {
  /** 같은 홈런은 같은 연출 (시드) */
  id?: string;
  /** 홈런 전 주자 수 — 3 이면 만루 */
  runners: 0 | 1 | 2 | 3;
  walkoff?: boolean;
  lead?: 'reverse' | 'tie' | 'go-ahead' | null;
  distM?: number;
  /** 엔진 타구 각도 (−45 3루 선 · 0 중견 · +45 1루 선) */
  angle?: number;
  outOfPark?: boolean;
  /** 연속 타자 홈런 — 2 = 백투백 */
  streak?: number;
  leadoff?: boolean | 'game';
  pinch?: boolean;
  batter?: string;
  team?: { primary: string; secondary?: string; accent?: string; ink?: string };
  home?: boolean;
  mine?: boolean;
  inning?: number;
  half?: 'top' | 'bot';
  outs?: 0 | 1 | 2;
}
export type HrLength = 'short' | 'long';
export interface HrHandle {
  /** 끝나면(건너뛰기 포함) 풀린다 */
  done: Promise<void>;
  skip(): void;
  /** 바로 정리 — 화면을 떠나거나 다른 장면으로 갈 때 */
  stop(): void;
}
type FxModule = { playHomerunFx?: (host: HTMLElement, info: HrInfo, opts?: { length?: HrLength }) => HrHandle };

/** 장외로 칠 거리 (m) */
const OUT_OF_PARK_M = 150;

/** 경기 기록의 홈런 한 장면 → 연출 정보 (몇 점 · 역전/동점/앞서감 · 끝내기 · 백투백 · 선두타자 · 대타) */
export function hrInfoOf(plays: readonly FullPlay[], i: number): HrInfo {
  const p = plays[i];
  const side = p.half === 'top' ? 0 : 1;
  const batTeam = teamById(side === 0 ? GAME.match.awayId : GAME.match.homeId);
  const runs = Math.max(1, Math.min(4, p.rbi || 1 + p.basesBefore.filter(Boolean).length));
  const opp = p.score[1 - side];
  const before = p.score[side] - runs;
  const after = p.score[side];
  const lead = before < opp && after > opp ? 'reverse' : before < opp && after === opp ? 'tie' : before === opp && after > opp ? 'go-ahead' : null;
  const sameHalf = (q: FullPlay) => q.inning === p.inning && q.half === p.half;
  let streak = 1;
  for (let j = i - 1; j >= 0 && sameHalf(plays[j]); j--) {
    if (!plays[j].isPA) continue;
    if (plays[j].code !== 'HR') break;
    streak++;
  }
  let first = true;
  for (let j = i - 1; j >= 0 && sameHalf(plays[j]); j--) if (plays[j].isPA) { first = false; break; }
  const dist = p.hit?.distM;
  return {
    id: `${GAME.match.id}:${p.id}`,
    runners: (runs - 1) as HrInfo['runners'],
    walkoff: i === plays.length - 1 && side === 1 && p.inning >= 9 && p.score[1] > p.score[0],
    lead,
    distM: dist != null ? Math.round(dist) : undefined,
    angle: p.hit?.angle,
    outOfPark: dist != null && dist >= OUT_OF_PARK_M,
    streak: streak > 1 ? streak : undefined,
    leadoff: first ? (p.inning === 1 && side === 0 ? 'game' : true) : undefined,
    pinch: p.pre.some((e) => e.kind === 'pinch-hit' && e.inId === p.batterId) || undefined,
    batter: playerById(p.batterId)?.name,
    team: batTeam.colors,
    home: side === 1,
    mine: batTeam.id === ME.teamId,
    inning: p.inning,
    half: p.half,
    outs: p.outsBefore,
  };
}

/** 무대(host) 위에 홈런 연출을 띄운다 — 모듈이 없거나 실패하면 null (경기는 그대로) */
export async function homerunFx(host: HTMLElement | null, info: HrInfo, length: HrLength): Promise<HrHandle | null> {
  const load = Object.values(mods)[0];
  if (!load || !host) return null;
  try {
    const m = (await load()) as FxModule;
    return typeof m.playHomerunFx === 'function' ? m.playHomerunFx(host, info, { length }) : null;
  } catch {
    return null;
  }
}
