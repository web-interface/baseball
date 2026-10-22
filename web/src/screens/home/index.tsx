// 홈 · 클럽하우스 — 담당: 홈·시작·설정 개발자
// 구단 머리(엠블럼·이름·감독·시즌 성적) → 다음 경기 → 오늘 할 일 → 구단 소식 → 팀 종합 → 어제 경기(명장면 다시 보기) → 구단 금고
import type { ScreenProps } from '../../app/screen';
import { useAuth } from '../../app/auth';
import { ClubEmblem } from '../../art/emblems';
import { CoinGP, GoldenBall, Icon } from '../../ui';
import { avg, int } from '../../ui/format';
import { ME, myTeam } from '../../game/mock';
import { clubLine, leagueName } from './local-mock';
import { NextGame } from './NextGame';
import { Todo } from './Todo';
import { Feed } from './Feed';
import { TeamPower } from './TeamPower';
import { LastGame } from './LastGame';
import { LobbyChat } from '../chat/LobbyChat';
import s from './home.module.css';

function Masthead({ manager }: { manager: string }) {
  const team = myTeam();
  const ln = clubLine(team.id);
  const r = ln.row;
  const pct = r.w / Math.max(1, r.w + r.l);
  const streak = r.streak.endsWith('승') ? `${r.streak.replace('승', '')}연승` : r.streak.endsWith('패') ? `${r.streak.replace('패', '')}연패` : r.streak;
  return (
    <section className={s.mast} aria-label="구단">
      <div className={s.mastArt} aria-hidden>
        <span className={s.beamL} />
        <span className={s.beamR} />
        <span className={['halftone', s.waterWrap].join(' ')}><ClubEmblem team={team} size={240} detail="l" className={s.water} decorative /></span>
      </div>
      <p className={s.kicker}>
        <span>{leagueName} <span className="num">2027</span></span>
        <span>구단 <b className="num">{ME.seasonNo}</b>년차 · <span className="num">{ln.nextNo}</span>번째 경기 앞</span>
      </p>
      <div className={s.club}>
        <ClubEmblem team={team} size={60} className={s.em} />
        <div className={s.clubText}>
          <h1 className={s.name}>{team.name}</h1>
          <p className={s.mgr}>감독 <b>{manager}</b><i aria-hidden>·</i>{team.stadium.name}</p>
        </div>
      </div>
      <dl className={s.stats}>
        <div>
          <dt>순위</dt>
          <dd><b className="num-display">{ln.rank}</b><span>위</span></dd>
        </div>
        <div>
          <dt>승률</dt>
          <dd><b className="num">{avg(pct)}</b></dd>
        </div>
        <div>
          <dt>게임 차</dt>
          <dd><b className="num">{r.gb === 0 ? '—' : r.gb.toFixed(1)}</b></dd>
        </div>
        <div className={s.formCell}>
          <dt>최근 10경기</dt>
          <dd>
            <span className={s.form} aria-label={`최근 10경기 ${r.last10.split('').map((c) => (c === 'W' ? '승' : c === 'L' ? '패' : '무')).join(' ')}`}>
              {r.last10.split('').map((c, i) => <i key={i} className={c === 'W' ? s.fw : c === 'L' ? s.fl : s.fd} />)}
            </span>
            <small>{streak}</small>
          </dd>
        </div>
      </dl>
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
  const seasonNo = Number.isFinite(qs) && qs > 0 ? qs : ME.seasonNo;
  return (
    <div className={s.home}>
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
