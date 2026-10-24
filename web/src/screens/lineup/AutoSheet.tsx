// 자동 편성 시트 — '가장 센 팀'으로 짤지, 보유 카드로 채울 수 있는 세트덱(구단+연도 · 구단 · 연도) 중 하나로 짤지 고른다. 사용자 지시 10-24
//  덱마다: 구단 색 띠 · 덱 배지 · 채울 수 있는 인원(타자 · 투수) · 단계 눈금 · 그 단계 값 · 지금 엔트리 인원 · 우승 연도 표시.
//  추천(센 덱) · 구단+연도(구단으로 거르기) · 구단 · 연도(연대로 거르기) 탭. 누르면 바로 짜고(deckPlan.autoLineupFor) 시트를 닫는다.
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Icon, Sheet, Tabs, Emblem } from '../../ui';
import { DeckBadge } from '../../ui/DeckBadge';
import { teamByCode } from '../../game/mock';
import { shortLabel } from '../../game/world';
import { SET_KIND_KO, TIERS, type SetKind } from '../../game/sets';
import type { Deck } from '../../game/deck';
import { byStrength, deckOptions, type DeckOption, type DeckTarget } from './deckPlan';
import type { LineupState } from './calc';
import s from './AutoSheet.module.css';

type Tab = 'best' | SetKind;
const SHOW_STEP = 30;

export function AutoSheet({ open, onClose, st, onBest, onDeck }: {
  open: boolean;
  onClose: () => void;
  st: LineupState;
  onBest: () => void;
  onDeck: (t: DeckTarget, o: DeckOption) => void;
}) {
  const [tab, setTab] = useState<Tab>('best');
  const [club, setClub] = useState<string | null>(null);
  const [decade, setDecade] = useState<number | null>(null);
  const [show, setShow] = useState(SHOW_STEP);
  const [busy, setBusy] = useState<string | null>(null);
  // 열 때만 센다 (보유 카드 수천 장 — 한 번 훑기)
  const opts = useMemo(() => (open ? deckOptions(st) : []), [open, st]);
  useEffect(() => { if (open) { setBusy(null); setShow(SHOW_STEP); } }, [open]);
  useEffect(() => { setShow(SHOW_STEP); }, [tab, club, decade]);

  const byKind = useMemo(() => ({
    teamYear: opts.filter((o) => o.kind === 'teamYear'),
    team: opts.filter((o) => o.kind === 'team'),
    year: opts.filter((o) => o.kind === 'year'),
  }), [opts]);
  // 추천 — 구단+연도 넷 · 구단 둘 · 연도 둘, 센 순
  const best = useMemo(() => [...byKind.teamYear.slice(0, 4), ...byKind.team.slice(0, 2), ...byKind.year.slice(0, 2)].sort(byStrength), [byKind]);
  const clubs = useMemo(() => [...new Set(byKind.teamYear.map((o) => o.code!))], [byKind]);
  const decades = useMemo(() => [...new Set(byKind.year.map((o) => Math.floor(o.year! / 10) * 10))].sort((a, b) => b - a), [byKind]);

  const list = tab === 'best' ? best
    : tab === 'teamYear' ? byKind.teamYear.filter((o) => !club || o.code === club)
      : tab === 'team' ? byKind.team
        : byKind.year.filter((o) => decade == null || Math.floor(o.year! / 10) * 10 === decade);

  const pick = (o: DeckOption) => {
    if (busy) return;
    setBusy(o.id);
    // 한 번 그려서 '짜는 중'을 보이고 계산
    window.setTimeout(() => { onDeck({ kind: o.kind, code: o.code, year: o.year }, o); setBusy(null); }, 30);
  };

  return (
    <Sheet open={open} onClose={onClose} height="tall" title="자동 편성" sub="어떤 덱으로 짤까요? 고르면 바로 짜요 — 되돌리기도 돼요">
      <div className={s.body}>
        <button type="button" className={s.hero} onClick={onBest} disabled={!!busy}>
          <span className={s.heroIcon} aria-hidden><Icon name="bolt" size={20} /></span>
          <span className={s.heroText}>
            <b>가장 센 팀으로</b>
            <small>세트덱 상관없이 팀 종합이 가장 높게 · 지금 켜진 세트는 되도록 지켜요</small>
          </span>
          <Icon name="arrow-right" size={18} />
        </button>

        <div className={s.h}>
          <b>세트덱으로 짜기</b>
          <small>보유 카드로 채울 수 있는 덱 <span className="num">{opts.length}</span>개</small>
        </div>
        <Tabs
          variant="box"
          size="s"
          fill
          value={tab}
          onChange={setTab}
          aria-label="덱 종류"
          items={[
            { value: 'best', label: '추천' },
            { value: 'teamYear', label: '구단+연도', count: byKind.teamYear.length },
            { value: 'team', label: '구단', count: byKind.team.length },
            { value: 'year', label: '연도', count: byKind.year.length },
          ]}
        />
        <p className={s.kindNote}>
          {tab === 'best' ? '채울 수 있는 단계가 높은 덱부터 — 구단+연도가 가장 세요'
            : tab === 'teamYear' ? '같은 구단 · 같은 연도 (연도 없는 레전드급 카드도 그 구단이면 함께) — 20명이면 왕조'
              : tab === 'team' ? '같은 구단 카드 — 연도는 달라도 돼요'
                : '같은 연도 카드 — 구단은 달라도 돼요 (9명부터)'}
        </p>

        {tab === 'teamYear' && clubs.length > 1 && (
          <div className={s.chips} role="group" aria-label="구단으로 거르기">
            <button type="button" className={[s.chip, !club && s.on].filter(Boolean).join(' ')} aria-pressed={!club} onClick={() => setClub(null)}>전체</button>
            {clubs.map((c) => {
              const t = teamByCode(c);
              return (
                <button key={c} type="button" className={[s.chip, club === c && s.on].filter(Boolean).join(' ')} aria-pressed={club === c} onClick={() => setClub(club === c ? null : c)}>
                  <Emblem team={t} size={16} decorative />{shortLabel(c)}
                </button>
              );
            })}
          </div>
        )}
        {tab === 'year' && decades.length > 1 && (
          <div className={s.chips} role="group" aria-label="연대로 거르기">
            <button type="button" className={[s.chip, decade == null && s.on].filter(Boolean).join(' ')} aria-pressed={decade == null} onClick={() => setDecade(null)}>전체</button>
            {decades.map((d) => (
              <button key={d} type="button" className={[s.chip, decade === d && s.on].filter(Boolean).join(' ')} aria-pressed={decade === d} onClick={() => setDecade(decade === d ? null : d)}>
                <span className="num">{d}</span>년대
              </button>
            ))}
          </div>
        )}

        {list.length ? (
          <ul className={s.list}>
            {list.slice(0, show).map((o) => <Row key={o.id} o={o} busy={busy === o.id} dim={!!busy && busy !== o.id} onPick={() => pick(o)} />)}
          </ul>
        ) : (
          <p className={s.empty}>
            {tab === 'year' ? '같은 연도 카드 9명을 채울 수 있는 해가 아직 없어요' : '같은 구단 카드 5명을 채울 수 있는 덱이 아직 없어요'} — 연도팩 · 구단팩으로 모아 보세요
          </p>
        )}
        {list.length > show && (
          <button type="button" className={s.more} onClick={() => setShow((n) => n + SHOW_STEP)}>
            다음 <span className="num">{Math.min(SHOW_STEP, list.length - show)}</span>개 더 보기 <small>(<span className="num">{list.length - show}</span>개 남음)</small>
          </button>
        )}
      </div>
    </Sheet>
  );
}

function Row({ o, busy, dim, onPick }: { o: DeckOption; busy: boolean; dim: boolean; onPick: () => void }) {
  const tiers = TIERS[o.kind];
  const dynasty = o.kind === 'teamYear' && o.tierIdx === tiers.length - 1;
  const deck: Deck = { label: o.kind === 'year' ? `${o.name.replace(' 시즌', '')} 연도덱` : `${o.name}덱`, sub: SET_KIND_KO[o.kind], kind: dynasty ? 'dynasty' : o.kind, c1: o.c1, c2: o.c2, have: o.can, code: o.code };
  const goal = o.next?.at ?? o.tier.at;
  return (
    <li>
      <button
        type="button"
        className={[s.row, dynasty && s.dyn, busy && s.busy, dim && s.dim].filter(Boolean).join(' ')}
        style={{ '--c1': o.c1, '--c2': o.c2 } as CSSProperties}
        onClick={onPick}
        aria-label={`${deck.label} — ${o.can}명 · ${o.tierIdx + 1}단계로 짜기`}
      >
        <span className={s.band} aria-hidden />
        <span className={s.main}>
          <span className={s.top}>
            <DeckBadge deck={deck} size="m" />
            {o.title && <span className={s.title}>우승 연도</span>}
          </span>
          <span className={s.meta}>
            타자 <b className="num">{o.bat}</b> · 투수 <b className="num">{o.pit}</b>
            {o.now > 0 && <> · 지금 엔트리 <b className="num">{o.now}</b>명</>}
          </span>
          <span className={s.tierRow}>
            <span className={s.pips} aria-hidden>
              {tiers.map((x, i) => <i key={x.at} className={i <= o.tierIdx ? s.pipOn : undefined}><em className="num">{x.at}</em></i>)}
            </span>
            <span className={s.tierTxt}>
              {dynasty ? <b className={s.dynTxt}>왕조 가능</b> : <><b className="num">{o.tierIdx + 1}</b>단계</>}
              <span> · 능력치 +<span className="num">{o.tier.v}</span></span>
              {o.next && <span className={s.nextTxt}> · <span className="num">{o.next.at - o.can}</span>명 더 모으면 +<span className="num">{o.next.v}</span></span>}
            </span>
          </span>
        </span>
        <span className={s.count}>
          {busy ? <span className={s.spin} aria-label="짜는 중" /> : o.next ? <><b className="num">{o.can}</b><small>/<span className="num">{goal}</span></small></> : <><b className="num">{o.can}</b><small>명</small></>}
        </span>
      </button>
    </li>
  );
}
