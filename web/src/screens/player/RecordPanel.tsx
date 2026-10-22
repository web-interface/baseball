// 기록 탭 — 2027 시즌 · 최근 10경기 폼 그래프 · 명장면(강조 문구 다시 보기) · 부상 이력 · 수상
import { useMemo, useState, type CSSProperties } from 'react';
import { Button, CalloutAnnouncer, CalloutStage, Field, Icon, fmt, useCalloutQueue, type CalloutData } from '../../ui';
import { GRADES } from '../../game/grades';
import { LAST_MATCH, playerById, teamById } from '../../game/mock';
import type { CardInst, Play, Player } from '../../game/types';
import { Pips, Sec } from './common';
import { highlightsOf, injuriesOf, hiddenOf, recentOf, type GameRow } from './local-mock';
import s from './record.module.css';

export function RecordPanel({ p, card, owned, mineCount }: { p: Player; card: CardInst; owned: boolean; mineCount: number }) {
  const recent = useMemo(() => recentOf(p), [p]);
  const hidden = useMemo(() => hiddenOf(p, owned, mineCount), [p, owned, mineCount]);
  const inj = useMemo(() => injuriesOf(p, hidden.items.find((x) => x.key === 'injuryProne')!.v), [p, hidden]);
  const hls = useMemo(() => highlightsOf(p), [p]);
  return (
    <div className={s.panel}>
      <Season p={p} />
      <Recent p={p} rows={recent.rows} summary={recent.summary} trend={recent.trend} />
      {hls.length > 0 && <Highlights p={p} plays={hls} />}
      <Injuries list={inj.list} lvl={inj.lvl} lvlKo={inj.lvlKo} days={inj.days} revealed={hidden.items.find((x) => x.key === 'injuryProne')!.revealed} />
      {card.award && <Awards card={card} />}
    </div>
  );
}

/* ───────── 2027 시즌 — 점수판 ───────── */
function Season({ p }: { p: Player }) {
  if (p.season.bat) {
    const b = p.season.bat;
    const head = [
      { k: '타율', v: fmt.avg(b.avg) }, { k: '홈런', v: String(b.hr) }, { k: 'OPS', v: fmt.avg(b.ops) },
    ];
    const cells: [string, string][] = [
      ['경기', String(b.g)], ['타석', String(b.pa)], ['타수', String(b.ab)], ['안타', String(b.h)], ['2루타', String(b.d2)], ['3루타', String(b.d3)], ['홈런', String(b.hr)], ['타점', String(b.rbi)],
      ['득점', String(b.r)], ['도루', String(b.sb)], ['볼넷', String(b.bb)], ['삼진', String(b.so)], ['타율', fmt.avg(b.avg)], ['출루율', fmt.avg(b.obp)], ['장타율', fmt.avg(b.slg)], ['OPS', fmt.avg(b.ops)],
    ];
    return <SeasonBoard head={head} cells={cells} />;
  }
  const t = p.season.pit!;
  const ipOuts = Math.floor(t.ip) * 3 + Math.round((t.ip % 1) * 10);
  const ip = ipOuts / 3;
  const head = [
    { k: '평균자책', v: fmt.era(t.era) },
    p.role === 'CL' ? { k: '세이브', v: String(t.sv) } : p.role === 'RP' ? { k: '홀드', v: String(t.hld) } : { k: '승', v: String(t.w) },
    { k: '탈삼진', v: String(t.so) },
  ];
  const cells: [string, string][] = [
    ['경기', String(t.g)], ['선발', String(t.gs)], ['승', String(t.w)], ['패', String(t.l)], ['세이브', String(t.sv)], ['홀드', String(t.hld)], ['이닝', fmt.ip(t.ip)], ['피안타', String(t.h)],
    ['피홈런', String(t.hr)], ['볼넷', String(t.bb)], ['탈삼진', String(t.so)], ['평균자책', fmt.era(t.era)], ['WHIP', fmt.era(t.whip)], ['K/9', (t.so * 9 / Math.max(1, ip)).toFixed(1)], ['BB/9', (t.bb * 9 / Math.max(1, ip)).toFixed(1)], ['K/BB', (t.so / Math.max(1, t.bb)).toFixed(1)],
  ];
  return <SeasonBoard head={head} cells={cells} />;
}

function SeasonBoard({ head, cells }: { head: { k: string; v: string }[]; cells: [string, string][] }) {
  return (
    <Sec title="2027 시즌" meta="팀 71경기 · 6월 14일 기준">
      <div className={s.heads}>
        {head.map((h) => (
          <div key={h.k} className={s.headCell}>
            <span>{h.k}</span>
            <b className="num-display">{h.v}</b>
          </div>
        ))}
      </div>
      <div className={s.board} role="table" aria-label="2027 시즌 기록">
        {[0, 1].map((row) => (
          <div key={row} className={s.bRow} role="row">
            {cells.slice(row * 8, row * 8 + 8).map(([k, v]) => (
              <div key={k} className={s.bCell} role="cell">
                <span>{k}</span>
                <b className="num">{v}</b>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Sec>
  );
}

/* ───────── 최근 10경기 — 평점 막대 (한 계열 · 마지막 경기 강조) ───────── */
function Recent({ p, rows, summary, trend }: { p: Player; rows: GameRow[]; summary: { k: string; v: string }[]; trend: 'hot' | 'cold' | 'even' }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 358, H = 132, padL = 22, padR = 4, padT = 18, base = H - 2;
  const band = (W - padL - padR) / rows.length;
  const bw = Math.min(20, band * 0.56);
  const y = (v: number) => base - (v / 10) * (base - padT);
  const maxI = rows.reduce((m, r, i) => (r.rating > rows[m].rating ? i : m), 0);
  const minI = rows.reduce((m, r, i) => (r.rating < rows[m].rating ? i : m), 0);
  const last = rows.length - 1;
  const show = new Set([maxI, minI, last]);
  const isP = p.pos === 'P';
  const avg = rows.reduce((a, r) => a + r.rating, 0) / rows.length;
  const h = hover != null ? rows[hover] : null;
  const trendKo = trend === 'hot' ? (isP ? '최근 구위가 좋아요' : '방망이가 뜨거워요') : trend === 'cold' ? (isP ? '최근 흔들려요' : '방망이가 식었어요') : '평소 페이스';
  return (
    <Sec title="최근 10경기" meta={<>평점 평균 <b className="num">{avg.toFixed(1)}</b> · {trendKo}</>}>
      <dl className={s.sum}>
        {summary.map((x) => (
          <div key={x.k}><dt>{x.k}</dt><dd className="num">{x.v}</dd></div>
        ))}
      </dl>
      <div className={s.chart}>
        <svg viewBox={`0 0 ${W} ${H}`} className={s.svg} role="img" aria-label={`최근 10경기 평점, 마지막 경기 ${rows[last].rating}`}>
          {[5, 8].map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className={s.grid} />
              <text x={padL - 6} y={y(t) + 3.5} textAnchor="end" className={['num', s.tick].join(' ')}>{t}</text>
            </g>
          ))}
          <line x1={padL} x2={W - padR} y1={base} y2={base} className={s.axis} />
          {rows.map((r, i) => {
            const cx = padL + band * i + band / 2;
            const top = y(r.rating);
            const hgt = base - top;
            const rr = Math.min(4, hgt);
            const d = `M${cx - bw / 2} ${base}V${top + rr}Q${cx - bw / 2} ${top} ${cx - bw / 2 + rr} ${top}H${cx + bw / 2 - rr}Q${cx + bw / 2} ${top} ${cx + bw / 2} ${top + rr}V${base}Z`;
            return (
              <g key={i}>
                <path d={d} className={[s.bar, i === last && s.barLast, hover === i && s.barHover, r.note && s.barNote].filter(Boolean).join(' ')} />
                {show.has(i) && <text x={cx} y={top - 5} textAnchor="middle" className={['num', s.val, i === last && s.valLast].filter(Boolean).join(' ')}>{r.rating.toFixed(1)}</text>}
                <rect
                  x={padL + band * i} y={0} width={band} height={H}
                  className={s.hit}
                  tabIndex={0}
                  role="button"
                  aria-label={`${r.date} ${teamById(r.oppId).short}전 ${r.detail} 평점 ${r.rating}`}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover((x) => (x === i ? null : x))}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover((x) => (x === i ? null : x))}
                />
              </g>
            );
          })}
        </svg>
        {h && (
          <div className={s.tip} style={{ left: `${((padL + band * hover! + band / 2) / W) * 100}%` } as CSSProperties} role="status">
            <b className="num">{h.rating.toFixed(1)}</b>
            <span>{h.date} · {teamById(h.oppId).short}전</span>
            <span>{h.detail}</span>
          </div>
        )}
        <div className={s.xs} aria-hidden style={{ paddingLeft: `${(padL / W) * 100}%`, paddingRight: `${(padR / W) * 100}%` }}>
          {rows.map((r, i) => (
            <span key={i} className={i === last ? s.xLast : undefined}>
              <b className={['num', s.xLine].join(' ')}>{r.line}</b>
              <i className="num">{r.date}</i>
            </span>
          ))}
        </div>
      </div>
      <table className={s.log}>
        <caption className="sr-only">최근 10경기 기록</caption>
        <thead>
          <tr><th>날짜</th><th>상대</th><th className={s.r}>{isP ? '이닝' : '안타-타수'}</th><th>내용</th><th className={s.r}>평점</th></tr>
        </thead>
        <tbody>
          {rows.slice().reverse().map((r, i) => (
            <tr key={i} className={r.note ? s.noteRow : undefined}>
              <td className="num">{r.date}</td>
              <td>{r.home ? '' : '@'}{teamById(r.oppId).short}</td>
              <td className={['num', s.r].join(' ')}>{r.line}</td>
              <td className={s.detail}>{r.detail}{r.note && <em> · {r.note}</em>}</td>
              <td className={['num', s.r, s.rt].join(' ')}>{r.rating.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Sec>
  );
}

/* ───────── 명장면 — 어제 경기 강조 장면을 다시 띄운다 ───────── */
const callFromPlay = (pl: Play): CalloutData => {
  const t = teamById(pl.highlight!.teamId);
  return {
    id: pl.id + ':' + Date.now(),
    kind: pl.highlight!.kind, title: pl.highlight!.title, sub: pl.highlight!.sub, meta: pl.highlight!.meta,
    causes: pl.causes?.map((c) => c.text), team: { primary: t.colors.primary, secondary: t.colors.secondary, ink: t.colors.ink },
  };
};

function Highlights({ p, plays }: { p: Player; plays: Play[] }) {
  const q = useCalloutQueue();
  const [sel, setSel] = useState(plays.length - 1);
  const pl = plays[sel];
  const home = teamById(LAST_MATCH.homeId), away = teamById(LAST_MATCH.awayId);
  const fielder = pl.defense?.fielders.find((f) => f.dive) ?? pl.defense?.fielders[0];
  const rMax = fielder ? (fielder.mps * (pl.defense!.hangS - fielder.reactS)) / 140 : 0;
  const play = () => q.push(callFromPlay(pl));
  return (
    <Sec title="명장면" meta={<>6월 13일 · {away.short} <span className="num">{LAST_MATCH.final[0]}</span> : <span className="num">{LAST_MATCH.final[1]}</span> {home.short}</>}>
      <div className={s.hlList} role="tablist" aria-label="명장면">
        {plays.map((x, i) => (
          <button key={x.id} type="button" role="tab" aria-selected={i === sel} className={[s.hlItem, i === sel && s.hlOn].filter(Boolean).join(' ')} onClick={() => { setSel(i); q.clear(); }}>
            <b>{x.highlight!.title}</b>
            <span><span className="num">{x.inning}</span>회{x.half === 'top' ? '초' : '말'} · {x.highlight!.meta}</span>
          </button>
        ))}
      </div>
      <CalloutStage callout={q.current} pace="normal" onDone={q.next} className={s.stage}>
        <div className={s.stageField}>
          <Field
            stadium={home.stadium}
            distances={false}
            label={`${home.stadium.name} — ${pl.text}`}
            svg={
              <g>
                {fielder && (
                  <circle cx={fielder.from.x * 400} cy={fielder.from.y * 400} r={rMax * 400} className={s.range} />
                )}
                {pl.hit && fielder && <line x1={fielder.from.x * 400} y1={fielder.from.y * 400} x2={pl.hit.x * 400} y2={pl.hit.y * 400} className={s.run} />}
                {pl.hit && <path d={`M200 400Q${(200 + pl.hit.x * 400) / 2} ${Math.min(pl.hit.y * 400, 400) - 70} ${pl.hit.x * 400} ${pl.hit.y * 400}`} className={s.flight} />}
                {pl.hit && <circle cx={pl.hit.x * 400} cy={pl.hit.y * 400} r="5.5" className={s.ball} />}
              </g>
            }
          />
        </div>
        <div className={s.stageCap}>
          <p>{pl.text}</p>
          {pl.causes?.slice(0, 2).map((c) => <p key={c.text} className={s.cause}>↳ {c.text}</p>)}
        </div>
      </CalloutStage>
      <CalloutAnnouncer callout={q.current} />
      <div className={s.hlFoot}>
        <span className={s.hlNote}>{fielder ? <>원 = {playerById(fielder.playerId)?.name ?? ''} 수비 범위 · 공이 끝에 걸렸어요</> : '강조 문구는 엔진 승리 확률 변화로 정해요'}</span>
        <Button size="s" variant="secondary" icon="play" onClick={play}>다시 보기</Button>
      </div>
    </Sec>
  );
}

/* ───────── 부상 이력 ───────── */
function Injuries({ list, lvl, lvlKo, days, revealed }: { list: { when: string; kind: string; days: number; cause: string; recur?: boolean; now?: boolean }[]; lvl: number; lvlKo: string; days: number; revealed: boolean }) {
  return (
    <Sec title="부상" meta={<>지금 위험 <b className={s['risk' + lvl]}>{lvlKo}</b></>}>
      <div className={s.risk}>
        <Pips n={lvl + 1} of={4} className={[s.riskPips, s['rp' + lvl]].join(' ')} label={`부상 위험 4단계 중 ${lvl + 1}`} />
        <span>{revealed ? '부상 경향·나이·피로로 계산' : '나이·피로로 계산 · 부상 경향은 아직 몰라요'}</span>
      </div>
      {list.length === 0 ? (
        <p className={s.none}>프로에 와서 다친 적이 없어요.</p>
      ) : (
        <ol className={s.inj}>
          {list.map((x, i) => (
            <li key={i} className={x.now ? s.injNow : undefined}>
              <span className={['num', s.when].join(' ')}>{x.when}</span>
              <div className={s.injBody}>
                <p><b>{x.kind}</b>{x.recur && <em className={s.recur}>재발</em>}</p>
                <p className={s.injCause}>{x.cause}</p>
              </div>
              <span className={s.days}>{x.now ? '결장 중' : <><span className="num">{x.days}</span>일</>}</span>
            </li>
          ))}
        </ol>
      )}
      {days > 0 && <p className={s.injSum}>통산 결장 <span className="num">{days}</span>일</p>}
    </Sec>
  );
}

/* ───────── 수상 ───────── */
function Awards({ card }: { card: CardInst }) {
  const g = GRADES[card.grade];
  return (
    <Sec title="수상" meta="시상식 기록">
      <p className={s.award}>
        <Icon name={card.grade === 'mvp' ? 'laurel' : card.grade === 'th' ? 'crown' : 'glove'} size={22} />
        <span><b className="num">20{card.year}</b> {g.ko} · {card.award}</span>
      </p>
    </Sec>
  );
}
