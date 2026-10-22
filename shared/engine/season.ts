// 시즌 도우미 — 일정(10구단 144경기, 월요일 휴식), 날씨 취소·재편성(지연 계산), 자동 라인업·로테이션·불펜 가용,
// 경기 사이 상태 갱신(팔 피로·연투·야수 피로·부상 일수·컨디션·폼), 순위·누적 기록.
import type { PlayerIn, TeamIn, Park, Pos, PitRole, GameResult } from './types.ts';
import { A } from './player.ts';
import { dayPitcher, dayFielder, availability } from './fatigue.ts';
import { injuryDays, INJURIES } from './injury.ts';
import { seqRng, clamp } from './rng.ts';
import { dateStr, parseDate } from './weather.ts';

export const POSL: Pos[] = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
const PIDX: Record<string, number> = { P: 0, C: 1, '1B': 2, '2B': 3, '3B': 4, SS: 5, LF: 6, CF: 7, RF: 8, DH: 9 };

/** 시즌 일정: 날짜별 경기 [원정, 홈] (팀 인덱스). 각 쌍 16경기(홈 8·원정 8), 2연전 단위, 월요일 휴식 */
export interface SchedDay { date: string; games: [number, number][] }
export function makeSchedule(nTeams: number, year: number, startMD = '03-30', perPair = 16): SchedDay[] {
  const n = nTeams; const rounds: [number, number][][] = [];
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let r = 0; r < n - 1; r++) {
    const pairs: [number, number][] = [];
    for (let k = 0; k < n / 2; k++) { const a = arr[k], b = arr[n - 1 - k]; pairs.push(r % 2 === 0 ? [a, b] : [b, a]); }
    rounds.push(pairs);
    arr.splice(1, 0, arr.pop()!);
  }
  const series = perPair / 2;   // 2연전 수
  const days: SchedDay[] = [];
  let doy = parseDate(`${year}-${startMD}`).doy;
  const nextDay = (): string => { while (true) { const ds = dateStr(year, doy); const dow = new Date(Date.UTC(year, 0, doy)).getUTCDay(); doy++; if (dow !== 1) return ds; } };
  for (let c = 0; c < series; c++) for (let r = 0; r < n - 1; r++) for (let d = 0; d < 2; d++) {
    const flip = c % 2 === 1;
    days.push({ date: nextDay(), games: rounds[r].map(([a, b]) => (flip ? [b, a] : [a, b]) as [number, number]) });
  }
  return days;
}
/** 경기 시작 시각(KST 분): 평일 18:30 · 토 17:00 · 일 14:00, 혹서기(8/11~9/6) 19:00(돔 제외) */
export function startTime(date: string, dome: boolean): number {
  const { y, doy } = parseDate(date); const dow = new Date(Date.UTC(y, 0, doy)).getUTCDay();
  const hot = doy >= parseDate(`${y}-08-11`).doy && doy <= parseDate(`${y}-09-06`).doy;
  if (hot && !dome) return 19 * 60;
  return dow === 6 ? 17 * 60 : dow === 0 ? 14 * 60 : 18 * 60 + 30;
}
/** 취소 경기 재편성: 시즌 끝 뒤 빈 날(월요일 제외)로 */
export function reschedule(days: SchedDay[], postponed: [number, number][], year: number): void {
  if (!postponed.length) return;
  let doy = parseDate(days[days.length - 1].date).doy + 1;
  let todo = postponed.slice();
  while (todo.length) {
    const ds = dateStr(year, doy); const dow = new Date(Date.UTC(year, 0, doy)).getUTCDay(); doy++;
    if (dow === 1) continue;
    const used = new Set<number>(); const today: [number, number][] = []; const rest: [number, number][] = [];
    for (const gm of todo) { if (!used.has(gm[0]) && !used.has(gm[1])) { today.push(gm); used.add(gm[0]); used.add(gm[1]); } else rest.push(gm); }
    days.push({ date: ds, games: today }); todo = rest;
  }
}

// ── 구단 시즌 상태 ──
export interface ClubSeason {
  id: string; park: Park; players: PlayerIn[]; byId: Map<number, PlayerIn>;
  primary: Map<number, string>; role: Map<number, string>;   // 야수 주 포지션, 투수 역할(SP·RP·CL)
  rotation: number[]; rotIdx: number; lastStart: Map<number, number>;
  injuredUntil: Map<number, number>;
  W: number; L: number; T: number; RS: number; RA: number; streak: number; mood: number;
  bat: Map<number, Record<string, number>>; pit: Map<number, Record<string, number>>;
  injuries: { pid: number; type: string; days: number; day: number }[];
  mgr?: TeamIn['mgr']; tac?: TeamIn['tac']; chemTier: number;
  /** 1군(1)·2군(2). 경기에 나오는 건 1군 엔트리(타자 13·투수 14)뿐 — 부상으로 모자라면 2군에서 올린다 */
  tier: Map<number, 1 | 2>;
}
export function newClub(id: string, park: Park, players: PlayerIn[], primary: Map<number, string>, role: Map<number, string>, tier?: Map<number, 1 | 2>): ClubSeason {
  const sps = players.filter((p) => role.get(p.id) === 'SP');
  // 로테이션: 선발 5명(스태미나·위력 순)
  const val = (p: PlayerIn) => (p.attrs[A.stamina] ?? 50) * 0.3 + (p.pitches ?? []).reduce((s, x) => s + x.stuff * x.use / 100, 0) + (p.attrs[A.control] ?? 50) * 0.4;
  const rot = sps.sort((a, b) => val(b) - val(a)).slice(0, 5).map((p) => p.id);
  for (const p of players) p.state = p.state ?? { cond: 0, fatigue: 0, arm: 0, sense: 80, conf: 50, morale: 60, b2b: [0, 0, 0], flags: [] };
  return { id, park, players, byId: new Map(players.map((p) => [p.id, p])), primary, role, rotation: rot, rotIdx: 0, lastStart: new Map(), injuredUntil: new Map(),
    W: 0, L: 0, T: 0, RS: 0, RA: 0, streak: 0, mood: 55, bat: new Map(), pit: new Map(), injuries: [], chemTier: 1, tier: tier ?? new Map(players.map((p) => [p.id, 1 as const])) };
}
/** 그날 1군 엔트리: 다치지 않은 1군 + 모자란 만큼 2군에서 콜업(포수·선발 투수 먼저). 타자 13·투수 14 (KBO 1군 28명 중 출전 26명 기준) */
const ACTIVE_BAT = 13, ACTIVE_PIT = 14;
function activeRoster(c: ClubSeason, day: number): { bats: PlayerIn[]; pits: PlayerIn[] } {
  const ok = (p: PlayerIn) => (c.injuredUntil.get(p.id) ?? -1) < day;
  const isP = (p: PlayerIn) => c.role.get(p.id) !== undefined;
  const one = c.players.filter((p) => ok(p) && (c.tier.get(p.id) ?? 1) === 1), two = c.players.filter((p) => ok(p) && (c.tier.get(p.id) ?? 1) === 2);
  const bats = one.filter((p) => !isP(p)), pits = one.filter(isP);
  const pv = (p: PlayerIn) => (p.pitches ?? []).reduce((s2, x) => s2 + x.stuff * x.use / 100, 0) + 0.45 * (p.attrs[A.control] ?? 50);
  const hv = (p: PlayerIn) => hitVal(p) + (p.pos[1] ?? 1) * (bats.filter((b) => c.primary.get(b.id) === 'C').length < 2 ? 3 : 0);   // 포수가 모자라면 포수부터
  const b2 = two.filter((p) => !isP(p)).sort((a, b) => hv(b) - hv(a)); while (bats.length < ACTIVE_BAT && b2.length) bats.push(b2.shift()!);
  const spNeed = () => pits.filter((p) => c.role.get(p.id) === 'SP').length < 5;
  const p2 = two.filter(isP).sort((a, b) => (spNeed() ? (c.role.get(b.id) === 'SP' ? 100 : 0) - (c.role.get(a.id) === 'SP' ? 100 : 0) : 0) + pv(b) - pv(a));
  while (pits.length < ACTIVE_PIT && p2.length) pits.push(p2.shift()!);
  return { bats, pits };
}

/** 타자 라인업 가치(대략): 컨택·파워·선구·주력 */
function hitVal(p: PlayerIn): number { const a = p.attrs; return 0.35 * ((a[A.contactR] + a[A.contactL]) / 2) + 0.30 * a[A.power] + 0.15 * a[A.eye] + 0.10 * a[A.avoidK] + 0.10 * a[A.speed]; }
function defVal(p: PlayerIn, pos: string): number { const a = p.attrs; const prof = p.pos[PIDX[pos]] ?? 1; const m = prof >= 18 ? 1 : prof >= 15 ? 0.94 : prof >= 10 ? 0.84 : prof >= 5 ? 0.68 : 0.5; return m * (a[A.range] + a[A.firstStep] + a[A.hands] + a[A.armStr]) / 4 + (prof < 10 ? -20 : 0); }

/** 그날 자동 라인업(AI·유저 기본): 다친 선수·지친 선수 빼고 포지션별 주전, 지명타자, 타순, 선발, 불펜 가용 */
export function autoTeamIn(c: ClubSeason, day: number, opts: { level?: 1 | 2 | 3 | 4 | 5 | 6; style?: -2 | -1 | 0 | 1 | 2; isUser?: boolean } = {}): TeamIn {
  const ok = (p: PlayerIn) => (c.injuredUntil.get(p.id) ?? -1) < day;
  const act = activeRoster(c, day);
  const bats = act.bats;
  const used = new Set<number>(); const lineup: { pid: number; pos: Pos }[] = [];
  // 포수: 피로 높으면 백업
  for (const pos of POSL) {
    let best: PlayerIn | null = null, bv = -1e9;
    for (const p of bats) {
      if (used.has(p.id)) continue;
      const prim = c.primary.get(p.id) === pos;
      const tired = (p.state?.fatigue ?? 0) > (pos === 'C' ? 55 : 75);
      const v = (prim ? 100 : 0) + defVal(p, pos) * 0.5 + hitVal(p) * 0.6 - (tired ? 60 : 0);
      if (v > bv) { bv = v; best = p; }
    }
    if (best) { used.add(best.id); lineup.push({ pid: best.id, pos }); }
  }
  // 지명타자: 남은 타자 중 최고
  let dh: PlayerIn | null = null, dv = -1e9;
  for (const p of bats) { if (used.has(p.id)) continue; const v = hitVal(p) - ((p.state?.fatigue ?? 0) > 80 ? 30 : 0); if (v > dv) { dv = v; dh = p; } }
  if (dh) { used.add(dh.id); lineup.push({ pid: dh.id, pos: 'DH' }); }
  // 타순: 가치 순 [2,1,3,0,4,5,6,7,8] 배치(1번은 출루·주력)
  const ranked = lineup.slice().sort((a, b) => hitVal(c.byId.get(b.pid)!) - hitVal(c.byId.get(a.pid)!));
  const obp = (p: PlayerIn) => 0.4 * ((p.attrs[A.contactR] + p.attrs[A.contactL]) / 2) + 0.35 * p.attrs[A.eye] + 0.25 * p.attrs[A.speed];
  const top5 = ranked.slice(0, 5); const lead = top5.slice().sort((a, b) => obp(c.byId.get(b.pid)!) - obp(c.byId.get(a.pid)!))[0];
  const rest = ranked.filter((x) => x !== lead);
  const order = [lead, rest[0], rest[1], rest[2], rest[3], rest[4], rest[5], rest[6], rest[7]].filter(Boolean);
  // 선발: 로테이션 순서, 4일 휴식
  let sp = -1;
  for (let k = 0; k < 5 && sp < 0; k++) { const id = c.rotation[(c.rotIdx + k) % c.rotation.length]; const p = c.byId.get(id); if (!p || !ok(p)) continue; const last = c.lastStart.get(id) ?? -99; if (day - last >= 5) { sp = id; c.rotIdx = (c.rotIdx + k + 1) % c.rotation.length; } }
  const pitchers = act.pits;
  // 대체 선발: 로테이션 투수가 다쳤거나 덜 쉬었으면 로테이션 밖 선발 자원(2군 선발·스윙맨) 중 충분히 쉰 가장 좋은 투수 — 실제 구단이 2군 선발을 올리는 것처럼
  if (sp < 0) {
    let best = -1, bv = -1e9;
    for (const p of pitchers) {
      if (c.role.get(p.id) !== 'SP' || c.rotation.includes(p.id)) continue;
      if (day - (c.lastStart.get(p.id) ?? -99) < 5 || (p.state?.b2b?.[0] ?? 0) > 0 || (p.state?.b2b?.[1] ?? 0) > 0) continue;
      const v = (p.attrs[A.stamina] ?? 50) * 0.3 + (p.pitches ?? []).reduce((s, x) => s + x.stuff * x.use / 100, 0) + (p.attrs[A.control] ?? 50) * 0.4;
      if (v > bv) { bv = v; best = p.id; }
    }
    sp = best;
  }
  let opener = false;
  if (sp < 0) { // 불펜 데이: 휴식 가장 긴 롱맨 — 구원 투수가 먼저 나가므로 투구 수를 짧게(오프너)
    let best = -1, bv = -1; for (const p of pitchers) { if (c.role.get(p.id) === 'CL') continue; const r = day - (c.lastStart.get(p.id) ?? -99); const v = r * 10 - (p.state?.arm ?? 0) + (p.attrs[A.stamina] ?? 0) * 0.3; if (v > bv && (p.state?.b2b?.[0] ?? 0) === 0) { bv = v; best = p.id; } } sp = best;
    opener = sp >= 0 && c.role.get(sp) !== 'SP';
  }
  // 불펜 역할: CL·SU 2·MID·LONG·MOP·LOOGY
  const rps = pitchers.filter((p) => p.id !== sp && (c.role.get(p.id) === 'RP' || c.role.get(p.id) === 'CL' || !c.rotation.includes(p.id)));
  const pv = (p: PlayerIn) => (p.pitches ?? []).reduce((s, x) => s + x.stuff * x.use / 100, 0) + 0.45 * (p.attrs[A.control] ?? 50) + 0.25 * (p.attrs[A.velocity] ?? 50);
  const sorted = rps.slice().sort((a, b) => pv(b) - pv(a));
  const pen: TeamIn['pen'] = [];
  const cl = sorted.find((p) => c.role.get(p.id) === 'CL') ?? sorted[0];
  const roleOf = (p: PlayerIn, k: number): PitRole => {
    if (p === cl) return 'CL'; if (k <= 2) return 'SU';
    if ((p.attrs[A.stamina] ?? 0) >= 55 && !pen.some((x) => x.role === 'LONG')) return 'LONG';
    if (p.throws === 'L' && !pen.some((x) => x.role === 'LOOGY')) return 'LOOGY';
    return 'MID';
  };
  sorted.forEach((p, k) => {
    const isSP = c.rotation.includes(p.id) || c.role.get(p.id) === 'SP';   // 대체 선발 자원도 불펜에선 비상시만(쉬게 해서 선발 날 쓸 수 있게)
    const st = p.state ?? {};
    const av = availability(st, false, day - (c.lastStart.get(p.id) ?? -99), (p.traits ?? []).includes('rubberArm'));
    const avail = isSP ? ((day - (c.lastStart.get(p.id) ?? -99)) >= 3 ? 1 : 0) as 0 | 1 : av;
    pen.push({ pid: p.id, role: isSP ? 'LONG' : roleOf(p, k), avail });
  });
  if (pen.length && !pen.some((x) => x.role === 'MOP')) { const last = [...pen].reverse().find((x) => x.role === 'MID'); if (last) last.role = 'MOP'; }
  const bench = bats.filter((p) => !used.has(p.id)).map((p) => p.id);
  // 오프너(구원 투수 선발)는 40~50구에서 내린다 — 전술의 투수별 한계 투구 수로 전달
  const stamSP = sp >= 0 ? (c.byId.get(sp)?.attrs[A.stamina] ?? 40) : 40;
  const tac = opener ? { ...(c.tac ?? {}), pit: { ...(c.tac?.pit ?? {}), [sp]: { ...(c.tac?.pit?.[sp] ?? {}), limit: Math.round(Math.min(60, 35 + 0.3 * stamSP)) } } } : c.tac;
  return { id: c.id, isUser: !!opts.isUser, players: c.players, lineup: order.map((x) => ({ pid: x.pid, pos: x.pos })), sp, pen, bench, tac, mgr: c.mgr ?? { style: opts.style ?? 0, level: opts.level ?? 3 }, mood: c.mood, streak: c.streak, chemTier: c.chemTier };
}

/** 경기 뒤 상태 갱신(하루): 투수 팔 피로·연투, 야수 피로, 부상 등록, 컨디션·폼, 순위 */
export function afterGame(c: ClubSeason, side: 0 | 1, res: GameResult, day: number, heatAT: number, seed: string): void {
  const r = seqRng(seed);
  const pitched = new Map<number, number>(); for (const u of res.usage) if (u.team === side) pitched.set(u.pid, u.pitches);
  const starter = res.box.pit[side][0]?.pid; if (starter !== undefined) c.lastStart.set(starter, day);
  const played = new Set(res.box.bat[side].map((b) => b.pid));
  for (const p of c.players) {
    const st = p.state!;
    if (c.role.get(p.id) !== undefined) dayPitcher(st, p.attrs[A.recovery] ?? 50, pitched.get(p.id) ?? 0, (p.traits ?? []).includes('rubberArm'), (p.traits ?? []).includes('ironArm'));
    else dayFielder(st, p.attrs[A.durability] ?? 50, played.has(p.id), c.primary.get(p.id) === 'C' && played.has(p.id), heatAT);
    // 경기 감각
    st.sense = clamp((st.sense ?? 80) + (played.has(p.id) || pitched.has(p.id) ? 8 : -3), 20, 100);
    // 컨디션(5단계 마르코프): 유지 0.45 + 0.012(기복−10)
    const cons = p.hidden ? (p.hidden[0] ?? 10) : 10; const keep = 0.45 + 0.012 * (cons - 10);
    const u = r.next(); let cond = st.cond ?? 0;
    if (u > keep) cond = clamp(cond + (r.next() < 0.5 + (cond > 0 ? -0.15 : cond < 0 ? 0.15 : 0) ? 1 : -1), -2, 2) as any;
    st.cond = cond as any;
  }
  // 부상 등록
  for (const inj of res.injuries) {
    const p = c.byId.get(inj.pid); if (!p) continue;
    const d = INJURIES.find((x) => x.key === inj.type); if (!d) continue;
    const days = injuryDays(d, p.hidden ? (p.hidden[6] ?? 10) : 10, p.age, r.next(), r.next());
    c.injuredUntil.set(p.id, day + Math.max(1, days)); c.injuries.push({ pid: p.id, type: inj.type, days, day });
  }
  // 성적·분위기
  const my = res.score[side], op = res.score[1 - side];
  c.RS += my; c.RA += op;
  if (res.status !== 'noGame') {
    if (my > op) { c.W++; c.streak = c.streak > 0 ? c.streak + 1 : 1; } else if (my < op) { c.L++; c.streak = c.streak < 0 ? c.streak - 1 : -1; } else c.T++;
    const dm = my > op ? 2 : my < op ? -2 : 0; c.mood = clamp(c.mood + dm * (1 - Math.abs(c.mood - 55) / 60) + (55 - c.mood) * 0.067, 15, 95);
  }
  // 누적 기록
  for (const b of res.box.bat[side]) { const s = c.bat.get(b.pid) ?? {}; for (const k of Object.keys(b)) { const v = (b as any)[k]; if (typeof v === 'number' && k !== 'pid' && k !== 'ord') s[k] = (s[k] ?? 0) + v; } s.G = (s.G ?? 0) + 1; c.bat.set(b.pid, s); }
  for (const pl of res.box.pit[side]) { const s = c.pit.get(pl.pid) ?? {}; for (const k of Object.keys(pl)) { const v = (pl as any)[k]; if (typeof v === 'number' && k !== 'pid') s[k] = (s[k] ?? 0) + v; } s.G = (s.G ?? 0) + 1; c.pit.set(pl.pid, s); }
}
/** 경기 없는 날(월요일·취소): 회복만 */
export function restDay(c: ClubSeason): void {
  for (const p of c.players) { const st = p.state!; if (c.role.get(p.id) !== undefined) dayPitcher(st, p.attrs[A.recovery] ?? 50, 0, false, false); else dayFielder(st, p.attrs[A.durability] ?? 50, false, false, 20); }
}
export const winPct = (c: ClubSeason): number => (c.W + c.L > 0 ? c.W / (c.W + c.L) : 0.5);
