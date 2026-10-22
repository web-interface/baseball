// 홈런 연출 미리보기 (#/fx) — 개발 · 확인용. 메뉴에는 없고 미리보기 목록에서 연다.
// 주소: #/fx?play=grandslam&t=900&len=short&team=bs&rm=1&theme=classic
//   play 예시 키(아래 목록) · t 그 시점(ms)에 멈춰 그림(스크린샷용) · len short|long · team 구단 id · rm=1 움직임 줄이기 흉내
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { ScreenProps } from '../../app/screen';
import { setQueryQuiet } from '../../app/router';
import { Emblem, Field, Tabs } from '../../ui';
import { PLAYERS, TEAMS, myTeam, teamById } from '../../game/mock';
import { THEMES, type ThemeId } from '../../theme/themes';
import { useTheme } from '../../theme/ThemeProvider';
import { HomerunFx } from './HomerunFx';
import { playHomerunFx } from './player';
import { CEREMONY_MS, CEREMONY_OVERLAP, planHomerun, SHELL_KO, type FxPlan } from './plan';
import { HR_PRESETS } from './presets';
import type { HomerunFxHandle, HomerunInfo, HrLength } from './types';
import s from './FxLab.module.css';

const totalOf = (p: FxPlan) => p.dur + (p.ceremony ? CEREMONY_MS - CEREMONY_OVERLAP : 0);

export default function FxLab({ query }: ScreenProps) {
  const { theme, setTheme } = useTheme();
  const q0 = useRef(query).current;
  const [teamId, setTeamId] = useState(() => (TEAMS.some((t) => t.id === q0.get('team')) ? q0.get('team')! : myTeam().id));
  const [len, setLen] = useState<HrLength>(() => (q0.get('len') === 'short' ? 'short' : 'long'));
  const [rm, setRm] = useState(() => q0.get('rm') === '1');
  const [cur, setCur] = useState(() => (HR_PRESETS.some((p) => p.key === q0.get('play')) ? q0.get('play')! : 'grandslam'));
  const [playing, setPlaying] = useState(false);
  /** React 부품으로 재생 중인 것 (n: 다시 재생할 때 새로 그리게) */
  const [fx, setFx] = useState<{ n: number; info: HomerunInfo; length: HrLength; reduced?: boolean } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const handle = useRef<HomerunFxHandle | null>(null);
  const team = teamById(teamId);

  const infoOf = (key: string, tid = teamId): HomerunInfo => {
    const i = Math.max(0, HR_PRESETS.findIndex((p) => p.key === key));
    const pr = HR_PRESETS[i];
    const t = teamById(tid);
    const bats = PLAYERS.filter((p) => p.teamId === tid && p.pos !== 'P');
    return { ...pr.info, id: pr.key, team: t.colors, batter: bats.length ? bats[i % bats.length].name : '연이준' };
  };
  const plans = useMemo(() => HR_PRESETS.map((p) => planHomerun(infoOf(p.key), len, theme)), [teamId, len, theme]); // eslint-disable-line react-hooks/exhaustive-deps
  const plan = plans[Math.max(0, HR_PRESETS.findIndex((p) => p.key === cur))];

  // 보통 재생은 React 부품(<HomerunFx>), 주소에 t 가 있으면 그 장면에서 멈춘 그림(playHomerunFx · seek)
  const play = (key: string, o: { at?: number; length?: HrLength; reduced?: boolean; tid?: string } = {}) => {
    handle.current?.stop();
    handle.current = null;
    const el = stageRef.current;
    if (!el) return;
    setCur(key);
    setQueryQuiet({ play: key, t: o.at != null ? String(o.at) : null });
    const info = infoOf(key, o.tid);
    const length = o.length ?? len;
    // 체크하면 움직임 줄이기 흉내, 아니면 기기 설정을 따른다
    const reduced = (o.reduced ?? rm) || undefined;
    setPlaying(true);
    if (o.at == null) { setFx({ n: Date.now(), info, length, reduced }); return; }
    setFx(null);
    const h = playHomerunFx(el, info, { length, reducedMotion: reduced, paused: true });
    handle.current = h;
    const at = o.at;
    h.ready.then(() => h.seek(at));
  };

  // 주소에 play 가 있으면 바로 (t 가 있으면 그 장면에서 멈춤)
  useEffect(() => {
    const key = q0.get('play');
    if (key && HR_PRESETS.some((p) => p.key === key)) {
      const t = q0.get('t');
      const go = () => play(key, { at: t != null ? Number(t) || 0 : undefined });
      if (document.fonts) document.fonts.ready.then(go); else go();
    }
    return () => { handle.current?.stop(); handle.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const lenTabs = [{ value: 'short' as const, label: '짧은 판 · 빨리 보기' }, { value: 'long' as const, label: '긴 판 · 주요 장면' }];
  const themeTabs = THEMES.map((t) => ({ value: t.id, label: t.ko }));
  const total = totalOf(plan);

  return (
    <div className={s.page}>
      <header className={s.head}>
        <h1 className="head">홈런 연출</h1>
        <p>홈런마다 폭죽 모양 · 색 · 박자 · 큰 글자가 달라요. 같은 홈런은 언제나 같은 연출이에요.</p>
      </header>

      <div className={s.stageWrap}>
        <div ref={stageRef} className={s.stage} style={{ '--tc': team.colors.primary } as CSSProperties}>
          <div className={s.fieldBox}><Field stadium={team.stadium} label={`${team.stadium.name} — 위에서 본 경기장`} /></div>
          {fx && <HomerunFx key={fx.n} info={fx.info} length={fx.length} reducedMotion={fx.reduced} onDone={() => { setFx(null); setPlaying(false); }} />}
          {!playing && (
            <button type="button" className={s.replay} onClick={() => play(cur)}>
              <i className={s.playIco} aria-hidden /> 다시 보기 · {plan.title}
            </button>
          )}
        </div>
      </div>

      <div className={s.controls}>
        <Tabs variant="box" fill size="s" items={lenTabs} value={len} onChange={(v) => { setLen(v); setQueryQuiet({ len: v }); play(cur, { length: v }); }} aria-label="길이" />
        <Tabs variant="box" fill size="s" items={themeTabs} value={theme} onChange={(v) => setTheme(v as ThemeId)} aria-label="테마" />
        <div className={s.teams} role="radiogroup" aria-label="구단">
          {TEAMS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={t.id === teamId}
              className={[s.team, t.id === teamId && s.teamOn].filter(Boolean).join(' ')}
              onClick={() => { setTeamId(t.id); setQueryQuiet({ team: t.id }); play(cur, { tid: t.id }); }}
            >
              <Emblem team={t} size={22} decorative />
              <span>{t.short}</span>
            </button>
          ))}
        </div>
        <label className={s.rm}>
          <input type="checkbox" checked={rm} onChange={(e) => { setRm(e.target.checked); setQueryQuiet({ rm: e.target.checked ? '1' : null }); play(cur, { reduced: e.target.checked }); }} />
          <span>움직임 줄이기로 보기 (흔들림·번쩍임 없이 글자와 정지된 빛만)</span>
        </label>
      </div>

      <section className={s.plan} aria-label="연출 계획">
        <p className={s.planKick}>{[plan.kicker, `세기 ${plan.tier}/5`].filter(Boolean).join(' · ')}</p>
        <h2 className="head">{plan.title}</h2>
        {plan.sub && <p className={s.planSub}>{plan.sub}</p>}
        <div className={s.track} aria-hidden>
          {plan.shells.map((sh, i) => (
            <i
              key={i}
              className={sh.sig ? s.tickSig : s.tick}
              style={{ left: `${(sh.t / total) * 100}%`, background: plan.palette[sh.c], height: `${8 + sh.r * 40}px` } as CSSProperties}
              title={SHELL_KO[sh.type]}
            />
          ))}
          {plan.ceremony && <span className={s.cer} style={{ left: `${((plan.dur - CEREMONY_OVERLAP) / total) * 100}%` }}>세리머니</span>}
          <span className={['num', s.trackEnd].join(' ')}>{(total / 1000).toFixed(1)}초</span>
        </div>
        <ol className={s.shells}>
          {plan.shells.map((sh, i) => (
            <li key={i}>
              <span className="num">{(sh.t / 1000).toFixed(2)}</span>
              <i style={{ background: plan.palette[sh.c] }} />
              <b>{SHELL_KO[sh.type]}</b>
              <span className={s.dim}>{sh.type === 'tracer' || sh.type === 'gerb' || sh.type === 'mine' ? '바닥·하늘 끝' : `반지름 ${Math.round(sh.r * 100)}`}</span>
            </li>
          ))}
        </ol>
        <p className={s.meta}>
          번쩍 {plan.flashes.length}번 · 흔들림 최대 <span className="num">{Math.max(0, ...plan.shakes.map((k) => k.amp)).toFixed(1)}</span>px · 글자 모양 {plan.look}
          {plan.letterbox ? ' · 위아래 검은 띠' : ''}
        </p>
      </section>

      <ol className={s.list} aria-label="홈런 종류">
        {HR_PRESETS.map((p, i) => {
          const pl = plans[i];
          const kinds = [...new Set(pl.shells.map((x) => SHELL_KO[x.type]))];
          return (
            <li key={p.key}>
              <button type="button" className={[s.row, p.key === cur && s.rowOn].filter(Boolean).join(' ')} onClick={() => play(p.key)} aria-pressed={p.key === cur}>
                <span className={['num', s.no].join(' ')}>{String(i + 1).padStart(2, '0')}</span>
                <span className={s.rowMain}>
                  <b>{pl.title}</b>
                  <small>{p.desc}</small>
                  <small className={s.kinds}>{kinds.join(' · ')}</small>
                </span>
                <span className={s.sw} aria-hidden>
                  {[...new Set(pl.shells.map((x) => x.c))].slice(0, 4).map((c) => <i key={c} style={{ background: pl.palette[c] }} />)}
                </span>
                <span className={['num', s.len].join(' ')}>{(totalOf(pl) / 1000).toFixed(1)}<small>초</small></span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
