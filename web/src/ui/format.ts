// 숫자 모양 — 야구식 표기 (.312 · 3.41 · 6.2 · VII · 8.99) 와 한국식 큰 수

const MINUS = '−';

/** 1,284,500 */
export const int = (n: number) => Math.round(n).toLocaleString('en-US');

/** 타율·출루율: .312 (1 이상은 1.000) */
export const avg = (x: number) => {
  const s = x.toFixed(3);
  return x < 1 ? s.replace(/^0/, '') : s;
};

/** 평균자책·WHIP: 3.41 */
export const era = (x: number) => x.toFixed(2);

/** 이닝: 6.2 (= 6과 2/3) — 값이 이미 6.2 식이면 그대로 */
export const ip = (x: number) => x.toFixed(1);

/** 61% (0~1 또는 0~100 둘 다 받음) */
export const pct = (x: number, digits = 0) => `${(x <= 1 ? x * 100 : x).toFixed(digits)}%`;

/** +3 / −2 / 0 — 진짜 빼기 기호 */
export const signed = (n: number, digits = 0) => {
  const v = Number(n.toFixed(digits));
  if (v > 0) return `+${v.toFixed(digits)}`;
  if (v < 0) return `${MINUS}${Math.abs(v).toFixed(digits)}`;
  return (0).toFixed(digits);
};

/** 카드 레벨 8.99 (= 8레벨 99%) */
export const level = (lv: number) => lv.toFixed(2);
/** 레벨 정수부와 진행률 */
export const levelParts = (lv: number) => ({ lv: Math.floor(lv), progress: Math.round((lv - Math.floor(lv)) * 100) });

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
/** 강화 단계 1~10 → I~X (0 은 빈 글자) */
export const roman = (n: number) => ROMAN[Math.max(0, Math.min(10, Math.round(n)))];

/** 128.4만 · 3,420 — 1만 넘으면 '만' 단위 (억·조는 kr) */
export const man = (n: number) => {
  if (Math.abs(n) < 10000) return int(n);
  const v = n / 10000;
  return `${v >= 100 ? Math.round(v).toLocaleString('en-US') : v.toFixed(1).replace(/\.0$/, '')}만`;
};

/** 좁은 곳용 한국식 줄임 — 1조 · 1.28조 · 1억 · 12.8억 · 128만 · 3,420 (전체 숫자는 title 로) */
export const kr = (n: number) => {
  const a = Math.abs(n);
  const trim = (v: number, d: number) => { const s = v.toFixed(d); return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s; };
  if (a >= 1e12) return `${trim(n / 1e12, a >= 1e14 ? 0 : 2)}조`;
  if (a >= 1e8) return `${trim(n / 1e8, a >= 1e10 ? 0 : 1)}억`;
  if (a >= 1e4) return `${trim(n / 1e4, a >= 1e6 ? 0 : 1)}만`;
  return int(n);
};

/** 시즌 연도 꼬리표 '27 */
export const yearTag = (y: number) => `’${String(y).slice(-2).padStart(2, '0')}`;

/** 기록 W-D-L: 41승 3무 27패 */
export const record = (w: number, d: number, l: number) => `${w}승 ${d}무 ${l}패`;
