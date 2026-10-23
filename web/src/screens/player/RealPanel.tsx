// 실제 기록 탭 · 게임 통산 탭 (선수 정보)
//  · 실제 기록 — 실제 선수 카탈로그(game/kbo)의 연도별 상세 기록(rec-<앞자리>.json 을 이 탭을 열 때만 불러옴).
//      단일 연도 카드(시즌·MVP·GG·TH)는 그 해 실제 기록이 맨 위, 누적 카드(레전드·프랜차이즈·블랙·시그니처)는 실제 통산이 맨 위.
//      아래에 연도별 표(그 카드의 해를 강조). 맨 아래 출처 표기.
//  · 게임 통산 — 이 게임에서 치른 시즌들(season/career)의 합 + 시즌별 표. 실제 기록과 섞지 않는다.
import { useEffect, useState } from 'react';
import { GRADES } from '../../game/grades';
import { KBO_SOURCE_NOTE, kboCard, kboPerson, loadRecord, type KRecord, type RecBat, type RecPit } from '../../game/kbo';
import { shortLabel } from '../../game/world';
import { teamById } from '../../game/mock';
import type { CardInst, Player } from '../../game/types';
import { useSeason } from '../../season/store';
import { archivedCount, careerKey, careerOf, sumRows } from '../../season/career';
import { Sec } from './common';
import { SeasonBoard, batCells, pitCells } from './RecordPanel';
import s from './record.module.css';

const a3 = (x: number) => (x ? x.toFixed(3).replace(/^0/, '') : '.000');
const ipOf = (outs: number) => `${Math.floor(outs / 3)}${outs % 3 ? `.${outs % 3}` : ''}`;
const n0 = (x: number | null | undefined) => (x == null ? '-' : String(Math.round(x * 100) / 100));

function sumBat(rows: RecBat[]) {
  const t = { G: 0, PA: 0, AB: 0, H: 0, D: 0, T: 0, HR: 0, RBI: 0, R: 0, BB: 0, SO: 0, SB: 0 };
  let obpPA = 0;
  for (const r of rows) {
    t.G += r.g; t.PA += r.pa; t.AB += r.ab; t.H += r.h; t.D += r.d2; t.T += r.d3; t.HR += r.hr; t.RBI += r.rbi; t.R += r.r; t.SB += r.sb;
    t.BB += r.bb ?? 0; t.SO += r.so ?? 0; obpPA += r.obp * r.pa;
  }
  return { t, obp: t.PA ? obpPA / t.PA : 0 };
}
function sumPit(rows: RecPit[]) {
  const t = { G: 0, GS: 0, outs: 0, H: 0, R: 0, ER: 0, BB: 0, SO: 0, HR: 0, W: 0, L: 0, SV: 0, HLD: 0 };
  let eraW = 0;
  for (const r of rows) {
    t.G += r.g; t.GS += r.gs ?? 0; t.outs += r.outs; t.H += r.h; t.BB += r.bb ?? 0; t.SO += r.so; t.HR += r.hr ?? 0; t.W += r.w; t.L += r.l; t.SV += r.sv; t.HLD += r.hld;
    eraW += (r.era ?? 0) * r.outs;
  }
  t.ER = Math.round((eraW / 27) * 10) / 10; // 평균자책 × 이닝으로 되돌린 자책 (표에 자책이 없는 문서가 많아)
  if (rows.every((r) => r.gs == null)) t.GS = -1; // 선발 경기 수가 없는 기록 → '-'
  return t;
}

function BatTable({ rows, hi, sum }: { rows: RecBat[]; hi?: number; sum: boolean }) {
  const tot = sumBat(rows);
  const slgT = tot.t.AB ? (tot.t.H + tot.t.D + 2 * tot.t.T + 3 * tot.t.HR) / tot.t.AB : 0;
  return (
    <div className={s.ytWrap}>
      <table className={s.yt}>
        <caption className="sr-only">연도별 타격 기록</caption>
        <thead><tr><th>연도</th><th>구단</th><th>경기</th><th>타석</th><th>안타</th><th>2루타</th><th>홈런</th><th>타점</th><th>득점</th><th>도루</th><th>볼넷</th><th>삼진</th><th>타율</th><th>출루율</th><th>장타율</th><th>OPS</th><th>WAR</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={r.year === hi ? s.ytHi : undefined}>
              <td className="num">{r.year}</td><td>{shortLabel(r.code)}</td>
              <td className="num">{r.g}</td><td className="num">{r.pa}</td><td className="num">{r.h}</td><td className="num">{r.d2}</td><td className="num">{r.hr}</td><td className="num">{r.rbi}</td>
              <td className="num">{r.r}</td><td className="num">{r.sb}</td><td className="num">{n0(r.bb)}</td><td className="num">{n0(r.so)}</td>
              <td className="num">{a3(r.avg)}</td><td className="num">{a3(r.obp)}</td><td className="num">{a3(r.slg)}</td><td className="num">{a3(r.obp + r.slg)}</td><td className="num">{n0(r.war)}</td>
            </tr>
          ))}
          {sum && rows.length > 1 && (
            <tr className={s.ytSum}>
              <td>통산</td><td>{rows.length}줄</td>
              <td className="num">{tot.t.G}</td><td className="num">{tot.t.PA}</td><td className="num">{tot.t.H}</td><td className="num">{tot.t.D}</td><td className="num">{tot.t.HR}</td><td className="num">{tot.t.RBI}</td>
              <td className="num">{tot.t.R}</td><td className="num">{tot.t.SB}</td><td className="num">{tot.t.BB}</td><td className="num">{tot.t.SO}</td>
              <td className="num">{a3(tot.t.AB ? tot.t.H / tot.t.AB : 0)}</td><td className="num">{a3(tot.obp)}</td><td className="num">{a3(slgT)}</td><td className="num">{a3(tot.obp + slgT)}</td><td className="num">{n0(rows.reduce((a, r) => a + (r.war ?? 0), 0))}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
function PitTable({ rows, hi, sum }: { rows: RecPit[]; hi?: number; sum: boolean }) {
  const t = sumPit(rows);
  return (
    <div className={s.ytWrap}>
      <table className={s.yt}>
        <caption className="sr-only">연도별 투구 기록</caption>
        <thead><tr><th>연도</th><th>구단</th><th>경기</th><th>승</th><th>패</th><th>세이브</th><th>홀드</th><th>이닝</th><th>피안타</th><th>피홈런</th><th>볼넷</th><th>탈삼진</th><th>평균자책</th><th>WHIP</th><th>WAR</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={r.year === hi ? s.ytHi : undefined}>
              <td className="num">{r.year}</td><td>{shortLabel(r.code)}</td>
              <td className="num">{r.g}</td><td className="num">{r.w}</td><td className="num">{r.l}</td><td className="num">{r.sv}</td><td className="num">{r.hld}</td><td className="num">{ipOf(r.outs)}</td>
              <td className="num">{r.h}</td><td className="num">{n0(r.hr)}</td><td className="num">{n0(r.bb)}</td><td className="num">{r.so}</td>
              <td className="num">{r.era == null ? '-' : r.era.toFixed(2)}</td><td className="num">{r.whip == null ? '-' : r.whip.toFixed(2)}</td><td className="num">{n0(r.war)}</td>
            </tr>
          ))}
          {sum && rows.length > 1 && (
            <tr className={s.ytSum}>
              <td>통산</td><td>{rows.length}줄</td>
              <td className="num">{t.G}</td><td className="num">{t.W}</td><td className="num">{t.L}</td><td className="num">{t.SV}</td><td className="num">{t.HLD}</td><td className="num">{ipOf(t.outs)}</td>
              <td className="num">{t.H}</td><td className="num">{t.HR}</td><td className="num">{t.BB}</td><td className="num">{t.SO}</td>
              <td className="num">{t.outs ? ((t.ER * 27) / t.outs).toFixed(2) : '-'}</td><td className="num">{t.outs ? ((t.H + t.BB) / (t.outs / 3)).toFixed(2) : '-'}</td><td className="num">{n0(rows.reduce((a, r) => a + (r.war ?? 0), 0))}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** 실제 기록 탭 */
export function RealPanel({ p, card }: { p: Player; card: CardInst }) {
  const kid = p.real?.kid;
  const [rec, setRec] = useState<KRecord | null | undefined>(undefined);
  useEffect(() => {
    if (!kid) return;
    let on = true;
    setRec(undefined);
    loadRecord(kid).then((r) => { if (on) setRec(r); });
    return () => { on = false; };
  }, [kid]);
  if (!kid) {
    return (
      <div className={s.panel}>
        <Sec title="실제 기록"><p className={s.none}>가상 선수라 실제 기록이 없어요. 이 게임에서 쌓인 기록은 ‘내 시즌’ · ‘게임 통산’ 탭에서 볼 수 있어요.</p></Sec>
      </div>
    );
  }
  const kc = kboCard(card.id);
  const person = kboPerson(kid);
  const cumulative = !!kc && GRADES[kc.grade].kind === 'icon';
  const year = kc?.year ?? p.real?.year;
  const isP = p.pos === 'P';
  const bat = rec?.bat ?? [], pit = rec?.pit ?? [];
  const main = isP ? 'p' : 'b';
  const kindLabel = cumulative ? `${GRADES[kc!.grade].ko} 카드 · 누적` : `’${String(year).slice(-2)} 카드 · 단일 연도`;
  const yearsN = new Set([...bat, ...pit].map((r) => r.year)).size;
  let top: { title: string; meta: string; v: { head: { k: string; v: string }[]; cells: [string, string][] } } | null = null;
  if (rec) {
    if (cumulative) {
      if (main === 'p' && pit.length) top = { title: '실제 통산', meta: `KBO 1군 ${yearsN}시즌`, v: pitCells(sumPit(pit), p.role) };
      else if (bat.length) { const t = sumBat(bat).t; top = { title: '실제 통산', meta: `KBO 1군 ${yearsN}시즌`, v: batCells(t) }; }
    } else {
      const yp = pit.filter((r) => r.year === year), yb = bat.filter((r) => r.year === year);
      const clubs = [...new Set([...yp, ...yb].map((r) => shortLabel(r.code)))].join(' · ');
      if (main === 'p' && yp.length) top = { title: `${year} 실제 기록`, meta: clubs, v: pitCells(sumPit(yp), p.role) };
      else if (yb.length) top = { title: `${year} 실제 기록`, meta: clubs, v: batCells(sumBat(yb).t) };
    }
  }
  return (
    <div className={s.panel}>
      <section>
        <p className={s.realHead}>
          <span className={[s.kind, s.kindReal].join(' ')}>실제 기록</span>
          <span>{kindLabel}</span>
          {person?.birth && <span><b className="num">{person.birth}</b>년생</span>}
          <span>{teamById(p.teamId).name}</span>
        </p>
        {rec === undefined && <p className={s.loading}>기록을 불러오는 중…</p>}
        {rec === null && <p className={s.none}>이 선수의 연도별 기록을 찾지 못했어요.</p>}
      </section>
      {top && <SeasonBoard head={top.v.head} cells={top.v.cells} title={top.title} meta={top.meta} />}
      {rec && (main === 'p' ? pit : bat).length > 0 && (
        <Sec title="연도별 실제 기록" meta={cumulative ? '통산 줄 포함' : `${year} 줄 강조`}>
          {main === 'p' ? <PitTable rows={pit} hi={cumulative ? undefined : year} sum /> : <BatTable rows={bat} hi={cumulative ? undefined : year} sum />}
        </Sec>
      )}
      {rec && (main === 'p' ? bat : pit).length > 0 && (
        <Sec title={main === 'p' ? '타격 기록' : '투구 기록'} meta="함께 남은 기록">
          {main === 'p' ? <BatTable rows={bat} hi={cumulative ? undefined : year} sum /> : <PitTable rows={pit} hi={cumulative ? undefined : year} sum />}
        </Sec>
      )}
      {cumulative && <p className={s.srcNote}>이 표는 실제 프로 경력이에요. 이 게임에서 뛴 기록은 ‘내 시즌’ · ‘게임 통산’ 탭에 따로 쌓여요.</p>}
      <p className={s.srcNote}>{KBO_SOURCE_NOTE}. 구단은 게임 속 구단 이름으로 바꿔 적었어요.</p>
    </div>
  );
}

/** 게임 통산 탭 — 이 게임에서 치른 시즌들 */
export function CareerPanel({ p, card }: { p: Player; card: CardInst }) {
  const season = useSeason();
  const rows = careerOf(careerKey(p.id), season);
  const tot = sumRows(rows);
  const isP = p.pos === 'P' ? !!tot.pit : !tot.bat && !!tot.pit;
  const icon = GRADES[card.grade].kind === 'icon';
  const archived = archivedCount();
  return (
    <div className={s.panel}>
      <section>
        <p className={s.realHead}>
          <span className={s.kind}>게임 기록</span>
          <span>이 게임에서 치른 시즌만 · 지난 시즌 <b className="num">{archived}</b>개 저장됨</span>
        </p>
      </section>
      {!tot.bat && !tot.pit ? (
        <Sec title="게임 통산"><p className={s.none}>아직 기록이 없어요. 시즌 경기에 나서면 시즌마다 여기에 쌓여요.</p></Sec>
      ) : (
        <>
          {(() => { const v = isP ? pitCells(tot.pit!, p.role) : batCells(tot.bat!); return <SeasonBoard head={v.head} cells={v.cells} title="게임 통산" meta={`게임 시즌 ${rows.length}개`} />; })()}
          <Sec title="게임 시즌별">
            <div className={s.ytWrap}>
              <table className={s.yt}>
                <caption className="sr-only">게임 시즌별 기록</caption>
                {isP ? (
                  <>
                    <thead><tr><th>시즌</th><th>구단</th><th>경기</th><th>승</th><th>패</th><th>세이브</th><th>홀드</th><th>이닝</th><th>탈삼진</th><th>평균자책</th></tr></thead>
                    <tbody>
                      {rows.filter((r) => r.pit).map((r) => (
                        <tr key={r.label} className={r.live ? s.ytHi : undefined}>
                          <td>{r.label}</td><td>{teamById(r.club).short}</td><td className="num">{r.pit!.G}</td><td className="num">{r.pit!.W}</td><td className="num">{r.pit!.L}</td><td className="num">{r.pit!.SV}</td><td className="num">{r.pit!.HLD}</td>
                          <td className="num">{ipOf(r.pit!.outs)}</td><td className="num">{r.pit!.SO}</td><td className="num">{r.pit!.outs ? ((r.pit!.ER * 27) / r.pit!.outs).toFixed(2) : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                ) : (
                  <>
                    <thead><tr><th>시즌</th><th>구단</th><th>경기</th><th>타석</th><th>안타</th><th>홈런</th><th>타점</th><th>도루</th><th>타율</th><th>OPS</th></tr></thead>
                    <tbody>
                      {rows.filter((r) => r.bat).map((r) => {
                        const b = r.bat!;
                        const obp = b.PA ? (b.H + b.BB) / b.PA : 0, slg = b.AB ? (b.H + b.D + 2 * b.T + 3 * b.HR) / b.AB : 0;
                        return (
                          <tr key={r.label} className={r.live ? s.ytHi : undefined}>
                            <td>{r.label}</td><td>{teamById(r.club).short}</td><td className="num">{b.G}</td><td className="num">{b.PA}</td><td className="num">{b.H}</td><td className="num">{b.HR}</td>
                            <td className="num">{b.RBI}</td><td className="num">{b.SB}</td><td className="num">{a3(b.AB ? b.H / b.AB : 0)}</td><td className="num">{a3(obp + slg)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </>
                )}
              </table>
            </div>
          </Sec>
        </>
      )}
      {p.real && icon && <p className={s.srcNote}>레전드·상징 카드도 이 탭은 게임 안 기록만 더해요. 실제 프로 통산은 ‘실제 기록’ 탭에 따로 있어요.</p>}
      <p className={s.srcNote}>시즌을 ‘개막부터 다시’ 하거나 새로 시작하면, 지우기 전 시즌 기록이 여기로 옮겨져 통산에 더해져요.</p>
    </div>
  );
}
