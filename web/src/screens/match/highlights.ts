// 강조 장면 고르기 — 승리 확률 변화 · 점수 흐름 · 잡을 확률로 (엔진 경기 · 대전 경기 공통). 화면은 이 중 3~4개만 띄운다(timeline).
import { playerById } from '../../game/mock';
import type { HighlightKind } from '../../game/types';
import type { FullPlay } from './local-mock';

const nameOf = (id: string) => playerById(id)?.name ?? '선수';

export function markHighlights(plays: FullPlay[], awayId: string, homeId: string, walkoff: boolean) {
  plays.forEach((pl, k) => {
    if (!pl.isPA) return;
    const homeBat = pl.half === 'bot';
    const gain = (pl.wp[1] - pl.wp[0]) * (homeBat ? 1 : -1);
    const batTeam = homeBat ? homeId : awayId;
    const fldTeam = homeBat ? awayId : homeId;
    const prevScore = k > 0 ? plays[k - 1].score : [0, 0];
    const myB = homeBat ? prevScore[1] : prevScore[0], opB = homeBat ? prevScore[0] : prevScore[1];
    const myA = homeBat ? pl.score[1] : pl.score[0], opA = homeBat ? pl.score[0] : pl.score[1];
    const pct = (v: number) => Math.round(v * 100);
    const meB = homeBat ? pl.wp[0] : 1 - pl.wp[0], meA = homeBat ? pl.wp[1] : 1 - pl.wp[1];
    const meta = `승리 확률 ${pct(meB)}% → ${pct(meA)}%`;
    const inn = `${pl.inning}회${pl.half === 'top' ? '초' : '말'}`;
    let h: { kind: HighlightKind; title: string; sub: string; meta?: string; teamId: string } | undefined;
    if (walkoff && k === plays.length - 1 && homeBat && myA > myB) {
      h = { kind: 'walkoff', title: '끝내기!', sub: `${nameOf(pl.batterId)} · ${inn} ${pl.text.split(', ')[1] ?? ''}`.trim(), meta: `승리 확률 ${pct(meB)}% → 100%`, teamId: batTeam };
    } else if (myB <= opB && myA > opA && pl.inning >= 6) {
      h = { kind: 'go-ahead', title: myB < opB ? '역전!' : '앞서가는 한 방!', sub: `${nameOf(pl.batterId)} · ${inn}`, meta, teamId: batTeam };
    } else if (myB < opB && myA === opA && pl.inning >= 6) {
      h = { kind: 'comeback', title: '동점!', sub: `${nameOf(pl.batterId)} · ${inn}`, meta, teamId: batTeam };
    } else if (myA > myB && gain >= 0.15) {
      h = { kind: 'clutch', title: pl.code === 'HR' ? '홈런!' : '적시타!', sub: `${nameOf(pl.batterId)} · ${inn}`, meta, teamId: batTeam };
    } else if (['FO', 'LO', 'SF'].includes(pl.code) && pl.defense && pl.defense.catchProb < 0.35) {
      const f = pl.defense.fielders.find((x) => x.arriveS != null);
      h = { kind: 'defense', title: '호수비!', sub: `${f ? nameOf(f.playerId) : '수비'} · ${f?.dive ? '다이빙 캐치' : '먼 거리 포구'}`, meta: `잡을 확률 ${pct(pl.defense.catchProb)}%`, teamId: fldTeam };
    } else if (pl.outsAfter >= 3 && pl.basesBefore.filter(Boolean).length >= 2 && -gain >= 0.1 && pl.inning >= 6) {
      h = { kind: 'escape', title: '위기 탈출!', sub: `${nameOf(pl.pitcherId)} · ${inn} 주자 ${pl.basesBefore.filter(Boolean).length}명`, meta: `승리 확률 ${pct(1 - meB)}% → ${pct(1 - meA)}%`, teamId: fldTeam };
    }
    if (h) pl.highlight = h;
  });
}
