// 전술 — 경기 운영 › 전술. 경기 전에 정해 두는 팀 전체 전술 + 선수별 전술(타자 · 투수) + 수석코치 팀 분석(Claude).
// 정한 전술은 시즌 경기 · 빨리 감기 · 가을야구의 우리 경기에 그대로 들어간다(game/tactics → season/sim). 대전은 서버가 종합으로 정해 들어가지 않는다.
// 주소: ?tab=team|bat|pit
import { useMemo, useState, type CSSProperties } from 'react';
import type { ScreenProps } from '../../app/screen';
import { navigate } from '../../app/router';
import { CardMini, NameYear, cardProps } from '../../cards';
import { Button, Sheet, Tabs, useToast } from '../../ui';
import {
  BAT_OPTS, GROUP_KO, PIT_OPTS, TEAM_OPTS, personKey, saveTactics, setPlayerTac, setTeamTac, tacCount, teamVal, useTactics,
  type Opt, type PlayerOptDef, type TacGroup, type TacState, type TeamKey,
} from '../../game/tactics';
import { ADVICE_DAILY, adviceLeft, askAdvice, buildAdviceInput, lastAdvice, type AdviceOut } from '../../game/advice';
import { ROT_SLOTS, SLOT_KO, STAFF_SLOTS, getSlot, initialLineup, store as lineupStore, unit, type StaffSlot } from '../lineup/calc';
import { POS_KO } from '../../game/labels';
import s from './tactics.module.css';

type Tab = 'team' | 'bat' | 'pit';
const TABS: { value: Tab; label: string }[] = [{ value: 'team', label: '팀 전술' }, { value: 'bat', label: '타자별' }, { value: 'pit', label: '투수별' }];

/** 세 칸 고르기 (라디오) */
function Seg({ opts, value, onChange, label }: { opts: Opt[]; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className={s.seg} role="radiogroup" aria-label={label} style={{ '--n': opts.length } as CSSProperties}>
      {opts.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={o.v === value} className={o.v === value ? s.segOn : undefined} onClick={() => onChange(o.v)}>
          {o.ko}
        </button>
      ))}
    </div>
  );
}

export default function TacticsScreen({ query }: ScreenProps) {
  const tac = useTactics();
  const [tab, setTab] = useState<Tab>(() => { const t = query.get('tab'); return t === 'bat' || t === 'pit' ? t : 'team'; });
  const n = tacCount(tac);
  return (
    <div className={s.screen}>
      <header className={s.top}>
        <h2 className={['head', s.title].join(' ')}>전술</h2>
        <p className={s.lead}>
          경기 전에 정해 두면 시즌 경기 · 빨리 감기 · 가을야구의 <b>우리 경기</b>에 그대로 들어가요.
          전술은 판단의 기울기만 바꾸고, 결과는 선수 실력이 정해요.
        </p>
      </header>

      <AdviceCard tac={tac} />

      <Tabs
        className={s.tabs}
        items={TABS.map((t) => ({ ...t, label: t.value === 'team' ? `팀 전술${n.team ? ` ${n.team}` : ''}` : t.value === 'bat' ? `타자별${n.bat ? ` ${n.bat}` : ''}` : `투수별${n.pit ? ` ${n.pit}` : ''}` }))}
        value={tab}
        onChange={setTab}
        aria-label="전술 보기"
      />
      {tab === 'team' && <TeamTab tac={tac} />}
      {tab === 'bat' && <PlayerTab kind="bat" tac={tac} />}
      {tab === 'pit' && <PlayerTab kind="pit" tac={tac} />}

      <p className={s.foot}>대전(다른 감독 구단과의 경기)은 서버가 팀 종합으로 결과를 정해서 전술이 들어가지 않아요.</p>
    </div>
  );
}

/* ───────── 팀 전술 ───────── */
function TeamTab({ tac }: { tac: TacState }) {
  const toast = useToast();
  const groups: TacGroup[] = ['att', 'def', 'pit'];
  const changed = Object.keys(tac.team).length;
  return (
    <section className={s.sec} aria-label="팀 전술">
      {groups.map((g) => (
        <div key={g} className={s.group}>
          <h3 className={s.gh}>{GROUP_KO[g]}</h3>
          {TEAM_OPTS.filter((o) => o.group === g).map((d) => {
            const v = teamVal(tac, d.key);
            const fx = d.opts.find((o) => o.v === v)?.fx;
            return (
              <div key={d.key} className={[s.opt, v !== d.def && s.optSet].filter(Boolean).join(' ')}>
                <div className={s.optHead}>
                  <b>{d.ko}</b>
                  <small>{d.help}</small>
                </div>
                <Seg opts={d.opts} value={v} label={d.ko} onChange={(x) => setTeamTac(d.key, x)} />
                {fx && <p className={s.fx}>{fx}</p>}
              </div>
            );
          })}
        </div>
      ))}
      {changed > 0 && (
        <div className={s.resetRow}>
          <Button variant="ghost" size="s" onClick={() => { saveTactics({ ...tac, team: {} }); toast({ text: '팀 전술을 모두 기본으로 되돌렸어요', tone: 'info' }); }}>팀 전술 모두 기본으로</Button>
        </div>
      )}
    </section>
  );
}

/* ───────── 선수별 ───────── */
interface Row { id: string; person: string; slot: string; sub: string; staff?: StaffSlot }
function rowsOf(kind: 'bat' | 'pit'): Row[] {
  const st = lineupStore.get() ?? initialLineup();
  if (kind === 'bat') {
    return st.order.flatMap((slot, i) => {
      const id = st.field[slot];
      if (!id) return [];
      const u = unit(id);
      return [{ id, person: personKey(u.player.id), slot: `${i + 1}번`, sub: POS_KO[slot === 'DH' ? 'DH' : slot] ?? slot }];
    });
  }
  return STAFF_SLOTS.flatMap((slot) => {
    const id = getSlot(st, slot);
    if (!id) return [];
    const u = unit(id);
    return [{ id, person: personKey(u.player.id), slot: SLOT_KO[slot], sub: u.player.throws === 'L' ? '좌투' : '우투', staff: slot }];
  });
}
function summary(kind: 'bat' | 'pit', set: Record<string, string> | undefined): string {
  if (!set) return '';
  const defs: PlayerOptDef<string>[] = kind === 'bat' ? BAT_OPTS : PIT_OPTS;
  return defs.flatMap((d) => { const v = set[d.key]; const o = v ? d.opts.find((x) => x.v === v) : undefined; return o ? [o.ko] : []; }).join(' · ');
}

function PlayerTab({ kind, tac }: { kind: 'bat' | 'pit'; tac: TacState }) {
  const rows = useMemo(() => rowsOf(kind), [kind]);
  const [open, setOpen] = useState<Row | null>(null);
  const map = kind === 'bat' ? tac.bat : tac.pit;
  return (
    <section className={s.sec} aria-label={kind === 'bat' ? '타자별 전술' : '투수별 전술'}>
      <p className={s.hint}>{kind === 'bat' ? '타순 1~9번. 누르면 그 타자만 따로 정해요 — 안 정하면 팀 전술을 따라요.' : '선발 · 불펜 · 마무리. 누르면 그 투수만 따로 정해요.'}</p>
      <ul className={s.list}>
        {rows.map((r) => {
          const u = unit(r.id);
          const sum = summary(kind, map[r.person]);
          return (
            <li key={r.id}>
              <button type="button" className={[s.row, sum && s.rowSet].filter(Boolean).join(' ')} onClick={() => setOpen(r)}>
                <span className={s.rowSlot}>{r.slot}</span>
                <span className={s.rowCard}><CardMini {...cardProps(u.card)} width={40} label={false} /></span>
                <span className={s.rowWho}>
                  <b><NameYear name={u.player.name} year={u.card.year} /></b>
                  <small>{r.sub}</small>
                </span>
                <span className={s.rowTac}>{sum || <i>팀 따름</i>}</span>
              </button>
            </li>
          );
        })}
        {!rows.length && <li className={s.empty}>라인업이 비어 있어요. 팀관리 › 라인업에서 먼저 채워 주세요.</li>}
      </ul>
      <PlayerSheet kind={kind} row={open} tac={tac} onClose={() => setOpen(null)} />
    </section>
  );
}

function PlayerSheet({ kind, row, tac, onClose }: { kind: 'bat' | 'pit'; row: Row | null; tac: TacState; onClose: () => void }) {
  const u = row ? unit(row.id) : null;
  const set: Record<string, string | undefined> = row ? (kind === 'bat' ? tac.bat : tac.pit)[row.person] ?? {} : {};
  const isSp = !!row?.staff && (ROT_SLOTS as string[]).includes(row.staff);
  const defs: PlayerOptDef<string>[] = (kind === 'bat' ? BAT_OPTS : PIT_OPTS).filter((d) => !d.spOnly || isSp);
  return (
    <Sheet open={!!row} onClose={onClose} title={u ? `${u.player.name} 전술` : ''} sub={row ? `${row.slot} · ${row.sub}` : undefined}
      footer={row && Object.keys(set).length > 0 ? (
        <Button variant="secondary" onClick={() => { for (const d of defs) setPlayerTac(kind, row.person, d.key, 'team'); }}>모두 팀 따름으로</Button>
      ) : undefined}>
      {row && u && (
        <div className={s.pSheet}>
          {defs.map((d) => {
            const v = set[d.key] ?? 'team';
            const fx = d.opts.find((o) => o.v === v)?.fx;
            return (
              <div key={d.key} className={s.opt}>
                <div className={s.optHead}><b>{d.ko}</b></div>
                <Seg opts={d.opts} value={v} label={d.ko} onChange={(x) => setPlayerTac(kind, row.person, d.key, x)} />
                {fx && <p className={s.fx}>{fx}</p>}
              </div>
            );
          })}
          {kind === 'pit' && !isSp && <p className={s.hint}>투구 수 한도는 선발만 정해요 — 불펜은 이닝마다 바꿔요.</p>}
        </div>
      )}
    </Sheet>
  );
}

/* ───────── 수석코치 팀 분석 (Claude · 안 되면 기본 분석) ───────── */
function AdviceCard({ tac }: { tac: TacState }) {
  const toast = useToast();
  const [out, setOut] = useState<AdviceOut | null>(() => lastAdvice());
  const [busy, setBusy] = useState(false);
  const left = adviceLeft();
  const run = async () => {
    if (busy) return;
    setBusy(true);
    try { setOut(await askAdvice(buildAdviceInput(tac))); }
    catch { toast({ text: '분석을 만들지 못했어요. 잠시 뒤 다시 해 주세요', tone: 'bad' }); }
    finally { setBusy(false); }
  };
  const applyTeam = (key: TeamKey, v: string) => setTeamTac(key, v);
  const applyAll = () => {
    if (!out) return;
    const t: TacState = { ...tac, team: { ...tac.team }, bat: { ...tac.bat }, pit: { ...tac.pit } };
    for (const x of out.team) t.team[x.key] = x.v;
    for (const p of out.players) { const m = p.kind === 'bat' ? t.bat : t.pit; m[p.id] = { ...(m[p.id] ?? {}), ...p.set }; }
    saveTactics(t);
    toast({ text: '추천 전술을 모두 적용했어요', tone: 'good' });
  };
  const teamApplied = (key: TeamKey, v: string) => teamVal(tac, key) === v;
  const playerApplied = (p: AdviceOut['players'][number]) => { const m = (p.kind === 'bat' ? tac.bat : tac.pit)[p.id] ?? {}; return Object.entries(p.set).every(([k, v]) => (m as Record<string, string>)[k] === v); };
  const optKo = (kind: 'bat' | 'pit', key: string, v: string) => { const d = (kind === 'bat' ? BAT_OPTS : PIT_OPTS).find((x) => x.key === key); return d ? `${d.ko} ${d.opts.find((o) => o.v === v)?.ko ?? v}` : v; };
  const pending = out ? out.team.filter((x) => !teamApplied(x.key, x.v)).length + out.players.filter((p) => !playerApplied(p)).length : 0;

  return (
    <section className={s.coach} aria-label="수석코치 팀 분석">
      <div className={s.coachHead}>
        <p className={s.coachK}>수석코치 분석</p>
        {out && <span className={out.source === 'ai' ? s.srcAi : s.srcRule}>{out.source === 'ai' ? 'Claude 분석' : '기본 분석'}</span>}
      </div>
      {!out && <p className={s.coachLead}>라인업 · 능력치 · 이번 시즌 기록을 보고 강점과 약점, 경기 전 전술을 추천해요.</p>}
      {out && (
        <>
          <p className={s.headline}>{out.headline}</p>
          {out.note && <p className={s.note}>{out.note}</p>}
          {(out.strengths.length > 0 || out.weaknesses.length > 0) && (
            <div className={s.sw}>
              {out.strengths.map((x) => <p key={'s' + x} className={s.plus}><i aria-hidden>+</i>{x}</p>)}
              {out.weaknesses.map((x) => <p key={'w' + x} className={s.minus}><i aria-hidden>−</i>{x}</p>)}
            </div>
          )}
          {(out.team.length > 0 || out.players.length > 0) && (
            <div className={s.recs}>
              <p className={s.recH}>추천 전술</p>
              {out.team.map((x) => {
                const d = TEAM_OPTS.find((o) => o.key === x.key)!;
                const done = teamApplied(x.key, x.v);
                return (
                  <div key={x.key} className={s.rec}>
                    <p><b>{d.ko}</b> → {d.opts.find((o) => o.v === x.v)?.ko}{x.why && <small>{x.why}</small>}</p>
                    <button type="button" className={done ? s.recDone : s.recBtn} disabled={done} onClick={() => applyTeam(x.key, x.v)}>{done ? '적용됨' : '적용'}</button>
                  </div>
                );
              })}
              {out.players.map((p) => {
                const done = playerApplied(p);
                return (
                  <div key={p.kind + p.id} className={s.rec}>
                    <p><b>{p.name}</b> {Object.entries(p.set).map(([k, v]) => optKo(p.kind, k, v)).join(' · ')}{p.why && <small>{p.why}</small>}</p>
                    <button type="button" className={done ? s.recDone : s.recBtn} disabled={done}
                      onClick={() => { for (const [k, v] of Object.entries(p.set)) setPlayerTac(p.kind, p.id, k, v); }}>{done ? '적용됨' : '적용'}</button>
                  </div>
                );
              })}
            </div>
          )}
          {out.lineup.length > 0 && (
            <div className={s.lineupTips}>
              {out.lineup.map((x) => <p key={x}>{x}</p>)}
              <button type="button" className={s.link} onClick={() => navigate('/lineup')}>라인업으로 →</button>
            </div>
          )}
        </>
      )}
      <div className={s.coachActions}>
        {out && pending > 0 && <Button variant="primary" size="s" onClick={applyAll}>추천 모두 적용 ({pending})</Button>}
        <Button variant={out ? 'secondary' : 'primary'} size="s" onClick={run} loading={busy} disabled={busy}>
          {busy ? '분석 중…' : out ? '다시 분석' : '팀 분석 받기'}
        </Button>
        <small className={s.left}>Claude 분석 오늘 <b className="num">{left}</b>/{ADVICE_DAILY}번</small>
      </div>
    </section>
  );
}
