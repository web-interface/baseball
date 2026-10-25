// 박스스코어 — 경기 머리(원정 점수 : 점수 홈) · 이닝 점수(R H E) · 승패세 · 주요 기록(결승타 · 홈런 · 2루타 · 3루타 · 도루)
// · 타자(타순 · 이름 · 위치 · 타수 득점 안타 타점 홈런 볼넷 삼진) · 투수(이닝 피안타 실점 자책 볼넷 삼진 홈런 · 승패세홀).
// 저장 전 우리 경기 · 기록과 다른 다시 계산은 board(점수판)만.
import { Link } from '../../app/router';
import { Emblem } from '../../ui';
import { NameYear } from '../../cards';
import { ME, teamById } from '../../game/mock';
import { longDate, startTime } from '../../season/schedule';
import type { BoxBat, BoxPit, BoxView, Dec } from '../../season/box';
import type { SeriesId } from '../../season/post';
import { SERIES_KO, ipText } from './shared';
import s from './box.module.css';

type Who = { id: string; name: string };
export interface BoardData {
  date: string;
  away: string; home: string;
  score: [number, number];
  innings: number;
  walkoff: boolean;
  line?: [number[], number[]];
  hits?: [number, number];
  errors?: [number, number];
  dec: { w?: Who; l?: Who; s?: Who };
  post?: { series: string; no: number };
  /** 우리 정규 시즌 몇 번째 경기 (0 = 모름 · 우리 경기 아님) */
  gameNo?: number;
}

/** 위치 — 기록지 표기 (一 二 三 = 1 · 2 · 3루수) */
const POS_BOX: Record<string, string> = { P: '투', C: '포', '1B': '一', '2B': '二', '3B': '三', SS: '유', LF: '좌', CF: '중', RF: '우', DH: '지', PH: '타', PR: '주' };
const DEC_KO: Record<Exclude<Dec, ''>, string> = { W: '승', L: '패', S: '세', H: '홀' };

export function BoxScore({ board, view, note, loading }: { board: BoardData; view?: BoxView; note?: string; loading?: boolean }) {
  const a = teamById(board.away), h = teamById(board.home);
  const win = board.score[0] > board.score[1] ? 0 : board.score[1] > board.score[0] ? 1 : -1;
  const mySide = board.away === ME.teamId ? 0 : board.home === ME.teamId ? 1 : -1;
  const status = board.walkoff ? `${board.innings}회말 끝내기` : win < 0 ? (board.innings > 9 ? `${board.innings}회 무승부` : '무승부') : board.innings > 9 ? `연장 ${board.innings}회` : '경기 종료';
  const kind = board.post ? `${SERIES_KO[board.post.series as SeriesId] ?? '포스트시즌'} ${board.post.no}차전` : '정규 시즌';
  return (
    <article className={s.box} aria-label={`${a.short} ${board.score[0]} 대 ${h.short} ${board.score[1]} 박스스코어`}>
      <p className={s.kicker}>
        <span><b>{kind}</b>{board.gameNo ? <> · <span className="num">{board.gameNo}</span>번째 경기</> : null}</span>
        <span>{longDate(board.date)} <span className="num">{startTime(board.date)}</span> · {h.stadium.name}</span>
      </p>

      <section className={s.board} aria-label="점수판">
        <div className={s.final}>
          {[0, 1].map((side) => {
            const t = side === 0 ? a : h;
            return (
              <div key={side} className={[s.fTeam, side === 1 && s.fHome, win === side && s.fWin, win >= 0 && win !== side && s.fLose, mySide === side && s.fMine].filter(Boolean).join(' ')}>
                <Emblem team={t} size={34} />
                <span className={s.fName}>
                  <b>{t.short}</b>
                  <small>{side === 0 ? '원정' : '홈'}{mySide === side ? ' · 우리' : ''}</small>
                </span>
              </div>
            );
          })}
          <div className={s.fScore}>
            <span className={['num-display', s.fNum, win === 0 && s.fNumWin].filter(Boolean).join(' ')}>{board.score[0]}</span>
            <i aria-hidden>:</i>
            <span className={['num-display', s.fNum, win === 1 && s.fNumWin].filter(Boolean).join(' ')}>{board.score[1]}</span>
            <small>{status}</small>
          </div>
        </div>

        {board.line && <LineScore board={board} />}

        {(board.dec.w || board.dec.l || board.dec.s) && (
          <p className={s.decs}>
            {(['w', 'l', 's'] as const).map((k) => board.dec[k] && (
              <span key={k}><em>{k === 'w' ? '승' : k === 'l' ? '패' : '세'}</em><Link to={`/player/${board.dec[k]!.id}`}>{board.dec[k]!.name}</Link></span>
            ))}
          </p>
        )}
      </section>

      {note && <p className={s.note}>{note}</p>}
      {loading && <p className={s.loading} aria-live="polite">불러오는 중…</p>}

      {view && <Notables view={view} />}
      {view && ([0, 1] as const).map((side) => <BatTable key={`b${side}`} view={view} side={side} />)}
      {view && ([0, 1] as const).map((side) => <PitTable key={`p${side}`} view={view} side={side} />)}
    </article>
  );
}

/* 이닝 점수 — 9회까지는 늘 칸을 그리고, 홈이 9회말을 안 했으면 X */
function LineScore({ board }: { board: BoardData }) {
  const line = board.line!;
  const n = Math.max(9, board.innings, line[0].length, line[1].length);
  const teams = [teamById(board.away), teamById(board.home)];
  return (
    <div className={s.lineWrap}>
      <table className={s.line}>
        <thead>
          <tr>
            <th scope="col" className={s.lTeam}><span className="sr-only">구단</span></th>
            {Array.from({ length: n }, (_, i) => <th key={i} scope="col" className="num">{i + 1}</th>)}
            <th scope="col" className={['num', s.lR].join(' ')}>R</th>
            <th scope="col" className="num">H</th>
            <th scope="col" className="num">E</th>
          </tr>
        </thead>
        <tbody>
          {([0, 1] as const).map((side) => (
            <tr key={side}>
              <th scope="row" className={s.lTeam}>{teams[side].short}</th>
              {Array.from({ length: n }, (_, i) => {
                const v = line[side][i];
                const wo = board.walkoff && side === 1 && i === line[1].length - 1;
                return <td key={i} className={['num', v ? s.lScored : '', wo ? s.lWo : ''].filter(Boolean).join(' ')}>{v ?? (i < board.innings ? 'X' : '')}</td>;
              })}
              <td className={['num', s.lR].join(' ')}>{board.score[side]}</td>
              <td className="num">{board.hits?.[side] ?? '-'}</td>
              <td className="num">{board.errors?.[side] ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* 주요 기록 — 기록지 아래 줄처럼, 구단별로 (엠블럼 뒤에 그 구단 선수) */
function Notables({ view }: { view: BoxView }) {
  const items: { k: string; sides: [string[], string[]] }[] = [];
  const add = (k: string, side: 0 | 1, v: string) => {
    let it = items.find((x) => x.k === k);
    if (!it) { it = { k, sides: [[], []] }; items.push(it); }
    it.sides[side].push(v);
  };
  if (view.gw) add('결승타', view.gw.side, `${view.gw.name}${view.gw.inn ? `(${view.gw.inn}회)` : ''}`);
  for (const x of view.hr) {
    const bits = [x.inn ? `${x.inn}회` : '', x.runs ? (x.runs === 4 ? '만루' : `${x.runs}점`) : '', x.pitName ?? ''].filter(Boolean);
    add('홈런', x.side, `${x.name}${x.no ? ` ${x.no}호` : ''}${bits.length ? `(${bits.join(' ')})` : ''}`);
  }
  const count = (k: string, pick: (b: BoxBat) => number) => {
    for (const side of [0, 1] as const) for (const b of view.bat[side]) { const n = pick(b); if (n > 0) add(k, side, n > 1 ? `${b.name} ${n}` : b.name); }
  };
  count('2루타', (b) => b.D);
  count('3루타', (b) => b.T);
  count('도루', (b) => b.SB);
  if (!items.length) return null;
  const teams = [teamById(view.away), teamById(view.home)];
  return (
    <section className={s.sec} aria-label="주요 기록">
      <h3 className={s.secH}>주요 기록</h3>
      <dl className={s.notes}>
        {items.map((it) => (
          <div key={it.k}>
            <dt>{it.k}</dt>
            <dd>
              {([0, 1] as const).filter((side) => it.sides[side].length).map((side) => (
                <span key={side} className={s.nGroup}><Emblem team={teams[side]} size={13} decorative /><span>{it.sides[side].join(' · ')}</span></span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function TeamHead({ id, side, what }: { id: string; side: 0 | 1; what: string }) {
  const t = teamById(id);
  return (
    <h3 className={[s.secH, s.teamH].join(' ')}>
      <Emblem team={t} size={18} />
      <span>{t.short} {what}</span>
      <small>{side === 0 ? '원정' : '홈'}{id === ME.teamId ? ' · 우리' : ''}</small>
    </h3>
  );
}
const nameCell = (p: { id: string; name: string; year?: number }, mine: boolean) => (
  <Link to={`/player/${p.id}`} className={s.pName}>{mine ? <NameYear name={p.name} year={p.year} /> : p.name}</Link>
);

function BatTable({ view, side }: { view: BoxView; side: 0 | 1 }) {
  const id = side === 0 ? view.away : view.home;
  const rows = view.bat[side];
  const mine = id === ME.teamId;
  if (!rows.length) return null;
  const sum = (k: 'AB' | 'R' | 'H' | 'RBI' | 'HR' | 'BB' | 'SO') => rows.reduce((a, r) => a + r[k], 0);
  return (
    <section className={s.sec} aria-label={`${teamById(id).short} 타자 기록`}>
      <TeamHead id={id} side={side} what="타자" />
      <table className={[s.tbl, s.bat].join(' ')}>
        <thead>
          <tr>
            <th scope="col" className={s.cOrd}>타순</th>
            <th scope="col" className={s.cNameH}>이름</th>
            <th scope="col" className={s.cPos}>위치</th>
            <th scope="col" className={s.cN}>타수</th>
            <th scope="col" className={s.cN}>득점</th>
            <th scope="col" className={s.cN}>안타</th>
            <th scope="col" className={s.cN}>타점</th>
            <th scope="col" className={s.cN}>홈런</th>
            <th scope="col" className={s.cN}>볼넷</th>
            <th scope="col" className={s.cN}>삼진</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.id}-${i}`} className={r.sub ? s.sub : undefined}>
              <td className={['num', s.cOrd].join(' ')}>{r.sub ? '' : r.ord || ''}</td>
              <td className={s.cName}>{nameCell(r, mine)}</td>
              <td className={s.cPos}>{POS_BOX[r.pos] ?? r.pos}</td>
              <td className={['num', s.cN].join(' ')}>{r.AB}</td>
              <td className={['num', s.cN].join(' ')}>{r.R}</td>
              <td className={['num', s.cN, r.H > 0 && s.hot].filter(Boolean).join(' ')}>{r.H}</td>
              <td className={['num', s.cN, r.RBI > 0 && s.hot].filter(Boolean).join(' ')}>{r.RBI}</td>
              <td className={['num', s.cN, r.HR > 0 && s.hot].filter(Boolean).join(' ')}>{r.HR}</td>
              <td className={['num', s.cN].join(' ')}>{r.BB}</td>
              <td className={['num', s.cN].join(' ')}>{r.SO}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td />
            <th scope="row" colSpan={2}>합계</th>
            {(['AB', 'R', 'H', 'RBI', 'HR', 'BB', 'SO'] as const).map((k) => <td key={k} className={['num', s.cN].join(' ')}>{sum(k)}</td>)}
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

function PitTable({ view, side }: { view: BoxView; side: 0 | 1 }) {
  const id = side === 0 ? view.away : view.home;
  const rows: BoxPit[] = view.pit[side];
  const mine = id === ME.teamId;
  if (!rows.length) return null;
  return (
    <section className={s.sec} aria-label={`${teamById(id).short} 투수 기록`}>
      <TeamHead id={id} side={side} what="투수" />
      <table className={[s.tbl, s.pit].join(' ')}>
        <thead>
          <tr>
            <th scope="col" className={s.cNameH}>이름</th>
            <th scope="col" className={s.cIp}>이닝</th>
            <th scope="col" className={s.cN3}>피안타</th>
            <th scope="col" className={s.cN}>실점</th>
            <th scope="col" className={s.cN}>자책</th>
            <th scope="col" className={s.cN}>볼넷</th>
            <th scope="col" className={s.cN}>삼진</th>
            <th scope="col" className={s.cN}>홈런</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.id}-${i}`}>
              <td className={s.cName}>
                <span className={s.pitWho}>
                  {nameCell(r, mine)}
                  {r.dec && <em className={[s.dec, s['dec' + r.dec]].join(' ')}>{DEC_KO[r.dec]}</em>}
                </span>
              </td>
              <td className={['num', s.cIp].join(' ')}>{ipText(r.outs)}</td>
              <td className={['num', s.cN3].join(' ')}>{r.H}</td>
              <td className={['num', s.cN].join(' ')}>{r.R}</td>
              <td className={['num', s.cN].join(' ')}>{r.ER}</td>
              <td className={['num', s.cN].join(' ')}>{r.BB}</td>
              <td className={['num', s.cN].join(' ')}>{r.SO}</td>
              <td className={['num', s.cN].join(' ')}>{r.HR}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
