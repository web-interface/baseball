// 자동 정리 시트 — 정리할 등급 · 남길 구단 · 종류마다 1장 남기기 · 끝까지(결과도 다시 재료로) 고르기 → 미리 보기 → 바로 정리 → 결과.
// 계산은 ./autoClean (같은 조합 공식 · 같은 비용, 연출 없이). 카드가 1만 장을 넘으면 카드구매가 막히고 여기로 온다(?auto=1).
import { useMemo, useState } from 'react';
import { CardMini, cardProps } from '../../cards';
import { CARD_CAP, totalCards, useInventory } from '../../game/inventory';
import { useWallet } from '../../game/wallet';
import { shortLabel } from '../../game/world';
import { teamByCode } from '../../game/mock';
import type { ClubCode, GradeId } from '../../game/types';
import { Button, CoinGP, Emblem, Sheet, fmt, useToast } from '../../ui';
import { Swatch, gradeShort } from '../gacha/bits';
import { readMaterials, gradeOrder } from './materials';
import { CLEAN_CAP, previewClean, runClean, type CleanOpts, type CleanResult } from './autoClean';
import s from './CleanSheet.module.css';

const DEF_GRADES: GradeId[] = ['normal', 'special'];

export function CleanSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ver = useInventory();
  const wallet = useWallet();
  const toast = useToast();
  const [grades, setGrades] = useState<GradeId[]>(DEF_GRADES);
  const [keepClubs, setKeepClubs] = useState<string[]>([]);
  const [keepOne, setKeepOne] = useState(false);
  const [cascade, setCascade] = useState(true);
  const [done, setDone] = useState<CleanResult | null>(null);
  const opts: CleanOpts = { grades, keepClubs, keepOne, cascade };

  // 고를 수 있는 등급 · 구단 — 재료로 쓸 수 있는 카드에서 (장수와 함께)
  const avail = useMemo(() => {
    if (!open) return { grades: [] as [GradeId, number][], clubs: [] as [string, number][] };
    const g = new Map<GradeId, number>(), c = new Map<string, number>();
    for (const m of readMaterials()) {
      g.set(m.info.grade, (g.get(m.info.grade) ?? 0) + m.spare);
      if (m.info.club) c.set(m.info.club, (c.get(m.info.club) ?? 0) + m.spare);
    }
    return {
      grades: [...g].sort((a, b) => gradeOrder(a[0]) - gradeOrder(b[0])),
      clubs: [...c].sort((a, b) => b[1] - a[1]),
    };
  }, [open, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const pv = useMemo(() => (open ? previewClean(opts) : null), [open, ver, grades, keepClubs, keepOne, cascade]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = open ? totalCards() : 0;
  const over = total > CARD_CAP;

  const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);
  const start = () => {
    if (!pv || !pv.combos) return;
    if (wallet.gp < 30_000) { toast({ text: 'GP가 모자라요 — 5장 조합 한 번에 3만 GP', tone: 'bad' }); return; }
    const r = runClean(opts);
    setDone(r);
  };
  const close = () => { setDone(null); onClose(); };

  return (
    <Sheet open={open} onClose={close} height="tall" title="자동 정리"
      sub={done ? '정리를 마쳤어요' : `남길 등급 · 구단을 빼고, 나머지를 5장씩 빠르게 조합해요`}
      footer={done ? (
        <>
          <Button variant="secondary" onClick={() => setDone(null)}>한 번 더 정리</Button>
          <Button onClick={close}>닫기</Button>
        </>
      ) : (
        <Button block onClick={start} disabled={!pv?.combos || grades.length === 0}
          trailing={pv?.combos ? <span className={s.fee}><CoinGP size={13} /><span className="num">{fmt.int(pv.gp)}</span>{cascade && '~'}</span> : undefined}>
          {pv?.combos ? <>자동 정리 시작 · 조합 <span className="num">{fmt.int(pv.combos)}</span>번{cascade ? '부터' : ''}</> : '정리할 카드가 없어요'}
        </Button>
      )}>
      {done ? <Done r={done} /> : (
        <div className={s.body}>
          <p className={[s.count, over && s.over].filter(Boolean).join(' ')}>
            보유 카드 <b className="num">{fmt.int(total)}</b>장{over ? <> · 상한 <span className="num">{fmt.int(CARD_CAP)}</span>장을 넘어서 카드구매가 막혔어요</> : <> · 상한 <span className="num">{fmt.int(CARD_CAP)}</span>장</>}
          </p>

          <h3 className={s.h}>정리할 등급 <small>고른 등급의 남는 카드를 재료로</small></h3>
          <div className={s.chips}>
            {avail.grades.map(([g, n]) => (
              <button key={g} type="button" aria-pressed={grades.includes(g)} className={[s.chip, grades.includes(g) && s.on].filter(Boolean).join(' ')} onClick={() => setGrades(toggle(grades, g))}>
                <Swatch grade={g} />{gradeShort(g)}<span className="num">{fmt.int(n)}</span>
              </button>
            ))}
          </div>

          <h3 className={s.h}>남길 구단 <small>고른 구단 카드는 재료로 쓰지 않아요</small></h3>
          <div className={[s.chips, s.scroll].join(' ')}>
            {avail.clubs.map(([code, n]) => (
              <button key={code} type="button" aria-pressed={keepClubs.includes(code)} className={[s.chip, keepClubs.includes(code) && s.keep].filter(Boolean).join(' ')} onClick={() => setKeepClubs(toggle(keepClubs, code))}>
                <Emblem team={teamByCode(code as ClubCode)} size={15} decorative />{shortLabel(code)}<span className="num">{fmt.int(n)}</span>
              </button>
            ))}
          </div>

          <label className={s.toggle}>
            <input type="checkbox" checked={keepOne} onChange={(e) => setKeepOne(e.target.checked)} />
            <span><b>종류마다 1장 남기기</b><small>도감 · 세트용으로 카드마다 1장은 두고, 겹친 장만 써요</small></span>
          </label>
          <label className={s.toggle}>
            <input type="checkbox" checked={cascade} onChange={(e) => setCascade(e.target.checked)} />
            <span><b>끝까지 정리</b><small>조합 결과가 정리할 등급이면 다시 재료로 — 그 등급이 3장 미만이 될 때까지</small></span>
          </label>

          {pv && (
            <div className={s.preview}>
              <p>재료 <b className="num">{fmt.int(pv.cards)}</b>장 → 첫 바퀴 조합 <b className="num">{fmt.int(pv.combos)}</b>번 · <CoinGP size={12} /> <span className="num">{fmt.int(pv.gp)}</span>{cascade ? ' + 결과로 몇 번 더' : ''}</p>
              <p className={s.sub}>라인업 · 강화 · 훈련 카드의 마지막 1장, 특별 선수, 잠근 카드는 쓰지 않아요. 같은 구단 · 연도끼리 먼저 묶어 조합 공식(구단 · 연도 · 왕조)을 맞춰요. 한 번에 최대 <span className="num">{fmt.int(CLEAN_CAP)}</span>번.</p>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

function Done({ r }: { r: CleanResult }) {
  return (
    <div className={s.body}>
      <div className={s.big}>
        <p><span className="num">{fmt.int(r.before)}</span>장 → <b className="num">{fmt.int(r.after)}</b>장</p>
        <small>조합 <span className="num">{fmt.int(r.combos)}</span>번 · 재료 <span className="num">{fmt.int(r.used)}</span>장 · <CoinGP size={11} /> <span className="num">{fmt.int(r.gp)}</span></small>
      </div>
      {r.stopped !== 'done' && <p className={s.warn}>{r.stopped === 'gp' ? 'GP가 모자라 중간에 멈췄어요' : `한 번에 ${fmt.int(CLEAN_CAP)}번까지라 멈췄어요 — 한 번 더 정리하면 이어서 해요`}</p>}
      <ul className={s.made} aria-label="나온 카드 등급">
        {r.made.map((x) => <li key={x.grade}><Swatch grade={x.grade} />{gradeShort(x.grade)}<b className="num">{fmt.int(x.n)}</b></li>)}
      </ul>
      {r.best.length > 0 && (
        <>
          <h3 className={s.h}>빛나는 카드 <small>엘리트 이상 · 귀한 순</small></h3>
          <ul className={s.best}>
            {r.best.map((pc, i) => <li key={`${pc.card.id}-${i}`}><CardMini {...cardProps(pc.card)} fluid still /></li>)}
          </ul>
        </>
      )}
    </div>
  );
}
