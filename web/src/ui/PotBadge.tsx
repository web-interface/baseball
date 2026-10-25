// 잠재력 배지 — '보통 · 상급 · 최고' 글자 대신 별 개수 + 등급 엠블럼 (game/potential TIER_STARS). 사용자 지시 10-25
//   별 하나 = 강철 파랑 판 · 별 둘 = 보라 보석 · 별 셋 = 금박 위로 무지갯빛이 흐른다. off = 꺼진 별 셋(엔트리 2명 밖) — 빛을 빼고 흐리게
//   plate(줄 안 · 알림 · 띠): xs · s · m — 양 끝을 깎은 판에 별을 한 줄로
//   medal(잠재력 패널 · 돌리기 도장): l · xl — 세로로 선 육각 메달, 별 셋은 피라미드
//   fit — 크기를 부모 글자 크기에 맡긴다 (카드 앞면 칩: cqw 로 카드와 같이 커지고 작아진다)
// 모든 치수는 em — 배지 글자 크기 하나로 비율이 그대로 따라간다.
import { TIER_STARS, type PotTier } from '../game/potential';
import s from './PotBadge.module.css';

export type PotBadgeSize = 'xs' | 's' | 'm' | 'l' | 'xl' | 'fit';

/** 메달 안쪽 고리 — 바깥 육각(32×36)에서 3쯤 안쪽 */
const RING = '16,3.6 28.9,10.9 28.9,25.1 16,32.4 3.1,25.1 3.1,10.9';
const Star = () => (
  <svg viewBox="0 0 20 20" aria-hidden>
    <path d="M10 1.3l2.62 5.52 6.05.72-4.47 4.13 1.18 5.98L10 14.68l-5.38 2.97 1.18-5.98L1.33 7.54l6.05-.72z" />
  </svg>
);

export function PotBadge({ tier, size = 's', off, className, title }: {
  tier: PotTier;
  size?: PotBadgeSize;
  /** 꺼진 별 셋 — 흐리게 */
  off?: boolean;
  className?: string;
  title?: string;
}) {
  const n = TIER_STARS[tier];
  const medal = size === 'l' || size === 'xl';
  return (
    <span
      className={[s.pb, s[size], s['t' + tier], medal ? s.medal : s.plate, off && s.off, className].filter(Boolean).join(' ')}
      role="img"
      aria-label={`잠재력 별 ${n}개${off ? ' · 꺼짐' : ''}`}
      title={title}
    >
      {medal && (
        <svg className={s.ring} viewBox="0 0 32 36" preserveAspectRatio="none" aria-hidden>
          <polygon points={RING} />
          <polygon points={RING} />
        </svg>
      )}
      <i className={s.stars} aria-hidden>
        {Array.from({ length: n }, (_, i) => <Star key={i} />)}
      </i>
    </span>
  );
}
