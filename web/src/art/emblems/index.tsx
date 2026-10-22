// 구단 엠블럼 — <ClubEmblem team={team} size={24} />  (ui/Emblem 과 같은 props · 그대로 바꿔 끼울 수 있다)
//               <ClubCrest team={team} size={96} />   큰 표장: 엠블럼 + 지역 영문 띠 + 창단 연도 (64px 이상에서만)
// 그림은 marks.tsx. 32px 미만은 S 상세도(굵고 단순하게), 그 이상은 L 상세도.
import { useId } from 'react';
import type { ClubCode, Team } from '../../game/types';
import { TEAMS } from '../../game/mock';
import { MARKS, type Detail } from './marks';
import s from './emblems.module.css';

type TeamLike = Pick<Team, 'code' | 'colors' | 'name'>;

export interface ClubEmblemProps {
  team?: TeamLike;
  /** team 대신 코드만 */
  code?: ClubCode;
  size?: number;
  /** 상세도 — 기본은 크기로 고름 (32px 미만 S) */
  detail?: Detail | 'auto';
  className?: string;
  /** 읽어 줄 이름 (기본: 구단 이름) — 글자가 옆에 있으면 decorative */
  title?: string;
  decorative?: boolean;
}

const byCode = (code: ClubCode) => TEAMS.find((t) => t.code === code)!;

export function ClubEmblem({ team, code, size = 24, detail = 'auto', className, title, decorative }: ClubEmblemProps) {
  const t = team ?? byCode(code ?? 'DJ');
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const d: Detail = detail === 'auto' ? (size < 32 ? 's' : 'l') : detail;
  const Mark = MARKS[t.code];
  return (
    <svg
      className={[s.em, className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : title ?? t.name}
    >
      <Mark c={{ p: t.colors.primary, s: t.colors.secondary, a: t.colors.accent }} d={d} uid={uid} />
    </svg>
  );
}

/** 큰 표장 — 엠블럼 + 지역 영문 대문자 띠 + 창단 연도 (구단 선택 · 개막 화면) */
export function ClubCrest({ team, size = 96, className }: { team: Team; size?: number; className?: string }) {
  return (
    <figure className={[s.crest, className].filter(Boolean).join(' ')} style={{ width: size * 1.25 }} aria-label={team.name}>
      <ClubEmblem team={team} size={size} decorative />
      <figcaption className={s.band}>
        <span className={s.word}>{team.wordmark}</span>
        <span className={['num', s.est].join(' ')}>EST. {team.founded}</span>
      </figcaption>
    </figure>
  );
}

export { MARKS } from './marks';
export type { Detail } from './marks';
