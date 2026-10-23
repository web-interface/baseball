// 레전드 이펙트 — 가장 좋은 카드를 따로 공개 (요구 17 · 아트 디렉션 7-3)
//   레어            어두워짐 → 빛 기둥(테두리 빛) → 카드
//   엘리트 · MVP·GG·TH  연도 숫자가 크게 찍힘 → 옛 신문 1면에 그 해 기록 → 카드
//   레전드 · 프랜차이즈  어두워짐 → 구단 엠블럼이 빛으로 그려짐 → 등번호판 → 카드
//   블랙 · 시그니처      조명탑이 하나씩 켜짐 → 기둥 → 엠블럼 → 결번판 / 친필 서명 → 카드 (가장 큰 연출)
// 화면을 누르면 카드까지 바로, 다 나온 뒤엔 '계속'. 깜빡임 없음(조명은 켜짐 페이드). 움직임 줄이기면 짧은 페이드로만.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Card, CardBack } from '../../cards';
import { GRADES } from '../../game/grades';
import { POS_KO, ROLE_KO } from '../../game/labels';
import { teamById } from '../../game/mock';
import type { GradeId, Player, Team } from '../../game/types';
import { PlayerArt } from '../../art/PlayerArt';
import { Button, Emblem, Icon } from '../../ui';
import { avg as fAvg, era as fEra, roman, yearTag } from '../../ui/format';
import { PAPER, eraOf } from './local-mock';
import type { Pick, PulledCard } from './draw';
import { Swatch } from './bits';
import s from './Reveal.module.css';

type Kind = 'rare' | 'elite' | 'award' | 'legend' | 'franchise' | 'black' | 'signature';
type Step = 'dark' | 'lights' | 'pillar' | 'year' | 'paper' | 'emblem' | 'plate' | 'sign' | 'card' | 'settle';

export function kindOf(g: GradeId): Kind {
  switch (g) {
    case 'elite': return 'elite';
    case 'mvp': case 'gg': case 'th': return 'award';
    case 'legend': return 'legend';
    case 'franchise': return 'franchise';
    case 'black': return 'black';
    case 'signature': case 'unique': return 'signature';
    default: return 'rare';
  }
}

/** 등급 빛 — 팩 신호 빛줄 · 기둥 · 입자 */
export function lightOf(g: GradeId, team: string) {
  switch (g) {
    case 'rare': return '#FF8A7A';
    case 'elite': return '#CDB8FF';
    case 'mvp': case 'gg': case 'th': return '#F6D98E';
    case 'legend': return '#F3CD7C';
    case 'franchise': return team;
    case 'black': return '#E6EAF0';
    case 'signature': case 'unique': return '#FFFFFF';
    default: return '#FFF4DE';
  }
}

const SEQ: Record<Kind, [Step, number][]> = {
  rare: [['dark', 0], ['pillar', 220], ['card', 760], ['settle', 1520]],
  elite: [['dark', 0], ['pillar', 200], ['year', 640], ['paper', 1260], ['card', 3000], ['settle', 3800]],
  award: [['dark', 0], ['year', 260], ['paper', 980], ['card', 3200], ['settle', 4000]],
  legend: [['dark', 0], ['pillar', 220], ['emblem', 560], ['plate', 1900], ['card', 3500], ['settle', 4300]],
  franchise: [['dark', 0], ['pillar', 220], ['emblem', 560], ['plate', 1900], ['card', 3500], ['settle', 4300]],
  black: [['dark', 0], ['lights', 160], ['pillar', 1240], ['emblem', 1640], ['plate', 2900], ['card', 4300], ['settle', 5100]],
  signature: [['dark', 0], ['lights', 160], ['pillar', 1240], ['emblem', 1640], ['sign', 2900], ['card', 4400], ['settle', 5200]],
};

const isReduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const fullYear = (y?: number) => (y == null ? 2027 : y >= 80 ? 1900 + y : 2000 + y);
const posOf = (p: Player) => (p.pos === 'P' ? (p.role ? ROLE_KO[p.role] : '투수') : POS_KO[p.pos]);

export function Reveal({ pc, pick, onDone }: { pc: PulledCard; pick: Pick | null; onDone: () => void }) {
  const g = pc.card.grade;
  const kind = kindOf(g);
  const seq = SEQ[kind];
  const p = pc.player;
  const team = teamById(p.teamId);
  const light = lightOf(g, team.colors.primary);
  const reduced = isReduced();
  const [i, setI] = useState(0);
  const timers = useRef<number[]>([]);

  const schedule = (from: number) => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    const base = seq[from][1];
    for (let k = from + 1; k < seq.length; k++) {
      const at = (seq[k][1] - base) * (reduced ? 0.55 : 1);
      timers.current.push(window.setTimeout(() => setI((x) => Math.max(x, k)), at));
    }
  };
  useEffect(() => {
    schedule(0);
    return () => timers.current.forEach((t) => window.clearTimeout(t));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const idx = (st: Step) => seq.findIndex(([x]) => x === st);
  const step = seq[i][0];
  const has = (st: Step) => idx(st) >= 0;
  const reached = (st: Step) => has(st) && i >= idx(st);
  const now = (st: Step) => step === st;
  const after = (st: Step) => has(st) && i > idx(st);
  const settled = reached('settle');
  const cardAt = idx('card');

  const tap = () => {
    if (settled) return;
    if (i < cardAt) { setI(cardAt); schedule(cardAt); }
    else { timers.current.forEach((t) => window.clearTimeout(t)); setI(seq.length - 1); }
  };

  const yr = fullYear(pc.card.year ?? (pick?.kind === 'year' ? pick.year % 100 : undefined));
  const cls = (...xs: (string | false | undefined)[]) => xs.filter(Boolean).join(' ');

  return (
    <div
      className={cls(s.root, s['k-' + kind], settled && s.settled)}
      style={{ '--light': light, '--team': team.colors.primary, '--team2': team.colors.secondary, '--team-ink': team.colors.ink } as CSSProperties}
      onClick={tap}
      role="presentation"
    >
      <div className={s.dark} />

      {has('lights') && (
        <div className={cls(s.lights, reached('lights') && s.in, reached('card') && s.dim)} aria-hidden>
          <i /><i /><i /><i />
        </div>
      )}

      {has('pillar') && (
        <div className={cls(s.pillar, reached('pillar') && s.in, settled && s.dim)} aria-hidden>
          <i className={s.floor} />
          <i className={s.beam} />
          <i className={s.core} />
          {kind === 'signature' && <><i className={cls(s.side, s.sideL)} /><i className={cls(s.side, s.sideR)} /></>}
          {kind === 'black' && <i className={s.chrome} />}
        </div>
      )}

      {has('year') && (
        <div className={cls(s.year, now('year') && s.in, after('year') && s.out)} aria-hidden>
          <b className="num-display">{yr}</b>
          <span>{g === 'mvp' ? 'MVP' : g === 'gg' ? 'GOLDEN GLOVE' : g === 'th' ? 'TITLE HOLDER' : 'ELITE SEASON'}</span>
        </div>
      )}

      {has('paper') && <Paper className={cls(s.paper, now('paper') && s.in, after('paper') && s.out)} pc={pc} year={yr} team={team} />}

      {has('emblem') && (
        <div className={cls(s.emblem, reached('emblem') && s.in, (reached('plate') || reached('sign')) && s.up, reached('card') && s.out)} aria-hidden>
          <span className={s.emBox}>
            <Emblem team={team} size={124} className={s.emDraw} />
            <Emblem team={team} size={124} className={s.emFill} />
          </span>
          <p className={s.region}>{team.name}</p>
        </div>
      )}

      {has('plate') && <Plate className={cls(s.plate, now('plate') && s.in, after('plate') && s.out)} kind={kind} p={p} team={team} />}

      {has('sign') && (
        <div className={cls(s.signWrap, now('sign') && s.in, after('sign') && s.out)} aria-hidden>
          <p className={s.sign}>{p.name}</p>
          <svg viewBox="0 0 240 30" className={s.swoosh}><path d="M8 20C60 26 120 28 232 8" /></svg>
          <span className={s.signK}>SIGNATURE · 친필</span>
        </div>
      )}

      <div className={cls(s.cardStage, reached('card') && s.in, settled && s.up)}>
        <div className={s.cardFlip}>
          <div className={s.cardBack}><CardBack grade={g} style={{ width: '100%' }} /></div>
          <div className={s.cardFront}>
            <Card
              player={p}
              grade={g}
              year={pc.card.year}
              level={pc.card.level}
              signaturePitch={pc.card.signaturePitch ?? null}
              award={pc.card.award}
              style={{ width: '100%' }}
            />
          </div>
        </div>
        <i className={s.shock} />
      </div>

      {pc.tier >= 2 && reached('card') && !reduced && <Burst kind={kind} team={team} />}

      {settled && (
        <div className={s.info} onClick={(e) => e.stopPropagation()}>
          <p className={s.gl}>
            <Swatch grade={g} size={9} />
            <b>{GRADES[g].ko}</b>
            {pc.card.year != null && GRADES[g].yearTagged && <span className="num">{yearTag(pc.card.year)}</span>}
            {pc.card.award && <span>· {pc.card.award}</span>}
          </p>
          <h2 className={cls('head', s.nm)}>{p.name}</h2>
          <p className={s.meta}>
            {posOf(p)} · {team.name}
            {pc.card.signaturePitch && <> · <span className={s.sig} style={{ ['--sig' as string]: pc.card.signaturePitch.color }}>{pc.card.signaturePitch.name}</span></>}
          </p>
          <p className={pc.isNew ? s.isNew : s.isDup}>{pc.isNew ? '새 카드 · 보관함에 넣었어요' : pc.up ? `같은 카드가 모여 강화 +1 (${pc.up.from > 0 ? roman(pc.up.from) : '0'} → ${roman(pc.up.to)})` : '중복 +1 · 강화 재료'}</p>
          <Button variant="primary" size="l" block onClick={onDone} className={s.next} autoFocus>계속</Button>
        </div>
      )}

      {!settled && <p className={s.tapHint}>누르면 바로 카드</p>}
    </div>
  );
}

/* ───────── 옛 신문 1면 ───────── */
/** 받침 — 숫자로 끝나면 읽는 소리로 (2 이 · 4 사 · 5 오 · 9 구 는 받침 없음, 1·7·8 은 ㄹ) */
const jong = (w: string): number => {
  const ch = w.trim().slice(-1);
  if (/[0-9]/.test(ch)) return ({ 0: 21, 1: 8, 2: 0, 3: 16, 4: 0, 5: 0, 6: 1, 7: 8, 8: 8, 9: 0 } as Record<string, number>)[ch];
  const c = ch.charCodeAt(0);
  return c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 : 0;
};
const j = (w: string, a: string, b: string) => w + (jong(w) ? a : b);
/** 로/으로 — ㄹ 받침은 '로' */
const ro = (w: string) => w + (jong(w) && jong(w) !== 8 ? '으로' : '로');
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

function statLine(p: Player, year: number) {
  const full = year < 2027 && !p.real; // 실제 선수 카드는 그 해 실제 기록 그대로 (옛 목업은 반 시즌 기록이라 늘려 보였음)
  if (p.season.bat) {
    const b = p.season.bat;
    const k = full ? 135 / Math.max(1, b.g) : 1;
    return { kind: 'bat' as const, avg: b.avg, hr: Math.round(b.hr * k), rbi: Math.round(b.rbi * k), sb: Math.round(b.sb * k), h: Math.round(b.h * k), ops: b.ops };
  }
  const t = p.season.pit!;
  const k = full ? (t.gs ? 28 / Math.max(1, t.g) : 62 / Math.max(1, t.g)) : 1;
  return { kind: 'pit' as const, w: Math.round(t.w * k), era: t.era, so: Math.round(t.so * k), sv: Math.round(t.sv * k), hld: Math.round(t.hld * k), l: Math.round(t.l * k) };
}

function newsOf(pc: PulledCard, year: number, team: Team) {
  const p = pc.player;
  const g = pc.card.grade;
  const st = statLine(p, year);
  const name = p.name;
  const pos = posOf(p);
  const line = st.kind === 'bat'
    ? `타율 ${fAvg(st.avg)} · ${st.hr}홈런 · ${st.rbi}타점`
    : st.sv > 10 ? `${st.sv}세이브 · 평균자책 ${fEra(st.era)}` : st.hld > 10 ? `${st.hld}홀드 · 평균자책 ${fEra(st.era)}` : `${st.w}승 · 평균자책 ${fEra(st.era)} · ${st.so}탈삼진`;
  const award = pc.card.award ?? '';
  const titleStat: Record<string, string> = st.kind === 'bat'
    ? { 홈런왕: `${st.hr}홈런`, 타격왕: `타율 ${fAvg(st.avg)}`, 타점왕: `${st.rbi}타점`, 도루왕: `${st.sb}도루`, 최다안타: `${st.h}안타` }
    : { 다승: `${st.w}승`, 평균자책: `평균자책 ${fEra(st.era)}`, 탈삼진: `${st.so}탈삼진`, 세이브: `${st.sv}세이브`, 홀드: `${st.hld}홀드` };
  const current = year === 2027;
  const d = current ? new Date(2027, 5, 15) : new Date(year, 10, 24);
  const date = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEK[d.getDay()]}요일`;
  const no = (year - 1985) * 311 + 1204 + (current ? 172 : 0);

  if (g === 'mvp') {
    return {
      date, no, icon: 'laurel' as const, kicker: `${year} 한별 리그 시상식`,
      head: `${j(name, '이', '가')} 시즌 MVP`, deck: `${line} — ${team.short} ${pos}`,
      body: [
        `${team.name}의 ${pos} ${j(name, '이', '가')} ${year} 시즌 최우수선수(MVP)로 뽑혔다. 기자단 투표 1위표를 가장 많이 받았다.`,
        `${j(name, '은', '는')} 시즌 내내 ${j(st.kind === 'bat' ? '중심 타선' : '마운드', '을', '를')} 지키며 ${j(line, '을', '를')} 남겼다.`,
      ],
    };
  }
  if (g === 'gg') {
    return {
      date, no, icon: 'glove' as const, kicker: `${year} 골든글러브`,
      head: `${j(name, '이', '가')} ${award} 황금장갑`, deck: `${line} — ${team.name}`,
      body: [
        `${year} 골든글러브 ${award} 부문은 ${team.name} ${name}에게 돌아갔다.`,
        `수비와 공격을 함께 따지는 투표에서 ${j(name, '은', '는')} ${ro(line)} 경쟁자들을 앞섰다.`,
      ],
    };
  }
  if (g === 'th') {
    const ts = titleStat[award] ?? line;
    return {
      date, no, icon: 'crown' as const, kicker: `${year} 타이틀 홀더`,
      head: `${name}, ${award}`, deck: `${ts} — 리그 1위 · ${team.name}`,
      body: [
        `${team.name} ${j(name, '이', '가')} ${ro(ts)} ${year} 시즌 ${award} 타이틀을 가져갔다.`,
        `시즌 마지막 주까지 이어진 경쟁 끝에 차이를 지켰다. 시즌 성적은 ${line}.`,
      ],
    };
  }
  // 엘리트 — 그 해 시즌 성적
  return {
    date, no, icon: null, kicker: current ? `${year} 시즌 · 6월 14일까지` : `${year} 시즌 결산`,
    head: st.kind === 'bat' ? `${name}, 타율 ${fAvg(st.avg)} ${st.hr}홈런` : st.sv > 10 ? `${name}, ${st.sv}세이브` : `${name}, ${st.w}승 평균자책 ${fEra(st.era)}`,
    deck: `${team.name} ${pos} — 리그 최상위 시즌`,
    body: [
      `${team.name}의 ${pos} ${j(name, '이', '가')} ${current ? '올 시즌' : `${year} 시즌`} ${line}${jong(line) ? '을' : '를'} ${current ? '기록 중이다' : '남겼다'}.`,
      `${team.short} 벤치는 "${name} 차례가 오면 경기가 달라진다"고 말한다.`,
    ],
  };
}

function Paper({ pc, year, team, className }: { pc: PulledCard; year: number; team: Team; className: string }) {
  const n = newsOf(pc, year, team);
  return (
    <article className={className} aria-hidden>
      <div className={s.paperIn}>
        <header className={s.mast}>
          <p className={s.mastTop}><span>{n.date}</span><span className="num">제{n.no.toLocaleString('en-US')}호</span></p>
          <h3 className={s.masthead}>{PAPER.name}</h3>
          <p className={s.mastSub}><span>{PAPER.en}</span><span>한별 리그 공식 기록</span></p>
        </header>
        <p className={s.kicker}>{n.icon && <Icon name={n.icon} size={15} stroke={1.9} />}{n.kicker}</p>
        <h4 className={s.headline}>{n.head}</h4>
        <p className={s.deck}>{n.deck}</p>
        <div className={s.story}>
          <figure className={s.photo}>
            <span className={s.photoArt}><PlayerArt player={pc.player} team={team} variant="portrait" eager /></span>
            <figcaption>{pc.player.name} · {team.short}</figcaption>
          </figure>
          <div className={s.text}>
            {n.body.map((t) => <p key={t}>{t}</p>)}
            <p className={s.lines} />
          </div>
        </div>
      </div>
    </article>
  );
}

/* ───────── 등번호판 · 결번판 ───────── */
function Plate({ kind, p, team, className }: { kind: Kind; p: Player; team: Team; className: string }) {
  const era = eraOf(p);
  const seasons = Math.max(1, 2027 - p.draftYear);
  const top = kind === 'legend' ? 'LEGEND' : kind === 'franchise' ? 'FRANCHISE' : 'BLACK';
  const line = kind === 'legend'
    ? (era ? `${yearTag(era.year)} ‘${era.era}’ — ${era.desc}` : team.name)
    : kind === 'franchise' ? `${seasons}시즌째 ${team.short} — 한 팀에서만 뛴 상징`
    : `${team.short} 결번 ${p.number}`;
  return (
    <div className={className} aria-hidden>
      <div className={s.plateIn}>
        <i className={s.screw} /><i className={s.screw} /><i className={s.screw} /><i className={s.screw} />
        <p className={s.plateTop}><span>{top}</span>{kind === 'franchise' && <b className={s.fr}>FR</b>}</p>
        <b className={['num-display', s.plateNo].join(' ')}>{p.number}</b>
        <p className={s.plateName}>{p.name}</p>
        <p className={s.plateLine}>{line}</p>
      </div>
    </div>
  );
}

/* ───────── 입자 (레전드 이상) — 캔버스 하나, 1.4초 ───────── */
function Burst({ kind, team }: { kind: Kind; team: Team }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.scale(dpr, dpr);
    const colors = kind === 'legend' ? ['#F3CD7C', '#FFF1C1', '#C8923E', '#E8D9B5']
      : kind === 'franchise' ? [team.colors.primary, '#F3CD7C', '#FFF6E0', team.colors.accent]
      : kind === 'black' ? ['#E6EAF0', '#9AA3AF', '#FFFFFF', '#C9CED6']
      : ['#ff8fb8', '#ffd27e', '#b8f5a0', '#8fe3ff', '#b59cff', '#ffffff'];
    const count = kind === 'signature' ? 84 : kind === 'black' ? 64 : 50;
    const cx = W / 2, cy = H * 0.42;
    const ps = Array.from({ length: count }, (_, k) => {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5;
      const v = 4 + Math.random() * 7;
      return {
        x: cx + (Math.random() - 0.5) * 60, y: cy + (Math.random() - 0.5) * 40,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2,
        r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
        w: k % 3 === 0 ? 3 : 4, h: k % 3 === 0 ? 10 : 4,
        c: colors[k % colors.length],
      };
    });
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = (now - t0) / 1400;
      ctx.clearRect(0, 0, W, H);
      if (t >= 1) return;
      for (const q of ps) {
        q.vy += 0.22; q.vx *= 0.985; q.x += q.vx; q.y += q.vy; q.r += q.vr;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - t * t);
        ctx.translate(q.x, q.y);
        ctx.rotate(q.r);
        ctx.fillStyle = q.c;
        ctx.fillRect(-q.w / 2, -q.h / 2, q.w, q.h);
        ctx.restore();
      }
      raf = requestAnimationFrame(tick);
    };
    const start = window.setTimeout(() => { raf = requestAnimationFrame(tick); }, 240);
    return () => { window.clearTimeout(start); cancelAnimationFrame(raf); };
  }, [kind, team]);
  return <canvas ref={ref} className={s.burst} aria-hidden />;
}
