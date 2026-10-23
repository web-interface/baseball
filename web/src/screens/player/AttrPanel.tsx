// 능력치 탭 — 고유 구종 · 구종표 · FM 능력치 묶음 · 특성 · 숨은 특성 · 폼 · 날씨 궁합
import { useMemo, type CSSProperties } from 'react';
import { Icon, fmt } from '../../ui';
import { ATTR_GROUPS, ATTR_KO, PITCH_KO, toFm } from '../../game/labels';
import type { AttrKey, CardInst, GradeId, Player } from '../../game/types';
import { isRarePlus } from '../../game/grades';
import { Sec } from './common';
import { LIcon, PitchPath } from './icons';
import { BatFormCells, PitchFormCells } from './diagrams';
import {
  WEATHER_ROWS, attrBonus, formOf, hiddenOf, pitchBonus, rng, traitInfo, weatherToday, weatherWord, type TraitCat,
} from './local-mock';
import s from './attr.module.css';

export type Scale = 'fm' | '100';

const CAT_ICON: Record<TraitCat, 'bat' | 'steal' | 'glove' | 'pitch' | 'users'> = { 타격: 'bat', 주루: 'steal', 수비: 'glove', 투구: 'pitch', 덕아웃: 'users' };

/** 색 띠 단계 (값을 5등분한 눈금으로 계산 — 화면 숫자는 모두 1~100) */
const band = (fm: number) => (fm >= 16 ? 5 : fm >= 13 ? 4 : fm >= 9 ? 3 : fm >= 6 ? 2 : 1);

export interface AttrPanelProps {
  p: Player;
  card: CardInst;
  grade: GradeId;
  owned: boolean;
  mineCount: number;
  enh: number;
  playstyle: string | null;
  gearPer: Record<string, number>;
  scale: Scale;
  onScale: (s: Scale) => void;
}

/** 짧은 이름표 (3열 칸에 맞게) */
const SHORT: Partial<Record<AttrKey, string>> = {
  contactR: '컨택 (우투)', contactL: '컨택 (좌투)', vsFast: '강속구 대처', vsBreak: '변화구 대처', baserunning: '주루 판단', stealJump: '도루 스타트',
  firstStep: '첫발 반응', armStr: '송구 강도', armAcc: '송구 정확', turnDP: '병살 처리', pitcherLead: '투수 리드', popTime: '도루 저지',
  competitiveness: '승부욕', baseballIQ: '야구 지능', pFielding: '투수 수비', slideStep: '퀵모션',
};

export function AttrPanel({ p, card, grade, owned, mineCount, enh, playstyle, gearPer, scale, onScale }: AttrPanelProps) {
  const isP = p.pos === 'P';
  const bonus = useMemo(() => attrBonus(p, grade, enh, playstyle, gearPer), [p, grade, enh, playstyle, gearPer]);
  const groups = ATTR_GROUPS.filter((g) => (isP ? ['pitch', 'mental', 'phys'].includes(g.id) : g.id !== 'pitch' && (g.id !== 'catch' || p.pos === 'C')));
  const fog = !owned;
  const fr = rng('fog:' + p.id);
  const fogRange = (v: number) => {
    const w = 20;
    const lo = Math.max(1, Math.min(100 - w, Math.round(v) - fr.int(0, w)));
    return [lo, Math.min(100, lo + w)] as const;
  };
  const bonusSum = Object.values(bonus).reduce((a, b) => Math.max(a, b ?? 0), 0);

  return (
    <div className={s.panel}>
      {isP && <PitchArsenal p={p} card={card} grade={grade} enh={enh} playstyle={playstyle} gearPer={gearPer} scale={scale} fog={fog} />}

      <Sec
        title="능력치"
      >
        <p className={s.scaleNote}>
          {fog
            ? <>남의 선수라 스카우트가 본 <b>범위</b>로 보여요. 맞대결이 쌓일수록 좁아져요.</>
            : <>본래 값 + 카드 보너스(강화·플레이스타일·장비) {bonusSum > 0 && <b className="num">최대 +{bonusSum}</b>}</>}
        </p>
        <div className={s.groups}>
          {groups.map((g) => {
            const vals = g.keys.map((k) => p.attrs[k]).filter((v): v is number => v != null);
            if (!vals.length) return null;
            const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
            return (
              <div key={g.id} className={s.group}>
                <p className={s.gHead}>
                  <b>{g.ko}</b>
                  <span className="num">{avg}</span>
                </p>
                {g.keys.map((k) => {
                  const v = p.attrs[k];
                  if (v == null) return null;
                  const fm = toFm(v);
                  const b = bonus[k] ?? 0;
                  const label = SHORT[k] ?? ATTR_KO[k];
                  if (fog) {
                    const [lo, hi] = fogRange(v);
                    return (
                      <div key={k} className={s.row}>
                        <span className={s.lab}>{label}</span>
                        <span className={['num', s.val, s.range, s['b' + band(toFm((lo + hi) / 2))]].join(' ')}>{lo}–{hi}</span>
                      </div>
                    );
                  }
                  const shown = Math.min(120, v + b);
                  const bd = band(toFm(v + b));
                  return (
                    <div key={k} className={s.row}>
                      <span className={s.lab}>{label}</span>
                      {b > 0 && <em className={['num', s.plus].join(' ')}>+{b}</em>}
                      <span className={['num', s.val, s['b' + bd], v + b >= 94 && s.top].filter(Boolean).join(' ')}>{shown}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        {!isP && <Tendencies p={p} />}
        {isP && p.attrs.gbTend != null && <Tendency label="타구 유도" left="뜬공형" right="땅볼형" v={p.attrs.gbTend} />}
      </Sec>

      <TraitList p={p} />
      <Hidden p={p} owned={owned} mineCount={mineCount} />
      <Form p={p} />
      <WeatherFit p={p} />
    </div>
  );
}

/* ───────── 고유 구종 + 구종표 ───────── */
function PitchArsenal({ p, card, grade, enh, playstyle, gearPer, scale, fog }: { p: Player; card: CardInst; grade: GradeId; enh: number; playstyle: string | null; gearPer: Record<string, number>; scale: Scale; fog: boolean }) {
  const sig = card.signaturePitch && isRarePlus(card.grade) ? card.signaturePitch : null;
  const pitches = (p.pitches ?? []).slice().sort((a, b) => b.usage - a.usage);
  const sigPitch = sig ? pitches.find((x) => x.type === sig.base) : undefined;
  const v = (x: number, b: number) => Math.min(120, x + b);
  return (
    <>
      {sig && (
        <Sec title="고유 구종" meta={sig.style === 'initials' ? '이름 약자형' : '별칭형'} className={s.sigSec}>
          <div className={s.sig} style={{ '--sig': sig.color } as CSSProperties}>
            <PitchPath type={sig.base} color={sig.color} w={128} h={64} className={s.sigPath} />
            <div className={s.sigBody}>
              <p className={['head', s.sigName].join(' ')}>{sig.name}</p>
              <p className={s.sigBase}>{PITCH_KO[sig.base]} 계열 · 등급 {enh >= 10 ? '각성' : enh >= 5 ? '한 단계 강화' : '기본'}</p>
              <p className={s.sigFx}>{sig.effect}</p>
              {sigPitch && (
                <p className={s.sigStats}>
                  <span>위력 <b className="num">{v(sigPitch.stuff, pitchBonus(p, sigPitch, grade, enh, playstyle, gearPer).stuff)}</b></span>
                  <span>제구 <b className="num">{v(sigPitch.command, pitchBonus(p, sigPitch, grade, enh, playstyle, gearPer).command)}</b></span>
                  <span><b className="num">{sigPitch.kmh}</b>km/h</span>
                  <span>구사 <b className="num">{Math.round(sigPitch.usage * 100)}%</b></span>
                </p>
              )}
            </div>
          </div>
          <p className={s.sigNote}>문자 중계에서 이름이 불리고, 2D 중계에선 이 색 꼬리로 날아가요. 강화 V·X 에서 위력이 한 단계씩 올라요.</p>
        </Sec>
      )}
      <Sec title="구종" meta={<>구사율 순</>}>
        <div className={s.pitchTable} role="table" aria-label="구종표">
          <div className={[s.pRow, s.pHead].join(' ')} role="row">
            <span role="columnheader">구종</span>
            <span role="columnheader" className={s.r}>km/h</span>
            <span role="columnheader" className={s.r}>위력</span>
            <span role="columnheader" className={s.r}>제구</span>
            <span role="columnheader">구사율</span>
          </div>
          {pitches.map((x) => {
            const isSig = sig?.base === x.type;
            const b = pitchBonus(p, x, grade, enh, playstyle, gearPer);
            const stf = v(x.stuff, b.stuff), cmd = v(x.command, b.command);
            const fmS = toFm(x.stuff), fmC = toFm(x.command);
            return (
              <div key={x.type} className={[s.pRow, isSig && s.pSig].filter(Boolean).join(' ')} role="row" style={isSig ? ({ '--sig': sig!.color } as CSSProperties) : undefined}>
                <span className={s.pName} role="cell">
                  <PitchPath type={x.type} color={isSig ? sig!.color : 'currentColor'} w={34} h={17} tail={false} className={s.pPath} />
                  <b>{isSig ? sig!.name : x.ko}</b>
                </span>
                <span className={['num', s.r].join(' ')} role="cell">{x.kmh}</span>
                <span className={['num', s.r, s['b' + band(fog ? fmS : toFm(x.stuff + b.stuff))]].join(' ')} role="cell">{fog ? `${Math.max(1, Math.round(x.stuff) - 10)}–${Math.min(100, Math.round(x.stuff) + 10)}` : stf}</span>
                <span className={['num', s.r, s['b' + band(fog ? fmC : toFm(x.command + b.command))]].join(' ')} role="cell">{fog ? `${Math.max(1, Math.round(x.command) - 10)}–${Math.min(100, Math.round(x.command) + 10)}` : cmd}</span>
                <span className={s.use} role="cell">
                  <span className={s.useBar} aria-hidden><i style={{ width: `${Math.round(x.usage * 100)}%` }} /></span>
                  <span className="num">{Math.round(x.usage * 100)}%</span>
                </span>
              </div>
            );
          })}
        </div>
      </Sec>
    </>
  );
}

/* ───────── 성향 (타구 방향 · 발사각 · 적극성) ───────── */
function Tendency({ label, left, right, v }: { label: string; left: string; right: string; v: number }) {
  const x = Math.max(4, Math.min(96, v));
  return (
    <div className={s.tend}>
      <span className={s.tLabel}>{label}</span>
      <span className={s.tSide}>{left}</span>
      <span className={s.tTrack} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} aria-label={`${label} ${left} 0 · ${right} 100`}>
        <i className={s.tMid} />
        <b style={{ left: `${x}%` }} />
      </span>
      <span className={[s.tSide, s.tRight].join(' ')}>{right}</span>
    </div>
  );
}
function Tendencies({ p }: { p: Player }) {
  return (
    <div className={s.tends}>
      {p.attrs.pullTend != null && <Tendency label="타구 방향" left="밀어침" right="당겨침" v={p.attrs.pullTend} />}
      {p.attrs.launchTend != null && <Tendency label="발사각" left="땅볼" right="뜬공" v={p.attrs.launchTend} />}
      {p.attrs.swingTend != null && <Tendency label="적극성" left="신중" right="적극" v={p.attrs.swingTend} />}
    </div>
  );
}

/* ───────── 특성 ───────── */
function TraitList({ p }: { p: Player }) {
  if (!p.traits.length) {
    return (
      <Sec title="특성" meta="0개">
        <p className={s.empty}>아직 몸에 밴 습관이 없어요. 코치 훈련으로 배울 수 있어요.</p>
      </Sec>
    );
  }
  return (
    <Sec title="특성" meta={<><span className="num">{p.traits.length}</span>개 · 최대 4</>}>
      <ul className={s.traits}>
        {p.traits.map((t) => {
          const info = traitInfo(t);
          return (
            <li key={t} className={s.trait}>
              <span className={s.tIcon} aria-hidden><Icon name={CAT_ICON[info.cat]} size={18} /></span>
              <div className={s.tBody}>
                <p className={s.tName}>
                  <b>{t}</b>
                  <span className={s.tCat}>{info.cat}{info.born ? ' · 타고남' : ''}</span>
                </p>
                <p className={s.tFx}>{info.effect}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </Sec>
  );
}

/* ───────── 숨은 특성 (성격 · 기복 · 큰 경기 · 압박감 · 부상 경향) ───────── */
function Hidden({ p, owned, mineCount }: { p: Player; owned: boolean; mineCount: number }) {
  const h = useMemo(() => hiddenOf(p, owned, mineCount), [p, owned, mineCount]);
  const shown = h.items.filter((x) => x.revealed).length;
  return (
    <Sec title="숨은 특성" meta={<>코치 평 · <span className="num">{shown}/{h.items.length}</span> 드러남</>}>
      <div className={s.pers}>
        <p className={s.persName}><span className={s.persLab}>성격</span><b className="head">{h.personality}</b></p>
        <p className={s.persDesc}>{h.desc}</p>
      </div>
      <ul className={s.hidden}>
        {h.items.map((x) => (
          <li key={x.key} className={[s.hRow, !x.revealed && s.hFog].filter(Boolean).join(' ')}>
            <span className={s.hLab}>{x.ko}</span>
            <div className={s.hBody}>
              <p className={s.hWord}>{x.revealed ? <b>{x.word}</b> : <b className={s.q}>??</b>}</p>
              <p className={s.hLine}>{x.revealed ? `“${x.line}”` : x.need}</p>
            </div>
            <span className={s.conf} title={`코치 확신 ${Math.round(x.conf * 100)}%`}>
              <span className={s.confBar} aria-hidden>{[0, 1, 2, 3].map((i) => <i key={i} className={x.conf > i * 0.25 + 0.05 ? s.cOn : undefined} />)}</span>
              <span className="num">{Math.round(x.conf * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
      <p className={s.foot}>숨은 값은 효과가 작아요(최대 ±2~4). 이름·뜻·식은 도움말에 다 공개돼요.</p>
    </Sec>
  );
}

/* ───────── 폼 ───────── */
function Form({ p }: { p: Player }) {
  const f = useMemo(() => formOf(p), [p]);
  return (
    <Sec title={f.kind === 'pitch' ? '투구 폼' : '타격 폼'} meta="그림과 같은 폼 · 엔진 효과 최대 ±2">
      <p className={['head', s.formName].join(' ')}>{f.name}</p>
      <p className={s.formTags}>{f.tags.join(' · ')}</p>
      {f.pitch && <PitchFormCells f={f.pitch} />}
      {f.bat && <BatFormCells f={f.bat} />}
      <ul className={s.fx}>
        {f.effects.map((e) => (
          <li key={e.k}><b>{e.label}</b><span>{e.text}</span></li>
        ))}
      </ul>
    </Sec>
  );
}

/* ───────── 날씨 궁합 ───────── */
function WeatherFit({ p }: { p: Player }) {
  const today = weatherToday(p);
  const rows = WEATHER_ROWS.map((w) => ({ ...w, v: p.weather[w.key] ?? 0 }));
  const strong = rows.filter((r) => Math.abs(r.v) >= 2);
  return (
    <Sec title="날씨 궁합" meta={strong.length ? weatherWord(strong[0].key, strong[0].v) : '두드러진 체질 없음'}>
      <div className={s.wx} role="table" aria-label="날씨 궁합">
        {rows.map((r) => (
          <div key={r.key} className={s.wxRow} role="row">
            <span className={s.wxLab} role="rowheader"><Icon name={r.icon} size={15} />{r.ko}</span>
            <span className={s.wxTrack} role="cell" aria-label={`${r.ko} ${fmt.signed(r.v)}`}>
              <i className={s.wxMid} aria-hidden />
              {r.v !== 0 && (
                <b
                  aria-hidden
                  className={r.v > 0 ? s.wxPos : s.wxNeg}
                  style={r.v > 0 ? { left: '50%', width: `${(r.v / 2) * 50}%` } : { right: '50%', width: `${(-r.v / 2) * 50}%` }}
                />
              )}
            </span>
            <span className={['num', s.wxV, r.v === 0 && s.wxZero].filter(Boolean).join(' ')} role="cell">{r.v === 0 ? '0' : fmt.signed(r.v)}</span>
            <span className={s.wxWord} role="cell">{weatherWord(r.key, r.v)}</span>
          </div>
        ))}
      </div>
      <p className={s.today}>
        <span className={s.todayLab}>오늘</span>
        <span>{today.sky}</span>
        <span className={today.net > 0 ? s.good : today.net < 0 ? s.bad : undefined}>{today.text}</span>
      </p>
    </Sec>
  );
}
