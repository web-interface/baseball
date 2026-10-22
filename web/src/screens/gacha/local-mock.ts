// 뽑기 화면만 쓰는 목업 — game/mock 값을 이어 붙인다 (서버가 붙으면 응답으로 바뀜).
// 연도팩 = 1982~2027 한 해 단위(그 해 리그에 있던 구단 카드만), 구단팩 = 현재 10 + 옛 10(그 구단이 있던 해 카드만).
// 우승 연도·그 해 성적은 game/clubSeasons(실제 지역 구단 기록을 가상 구단 코드로 옮긴 값), 선수는 game/history(그 해 선수단).

import { ALL_TEAMS, PLAYERS, teamById, teamByCode } from '../../game/mock';
import { ALL_CLUBS, CURRENT_SEASON, FIRST_SEASON, clubsIn, eraOfCode, isOldCode, shortLabel } from '../../game/world';
import { championOf, clubSeason, clubTitles, leagueYear, runnerUpOf, seasonLine, traitTag } from '../../game/clubSeasons';
import { seasonRoster } from '../../game/history';
import type { ClubCode, Player } from '../../game/types';

/* ───────── 우승 시즌 (구단별 우승 연도 — 레전드 카드가 나오는 해) ───────── */
export interface LegendSeason { year: number; club: ClubCode; era: string; desc: string }

/** 그 해 그 구단 기록 한 줄 — '1위 · 74승 5무 47패 · 우승 · 핵타선' */
function recordLine(code: ClubCode, year: number) {
  const line = seasonLine(code, year);
  if (!line) return '우승';
  const tag = traitTag(clubSeason(code, year));
  return tag ? `${line} · ${tag}` : line;
}

export const LEGEND_SEASONS: LegendSeason[] = ALL_CLUBS.flatMap((c) =>
  clubTitles(c.code).map((y) => {
    const era = (c.goldenEras as readonly { label: string; legendSeason: number }[]).find((e) => e.legendSeason === y);
    return { year: y, club: c.code as ClubCode, era: era?.label ?? `${y} 우승`, desc: recordLine(c.code, y) };
  }),
).sort((a, b) => b.year - a.year);

export interface YearOption {
  year: number;
  /** 짧은 표기 ’27 */
  tag: string;
  /** 고를 때 아래 한 줄 */
  note: string;
  legends: LegendSeason[];
  /** 그 해 리그에 있던 구단 */
  clubs: ClubCode[];
  /** 그 해 우승 구단 */
  champ?: ClubCode;
  /** 그 해 준우승 구단 (기록에 있을 때) */
  runnerUp?: ClubCode;
  /** 그 해 가을야구가 아직 진행 중 (우승 표시 없음) */
  live?: boolean;
}

const yy = (y: number) => `’${String(y).slice(-2)}`;
const RECENT: Record<number, string> = { [CURRENT_SEASON]: '이번 시즌 · 시상 전', [CURRENT_SEASON - 1]: '지난 시즌', [CURRENT_SEASON - 2]: '2년 전 시즌' };

/** 연도팩 선택지 — 1982~2027 한 해 단위 (최근 순) */
export const YEAR_OPTIONS: YearOption[] = (() => {
  const out: YearOption[] = [];
  for (let y = CURRENT_SEASON; y >= FIRST_SEASON; y--) {
    const lg = leagueYear(y);
    // 그 해 정규시즌 순위대로 (기록이 없으면 원래 순서)
    const clubs = clubsIn(y).map((c, i) => ({ c, k: (clubSeason(c, y)?.rank ?? 50) * 100 + i })).sort((a, b) => a.k - b.k).map((x) => x.c);
    const live = !!lg?.note && /진행 ?중/.test(lg.note);
    const base = lg?.note?.replace(/\s*·\s*포스트시즌 진행 중.*$/, '') ?? `${clubs.length}개 구단`;
    const note = RECENT[y] ? `${RECENT[y]} · ${base}` : base;
    out.push({ year: y, tag: yy(y), note: live ? `${note} · 가을야구 진행 중` : note, legends: LEGEND_SEASONS.filter((l) => l.year === y), clubs, champ: championOf(y), runnerUp: runnerUpOf(y), live });
  }
  return out;
})();
export const yearOption = (y: number) => YEAR_OPTIONS.find((o) => o.year === y);

/** 그 구단 우승 연도 (최근 순) */
export const clubTitleYears = (code: ClubCode) => clubTitles(code).slice().reverse();
/** 그 구단이 있던 해 [첫 해, 끝 해] */
export const clubEra = (code: ClubCode) => eraOfCode(code);
/** '1982~1998' · '1999~' (지금 구단) */
export const eraText = (code: ClubCode) => { const [a, b] = eraOfCode(code); return b >= CURRENT_SEASON ? `${a}~` : `${a}~${b}`; };

/* ───────── 구단 전력 (카드 풀 크기 · 최상위 등급 유무) ───────── */
export const CLUB_TIER = Object.fromEntries(ALL_TEAMS.map((t) => [t.code, t.tier])) as Record<ClubCode, '강' | '중' | '약'>;

/** 구단의 황금기 (레전드 카드 사연) — 그 선수가 뛴 해 가운데 우승 시즌을 고른다 */
export function eraOf(p: Player): LegendSeason | undefined {
  const t = teamById(p.teamId);
  const list = LEGEND_SEASONS.filter((l) => l.club === t.code).sort((a, b) => a.year - b.year);
  const from = p.career?.[0] ?? p.draftYear;
  const to = p.career?.[1] ?? CURRENT_SEASON;
  return list.find((l) => l.year >= from && l.year <= to) ?? list.find((l) => l.year >= from) ?? list[list.length - 1];
}

/* ───────── 선수 풀 ───────── */
/** 그 구단 '전설' 풀 — 연도가 붙지 않는 등급(레전드·프랜차이즈·블랙·시그니처)이 나오는 선수: 우승·황금기 시즌의 주축 + 지금 스타 */
const legendCache = new Map<ClubCode, Player[]>();
export function clubLegendPool(code: ClubCode): Player[] {
  const hit = legendCache.get(code);
  if (hit) return hit;
  const club = ALL_CLUBS.find((c) => c.code === code)!;
  const eraYears = (club.goldenEras as readonly { legendSeason: number }[]).map((e) => e.legendSeason);
  const ys = [...new Set([...clubTitles(code), ...eraYears])].filter((y) => y < CURRENT_SEASON).slice(-8);
  const [from, to] = eraOfCode(code);
  if (!ys.length) ys.push(Math.min(to, CURRENT_SEASON - 1), Math.max(from, Math.min(to, CURRENT_SEASON - 1) - 3));
  const seen = new Set<string>();
  const out: Player[] = [];
  for (const y of ys) {
    for (const p of seasonRoster(code, y)) {
      if (p.ovr < 78 || seen.has(p.name)) continue;
      seen.add(p.name);
      out.push(p);
    }
  }
  if (!isOldCode(code)) {
    const team = teamByCode(code);
    for (const p of PLAYERS) if (p.teamId === team.id && /^p\d+$/.test(p.id) && p.id !== 'p41' && !seen.has(p.name)) out.push(p);
  }
  legendCache.set(code, out.length ? out : seasonRoster(code, ys[0]));
  return legendCache.get(code)!;
}

/** 가상 선수인가 (선수 정보 화면이 없는 선수) */
export const isSynthetic = (p: Player) => p.id.startsWith('x-');

/** 구단 이름 (좁은 곳) — 옛 구단 중 별명이 같은 곳은 '동대문 곰스'처럼 */
export const clubShort = (code: ClubCode) => shortLabel(code);

/* ───────── 팩 겉모양 — 팩마다 포일·인쇄가 다르다 ───────── */
export type PackSkin = 'graphite' | 'gold' | 'crimson' | 'sepia' | 'year' | 'club';

export const PACK_LOOK: Record<string, { skin: PackSkin; en: string; tag: string; blurb: string }> = {
  basic: { skin: 'graphite', en: 'PLAYER PACK', tag: '노멀~레전드', blurb: '도감 채우기 · 노멀 위주' },
  premium: { skin: 'gold', en: 'PREMIUM', tag: '스페셜 이상', blurb: '특별 등급(MVP·GG·TH)도 나와요' },
  special: { skin: 'crimson', en: 'SPECIAL', tag: '레어 이상', blurb: 'MVP·GG·TH 확률이 높아요' },
  legend: { skin: 'sepia', en: 'LEGEND', tag: '엘리트 이상', blurb: '이번 주 한정 · 골든볼' },
  year: { skin: 'year', en: 'SEASON', tag: '고른 시즌만', blurb: '그 해 모든 구단 · 프리미엄 확률' },
  club: { skin: 'club', en: 'CLUB', tag: '고른 구단만', blurb: '그 구단이 있던 모든 연도' },
};

/** 신문 제호 — 가상 리그(한별 리그)의 가상 스포츠 신문 */
export const PAPER = { name: '한별스포츠', en: 'HANBYUL SPORTS' };
