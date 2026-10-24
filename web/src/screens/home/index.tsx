// 홈 · 클럽하우스 — 담당: 홈·시작·설정 개발자
// 구단 머리(엠블럼·이름·감독·시즌 성적) → 다음 경기 → 오늘 할 일 → 구단 소식 → 팀 종합 → 지난 경기(명장면 다시 보기) → 구단 금고
// 시즌 성적 · 순위 · 선수 기록 · 지난 경기 · 소식은 모두 저장된 시즌 진행(season/store) — 개막일엔 0승 0무 0패, 지난 경기 칸은 없음
import { useMemo } from 'react';
import type { ScreenProps } from '../../app/screen';
import { useAuth } from '../../app/auth';
import { ClubEmblem } from '../../art/emblems';
import { Button, CoinGP, GoldenBall, Icon } from '../../ui';
import { navigate } from '../../app/router';
import { int } from '../../ui/format';
import { ME, myTeam, savedStartClub } from '../../game/mock';
import { gbLabel, isOver, pctLabel, useSeason } from '../../season/store';
import { clubLine, leagueName } from './local-mock';
import { NextGame } from './NextGame';
import { Todo } from './Todo';
import { Feed } from './Feed';
import { TeamPower } from './TeamPower';
import { DeckBadge } from '../../ui/DeckBadge';
import { deckOf } from '../../game/deck';
import { entryMembers, initialLineup, store as lineupStore } from '../lineup/calc';
import { LastGame } from './LastGame';
import { LobbyChat } from '../chat/LobbyChat';
import { LEVEL_KO, nextLevel, useLeague } from '../../season/league';
import s from './home.module.css';

function Masthead({ manager }: { manager: string }) {
  const team = myTeam();
  // 저장된 시즌 진행 — 헤더 · 순위 탭 · 시즌 화면과 같은 값 (개막일엔 0승 0무 0패)
  const season = useSeason();
  const ln = clubLine(team.id, season);
  const r = ln.row;
  const streak = r.streak.endsWith('승') ? `${r.streak.replace('승', '')}연승` : r.streak.endsWith('패') ? `${r.streak.replace('패', '')}연패` : '';
  const next = isOver(season) ? '정규 시즌 끝' : ln.played === 0 ? (ln.started ? '첫 경기 앞' : '개막전 앞') : <><span className="num">{ln.nextNo}</span>번째 경기 앞</>;
  const L = useLeague();
  const up = nextLevel(L.level);
  const deck = useMemo(() => deckOf(entryMembers(lineupStore.get() ?? initialLineup())), []);
  return (
    <section className={s.mast} aria-label="구단">
      <div className={s.mastArt} aria-hidden>
        <span className={s.beamL} />
        <span className={s.beamR} />
        <span className={['halftone', s.waterWrap].join(' ')}><ClubEmblem team={team} size={240} detail="l" className={s.water} decorative /></span>
      </div>
      <p className={s.kicker}>
        <span>{leagueName} <span className="num">{season.year ?? 2027}</span></span>
        <span>구단 <b className="num">{(season.year ?? 2027) - 2026}</b>년차 · {next}</span>
      </p>
      <div className={s.club}>
        <ClubEmblem team={team} size={60} className={s.em} />
        <div className={s.clubText}>
          <h1 className={s.name}>{team.name}</h1>
          <p className={s.mgr}>감독 <b>{manager}</b><i aria-hidden>·</i>{team.stadium.name}</p>
        </div>
        {/* 지금 리그 단계 — 구단 줄 오른쪽 아래에 크게 (누르면 경기 준비·진행의 리그 단계) */}
        <button type="button" className={[s.lvBadge, s['lv-' + L.level]].join(' ')} onClick={() => navigate('/season')} aria-label={`리그 단계 ${LEVEL_KO[L.level]} — 자세히 보기`}>
          <span className={s.lvK}>리그 단계</span>
          <b className={s.lvV}>{LEVEL_KO[L.level]}</b>
          <small className={s.lvS}>{up ? <>다음 {LEVEL_KO[up]}</> : '최고 단계'}{L.stay > 0 && <> · <span className="num">{L.stay + 1}</span>시즌째</>}</small>
        </button>
      </div>
      {/* 내 덱 — 1군 엔트리의 세트덱으로 '무슨 덱'인지 (누르면 세트덱) */}
      <button type="button" className={s.deckRow} onClick={() => navigate('/sets')} aria-label={`내 덱 ${deck.label} — 세트덱 보기`}>
        <span className={s.deckK}>내 덱</span>
        <DeckBadge deck={deck} size="l" />
      </button>
      <dl className={s.stats}>
        <div>
          <dt>순위</dt>
          <dd>{ln.started ? <>{ln.tied && <span>공동</span>}<b className="num-display">{ln.rank}</b><span>위</span></> : <><b className="num-display">—</b><span>개막 전</span></>}</dd>
        </div>
        <div>
          <dt>승률</dt>
          <dd><b className="num">{pctLabel(r)}</b></dd>
        </div>
        <div>
          <dt>게임 차</dt>
          <dd><b className="num">{gbLabel(r)}</b></dd>
        </div>
        <div className={s.formCell}>
          <dt>최근 10경기</dt>
          <dd>
            {ln.form ? (
              <span className={s.form} aria-label={`최근 10경기 ${ln.form.split('').map((c) => (c === 'W' ? '승' : c === 'L' ? '패' : '무')).join(' ')}`}>
                {ln.form.split('').map((c, i) => <i key={i} className={c === 'W' ? s.fw : c === 'L' ? s.fl : s.fd} />)}
              </span>
            ) : <small>아직 경기 전</small>}
            {streak && <small>{streak}</small>}
          </dd>
        </div>
      </dl>
    </section>
  );
}

/** 처음 — 아직 구단을 안 골랐으면 구단 선택으로 (고른 구단이 앱 전체의 내 구단이 된다) */
function StartGuide() {
  if (savedStartClub()) return null;
  return (
    <section className={s.guide} aria-label="처음 시작">
      <p>
        <b>2027 시즌을 함께할 구단을 골라 주세요</b>
        <span>지금은 기본 구단({myTeam().short})으로 보여요 — 현재 구단 10 · 옛 구단 10 중에서</span>
      </p>
      <Button size="m" icon="arrow-right" onClick={() => navigate('/club-select?step=club')}>구단 고르기</Button>
    </section>
  );
}

function Vault({ seasonNo }: { seasonNo: number }) {
  const left = ME.richUntil - seasonNo;
  const warn = seasonNo >= 8 && left >= 0;
  return (
    <section className={s.vault} aria-labelledby="vault-h">
      <h2 id="vault-h" className={s.vh}>구단 금고</h2>
      <dl className={s.money}>
        <div>
          <dt><CoinGP size={18} /> GP</dt>
          <dd className="num">{int(ME.gp)}</dd>
        </div>
        <div>
          <dt><GoldenBall size={18} /> 골든볼</dt>
          <dd className="num">{int(ME.ball)}</dd>
        </div>
      </dl>
      {warn ? (
        <p className={s.notice} role="note">
          <Icon name="alert" size={16} />
          <span>
            <b>자금 정리까지 {left === 0 ? '이번 시즌' : <><span className="num">{left}</span>시즌</>}</b>
            11시즌부터 지갑이 정상 수준으로 정리돼요(예정: GP 5천만 · 골든볼 5천). 그 전에 쓸 곳을 정해 두세요.
          </span>
        </p>
      ) : (
        <p className={s.vaultNote}>
          처음 <b className="num">{ME.richUntil}</b>시즌은 마음껏 쓰세요. 11시즌부터는 경기·시즌 보상으로 꾸리는 정상 경제예요.
        </p>
      )}
    </section>
  );
}

export default function HomeScreen({ query }: ScreenProps) {
  const { user } = useAuth();
  // 미리보기: #/home?season=8 이면 8시즌 화면 (자금 정리 예고)
  const qs = Number(query.get('season'));
  const season = useSeason();
  // 몇 번째 시즌 — 2027 이 1시즌째, 시즌이 끝나 다음 해로 넘어갈 때마다 하나씩
  const seasonNo = Number.isFinite(qs) && qs > 0 ? qs : Math.max(ME.seasonNo, (season.year ?? 2027) - 2026);
  return (
    <div className={s.home}>
      <StartGuide />
      <Masthead manager={user ?? ME.user} />
      <NextGame />
      <Todo />
      <LobbyChat />
      <Feed />
      <TeamPower />
      <LastGame />
      <Vault seasonNo={seasonNo} />
    </div>
  );
}
