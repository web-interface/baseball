// 시상식 '사진' — 구단색 바탕 + 위에서 비추는 조명 + 등번호 그림자 + 선수 SD 그림(art/PlayerArt). 그 시즌 구단 유니폼으로 그린다.
import { PlayerArt, type ArtPose, type ArtVariant } from '../../art/PlayerArt';
import { playerById, teamById } from '../../game/mock';
import { Emblem } from '../../ui';
import type { AwardWin } from '../../season/awards';
import s from './awards.module.css';

export function Photo({ win, variant = 'portrait', size, pose, eager }: { win: AwardWin; variant?: ArtVariant; size: 'hero' | 'side' | 'tile' | 'thumb' | 'mini'; pose?: ArtPose; eager?: boolean }) {
  const p = playerById(win.id);
  const t = teamById(win.team);
  return (
    <span className={[s.photo, s['ph-' + size]].join(' ')} style={{ ['--tc' as string]: t.colors.primary, ['--tink' as string]: t.colors.ink }}>
      {p && size !== 'mini' && <b className={['num', s.photoNo].join(' ')} aria-hidden>{p.number}</b>}
      <span className={s.photoArt}>
        {p
          ? <PlayerArt player={p} team={t} variant={variant} pose={pose} eager={eager} title={`${win.name} (${t.short})`} />
          : <span className={s.photoEm}><Emblem team={t} size={size === 'hero' ? 72 : 32} decorative /></span>}
      </span>
    </span>
  );
}
