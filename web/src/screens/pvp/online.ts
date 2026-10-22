// 실제 유저 대전 — 서버(Worker) 연결. 화면에 들어오면 내 구단 스냅샷을 올리고, 실제 감독 목록을 받는다.
// 결과는 서버가 정한다(POST /pvp/battle). 연결이 끊기면 같은 요청 번호로 한 번 더 — 서버가 같은 결과를 돌려준다.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, newRequestId, type PvpBattleRes, type PvpClub, type PvpSnapshot, type PvpToday } from '../../api';
import { useAuth } from '../../app/auth';
import { TEAMS, teamById } from '../../game/mock';
import { loadStart } from '../club-select/local-mock';
import { mySide } from './local-mock';
import { getSlot, initialLineup, store as lineupStore, unit } from '../lineup/calc';

/** 서버 구단 코드 → 세계관 구단 (모르는 코드면 독수리스) */
export const clubTeam = (code: string) => (TEAMS.some((t) => t.id === code) ? teamById(code) : teamById('dj'));

/** 내 구단 · 라인업 스냅샷 — 지금은 목업 라인업, 구단은 구단 선택 화면에서 고른 값이 있으면 그것 */
export function mySnapshot(): PvpSnapshot {
  const side = mySide();
  let club = side.team.id;
  try { if (localStorage.getItem('bb.start')) club = loadStart().club; } catch { /* 이 기기에 저장 없음 */ }
  // 라인업 화면의 1군 엔트리 (타순 9 · 선발 · 불펜 · 마무리)
  const st = lineupStore.get() ?? initialLineup();
  const item = (id: string | null, pos: string) => {
    if (!id) return null;
    const u = unit(id);
    return { id: u.player.id, pos, ovr: u.card.ovr ?? u.player.ovr, name: u.player.name.slice(0, 16), ...(u.card.year != null ? { y: u.card.year % 100 } : {}), c: u.player.teamId };
  };
  const lineup = [
    ...st.order.map((slot) => item(st.field[slot], slot)),
    item(getSlot(st, 'R0'), 'SP'),
    ...st.bullpen.map((id) => item(id, 'RP')),
    item(st.closer, 'CP'),
  ].filter((x): x is NonNullable<typeof x> => !!x);
  return {
    club,
    teamName: clubTeam(club).name,
    power: side.power,
    ovr: side.ovr,
    lineup,
  };
}

export interface SessionGame { res: PvpBattleRes; opp: PvpClub; before: number }

export type OnlineState =
  | { kind: 'out' }
  | { kind: 'loading' }
  | { kind: 'error'; msg: string }
  | { kind: 'ready'; me: PvpClub | null; opponents: PvpClub[]; today: PvpToday };

const msgOf = (e: unknown) => (e instanceof ApiError ? e.message : '문제가 생겼어요. 잠시 뒤 다시 해 주세요');

export function usePvpOnline(demo = false) {
  const auth = useAuth();
  const status = demo ? 'in' : auth.status;
  const [st, setSt] = useState<OnlineState>(status === 'in' ? { kind: 'loading' } : { kind: 'out' });
  const [busy, setBusy] = useState<number | null>(null);
  const [games, setGames] = useState<SessionGame[]>([]);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []); // StrictMode 두 번 마운트에도 살아 있게

  const load = useCallback(async () => {
    if (status !== 'in') { setSt(status === 'checking' ? { kind: 'loading' } : { kind: 'out' }); return; }
    setSt({ kind: 'loading' });
    if (demo) { setSt({ kind: 'ready', ...demoData() }); return; }
    try {
      await api.pvpPutMe(mySnapshot());
      const r = await api.pvpOpponents();
      if (alive.current) setSt({ kind: 'ready', me: r.me, opponents: r.opponents, today: r.today });
    } catch (e) {
      if (alive.current) setSt({ kind: 'error', msg: msgOf(e) });
    }
  }, [status, demo]);
  useEffect(() => { void load(); }, [load]);

  /** 대전 시작 — 성공하면 결과, 실패하면 오류 문구 */
  const fight = useCallback(async (opp: PvpClub): Promise<{ ok: true; game: SessionGame } | { ok: false; msg: string }> => {
    if (st.kind !== 'ready' || busy != null) return { ok: false, msg: '잠시만요' };
    setBusy(opp.userId);
    const rid = newRequestId();
    const before = st.me?.rating ?? 1500;
    try {
      let res: PvpBattleRes;
      try {
        res = demo ? demoBattle(st.me!, opp) : await api.pvpBattle(opp.userId, rid);
      } catch (e) {
        if (!(e instanceof ApiError) || e.status !== 0) throw e;
        await new Promise((r) => setTimeout(r, 900)); // 연결만 끊김 — 같은 번호로 다시(두 번 처리되지 않음)
        res = await api.pvpBattle(opp.userId, rid);
      }
      const g: SessionGame = { res, opp: res.opponent ?? opp, before };
      if (alive.current) {
        setGames((x) => [g, ...x].slice(0, 30));
        setSt((cur) => cur.kind !== 'ready' ? cur : {
          ...cur,
          me: res.me ?? cur.me,
          today: res.today ?? cur.today,
          opponents: cur.opponents.map((o) => (o.userId === opp.userId && res.opponent ? { ...o, ...res.opponent, lineup: o.lineup } : o)),
        });
      }
      return { ok: true, game: g };
    } catch (e) {
      return { ok: false, msg: msgOf(e) };
    } finally {
      if (alive.current) setBusy(null);
    }
  }, [st, busy, demo]);

  return { st, busy, games, fight, reload: load };
}

/* ───────── 미리보기 전용 예시 (?demo=1) — 로그인 없이 화면 모양만 본다. 서버에 아무것도 보내지 않는다 ───────── */
function demoData(): { me: PvpClub; opponents: PvpClub[]; today: PvpToday } {
  const snap = mySnapshot();
  const mk = (userId: number, username: string, club: string, rating: number, w: number, d: number, l: number, ovr: number, power: number, agoMin: number): PvpClub => ({
    userId, username, club, teamName: clubTeam(club).name, rating, w, d, l, ovr, power, updatedAt: Math.floor(Date.now() / 1000) - agoMin * 60,
    lineup: snap.lineup.map((x, i) => ({ ...x, ovr: Math.max(60, x.ovr - ((i * 3 + userId) % 7)) })),
  });
  return {
    me: { ...mk(1, '예시_나', snap.club, 1512, 3, 0, 1, snap.ovr, snap.power, 0), teamName: snap.teamName },
    opponents: [
      mk(2, '예시_큰발응원단', 'bs', 1530, 6, 1, 3, 90, 1031, 12),
      mk(3, '예시_월미등대', 'ic', 1498, 2, 0, 2, 88, 1008, 180),
      mk(4, '예시_영산호랑이', 'gj', 1475, 0, 0, 0, 86, 990, 60 * 26),
    ],
    today: { used: 4, limit: 200 },
  };
}
function demoBattle(me: PvpClub, opp: PvpClub): PvpBattleRes {
  const away = [0, 2, 0, 1, 0, 0, 3, 0, 0], home: (number | null)[] = [1, 0, 0, 0, 2, 0, 0, 1, 0];
  const my = away.reduce((a, b) => a + b, 0), their = home.reduce<number>((a, b) => a + (b ?? 0), 0);
  const delta = 11;
  return {
    game: { id: 'demo-' + Date.now(), opponentId: opp.userId, myScore: my, oppScore: their, result: 'W', ratingDelta: delta, line: { away, home }, createdAt: Math.floor(Date.now() / 1000), replay: false },
    me: { ...me, rating: me.rating + delta, w: me.w + 1 },
    opponent: { ...opp, rating: opp.rating - delta, l: opp.l + 1 },
    today: { used: 5, limit: 200 },
  };
}
