// 선수 정보 시트 — 라인업에서 자리의 선수를 누르면: 얼굴 · 능력치 막대 · 이번 시즌 점수판 · 최근 10경기.
// 아래 '교체'는 지금까지의 바꾸기 시트로, '자세히'는 선수 화면(#/player/:id)으로.
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { CardMini, NameYear } from '../../cards';
import { Button, Sheet, StatBar, fmt } from '../../ui';
import { navigate } from '../../app/router';
import { GRADES } from '../../game/grades';
import { ATTR_KO, POS_KO, ROLE_KO, handKo } from '../../game/labels';
import { teamById } from '../../game/mock';
import type { AttrKey, Player } from '../../game/types';
import { cardAttrBonus, cardBonusSources, gearBonus, gearOf, recentOf } from '../player/local-mock';
import { cardProps } from '../../cards';
import { FIT_KO, STAFF_FIT_KO, SLOT_KO, fitPenalty, getSlot, isBat, unit, type Eval, type LineupState, type Slot } from './calc';
import s from './PlayerSheet.module.css';

const BAT_KEYS: AttrKey[] = ['contactR', 'contactL', 'power', 'gap', 'eye', 'avoidK'];
const RUN_FIELD_KEYS: AttrKey[] = ['speed', 'baserunning', 'range', 'hands', 'armStr', 'armAcc'];
const CATCH_KEYS: AttrKey[] = ['block', 'framing', 'popTime'];
const PIT_KEYS: AttrKey[] = ['velocity', 'control', 'deception', 'stamina', 'recovery'];
/** 막대 이름 칸에 들어갈 짧은 이름 */
const SHORT: Partial<Record<AttrKey, string>> = { contactR: '컨택 (우투)', contactL: '컨택 (좌투)', baserunning: '주루' };
const nameOf = (k: AttrKey) => SHORT[k] ?? ATTR_KO[k];

const throwsKo = (p: Player) => (p.throws === 'L' ? '좌투' : '우투');
const ipText = (ip: number) => (Number.isInteger(ip) ? `${ip}.0` : String(ip));

type AB = Partial<Record<AttrKey | 'stuff' | 'command', number>>;
function Bars({ title, keys, p, bonus }: { title: string; keys: AttrKey[]; p: Player; bonus?: AB }) {
  const list = keys.filter((k) => p.attrs[k] != null);
  if (!list.length) return null;
  return (
    <div className={s.group}>
      <h4 className={s.gh}>{title}</h4>
      {list.map((k) => <StatBar key={k} label={nameOf(k)} value={p.attrs[k]!} bonus={bonus?.[k] ?? 0} size="s" labelWidth={78} />)}
    </div>
  );
}

/** 점수판 칸 */
function Board({ cells }: { cells: { k: string; v: string; hot?: boolean }[] }) {
  return (
    <dl className={s.board}>
      {cells.map((c) => (
        <div key={c.k} className={s.cell}>
          <dt>{c.k}</dt>
          <dd className={['num', c.hot && s.hot].filter(Boolean).join(' ')}>{c.v}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface PlayerSheetProps {
  /** 연 자리 (null 이면 닫힘) */
  slot: Slot | null;
  st: LineupState;
  ev: Eval;
  onClose: () => void;
  /** '교체' — 그 자리 바꾸기 시트 열기 */
  onSwap: (slot: Slot) => void;
}

export function PlayerSheet({ slot, st, ev, onClose, onSwap }: PlayerSheetProps) {
  // 닫히는 동안에도 내용을 그대로 그린다
  const [shown, setShown] = useState<Slot | null>(slot);
  useEffect(() => { if (slot) setShown(slot); }, [slot]);
  const at = slot ?? shown;
  const id = at ? getSlot(st, at) : null;
  const u = id ? unit(id) : null;
  const recent = useMemo(() => (u ? recentOf(u.player) : null), [u]);
  if (!at || !u || !recent) return null;

  const p = u.player;
  const c = u.card;
  const ue = ev.units[at];
  const pit = p.pos === 'P';
  const bl = p.season.bat;
  const pl = p.season.pit;
  const sig = c.signaturePitch;
  const ovr = c.ovr ?? p.ovr;
  const trend = recent.trend === 'hot' ? '오름세' : recent.trend === 'cold' ? '내림세' : '평소대로';
  // 더해진 값 — 선수 상세 능력치와 같은 계산: 강화 · 훈련 · 잠재력(팀 몫 포함) · 플레이스타일 · 세트덱 · 장비
  const gearPer = gearBonus(p, gearOf(c, p).equipped).per;
  const bonus = cardAttrBonus(p, c, gearPer);
  const srcs = cardBonusSources(p, c, gearPer);

  const batCells = bl ? [
    { k: '타율', v: fmt.avg(bl.avg), hot: bl.avg >= 0.3 },
    { k: '홈런', v: String(bl.hr), hot: bl.hr >= 20 },
    { k: '타점', v: String(bl.rbi) },
    { k: 'OPS', v: fmt.avg(bl.ops), hot: bl.ops >= 0.9 },
    { k: '출루율', v: fmt.avg(bl.obp) },
    { k: '장타율', v: fmt.avg(bl.slg) },
    { k: '도루', v: String(bl.sb) },
    { k: '경기', v: String(bl.g) },
  ] : [];
  const pitCells = pl ? [
    { k: '평균자책', v: fmt.era(pl.era), hot: pl.era < 3 },
    { k: '승-패', v: `${pl.w}-${pl.l}` },
    p.role === 'CL' ? { k: '세이브', v: String(pl.sv) }
      : p.role === 'RP' ? { k: '홀드', v: String(pl.hld) }
      : p.role === 'SP' ? { k: '선발 등판', v: String(pl.gs) }
      : { k: '세이브·홀드', v: `${pl.sv}·${pl.hld}` },
    { k: '이닝', v: ipText(pl.ip) },
    { k: '탈삼진', v: String(pl.so) },
    { k: 'WHIP', v: pl.whip.toFixed(2), hot: pl.whip < 1.1 },
    { k: '볼넷', v: String(pl.bb) },
    { k: '경기', v: String(pl.g) },
  ] : [];
  const cells = pit ? pitCells : batCells;
  const order = st.order.indexOf(at as never) + 1;
  const fitNote = ue && ue.fit !== 'main' && ue.fit !== 'any' ? `${(isBat(at) ? FIT_KO : STAFF_FIT_KO)[ue.fit]} −${fitPenalty(ue.fit, at)}` : null;

  return (
    <Sheet
      open={!!slot}
      onClose={onClose}
      title={order > 0 ? `${SLOT_KO[at]} · ${order}번 타자` : SLOT_KO[at]}
      footer={
        <>
          <Button variant="secondary" onClick={() => onSwap(at)}>교체</Button>
          <Button variant="primary" onClick={() => navigate(`/player/${p.id}`)}>자세히</Button>
        </>
      }
    >
      <div className={s.head}>
        <CardMini {...cardProps(c)} ovrShown={ue ? Math.round(ue.total) : undefined} width={64} eager />
        <div className={s.who}>
          <p className={s.name}><b><NameYear name={p.name} year={c.year} /></b><span className="num">#{p.number}</span></p>
          <p className={s.meta}>
            <span>{u.team.name}</span>
            <span>{pit ? (p.role ? `${ROLE_KO[p.role]} 투수` : '투수') : `주 포지션 ${POS_KO[p.pos]}`}</span>
            {fitNote && <span className={s.warn}>{fitNote}</span>}
          </p>
          <p className={s.meta}>
            <span style={{ color: `var(--gr-${c.grade})` }} className={s.grade}>{GRADES[c.grade].ko}{c.year ? ` ${fmt.yearTag(c.year)}` : ''}</span>
            <span>{pit ? throwsKo(p) : handKo(p.throws, p.bats)}</span>
            <span className="num">{p.age}세</span>
            {c.enhance > 0 && <span className="num">강화 {fmt.roman(c.enhance)}</span>}
          </p>
          {p.injury && <p className={s.hurt}>부상 · {p.injury}</p>}
        </div>
        <div className={s.ovr}>
          <small>{ue ? '라인업 종합' : '종합'}</small>
          <b className={['num-display', ue && Math.round(ue.total) > ovr && s.ovrUp, ue && Math.round(ue.total) < ovr && s.ovrDown].filter(Boolean).join(' ')}>{ue ? Math.round(ue.total) : ovr}</b>
          {ue && Math.round(ue.total) !== ovr && <small>카드 <span className="num">{ovr}</span> {Math.round(ue.total) > ovr ? '+' : '−'}<span className="num">{Math.abs(Math.round(ue.total) - ovr)}</span></small>}
        </div>
      </div>

      <section className={s.sec} aria-label="능력치">
        <h3 className={s.h}><b>능력치</b><span>{srcs.length ? '막대 끝 빗금 · 초록 + = 더해진 값' : '1~100'}</span></h3>
        {srcs.length > 0 && (
          <p className={s.plusLine}>
            <span>더해진 값</span>
            {srcs.map(([k, v]) => <b key={k}>{k} <em className="num">+{v}</em></b>)}
          </p>
        )}
        {pit ? (
          <div className={s.cols}>
            <Bars title="투구" keys={PIT_KEYS} p={p} bonus={bonus} />
            {p.pitches && p.pitches.length > 0 && (
              <div className={s.group}>
                <h4 className={s.gh}>구종 위력<span>평균 구속 · 구사율</span></h4>
                {p.pitches.map((pt) => (
                  <StatBar key={pt.type} size="s" labelWidth={78} value={pt.stuff} bonus={bonus.stuff ?? 0}
                    label={pt.ko}
                    note={<span className="num">{pt.kmh} · {Math.round(pt.usage * 100)}%</span>} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className={s.cols}>
            <Bars title="타격" keys={BAT_KEYS} p={p} bonus={bonus} />
            <Bars title="주루 · 수비" keys={RUN_FIELD_KEYS} p={p} bonus={bonus} />
            {p.pos === 'C' && <Bars title="포수" keys={CATCH_KEYS} p={p} bonus={bonus} />}
          </div>
        )}
        {sig && (
          <p className={s.sig} style={{ ['--sig' as string]: sig.color } as CSSProperties}>
            <b>{sig.name}</b><span>고유 구종 · {sig.effect}</span>
          </p>
        )}
      </section>

      <section className={s.sec} aria-label="이번 시즌 성적">
        <h3 className={s.h}><b>이번 시즌</b><span className="num">{fmt.yearTag(27)} 정규 시즌</span></h3>
        {cells.length ? <Board cells={cells} /> : <p className={s.none}>아직 기록이 없어요</p>}
      </section>

      <section className={s.sec} aria-label="최근 10경기">
        <h3 className={s.h}><b>최근 10경기</b><span>{trend}</span></h3>
        <p className={s.sum}>
          {recent.summary.map((x) => <span key={x.k}>{x.k} <b className="num">{x.v}</b></span>)}
        </p>
        <table className={s.games}>
          <thead>
            <tr><th>날짜</th><th>상대</th><th>기록</th><th className={s.rt}>평점</th></tr>
          </thead>
          <tbody>
            {[...recent.rows].reverse().map((r) => (
              <tr key={r.date + r.oppId}>
                <td className="num">{r.date}</td>
                <td>{r.home ? '' : '@'}{teamById(r.oppId).short}</td>
                <td className={s.detail}>{r.detail}</td>
                <td className={s.rt}>
                  <span className={s.rtIn}>
                  <span className={s.rate}>
                    <i style={{ width: `${Math.max(0, Math.min(100, ((r.rating - 4) / 6) * 100))}%` }}
                      className={r.rating >= 8 ? s.rGood : r.rating < 6 ? s.rBad : undefined} />
                  </span>
                  <b className="num">{r.rating.toFixed(1)}</b>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </Sheet>
  );
}
