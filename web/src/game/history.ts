// 옛 시즌 선수단 (목업) — 연도팩·구단팩이 '그 해 · 그 구단' 카드를 뽑을 수 있게 구단마다 선수 경력을 시드로 만든다.
//  · 구단마다 18자리(선발 4 · 중계 3 · 마무리 · 포수 · 내야 5 · 외야 3 · 지명)에 선수가 차례로 들어온다 —
//    한 사람이 몇 해(2~13년) 같은 자리를 지키다 물러나면 다음 사람이 이어받는다. 그래서 같은 이름이 여러 해 카드에 나온다.
//  · 그 해 종합 = 재능 − 나이 곡선(27~31세 전성기) + 그 해 팀 성적(실제 지역 구단 기록의 순위) ± 조금.
//  · 1998년부터는 외국인 선수 자리가 생긴다. 이름은 모두 가상(드문 성 + 시대에 맞는 이름).
//  · 2025~2027 현재 구단은 목업 선수(PLAYERS)도 같이 나온다. 서버가 붙으면 서버의 시즌 카드 목록으로 바뀐다.
import { PLAYERS, registerPlayers, teamByCode } from './mock';
import { clubSeason } from './clubSeasons';
import { CURRENT_SEASON, clubsIn, eraOfCode, isOldCode } from './world';
import type { BatSide, ClubCode, Hand, Origin, PitcherRole, Player, Pos } from './types';

/* ───────── 시드 난수 ───────── */
function h32(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed: string) {
  let a = h32(seed) || 1;
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
  const int = (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1));
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)];
  return { next, gauss, int, pick };
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ───────── 이름 — 드문 성 + 시대별 이름 (실제 선수 이름이 나오지 않게 흔한 성은 쓰지 않는다) ───────── */
const SURNAMES = ['남궁', '제갈', '독고', '황보', '선우', '사공', '서문', '동방', '편', '탁', '용', '반', '기', '금', '옥', '소', '길', '모', '피', '승', '빈', '위', '국', '맹', '인', '봉', '은', '육', '경', '계', '탄', '묵', '견', '감', '단', '섭', '팽', '갈', '엽', '표', '범', '어', '우', '방', '설'];
const GIVEN_OLD = ['병철', '영수', '재호', '동식', '광수', '성만', '기태', '용준', '정길', '태수', '만기', '석주', '경호', '상렬', '문수', '종길', '희철', '인규', '진호', '봉수', '창식', '덕규', '명환', '도형', '학수', '영길', '재영', '광석', '순범', '용철', '홍렬', '성태', '대근', '형수', '윤석', '갑수', '남수', '덕만', '칠성', '상철'];
const GIVEN_MID = ['민수', '성훈', '재훈', '동현', '준호', '상우', '지훈', '현석', '정민', '승환', '태훈', '영민', '진우', '경민', '성민', '동욱', '재원', '현수', '우진', '태진', '상현', '민호', '형준', '준석', '석민', '종훈', '성진', '기범', '준영', '정호'];
const GIVEN_NEW = ['하진', '도윤', '시우', '지후', '은찬', '태윤', '건후', '서준', '민결', '유찬', '라온', '다겸', '해람', '이안', '우빈', '재희', '윤재', '한솔', '태하', '지운', '로운', '시헌', '다율', '온유', '규빈', '서진', '무결', '찬솔', '이든', '해온'];
const FOREIGN_FIRST = ['라일리', '마르코', '에반', '루이스', '조던', '카를로스', '타일러', '호세', '네이선', '다니엘', '브랜든', '미겔', '라파엘', '케빈', '훌리오', '애런', '데릭', '오스카', '빅터', '숀'];
const FOREIGN_LAST = ['코번', '하이스', '파세로', '웰튼', '메나드', '브룩필', '크로스비', '홀터', '로웰린', '핀치먼', '에스카라', '레이번', '몬테즈', '달리오', '베로나', '시모어', '앤즐리', '그레이딘', '토르바', '마시엘'];
const FOREIGN_ORIGIN: Origin[] = ['US', 'US', 'USB', 'LATAM', 'LATAM', 'AU', 'JP', 'TW'];

/* ───────── 자리 18 ───────── */
interface SlotDef { pos: Pos; role?: PitcherRole; sub?: Pos[]; base: number; foreign?: boolean }
const SLOTS: SlotDef[] = [
  { pos: 'P', role: 'SP', base: 82, foreign: true }, { pos: 'P', role: 'SP', base: 80, foreign: true }, { pos: 'P', role: 'SP', base: 77 }, { pos: 'P', role: 'SP', base: 74 },
  { pos: 'P', role: 'RP', base: 76 }, { pos: 'P', role: 'RP', base: 73 }, { pos: 'P', role: 'RP', base: 70 }, { pos: 'P', role: 'CL', base: 80 },
  { pos: 'C', base: 76 }, { pos: '1B', base: 79, foreign: true }, { pos: '2B', base: 76 }, { pos: '3B', base: 78 }, { pos: 'SS', base: 77 },
  { pos: 'LF', base: 77, foreign: true }, { pos: 'CF', base: 78 }, { pos: 'RF', base: 78 }, { pos: 'DH', sub: ['1B'], base: 79, foreign: true },
  { pos: '2B', sub: ['SS', '3B'], base: 71 },
];
/** 그 해 외국인 자리 수 (1998~ 2명, 2014~ 3명) */
const foreignCap = (y: number) => (y >= 2014 ? 3 : y >= 1998 ? 2 : 0);

interface Person {
  key: string;
  slot: number;
  name: string;
  from: number;
  to: number;
  birth: number;
  talent: number;
  number: number;
  bats: BatSide;
  throws: Hand;
  origin: Origin;
  star: boolean;
}

/** 경력 표 — 구단마다 한 번 */
const careerCache = new Map<ClubCode, Person[]>();
function careers(code: ClubCode): Person[] {
  const hit = careerCache.get(code);
  if (hit) return hit;
  const [from, to] = eraOfCode(code);
  const r = rng('career:' + code);
  const used = new Set<string>();
  const out: Person[] = [];
  SLOTS.forEach((sd, si) => {
    // 첫 사람은 이미 몇 해 뛰던 선수 (원년 구단이라도 나이는 제각각)
    let y = from - r.int(0, 7);
    let k = 0;
    while (y <= to) {
      const len = clamp(Math.round(4 + Math.abs(r.gauss()) * 4 + r.next() * 3), 2, 13);
      const start = Math.max(y, from);
      const end = Math.min(to, y + len - 1);
      const debutAge = r.int(19, 24);
      const foreign = !!sd.foreign && start >= 1998 && r.next() < (sd.pos === 'P' ? 0.45 : 0.4);
      let name = '';
      for (let t = 0; t < 20 && (!name || used.has(name)); t++) {
        if (foreign) name = `${r.pick(FOREIGN_FIRST)} ${r.pick(FOREIGN_LAST)}`;
        else name = r.pick(SURNAMES) + r.pick(y < 1995 ? GIVEN_OLD : y < 2010 ? GIVEN_MID : GIVEN_NEW);
      }
      used.add(name);
      const isP = sd.pos === 'P';
      const throws: Hand = isP ? (r.next() < 0.3 ? 'L' : 'R') : ['C', 'SS', '2B', '3B'].includes(sd.pos) ? 'R' : r.next() < 0.15 ? 'L' : 'R';
      const bats: BatSide = isP ? throws : r.next() < 0.3 ? 'L' : r.next() < 0.05 ? 'S' : 'R';
      const star = r.next() < 0.1;
      out.push({
        key: `${si}-${k}`, slot: si, name,
        from: start, to: end,
        birth: y - debutAge - (foreign ? r.int(4, 8) : 0),
        talent: sd.base + r.gauss() * 4 + (star ? 8 : 0),
        number: 1 + (h32(`no:${code}:${si}:${k}`) % 99),
        bats, throws, origin: foreign ? r.pick(FOREIGN_ORIGIN) : 'KR', star,
      });
      y += len;
      k++;
    }
  });
  careerCache.set(code, out);
  return out;
}

/* ───────── 그 해 선수 만들기 — 같은 자리 목업 선수를 본으로 능력치를 옮긴다 ───────── */
const templates = (pos: Pos, role?: PitcherRole) => {
  const base = PLAYERS.filter((p) => /^p\d+$/.test(p.id) && p.id !== 'p41' && p.pos === pos && (pos !== 'P' || (p.role ?? 'RP') === (role ?? 'RP')));
  return base.length ? base : PLAYERS.filter((p) => /^p\d+$/.test(p.id) && p.id !== 'p41' && (pos === 'P' ? p.pos === 'P' : p.pos !== 'P'));
};

/** 그 해 팀 성적 → 종합 보정 (−3 ~ +3). 기록이 없으면 전력 등급으로 */
function teamShift(code: ClubCode, year: number) {
  const rec = clubSeason(code, year);
  if (rec?.rank && rec.teams > 1) return 3 - (6 * (rec.rank - 1)) / (rec.teams - 1);
  const t = teamByCode(code);
  return t.tier === '강' ? 1.5 : t.tier === '약' ? -1.5 : 0;
}

function seasonPlayer(code: ClubCode, year: number, ps: Person): Player {
  const sd = SLOTS[ps.slot];
  const team = teamByCode(code);
  const tpls = templates(sd.pos, sd.role);
  const tpl = tpls[h32(`tpl:${code}:${ps.key}`) % tpls.length];
  const r = rng(`season:${code}:${year}:${ps.key}`);
  const age = year - ps.birth;
  const curve = age < 27 ? (27 - age) * 1.3 : age > 31 ? (age - 31) * 1.6 : 0;
  const ovr = Math.round(clamp(ps.talent - curve + teamShift(code, year) + r.gauss() * 1.6, 52, 96));
  const d = ovr - tpl.ovr;
  const v = (x: number) => clamp(Math.round(x + d + (r.next() - 0.5) * 6), 25, 97);
  const k = Math.max(0.55, Math.min(1.12, 1 + d / 60));
  const bat = tpl.season.bat, pit = tpl.season.pit;
  const p: Player = {
    ...tpl,
    id: `x-${code.toLowerCase()}-${String(year % 100).padStart(2, '0')}-${ps.key}`,
    name: ps.name,
    nameEn: undefined,
    teamId: team.id,
    number: ps.number,
    pos: sd.pos,
    role: sd.role,
    subPos: sd.sub ?? tpl.subPos,
    bats: ps.bats,
    throws: ps.throws,
    age,
    origin: ps.origin,
    draftYear: ps.from,
    career: [ps.from, ps.to],
    ovr,
    face: tpl.face.map((f) => ({ ...f, v: v(f.v) })),
    attrs: Object.fromEntries(Object.entries(tpl.attrs).map(([kk, x]) => [kk, typeof x === 'number' ? (/Tend$/.test(kk) ? x : v(x)) : x])) as Player['attrs'],
    pitches: tpl.pitches?.map((x) => ({ ...x, stuff: v(x.stuff), command: v(x.command), kmh: Math.round(x.kmh + d * 0.25 - (year < 2000 ? 3 : 0)) })),
    potential: clamp(Math.round((ps.star ? 4 : 2.5 + r.next() * 1.5) * 2) / 2, 1.5, 5),
    traits: [],
    look: `look:x-${code}-${ps.key}`,
    injury: undefined,
    condition: 3,
    fatigue: 0,
    season: {
      bat: bat ? {
        ...bat,
        h: Math.round(bat.h * k), hr: Math.round(bat.hr * k * k), rbi: Math.round(bat.rbi * k), r: Math.round(bat.r * k), sb: Math.round(bat.sb * k), bb: Math.round(bat.bb * k),
        so: Math.round(bat.so / k), d2: Math.round(bat.d2 * k), d3: Math.round(bat.d3 * k),
        avg: Math.round(bat.avg * (0.82 + 0.18 * k) * 1000) / 1000, obp: Math.round(bat.obp * (0.85 + 0.15 * k) * 1000) / 1000,
        slg: Math.round(bat.slg * (0.75 + 0.25 * k) * 1000) / 1000, ops: 0,
      } : undefined,
      pit: pit ? {
        ...pit,
        w: Math.round(pit.w * k), l: Math.round(pit.l / k), so: Math.round(pit.so * k), sv: Math.round(pit.sv * k), hld: Math.round(pit.hld * k),
        era: Math.round((pit.era / Math.pow(k, 1.6)) * 100) / 100, whip: Math.round((pit.whip / Math.pow(k, 0.8)) * 100) / 100,
      } : undefined,
    },
  };
  if (p.season.bat) p.season.bat.ops = Math.round((p.season.bat.obp + p.season.bat.slg) * 1000) / 1000;
  return p;
}

const rosterCache = new Map<string, Player[]>();
/** 그 해 그 구단 선수단 (그 해 리그에 없던 구단이면 빈 배열) */
export function seasonRoster(code: ClubCode, year: number): Player[] {
  const key = `${code}:${year}`;
  const hit = rosterCache.get(key);
  if (hit) return hit;
  const [from, to] = eraOfCode(code);
  if (year < from || year > to) { rosterCache.set(key, []); return []; }
  const team = teamByCode(code);
  const people = careers(code).filter((p) => p.from <= year && p.to >= year);
  // 외국인 자리 수를 넘으면 그 해는 국내 선수만 남긴다 (자리가 비면 다음 사람이 당겨 오지 않고 그냥 뺀다)
  let foreign = 0;
  const cap = foreignCap(year);
  const keep = people.filter((p) => (p.origin === 'KR' ? true : foreign++ < cap));
  const made = keep.map((p) => seasonPlayer(code, year, p));
  // 지금 구단의 최근 세 시즌은 목업 선수(이름 있는 카드)도 함께
  const real = !isOldCode(code) && year >= CURRENT_SEASON - 2 ? PLAYERS.filter((p) => p.teamId === team.id && /^p\d+$/.test(p.id) && p.id !== 'p41') : [];
  const out = [...real, ...made];
  registerPlayers(made);
  rosterCache.set(key, out);
  return out;
}

/** 연도팩 — 그 해 리그에 있던 모든 구단 선수 */
export function yearPool(year: number): Player[] {
  return clubsIn(year).flatMap((c) => seasonRoster(c, year));
}
