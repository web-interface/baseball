// 카드 보관함 — 담당: 카드 디자이너 (이 폴더 + src/cards)
//   #/cards            내 선수 카드 — 등급·포지션·구단 거르기, 정렬, 격자(3열·2열), 같은 카드 겹침, 누르면 크게(앞·뒤)
//   #/cards?gallery=1  등급 갤러리 — 11등급 + 특별 선수 한 화면 (실제 카드 / 같은 선수로 패럴렐 비교)
//   #/cards?mode=enhance  강화 — 같은 목록을 강화 단계순으로 + 카드마다 '다음 단계까지 n장' 진행 · 단계별 필요 수량 표
//                         (메뉴 '훈련' #/enhance 는 screens/train — 능력치 훈련 0~10단계, 강화와 따로)
//   보유 카드는 모두 보유 카드 저장소(game/inventory)에서 — 카드구매 · 조합 · 스카우터로 얻은 카드가 바로 보이고,
//   같은 카드가 필요 수량만큼 모이면 자동으로 강화된다(최근 강화 줄에 'II → III').
import { useCallback, useMemo, useState } from 'react';
import type { ScreenProps } from '../../app/screen';
import { Link, navigate } from '../../app/router';
import { Card, CardBack, CardMini, cardProps } from '../../cards';
import { GEAR_GRADE_KO, SLOT_KO, gearSet, slotsOf } from '../../cards';
import { Button, Emblem, Icon, Sheet, Tabs } from '../../ui';
import { avg as fmtAvg, level as fmtLevel, levelColor, roman, yearTag } from '../../ui/format';
import { GRADES } from '../../game/grades';
import { POS_KO, ROLE_KO } from '../../game/labels';
import { CARDS, ME, TEAMS, cardById, playerById, playerOfCard, teamById } from '../../game/mock';
import {
  ENH_AUTO_MAX, ENH_STEPS, MAT_CLASS_KO, entryOf, inLineup, isOwned, nextStep, ownedCard, ownedIds, recentEnh, stats as invStats, useInventory, type MatClass,
} from '../../game/inventory';
import type { CardInst, GradeId, Player } from '../../game/types';
import s from './Cards.module.css';

/* ───────── 거르기·정렬 ───────── */
type PosGroup = 'all' | 'P' | 'C' | 'IF' | 'OF' | 'DH';
type SortKey = 'ovr' | 'grade' | 'level' | 'enh';
const POS_GROUP: Record<Exclude<PosGroup, 'all'>, string[]> = { P: ['P'], C: ['C'], IF: ['1B', '2B', '3B', 'SS'], OF: ['LF', 'CF', 'RF'], DH: ['DH'] };
const POS_TABS: { value: PosGroup; label: string }[] = [
  { value: 'all', label: '전체' }, { value: 'P', label: '투수' }, { value: 'C', label: '포수' }, { value: 'IF', label: '내야' }, { value: 'OF', label: '외야' }, { value: 'DH', label: '지명' },
];
const SORT_TABS: { value: SortKey; label: string }[] = [
  { value: 'ovr', label: 'OVR' }, { value: 'grade', label: '등급' }, { value: 'level', label: '레벨' }, { value: 'enh', label: '강화' },
];
/** 낮은 등급 → 높은 등급 (서열: 노멀 < 스페셜 < 레어 < 레전드 < 엘리트 < 프랜차이즈 < 블랙 < 시그니처) · 수상 · 특별 선수 */
const LADDER: GradeId[] = ['normal', 'special', 'rare', 'legend', 'elite', 'franchise', 'black', 'signature', 'mvp', 'gg', 'th', 'unique'];
const SHORT: Record<GradeId, string> = {
  normal: 'N', special: 'SP', rare: 'R', elite: 'E', legend: 'L', franchise: 'FR', black: 'BK', signature: 'SIG', mvp: 'MVP', gg: 'GG', th: 'TH', unique: '1/1',
};
/** 등급 설명 — 갤러리 */
const LOOK: Record<GradeId, string> = {
  normal: '회색 테 · 기본 카드',
  special: '주황 테',
  rare: '빨간 테 · 광택 한 줄',
  elite: '보라 테 · 테가 빛나고 빛이 흐름',
  legend: '금 테 · 빛이 숨 쉬듯 · 흐르는 금빛',
  franchise: '구단색 테 · 금 FR 명판 · 흐르는 빛',
  black: '검정 테 · 하얀 빛 · 크롬 빛이 스침',
  signature: '돌아가는 무지개 테 · 친필 사인',
  mvp: '금 테 · 남색 이름 띠 · MVP 문장',
  gg: '금빛 테 · 황금 글러브 문장',
  th: '보라 테 · 왕관 문장',
  unique: '진주빛 테 · 무지개 결 · 숨 쉬는 빛',
};
const LIMIT: Partial<Record<GradeId, string>> = { legend: '/99', franchise: '/50', black: '/25', signature: '/10', mvp: '/27', gg: '/27', th: '/27', unique: '1/1' };

const groupOf = (p: Player): Exclude<PosGroup, 'all'> =>
  (Object.keys(POS_GROUP) as Exclude<PosGroup, 'all'>[]).find((k) => POS_GROUP[k].includes(p.pos)) ?? 'DH';

function readCols(): 2 | 3 {
  try { return localStorage.getItem('bb.cards.cols') === '2' ? 2 : 3; } catch { return 3; }
}
function saveCols(n: 2 | 3) {
  try { localStorage.setItem('bb.cards.cols', String(n)); } catch { /* 이번 방문만 */ }
}

/* ───────── 화면 ───────── */
//   주소로 바로: ?open=c01 (그 카드 크게) · &back=1 (뒷면부터) · ?cols=2 (한 줄 2장) · ?gallery=1&same=1
export default function CardsScreen({ query }: ScreenProps) {
  if (query.get('gallery') === '1') return <Gallery same={query.get('same') === '1'} />;
  const enhance = query.get('mode') === 'enhance';
  return <Collection openId={query.get('open')} openBack={query.get('back') === '1'} colsParam={query.get('cols')} sortParam={query.get('sort') ?? (enhance ? 'enh' : null)} enhance={enhance} />;
}

function Collection({ openId, openBack, colsParam, sortParam, enhance = false }: { openId: string | null; openBack: boolean; colsParam: string | null; sortParam: string | null; enhance?: boolean }) {
  const ver = useInventory();
  // 선수보관함 = 라인업 밖에 있는 카드만 (라인업 선수는 라인업 탭에서). 강화 화면은 라인업 선수도 강화하니 전부.
  const all = useMemo(() => ownedIds().map((id) => ownedCard(id)).filter(Boolean) as CardInst[], [ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const mine = useMemo(() => (enhance ? all : all.filter((c) => !inLineup(c.id))), [all, enhance]);
  const inLine = all.length - mine.length;
  const [grade, setGrade] = useState<GradeId | 'all'>('all');
  const [pos, setPos] = useState<PosGroup>('all');
  const [team, setTeam] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>(() => (['ovr', 'grade', 'level', 'enh'] as const).find((k) => k === sortParam) ?? 'ovr');
  const [cols, setCols] = useState<2 | 3>(() => (colsParam === '2' ? 2 : colsParam === '3' ? 3 : readCols()));
  const [openKey, setOpenKey] = useState<string | null>(() => openId);
  // 열린 카드는 보관함에서 매번 다시 읽는다 (강화하면 바로 바뀜) — 내 카드가 아니면 카드 정의
  const open = openKey ? ownedCard(openKey) ?? cardById(openKey) ?? null : null;
  const setOpen = (c: CardInst | null) => setOpenKey(c ? c.id : null);

  const counts = useMemo(() => {
    const m = new Map<GradeId, number>();
    mine.forEach((c) => m.set(c.grade, (m.get(c.grade) ?? 0) + 1));
    return m;
  }, [mine]);
  const teamsHere = useMemo(() => TEAMS.filter((t) => mine.some((c) => playerOfCard(c).teamId === t.id)), [mine]);

  const list = useMemo(() => {
    const out = mine.filter((c) => {
      const p = playerOfCard(c);
      if (grade !== 'all' && c.grade !== grade) return false;
      if (pos !== 'all' && groupOf(p) !== pos) return false;
      if (team !== 'all' && p.teamId !== team) return false;
      return true;
    });
    const rank = (c: CardInst) => GRADES[c.grade].rank;
    const by: Record<SortKey, (a: CardInst, b: CardInst) => number> = {
      ovr: (a, b) => playerOfCard(b).ovr - playerOfCard(a).ovr || rank(b) - rank(a),
      grade: (a, b) => rank(b) - rank(a) || playerOfCard(b).ovr - playerOfCard(a).ovr,
      level: (a, b) => b.level - a.level || rank(b) - rank(a),
      enh: (a, b) => b.enhance - a.enhance || rank(b) - rank(a),
    };
    return out.sort((a, b) => by[sort](a, b) || playerOfCard(a).name.localeCompare(playerOfCard(b).name, 'ko'));
  }, [mine, grade, pos, team, sort]);

  const dupTotal = mine.reduce((n, c) => n + c.dup, 0);
  const copies = mine.length + dupTotal;
  const recent = useMemo(() => recentEnh().filter((e) => isOwned(e.id)).slice(0, enhance ? 6 : 3), [ver, enhance]); // eslint-disable-line react-hooks/exhaustive-deps
  const st = useMemo(() => invStats(), [ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtered = grade !== 'all' || pos !== 'all' || team !== 'all';
  const reset = () => { setGrade('all'); setPos('all'); setTeam('all'); };
  const pickCols = (n: 2 | 3) => { setCols(n); saveCols(n); };
  const close = useCallback(() => setOpenKey(null), []);
  const pct = Math.round((ME.collection.have / ME.collection.total) * 100);

  return (
    <div className={s.page}>
      <header className={s.head}>
        <div className={s.titleRow}>
          <h1 className={['head', s.h1].join(' ')}>{enhance ? '강화' : '카드'}</h1>
          {enhance
            ? <Link to="/cards" className={s.galleryLink}>선수보관<Icon name="chevron" size={16} /></Link>
            : <Link to="/cards?gallery=1" className={s.galleryLink}>등급 갤러리<Icon name="chevron" size={16} /></Link>}
        </div>
        {enhance && (
          <p className={s.lead}>같은 카드가 표의 장수만큼 모이면 <b>I~V</b> 는 바로 올라가요(재료로 쓴 장수만큼 줄어요). <b>VI~X</b> 는 같은 카드 1장 + GP 로 도전해요 — 실패해도 단계는 그대로예요.</p>
        )}
        <dl className={s.tally}>
          <div><dt>{enhance ? '보유' : '보관'}</dt><dd className="num">{mine.length}<small>종</small></dd>{!enhance && inLine > 0 && <Link to="/lineup" className={s.inLine}>라인업 {inLine}명 ›</Link>}</div>
          <div><dt>{enhance ? '강화에 쓴 카드' : '같은 카드'}</dt><dd className="num">{enhance ? st.enhUsed : dupTotal}<small>{enhance ? '장' : `/${copies}장`}</small></dd></div>
          <div className={s.album}>
            <dt>도감</dt>
            <dd><span className="num">{ME.collection.have.toLocaleString('en-US')}</span><small className="num">/{ME.collection.total.toLocaleString('en-US')}</small></dd>
            <i className={s.albumBar} style={{ ['--p' as string]: pct + '%' }} aria-hidden />
          </div>
        </dl>
      </header>

      {recent.length > 0 && (
        <section className={s.recent} aria-label="최근 강화">
          <h2 className={s.recentH}>최근 강화</h2>
          <ul>
            {recent.map((e) => {
              const c = ownedCard(e.id);
              if (!c) return null;
              const p = playerOfCard(c);
              return (
                <li key={e.id + e.at + e.to}>
                  <button type="button" onClick={() => setOpenKey(e.id)}>
                    <b>{p.name}</b>
                    <span className={s.recentGr} style={{ color: `var(--gr-${c.grade})` }}>{SHORT[c.grade]}{c.year != null && GRADES[c.grade].yearTagged ? ' ' + yearTag(c.year) : ''}</span>
                    <span className={['num', s.recentStep].join(' ')}>{e.from > 0 ? roman(e.from) : '0'} → {roman(e.to)}</span>
                    <small>{e.src === 'auto' ? '같은 카드 모음' : '도전 성공'}</small>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {enhance && <EnhRules />}

      <section className={s.filters} aria-label="거르기">
        <div className={s.fRow}>
          <span className={s.fLabel}>등급</span>
          <div className={s.swatches} role="radiogroup" aria-label="등급">
            <button type="button" role="radio" aria-checked={grade === 'all'} className={[s.sw, s.swAll, grade === 'all' && s.on].filter(Boolean).join(' ')} onClick={() => setGrade('all')}>
              <span>전체</span>
            </button>
            {LADDER.filter((g) => counts.has(g)).map((g) => (
              <button
                key={g}
                type="button"
                role="radio"
                aria-checked={grade === g}
                aria-label={`${GRADES[g].ko} ${counts.get(g)}장`}
                className={[s.sw, s['sw-' + g], grade === g && s.on].filter(Boolean).join(' ')}
                onClick={() => setGrade(grade === g ? 'all' : g)}
              >
                <i className={s.swChip} aria-hidden />
                <span>{SHORT[g]}</span>
                <em className="num">{counts.get(g)}</em>
              </button>
            ))}
          </div>
        </div>
        <div className={s.fRow}>
          <span className={s.fLabel}>포지션</span>
          <Tabs items={POS_TABS} value={pos} onChange={setPos} size="s" aria-label="포지션" className={s.posTabs} />
        </div>
        <div className={s.fRow}>
          <span className={s.fLabel}>구단</span>
          <div className={s.teams} role="radiogroup" aria-label="구단">
            <button type="button" role="radio" aria-checked={team === 'all'} className={[s.tm, s.tmAll, team === 'all' && s.on].filter(Boolean).join(' ')} onClick={() => setTeam('all')}>전체</button>
            {teamsHere.map((t) => (
              <button key={t.id} type="button" role="radio" aria-checked={team === t.id} aria-label={t.name} title={t.name}
                className={[s.tm, team === t.id && s.on].filter(Boolean).join(' ')} onClick={() => setTeam(team === t.id ? 'all' : t.id)}>
                <Emblem team={t} size={26} />
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className={s.bar}>
        <p className={s.count}>
          <b className="num">{list.length}</b>장
          {filtered && <button type="button" className={s.reset} onClick={reset}>거르기 풀기</button>}
        </p>
        <Tabs variant="box" size="s" items={SORT_TABS} value={sort} onChange={setSort} aria-label="정렬" />
        <div className={s.cols} role="group" aria-label="한 줄 장수">
          <button type="button" aria-pressed={cols === 3} className={cols === 3 ? s.on : undefined} onClick={() => pickCols(3)} title="한 줄에 3장"><GridGlyph n={3} /></button>
          <button type="button" aria-pressed={cols === 2} className={cols === 2 ? s.on : undefined} onClick={() => pickCols(2)} title="한 줄에 2장"><GridGlyph n={2} /></button>
        </div>
      </div>

      {list.length === 0 ? (
        mine.length === 0 && !enhance ? (
          <div className={s.empty}>
            <p>보관함이 비어 있어요. 라인업 밖의 카드가 여기 모여요.</p>
            <Button variant="secondary" size="s" onClick={() => navigate('/gacha')}>상점 › 카드구매</Button>
          </div>
        ) : (
          <div className={s.empty}>
            <p>이 조건에 맞는 카드가 없어요.</p>
            <Button variant="secondary" size="s" onClick={reset}>거르기 풀기</Button>
          </div>
        )
      ) : (
        <ul className={[s.grid, cols === 2 ? s.two : s.three].join(' ')}>
          {list.map((c) => (
            <li key={c.id} className={s.cell}>
              <div className={[s.stack, c.dup > 0 && s.stacked, c.dup > 1 && s.stacked2].filter(Boolean).join(' ')}>
                <Card {...cardProps(c)} fluid dense onClick={() => setOpen(c)} />
              </div>
              {enhance ? <EnhProg card={c} /> : c.dup > 0 && (
                <span className={s.dup} title={`같은 카드 ${c.dup + 1}장 — ${c.dup}장은 강화 재료`}>
                  같은 카드 <b className="num">×{c.dup + 1}</b>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <CardSheet card={open} onClose={close} startBack={openBack} />
    </div>
  );
}

/** 강화 칸 아래 — 다음 단계까지 같은 카드 have/need (자동 단계) · 도전 단계는 재료 유무 */
function EnhProg({ card }: { card: CardInst }) {
  const nx = nextStep(card.id);
  if (card.grade === 'unique') return <span className={s.prog}><em>강화권 전용</em></span>;
  if (!nx) return <span className={[s.prog, s.progMax].join(' ')}><em className="num">X</em> 완성{card.dup > 0 && <> · 남는 <b className="num">{card.dup}</b></>}</span>;
  const pct = Math.min(100, Math.round((nx.have / nx.need) * 100));
  return (
    <span className={[s.prog, !nx.auto && s.progTry].filter(Boolean).join(' ')} title={nx.auto ? `${roman(nx.stage)} 까지 같은 카드 ${nx.need}장 — 모이면 자동` : `${roman(nx.stage)} 도전 — 같은 카드 1장 + GP`}>
      <i style={{ ['--p' as string]: pct + '%' }} aria-hidden />
      <em className="num">{roman(nx.stage)}</em>
      {nx.auto ? <><b className="num">{nx.have}</b>/<span className="num">{nx.need}</span></> : nx.have > 0 ? <>도전 가능</> : <>재료 0</>}
    </span>
  );
}

/** 단계별 필요 수량 표 (기획서 7.1 — game/inventory 의 ENH_STEPS 한 곳에서) */
function EnhRules() {
  const cls: MatClass[] = ['C', 'B', 'A'];
  return (
    <section className={s.rules} aria-label="강화 단계별 필요 수량">
      <table>
        <thead>
          <tr><th>같은 카드</th>{ENH_STEPS.slice(0, ENH_AUTO_MAX).map((x) => <th key={x.stage} className="num">{roman(x.stage)}</th>)}<th>VI~X</th></tr>
        </thead>
        <tbody>
          {cls.map((k) => (
            <tr key={k}>
              <th>{MAT_CLASS_KO[k]}</th>
              {ENH_STEPS.slice(0, ENH_AUTO_MAX).map((x) => <td key={x.stage} className="num">{x.mat[k]}</td>)}
              <td>1장 + GP</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>I~V 는 모이면 자동 · VI <span className="num">100</span> · VII <span className="num">75</span> · VIII <span className="num">60</span> · IX <span className="num">45</span> · X <span className="num">35%</span>, 실패마다 <span className="num">+15%p</span>, 세 번 실패하면 다음은 확정.</p>
    </section>
  );
}

function GridGlyph({ n }: { n: 2 | 3 }) {
  const w = n === 3 ? 4.4 : 7;
  const xs = n === 3 ? [2, 7.8, 13.6] : [2, 11];
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      {xs.map((x) => <rect key={x} x={x} y="3" width={w} height="14" rx=".8" fill="none" stroke="currentColor" strokeWidth="1.4" />)}
    </svg>
  );
}

/* ───────── 크게 보기 (앞·뒤) ───────── */
function CardSheet({ card, onClose, startBack = false }: { card: CardInst | null; onClose: () => void; startBack?: boolean }) {
  const [back, setBack] = useState(startBack);
  const [last, setLast] = useState<CardInst | null>(card);
  if (card && card !== last) { setLast(card); setBack(false); }
  const c = card ?? last;
  if (!c) return <Sheet open={false} onClose={onClose} />;
  const p = playerOfCard(c);
  const t = teamById(p.teamId);
  const g = GRADES[c.grade];
  const props = cardProps(c);
  const gear = props.gear ?? [];
  const set3 = gearSet(gear);
  const slots = slotsOf(p);
  const posKo = p.pos === 'P' ? `${ROLE_KO[p.role ?? 'SP']} 투수` : POS_KO[p.pos];
  const lvInt = Math.floor(c.level), lvPct = Math.round((c.level - lvInt) * 100);
  const mineHere = isOwned(c.id);
  const entry = entryOf(c.id);
  const nx = mineHere ? nextStep(c.id) : null;
  const nextLine = c.grade === 'unique' ? '— 특별 선수는 강화권으로 강화해요'
    : !nx ? (c.dup > 0 ? `— X 완성 · 남는 ${c.dup}장은 조합 재료` : '— X 완성')
    : nx.auto ? `— ${roman(nx.stage)} 까지 ${nx.need}장 중 ${nx.have}장 (모이면 자동 강화)`
    : `— ${roman(nx.stage)} 도전에 1장 + ${nx.gp.toLocaleString('en-US')} GP · 지금 ${nx.chance}%`;
  const line = p.season.bat
    ? `타율 ${fmtAvg(p.season.bat.avg)} · 홈런 ${p.season.bat.hr} · OPS ${fmtAvg(p.season.bat.ops)}`
    : p.season.pit ? `평균자책 ${p.season.pit.era.toFixed(2)} · ${p.role === 'CL' ? `${p.season.pit.sv}세이브` : p.role === 'RP' ? `${p.season.pit.hld}홀드` : `${p.season.pit.w}승 ${p.season.pit.l}패`}` : '';

  return (
    <Sheet
      open={!!card}
      onClose={onClose}
      height="tall"
      title={<>{p.name} <span className={s.sheetGrade} style={{ color: `var(--gr-${c.grade})` }}>{g.ko}{c.year != null && g.yearTagged ? ' ' + yearTag(c.year) : ''}</span></>}
      sub={`${t.name} · ${posKo} · ${line}`}
      footer={<>
        {/* 선수 교체 — 보관함 카드는 누구와 바꿀지 고르는 라인업 시트로, 이미 라인업에 있으면 라인업 화면으로 (뒤집기는 카드를 누르면 됨) */}
        {mineHere && (inLineup(c.id)
          ? <Button icon="swap" onClick={() => { onClose(); navigate('/lineup'); }}>라인업에서 교체</Button>
          : <Button icon="swap" onClick={() => { onClose(); navigate(`/lineup?bench=${c.id}`); }}>선수 교체</Button>)}
        {mineHere && nx && !nx.auto && (
          <Button variant="secondary" onClick={() => { onClose(); navigate(`/player/${p.id}?card=${c.id}&tab=enhance`); }}>{roman(nx.stage)} 강화 도전</Button>
        )}
      </>}
    >
      <div className={s.detail}>
        <button type="button" className={[s.flip, back && s.flipped].filter(Boolean).join(' ')} onClick={() => setBack((v) => !v)} aria-label={back ? '앞면으로 뒤집기' : '뒷면으로 뒤집기'}>
          <span className={s.flipFront}><Card {...props} width={280} live eager /></span>
          <span className={s.flipBack}><CardBack {...props} width={280} /></span>
        </button>

        <dl className={s.facts}>
          <div className={s.fact}>
            <dt>강화</dt>
            <dd>
              <span className={s.pips} aria-label={`강화 ${c.enhance} / 10`}>
                {Array.from({ length: 10 }, (_, i) => <i key={i} className={i < c.enhance ? s.pipOn : undefined} />)}
              </span>
              <b className="num">{c.enhance > 0 ? roman(c.enhance) : '—'}</b>
            </dd>
          </div>
          <div className={s.fact}>
            <dt>레벨</dt>
            <dd>
              <span className={s.lvTrack} aria-hidden><i style={{ width: `${Math.min(100, (c.level / g.levelMax) * 100)}%` }} /></span>
              <b className="num" style={{ color: levelColor(c.level) }}>{fmtLevel(c.level)}</b>
              <small className="num">/ {g.levelMax} · {c.level >= g.levelMax ? '최고 레벨' : `다음 레벨까지 ${100 - lvPct}%`}</small>
            </dd>
          </div>
          <div className={s.fact}>
            <dt>같은 카드</dt>
            <dd>{mineHere ? <><b className="num">{c.dup + 1}</b>장 <small>{nextLine}</small></> : <small>내 카드가 아니에요</small>}</dd>
          </div>
          {mineHere && entry && (
            <div className={s.fact}>
              <dt>기록</dt>
              <dd><small>받은 <span className="num">{entry.got}</span>장 · 강화에 <span className="num">{entry.mat}</span>장 · 조합에 <span className="num">{entry.rl}</span>장{inLineup(c.id) ? ' · 라인업 카드(마지막 1장 보호)' : ''}</small></dd>
            </div>
          )}
          {mineHere && (
            <div className={s.fact}>
              <dt>훈련</dt>
              {/* 능력치 훈련 0~10 (game/training · 강화와 따로) — 훈련 화면으로 */}
              <dd>
                <b className="num">{c.train?.lv ?? 0}</b><small className="num"> / 10{(c.train?.lv ?? 0) >= 10 ? ' · 최종 단계' : (c.train?.lv ?? 0) >= 5 ? ' · 불빛 단계' : ''}</small>
                <Link to={`/enhance?card=${encodeURIComponent(c.id)}`} className={s.trainLink}>{(c.train?.lv ?? 0) >= 10 ? '훈련 보기' : '훈련하기'}<Icon name="chevron" size={14} /></Link>
              </dd>
            </div>
          )}
          {c.signaturePitch && (
            <div className={s.fact}>
              <dt>고유 구종</dt>
              <dd><b style={{ color: c.signaturePitch.color }} className={s.sigName}>{c.signaturePitch.name}</b> <small>{c.signaturePitch.effect}</small></dd>
            </div>
          )}
          <div className={[s.fact, s.factGear].join(' ')}>
            <dt>장비 <span className="num">{gear.length}/{slots.length}</span></dt>
            <dd>
              <ul className={s.gearList}>
                {slots.map((sl) => {
                  const g2 = gear.find((x) => x.slot === sl);
                  return (
                    <li key={sl} className={g2 ? undefined : s.gearEmpty}>
                      <span className={s.gearSlot}>{SLOT_KO[sl]}</span>
                      {g2 ? <>
                        <span className={[s.gearGrade, s['gg-' + g2.grade]].join(' ')}>{GEAR_GRADE_KO[g2.grade]}{g2.plus > 0 && <em className="num"> +{g2.plus}</em>}</span>
                        <span className={s.gearFx}>{g2.effect}</span>
                      </> : <span className={s.gearFx}>비어 있음</span>}
                    </li>
                  );
                })}
              </ul>
              {set3 && set3.bonus > 0 && <p className={s.setNote}>{set3.name} 세트 {set3.count}부위 — 세트 능력치 +{set3.bonus}</p>}
            </dd>
          </div>
        </dl>
      </div>
    </Sheet>
  );
}

/* ───────── 등급 갤러리 ───────── */
function Gallery({ same }: { same: boolean }) {
  const [mode, setMode] = useState<'real' | 'same'>(same ? 'same' : 'real');
  const model = playerById('p01')!;
  const items = LADDER.map((g) => {
    if (mode === 'same') {
      const base = CARDS.find((c) => c.playerId === model.id)!;
      const fake: CardInst = {
        ...base,
        id: 'gal-' + g,
        grade: g,
        year: GRADES[g].yearTagged ? (GRADES[g].kind === 'award' ? 26 : 27) : undefined,
        award: g === 'th' ? '다승왕' : g === 'gg' ? '투수' : undefined,
        signaturePitch: GRADES[g].rank >= GRADES.rare.rank ? base.signaturePitch : undefined,
        enhance: Math.min(10, Math.max(0, GRADES[g].rank + 1)),
        dup: 0,
        isNew: false,
      };
      return { g, card: fake };
    }
    const mineFirst = CARDS.filter((c) => c.grade === g).sort((a, b) => Number(isOwned(b.id)) - Number(isOwned(a.id))).map((c) => ownedCard(c.id) ?? c);
    return { g, card: mineFirst[0] };
  }).filter((x) => x.card);

  return (
    <div className={s.page}>
      <header className={s.head}>
        <div className={s.titleRow}>
          <h1 className={['head', s.h1].join(' ')}>카드 등급</h1>
          <Link to="/cards" className={s.galleryLink}>보관함<Icon name="chevron" size={16} /></Link>
        </div>
        <p className={s.lead}>
          {mode === 'same'
            ? '같은 그림에 테 색 · 이름 띠 · 빛만 바뀌어요. 엘리트부터 테가 빛나요.'
            : '높은 등급일수록 테가 두꺼워지고 빛이 움직여요. 서열은 시그니처 > 블랙 > 프랜차이즈 > 엘리트 > 레전드 > 레어 > 스페셜 > 노멀.'}
        </p>
      </header>
      <div className={s.galleryBar}>
        <Tabs variant="box" size="s" items={[{ value: 'real', label: '실제 카드' }, { value: 'same', label: '같은 선수로' }]} value={mode} onChange={setMode} aria-label="보기" />
      </div>
      <ol className={s.ladder}>
        {items.map(({ g, card }, i) => (
          <li key={g} className={[s.rung, s['k-' + GRADES[g].kind]].join(' ')}>
            <Card {...cardProps(card!)} fluid dense isNew={false} onClick={() => navigate('/player/' + card!.playerId)} />
            <div className={s.rungCap}>
              <span className={['num', s.rungNo].join(' ')}>{String(i + 1).padStart(2, '0')}</span>
              <b style={{ color: `var(--gr-${g})` }}>{GRADES[g].ko}{LIMIT[g] && <em className="num">{LIMIT[g]}</em>}</b>
              <span>{LOOK[g]}</span>
            </div>
          </li>
        ))}
      </ol>
      <section className={s.minis}>
        <div className={s.minisHead}><h2 className="head">작은 카드</h2><span>라인업 경기장 위 · 촘촘한 목록</span></div>
        <div className={s.minisRow}>
          {items.map(({ g, card }, i) => (
            <CardMini key={g} {...cardProps(card!)} width={64} badge={i < 9 ? i + 1 : undefined} isNew={false} />
          ))}
        </div>
      </section>
      <section className={s.minis}>
        <div className={s.minisHead}><h2 className="head">뒷면</h2><span>뒤집기 전 — 높은 등급은 빛이 살짝 새어 나와요</span></div>
        <div className={s.minisRow}>
          {(['normal', 'rare', 'elite', 'legend', 'black', 'signature'] as GradeId[]).map((g) => (
            <CardBack key={g} grade={g} width={86} />
          ))}
        </div>
      </section>
      <p className={s.foot}>MVP · 골든글러브 · 타이틀 홀더는 시즌 수상으로 생기는 특별 등급이에요. 특별 선수는 리그에 한 장뿐이에요.</p>
    </div>
  );
}
