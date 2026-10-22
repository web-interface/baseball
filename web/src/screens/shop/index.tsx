// AI 스카우트 상점 — 담당: 상점 화면 개발자 (요구 20)
// 오늘의 진열(사람마다 다름) · 하루에 데려올 수 있는 인원 · 스카우트 한마디(말풍선 없이 담백하게) · 가격(시세와 함께)
// 진열·가격·한도는 코드(가치 평가·수요)가 정하고, 스카우트 말은 Claude 가 말맛만.
import { readWallet, spend, useWallet } from '../../game/wallet';
import { useEffect, useState } from 'react';
import type { ScreenProps } from '../../app/screen';
import { navigate } from '../../app/router';
import { CardMini, Card } from '../../cards';
import { PlayerArt } from '../../art/PlayerArt';
import { GRADES } from '../../game/grades';
import { POS_KO, ROLE_KO } from '../../game/labels';
import { ME, SCOUT_SHOP, cardById, myTeam, playerOfCard, teamById } from '../../game/mock';
import type { CardInst, Player } from '../../game/types';
import { Button, CoinGP, GoldenBall, Icon, Sheet, fmt, useToast } from '../../ui';
import { avg as fAvg, era as fEra, yearTag } from '../../ui/format';
import { SCOUT, SCOUT_LINES, SHELF, buy, secondsToRefresh, useShop, type ShelfItem } from './local-mock';
import s from './Shop.module.css';

const hasJong = (w: string) => { const c = w.charCodeAt(w.length - 1); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0; };
const posOf = (p: Player) => (p.pos === 'P' ? (p.role ? ROLE_KO[p.role] : '투수') : POS_KO[p.pos]);

/** 시즌 기록 한 줄 — .312 · 14홈런 · OPS .921 / 2.41 · 8승 · 81K */
function statLine(p: Player) {
  if (p.season.bat) {
    const b = p.season.bat;
    return [`${fAvg(b.avg)}`, `${b.hr}홈런`, `OPS ${fAvg(b.ops)}`];
  }
  const t = p.season.pit;
  if (!t) return [];
  if (t.sv > 0) return [`${fEra(t.era)}`, `${t.sv}세이브`, `${t.so}K`];
  if (t.hld > 0) return [`${fEra(t.era)}`, `${t.hld}홀드`, `${t.so}K`];
  return [`${fEra(t.era)}`, `${t.w}승`, `${t.so}K`];
}

function Price({ price, big }: { price: ShelfItem['price']; big?: boolean }) {
  return (
    <span className={[s.price, big && s.priceBig].filter(Boolean).join(' ')}>
      {price.ball != null ? <GoldenBall size={big ? 16 : 14} /> : <CoinGP size={big ? 16 : 14} />}
      <b className="num">{fmt.int(price.ball ?? price.gp ?? 0)}</b>
    </span>
  );
}

function useCountdown() {
  const [sec, setSec] = useState(() => secondsToRefresh());
  useEffect(() => {
    const t = window.setInterval(() => setSec(secondsToRefresh()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), ss = sec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export default function ShopScreen(_: ScreenProps) {
  const shop = useShop();
  const toast = useToast();
  const left = useCountdown();
  const [confirm, setConfirm] = useState<ShelfItem | null>(null);
  const team = myTeam();
  const line = shop.left === 0 ? SCOUT_LINES.done : shop.left === 1 ? SCOUT_LINES.last : SCOUT_LINES.open;
  const wallet = useWallet();

  const doBuy = () => {
    if (!confirm) return;
    const c = cardById(confirm.cardId);
    const p = c ? playerOfCard(c) : null;
    const cost = { gp: confirm.price.gp, ball: confirm.price.ball };
    if (readWallet().gp >= (cost.gp ?? 0) && readWallet().ball >= (cost.ball ?? 0) && buy(confirm.id) && p) {
      spend(cost);
      toast({ text: `${p.name}${hasJong(p.name) ? '을' : '를'} 데려왔어요. 보관함에 넣었어요.`, tone: 'good', action: { label: '라인업', onClick: () => navigate('/lineup') } });
    } else {
      toast({ text: '오늘은 더 데려올 수 없어요.', tone: 'bad' });
    }
    setConfirm(null);
  };

  return (
    <div className={s.screen}>
      {/* ───── 스카우트 ───── */}
      <section className={s.scout} style={{ ['--team' as string]: team.colors.primary }}>
        <div className={s.scoutArt} aria-hidden>
          <PlayerArt player={SCOUT.person} team={team} set="away" variant="portrait" eager />
        </div>
        <div className={s.scoutText}>
          <p className={s.scoutRole}>{team.short} {SCOUT.role} · <span className="num">{SCOUT.years}</span>년째</p>
          <h2 className={['head', s.scoutName].join(' ')}>{SCOUT.name}</h2>
          <p className={s.scoutLine}>{line}</p>
        </div>
      </section>

      {/* ───── 오늘 한도 · 새 진열 ───── */}
      <section className={s.status} aria-label="오늘 영입 한도">
        <div className={s.lampBox}>
          <span className={s.lampK}>오늘 영입</span>
          <span className={s.lamps} role="img" aria-label={`${shop.limit}명 중 ${shop.used}명 데려옴`}>
            {Array.from({ length: shop.limit }, (_, i) => <i key={i} className={i < shop.used ? s.lampOn : undefined} />)}
          </span>
          <b className="num">{shop.used}</b><span className={s.of}>/<span className="num">{shop.limit}</span></span>
        </div>
        <p className={s.leftText}>{shop.left > 0 ? <><b className="num">{shop.limit}</b>명 중 <b className="num">{shop.left}</b>명 남음</> : '오늘은 다 데려왔어요'}</p>
        <p className={s.refresh}><Icon name="clock" size={14} />새 진열까지 <span className="num">{left}</span></p>
      </section>

      {/* ───── 오늘의 진열 ───── */}
      <div className={s.listHead}>
        <h3 className="head">오늘의 진열</h3>
        <span>감독님만 보는 진열 · <span className="num">{SCOUT_SHOP.items.length}</span>명</span>
      </div>
      <ol className={s.list}>
        {SHELF.map((it, n) => {
          const c = cardById(it.cardId);
          if (!c) return null;
          const p = playerOfCard(c);
          const t = teamById(p.teamId);
          const mine = shop.isMine(it.id);
          const blocked = !mine && shop.left === 0;
          const stats = statLine(p);
          return (
            <li key={it.id} className={[s.item, mine && s.mine, blocked && s.blocked].filter(Boolean).join(' ')}>
              <span className={['num', s.no].join(' ')}>{String(n + 1).padStart(2, '0')}</span>
              <button type="button" className={s.cardBtn} onClick={() => navigate(`/player/${p.id}`)} aria-label={`${p.name} 선수 정보`}>
                <CardMini player={p} grade={c.grade} enhance={c.enhance} style={{ width: '100%' }} />
              </button>
              <div className={s.body}>
                <div className={s.top}>
                  <h4 className={s.name}>{p.name}</h4>
                  <span className={s.grade} style={{ color: `var(--gr-${c.grade})` }}>{GRADES[c.grade].ko}{c.year && GRADES[c.grade].yearTagged ? ` ${yearTag(c.year)}` : ''}</span>
                </div>
                <p className={s.meta}>{posOf(p)} · {t.name}</p>
                {stats.length > 0 && (
                  <p className={s.stats}>
                    {stats.map((x, i) => <span key={i} className="num">{x}</span>)}
                  </p>
                )}
                <p className={s.note}>{it.scoutNote}</p>
                <div className={s.buyRow}>
                  <div className={s.priceCol}>
                    <Price price={it.price} />
                    {it.market ? (
                      <span className={s.tag}>시세 <s className="num">{fmt.int(it.market)}</s> <em className="num">{fmt.signed(Math.round((it.price.gp! / it.market - 1) * 100))}%</em></span>
                    ) : it.valueTag ? <span className={s.tag}>{it.valueTag}</span> : null}
                  </div>
                  {mine ? (
                    <span className={s.mineTag}>오늘 데려옴</span>
                  ) : (
                    <Button size="s" variant={blocked ? 'secondary' : 'primary'} disabled={blocked} onClick={() => setConfirm(it)}>
                      {blocked ? '내일 다시' : '데려오기'}
                    </Button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <p className={s.foot}>
        진열은 감독님마다 달라요. 매일 <span className="num">05:00</span>에 바뀌고, 하루 <span className="num">{shop.limit}</span>명까지 데려올 수 있어요.
        가격은 선수 가치와 수요로 정해요 — 스카우트 말은 참고만 하세요.
      </p>

      <Sheet
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm ? `${playerOfCard(cardById(confirm.cardId) as CardInst).name} 데려오기` : ''}
        sub={<>오늘 남은 영입 <b className="num">{shop.left}</b> → <b className="num">{Math.max(0, shop.left - 1)}</b></>}
        footer={confirm && (
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>그만두기</Button>
            <Button variant="primary" onClick={doBuy} trailing={<Price price={confirm.price} />}>데려오기</Button>
          </>
        )}
      >
        {confirm && <ConfirmBody item={confirm} wallet={wallet} />}
      </Sheet>
    </div>
  );
}

function ConfirmBody({ item, wallet }: { item: ShelfItem; wallet: { gp: number; ball: number } }) {
  const c = cardById(item.cardId)!;
  const p = playerOfCard(c);
  const ball = item.price.ball != null;
  const have = ball ? wallet.ball : wallet.gp;
  const cost = item.price.ball ?? item.price.gp ?? 0;
  return (
    <div className={s.confirm}>
      <Card {...{ player: p, grade: c.grade, year: c.year, level: c.level, enhance: c.enhance, signaturePitch: c.signaturePitch ?? null, award: c.award }} size="m" />
      <dl className={s.confirmDl}>
        <div><dt>가격</dt><dd><Price price={item.price} big /></dd></div>
        {item.market && <div><dt>시세</dt><dd className="num">{fmt.int(item.market)}</dd></div>}
        <div><dt>보유</dt><dd className="num">{fmt.int(have)}</dd></div>
        <div><dt>산 뒤</dt><dd className="num">{fmt.int(have - cost)}</dd></div>
      </dl>
    </div>
  );
}
