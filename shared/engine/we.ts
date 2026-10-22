// 승리 기대값(WE)·승부처 지수(LI)·기대 득점(RE24) — AI 감독 판단용. KBO 추정표(10)로 모듈 로드 때 작은 분포만 만든다.
// RE24·득점 확률: 10_targets RE24.KBO_est / KBO_P_score_est, 이닝 득점 분포: KBO_inning_run_dist_est
const KEYS = ['---', '1--', '-2-', '12-', '--3', '1-3', '-23', '123'];   // 베이스 비트 순서(1루=1, 2루=2, 3루=4)
const RE: Record<string, number[]> = { '---': [0.569, 0.301, 0.111], '1--': [0.988, 0.583, 0.247], '-2-': [1.255, 0.739, 0.367], '--3': [1.456, 1.006, 0.376], '12-': [1.71, 1.036, 0.498], '1-3': [2.043, 1.317, 0.526], '-23': [2.162, 1.52, 0.633], '123': [2.6, 1.739, 0.857] };
const PS: Record<string, number[]> = { '---': [0.293, 0.172, 0.072], '1--': [0.436, 0.283, 0.131], '-2-': [0.649, 0.42, 0.243], '--3': [0.836, 0.685, 0.262], '12-': [0.661, 0.449, 0.252], '1-3': [0.905, 0.693, 0.289], '-23': [0.877, 0.726, 0.281], '123': [0.898, 0.713, 0.357] };
const INN = [0.7062, 0.1473, 0.0756, 0.0369, 0.018, 0.0088, 0.0043, 0.0019, 0.001];
const MR = 26;
export const RE24 = new Float64Array(24), PSC = new Float64Array(24);
for (let b = 0; b < 8; b++) for (let o = 0; o < 3; o++) { RE24[b * 3 + o] = RE[KEYS[b]][o]; PSC[b * 3 + o] = PS[KEYS[b]][o]; }
/** 남은 이닝 득점 분포(상태별) */
const REST: Float64Array[] = [];
for (let s = 0; s < 24; s++) {
  const d = new Float64Array(MR); const ps = PSC[s], re = RE24[s]; const m = Math.max(1.0001, re / ps); const q = 1 - 1 / m;
  d[0] = 1 - ps; for (let r = 1; r < MR; r++) d[r] = ps * (1 - q) * Math.pow(q, r - 1);
  REST.push(d);
}
const inn = new Float64Array(MR); { let s = 0; for (let r = 0; r < INN.length; r++) { inn[r] = INN[r]; s += INN[r]; } for (let r = INN.length; r < MR; r++) { inn[r] = (1 - s) * 0.5 ** (r - INN.length + 1); } }
function conv(a: Float64Array, b: Float64Array): Float64Array { const o = new Float64Array(MR); for (let i = 0; i < MR; i++) { if (a[i] < 1e-12) continue; for (let j = 0; i + j < MR; j++) o[i + j] += a[i] * b[j]; } return o; }
const POW: Float64Array[] = [(() => { const z = new Float64Array(MR); z[0] = 1; return z; })()];
for (let n = 1; n <= 12; n++) POW.push(conv(POW[n - 1], inn));
// 연장(최대 maxInn) 홈 승·무 확률 — 이닝 수별
let pTie1 = 0, pHome1 = 0; for (let a = 0; a < MR; a++) for (let h = 0; h < MR; h++) { const p = inn[a] * inn[h]; if (h > a) pHome1 += p; else if (h === a) pTie1 += p; }
function extraWE(innLeft: number): number { if (innLeft <= 0) return 0.5; let w = 0, tie = 1; for (let k = 0; k < innLeft; k++) { w += tie * pHome1; tie *= pTie1; } return w + 0.5 * tie; }

// 메모는 '결과를 정하는 상태'로만 키를 잡는다: (정규/연장, 남은 이닝 0~12, 초/말, 아웃, 주자, 점수 차) × 경기의 maxInn 마다 따로.
// [18 재미·악용 심사] 전에는 키에 maxInn 이 없고 이닝을 12에서 잘라, 더블헤더 2차전(9회 제한)·연장 13회↑ 경기를 먼저 돈 프로세스에서는
// 같은 경기의 WE·LI 가 달라져 결과가 바뀌었다(실측: 9회 제한 경기 80개 뒤 같은 경기 200개 해시 0/200 일치) — '같은 요청 = 같은 결과' 위반.
const MEMOS = new Map<number, Float64Array>();   // Float64: 캐시에서 꺼낸 값과 새로 계산한 값이 비트까지 같아야 결정적
function memoOf(maxInn: number): Float64Array { let m = MEMOS.get(maxInn); if (!m) { m = new Float64Array(2 * 13 * 2 * 24 * 31).fill(-1); MEMOS.set(maxInn, m); } return m; }
/** 홈 팀 승리 기대값. inning 1~, half 0 초 1 말, outs 0~2, bases 비트, diff = 홈 − 원정 */
export function homeWE(inning: number, half: number, outs: number, bases: number, diff: number, maxInn = 11): number {
  if (outs >= 3) { if (half === 0) { half = 1; outs = 0; bases = 0; } else { inning++; half = 0; outs = 0; bases = 0; } }
  const dc = diff < -15 ? -15 : diff > 15 ? 15 : diff;
  const reg = 9;
  const phase = inning <= reg ? 0 : 1;
  const innLeftAfter = Math.min(12, inning <= reg ? reg - inning : Math.max(0, maxInn - inning));   // 12이닝 넘게 남으면 12로 근사(전에는 maxInn ≥ 23 에서 표 밖을 읽어 멈췄다)
  const M = memoOf(maxInn);
  const key = (((phase * 13 + innLeftAfter) * 2 + half) * 24 + bases * 3 + outs) * 31 + dc + 15;
  const hit = M[key]; if (hit >= 0) return hit;
  let away: Float64Array, home: Float64Array;
  // 초: 원정 = 이번 반 이닝 나머지 + 뒤 이닝들, 홈 = 이번 말 + 뒤 이닝들 / 말: 홈 = 이번 반 이닝 나머지 + 뒤 이닝들, 원정 = 뒤 이닝들
  // [18 심사] 전에는 말 공격 때 원정의 남은 이닝을 0으로 봐(9회말만 맞음) 1~8회말 홈 WE 가 크게 부풀었다 — 이닝 끝 아웃 하나가 WE +0.44 로 기록되는 등 LI·명장면 감지가 틀렸다.
  if (half === 0) { away = conv(REST[bases * 3 + outs], POW[innLeftAfter]); home = POW[Math.min(12, innLeftAfter + 1)]; }
  else { home = conv(REST[bases * 3 + outs], POW[innLeftAfter]); away = POW[innLeftAfter]; }
  // P(홈 승) = Σ_a P(a)·P(h > a − d)
  const tail = new Float64Array(MR + 1); for (let h = MR - 1; h >= 0; h--) tail[h] = tail[h + 1] + home[h];
  let win = 0, tie = 0;
  for (let a = 0; a < MR; a++) { if (away[a] < 1e-12) continue; const need = a - dc + 1; win += away[a] * (need <= 0 ? 1 : need >= MR ? 0 : tail[need]); const eq = a - dc; if (eq >= 0 && eq < MR) tie += away[a] * home[eq]; }
  const extraLeft = inning <= reg ? maxInn - reg : 0;
  const we = win + tie * (inning <= reg ? extraWE(extraLeft) : 0.5);
  M[key] = we; return we;
}
/** 공격 팀 기준 WE */
export function offWE(inning: number, half: number, outs: number, bases: number, homeDiff: number, maxInn = 11): number {
  const w = homeWE(inning, half, outs, bases, homeDiff, maxInn); return half === 1 ? w : 1 - w;
}
/** 승부처 지수(근사): 그 상태에서 한 점의 가치 ÷ 평균 */
export function leverage(inning: number, half: number, outs: number, bases: number, homeDiff: number, norm: number, maxInn = 11): number {
  const up = homeWE(inning, half, outs, bases, homeDiff + 1, maxInn), dn = homeWE(inning, half, outs, bases, homeDiff - 1, maxInn);
  const base = (up - dn) / 2;
  const rel = 0.6 + 0.4 * (RE24[bases * 3 + outs] / 0.57);   // 주자·아웃이 많을수록 큰 변화 가능
  return base * rel / (norm > 0 ? norm : 0.0836);
}
export const reOf = (outs: number, bases: number): number => (outs >= 3 ? 0 : RE24[bases * 3 + outs]);
