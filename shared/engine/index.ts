// shared/engine — 서버(Workers)·웹 공용 순수 TypeScript 경기 엔진. 외부 라이브러리 없음, Math.random 없음.
export { simulateGame } from './game.ts';
export { P as PARAMS, setParams, snapshotParams } from './params.ts';
export { Sfc32, sub, u01, invN, hashStr, seedFromString, seedFromBytes, hmacSeed, seqRng } from './rng.ts';
export { buildCache, compressBonus, softCap, uniformBonus, ATTR_KEYS, HID_KEYS, PITCH_KEYS, POS_KEYS, A as ATTR, HD as HID } from './player.ts';
export { seasonRegime, seasonWeather, dailyWeather, gameTimeline, neutralTimeline, sunPos, apparentTemp, carryIndex, wxKey, toolWxSeed, cityIndex, CITY_IDS } from './weather.ts';
export { generatePlayer, generateTeam, toPlayerIn, ovrAt, cardSix } from './generate.ts';
export { makeSchedule, startTime, reschedule, newClub, autoTeamIn, afterGame, restDay, winPct } from './season.ts';
export { homeWE, leverage, reOf } from './we.ts';
export { injuryDays } from './injury.ts';
export { batVal, pitVal, DEF_TAC } from './tactics.ts';
export type * from './types.ts';
export const ENGINE_VER = 'e1.0.0';
