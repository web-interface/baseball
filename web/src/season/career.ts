// 게임 통산 — 이 게임에서 치른 시즌 기록을 쌓아 두는 곳 (실제 기록과 따로).
//  · 시즌 기록(season/store 의 bat/pit — 선수 보기 id 마다)은 시즌을 새로 시작하거나(개막부터 다시 · 새로 시작 · 구단 바꾸기)
//    지우기 직전에 여기로 옮겨 적는다. 열쇠 = 선수 본체 ID(실제 선수 'k…' — 카드·연도가 달라도 같은 사람) 또는 선수 id(가상 선수).
//  · 저장: localStorage 'bb.career' { v: 1, seasons: [{ no, seed, club, at, games, bat: {열쇠: 합}, pit: {열쇠: 합} }] } — 최근 30시즌까지.
//  · 화면(선수 정보 '게임 통산' 탭)은 이 기록 + 지금 치르는 시즌(season/store)을 더해 보여 준다.
import type { SeasonState } from './store';

export type BatSum = { G: number; PA: number; AB: number; H: number; D: number; T: number; HR: number; RBI: number; R: number; BB: number; SO: number; SB: number };
export type PitSum = { G: number; GS: number; outs: number; H: number; R: number; ER: number; BB: number; SO: number; HR: number; W: number; L: number; SV: number; HLD: number };
export interface CareerSeason {
  /** 몇 번째로 치른 시즌 (1부터) */
  no: number;
  /** 시즌 연도 (예전 기록엔 없음) */
  year?: number;
  seed: string;
  /** 그때 내 구단 */
  club: string;
  at: number;
  /** 그 시즌 친 날 수 */
  days: number;
  bat: Record<string, BatSum & { team: string }>;
  pit: Record<string, PitSum & { team: string }>;
}
interface CareerSave { v: 1; seasons: CareerSeason[] }

const KEY = 'bb.career';
const MAX = 30;
/** 선수 보기 id → 통산 열쇠 (실제 선수는 선수 ID — 'k1a2b3c~2016' → 'k1a2b3c') */
export const careerKey = (playerId: string) => playerId.replace(/~\d{4}$/, '');

function read(): CareerSave {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as CareerSave) : null;
    if (v && v.v === 1 && Array.isArray(v.seasons)) return v;
  } catch { /* 깨졌으면 새로 */ }
  return { v: 1, seasons: [] };
}
const BAT0: BatSum = { G: 0, PA: 0, AB: 0, H: 0, D: 0, T: 0, HR: 0, RBI: 0, R: 0, BB: 0, SO: 0, SB: 0 };
const PIT0: PitSum = { G: 0, GS: 0, outs: 0, H: 0, R: 0, ER: 0, BB: 0, SO: 0, HR: 0, W: 0, L: 0, SV: 0, HLD: 0 };
function addTo<T extends Record<string, number>>(a: T, b: Partial<T>) {
  for (const k of Object.keys(a)) { const v = (b as Record<string, unknown>)[k]; if (typeof (a as Record<string, unknown>)[k] === 'number' && typeof v === 'number') (a as Record<string, number>)[k] += v; }
}

/** 선수 기록(보기 id 마다)을 사람 단위로 묶는다 */
export function groupBat(src: Record<string, Partial<BatSum> & { team?: string }>): Record<string, BatSum & { team: string }> {
  const out: Record<string, BatSum & { team: string }> = {};
  for (const [id, a] of Object.entries(src)) { const k = careerKey(id); const t = (out[k] ??= { ...BAT0, team: a.team ?? '' }); addTo(t as unknown as BatSum, a); }
  return out;
}
export function groupPit(src: Record<string, Partial<PitSum> & { team?: string }>): Record<string, PitSum & { team: string }> {
  const out: Record<string, PitSum & { team: string }> = {};
  for (const [id, a] of Object.entries(src)) { const k = careerKey(id); const t = (out[k] ??= { ...PIT0, team: a.team ?? '' }); addTo(t as unknown as PitSum, a); }
  return out;
}

/** 시즌을 지우기 전에 옮겨 적기 — 한 경기도 안 쳤으면 적지 않음, 같은 시즌(seed)은 한 번만 */
export function archiveSeason(s: SeasonState | null) {
  if (!s || !s.next || (!Object.keys(s.bat).length && !Object.keys(s.pit).length)) return;
  const save = read();
  if (save.seasons.some((x) => x.seed === s.seed)) return;
  const no = (save.seasons[save.seasons.length - 1]?.no ?? 0) + 1;
  save.seasons.push({ no, year: s.year ?? 2027, seed: s.seed, club: s.club, at: Date.now(), days: s.next, bat: groupBat(s.bat), pit: groupPit(s.pit) });
  if (save.seasons.length > MAX) save.seasons.splice(0, save.seasons.length - MAX);
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* 저장 공간이 차면 이번만 */ }
}

export interface CareerRow { label: string; no: number | null; live: boolean; club: string; bat?: BatSum; pit?: PitSum }
/** 그 사람의 게임 시즌별 기록 (옮겨 적은 시즌 + 지금 시즌) */
export function careerOf(key: string, live: SeasonState | null): CareerRow[] {
  const rows: CareerRow[] = [];
  for (const x of read().seasons) {
    const b = x.bat[key], p = x.pit[key];
    if (b || p) rows.push({ label: x.year ? `${x.year} 시즌` : `${x.no}번째 시즌`, no: x.no, live: false, club: b?.team ?? p?.team ?? x.club, bat: b, pit: p });
  }
  if (live) {
    const b = groupBat(Object.fromEntries(Object.entries(live.bat).filter(([id]) => careerKey(id) === key)))[key];
    const p = groupPit(Object.fromEntries(Object.entries(live.pit).filter(([id]) => careerKey(id) === key)))[key];
    if (b || p) rows.push({ label: '이번 시즌', no: null, live: true, club: b?.team ?? p?.team ?? live.club, bat: b, pit: p });
  }
  return rows;
}
/** 여러 시즌 합 */
export function sumRows(rows: CareerRow[]): { bat?: BatSum; pit?: PitSum } {
  let bat: BatSum | undefined, pit: PitSum | undefined;
  for (const r of rows) {
    if (r.bat) { bat ??= { ...BAT0 }; addTo(bat, r.bat); }
    if (r.pit) { pit ??= { ...PIT0 }; addTo(pit, r.pit); }
  }
  return { bat, pit };
}
/** 옮겨 적은 시즌 수 */
export const archivedCount = () => read().seasons.length;
