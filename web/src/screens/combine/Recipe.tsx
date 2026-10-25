// 조합 공식 판 — 공식마다 한 줄(맞으면 ✓) + 결과 확률(막대 · 같은 등급 / 한 단계 위 / 두 단계 위) + 결과가 묶이는 곳 + 풀을 넓힌 안내
import { GRADES } from '../../game/grades';
import { shortLabel } from '../../game/world';
import { BASE_SPLIT, FORMULAS, STEP_KO, type CombineView, type FormulaState, type OutRow, type Relax } from '../../game/combine';
import type { GradeId } from '../../game/types';
import { Swatch, gradeFill, gradeShort } from '../gacha/bits';
import s from './Combine.module.css';

/** 1000분율 → '52.5' · '50' · '0.5' */
export const pctText = (units: number) => (units % 10 === 0 ? String(units / 10) : (units / 10).toFixed(1));

const clubText = (code: string) => shortLabel(code);
const sideText = (v: unknown) => (v === 'P' ? '투수' : '타자');
const PAIR_KO: Record<string, string> = { '2B+SS': '2루수+유격수', 'P+C': '투수+포수' };

/** 조건만 — ' — 그 구단 카드로' 같은 덧붙임은 화면에서 뺀다 */
const ruleShort = (rule: string) => rule.split(' — ')[0];

/** 맞았을 때 무엇으로 맞았나 · 안 맞았을 때 조건 (+ 가장 많이 겹친 장수) */
function detailOf(f: FormulaState, view: CombineView): string {
  const def = FORMULAS.find((x) => x.id === f.id)!;
  if (!f.met) {
    const near = f.have != null && f.have >= 2 && view.n >= 2 && f.id !== 'pair' && f.id !== 'hidden' ? ` · ${f.have}/${view.n}장` : '';
    return ruleShort(def.rule) + near;
  }
  switch (f.id) {
    case 'grade': return `모두 ${GRADES[f.value as GradeId].ko}`;
    case 'club': return `모두 ${clubText(String(f.value))}`;
    case 'year': return `모두 ${f.value}년`;
    case 'dynasty': { const [c, y] = String(f.value).split(' '); return `${y} ${clubText(c)}`; }
    case 'side': return `모두 ${sideText(f.value)}`;
    case 'pair': return String(f.value).split(' · ').map((x) => PAIR_KO[x] ?? x).join(' · ');
    case 'hidden': return f.avail ? `${view.fix.club ? clubText(view.fix.club) : ''} 프랜차이즈 칸이 열렸어요` : '이 구단엔 프랜차이즈 카드가 없어요';
    default: return ruleShort(def.rule);
  }
}

/** 풀을 넓힌 까닭 — '연도를 풀고 같은 계보 구단에서 나와요' */
export function relaxText(rel: readonly Relax[]): string {
  const parts: string[] = [];
  if (rel.includes('year')) parts.push('연도');
  if (rel.includes('club')) parts.push('구단');
  if (rel.includes('side')) parts.push('투수·타자');
  const lin = rel.includes('lineage');
  const last = parts[parts.length - 1];
  const obj = parts.length ? `${parts.join(', ')}${last === '구단' ? '을' : '를'}` : '';
  if (obj && lin) return `${obj} 풀고 같은 계보 구단에서 나와요`;
  if (obj) return `${obj} 풀어요`;
  return lin ? '같은 계보 구단에서 나와요' : '';
}

export function Recipe({ view }: { view: CombineView }) {
  const met = view.formulas.filter((f) => f.met && !(f.id === 'hidden' && !f.avail)).length;
  return (
    <section className={s.recipe} aria-labelledby="combine-recipe">
      <div className={s.secHead}>
        <h2 id="combine-recipe" className={['head', s.h2].join(' ')}>조합 공식</h2>
        {view.n >= 2 && <span className={s.secSub}>{met ? <>맞은 공식 <b className="num">{met}</b>개</> : '맞은 공식 없음'}</span>}
      </div>
      <ul className={s.formulas}>
        {FORMULAS.map((def) => {
          const f = view.formulas.find((x) => x.id === def.id)!;
          const dead = def.id === 'hidden' && f.met && !f.avail;
          return (
            <li key={def.id} className={[s.fl, f.met && !dead && s.flOn, def.id === 'hidden' && s.flHidden].filter(Boolean).join(' ')}>
              <span className={s.mark} aria-label={f.met ? '맞음' : '아님'}>{f.met && !dead ? '✓' : '–'}</span>
              <b className={s.flName}>{def.name}</b>
              <span className={s.flRule}>{detailOf(f, view)}</span>
              <span className={s.flEff}>{def.effect}</span>
            </li>
          );
        })}
      </ul>
      <Odds view={view} />
    </section>
  );
}

function Odds({ view }: { view: CombineView }) {
  if (!view.n) {
    return (
      <div className={s.odds}>
        <div className={s.oddsHead}><b>결과 확률</b><span>공식 보너스 전</span></div>
        <table className={s.baseTable}>
          <thead><tr><th scope="col">장수</th><th scope="col">같은 등급</th><th scope="col">한 단계 위</th><th scope="col">두 단계 위</th></tr></thead>
          <tbody>
            {([3, 4, 5] as const).map((n) => (
              <tr key={n}><th scope="row"><span className="num">{n}</span>장</th>{BASE_SPLIT[n].map((u, i) => <td key={i} className="num">{pctText(u)}%</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  const base = view.base!;
  const fix = view.fix;
  const fixed = [fix.club && clubText(fix.club), fix.year != null && `${fix.year}년`, fix.side && sideText(fix.side)].filter(Boolean) as string[];
  const relaxed = view.rows.filter((r) => r.relaxed.length > 0);
  return (
    <div className={s.odds}>
      <div className={s.oddsHead}>
        <b>결과 확률</b>
        <span>기본 <b style={{ color: gradeFill(base) }}>{GRADES[base].ko}</b> · {view.n}장 평균</span>
      </div>
      <div className={s.bar} role="img" aria-label={view.rows.map((r) => `${GRADES[r.grade].ko} ${pctText(r.units)}%`).join(', ')}>
        {view.rows.map((r) => <i key={String(r.step)} style={{ flexGrow: r.units, background: gradeFill(r.grade) }} />)}
      </div>
      <ul className={s.oddsRows}>
        {view.rows.map((r) => <OddsRow key={String(r.step)} r={r} />)}
      </ul>
      <p className={s.fixLine}>
        <span>결과 카드</span>
        <b>{fixed.length ? fixed.join(' · ') : '제한 없음'}</b>
      </p>
      {relaxed.map((r) => (
        <p key={'rx' + String(r.step)} className={s.note}><b>{gradeShort(r.grade)}</b> 맞는 카드가 없어 {relaxText(r.relaxed)}</p>
      ))}
      {view.n < 3 && <p className={s.note}>3장 기준 확률</p>}
      {view.capped > 0 && <p className={[s.note, s.warn].join(' ')} title="수상 · 프랜차이즈 · 블랙 · 시그니처는 레전드로 쳐요">결과는 레전드까지예요</p>}
    </div>
  );
}

function OddsRow({ r }: { r: OutRow }) {
  return (
    <li className={r.step === 'hidden' ? s.oddsHidden : undefined}>
      <span className={s.step}>{STEP_KO[String(r.step)]}</span>
      <Swatch grade={r.grade} size={9} />
      <b>{gradeShort(r.grade)}</b>
      {r.merged.length > 0 && <small>{r.merged.includes(2) && r.merged.includes(1) ? '위 칸 합침' : '두 단계 위 합침'}</small>}
      <em className="num">{pctText(r.units)}<span>%</span></em>
    </li>
  );
}
