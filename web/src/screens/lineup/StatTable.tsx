// 전력표 공용 조각 — 타순 탭 · 투수진 탭이 같이 쓴다 (마구마구 '세트덱 종합'처럼 선수를 열로 세운 표).
//   StatGrid  왼쪽 이름 칸(옆으로 밀어도 붙어 있음) + 묶음 띠 + 선수 열. 휴대폰은 가로 스크롤(마우스 휠은 ui/wheelX), 넓은 화면은 한 번에
//   StatCol   선수 한 열 (subgrid — 줄 높이가 열마다 같다)
//   cellsOf   대표 능력치 칸 — 카드 앞면과 같은 계산: 기본 = cardProps 의 대표 능력치(등급 몫 + 화면 눈금 몫),
//             더해진 값 = 라인업 계산의 bonus.total(강화 · 훈련 · 잠재력 · 플레이스타일 · 세트덱 — game/cardBonus)을 반올림해 더한다
//   StatCells · PotCell · MarksCell · ChemLine · AvgCards · AvgTable
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CardMini, cardProps, trainLvOf } from '../../cards';
import { Icon, fmt } from '../../ui';
import { PotBadge } from '../../ui/PotBadge';
import { SRC_KO, type BonusSrc } from '../../game/cardBonus';
import type { GradeId } from '../../game/types';
import { fxText, shownPotOf, tierMark } from '../../game/potential';
import { LEVEL_KO, type Level, type Link, type Unit, type UnitEval } from './calc';
import { prefersReduced } from './hooks';
import s from './StatTable.module.css';

export const cx = (...a: (string | false | null | undefined | 0)[]) => a.filter(Boolean).join(' ');
export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/* ───────── 능력치 줄 ───────── */
/** 줄 하나 — k 가 없으면 alt 코드로 (포수 블로킹 · 불펜 회복). tag = 다른 코드일 때 칸 안에 이름을 작게 */
export interface StatRow { k: string; ko: string; code?: string; alt?: string; tag?: boolean }
/** 타자 — 포수는 수비 줄에 블로킹, 송구 줄에 도루저지 (game/sets 의 수비 · 송구 묶음과 같은 짝) */
export const BAT_ROWS: StatRow[] = [
  { k: 'CON', ko: '컨택' },
  { k: 'POW', ko: '파워' },
  { k: 'EYE', ko: '선구' },
  { k: 'SPD', ko: '주루' },
  { k: 'DEF', ko: '수비', alt: 'BLK', tag: true },
  { k: 'ARM', ko: '송구', alt: 'CS', tag: true },
];
/** 투수 — 선발은 체력, 불펜 · 마무리는 회복 (game/kbo 대표 능력치) */
export const PIT_ROWS: StatRow[] = [
  { k: 'VEL', ko: '구속' },
  { k: 'STF', ko: '구위' },
  { k: 'BRK', ko: '변화' },
  { k: 'CTL', ko: '제구' },
  { k: 'STA', ko: '체력·회복', code: 'STA/REC', alt: 'REC' },
  { k: 'MNT', ko: '위기관리' },
];

export interface Cell { code: string; ko: string; base: number; up: number; total: number; why: string }
export type Cells = Partial<Record<string, Cell>>;

/** 선수 한 명의 능력치 칸 — 카드 앞면 숫자(faceVal)와 같은 값 */
export function cellsOf(u: Unit, ue: UnitEval | undefined, rows: StatRow[]): Cells {
  const cp = cardProps(u.card);
  const up = ue?.bonus?.total ?? cp.faceUp ?? {};
  const parts = ue?.bonus?.parts ?? {};
  const out: Cells = {};
  for (const row of rows) {
    const f = cp.player.face.find((x) => x.code === row.k) ?? (row.alt ? cp.player.face.find((x) => x.code === row.alt) : undefined);
    if (!f) continue;
    const add = Math.round(up[f.code] ?? 0);
    const why = (Object.entries(parts) as [BonusSrc, Record<string, number> | undefined][])
      .filter(([src]) => src !== 'grade')
      .map(([src, o]) => [SRC_KO[src], Math.round(o?.[f.code] ?? 0)] as const)
      .filter(([, v]) => v !== 0)
      .map(([k, v]) => `${k} +${v}`)
      .join(' · ');
    out[row.k] = { code: f.code, ko: f.ko, base: f.v, up: add, total: f.v + add, why };
  }
  return out;
}

export interface Avg { v: number; up: number; n: number }
/** 줄마다 평균 — 위 열의 숫자 그대로 (그 능력치가 없는 칸은 빼고) */
export function avgOf(list: Cells[], rows: StatRow[]): Record<string, Avg | null> {
  return Object.fromEntries(rows.map(({ k }) => {
    const xs = list.map((c) => c[k]).filter((x): x is Cell => !!x);
    return [k, xs.length ? { v: mean(xs.map((x) => x.total)), up: mean(xs.map((x) => x.up)), n: xs.length } : null];
  }));
}

/** 숫자 색 — 100 을 넘으면 10 단위 색, 더해진 값이 있으면 오름 색 (카드 앞면과 같은 규칙) */
/** 숫자 색 — 사용자 지시 10-26 "70이하 · 80이하 · 90이하 · 100이하 · 그 이상 다르게" (더해진 값은 막대 빗금 · +n 으로 따로 보인다) */
export const tone = (t: number) => (t > 100 ? s.v5 : t > 90 ? s.v4 : t > 80 ? s.v3 : t > 70 ? s.v2 : s.v1);
/** 막대 끝 — 100 을 넘는 카드도 있어서 조금 넉넉하게 */
const BAR_MAX = 120;
const pct = (v: number) => `${Math.max(0, Math.min(100, (v / BAR_MAX) * 100))}%`;

/* ───────── 표 틀 ───────── */
export interface GridRow { label: ReactNode; kind?: 'band' | 'head' | 'card' | 'stat' | 'more' }
export interface Band { key: string; from: number; to: number; className?: string; children: ReactNode }

/** 열이 자리를 바꾸면 원래 자리에서 옆으로 미끄러져 온다 (FLIP — 가로). [data-flip] 키로 잰다 */
function useFlipX(ref: React.RefObject<HTMLElement | null>, key: string) {
  const last = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const host = ref.current;
    if (!host) return;
    const els = host.querySelectorAll<HTMLElement>('[data-flip]');
    const x0 = host.getBoundingClientRect().left;
    const now = new Map<string, number>();
    els.forEach((el) => now.set(el.dataset.flip!, el.getBoundingClientRect().left - x0));
    if (!prefersReduced()) {
      els.forEach((el) => {
        const before = last.current.get(el.dataset.flip!);
        const after = now.get(el.dataset.flip!)!;
        if (before == null || Math.abs(before - after) < 1) return;
        el.animate?.([{ transform: `translateX(${before - after}px)` }, { transform: 'translateX(0)' }], { duration: 320, easing: 'cubic-bezier(.2,.7,.2,1)' });
      });
    }
    last.current = now;
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function StatGrid({ n, rows, bands, picking, flipKey, children }: {
  /** 선수 열 수 */
  n: number;
  /** 줄 이름 (첫 줄 = 묶음 띠) */
  rows: GridRow[];
  bands: Band[];
  picking?: boolean;
  /** 바뀌면 열 미끄러짐을 잰다 */
  flipKey: string;
  children: ReactNode;
}) {
  const grid = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  useFlipX(grid, flipKey);
  // 옆으로 밀 수 있는지 — 왼쪽 이름 칸 경계선 · 오른쪽 흐림
  const [edge, setEdge] = useState({ l: false, r: false });
  const measure = () => {
    const el = scroller.current;
    if (!el) return;
    const l = el.scrollLeft > 2;
    const r = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setEdge((e) => (e.l === l && e.r === r ? e : { l, r }));
  };
  useLayoutEffect(() => {
    measure();
    const el = scroller.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const tpl = rows.map((r) => (r.kind === 'stat' ? 'var(--stat-h)' : 'auto')).join(' ');
  return (
    <div className={cx(s.frame, edge.l && s.scrolled, edge.r && s.more)}>
      <div ref={scroller} className={s.scroll} onScroll={measure}>
        <div ref={grid} className={cx(s.grid, picking && s.picking, n <= 10 && s.roomy)} style={{ ['--n' as string]: n, gridTemplateRows: tpl } as CSSProperties}>
          <div className={s.labels} aria-hidden>
            {rows.map((r, i) => <span key={i} className={cx(s.lab, r.kind && s['lab-' + r.kind])}>{r.label}</span>)}
          </div>
          {bands.map((b) => (
            <div key={b.key} className={cx(s.band, b.className)} style={{ gridColumn: `${b.from + 2} / ${b.to + 3}` }}>{b.children}</div>
          ))}
          {children}
        </div>
      </div>
      <i className={s.fade} aria-hidden />
    </div>
  );
}

/** 줄 이름 — 능력치는 이름 + 작은 코드 */
export const statRows = (rows: StatRow[]): GridRow[] => rows.map((r) => ({ kind: 'stat', label: <>{r.ko}<small>{r.code ?? r.k}</small></> }));

/** 선수 한 열 */
export function StatCol({ flip, label, grade, className, onClick, children }: {
  flip: string;
  label: string;
  grade?: GradeId;
  className?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <div data-flip={flip} role="group" aria-label={label} className={cx(s.col, !grade && s.emptyCol, className)}
      style={grade ? ({ ['--gr' as string]: `var(--gr-${grade})` } as CSSProperties) : undefined} onClick={onClick}>
      {children}
    </div>
  );
}

/** 작은 카드 칸 — 누르면 열의 onClick (선수 정보 · 바꾸기) */
export function CardCell({ u, ue, label, empty }: { u: Unit | null; ue?: UnitEval; label: string; empty: string }) {
  return (
    <div className={s.card}>
      <button type="button" className={s.cardBtn} aria-label={label}>
        {u ? (
          <CardMini {...cardProps(u.card)} ovrShown={ue ? Math.round(ue.total) : undefined} style={{ width: '100%' }} />
        ) : (
          <span className={s.empty}><Icon name="plus" size={18} /><small>{empty}</small></span>
        )}
      </button>
    </div>
  );
}

/** 능력치 칸들 — 막대: 기본 + 더해진 값(빗금). 없는 능력치는 none(row) 글 */
export function StatCells({ rows, cells, none }: { rows: StatRow[]; cells: Cells; none?: (r: StatRow) => string }) {
  return (
    <>
      {rows.map((r) => {
        const x = cells[r.k];
        if (!x) return <div key={r.k} className={cx(s.stat, s.none)}><span className={s.sr}>{r.ko} </span>{none?.(r) ?? ''}</div>;
        const alt = r.tag && x.code !== r.k;
        return (
          <div key={r.k} className={cx(s.stat, alt && s.alt)} title={`${x.ko} ${x.total}${x.up ? ` = 기본 ${x.base} + ${x.why || `더해진 값 ${x.up}`}` : ''}`}>
            <span className={s.sr}>{x.ko} </span>
            {alt && <span className={s.altTag} aria-hidden>{x.ko}</span>}
            <span className={s.bar} aria-hidden>
              <i className={s.base} style={{ width: pct(Math.min(x.base, x.total)) }} />
              {x.up > 0 && <i className={s.plus} style={{ left: pct(x.base), width: `calc(${pct(x.total)} - ${pct(x.base)})` }} />}
            </span>
            <b className={cx('num', s.val, tone(x.total))}>{x.total}</b>
            {x.up > 0 && <em className={cx('num', s.upNum)}>+{x.up}</em>}
          </div>
        );
      })}
    </>
  );
}

/** 잠재력 칸 — 별 배지 + 별명 (별 셋이 꺼졌으면 흐리게 '꺼짐') */
export function PotCell({ u, ue }: { u: Unit | null; ue?: UnitEval }) {
  const pot = u ? shownPotOf(u.card, u.player) : null;
  const off = !!pot && pot.tier === 'S' && !!ue?.potOff;
  return (
    <div className={cx(s.pot, off && s.potOff)}
      title={pot ? `잠재력 ${tierMark(pot.tier)} ${pot.name} · ${off ? '꺼짐 (별 셋은 엔트리에서 2명만)' : fxText(pot.fx)}` : undefined}>
      {pot ? (
        <>
          <PotBadge tier={pot.tier} size="xs" off={off} />
          <b className={s.potName}>{pot.name}</b>
          {off && <em className={s.offTag}>꺼짐</em>}
        </>
      ) : u ? <small className={s.dim}>없음</small> : null}
    </div>
  );
}

/** 강화 · 훈련 단계 칸 */
export function MarksCell({ u }: { u: Unit | null }) {
  const tl = u ? trainLvOf(u.card) : 0;
  const enh = u?.card.enhance ?? 0;
  return (
    <div className={s.marks}>
      {enh > 0 && <span className={cx(s.chip, enh >= 5 && s.enhHi, enh >= 10 && s.enhMax)} title={`강화 ${fmt.roman(enh)}`}>강화 <span className="num">{fmt.roman(enh)}</span></span>}
      {tl > 0 && <span className={cx(s.chip, tl >= 5 && s.trLit, tl >= 10 && s.trMax)} title={`훈련 ${tl}단계`}>{tl >= 10 ? '훈련 MAX' : <>훈련 <span className="num">{tl}</span></>}</span>}
      {u && !enh && !tl && <small className={s.dim}>—</small>}
    </div>
  );
}

/** 케미 표시 — 이름 + 짧은 선 견본 + 단계 */
export function ChemLine({ link, label }: { link: Link | null | undefined; label: string }) {
  if (!link) return null;
  return (
    <span className={s.chemMark} title={`${label} 케미 ${LEVEL_KO[link.level as Level]} — ${link.why.join(' · ') || '공통점 없음'}`}>
      <small>{label}</small>
      <span className={s.chemLv}>
        <svg width="16" height="8" viewBox="0 0 16 8" aria-hidden className={s['m' + link.level]}><path d="M1 4h14" /></svg>
        <b className={s['t' + link.level]}>{LEVEL_KO[link.level as Level]}</b>
      </span>
    </span>
  );
}
/** 케미 글자 색 (묶음 띠 안) */
export const chemTone = (lv: Level) => s['t' + lv];

/* ───────── 평균 ───────── */
const AvgNum = ({ a }: { a: { v: number; up: number } | null }) => (
  <>
    <b className={cx('num-display', a && tone(Math.round(a.v)))}>{a ? Math.round(a.v) : '—'}</b>
    {a && Math.round(a.up) > 0 && <small className="num">+{Math.round(a.up)}</small>}
  </>
);

/** 평균 띠 (한 묶음) — 능력치 칸 + 묶음 평균 칸(강조) */
export function AvgCards({ title, sub, rows, avg, extra = [] }: {
  title: string;
  sub?: ReactNode;
  rows: StatRow[];
  avg: Record<string, Avg | null>;
  extra?: { k: string; ko: string; v: { v: number; up: number } | null }[];
}) {
  return (
    <section className={s.avg} aria-label={title}>
      <h3 className={s.avgHead}><b>{title}</b>{sub && <small>{sub}</small>}</h3>
      <dl className={s.avgList}>
        {rows.map((r) => (
          <div key={r.k} className={s.avgCell} title={avg[r.k] ? `${r.ko} 평균 · ${avg[r.k]!.n}명` : undefined}>
            <dt>{r.ko}</dt>
            <dd><AvgNum a={avg[r.k]} /></dd>
          </div>
        ))}
        {extra.map((m) => (
          <div key={m.k} className={cx(s.avgCell, s.combo)}>
            <dt>{m.ko}</dt>
            <dd><AvgNum a={m.v} /></dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** 평균 표 (여러 묶음) — 줄 = 묶음(선발 · 불펜 · 전체), 칸 = 능력치 */
export function AvgTable({ title, rows, groups }: {
  title: string;
  rows: StatRow[];
  groups: { k: string; ko: string; n: number; avg: Record<string, Avg | null>; strong?: boolean }[];
}) {
  return (
    <section className={s.avg} aria-label={title}>
      <h3 className={s.avgHead}><b>{title}</b></h3>
      <table className={s.avgTable}>
        <thead>
          <tr>
            <th scope="col"><span className={s.sr}>묶음</span></th>
            {rows.map((r) => <th key={r.k} scope="col">{r.ko}</th>)}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.k} className={g.strong ? s.avgStrong : undefined}>
              <th scope="row">{g.ko}<small className="num">{g.n}명</small></th>
              {rows.map((r) => <td key={r.k}><AvgNum a={g.avg[r.k]} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
