// 선수 그림 — 모든 화면은 선수 얼굴·몸을 이 부품으로만 그린다.
//   <PlayerArt player={p} variant="portrait" />   portrait 상반신(카드 초상) · full 전신(서 있기) · mini 얼굴만
//
// 그림은 캐릭터 팀 생성기(src/art/character/)가 만든다:
//   makeAppearance(spec) → makeKit(spec, ap, team, set) → renderPortrait / figureSvg
// 생성기가 오류를 내면 임시 초상(interim.ts)으로 대신 그려 화면이 깨지지 않게 한다.
// 연결 방식이 바뀌면 이 파일의 renderCharacter 만 고친다 (화면 코드는 그대로).
//
// 성능: 초상 SVG 는 한 장에 수백 KB 라서 DOM 에 바로 넣지 않고
//   ① 화면에 보일 때만(IntersectionObserver) ② 한가할 때 조금씩 만들어 ③ blob URL 그림(<img>)으로 쓴다 — 같은 그림은 재사용.
import { memo, useEffect, useRef, useState } from 'react';
import type { Player, Team } from '../game/types';
import { teamById } from '../game/mock';
import { figureSvg, makeAppearance, makeKit, renderPortrait, standingPose } from './character';
import type { PlayerSpec, TeamColors } from './character';
import { interimPortrait } from './interim';
import s from './PlayerArt.module.css';

export type ArtVariant = 'portrait' | 'full' | 'mini';
/** 자세 — 지금은 서 있기만. 투구·타격 자세는 캐릭터 팀이 늘린다 */
export type ArtPose = 'idle' | 'batting' | 'pitching' | 'fielding' | 'celebrate';

export interface PlayerArtProps {
  player: Player;
  variant?: ArtVariant;
  pose?: ArtPose;
  /** 기본: 선수 소속 구단 */
  team?: Team;
  /** 유니폼 — 홈(흰색)·원정 */
  set?: 'home' | 'away';
  /** 초상 배경 — none(투명, 기본) · team(구단색 + 등번호) */
  background?: 'none' | 'team';
  /** 화면 밖이어도 바로 그림 (뽑기 연출처럼 곧 보일 때) */
  eager?: boolean;
  className?: string;
  /** 접근성 이름 (기본: 선수 이름) */
  title?: string;
}

export const toSpec = (p: Player): PlayerSpec => ({
  id: p.look, heightCm: p.heightCm, weightKg: p.weightKg, throws: p.throws, bats: p.bats,
  pos: p.pos, origin: p.origin, age: p.age, number: p.number,
});

export const toTeamColors = (t: Team): TeamColors => ({
  id: t.id, name: t.wordmark, cap: t.cap,
  primary: t.colors.primary, secondary: t.colors.secondary, accent: t.colors.accent,
  awayBase: t.uniform?.awayBase ?? 'primary', pinstripe: t.uniform?.pinstripe,
});

/** 얼굴만 — 초상 viewBox 를 머리 쪽으로 좁힌다 */
function cropHead(svg: string) {
  return svg.replace(/viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/, (_m, x, y, w) => {
    const W = Number(w);
    const nx = Number(x) + W * 0.16, ny = Number(y) + W * 0.02, nw = W * 0.68;
    return `viewBox="${nx.toFixed(2)} ${ny.toFixed(2)} ${nw.toFixed(2)} ${nw.toFixed(2)}"`;
  });
}

/** SVG 문자열 만들기 (생성기 → 실패하면 임시 초상) */
export function renderCharacter(p: Player, team: Team, variant: ArtVariant, set: 'home' | 'away', bg: 'none' | 'team') {
  try {
    const spec = toSpec(p);
    const ap = makeAppearance(spec);
    const kit = makeKit(spec, ap, toTeamColors(team), set);
    if (variant === 'full') return figureSvg(ap, kit, standingPose(ap));
    let svg = renderPortrait(ap, kit, { background: bg });
    // 초상은 아래(어깨)를 붙인다
    svg = svg.replace('<svg ', `<svg preserveAspectRatio="${variant === 'mini' ? 'xMidYMid' : 'xMidYMax'} meet" `);
    return variant === 'mini' ? cropHead(svg) : svg;
  } catch (e) {
    console.warn('[PlayerArt] 캐릭터 생성기 오류 — 임시 초상으로', p.id, e);
    return interimPortrait(p, team, variant, set);
  }
}

/* ── 그림 URL 저장소 (같은 선수·구단·모양이면 한 번만 만든다) ── */
const urls = new Map<string, string>();
const keyOf = (p: Player, t: Team, v: ArtVariant, set: string, bg: string) => `${p.look}|${t.id}|${v}|${set}|${bg}`;
function urlFor(p: Player, t: Team, v: ArtVariant, set: 'home' | 'away', bg: 'none' | 'team') {
  const k = keyOf(p, t, v, set, bg);
  let u = urls.get(k);
  if (!u) {
    u = URL.createObjectURL(new Blob([renderCharacter(p, t, v, set, bg)], { type: 'image/svg+xml' }));
    urls.set(k, u);
    if (urls.size > 360) { // 오래된 것 정리
      const [oldK, oldU] = urls.entries().next().value as [string, string];
      urls.delete(oldK);
      setTimeout(() => URL.revokeObjectURL(oldU), 4000);
    }
  }
  return u;
}

/* ── 한가할 때 조금씩 (한 프레임에 8ms 까지) ── */
const queue: (() => void)[] = [];
let pumping = false;
function pump() {
  pumping = true;
  const t0 = performance.now();
  while (queue.length && performance.now() - t0 < 8) queue.shift()!();
  if (queue.length) setTimeout(pump, 0);
  else pumping = false;
}
function schedule(job: () => void) {
  queue.push(job);
  if (!pumping) setTimeout(pump, 0);
}

function PlayerArtImpl({ player, variant = 'portrait', team, set = 'home', background = 'none', eager, className, title }: PlayerArtProps) {
  const t = team ?? teamById(player.teamId);
  const key = keyOf(player, t, variant, set, background);
  const [src, setSrc] = useState<string | null>(() => urls.get(key) ?? null);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const ready = urls.get(key);
    if (ready) { setSrc(ready); return; }
    setSrc(null);
    let alive = true;
    const run = () => schedule(() => { if (alive) setSrc(urlFor(player, t, variant, set, background)); });
    const el = ref.current;
    if (eager || !el || typeof IntersectionObserver === 'undefined') { run(); return () => { alive = false; }; }
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) { io.disconnect(); run(); }
    }, { rootMargin: '240px' });
    io.observe(el);
    return () => { alive = false; io.disconnect(); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span ref={ref} className={[s.art, s[variant], className].filter(Boolean).join(' ')} role="img" aria-label={title ?? player.name}>
      {src ? <img src={src} alt="" draggable={false} decoding="async" className={s.img} /> : <span className={s.ghost} aria-hidden />}
    </span>
  );
}

export const PlayerArt = memo(PlayerArtImpl);
export default PlayerArt;
