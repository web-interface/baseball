// 경기 운영(시즌 일정 · 순위·리그 기록 · 경기 기록)이 같이 쓰는 것 — 포스트시즌 경기 순서 · 달 · 결과 글자 · 투수 이름
import { useLayoutEffect, useMemo, useRef } from 'react';
import { ME, playerById, teamById } from '../../game/mock';
import { ensureClubRosters } from '../../season/rosters';
import { SERIES_KO, SERIES_SHORT, type PostGameRec, type PostState, type SeriesId } from '../../season/post';

export { SERIES_KO, SERIES_SHORT };

/** 포스트시즌 경기를 치른 순서대로 — n 은 엔진 시드(1000 + n)와 경기 키(p<n>)에 쓰는 번호 */
export interface PostGameAt { n: number; series: SeriesId; rec: PostGameRec }
export function postGames(p: PostState | undefined): PostGameAt[] {
  if (!p) return [];
  const out: PostGameAt[] = [];
  let n = 0;
  for (const sr of p.series) for (const g of sr.games) out.push({ n: n++, series: sr.id, rec: g });
  return out;
}

/** '2027-06-15' → 6 */
export const monthOf = (date: string) => Number(date.slice(5, 7));
/** '6.15' 와 요일 */
export const dowOf = (date: string) => '일월화수목금토'[new Date(`${date}T00:00:00Z`).getUTCDay()];

/** 내 쪽에서 본 결과 */
export type Res = 'W' | 'L' | 'D';
export const RES_KO: Record<Res, string> = { W: '승', L: '패', D: '무' };
export const resOf = (my: number, their: number): Res => (my > their ? 'W' : my < their ? 'L' : 'D');

/** 구단 짧은 이름 */
export const shortOf = (id: string) => teamById(id).short;
/** 내 구단인가 */
export const isMine = (id: string) => id === ME.teamId;

/** 선수 이름 — AI 구단 가상 선수는 선수단을 먼저 만들어야 찾는다(화면마다 useRosters 한 번) */
export const nameOf = (id?: string) => (id ? playerById(id)?.name ?? '선수' : '');
/** AI 구단 선수단(가상 선수 이름)을 한 번 만들어 둔다 */
export function useRosters() {
  useMemo(() => { try { ensureClubRosters(); } catch { /* 이름만 못 찾음 */ } }, []);
}

/** 가로로 미는 탭 줄(달 · 부문) — 고른 탭이 화면 밖이면 조용히 보이게 옮긴다. 감싼 요소에 ref 를 단다 */
export function useKeepSelected<T extends HTMLElement = HTMLDivElement>(dep: unknown) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const list = ref.current?.querySelector<HTMLElement>('[role="tablist"]');
    const el = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !el) return;
    const lr = list.getBoundingClientRect(), er = el.getBoundingClientRect();
    const left = er.left - lr.left + list.scrollLeft, right = left + er.width;
    if (right > list.scrollLeft + list.clientWidth - 8) list.scrollLeft = right - list.clientWidth + 16;
    else if (left < list.scrollLeft + 8) list.scrollLeft = Math.max(0, left - 16);
  }, [dep]);
  return ref;
}

/** 이닝 표기 — 6⅔ */
export const ipText = (outs: number) => {
  const w = Math.floor(outs / 3), f = outs % 3;
  const frac = f === 1 ? '⅓' : f === 2 ? '⅔' : '';
  return w === 0 && frac ? frac : `${w}${frac}`;
};
