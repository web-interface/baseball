// 강화 탭 — 다음 단계 · 성공 확률과 실패 보정(실패마다 +15%p, 4번째 확정) · 재료 · 비용 · +5 플레이스타일 · 단계표 · 레벨
// 실패해도 단계가 떨어지거나 카드가 사라지지 않는다 (05 원작충실 §7.1)
import type { CSSProperties } from 'react';
import { Button, Sheet, fmt } from '../../ui';
import { CardMini } from '../../cards';
import { GRADES } from '../../game/grades';
import type { CardInst, Player } from '../../game/types';
import { Sec } from './common';
import { LIcon } from './icons';
import { PITY_STEP, chanceAfter, enhGainTotal, enhTable, playstylesFor, type Playstyle } from './local-mock';
import s from './enhance.module.css';

export interface MatPick { kind: 'card' | 'ticket'; id: string }
export interface Materials { cards: { card: CardInst; count: number }[]; ticket: { id: string; ko: string; have: number } }

export interface EnhanceResult { ok: boolean; stage: number; chance: number; nextChance: number | null; gain: number; gp: number; mat: string }

export interface EnhancePanelProps {
  p: Player;
  card: CardInst;
  enh: number;
  fails: number;
  level: number;
  playstyle: string | null;
  mats: Materials;
  pick: MatPick | null;
  spent: number;
  onPick: (m: MatPick) => void;
  onPlaystyle: (id: string) => void;
}

export function EnhancePanel({ p, card, enh, fails, level, playstyle, mats, pick, spent, onPick, onPlaystyle }: EnhancePanelProps) {
  const table = enhTable(card.grade);
  const next = table[enh];
  const chance = next ? chanceAfter(next.base, fails) : 100;
  const total = enhGainTotal(card.grade, enh);
  const g = GRADES[card.grade];
  const lvMax = g.levelMax;
  const lv = fmt.levelParts(level);
  const styles = playstylesFor(p);
  const needN = next ? next.need : 0;
  const haveN = mats.cards[0]?.count ?? 0;

  return (
    <div className={s.panel}>
      {next ? (
        <Sec title="다음 강화" meta={<>지금까지 대표 능력치 <b className="num">+{total}</b></>}>
          <div className={s.step}>
            <span className={['num-display', s.from].join(' ')}>{enh > 0 ? fmt.roman(enh) : '0'}</span>
            <LIcon name="arrow" size={22} stroke={2} className={s.arrow} />
            <span className={['num-display', s.to].join(' ')}>{fmt.roman(next.stage)}</span>
            <p className={s.gain}>
              대표 능력치 6개 모두 <b className="num">+{next.gain}</b>
              {next.stage === 5 && <><br />플레이스타일을 고를 수 있어요</>}
              {next.stage === 10 && <><br />완성 각인 · 카드 테에 X 이펙트</>}
            </p>
          </div>

          {next.auto ? (
            <div className={s.autoBox}>
              <p className={s.autoHead}>같은 카드 <b className="num">{haveN}</b> / <span className="num">{needN}</span>장</p>
              <span className={s.autoBar} aria-hidden><i style={{ width: `${Math.min(100, (haveN / needN) * 100)}%` }} /></span>
              <p className={s.rule}>I~V 는 같은 카드가 {needN}장 모이면 그 자리에서 자동으로 올라요(쓴 장수만큼 보유 수량이 줄어요). 카드구매 · 카드 조합 · 스카우터로 같은 카드를 모아요.</p>
            </div>
          ) : (<>
          <div className={s.odds}>
            <div className={s.big}>
              <span className={s.oddsLab}>이번 성공 확률</span>
              <b className="num-display">{chance}<small>%</small></b>
              {fails > 0 && <span className={s.carry}>지난 실패 <span className="num">{fails}</span>번 보정 <b className="num">+{fails * PITY_STEP}%p</b></span>}
            </div>
            <ol className={s.ladder} aria-label="실패하면 다음 확률">
              {[0, 1, 2, 3].map((k) => {
                const c = chanceAfter(next.base, k);
                return (
                  <li key={k} className={[k < fails && s.done, k === Math.min(fails, 3) && s.now].filter(Boolean).join(' ')} style={{ '--h': `${c}%` } as CSSProperties}>
                    <span className={s.col} aria-hidden><i /></span>
                    <b className="num">{c >= 100 ? '확정' : `${c}%`}</b>
                    <span className={s.nth}>{k + 1}번째</span>
                  </li>
                );
              })}
            </ol>
          </div>
          <p className={s.rule}>실패해도 단계는 그대로, 카드도 사라지지 않아요(재료 1장 · GP 만 써요). 실패할 때마다 다음 확률이 <b>+{PITY_STEP}%p</b> 오르고, 세 번 실패하면 네 번째는 확정이에요. 확률은 서버가 정하고 기록에 남아요.</p>
          </>)}
        </Sec>
      ) : (
        <Sec title="강화 완성" meta="X">
          <p className={s.done10}><b className="num-display">X</b> 대표 능력치 <span className="num">+{total}</span> · 완성 각인</p>
        </Sec>
      )}

      {next && (
        <Sec title="재료" meta={<>필요 <b className="num">{next.mat}</b>{next.gp > 0 && <> + <b className="num">{fmt.int(next.gp)}</b> GP</>}</>}>
          <ul className={s.mats} role="radiogroup" aria-label="재료 고르기">
            {mats.cards.map((m) => {
              const on = pick?.kind === 'card' && pick.id === m.card.id;
              const short = m.count < needN;
              return (
                <li key={m.card.id}>
                  <button type="button" role="radio" aria-checked={on} disabled={short} className={[s.mat, on && s.matOn].filter(Boolean).join(' ')} onClick={() => onPick({ kind: 'card', id: m.card.id })}>
                    <i className={s.radio} aria-hidden />
                    <CardMini player={p} grade={m.card.grade} enhance={m.card.enhance} width={40} />
                    <span className={s.matBody}>
                      <b>{p.name} {GRADES[m.card.grade].ko}{m.card.year != null && GRADES[m.card.grade].yearTagged ? ` ${fmt.yearTag(m.card.year)}` : ''}</b>
                      <span>같은 카드 중복 · 출처(뽑기·조합·스카우터) 상관없이 같은 확률</span>
                    </span>
                    <span className={s.count}><b className="num">{m.count}</b>장</span>
                  </button>
                </li>
              );
            })}
            <li>
              <button type="button" role="radio" aria-checked={pick?.kind === 'ticket'} disabled={mats.ticket.have < needN} className={[s.mat, pick?.kind === 'ticket' && s.matOn].filter(Boolean).join(' ')} onClick={() => onPick({ kind: 'ticket', id: mats.ticket.id })}>
                <i className={s.radio} aria-hidden />
                <span className={s.ticket} aria-hidden><LIcon name="plus" size={16} stroke={2} /></span>
                <span className={s.matBody}>
                  <b>{mats.ticket.ko}</b>
                  <span>재료 1장 몫 · 상점 준비 중</span>
                </span>
                <span className={s.count}><b className="num">{mats.ticket.have}</b>장</span>
              </button>
            </li>
          </ul>
          {next.gp > 0 && <p className={s.gp}>비용 <b className="num">{fmt.int(next.gp)}</b> GP · 오늘 강화에 쓴 GP <span className="num">{fmt.int(spent)}</span></p>}
        </Sec>
      )}

      <Sec title="플레이스타일" meta={enh >= 5 ? '바꾸기 무료' : 'V 에서 열려요'}>
        <ul className={[s.styles, enh < 5 && s.locked].filter(Boolean).join(' ')} role="radiogroup" aria-label="플레이스타일">
          {styles.map((ps: Playstyle) => {
            const on = enh >= 5 && playstyle === ps.id;
            return (
              <li key={ps.id}>
                <button type="button" role="radio" aria-checked={on} disabled={enh < 5} className={[s.style, on && s.styleOn].filter(Boolean).join(' ')} onClick={() => onPlaystyle(ps.id)}>
                  <span className={s.sIcon} aria-hidden><LIcon name={ps.icon} size={20} /></span>
                  <span className={s.sBody}><b>{ps.ko}</b><span>{ps.text}</span></span>
                  <i className={s.radio} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
        {enh < 5 && <p className={s.lockNote}><LIcon name="lock" size={14} /> 강화 V 를 달성하면 고를 수 있어요 · 지금 {enh > 0 ? fmt.roman(enh) : '0'}</p>}
      </Sec>

      <Sec title="강화 단계" meta="확률 공개 · 재료 출처 차별 없음">
        <table className={s.table}>
          <thead>
            <tr><th>단계</th><th>재료</th><th className={s.r}>확률</th><th className={s.r}>능력치</th></tr>
          </thead>
          <tbody>
            {table.map((t) => (
              <tr key={t.stage} className={[t.stage <= enh && s.got, t.stage === enh + 1 && s.nextRow].filter(Boolean).join(' ')}>
                <td className={['num', s.rn].join(' ')}>{fmt.roman(t.stage)}</td>
                <td>{t.mat}{t.gp > 0 ? <span className="num"> + {fmt.man(t.gp)}</span> : <small> 자동</small>}</td>
                <td className={['num', s.r].join(' ')}>{t.base}%</td>
                <td className={['num', s.r].join(' ')}>+{t.gain}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={s.tNote}>I~V 는 같은 카드가 모이면 자동, VI 부터 도전 · VII 부터 실패 보정이 붙어요. 합계 <span className="num">+{enhGainTotal(card.grade, 10)}</span> · V 에서 플레이스타일, X 에서 완성 각인.</p>
      </Sec>

      <Sec title="레벨" meta={<>최대 <span className="num">{lvMax}</span> · {g.ko}</>}>
        <div className={s.level}>
          <b className="num-display" style={{ color: fmt.levelColor(level) }}>{fmt.level(level)}</b>
          <div className={s.lvRight}>
            <span className={s.lvBar} aria-hidden><i style={{ width: lv.lv >= lvMax ? '100%' : `${lv.progress}%` }} /></span>
            <span className={s.lvSub}>{lv.lv >= lvMax ? '최대 레벨 · 각인 완료' : <>레벨 <span className="num">{lv.lv + 1}</span>까지 <span className="num">{100 - lv.progress}%</span> · 경기·훈련으로 올라요</>}</span>
          </div>
        </div>
      </Sec>
    </div>
  );
}

/* ───────── 강화 결과 시트 ───────── */
export function EnhanceResultSheet({ result, p, card, enh, playstyle, onPlaystyle, onClose, onAgain }: {
  result: EnhanceResult | null; p: Player; card: CardInst; enh: number; playstyle: string | null;
  onPlaystyle: (id: string) => void; onClose: () => void; onAgain: () => void;
}) {
  const needStyle = !!result?.ok && result.stage === 5 && !playstyle;
  const styles = playstylesFor(p);
  return (
    <Sheet
      open={!!result}
      onClose={onClose}
      dismissible={!needStyle}
      title={result ? (result.ok ? `강화 성공 · ${fmt.roman(result.stage)}` : '아쉽게 실패') : ''}
      sub={result ? (result.ok ? `${p.name} 대표 능력치 6개 모두 +${result.gain}` : `단계는 ${enh > 0 ? fmt.roman(enh) : '0'} 그대로 · 카드도 그대로예요`) : undefined}
      footer={result && !needStyle ? (
        <>
          <Button variant="secondary" onClick={onClose}>닫기</Button>
          {enh < 10 && <Button onClick={onAgain}>{result.ok ? `${fmt.roman(enh + 1)} 이어서` : '다시 도전'}</Button>}
        </>
      ) : undefined}
    >
      {result && (
        <div className={s.res}>
          <div className={[s.stamp, result.ok ? s.stampOk : s.stampNo].join(' ')} aria-hidden>
            <span className="num-display">{result.ok ? fmt.roman(result.stage) : fmt.roman(Math.max(enh, 0)) || '0'}</span>
          </div>
          <dl className={s.resList}>
            <div><dt>확률</dt><dd className="num">{result.chance}%</dd></div>
            <div><dt>쓴 재료</dt><dd>{result.mat}</dd></div>
            {result.gp > 0 && <div><dt>비용</dt><dd><span className="num">{fmt.int(result.gp)}</span> GP</dd></div>}
            {!result.ok && result.nextChance != null && <div className={s.nextC}><dt>다음 확률</dt><dd className="num">{result.nextChance >= 100 ? '확정' : `${result.nextChance}%`}</dd></div>}
          </dl>
          {needStyle && (
            <div className={s.pickStyle}>
              <p className={s.pickHead}>V 달성 — 플레이스타일을 골라 주세요 <span>(나중에 무료로 바꿀 수 있어요)</span></p>
              <ul className={s.styles}>
                {styles.map((ps) => (
                  <li key={ps.id}>
                    <button type="button" className={s.style} onClick={() => onPlaystyle(ps.id)}>
                      <span className={s.sIcon} aria-hidden><LIcon name={ps.icon} size={20} /></span>
                      <span className={s.sBody}><b>{ps.ko}</b><span>{ps.text}</span></span>
                      <LIcon name="arrow" size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
