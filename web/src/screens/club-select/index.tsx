// 처음 시작 — 구단 고르기 → 선수 3명 지명(클럽 창단) → 특별 선수 만들기 → 2027 시즌 개막
// 담당: 홈·시작·설정 개발자. 단계는 주소로: #/club-select?step=club|draft|special|open (뒤로 가기 = 이전 단계)
// 고른 값은 이 기기에 기억(bb.start) — 서버가 붙으면 '개막'에서 서버로 보내고 ME.teamId 가 바뀐다.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ScreenProps } from '../../app/screen';
import { navigate } from '../../app/router';
import { applyClubColors } from '../../theme/themes';
import { myTeam, teamById } from '../../game/mock';
import { EmblemSheet } from './EmblemSheet';
import { StepClub } from './StepClub';
import { StepDraft } from './StepDraft';
import { StepSpecial } from './StepSpecial';
import { StepOpen } from './StepOpen';
import { loadStart, saveStart, type StartState } from './local-mock';
import s from './cs.module.css';

export type StepId = 'club' | 'draft' | 'special' | 'open';
const STEPS: { id: StepId; ko: string }[] = [
  { id: 'club', ko: '구단' },
  { id: 'draft', ko: '지명' },
  { id: 'special', ko: '특별 선수' },
  { id: 'open', ko: '개막' },
];
const isStep = (v: unknown): v is StepId => v === 'club' || v === 'draft' || v === 'special' || v === 'open';

export interface StepProps {
  st: StartState;
  set: (patch: Partial<StartState>) => void;
  go: (step: StepId) => void;
  /** 아래 고정 줄 */
  Dock: (p: { children: ReactNode; note?: ReactNode }) => ReactNode;
}

function Dock({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className={s.dock}>
      {note && <div className={s.dockNote}>{note}</div>}
      <div className={s.dockBtn}>{children}</div>
    </div>
  );
}

export default function ClubSelectScreen({ query }: ScreenProps) {
  const debug = query.get('debug') === 'emblems';
  const qStep = query.get('step');
  const step: StepId = isStep(qStep) ? qStep : 'club';
  const [st, setSt] = useState<StartState>(() => {
    const base = loadStart();
    const qc = query.get('club');
    return qc && teamById(qc).id === qc ? { ...base, club: qc, picks: qc === base.club ? base.picks : [] } : base;
  });
  const set = useCallback((patch: Partial<StartState>) => {
    setSt((prev) => {
      const next = { ...prev, ...patch };
      if (patch.club && patch.club !== prev.club) next.picks = [];
      saveStart(next);
      return next;
    });
  }, []);
  const go = useCallback((to: StepId) => navigate(`/club-select?step=${to}`), []);

  // 고른 구단 색으로 잉크를 바꿔 입는다 (classic 별색) — 화면을 떠나면 원래 구단 색으로
  const team = teamById(st.club);
  useEffect(() => { applyClubColors(team.colors.primary, team.colors.secondary); }, [team]);
  useEffect(() => () => { const t = myTeam(); applyClubColors(t.colors.primary, t.colors.secondary); }, []);

  const done = useMemo(() => ({
    club: team.short,
    draft: `${st.picks.length}/3`,
    special: st.special.name,
    open: '',
  }), [team, st.picks.length, st.special.name]);
  const reach = (id: StepId) => id === 'club' || (id === 'draft') || (id === 'special' && st.picks.length === 3) || (id === 'open' && st.picks.length === 3);

  if (debug) return <EmblemSheet />;
  const idx = STEPS.findIndex((x) => x.id === step);
  const props: StepProps = { st, set, go, Dock };
  return (
    <div className={s.page} data-step={step}>
      <nav className={s.steps} aria-label="시작 단계">
        <ol>
          {STEPS.map((x, i) => {
            const state = i < idx ? 'past' : i === idx ? 'now' : 'next';
            return (
              <li key={x.id} className={s[state]}>
                <button type="button" disabled={!reach(x.id) || i === idx} onClick={() => go(x.id)} aria-current={i === idx ? 'step' : undefined}>
                  <span className={s.stepHead}><span className="num">{i + 1}</span>{x.ko}</span>
                  <span className={s.stepVal}>{i <= idx || reach(x.id) ? done[x.id] || '—' : '—'}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      {step === 'club' && <StepClub {...props} />}
      {step === 'draft' && <StepDraft {...props} />}
      {step === 'special' && <StepSpecial {...props} />}
      {step === 'open' && <StepOpen {...props} />}
    </div>
  );
}
