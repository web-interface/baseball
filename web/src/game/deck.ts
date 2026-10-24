// 무슨 덱인가 — 1군 엔트리의 세트덱(game/sets)으로 한 줄 이름. 홈 · 대전 상대 · 감독 순위에 배지로(ui/DeckBadge).
//  · 왕조(구단+연도 20명)면 "’27 독수리스 왕조덱", 구단+연도 세트면 "’27 독수리스덱", 구단 세트면 "독수리스덱", 연도 세트면 "’25 연도덱"
//  · 켜진 세트가 없으면 "혼합덱" (가장 많이 모은 구단을 작은 글로)
//  · 다른 감독은 서버에 올린 라인업(카드 구단 · 카드 연도)으로 같은 계산 — 등급 · 강화는 몰라도 덱 이름은 같다
import { SET_KIND_KO, computeSets, type EntryMember } from './sets';
import { teamByCode, teamById } from './mock';
import { shortLabel } from './world';
import { fullYear } from './clubSeasons';
import type { ClubCode } from './types';

export type DeckKind = 'dynasty' | 'teamYear' | 'team' | 'year' | 'mixed';
export interface Deck {
  label: string;
  /** 작은 글 — '구단+연도 14명 · +7 단계' */
  sub: string;
  kind: DeckKind;
  /** 배지 색 (구단 주색 · 보조색, 연도 · 혼합덱은 정해진 색) */
  c1: string;
  c2: string;
  have: number;
  code?: ClubCode;
}

const yyOf = (y?: number) => (y != null ? `’${String(y).slice(-2)}` : '');

export function deckOf(members: EntryMember[]): Deck {
  const r = computeSets(members);
  const lead = r.dynasty ?? r.active[0] ?? null;
  if (!lead) {
    const top = r.all.filter((x) => x.kind === 'team').sort((a, b) => b.have - a.have)[0];
    return { label: '혼합덱', sub: top?.code ? `${shortLabel(top.code)} ${top.have}명이 가장 많아요` : '여러 구단 · 연도', kind: 'mixed', c1: '#7d8699', c2: '#3c4352', have: top?.have ?? 0 };
  }
  const t = lead.code ? teamByCode(lead.code) : undefined;
  const club = lead.code ? shortLabel(lead.code) : '';
  const kind: DeckKind = r.dynasty ? 'dynasty' : lead.kind;
  const label = kind === 'dynasty' ? `${yyOf(lead.year)} ${club} 왕조덱`
    : lead.kind === 'teamYear' ? `${yyOf(lead.year)} ${club}덱`
    : lead.kind === 'team' ? `${club}덱` : `${yyOf(lead.year)} 연도덱`;
  return {
    label: label.trim(),
    sub: `${SET_KIND_KO[lead.kind]} ${lead.have}명${lead.cur ? ` · +${lead.cur.v} 단계` : ''}`,
    kind,
    c1: t?.colors.primary ?? (lead.kind === 'year' ? '#6b5cff' : '#7a5cff'),
    c2: t?.colors.secondary ?? '#2b2466',
    have: lead.have,
    code: lead.code,
  };
}

/** 서버에 올린 라인업 한 칸 (api PvpLineupItem 과 같은 모양 — 구단 id · 카드 연도 2자리) */
interface SnapItem { pos: string; c?: string; y?: number }
/** 다른 감독 덱 — 올린 라인업으로 */
export function deckOfSnapshot(lineup: SnapItem[] | undefined | null): Deck | null {
  if (!lineup?.length) return null;
  const members: EntryMember[] = lineup.map((it, i) => ({
    key: `s${i}`,
    code: teamById(it.c ?? 'dj').code,
    year: it.y != null ? fullYear(it.y) : undefined,
    isP: it.pos === 'SP' || it.pos === 'RP' || it.pos === 'CP' || it.pos === 'P',
  }));
  return deckOf(members);
}
