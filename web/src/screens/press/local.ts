// 언론 템플릿 — AI 를 부르지 않는 날마다 뉴스(커뮤니티 글)와, AI 를 못 쓸 때 개막 특집 · 시즌 결산 · 특이사항 · 인터뷰 대신.
// 돈이 안 든다. 경기 자료(game/press 의 openFacts · closeFacts · dayFacts · ivFacts)로만 쓴다 — 결과 · 숫자는 그대로, 실제 이름 없음.
// 같은 날 · 같은 자리는 늘 같은 글(시즌 시드로 고름) — 다시 열어도 바뀌지 않는다.
// 말투: 글은 커뮤니티 반말(낚시 제목 · ㅋㅋ · 실화냐), 인터뷰 답은 감독 존댓말. 욕설 · 비하 · 실제 구단/선수/기업 이름 없음.
import { ME, playerById, teamById } from '../../game/mock';
import {
  POST_SEEDS, evTag, pickOf, rng, seriesKo,
  type AnsType, type CloseFacts, type DayFacts, type EvKind, type EvRec, type IvFacts, type IvOpt, type IvQ, type OpenFacts, type PlayerFact, type PressTag, type RawPost,
} from '../../game/press';
import { longDate, shortDate } from '../../season/schedule';
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
  이라: (j) => (j ? '이라' : '라'),
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

/* ═════════════ 날마다 뉴스 ═════════════ */
const WIN_T = ['{T} {O} 잡았다ㅋㅋ {S}', '오늘 {T} 경기 한 줄 요약.txt', '{S} 승리, 이 맛에 야구 본다', '오늘 {T} 폼 실화냐', '{O} 상대로 {S}… 오늘은 칭찬만 한다', '이겼다!!! 오늘은 승리 치킨', '{T} {S} 승) 감독 오늘은 인정'];
const WIN_HERO_T = ['{HERO} 오늘 다 했다ㅋㅋ', '{HERO} 미쳤다 진짜 {HL}', '오늘 MVP는 {HERO}, 반박 안 받음'];
const WIN_B = ['{O} 상대로 {S} 승. 안타 {H}개 몰아쳤고 실책은 {E}개. 이대로만 가자.', '초반부터 분위기 잡고 끝까지 안 밀렸다. 오랜만에 속 편하게 본 경기.', '{O} 마운드 상대로 안타 {H}개. 타선이 제대로 터진 날이다.'];
const WIN_HERO_B = ['{HERO} {HL}. 오늘은 그냥 {HERO:이랑} 나머지였음ㅋㅋ', '{HERO:이가} {HL}. 이 선수 요즘 감 미쳤다.'];
const WIN_PIT_B = ['선발 {W:이가} 버텨 줬고 {SV:이가} 뒷문 잠갔다. 마운드가 할 일 다 함.', '{W} 승리, {SV} 세이브. 투수들 오늘 밥값 했다.'];
const LOSS_T = ['{T} 오늘 경기 보고 혈압 오름', '{O}한테 {S}… 이게 맞냐', '타선 실종 신고합니다', '오늘 경기 하이라이트 없음 (진짜 없음)', '감독님 오늘 운영 설명 좀 해주세요', '{S} 패배 실화냐', '{T} 팬은 오늘도 웁니다'];
const LOSS_PIT_T = ['{L} 오늘 왜 그랬냐', '{L} 초반에 무너진 거 나만 봤냐'];
const LOSS_B = ['{O}에 {S} 패. 안타 {H}개로는 답이 없다. 찬스마다 범타 퍼레이드.', '중반까지 버티다가 한 번에 무너졌다. 오늘은 그냥 빨리 잊자.', '{O} 투수한테 꽁꽁 묶였다. 방망이가 안 맞으니 할 게 없음.'];
const LOSS_PIT_B = ['선발 {L:이가} 초반에 흔들렸고 그 뒤로 끌려다니기만 했다.'];
const LOSS_ERR_B = ['실책 {E}개가 다 했다. 수비부터 다시 하자.'];
const DRAW_T = ['{INN}회까지 가서 무승부ㅋㅋ 체력만 날림', '{S} 무승부… 이긴 것도 진 것도 아님'];
const DRAW_B = ['{O:과와} {INN}회까지 붙어서 {S}. 찝찝한데 안 진 게 어디냐.'];
const WO_W_T = ['{T} 끝내기!!! {S}', '끝내기 실화냐 소리 질렀다', '{GW} 끝내기 미쳤다ㅋㅋㅋ'];
const WO_W_B = ['{INN}회말 끝내기로 {O}에 {S} 승. {GW:이가} 마지막을 장식했다.', '마지막 이닝에 경기를 끝냈다. {O} 상대로 {S}, 이게 야구지.'];
const WO_L_T = ['끝내기 맞고 {S} 패…', '{INN}회말에 무너졌다 {S}'];
const WO_L_B = ['다 잡은 경기였는데 마지막에 끝내기 맞고 {O}에 {S:으로} 졌다.'];
const BLOW_W_T = ['{S} 대참사ㅋㅋㅋ {O} 괜찮냐', '점수 차 실화냐 {S}'];
const BLOW_W_B = ['{O} 상대로 {S} 대승. 안타 {H}개, 오늘은 뭘 해도 됐다.'];
const BLOW_L_T = ['{S}… 오늘은 없던 경기로 하자', '{O}한테 {S} 대패 실화냐'];
const BLOW_L_B = ['{O}에 {S} 대패. 할 말이 없다. 내일은 다른 팀이길.'];
const SHUT_W_T = ['영봉승 {S}, 마운드 오늘 완벽', '{O} 타선 0점으로 묶었다'];
const SHUT_W_B = ['{O} 타선을 0점으로 묶었다. 승리 투수는 {W}.', '{O} 상대로 영봉승. 안타 {OH}개만 내줬다.'];
const SHUT_L_T = ['오늘 0점… 무득점 실화냐', '타선 오늘 퇴근함'];
const SHUT_L_B = ['{O} 마운드에 꽁꽁. 안타 {H}개 치고 0점.'];
const XTRA_W_T = ['{INN}회 연장 끝 {S} 승', '연장 혈투 끝에 이겼다 {S}'];
const XTRA_W_B = ['{INN}회까지 가는 혈투 끝에 {O:을를} {S:으로} 잡았다. 불펜 다 갈아 넣음.'];
const XTRA_L_T = ['{INN}회 연장 끝에 {S} 패…'];
const XTRA_L_B = ['{INN}회까지 버텼는데 결국 졌다. 체력도 잃고 경기도 잃음.'];
const ONE_W_T = ['한 점 차 승리, 심장 쫄깃했다', '{S} 신승, 오늘도 손에 땀'];
const ONE_W_B = ['{O}에 {S}. 마지막까지 조마조마했지만 이긴 게 중요하다.'];
const ONE_L_T = ['한 점 차로 졌다… {S}', '딱 한 점이 모자랐다'];
const ONE_L_B = ['{O}에 {S}. 한 방만 더 나왔으면.'];

const WIN_C = ['오늘은 감독 칭찬한다', '이 맛에 야구 보지', '어제 욕한 거 취소함ㅋㅋ', '타선 깨어났냐', '내일도 이렇게만 ㄱㄱ', '치킨 시킴 승리 기념', '순위표 새로고침 중', '방심 금지 내일 또 모름', '가을야구 냄새 난다', '{O} 팬들 조용하네ㅋㅋ', '이게 {T} 야구지', '직관러들 부럽다', '하이라이트 세 번 돌려봄', '오늘 같은 날만 있었으면'];
const HERO_C = ['{HERO} 연봉 올려줘라', '{HERO} 오늘 MVP 인정', '{HERO} 타석 들어올 때 소름'];
const LOSS_C = ['방망이 놓고 왔냐', '불펜 또 불 질렀다', '내일 이기면 됨(내일도 짐)', '오늘 경기 안 본 사람이 승자', '타순 짠 사람 나와', '그래도 응원은 한다…', '이 정도면 직관 금지령', '치킨이 아깝다', '슬슬 감독 교체 얘기 나온다', '{O} 팬들 신났네', '잔루만 몇 개냐', '한숨만 나온다', '다음 시리즈부터 잘하자'];
const CLOSE_LOSS_C = ['한 끗 차이였는데', '끝까지 붙은 건 인정', '마지막 찬스 하나가 아쉽다', '이런 경기 지면 잠이 안 옴', '졌지만 경기력은 괜찮았다', '그 타석에서 한 방만…'];
const BLOW_LOSS_C = ['1회 보고 껐다', '오늘은 그냥 없던 일로', '점수 차 보고 채널 돌림', '투수 몇 명 나왔냐 오늘', '내일은 제발'];
const DRAW_C = ['비긴 게 이긴 거다', '야구장에서 밤샌 사람 손', '불펜 내일 괜찮냐', '이럴 거면 9회에 끝내지', '그래도 안 진 게 어디냐'];
const WO_W_C = ['소리 질러서 옆집에서 연락 옴', '이게 야구지', '끝내기 맛집 {T}', '심장 아직 뛴다', '{GW} 오늘 영웅', '마지막까지 본 사람 승리'];
const WO_L_C = ['마무리 누구 탓이냐', '9회에 멘탈 나감', '오늘 잠 못 잔다', '그래도 끝까지 본 나 칭찬해', '다 잡은 경기였는데'];

/** 그날 내 경기 글 */
function myGamePost(f: DayFacts, r: R): RawPost | null {
  const m = f.my;
  if (!m) return null;
  const side = m.home ? 1 : 0;
  // 수훈 타자 — 멀티히트 · 홈런 · 3타점 이상일 때만 '오늘 다 했다' 글감으로
  const hb = f.box?.bat[side].filter((b) => b.H >= 2 || b.HR >= 1 || b.RBI >= 3).sort((a, b) => (b.HR * 4 + b.H * 1.5 + b.RBI * 1.5) - (a.HR * 4 + a.H * 1.5 + a.RBI * 1.5))[0];
  const hero = hb ? [hb.name, [`${hb.AB}타수 ${hb.H}안타`, hb.HR ? `${hb.HR}홈런` : '', hb.RBI ? `${hb.RBI}타점` : ''].filter(Boolean).join(' ')] as const : undefined;
  const myPit = (id: string | undefined) => (id && f.box?.pit[side].some((p) => p.id === id) ? pName(id) : undefined);
  const v: Vars = {
    T: short(f.me), O: short(m.opp), S: `${m.my}:${m.their}`, INN: m.inn,
    H: m.hits?.[side], OH: m.hits?.[1 - side], E: m.errors?.[side],
    W: myPit(m.dec?.w), L: myPit(m.dec?.l), SV: myPit(m.dec?.s), GW: f.box?.gw && f.box.gw.side === side ? f.box.gw.name : undefined,
    HERO: hero?.[0], HL: hero?.[1],
  };
  const d = m.my - m.their;
  const at = f.idx * 3 + (f.seed.charCodeAt(0) || 0);
  const pickPost = (tag: PressTag, T: readonly string[], B: readonly string[], C: readonly (readonly string[])[]) => post(tag, one(r, T, v, at), one(r, B, v, at), cmts(r, C, v, nOf(r)));
  if (m.res === 'D') return pickPost('실화냐', DRAW_T, DRAW_B, [DRAW_C]);
  if (m.wo) return m.res === 'W' ? pickPost('속보', WO_W_T, WO_W_B, [WO_W_C, WIN_C]) : pickPost('충격', WO_L_T, WO_L_B, [WO_L_C, LOSS_C]);
  if (m.inn >= 10) return d > 0 ? pickPost('실화냐', XTRA_W_T, XTRA_W_B, [WIN_C]) : pickPost('충격', XTRA_L_T, XTRA_L_B, [CLOSE_LOSS_C, LOSS_C]);
  if (d >= 7) return pickPost('실화냐', BLOW_W_T, BLOW_W_B, [WIN_C, HERO_C]);
  if (d <= -7) return pickPost('충격', BLOW_L_T, BLOW_L_B, [BLOW_LOSS_C, LOSS_C]);
  if (d > 0 && m.their === 0) return pickPost('분석', SHUT_W_T, SHUT_W_B, [WIN_C]);
  if (d < 0 && m.my === 0) return pickPost('충격', SHUT_L_T, SHUT_L_B, [LOSS_C, BLOW_LOSS_C]);
  if (d === 1 && r() < 0.5) return pickPost('속보', ONE_W_T, ONE_W_B, [WIN_C, HERO_C]);
  if (d === -1 && r() < 0.5) return pickPost('충격', ONE_L_T, ONE_L_B, [CLOSE_LOSS_C]);
  if (d > 0) {
    const useHero = !!v.HERO && r() < 0.5;
    const usePit = !useHero && !!v.W && !!v.SV && r() < 0.5;
    const title = one(r, useHero ? WIN_HERO_T : WIN_T, v, at);
    return post(useHero ? '속보' : title && /실화냐|미쳤|폼/.test(title) ? '실화냐' : '속보', title, one(r, useHero ? WIN_HERO_B : usePit ? WIN_PIT_B : WIN_B, v, at), cmts(r, useHero ? [WIN_C, HERO_C] : [WIN_C], v, nOf(r)));
  }
  const usePit = !!v.L && r() < 0.4;
  const useErr = !usePit && (Number(v.E) || 0) >= 2;
  const title = one(r, usePit ? LOSS_PIT_T : LOSS_T, v, at);
  return post(title && /신고|설명/.test(title) ? '분석' : '충격', title, one(r, usePit ? LOSS_PIT_B : useErr ? LOSS_ERR_B : LOSS_B, v, at), cmts(r, d >= -2 ? [CLOSE_LOSS_C, LOSS_C] : d <= -5 ? [LOSS_C, BLOW_LOSS_C] : [LOSS_C], v, nOf(r)));
}

const STREAK_W_T = ['{T} {N}연승 질주ㅋㅋ', '{N}연승 중인데 아직 불안한 사람?', '요즘 {T} 무섭다 {N}연승'];
const STREAK_W_B = ['최근 {N}경기 다 이겼다. 지금 {R}위, 분위기 최고.', '{N}경기 연속 승리. 요즘 {T:은는} 지는 법을 까먹었다.'];
const STREAK_W_C = ['이게 진짜 {T}냐', '연승 끊기기 전에 직관 간다', '말 조심해 부정 탄다', '이대로 쭉 가자', '연승 중엔 양말도 안 바꾼다'];
const STREAK_L_T = ['{N}연패… 출구가 안 보인다', '연패 {N}, 이제 그만 지자', '{T} 요즘 왜 이러냐 {N}연패'];
const STREAK_L_B = ['{N}경기째 승리가 없다. 순위는 {R}위까지 밀렸다.', '이기는 법을 잊었다. {N}연패 동안 뭐 하나 되는 게 없다.'];
const STREAK_L_C = ['연패 끊는 날 직관 간다', '이게 팀이냐', '감독 면담 필요함', '내일은 이긴다(믿음)', '연패 중엔 하이라이트도 안 봄'];
const RANK_UP_T = ['{T} {R}위 등극', '순위표 보셈 {T} {R}위'];
const RANK_UP_B = ['어제 {PR}위에서 오늘 {R}위. 이 기세 이어 간다.'];
const RANK_DN_T = ['{T} {R}위로 미끄러짐', '{R}위… 순위표 보기 무섭다'];
const RANK_DN_B = ['어제 {PR}위였는데 하루 만에 {R}위. 아직 시즌 길다.'];
const LINE_IN_T = ['{T} 가을야구 선 안으로 들어왔다'];
const LINE_IN_B = ['{R}위로 올라서 가을야구 커트라인({LINE}위) 안. 이제 지키는 싸움이다.'];
const LINE_OUT_T = ['{T} 가을야구 선 밖으로…'];
const LINE_OUT_B = ['{R}위로 밀려 커트라인({LINE}위) 밖. 남은 경기 하나하나가 결승이다.'];
const RANK_C = ['순위표 캡처함', '아직 모른다 시즌 길다', '한 경기 한 경기가 중요하다', '위만 보고 가자', '밑에서 쫓아온다 긴장해'];

const NEWS_C: Record<string, readonly string[]> = {
  노히트: ['투수 이름 외워 둔다', '상대 타선 오늘 뭐 했냐', '역사적인 날이네', '하이라이트 꼭 봐라'],
  끝내기: ['요즘 {X} 뒷심 무섭네', '끝내기 맛 들렸다', '{Y} 팬들 오늘 잠 못 잔다'],
  역전: ['포기하면 안 되는 이유', '{X} 저력 인정', '불펜이 문제였네'],
  기록: ['이 선수 요즘 폼 미쳤다', '우리 팀으로 데려와라', '기록 장인 인정', '오늘 MVP 확정'],
  부상: ['제발 큰 부상 아니길', '빨리 돌아와라', '아프지 말자 선수들'],
  취소: ['직관 가려다 집 옴', '밀린 경기 몰리면 불펜 어쩌냐', '우천 취소 요정 누구냐', '오늘은 쉬어 가는 날'],
  순위: ['1위 싸움 이제 시작', '{X} 요즘 무섭네', '아직 모른다'],
  연승: ['요즘 {X} 왜 이렇게 잘하냐', '{X} 팬들 행복하겠다', '연승 언제 끊기나 보자'],
  연패: ['{X} 팬들 힘내라', '감독 경질설 나오겠네', '연패는 언젠가 끝난다'],
};
/** 리그 소식(템플릿 소식 한 줄) → 커뮤니티 글 */
function newsPost(n: NewsRec, f: DayFacts, r: R): RawPost | null {
  const X = short(n.team);
  const who = /^(.+?)\(/.exec(n.text)?.[1];
  const num = Number(/(\d+)/.exec(n.text)?.[1] ?? 0) || undefined;
  const mine = n.team === f.me;
  const v: Vars = { X, WHO: who, N: num, TEXT: n.text.replace(/[.。]$/, '') };
  const c = (k: string) => cmts(r, [NEWS_C[k] ?? NEWS_C.순위], v, 2);
  switch (n.kind) {
    case '노히트': return post('충격', one(r, ['{X} 노히트노런 실화냐', '[대기록] {X} 노히트노런 나왔다'], v), one(r, ['{TEXT}. 오늘 야구장 있던 사람들 평생 자랑하겠다.'], v), c('노히트'));
    case '끝내기': {
      const m = /, (\d+)회말 끝내기로 (.+?)[를을] 꺾/.exec(n.text);
      const w: Vars = { ...v, INN: m?.[1], Y: m?.[2] };
      return post('속보', one(r, ['{X} 끝내기 승ㅋㅋ', '{X} 또 끝내기냐'], w), one(r, ['{X}, {INN}회말 끝내기로 {Y:을를} 잡았다. 요즘 뒷심 무섭다.'], w), cmts(r, [NEWS_C.끝내기], w, 2));
    }
    case '역전': {
      const w: Vars = { ...v, SC: /\((\d+:\d+)\)/.exec(n.text)?.[1] };
      return post('실화냐', one(r, ['{X} {N}점 차 뒤집었다', '{N}점 차 역전 실화냐'], w), one(r, ['{X:이가} {N}점 차를 뒤집었다 ({SC}). 야구는 끝나 봐야 안다.'], w), c('역전'));
    }
    case '기록': {
      const T = /홈런/.test(n.text) ? ['{WHO} 한 경기 홈런 {N}개 실화냐'] : /탈삼진/.test(n.text) ? ['{WHO} 탈삼진 {N}개 쇼'] : ['{WHO} 5안타 경기ㅋㅋ 타격감 미쳤다'];
      return post(mine ? '속보' : '실화냐', one(r, T, v), one(r, ['{TEXT}.'], v), c('기록'));
    }
    case '부상': return mine
      ? post('속보', one(r, ['{WHO} 경기 중 교체… 부상 아니길', '[속보] {WHO} 다쳐서 빠졌다'], v), one(r, ['{WHO:이가} 경기 도중 다쳐서 빠졌다. 큰 부상 아니길 빈다.'], v), c('부상'))
      : post('속보', one(r, ['{X} {WHO} 부상 교체'], v), one(r, ['{TEXT}.'], v), c('부상'));
    case '취소': return post('속보', one(r, ['비 때문에 경기 취소 속출', '오늘 비 실화냐 경기 취소'], v), one(r, ['비 때문에 {N}경기가 취소됐다. 밀린 경기는 시즌 끝에 다시 한다.'], v), c('취소'));
    case '순위': return mine ? null : post('속보', one(r, ['{X} 1위 탈환', '선두 바뀜 {X} 1위'], v), one(r, ['{TEXT}. 선두 싸움 재밌어진다.'], v), c('순위'));
    case '연승': return mine ? null : post('실화냐', one(r, ['{X} {N}연승 질주', '요즘 {X} 왜 이렇게 잘하냐 {N}연승', '{X} {N}연승, 이 팀 뭐냐'], v), one(r, ['{X} {N}연승. 지금 리그에서 제일 뜨거운 팀.', '{N}경기 연속 승리. {X} 상대하는 팀들 긴장해야 할 듯.', '{X:이가} {N}연승을 달렸다. 투타 다 잘 풀린다.'], v), c('연승'));
    case '연패': return mine ? null : post('충격', one(r, ['{X} {N}연패 수렁', '{X} {N}연패… 괜찮냐', '{X} 연패 탈출 언제 하냐'], v), one(r, ['{X} {N}연패. 분위기가 말이 아니다.', '{N}경기째 승리가 없다. {X} 더그아웃 분위기 무거울 듯.', '{X:이가} {N}연패에 빠졌다. 뭘 해도 안 풀린다.'], v), c('연패'));
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
  return post('분석', one(r, ['오늘 한별 리그 결과 정리', '다른 구장 결과 모음.txt', '오늘 리그 한눈에 보기'], v), one(r, ['{L}. 오늘 제일 화끈한 건 {X}.', '{L}. 순위 싸움 점점 재밌어진다.'], v), cmts(r, [['순위 싸움 재밌어진다', '{X} 요즘 기세 좋네', '내일 경기 더 기대됨', '정리 감사요', '이런 글 좋다']], v, 2));
}
/** 팀 기록 분석 (마지막 날) */
function analysisPost(f: DayFacts, r: R): RawPost | null {
  const t = f.team;
  if (!t || f.played < 10) return null;
  const v: Vars = { T: short(f.me), AVG: t.avg.toFixed(3).replace(/^0/, ''), AR: t.avgRank, ERA: t.era.toFixed(2), ER: t.eraRank };
  const good = (k: number) => k <= 4;
  const verdict = good(t.avgRank) && good(t.eraRank) ? '이 전력이면 위로 간다.' : good(t.avgRank) ? '방망이는 되는데 마운드가 문제다.' : good(t.eraRank) ? '투수는 버티는데 방망이가 안 터진다.' : '숫자만 보면 답이 없다…';
  return post('분석', one(r, ['{T} 팀 타율 {AVG}, 리그 {AR}위', '{T} 마운드 평균자책 {ERA} 실화냐', '{T} 팀 기록 정리해 봄'], v), `${fill('팀 타율 {AVG:으로} 리그 {AR}위, 팀 평균자책은 {ERA:으로} {ER}위. ', v) ?? ''}${verdict}`, cmts(r, [['숫자는 거짓말 안 한다', '타선이 문제냐 마운드가 문제냐', '분석글 추천 박고 감', '이런 글 좋다', '팩트로 때리네']], v, 2));
}
/** 루머 (지어낸 숫자 없이 — 카더라) */
function rumorPost(f: DayFacts, r: R): RawPost | null {
  const rows = f.rows;
  const low = rows?.[rows.length - 1];
  const other = rows ? pickOf(r, rows.filter((x) => x.teamId !== f.me)).teamId : undefined;
  const v: Vars = { T: short(f.me), X: short(other), Z: short(low?.teamId) };
  const pool: [string, string][] = [
    ['{T} 트레이드 시장 기웃거린다는 카더라', '불펜 보강하려고 여기저기 연락 중이라는 소문. 출처는 모름.'],
    ['{X} 외국인 선수 교체 검토설', '요즘 부진이 길어서 교체 얘기가 돈다고 함. 믿거나 말거나.'],
    ['{T} 2군 유망주 깜짝 콜업설', '2군에서 펄펄 난다는 그 선수, 곧 올라온다는 얘기가 있음.'],
    ['{X} 라커룸 분위기 심상치 않다는 소문', '최근 경기 끝나고 미팅이 길어졌다는 카더라. 반전 노리는 듯.'],
  ];
  if (low && low.teamId !== f.me && low.streak.endsWith('패')) pool.push(['{Z} 감독 경질설 솔솔', '연패가 길어지자 구단 안에서도 말이 나온다는 카더라.']);
  const [t, b] = pickOf(r, pool);
  return post('루머', fill(t, v), fill(b, v), cmts(r, [['카더라는 거르자', '출처 어디냐', '이거 진짜면 대박', '또 시작이네 루머', '일단 저장해 둠']], v, 2));
}

/** 그날 템플릿 뉴스 n개 — skip: 그날 특이사항으로 따로 다룬 것(겹치지 않게) */
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
      ? post('실화냐', one(r, STREAK_W_T, v), one(r, STREAK_W_B, v), cmts(r, [STREAK_W_C], v, nOf(r)))
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
  // 내 구단 소식 먼저, 다른 구단은 노히트 · 연승 · 연패 · 끝내기 · 역전 · 기록 · 순위 · 부상 · 취소 순 — 같은 종류는 하루 한 글
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
  // 채우기 — 리그 정리 · 분석 · 루머
  const fillers = [() => roundupPost(f, r), () => (f.latest ? analysisPost(f, r) : null), () => (f.latest && r() < 0.6 ? rumorPost(f, r) : null)];
  for (const fn of fillers.sort(() => r() - 0.5)) push(fn());
  return out;
}

/* ═════════════ 특이사항 (AI 를 못 쓰거나 고르지 않은 사건) ═════════════ */
type EvT = { t: readonly string[]; b: readonly string[]; c: readonly string[] };
const EVT: Record<EvKind | 'nohitMe' | 'nohitUs' | 'comebackL', [EvT, EvT, PressTag]> = {
  nohit: [{ t: ['{X} 노히트노런 달성 실화냐', '[대기록] {X} 노히트노런'], b: ['{TEXT}. 9이닝 동안 안타를 하나도 안 내줬다.'], c: ['역사적인 날', '상대 타선 오늘 뭐 했냐', '이건 박제해야 함'] },
    { t: ['노히트 경기 끝까지 본 사람 손', '노히트 나오는 날 직관 간 사람 부럽다'], b: ['마지막 아웃 잡을 때 다들 숨도 안 쉬었을 듯. {X} 팬들 오늘 잠 다 잤다.'], c: ['나 봤다 소름 돋음', '평생 한 번 볼까 말까', '마지막 이닝 손 떨림'] }, '실화냐'],
  nohitMe: [{ t: ['{T} 노히트노런!!! 실화냐', '[대기록] {T} 마운드 노히트노런'], b: ['{TEXT}. 오늘 우리 투수들 그냥 미쳤다.'], c: ['평생 기억할 날', '우리 팀이 노히트를 하네', '투수진 다 업어 주고 싶다'] },
    { t: ['노히트 마지막 아웃 순간 우리 집 상황', '오늘 직관 간 사람 로또 맞음'], b: ['9회 마지막 타자 잡을 때 다 같이 일어났다. 이런 날이 오다니.'], c: ['나도 울었다', '하이라이트 무한 반복', '오늘은 다 같이 축하'] }, '실화냐'],
  nohitUs: [{ t: ['{T} 노히트 당했다… 안타 0개 실화냐', '안타 하나를 못 쳤다'], b: ['{TEXT}. 오늘 타선은 그냥 출근만 했다.'], c: ['방망이 들고는 갔냐', '오늘 경기는 기억에서 지운다', '이게 말이 되냐'] },
    { t: ['노히트 당한 날 팬들 반응 모음', '타선 전원 면담 필요'], b: ['기록의 희생양이 됐다. 내일은 안타라도 치자.'], c: ['내일 몰아치자', '상대 투수가 잘 던진 걸로', '자존심 상한다'] }, '분석'],
  first: [{ t: ['{T} 1위 등극!!!', '순위표 맨 위에 {T}'], b: ['{T:이가} 드디어 순위표 맨 위에 올라섰다. {DATE} 기준 1위.'], c: ['캡처 필수', '이 순간을 기다렸다', '내려가지만 말자'] },
    { t: ['1위 {T}, 진짜 실력인가 분석해 봄', '1위 굳히기 하려면 필요한 것'], b: ['타선 · 마운드 고르게 올라왔다. 이제 지키는 게 더 어렵다.'], c: ['분석 인정', '아직 시즌 길다', '1위 팀다운 경기 하자'] }, '분석'],
  streakW: [{ t: ['{T} {N}연승 질주 실화냐', '{N}연승ㅋㅋ 요즘 {T} 무섭다'], b: ['{N}경기 연속 승리. 요즘 {T:은는} 지는 법을 까먹었다.'], c: ['연승 중엔 아무것도 안 바꾼다', '이게 진짜 우리 팀이냐', '{N}연승 직관한 사람 부럽다'] },
    { t: ['{N}연승 비결 분석해 봄', '연승 기간 기록 정리'], b: ['선발이 길게 던지고 타선이 초반에 점수 낸다. 단순한데 이게 된다.'], c: ['기본에 충실', '불펜 과부하는 조심', '분석글 추천'] }, '분석'],
  streakL: [{ t: ['{T} {N}연패 수렁…', '{N}연패 실화냐'], b: ['{N}경기째 승리가 없다. 이 정도면 뭐라도 바꿔야 한다.'], c: ['이게 팀이냐', '연패 끊는 날 직관 간다', '선수들도 답답하겠지'] },
    { t: ['연패 길어지자 코치진 개편설', '연패 탈출 시나리오 써 봄'], b: ['구단 안에서 분위기 쇄신 얘기가 나온다는 카더라. 사실이면 곧 뭔가 나올 듯.'], c: ['카더라는 거른다', '감독님 힘내세요', '바꿀 거면 빨리'] }, '루머'],
  record: [{ t: ['{WHO} 대기록 실화냐', '[대기록] {WHO} 오늘 미쳤다'], b: ['{TEXT}. 리그 역사에 남을 만한 하루.'], c: ['기록 장인', '이건 레전드 경기', '{WHO} 오늘 MVP'] },
    { t: ['{WHO} 오늘 기록이 얼마나 대단하냐면', '대기록 나온 날 정리'], b: ['한 시즌에 한 번 나올까 말까 한 기록. 상대 팀은 오늘 악몽 꾸겠다.'], c: ['숫자 보니 실감 난다', '역대급', '하이라이트 저장'] }, '분석'],
  dropout: [{ t: ['{T} 가을야구 선 밖으로 밀려났다', '막판에 {T} 왜 이러냐'], b: ['{TEXT}. 남은 경기 하나하나가 결승이다.'], c: ['아직 끝난 거 아님', '여기서 무너지면 안 된다', '막판에 왜 이러냐'] },
    { t: ['남은 경기로 막차 탈 수 있나 계산해 봄', '가을야구 경우의 수 정리'], b: ['위 팀이 주춤하면 기회는 있다. 문제는 우리가 이겨야 한다는 거.'], c: ['계산기 두드리는 중', '경우의 수 싫다', '그냥 다 이기면 됨'] }, '분석'],
  walkoffW: [{ t: ['{T} 끝내기 승!! {S}', '끝내기!!! {T} 미쳤다'], b: ['{TEXT}. 마지막 이닝에 경기를 끝냈다.'], c: ['소리 질렀다', '이게 야구지', '끝내기 맛집'] },
    { t: ['끝내기 순간 우리 집 상황', '끝내기 직관한 사람 후기 좀'], b: ['자다 깬 동생까지 소리 지름. 오늘은 다 같이 잠 못 잔다.'], c: ['우리 집도 똑같음ㅋㅋ', '이웃한테 죄송', '심장이 아직도 뜀'] }, '실화냐'],
  walkoffL: [{ t: ['끝내기 패… {O}에 {S}', '{O}한테 끝내기 맞았다'], b: ['{TEXT}. 다 잡은 경기를 마지막에 놓쳤다.'], c: ['오늘 잠 못 잔다', '마무리 누구 탓이냐', '9회 운영 아쉽다'] },
    { t: ['마지막 이닝 운영 이게 맞냐', '끝내기 패 복기해 봄'], b: ['투수 교체 타이밍이 한 박자 늦었다. 결과론이지만 아쉬운 건 아쉬운 거다.'], c: ['결과론 맞음', '그래도 아쉬움', '내일 갚아 주자'] }, '분석'],
  comeback: [{ t: ['{N}점 차 뒤집었다ㅋㅋㅋ', '역전승 실화냐 {S}'], b: ['{TEXT}. 중간에 끈 사람 손.'], c: ['포기한 사람 반성해', '이게 {T} 야구', '역전승은 못 참지'] },
    { t: ['오늘 역전승 포인트 정리', '역전 드라마 다시 보기'], b: ['불펜이 더 안 주고 버텨 준 게 컸다. 타선은 몰아칠 때 확실히 몰아쳤다.'], c: ['불펜 칭찬해', '정리 감사', '이런 경기 자주 보자'] }, '분석'],
  comebackL: [{ t: ['{N}점 차를 못 지키고 역전패', '다 이긴 경기를 뒤집혔다'], b: ['{TEXT}. 이건 진짜 아프다.'], c: ['불펜 또 불 질렀다', '오늘 경기는 잊자', '다 이긴 경기였는데'] },
    { t: ['역전패 원인 정리해 봄', '리드 지키는 법 까먹었냐'], b: ['리드 잡고 나서 추가점이 안 나왔다. 불펜만 탓할 일이 아니다.'], c: ['추가점 못 낸 게 크다', '공감', '내일은 다르겠지'] }, '분석'],
  injury: [{ t: ['{WHO} 부상 교체… 큰 부상 아니길', '[속보] {WHO} 경기 중 빠졌다'], b: ['{TEXT}. 정밀 검사 결과를 기다리는 중.'], c: ['제발 큰 부상 아니길', '빨리 돌아와라', '대체 선수 누구냐'] },
    { t: ['{WHO} 빠지면 누가 메우냐', '{WHO} 공백 메울 카드 정리'], b: ['당장 빈자리를 메울 선수가 마땅치 않다. 라인업 다시 짜야 할 듯.'], c: ['벤치 활용할 때', '감독 머리 아프겠다', '다들 한 발씩 더 뛰자'] }, '분석'],
  marathon: [{ t: ['{N}회 혈투 {S}', '연장 {N}회 실화냐'], b: ['{TEXT}. 불펜 다 갈아 넣었다.'], c: ['야구장에서 밤샘', '내일 불펜 어쩌냐', '체력전 실화냐'] },
    { t: ['연장 혈투 후폭풍 걱정됨', '오늘 던진 투수 몇 명이냐'], b: ['오늘 던진 투수만 몇 명이냐. 내일 선발이 길게 가 줘야 한다.'], c: ['내일 선발 부담', '불펜 휴식 필요', '그래도 재밌었다'] }, '분석'],
  myRecord: [{ t: ['{WHO} 오늘 미쳤다', '{WHO} 기록 쇼'], b: ['{TEXT}. 오늘은 그냥 {WHO}의 날.'], c: ['{WHO} 연봉 올려줘라', '폼 미쳤다', '오늘 MVP'] },
    { t: ['{WHO} 요즘 폼 실화냐', '{WHO} 최근 흐름 정리'], b: ['타석마다 뭔가 해낸다. 이 흐름 길게 가자.'], c: ['감 잡았다', '이대로만', '응원가 크게 부른다'] }, '실화냐'],
  postWin: [{ t: ['{T} {SER} 통과!!', '{SER} 뚫었다ㅋㅋ {T} 간다'], b: ['{TEXT}. 가을 {T} 무섭다.'], c: ['가을 DNA', '다음 상대 누구냐', '이대로 끝까지 가자'] },
    { t: ['다음 시리즈 미리 보기', '다음 상대 분석 들어간다'], b: ['분위기는 우리가 좋다. 선발 순서만 잘 짜면 해 볼 만하다.'], c: ['분석 감사', '1차전 선발 누구?', '끝까지 가자'] }, '분석'],
  postLose: [{ t: ['{T} {SER}에서 탈락…', '올해 가을은 여기까지'], b: ['{TEXT}. 올해 가을은 여기까지.'], c: ['수고했다 진짜', '내년에 다시', '그래도 즐거웠다'] },
    { t: ['올 시즌 돌아보기', '수고한 선수들한테 한마디씩'], b: ['시즌 내내 버틴 것만으로도 박수. 부족한 건 겨울에 채우자.'], c: ['인정', '스토브리그 기대', '고생 많았다'] }, '분석'],
  champion: [{ t: ['{T} 한국시리즈 우승!!!', '우승이다!!! {T}'], b: ['{TEXT}. 올해의 주인공은 {T}.'], c: ['울었다 진짜', '우승 굿즈 산다', '이 맛에 야구 본다'] },
    { t: ['우승 기념 글 남긴다', '개막 때 순위 예상한 사람들 나와'], b: ['개막 때 예상 순위 보던 사람들 다 어디 갔냐. 오늘은 그냥 즐기자.'], c: ['평생 기억함', '우승 파티', '내년에도 가자'] }, '실화냐'],
};
/** 특이사항 템플릿 — 사건 기사 1 + 반응 글 1 */
export function localEvent(e: EvRec, f: DayFacts): RawPost[] {
  const r = rng(`ev:${f.seed}:${e.id}`);
  const me = ME.teamId;
  const key = e.kind === 'nohit' ? (e.team === me ? 'nohitMe' : e.mine ? 'nohitUs' : 'nohit') : e.kind === 'comeback' && e.team !== me ? 'comebackL' : e.kind;
  const [a, b, tagB] = EVT[key];
  const series = /(와일드카드 결정전|준플레이오프|플레이오프|한국시리즈)/.exec(e.text)?.[1];
  const v: Vars = {
    T: short(me), X: short(e.team), O: short(e.opp), WHO: e.who, N: e.n, S: e.s ? `${e.s[0]}:${e.s[1]}` : undefined,
    TEXT: e.text.replace(/[.。]$/, ''), DATE: e.date ? shortDate(e.date) : undefined, SER: series,
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
    O: short(f.first?.opp), HA: f.first ? (f.first.home ? '홈' : '원정') : undefined, DATE: f.first ? longDate(f.first.day.date) : undefined,
    SP: sp?.p.name, STAR: star?.p.name, OVR: star?.ovr, WORRY: worry?.p.name, INJ: worry?.inj, FAT: worry?.fat, RIV: f.rival?.name,
  };
  const out: (RawPost | null)[] = [];
  const pr = f.predRank;
  out.push(post('분석', one(r, ['올해 한별 리그 순위 예상해 봄', '개막 전 전력 순위 정리.txt', '올해 우승 후보 누구냐 진지하게'], v),
    one(r, pr === 1 ? ['전력만 보면 우리 {T:이가} 1순위. 리그 단계 {LV:이라}도 해 볼 만하다.'] : ['전력만 보면 {P1}·{P2:이가} 2강. 우리 {T:은는} {PR}위권 예상. 리그 단계 {LV:이라} 만만치 않다.'], v),
    cmts(r, [['예상은 예상일 뿐', '{P1} 진짜 세 보이긴 함', '올해는 다르다', '순위 예상글은 시즌 끝나고 다시 보자', '{T} {PR}위면 선방이지']], v, 3)));
  out.push(post(r() < 0.5 ? '속보' : '단독', one(r, ['개막전 선발 {SP} 유력', '개막전 {O}전 선발은 {SP}'], v),
    one(r, ['{DATE} 개막전, 우리는 {O} 상대로 {HA} 경기. 선발로 {SP:이가} 나설 전망.', '개막전은 {DATE} {O}전({HA}). 첫 경기 선발은 {SP}, 거의 확정이라는 얘기.'], v), cmts(r, [['{SP} 믿는다', '첫 경기부터 잡자', '개막전 직관 간다', '{O} 상대 전적 좋았던가']], v, 2)));
  out.push(post('실화냐', one(r, ['{STAR} 카드 실화냐, 올해 기대된다', '{STAR} 우리 팀인 거 실화?'], v),
    one(r, ['종합 {OVR} {STAR:이가} 우리 라인업에 있다. 이 선수가 중심 잡아 주면 위로 간다.'], v), cmts(r, [['{STAR} 유니폼 산다', '기대치 너무 높이지 말자', '올해 {STAR}의 해', '이름값 해 주자']], v, 3)));
  if (worry?.inj) out.push(post('속보', one(r, ['{WORRY} {INJ}… 개막 엔트리 괜찮냐'], v), one(r, ['{WORRY:이가} {INJ}. 시작부터 변수가 생겼다.'], v), cmts(r, [['무리시키지 마라', '대체 카드 있음?', '빨리 낫자']], v, 2)));
  else if (worry) out.push(post('분석', one(r, ['{WORRY} 피로도 {FAT}, 관리 필요해 보임'], v), one(r, ['캠프 때부터 많이 던졌다는 얘기가 있다. 초반에 무리하면 여름에 탈 난다.'], v), cmts(r, [['관리가 답', '초반엔 아껴 쓰자', '걱정된다']], v, 2)));
  else out.push(post('루머', one(r, ['{T} 개막 직전 깜짝 영입설', '{T} 스카우터 바쁘게 움직인다는 카더라'], v), one(r, ['스카우터가 바쁘게 움직인다는 카더라. 개막 전에 뭔가 터질 수도.'], v), cmts(r, [['카더라는 거르자', '오면 좋고', '출처 어디']], v, 2)));
  if (f.rival && f.first && f.first.opp === f.rival.id) out.push(post('분석', one(r, ['개막전부터 {RIV}ㅋㅋ', '개막전 상대가 하필 {O}'], v), one(r, ['개막전 상대가 하필 라이벌 {O}. 첫 경기부터 분위기 싸움이다.'], v), cmts(r, [['라이벌전은 무조건 이겨야 함', '개막전부터 혈압', '직관 각']], v, 3)));
  else out.push(post('충격', one(r, ['리그 단계 {LV} 실화냐… 다 세 보인다', '올해 상대 팀들 전력 장난 아님'], v), one(r, ['올해 리그 단계는 {LV}. 상대 팀들 전력이 만만치 않다.'], v), cmts(r, [['그래도 해 볼 만하다', '단계 올라가면 보상 좋다', '첫 달 성적이 중요', '쫄지 말자']], v, 2)));
  return out.filter((p): p is RawPost => !!p);
}

/* ═════════════ 시즌 결산 ═════════════ */
export function localClose(f: CloseFacts, seed: string): RawPost[] {
  const r = rng(`close:${seed}:${f.year}:${f.me}`);
  const rows = f.rows;
  const top = rows[0], last = rows[rows.length - 1];
  const ld = f.leaders.slice(0, 3).map((l) => `${l.label} ${pName(l.id) ?? '선수'}(${short(l.team)}) ${l.value}`);
  const seeds = rows.slice(0, POST_SEEDS).map((x) => short(x.teamId));
  const v: Vars = {
    T: short(f.me), R: f.rank, W: f.row.w, D: f.row.d, L: f.row.l,
    X1: short(top?.teamId), W1: top?.w, L1: top?.l, X2: short(rows[1]?.teamId), X3: short(rows[2]?.teamId), X10: short(last?.teamId),
    LD: ld.join(', ') || undefined, N1: pName(f.leaders[0]?.id), N2: pName(f.leaders[1]?.id),
    SER: f.post.stage ? seriesKo(f.post.stage) : undefined,
    S1: seeds[0], S2: seeds[1], S3: seeds[2], S4: seeds[3], S5: seeds[4],
  };
  const out: (RawPost | null)[] = [];
  out.push(post('속보', one(r, ['정규 시즌 끝, {X1} 1위 확정', '{X1} 정규 시즌 1위! 최종 순위 정리'], v), one(r, ['{X1:이가} {W1}승 {L1}패로 1위. 2위 {X2}, 3위 {X3}. 꼴찌는 {X10}.'], v),
    cmts(r, [['{X1} 올해 진짜 셌다', '순위표 박제', '내년엔 다르겠지', '{X10} 팬들 힘내라']], v, 3)));
  out.push(post('분석', one(r, ['MVP 경쟁 정리해 봄', '올해 개인 기록 1위 정리.txt'], v), one(r, ['{LD}. 누가 MVP 받아도 이상하지 않다.'], v),
    cmts(r, [['MVP는 {N1}', '기록만 보면 {N2}', '다 대단하다', '올해 타자 강세네']], v, 3)));
  out.push(f.post.stage
    ? post('실화냐', one(r, ['{T} {R}위로 가을야구 간다!!', '{T} 가을야구 확정ㅋㅋ'], v), one(r, ['{W}승 {D}무 {L}패, 최종 {R}위. {SER}부터 시작이다.'], v), cmts(r, [['가을야구 직관 간다', '여기까지 온 것도 대단', '이제 진짜 시작']], v, 3))
    : post('충격', one(r, ['{T} {R}위로 시즌 끝… 가을야구 탈락', '올해 {T:은는} 여기까지'], v), one(r, ['{W}승 {D}무 {L}패, 최종 {R}위. 올해는 여기까지.'], v), cmts(r, [['내년에 다시', '수고했다 선수들', '스토브리그가 중요하다']], v, 3)));
  out.push(post('분석', one(r, ['가을야구 대진 정리', '포스트시즌 대진 미리 보기'], v), one(r, ['와일드카드 {S4}-{S5}, 준플레이오프 {S3}, 플레이오프 {S2}, 한국시리즈 직행 {S1}.'], v),
    cmts(r, [['{S1} 우승 유력', '업셋 나온다', '가을은 모른다', '와일드카드부터 꿀잼']], v, 3)));
  out.push(f.post.stage
    ? post('루머', one(r, ['{T} 가을야구 앞두고 비밀 훈련설'], v), one(r, ['선수단이 따로 모여 특별 훈련을 한다는 카더라. 단기전 준비는 끝난 듯.'], v), cmts(r, [['카더라지만 믿는다', '단기전은 분위기', '가즈아']], v, 2))
    : f.rank >= 8
      ? post('루머', one(r, ['감독 재계약 여부 촉각'], v), one(r, ['시즌이 끝나자 감독 거취 얘기가 나온다는 카더라. 프런트도 고민 중이라고.'], v), cmts(r, [['한 번만 더 기회를', '바꿀 때 됐다', '카더라는 거르자']], v, 2))
      : post('루머', one(r, ['{T} 스토브리그 큰손 된다는 카더라'], v), one(r, ['아깝게 놓친 가을야구, 겨울에 전력 보강 크게 한다는 소문.'], v), cmts(r, [['제발 사 줘', '불펜부터 보강', '카더라 믿어 본다']], v, 2)));
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
