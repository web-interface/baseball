// 강화 — 보관함을 강화 단계순으로 연 화면. 카드마다 '다음 단계까지 같은 카드 n장' 진행과 단계별 필요 수량 표.
// I~V 는 같은 카드가 모이면 자동, VI~X 는 카드를 눌러 '강화 도전'(선수 정보 강화 탭).
import { useMemo } from 'react';
import type { ScreenProps } from '../../app/screen';
import CardsScreen from './index';

export default function EnhanceScreen(props: ScreenProps) {
  const query = useMemo(() => { const q = new URLSearchParams(props.query); q.set('mode', 'enhance'); return q; }, [props.query]);
  return <CardsScreen {...props} query={query} />;
}
