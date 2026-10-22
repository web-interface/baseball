// 홈 전용 목업 — game/mock 값을 이어 붙여 쓴다 (서버가 붙으면 같은 모양으로 채움)
import { LAST_MATCH, LINEUP_EVAL, ME, NEXT_GAME, PACKS, SCOUT_SHOP, STANDINGS, cardById, playerById, teamById } from '../../game/mock';
import { LEAGUE } from '../../game/world';
import type { Play, Player, StandingRow, Team } from '../../game/types';

/** 정규 시즌 경기 수 (세계관: 상대마다 15경기 × 9) */
export const SEASON_GAMES = 135;

export interface ClubLine {
  rank: number;
  row: StandingRow;
  played: number;
  left: number;
  /** 다음 경기는 몇 번째 */
  nextNo: number;
}

export function clubLine(teamId: string): ClubLine {
  const i = Math.max(0, STANDINGS.findIndex((r) => r.teamId === teamId));
  const row = STANDINGS[i];
  const played = row.w + row.d + row.l;
  return { rank: i + 1, row, played, left: SEASON_GAMES - played, nextNo: played + 1 };
}

/* ── 다음 경기 ── */
export function nextGameView() {
  const me = teamById(ME.teamId);
  const opp = teamById(NEXT_GAME.opponentId);
  const home = NEXT_GAME.home ? me : opp;
  const myCard = cardById(NEXT_GAME.probable.mine);
  const mine = myCard ? playerById(myCard.playerId)! : undefined;
  const theirs = playerById(NEXT_GAME.probable.theirs);
  return {
    me, opp, venue: home.stadium, isHome: NEXT_GAME.home,
    time: NEXT_GAME.time, weather: NEXT_GAME.weather, wp: NEXT_GAME.wpPreview,
    mine, theirs, oppLine: clubLine(opp.id),
    /** 맞대결 (목업) */
    h2h: { w: 5, d: 0, l: 3 },
  };
}

/** 투수 한 줄 — '8승 3패 · 2.81' */
export function pitchLine(p?: Player) {
  const s = p?.season.pit;
  if (!s) return null;
  return { w: s.w, l: s.l, era: s.era, so: s.so, ip: s.ip };
}

/* ── 어제 경기 ── */
export const LAST = LAST_MATCH;
export const HIGHLIGHTS: Play[] = LAST_MATCH.plays.filter((p) => p.highlight);

/** 승리 확률 흐름 — 플레이마다 [순번, 홈 승리 확률] (첫 점은 경기 전 50%) */
export function wpSeries(plays: Play[]) {
  const pts: { i: number; wp: number; play?: Play }[] = [{ i: 0, wp: 0.5 }];
  plays.forEach((p, k) => pts.push({ i: k + 1, wp: p.wp[1], play: p }));
  return pts;
}

/* ── 구단 소식 (이벤트 피드) ── */
export type FeedKind = '라이벌' | '형광 케미' | '부상' | '슬럼프' | '불방망이' | '기록' | '날씨' | '구단';
export interface FeedItem {
  id: string;
  kind: FeedKind;
  text: string;
  detail?: string;
  when: string;
  players?: string[];
  to?: string;
}

export const FEED: FeedItem[] = [
  { id: 'f1', kind: '형광 케미', text: '표건우·진서율 키스톤 3단', detail: '같은 구단 키스톤 — 병살 처리 +4, 형광 선이 켜졌어요', when: '오늘', players: ['p06', 'p08'], to: '/lineup' },
  { id: 'f2', kind: '라이벌', text: '경부선 더비 예고', detail: '금요일부터 수원 마법사즈 3연전 · 이기면 보상 2배', when: '3일 뒤' },
  { id: 'f3', kind: '부상', text: '독고현, 어깨 뭉침', detail: '이틀 휴식 — 불펜 한 자리가 비어요', when: '오늘', players: ['p11'], to: '/lineup' },
  { id: 'f4', kind: '슬럼프', text: '진서율, 최근 10경기 .182', detail: '하루 쉬게 하면 컨디션이 돌아와요', when: '오늘', players: ['p08'] },
  { id: 'f5', kind: '불방망이', text: '위태건, 7경기 홈런 4개', detail: '오늘 상대 선발 윈터스에게 통산 3타수 2안타', when: '어제', players: ['p14'] },
  { id: 'f6', kind: '기록', text: '제갈현, 시즌 100탈삼진', detail: '15경기 만 — 구단 최소 경기 기록', when: '어제', players: ['p01'] },
  { id: 'f7', kind: '날씨', text: '토요일 대전 비 60%', detail: '우천 취소되면 월요일로 밀려요', when: '3일 뒤' },
  { id: 'f8', kind: '구단', text: '토요일 홈경기, 새 응원가 첫 공개', when: '3일 뒤' },
];

/* ── 바로가기 숫자 ── */
export function shortcuts() {
  const premium = PACKS.find((p) => p.id === 'premium')!;
  return {
    lineup: { overall: LINEUP_EVAL.overall, remain: LINEUP_EVAL.explosion.remain },
    gacha: { pity: premium.pity.count, max: premium.pity.max },
    shop: { left: SCOUT_SHOP.dailyLimit - SCOUT_SHOP.bought, limit: SCOUT_SHOP.dailyLimit },
    pvp: { left: ME.pvpLeft, rating: ME.rating },
    cards: { have: ME.collection.have, total: ME.collection.total },
  };
}

export const leagueName = LEAGUE.name;
export type { Team };
