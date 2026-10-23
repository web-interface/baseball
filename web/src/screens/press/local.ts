// 언론 템플릿 — AI 를 부르지 않는 날마다 기사와, AI 를 못 쓸 때 개막 특집 · 시즌 결산 · 특이사항 · 인터뷰 대신.
// 돈이 안 든다. 경기 자료(game/press 의 openFacts · closeFacts · dayFacts · ivFacts)로만 쓴다 — 결과 · 숫자는 그대로, 실제 이름 없음.
// 같은 날 · 같은 자리는 늘 같은 글(시즌 시드로 고름) — 다시 열어도 바뀌지 않는다.
// 말투: 제목은 자극적인 스포츠 기사 헤드라인(따옴표 인용 · 말줄임), 본문은 ~했다 체 리드 2~3문장,
//   댓글은 포털 뉴스 독자 댓글 — 완결된 문장, 존댓말(~네요 · ~습니다)과 평서문(~다)을 섞고 가끔 짧은 질문, 20~45자.
//   초성(ㅋㅋ · ㄹㅇ) · 커뮤니티 속어(실화냐 · 미쳤다 · ~각 · .txt) · 반말 조롱 · 이모지 없음. 제목 앞 [ ] 머리말은 쓰지 않는다(분류는 tag).
//   인터뷰 답은 감독 존댓말. 욕설 · 비하 · 실제 구단/선수/기업/언론사 이름 없음.
import { ME, playerById, teamById } from '../../game/mock';
import {
  POST_SEEDS, evTag, pickOf, rng, seriesKo,
  type AnsType, type CloseFacts, type DayFacts, type EvKind, type EvRec, type IvFacts, type IvOpt, type IvQ, type OpenFacts, type PlayerFact, type PressTag, type RawPost,
} from '../../game/press';
import { longDate } from '../../season/schedule';
import type { NewsRec } from '../../season/store';

/* ───────── 글 채우기 — '{P:이가}' → '독고현이' ───────── */
type Vars = Record<string, string | number | undefined>;
/** 끝 글자 받침 (0 없음 · 8 ㄹ) — 숫자는 읽는 소리로 */
function jong(w: string): number {
  const ch = w.trim().slice(-1);
  const c = ch.charCodeAt(0);
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28;
  if (/[0-9]/.test(ch)) return [21, 8, 0, 16, 0, 0, 1, 8, 8, 0][Number(ch)];
  return 0;
}
const JOSA: Record<string, (j: number) => string> = {
  이가: (j) => (j ? '이' : '가'), 은는: (j) => (j ? '은' : '는'), 을를: (j) => (j ? '을' : '를'), 과와: (j) => (j ? '과' : '와'),
  으로: (j) => (j && j !== 8 ? '으로' : '로'), 이랑: (j) => (j ? '이랑' : '랑'), 이야: (j) => (j ? '이야' : '야'), 이다: (j) => (j ? '이다' : '다'),
  이라: (j) => (j ? '이라' : '라'), 이었다: (j) => (j ? '이었다' : '였다'),
};
/** 빈 값이 하나라도 있으면 null (그 글은 쓰지 않는다) */
function fill(t: string, v: Vars): string | null {
  let miss = false;
  const out = t.replace(/\{(\w+)(?::([^}]+))?\}/g, (_, k: string, j?: string) => {
    const val = v[k];
    if (val === undefined || val === '') { miss = true; return ''; }
    const s = String(val);
    return j && JOSA[j] ? s + JOSA[j](jong(s)) : s;
  });
  return miss ? null : out;
}
type R = () => number;
/** 후보 중 채울 수 있는 것 하나 — at 을 주면 그 순번부터(날마다 돌아가며) */
function one(r: R, pool: readonly string[], v: Vars, at?: number): string | null {
  const start = at !== undefined ? ((at % pool.length) + pool.length) % pool.length : Math.floor(r() * pool.length);
  for (let i = 0; i < pool.length; i++) { const t = fill(pool[(start + i) % pool.length], v); if (t) return t; }
  return null;
}
/** 댓글 n개 (서로 다르게, 여러 묶음에서 번갈아) */
function cmts(r: R, pools: readonly (readonly string[])[], v: Vars, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < 30 && out.length < n; i++) {
    const pool = pools[i % pools.length];
    const t = fill(pickOf(r, pool), v);
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}
const post = (tag: PressTag, title: string | null, body: string | null, comments: string[]): RawPost | null =>
  title && body && comments.length ? { tag, title, body, comments } : null;
const short = (id: string | undefined) => (id ? teamById(id).short : undefined);
const pName = (id: string | undefined) => (id ? playerById(id)?.name : undefined);
const nOf = (r: R) => (r() < 0.45 ? 2 : 3);
/** '2027-04-12' → '4월 12일' */
const dayKo = (date: string) => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;
/** 전적 — 무승부가 없으면 '23승 16패' */
const recKo = (w: number, d: number, l: number) => (d ? `${w}승 ${d}무 ${l}패` : `${w}승 ${l}패`);

/* ═════════════ 날마다 기사 — 내 경기 ═════════════ */
// {T} 내 구단 · {O} 상대 · {S} 점수(내 쪽 먼저) · {AT} 안방서/원정서 · {INN} 이닝 · {H} 내 안타 · {E} 내 실책
// 안타 수에 따라서만 채워지는 칸(비면 그 문장은 건너뜀): {HMANY} 10개 이상 · {HSOME} 6개 이상 · {OHFEW} 상대 안타 5개 이하
// {W} 승리 투수 · {L} 패전 투수 · {SV} 세이브 · {GW} 결승타 · {HERO} 수훈 타자 · {HL} 그 타자 기록 한 줄
const WIN_T = ['{T}, {O} 꺾고 {S} 승리', '{T}, {AT} {O}에 {S} 승리', '"오늘은 달랐다" {T}, {O} 제압', '{T} 웃었다… {O}에 {S} 승', '{O} 넘은 {T}, {S} 승리 챙겼다', '{T} 타선 집중력 빛났다… {O}에 {S} 승'];
const WIN_HERO_T = ['{HERO} 맹타… {T}, {O} 꺾었다', '"{HERO}의 날" {T}, {O}에 {S} 승리', '{HERO} 원맨쇼, {T} {S} 승리 이끌었다'];
const WIN_B = [
  '{T:이가} {O:을를} {S:으로} 꺾었다. 타선이 안타 {HMANY}개를 몰아치며 경기 흐름을 가져왔다.',
  '{T:이가} {O:과와}의 맞대결에서 {S:으로} 이겼다. 투타가 고르게 힘을 보태며 승리를 챙겼다.',
  '{T:이가} {O} 마운드를 상대로 안타 {H}개를 뽑아내며 {S:으로} 승리했다. 타선의 집중력이 돋보인 경기였다.',
  '{T:이가} {O:을를} {S:으로} 꺾었다. 필요한 순간마다 점수를 뽑아내며 경기를 가져왔다.',
];
const WIN_HERO_B = [
  '{HERO:이가} {HL:으로} 공격을 이끌었다. {T:은는} {O:을를} {S:으로} 꺾었다.',
  '{T:이가} {O:을를} {S:으로} 눌렀다. {HERO:이가} {HL:으로} 펄펄 날며 승리의 일등 공신이 됐다.',
];
const WIN_PIT_B = [
  '{T:이가} {O:을를} {S:으로} 꺾었다. {W:이가} 승리 투수가 됐고, {SV:이가} 마지막 이닝을 막아 세이브를 올렸다.',
  '{T:이가} {O}에 {S:으로} 이겼다. 승리는 {W}, 세이브는 {SV}의 몫이었다. 마운드가 끝까지 리드를 지켰다.',
];
const LOSS_T = ['{T}, {O} 벽 못 넘었다… {S} 패', '고개 숙인 {T}, {O}에 {S} 패', '{T}, {AT} {O}에 일격… {S} 패배', '{T}, {O}에 {S} 덜미'];
/** 2점 이하로 졌을 때 — 타선 이야기 */
const LOSS_LOW_T = ['{T}, {O}에 {S} 패배… 타선 침묵', '"찬스마다 범타" {T}, {O}에 무릎'];
const LOSS_PIT_T = ['{L} 난조… {T}, {O}에 {S} 패', '"버티지 못했다" {L}, 패전 멍에', '{L} 흔들린 {T}, {O}에 {S} 패배'];
const LOSS_B = [
  '{T:이가} {O:과와}의 경기에서 {S:으로} 졌다. 승부처에서 한 방이 나오지 않았다.',
  '{T:이가} {O}에 {S:으로} 패했다. 추격의 불씨를 살렸지만 끝내 경기를 뒤집지 못했다.',
];
const LOSS_LOW_B = [
  '{T:이가} {O} 마운드에 막혀 {S:으로} 졌다. 안타 {HSOME}개를 치고도 득점으로 잇지 못했다.',
  '{T:이가} {O}에 {S:으로} 패했다. 타선이 좀처럼 실마리를 풀지 못했다.',
];
const LOSS_PIT_B = ['패전 투수 {L:이가} 흔들리면서 흐름이 넘어갔다. {T:은는} {O}에 {S:으로} 졌다.'];
const LOSS_ERR_B = ['수비가 발목을 잡았다. {T:은는} 실책 {E}개를 범하며 {O}에 {S:으로} 졌다.'];
const DRAW_T = ['{T}·{O}, {INN}회 혈투 끝 {S} 무승부', '승자 없는 {INN}회… {T}, {O:과와} {S} 무승부'];
const DRAW_B = ['{T:과와} {O:이가} {INN}회까지 맞섰지만 승부를 가리지 못했다. 두 팀은 {S:으로} 경기를 마쳤다.'];
const WO_W_T = ['{T}, {INN}회말 끝내기… {O}에 {S} 승리', '"극장 승부" {T}, {O}에 끝내기 승', '{GW} 끝내기 한 방, {T} {O} 꺾었다'];
const WO_W_B = [
  '{T:이가} {INN}회말 끝내기로 {O:을를} {S:으로} 꺾었다. 결승타의 주인공은 {GW:이었다}.',
  '마지막 이닝에 승부가 갈렸다. {T:이가} {INN}회말 끝내기로 {O}에 {S} 승리를 거뒀다.',
];
const WO_L_T = ['{T}, {INN}회말 끝내기 허용… {O}에 {S} 패', '마지막 고비 못 넘었다… {T}, 끝내기 패배'];
const WO_L_B = ['{T:이가} {INN}회말 끝내기를 내주며 {O}에 {S:으로} 졌다. 끝까지 버텼지만 마지막 이닝을 지키지 못했다.'];
const BLOW_W_T = ['{T} 타선 폭발… {O}에 {S} 대승', '"쉬어 갈 틈이 없었다" {T}, {O} 대파', '{S} 대승… {T}, {O} 마운드 맹폭'];
const BLOW_W_B = [
  '{T:이가} 장단 {HMANY}안타를 몰아치며 {O:을를} {S:으로} 대파했다. 타선이 쉬어 갈 틈 없이 상대 마운드를 두들겼다.',
  '{T:이가} {O:을를} {S:으로} 대파했다. 타선이 기회마다 점수를 쌓으며 일찌감치 승기를 굳혔다.',
];
const BLOW_L_T = ['{T}, {O}에 {S} 대패… 마운드 붕괴', '"속수무책" {T}, {O}에 {S} 완패'];
const BLOW_L_B = ['{T:이가} {O}에 {S:으로} 완패했다. 마운드가 상대 타선을 막지 못하면서 점수 차가 걷잡을 수 없이 벌어졌다.'];
const SHUT_W_T = ['{T} 마운드, {O} 타선 꽁꽁… {S} 영봉승', '"단 한 점도 없었다" {T}, {O}에 영봉승'];
const SHUT_W_B = [
  '{T:이가} {O} 타선을 무득점으로 막고 {S:으로} 이겼다. {W:이가} 승리 투수가 됐다.',
  '{T:이가} {O}에 {S} 영봉승을 거뒀다. 마운드는 안타 {OHFEW}개만 허용하며 상대 타선을 봉쇄했다.',
  '{T:이가} {O}에 {S} 영봉승을 거뒀다. 마운드가 끝까지 한 점도 내주지 않았다.',
];
const SHUT_L_T = ['{T} 타선 침묵… {O}에 {S} 영봉패', '"한 점이 멀었다" {T}, 무득점 패배'];
const SHUT_L_B = [
  '{T:이가} {O} 마운드에 막혀 {S:으로} 영봉패를 당했다. 타선은 끝내 해법을 찾지 못했다.',
  '{T:이가} {O}에 {S:으로} 졌다. 안타 {HSOME}개를 치고도 한 번도 홈을 밟지 못했다.',
];
const XTRA_W_T = ['{INN}회 연장 혈투… {T}, {O}에 {S} 승리', '"끝까지 버텼다" {T}, 연장 끝 {O} 제압'];
const XTRA_W_B = ['{T:이가} {INN}회까지 이어진 접전 끝에 {O:을를} {S:으로} 꺾었다. 불펜 투수들이 총동원된 혈투였다.'];
const XTRA_L_T = ['{INN}회 연장 끝 고배… {T}, {O}에 {S} 패', '연장 혈투 끝 {T} 석패… {O}에 {S}'];
const XTRA_L_B = ['{T:이가} {INN}회 연장 승부 끝에 {O}에 {S:으로} 졌다. 불펜 소모가 컸던 만큼 다음 경기 마운드 운용이 과제로 남았다.'];
const ONE_W_T = ['한 점 차 진땀승… {T}, {O}에 {S} 승리', '{T}, {O}에 {S} 신승… 끝까지 버텼다'];
const ONE_W_B = ['{T:이가} {O:을를} {S:으로} 꺾었다. 마지막까지 이어진 한 점 차 승부에서 웃었다.'];
const ONE_L_T = ['{T}, {O}에 {S} 석패… 한 점이 모자랐다', '"딱 한 점" {T}, {O}에 아쉬운 패배'];
const ONE_L_B = ['{T:이가} {O}에 {S:으로} 아깝게 졌다. 끝까지 추격했지만 마지막 한 점을 뽑지 못했다.'];

// 독자 댓글 — 칭찬 · 분석 · 아쉬움(경기력만, 정중하게) · 걱정 · 응원 · 질문을 섞는다
const WIN_C = [
  '이 흐름을 다음 시리즈까지 이어 갔으면 좋겠습니다.', '오늘 같은 경기력이면 순위 싸움도 해 볼 만하네요.', '{T} 팬으로서 오늘은 정말 기분 좋은 하루입니다.',
  '이겼지만 중반 찬스를 놓친 건 짚고 넘어가야 합니다.', '방심하지 말고 다음 경기도 집중해 주길 바랍니다.', '라인업 조정이 효과를 본 것 같아 반갑네요.',
  '{O} 상대로 이런 경기가 더 많아졌으면 합니다.', '직관 가신 분들은 오늘 정말 즐거우셨겠네요.', '타순 짜임새가 확실히 좋아진 게 보입니다.',
  '선수들 오늘 정말 수고 많았습니다. 계속 응원합니다.', '승리는 좋은데 다음 경기 선발은 누가 나오나요?',
];
/** 7점 이상 냈을 때 */
const WIN_BIG_C = ['오늘은 타선이 고르게 터져서 보는 맛이 있었네요.', '방망이가 이렇게만 맞아 주면 걱정이 없겠습니다.'];
/** 3점 이하로 막았을 때 */
const WIN_PIT_C = ['선발이 버텨 주니까 경기가 확실히 편하게 풀립니다.', '마운드가 안정되니 이길 수 있는 경기가 늘어나네요.'];
/** 실책 없이 이겼을 때 */
const WIN_DEF_C = ['수비가 안정되니 투수들도 편하게 던지는 것 같네요.'];
const HERO_C = [
  '{HERO} 선수 요즘 타격감이 정말 물이 올랐네요.', '오늘 수훈 선수는 누가 봐도 {HERO} 선수입니다.', '{HERO} 선수가 중심을 잡아 주니 타선이 살아납니다.',
  '{HERO} 선수 이 페이스면 시즌 기록도 기대됩니다.', '{HERO} 선수 타석 때마다 뭔가 해 줄 것 같았어요.',
];
const LOSS_C = [
  '찬스에서 한 방이 안 나오니 이길 수가 없네요.', '불펜 운용은 다시 한번 점검이 필요해 보입니다.', '타순에 변화를 줄 때가 된 것 같습니다.',
  '졌지만 끝까지 뛰는 모습은 보기 좋았습니다.', '연패로 이어지지 않게 다음 경기는 꼭 잡았으면 합니다.', '선발이 조금만 더 버텨 줬으면 어땠을까 싶네요.',
  '이런 날도 있는 거죠. 다음 경기에서 만회합시다.', '그래도 응원합니다. 분위기만 다시 살렸으면 좋겠네요.', '경기 운영이 매끄럽지 않았던 건 짚어야 할 것 같습니다.',
  '마운드와 타선이 엇박자를 낸 경기였다고 봅니다.', '다음 경기에서는 반드시 반등했으면 좋겠습니다.',
];
/** 3점 이하로 졌을 때 — 타선 이야기 */
const LOSS_LOW_C = ['오늘은 상대 투수가 잘 던졌다고 인정해야죠.', '중심 타선이 언제쯤 살아날지 걱정이 큽니다.', '주자가 나가도 진루타가 안 나오는 게 문제네요.'];
const CLOSE_LOSS_C = [
  '한 끗 차이였네요. 마지막 찬스가 정말 아쉽습니다.', '끝까지 따라붙은 집중력은 칭찬하고 싶습니다.', '경기력 자체는 나쁘지 않았다고 봅니다. 운이 없었네요.',
  '이런 접전을 잡아야 상위권으로 갈 수 있습니다.', '대타 카드를 조금 더 일찍 썼으면 어땠을까요?', '접전 끝에 져서 더 속이 쓰리네요. 다음엔 꼭 이기길.',
];
const BLOW_LOSS_C = [
  '점수 차가 너무 벌어져서 중간부터 보기가 힘들었습니다.', '투수 교체 타이밍이 계속 한 박자 늦었던 것 같네요.', '이런 경기는 빨리 잊고 다음 경기를 준비하는 게 낫겠습니다.',
  '마운드 전체를 다시 점검해야 할 시점인 것 같습니다.', '크게 졌어도 배울 점은 있을 겁니다. 선수들 힘내세요.',
];
const SHUT_LOSS_C = ['한 점도 못 낸 건 타선이 반성해야 할 부분입니다.', '상대 투수 공략법을 다시 고민해야 할 것 같네요.', '득점 지원이 없으니 투수들만 고생했네요.'];
const DRAW_C = [
  '이기지는 못했지만 지지 않은 걸로 위안 삼겠습니다.', '긴 승부를 펼친 선수들 체력 관리가 걱정되네요.', '불펜을 많이 써서 다음 경기 운용이 걱정입니다.',
  '양 팀 모두 마운드가 잘 버틴 경기였다고 봅니다.', '무승부도 순위 싸움에선 의미가 있다고 생각합니다.',
];
const WO_W_C = [
  '마지막까지 포기하지 않은 선수들 정말 대단합니다.', '끝내기 순간 소름이 돋았네요. 오래 기억될 경기입니다.', '{GW} 선수가 결정적인 순간에 해결사 역할을 했네요.',
  '이런 경기를 잡으면 팀 분위기가 확 살아납니다.', '끝까지 본 보람이 있었습니다. 선수들 고생 많았어요.', '{T} 요즘 뒷심이 확실히 좋아진 것 같습니다.',
];
const WO_L_C = [
  '마지막 이닝 투수 운용은 아쉬움이 남네요.', '다 잡았다고 생각했는데 끝내기라니 허탈합니다.', '오늘 같은 패배가 제일 아픕니다. 그래도 힘내세요.',
  '마무리 투수 컨디션 관리가 필요해 보입니다.', '끝까지 잘 싸웠는데 마지막 한 이닝이 아쉬웠네요.',
];

/** 그날 내 경기 기사 */
function myGamePost(f: DayFacts, r: R): RawPost | null {
  const m = f.my;
  if (!m) return null;
  const side = m.home ? 1 : 0;
  // 수훈 타자 — 멀티히트 · 홈런 · 3타점 이상일 때만 '맹타' 기사감으로
  const hb = f.box?.bat[side].filter((b) => b.H >= 2 || b.HR >= 1 || b.RBI >= 3).sort((a, b) => (b.HR * 4 + b.H * 1.5 + b.RBI * 1.5) - (a.HR * 4 + a.H * 1.5 + a.RBI * 1.5))[0];
  const hero = hb ? [hb.name, [`${hb.AB}타수 ${hb.H}안타`, hb.HR ? `${hb.HR}홈런` : '', hb.RBI ? `${hb.RBI}타점` : ''].filter(Boolean).join(' ')] as const : undefined;
  const myPit = (id: string | undefined) => (id && f.box?.pit[side].some((p) => p.id === id) ? pName(id) : undefined);
  const H = m.hits?.[side], OH = m.hits?.[1 - side], E = m.errors?.[side];
  const v: Vars = {
    T: short(f.me), O: short(m.opp), S: `${m.my}:${m.their}`, AT: m.home ? '안방서' : '원정서', INN: m.inn, H, E,
    HMANY: H !== undefined && H >= 10 ? H : undefined, HSOME: H !== undefined && H >= 6 ? H : undefined, OHFEW: OH !== undefined && OH <= 5 ? OH : undefined,
    W: myPit(m.dec?.w), L: myPit(m.dec?.l), SV: myPit(m.dec?.s), GW: f.box?.gw && f.box.gw.side === side ? f.box.gw.name : undefined,
    HERO: hero?.[0], HL: hero?.[1],
  };
  // 댓글 묶음 — 점수 · 실점 · 실책에 맞는 말만 더한다 (3점 낸 날 '타선이 고르게 터졌다' 같은 말이 나오지 않게)
  const winC = [...WIN_C, ...(m.my >= 7 ? WIN_BIG_C : []), ...(m.their <= 3 ? WIN_PIT_C : []), ...(E === 0 ? WIN_DEF_C : [])];
  const lossC = m.my <= 3 ? [...LOSS_C, ...LOSS_LOW_C] : LOSS_C;
  const d = m.my - m.their;
  const at = f.idx * 3 + (f.seed.charCodeAt(0) || 0);
  const pickPost = (tag: PressTag, T: readonly string[], B: readonly string[], C: readonly (readonly string[])[]) => post(tag, one(r, T, v, at), one(r, B, v, at), cmts(r, C, v, nOf(r)));
  if (m.res === 'D') return pickPost('속보', DRAW_T, DRAW_B, [DRAW_C]);
  if (m.wo) return m.res === 'W' ? pickPost('화제', WO_W_T, WO_W_B, [WO_W_C, winC]) : pickPost('충격', WO_L_T, WO_L_B, [WO_L_C, lossC]);
  if (m.inn >= 10) return d > 0 ? pickPost('화제', XTRA_W_T, XTRA_W_B, [winC]) : pickPost('충격', XTRA_L_T, XTRA_L_B, [CLOSE_LOSS_C, lossC]);
  if (d >= 7) return pickPost('화제', BLOW_W_T, BLOW_W_B, [winC, HERO_C]);
  if (d <= -7) return pickPost('충격', BLOW_L_T, BLOW_L_B, [BLOW_LOSS_C, lossC]);
  if (d > 0 && m.their === 0) return pickPost('속보', SHUT_W_T, SHUT_W_B, [winC]);
  if (d < 0 && m.my === 0) return pickPost('충격', SHUT_L_T, SHUT_L_B, [SHUT_LOSS_C, lossC]);
  if (d === 1 && r() < 0.5) return pickPost('속보', ONE_W_T, ONE_W_B, [winC, HERO_C]);
  if (d === -1 && r() < 0.5) return pickPost('속보', ONE_L_T, ONE_L_B, [CLOSE_LOSS_C]);
  if (d > 0) {
    const useHero = !!v.HERO && r() < 0.5;
    const usePit = !useHero && !!v.W && !!v.SV && r() < 0.5;
    return post(useHero ? '화제' : '속보', one(r, useHero ? WIN_HERO_T : WIN_T, v, at), one(r, useHero ? WIN_HERO_B : usePit ? WIN_PIT_B : WIN_B, v, at), cmts(r, useHero ? [winC, HERO_C] : [winC], v, nOf(r)));
  }
  const usePit = !!v.L && r() < 0.4;
  const useErr = !usePit && (Number(v.E) || 0) >= 2;
  const low = m.my <= 2;
  return post(d <= -3 ? '충격' : '속보', one(r, usePit ? LOSS_PIT_T : low ? LOSS_LOW_T : LOSS_T, v, at), one(r, usePit ? LOSS_PIT_B : useErr ? LOSS_ERR_B : low ? LOSS_LOW_B : LOSS_B, v, at), cmts(r, d >= -2 ? [CLOSE_LOSS_C, lossC] : d <= -5 ? [lossC, BLOW_LOSS_C] : [lossC], v, nOf(r)));
}

/* ═════════════ 날마다 기사 — 연승 · 연패 · 순위 ═════════════ */
const STREAK_W_T = ['{T}, 파죽의 {N}연승 질주', '"질 줄 모른다" {T}, {N}연승 신바람', '{T} {N}연승… 지금 리그에서 가장 뜨거운 팀'];
const STREAK_W_B = ['{T:이가} {N}연승을 달렸다. 순위는 {R}위로, 팀 분위기가 한껏 달아올랐다.', '{T:이가} 최근 {N}경기를 모두 이겼다. 투타가 맞물리며 상승세를 이어 가고 있다.'];
const STREAK_W_C = [
  '연승 기간에도 들뜨지 말고 한 경기씩 가길 바랍니다.', '요즘 {T} 경기는 볼 때마다 기대가 됩니다.', '연승 중일수록 선수들 체력 관리가 중요하다고 봅니다.',
  '이 기세 그대로 상위권까지 치고 올라갔으면 합니다.', '연승이 길어지니 팀 전체에 자신감이 붙은 게 보이네요.',
];
const STREAK_L_T = ['"출구가 안 보인다" {T}, 충격의 {N}연패', '{T}, {N}연패 수렁… 반등 해법은', '{N}연패 늪에 빠진 {T}, 해법 찾을까'];
const STREAK_L_B = ['{T:이가} {N}연패에 빠졌다. 순위는 {R}위까지 밀려났다.', '{T:이가} {N}경기째 승리를 신고하지 못했다. 투타 엇박자가 이어지며 반등의 실마리를 찾지 못하고 있다.'];
const STREAK_L_C = [
  '연패가 길어지니 선수들도 위축된 것 같아 걱정입니다.', '분위기 전환을 위한 변화가 필요한 시점이라고 봅니다.', '한 경기만 잡으면 흐름이 바뀔 겁니다. 힘내세요.',
  '타선과 마운드가 번갈아 흔들리는 게 문제네요.', '팬들은 기다립니다. 다음 경기에서 꼭 끊어 주세요.',
];
const RANK_UP_T = ['{T}, {R}위로 도약… 순위 경쟁 불붙었다', '{T}, 하루 만에 {PR}위→{R}위 껑충'];
const RANK_UP_B = ['{T:이가} 하루 만에 {PR}위에서 {R}위로 올라섰다. 순위 싸움이 한층 치열해졌다.'];
const RANK_DN_T = ['{T}, {R}위로 하락… 순위 경쟁 빨간불', '{T}, {PR}위서 {R}위로 밀려났다'];
const RANK_DN_B = ['{T:이가} 하루 사이 {PR}위에서 {R}위로 내려앉았다. 반등을 위한 승리가 필요하다.'];
const LINE_IN_T = ['{T}, 가을야구 마지노선 진입… {R}위 도약'];
const LINE_IN_B = ['{T:이가} {R}위로 올라서며 가을야구 진출 마지노선({LINE}위) 안으로 들어왔다. 이제는 자리를 지키는 싸움이다.'];
const LINE_OUT_T = ['{T}, 가을야구권 밖으로… {R}위 추락'];
const LINE_OUT_B = ['{T:이가} {R}위로 밀리며 가을야구 진출 마지노선({LINE}위) 밖으로 벗어났다. 남은 경기 하나하나가 결승전이 됐다.'];
const RANK_C = [
  '시즌은 길다고 봅니다. 순위보다 경기력이 중요하죠.', '지금부터는 한 경기 한 경기가 정말 중요하겠네요.', '순위표가 매일 바뀌니 보는 재미가 있습니다.',
  '아래 팀들과 승차가 크지 않아 긴장해야 합니다.', '이 순위를 끝까지 지켜 낼 수 있을지 궁금하네요.',
];

/* ═════════════ 날마다 기사 — 리그 소식 ═════════════ */
const NEWS_C: Record<string, readonly string[]> = {
  노히트: ['노히트노런이라니 정말 보기 드문 기록이네요.', '마지막 이닝까지 집중력을 지킨 게 대단합니다.', '리그 역사에 남을 경기입니다. 축하합니다.', '상대 타선은 오늘 해법을 전혀 찾지 못했네요.'],
  끝내기: ['요즘 {X} 뒷심이 정말 무섭네요. 기세가 대단합니다.', '{Y} 입장에서는 정말 뼈아픈 패배겠습니다.', '끝까지 집중력을 잃지 않은 {X} 선수들 대단합니다.'],
  역전: ['야구는 끝까지 봐야 한다는 걸 다시 느꼈습니다.', '{X}의 저력은 인정할 수밖에 없겠네요.', '리드를 지키지 못한 쪽은 불펜 점검이 필요해 보입니다.'],
  기록: ['{WHO} 선수 컨디션이 최고조인 것 같습니다.', '이런 기록은 쉽게 나오지 않죠. 대단합니다.', '상대 팀 입장에서는 정말 막기 어려웠겠네요.', '시즌 끝까지 이 페이스를 유지할 수 있을지 궁금합니다.'],
  부상: ['큰 부상이 아니길 바랍니다. 건강이 먼저입니다.', '무리하지 말고 완전히 회복해서 돌아오길 바랍니다.', '빈자리를 누가 메울지가 당분간 관건이겠네요.'],
  취소: ['밀린 경기가 몰리면 막판 일정이 빡빡해지겠네요.', '선수들에게는 꿀 같은 휴식이 됐을 것 같습니다.', '직관 계획이 있었는데 아쉽네요. 다음을 기약합니다.', '우천 취소가 순위 싸움에 어떤 변수가 될지 궁금합니다.'],
  순위: ['선두 싸움이 갈수록 정말 흥미진진해지네요.', '{X} 요즘 기세라면 쉽게 내려오지 않겠습니다.', '시즌은 아직 길다고 봅니다. 끝까지 지켜봐야죠.'],
  연승: ['요즘 {X} 경기력은 인정할 수밖에 없네요.', '{X} 팬분들은 요즘 야구 볼 맛 나시겠습니다.', '연승이 어디까지 이어질지 지켜보겠습니다.'],
  연패: ['{X} 팬분들 요즘 마음고생이 심하시겠네요.', '분위기를 바꿀 계기가 하나 필요해 보입니다.', '연패는 언젠가 끝납니다. 선수들 힘내길 바랍니다.'],
};
/** 리그 소식(시즌 기록 한 줄) → 기사 */
function newsPost(n: NewsRec, f: DayFacts, r: R): RawPost | null {
  const X = short(n.team);
  const who = /^(.+?)\(/.exec(n.text)?.[1];
  const num = Number(/(\d+)/.exec(n.text)?.[1] ?? 0) || undefined;
  const mine = n.team === f.me;
  const v: Vars = { X, WHO: who, N: num };
  const c = (k: string, w: Vars = v) => cmts(r, [NEWS_C[k] ?? NEWS_C.순위], w, 2);
  switch (n.kind) {
    case '노히트': {
      const w: Vars = { ...v, Y: /— (.+?) 타선/.exec(n.text)?.[1] };
      return post('화제', one(r, ['{X} 마운드, 노히트노런 대기록', '"안타 하나도 없었다" {X}, 노히트노런'], w),
        one(r, ['{X} 투수진이 {Y} 타선을 상대로 노히트노런을 합작했다. 9이닝 동안 안타를 단 하나도 내주지 않았다.', '{X} 마운드가 노히트노런을 달성했다. 상대 타선은 경기 내내 안타를 하나도 때려내지 못했다.'], w), c('노히트', w));
    }
    case '끝내기': {
      const m = /, (\d+)회말 끝내기로 (.+?)[를을] 꺾/.exec(n.text);
      const w: Vars = { ...v, INN: m?.[1], Y: m?.[2] };
      return post('속보', one(r, ['{X}, {INN}회말 끝내기로 {Y} 제압', '"극장 승부" {X}, {Y}에 끝내기 승'], w),
        one(r, ['{X:이가} {INN}회말 끝내기로 {Y:을를} 꺾었다. 마지막 이닝에 승부를 결정지으며 홈 팬들을 열광시켰다.'], w), c('끝내기', w));
    }
    case '역전': {
      const sc = /\((\d+):(\d+)\)/.exec(n.text);
      const w: Vars = { ...v, SC: sc ? `${Math.max(Number(sc[1]), Number(sc[2]))}:${Math.min(Number(sc[1]), Number(sc[2]))}` : undefined };
      return post('화제', one(r, ['{X}, {N}점 차 뒤집었다… 역전 드라마', '"포기는 없었다" {X}, {N}점 차 역전승'], w),
        one(r, ['{X:이가} {N}점 차 열세를 뒤집고 {SC:으로} 이겼다. 끈질긴 추격이 결실을 맺었다.', '{X:이가} {N}점 차로 끌려가던 경기를 뒤집었다. 경기 막판까지 이어진 추격전 끝에 웃었다.'], w), c('역전'));
    }
    case '기록': {
      const hr = /홈런/.test(n.text), so = /탈삼진/.test(n.text);
      const T = hr ? ['{WHO}, 한 경기 {N}홈런 폭발', '"담장을 {N}번 넘겼다" {WHO} 괴력']
        : so ? ['{WHO}, 탈삼진 {N}개 "닥터 K" 쇼', '{WHO} 삼진 퍼레이드… {N}K 역투']
          : ['{WHO}, 한 경기 5안타 맹타', '"치면 안타" {WHO}, 5안타 폭발'];
      const B = hr ? ['{X} {WHO:이가} 한 경기 홈런 {N}개를 몰아쳤다. 상대 마운드는 그의 방망이를 끝내 감당하지 못했다.']
        : so ? ['{X} {WHO:이가} 탈삼진 {N}개를 잡아내며 상대 타선을 압도했다. 위력적인 공이 경기 내내 춤을 췄다.']
          : ['{X} {WHO:이가} 한 경기 5안타를 몰아쳤다. 연이어 안타를 생산하며 절정의 타격감을 뽐냈다.'];
      return post(mine ? '속보' : '화제', one(r, T, v), one(r, B, v), c('기록'));
    }
    case '부상': return mine
      ? post('속보', one(r, ['{WHO}, 경기 중 부상 교체… 정밀 검진 예정', '{X} 비상… {WHO} 부상으로 교체'], v), one(r, ['{WHO:이가} 경기 도중 부상으로 교체됐다. 구단은 검진 결과를 지켜본 뒤 복귀 시점을 정할 계획이다.'], v), c('부상'))
      : post('속보', one(r, ['{X} {WHO}, 경기 중 부상 교체'], v), one(r, ['{X} {WHO:이가} 경기 도중 부상으로 교체됐다. 정확한 상태는 검진 뒤 나올 전망이다.'], v), c('부상'));
    case '취소': {
      const w: Vars = { ...v, RAIN: /장마/.test(n.text) ? '장맛비' : '비' };
      return post('속보', one(r, ['그라운드 적신 {RAIN}… {N}경기 우천 취소', '{RAIN}에 멈춘 한별 리그, {N}경기 취소'], w), one(r, ['{RAIN:으로} 이날 {N}경기가 취소됐다. 취소된 경기는 시즌 막바지에 다시 편성된다.'], w), c('취소'));
    }
    case '순위': {
      if (mine) return null;
      const co = /공동/.test(n.text);
      return post('속보', one(r, co ? ['{X}, 공동 선두 합류… 1위 싸움 요동'] : ['{X}, 선두 등극… 1위 싸움 요동', '선두 바뀌었다… {X} 1위 등극'], v),
        one(r, co ? ['{X:이가} 공동 1위로 올라섰다. 선두 경쟁이 한층 뜨거워졌다.'] : ['{X:이가} 1위 자리에 올랐다. 선두 경쟁이 한층 뜨거워졌다.'], v), c('순위'));
    }
    case '연승': return mine ? null : post('화제', one(r, ['{X}, 파죽의 {N}연승', '"멈출 줄 모른다" {X} {N}연승 질주', '{X} {N}연승… 상대 팀들 경계령'], v),
      one(r, ['{X:이가} {N}연승을 달렸다. 투타가 맞물리며 리그에서 가장 뜨거운 팀으로 떠올랐다.', '{X:이가} 최근 {N}경기를 모두 쓸어 담았다. 상대 팀들의 경계 대상 1순위가 됐다.'], v), c('연승'));
    case '연패': return mine ? null : post('충격', one(r, ['{X}, {N}연패 수렁', '"출구가 안 보인다" {X} {N}연패', '{X} {N}연패… 반등 실마리 못 찾았다'], v),
      one(r, ['{X:이가} {N}연패에 빠졌다. 더그아웃 분위기도 무겁게 가라앉았다.', '{X:이가} {N}경기째 승리를 신고하지 못했다. 좀처럼 풀리지 않는 흐름이 이어지고 있다.'], v), c('연패'));
    default: return null;
  }
}
/** 그날 다른 경기 정리 */
function roundupPost(f: DayFacts, r: R): RawPost | null {
  const games = f.results.filter((g) => !g.c && g.a !== f.me && g.h !== f.me);
  if (games.length < 2) return null;
  const pick = games.slice().sort((a, b) => Math.abs(b.s[0] - b.s[1]) - Math.abs(a.s[0] - a.s[1])).slice(0, 3);
  const lines = pick.map((g) => `${short(g.a)} ${g.s[0]}:${g.s[1]} ${short(g.h)}`).join(', ');
  const big = pick[0];
  const winner = big.s[0] > big.s[1] ? big.a : big.s[1] > big.s[0] ? big.h : undefined;
  const v: Vars = { L: lines, X: short(winner ?? big.a) };
  return post('분석', one(r, ['한눈에 보는 한별 리그… 다른 구장 결과', '다른 구장 소식… {X} 화력 돋보였다', '숨 가쁜 순위 싸움… 이날의 한별 리그'], v),
    one(r, ['{L}. 이날 가장 눈에 띈 팀은 {X:이었다}.', '{L}. 순위 싸움이 갈수록 흥미진진해지고 있다.'], v),
    cmts(r, [['다른 구장 결과까지 한 번에 보니 편하네요.', '{X} 요즘 기세가 확실히 좋아 보입니다.', '순위 싸움이 갈수록 흥미진진해지네요.', '맞대결 결과에 따라 순위가 또 바뀌겠습니다.', '이런 종합 기사가 자주 올라왔으면 좋겠습니다.']], v, 2));
}
/** 팀 기록 분석 (마지막 날) */
function analysisPost(f: DayFacts, r: R): RawPost | null {
  const t = f.team;
  if (!t || f.played < 10) return null;
  const v: Vars = { T: short(f.me), AVG: t.avg.toFixed(3).replace(/^0/, ''), AR: t.avgRank, ERA: t.era.toFixed(2), ER: t.eraRank };
  const good = (k: number) => k <= 4;
  const verdict = good(t.avgRank) && good(t.eraRank) ? '투타 모두 상위권이라 순위 경쟁에서 충분히 해 볼 만하다는 평가다.'
    : good(t.avgRank) ? '타선은 제 몫을 하고 있지만 마운드 안정이 과제로 꼽힌다.'
      : good(t.eraRank) ? '마운드는 버티고 있지만 타선의 득점 지원이 아쉽다는 분석이다.'
        : '투타 모두 중위권 아래에 머물러 반등의 해법이 시급하다.';
  return post('분석', one(r, ['숫자로 본 {T}… 팀 타율 {AVG} 리그 {AR}위', '{T} 마운드 평균자책 {ERA}, 현주소는', '{T} 팀 기록 분석… 강점과 약점은'], v),
    `${fill('{T}의 팀 타율은 {AVG:으로} 리그 {AR}위, 팀 평균자책은 {ERA:으로} {ER}위다. ', v) ?? ''}${verdict}`,
    cmts(r, [['기록을 보니 팀 상황이 한눈에 들어오네요.', '결국 마운드가 버텨 줘야 순위가 올라간다고 봅니다.', '타선 기록은 생각보다 괜찮네요. 득점권이 문제였나요?', '숫자는 거짓말을 하지 않습니다. 보완이 필요하네요.', '이런 분석 기사가 더 많았으면 좋겠습니다.']], v, 2));
}
/** 이슈 (지어낸 숫자 없이 — 전하는 말로) */
function issuePost(f: DayFacts, r: R): RawPost | null {
  const rows = f.rows;
  const low = rows?.[rows.length - 1];
  const other = rows ? pickOf(r, rows.filter((x) => x.teamId !== f.me)).teamId : undefined;
  const v: Vars = { T: short(f.me), X: short(other), Z: short(low?.teamId) };
  const pool: [string, string][] = [
    ['{T}, 불펜 보강 위해 트레이드 시장 노크', '{T:이가} 불펜 보강을 위해 트레이드 카드를 맞춰 보고 있다는 관측이 나온다. 구단은 공식 입장을 내놓지 않았다.'],
    ['{X}, 외국인 선수 교체 검토설 솔솔', '{X:이가} 부진이 길어진 외국인 선수의 교체를 검토하고 있다는 이야기가 나온다. 구단은 신중한 입장이다.'],
    ['{T}, 2군 유망주 깜짝 콜업 임박설', '2군에서 맹활약 중인 유망주가 곧 1군에 합류할 수 있다는 전망이 나온다. {T} 코칭스태프도 관심 있게 지켜보는 것으로 알려졌다.'],
    ['{X} 라커룸 분위기 심상치 않다', '최근 {X} 선수단이 경기 뒤 긴 미팅을 가졌다는 이야기가 전해졌다. 반전을 위한 분위기 쇄신으로 풀이된다.'],
  ];
  if (low && low.teamId !== f.me && low.streak.endsWith('패')) pool.push(['{Z} 사령탑 거취 놓고 설왕설래', '연패가 길어지자 {Z} 구단 안팎에서 사령탑 거취를 둘러싼 말이 나오고 있다. 구단은 아직 말을 아끼고 있다.']);
  const [t, b] = pickOf(r, pool);
  return post('이슈', fill(t, v), fill(b, v), cmts(r, [['공식 발표 전까지는 지켜보는 게 맞다고 봅니다.', '사실이라면 시즌 판도에 꽤 영향이 있겠네요.', '확인되지 않은 이야기는 조심스럽게 다뤘으면 합니다.', '구단이 빨리 입장을 정리해 줬으면 좋겠습니다.', '이번에는 소문으로만 끝나지 않을 것 같네요.']], v, 2));
}

/** 그날 템플릿 기사 n개 — skip: 그날 특이사항으로 따로 다룬 것(겹치지 않게) */
export function localDay(f: DayFacts, n: number, skip: Set<EvKind>): RawPost[] {
  const r = rng(`day:${f.seed}:${f.idx}`);
  const out: RawPost[] = [];
  const push = (p: RawPost | null) => { if (p && out.length < n && !out.some((x) => x.title === p.title)) out.push(p); };
  const myCovered = ['walkoffW', 'walkoffL', 'marathon', 'comeback'].some((k) => skip.has(k as EvKind));
  if (!myCovered) push(myGamePost(f, r));
  // 연승 · 연패 (마지막 날만 지금 기록을 안다)
  const v: Vars = { T: short(f.me), N: Math.abs(f.streak), R: f.rank || undefined, PR: f.prevRank || undefined, LINE: POST_SEEDS };
  if (f.latest && Math.abs(f.streak) >= 3 && !skip.has('streakW') && !skip.has('streakL')) {
    push(f.streak > 0
      ? post('화제', one(r, STREAK_W_T, v), one(r, STREAK_W_B, v), cmts(r, [STREAK_W_C], v, nOf(r)))
      : post('충격', one(r, STREAK_L_T, v), one(r, STREAK_L_B, v), cmts(r, [STREAK_L_C], v, nOf(r))));
  }
  // 순위 변화 (가을야구 선을 넘나들면 그 이야기로)
  if (f.rank && f.prevRank && f.rank !== f.prevRank && f.played >= 5 && !skip.has('first') && !skip.has('dropout')) {
    const crossIn = f.rank <= POST_SEEDS && f.prevRank > POST_SEEDS, crossOut = f.rank > POST_SEEDS && f.prevRank <= POST_SEEDS;
    if (crossIn) push(post('분석', one(r, LINE_IN_T, v), one(r, LINE_IN_B, v), cmts(r, [RANK_C], v, 2)));
    else if (crossOut) push(post('충격', one(r, LINE_OUT_T, v), one(r, LINE_OUT_B, v), cmts(r, [RANK_C], v, 2)));
    else if (Math.abs(f.rank - f.prevRank) >= 2 || f.rank <= 2) push(f.rank < f.prevRank ? post('속보', one(r, RANK_UP_T, v), one(r, RANK_UP_B, v), cmts(r, [RANK_C], v, 2)) : post('충격', one(r, RANK_DN_T, v), one(r, RANK_DN_B, v), cmts(r, [RANK_C], v, 2)));
  }
  // 리그 소식 (특이사항으로 다룬 노히트 · 기록은 빼고) — 큰 것부터
  // 내 구단 소식 먼저, 다른 구단은 노히트 · 연승 · 연패 · 끝내기 · 역전 · 기록 · 순위 · 부상 · 취소 순 — 같은 종류는 하루 한 기사
  const ORDER: NewsRec['kind'][] = ['노히트', '연승', '연패', '끝내기', '역전', '기록', '순위', '부상', '취소'];
  const rank = (x: NewsRec) => (x.team === f.me ? -10 : 0) + ORDER.indexOf(x.kind);
  const news = f.news.filter((x) => !(x.kind === '노히트' && skip.has('nohit')) && !(x.kind === '기록' && (skip.has('record') || skip.has('myRecord'))) && !(x.kind === '부상' && skip.has('injury')) && !(x.mine && (x.kind === '끝내기' || x.kind === '역전')))
    .sort((a, b) => rank(a) - rank(b));
  const seenKind = new Set<string>();
  for (const x of news) {
    const kindKey = `${x.team === f.me ? 'me' : 'other'}:${x.kind}`;
    if (seenKind.has(kindKey)) continue;
    const p = newsPost(x, f, r);
    if (p) seenKind.add(kindKey);
    push(p);
  }
  // 채우기 — 리그 종합 · 분석 · 이슈
  const fillers = [() => roundupPost(f, r), () => (f.latest ? analysisPost(f, r) : null), () => (f.latest && r() < 0.6 ? issuePost(f, r) : null)];
  for (const fn of fillers.sort(() => r() - 0.5)) push(fn());
  return out;
}

/* ═════════════ 특이사항 (AI 를 못 쓰거나 고르지 않은 사건) — 사건 기사 + 뒷이야기 · 분석 기사 ═════════════ */
// {T} 내 구단 · {X} 사건 구단 · {O} 상대 · {Y} 노히트 당한 구단 · {WHO} 선수 · {N} 숫자(연승 수 · 이닝 · 점수 차 · 순위)
// {S} 점수(내 쪽 먼저) · {RT} 기록 한 줄 · {RES} 승리/패배/무승부 · {SER} 가을야구 시리즈 · {W2}/{L2} 시리즈 승패 · {DATE} 날짜 · {LINE} 가을야구 순위
type EvT = { t: readonly string[]; b: readonly string[]; c: readonly string[] };
const EVT: Record<EvKind | 'nohitMe' | 'nohitUs' | 'comebackL', [EvT, EvT, PressTag]> = {
  nohit: [
    { t: ['{X} 마운드, 노히트노런 대기록', '"안타 하나도 없었다" {X}, 노히트노런 달성'],
      b: ['{X} 투수진이 {Y} 타선을 상대로 노히트노런을 합작했다. 9이닝 동안 안타를 단 하나도 내주지 않았다.', '{X} 마운드가 노히트노런을 달성했다. 상대 타선은 경기 내내 안타를 하나도 때려내지 못했다.'],
      c: ['리그 역사에 남을 경기네요. 정말 축하합니다.', '상대 타선이 끝까지 해법을 찾지 못했네요.', '마지막 아웃까지 집중력을 지킨 게 대단합니다.'] },
    { t: ['노히트노런 마지막 순간… 숨죽인 그라운드', '대기록의 순간, {X} 더그아웃은 환호로 가득'],
      b: ['마지막 아웃카운트가 올라가자 {X} 더그아웃의 선수들이 일제히 뛰쳐나왔다. 관중석도 기립 박수로 대기록을 축하했다.'],
      c: ['이런 장면은 평생 한 번 볼까 말까 한 것 같습니다.', '마지막 이닝은 보는 내내 손에 땀을 쥐었네요.', '현장에서 본 팬들은 정말 잊지 못하겠네요.'] }, '화제'],
  nohitMe: [
    { t: ['{T} 마운드, 노히트노런 대기록 작성', '"9이닝 무안타" {T}, 노히트노런 달성'],
      b: ['{T} 마운드가 {Y} 타선을 상대로 노히트노런을 달성했다. 9이닝 동안 단 하나의 안타도 허용하지 않았다.', '{T} 마운드가 노히트노런 대기록을 썼다. 상대 타선은 9이닝 내내 안타를 하나도 치지 못했다.'],
      c: ['우리 팀에서 노히트노런이 나오다니 감격스럽네요.', '투수와 포수의 호흡이 완벽했던 경기였습니다.', '야수들 수비도 대기록에 큰 힘이 됐다고 봅니다.'] },
    { t: ['대기록 뒤엔 완벽한 호흡… {T} 배터리 집중 조명', '노히트노런 순간, 관중석은 기립 박수'],
      b: ['9회 마지막 타자를 잡아내는 순간 관중석에서 기립 박수가 쏟아졌다. 수비진도 몸을 아끼지 않으며 대기록을 함께 완성했다.'],
      c: ['오늘 경기는 하이라이트로 몇 번이고 다시 볼 것 같습니다.', '선수들 모두 정말 고생 많았습니다. 축하합니다.', '이런 날이 오다니 팬으로서 정말 뿌듯합니다.'] }, '화제'],
  nohitUs: [
    { t: ['{T} 타선, 노히트노런 굴욕', '"안타 0개" {T}, 노히트노런 희생양'],
      b: ['{T} 타선이 {X} 마운드에 노히트노런을 당했다. 9이닝 동안 안타를 하나도 때려내지 못했다.'],
      c: ['안타 하나 없이 경기를 마친 건 정말 아쉽습니다.', '상대 투수가 잘 던졌지만 타선도 반성해야 합니다.', '오늘 경기는 빨리 잊고 다음 경기에 집중했으면 합니다.'] },
    { t: ['노히트 굴욕 {T}, 타선 재정비 시급', '무안타 패배 {T}, 반등 해법은'],
      b: ['{T:이가} 상대 대기록의 희생양이 됐다. 타격 코치진의 고민도 깊어질 전망이다.'],
      c: ['이런 날일수록 다음 경기에서 몰아쳤으면 좋겠습니다.', '상대 투수가 워낙 잘 던진 날이라고 생각하겠습니다.', '타순 조정 같은 변화가 필요해 보입니다.'] }, '분석'],
  first: [
    { t: ['{T}, 마침내 선두 등극', '"맨 꼭대기" {T}, 1위 올라섰다'],
      b: ['{T:이가} 순위표 맨 위에 올라섰다. {DATE} 기준 1위다.', '{T:이가} 선두 자리를 꿰찼다. {DATE} 기준 순위표 맨 위에 이름을 올렸다.'],
      c: ['이 순간을 정말 오래 기다렸습니다. 축하합니다.', '올라가는 것보다 지키는 게 더 어렵다고 봅니다.', '1위 팀다운 경기력을 끝까지 보여 주길 바랍니다.'] },
    { t: ['선두 {T}, 1위 질주의 비결은', '1위 수성 나선 {T}, 남은 과제는'],
      b: ['타선과 마운드가 고르게 힘을 보태며 선두까지 올라섰다. 이제는 추격자들의 견제를 이겨 내는 일이 과제다.'],
      c: ['투타 균형이 좋아진 게 가장 큰 원동력 같습니다.', '시즌은 아직 깁니다. 부상 관리가 관건이겠네요.', '분석 잘 봤습니다. 불펜만 버텨 주면 되겠네요.'] }, '분석'],
  streakW: [
    { t: ['{T}, 파죽의 {N}연승 질주', '"질 줄 모른다" {T}, {N}연승 신바람'],
      b: ['{T:이가} {N}경기 연속 승리를 거뒀다. 최근 흐름만 보면 리그에서 가장 뜨거운 팀이다.'],
      c: ['연승 중일수록 들뜨지 말고 차분하게 갔으면 합니다.', '요즘 {T} 경기는 볼 때마다 기대가 됩니다.', '투타 밸런스가 정말 좋아진 게 느껴지네요.'] },
    { t: ['{N}연승 {T}, 상승세 비결은', '숫자로 본 {T}의 {N}연승'],
      b: ['선발진이 긴 이닝을 책임지고 타선이 꾸준히 점수를 뽑아내고 있다. 기본에 충실한 야구가 연승을 이끌었다는 평가다.'],
      c: ['기본에 충실한 야구가 결국 이긴다고 생각합니다.', '연승 중에도 불펜 과부하는 꼭 살펴야 합니다.', '분석 잘 읽었습니다. 선발진 안정이 크네요.'] }, '분석'],
  streakL: [
    { t: ['{T}, {N}연패 수렁… 출구가 안 보인다', '"충격의 {N}연패" {T}, 반등 실마리 못 찾았다'],
      b: ['{T:이가} {N}경기째 승리를 거두지 못했다. 변화가 필요하다는 목소리가 커지고 있다.'],
      c: ['연패가 길어지니 선수들 표정도 어두워 보이네요.', '분위기 반전을 위한 과감한 변화가 필요해 보입니다.', '선수들도 답답하겠지만 끝까지 응원하겠습니다.'] },
    { t: ['연패 길어진 {T}, 코칭스태프 개편 가능성', '{N}연패 {T}, 분위기 쇄신 카드 꺼내나'],
      b: ['연패가 길어지자 구단 안팎에서 분위기 쇄신이 필요하다는 이야기가 나온다. 구단은 아직 공식 입장을 내놓지 않았다.'],
      c: ['공식 발표가 나오기 전까지는 지켜보겠습니다.', '변화가 필요하다면 빠를수록 좋다고 봅니다.', '감독님과 선수들 모두 힘내셨으면 좋겠습니다.'] }, '이슈'],
  record: [
    { t: ['{WHO}, {RT} 대기록', '"이런 날도 있다" {WHO}, 대기록 쇼'],
      b: ['{X} {WHO:이가} {RT:을를} 기록했다. 리그 역사에 남을 만한 하루를 보냈다.'],
      c: ['이런 기록은 쉽게 나오지 않죠. 정말 대단합니다.', '오늘 경기의 주인공은 누가 봐도 {WHO} 선수네요.', '상대 팀은 오늘 정말 속수무책이었겠습니다.'] },
    { t: ['{WHO} 대기록, 얼마나 대단한가', '기록으로 본 {WHO}의 하루'],
      b: ['한 시즌에 한 번 나올까 말까 한 기록이다. 상대 팀에는 악몽 같은 하루가 됐다.'],
      c: ['숫자로 보니 얼마나 대단한지 실감이 나네요.', '이 페이스를 시즌 내내 유지할 수 있을지 궁금합니다.', '하이라이트로 다시 봐도 대단한 경기였습니다.'] }, '분석'],
  dropout: [
    { t: ['{T}, 가을야구권 밖으로 밀려났다', '"막판 비상" {T}, 가을야구 마지노선 밖으로'],
      b: ['{T:이가} {N}위로 밀리며 가을야구 진출 마지노선({LINE}위) 밖으로 벗어났다. 남은 경기 하나하나가 결승전이 됐다.'],
      c: ['아직 끝난 건 아닙니다. 남은 경기에 집중했으면 합니다.', '중요한 시기에 흔들리는 게 가장 걱정입니다.', '선수들 체력 관리가 막판 승부를 가를 것 같네요.'] },
    { t: ['{T}, 가을야구 막차 탈 수 있을까', '경우의 수 따져 본 {T}의 가을야구'],
      b: ['위 팀들이 주춤한다면 기회는 남아 있다. 다만 {T} 스스로 승리를 쌓는 것이 먼저다.'],
      c: ['경우의 수를 따지기보다 일단 이기는 게 먼저겠죠.', '남은 일정이 어떤지 꼼꼼히 봐야겠네요.', '막판 뒷심을 보여 주길 기대하겠습니다.'] }, '분석'],
  walkoffW: [
    { t: ['{T}, 극적인 끝내기… {O}에 {S} 승리', '"극장 승부" {T}, {N}회말 끝내기 승'],
      b: ['{T:이가} {N}회말 끝내기로 {O:을를} {S:으로} 꺾었다. 마지막 이닝에 승부를 결정지으며 홈 팬들을 열광시켰다.'],
      c: ['마지막까지 포기하지 않은 선수들 정말 대단합니다.', '끝내기 순간 저도 모르게 소리를 질렀네요.', '이런 경기를 잡으면 팀 분위기가 확 살아납니다.'] },
    { t: ['끝내기 순간, 그라운드는 축제였다', '{T} 끝내기 승, 더그아웃 뒷이야기'],
      b: ['끝내기가 터지자 더그아웃의 선수들이 일제히 그라운드로 뛰쳐나왔다. 관중석도 한동안 자리를 뜨지 못했다.'],
      c: ['현장에 있던 팬들은 정말 잊지 못할 하루겠네요.', '심장이 아직도 두근거립니다. 최고의 경기였어요.', '끝까지 본 보람이 있었습니다. 선수들 고생 많았어요.'] }, '화제'],
  walkoffL: [
    { t: ['{T}, {N}회말 끝내기 허용… {O}에 {S} 패', '마지막 고비 못 넘었다… {T}, 끝내기 패배'],
      b: ['{T:이가} {N}회말 끝내기를 내주며 {O}에 {S:으로} 졌다. 마지막 이닝을 버티지 못하고 승리를 내줬다.'],
      c: ['마지막 이닝 투수 운용은 아쉬움이 남습니다.', '오늘 같은 패배가 제일 아프네요. 그래도 힘내세요.', '끝까지 잘 싸웠는데 결과가 너무 아쉽습니다.'] },
    { t: ['끝내기 패 {T}, 마지막 이닝 운용 아쉬움', '복기해 본 {T}의 끝내기 패배'],
      b: ['승부처에서 투수 교체 타이밍이 한 박자 늦었다는 지적이 나온다. 결과론이지만 아쉬움이 남는 장면이었다.'],
      c: ['결과론이긴 하지만 교체가 조금 빨랐으면 어땠을까요?', '이번 패배를 보약 삼아 다음 경기에서 갚아 줬으면 합니다.', '마무리 투수 컨디션 관리가 필요해 보입니다.'] }, '분석'],
  comeback: [
    { t: ['"포기는 없었다" {T}, {N}점 차 뒤집었다', '{T}, {N}점 차 역전 드라마… {S} 승리'],
      b: ['{T:이가} {O}에 {N}점 차로 끌려가다 경기를 뒤집고 {S:으로} 이겼다. 끈질긴 추격 끝에 짜릿한 역전승을 완성했다.'],
      c: ['중간에 채널 돌렸던 게 후회되네요. 대단합니다.', '끝까지 포기하지 않는 모습이 정말 보기 좋습니다.', '이런 역전승이 팀을 더 강하게 만든다고 봅니다.'] },
    { t: ['{N}점 차 역전승, 승부를 가른 장면은', '다시 보는 {T}의 역전 드라마'],
      b: ['마운드가 더 이상 흔들리지 않고 버틴 것이 반격의 발판이 됐다. 타선은 기회가 오자 집중력 있게 몰아쳤다.'],
      c: ['불펜이 버텨 준 덕분에 역전이 가능했다고 봅니다.', '승부처마다 집중력이 돋보인 경기였습니다.', '이런 경기를 자주 보고 싶네요. 선수들 최고입니다.'] }, '분석'],
  comebackL: [
    { t: ['{T}, {N}점 차 리드 못 지켰다… 충격의 역전패', '"다 잡은 경기였는데" {T}, {S} 역전패'],
      b: ['{T:이가} {O}에 {N}점 차 리드를 지키지 못하고 {S:으로} 역전패했다. 리드를 내준 뒤 끝내 흐름을 되찾지 못했다.'],
      c: ['불펜이 버티지 못한 게 결국 패인이네요.', '{N}점 차 리드를 지키지 못한 건 정말 아쉽습니다.', '빨리 잊고 다음 경기 준비에 집중했으면 합니다.'] },
    { t: ['{N}점 차 역전패 {T}, 무엇이 문제였나', '리드 지키지 못한 {T}, 뒷문 과제 남겼다'],
      b: ['리드를 잡은 뒤 추가점을 뽑지 못한 것이 화근이 됐다. 불펜만의 책임으로 보기는 어렵다는 분석이다.'],
      c: ['추가점을 못 낸 타선도 함께 반성해야 한다고 봅니다.', '분석에 공감합니다. 경기 운영 전반을 돌아봐야겠네요.', '다음 경기에서는 다른 모습을 보여 주길 바랍니다.'] }, '분석'],
  injury: [
    { t: ['{WHO}, 경기 중 부상 교체… 정밀 검진 예정', '{T} 비상… {WHO} 부상으로 이탈'],
      b: ['{WHO:이가} 경기 도중 부상으로 교체됐다. 구단은 정밀 검사 결과를 기다리고 있다.'],
      c: ['큰 부상이 아니길 바랍니다. 몸이 가장 중요합니다.', '조급해하지 말고 완전히 회복한 뒤 돌아오길 바랍니다.', '당분간 빈자리를 누가 메울지가 관건이겠네요.'] },
    { t: ['{WHO} 공백, {T} 대안은', '{WHO} 이탈 {T}, 라인업 고민 깊어진다'],
      b: ['당장 빈자리를 메울 선수가 마땅치 않다는 평가다. 라인업 재편이 불가피해 보인다.'],
      c: ['이럴 때일수록 벤치 선수들이 기회를 잡아야죠.', '감독님 고민이 깊어지겠네요. 현명한 선택을 기대합니다.', '다른 선수들이 한 발씩 더 뛰어 주길 바랍니다.'] }, '분석'],
  marathon: [
    { t: ['{N}회 연장 혈투… {T}·{O} {S}', '"끝날 줄 몰랐다" {T}·{O}, {N}회 연장 승부'],
      b: ['{T:이가} {O:과와} {N}회까지 가는 혈투를 벌인 끝에 {S} {RES:을를} 기록했다. 양 팀 모두 불펜을 총동원했다.'],
      c: ['끝까지 지켜본 팬들도 선수들도 모두 고생 많았습니다.', '불펜을 이렇게 많이 썼으니 다음 경기가 걱정입니다.', '이 정도면 체력전이었네요. 선수들 푹 쉬었으면 합니다.'] },
    { t: ['연장 혈투 후폭풍… {T} 마운드 운용 비상', '{N}회 승부 뒤 남은 과제, 불펜 휴식'],
      b: ['이날 마운드에 오른 투수만 여럿이다. 다음 경기 선발 투수가 긴 이닝을 책임져야 하는 부담을 안게 됐다.'],
      c: ['다음 경기 선발이 최대한 길게 던져 줘야 할 것 같습니다.', '불펜 투수들 휴식이 꼭 필요해 보입니다.', '힘든 경기였지만 보는 재미는 확실히 있었습니다.'] }, '분석'],
  myRecord: [
    { t: ['{WHO}, {RT} 기록 쇼', '"오늘은 {WHO}의 날" 눈부신 활약'],
      b: ['{T} {WHO:이가} {RT:을를} 기록했다. 이날 경기의 주인공은 단연 {WHO:이었다}.'],
      c: ['{WHO} 선수 요즘 컨디션이 정말 좋아 보이네요.', '오늘 수훈 선수는 누가 봐도 {WHO} 선수입니다.', '이 활약이 꾸준히 이어지길 바랍니다.'] },
    { t: ['상승세 탄 {WHO}, 최근 흐름은', '{WHO}, {T}의 새 기둥으로 떠오르나'],
      b: ['최근 경기마다 꾸준히 존재감을 드러내고 있다. 이 흐름을 얼마나 길게 이어 갈지가 관심사다.'],
      c: ['감을 확실히 잡은 것 같습니다. 이대로만 가 주길.', '이 선수가 살아나니 팀 전체가 달라 보이네요.', '다음 경기에서도 좋은 활약 기대하겠습니다.'] }, '화제'],
  postWin: [
    { t: ['{T}, {SER} 통과… 가을 질주 계속', '"가을 DNA" {T}, {SER} 관문 넘었다'],
      b: ['{T:이가} {SER}에서 {O:을를} {W2}승 {L2}패로 꺾었다. 가을 무대에서 {T}의 기세가 매섭다.'],
      c: ['가을에 강한 팀이라는 걸 다시 증명했네요.', '다음 상대는 어느 팀일지 벌써 궁금합니다.', '이 기세라면 끝까지 갈 수 있다고 믿습니다.'] },
    { t: ['{T}, 다음 시리즈 관전 포인트는', '기세 오른 {T}, 다음 관문 전망'],
      b: ['분위기는 {T} 쪽이 앞선다는 평가다. 선발 로테이션을 어떻게 꾸리느냐가 승부의 열쇠로 꼽힌다.'],
      c: ['분석 잘 봤습니다. 1차전 선발이 정말 중요하겠네요.', '1차전 선발은 누가 나설지 궁금합니다.', '단기전은 분위기 싸움이라고 봅니다. 끝까지 갑시다.'] }, '분석'],
  postLose: [
    { t: ['{T}, {SER}에서 탈락… 가을 여정 마침표', '"올해는 여기까지" {T}, 가을야구 마감'],
      b: ['{T:이가} {SER}에서 {O}에 {W2}승 {L2}패로 밀려 탈락했다. {T}의 올 시즌 가을 여정은 여기서 멈췄다.'],
      c: ['한 시즌 동안 정말 수고 많으셨습니다.', '아쉽지만 내년에 더 강해져서 돌아오길 바랍니다.', '가을야구까지 간 것만으로도 충분히 즐거웠습니다.'] },
    { t: ['가을 마친 {T}, 올 시즌 결산', '{T}의 겨울 과제는'],
      b: ['시즌 내내 버틴 선수단에 박수가 쏟아졌다. 드러난 약점을 겨울 동안 얼마나 메우느냐가 관건이다.'],
      c: ['부족했던 부분은 겨울 동안 꼭 보완했으면 합니다.', '스토브리그에서 어떤 보강이 있을지 기대됩니다.', '선수들 모두 고생 많았습니다. 내년에 또 응원하겠습니다.'] }, '분석'],
  champion: [
    { t: ['{T}, 한국시리즈 정상… 올 시즌 최강', '"마침내 정상" {T}, 한국시리즈 우승'],
      b: ['{T:이가} 한국시리즈에서 {O:을를} {W2}승 {L2}패로 꺾고 우승을 차지했다. 올 시즌 마지막에 웃은 팀은 {T:이었다}.'],
      c: ['우승 정말 축하합니다. 오늘은 마음껏 즐기겠습니다.', '한 시즌 내내 응원한 보람이 있네요. 감동입니다.', '선수단과 코칭스태프 모두 정말 고생 많았습니다.'] },
    { t: ['우승 {T}, 정상까지 걸어온 길', '왕좌 오른 {T}, 우승 원동력은'],
      b: ['긴 시즌을 버틴 선수단의 집념이 우승으로 결실을 맺었다. 투타의 균형이 끝까지 흔들리지 않았다는 평가다.'],
      c: ['이 순간을 평생 기억할 것 같습니다.', '내년에도 이 자리에서 다시 만났으면 좋겠습니다.', '우승까지 모든 순간이 감동이었습니다. 고맙습니다.'] }, '화제'],
};
/** 특이사항 템플릿 — 사건 기사 1 + 뒷이야기 · 분석 기사 1 */
export function localEvent(e: EvRec, f: DayFacts): RawPost[] {
  const r = rng(`ev:${f.seed}:${e.id}`);
  const me = ME.teamId;
  const key = e.kind === 'nohit' ? (e.team === me ? 'nohitMe' : e.mine ? 'nohitUs' : 'nohit') : e.kind === 'comeback' && e.team !== me ? 'comebackL' : e.kind;
  const [a, b, tagB] = EVT[key];
  const series = /(와일드카드 결정전|준플레이오프|플레이오프|한국시리즈)/.exec(e.text)?.[1];
  const rec = e.kind === 'record' || e.kind === 'myRecord'
    ? /홈런/.test(e.text) ? `한 경기 홈런 ${e.n}개` : /탈삼진/.test(e.text) ? `탈삼진 ${e.n}개` : /5안타/.test(e.text) ? '한 경기 5안타' : undefined
    : undefined;
  const v: Vars = {
    T: short(me), X: short(e.team), O: short(e.opp), WHO: e.who, N: e.n, S: e.s ? `${e.s[0]}:${e.s[1]}` : undefined,
    Y: /— (.+?) 타선/.exec(e.text)?.[1], RT: rec, RES: e.s ? (e.s[0] > e.s[1] ? '승리' : e.s[0] < e.s[1] ? '패배' : '무승부') : undefined,
    SER: series, W2: e.s?.[0], L2: e.s?.[1], DATE: e.date ? dayKo(e.date) : undefined, LINE: POST_SEEDS,
  };
  const head = post(evTag(e), one(r, a.t, v), one(r, a.b, v), cmts(r, [a.c], { ...v }, 3));
  const react = post(tagB, one(r, b.t, v), one(r, b.b, v), cmts(r, [b.c], v, 2 + Math.floor(r() * 2)));
  return [head, react].filter((p): p is RawPost => !!p);
}

/* ═════════════ 개막 특집 ═════════════ */
export function localOpen(f: OpenFacts, seed: string): RawPost[] {
  const r = rng(`open:${seed}:${f.year}:${f.me}`);
  const T = short(f.me);
  const [p1, p2] = f.power;
  const sp = f.players.find((x) => x.key === 'sp');
  const star = f.players.filter((x) => x.tags.includes('star')).sort((a, b) => b.ovr - a.ovr)[0];
  const worry = f.players.find((x) => x.inj) ?? f.players.find((x) => x.tags.includes('tired')) ?? f.players.find((x) => x.tags.includes('low'));
  const v: Vars = {
    T, LV: f.lv, PR: f.predRank, P1: short(p1?.[0]), P2: short(p2?.[0]),
    O: short(f.first?.opp), HA: f.first ? (f.first.home ? '홈' : '원정') : undefined, DATE: f.first ? longDate(f.first.day.date).replace(' (', '(') : undefined,
    SP: sp?.p.name, STAR: star?.p.name, OVR: star?.ovr, WORRY: worry?.p.name, INJ: worry?.inj, FAT: worry?.fat, RIV: f.rival?.name,
  };
  const out: (RawPost | null)[] = [];
  const pr = f.predRank;
  out.push(post('분석', one(r, ['개막 앞둔 한별 리그, 판도 전망은', '한별 리그 전력 분석… 우승 후보는 누구'], v),
    one(r, pr === 1
      ? ['전력만 놓고 보면 {T:이가} 우승 후보 1순위로 꼽힌다. 올해 리그 단계는 {LV:으로}, 만만치 않은 시즌이 예상된다.']
      : ['전력상 {P1}·{P2:이가} 2강으로 꼽힌다. {T:은는} {PR}위권 전력으로 평가받는다. 올해 리그 단계는 {LV:이다}.'], v),
    cmts(r, [['예상은 예상일 뿐입니다. 뚜껑은 열어 봐야 알죠.', '{P1} 전력이 확실히 탄탄해 보이긴 하네요.', '올해는 {T}도 충분히 해 볼 만하다고 봅니다.', '시즌 끝나고 이 기사를 다시 보면 재밌겠네요.', '{PR}위권 평가가 맞는지는 시즌이 말해 주겠죠.']], v, 3)));
  out.push(post(r() < 0.5 ? '속보' : '단독', one(r, ['{T} 개막전 선발, {SP} 유력', '{O}전 개막 선발은 {SP}… 사실상 확정'], v),
    one(r, ['{T:은는} {DATE} {O:과와}의 {HA} 경기로 시즌을 시작한다. 개막전 선발로는 {SP:이가} 나설 전망이다.', '{T}의 개막전은 {DATE} {O}전({HA})이다. 코칭스태프는 첫 경기 선발로 {SP:을를} 사실상 낙점한 것으로 알려졌다.'], v),
    cmts(r, [['{SP} 선수라면 믿고 맡겨도 된다고 봅니다.', '첫 단추를 잘 끼워야 시즌이 편합니다.', '개막전 직관 예매해 뒀습니다. 기대됩니다.', '{O} 상대로 첫 경기를 잡으면 분위기 좋겠네요.']], v, 2)));
  out.push(post('화제', one(r, ['"올해는 {STAR}" {T}, 간판 기대감 최고조', '{STAR}, {T} 새 시즌 키플레이어로 주목'], v),
    one(r, ['종합 {OVR}의 {STAR:이가} {T} 라인업의 중심에 선다. 그가 제 몫을 해 준다면 상위권 도약도 충분하다는 평가다.'], v),
    cmts(r, [['{STAR} 선수 올 시즌 정말 기대가 큽니다.', '기대가 큰 만큼 부담은 덜 느꼈으면 좋겠네요.', '올해는 {STAR} 선수가 리그를 지배했으면 합니다.', '중심 선수가 잘해야 팀이 삽니다. 응원합니다.']], v, 3)));
  if (worry?.inj) out.push(post('속보', one(r, ['개막 앞둔 {T}에 악재… {WORRY} 부상'], v),
    one(r, ['{WORRY}의 몸 상태에 빨간불이 켜졌다. 진단 결과는 {INJ:으로}, 개막 엔트리 합류 여부가 관심사다.'], v),
    cmts(r, [['시즌은 기니까 무리하지 않았으면 좋겠습니다.', '빈자리를 메울 대안이 있는지 궁금하네요.', '빨리 회복해서 건강하게 돌아오길 바랍니다.']], v, 2)));
  else if (worry) out.push(post('분석', one(r, ['{WORRY} 피로 누적… {T} 관리 숙제'], v),
    one(r, ['{WORRY}의 피로도가 {FAT}까지 쌓였다. 시즌 초반부터 무리하면 여름에 탈이 날 수 있다는 우려가 나온다.'], v),
    cmts(r, [['초반에는 조금 아껴 쓰는 게 맞다고 봅니다.', '시즌은 깁니다. 관리가 최우선이겠네요.', '피로가 쌓인 상태라니 걱정이 큽니다.']], v, 2)));
  else out.push(post('이슈', one(r, ['{T}, 개막 직전 깜짝 영입 나서나', '{T} 스카우트 바쁜 행보… 전력 보강 신호탄'], v),
    one(r, ['{T} 스카우트진이 개막을 앞두고 바쁘게 움직이고 있다는 관측이 나온다. 구단은 말을 아끼고 있다.'], v),
    cmts(r, [['공식 발표 전까지는 차분히 지켜보겠습니다.', '보강이 된다면 정말 반가운 소식이겠네요.', '구체적인 이야기가 빨리 나왔으면 좋겠습니다.']], v, 2)));
  if (f.rival && f.first && f.first.opp === f.rival.id) out.push(post('분석', one(r, ['개막전부터 {RIV}… 첫판부터 불꽃', '"첫판부터 라이벌" {T}, 개막전서 {O} 만난다'], v),
    one(r, ['{T:이가} 개막전에서 라이벌 {O:을를} 만난다. 첫 경기부터 시즌 분위기를 가를 자존심 싸움이 펼쳐진다.'], v),
    cmts(r, [['라이벌전은 순위와 상관없이 꼭 이겼으면 합니다.', '개막전부터 라이벌을 만나다니 긴장되네요.', '첫 경기부터 이렇게 큰 경기라니 기대됩니다.']], v, 3)));
  else if (f.lv === '연습생' || f.lv === '2군') out.push(post('분석', one(r, ['{LV} 단계서 출발… {T}, 목표는 승격', '"한 단계씩" {T}, {LV} 무대서 새 출발'], v),
    one(r, ['{T:은는} 올해 리그 단계 {LV}에서 시즌을 시작한다. 좋은 성적을 내면 다음 시즌 한 단계 높은 무대에 설 수 있다.'], v),
    cmts(r, [['차근차근 한 단계씩 올라가는 게 맞다고 봅니다.', '이번 시즌에 승격까지 노려 봤으면 좋겠네요.', '시즌 첫 달 성적이 정말 중요하겠네요.', '기본기부터 탄탄하게 다지는 시즌이 됐으면 합니다.']], v, 2)));
  else out.push(post('충격', one(r, ['리그 단계 {LV}… 만만한 상대가 없다', '"올해는 다르다" 한층 강해진 상대 팀들'], v),
    one(r, ['올해 리그 단계는 {LV:이다}. 상대 팀들의 전력이 만만치 않아 쉽지 않은 시즌이 예상된다.'], v),
    cmts(r, [['상대가 강할수록 더 재밌는 시즌이 될 것 같습니다.', '시즌 첫 달 성적이 정말 중요하겠네요.', '강팀들 사이에서도 충분히 해 볼 만하다고 봅니다.', '위축되지 말고 우리 야구를 했으면 좋겠습니다.']], v, 2)));
  return out.filter((p): p is RawPost => !!p);
}

/* ═════════════ 시즌 결산 ═════════════ */
export function localClose(f: CloseFacts, seed: string): RawPost[] {
  const r = rng(`close:${seed}:${f.year}:${f.me}`);
  const rows = f.rows;
  const top = rows[0], last = rows[rows.length - 1];
  const ld = f.leaders.slice(0, 3).map((l) => `${l.label} 1위 ${pName(l.id) ?? '선수'}(${short(l.team)}·${l.value})`);
  const seeds = rows.slice(0, POST_SEEDS).map((x) => short(x.teamId));
  const v: Vars = {
    T: short(f.me), R: f.rank, REC: recKo(f.row.w, f.row.d, f.row.l),
    X1: short(top?.teamId), W1: top?.w, L1: top?.l, X2: short(rows[1]?.teamId), X3: short(rows[2]?.teamId), X10: short(last?.teamId),
    LD: ld.join(', ') || undefined, N1: pName(f.leaders[0]?.id), N2: pName(f.leaders[1]?.id),
    SER: f.post.stage ? seriesKo(f.post.stage) : undefined,
    S1: seeds[0], S2: seeds[1], S3: seeds[2], S4: seeds[3], S5: seeds[4],
  };
  const out: (RawPost | null)[] = [];
  out.push(post('속보', one(r, ['{X1}, 정규 시즌 1위 확정… 한국시리즈 직행', '정규 시즌 막 내렸다… {X1} 1위로 마침표'], v),
    one(r, ['{X1:이가} {W1}승 {L1}패로 정규 시즌 1위를 차지했다. 2위와 3위는 각각 {X2:과와} {X3:이가} 차지했고, 최하위는 {X10:이다}.'], v),
    cmts(r, [['{X1} 올 시즌은 정말 꾸준하게 강했네요.', '긴 시즌 동안 모든 팀 선수들 고생 많았습니다.', '내년 순위표는 또 어떻게 바뀔지 궁금합니다.', '{X10} 팬분들도 내년을 기대해 봤으면 합니다.']], v, 3)));
  out.push(post('분석', one(r, ['MVP 경쟁 후끈… 개인 타이틀 주인공은', '숫자로 본 올 시즌 개인 기록 1위'], v),
    one(r, ['{LD}. 누가 MVP를 받아도 이상하지 않을 만큼 경쟁이 치열하다.'], v),
    cmts(r, [['개인적으로 MVP는 {N1} 선수가 받아야 한다고 봅니다.', '기록만 보면 {N2} 선수도 충분히 자격이 있습니다.', '누가 받아도 아깝지 않은 시즌이었네요.', '개인 타이틀 경쟁이 끝까지 흥미진진했습니다.']], v, 3)));
  out.push(f.post.stage
    ? post('화제', one(r, ['{T}, {R}위로 가을야구 진출 확정', '"가을 초대장 받았다" {T}, 포스트시즌 간다'], v),
      one(r, ['{T:이가} {REC}, 최종 {R}위로 정규 시즌을 마쳤다. 가을야구는 {SER}부터 시작한다.'], v),
      cmts(r, [['여기까지 온 것만으로도 정말 대단합니다.', '가을야구는 이제부터 진짜 시작이라고 봅니다.', '가을 무대에서도 지금 기세를 이어 가길 바랍니다.']], v, 3))
    : post('충격', one(r, ['{T}, {R}위로 시즌 마감… 가을야구 좌절', '"올해는 여기까지" {T}, 가을야구 무산'], v),
      one(r, ['{T:이가} {REC}, 최종 {R}위로 시즌을 마쳤다. 가을야구 진출에는 실패했다.'], v),
      cmts(r, [['아쉽지만 선수들 한 시즌 동안 고생 많았습니다.', '이번 겨울 스토브리그가 정말 중요하겠네요.', '내년에는 꼭 가을야구에서 볼 수 있길 바랍니다.']], v, 3)));
  out.push(post('분석', one(r, ['가을야구 대진 확정… 관전 포인트는', '포스트시즌 대진표 완성, 우승 후보는'], v),
    one(r, ['와일드카드 결정전에서는 {S4:과와} {S5:이가} 맞붙는다. 준플레이오프에는 {S3}, 플레이오프에는 {S2:이가} 기다리고, {S1:은는} 한국시리즈에 직행했다.'], v),
    cmts(r, [['정규 시즌 1위 {S1:이가} 아무래도 유리해 보입니다.', '단기전은 정말 모릅니다. 이변도 기대해 봅니다.', '와일드카드 결정전부터 흥미진진하겠네요.', '가을은 결국 마운드 싸움이라고 생각합니다.']], v, 3)));
  out.push(f.post.stage
    ? post('이슈', one(r, ['{T}, 가을야구 앞두고 특별 훈련 돌입설'], v),
      one(r, ['{T} 선수단이 따로 모여 단기전 대비 특별 훈련을 하고 있다는 이야기가 전해졌다. 가을 무대를 향한 준비가 한창이다.'], v),
      cmts(r, [['단기전은 분위기 싸움이라 준비가 중요하겠네요.', '철저하게 준비해서 좋은 결과 있었으면 합니다.', '가을 무대에서 한 단계 더 올라가길 응원합니다.']], v, 2))
    : f.rank >= 8
      ? post('이슈', one(r, ['{T} 사령탑 거취에 쏠린 시선'], v),
        one(r, ['시즌이 끝나자 {T} 사령탑의 거취를 둘러싼 이야기가 나온다. 프런트도 고심 중인 것으로 알려졌다.'], v),
        cmts(r, [['한 번 더 기회를 줘도 괜찮다고 생각합니다.', '변화가 필요하다면 결단은 빠를수록 좋겠죠.', '공식 발표 전까지는 차분히 지켜보겠습니다.']], v, 2))
      : post('이슈', one(r, ['{T}, 스토브리그 큰손 예고… 전력 보강 나서나'], v),
        one(r, ['아깝게 가을야구를 놓친 {T:이가} 겨울 동안 대대적인 전력 보강에 나설 것이라는 관측이 나온다.'], v),
        cmts(r, [['보강한다면 불펜부터 챙겼으면 좋겠습니다.', '이번 겨울에는 꼭 확실한 보강이 있었으면 합니다.', '사실이라면 내년 시즌이 정말 기대되네요.']], v, 2)));
  return out.filter((p): p is RawPost => !!p);
}

/* ═════════════ 인터뷰 질문 (AI 를 못 쓸 때) ═════════════ */
type QT = { q: string; o: Record<AnsType, [string, string]> };
const Q: Record<string, QT> = {
  inj: { q: '{P} 선수 {INJ} 소식이 있던데, {WHEN} 그대로 갑니까?', o: {
    trust: ['본인이 괜찮다고 합니다. 믿고 갑니다.', '감독 “{P}, 믿고 간다”'],
    push: ['아픈 것도 실력입니다. 이겨내야죠.', '“아픈 것도 실력” 감독의 채찍'],
    calm: ['트레이너 판단을 따르겠습니다.', '{P} 기용, 감독은 신중 모드'] } },
  tired: { q: '{P} 선수 피로가 꽤 쌓였다는 얘기가 있습니다. 관리 계획은요?', o: {
    trust: ['{P:은는} 알아서 몸 관리하는 선수입니다.', '“{P:은는} 알아서 한다” 무한 신뢰'],
    push: ['지금은 쉴 때가 아닙니다. 버텨야죠.', '감독 “쉬는 건 시즌 끝나고”'],
    calm: ['길게 보고 조절해 주겠습니다.', '감독, {P} 관리 모드 선언'] } },
  low: { q: '{P} 선수 컨디션이 안 올라온다는 평가가 있습니다.', o: {
    trust: ['컨디션은 금방 올라옵니다. 걱정 없습니다.', '“{P} 걱정 없다” 감독의 확신'],
    push: ['못 올라오면 자리 없습니다.', '“자리 보장 없다” {P}에 경고장'],
    calm: ['야구는 길게 봐야죠. 기다리겠습니다.', '감독 “{P}, 기다린다”'] } },
  star: { q: '{P} 선수에 대한 기대가 큽니다. 어떻게 쓰실 건가요?', o: {
    trust: ['중심에 세웁니다. 해 줄 선수예요.', '“{P:이가} 중심” 감독의 확신'],
    push: ['이름값 말고 결과로 보여 줘야죠.', '“이름값 말고 결과” 감독 일침'],
    calm: ['개막 지나 보면 알게 되겠죠.', '감독, {P} 질문엔 “두고 보자”'] } },
  sp: { q: '개막전 선발로 {P} 선수를 낙점한 이유가 궁금합니다.', o: {
    trust: ['우리 팀 에이스니까요. 당연한 선택입니다.', '“{P:이가} 에이스” 개막전 선발 확정'],
    push: ['첫 경기부터 6이닝은 책임져야 합니다.', '감독, {P}에 “6이닝은 기본”'],
    calm: ['로테이션 순서대로 가는 것뿐입니다.', '감독 “개막전도 로테이션대로”'] } },
  clean: { q: '4번 타자로 {P} 선수를 쓰는 이유는요?', o: {
    trust: ['해결사는 {P}입니다. 맡깁니다.', '“해결사는 {P}” 4번 확정'],
    push: ['4번이면 타점으로 말해야죠.', '감독, {P}에 “타점으로 증명하라”'],
    calm: ['타순은 상황 따라 바뀔 수 있습니다.', '감독 “타순은 유동적”'] } },
  rival: { q: '개막전 상대가 하필 라이벌 {O}입니다. 각오 한마디 부탁드립니다.', o: {
    trust: ['우리 선수들 믿습니다. 이깁니다.', '“라이벌전, 이긴다” 감독 자신감'],
    push: ['첫판부터 밀리면 한 시즌 끌려갑니다.', '“첫판부터 잡는다” 선전포고'],
    calm: ['라이벌이든 아니든 한 경기일 뿐입니다.', '감독 “라이벌전도 한 경기”'] } },
  pred: { q: '전력 예상에서 {T:은는} {N}위권입니다. 동의하십니까?', o: {
    trust: ['예상은 예상일 뿐, 우리는 더 위로 갑니다.', '“예상은 예상일 뿐” 감독의 반격'],
    push: ['그 정도로는 만족 못 합니다. 더 해야죠.', '감독 “{N}위권이면 실패”'],
    calm: ['순위는 시즌 끝나고 얘기하죠.', '감독, 순위 질문엔 미소만'] } },
  predTop: { q: '전력 예상에서 우승 후보로 꼽힙니다. 부담은 없습니까?', o: {
    trust: ['부담보다 자신감이 큽니다.', '“우승 후보? 자신 있다” 감독'],
    push: ['우승 못 하면 실패입니다.', '감독 “우승 아니면 실패”'],
    calm: ['예상은 예상일 뿐입니다.', '감독, 우승 후보 평가에 “글쎄요”'] } },
  level: { q: '올해 리그 단계가 {LV}입니다. 상대가 만만치 않은데요?', o: {
    trust: ['우리도 준비 많이 했습니다. 자신 있습니다.', '“준비 끝났다” 감독 자신감'],
    push: ['쉬운 상대는 없습니다. 더 독하게 갑니다.', '감독 “더 독하게 간다”'],
    calm: ['한 경기씩 하다 보면 답이 나오겠죠.', '감독 “한 경기씩” 담담한 출사표'] } },
  stage: { q: '{SER}{OPP} 승부처는 어디로 봅니까?', o: {
    trust: ['우리 선수들이 큰 경기에 강합니다. 믿습니다.', '“큰 경기에 강하다” 감독 자신감'],
    push: ['첫 경기에 다 쏟아붓습니다.', '감독 “1차전 총력전”'],
    calm: ['평소 하던 대로 하면 됩니다.', '감독 “평소처럼” 담담한 가을'] } },
  ace: { q: '1차전 선발로 {P} 선수를 예고하시겠습니까? 올 시즌 {LINE}.', o: {
    trust: ['당연합니다. 우리 에이스입니다.', '“1차전은 {P}” 에이스 예고'],
    push: ['긴 이닝 책임져야 합니다. 불펜은 아껴야죠.', '감독, {P}에 “길게 던져라”'],
    calm: ['선발은 경기 전날 공개하겠습니다.', '감독, 1차전 선발은 “비밀”'] } },
  hot: { q: '{P} 선수 올 시즌 {LINE}. 가을에도 믿고 갑니까?', o: {
    trust: ['시즌 내내 해 준 선수입니다. 믿습니다.', '“{P:이가} 해결한다” 무한 신뢰'],
    push: ['가을은 다릅니다. 더 보여 줘야죠.', '감독 “{P}, 가을은 다르다”'],
    calm: ['부담 주지 않으려고 합니다.', '감독, {P} 부담 덜어 주기'] } },
  cold: { q: '{P} 선수 부진이 길었습니다. 가을에도 기회를 줍니까?', o: {
    trust: ['큰 경기에서 해 줄 선수입니다.', '“{P:이가} 터질 차례” 감독의 믿음'],
    push: ['못 치면 바로 바꿉니다.', '“못 치면 교체” {P}에 최후통첩'],
    calm: ['컨디션 보고 결정하겠습니다.', '감독, {P} 기용은 “상황 봐서”'] } },
  closer: { q: '{P} 선수 올 시즌 {LINE}. 가을 뒷문도 맡깁니까?', o: {
    trust: ['9회는 {P}입니다. 변함없습니다.', '“9회는 {P}” 뒷문 확정'],
    push: ['가을엔 블론 하나가 끝입니다. 집중해야죠.', '감독, {P}에 “블론은 없다”'],
    calm: ['상황 따라 여러 명 준비하겠습니다.', '감독 “뒷문은 집단 체제”'] } },
  regret: { q: '{R}위로 시즌을 마쳤습니다. 가장 아쉬운 부분은요?', o: {
    trust: ['선수들은 최선을 다했습니다. 제 책임입니다.', '감독 “선수 탓 아니다, 내 탓”'],
    push: ['다 다시 봅니다. 자리 보장 없습니다.', '“자리 보장 없다” 대대적 개편 예고'],
    calm: ['내년엔 다를 겁니다. 지켜봐 주세요.', '감독 “내년엔 다르다”'] } },
  nextHot: { q: '{P} 선수 올 시즌 {LINE}. 내년에도 핵심입니까?', o: {
    trust: ['당연합니다. 내년에도 중심입니다.', '“내년에도 {P}” 감독의 신뢰'],
    push: ['올해보다 더 해야 합니다.', '감독, {P}에 “더 올라가라”'],
    calm: ['겨울 동안 같이 고민해 보겠습니다.', '감독 “{P:과와} 겨울 구상”'] } },
  nextCold: { q: '{P} 선수는 아쉬운 시즌이었습니다. 내년 구상은요?', o: {
    trust: ['반등할 선수입니다. 기다리겠습니다.', '“{P}, 반등한다” 감독의 믿음'],
    push: ['경쟁에서 이겨야 자리가 있습니다.', '“경쟁에서 이겨라” {P}에 경고'],
    calm: ['스프링캠프에서 다시 보겠습니다.', '감독 “{P}, 캠프에서 다시”'] } },
  fans: { q: '끝까지 응원한 팬들에게 한마디 부탁드립니다.', o: {
    trust: ['팬들 덕분에 버텼습니다. 감사합니다.', '감독 “팬들 덕분에 버텼다”'],
    push: ['내년엔 반드시 가을야구 하겠습니다.', '“내년엔 반드시 가을” 감독의 약속'],
    calm: ['내년에 더 재밌는 야구 보여 드리겠습니다.', '감독 “내년엔 더 재밌게”'] } },
};
const ORDERS: AnsType[][] = [['trust', 'calm', 'push'], ['push', 'trust', 'calm'], ['calm', 'push', 'trust']];
/** 인터뷰 템플릿 질문 3개 — 상황(부상 · 피로 · 컨디션 · 기록 흐름 · 라이벌 · 순위 · 가을야구)에 맞춰 */
export function localInterview(f: IvFacts): Omit<IvQ, 'by' | 'outlet'>[] {
  const r = rng(`ivq:${f.m.key}`);
  const cands: { k: string; prio: number; p?: PlayerFact; v: Vars }[] = [];
  const base: Vars = { T: teamById(ME.teamId).short, WHEN: f.m.moment === 'open' ? '개막 엔트리' : '가을야구 엔트리' };
  const add = (k: string, prio: number, p?: PlayerFact, extra: Vars = {}) => cands.push({ k, prio: prio + r() * 0.5, p, v: { ...base, P: p?.p.name, INJ: p?.inj, LINE: p?.line || undefined, ...extra } });
  const ps = f.players;
  for (const p of ps) {
    if (p.inj) add('inj', 10, p);
    else if (p.tags.includes('tired')) add('tired', 8, p);
    else if (p.tags.includes('low')) add('low', 7, p);
  }
  if (f.open) {
    const o = f.open;
    const star = ps.filter((p) => p.tags.includes('star') && !p.inj).sort((a, b) => b.ovr - a.ovr)[0];
    if (star) add('star', star.tags.includes('legend') ? 7 : 6, star);
    const sp = ps.find((p) => p.key === 'sp');
    if (sp && !sp.inj) add('sp', 5, sp);
    const b4 = ps.find((p) => p.key === 'b4');
    if (b4 && b4 !== star) add('clean', 3, b4);
    if (o.rival && o.first && o.first.opp === o.rival.id) add('rival', 6.5, undefined, { O: teamById(o.rival.id).short });
    if (o.predRank <= 2) add('predTop', 5, undefined, {});
    else add('pred', 5, undefined, { N: o.predRank });
    add('level', 3, undefined, { LV: o.lv });
  } else if (f.close) {
    const c = f.close;
    if (c.post.stage) {
      const ser = seriesKo(c.post.stage);
      add('stage', 10, undefined, { SER: ser, OPP: c.post.opp ? `에서 ${teamById(c.post.opp).short}${jong(teamById(c.post.opp).short) ? '을' : '를'} 만납니다.` : `${jong(ser) ? '을' : '를'} 앞두고 있습니다.` });
      const ace = ps.find((p) => p.key === 'sp' && p.line);
      if (ace) add('ace', 8, ace);
      const hot = ps.filter((p) => p.tags.includes('hot') && p.key !== 'sp' && p.line)[0];
      if (hot) add('hot', 7, hot);
      const cold = ps.filter((p) => p.tags.includes('cold'))[0];
      if (cold) add('cold', 7, cold);
      const cl = ps.find((p) => p.key === 'cl' && p.line);
      if (cl) add('closer', 5, cl);
    } else {
      add('regret', 10, undefined, { R: c.rank });
      const hot = ps.filter((p) => p.tags.includes('hot') && p.line)[0] ?? ps.filter((p) => p.line).sort((a, b) => b.ovr - a.ovr)[0];
      if (hot) add('nextHot', 7, hot);
      const cold = ps.filter((p) => p.tags.includes('cold'))[0];
      if (cold && cold !== hot) add('nextCold', 6, cold);
      add('fans', 5);
    }
  }
  cands.sort((a, b) => b.prio - a.prio);
  const out: Omit<IvQ, 'by' | 'outlet'>[] = [];
  const usedP = new Set<string>();
  let team = 0;
  for (const c of cands) {
    if (out.length >= 3) break;
    if (c.p && usedP.has(c.p.p.id)) continue;
    if (!c.p && team >= 2) continue;
    const t = Q[c.k];
    const q = fill(t.q, c.v);
    if (!q) continue;
    const order = ORDERS[out.length % ORDERS.length];
    const opts: IvOpt[] = [];
    for (const type of order) {
      const [text, head] = t.o[type];
      const tx = fill(text, c.v), hd = fill(head, c.v);
      if (tx && hd) opts.push({ type, text: tx, head: hd });
    }
    if (opts.length !== 3) continue;
    out.push({ q, target: c.p ? c.p.p.id : null, opts });
    if (c.p) usedP.add(c.p.p.id); else team++;
  }
  // 모자라면 팀 질문으로
  for (const k of ['fans', 'level', 'pred']) {
    if (out.length >= 3) break;
    const t = Q[k];
    const v: Vars = { ...base, LV: f.open?.lv ?? f.close?.lv, N: f.open?.predRank ?? f.close?.rank };
    const q = fill(t.q, v);
    if (!q || out.some((x) => x.q === q)) continue;
    const opts = ORDERS[out.length % 3].map((type) => ({ type, text: fill(t.o[type][0], v) ?? '', head: fill(t.o[type][1], v) ?? '' })).filter((o) => o.text && o.head);
    if (opts.length === 3) out.push({ q, target: null, opts });
  }
  return out.slice(0, 3);
}
/** 인터뷰 카드 미리 보기 한 줄 — 기자들이 먼저 물어볼 것 같은 것 */
export function ivTeaser(f: IvFacts): string {
  const p = f.players.find((x) => x.inj) ?? f.players.find((x) => x.tags.includes('tired')) ?? f.players.find((x) => x.tags.includes('low'));
  if (p) return `기자들이 ${p.p.name} 선수 ${p.inj ? '부상' : p.tags.includes('tired') ? '피로' : '컨디션'} 이야기부터 꺼낼 것 같아요.`;
  if (f.close?.post.stage) return `${seriesKo(f.close.post.stage)} 각오를 묻는 질문이 쏟아질 거예요.`;
  if (f.close) return `${f.close.rank}위로 끝난 시즌, 아쉬운 점을 물어볼 거예요.`;
  const star = f.players.filter((x) => x.tags.includes('star')).sort((a, b) => b.ovr - a.ovr)[0];
  if (f.open?.rival && f.open.first?.opp === f.open.rival.id) return `개막전부터 ${f.open.rival.name}, 라이벌전 질문이 나올 거예요.`;
  return star ? `${star.p.name} 선수 기용을 두고 질문이 나올 것 같아요.` : '올 시즌 각오를 묻는 질문이 나올 거예요.';
}
