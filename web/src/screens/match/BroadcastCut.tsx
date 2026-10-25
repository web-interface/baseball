// 중계 화면 컷 — 장타 · 적시타 · 결정적 삼진처럼 멋진 순간에 2D 경기장 위로 잠깐(약 2.6초) 실제 중계처럼.
//  타자 뒤에서 본 구도: 하늘 · 조명탑 · 전광판(실제 줄 점수) · 관중석 · 외야 펜스 광고 · 잔디 결 · 내야 흙 · 마운드의 투수(앞모습 그림)
//  · 내야수 둘 · 타자 뒷모습(헬멧 · 등번호 · 이름) · 스트라이크 존과 마지막 공 자리 · 오른쪽 위 점수판 · 왼쪽 주자 판 · 아래 타자/투수 정보 띠.
//  사용자 지시 10-25 (보낸 마구마구 화면처럼). 눌러서 건너뛰기, 움직임 줄이기면 짧게.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { PlayerArt } from '../../art/PlayerArt';
import { playerById, teamById } from '../../game/mock';
import { POS_KO } from '../../game/labels';
import type { Player, Team } from '../../game/types';
import { avgLabel, batLine, eraLabel, pitLine } from '../../season/store';
import { GAME, ZONE, type FullPlay } from './local-mock';
import { PLAYS, STATES } from './timeline';
import { ipText, isSeasonGame, pitcherToday } from './Panels';
import { mySide } from './Stage';
import s from './BroadcastCut.module.css';

/** 컷으로 보여 줄 만한 플레이인가 — 홈런 · 장타 · 적시타 · 득점권 2아웃 삼진 · 150km/h 삼진 · 강조 장면 */
export function cutWorthy(p: FullPlay): boolean {
  if (!p.isPA || p.fake) return false;
  if (p.code === 'HR' || p.code === '2B' || p.code === '3B') return true;
  if (p.code === '1B' && p.rbi > 0) return true;
  if (p.code === 'K') {
    const risp = !!(p.basesBefore[1] || p.basesBefore[2]);
    return (p.outsBefore === 2 && risp) || (p.lastPitch?.kmh ?? 0) >= 150;
  }
  return !!p.highlight && ['1B', '2B', '3B', 'HR', 'K', 'SF'].includes(p.code);
}

const CAP: Partial<Record<FullPlay['code'], string>> = { HR: '홈런!', '3B': '3루타!', '2B': '2루타!', '1B': '안타!', K: '삼진!', SF: '희생플라이' };
const DUR = 2600;
const yy = (n: number) => String(n);

/** 사람 손 같은 관중 — 줄마다 고른 색 점(결정적) */
function crowd(seed: number) {
  const cols = ['#e9d8c4', '#f2c6a0', '#d9a77f', '#2b2b33', '#d64545', '#2f6fd6', '#f5f5f5', '#ffd25e', '#3aa856', '#ff8a3d', '#8f6ad6'];
  const dots: { x: number; y: number; r: number; c: string }[] = [];
  let h = seed >>> 0;
  const rnd = () => { h = (h * 1664525 + 1013904223) >>> 0; return h / 4294967296; };
  for (let row = 0; row < 9; row++) {
    const y = 84 + row * 6.4;
    const r = 1.55 + row * 0.12;
    for (let x = 4 + (row % 2) * 2.2; x < 400; x += 4.6) dots.push({ x: x + rnd() * 1.4, y: y + rnd() * 1.2, r, c: cols[Math.floor(rnd() * cols.length)] });
  }
  return dots;
}

export function BroadcastCut({ play, onDone }: { play: FullPlay; onDone: () => void }) {
  const [out, setOut] = useState(false);
  const done = useRef(onDone);
  done.current = onDone;
  const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    const total = reduced ? 1400 : DUR;
    const t1 = window.setTimeout(() => setOut(true), total - 300);
    const t2 = window.setTimeout(() => done.current(), total);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [reduced]);
  const skip = () => { setOut(true); window.setTimeout(() => done.current(), 200); };

  const i = PLAYS.indexOf(play);
  const before = STATES.before[Math.max(0, i)];
  const after = STATES.after[Math.max(0, i)];
  const away = teamById(GAME.match.awayId), home = teamById(GAME.match.homeId);
  const batTeam = play.half === 'top' ? away : home;
  const fldTeam = play.half === 'top' ? home : away;
  const batter = playerById(play.batterId);
  const pitcher = playerById(play.pitcherId);
  const side = mySide();
  const batMine = side != null && (play.half === 'top' ? 'away' : 'home') === side;
  const night = Number(GAME.match.time.slice(0, 2)) >= 18;
  const lefty = (batter?.bats === 'L') || (batter?.bats === 'S' && pitcher?.throws === 'R');
  const hit = ['1B', '2B', '3B', 'HR', 'SF'].includes(play.code);
  const last = play.seq[play.seq.length - 1];
  const dots = useMemo(() => crowd(GAME.match.id.length * 7919 + i), [i]);
  // 마지막 공 자리 (존 0~1 → 스트라이크 존 상자 안)
  const zx = 168 + ((last?.zone[0] ?? 0.5) - ZONE.x0) / (ZONE.x1 - ZONE.x0) * 64;
  const zy = 268 + ((last?.zone[1] ?? 0.5) - ZONE.y0) / (ZONE.y1 - ZONE.y0) * 58;
  // 타구 방향 (각도 −45 좌 ~ 45 우)
  const ang = play.hit?.angle ?? 0;
  const bx = 200 + ang * 3.4, by = play.code === 'HR' ? 40 : play.hit?.kind === 'ground' ? 214 : 132;
  const cap = CAP[play.code] ?? '';
  const sub = play.code === 'HR' && play.hit?.distM ? `비거리 ${Math.round(play.hit.distM)}m` : play.code === 'K' && last ? `${last.kmh}km/h ${last.name}` : play.rbi > 0 ? `${play.rbi}타점` : '';

  return (
    <div className={[s.cut, out && s.out, reduced && s.still].filter(Boolean).join(' ')} onClick={skip} role="img" aria-label={`중계 화면 — ${batter?.name ?? ''} ${cap}`}>
      <svg className={s.scene} viewBox="0 0 400 378" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <defs>
          <linearGradient id="bcSky" x1="0" y1="0" x2="0" y2="1">
            {night ? <><stop offset="0" stopColor="#081028" /><stop offset="1" stopColor="#25385f" /></> : <><stop offset="0" stopColor="#4fa3f0" /><stop offset="1" stopColor="#bfe2ff" /></>}
          </linearGradient>
          <linearGradient id="bcGrass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={night ? '#2f7a3d' : '#3f9a4a'} /><stop offset="1" stopColor={night ? '#1f5a2b' : '#2e7d38'} />
          </linearGradient>
          <radialGradient id="bcLight" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#fffbe6" stopOpacity="1" /><stop offset="1" stopColor="#fffbe6" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* 하늘 · 조명탑 */}
        <rect width="400" height="120" fill="url(#bcSky)" />
        {[34, 366].map((x) => (
          <g key={x}>
            <rect x={x - 1.5} y="14" width="3" height="70" fill="#9aa3ad" />
            <rect x={x - 17} y="8" width="34" height="16" rx="2" fill="#dfe6ee" stroke="#7d8794" strokeWidth=".8" />
            {Array.from({ length: 8 }, (_, k) => <circle key={k} cx={x - 13 + (k % 4) * 8.6} cy={12 + Math.floor(k / 4) * 7.5} r="2.4" fill={night ? '#fffbe6' : '#f4f7fa'} />)}
            {night && <circle cx={x} cy="16" r="26" fill="url(#bcLight)" opacity=".55" />}
          </g>
        ))}
        {/* 전광판 — 실제 줄 점수 */}
        <g transform="translate(118 10)">
          <rect width="164" height="62" rx="3" fill="#15181e" stroke="#3a3f48" strokeWidth="1.2" />
          <rect x="3" y="3" width="158" height="9" fill="#262b33" />
          <text x="6" y="10" className={s.sbHead}>TEAM</text>
          {Array.from({ length: 9 }, (_, k) => <text key={k} x={44 + k * 12} y="10" className={s.sbHead}>{k + 1}</text>)}
          <text x="152" y="10" className={s.sbHead}>R</text>
          {(['away', 'home'] as const).map((sd, r) => {
            const t = sd === 'away' ? away : home;
            const inn = after.inn[sd];
            const runs = after.score[sd === 'away' ? 0 : 1];
            return (
              <g key={sd} transform={`translate(0 ${20 + r * 14})`}>
                <rect x="4" y="-7" width="3" height="9" fill={t.colors.primary} />
                <text x="10" y="0" className={s.sbTeam}>{t.short}</text>
                {Array.from({ length: 9 }, (_, k) => <text key={k} x={44 + k * 12} y="0" className={s.sbNum}>{inn[k] ?? ''}</text>)}
                <text x="152" y="0" className={s.sbR}>{runs}</text>
              </g>
            );
          })}
          <text x="82" y="56" textAnchor="middle" className={s.sbBall}>B {'●'.repeat(Math.min(3, last?.b ?? 0))}  S {'●'.repeat(Math.min(2, last?.s ?? 0))}  O {'●'.repeat(Math.min(2, before.outs))}</text>
        </g>
        {/* 관중석 */}
        <rect y="76" width="400" height="66" fill={night ? '#1b2232' : '#5d6f86'} />
        {dots.map((d, k) => <circle key={k} cx={d.x} cy={d.y} r={d.r} fill={d.c} opacity={night ? 0.85 : 0.95} />)}
        {/* 외야 펜스 · 광고판 */}
        <rect y="138" width="400" height="16" fill="#1e5b34" />
        <rect y="137" width="400" height="2" fill="#f2c94c" />
        {[0, 1, 2, 3, 4].map((k) => (
          <g key={k} transform={`translate(${8 + k * 79} 141)`}>
            <rect width="72" height="10" rx="1.5" fill={k % 2 ? home.colors.primary : '#f4f4f4'} />
            <text x="36" y="7.6" textAnchor="middle" className={s.ad} fill={k % 2 ? '#fff' : home.colors.primary}>{k % 2 ? home.short : '한별 리그'}</text>
          </g>
        ))}
        {/* 잔디 · 결 */}
        <rect y="154" width="400" height="224" fill="url(#bcGrass)" />
        {Array.from({ length: 9 }, (_, k) => (
          <polygon key={k} points={`${200 + (k - 4.5) * 30},154 ${200 + (k - 3.5) * 30},154 ${200 + (k - 3.5) * 120},378 ${200 + (k - 4.5) * 120},378`} fill={k % 2 ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.05)'} />
        ))}
        {/* 내야 흙 · 베이스 길 · 마운드 */}
        <path d="M200 176 L330 246 Q200 300 70 246 Z" fill="#b9814f" opacity=".95" />
        <path d="M200 190 L300 244 Q200 284 100 244 Z" fill="url(#bcGrass)" />
        <ellipse cx="200" cy="232" rx="30" ry="8" fill="#c48d5a" />
        <rect x="193" y="229" width="14" height="2.4" rx="1" fill="#f6f1e6" />
        <rect x="196" y="171" width="8" height="8" transform="rotate(45 200 175)" fill="#f8f8f8" />
        <rect x="311" y="240" width="8" height="8" transform="rotate(45 315 244)" fill="#f8f8f8" />
        <rect x="81" y="240" width="8" height="8" transform="rotate(45 85 244)" fill="#f8f8f8" />
        {/* 홈 쪽 흙 · 타석 선 · 홈 플레이트 */}
        <ellipse cx="200" cy="356" rx="96" ry="30" fill="#b9814f" />
        <path d="M150 334 h28 v40 h-28z M222 334 h28 v40 h-28z" fill="none" stroke="#fff" strokeWidth="1.6" opacity=".9" />
        <path d="M186 352 h28 v8 l-14 9 l-14 -9z" fill="#fafafa" stroke="#d0d0d0" strokeWidth=".8" />
        {/* 스트라이크 존 · 마지막 공 */}
        <rect x="168" y="268" width="64" height="58" fill="none" stroke="#fff" strokeWidth="1.3" opacity=".75" />
        <path d="M168 268 v8 M168 268 h8 M232 268 v8 M232 268 h-8 M168 326 v-8 M168 326 h8 M232 326 v-8 M232 326 h-8" stroke="#ffc83d" strokeWidth="2.2" />
        {!hit && last && <circle className={s.mark} cx={zx} cy={zy} r="6.5" fill="none" stroke="#2f6fff" strokeWidth="2.6" />}
        {/* 공 */}
        {hit
          ? <g className={s.ballHit} style={{ '--bx': `${bx - 200}px`, '--by': `${by - 300}px` } as CSSProperties}><circle cx="200" cy="300" r="4" fill="#fff" stroke="#d33" strokeWidth=".6" /></g>
          : <g className={s.ballK} style={{ '--kx': `${zx - 200}px`, '--ky': `${zy - 222}px` } as CSSProperties}><circle cx="200" cy="222" r="2" fill="#fff" /></g>}
        {play.code === 'HR' && !reduced && (
          <g className={s.fire}>
            {Array.from({ length: 14 }, (_, k) => { const a = (k / 14) * Math.PI * 2; return <line key={k} x1={bx} y1={by} x2={bx + Math.cos(a) * 26} y2={by + Math.sin(a) * 26} stroke={k % 2 ? '#ffd84d' : '#ff6b6b'} strokeWidth="2" strokeLinecap="round" />; })}
          </g>
        )}
        {/* 타자 뒷모습 */}
        <BatterBack team={batTeam} p={batter} lefty={lefty} homeSet={play.half === 'bot'} swing={hit} />
      </svg>

      {/* 마운드의 투수 · 내야수 둘 (앞모습 그림) */}
      {pitcher && <span className={s.pitcher}><PlayerArt player={pitcher} team={fldTeam} variant="full" pose="pitching" set={play.half === 'top' ? 'home' : 'away'} eager /></span>}
      <Fielders play={play} team={fldTeam} />

      {/* 오른쪽 위 점수판 · 왼쪽 주자 판 */}
      <div className={s.bug}>
        <p><i style={{ background: away.colors.primary }} /><span>{away.short}</span><b className="num">{after.score[0]}</b></p>
        <p><i style={{ background: home.colors.primary }} /><span>{home.short}</span><b className="num">{after.score[1]}</b></p>
        <small className="num">{play.inning}회{play.half === 'top' ? '초' : '말'}</small>
      </div>
      <div className={s.diamond} aria-hidden>
        {[1, 2, 0].map((b) => <i key={b} className={[s[`b${b}`], before.bases[b] && s.on].filter(Boolean).join(' ')} />)}
        <em className="num">{before.outs} Out</em>
      </div>

      {/* 가운데 문구 */}
      {cap && (
        <div className={[s.cap, play.code === 'HR' && s.capHr, play.code === 'K' && s.capK].filter(Boolean).join(' ')}>
          <b>{cap}</b>
          {sub && <small>{sub}</small>}
        </div>
      )}

      {/* 아래 타자 · 투수 띠 */}
      <div className={s.bars}>
        {batter && <InfoBar p={batter} team={batTeam} mine={batMine} kind="bat" slot={play.slot} />}
        {pitcher && <InfoBar p={pitcher} team={fldTeam} mine={!batMine && side != null} kind="pit" upto={i} />}
      </div>
    </div>
  );
}

/* ───────── 타자 뒷모습 — 헬멧 · 등번호 · 이름 (팀 색) ───────── */
function BatterBack({ team, p, lefty, homeSet, swing }: { team: Team; p: Player | undefined; lefty: boolean; homeSet: boolean; swing: boolean }) {
  const jersey = homeSet ? '#f6f6f2' : team.colors.primary;
  const ink = homeSet ? team.colors.primary : '#ffffff';
  const trim = homeSet ? team.colors.primary : team.colors.secondary;
  const helmet = team.colors.primary;
  const x = lefty ? 292 : 108;
  return (
    <g transform={`translate(${x} 0) ${lefty ? 'scale(-1 1)' : ''}`}>
      <g transform={lefty ? 'scale(-1 1)' : undefined}>
        {/* 다리 · 바지 */}
        <path d="M-30 300 q-4 40 -8 78 h22 q2 -38 8 -70z M10 300 q6 38 4 78 h22 q-2 -42 -8 -80z" fill={homeSet ? '#eeeeea' : '#c9ccd2'} />
        <path d="M-40 372 h26 v6 h-30z M12 372 h28 v6 h-30z" fill="#1d1d22" />
        {/* 몸통 · 유니폼 */}
        <path d="M-44 222 q44 -16 88 0 l6 82 q-50 12 -100 0z" fill={jersey} stroke="rgba(0,0,0,.18)" strokeWidth="1" />
        <path d="M-44 222 q44 -16 88 0 l1 7 q-45 -14 -90 0z" fill={trim} opacity=".9" />
        <text x="0" y="250" textAnchor="middle" className={s.backName} fill={ink}>{p?.name ?? ''}</text>
        <text x="0" y="288" textAnchor="middle" className={s.backNo} fill={ink} stroke={trim} strokeWidth="1">{yy(p?.number ?? 0)}</text>
        {/* 팔 · 방망이 */}
        <g className={swing ? s.swing : undefined} style={{ transformOrigin: '28px 220px' }}>
          <path d="M30 228 q20 -14 22 -34" stroke={jersey} strokeWidth="13" strokeLinecap="round" fill="none" />
          <circle cx="51" cy="192" r="7" fill="#f0c9a4" />
          <path d="M53 192 L84 110" stroke="#c98a4b" strokeWidth="6.5" strokeLinecap="round" />
          <path d="M53 192 L60 173" stroke="#3a2a1d" strokeWidth="7" strokeLinecap="round" />
        </g>
        <path d="M-34 230 q-14 -6 -6 -30" stroke={jersey} strokeWidth="12" strokeLinecap="round" fill="none" />
        {/* 목 · 헬멧 */}
        <rect x="-11" y="200" width="22" height="16" rx="6" fill="#e9c19b" />
        <path d="M-30 190 q0 -40 30 -40 q30 0 30 40 q0 14 -6 16 h-48 q-6 -2 -6 -16z" fill={helmet} />
        <path d="M-22 176 q8 -18 26 -20" stroke="rgba(255,255,255,.55)" strokeWidth="4" strokeLinecap="round" fill="none" />
        <path d="M24 186 q12 4 10 22 h-12z" fill={helmet} />
      </g>
    </g>
  );
}

/** 유격수 · 2루수 (내야 뒤쪽 작은 앞모습) */
function Fielders({ play, team }: { play: FullPlay; team: Team }) {
  const side = play.half === 'top' ? GAME.home : GAME.away;
  const ss = playerById(side.defense.SS), sb = playerById(side.defense['2B']);
  const set = play.half === 'top' ? 'home' : 'away';
  return (
    <>
      {ss && <span className={[s.fld, s.ss].join(' ')}><PlayerArt player={ss} team={team} variant="full" pose="fielding" set={set} eager /></span>}
      {sb && <span className={[s.fld, s.sb].join(' ')}><PlayerArt player={sb} team={team} variant="full" pose="fielding" set={set} eager /></span>}
    </>
  );
}

function InfoBar({ p, team, mine, kind, slot, upto }: { p: Player; team: Team; mine: boolean; kind: 'bat' | 'pit'; slot?: number; upto?: number }) {
  const season = isSeasonGame();
  let line = '';
  if (kind === 'bat') {
    const b = season ? batLine(p.id) : null;
    line = b ? `${avgLabel(b)} · 홈런 ${b.hr} · 타점 ${b.rbi}` : p.season.bat ? `${p.season.bat.avg.toFixed(3).replace(/^0/, '')} · 홈런 ${p.season.bat.hr}` : '';
  } else {
    const l = season ? pitLine(p.id) : null;
    const t = pitcherToday(p.id, upto ?? 0);
    line = `${l ? `ERA ${eraLabel(l)}` : p.season.pit ? `ERA ${p.season.pit.era.toFixed(2)}` : ''} · ${ipText(t.outs)}이닝 ${t.k}K`;
  }
  return (
    <div className={[s.bar, kind === 'pit' && s.barR, mine && s.mineBar].filter(Boolean).join(' ')} style={{ '--tc': team.colors.primary } as CSSProperties}>
      <p className={s.barTop}>
        {kind === 'bat' ? <em className="num">{slot}</em> : <em>{p.role === 'SP' ? 'SP' : p.role === 'CL' ? 'CL' : 'RP'}</em>}
        <b className="num">{p.number}</b>
        <span>{p.name}</span>
        {kind === 'bat' && <small>{POS_KO[p.pos] ?? p.pos}</small>}
        {mine && <i className={s.mineTag}>우리</i>}
      </p>
      <p className={s.barLine}>{line}</p>
    </div>
  );
}

