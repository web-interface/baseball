// 기본 자세 — 서 있기(글러브/배트/포수). 투구·타격 동작은 같은 Pose 형식으로 따로 만든다.
// 같은 '서 있기'라도 선수마다(시드) 무게중심·팔 위치·고개가 달라 공장에서 찍은 듯한 반복을 피한다.

import type { Appearance, Pose, Side } from './types';
import { groundPose } from './rig';
import { Rng } from './rng';

const other = (s: Side): Side => (s === 'R' ? 'L' : 'R');

export type StandKind = 'glove' | 'bat' | 'catcher';
export type GloveIdle = 'waist' | 'hang' | 'set' | 'ball' | 'rest';

/** 서 있는 자세: 포지션·손잡이에 따라 글러브를 끼거나 배트를 어깨에 걸침 */
export function standingPose(ap: Appearance, kind?: StandKind, idle?: GloveIdle): Pose {
  const r = new Rng(ap.id).fork('stand');
  const k = kind ?? (ap.pos === 'C' ? 'catcher' : ap.pos === 'DH' ? 'bat' : 'glove');
  const gloveSide: Side = ap.throws === 'R' ? 'L' : 'R';
  const throwSide = other(gloveSide);
  const heavy = ap.build.fat;
  // 체중이 실린 다리(뒷다리) / 편한 다리
  const weightBack = r.chance(0.6);
  const lean = -2.2 * heavy + r.range(-1.5, 2.5);
  const wide = 4 + heavy * 5 + r.range(0, 4);
  const base: Pose = {
    root: [0, -ap.build.hipY],
    pelvis: 2 + lean * 0.5 + (weightBack ? 1 : -1),
    spine: 1 - heavy * 3 + r.range(-1, 1),
    chest: -1 + r.range(-2, 2),
    neck: 5 + r.range(-3, 4),
    head: r.range(-3, 5),
    hipYaw: 76 + r.range(-4, 5),
    chestYaw: 64 + r.range(-6, 6),
    headYaw: 76 + r.range(-8, 10),
    arm: {
      R: { sh: -5, el: 16, wr: 6, hand: 'relax' },
      L: { sh: 6, el: 22, wr: 4, hand: 'relax' },
    },
    leg: weightBack
      ? { R: { hip: wide * 0.95, knee: 10 + r.range(0, 8), ankle: 4 }, L: { hip: -wide * 0.55, knee: 2 + r.range(0, 3), ankle: -2 } }
      : { R: { hip: wide * 0.45, knee: 3 + r.range(0, 3), ankle: 1 }, L: { hip: -wide * 0.9, knee: 9 + r.range(0, 6), ankle: -6 } },
    glove: null,
    bat: null,
  };
  if (k === 'glove') {
    base.glove = gloveSide;
    const v: GloveIdle = idle ?? r.weighted([
      ['waist', 2], ['hang', 3], ['ball', 1.2], ['rest', 2.4], ['set', ap.pos === 'P' ? 1.6 : 0.4],
    ] as const);
    switch (v) {
      case 'waist': // 글러브를 배 앞에, 다른 손은 옆으로
        base.arm[gloveSide] = { sh: 3 + r.range(-3, 4), el: 62 + r.range(-8, 8), wr: -10, hand: 'glove' };
        base.arm[throwSide] = { sh: -5 + r.range(-3, 3), el: 14 + r.range(0, 10), wr: 6, hand: 'relax' };
        break;
      case 'hang': // 글러브를 늘어뜨림
        base.arm[gloveSide] = { sh: -3 + r.range(-3, 3), el: 12 + r.range(0, 8), wr: 2, hand: 'glove' };
        base.arm[throwSide] = { sh: 2 + r.range(-3, 3), el: 22 + r.range(0, 12), wr: 8, hand: 'relax' };
        break;
      case 'ball': // 공을 쥐고 글러브와 맞댐
        base.arm[gloveSide] = { sh: 8 + r.range(-3, 3), el: 104 + r.range(-6, 6), wr: -16, hand: 'glove' };
        base.arm[throwSide] = { sh: 4 + r.range(-3, 3), el: 108 + r.range(-6, 6), wr: -10, hand: 'fist' };
        break;
      case 'rest': // 글러브 손을 허리 옆에 걸침
        base.arm[gloveSide] = { sh: -14 + r.range(-3, 3), el: 66 + r.range(-6, 6), wr: -20, hand: 'glove' };
        base.arm[throwSide] = { sh: -2, el: 18 + r.range(0, 8), wr: 4, hand: 'relax' };
        break;
      case 'set': // 투수 세트 자세처럼 두 손을 가슴 앞에
        base.arm[gloveSide] = { sh: 12 + r.range(-3, 3), el: 118 + r.range(-6, 6), wr: -22, hand: 'glove' };
        base.arm[throwSide] = { sh: 9 + r.range(-3, 3), el: 124 + r.range(-6, 6), wr: -14, hand: 'fist' };
        base.head = r.range(2, 7);
        break;
    }
  } else if (k === 'bat') {
    const batHand: Side = ap.bats === 'L' ? 'L' : 'R';
    base.arm[batHand] = { sh: 16 + r.range(-3, 3), el: 128 + r.range(-6, 6), wr: -30, hand: 'grip' };
    base.arm[other(batHand)] = { sh: -2, el: 18 + r.range(0, 10), wr: 4, hand: 'relax' };
    base.bat = { side: batHand, angle: 214 + r.range(-6, 6) };
    base.helmet = true;
  } else {
    // 포수: 마스크를 한 손에 듦, 보호대
    base.glove = gloveSide;
    base.arm[gloveSide] = { sh: 4, el: 34 + r.range(-6, 10), wr: -6, hand: 'glove' };
    base.arm[throwSide] = { sh: 10 + r.range(-3, 3), el: 44 + r.range(-6, 8), wr: 10, hand: 'hold' };
    base.mask = 'hand';
  }
  // 몸 방향 — 모두 정측면이면 한 줄로 세웠을 때 공장 반복처럼 보인다.
  // 글러브를 낀 선수 일부는 3/4 쪽으로 돌려 세운다 (28° 아래는 팔·배트가 겹쳐 어색해서 44° 이상만).
  if (k === 'glove') {
    const ry = new Rng(ap.id).fork('stand-yaw');
    if (ry.chance(0.45)) {
      const y = ry.range(44, 58);
      base.hipYaw = y + 6;
      base.chestYaw = y - 4;
      base.headYaw = y + ry.range(6, 16);
    }
  }
  return groundPose(ap.build, base);
}
