// 4단계 — 2027 시즌 개막: 우리 선수단 · 리그 단계 안내(AI 상대 난이도는 고르지 않고 성적 · 팀 조건으로 자동) · 창단 자금(요구 39) → 홈으로
import { useMemo } from 'react';
import { Button, CoinGP, GoldenBall, Icon, useToast } from '../../ui';
import { Card } from '../../cards';
import { ClubCrest } from '../../art/emblems';
import { useAuth } from '../../app/auth';
import { navigate } from '../../app/router';
import { ME, leagueChangesWith, teamById } from '../../game/mock';
import { shortLabel } from '../../game/world';
import { GRADES } from '../../game/grades';
import { int } from '../../ui/format';
import type { Player } from '../../game/types';
import { AI_LEVELS, RECOMMENDED, buildSpecial, draftGradeOf, draftPool, draftYearOf, revivalSlot, specialSignature } from './local-mock';
import { resetStarter } from '../../game/starter';
import { evaluate, initialLineup, store as lineupStore } from '../lineup/calc';
import { mergeStarter, resetInventory } from '../../game/inventory';
import { SEASON_GAMES, clearSeason, getSeason, setNextNotice } from '../../season/store';
import { GATE, LEVELS, LEVEL_INFO, LEVEL_KO, resetLeague } from '../../season/league';
import type { StepProps } from './index';
import s from './cs.module.css';
import o from './StepOpen.module.css';

export function StepOpen({ st, set, go, Dock }: StepProps) {
  const t = teamById(st.club);
  const { user } = useAuth();
  const toast = useToast();
  const pool = useMemo(() => draftPool(t.id), [t.id]);
  const picked = st.picks.map((id) => pool.find((p) => p.id === id)).filter(Boolean) as Player[];
  const special = useMemo(() => buildSpecial(st.special, t), [st.special, t]);
  const sig = specialSignature(st.special);
  void AI_LEVELS; void RECOMMENDED; // 예전 '난이도 고르기' 값 — 이제 리그 단계는 자동(season/league)
  const level = { ko: LEVEL_KO.trainee, ...LEVEL_INFO.trainee };
  // 이 설정으로 받는 기본 선수단의 팀 종합 (지명·특별 선수를 넣고 계산)
  const ovr = useMemo(() => {
    try { localStorage.setItem('bb.special', JSON.stringify(special)); } catch { /* 이번 방문만 */ }
    resetStarter();
    // 미리 계산만 — 저장된 라인업 · 보유 카드는 '개막'을 눌러야 바뀐다
    return evaluate(initialLineup()).overall;
  }, [special, st.picks, st.club]);

  const slot = revivalSlot(t);
  // 내 구단이 바뀌나 (부활 구단으로 리그 구성이 바뀌는 것 포함) — 바뀌면 지금 시즌 진행은 지우고 개막전부터
  const switching = t.id !== ME.teamId || leagueChangesWith(t.id);
  const played = getSeason().next;
  const start = () => {
    try { localStorage.setItem('bb.special', JSON.stringify(special)); } catch { /* 이번 방문만 */ }
    resetStarter();
    lineupStore.clear();
    // 보유 카드 — 구단이 바뀌면 이 구단의 처음 선수단으로, 같은 구단이면 모은 카드는 두고 새 지명 · 특별 선수 카드만 더한다
    if (switching) resetInventory(); else mergeStarter();
    if (switching) {
      resetLeague(); // 새 구단 — 2027 · 연습생부터
      // 고른 구단이 앱 전체의 내 구단(ME.teamId)이 되게 — 시즌 진행을 지우고 화면을 다시 불러
      // 내 구단 · 순위표 · 일정 · 라인업 · 구단 색을 새 구단(부활 구단이면 바뀐 리그 구성)으로 맞춘다
      clearSeason();
      setNextNotice(`${t.name} 창단! 2027 개막전부터 시작해요`, t.id);
      navigate('/home', { replace: true });
      location.reload();
      return;
    }
    toast({ text: `${t.name} 창단! 2027 시즌을 시작해요`, tone: 'good' });
    navigate('/home', { replace: true });
  };

  return (
    <>
      <section className={o.poster} aria-label="2027 시즌 개막">
        <span className={o.beams} aria-hidden />
        <div className={o.posterTop}>
          <p className={o.posterKicker}>한별 리그 · 정규 시즌 <span className="num">{SEASON_GAMES}</span>경기</p>
          <p className={o.year}><span className="num-display">2027</span></p>
          <p className={o.opening}>시즌 개막</p>
        </div>
        <div className={o.posterClub}>
          <ClubCrest team={t} size={64} className={o.crest} />
          <div>
            <h1 className={o.club}>{t.name}</h1>
            <p className={o.mgr}>감독 <b>{user ?? ME.user}</b> · {t.stadium.name}</p>
            {slot && <p className={o.dates}>부활 구단 — <b>{slot.name}</b> 자리에서 뛰어요</p>}
            <p className={o.dates}><span className="num">4</span>월 개막 → <span className="num">10</span>월 가을야구</p>
          </div>
        </div>
      </section>

      <section className={s.group} aria-labelledby="squad-h">
        <div className={s.groupHead}><h2 id="squad-h">우리 선수단</h2><small>기본 <span className="num">22</span>장 + 지명 <span className="num">3</span> + 특별 <span className="num">1</span></small></div>
        <div className={o.squad}>
          <div className={o.specialCard}>
            <Card player={special} team={t} grade="unique" level={1} signaturePitch={special.pos === 'P' ? sig : null} width={124} />
          </div>
          <div className={o.picks}>
            {picked.map((p, i) => <Card key={p.id} player={p} team={t} grade={draftGradeOf(p)} year={draftYearOf(p, i)} level={1} width={80} showStats={false} />)}
            <button type="button" className={o.edit} onClick={() => go('draft')}><Icon name="swap" size={14} /> 바꾸기</button>
          </div>
        </div>
        <p className={o.starter}>
          나머지는 다른 구단 최근 시즌(’24~’26)의 노멀·스페셜 <span className="num">22</span>장 — 포수 <span className="num">2</span>명 포함, 빈자리 없이 채워 드려요.
          처음엔 어떤 세트덱도 켜지지 않아요. 지금 팀 종합 <b className="num">{ovr}</b>.
        </p>
      </section>

      <section className={s.group} aria-labelledby="ai-h">
        <div className={s.groupHead}><h2 id="ai-h">리그 단계 · AI 상대</h2><small>고르지 않아요 — 성적과 팀 조건으로 자동</small></div>
        <ol className={o.ladder} aria-label="리그 단계">
          {LEVELS.map((id, i) => {
            const g = GATE[id];
            const need = [
              g.ovr ? `팀 종합 ${g.ovr}` : '처음 시작',
              g.teamYear ? (g.teamYear >= 20 ? '단일팀 연도덱 전원(왕조) · 우승 연도' : `단일팀 연도덱 ${g.teamYear}명 · 우승 연도`) : '',
              g.enh ? `평균 강화 ${['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][g.enh]}` : '',
            ].filter(Boolean).join(' · ');
            return (
              <li key={id}>
                <div className={[o.rung, i === 0 && o.rungOn].filter(Boolean).join(' ')}>
                  <span className={['num', o.step].join(' ')}>{i + 1}</span>
                  <span className={o.rungMain}>
                    <b>{LEVEL_KO[id]}{i === 0 && <em>시작</em>}</b>
                    <small>{need}</small>
                    <span className={o.grades}>
                      {LEVEL_INFO[id].grades.map((gr) => <span key={gr}><i style={{ background: `var(--gr-${gr})` }} />{GRADES[gr].ko}</span>)}
                    </span>
                  </span>
                  <span className={o.reward}>
                    <b className="num">×{LEVEL_INFO[id].reward.toFixed(1)}</b>
                    <small>보상</small>
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
        <p className={o.fair}>연습생에서 시작해요. 시즌이 끝날 때 <b>정규 시즌 1위</b>이고 다음 단계 조건을 모두 채웠으면 한 단계 올라가고, <b>9·10위</b>면 한 단계 내려가요. 상대 전력은 내 팀 종합을 따라와서 성적 올리기가 쉽지 않아요. 엔진 규칙과 확률은 모든 단계가 같아요.</p>
      </section>

      <section className={s.group} aria-labelledby="fund-h">
        <div className={s.groupHead}><h2 id="fund-h">창단 자금</h2><small>처음 <span className="num">10</span>시즌</small></div>
        <dl className={o.funds}>
          <div><dt><CoinGP size={18} /> GP</dt><dd className="num">{int(ME.gp)}</dd></div>
          <div><dt><GoldenBall size={18} /> 골든볼</dt><dd className="num">{int(ME.ball)}</dd></div>
        </dl>
      </section>

      <Dock note={<span><b>{level.ko} 상대로 개막</b><small>AI 상대는 성적대로 자동 · {shortLabel(t.code)}</small>{switching && played > 0 && <small>지금 시즌 진행은 지우고 {t.short}로 개막전부터 다시 시작해요</small>}</span>}>
        <Button size="l" icon="play" onClick={start}>개막</Button>
      </Dock>
    </>
  );
}
