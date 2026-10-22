// 설정 — 담당: 홈·시작·설정 개발자
// 테마(미리보기와 함께 바로 바뀜) · 경기 보기 방식(기본 빨리 보기) · 강조 문구 · 소리(자리) · 로그인된 기기(자리) · 경기 운영 · 정보
import { useState, type ReactNode } from 'react';
import type { ScreenProps } from '../../app/screen';
import { useAuth } from '../../app/auth';
import { Link } from '../../app/router';
import { useTheme } from '../../theme/ThemeProvider';
import type { ThemeId } from '../../theme/themes';
import { Button, CalloutStage, Field, Icon, Sheet, useToast, type CalloutData } from '../../ui';
import { ClubEmblem } from '../../art/emblems';
import { LAST_MATCH, myTeam, teamById } from '../../game/mock';
import { WATCH_MODES, paceOf, setPrefs, usePrefs, type SoundPrefs } from './prefs';
import s from './settings.module.css';

function Section({ id, title, note, children }: { id: string; title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className={s.section} aria-labelledby={id}>
      <div className={s.secHead}><h2 id={id}>{title}</h2>{note && <small>{note}</small>}</div>
      {children}
    </section>
  );
}

/** 테마 견본 — 타일마다 data-theme 를 붙여 그 테마 토큰으로 진짜 그린다 */
function ThemeTiles() {
  const { theme, themes, setTheme } = useTheme();
  const me = myTeam();
  const away = teamById(LAST_MATCH.awayId);
  return (
    <div className={s.themes} role="radiogroup" aria-label="테마">
      {themes.map((t) => {
        const on = t.id === theme;
        return (
          <button key={t.id} type="button" role="radio" aria-checked={on} className={[s.tile, on && s.tileOn].filter(Boolean).join(' ')} onClick={() => setTheme(t.id as ThemeId)}>
            <span className={s.sample} data-theme={t.id} aria-hidden>
              <span className={s.sHead}><ClubEmblem team={me} size={14} decorative /><b>{me.short}</b><i className="num">1조</i></span>
              <span className={s.sBoard}>
                <span><em style={{ background: away.colors.primary }} />{away.short}<b className="num">4</b></span>
                <span><em style={{ background: me.colors.primary }} />{me.short}<b className="num">5</b></span>
                <small>9회말 끝</small>
              </span>
              <span className={s.sBody}>
                <b className="num-display">91</b>
                <span className={s.sBar}><i /></span>
              </span>
            </span>
            <span className={s.tileText}>
              <b>{t.ko}</b>
              <small>{t.desc}</small>
            </span>
            <span className={s.tileState}>{on ? '사용 중' : '바꾸기'}</span>
          </button>
        );
      })}
    </div>
  );
}

/** 보기 방식 — 9이닝 중 화면에 머무는 정도를 막대로 */
function WatchModes() {
  const p = usePrefs();
  return (
    <div className={s.modes} role="radiogroup" aria-label="경기 보기 방식">
      {WATCH_MODES.map((m) => {
        const on = p.watch === m.id;
        return (
          <button key={m.id} type="button" role="radio" aria-checked={on} className={[s.mode, on && s.modeOn].filter(Boolean).join(' ')} onClick={() => setPrefs({ watch: m.id })}>
            <span className={s.radio} aria-hidden />
            <span className={s.modeText}>
              <b>{m.ko}{m.id === 'quick' && <em>기본</em>}</b>
              <small>{m.desc}</small>
            </span>
            <span className={s.modeTime}>
              <span className={s.dwell} aria-hidden>
                {m.dwell.map((d, i) => <i key={i} style={{ height: `${20 + d * 20}%` }} className={d === 0 ? s.skip : undefined} />)}
              </span>
              <small>{m.time}</small>
            </span>
          </button>
        );
      })}
    </div>
  );
}

const DEMO = (() => {
  const p = LAST_MATCH.plays.find((x) => x.highlight?.kind === 'defense')!;
  const t = teamById(p.highlight!.teamId);
  return {
    hit: p.hit!,
    data: { kind: p.highlight!.kind, title: p.highlight!.title, sub: p.highlight!.sub, meta: p.highlight!.meta, causes: p.causes?.map((c) => c.text), team: { primary: t.colors.primary, secondary: t.colors.secondary, ink: t.colors.ink } } satisfies CalloutData,
  };
})();

/** 강조 문구 미리보기 — 지금 보기 방식의 빠르기로 */
function CalloutDemo() {
  const p = usePrefs();
  const [c, setC] = useState<CalloutData | null>(null);
  const play = () => setC({ ...DEMO.data, id: Date.now() });
  return (
    <div className={s.demo}>
      <CalloutStage callout={c} pace={paceOf(p.watch)} noShake={!p.shake} onDone={() => setC(null)} className={s.stage}>
        <div className={s.stageField}>
          <Field stadium={myTeam().stadium} distances={false} svg={<circle cx={DEMO.hit.x * 400} cy={DEMO.hit.y * 400} r="7" className={s.ball} />} />
        </div>
      </CalloutStage>
      <div className={s.demoRow}>
        <Button variant="secondary" size="s" icon="play" onClick={play}>호수비 장면으로 보기</Button>
        <label className={s.toggle}>
          <input type="checkbox" checked={p.shake} onChange={(e) => setPrefs({ shake: e.target.checked })} />
          <span className={s.switch} aria-hidden />
          <span>화면 흔들림</span>
        </label>
      </div>
    </div>
  );
}

function Sound() {
  const p = usePrefs();
  const rows: { k: keyof Omit<SoundPrefs, 'mute'>; ko: string; note: string }[] = [
    { k: 'bgm', ko: '배경 음악', note: '메뉴·경기장' },
    { k: 'cheer', ko: '응원가', note: '구단 응원가·선수 구호' },
    { k: 'sfx', ko: '효과음', note: '타구·뽑기' },
  ];
  return (
    <div className={s.sound}>
      {rows.map((r) => (
        <label key={r.k} className={[s.vol, p.sound.mute && s.muted].filter(Boolean).join(' ')}>
          <span className={s.volText}><b>{r.ko}</b><small>{r.note}</small></span>
          <input type="range" min={0} max={10} step={1} value={p.sound[r.k]} disabled={p.sound.mute} onChange={(e) => setPrefs({ sound: { ...p.sound, [r.k]: Number(e.target.value) } })} style={{ ['--v' as string]: `${p.sound[r.k] * 10}%` }} />
          <span className={['num', s.volNum].join(' ')}>{p.sound[r.k]}</span>
        </label>
      ))}
      <label className={s.toggle}>
        <input type="checkbox" checked={p.sound.mute} onChange={(e) => setPrefs({ sound: { ...p.sound, mute: e.target.checked } })} />
        <span className={s.switch} aria-hidden />
        <span>모두 끄기</span>
      </label>
      <p className={s.soon}>소리는 아직 준비 중이에요 — 직접 만든 응원가가 들어오면 이 값대로 나와요.</p>
    </div>
  );
}

const DEVICES = [
  { id: 'd1', name: '이 기기', detail: '휴대폰 · 브라우저', when: '지금', me: true },
  { id: 'd2', name: '노트북', detail: 'Windows · 브라우저', when: '2일 전' },
  { id: 'd3', name: '태블릿', detail: '브라우저', when: '9일 전' },
];

function Devices() {
  const { status, user, logout } = useAuth();
  const toast = useToast();
  const [ask, setAsk] = useState(false);
  return (
    <>
      <p className={s.who}>
        {status === 'in' ? <><Icon name="user" size={16} /><b>{user}</b> 로 들어와 있어요</> : <><Icon name="eye" size={16} />로그인 없이 둘러보는 중 <Link to="/login" className={s.loginLink}>로그인</Link></>}
      </p>
      <ul className={s.devices}>
        {DEVICES.map((d) => (
          <li key={d.id}>
            <span className={s.devName}><b>{d.name}</b>{d.me && <em>지금 쓰는 기기</em>}<small>{d.detail}</small></span>
            <span className={s.devWhen}>{d.when}</span>
          </li>
        ))}
      </ul>
      <p className={s.soon}>기기 목록은 서버와 연결하면 실제 기기로 바뀌어요. 같은 기기면 다음부터 로그인 없이 들어와요.</p>
      <div className={s.outs}>
        <Button variant="secondary" icon="logout" disabled={status !== 'in'} onClick={() => logout()}>이 기기 로그아웃</Button>
        <Button variant="ghost" onClick={() => setAsk(true)}>모든 기기 로그아웃</Button>
      </div>
      <Sheet
        open={ask}
        onClose={() => setAsk(false)}
        title="모든 기기에서 로그아웃할까요?"
        sub="노트북·태블릿에서도 다시 로그인해야 해요."
        footer={<><Button variant="secondary" onClick={() => setAsk(false)}>그만두기</Button><Button onClick={() => { setAsk(false); toast({ text: '모든 기기 로그아웃은 서버 연결 뒤 열려요', tone: 'info' }); }}>모두 로그아웃</Button></>}
      />
    </>
  );
}

export default function SettingsScreen(_: ScreenProps) {
  const p = usePrefs();
  const mode = WATCH_MODES.find((m) => m.id === p.watch)!;
  return (
    <div className={s.page}>
      <Section id="set-theme" title="테마" note="누르면 바로 바뀌고, 이 기기에 기억해요">
        <ThemeTiles />
      </Section>
      <Section id="set-watch" title="경기 보기" note={<>지금 <b>{mode.ko}</b></>}>
        <WatchModes />
        <div className={s.sub}>
          <h3>강조 문구</h3>
          <p>호수비·클러치 히트·끝내기처럼 승부가 크게 흔들린 순간에만, 한 경기 3~4번 크게 띄워요. 어느 보기 방식에서도 떠요.</p>
          <CalloutDemo />
        </div>
      </Section>
      <Section id="set-sound" title="소리">
        <Sound />
      </Section>
      <Section id="set-play" title="경기 운영">
        <ul className={s.links}>
          <li><span><b>전술</b><small>팀 · 그룹(테이블세터·클린업·필승조) · 선수 개인 지시</small></span><em>준비 중</em></li>
          <li><span><b>AI 상대 난이도</b><small>시즌을 시작할 때 6단계 중에서 골라요</small></span><em>시즌 시작 때</em></li>
          <li><Link to="/club-select?step=club" className={s.linkRow}><span><b>처음 시작 다시 보기</b><small>구단 · 지명 · 특별 선수 · 개막</small></span><Icon name="chevron" size={16} /></Link></li>
        </ul>
      </Section>
      <Section id="set-account" title="계정 · 기기">
        <Devices />
      </Section>
      <p className={s.ver}>야구 매니저 · 2027 시즌 시험판</p>
    </div>
  );
}
