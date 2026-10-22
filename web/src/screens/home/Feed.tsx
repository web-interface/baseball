// 구단 소식 — 저장된 시즌 진행에서: 개막 · 다음 시리즈(라이벌 더비 예고) · 연승/연패 · 기록 · 부상 · 비 취소 · 내 선수 시즌 기록
import { useMemo, useState } from 'react';
import { Icon, type IconName } from '../../ui';
import { PlayerArt } from '../../art/PlayerArt';
import { Link } from '../../app/router';
import { playerById } from '../../game/mock';
import { useSeason } from '../../season/store';
import { feedItems, type FeedItem, type FeedKind } from './local-mock';
import s from './Feed.module.css';

const KIND: Record<FeedKind, { tone: string; icon: IconName }> = {
  '형광 케미': { tone: s.volt, icon: 'bolt' },
  라이벌: { tone: s.rival, icon: 'versus' },
  부상: { tone: s.bad, icon: 'alert' },
  슬럼프: { tone: s.down, icon: 'arrow-down' },
  불방망이: { tone: s.up, icon: 'flame' },
  기록: { tone: s.gold, icon: 'trophy' },
  날씨: { tone: s.info, icon: 'rain' },
  구단: { tone: s.plain, icon: 'stadium' },
  연승: { tone: s.up, icon: 'flame' },
  연패: { tone: s.down, icon: 'arrow-down' },
  순위: { tone: s.gold, icon: 'crown' },
  경기: { tone: s.plain, icon: 'ball' },
  시즌: { tone: s.plain, icon: 'calendar' },
};

function Lead({ item }: { item: FeedItem }) {
  const ps = (item.players ?? []).map((id) => playerById(id)).filter(Boolean);
  if (ps.length === 0) return <span className={[s.lead, s.iconLead].join(' ')}><Icon name={KIND[item.kind].icon} size={18} /></span>;
  return (
    <span className={[s.lead, ps.length > 1 && s.pair].filter(Boolean).join(' ')}>
      {ps.slice(0, 2).map((p) => <span key={p!.id} className={s.face}><PlayerArt player={p!} variant="mini" /></span>)}
    </span>
  );
}

export function Feed() {
  const season = useSeason();
  const feed = useMemo(() => feedItems(season), [season]);
  const [all, setAll] = useState(false);
  const items = all ? feed : feed.slice(0, 5);
  const today = feed.filter((f) => f.when === '오늘').length;
  if (!feed.length) return null;
  return (
    <section className={s.feed} aria-labelledby="feed-h">
      <header className={s.head}>
        <h2 id="feed-h" className={s.h}>구단 소식</h2>
        <span className={s.meta}>{today ? <>오늘 <b className="num">{today}</b>건</> : <>모두 <b className="num">{feed.length}</b>건</>}</span>
      </header>
      <ul className={s.list}>
        {items.map((it) => {
          const body = (
            <>
              <Lead item={it} />
              <span className={s.body}>
                <span className={s.line1}>
                  <em className={[s.kind, KIND[it.kind].tone].join(' ')}>{it.kind}</em>
                  <span className={s.text}>{it.text}</span>
                </span>
                {it.detail && <span className={s.detail}>{it.detail}</span>}
              </span>
              <span className={s.when}>{it.when}</span>
            </>
          );
          return (
            <li key={it.id}>
              {it.to ? <Link to={it.to} className={s.row}>{body}</Link> : <div className={s.row}>{body}</div>}
            </li>
          );
        })}
      </ul>
      {!all && feed.length > 5 && (
        <button type="button" className={s.more} onClick={() => setAll(true)}>
          소식 <span className="num">{feed.length - 5}</span>건 더 보기 <Icon name="chevron-down" size={14} />
        </button>
      )}
    </section>
  );
}
