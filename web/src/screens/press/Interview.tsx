// 감독 인터뷰 — 시즌에 두 번: 개막 미디어데이(내 첫 경기 전) · 시즌 결산(가을야구 출사표, 탈락이면 결산 인터뷰).
// 기자 질문 3개(선수 컨디션 · 피로 · 부상 · 기록 흐름을 짚음)에 답을 하나씩 고르면 기사 제목이 나온다.
// 고른 답(감싸기 · 채찍 · 여유)에 따라 코드가 정한 작은 능력치 효과가 그 몇 경기에만 붙는다 (game/press — interviewFx).
// 시즌 중에는 조용히 한 줄만(효과가 남아 있으면 효과를).
import { useEffect, useMemo, useState } from 'react';
import {
  ANS_KO, REP_STYLE_KO, activeFx, answerInterview, beginInterview, fxOfAnswer, fxOfRec, fxText, ivDone, ivFacts, ivMomentOf, usePress,
  type ActiveFx, type IvMoment, type IvOpt, type IvQ, type IvRec,
} from '../../game/press';
import { playerById } from '../../game/mock';
import { useSeason } from '../../season/store';
import { Button, Sheet } from '../../ui';
import { ivTeaser, localInterview } from './local';
import s from './Interview.module.css';

/** 경기 전 준비 칸 — 인터뷰 카드 (props 없음) */
export function InterviewCard() {
  const st = useSeason();
  const press = usePress();
  const m = useMemo(() => ivMomentOf(st), [st]);
  const rec = m ? press.saved.iv[m.key] : undefined;
  const fx = activeFx(st, press.saved);
  const [sheet, setSheet] = useState(false);
  const teaser = useMemo(() => {
    if (!m || rec) return '';
    try { return ivTeaser(ivFacts(m, st)); } catch { return ''; }
  }, [m, rec, st]);

  if (!m) {
    if (fx) return <div className={[s.card, s.slim].join(' ')}><FxLine fx={fx} /></div>;
    return <p className={s.note}>감독 인터뷰 · 시즌이 끝나면 결산 인터뷰가 열려요</p>;
  }
  const done = ivDone(rec);
  const locked = m.moment === 'open' && !rec && !!st.pending?.started;
  const answered = rec ? rec.picks.filter((x) => x != null).length : 0;
  return (
    <div className={s.card}>
      <p className={s.kicker}><b>{m.title}</b><span>{m.sub}</span></p>
      {done && rec ? <Headline rec={rec} /> : <p className={s.teaser}>{rec ? `질문 ${answered + 1}/${rec.qs.length}부터 이어서 할 수 있어요.` : teaser || '기자들이 기다리고 있어요.'}</p>}
      {!done && (
        <p className={s.meta}>
          {m.games ? `기자 질문 3개 · 고른 답에 따라 ${m.moment === 'open' ? '개막 3연전' : '가을야구 첫 3경기'} 능력치가 조금 달라져요` : '기자 질문 3개 · 결산 인터뷰라 능력치 효과는 없어요'}
        </p>
      )}
      {fx && <FxLine fx={fx} />}
      <div className={s.actions}>
        {done
          ? <Button size="s" variant="ghost" onClick={() => setSheet(true)}>기사 다시 보기</Button>
          : <Button size="m" variant={rec ? 'primary' : 'secondary'} disabled={locked} onClick={() => setSheet(true)}>{rec ? '이어서 하기' : '인터뷰 하기'}</Button>}
        {locked && <small className={s.lock}>경기가 이미 시작돼서 인터뷰를 할 수 없어요</small>}
      </div>
      <InterviewSheet m={m} open={sheet} onClose={() => setSheet(false)} />
    </div>
  );
}

/** 남은 인터뷰 효과 한 줄 — '인터뷰 효과 · 개막 3연전 2경기 남음 — 독고현 제구 +2 · 구위 +2 / 타선 선구 +1' */
function FxLine({ fx }: { fx: ActiveFx }) {
  const items = fxText(fx.items);
  return (
    <p className={s.fx}>
      <b>인터뷰 효과</b> · {fx.label} <span className="num">{fx.left}</span>경기 남음
      {items.length ? <span className={s.fxItems}>{items.join(' / ')}</span> : <span className={s.fxItems}>효과 없음</span>}
    </p>
  );
}

const chosen = (rec: IvRec) => rec.qs.map((q, i) => { const oi = rec.picks[i]; return oi != null && q.opts[oi] ? { q, o: q.opts[oi] } : null; }).filter((x): x is { q: IvQ; o: IvOpt } => !!x);
/** 대표 기사 제목 — 채찍 답이 있으면 그것(제일 자극적), 없으면 첫 답 */
function Headline({ rec }: { rec: IvRec }) {
  const list = chosen(rec);
  const main = list.find((x) => x.o.type === 'push') ?? list[0];
  if (!main) return null;
  return <p className={s.headline}><span>{main.o.head}</span><small>{main.q.outlet}</small></p>;
}

function preview(rec: IvRec, q: IvQ, o: IvOpt): string {
  if (!rec.games) return '효과 없음';
  const t = fxText(fxOfAnswer(o.type, q.target ? playerById(q.target) : undefined));
  return t.join(' · ');
}

export function InterviewSheet({ m, open, onClose }: { m: IvMoment; open: boolean; onClose: () => void }) {
  const press = usePress();
  const rec = press.saved.iv[m.key];
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reveal, setReveal] = useState<number | null>(null);

  useEffect(() => {
    if (!open || rec || loading) return;
    let alive = true;
    setLoading(true);
    setFailed(false);
    beginInterview(m, localInterview)
      .catch((e) => { console.warn('[인터뷰] 질문 만들기 실패', e); if (alive) setFailed(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, rec]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!open) setReveal(null); }, [open]);

  const cur = rec ? rec.picks.findIndex((p) => p == null) : -1;
  const qi = reveal ?? (cur >= 0 ? cur : null);
  const last = rec ? reveal === rec.qs.length - 1 || (reveal != null && rec.picks.every((p) => p != null)) : false;
  const footer = rec && reveal != null
    ? <Button size="l" block onClick={() => setReveal(null)}>{last ? '내일 아침 기사 보기' : '다음 질문'}</Button>
    : rec && ivDone(rec) ? <Button size="l" block variant="secondary" onClick={onClose}>닫기</Button> : undefined;

  return (
    <Sheet open={open} onClose={onClose} title={m.title} sub={m.sub} footer={footer}>
      {!rec ? (
        failed ? <p className={s.wait}>질문을 불러오지 못했어요. 잠시 뒤 다시 해 주세요.</p> : <Waiting />
      ) : qi == null ? (
        <Result rec={rec} />
      ) : (
        <Step key={qi} rec={rec} qi={qi} onPick={(oi) => { answerInterview(rec.key, qi, oi); setReveal(qi); }} />
      )}
    </Sheet>
  );
}

function Waiting() {
  return (
    <div className={s.waitBox} aria-live="polite">
      <p className={s.wait}>기자들이 질문을 고르고 있어요</p>
      <span className={s.skel} aria-hidden><i /><i /><i /></span>
    </div>
  );
}

function Step({ rec, qi, onPick }: { rec: IvRec; qi: number; onPick: (oi: number) => void }) {
  const q = rec.qs[qi];
  const picked = rec.picks[qi];
  const target = q.target ? playerById(q.target) : undefined;
  const opt = picked != null ? q.opts[picked] : undefined;
  return (
    <div className={s.step}>
      <p className={s.count}>질문 <b className="num">{qi + 1}</b><span className="num"> / {rec.qs.length}</span></p>
      <p className={s.by}>{q.outlet} · {q.by} 기자{q.style && <span className={[s.style, q.style === 'snark' ? s.stSnark : s.stKind].join(' ')}>{REP_STYLE_KO[q.style]}</span>}{target ? <span className={s.to}> → {target.name}</span> : null}</p>
      <p className={s.qText}>{q.q}</p>
      {!opt ? (
        <ul className={s.opts}>
          {q.opts.map((o, oi) => (
            <li key={oi}>
              <button type="button" className={s.opt} onClick={() => onPick(oi)}>
                <span className={s.optText}>{o.text}</span>
                <span className={s.optMeta}><b>{ANS_KO[o.type]}</b> · {preview(rec, q, o)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className={s.reveal}>
          <blockquote className={s.quote}>
            <span className={s.who}>감독</span>
            <span className={s.said}>{opt.text}</span>
          </blockquote>
          <p className={s.ticker}><b>속보</b><span>{opt.head}</span></p>
          <p className={s.eff}>{ANS_KO[opt.type]} · {preview(rec, q, opt)}</p>
        </div>
      )}
    </div>
  );
}

function Result({ rec }: { rec: IvRec }) {
  const list = chosen(rec);
  const fx = fxText(fxOfRec(rec));
  return (
    <div className={s.result}>
      <p className={s.resH}>내일 아침 기사</p>
      <ol className={s.articles}>
        {list.map(({ q, o }, i) => (
          <li key={i}>
            <span className={s.outlet}>{q.outlet}</span>
            <b className={s.art}>{o.head}</b>
            <span className={s.artSub}>“{o.text}”</span>
          </li>
        ))}
      </ol>
      <p className={s.resH}>인터뷰 효과</p>
      {rec.games ? (
        <>
          {fx.length ? <ul className={s.fxList}>{fx.map((t) => <li key={t}>{t}</li>)}</ul> : <p className={s.fxNone}>서로 상쇄돼서 남은 효과가 없어요.</p>}
          <p className={s.fxNote}>{rec.moment === 'open' ? '내 정규 시즌 첫 3경기에만 붙어요.' : '내 가을야구 첫 3경기에만 붙어요.'}</p>
        </>
      ) : <p className={s.fxNone}>결산 인터뷰라 능력치 효과는 없어요.</p>}
    </div>
  );
}
