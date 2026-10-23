// 경기 기록 #/games — 지난 경기 목록(우리 경기/모든 경기 · 달별 · 포스트시즌) · ?g=<경기 키> 박스스코어
//   ?all=1 모든 경기 · ?m=6 그 달만(m=post 포스트시즌) · ?s=<시즌 시드> 지난 시즌(저장된 우리 경기만)
//   박스스코어: 우리 경기 = 결과가 들어갈 때 저장한 것(season/box) · 다른 구단끼리 = 볼 때 다시 계산(./resim).
//   박스 저장 전에 치른 우리 경기는 점수판(이닝 점수 · 안타 · 실책 · 승패 투수)만.
import { useEffect, useMemo, useState } from 'react';
import type { ScreenProps } from '../../app/screen';
import { Link, setQueryQuiet } from '../../app/router';
import { Emblem, Icon, Tabs } from '../../ui';
import { ME, teamById } from '../../game/mock';
import { allDays, useSeason, yearOf, type SeasonState } from '../../season/store';
import { longDate, shortDate } from '../../season/schedule';
import type { SeriesId } from '../../season/post';
import { boxKeyOf, boxKeyOfMyGame, boxSeasons, boxesOf, getBox, parseBoxKey, postBoxKeyOf, useBoxVersion, type BoxView } from '../../season/box';
import { BoxScore, type BoardData } from './BoxScore';
import { resimGame, type Resim } from './resim';
import { RES_KO, SERIES_KO, SERIES_SHORT, dowOf, monthOf, nameOf, postGames, resOf, useKeepSelected, useRosters } from './shared';
import s from './games.module.css';

export default function GamesScreen({ query }: ScreenProps) {
  useRosters();
  const g = query.get('g');
  const seed = query.get('s');
  if (g) return <BoxPage key={`${g}|${seed ?? ''}`} gameKey={g} seed={seed} />;
  return <GameList query={query} />;
}

/* ───────── 목록 ───────── */
interface Row {
  key: string;
  date: string;
  away: string; home: string;
  score: [number, number];
  innings: number;
  walkoff?: boolean;
  cancelled?: boolean;
  mine: boolean;
  post?: { series: SeriesId; no: number };
  /** 승 · 패 · 세 투수 이름 */
  dec?: { w?: string; l?: string; s?: string };
  /** 지난 시즌(박스만) — 링크에 시즌 시드 */
  seed?: string;
}

const decFromBox = (v: BoxView) => {
  const out: Row['dec'] = {};
  for (const side of v.pit) for (const p of side) {
    if (p.dec === 'W') out.w = p.name;
    else if (p.dec === 'L') out.l = p.name;
    else if (p.dec === 'S') out.s = p.name;
  }
  return out;
};

function rowsOf(st: SeasonState, all: boolean): Row[] {
  const days = allDays(st);
  const out: Row[] = [];
  const myByIdx = new Map(st.my.map((m) => [m.idx, m]));
  for (let idx = 0; idx < Math.min(st.next, days.length); idx++) {
    const d = days[idx];
    for (const r of st.results[idx] ?? []) {
      const mine = r.a === ME.teamId || r.h === ME.teamId;
      if (!all && !mine) continue;
      if (!all && r.c) continue;
      const m = mine ? myByIdx.get(idx) : undefined;
      out.push({
        key: boxKeyOf(idx, r.a, r.h), date: d.date, away: r.a, home: r.h, score: r.s, innings: r.inn ?? 9, walkoff: !!r.wo, cancelled: !!r.c, mine,
        dec: m?.dec ? { w: nameOf(m.dec.w), l: nameOf(m.dec.l), s: nameOf(m.dec.s) } : undefined,
      });
    }
  }
  for (const at of postGames(st.post)) {
    const mine = !!at.rec.mine || at.rec.away === ME.teamId || at.rec.home === ME.teamId;
    if (!all && !mine) continue;
    const key = postBoxKeyOf(at.n, at.rec.away, at.rec.home);
    const box = mine ? getBox(key, st.seed) : null;
    out.push({
      key, date: at.rec.date, away: at.rec.away, home: at.rec.home, score: at.rec.s, innings: at.rec.inn, mine,
      post: { series: at.series, no: at.rec.no }, dec: box ? decFromBox(box) : undefined, walkoff: box?.walkoff,
    });
  }
  return out;
}

function GameList({ query }: { query: URLSearchParams }) {
  const st = useSeason();
  const bv = useBoxVersion();
  const [all, setAllS] = useState(query.get('all') === '1');
  const [month, setMonthS] = useState<string>(query.get('m') ?? 'all');
  const prev = useMemo(() => boxSeasons().filter((x) => x.seed !== st.seed && x.club === st.club && x.count > 0).pop() ?? null, [st.seed, st.club, bv]);
  const [seed, setSeedS] = useState<string | null>(query.get('s') && query.get('s') === prev?.seed ? query.get('s') : null);
  const [more, setMore] = useState(1);
  const setAll = (v: boolean) => { setAllS(v); setMore(1); setQueryQuiet({ all: v ? '1' : null }); };
  const setMonth = (v: string) => { setMonthS(v); setMore(1); setQueryQuiet({ m: v === 'all' ? null : v }); };
  const setSeed = (v: string | null) => { setSeedS(v); setMonthS('all'); setMore(1); setQueryQuiet({ s: v, m: null }); };
  // 같은 화면에서 주소만 바뀌어도(다른 곳의 링크) 따라간다
  const qAll = query.get('all'), qM = query.get('m'), qS = query.get('s');
  useEffect(() => { setAllS(qAll === '1'); }, [qAll]);
  useEffect(() => { setMonthS(qM ?? 'all'); }, [qM]);
  useEffect(() => { setSeedS(qS && qS === prev?.seed ? qS : null); }, [qS]); // eslint-disable-line react-hooks/exhaustive-deps

  const past = !!seed && !!prev;
  const rows = useMemo(() => {
    if (past) return boxesOf(prev!.seed).map((v): Row => ({
      key: v.key, date: v.date, away: v.away, home: v.home, score: v.score, innings: v.innings, walkoff: v.walkoff, mine: true,
      post: v.post ? { series: v.post.series as SeriesId, no: v.post.no } : undefined,
      dec: decFromBox(v), seed: prev!.seed,
    }));
    return rowsOf(st, all);
  }, [st, all, past, prev, bv]); // eslint-disable-line react-hooks/exhaustive-deps

  // 달 — 경기가 있는 달만 (포스트시즌은 따로)
  const months = useMemo(() => [...new Set(rows.filter((r) => !r.post).map((r) => monthOf(r.date)))].sort((a, b) => a - b), [rows]);
  const hasPost = rows.some((r) => r.post);
  const m = month === 'post' ? (hasPost ? 'post' : 'all') : month !== 'all' && months.includes(Number(month)) ? month : 'all';
  const shown = rows.filter((r) => (m === 'all' ? true : m === 'post' ? !!r.post : !r.post && monthOf(r.date) === Number(m)));
  const list = shown.slice().reverse(); // 최근 경기부터

  // 내 성적 (목록 머리)
  const mine = rows.filter((r) => r.mine && !r.cancelled && !r.post);
  const rec = mine.reduce((a, r) => {
    const my = r.home === ME.teamId ? r.score[1] : r.score[0], their = r.home === ME.teamId ? r.score[0] : r.score[1];
    a[resOf(my, their)]++;
    return a;
  }, { W: 0, D: 0, L: 0 });
  const year = past ? prev!.year : yearOf(st);

  const stripRef = useKeepSelected(`${m}|${past}`);
  const PAGE = all ? 12 : 40; // 모든 경기는 날짜 묶음 12개씩, 우리 경기는 40경기씩
  return (
    <div className={s.screen}>
      <header className={s.head}>
        <div className={s.headTop}>
          <h2 className={['head', s.h].join(' ')}><span className="num">{year}</span> 경기 기록</h2>
          {!past && <Tabs variant="box" size="s" aria-label="보기" value={all ? 'all' : 'mine'} onChange={(v) => setAll(v === 'all')}
            items={[{ value: 'mine', label: '우리 경기' }, { value: 'all', label: '모든 경기' }]} />}
        </div>
        <p className={s.meta}>
          <span>
            {mine.length
              ? <>{past ? '지난 시즌 · 저장된 ' : '정규 시즌 '}우리 <b className="num">{mine.length}</b>경기 · <span className="num">{rec.W}</span>승 <span className="num">{rec.D}</span>무 <span className="num">{rec.L}</span>패</>
              : '아직 치른 경기가 없어요'}
          </span>
          {prev && (
            <button type="button" className={s.seasonSwitch} onClick={() => setSeed(past ? null : prev.seed)}>
              {past ? <>이번 시즌 보기</> : <>지난 시즌(<span className="num">{prev.year}</span>) 우리 경기</>}
            </button>
          )}
        </p>
      </header>

      {(months.length > 0 || hasPost) && (
        <div ref={stripRef} className={s.months}>
          <Tabs size="s" aria-label="달" value={m} onChange={setMonth}
            items={[{ value: 'all', label: '전체' }, ...months.map((x) => ({ value: String(x), label: `${x}월` })), ...(hasPost ? [{ value: 'post', label: '포스트시즌' }] : [])]} />
        </div>
      )}

      {list.length === 0 ? (
        <div className={s.empty}>
          <p><b>{rows.length ? '이 달에는 치른 경기가 없어요.' : '아직 기록이 없어요.'}</b></p>
          <p>경기를 치르면 여기 쌓이고, 누르면 박스스코어를 볼 수 있어요.</p>
          <Link to="/season" className={s.emptyLink}>경기 준비·진행으로 <Icon name="chevron" size={14} /></Link>
        </div>
      ) : all && !past ? (
        <AllList rows={list} limit={PAGE * more} onMore={() => setMore((x) => x + 1)} />
      ) : (
        <>
          <ul className={s.list} aria-label="우리 경기">
            {list.slice(0, PAGE * more).map((r) => <MineRow key={r.key} r={r} />)}
          </ul>
          {list.length > PAGE * more && <button type="button" className={s.more} onClick={() => setMore((x) => x + 1)}>더 보기 <span className="num">{list.length - PAGE * more}</span></button>}
        </>
      )}
      <p className={s.note}><Icon name="info" size={13} /> 우리 경기 박스스코어는 결과가 들어갈 때 이 기기에 저장해요(이번 · 지난 시즌). 다른 구단끼리 경기는 열 때 같은 조건으로 다시 계산해요.</p>
    </div>
  );
}

const gameHref = (r: Row) => `/games?g=${r.key}${r.seed ? `&s=${r.seed}` : ''}`;

function MineRow({ r }: { r: Row }) {
  const home = r.home === ME.teamId;
  const opp = home ? r.away : r.home;
  const my = home ? r.score[1] : r.score[0], their = home ? r.score[0] : r.score[1];
  const res = resOf(my, their);
  const t = teamById(opp);
  const decs = [r.dec?.w && `승 ${r.dec.w}`, r.dec?.l && `패 ${r.dec.l}`, r.dec?.s && `세 ${r.dec.s}`].filter(Boolean) as string[];
  return (
    <li>
      <Link to={gameHref(r)} className={[s.mrow, s['r' + res]].join(' ')} aria-label={`${longDate(r.date)} ${t.short}전 ${my}대${their} ${RES_KO[res]}`}>
        <span className={s.mDate}><b className="num">{shortDate(r.date)}</b><small>{dowOf(r.date)}</small></span>
        <span className={s.mOpp}>
          <Emblem team={t} size={22} />
          <span className={s.mOppTxt}>
            <b>{t.short}</b>
            <small>{r.post ? <>{SERIES_SHORT[r.post.series]} <span className="num">{r.post.no}</span>차전 · {home ? '홈' : '원정'}</> : home ? '홈' : '원정'}{r.innings > 9 ? <> · <span className="num">{r.innings}</span>회</> : null}{r.walkoff ? (home ? ' · 끝내기' : ' · 끝내기 패') : null}</small>
          </span>
        </span>
        <span className={s.mRes}>
          <em className={s.resTag}>{RES_KO[res]}</em>
          <b className="num">{my}<i>:</i>{their}</b>
        </span>
        <span className={s.mDec}>{decs.length ? decs.join(' · ') : ' '}</span>
      </Link>
    </li>
  );
}

function AllList({ rows, limit, onMore }: { rows: Row[]; limit: number; onMore: () => void }) {
  // 날짜별 묶음 (최근부터)
  const groups = useMemo(() => {
    const out: { date: string; post?: Row['post']; rows: Row[] }[] = [];
    for (const r of rows) {
      const last = out[out.length - 1];
      if (last && last.date === r.date) last.rows.push(r);
      else out.push({ date: r.date, post: r.post, rows: [r] });
    }
    // 하루 안에서는 우리 경기 먼저
    out.forEach((g) => g.rows.sort((a, b) => Number(b.mine) - Number(a.mine)));
    return out;
  }, [rows]);
  return (
    <>
      <div className={s.days}>
        {groups.slice(0, limit).map((g) => (
          <section key={g.date} className={s.day} aria-label={longDate(g.date)}>
            <p className={s.dayH}>
              <b>{longDate(g.date)}</b>
              {g.post && <small>{SERIES_KO[g.post.series]}</small>}
            </p>
            <ul>
              {g.rows.map((r) => <AllRow key={r.key} r={r} />)}
            </ul>
          </section>
        ))}
      </div>
      {groups.length > limit && <button type="button" className={s.more} onClick={onMore}>더 보기 <span className="num">{groups.length - limit}</span>일</button>}
    </>
  );
}

function AllRow({ r }: { r: Row }) {
  const a = teamById(r.away), h = teamById(r.home);
  const win = r.score[0] > r.score[1] ? 0 : r.score[1] > r.score[0] ? 1 : -1;
  const body = (
    <>
      <span className={[s.aTeam, win === 0 && s.won].filter(Boolean).join(' ')}><b>{a.short}</b><Emblem team={a} size={18} /></span>
      {r.cancelled ? (
        <span className={s.aScore}><em className={s.cancel}>취소</em></span>
      ) : (
        <span className={s.aScore}>
          <b className={['num', win === 0 && s.wonN].filter(Boolean).join(' ')}>{r.score[0]}</b>
          <i>:</i>
          <b className={['num', win === 1 && s.wonN].filter(Boolean).join(' ')}>{r.score[1]}</b>
        </span>
      )}
      <span className={[s.hTeam, win === 1 && s.won].filter(Boolean).join(' ')}><Emblem team={h} size={18} /><b>{h.short}</b></span>
      <span className={s.aNote}>{r.cancelled ? '비' : r.post ? <><span className="num">{r.post.no}</span>차전</> : r.innings > 9 ? <><span className="num">{r.innings}</span>회</> : r.walkoff ? '끝내기' : ''}</span>
    </>
  );
  return (
    <li className={r.mine ? s.aMine : undefined}>
      {r.cancelled ? <div className={s.arow}>{body}</div> : <Link to={gameHref(r)} className={s.arow} aria-label={`${a.short} ${r.score[0]} 대 ${h.short} ${r.score[1]} 박스스코어`}>{body}</Link>}
    </li>
  );
}

/* ───────── 박스스코어 ───────── */
function BoxPage({ gameKey, seed }: { gameKey: string; seed: string | null }) {
  const st = useSeason();
  useBoxVersion();
  const k = parseBoxKey(gameKey);
  const cur = !seed || seed === st.seed;
  const saved = getBox(gameKey, cur ? st.seed : seed!);
  const mineGame = !!k && cur && (k.away === ME.teamId || k.home === ME.teamId);
  const [rs, setRs] = useState<Resim | null>(null);
  useEffect(() => {
    if (saved || !k || !cur || mineGame) return;
    let alive = true;
    resimGame(gameKey).then((r) => { if (alive) setRs(r); }).catch((e) => { console.warn('[경기 기록] 다시 계산 못 함', e); if (alive) setRs({ kind: 'none', why: '다시 계산하지 못했어요.' }); });
    return () => { alive = false; };
  }, [gameKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const back = (
    <Link to={`/games${seed && !cur ? `?s=${seed}` : ''}`} className={s.back}><Icon name="back" size={16} /> 경기 목록</Link>
  );
  if (!k) return <div className={s.screen}>{back}<p className={s.empty}>경기를 찾지 못했어요.</p></div>;

  // 1) 저장된 박스 (우리 경기)
  if (saved) return <div className={s.screen}>{back}<BoxScore view={saved} board={boardOfView(saved, st, cur)} /></div>;

  // 2) 박스 저장 전 우리 경기 — 점수판만
  if (mineGame) {
    const fb = fallbackMine(st, gameKey);
    return (
      <div className={s.screen}>
        {back}
        {fb ? <BoxScore board={fb} note="이 경기는 박스스코어를 저장하기 전에 치러서 점수판만 있어요." /> : <p className={s.empty}>아직 치르지 않은 경기예요.</p>}
      </div>
    );
  }
  // 3) 지난 시즌 — 저장된 것만
  if (!cur) return <div className={s.screen}>{back}<p className={s.empty}>저장된 박스스코어가 없어요.</p></div>;

  // 4) 다른 구단끼리 — 다시 계산
  if (!rs) {
    const fb = fallbackOther(st, gameKey);
    return <div className={s.screen}>{back}{fb && <BoxScore board={fb} loading />}</div>;
  }
  if (rs.kind === 'box') return <div className={s.screen}>{back}<BoxScore view={rs.view} board={boardOfView(rs.view, st, true)} /></div>;
  const fb = fallbackOther(st, gameKey);
  return (
    <div className={s.screen}>
      {back}
      {fb ? <BoxScore board={fb} note={rs.kind === 'mismatch' ? '다시 계산한 경기가 기록과 달라 점수만 보여 드려요.' : rs.why} /> : <p className={s.empty}>{rs.kind === 'none' ? rs.why : '경기를 찾지 못했어요.'}</p>}
    </div>
  );
}

/** 우리 정규 시즌 몇 번째 경기 */
function myGameNo(st: SeasonState, key: string) {
  const i = st.my.findIndex((m) => boxKeyOfMyGame(m, st.club) === key);
  return i >= 0 ? i + 1 : 0;
}
function boardOfView(v: BoxView, st: SeasonState, cur: boolean): BoardData {
  const dec: BoardData['dec'] = {};
  for (const side of v.pit) for (const p of side) {
    if (p.dec === 'W') dec.w = { id: p.id, name: p.name };
    else if (p.dec === 'L') dec.l = { id: p.id, name: p.name };
    else if (p.dec === 'S') dec.s = { id: p.id, name: p.name };
  }
  return {
    date: v.date, away: v.away, home: v.home, score: v.score, innings: v.innings, walkoff: v.walkoff,
    line: v.line, hits: v.hits, errors: v.errors, dec, post: v.post, gameNo: cur ? myGameNo(st, v.key) : 0,
  };
}
function fallbackMine(st: SeasonState, key: string): BoardData | null {
  const m = st.my.find((x) => boxKeyOfMyGame(x, st.club) === key);
  if (m) {
    const away = m.home ? m.opp : ME.teamId, home = m.home ? ME.teamId : m.opp;
    const score: [number, number] = m.home ? [m.their, m.my] : [m.my, m.their];
    const dec: BoardData['dec'] = {};
    if (m.dec?.w) dec.w = { id: m.dec.w, name: nameOf(m.dec.w) };
    if (m.dec?.l) dec.l = { id: m.dec.l, name: nameOf(m.dec.l) };
    if (m.dec?.s) dec.s = { id: m.dec.s, name: nameOf(m.dec.s) };
    return { date: m.date, away, home, score, innings: m.inn, walkoff: !!m.wo, line: m.line, hits: m.hits, errors: m.errors, dec, gameNo: myGameNo(st, key) };
  }
  return fallbackOther(st, key);
}
function fallbackOther(st: SeasonState, key: string): BoardData | null {
  const k = parseBoxKey(key);
  if (!k) return null;
  if (k.post) {
    const at = postGames(st.post).find((x) => x.n === k.n && x.rec.away === k.away && x.rec.home === k.home);
    return at ? { date: at.rec.date, away: k.away, home: k.home, score: at.rec.s, innings: at.rec.inn, walkoff: false, dec: {}, post: { series: at.series, no: at.rec.no } } : null;
  }
  const d = allDays(st)[k.n];
  const r = k.n < st.next ? st.results[k.n]?.find((x) => x.a === k.away && x.h === k.home) : undefined;
  return d && r && !r.c ? { date: d.date, away: k.away, home: k.home, score: r.s, innings: r.inn ?? 9, walkoff: !!r.wo, dec: {} } : null;
}

