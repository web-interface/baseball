// 잠재력 — 카드마다 하나가 확률로 열린다. 등급(별 하나 · 둘 · 셋 — 화면은 배지 ui/PotBadge)과 별명(종류)이 같이 정해진다.
//  · 별 둘(상급) · 별 셋(최고)은 골든글러브 이상 카드만 — 골든글러브 · MVP · 프랜차이즈 · 특별 선수 · 블랙 · 시그니처 (귀함 순서
//    screens/gacha/draw RARITY ≥ gg). 그 밖(노멀 · 스페셜 · 레어 · 엘리트 · 레전드 · TH)은 별 하나만. 예전에 열린 별 둘 · 셋은
//    읽을 때 같은 종류의 별 하나로 (저장값은 그대로 — 화면 · 계산 모두 potOf 를 거친다). 사용자 지시 10-25
//  · 레전드급(레전드 · 프랜차이즈 · 블랙 · 시그니처) 선수는 실제 별명 · 특성으로 만든 전용 잠재력(data/potentials.json — 선수 ID 열쇠)
//  · 그 밖의 선수는 별명식 일반 잠재력(KINDS — 타자 · 발 · 야수 · 포지션 · 포수 · 지명 · 투수 · 선발 · 불펜 · 마무리 46종) 가운데
//    두드러진 능력에 맞는 3~6가지에서 어울리는 만큼의 확률로 고른다 — 같은 선수라도 다시 돌리면 다른 별명이 나올 수 있다
//  · 별 셋은 팀 선수들(타자 전원 또는 투수 전원)도 같이 받는다. 단 1군 엔트리(타자 9 · 선발 5 · 불펜 10 · 마무리)에서 2명만 켜진다 —
//    3명 이상이면 감독이 고르고(sOn), 안 고르면 팀 종합이 가장 많이 오르는 2명. 꺼진 별 셋 · 벤치의 별 셋은 효과 없음(자기 · 팀 모두)
//    (teamPotential — 라인업 계산 screens/lineup/calc · 경기 엔진 season/rosters 가 같이 쓴다)
// 저장: localStorage 'bb.pot' { v: 1, cards: { 카드 id: { pick, rolls, k? } }, sOn?: 카드 id[] } — 카드마다(같은 선수라도 카드가 다르면 따로)
//   pick 0 별 하나 · 1 별 둘 · 2 별 셋 / k 일반 잠재력 종류 (없으면 예전 규칙 — 가장 두드러진 능력 하나, legacyKindOf)
//   sOn 감독이 켠 별 셋 카드 (최대 2 — 엔트리에 없는 카드는 셈에서 빠진다)
import type { CardInst, GradeId, Player, Pos } from './types';
import type { BatKey, PitKey } from './sets';
import LEGEND from './data/potentials.json';

export type PotTier = 'C' | 'A' | 'S';
export type PotScope = 'self' | 'teamBat' | 'teamPit';
export interface PotEffect { scope: PotScope; key: string; v: number }
export interface Potential { tier: PotTier; kind: string; name: string; desc: string; fx: PotEffect[] }
export const TIERS: PotTier[] = ['C', 'A', 'S'];
/** 별 개수 — 화면엔 글자 대신 이 별 배지 (ui/PotBadge) */
export const TIER_STARS: Record<PotTier, number> = { C: 1, A: 2, S: 3 };
/** 툴팁 · 알림용 별 글자 */
export const tierMark = (t: PotTier) => '★'.repeat(TIER_STARS[t]);
/** 화면 읽기 프로그램용 이름 (보이는 글자로는 쓰지 않는다) */
export const TIER_KO: Record<PotTier, string> = { C: '보통', A: '상급', S: '최고' };
const TIER_I: Record<PotTier, 0 | 1 | 2> = { C: 0, A: 1, S: 2 };

/** 레전드급 — 한 팀에 타자 2명 · 투수 2명까지 */
export const LEGEND_GRADES = new Set<GradeId>(['legend', 'franchise', 'black', 'signature']);
export const isLegendGrade = (g: GradeId) => LEGEND_GRADES.has(g);
export const LEGEND_MAX = { bat: 2, pit: 2 };
/** MVP 카드 — 한 팀에 4명까지 (타자 · 투수 합쳐서). 사용자 지시 10-24 */
export const MVP_MAX = 4;
export const isMvpGrade = (g: GradeId) => g === 'mvp';

/** 별 둘 · 셋이 나올 수 있는 카드 등급 — 골든글러브 이상 (귀함 gg 5.3 · mvp 5.4 · 프랜차이즈 6 · 특별 6.5 · 블랙 7 · 시그니처 8) */
export const POT_HI_GRADES: ReadonlySet<GradeId> = new Set<GradeId>(['gg', 'mvp', 'franchise', 'unique', 'black', 'signature']);
export const canHighPot = (g: GradeId) => POT_HI_GRADES.has(g);
/** 화면 글 — 별 둘부터 나오는 등급 */
export const POT_HI_KO = '골든글러브 · MVP · 프랜차이즈 · 특별 선수 · 블랙 · 시그니처';
/** 별 셋이 켜지는 인원 — 1군 엔트리에서 */
export const S_MAX = 2;

/** 확률(%) — 별 둘부터 못 받는 등급은 별 하나만, 레전드급은 별 셋이 3%, 그 밖은 2% */
export const oddsOf = (g: GradeId): Record<PotTier, number> =>
  !canHighPot(g) ? { C: 100, A: 0, S: 0 } : isLegendGrade(g) ? { C: 72, A: 25, S: 3 } : { C: 74, A: 24, S: 2 };
/** 한 번 돌리는 값 (GP) — 별 셋이 나오는 레전드급(프랜차이즈 · 블랙 · 시그니처)만 비싸게 */
export const rollCost = (g: GradeId) => (isLegendGrade(g) && canHighPot(g) ? 500_000 : 50_000);

const KO: Record<string, string> = {
  CON: '컨택', POW: '파워', EYE: '선구', SPD: '주루', DEF: '수비', ARM: '송구', BLK: '블로킹', FRM: '프레이밍', CS: '도루저지', GAP: '장타', ADJ: '대처',
  VEL: '구속', STF: '구위', BRK: '변화', CTL: '제구', STA: '체력', REC: '회복', MNT: '위기관리',
};
const S = (key: string, v: number): PotEffect => ({ scope: 'self', key, v });
const TB = (key: string, v: number): PotEffect => ({ scope: 'teamBat', key, v });
const TP = (key: string, v: number): PotEffect => ({ scope: 'teamPit', key, v });

/* ───────── 일반 잠재력 — 별명식 46종 ─────────
 * 효과 크기: 별 하나 = 자기 능력 +5 안팎 · 별 둘 = 자기 +8 + 보조 · 별 셋 = 자기 +4 안팎 + 팀 전체 작은 값 (레전드급 전용이 아니면 팀 몫 −1)
 * 이름은 일반적인 야구 별명 느낌으로 — 실존 선수의 유명한 별명 · 실제 구단 이름은 쓰지 않는다
 * 맨 앞 14종(contact … iron)은 예전 종류 그대로(레전드급 전용 잠재력 data/potentials.json 이 이 열쇠를 쓴다 — 효과도 그대로) */
type F = (code: string) => number;
interface KindDef {
  /** 받을 수 있는 선수 */
  who: (p: Player) => boolean;
  /** 어울림 — 클수록 잘 맞는다 (대표 능력치 값 기준) */
  fit: (f: F, p: Player) => number;
  names: [string, string, string];
  fx: [PotEffect[], PotEffect[], PotEffect[]];
}
const isBat = (p: Player) => p.pos !== 'P';
/** 주루 칸이 있는 타자 (포수 빼고) */
const isRun = (p: Player) => p.pos !== 'P' && p.face.some((x) => x.code === 'SPD');
/** 수비 · 송구 칸이 있는 야수 */
const isFld = (p: Player) => p.pos !== 'P' && p.pos !== 'C' && p.pos !== 'DH';
const isC = (p: Player) => p.pos === 'C';
const isDH = (p: Player) => p.pos === 'DH';
const isP = (p: Player) => p.pos === 'P';
const isSP = (p: Player) => p.pos === 'P' && p.role === 'SP';
const isRP = (p: Player) => p.pos === 'P' && p.role !== 'SP' && p.role !== 'CL';
const isCL = (p: Player) => p.pos === 'P' && p.role === 'CL';
/** 그 자리를 볼 수 있는 야수 (주 포지션 · 볼 수 있는 자리) */
const plays = (...ps: Pos[]) => (p: Player) => isFld(p) && (ps.includes(p.pos) || !!p.subPos?.some((x) => ps.includes(x)));
/** 주 포지션이면 어울림 +3 */
const main = (p: Player, ...ps: Pos[]) => (ps.includes(p.pos) ? 3 : 0);
const spread = (f: F, ...cs: string[]) => { const v = cs.map(f); return Math.max(...v) - Math.min(...v); };

const KINDS = {
  /* ── 예전 14종 (레전드급 전용 잠재력이 쓰는 열쇠 · 효과 그대로) ── */
  contact: { who: isBat, fit: (f) => f('CON'), names: ['안타 제조기', '타격 장인', '안타 연금술사'], fx: [[S('CON', 5)], [S('CON', 8), S('EYE', 2)], [S('CON', 4), TB('CON', 2)]] },
  power: { who: isBat, fit: (f) => f('POW'), names: ['장타 본능', '홈런 공장장', '홈런 군단장'], fx: [[S('POW', 5)], [S('POW', 8), S('CON', 2)], [S('POW', 4), TB('POW', 2)]] },
  speed: { who: isRun, fit: (f) => f('SPD'), names: ['번개 다리', '베이스 도둑', '발야구 전도사'], fx: [[S('SPD', 6)], [S('SPD', 9), S('DEF', 2)], [S('SPD', 4), TB('SPD', 3)]] },
  eye: { who: isBat, fit: (f) => f('EYE'), names: ['매의 눈', '선구안의 달인', '출루 바이러스'], fx: [[S('EYE', 6)], [S('EYE', 8), S('CON', 3)], [S('EYE', 4), TB('EYE', 3)]] },
  clutch: { who: isBat, fit: (f) => (f('CON') + f('POW')) / 2 - 2, names: ['찬스의 사나이', '클러치 히터', '역전 드라마 작가'], fx: [[S('CON', 3), S('POW', 3)], [S('CON', 5), S('POW', 5)], [S('CON', 3), S('POW', 3), TB('CON', 1), TB('POW', 1)]] },
  defense: { who: isFld, fit: (f) => f('DEF'), names: ['단단한 글러브', '수비 요정', '수비 지휘관'], fx: [[S('DEF', 6)], [S('DEF', 8), S('ARM', 4)], [S('DEF', 4), TB('DEF', 3)]] },
  catcher: { who: isC, fit: (f) => (f('BLK') + f('FRM') + f('CS')) / 3 + 2, names: ['든든한 안방', '안방 사령관', '투수 조련사'], fx: [[S('BLK', 5), S('FRM', 3)], [S('FRM', 7), S('CS', 5)], [S('FRM', 4), TP('CTL', 2), TP('MNT', 2)]] },
  allround: {
    who: isRun, fit: (f) => (f('CON') + f('POW') + f('SPD')) / 3 - spread(f, 'CON', 'POW', 'SPD') * 0.25 + 2, names: ['팔방미인', '호타준족', '5툴 플레이어'],
    fx: [[S('CON', 3), S('SPD', 3)], [S('CON', 5), S('POW', 3), S('SPD', 3)], [S('CON', 2), S('POW', 2), S('SPD', 2), TB('CON', 1), TB('POW', 1), TB('SPD', 1)]],
  },
  ace: { who: isP, fit: (f) => f('STF'), names: ['묵직한 공', '에이스 본능', '마운드의 지배자'], fx: [[S('STF', 5)], [S('STF', 6), S('MNT', 4)], [S('STF', 4), TP('MNT', 3)]] },
  fire: { who: isP, fit: (f) => f('VEL'), names: ['광속구', '불꽃 직구', '용광로 마운드'], fx: [[S('VEL', 5)], [S('VEL', 7), S('STF', 3)], [S('VEL', 4), TP('VEL', 2)]] },
  control: { who: isP, fit: (f) => f('CTL'), names: ['칼제구', '핀포인트', '제구의 신'], fx: [[S('CTL', 6)], [S('CTL', 8), S('MNT', 2)], [S('CTL', 4), TP('CTL', 3)]] },
  breaking: { who: isP, fit: (f) => f('BRK'), names: ['예리한 변화구', '마구 장인', '변화구 박물관'], fx: [[S('BRK', 6)], [S('BRK', 8), S('STF', 2)], [S('BRK', 4), TP('BRK', 3)]] },
  closer: { who: isCL, fit: (f) => f('MNT') + 3, names: ['강심장', '철벽 마무리', '뒷문 자물쇠'], fx: [[S('MNT', 6)], [S('MNT', 8), S('VEL', 3)], [S('MNT', 4), TP('MNT', 3)]] },
  iron: { who: isSP, fit: (f) => f('STA'), names: ['철완', '이닝이터', '마운드의 대들보'], fx: [[S('STA', 7)], [S('STA', 9), S('MNT', 2)], [S('STA', 4), TP('STA', 3)]] },

  /* ── 타자 — 누구나 (컨택 · 파워 · 선구) ── */
  gap: { who: isBat, fit: (f) => f('POW') * 0.6 + f('CON') * 0.4 - 1, names: ['갭 히터', '외야 가르기 명수', '타선의 화약고'], fx: [[S('POW', 4), S('CON', 2)], [S('POW', 6), S('CON', 4)], [S('POW', 3), S('CON', 2), TB('POW', 1), TB('CON', 1)]] },
  cleanup: { who: isBat, fit: (f) => f('POW') * 0.7 + f('EYE') * 0.3 - 1, names: ['중심 타자', '4번 타자의 무게', '타선의 심장'], fx: [[S('POW', 4), S('EYE', 2)], [S('POW', 7), S('EYE', 3)], [S('POW', 3), S('EYE', 2), TB('POW', 2)]] },
  walkoff: { who: isBat, fit: (f) => (f('POW') + f('EYE')) / 2 - 2, names: ['9회의 남자', '끝내기 전문가', '게임 체인저'], fx: [[S('POW', 3), S('EYE', 3)], [S('POW', 5), S('EYE', 5)], [S('POW', 3), S('EYE', 3), TB('POW', 1), TB('EYE', 1)]] },
  smallball: { who: isBat, fit: (f) => (f('CON') + f('EYE')) / 2 - 3, names: ['번트의 정석', '감독의 비밀 병기', '작전 야구의 두뇌'], fx: [[S('CON', 3), S('EYE', 3)], [S('CON', 5), S('EYE', 5)], [S('CON', 2), S('EYE', 2), TB('CON', 1), TB('EYE', 1)]] },
  /* ── 발 있는 타자 ── */
  leadoff: { who: isRun, fit: (f) => (f('EYE') + f('SPD')) / 2 - 1, names: ['출루 첨병', '1번 타자 본능', '공격의 물꼬'], fx: [[S('EYE', 3), S('SPD', 3)], [S('EYE', 6), S('SPD', 4)], [S('EYE', 3), S('SPD', 3), TB('EYE', 1), TB('SPD', 1)]] },
  hitstreak: { who: isRun, fit: (f) => f('CON') * 0.7 + f('SPD') * 0.3 - 1, names: ['멀티히트 단골', '연속 안타 머신', '안타 도미노'], fx: [[S('CON', 4), S('SPD', 2)], [S('CON', 8), S('SPD', 2)], [S('CON', 4), TB('CON', 2), TB('SPD', 1)]] },
  steal: { who: isRun, fit: (f) => f('SPD') * 0.8 + f('EYE') * 0.2 - 1, names: ['스타트의 귀재', '그린라이트 보유자', '누상의 무법자'], fx: [[S('SPD', 4), S('EYE', 2)], [S('SPD', 7), S('EYE', 3)], [S('SPD', 3), S('EYE', 2), TB('SPD', 2)]] },
  /* ── 야수 · 포지션 ── */
  arm: { who: isFld, fit: (f) => f('ARM'), names: ['강한 어깨', '레이저 송구', '송구의 교과서'], fx: [[S('ARM', 6)], [S('ARM', 8), S('DEF', 3)], [S('ARM', 4), TB('ARM', 3)]] },
  shortstop: { who: plays('SS'), fit: (f, p) => f('DEF') * 0.7 + f('SPD') * 0.3 + main(p, 'SS'), names: ['부드러운 손', '그라운드의 춤꾼', '내야 사령관'], fx: [[S('DEF', 4), S('SPD', 2)], [S('DEF', 7), S('SPD', 3)], [S('DEF', 3), S('SPD', 2), TB('DEF', 2)]] },
  keystone: { who: plays('2B'), fit: (f, p) => f('DEF') * 0.7 + f('CON') * 0.3 + main(p, '2B'), names: ['키스톤 파트너', '병살 콤비의 핵', '2루의 수호성'], fx: [[S('DEF', 4), S('CON', 2)], [S('DEF', 6), S('CON', 4)], [S('DEF', 3), S('CON', 2), TB('DEF', 1), TB('CON', 1)]] },
  hotcorner: { who: plays('3B'), fit: (f, p) => f('ARM') * 0.6 + f('DEF') * 0.4 + main(p, '3B'), names: ['핫코너 파수꾼', '총알 타구 잡이', '핫코너의 주인'], fx: [[S('ARM', 4), S('DEF', 2)], [S('ARM', 7), S('DEF', 3)], [S('ARM', 3), S('DEF', 2), TB('ARM', 2)]] },
  firstbase: { who: plays('1B'), fit: (f, p) => f('POW') * 0.6 + f('DEF') * 0.4 + main(p, '1B'), names: ['넓은 미트', '1루 거포', '내야의 닻'], fx: [[S('DEF', 3), S('POW', 3)], [S('POW', 6), S('DEF', 4)], [S('POW', 3), S('DEF', 2), TB('POW', 1), TB('DEF', 1)]] },
  center: { who: plays('CF'), fit: (f, p) => f('SPD') * 0.6 + f('DEF') * 0.4 + main(p, 'CF'), names: ['외야 레이더', '그물망 수비', '외야 사령관'], fx: [[S('SPD', 4), S('DEF', 2)], [S('SPD', 6), S('DEF', 4)], [S('SPD', 3), S('DEF', 2), TB('SPD', 1), TB('DEF', 1)]] },
  corner: { who: plays('LF', 'RF'), fit: (f, p) => f('ARM') * 0.6 + f('POW') * 0.4 + main(p, 'LF', 'RF'), names: ['강견 외야수', '보살왕', '외야의 대포'], fx: [[S('ARM', 4), S('POW', 2)], [S('ARM', 6), S('POW', 4)], [S('ARM', 3), S('POW', 2), TB('ARM', 2)]] },
  utility: {
    who: (p) => isFld(p) && (p.subPos?.length ?? 0) >= 2, fit: (f, p) => (f('DEF') + f('CON')) / 2 + (p.subPos?.length ?? 0), names: ['멀티 플레이어', '만능 열쇠', '팀의 조커'],
    fx: [[S('DEF', 3), S('CON', 3)], [S('DEF', 5), S('CON', 3), S('SPD', 2)], [S('DEF', 2), S('CON', 2), TB('DEF', 1), TB('CON', 1), TB('SPD', 1)]],
  },
  /* ── 포수 ── */
  framer: { who: isC, fit: (f) => f('FRM'), names: ['프레이밍 박사', '스트라이크 도둑', '스트라이크 존 설계자'], fx: [[S('FRM', 6)], [S('FRM', 8), S('BLK', 3)], [S('FRM', 4), TP('CTL', 3)]] },
  blocker: { who: isC, fit: (f) => f('BLK'), names: ['온몸 블로킹', '안방의 벽', '안방 요새'], fx: [[S('BLK', 6)], [S('BLK', 8), S('FRM', 3)], [S('BLK', 4), TP('BRK', 3)]] },
  gunner: { who: isC, fit: (f) => f('CS'), names: ['도루 저격수', '총알 송구', '누상 봉쇄령'], fx: [[S('CS', 6)], [S('CS', 8), S('BLK', 2)], [S('CS', 4), TP('MNT', 3)]] },
  slugCatcher: { who: isC, fit: (f) => f('POW') + 1, names: ['공격형 포수', '거포 포수', '안방의 한 방'], fx: [[S('POW', 4), S('FRM', 2)], [S('POW', 7), S('FRM', 3)], [S('POW', 3), S('FRM', 2), TB('POW', 2)]] },
  /* ── 지명타자 ── */
  dhPower: { who: isDH, fit: (f) => f('GAP') + 1, names: ['한 방 전문', '장타 스페셜리스트', '타석의 폭군'], fx: [[S('GAP', 4), S('POW', 2)], [S('GAP', 7), S('POW', 3)], [S('GAP', 3), S('POW', 2), TB('POW', 2)]] },
  dhRead: { who: isDH, fit: (f) => f('ADJ'), names: ['노림수 타자', '수 싸움의 달인', '투수 공략 연구소'], fx: [[S('ADJ', 6)], [S('ADJ', 8), S('EYE', 3)], [S('ADJ', 4), TB('CON', 1), TB('EYE', 1)]] },
  /* ── 투수 — 누구나 ── */
  strikeout: { who: isP, fit: (f) => f('STF') * 0.6 + f('BRK') * 0.4 - 1, names: ['삼진 사냥꾼', '탈삼진 머신', '삼진 폭풍'], fx: [[S('STF', 4), S('BRK', 2)], [S('STF', 7), S('BRK', 3)], [S('STF', 3), S('BRK', 2), TP('STF', 2)]] },
  grounder: { who: isP, fit: (f) => f('CTL') * 0.6 + f('BRK') * 0.4 - 2, names: ['땅볼 유도형', '병살 유도 전문가', '타구 조종사'], fx: [[S('CTL', 4), S('BRK', 2)], [S('CTL', 6), S('BRK', 4)], [S('CTL', 3), S('BRK', 2), TP('CTL', 2)]] },
  tempo: { who: isP, fit: (f) => f('CTL') * 0.6 + f('MNT') * 0.4 - 2 + (f('VEL') < 55 ? 4 : 0), names: ['완급 조절', '타이밍 파괴자', '수읽기 9단'], fx: [[S('CTL', 4), S('MNT', 2)], [S('CTL', 7), S('MNT', 3)], [S('CTL', 3), S('MNT', 2), TP('MNT', 2)]] },
  heavy: { who: isP, fit: (f) => (f('VEL') + f('STF')) / 2 - 1, names: ['힘으로 승부', '정면 승부사', '마운드의 불도저'], fx: [[S('VEL', 3), S('STF', 3)], [S('VEL', 5), S('STF', 5)], [S('VEL', 3), S('STF', 3), TP('VEL', 1), TP('STF', 1)]] },
  lefty: { who: (p) => isP(p) && p.throws === 'L', fit: (f) => (f('BRK') + f('CTL')) / 2 + 1, names: ['까다로운 좌완', '좌타자 킬러', '사우스포 제왕'], fx: [[S('BRK', 3), S('CTL', 3)], [S('BRK', 5), S('CTL', 5)], [S('BRK', 3), S('CTL', 3), TP('BRK', 1), TP('CTL', 1)]] },
  /* ── 선발 ── */
  bigGame: { who: isSP, fit: (f) => (f('MNT') + f('STF')) / 2, names: ['큰 경기 체질', '빅게임 피처', '큰 무대의 주인공'], fx: [[S('MNT', 3), S('STF', 3)], [S('MNT', 5), S('STF', 5)], [S('MNT', 3), S('STF', 3), TP('MNT', 1), TP('STF', 1)]] },
  steady: { who: isSP, fit: (f) => (f('STA') + f('CTL')) / 2, names: ['꾸준한 선발', '6이닝 보증 수표', '로테이션의 기둥'], fx: [[S('STA', 4), S('CTL', 2)], [S('STA', 6), S('CTL', 4)], [S('STA', 3), S('CTL', 2), TP('STA', 2)]] },
  /* ── 불펜 ── */
  setup: { who: isRP, fit: (f) => (f('REC') + f('MNT')) / 2 + 1, names: ['믿을맨', '홀드 수집가', '불펜의 엔진'], fx: [[S('REC', 4), S('MNT', 2)], [S('REC', 6), S('MNT', 4)], [S('REC', 3), S('MNT', 2), TP('REC', 2)]] },
  rubber: { who: (p) => isRP(p) || isCL(p), fit: (f) => f('REC'), names: ['연투 체질', '강철 어깨', '불펜 발전소'], fx: [[S('REC', 7)], [S('REC', 9), S('MNT', 2)], [S('REC', 4), TP('REC', 3)]] },
  fireman: { who: (p) => isP(p) && p.role !== 'CL', fit: (f) => f('MNT'), names: ['위기 탈출', '불 끄는 소방수', '평정심의 화신'], fx: [[S('MNT', 4), S('CTL', 2)], [S('MNT', 7), S('CTL', 3)], [S('MNT', 3), S('CTL', 2), TP('MNT', 2)]] },
  /* ── 마무리 ── */
  lastOut: { who: isCL, fit: (f) => (f('VEL') + f('MNT')) / 2 + 2, names: ['9회의 강속구', '세이브 사냥꾼', '경기 종료 버튼'], fx: [[S('VEL', 4), S('MNT', 2)], [S('VEL', 6), S('MNT', 4)], [S('VEL', 3), S('MNT', 2), TP('VEL', 2)]] },
} satisfies Record<string, KindDef>;
export type Kind = keyof typeof KINDS;
const KIND_IDS = Object.keys(KINDS) as Kind[];
/** 일반 잠재력 종류 수 */
export const KIND_COUNT = KIND_IDS.length;
const isKind = (k: unknown): k is Kind => typeof k === 'string' && Object.prototype.hasOwnProperty.call(KINDS, k);

/** 유형 설명 (별 셋 효과 글에 쓴다) */
const scopeKo = (s: PotScope) => (s === 'teamBat' ? '팀 타자 전원' : s === 'teamPit' ? '팀 투수 전원' : '');
export function fxText(fx: PotEffect[]) {
  const self = fx.filter((x) => x.scope === 'self').map((x) => `${KO[x.key] ?? x.key} +${x.v}`);
  const team = fx.filter((x) => x.scope !== 'self');
  const out = self.length ? [self.join(' · ')] : [];
  for (const sc of ['teamBat', 'teamPit'] as const) {
    const xs = team.filter((x) => x.scope === sc);
    if (xs.length) out.push(`${scopeKo(sc)} ${xs.map((x) => `${KO[x.key] ?? x.key} +${x.v}`).join(' · ')}`);
  }
  return out.join(' / ');
}

/** 예전 규칙 — 가장 두드러진 능력 하나로 고른 종류 (종류가 저장되지 않은 예전 잠재력) */
export function legacyKindOf(p: Player): Kind {
  if (p.pos === 'P') {
    if (p.role === 'CL') return 'closer';
    const top = [...p.face].sort((a, b) => b.v - a.v)[0]?.code;
    return top === 'VEL' ? 'fire' : top === 'CTL' ? 'control' : top === 'BRK' ? 'breaking' : top === 'STA' || top === 'REC' ? 'iron' : top === 'MNT' ? 'closer' : 'ace';
  }
  if (p.pos === 'C') return 'catcher';
  const f = (c: string) => p.face.find((x) => x.code === c)?.v ?? 0;
  const top = [...p.face].filter((x) => ['CON', 'POW', 'EYE', 'SPD', 'DEF'].includes(x.code)).sort((a, b) => b.v - a.v)[0]?.code;
  if (f('POW') >= 70 && f('SPD') >= 70) return 'allround';
  return top === 'POW' ? 'power' : top === 'CON' ? 'contact' : top === 'EYE' ? 'eye' : top === 'SPD' ? 'speed' : top === 'DEF' ? 'defense' : 'clutch';
}
const personOf = (id: string) => id.replace(/~\d{4}$/, '');
const LEG = LEGEND as unknown as Record<string, [string, Kind, string]>;
/** 레전드급 전용 잠재력 [별명, 종류, 별 셋 이름] (레전드급 카드 · 데이터에 있는 선수만) */
const legendOf = (p: Player, grade: GradeId) => (isLegendGrade(grade) ? LEG[personOf(p.id)] : undefined);

/** 이 선수에게 나올 수 있는 종류 — 어울리는 순 3~6가지와 무게(확률 비율). 레전드급 전용은 하나 */
export function potKindsOf(p: Player, grade: GradeId): { kind: Kind; w: number }[] {
  const leg = legendOf(p, grade);
  if (leg) return [{ kind: leg[1], w: 1 }];
  const f: F = (c) => p.face.find((x) => x.code === c)?.v ?? 0;
  const all = KIND_IDS.filter((k) => KINDS[k].who(p)).map((kind, i) => ({ kind, fit: KINDS[kind].fit(f, p), i }));
  if (!all.length) return [{ kind: legacyKindOf(p), w: 1 }];
  all.sort((a, b) => b.fit - a.fit || a.i - b.i);
  const top = all[0].fit;
  return all.filter((x, i) => i < 3 || (i < 6 && x.fit >= top - 10)).map((x) => ({ kind: x.kind, w: Math.max(1, Math.round((x.fit - (top - 12)) * 10) / 10) }));
}

/** 한 종류 · 한 등급의 잠재력 */
export function potAt(p: Player, grade: GradeId, kind: Kind, tier: PotTier): Potential {
  const def = KINDS[kind] ?? KINDS[legacyKindOf(p)];
  const i = TIER_I[tier];
  const fx = def.fx[i];
  const leg = legendOf(p, grade);
  if (leg && leg[1] === kind) {
    const [nick, , best] = leg;
    if (tier === 'C') return { tier, kind, name: `${nick} — ${def.names[0]}`, desc: `${nick}다운 한 방이 살아나요.`, fx };
    if (tier === 'A') return { tier, kind, name: `${nick} 각성`, desc: `전성기의 ${nick}가 돌아와요.`, fx };
    return { tier, kind, name: best, desc: `${best} — 그 기운이 팀 전체로 번져요.`, fx };
  }
  if (tier === 'C') return { tier, kind, name: def.names[0], desc: '몸에 익은 장점이에요.', fx };
  if (tier === 'A') return { tier, kind, name: def.names[1], desc: '숨어 있던 재능이 깨어나요.', fx };
  return { tier, kind, name: def.names[2], desc: '한 사람의 기운이 팀 전체로 번져요.', fx: fx.map((x) => (x.scope === 'self' ? x : { ...x, v: Math.max(1, x.v - 1) })) };
}

/* ───────── 저장 ───────── */
interface PotCard { pick: number; rolls: number; k?: string }
interface PotSave { v: 1; cards: Record<string, PotCard>; sOn?: string[] }
const KEY = 'bb.pot';
const listeners = new Set<() => void>();
let cache: PotSave | null = null;
let version = 0;
function read(): PotSave {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as PotSave) : null;
    if (v && v.v === 1 && v.cards && typeof v.cards === 'object') return (cache = v);
  } catch { /* 새로 */ }
  return (cache = { v: 1, cards: {} });
}
function write(v: PotSave) {
  cache = v;
  version++;
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* 이번 방문만 */ }
  listeners.forEach((l) => l());
}
export const potVersion = () => version;
export function subscribePot(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
export const rollsOf = (cardId: string) => read().cards[cardId]?.rolls ?? 0;

type CardKey = Pick<CardInst, 'id' | 'grade'>;
/** 저장된 칸 → 잠재력 (자격 없는 등급의 별 둘 · 셋은 같은 종류의 별 하나로) */
function fromEntry(card: CardKey, p: Player, e: PotCard | null | undefined): Potential | null {
  if (!e || !(e.pick >= 0)) return null;
  const tier: PotTier = canHighPot(card.grade) ? TIERS[Math.min(2, Math.floor(e.pick))] : 'C';
  const leg = legendOf(p, card.grade);
  const kind: Kind = leg ? leg[1] : isKind(e.k) ? e.k : legacyKindOf(p);
  return potAt(p, card.grade, kind, tier);
}
const tierOfEntry = (card: CardKey, e: PotCard | null | undefined): PotTier | null =>
  !e || !(e.pick >= 0) ? null : canHighPot(card.grade) ? TIERS[Math.min(2, Math.floor(e.pick))] : 'C';

/** 카드에 켜진 잠재력 (없으면 null) — 등급 자격까지 따진 값. 별 셋이 엔트리에서 꺼졌는지는 teamPotential 이 따진다 */
export function potOf(card: CardKey, p: Player): Potential | null { return fromEntry(card, p, read().cards[card.id]); }
/** 예전 이름 (game/cardBonus) */
export const activePotential = potOf;
/** 카드에 켜진 잠재력 등급 (없으면 null) */
export const potTierOf = (card: CardKey): PotTier | null => tierOfEntry(card, read().cards[card.id]);

/**
 * 돌리기 — 등급(확률)과 종류(어울림 무게)를 고르고 저장한다 (값은 pay 가 낸다 · 못 내면 null).
 * 별 둘 · 셋 자격이 없는 카드는 늘 별 하나 — 종류만 다시 고른다.
 */
export function rollPotential(card: CardKey, p: Player, pay: (gp: number) => boolean, rnd: () => number = rand): { pick: number; kind: Kind } | null {
  if (!pay(rollCost(card.grade))) return null;
  const o = oddsOf(card.grade);
  const r = rnd() * 100;
  const pick = r < o.S ? 2 : r < o.S + o.A ? 1 : 0;
  const pool = potKindsOf(p, card.grade);
  let x = rnd() * pool.reduce((a, b) => a + b.w, 0);
  const kind = pool.find((c) => (x -= c.w) < 0)?.kind ?? pool[pool.length - 1].kind;
  const v = read();
  const prev = v.cards[card.id];
  write({ ...v, cards: { ...v.cards, [card.id]: { pick, rolls: (prev?.rolls ?? 0) + 1, k: kind } } });
  return { pick, kind };
}
function rand() {
  try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; } catch { return Math.random(); }
}
/** 더 돌려도 바뀔 게 없나 — 종류가 하나뿐이고(레전드급 전용) 별 하나만 나오는 카드가 이미 열렸을 때 */
export const rollFixed = (card: CardKey, p: Player) => !canHighPot(card.grade) && potKindsOf(p, card.grade).length === 1 && !!read().cards[card.id];

/* ───────── 별 셋 — 1군 엔트리에서 2명만 ───────── */
/** 잠재력 셈에 넣는 카드 — starter: 팀 종합에 드는 선발 10명(타자 9 + 1선발) */
export interface PotUnit { card: CardKey; player: Player; starter?: boolean }
export interface SRow {
  card: CardKey;
  player: Player;
  pot: Potential;
  on: boolean;
  /** 감독이 고른 것 */
  chosen: boolean;
  /** 켜면 팀 종합이 오르는 몫 (반올림 전 — 라인업 evaluate 의 raw 와 같은 셈) */
  ovr: number;
  /** 받는 능력치 합 (자기 + 팀 몫 × 받는 인원) */
  sum: number;
}
export interface SPlan {
  /** 엔트리의 별 셋 (엔트리 순) */
  rows: SRow[];
  /** 고를 게 있나 (3명 이상) */
  choose: boolean;
  /** 감독이 아직 안 골랐나 (팀 종합이 많이 오르는 2명이 자동으로) */
  auto: boolean;
}
const sumOf = (fx: PotEffect[], sc: PotScope) => fx.reduce((a, x) => a + (x.scope === sc ? x.v : 0), 0);
const faceN = (p: Player) => p.face.length || 6;
/** 감독이 켠 별 셋 (먼저 고른 것이 앞) */
export const sChosen = (): string[] => [...(read().sOn ?? [])];
/** 켤 별 셋 저장 — null 이면 자동(팀 종합이 많이 오르는 2명) */
export function setSChosen(ids: string[] | null) {
  const v = read();
  const next: PotSave = { ...v };
  if (ids && ids.length) next.sOn = [...new Set(ids)].slice(0, S_MAX); else delete next.sOn;
  write(next);
}
/** 엔트리의 별 셋 — 누가 켜지나 (감독이 고른 것 먼저, 모자라면 팀 종합이 많이 오르는 순) */
export function sPlan(entry: PotUnit[]): SPlan {
  const all = entry.map((u) => ({ u, pot: potOf(u.card, u.player) })).filter((x): x is { u: PotUnit; pot: Potential } => x.pot?.tier === 'S');
  const starters = entry.filter((u) => u.starter);
  const nSt = starters.length || 1;
  const nBat = entry.filter((u) => u.player.pos !== 'P').length;
  const nPit = entry.length - nBat;
  const rows: SRow[] = all.map(({ u, pot }) => {
    const self = sumOf(pot.fx, 'self');
    const tb = sumOf(pot.fx, 'teamBat');
    const tpv = sumOf(pot.fx, 'teamPit');
    let o = u.starter ? self / faceN(u.player) : 0;
    for (const s of starters) o += (s.player.pos === 'P' ? tpv : tb) / faceN(s.player);
    return { card: u.card, player: u.player, pot, on: true, chosen: false, ovr: o / nSt, sum: self + tb * nBat + tpv * nPit };
  });
  if (rows.length <= S_MAX) return { rows, choose: false, auto: false };
  const ids = new Set(rows.map((r) => r.card.id));
  const picked = sChosen().filter((id) => ids.has(id)).slice(0, S_MAX);
  const rank = rows.map((r, i) => ({ r, i })).sort((a, b) => b.r.ovr - a.r.ovr || b.r.sum - a.r.sum || a.i - b.i).map((x) => x.r.card.id);
  const on = new Set(picked);
  for (const id of rank) { if (on.size >= S_MAX) break; on.add(id); }
  for (const r of rows) { r.on = on.has(r.card.id); r.chosen = picked.includes(r.card.id); }
  return { rows, choose: true, auto: picked.length === 0 };
}

/* ───────── 팀에 모으기 — 라인업 계산(screens/lineup/calc) · 경기 엔진(season/rosters) 이 같이 쓴다 ───────── */
export type FaceFx = Record<string, number>;
export interface TeamPot {
  /** 카드 id → 자기 몫 (앞면 코드별) */
  self: Map<string, FaceFx>;
  /** 별 셋이 팀 타자 전원 · 투수 전원에게 주는 몫 */
  bat: FaceFx;
  pit: FaceFx;
  /** 꺼진 별 셋 (엔트리에서 3번째부터 · 벤치) — 효과 없음 */
  off: Set<string>;
}
const addTo = (o: FaceFx, k: string, v: number) => { o[k] = (o[k] ?? 0) + v; };
/** 엔트리 카드들의 켜진 잠재력을 모은다 — 팀 몫은 엔트리에 선 카드만, 벤치는 자기 몫만. 별 셋은 엔트리에서 켜진 2명만(벤치는 꺼짐) */
export function teamPotential(entry: PotUnit[], bench: PotUnit[] = []): TeamPot {
  const plan = sPlan(entry);
  const tp: TeamPot = { self: new Map(), bat: {}, pit: {}, off: new Set(plan.rows.filter((r) => !r.on).map((r) => r.card.id)) };
  const take = (u: PotUnit, team: boolean) => {
    const pot = potOf(u.card, u.player);
    if (!pot) return;
    if (pot.tier === 'S' && (!team || tp.off.has(u.card.id))) { tp.off.add(u.card.id); return; }
    for (const x of pot.fx) {
      if (x.scope === 'self') {
        const o = tp.self.get(u.card.id) ?? {};
        addTo(o, x.key, x.v);
        tp.self.set(u.card.id, o);
      } else if (team) addTo(x.scope === 'teamBat' ? tp.bat : tp.pit, x.key, x.v);
    }
  };
  entry.forEach((u) => take(u, true));
  bench.forEach((u) => take(u, false));
  return tp;
}
/** 이 카드가 받는 잠재력 — 자기 몫 + 팀 몫 (앞면 코드별) */
export function potFaceOf(tp: TeamPot, cardId: string, isP: boolean): FaceFx {
  const out: FaceFx = { ...(tp.self.get(cardId) ?? {}) };
  for (const [k, v] of Object.entries(isP ? tp.pit : tp.bat)) addTo(out, k, v);
  return out;
}
/** 팀 종합에 더하는 값 — 받는 잠재력 합 ÷ 4 (훈련과 같은 몫) */
export const potOvrBonus = (f: FaceFx) => Object.values(f).reduce((a, b) => a + b, 0) / 4;

/** 앞면 코드 → 경기 엔진 보너스 칸 (game/training 의 훈련 몫과 같은 길) */
const ENGINE_OF: Record<string, [BatKey | PitKey, number][]> = {
  CON: [['con', 1]], POW: [['pow', 1]], EYE: [['eye', 1]], SPD: [['spd', 1], ['stl', 0.5]], DEF: [['def', 1]], ARM: [['arm', 1]],
  BLK: [['def', 1]], FRM: [['def', 0.8]], CS: [['arm', 1]], GAP: [['gap', 1], ['pow', 0.3]], ADJ: [['con', 0.5], ['eye', 0.5]],
  VEL: [['vel', 1]], STF: [['stf', 1]], BRK: [['brk', 1]], CTL: [['ctl', 1]], STA: [['sta', 1]], REC: [['rec', 1]], MNT: [['mnt', 1]],
};
const BAT_K = new Set<string>(['con', 'pow', 'gap', 'eye', 'spd', 'stl', 'def', 'arm']);
/** 받는 잠재력 → 엔진 보너스 { k, v } — 타자는 타자 칸, 투수는 투수 칸만 */
export function potEngineFx(f: FaceFx, isP: boolean): { k: BatKey | PitKey; v: number }[] {
  const acc = new Map<BatKey | PitKey, number>();
  for (const [code, g] of Object.entries(f)) {
    if (!g) continue;
    for (const [k, w] of ENGINE_OF[code] ?? []) {
      if (BAT_K.has(k) === isP) continue;
      acc.set(k, (acc.get(k) ?? 0) + g * w);
    }
  }
  return [...acc].map(([k, v]) => ({ k, v: Math.round(v * 10) / 10 }));
}

/* ───────── 연출 중 감추기 — 돌리는 동안 다른 화면(선수 머리 등)에는 전의 잠재력을 보인다 ───────── */
const hold = new Map<string, PotCard | null>();
const ping = () => { version++; listeners.forEach((l) => l()); };
export function holdShown(cardId: string) { hold.set(cardId, read().cards[cardId] ?? null); ping(); }
export function releaseShown(cardId: string) { if (hold.delete(cardId)) ping(); }
const shownEntry = (cardId: string) => (hold.has(cardId) ? hold.get(cardId) : read().cards[cardId]);
/** 화면에 보일 잠재력 — 연출 중이면 전의 것 */
export const shownPotOf = (card: CardKey, p: Player) => fromEntry(card, p, shownEntry(card.id));
/** 화면에 보일 잠재력 등급 — 연출 중이면 전의 것 */
export const shownTierOf = (card: CardKey): PotTier | null => tierOfEntry(card, shownEntry(card.id));
/** 열린 잠재력이 있나 (화면 — 연출 중이면 전의 것) */
export const hasPotential = (cardId: string) => !!shownEntry(cardId);
