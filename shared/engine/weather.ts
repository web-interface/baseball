// 날씨 — 16 생성 모델(도시·날짜·시드 → 그날 날씨), 경기 중 변화(10분 칸), 효과 계수(공기 밀도·바람·그라운드).
// 결정적: 같은 시드면 같은 날씨. 경기 시드와 분리(날씨를 미리 보여 줘도 경기 결과는 계산 불가).
import { CITY_IDS, CITY_META, CLIMATE, NCF, WIND_ROSE, JANGMA, GEN, WX_RULES } from './data/climate.ts';
import { Sfc32, invN, clamp, seedFromString } from './rng.ts';
import type { WxSlot, WxTimeline, Park } from './types.ts';
import { P } from './params.ts';

export { CITY_IDS };
const F: Record<string, number> = Object.fromEntries((['tmax', 'tmin', 'tmax_sd', 'tmin_sd', 'precip_mm', 'precip_days', 'p_wet_day', 'rc1', 'rc2', 'rc3', 'rc4', 'tail30', 'rh', 'dewpoint', 'sunshine_pct', 'wind_ms', 'fog_days', 'dust_days', 'heatwave_days', 'sunset15', 'dusk15']).map((k, i) => [k, i]));
const DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export function cityIndex(id: string): number { const i = (CITY_IDS as readonly string[]).indexOf(id); return i < 0 ? 0 : i; }
export function parseDate(s: string): { y: number; m: number; d: number; doy: number } {
  const [y, m, d] = s.split('-').map(Number);
  let doy = d; for (let i = 0; i < m - 1; i++) doy += DIM[i] + (i === 1 && y % 4 === 0 ? 1 : 0);
  return { y, m, d, doy };
}
export function dateStr(y: number, doy: number): string {
  let m = 0, d = doy;
  while (m < 12) { const n = DIM[m] + (m === 1 && y % 4 === 0 ? 1 : 0); if (d <= n) break; d -= n; m++; }
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
/** 그날 평년값: 이번 달과 앞뒤 달을 15일 기준 선형 보간(3~10월 범위 밖은 끝값) */
function clim(c: number, m: number, d: number, f: number): number {
  const mi = clamp(m, 3, 10) - 3; const here = CLIMATE[(c * 8 + mi) * NCF + f];
  if (d >= 15) { if (mi >= 7) return here; const nx = CLIMATE[(c * 8 + mi + 1) * NCF + f]; return here + (nx - here) * (d - 15) / 30; }
  if (mi <= 0) return here; const pv = CLIMATE[(c * 8 + mi - 1) * NCF + f]; return pv + (here - pv) * (d + 15) / 30;
}
const rawM = (c: number, m: number, f: number) => CLIMATE[(c * 8 + clamp(m, 3, 10) - 3) * NCF + f];

// ── 시즌 체제(시즌 시작 때 한 번) ──
export interface Regime {
  springAnom: number; summerAnom: number; wet: number; warming: number;
  jStart: [number, number]; jLen: [number, number]; jMult: number;
  typhoons: { doy: number; central: boolean; strength: number }[];
  dust: number;
}
function rngOf(seed: [number, number, number, number]): Sfc32 { const r = new Sfc32(); r.a = seed[0] | 0; r.b = seed[1] | 0; r.c = seed[2] | 0; r.d = seed[3] | 0; for (let i = 0; i < 10; i++) r.next(); return r; }
export function seasonRegime(seed: [number, number, number, number], year: number): Regime {
  const r = rngOf(seed); const G = GEN.regime;
  const jsC = parseDate(`${year}-${JANGMA.central.start}`).doy, jsS = parseDate(`${year}-${JANGMA.southern.start}`).doy;
  const shift = clamp(G.jangma.start_sd_days * invN(r.next()), -10, 9);
  const len = clamp(G.jangma.length_mean + G.jangma.length_sd * invN(r.next()), G.jangma.length_clamp[0], G.jangma.length_clamp[1]);
  const typh: Regime['typhoons'] = [];
  // 포아송(3.4)
  let n = 0; { const L = Math.exp(-G.typhoon.poisson_mean); let q = 1; do { n++; q *= r.next(); } while (q > L); n--; }
  const mw = G.typhoon.month_weight as Record<string, number>; const months = Object.keys(mw).map(Number); const tot = months.reduce((a, m) => a + mw[m], 0);
  for (let i = 0; i < n; i++) {
    let u = r.next() * tot, mo = months[0]; for (const m of months) { u -= mw[m]; if (u <= 0) { mo = m; break; } }
    const day = 1 + Math.floor(r.next() * DIM[mo - 1]);
    typh.push({ doy: parseDate(`${year}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`).doy, central: r.next() < G.typhoon.reach_central_prob, strength: 0.6 + 0.8 * r.next() });
  }
  return {
    springAnom: G.temp_anom_sd_C * invN(r.next()), summerAnom: G.summer_heat_anom_sd_C * invN(r.next()), wet: Math.exp(G.wetness_lognorm_sd * invN(r.next())), warming: G.warming_offset_C,
    jStart: [jsC + shift, jsS + shift], jLen: [len, len], jMult: Math.exp(G.jangma.rain_mult_lognorm_sd * invN(r.next()) - 0.06),
    typhoons: typh, dust: GEN.regime.dust_factor_recent * Math.exp(0.4 * invN(r.next())),
  };
}

// ── 하루 날씨 ──
export interface DayWx {
  date: string; city: number; tmax: number; tmin: number; tminNext: number; dew: number;
  rain: Float32Array;            // 24시간 시간별 강수 mm
  rainMm: number; wet: boolean; windMean: number; windFrom: number; sky: 0 | 1 | 2 | 3; fog: boolean; pmAlert: boolean; typhoon: number;
  sunset: number; dusk: number;
}
export interface CityState { prevWet: boolean; aMax: number; aMin: number; bucket: number }
export const initCityState = (): CityState => ({ prevWet: false, aMax: 0, aMin: 0, bucket: 0 });

const ROSE_DIRS = 16;
function inJangma(rg: Regime, c: number, doy: number): boolean {
  const z = CITY_META[c].zone === 'central' ? 0 : 1;
  return doy >= rg.jStart[z] && doy < rg.jStart[z] + rg.jLen[z];
}
function jangmaDaysInMonth(rg: Regime, c: number, y: number, m: number): number {
  const z = CITY_META[c].zone === 'central' ? 0 : 1; const d0 = parseDate(`${y}-${String(m).padStart(2, '0')}-01`).doy; const d1 = d0 + DIM[m - 1];
  return Math.max(0, Math.min(d1, rg.jStart[z] + rg.jLen[z]) - Math.max(d0, rg.jStart[z]));
}

export function dailyWeather(c: number, date: string, rg: Regime, st: CityState, seed: [number, number, number, number]): { day: DayWx; next: CityState } {
  const { y, m, d, doy } = parseDate(date);
  const r = rngOf(seed);
  const meta = CITY_META[c];
  // 3) 비 올까 — 1차 마르코프(장마 안 ×1.25, 밖은 월 합계 유지)
  const days = DIM[m - 1];
  let pi = clim(c, m, d, F.precip_days) / days;
  const typhM = (GEN.regime.typhoon.month_weight as any)[m] ?? 0;
  pi = Math.max(0.02, pi - typhM * 3.4 / 8.5 * 0.6 * 2 / days);       // 태풍 몫 빼기(대략)
  pi = Math.min(0.9, pi * Math.sqrt(rg.wet));
  const jd = jangmaDaysInMonth(rg, c, y, m);
  const inJ = inJangma(rg, c, doy);
  if (jd > 0) {
    const pj = Math.min(GEN.occ.jangma_pi_max, pi * GEN.occ.jangma_rel);
    if (inJ) pi = pj; else pi = Math.max(0.03, (pi * days - pj * jd) / Math.max(1, days - jd));
  }
  const rr = (GEN.occ.r_by_month as any)[m] ?? 0.3;
  const pWet = st.prevWet ? pi + rr * (1 - pi) : pi * (1 - rr);
  // 태풍
  let typhoon = 0;
  for (const t of rg.typhoons) {
    const dd = doy - t.doy; if (dd < 0 || dd > 1) continue;
    const hitP = meta.zone === 'central' ? (t.central ? GEN.regime.typhoon.hit_prob_central : 0.1) : GEN.regime.typhoon.hit_prob_southern;
    const u = ((seed[0] ^ (t.doy * 2654435761)) >>> 0) / 4294967296;   // 같은 태풍은 도시마다 고정
    if (u < hitP) typhoon = dd === 0 ? t.strength : t.strength * 0.4;
  }
  const uWet = r.next();
  let wet = uWet < pWet || typhoon > 0;
  // 4) 얼마나
  let mm = 0;
  if (wet) {
    const rc = [clim(c, m, d, F.rc1), clim(c, m, d, F.rc2), clim(c, m, d, F.rc3), clim(c, m, d, F.rc4)]; const tot = rc[0] + rc[1] + rc[2] + rc[3];
    let u = r.next() * tot, k = 0; while (k < 3 && u > rc[k]) { u -= rc[k]; k++; }
    const lo = [0.1, 1, 10, 30][k], hi = [1, 10, 30, 30][k];
    mm = k < 3 ? lo * Math.pow(hi / lo, r.next()) : 30 - clim(c, m, d, F.tail30) * Math.log(1 - r.next() * 0.999);
    if (inJ) mm *= rg.jMult;
    if (typhoon > 0) mm = Math.max(mm, (typhoon >= 0.6 && typhoon === typhoon ? 30 + 90 * typhoon * r.next() : 5 + 30 * typhoon * r.next()));
  } else { r.next(); r.next(); }
  // 5) 기온 AR(1)
  const phiX = GEN.daily.ar1_phi_max, phiN = GEN.daily.ar1_phi_min, rho = GEN.daily.corr_max_min;
  const e1 = invN(r.next()), e2 = rho * e1 + Math.sqrt(1 - rho * rho) * invN(r.next());
  const aMax = phiX * st.aMax + Math.sqrt(1 - phiX * phiX) * e1;
  const aMin = phiN * st.aMin + Math.sqrt(1 - phiN * phiN) * e2;
  const sdMult = (GEN.daily.city_tmax_sd_mult as any)[meta.id] ?? 1;
  const anom = (m >= 6 && m <= 9 ? rg.summerAnom : rg.springAnom) + rg.warming;
  const piC = clamp(pi, 0.05, 0.9);
  const wetShiftX = wet ? GEN.daily.wet_day_tmax_shift_C : -GEN.daily.wet_day_tmax_shift_C * piC / (1 - piC);
  const wetShiftN = wet ? GEN.daily.wet_day_tmin_shift_C : -GEN.daily.wet_day_tmin_shift_C * piC / (1 - piC);
  let tmax = clim(c, m, d, F.tmax) + clim(c, m, d, F.tmax_sd) * sdMult * aMax + wetShiftX + anom;
  let tmin = clim(c, m, d, F.tmin) + clim(c, m, d, F.tmin_sd) * aMin + wetShiftN + anom * 0.8;
  if (tmin > tmax - 2) tmin = tmax - 2;
  // 6) 이슬점
  let dew = clim(c, m, d, F.dewpoint) + anom * 0.8 + (wet ? 2.0 : -0.8) + 2 * invN(r.next());
  dew = Math.min(dew, tmin + (wet ? 1.0 : 0.5));
  // 7) 바람: 와이블(k=2) + 계절 바람장미
  const wm = clim(c, m, d, F.wind_ms) * (1 + 2.5 * typhoon);
  const windMean = (wm / 0.8862) * Math.sqrt(-Math.log(1 - r.next() * 0.9999));
  const season = m <= 5 ? 0 : m <= 8 ? 1 : 2;
  let u = r.next() * 100, di = 0; const rb = (c * 3 + season) * ROSE_DIRS;
  let tot = 0; for (let k = 0; k < ROSE_DIRS; k++) tot += WIND_ROSE[rb + k];
  u *= tot / 100; while (di < ROSE_DIRS - 1 && u > WIND_ROSE[rb + di]) { u -= WIND_ROSE[rb + di]; di++; }
  const windFrom = (di * 22.5 + (r.next() - 0.5) * 22.5 + 360) % 360;
  // 8) 하늘
  const clearP = clamp(1.35 * clim(c, m, d, F.sunshine_pct) / 100 - 0.12, 0.05, 0.9);
  const us = r.next();
  const sky: 0 | 1 | 2 | 3 = wet ? (mm >= 1 ? 3 : 2) : us < clearP ? 0 : us < clearP + (1 - clearP) * 0.55 ? 1 : 2;
  // 9) 안개(저녁)
  const fogP = clim(c, m, d, F.fog_days) / days * (meta.coastal ? GEN.fog.evening_factor_coastal : GEN.fog.evening_factor_inland);
  const fog = !wet && windMean < 3 && r.next() < fogP * 3;   // 바람 약한 날에 몰림
  // 10) 미세먼지 경보
  const pmP = ((GEN.aq.pm_warning_day_prob as any)[m] ?? 0) * (r.next() < clim(c, m, d, F.dust_days) / days * rg.dust ? GEN.aq.dust_day_multiplier : 1);
  const pmAlert = r.next() < pmP;
  // 시간별 비
  const rain = new Float32Array(24);
  if (wet && mm >= 0.1) {
    const summer = m >= 6 && m <= 8; const I0 = summer ? GEN.timing.intensity_I0_summer : GEN.timing.intensity_I0_other;
    const H = clamp(Math.round(mm / (I0 * Math.pow(mm, GEN.timing.intensity_exp))), 1, 24);
    const sw = inJ ? GEN.timing.start_weights.jangma : (m === 8 || (m === 7 && !inJ)) ? GEN.timing.start_weights.summer_convective : GEN.timing.start_weights.other;
    const blobs = H > 3 && r.next() < 0.4 ? 2 : 1;
    let wsum = 0; const w = new Float64Array(24);
    for (let b = 0; b < blobs; b++) {
      let tw = 0; for (let h = 0; h < 24; h++) tw += sw[h];
      let uu = r.next() * tw, s0 = 0; while (s0 < 23 && uu > sw[s0]) { uu -= sw[s0]; s0++; }
      const len = Math.max(1, Math.round(H / blobs));
      for (let h = 0; h < len; h++) { const hh = (s0 + h) % 24; const ww = -Math.log(1 - r.next() * 0.999) + 0.05; w[hh] += ww; wsum += ww; }
    }
    for (let h = 0; h < 24; h++) rain[h] = wsum > 0 ? mm * w[h] / wsum : 0;
  }
  const { day: _d } = { day: 0 };
  void _d;
  const dayOut: DayWx = { date, city: c, tmax, tmin, tminNext: tmin, dew, rain, rainMm: wet ? mm : 0, wet: wet && mm >= 0.1, windMean, windFrom, sky, fog, pmAlert, typhoon,
    sunset: clim(c, m, d, F.sunset15), dusk: clim(c, m, d, F.dusk15) };
  // 그라운드 물통(시간당 배수는 경기 타임라인에서 구장 배수 등급으로)
  let bucket = st.bucket; for (let h = 0; h < 24; h++) bucket = Math.max(0, bucket + rain[h] - 4);
  return { day: dayOut, next: { prevWet: dayOut.wet, aMax, aMin, bucket } };
}

/** 한 도시의 시즌 날씨(날짜 순서대로 굴림). seedOf(날짜) — 서버는 HMAC, 도구는 문자열 해시 */
export function seasonWeather(cityId: string, year: number, rg: Regime, fromDoy: number, toDoy: number, seedOf: (date: string) => [number, number, number, number]): DayWx[] {
  const c = cityIndex(cityId); let st = initCityState(); const out: DayWx[] = [];
  for (let doy = fromDoy; doy <= toDoy; doy++) { const ds = dateStr(year, doy); const { day, next } = dailyWeather(c, ds, rg, st, seedOf(ds)); if (out.length) out[out.length - 1].tminNext = day.tmin; out.push(day); st = next; }
  return out;
}

// ── 태양 위치(NOAA 근사) ──
export function sunPos(lat: number, lon: number, doy: number, minKST: number): { alt: number; az: number } {
  const g = 2 * Math.PI / 365 * (doy - 1 + (minKST / 60 - 12) / 24);
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const eot = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const tst = minKST + eot + 4 * lon - 540;
  const ha = (tst / 4 - 180) * Math.PI / 180; const la = lat * Math.PI / 180;
  const cosZ = Math.sin(la) * Math.sin(decl) + Math.cos(la) * Math.cos(decl) * Math.cos(ha);
  const zen = Math.acos(clamp(cosZ, -1, 1));
  let az = Math.acos(clamp((Math.sin(la) * Math.cos(zen) - Math.sin(decl)) / (Math.cos(la) * Math.sin(zen) + 1e-9), -1, 1)) * 180 / Math.PI;
  az = ha > 0 ? (az + 180) % 360 : (540 - az) % 360;
  return { alt: 90 - zen * 180 / Math.PI, az };
}
/** 체감온도: 여름(기상청 습구 식), 추우면 풍속 냉각 */
export function apparentTemp(t: number, rh: number, windMs: number): number {
  if (t >= 20) {
    const Tw = t * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) + Math.atan(t + rh) - Math.atan(rh - 1.676331) + 0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) - 4.686035;
    return -0.2442 + 0.55399 * Tw + 0.45535 * t - 0.0022 * Tw * Tw + 0.00278 * Tw * t + 3.0;
  }
  if (t <= 10 && windMs > 1.3) { const V = Math.pow(windMs * 3.6, 0.16); return 13.12 + 0.6215 * t - 11.37 * V + 0.3965 * V * t; }
  return t;
}
const rhFrom = (t: number, dew: number): number => clamp(100 * Math.exp(17.625 * dew / (243.04 + dew)) / Math.exp(17.625 * t / (243.04 + t)), 15, 100);

/** 하루 안의 기온(파튼-로건 단순형) */
export function tempAt(day: DayWx, hour: number): number {
  const sunset = day.sunset / 60, sunrise = 2 * 12.55 - sunset, tMaxH = GEN.diurnal.t_max_hour;
  const span = day.tmax - day.tmin;
  if (hour < sunrise) { const tss = day.tmax - span * GEN.diurnal.drop_frac_at_sunset; const night = 24 - sunset + sunrise; const e = (hour + 24 - sunset) / night; return tss - (tss - day.tmin) * (1 - Math.exp(-GEN.diurnal.night_decay_k * e)) / (1 - Math.exp(-GEN.diurnal.night_decay_k)); }
  if (hour <= tMaxH) return day.tmin + span * Math.sin(Math.PI / 2 * (hour - sunrise) / (tMaxH - sunrise));
  if (hour <= sunset) return day.tmax - span * GEN.diurnal.drop_frac_at_sunset * (hour - tMaxH) / (sunset - tMaxH);
  const tss = day.tmax - span * GEN.diurnal.drop_frac_at_sunset; const night = 24 - sunset + 2 * 12.55 - sunset;
  const e = (hour - sunset) / night;
  return tss - (tss - day.tminNext) * (1 - Math.exp(-GEN.diurnal.night_decay_k * e)) / (1 - Math.exp(-GEN.diurnal.night_decay_k));
}

const SLOTS = 54, PRE = 18;   // 10분 칸: 시작 −3시간 ~ +6시간
const DRAIN: Record<string, number> = { A: 6, B: 4, C: 2.5 };
/** 경기 타임라인: 하루 날씨 + 구장 → 10분 칸 54개. 바람은 칸마다 방향 랜덤워크·속도 AR(1). seed 는 날씨 시드(경기 시드 아님) */
export function gameTimeline(day: DayWx, prev: DayWx | null, park: Park, startMin: number, seed: [number, number, number, number]): WxTimeline {
  const dome = park.roof === 'dome';
  const { doy } = parseDate(day.date);
  const r = rngOf([seed[0] ^ 0x5bd1e995, seed[1], seed[2] ^ startMin, seed[3]]);
  const slots: WxSlot[] = [];
  const t0 = startMin - PRE * 10;
  // 그라운드 물통: 전날 늦은 비 + 오늘 경기 전까지
  const drain = DRAIN[park.drainage] ?? 4;
  let bucket = 0;
  if (prev) for (let h = 12; h < 24; h++) bucket = Math.max(0, bucket + prev.rain[h] - drain);
  for (let h = 0; h < Math.floor(t0 / 60); h++) bucket = Math.max(0, bucket + day.rain[h] - drain);
  let wDir = day.windFrom, wSpd = day.windMean;
  const hourFactor = (min: number) => { const h = min / 60; return h >= 12 && h < 17 ? GEN.wind.afternoon_factor : h >= 18 ? GEN.wind.evening_factor : 1; };
  for (let i = 0; i < SLOTS; i++) {
    const min = t0 + i * 10; const hour = min / 60; const hi = Math.min(23, Math.floor(hour));
    const mmh = hi < 24 ? day.rain[hi] : 0;
    bucket = Math.max(0, bucket + (mmh - drain) / 6);
    const tC = tempAt(day, hour);
    wDir = (wDir + 9 * invN(r.next()) + 360) % 360;
    const mean = day.windMean * hourFactor(min);
    wSpd = Math.max(0, mean + 0.8 * (wSpd - mean) + 0.25 * mean * invN(r.next()));
    const gust = wSpd * (GEN.wind.gust_factor + 0.15 * invN(r.next()));
    const sp = sunPos(park.lat, park.lon, doy, min);
    const rhv = rhFrom(tC, day.dew);
    const rainMmH = mmh * (0.6 + 0.8 * r.next());
    const rainLv: 0 | 1 | 2 | 3 = rainMmH < 0.1 ? 0 : rainMmH < 1 ? 1 : rainMmH < 4 ? 2 : 3;
    const field: 0 | 1 | 2 | 3 = bucket < 0.5 ? 0 : bucket < 3 ? 1 : bucket < 8 ? 2 : 3;
    const fogNow = day.fog && min > day.sunset && park.seaFog;
    const visKm = fogNow ? 0.3 + 1.2 * r.next() : rainLv >= 3 ? 3 : 15;
    if (dome) slots.push({ tC: 23, rh: 50, atC: 23, pHpa: 1013, windMs: 0, windFromDeg: 0, gustMs: 0, rainMmH: 0, rainLv: 0, field: 0, sky: 2, sunAlt: -10, sunAz: 0, visKm: 15, pm25: 15 });
    else slots.push({ tC, rh: rhv, atC: apparentTemp(tC, rhv, wSpd), pHpa: 1013 - 25 * day.typhoon, windMs: wSpd, windFromDeg: wDir, gustMs: gust, rainMmH, rainLv, field,
      sky: rainLv > 0 ? 3 : day.sky, sunAlt: sp.alt, sunAz: sp.az, visKm, pm25: day.pmAlert ? 160 : 25 });
  }
  const tl: WxTimeline = { t0Min: t0, slots, precheck: 'play', dome };
  if (!dome) {
    const why = precheckReason(day, tl, park, startMin);
    if (why) { tl.precheck = 'cancelled'; tl.cancelReason = why; }
  }
  return tl;
}
/** 경기 전 취소 판정(16 규정 숫자) */
function precheckReason(day: DayWx, tl: WxTimeline, park: Park, startMin: number): string | null {
  const R = WX_RULES.rain; const at = (min: number) => tl.slots[Math.max(0, Math.min(tl.slots.length - 1, Math.round((min - tl.t0Min) / 10)))];
  if (day.typhoon >= 0.9) return '태풍';
  if (day.pmAlert) return '미세먼지';
  const s3 = at(startMin - 180), s1 = at(startMin - 60), s0 = at(startMin);
  if (s3.rainMmH >= R.pre_cancel_mm_h_3h_before && s1.rainMmH >= 1) return '우천(3시간 전)';
  if (s1.rainMmH >= R.pre_cancel_mm_h_1h_before) return '우천(1시간 전)';
  let pre2 = 0; for (let m = startMin - 120; m < startMin; m += 10) pre2 += at(m).rainMmH / 6;
  let next3 = 0; for (let m = startMin; m < startMin + 180; m += 10) next3 += at(m).rainMmH / 6;
  if (pre2 >= R.pre_rain_2h_mm && next3 >= R.forecast_next3h_mm) return '우천';
  if (next3 >= R.forecast_heavy_next3h_mm) return '우천(예보)';
  if (s0.field >= 3) return '그라운드 사정';
  if (s0.atC >= WX_RULES.heat.cancel_at_start_apparent_C) return '폭염';
  if (day.windMean * 1.0 >= WX_RULES.wind.cancel_mean_ms) return '강풍';
  void park;
  return null;
}
/** 날씨 시드 키(서버는 HMAC(비밀, 이 문자열)) */
export const wxKey = (league: string, season: number, city: string, date: string) => `wx|${league}|${season}|${city}|${date}`;
/** 도구·시험용 시드 */
export const toolWxSeed = (key: string) => seedFromString(key);

// ── 효과 계수(물리) ──
/** 공기 밀도 비거리 보정(m) — 16 air_and_carry */
export function airCarry(s: WxSlot, elevM: number, d0: number): number {
  return (P.air.temp * (s.tC - 20) + P.air.pres * (s.pHpa - 1013) + P.air.rh * (s.rh - 60) + P.air.elev * elevM) * Math.pow(Math.max(10, d0) / 121.9, 1.3);
}
/** 바람 → 타구 방위 기준 성분(m/s): 뒷바람(+)·옆바람(+는 시계 방향=우익 쪽) */
export function windAt(s: WxSlot, park: Park, phiDeg: number, out: Float64Array): void {
  const w = s.windMs * park.expoHigh * P.air.expo; const toDir = s.windFromDeg + 180; const bearing = park.orientDeg + phiDeg;
  const a = (toDir - bearing) * Math.PI / 180;
  out[0] = w * Math.cos(a); out[1] = w * Math.sin(a);
}
/** 비거리 지수(화면용): 기온·기압·습도 + 외야로 부는 바람 */
export function carryIndex(s: WxSlot, park: Park): number {
  const o = new Float64Array(2); windAt(s, park, 0, o);
  return 0.18 * (s.tC - 20) - 0.04 * (s.pHpa - 1013) + 0.005 * (s.rh - 60) + 2.2 * o[0];
}
/** 투구 맞바람(투구 방향 반대로 부는 성분, m/s) → 무브먼트 배율 */
export function pitchHeadwind(s: WxSlot, park: Park): number {
  const w = s.windMs * park.expoLow; const toDir = s.windFromDeg + 180; return w * Math.cos((toDir - park.orientDeg) * Math.PI / 180);
}
export const rainLevelOf = (mmh: number): 0 | 1 | 2 | 3 => (mmh < 0.1 ? 0 : mmh < 1 ? 1 : mmh < 4 ? 2 : 3);
/** 돔/중립 타임라인(시험용) */
export function neutralTimeline(startMin = 1110, tC = 20, windMs = 0, windFromDeg = 0, rainMmH = 0): WxTimeline {
  const slots: WxSlot[] = [];
  for (let i = 0; i < SLOTS; i++) slots.push({ tC, rh: 60, atC: tC, pHpa: 1013, windMs, windFromDeg, gustMs: windMs * 1.6, rainMmH, rainLv: rainLevelOf(rainMmH), field: rainMmH >= 4 ? 2 : rainMmH >= 1 ? 1 : 0, sky: rainMmH > 0 ? 3 : 2, sunAlt: -5, sunAz: 270, visKm: 15, pm25: 20 });
  return { t0Min: startMin - PRE * 10, slots, precheck: 'play', dome: false };
}
