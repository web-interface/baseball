// 구단 연도 기록 — 연도팩 연도 목록 · '우승' 표시 · 세트덱 '그 해 성격'이 같이 쓰는 한 곳.
// game/data/club-seasons.json(실제 지역 구단의 그 해 성적을 가상 구단 코드로 옮긴 값 — 현재 10 + 옛 10)을 읽고,
// 없거나 빠진 구단은 세계관(world.ts)의 우승 연도·황금기로 대신한다. 화면·저장소에는 가상 구단 이름만 쓴다.
//  · 구단이 '있던 해'는 세계관의 era(그 이름으로 뛴 해)가 정한다 — 기록 파일의 그 밖 연도는 버린다(계보가 다른 옛 형식 대비).
//  · 2027 은 게임 속 이번 시즌이라 기록이 없다. 2026 포스트시즌은 '진행중'일 수 있다(우승 표시 없음).
import { ALL_CLUBS, CURRENT_SEASON, FIRST_SEASON, clubsIn, eraOfCode } from './world';
import type { ClubCode } from './types';

/** 팀 기록 순위 키 — 1 = 리그 1위 */
export type RankKey = 'avg' | 'hr' | 'obp' | 'slg' | 'sb' | 'runs' | 'era' | 'so' | 'whip' | 'sv' | 'bullpen' | 'def';

export interface SeasonRec {
  year: number;
  rank?: number;
  w?: number; d?: number; l?: number;
  /** 포스트시즌 결과 — '우승' · '준우승' · 'PO' · '준PO' · 'WC' · '없음' · '진행중' */
  post?: string;
  /** 포스트시즌 설명 (진행 중인 해 등) */
  postNote?: string;
  tags: string[];
  ranks: Partial<Record<RankKey, number>>;
  /** 그 해 리그 구단 수 (순위를 0~1 로 바꿀 때) */
  teams: number;
}

export interface LeagueYear { year: number; tags: string[]; note?: string; teams?: number; games?: number }

interface ClubData { code: ClubCode; titles: number[]; runnerUps: number[]; pennants: number[]; years: number[]; seasons: Map<number, SeasonRec> }

const LAST_YEAR = CURRENT_SEASON;
const CODES = new Set<string>(ALL_CLUBS.map((c) => c.code));
const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);

/* ───────── JSON 읽기 (있으면) ───────── */
// import.meta.glob 은 파일이 없으면 빈 묶음이라 빌드가 깨지지 않는다.
const found = import.meta.glob('./data/club-seasons.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const RAW = Object.values(found)[0] as Record<string, unknown> | undefined;

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strs = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === 'string');
const nums = (v: unknown): number[] => arr(v).map(num).filter((x): x is number => x != null);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** 여러 이름으로 들어올 수 있는 팀 기록 순위 키를 맞춘다 */
const RANK_ALIASES: Record<RankKey, string[]> = {
  avg: ['avg', 'ba', 'battingAvg', 'teamAvg', 'avgRank'],
  hr: ['hr', 'homeRuns', 'hrRank'],
  obp: ['obp', 'obpRank', 'bb', 'walks'],
  slg: ['slg', 'slgRank', 'ops', 'opsRank'],
  sb: ['sb', 'steals', 'sbRank'],
  runs: ['runs', 'r', 'runsRank', 'rs'],
  era: ['era', 'eraRank', 'ra'],
  so: ['so', 'k', 'strikeouts', 'soRank', 'kRank'],
  whip: ['whip', 'whipRank'],
  sv: ['sv', 'saves', 'svRank'],
  bullpen: ['bullpen', 'bullpenEra', 'reliefEra', 'bullpenRank'],
  def: ['def', 'fielding', 'fpct', 'errors', 'defRank', 'fieldingRank'],
};

function readRanks(rec: Record<string, unknown>): Partial<Record<RankKey, number>> {
  const out: Partial<Record<RankKey, number>> = {};
  // 타자 삼진(batK)·피안타(k) 같은 이름이 섞이지 않게, 묶음 순위표만 본다
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

const isTitle = (post?: string) => !!post && /우승/.test(post) && !/준우승/.test(post);

function parseJson(raw: Record<string, unknown>): { clubs: Map<ClubCode, ClubData>; league: Map<number, LeagueYear> } {
  const clubs = new Map<ClubCode, ClubData>();
  const league = new Map<number, LeagueYear>();
  const teamsByYear = new Map<number, number>();
  for (const [codeRaw, cv] of Object.entries(obj(raw.clubs))) {
    const code = codeRaw.toUpperCase() as ClubCode;
    if (!CODES.has(code)) continue;
    const [from, to] = eraOfCode(code);
    const c = obj(cv);
    const seasons = new Map<number, SeasonRec>();
    const list: Record<string, unknown>[] = Array.isArray(c.seasons)
      ? (c.seasons as unknown[]).map(obj)
      : Object.entries(obj(c.seasons ?? c.years)).map(([y, v]) => ({ year: y, ...obj(v) }));
    for (const s of list) {
      const year = num(s.year);
      if (!year || year < from || year > to) continue;
      const tags = strs(s.tags);
      const post = typeof s.post === 'string' ? s.post : typeof s.postseason === 'string' ? s.postseason : typeof s.result === 'string' ? s.result : undefined;
      const postNote = typeof s.postNote === 'string' ? s.postNote : undefined;
      seasons.set(year, { year, rank: num(s.rank), w: num(s.w ?? s.wins), d: num(s.d ?? s.draws ?? s.ties), l: num(s.l ?? s.losses), post, postNote, tags, ranks: readRanks(s), teams: num(s.teams) ?? 0 });
      teamsByYear.set(year, (teamsByYear.get(year) ?? 0) + 1);
    }
    const inEra = (y: number) => y >= from && y <= to;
    const titles = nums(c.titles).filter(inEra);
    for (const [y, s] of seasons) if (isTitle(s.post) && !titles.includes(y)) titles.push(y);
    const runnerUps = nums(c.runnerUps).filter(inEra);
    for (const [y, s] of seasons) if (s.post && /준우승/.test(s.post) && !runnerUps.includes(y)) runnerUps.push(y);
    const pennants = nums(c.pennants).filter(inEra);
    clubs.set(code, { code, titles: titles.sort((a, b) => a - b), runnerUps: runnerUps.sort((a, b) => a - b), pennants: pennants.sort((a, b) => a - b), years: range(from, to), seasons });
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
    league.set(year, { year, tags, note, teams: num(l.teams), games: num(l.games) });
  }
  return { clubs, league };
}

/* ───────── 세계관 대신 값 (JSON 이 없거나 빠진 구단) ───────── */
function fallbackClub(code: ClubCode): ClubData {
  const c = ALL_CLUBS.find((x) => x.code === code)!;
  const [from, to] = eraOfCode(code);
  const titles: number[] = ([...c.titles] as number[]).filter((y) => y >= from && y <= to).sort((a, b) => a - b);
  const seasons = new Map<number, SeasonRec>();
  for (let y = from; y <= Math.min(to, LAST_YEAR - 1); y++) {
    const era = (c.goldenEras as readonly { label: string; legendSeason: number }[]).find((e) => e.legendSeason === y);
    const tags: string[] = [];
    if (titles.includes(y)) tags.push('우승');
    if (era) tags.push(era.label);
    seasons.set(y, { year: y, post: titles.includes(y) ? '우승' : undefined, tags, ranks: {}, teams: clubsIn(y).length || 10 });
  }
  return { code, titles, runnerUps: [], pennants: [], years: range(from, to), seasons };
}

const DATA = (() => {
  let parsed: ReturnType<typeof parseJson> | null = null;
  if (RAW) {
    try {
      const d = parseJson(RAW);
      if (d.clubs.size >= 5) parsed = d;
    } catch { /* 형식이 다르면 세계관 값으로 */ }
  }
  const clubs = new Map<ClubCode, ClubData>();
  for (const c of ALL_CLUBS) clubs.set(c.code, parsed?.clubs.get(c.code) ?? fallbackClub(c.code));
  return { clubs, league: parsed?.league ?? new Map<number, LeagueYear>(), real: !!parsed };
})();

/** 실제 기록 파일을 쓰는 중인가 */
export const HAS_REAL_SEASONS = DATA.real;

/** 그 구단의 우승 연도 (4자리, 오래된 순) */
export const clubTitles = (code: ClubCode): number[] => DATA.clubs.get(code)?.titles ?? [];
/** 그 구단의 준우승 연도 */
export const clubRunnerUps = (code: ClubCode): number[] => DATA.clubs.get(code)?.runnerUps ?? [];
/** 그 구단의 정규시즌 1위 연도 */
export const clubPennants = (code: ClubCode): number[] => DATA.clubs.get(code)?.pennants ?? [];
/** 그 구단이 있던 연도 (그 이름으로 뛴 해 전부, 오래된 순) */
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
  for (const d of DATA.clubs.values()) if (d.runnerUps.includes(year)) return d.code;
  return undefined;
}
/** 리그 전체 연도 1982~2027 (오래된 순) */
export const leagueYears = (): number[] => range(FIRST_SEASON, LAST_YEAR);
/** 그 해 리그에 있던 구단 (1985 은 시즌 도중 바뀐 두 인천 구단 모두) */
export const clubsOfYear = (year: number): ClubCode[] => clubsIn(year);

/** 카드 연도(2자리 27 · 99) → 4자리 */
export const fullYear = (y: number): number => (y >= 100 ? y : y <= (LAST_YEAR % 100) + 1 ? 2000 + y : 1900 + y);
/** 4자리 → 카드 연도(2자리) */
export const shortYear = (y: number): number => y % 100;

/* ───────── 표시 도움 ───────── */
/** 포스트시즌 값 → 화면 글자 ('진행중'은 가을야구 중 — 우승 표시 없음) */
export function postLabel(post?: string): string {
  if (!post || post === '없음') return '';
  if (post === '진행중') return '가을야구 중';
  if (post === 'PO') return '플레이오프';
  if (post === '준PO') return '준플레이오프';
  if (post === 'WC') return '와일드카드';
  return post;
}
/** 우승·준우승·정규 1위 같은 '결과' 태그 — 세트덱 '그 해 성격' 이름에서는 뺀다 */
const RESULT_TAG = /^(우승|준우승|통합 우승|정규 1위|가을야구|[전후]기 1위|드림리그 1위|매직리그 1위|[67]할 승률|최하위)$/;
export const isResultTag = (t: string) => RESULT_TAG.test(t);
/** 그 해 대표 성격 태그 (없으면 undefined) — '돌풍'은 다른 성격이 없을 때만 */
export function traitTag(rec?: SeasonRec): string | undefined {
  if (!rec) return undefined;
  const style = rec.tags.filter((t) => !isResultTag(t));
  return style.find((t) => t !== '돌풍') ?? style[0];
}
/** 한 줄 — '1위 · 74승 5무 47패 · 우승' (기록이 없으면 빈 글자) */
export function seasonLine(code: ClubCode, year: number, opt: { post?: boolean } = {}): string {
  const r = clubSeason(code, year);
  if (!r) return '';
  const bits: string[] = [];
  if (r.rank) bits.push(`${r.rank}위`);
  if (r.w != null && r.l != null) bits.push(`${r.w}승${r.d ? ` ${r.d}무` : ''} ${r.l}패`);
  const p = postLabel(r.post);
  if (opt.post !== false && p) bits.push(p);
  return bits.join(' · ');
}
