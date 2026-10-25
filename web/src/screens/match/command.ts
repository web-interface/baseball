// 경기 중 작전 — 감독 명령을 '그 투구부터' 엔진에 넣고 남은 경기를 다시 계산한다. 사용자 지시 10-25 "작전하면 바로바로 반영"
//  · 엔진은 결정적이라 명령 앞 투구까지는 이전 계산과 똑같다 → 이미 본 장면은 그대로, 그 뒤만 바뀐다
//  · 명령은 내 팀만(엔진이 isUser 팀 명령만 받는다). 낸 명령은 시즌 저장(pending.cmds)에 남겨 다시 열어도 · 결과를 넣을 때도 같은 경기
import type { Command } from '../../../../shared/engine/index.ts';
import type { GameRun } from '../../season/sim';
import { fromEngine, type EngineMeta } from './engine-game';
import type { FullGame, FullPlay, SubEv } from './local-mock';
import type { Beat } from './timeline';

type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** 명령 본문 — 투구 번호 · 팀은 넣을 때 붙인다 */
export type CmdBody = DistOmit<Command, 'at' | 'team' | 'id'>;

export interface PenInfo { id: string; role: string; avail: number }
export interface Commander {
  side: 'away' | 'home';
  readonly cmds: Command[];
  readonly run: GameRun;
  /** 명령을 더해 다시 계산한 경기 */
  issue(body: CmdBody, at: number): FullGame;
  /** 경기 시작 때 불펜(보직 · 등판 가능 2 가능 · 1 비상시 · 0 불가) · 벤치 */
  pen(): PenInfo[];
  bench(): string[];
}

export function makeCommander(o: {
  run: GameRun; rerun: (cmds: Command[]) => GameRun; meta: EngineMeta; side: 'away' | 'home'; cmds: Command[]; onChange: (cmds: Command[]) => void;
}): Commander {
  let run = o.run;
  let cmds = o.cmds.slice();
  const sideIn = () => (o.side === 'away' ? run.away : run.home);
  return {
    side: o.side,
    get cmds() { return cmds; },
    get run() { return run; },
    issue(body, at) {
      cmds = [...cmds, { ...body, at, team: o.side } as Command];
      run = o.rerun(cmds);
      o.onChange(cmds);
      return fromEngine(run, o.meta);
    },
    pen: () => sideIn().team.pen.map((p) => ({ id: sideIn().webOf.get(p.pid) ?? '', role: p.role, avail: p.avail })).filter((x) => !!x.id),
    bench: () => sideIn().team.bench.map((pid) => sideIn().webOf.get(pid) ?? '').filter(Boolean),
  };
}

/** 이 플레이의 첫 공 · 다음 공의 엔진 투구 번호 (seq.no = 그 타석 안 순번 1부터) */
const firstNo = (p: FullPlay) => (p.fake ? p.p0! + (p.np ?? 0) : p.p0! + ((p.seq[0]?.no ?? 1) - 1));
const afterPlay = (p: FullPlay) => (p.fake || p.isPA ? p.p0! + (p.np ?? 0) : p.p0! + (p.seq[p.seq.length - 1]?.no ?? 0));

/** 지금 박자에서 명령이 들어갈 투구 번호 — 던지고 있는 공은 그대로 두고 그다음 공부터 (끝났으면 null) */
export function atOfBeat(b: Beat | undefined, plays: FullPlay[]): number | null {
  if (!b || b.k === 'end') return null;
  const p = 'play' in b ? plays[b.play] : undefined;
  if (!p || p.p0 == null) return null;
  switch (b.k) {
    case 'half': case 'event': return firstNo(p);
    case 'pitch': case 'steal': return p.fake ? afterPlay(p) : p.p0 + (p.seq[b.pitch]?.no ?? 0);
    default: return afterPlay(p);
  }
}

/** 새 박자 줄에서 같은 자리(종류 · 플레이 · 공) — 없으면 그 플레이 첫 박자 */
export function sameBeat(beats: Beat[], b: Beat): number {
  const k = beats.findIndex((x) => x.k === b.k && ('play' in x ? x.play : -1) === ('play' in b ? b.play : -2)
    && ('pitch' in x ? x.pitch : -1) === ('pitch' in b ? b.pitch : -1) && ('ev' in x ? x.ev : -1) === ('ev' in b ? b.ev : -1));
  if (k >= 0) return k;
  const play = 'play' in b ? b.play : 0;
  const j = beats.findIndex((x) => 'play' in x && x.play >= play);
  return j >= 0 ? j : beats.length - 1;
}

/** 지금까지(투구 번호 at 앞) 경기에 나온 내 선수 — 교체로 들어온 선수 · 마운드에 선 투수 */
export function usedBefore(subs: SubEv[] | undefined, side: 'away' | 'home', at: number): Set<string> {
  const out = new Set<string>();
  for (const s of subs ?? []) if (s.side === side && s.pitch <= at && s.inId) out.add(s.inId);
  return out;
}
