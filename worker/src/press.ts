// 언론 — AI 뉴스(스포츠 기사 + 포털 뉴스식 독자 댓글) · 감독 인터뷰. Claude 는 글만 쓴다: 경기 결과 · 숫자 · 인터뷰 효과는 모두 게임 코드가 정한다.
// 이 파일은 순수 함수만 — 사이트가 보낸 경기 자료 검사 → 짧은 한국어 자료 글(프롬프트) + JSON 스키마(구조화 출력) → 받은 글 검사·다듬기.
//   · 이름은 게임 이름만 넘긴다(구단 이름은 이 파일의 표에서 — 사이트가 보낸 글자를 믿지 않는다).
//   · 받은 글에 실제 구단 별명이 섞이면 게임 별명으로 바꾸고, 실제 기업 · 구단 모기업 · 방송사 · 커뮤니티 사이트 · 실존 인물 이름,
//     욕설 · 비하 · 정치 · 성적 표현이 있으면 그 글(댓글)을 뺀다. 이모지 · 마크다운 기호는 지운다.
//   · 뉴스 말투 거름: 초성(ㅋㅋ · ㄹㅇ)은 지우고, 커뮤니티 속어가 남은 댓글은 뺀다.
// 로그인 · 하루 한도 · 예산 · 사용량 기록 · Claude 호출은 부르는 쪽(index.ts)이 맡는다.

export class PressError extends Error { constructor(public status: number, msg: string) { super(msg); } }

/** 한 번에 쓰는 최대 출력 토큰 — 개막 특집 · 시즌 결산(글 5개) / 특이사항(글 2~3개) / 인터뷰(질문 3 × 답 3) */
export const NEWS_MAX_TOKENS = 2000; // 특집 5개 × (제목 + 본문 + 댓글 3개 20~45자) — 잘리지 않게 (Haiku 라 늘려도 1회 $0.001 안쪽)
export const EVENT_MAX_TOKENS = 800;
export const IV_MAX_TOKENS = 1000;

/* ───────── 게임 세계 (web/src/game/world.ts 와 같은 이름 — 바꾸면 같이) ───────── */
/** 구단 id → [정식 이름, 짧은 이름] — 현재 구단 10 + 옛 구단 10 (부활 구단으로 리그에 설 수 있음) */
export const CLUB: Readonly<Record<string, readonly [string, string]>> = {
  dj: ['대전 독수리스', '독수리스'], gj: ['광주 호랑이즈', '호랑이즈'], dg: ['대구 사자즈', '사자즈'], bs: ['부산 거인츠', '거인츠'],
  sb: ['서울 곰스', '곰스'], st: ['서울 쌍둥이스', '쌍둥이스'], sh: ['서울 영웅즈', '영웅즈'], ic: ['인천 상륙스', '상륙스'],
  cw: ['창원 공룡스', '공룡스'], sw: ['수원 마법사즈', '마법사즈'],
  ddg: ['동대문 곰스', '곰스'], mdh: ['무등 호랑이즈', '호랑이즈'], hbe: ['한밭 독수리스', '독수리스'], scr: ['서울 청룡스', '청룡스'],
  isb: ['인천 슈퍼별즈', '슈퍼별즈'], ijr: ['인천 조랑말스', '조랑말스'], idr: ['인천 돌고래스', '돌고래스'], suc: ['수원 일각수스', '일각수스'],
  jdr: ['전주 돌격대스', '돌격대스'], iby: ['인천 비룡스', '비룡스'],
};
const GAME_NICKS = [...new Set(Object.values(CLUB).map((c) => c[1]))];
const RIVALRIES = ['경부선 더비', '영호남 더비', '남해안 더비', '한강 더비', '경인 더비'];
const LEVELS = ['연습생', '2군', '1군', '올스타', '국가대표', '레전드'];
const POS_KO: Record<string, string> = {
  C: '포수', '1B': '1루수', '2B': '2루수', '3B': '3루수', SS: '유격수', LF: '좌익수', CF: '중견수', RF: '우익수', DH: '지명타자',
  SP: '선발', RP: '불펜', CL: '마무리', P: '투수',
};
const STAGE_KO: Record<string, string> = { wc: '와일드카드 결정전', spo: '준플레이오프', po: '플레이오프', ks: '한국시리즈' };
/** 기사 분류 — web/src/game/press.ts 의 PressTag 와 같은 이름 */
export const TAGS = ['속보', '단독', '충격', '화제', '분석', '이슈'] as const;
export type Tag = (typeof TAGS)[number];
/**
 * 옛 분류 이름(커뮤니티 게시판 시절) ↔ 지금 이름. 사이트와 서버는 따로 배포되니 둘 다 받는다:
 *  · 요청의 ev.tag 는 옛 이름 · 지금 이름 모두 받아 지금 이름으로 (사이트는 옛 서버도 받게 옛 이름으로 보낸다)
 *  · 응답은 요청에 tv: 2 가 있을 때만 지금 이름, 없으면(옛 사이트 — 모르는 분류의 글을 버린다) 옛 이름으로 돌려준다
 */
const OLD_TO_NEW = new Map<string, Tag>([['실화냐', '화제'], ['루머', '이슈']]);
const NEW_TO_OLD = new Map<Tag, string>([['화제', '실화냐'], ['이슈', '루머']]);
export function tagOf(v: unknown): Tag | undefined {
  if (typeof v !== 'string') return undefined;
  return (TAGS as readonly string[]).includes(v) ? (v as Tag) : OLD_TO_NEW.get(v);
}
export const ANSWER_TYPES = ['trust', 'push', 'calm'] as const;
export type AnswerType = (typeof ANSWER_TYPES)[number];
const EV_KINDS = ['nohit', 'first', 'streakW', 'streakL', 'record', 'dropout', 'walkoffW', 'walkoffL', 'comeback', 'injury', 'marathon', 'myRecord', 'postWin', 'postLose', 'champion'];

/* ───────── 요청 검사 ───────── */
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const NAME_RE = /^[가-힣A-Za-z][가-힣A-Za-z .·'-]{0,15}$/;
/** 자료 글 한 줄 — 한글(자모 포함) · 영숫자 · 기본 문장 부호만 */
const LINE_RE = /^[\p{Script=Hangul}A-Za-z0-9 .,·:;()\-+'"%/!?~→—–…]+$/u;
const DATE_RE = /^20\d\d-[01]\d-[0-3]\d$/;
const ID_RE = /^[A-Za-z0-9_~.-]{1,40}$/;
const KEY_RE = /^[a-z]{1,3}\d{0,2}$/;
const VAL_RE = /^[0-9.\-]{1,7}$/;

const bad = (what: string): never => { throw new PressError(400, `요청 값이 잘못됐어요 (${what})`); };
const int = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : undefined);
const teamOf = (v: unknown): string | undefined => (typeof v === 'string' && Object.prototype.hasOwnProperty.call(CLUB, v) ? v : undefined);
const nameOf = (v: unknown): string | undefined => (typeof v === 'string' && NAME_RE.test(v.trim()) ? v.trim() : undefined);
const lineOf = (v: unknown, max = 60): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.replace(/\s+/g, ' ').trim();
  return t && t.length <= max && LINE_RE.test(t) ? t : undefined;
};
/** 배열 (최대 길이까지, 하나라도 틀리면 그 항목만 버린다) */
function listOf<T>(v: unknown, max: number, each: (x: unknown) => T | undefined): T[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) return bad('목록');
  const out: T[] = [];
  for (const x of v.slice(0, max)) { const y = each(x); if (y !== undefined) out.push(y); }
  return out;
}
const tuple = (v: unknown, n: number): unknown[] | undefined => (Array.isArray(v) && v.length === n ? v : undefined);
const intsOf = (v: unknown, max: number, lo: number, hi: number): number[] | undefined => {
  if (!Array.isArray(v) || v.length > max) return undefined;
  const out = v.map((x) => int(x, lo, hi));
  return out.every((x): x is number => x !== undefined) ? out : undefined;
};

export interface GameIn {
  opp: string; home: boolean; s: [number, number]; inn: number; wo: boolean;
  line?: [number[], number[]]; w?: string; l?: string; sv?: string; gw?: string; stars: [string, string][];
}
export interface EventIn { kind: string; tag: Tag; big: boolean; mine: boolean; team: string; opp?: string; who?: string; n?: number; text: string }
export interface NewsIn {
  moment: 'open' | 'event' | 'close';
  /** 분류 이름 판 — 2 = 화제 · 이슈를 아는 사이트, 1 = 옛 사이트(실화냐 · 루머로 돌려준다) */
  tv: 1 | 2;
  year: number; date: string; me: string;
  lv?: string; ovr?: number;
  /** 순위 순서 [구단, 승, 무, 패, 연승(+)/연패(-)] */
  table: [string, number, number, number, number][];
  /** 개막 전 전력 예상 [구단, 세기] */
  power: [string, number][];
  first?: { opp: string; home: boolean; sp?: string };
  rival?: { id: string; name: string };
  /** 내 구단 주요 선수 [이름, 자리 코드, 메모] */
  squad: [string, string, string][];
  /** 개인 기록 1위 [부문, 이름, 구단, 값] */
  leaders: [string, string, string, string][];
  game?: GameIn;
  post?: { stage: string; seed: number; opp?: string };
  ev?: EventIn;
  notes: string[];
}

function gameIn(v: unknown): GameIn | undefined {
  if (!isObj(v)) return undefined;
  const opp = teamOf(v.opp);
  const s = intsOf(v.s, 2, 0, 60);
  const inn = int(v.inn, 1, 20);
  if (!opp || !s || s.length !== 2 || inn === undefined || typeof v.home !== 'boolean') return undefined;
  let line: [number[], number[]] | undefined;
  if (Array.isArray(v.line) && v.line.length === 2) {
    const a = intsOf(v.line[0], 20, 0, 30), b = intsOf(v.line[1], 20, 0, 30);
    if (a && b) line = [a, b];
  }
  const stars = listOf(v.stars, 4, (x) => {
    const t = tuple(x, 2);
    const n = t && nameOf(t[0]), l = t && lineOf(t[1], 40);
    return n && l ? ([n, l] as [string, string]) : undefined;
  });
  return { opp, home: v.home, s: [s[0], s[1]], inn, wo: v.wo === true, line, w: nameOf(v.w), l: nameOf(v.l), sv: nameOf(v.sv), gw: nameOf(v.gw), stars };
}

/** POST /ai/news 요청 검사 */
export function parseNewsIn(v: unknown): NewsIn {
  if (!isObj(v) || v.v !== 1) return bad('형식');
  const moment = v.moment === 'open' || v.moment === 'event' || v.moment === 'close' ? v.moment : bad('moment');
  const year = int(v.year, 2000, 2200) ?? bad('year');
  const date = typeof v.date === 'string' && DATE_RE.test(v.date) ? v.date : bad('date');
  const me = teamOf(v.me) ?? bad('me');
  const table = listOf(v.table, 20, (x) => {
    const t = tuple(x, 5);
    const id = t && teamOf(t[0]);
    const w = t && int(t[1], 0, 200), d = t && int(t[2], 0, 200), l = t && int(t[3], 0, 200), k = t && int(t[4], -60, 60);
    return id && w !== undefined && d !== undefined && l !== undefined && k !== undefined ? ([id, w, d, l, k] as [string, number, number, number, number]) : undefined;
  });
  const power = listOf(v.power, 20, (x) => {
    const t = tuple(x, 2);
    const id = t && teamOf(t[0]), p = t && int(t[1], 0, 200);
    return id && p !== undefined ? ([id, p] as [string, number]) : undefined;
  });
  let first: NewsIn['first'];
  if (isObj(v.first)) {
    const opp = teamOf(v.first.opp);
    if (opp && typeof v.first.home === 'boolean') first = { opp, home: v.first.home, sp: nameOf(v.first.sp) };
  }
  let rival: NewsIn['rival'];
  if (isObj(v.rival)) {
    const id = teamOf(v.rival.id), name = typeof v.rival.name === 'string' && RIVALRIES.includes(v.rival.name) ? v.rival.name : undefined;
    if (id && name) rival = { id, name };
  }
  const squad = listOf(v.squad, 8, (x) => {
    const t = tuple(x, 3);
    const n = t && nameOf(t[0]), p = t && typeof t[1] === 'string' && Object.hasOwn(POS_KO, t[1]) ? t[1] : undefined, m = t && (t[2] === '' ? '' : lineOf(t[2], 40));
    return n && p && m !== undefined ? ([n, p, m] as [string, string, string]) : undefined;
  });
  const leaders = listOf(v.leaders, 10, (x) => {
    const t = tuple(x, 4);
    const lab = t && lineOf(t[0], 8), n = t && nameOf(t[1]), id = t && teamOf(t[2]), val = t && typeof t[3] === 'string' && VAL_RE.test(t[3]) ? t[3] : undefined;
    return lab && n && id && val ? ([lab, n, id, val] as [string, string, string, string]) : undefined;
  });
  let post: NewsIn['post'];
  if (isObj(v.post)) {
    const stage = typeof v.post.stage === 'string' && (v.post.stage === '' || Object.hasOwn(STAGE_KO, v.post.stage)) ? v.post.stage : undefined;
    const seed = int(v.post.seed, 0, 20);
    if (stage !== undefined && seed !== undefined) post = { stage, seed, opp: teamOf(v.post.opp) };
  }
  let ev: EventIn | undefined;
  if (moment === 'event') {
    const e = isObj(v.ev) ? v.ev : bad('ev');
    const kind = typeof e.kind === 'string' && EV_KINDS.includes(e.kind) ? e.kind : bad('ev.kind');
    const tag = tagOf(e.tag) ?? bad('ev.tag');
    const team = teamOf(e.team) ?? bad('ev.team');
    const text = lineOf(e.text, 80) ?? bad('ev.text');
    ev = { kind, tag, big: e.big === true, mine: e.mine === true, team, opp: teamOf(e.opp), who: nameOf(e.who), n: int(e.n, 0, 500), text };
  }
  const lv = typeof v.lv === 'string' && LEVELS.includes(v.lv) ? v.lv : undefined;
  return {
    moment, tv: v.tv === 2 ? 2 : 1, year, date, me, lv, ovr: int(v.ovr, 1, 200), table, power, first, rival, squad, leaders,
    game: gameIn(v.game), post, ev, notes: listOf(v.notes, 6, (x) => lineOf(x, 70)),
  };
}

export interface PlayerIn { k: string; id: string; n: string; pos: string; c: number; f: number; inj?: string; note?: string }
export interface InterviewIn {
  moment: 'open' | 'close';
  year: number; date: string; me: string;
  lv?: string; ovr?: number;
  rank?: number; rec?: [number, number, number];
  opp?: string; home?: boolean; stage?: string; rival?: string;
  players: PlayerIn[];
  topics: string[];
}

/** POST /ai/interview 요청 검사 */
export function parseInterviewIn(v: unknown): InterviewIn {
  if (!isObj(v) || v.v !== 1) return bad('형식');
  const moment = v.moment === 'open' || v.moment === 'close' ? v.moment : bad('moment');
  const year = int(v.year, 2000, 2200) ?? bad('year');
  const date = typeof v.date === 'string' && DATE_RE.test(v.date) ? v.date : bad('date');
  const me = teamOf(v.me) ?? bad('me');
  const keys = new Set<string>();
  const players = listOf(v.players, 14, (x): PlayerIn | undefined => {
    if (!isObj(x)) return undefined;
    const k = typeof x.k === 'string' && KEY_RE.test(x.k) && !keys.has(x.k) ? x.k : undefined;
    const id = typeof x.id === 'string' && ID_RE.test(x.id) ? x.id : undefined;
    const n = nameOf(x.n), pos = typeof x.pos === 'string' && Object.hasOwn(POS_KO, x.pos) ? x.pos : undefined;
    const c = int(x.c, 1, 5), f = int(x.f, 0, 100);
    if (!k || !id || !n || !pos || c === undefined || f === undefined) return undefined;
    keys.add(k);
    return { k, id, n, pos, c, f, inj: lineOf(x.inj, 24), note: lineOf(x.note, 40) };
  });
  if (!players.length) return bad('players');
  const recT = intsOf(v.rec, 3, 0, 200);
  const stage = typeof v.stage === 'string' && (v.stage === '' || Object.hasOwn(STAGE_KO, v.stage)) ? v.stage : undefined;
  return {
    moment, year, date, me,
    lv: typeof v.lv === 'string' && LEVELS.includes(v.lv) ? v.lv : undefined,
    ovr: int(v.ovr, 1, 200), rank: int(v.rank, 1, 20), rec: recT && recT.length === 3 ? [recT[0], recT[1], recT[2]] : undefined,
    opp: teamOf(v.opp), home: typeof v.home === 'boolean' ? v.home : undefined, stage,
    rival: typeof v.rival === 'string' && RIVALRIES.includes(v.rival) ? v.rival : undefined,
    players, topics: listOf(v.topics, 5, (x) => lineOf(x, 70)),
  };
}

/* ───────── 자료 글 (프롬프트) ───────── */
const full = (id: string) => CLUB[id]?.[0] ?? '';
const short = (id: string) => CLUB[id]?.[1] ?? '';
const recKo = (w: number, d: number, l: number) => `${w}승${d ? `${d}무` : ''}${l}패`;
const streakKo = (k: number) => (k > 0 ? `${k}연승` : k < 0 ? `${-k}연패` : '');
function dateKo(date: string) {
  const t = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
  const d = new Date(t);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일(${'일월화수목금토'[d.getUTCDay()]})`;
}
function tableLine(rows: NewsIn['table'], me: string, all = false) {
  const pick = all || rows.length <= 6 ? rows : [...rows.slice(0, 3), ...rows.filter((r, i) => i >= 3 && i < rows.length - 2 && r[0] === me), ...rows.slice(-2)];
  return pick.map((r) => `${rows.indexOf(r) + 1}위 ${short(r[0])} ${recKo(r[1], r[2], r[3])}${r[4] >= 3 || r[4] <= -3 ? `(${streakKo(r[4])})` : ''}`).join(' · ');
}
function gameLine(g: GameIn, me: string) {
  const away = g.home ? g.opp : me, home = g.home ? me : g.opp;
  const my = g.s[0], their = g.s[1];
  const res = my > their ? '승' : my < their ? '패' : '무';
  const out = [`${short(me)} ${my}:${their} ${short(g.opp)} (${g.home ? '홈' : '원정'}, ${res}${g.wo ? ', 끝내기' : ''}${g.inn > 9 ? `, ${g.inn}회` : ''})`];
  if (g.line) out.push(`이닝 점수 ${short(away)} ${g.line[0].join(' ')} / ${short(home)} ${g.line[1].join(' ')}`);
  const dec = [g.w && `승 ${g.w}`, g.l && `패 ${g.l}`, g.sv && `세 ${g.sv}`, g.gw && `결승타 ${g.gw}`].filter(Boolean).join(' · ');
  if (dec) out.push(dec);
  if (g.stars.length) out.push(`수훈: ${g.stars.map(([n, l]) => `${n} ${l}`).join('; ')}`);
  return out.join('\n');
}

const NEWS_SYSTEM = [
  "가상 프로야구 '한별 리그'의 스포츠 뉴스 기사와, 그 기사에 달린 독자 댓글을 쓴다. 자료에 있는 사실로만.",
  '기사: 스포츠 신문 기사체. title 은 눈길을 끄는 자극적인 헤드라인 — 따옴표 인용 · 말줄임(…) · 쉼표 끊기를 써도 된다(예: "출구가 안 보인다" ○○, 불펜 또 무너졌다 / ○○, 9회말 끝내기로 웃었다). body 는 ~했다 체 리드 2~3문장.',
  '댓글: 포털 뉴스 독자 댓글. 완결된 문장으로, 존댓말(~네요 · ~습니다)과 평서문(~다)을 섞고 가끔 짧은 질문. 한 기사 안에서 반응을 서로 다르게 — 칭찬 · 전술 분석 · 아쉬움 · 걱정 · 응원 · 질문(예: 불펜 운용은 다시 점검이 필요해 보입니다. / 오늘처럼만 하면 순위 싸움도 해 볼 만하겠네요. / 선발이 조금 더 버텼으면 어땠을까요?). 예시는 말투만 참고하고 그대로 쓰지 않는다.',
  '쓰지 않는 것: 초성(ㅋㅋ · ㄷㄷ · ㄹㅇ 등), 커뮤니티 말투와 속어(실화냐 · 미쳤다 · ~각 · ㄱㄱ · 반박 안 받음 · .txt 등), 반말 조롱, 이모지, 해시태그, 매체·기자 이름, 제목 앞 [ ] 머리말(분류는 tag 로).',
  '지킬 것:',
  '- 구단·선수 이름은 자료에 나온 것만, 적힌 글자 그대로(철자를 고치지 않는다). 실제 프로야구 선수·감독·구단, 기업, 언론사·방송사, 커뮤니티 사이트 이름은 쓰지 않는다.',
  '- 점수·순위·기록 숫자는 자료 그대로. 없는 숫자는 만들지 않는다(이슈 기사는 "~라는 관측이 나온다"처럼 전하는 말로, 숫자 없이).',
  '- 욕설, 비하(지역·성별·장애·인종·외모), 성적 표현, 정치, 실존 인물 이야기는 쓰지 않는다. 선수 비판은 경기력만, 정중하게.',
  '형식: tag 는 속보·단독·충격·화제·분석·이슈 중 하나. title 28자 이내. body 90자 이내. comments 는 댓글 하나에 20~45자.',
].join('\n');

const NEWS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    posts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tag: { type: 'string', enum: [...TAGS] },
          title: { type: 'string' },
          body: { type: 'string' },
          comments: { type: 'array', items: { type: 'string' } },
        },
        required: ['tag', 'title', 'body', 'comments'],
        additionalProperties: false,
      },
    },
  },
  required: ['posts'],
  additionalProperties: false,
};

/** 뉴스 자료 글 */
export function newsUser(n: NewsIn): string {
  const L: string[] = [];
  const me = n.me;
  const meRow = n.table.find((r) => r[0] === me);
  const meRank = meRow ? n.table.indexOf(meRow) + 1 : 0;
  const head = n.moment === 'open' ? '개막 특집' : n.moment === 'close' ? '시즌 결산' : '특이사항';
  L.push(`[${head}] ${n.year} 한별 리그 · ${dateKo(n.date)}${n.moment === 'close' ? ' 정규 시즌 끝' : ''}`);
  L.push(`내 구단: ${full(me)}${meRow && n.moment !== 'open' ? ` ${meRank}위 ${recKo(meRow[1], meRow[2], meRow[3])}${Math.abs(meRow[4]) >= 2 ? ` (${streakKo(meRow[4])})` : ''}` : ''}${n.lv ? ` · 리그 단계 ${n.lv}` : ''}${n.ovr ? ` · 팀 종합 ${n.ovr}` : ''}`);
  if (n.rival) L.push(`라이벌: ${full(n.rival.id)} (${n.rival.name})`);
  if (n.moment === 'open') {
    if (n.power.length) L.push(`전력 예상(세기): ${n.power.map(([id, p]) => `${short(id)} ${p}`).join(' · ')}`);
    if (n.first) L.push(`개막전: ${full(n.first.opp)}전 (${n.first.home ? '홈' : '원정'})${n.first.sp ? ` · 선발 ${n.first.sp}` : ''}`);
  }
  if (n.ev) {
    L.push(`사건: ${n.ev.text}${n.ev.big ? ' (대형 사건)' : ''}`);
  }
  if (n.game) L.push(`그 경기: ${gameLine(n.game, me)}`);
  if (n.table.length && n.moment !== 'open') L.push(`${n.moment === 'close' ? '최종 순위' : '지금 순위'}: ${tableLine(n.table, me, n.moment === 'close')}`);
  if (n.post) {
    L.push(n.post.stage
      ? `가을야구: ${short(me)} ${n.post.seed}위로 ${STAGE_KO[n.post.stage]}부터${n.post.opp ? ` (첫 상대 ${short(n.post.opp)})` : ''}`
      : `가을야구: ${short(me)} ${n.post.seed ? `${n.post.seed}위로 ` : ''}탈락`);
  }
  if (n.leaders.length) L.push(`개인 1위: ${n.leaders.map(([lab, nm, id, val]) => `${lab} ${nm}(${short(id)}) ${val}`).join(' · ')}`);
  if (n.squad.length) L.push(`내 구단 주요 선수: ${n.squad.map(([nm, pos, m]) => `${nm}(${POS_KO[pos]}${m ? `, ${m}` : ''})`).join('; ')}`);
  if (n.notes.length) L.push(`참고: ${n.notes.join(' / ')}`);
  L.push('');
  if (n.moment === 'open') L.push('할 일: 기사 5개. 개막 판도 전망, 순위 예상, 내 구단 전력과 걱정거리, 리그 수준 이야기. 분류(tag)는 골고루, 내 구단 기사 2개 이상. 댓글 2~3개씩.');
  else if (n.moment === 'close') L.push('할 일: 기사 5개. 최종 순위 정리, 개인 기록·MVP 경쟁, 내 구단 시즌 평가, 가을야구 전망. 분류(tag)는 골고루. 댓글 2~3개씩.');
  else L.push(`할 일: 기사 2~3개. 첫 기사는 이 사건 기사(분류 ${n.ev?.tag ?? '속보'}), 나머지는 뒷이야기·분석 기사. 댓글 2~3개씩.`);
  return L.join('\n');
}

const IV_SYSTEM = [
  "가상 프로야구 '한별 리그' 경기 전 감독 인터뷰를 쓴다. 기자 질문 3개, 질문마다 감독이 고를 답 3개.",
  '- 질문: 자료의 선수 상태(컨디션·피로·부상·기록 흐름)나 상대·순위를 짚는 날카로운 질문, 45자 이내. 선수 한 명을 겨냥하면 target 에 그 선수 키(예: b3, sp), 팀 전체 질문이면 빈 문자열.',
  '- 답 3개는 trust(감싸기·믿음), push(채찍·강수), calm(여유·돌려 말하기) 하나씩. 감독 말투 존댓말, 25자 이내.',
  '- head: 그 답이 기사로 나갈 때 제목. 자극적으로, 20자 이내.',
  '- 이름은 자료에 나온 것만, 적힌 글자 그대로(철자를 고치지 않는다). 실제 선수·감독·구단·기업·언론사 이름, 욕설·비하·정치는 쓰지 않는다. 없는 숫자는 만들지 않는다.',
].join('\n');

const IV_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          target: { type: 'string' },
          q: { type: 'string' },
          answers: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: [...ANSWER_TYPES] },
                text: { type: 'string' },
                head: { type: 'string' },
              },
              required: ['type', 'text', 'head'],
              additionalProperties: false,
            },
          },
        },
        required: ['target', 'q', 'answers'],
        additionalProperties: false,
      },
    },
  },
  required: ['questions'],
  additionalProperties: false,
};

/** 인터뷰 자료 글 */
export function interviewUser(iv: InterviewIn): string {
  const L: string[] = [];
  const me = iv.me;
  if (iv.moment === 'open') {
    L.push(`[개막 미디어데이] ${iv.year} 한별 리그 · ${dateKo(iv.date)} 개막전 앞`);
  } else if (iv.stage) {
    L.push(`[가을야구 출사표] ${iv.year} 정규 시즌 끝 · ${STAGE_KO[iv.stage]} 앞`);
  } else {
    L.push(`[시즌 결산 인터뷰] ${iv.year} 정규 시즌 끝 · 가을야구 탈락`);
  }
  L.push(`내 구단: ${full(me)}${iv.rank ? ` ${iv.rank}위` : ''}${iv.rec ? ` ${recKo(iv.rec[0], iv.rec[1], iv.rec[2])}` : ''}${iv.lv ? ` · 리그 단계 ${iv.lv}` : ''}${iv.ovr ? ` · 팀 종합 ${iv.ovr}` : ''}`);
  if (iv.opp) L.push(`상대: ${full(iv.opp)}${iv.home === undefined ? '' : iv.home ? ' (우리 홈)' : ' (원정)'}${iv.rival ? ` · 라이벌전 ${iv.rival}` : ''}`);
  L.push('선수 (키 이름 자리 · 컨디션 1~5 · 피로 0~100 · 상태):');
  for (const p of iv.players) {
    const bits = [`컨디션 ${p.c}`, `피로 ${p.f}`];
    if (p.inj) bits.push(`부상: ${p.inj}`);
    if (p.note) bits.push(p.note);
    L.push(`${p.k} ${p.n} ${POS_KO[p.pos]} · ${bits.join(' · ')}`);
  }
  if (iv.topics.length) L.push(`화제: ${iv.topics.join(' / ')}`);
  L.push('');
  L.push(iv.moment === 'open'
    ? '할 일: 개막을 앞둔 질문 3개. 선수 몸 상태·기대·상대를 고르게.'
    : iv.stage ? '할 일: 가을야구를 앞둔 질문 3개. 선수 몸 상태·시즌 기록·상대를 고르게.' : '할 일: 시즌을 돌아보는 질문 3개. 아쉬운 점·선수 평가·내년 각오.');
  return L.join('\n');
}

/** 자료 글에 나온 이름 (실존 인물 이름 거르기에서 빼 준다) */
function namesOfNews(n: NewsIn): Set<string> {
  const s = new Set<string>();
  n.squad.forEach((x) => s.add(x[0]));
  n.leaders.forEach((x) => s.add(x[1]));
  if (n.first?.sp) s.add(n.first.sp);
  if (n.game) [n.game.w, n.game.l, n.game.sv, n.game.gw, ...n.game.stars.map((x) => x[0])].forEach((x) => x && s.add(x));
  if (n.ev?.who) s.add(n.ev.who);
  return s;
}

export interface Spec<T> {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens: number;
  /** 입력 토큰 넉넉한 추정 (예산 확인용 — 한글은 글자당 1토큰 남짓) */
  estIn: number;
  read: (text: string, stop: string | null) => T;
}
const estimate = (system: string, user: string) => Math.ceil((system.length + user.length) * 1.6) + 400;

/** 사이트로 돌려주는 글 — 옛 사이트(tv 1)에는 분류를 옛 이름(실화냐 · 루머)으로 */
export type PostWire = Omit<PostOut, 'tag'> & { tag: string };
/** 뉴스 요청 하나 → Claude 에 보낼 것 + 받은 글 읽기 */
export function newsSpec(raw: unknown): Spec<{ posts: PostWire[] }> {
  const n = parseNewsIn(raw);
  const user = newsUser(n);
  const allow = namesOfNews(n);
  return {
    system: NEWS_SYSTEM, user, schema: NEWS_SCHEMA,
    maxTokens: n.moment === 'event' ? EVENT_MAX_TOKENS : NEWS_MAX_TOKENS,
    estIn: estimate(NEWS_SYSTEM, user),
    read: (text, stop) => {
      const posts = readNews(text, stop, n, allow);
      return { posts: n.tv === 2 ? posts : posts.map((p) => ({ ...p, tag: NEW_TO_OLD.get(p.tag) ?? p.tag })) };
    },
  };
}

/** 인터뷰 요청 하나 → Claude 에 보낼 것 + 받은 글 읽기 */
export function interviewSpec(raw: unknown): Spec<{ questions: QuestionOut[] }> {
  const iv = parseInterviewIn(raw);
  const user = interviewUser(iv);
  const allow = new Set(iv.players.map((p) => p.n));
  return {
    system: IV_SYSTEM, user, schema: IV_SCHEMA,
    maxTokens: IV_MAX_TOKENS,
    estIn: estimate(IV_SYSTEM, user),
    read: (text, stop) => ({ questions: readInterview(text, stop, iv, allow) }),
  };
}

/* ───────── 받은 글 검사 · 다듬기 ───────── */
/** JSON 이 끝까지 오지 않았으면(최대 토큰에서 잘림) 마지막으로 끝난 항목까지 살린다 — {"posts":[{…},{…},{… ← 여기서 잘림 */
export function salvage(text: string, key: string): unknown {
  try { return JSON.parse(text); } catch { /* 잘린 글 */ }
  const at = text.indexOf(`"${key}"`);
  const open = at < 0 ? -1 : text.indexOf('[', at);
  if (open < 0) return null;
  let depth = 0, inStr = false, esc = false, lastEnd = -1;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') {
      depth--;
      if (depth === 1 && c === '}') lastEnd = i;
      if (depth <= 0) break;
    }
  }
  if (lastEnd < 0) return null;
  try { return JSON.parse(`{"${key}":${text.slice(open, lastEnd + 1)}]}`); } catch { return null; }
}

/** 실제 구단 별명 → 게임 별명 (긴 것부터) */
const REAL_NICK: [string, string][] = [
  ['슈퍼스타즈', '슈퍼별즈'], ['라이온즈', '사자즈'], ['타이거즈', '호랑이즈'], ['자이언츠', '거인츠'], ['히어로즈', '영웅즈'],
  ['다이노스', '공룡스'], ['와이번스', '비룡스'], ['유니콘스', '일각수스'], ['레이더스', '돌격대스'], ['이글스', '독수리스'],
  ['베어스', '곰스'], ['트윈스', '쌍둥이스'], ['랜더스', '상륙스'], ['돌핀스', '돌고래스'], ['핀토스', '조랑말스'], ['위즈', '마법사즈'],
];
const NICK_ALT = [...GAME_NICKS].sort((a, b) => b.length - a.length).join('|');
/** 실제 모기업 이름 + (게임/실제) 별명 → 별명만 남긴다 ('삼성 사자즈' → '사자즈') */
const PREFIX_RE = new RegExp(`(롯데|삼성|한화|두산|기아|키움|넥센|해태|빙그레|쌍방울|태평양|청보|삼미|현대|신세계|엘지|케이티|엔씨|에스케이|KIA|SSG|SK|NC|KT|LG|OB|MBC)\\s*(?=${NICK_ALT})`, 'gi');
/** 이게 들어 있으면 그 글(댓글)을 뺀다 */
const BLOCK: RegExp[] = [
  // 실제 구단 모기업 · 기업
  /(롯데|삼성|한화|두산|키움|넥센|쌍방울|신세계|이마트|엔씨소프트|엔씨|케이티|엘지|에스케이|해태)/,
  /(?<![A-Za-z])(KIA|SSG|NC|KT|LG|SK|OB|MBC|SBS|KBS|JTBC|SPOTV|CJ)(?![A-Za-z])/i,
  /(현대|기아|빙그레|태평양|청보|삼미)\s?(팬|구단|야구단|시절|왕조|유니폼|선수단)/,
  // 실제 커뮤니티 · 플랫폼
  /(디시|디씨|엠팍|엠엘비파크|펨코|에펨|더쿠|네이버|다음 ?카페|카카오|유튜브|인스타|트위터|페이스북|쿠팡|배민)/,
  // 욕설 · 비하 · 성적 표현
  /(병신|븅신|ㅂㅅ|애자|장애인|정신병|홍어|전라디언|경상디언|개쌍도|멍청도|과메기|짱깨|쪽바리|깜둥이|흑형|틀딱|한남|김치녀|된장녀|맘충|급식충|씨발|시발|ㅅㅂ|ㅆㅂ|좆|새끼|니애미|느금|엠창|섹스|야동|자위|강간|성폭행|창녀|걸레|성매매)/,
  // 정치
  /(일베|메갈|워마드|좌빨|수꼴|대깨|국민의힘|민주당|정의당|윤석열|이재명|문재인|박근혜|이명박|노무현|김정은|트럼프)/,
];
/** 실존 야구인 이름 — 저장소에 실명을 두지 않으려고 이름 대신 FNV-1a 32비트 값만 둔다 (글자 수 3·4자).
 *  자료에 같은 이름이 있으면 그건 게임 선수라 둔다. 목록 원본은 저장소 밖(로컬)에만. */
const REAL_PEOPLE_H = new Set<number>([0x0148fc88, 0x02fbc023, 0x031c1900, 0x09303344, 0x0a272190, 0x0c1ae246, 0x0d5a5f4a, 0x0ef9d493, 0x1840bc22, 0x19743111, 0x19a5406b, 0x1b307348, 0x1be8a18c, 0x1d5c0732, 0x20ad4e92, 0x2446e92f, 0x25b2fe20, 0x2651d8e7, 0x265ebfd3, 0x294c1a0f, 0x2c489323, 0x2fef1203, 0x30032004, 0x3031bf84, 0x304f0d9e, 0x32a43c3a, 0x340f098e, 0x37cf89da, 0x385ec8b6, 0x3d615f77, 0x4131ff55, 0x43726f1b, 0x43a7da57, 0x4704b9b2, 0x49353673, 0x49af61c1, 0x4e846ebc, 0x51306142, 0x51794250, 0x53674857, 0x537fb69d, 0x5384bb00, 0x5c607d10, 0x60de05bf, 0x6363b3c4, 0x63d10932, 0x646bd5cb, 0x64df3932, 0x6507842e, 0x722103a6, 0x72473327, 0x72bd555b, 0x7419d553, 0x7755fc42, 0x7f0be199, 0x7fb218bf, 0x8148aa52, 0x851b401d, 0x8a45fd7e, 0x8cc72386, 0x8ffa829e, 0x93e2d9e3, 0x9411e870, 0x95fae25a, 0x99a31e83, 0x9f7324f7, 0xa01f2462, 0xa0b127c7, 0xa2c1b526, 0xa8c13c10, 0xb6a1089b, 0xb7aa899c, 0xbb63d739, 0xbfa33437, 0xbfd68100, 0xc4306f8a, 0xc92bbbd4, 0xc9edfcd8, 0xca1d992e, 0xca75ee53, 0xcbed36b4, 0xcf3c2a32, 0xcfbc49e2, 0xd31edbf6, 0xd4ae6271, 0xd74f45c2, 0xe84cdcdc, 0xeb0409b4, 0xecc6e8d0, 0xee5d55db, 0xee968703, 0xf1ac33a8, 0xf632aae9, 0xfb2a9094, 0xfbc0acd0, 0xfc3ac6e4]);
const REAL_PEOPLE_LEN = [3, 4];
function fnv1a(t: string): number { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
/** 글 안에 실존 야구인 이름이 있나 (자료의 이름은 빼고) */
function hasRealPerson(t: string, allow: Set<string>): boolean {
  for (const n of REAL_PEOPLE_LEN) for (let i = 0; i + n <= t.length; i++) {
    const w = t.slice(i, i + n);
    if (REAL_PEOPLE_H.has(fnv1a(w)) && !allow.has(w)) return true;
  }
  return false;
}
function blocked(t: string, allow: Set<string>): boolean {
  if (BLOCK.some((re) => re.test(t))) return true;
  return hasRealPerson(t, allow);
}
const cut = (t: string, max: number) => (t.length <= max ? t : t.slice(0, max - 1).trimEnd() + '…');

/* ───────── 자모 하나만 다른 이름 되돌리기 ─────────
 * 게임 속 선수 이름은 실제 이름에서 자모 하나만 바꾼 것('문졍빈'). 모델이 그걸 실제 이름('정빈이는')으로 '고쳐' 쓰면
 * 실명이 새므로, 자료에 나온 이름과 자모 하나만 다른 글자 묶음을 자료의 이름으로 되돌린다.
 *  · 성 포함 전체 이름(2~4자)은 어디서든 · 이름 두 자('졍빈')는 뒤에 부르는 말이 붙을 때만(정빈이는 · 정빈아 · 정빈 선수) */
const H0 = 0xac00;
function jamoOf(ch: string): [number, number, number] | null {
  const c = ch.charCodeAt(0) - H0;
  return c >= 0 && c <= 11171 ? [Math.floor(c / 588), Math.floor((c % 588) / 28), c % 28] : null;
}
function oneJamoOff(a: string, b: string): boolean {
  if (a.length !== b.length || a === b) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    const x = jamoOf(a[i]), y = jamoOf(b[i]);
    if (!x || !y) return false;
    if ((x[0] !== y[0] ? 1 : 0) + (x[1] !== y[1] ? 1 : 0) + (x[2] !== y[2] ? 1 : 0) !== 1) return false;
    if (++diff > 1) return false;
  }
  return diff === 1;
}
const CALL_AFTER = /^(이는|이가|이를|이도|이의|이랑|이|는|가|를|도|의|랑|아|야|씨| 선수)/;
function backTo(t: string, target: string, ok: (after: string) => boolean): string {
  let out = '';
  for (let i = 0; i < t.length;) {
    const w = t.slice(i, i + target.length);
    if (w.length === target.length && oneJamoOff(w, target) && ok(t.slice(i + target.length, i + target.length + 3))) { out += target; i += target.length; }
    else { out += t[i]; i++; }
  }
  return out;
}
export function fixNearNames(t: string, names: Iterable<string>): string {
  for (const n of names) {
    if (!/^[가-힣]{2,4}$/.test(n)) continue;
    t = backTo(t, n, () => true);
    if (n.length === 3) t = backTo(t, n.slice(1), (after) => CALL_AFTER.test(after));
  }
  return t;
}
/** 글 한 토막 다듬기 — 못 쓰면 null */
export function cleanText(v: unknown, max: number, allow: Set<string> = new Set()): string | null {
  if (typeof v !== 'string') return null;
  let t = v.normalize('NFC')
    .replace(/[​-‍⁠︎️]/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[*#`_~]{2,}|[*#`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return null;
  t = fixNearNames(t, allow); // 바뀐 이름을 실제 이름으로 '고쳐' 쓴 것 되돌리기
  // 자료에 나온 이름은 가려 둔다 — 바뀐 이름에 실제 별명 글자가 들어 있어도('패트릭 위즈뎜') 바꾸거나 거르지 않게
  const names = [...allow].filter((n) => n.length >= 2 && t.includes(n)).sort((a, b) => b.length - a.length);
  names.forEach((n, i) => { t = t.split(n).join(`\u0000${i}\u0000`); });
  for (const [real, game] of REAL_NICK) t = t.split(real).join(game);
  t = t.replace(PREFIX_RE, '').replace(/KBO/gi, '한별 리그').replace(/\s+/g, ' ').trim();
  if (!t || blocked(t, allow)) return null;
  names.forEach((n, i) => { t = t.split(`\u0000${i}\u0000`).join(n); });
  return cut(t, max);
}

/**
 * 뉴스 말투 거름 (사이트 web/src/game/press.ts 의 newsTone 과 같게) — 초성(ㅋㅋ · ㄷㄷ · ㄹㅇ …)은 지운다.
 * 댓글이면 커뮤니티 속어(실화냐 · 미쳤다 · 반박 안 받음 · .txt …)가 남거나 너무 짧을 때 그 댓글을 뺀다(null).
 */
const JAMO_RUN = /[\u1100-\u11ff\u3131-\u318e]+/g;
const SLANG = /(실화냐|실화임|미쳤다|미쳤네|미쳤음|개꿀|꿀잼|노잼|반박\s?(안|불가)|\.txt|가즈아|지렸|지린다|오진다|오지네|각이다|각 나온다)/;
export function newsTone(t: string | null, comment = false): string | null {
  if (!t) return null;
  const s = t.replace(JAMO_RUN, ' ').replace(/\s+([.,!?…])/g, '$1').replace(/\s+/g, ' ').trim();
  if (!s || (comment && (s.length < 6 || SLANG.test(s)))) return null;
  return s;
}

export interface PostOut { tag: Tag; title: string; body: string; comments: string[] }
/** 뉴스 글 읽기 — 형식이 틀린 글 · 걸린 글은 빼고, 모자라면 오류(사이트는 템플릿으로) */
export function readNews(text: string, stop: string | null, n: NewsIn, allow: Set<string>): PostOut[] {
  const data = stop === 'max_tokens' ? salvage(text, 'posts') : (() => { try { return JSON.parse(text) as unknown; } catch { return salvage(text, 'posts'); } })();
  if (!isObj(data) || !Array.isArray(data.posts)) throw new PressError(502, 'AI 글 형식이 맞지 않아요');
  const posts: PostOut[] = [];
  for (const p of data.posts) {
    if (!isObj(p)) continue;
    const tag = tagOf(p.tag) ?? null;
    const title = newsTone(cleanText(p.title, 40, allow));
    const body = newsTone(cleanText(p.body, 180, allow));
    if (!tag || !title || !body) continue;
    const comments = (Array.isArray(p.comments) ? p.comments : []).map((c) => newsTone(cleanText(c, 60, allow), true)).filter((c): c is string => !!c).slice(0, 4);
    if (!comments.length) continue;
    posts.push({ tag, title, body, comments });
  }
  const min = n.moment === 'event' ? 1 : 3;
  const max = n.moment === 'event' ? 3 : 6;
  if (posts.length < min) throw new PressError(502, 'AI 글이 모자라요');
  if (n.ev) posts[0].tag = n.ev.tag; // 특이사항 첫 기사 분류는 코드가 정한 것
  return posts.slice(0, max);
}

export interface AnswerOut { type: AnswerType; text: string; head: string }
export interface QuestionOut { target: string | null; q: string; answers: AnswerOut[] }
/** 인터뷰 읽기 — 답 3개(trust · push · calm 하나씩)가 다 맞는 질문만, 3개까지 */
export function readInterview(text: string, stop: string | null, iv: InterviewIn, allow: Set<string>): QuestionOut[] {
  const data = stop === 'max_tokens' ? salvage(text, 'questions') : (() => { try { return JSON.parse(text) as unknown; } catch { return salvage(text, 'questions'); } })();
  if (!isObj(data) || !Array.isArray(data.questions)) throw new PressError(502, 'AI 인터뷰 형식이 맞지 않아요');
  const keys = new Map(iv.players.map((p) => [p.k, p.id]));
  const out: QuestionOut[] = [];
  for (const q of data.questions) {
    if (!isObj(q)) continue;
    const qt = cleanText(q.q, 80, allow);
    if (!qt || !Array.isArray(q.answers)) continue;
    const tk = typeof q.target === 'string' ? q.target.trim() : '';
    const target = keys.get(tk) ?? null;
    const seen = new Set<string>();
    const answers: AnswerOut[] = [];
    for (const a of q.answers) {
      if (!isObj(a) || typeof a.type !== 'string' || !(ANSWER_TYPES as readonly string[]).includes(a.type) || seen.has(a.type)) continue;
      const t = cleanText(a.text, 50, allow), h = cleanText(a.head, 40, allow);
      if (!t || !h) continue;
      seen.add(a.type);
      answers.push({ type: a.type as AnswerType, text: t, head: h });
    }
    if (answers.length !== 3) continue;
    out.push({ target, q: qt, answers });
    if (out.length === 3) break;
  }
  if (!out.length) throw new PressError(502, 'AI 인터뷰가 비었어요');
  return out;
}
