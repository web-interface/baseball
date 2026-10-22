// 장비 — 카드에 '무엇을 끼고 있나'를 보여 주기 위한 모양(요구사항 23번 · 05 기획 13.3절).
// 서버·엔진이 붙기 전까지 이 파일의 목업으로 보인다. game/types.ts 의 CardInst 에 gear 가 생기면 그걸 쓴다.
//   슬롯: 타자 7 (배트·글러브·스파이크·배팅 장갑·헬멧·손목 밴드·팔꿈치 보호대) / 투수 5 (글러브·스파이크·모자·손목 밴드·언더셔츠)
//   등급: 기본·고급·희귀·명품·전설 (카드 등급과 다른 이름) · 장비 강화 +1~+5 · 같은 가상 브랜드 3부위 세트 +2 / 5부위 +4
import type { CardInst, GradeId, Player } from '../game/types';
import { GRADES } from '../game/grades';
import { seeded } from './meta';

export type GearSlot = 'bat' | 'glove' | 'spikes' | 'batgloves' | 'helmet' | 'band' | 'guard' | 'cap' | 'shirt';
export type GearGrade = 'basic' | 'fine' | 'rare' | 'master' | 'legend';

export interface GearPiece {
  slot: GearSlot;
  /** 가상 브랜드 장비 이름 — 실제 브랜드 금지 */
  name: string;
  grade: GearGrade;
  /** 장비 강화 0~5 */
  plus: number;
  /** 세트 브랜드 (같은 브랜드 3부위 → 세트 효과) */
  set?: string;
  /** 오르는 능력치 한 줄 ('파워 +3') */
  effect: string;
}

export const SLOTS_BATTER: GearSlot[] = ['bat', 'glove', 'spikes', 'batgloves', 'helmet', 'band', 'guard'];
export const SLOTS_PITCHER: GearSlot[] = ['glove', 'spikes', 'cap', 'band', 'shirt'];

export const SLOT_KO: Record<GearSlot, string> = {
  bat: '배트', glove: '글러브', spikes: '스파이크', batgloves: '배팅 장갑', helmet: '헬멧', band: '손목 밴드', guard: '팔꿈치 보호대', cap: '모자', shirt: '언더셔츠',
};
export const GEAR_GRADE_KO: Record<GearGrade, string> = { basic: '기본', fine: '고급', rare: '희귀', master: '명품', legend: '전설' };
const GEAR_ORDER: GearGrade[] = ['basic', 'fine', 'rare', 'master', 'legend'];

/** 세트 효과 — 같은 브랜드 3부위 +2 · 5부위 +4 */
export function gearSet(gear: GearPiece[]) {
  const n = new Map<string, number>();
  gear.forEach((g) => { if (g.set) n.set(g.set, (n.get(g.set) ?? 0) + 1); });
  let best: { name: string; count: number; bonus: number } | null = null;
  n.forEach((count, name) => {
    const bonus = count >= 5 ? 4 : count >= 3 ? 2 : 0;
    if (!best || count > best.count) best = { name, count, bonus };
  });
  return best as { name: string; count: number; bonus: number } | null;
}

export const slotsOf = (p: Player) => (p.pos === 'P' ? SLOTS_PITCHER : SLOTS_BATTER);

/* ───────── 목업 ───────── */
const BRANDS = ['해솔', '청람', '여울', '단단'];
const EFFECT: Record<GearSlot, [string, string]> = {
  bat: ['파워', '컨택'], glove: ['수비', '제구'], spikes: ['주루', '체력'], batgloves: ['컨택', '컨택'], helmet: ['선구', '선구'],
  band: ['송구', '구속'], guard: ['내구성', '내구성'], cap: ['위기관리', '위기관리'], shirt: ['구위', '구위'],
};
const NAME: Record<GearSlot, string> = {
  bat: '단풍나무 배트', glove: '가죽 글러브', spikes: '경량 스파이크', batgloves: '배팅 장갑', helmet: '검투 헬멧', band: '손목 밴드',
  guard: '팔꿈치 보호대', cap: '경기용 모자', shirt: '압박 언더셔츠',
};

const cache = new Map<string, GearPiece[]>();

/** 카드 등급이 높을수록 많이·좋게 낀다 (목업 규칙 — 서버 데이터로 바뀜) */
export function mockGear(card: Pick<CardInst, 'id' | 'grade' | 'enhance'>, p: Player): GearPiece[] {
  const hit = cache.get(card.id);
  if (hit) return hit;
  const r = seeded('gear:' + card.id);
  const slots = slotsOf(p);
  const rank = GRADES[card.grade as GradeId]?.rank ?? 1;
  const want = Math.max(0, Math.min(slots.length, Math.round(rank * 0.7 + card.enhance * 0.25 + r() * 1.6)));
  const order = [...slots].sort(() => r() - 0.5).slice(0, want);
  const brand = BRANDS[Math.floor(r() * BRANDS.length)];
  const setN = want >= 3 ? Math.min(want, rank >= 6 ? 5 : 3) : 0;
  const out: GearPiece[] = slots
    .filter((sl) => order.includes(sl))
    .map((slot, i) => {
      const gi = Math.max(0, Math.min(4, Math.round(rank * 0.45 + r() * 1.8 - 0.8)));
      const grade = GEAR_ORDER[gi];
      const plus = Math.min(5, Math.floor(r() * (gi + 2)));
      const [bat, pit] = EFFECT[slot];
      const v = gi + 1 + plus;
      return {
        slot,
        name: (i < setN ? brand + ' ' : '') + NAME[slot],
        grade,
        plus,
        set: i < setN ? brand : undefined,
        effect: `${p.pos === 'P' ? pit : bat} +${v}`,
      };
    });
  cache.set(card.id, out);
  return out;
}
