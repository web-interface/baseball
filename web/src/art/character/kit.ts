// 유니폼·장비 — 구단 색(주·보조·강조) + 선수별 취향(양말, 토시, 장갑, 목걸이 …)

import type { Appearance, Kit, PlayerSpec, TeamColors } from './types';
import { Rng } from './rng';
import { adj, lum, mix } from './color';

/** 미리보기용 가상 구단 4개 (실존 구단과 이름·색 조합을 겹치지 않게) */
export const TEAMS: TeamColors[] = [
  { id: 'comets', name: 'Comets', cap: 'C', primary: '#1d2b4a', secondary: '#e0552f', accent: '#f1ece1', awayBase: 'primary' },
  { id: 'foxes', name: 'Foxes', cap: 'F', primary: '#a3202f', secondary: '#1c1b20', accent: '#c8ccd2', awayBase: 'primary' },
  { id: 'owls', name: 'Owls', cap: 'O', primary: '#1e5a3e', secondary: '#d4a43c', accent: '#f1ece0', pinstripe: true, awayBase: 'primary' },
  { id: 'waves', name: 'Waves', cap: 'W', primary: '#106e84', secondary: '#15304a', accent: '#ef6b55', awayBase: 'primary' },
];

const WHITE = '#f2f0ea';
const GRAY = '#b9bcc1';

export function makeKit(spec: PlayerSpec, ap: Appearance, team: TeamColors, set: 'home' | 'away'): Kit {
  const r = new Rng(spec.id).fork('kit');
  const tr = new Rng(team.id).fork('team'); // 구단 공통 디자인(바지 줄 등)
  const home = set === 'home';
  const awayPrimary = team.awayBase === 'primary';
  const jersey = home ? WHITE : awayPrimary ? team.primary : GRAY;
  const darkJersey = lum(jersey) < 0.55;
  const isP = spec.pos === 'P', isC = spec.pos === 'C';
  const of = spec.pos === 'LF' || spec.pos === 'CF' || spec.pos === 'RF';

  const leather = r.weighted([
    ['#b5743b', 3], ['#6b3f22', 3], ['#1f1c1b', 3], ['#d0a15e', 1.5], ['#8a2a1f', 0.8], [team.primary, 1.4], ['#3a4a63', 0.6],
  ] as const);
  const lace = r.weighted([
    [leather === '#1f1c1b' ? '#b5743b' : '#2a201b', 2], ['#c9a46a', 1.4], [team.secondary, 1], ['#e9e2d4', 0.8], ['#7a1e1e', 0.6],
  ] as const);

  const batGlove = r.weighted([[WHITE, 2], ['#1d1d22', 2.4], [team.primary, 2.4], [team.secondary, 1.2], ['#c8ccd2', 0.6]] as const);
  const batGlove2 = r.weighted([[team.secondary, 2], [WHITE, 1.4], [team.primary, 1], ['#1d1d22', 1], [team.accent, 1]] as const);

  return {
    team, set,
    number: spec.number ?? r.int(1, 99),
    jersey,
    jerseyTrim: home ? team.primary : awayPrimary ? team.accent : team.primary,
    jerseyTrim2: home ? team.secondary : awayPrimary ? team.secondary : team.secondary,
    letter: home ? team.primary : awayPrimary ? WHITE : team.primary,
    letterLine: home ? team.secondary : awayPrimary ? team.secondary : team.secondary,
    pants: home ? WHITE : awayPrimary ? (tr.chance(0.5) ? WHITE : GRAY) : GRAY,
    pantsStripe: tr.chance(0.45) ? team.primary : null,
    undershirt: lum(team.primary) < 0.45 ? team.primary : team.secondary,
    longSleeve: r.chance(isP ? 0.36 : 0.26),
    belt: tr.chance(0.6) ? team.primary : '#1c1b1f',
    socks: r.chance(isC ? 0.2 : 0.36) ? 'high' : 'low',
    sock: team.primary,
    sockStripe: tr.chance(0.6) ? (darkJersey ? team.accent : team.secondary) : null,
    cleat: r.weighted([[team.primary, 3.5], ['#1c1b20', 3.5], [WHITE, 2]] as const),
    cleatTrim: r.weighted([[WHITE, 2], [team.secondary, 1.4], ['#1c1b20', 1]] as const),
    cap: team.primary,
    capBrim: tr.chance(0.25) ? team.secondary : team.primary,
    capLogo: lum(team.primary) < 0.5 ? (tr.chance(0.5) ? team.accent : team.secondary) : WHITE,
    capLogoLine: team.secondary,
    helmet: team.primary,
    helmetMatte: tr.chance(0.55),
    armSleeve: r.chance(0.2)
      ? { arm: r.chance(0.6) ? 'throw' : 'glove', color: r.weighted([['#1c1b20', 3], [WHITE, 2], [team.primary, 2]] as const), full: r.chance(0.5) }
      : null,
    elbowGuard: !isP && r.chance(0.55) ? r.weighted([['#1c1b20', 3], [team.primary, 2], [adj(team.primary, { l: -0.06 }), 1]] as const) : null,
    batGlove, batGlove2: batGlove2 === batGlove ? mix(batGlove, '#808080', 0.4) : batGlove2,
    wristband: r.chance(0.2) ? { color: r.weighted([[WHITE, 2], ['#1c1b20', 2], [team.primary, 2]] as const), arm: r.pick(['both', 'throw', 'glove'] as const) } : null,
    eyeBlack: !isP && !isC && r.chance(of ? 0.22 : 0.12),
    necklace: r.chance(0.34) ? { color: r.weighted([['#1c1b20', 3], [team.primary, 2], ['#c9a24a', 1], ['#b9bec4', 1], [team.secondary, 1]] as const), beads: r.chance(0.4) } : null,
    glove: leather,
    gloveLace: lace,
    gloveWeb: isC || spec.pos === '1B' ? 'closed' : isP ? r.pick(['closed', 'basket'] as const) : of ? r.pick(['h', 'h', 'basket'] as const) : r.pick(['h', 'basket'] as const),
    bat: r.weighted([['#d8b98c', 3], ['#3b2416', 1.5], ['#1d1b1c', 1.5], ['#c79a62', 1.2], ['#7b3b23', 0.8]] as const),
    batTape: r.weighted([['#1d1b1c', 2], [WHITE, 1], [team.primary, 1]] as const),
    batBarrel: r.chance(0.3) ? '#1d1b1c' : '',
    catcher: isC
      ? { mask: r.pick([team.primary, '#1c1b20', team.primary]), cage: r.pick(['#232327', '#9aa0a8', '#232327']), gear: team.primary, gearTrim: r.pick([team.secondary, WHITE, team.accent]) }
      : null,
  };
}
