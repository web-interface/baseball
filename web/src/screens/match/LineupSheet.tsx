// 경기 중 라인업 — 어웨이 · 홈 두 팀을 카드로: 1~9번 타자(지금 그 자리 선수 · 교체 반영) + 지금 투수.
// 카드 아래 = 포지션 · 짧은 오늘 기록(지금 장면까지). 카드를 누르면 그 팀 아래에 능력치(우리 선수는 강화 · 훈련 · 잠재력 ·
// 세트덱이 더해진 값까지 — 라인업 화면과 같은 숫자) · 오늘 기록 · 시즌 성적. 경기장 오른쪽 아래 '라인업' 단추로 연다.
import { useMemo, useState } from 'react';
import { Emblem, Icon, Sheet, StatBar } from '../../ui';
import { CardMini, cardProps } from '../../cards';
import { CARDS, ME, playerById, teamById } from '../../game/mock';
import { POS_KO } from '../../game/labels';
import { cardInst, seasonCardOf } from '../../game/kbo';
import type { CardInst, GradeId, Player } from '../../game/types';
import { avgLabel, batLine, eraLabel, pitLine } from '../../season/store';
import { cardNow } from '../lineup/ctx';
import { initialLineup, store as lineupStore, unit } from '../lineup/calc';
import { avg as fAvg, era as fEra } from '../../ui/format';
import { GAME } from './local-mock';
import { PLAYS, type Live } from './timeline';
import { ipText, isSeasonGame, pitcherToday } from './Panels';
import s from './LineupSheet.module.css';
import { cardShow, cardViewPlayer, playerShift, shiftPlayer, showOvr } from '../../game/ovrShow';

type Side = 'away' | 'home';
const HITS = ['1B', '2B', '3B', 'HR'];
/** 카드 아래 짧은 포지션 */
const POS_SHORT: Record<string, string> = { C: '포수', '1B': '1루', '2B': '2루', '3B': '3루', SS: '유격', LF: '좌익', CF: '중견', RF: '우익', DH: '지명' };

/** 경기장 오른쪽 아래 단추 */
export function LineupButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={s.btn} onClick={onClick} aria-label="두 팀 라인업 보기">
      <Icon name="lineup" size={15} />
      <span>라인업</span>
    </button>
  );
}

/** 오늘 타자 기록 (지금 장면 앞까지) — 그 팀 공격만 (같은 선수 id 가 두 팀에 있어도 섞이지 않게) */
function batToday(id: string, upto: number, side: Side) {
  let pa = 0, ab = 0, h = 0, hr = 0, rbi = 0, bb = 0;
  for (let i = 0; i < upto && i < PLAYS.length; i++) {
    const p = PLAYS[i];
    if (p.batterId !== id || !p.isPA || (p.half === 'top' ? 'away' : 'home') !== side) continue;
    pa++;
    if (p.code === 'BB' || p.code === 'HBP') bb++;
    else if (p.code !== 'SF' && p.code !== 'SAC') ab++;
    if (HITS.includes(p.code)) h++;
    if (p.code === 'HR') hr++;
    rbi += p.rbi;
  }
  return { pa, ab, h, hr, rbi, bb };
}
function batLong(t: ReturnType<typeof batToday>) {
  if (!t.pa) return '아직 타석 없음';
  const parts = [`${t.ab}타수 ${t.h}안타`];
  if (t.hr) parts.push(`${t.hr}홈런`);
  if (t.rbi) parts.push(`${t.rbi}타점`);
  if (t.bb) parts.push(`${t.bb}볼넷`);
  return parts.join(' · ');
}
/** 카드 아래 짧게 — 안타/타수 (홈런은 HR) */
const batShort = (t: ReturnType<typeof batToday>) => (t.pa ? `${t.h}/${t.ab}${t.hr ? ` · ${t.hr > 1 ? t.hr : ''}HR` : ''}` : '—');

/** 시즌 성적 — 시즌 경기는 이 게임 시즌 기록, 그 밖(대전 · 미리보기)은 카드 시즌 기록 */
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

/** 내 라인업 카드 (선수 id → 카드) */
function myCards(): Map<string, CardInst> {
  const m = new Map<string, CardInst>();
  try {
    const st = lineupStore.get() ?? initialLineup();
    const ids = [...Object.values(st.field), ...st.rotation, ...st.bullpen, st.closer, ...st.bench].filter((x): x is string => !!x);
    for (const id of ids) { try { const u = unit(id); if (!m.has(u.player.id)) m.set(u.player.id, u.card); } catch { /* 없는 카드 */ } }
  } catch { /* 라인업 없음 */ }
  return m;
}
/** 선수 → 카드 모양 — 내 선수는 내 카드 그대로(강화 · 훈련 · 잠재력 · 지금 종합), 상대는 그 해 실제 카드(없으면 기본) */
export function cardFor(p: Player, mine: Map<string, CardInst>) {
  const c = mine.get(p.id);
  if (c) {
    const now = cardNow(c);
    return { props: { ...cardProps(c), ovrShown: now?.ovr }, card: c };
  }
  const v = /^(k[0-9a-z]+)~(\d{4})$/.exec(p.id);
  const kc = v ? seasonCardOf(v[1], Number(v[2])) : undefined;
  if (kc) { const inst = cardInst(kc); return { props: { player: cardViewPlayer(inst, p), grade: inst.grade, year: inst.year, cardId: inst.id }, card: null }; }
  const legacy = CARDS.find((x) => x.playerId === p.id);
  if (legacy) return { props: { player: cardViewPlayer(legacy, p), grade: legacy.grade, year: legacy.year, cardId: legacy.id }, card: null };
  return { props: { player: shiftPlayer(p, playerShift(p.ovr)), grade: 'normal' as GradeId }, card: null };
}

interface Cell { key: string; p: Player; badge: string; pos: string; short: string; long: string; season: string; now: boolean; pitcher: boolean }

/** 내 편 — 대전 다시 보기는 늘 원정(pvp-game: 나 = away), 그 밖은 내 구단 쪽(같은 구단끼리면 홈 — 경기 화면 다른 곳과 같게) */
function mySideOf(): Side | null {
  if (GAME.match.id.startsWith('pvp-')) return 'away';
  if (GAME.match.homeId === ME.teamId) return 'home';
  if (GAME.match.awayId === ME.teamId) return 'away';
  return null;
}
const NO_CARDS = new Map<string, CardInst>();

/** 그 팀 1~9번(지금 그 자리 선수) + 지금 투수 — 경기가 끝났으면 '타석 · 투구 중' 표시 없이 */
function cellsOf(side: Side, live: Live, pre: boolean, done: boolean): Cell[] {
  const g = GAME[side];
  const upto = pre ? 0 : live.playIdx + (live.applied ? 1 : 0);
  const bySlot = new Map<number, { pid: string; pos: string }>();
  for (const b of g.batting) bySlot.set(b.slot, { pid: b.pid, pos: b.pos });
  for (let i = 0; i < upto && i < PLAYS.length; i++) {
    const p = PLAYS[i];
    if ((p.half === 'top' ? 'away' : 'home') !== side || !p.isPA) continue;
    const cur = bySlot.get(p.slot);
    if (cur && cur.pid !== p.batterId) bySlot.set(p.slot, { pid: p.batterId, pos: cur.pos }); // 대타 · 교체 — 그 자리 포지션 그대로
  }
  const batting = !pre && !done && (live.play.half === 'top' ? 'away' : 'home') === side;
  const cells: Cell[] = [];
  [...bySlot.keys()].sort((a, b) => a - b).forEach((slot) => {
    const x = bySlot.get(slot)!;
    const p = playerById(x.pid);
    if (!p) return;
    const t = batToday(x.pid, upto, side);
    cells.push({
      key: `b${slot}`, p, badge: String(slot), pos: POS_SHORT[x.pos] ?? x.pos, short: batShort(t), long: batLong(t),
      season: seasonBat(p), now: batting && live.play.batterId === x.pid, pitcher: false,
    });
  });
  // 지금 투수 — 수비 중이면 지금 마운드, 공격 중이면 마지막으로 던진 투수 (경기 전엔 선발)
  let pid = g.starter;
  for (let i = 0; i <= Math.min(PLAYS.length - 1, pre ? -1 : live.playIdx); i++) {
    const p = PLAYS[i];
    if ((p.half === 'top' ? 'home' : 'away') === side) pid = p.pitcherId;
  }
  const pp = playerById(pid);
  if (pp) {
    const t = pitcherToday(pid, upto, side);
    const thrown = t.outs > 0 || t.pitches > 0;
    cells.push({
      key: 'p', p: pp, badge: 'P', pos: pid === g.starter ? '선발' : '구원', short: thrown ? `${ipText(t.outs)}이닝` : '—',
      long: thrown ? `${ipText(t.outs)}이닝 · ${t.pitches}구 · ${t.k}삼진 · ${t.r}실점` : '아직 투구 없음',
      season: seasonPit(pp), now: !pre && !done && !batting, pitcher: true,
    });
  }
  return cells;
}

export function LineupSheet({ open, onClose, live, pre, done }: { open: boolean; onClose: () => void; live: Live; pre: boolean; done: boolean }) {
  const [sel, setSel] = useState<string | null>(null);
  const mine = useMemo(() => (open ? myCards() : new Map<string, CardInst>()), [open]);
  const p = live.play;
  const when = pre ? '경기 전 · 선발 라인업' : done ? '경기 끝 · 마지막 라인업' : `${p.inning}회${p.half === 'top' ? '초' : '말'} · 지금 라인업`;
  return (
    <Sheet open={open} onClose={() => { setSel(null); onClose(); }} title="라인업" sub={when} height="tall">
      {(['away', 'home'] as Side[]).map((side) => (
        <TeamBlock key={side} side={side} live={live} pre={pre} done={done} mine={mine} sel={sel} onSel={setSel} />
      ))}
      <p className={s.note}>카드를 누르면 능력치 · 오늘 기록 · 시즌 성적이 나와요. 오늘 기록은 지금 보는 장면까지만 세요.</p>
    </Sheet>
  );
}

function TeamBlock({ side, live, pre, done, mine: myCardsMap, sel, onSel }: { side: Side; live: Live; pre: boolean; done: boolean; mine: Map<string, CardInst>; sel: string | null; onSel: (k: string | null) => void }) {
  const team = teamById(side === 'away' ? GAME.match.awayId : GAME.match.homeId);
  const my = mySideOf() === side;
  // 내 카드 모양(강화 · 보너스 · '우리 선수')은 내 편에만 — 상대에 같은 선수가 있어도 상대 카드는 그 해 카드로
  const mine = my ? myCardsMap : NO_CARDS;
  const cells = useMemo(() => cellsOf(side, live, pre, done), [side, live, pre, done]);
  const picked = cells.find((c) => `${side}:${c.key}` === sel) ?? null;
  return (
    <section className={[s.team, my && s.myTeam].filter(Boolean).join(' ')} aria-label={`${side === 'away' ? '원정' : '홈'} ${team.name}`}>
      <p className={s.teamHead}>
        <Emblem team={team} size={20} />
        <b>{team.name}</b>
        <span className={s.side}>{side === 'away' ? '어웨이' : '홈'}</span>
        {my && <em>우리 팀</em>}
      </p>
      <ol className={s.grid}>
        {cells.map((c) => {
          const k = `${side}:${c.key}`;
          const { props } = cardFor(c.p, mine);
          return (
            <li key={c.key} className={[s.cell, c.now && s.now, sel === k && s.on].filter(Boolean).join(' ')}>
              <CardMini {...props} badge={c.badge} selected={sel === k} onClick={() => onSel(sel === k ? null : k)} style={{ width: '100%' }} />
              <span className={s.cap}>
                <b>{c.now ? (c.pitcher ? '투구 중' : '타석') : c.pos}</b>
                <span className="num">{c.short}</span>
              </span>
            </li>
          );
        })}
      </ol>
      {picked && <Detail cell={picked} mine={mine} />}
    </section>
  );
}

function Detail({ cell, mine }: { cell: Cell; mine: Map<string, CardInst> }) {
  const { card } = cardFor(cell.p, mine);
  const now = card ? cardNow(card) : null;
  // 화면 눈금 — 우리 카드면 카드 구간 + 더해진 값, 아니면 꺾은선
  const sh = card ? cardShow(card, cell.p.ovr).shift : playerShift(cell.p.ovr);
  const ovr = card ? Math.round((now?.ovr ?? card.ovr ?? cell.p.ovr) + sh) : showOvr(cell.p.ovr);
  const fb = card?.boost ?? 0;
  return (
    <div className={s.detail}>
      <p className={s.dName}>
        <b>{cell.p.name}</b>
        <span>{cell.pitcher ? cell.pos + ' 투수' : POS_KO[cell.p.pos as keyof typeof POS_KO] ?? cell.pos}</span>
        <span className={s.dOvr}>종합 <b className="num">{ovr}</b></span>
      </p>
      <p className={s.dLine}><i>오늘</i><span className="num">{cell.long}</span></p>
      {cell.season && <p className={s.dLine}><i>시즌</i><span className="num">{cell.season}</span></p>}
      <div className={s.bars}>
        {cell.p.face.map((f) => {
          const add = Math.round(now?.bonus.total[f.code] ?? 0);
          return <StatBar key={f.code} label={f.ko} value={f.v + fb + sh} bonus={add > 0 ? add : undefined} size="s" labelWidth={56} />;
        })}
      </div>
      {card && <p className={s.dNote}>우리 선수 — 강화 · 훈련 · 잠재력 · 세트덱이 더해진 값</p>}
    </div>
  );
}
