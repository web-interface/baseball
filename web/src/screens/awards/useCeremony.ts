// 이번 시즌 시상식 — 우승팀이 정해졌을 때만. 열리면 이 기기에 남긴다(season/awards saveCeremony).
import { useEffect, useMemo } from 'react';
import { useSeason } from '../../season/store';
import { ceremonyOf, saveCeremony, type Ceremony } from '../../season/awards';

export function useCeremony(): Ceremony | null {
  const st = useSeason();
  const c = useMemo(() => {
    try { return ceremonyOf(st); } catch (e) { console.warn('[시상식] 계산 실패', e); return null; }
  }, [st]);
  useEffect(() => { if (c) saveCeremony(c); }, [c]);
  return c;
}
