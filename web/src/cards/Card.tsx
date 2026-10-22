// 공용 카드 — 실물 트레이딩 카드처럼 '같은 그림, 등급마다 다른 포일·테·무늬'(패럴렐).
//   <Card {...cardProps(card)} size="m" />            앞면 (크기에 따라 배치가 바뀐다: 작은 목록 · 보통 · 상세)
//   <CardMini player={p} grade="rare" badge={1} />     라인업 경기장 위 작은 카드 (얼굴 크게)
//   <CardBack grade="signature" />                     뒷면 — 뽑기에서 뒤집기 전 (등급 빛이 살짝 비침)
//   <CardBack {...cardProps(card)} />                  선수가 있으면 '기록 뒷면' (대표 능력치 6 · 시즌 기록 · 장비)
//
// 층(아래 → 위): 경기장 사진 → (FR·블랙·특별) 바탕판 → 등급 무늬 → 선수 그림(배경 없는 컷아웃) → 인쇄 결
//               → 구단색 이름 띠 → 글자·표시 → 포일 → 반사광 → 안쪽 선 → 등급 테
// 크기는 모두 카드 너비 기준(cqw) — 56px 미니부터 300px 상세까지 같은 비율, 좁은 카드는 컨테이너 쿼리로 배치를 바꾼다.
import { memo, useEffect, useMemo, useRef, type CSSProperties, type KeyboardEvent } from 'react';
import type { CardInst, GradeId, Player, SignaturePitch, Team } from '../game/types';
import { GRADES } from '../game/grades';
import { POS_KO, handKo } from '../game/labels';
import { playerOfCard, teamById } from '../game/mock';
import { PlayerArt } from '../art/PlayerArt';
import { Emblem } from '../ui/Emblem';
import { avg as fmtAvg, era as fmtEra, ip as fmtIp, level as fmtLevel, roman, yearTag } from '../ui/format';
import {
  PARALLEL, awardPos, bandOf, cardCode, enName, enhanceTier, frameColorOf, isRookie, legendSpan, mockSerial, uniformOf, type Serial,
} from './meta';
import { GEAR_GRADE_KO, SLOT_KO, gearSet, mockGear, slotsOf, type GearPiece } from './gear';
import { attachMotion } from './motion';
import { Crest, GearGlyph, LeagueMark, PitchGlyph, ROSETTE, Star4, autographStroke, bandGeometry } from './parts';
import s from './Card.module.css';

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
}

/** CardInst → Card props (CardMini · CardBack 에도 그대로 펼쳐 넣을 수 있다) */
export function cardProps(c: CardInst) {
  const player = playerOfCard(c);
  const extra = c as CardInst & { gear?: GearPiece[]; serial?: Serial | null };
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
const isPitcher = (p: Player) => p.pos === 'P';

function labelOf(p: Player, grade: GradeId, year?: number, enhance = 0, level?: number) {
  const g = GRADES[grade];
  return [
    p.name, g.ko, year != null && g.yearTagged ? yearTag(year) : '', `종합 ${p.ovr}`,
    enhance > 0 ? `강화 ${roman(enhance)}` : '', level != null ? `레벨 ${fmtLevel(level)}` : '',
  ].filter(Boolean).join(' · ');
}

/* ───────── 오른쪽 위 묶음 — 연도 · 일련번호 · 홈/원정 ───────── */
function SerialChip({ serial, gold }: { serial: Serial; gold?: boolean }) {
  const g = gold || serial.match;
  return (
    <i className={[s.ser, g && s.serGold].filter(Boolean).join(' ')}>
      {String(serial.no).padStart(String(serial.of).length, '0')}/{serial.of}
      {serial.match && <small>MATCH</small>}
    </i>
  );
}

function Corner({ p, grade, year, serial, set }: { p: Player; grade: GradeId; year?: number; serial: Serial | null; set: 'home' | 'away' }) {
  const ha = <span className={s.ha}>{grade === 'legend' ? 'LEGEND' : set === 'away' ? 'AWAY' : 'HOME'}</span>;
  switch (grade) {
    case 'legend':
      return <><b className={[s.yr, s.yrSpan].join(' ')}>{legendSpan(p)}</b>{serial && <SerialChip serial={serial} gold />}{ha}</>;
    case 'franchise':
      return <><span className={s.frp}><b>FR</b><small>SINCE {yearTag(p.draftYear)}</small></span>{serial && <SerialChip serial={serial} gold />}{ha}</>;
    case 'black':
      return <><b className={s.yr}>BLK</b>{serial && <SerialChip serial={serial} />}{ha}</>;
    case 'signature':
      return <><b className={s.yr}>SIG</b>{serial && <SerialChip serial={serial} />}{ha}</>;
    case 'unique':
      return <><span className={s.one}><Star4 className={s.star} /><b className={s.yr}>1/1</b></span>{ha}</>;
    case 'mvp': case 'gg': case 'th':
      return <><b className={s.yr}>{yearTag(year ?? 26)}</b>{serial && <SerialChip serial={serial} />}{ha}</>;
    default:
      return <><b className={s.yr}>{yearTag(year ?? 27)}</b>{ha}</>;
  }
}

/* ───────── 앞면 ───────── */
function CardImpl(props: CardProps) {
  const {
    player, grade, year, level, enhance = 0, signaturePitch, award, team, size = 'm', width, fluid, showStats, selected, dimmed, isNew,
    onClick, className, style, cardId, serial, gear, set, live, still, eager,
  } = props;
  const t = team ?? teamById(player.teamId);
  const g = GRADES[grade];
  const w = width ?? WIDTH[size];
  const band = bandOf(t);
  const ref = useRef<HTMLDivElement>(null);
  const geo = bandGeometry(player.id);
  const en = useMemo(() => enName(player), [player]);
  const pos = posOf(player);
  const uni = set ?? (cardId ? uniformOf({ id: cardId, grade }) : 'home');
  const ser = serial !== undefined ? serial : cardId ? mockSerial(grade, cardId, player.number) : null;
  const tier = enhanceTier(enhance);
  const stats = showStats ?? (!fluid && w >= 220);
  const slots = slotsOf(player);
  const gearOn = gear && gear.length > 0 ? gear : null;
  const set3 = gearOn ? gearSet(gearOn) : null;
  const crestKind = grade === 'mvp' || grade === 'gg' || grade === 'th' ? grade : null;
  const awardYear = year ?? 26;
  // 영문 이름이 길면 글자를 줄여 띠 안에 맞춘다 (대문자 평균 폭 ≈ .62em)
  const enSize = Math.min(8, 56 / Math.max(1, en.length * 0.62));
  const lvMax = g.levelMax;

  useEffect(() => {
    if (!live || !ref.current) return;
    return attachMotion(ref.current, { max: w >= 220 ? 11 : 7, idle: true });
  }, [live, w]);

  return (
    <div
      ref={ref}
      className={[
        s.card, s['g-' + grade], fluid && s.fluid, live && s.live, still && s.still, crestKind && s.hasCrest, signaturePitch && s.hasPt,
        stats && s.hasStats, selected && s.selected, dimmed && s.dimmed, onClick && s.clickable, className,
      ].filter(Boolean).join(' ')}
      style={vars({
        width: fluid ? undefined : w,
        '--band': band.band,
        '--bline': band.line,
        '--tc1': t.colors.primary,
        '--tc2': t.colors.secondary,
        '--tc3': t.colors.accent,
        '--frc': frameColorOf(t),
        '--en': enSize.toFixed(2) + 'cqw',
        ...(style as Record<string, string | number | undefined>),
      })}
      data-roof={t.stadium.roof}
      role={onClick ? undefined : 'img'}
      aria-label={labelOf(player, grade, year, enhance, level)}
      {...clickable(onClick)}
    >
      <div className={s.tilt}>
        <div className={s.face}>
          {/* 1 경기장 사진 (흐린 배경) */}
          <div className={[s.l, s.scene].join(' ')} />
          {/* 2 바탕판 */}
          {grade === 'franchise' && (
            <div className={[s.l, s.plate].join(' ')}><Emblem team={t} className={s.wm} /></div>
          )}
          {grade === 'black' && <div className={[s.l, s.plate].join(' ')} />}
          {grade === 'unique' && <div className={[s.l, s.plate].join(' ')}><Star4 className={s.swm} fill="#fff" /></div>}
          {/* 3 등급 무늬 (인물 뒤에만) */}
          <div className={[s.l, s.pat].join(' ')} style={grade === 'legend' ? { ['--ros' as string]: ROSETTE } : undefined} />
          {grade === 'unique' && (
            <div className={s.strip}><i>ONE STAR</i><b>{player.name}</b></div>
          )}
          {/* 4 선수 (배경 없는 컷아웃) */}
          <div className={s.fig}>
            <PlayerArt player={player} team={t} variant="portrait" set={uni} eager={eager || live} className={s.art} />
          </div>
          {/* 5 인쇄 결 */}
          <div className={[s.l, s.grain].join(' ')} />
          {/* 6 이름 띠 */}
          <svg className={[s.l, s.band].join(' ')} viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden>
            <path className={s.bLine} d={geo.line} />
            <path className={s.bRough} d={geo.rough} />
            <path className={s.bClean} d={geo.clean} />
            <path className={s.bStreak} d={geo.streaks} />
            <g className={s.bDust}>{geo.dust.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} />)}</g>
          </svg>

          {/* 7 글자·표시 */}
          <div className={[s.c, s.brand].join(' ')} aria-hidden><LeagueMark className={s.mark} /><span>HANBYEOL</span></div>
          <div className={[s.c, s.tl].join(' ')}>
            {isRookie(player, grade) && <span className={s.rc}>RC</span>}
            {tier && <span className={[s.enh, s['enh-' + tier]].join(' ')} title={`강화 ${roman(enhance)}`}><b>{roman(enhance)}</b></span>}
            {gearOn && <span className={s.gearN} title={`장비 ${gearOn.length}/${slots.length}`}><GearGlyph slot="glove" />{gearOn.length}</span>}
          </div>
          <div className={[s.c, s.corner].join(' ')}>
            <Corner p={player} grade={grade} year={year} serial={ser} set={uni} />
          </div>
          <Emblem team={t} className={[s.c, s.emb].join(' ')} />
          {crestKind && (
            <div className={[s.c, s.crest].join(' ')}>
              <Crest kind={crestKind} year={awardYear} pos={awardPos(award, pos)} title={award} className={s.crestSvg} />
            </div>
          )}
          {grade === 'signature' && (
            <div className={[s.c, s.auto].join(' ')} aria-hidden>
              <span>{player.name}</span>
              <svg viewBox="0 0 100 16" preserveAspectRatio="none"><path d={autographStroke(player.id)} /></svg>
            </div>
          )}
          {gearOn && (
            <div className={[s.c, s.gear].join(' ')} title={gearOn.map((x) => `${SLOT_KO[x.slot]} ${GEAR_GRADE_KO[x.grade]}${x.plus ? ' +' + x.plus : ''}`).join(' · ')}>
              {slots.map((sl) => {
                const piece = gearOn.find((x) => x.slot === sl);
                return (
                  <i key={sl} className={piece ? [s.gOn, s['gg-' + piece.grade], piece.set && set3 && set3.bonus > 0 && piece.set === set3.name && s.gSet].filter(Boolean).join(' ') : s.gOff}>
                    <GearGlyph slot={sl} className={s.gIco} />
                  </i>
                );
              })}
            </div>
          )}
          <div className={[s.c, s.np].join(' ')}>
            <b className={s.en}>{en}</b>
            <span className={s.kr}>{player.name}</span>
            {signaturePitch && (
              <span className={s.pt} style={vars({ '--sig': signaturePitch.color })}>
                <PitchGlyph base={signaturePitch.base} className={s.ptIco} />
                <em>{signaturePitch.name}</em>
              </span>
            )}
            {level != null && <span className={[s.lvS, 'num'].join(' ')}>Lv {fmtLevel(level)}</span>}
          </div>
          <div className={[s.c, s.ovr].join(' ')}>
            <b className={s.ovrN}>{player.ovr}</b>
            <span className={s.ovrSide}>
              <i className={s.pos}>{pos}</i>
              {level != null && <em className={s.lv}>LV {fmtLevel(level)}</em>}
            </span>
          </div>
          <div className={[s.c, s.micro].join(' ')} aria-hidden>{cardCode(grade, t, player.number, year)} · {PARALLEL[grade]}</div>
          {stats && (
            <div className={[s.c, s.stats].join(' ')}>
              {player.face.map((f) => (
                <span key={f.code}><i>{f.ko}</i><b>{f.v}</b></span>
              ))}
              {level != null && (
                <em className={s.lvBar} style={vars({ '--p': `${Math.min(100, (level / lvMax) * 100).toFixed(1)}%` })} aria-hidden />
              )}
            </div>
          )}

          {/* 8 포일 · 9 반사광 · 10 안쪽 선 · 11 테 */}
          <div className={[s.l, s.foil].join(' ')} />
          <div className={[s.l, s.glare].join(' ')} />
          {grade === 'gg' && <div className={[s.l, s.stitch].join(' ')} />}
          <div className={[s.l, s.kl].join(' ')} />
          <div className={[s.l, s.frame].join(' ')} />
        </div>
      </div>
      {isNew && <span className={s.newTag}>NEW</span>}
    </div>
  );
}

export const Card = memo(CardImpl);

/* ───────── 작은 카드 — 라인업 경기장 위 · 촘촘한 목록 ───────── */
export interface CardMiniProps extends Partial<Omit<CardProps, 'player' | 'grade'>> {
  player: Player;
  grade: GradeId;
  /** 왼쪽 위 작은 숫자 (타순 등) */
  badge?: string | number;
  /** 아래 이름 줄 (기본 켬) */
  label?: boolean;
}

function CardMiniImpl({
  player, grade, enhance = 0, team, size = 's', width, fluid, badge, label = true, selected, dimmed, onClick, className, style, cardId, set, eager, isNew, year, level,
}: CardMiniProps) {
  const t = team ?? teamById(player.teamId);
  const w = width ?? WIDTH[size];
  const band = bandOf(t);
  const uni = set ?? (cardId ? uniformOf({ id: cardId, grade }) : 'home');
  const tier = enhanceTier(enhance);
  return (
    <div
      className={[s.card, s.mini, s['g-' + grade], fluid && s.fluid, selected && s.selected, dimmed && s.dimmed, onClick && s.clickable, className].filter(Boolean).join(' ')}
      style={vars({ width: fluid ? undefined : w, '--band': band.band, '--bline': band.line, '--tc1': t.colors.primary, '--tc2': t.colors.secondary, '--tc3': t.colors.accent, '--frc': frameColorOf(t), ...(style as Record<string, string | number | undefined>) })}
      data-roof={t.stadium.roof}
      role={onClick ? undefined : 'img'}
      aria-label={labelOf(player, grade, year, enhance, level)}
      {...clickable(onClick)}
    >
      <div className={s.tilt}>
        <div className={s.face}>
          <div className={[s.l, s.scene].join(' ')} />
          {grade === 'franchise' && <div className={[s.l, s.plate].join(' ')} />}
          {grade === 'black' && <div className={[s.l, s.plate].join(' ')} />}
          {grade === 'unique' && <div className={[s.l, s.plate].join(' ')} />}
          <div className={[s.l, s.pat].join(' ')} style={grade === 'legend' ? { ['--ros' as string]: ROSETTE } : undefined} />
          <div className={s.fig}>
            <PlayerArt player={player} team={t} variant="portrait" set={uni} eager={eager} className={s.art} />
          </div>
          <div className={[s.l, s.grain].join(' ')} />
          <div className={[s.c, s.mOvr].join(' ')}>
            <b>{player.ovr}</b>
            <i>{posOf(player)}</i>
          </div>
          {tier && <span className={[s.c, s.enh, s.mEnh, s['enh-' + tier]].join(' ')}><b>{roman(enhance)}</b></span>}
          {label && <div className={[s.c, s.mName].join(' ')}><b>{player.name}</b></div>}
          <div className={[s.l, s.foil].join(' ')} />
          <div className={[s.l, s.kl].join(' ')} />
          <div className={[s.l, s.frame].join(' ')} />
        </div>
      </div>
      {badge != null && <span className={[s.badge, 'num'].join(' ')}>{badge}</span>}
      {isNew && <span className={s.newTag}>NEW</span>}
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
  const { player: p, grade = 'normal', year, team, w, fluid, className, style, cardId, serial, gear, set, enhance = 0, level, signaturePitch, live } = props;
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
              {p.face.map((f) => (
                <li key={f.code}><span>{f.ko}</span><i style={vars({ '--v': `${f.v}%` })} /><b className="num">{f.v}</b></li>
              ))}
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
