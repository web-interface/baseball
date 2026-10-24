// 가로로만 움직이는 줄(칩 · 탭 · 표)을 마우스 휠로 — 마우스에는 옆으로 미는 동작이 없어 hidden 스크롤바 줄이 안 움직이던 것.
// 세로 휠을 그 줄의 가로 스크롤로 돌리고, 줄 끝에 닿았거나 세로로도 스크롤되는 곳이면 원래대로(페이지 스크롤).
// 터치 · 트랙패드 가로 밀기 · Ctrl+휠(확대)은 건드리지 않는다. 앱이 뜰 때 한 번만(main.tsx).
const scrollsX = (cs: CSSStyleDeclaration) => cs.overflowX === 'auto' || cs.overflowX === 'scroll';
const scrollsY = (cs: CSSStyleDeclaration) => cs.overflowY === 'auto' || cs.overflowY === 'scroll';

function onWheel(e: WheelEvent) {
  if (e.ctrlKey || e.deltaY === 0 || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
  for (let el = e.target as HTMLElement | null; el && el !== document.body; el = el.parentElement) {
    if (el.scrollWidth <= el.clientWidth + 1) continue;
    const cs = getComputedStyle(el);
    if (!scrollsX(cs)) continue;
    if (scrollsY(cs) && el.scrollHeight > el.clientHeight + 1) return; // 세로로도 움직이는 곳은 그대로
    const max = el.scrollWidth - el.clientWidth;
    const next = Math.max(0, Math.min(max, el.scrollLeft + e.deltaY));
    if (next === el.scrollLeft) return; // 줄 끝 — 페이지가 스크롤되게
    el.scrollLeft = next;
    e.preventDefault();
    return;
  }
}

let on = false;
export function installWheelX() {
  if (on || typeof window === 'undefined') return;
  on = true;
  window.addEventListener('wheel', onWheel, { passive: false });
}
