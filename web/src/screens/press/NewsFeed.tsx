// 리그 뉴스 — 스포츠 기사 목록처럼: [분류] 제목 / 매체 · 시각 · 댓글 수.
// 누르면 기자 · 입력 시각 · 기사 리드, 아래에 독자 댓글(댓글 수 · 순공감순 — 가린 아이디 · 시각 · 답글 · 공감/비공감, 위 3개는 BEST).
// 날마다 기사는 템플릿(무료). 개막 특집 · 시즌 결산 · 특이사항(직접 치른 날의 큰일)만 AI 가 쓴다 — game/press.
// 이 화면이 보일 때만 특이사항을 살피고 AI 글을 하나씩 만든다(빨리 감기로 넘긴 날은 건너뜀). 연결 상태 같은 개발용 표시는 없다.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { aiReady, pendingJobs, pumpJobs, scanEvents, usePress, type PressTag } from '../../game/press';
import { useSeason } from '../../season/store';
import { fmt } from '../../ui';
import { buildFeed, type FeedPost } from './feed';
import s from './NewsFeed.module.css';

const TAG_CLASS: Record<PressTag, string> = { 속보: s.tFlash, 단독: s.tExcl, 충격: s.tShock, 화제: s.tHot, 분석: s.tAna, 이슈: s.tIssue };

export function NewsFeed({ limit = 6 }: { limit?: number }) {
  const st = useSeason();
  const press = usePress();
  const root = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [settling, setSettling] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  // 화면에 보일 때만 일한다
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const io = new IntersectionObserver((es) => setVisible(es.some((e) => e.isIntersecting)), { rootMargin: '240px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  // 처음 잠깐은 곧 만들 AI 글 자리를 '올라오는 중'으로 (템플릿이 보였다가 바뀌지 않게)
  useEffect(() => { const t = window.setTimeout(() => setSettling(false), 8000); return () => window.clearTimeout(t); }, []);
  // 특이사항 살피기 → AI 글 하나씩 — 시즌이 멈춘 뒤에(빨리 감기 중엔 날이 계속 바뀐다)
  useEffect(() => {
    if (!visible) return;
    const t = window.setTimeout(() => {
      try { scanEvents(); } catch (e) { console.warn('[리그 뉴스] 특이사항 살피기 실패', e); }
      void pumpJobs();
    }, 1200);
    return () => window.clearTimeout(t);
  }, [st, visible]);

  const ready = aiReady();
  const pending = useMemo(() => new Set(ready ? pendingJobs(st, press.saved).map((j) => j.key) : []), [st, press.saved, ready]);
  const sections = useMemo(() => {
    const busy = (k: string) => press.gen === k || (settling && visible && pending.has(k));
    try { return buildFeed(st, press.saved, limit, busy); } catch (e) { console.warn('[리그 뉴스] 기사 짜기 실패', e); return []; }
  }, [st, press, limit, settling, visible, pending]);

  if (!sections.length) return <div ref={root} className={s.empty}>시즌이 시작되면 기사가 올라와요.</div>;
  return (
    <div ref={root} className={s.feed}>
      {sections.map((sec) => (
        <section key={sec.key} className={s.sec} aria-label={sec.label}>
          <h3 className={s.secH}>{sec.label}</h3>
          <ul className={s.list}>
            {sec.loading && <Loading />}
            {sec.posts.map((p) => <Row key={p.id} p={p} open={open === p.id} onToggle={() => setOpen((o) => (o === p.id ? null : p.id))} />)}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Loading() {
  return (
    <li className={s.loading} aria-live="polite">
      <span className={s.loadText}>새 기사 올라오는 중</span>
      <span className={s.skel} aria-hidden><i /><i /></span>
    </li>
  );
}

function Row({ p, open, onToggle }: { p: FeedPost; open: boolean; onToggle: () => void }) {
  const id = useId();
  return (
    <li className={[s.row, p.lead && s.lead, open && s.on].filter(Boolean).join(' ')}>
      <button type="button" className={s.head} aria-expanded={open} aria-controls={id} onClick={onToggle}>
        <span className={s.l1}>
          <span className={[s.tag, TAG_CLASS[p.tag] ?? s.tAna].join(' ')}>[{p.tag}]</span>
          <span className={s.title}>{p.title}</span>
        </span>
        <span className={s.l2}>
          <span className={s.outlet}>{p.outlet}</span>
          <span className={['num', s.dot].join(' ')}>{p.when}</span>
          <span className={s.dot}>댓글 <span className="num">{fmt.int(p.total)}</span></span>
        </span>
      </button>
      {open && (
        <div id={id} className={s.more}>
          <p className={s.byline}>
            <span className={s.rep}>{p.reporter} 기자</span>
            {p.stamp && <span className={s.stamp}>입력 <span className="num">{p.stamp}</span></span>}
          </p>
          <p className={s.body}>{p.body}</p>
          {p.cmts.length > 0 && <div className={s.cm}>
            <p className={s.cmH}>
              <b>댓글 <span className="num">{fmt.int(p.total)}</span></b>
              <span className={s.sort}>순공감순</span>
            </p>
            <ul className={s.cmts} aria-label="공감 많은 댓글">
              {p.cmts.map((c, i) => (
                <li key={i}>
                  <p className={s.cMeta}>
                    {c.best && <b className={s.best}>BEST</b>}
                    <span className={s.cId}>{c.id}</span>
                    {c.when && <span className={s.cWhen}>{c.when}</span>}
                  </p>
                  <p className={s.cText}>{c.text}</p>
                  <p className={s.cAct}>
                    <span className={s.reply}>답글 <span className="num">{fmt.int(c.replies)}</span></span>
                    <span className={s.votes}>
                      <span>공감 <b className="num">{fmt.int(c.up)}</b></span>
                      <span>비공감 <b className="num">{fmt.int(c.down)}</b></span>
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          </div>}
        </div>
      )}
    </li>
  );
}
