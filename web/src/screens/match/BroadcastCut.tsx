// 명장면 컷인 — 장타 · 적시타 · 결정적 삼진 순간, 2D 경기장 위로 3초. 애니메이션 컷인 연출. 사용자 지시 10-25
//  "애니메이션스럽게 · 고급스럽게" — 대각선으로 갈린 두 화면(위 투수 · 아래 타자, 게임 SD 그림) · 집중선 · 망점 · 구단 색 조명 · 시네마 띠
//  → 투수 손에서 타자 앞까지 빛나는 공 궤적 → 임팩트 프레임(색 반전 섬광) · 충격파 · 불꽃 · 흔들림 → 금속 광택 큰 글자.
//  눌러서 건너뛰기, 움직임 줄이기면 끝 모습만.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { PlayerArt } from '../../art/PlayerArt';
import { playerById, teamById } from '../../game/mock';
import { POS_KO } from '../../game/labels';
import type { Player, Team } from '../../game/types';
import { GAME, type FullPlay } from './local-mock';
import { PLAYS, STATES } from './timeline';
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

const KO: Partial<Record<FullPlay['code'], [string, string]>> = {
  HR: ['홈런', 'HOME RUN'], '3B': ['3루타', 'TRIPLE'], '2B': ['2루타', 'DOUBLE'], '1B': ['적시타', 'CLUTCH HIT'], K: ['삼진', 'STRIKE OUT'], SF: ['희생플라이', 'SAC FLY'],
};
const DUR = 3000;

export function BroadcastCut({ play, onDone }: { play: FullPlay; onDone: () => void }) {
  const [out, setOut] = useState(false);
  const done = useRef(onDone);
  done.current = onDone;
  const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    const total = reduced ? 1600 : DUR;
    const t1 = window.setTimeout(() => setOut(true), total - 340);
    const t2 = window.setTimeout(() => done.current(), total);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [reduced]);
  const skip = () => { setOut(true); window.setTimeout(() => done.current(), 220); };

  const i = Math.max(0, PLAYS.indexOf(play));
  const after = STATES.after[i];
  const away = teamById(GAME.match.awayId), home = teamById(GAME.match.homeId);
  const batTeam = play.half === 'top' ? away : home;
  const fldTeam = play.half === 'top' ? home : away;
  const batter = playerById(play.batterId);
  const pitcher = playerById(play.pitcherId);
  const side = mySide();
  const batMine = side != null && (play.half === 'top' ? 'away' : 'home') === side;
  const hit = ['1B', '2B', '3B', 'HR', 'SF'].includes(play.code);
  const last = play.seq[play.seq.length - 1];
  const [ko, en] = KO[play.code] ?? ['', ''];
  const meta = hit
    ? [play.hit?.kmh ? `타구 ${Math.round(play.hit.kmh)}km/h` : '', play.hit?.distM ? `비거리 ${Math.round(play.hit.distM)}m` : '', play.rbi > 0 ? `${play.rbi}타점` : ''].filter(Boolean)
    : [last ? `${last.kmh}km/h` : '', last?.name ?? ''].filter(Boolean);
  const tone = play.code === 'HR' ? s.hr : hit ? s.hitTone : s.kTone;

  return (
    <div className={[s.cut, tone, out && s.out, reduced && s.still].filter(Boolean).join(' ')} onClick={skip} role="img" aria-label={`명장면 — ${batter?.name ?? ''} ${ko}`}>
      <div className={[s.stagebox, hit && s.shake].filter(Boolean).join(' ')}>
        <Panel side="top" team={fldTeam} p={pitcher} pose="pitching" set={play.half === 'top' ? 'home' : 'away'} mine={!batMine && side != null}
          tag={pitcher?.role === 'SP' ? '선발' : pitcher?.role === 'CL' ? '마무리' : '불펜'} />
        <Panel side="bottom" team={batTeam} p={batter} pose="batting" set={play.half === 'top' ? 'away' : 'home'} mine={batMine}
          tag={batter ? (POS_KO[batter.pos] ?? batter.pos) : ''} />
        <i className={s.slash} aria-hidden />

        {/* 공 궤적 · 임팩트 — 뷰박스 100 × 100 (투수 손 17,27 → 타격 지점 50,71) */}
        <svg className={s.fx} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id="bcStreak" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset=".75" stopColor="#ffe9a8" stopOpacity=".8" />
              <stop offset="1" stopColor="#fff" stopOpacity="1" />
            </linearGradient>
            <radialGradient id="bcBloom">
              <stop offset="0" stopColor="#fff" stopOpacity="1" />
              <stop offset=".3" stopColor="#fff6d0" stopOpacity=".9" />
              <stop offset="1" stopColor="#ffb547" stopOpacity="0" />
            </radialGradient>
          </defs>
          <line x1="17" y1="27" x2="50" y2="71" className={s.pitchStreak} pathLength={1} />
          {hit ? (
            <>
              <ellipse cx="50" cy="71" rx="26" ry="26" fill="url(#bcBloom)" className={s.bloom} />
              <ellipse cx="50" cy="71" rx="4" ry="4" className={s.wave} />
              <ellipse cx="50" cy="71" rx="4" ry="4" className={[s.wave, s.wave2].join(' ')} />
              <g className={s.sparks}>
                {Array.from({ length: 16 }, (_, k) => {
                  const a = (k / 16) * Math.PI * 2 + 0.25;
                  const r1 = 3, r2 = k % 2 ? 12 : 20;
                  return <line key={k} x1={50 + Math.cos(a) * r1} y1={71 + Math.sin(a) * r1} x2={50 + Math.cos(a) * r2} y2={71 + Math.sin(a) * r2} />;
                })}
              </g>
              <line x1="50" y1="71" x2="112" y2={play.code === 'HR' ? -20 : 4} className={s.hitStreak} pathLength={1} />
            </>
          ) : (
            <>
              <ellipse cx="50" cy="71" rx="4" ry="4" className={[s.wave, s.waveK].join(' ')} />
              <ellipse cx="50" cy="71" rx="4" ry="4" className={[s.wave, s.waveK, s.wave2].join(' ')} />
            </>
          )}
        </svg>
        <i className={s.ball} aria-hidden />
        {hit && <i className={s.impact} aria-hidden />}
      </div>

      {/* 결과 글자 — 금속 광택 · 기울임 */}
      {ko && (
        <div className={s.result}>
          <b data-t={ko}>{ko}</b>
          <em>{en}</em>
          {meta.length > 0 && <span>{meta.map((m) => <i key={m}>{m}</i>)}</span>}
        </div>
      )}

      {/* 위 시네마 띠 — 이닝 · 점수 · 아웃 */}
      <div className={s.topbar}>
        <span className="num">{play.inning}회{play.half === 'top' ? '초' : '말'}</span>
        <span className={s.score}>
          <i style={{ background: away.colors.primary }} />{away.short}<b className="num">{after.score[0]}</b>
          <em>:</em>
          <b className="num">{after.score[1]}</b>{home.short}<i style={{ background: home.colors.primary }} />
        </span>
        <span className="num">{Math.min(2, play.outsBefore)}아웃</span>
      </div>
      <div className={s.botbar} />
    </div>
  );
}

/* ───────── 한쪽 화면 — 구단 색 조명 · 집중선 · 망점 · 큰 SD 그림 · 이름판 ───────── */
function Panel({ side, team, p, pose, set, tag, mine }: { side: 'top' | 'bottom'; team: Team; p: Player | undefined; pose: 'pitching' | 'batting'; set: 'home' | 'away'; tag: string; mine: boolean }) {
  return (
    <div className={[s.panel, side === 'top' ? s.pTop : s.pBottom].join(' ')} style={{ '--c1': team.colors.primary, '--c2': team.colors.secondary } as CSSProperties}>
      <i className={s.light} aria-hidden />
      <i className={s.lines} aria-hidden />
      <i className={s.tone} aria-hidden />
      {p && (
        <span className={s.char}>
          <PlayerArt player={p} team={team} variant="full" pose={pose} set={set} eager />
        </span>
      )}
      {p && (
        <div className={s.plate}>
          <b className="num">{p.number}</b>
          <span>
            <small>{team.short} · {tag}{mine && <em>우리</em>}</small>
            <strong>{p.name}</strong>
          </span>
        </div>
      )}
    </div>
  );
}
