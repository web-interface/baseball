// 선수 화면 주소 — 다른 구단 선수(대전 상대 · 다른 감독 · AI 구단)는 '보기 전용'(?view=other).
// 내가 같은 카드를 갖고 있으면 예전엔 내 카드로 열려서 상대 카드를 강화 · 장비 · 잠재력으로 고칠 수 있었다(사용자 지시 10-28 "대전 · 순위에서 상대 카드 수정 — 안 돼야 해").
export const playerHref = (id: string, o: { card?: string; other?: boolean } = {}) => {
  const q = [o.card ? `card=${encodeURIComponent(o.card)}` : '', o.other ? 'view=other' : ''].filter(Boolean).join('&');
  return `/player/${encodeURIComponent(id)}${q ? `?${q}` : ''}`;
};
