import type { ReactNode } from 'react';
import { IconButton } from './Button';
import { CoinGP, GoldenBall } from './icons';
import { int, kr } from './format';
import s from './TopBar.module.css';

export interface Wallet { gp: number; ball: number }

export interface TopBarProps {
  /** 화면 제목 (하위 화면) */
  title?: ReactNode;
  /** 제목 아래 작은 줄 */
  sub?: ReactNode;
  /** 뒤로 버튼 — 누르면 onBack */
  onBack?: () => void;
  /** 제목 대신 왼쪽에 놓을 것 (구단 엠블럼 묶음 등) */
  lead?: ReactNode;
  /** 제목 옆 작은 꼬리표 (미리보기 등) */
  tag?: ReactNode;
  /** 재화 — null 이면 숨김 */
  wallet?: Wallet | null;
  /** 오른쪽 끝 (설정 등) */
  right?: ReactNode;
  className?: string;
}

/** 상단 헤더 — 뒤로 · 제목 · 재화(GP / 골든볼) */
export function TopBar({ title, sub, onBack, lead, tag, wallet, right, className }: TopBarProps) {
  return (
    <div className={[s.bar, className].filter(Boolean).join(' ')}>
      {onBack && <IconButton icon="back" label="뒤로" onClick={onBack} className={s.back} />}
      <div className={s.lead}>
        {lead ?? (
          <div className={s.titles}>
            <h1 className={s.title}>
              <span>{title}</span>
              {tag && <span className={s.tag}>{tag}</span>}
            </h1>
            {sub && <p className={s.sub}>{sub}</p>}
          </div>
        )}
      </div>
      {wallet && <WalletView {...wallet} />}
      {right && <div className={s.right}>{right}</div>}
    </div>
  );
}

/** 재화 — 좁은 헤더라 '1조 · 1억'처럼 줄이고, 전체 숫자는 길게 누르거나 마우스를 올리면(title) */
export function WalletView({ gp, ball, full }: Wallet & { full?: boolean }) {
  const show = full ? int : kr;
  return (
    <div className={s.wallet} aria-label={`GP ${int(gp)}, 골든볼 ${int(ball)}`}>
      <span className={s.money} title={`GP ${int(gp)}`}><CoinGP size={14} /><b className="num">{show(gp)}</b></span>
      <span className={s.money} title={`골든볼 ${int(ball)}`}><GoldenBall size={14} /><b className="num">{show(ball)}</b></span>
    </div>
  );
}
