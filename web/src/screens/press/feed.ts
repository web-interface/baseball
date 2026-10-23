// 뉴스 판 짜기 — 개막 특집 · 시즌 결산 · 특이사항(AI 또는 템플릿) · 날마다 뉴스(템플릿)를 날짜별로 묶고,
// 글쓴이 · 조회 · 추천 · 댓글 수는 코드가 붙인다(시드 — 다시 열어도 같은 숫자). 특이사항 글은 그날 맨 위에.
import { ME, teamById } from '../../game/mock';
import {
  FEED_DAYS, POST_BASE, closeFacts, closeKey, dayFacts, evKey, eventsOf, isOpenTime, openFacts, openKey, pickOf, rng,
  type DayFacts, type EvRec, type PressSaved, type PressTag, type RawPost,
} from '../../game/press';
import { allDays, isOver, yearOf, type SeasonState } from '../../season/store';
import { longDate, shortDate, startTime } from '../../season/schedule';
import { localClose, localDay, localEvent, localOpen } from './local';

export interface FeedComment { by: string; text: string; up: number }
export interface FeedPost extends RawPost {
  id: string;
  by: string;
  views: number; up: number; down: number;
  /** 전체 댓글 수 (보이는 건 베스트 댓글) */
  total: number;
  best: FeedComment[];
  /** 개념글 — 추천이 많은 글 */
  hot: boolean;
  /** 특이사항 기사 (그날 맨 위) */
  lead: boolean;
  /** 올린 때 — 날마다 글은 그날 경기 끝난 뒤 시각('21:47'), 특집은 날짜('3.26') */
  when: string;
}
export interface FeedSection { key: string; label: string; posts: FeedPost[]; loading: boolean }

const NICKS = [
  '직관러', '방구석감독', '외야석고인물', '불펜걱정러', '삼진수집가', '9회말요정', '응원단장', '덕아웃막내', '스코어북', '내야땅볼',
  '파울볼수집', '번트장인', '1루석단골', '치맥러', '홈런볼', '데이터덕후', '배트보이', '시즌권', '우천취소요정', '야알못탈출',
  '빠던장인', '도루왕지망생', '전광판', '구속측정기', '외야펜스', '응원가장인', '야구는과학', '병살싫어', '볼넷골라', '선발예고봄',
];
function handle(r: () => number, team: string): string {
  const x = r();
  if (x < 0.22) return `ㅇㅇ(${100 + Math.floor(r() * 123)}.${Math.floor(r() * 250)})`;
  if (x < 0.4) { const t = teamById(team).short; return pickOf(r, [`${t}17년차`, `${t}찐팬`, `${t}평생팬`, `직관${t}`, `${t}만세`, `${t}응원단`]); }
  return pickOf(r, NICKS) + (r() < 0.3 ? String(10 + Math.floor(r() * 90)) : '');
}
/** 조회수 범위 (말머리마다) */
const VIEW: Record<PressTag, [number, number]> = { 속보: [2500, 9000], 충격: [3000, 12000], 실화냐: [1500, 7000], 단독: [2000, 8000], 분석: [800, 3500], 루머: [1200, 6000] };
/** 올린 때 — at: 분(그날 경기 끝 무렵부터 2시간 반 안쪽) 또는 날짜 글자 */
type When = { min: number } | { text: string };
const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
/** 그날 경기 끝 무렵 (시작 + 3시간) */
const afterGame = (date: string) => { const t = startTime(date); return Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) + 180; };
function decorate(key: string, i: number, p: RawPost, boost: number, lead: boolean, at: When): FeedPost {
  const r = rng(`deco:${key}:${i}`);
  const when = 'text' in at ? at.text : hhmm(Math.min(23 * 60 + 59, at.min + Math.floor(r() * 150)));
  const team = ME.teamId;
  const [lo, hi] = VIEW[p.tag];
  const views = Math.round((lo + r() * (hi - lo)) * boost);
  const up = Math.round(views * (0.015 + r() * 0.055));
  const downRate = p.tag === '분석' ? 0.03 + r() * 0.12 : p.tag === '루머' ? 0.3 + r() * 0.6 : 0.06 + r() * 0.34;
  const down = Math.round(up * downRate);
  const total = Math.max(p.comments.length, Math.round(views * (0.004 + r() * 0.016)));
  const ups = p.comments.map(() => Math.round(3 + r() * Math.min(160, Math.max(4, up * 0.6)))).sort((a, b) => b - a);
  return {
    ...p, id: `${key}:${i}`, by: handle(r, team), views, up, down, total,
    best: p.comments.map((text, k) => ({ by: handle(r, team), text, up: ups[k] })),
    hot: false,
    lead: lead && i === 0, when,
  };
}
interface Group { key: string; posts: RawPost[]; boost: number; lead: boolean; loading: boolean }
const bigFirst = (a: EvRec, b: EvRec) => Number(b.big) - Number(a.big) || Number(b.mine) - Number(a.mine);

/**
 * 뉴스 판 — limit 글 수까지.
 *  · 개막 전(내 첫 경기 전): 개막 특집
 *  · 시즌 중: 마지막으로 친 날부터 FEED_DAYS 날 — 날마다 특이사항(맨 위) + 템플릿 뉴스. 첫 3경기 동안은 개막 특집을 아래에
 *  · 정규 시즌 끝: 가을야구 특이사항 · 시즌 결산 · 마지막 날
 * busy(k): 그 자리 AI 글을 만드는 중(또는 곧 만듦) — 템플릿 대신 '올라오는 중'
 */
export function buildFeed(s: SeasonState, sv: PressSaved, limit: number, busy: (key: string) => boolean): FeedSection[] {
  const out: FeedSection[] = [];
  let left = Math.max(1, limit);
  const year = yearOf(s);
  const add = (key: string, label: string, groups: Group[], at: When) => {
    if (left <= 0) return;
    const posts: FeedPost[] = [];
    let loading = false;
    for (const g of groups) {
      if (g.loading) { loading = true; continue; }
      g.posts.forEach((p, i) => { if (left > 0) { posts.push(decorate(g.key, i, p, g.boost, g.lead, at)); left--; } });
    }
    // 개념글 — 그 묶음에서 추천이 가장 많은 글 하나만 (추천 200 넘을 때)
    const best = posts.reduce<FeedPost | null>((b, p) => (!b || p.up > b.up ? p : b), null);
    if (best && best.up >= 200) best.hot = true;
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
    add(`d${d}`, longDate(f.date), [...dayEvs.map((e) => evGroup(e, f)), { key: `day:${s.seed}:${d}`, posts: localDay(f, n, skip), boost: 1, lead: false, loading: false }], { min: afterGame(f.date) });
  };
  const openGroup = () => moment(openKey(year), () => localOpen(openFacts(s), s.seed));
  /** 개막 특집 글은 개막 전날 */
  const openWhen = (): When => {
    const d0 = allDays(s)[0]?.date;
    if (!d0) return { text: '개막 전' };
    const t = Date.UTC(Number(d0.slice(0, 4)), Number(d0.slice(5, 7)) - 1, Number(d0.slice(8, 10))) - 86400000;
    const dt = new Date(t);
    return { text: `${dt.getUTCMonth() + 1}.${dt.getUTCDate()}` };
  };
  if (isOver(s)) {
    const last = s.next - 1;
    const lf = dayFacts(s, Math.max(0, last));
    for (const e of evs.filter((x) => x.day >= POST_BASE).sort((a, b) => b.day - a.day)) {
      add(`post:${e.id}`, `${e.date ? longDate(e.date) : ''} · 가을야구`, [evGroup(e, lf)], e.date ? { min: afterGame(e.date) } : { text: '가을야구' });
    }
    add('close', '시즌 결산', [moment(closeKey(year), () => localClose(closeFacts(s), s.seed))], { text: lf.date ? shortDate(lf.date) : '결산' });
    dayBlock(last, 2);
  } else if (isOpenTime(s)) {
    add('open', '개막 특집', [openGroup()], openWhen());
    for (let d = s.next - 1; d >= Math.max(0, s.next - 2); d--) dayBlock(d, 2); // 내 개막전이 비로 밀린 날 다른 구장 소식
  } else {
    for (let d = s.next - 1; d >= Math.max(0, s.next - FEED_DAYS) && left > 0; d--) dayBlock(d, d === s.next - 1 ? 3 : 2);
    if (left > 0 && s.my.length <= 3) add('open', '개막 특집', [openGroup()], openWhen());
  }
  return out;
}
