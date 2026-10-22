// 뒤 화면 스크롤 잠금 — 시트 안에 시트처럼 겹쳐 열려도 꼬이지 않게 개수로 센다.
// (예전엔 각자 '열기 전 값'을 기억했다가 되돌려서, 둘이 같이 닫히면 잠금이 남아 다음 화면이 스크롤되지 않았다)
let count = 0;

/** 잠그고, 푸는 함수를 돌려준다(여러 번 불러도 한 번만 풂) */
export function lockScroll(): () => void {
  if (count++ === 0) document.documentElement.style.overflow = 'hidden';
  let released = false;
  return () => {
    if (released) return;
    released = true;
    count = Math.max(0, count - 1);
    if (count === 0) document.documentElement.style.overflow = '';
  };
}

/** 화면을 옮길 때 — 남은 잠금을 모두 푼다(옮긴 화면의 시트는 어차피 닫힌다) */
export function resetScrollLock() {
  count = 0;
  document.documentElement.style.overflow = '';
}
