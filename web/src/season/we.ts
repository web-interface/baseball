// 홈 팀 승리 기대값 — 공용 엔진 we.ts 와 같은 KBO 추정표(RE24 · 득점 확률 · 이닝 득점 분포)로 계산한다.
// 엔진 쪽 homeWE 는 말 공격일 때 원정 팀의 남은 이닝을 0 으로 봐서(away = POW[0]) 홈이 크게 앞서 보이는 문제가 있어,
// 화면용으로는 이 파일을 쓴다(엔진 팀에 알림). 같은 상태면 늘 같은 값.
const KEYS = ['---', '1--', '-2-', '12-', '--3', '1-3', '-23', '123'];
const RE: Record<string, number[]> = { '---': [0.569, 0.301, 0.111], '1--': [0.988, 0.583, 0.247], '-2-': [1.255, 0.739, 0.367], '--3': [1.456, 1.006, 0.376], '12-': [1.71, 1.036, 0.498], '1-3': [2.043, 1.317, 0.526], '-23': [2.162, 1.52, 0.633], '123': [2.6, 1.739, 0.857] };
const PS: Record<string, number[]> = { '---': [0.293, 0.172, 0.072], '1--': [0.436, 0.283, 0.131], '-2-': [0.649, 0.42, 0.243], '--3': [0.836, 0.685, 0.262], '12-': [0.661, 0.449, 0.252], '1-3': [0.905, 0.693, 0.289], '-23': [0.877, 0.726, 0.281], '123': [0.898, 0.713, 0.357] };
const INN = [0.7062, 0.1473, 0.0756, 0.0369, 0.018, 0.0088, 0.0043, 0.0019, 0.001];
const MR = 26;
const REST: Float64Array[] = [];
for (let b = 0; b < 8; b++) for (let o = 0; o < 3; o++) {
  const ps = PS[KEYS[b]][o], re = RE[KEYS[b]][o];
  const m = Math.max(1.0001, re / ps), q = 1 - 1 / m;
  const d = new Float64Array(MR);
  d[0] = 1 - ps;
  for (let r = 1; r < MR; r++) d[r] = ps * (1 - q) * Math.pow(q, r - 1);
  REST[b * 3 + o] = d;
}
const inn = new Float64Array(MR);
{ let s = 0; for (let r = 0; r < INN.length; r++) { inn[r] = INN[r]; s += INN[r]; } for (let r = INN.length; r < MR; r++) inn[r] = (1 - s) * 0.5 ** (r - INN.length + 1); }
function conv(a: Float64Array, b: Float64Array): Float64Array {
  const o = new Float64Array(MR);
  for (let i = 0; i < MR; i++) { if (a[i] < 1e-12) continue; for (let j = 0; i + j < MR; j++) o[i + j] += a[i] * b[j]; }
  return o;
}
const POW: Float64Array[] = [(() => { const z = new Float64Array(MR); z[0] = 1; return z; })()];
for (let n = 1; n <= 12; n++) POW.push(conv(POW[n - 1], inn));
let pTie1 = 0, pHome1 = 0;
for (let a = 0; a < MR; a++) for (let h = 0; h < MR; h++) { const p = inn[a] * inn[h]; if (h > a) pHome1 += p; else if (h === a) pTie1 += p; }
function extraWE(left: number) { if (left <= 0) return 0.5; let w = 0, tie = 1; for (let k = 0; k < left; k++) { w += tie * pHome1; tie *= pTie1; } return w + 0.5 * tie; }

const MEMO = new Map<number, number>();
/** inning 1~ · half 0 초 / 1 말 · outs 0~3 · bases 비트(1루 1, 2루 2, 3루 4) · diff = 홈 − 원정 */
export function homeWE(inning: number, half: number, outs: number, bases: number, diff: number, maxInn = 12): number {
  if (outs >= 3) { if (half === 0) { half = 1; outs = 0; bases = 0; } else { inning++; half = 0; outs = 0; bases = 0; } }
  // 끝난 상태 — 9회 이후 말에 홈이 앞서면 끝
  if (half === 1 && inning >= 9 && diff > 0) return 1;
  if (inning > maxInn) return diff > 0 ? 1 : diff < 0 ? 0 : 0.5;
  const dc = Math.max(-15, Math.min(15, diff));
  const key = ((Math.min(13, inning) * 2 + half) * 24 + bases * 3 + outs) * 31 + dc + 15;
  const hit = MEMO.get(key);
  if (hit != null) return hit;
  const reg = 9;
  const left = inning <= reg ? reg - inning : Math.max(0, maxInn - inning);
  let away: Float64Array, home: Float64Array;
  if (half === 0) { away = conv(REST[bases * 3 + outs], POW[left]); home = POW[Math.min(12, left + 1)]; }
  else { home = conv(REST[bases * 3 + outs], POW[left]); away = POW[left]; }
  const tail = new Float64Array(MR + 1);
  for (let h = MR - 1; h >= 0; h--) tail[h] = tail[h + 1] + home[h];
  let win = 0, tie = 0;
  for (let a = 0; a < MR; a++) {
    if (away[a] < 1e-12) continue;
    const need = a - dc + 1;
    win += away[a] * (need <= 0 ? 1 : need >= MR ? 0 : tail[need]);
    const eq = a - dc;
    if (eq >= 0 && eq < MR) tie += away[a] * home[eq];
  }
  // 정규 이닝 뒤 동점이면 연장 기대값, 연장 중이면 끝까지 같을 때 무승부(0.5)
  const tieVal = inning <= reg ? extraWE(maxInn - reg) : 0.5;
  const we = Math.max(0.005, Math.min(0.995, win + tie * tieVal));
  MEMO.set(key, we);
  return we;
}
export const maskOf = (b: [unknown, unknown, unknown]) => (b[0] ? 1 : 0) | (b[1] ? 2 : 0) | (b[2] ? 4 : 0);
