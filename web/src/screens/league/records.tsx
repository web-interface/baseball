// 순위·리그 기록의 '팀 기록' · '선수 기록' 보기 — 숫자는 season/awards seasonBook(시즌 저장 bat · pit · table · results 그대로).
//   팀 기록: 팀 타격 · 팀 투구(머리 칸을 누르면 그 기록 순) · 팀 간 승패표. 구단을 누르면 그 팀 선수 기록으로.
//   선수 기록: 타자 · 투수, 구단 거르기, 머리 칸 정렬. 비율 기록(타율 · 출루율 · 장타율 · OPS · 평균자책 · WHIP)으로 줄 세우면
//   규정(타석 = 소속 팀 경기 × 3.1, 이닝 = 팀 경기 × 1)을 채운 선수만 순위를 매기고, 못 채운 선수는 아래에 흐리게.
//   ?view=team · ?view=player&side=bat|pit&team=dj&sort=hr
import { useMemo, useState, type ReactNode } from 'react';
import { Link, setQueryQuiet } from '../../app/router';
import { Emblem, Icon, Tabs } from '../../ui';
import { ME, TEAMS, teamById } from '../../game/mock';
import { gamesPlayed, type SeasonState } from '../../season/store';
import {
  POS_SHORT, ROLE_KO, avgOf, eraOf, ipText, obpOf, opsOf, r2, r3, seasonBook, slgOf, whipOf, wpctOf,
  type BatRow, type BatSum, type PitRow, type PitSum, type TeamRow,
} from '../../season/awards';
import s from './league.module.css';

/* ───────── 정렬되는 표 ───────── */
export interface Col<R> {
  key: string; label: string;
  /** 줄 세우는 값 (없는 값은 맨 뒤로 가게 ±Infinity) */
  get: (r: R) => number;
  show: (r: R) => string;
  /** 비율 기록 — 규정을 채운 줄만 순위 */
  rate?: boolean;
  /** 작을수록 위 (평균자책 · WHIP · 팀 실점 …) */
  asc?: boolean;
}
const num = <R,>(key: string, label: string, f: (r: R) => number, asc?: boolean): Col<R> => ({ key, label, get: f, show: (r) => String(f(r)), asc });

interface Ranked<R> { row: R; rank: number | null }
/** 줄 세우기 — 같은 값이면 공동 순위. 비율 기록이면 규정 채운 줄만 순위, 나머지는 뒤에(순위 없음) */
function rankRows<R>(rows: R[], col: Col<R>, ok: ((r: R) => boolean) | null, tie: (r: R) => number): { top: Ranked<R>[]; rest: Ranked<R>[] } {
  const dir = col.asc ? 1 : -1;
  const v = (r: R) => { const x = col.get(r); return Number.isFinite(x) ? x : col.asc ? Infinity : -Infinity; };
  const cmp = (a: R, b: R) => (v(a) === v(b) ? 0 : v(a) < v(b) ? -dir : dir) || tie(b) - tie(a);
  const withRank = (list: R[]) => {
    const out: Ranked<R>[] = [];
    list.forEach((row, i) => {
      const prev = out[i - 1];
      out.push({ row, rank: prev && Math.abs(v(prev.row) - v(row)) < 1e-9 ? prev.rank : i + 1 });
    });
    return out;
  };
  if (col.rate && ok) {
    return { top: withRank(rows.filter(ok).sort(cmp)), rest: rows.filter((r) => !ok(r)).sort(cmp).map((row) => ({ row, rank: null })) };
  }
  return { top: withRank(rows.slice().sort(cmp)), rest: [] };
}

function SortTable<R>({ cols, sort, onSort, top, rest, restLabel, lead, leadHead, keyOf, mineOf, okOf, label, minW }: {
  cols: Col<R>[]; sort: string; onSort: (k: string) => void;
  top: Ranked<R>[]; rest: Ranked<R>[]; restLabel?: string;
  lead: (r: R) => ReactNode; leadHead: string;
  keyOf: (r: R) => string; mineOf: (r: R) => boolean; okOf?: (r: R) => boolean;
  label: string; minW: number;
}) {
  const sorted = cols.find((c) => c.key === sort) ?? cols[0];
  const row = (x: Ranked<R>, dim: boolean) => (
    <tr key={keyOf(x.row)} className={[mineOf(x.row) && s.me, dim && s.dim].filter(Boolean).join(' ') || undefined}>
      <td className={['num', s.sticky, s.cRank, s.rk].join(' ')}>{x.rank ?? ''}</td>
      <th scope="row" className={[s.sticky, s.cWho].join(' ')}>{lead(x.row)}</th>
      {cols.map((c) => (
        <td key={c.key} className={['num', c.key === sorted.key && s.on, c.rate && okOf && !okOf(x.row) && s.faint].filter(Boolean).join(' ') || undefined}>{c.show(x.row)}</td>
      ))}
    </tr>
  );
  return (
    <div className={s.tblWrap}>
      <table className={[s.stand, s.rec].join(' ')} style={{ minWidth: minW }} aria-label={label}>
        <thead>
          <tr>
            <th scope="col" className={[s.sticky, s.cRank].join(' ')}>순위</th>
            <th scope="col" className={[s.sticky, s.cWho].join(' ')}>{leadHead}</th>
            {cols.map((c) => (
              <th key={c.key} scope="col" aria-sort={c.key === sorted.key ? (c.asc ? 'ascending' : 'descending') : undefined} className={c.key === sorted.key ? s.on : undefined}>
                <button type="button" className={s.sortBtn} onClick={() => onSort(c.key)} title={`${c.label} 순`}>{c.label}</button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {top.map((x) => row(x, false))}
          {rest.length > 0 && (
            <tr className={s.restH}><td className={[s.sticky, s.cRank].join(' ')} /><th scope="row" className={[s.sticky, s.cWho].join(' ')}>{restLabel}</th><td colSpan={cols.length} /></tr>
          )}
          {rest.map((x) => row(x, true))}
        </tbody>
      </table>
    </div>
  );
}

/* ───────── 선수 기록 ───────── */
const BAT_COLS: Col<BatRow>[] = [
  { key: 'avg', label: '타율', get: (r) => (r.rec.AB ? avgOf(r.rec) : -Infinity), show: (r) => (r.rec.AB ? r3(avgOf(r.rec)) : '-'), rate: true },
  num('g', '경기', (r) => r.rec.G), num('pa', '타석', (r) => r.rec.PA), num('ab', '타수', (r) => r.rec.AB), num('h', '안타', (r) => r.rec.H),
  num('d', '2루타', (r) => r.rec.D), num('t', '3루타', (r) => r.rec.T), num('hr', '홈런', (r) => r.rec.HR), num('rbi', '타점', (r) => r.rec.RBI),
  num('r', '득점', (r) => r.rec.R), num('sb', '도루', (r) => r.rec.SB), num('bb', '볼넷', (r) => r.rec.BB), num('so', '삼진', (r) => r.rec.SO),
  { key: 'obp', label: '출루율', get: (r) => (r.rec.PA ? obpOf(r.rec) : -Infinity), show: (r) => (r.rec.PA ? r3(obpOf(r.rec)) : '-'), rate: true },
  { key: 'slg', label: '장타율', get: (r) => (r.rec.AB ? slgOf(r.rec) : -Infinity), show: (r) => (r.rec.AB ? r3(slgOf(r.rec)) : '-'), rate: true },
  { key: 'ops', label: 'OPS', get: (r) => (r.rec.PA ? opsOf(r.rec) : -Infinity), show: (r) => (r.rec.PA ? r3(opsOf(r.rec)) : '-'), rate: true },
];
const PIT_COLS: Col<PitRow>[] = [
  { key: 'era', label: '평균자책', get: (r) => (r.rec.outs ? eraOf(r.rec) : Infinity), show: (r) => (r.rec.outs ? r2(eraOf(r.rec)) : '-'), rate: true, asc: true },
  num('g', '경기', (r) => r.rec.G), num('gs', '선발', (r) => r.rec.GS), num('w', '승', (r) => r.rec.W), num('l', '패', (r) => r.rec.L),
  num('sv', '세이브', (r) => r.rec.SV), num('hld', '홀드', (r) => r.rec.HLD),
  { key: 'wpct', label: '승률', get: (r) => (r.rec.W + r.rec.L ? wpctOf(r.rec) : -Infinity), show: (r) => (r.rec.W + r.rec.L ? r3(wpctOf(r.rec)) : '-') },
  { key: 'ip', label: '이닝', get: (r) => r.rec.outs, show: (r) => ipText(r.rec.outs) },
  num('h', '피안타', (r) => r.rec.H), num('hr', '피홈런', (r) => r.rec.HR), num('bb', '볼넷', (r) => r.rec.BB), num('so', '탈삼진', (r) => r.rec.SO),
  num('r', '실점', (r) => r.rec.R), num('er', '자책', (r) => r.rec.ER),
  { key: 'whip', label: 'WHIP', get: (r) => (r.rec.outs ? whipOf(r.rec) : Infinity), show: (r) => (r.rec.outs ? r2(whipOf(r.rec)) : '-'), rate: true, asc: true },
];
const PAGE = 40;

/** 선수 기록 보기 상태 — 주소(?side · ?team · ?sort)에도 남긴다 */
export interface RecState { side: 'bat' | 'pit'; team: string; sort: string | null }
export const recOfQuery = (q: URLSearchParams): RecState => {
  const team = q.get('team');
  return { side: q.get('side') === 'pit' ? 'pit' : 'bat', team: team && TEAMS.some((t) => t.id === team) ? team : '', sort: q.get('sort') };
};
export const recQuery = (r: RecState): Record<string, string | null> => ({ side: r.side === 'pit' ? 'pit' : null, team: r.team || null, sort: r.sort });

export function PlayerRecords({ st, rec, onRec }: { st: SeasonState; rec: RecState; onRec: (r: RecState) => void }) {
  const book = useMemo(() => seasonBook(st), [st]);
  const { side, team } = rec;
  const cols = (side === 'bat' ? BAT_COLS : PIT_COLS) as Col<BatRow | PitRow>[];
  const sort = cols.some((c) => c.key === rec.sort) ? rec.sort! : cols[0].key;
  const [more, setMore] = useState(0);
  const upd = (patch: Partial<RecState>) => {
    setMore(0);
    onRec({ ...rec, ...patch, ...(patch.side && patch.side !== rec.side ? { sort: null } : {}) });
  };

  const rows = useMemo(() => {
    const all = (side === 'bat' ? book.bat : book.pit) as (BatRow | PitRow)[];
    return team ? all.filter((r) => r.team === team) : all;
  }, [book, side, team]);
  const col = cols.find((c) => c.key === sort) ?? cols[0];
  const tie = (r: BatRow | PitRow) => (side === 'bat' ? (r.rec as BatSum).PA : (r.rec as PitSum).outs);
  const { top, rest } = useMemo(() => rankRows(rows, col, (r) => r.ok, tie), [rows, col]); // eslint-disable-line react-hooks/exhaustive-deps
  const limit = team ? Infinity : PAGE * (more + 1);
  const shownTop = top.slice(0, limit);
  const shownRest = rest.slice(0, Math.max(0, limit - top.length));
  const left = top.length + rest.length - shownTop.length - shownRest.length;
  const needOf = team || ME.teamId;
  const need = side === 'bat' ? Math.ceil(gamesPlayed(needOf, st) * 3.1) : gamesPlayed(needOf, st);
  const okN = rows.filter((r) => r.ok).length;

  const lead = (r: BatRow | PitRow) => {
    const t = teamById(r.team);
    return (
      <Link to={`/player/${r.id}`} className={s.who}>
        <b>{r.name}</b>
        <small>{!team && <Emblem team={t} size={12} decorative />}{!team && t.short}{!team && ' · '}{side === 'pit' ? ROLE_KO[(r as PitRow).role] : POS_SHORT[r.pos]}</small>
      </Link>
    );
  };
  return (
    <section className={s.sec} aria-label="선수 기록">
      <div className={s.recCtl}>
        <Tabs variant="box" size="s" aria-label="타자 · 투수" value={side} onChange={(v) => upd({ side: v as 'bat' | 'pit' })}
          items={[{ value: 'bat', label: '타자' }, { value: 'pit', label: '투수' }]} />
        <label className={s.teamSel}>
          <span className="sr-only">구단</span>
          <select value={team} onChange={(e) => upd({ team: e.target.value })}>
            <option value="">전체 구단</option>
            {TEAMS.map((t) => <option key={t.id} value={t.id}>{t.name}{t.id === ME.teamId ? ' (우리)' : ''}</option>)}
          </select>
          <Icon name="chevron-down" size={14} />
        </label>
      </div>
      <p className={s.rule}>
        {side === 'bat' ? '규정타석' : '규정이닝'} <b className="num">{need}</b>
        <span className={s.ruleSep}>채운 선수 <b className="num">{okN}</b>명</span>
      </p>
      {rows.length ? (
        <SortTable<BatRow | PitRow>
          cols={cols} sort={col.key} onSort={(k) => upd({ sort: k === cols[0].key ? null : k })}
          top={shownTop} rest={shownRest} restLabel={side === 'bat' ? '규정타석 미달' : '규정이닝 미달'}
          lead={lead} leadHead="선수" keyOf={(r) => r.key} mineOf={(r) => !team && r.team === ME.teamId} okOf={(r) => r.ok}
          label={`${team ? teamById(team).short + ' ' : ''}${side === 'bat' ? '타자' : '투수'} 시즌 기록`} minW={side === 'bat' ? 820 : 860}
        />
      ) : (
        <p className={s.empty}>아직 기록이 없어요</p>
      )}
      {left > 0 && (
        <button type="button" className={s.moreBtn} onClick={() => setMore((m) => m + 1)}>더 보기 <span className="num">{left}</span>명</button>
      )}
    </section>
  );
}

/* ───────── 팀 기록 ───────── */
const TB_COLS: Col<TeamRow>[] = [
  { key: 'avg', label: '타율', get: (t) => avgOf(t.bat), show: (t) => (t.bat.AB ? r3(avgOf(t.bat)) : '-') },
  num('r', '득점', (t) => t.rs), num('h', '안타', (t) => t.bat.H), num('d', '2루타', (t) => t.bat.D), num('t', '3루타', (t) => t.bat.T),
  num('hr', '홈런', (t) => t.bat.HR), num('rbi', '타점', (t) => t.bat.RBI), num('sb', '도루', (t) => t.bat.SB), num('bb', '볼넷', (t) => t.bat.BB),
  num('so', '삼진', (t) => t.bat.SO, true),
  { key: 'obp', label: '출루율', get: (t) => obpOf(t.bat), show: (t) => (t.bat.PA ? r3(obpOf(t.bat)) : '-') },
  { key: 'slg', label: '장타율', get: (t) => slgOf(t.bat), show: (t) => (t.bat.AB ? r3(slgOf(t.bat)) : '-') },
  { key: 'ops', label: 'OPS', get: (t) => opsOf(t.bat), show: (t) => (t.bat.PA ? r3(opsOf(t.bat)) : '-') },
];
const TP_COLS: Col<TeamRow>[] = [
  { key: 'era', label: '평균자책', get: (t) => (t.pit.outs ? eraOf(t.pit) : Infinity), show: (t) => (t.pit.outs ? r2(eraOf(t.pit)) : '-'), asc: true },
  num('ra', '실점', (t) => t.ra, true), num('er', '자책', (t) => t.pit.ER, true),
  { key: 'ip', label: '이닝', get: (t) => t.pit.outs, show: (t) => ipText(t.pit.outs) },
  num('h', '피안타', (t) => t.pit.H, true), num('hr', '피홈런', (t) => t.pit.HR, true), num('bb', '볼넷', (t) => t.pit.BB, true), num('so', '탈삼진', (t) => t.pit.SO),
  { key: 'whip', label: 'WHIP', get: (t) => (t.pit.outs ? whipOf(t.pit) : Infinity), show: (t) => (t.pit.outs ? r2(whipOf(t.pit)) : '-'), asc: true },
  num('sv', '세이브', (t) => t.pit.SV), num('hld', '홀드', (t) => t.pit.HLD),
];

export function TeamRecords({ st, onTeam }: { st: SeasonState; onTeam: (teamId: string) => void }) {
  const book = useMemo(() => seasonBook(st), [st]);
  const [bSort, setB] = useState('avg');
  const [pSort, setP] = useState('era');
  const lead = (t: TeamRow) => {
    const tm = teamById(t.teamId);
    return (
      <button type="button" className={[s.club, s.clubBtn].join(' ')} onClick={() => onTeam(t.teamId)} aria-label={`${tm.name} 선수 기록 보기`}>
        <Emblem team={tm} size={20} /><b>{tm.short}</b>
      </button>
    );
  };
  const table = (cols: Col<TeamRow>[], sort: string, onSort: (k: string) => void, label: string) => {
    const col = cols.find((c) => c.key === sort) ?? cols[0];
    const { top } = rankRows(book.teams, col, null, (t) => -t.rank);
    return <SortTable<TeamRow> cols={cols} sort={col.key} onSort={onSort} top={top} rest={[]} lead={lead} leadHead="구단" keyOf={(t) => t.teamId} mineOf={(t) => t.teamId === ME.teamId} label={label} minW={cols.length * 46 + 124} />;
  };
  if (st.next === 0) return <section className={s.sec}><p className={s.empty}>개막하면 팀 기록이 쌓여요</p></section>;
  return (
    <>
      <section className={s.sec} aria-label="팀 타격">
        <h3 className={s.secH}>팀 타격</h3>
        {table(TB_COLS, bSort, setB, '팀 타격 기록')}
      </section>
      <section className={s.sec} aria-label="팀 투구">
        <h3 className={s.secH}>팀 투구</h3>
        {table(TP_COLS, pSort, setP, '팀 투구 기록')}
        <p className={s.hint}>구단을 누르면 그 팀 선수 기록 · 머리 칸을 누르면 그 기록 순</p>
      </section>
      <HeadToHead book={book} onTeam={onTeam} />
    </>
  );
}

/** 팀 간 승패표 — 가로 줄 구단이 세로 칸 구단에게 거둔 승-패(-무) */
function HeadToHead({ book, onTeam }: { book: ReturnType<typeof seasonBook>; onTeam: (teamId: string) => void }) {
  const order = book.teams.map((t) => t.teamId);
  return (
    <section className={s.sec} aria-label="팀 간 승패">
      <h3 className={s.secH}>팀 간 승패 <small>가로 구단 기준 승-패-무</small></h3>
      <div className={s.tblWrap}>
        <table className={s.h2h}>
          <thead>
            <tr>
              <th scope="col" className={[s.sticky, s.hTeam].join(' ')}><span className="sr-only">구단</span></th>
              {order.map((id) => (
                <th key={id} scope="col" className={id === ME.teamId ? s.hMeCol : undefined}>
                  <span className={s.hHead}><Emblem team={teamById(id)} size={18} decorative /><small>{teamById(id).short.slice(0, 2)}</small></span>
                </th>
              ))}
              <th scope="col" className={s.hSum}>합계</th>
            </tr>
          </thead>
          <tbody>
            {order.map((a) => {
              const t = book.teams.find((x) => x.teamId === a)!;
              const mine = a === ME.teamId;
              return (
                <tr key={a} className={mine ? s.me : undefined}>
                  <th scope="row" className={[s.sticky, s.hTeam].join(' ')}>
                    <button type="button" className={[s.club, s.clubBtn].join(' ')} onClick={() => onTeam(a)} aria-label={`${teamById(a).name} 선수 기록 보기`}>
                      <Emblem team={teamById(a)} size={16} decorative /><b>{teamById(a).short}</b>
                    </button>
                  </th>
                  {order.map((b) => {
                    if (a === b) return <td key={b} className={s.hSelf} aria-label="같은 구단">—</td>;
                    const x = book.h2h[a]?.[b] ?? { w: 0, d: 0, l: 0 };
                    const tone = x.w > x.l ? s.hWin : x.w < x.l ? s.hLose : undefined;
                    return (
                      <td key={b} className={['num', tone, b === ME.teamId && s.hMeCol].filter(Boolean).join(' ')} title={`${teamById(a).short} 대 ${teamById(b).short} ${x.w}승 ${x.l}패${x.d ? ` ${x.d}무` : ''}`}>
                        {x.w}-{x.l}{x.d ? <small>-{x.d}</small> : null}
                      </td>
                    );
                  })}
                  <td className={['num', s.hSum].join(' ')}>{t.w}-{t.l}{t.d ? <small>-{t.d}</small> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
