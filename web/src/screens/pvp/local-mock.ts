// 대전 화면 전용 목업 — 비동기 대전(다른 감독이 저장한 라인업과 혼자 붙기) · 랭킹 · 내 전적 · 경기 시뮬레이션.
// 결과는 서버 엔진이 정한다. 여기 sim 은 화면을 위한 흉내(시드 고정 — 같은 상대·같은 회차 = 같은 경기).
// 강조 문구는 '엔진 값'(승리 확률 변화 · 잡을 확률)으로 고르고 한 경기 4번까지 (요구 28).

import { CARDS, ME, PLAYERS, PVP_OPPONENTS, USER_RANKING, cardById, playerOfCard, teamById } from '../../game/mock';
import { FIELD_SPOTS, fenceAt, polarToField } from '../../game/field';
import { evaluate, initialLineup, store as lineupStore } from '../lineup/calc';
import { ownedCard } from '../../game/inventory';
import type { CardInst, Cause, HighlightKind, Player, Pos, PvpOpponent, Team } from '../../game/types';

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
  return {
    next,
    int: (lo: number, hi: number) => Math.floor(lo + (hi - lo + 1) * next()),
    pick: <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)],
    chance: (p: number) => next() < p,
    range: (lo: number, hi: number) => lo + (hi - lo) * next(),
  };
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ───────── 라인업 ───────── */
export interface Side {
  key: 'me' | 'opp';
  user: string;
  team: Team;
  rating: number;
  ovr: number;
  power: number;
  batting: { order: number; pos: Exclude<Pos, 'P'>; card: CardInst; player: Player }[];
  sp: { card: CardInst; player: Player };
  closer?: { card: CardInst; player: Player };
  lineupName: string;
  savedAgo?: string;
  style?: string;
}

const pc = (id: string) => { const c = ownedCard(id) ?? cardById(id)!; return { card: c, player: playerOfCard(c) }; };

/** 내 팀 종합 · 전력(엔트리 선수 점수 합) — 라인업 화면과 같은 계산 */
export function myStrength() {
  const ev = evaluate(lineupStore.get() ?? initialLineup());
  const power = Math.round(Object.values(ev.units).reduce((a, u) => a + (u ? u.total : 0), 0));
  return { ovr: ev.overall, power };
}

export function mySide(): Side {
  const { ovr, power } = myStrength();
  // 내 라인업 — 저장된 라인업(보유 카드 저장소)에서
  const st = lineupStore.get() ?? initialLineup();
  const batting = st.order.map((pos, i) => ({ pos, id: st.field[pos] })).filter((x): x is { pos: typeof x.pos; id: string } => !!x.id)
    .map((x, i) => ({ order: i + 1, pos: x.pos, ...pc(x.id) }));
  const sp = st.rotation[0] ?? st.rotation.find(Boolean) ?? null;
  const cl = st.closer ?? st.bullpen.find(Boolean) ?? sp;
  return {
    key: 'me', user: ME.user, team: teamById(ME.teamId), rating: ME.rating, ovr, power,
    batting, sp: pc(sp!), closer: pc(cl!), lineupName: '내 라인업',
  };
}

const POS_ORDER: Exclude<Pos, 'P'>[] = ['CF', 'SS', 'RF', '3B', 'DH', '1B', 'LF', 'C', '2B'];
const STYLE: Record<string, string> = { o1: '빅볼 · 좌타 거포', o2: '투수전 · 선발 에이스', o3: '스몰볼 · 마무리 총력', o4: '발야구 · 수비 강화', o5: '거포 몰빵', o6: '좌우 플래툰' };
const SAVED: Record<string, string> = { o1: '2시간 전', o2: '어제', o3: '5시간 전', o4: '3일 전', o5: '1시간 전', o6: '어제' };
const LNAME: Record<string, string> = { o1: '사직 정예', o2: '에이스 데이', o3: '9회 지키기', o4: '달려라', o5: '홈런 공장', o6: '플래툰 A' };

/** 상대가 저장해 둔 라인업 — 에이스 카드 + 그 구단 선수 + 다른 카드로 채움 */
export function oppSide(o: PvpOpponent): Side {
  const r = rng('opp:' + o.id);
  const team = teamById(o.teamId);
  const batters = CARDS.filter((c) => playerOfCard(c).pos !== 'P' && c.grade !== 'unique' && (playerOfCard(c).teamId !== 'dj' || o.teamId === 'dj'));
  const pitchers = CARDS.filter((c) => playerOfCard(c).pos === 'P' && c.grade !== 'unique' && (playerOfCard(c).teamId !== 'dj' || o.teamId === 'dj'));
  const ace = cardById(o.ace)!;
  const pool = [...batters].sort((a, b) => (playerOfCard(b).teamId === o.teamId ? 1 : 0) - (playerOfCard(a).teamId === o.teamId ? 1 : 0) || r.next() - 0.5);
  const used = new Set<string>();
  const batting: Side['batting'] = [];
  const aceP = playerOfCard(ace);
  if (aceP.pos !== 'P') { used.add(aceP.id); }
  POS_ORDER.forEach((pos, i) => {
    let c: CardInst | undefined;
    if (aceP.pos !== 'P' && !batting.some((b) => b.player.id === aceP.id) && (aceP.pos === pos || (pos === 'DH' && i === 4))) c = ace;
    if (!c) c = pool.find((x) => !used.has(playerOfCard(x).id) && (playerOfCard(x).pos === pos || r.chance(0.12)));
    if (!c) c = pool.find((x) => !used.has(playerOfCard(x).id));
    if (!c) return;
    used.add(playerOfCard(c).id);
    batting.push({ order: i + 1, pos, card: c, player: playerOfCard(c) });
  });
  if (aceP.pos !== 'P' && !batting.some((b) => b.player.id === aceP.id)) batting[3] = { order: 4, pos: batting[3].pos, card: ace, player: aceP };
  const spCard = aceP.pos === 'P' && aceP.role === 'SP' ? ace : pitchers.filter((c) => playerOfCard(c).role === 'SP').sort((a, b) => (playerOfCard(b).teamId === o.teamId ? 1 : 0) - (playerOfCard(a).teamId === o.teamId ? 1 : 0) || playerOfCard(b).ovr - playerOfCard(a).ovr)[r.int(0, 1)];
  const clCard = aceP.pos === 'P' && aceP.role !== 'SP' ? ace : pitchers.filter((c) => playerOfCard(c).role !== 'SP').sort((a, b) => playerOfCard(b).ovr - playerOfCard(a).ovr)[r.int(0, 2)];
  return {
    key: 'opp', user: `${o.user} (AI)`, team, rating: o.rating, ovr: o.lineupOvr, power: o.power,
    batting, sp: { card: spCard, player: playerOfCard(spCard) }, closer: { card: clCard, player: playerOfCard(clCard) },
    lineupName: LNAME[o.id] ?? '대전용', savedAgo: SAVED[o.id], style: STYLE[o.id],
  };
}

/* ───────── 승리 확률 · 레이팅 ───────── */
/** 홈 기준 승리 확률 — 점수 차와 남은 반 이닝으로 */
export function wpHome(diff: number, halvesLeft: number) {
  if (halvesLeft <= 0) return diff > 0 ? 1 : diff < 0 ? 0 : 0.5;
  const sd = Math.sqrt(0.48 * halvesLeft + 0.25);
  return 1 / (1 + Math.exp(-((diff + 0.12) / sd) * 1.7));
}
export function expected(me: number, opp: number) { return 1 / (1 + 10 ** ((opp - me) / 400)); }
export function ratingDelta(me: number, opp: number, res: 'W' | 'D' | 'L') {
  const sc = res === 'W' ? 1 : res === 'D' ? 0.5 : 0;
  return Math.round(24 * (sc - expected(me, opp)));
}

/* ───────── 시뮬레이션 (화면용 흉내) ───────── */
export interface Beat {
  inning: number;
  half: 'top' | 'bot';
  runs: number;
  hits: number;
  /** 플레이 뒤 점수 [원정, 홈] */
  score: [number, number];
  /** 플레이 뒤 '내' 승리 확률 */
  wpMe: number;
  /** 문자 중계 한 줄 (득점·장면이 있을 때만) */
  text?: string;
  causes?: Cause[];
  /** 공 떨어진 곳 · 수비 범위 */
  ball?: { x: number; y: number; kind: 'fly' | 'line' | 'ground' };
  range?: { x: number; y: number; r: number; pos: Pos; name: string };
  bases?: [boolean, boolean, boolean];
  outs?: number;
  highlight?: { kind: HighlightKind; title: string; sub: string; meta: string; teamKey: 'me' | 'opp'; dwp: number };
}

export interface Sim {
  away: Side;
  home: Side;
  beats: Beat[];
  final: [number, number];
  line: { away: (number | null)[]; home: (number | null)[]; ah: number; hh: number; ae: number; he: number };
  result: 'W' | 'D' | 'L';
  innings: number;
  keyFactors: Cause[];
}

const DIRS = ['좌중간', '우중간', '좌전', '우전', '중전', '좌측 선상', '우측 선상'];

export function simulate(me: Side, opp: Side, seed: string): Sim {
  const r = rng(seed);
  const away = me, home = opp; // 대전은 도전받는 쪽 구장에서 — 나는 원정
  const st = home.team.stadium;
  const beats: Beat[] = [];
  const line = { away: [] as (number | null)[], home: [] as (number | null)[] };
  let sa = 0, sh = 0, ha = 0, hh = 0;
  const idx = { away: 0, home: 0 };
  const edgeA = (away.ovr - home.ovr) * 0.012;
  const runsFor = (bonus: number) => {
    const x = r.next() - bonus;
    return x < 0.66 ? 0 : x < 0.83 ? 1 : x < 0.92 ? 2 : x < 0.97 ? 3 : 4;
  };
  let inning = 1;
  const maxInn = 12;
  for (; inning <= maxInn; inning++) {
    for (const half of ['top', 'bot'] as const) {
      if (half === 'bot' && inning >= 9 && sh > sa) { line.home.push(null); continue; }
      const bat = half === 'top' ? away : home;
      const fld = half === 'top' ? home : away;
      let runs = runsFor(half === 'top' ? edgeA : -edgeA + 0.02);
      // 끝내기는 이기는 만큼만
      if (half === 'bot' && inning >= 9 && sh + runs > sa) runs = Math.max(1, sa - sh + 1);
      const hits = runs + r.int(0, 2);
      const lineupIdx = idx[half === 'top' ? 'away' : 'home'];
      idx[half === 'top' ? 'away' : 'home'] = (lineupIdx + 3 + r.int(0, 2)) % 9;
      const hitter = bat.batting[(lineupIdx + r.int(0, 2)) % 9];
      const before: [number, number] = [sa, sh];
      if (half === 'top') { sa += runs; ha += hits; line.away.push(runs); } else { sh += runs; hh += hits; line.home.push(runs); }
      const halvesLeft = (Math.max(9, inning) - inning) * 2 + (half === 'top' ? 1 : 0);
      const end = half === 'bot' && inning >= 9 && sh !== sa ? true : half === 'bot' && inning >= 9 && sh > sa;
      const wpH = end ? (sh > sa ? 1 : 0) : (half === 'top' && inning >= 9 && sa < sh) ? 1 : wpHome(sh - sa, halvesLeft);
      const wpMe = 1 - wpH;
      const prevWpMe = beats.length ? beats[beats.length - 1].wpMe : 1 - wpHome(0, 18);
      const beat: Beat = { inning, half, runs, hits, score: [sa, sh], wpMe };
      // 득점 장면 문구
      if (runs > 0) {
        const hr = runs >= 2 && r.chance(0.55) || runs === 4;
        const dir = r.pick(DIRS);
        const desc = hr ? (runs === 4 ? '만루 홈런' : `${dir} ${runs}점 홈런`) : runs === 1 ? `${dir} 적시타` : `${dir} ${runs}타점 2루타`;
        beat.text = `${hitter.player.name}, ${desc}`;
        const ang = dir.startsWith('좌') ? -24 : dir.startsWith('우') ? 24 : 0;
        const dist = hr ? fenceAt(st.fence, ang) + r.int(3, 14) : r.int(62, 92);
        const pt = polarToField(ang + r.int(-6, 6), dist);
        beat.ball = { x: pt.x, y: pt.y, kind: hr ? 'fly' : 'line' };
        const causes: Cause[] = [];
        if (hr && st.backdrop === 'sea' && r.chance(0.6)) causes.push({ factor: 'wind', text: `바닷바람 +${r.int(3, 6)}m — 없었으면 담장 앞 뜬공`, decisive: true });
        else if (r.chance(0.45)) causes.push({ factor: 'adapt', text: `${r.pick(['세 번째 슬라이더', '두 번째 커브', '같은 코스 직구'])}에 눈이 익음` });
        if (r.chance(0.3)) causes.push({ factor: 'chem', text: '케미 3단 — 앞 타자와 작전 사인 척척' });
        beat.causes = causes.slice(0, 2);
        beat.bases = [r.chance(0.4), r.chance(0.3), false];
        beat.outs = r.int(0, 2);
      } else {
        // 무득점이지만 위기였던 반 이닝 · 호수비 후보
        const threat = r.chance(0.2 + (inning >= 7 ? 0.16 : 0));
        const gem = !threat && r.chance(0.18);
        if (threat) {
          beat.bases = [true, true, r.chance(0.55)];
          beat.outs = 2;
          const fldP = (half === 'top' ? home : away);
          const pitcher = inning >= 8 && fldP.closer ? fldP.closer : fldP.sp;
          beat.text = `${pitcher.player.name}, ${beat.bases[2] ? '2사 만루' : '2사 1·2루'}에서 ${r.pick(['헛스윙 삼진', '유격수 땅볼', '내야 뜬공'])}`;
          const sig = pitcher.card.signaturePitch;
          beat.causes = sig ? [{ factor: 'signature', text: `${sig.name} — 결정구` }] : [{ factor: 'hidden', text: '압박감 강심장 — 만루에서 흔들리지 않음' }];
          (beat as Beat & { threat: number }).threat = beat.bases[2] ? 2.2 : 1.4;
        } else if (gem) {
          const pos = r.pick(['CF', 'RF', 'LF', 'SS'] as const);
          const f = fld.batting.find((b) => b.pos === pos) ?? fld.batting[0];
          const spot = FIELD_SPOTS[pos];
          const rr = pos === 'SS' ? 0.07 : 0.15;
          const a = r.range(-Math.PI, 0);
          beat.range = { x: spot.x, y: spot.y, r: rr, pos, name: f.player.name };
          beat.ball = { x: spot.x + Math.cos(a) * rr * 0.97, y: spot.y + Math.sin(a) * rr * 0.97, kind: pos === 'SS' ? 'line' : 'fly' };
          const cp = r.int(9, 24);
          beat.text = `${hitter.player.name}의 ${pos === 'SS' ? '강한 직선타' : '깊숙한 타구'} — ${f.player.name} 다이빙 캐치`;
          beat.causes = [{ factor: 'range', text: `수비 범위 넓음(${f.player.name})` }, ...(r.chance(0.5) ? [{ factor: 'enhance' as const, text: `강화 ${['V', 'VI', 'VII'][r.int(0, 2)]} — 첫발 반응 +${r.int(3, 5)}` }] : [])];
          (beat as Beat & { gem: { cp: number; who: string; team: 'me' | 'opp' } }).gem = { cp, who: f.player.name, team: fld.key };
          beat.bases = [r.chance(0.5), r.chance(0.4), false];
          beat.outs = 2;
        }
      }
      // 강조 후보 — 엔진 값(승리 확률 변화)
      const dMe = wpMe - prevWpMe;
      const batKey = bat.key, fldKey = fld.key;
      const tied = sa === sh, wasTied = before[0] === before[1];
      const leadNow = Math.sign(sa - sh), leadBefore = Math.sign(before[0] - before[1]);
      const ext = beat as Beat & { threat?: number; gem?: { cp: number; who: string; team: 'me' | 'opp' } };
      if (runs > 0) {
        const swing = Math.abs(dMe);
        if (half === 'bot' && inning >= 9 && sh > sa) {
          beat.highlight = { kind: 'walkoff', title: '끝내기!', sub: `${hitter.player.name} · ${inning}회말 ${beat.text!.split(', ')[1]}`, meta: `승리 확률 ${Math.round((1 - prevWpMe) * 100)}% → 100%`, teamKey: batKey, dwp: 1 };
        } else if (leadNow !== 0 && leadNow !== leadBefore && !wasTied) {
          beat.highlight = { kind: 'go-ahead', title: inning >= 7 ? '역전 결승타!' : '역전!', sub: `${hitter.player.name} · ${inning}회${half === 'top' ? '초' : '말'} ${beat.text!.split(', ')[1]}`, meta: winMeta(batKey, prevWpMe, wpMe), teamKey: batKey, dwp: swing + 0.1 };
        } else if (tied && !wasTied) {
          beat.highlight = { kind: 'clutch', title: '동점 적시타!', sub: `${hitter.player.name} · ${inning}회${half === 'top' ? '초' : '말'}`, meta: winMeta(batKey, prevWpMe, wpMe), teamKey: batKey, dwp: swing + 0.05 };
        } else if (wasTied && leadNow !== 0) {
          beat.highlight = { kind: inning >= 7 ? 'go-ahead' : 'clutch', title: inning >= 7 ? '결승타!' : runs >= 2 ? '균형을 깨는 한 방!' : '선제 적시타!', sub: `${hitter.player.name} · ${inning}회${half === 'top' ? '초' : '말'}`, meta: winMeta(batKey, prevWpMe, wpMe), teamKey: batKey, dwp: swing };
        }
      } else if (ext.threat && Math.abs(sa - sh) <= 3 && inning >= 5) {
        // 막지 못했으면 — 기대 실점만큼 확률이 기울었을 것
        const lost = Math.abs(wpHome((sh - sa) + (half === 'top' ? -ext.threat : ext.threat), halvesLeft) - wpHome(sh - sa, halvesLeft));
        beat.highlight = { kind: 'escape', title: beat.bases?.[2] ? '만루 위기 탈출!' : '위기 탈출!', sub: beat.text!.split(', ')[0] + ` · ${inning}회 ${beat.bases?.[2] ? '2사 만루' : '2사 1·2루'} 무실점`, meta: `막아 낸 승리 확률 ${Math.round(lost * 100)}%p`, teamKey: fldKey, dwp: lost };
      } else if (ext.gem) {
        const lost = Math.abs(wpHome((sh - sa) + (half === 'top' ? -1.2 : 1.2), halvesLeft) - wpHome(sh - sa, halvesLeft));
        beat.highlight = { kind: 'defense', title: '호수비!', sub: `${ext.gem.who} · 다이빙 캐치`, meta: `잡을 확률 ${ext.gem.cp}% · 실점 막음`, teamKey: ext.gem.team, dwp: lost + 0.04 };
      }
      beats.push(beat);
      if (half === 'bot' && inning >= 9 && sh !== sa) break;
    }
    if (inning >= 9 && sa !== sh) break;
  }
  // 한 경기 강조 4번까지 — 엔진 값이 큰 순서로 (끝내기는 늘)
  // 경기 후반일수록 무겁게 (레버리지) — 1~3회 장면은 웬만해선 안 띄운다
  const lev = (b: Beat) => b.highlight!.dwp * (b.inning >= 7 ? 1.35 : b.inning >= 4 ? 1 : 0.55);
  const hl = beats.filter((b) => b.highlight).sort((a, b) => lev(b) - lev(a));
  // 같은 종류는 2번까지(위기 탈출·호수비는 1번) — 자주 나오면 싱겁다
  const keep = new Set<Beat>();
  const per: Record<string, number> = {};
  for (const b of hl) {
    if (keep.size >= 4 || lev(b) < 0.07) break;
    const k = b.highlight!.kind;
    const cap = k === 'escape' || k === 'defense' ? 1 : 2;
    if ((per[k] ?? 0) >= cap) continue;
    per[k] = (per[k] ?? 0) + 1;
    keep.add(b);
  }
  beats.forEach((b) => { if (b.highlight && !keep.has(b)) delete b.highlight; });
  // '결승'은 끝까지 리드를 지켰을 때만
  beats.forEach((b, i) => {
    if (!b.highlight || !b.highlight.title.includes('결승')) return;
    const sign = Math.sign(b.score[0] - b.score[1]);
    const held = beats.slice(i).every((x) => Math.sign(x.score[0] - x.score[1]) === sign);
    if (!held) b.highlight.title = b.highlight.title.startsWith('역전') ? '역전!' : '앞서가는 한 방!';
  });
  const innings = Math.max(line.away.length, 9);
  while (line.away.length < innings) line.away.push(null);
  while (line.home.length < innings) line.home.push(null);
  const result: Sim['result'] = sa > sh ? 'W' : sa < sh ? 'L' : 'D';
  const keyFactors = beats.filter((b) => b.causes?.length && (b.highlight || b.runs >= 2)).flatMap((b) => b.causes!.slice(0, 1)).slice(0, 3);
  return { away, home, beats, final: [sa, sh], line: { ...line, ah: ha, hh, ae: r.int(0, 1), he: r.int(0, 2) }, result, innings, keyFactors };
}

function winMeta(teamKey: 'me' | 'opp', prevMe: number, nowMe: number) {
  const a = teamKey === 'me' ? prevMe : 1 - prevMe, b = teamKey === 'me' ? nowMe : 1 - nowMe;
  return `승리 확률 ${Math.round(a * 100)}% → ${Math.round(b * 100)}%`;
}

/* ───────── 랭킹 ───────── */
export type RankBy = 'rating' | 'pct' | 'power' | 'collection';
export interface RankRow { rank: number; user: string; teamId: string; rating: number; delta: number; w: number; d: number; l: number; power: number; collection: number; me?: boolean }
const NAMES = ['호랑이3대째', '큰발응원단', '월미등대', '한강반달', '팔달요술', '갑천물새', '사직파도', '대공원사자', '마산아재', '잠실불펜', '돔지붕', '영산강물결', '창원골판', '수원성곽', '인천항갈매기', '고척바람', '광안대교', '달구벌땡볕', '무등산정상', '한밭칼국수'];
const TEAMS_ID = ['gj', 'bs', 'ic', 'sb', 'sw', 'dj', 'bs', 'dg', 'cw', 'st', 'sh', 'gj', 'cw', 'sw', 'ic', 'sh', 'bs', 'dg', 'gj', 'dj'];

export function rankingTop(by: RankBy): RankRow[] {
  const base = USER_RANKING.filter((x) => !x.me);
  const extra: RankRow[] = NAMES.slice(5).map((u, i) => {
    const r = rng('rk:' + u);
    const w = r.int(44, 58), d = r.int(0, 4), l = r.int(14, 26);
    return { rank: 0, user: u, teamId: TEAMS_ID[i + 5], rating: 2330 - i * 21 - r.int(0, 15), delta: r.int(-18, 24), w, d, l, power: 1040 + r.int(0, 66), collection: 760 + r.int(0, 300) };
  });
  const all: RankRow[] = [...base.map((x) => ({ ...x })), ...extra];
  const key = (x: RankRow) => (by === 'rating' ? x.rating : by === 'pct' ? x.w / Math.max(1, x.w + x.l) : by === 'power' ? x.power : x.collection);
  return all.sort((a, b) => key(b) - key(a)).slice(0, 10).map((x, i) => ({ ...x, rank: i + 1 }));
}
/** 내 순위 (카테고리마다 따로 집계) */
export const MY_RANK: Record<RankBy, { rank: number; of: number }> = {
  rating: { rank: 128, of: 3208 }, pct: { rank: 211, of: 3208 }, power: { rank: 96, of: 3208 }, collection: { rank: 403, of: 3208 },
};
export function meRow(): RankRow {
  const m = USER_RANKING.find((x) => x.me)!;
  return { ...m, me: true };
}

/* ───────── 내 전적 ───────── */
export interface LogRow { date: string; oppUser: string; oppTeam: string; my: number; their: number; res: 'W' | 'D' | 'L'; delta: number; tag?: string }
export function myLog(): LogRow[] {
  const r = rng('mylog');
  return Array.from({ length: 10 }, (_, i) => {
    const res: LogRow['res'] = (['W', 'W', 'L', 'W', 'D', 'W', 'L', 'W', 'W', 'L'] as const)[i];
    const my = res === 'L' ? r.int(1, 4) : r.int(3, 9);
    const their = res === 'W' ? r.int(0, my - 1) : res === 'D' ? my : r.int(my + 1, my + 5);
    const u = r.int(0, NAMES.length - 1);
    return {
      date: `6.${14 - Math.floor(i / 2)}`, oppUser: NAMES[u], oppTeam: TEAMS_ID[u], my, their, res,
      delta: res === 'W' ? r.int(9, 19) : res === 'D' ? r.int(-2, 3) : -r.int(8, 17),
      tag: res === 'D' ? (r.chance(0.5) ? '연장 12회' : undefined) : res === 'W' ? (their === 0 ? '완봉' : r.chance(0.3) ? r.pick(['끝내기', '역전승', '대역전']) : undefined) : (r.chance(0.2) ? '호수비에 막힘' : undefined),
    };
  });
}
/** 지난 20판 레이팅 */
export function ratingSeries(): number[] {
  const r = rng('rating-series');
  const out: number[] = [ME.rating];
  for (let i = 0; i < 19; i++) out.unshift(out[0] - (r.next() < 0.6 ? r.int(6, 18) : -r.int(6, 16)));
  return out;
}
/** 구단별 상대 전적 */
export function vsClubs() {
  const r = rng('vsclub');
  return ['bs', 'gj', 'dg', 'sb', 'st', 'sh', 'ic', 'cw', 'sw'].map((id) => {
    const w = r.int(2, 8), l = r.int(1, 6), d = r.int(0, 1);
    return { teamId: id, w, d, l };
  });
}

export { PVP_OPPONENTS, ME, PLAYERS };
