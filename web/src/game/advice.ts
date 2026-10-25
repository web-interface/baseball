// 팀 분석 · 추천 — Claude(서버 POST /ai/advice, Haiku 5.5)가 팀 요약을 읽고 진단 · 강점 · 약점 · 전술 추천 · 라인업 조언을 준다.
// 서버가 아직 없거나(배포 전) 막히면(한도 · 예산 · 연결) 같은 모양의 '기본 분석'(규칙)으로 — 화면은 같다.
// 추천은 적용 버튼을 눌러야 바뀐다(감독이 고른다). 받은 값은 game/tactics 의 cleanTac 와 같은 목록으로 다시 거른다.
// 비용: 한 번에 입력 3천 · 출력 1천 토큰 남짓 — Haiku 5.5 로 약 $0.001. 기기마다 하루 3번, 서버는 사람마다 하루 한도 · 전체 예산.
import { ME, teamById } from './mock';
import { BAT_OPTS, PIT_OPTS, TEAM_DEF, TEAM_OPTS, personKey, teamVal, type TacState, type TeamKey } from './tactics';
import { BAT_SLOTS, STAFF_SLOTS, SLOT_KO, evaluate, getSlot, initialLineup, store as lineupStore, unit, type LineupState, type StaffSlot } from '../screens/lineup/calc';
import { batLine, getSeason, pitLine, teamLine } from '../season/store';
import { api, ApiError } from '../api';
import { cardShow, showOvr } from './ovrShow';

/* ───────── 보내는 자료 (서버와 같은 모양 — worker/src/advice.ts) ───────── */
export interface AdviceBatter { id: string; n: string; pos: string; o: number; ovr: number; f: Record<string, number>; avg?: string; hr?: number; ops?: string; sb?: number; ab?: number }
export interface AdvicePitcher { id: string; n: string; slot: string; role: string; t: 'L' | 'R'; ovr: number; f: Record<string, number>; era?: string; ip?: number; so?: number; sv?: number; hld?: number; off?: boolean }
export interface AdviceInput {
  v: 1;
  team: { name: string; ovr: number; parts: Record<string, number>; w: number; d: number; l: number; rank: number; g: number; left: number; rs: number; ra: number; park: string };
  tac: Record<TeamKey, string>;
  batters: AdviceBatter[];
  pitchers: AdvicePitcher[];
}

/* ───────── 받는 결과 ───────── */
export interface AdvicePlayer { id: string; kind: 'bat' | 'pit'; name: string; set: Record<string, string>; why: string }
export interface AdviceOut {
  source: 'ai' | 'rule';
  /** 한 줄 진단 */
  headline: string;
  strengths: string[];
  weaknesses: string[];
  /** 추천 팀 전술 (지금과 다른 것만) + 이유 */
  team: { key: TeamKey; v: string; why: string }[];
  players: AdvicePlayer[];
  /** 라인업 · 운용 조언 */
  lineup: string[];
  /** 서버 분석이 안 됐을 때 까닭 (기본 분석으로 바꾼 이유) */
  note?: string;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
/** 받침이 있으면 a, 없으면 b ('타격으로' · '투수로') — ㄹ 받침은 '으로' 대신 '로' */
const josa = (w: string, a: string, b: string) => {
  const c = w.charCodeAt(w.length - 1) - 0xac00;
  const j = c >= 0 && c < 11172 ? c % 28 : 0;
  return w + (j === 0 || (a === '으로' && j === 8) ? b : a);
};
const avg3 = (v: number) => v.toFixed(3).replace(/^0/, '');

/** 지금 라인업 · 시즌 기록 · 전술로 분석 자료 만들기 */
export function buildAdviceInput(tac: TacState, st: LineupState = lineupStore.get() ?? initialLineup()): AdviceInput {
  const ev = evaluate(st);
  const s = getSeason();
  const ln = teamLine(ME.teamId, s);
  const team = teamById(ME.teamId);
  // 화면 눈금(game/ovrShow) — 카드 화면 · 경기 엔진과 같은 숫자로 보낸다
  const faceOf = (u: ReturnType<typeof unit>, sh: number) => Object.fromEntries(u.player.face.map((f) => [f.code, Math.round(f.v + sh)]));
  const shOf = (u: ReturnType<typeof unit>) => cardShow(u.card, u.player.ovr).shift;
  const batters: AdviceBatter[] = st.order.map((slot, i) => {
    const id = st.field[slot];
    if (!id) return null;
    const u = unit(id);
    const b = batLine(u.player.id, s);
    const ue = ev.units[slot];
    const x: AdviceBatter = { id: personKey(u.player.id), n: u.player.name, pos: slot, o: i + 1, ovr: Math.round((ue?.total ?? u.player.ovr) + shOf(u)), f: faceOf(u, shOf(u)) };
    if (b.ab) Object.assign(x, { avg: avg3(b.avg), hr: b.hr, sb: b.sb, ab: b.ab });
    return x;
  }).filter((x): x is AdviceBatter => !!x);
  const pitchers: AdvicePitcher[] = STAFF_SLOTS.map((slot) => {
    const id = getSlot(st, slot);
    if (!id) return null;
    const u = unit(id);
    const l = pitLine(u.player.id, s);
    const ue = ev.units[slot];
    const x: AdvicePitcher = { id: personKey(u.player.id), n: u.player.name, slot: SLOT_KO[slot], role: u.player.role ?? 'RP', t: u.player.throws === 'L' ? 'L' : 'R', ovr: Math.round((ue?.total ?? u.player.ovr) + shOf(u)), f: faceOf(u, shOf(u)) };
    if (ue && ue.fit === 'near') x.off = true;
    if (l.outs) Object.assign(x, { era: l.era.toFixed(2), ip: Math.floor(l.outs / 3), so: l.so, sv: l.sv, hld: l.hld });
    return x;
  }).filter((x): x is AdvicePitcher => !!x);
  const parts = Object.fromEntries(ev.parts.map((p) => [p.k, showOvr(p.v)]));
  const st2 = team.stadium;
  const park = `${st2.name} · 좌 ${st2.fence[0]} · 중 ${st2.fence[1]} · 우 ${st2.fence[2]}m${st2.roof === 'dome' ? ' · 돔' : ''}`;
  return {
    v: 1,
    team: { name: team.name, ovr: showOvr(ev.overall), parts, w: ln.row.w, d: ln.row.d, l: ln.row.l, rank: ln.rank, g: ln.played, left: ln.left, rs: ln.row.rs, ra: ln.row.ra, park },
    tac: Object.fromEntries(TEAM_OPTS.map((o) => [o.key, teamVal(tac, o.key)])) as Record<TeamKey, string>,
    batters,
    pitchers,
  };
}

/* ───────── 기본 분석 (규칙) — 서버가 없을 때 같은 모양으로 ───────── */
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
/** 문턱 기준 — 숫자는 화면 눈금(힘 눈금보다 평균 14 낮다, 엔진 levelRef 와 같은 몫). 문턱은 예전 힘 눈금 값에서 이만큼 뺀다 */
const LV = 14;
export function ruleAdvice(inp: AdviceInput, note?: string): AdviceOut {
  const B = inp.batters, P = inp.pitchers;
  const f = (x: { f: Record<string, number> }, k: string, d = 50 - LV) => x.f[k] ?? d;
  const spd = mean(B.map((b) => f(b, 'SPD'))), pow = mean(B.map((b) => f(b, 'POW'))), con = mean(B.map((b) => f(b, 'CON'))), eye = mean(B.map((b) => f(b, 'EYE')));
  const rot = P.filter((p) => /선발/.test(p.slot)), pen = P.filter((p) => !/선발/.test(p.slot));
  const rotOvr = mean(rot.map((p) => p.ovr)), penOvr = mean(pen.slice(0, 6).map((p) => p.ovr));
  const ctl = mean(P.map((p) => f(p, 'CTL')));
  const parts = inp.team.parts;
  const KO: Record<string, string> = { bat: '타격', def: '수비', pit: '투수', run: '주루' };
  const sorted = Object.entries(parts).sort((a, b) => b[1] - a[1]);
  const strengths: string[] = [], weaknesses: string[] = [];
  const team: AdviceOut['team'] = [];
  const want = (key: TeamKey, v: string, why: string) => { if (inp.tac[key] !== v) team.push({ key, v, why }); };

  if (sorted[0]) strengths.push(`${KO[sorted[0][0]]} ${sorted[0][1]} — 팀에서 가장 센 묶음`);
  if (sorted.length > 1) { const w = sorted[sorted.length - 1]; weaknesses.push(`${KO[w[0]]} ${w[1]} — 가장 약한 묶음`); }
  if (spd >= 70 - LV) { strengths.push(`발이 빨라요 (주루 평균 ${Math.round(spd)})`); want('steal', 'more', '빠른 주자가 많아 도루로 득점권을 만들 수 있어요'); want('run', 'aggr', '한 베이스 더 가도 살아요'); }
  else if (spd <= 52 - LV) { weaknesses.push(`발이 느려요 (주루 평균 ${Math.round(spd)})`); want('steal', 'less', '도루 실패가 흐름을 끊어요'); want('run', 'safe', '무리한 주루로 아웃을 주지 않게'); }
  if (pow >= 74 - LV) { strengths.push(`장타력 (파워 평균 ${Math.round(pow)})`); want('two', 'full', '몰려도 장타가 나오는 타선이에요'); want('bunt', 'less', '번트로 아웃을 주기 아까운 타선이에요'); }
  else if (pow <= 58 - LV && con >= 68 - LV) { want('two', 'short', '맞히는 힘이 좋아 삼진을 줄이면 이득이에요'); want('hitrun', 'more', '컨택이 좋아 작전이 잘 먹혀요'); }
  if (eye >= 72 - LV) want('bat', 'pat', `선구안이 좋아요 (선구 평균 ${Math.round(eye)}) — 볼넷 · 투구 수로 선발을 지치게`);
  else if (eye <= 58 - LV && con >= 66 - LV) want('bat', 'aggr', '볼을 오래 보면 불리해요 — 빠른 카운트에 노려 치기');
  if (P.length) {
    if (penOvr >= rotOvr + 3) { strengths.push(`불펜이 선발보다 세요 (${Math.round(penOvr)} vs ${Math.round(rotOvr)})`); want('hook', 'quick', '센 불펜에 일찍 넘기는 게 이득이에요'); }
    else if (rotOvr >= penOvr + 4) { weaknesses.push(`불펜이 약해요 (${Math.round(penOvr)})`); want('hook', 'long', '선발이 길게 버티는 게 나아요'); }
    if (ctl >= 72 - LV) want('call', 'attack', `제구가 좋아요 (제구 평균 ${Math.round(ctl)}) — 정면 승부로 투구 수를 아끼기`);
    else if (ctl <= 56 - LV) { weaknesses.push(`제구가 흔들려요 (제구 평균 ${Math.round(ctl)})`); want('call', 'attack', '유인구가 볼넷이 되기 쉬워요 — 존 안에서 승부'); }
  }
  if ((parts.def ?? 70 - LV) <= 64 - LV) want('of', 'deep', '수비가 약하면 장타부터 막는 게 나아요');

  // 선수별
  const players: AdvicePlayer[] = [];
  for (const b of B) {
    const set: Record<string, string> = {};
    const why: string[] = [];
    if (f(b, 'SPD') >= 85 - LV) { set.steal = 'green'; why.push(`주루 ${f(b, 'SPD')}`); }
    else if (f(b, 'SPD') <= 38 - LV) { set.steal = 'never'; why.push(`주루 ${f(b, 'SPD')} — 도루는 손해`); }
    if (f(b, 'POW') >= 85 - LV && b.o >= 3 && b.o <= 5) { set.spray = 'pull'; why.push(`파워 ${f(b, 'POW')} 중심 타자`); }
    else if (f(b, 'CON') >= 80 - LV && f(b, 'POW') <= 60 - LV) { set.spray = 'oppo'; why.push(`컨택 ${f(b, 'CON')} · 진루타`); }
    if (f(b, 'EYE') >= 82 - LV && b.o <= 2) { set.bat = 'pat'; why.push(`선구 ${f(b, 'EYE')} — 출루`); }
    if (Object.keys(set).length) players.push({ id: b.id, kind: 'bat', name: b.n, set, why: why.join(' · ') });
  }
  for (const p of rot) {
    const set: Record<string, string> = {};
    const why: string[] = [];
    if (f(p, 'STA') >= 82 - LV) { set.limit = 'long'; why.push(`체력 ${f(p, 'STA')}`); }
    else if (f(p, 'STA', 60 - LV) <= 50 - LV) { set.limit = 'short'; why.push(`체력 ${f(p, 'STA')} — 짧게 끊기`); }
    if (f(p, 'CTL') >= 80 - LV) { set.call = 'attack'; why.push(`제구 ${f(p, 'CTL')}`); }
    if (Object.keys(set).length) players.push({ id: p.id, kind: 'pit', name: p.n, set, why: why.join(' · ') });
  }

  // 라인업 · 운용
  const lineup: string[] = [];
  const off = P.filter((p) => p.off);
  if (off.length) lineup.push(`보직 밖 투수 ${off.length}명 (−10) — ${off.slice(0, 3).map((p) => `${p.slot} ${p.n}`).join(' · ')}. 라인업 › 자동 편성으로 고칠 수 있어요`);
  const penN = pen.length;
  if (penN < 7) lineup.push(`불펜이 ${penN}명뿐이에요 — 10명까지 채우면 연투가 줄어요`);
  const diff = inp.team.rs - inp.team.ra;
  if (inp.team.g >= 10) (diff >= 0 ? strengths : weaknesses).push(`득실 ${diff >= 0 ? '+' : ''}${diff} (${inp.team.g}경기)`);

  const best = sorted[0] ? KO[sorted[0][0]] : '';
  const worst = sorted.length > 1 ? KO[sorted[sorted.length - 1][0]] : '';
  const headline = best && worst && best !== worst ? `${josa(best, '으로', '로')} 이기고 ${josa(worst, '을', '를')} 메우는 팀 — 장점을 살리는 쪽으로 전술을 맞춰요` : '팀을 살펴봤어요';
  return { source: 'rule', headline, strengths: strengths.slice(0, 3), weaknesses: weaknesses.slice(0, 3), team: team.slice(0, 6), players: players.slice(0, 8), lineup: lineup.slice(0, 3), note };
}

/* ───────── 서버 결과 거르기 (모르는 키 · 값 · 선수는 버린다) ───────── */
const TEAM_KEYS = new Set(TEAM_OPTS.map((o) => o.key));
const okTeam = (k: string, v: unknown): v is string => TEAM_KEYS.has(k as TeamKey) && TEAM_OPTS.find((o) => o.key === k)!.opts.some((o) => o.v === v);
const text = (x: unknown, n: number) => (typeof x === 'string' ? x.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n) : '');
export function cleanAdvice(raw: unknown, inp: AdviceInput): AdviceOut | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const list = (x: unknown, n: number, len: number) => (Array.isArray(x) ? x.map((s) => text(s, len)).filter(Boolean).slice(0, n) : []);
  const ids = new Map<string, { kind: 'bat' | 'pit'; name: string }>([
    ...inp.batters.map((b) => [b.id, { kind: 'bat' as const, name: b.n }] as const),
    ...inp.pitchers.map((p) => [p.id, { kind: 'pit' as const, name: p.n }] as const),
  ]);
  const team: AdviceOut['team'] = [];
  if (Array.isArray(r.team)) for (const t of r.team.slice(0, 8)) {
    const x = t as Record<string, unknown>;
    if (typeof x?.key === 'string' && okTeam(x.key, x.v) && x.v !== inp.tac[x.key as TeamKey] && !team.some((y) => y.key === x.key)) team.push({ key: x.key as TeamKey, v: x.v, why: text(x.why, 80) });
  }
  const players: AdvicePlayer[] = [];
  if (Array.isArray(r.players)) for (const p of r.players.slice(0, 12)) {
    const x = p as Record<string, unknown>;
    const who = typeof x?.id === 'string' ? ids.get(x.id) : undefined;
    if (!who || !x.set || typeof x.set !== 'object') continue;
    const defs = who.kind === 'bat' ? BAT_OPTS : PIT_OPTS;
    const set: Record<string, string> = {};
    for (const d of defs) { const v = (x.set as Record<string, unknown>)[d.key]; if (typeof v === 'string' && v !== 'team' && d.opts.some((o) => o.v === v)) set[d.key] = v; }
    if (Object.keys(set).length) players.push({ id: x.id as string, kind: who.kind, name: who.name, set, why: text(x.why, 80) });
  }
  const headline = text(r.headline, 90);
  if (!headline) return null;
  return { source: 'ai', headline, strengths: list(r.strengths, 3, 70), weaknesses: list(r.weaknesses, 3, 70), team, players: players.slice(0, 10), lineup: list(r.lineup, 3, 110) };
}

/* ───────── 부르기 — 기기마다 하루 3번 · 같은 팀이면 6시간 안엔 지난 결과 ───────── */
const KEY = 'bb.advice.v1';
export const ADVICE_DAILY = 3;
const today = () => new Date().toISOString().slice(0, 10);
interface Saved { day: string; n: number; hash: string; at: number; out: AdviceOut }
const loadSaved = (): Saved | null => { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null') as Saved | null; } catch { return null; } };
export function lastAdvice(): AdviceOut | null { return loadSaved()?.out ?? null; }
export function adviceLeft(): number { const s = loadSaved(); return s && s.day === today() ? Math.max(0, ADVICE_DAILY - s.n) : ADVICE_DAILY; }
const hashOf = (inp: AdviceInput) => { const t = JSON.stringify(inp); let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

/** 분석 받기 — Claude(서버) → 안 되면 기본 분석. 같은 팀이면(6시간 안) 지난 결과를 그대로 */
export async function askAdvice(inp: AdviceInput): Promise<AdviceOut> {
  const saved = loadSaved();
  const hash = hashOf(inp);
  if (saved && saved.hash === hash && Date.now() - saved.at < 6 * 3600_000 && saved.out.source === 'ai') return saved.out;
  const left = adviceLeft();
  let out: AdviceOut;
  if (left <= 0) out = ruleAdvice(inp, `오늘 Claude 분석 ${ADVICE_DAILY}번을 다 써서 기본 분석으로 보여 줘요`);
  else {
    try {
      const raw = await api.aiAdvice(inp);
      out = cleanAdvice(raw, inp) ?? ruleAdvice(inp, 'Claude 답을 읽지 못해 기본 분석으로 보여 줘요');
    } catch (e) {
      const why = e instanceof ApiError && e.status === 404 ? '서버에 Claude 분석이 아직 없어서(배포 전)'
        : e instanceof ApiError && (e.status === 429 || e.status === 503) ? e.message.replace(/\.$/, '') + ' —'
          : '연결이 안 돼서';
      out = ruleAdvice(inp, `${why} 기본 분석으로 보여 줘요`);
    }
  }
  try {
    const n = saved && saved.day === today() ? saved.n : 0;
    localStorage.setItem(KEY, JSON.stringify({ day: today(), n: out.source === 'ai' ? n + 1 : n, hash, at: Date.now(), out } satisfies Saved));
  } catch { /* */ }
  return out;
}
/** 팀 전술 추천 값 글 ('타격 성향 · 신중하게') */
export const teamAdviceText = (key: TeamKey, v: string) => {
  const d = TEAM_OPTS.find((o) => o.key === key)!;
  return { label: d.ko, from: d.opts.find((o) => o.v === (TEAM_DEF[key]))?.ko ?? '', to: d.opts.find((o) => o.v === v)?.ko ?? v };
};
export { r1 };
export type { StaffSlot };
export { BAT_SLOTS };
