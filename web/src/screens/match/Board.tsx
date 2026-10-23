// 점수판(회별 점수) · 자막(지금 장면) · 승리 확률 막대(되감기) · 재생 손잡이
import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { Emblem, Icon, IconButton, Tabs } from '../../ui';
import { ME, playerById, teamById } from '../../game/mock';
import { POS_KO } from '../../game/labels';
import { GAME } from './local-mock';
import { CALLOUTS_ALL, HALVES, MODES, PLAYS, PLAY_COUNT, halfOf, type Beat, type Live, type Mode } from './timeline';
import s from './Board.module.css';

const away = () => teamById(GAME.match.awayId);
const home = () => teamById(GAME.match.homeId);
export const halfKo = (half: 'top' | 'bot') => (half === 'top' ? '초' : '말');

/* ───────── 회별 점수 ───────── */
export function LineScore({ live, done }: { live: Live; done?: boolean }) {
  const p = live.play;
  const innings = Math.max(9, p.inning);
  const rows = [
    { team: away(), inn: live.inn.away, r: live.score[0], h: live.h[0], e: live.e[0], b: live.b[0], bat: p.half === 'top' },
    { team: home(), inn: live.inn.home, r: live.score[1], h: live.h[1], e: live.e[1], b: live.b[1], bat: p.half === 'bot' },
  ];
  const cols = { '--inn': innings } as CSSProperties;
  return (
    <div className={s.board} role="table" aria-label="회별 점수" style={cols}>
      <div className={[s.row, s.head].join(' ')} role="row">
        <span className={s.team} role="columnheader"><span className="sr-only">구단</span></span>
        {Array.from({ length: innings }, (_, i) => (
          <span key={i} role="columnheader" className={['num', s.c, !done && i + 1 === p.inning && s.cur].filter(Boolean).join(' ')}>{i + 1}</span>
        ))}
        <span className={['num', s.c, s.R].join(' ')} role="columnheader">R</span>
        <span className={['num', s.c].join(' ')} role="columnheader">H</span>
        <span className={['num', s.c].join(' ')} role="columnheader">E</span>
        <span className={['num', s.c].join(' ')} role="columnheader">B</span>
      </div>
      {rows.map((r) => (
        <div key={r.team.id} className={[s.row, !done && r.bat && s.bat].filter(Boolean).join(' ')} role="row">
          <span className={s.team} role="rowheader">
            <i className={s.tbar} style={{ background: r.team.colors.primary }} aria-hidden />
            <Emblem team={r.team} size={18} />
            <b>{r.team.short}</b>
          </span>
          {Array.from({ length: innings }, (_, i) => {
            const v = r.inn[i];
            const live2 = !done && i + 1 === p.inning && r.bat;
            return (
              <span key={`${i}-${v ?? 'x'}`} role="cell" className={['num', s.c, s.v, v != null && v > 0 && s.scored, live2 && s.now, i + 1 === p.inning && !done && s.curCell].filter(Boolean).join(' ')}>
                {v ?? ''}
              </span>
            );
          })}
          <b key={`r-${r.r}`} role="cell" className={['num', s.c, s.R, s.rv].join(' ')}>{r.r}</b>
          <span role="cell" className={['num', s.c, s.sub].join(' ')}>{r.h}</span>
          <span role="cell" className={['num', s.c, s.sub].join(' ')}>{r.e}</span>
          <span role="cell" className={['num', s.c, s.sub].join(' ')}>{r.b}</span>
        </div>
      ))}
    </div>
  );
}

/* ───────── 자막 — 지금 장면 한 줄 + 원인 표시 ───────── */
const RES_KO = { ball: '볼', called: '스트라이크', swing: '헛스윙', foul: '파울', inplay: '타격', hbp: '몸에 맞는 공' } as const;

export function notationOf(code: string, notation?: string, looking?: boolean) {
  if (code === 'K') return 'K';
  if (code === 'BB') return 'BB';
  if (code === 'HBP') return 'HP';
  if (code === 'HR') return 'HR';
  if (code === '1B') return notation === '번트' ? 'BH' : '1B';
  if (code === '2B') return '2B';
  if (code === '3B') return '3B';
  if (code === 'SB') return 'SB';
  if (code === 'SF') return `SF${(notation ?? '').replace(/\D/g, '')}`;
  return notation ?? code;
}

export function halfSummary(i: number) {
  const h = HALVES.find((x) => x.first <= i && x.last >= i)!;
  const team = h.half === 'top' ? away() : home();
  const ps = PLAYS.slice(h.first, h.last + 1);
  const hits = ps.filter((p) => ['1B', '2B', '3B', 'HR'].includes(p.code)).length;
  const last = PLAYS[h.last];
  const lob = last.outsAfter >= 3 ? last.basesBefore.filter(Boolean).length - (last.code === 'DP' ? 1 : last.code === 'FC' ? 0 : 0) : 0;
  let line: string;
  if (h.runs > 0) {
    const scoring = ps.filter((p, k) => {
      const prev = k === 0 ? (h.first > 0 ? PLAYS[h.first - 1].score : [0, 0]) : ps[k - 1].score;
      return p.half === 'top' ? p.score[0] > prev[0] : p.score[1] > prev[1];
    });
    line = `${h.runs}점 — ${scoring[scoring.length - 1].text}`;
  } else if (ps.filter((p) => p.isPA).length === 3 && hits === 0 && ps.every((p) => !['BB', 'HBP', 'E'].includes(p.code))) line = '삼자범퇴';
  else if (lob >= 2) line = `${lob}명 잔루 — 점수 없음`;
  else line = `${hits}안타 무득점`;
  return { title: `${h.inning}회${halfKo(h.half)} · ${team.short}`, line, runs: h.runs, team };
}

export function Caption({ beat, live }: { beat: Beat; live: Live }) {
  const p = live.play;
  let tag = '';
  let text = '';
  let causes: string[] = [];
  let tone: 'plain' | 'event' | 'result' | 'half' = 'plain';
  const batter = playerById(p.batterId);
  const pitcher = playerById(p.pitcherId);
  const looking = p.seq[p.seq.length - 1]?.res === 'called';
  const result = () => {
    tag = notationOf(p.code, p.notation, looking);
    text = p.text;
    causes = (p.causes ?? []).slice(0, 2).map((c) => c.text);
    tone = 'result';
  };
  switch (beat.k) {
    case 'half': {
      const team = p.half === 'top' ? away() : home();
      tag = `${p.inning}회${halfKo(p.half)}`;
      text = `${team.name} 공격 — ${p.slot}번 ${batter?.name ?? ''}부터`;
      tone = 'half';
      break;
    }
    case 'event': {
      const e = p.pre[beat.ev];
      tag = e.head;
      text = e.text;
      tone = 'event';
      break;
    }
    case 'scene': {
      const st = live;
      const runners = st.bases.map((b, k) => (b ? k + 1 : 0)).filter(Boolean);
      tag = `${p.inning}회${halfKo(p.half)}`;
      text = `${st.outs === 0 ? '무사' : `${st.outs}사`} ${runners.length ? (runners.length === 3 ? '만루' : `${runners.join('·')}루`) : '주자 없음'} · ${batter?.name} 대 ${pitcher?.name}`;
      tone = 'half';
      break;
    }
    case 'pitch': case 'steal': {
      const pt = live.thrown > 0 ? p.seq[live.thrown - 1] : undefined;
      if (pt) {
        tag = `${pt.no}구`;
        text = `${pt.name} ${pt.kmh} · ${RES_KO[pt.res]}${pt.steal ? ` — ${playerById(pt.steal.runner)?.name} 도루!` : ''}`;
      } else {
        tag = `${p.slot}번`;
        text = `${batter?.name}${p.isPA ? ' 타석' : ''} · ${pitcher?.name} 상대`;
      }
      break;
    }
    case 'bip': case 'result': case 'callout':
      if (live.applied || beat.k === 'callout') result();
      else { tag = `${p.seq.length}구`; text = `${p.seq[p.seq.length - 1]?.name ?? ''} — 쳤어요!`; }
      break;
    case 'fill': {
      if (beat.flash != null && !live.applied) {
        const fp = PLAYS[beat.flash];
        tag = `${fp.inning}회${halfKo(fp.half)}`;
        text = fp.text;
        causes = (fp.causes ?? []).filter((c) => c.decisive).slice(0, 1).map((c) => c.text);
        tone = 'result';
      } else {
        const sum = halfSummary(live.playIdx);
        tag = sum.title.split(' · ')[0];
        text = `${sum.team.short} ${sum.line}`;
        const fp = beat.flash != null ? PLAYS[beat.flash] : undefined;
        causes = fp ? (fp.causes ?? []).filter((c) => c.decisive).slice(0, 1).map((c) => c.text) : [];
        tone = 'half';
      }
      break;
    }
    case 'halfsum': {
      const sum = halfSummary(beat.last);
      tag = sum.title.split(' · ')[0];
      text = `${sum.team.short} ${sum.line}`;
      tone = 'half';
      break;
    }
    case 'end': {
      const [a, h] = live.score;
      const win = h > a ? home() : away();
      tag = '경기 끝';
      text = `${win.name} ${Math.max(a, h)} : ${Math.min(a, h)} 승리${GAME.match.walkoff ? ' — 9회말 끝내기' : ''}`;
      tone = 'half';
      break;
    }
  }
  return (
    <div className={[s.cap, s['t-' + tone]].join(' ')} aria-live="polite">
      <div className={s.capRow}>
        {tag && <span className={s.tag}><span className={s.tagIn}>{tag}</span></span>}
        <p className={s.capText}>{text}</p>
      </div>
      {causes.map((c) => <p key={c} className={s.why}>↳ {c}</p>)}
    </div>
  );
}

/* ───────── 승리 확률 막대 (되감기) ───────── */
export function Scrubber({ live, onSeek, done }: { live: Live; onSeek: (play: number) => void; done?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const myHome = GAME.match.homeId === ME.teamId;
  const upto = done ? PLAY_COUNT - 1 : live.applied ? live.playIdx : live.playIdx - 1;
  const W = 1000, H = 100;
  const x = (i: number) => (PLAY_COUNT <= 1 ? 0 : (i / (PLAY_COUNT - 1)) * W);
  const my = (wp: number) => (myHome ? wp : 1 - wp);
  const y = (wp: number) => 8 + (1 - my(wp)) * (H - 16);
  const pts: string[] = [`0,${y(PLAYS[0].wp[0]).toFixed(1)}`];
  for (let i = 0; i <= upto; i++) pts.push(`${x(i).toFixed(1)},${y(PLAYS[i].wp[1]).toFixed(1)}`);
  const head = Math.max(0, Math.min(PLAY_COUNT - 1, live.playIdx));
  const pick = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const u = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    onSeek(Math.round(u * (PLAY_COUNT - 1)));
  };
  const onDown = (e: PointerEvent) => { (e.target as Element).setPointerCapture?.(e.pointerId); pick(e.clientX); };
  const onMove = (e: PointerEvent) => { if (e.buttons) pick(e.clientX); };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const h = halfOf(head);
      const idx = HALVES.indexOf(h);
      const to = e.key === 'ArrowRight' ? HALVES[Math.min(HALVES.length - 1, idx + 1)] : HALVES[Math.max(0, idx - (live.playIdx > h.first ? 0 : 1))];
      onSeek(to.first);
      e.preventDefault();
    }
  };
  const innTicks = HALVES.filter((h) => h.half === 'top');
  const lead = my(PLAYS[Math.max(0, upto)].wp[1]);
  return (
    <div
      ref={ref}
      className={s.scrub}
      role="slider"
      tabIndex={0}
      aria-label="경기 진행 · 승리 확률"
      aria-valuemin={1}
      aria-valuemax={9}
      aria-valuenow={live.play.inning}
      aria-valuetext={`${live.play.inning}회${halfKo(live.play.half)} · 승리 확률 ${Math.round(lead * 100)}%`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onKeyDown={onKey}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={s.scrubSvg} aria-hidden>
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} className={s.mid} />
        {innTicks.map((h) => <line key={h.key} x1={x(h.first)} x2={x(h.first)} y1={0} y2={H} className={s.tick} />)}
        <polyline points={pts.join(' ')} className={s.wpLine} />
      </svg>
      {innTicks.map((h) => <span key={h.key} className={['num', s.innNo].join(' ')} style={{ left: `${(x(h.first) / W) * 100}%` }}>{h.inning}</span>)}
      {CALLOUTS_ALL.filter((i) => i <= upto).map((i) => (
        <i key={i} className={s.hl} style={{ left: `${(x(i) / W) * 100}%`, top: `${(y(PLAYS[i].wp[1]) / H) * 100}%`, background: teamById(PLAYS[i].highlight!.teamId).colors.primary }} />
      ))}
      <span className={s.phead} style={{ left: `${(x(head) / W) * 100}%` }} aria-hidden />
    </div>
  );
}

/* ───────── 재생 손잡이 ───────── */
export function Transport({
  playing, speed, mode, onToggle, onSpeed, onSkip, onMode, disabled, quickLeft, locked,
}: {
  playing: boolean; speed: number; mode: Mode; onToggle: () => void; onSpeed: () => void; onSkip: () => void; onMode: (m: Mode) => void;
  disabled?: boolean; quickLeft?: number;
  /** 포스트시즌 — 이닝별로 끝까지 봐야 해서 보기 방식 · 건너뛰기를 막는다 */
  locked?: string;
}) {
  const skipLabel = mode === 'detail' ? '다음 타석' : mode === 'key' ? '다음 장면' : mode === 'inning' ? '다음 이닝' : '결과로';
  return (
    <div className={s.transport}>
      <div className={s.tRow}>
        <IconButton icon={playing ? 'pause' : 'play'} label={playing ? '멈춤' : '재생'} onClick={onToggle} className={s.play} disabled={disabled} />
        {locked ? (
          <span className={s.locked}><b>이닝별</b>{locked}</span>
        ) : (
          <Tabs<Mode>
            variant="box"
            size="s"
            fill
            items={MODES.map((m) => ({ value: m.value, label: m.label }))}
            value={mode}
            onChange={onMode}
            aria-label="보기 방식"
            className={s.modes}
          />
        )}
      </div>
      <div className={s.tSub}>
        {mode === 'quick'
          ? <span className={s.hint}><Icon name="clock" size={13} className={s.hintIco} />{'1~9회를 '}<b className="num">10</b>{'초 안에'}{quickLeft != null ? <>{' · 남은 '}<b className="num">{quickLeft.toFixed(1)}</b>초</> : null}</span>
          : <button type="button" className={s.speed} onClick={onSpeed} aria-label={`빠르기 ${speed}배`}><b className="num">{speed}</b>배속</button>}
        {!locked && (
          <button type="button" className={s.skip} onClick={onSkip} disabled={disabled}>
            {skipLabel}<Icon name="fast" size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

/** 타순 표시 '4번 3루수' */
export function slotLabel(play: { slot: number; batterId: string; half: 'top' | 'bot' }) {
  const side = play.half === 'top' ? GAME.away : GAME.home;
  const ls = side.batting.find((x) => x.slot === play.slot);
  const pos = ls ? (ls.pid === play.batterId ? ls.pos : ls.pos === 'DH' ? 'DH' : ls.pos) : 'DH';
  return `${play.slot}번 ${pos === 'DH' ? '지명' : POS_KO[pos]}`;
}
