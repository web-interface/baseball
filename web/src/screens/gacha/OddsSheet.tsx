// 확률 공개 시트 — 등급별 장당 확률 · 30장 기대 장수 · 한 팩에 1장 이상 · 골라 뽑는 팩의 '없는 등급' · 천장
import type { Pack } from '../../game/types';
import { GRADES } from '../../game/grades';
import { Sheet, Button } from '../../ui';
import { atLeastOne, packTitle, pctStr, type OddsView, type Pick } from './draw';
import { OddsBar, PityTally, Swatch } from './bits';
import s from './OddsSheet.module.css';

const pctText = (v: number) => pctStr(v) + '%';

export function OddsSheet({ open, onClose, pack, pick, view, pity }: {
  open: boolean; onClose: () => void; pack: Pack; pick: Pick | null; view: OddsView; pity: number;
}) {
  const changed = view.missing.length > 0;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`확률 공개 · ${packTitle(pack, pick)}`}
      sub={<>30장 하나하나가 이 확률로 정해져요 · <span className="num">2027.06.14</span> 기준</>}
      height="tall"
      footer={<Button variant="secondary" onClick={onClose}>닫기</Button>}
    >
      <OddsBar rows={view.rows} height={10} className={s.bar} />

      <table className={s.table}>
        <thead>
          <tr>
            <th scope="col">등급</th>
            <th scope="col">장당</th>
            <th scope="col">30장 중</th>
            <th scope="col">1장 이상</th>
          </tr>
        </thead>
        <tbody>
          {view.rows.map((r) => (
            <tr key={r.grade}>
              <th scope="row"><Swatch grade={r.grade} /> {GRADES[r.grade].ko}</th>
              <td className="num">
                {changed && Math.abs(r.base - r.pct) > r.base * 0.001 && <s className={s.was}>{pctText(r.base)}</s>}
                {pctText(r.pct)}
              </td>
              <td className="num">{pctStr(r.pct * 0.3)}<small>장</small></td>
              <td className="num">{pctStr(atLeastOne(r.pct) * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      {changed && (
        <section className={s.missing}>
          <h3>이 조합에 없는 등급</h3>
          <ul>
            {view.missing.map((m) => (
              <li key={m.grade}>
                <span><Swatch grade={m.grade} /> {GRADES[m.grade].ko} <s className="num">{pctText(m.base)}</s></span>
                <em>{m.why}</em>
              </li>
            ))}
          </ul>
          <p>빠진 몫은 남은 등급에 원래 비율대로 나눴어요. 위 표는 다시 계산한 값이에요.</p>
        </section>
      )}

      <section className={s.pity}>
        <h3>천장</h3>
        <p>
          이 팩을 <b className="num">{pack.pity.max}</b>번 열면 <b>{pack.pity.guaranteed}</b>.
          지금 <b className="num">{pity}</b>/<span className="num">{pack.pity.max}</span> — 천장은 팩 종류마다 따로 세요.
        </p>
        <PityTally count={pity} max={pack.pity.max} className={s.tally} />
      </section>

      <p className={s.foot}>
        결과는 서버 난수로 정하고 이 표와 같은 값을 써요. 같은 카드가 또 나오면 강화 재료가 돼요.
        확률을 바꿀 땐 7일 전에 알려 드려요.
      </p>
    </Sheet>
  );
}
