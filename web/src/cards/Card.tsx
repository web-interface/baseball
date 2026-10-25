// 공용 카드 — 앞면은 SD 카드(마구마구식 한 틀: 등급 테 · 능력 유형 배경 · SD 선수 · 이름 띠), 뒷면은 기록 카드.
//   <Card {...cardProps(card)} size="m" />            앞면 (작은 카드는 컨테이너 쿼리로 잔표시를 감추고 글자를 키운다)
//   <CardMini player={p} grade="rare" badge={1} />     라인업 경기장 위 작은 카드 (같은 틀)
//   <CardBack grade="signature" />                     뒷면 — 뽑기에서 뒤집기 전 (등급 빛이 살짝 비침)
//   <CardBack {...cardProps(card)} />                  선수가 있으면 '기록 뒷면' (대표 능력치 6 · 시즌 기록 · 장비)
//
// 앞면 스타일은 SdCard.module.css, 뒷면은 Card.module.css. 크기는 모두 카드 너비 기준(cqw).
import { memo, useEffect, useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { cardNow } from '../screens/lineup/ctx';
import { shownTierOf, tierMark, type PotTier } from '../game/potential';
import { PotBadge } from '../ui/PotBadge';
import type { CardInst, GradeId, Player, SignaturePitch, Team } from '../game/types';
import { GRADES } from '../game/grades';
import { POS_KO, handKo } from '../game/labels';
import { playerOfCard, teamById } from '../game/mock';
import { PlayerArt } from '../art/PlayerArt';
import { Emblem } from '../ui/Emblem';
import { avg as fmtAvg, era as fmtEra, ip as fmtIp, level as fmtLevel, levelColor, roman, yearTag } from '../ui/format';
import { awardPos, bandOf, cardCode, enName, enhanceTier, frameColorOf, isRookie, mockSerial, uniformOf, type Serial } from './meta';
import { gearSet, mockGear, slotsOf, type GearPiece } from './gear';
import { attachMotion } from './motion';
import { Crest, Gem, Laurel, LeagueMark, Star4, autographStroke } from './parts';
import { CARD_BG, TYPE_KO, WxIcon, cardTypeOf, weatherOf, weatherTitle } from './front';
import s from './Card.module.css';
import c from './SdCard.module.css';

export type CardSize = 'xs' | 's' | 'm' | 'l' | 'xl';
const WIDTH: Record<CardSize, number> = { xs: 64, s: 92, m: 120, l: 168, xl: 240 };

export interface CardProps {
  player: Player;
  grade: GradeId;
  /** 시즌 등급·수상 연도 (27 → '27) */
  year?: number;
  /** 8.99 = 8레벨 99% */
  level?: number;
  /** 강화 0~10 → I~X */
  enhance?: number;
  /** 레어 이상 투수의 고유 구종 */
  signaturePitch?: SignaturePitch | null;
  /** 수상 내용 (TH '홈런왕', GG '우익수') */
  award?: string;
  /** 기본: 선수 소속 구단 */
  team?: Team;
  size?: CardSize;
  /** px 로 직접 (size 보다 우선) */
  width?: number;
  /** 너비를 부모 칸에 맞춤 (격자) — 배치는 실제 너비로 컨테이너 쿼리가 고른다 */
  fluid?: boolean;
  /** 대표 능력치 6 줄 (기본: 너비 220px 이상에서 보임) */
  showStats?: boolean;
  selected?: boolean;
  dimmed?: boolean;
  isNew?: boolean;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  /* ── 아래는 cardProps 가 채워 준다 (없어도 된다) ── */
  /** 카드 id — 번호·일련번호·유니폼 변형을 고정 */
  cardId?: string;
  /** 일련번호 (레전드 /99 · FR /50 · 블랙 /25 · 시그니처 /10 · 수상 /27 · 특별 1/1) */
  serial?: Serial | null;
  /** 끼고 있는 장비 */
  gear?: GearPiece[];
  /** 그림 유니폼 — 홈(흰색)·원정 */
  set?: 'home' | 'away';
  /** 포인터를 따라 빛·기울임 (상세·뽑기 공개처럼 한두 장일 때만) */
  live?: boolean;
  /** 테 움직임까지 멈춤 (아주 많은 장을 한 번에 그릴 때) */
  still?: boolean;
  /** 화면 밖이어도 그림을 바로 만든다 (곧 보일 때) */
  eager?: boolean;
  /** 훈련 단계 0~10 — 5단계부터 카드에 불빛, 10단계(최종)가 가장 화려 */
  train?: number;
  /** 켜진 잠재력 등급 — 별 하나 C · 둘 A · 셋 S (game/potential) — 앞면엔 별 배지(ui/PotBadge) */
  pot?: PotTier | null;
  /** 별 셋이 꺼짐 (1군 엔트리에서 2명만 · 벤치) — 배지를 흐리게 */
  potOff?: boolean;
  /** 종합 칸에 대신 보일 값 — 라인업에서 강화 · 훈련 · 잠재력 · 세트덱 · 케미까지 더한 종합 (오르면 초록 빛, 100 넘으면 10 단위 색) */
  ovrShown?: number;
  /** 대표 능력치에 더해진 값 (앞면 코드별 — game/cardBonus: 강화 · 훈련 · 잠재력 · 플레이스타일 · 세트덱) */
  faceUp?: Partial<Record<string, number>>;
  /** 촘촘한 목록용 가벼운 효과 — 화면을 다시 칠하는 비싼 움직임(테두리 회전 · 홀로 · 번개 …)은 끄고 GPU 로 도는 것만 */
  lite?: boolean;
  /** 아주 촘촘한 목록(보관함 격자) — 겹 장식(홀로 · 반짝이 · 불씨 · 섬광 · 번개)을 빼고 테두리 빛 · 칩만 */
  dense?: boolean;
}
/* ───────── 성능 — 화면 밖 카드는 움직임을 멈춘다 (관찰자 하나로 모든 카드 · data-off → CSS 가 animation 을 멈춤) ───────── */
let offIo: IntersectionObserver | null = null;
function watchOff(el: HTMLElement | null) {
  if (!el || typeof IntersectionObserver === 'undefined') return undefined;
  offIo ??= new IntersectionObserver((es) => {
    for (const e of es) {
      const t = e.target as HTMLElement;
      if (e.isIntersecting) delete t.dataset.off;
      else t.dataset.off = '1';
    }
  }, { rootMargin: '160px 0px' });
  offIo.observe(el);
  return () => { offIo?.unobserve(el); };
}

/** 대표 능력치 숫자 — 더해진 값까지 (오르면 초록, 100 넘으면 10 단위 색) */
function faceVal(v: number, up?: number) {
  const add = Math.round(up ?? 0);
  const t = v + add;
  const cls = t >= 140 ? 'o140' : t >= 130 ? 'o130' : t >= 120 ? 'o120' : t >= 110 ? 'o110' : t >= 100 ? 'o100' : add > 0 ? 'statUp' : '';
  return { t, cls };
}
/** 종합 칸 꾸밈 — 더해진 값이면 오름/내림 + 100 넘는 10 단위 색 */
function ovrCls(base: number, shown?: number): string[] {
  if (shown == null) return [];
  const t = shown >= 140 ? 'o140' : shown >= 130 ? 'o130' : shown >= 120 ? 'o120' : shown >= 110 ? 'o110' : shown >= 100 ? 'o100' : null;
  return [shown > base ? 'ovrUp' : shown < base ? 'ovrDown' : '', t ?? ''].filter(Boolean);
}

/** 카드의 훈련 단계 (보유 카드 저장의 train.lv — 없으면 0) */
/** 켜진 잠재력 등급 (없으면 null) — 돌리는 연출 중엔 전의 것 · 별 둘부터 못 받는 등급은 별 하나로 */
export const potTierOf = (c: Pick<CardInst, 'id' | 'grade'>): PotTier | null => shownTierOf(c);
function nowOf(c: CardInst, player: Player): { ovrShown?: number; faceUp?: Partial<Record<string, number>>; potOff?: boolean } {
  const now = cardNow(c);
  if (!now) return {};
  return { ovrShown: now.ovr !== player.ovr ? now.ovr : undefined, faceUp: Object.keys(now.bonus.total).length ? now.bonus.total : undefined, potOff: now.potOff || undefined };
}
export const trainLvOf = (c: unknown) => {
  const v = (c as { train?: { lv?: number } } | null | undefined)?.train?.lv ?? 0;
  return Math.max(0, Math.min(10, Math.floor(Number(v) || 0)));
};
/** 훈련 불빛 색 — 5 하늘 · 6 초록 · 7 금 · 8 주황 · 9 빨강 · 10 흰 빛(무지개 고리) */
const TRAIN_GLOW = ['', '', '', '', '', '#4fd8ff', '#4cf0a0', '#ffd84a', '#ff9a3c', '#ff4f6b', '#ffffff'];

/** CardInst → Card props (CardMini · CardBack 에도 그대로 펼쳐 넣을 수 있다) */
const ovrCache = new Map<string, Player>();
/** 카드 종합 · 등급 보정(대표 능력치마다 +boost — 특별 등급의 기본 능력치)을 얹은 보기 */
function withOvr(p: Player, ovr: number, boost = 0): Player {
  const k = `${p.id}|${ovr}|${boost}`;
  let v = ovrCache.get(k);
  if (!v) { v = { ...p, ovr, ...(boost ? { face: p.face.map((f) => ({ ...f, v: f.v + boost })) } : {}) }; ovrCache.set(k, v); }
  return v;
}

export function cardProps(c: CardInst) {
  const base = playerOfCard(c);
  // 카드마다 종합이 다르다 (CardInst.ovr) — 같은 선수라도 윗 등급이 더 높게
  const player = (c.ovr != null && c.ovr !== base.ovr) || c.boost ? withOvr(base, c.ovr ?? base.ovr, c.boost ?? 0) : base;
  const extra = c as Omit<CardInst, 'gear'> & { gear?: GearPiece[]; serial?: Serial | null };
  return {
    player,
    grade: c.grade,
    year: c.year,
    level: c.level,
    enhance: c.enhance,
    signaturePitch: c.signaturePitch ?? null,
    award: c.award,
    isNew: c.isNew,
    cardId: c.id,
    serial: extra.serial !== undefined ? extra.serial : mockSerial(c.grade, c.id, player.number),
    gear: extra.gear ?? mockGear(c, player),
    set: uniformOf(c),
    train: trainLvOf(c),
    pot: potTierOf(c),
    // 지금 값 — 라인업이면 라인업 종합, 아니면 카드 자체 보너스까지 (screens/lineup/ctx — 어디서 보든 같은 숫자)
    ...nowOf(c, player),
  } satisfies Partial<CardProps>;
}

function clickable(onClick?: () => void) {
  if (!onClick) return {};
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick,
    onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } },
  };
}

const vars = (o: Record<string, string | number | undefined>) => o as CSSProperties;
const posOf = (p: Player) => (p.pos === 'P' ? p.role ?? 'P' : p.pos);

function labelOf(p: Player, grade: GradeId, year?: number, enhance = 0, level?: number) {
  const g = GRADES[grade];
  return [
    p.name, g.ko, year != null && g.yearTagged ? yearTag(year) : '', `종합 ${p.ovr}`,
    enhance > 0 ? `강화 ${roman(enhance)}` : '', level != null ? `레벨 ${fmtLevel(level)}` : '',
  ].filter(Boolean).join(' · ');
}

/* ───────── 앞면 — SD 카드(마구마구식 한 틀) ─────────
 * 등급 테 → 능력 유형 배경(파워형 용암 · 스피드형 번개 …) + SD 선수 → 이름 띠 '연도 이름' · 등급
 * 칩: 왼쪽 위 종합 · 강화 · RC / 오른쪽 위 날씨 체질 동그라미(수상 카드는 문장) · 일련번호 / 아래 레벨 · 고유 구종 · 포지션
 * 엘리트부터 테가 빛나고(바깥 빛 + 안쪽 빛 선 + 흐르는 빛), 엘리트 · 레전드 · 블랙 · 시그니처 · 특별은 빛이 숨 쉬듯.
 * 빛나는 등급(GLOW)은 훈련해도 등급 빛을 지키고, 훈련 단계는 테 바깥 가는 색 선 + '훈련 N' 표로만 (SdCard.module.css '.trained.glow') */
const GLOW = new Set<GradeId>(['elite', 'legend', 'franchise', 'black', 'signature', 'mvp', 'gg', 'th', 'unique']);
const PULSE = new Set<GradeId>(['elite', 'legend', 'black', 'signature', 'unique']);
/* ───────── 등급 명판 — 맨 위 가운데. 큰 카드는 이름(BLACK …), 작은 카드는 짧은 표(BK …) — 여섯 등급이 한눈에 갈리게 ─────────
 * 엘리트 자수정 판+다이아 · 블랙 크롬 글자 · 시그니처 프리즘 포일 · MVP 남색+금 월계수 · 프랜차이즈 구단색+엠블럼 · 특별 진주+별 (레전드는 원래 LEGEND 명판)
 * 특별 선수는 SPECIAL 이 아니라 ONLY ONE — 스페셜(주황) 등급 이름과 헷갈리지 않게 */
const PLATE: Partial<Record<GradeId, readonly [string, string]>> = {
  elite: ['ELITE', 'ELITE'], black: ['BLACK', 'BK'], signature: ['SIGNATURE', 'SIG'], mvp: ['MVP', 'MVP'], franchise: ['FRANCHISE', 'FR'], unique: ['ONLY ONE', '1/1'],
};
function GradePlate({ grade, team }: { grade: GradeId; team: Team }) {
  const p = PLATE[grade];
  if (!p) return null;
  return (
    <span className={[c.plate, c['pl-' + grade]].join(' ')} aria-hidden>
      {grade === 'mvp' && <Laurel className={c.plLeaf} />}
      {grade === 'franchise' && <Emblem team={team} size={20} decorative className={c.plEmb} />}
      {grade === 'unique' && <Star4 className={c.plStar} />}
      {grade === 'elite' && <Gem className={c.plGem} />}
      <b className={c.plL}>{p[0]}</b>
      <b className={c.plS}>{p[1]}</b>
      {grade === 'mvp' && <Laurel className={c.plLeaf} flip />}
      {grade === 'elite' && <Gem className={c.plGem} />}
    </span>
  );
}
/** 프랜차이즈 — 구단 테 색 · 이름 띠 색(흰 글자가 읽히는 띠) · 띠 위 선 · 빛 */
function frVars(t: Team) {
  const b = bandOf(t);
  return { '--tf': frameColorOf(t), '--fband': b.band, '--fline': b.line };
}
/** 시그니처 — 그림 위 네 갈래 별빛 (큰 카드는 반짝, 작은 카드는 멈춘 채) */
const Stars = () => <i className={c.stars} aria-hidden><i /><i /><i /><i /><i /></i>;

/** 이름 띠 글자 크기(cqw) — 긴 이름은 줄여서 한 줄에. 한글 1em · 숫자·영문 .62em 으로 셈 */
function nameFit(text: string, base: number, room: number) {
  let em = 0;
  for (const ch of text) em += /[ㄱ-힝]/.test(ch) ? 1 : ch === ' ' ? 0.3 : 0.62;
  return Math.min(base, room / Math.max(1, em)).toFixed(2) + 'cqw';
}

function CardImpl(props: CardProps) {
  const {
    player, grade, year, level, enhance = 0, signaturePitch, award, team, size = 'm', width, fluid, showStats, selected, dimmed, isNew,
    onClick, className, style, cardId, serial, set, live, still, eager, train = 0, pot = null, potOff, ovrShown, faceUp, lite, dense,
  } = props;
  const t = team ?? teamById(player.teamId);
  const g = GRADES[grade];
  const w = width ?? WIDTH[size];
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => watchOff(ref.current), []);
  const pos = posOf(player);
  const uni = set ?? (cardId ? uniformOf({ id: cardId, grade }) : 'home');
  const ser = serial !== undefined ? serial : cardId ? mockSerial(grade, cardId, player.number) : null;
  const tier = enhanceTier(enhance);
  const stats = showStats ?? (!fluid && w >= 220);
  const crestKind = grade === 'mvp' || grade === 'gg' || grade === 'th' ? grade : null;
  const type = cardTypeOf(player);
  const wx = weatherOf(player);
  const yy = year != null && g.yearTagged ? String(year).slice(-2) : '';
  const rookie = isRookie(player, grade);
  const glow = GLOW.has(grade);
  const tl = Math.max(0, Math.min(10, train));

  useEffect(() => {
    if (!live || !ref.current) return;
    return attachMotion(ref.current, { max: w >= 220 ? 11 : 7, idle: true });
  }, [live, w]);

  return (
    <div
      ref={ref}
      className={[
        c.card, c['g-' + grade], glow && c.glow, PULSE.has(grade) && c.pulse, fluid && c.fluid, live && c.live, still && c.still, (lite || dense) && c.lite, dense && c.dense,
        stats && c.hasStats, selected && c.selected, dimmed && c.dimmed, onClick && c.clickable,
        tl >= 5 && c.trained, tl >= 8 && c.trainHi, tl >= 10 && c.trainMax, className,
      ].filter(Boolean).join(' ')}
      style={vars({
        width: fluid ? undefined : w,
        '--tglow': tl >= 5 ? TRAIN_GLOW[tl] : undefined,
        '--tc1': t.colors.primary,
        '--tc2': t.colors.secondary,
        ...(grade === 'franchise' ? frVars(t) : null),
        '--nm': nameFit(`${yy} ${player.name}`, 7.8, 60),
        ...(style as Record<string, string | number | undefined>),
      })}
      role={onClick ? undefined : 'img'}
      aria-label={labelOf(player, grade, year, enhance, level)}
      {...clickable(onClick)}
    >
      {(glow || tl >= 5) && <i className={c.aura} aria-hidden />}
      {tl >= 8 && <i className={c.embers} aria-hidden />}
      <div className={c.frame}>
        <div className={c.panel} />
        <div className={c.art} style={{ backgroundImage: `url(${CARD_BG[type]})` }} title={TYPE_KO[type]}>
          {grade === 'franchise' && <span className={c.frMark} aria-hidden><Emblem team={t} size={96} decorative /></span>}
          <div className={c.fig}>
            <PlayerArt player={player} team={t} variant="portrait" set={uni} eager={eager || live} />
          </div>
          <b className={[c.chip, c.ovr, ...ovrCls(player.ovr, ovrShown).map((k) => c[k])].join(' ')} title={ovrShown != null && ovrShown !== player.ovr ? `카드 종합 ${player.ovr} → 라인업 ${ovrShown}` : undefined}>{ovrShown ?? player.ovr}</b>
          {(tier || rookie || tl > 0 || pot) && (
            <div className={c.left}>
              {tier && <span className={[c.enh, c['enh-' + tier]].join(' ')} title={`강화 ${roman(enhance)}`}>{roman(enhance)}</span>}
              {tl > 0 && <span className={[c.tr, tl >= 5 && c.trLit, tl >= 10 && c.trMax].filter(Boolean).join(' ')} title={`훈련 ${tl}단계`}>{tl >= 10 ? '훈련 MAX' : `훈련 ${tl}`}</span>}
              {pot && <PotBadge tier={pot} size="fit" off={potOff} className={c.potc} title={`잠재력 ${tierMark(pot)}${potOff ? ' · 꺼짐' : ''}`} />}
              {rookie && <span className={c.rc}>RC</span>}
            </div>
          )}
          {(glow || tl >= 5) && <i className={c.holo} aria-hidden />}
          {(glow || tl >= 5) && <i className={c.sparks} aria-hidden />}
          {(grade === 'signature' || grade === 'elite') && <Stars />}
          {grade === 'black' && <i className={c.zap} aria-hidden />}
          {crestKind && (
            <div className={c.crest}>
              <Crest kind={crestKind} year={year ?? 26} pos={awardPos(award, pos)} title={award} />
            </div>
          )}
          {grade === 'signature' && (
            <div className={c.auto} aria-hidden>
              <svg viewBox="0 0 100 16" preserveAspectRatio="none"><path pathLength={100} d={autographStroke(player.id)} /></svg>
            </div>
          )}
          {signaturePitch && (
            <span className={[c.chip, c.pt].join(' ')} style={vars({ '--sig': signaturePitch.color })}><i />{signaturePitch.name}</span>
          )}
          {level != null && <span className={[c.chip, c.lv, level >= 8 && c.lvHi].filter(Boolean).join(' ')} style={vars({ '--lvc': levelColor(level) })}>Lv {Math.floor(level)}</span>}
          <span className={[c.chip, c.pos].join(' ')}>{pos}</span>
          {stats && (
            <div className={c.stats}>
              {player.face.map((f) => { const x = faceVal(f.v, faceUp?.[f.code]); return <span key={f.code}><i>{f.ko}</i><b className={x.cls ? c[x.cls] : undefined}>{x.t}</b></span>; })}
            </div>
          )}
        </div>
        <div className={c.bar}>
          <b>{yy && <small>{yy}</small>}{player.name}</b>
          <em>{g.ko}</em>
        </div>
        {!crestKind && (
          <span className={c.wx} title={weatherTitle(player)}><i><WxIcon k={wx} /></i></span>
        )}
        {ser && (
          <span className={c.serBox}>
            <i className={[c.chip, c.ser, (ser.match || grade === 'legend' || grade === 'franchise') && c.serGold].filter(Boolean).join(' ')}>
              {String(ser.no).padStart(String(ser.of).length, '0')}/{ser.of}
            </i>
          </span>
        )}
        <GradePlate grade={grade} team={t} />
        {grade === 'legend' && <span className={c.lgd}>LEGEND</span>}
        {glow && <i className={c.shine} aria-hidden />}
        {/* 테를 도는 전기 — 블랙(얼음 파랑 두 줄) · 훈련 MAX 는 빛나지 않는 등급만(무지개 한 줄). 빛나는 등급은 훈련 MAX 여도 등급 빛 그대로 */}
        {(grade === 'black' || (tl >= 10 && !glow)) && <i className={c.bolt} aria-hidden />}
        {(grade === 'black' || (tl >= 10 && !glow)) && <i className={[c.bolt, c.bolt2].join(' ')} aria-hidden />}
        {(glow || tl >= 5) && <i className={c.glint} aria-hidden />}
      </div>
      {isNew && <span className={c.newTag}>NEW</span>}
    </div>
  );
}

export const Card = memo(CardImpl);

/* ───────── 작은 카드 — 라인업 경기장 위 · 촘촘한 목록 (같은 틀, 글자 크게) ───────── */
export interface CardMiniProps extends Partial<Omit<CardProps, 'player' | 'grade'>> {
  player: Player;
  grade: GradeId;
  /** 왼쪽 위 작은 숫자 (타순 등) */
  badge?: string | number;
  /** 아래 이름 줄 (기본 켬) */
  label?: boolean;
}

function CardMiniImpl({
  player, grade, enhance = 0, team, size = 's', width, fluid, badge, label = true, selected, dimmed, onClick, className, style, cardId, set, eager, isNew, year, level, still, train = 0, pot = null, potOff, ovrShown,
}: CardMiniProps) {
  const t = team ?? teamById(player.teamId);
  const w = width ?? WIDTH[size];
  const miniRef = useRef<HTMLDivElement>(null);
  useEffect(() => watchOff(miniRef.current), []);
  const uni = set ?? (cardId ? uniformOf({ id: cardId, grade }) : 'home');
  const tier = enhanceTier(enhance);
  const type = cardTypeOf(player);
  const wx = weatherOf(player);
  const glow = GLOW.has(grade);
  const tl = Math.max(0, Math.min(10, train));
  const yy = year != null ? String(year).slice(-2) : '';
  return (
    <div
      ref={miniRef}
      className={[
        c.card, c.mini, c.lite, c['g-' + grade], glow && c.glow, PULSE.has(grade) && c.pulse, !label && c.noBar, fluid && c.fluid, still && c.still,
        selected && c.selected, dimmed && c.dimmed, onClick && c.clickable,
        tl >= 5 && c.trained, tl >= 8 && c.trainHi, tl >= 10 && c.trainMax, className,
      ].filter(Boolean).join(' ')}
      style={vars({
        width: fluid ? undefined : w,
        '--tglow': tl >= 5 ? TRAIN_GLOW[tl] : undefined,
        '--tc1': t.colors.primary,
        '--tc2': t.colors.secondary,
        ...(grade === 'franchise' ? frVars(t) : null),
        '--nm': nameFit(`${yy} ${player.name}`, 7.8, 70),
        '--nmS': nameFit(`${yy} ${player.name}`, 11, 84),
        ...(style as Record<string, string | number | undefined>),
      })}
      role={onClick ? undefined : 'img'}
      aria-label={labelOf(player, grade, year, enhance, level)}
      {...clickable(onClick)}
    >
      {(glow || tl >= 5) && <i className={c.aura} aria-hidden />}
      <div className={c.frame}>
        <div className={c.panel} />
        <div className={c.art} style={{ backgroundImage: `url(${CARD_BG[type]})` }}>
          <div className={c.fig}>
            <PlayerArt player={player} team={t} variant="portrait" set={uni} eager={eager} />
          </div>
          <b className={[c.chip, c.ovr, ...ovrCls(player.ovr, ovrShown).map((k) => c[k])].join(' ')} title={ovrShown != null && ovrShown !== player.ovr ? `카드 종합 ${player.ovr} → 라인업 ${ovrShown}` : undefined}>{ovrShown ?? player.ovr}</b>
          {(tier || tl > 0 || pot) && (
            <div className={c.left}>
              {tier && <span className={[c.enh, c['enh-' + tier]].join(' ')} title={`강화 ${roman(enhance)}`}>{roman(enhance)}</span>}
              {tl > 0 && <span className={[c.tr, tl >= 5 && c.trLit, tl >= 10 && c.trMax].filter(Boolean).join(' ')} title={`훈련 ${tl}단계`}>{tl >= 10 ? 'MAX' : `T${tl}`}</span>}
              {pot && <PotBadge tier={pot} size="fit" off={potOff} className={c.potc} title={`잠재력 ${tierMark(pot)}${potOff ? ' · 꺼짐' : ''}`} />}
            </div>
          )}
          {(glow || tl >= 5) && <i className={c.holo} aria-hidden />}
          {grade === 'signature' && <Stars />}
          {grade === 'black' && <i className={c.zap} aria-hidden />}
          <span className={[c.chip, c.pos].join(' ')}>{posOf(player)}</span>
        </div>
        {label && <div className={c.bar}><b>{yy && <small>{yy}</small>}{player.name}</b></div>}
        <span className={c.wx} title={weatherTitle(player)}><i><WxIcon k={wx} /></i></span>
        <GradePlate grade={grade} team={t} />
        {glow && <i className={c.shine} aria-hidden />}
        {(grade === 'black' || (tl >= 10 && !glow)) && <i className={c.bolt} aria-hidden />}
        {(glow || tl >= 5) && <i className={c.glint} aria-hidden />}
      </div>
      {badge != null && <span className={[c.badge, 'num'].join(' ')}>{badge}</span>}
      {isNew && <span className={c.newTag}>NEW</span>}
    </div>
  );
}

export const CardMini = memo(CardMiniImpl);

/* ───────── 뒷면 ───────── */
export interface CardBackProps extends Partial<Omit<CardProps, 'grade'>> {
  /** 뒤집기 전에 살짝 비치는 등급 빛 (선수가 없을 때) · 기록 뒷면에선 등급 이름 */
  grade?: GradeId;
}

function FaceDown({ grade, w, fluid, className, style }: { grade?: GradeId; w: number; fluid?: boolean; className?: string; style?: CSSProperties }) {
  return (
    <div
      className={[s.card, s.back, grade && s['glow-' + grade], fluid && s.fluid, className].filter(Boolean).join(' ')}
      style={{ width: fluid ? undefined : w, ...style }}
      role="img"
      aria-label="카드 뒷면"
    >
      <div className={s.tilt}>
        <div className={s.face}>
          <div className={[s.l, s.bkPat].join(' ')} />
          <div className={[s.l, s.bkRule].join(' ')} />
          <div className={s.bkCenter}>
            <LeagueMark className={s.bkMark} />
            <b>HANBYEOL</b>
            <span>BASEBALL MANAGER</span>
          </div>
          <span className={[s.bkYear, 'num'].join(' ')}>2027</span>
          <div className={[s.l, s.kl].join(' ')} />
          <div className={[s.l, s.frame, s.bkFrame].join(' ')} />
        </div>
      </div>
    </div>
  );
}

function statLine(p: Player): { head: string[]; vals: string[] } {
  if (p.season.pit) {
    const x = p.season.pit;
    const third = p.role === 'CL' ? ['세이브', String(x.sv)] : p.role === 'RP' ? ['홀드', String(x.hld)] : ['승-패', `${x.w}-${x.l}`];
    return { head: ['경기', third[0], '평균자책', '이닝', '탈삼진', 'WHIP'], vals: [String(x.g), third[1], fmtEra(x.era), fmtIp(x.ip), String(x.so), fmtEra(x.whip)] };
  }
  const b = p.season.bat;
  if (!b) return { head: [], vals: [] };
  return { head: ['경기', '타율', '홈런', '타점', '도루', 'OPS'], vals: [String(b.g), fmtAvg(b.avg), String(b.hr), String(b.rbi), String(b.sb), fmtAvg(b.ops)] };
}

function InfoBack(props: CardBackProps & { player: Player; w: number }) {
  const { player: p, grade = 'normal', year, team, w, fluid, className, style, cardId, serial, gear, set, enhance = 0, level, signaturePitch, live, faceUp } = props;
  const t = team ?? teamById(p.teamId);
  const band = bandOf(t);
  const g = GRADES[grade];
  const ref = useRef<HTMLDivElement>(null);
  const ser = serial !== undefined ? serial : cardId ? mockSerial(grade, cardId, p.number) : null;
  const uni = set ?? (cardId ? uniformOf({ id: cardId, grade }) : 'home');
  const sorted = [...p.face].sort((a, b) => b.v - a.v);
  const line = statLine(p);
  const gearOn = gear ?? [];
  const set3 = gearOn.length ? gearSet(gearOn) : null;
  const intro = [p.traits.join(' · '), p.personality].filter(Boolean).join(' — ');
  const form = p.form.pitch ?? p.form.bat;

  useEffect(() => {
    if (!live || !ref.current) return;
    return attachMotion(ref.current, { max: 8, idle: false });
  }, [live]);

  return (
    <div
      ref={ref}
      className={[s.card, s.info, fluid && s.fluid, live && s.live, className].filter(Boolean).join(' ')}
      style={vars({ width: fluid ? undefined : w, '--band': band.band, '--bline': band.line, ...(style as Record<string, string | number | undefined>) })}
      aria-label={`${p.name} 카드 뒷면 — 대표 능력치와 시즌 기록`}
    >
      <div className={s.tilt}>
        <div className={s.face}>
          <div className={[s.l, s.paper].join(' ')} />
          <div className={s.ibTop}>
            <div className={s.ibNo}><span>NO.</span><b className="num">{String(p.number).padStart(2, '0')}</b></div>
            <div className={s.ibName}><b>{enName(p)}</b><span>{p.name} · {g.ko}{year != null && g.yearTagged ? ' ' + yearTag(year) : ''}</span></div>
            <Emblem team={t} className={s.ibEmb} />
          </div>
          <div className={s.ibMeta}>
            <span>{t.name}</span>
            <span>{p.pos === 'P' ? (p.role === 'SP' ? '선발 투수' : p.role === 'CL' ? '마무리 투수' : '불펜 투수') : POS_KO[p.pos]}</span>
            <span>{handKo(p.throws, p.bats)}</span>
            <span>{p.age}세</span>
            <span>{p.heightCm}cm · {p.weightKg}kg</span>
            <span>입단 {yearTag(p.draftYear)}</span>
          </div>
          <div className={s.ibMid}>
            <div className={s.ibOvr}>
              <b className="num">{p.ovr}</b>
              <span>OVR</span>
              {enhance > 0 && <em>강화 {roman(enhance)}</em>}
              {level != null && <em className="num">LV {fmtLevel(level)}</em>}
            </div>
            <ul className={s.ibStats}>
              {p.face.map((f) => {
                const x = faceVal(f.v, faceUp?.[f.code]);
                return <li key={f.code}><span>{f.ko}</span><i style={vars({ '--v': `${Math.min(100, x.t)}%` })} /><b className={['num', x.cls && s[x.cls]].filter(Boolean).join(' ')}>{x.t}</b></li>;
              })}
            </ul>
          </div>
          {line.head.length > 0 && (
            <table className={s.ibTable}>
              <thead><tr><th>’27</th>{line.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody><tr><td>{t.short}</td>{line.vals.map((v, i) => <td key={i} className="num">{v}</td>)}</tr></tbody>
            </table>
          )}
          <p className={s.ibText}>
            {signaturePitch ? <><b>{signaturePitch.name}</b> {signaturePitch.effect}. </> : null}
            {intro}{form ? ` · ${form}` : ''}
          </p>
          <div className={s.ibKv}>
            <span><b>강점</b>{sorted[0].ko} · {sorted[1].ko}</span>
            <span><b>보완</b>{sorted[sorted.length - 1].ko}</span>
            <span><b>장비</b>{gearOn.length}/{slotsOf(p).length}{set3 && set3.bonus > 0 ? ` · ${set3.name} 세트 +${set3.bonus}` : ''}</span>
          </div>
          <div className={s.ibFoot}>
            <span className="num">{cardCode(grade, t, p.number, year)}{ser ? ` · ${ser.no}/${ser.of}` : ''} · {uni === 'away' ? 'AWAY' : 'HOME'}</span>
            <span>ⓒ 2027 야구 매니저 · 한별 리그<br />등장하는 선수·구단은 모두 가상입니다</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 카드 뒷면 — 선수가 없으면 뽑기용 뒷면, 있으면 기록 뒷면 */
function CardBackImpl(props: CardBackProps) {
  const w = props.width ?? WIDTH[props.size ?? 'm'];
  if (props.player) return <InfoBack {...props} player={props.player} w={w} />;
  return <FaceDown grade={props.grade} w={w} fluid={props.fluid} className={props.className} style={props.style} />;
}

export const CardBack = memo(CardBackImpl);
