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
export const ENGINE_VER = 'e1.2.0';   // 18 재미·악용 심사 반영(WE 말 공격·메모 결정성, 유저 명령 검증·즉시 적용, 접근법 대가, 구속 효과, 선형 보너스 + 기준점 R, 혹사 위험, 투구 상한) — 같은 시드도 결과가 달라지므로 올림
// e1.1.0: 17 현실성 심사(끝내기·미완료 타석·작전 AI·바람 복원 등)
