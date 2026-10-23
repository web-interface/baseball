// 뉴스 판 짜기 — 개막 특집 · 시즌 결산 · 특이사항(AI 또는 템플릿) · 날마다 기사(템플릿)를 날짜별로 묶고,
// 매체 · 기자 · 입력 시각 · 댓글 수, 댓글마다 가린 아이디 · 시각 · 답글 · 공감/비공감은 코드가 붙인다(시드 — 다시 열어도 같은 값).
// 특이사항 기사는 그날 맨 위에. 매체 · 기자는 가상 이름(game/press 의 OUTLETS · REPORTERS), 아이디는 이름이 아닌 무작위 글자.
import {
  FEED_DAYS, OUTLETS, POST_BASE, REPORTERS, closeFacts, closeKey, dayFacts, evKey, eventsOf, isOpenTime, openFacts, openKey, pickOf, rng,
  type DayFacts, type EvRec, type PressSaved, type PressTag, type RawPost,
} from '../../game/press';
import { allDays, isOver, yearOf, type SeasonState } from '../../season/store';
import { longDate, shortDate, startTime } from '../../season/schedule';
import { localClose, localDay, localEvent, localOpen } from './local';

export interface FeedComment {
  /** 가린 아이디 — 앞 네 글자 + '****' ('q7wm****') */
  id: string;
  text: string;
  /** '2시간 전' · '4.11. 22:13' (모르면 '') */
  when: string;
  replies: number;
  up: number;
  down: number;
  /** 공감 많은 위 3개 */
  best: boolean;
}
export interface FeedPost extends RawPost {
  id: string;
  outlet: string;
  reporter: string;
  /** 목록 시각 — 날마다 기사는 그날 경기 끝난 뒤 시각('21:47'), 특집은 날짜('3.26') */
  when: string;
  /** 기사 입력 시각 — '2027.04.12. 21:47' */
  stamp: string;
  /** 전체 댓글 수 (보이는 건 순공감순 위쪽 몇 개) */
  total: number;
  /** 보이는 댓글 — 공감 많은 순 */
  cmts: FeedComment[];
  /** 특이사항 기사 (그날 맨 위) */
  lead: boolean;
}
export interface FeedSection { key: string; label: string; posts: FeedPost[]; loading: boolean }

/** 댓글 수 범위 (분류마다 — 묶음 boost 를 곱한다) */
const HEAT: Record<PressTag, [number, number]> = { 속보: [40, 220], 충격: [80, 420], 화제: [60, 320], 단독: [50, 260], 분석: [12, 90], 이슈: [40, 260] };
/** 비공감 비율 (공감 대비) — 이슈 기사 댓글은 갈린다 */
const DOWN: Record<PressTag, [number, number]> = { 속보: [0.02, 0.16], 충격: [0.04, 0.26], 화제: [0.02, 0.14], 단독: [0.03, 0.2], 분석: [0.02, 0.12], 이슈: [0.08, 0.45] };

/* ───────── 가린 아이디 — 앞 네 글자(소문자 · 숫자) + '****' ───────── */
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
/** 우연히 만들어지면 안 되는 글자 묶음 — 실제 구단 · 방송사 · 커뮤니티 약칭, 흔한 성씨 로마자(이름처럼 보이지 않게), 욕설 */
const ID_BAD = /lg|nc|kt|sk|ob|dc|fm|ssg|kia|kbo|kbs|sbs|mbc|ebs|mlb|daum|nate|kim|lee|park|choi|jung|kang|cho|yoon|jang|lim|shin|kwon|hwang|song|jeon|hong|moon|baek|sex|fuc|fuk|ass|shi|dic|sib|ssi|tlq|qud|gay|fag/;
function maskId(r: () => number): string {
  for (let t = 0; t < 16; t++) {
    let s = LETTERS[Math.floor(r() * 26)];
    for (let i = 1; i < 4; i++) s += r() < 0.3 ? DIGITS[Math.floor(r() * 10)] : LETTERS[Math.floor(r() * 26)];
    if (!ID_BAD.test(s)) return `${s}****`;
  }
  return 'qx7v****';
}

/* ───────── 시각 ───────── */
/** 올린 때 — date 그날('2027-04-12', 모르면 ''), min 그날 몇 분부터(여기서 2시간 반 안쪽), label 목록에 보일 글자(없으면 'HH:MM') */
interface When { date: string; min: number; label?: string }
const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (m: number) => `${pad(Math.floor(m / 60) % 24)}:${pad(Math.floor(m % 60))}`;
/** 그날 0시의 절대 분 (1970년부터) */
const dayAbs = (date: string) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / 60000;
/** 절대 분 → '2027.04.12. 21:47' (long) · '4.12. 21:47' */
function stampOf(abs: number, long: boolean): string {
  const d = new Date(abs * 60000);
  const day = long ? `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())}.` : `${d.getUTCMonth() + 1}.${d.getUTCDate()}.`;
  return `${day} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
/** 댓글 시각 — 하루 안이면 '방금 전' · 'N분 전' · 'N시간 전', 그보다 오래면 날짜 */
function ago(now: number, at: number): string {
  if (!Number.isFinite(now) || !Number.isFinite(at)) return '';
  const d = Math.max(0, Math.round(now - at));
  if (d < 1) return '방금 전';
  if (d < 60) return `${d}분 전`;
  if (d < 24 * 60) return `${Math.floor(d / 60)}시간 전`;
  return stampOf(at, false);
}
/** 그날 경기 끝 무렵 (시작 + 3시간) */
const afterGame = (date: string) => { const t = startTime(date); return Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) + 180; };

/** 기사 하나 꾸미기 — track(댓글, 절대 분): 판을 다 짠 뒤 '지금'을 정해 댓글 시각 글자를 채운다 */
function decorate(key: string, i: number, p: RawPost, boost: number, lead: boolean, at: When, track: (c: FeedComment, abs: number) => void): FeedPost & { abs: number } {
  const r = rng(`deco:${key}:${i}`);
  const min = Math.min(23 * 60 + 59, at.min + Math.floor(r() * 150));
  const abs = at.date ? dayAbs(at.date) + min : NaN;
  const [lo, hi] = HEAT[p.tag] ?? HEAT.속보;
  const [d0, d1] = DOWN[p.tag] ?? DOWN.속보;
  const total = p.comments.length ? Math.max(p.comments.length, Math.round((lo + r() * (hi - lo)) * boost)) : 0;
  let up = Math.round(total * (0.9 + r() * 3.1)) + 3;
  const cmts: FeedComment[] = p.comments.map((text, k) => {
    const c: FeedComment = {
      id: maskId(r), text, when: '',
      replies: Math.round(r() * (k === 0 ? Math.min(60, 3 + total * 0.15) : Math.min(25, 1 + total * 0.06))),
      up, down: Math.round(up * (d0 + r() * (d1 - d0))), best: k < 3,
    };
    track(c, abs + 2 + Math.floor(r() * 140));
    up = Math.max(1, Math.round(up * (0.35 + r() * 0.45)));
    return c;
  });
  return {
    ...p, id: `${key}:${i}`, outlet: pickOf(r, OUTLETS), reporter: pickOf(r, REPORTERS),
    when: at.label ?? hhmm(min), stamp: Number.isFinite(abs) ? stampOf(abs, true) : at.label ?? '',
    total, cmts, lead: lead && i === 0, abs,
  };
}
interface Group { key: string; posts: RawPost[]; boost: number; lead: boolean; loading: boolean }
const bigFirst = (a: EvRec, b: EvRec) => Number(b.big) - Number(a.big) || Number(b.mine) - Number(a.mine);

/**
 * 뉴스 판 — limit 기사 수까지.
 *  · 개막 전(내 첫 경기 전): 개막 특집
 *  · 시즌 중: 마지막으로 친 날부터 FEED_DAYS 날 — 날마다 특이사항(맨 위) + 템플릿 기사. 첫 3경기 동안은 개막 특집을 아래에
 *  · 정규 시즌 끝: 가을야구 특이사항 · 시즌 결산 · 마지막 날
 * busy(k): 그 자리 AI 글을 만드는 중(또는 곧 만듦) — 템플릿 대신 '올라오는 중'
 * 댓글 시각의 '지금'은 판에서 가장 늦은 기사 + 2시간 반 (같은 판이면 늘 같은 글자)
 */
export function buildFeed(s: SeasonState, sv: PressSaved, limit: number, busy: (key: string) => boolean): FeedSection[] {
  const out: FeedSection[] = [];
  let left = Math.max(1, limit);
  const year = yearOf(s);
  let latest = -Infinity;
  const stamps: [FeedComment, number][] = [];
  const track = (c: FeedComment, abs: number) => { stamps.push([c, abs]); };
  const add = (key: string, label: string, groups: Group[], at: When) => {
    if (left <= 0) return;
    const posts: FeedPost[] = [];
    let loading = false;
    for (const g of groups) {
      if (g.loading) { loading = true; continue; }
      g.posts.forEach((p, i) => {
        if (left <= 0) return;
        const { abs, ...post } = decorate(g.key, i, p, g.boost, g.lead, at, track);
        if (Number.isFinite(abs)) latest = Math.max(latest, abs);
        posts.push(post);
        left--;
      });
    }
    if (posts.length || loading) out.push({ key, label, posts, loading });
  };
  const moment = (k: string, local: () => RawPost[]): Group => {
    const ai = sv.news[k]?.posts;
    if (ai?.length) return { key: k, posts: ai, boost: 1.5, lead: false, loading: false };
    if (busy(k)) return { key: k, posts: [], boost: 1, lead: false, loading: true };
    return { key: k, posts: local(), boost: 1.2, lead: false, loading: false };
  };
  const evGroup = (e: EvRec, f: DayFacts): Group => {
    const k = evKey(s.seed, e.id);
    const ai = sv.news[k]?.posts;
    if (ai?.length) return { key: k, posts: ai, boost: e.big ? 1.8 : 1.4, lead: true, loading: false };
    if (busy(k)) return { key: k, posts: [], boost: 1, lead: true, loading: true };
    return { key: k, posts: localEvent(e, f), boost: e.big ? 1.6 : 1.3, lead: true, loading: false };
  };
  const evs = eventsOf(s, sv);
  const dayBlock = (d: number, n: number) => {
    if (d < 0 || !allDays(s)[d]) return;
    const f = dayFacts(s, d);
    const dayEvs = evs.filter((e) => e.day === d).sort(bigFirst);
    const skip = new Set(dayEvs.map((e) => e.kind));
    add(`d${d}`, longDate(f.date), [...dayEvs.map((e) => evGroup(e, f)), { key: `day:${s.seed}:${d}`, posts: localDay(f, n, skip), boost: 1, lead: false, loading: false }], { date: f.date, min: afterGame(f.date) });
  };
  const openGroup = () => moment(openKey(year), () => localOpen(openFacts(s), s.seed));
  /** 개막 특집 기사는 개막 전날 오전 */
  const openWhen = (): When => {
    const d0 = allDays(s)[0]?.date;
    if (!d0) return { date: '', min: 0, label: '개막 전' };
    const t = new Date(Date.UTC(Number(d0.slice(0, 4)), Number(d0.slice(5, 7)) - 1, Number(d0.slice(8, 10))) - 86400000);
    const date = `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
    return { date, min: 9 * 60 + 30, label: shortDate(date) };
  };
  if (isOver(s)) {
    const last = s.next - 1;
    const lf = dayFacts(s, Math.max(0, last));
    for (const e of evs.filter((x) => x.day >= POST_BASE).sort((a, b) => b.day - a.day)) {
      add(`post:${e.id}`, `${e.date ? longDate(e.date) : ''} · 가을야구`, [evGroup(e, lf)], e.date ? { date: e.date, min: afterGame(e.date) } : { date: '', min: 0, label: '가을야구' });
    }
    add('close', '시즌 결산', [moment(closeKey(year), () => localClose(closeFacts(s), s.seed))], lf.date ? { date: lf.date, min: afterGame(lf.date) + 60, label: shortDate(lf.date) } : { date: '', min: 0, label: '결산' });
    dayBlock(last, 2);
  } else if (isOpenTime(s)) {
    add('open', '개막 특집', [openGroup()], openWhen());
    for (let d = s.next - 1; d >= Math.max(0, s.next - 2); d--) dayBlock(d, 2); // 내 개막전이 비로 밀린 날 다른 구장 소식
  } else {
    for (let d = s.next - 1; d >= Math.max(0, s.next - FEED_DAYS) && left > 0; d--) dayBlock(d, d === s.next - 1 ? 3 : 2);
    if (left > 0 && s.my.length <= 3) add('open', '개막 특집', [openGroup()], openWhen());
  }
  // 댓글 시각 — '지금'은 가장 늦은 기사 + 150분 (댓글은 기사 뒤 142분 안이라 늘 지난 시각)
  const now = latest + 150;
  for (const [c, abs] of stamps) c.when = ago(now, abs);
  return out;
}
