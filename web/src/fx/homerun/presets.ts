// 미리보기(#/fx)용 홈런 예시 — 경기 화면은 쓰지 않는다. 구단·타자 이름은 미리보기에서 고른 구단으로 채운다.
import type { HomerunInfo } from './types';

export interface HrPreset {
  key: string;
  /** 목록 설명 한 줄 */
  desc: string;
  info: Omit<HomerunInfo, 'team' | 'batter' | 'id'>;
}

export const HR_PRESETS: HrPreset[] = [
  { key: 'solo', desc: '주자 없음 · 좌월 112m · 시즌 7호', info: { runners: 0, dir: 'left', distM: 112, seasonNo: 7, inning: 3, half: 'bot', outs: 1 } },
  { key: 'two', desc: '주자 1명 · 우월 121m', info: { runners: 1, dir: 'right', distM: 121, seasonNo: 14, inning: 5, half: 'bot', outs: 0 } },
  { key: 'three', desc: '주자 2명 · 중월 127m', info: { runners: 2, dir: 'center', distM: 127, seasonNo: 19, inning: 6, half: 'bot', outs: 2 } },
  { key: 'grandslam', desc: '만루 · 좌중월 131m · 세리머니', info: { runners: 3, angle: -18, distM: 131, seasonNo: 22, inning: 7, half: 'bot', outs: 1 } },
  { key: 'walkoff', desc: '9회말 2사 · 우중월 118m', info: { runners: 0, walkoff: true, angle: 20, distM: 118, seasonNo: 11, inning: 9, half: 'bot', outs: 2 } },
  { key: 'walkoff-slam', desc: '9회말 2사 만루 · 3점 뒤지다', info: { runners: 3, walkoff: true, lead: 'reverse', dir: 'left', distM: 124, seasonNo: 17, inning: 9, half: 'bot', outs: 2 } },
  { key: 'reverse', desc: '원정 7회초 · 2점 뒤지다가', info: { runners: 2, lead: 'reverse', dir: 'right', distM: 123, seasonNo: 8, inning: 7, half: 'top', outs: 1, home: false } },
  { key: 'tie', desc: '8회말 · 1점 뒤지다가', info: { runners: 0, lead: 'tie', dir: 'center', distM: 119, seasonNo: 5, inning: 8, half: 'bot', outs: 0 } },
  { key: 'goahead', desc: '6회말 · 동점에서', info: { runners: 1, lead: 'go-ahead', dir: 'left', distM: 116, seasonNo: 12, inning: 6, half: 'bot', outs: 2 } },
  { key: 'oop', desc: '구장 밖으로 · 중월', info: { runners: 0, outOfPark: true, dir: 'center', distM: 145, seasonNo: 26, inning: 4, half: 'bot', outs: 1 } },
  { key: 'b2b', desc: '2타자 연속 · 우월', info: { runners: 0, streak: 2, dir: 'right', distM: 114, seasonNo: 3, inning: 2, half: 'bot', outs: 0 } },
  { key: 'b2b2b', desc: '3타자 연속 · 좌월', info: { runners: 0, streak: 3, dir: 'left', distM: 120, seasonNo: 6, inning: 2, half: 'bot', outs: 0 } },
  { key: 'leadoff', desc: '1회말 경기 첫 타자', info: { runners: 0, leadoff: 'game', dir: 'right', distM: 109, seasonNo: 2, inning: 1, half: 'bot', outs: 0 } },
  { key: 'pinch', desc: '8회말 대타 · 주자 2명', info: { runners: 2, pinch: true, dir: 'left', distM: 117, seasonNo: 1, inning: 8, half: 'bot', outs: 2 } },
  { key: 'milestone', desc: '이정표 · 중월 126m', info: { runners: 0, seasonNo: 30, dir: 'center', distM: 126, inning: 5, half: 'bot', outs: 1 } },
  { key: 'away-solo', desc: '원정 · 남의 홈런 (바닥 불꽃 없이)', info: { runners: 0, home: false, mine: false, dir: 'right', distM: 113, seasonNo: 9, inning: 4, half: 'top', outs: 2 } },
  { key: 'combo', desc: '대타 · 장외 · 백투백이 한꺼번에', info: { runners: 1, pinch: true, outOfPark: true, streak: 2, dir: 'right', distM: 141, seasonNo: 4, inning: 8, half: 'bot', outs: 1 } },
];
