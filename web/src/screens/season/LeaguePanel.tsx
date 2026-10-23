// 리그 단계 판 — 지금 AI 상대 단계 · 오르내림 규칙 · 다음 단계 조건(지금 값과 함께) · 지난 시즌 기록.
// 시즌이 끝났으면 '이 순위면 어떻게 되는지'와 다음 해 시즌 시작 버튼. 시즌 화면 · 경기 끝 화면이 같이 쓴다.
import { useMemo } from 'react';
import { Link } from '../../app/router';
import type { LineupState } from '../lineup/calc';
import { Button, useToast } from '../../ui';
import { ME } from '../../game/mock';
import { GATE, LEVELS, LEVEL_KO, LEVEL_INFO, PROMOTE_RANK, RELEGATE_RANK, gateItems, gateOk, metLevel, nextLevel, teamStatus, useLeague, type AiLevel } from '../../season/league';
import { isOver, nextSeason, standingsOf, useSeason, yearOf } from '../../season/store';
import s from './LeaguePanel.module.css';

/** 시즌 끝 — 지금 순위 · 조건이면 다음 해 단계 */
function forecast(level: AiLevel, rank: number, met: AiLevel, upOk: boolean) {
  const i = LEVELS.indexOf(level);
  const up = nextLevel(level);
  if (rank <= PROMOTE_RANK && up && upOk) return { to: up, text: `1위 — ${LEVEL_KO[up]}로 올라가요`, tone: 'up' as const };
  if (rank >= RELEGATE_RANK && i > 0) return { to: LEVELS[i - 1], text: `${rank}위 — ${LEVEL_KO[LEVELS[i - 1]]}로 내려가요`, tone: 'down' as const };
  if (LEVELS.indexOf(met) < i) return { to: met, text: `${LEVEL_KO[level]} 조건이 깨져 ${LEVEL_KO[met]}로 내려가요`, tone: 'down' as const };
  if (rank <= PROMOTE_RANK && up) return { to: level, text: `1위지만 ${LEVEL_KO[up]} 조건이 모자라 그대로예요`, tone: 'stay' as const };
  return { to: level, text: `${rank}위 — 그대로 ${LEVEL_KO[level]}`, tone: 'stay' as const };
}

/** 다음 해 시즌 시작 — 리그 단계를 옮기고 결과를 알림으로 */
export function useStartNextSeason() {
  const toast = useToast();
  return () => {
    const rec = nextSeason();
    if (!rec) return;
    const head = rec.move === 'up' ? '승격!' : rec.move === 'stay' ? '잔류' : '강등';
    toast({ text: `${rec.year + 1} 시즌 개막 — ${head} AI 상대 ${LEVEL_KO[rec.to]} · ${rec.note}`, tone: rec.move === 'up' ? 'good' : rec.move === 'stay' ? 'info' : 'bad', duration: 6500 });
    window.scrollTo({ top: 0 });
  };
}

export function LeaguePanel({ endOnly = false }: { endOnly?: boolean }) {
  const L = useLeague();
  const season = useSeason();
  const over = isOver(season);
  const year = yearOf(season);
  // 라인업 · 카드가 바뀌면 값도 바뀐다 — 화면을 열 때마다 새로 (가벼운 계산)
  const t = useMemo(() => teamStatus(), [season, L]);
  const up = nextLevel(L.level);
  const upItems = up ? gateItems(up, t) : [];
  const rank = standingsOf(season).find((r) => r.teamId === ME.teamId)?.rank ?? 0;
  const fc = over ? forecast(L.level, rank, metLevel(t), !!up && gateOk(up, t)) : null;

  const start = useStartNextSeason();

  if (endOnly && !over) return null;
  return (
    <section className={s.panel} aria-label="리그 단계">
      <div className={s.head}>
        <p className={s.kicker}><span className="num">{year}</span> 리그 단계 · AI 상대</p>
        <ol className={s.ladder} aria-label="단계">
          {LEVELS.map((l) => (
            <li key={l} className={[s.rung, l === L.level && s.on, LEVELS.indexOf(l) < LEVELS.indexOf(L.level) && s.past].filter(Boolean).join(' ')} aria-current={l === L.level ? 'step' : undefined}>
              {LEVEL_KO[l]}
            </li>
          ))}
        </ol>
        <p className={s.now}>
          <b>{LEVEL_KO[L.level]}</b> <span>{LEVEL_INFO[L.level].desc}</span>
          {L.stay > 0 && <small> · 이 단계 <span className="num">{L.stay + 1}</span>번째 시즌 (오래 머물수록 상대가 조금씩 세져요)</small>}
        </p>
        <p className={s.rule}>
          <i className={s.arrUp} aria-hidden>▲</i> 정규 시즌 <b>1위</b> + 다음 단계 조건 → 한 단계 위로 ·
          <i className={s.arrDown} aria-hidden>▼</i> <b>{RELEGATE_RANK}·10위</b> → 한 단계 아래로 · 상대 전력은 내 팀 종합을 따라와요
        </p>
      </div>

      {fc && (
        <div className={[s.fc, s[fc.tone]].join(' ')}>
          <p><b>{fc.text}</b></p>
          {season.post?.champion ? (
            <>
              <Button size="l" block icon="play" onClick={start}><span className="num">{year + 1}</span> 시즌 시작</Button>
              <small>기록은 게임 통산에 남고, 모든 구단 0승 0무 0패로 새 해 개막일부터 시작해요.</small>
            </>
          ) : (
            <small>포스트시즌(가을야구)이 끝나면 <span className="num">{year + 1}</span> 시즌으로 넘어가요. 단계는 정규 시즌 순위로 정해져요.</small>
          )}
        </div>
      )}

      {up ? (
        <div className={s.next}>
          <p className={s.nextH}>{LEVEL_KO[up]} 조건 <small>모두 채우고 1위를 하면 올라가요</small></p>
          <ul className={s.items}>
            {upItems.map((x) => (
              <li key={x.label} className={x.ok ? s.ok : s.no}>
                <i aria-hidden>{x.ok ? '✓' : '·'}</i>
                <span>{x.label}</span>
                <small>{x.now}</small>
              </li>
            ))}
          </ul>
          {GATE[up].teamYear != null && (
            <p className={s.tip}>단일팀 연도덱 = 라인업 엔트리 20명 중 같은 구단 · 같은 연도 카드. 그 연도가 그 구단 우승 연도여야 우승덱이에요.</p>
          )}
        </div>
      ) : (
        <p className={s.top}>가장 높은 단계예요. 1위를 지키면 그대로, 9·10위면 내려가요.</p>
      )}

      {L.history.length > 0 && (
        <ul className={s.hist} aria-label="지난 시즌">
          {L.history.slice(-5).reverse().map((h) => (
            <li key={h.year}>
              <span className="num">{h.year}</span>
              <span>{LEVEL_KO[h.level]}</span>
              <span><span className="num">{h.rank}</span>위 · <span className="num">{h.w}</span>승 <span className="num">{h.l}</span>패</span>
              <b className={h.move === 'up' ? s.upT : h.move === 'stay' ? undefined : s.downT}>{h.move === 'up' ? '승격' : h.move === 'stay' ? '잔류' : '강등'}</b>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** 한 줄 — 라인업 화면 게이지 아래: '리그 단계 연습생 · 2군까지 팀 종합 80 (지금 65)' (누르면 시즌 화면) */
export function LeagueLine({ st }: { st?: LineupState }) {
  const L = useLeague();
  const t = useMemo(() => teamStatus(st), [st, L]);
  const up = nextLevel(L.level);
  const miss = up ? gateItems(up, t).filter((x) => !x.ok) : [];
  return (
    <Link to="/season" className={s.line} aria-label="리그 단계 보기">
      <span className={s.lineLv}>{LEVEL_KO[L.level]}</span>
      {up
        ? miss.length
          ? <span className={s.lineTxt}>{LEVEL_KO[up]}까지 · {miss[0].label} <small>({miss[0].now})</small>{miss.length > 1 && <small> 외 <span className="num">{miss.length - 1}</span>개</small>}</span>
          : <span className={s.lineTxt}><b>{LEVEL_KO[up]} 조건 모두 채움</b> — 정규 시즌 1위면 올라가요</span>
        : <span className={s.lineTxt}>가장 높은 단계</span>}
    </Link>
  );
}
