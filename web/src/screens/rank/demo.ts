// 미리보기 전용 예시 순위 (?demo=1) — 로그인 없이 표 모양을 보려고. 실제 순위가 아니다.
import type { RankingBy, RankingRow, RankingsRes } from '../../api';

const RAW: [string, string, string, number, number, number, number, number, number][] = [
  // 아이디, 구단, 구단 이름, 레이팅, 승, 무, 패, 전력, 팀 종합
  ['예시_호랑이3대째', 'gj', '광주 호랑이즈', 1688, 61, 2, 23, 1104, 94],
  ['예시_큰발응원단', 'bs', '부산 거인츠', 1652, 48, 4, 20, 1096, 93],
  ['예시_월미등대', 'ic', '인천 상륙스', 1617, 37, 1, 19, 1089, 91],
  ['예시_한강반달', 'sb', '서울 곰스', 1590, 30, 3, 18, 1077, 90],
  ['예시_팔달요술', 'sw', '수원 마법사즈', 1561, 22, 2, 15, 1071, 89],
  ['예시_갑천물새', 'dj', '대전 독수리스', 1542, 9, 0, 6, 1012, 91],
  ['예시_사직파도', 'bs', '부산 거인츠', 1518, 12, 1, 11, 1040, 88],
  ['예시_대공원사자', 'dg', '대구 사자즈', 1497, 4, 0, 4, 998, 86],
  ['예시_마산아재', 'cw', '창원 공룡스', 1470, 8, 1, 12, 981, 85],
  ['예시_돔지붕', 'sh', '서울 영웅즈', 1446, 3, 0, 7, 960, 84],
];
const ME_NAME = '예시_갑천물새';

export function demoRankings(by: RankingBy): RankingsRes {
  const all = RAW.map(([username, club, teamName, rating, w, d, l, power, ovr], i) => ({
    userId: i + 1, username, club, teamName, rating, w, d, l, power, ovr, updatedAt: 0,
  }));
  const value = (x: (typeof all)[number]) => (by === 'rating' ? x.rating : by === 'power' ? x.power : x.w / Math.max(1, x.w + x.l));
  const ok = (x: (typeof all)[number]) => by !== 'winrate' || x.w + x.d + x.l >= 10;
  const rows: RankingRow[] = all.filter(ok).sort((a, b) => value(b) - value(a)).map((x, i) => ({ ...x, rank: i + 1, value: value(x), me: x.username === ME_NAME }));
  const me = all.find((x) => x.username === ME_NAME)!;
  return { by, minGames: 10, total: rows.length, rows, me: { ...me, rank: ok(me) ? rows.find((r) => r.me)!.rank : null, value: value(me) } };
}
