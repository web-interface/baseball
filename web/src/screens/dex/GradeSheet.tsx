// 도감 — 귀한 등급(시그니처 ~ TH)을 누르면 그 등급 카드 목록 · 카드 능력치. 사용자 지시 10-25
//  카드 그림 · 이름 · 구단 · 연도 · 수상 · 종합 · 능력치 6칸. 모은 카드는 그대로(×n), 못 모은 카드는 흑백 · 자물쇠.
//  TH 636장처럼 길어도 40장씩 이어 그린다.
import { useMemo, useState, type CSSProperties } from 'react';
import { Sheet } from '../../ui';
import { CardMini, cardProps } from '../../cards';
import { navigate } from '../../app/router';
import { GRADES } from '../../game/grades';
import { awardLabel, cardInst, kboCardsWhere, playerOfKCard } from '../../game/kbo';
import { ownedCard, ownedCount } from '../../game/inventory';
import { teamByCode } from '../../game/mock';
import { shortLabel } from '../../game/world';
import { useIncremental } from '../../ui/useIncremental';
import type { GradeId } from '../../game/types';
import s from './GradeSheet.module.css';

/** 누르면 목록이 열리는 등급 */
export const LISTED: GradeId[] = ['signature', 'black', 'franchise', 'mvp', 'gg', 'th'];
const FACE_KO: Record<string, string> = {
  CON: '컨택', POW: '파워', EYE: '선구', SPD: '주루', DEF: '수비', ARM: '송구', BLK: '블로킹', FRM: '프레이밍', CS: '도루저지',
  VEL: '구속', STF: '구위', BRK: '변화', CTL: '제구', STA: '체력', REC: '회복', MNT: '위기관리',
};
const SHORT: Partial<Record<GradeId, string>> = { franchise: '프랜차이즈', th: 'TH', gg: 'GG', mvp: 'MVP' };
type Show = 'all' | 'have' | 'miss';

export function GradeSheet({ grade, onClose }: { grade: GradeId | null; onClose: () => void }) {
  const [show, setShow] = useState<Show>('all');
  const rows = useMemo(() => (grade
    ? kboCardsWhere({ grade }).map((k) => ({ k, own: ownedCount(k.id) })).sort((a, b) => (b.own > 0 ? 1 : 0) - (a.own > 0 ? 1 : 0) || b.k.ovr - a.k.ovr)
    : []), [grade]);
  const list = rows.filter((r) => (show === 'all' ? true : show === 'have' ? r.own > 0 : r.own === 0));
  const inc = useIncremental(list, 40, `${grade}|${show}`);
  const have = rows.filter((r) => r.own > 0).length;
  const g = grade ? GRADES[grade] : null;
  return (
    <Sheet open={!!grade} onClose={() => { setShow('all'); onClose(); }} height="tall"
      title={grade ? <span className={s.title} style={{ '--g': `var(--gr-${grade})` } as CSSProperties}><i />{SHORT[grade] ?? g?.ko}<b className="num">{have}<small>/{rows.length}</small></b></span> : ''}>
      <div className={s.show} role="group" aria-label="보기">
        {([['all', `전체 ${rows.length}`], ['have', `모은 카드 ${have}`], ['miss', `못 모은 카드 ${rows.length - have}`]] as [Show, string][]).map(([v, label]) => (
          <button key={v} type="button" className={[s.chip, show === v && s.on].filter(Boolean).join(' ')} aria-pressed={show === v} onClick={() => setShow(v)}>{label}</button>
        ))}
      </div>
      {list.length ? (
        <ul className={s.list}>
          {inc.shown.map(({ k, own }) => {
            const p = playerOfKCard(k);
            if (!p) return null;
            const inst = (own > 0 && ownedCard(k.id)) || cardInst(k);
            const team = teamByCode(k.code);
            const award = awardLabel(k);
            return (
              <li key={k.id} className={own > 0 ? s.got : s.locked}>
                <button type="button" className={s.row} style={{ '--tc': team.colors.primary } as CSSProperties} onClick={() => own > 0 && navigate(`/player/${inst.playerId}?card=${inst.id}`)}>
                  <span className={s.card}>
                    <CardMini {...cardProps(inst)} width={64} still isNew={false} />
                    {own > 1 && <em className={['num', s.copies].join(' ')}>×{own}</em>}
                    {own === 0 && <i className={s.lock} aria-hidden>🔒</i>}
                  </span>
                  <span className={s.main}>
                    <span className={s.top}>
                      <b>{p.name}</b>
                      {award && <em>{award}</em>}
                    </span>
                    <small>{shortLabel(k.code)}{k.year ? ` · ${k.year}` : k.span ? ` · ${k.span[0]}–${k.span[1]}` : ''} · {p.pos === 'P' ? (p.role === 'SP' ? '선발' : p.role === 'CL' ? '마무리' : '불펜') : p.pos}</small>
                    <span className={s.stats}>
                      {p.face.slice(0, 6).map((f) => (
                        <span key={f.code} className={f.v >= 85 ? s.hi : f.v >= 70 ? s.mid : undefined}><i>{f.ko ?? FACE_KO[f.code] ?? f.code}</i><b className="num">{f.v}</b></span>
                      ))}
                    </span>
                  </span>
                  <span className={s.ovr}><b className="num">{inst.ovr ?? p.ovr}</b><small>종합</small></span>
                </button>
              </li>
            );
          })}
          {inc.more && <li ref={inc.sentinelRef} className={s.more} aria-hidden>…</li>}
        </ul>
      ) : <p className={s.none}>{show === 'have' ? '아직 모은 카드가 없어요' : '다 모았어요!'}</p>}
    </Sheet>
  );
}
