// 보정 상수 — 한 곳. 근거: [10] 통계 목표 · [15] 선수 데이터 · [16] 날씨 · [12] 이벤트 · [맞춤] 실측 맞춤 · [설계] 물리·상식 · [보정] 13 보정 반복으로 고친 값.
// 보정 도구(calibrate.ts)는 이 객체를 덮어써서 시험하고, 확정값은 13_params.json 과 여기에 함께 남긴다.
// 카운트 칸 순서: 0-0,0-1,0-2,1-0,1-1,1-2,2-0,2-1,2-2,3-0,3-1,3-2 (볼×3+스트라이크)
// 구종 순서: FF,SI,FC,SL,SW,CU,CH,FS,KN

export const P = {
  ver: 'p1.0',
  /** 능력치 중심값(1군 주전 평균) — z = (v − center)/10. generate.ts 로 만든 리그에서 잰 값 [15 생성 실측] */
  center: [64.5,64.1,57,62.3,60.8,58.3,57.2,57.3,44.7,56.2,51.9,50.3,52.9,57.1,45.7,52.4,55.4,56.7,60.8,58,58.1,50.1,66,57.5,62.4,59.3,56.1,62.6,61.9,52.1,46.5,61,53.8,54.5,50.5,56,56.7,56.5,56.5,45.8,53.8,56,55.7,50.2,57.6] as number[],
  /** 능력치 눈금(1군 주전 표준편차, 최소 10) — z = (v − center)/scale. 15 는 "주전 SD ≈ 10" 을 의도했지만 생성 리그 실측은 아키타입이 섞여 9~23 → 실측으로 표준화 [15 생성 실측] */
  scale: [13.3,13.7,19.2,13.3,11.5,12,10,10.8,15.1,14.6,16,12.6,18.2,11.1,15.6,10,16.4,14.6,13.2,13.8,11.9,14.3,11.8,15.5,12.2,15.9,16.5,14.6,15.8,11.4,22.9,11.1,10,10,10,17.1,11.7,12,11.7,11.6,11.3,12,10.5,12,12.1] as number[],
  /** 실력 → 결과 감도(모든 z 에 곱함) — 실력 차 승률 곡선(11 16.3)에 맞춤 [보정] */
  zGain: 1, zGainBat: 1, zCube: [0, 0, 0, 0, 0, 0, 0, 0] as number[], zCubeStuff: 0,
  scaleStuff: 11.9, scaleCmd: 12.5,
  /** 구종 위력·커맨드 중심값 */
  centerStuff: 66.4, centerCmd: 57.9,   // 구사율 가중 평균 [15 생성 실측 40구단]
  bonus: {
    mode: 'compress' as 'compress' | 'linear',   // 15·11: 20(1−e^(−B/20)) / 기획서: 압축 없음(소프트캡만)
    // 소프트캡 — 87 넘는 몫은 점점 덜 오르고 97 가까이에서 멈춘다. 사용자 지시 10-25 밤 "200이닝 · 80홈런은 말이 안 된다, 능력치 차이가 너무 나면 보정":
    //  특별 등급 카드(등급 몫 +20~30)로 짠 팀 한 시즌 시험 — 90/15: 홈런 81 · 타율 .401 · 211이닝 · 탈삼진 283 → 87/10: 홈런 60 · .375 · 196이닝 · 223 (팀은 그대로 1위).
    //  원래 선수 최상위(90대 초반)는 1점 안팎만 준다.
    k: 20, softCap: 87, softW: 10,
  },
  zone: { halfW: 23.59, top: 0.5575, bot: 0.2704 },        // [10]
  count: {
    FB: [0.12, -0.20, -0.40, 0.21, -0.12, -0.40, 0.65, 0.12, -0.28, 1.53, 0.65, 0.12],      // 직구 계열 가중 [설계]
    s: [0.631, 0.381, 0.004, 0.665, 0.523, 0.170, 0.770, 0.709, 0.423, 0.848, 0.842, 0.764], // 의도 공격성 [맞춤]
    A: [-0.924, 0.092, 0.736, -0.452, 0.237, 0.891, -0.630, 0.249, 0.950, -2.810, -0.111, 0.925], // 스윙 절편 [맞춤]
    B: [0.935, 1.287, 1.752, 1.068, 1.321, 1.674, 1.078, 1.333, 1.557, 0.935, 1.299, 1.532],   // 스윙 기울기 [맞춤]
    F: [-0.050, -0.034, -0.077, -0.006, -0.020, -0.071, 0.025, 0.018, -0.037, 0.177, 0.009, 0.018], // 인플레이/컨택 로짓 [10]
    guess: [0.20, 0.10, 0.02, 0.30, 0.15, 0.05, 0.55, 0.35, 0.08, 0.70, 0.55, 0.25],          // 노림수 확률 [설계]
    swingAdj: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],    // [보정] 카운트별 스윙 절편 추가
    zoneAdj: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],     // [보정] 카운트별 의도 s 추가
  },
  pt: {
    veloOff: [0, -2, -6, -13, -17, -22, -14, -10, 0],
    C: [0.19, 0.73, 0.16, -0.38, -0.32, -0.28, -0.28, -0.44, -0.35],     // 접촉 로짓 구종 항 [맞춤]
    ill: [2.0, 1.0, 1.5, 4.0, 4.0, 4.5, 4.0, 5.0, 3.0],                   // 착시 cm [설계]
    sigM: [1.00, 1.02, 1.00, 1.06, 1.10, 1.12, 1.05, 1.10, 1.50],         // 위치 σ 배율 [설계]
    gb: [-0.06, 0.16, 0.03, 0.03, -0.02, 0.06, 0.08, 0.12, 0],             // 땅볼 계수 [15]
    platoon: [0, 0.35, -0.10, 0.55, 0.80, 0.25, -0.45, -0.15, 0],          // 좌우 계수 [15]
    stress: [1, 1, 1.05, 1.15, 1.15, 1.05, 0.90, 1.10, 0.30],             // 팔 부담 [15]
    rainGrip: [0.6, 0.7, 0.8, 1.0, 1.0, 1.2, 0.9, 1.1, 1.3],              // 젖은 공 민감 [15]
    bd: [0, 0, 0, 0, 0, 0.8, 0, 1.0, 1.5],                                // 원바운드 의존 [11]
    fam: [0, 0, 0, 1, 1, 1, 2, 2, 3],                                      // 0 직구 · 1 브레이킹 · 2 오프스피드 · 3 너클
    // 변 고르기: 위·아래·글러브 쪽·팔 쪽 [11]
    side: [[.40, .15, .25, .20], [.05, .45, .10, .40], [.15, .25, .50, .10], [.05, .45, .50, 0], [.05, .45, .50, 0], [.05, .80, .10, .05], [.03, .72, .05, .20], [.03, .72, .05, .20], [.25, .25, .25, .25]],
  },
  sel: { bias: [0, 0, 0, 0, 0, 0, 0, 0, 0], fastBase: 0, platoon: 0.5, weak: 0.35, mem: 0.6, repeat: 0.35, stuff: 0.15, outPitch: 0.6, block: 1.2, mix: 0.25, rain: 0.25 },
  intent: { s0: [0.03, 0.37, 0.60], s1: [0.80, 0.20, 0.0], quick: 0.12, nibble: -0.15, chase: -0.08, calling: 0.10, eye: 0.06, around: 0.10, vsPatient: 0, vsPower: 0 },
  loc: { sigma0: 15, cmdK: 0.12, pWild: 0.030, ctlK: 0.45, sigWild: 40, heartShrink: 9, edgeIn: [1, 8], outNear: [3, 15], outFar: [15, 40], farShare: 0.15 },
  perc: { sp0: 4.0, eye: 0.18, cope: 0.12, dec: 0.15, mem: 0.20, tunnel: 1.0, memIll: 0.5, stuffIll: 0.08 },
  swing: { tSwing: 0.55, eyeOut: 0.25, aggressive: 0.25, patient: -0.25, power: 0.10, contact2S: 0.10, firstPitch: 0.15, guessHit: 0.8, guessMiss: -0.6, tanhW: 6, scale: 1.0, powerCon: 0, contactCon: 0, prodCon: 0 },
  ump: { countShift: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], b0: -0.61, s: 2.02, framing: 0.45, cmd: 0.15, countBias: [0, -1.0, 0, 0, 0, -0.6, 0.6, 0, 0, 1.2, 0.6, 0], heatS: 1.15 },
  con: { c0: 0.922, c1: 0.964, w: 8, zc: 0.55, zk: 0.25, zcope: 0.20, zs: 0.55, velo: 0.030, veloOS: 0, mem: 0.6, highFF: 0.25, two: 0.25, guessHit: 0.35, guessMiss: -0.5, timing: 0.015 },
  foul: { tanh: 0.6, zc: 0.15, zs: 0.10, shorten: -0.25, grinder: -0.30, guess: 0.10, tip: 0.055, tipCatch: 0.92, popFoul: 0.035 },
  hbp: { scale: 0.6, thresh: 50, width: 5, agil: 0.12, temp: 0.0063, rain: [1, 1.03, 1.08, 1.15] },
  wp: { base: 0.20, block: 0.35, pb: 0.0010, pbBlock: 0.45, kn: 3.0, rain: [1, 1.1, 1.3, 1.6], lowZ: 12, wideX: 45, highZ: 150 },
  bat: {
    vb0: 125.0, power: 3.5, strength: 0.8, approachPow: 1.5, contactVb: -2, guessV: 2.5,
    weak0: -1.84, weakC: 0.35, weakK: 0.15, weakS: 0.35, weakD: 0.04, weakMem: 0.3, weakV: 0, barrelV: 0, veloRef: 146.8,
    weakMean: 3.29, weakSd: 0.33, weakTop: 0.60, weakB: [0.72, 0.28],
    mu: 0.69, launch: 0.70, gbP: 0.70, gbPitch: 6.0, zHeight: 0.03, sd: 1.64, sdC: 0.08, sdS: 0.08,
    R: 7.0, laA: 7.47, laK: 1.395, laSd: 9.29, cosPos: 0.81, cosNeg: 1.86, barrel: 0.177, barrelC: 0.10, plateW: 0.20, batW: 1.20,
    gapLD: 0.0, coldEv: 0.005, rainEv: [0, 0, 0.005, 0.010],
  },
  spray: { base: 6.5, tPull: 18, inside: 0.20, gb: 6, fb: -5, slow: 0.12, sd: 24, vRef: 140 },
  air: { expo: 1, offset: 0, temp: 0.18, pres: -0.04, rh: 0.005, elev: 0.0045, tail: 0.415, cross: 0.264, cap: 12, gust: 0.3 },
  gb: { factor: 0.80, chop: 0.55, chopLA: -15, cGrass: [2.5, 2.8, 3.4, 4.2], cTurf: [1.6, 1.7, 1.8, 2.0], kGrass: 1 / 150, kTurf: 1 / 200, grass: [1, 0.98, 0.93, 0.85], turf: [1, 1.03, 1.05, 1.02], bounce: [1, 1.1, 1.3, 1.6], domeTurf: 1.05 },   // 구름: 감속 = c + k·v² [설계 → 보정]
  fld: {
    // 외야 [11 7.2]
    ofReact: 0.50, ofLineReact: 0.0, ofShortReact: 0.0, ifBackReact: 0.2, ifBackV: 0.8, pickup: 0.25, wallPick: 0.45, ofReactFS: 0.06, ofReactIQ: 0.03, ofTau: 1.5, ofTauAg: 0.10, ofPath: 0.92, ofPathR: 0.02, ofPathIQ: 0.01, catchSig: 0.15,
    diveBase: 0.12, diveAg: 0.03, wallK: 0.80, wallIQ: 0.06,
    // 내야(뜬공·라이너) [11 7.2]
    ifFlyReact: 0.25, ifFlyFS: 0.035, ifFlyTau: 0.7, ifFlyV: 0.85,
    // 내야 땅볼 [11 7.3]
    ifReact: 0.28, ifReactFS: 0.04, ifLat: 6.0, ifLatR: 0.40, ifLatS: 0.20, ifTau: 0.5, reach: 1.0, diveReach: 1.2, diveReachAg: 0.25, diveRec: 0.35,
    lineReach: 2.4, lineSig: 0.12,
    // 투수 땅볼 수비 손잡이 [17 심사]: 팔로스루 반응 지연(초)·뒤로 쫓는 한도(m)·내야수 양보 창(초)·손 닿는 거리 배율·촙 첫 바운드(×초속 m).
    // 지금 값 = 이전 보정과 같은 동작(투수가 땅볼의 약 18%를 처리, 실제 6~8%). 투수 몫만 줄이면 내야 땅볼 타율이 .265→.289 로 뛰어(2·유격 범위 재보정 필요) 다음 보정 과제로 남김 — 17_현실성심사.md
    pReact: 0, pBehind: 30, pYield: 0, pReach: 1, pHop: 0, ifRetrV: 99,   // ifRetrV: 내야수가 외야로 빠진 땅볼을 줍는 공 속도 한도(m/s). 9 로 낮추면 외야수가 줍는 게 맞지만 주루 문턱(th1to3·th2toH) 재보정이 함께 필요 — 17 심사 남은 과제
    // 포구·송구 실수 [11 7.3·7.4]
    errCatch: 0.010, errField: 0.018, errThrow: 0.008, wideThrow: 0.06, hands: 0.35, armAcc: 0.40, errInf: [1, 1.05, 1.20, 1.45], errRainCatch: [1, 1.02, 1.06, 1.12, 1.20], errRainThrow: [1, 1.05, 1.12, 1.25, 1.40], errCold: 1.08,
    sunAdd: 0.015, fogAdd: 0.004, gust: 0.06,
    // 위치 [11 7.1] (x 1루 쪽 +, y 중견 쪽 +) — 투수, 포수, 1B, 2B, 3B, SS, LF, CF, RF
    posX: [0, 0, 19.0, 12.9, -18.5, -15.4, 0, 0, 0], posY: [17.0, -1.0, 26.5, 42.1, 26.0, 42.3, 0, 0, 0], ofDepth: 0.78, ofAng: 28,
  },
  thr: {
    vBase: [34.0, 35.0, 33.5, 34.0, 37.0, 37.0, 37.5, 38.5, 39.0], arm: 2.0, normal: 0.88, hurry: 0.97, arc: 0.04,
    relIF: 0.45, relIFAg: 0.04, relIFIQ: 0.03, relOF: 0.75, relOFAg: 0.05, relay: 0.55, tagRel: 0.0, relayDist: 60, bounce: 0.85, tag: 0.08,
  },
  run: {
    v0: 7.0, vK: 0.021, tauStand: 1.0, tauAg: 0.05, tauMove: 0.4, h1A: 4.80, h1K: 0.0075, lhb: 0.10, hustle: 0.03, turn: 0.25, turnBR: 0.03,
    lead1: 3.7, lead1Jump: 0.3, lead2: 2.0, lead2b: 5.0, lead2b2: 2.5, lead3: 3.0, lead3b: 1.5,
    sigJ: 0.22, sigJBR: 0.25, safeNoise: 0.07, slide: 0.03, headfirst: 0.04, lineFreeze: 0.3,
    // θ 기본(초): [0아웃,1아웃,2아웃] [11 8.2]
    th1to3: [0.30, 0.20, 0.08], th2toH: [0.20, 0.05, -0.15], th1toH2B: [0.25, 0.15, -0.05], thTag3: [0.10, 0.00, 9], thTag2: [0.25, 0.40, 9], thB2: [0.35, 0.30, 0.25], thB3: [0.45, 0.40, 0.35],
    flyRead: 0.2, flyMaxStart: 9, half1: 12, half2: 9, gbR2go: 0.15, gbR3contact: 0.0, closeCall: 0.06,
  },
  dp: { pivot: 0.75, turnDP: 0.05, ag: 0.02, mech: 0.012, chem: 0.03, min: 0.45, max: 1.10, feed: 0.25 },
  steal: {
    jump: 0.30, jumpK: 0.05, pickoffK: 0.04, slowTempo: 0.03, lefty: 0.05, jumpSd: 0.05, deliv: 1.55, delivK: 0.004, pop: 2.15, popK: 0.004,
    sig: 0.09, slide: 0.03, wide: 0.12, wideK: 0.3, err: 0.02, errK: 0.4, pitchout: 0.15, killer: 0.04,
    often: 2.0, attemptScale: 1.0, margin: 0.0, breakEven2: 0.70, breakEven3: 0.75, green: 1.0, minProb: 0.62,
  },
  pick: { base: 0.07, thr: 1.5, freq: 0.25, artist: 1.5, out: 0.010, outPk: 0.45, outJump: 0.35, err: 0.004, leadDecay: 0.92, maxPer: 3 },
  balk: { base: 0.0003, pk: 0.4, comp: 0.3 },
  bunt: { offer: 0.92, offerOut: 0.18, contact: 1.4, skill: 0.6, stuff: 0.20, velo: 0.015, ballPen: 0.9, fast: 0.3, fair: 0.68, fairK: 0.06, pop: 0.07, popK: 0.45, v: 6.0, vSd: 1.6, vK: 0.6, friction: 0.9, leadMargin: 0.35 },
  fat: {
    perPitch: 0.012, overVelo: 0.06, overCmd: 0.25, overCtl: 0.15, overStuff: 0.15, overWild: 0.02, longInning: 1.25, longInningN: 20,
    strengthA: 1.15, strengthB: 0.003, limitA: 85, limitK: 0.5, armK: 0.2, effort: 1.08, slowStarter: 4,
    heat: [[26, 1], [30, 1.05], [33, 1.1], [35, 1.16], [38, 1.25], [40, 1.32]],
    b2b15: 0.8, b2b20: 1.2, b2b3: 3.5,
  },
  mem: { etaSwing: 0.12, etaTake: 0.08, iq: 0.2, decay: 0.85, team: 0.01, teamMax: 0.15, weak: 0.3 },
  platoon: { batPow: 0.6, batEye: 0.3, pit: 2.5 },
  home: { contact: 0.8, eye: 1.0 },
  ctx: { bigGame: 0.12, pressure: 0.08, adapt: 4 },
  ai: {
    hookAdd: 4, spLimitSlack: 0, spHookRuns: 6, spHookRunsEarly: 5, spMinInnWin: 5, rpMaxPitches: 30, rpOneInning: true,
    phLI: 1.2, phGain: 0.030, ibbMargin: 0.004, buntK: 0.012, closerSaveOnly: true, pitchoutP: 0.35,
    leash: 0, tto3: 0.0, starterPullLI: 1.8, mopDiff: 6, liNorm: 0.0,
    // 17 현실성 심사: 이닝 중 위기 교체(선발·구원), 효율 좋은 중간 계투의 두 번째 이닝 [설계 → 보정]
    spTrouble: 0.15, rpTrouble: 0.3, rpExtraPitches: 20, rpExtraP: 0.9,
    // 작전 판단은 '원래 눈금(표준편차 1)'의 능력 차로 본다 — zGain 압축(0.25)과 무관하게 [17 심사]
    buntBase: 0.95, prSlow: 40, prFast: 65, prGap: 20, defSub: 1, noHitCap: 122,
  },
  ev: {
    capPhys: 0.30, capPsy: 0.113, san: 0.47,
    // 채널 → 손잡이 [11 4.4]
    contactLogit: 1.3, contactWeak: 1.5, powerVb: 10, eyeNoise: 2.0, eyeChase: 1.0, aggr: 1.2,
    stuffLogit: 1.3, stuffWeak: 1.5, ctlWild: 2.5, ctlSig: 0.8,
  },
  inj: { rate: 1.0 },
  wx: { coldCtl: 0.0, sunK: 0.06, twilight: 1.02, fog1: 1.10, fog05: 1.25, rainSig: [1, 1.03, 1.08, 1.15, 1.25], heatSig: 1.05, heatWild: 1.10, footing: [1, 1.02, 1.05, 1.10], coldVelo: 0.5, veloTemp: 0.08, plateTemp: 0.045, moveTemp: 0.0034 },
  clock: { pitchEmpty: 19, pitchOn: 24, paChange: 15, bip: 8, inningChange: 120, pitcherChange: 140, visit: 35, cooling: 240 },
  /** 리그 득점 환경 보정(마지막 손잡이 — 모든 것이 맞은 뒤 아주 작게만) */
  env: { contactAdj: 0, powerAdj: 0, babipAdj: 0 },
};

export type Params = typeof P;

/** 깊은 덮어쓰기(보정 도구용). 배열은 통째로 바꾼다. */
export function setParams(patch: any, target: any = P): void {
  for (const k of Object.keys(patch)) {
    const v = patch[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) setParams(v, target[k]);
    else target[k] = Array.isArray(v) ? v.slice() : v;
  }
}
export function snapshotParams(): any { return JSON.parse(JSON.stringify(P)); }

/**
 * 보정 결과(13_보정결과.md, 반복 t41 — 리그 평균 2만 경기에서 목표 182/228 통과).
 * 위 기본값은 물리·설계 근거 초기값이고, 여기 값이 실제로 쓰는 보정값이다. 다음 보정은 이 블록만 고친다.
 */
export const CALIBRATED = {"thr":{"arc":0.1,"relOF":0.85,"tagRel":0.35},"fld":{"ifLat":4.4,"reach":0.8,"diveReach":0.8,"ifReact":0.33,"wallK":0.92,"ofReact":0.75,"ofLineReact":0.45,"ofShortReact":0.25,"pickup":0.45,"ofPath":0.9,"wallPick":1,"errField":0.022,"errThrow":0.01},"hbp":{"thresh":69},"con":{"c0":0.6499999999999999,"c1":1.55,"two":1.02},"swing":{"scale":1.15},"count":{"F":[-0.52,-0.384,-0.30700000000000005,-0.476,-0.37,-0.30100000000000005,-0.445,-0.332,-0.267,-0.173,-0.34099999999999997,-0.21200000000000002],"zoneAdj":[0.04000000000000001,-0.009999999999999995,-0.29000000000000004,0.09,0.04000000000000001,-0.22,0.13999999999999999,0.04000000000000001,-0.039999999999999994,0.41000000000000003,0.18,0.04000000000000001],"swingAdj":[-0.2,0,0.1,-0.25,0,0.1,-0.15,0,0.1,0,0,0.05]},"bat":{"mu":0.85,"vb0":125.5,"laSd":9,"power":4.5},"spray":{"base":4,"sd":30},"sel":{"fastBase":0.45,"bias":[0.6,-0.35,0,0.5,0,0,-0.2,-0.2,0]},"ai":{"ibbMargin":0.005,"buntK":0.01,"hookAdd":-2,"spHookRuns":5},"run":{"thTag3":[0.3,0.2,9],"thB2":[0.6,0.5499999999999999,0.5],"thB3":[-0.7000000000000001,-0.75,-0.8],"th2toH":[1.2,0.85,0.35],"th1to3":[1,0.8,1],"flyRead":2,"th1toH2B":[0.05,0,-0.1],"half1":15,"half2":11,"flyMaxStart":1.6},"dp":{"pivot":0.95},"steal":{"attemptScale":1.2,"jump":0.12,"minProb":0.5,"margin":0,"often":1.3},"pick":{"out":0.08,"base":0.1},"gb":{"factor":0.88},"air":{"offset":-1.5,"expo":0.2},"loc":{"pWild":0.025},"wp":{"base":0.19,"pb":0.001},"ump":{"countShift":[0,0,-2.5,0.6,0,-1.8,1,0.3,-1,2,1,0]},"balk":{"base":0.00018},"wx":{"rainSig":[1,1.01,1.04,1.08,1.12],"coldCtl":0.01},"fat":{"perPitch":0.018},"platoon":{"pit":1.5,"batPow":1,"batEye":0.5},"foul":{"popFoul":0.022},"zGain":0.25,"zCube":[0.4,0.4,0.6,0.25,0.6,0.25,0.2,0.2],"zCubeStuff":0.2,"zGainBat":1};
setParams(CALIBRATED);

/**
 * 17 현실성 심사(fd/out/17_현실성심사.md) 뒤 덮어쓰기 — t41 보정값 위에 이것만 바꿨다.
 * - air: 바람 복원(노출 0.2 → 1.0, 홈런 총량은 offset −1.5 → −1.8 로 유지) — 외야로 4.5m/s(노출 0.4) 홈런 +37%, 안으로 −42%
 * - ai.hookAdd: 이닝 중 위기 교체(선발)를 넣은 만큼 이닝 시작 교체 기준을 6구 늦춤(−2→4). 중간 계투 '한 이닝 더' rpExtraPitches 20 과 함께: 선발 5.10이닝·QS .328·6이닝↑ .370·구원 3.49명
 * - env.contactAdj: 끝내기 득점 무효·미완료 타석·작전 AI 정리로 줄어든 득점을 리그 평균으로 되돌림(타율 .257→.260, 삼진 .204→.199)
 * - run.thB3: 타자의 3루 욕심 문턱(0·1·2사). 보정값 [−0.7,−0.75,−0.8] 은 '송구가 0.7초 먼저 와도 뛴다' — 3루 시도의 66~70% 가 아웃(천 타석당 6.4번, 실제의 6~8배),
 *   2사에 가장 무모했다. '0·2사에는 3루에서 죽지 마라' 원칙대로 1사만 조금 공격적으로: 시도 중 아웃 19%·24%·11%, 3루타 .0030→.0025/타석(목표 .0036±.0012 안)
 * - run.th1toH2B: 2루타 때 1루 주자 홈 쇄도 1사 문턱 0→−0.12. 전에는 무모하게 3루로 가는 타자가 1루 주자를 홈으로 '떠밀어' 득점률을 채웠다 — 타자가 멈추자
 *   1사 득점률이 .33→.28 로 떨어져, 주자 스스로의 판단을 조금 공격적으로(1사 .30, 홈 아웃 .057)
 */
export const REVIEW17 = { air: { offset: -1.8, expo: 1 }, ai: { hookAdd: 4 }, env: { contactAdj: 0.06 }, run: { thB3: [0, -0.1, 0.1], th1toH2B: [0.05, -0.12, -0.1] } };
setParams(REVIEW17);

/**
 * 18 재미·악용 심사(fd/out/18_재미악용심사.md) — 17 위에 이것만.
 * - bonus.mode 'linear': 경기엔진.md 3.4 결정(압축 폐기)을 코드에 반영. 압축이면 폭발 순간(24→25명, +15→+25)이 승률 .585 로 거의 안 보였다(선형 .785).
 *   대신 풀덱끼리는 GameInput.levelRef(R)로 공통 수준을 뺀다 — R 없이 +37 대 +37 이면 타율 .346·삼진 8.8%·홈런/타석 .088 의 '홈런 더비'.
 * - 접근법의 대가(swing.powerCon·contactCon·prodCon, 맞히기 배트 속도 −2→−1)와 배터리의 맞대응(intent.vsPatient·vsPower): 모든 타석 같은 접근법이 정답이 되지 않게.
 * - 구속의 효과(bat.weakV·barrelV 빗맞음, con.velo 직구 헛스윙 0.03→0.05, con.veloOS 변화구도 투수 구속만큼, 기준 veloRef = 리그 실측 평균 147.3):
 *   전에는 구속이 오르면 헛스윙은 조금 늘고 타구는 더 세져(충돌) 카드 'VEL' +20(6km/h)이 승률 −.018·실점 +0.17 — 올릴수록 손해인 죽은 능력치였다.
 *   이제 +20 이 승률 약 +.03·실점 약 −0.36(연투·피로 구속 손실도 진짜 비용). 늘어난 리그 득점은 env.contactAdj 0.06 → 0.03 으로 되돌림(보정 2만 경기 명시 통과 183 → 185).
 */
export const REVIEW18 = { bonus: { mode: 'linear' }, bat: { contactVb: -1, weakV: 0.05, barrelV: 0.015, veloRef: 147.3 }, con: { velo: 0.05, veloOS: 0.02 }, env: { contactAdj: 0.03 }, swing: { powerCon: 0.30, contactCon: 0.30, prodCon: 0.15 }, intent: { vsPatient: 0.25, vsPower: 0.10 } };
setParams(REVIEW18);
