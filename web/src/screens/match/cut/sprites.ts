// 명장면 컷 그림 — 경기장 · 투수(와인드업 · 던짐 · 마무리) · 타자 뒷모습(준비 · 맞는 순간)을 SVG → 그림 URL 로. 같은 그림은 다시 쓴다.
import { drawSd, type SdPose } from '../../../art/sd/draw';
import { sdOptsOf, kitOf } from '../../../art/sd';
import { BACK_VIEW, backPoints, backSvgOf, type BackPose } from '../../../art/sd/back';
import type { Player, Team } from '../../../game/types';
import { stadiumSvg, type StadiumOpts } from './stadium';

const urls = new Map<string, string>();
function urlOf(key: string, make: () => string) {
  let u = urls.get(key);
  if (!u) {
    u = URL.createObjectURL(new Blob([make()], { type: 'image/svg+xml' }));
    urls.set(key, u);
    if (urls.size > 80) { const [k0, u0] = urls.entries().next().value as [string, string]; urls.delete(k0); setTimeout(() => URL.revokeObjectURL(u0), 8000); }
  }
  return u;
}

export function stadiumUrl(o: StadiumOpts) {
  return urlOf(`st|${JSON.stringify(o)}`, () => stadiumSvg(o));
}

/** 투수 — 앞모습 SD 세 장면 (그림 상자 240 × 280) */
export function pitcherUrls(p: Player, t: Team, set: 'home' | 'away') {
  const base = sdOptsOf(p, t, set, 'pitching');
  const one = (pose: SdPose) => urlOf(`p|${p.id}|${p.look}|${t.id}|${set}|${pose}`, () =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 280">${drawSd({ ...base, id: `bc-${p.id}-${pose}`, pose, look: 0, down: false, up: pose === 'cock' })}</svg>`);
  return { windup: one('windup'), cock: one('cock'), ready: one('ready'), lefty: p.throws === 'L' };
}

/** 타자 뒷모습 — 반전(좌타)이면 그림 상자도 반대쪽으로 넓다 */
export function batterUrls(p: Player, t: Team, set: 'home' | 'away', lefty: boolean, swingY: number) {
  const o = sdOptsOf(p, t, set, 'batting');
  const kit = kitOf(p, t, set);
  const common = { kit, mirror: lefty, build: o.build, skin: o.skin, hair: o.hair, name: p.name, gloveColor: o.gloveColor, batColor: o.batColor, band: o.band, bandColor: o.bandColor, swingY };
  const one = (pose: BackPose) => urlOf(`b|${p.id}|${p.look}|${t.id}|${set}|${lefty}|${pose}|${Math.round(swingY)}`, () =>
    backSvgOf({ ...common, id: `bc-${p.id}-${pose}`, pose }));
  return { load: one('load'), contact: one('contact'), pts: backPoints({ pose: 'contact', build: o.build, mirror: lefty, swingY }), loadPts: backPoints({ pose: 'load', build: o.build, mirror: lefty }) };
}

/** 그림 상자(BACK_VIEW — 반전이면 반대쪽) */
export function backBox(lefty: boolean) {
  const v = BACK_VIEW;
  return lefty ? { x: 240 - (v.x + v.w), y: v.y, w: v.w, h: v.h } : v;
}

/** 그림 URL 이 다 그려질 때까지 (컷 시간표가 빈 화면으로 시작하지 않게) */
export function preload(list: string[]) {
  return Promise.all(list.map((u) => new Promise<void>((res) => {
    const im = new Image();
    im.onload = () => { (im.decode ? im.decode() : Promise.resolve()).catch(() => undefined).then(() => res()); };
    im.onerror = () => res();
    im.src = u;
  })));
}
