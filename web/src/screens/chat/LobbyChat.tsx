// 홈(로비)의 '로비 채팅' 칸 — 최근 몇 줄 + 입력칸. 줄을 누르면 #/chat 으로 크게.
// 홈에서는 <LobbyChat /> 한 줄로 쓴다. 주소에 ?chat=demo 를 붙이면 예시 대화(서버 연결 없음).
import { useMemo } from 'react';
import { Link, useLocation } from '../../app/router';
import { Icon } from '../../ui';
import { demoChat } from './demo';
import { useHidden } from './hidden';
import { Composer, StatusDot, SysText, TtlNote, Who, fadeStyle, hhmm, statusText, useChatConnection, useChatState, useTick } from './parts';
import { liveChat, visibleMsgs } from './store';
import type { ChatSource } from './types';
import s from './lobby.module.css';

const LINES = 4;

export function LobbyChat() {
  const loc = useLocation();
  const demo = loc.query.get('chat') === 'demo';
  const src: ChatSource = demo ? demoChat : liveChat;
  useChatConnection(src);
  const st = useChatState(src);
  const hidden = useHidden();
  const lines = useMemo(() => visibleMsgs(st.msgs, hidden.set).slice(-LINES), [st.msgs, hidden.set]);
  useTick(st.status === 'retry');
  const to = demo ? '/chat?demo=1' : '/chat';
  const meUid = st.me?.uid ?? -1;

  return (
    <section className={s.lobby} aria-labelledby="lobby-chat-h">
      <header className={s.head}>
        <h2 id="lobby-chat-h" className={s.h}>로비 채팅</h2>
        <span className={s.meta}>
          <StatusDot st={st} />
          {st.status === 'open' && st.online != null ? <>지금 <b className="num">{st.online}</b>명</> : statusText(st)}
        </span>
        <Link to={to} className={s.open}>크게 보기<Icon name="chevron" size={14} /></Link>
      </header>

      <Link to={to} className={s.peek} aria-label="로비 채팅 크게 보기">
        {lines.length > 0 ? (
          <ul className={s.lines}>
            {lines.map((m) => (
              <li key={m.id} className={[s.line, st.fading.includes(m.id) && s.fading].filter(Boolean).join(' ')} style={fadeStyle(m, st)}>
                {m.kind === 'sys'
                  ? <span className={s.sys}><Icon name="crown" size={15} className={s.sysIcon} /><span className={s.text}><SysText m={m} /></span></span>
                  : <><Who name={m.name} club={m.club} mine={m.uid === meUid} size={16} className={s.who} /><span className={s.text}>{m.text}</span></>}
                <time className={['num', s.time].join(' ')}>{hhmm(m.ts)}</time>
              </li>
            ))}
          </ul>
        ) : (
          <p className={s.empty}>{st.loaded ? '아직 대화가 없어요' : `${statusText(st)}…`}</p>
        )}
      </Link>

      <div className={s.foot}>
        <TtlNote st={st} />
        <Composer src={src} compact />
      </div>
    </section>
  );
}
