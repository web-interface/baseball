// 강화 — 보관함을 강화 단계순으로 열어 둔 입구. 카드를 누르면 같은 시트에서 강화·레벨·각성을 본다.
import { useMemo } from 'react';
import type { ScreenProps } from '../../app/screen';
import CardsScreen from './index';

export default function EnhanceScreen(props: ScreenProps) {
  const query = useMemo(() => new URLSearchParams({ sort: 'enh' }), []);
  return <CardsScreen {...props} query={query} />;
}
