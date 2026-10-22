// 경기 — 담당: 경기 화면 개발자 (이 폴더만 고친다)
// 보기 방식 4가지(빨리 보기 기본 · 주요 장면 · 이닝별 · 자세히) · 2D 경기장 · 점수판 · 투구 위치 · 문자 중계 · 강조 문구 · 경기 끝 요약.
// 주소로 장면 열기(스크린샷·공유): #/match?mode=detail&at=a21&beat=bip&ms=1800&pause=1 · state=pre|play|done · delay=ms
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ScreenProps } from '../../app/screen';
import { Button, CalloutAnnouncer, CalloutStage, useCalloutQueue, type CalloutData } from '../../ui';
import { ME, teamById } from '../../game/mock';
import { useTheme } from '../../theme/ThemeProvider';
import { GAME, LAST_GAME } from './local-mock';
import { activate, activateLast } from './active';
import { EndBar, MatchLoading, type MatchCtx } from './EndBar';
import { homerunFx, hrInfoOf, type HrHandle } from './hr-fx';
import {
  PLAYS, beatIndexForPlay, beatsFor, calloutPace, cursorOf, liveOf, scriptOf, totalMs, type Beat, type Cursor, type Mode,
} from './timeline';
import { Player, useSnapValue } from './player';
import { Stage } from './Stage';
import { Caption, LineScore, Scrubber, Transport } from './Board';
import { Feed, Matchup, Momentum, Tactics } from './Panels';
import { FinalOverlay, PreGame, Starters, Summary } from './Summary';
import { VIEW_KEY, seenKey, store } from './hooks';
import { readPrefs } from '../../app/prefs';
import s from './match.module.css';

const isMode = (v: unknown): v is Mode => v === 'quick' || v === 'key' || v === 'inning' || v === 'detail';
type Phase = 'pre' | 'play' | 'done';
const SPEEDS = [1, 2, 4];

function calloutFor(i: number, mode: Mode, classic: boolean): CalloutData {
  const p = PLAYS[i];
  const h = p.highlight!;
  const t = teamById(h.teamId);
  const mine = h.teamId === ME.teamId;
  const team = classic && !mine
    ? { primary: 'var(--fg)', secondary: 'var(--bg)', ink: 'var(--bg)' }
    : { primary: t.colors.primary, secondary: t.colors.secondary, ink: t.colors.ink };
  // 작은 줄 = 이닝 · 아웃 — 같은 말이 sub 에 있으면 sub 에서 뺀다
  const inn = `${p.inning}회${p.half === 'top' ? '초' : '말'}`;
  const outs = ['무사', '1사', '2사'][p.outsBefore] ?? '';
  const sub = h.sub?.replace(`${inn} `, '').replace(` ${inn}`, '').replace(`${outs} `, '');
  return { id: `${p.id}-${mode}`, kind: h.kind, title: h.title, sub, kicker: `${inn} · ${outs}`, meta: h.meta, causes: (p.causes ?? []).map((c) => c.text).slice(0, 2), team };
}

/** 주소의 at · beat 로 시작 박자 찾기 */
function startBeat(beats: Beat[], at: string | null, kind: string | null) {
  if (!at) return 0;
  const play = PLAYS.findIndex((p) => p.id === at);
  if (play < 0) return 0;
  const first = beatIndexForPlay(beats, play);
  if (!kind) return first;
  for (let k = first; k < beats.length; k++) {
    const b = beats[k];
    if (b.k === kind && ('play' in b ? b.play === play : 'flash' in b ? b.flash === play : true)) return k;
  }
  return first;
}

function MatchView({ query, ctx, endBar }: ScreenProps & { ctx: MatchCtx; endBar?: ReactNode }) {
  const { theme } = useTheme();
  const classic = theme === 'classic';
  const q0 = useRef(query).current;
  const [mode, setMode] = useState<Mode>(() => {
    const m = q0.get('mode');
    if (isMode(m)) return m;
    // 설정 화면의 '경기 보기 방식' (app/prefs · bb.prefs) — 예전 키 bb.matchView 도 읽어 준다
    const pref = readPrefs().watch;
    const saved = store.get(VIEW_KEY);
    return isMode(pref) ? pref : isMode(saved) ? saved : 'quick';
  });
  const [phase, setPhase] = useState<Phase>(() => {
    const st = q0.get('state');
    if (st === 'pre' || st === 'play' || st === 'done') return st;
    if (q0.get('at')) return 'play';
    return store.get(seenKey(GAME.match.id)) ? 'done' : 'pre';
  });
  const playerRef = useRef<Player | null>(null);
  if (!playerRef.current) {
    const beats = beatsFor(mode);
    playerRef.current = new Player(beats);
    const at = q0.get('at');
    const idx = startBeat(beats, at, q0.get('beat'));
    if (phase === 'done') playerRef.current.seekBeat(beats.length - 1);
    else if (at) playerRef.current.seekBeat(idx, Number(q0.get('ms') ?? 0) || 0);
  }
  const player = playerRef.current;
  const queue = useCalloutQueue();
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const classicRef = useRef(classic);
  classicRef.current = classic;

  // 강조 문구 박자 — 재생기가 멈춰 기다리고, 문구가 끝나면 이어 간다
  useEffect(() => {
    player.onBlock = (b) => {
      if (b.k === 'callout') queue.push(calloutFor(b.play, modeRef.current, classicRef.current));
    };
    return () => { player.onBlock = undefined; };
  }, [player, queue.push]); // eslint-disable-line react-hooks/exhaustive-deps

  // 처음 들어올 때 — 바로 재생 (주소에 pause=1 이면 멈춘 채)
  useEffect(() => {
    if (phase !== 'play' || q0.get('pause') === '1') return;
    const t = window.setTimeout(() => player.play(), Number(q0.get('delay') ?? 0) || 0);
    return () => window.clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => player.dispose(), [player]);

  // 화면 밖으로 가면 멈춤
  useEffect(() => {
    const on = () => { if (document.hidden) player.pause(); };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [player]);

  const idx = useSnapValue(player, (x) => x.idx);
  const playing = useSnapValue(player, (x) => x.playing);
  const speed = useSnapValue(player, (x) => x.speed);
  const blocked = useSnapValue(player, (x) => x.blocked);
  const ended = useSnapValue(player, (x) => x.ended);
  const ck = useSnapValue(player, (x) => {
    const c = cursorOf(player.beats[x.idx], x.local);
    return `${c.play}|${c.pitches}|${c.applied ? 1 : 0}`;
  });
  const quickLeft = useSnapValue(player, (x) => (mode === 'quick' ? Math.max(0, Math.round((player.total - x.t) / 100) / 10) : 0));
  const cursor: Cursor = useMemo(() => {
    const [a, b, c] = ck.split('|');
    return { play: Number(a), pitches: Number(b), applied: c === '1' };
  }, [ck]);
  const live = useMemo(() => liveOf(cursor), [cursor]);
  const beat = player.beats[idx];

  // 끝까지 보면 요약
  useEffect(() => {
    if (ended && phase === 'play') {
      store.set(seenKey(GAME.match.id), '1');
      const t = window.setTimeout(() => setPhase('done'), 700);
      return () => window.clearTimeout(t);
    }
  }, [ended, phase]);
  // 홈런 — 공이 담장을 넘는 순간(빨리 보기는 그 장면이 번쩍일 때) 홈런 연출(fx/homerun)을 무대 위에 띄운다.
  // 긴 판(주요 장면·이닝별·자세히)은 연출이 끝날 때까지 경기를 멈췄다가 이어 가고, 빨리 보기는 짧은 판을 얹기만 한다.
  const hrAt = useSnapValue(player, (x) => {
    const b = player.beats[x.idx];
    if (!x.playing || !b) return -1;
    if (b.k === 'fill') return b.flash != null && PLAYS[b.flash]?.code === 'HR' ? b.flash : -1;
    if (b.k !== 'bip' || PLAYS[b.play]?.code !== 'HR') return -1;
    const land = scriptOf(b.play).landing;
    return !land || x.local >= (land.t / b.rate) * 1000 ? b.play : -1;
  });
  const hrDone = useRef(new Set<string>());
  const fxNow = useRef<{ h: HrHandle; resume: boolean; idx: number } | null>(null);
  const alive = useRef(true);
  /** 띄운 연출을 걷는다 — resume 이면 연출 때문에 멈췄던 경기를 다시 굴린다 */
  const stopFx = useCallback((resume = false) => {
    const r = fxNow.current;
    fxNow.current = null;
    r?.h.stop();
    if (resume && r?.resume && alive.current) player.play();
  }, [player]);
  /** 사용자가 장면을 옮기면 — 연출은 걷고(멈췄던 경기는 이어서), 다시 지나는 홈런은 또 보여 준다 */
  const resetFx = useCallback(() => { stopFx(true); hrDone.current.clear(); }, [stopFx]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; stopFx(); }; }, [stopFx]);
  useEffect(() => {
    const p = hrAt >= 0 ? PLAYS[hrAt] : undefined;
    if (!p || hrDone.current.has(p.id)) return;
    hrDone.current.add(p.id);
    const long = mode !== 'quick';
    void homerunFx(document.querySelector<HTMLElement>('[data-stage]'), hrInfoOf(PLAYS, hrAt), long ? 'long' : 'short').then((h) => {
      if (!h) return;
      if (!alive.current) { h.stop(); return; }
      stopFx();
      const snap = player.getSnap();
      const rec = { h, resume: long && snap.playing, idx: snap.idx };
      if (rec.resume) player.pause();
      fxNow.current = rec;
      void h.done.then(() => {
        if (fxNow.current !== rec) return;
        fxNow.current = null;
        const now = player.getSnap();
        if (rec.resume && alive.current && !now.playing && now.idx === rec.idx) player.play();
      });
    });
  }, [hrAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // 끝 — 시즌 경기는 그날 결과를 넣는다(한 번만)
  const doneOnce = useRef(false);
  useEffect(() => {
    if (phase !== 'done' || doneOnce.current) return;
    doneOnce.current = true;
    ctx.onDone?.();
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchMode = useCallback((m: Mode) => {
    queue.clear();
    resetFx();
    const beats = beatsFor(m);
    if (phase === 'done' || ended) {
      player.swap(beats, 0);
      setPhase('play');
      player.play();
    } else {
      player.swap(beats, beatIndexForPlay(beats, cursor.play));
      if (m === 'quick') player.setSpeed(1);
    }
    setMode(m);
  }, [phase, ended, cursor.play, player, queue, resetFx]);

  const start = () => { resetFx(); setPhase('play'); player.seekBeat(0); player.play(); };
  const seekPlay = (play: number) => {
    queue.clear();
    resetFx();
    if (phase !== 'play') setPhase('play');
    player.seekBeat(beatIndexForPlay(player.beats, play));
  };
  const toScene = (play: number) => {
    queue.clear();
    resetFx();
    const beats = beatsFor('key');
    let k = beats.findIndex((b) => b.k === 'scene' && b.play === play);
    if (k < 0) k = beatIndexForPlay(beats, play);
    player.swap(beats, k);
    setMode('key');
    setPhase('play');
    player.play();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const skip = () => {
    queue.clear();
    stopFx(true);
    const bs = player.beats;
    if (blocked === 'halfsum') { player.release(true); return; }
    if (mode === 'quick') { player.seekBeat(bs.length - 1); return; }
    const want = mode === 'detail' ? 'pitch-next-play' : mode === 'key' ? 'scene' : 'half';
    for (let k = idx + 1; k < bs.length; k++) {
      const b = bs[k];
      if (want === 'pitch-next-play' ? ('play' in b && b.play > cursor.play) || b.k === 'end' : b.k === want || b.k === 'end') { player.seekBeat(k); return; }
    }
  };
  const toggle = () => {
    if (phase === 'pre') { start(); return; }
    if (phase === 'done' || ended) { switchMode(mode); return; }
    player.toggle();
  };
  const cycleSpeed = () => player.setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]);

  const done = phase === 'done';
  const pre = phase === 'pre';
  const showZone = !pre && !done && (mode === 'detail' || mode === 'key');
  const liveShown = done ? liveOf({ play: PLAYS.length - 1, pitches: PLAYS[PLAYS.length - 1].seq.length, applied: true }) : live;

  return (
    <div className={[s.screen, s['m-' + mode]].join(' ')}>
      <h1 className="sr-only">경기 — {teamById(GAME.match.awayId).name} 대 {teamById(GAME.match.homeId).name}</h1>
      <LineScore live={pre ? { ...liveOf({ play: 0, pitches: 0, applied: false }), inn: { away: Array(9).fill(null), home: Array(9).fill(null) } } : liveShown} done={done || pre} />
      <CalloutStage callout={queue.current} pace={calloutPace(mode)} onDone={() => { queue.next(); player.release(); }} className={s.stageWrap}>
        <Stage player={player} live={pre ? liveOf({ play: 0, pitches: 0, applied: false }) : liveShown} showZone={showZone} idle={pre}>
          {pre && <PreGame mode={mode} onStart={start} />}
          {done && <FinalOverlay />}
        </Stage>
      </CalloutStage>
      <CalloutAnnouncer callout={queue.current} />
      {!pre && <Caption beat={done ? player.beats[player.beats.length - 1] : beat} live={liveShown} />}
      {!pre && <Scrubber live={liveShown} onSeek={seekPlay} done={done} />}
      <Transport
        playing={playing && !pre && !done}
        speed={speed}
        mode={mode}
        onToggle={toggle}
        onSpeed={cycleSpeed}
        onSkip={skip}
        onMode={switchMode}
        disabled={pre}
        quickLeft={mode === 'quick' && !pre && !done ? quickLeft : undefined}
      />
      {blocked === 'halfsum' && !done && (
        <div className={s.next}>
          <Button block size="m" icon="arrow-right" onClick={() => player.release(true)}>다음 이닝</Button>
        </div>
      )}
      {pre && <Starters />}
      {done && endBar}
      {done && <Summary onReplay={switchMode} onScene={toScene} />}
      {!pre && !done && mode !== 'quick' && <Matchup live={live} />}
      {!pre && !done && mode === 'detail' && <Tactics live={live} />}
      {!pre && !done && <Momentum live={live} />}
      {!pre && <Feed live={liveShown} mode={mode} done={done} />}
      {import.meta.env.DEV && mode === 'quick' && <span hidden data-quick-ms={totalMs(player.beats)} />}
    </div>
  );
}

/* ───────── 어떤 경기를 띄울지 — 주소로 ─────────
   #/match            공용 목업 '어제 경기'
   #/match?g=season   시즌 다음 내 경기 (지금 바로 경기 — 엔진이 계산, 그날 앞 경기들은 먼저 친다)
   #/match?pvp=<id>   다른 감독과 한 대전 (서버가 정한 점수에 맞춘 기록)
   그 밖의 주소 값(mode · at · beat · state …)은 그대로 MatchView 가 읽는다 */
export default function MatchRoute(props: ScreenProps) {
  const g = props.query.get('g');
  const pvp = props.query.get('pvp');
  const n = props.query.get('n') ?? '';
  const [view, setView] = useState<{ key: string; ctx: MatchCtx } | null>(() => {
    if (g || pvp) return null;
    activateLast();
    return { key: LAST_GAME.match.id, ctx: { kind: 'last' } };
  });
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!g && !pvp) { activateLast(); setView({ key: LAST_GAME.match.id, ctx: { kind: 'last' } }); return; }
    let alive = true;
    setView(null);
    setErr(null);
    (async () => {
      try {
        if (g === 'season') {
          const { prepareSeasonGame } = await import('./season-game');
          const r = await prepareSeasonGame();
          if (!alive) return;
          if (!r) { setView({ key: 'over', ctx: { kind: 'over' } }); return; }
          activate(r.game);
          setView({ key: r.game.match.id, ctx: r.ctx });
        } else if (pvp) {
          const { preparePvpGame } = await import('./pvp-game');
          const r = await preparePvpGame(pvp);
          if (!alive) return;
          if (!r) { setErr('이 대전 기록을 찾지 못했어요'); return; }
          activate(r.game);
          setView({ key: r.game.match.id, ctx: r.ctx });
        }
      } catch (e) {
        console.error(e);
        if (alive) setErr('경기를 준비하지 못했어요');
      }
    })();
    return () => { alive = false; };
  }, [g, pvp, n]);
  if (err) return <MatchLoading text={err} failed />;
  if (!view) return <MatchLoading text={g === 'season' ? '경기 준비 중 — 선수단 · 날씨 · 구장을 맞추고 있어요' : '경기 기록을 불러오는 중이에요'} />;
  if (view.ctx.kind === 'over') return <EndBar ctx={view.ctx} standalone />;
  return <MatchView key={view.key} {...props} ctx={view.ctx} endBar={view.ctx.kind === 'last' ? undefined : <EndBar ctx={view.ctx} />} />;
}
