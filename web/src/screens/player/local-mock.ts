// 선수 상세 화면 전용 목업 — game/mock 값을 이어 붙여 '선수 한 명'을 FM 처럼 깊게 보여 줄 데이터를 만든다.
// 서버·엔진이 붙으면 같은 모양으로 갈아 끼운다: 숨은 특성(15 §3) · 특성 효과(15 §4.2) · 폼(art/character/forms) ·
// 최근 10경기 · 부상 이력(15 §7) · 장비(05 원작충실 §13.3) · 강화(05 원작충실 §7.1~7.3).
// 값은 시드 난수라 매번 같다. 실제 선수·구단·브랜드 이름은 쓰지 않는다.

import { CARDS, LAST_MATCH, NEWS, PLAYERS, TEAMS, TODAY, WEATHER_TODAY, cardById, playerById, teamById } from '../../game/mock';
import { ENH_STEPS, PITY_STEP as INV_PITY_STEP, chanceAfter as invChanceAfter, enhGainTotal as invGainTotal, entryOf, isOwned, matClass, needFor, ownedCard } from '../../game/inventory';
import { GRADES } from '../../game/grades';
import { kboCard, kboCardsOf, parseViewId, personIdOf, playerOfKCard } from '../../game/kbo';
import type { AttrKey, CardInst, GradeId, Pitch, Player, WeatherKey } from '../../game/types';
import { makeBatForm, makePitchForm, pitchFormName, batFormName, batFormTags, pitchFormTags } from '../../art/character/forms';
import type { BatForm, BatPick, PitchForm, PitchPick } from '../../art/character/forms';
import { toSpec } from '../../art/PlayerArt';

/* ───────── 시드 난수 ───────── */
function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rng(seed: string) {
  let a = hashStr(seed) || 1;
  const next = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => {
    let u = 0, v = 0;
    while (u === 0) u = next();
    while (v === 0) v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return {
    next,
    gauss,
    range: (lo: number, hi: number) => lo + (hi - lo) * next(),
    int: (lo: number, hi: number) => Math.floor(lo + (hi - lo + 1) * next()),
    pick: <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)],
    chance: (p: number) => next() < p,
  };
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ───────── 카드 · 소유 ───────── */
/** 내 카드인가 — 보유 카드 저장소(game/inventory) */
export const isMine = (cardId: string) => isOwned(cardId);
const gradeRank = (g: GradeId) => GRADES[g].rank;

export interface Resolved {
  player: Player;
  /** 이 선수의 모든 카드 (높은 등급 먼저) */
  cards: CardInst[];
  /** 그중 내 카드 */
  mine: CardInst[];
  /** 지금 보는 카드 */
  card: CardInst;
  owned: boolean;
}

/** #/player/:id — 선수 id(p03) 또는 카드 id(c03) 둘 다 받는다. ?card= 로 카드를 고른다 */
export function resolvePlayer(id: string | undefined, cardQ: string | null): Resolved {
  // 실제 선수 — 한 사람(선수 ID)의 모든 카드(시즌별 · 수상 · 상징)를 모으고, 보는 카드의 시즌 능력치로 보여 준다
  const kid = id ? personIdOf(id) : null;
  if (kid) {
    const all = kboCardsOf(kid).map((k) => ownedCard(k.id) ?? cardById(k.id)!).filter(Boolean)
      .sort((a, b) => gradeRank(b.grade) - gradeRank(a.grade) || (b.year ?? 0) - (a.year ?? 0));
    const mine = all.filter((c) => isMine(c.id));
    const byId = id ? all.find((c) => c.id === id) : undefined;
    const viewYear = parseViewId(id!)?.[1];
    const want = (cardQ ? all.find((c) => c.id === cardQ) : undefined) ?? byId
      ?? mine.find((c) => playerById(c.playerId)?.real?.year === viewYear) ?? all.find((c) => playerById(c.playerId)?.real?.year === viewYear);
    const card = want ?? mine[0] ?? all[0];
    if (card) {
      const k = kboCard(card.id);
      const player = (k && playerOfKCard(k)) ?? playerById(card.playerId)!;
      return { player, cards: all, mine, card, owned: isMine(card.id) };
    }
  }
  const byCard = id ? cardById(id) : undefined;
  const player = (byCard ? playerById(byCard.playerId) : id ? playerById(id) : undefined) ?? playerById('p03') ?? PLAYERS[0];
  // 내 카드는 내 강화 · 레벨이 들어간 것으로
  const cards = CARDS.filter((c) => c.playerId === player.id).map((c) => ownedCard(c.id) ?? c).sort((a, b) => gradeRank(b.grade) - gradeRank(a.grade) || b.enhance - a.enhance);
  const mine = cards.filter((c) => isMine(c.id));
  const want = cardQ ? cards.find((c) => c.id === cardQ) : byCard;
  const card = want ?? mine[0] ?? cards[0] ?? CARDS[0];
  return { player, cards, mine, card, owned: isMine(card.id) };
}

/* ───────── 특성 (15 §4.2 — 엔진 파라미터를 바꾸는 습관) ───────── */
export type TraitCat = '타격' | '주루' | '수비' | '투구' | '덕아웃';
export interface TraitInfo { cat: TraitCat; effect: string; born?: boolean }

export const TRAIT_INFO: Record<string, TraitInfo> = {
  '초구 적극 공략': { cat: '타격', effect: '초구 스윙 ×1.6 · 초구 컨택 +3' },
  '기다리는 타자': { cat: '타격', effect: '볼넷 ×1.12 · 타석당 공 +0.35개' },
  '끈질긴 승부(커트 장인)': { cat: '타격', effect: '2스트라이크 파울 ×1.35 · 삼진 ×0.92' },
  '밀어치기 장인': { cat: '타격', effect: '바깥쪽 컨택 +4 · 수비 시프트에 강함' },
  '당겨치기 거포': { cat: '타격', effect: '당긴 뜬공 홈런 ×1.15', born: true },
  '직구 노림수': { cat: '타격', effect: '직구 상대 컨택·파워 +4 · 변화구 −3' },
  '로우볼 히터': { cat: '타격', effect: '낮은 공 컨택 +5 · 높은 공 −3', born: true },
  '하이볼 히터': { cat: '타격', effect: '높은 공 컨택 +5 · 낮은 공 −3', born: true },
  '배드볼 히터': { cat: '타격', effect: '볼에도 방망이 ×1.35 · 볼 컨택 +6', born: true },
  '풀스윙': { cat: '타격', effect: '파워 +3 · 삼진 회피 −5' },
  '기습 번트': { cat: '타격', effect: '기습 번트 성공 +8%p' },
  '찬스에 강한 타자': { cat: '타격', effect: '득점권에선 압박감 16 아래로 안 떨어짐', born: true },
  '도루 자주 시도': { cat: '주루', effect: '도루 시도 ×2' },
  '공격적 주루': { cat: '주루', effect: '한 베이스 더 ×1.5' },
  '헤드퍼스트 슬라이딩': { cat: '주루', effect: '접전 세이프 +4%p · 손가락 부상 ↑' },
  '강견 과시': { cat: '수비', effect: '홈 송구 ×1.6 · 보살 ×1.3 · 악송구도 ↑', born: true },
  '퀵스로잉': { cat: '수비', effect: '송구 동작 −0.15초' },
  '하이점프캐치': { cat: '수비', effect: '직선타 아웃 +5%p' },
  '몸 날리는 수비': { cat: '수비', effect: '다이빙 ×1.6 · 수비 범위 +3' },
  '펜스 플레이어': { cat: '수비', effect: '담장 앞 홈런 훔치기 10%' },
  '주자 킬러': { cat: '수비', effect: '도루 저지 +4%p · 상대 도루 시도 ×0.85' },
  '블로킹 마스터': { cat: '수비', effect: '폭투·포일 ×0.75' },
  '빠른 승부': { cat: '투구', effect: '볼넷 ×0.85 · 타석당 공 −0.4개' },
  '유인구 승부': { cat: '투구', effect: '헛스윙 유도 +3%p · 볼넷 조금 ↑' },
  '위기에 강한 강심장': { cat: '투구', effect: '득점권에선 압박감 16 아래로 안 떨어짐', born: true },
  '이닝이터': { cat: '투구', effect: '공 하나당 피로 −10%' },
  '고무팔': { cat: '투구', effect: '연투 부담 절반 · 회복 ×1.2', born: true },
  '철완': { cat: '투구', effect: '팔 부상 위험 ×0.6', born: true },
  '몸쪽 승부사': { cat: '투구', effect: '몸쪽 승부 +5%p · 사구 ×1.6' },
  '견제 장인': { cat: '투구', effect: '견제 ×1.5 · 주자 리드 폭 ×0.85' },
  '연패 스토퍼': { cat: '투구', effect: '팀 3연패 이상이면 +2', born: true },
  '1회 불안': { cat: '투구', effect: '1회 구위 −4', born: true },
  '직구 고집': { cat: '투구', effect: '직구 구사 +12%p', born: true },
  '멘토': { cat: '덕아웃', effect: '어린 선수 성장 ×1.05', born: true },
  '분위기 메이커': { cat: '덕아웃', effect: '라인업에 있으면 팀 전원 침착 +1', born: true },
};
export const traitInfo = (name: string): TraitInfo => TRAIT_INFO[name] ?? { cat: '타격', effect: '엔진 효과 준비 중' };

/* ───────── 성격 · 숨은 특성 (15 §3·§4.1) ───────── */
export const PERSONALITY_DESC: Record<string, string> = {
  '모범 시민': '구단이 가장 아끼는 유형. 사고를 안 친다.',
  '타고난 리더': '덕아웃의 중심. 주장감이다.',
  '완벽주의자': '자신에게 엄격하고 실수에 예민하다.',
  '큰 무대 체질': '가을에 더 빛난다.',
  '강철 멘탈': '끝내기 상황에서도 심박수가 안 오른다.',
  '다혈질': '판정 하나에 불이 붙는다.',
  '모범 프로': '훈련장에 제일 먼저 나온다.',
  '근성파': '진흙탕 승부일수록 강하다.',
  '의리파': '이 팀에서 은퇴하고 싶어 한다.',
  '야심가': '더 큰 무대, 더 큰 계약을 원한다.',
  '의욕파': '더 잘하고 싶어 안달이 났다.',
  '거친 승부사': '이기려면 거친 플레이도 서슴지 않는다.',
  '새가슴': '평소엔 잘하는데 중요한 순간 흔들린다.',
  '기분파': '터지면 못 막고, 식으면 한없이 식는다.',
  '게으른 천재': '재능만으로 버틴다. 정신 차리면 무섭다.',
  '낙천가': '져도 웃는다. 덕아웃이 밝아진다.',
  '느긋한 성격': '큰 욕심이 없다.',
  '스타 의식': '내가 팀의 얼굴이라고 생각한다.',
  '성실파': '묵묵히 제 할 일을 한다.',
  '승부욕 강함': '지는 걸 싫어한다.',
  '팀 플레이어': '팀이 먼저다. 희생 작전도 웃으며 받는다.',
  '차분한 성격': '좀처럼 흥분하지 않는다.',
  '균형형': '두드러지는 성향이 없다.',
  '분위기 메이커': '라커룸 스피커는 늘 이 선수 차지다.',
  '의욕적': '더 잘하고 싶어 한다.',
};

export type HiddenKey = 'consistency' | 'bigGame' | 'pressure' | 'injuryProne';
export interface HiddenItem {
  key: HiddenKey;
  ko: string;
  /** 1~20 (10 = 보통) */
  v: number;
  word: string;
  /** 코치 평 */
  line: string;
  /** 드러났나 — 함께한 경기가 쌓이면 */
  revealed: boolean;
  /** 코치 확신 0~1 */
  conf: number;
  /** 아직이면 '몇 경기 더' */
  need?: string;
}

const HIDDEN_KO: Record<HiddenKey, string> = { consistency: '기복', bigGame: '큰 경기', pressure: '압박감', injuryProne: '부상 경향' };

function hiddenWord(k: HiddenKey, v: number): { word: string; line: string } {
  switch (k) {
    case 'consistency':
      return v >= 15 ? { word: '꾸준함', line: '매일 같은 타석을 만든다' }
        : v >= 9 ? { word: '보통', line: '좋은 날과 나쁜 날이 섞인다' }
        : v >= 6 ? { word: '기복 있음', line: '한 번 식으면 오래간다' }
        : { word: '기복 심함', line: '터지면 못 막고 식으면 한없이 식는다' };
    case 'bigGame':
      return v >= 16 ? { word: '큰 무대 체질', line: '가을에 더 빛난다' }
        : v >= 12 ? { word: '강한 편', line: '라이벌전에서 집중력이 오른다' }
        : v >= 8 ? { word: '보통', line: '경기 무게를 크게 타지 않는다' }
        : { word: '작아짐', line: '중요한 경기에서 표정이 굳는다' };
    case 'pressure':
      return v >= 16 ? { word: '강심장', line: '끝내기 타석에서도 심박수가 그대로다' }
        : v >= 12 ? { word: '침착함', line: '득점권에서 서두르지 않는다' }
        : v >= 7 ? { word: '보통', line: '큰 상황에서 조금 굳는다' }
        : { word: '새가슴', line: '만루에선 손이 먼저 나간다' };
    case 'injuryProne':
      return v >= 15 ? { word: '잔부상 잦음', line: '몸 관리를 신경 써야 할 선수다' }
        : v >= 8 ? { word: '보통', line: '큰 부상 없이 시즌을 보낸다' }
        : { word: '강철 몸', line: '잔부상 한 번 없이 시즌을 버틴다' };
  }
}

/** 성격 이름 → 숨은 값의 바닥·천장 (15 §4.1 판정 규칙을 거꾸로) */
const PERS_RULE: Record<string, Partial<Record<HiddenKey, [number, number]>>> = {
  '강철 멘탈': { pressure: [17, 20] },
  '큰 무대 체질': { bigGame: [17, 20], pressure: [15, 18] },
  '근성파': { pressure: [12, 16] },
  '새가슴': { pressure: [1, 4] },
  '기분파': { consistency: [1, 5] },
  '모범 프로': { consistency: [12, 17], injuryProne: [3, 9] },
  '모범 시민': { consistency: [13, 18] },
  '완벽주의자': { consistency: [11, 16] },
  '차분한 성격': { pressure: [11, 15], consistency: [11, 16] },
  '낙천가': { pressure: [12, 15] },
  '게으른 천재': { consistency: [3, 8], injuryProne: [11, 16] },
  '다혈질': { consistency: [4, 9] },
  '타고난 리더': { pressure: [12, 16], bigGame: [12, 16] },
  '승부욕 강함': { bigGame: [11, 15] },
};

export function hiddenOf(p: Player, owned: boolean, mineCards: number) {
  const r = rng('hidden:' + p.id);
  const base = (): number => clamp(Math.round(10 + r.gauss() * 3), 2, 19);
  const v: Record<HiddenKey, number> = { consistency: base(), bigGame: base(), pressure: base(), injuryProne: base() };
  const rule = PERS_RULE[p.personality] ?? {};
  (Object.keys(rule) as HiddenKey[]).forEach((k) => {
    const [lo, hi] = rule[k]!;
    if (v[k] < lo || v[k] > hi) v[k] = clamp(lo + Math.round(r.next() * (hi - lo)), lo, hi);
  });
  if (p.traits.some((t) => t.includes('강심장') || t.includes('찬스에 강한'))) v.pressure = Math.max(v.pressure, 14);
  if (p.traits.includes('철완')) v.injuryProne = Math.min(v.injuryProne, 6);
  // 함께한 경기 — 내 구단 선수는 한 시즌(71경기), 다른 구단 카드는 카드를 가진 뒤 경기만
  const games = !owned ? 0 : p.teamId === 'dj' ? 71 : 18 + mineCards * 6;
  // 확신도: 30경기 50% · 100경기 80% · 한 시즌(135) 100% (15 §3.3)
  const confOf = (g: number) => (g <= 30 ? 0.5 * g / 30 : g <= 100 ? 0.5 + 0.3 * (g - 30) / 70 : Math.min(1, 0.8 + 0.2 * (g - 100) / 35));
  const items: HiddenItem[] = (['consistency', 'bigGame', 'pressure', 'injuryProne'] as HiddenKey[]).map((k) => {
    const gate = k === 'injuryProne' ? 0.95 : 0.5; // 부상 경향은 한 시즌을 함께해야
    const c = owned ? confOf(games) : 0;
    const revealed = owned && c >= gate;
    const needG = k === 'injuryProne' ? 128 : 30;
    const left = Math.max(1, needG - games);
    const w = hiddenWord(k, v[k]);
    return {
      key: k, ko: HIDDEN_KO[k], v: v[k], word: w.word, line: w.line, revealed, conf: c,
      need: revealed ? undefined : owned ? `${left}경기 더 함께하면 드러나요` : '스카우트 보고서엔 아직 없어요',
    };
  });
  return { personality: p.personality, desc: PERSONALITY_DESC[p.personality] ?? '', items, games };
}

/* ───────── 폼 (art/character/forms — 그림과 같은 값) ───────── */
export interface FormView {
  kind: 'bat' | 'pitch';
  name: string;
  tags: string[];
  effects: { k: string; label: string; text: string }[];
  pitch?: PitchForm;
  bat?: BatForm;
}

const PITCH_FX: Record<string, [string, string]> = {
  'armSlot.over': ['오버핸드', '수직 낙차 큰 직구·커브 · 구속 +1 · 땅볼 유도 −4'],
  'armSlot.threeQuarter': ['스리쿼터', '가장 흔한 팔 각도 · 좌우 차 보통'],
  'armSlot.side': ['사이드암', '같은 손 타자에 강함 · 디셉션 +6 · 땅볼 유도 +6'],
  'armSlot.under': ['잠수함', '처음 보는 타자에 강함 · 디셉션 +10 · 땅볼 유도 +10 · 구속 −3'],
  'legLift.high': ['하이킥', '구속 +1 · 제구 −1 · 투구 시간 +0.12초'],
  'legLift.slide': ['슬라이드 스텝', '퀵모션 +5 · 상대 도루 성공 −7%p'],
  'tempo.quick': ['빠른 템포', '퀵모션 +4 · 뒤 수비 집중 ↑'],
  'tempo.slow': ['느린 템포', '디셉션 +1 · 퀵모션 −4'],
  'hideBall.good': ['공 숨김', '디셉션 +3 · 삼진 조금 ↑'],
  'hideBall.exposed': ['공이 보임', '디셉션 −3 · 구종 노출 위험'],
  crossfire: ['크로스파이어', '디셉션 +4 · 제구 −2'],
  'armAction.short': ['짧은 팔', '디셉션 +2'],
};
const BAT_FX: Record<string, [string, string]> = {
  'stance.open': ['오픈 스탠스', '몸쪽 컨택 +2 · 당겨치기 ↑'],
  'stance.closed': ['클로즈드 스탠스', '바깥쪽 컨택 +2 · 밀어치기 ↑'],
  'stance.square': ['스퀘어 스탠스', '기본형 — 따로 붙는 효과 없음'],
  'legKick.big': ['레그킥', '파워 +2 · 강속구 대처 −2'],
  'legKick.toeTap': ['토탭', '컨택 +1 · 변화구 대처 +1 · 파워 −1'],
  'legKick.noStride': ['노스트라이드', '삼진 회피 +2 · 파워 −2'],
  'hands.high': ['높은 손', '발사각 ↑ · 높은 직구 −1'],
  'hands.low': ['낮은 손', '발사각 ↓ · 컨택 +0.5'],
  'crouch.crouch': ['웅크림', '스트라이크 존 ×0.96 · 선구 +1'],
  'plane.up': ['어퍼 스윙', '발사각 +6 · 파워 +1 · 높은 직구 −2'],
  'plane.down': ['다운 스윙', '땅볼 안타 ↑ · 파워 −1'],
  hitch: ['히치', '파워 +1 · 강속구 대처 −1.5'],
};

function pitchPicks(s?: string): PitchPick {
  const o: PitchPick = {};
  if (!s) return o;
  if (s.includes('오버')) o.armSlot = 'over';
  else if (s.includes('스리쿼터')) o.armSlot = 'threeQuarter';
  else if (s.includes('사이드')) o.armSlot = 'side';
  else if (s.includes('언더') || s.includes('잠수함')) o.armSlot = 'under';
  if (s.includes('하이킥')) o.legLift = 'high';
  if (s.includes('슬라이드')) o.legLift = 'slide';
  if (s.includes('숨김') || s.includes('디셉션')) o.hideBall = 'good';
  if (s.includes('와인드업')) { o.delivery = 'windup'; o.overhead = true; }
  return o;
}
function batPicks(s?: string): BatPick {
  const o: BatPick = {};
  if (!s) return o;
  if (s.includes('오픈')) o.stance = 'open';
  if (s.includes('클로즈드') || s.includes('밀어치기')) o.stance = 'closed';
  if (s.includes('스퀘어')) o.stance = 'square';
  if (s.includes('레그킥')) o.legKick = 'big';
  if (s.includes('토탭')) o.legKick = 'toeTap';
  if (s.includes('노스트라이드') || s.includes('짧게')) o.legKick = 'noStride';
  if (s.includes('하이 핸즈')) o.hands = 'high';
  if (s.includes('크라우치')) o.crouch = 'crouch';
  if (s.includes('어퍼')) o.plane = 'up';
  return o;
}

export function formOf(p: Player): FormView {
  const spec = toSpec(p);
  if (p.pos === 'P') {
    const f = makePitchForm(spec, pitchPicks(p.form.pitch));
    const keys = [`armSlot.${f.armSlot}`];
    if (f.legLift !== 'normal') keys.push(`legLift.${f.legLift}`);
    if (f.tempo !== 'normal') keys.push(`tempo.${f.tempo}`);
    if (f.hideBall !== 'normal') keys.push(`hideBall.${f.hideBall}`);
    if (f.crossfire) keys.push('crossfire');
    if (f.armAction === 'short') keys.push('armAction.short');
    return {
      kind: 'pitch',
      name: p.form.pitch ?? pitchFormName(f),
      tags: pitchFormTags(f),
      effects: keys.filter((k) => PITCH_FX[k]).map((k) => ({ k, label: PITCH_FX[k][0], text: PITCH_FX[k][1] })),
      pitch: f,
    };
  }
  const f = makeBatForm(spec, batPicks(p.form.bat));
  const keys = [`stance.${f.stance}`];
  if (f.legKick !== 'small') keys.push(`legKick.${f.legKick}`);
  if (f.hands !== 'mid') keys.push(`hands.${f.hands}`);
  if (f.crouch === 'crouch') keys.push('crouch.crouch');
  if (f.plane !== 'level') keys.push(`plane.${f.plane}`);
  if (f.hitch > 0) keys.push('hitch');
  return {
    kind: 'bat',
    name: p.form.bat ?? batFormName(f),
    tags: batFormTags(f),
    effects: keys.filter((k) => BAT_FX[k]).map((k) => ({ k, label: BAT_FX[k][0], text: BAT_FX[k][1] })),
    bat: f,
  };
}

/* ───────── 날씨 궁합 ───────── */
export const WEATHER_ROWS: { key: WeatherKey; ko: string; icon: 'flame' | 'temp' | 'rain' | 'sun' }[] = [
  { key: 'heat', ko: '더위', icon: 'flame' },
  { key: 'cold', ko: '추위', icon: 'temp' },
  { key: 'rain', ko: '비', icon: 'rain' },
  { key: 'day', ko: '낮 경기', icon: 'sun' },
];
const WX_WORD: Record<WeatherKey, [string, string, string, string, string]> = {
  rain: ['빗속에 매우 약함', '비에 약함', '보통', '비에 강함', '비의 사나이'],
  cold: ['추위에 매우 약함', '추위에 약함', '보통', '추위에 강함', '한파 체질'],
  heat: ['더위에 매우 약함', '더위에 약함', '보통', '더위에 강함', '한여름 체질'],
  day: ['낮 경기에 매우 약함', '낮 경기에 약함', '보통', '낮 경기에 강함', '햇빛 사냥꾼'],
};
export const weatherWord = (k: WeatherKey, v: number) => WX_WORD[k][clamp(Math.round(v), -2, 2) + 2];

/** 오늘 경기 날씨와 궁합 한 줄 */
export function weatherToday(p: Player) {
  const w = WEATHER_TODAY;
  const hot = w.tempC >= 30, cold = w.tempC <= 8, wet = w.rainPct >= 50 || w.sky === 'rain' || w.sky === 'drizzle';
  const day = w.sky !== 'night-clear';
  const hits: { k: WeatherKey; v: number }[] = [];
  if (hot) hits.push({ k: 'heat', v: p.weather.heat ?? 0 });
  if (cold) hits.push({ k: 'cold', v: p.weather.cold ?? 0 });
  if (wet) hits.push({ k: 'rain', v: p.weather.rain ?? 0 });
  if (day) hits.push({ k: 'day', v: p.weather.day ?? 0 });
  const net = hits.reduce((s, h) => s + h.v, 0);
  const sky = `${w.city} ${w.skyKo} ${w.tempC}°C`;
  if (!hits.length || net === 0) return { sky, net: 0, text: '오늘 날씨에선 따로 붙는 효과가 없어요' };
  return { sky, net, text: net > 0 ? `오늘 날씨가 잘 맞아요 · 날씨 패널티 ${net >= 2 ? '절반' : '조금'} 줄어듦` : `오늘 날씨는 맞지 않아요 · 날씨 패널티 ${net <= -2 ? '1.45배' : '조금 커짐'}` };
}

/* ───────── 최근 10경기 ───────── */
export interface GameRow {
  date: string;        // '6.13'
  oppId: string;
  home: boolean;
  /** 타자: '2-4' · 투수: '7.0' 이닝 */
  line: string;
  /** '2루타 · 1타점' · '7이닝 1실점 8K' */
  detail: string;
  /** 평점 (4.0~10) */
  rating: number;
  /** 결정적 장면 */
  note?: string;
  // 합계용
  ab?: number; h?: number; hr?: number; rbi?: number; bb?: number; so?: number; sb?: number;
  ip?: number; er?: number; k?: number; dec?: 'W' | 'L' | 'S' | 'H' | null;
}

const OPP_ROT = ['bs', 'bs', 'gj', 'gj', 'gj', 'sw', 'sw', 'sw', 'ic', 'ic', 'ic', 'cw', 'cw', 'cw', 'sh', 'sh'];
function lastDates(n: number, every: number[]) {
  // TODAY 전날부터 거꾸로 — 월요일은 쉰다
  const out: { d: Date; i: number }[] = [];
  const d = new Date(TODAY + 'T12:00:00');
  let i = 0, step = 0;
  d.setDate(d.getDate() - 1);
  while (out.length < n) {
    if (d.getDay() !== 1) { out.push({ d: new Date(d), i }); i++; d.setDate(d.getDate() - (every[step % every.length] ?? 1)); step++; }
    else d.setDate(d.getDate() - 1);
  }
  return out;
}
const md = (d: Date) => `${d.getMonth() + 1}.${d.getDate()}`;
const ipStr = (outs: number) => `${Math.floor(outs / 3)}.${outs % 3}`;

export function recentOf(p: Player): { rows: GameRow[]; summary: { k: string; v: string }[]; trend: 'hot' | 'cold' | 'even' } {
  const r = rng('recent:' + p.id);
  const lm = LAST_MATCH.plays.filter((x) => x.highlight && (x.batterId === p.id || x.pitcherId === p.id || x.defense?.fielders.some((f) => f.playerId === p.id && f.dive)));
  const lmNote = lm.length ? lm[lm.length - 1].highlight!.title.replace(/!$/, '') : undefined;
  const news = NEWS.find((n) => n.playerId === p.id);
  const playedLast = p.teamId === 'dj' || p.teamId === 'bs';
  if (p.pos !== 'P') {
    const avg0 = p.season.bat?.avg ?? 0.26;
    const target = news?.kind === '슬럼프' ? 0.182 : news?.kind === '불방망이' ? Math.max(avg0, 0.33) : avg0 + r.gauss() * 0.03;
    const hrRate = news?.kind === '불방망이' ? 0.4 : Math.min(0.16, (p.season.bat?.hr ?? 6) / Math.max(1, p.season.bat?.h ?? 60));
    const dates = lastDates(10, [1]);
    const lmPa = LAST_MATCH.plays.filter((x) => x.batterId === p.id && x.code !== 'SB' && x.code !== 'CS');
    const rows: GameRow[] = dates.map(({ d, i }) => {
      const fromLm = i === 0 && playedLast && lmPa.length > 0;
      const ab0 = r.int(3, 5);
      let h = 0;
      for (let k = 0; k < ab0; k++) if (r.next() < target) h++;
      let hr = 0;
      for (let k = 0; k < h; k++) if (r.next() < hrRate) hr++;
      let d2 = h - hr > 0 && r.chance(0.28) ? 1 : 0;
      let bb = r.chance(0.32) ? 1 : 0;
      let ab = ab0;
      let so = r.int(0, Math.max(0, ab - h - 1));
      let rbi = hr + (h > 0 && r.chance(0.35) ? r.int(1, 2) : 0);
      if (fromLm) {
        // 어제 경기는 실제 기록(LAST_MATCH)으로
        const hits = lmPa.filter((x) => ['1B', '2B', '3B', 'HR'].includes(x.code));
        h = hits.length; hr = hits.filter((x) => x.code === 'HR').length; d2 = hits.filter((x) => x.code === '2B').length;
        bb = lmPa.filter((x) => x.code === 'BB' || x.code === 'HBP').length;
        so = lmPa.filter((x) => x.code === 'K').length;
        rbi = lmPa.reduce((a, x) => a + x.rbi, 0);
        ab = Math.max(lmPa.length - bb, h + 2, 3);
      }
      const sb = (p.face.find((f) => f.code === 'SPD')?.v ?? 50) > 80 && h + bb > 0 && r.chance(0.3) ? 1 : 0;
      const oppId = i === 0 && playedLast ? (p.teamId === 'bs' ? 'dj' : 'bs') : OPP_ROT[(i + hashStr(p.id)) % OPP_ROT.length];
      const note = i === 0 && playedLast ? lmNote : undefined;
      let rating = 6 + h * 0.85 + hr * 1.1 + rbi * 0.3 + bb * 0.3 + sb * 0.3 - so * 0.35 - (h === 0 ? 0.6 : 0) + (note ? 1.1 : 0) + r.gauss() * 0.25;
      rating = Math.round(clamp(rating, 4.2, 9.9) * 10) / 10;
      const bits: string[] = [];
      if (hr) bits.push(hr > 1 ? `홈런 ${hr}` : '홈런');
      if (d2) bits.push('2루타');
      if (rbi) bits.push(`${rbi}타점`);
      if (bb) bits.push('볼넷');
      if (sb) bits.push('도루');
      if (!bits.length) bits.push(so >= 2 ? `삼진 ${so}` : h ? '단타' : '무안타');
      return {
        date: md(d), oppId, home: i % 3 !== 1, line: `${h}-${ab}`, detail: bits.join(' · '), rating, note,
        ab, h, hr, rbi, bb, so, sb,
      };
    }).reverse();
    const sum = (k: keyof GameRow) => rows.reduce((s, x) => s + ((x[k] as number) ?? 0), 0);
    const ab = sum('ab'), h = sum('h');
    const avg = h / Math.max(1, ab);
    return {
      rows,
      summary: [
        { k: '타율', v: avg.toFixed(3).replace(/^0/, '') },
        { k: '홈런', v: String(sum('hr')) },
        { k: '타점', v: String(sum('rbi')) },
        { k: '볼넷', v: String(sum('bb')) },
        { k: '도루', v: String(sum('sb')) },
      ],
      trend: avg >= avg0 + 0.04 ? 'hot' : avg <= avg0 - 0.05 ? 'cold' : 'even',
    };
  }
  // 투수
  const sp = p.role === 'SP';
  const era0 = p.season.pit?.era ?? 4;
  const dates = lastDates(10, sp ? [5, 6, 5, 5, 6] : [1, 2, 1, 3, 1, 2]);
  const rows: GameRow[] = dates.map(({ d, i }) => {
    const outs = sp ? r.int(15, 23) : r.chance(0.2) ? r.int(4, 6) : 3;
    const erRate = era0 / 27;
    let er = 0;
    for (let k = 0; k < outs; k++) if (r.next() < erRate * 0.95) er++;
    const k9 = (p.season.pit?.so ?? 50) / Math.max(1, p.season.pit?.ip ?? 50);
    const kk = clamp(Math.round(outs / 3 * k9 + r.gauss() * 1.2), 0, outs);
    const bb = r.int(0, sp ? 3 : 1);
    const ha = clamp(Math.round(outs / 3 * 0.9 + r.gauss()), 0, 12);
    const oppId = i === 0 && playedLast ? (p.teamId === 'bs' ? 'dj' : 'bs') : OPP_ROT[(i * 2 + hashStr(p.id)) % OPP_ROT.length];
    const note = i === 0 && playedLast ? lmNote : undefined;
    const dec: GameRow['dec'] = sp ? (er <= 2 && outs >= 18 && r.chance(0.7) ? 'W' : er >= 4 ? 'L' : null)
      : p.role === 'CL' ? (er === 0 && r.chance(0.6) ? 'S' : er > 0 && r.chance(0.4) ? 'L' : null)
      : (er === 0 && r.chance(0.45) ? 'H' : null);
    let rating = 6 + (outs / 3) * (sp ? 0.32 : 0.5) - er * 0.75 + kk * 0.12 - bb * 0.15 + (dec === 'W' || dec === 'S' ? 0.5 : 0) + (note ? 1 : 0) + r.gauss() * 0.2;
    rating = Math.round(clamp(rating, 4, 9.9) * 10) / 10;
    const decKo = dec === 'W' ? '승' : dec === 'L' ? '패' : dec === 'S' ? '세이브' : dec === 'H' ? '홀드' : '';
    return {
      date: md(d), oppId, home: i % 2 === 0, line: ipStr(outs),
      detail: [`${ipStr(outs)}이닝 ${er}실점`, `${kk}K`, decKo].filter(Boolean).join(' · '), rating, note,
      ip: outs, er, k: kk, bb, h: ha, dec,
    };
  }).reverse();
  const outs = rows.reduce((s, x) => s + (x.ip ?? 0), 0);
  const er = rows.reduce((s, x) => s + (x.er ?? 0), 0);
  const era = (er * 27) / Math.max(1, outs);
  const decs = (k: GameRow['dec']) => rows.filter((x) => x.dec === k).length;
  return {
    rows,
    summary: [
      { k: '평균자책', v: era.toFixed(2) },
      { k: '이닝', v: ipStr(outs) },
      { k: '탈삼진', v: String(rows.reduce((s, x) => s + (x.k ?? 0), 0)) },
      sp ? { k: '승', v: String(decs('W')) } : p.role === 'CL' ? { k: '세이브', v: String(decs('S')) } : { k: '홀드', v: String(decs('H')) },
    ],
    trend: era <= era0 - 0.8 ? 'hot' : era >= era0 + 1 ? 'cold' : 'even',
  };
}

/* ───────── 부상 (15 §7) ───────── */
export interface InjuryRec { when: string; kind: string; days: number; cause: string; recur?: boolean; now?: boolean }
const INJ_BAT: [string, number, string][] = [
  ['햄스트링 손상', 14, '2루 도루하다가'], ['손목 타박', 9, '몸에 맞는 공'], ['옆구리 근육 손상', 24, '풀스윙 뒤'],
  ['발목 염좌', 9, '1루 베이스를 밟다가'], ['어깨 염증', 18, '다이빙 캐치 뒤'], ['허리 통증', 8, '연속 출장 피로'],
  ['종아리 근육 손상', 12, '외야 타구 추격'], ['손가락 골절', 35, '헤드퍼스트 슬라이딩'],
];
const INJ_PIT: [string, number, string][] = [
  ['손가락 물집', 8, '포크볼 연투'], ['팔꿈치 염증', 21, '투구 수 108개째'], ['어깨 염증', 25, '이틀 연속 등판'],
  ['광배근 손상', 40, '7회 마지막 공'], ['옆구리 근육 손상', 24, '불펜 투구'], ['강습 타구에 맞음', 5, '투수 강습 타구'],
];

export function injuriesOf(p: Player, hiddenInjury: number) {
  const r = rng('inj:' + p.id);
  const pool = p.pos === 'P' ? INJ_PIT : INJ_BAT;
  const seasons = clamp(p.age - 22, 0, 6);
  const n = clamp(Math.round(seasons * 0.3 * Math.exp(0.0788 * (hiddenInjury - 10)) + r.next() * 0.9), 0, 4);
  const list: InjuryRec[] = [];
  const seen = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const [kind, days0, cause] = r.pick(pool);
    const y = 2026 - Math.floor(r.next() * Math.max(1, seasons * 0.8));
    const m = r.int(4, 9);
    const recur = seen.has(kind);
    seen.set(kind, (seen.get(kind) ?? 0) + 1);
    list.push({ when: `${y}.${String(m).padStart(2, '0')}`, kind, days: Math.max(2, Math.round(days0 * Math.exp(r.gauss() * 0.35))), cause, recur });
  }
  list.sort((a, b) => b.when.localeCompare(a.when));
  if (p.injury) {
    const [kind, rest] = p.injury.split('·').map((x) => x.trim());
    list.unshift({ when: '지금', kind, days: /이틀/.test(rest ?? '') ? 2 : 3, cause: rest ?? '', now: true });
  }
  // 위험 = 부상 경향 · 나이 · 피로
  const risk = Math.exp(0.0788 * (hiddenInjury - 10)) * (1 + 0.035 * Math.max(0, p.age - 29)) * (1 + 1.5 * (p.fatigue / 100) ** 2) * (p.traits.includes('철완') ? 0.75 : 1);
  const lvl = Math.max(p.injury ? 2 : 0, risk < 1.0 ? 0 : risk < 1.45 ? 1 : risk < 2.0 ? 2 : 3);
  return { list, risk, lvl, lvlKo: ['낮음', '보통', '높음', '매우 높음'][lvl], days: list.filter((x) => !x.now).reduce((s, x) => s + x.days, 0) };
}

/* ───────── 장비 (05 원작충실 §13.3 — 가상 브랜드) ───────── */
export type GearSlot = 'bat' | 'glove' | 'spikes' | 'bgloves' | 'helmet' | 'wrist' | 'guard' | 'cap' | 'shirt';
export interface SlotDef { slot: GearSlot; ko: string; stat: string; statKey: string; attrs: AttrKey[] }
export const SLOTS_BAT: SlotDef[] = [
  { slot: 'helmet', ko: '헬멧', stat: '선구', statKey: 'EYE', attrs: ['eye', 'avoidK'] },
  { slot: 'bgloves', ko: '배팅 장갑', stat: '컨택', statKey: 'CON', attrs: ['contactR', 'contactL'] },
  { slot: 'wrist', ko: '손목 밴드', stat: '송구', statKey: 'ARM', attrs: ['armStr', 'armAcc'] },
  { slot: 'guard', ko: '팔꿈치 보호대', stat: '부상 위험', statKey: 'INJ', attrs: [] },
  { slot: 'bat', ko: '배트', stat: '파워', statKey: 'POW', attrs: ['power', 'gap'] },
  { slot: 'glove', ko: '글러브', stat: '수비', statKey: 'DEF', attrs: ['range', 'hands', 'firstStep', 'turnDP'] },
  { slot: 'spikes', ko: '스파이크', stat: '주루', statKey: 'SPD', attrs: ['speed', 'stealJump', 'baserunning'] },
];
export const SLOTS_PIT: SlotDef[] = [
  { slot: 'cap', ko: '모자', stat: '위기관리', statKey: 'MNT', attrs: ['composure', 'concentration', 'baseballIQ'] },
  { slot: 'shirt', ko: '언더셔츠', stat: '구위', statKey: 'STF', attrs: [] },
  { slot: 'wrist', ko: '손목 밴드', stat: '구속', statKey: 'VEL', attrs: ['velocity'] },
  { slot: 'glove', ko: '글러브', stat: '제구', statKey: 'CTL', attrs: ['control'] },
  { slot: 'spikes', ko: '스파이크', stat: '체력', statKey: 'STA', attrs: ['stamina'] },
];
export const slotsFor = (p: Player) => (p.pos === 'P' ? SLOTS_PIT : SLOTS_BAT);

export type BrandId = 'garam' | 'neoul' | 'dandan' | 'bitsal';
export const BRANDS: Record<BrandId, { ko: string; setStat: string; setStatPit: string; mark: string }> = {
  garam: { ko: '가람 공방', setStat: '컨택', setStatPit: '제구', mark: 'GR' },
  neoul: { ko: '너울', setStat: '주루', setStatPit: '체력', mark: 'NW' },
  dandan: { ko: '단단 기어', setStat: '파워', setStatPit: '구위', mark: 'DD' },
  bitsal: { ko: '빗살', setStat: '수비', setStatPit: '구속', mark: 'BT' },
};
export const TIERS = ['기본', '고급', '희귀', '명품', '전설'] as const;
/** 장비 강화 확률 (+1 ~ +5) · 실패마다 +15%p, 단계·장비는 그대로 */
export const GEAR_ENH = [100, 90, 70, 55, 40];
export const GEAR_ENH_GP = [20_000, 40_000, 80_000, 160_000, 320_000];
export const GEAR_CAP = { perStat: 8, total: 15 };

export interface GearItem {
  id: string;
  slot: GearSlot;
  brand: BrandId;
  /** 0 기본 … 4 전설 */
  tier: number;
  model: string;
  /** 0 ~ 5 */
  enh: number;
  /** 실패 보정 (누적 실패 수) */
  fails: number;
}
const MODEL: Record<GearSlot, string[]> = {
  bat: ['메이플 M-34', '자작 BX-7', '물푸레 N33'],
  glove: ['내야 11.5', '외야 12.75', '올라운드 12'],
  spikes: ['스틸 7', '에어 러너', '하프 클리트'],
  bgloves: ['그립 S', '양가죽 V2', '라이트 핏'],
  helmet: ['C-플랩 헬멧', '매트 헬멧', '원 플랩'],
  wrist: ['파워 밴드', '코튼 밴드', '스냅 밴드'],
  guard: ['엘보 쉴드', '하드 쉘', '라이트 가드'],
  cap: ['플렉스 캡', '메시 캡', '울 캡'],
  shirt: ['압박 언더', '쿨 언더', '롱 슬리브'],
};
/** 포지션별 글러브 이름 */
export function gloveName(p: Player) {
  if (p.pos === 'C') return '포수 미트';
  if (p.pos === '1B') return '1루 미트';
  if (p.pos === 'P') return '투수 글러브';
  return '글러브';
}
export const itemName = (it: GearItem) => `${BRANDS[it.brand].ko} ${MODEL[it.slot][hashStr(it.id) % MODEL[it.slot].length]}`;
/** 슬롯 능력치 = 등급 +1~+5 + 강화 단계 */
export const itemValue = (it: GearItem) => it.tier + 1 + it.enh;

export function gearOf(card: CardInst, p: Player) {
  const r = rng('gear:' + card.id);
  const slots = slotsFor(p);
  const strong = gradeRank(card.grade) >= 5;
  const main: BrandId = r.pick(['garam', 'neoul', 'dandan', 'bitsal'] as BrandId[]);
  const equipped: Partial<Record<GearSlot, GearItem>> = {};
  const bag: GearItem[] = [];
  slots.forEach((d, i) => {
    const empty = !strong && r.chance(0.3) ? true : i === slots.length - 1 && r.chance(0.45);
    const brand: BrandId = r.chance(strong ? 0.55 : 0.35) ? main : r.pick(['garam', 'neoul', 'dandan', 'bitsal'] as BrandId[]);
    const tier = clamp(Math.round((strong ? 1.1 : 0.4) + r.gauss() * 0.8), 0, 4);
    const it: GearItem = { id: `${card.id}-${d.slot}`, slot: d.slot, brand, tier, model: '', enh: clamp(Math.floor(r.next() * (strong ? 2.6 : 1.4)), 0, 5), fails: r.chance(0.25) ? 1 : 0 };
    it.model = itemName(it);
    if (!empty) equipped[d.slot] = it;
    // 가방에 같은 슬롯 여분 하나씩 (가끔 둘)
    const spares = empty ? 2 : r.chance(0.5) ? 1 : 0;
    for (let k = 0; k < spares; k++) {
      const b: GearItem = { id: `${card.id}-${d.slot}-b${k}`, slot: d.slot, brand: r.pick(['garam', 'neoul', 'dandan', 'bitsal'] as BrandId[]), tier: clamp(Math.round(1 + r.gauss() * 1.1), 0, 4), model: '', enh: 0, fails: 0 };
      b.model = itemName(b);
      bag.push(b);
    }
  });
  return { equipped, bag };
}

/** 장비 보너스 합 — 능력치 하나 +8, 전체 +15 상한. 부상 위험(보호대)은 따로 */
export function gearBonus(p: Player, equipped: Partial<Record<GearSlot, GearItem>>) {
  const slots = slotsFor(p);
  const per: Record<string, number> = {};
  let raw = 0;
  let injury = 0;
  slots.forEach((d) => {
    const it = equipped[d.slot];
    if (!it) return;
    const v = itemValue(it);
    if (d.statKey === 'INJ') { injury += v * 2; return; }
    per[d.statKey] = (per[d.statKey] ?? 0) + v;
    raw += v;
  });
  // 세트 효과
  const sets = setsOf(p, equipped);
  sets.forEach((st) => {
    if (st.bonus > 0) {
      const key = st.statKey;
      per[key] = (per[key] ?? 0) + st.bonus;
      raw += st.bonus;
    }
  });
  const capped: Record<string, number> = {};
  let total = 0;
  Object.entries(per).forEach(([k, v]) => { const c = Math.min(GEAR_CAP.perStat, v); capped[k] = c; total += c; });
  const over = Math.max(0, total - GEAR_CAP.total);
  if (over > 0) {
    // 상한을 넘으면 큰 것부터 깎는다
    const keys = Object.keys(capped).sort((a, b) => capped[b] - capped[a]);
    let left = over;
    for (const k of keys) { const cut = Math.min(left, capped[k] - 1); capped[k] -= cut; left -= cut; if (!left) break; }
    total = GEAR_CAP.total;
  }
  return { per: capped, total, raw, injury };
}

const STAT_KEY_BY_KO: Record<string, string> = { 컨택: 'CON', 주루: 'SPD', 파워: 'POW', 수비: 'DEF', 제구: 'CTL', 체력: 'STA', 구위: 'STF', 구속: 'VEL' };
export function setsOf(p: Player, equipped: Partial<Record<GearSlot, GearItem>>) {
  const counts = new Map<BrandId, number>();
  Object.values(equipped).forEach((it) => { if (it) counts.set(it.brand, (counts.get(it.brand) ?? 0) + 1); });
  const pit = p.pos === 'P';
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([b, n]) => {
      const stat = pit ? BRANDS[b].setStatPit : BRANDS[b].setStat;
      return { brand: b, ko: BRANDS[b].ko, n, of: 5, stat, statKey: STAT_KEY_BY_KO[stat], bonus: n >= 5 ? 4 : n >= 3 ? 2 : 0 };
    });
}

/* ───────── 강화 — 표 · 확률 · 보정은 game/inventory 의 ENH_STEPS 한 곳에서 (기획서 7.1) ───────── */
export interface EnhStep { stage: number; base: number; gain: number; gp: number; mat: string; need: number; auto: boolean }
export function enhTable(grade: GradeId): EnhStep[] {
  return ENH_STEPS.map((x) => ({ stage: x.stage, base: x.base, gain: x.gain, gp: x.gp, need: x.mat[matClass(grade)], mat: `${x.mat[matClass(grade)]}장`, auto: x.auto }));
}
export const PITY_STEP = INV_PITY_STEP;
/** 실패 n 번 뒤 확률 — 3번 실패하면 4번째는 확정 */
export const chanceAfter = invChanceAfter;
export const enhGainTotal = (_grade: GradeId, enh: number) => invGainTotal(enh);

/** 이 카드의 지금 단계 연속 실패 수 (보유 카드 저장소) */
export const initialFails = (card: CardInst) => entryOf(card.id)?.fail ?? 0;

/** 강화권 — 아직 보관·지급이 없다(상점 준비 중). 이름만 보여 주고 0장 */
export const TICKETS: { id: string; ko: string; have: number; covers: GradeId[] }[] = [
  { id: 'n', ko: '노멀 강화권', have: 0, covers: ['normal'] },
  { id: 's', ko: '스페셜 강화권', have: 0, covers: ['normal', 'special'] },
  { id: 'r', ko: '레어 강화권', have: 0, covers: ['normal', 'special', 'rare', 'elite', 'mvp', 'gg', 'th'] },
  { id: 'l', ko: '레전드 강화권', have: 0, covers: ['legend', 'franchise', 'black', 'signature', 'unique', 'elite', 'rare', 'mvp', 'gg', 'th'] },
];
export const ticketFor = (g: GradeId) => TICKETS.find((t) => t.covers.includes(g)) ?? TICKETS[3];

/** 재료 — 같은 카드의 남는 장(보유 수량 − 1). 다른 카드는 재료로 쓰지 않는다(같은 카드 중복만 강화로). 강화권은 아직 0장 */
export function materialsFor(card: CardInst) {
  const n = entryOf(card.id)?.n ?? 0;
  const mine = ownedCard(card.id) ?? card;
  const cards = n > 1 ? [{ card: mine, count: n - 1 }] : [];
  return { cards, ticket: ticketFor(card.grade) };
}
/** 다음 단계에 드는 같은 카드 장수 */
export const needOf = (card: CardInst, stage: number) => needFor(card.grade, stage);

/** 서버가 정하는 결과 — 목업은 시드로 (같은 카드·같은 시도 = 같은 결과) */
export function rollEnhance(cardId: string, stage: number, tryNo: number, chance: number) {
  if (chance >= 100) return true;
  const r = rng(`enh:${cardId}:${stage}:${tryNo}`);
  return r.next() * 100 < chance;
}
export function rollGear(itemId: string, stage: number, tryNo: number, chance: number) {
  if (chance >= 100) return true;
  return rng(`gear-enh:${itemId}:${stage}:${tryNo}`).next() * 100 < chance;
}

/* ───────── 플레이스타일 (+5 에서 선택, 바꾸기 무료) ───────── */
export interface Playstyle { id: string; ko: string; text: string; parts: [string, number][]; icon: 'contact' | 'power' | 'speed' | 'eye' | 'glove' | 'arm' | 'fire' | 'curve' | 'aim' | 'stamina' | 'heart' }
export const PLAYSTYLES_BAT: Playstyle[] = [
  { id: 'contact', ko: '교타자', text: '컨택 +3 · 선구 +2', parts: [['CON', 3], ['EYE', 2]], icon: 'contact' },
  { id: 'slugger', ko: '거포', text: '파워 +4 · 컨택 +1', parts: [['POW', 4], ['CON', 1]], icon: 'power' },
  { id: 'fivetool', ko: '호타준족', text: '파워 +2 · 주루 +3', parts: [['POW', 2], ['SPD', 3]], icon: 'speed' },
  { id: 'onbase', ko: '출루 머신', text: '선구 +4 · 컨택 +1', parts: [['EYE', 4], ['CON', 1]], icon: 'eye' },
  { id: 'glove', ko: '수비 장인', text: '수비 +3 · 송구 +2', parts: [['DEF', 3], ['ARM', 2]], icon: 'glove' },
  { id: 'arm', ko: '강견', text: '송구 +3 · 수비 +2', parts: [['ARM', 3], ['DEF', 2]], icon: 'arm' },
];
export const PLAYSTYLES_PIT: Playstyle[] = [
  { id: 'power', ko: '파이어볼러', text: '구속 +3 · 구위 +2', parts: [['VEL', 3], ['STF', 2]], icon: 'fire' },
  { id: 'finesse', ko: '기교파', text: '변화 +3 · 제구 +2', parts: [['BRK', 3], ['CTL', 2]], icon: 'curve' },
  { id: 'command', ko: '제구 아티스트', text: '제구 +4 · 위기관리 +1', parts: [['CTL', 4], ['MNT', 1]], icon: 'aim' },
  { id: 'eater', ko: '이닝 이터', text: '체력 +4 · 구위 +1', parts: [['STA', 4], ['STF', 1]], icon: 'stamina' },
  { id: 'closer', ko: '클로저 본능', text: '위기관리 +3 · 구속 +2', parts: [['MNT', 3], ['VEL', 2]], icon: 'heart' },
];
export const playstylesFor = (p: Player) => (p.pos === 'P' ? PLAYSTYLES_PIT : PLAYSTYLES_BAT);

/** +5 이상 카드의 지금 플레이스타일 — 대표 능력치가 가장 높은 쪽으로 (목업) */
export function defaultPlaystyle(p: Player): string {
  const f = Object.fromEntries(p.face.map((x) => [x.code, x.v]));
  const list = playstylesFor(p);
  let best = list[0], bestV = -1;
  list.forEach((ps) => {
    const v = ps.parts.reduce((s, [k, w]) => s + (f[k] ?? 50) * w, 0) / ps.parts.reduce((s, [, w]) => s + w, 0);
    if (v > bestV) { bestV = v; best = ps; }
  });
  return best.id;
}

/* ───────── 대표 능력치 묶음 ↔ 깊은 능력치 (카드 층 보너스가 붙는 길, 15 §6.6) ───────── */
export const FACE_ATTRS: Record<string, AttrKey[]> = {
  CON: ['contactR', 'contactL'], POW: ['power', 'gap'], EYE: ['eye', 'avoidK'], SPD: ['speed', 'baserunning', 'stealJump', 'sliding'],
  DEF: ['range', 'firstStep', 'hands', 'turnDP'], ARM: ['armStr', 'armAcc'],
  BLK: ['block'], FRM: ['framing', 'pitcherLead'], CS: ['popTime'],
  GAP: ['gap'], ADJ: ['vsFast', 'vsBreak'],
  VEL: ['velocity'], CTL: ['control'], STA: ['stamina'], REC: ['recovery'], MNT: ['composure', 'concentration', 'baseballIQ'],
};

/** 깊은 능력치마다 카드 층 보너스 (강화 + 플레이스타일 + 장비) */
export function attrBonus(p: Player, grade: GradeId, enh: number, playstyle: string | null, gearPer: Record<string, number>) {
  const out: Partial<Record<AttrKey, number>> = {};
  const add = (k: AttrKey, v: number) => { out[k] = (out[k] ?? 0) + v; };
  const eg = enhGainTotal(grade, enh);
  const faceCodes = p.face.map((f) => f.code);
  faceCodes.forEach((c) => (FACE_ATTRS[c] ?? []).forEach((k) => add(k, eg)));
  const ps = playstylesFor(p).find((x) => x.id === playstyle);
  if (ps && enh >= 5) ps.parts.forEach(([c, v]) => (FACE_ATTRS[c] ?? []).forEach((k) => add(k, v)));
  Object.entries(gearPer).forEach(([c, v]) => (FACE_ATTRS[c] ?? []).forEach((k) => add(k, v)));
  return out;
}

/** 구종별 보너스 — 구위(STF) = 대표 구종, 변화(BRK) = 변화구 전부, 제구(CTL) = 커맨드 전부 */
export function pitchBonus(p: Player, pitch: Pitch, grade: GradeId, enh: number, playstyle: string | null, gearPer: Record<string, number>) {
  const eg = enhGainTotal(grade, enh);
  const ps = enh >= 5 ? playstylesFor(p).find((x) => x.id === playstyle) : undefined;
  const psv = (c: string) => ps?.parts.find(([k]) => k === c)?.[1] ?? 0;
  const top = (p.pitches ?? []).slice().sort((a, b) => b.stuff - a.stuff)[0];
  const isBrk = !['FF', 'SI', 'FC'].includes(pitch.type);
  const stuff = (pitch === top ? eg + psv('STF') + (gearPer.STF ?? 0) : 0) + (isBrk ? eg + psv('BRK') : 0);
  const command = eg + psv('CTL') + (gearPer.CTL ?? 0);
  return { stuff, command };
}

/* ───────── 이 선수의 명장면 (어제 경기 강조 장면) ───────── */
export function highlightsOf(p: Player) {
  return LAST_MATCH.plays.filter((x) => x.highlight && (
    x.batterId === p.id || (x.highlight.kind === 'escape' && x.pitcherId === p.id) || x.defense?.fielders.some((f) => f.playerId === p.id && f.dive)
  ));
}

export const teamOf = (p: Player) => teamById(p.teamId);
export { TEAMS };
