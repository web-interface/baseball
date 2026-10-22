// 홈 데이터 — 순위·전적·선수 기록·지난 경기·소식은 모두 저장된 시즌 진행(season/store)에서 (개막일엔 0승 0무 0패).
// 다음 경기 미리보기 · 바로가기 숫자처럼 시즌 기록이 아닌 것만 game/mock 값을 이어 붙여 쓴다(서버가 붙으면 같은 모양으로 채움).
import { ME, NEXT_GAME, PACKS, SCOUT_SHOP, TEAMS, cardById, playerById, teamById } from '../../game/mock';
import { LEAGUE } from '../../game/world';
import { evaluate, initialLineup, store as lineupStore } from '../lineup/calc';
import type { LineScore, MatchRecord, Player, Team, Weather } from '../../game/types';
import {
  allDays, eraLabel, getSeason, isOver, myGameOf, notStarted, pitLine, seasonToday, teamLine,
  type MyGameRec, type NewsRec, type SeasonState, type TeamLine,
} from '../../season/store';
import { nextMyGame } from '../../season/run';
import { clubRoster, myRoster, LEVEL_OVR, aiLevel } from '../../season/rosters';
import { weatherOf } from '../../season/weather';
import { SEASON_GAMES, daysBetween, longDate, shortDate, startTime } from '../../season/schedule';

/** 순위 · 전적 — 헤더 · 시즌 화면과 같은 값 (season/store 의 teamLine) */
export type ClubLine = TeamLine;
export const clubLine = (teamId: string, s: SeasonState = getSeason()): ClubLine => teamLine(teamId, s);

/* ── 다음 경기 — 시즌 진행의 다음 내 경기 (비로 취소되는 날은 건너뜀) ── */
export function nextGameView() {
  const s = getSeason();
  const nx = nextMyGame();
  const h2hOf = (oppId: string) => {
    const list = s.my.filter((g) => g.opp === oppId);
    return { w: list.filter((g) => g.res === 'W').length, d: list.filter((g) => g.res === 'D').length, l: list.filter((g) => g.res === 'L').length };
  };
  if (nx) {
    const me = teamById(ME.teamId);
    const isHome = nx.home === me.id;
    const opp = teamById(isHome ? nx.away : nx.home);
    const home = isHome ? me : opp;
    const time = startTime(nx.day.date);
    const w = weatherOf(nx.day.date, nx.home, s.seed);
    const night = Number(time.slice(0, 2)) >= 18;
    const weather: Weather = {
      city: home.region, sky: night ? 'night-clear' : 'clear', skyKo: w.dome ? '돔' : '맑음', tempC: w.tC, humidity: 60,
      windMps: w.windMs, windTo: w.windMs < 1 ? 'calm' : 'out-cf', windKo: w.windMs < 1 ? '바람 없음' : '가운데 담장 쪽으로', rainPct: 10, dust: '보통',
      effects: [w.dome ? '돔 — 바람 영향 없음' : w.windMs >= 3 ? `가운데 비거리 +${Math.round(w.windMs)}m` : '바람 영향 거의 없음'],
    };
    // 예상 선발 — 날마다 다섯 명이 돌아가며 (엔진과 같은 규칙)
    const ti = (id: string) => TEAMS.findIndex((t) => t.id === id);
    const mineR = myRoster();
    const oppR = clubRoster(opp.id);
    const pickSp = (rot: Player[], id: string) => (rot.length ? rot[((nx.day.day + ti(id)) % rot.length + rot.length) % rot.length] : undefined);
    const myOvr = mineR.ovr, oppOvr = LEVEL_OVR[aiLevel()] + (opp.tier === '강' ? 2 : opp.tier === '약' ? -2 : 0);
    const wp = 1 / (1 + Math.exp(-((myOvr - oppOvr) / 7 + (isHome ? 0.08 : -0.08))));
    return {
      me, opp, venue: home.stadium, isHome, time, weather, wp,
      mine: pickSp(mineR.rotation, me.id), theirs: pickSp(oppR.rotation, opp.id), oppLine: clubLine(opp.id, s),
      h2h: h2hOf(opp.id),
      date: nx.day.date, rainedBefore: nx.rainedBefore, over: false,
      /** 개막전인가 (리그 첫날 · 내 첫 경기) */
      opener: notStarted(s) && nx.idx === 0,
    };
  }
  // 정규 시즌 끝 — 목업 다음 경기 자리(상대 · 구장)만 빌려 그린다
  const me = teamById(ME.teamId);
  const opp = teamById(NEXT_GAME.opponentId);
  const home = NEXT_GAME.home ? me : opp;
  const myCard = cardById(NEXT_GAME.probable.mine);
  const mine = myCard ? playerById(myCard.playerId)! : undefined;
  const theirs = playerById(NEXT_GAME.probable.theirs);
  return {
    me, opp, venue: home.stadium, isHome: NEXT_GAME.home,
    time: NEXT_GAME.time, weather: NEXT_GAME.weather, wp: NEXT_GAME.wpPreview,
    mine, theirs, oppLine: clubLine(opp.id, s),
    h2h: h2hOf(opp.id),
    date: '', rainedBefore: 0, over: isOver(s), opener: false,
  };
}

/** 투수 시즌 한 줄 — 개막부터 친 경기 ('2승 1패 · 3.18', 아직 안 던졌으면 first) */
export function pitchLine(p?: Player) {
  if (!p) return null;
  const l = pitLine(p.id);
  return { w: l.w, l: l.l, era: eraLabel(l), first: l.outs === 0 };
}

/* ── 지난 경기 — 내 구단의 가장 최근 경기 (점수판은 저장된 기록, 승리 확률 흐름 · 명장면은 같은 경기를 다시 계산해서) ── */
export const lastMyRec = (s: SeasonState = getSeason()): MyGameRec | undefined => s.my[s.my.length - 1];

/** 저장된 기록만으로 그리는 점수판 (다시 계산 전 · 실패 때) */
export function recordOf(rec: MyGameRec): MatchRecord {
  const away = rec.home ? rec.opp : ME.teamId;
  const home = rec.home ? ME.teamId : rec.opp;
  const final: [number, number] = rec.home ? [rec.their, rec.my] : [rec.my, rec.their];
  const n = Math.max(9, rec.line?.[0].length ?? 0, rec.line?.[1].length ?? 0);
  // 엔진 이닝 점수는 친 회만 있다 — 홈이 앞서 9회말을 안 했으면 그 칸은 null(점수판에 x)
  const side = (k: 0 | 1): LineScore => ({
    innings: Array.from({ length: n }, (_, i) => rec.line?.[k][i] ?? null),
    r: final[k], h: rec.hits?.[k] ?? 0, e: rec.errors?.[k] ?? 0, b: 0,
  });
  return {
    id: `rec-${rec.idx}`, date: rec.date, time: startTime(rec.date), stadium: teamById(home).stadium.name, awayId: away, homeId: home,
    weather: NEXT_GAME.weather, line: { away: side(0), home: side(1) }, final, walkoff: !!rec.wo,
    decision: { win: rec.dec?.w ?? '', loss: rec.dec?.l ?? '', save: rec.dec?.s },
    starters: { away: '', home: '' }, plays: [], keyFactors: [], attendance: 0, duration: '',
  };
}

/** 승리 확률 흐름 — 플레이마다 [순번, 홈 승리 확률] (첫 점은 경기 전 50%) */
export function wpSeries(plays: MatchRecord['plays']) {
  const pts: { i: number; wp: number; play?: MatchRecord['plays'][number] }[] = [{ i: 0, wp: 0.5 }];
  plays.forEach((p, k) => pts.push({ i: k + 1, wp: p.wp[1], play: p }));
  return pts;
}

/* ── 구단 소식 — 시즌 진행에서 (다음 시리즈 · 라이벌 · 연승/연패 · 기록 · 부상 · 비 취소 · 선수 기록) ── */
export type FeedKind = '라이벌' | '형광 케미' | '부상' | '슬럼프' | '불방망이' | '기록' | '날씨' | '구단' | '연승' | '연패' | '순위' | '경기' | '시즌';
export interface FeedItem {
  id: string;
  kind: FeedKind;
  text: string;
  detail?: string;
  when: string;
  players?: string[];
  to?: string;
}

const NEWS_KIND: Record<NewsRec['kind'], FeedKind> = {
  연승: '연승', 연패: '연패', 기록: '기록', 부상: '부상', 취소: '날씨', 끝내기: '경기', 역전: '경기', 노히트: '기록', '내 경기': '경기', 순위: '순위', 시즌: '시즌',
};

export function feedItems(s: SeasonState = getSeason()): FeedItem[] {
  const me = teamById(ME.teamId);
  const today = seasonToday(s);
  const when = (date: string) => {
    const d = daysBetween(today, date);
    return d === 0 ? '오늘' : d > 0 ? `${d}일 뒤` : d === -1 ? '어제' : shortDate(date);
  };
  const out: FeedItem[] = [];
  // 개막 안내
  if (notStarted(s)) {
    out.push({ id: 'open', kind: '시즌', text: `${LEAGUE.name} 2027 개막`, detail: `${longDate(allDays(s)[0].date)} — 10개 구단 모두 0승 0무 0패에서, 구단마다 ${SEASON_GAMES}경기`, when: '오늘' });
  }
  // 다음 시리즈 (라이벌이면 더비 예고)
  const nx = nextMyGame();
  if (nx) {
    const oppId = nx.home === me.id ? nx.away : nx.home;
    const opp = teamById(oppId);
    const days = allDays(s);
    let n = 0;
    for (let i = nx.idx; i < days.length; i++) {
      const g = myGameOf(days[i]);
      if (g && (g[0] === oppId || g[1] === oppId)) n++; else break;
    }
    const rival = me.rival.toLowerCase() === oppId;
    const where = `${nx.home === me.id ? '홈' : '원정'} · ${teamById(nx.home).stadium.name}`;
    out.push({
      id: 'series', kind: rival ? '라이벌' : '구단',
      text: rival ? `${me.rivalry} — ${opp.short} ${n}연전` : `${notStarted(s) ? '개막 ' : ''}${opp.short}와 ${n}연전`,
      detail: `${longDate(nx.day.date)}부터 · ${where}`, when: when(nx.day.date),
    });
    if (nx.rainedBefore > 0) out.push({ id: 'rain-next', kind: '날씨', text: `비 예보 — 내 경기 ${nx.rainedBefore}개 취소`, detail: '취소된 경기는 정규 시즌 끝에 다시 열려요', when: '오늘' });
  }
  // 시즌 소식 — 내 구단 것 먼저, 최근 순
  const news = s.news.slice().reverse();
  const mineNews = news.filter((n) => n.mine || n.team === me.id);
  const big = news.filter((n) => !mineNews.includes(n) && (n.kind === '노히트' || n.kind === '순위' || n.kind === '시즌'));
  [...mineNews.slice(0, 5), ...big.slice(0, 2)].sort((a, b) => b.idx - a.idx).forEach((n, i) => {
    out.push({ id: `n${n.idx}-${i}`, kind: NEWS_KIND[n.kind], text: n.text, when: when(n.date) });
  });
  // 선수 기록 — 내 구단 타자 · 투수 (3경기 넘게 친 뒤)
  if (s.my.length >= 3) {
    const bats = Object.entries(s.bat).filter(([, b]) => b.team === me.id);
    const pits = Object.entries(s.pit).filter(([, p]) => p.team === me.id);
    const hr = bats.slice().sort((a, b) => b[1].HR - a[1].HR || b[1].RBI - a[1].RBI)[0];
    if (hr && hr[1].HR > 0) {
      const p = playerById(hr[0]);
      out.push({ id: 'hr', kind: '불방망이', text: `${p?.name ?? '선수'}, 시즌 홈런 ${hr[1].HR}개`, detail: `타율 ${(hr[1].H / Math.max(1, hr[1].AB)).toFixed(3).replace(/^0/, '')} · ${hr[1].RBI}타점 · ${hr[1].G}경기`, when: '시즌', players: [hr[0]], to: `/player/${hr[0]}` });
    }
    const regulars = bats.filter(([, b]) => b.AB >= s.my.length * 2.5);
    const cold = regulars.slice().sort((a, b) => a[1].H / Math.max(1, a[1].AB) - b[1].H / Math.max(1, b[1].AB))[0];
    if (cold && cold[1].H / Math.max(1, cold[1].AB) < 0.22) {
      const p = playerById(cold[0]);
      out.push({ id: 'cold', kind: '슬럼프', text: `${p?.name ?? '선수'}, 타율 ${(cold[1].H / Math.max(1, cold[1].AB)).toFixed(3).replace(/^0/, '')}`, detail: `${cold[1].AB}타수 ${cold[1].H}안타 — 타순을 바꿔 보거나 하루 쉬게 해 보세요`, when: '시즌', players: [cold[0]], to: '/lineup' });
    }
    const ace = pits.slice().sort((a, b) => b[1].W - a[1].W || b[1].SO - a[1].SO)[0];
    if (ace && (ace[1].W > 0 || ace[1].SO >= 10)) {
      const p = playerById(ace[0]);
      out.push({ id: 'ace', kind: '기록', text: `${p?.name ?? '선수'}, ${ace[1].W}승 · 탈삼진 ${ace[1].SO}`, detail: `평균자책 ${ace[1].outs ? ((ace[1].ER * 27) / ace[1].outs).toFixed(2) : '-'} · ${Math.floor(ace[1].outs / 3)}이닝`, when: '시즌', players: [ace[0]], to: `/player/${ace[0]}` });
    }
  }
  return out;
}

/* ── 바로가기 숫자 ── */
/** 라인업 — 팀 종합 · 다음 세트 단계까지 남은 인원 */
function lineupShortcut() {
  const ev = evaluate(lineupStore.get() ?? initialLineup());
  const near = ev.sets.filter((x) => x.next).sort((a, b) => (a.next!.at - a.have) - (b.next!.at - b.have))[0];
  return { overall: ev.overall, remain: near ? near.next!.at - near.have : 0, set: near?.name ?? '' };
}
export function shortcuts() {
  const premium = PACKS.find((p) => p.id === 'premium')!;
  return {
    lineup: lineupShortcut(),
    gacha: { pity: premium.pity.count, max: premium.pity.max },
    shop: { left: SCOUT_SHOP.dailyLimit - SCOUT_SHOP.bought, limit: SCOUT_SHOP.dailyLimit },
    pvp: { left: ME.pvpLeft, rating: ME.rating },
    cards: { have: ME.collection.have, total: ME.collection.total },
  };
}

export const leagueName = LEAGUE.name;
export type { Team };
