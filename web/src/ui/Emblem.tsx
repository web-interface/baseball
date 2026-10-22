// 구단 엠블럼 — 그림은 art/emblems(ClubEmblem) 하나로 통일. 예전 props(team: emblem·colors·name) 그대로 받는다.
//   32px 미만은 단순한 그림(S), 어두운 바탕에서는 --emblem-edge 테두리.
import type { Team } from '../game/types';
import { ClubEmblem } from '../art/emblems';

export interface EmblemProps {
  team: Pick<Team, 'emblem' | 'colors' | 'name'> & Partial<Pick<Team, 'code'>>;
  size?: number;
  className?: string;
  decorative?: boolean;
}

export function Emblem({ team, size = 24, className, decorative }: EmblemProps) {
  return <ClubEmblem team={{ code: team.code ?? team.emblem, colors: team.colors, name: team.name }} size={size} className={className} decorative={decorative} />;
}
