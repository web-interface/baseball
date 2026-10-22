// 로비 채팅 공용 조각 — 연결 훅 · 이름표 · 상태 · 입력칸 · 메시지 메뉴 · 숨긴 사람
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useAuth } from '../../app/auth';
import { navigate } from '../../app/router';
import { Button, Emblem, Icon, Sheet, useToast } from '../../ui';
import { TEAMS } from '../../game/mock';
import { hiddenUsers, useHidden } from './hidden';
import { FADE_MS, type ChatMe, type ChatMsg, type ChatSource, type ChatState } from './types';
import s from './parts.module.css';

/* ───────── 훅 ───────── */

export const useChatState = (src: ChatSource) => useSyncExternalStore(src.subscribe, src.get);

/** 화면이 보이는 동안 연결을 붙잡고, 로그인이 바뀌면 서버에 다시 알린다 */
export function useChatConnection(src: ChatSource) {
  const { user } = useAuth();
  useEffect(() => src.retain(), [src]);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    src.reauth();
  }, [src, user]);
}

/** 1초마다 다시 그리기 (다시 연결까지 남은 초) */
export function useTick(active: boolean, ms = 1000) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setN((n) => n + 1), ms);
    return () => window.clearInterval(t);
  }, [active, ms]);
}

/* ───────── 글자 ───────── */

const pad = (n: number) => String(n).padStart(2, '0');
export const hhmm = (ts: number) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
export function dayLabel(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const y = new Date(today); y.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const base = `${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일`;
  return same(d, today) ? `오늘 · ${base}` : same(d, y) ? `어제 · ${base}` : base;
}

/** 연결 상태 한 줄 (작게) */
export function statusText(st: ChatState): string {
  switch (st.status) {
    case 'open': return st.online != null ? `지금 ${st.online}명` : '연결됨';
    case 'connecting': return '연결하는 중';
    case 'retry': {
      const left = st.retryAt ? Math.max(1, Math.ceil((st.retryAt - Date.now()) / 1000)) : 0;
      return !left ? '다시 연결하는 중' : left > 90 ? `끊김 · ${Math.ceil(left / 60)}분 뒤 다시 연결` : `끊김 · ${left}초 뒤 다시 연결`;
    }
    case 'offline': return '인터넷 연결 없음';
    case 'paused': return '잠시 쉬는 중';
    default: return '연결 전';
  }
}

export function StatusDot({ st }: { st: ChatState }) {
  const tone = st.status === 'open' ? s.on : st.status === 'connecting' || st.status === 'retry' ? s.wait : s.offDot;
  return <i className={[s.dot, tone].join(' ')} aria-hidden />;
}

/* ───────── 이름표 (구단 엠블럼 + 아이디) ───────── */

export const teamOf = (club: string | null) => (club ? TEAMS.find((t) => t.id === club) : undefined);

export function Who({ name, club, mine, size = 18, className }: { name: string; club: string | null; mine?: boolean; size?: number; className?: string }) {
  const team = teamOf(club);
  return (
    <span className={[s.who, className].filter(Boolean).join(' ')} title={team ? `${name} · ${team.name}` : name}>
      {team
        ? <Emblem team={team} size={size} decorative className={s.em} />
        : <span className={s.noClub} style={{ width: size, height: size }} aria-hidden><Icon name="user" size={Math.round(size * 0.72)} /></span>}
      <b className={[s.name, mine && s.mineName].filter(Boolean).join(' ')}>{name}</b>
      {mine && <span className={s.meTag}>나</span>}
    </span>
  );
}

/** 곧 사라질 줄 — 남은 시간에 맞춰 흐려진다 */
export function fadeStyle(m: ChatMsg, st: ChatState) {
  if (!st.fading.includes(m.id)) return undefined;
  const into = Date.now() + st.skew - (m.ts + st.ttl - FADE_MS);
  return { animationDelay: `${-Math.max(0, Math.min(FADE_MS, into))}ms` };
}

/** 시스템 메시지 글 (형식이 있으면 굵게) */
export function SysText({ m }: { m: ChatMsg }) {
  const e = m.sys;
  if (e?.type === 'dynasty') return <><b>{e.user}</b> 감독이 <b>{e.set}</b> 왕조를 완성했어요</>;
  return <>{e?.type === 'notice' ? e.text : m.text}</>;
}

/* ───────── 입력칸 ───────── */

export function Composer({ src, compact, onSent, className }: { src: ChatSource; compact?: boolean; onSent?: () => void; className?: string }) {
  const st = useChatState(src);
  const auth = useAuth();
  const [text, setText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const deferred = useRef(false);
  const id = useId();
  const len = [...text].length;
  const over = len > st.maxLen;
  const ready = st.status === 'open' && !!st.me;

  // 서버가 막은 이유 → 4초 보이기 · 못 보낸 글 되살리기
  useEffect(() => { if (st.notice) setNote(st.notice.text); }, [st.notice]);
  useEffect(() => {
    if (st.restore && !ref.current?.value) setText(st.restore.text);
  }, [st.restore]);
  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(null), 4000);
    return () => window.clearTimeout(t);
  }, [note]);

  const submit = () => {
    const v = ref.current?.value ?? text;
    if (!v.trim()) return;
    const err = src.send(v);
    if (err) { setNote(err); return; }
    composing.current = false;
    setText('');
    setNote(null);
    onSent?.();
  };

  const loggedIn = auth.status === 'in' || !!src.demo;
  if (!loggedIn) {
    return (
      <div className={[s.gate, compact && s.compact, className].filter(Boolean).join(' ')}>
        <p>로그인하면 채팅에 참여할 수 있어요. 지금은 읽기만 돼요.</p>
        <Button size="m" variant="secondary" className={s.gateBtn} onClick={() => navigate('/login?next=' + encodeURIComponent(location.hash.slice(1) || '/home'))}>로그인</Button>
      </div>
    );
  }
  const expired = st.status === 'open' && st.meChecked && !st.me;
  const placeholder = expired ? '로그인을 다시 해 주세요' : ready ? (compact ? '로비에 한마디' : '메시지 보내기') : '연결되면 쓸 수 있어요';

  return (
    <div className={[s.composer, compact && s.compact, className].filter(Boolean).join(' ')}>
      <form
        className={s.row}
        onSubmit={(e) => {
          e.preventDefault();
          if (composing.current) { deferred.current = true; return; } // 한글 조합 중 Enter — 조합이 끝나면 보낸다
          submit();
        }}
      >
        <label htmlFor={id} className="sr-only">채팅 메시지</label>
        <span className={[s.field, over && s.over].filter(Boolean).join(' ')}>
          <input
            ref={ref}
            id={id}
            className={s.input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onCompositionStart={() => { composing.current = true; }}
            onCompositionEnd={() => {
              composing.current = false;
              if (deferred.current) { deferred.current = false; window.setTimeout(submit, 0); }
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              if (e.nativeEvent.isComposing || e.keyCode === 229) return; // 조합 중 Enter 는 글자 확정만
              e.preventDefault();
              submit();
            }}
            placeholder={placeholder}
            enterKeyHint="send"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            aria-describedby={note ? id + '-n' : undefined}
            aria-invalid={over || undefined}
          />
          {len > st.maxLen - 30 && <span className={['num', s.count].join(' ')} aria-live="polite">{len}/{st.maxLen}</span>}
        </span>
        <Button
          size="m"
          className={s.send}
          onPointerDown={(e) => e.preventDefault()} // 눌러도 입력칸 초점(자판)이 그대로
          onClick={submit}
          disabled={!ready || !len || over}
        >
          보내기
        </Button>
      </form>
      {(note || expired) && (
        <p id={id + '-n'} className={s.note} role="status">
          {expired ? <>로그인이 만료됐어요. <button type="button" className={s.link} onClick={() => navigate('/login')}>다시 로그인</button></> : note}
        </p>
      )}
    </div>
  );
}

/* ───────── 메시지 메뉴 (신고 · 숨기기 · 내 메시지 지우기) ───────── */

export function MsgSheet({ src, msg, me, onClose }: { src: ChatSource; msg: ChatMsg | null; me: ChatMe | null; onClose: () => void }) {
  const toast = useToast();
  const auth = useAuth();
  const [last, setLast] = useState<ChatMsg | null>(msg);
  const [busy, setBusy] = useState<'report' | 'del' | null>(null);
  useEffect(() => { if (msg) setLast(msg); }, [msg]);
  const m = msg ?? last;
  const mine = !!m && !!me && m.uid === me.uid;
  const team = m ? teamOf(m.club) : undefined;
  const canReport = !!me || auth.status === 'in';

  const report = async () => {
    if (!m) return;
    setBusy('report');
    const r = await src.request('report', m.id);
    setBusy(null);
    if (r.ok) { toast({ text: '신고했어요. 짧은 시간에 여러 명이 신고하면 그 감독은 1시간 동안 채팅을 못 해요', tone: 'good', duration: 3600 }); onClose(); }
    else toast({ text: r.text, tone: 'bad' });
  };
  const hide = () => {
    if (!m) return;
    hiddenUsers.hide(m.uid, m.name);
    const { uid, name } = m;
    toast({ text: `${name} 감독의 메시지를 이 기기에서 숨겼어요`, action: { label: '되돌리기', onClick: () => hiddenUsers.show(uid) }, duration: 4200 });
    onClose();
  };
  const del = async () => {
    if (!m) return;
    setBusy('del');
    const r = await src.request('del', m.id);
    setBusy(null);
    if (r.ok) { toast('지웠어요'); onClose(); } else toast({ text: r.text, tone: 'bad' });
  };

  return (
    <Sheet
      open={!!msg}
      onClose={onClose}
      title={m ? (mine ? '내 메시지' : `${m.name}`) : ''}
      sub={m ? <><span className="num">{hhmm(m.ts)}</span>{team ? ` · ${team.name}` : ''}</> : null}
      footer={m && (mine
        ? <Button block variant="secondary" icon="close" loading={busy === 'del'} onClick={del}>모두의 화면에서 지우기</Button>
        : (
          <>
            <Button variant="secondary" icon="alert" loading={busy === 'report'} disabled={!canReport} onClick={report}>신고</Button>
            <Button variant="ink" icon="eye" onClick={hide} className={s.grow}>이 감독 숨기기</Button>
          </>
        ))}
    >
      {m && (
        <>
          <blockquote className={s.quote}>{m.text}</blockquote>
          <p className={s.help}>
            {mine
              ? '지우면 모든 사람의 화면에서 바로 사라져요. 지우지 않아도 대화는 5분 뒤 사라져요.'
              : <>신고는 운영 기록에 누가·누구를·언제만 남아요(본문은 남기지 않아요). {canReport ? '' : '신고는 로그인하면 할 수 있어요. '}숨기기는 이 기기에서만 적용되고, 채팅 화면의 ‘숨긴 감독’에서 되돌릴 수 있어요.</>}
          </p>
        </>
      )}
    </Sheet>
  );
}

/* ───────── 숨긴 감독 목록 ───────── */

export function HiddenSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { list } = useHidden();
  return (
    <Sheet open={open} onClose={onClose} title="숨긴 감독" sub="이 기기에서만 숨겨요. 서버에는 남지 않아요.">
      {list.length === 0
        ? <p className={s.help}>숨긴 감독이 없어요.</p>
        : (
          <ul className={s.hiddenList}>
            {list.map((h) => (
              <li key={h.uid}>
                <span className={s.hiddenName}>{h.name}</span>
                <Button size="m" variant="secondary" onClick={() => hiddenUsers.show(h.uid)}>다시 보기</Button>
              </li>
            ))}
          </ul>
        )}
    </Sheet>
  );
}

/** 작은 안내 줄 — '대화는 5분 뒤 사라져요' */
export function TtlNote({ st, children, className }: { st: ChatState; children?: ReactNode; className?: string }) {
  const min = Math.round(st.ttl / 60_000);
  return (
    <p className={[s.ttl, className].filter(Boolean).join(' ')}>
      <Icon name="clock" size={14} />
      <span>대화는 <b className="num">{min}</b>분 뒤 사라져요{children}</span>
    </p>
  );
}
