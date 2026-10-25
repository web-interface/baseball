// 경기 중 작전 (자세히 보기 · 시즌 경기) — 누르면 바로 다음 공부터 엔진에 들어간다(command.ts). 사용자 지시 10-25
//  공격: 주루(도루 · 히트앤런 · 대주자) · 타격(강공 · 기다려 · 번트 3종 · 대타) · 성향(유지)
//  수비: 투수(교체 · 마운드 방문 · 고의4구) · 견제 · 피치아웃 · 내야 대형 · 외야 대형(유지)
//  교체 후보는 카드 · 등급 · 등급 색 바탕으로. 좋아지는 것 · 나빠지는 것 설명은 없다(사용자 지시).
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Icon, Sheet, type IconName } from '../../ui';
import { CardMini } from '../../cards';
import { playerById } from '../../game/mock';
import { GRADES } from '../../game/grades';
import { POS_KO } from '../../game/labels';
import type { GradeId } from '../../game/types';
import { avgLabel, batLine, eraLabel, getSeason, pitLine } from '../../season/store';
import { initialLineup, store as lineupStore, unit } from '../lineup/calc';
import { cardFor } from './LineupSheet';
import { GAME } from './local-mock';
import { PLAYS, type Live } from './timeline';
import { usedBefore, type CmdBody, type Commander } from './command';
import s from './TacticsPanel.module.css';

type Body = CmdBody;
const GRADE_SHORT: Partial<Record<GradeId, string>> = { franchise: '프랜차이즈', th: 'TH', gg: 'GG', mvp: 'MVP', unique: '특별' };
const ROLE_KO: Record<string, string> = { CL: '마무리', SU: '필승조', MID: '중간', LONG: '롱릴리프', LOOGY: '좌완 원포인트' };
const INF: [string, string][] = [['auto', '자동'], ['normal', '정상'], ['dp', '병살'], ['in', '전진'], ['cornersIn', '번트 대비'], ['shift', '시프트'], ['lines', '선상']];
const OF: [string, string][] = [['auto', '자동'], ['normal', '정상'], ['shallow', '전진'], ['deep', '후진'], ['pull', '당겨치기'], ['oppo', '밀어치기'], ['noDoubles', '장타 방지']];
const APPR: [string, string][] = [['auto', '자동'], ['aggressive', '적극'], ['patient', '신중'], ['power', '장타'], ['contact', '컨택']];

/** 내 카드 (얼린 라인업 — 경기 중엔 그때 라인업) */
function myCardMap() {
  const m = new Map<string, NonNullable<ReturnType<typeof unit>>['card']>();
  try {
    const st = getSeason().pending?.snap ?? lineupStore.get() ?? initialLineup();
    const ids = [...Object.values(st.field), ...st.rotation, ...st.bullpen, st.closer, ...st.bench].filter((x): x is string => !!x);
    for (const id of ids) { try { const u = unit(id); if (!m.has(u.player.id)) m.set(u.player.id, u.card); } catch { /* 없는 카드 */ } }
  } catch { /* 라인업 없음 */ }
  return m;
}

export function TacticsPanel({ live, cmd, at, onIssue }: { live: Live; cmd: Commander; at: number | null; onIssue: (body: Body, label: string) => void }) {
  const [sheet, setSheet] = useState<null | 'pitcher' | 'ph' | 'pr'>(null);
  const p = live.play;
  const myHome = cmd.side === 'home';
  // 반 이닝이 끝났으면 다음 공은 다음 반 이닝 — 공수 · 주자 · 아웃을 새로
  const nextHalf = live.applied && live.outs >= 3;
  const batNow = (p.half === 'bot') === myHome;
  const batting = nextHalf ? !batNow : batNow;
  const [r1, r2, r3] = nextHalf ? [null, null, null] : live.bases;
  const outs = nextHalf ? 0 : live.outs;
  const off = at == null;
  const used = useMemo(() => usedBefore(GAME.subs, cmd.side, at ?? Infinity), [at, cmd]); // eslint-disable-line react-hooks/exhaustive-deps
  const last = (k: string) => [...cmd.cmds].reverse().find((c) => c.k === k) as { v?: string } | undefined;
  const appr = last('approach')?.v ?? 'auto';
  const inf = last('infield')?.v ?? 'auto';
  const of = last('outfield')?.v ?? 'auto';
  const visits = cmd.cmds.filter((c) => c.k === 'visit').length;

  // 지금 마운드 · 나온 투수
  const curPitcher = !batting ? (nextHalf ? null : p.pitcherId) : null;
  const pitched = useMemo(() => new Set(PLAYS.slice(0, live.playIdx + 1).filter((x) => ((x.half === 'top') === myHome)).map((x) => x.pitcherId)), [live.playIdx, myHome]); // eslint-disable-line react-hooks/exhaustive-deps
  const penList = cmd.pen().filter((x) => x.avail >= 1 && !used.has(x.id) && !pitched.has(x.id) && x.id !== curPitcher);
  const benchList = cmd.bench().filter((id) => !used.has(id));
  const go = (body: Body, label: string) => { if (!off) onIssue(body, label); };

  const Btn = ({ icon, label, onClick, dis }: { icon: IconName; label: string; onClick: () => void; dis?: boolean }) => (
    <button type="button" className={s.btn} onClick={onClick} disabled={off || dis}>
      <Icon name={icon} size={16} /><span>{label}</span>
    </button>
  );
  const Chips = ({ list, cur, onPick, label }: { list: [string, string][]; cur: string; onPick: (v: string) => void; label: string }) => (
    <div className={s.chips} role="group" aria-label={label}>
      {list.map(([v, ko]) => (
        <button key={v} type="button" className={[s.chip, cur === v && s.on].filter(Boolean).join(' ')} aria-pressed={cur === v} disabled={off} onClick={() => cur !== v && onPick(v)}>{ko}</button>
      ))}
    </div>
  );

  return (
    <section className={s.tac} aria-label="작전">
      <header className={s.head}>
        <b>작전</b>
        <span className={[s.side, batting ? s.atk : s.def].join(' ')}>{batting ? '공격' : '수비'}</span>
        {off && <small>경기 끝</small>}
      </header>
      {batting ? (
        <>
          <Row k="주루">
            <Btn icon="steal" label="2루 도루" dis={!(r1 && !r2)} onClick={() => go({ k: 'steal', base: 2 }, '2루 도루')} />
            <Btn icon="steal" label="3루 도루" dis={!(r2 && !r3) || outs >= 2} onClick={() => go({ k: 'steal', base: 3 }, '3루 도루')} />
            <Btn icon="bolt" label="히트앤런" dis={!r1 || outs >= 2} onClick={() => go({ k: 'hitRun' }, '히트앤런')} />
            <Btn icon="swap" label="대주자" dis={!(r1 || r2 || r3) || !benchList.length} onClick={() => setSheet('pr')} />
          </Row>
          <Row k="타격">
            <Btn icon="bat" label="강공" onClick={() => go({ k: 'swingAway' }, '강공')} />
            <Btn icon="eye" label="기다려" onClick={() => go({ k: 'take' }, '기다려')} />
            <Btn icon="bunt" label="희생번트" dis={!(r1 || r2) || outs >= 2} onClick={() => go({ k: 'bunt', type: 'sac' }, '희생번트')} />
            <Btn icon="bunt" label="기습번트" dis={outs >= 2} onClick={() => go({ k: 'bunt', type: 'drag' }, '기습번트')} />
            <Btn icon="bunt" label="스퀴즈" dis={!r3 || outs >= 2} onClick={() => go({ k: 'bunt', type: 'squeeze' }, '스퀴즈')} />
            <Btn icon="swap" label="대타" dis={!benchList.length} onClick={() => setSheet('ph')} />
          </Row>
          <Row k="성향"><Chips label="타격 성향" list={APPR} cur={appr} onPick={(v) => go({ k: 'approach', v: v as never }, `성향 ${APPR.find((x) => x[0] === v)![1]}`)} /></Row>
        </>
      ) : (
        <>
          <Row k="투수">
            <Btn icon="pitch" label="투수 교체" dis={!penList.length} onClick={() => setSheet('pitcher')} />
            <Btn icon="users" label="마운드 방문" dis={visits >= 5} onClick={() => go({ k: 'visit' }, '마운드 방문')} />
            <Btn icon="arrow-right" label="고의4구" onClick={() => go({ k: 'ibb' }, '고의4구')} />
          </Row>
          <Row k="견제">
            <Btn icon="eye" label="1루 견제" dis={!r1} onClick={() => go({ k: 'pickoff', base: 1 }, '1루 견제')} />
            <Btn icon="eye" label="2루 견제" dis={!r2} onClick={() => go({ k: 'pickoff', base: 2 }, '2루 견제')} />
            <Btn icon="shield" label="피치아웃" dis={!((r1 && !r2) || (r2 && !r3))} onClick={() => go({ k: 'pitchout' }, '피치아웃')} />
          </Row>
          <Row k="내야"><Chips label="내야 수비" list={INF} cur={inf} onPick={(v) => go({ k: 'infield', v: v as never }, `내야 ${INF.find((x) => x[0] === v)![1]}`)} /></Row>
          <Row k="외야"><Chips label="외야 수비" list={OF} cur={of} onPick={(v) => go({ k: 'outfield', v: v as never }, `외야 ${OF.find((x) => x[0] === v)![1]}`)} /></Row>
        </>
      )}

      <PickSheet
        open={sheet === 'pitcher'} onClose={() => setSheet(null)} title="투수 교체"
        list={penList.map((x) => ({ id: x.id, tag: ROLE_KO[x.role] ?? x.role, warn: x.avail < 2 ? '비상' : undefined }))}
        pitcher onPick={(id, name) => { setSheet(null); const pid = cmd.run[cmd.side].idOf.get(id); if (pid != null) go({ k: 'pitcher', inPid: pid }, `투수 교체 · ${name}`); }}
      />
      <PickSheet
        open={sheet === 'ph'} onClose={() => setSheet(null)} title="대타"
        list={benchList.filter((id) => playerById(id)?.pos !== 'P').map((id) => ({ id }))}
        onPick={(id, name) => { setSheet(null); const pid = cmd.run[cmd.side].idOf.get(id); if (pid != null) go({ k: 'pinchHit', inPid: pid }, `대타 · ${name}`); }}
      />
      <RunSheet
        open={sheet === 'pr'} onClose={() => setSheet(null)} bases={[r1, r2, r3]}
        list={benchList.filter((id) => playerById(id)?.pos !== 'P')}
        onPick={(base, id, name) => { setSheet(null); const pid = cmd.run[cmd.side].idOf.get(id); if (pid != null) go({ k: 'pinchRun', base, inPid: pid }, `대주자 · ${name}`); }}
      />
    </section>
  );
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className={s.row}>
      <span className={s.rowK}>{k}</span>
      <div className={s.rowBody}>{children}</div>
    </div>
  );
}

/* ───────── 교체 후보 — 카드 · 등급 · 등급 색 바탕 ───────── */
interface Cand { id: string; tag?: string; warn?: string }
function PickSheet({ open, onClose, title, list, pitcher, onPick }: { open: boolean; onClose: () => void; title: string; list: Cand[]; pitcher?: boolean; onPick: (id: string, name: string) => void }) {
  const mine = useMemo(() => (open ? myCardMap() : new Map()), [open]);
  return (
    <Sheet open={open} onClose={onClose} title={title} height="tall">
      {list.length ? (
        <ul className={s.cands}>
          {list.map((c) => <CandRow key={c.id} c={c} pitcher={pitcher} mine={mine} onPick={onPick} />)}
        </ul>
      ) : <p className={s.none}>나올 선수가 없어요</p>}
    </Sheet>
  );
}

function CandRow({ c, pitcher, mine, onPick, sub }: { c: Cand; pitcher?: boolean; mine: Map<string, any>; onPick: (id: string, name: string) => void; sub?: string }) {
  const p = playerById(c.id);
  if (!p) return null;
  const card = cardFor(p, mine);
  const grade = card.props.grade as GradeId;
  const g = GRADES[grade];
  const face = (code: string) => p.face.find((f) => f.code === code)?.v;
  const keys = pitcher ? ['VEL', 'STF', 'CTL'] : ['CON', 'POW', 'SPD'];
  const KO: Record<string, string> = { VEL: '구속', STF: '구위', CTL: '제구', CON: '컨택', POW: '파워', SPD: '주루' };
  const line = pitcher ? (() => { const l = pitLine(p.id); return `ERA ${eraLabel(l)}`; })() : (() => { const l = batLine(p.id); return `${avgLabel(l)} · ${l.hr}홈런`; })();
  const hand = pitcher ? (p.throws === 'L' ? '좌투' : '우투') : (p.bats === 'L' ? '좌타' : p.bats === 'S' ? '양타' : '우타');
  return (
    <li>
      <button type="button" className={s.cand} style={{ '--g': `var(--gr-${grade})` } as CSSProperties} onClick={() => onPick(p.id, p.name)}>
        <span className={s.cardBox}><CardMini {...card.props} width={58} still /></span>
        <span className={s.cMain}>
          <span className={s.cTop}>
            <i className={s.grade}>{GRADE_SHORT[grade] ?? g?.ko ?? grade}</i>
            <b>{p.name}</b>
            {c.warn && <em className={s.warn}>{c.warn}</em>}
          </span>
          <span className={s.cSub}>{sub ?? (c.tag ? `${c.tag} · ${hand}` : `${POS_KO[p.pos] ?? p.pos} · ${hand}`)} · {line}</span>
          <span className={s.cStats}>
            {keys.map((k) => <span key={k}><i>{KO[k]}</i><b className="num">{face(k) ?? '-'}</b></span>)}
          </span>
        </span>
        <span className={s.cOvr}><b className="num">{('ovrShown' in card.props ? card.props.ovrShown : undefined) ?? p.ovr}</b></span>
      </button>
    </li>
  );
}

function RunSheet({ open, onClose, bases, list, onPick }: { open: boolean; onClose: () => void; bases: (string | null)[]; list: string[]; onPick: (base: 1 | 2 | 3, id: string, name: string) => void }) {
  const occ = ([1, 2, 3] as const).filter((b) => !!bases[b - 1]);
  const [base, setBase] = useState<1 | 2 | 3 | null>(null);
  const cur = base && bases[base - 1] ? base : occ[occ.length - 1] ?? null;
  const mine = useMemo(() => (open ? myCardMap() : new Map()), [open]);
  return (
    <Sheet open={open} onClose={() => { setBase(null); onClose(); }} title="대주자" height="tall">
      <div className={s.bases} role="group" aria-label="바꿀 주자">
        {occ.map((b) => {
          const r = playerById(bases[b - 1]!);
          return <button key={b} type="button" className={[s.chip, cur === b && s.on].filter(Boolean).join(' ')} aria-pressed={cur === b} onClick={() => setBase(b)}>{b}루 {r?.name ?? ''}</button>;
        })}
      </div>
      {cur && list.length ? (
        <ul className={s.cands}>
          {list.map((id) => <CandRow key={id} c={{ id }} mine={mine} onPick={(pid, name) => { setBase(null); onPick(cur, pid, name); }} />)}
        </ul>
      ) : <p className={s.none}>나올 선수가 없어요</p>}
    </Sheet>
  );
}

