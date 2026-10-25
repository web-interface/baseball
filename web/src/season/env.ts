// 리그 환경 — 시즌마다 공인구 반발력 · 타고투저/투고타저. 시즌 시드로 정해져 그 시즌 내내 같다(다시 계산해도 같은 경기).
// 사용자 지시 10-26 "투고타저 · 타고투저가 발생할 수 있지만 현실성 있는 밸런스".
// 실제 KBO(2010~2025): 리그 평균자책 3.8(2012) ~ 5.2(2014), 경기당 팀 홈런 0.6(2023) ~ 1.2(2018), 리그 타율 .258 ~ .290.
// e: −1 투고타저 … 0 보통 … +1 타고투저. 두 난수의 평균이라 보통 해가 흔하고 극단은 드물다.
// 엔진 GameInput.env 로 넘긴다 — powerAdj(타구 속도) · contactAdj(맞히기) 를 params 기본값에 더한다.
import { P } from '../../../shared/engine/params.ts';

export interface LeagueEnv {
  /** −1 투고타저 … +1 타고투저 */
  e: number;
  powerAdj: number;
  contactAdj: number;
  /** 화면 이름표 — '투고타저' · '보통' · '타고투저' 등 */
  label: string;
}

/** 보통 해(e = 0) 의 몫과 극단까지의 폭 — 한 시즌 시험으로 맞춘 값 */
export const ENV = { pow: { base: -2.5, span: 2.4 }, con: { base: 0.2, span: 0.12 } };

let override: number | null = null;
/** 시험용 — e 를 고정 (null 이면 시드대로) */
export const setEnvOverride = (e: number | null) => { override = e; };

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function envE(seed: string): number {
  if (override != null) return override;
  const u1 = hash(`${seed}|env1`) / 4294967296, u2 = hash(`${seed}|env2`) / 4294967296;
  return Math.round((u1 + u2 - 1) * 100) / 100;
}
export const envLabel = (e: number) => (e >= 0.6 ? '극심한 타고투저' : e >= 0.3 ? '타고투저' : e <= -0.6 ? '극심한 투고타저' : e <= -0.3 ? '투고타저' : '보통');

export function leagueEnv(seed: string): LeagueEnv {
  const e = envE(seed);
  return {
    e,
    powerAdj: Math.round((P.env.powerAdj + ENV.pow.base + ENV.pow.span * e) * 100) / 100,
    contactAdj: Math.round((P.env.contactAdj + ENV.con.base + ENV.con.span * e) * 1000) / 1000,
    label: envLabel(e),
  };
}
