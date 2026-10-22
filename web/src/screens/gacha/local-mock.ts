// 뽑기 화면만 쓰는 목업 — game/mock 값을 이어 붙인다 (서버가 붙으면 응답으로 바뀜).
// 연도팩 선택지(25·26·27 + 레전드 시즌)는 세계관 goldenEras, 구단팩 선수 풀은 구단마다 시즌 30명을 흉내 낸다.

import { PLAYERS, TEAMS, registerPlayers } from '../../game/mock';
import { CLUBS } from '../../game/world';
import type { ClubCode, Player, Pos } from '../../game/types';

/* ───────── 레전드 시즌 (세계관 goldenEras.legendSeason) ───────── */
export interface LegendSeason { year: number; club: ClubCode; era: string; desc: string }

export const LEGEND_SEASONS: LegendSeason[] = CLUBS.flatMap((c) =>
  c.goldenEras.map((e) => ({ year: e.legendSeason, club: c.code as ClubCode, era: e.label, desc: e.desc })),
).sort((a, b) => b.year - a.year);

export interface YearOption {
  year: number;
  /** 짧은 표기 ’27 */
  tag: string;
  /** 고를 때 아래 한 줄 */
  note: string;
  legends: LegendSeason[];
}

const yy = (y: number) => `’${String(y).slice(-2)}`;
const BASE_YEARS: [number, string][] = [[2027, '이번 시즌 · 시상 전'], [2026, '지난 시즌 · 시상 끝'], [2025, '2년 전 시즌']];

/** 연도팩 선택지 — 25·26·27 + 레전드 시즌 (요구사항 40번, 세계관 7절) */
export const YEAR_OPTIONS: YearOption[] = (() => {
  const out: YearOption[] = BASE_YEARS.map(([y, note]) => ({ year: y, tag: yy(y), note, legends: LEGEND_SEASONS.filter((l) => l.year === y) }));
  const seen = new Set(out.map((o) => o.year));
  for (const l of LEGEND_SEASONS) {
    if (seen.has(l.year)) continue;
    seen.add(l.year);
    out.push({ year: l.year, tag: yy(l.year), note: '레전드 시즌', legends: LEGEND_SEASONS.filter((x) => x.year === l.year) });
  }
  return out;
})();

/* ───────── 구단 전력 (카드 풀 크기 · 최상위 등급 유무) ───────── */
export const CLUB_TIER = Object.fromEntries(TEAMS.map((t) => [t.code, t.tier])) as Record<ClubCode, '강' | '중' | '약'>;

/** 구단의 황금기 (레전드 카드 사연) — 입단 뒤의 시즌을 고른다 */
export function eraOf(p: Player): LegendSeason | undefined {
  const t = TEAMS.find((x) => x.id === p.teamId);
  if (!t) return undefined;
  const list = LEGEND_SEASONS.filter((l) => l.club === t.code).sort((a, b) => a.year - b.year);
  return list.find((l) => l.year >= p.draftYear) ?? list[list.length - 1];
}

/* ───────── 구단팩 선수 풀 — 목업 선수가 구단마다 2~12명뿐이라 같은 모양으로 채운다 ───────── */
const SURNAMES = ['남궁', '제갈', '독고', '황보', '선우', '사공', '서문', '어', '편', '표', '탁', '용', '반', '기', '금', '옥', '소', '길', '방', '모', '피', '승', '빈', '위', '엄', '여', '국', '맹', '인', '설', '봉', '석', '진', '구', '도', '은', '연', '하', '추', '마'];
const GIVEN = ['하진', '도윤', '시우', '지후', '은찬', '태윤', '건후', '서준', '민결', '유찬', '라온', '다겸', '해람', '이안', '우빈', '재희', '윤재', '한솔', '태하', '지운', '로운', '시헌', '다율', '온유', '규빈', '서진', '무결', '찬솔', '이든', '해온'];
const ROSTER: Pos[] = ['P', 'P', 'P', 'P', 'P', 'P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'P'];

function h32(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const poolCache = new Map<ClubCode, Player[]>();

/** 그 구단의 '모든 연도' 선수 풀 (진짜 선수 + 같은 모양으로 채운 가상 선수) */
export function clubPool(code: ClubCode): Player[] {
  const hit = poolCache.get(code);
  if (hit) return hit;
  const team = TEAMS.find((t) => t.code === code)!;
  const own = PLAYERS.filter((p) => p.teamId === team.id && p.id !== 'p41');
  const out = [...own];
  const usedNo = new Set(own.map((p) => p.number));
  const usedName = new Set(PLAYERS.map((p) => p.name));
  const tierShift = CLUB_TIER[code] === '강' ? 2 : CLUB_TIER[code] === '약' ? -3 : 0;
  let i = 0;
  for (const pos of ROSTER) {
    if (out.length >= 16) break;
    // 같은 자리 진짜 선수가 이미 있으면 건너뜀 (투수는 여럿)
    if (pos !== 'P' && out.some((p) => p.pos === pos)) continue;
    const tpl = PLAYERS.filter((p) => p.pos === pos && p.id !== 'p41');
    if (!tpl.length) continue;
    const seed = h32(`${code}:${pos}:${i}`);
    const base = tpl[seed % tpl.length];
    let name = '';
    for (let k = 0; k < 8 && (!name || usedName.has(name)); k++) {
      name = SURNAMES[(seed >>> (3 + k)) % SURNAMES.length] + GIVEN[(seed >>> (9 + k)) % GIVEN.length];
    }
    usedName.add(name);
    let no = (seed % 89) + 1;
    while (usedNo.has(no)) no = (no % 98) + 1;
    usedNo.add(no);
    const d = ((seed >>> 13) % 11) - 6 + tierShift;
    const clamp = (v: number) => Math.max(40, Math.min(97, v));
    out.push({
      ...base,
      id: `x-${code.toLowerCase()}-${i}`,
      name,
      teamId: team.id,
      number: no,
      age: 21 + ((seed >>> 5) % 14),
      origin: 'KR',
      draftYear: 2010 + ((seed >>> 7) % 16),
      ovr: clamp(base.ovr + d),
      face: base.face.map((f) => ({ ...f, v: clamp(f.v + d) })),
      look: `look:x-${code}-${i}`,
      injury: undefined,
    });
    i++;
  }
  poolCache.set(code, out);
  registerPlayers(out.filter(isSynthetic));
  return out;
}

/** 가상 선수인가 (선수 정보 화면이 없는 선수) */
export const isSynthetic = (p: Player) => p.id.startsWith('x-');

/* ───────── 팩 겉모양 — 팩마다 포일·인쇄가 다르다 ───────── */
export type PackSkin = 'graphite' | 'gold' | 'crimson' | 'sepia' | 'year' | 'club';

export const PACK_LOOK: Record<string, { skin: PackSkin; en: string; tag: string; blurb: string }> = {
  basic: { skin: 'graphite', en: 'PLAYER PACK', tag: '노멀~레전드', blurb: '도감 채우기 · 노멀 위주' },
  premium: { skin: 'gold', en: 'PREMIUM', tag: '스페셜 이상', blurb: '특별 등급(MVP·GG·TH)도 나와요' },
  special: { skin: 'crimson', en: 'SPECIAL', tag: '레어 이상', blurb: 'MVP·GG·TH 확률이 높아요' },
  legend: { skin: 'sepia', en: 'LEGEND', tag: '엘리트 이상', blurb: '이번 주 한정 · 골든볼' },
  year: { skin: 'year', en: 'SEASON', tag: '고른 시즌만', blurb: '모든 구단 · 프리미엄 확률' },
  club: { skin: 'club', en: 'CLUB', tag: '고른 구단만', blurb: '그 구단의 모든 연도' },
};

/** 신문 제호 — 가상 리그(한별 리그)의 가상 스포츠 신문 */
export const PAPER = { name: '한별스포츠', en: 'HANBYUL SPORTS' };
