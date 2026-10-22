// 라인업 화면 전용 목업 — game/mock 을 이어 붙여 쓴다 (공용 파일은 고치지 않는다).
// 공용 목업에는 독수리스 좌익수·지명타자가 없어서 '능력치 폭발'(9/9)을 맞춰 볼 수 없다.
// 그래서 독수리스 타자 두 명을 벤치에 더 둔다 — 기반 담당이 game/mock 으로 옮기면 이 파일은 줄어든다.
import type { BattingLine, CardInst, Player } from '../../game/types';
import { LINEUP, MY_CARD_IDS, cardById, playerById } from '../../game/mock';

const tpl = (id: string): Player => playerById(id)!;

const line = (g: number, ab: number, h: number, d2: number, d3: number, hr: number, rbi: number, r: number, sb: number, bb: number, so: number): BattingLine => {
  const singles = h - d2 - d3 - hr;
  const avg = h / ab;
  const obp = (h + bb) / (ab + bb);
  const slg = (singles + 2 * d2 + 3 * d3 + 4 * hr) / ab;
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  return { g, pa: ab + bb + 4, ab, h, d2, d3, hr, rbi, r, sb, bb, so, avg: r3(avg), obp: r3(obp), slg: r3(slg), ops: r3(obp + slg) };
};

const EXTRA_PLAYERS: Player[] = [
  {
    ...tpl('p21'),
    id: 'lp1', name: '사공린', teamId: 'dj', number: 35, pos: 'LF', subPos: ['RF'], bats: 'L', throws: 'R',
    age: 24, heightCm: 181, weightKg: 79, draftYear: 2021, ovr: 78, look: 'look:lp1',
    face: [
      { code: 'CON', ko: '컨택', v: 80 }, { code: 'POW', ko: '파워', v: 70 }, { code: 'EYE', ko: '선구', v: 76 },
      { code: 'SPD', ko: '주루', v: 82 }, { code: 'DEF', ko: '수비', v: 77 }, { code: 'ARM', ko: '송구', v: 72 },
    ],
    potential: 4.5, traits: ['밀어치기 장인'], personality: '성실파', form: { bat: '오픈 스탠스' },
    season: { bat: line(66, 238, 70, 13, 2, 6, 31, 38, 9, 26, 48) }, condition: 4, fatigue: 14, injury: undefined,
  },
  {
    ...tpl('p14'),
    id: 'lp2', name: '서문혁', teamId: 'dj', number: 50, pos: 'DH', subPos: ['1B'], bats: 'R', throws: 'R',
    age: 31, heightCm: 188, weightKg: 102, draftYear: 2014, ovr: 83, look: 'look:lp2',
    face: [
      { code: 'CON', ko: '컨택', v: 81 }, { code: 'POW', ko: '파워', v: 90 }, { code: 'EYE', ko: '선구', v: 80 },
      { code: 'GAP', ko: '장타', v: 86 }, { code: 'ADJ', ko: '대처', v: 79 }, { code: 'SPD', ko: '주루', v: 52 },
    ],
    potential: 3, traits: ['직구 노림수'], personality: '느긋한 성격', form: { bat: '어퍼 스윙' },
    season: { bat: line(70, 255, 74, 15, 0, 17, 58, 41, 1, 33, 71) }, condition: 3, fatigue: 22, injury: undefined,
  },
];

const EXTRA_CARDS: CardInst[] = [
  { id: 'lc1', playerId: 'lp1', grade: 'special', year: 27, level: 4.6, enhance: 1, dup: 0 },
  { id: 'lc2', playerId: 'lp2', grade: 'rare', year: 27, level: 6.35, enhance: 2, dup: 0, isNew: true },
];

const pMap = new Map(EXTRA_PLAYERS.map((p) => [p.id, p]));
const cMap = new Map(EXTRA_CARDS.map((c) => [c.id, c]));

/** 카드 찾기 — 라인업 화면 목업 먼저, 없으면 공용 목업 */
export const getCard = (id: string): CardInst | undefined => cMap.get(id) ?? cardById(id);
/** 선수 찾기 — 라인업 화면 목업 먼저, 없으면 공용 목업 */
export const getPlayer = (id: string): Player | undefined => pMap.get(id) ?? playerById(id);
/** 공용 목업에 있는 선수인가 (선수 화면 #/player/:id 로 보낼 수 있나) */
export const isSharedPlayer = (id: string) => !pMap.has(id) && !!playerById(id);

/** 내가 가진 카드 전부 */
export const OWNED: string[] = [...MY_CARD_IDS, ...EXTRA_CARDS.map((c) => c.id)];

/** 처음 라인업 — game/mock LINEUP + 투수진 5·5 칸 + 벤치에 독수리스 두 명 */
export const START = {
  batting: LINEUP.batting,
  rotation: [LINEUP.sp, ...LINEUP.rotation.filter((c) => c !== LINEUP.sp), 'c46', null] as (string | null)[],
  // 셋업맨 · 필승조 · 좌완 원포인트 · 추격조 · 롱릴리프
  bullpen: ['c40', 'c20', 'c12', 'c11', null] as (string | null)[],
  closer: LINEUP.closer,
  bench: [...LINEUP.bench, 'lc1', 'lc2'],
};
