// 자동 정리 시트 — 정리할 등급 · 남길 구단 · 종류마다 1장 남기기 · 끝까지(결과도 다시 재료로) 고르기 → 미리 보기 → 바로 정리 → 결과.
// 계산은 ./autoClean (같은 조합 공식 · 같은 비용, 연출 없이). 카드가 상한(3만 장)을 넘으면 카드구매가 막히고 여기로 온다(?auto=1).
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
import { Spin, type SpinRun } from './Spin';
import { reelOf } from '../../game/combine';
import { cardInst, playerOfKCard } from '../../game/kbo';
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
  // TH 이상이 나왔으면 정리가 끝난 뒤 룰렛으로 한 장씩 (시트는 잠깐 내렸다가 결과와 함께 다시)
  const [spinIdx, setSpinIdx] = useState<number | null>(null);
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
    if (wallet.gp < 30_000) { toast({ text: 'GP가 모자라요', tone: 'bad' }); return; }
    const r = runClean(opts);
    setDone(r);
    if (r.spins.length) setSpinIdx(0);
  };
  const close = () => { setDone(null); setSpinIdx(null); onClose(); };
  const spinRun = (i: number): SpinRun | null => {
    const x = done?.spins[i];
    if (!x) return null;
    const reel = reelOf(x.view, x.roll.card, 24).flatMap((kc, k, arr) => {
      if (k === arr.length - 1) return [{ card: x.result.card, player: x.result.player }];
      const player = playerOfKCard(kc);
      return player ? [{ card: cardInst(kc), player }] : [];
    });
    return { key: `clean-${i}-${x.result.card.id}`, result: x.result, roll: x.roll, view: x.view, reel };
  };
  const run = spinIdx != null ? spinRun(spinIdx) : null;
  const nSpins = done?.spins.length ?? 0;

  return (
    <>
    {run && spinIdx != null && (
      <Spin
        key={run.key}
        run={run}
        onAgain={spinIdx + 1 < nSpins ? () => setSpinIdx(spinIdx + 1) : undefined}
        againLabel={`다음 카드 (${spinIdx + 2}/${nSpins})`}
        onClose={() => setSpinIdx(null)}
      />
    )}
    <Sheet open={open && spinIdx == null} onClose={close} height="tall" title="자동 정리"
      sub={done ? '정리를 마쳤어요' : undefined}
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
            보유 <b className="num">{fmt.int(total)}</b> / <span className="num">{fmt.int(CARD_CAP)}</span>장{over ? ' · 상한 초과' : ''}
          </p>

          <h3 className={s.h}>정리할 등급</h3>
          <div className={s.chips}>
            {avail.grades.map(([g, n]) => (
              <button key={g} type="button" aria-pressed={grades.includes(g)} className={[s.chip, grades.includes(g) && s.on].filter(Boolean).join(' ')} onClick={() => setGrades(toggle(grades, g))}>
                <Swatch grade={g} />{gradeShort(g)}<span className="num">{fmt.int(n)}</span>
              </button>
            ))}
          </div>

          <h3 className={s.h}>남길 구단</h3>
          <div className={[s.chips, s.scroll].join(' ')}>
            {avail.clubs.map(([code, n]) => (
              <button key={code} type="button" aria-pressed={keepClubs.includes(code)} className={[s.chip, keepClubs.includes(code) && s.keep].filter(Boolean).join(' ')} onClick={() => setKeepClubs(toggle(keepClubs, code))}>
                <Emblem team={teamByCode(code as ClubCode)} size={15} decorative />{shortLabel(code)}<span className="num">{fmt.int(n)}</span>
              </button>
            ))}
          </div>

          <label className={s.toggle}>
            <input type="checkbox" checked={keepOne} onChange={(e) => setKeepOne(e.target.checked)} />
            <span><b>종류마다 1장 남기기</b></span>
          </label>
          <label className={s.toggle}>
            <input type="checkbox" checked={cascade} onChange={(e) => setCascade(e.target.checked)} />
            <span title="조합 결과도 다시 재료로 써요"><b>끝까지 정리</b></span>
          </label>

          {pv && (
            <div className={s.preview}>
              <p>재료 <b className="num">{fmt.int(pv.cards)}</b>장 → 조합 <b className="num">{fmt.int(pv.combos)}</b>번 · <CoinGP size={12} /> <span className="num">{fmt.int(pv.gp)}</span></p>
            </div>
          )}
        </div>
      )}
    </Sheet>
    </>
  );
}

function Done({ r }: { r: CleanResult }) {
  return (
    <div className={s.body}>
      <div className={s.big}>
        <p><span className="num">{fmt.int(r.before)}</span>장 → <b className="num">{fmt.int(r.after)}</b>장</p>
        <small>조합 <span className="num">{fmt.int(r.combos)}</span>번 · 재료 <span className="num">{fmt.int(r.used)}</span>장 · <CoinGP size={11} /> <span className="num">{fmt.int(r.gp)}</span></small>
      </div>
      {r.stopped !== 'done' && <p className={s.warn}>{r.stopped === 'gp' ? 'GP가 모자라 중간에 멈췄어요' : `한 번에 ${fmt.int(CLEAN_CAP)}번까지예요`}</p>}
      <ul className={s.made} aria-label="나온 카드 등급">
        {r.made.map((x) => <li key={x.grade}><Swatch grade={x.grade} />{gradeShort(x.grade)}<b className="num">{fmt.int(x.n)}</b></li>)}
      </ul>
      {r.best.length > 0 && (
        <>
          <h3 className={s.h}>빛나는 카드 <small>엘리트 이상</small></h3>
          <ul className={s.best}>
            {r.best.map((pc, i) => <li key={`${pc.card.id}-${i}`}><CardMini {...cardProps(pc.card)} fluid still /></li>)}
          </ul>
        </>
      )}
    </div>
  );
}
