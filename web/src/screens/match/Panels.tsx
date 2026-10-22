// 타자 대 투수 · 분위기 막대 · 작전(자세히 보기에서만) · 문자 중계
import { useState, type CSSProperties, type ReactNode } from 'react';
import { Button, Emblem, Icon, Sheet, fmt, useToast, type IconName } from '../../ui';
import { ME, playerById, teamById } from '../../game/mock';
import { ROLE_KO } from '../../game/labels';
import type { Player, Team } from '../../game/types';
import { PlayerArt } from '../../art/PlayerArt';
import { GAME, type FullPlay } from './local-mock';
import { HALVES, PLAYS, PLAY_COUNT, halfOf, type Live, type Mode } from './timeline';
import { halfKo, halfSummary, notationOf, slotLabel } from './Board';
import s from './Panels.module.css';

const away = () => teamById(GAME.match.awayId);
const home = () => teamById(GAME.match.homeId);
const HITS = ['1B', '2B', '3B', 'HR'];

/* ───────── 오늘 기록 ───────── */
export function batterToday(id: string, upto: number) {
  let ab = 0, h = 0, rbi = 0, bb = 0, pa = 0;
  for (let i = 0; i < upto; i++) {
    const p = PLAYS[i];
    if (p.batterId !== id || !p.isPA) continue;
    pa++;
    if (p.code === 'BB' || p.code === 'HBP') bb++;
    else if (p.code !== 'SF' && p.code !== 'SAC') ab++;
    if (HITS.includes(p.code)) h++;
    rbi += p.rbi;
  }
  return { ab, h, rbi, bb, pa };
}

export function pitcherToday(id: string, upto: number) {
  let outs = 0, k = 0, r = 0, pitches = 0, h = 0, bb = 0;
  for (let i = 0; i < upto; i++) {
    const p = PLAYS[i];
    if (p.pitcherId !== id) continue;
    outs += Math.max(0, Math.min(3, p.outsAfter) - p.outsBefore);
    if (p.code === 'K') k++;
    if (HITS.includes(p.code)) h++;
    if (p.code === 'BB' || p.code === 'HBP') bb++;
    const prev = i > 0 ? PLAYS[i - 1].score : [0, 0];
    r += p.half === 'top' ? p.score[0] - prev[0] : p.score[1] - prev[1];
    pitches += p.seq.length;
  }
  return { outs, k, r, pitches, h, bb };
}

export const ipText = (outs: number) => {
  const w = Math.floor(outs / 3), f = outs % 3;
  return `${w}${f === 1 ? '⅓' : f === 2 ? '⅔' : ''}`;
};

function stamina(p: Player, pitches: number) {
  const st = p.attrs.stamina ?? 60;
  const cap = p.role === 'SP' ? 58 + st * 0.62 : 14 + st * 0.3;
  return Math.max(0, Math.min(1, 1 - pitches / cap));
}

/* ───────── 타자 대 투수 ───────── */
export function Matchup({ live, label }: { live: Live; label?: string }) {
  const p = live.play;
  const batter = playerById(p.batterId)!;
  const pitcher = playerById(p.pitcherId)!;
  const batTeam = p.half === 'top' ? away() : home();
  const fldTeam = p.half === 'top' ? home() : away();
  const bt = batterToday(batter.id, live.playIdx + (live.applied ? 1 : 0));
  const pt = pitcherToday(pitcher.id, live.playIdx);
  const pPitches = live.pitcherPitches;
  const sta = stamina(pitcher, pPitches);
  const season = batter.season.bat;
  const pseason = pitcher.season.pit;
  const role = pitcher.role ? ROLE_KO[pitcher.role] : '투수';
  const todayB = bt.pa === 0 ? '오늘 첫 타석' : `오늘 ${bt.ab}타수 ${bt.h}안타${bt.rbi ? ` ${bt.rbi}타점` : ''}${bt.bb ? ` ${bt.bb}볼넷` : ''}`;
  const todayP = `${ipText(pt.outs)}이닝 · 삼진 ${pt.k} · ${pt.r}실점`;
  return (
    <section className={s.duel} aria-label={label ?? '타자 대 투수'}>
      <Side
        team={batTeam} player={batter} set={p.half === 'top' ? 'away' : 'home'}
        role={`타자 · ${slotLabel(p)}`}
        stat={season ? <><b className="num">{fmt.avg(season.avg)}</b><span>타율</span><b className="num">{season.hr}</b><span>홈런</span></> : null}
        line={todayB}
      />
      <Side
        right team={fldTeam} player={pitcher} set={p.half === 'top' ? 'home' : 'away'}
        role={`투수 · ${role}`}
        stat={pseason ? <><b className="num">{fmt.era(pseason.era)}</b><span>평균자책</span><b className="num">{pPitches}</b><span>구</span></> : null}
        line={todayP}
        meter={sta}
      />
    </section>
  );
}

function Side({ team, player, set, role, stat, line, right, meter }: {
  team: Team; player: Player; set: 'home' | 'away'; role: string; stat: ReactNode; line: string; right?: boolean; meter?: number;
}) {
  return (
    <div className={[s.side, right && s.right].filter(Boolean).join(' ')} style={{ '--tc': team.colors.primary } as CSSProperties}>
      <div className={['halftone', s.face].join(' ')}>
        <PlayerArt player={player} team={team} set={set} variant="portrait" />
      </div>
      <div className={s.info}>
        <p className={s.role}>{role}</p>
        <p className={s.name}>{player.name}</p>
        <p className={s.stat}>{stat}</p>
        <p className={s.today}>{line}</p>
        {meter != null && (
          <p className={s.meter} aria-label={`체력 ${Math.round(meter * 100)}%`}>
            <span>체력</span>
            <i><u style={{ width: `${Math.round(meter * 100)}%` }} className={meter < 0.25 ? s.low : undefined} /></i>
          </p>
        )}
      </div>
    </div>
  );
}

/* ───────── 분위기 막대 + 승리 확률 ───────── */
export function Momentum({ live }: { live: Live }) {
  const a = away(), h = home();
  const m = live.mom;
  const lead = Math.abs(m) < 0.1 ? null : m > 0 ? h : a;
  const myHome = GAME.match.homeId === ME.teamId;
  const my = myHome ? live.wp : 1 - live.wp;
  const width = Math.min(50, Math.abs(m) * 50);
  return (
    <section className={s.mom} aria-label={`분위기 ${lead ? lead.short + ' 쪽' : '팽팽'}, 승리 확률 ${Math.round(my * 100)}%`}>
      <div className={s.momMain}>
        <p className={s.momHead}>
          <span>분위기</span>
          <b>{lead ? `${lead.short} 쪽으로` : '팽팽'}</b>
        </p>
        <div className={s.track}>
          <Emblem team={a} size={16} className={s.tEm} />
          <span className={s.bar}>
            <i className={s.mid} />
            <i
              className={s.fill}
              style={{
                width: `${width}%`,
                left: m >= 0 ? '50%' : `${50 - width}%`,
                background: (lead ?? h).colors.primary,
              }}
            />
          </span>
          <Emblem team={h} size={16} className={s.tEm} />
        </div>
      </div>
      <div className={s.wp}>
        <small>{teamById(ME.teamId).short} 승리 확률</small>
        <b className="num-display">{Math.round(my * 100)}<i>%</i></b>
      </div>
    </section>
  );
}

/* ───────── 작전 (자세히 보기에서만) ───────── */
interface Tac { key: string; label: string; sub: string; icon: IconName; off?: boolean; good: string; risk: string }

function stealPct(runnerId: string, pitcherId: string, catcherId: string) {
  const r = playerById(runnerId)?.attrs ?? {};
  const p = playerById(pitcherId)?.attrs ?? {};
  const c = playerById(catcherId)?.attrs ?? {};
  const v = 0.66 + ((r.stealJump ?? 55) - 60) * 0.007 + ((r.speed ?? 55) - 60) * 0.004 - ((p.slideStep ?? 60) - 60) * 0.003 - ((c.popTime ?? 60) - 60) * 0.004;
  return Math.round(Math.max(0.28, Math.min(0.93, v)) * 100);
}

export function Tactics({ live }: { live: Live }) {
  const toast = useToast();
  const [open, setOpen] = useState<Tac | null>(null);
  const p = live.play;
  const myHome = GAME.match.homeId === ME.teamId;
  const myBatting = (p.half === 'bot') === myHome;
  const [r1, r2, r3] = live.bases;
  const mySide = myHome ? GAME.home : GAME.away;
  const oppSide = myHome ? GAME.away : GAME.home;
  let list: Tac[];
  if (myBatting) {
    const runner = r2 && !r3 ? r2 : r1 && !r2 ? r1 : null;
    const pct = runner ? stealPct(runner, p.pitcherId, oppSide.defense.C) : 0;
    list = [
      { key: 'steal', label: '도루', icon: 'steal', sub: runner ? `성공 ${pct}%` : '주자 없음', off: !runner, good: '득점권으로 한 베이스', risk: `잡히면 아웃 하나 (실패 ${100 - pct}%)` },
      { key: 'bunt', label: '번트', icon: 'bunt', sub: live.outs >= 2 ? '2아웃' : r1 || r2 ? '희생 번트' : '기습 번트', off: live.outs >= 2, good: '주자를 한 베이스 앞으로', risk: '아웃 하나를 내줌' },
      { key: 'hr', label: '히트앤런', icon: 'bolt', sub: r1 ? '1루 주자 출발' : '주자 없음', off: !r1, good: '병살 위험 ↓ · 1·3루 기회', risk: '헛스윙이면 주자가 잡힘' },
      { key: 'ph', label: '대타', icon: 'swap', sub: `벤치 ${mySide.bench.length}명`, good: '좌우 상성 맞춤', risk: '빠진 선수는 다시 못 나옴' },
    ];
  } else {
    list = [
      { key: 'ibb', label: '고의4구', icon: 'arrow-right', sub: r1 ? '1루가 차 있음' : '1루로 보냄', off: !!r1 && !!r2 && !!r3, good: '강타자를 피하고 병살 노림', risk: '주자 하나를 그냥 내보냄' },
      { key: 'pc', label: '투수 교체', icon: 'pitch', sub: `불펜 ${mySide.bullpen.filter((x) => x !== p.pitcherId).length}명`, good: '지친 투수를 쉬게', risk: '불펜 소모 — 내일 연투 제한' },
      { key: 'shift', label: '수비 위치', icon: 'lineup', sub: live.outs < 2 && (r3 || r2) ? '전진 수비' : '정상 수비', good: '땅볼을 홈에서 막음', risk: '안타 범위가 넓어짐' },
      { key: 'pick', label: '견제', icon: 'eye', sub: r1 ? '1루 견제' : '주자 없음', off: !r1, good: '리드 폭을 줄여 도루 억제', risk: '악송구면 한 베이스' },
    ];
  }
  return (
    <section className={s.tac} aria-label="작전">
      <p className={s.tacHead}>
        <span>작전</span>
        <small>{myBatting ? '공격 중 — 다음 공부터 반영' : '수비 중 — 다음 공부터 반영'}</small>
      </p>
      <div className={s.tacRow}>
        {list.map((t) => (
          <button key={t.key} type="button" className={s.tacBtn} disabled={t.off} onClick={() => setOpen(t)}>
            <Icon name={t.icon} size={17} />
            <b>{t.label}</b>
            <small className={t.key === 'steal' && !t.off ? 'num' : undefined}>{t.sub}</small>
          </button>
        ))}
      </div>
      <Sheet
        open={!!open}
        onClose={() => setOpen(null)}
        title={open?.label}
        sub={open?.sub}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setOpen(null)}>그만두기</Button>
            <Button onClick={() => { toast({ text: `${open?.label} 사인을 냈어요 · 다음 공부터`, tone: 'accent' }); setOpen(null); }}>작전 걸기</Button>
          </>
        )}
      >
        {open && (
          <dl className={s.tacSheet}>
            <div><dt>좋아지는 것</dt><dd>{open.good}</dd></div>
            <div><dt>위험한 것</dt><dd>{open.risk}</dd></div>
            <p className={s.tacNote}>결과는 서버의 경기 엔진이 정해요. 다음 공이 오기 전에 걸면 바로 반영돼요.</p>
          </dl>
        )}
      </Sheet>
    </section>
  );
}

/* ───────── 문자 중계 ───────── */
const RES_KO = { ball: '볼', called: '스트라이크', swing: '헛스윙', foul: '파울', inplay: '타격', hbp: '몸에 맞는 공' } as const;

function runsIn(p: FullPlay) {
  const i = PLAYS.indexOf(p);
  const prev = i > 0 ? PLAYS[i - 1].score : [0, 0];
  return p.half === 'top' ? p.score[0] - prev[0] : p.score[1] - prev[1];
}

export function Feed({ live, mode, done }: { live: Live; mode: Mode; done?: boolean }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const cur = live.playIdx;
  const upto = done ? PLAY_COUNT - 1 : live.applied ? cur : cur - 1;
  const curHalf = halfOf(cur);
  const shown = HALVES.filter((h) => h.first <= Math.max(upto, done ? upto : cur)).reverse();
  return (
    <section className={s.feed} aria-label="문자 중계">
      <h3 className={s.feedHead}>
        <span>문자 중계</span>
        <small>{done ? '경기 전체' : `${live.play.inning}회${halfKo(live.play.half)} 진행 중`}</small>
      </h3>
      {shown.map((h) => {
        const current = !done && h.key === curHalf.key;
        const expanded = current || !!open[h.key];
        const team = h.half === 'top' ? away() : home();
        const plays = PLAYS.slice(h.first, Math.min(h.last, upto) + 1);
        const finished = upto >= h.last;
        const sum = finished ? halfSummary(h.first) : null;
        return (
          <div key={h.key} className={[s.half, current && s.halfNow].filter(Boolean).join(' ')}>
            <button type="button" className={s.halfBar} onClick={() => !current && setOpen((o) => ({ ...o, [h.key]: !o[h.key] }))} aria-expanded={expanded}>
              <span className={s.hInn}><b className="num">{h.inning}</b>회{halfKo(h.half)}</span>
              <span className={s.hTeam}><i style={{ background: team.colors.primary }} />{team.short}</span>
              <span className={s.hSum}>{sum ? sum.line : '진행 중'}</span>
              {sum && <b className={['num', s.hRuns, sum.runs > 0 && s.hRunsOn].filter(Boolean).join(' ')}>{sum.runs}</b>}
              {!current && <Icon name={expanded ? 'chevron-down' : 'chevron'} size={14} className={s.hChev} />}
            </button>
            {expanded && (
              <ol className={s.rows}>
                {current && mode === 'detail' && !live.applied && live.thrown > 0 && (
                  <li className={s.pitchBlock}>
                    {live.play.seq.slice(0, live.thrown).reverse().map((pt) => (
                      <p key={pt.no} className={s.pitchLine}>
                        <span className={['num', s.pNo].join(' ')}>{pt.no}구</span>
                        {pt.sig && <i className={s.sig} style={{ background: pt.sig }} aria-hidden />}
                        <span className={pt.sig ? s.pSig : undefined}>{pt.name}</span>
                        <b className="num">{pt.kmh}</b>
                        <span className={s.pRes}>{RES_KO[pt.res]}</span>
                        <span className={['num', s.pCnt].join(' ')}>{pt.b}-{pt.s}</span>
                      </p>
                    ))}
                  </li>
                )}
                {[...plays].reverse().map((p) => {
                  const runs = runsIn(p);
                  const looking = p.seq[p.seq.length - 1]?.res === 'called';
                  return (
                    <li key={p.id} className={[s.row, runs > 0 && s.rowRun, p.highlight && s.rowHl].filter(Boolean).join(' ')}>
                      <span className={s.nt}>{p.code === 'K' && looking ? <i className={s.kRev} title="루킹 삼진">K</i> : notationOf(p.code, p.notation, looking)}</span>
                      <div className={s.rowBody}>
                        <p className={s.rowText}>{p.text}</p>
                        {(p.causes ?? []).slice(0, 2).map((c) => <p key={c.text} className={s.why}>↳ {c.text}</p>)}
                        {p.pre.map((e, k) => (
                          <p key={k} className={s.ev}><Icon name={e.kind === 'pitching' || e.kind === 'pinch-hit' ? 'swap' : e.kind === 'weather' ? 'wind' : 'info'} size={12} /> {e.head} · {e.text}</p>
                        ))}
                      </div>
                      {runs > 0 && <span className={['num', s.score].join(' ')}>{p.score[0]}:{p.score[1]}</span>}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        );
      })}
    </section>
  );
}
