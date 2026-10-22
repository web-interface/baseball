// 화면 '자리' — 담당 개발자가 채우기 전까지 보이는 안내판. 다 만들면 이 부품을 지운다.
import type { ReactNode } from 'react';
import s from './ScreenStub.module.css';

export interface ScreenStubProps {
  /** 화면 번호 (미리보기 순서) */
  no: number;
  title: string;
  lead: string;
  owner: string;
  /** 이 화면에 들어갈 것 */
  items: string[];
  /** 쓸 수 있는 목업 이름 */
  mock: string[];
  children?: ReactNode;
}

export function ScreenStub({ no, title, lead, owner, items, mock, children }: ScreenStubProps) {
  return (
    <section className={s.stub}>
      <p className={s.eyebrow}>
        <span className="num">{String(no).padStart(2, '0')}</span>
        <span>준비 중 · {owner}</span>
      </p>
      <h2 className={s.title}>{title}</h2>
      <p className={s.lead}>{lead}</p>
      {children && <div className={s.demo}>{children}</div>}
      <h3 className={s.h}>들어갈 것</h3>
      <ol className={s.list}>
        {items.map((it, i) => (
          <li key={i}><span className="num">{String(i + 1).padStart(2, '0')}</span><p>{it}</p></li>
        ))}
      </ol>
      <h3 className={s.h}>쓸 수 있는 목업</h3>
      <p className={s.mock}>{mock.map((m) => <code key={m}>{m}</code>)}</p>
    </section>
  );
}
