// 다른 구단 라인업 카드 — 대전(실제 감독 · AI 구단) · 감독 순위 · 리그 팀 순위에서 같이 쓴다.
// 타선 1~9 + 마운드(선발 · 불펜 · 마무리)를 카드로. 카드를 누르면 선수 상세(능력치 탭이 맨 앞 — 선수보관함에서 여는 것과 같은 화면).
//  · 실제 감독: 서버에 올라간 라인업(선수 번호 · 카드 연도 · 종합)에서 실제 선수 카탈로그의 그 카드를 찾아 되살린다(서버엔 등급이 없다)
//  · AI 구단 · 리그 팀: 그 팀의 지금 시즌 선수단(season/rosters) — 카드는 그 해 실제 카드, 내 구단이면 내 카드 그대로
import type { ComponentProps } from 'react';
import { navigate } from '../../app/router';
import { CardMini, cardProps } from '../../cards';
import { CARDS, playerById } from '../../game/mock';
import { cardInst, kboCardsOf, seasonCardOf, viewPlayer } from '../../game/kbo';
import { synthPlayer } from '../../game/starter';
import type { CardInst, GradeId, Player, Pos } from '../../game/types';
import { fromWireId, type PvpLineupItem } from '../../api';
import type { ClubRoster } from '../../season/rosters';
import { cardNow } from '../lineup/ctx';
import { initialLineup, store as lineupStore, unit } from '../lineup/calc';
import s from './TeamLineup.module.css';
import { playerHref } from '../player/href';
import { cardShow, cardViewPlayer, playerShift, shiftPlayer } from '../../game/ovrShow';

type MiniLook = ComponentProps<typeof CardMini>;
export interface LineupCard {
  key: string;
  /** 카드 왼쪽 위 (타순 · 'P') */
  badge: string;
  /** 카드 아래 (포지션 · 선발 · 불펜 · 마무리) */
  pos: string;
  look: MiniLook;
  /** 누르면 갈 선수 상세 주소 (없으면 누를 수 없음) */
  href?: string;
}
export interface LineupCards { bat: LineupCard[]; mound: LineupCard[] }

const POS_SHORT: Record<string, string> = { C: '포수', '1B': '1루', '2B': '2루', '3B': '3루', SS: '유격', LF: '좌익', CF: '중견', RF: '우익', DH: '지명', P: '투수' };
const LEGEND_CLASS = new Set<GradeId>(['legend', 'franchise', 'black', 'signature']);
const VIEW_RE = /^(k[0-9a-z]+)~(\d{4})$/;
/** 선수 화면 주소 — 다른 구단(other)이면 보기 전용 (screens/player/href) */
const hrefOf = (p: Player, card?: { id: string } | null, other = true) => playerHref(p.id, { card: card?.id, other });

/** 카탈로그 카드 찾기 — 같은 선수 · 같은 카드 연도(연도 없는 레전드급은 그 무리) · 종합이 가장 가까운 카드 (한 번 찾은 건 기억) */
const catalogMemo = new Map<string, CardInst | null>();
function catalogCard(kid: string, viewYear: number, y?: number, ovr?: number): CardInst | null {
  const key = `${kid}|${viewYear}|${y ?? ''}|${ovr ?? ''}`;
  if (catalogMemo.has(key)) return catalogMemo.get(key)!;
  const r = findCatalogCard(kid, viewYear, y, ovr);
  catalogMemo.set(key, r);
  return r;
}
function findCatalogCard(kid: string, viewYear: number, y?: number, ovr?: number): CardInst | null {
  const all = kboCardsOf(kid); // 그 선수 카드만 (전체 13,000여 장을 훑지 않게)
  if (!all.length) return null;
  let cands = y != null
    ? all.filter((c) => !LEGEND_CLASS.has(c.grade) && c.year != null && c.year % 100 === y)
    : all.filter((c) => LEGEND_CLASS.has(c.grade));
  if (!cands.length) cands = all.filter((c) => c.view === viewYear);
  if (!cands.length) cands = [...all];
  const best = ovr != null ? cands.reduce((a, b) => (Math.abs(b.ovr - ovr) < Math.abs(a.ovr - ovr) ? b : a)) : cands[0];
  return cardInst(best);
}

/** 그 해 실제 카드 (AI 선수단 선수) — 없으면 등록된 카드 · 없으면 기본 */
function lookOfPlayer(p: Player): { look: MiniLook; card: { id: string } | null } {
  const v = VIEW_RE.exec(p.id);
  const kc = v ? seasonCardOf(v[1], Number(v[2])) : undefined;
  if (kc) { const c = cardInst(kc); return { look: { player: cardViewPlayer(c, p), grade: c.grade, year: c.year, cardId: c.id, signaturePitch: c.signaturePitch ?? null, award: c.award }, card: c }; }
  const legacy = CARDS.find((x) => x.playerId === p.id);
  if (legacy) return { look: { player: cardViewPlayer(legacy, p), grade: legacy.grade, year: legacy.year, cardId: legacy.id }, card: legacy };
  return { look: { player: shiftPlayer(p, playerShift(p.ovr)), grade: 'normal' }, card: null };
}
/** 내 카드 그대로 (강화 · 훈련 · 잠재력 · 지금 종합) */
function lookOfMine(card: CardInst): MiniLook {
  return { ...cardProps(card), ovrShown: cardNow(card)?.ovr };
}

/* ───────── 실제 감독 — 서버에 올라간 라인업 ───────── */
export function cardsFromSnapshot(lineup: PvpLineupItem[]): LineupCards {
  const bat: LineupCard[] = [], mound: LineupCard[] = [];
  lineup.forEach((it, i) => {
    const id = fromWireId(it.id);
    const v = VIEW_RE.exec(id);
    const isP = it.pos === 'SP' || it.pos === 'RP' || it.pos === 'CP' || it.pos === 'P';
    let p: Player | undefined = v ? viewPlayer(v[1], Number(v[2])) : playerById(id);
    // 카탈로그 밖 id(특별 선수 'p-special' 등)는 기기마다 다른 선수 — 이름이 다르면 내 기기의 같은 id 선수로 그리지 않는다
    if (!v && p && it.name && p.name !== it.name) p = undefined;
    let card: CardInst | null = v ? catalogCard(v[1], Number(v[2]), it.y, it.ovr) : null;
    if (p && !card && !v) card = CARDS.find((x) => x.playerId === p!.id) ?? null; // 예전 목업 카드 (등급 그대로)
    if (!p) {
      // 카탈로그에 없는 선수(특별 선수 등) — 이름 · 종합만으로 그린다
      const pos = (isP ? 'P' : it.pos) as Pos;
      p = { ...synthPlayer({ id: `snap-${i}-${it.id}`, teamId: it.c ?? 'dj', pos, role: it.pos === 'SP' ? 'SP' : it.pos === 'CP' ? 'CL' : isP ? 'RP' : undefined, ovr: it.ovr, seed: `snap:${it.id}` }), name: it.name ?? '선수' };
      card = null;
    }
    const special = id === 'p-special' || id === 'p41'; // 특별 선수 — 서버엔 등급이 없어도 ONLY ONE 카드로
    // 화면 눈금 — 카드면 그 등급 구간, 아니면 꺾은선 (it.ovr 은 서버에 올라간 힘 눈금 종합)
    const look: MiniLook = card
      ? { player: cardViewPlayer(card, p), grade: card.grade, year: card.year, cardId: card.id, signaturePitch: card.signaturePitch ?? null, award: card.award, ovrShown: it.ovr, ovrShift: cardShow(card, p.ovr).shift }
      : { player: shiftPlayer(p, playerShift(p.ovr)), grade: special ? 'unique' : 'normal', ovrShown: it.ovr, ovrShift: playerShift(it.ovr) };
    const href = card ? hrefOf(p, card) : undefined;
    if (isP) mound.push({ key: `p${i}`, badge: 'P', pos: it.pos === 'SP' ? '선발' : it.pos === 'CP' ? '마무리' : '불펜', look, href });
    else bat.push({ key: `b${i}`, badge: String(bat.length + 1), pos: POS_SHORT[it.pos] ?? it.pos, look, href });
  });
  // 마운드는 선발 → 마무리 → 불펜
  const order = { 선발: 0, 마무리: 1, 불펜: 2 } as Record<string, number>;
  mound.sort((a, b) => order[a.pos] - order[b.pos]);
  return { bat, mound };
}

/* ───────── AI 구단 · 리그 팀 — 지금 시즌 선수단 ───────── */
function myCardMap(): Map<string, CardInst> {
  const m = new Map<string, CardInst>();
  try {
    const st = lineupStore.get() ?? initialLineup();
    const ids = [...Object.values(st.field), ...st.rotation, ...st.bullpen, st.closer, ...st.bench].filter((x): x is string => !!x);
    // 라인업 자리가 먼저 — 같은 선수의 벤치 카드가 주전 카드를 덮지 않게
    for (const id of ids) { try { const u = unit(id); if (!m.has(u.player.id)) m.set(u.player.id, u.card); } catch { /* 없는 카드 */ } }
  } catch { /* 라인업 없음 */ }
  return m;
}
export function cardsFromRoster(r: ClubRoster): LineupCards {
  const mine = r.mine ? myCardMap() : null;
  const one = (p: Player, key: string, badge: string, pos: string): LineupCard => {
    const card = mine?.get(p.id);
    if (card) return { key, badge, pos, look: lookOfMine(card), href: hrefOf(p, card, false) };
    const { look, card: c } = lookOfPlayer(p);
    return { key, badge, pos, look, href: c ? hrefOf(p, c, !r.mine) : undefined };
  };
  const bat = r.batting.map((b, i) => one(b.player, `b${i}`, String(i + 1), POS_SHORT[b.pos] ?? b.pos));
  const mound: LineupCard[] = [];
  if (r.rotation[0]) mound.push(one(r.rotation[0], 'sp', 'P', '선발'));
  if (r.closer) mound.push(one(r.closer, 'cl', 'P', '마무리'));
  r.bullpen.filter((p) => p && p.id !== r.closer?.id).forEach((p, i) => mound.push(one(p, `rp${i}`, 'P', '불펜')));
  return { bat, mound };
}

/* ───────── 대전 AI 연습 상대 (목업 카드) ───────── */
export function cardsFromMockSide(side: { batting: { order: number; pos: string; card: CardInst; player: Player }[]; sp: { card: CardInst; player: Player }; closer?: { card: CardInst; player: Player } }): LineupCards {
  const look = (c: CardInst): MiniLook => ({ ...cardProps(c) });
  const bat = side.batting.map((b) => ({ key: `b${b.order}`, badge: String(b.order), pos: POS_SHORT[b.pos] ?? b.pos, look: look(b.card), href: hrefOf(b.player, b.card) }));
  const mound: LineupCard[] = [{ key: 'sp', badge: 'P', pos: '선발', look: look(side.sp.card), href: hrefOf(side.sp.player, side.sp.card) }];
  if (side.closer && side.closer.card.id !== side.sp.card.id) mound.push({ key: 'cl', badge: 'P', pos: '마무리', look: look(side.closer.card), href: hrefOf(side.closer.player, side.closer.card) });
  return { bat, mound };
}

/** 카드 격자 — 타선 · 마운드 */
export function TeamLineup({ cards, onOpen }: { cards: LineupCards; onOpen?: () => void }) {
  const grid = (list: LineupCard[]) => (
    <ol className={s.grid}>
      {list.map((c) => (
        <li key={c.key} className={s.cell}>
          <CardMini
            {...c.look}
            badge={c.badge}
            style={{ width: '100%' }}
            onClick={c.href ? () => { onOpen?.(); navigate(c.href!); } : undefined}
          />
          <span className={s.cap}>{c.pos}</span>
        </li>
      ))}
    </ol>
  );
  if (!cards.bat.length && !cards.mound.length) return <p className={s.empty}>저장된 라인업이 없어요</p>;
  return (
    <div className={s.wrap}>
      {cards.bat.length > 0 && <><h3 className={s.h}>타선</h3>{grid(cards.bat)}</>}
      {cards.mound.length > 0 && <><h3 className={s.h}>마운드</h3>{grid(cards.mound)}</>}
    </div>
  );
}
