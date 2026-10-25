// 덱 배지 — '무슨 덱'인지 구단 색 금속 띠로 (game/deck). 왕조덱은 금 테 + 빛이 지나간다.
//  size: s 목록 줄(이름만) · m 카드 안(이름 + 작은 글) · l 홈 머리(크게)
import type { CSSProperties } from 'react';
import type { Deck } from '../game/deck';
import s from './DeckBadge.module.css';

export function DeckBadge({ deck, size = 'm', className }: { deck: Deck; size?: 's' | 'm' | 'l'; className?: string }) {
  return (
    <span
      className={[s.deck, s[size], s[deck.kind], className].filter(Boolean).join(' ')}
      style={{ '--dc1': deck.c1, '--dc2': deck.c2 } as CSSProperties}
      title={`${deck.label} — ${deck.sub}`}
    >
      <i className={s.mark} aria-hidden>{deck.kind === 'dynasty' || deck.kind === 'golden' ? '♛' : deck.kind === 'mixed' ? '◇' : '◆'}</i>
      <b className={s.name}>{deck.label}</b>
      {size !== 's' && <small className={s.sub}>{deck.sub}</small>}
      {(deck.kind === 'dynasty' || deck.kind === 'golden') && <i className={s.shine} aria-hidden />}
    </span>
  );
}
