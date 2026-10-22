// 실제 감독과 한 대전 — 다시 보기용으로 이 기기에 남긴다(최근 40판). 결과(점수·이닝별 점수)는 서버가 정한 그대로.
export interface BattleItem { id: string; pos: string; ovr: number; name?: string; y?: number; c?: string }
export interface BattleSnap { userId?: number; username: string; club: string; teamName: string; lineup: BattleItem[]; ovr: number; power: number }
export interface BattleRec {
  id: string;
  at: number;
  me: BattleSnap;
  opp: BattleSnap;
  /** away = 나(도전), home = 상대 — null 은 9회 말 공격 없음 */
  line: { away: number[]; home: (number | null)[] };
  myScore: number;
  oppScore: number;
  result: 'W' | 'D' | 'L';
  ratingBefore: number;
  ratingDelta: number;
  meRecord?: { w: number; d: number; l: number };
  oppRecord?: { w: number; d: number; l: number; rating: number };
  replay?: boolean;
}

const KEY = 'bb.pvp.battles';
function readAll(): BattleRec[] {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as BattleRec[]) : [];
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
export function saveBattle(b: BattleRec) {
  const list = readAll().filter((x) => x.id !== b.id);
  list.unshift(b);
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 40))); } catch { /* 저장이 막히면 다시 보기만 못 함 */ }
}
export const loadBattle = (id: string): BattleRec | undefined => readAll().find((x) => x.id === id);
export const listBattles = (): BattleRec[] => readAll();
