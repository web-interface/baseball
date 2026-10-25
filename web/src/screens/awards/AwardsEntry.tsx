// 시상식 입구 — 경기 준비·진행(#/season) 포스트시즌 판 아래. 우승팀이 정해진 뒤 · 다음 시즌 시작 전에만 보인다.
// MVP 사진 · 기사 제목 · 주요 수상자 한 줄 · 우리 구단 수상 수 → 시상식(#/awards).
import { navigate } from '../../app/router';
import { Button } from '../../ui';
import { useRosters } from '../games/shared';
import type { AwardWin } from '../../season/awards';
import { useCeremony } from './useCeremony';
import { Photo } from './Photo';
import s from './awards.module.css';

export function AwardsEntry() {
  useRosters();
  const c = useCeremony();
  if (!c) return null;
  const mine = [c.mvp, c.roy, ...c.gg, ...c.titles].filter((w): w is AwardWin => !!w && w.mine);
  const who = [c.mvp && `MVP ${c.mvp.name}`, c.roy && `신인왕 ${c.roy.name}`, c.gg.length > 0 && `골든글러브 ${c.gg.length}명`].filter(Boolean).join(' · ');
  return (
    <section className={s.entry} aria-label="시상식">
      <p className={s.entryK}><span className="num">{c.year}</span> 시상식</p>
      <div className={s.entryRow}>
        {c.mvp && <Photo win={c.mvp} variant="portrait" size="thumb" />}
        <div className={s.entryText}>
          <b>{c.mvp?.head ?? '올해의 상이 정해졌어요'}</b>
          <small>{who}</small>
          {mine.length > 0 && <em>우리 구단 수상 <span className="num">{mine.length}</span> — {[...new Set(mine.map((w) => w.name))].slice(0, 3).join(' · ')}</em>}
        </div>
      </div>
      <Button size="l" block icon="trophy" variant="secondary" onClick={() => navigate('/awards')}>시상식 보기</Button>
    </section>
  );
}
