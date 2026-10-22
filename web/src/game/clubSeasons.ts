// 구단 연도 기록 — 연도팩 연도 목록 · '우승' 표시 · 세트덱 '그 해 성격'이 같이 쓰는 한 곳.
// game/data/club-seasons.json 이 있으면 그것(실제 지역 구단의 그 해 성적을 가상 구단 코드로 옮긴 값)을 쓰고,
// 아직 없으면 세계관(world.ts)의 우승 연도·황금기로 대신한다. 화면·저장소에는 가상 구단 이름만 쓴다.
import { CLUBS } from './world';
import type { ClubCode } from './types';

/** 팀 기록 순위 키 — 1 = 리그 1위 */
export type RankKey = 'avg' | 'hr' | 'obp' | 'slg' | 'sb' | 'runs' | 'era' | 'so' | 'whip' | 'sv' | 'bullpen' | 'def';

export interface SeasonRec {
  year: number;
  rank?: number;
  w?: number; d?: number; l?: number;
  /** 포스트시즌 결과 — '우승' · '준우승' · '플레이오프' … */
  post?: string;
  tags: string[];
  ranks: Partial<Record<RankKey, number>>;
  /** 그 해 리그 구단 수 (순위를 0~1 로 바꿀 때) */
  teams: number;
}

export interface LeagueYear { year: number; tags: string[]; note?: string }

interface ClubData { code: ClubCode; titles: number[]; years: number[]; seasons: Map<number, SeasonRec> }

const LAST_YEAR = 2027;

/* ───────── JSON 읽기 (있으면) ───────── */
// import.meta.glob 은 파일이 없으면 빈 묶음이라 빌드가 깨지지 않는다.
const found = import.meta.glob('./data/club-seasons.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const RAW = Object.values(found)[0] as Record<string, unknown> | undefined;

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strs = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === 'string');
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** 여러 이름으로 들어올 수 있는 팀 기록 순위 키를 맞춘다 */
const RANK_ALIASES: Record<RankKey, string[]> = {
  avg: ['avg', 'ba', 'battingAvg', 'teamAvg', 'avgRank'],
  hr: ['hr', 'homeRuns', 'hrRank'],
  obp: ['obp', 'obpRank'],
  slg: ['slg', 'slgRank', 'ops', 'opsRank'],
  sb: ['sb', 'steals', 'sbRank'],
  runs: ['runs', 'r', 'runsRank', 'rs'],
  era: ['era', 'eraRank'],
  so: ['so', 'k', 'strikeouts', 'soRank', 'kRank'],
  whip: ['whip', 'whipRank'],
  sv: ['sv', 'saves', 'svRank'],
  bullpen: ['bullpen', 'bullpenEra', 'reliefEra', 'bullpenRank'],
  def: ['def', 'fielding', 'fpct', 'errors', 'defRank', 'fieldingRank'],
};

function readRanks(rec: Record<string, unknown>): Partial<Record<RankKey, number>> {
  const out: Partial<Record<RankKey, number>> = {};
  const pools = [obj(rec.ranks), obj(rec.rank_of), obj(obj(rec.batting).ranks), obj(obj(rec.pitching).ranks), obj(rec.statRanks)];
  for (const k of Object.keys(RANK_ALIASES) as RankKey[]) {
    for (const pool of pools) {
      for (const a of RANK_ALIASES[k]) {
        const v = num(pool[a]);
        if (v != null && v >= 1) { out[k] = v; break; }
      }
      if (out[k] != null) break;
    }
  }
  return out;
}

function parseJson(raw: Record<string, unknown>): { clubs: Map<ClubCode, ClubData>; league: Map<number, LeagueYear> } {
  const clubs = new Map<ClubCode, ClubData>();
  const league = new Map<number, LeagueYear>();
  const clubsRaw = obj(raw.clubs);
  const teamsByYear = new Map<number, number>();
  for (const [codeRaw, cv] of Object.entries(clubsRaw)) {
    const code = codeRaw.toUpperCase() as ClubCode;
    if (!CLUBS.some((c) => c.code === code)) continue;
    const c = obj(cv);
    const seasons = new Map<number, SeasonRec>();
    const list: Record<string, unknown>[] = Array.isArray(c.seasons)
      ? (c.seasons as unknown[]).map(obj)
      : Object.entries(obj(c.seasons ?? c.years)).map(([y, v]) => ({ year: y, ...obj(v) }));
    for (const s of list) {
      const year = num(s.year);
      if (!year) continue;
      const tags = strs(s.tags);
      const post = typeof s.post === 'string' ? s.post : typeof s.postseason === 'string' ? s.postseason : typeof s.result === 'string' ? s.result : undefined;
      seasons.set(year, { year, rank: num(s.rank), w: num(s.w ?? s.wins), d: num(s.d ?? s.draws ?? s.ties), l: num(s.l ?? s.losses), post, tags, ranks: readRanks(s), teams: num(s.teams) ?? 0 });
      teamsByYear.set(year, (teamsByYear.get(year) ?? 0) + 1);
    }
    const titles = strs(c.titles).length ? strs(c.titles).map(Number) : arr(c.titles).map(num).filter((x): x is number => x != null);
    for (const [y, s] of seasons) if (s.post && /우승/.test(s.post) && !/준우승/.test(s.post) && !titles.includes(y)) titles.push(y);
    const years = [...seasons.keys()].sort((a, b) => a - b);
    clubs.set(code, { code, titles: titles.sort((a, b) => a - b), years, seasons });
  }
  // 순위 정규화용 구단 수 — 기록에 없으면 그 해 데이터가 있는 구단 수
  for (const d of clubs.values()) for (const s of d.seasons.values()) if (!s.teams) s.teams = teamsByYear.get(s.year) ?? 10;
  const lg = raw.league ?? raw.leagueYears ?? raw.seasons;
  const lgList: Record<string, unknown>[] = Array.isArray(lg) ? lg.map(obj) : Object.entries(obj(lg)).map(([y, v]) => ({ year: y, ...obj(v) }));
  for (const l of lgList) {
    const year = num(l.year);
    if (!year) continue;
    const tags = [...strs(l.tags), ...strs(l.features)];
    const note = typeof l.note === 'string' ? l.note : typeof l.desc === 'string' ? l.desc : undefined;
    league.set(year, { year, tags, note });
  }
  return { clubs, league };
}

/* ───────── 세계관 대신 값 (JSON 이 없을 때) ───────── */
function fallback(): { clubs: Map<ClubCode, ClubData>; league: Map<number, LeagueYear> } {
  const clubs = new Map<ClubCode, ClubData>();
  for (const c of CLUBS) {
    const code = c.code as ClubCode;
    const founded = (c as { founded?: number }).founded ?? 1985;
    const titles = [...((c as unknown as { titles?: readonly number[] }).titles ?? [])].sort((a, b) => a - b);
    const seasons = new Map<number, SeasonRec>();
    for (let y = founded; y <= LAST_YEAR; y++) {
      const era = c.goldenEras.find((e) => e.legendSeason === y);
      const tags: string[] = [];
      if (titles.includes(y)) tags.push('우승');
      if (era) tags.push(era.label);
      seasons.set(y, { year: y, post: titles.includes(y) ? '우승' : undefined, tags, ranks: {}, teams: 10 });
    }
    clubs.set(code, { code, titles, years: [...seasons.keys()], seasons });
  }
  return { clubs, league: new Map() };
}

const DATA = (() => {
  if (RAW) {
    try {
      const d = parseJson(RAW);
      if (d.clubs.size >= 5) return { ...d, real: true };
    } catch { /* 형식이 다르면 세계관 값으로 */ }
  }
  return { ...fallback(), real: false };
})();

/** 실제 기록 파일을 쓰는 중인가 */
export const HAS_REAL_SEASONS = DATA.real;

/** 그 구단의 우승 연도 (4자리, 오래된 순) */
export const clubTitles = (code: ClubCode): number[] => DATA.clubs.get(code)?.titles ?? [];
/** 그 구단이 있던 연도 */
export const clubYears = (code: ClubCode): number[] => DATA.clubs.get(code)?.years ?? [];
/** 그 해 그 구단 기록 */
export const clubSeason = (code: ClubCode, year: number): SeasonRec | undefined => DATA.clubs.get(code)?.seasons.get(year);
/** 그 해 리그 특징 */
export const leagueYear = (year: number): LeagueYear | undefined => DATA.league.get(year);
/** 그 해 우승 구단 */
export function championOf(year: number): ClubCode | undefined {
  for (const d of DATA.clubs.values()) if (d.titles.includes(year)) return d.code;
  return undefined;
}
/** 그 해 준우승 구단 (기록에 있을 때만) */
export function runnerUpOf(year: number): ClubCode | undefined {
  for (const d of DATA.clubs.values()) { const s = d.seasons.get(year); if (s?.post && /준우승/.test(s.post)) return d.code; }
  return undefined;
}
/** 리그 전체 연도 (오래된 순) */
export const leagueYears = (): number[] => {
  const ys = new Set<number>();
  for (const d of DATA.clubs.values()) d.years.forEach((y) => ys.add(y));
  return [...ys].sort((a, b) => a - b);
};

/** 카드 연도(2자리 27 · 99) → 4자리 */
export const fullYear = (y: number): number => (y >= 100 ? y : y <= (LAST_YEAR % 100) + 1 ? 2000 + y : 1900 + y);
/** 4자리 → 카드 연도(2자리) */
export const shortYear = (y: number): number => y % 100;
