// node 시험용 localStorage · sessionStorage 흉내 (브라우저 저장소와 같은 모양)
class MemStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
const g = globalThis as unknown as Record<string, unknown>;
g.localStorage = new MemStorage();
g.sessionStorage = new MemStorage();
// Object.keys(localStorage) 를 쓰는 곳이 있어 키를 열거할 수 있게
g.localStorage = new Proxy(g.localStorage as MemStorage, {
  ownKeys: (t) => { const ks: string[] = []; for (let i = 0; i < t.length; i++) ks.push(t.key(i)!); return ks; },
  getOwnPropertyDescriptor: (t, k) => (typeof k === 'string' && t.getItem(k) != null ? { enumerable: true, configurable: true, value: t.getItem(k) } : undefined),
  get: (t, k) => { const v = (t as unknown as Record<string | symbol, unknown>)[k]; return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(t) : v; },
  set: (t, k, v) => { (t as unknown as Record<string | symbol, unknown>)[k] = v; return true; },
});
export {};
