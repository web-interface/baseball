// 선수 정보 #/player/:id — FM 식 선수 상세 (담당: 선수 상세·대전 개발자, 이 폴더만 고친다)
//   :id 는 선수 id(p03 · 실제 선수 보기 k1a2b3c~2016) 또는 카드 id(c03 · k1a2b3c-2016r). ?card= 로 이 선수의 다른 카드,
//   ?tab=attr(기본)|season|real|career|pot|gear|enhance 로 탭 (10-24: 능력치가 맨 앞). 첫 탭 = 내 시즌 기록(이 게임), 실제 기록, 게임 통산(이 게임 시즌 합).
//   큰 카드(얼굴 초상) · 레벨/강화/잠재력 · 능력치(1~100) · 구종 · 특성 · 숨은 특성 · 폼 · 날씨 궁합
//   기록(시즌 · 최근 10경기 · 명장면 · 부상) · 장비(착용·강화·세트) · 강화(재료 · 확률 · 실패 보정 · +5 플레이스타일)
import { setQueryQuiet } from '../../app/router';
import { useScreenTitle } from '../../app/title';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ScreenProps } from '../../app/screen';
import { navigate } from '../../app/router';
import { Button, Tabs, fmt, useToast } from '../../ui';
import { PlayerArt } from '../../art/PlayerArt';
import { GRADES } from '../../game/grades';
import { teamById } from '../../game/mock';
import type { CardInst, Player } from '../../game/types';
import { Hero } from './Hero';
import { AttrPanel, type Scale } from './AttrPanel';
import { RecordPanel } from './RecordPanel';
import { CareerPanel, RealPanel } from './RealPanel';
import { GearPanel, type GearState } from './GearPanel';
import { EnhancePanel, EnhanceResultSheet, type EnhanceResult, type MatPick } from './EnhancePanel';
import { PotentialPanel } from './PotentialPanel';
import {
  chanceAfter, defaultPlaystyle, enhTable, gearBonus, gearOf, isMine, materialsFor, resolvePlayer, slotsFor,
} from './local-mock';
import { entryOf, inLineup, setPlaystyle, tryEnhance, useInventory } from '../../game/inventory';
import s from './player.module.css';

type Tab = 'attr' | 'season' | 'real' | 'career' | 'pot' | 'gear' | 'enhance';
const TAB_IDS: Tab[] = ['attr', 'season', 'real', 'career', 'pot', 'gear', 'enhance'];


export default function PlayerScreen({ params, query }: ScreenProps) {
  const cardQ = query.get('card');
  const ver = useInventory();
  const res = useMemo(() => resolvePlayer(params.id, cardQ), [params.id, cardQ, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const t = query.get('tab');
  const initTab: Tab = t === 'record' ? 'season' : TAB_IDS.includes(t as Tab) ? (t as Tab) : 'attr';
  return <PlayerView key={res.player.id} {...res} initTab={initTab} />;
}

interface Prog { enh: number; fails: number; ps: string | null; level: number }

function PlayerView({ player: p, cards, mine, card, owned, initTab }: { player: Player; cards: CardInst[]; mine: CardInst[]; card: CardInst; owned: boolean; initTab: Tab }) {
  const team = teamById(p.teamId);
  const toast = useToast();
  useScreenTitle(p.name, `${team.name} · No.${p.number}`);
  const [tab, setTabState] = useState<Tab>(owned || ['attr', 'season', 'real', 'career', 'pot'].includes(initTab) ? initTab : 'attr');
  const [scale, setScale] = useState<Scale>('100');
  const [gears, setGears] = useState<Record<string, GearState>>({});
  const [picks, setPicks] = useState<Record<string, MatPick | null>>({});
  const [spent, setSpent] = useState(0);
  const [result, setResult] = useState<EnhanceResult | null>(null);
  const [stuck, setStuck] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);

  // 강화 · 실패 보정 · 플레이스타일 · 레벨은 보유 카드 저장소에서 (새로고침해도 그대로)
  const ent = entryOf(card.id);
  const cur: Prog = { enh: ent?.enh ?? card.enhance, fails: ent?.fail ?? 0, ps: ent?.ps ?? ((ent?.enh ?? card.enhance) >= 5 ? defaultPlaystyle(p) : null), level: ent?.lv ?? card.level };
  const gear: GearState = gears[card.id] ?? gearOf(card, p);
  const gb = useMemo(() => gearBonus(p, gear.equipped), [p, gear]);
  const slots = slotsFor(p);
  const worn = slots.filter((d) => gear.equipped[d.slot]).length;

  // 재료 — 같은 카드의 남는 장 (보유 카드 저장소)
  const mats = useMemo(() => {
    const m = materialsFor(card);
    return { cards: m.cards, ticket: { id: m.ticket.id, ko: m.ticket.ko, have: m.ticket.have } };
  }, [card, ent?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  const step = enhTable(card.grade)[cur.enh];
  const need = step ? step.need : 0;
  const autoPick: MatPick | null = (() => {
    const c = mats.cards.find((x) => x.count >= need);
    if (c) return { kind: 'card', id: c.card.id };
    if (mats.ticket.have >= need) return { kind: 'ticket', id: mats.ticket.id };
    return null;
  })();
  const pickNow = (() => {
    const pk = picks[card.id];
    if (!pk) return autoPick;
    if (pk.kind === 'card' && (mats.cards.find((x) => x.card.id === pk.id)?.count ?? 0) >= need) return pk;
    if (pk.kind === 'ticket' && mats.ticket.have >= need) return pk;
    return autoPick;
  })();
  const chance = step ? chanceAfter(step.base, cur.fails) : 100;

  // 붙은 탭 감지
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const headerH = 56;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting && e.boundingClientRect.top < headerH + 4), { rootMargin: `-${headerH}px 0px 0px 0px`, threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // 고른 탭이 가로 스크롤 밖이면 가운데로 (탭 7개 — 좁은 화면에서 잘린다)
  useEffect(() => {
    const box = bar.current?.querySelector<HTMLElement>('[role="tablist"]');
    const on = box?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (box && on) box.scrollLeft = Math.max(0, on.offsetLeft - (box.clientWidth - on.offsetWidth) / 2);
  }, [tab]);

  const setTab = useCallback((next: Tab) => {
    setTabState(next);
    setQueryQuiet({ tab: next === 'attr' ? null : next });
    const el = sentinel.current;
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 52;
      if (window.scrollY > top) window.scrollTo({ top, behavior: 'auto' });
    }
  }, []);

  const pickCard = (id: string) => {
    const tabQ = tab === 'attr' ? '' : `&tab=${tab}`;
    navigate(`/player/${p.id}?card=${id}${tabQ}`, { replace: true });
  };

  const patchProg = (patch: Partial<Prog>) => { if ('ps' in patch) setPlaystyle(card.id, patch.ps ?? null); };
  const have = mats.cards[0]?.count ?? 0;

  /** 강화 — I~V 는 같은 카드가 모이면 자동(여기서는 남은 장수 안내), VI~X 는 같은 카드 1장 + GP 로 도전 */
  const attempt = () => {
    if (!step) return;
    if (step.auto) {
      toast({ text: `같은 카드가 ${need}장 모이면 ${fmt.roman(step.stage)} 로 자동으로 올라요 · 지금 ${have}/${need}장`, tone: 'info', action: { label: '카드구매', onClick: () => navigate('/gacha') } });
      return;
    }
    const r = tryEnhance(card.id);
    if (!r.ok) {
      toast({ text: r.why === 'gp' ? 'GP 가 모자라요' : r.why === 'material' ? `같은 카드가 ${r.need}장 더 필요해요 · 지금 ${r.have}장` : '강화할 수 없는 카드예요', tone: 'bad' });
      return;
    }
    setSpent((x) => x + r.gp);
    setResult({ ok: r.success, stage: r.stage, chance: r.chance, nextChance: r.nextChance, gain: r.gain, gp: r.gp, mat: `같은 카드 ${need}장` });
  };

  const onKpi = (k: 'level' | 'enhance' | 'potential') => {
    if (k === 'potential') { setTab('pot'); return; }
    if (!owned) return;
    setTab('enhance');
  };

  const g = GRADES[card.grade];
  const recTabs = [{ value: 'attr' as Tab, label: '능력치' }, { value: 'season' as Tab, label: '내 시즌' }, { value: 'real' as Tab, label: '실제 기록' }, { value: 'career' as Tab, label: '게임 통산' }, { value: 'pot' as Tab, label: '잠재력' }];
  const tabItems = owned ? [...recTabs, { value: 'gear' as Tab, label: '장비' }, { value: 'enhance' as Tab, label: '강화' }] : recTabs;

  return (
    <div className={[s.screen, stuck && s.stuck].filter(Boolean).join(' ')}>
      <Hero
        p={p} team={team} card={card} cards={cards} owned={owned} isMineCard={isMine}
        enh={cur.enh} fails={cur.fails} level={cur.level}
        onPickCard={pickCard} onKpi={onKpi}
      />
      {owned && !inLineup(card.id) && (
        <p className={s.fogNote}>
          <b>보관함에 있는 카드예요.</b> 라인업 선수와 바꾸려면{' '}
          <Button variant="ghost" size="s" onClick={() => navigate(`/lineup?bench=${card.id}`)}>라인업에 넣기</Button>
        </p>
      )}
      {!owned && (
        <p className={s.fogNote}>
          <b>내 카드가 아니에요.</b> 능력치는 스카우트가 본 범위로 보여요. 상점(카드구매·스카우터)에서 데려오면 강화·장비를 쓸 수 있어요.
        </p>
      )}

      <div ref={sentinel} className={s.sentinel} aria-hidden />
      <div ref={bar} className={s.tabsBar}>
        <div className={s.mini} aria-hidden={!stuck}>
          <span className={s.miniFace}><PlayerArt player={p} team={team} variant="mini" /></span>
          <span className={s.miniText}>
            <b>{p.name}</b>
            <span><span className="num">{p.ovr}</span> · {g.short}{cur.enh > 0 ? ` ${fmt.roman(cur.enh)}` : ''}</span>
          </span>
        </div>
        <Tabs className={s.tabs} items={tabItems} value={tab} onChange={setTab} fill aria-label="선수 정보" />
      </div>

      <div role="tabpanel" aria-label={tabItems.find((x) => x.value === tab)?.label}>
        {tab === 'attr' && (
          <AttrPanel
            p={p} card={card} grade={card.grade} owned={owned} mineCount={mine.length}
            enh={cur.enh} playstyle={cur.ps} gearPer={gb.per} scale={scale} onScale={setScale}
          />
        )}
        {tab === 'season' && <RecordPanel p={p} card={card} owned={owned} mineCount={mine.length} />}
        {tab === 'real' && <RealPanel p={p} card={card} />}
        {tab === 'career' && <CareerPanel p={p} card={card} />}
        {tab === 'pot' && <PotentialPanel p={p} card={card} owned={owned} />}
        {tab === 'gear' && owned && (
          <GearPanel p={p} team={team} gear={gear} onChange={(ng) => setGears((x) => ({ ...x, [card.id]: ng }))} onTry={(gp) => setSpent((x) => x + gp)} />
        )}
        {tab === 'enhance' && owned && (
          <EnhancePanel
            p={p} card={card} enh={cur.enh} fails={cur.fails} level={cur.level} playstyle={cur.ps}
            mats={mats} pick={pickNow} spent={spent}
            onPick={(m) => setPicks((x) => ({ ...x, [card.id]: m }))}
            onPlaystyle={(id) => { patchProg({ ps: id }); toast({ text: '플레이스타일을 바꿨어요', tone: 'good' }); }}
          />
        )}
      </div>

      {owned ? (
        <div className={s.cta}>
          {tab === 'gear'
            ? <Button variant="secondary" className={s.ctaSide} onClick={() => setTab('attr')}>능력치</Button>
            : <Button variant="secondary" className={s.ctaSide} icon="glove" onClick={() => setTab('gear')} trailing={<span>{worn}/{slots.length}</span>}>장비</Button>}
          {step && step.auto ? (
            <Button variant={tab === 'enhance' ? 'secondary' : 'primary'} className={s.ctaMain} onClick={() => (tab === 'enhance' ? attempt() : setTab('enhance'))} trailing={<span className="num">{have}/{need}</span>}>
              {fmt.roman(step.stage)} 자동 강화까지
            </Button>
          ) : step ? (
            <Button className={s.ctaMain} onClick={() => (tab === 'enhance' ? attempt() : setTab('enhance'))} trailing={<span>{chance}%</span>}>
              {fmt.roman(step.stage)} 강화{tab === 'enhance' ? ' 도전' : ''}
            </Button>
          ) : (
            <Button variant="secondary" className={s.ctaMain} onClick={() => setTab('enhance')}>X 완성 · 단계표 보기</Button>
          )}
        </div>
      ) : (
        <div className={s.cta}>
          <Button variant="secondary" className={s.ctaMain} icon="shop" onClick={() => navigate('/shop')}>스카우터에서 찾기</Button>
        </div>
      )}

      <EnhanceResultSheet
        result={result}
        p={p}
        card={card}
        enh={cur.enh}
        playstyle={cur.ps}
        onPlaystyle={(id) => { patchProg({ ps: id }); setResult(null); toast({ text: '플레이스타일을 정했어요', tone: 'good' }); }}
        onClose={() => setResult(null)}
        onAgain={() => { setResult(null); window.setTimeout(attempt, 240); }}
      />
    </div>
  );
}
