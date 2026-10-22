// 재생기 — requestAnimationFrame 으로 시간을 흘려 박자를 넘긴다.
// 강조 문구(callout)·이닝 요약(halfsum) 박자에서는 멈춰 기다린다(문구가 끝나거나 '다음 이닝'을 누를 때까지).
// 화면은 useSyncExternalStore 로 필요한 값만 구독한다 — 경기장은 매 프레임, 나머지는 박자가 바뀔 때만.
import { useSyncExternalStore } from 'react';
import type { Beat } from './timeline';

export interface Snap {
  /** 전체 시간 (ms) */
  t: number;
  /** 지금 박자 */
  idx: number;
  /** 박자 안 시간 (ms) */
  local: number;
  playing: boolean;
  speed: number;
  blocked: null | 'callout' | 'halfsum';
  ended: boolean;
}

const isBlock = (b: Beat | undefined) => !!b && (b.k === 'callout' || b.k === 'halfsum');

export class Player {
  beats: Beat[];
  starts: number[] = [];
  total = 0;
  private t = 0;
  private speed = 1;
  private playing = false;
  private blocked: Snap['blocked'] = null;
  private raf = 0;
  private last = 0;
  private listeners = new Set<() => void>();
  private snap: Snap;
  /** 막는 박자에 들어설 때 */
  onBlock?: (beat: Beat, idx: number) => void;

  constructor(beats: Beat[]) {
    this.beats = beats;
    this.reindex();
    this.snap = this.make();
  }

  private reindex() {
    let acc = 0;
    this.starts = this.beats.map((b) => { const s = acc; acc += b.dur; return s; });
    this.total = acc;
  }

  private indexAt(t: number) {
    let lo = 0, hi = this.beats.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid] <= t) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  private make(): Snap {
    const idx = this.indexAt(this.t);
    const last = this.beats.length - 1;
    return {
      t: this.t, idx, local: Math.max(0, this.t - this.starts[idx]), playing: this.playing, speed: this.speed,
      blocked: this.blocked, ended: idx === last && this.beats[last]?.k === 'end' && this.t >= this.starts[last],
    };
  }

  private emit() {
    this.snap = this.make();
    this.listeners.forEach((l) => l());
  }

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getSnap = () => this.snap;

  private block(idx: number) {
    this.blocked = this.beats[idx].k as 'callout' | 'halfsum';
    this.t = this.starts[idx];
    this.emit();
    this.onBlock?.(this.beats[idx], idx);
  }

  private loop = (now: number) => {
    const dt = Math.min(80, now - this.last);
    this.last = now;
    if (!this.blocked) {
      const from = this.indexAt(this.t);
      if (isBlock(this.beats[from]) && this.t <= this.starts[from] + 0.5) {
        this.block(from);
      } else {
        const t2 = Math.min(this.total, this.t + dt * this.speed);
        const to = this.indexAt(t2);
        let hit = -1;
        for (let k = from + 1; k <= to; k++) if (isBlock(this.beats[k])) { hit = k; break; }
        if (hit >= 0) this.block(hit);
        else {
          this.t = t2;
          if (this.t >= this.total) this.playing = false;
          this.emit();
        }
      }
    }
    if (this.playing) this.raf = requestAnimationFrame(this.loop);
  };

  play() {
    if (this.playing) return;
    if (this.t >= this.total) this.seekBeat(0);
    this.playing = true;
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.loop);
    this.emit();
  }

  pause() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.emit();
  }

  toggle() { if (this.playing) this.pause(); else this.play(); }

  /** 막힌 박자를 넘김 (강조 문구 끝 · 다음 이닝) */
  release(resume = false) {
    if (!this.blocked) return;
    const idx = this.indexAt(this.t);
    this.blocked = null;
    this.t = Math.min(this.total, this.starts[idx] + this.beats[idx].dur);
    if (resume && !this.playing) this.play();
    else this.emit();
  }

  seekBeat(idx: number, local = 0) {
    const i = Math.max(0, Math.min(this.beats.length - 1, idx));
    this.blocked = null;
    this.t = Math.min(this.total, this.starts[i] + local);
    this.emit();
  }

  /** 지금 박자를 건너뜀 */
  skipBeat() { this.seekBeat(this.indexAt(this.t) + 1); }

  setSpeed(s: number) { this.speed = s; this.emit(); }

  /** 박자 줄을 바꿈 (보기 방식 전환) */
  swap(beats: Beat[], startIdx: number) {
    this.beats = beats;
    this.reindex();
    this.seekBeat(startIdx);
  }

  dispose() { cancelAnimationFrame(this.raf); this.listeners.clear(); }
}

/** 매 프레임 (경기장) */
export function useSnap(p: Player): Snap {
  return useSyncExternalStore(p.subscribe, p.getSnap, p.getSnap);
}

/** 고른 값이 바뀔 때만 다시 그림 (박자 번호 · 재생 여부 등 — 원시값만) */
export function useSnapValue<T extends string | number | boolean | null>(p: Player, pick: (s: Snap) => T): T {
  const get = () => pick(p.getSnap());
  return useSyncExternalStore(p.subscribe, get, get);
}
