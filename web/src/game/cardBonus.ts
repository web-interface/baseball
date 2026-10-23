// 카드 보너스 — 한 곳에서 계산해 어디서나 같은 값: 카드 앞면 숫자 · 선수 상세 능력치 · 라인업 선수 시트 · 팀 종합 · 경기 엔진.
//  · 강화: 대표 능력치 전부 + 강화 단계 상승분 합 (game/inventory ENH_STEPS — V +6 · X +12)
//  · 훈련: 고른 능력치 + (game/training — 특수구질은 구위로)
//  · 잠재력: 자기 몫 (라인업에선 팀 최고 잠재력 몫까지 — calc 가 potFace 로 넘긴다)
//  · 플레이스타일: 강화 V 부터 (고른 것, 없으면 대표 능력치에 맞는 것 — game/playstyle)
//  · 세트덱: 라인업에서만 (game/sets faceBonus) — 팀 종합엔 세트 단계 가치(tc)로 따로 들어가서 ovrBonusOf 엔 안 넣는다
//  · 장비는 아직 미리보기(저장 안 됨)라 여기엔 없다 — 선수 상세 화면에서만 따로 보인다.
import type { CardInst, Player } from './types';
import { faceBonus, type BatKey, type PitKey, type SetEffect } from './sets';
import { enhGainTotal, entryOf } from './inventory';
import { activePotential, type FaceFx } from './potential';
import { ENGINE_OF } from './training';
import { defaultPlaystyle, playstylesFor } from './playstyle';

export type BonusSrc = 'enh' | 'train' | 'pot' | 'ps' | 'set';
export const SRC_KO: Record<BonusSrc, string> = { enh: '강화', train: '훈련', pot: '잠재력', ps: '플레이스타일', set: '세트덱' };
export interface BonusCtx {
  /** 받는 잠재력 (자기 + 팀 몫) — 없으면 자기 몫만 */
  potFace?: FaceFx | null;
  /** 받는 세트 효과 (라인업) */
  set?: SetEffect | null;
}
export interface CardBonus {
  /** 출처별 — 대표 능력치 코드별 오른 값 */
  parts: Partial<Record<BonusSrc, FaceFx>>;
  /** 모두 더한 값 */
  total: FaceFx;
}

const add = (o: FaceFx, k: string, v: number) => { if (v) o[k] = (o[k] ?? 0) + v; };
const nonEmpty = (o: FaceFx) => Object.keys(o).length > 0;

/** 강화 V 부터 붙는 플레이스타일 (고른 것 — 없으면 대표 능력치에 맞는 것) */
export function playstyleOf(card: Pick<CardInst, 'id' | 'enhance'>, p: Player) {
  if (card.enhance < 5) return null;
  const id = entryOf(card.id)?.ps ?? defaultPlaystyle(p);
  return playstylesFor(p).find((x) => x.id === id) ?? null;
}

/** 카드 한 장이 받는 보너스 — 대표 능력치 코드별 */
export function cardBonusOf(card: CardInst, p: Player, ctx: BonusCtx = {}): CardBonus {
  const parts: CardBonus['parts'] = {};
  const codes = p.face.map((f) => f.code);
  const eg = enhGainTotal(card.enhance);
  if (eg > 0) parts.enh = Object.fromEntries(codes.map((c) => [c, eg]));
  const tr: FaceFx = {};
  for (const [c, v] of Object.entries(card.train?.gains ?? {})) add(tr, c === 'SIG' ? 'STF' : c, v ?? 0);
  if (nonEmpty(tr)) parts.train = tr;
  let pot: FaceFx = {};
  if (ctx.potFace) pot = { ...ctx.potFace };
  else for (const x of activePotential(card, p)?.fx ?? []) if (x.scope === 'self') add(pot, x.key, x.v);
  if (nonEmpty(pot)) parts.pot = pot;
  const ps = playstyleOf(card, p);
  if (ps) { const o: FaceFx = {}; for (const [c, v] of ps.parts) add(o, c, v); parts.ps = o; }
  if (ctx.set) { const fb = faceBonus(ctx.set, p.pos === 'P') as FaceFx; const o: FaceFx = {}; for (const [c, v] of Object.entries(fb)) add(o, c, v); if (nonEmpty(o)) parts.set = o; }
  const total: FaceFx = {};
  for (const o of Object.values(parts)) for (const [c, v] of Object.entries(o ?? {})) add(total, c, v);
  return { parts, total };
}

const OVR_SRC: BonusSrc[] = ['enh', 'train', 'pot', 'ps'];
/** 팀 종합에 더하는 값 — 받은 값(세트덱 빼고)을 대표 능력치 수로 나눈 평균 */
export function ovrBonusOf(b: CardBonus, p: Player): number {
  const n = p.face.length || 6;
  let s = 0;
  for (const src of OVR_SRC) for (const v of Object.values(b.parts[src] ?? {})) s += v;
  return s / n;
}
/** 출처별 팀 종합 몫 (선수 시트 설명 줄) */
export function ovrPartsOf(b: CardBonus, p: Player): Partial<Record<BonusSrc, number>> {
  const n = p.face.length || 6;
  const out: Partial<Record<BonusSrc, number>> = {};
  for (const src of OVR_SRC) { const s = Object.values(b.parts[src] ?? {}).reduce((a, v) => a + v, 0); if (s) out[src] = s / n; }
  return out;
}

const BAT_K = new Set<string>(['con', 'pow', 'gap', 'eye', 'spd', 'stl', 'def', 'arm']);
/** 경기 엔진 보너스 { k, v } — 세트덱 빼고 (세트는 엔진에 setFx 로 따로 들어간다) */
export function engineFxOf(b: CardBonus, isP: boolean): { k: BatKey | PitKey; v: number }[] {
  const acc = new Map<BatKey | PitKey, number>();
  for (const src of OVR_SRC) {
    for (const [code, v] of Object.entries(b.parts[src] ?? {})) {
      for (const [k, w] of ENGINE_OF[code] ?? []) {
        if (BAT_K.has(k) === isP) continue;
        acc.set(k, (acc.get(k) ?? 0) + v * w);
      }
    }
  }
  return [...acc].map(([k, v]) => ({ k, v: Math.round(v * 10) / 10 }));
}
