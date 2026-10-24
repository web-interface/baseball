// 오늘 할 일 — 바로가기 6칸 (숫자가 먼저 보이게) + 시즌 자동 진행 시트 (요구 35)
import { pctText } from '../../game/dex';
import { useState, type ReactNode } from 'react';
import { Button, Icon, Sheet, Tabs, useToast, type IconName } from '../../ui';
import { Link } from '../../app/router';
import { int } from '../../ui/format';
import { ME } from '../../game/mock';
import { seasonToday, useSeason } from '../../season/store';
import { shortDate } from '../../season/schedule';
import { clubLine, shortcuts } from './local-mock';
import s from './Todo.module.css';

interface Tile { key: string; to?: string; icon: IconName; label: string; value: ReactNode; note: ReactNode; hot?: boolean }

export function Todo() {
  const n = shortcuts();
  const season = useSeason();
  const line = clubLine(ME.teamId, season);
  const [open, setOpen] = useState(false);
  const tiles: Tile[] = [
    { key: 'lineup', to: '/lineup', icon: 'lineup', label: '라인업', value: <b className="num">{n.lineup.overall}</b>, note: <>{n.lineup.set ? <>{n.lineup.set} 세트까지 <b className="num">{n.lineup.remain}</b>명</> : '세트덱 모으기'}</>, hot: n.lineup.remain > 0 && n.lineup.remain <= 2 },
    { key: 'gacha', to: '/gacha', icon: 'pack', label: '카드구매', value: <b className="num">{n.gacha.pity}<i>/{n.gacha.max}</i></b>, note: '천장까지 — 프리미엄팩', hot: n.gacha.max - n.gacha.pity <= 3 },
    { key: 'shop', to: '/shop', icon: 'shop', label: '스카우터', value: <b className="num">{n.shop.left}<i>명</i></b>, note: <>오늘 더 데려올 수 있어요</> },
    { key: 'pvp', to: '/pvp', icon: 'versus', label: '대전', value: <b className="num">{n.pvp.left}<i>번</i></b>, note: <>레이팅 <span className="num">{int(n.pvp.rating)}</span></> },
    { key: 'cards', to: '/dex', icon: 'card', label: '도감', value: <b className="num">{int(n.cards.have)}<i>종</i></b>, note: <>모은 카드 <span className="num">{pctText(n.cards)}</span>%</> },
    { key: 'season', to: '/season', icon: 'fast', label: '시즌 빨리 감기', value: <b className="num">{line.left}<i>경기</i></b>, note: '남은 시즌 한 번에' },
  ];
  return (
    <section className={s.todo} aria-labelledby="todo-h">
      <h2 id="todo-h" className={s.h}>오늘 할 일</h2>
      <ul className={s.grid}>
        {tiles.map((t) => {
          const inner = (
            <>
              <span className={s.top}><Icon name={t.icon} size={16} /><span>{t.label}</span></span>
              <span className={s.value}>{t.value}</span>
              <span className={s.note}>{t.note}</span>
              <Icon name="chevron" size={14} className={s.chev} />
            </>
          );
          return (
            <li key={t.key} className={t.hot ? s.hot : undefined}>
              {t.to
                ? <Link to={t.to} className={s.tile}>{inner}</Link>
                : <button type="button" className={s.tile} onClick={() => setOpen(true)}>{inner}</button>}
            </li>
          );
        })}
      </ul>
      <SeasonSheet open={open} onClose={() => setOpen(false)} left={line.left} />
    </section>
  );
}

type Speed = '1' | '2' | '4' | 'end';

/** 시즌 자동 진행 — 속도·멈춤 설정 (엔진 연결 전이라 시작은 안내만) */
function SeasonSheet({ open, onClose, left }: { open: boolean; onClose: () => void; left: number }) {
  const toast = useToast();
  const [speed, setSpeed] = useState<Speed>('2');
  const [stop, setStop] = useState(true);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="시즌 자동 진행"
      sub={<>남은 <b className="num">{left}</b>경기를 한 번에 — 하이라이트 경기에서는 잠깐 멈춰 명장면을 보여 줘요.</>}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>닫기</Button>
          <Button icon="fast" onClick={() => { onClose(); toast({ text: '시즌 자동 진행은 경기 엔진이 붙으면 열려요', tone: 'info' }); }}>시작</Button>
        </>
      }
    >
      <div className={s.sheet}>
        <p className={s.sheetLabel}>속도</p>
        <Tabs
          variant="box"
          fill
          aria-label="진행 속도"
          value={speed}
          onChange={setSpeed}
          items={[{ value: '1', label: '1배' }, { value: '2', label: '2배' }, { value: '4', label: '4배' }, { value: 'end', label: '끝까지' }]}
        />
        <ol className={s.path}>
          <li><b>정규 시즌</b><span className="num">{shortDate(seasonToday())} → 9월</span></li>
          <li><b>가을야구</b><span>상위 6팀</span></li>
          <li><b>한별 시리즈</b><span>7전 4선승</span></li>
          <li><b>시상식</b><span>MVP · 골든글러브 · 타이틀</span></li>
        </ol>
        <label className={s.toggle}>
          <input type="checkbox" checked={stop} onChange={(e) => setStop(e.target.checked)} />
          <span className={s.switch} aria-hidden />
          <span className={s.toggleText}>
            <b>감독 결정이 필요하면 멈추기</b>
            <small>주전 부상 · 슬럼프 면담 · 트레이드 제안</small>
          </span>
        </label>
      </div>
    </Sheet>
  );
}
