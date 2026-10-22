// 화면 강조 문구 — 호수비·클러치 히트·극적인 상황 때 경기 화면 위에 크게 띄운다.
// 효과: 구단색 띠(밀려 들어옴) + 빛(번쩍) + 살짝 흔들림 + 위아래 검은 띠(느린 재생 느낌) + 원인 표시 한두 줄.
// 고르는 기준(승리 확률 변화·잡을 확률)과 횟수 제한(한 경기 몇 번)은 엔진/경기 화면이 정한다 — 이 부품은 보여 주기만.
// prefers-reduced-motion 이면 흔들림·밀림 없이 나타났다 사라진다.

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Icon, type IconName } from './icons';
import s from './Callout.module.css';

export type CalloutKind = 'defense' | 'clutch' | 'go-ahead' | 'comeback' | 'walkoff' | 'escape' | 'record';
/** quick = 빨리 보기(짧게) · normal = 주요 장면·이닝별 · slow = 자세히 보기(느린 재생) */
export type CalloutPace = 'quick' | 'normal' | 'slow';

export interface CalloutTeam {
  primary: string;
  secondary?: string;
  /** primary 위 글자색 */
  ink?: string;
}

export interface CalloutData {
  /** 같은 장면을 다시 띄울 땐 바꿔 준다 */
  id?: string | number;
  kind: CalloutKind;
  /** '호수비!' '역전 결승타!' '끝내기!' '위기 탈출!' */
  title: string;
  /** '연이준 · 우중간 다이빙 캐치' */
  sub?: string;
  /** '잡을 확률 18%' · '승리 확률 31% → 58%' */
  meta?: string;
  /** 원인 표시 — 최대 2개 ('바람 +6m') */
  causes?: string[];
  /** 띠 색 — 장면의 주인공 구단 */
  team?: CalloutTeam;
}

const PACE: Record<CalloutPace, { total: number; wipe: number; out: number }> = {
  quick: { total: 1300, wipe: 220, out: 220 },
  normal: { total: 2400, wipe: 320, out: 300 },
  slow: { total: 3300, wipe: 420, out: 380 },
};

/** 종류별 세기 — 흔들림 px, 빛, 위아래 띠, 아이콘 */
const KIND: Record<CalloutKind, { shake: number; flash: boolean; letterbox: boolean; icon?: IconName; extra: number }> = {
  defense: { shake: 3, flash: false, letterbox: false, icon: 'glove', extra: 0 },
  clutch: { shake: 4, flash: true, letterbox: false, extra: 0 },
  'go-ahead': { shake: 5, flash: true, letterbox: false, extra: 100 },
  comeback: { shake: 5, flash: true, letterbox: true, extra: 200 },
  walkoff: { shake: 7, flash: true, letterbox: true, extra: 600 },
  escape: { shake: 3, flash: false, letterbox: false, icon: 'shield', extra: 0 },
  record: { shake: 0, flash: false, letterbox: true, icon: 'star', extra: 300 },
};

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export interface CalloutStageProps {
  callout: CalloutData | null;
  pace?: CalloutPace;
  /** 다 보여 준 뒤 — 부모가 callout 을 null 로 */
  onDone?: () => void;
  /** 흔들림 끄기 */
  noShake?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/**
 * 강조 문구 무대 — 경기 화면(필드·중계)을 감싼다.
 * <CalloutStage callout={c} pace="quick" onDone={() => setC(null)}> …필드… </CalloutStage>
 */
export function CalloutStage({ callout, pace = 'normal', onDone, noShake, className, style, children }: CalloutStageProps) {
  const inner = useRef<HTMLDivElement>(null);
  const [outKey, setOutKey] = useState<string | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const key = callout ? `${callout.id ?? ''}:${callout.kind}:${callout.title}` : '';
  const phase = outKey === key ? 'out' : 'in';

  useEffect(() => {
    if (!callout) return;
    const p = PACE[pace];
    const k = KIND[callout.kind];
    const total = p.total + (pace === 'quick' ? k.extra / 3 : k.extra);

    if (!noShake && k.shake > 0 && !reduced() && inner.current?.animate) {
      const a = k.shake;
      inner.current.animate(
        [
          { transform: 'translate(0,0)' },
          { transform: `translate(${-a}px, ${a * 0.5}px)` },
          { transform: `translate(${a * 0.8}px, ${-a * 0.4}px)` },
          { transform: `translate(${-a * 0.5}px, ${a * 0.3}px)` },
          { transform: `translate(${a * 0.25}px, 0)` },
          { transform: 'translate(0,0)' },
        ],
        { duration: pace === 'quick' ? 260 : 380, easing: 'cubic-bezier(.3,.7,.3,1)', delay: 60 },
      );
    }
    const tOut = window.setTimeout(() => setOutKey(key), total - p.out);
    const tDone = window.setTimeout(() => doneRef.current?.(), total);
    return () => { window.clearTimeout(tOut); window.clearTimeout(tDone); };
  }, [key, pace, noShake]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={[s.stage, className].filter(Boolean).join(' ')} style={style}>
      <div ref={inner} className={s.inner}>{children}</div>
      {callout && <CalloutLayer key={key} data={callout} pace={pace} phase={phase} />}
    </div>
  );
}

function CalloutLayer({ data, pace, phase }: { data: CalloutData; pace: CalloutPace; phase: 'in' | 'out' }) {
  const p = PACE[pace];
  const k = KIND[data.kind];
  const team = data.team ?? { primary: 'var(--accent)', secondary: 'var(--fg)', ink: 'var(--accent-ink)' };
  const vars = {
    '--co-team': team.primary,
    '--co-team2': team.secondary ?? 'rgba(255,255,255,.9)',
    '--co-ink': team.ink ?? '#fff',
    '--co-wipe': `${p.wipe}ms`,
    '--co-out': `${p.out}ms`,
  } as CSSProperties;
  const causes = (data.causes ?? []).slice(0, 2);
  const big = data.kind === 'walkoff' || data.kind === 'comeback';
  return (
    <div
      className={[s.layer, s['k-' + data.kind], s['p-' + pace], phase === 'out' && s.out, big && s.big].filter(Boolean).join(' ')}
      style={vars}
      aria-hidden
    >
      <div className={s.scrim} />
      {k.flash && <div className={s.flash} />}
      {(k.letterbox || pace === 'slow') && (
        <>
          <div className={[s.lb, s.lbTop].join(' ')} />
          <div className={[s.lb, s.lbBot].join(' ')} />
          {pace === 'slow' && <span className={s.slow}><Icon name="play" size={11} /> 느린 화면</span>}
        </>
      )}
      <div className={s.block}>
        {data.kind === 'record' ? (
          <div className={s.record}>
            <p className={s.recordTitle}>{data.title}</p>
            {data.sub && <p className={s.recordSub}>{data.sub}</p>}
          </div>
        ) : (
          <div className={s.band}>
            {big && <div className={s.band2} />}
            <div className={s.bandIn}>
              <p className={s.title}>
                {k.icon && <Icon name={k.icon} size={big ? 30 : 26} stroke={2.2} className={s.ico} />}
                <span>{data.title}</span>
              </p>
              {data.sub && <p className={s.sub}>{data.sub}</p>}
            </div>
          </div>
        )}
        {(data.meta || causes.length > 0) && (
          <div className={s.under}>
            {data.meta && <p className={s.meta}>{data.meta}</p>}
            {causes.map((c) => <p key={c} className={s.cause}>↳ {c}</p>)}
          </div>
        )}
      </div>
    </div>
  );
}

/** 화면 읽기 프로그램용 — 강조 문구를 소리로 */
export function CalloutAnnouncer({ callout }: { callout: CalloutData | null }) {
  return (
    <p className="sr-only" aria-live="assertive">
      {callout ? [callout.title, callout.sub, callout.meta].filter(Boolean).join(', ') : ''}
    </p>
  );
}

/**
 * 강조 문구 줄 세우기 — 빨리 보기에서 연달아 나와도 하나씩.
 * const q = useCalloutQueue(); q.push({...}); <CalloutStage callout={q.current} onDone={q.next} …/>
 */
export function useCalloutQueue() {
  const [queue, setQueue] = useState<CalloutData[]>([]);
  const seq = useRef(0);
  const push = useCallback((c: CalloutData) => {
    seq.current += 1;
    setQueue((q) => [...q, { ...c, id: c.id ?? `q${seq.current}` }]);
  }, []);
  const next = useCallback(() => setQueue((q) => q.slice(1)), []);
  const clear = useCallback(() => setQueue([]), []);
  return { current: queue[0] ?? null, pending: Math.max(0, queue.length - 1), push, next, clear };
}
