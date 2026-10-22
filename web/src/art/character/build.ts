// 체격 — 키·몸무게·포지션(+시드) → 관절 길이와 부위 굵기 (cm)
// 기준: 185cm / 88kg 운동선수. 길이는 인체 비율 표(Drillis–Contini)를 따른다.

import type { Build, BuildType, PlayerSpec } from './types';
import { Rng } from './rng';
import { clamp } from './geom';

const POS_FAT: Record<string, number> = { P: 0.04, C: 0.16, '1B': 0.12, '2B': -0.1, '3B': 0.03, SS: -0.12, LF: 0, CF: -0.12, RF: 0.02, DH: 0.14 };
const POS_MUSCLE: Record<string, number> = { P: -0.04, C: 0.06, '1B': 0.08, '2B': -0.02, '3B': 0.06, SS: 0, LF: 0.04, CF: 0.02, RF: 0.08, DH: 0.1 };

export function makeBuild(spec: PlayerSpec): Build {
  const r = new Rng(spec.id).fork('build');
  const h = clamp(spec.heightCm, 160, 205);
  const w = clamp(spec.weightKg, 55, 140);
  const bmi = w / ((h / 100) * (h / 100));
  const sz = h / 185;
  const wf = Math.sqrt(w / h / (88 / 185)); // 굵기 배율 (같은 키에서 무게가 늘면 단면적 ∝ 무게)

  const fat = clamp((bmi - 24.2) / 7.5 + (POS_FAT[spec.pos] ?? 0) + r.gauss(0, 0.1) + ((spec.age ?? 28) - 28) * 0.008, 0, 1);
  const muscle = clamp(0.5 + (bmi > 23 && bmi < 30 ? 0.12 : -0.06) + (POS_MUSCLE[spec.pos] ?? 0) + r.gauss(0, 0.15) - fat * 0.15, 0, 1);
  const frame = clamp(0.5 + (wf - 1) * 0.9 + r.gauss(0, 0.16), 0, 1);

  let type: BuildType;
  if (bmi < 24 && h >= 188) type = 'lanky';
  else if (fat > 0.6) type = 'heavy';
  else if (bmi < 23.6) type = 'lean';
  else if (bmi < 27.2 && fat < 0.45) type = 'athletic';
  else type = 'power';

  const legRatio = r.around(1, 0.018, 0.96, 1.04);
  const headScale = (0.66 + 0.4 * sz) * r.around(1, 0.022, 0.95, 1.05);
  const hipY = 0.53 * h * legRatio;
  const ankleH = 0.043 * h;
  const kneeY = 0.287 * h * legRatio;
  const neckBase = 0.818 * h;

  return {
    h, w, bmi, type, fat, muscle, frame, headScale,
    hipY,
    thigh: hipY - kneeY,
    shin: kneeY - ankleH,
    ankleH,
    footL: 0.152 * h + 1.5,
    torsoL: neckBase - hipY,
    neckL: h - 13.1 * headScale - neckBase,
    upperArm: 0.183 * h * r.around(1, 0.015, 0.97, 1.03),
    foreArm: 0.146 * h,
    hand: 0.105 * h,
    shoulderHalf: 20.3 * Math.pow(sz, 0.9) * (0.93 + 0.14 * frame) * (0.95 + 0.09 * muscle) * Math.pow(wf, 0.28),
    chestHalf: 15.6 * Math.pow(sz, 0.75) * Math.pow(wf, 0.62) * (0.95 + 0.1 * frame),
    chestFront: 11.8 * Math.pow(wf, 0.9) * (0.92 + 0.12 * muscle + 0.08 * fat),
    chestBack: 9.9 * Math.pow(wf, 0.75),
    waistHalf: 13.8 * Math.pow(wf, 0.95) * (0.86 + 0.4 * fat),
    belly: 9.5 * Math.pow(wf, 1.0) * (0.82 + 0.9 * fat),
    hipHalf: 16.3 * Math.pow(sz, 0.6) * Math.pow(wf, 0.62) * (0.95 + 0.13 * fat),
    butt: 10.8 * Math.pow(wf, 0.9) * (0.94 + 0.2 * fat + 0.1 * muscle),
    neckW: 6.1 * Math.pow(wf, 0.6) * (0.9 + 0.22 * muscle),
    neckD: 5.6 * Math.pow(wf, 0.5) * (0.95 + 0.1 * fat),
    deltoid: 6.6 * Math.pow(wf, 0.7) * (0.86 + 0.28 * muscle),
    upperArmD: 11.7 * Math.pow(wf, 0.95) * (0.88 + 0.22 * muscle + 0.08 * fat),
    foreArmD: 9.6 * Math.pow(wf, 0.78) * (0.9 + 0.18 * muscle),
    wristD: 5.7 * Math.pow(sz, 0.5) * Math.pow(wf, 0.3),
    thighD: 17.4 * Math.pow(wf, 1.0) * (0.9 + 0.14 * muscle + 0.12 * fat),
    kneeD: 10.6 * Math.pow(wf, 0.5) * Math.pow(sz, 0.4),
    calfD: 11.3 * Math.pow(wf, 0.75) * (0.9 + 0.16 * muscle),
    ankleD: 6.8 * Math.pow(wf, 0.3) * Math.pow(sz, 0.4),
  };
}
