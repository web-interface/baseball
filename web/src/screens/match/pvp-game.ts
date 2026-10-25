// 대전 경기 기록 — 서버가 정한 이닝별 점수(line)와 최종 점수를 절대 바꾸지 않고, 그 점수에 꼭 맞는 경기를 대전 id 시드로 만든다.
// 같은 대전을 다시 보면 같은 장면. 두 팀 선수는 각자 라인업 스냅샷(나는 내 스냅샷, 상대는 서버에 올라간 라인업) 기준.
import { ME, playerById, registerPlayers, teamById } from '../../game/mock';
import { fromWireId } from '../../api';
import { synthPlayer } from '../../game/starter';
import { fenceAt, polarToField } from '../../game/field';
import type { Cause, LineScore, MatchRecord, PitcherRole, Player, Pos, Weather } from '../../game/types';
import { homeWE, maskOf } from '../../season/we';
import { weatherOf } from '../../season/weather';
import { loadBattle, type BattleItem, type BattleRec, type BattleSnap } from '../pvp/battles';
import { defaultAfter, genSeq, makeDefense, rng, type Bases, type Code, type FullGame, type FullPlay, type GameEvent, type GameSide, type WxState } from './local-mock';
import { markHighlights } from './highlights';
import type { MatchCtx } from './EndBar';
import { showOvr } from '../../game/ovrShow';

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const POS_KO: Record<number, string> = { 1: '투수', 2: '포수', 3: '1루수', 4: '2루수', 5: '3루수', 6: '유격수', 7: '좌익수', 8: '중견수', 9: '우익수' };
const BAT_POS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];

/* ───────── 스냅샷 → 선수 ───────── */
interface Side { teamId: string; batting: { p: Player; pos: Exclude<Pos, 'P'> }[]; sp: Player; rp: Player[]; cp: Player | null; tags: Record<string, string> }
function sideOf(snap: BattleSnap, key: string): Side {
  const made: Player[] = [];
  const tags: Record<string, string> = {};
  const toPlayer = (it: BattleItem, k: number): Player => {
    const pos: Pos = it.pos === 'SP' || it.pos === 'RP' || it.pos === 'CP' || it.pos === 'P' ? 'P' : (it.pos as Pos);
    const role: PitcherRole | undefined = it.pos === 'SP' ? 'SP' : it.pos === 'CP' ? 'CL' : pos === 'P' ? 'RP' : undefined;
    const known = playerById(fromWireId(it.id));
    let p: Player;
    if (known && (!it.name || known.name === it.name)) p = known;
    else {
      const id = `pv-${key}-${k}-${it.id}`.slice(0, 40);
      p = playerById(id) ?? synthPlayer({ id, teamId: it.c && teamById(it.c).id === it.c ? it.c : snap.club, pos, role, ovr: it.ovr, seed: `pv:${key}:${it.id}` });
      if (it.name) p = { ...p, name: it.name };
      made.push(p);
    }
    if (it.y != null) tags[p.id] = `’${String(it.y).padStart(2, '0')}`;
    return p;
  };
  const items = snap.lineup.map((it, k) => ({ it, p: toPlayer(it, k) }));
  registerPlayers(made);
  const batting = items.filter((x) => BAT_POS.includes(x.it.pos)).slice(0, 9).map((x) => ({ p: x.p, pos: x.it.pos as Exclude<Pos, 'P'> }));
  // 타자가 9명이 안 되면 채운다
  for (const pos of BAT_POS) if (batting.length < 9 && !batting.some((b) => b.pos === pos)) {
    const id = `pv-${key}-fill-${pos}`;
    const p = playerById(id) ?? synthPlayer({ id, teamId: snap.club, pos: pos as Pos, ovr: snap.ovr || 65, seed: `pvfill:${key}:${pos}` });
    registerPlayers([p]);
    batting.push({ p, pos: pos as Exclude<Pos, 'P'> });
  }
  const pit = items.filter((x) => x.p.pos === 'P');
  const sp = pit.find((x) => x.it.pos === 'SP')?.p ?? pit[0]?.p ?? synthPlayer({ id: `pv-${key}-sp`, teamId: snap.club, pos: 'P', role: 'SP', ovr: snap.ovr || 65, seed: `pvsp:${key}` });
  const cp = pit.find((x) => x.it.pos === 'CP')?.p ?? null;
  const rp = pit.filter((x) => x.p !== sp && x.p !== cp).map((x) => x.p);
  if (!rp.length) {
    const id = `pv-${key}-rp`;
    const p = playerById(id) ?? synthPlayer({ id, teamId: snap.club, pos: 'P', role: 'RP', ovr: Math.max(55, (snap.ovr || 65) - 3), seed: `pvrp:${key}` });
    registerPlayers([p, sp]);
    rp.push(p);
  }
  return { teamId: snap.club, batting, sp, rp, cp, tags };
}

/* ───────── 타석 결과 고르기 ───────── */
type Ev = Code;
const BASE: [Ev, number][] = [['K', 0.205], ['BB', 0.085], ['HBP', 0.008], ['1B', 0.152], ['2B', 0.045], ['3B', 0.004], ['HR', 0.026], ['GO', 0.215], ['FO', 0.17], ['LO', 0.055], ['E', 0.012]];
const ON_BASE = new Set<Ev>(['BB', 'HBP', '1B', '2B', '3B', 'HR', 'E']);
function pick(rnd: () => number, adj: number, mode: 'score' | 'hold'): Ev {
  const w = BASE.map(([e, p]) => {
    let x = p;
    if (ON_BASE.has(e)) x *= 1 + adj;
    else x *= 1 - adj / 2;
    if (mode === 'score') x *= ON_BASE.has(e) ? 2.1 : 0.7;
    return [e, Math.max(0.0001, x)] as [Ev, number];
  });
  const tot = w.reduce((a, [, x]) => a + x, 0);
  let r = rnd() * tot;
  for (const [e, x] of w) { r -= x; if (r <= 0) return e; }
  return 'GO';
}

interface PaDesc { code: Code; batter: Player; pitcher: Player; before: Bases; after: Bases; runs: number; outsBefore: number; outsAfter: number; slot: number }

/**
 * 반 이닝 — 정확히 target 점, 3아웃.
 * 끝내기 반 이닝(walk.lead = 앞서려면 필요한 점수)은 앞서는 순간 끝난다 — 그 타석이 홈런이 아니면 딱 앞서는 만큼만 들어오고,
 * 홈런이면 주자까지 다 들어온다(규칙). 그래서 마지막 타석 앞까지는 동점 이하로만, 마지막 타석이 남은 점수를 다 낸다.
 */
function genHalf(rnd: () => number, target: number, walk: { lead: number } | null, lineup: { p: Player }[], startSlot: number, pitcherAt: (pa: number) => Player): { pas: PaDesc[]; nextSlot: number } {
  for (let attempt = 0; attempt < 300; attempt++) {
    const pas: PaDesc[] = [];
    let outs = 0, runs = 0, slot = startSlot;
    let bases: Bases = [null, null, null];
    let ok = false;
    for (let guard = 0; guard < 32; guard++) {
      if (outs >= 3) { ok = !walk && runs === target; break; }
      const batter = lineup[slot % 9].p;
      const pitcher = pitcherAt(pas.length);
      const adj = Math.max(-0.35, Math.min(0.35, (batter.ovr - pitcher.ovr) / 45));
      const need = target - runs;
      let code = pick(rnd, adj, need > 0 ? 'score' : 'hold');
      if (code === 'GO' && bases[0] && outs < 2 && rnd() < 0.3) code = 'DP';
      if (code === 'FO' && bases[2] && outs < 2 && need > 0 && rnd() < 0.55) code = 'SF';
      let r = defaultAfter(code, bases, batter.id);
      if (code === 'DP' && !bases[0]) { code = 'GO'; r = defaultAfter(code, bases, batter.id); }
      if (r.runs > need) {
        const lower: Code[] = code === 'HR' ? ['3B', '2B', '1B', 'BB', 'K'] : code === '3B' ? ['2B', '1B', 'BB', 'K'] : code === '2B' ? ['1B', 'BB', 'K'] : ['K', 'FO'];
        let fixed = false;
        for (const c of lower) { const t = defaultAfter(c, bases, batter.id); if (t.runs <= need) { code = c; r = t; fixed = true; break; } }
        if (!fixed) { code = 'K'; r = defaultAfter('K', bases, batter.id); }
      }
      // 3아웃과 득점이 겹치면(땅볼·희생플라이) 득점이 없는 아웃으로
      if (outs + r.outs >= 3 && r.runs > 0) { code = 'K'; r = defaultAfter('K', bases, batter.id); }
      if (walk) {
        const leadNeed = walk.lead - runs;          // 지금 앞서려면 필요한 점수
        if (r.runs >= leadNeed && r.runs > 0) {
          // 이 타석에서 앞선다 — 남은 점수를 꼭 다 내야 하고, 홈런이 아니면 딱 앞서는 만큼만
          const valid = r.runs === need && (code === 'HR' || r.runs === leadNeed);
          if (!valid) { code = 'K'; r = defaultAfter('K', bases, batter.id); }
        }
      }
      pas.push({ code, batter, pitcher, before: bases, after: r.after, runs: r.runs, outsBefore: outs, outsAfter: Math.min(3, outs + r.outs), slot: (slot % 9) + 1 });
      outs += r.outs; runs += r.runs; bases = r.after; slot++;
      if (runs > target) break;
      if (walk && runs >= walk.lead) { ok = runs === target; break; }
    }
    if (ok) return { pas, nextSlot: slot };
  }
  // 그래도 안 맞으면 — 늘 맞는 길
  const pas: PaDesc[] = [];
  let slot = startSlot, outs = 0, bases: Bases = [null, null, null];
  const push = (code: Code) => {
    const batter = lineup[slot % 9].p;
    const r = defaultAfter(code, bases, batter.id);
    pas.push({ code, batter, pitcher: pitcherAt(pas.length), before: bases, after: r.after, runs: r.runs, outsBefore: outs, outsAfter: Math.min(3, outs + r.outs), slot: (slot % 9) + 1 });
    outs += r.outs; bases = r.after; slot++;
    return r.runs;
  };
  if (walk) {
    // 동점까지 솔로 홈런, 그다음 볼넷으로 주자를 깔고 마지막에 홈런 (남은 점수 = 주자 + 1)
    const pre = Math.min(target - 1, walk.lead - 1);
    for (let k = 0; k < pre; k++) push('HR');
    const k = target - pre;
    for (let w = 0; w < Math.min(3, k - 1); w++) push('BB');
    push('HR');
  } else {
    for (let k = 0; k < target; k++) push('HR');
    push('K'); push('GO'); push('FO');
  }
  return { pas, nextSlot: slot };
}

/* ───────── 타구 모양 · 표기 · 글 ───────── */
function guessFielder(phi: number, dist: number, ground: boolean) {
  if (ground || dist < 50) {
    if (dist < 22 && Math.abs(phi) < 12) return 1;
    return phi < -27 ? 5 : phi < -6 ? 6 : phi < 8 ? (phi < 0 ? 6 : 4) : phi < 27 ? 4 : 3;
  }
  return phi < -15 ? 7 : phi > 15 ? 9 : 8;
}
function dirHit(phi: number, dist: number) {
  if (phi <= -30) return '좌측 선상';
  if (phi < -10) return dist > 75 ? '좌중간' : '좌전';
  if (phi <= 10) return dist > 80 ? '가운데' : '중전';
  if (phi < 30) return dist > 75 ? '우중간' : '우전';
  return '우측 선상';
}
const dirHr = (phi: number) => (phi < -15 ? '좌측 담장 너머' : phi > 15 ? '우측 담장 너머' : '가운데 담장 너머');

function shape(code: Code, rnd: () => number, bats: 'R' | 'L', homeId: string): NonNullable<FullPlay['hit']> | undefined {
  const pull = bats === 'R' ? -1 : 1;
  const ang = (lo: number, hi: number) => lo + rnd() * (hi - lo);
  let angle = 0, dist = 0, kind: 'ground' | 'line' | 'fly' | 'pop' = 'fly', kmh = 140;
  switch (code) {
    case '1B': if (rnd() < 0.55) { kind = 'line'; dist = ang(52, 72); angle = ang(-38, 38); kmh = ang(140, 165); } else { kind = 'ground'; dist = ang(44, 58); angle = ang(-35, 35); kmh = ang(130, 160); } break;
    case '2B': kind = rnd() < 0.5 ? 'line' : 'fly'; dist = ang(82, 102); angle = (rnd() < 0.7 ? ang(14, 32) : ang(36, 43)) * (rnd() < 0.55 ? pull : -pull); kmh = ang(150, 172); break;
    case '3B': kind = 'line'; dist = ang(98, 112); angle = ang(28, 42) * (rnd() < 0.5 ? 1 : -1); kmh = ang(155, 172); break;
    case 'HR': { kind = 'fly'; angle = ang(-38, 38) * 0.9 + pull * 4; const f = fenceAt(teamById(homeId).stadium.fence, angle); dist = f + ang(4, 22); kmh = ang(160, 182); break; }
    case 'GO': case 'DP': case 'FC': case 'E': case 'SAC': kind = 'ground'; dist = code === 'SAC' ? ang(10, 18) : ang(22, 38); angle = ang(-40, 40); kmh = code === 'SAC' ? 60 : ang(110, 155); break;
    case 'FO': if (rnd() < 0.2) { kind = 'pop'; dist = ang(18, 42); angle = ang(-40, 40); kmh = ang(100, 130); } else { kind = 'fly'; dist = ang(68, 96); angle = ang(-40, 40); kmh = ang(130, 160); } break;
    case 'SF': kind = 'fly'; dist = ang(76, 94); angle = ang(-35, 35); kmh = ang(135, 158); break;
    case 'LO': kind = 'line'; dist = ang(42, 68); angle = ang(-38, 38); kmh = ang(140, 168); break;
    default: return undefined;
  }
  const pt = polarToField(angle, dist);
  return { x: r3(pt.x), y: r3(pt.y), kind, kmh: Math.round(kmh), distM: Math.round(dist), angle: Math.round(angle) };
}

/* ───────── 만들기 ───────── */
export function pvpFullGame(b: BattleRec): FullGame {
  const rnd = rng(`pvp:${b.id}`);
  const awayS = sideOf(b.me, `me-${b.me.userId ?? 'me'}`);
  const homeS = sideOf(b.opp, `op-${b.opp.userId ?? b.opp.username}`);
  const awayId = awayS.teamId, homeId = homeS.teamId;
  const nInn = b.line.away.length;
  const plays: FullPlay[] = [];
  const score: [number, number] = [0, 0];
  const slots: [number, number] = [0, 0];
  const pitchCount = new Map<string, number>();
  const tags: Record<string, string> = { ...awayS.tags, ...homeS.tags };
  // 투수 운용 — 선발 6회까지(점수 차가 크면 7회), 7~8회 중계, 9회 이후 마무리(있으면)
  const pitcherFor = (side: Side, inning: number, lead: number): Player => {
    if (inning <= 6) return side.sp;
    if (inning >= 9 && side.cp && lead > 0 && lead <= 3) return side.cp;
    if (inning >= 9 && side.cp) return side.cp;
    return side.rp[(inning - 7) % side.rp.length] ?? side.sp;
  };
  const current: [Player | null, Player | null] = [null, null];
  let walkoff = false;
  for (let inn = 1; inn <= nInn; inn++) {
    for (const half of ['top', 'bot'] as const) {
      const target = half === 'top' ? b.line.away[inn - 1] : b.line.home[inn - 1];
      if (target == null) continue;
      const batSide = half === 'top' ? awayS : homeS;
      const fldSide = half === 'top' ? homeS : awayS;
      const bi = half === 'top' ? 0 : 1, fi = 1 - bi;
      const lead = fi === 1 ? score[1] - score[0] : score[0] - score[1];
      const pitcher = pitcherFor(fldSide, inn, lead);
      const pre: GameEvent[] = [];
      const prevP = current[fi];
      if (prevP && prevP.id !== pitcher.id) pre.push({ kind: 'pitching', team: fi === 0 ? 'away' : 'home', head: '투수 교체', text: `${prevP.name} → ${pitcher.name}${pitcher === fldSide.cp ? ' (마무리)' : ''}`, outId: prevP.id, inId: pitcher.id });
      current[fi] = pitcher;
      const isLastHalf = half === 'bot' && inn === nInn && (b.line.home[inn - 1] ?? 0) + score[1] > score[0] && inn >= 9;
      const { pas, nextSlot } = genHalf(rnd, target, isLastHalf ? { lead: score[0] - score[1] + 1 } : null, batSide.batting, slots[bi], () => pitcher);
      slots[bi] = nextSlot;
      if (isLastHalf) walkoff = true;
      const halfKey = `${inn}${half === 'top' ? 'T' : 'B'}`;
      pas.forEach((pa, k) => {
        const before: [number, number] = [score[0], score[1]];
        if (bi === 0) score[0] += pa.runs; else score[1] += pa.runs;
        const bats: 'R' | 'L' = pa.batter.bats === 'S' ? (pa.pitcher.throws === 'R' ? 'L' : 'R') : pa.batter.bats;
        const hit = shape(pa.code, rnd, bats, homeId);
        const f = hit ? guessFielder(hit.angle, hit.distM, hit.kind === 'ground') : 0;
        let notation: string | undefined;
        if (pa.code === 'FO' || pa.code === 'SF') notation = `F${f}`;
        else if (pa.code === 'LO') notation = `L${f}`;
        else if (pa.code === 'E') notation = `E${f}`;
        else if (pa.code === 'GO' || pa.code === 'SAC') notation = f === 3 ? (rnd() < 0.5 ? '3U' : '3-1') : `${f}-3`;
        else if (pa.code === 'DP') notation = f === 6 ? '6-4-3' : f === 4 ? '4-6-3' : f === 5 ? '5-4-3' : f === 3 ? '3-6-3' : '1-6-3';
        else if (pa.code === 'FC') notation = `${f}-${f === 6 || f === 5 ? 4 : 6}`;
        const nm = pa.batter.name;
        const rbiTxt = pa.runs > 0 ? ` — ${pa.runs}점` : '';
        const looking = pa.code === 'K' && rnd() < 0.3;
        let text: string;
        switch (pa.code) {
          case '1B': text = `${nm}, ${dirHit(hit!.angle, hit!.distM)} 안타${rbiTxt}`; break;
          case '2B': text = `${nm}, ${dirHit(hit!.angle, hit!.distM)} 2루타${rbiTxt}`; break;
          case '3B': text = `${nm}, ${dirHit(hit!.angle, hit!.distM)} 3루타${rbiTxt}`; break;
          case 'HR': text = pa.runs >= 4 ? `${nm}, 만루 홈런! ${dirHr(hit!.angle)}` : pa.runs === 1 ? `${nm}, 솔로 홈런 — ${dirHr(hit!.angle)}` : `${nm}, ${pa.runs}점 홈런 — ${dirHr(hit!.angle)}`; break;
          case 'BB': text = `${nm}, 볼넷${pa.runs ? ' — 밀어내기 1점' : ''}`; break;
          case 'HBP': text = `${nm}, 몸에 맞는 공${pa.runs ? ' — 밀어내기 1점' : ''}`; break;
          case 'K': text = `${nm}, ${looking ? '루킹' : '헛스윙'} 삼진`; break;
          case 'GO': text = `${nm}, ${POS_KO[f]} 앞 땅볼${rbiTxt}`; break;
          case 'DP': text = `${nm}, ${POS_KO[f]} 앞 병살타`; break;
          case 'FO': text = `${nm}, ${POS_KO[f]} ${hit?.kind === 'pop' ? '팝플라이' : '뜬공'}`; break;
          case 'LO': text = `${nm}, ${POS_KO[f]} 직선타`; break;
          case 'SF': text = `${nm}, ${POS_KO[f]} 희생플라이 — 3루 주자 홈인`; break;
          case 'E': text = `${nm}, ${POS_KO[f]} 실책으로 출루${rbiTxt}`; break;
          default: text = nm;
        }
        // 볼카운트 · 투구 수
        const bcnt = pa.code === 'BB' ? 3 : Math.floor(rnd() * (pa.code === 'K' ? 3.2 : 3.6));
        const scnt = pa.code === 'K' ? 2 : pa.code === 'BB' ? Math.floor(rnd() * 3) : Math.floor(rnd() * 2.6);
        const fouls = scnt >= 2 ? Math.floor(rnd() * 2.4) : 0;
        const pitches = bcnt + scnt + fouls + 1;
        const before0 = pitchCount.get(pa.pitcher.id) ?? 0;
        const seq = genSeq({ id: `pv${b.id}-${halfKey}-${k}`, code: pa.code, count: { b: bcnt, s: scnt }, pitches, text }, pa.pitcher, pa.batter, 1, [0, 0], Math.max(0, (before0 - 70) / 30));
        pitchCount.set(pa.pitcher.id, before0 + seq.length);
        const defense = hit && hit.kind !== 'ground' ? makeDefense({ id: `pv${b.id}-${halfKey}-${k}`, code: pa.code, notation, hit }, defenseOf(fldSide), pa.pitcher.id) : undefined;
        const wpB = r3(homeWE(inn, bi, pa.outsBefore, maskOf(pa.before), before[1] - before[0]));
        const lastPlay = isLastHalf && k === pas.length - 1 || (inn === nInn && half === (b.line.home[inn - 1] == null ? 'top' : 'bot') && k === pas.length - 1);
        const wpA = lastPlay ? (b.oppScore > b.myScore ? 1 : b.oppScore < b.myScore ? 0 : 0.5) : r3(homeWE(inn, bi, pa.outsAfter, maskOf(pa.after), score[1] - score[0]));
        const lastSeq = seq[seq.length - 1];
        plays.push({
          id: `p${plays.length}`, idx: plays.length, isPA: true, slot: pa.slot, inning: inn, half, halfKey,
          outsBefore: Math.min(2, pa.outsBefore) as 0 | 1 | 2, basesBefore: pa.before, batterId: pa.batter.id, pitcherId: pa.pitcher.id,
          count: { b: Math.min(3, bcnt), s: Math.min(2, scnt) }, pitches: seq.length, code: pa.code, text, notation,
          rbi: pa.code === 'E' || pa.code === 'DP' ? 0 : pa.runs, score: [score[0], score[1]], outsAfter: pa.outsAfter,
          hit, lastPitch: lastSeq ? { type: lastSeq.sig ? 'SIG' : lastSeq.type, name: lastSeq.name, kmh: lastSeq.kmh, zone: lastSeq.zone } : undefined,
          defense, wp: [wpB, wpA],
          seq, basesAfter: pa.after, pre: k === 0 ? pre : [], wx: 0,
          errorBy: pa.code === 'E' ? (fi === 0 ? 'away' : 'home') : undefined,
        } as FullPlay);
      });
    }
  }
  // 서버 점수와 꼭 같은지 (다르면 기록을 믿지 않고 경고만 — 점수는 서버 것)
  if (import.meta.env.DEV && (score[0] !== b.myScore || score[1] !== b.oppScore)) console.warn('[대전 기록] 점수가 서버와 달라요', score, b.myScore, b.oppScore);
  markHighlights(plays, awayId, homeId, walkoff);

  // 줄 점수 · 결과
  const n = Math.max(9, nInn);
  const lineOf = (s: 0 | 1): LineScore => {
    const src = s === 0 ? b.line.away : b.line.home;
    const innings: (number | null)[] = Array.from({ length: n }, (_, i) => (i < src.length ? src[i] : null));
    const ps = plays.filter((p) => (p.half === 'top' ? 0 : 1) === s);
    return { innings, r: s === 0 ? b.myScore : b.oppScore, h: ps.filter((p) => ['1B', '2B', '3B', 'HR'].includes(p.code)).length, e: plays.filter((p) => p.code === 'E' && (p.half === 'top' ? 1 : 0) === s).length, b: ps.filter((p) => p.code === 'BB' || p.code === 'HBP').length };
  };
  const lineA = lineOf(0), lineH = lineOf(1);
  const final: [number, number] = [b.myScore, b.oppScore];
  const winSide = final[0] > final[1] ? 0 : final[1] > final[0] ? 1 : -1;
  let win = '', loss = '', save: string | undefined, gwrbi: string | undefined;
  if (winSide >= 0) {
    for (let k = plays.length - 1; k >= 0; k--) {
      const pl = plays[k];
      const prev = k > 0 ? plays[k - 1].score : [0, 0];
      const wasLead = winSide === 0 ? prev[0] > prev[1] : prev[1] > prev[0];
      const nowLead = winSide === 0 ? pl.score[0] > pl.score[1] : pl.score[1] > pl.score[0];
      if (nowLead && !wasLead) {
        gwrbi = pl.rbi > 0 ? pl.batterId : undefined;
        loss = pl.pitcherId;
        // 이긴 팀 투수 — 그때 던지던(또는 직전 수비 때 던진) 투수
        const wSide = winSide === 0 ? awayS : homeS;
        const wPrev = [...plays.slice(0, k + 1)].reverse().find((x) => (x.half === 'top' ? 1 : 0) === winSide);
        win = wPrev?.pitcherId ?? wSide.sp.id;
        break;
      }
    }
    const wSide = winSide === 0 ? awayS : homeS;
    const lastW = [...plays].reverse().find((x) => (x.half === 'top' ? 1 : 0) === winSide);
    if (wSide.cp && lastW?.pitcherId === wSide.cp.id && lastW.pitcherId !== win && Math.abs(final[0] - final[1]) <= 3) save = wSide.cp.id;
  }
  const date = new Date(b.at);
  const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  const homeTeam = teamById(homeId);
  const w = weatherOf(ymd, homeId, b.id);
  const wx: WxState = { tempC: w.tC, windMps: w.windMs, windTo: w.windMs < 1 ? 'calm' : 'out-cf', windKo: w.windMs < 1 ? '바람 없음' : '가운데 담장 쪽으로', sky: date.getHours() >= 18 ? 'night-clear' : 'clear', skyKo: w.dome ? '돔' : '맑음', rainPct: 10, effect: w.dome ? '돔 — 바람 영향 없음' : w.windMs >= 3 ? `가운데 비거리 +${Math.round(w.windMs)}m` : '바람 영향 거의 없음' };
  const weather: Weather = { city: homeTeam.region, sky: wx.sky, skyKo: wx.skyKo, tempC: wx.tempC, humidity: 60, windMps: wx.windMps, windTo: wx.windTo, windKo: wx.windKo, rainPct: 10, dust: '보통', effects: [wx.effect] };
  const keyFactors: Cause[] = [];
  const big = plays.filter((p) => p.highlight).sort((a2, b2) => Math.abs(b2.wp[1] - b2.wp[0]) - Math.abs(a2.wp[1] - a2.wp[0]))[0];
  if (big) keyFactors.push({ factor: 'form', text: big.text });
  keyFactors.push({ factor: 'chem', text: `팀 종합 ${b.me.ovr ? showOvr(b.me.ovr) : '?'} 대 ${b.opp.ovr ? showOvr(b.opp.ovr) : '?'} — 서버가 정한 결과` });
  const sideOut = (s: Side): GameSide => ({
    teamId: s.teamId,
    batting: s.batting.map((x, i) => ({ slot: i + 1, pid: x.p.id, pos: x.pos })),
    defense: defenseOf(s),
    starter: s.sp.id,
    bench: [],
    bullpen: [...s.rp, ...(s.cp ? [s.cp] : [])].map((p) => p.id),
  });
  const match: MatchRecord = {
    id: `pvp-${b.id}`, date: ymd, time, stadium: homeTeam.stadium.name, awayId, homeId, weather,
    line: { away: lineA, home: lineH }, final, walkoff,
    decision: { win, loss, save, gwrbi },
    starters: { away: awayS.sp.id, home: homeS.sp.id },
    plays, keyFactors, attendance: 0, duration: `${2 + Math.floor(plays.length / 40)}:${String(40 + (plays.length % 20)).padStart(2, '0')}`,
  };
  const sl = (l: LineScore) => ({ inn: l.innings, r: l.r, h: l.h, e: l.e, b: l.b });
  return { match, away: sideOut(awayS), home: sideOut(homeS), plays, wx: [wx], line: { away: sl(lineA), home: sl(lineH) }, tags };
}

function defenseOf(s: Side): GameSide['defense'] {
  const d = {} as GameSide['defense'];
  for (const b of s.batting) if (b.pos !== 'DH') d[b.pos as Exclude<Pos, 'P' | 'DH'>] = b.p.id;
  for (const pos of ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'] as const) if (!d[pos]) d[pos] = s.batting[0].p.id;
  return d;
}

/** 경기 화면 — 대전 기록으로 */
export async function preparePvpGame(id: string): Promise<{ game: FullGame; ctx: MatchCtx } | null> {
  const b = loadBattle(id);
  if (!b) return null;
  const game = pvpFullGame(b);
  const ctx: MatchCtx = {
    kind: 'pvp',
    end: {
      oppName: b.opp.username, oppTeamName: b.opp.teamName, oppClub: b.opp.club, my: b.myScore, their: b.oppScore, result: b.result,
      ratingBefore: b.ratingBefore, ratingDelta: b.ratingDelta, meRecord: b.meRecord, oppRecord: b.oppRecord, replay: b.replay,
    },
  };
  void ME;
  return { game, ctx };
}
