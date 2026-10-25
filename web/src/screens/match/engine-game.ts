// 엔진 테이프 → 경기 화면 기록(FullGame). 공용 경기 엔진이 남긴 압축 기록(타석 · 투구 · 타구 · 수비 · 송구 · 사건 · 원인 · 승리 확률)을
// 경기 화면이 쓰는 모양으로 푼다. 주자 이름은 테이프의 베이스 상태(비트)와 득점·아웃 수로 순서대로 맞춘다(앞 주자가 먼저 들어옴).
import { R } from '../../../../shared/engine/state.ts';
import { PR } from '../../../../shared/engine/pitch.ts';
import { EVC, WHY } from '../../../../shared/engine/log.ts';
import { PITCH_KEYS } from '../../../../shared/engine/player.ts';
import { playerById, teamById } from '../../game/mock';
import { PITCH_KO } from '../../game/labels';
import { mToField } from '../../game/field';
import type { Cause, CauseFactor, LineScore, MatchRecord, PitchType, Play, Pos, Weather } from '../../game/types';
import type { GameRun } from '../../season/sim';
import { homeWE, maskOf } from '../../season/we';
import { markHighlights } from './highlights';
import { arsenalOf, type Bases, type Code, type FullGame, type FullPlay, type GameEvent, type GameSide, type PitchEv, type PitchRes, type SubEv, type WxState, ZONE } from './local-mock';

const PA_N = 12, PT_N = 7, BB_N = 17, FD_N = 11, TH_N = 7, EV_N = 5, WHY_N = 5;
const POS_IDX: Exclude<Pos, 'DH'>[] = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
const POS_KO: Record<number, string> = { 1: '투수', 2: '포수', 3: '1루수', 4: '2루수', 5: '3루수', 6: '유격수', 7: '좌익수', 8: '중견수', 9: '우익수' };
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const nameOf = (id: string) => playerById(id)?.name ?? '선수';

export interface EngineMeta { id: string; date: string; time: string; awayId: string; homeId: string; attendance?: number }

/* ───────── 작은 도우미 ───────── */
function pitchRes(code: number): PitchRes {
  switch (code) {
    case PR.BALL: case PR.AUTO_B: case PR.PITCHOUT: return 'ball';
    case PR.CALLED: case PR.AUTO_S: return 'called';
    case PR.WHIFF: case PR.BUNT_MISS: case PR.TIP_K: return 'swing';
    case PR.FOUL: case PR.TIP: case PR.BUNT_FOUL: return 'foul';
    case PR.HBP: return 'hbp';
    default: return 'inplay';
  }
}
/** 엔진 투구 위치(cm, 스트라이크 존 가로 ±23.6 · 높이 약 50~102) → 화면 존 좌표 0~1 */
const zoneOf = (x: number, z: number): [number, number] => {
  const zx = 0.5 + (x / 23.6) * ((ZONE.x1 - ZONE.x0) / 2);
  const zy = ZONE.y0 + ((102 - z) / 52) * (ZONE.y1 - ZONE.y0);
  return [r3(Math.max(-0.1, Math.min(1.1, zx))), r3(Math.max(-0.1, Math.min(1.15, zy)))];
};
const KIND: Record<number, NonNullable<Play['hit']>['kind']> = { 0: 'ground', 1: 'line', 2: 'fly', 3: 'pop', 5: 'pop' };
const bitsOf = (mask: number) => [2, 1, 0].filter((b) => mask & (1 << b)); // 3루 → 1루 (앞 주자부터)

function dirHit(phi: number, dist: number) {
  if (phi <= -30) return '좌측 선상';
  if (phi < -10) return dist > 75 ? '좌중간' : '좌전';
  if (phi <= 10) return dist > 80 ? '가운데' : '중전';
  if (phi < 30) return dist > 75 ? '우중간' : '우전';
  return '우측 선상';
}
const dirHr = (phi: number) => (phi < -15 ? '좌측 담장 너머' : phi > 15 ? '우측 담장 너머' : '가운데 담장 너머');
function guessFielder(phi: number, dist: number, kind: number) {
  if (kind === 0 || dist < 50) {
    if (dist < 22 && Math.abs(phi) < 12) return 1;
    return phi < -27 ? 5 : phi < -6 ? 6 : phi < 8 ? (phi < 0 ? 6 : 4) : phi < 27 ? 4 : 3;
  }
  return phi < -15 ? 7 : phi > 15 ? 9 : 8;
}

/* ───────── 풀기 ───────── */
export function fromEngine(run: GameRun, meta: EngineMeta): FullGame {
  const res = run.result;
  const rec = res.record!;
  const webOfPid = (pid: number) => run.away.webOf.get(pid) ?? run.home.webOf.get(pid) ?? '';
  const recWeb = (r: number) => webOfPid(rec.dict[r]);
  const nPA = Math.floor(rec.pa.length / PA_N);
  const PA = Array.from({ length: nPA }, (_, i) => {
    const o = i * PA_N, a = rec.pa;
    return { ih: a[o], outs0: a[o + 1], bases0: a[o + 2], score0: a[o + 3], bRec: a[o + 4], pRec: a[o + 5], res: a[o + 6], rbi: a[o + 7], p0: a[o + 8], np: a[o + 9], bb: a[o + 10], dwe: a[o + 11] / 1000, we1: (rec.wp[i] ?? 500) / 1000 };
  });
  const BBR = (k: number) => {
    const o = k * BB_N, b = rec.bb;
    return { pa: b[o], ev: b[o + 1] / 10, la: b[o + 2] / 10, phi: b[o + 3] / 10, lx: b[o + 4] / 10, ly: b[o + 5] / 10, hang: b[o + 6] / 100, kind: b[o + 8], catchP: b[o + 10] / 1000, f0: b[o + 11], fn: b[o + 12], t0: b[o + 13], tn: b[o + 14] };
  };
  const FDR = (k: number) => { const o = k * FD_N, f = rec.fd; return { pos: f[o], sx: f[o + 1] / 10, sy: f[o + 2] / 10, react: f[o + 3] / 100, v: f[o + 4] / 10, t: f[o + 8] / 100, act: f[o + 9], p: f[o + 10] / 1000 }; };
  const THR = (k: number) => { const o = k * TH_N, t = rec.th; return { from: t[o], to: t[o + 1], q: t[o + 5] }; };
  const PTR = (k: number) => { const o = k * PT_N, p = rec.pt; return { type: p[o], vPlate: p[o + 1] / 10, x: p[o + 2], z: p[o + 3], res: p[o + 4] }; };
  const EVS = Array.from({ length: Math.floor(rec.ev.length / EV_N) }, (_, k) => { const o = k * EV_N, e = rec.ev; return { pa: e[o], pitch: e[o + 1], code: e[o + 2], a: e[o + 3], b: e[o + 4] }; });
  const WHYS = Array.from({ length: Math.floor(rec.why.length / WHY_N) }, (_, k) => { const o = k * WHY_N, w = rec.why; return { pa: w[o], factor: w[o + 1], size: w[o + 2] / 10, decisive: !!w[o + 3], who: recWeb(w[o + 4]) }; });

  /* 양 팀 */
  const sideOf = (s: 0 | 1): GameSide => {
    const t = s === 0 ? run.away : run.home;
    const lineup = t.team.lineup;
    const defense = {} as GameSide['defense'];
    lineup.forEach((l) => { if (l.pos !== 'DH' && l.pos !== 'P') defense[l.pos as Exclude<Pos, 'P' | 'DH'>] = t.webOf.get(l.pid)!; });
    for (const pos of ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'] as const) if (!defense[pos]) defense[pos] = t.webOf.get(lineup[0].pid)!;
    return {
      teamId: t.team.id,
      batting: lineup.map((l, i) => ({ slot: i + 1, pid: t.webOf.get(l.pid)!, pos: l.pos })),
      defense,
      starter: t.webOf.get(t.team.sp)!,
      bench: t.team.bench.map((pid) => t.webOf.get(pid)!).filter(Boolean),
      bullpen: t.team.pen.map((p) => t.webOf.get(p.pid)!).filter(Boolean),
    };
  };
  const away = sideOf(0), home = sideOf(1);
  const teamIdOf = (s: 0 | 1) => (s === 0 ? meta.awayId : meta.homeId);

  /* 날씨 */
  const wxIn = run.input.wx.slots[0];
  const orient = run.input.park.orientDeg;
  const rel = ((((wxIn.windFromDeg + 180 - orient) % 360) + 360) % 360);
  const windTo: Weather['windTo'] = wxIn.windMs < 1 ? 'calm' : rel < 25 || rel > 335 ? 'out-cf' : rel < 70 ? 'out-rf' : rel < 110 ? 'cross-r' : rel < 155 ? 'in-rf' : rel < 205 ? 'in-cf' : rel < 250 ? 'in-lf' : rel < 290 ? 'cross-l' : 'out-lf';
  const WIND_KO: Record<Weather['windTo'], string> = { 'out-lf': '좌측 담장 쪽으로', 'out-cf': '가운데 담장 쪽으로', 'out-rf': '우측 담장 쪽으로', 'in-lf': '좌측에서 홈 쪽으로', 'in-cf': '가운데에서 홈 쪽으로', 'in-rf': '우측에서 홈 쪽으로', 'cross-l': '3루 쪽으로', 'cross-r': '1루 쪽으로', calm: '바람 없음' };
  const night = Number(meta.time.slice(0, 2)) >= 18;
  const dome = run.input.park.roof === 'dome';
  const effect = dome ? '돔 — 바람 영향 없음' : windTo.startsWith('out') && wxIn.windMs >= 3 ? `${windTo === 'out-lf' ? '좌측' : windTo === 'out-rf' ? '우측' : '가운데'} 비거리 +${Math.round(wxIn.windMs)}m` : windTo.startsWith('in') && wxIn.windMs >= 3 ? `비거리 −${Math.round(wxIn.windMs)}m` : '바람 영향 거의 없음';
  const wx: WxState = { tempC: Math.round(wxIn.tC), windMps: Math.round(wxIn.windMs * 10) / 10, windTo, windKo: WIND_KO[windTo], sky: night ? 'night-clear' : 'clear', skyKo: dome ? '돔' : '맑음', rainPct: 10, effect };
  const homeTeam = teamById(meta.homeId);
  const weather: Weather = { city: homeTeam.region, sky: wx.sky, skyKo: wx.skyKo, tempC: wx.tempC, humidity: 60, windMps: wx.windMps, windTo, windKo: wx.windKo, rainPct: 10, dust: '보통', effects: [effect] };

  /* 타석 → 플레이 */
  const plays: FullPlay[] = [];
  const final0: [number, number] = [res.score[0], res.score[1]];
  const score: [number, number] = [0, 0];
  let bases: Bases = [null, null, null];
  let curIh = -1;
  let halfRuns = 0;
  let prevBb = -1;
  const slotPtr: [number, number] = [0, 0];
  const lastReached: string[] = [];
  const runsInHalf = (ih: number) => res.box.line.inn[ih & 1][(ih >> 1) - 1] ?? 0;
  const lastIdx = nPA - 1;

  /** 베이스 비트에 맞게 주자를 앞에서부터 채운다 */
  const fit = (cur: Bases, mask: number): Bases => {
    const want = bitsOf(mask);
    const have = [cur[2], cur[1], cur[0]].filter((x): x is string => !!x);
    const okNow = [0, 1, 2].every((b) => !!cur[b] === !!(mask & (1 << b)));
    if (okNow) return cur;
    const out: Bases = [null, null, null];
    want.forEach((b, k) => { out[b] = have[k] ?? lastReached.find((x) => !have.includes(x)) ?? have[have.length - 1] ?? null; });
    return out;
  };

  const evUsed = new Set<number>();
  for (let i = 0; i < nPA; i++) {
    const p = PA[i];
    const inning = p.ih >> 1;
    const halfN = (p.ih & 1) as 0 | 1;
    const half: 'top' | 'bot' = halfN === 0 ? 'top' : 'bot';
    if (p.ih !== curIh) { curIh = p.ih; bases = [null, null, null]; halfRuns = 0; lastReached.length = 0; }
    const batSide = halfN, fldSide = (1 - halfN) as 0 | 1;
    const fld = fldSide === 0 ? away : home;
    const batterId = recWeb(p.bRec);
    const pitcherId = recWeb(p.pRec);
    const pitcher = playerById(pitcherId);
    const batter = playerById(batterId);
    const ars = pitcher ? arsenalOf(pitcher) : [];
    bases = fit(bases, p.bases0);
    let outs = p.outs0;
    const next = PA[i + 1];
    const sameNext = !!next && next.ih === p.ih;
    const halfKey = `${inning}${half === 'top' ? 'T' : 'B'}`;
    const slot = (slotPtr[batSide] % 9) + 1;
    /** 지금 상태의 홈 승리 확률 (화면용 — season/we) */
    const weNow = (o: number, bs: Bases, sc: [number, number]) => r3(homeWE(inning, halfN, o, maskOf(bs), sc[1] - sc[0]));

    // 이 타석 앞 · 도중 사건 (교체 · 대타) — 투구 번호가 이 타석 안(첫 공 ~ 마지막 공)인 것, 한 사건은 한 번만
    //  (타석 도중 교체는 경기 중 작전으로 생긴다 — 문자 중계에 남게)
    const pre: GameEvent[] = [];
    for (let k = 0; k < EVS.length; k++) {
      const e = EVS[k];
      if (evUsed.has(k) || e.pitch < p.p0 || e.pitch > p.p0 + Math.max(0, p.np - 1)) continue;
      evUsed.add(k);
      if (e.code === EVC.SUB_P) {
        const outId = webOfPid(e.a), inId = webOfPid(e.b);
        if (outId && inId && outId !== inId) pre.push({ kind: 'pitching', team: fldSide === 0 ? 'away' : 'home', head: '투수 교체', text: `${nameOf(outId)} → ${nameOf(inId)}`, outId, inId });
      } else if (e.code === EVC.SUB_PH) {
        const outId = webOfPid(e.a), inId = webOfPid(e.b);
        if (outId && inId) pre.push({ kind: 'pinch-hit', team: batSide === 0 ? 'away' : 'home', head: '대타', text: `${nameOf(outId)} → ${nameOf(inId)}`, outId, inId });
      } else if (e.code === EVC.SUB_PR) {
        const outId = webOfPid(e.a), inId = webOfPid(e.b);
        if (inId) pre.push({ kind: 'note', team: batSide === 0 ? 'away' : 'home', head: '대주자', text: `${nameOf(inId)} 대주자`, outId, inId });
      }
    }

    // 투구
    const raw = Array.from({ length: p.np }, (_, k) => PTR(p.p0 + k));
    let b = 0, s = 0;
    const seqAll: PitchEv[] = raw.map((pt, k) => {
      const type = (PITCH_KEYS[pt.type] ?? 'FF') as PitchType;
      const a = ars.find((x) => x.type === type);
      const r = pitchRes(pt.res);
      if (r === 'ball') b++;
      else if (r === 'called' || r === 'swing') s++;
      else if (r === 'foul' && s < 2) s++;
      return { no: k + 1, type, name: a?.name ?? PITCH_KO[type], sig: a?.sig, kmh: Math.round(pt.vPlate / 0.915), zone: zoneOf(pt.x, pt.z), res: r, b, s };
    });

    // 도루 — 타석 중간에 따로 한 플레이
    let cut = 0;
    const steals = EVS.filter((e) => e.code === EVC.STEAL && e.pitch > p.p0 && e.pitch <= p.p0 + p.np).sort((x, y) => x.pitch - y.pitch);
    for (const st of steals) {
      const j = Math.min(seqAll.length - 1, st.pitch - p.p0 - 1);
      if (j < cut) continue;
      const to = st.a as 2 | 3;
      if (to !== 2 && to !== 3) continue;
      const fromIdx = to - 2;
      const runner = bases[fromIdx];
      if (!runner) continue;
      const ok = !!st.b;
      const seq = seqAll.slice(cut, j + 1).map((x, k) => ({ ...x, no: cut + k + 1 }));
      const last = seq[seq.length - 1];
      last.steal = { runner, from: (to - 1) as 1 | 2, to, ok };
      const before: Bases = [...bases] as Bases;
      const after: Bases = [...bases] as Bases;
      after[fromIdx] = null;
      if (ok) after[to - 1] = runner;
      const outsAfter = outs + (ok ? 0 : 1);
      plays.push({
        id: `e${i}s${j}`, idx: plays.length, isPA: false, slot, inning, half, halfKey,
        outsBefore: Math.min(2, outs) as 0 | 1 | 2, basesBefore: before, batterId, pitcherId,
        count: { b: last.b, s: last.s }, pitches: seq.length, code: ok ? 'SB' : 'CS',
        text: ok ? `${nameOf(runner)}, ${to}루 도루 성공` : `${nameOf(runner)}, ${to}루 도루 실패 — 태그 아웃`,
        notation: ok ? undefined : `2-${to === 2 ? 6 : 5}`,
        rbi: 0, score: [score[0], score[1]], outsAfter, wp: [weNow(outs, before, score), weNow(outsAfter, after, score)],
        seq, basesAfter: after, pre: pre.splice(0), wx: 0, p0: p.p0, np: p.np,
      } as FullPlay);
      bases = after;
      outs = outsAfter;
      cut = j + 1;
    }

    // 이 타석이 남긴 것
    const lastPA = i === lastIdx;
    const R_ = p.res;
    let outsAfter: number;
    let runs: number;
    if (sameNext) { outsAfter = next.outs0; runs = Math.max(0, next.score0 - p.score0); }
    else {
      runs = Math.max(0, runsInHalf(p.ih) - halfRuns);
      const made = R_ === R.DP ? 2 : [R.K, R.OUT, R.SF, R.SH].includes(R_ as never) ? 1 : 0;
      outsAfter = lastPA && halfN === 1 && score[1] + runs > score[0] ? Math.min(2, outs + made) : 3;
    }
    const remaining = seqAll.slice(cut).map((x, k) => ({ ...x, no: cut + k + 1 }));
    // 고의4구는 공 없이 걸어 나간다 — 화면에는 바깥쪽 공 네 개로
    const fakeIbb = !remaining.length && R_ === R.IBB;
    if (fakeIbb) for (let k = 0; k < 4; k++) remaining.push({ no: k + 1, type: 'FF', name: '고의4구', kmh: 105, zone: [1.04, 0.5], res: 'ball', b: k + 1, s: 0 });
    if (!remaining.length && (outs >= 3 || cut > 0)) { slotPtr[batSide]++; continue; }
    // 공 없이 끝난 타석 — 견제사·주루사로 이닝이 끝남. 화면에는 주자 아웃 한 장면으로
    if (!remaining.length && R_ !== R.IBB) {
      const po = EVS.find((e) => e.code === EVC.PICKOFF && e.pitch === p.p0);
      const fromBase = (po && (po.a === 1 || po.a === 2) ? po.a : bases[0] ? 1 : bases[1] ? 2 : 1) as 1 | 2;
      const runner = bases[fromBase - 1] ?? [bases[2], bases[1], bases[0]].find(Boolean) ?? batterId;
      const before: Bases = [...bases] as Bases;
      const after: Bases = [...bases] as Bases;
      after[fromBase - 1] = null;
      const oa = Math.min(3, outs + 1);
      const fake: PitchEv = { no: 1, type: 'FF', name: po ? '견제' : '주루', kmh: 0, zone: [0.5, 0.5], res: 'ball', b: 0, s: 0, steal: { runner, from: fromBase, to: (fromBase + 1) as 2 | 3, ok: false } };
      plays.push({
        id: `e${i}po`, idx: plays.length, isPA: false, slot, inning, half, halfKey,
        outsBefore: Math.min(2, outs) as 0 | 1 | 2, basesBefore: before, batterId, pitcherId,
        count: { b: 0, s: 0 }, pitches: 1, code: 'CS', text: `${nameOf(runner)}, ${po ? '견제사' : '주루사'}`, notation: po ? `1-${fromBase === 1 ? 3 : 6}` : undefined,
        rbi: 0, score: [score[0], score[1]], outsAfter: oa, wp: [weNow(outs, before, score), weNow(oa, after, score)],
        seq: [fake], basesAfter: after, pre: pre.splice(0), wx: 0, p0: p.p0, np: p.np, fake: true,
      } as FullPlay);
      bases = after;
      if (oa < 3) slotPtr[batSide]++;
      continue;
    }

    const hasBb = p.bb > prevBb && p.bb >= 0;
    const bbr = hasBb ? BBR(p.bb) : null;
    if (hasBb) prevBb = p.bb;
    const fds = bbr ? Array.from({ length: Math.max(0, bbr.fn) }, (_, k) => FDR(bbr.f0 + k)) : [];
    const ths = bbr ? Array.from({ length: Math.max(0, bbr.tn) }, (_, k) => THR(bbr.t0 + k)) : [];

    // 결과 코드
    let code: Code;
    switch (R_) {
      case R.K: case R.KDROP: code = 'K'; break;
      case R.BB: case R.IBB: code = 'BB'; break;
      case R.HBP: code = 'HBP'; break;
      case R.S1: code = '1B'; break;
      case R.S2: code = '2B'; break;
      case R.S3: code = '3B'; break;
      case R.HR: code = 'HR'; break;
      case R.ROE: case R.CI: code = 'E'; break;
      case R.FC: code = 'FC'; break;
      case R.SH: code = 'SAC'; break;
      case R.SF: code = 'SF'; break;
      case R.DP: code = 'DP'; break;
      default: code = !bbr ? 'GO' : bbr.kind === 0 ? 'GO' : bbr.kind === 1 ? 'LO' : 'FO';
    }

    // 주자 — 앞 주자부터 득점, 아웃은 뒤 주자부터, 남은 사람을 다음 베이스 비트에 앞에서부터
    const runners = [bases[2], bases[1], bases[0]].filter((x): x is string => !!x);
    const batterOut = ['K', 'GO', 'FO', 'LO', 'DP', 'SF', 'SAC'].includes(code) && !(R_ === R.KDROP && sameNext && (next.bases0 & 1) && !(p.bases0 & 1));
    const made = Math.max(0, outsAfter - outs);
    const entities = [...runners, batterId];
    const scorers = entities.slice(0, Math.min(runs, entities.length));
    let left = entities.filter((x) => !scorers.includes(x));
    let runnerOuts = Math.max(0, made - (batterOut ? 1 : 0));
    if (batterOut) left = left.filter((x) => x !== batterId);
    while (runnerOuts > 0 && left.some((x) => x !== batterId)) {
      const trail = [...left].reverse().find((x) => x !== batterId)!;
      left = left.filter((x) => x !== trail);
      runnerOuts--;
    }
    const maskAfter = sameNext ? next.bases0 : 0;
    const slots = bitsOf(maskAfter);
    while (left.length > slots.length) left.splice(left.length - 1, 1);
    const after: Bases = [null, null, null];
    slots.forEach((bit, k) => { after[bit] = left[k] ?? batterId; });
    if (!batterOut && code !== 'HR' && !scorers.includes(batterId)) lastReached.unshift(batterId);

    if (batSide === 0) score[0] += runs; else score[1] += runs;
    halfRuns += runs;

    // 타구
    let hit: Play['hit'];
    let defense: Play['defense'];
    let notation: string | undefined;
    let fielderNo = 0;
    if (bbr) {
      const dist = Math.hypot(bbr.lx, bbr.ly);
      const pt = mToField(bbr.lx, bbr.ly);
      hit = { x: r3(pt.x), y: r3(pt.y), kind: KIND[bbr.kind] ?? 'fly', kmh: Math.round(bbr.ev), distM: Math.round(dist), angle: Math.round(bbr.phi), la: Math.round(bbr.la) };
      const caught = fds.find((f) => f.act === 0 || f.act === 2) ?? fds[0];
      fielderNo = caught ? caught.pos + 1 : guessFielder(bbr.phi, dist, bbr.kind);
      if (bbr.kind >= 1 && fds.length) {
        defense = {
          hangS: r3(Math.max(0.6, bbr.hang)),
          catchProb: r3(Math.max(0.01, Math.min(0.99, bbr.catchP))),
          fielders: fds.filter((f) => f.pos >= 0 && f.pos <= 8 && f.pos !== 1).map((f) => {
            const pos = POS_IDX[f.pos];
            const pid = pos === 'P' ? pitcherId : fld.defense[pos as Exclude<Pos, 'P' | 'DH'>];
            const from = mToField(f.sx, f.sy);
            return { pos, playerId: pid, from: { x: r3(from.x), y: r3(from.y) }, reactS: r3(Math.max(0.1, f.react)), mps: r3(Math.max(3, f.v)), arriveS: f.act === 0 || f.act === 2 ? r3(f.t) : undefined, dive: f.act === 2 || undefined };
          }),
        };
        if (!defense.fielders.length) defense = undefined;
      }
      // 기록지 표기
      if (code === 'FO' || code === 'SF') notation = `F${fielderNo}`;
      else if (code === 'LO') notation = `L${fielderNo}`;
      else if (code === 'E') notation = `E${fielderNo}`;
      else if (code === 'GO' || code === 'DP' || code === 'FC' || code === 'SAC') {
        const chain = [fielderNo];
        ths.forEach((t, k) => {
          const nx = ths[k + 1];
          let recv = nx ? nx.from + 1 : t.to === 1 ? 3 : t.to === 2 ? ([5, 6, 1].includes(fielderNo) ? 4 : 6) : t.to === 3 ? 5 : 2;
          if (recv === chain[chain.length - 1]) recv = t.to === 1 ? 1 : recv === 4 ? 6 : 4; // 1루수가 잡으면 투수가 1루 커버
          chain.push(recv);
        });
        notation = chain.length > 1 ? chain.join('-') : `${fielderNo}U`;
      }
    }

    // 타구 기록이 없는 인플레이(옛 엔진 기록 등) — 흔한 자리로 표기
    if (!fielderNo && ['GO', 'DP', 'FC', 'SAC', 'E', 'FO', 'LO', 'SF'].includes(code)) {
      fielderNo = code === 'FO' || code === 'SF' ? 8 : code === 'SAC' ? 1 : 6;
      notation = code === 'FO' || code === 'SF' ? `F${fielderNo}` : code === 'LO' ? `L${fielderNo}` : code === 'E' ? `E${fielderNo}` : code === 'DP' ? '6-4-3' : code === 'SAC' ? '1-3' : '6-3';
    }
    // 문자 중계
    const nm = batter?.name ?? '선수';
    const lastSeq = remaining[remaining.length - 1];
    const rbiTxt = runs > 0 ? ` — ${runs}점` : '';
    const dist = hit?.distM ?? 0;
    const posKo = POS_KO[fielderNo] ?? '';
    let text: string;
    switch (code) {
      case '1B': text = `${nm}, ${dirHit(hit?.angle ?? 0, dist)} 안타${rbiTxt}`; break;
      case '2B': text = `${nm}, ${dirHit(hit?.angle ?? 0, dist)} 2루타${rbiTxt}`; break;
      case '3B': text = `${nm}, ${dirHit(hit?.angle ?? 0, dist)} 3루타${rbiTxt}`; break;
      case 'HR': text = runs >= 4 ? `${nm}, 만루 홈런! ${dirHr(hit?.angle ?? 0)}` : runs === 1 ? `${nm}, 솔로 홈런 — ${dirHr(hit?.angle ?? 0)}` : `${nm}, ${runs}점 홈런 — ${dirHr(hit?.angle ?? 0)}`; break;
      case 'BB': text = `${nm}, ${R_ === R.IBB ? '고의4구' : '볼넷'}${runs ? ' — 밀어내기 1점' : ''}`; break;
      case 'HBP': text = `${nm}, 몸에 맞는 공${runs ? ' — 밀어내기 1점' : ''}`; break;
      case 'K': text = `${nm}, ${lastSeq?.res === 'called' ? '루킹' : '헛스윙'} 삼진${lastSeq ? ` — ${lastSeq.name}` : ''}${R_ === R.KDROP && !batterOut ? ' · 낫아웃으로 출루' : ''}`; break;
      case 'GO': text = `${nm}, ${posKo} 앞 땅볼${rbiTxt}`; break;
      case 'DP': text = `${nm}, ${posKo} 앞 병살타`; break;
      case 'FO': text = `${nm}, ${posKo} ${hit?.kind === 'pop' ? '팝플라이' : '뜬공'}`; break;
      case 'LO': text = `${nm}, ${posKo} 직선타`; break;
      case 'SF': text = `${nm}, ${posKo} 희생플라이 — 3루 주자 홈인`; break;
      case 'SAC': text = `${nm}, 희생번트`; break;
      case 'E': text = `${nm}, ${posKo || '수비'} 실책으로 출루${rbiTxt}`; break;
      case 'FC': text = `${nm}, 야수 선택으로 출루${rbiTxt}`; break;
      default: text = nm;
    }

    // 원인 표시
    const causes: Cause[] = [];
    for (const w of WHYS) {
      if (w.pa !== i + 1 || causes.length >= 2) continue;
      const c = causeOf(w.factor, w.size, w.decisive);
      if (c) causes.push(c);
    }

    const countBefore = remaining.length >= 2 ? { b: remaining[remaining.length - 2].b, s: remaining[remaining.length - 2].s } : { b: 0, s: 0 };
    plays.push({
      id: `e${i}`, idx: plays.length, isPA: true, slot, inning, half, halfKey,
      outsBefore: Math.min(2, outs) as 0 | 1 | 2, basesBefore: [...bases] as Bases, batterId, pitcherId,
      count: countBefore, pitches: remaining.length, code, text, notation,
      rbi: code === 'E' || code === 'DP' ? 0 : Math.min(p.rbi, runs), score: [score[0], score[1]], outsAfter: Math.min(3, outsAfter),
      hit, lastPitch: lastSeq ? { type: lastSeq.sig ? 'SIG' : lastSeq.type, name: lastSeq.name, kmh: lastSeq.kmh, zone: lastSeq.zone } : undefined,
      causes: causes.length ? causes : undefined, defense,
      wp: [weNow(outs, bases, [score[0] - (batSide === 0 ? runs : 0), score[1] - (batSide === 1 ? runs : 0)]), lastPA ? (final0[1] > final0[0] ? 1 : final0[1] < final0[0] ? 0 : 0.5) : weNow(outsAfter, after, score)],
      seq: remaining, basesAfter: after, pre, wx: 0, p0: p.p0, np: p.np, ...(fakeIbb ? { fake: true } : {}),
      errorBy: code === 'E' ? (fldSide === 0 ? 'away' : 'home') : undefined,
    } as FullPlay);
    bases = after;
    slotPtr[batSide]++;
  }

  /* 강조 장면 — 승리 확률 변화로 */
  const final: [number, number] = [res.score[0], res.score[1]];
  const walkoff = res.box.flags.includes('walkoff');
  markHighlights(plays, meta.awayId, meta.homeId, walkoff);

  /* 줄 점수 */
  const lineOf = (s: 0 | 1): LineScore => {
    const inn = res.box.line.inn[s];
    const n = Math.max(9, res.innings);
    const innings: (number | null)[] = Array.from({ length: n }, (_, i) => (i < inn.length ? inn[i] : null));
    if (s === 1 && final[1] > final[0] && !walkoff && inn.length < res.innings) innings[res.innings - 1] = null;
    const bbs = plays.filter((x) => (x.half === 'top' ? 0 : 1) === s && (x.code === 'BB' || x.code === 'HBP')).length;
    return { innings, r: final[s], h: res.box.line.H[s], e: res.box.line.E[s], b: bbs };
  };
  const lineA = lineOf(0), lineH = lineOf(1);

  /* 결승타 — 이긴 팀이 마지막으로 앞서기 시작한 타석 */
  let gwrbi: string | undefined;
  const winSide = final[0] > final[1] ? 0 : final[1] > final[0] ? 1 : -1;
  if (winSide >= 0) {
    for (let k = plays.length - 1; k >= 0; k--) {
      const pl = plays[k];
      const prev = k > 0 ? plays[k - 1].score : [0, 0];
      const wasLead = winSide === 0 ? prev[0] > prev[1] : prev[1] > prev[0];
      const nowLead = winSide === 0 ? pl.score[0] > pl.score[1] : pl.score[1] > pl.score[0];
      if (nowLead && !wasLead) { gwrbi = pl.isPA && pl.rbi > 0 ? pl.batterId : undefined; break; }
    }
  }

  /* 결정적 요인 */
  const keyFactors: Cause[] = [];
  for (const w of WHYS.filter((x) => x.decisive)) { const c = causeOf(w.factor, w.size, true); if (c && keyFactors.length < 2 && !keyFactors.some((x) => x.text === c.text)) keyFactors.push(c); }
  const sps = [run.result.box.pit[0][0], run.result.box.pit[1][0]];
  const starterLine = (s: 0 | 1) => {
    const l = sps[s];
    if (!l) return null;
    const id = webOfPid(l.pid);
    const ip = `${Math.floor(l.outs / 3)}${l.outs % 3 ? `.${l.outs % 3}` : ''}`;
    return { factor: 'form' as CauseFactor, text: `${nameOf(id)} ${ip}이닝 ${l.ER}자책 ${l.SO}K` };
  };
  if (winSide >= 0) { const c = starterLine(winSide as 0 | 1); if (c) keyFactors.push(c); }
  if (!keyFactors.length) keyFactors.push({ factor: 'form', text: '선발 맞대결이 길게 이어졌어요' });

  const att = meta.attendance ?? 9000 + (Math.abs(res.hash) % 14000);
  const dm = res.durationMin;
  const match: MatchRecord = {
    id: meta.id, date: meta.date, time: meta.time, stadium: homeTeam.stadium.name,
    awayId: meta.awayId, homeId: meta.homeId, weather,
    line: { away: lineA, home: lineH },
    final, walkoff,
    decision: { win: run.out.decision.win ?? '', loss: run.out.decision.loss ?? '', save: run.out.decision.save, gwrbi },
    starters: { away: away.starter, home: home.starter },
    plays, keyFactors, attendance: att, duration: `${Math.floor(dm / 60)}:${String(dm % 60).padStart(2, '0')}`,
  };
  const sideLine = (l: LineScore) => ({ inn: l.innings, r: l.r, h: l.h, e: l.e, b: l.b });
  void teamIdOf;
  // 교체 사건 (투구 번호) — 경기 중 작전 시트가 '이미 나온 선수'를 거르는 데 쓴다
  const SUBK: Record<number, SubEv['kind']> = { [EVC.SUB_P]: 'pitcher', [EVC.SUB_PH]: 'pinchHit', [EVC.SUB_PR]: 'pinchRun', [EVC.SUB_DEF]: 'defense' };
  const subs: SubEv[] = EVS.filter((e) => SUBK[e.code]).map((e) => ({
    pitch: e.pitch, kind: SUBK[e.code], side: run.away.webOf.has(e.b) ? 'away' : 'home', outId: webOfPid(e.a) || undefined, inId: webOfPid(e.b) || undefined,
  }));
  return { match, away, home, plays, wx: [wx], line: { away: sideLine(lineA), home: sideLine(lineH) }, subs };
}

/** 엔진 원인 → 화면 원인 한 줄 */
function causeOf(factor: number, size: number, decisive: boolean): Cause | null {
  const sz = Math.round(Math.abs(size) * 10) / 10;
  const sign = size >= 0 ? '+' : '−';
  switch (factor) {
    case WHY.WIND: return { factor: 'wind', text: `바람 ${sign}${sz}m`, decisive };
    case WHY.TEMP: return { factor: 'weather', text: `기온 영향 ${sign}${sz}m`, decisive };
    case WHY.PARK_WALL: return { factor: 'park', text: '높은 담장에 막힘', decisive };
    case WHY.PARK_DIST: return { factor: 'park', text: `구장 거리 ${sign}${sz}m`, decisive };
    case WHY.RANGE: return { factor: 'range', text: '수비 범위 안', decisive };
    case WHY.MEMORY: return { factor: 'hidden', text: '같은 공에 눈이 익음', decisive };
    case WHY.PLATOON: return { factor: 'platoon', text: '좌우 상성', decisive };
    case WHY.SIG_PITCH: return { factor: 'signature', text: '고유 구종', decisive };
    case WHY.FATIGUE: return { factor: 'fatigue', text: '투구 수 피로', decisive };
    case WHY.UMP: return { factor: 'hidden', text: '심판 존', decisive };
    case WHY.FRAMING: return { factor: 'hidden', text: '포수 프레이밍', decisive };
    case WHY.BONUS: return { factor: 'enhance', text: '세트덱·강화 보너스', decisive };
    case WHY.WX_TRAIT: return { factor: 'weather', text: '날씨 체질', decisive };
    default: return null;
  }
}
