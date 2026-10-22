// 경기 진행 상태(엔진 내부). game.ts 가 만들고 pitch/running/tactics/events/log 가 함께 읽고 쓴다.
import type { PC } from './player.ts';
import type { GameInput, LeagueRules, Park, WxTimeline, WxSlot, Umpire, TeamIn, BatLine, PitLine, FldLine, Collector, Tactics } from './types.ts';
import type { Sfc32 } from './rng.ts';

/** 수비 위치 번호: 0 P · 1 C · 2 1B · 3 2B · 4 3B · 5 SS · 6 LF · 7 CF · 8 RF · 9 DH */
export const PO = { P: 0, C: 1, B1: 2, B2: 3, B3: 4, SS: 5, LF: 6, CF: 7, RF: 8, DH: 9 } as const;
export const POS_NAME = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
/** 베이스 좌표(m): 홈(0,0), 1루(19.4,19.4), 2루(0,38.8), 3루(−19.4,19.4) */
export const BASE_X = [0, 19.40, 0, -19.40], BASE_Y = [0, 19.40, 38.80, 19.40];

/** 타석 결과 코드 */
export const R = { K: 0, BB: 1, IBB: 2, HBP: 3, S1: 4, S2: 5, S3: 6, HR: 7, OUT: 8, ROE: 9, FC: 10, SH: 11, SF: 12, DP: 13, KDROP: 14, CI: 15, OTHER: 16 } as const;

export interface PitSt {
  i: number; F: number; pitches: number; strikes: number; bf: number; outs: number; runs: number; er: number;
  h: number; bb: number; ibb: number; hbp: number; k: number; hr: number; wp: number; bk: number;
  starter: boolean; role: string; inn0: number; inningPitches: number; curInning: number;
  inh: number; inhScored: number; vMax: number;
  /** 세이브 상황 등판 여부·등판 때 리드 */
  saveSit: boolean; lead0: number; blown: boolean; heldLead: boolean;
  /** 상대 타순 슬롯별 상대한 횟수(타순 바퀴) */
  tto: Int8Array;
  firstInningDone: boolean; warmed: boolean; rattled: number; inZone: boolean; coldArm: number;
  /** 연투 구속 손실(km/h) */
  b2bLoss: number;
}
export interface Runner { i: number; slot: number; resp: number; earned: boolean; lead: number; jump: number }

export interface TeamSt {
  side: 0 | 1; tin: TeamIn; pcs: PC[]; idOf: Map<number, number>;
  order: Int16Array; next: number;
  /** 위치 번호 → pcs 인덱스(DH 포함) */
  field: Int16Array;
  /** pcs 인덱스 → 현재 수비 위치(없으면 −1) */
  posOf: Int8Array;
  pit: PitSt; pitHist: PitSt[];
  pen: { i: number; role: string; avail: number; used: boolean }[];
  bench: number[]; removed: Uint8Array;
  bat: BatLine[]; pitL: Map<number, PitLine>; fld: FldLine[];
  lob: number; hits: number; errors: number; runsInn: number[];
  mood: number; chemTier: number; streak: number;
  /** (타자 pcs, 투수 pcs) → 구종 9개 기억 */
  mem: Map<number, Float64Array>;
  /** 더그아웃 공유 기억: 상대 투수 pcs → 구종 9개 */
  teamMem: Map<number, Float64Array>;
  tac: Tactics; level: number; style: number; user: boolean; auto: boolean;
  /** 내야 0 보통 · 1 병살 · 2 전진 · 3 코너 전진 / 외야 0 보통 · 1 깊게 · 2 얕게 — 명령으로 고정 시 fixed */
  inf: number; of: number; alignFixed: boolean;
  reviews: number; visits: number;
  /** 타석 접근법 덮어쓰기(명령): 0 auto 1 aggressive 2 patient 3 power 4 contact */
  approach: number;
  starterIdx: number;
}

export interface G {
  inp: GameInput; seed: Uint32Array; rules: LeagueRules; park: Park; wx: WxTimeline; ump: Umpire;
  T: [TeamSt, TeamSt];
  inning: number; half: 0 | 1; outs: number;
  bases: (Runner | null)[];
  score: [number, number];
  balls: number; strikes: number;
  paNo: number; pitchNo: number; pitchInPA: number;
  clock: number;              // 경기 시작 이후 초
  slot: WxSlot; slotIdx: number;
  rP: Sfc32; rR: Sfc32; rB: Sfc32; rA: Sfc32; rW: Sfc32;
  over: boolean; status: 'final' | 'called' | 'suspended' | 'noGame' | 'tie';
  maxInn: number;
  /** 펜스: 각도 −45…45(1° 간격) 거리·높이 */
  fenceD: Float64Array; fenceH: Float64Array;
  /** 수비수 위치(x,y) 9명(P..RF) — 타석마다 대형으로 다시 계산 */
  fx: Float64Array; fy: Float64Array;
  col: Collector | null;
  logOn: boolean;
  evOn: boolean;
  ev: any;                    // events.ts 상태
  log: any;                   // log.ts 버퍼
  delays: number; delayMin: number;
  // 현재 타석 문맥(pitch.ts 가 채움)
  pa: PaCtx;
  // 이번 경기 고유 값
  dayClear: boolean; tempStart: number; doy: number;
  cmds: any[]; cmdPtr: number;
  injuries: { pid: number; type: string; inning: number; exposure: string }[];
  inhRunsLeft: number;
  lastPlay: number;           // 마지막 플레이 코드(이벤트 판정용)
  /** 투구 수 상한(라이브) */
  horizon: number;
  /** 결과 해시 누적 */
  h: number;
  uniqueEvents: Map<string, number>;
  /** 이 경기 첫 타석 여부·연장 */
  extra: boolean;
  wpNext: number;
  vOuts: number;
}

/** 타석 문맥(타석 시작 때 한 번 계산) */
export interface PaCtx {
  b: number; p: number; c: number;           // pcs 인덱스(공격 팀 타자, 수비 팀 투수·포수)
  bL: boolean; pL: boolean; same: boolean;
  zCon: number; zPow: number; zEye: number; zK: number; zFast: number; zBreak: number; zIQ: number; zAg: number;
  top: number; bot: number; HH: number; zMid: number;
  li: number; press: number;
  // 채널(이벤트·상태 합성 뒤)
  cCon: number; cPow: number; cEye: number; cAggr: number; cStuff: number; cCtl: number; cErr: number; cVelo: number;
  approach: number;   // 0 normal 1 aggressive 2 patient 3 power 4 contact 5 productive 6 advance
  mode: number;       // 0 보통 · 1 히트앤런 · 2 희생번트 · 3 기습번트 · 4 스퀴즈 · 5 기다려(take) · 6 고의4구
  countsSeen: number;
  prevType: number; prevV: number; run: number;
  pitches: number;
  guessFam: number;
  stealOn: number;    // 이번 투구에 뛰는 주자(베이스 비트)
  mem: Float64Array; tmem: Float64Array;
  gq: number; outPitch: number; vFF: number; hot: number;
}

export const newPaCtx = (): PaCtx => ({ b: 0, p: 0, c: 0, bL: false, pL: false, same: false, zCon: 0, zPow: 0, zEye: 0, zK: 0, zFast: 0, zBreak: 0, zIQ: 0, zAg: 0, top: 0, bot: 0, HH: 0, zMid: 0,
  li: 1, press: 0, cCon: 0, cPow: 0, cEye: 0, cAggr: 0, cStuff: 0, cCtl: 0, cErr: 0, cVelo: 0, approach: 0, mode: 0, countsSeen: 0, prevType: -1, prevV: 0, run: 0, pitches: 0, guessFam: -1, stealOn: 0, mem: new Float64Array(9), tmem: new Float64Array(9), gq: 0.55, outPitch: -1, vFF: 146, hot: 0 });

export const offense = (g: G): TeamSt => g.T[g.half];
export const defense = (g: G): TeamSt => g.T[1 - g.half];
export const basesCode = (g: G): number => (g.bases[0] ? 1 : 0) | (g.bases[1] ? 2 : 0) | (g.bases[2] ? 4 : 0);
export const runnersOn = (g: G): number => (g.bases[0] ? 1 : 0) + (g.bases[1] ? 1 : 0) + (g.bases[2] ? 1 : 0);
/** 홈 팀 기준 점수 차 */
export const homeDiff = (g: G): number => g.score[1] - g.score[0];
/** 공격 팀 기준 점수 차 */
export const offDiff = (g: G): number => g.half === 1 ? g.score[1] - g.score[0] : g.score[0] - g.score[1];
