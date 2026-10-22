// 3단계 — 특별 선수 만들기 (요구 29): 11명 중 한 명 · 투수/타자 · 포지션 · 투타 · 팔 각도/타격 폼 · 외모
// 결과는 단 한 장뿐인 '특별 선수' 카드(전용 테두리) + 이름을 딴 고유 구종/타격 특기 + 이름이 들어간 응원 구호.
// 얼굴은 캐릭터 생성기 시드로 고른다 — 머리·수염을 고르면 그 모양이 나오는 시드를 찾아 쓴다(그림은 PlayerArt 그대로).
import { useMemo, type ReactNode } from 'react';
import { Button, Field, Icon, Tabs } from '../../ui';
import { Card } from '../../cards';
import { teamById } from '../../game/mock';
import { FIELD_SPOTS } from '../../game/field';
import type { BatSide, Hand, PitcherRole, Pos } from '../../game/types';
import {
  ARM_KO, BEARD_KO, BUILD_KO, HAIR_KO, PITCH_CHOICES, PITCH_NAME, POS_SHORT, ROLE_INFO, SKILL_KO, SPECIAL_META, SPECIAL_NAMES,
  STANCE_KO, TIMING_KO, buildSpecial, chants, specialSignature, specialSkill,
  type ArmSlot, type BatSkill, type BuildPreset, type SpecialCfg, type Stance, type Timing,
} from './local-mock';
import type { StepProps } from './index';
import s from './cs.module.css';
import x from './StepSpecial.module.css';

function Group({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className={s.group}>
      <div className={s.groupHead}><h3>{title}</h3>{note && <small>{note}</small>}</div>
      {children}
    </section>
  );
}

/** 글자 판 고르기 (알약 아님 — 각진 판) */
function Plates<V extends string>({ items, value, onChange, cols = 4, label }: {
  items: { value: V; label: ReactNode; sub?: ReactNode }[]; value: V; onChange: (v: V) => void; cols?: number; label: string;
}) {
  return (
    <div className={x.plates} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} role="radiogroup" aria-label={label}>
      {items.map((it) => (
        <button key={it.value} type="button" role="radio" aria-checked={it.value === value} className={[x.plate, it.value === value && x.plateOn].filter(Boolean).join(' ')} onClick={() => onChange(it.value)}>
          <b>{it.label}</b>
          {it.sub && <small>{it.sub}</small>}
        </button>
      ))}
      {Array.from({ length: (cols - (items.length % cols)) % cols }, (_, i) => <span key={"f" + i} className={x.plateFill} aria-hidden />)}
    </div>
  );
}

/** 팔 각도 그림 — 어깨에서 공까지 */
function ArmFigure({ deg, hand }: { deg: number; hand: Hand }) {
  const a = (deg * Math.PI) / 180;
  const sx = 20, sy = 15, L = 15;
  const ex = sx + L * Math.cos(a), ey = sy - L * Math.sin(a);
  const flip = hand === 'L' ? 'translate(40 0) scale(-1 1)' : undefined;
  return (
    <svg viewBox="0 0 40 40" className={x.arm} aria-hidden>
      <g transform={flip}>
        <circle cx="20" cy="8" r="3.6" className={x.armBody} />
        <path d="M20 12v14M20 26l-5 11M20 26l5 11M20 15l-8 5" className={x.armBody} />
        <path d={`M${sx} ${sy}L${ex.toFixed(1)} ${ey.toFixed(1)}`} className={x.armThrow} />
        <circle cx={ex} cy={ey} r="2.4" className={x.armBall} />
      </g>
    </svg>
  );
}

/** 포지션 고르기 — 경기장 위 자리 판 */
function Diamond({ value, onChange, throws }: { value: Exclude<Pos, 'P'>; onChange: (p: Exclude<Pos, 'P'>) => void; throws: Hand }) {
  const keys = Object.keys(POS_SHORT) as Exclude<Pos, 'P'>[];
  return (
    <div className={x.diamond} role="radiogroup" aria-label="포지션">
      <Field distances={false} scenery={false} lights={false} label="포지션 고르기">
        {keys.map((k) => {
          const sp = FIELD_SPOTS[k];
          const odd = throws === 'L' && ['C', '2B', 'SS', '3B'].includes(k);
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={value === k}
              className={[x.spot, value === k && x.spotOn, odd && x.spotOdd].filter(Boolean).join(' ')}
              style={{ left: `${sp.x * 100}%`, top: `${sp.y * 100}%` }}
              onClick={() => onChange(k)}
            >
              {POS_SHORT[k]}
            </button>
          );
        })}
      </Field>
    </div>
  );
}

export function StepSpecial({ st, set, go, Dock }: StepProps) {
  const t = teamById(st.club);
  const c = st.special;
  const put = (patch: Partial<SpecialCfg>) => set({ special: { ...c, ...patch } });
  const player = useMemo(() => buildSpecial(c, t), [c, t]);
  const isP = c.type === 'P';
  const sig = specialSignature(c);
  const skill = specialSkill(c);
  const chantList = chants(c, t);
  const chant = chantList[c.chant % chantList.length];
  const oddThrow = !isP && c.throws === 'L' && ['C', '2B', 'SS', '3B'].includes(c.pos);

  return (
    <>
      <header className={s.head}>
        <p className={s.kicker}>특별 선수 · 세상에 한 장</p>
        <h1 className={s.title}>나만의 특별 선수</h1>
        <p className={s.lead}>열한 명 가운데 한 명을 골라 던지고 치는 방식까지 정해요. 처음엔 강하고, 경기와 훈련으로 더 크게 자라요.</p>
      </header>

      <div className={x.preview}>
        <div className={x.card}>
          <Card player={player} team={t} grade="unique" level={1} enhance={0} signaturePitch={isP ? sig : null} width={150} />
        </div>
        <div className={x.info}>
          <p className={x.infoKicker}>{isP ? '고유 구종' : '타격 특기'}</p>
          <p className={x.sigName} style={isP ? { ['--sig' as string]: sig.color } : undefined}>
            {isP && <i aria-hidden />}
            {isP ? sig.name : skill.name}
          </p>
          <p className={x.sigEff}>{isP ? sig.effect.replace(' (특별 선수 전용)', '') : skill.effect}</p>
          <div className={x.chant}>
            <p className={x.infoKicker}>응원 구호</p>
            <blockquote>“{chant}”</blockquote>
            <button type="button" className={x.again} onClick={() => put({ chant: c.chant + 1 })}><Icon name="refresh" size={14} /> 다른 구호</button>
          </div>
          <p className={x.pot}><b>잠재력 최고</b> · 종합 <span className="num">{player.ovr}</span>에서 시작</p>
        </div>
      </div>

      <div className={x.form}>
        <Group title="이름" note="사용자 지정 11명">
          <Plates
            label="이름"
            cols={4}
            value={c.name}
            onChange={(v) => put({ name: v, pitch: SPECIAL_META[v].pitch, seed: 0 })}
            items={SPECIAL_NAMES.map((n) => ({ value: n, label: n }))}
          />
        </Group>

        <Group title="투수 / 타자">
          <Tabs variant="box" fill aria-label="투수 또는 타자" value={c.type} onChange={(v) => put({ type: v, bats: v === 'P' ? c.throws : c.bats })} items={[{ value: 'P', label: '투수' }, { value: 'B', label: '타자' }]} />
        </Group>

        {isP ? (
          <Group title="보직">
            <Plates<PitcherRole>
              label="보직"
              cols={3}
              value={c.role}
              onChange={(v) => put({ role: v })}
              items={(['SP', 'RP', 'CL'] as PitcherRole[]).map((r) => ({ value: r, label: ROLE_INFO[r].ko, sub: ROLE_INFO[r].note }))}
            />
          </Group>
        ) : (
          <Group title="포지션" note={oddThrow ? '좌투는 드문 자리 — 송구 −3' : '자리를 눌러 고르세요'}>
            <Diamond value={c.pos} onChange={(v) => put({ pos: v })} throws={c.throws} />
          </Group>
        )}

        <Group title="던지는 손 · 치는 손">
          <div className={x.hands}>
            <Tabs variant="box" fill aria-label="던지는 손" value={c.throws} onChange={(v: Hand) => put({ throws: v, bats: isP ? v : c.bats })} items={[{ value: 'R', label: '우투' }, { value: 'L', label: '좌투' }]} />
            <Tabs variant="box" fill aria-label="치는 손" value={c.bats} onChange={(v: BatSide) => put({ bats: v })} items={[{ value: 'R', label: '우타' }, { value: 'L', label: '좌타' }, { value: 'S', label: '양타' }]} />
          </div>
        </Group>

        {isP ? (
          <>
            <Group title="팔 각도" note={ARM_KO[c.arm].note}>
              <div className={x.arms} role="radiogroup" aria-label="팔 각도">
                {(Object.keys(ARM_KO) as ArmSlot[]).map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={c.arm === k} className={[x.armBtn, c.arm === k && x.plateOn].filter(Boolean).join(' ')} onClick={() => put({ arm: k })}>
                    <ArmFigure deg={ARM_KO[k].deg} hand={c.throws} />
                    <b>{ARM_KO[k].ko}</b>
                  </button>
                ))}
              </div>
            </Group>
            <Group title="결정구" note={`${sig.name}`}>
              <Plates
                label="결정구"
                cols={3}
                value={c.pitch}
                onChange={(v) => put({ pitch: v })}
                items={PITCH_CHOICES.map((p) => ({ value: p, label: PITCH_NAME[p] }))}
              />
              <div className={x.nameStyle}>
                <Tabs variant="underline" size="s" aria-label="구종 이름 짓기" value={c.sigStyle} onChange={(v) => put({ sigStyle: v })} items={[{ value: 'initials', label: `이니셜 · ${SPECIAL_META[c.name].init}` }, { value: 'given', label: `이름 · ${SPECIAL_META[c.name].given}` }]} />
              </div>
            </Group>
          </>
        ) : (
          <>
            <Group title="타격 폼" note={`${STANCE_KO[c.stance]} 스탠스 · ${TIMING_KO[c.timing]}`}>
              <div className={x.hands}>
                <Tabs variant="box" fill aria-label="스탠스" value={c.stance} onChange={(v: Stance) => put({ stance: v })} items={(Object.keys(STANCE_KO) as Stance[]).map((k) => ({ value: k, label: STANCE_KO[k] }))} />
                <Tabs variant="box" fill aria-label="타이밍" value={c.timing} onChange={(v: Timing) => put({ timing: v })} items={(Object.keys(TIMING_KO) as Timing[]).map((k) => ({ value: k, label: TIMING_KO[k] }))} />
              </div>
            </Group>
            <Group title="타격 특기" note={skill.name}>
              <Plates<BatSkill>
                label="타격 특기"
                cols={3}
                value={c.skill}
                onChange={(v) => put({ skill: v })}
                items={(Object.keys(SKILL_KO) as BatSkill[]).map((k) => ({ value: k, label: SKILL_KO[k].ko }))}
              />
              <div className={x.nameStyle}>
                <Tabs variant="underline" size="s" aria-label="특기 이름 짓기" value={c.sigStyle} onChange={(v) => put({ sigStyle: v })} items={[{ value: 'initials', label: `이니셜 · ${SPECIAL_META[c.name].init}` }, { value: 'given', label: `이름 · ${SPECIAL_META[c.name].given}` }]} />
              </div>
            </Group>
          </>
        )}

        <Group title="외모" note="캐릭터 생성기로 그려요">
          <div className={x.looks}>
            <Button variant="secondary" size="m" icon="refresh" block onClick={() => put({ seed: c.seed + 1 })}>얼굴 다시 돌리기</Button>
            <p className={x.lookLabel}>체격</p>
            <Tabs variant="box" fill aria-label="체격" value={c.build} onChange={(v: BuildPreset) => put({ build: v, seed: 0 })} items={(Object.keys(BUILD_KO) as BuildPreset[]).map((k) => ({ value: k, label: <>{BUILD_KO[k].ko} <small className="num">{BUILD_KO[k].h}·{BUILD_KO[k].w}</small></> }))} />
            <p className={x.lookLabel}>머리</p>
            <Plates label="머리" cols={3} value={c.hair} onChange={(v) => put({ hair: v, seed: 0 })} items={HAIR_KO.map(([k, ko]) => ({ value: k, label: ko }))} />
            <p className={x.lookLabel}>수염</p>
            <Plates label="수염" cols={5} value={c.beard} onChange={(v) => put({ beard: v, seed: 0 })} items={BEARD_KO.map(([k, ko]) => ({ value: k, label: ko }))} />
          </div>
        </Group>
      </div>

      <Dock note={<span><b>{c.name} · {isP ? ROLE_INFO[c.role].ko : POS_SHORT[c.pos]}</b><small>{isP ? sig.name : skill.name} · {ARM_KO[c.arm].ko && isP ? ARM_KO[c.arm].ko : STANCE_KO[c.stance] + ' ' + TIMING_KO[c.timing]}</small></span>}>
        <Button size="l" onClick={() => go('open')} trailing={<Icon name="arrow-right" size={18} />}>이 선수로</Button>
      </Dock>
    </>
  );
}
