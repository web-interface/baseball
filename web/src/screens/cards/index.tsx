// 카드 보관함 — 담당: 카드 디자이너 (이 폴더 + src/cards)
//   #/cards            내 선수 카드 — 등급·포지션·구단 거르기, 정렬, 격자(3열·2열), 같은 카드 겹침, 누르면 크게(앞·뒤)
//   #/cards?gallery=1  등급 갤러리 — 11등급 + 특별 선수 한 화면 (실제 카드 / 같은 선수로 패럴렐 비교)
import { useCallback, useMemo, useState } from 'react';
import type { ScreenProps } from '../../app/screen';
import { Link, navigate } from '../../app/router';
import { Card, CardBack, CardMini, cardProps } from '../../cards';
import { GEAR_GRADE_KO, SLOT_KO, gearSet, slotsOf } from '../../cards';
import { Button, Emblem, Icon, Sheet, Tabs } from '../../ui';
import { avg as fmtAvg, level as fmtLevel, roman, yearTag } from '../../ui/format';
import { GRADES } from '../../game/grades';
import { POS_KO, ROLE_KO } from '../../game/labels';
import { CARDS, ME, MY_CARD_IDS, TEAMS, playerById, playerOfCard, teamById } from '../../game/mock';
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
  normal: '은회색 얇은 테 · 무광',
  special: '주황 금속 테 · 은은한 빛 띠',
  rare: '진홍 테 · 광택이 지나감 · 물결 무늬',
  elite: '보라 크롬 테를 따라 빛이 돎 · 프리즘',
  legend: '금박 테 · 방사선과 기요셰 문양',
  franchise: '구단색 테 · 금 FR 명판 · 핀스트라이프',
  black: '무광 검정 · 크롬 테에 빛이 스침',
  signature: '움직이는 무지개 홀로그램 테 · 친필 사인',
  mvp: '플래티넘 테 · 월계관 문장',
  gg: '금빛 가죽 테 · 황금 글러브 문장 · 바느질',
  th: '남색 에나멜 테 · 왕관 문장',
  unique: '진주빛 테 · 흑백 배경 · 세로 이름 띠',
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
  return <Collection openId={query.get('open')} openBack={query.get('back') === '1'} colsParam={query.get('cols')} sortParam={query.get('sort')} />;
}

function Collection({ openId, openBack, colsParam, sortParam }: { openId: string | null; openBack: boolean; colsParam: string | null; sortParam: string | null }) {
  const mine = useMemo(() => MY_CARD_IDS.map((id) => CARDS.find((c) => c.id === id)).filter(Boolean) as CardInst[], []);
  const [grade, setGrade] = useState<GradeId | 'all'>('all');
  const [pos, setPos] = useState<PosGroup>('all');
  const [team, setTeam] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>(() => (['ovr', 'grade', 'level', 'enh'] as const).find((k) => k === sortParam) ?? 'ovr');
  const [cols, setCols] = useState<2 | 3>(() => (colsParam === '2' ? 2 : colsParam === '3' ? 3 : readCols()));
  const [open, setOpen] = useState<CardInst | null>(() => (openId ? CARDS.find((c) => c.id === openId) ?? null : null));

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
  const filtered = grade !== 'all' || pos !== 'all' || team !== 'all';
  const reset = () => { setGrade('all'); setPos('all'); setTeam('all'); };
  const pickCols = (n: 2 | 3) => { setCols(n); saveCols(n); };
  const close = useCallback(() => setOpen(null), []);
  const pct = Math.round((ME.collection.have / ME.collection.total) * 100);

  return (
    <div className={s.page}>
      <header className={s.head}>
        <div className={s.titleRow}>
          <h1 className={['head', s.h1].join(' ')}>카드</h1>
          <Link to="/cards?gallery=1" className={s.galleryLink}>등급 갤러리<Icon name="chevron" size={16} /></Link>
        </div>
        <dl className={s.tally}>
          <div><dt>보유</dt><dd className="num">{mine.length}</dd></div>
          <div><dt>같은 카드</dt><dd className="num">{dupTotal}</dd></div>
          <div className={s.album}>
            <dt>도감</dt>
            <dd><span className="num">{ME.collection.have.toLocaleString('en-US')}</span><small className="num">/{ME.collection.total.toLocaleString('en-US')}</small></dd>
            <i className={s.albumBar} style={{ ['--p' as string]: pct + '%' }} aria-hidden />
          </div>
        </dl>
      </header>

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
        <div className={s.empty}>
          <p>이 조건에 맞는 카드가 없어요.</p>
          <Button variant="secondary" size="s" onClick={reset}>거르기 풀기</Button>
        </div>
      ) : (
        <ul className={[s.grid, cols === 2 ? s.two : s.three].join(' ')}>
          {list.map((c) => (
            <li key={c.id} className={s.cell}>
              <div className={[s.stack, c.dup > 0 && s.stacked, c.dup > 1 && s.stacked2].filter(Boolean).join(' ')}>
                <Card {...cardProps(c)} fluid onClick={() => setOpen(c)} />
              </div>
              {c.dup > 0 && (
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
        <Button variant="secondary" onClick={() => setBack((v) => !v)} icon="swap">{back ? '앞면 보기' : '뒷면 보기'}</Button>
        <Button onClick={() => { onClose(); navigate('/player/' + p.id); }}>선수 정보</Button>
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
              <b className="num">{fmtLevel(c.level)}</b>
              <small className="num">/ {g.levelMax} · {c.level >= g.levelMax ? '최고 레벨' : `다음 레벨까지 ${100 - lvPct}%`}</small>
            </dd>
          </div>
          <div className={s.fact}>
            <dt>같은 카드</dt>
            <dd>{c.dup > 0 ? <><b className="num">{c.dup + 1}</b>장 <small>— {c.dup}장은 강화·각성 재료</small></> : <small>한 장뿐이에요</small>}</dd>
          </div>
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
    const mineFirst = CARDS.filter((c) => c.grade === g).sort((a, b) => Number(MY_CARD_IDS.includes(b.id)) - Number(MY_CARD_IDS.includes(a.id)));
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
            ? '같은 그림에 테·포일·무늬만 바뀌어요. 실물 카드의 패럴렐처럼요.'
            : '높은 등급일수록 테가 두꺼워지고 빛이 움직여요. 서열은 시그니처 > 블랙 > 프랜차이즈 > 엘리트 > 레전드 > 레어 > 스페셜 > 노멀.'}
        </p>
      </header>
      <div className={s.galleryBar}>
        <Tabs variant="box" size="s" items={[{ value: 'real', label: '실제 카드' }, { value: 'same', label: '같은 선수로' }]} value={mode} onChange={setMode} aria-label="보기" />
      </div>
      <ol className={s.ladder}>
        {items.map(({ g, card }, i) => (
          <li key={g} className={[s.rung, s['k-' + GRADES[g].kind]].join(' ')}>
            <Card {...cardProps(card!)} fluid isNew={false} onClick={() => navigate('/player/' + card!.playerId)} />
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
