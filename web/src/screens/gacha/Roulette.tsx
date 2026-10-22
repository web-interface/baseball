// 카드 조합(룰렛) — 안 쓰는 카드 n장 → 새 카드 1장 (요구 39). #/gacha?tab=combo
// 칸 크기 = 실제 결과 확률. 더 많이 넣으면 윗 등급 칸이 넓어진다. 결과는 서버 난수(지금은 목업) — 바늘은 결과를 따라갈 뿐.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { navigate } from '../../app/router';
import { CardMini, Card } from '../../cards';
import { GRADES } from '../../game/grades';
import { CARDS, LINEUP, MY_CARD_IDS, PLAYERS, ROULETTE_EXAMPLE, playerById } from '../../game/mock';
import type { CardInst, GradeId, Player } from '../../game/types';
import { Button, Icon, Tabs } from '../../ui';
import { rarity, rollCombo, sessionCards, useGacha, type ComboSlot, type PulledCard } from './draw';
import { Reveal } from './Reveal';
import { Swatch, gradeFill } from './bits';
import s from './Roulette.module.css';
import o from './Opening.module.css';

type InGrade = 'normal' | 'special' | 'rare';
const LADDER: Record<InGrade, [GradeId, GradeId, GradeId]> = {
  normal: ['normal', 'special', 'rare'],
  special: ['special', 'rare', 'elite'],
  rare: ['rare', 'elite', 'legend'],
};
const COUNTS = [5, 7, 10] as const;
const SPLIT: Record<number, [number, number, number]> = { 5: [70, 25, 5], 7: [58, 33, 9], 10: [42, 43, 15] };
const STEP_KO = ['같은 등급', '한 단계 위', '두 단계 위'];

function slotsFor(g: InGrade, n: number): ComboSlot[] {
  if (g === ROULETTE_EXAMPLE.grade && n === ROULETTE_EXAMPLE.input) {
    return ROULETTE_EXAMPLE.slots.map((x) => ({ grade: x.grade, pct: x.pct, label: x.label }));
  }
  return LADDER[g].map((grade, i) => ({ grade, pct: SPLIT[n][i], label: GRADES[grade].ko }));
}

interface Material { id: string; card: CardInst; player: Player; spare: boolean; session?: boolean }

const IN_LINEUP = new Set([...LINEUP.batting.map((b) => b.cardId), LINEUP.sp, ...LINEUP.rotation, ...LINEUP.bullpen, LINEUP.closer, ...LINEUP.bench]);

/** 재료 후보 — 이번에 받은 카드 · 보관함의 남는 장(라인업 카드는 중복만) · 지난 영입에서 남은 카드 */
function materialsFor(g: InGrade, session: PulledCard[]): Material[] {
  const out: Material[] = [];
  for (const c of session) if (c.card.grade === g) out.push({ id: c.card.id, card: c.card, player: c.player, spare: !c.isNew, session: true });
  for (const id of MY_CARD_IDS) {
    const c = CARDS.find((x) => x.id === id);
    if (!c || c.grade !== g || c.locked) continue;
    const p = playerById(c.playerId);
    if (!p) continue;
    const copies = IN_LINEUP.has(c.id) ? c.dup : 1 + c.dup;
    for (let k = 0; k < copies; k++) out.push({ id: `${c.id}#${k}`, card: c, player: p, spare: k < c.dup });
  }
  const band: Record<InGrade, [number, number]> = { normal: [0, 72], special: [70, 80], rare: [77, 86] };
  const [lo, hi] = band[g];
  for (const p of PLAYERS) {
    if (p.id === 'p41' || p.ovr < lo || p.ovr > hi || out.some((m) => m.player.id === p.id)) continue;
    out.push({ id: `spare-${p.id}-${g}`, card: { id: `spare-${p.id}-${g}`, playerId: p.id, grade: g, year: 27, level: 1, enhance: 0, dup: 0 }, player: p, spare: false });
  }
  // 중복(남는 장) 먼저, 그다음 종합 낮은 순
  return out.sort((a, b) => Number(b.spare) - Number(a.spare) || a.player.ovr - b.player.ovr);
}

const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* 도넛 조각 */
function slice(a0: number, a1: number, R: number, r: number) {
  const p = (ang: number, rad: number) => {
    const t = ((ang - 90) * Math.PI) / 180;
    return `${(rad * Math.cos(t)).toFixed(2)} ${(rad * Math.sin(t)).toFixed(2)}`;
  };
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${p(a0, R)}A${R} ${R} 0 ${large} 1 ${p(a1, R)}L${p(a1, r)}A${r} ${r} 0 ${large} 0 ${p(a0, r)}Z`;
}

export function Roulette() {
  useGacha(); // 받은 카드가 바뀌면 다시 그림
  const [grade, setGrade] = useState<InGrade>('rare');
  const [count, setCount] = useState<number>(5);
  const [rot, setRot] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [tick, setTick] = useState(0);
  const [result, setResult] = useState<{ slot: number; card: PulledCard } | null>(null);
  const [cine, setCine] = useState<PulledCard | null>(null);
  const [used, setUsed] = useState<Set<string>>(new Set());
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const slots = useMemo(() => slotsFor(grade, count), [grade, count]);
  const all = materialsFor(grade, sessionCards()).filter((m) => !used.has(m.id));
  const chosen = all.slice(0, count);
  const enough = chosen.length >= count;

  // 각 칸의 각도 (위에서 시계 방향)
  const arcs = useMemo(() => {
    let a = 0;
    return slots.map((sl) => { const a0 = a; a += (sl.pct / 100) * 360; return { ...sl, a0, a1: a }; });
  }, [slots]);

  const spin = () => {
    if (spinning || !enough) return;
    const ids = chosen.map((m) => m.id);
    const { slot, result: res } = rollCombo(slots, ids.filter((x) => !x.includes('#') && !x.startsWith('spare-')));
    setUsed((u) => new Set([...u, ...ids]));
    setResult(null);
    const arc = arcs[slot];
    const t = arc.a0 + (arc.a1 - arc.a0) * (0.18 + Math.random() * 0.64);
    const cur = ((rot % 360) + 360) % 360;
    const final = rot + 360 * 5 + ((((360 - t) - cur) % 360) + 360) % 360;
    const done = () => {
      setSpinning(false);
      setResult({ slot, card: res });
      if (rarity(res.card.grade) > rarity(grade)) setCine(res);
    };
    if (reduced()) { setRot(final); done(); return; }
    setSpinning(true);
    const from = rot;
    const t0 = performance.now();
    const dur = 4300;
    let lastPeg = Math.floor((((360 - (from % 360)) % 360) + 360) % 360 / 10);
    const frame = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 4);
      const r = from + (final - from) * e;
      setRot(r);
      const under = ((360 - (r % 360)) % 360 + 360) % 360;
      const peg = Math.floor(under / 10);
      if (peg !== lastPeg) { lastPeg = peg; setTick((x) => x + 1); }
      if (k < 1) raf.current = requestAnimationFrame(frame);
      else done();
    };
    raf.current = requestAnimationFrame(frame);
  };

  const R = 138, r = 50;
  return (
    <div className={s.screen}>
      <button type="button" className={s.back} onClick={() => navigate('/gacha')}>
        <Icon name="back" size={18} /> 팩 고르기
      </button>
      <header className={s.head}>
        <h2 className="head">카드 조합</h2>
        <p>안 쓰는 카드를 넣고 돌려요. 칸 크기가 곧 확률이에요.</p>
      </header>

      <div className={s.controls}>
        <div className={s.ctl}>
          <span>넣을 등급</span>
          <Tabs variant="box" size="s" value={grade} onChange={(v) => { if (!spinning) { setGrade(v as InGrade); setResult(null); } }} aria-label="넣을 등급"
            items={(['normal', 'special', 'rare'] as InGrade[]).map((g) => ({ value: g, label: GRADES[g].ko }))} />
        </div>
        <div className={s.ctl}>
          <span>장수</span>
          <Tabs variant="box" size="s" value={String(count)} onChange={(v) => { if (!spinning) { setCount(Number(v)); setResult(null); } }} aria-label="넣을 장수"
            items={COUNTS.map((n) => ({ value: String(n), label: `${n}장` }))} />
        </div>
      </div>

      <div className={s.wheelWrap}>
        <svg viewBox="-160 -168 320 330" className={s.wheel} role="img" aria-label={slots.map((x) => `${x.label} ${x.pct}%`).join(', ')}>
          <defs>
            <pattern id="rlHatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="1.4" height="5" fill="currentColor" />
            </pattern>
          </defs>
          <circle r={R + 10} className={s.rim} />
          <g style={{ transform: `rotate(${rot}deg)` }} className={s.rotor}>
            {arcs.map((a, i) => (
              <g key={a.grade + i} className={[s.slot, result?.slot === i && !spinning && s.hit].filter(Boolean).join(' ')} style={{ '--c': a.grade === 'signature' ? '#E8DDFF' : `var(--gr-${a.grade})` } as CSSProperties}>
                <path d={slice(a.a0, a.a1, R, r)} className={s.fill} />
                <path d={slice(a.a0, a.a1, R, r)} className={s.hatch} fill="url(#rlHatch)" />
                <g transform={`rotate(${(a.a0 + a.a1) / 2})`}>
                  <text x="0" y={-(r + 16)} className={s.lab} transform={`rotate(${(a.a0 + a.a1) / 2 > 180 ? 90 : -90} 0 ${-(r + 16)})`} textAnchor={(a.a0 + a.a1) / 2 > 180 ? "end" : "start"} dominantBaseline="central">
                    <tspan className={s.labPct}>{a.pct}%</tspan>
                    <tspan dx="5">{a.label}</tspan>
                  </text>
                </g>
              </g>
            ))}
            {Array.from({ length: 36 }, (_, i) => (
              <line key={i} x1="0" y1={-(R + 2)} x2="0" y2={-(R + 7)} transform={`rotate(${i * 10})`} className={s.peg} />
            ))}
            {arcs.map((a) => <line key={'b' + a.grade} x1="0" y1={-r} x2="0" y2={-R} transform={`rotate(${a.a0})`} className={s.sep} />)}
          </g>
          <circle r={r - 2} className={s.hub} />
          <text y="-6" textAnchor="middle" className={s.hubBig}><tspan className="num">{count}</tspan>장</text>
          <text y="14" textAnchor="middle" className={s.hubSmall}>→ 새 카드 1장</text>
          <g key={tick} className={[s.needle, spinning && s.tick].filter(Boolean).join(' ')}>
            <path d={`M0 ${-R + 14} L-11 ${-R - 16} L11 ${-R - 16} Z`} />
            <circle cy={-R - 16} r="4" />
          </g>
        </svg>
      </div>

      <ul className={s.odds}>
        {slots.map((x, i) => (
          <li key={x.grade + i} className={result?.slot === i && !spinning ? s.oddsHit : undefined}>
            <Swatch grade={x.grade} size={9} />
            <span className={s.step}>{STEP_KO[i]}</span>
            <b>{x.label}</b>
            <em className="num">{x.pct}%</em>
          </li>
        ))}
      </ul>
      <p className={s.fair}>결과는 서버가 먼저 정해요. 돌림판은 그 결과를 보여 줄 뿐이에요.</p>

      <section className={s.mats}>
        <div className={s.matsHead}>
          <h3 className="head">넣을 카드</h3>
          <span><b className="num">{Math.min(chosen.length, count)}</b>/<span className="num">{count}</span> · 중복부터 자동으로 골랐어요</span>
        </div>
        <div className={s.matRow} style={{ '--n': count } as CSSProperties}>
          {Array.from({ length: count }, (_, i) => {
            const m = chosen[i];
            return m ? (
              <div key={m.id} className={[s.mat, spinning && s.matGo].filter(Boolean).join(' ')} style={{ '--i': i } as CSSProperties}>
                <CardMini player={m.player} grade={m.card.grade} style={{ width: '100%' }} />
                {m.spare && <em className={['num', s.matDup].join(' ')}>+1</em>}
              </div>
            ) : <div key={'e' + i} className={s.matEmpty} aria-hidden />;
          })}
        </div>
        {!enough && <p className={s.short}>{GRADES[grade].ko} 카드가 모자라요. 팩을 열면 채워져요.</p>}
      </section>

      <div className={s.cta}>
        <Button variant="primary" size="l" block onClick={spin} disabled={!enough || spinning}>
          {spinning ? '돌아가는 중' : result ? '한 번 더 돌리기' : '돌리기'}
        </Button>
      </div>

      {result && !spinning && !cine && (
        <section className={s.result} aria-live="polite">
          <div className={s.resCard}><Card player={result.card.player} grade={result.card.card.grade} year={result.card.card.year} level={1} signaturePitch={result.card.card.signaturePitch ?? null} size="m" /></div>
          <div className={s.resInfo}>
            <p className={s.resGrade} style={{ color: gradeFill(result.card.card.grade) }}>
              {STEP_KO[result.slot]} · {GRADES[result.card.card.grade].ko}
            </p>
            <b className="head">{result.card.player.name}</b>
            <p>{result.card.isNew ? '새 카드 — 보관함에 넣었어요' : '중복 +1 · 강화 재료'}</p>
          </div>
        </section>
      )}

      {cine && createPortal(
        <div className={[o.root, s.cineHost].join(' ')} role="dialog" aria-modal="true" aria-label="조합 결과">
          <div className={o.bg} aria-hidden />
          <Reveal pc={cine} pick={null} onDone={() => setCine(null)} />
        </div>,
        document.body,
      )}
    </div>
  );
}
