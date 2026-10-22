// 미리보기 — 로그인 없이 모든 화면 · 테마 전환 · 공용 부품을 보는 곳 (사용자가 휴대폰으로 본다)
import { useState } from 'react';
import {
  Button, CalloutStage, Emblem, Field, Gauge, Icon, ICON_NAMES, Num, Sheet, StatBar, Tabs, ThemePicker, useToast,
  type CalloutData, type CalloutPace,
} from '../ui';
import { Card, cardProps } from '../cards';
import { CARDS, LAST_MATCH, LINEUP_EVAL, ME, PLAYERS, TEAMS, teamById } from '../game/mock';
import { LEAGUE } from '../game/world';
import { GRADE_ORDER_ALL, GRADES } from '../game/grades';
import { FIELD_SPOTS } from '../game/field';
import { useTheme } from '../theme/ThemeProvider';
import { ROUTES } from './routes';
import { Link } from './router';
import s from './Preview.module.css';

const SCREEN_LIST = [
  { no: 1, title: '로그인', path: '/login', desc: '가입 · 로그인 · 복구 코드로 비밀번호 다시 정하기', ready: true },
  ...ROUTES.slice().sort((a, b) => order(a.key) - order(b.key)).map((r, i) => ({
    no: i + 2, title: r.title, path: r.sample ?? r.path, desc: r.desc, ready: false,
  })),
];
function order(k: string) {
  return ['club-select', 'home', 'lineup', 'match', 'cards', 'player', 'gacha', 'shop', 'pvp', 'settings'].indexOf(k);
}

const team = (id: string) => {
  const t = teamById(id);
  return { primary: t.colors.primary, secondary: t.colors.secondary, ink: t.colors.ink };
};
const hl = (id: string) => LAST_MATCH.plays.find((p) => p.id === id)!;
const fromPlay = (id: string): CalloutData => {
  const p = hl(id);
  const h = p.highlight!;
  return { id, kind: h.kind, title: h.title, sub: h.sub, meta: h.meta, causes: p.causes?.map((c) => c.text), team: team(h.teamId) };
};
const DEMOS: { label: string; data: CalloutData }[] = [
  { label: '호수비', data: fromPlay('a21') },
  {
    label: '역전 홈런',
    data: {
      id: 'a17', kind: 'go-ahead', title: '역전 3점 홈런!', sub: '남궁율 · 5회초 밀어서 좌중간',
      meta: '거인츠 승리 확률 44% → 73%', causes: [hl('a17').causes![0].text], team: team('bs'),
    },
  },
  { label: '동점 적시타', data: fromPlay('a22') },
  { label: '위기 탈출', data: fromPlay('a26') },
  { label: '끝내기', data: fromPlay('a29') },
];

const PACES: { value: CalloutPace; label: string }[] = [
  { value: 'quick', label: '빨리 보기' },
  { value: 'normal', label: '주요 장면' },
  { value: 'slow', label: '자세히' },
];

/** 등급마다 카드 한 장 */
const GRADE_CARDS = GRADE_ORDER_ALL.map((g) => CARDS.find((c) => c.grade === g)!).filter(Boolean);

export function Preview() {
  const { info } = useTheme();
  const toast = useToast();
  const [callout, setCallout] = useState<CalloutData | null>(null);
  const [pace, setPace] = useState<CalloutPace>('normal');
  const [tab, setTab] = useState<'a' | 'b' | 'c'>('a');
  const [sheet, setSheet] = useState(false);
  const fire = (d: CalloutData) => setCallout({ ...d, id: `${d.id}-${Date.now()}` });

  return (
    <div className={s.page}>
      <header className={s.intro}>
        <p className={s.eyebrow}><span className="num">2027</span> 시즌 · 화면 미리보기</p>
        <h1 className={s.title}>모든 화면을<br />한눈에 둘러봐요</h1>
        <p className={s.lead}>로그인 없이 볼 수 있어요. 숫자와 선수는 아직 목업이에요. 테마를 바꾸면 모든 화면이 같이 바뀌고, 이 기기에 기억돼요.</p>
      </header>

      <section className={s.sec}>
        <h2 className={s.h}><span>테마</span><em>지금 · {info.ko}</em></h2>
        <ThemePicker />
      </section>

      <section className={s.sec}>
        <h2 className={s.h}><span>화면</span><em className="num">{SCREEN_LIST.length}</em></h2>
        <ol className={s.screens}>
          {SCREEN_LIST.map((sc) => (
            <li key={sc.path}>
              <Link to={sc.path} className={s.screen}>
                <span className={['num', s.no].join(' ')}>{String(sc.no).padStart(2, '0')}</span>
                <span className={s.sText}>
                  <b>{sc.title}</b>
                  <small>{sc.desc}</small>
                </span>
                <span className={[s.state, sc.ready && s.ready].filter(Boolean).join(' ')}>{sc.ready ? '완료' : '준비 중'}</span>
                <Icon name="chevron" size={16} className={s.chev} />
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className={s.sec}>
        <h2 className={s.h}><span>구단</span><em>{LEAGUE.name} · {TEAMS.length}개 구단</em></h2>
        <ul className={s.clubs}>
          {TEAMS.map((t) => (
            <li key={t.id} className={s.club}>
              <Emblem team={t} size={40} />
              <b>{t.short}</b>
              <small>{t.region} · {t.stadium.name}</small>
            </li>
          ))}
        </ul>
      </section>

      <section className={s.sec}>
        <h2 className={s.h}><span>강조 문구</span><em>호수비 · 클러치 · 극적인 순간</em></h2>
        <p className={s.note}>경기 화면이 쓰는 부품이에요. 승리 확률이 크게 바뀌거나 잡기 힘든 타구를 잡았을 때만, 한 경기에 몇 번만 떠요.</p>
        <Tabs variant="box" size="s" items={PACES} value={pace} onChange={setPace} aria-label="보기 방식" className={s.paceTabs} />
        <CalloutStage callout={callout} pace={pace} onDone={() => setCallout(null)} className={s.stage}>
          <div className={s.stageField}>
            <Field stadium={teamById('dj').stadium} distances={false}>
              {(['CF', 'RF', 'SS', '2B'] as const).map((p) => (
                <i key={p} className={s.dot} style={{ left: `${FIELD_SPOTS[p].x * 100}%`, top: `${FIELD_SPOTS[p].y * 100}%` }} />
              ))}
            </Field>
          </div>
          <div className={s.bug}>
            <span><i style={{ background: teamById('bs').colors.primary }} />{teamById('bs').short} <b className="num">4</b></span>
            <span><i style={{ background: teamById('dj').colors.primary }} />{teamById('dj').short} <b className="num">4</b></span>
            <span className={s.inn}><b className="num">9</b>회말</span>
          </div>
        </CalloutStage>
        <div className={s.fireRow}>
          {DEMOS.map((d) => (
            <Button key={d.label} size="s" variant="secondary" onClick={() => fire(d.data)}>{d.label}</Button>
          ))}
        </div>
      </section>

      <section className={s.sec}>
        <h2 className={s.h}><span>카드 등급</span><em>11종 + 특별 선수</em></h2>
        <p className={s.note}>지금은 임시 카드예요. 등급별 테두리는 카드 디자이너가 마저 다듬어요. 등급 이름은 정해 주신 그대로예요.</p>
        <div className={s.cards}>
          {GRADE_CARDS.map((c) => (
            <figure key={c.id} className={s.cardFig}>
              <Card {...cardProps(c)} width={104} />
              <figcaption>
                <b style={{ color: `var(--gr-${c.grade})` }}>{GRADES[c.grade].ko}</b>
                <span>{GRADES[c.grade].frame}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className={s.sec}>
        <h2 className={s.h}><span>부품</span><em>src/ui</em></h2>
        <div className={s.parts}>
          <div className={s.part}>
            <h3>버튼</h3>
            <div className={s.col}>
              <Button block trailing={<><Num value={9000} format="int" /> GP</>}>프리미엄 스카우트</Button>
              <div className={s.row}>
                <Button variant="secondary">라인업 확인</Button>
                <Button variant="ink">한 번 더</Button>
                <Button variant="ghost">취소</Button>
              </div>
              <div className={s.row}>
                <Button size="s" icon="sub">교체</Button>
                <Button size="s" variant="secondary" icon="steal">도루</Button>
                <Button size="s" variant="secondary" icon="bunt">번트</Button>
              </div>
            </div>
          </div>

          <div className={s.part}>
            <h3>탭</h3>
            <div className={s.col}>
              <Tabs items={[{ value: 'a', label: '능력치' }, { value: 'b', label: '기록', count: 71 }, { value: 'c', label: '성장' }]} value={tab} onChange={setTab} />
              <Tabs variant="box" items={[{ value: 'a', label: '수비' }, { value: 'b', label: '타순' }, { value: 'c', label: '투수진' }]} value={tab} onChange={setTab} />
            </div>
          </div>

          <div className={s.part}>
            <h3>팀 종합 게이지</h3>
            <Gauge value={LINEUP_EVAL.overall} base={LINEUP_EVAL.base} potential={LINEUP_EVAL.potential} parts={LINEUP_EVAL.parts.slice(0, 3)} />
          </div>

          <div className={s.part}>
            <h3>능력치 막대</h3>
            <div>
              <StatBar label="컨택" value={84} bonus={5} />
              <StatBar label="파워" value={71} />
              <StatBar label="수비 범위" value={93} />
              <StatBar label="스피드" value={96} scale="fm" note="FM 1~20" />
            </div>
          </div>

          <div className={s.part}>
            <h3>숫자</h3>
            <dl className={s.nums}>
              <div><dt>타율</dt><dd><Num value={0.3124} format="avg" size="l" /></dd></div>
              <div><dt>평균자책</dt><dd><Num value={2.41} format="era" size="l" /></dd></div>
              <div><dt>레벨</dt><dd><Num value={8.99} format="level" size="l" /></dd></div>
              <div><dt>강화</dt><dd><Num value={7} format="roman" size="l" /></dd></div>
              <div><dt>레이팅</dt><dd><Num value={1842} format="int" size="l" /> <Num value={24} format="signed" size="s" /></dd></div>
              <div><dt>구속</dt><dd><Num value={153} size="l" unit="km/h" /></dd></div>
              <div><dt>병살</dt><dd><span className="num" style={{ fontSize: 22 }}>6-4-3</span></dd></div>
              <div><dt>보유 GP</dt><dd><Num value={ME.gp} format="kr" size="l" /></dd></div>
            </dl>
          </div>

          <div className={s.part}>
            <h3>아이콘 <em className="num">{ICON_NAMES.length}</em></h3>
            <ul className={s.icons}>
              {ICON_NAMES.map((n) => (
                <li key={n} title={n}><Icon name={n} size={22} /><small>{n}</small></li>
              ))}
            </ul>
          </div>

          <div className={s.part}>
            <h3>알림 · 시트</h3>
            <div className={s.row}>
              <Button size="s" variant="secondary" onClick={() => toast({ text: '라인업을 저장했어요', tone: 'good' })}>토스트</Button>
              <Button size="s" variant="secondary" onClick={() => toast({ text: '골든볼이 모자라요', tone: 'bad', action: { label: '얻는 법', onClick: () => {} } })}>오류 토스트</Button>
              <Button size="s" variant="secondary" onClick={() => setSheet(true)}>시트 열기</Button>
            </div>
          </div>
        </div>
      </section>

      <footer className={s.foot}>
        <span>선수 <b className="num">{PLAYERS.length}</b> · 카드 <b className="num">{CARDS.length}</b> · 구단 <b className="num">10</b></span>
        <Link to="/login">로그인 화면 보기</Link>
      </footer>

      <Sheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="교체할 선수"
        sub="8회말 · 1사 1·3루 · 좌투 상대"
        footer={<><Button variant="secondary" onClick={() => setSheet(false)}>그대로</Button><Button onClick={() => { setSheet(false); toast('대타 위태건 — 좌투 상대 컨택 +6'); }}>대타 투입</Button></>}
      >
        <div className={s.sheetList}>
          {['p14', 'p21', 'p37'].map((id) => {
            const p = PLAYERS.find((x) => x.id === id)!;
            return (
              <div key={id} className={s.sheetRow}>
                <b>{p.name}</b>
                <span>{p.pos} · {teamById(p.teamId).region}</span>
                <Num value={p.season.bat?.avg ?? 0} format="avg" size="m" />
              </div>
            );
          })}
        </div>
      </Sheet>
    </div>
  );
}
