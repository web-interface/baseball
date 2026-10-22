// 화면 컴포넌트가 받는 것 — src/screens/<이름>/index.tsx 의 export default 가 이 props 를 받는다.
export interface ScreenProps {
  /** 경로 변수 — '/player/:id' 면 { id: 'p03' } */
  params: Record<string, string>;
  /** 해시 뒤 쿼리 — '#/match?mode=quick' 면 query.get('mode') */
  query: URLSearchParams;
}
