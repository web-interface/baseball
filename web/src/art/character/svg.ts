// SVG 조립 도구 — id, 클립, '빛 방향으로 밀어 낸 그림자' 셰이딩
//
// 셰이딩 원리: 도형 S 를 빛 쪽으로 v 만큼 민 S+v 를 만들고, S 안에서 (S+v) 바깥 = 빛 반대편 초승달.
// 이 초승달을 그림자색으로 칠하면 손으로 그린 2~3단 명암처럼 보인다(곡면을 따라 폭이 자연스럽게 변함).

import type { P, Q } from './geom';
import { bbox, fx, movePts, smoothPath, mul } from './geom';

let counter = 0;
export function uid(prefix = 'k'): string {
  counter = (counter + 1) % 2147483647;
  return prefix + counter.toString(36);
}

export const path = (d: string, fill: string, extra = ''): string =>
  d ? `<path d="${d}" fill="${fill}"${extra ? ' ' + extra : ''}/>` : '';

export const strokeD = (d: string, color: string, w: number, extra = ''): string =>
  d ? `<path d="${d}" fill="none" stroke="${color}" stroke-width="${fx(w)}" stroke-linecap="round" stroke-linejoin="round"${extra ? ' ' + extra : ''}/>` : '';

export function clipDef(id: string, d: string): string {
  return `<clipPath id="${id}"><path d="${d}"/></clipPath>`;
}

export const clipped = (id: string, content: string): string => (content ? `<g clip-path="url(#${id})">${content}</g>` : '');

/** 큰 사각형 + 도형 구멍(evenodd) → 도형 '바깥' 칠하기 */
export function outsideD(pts: readonly Q[], pad = 400): string {
  const [x0, y0, x1, y1] = bbox(pts);
  const X0 = x0 - pad, Y0 = y0 - pad, X1 = x1 + pad, Y1 = y1 + pad;
  return `M${fx(X0)} ${fx(Y0)}H${fx(X1)}V${fx(Y1)}H${fx(X0)}Z` + smoothPath(pts);
}

export interface ShadeOpt {
  /** 빛 쪽 단위벡터(화면) */
  light: P;
  /** 그림자 초승달 폭 */
  shade: number;
  /** 깊은 그림자 폭(빛 반대쪽 가장자리, 선택) */
  deep?: number;
  /** 밝은 쪽 하이라이트 폭(선택) */
  hi?: number;
  /** 그림자 쪽 가장자리 림라이트 폭(선택) */
  rim?: number;
  /** 외곽선 굵기 (0 이면 없음) */
  line?: number;
}

export interface ToneSet { base: string; shade: string; deep?: string; light?: string; rim?: string; line?: string }

/**
 * 도형 하나를 셰이딩해서 그린다. extra 는 클립 안쪽에 추가로 그릴 것(주름, 무늬 등).
 * 반환: SVG 문자열
 */
export function shaded(pts: readonly Q[], t: ToneSet, o: ShadeOpt, extra = '', extraUnder = ''): string {
  if (pts.length < 3) return '';
  const d = smoothPath(pts);
  const id = uid('s');
  let s = '';
  if (o.line && t.line) s += `<path d="${d}" fill="none" stroke="${t.line}" stroke-width="${fx(o.line * 2)}" stroke-linejoin="round"/>`;
  s += `<path d="${d}" fill="${t.base}"/>`;
  let inner = extraUnder;
  if (o.hi && t.light) inner += `<path fill-rule="evenodd" fill="${t.light}" d="${outsideD(movePts(pts, mul(o.light, -o.hi)))}"/>`;
  inner += `<path fill-rule="evenodd" fill="${t.shade}" d="${outsideD(movePts(pts, mul(o.light, o.shade)))}"/>`;
  if (o.deep && t.deep) inner += `<path fill-rule="evenodd" fill="${t.deep}" d="${outsideD(movePts(pts, mul(o.light, o.deep)))}"/>`;
  if (o.rim && t.rim) inner += `<path fill-rule="evenodd" fill="${t.rim}" d="${outsideD(movePts(pts, mul(o.light, o.rim)))}"/>`;
  inner += extra;
  s += clipDef(id, d) + clipped(id, inner);
  return s;
}

/** 단순 채움 + 클립 안 내용 */
export function filledClip(d: string, fill: string, inner: string, line?: { color: string; w: number }): string {
  const id = uid('c');
  let s = '';
  if (line) s += `<path d="${d}" fill="none" stroke="${line.color}" stroke-width="${fx(line.w * 2)}" stroke-linejoin="round"/>`;
  s += `<path d="${d}" fill="${fill}"/>`;
  if (inner) s += clipDef(id, d) + clipped(id, inner);
  return s;
}

export const g = (content: string, attrs = ''): string => (content ? `<g${attrs ? ' ' + attrs : ''}>${content}</g>` : '');
export const tr = (x: number, y: number, rotDeg = 0, sx = 1, sy = 1): string =>
  `transform="translate(${fx(x)} ${fx(y)})${rotDeg ? ` rotate(${fx(rotDeg)})` : ''}${sx !== 1 || sy !== 1 ? ` scale(${fx(sx)} ${fx(sy)})` : ''}"`;
