// 로비 채팅 #/chat — 전체 화면. ?demo=1 이면 예시 대화(서버 연결 없음)
//  · 화면 아래 입력칸은 휴대폰 자판이 올라와도 가려지지 않게 visualViewport 에 맞춘 고정 칸(포털)에 둔다.
//  · 새 메시지가 오면 맨 아래로 따라가고, 위를 보고 있으면 '새 메시지 n개' 단추.
//  · 대화는 하루 뒤 흐려지며 사라진다(보관 시간은 서버가 알려 준다). 메시지를 누르면 신고 · 이 감독 숨기기 (내 메시지는 지우기).
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ScreenProps } from '../../app/screen';
import { useScreenTitle } from '../../app/title';
import { Icon } from '../../ui';
import { demoChat } from './demo';
import { useHidden } from './hidden';
import {
  Composer, HiddenSheet, MsgSheet, SysText, TtlNote, Who, dayLabel, fadeStyle, hhmm, statusText, teamOf,
  useChatConnection, useChatState, useTick,
} from './parts';
import { liveChat, visibleMsgs } from './store';
import type { ChatMsg, ChatSource, ChatState } from './types';
import s from './chat.module.css';

const GROUP_MS = 3 * 60_000;

type Item = { kind: 'day'; key: string; label: string } | { kind: 'msg'; key: string; m: ChatMsg; head: boolean };

function buildItems(msgs: ChatMsg[]): Item[] {
  const out: Item[] = [];
  let prev: ChatMsg | null = null;
  for (const m of msgs) {
    const newDay = !prev || new Date(prev.ts).toDateString() !== new Date(m.ts).toDateString();
    if (newDay && prev) out.push({ kind: 'day', key: 'd' + m.id, label: dayLabel(m.ts) });
    const head = !prev || newDay || prev.uid !== m.uid || m.kind === 'sys' || prev.kind === 'sys' || m.ts - prev.ts > GROUP_MS;
    out.push({ kind: 'msg', key: 'm' + m.id, m, head });
    prev = m;
  }
  return out;
}

/** 헤더 아래부터 '지금 보이는 화면' 바닥까지 — 자판이 올라오면 줄어든다 */
function useViewportBox() {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const vv = window.visualViewport;
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const main = document.querySelector('main');
        const head = main ? Math.max(0, main.getBoundingClientRect().top) : 0;
        const plain = !vv || vv.scale > 1.01; // 손가락으로 확대 중이면 그냥 창 크기
        const vTop = plain ? 0 : vv.offsetTop;
        const vH = plain ? window.innerHeight : vv.height;
        const top = Math.max(head, vTop);
        const height = Math.max(180, Math.round(vTop + vH - top));
        setBox((b) => (b && Math.abs(b.top - top) < 1 && Math.abs(b.height - height) < 1 ? b : { top, height }));
      });
    };
    measure();
    vv?.addEventListener('resize', measure);
    vv?.addEventListener('scroll', measure);
    window.addEventListener('resize', measure);
    const header = document.querySelector('header');
    const ro = header && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (header) ro?.observe(header);
    void document.fonts?.ready.then(measure);
    return () => {
      cancelAnimationFrame(raf);
      vv?.removeEventListener('resize', measure);
      vv?.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      ro?.disconnect();
    };
  }, []);
  return box;
}

export default function ChatScreen({ query }: ScreenProps) {
  const src: ChatSource = query.get('demo') === '1' ? demoChat : liveChat;
  useChatConnection(src);
  const st = useChatState(src);
  const hidden = useHidden();
  const msgs = useMemo(() => visibleMsgs(st.msgs, hidden.set), [st.msgs, hidden.set]);
  const items = useMemo(() => buildItems(msgs), [msgs]);
  useTick(st.status === 'retry');
  useScreenTitle('로비 채팅', statusText(st));
  const box = useViewportBox();

  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const seen = useRef(-1); // 본 마지막 메시지 번호 (-1 = 아직 처음)
  const [unread, setUnread] = useState(0);
  const [target, setTarget] = useState<ChatMsg | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  const toBottom = useCallback(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
    atBottom.current = true;
    setUnread(0);
  }, []);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const lastId = msgs.at(-1)?.id ?? 0;
    if (seen.current < 0) {
      if (st.loaded) { el.scrollTop = el.scrollHeight; seen.current = lastId; }
      return;
    }
    const fresh = msgs.filter((m) => m.id > seen.current);
    seen.current = Math.max(seen.current, lastId);
    if (!fresh.length) return;
    if (atBottom.current || fresh.some((m) => !!st.me && m.uid === st.me.uid)) toBottom();
    else setUnread((n) => n + fresh.length);
  }, [msgs, st.loaded, st.me, toBottom]);

  // 내가 보내는 중인 줄이 생기면 맨 아래로
  useLayoutEffect(() => { if (st.pending.length) toBottom(); }, [st.pending.length, toBottom]);
  // 자판이 올라와 칸이 줄어도, 맨 아래를 보고 있었으면 그대로 맨 아래
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [box?.height]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 72;
    atBottom.current = near;
    if (near && unread) setUnread(0);
  };

  const meUid = st.me?.uid ?? -1;
  const lastMine = msgs.at(-1)?.uid === meUid;

  const layer = (
    <div className={s.layer} style={box ? { top: box.top, height: box.height } : undefined}>
      <div className={s.bar}>
        <TtlNote st={st} />
        {hidden.list.length > 0 && (
          <button type="button" className={s.hiddenBtn} onClick={() => setShowHidden(true)}>
            숨긴 감독 <b className="num">{hidden.list.length}</b>
          </button>
        )}
      </div>

      <div className={s.listWrap}>
        <div ref={scroller} className={s.scroller} onScroll={onScroll}>
          {!st.loaded && <p className={s.empty}>{statusText(st)}…</p>}
          {st.loaded && msgs.length === 0 && st.pending.length === 0 && (
            <p className={s.empty}>아직 대화가 없어요</p>
          )}
          <ol className={s.list} aria-live="polite" aria-relevant="additions" aria-label="로비 채팅 메시지">
            {items.map((it) => (it.kind === 'day'
              ? <li key={it.key} className={s.day}><span>{it.label}</span></li>
              : <Line key={it.key} m={it.m} head={it.head} mine={it.m.uid === meUid} st={st} onOpen={setTarget} />))}
            {st.pending.map((p, i) => (
              <li key={p.cid} className={[s.line, (i === 0 && !lastMine) && s.head, s.mine, s.pending].filter(Boolean).join(' ')}>
                <time className={['num', s.time].join(' ')}>{i === 0 && !lastMine ? hhmm(p.ts) : ''}</time>
                <span className={s.body}>
                  {i === 0 && !lastMine && st.me && <Who name={st.me.name} club={st.me.club} mine />}
                  <span className={s.text}>{p.text}</span>
                  <small className={s.sending}>보내는 중</small>
                </span>
              </li>
            ))}
          </ol>
        </div>
        {unread > 0 && (
          <button type="button" className={s.jump} onClick={toBottom}>
            <Icon name="arrow-down" size={16} />
            새 메시지 <b className="num">{unread}</b>개
          </button>
        )}
      </div>

      <div className={s.dock}>
        {!src.demo && st.status !== 'open' && st.status !== 'idle' && (
          <p className={s.conn} role="status">
            <span>{statusText(st)}</span>
            {(st.status === 'retry' || st.status === 'paused') && (
              <button type="button" className={s.connBtn} onClick={src.reconnect}>지금 연결</button>
            )}
          </p>
        )}
        <Composer src={src} onSent={toBottom} />
      </div>
    </div>
  );

  return (
    <>
      <div className={s.holder} aria-hidden />
      {createPortal(layer, document.body)}
      <MsgSheet src={src} msg={target} me={st.me} onClose={() => setTarget(null)} />
      <HiddenSheet open={showHidden} onClose={() => setShowHidden(false)} />
    </>
  );
}

function Line({ m, head, mine, st, onOpen }: { m: ChatMsg; head: boolean; mine: boolean; st: ChatState; onOpen: (m: ChatMsg) => void }) {
  const fading = st.fading.includes(m.id);
  if (m.kind === 'sys') {
    const team = teamOf(m.club);
    return (
      <li
        className={[s.sys, fading && s.fading].filter(Boolean).join(' ')}
        style={{ ...fadeStyle(m, st), ...(team ? { ['--sys-c' as string]: team.colors.primary } : {}) }}
      >
        <time className={['num', s.time].join(' ')}>{hhmm(m.ts)}</time>
        <span className={s.sysBody}>
          <Icon name="crown" size={16} className={s.sysIcon} />
          <span className={s.sysText}><SysText m={m} /></span>
        </span>
      </li>
    );
  }
  return (
    <li className={[s.line, head && s.head, mine && s.mine, fading && s.fading].filter(Boolean).join(' ')} style={fadeStyle(m, st)}>
      <time className={['num', s.time].join(' ')} dateTime={new Date(m.ts).toISOString()}>{head ? hhmm(m.ts) : ''}</time>
      <button type="button" className={s.body} onClick={() => onOpen(m)} aria-label={`${m.name}, ${hhmm(m.ts)}: ${m.text} — 메뉴`}>
        {head && <Who name={m.name} club={m.club} mine={mine} />}
        <span className={s.text}>{m.text}</span>
      </button>
    </li>
  );
}
