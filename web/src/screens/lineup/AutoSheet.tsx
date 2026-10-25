// 자동 편성 시트 — '가장 센 팀'으로 짤지, 보유 카드로 채울 수 있는 세트덱(구단+연도 · 구단 · 연도) 중 하나로 짤지 고른다. 사용자 지시 10-24
//  덱마다: 구단 색 띠 · 덱 배지 · 채울 수 있는 인원(타자 · 투수) · 단계 눈금 · 그 단계 값 · 지금 엔트리 인원 · 우승 연도 표시.
//  추천(센 덱) · 구단+연도(구단으로 거르기) · 구단 · 연도(연대로 거르기) 탭. 누르면 바로 짜고(deckPlan.autoLineupFor) 시트를 닫는다.
//  선택지마다 '그 덱으로 짜면 팀 종합'(화면 눈금)과 지금과의 차이 — 사용자 지시 10-26. useTeamOvr 참고.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject } from 'react';
import { Icon, Sheet, Tabs, Emblem, fmt } from '../../ui';
import { DeckBadge } from '../../ui/DeckBadge';
import { teamByCode } from '../../game/mock';
import { shortLabel } from '../../game/world';
import { SET_KIND_KO, TIERS, tierName, type SetKind } from '../../game/sets';
import { showOvr } from '../../game/ovrShow';
import { invVersion } from '../../game/inventory';
import { potVersion } from '../../game/potential';
import type { Deck } from '../../game/deck';
import { autoLineupFor, deckOptions, recommendedDecks, type DeckOption, type DeckTarget } from './deckPlan';
import { autoLineup, evaluate, type LineupState } from './calc';
import s from './AutoSheet.module.css';

type Tab = 'best' | SetKind;
const SHOW_STEP = 30;

/* ───────── 그 덱으로 짜면 팀 종합 ─────────
 *  누를 때와 똑같이 — '가장 센 팀'은 autoLineup, 덱은 autoLineupFor 로 실제로 짜 본 라인업을 evaluate → showOvr(overall).
 *  (라인업 게이지 GaugeBox · 고른 뒤 알림과 같은 숫자 · 새 공식 없음. 지금 값도 같은 눈금)
 *  덱 하나 4~10ms, '가장 센 팀' 150~350ms(카드 1.7천 장 · 쪼갤 수 없는 한 덩어리) — 열 때 한 번에 다 세면 화면이 멈칫해서:
 *   · 시트를 먼저 그리고(첫 프레임 뒤부터), 보이는 줄부터 조금씩(한 번에 SLICE ms 쯤 세고 쉬기) 채운다 — 탭 · 거르기 · 더 보기를 바꾸면 그 목록이 먼저
 *   · '가장 센 팀'은 올라오는 움직임(280ms)이 끝나고 손을 대지 않는 틈(IDLE ms)에 — 미는 중이면 다른 탭 덱을 먼저 세며 기다린다
 *   · 같은 라인업 · 같은 보유 카드 · 같은 잠재력이면 다시 열 때 그대로 쓴다 */
const BEST = '@best';
const WAIT = '@wait';
const SLICE = 10;
const BEST_AFTER = 320;
const IDLE = 450;
const INPUTS = ['pointerdown', 'wheel', 'touchmove', 'keydown', 'scroll'] as const;
type Memo = { key: string; now: number; m: Map<string, number> };
const memo = new WeakMap<LineupState, Memo>();

function useTeamOvr(open: boolean, st: LineupState, opts: DeckOption[], want: MutableRefObject<string[]>) {
  const [, setTick] = useState(0);
  const cur = useMemo(() => {
    if (!open) return null;
    const key = `${invVersion()}:${potVersion()}`;
    let e = memo.get(st);
    if (!e || e.key !== key) { e = { key, now: showOvr(evaluate(st).overall), m: new Map() }; memo.set(st, e); }
    return e;
  }, [open, st]);

  useEffect(() => {
    if (!cur) return; // 고를 덱이 없어도 가장 센 팀은 센다
    const byId = new Map(opts.map((o) => [o.id, o]));
    const t0 = performance.now();
    let touched = -Infinity;
    const onInput = () => { touched = performance.now(); };
    INPUTS.forEach((e) => window.addEventListener(e, onInput, { capture: true, passive: true }));
    let timer = 0;
    const todo = (id: string) => !cur.m.has(id) && byId.has(id);
    /** 다음에 셀 것 — 보이는 줄 → 가장 센 팀(올라온 뒤 · 손 뗀 틈) → 다른 탭 덱. null 이면 끝, WAIT 는 가장 센 팀만 남아 틈을 기다리는 중 */
    const nextId = (now: number): string | null => {
      for (const id of want.current) if (todo(id)) return id;
      if (!cur.m.has(BEST) && now - t0 >= BEST_AFTER && now - touched >= IDLE) return BEST;
      for (const o of opts) if (todo(o.id)) return o.id;
      return cur.m.has(BEST) ? null : WAIT;
    };
    const step = () => {
      const a = performance.now();
      let seen = false;
      let id = nextId(a);
      while (id && id !== WAIT) {
        const next = id === BEST ? autoLineup(st) : autoLineupFor(st, byId.get(id)!);
        cur.m.set(id, showOvr(evaluate(next).overall));
        seen ||= id === BEST || want.current.includes(id);
        const done = id;
        const b = performance.now();
        id = nextId(b);
        if (done === BEST || id === BEST || b - a >= SLICE) break; // '가장 센 팀'은 혼자 한 번에
      }
      if (seen || !id) setTick((n) => n + 1);
      if (id) timer = window.setTimeout(step, id === WAIT ? 100 : 0);
    };
    // 시트가 한 번 그려진 다음부터
    const raf = requestAnimationFrame(() => { timer = window.setTimeout(step, 0); });
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      INPUTS.forEach((e) => window.removeEventListener(e, onInput, { capture: true }));
    };
  }, [cur, opts, st, want]);

  return { now: cur?.now ?? 0, get: (id: string) => cur?.m.get(id) };
}

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
  // 추천 — 구단+연도 넷 · 구단 둘 · 연도 둘, 센 순 (deckPlan recommendedDecks — '가장 센 팀'도 이 덱들과 견준다)
  const best = useMemo(() => recommendedDecks(opts), [opts]);
  const clubs = useMemo(() => [...new Set(byKind.teamYear.map((o) => o.code!))], [byKind]);
  const decades = useMemo(() => [...new Set(byKind.year.map((o) => Math.floor(o.year! / 10) * 10))].sort((a, b) => b - a), [byKind]);

  const list = tab === 'best' ? best
    : tab === 'teamYear' ? byKind.teamYear.filter((o) => !club || o.code === club)
      : tab === 'team' ? byKind.team
        : byKind.year.filter((o) => decade == null || Math.floor(o.year! / 10) * 10 === decade);
  const shown = list.slice(0, show);
  // 보이는 줄부터 센다 (탭 · 거르기 · 더 보기를 바꾸면 그 목록이 먼저)
  const want = useRef<string[]>([]);
  want.current = shown.map((o) => o.id);
  const ovr = useTeamOvr(open, st, opts, want);
  // '가장 센 팀' = 카드 힘만 본 편성과 추천 덱 편성 중 가장 높은 것 (누르면 deckPlan strongestLineup — 같은 후보 · 같은 숫자)
  const bestRaw = ovr.get(BEST);
  const bestOvr = bestRaw == null ? undefined : Math.max(bestRaw, ...best.map((o) => ovr.get(o.id) ?? -Infinity));

  const pick = (o: DeckOption) => {
    if (busy) return;
    setBusy(o.id);
    // 한 번 그려서 '짜는 중'을 보이고 계산
    window.setTimeout(() => { onDeck({ kind: o.kind, code: o.code, year: o.year }, o); setBusy(null); }, 30);
  };

  return (
    <Sheet open={open} onClose={onClose} height="tall" title="자동 편성">
      <div className={s.body}>
        <button type="button" className={s.hero} onClick={onBest} disabled={!!busy} aria-label={`가장 센 팀으로 짜기${ovrLabel(bestOvr, ovr.now)}`}>
          <span className={s.heroIcon} aria-hidden><Icon name="bolt" size={20} /></span>
          <span className={s.heroText}>
            <b>가장 센 팀으로</b>
          </span>
          <Score v={bestOvr} now={ovr.now} hero />
          <Icon name="arrow-right" size={18} />
        </button>

        <div className={s.h}>
          <b>세트덱으로 짜기</b>
          <small><span className="num">{opts.length}</span>개</small>
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
            {shown.map((o) => <Row key={o.id} o={o} v={ovr.get(o.id)} now={ovr.now} busy={busy === o.id} dim={!!busy && busy !== o.id} onPick={() => pick(o)} />)}
          </ul>
        ) : (
          <p className={s.empty}>
            {tab === 'year' ? '같은 연도 9명부터' : '같은 구단 5명부터'}
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

/** 그 선택지로 짜면 팀 종합 · 지금과의 차이 (세는 중이면 자리만) */
function Score({ v, now, hero }: { v: number | undefined; now: number; hero?: boolean }) {
  const d = v == null ? 0 : v - now;
  return (
    <span className={[s.score, hero && s.scoreHero].filter(Boolean).join(' ')} aria-hidden>
      <small>팀 종합</small>
      {v == null ? <i className={s.wait} /> : <b className="num">{v}</b>}
      <em className={['num', v == null ? s.same : d > 0 ? s.up : d < 0 ? s.down : s.same].join(' ')}>{v == null ? '\u00a0' : d ? fmt.signed(d) : '그대로'}</em>
    </span>
  );
}
const ovrLabel = (v: number | undefined, now: number) => (v == null ? '' : ` · 팀 종합 ${v}${v !== now ? `(${fmt.signed(v - now)})` : ''}`);

function Row({ o, v, now, busy, dim, onPick }: { o: DeckOption; v: number | undefined; now: number; busy: boolean; dim: boolean; onPick: () => void }) {
  const tiers = TIERS[o.kind];
  const dynasty = o.kind === 'teamYear' && o.tierIdx >= 3;
  const deck: Deck = { label: o.kind === 'year' ? `${o.name.replace(' 시즌', '')} 연도덱` : `${o.name}덱`, sub: SET_KIND_KO[o.kind], kind: dynasty ? 'dynasty' : o.kind, c1: o.c1, c2: o.c2, have: o.can, code: o.code };
  const goal = o.next?.at ?? o.tier.at;
  return (
    <li>
      <button
        type="button"
        className={[s.row, dynasty && s.dyn, busy && s.busy, dim && s.dim].filter(Boolean).join(' ')}
        style={{ '--c1': o.c1, '--c2': o.c2 } as CSSProperties}
        onClick={onPick}
        aria-label={`${deck.label} — ${o.can}명 · ${o.tierIdx + 1}단계로 짜기${ovrLabel(v, now)}`}
      >
        <span className={s.band} aria-hidden />
        <span className={s.main}>
          <span className={s.top}>
            <DeckBadge deck={deck} size="m" />
            {o.title && <span className={s.title}>우승 연도</span>}
          </span>
          <span className={s.meta}>
            타자 <b className="num">{o.bat}</b> · 투수 <b className="num">{o.pit}</b>
            {o.now > 0 && <> · 지금 <b className="num">{o.now}</b></>}
          </span>
          <span className={s.tierRow}>
            <span className={s.pips} aria-hidden>
              {tiers.map((x, i) => <i key={x.at} className={i <= o.tierIdx ? s.pipOn : undefined}><em className="num">{x.at}</em></i>)}
            </span>
            <span className={s.tierTxt}>
              {dynasty ? <b className={s.dynTxt}>{tierName(o.kind, o.tierIdx)}</b> : <b>{tierName(o.kind, o.tierIdx)}</b>}
              <span> +<span className="num">{o.tier.v}</span></span>
              {o.next && <span className={s.nextTxt}> · <span className="num">{o.next.at - o.can}</span>명 더 +<span className="num">{o.next.v}</span></span>}
            </span>
          </span>
        </span>
        <span className={s.count}>
          {busy ? <span className={s.spin} aria-label="짜는 중" /> : o.next ? <><b className="num">{o.can}</b><small>/<span className="num">{goal}</span></small></> : <><b className="num">{o.can}</b><small>명</small></>}
        </span>
        <Score v={v} now={now} />
      </button>
    </li>
  );
}
