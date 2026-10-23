// 경기 중 라인업 — 두 팀 타순 · 투수, 지금 장면까지 오늘 기록 + 시즌 성적. 선수를 누르면 대표 능력치
// (우리 선수는 강화 · 훈련 · 잠재력 · 세트덱이 더해진 값까지 — 라인업 화면과 같은 숫자, screens/lineup/ctx cardNow).
// 경기장 오른쪽 아래 '라인업' 단추로 연다. 앞으로 일어날 장면은 세지 않는다(지금 장면까지만).
import { useMemo, useState } from 'react';
import { Emblem, Icon, Sheet, StatBar, Tabs } from '../../ui';
import { ME, playerById, teamById } from '../../game/mock';
import { POS_KO, ROLE_KO } from '../../game/labels';
import type { CardInst, Player } from '../../game/types';
import { avgLabel, batLine, eraLabel, pitLine } from '../../season/store';
import { cardNow } from '../lineup/ctx';
import { initialLineup, store as lineupStore, unit } from '../lineup/calc';
import { avg as fAvg, era as fEra } from '../../ui/format';
import { GAME } from './local-mock';
import { PLAYS, type Live } from './timeline';
import { ipText, isSeasonGame, pitcherToday } from './Panels';
import { tagOf } from './tags';
import s from './LineupSheet.module.css';

type Side = 'away' | 'home';
const HITS = ['1B', '2B', '3B', 'HR'];

/** 경기장 오른쪽 아래 단추 */
export function LineupButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={s.btn} onClick={onClick} aria-label="두 팀 라인업 · 오늘 기록 보기">
      <Icon name="lineup" size={15} />
      <span>라인업</span>
    </button>
  );
}

/** 오늘 타자 기록 (지금 장면 앞까지) */
function batToday(id: string, upto: number) {
  let pa = 0, ab = 0, h = 0, hr = 0, rbi = 0, bb = 0, so = 0;
  for (let i = 0; i < upto && i < PLAYS.length; i++) {
    const p = PLAYS[i];
    if (p.batterId !== id || !p.isPA) continue;
    pa++;
    if (p.code === 'BB' || p.code === 'HBP') bb++;
    else if (p.code !== 'SF' && p.code !== 'SAC') ab++;
    if (HITS.includes(p.code)) h++;
    if (p.code === 'HR') hr++;
    if (p.code === 'K') so++;
    rbi += p.rbi;
  }
  return { pa, ab, h, hr, rbi, bb, so };
}
const batTodayText = (t: ReturnType<typeof batToday>) => {
  if (!t.pa) return '—';
  const parts = [`${t.ab}타수 ${t.h}안타`];
  if (t.hr) parts.push(`${t.hr}홈런`);
  if (t.rbi) parts.push(`${t.rbi}타점`);
  if (t.bb) parts.push(`${t.bb}볼넷`);
  return parts.join(' · ');
};

/** 시즌 성적 한 줄 — 시즌 경기는 이 게임 시즌 기록, 그 밖(대전 · 미리보기)은 카드 시즌 기록 */
function seasonBat(p: Player) {
  if (isSeasonGame()) {
    const b = batLine(p.id);
    return b.ab ? `타율 ${avgLabel(b)} · ${b.hr}홈런 · ${b.rbi}타점` : '시즌 첫 경기';
  }
  const b = p.season.bat;
  return b ? `타율 ${fAvg(b.avg)} · ${b.hr}홈런 · OPS ${fAvg(b.ops)}` : '';
}
function seasonPit(p: Player) {
  if (isSeasonGame()) {
    const l = pitLine(p.id);
    if (!l.outs) return '시즌 첫 등판';
    return `평균자책 ${eraLabel(l)} · ${l.w}승 ${l.l}패${l.sv ? ` · ${l.sv}세이브` : l.hld ? ` · ${l.hld}홀드` : ''}`;
  }
  const t = p.season.pit;
  return t ? `평균자책 ${fEra(t.era)} · ${t.w}승 ${t.l}패` : '';
}

/** 내 라인업 카드 (선수 id → 카드) — 더해진 값을 보여 주려고 */
function myCards(): Map<string, CardInst> {
  const m = new Map<string, CardInst>();
  try {
    const st = lineupStore.get() ?? initialLineup();
    const ids = [...Object.values(st.field), ...st.rotation, ...st.bullpen, st.closer, ...st.bench].filter((x): x is string => !!x);
    for (const id of ids) { try { const u = unit(id); m.set(u.player.id, u.card); } catch { /* 없는 카드 */ } }
  } catch { /* 라인업 없음 */ }
  return m;
}

interface Row { key: string; p: Player; order?: number; pos: string; sub?: boolean; today: string; season: string; now?: boolean; role?: string }

function rowsOf(side: Side, live: Live, pre: boolean) {
  const g = GAME[side];
  const upto = pre ? 0 : live.playIdx + (live.applied ? 1 : 0);
  // 타순 — 선발 + 이 자리에 나온 교체 선수 (지금 장면까지)
  const bySlot = new Map<number, { pid: string; pos: string }[]>();
  for (const b of g.batting) bySlot.set(b.slot, [{ pid: b.pid, pos: b.pos }]);
  for (let i = 0; i < upto && i < PLAYS.length; i++) {
    const p = PLAYS[i];
    if ((p.half === 'top' ? 'away' : 'home') !== side || !p.isPA) continue;
    const list = bySlot.get(p.slot) ?? [];
    if (!list.some((x) => x.pid === p.batterId)) list.push({ pid: p.batterId, pos: '교체' });
    bySlot.set(p.slot, list);
  }
  const curBat = !pre && (live.play.half === 'top' ? 'away' : 'home') === side ? live.play.batterId : null;
  const bat: Row[] = [];
  [...bySlot.keys()].sort((a, b) => a - b).forEach((slot) => {
    bySlot.get(slot)!.forEach((x, k) => {
      const p = playerById(x.pid);
      if (!p) return;
      bat.push({
        key: `b${slot}-${x.pid}`, p, order: k === 0 ? slot : undefined, sub: k > 0,
        pos: k === 0 ? (POS_KO[x.pos as keyof typeof POS_KO] ?? x.pos) : '교체',
        today: batTodayText(batToday(x.pid, upto)), season: seasonBat(p), now: x.pid === curBat,
      });
    });
  });
  // 투수 — 선발 + 지금 장면까지 마운드에 오른 투수
  const pids: string[] = [g.starter];
  for (let i = 0; i <= Math.min(PLAYS.length - 1, pre ? -1 : live.playIdx); i++) {
    const p = PLAYS[i];
    if ((p.half === 'top' ? 'home' : 'away') === side && !pids.includes(p.pitcherId)) pids.push(p.pitcherId);
  }
  const curPit = !pre && (live.play.half === 'top' ? 'home' : 'away') === side ? live.play.pitcherId : null;
  const pit: Row[] = pids.flatMap((pid, k): Row[] => {
    const p = playerById(pid);
    if (!p) return [];
    const t = pitcherToday(pid, upto);
    const today = t.outs || t.pitches ? `${ipText(t.outs)}이닝 · ${t.pitches}구 · ${t.k}삼진 · ${t.r}실점` : '—';
    return [{ key: `p-${pid}`, p, pos: k === 0 ? '선발' : (p.role ? ROLE_KO[p.role] : '구원'), today, season: seasonPit(p), now: pid === curPit }];
  });
  return { bat, pit };
}

export function LineupSheet({ open, onClose, live, pre, done }: { open: boolean; onClose: () => void; live: Live; pre: boolean; done: boolean }) {
  const mySide: Side = GAME.match.homeId === ME.teamId ? 'home' : 'away';
  const [side, setSide] = useState<Side>(mySide);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const cards = useMemo(() => (open ? myCards() : new Map<string, CardInst>()), [open]);
  const away = teamById(GAME.match.awayId), home = teamById(GAME.match.homeId);
  const team = side === 'away' ? away : home;
  const { bat, pit } = useMemo(() => rowsOf(side, live, pre), [side, live, pre]);
  const p = live.play;
  const when = pre ? '경기 전' : done ? '경기 끝 기록' : `${p.inning}회${p.half === 'top' ? '초' : '말'}까지 오늘 기록`;
  const mine = team.id === ME.teamId;

  const row = (r: Row) => {
    const on = openRow === r.key;
    const card = mine ? cards.get(r.p.id) : undefined;
    const now = card ? cardNow(card) : null;
    const ovr = now?.ovr ?? r.p.ovr;
    return (
      <li key={r.key} className={[s.row, r.now && s.now, r.sub && s.sub, on && s.open].filter(Boolean).join(' ')}>
        <button type="button" className={s.head} aria-expanded={on} onClick={() => setOpenRow(on ? null : r.key)}>
          <span className={['num', s.ord].join(' ')}>{r.order ?? ''}</span>
          <span className={s.pos}>{r.pos}</span>
          <span className={s.who}>
            <b>{r.p.name}<small className="num">{tagOf(r.p.id)}</small>{r.now && <em>{r.order != null || r.sub ? '타석' : '투구 중'}</em>}</b>
            <span className={['num', s.today].join(' ')}>{r.today === '—' ? <i>오늘 아직 기록 없음</i> : <>오늘 {r.today}</>}</span>
            {r.season && <small>{r.season}</small>}
          </span>
        </button>
        {on && (
          <div className={s.more}>
            <p className={s.ovr}>종합 <b className="num">{ovr}</b>{now && ovr !== r.p.ovr ? <small> 카드 <span className="num">{r.p.ovr}</span> + 더해진 값</small> : null}</p>
            <div className={s.bars}>
              {r.p.face.map((f) => {
                const add = Math.round(now?.bonus.total[f.code] ?? 0);
                return <StatBar key={f.code} label={f.ko} value={f.v} bonus={add > 0 ? add : undefined} size="s" labelWidth={56} />;
              })}
            </div>
          </div>
        )}
      </li>
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title="라인업" sub={when} height="tall">
      <Tabs
        items={[{ value: 'away' as Side, label: away.short }, { value: 'home' as Side, label: home.short }]}
        value={side}
        onChange={(v) => { setSide(v); setOpenRow(null); }}
        fill
        aria-label="팀"
        className={s.tabs}
      />
      <p className={s.teamLine}><Emblem team={team} size={18} /><b>{team.name}</b>{mine && <span>우리 팀 · 능력치는 더해진 값까지</span>}</p>
      <h3 className={s.h}>타순</h3>
      <ul className={s.list}>{bat.map(row)}</ul>
      <h3 className={s.h}>투수</h3>
      <ul className={s.list}>{pit.map(row)}</ul>
      <p className={s.note}>오늘 기록은 지금 보는 장면까지만 세요. 선수를 누르면 능력치가 나와요.</p>
    </Sheet>
  );
}
