// 야구 매니저 캐릭터 아트 — 외부 라이브러리 없이 SVG 문자열을 만드는 순수 함수 모음.
//
//   const ap = makeAppearance(spec);              // 시드(선수 id) → 외모·체격
//   const kit = makeKit(spec, ap, team, 'home');  // 구단 색 → 유니폼·장비
//   renderPortrait(ap, kit, { width: 240 });      // 카드 초상 <svg>
//   figureSvg(ap, kit, standingPose(ap));         // 전신 옆모습 <svg>
//   solveRig(ap.build, pose)                      // 관절 좌표 (애니메이션·충돌 판정용)

export * from './types';
export { makeAppearance, skinTone } from './appearance';
export { makeBuild } from './build';
export { makeKit, TEAMS } from './kit';
export { renderPortrait } from './portrait';
export { renderFigure, figureSvg } from './figure';
export { renderHead } from './head';
export { headModel } from './headModel';
export { torsoModel } from './torso';
export { solveRig, groundPose, ik2, sideX } from './rig';
export type { Joints } from './rig';
export { standingPose } from './poses';
export { Rng, hash32 } from './rng';

// 움직이는 그림·폼
export { LiveFigure } from './live';
export type { LiveOpts } from './live';
export { solve3, axesOf } from './rig3';
export type { Pose3, Joints3 } from './rig3';
export * from './forms';
export type { Motion } from './motion';
export { pitchMotion } from './motionPitch';
export { batMotion, buntMotion } from './motionBat';
export { catcherMotion, infieldMotion, outfieldMotion, runMotion } from './motionField';
export { Stage, motionBox } from './stage';
