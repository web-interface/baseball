// 3단계 — 특별 선수 만들기 (요구 29): 이름(추천 11명 또는 직접 입력 · 한글 2~4자) · 투수/타자 · 포지션 · 투타 · 팔 각도/타격 폼 · 외모
// 결과는 단 한 장뿐인 '특별 선수' 카드(전용 테두리) + 이름을 딴 고유 구종(결정구 20가지 · 특징 3개 중 하나)/타격 특기(1~3개) + 이름이 들어간 응원 구호.
// 고른 숫자는 카드 앞면에서 끝나지 않고 상세 능력치·구종표로 시즌 경기 엔진까지 간다 (local-mock buildSpecial).
// 얼굴은 캐릭터 생성기 시드로 고른다 — 머리·수염을 고르면 그 모양이 나오는 시드를 찾아 쓴다(그림은 PlayerArt 그대로).
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Button, Field, Icon, Tabs, TextField } from '../../ui';
import { Card } from '../../cards';
import { teamById } from '../../game/mock';
import { FIELD_SPOTS } from '../../game/field';
import type { BatSide, Hand, PitcherRole, Pos } from '../../game/types';
import {
  ARM_KO, BEARD_KO, BUILD_KO, FINISHERS, FINISHER_IDS, HAIR_KO, NAME_MAX, NAME_MIN, PITCH_FAMILIES, POS_SHORT, ROLE_INFO, SKILLS, SKILL_IDS, SKILL_MAX,
  SPECIAL_META, SPECIAL_NAMES, STANCE_KO, TIMING_KO, buildSpecial, chants, finisherKmh, isPresetName, isSpecialName, metaOfName, oddThrow,
  pitchFxChips, pitchTrait, skillChips, specialSignature, specialSkills,
  type ArmSlot, type BatSkill, type BuildPreset, type FinisherId, type FxChip, type SpecialCfg, type Stance, type Timing,
} from './local-mock';
import type { StepProps } from './index';
import s from './cs.module.css';
import x from './StepSpecial.module.css';
import { showOvr } from '../../game/ovrShow';

function Group({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className={s.group}>
      <div className={s.groupHead}><h3>{title}</h3>{note && <small>{note}</small>}</div>
      {children}
    </section>
  );
}

/** 빈칸 채우기 — 격자 마지막 줄이 줄 색으로 비지 않게 */
const fillers = (n: number, cols: number) => Array.from({ length: (cols - (n % cols)) % cols }, (_, i) => <span key={'f' + i} className={x.plateFill} aria-hidden />);

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
      {fillers(items.length, cols)}
    </div>
  );
}

/** 효과 숫자 칩 ('위력 +4' · '제구 −2') */
function Chips({ list }: { list: FxChip[] }) {
  return <span className={x.chips}>{list.map((ch) => <em key={ch.text} className={x[ch.tone]}>{ch.text}</em>)}</span>;
}

/**
 * 이름 직접 입력 — 한글 완성 글자(가~힣)만 2~4자.
 * 치는 동안엔 글자를 하나도 지우지 않는다 — 아이폰 한글 자판은 조합 신호(composition) 없이 낱자를 넣고 바꿔치기해서(ㅎ → 호 → 홍)
 * 치는 중에 낱자를 지우면 한글이 아예 안 써진다. 틀린 글자는 아래에 알려 주기만 하고, 칸을 떠날 때(완료 · Enter) 한글 완성 글자만 남긴다.
 * 맞는 이름이 되면 바로 카드에 들어가고, 틀린 동안엔 마지막으로 맞았던 이름이 카드에 남는다.
 */
function NameInput({ initial, onValid }: { initial: string; onValid: (name: string) => void }) {
  const [draft, setDraft] = useState(initial);
  const [left, setLeft] = useState(false);
  const syll = draft.replace(/[^가-힣]/g, '').length;
  // 조합 중인 낱자(ㄱ · ㅏ)는 괜찮고, 영문 · 숫자 · 기호 · 띄어쓰기만 알려 준다
  const foreign = draft.replace(/[가-힣ᄀ-ᇿ㄰-㆏]/g, '') !== '';
  const settle = (raw: string) => {
    const name = raw.replace(/[^가-힣]/g, '').slice(0, NAME_MAX);
    setDraft(name);
    if (isSpecialName(name)) onValid(name);
  };
  const error = foreign ? '한글만 쓸 수 있어요'
    : syll > NAME_MAX ? `${NAME_MAX}글자까지예요`
      : left && draft.length > 0 && syll < NAME_MIN ? `${NAME_MIN}글자 이상 써 주세요` : undefined;
  return (
    <TextField
      className={x.nameInput}
      label="직접 입력"
      placeholder="예: 홍길동"
      hint={`한글 ${NAME_MIN}~${NAME_MAX}자`}
      error={error}
      value={draft}
      lang="ko"
      autoComplete="off"
      spellCheck={false}
      enterKeyHint="done"
      onChange={(e) => {
        const v = e.target.value;
        setDraft(v);
        if (isSpecialName(v)) onValid(v);
      }}
      onFocus={() => setLeft(false)}
      onBlur={(e) => { setLeft(true); settle(e.currentTarget.value); }}
      onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) e.currentTarget.blur(); }}
    />
  );
}

/** 결정구 — 계열별 판 (한 무리로 하나만) */
function PitchPick({ c, onPick }: { c: SpecialCfg; onPick: (id: FinisherId) => void }) {
  return (
    <div role="radiogroup" aria-label="결정구">
      {PITCH_FAMILIES.map((fam) => {
        const ids = FINISHER_IDS.filter((id) => FINISHERS[id].family === fam.id);
        return (
          <div key={fam.id} className={x.fam}>
            <p className={x.famLabel}>{fam.ko}</p>
            <div className={x.plates} style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
              {ids.map((id) => {
                const f = FINISHERS[id];
                const on = c.pitch === id;
                return (
                  <button key={id} type="button" role="radio" aria-checked={on} className={[x.plate, on && x.plateOn].filter(Boolean).join(' ')} style={{ '--sig': f.color } as CSSProperties} onClick={() => onPick(id)}>
                    <b><i className={x.pdot} aria-hidden />{f.short}</b>
                    <small><span className="num">{finisherKmh(c, id)}</span>km/h</small>
                  </button>
                );
              })}
              {fillers(ids.length, 3)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 결정구 특징 — 셋 중 하나 */
function TraitPick({ c, onPick }: { c: SpecialCfg; onPick: (i: number) => void }) {
  const f = FINISHERS[c.pitch];
  const cur = f.traits.indexOf(pitchTrait(c));
  return (
    <div className={x.traitBox}>
      <p className={x.traitHead}><b>{f.ko} 특징</b><span>{f.desc}</span></p>
      <div className={x.traits} role="radiogroup" aria-label={`${f.ko} 특징`}>
        {f.traits.map((tr, i) => (
          <button key={tr.t} type="button" role="radio" aria-checked={cur === i} className={[x.trait, cur === i && x.plateOn].filter(Boolean).join(' ')} onClick={() => onPick(i)}>
            <span className={x.radio} aria-hidden />
            <span className={x.traitBody}>
              <b>{tr.t}</b>
              <small>{tr.d}</small>
              <Chips list={pitchFxChips(tr.fx)} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** 타격 특기 — 1~3개 (먼저 고른 것이 대표) */
function SkillPick({ c, onChange }: { c: SpecialCfg; onChange: (skills: BatSkill[]) => void }) {
  const n = c.skills.length;
  const list = specialSkills(c);
  const toggle = (k: BatSkill) => {
    if (c.skills.includes(k)) { if (n > 1) onChange(c.skills.filter((v) => v !== k)); return; }
    if (n < SKILL_MAX) onChange([...c.skills, k]);
  };
  return (
    <>
      <div className={x.plates} style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }} role="group" aria-label={`타격 특기 · 최대 ${SKILL_MAX}개`}>
        {SKILL_IDS.map((k) => {
          const on = c.skills.includes(k);
          const off = !on && n >= SKILL_MAX;
          return (
            <button key={k} type="button" role="checkbox" aria-checked={on} aria-disabled={off || undefined} className={[x.plate, on && x.plateOn, off && x.plateOff].filter(Boolean).join(' ')} onClick={() => toggle(k)}>
              <b>{SKILLS[k].ko}</b>
              <small>{SKILLS[k].sub}</small>
            </button>
          );
        })}
        {fillers(SKILL_IDS.length, 3)}
      </div>
      <ol className={x.skillList} aria-label="고른 특기">
        {list.map((sk) => (
          <li key={sk.id}>
            <p className={x.skillHead}>
              <b>{sk.name}</b>
              {sk.main ? <em>대표</em> : <button type="button" className={x.toMain} onClick={() => onChange([sk.id, ...c.skills.filter((v) => v !== sk.id)])}>대표로</button>}
            </p>
            <p className={x.skillLines}>{sk.effect}</p>
            <Chips list={skillChips(sk.id)} />
          </li>
        ))}
      </ol>
    </>
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
  const skills = specialSkills(c);
  const meta = metaOfName(c.name);
  const chantList = chants(c, t);
  const chant = chantList[c.chant % chantList.length];
  // 추천 이름을 누르면 직접 입력 칸을 비운다 (새로 그려서)
  const [nameKey, setNameKey] = useState(0);
  const nameTabs = [{ value: 'initials' as const, label: `이니셜 · ${meta.init}` }, { value: 'given' as const, label: `이름 · ${meta.given}` }];

  return (
    <>
      <header className={s.head}>
        <p className={s.kicker}>세상에 한 장</p>
        <h1 className={s.title}>나만의 특별 선수</h1>
      </header>

      <div className={x.preview}>
        <div className={x.card}>
          <Card player={player} team={t} grade="unique" level={1} enhance={0} signaturePitch={isP ? sig : null} width={150} />
        </div>
        <div className={x.info}>
          <p className={x.infoKicker}>{isP ? '고유 구종' : '타격 특기'}</p>
          <p className={x.sigName} style={isP ? { ['--sig' as string]: sig.color } : undefined}>
            {isP && <i aria-hidden />}
            {isP ? sig.name : skills[0].name}
          </p>
          <p className={x.sigEff}>{isP ? sig.effect.replace(' (특별 선수 전용)', '').split(' — ').pop() : skills[0].effect}</p>
          {isP ? (
            <p className={x.more} aria-label="구종표">
              {(player.pitches ?? []).map((p, i, all) => (
                <span key={p.type}>
                  {i > 0 && ' · '}
                  <span className={x.nowrap}>{p.type === FINISHERS[c.pitch].base ? FINISHERS[c.pitch].short : p.ko} <span className="num">{p.kmh}</span>{i === all.length - 1 && 'km/h'}</span>
                </span>
              ))}
            </p>
          ) : skills.length > 1 && <p className={x.more}>+ {skills.slice(1).map((k) => k.name).join(' · ')}</p>}
          <div className={x.chant}>
            <p className={x.infoKicker}>응원 구호</p>
            <blockquote>“{chant}”</blockquote>
            <button type="button" className={x.again} onClick={() => put({ chant: c.chant + 1 })}><Icon name="refresh" size={14} /> 다른 구호</button>
          </div>
          <p className={x.pot}><b>잠재력 최고</b> · 종합 <span className="num">{showOvr(player.ovr)}</span>에서 시작</p>
        </div>
      </div>

      <div className={x.form}>
        <Group title="이름">
          <Plates
            label="추천 이름"
            cols={4}
            value={c.name}
            onChange={(v) => {
              if (isPresetName(v)) put({ name: v, pitch: SPECIAL_META[v].pitch, pitchFx: 0, seed: 0 });
              setNameKey((k) => k + 1);
            }}
            items={SPECIAL_NAMES.map((n) => ({ value: n as string, label: n }))}
          />
          <NameInput key={nameKey} initial={isPresetName(c.name) ? '' : c.name} onValid={(n) => { if (n !== c.name) put({ name: n, seed: 0 }); }} />
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
          <Group title="포지션" note={oddThrow(c) ? '좌투 송구 −3' : undefined}>
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
            <Group title="결정구" note={sig.name}>
              <PitchPick c={c} onPick={(id) => { if (id !== c.pitch) put({ pitch: id, pitchFx: 0 }); }} />
              <TraitPick c={c} onPick={(i) => put({ pitchFx: i })} />
              <div className={x.nameStyle}>
                <Tabs variant="underline" size="s" aria-label="구종 이름 짓기" value={c.sigStyle} onChange={(v) => put({ sigStyle: v })} items={nameTabs} />
              </div>
            </Group>
          </>
        ) : (
          <>
            <Group title="타격 폼" note={`${STANCE_KO[c.stance]} 스탠스 · ${TIMING_KO[c.timing]}`}>
              <div className={x.rows}>
                <Tabs variant="box" fill aria-label="스탠스" value={c.stance} onChange={(v: Stance) => put({ stance: v })} items={(Object.keys(STANCE_KO) as Stance[]).map((k) => ({ value: k, label: STANCE_KO[k] }))} />
                <Tabs variant="box" fill aria-label="타이밍" value={c.timing} onChange={(v: Timing) => put({ timing: v })} items={(Object.keys(TIMING_KO) as Timing[]).map((k) => ({ value: k, label: TIMING_KO[k] }))} />
              </div>
            </Group>
            <Group title="타격 특기" note={<><span className="num">{c.skills.length}</span>/{SKILL_MAX}</>}>
              <SkillPick c={c} onChange={(v) => put({ skills: v })} />
              <div className={x.nameStyle}>
                <Tabs variant="underline" size="s" aria-label="특기 이름 짓기" value={c.sigStyle} onChange={(v) => put({ sigStyle: v })} items={nameTabs} />
              </div>
            </Group>
          </>
        )}

        <Group title="외모">
          <div className={x.looks}>
            <Button variant="secondary" size="m" icon="refresh" block onClick={() => put({ seed: c.seed + 1 })}>다른 얼굴</Button>
            <p className={x.lookLabel}>체격</p>
            <Tabs variant="box" fill aria-label="체격" value={c.build} onChange={(v: BuildPreset) => put({ build: v, seed: 0 })} items={(Object.keys(BUILD_KO) as BuildPreset[]).map((k) => ({ value: k, label: <>{BUILD_KO[k].ko} <small className="num">{BUILD_KO[k].h}·{BUILD_KO[k].w}</small></> }))} />
            <p className={x.lookLabel}>머리</p>
            <Plates label="머리" cols={3} value={c.hair} onChange={(v) => put({ hair: v, seed: 0 })} items={HAIR_KO.map(([k, ko]) => ({ value: k, label: ko }))} />
            <p className={x.lookLabel}>수염</p>
            <Plates label="수염" cols={5} value={c.beard} onChange={(v) => put({ beard: v, seed: 0 })} items={BEARD_KO.map(([k, ko]) => ({ value: k, label: ko }))} />
          </div>
        </Group>
      </div>

      <Dock note={<span><b>{c.name} · {isP ? ROLE_INFO[c.role].ko : POS_SHORT[c.pos]}</b><small>{isP ? sig.name : `${skills[0].name}${skills.length > 1 ? ` 외 ${skills.length - 1}` : ''}`} · {isP ? ARM_KO[c.arm].ko : `${STANCE_KO[c.stance]} ${TIMING_KO[c.timing]}`}</small></span>}>
        <Button size="l" onClick={() => go('open')} trailing={<Icon name="arrow-right" size={18} />}>이 선수로</Button>
      </Dock>
    </>
  );
}
