// 경기 전 '오늘의 구장' · 경기 끝 요약 (오늘의 결정적 요인 · MVP · 승리 확률 흐름 · 명장면)
import { useState, type CSSProperties, type PointerEvent as RPE } from 'react';
import { Button, Emblem, Icon, fmt, type IconName } from '../../ui';
import { ME, playerById, teamById } from '../../game/mock';
import type { CauseFactor, Stadium } from '../../game/types';
import { PlayerArt } from '../../art/PlayerArt';
import { GAME } from './local-mock';
import { CALLOUTS_ALL, HALVES, MODES, PLAYS, PLAY_COUNT, type Mode } from './timeline';
import { batterToday, ipText, isSeasonGame, pitcherToday } from './Panels';
import { eraLabel, pitLine } from '../../season/store';
import { halfKo } from './Board';
import s from './Summary.module.css';

const away = () => teamById(GAME.match.awayId);
const home = () => teamById(GAME.match.homeId);

/* ───────── 이 구장에서 유리한 선수 유형 (요구 33) ───────── */
export function parkAdvice(st: Stadium): { feature: string; favors: string } {
  const [lf, cf, rf] = st.fence;
  const [wl, , wr] = st.wallM;
  const bits: string[] = [];
  let favors = '';
  if (wr >= 5 && rf <= 97) { bits.push(`우측 ${wr}m 높은 담장`); favors = '우측 담장을 맞히는 갭 히터 · 좌측으로 당기는 우타 거포'; }
  else if (wl >= 5 && lf <= 97) { bits.push(`좌측 ${wl}m 높은 담장`); favors = '좌측 담장을 맞히는 갭 히터 · 우측으로 당기는 좌타 거포'; }
  else if (Math.max(...st.wallM) >= 4.5) { bits.push('짧지만 높은 담장'); favors = '펜스 직격 2루타가 많은 라인드라이브 타자'; }
  if (st.surface === 'turf') { bits.push('인조잔디'); favors ||= '발 빠른 타자 — 땅볼이 빨라 내야 안타↑'; }
  if (st.roof === 'dome') bits.push('돔 — 날씨 영향 없음');
  if (cf >= 124) { bits.push('가장 넓은 외야'); favors ||= '발 빠른 외야수 · 3루타 노리는 타자'; }
  if (st.foul === 'wide') { bits.push('넓은 파울 지역'); favors ||= '뜬공 투수 — 파울 뜬공이 아웃이 돼요'; }
  if (st.foul === 'narrow') { bits.push('좁은 파울 지역'); favors ||= '끈질긴 타자 — 파울이 살아남아요'; }
  if (lf + rf <= 190 && Math.max(...st.wallM) < 3) { bits.push('짧고 낮은 담장'); favors ||= '뜬공 거포'; }
  return { feature: bits.join(' · ') || '중립 구장', favors: favors || '특별한 쏠림 없음 — 고른 능력치' };
}

/* ───────── 경기 전 ───────── */
export function PreGame({ mode, onStart }: { mode: Mode; onStart: () => void }) {
  const st = home().stadium;
  const adv = parkAdvice(st);
  const label = MODES.find((m) => m.value === mode)!.label;
  return (
    <div className={s.pre}>
      <div className={s.preIn}>
        <p className={s.eyebrow}>오늘의 구장</p>
        <h2 className={s.preTitle}>{st.name}</h2>
        <p className={s.preFeat}>{adv.feature}</p>
        <p className={s.preNote}>{st.note}</p>
        <p className={s.favor}><span>유리한 타자</span>{adv.favors}</p>
        <Button size="l" block icon="play" onClick={onStart} trailing={mode === 'quick' ? '10초' : undefined}>
          경기 보기 · {label}
        </Button>
      </div>
    </div>
  );
}

/** 경기 전 선발 맞대결 (타자 대 투수 자리) */
export function Starters() {
  const a = away(), h = home();
  const ap = playerById(GAME.away.starter)!, hp = playerById(GAME.home.starter)!;
  const wp = PLAYS[0].wp[0];
  const myHome = GAME.match.homeId === ME.teamId;
  const my = Math.round((myHome ? wp : 1 - wp) * 100);
  const [, mm, dd] = GAME.match.date.split('-');
  const date = `${Number(mm)}월 ${Number(dd)}일`;
  return (
    <section className={s.starters} aria-label="선발 투수">
      <p className={s.stHead}><span>선발 맞대결</span><small>{date} {GAME.match.time} · {h.stadium.name}</small></p>
      <div className={s.stRow}>
        {[{ t: a, p: ap, set: 'away' as const }, { t: h, p: hp, set: 'home' as const }].map(({ t, p, set }, i) => (
          <div key={t.id} className={[s.st, i === 1 && s.stR].filter(Boolean).join(' ')} style={{ '--tc': t.colors.primary } as CSSProperties}>
            <div className={['halftone', s.stFace].join(' ')}><PlayerArt player={p} team={t} set={set} variant="portrait" eager /></div>
            <div className={s.stInfo}>
              <p className={s.stTeam}><Emblem team={t} size={14} />{t.short}</p>
              <p className={s.stName}>{p.name}</p>
              {isSeasonGame() ? (() => {
                const l = pitLine(p.id);
                return <p className={s.stLine}>{l.outs ? <><b className="num">{eraLabel(l)}</b> 평균자책 · <b className="num">{l.w}</b>승 <b className="num">{l.l}</b>패</> : '시즌 첫 등판'}</p>;
              })() : <p className={s.stLine}><b className="num">{fmt.era(p.season.pit?.era ?? 0)}</b> 평균자책 · <b className="num">{p.season.pit?.w ?? 0}</b>승</p>}
            </div>
          </div>
        ))}
      </div>
      <p className={s.stWp}>
        <span>{teamById(ME.teamId).short} 승리 확률 예상</span>
        <b className="num-display">{my}<i>%</i></b>
      </p>
    </section>
  );
}

/* ───────── 경기 끝 겹침 (무대 위) ───────── */
export function FinalOverlay() {
  const [a, h] = GAME.match.final;
  const win = h > a ? home() : away();
  return (
    <div className={s.final} aria-hidden>
      <p className={s.finalTag}>경기 끝{GAME.match.walkoff ? ' · 끝내기' : ''}</p>
      <p className={s.finalScore}>
        <span><Emblem team={away()} size={20} /><b className="num-display">{a}</b></span>
        <i>:</i>
        <span><b className="num-display">{h}</b><Emblem team={home()} size={20} /></span>
      </p>
      <p className={s.finalWin}>{win.name} 승리</p>
    </div>
  );
}

/* ───────── MVP — 승리 기여(WPA) 가장 큰 선수 ───────── */
export function computeMvp() {
  const wpa = new Map<string, number>();
  const add = (id: string, v: number) => wpa.set(id, (wpa.get(id) ?? 0) + v);
  PLAYS.forEach((p) => {
    const dHome = p.wp[1] - p.wp[0];
    const dBat = p.half === 'top' ? -dHome : dHome;
    if (p.code === 'SB') { add(p.basesBefore[0]!, dBat); return; }
    if (p.highlight?.kind === 'defense' && p.defense) {
      const f = p.defense.fielders.find((x) => x.dive) ?? p.defense.fielders[0];
      add(f.playerId, -dBat * 0.7);
      add(p.pitcherId, -dBat * 0.3);
    } else add(p.pitcherId, -dBat);
    add(p.batterId, dBat);
  });
  if (GAME.match.decision.gwrbi) add(GAME.match.decision.gwrbi, 0.1);
  const [fa, fh] = GAME.match.final;
  const winTeam = fh > fa ? GAME.home : GAME.away;
  const ids = new Set([...winTeam.batting.map((b) => b.pid), winTeam.starter, ...winTeam.bullpen, ...winTeam.bench]);
  const best = [...wpa.entries()].filter(([id]) => ids.has(id)).sort((x, y) => y[1] - x[1])[0];
  return { id: best[0], wpa: best[1], teamId: winTeam.teamId };
}

const FACTOR_ICON: Record<CauseFactor, IconName> = {
  wind: 'wind', weather: 'cloud', fatigue: 'flame', adapt: 'eye', platoon: 'swap', signature: 'pitch', form: 'steal', hidden: 'star',
  affinity: 'sun', chem: 'bolt', teamcolor: 'users', explosion: 'bolt', gear: 'bat', enhance: 'arrow-up', park: 'stadium', range: 'glove',
};
const FACTOR_KO: Record<CauseFactor, string> = {
  wind: '바람', weather: '날씨', fatigue: '피로', adapt: '타자 적응', platoon: '좌우 상성', signature: '고유 구종', form: '폼', hidden: '숨은 능력',
  affinity: '날씨 궁합', chem: '케미', teamcolor: '팀컬러', explosion: '능력치 폭발', gear: '장비', enhance: '강화', park: '구장', range: '수비 범위',
};

/* ───────── 경기 끝 요약 ───────── */
export function Summary({ onReplay, onScene }: { onReplay: (m: Mode) => void; onScene: (play: number) => void }) {
  const m = GAME.match;
  const [a, h] = m.final;
  const mvp = computeMvp();
  const mp = playerById(mvp.id)!;
  const mt = teamById(mvp.teamId);
  const isPitcher = mp.pos === 'P';
  const bt = batterToday(mp.id, PLAY_COUNT);
  const pt = pitcherToday(mp.id, PLAY_COUNT);
  const defPlay = PLAYS.find((p) => p.highlight?.kind === 'defense' && p.defense?.fielders.some((f) => f.playerId === mp.id && f.dive));
  const wo = PLAYS.find((p) => p.highlight?.kind === 'walkoff' && p.batterId === mp.id);
  const mvpLine = isPitcher
    ? `${ipText(pt.outs)}이닝 · 삼진 ${pt.k} · ${pt.r}실점`
    : `${bt.ab}타수 ${bt.h}안타${bt.rbi ? ` ${bt.rbi}타점` : ''}${bt.bb ? ` ${bt.bb}볼넷` : ''}`;
  const moments = [wo && '9회말 끝내기 안타', defPlay && `${defPlay.inning}회 다이빙 캐치 (잡을 확률 ${Math.round((defPlay.defense!.catchProb) * 100)}%)`].filter(Boolean) as string[];
  const name = (id?: string) => (id ? playerById(id)?.name ?? '' : '');
  return (
    <div className={s.sum}>
      <section className={s.result}>
        <p className={s.resTag}>{m.date.slice(5).replace('-', '.')} · {home().stadium.name}{m.walkoff ? ' · 9회말 끝내기' : ''}</p>
        <div className={s.resRow}>
          <div className={[s.resTeam, a > h && s.win].filter(Boolean).join(' ')}><Emblem team={away()} size={34} /><span>{away().short}</span></div>
          <p className={s.resScore}><b className="num-display">{a}</b><i /><b className="num-display">{h}</b></p>
          <div className={[s.resTeam, s.resR, h > a && s.win].filter(Boolean).join(' ')}><span>{home().short}</span><Emblem team={home()} size={34} /></div>
        </div>
        <dl className={s.dec}>
          <div><dt>승</dt><dd>{name(m.decision.win)}</dd></div>
          <div><dt>패</dt><dd>{name(m.decision.loss)}</dd></div>
          {m.decision.save && <div><dt>세</dt><dd>{name(m.decision.save)}</dd></div>}
          {m.decision.gwrbi && <div><dt>결승타</dt><dd>{name(m.decision.gwrbi)}</dd></div>}
        </dl>
      </section>

      <section className={s.mvp} style={{ '--tc': mt.colors.primary } as CSSProperties}>
        <div className={['halftone', s.mvpArt].join(' ')}>
          <PlayerArt player={mp} team={mt} variant="portrait" background="team" eager />
        </div>
        <div className={s.mvpInfo}>
          <p className={s.eyebrow}>오늘의 MVP</p>
          <p className={s.mvpName}>{mp.name}</p>
          <p className={s.mvpLine}>{mvpLine}</p>
          {moments.map((x) => <p key={x} className={s.mvpMoment}>{x}</p>)}
          <p className={s.mvpWpa}><span>승리 기여</span><b className="num">{fmt.signed(mvp.wpa * 100, 0)}</b><small>%p</small></p>
        </div>
      </section>

      <section className={s.sec}>
        <h3 className={s.h}><span>오늘의 결정적 요인</span><small>엔진이 '그 요인이 없었다면'을 다시 계산</small></h3>
        <ol className={s.factors}>
          {m.keyFactors.map((f, i) => (
            <li key={i} className={s.factor}>
              <span className={['num', s.fNo].join(' ')}>{i + 1}</span>
              <Icon name={FACTOR_ICON[f.factor]} size={18} className={s.fIco} />
              <div>
                <p className={s.fHead}>{FACTOR_KO[f.factor]}{f.decisive && <em>결정적</em>}</p>
                <p className={s.fText}>{f.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className={s.sec}>
        <h3 className={s.h}><span>승리 확률 흐름</span><small>{teamById(ME.teamId).short} 기준 · 점을 누르면 그 장면</small></h3>
        <WpChart onScene={onScene} />
      </section>

      <section className={s.sec}>
        <h3 className={s.h}><span>명장면</span><small>{CALLOUTS_ALL.length}개</small></h3>
        <ol className={s.scenes}>
          {CALLOUTS_ALL.map((i) => {
            const p = PLAYS[i];
            const t = teamById(p.highlight!.teamId);
            return (
              <li key={p.id}>
                <button type="button" className={s.scene} onClick={() => onScene(i)} style={{ '--tc': t.colors.primary } as CSSProperties}>
                  <span className={s.scInn}><b className="num">{p.inning}</b>회{halfKo(p.half)}</span>
                  <span className={s.scBody}>
                    <b>{p.highlight!.title}</b>
                    <small>{p.highlight!.sub}{p.highlight!.meta ? ` · ${p.highlight!.meta}` : ''}</small>
                  </span>
                  <Icon name="play" size={15} className={s.scPlay} />
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <section className={[s.sec, s.info].join(' ')}>
        <p><span>관중</span><b className="num">{fmt.int(m.attendance)}</b>명</p>
        <p><span>경기 시간</span><b className="num">{m.duration}</b></p>
        <p><span>날씨</span>{m.weather.tempC}° {m.weather.skyKo} · {m.weather.windKo} {m.weather.windMps}m/s</p>
      </section>

      <div className={s.again}>
        <Button variant="secondary" icon="play" onClick={() => onReplay('key')}>주요 장면 다시</Button>
        <Button variant="secondary" icon="eye" onClick={() => onReplay('detail')}>자세히 다시 보기</Button>
      </div>
    </div>
  );
}

/* ───────── 승리 확률 그래프 ───────── */
function WpChart({ onScene }: { onScene: (play: number) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const myHome = GAME.match.homeId === ME.teamId;
  const my = (w: number) => (myHome ? w : 1 - w);
  const W = 340, H = 132, PL = 26, PR = 8, PT = 8, PB = 18;
  const x = (i: number) => PL + ((i + 1) / PLAY_COUNT) * (W - PL - PR);
  const y = (w: number) => PT + (1 - my(w)) * (H - PT - PB);
  const pts = [`${PL},${y(PLAYS[0].wp[0]).toFixed(1)}`, ...PLAYS.map((p, i) => `${x(i).toFixed(1)},${y(p.wp[1]).toFixed(1)}`)];
  const mine = teamById(ME.teamId), opp = teamById(myHome ? GAME.match.awayId : GAME.match.homeId);
  const area = `M${PL},${y(0.5)} L${pts.join(' L')} L${x(PLAY_COUNT - 1)},${y(0.5)} Z`;
  const onMove = (e: RPE<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const u = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((u - PL) / (W - PL - PR)) * PLAY_COUNT - 1);
    setHover(Math.max(0, Math.min(PLAY_COUNT - 1, i)));
  };
  const hp = hover != null ? PLAYS[hover] : null;
  return (
    <div className={s.chart}>
      <svg viewBox={`0 0 ${W} ${H}`} className={s.chartSvg} onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label="경기 내내 승리 확률">
        <defs>
          <clipPath id="wpTop"><rect x="0" y="0" width={W} height={y(0.5)} /></clipPath>
          <clipPath id="wpBot"><rect x="0" y={y(0.5)} width={W} height={H} /></clipPath>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <g key={g}>
            <line x1={PL} x2={W - PR} y1={y(myHome ? g : 1 - g)} y2={y(myHome ? g : 1 - g)} className={g === 0.5 ? s.gMid : s.grid} />
            <text x={PL - 5} y={y(myHome ? g : 1 - g) + 3} textAnchor="end" className={s.axis}>{Math.round(g * 100)}</text>
          </g>
        ))}
        {HALVES.filter((hh) => hh.half === 'top').map((hh) => (
          <text key={hh.key} x={x(hh.first - 1) + 2} y={H - 4} className={s.axis}>{hh.inning}</text>
        ))}
        <path d={area} clipPath="url(#wpTop)" style={{ fill: mine.colors.primary }} className={s.areaMine} />
        <path d={area} clipPath="url(#wpBot)" style={{ fill: opp.colors.primary }} className={s.areaOpp} />
        <polyline points={pts.join(' ')} className={s.line} />
        {hp && <line x1={x(hover!)} x2={x(hover!)} y1={PT} y2={H - PB} className={s.cross} />}
        {CALLOUTS_ALL.map((i) => (
          <g key={i} className={s.dot} onClick={() => onScene(i)}>
            <circle cx={x(i)} cy={y(PLAYS[i].wp[1])} r={11} className={s.hit} />
            <circle cx={x(i)} cy={y(PLAYS[i].wp[1])} r={4.2} style={{ fill: teamById(PLAYS[i].highlight!.teamId).colors.primary }} />
          </g>
        ))}
        <text x={W - PR} y={PT + 9} textAnchor="end" className={s.lab}>{mine.short} 쪽</text>
        <text x={W - PR} y={H - PB - 4} textAnchor="end" className={s.lab}>{opp.short} 쪽</text>
      </svg>
      <p className={s.tip} aria-live="polite">
        {hp
          ? <><b>{hp.inning}회{halfKo(hp.half)}</b> {hp.text} <span className="num">{Math.round(my(hp.wp[1]) * 100)}%</span></>
          : <span className={s.tipDim}>그래프 위를 움직이면 그 순간을 보여 줘요</span>}
      </p>
    </div>
  );
}
