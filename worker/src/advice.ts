// AI 팀 분석 · 추천 (POST /ai/advice) — 사이트(web/src/game/advice.ts)가 보낸 팀 요약을 Claude(Haiku 5.5)가 읽고
// 한 줄 진단 · 강점 · 약점 · 경기 전 전술 추천(팀 · 선수) · 라인업 조언을 JSON 으로 돌려준다.
// 추천은 정해진 선택지 안에서만(스키마 enum + 아래 검사). 결과 · 효과는 게임 코드가 정하고, 감독이 '적용'을 눌러야 바뀐다.
// 요청은 숫자 · 짧은 이름 · 정해진 코드만 받는다(모르는 키 · 긴 글은 버린다). 실제 구단 · 실제 인물 이름은 요청에 없다(게임 세계관 이름만).
import { PressError, type Spec } from './press';

/** 팀 전술 — 키 → 값 (web/src/game/tactics.ts TEAM_OPTS 와 같게) */
const TEAM: Record<string, readonly string[]> = {
  bat: ['aggr', 'norm', 'pat'], two: ['short', 'norm', 'full'], run: ['aggr', 'norm', 'safe'],
  steal: ['more', 'norm', 'less'], bunt: ['more', 'norm', 'less'], hitrun: ['more', 'norm', 'less'], ph: ['auto', 'late', 'never'],
  inf: ['auto', 'in', 'back'], of: ['auto', 'shallow', 'deep'], pick: ['more', 'norm', 'less'], ibb: ['auto', 'more', 'never'],
  call: ['attack', 'norm', 'nibble'], hook: ['quick', 'norm', 'long'], closer: ['save', 'tie', 'multi'], match: ['on', 'off'],
};
const TEAM_KO: Record<string, string> = {
  bat: '타격 성향 aggr=적극적으로(초구부터) · norm=보통 · pat=신중하게(공 많이 보기)',
  two: '2스트라이크 short=짧게 맞히기 · norm · full=풀스윙',
  run: '주루 aggr=한 베이스 더 · norm · safe=안전하게',
  steal: '도루 more=많이 · norm · less=적게',
  bunt: '번트 more=자주 · norm · less=적게',
  hitrun: '히트앤런 more=자주 · norm · less=적게',
  ph: '대타·대주자 auto=상황에 따라 · late=7회부터 · never=안 씀',
  inf: '내야 수비(3루 주자) auto=상황에 따라 · in=늘 전진 · back=정상 위치',
  of: '외야 수비 auto=타자에 맞춰 · shallow=앞으로 · deep=뒤로',
  pick: '주자 견제 more=자주 · norm · less=적게',
  ibb: '고의사구 auto=상황에 따라 · more=적극 · never=안 함',
  call: '승부 성향 attack=정면 승부 · norm · nibble=유인구 위주',
  hook: '선발 교체 quick=빠르게(투구 수 −15 · 3실점) · norm · long=길게(+15 · 7실점)',
  closer: '마무리 save=세이브 상황만 · tie=동점에도 · multi=2이닝까지',
  match: '좌우 원포인트 on=쓴다 · off=안 쓴다',
};
/** 선수 전술 — 타자 · 투수 (값 'team' = 팀 따름은 추천하지 않는다) */
const BAT: Record<string, readonly string[]> = { bat: ['aggr', 'pat'], steal: ['green', 'never'], bunt: ['sac', 'none'], spray: ['pull', 'oppo'] };
const PIT: Record<string, readonly string[]> = { call: ['attack', 'nibble'], limit: ['short', 'long'], mix: ['fast', 'break'], inside: ['in', 'out'] };
const ALL_TEAM_V = [...new Set(Object.values(TEAM).flat())];
const ALL_P_KEYS = [...new Set([...Object.keys(BAT), ...Object.keys(PIT)])];
const ALL_P_V = [...new Set([...Object.values(BAT).flat(), ...Object.values(PIT).flat()])];

export const ADVICE_MAX_TOKENS = 1600;

/* ───────── 요청 검사 ───────── */
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const str = (x: unknown, n: number) => (typeof x === 'string' ? x.replace(/[\u0000-\u001f\u007f<>`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '');
const num = (x: unknown, lo: number, hi: number) => { const n = Number(x); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n * 1000) / 1000)) : undefined; };
const ID = /^[\w~-]{1,40}$/;
const POS = new Set(['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH']);
const FACE = /^[A-Z]{2,4}$/;
function face(x: unknown) {
  const out: Record<string, number> = {};
  if (!isObj(x)) return out;
  for (const [k, v] of Object.entries(x).slice(0, 8)) { const n = num(v, 0, 150); if (FACE.test(k) && n != null) out[k] = Math.round(n); }
  return out;
}
const faceText = (f: Record<string, number>) => Object.entries(f).map(([k, v]) => `${k} ${v}`).join(' ');

interface Batter { id: string; n: string; pos: string; o: number; ovr: number; f: Record<string, number>; avg?: string; hr?: number; sb?: number; ab?: number }
interface Pitcher { id: string; n: string; slot: string; role: string; t: string; ovr: number; f: Record<string, number>; era?: string; ip?: number; so?: number; sv?: number; hld?: number; off?: boolean }
interface AdviceIn { team: Record<string, string | number>; parts: Record<string, number>; tac: Record<string, string>; batters: Batter[]; pitchers: Pitcher[] }

function readInput(raw: unknown): AdviceIn {
  if (!isObj(raw) || !isObj(raw.team)) throw new PressError(400, '팀 자료가 없어요');
  const t = raw.team;
  const team: Record<string, string | number> = { name: str(t.name, 20) || '내 구단', park: str(t.park, 70) };
  for (const k of ['ovr', 'w', 'd', 'l', 'rank', 'g', 'left', 'rs', 'ra']) { const n = num(t[k], 0, 2000); if (n != null) team[k] = n; }
  const parts: Record<string, number> = {};
  if (isObj(t.parts)) for (const k of ['bat', 'def', 'pit', 'run']) { const n = num(t.parts[k], 0, 150); if (n != null) parts[k] = n; }
  const tac: Record<string, string> = {};
  if (isObj(raw.tac)) for (const [k, vals] of Object.entries(TEAM)) { const v = raw.tac[k]; tac[k] = typeof v === 'string' && vals.includes(v) ? v : vals[1] ?? vals[0]; }
  const batters: Batter[] = (Array.isArray(raw.batters) ? raw.batters : []).slice(0, 9).flatMap((b): Batter[] => {
    if (!isObj(b) || typeof b.id !== 'string' || !ID.test(b.id)) return [];
    const pos = typeof b.pos === 'string' && POS.has(b.pos) ? b.pos : '';
    const x: Batter = { id: b.id, n: str(b.n, 16) || '타자', pos, o: num(b.o, 1, 9) ?? 0, ovr: num(b.ovr, 1, 150) ?? 0, f: face(b.f) };
    if (typeof b.avg === 'string' && /^\d?\.\d{3}$/.test(b.avg)) x.avg = b.avg;
    for (const k of ['hr', 'sb', 'ab'] as const) { const n = num(b[k], 0, 999); if (n != null) x[k] = n; }
    return [x];
  });
  const pitchers: Pitcher[] = (Array.isArray(raw.pitchers) ? raw.pitchers : []).slice(0, 16).flatMap((p): Pitcher[] => {
    if (!isObj(p) || typeof p.id !== 'string' || !ID.test(p.id)) return [];
    const x: Pitcher = { id: p.id, n: str(p.n, 16) || '투수', slot: str(p.slot, 10), role: ['SP', 'RP', 'CL'].includes(String(p.role)) ? String(p.role) : 'RP', t: p.t === 'L' ? 'L' : 'R', ovr: num(p.ovr, 1, 150) ?? 0, f: face(p.f), off: p.off === true || undefined };
    if (typeof p.era === 'string' && /^\d{1,2}\.\d{2}$/.test(p.era)) x.era = p.era;
    for (const k of ['ip', 'so', 'sv', 'hld'] as const) { const n = num(p[k], 0, 999); if (n != null) x[k] = n; }
    return [x];
  });
  if (batters.length < 3 && pitchers.length < 3) throw new PressError(400, '선수 자료가 모자라요');
  return { team, parts, tac, batters, pitchers };
}

/* ───────── Claude 에 보낼 것 ───────── */
const SYSTEM = [
  '너는 KBO 식 한국 프로야구 매니지먼트 게임의 수석코치다. 감독에게 팀 분석과 경기 전 전술 추천을 준다.',
  '- 근거는 주어진 자료(카드 능력치 1~100, 이번 시즌 기록)뿐이다. 없는 사실을 지어내지 않는다. 선수는 자료의 id 로만 가리킨다.',
  '- 전술 값은 아래 목록 안에서만 고른다. 지금 값과 같은 것은 추천하지 않는다. 근거가 약하면 추천하지 않는다(팀 많아야 5개, 선수 많아야 8개 항목).',
  '- 능력치 코드: 타자 CON 컨택 · POW 파워 · EYE 선구 · SPD 주루 · DEF 수비 · ARM 송구(포수는 BLK 블로킹 · FRM 프레이밍 · CS 도루 저지) / 투수 VEL 구속 · STF 구위 · BRK 변화 · CTL 제구 · STA 체력 · REC 회복 · MNT 위기관리.',
  '- 말투는 짧고 담백한 해요체. 과장 · 이모티콘 금지. 사람 이름은 자료에 있는 이름만 쓴다.',
  '- headline: 팀을 한 문장으로(40자 안팎). strengths · weaknesses: 각 1~3개, 근거 숫자를 넣어 짧게. lineup: 라인업 · 투수 운용 조언 0~3개(보직 밖 투수, 타순, 불펜 수 등).',
  '- team: {key, v, why} — key 는 팀 전술 키, why 는 근거 한 줄. players: {id, key, v, why} — 선수 한 명에 여러 항목이면 줄을 나눈다.',
  '',
  '[팀 전술 키 · 값]',
  ...Object.entries(TEAM_KO).map(([k, ko]) => `${k}: ${ko}`),
  '',
  '[선수 전술 키 · 값]',
  '타자 — bat: aggr 적극적으로 · pat 신중하게 / steal: green 그린라이트 · never 금지 / bunt: sac 희생번트 맡김 · none 안 시킴 / spray: pull 당겨치기 · oppo 밀어치기',
  '투수 — call: attack 정면 승부 · nibble 피해 간다 / limit: short 85구 · long 115구(선발만) / mix: fast 직구 위주 · break 변화구 위주 / inside: in 몸쪽 적극 · out 바깥쪽 위주',
].join('\n');

function userText(a: AdviceIn): string {
  const t = a.team;
  const L: string[] = [];
  L.push(`[팀] ${t.name} · 팀 종합 ${t.ovr ?? '-'} (타격 ${a.parts.bat ?? '-'} · 수비 ${a.parts.def ?? '-'} · 투수 ${a.parts.pit ?? '-'} · 주루 ${a.parts.run ?? '-'})`);
  L.push(`[성적] ${t.w ?? 0}승 ${t.d ?? 0}무 ${t.l ?? 0}패 · ${t.rank ?? '-'}위 · ${t.g ?? 0}경기 치름 · 남은 ${t.left ?? '-'} · 득점 ${t.rs ?? 0} 실점 ${t.ra ?? 0}`);
  if (t.park) L.push(`[홈 구장] ${t.park}`);
  L.push(`[지금 팀 전술] ${Object.entries(a.tac).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  L.push('[타자 — 타순]');
  for (const b of a.batters) L.push(`${b.o}번 ${b.pos} ${b.n} (id ${b.id}) 종합 ${b.ovr}${faceText(b.f) ? ` · ${faceText(b.f)}` : ''}${b.ab ? ` · 타율 ${b.avg ?? '-'} 홈런 ${b.hr ?? 0} 도루 ${b.sb ?? 0} (${b.ab}타수)` : ''}`);
  L.push('[투수]');
  for (const p of a.pitchers) L.push(`${p.slot} ${p.n} (id ${p.id}) ${p.role} ${p.t === 'L' ? '좌투' : '우투'} 종합 ${p.ovr}${faceText(p.f) ? ` · ${faceText(p.f)}` : ''}${p.era ? ` · 평균자책 ${p.era} ${p.ip ?? 0}이닝 탈삼진 ${p.so ?? 0}${p.sv ? ` 세이브 ${p.sv}` : ''}${p.hld ? ` 홀드 ${p.hld}` : ''}` : ''}${p.off ? ' · [보직 밖 −10]' : ''}`);
  L.push('', '이 팀을 분석하고, 위 목록 안에서 경기 전 전술을 추천해 주세요.');
  return L.join('\n');
}

const SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    strengths: { type: 'array', items: { type: 'string' } },
    weaknesses: { type: 'array', items: { type: 'string' } },
    team: {
      type: 'array',
      items: {
        type: 'object',
        properties: { key: { type: 'string', enum: Object.keys(TEAM) }, v: { type: 'string', enum: ALL_TEAM_V }, why: { type: 'string' } },
        required: ['key', 'v', 'why'],
        additionalProperties: false,
      },
    },
    players: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, key: { type: 'string', enum: ALL_P_KEYS }, v: { type: 'string', enum: ALL_P_V }, why: { type: 'string' } },
        required: ['id', 'key', 'v', 'why'],
        additionalProperties: false,
      },
    },
    lineup: { type: 'array', items: { type: 'string' } },
  },
  required: ['headline', 'strengths', 'weaknesses', 'team', 'players', 'lineup'],
  additionalProperties: false,
};

/** 사이트로 돌려주는 모양 — 선수는 id 별로 묶어 set 으로 (web/src/game/advice.ts cleanAdvice 가 한 번 더 거른다) */
export interface AdviceOut {
  headline: string; strengths: string[]; weaknesses: string[];
  team: { key: string; v: string; why: string }[];
  players: { id: string; set: Record<string, string>; why: string }[];
  lineup: string[];
}

function read(a: AdviceIn, text: string, stop: string | null): AdviceOut {
  if (stop === 'max_tokens') throw new PressError(502, '분석 글이 잘렸어요');
  let j: unknown;
  try { j = JSON.parse(text); } catch { throw new PressError(502, '분석 글을 읽지 못했어요'); }
  if (!isObj(j)) throw new PressError(502, '분석 글 모양이 달라요');
  const headline = str(j.headline, 90);
  if (!headline) throw new PressError(502, '분석 글이 비었어요');
  const list = (x: unknown, n: number, len: number) => (Array.isArray(x) ? x.map((s) => str(s, len)).filter(Boolean).slice(0, n) : []);
  const team: AdviceOut['team'] = [];
  if (Array.isArray(j.team)) for (const x of j.team.slice(0, 8)) {
    if (!isObj(x) || typeof x.key !== 'string' || typeof x.v !== 'string') continue;
    const vals = TEAM[x.key];
    if (!vals || !vals.includes(x.v) || a.tac[x.key] === x.v || team.some((y) => y.key === x.key)) continue;
    team.push({ key: x.key, v: x.v, why: str(x.why, 80) });
  }
  const kind = new Map<string, 'bat' | 'pit'>([...a.batters.map((b) => [b.id, 'bat'] as const), ...a.pitchers.map((p) => [p.id, 'pit'] as const)]);
  const byId = new Map<string, { set: Record<string, string>; why: string[] }>();
  if (Array.isArray(j.players)) for (const x of j.players.slice(0, 16)) {
    if (!isObj(x) || typeof x.id !== 'string' || typeof x.key !== 'string' || typeof x.v !== 'string') continue;
    const k = kind.get(x.id);
    const vals = k === 'bat' ? BAT[x.key] : k === 'pit' ? PIT[x.key] : undefined;
    if (!vals || !vals.includes(x.v)) continue;
    const cur = byId.get(x.id) ?? { set: {}, why: [] };
    cur.set[x.key] = x.v;
    const w = str(x.why, 60);
    if (w && !cur.why.includes(w)) cur.why.push(w);
    byId.set(x.id, cur);
  }
  const players = [...byId].slice(0, 10).map(([id, v]) => ({ id, set: v.set, why: v.why.join(' · ').slice(0, 100) }));
  return { headline, strengths: list(j.strengths, 3, 70), weaknesses: list(j.weaknesses, 3, 70), team: team.slice(0, 6), players, lineup: list(j.lineup, 3, 110) };
}

const estimate = (system: string, user: string) => Math.ceil((system.length + user.length) * 1.6) + 400;

/** 팀 분석 요청 하나 → Claude 에 보낼 것 + 받은 글 읽기 */
export function adviceSpec(raw: unknown): Spec<AdviceOut> {
  const a = readInput(raw);
  const user = userText(a);
  return { system: SYSTEM, user, schema: SCHEMA, maxTokens: ADVICE_MAX_TOKENS, estIn: estimate(SYSTEM, user), read: (text, stop) => read(a, text, stop) };
}
