// 선수 정보 #/player/:id — FM 식 선수 상세 (담당: 선수 상세·대전 개발자, 이 폴더만 고친다)
//   :id 는 선수 id(p03) 또는 카드 id(c03). ?card= 로 이 선수의 다른 카드, ?tab=attr|record|gear|enhance 로 탭.
//   큰 카드(얼굴 초상) · 레벨/강화/잠재력 · 능력치(FM 1~20) · 구종 · 특성 · 숨은 특성 · 폼 · 날씨 궁합
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
import { GearPanel, type GearState } from './GearPanel';
import { EnhancePanel, EnhanceResultSheet, type EnhanceResult, type MatPick } from './EnhancePanel';
import {
  chanceAfter, defaultPlaystyle, enhTable, gearBonus, gearOf, initialFails, isMine, materialsFor, resolvePlayer, rollEnhance, slotsFor,
} from './local-mock';
import s from './player.module.css';

type Tab = 'attr' | 'record' | 'gear' | 'enhance';
const TAB_IDS: Tab[] = ['attr', 'record', 'gear', 'enhance'];


export default function PlayerScreen({ params, query }: ScreenProps) {
  const cardQ = query.get('card');
  const res = useMemo(() => resolvePlayer(params.id, cardQ), [params.id, cardQ]);
  const t = query.get('tab');
  const initTab: Tab = TAB_IDS.includes(t as Tab) ? (t as Tab) : 'attr';
  return <PlayerView key={res.player.id} {...res} initTab={initTab} />;
}

interface Prog { enh: number; fails: number; tries: number; ps: string | null; level: number }

function PlayerView({ player: p, cards, mine, card, owned, initTab }: { player: Player; cards: CardInst[]; mine: CardInst[]; card: CardInst; owned: boolean; initTab: Tab }) {
  const team = teamById(p.teamId);
  const toast = useToast();
  useScreenTitle(p.name, `${team.name} · No.${p.number}`);
  const [tab, setTabState] = useState<Tab>(owned ? initTab : initTab === 'record' ? 'record' : 'attr');
  const [scale, setScale] = useState<Scale>('fm');
  const [prog, setProg] = useState<Record<string, Prog>>({});
  const [gears, setGears] = useState<Record<string, GearState>>({});
  const [picks, setPicks] = useState<Record<string, MatPick | null>>({});
  const [used, setUsed] = useState<Record<string, number>>({});
  const [spent, setSpent] = useState(0);
  const [result, setResult] = useState<EnhanceResult | null>(null);
  const [stuck, setStuck] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const cur: Prog = prog[card.id] ?? { enh: card.enhance, fails: initialFails(card), tries: 0, ps: card.enhance >= 5 ? defaultPlaystyle(p) : null, level: card.level };
  const gear: GearState = gears[card.id] ?? gearOf(card, p);
  const gb = useMemo(() => gearBonus(p, gear.equipped), [p, gear]);
  const slots = slotsFor(p);
  const worn = slots.filter((d) => gear.equipped[d.slot]).length;

  // 재료 — 쓴 만큼 뺀다
  const mats = useMemo(() => {
    const m = materialsFor(card);
    return {
      cards: m.cards.map((x) => ({ ...x, count: Math.max(0, x.count - (used[x.card.id] ?? 0)) })),
      ticket: { id: m.ticket.id, ko: m.ticket.ko, have: Math.max(0, m.ticket.have - (used['t:' + m.ticket.id] ?? 0)) },
    };
  }, [card, used]);
  const step = enhTable(card.grade)[cur.enh];
  const need = step ? parseInt(step.mat, 10) : 0;
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

  const patchProg = (patch: Partial<Prog>) => setProg((x) => ({ ...x, [card.id]: { ...cur, ...patch } }));

  const attempt = () => {
    if (!step) return;
    const pk = pickNow;
    if (!pk) { toast({ text: '재료가 모자라요. 같은 선수 카드나 강화권이 필요해요', tone: 'bad' }); return; }
    const ok = rollEnhance(card.id, step.stage, cur.tries, chance);
    const key = pk.kind === 'card' ? pk.id : 't:' + pk.id;
    setUsed((u) => ({ ...u, [key]: (u[key] ?? 0) + need }));
    setSpent((x) => x + step.gp);
    const matLabel = pk.kind === 'ticket' ? `${mats.ticket.ko} ${need}장` : `같은 선수 카드 ${need}장`;
    if (ok) patchProg({ enh: cur.enh + 1, fails: 0, tries: cur.tries + 1, ps: cur.ps });
    else patchProg({ fails: cur.fails + 1, tries: cur.tries + 1 });
    setResult({ ok, stage: step.stage, chance, nextChance: ok ? null : chanceAfter(step.base, cur.fails + 1), gain: step.gain, gp: step.gp, mat: matLabel });
  };

  const onKpi = (k: 'level' | 'enhance' | 'potential') => {
    if (!owned) return;
    setTab(k === 'potential' ? 'attr' : 'enhance');
  };

  const g = GRADES[card.grade];
  const tabItems = owned
    ? [{ value: 'attr' as Tab, label: '능력치' }, { value: 'record' as Tab, label: '기록' }, { value: 'gear' as Tab, label: '장비' }, { value: 'enhance' as Tab, label: '강화' }]
    : [{ value: 'attr' as Tab, label: '능력치' }, { value: 'record' as Tab, label: '기록' }];

  return (
    <div className={[s.screen, stuck && s.stuck].filter(Boolean).join(' ')}>
      <Hero
        p={p} team={team} card={card} cards={cards} owned={owned} isMineCard={isMine}
        enh={cur.enh} fails={cur.fails} level={cur.level}
        onPickCard={pickCard} onKpi={onKpi}
      />
      {!owned && (
        <p className={s.fogNote}>
          <b>내 카드가 아니에요.</b> 능력치는 스카우트가 본 범위로 보여요. 상점·영입에서 데려오면 강화·장비를 쓸 수 있어요.
        </p>
      )}

      <div ref={sentinel} className={s.sentinel} aria-hidden />
      <div className={s.tabsBar}>
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
        {tab === 'record' && <RecordPanel p={p} card={card} owned={owned} mineCount={mine.length} />}
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
          {step ? (
            <Button className={s.ctaMain} onClick={() => (tab === 'enhance' ? attempt() : setTab('enhance'))} trailing={<span>{chance}%</span>}>
              {fmt.roman(step.stage)} 강화{tab === 'enhance' ? ' 도전' : ''}
            </Button>
          ) : (
            <Button variant="secondary" className={s.ctaMain} onClick={() => setTab('enhance')}>X 완성 · 단계표 보기</Button>
          )}
        </div>
      ) : (
        <div className={s.cta}>
          <Button variant="secondary" className={s.ctaMain} icon="shop" onClick={() => navigate('/shop')}>스카우트 상점에서 찾기</Button>
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
