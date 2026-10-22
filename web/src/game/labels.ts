// 화면에 쓰는 한국어 이름표 — 능력치·구종·포지션·투타
import type { AttrKey, BatSide, Hand, PitchType, Pos, WeatherKey } from './types';

export const POS_KO: Record<Pos, string> = {
  P: '투수', C: '포수', '1B': '1루수', '2B': '2루수', '3B': '3루수', SS: '유격수', LF: '좌익수', CF: '중견수', RF: '우익수', DH: '지명타자',
};

/** 수비 번호 (6-4-3 표기용) */
export const POS_NUM: Record<Pos, number | null> = {
  P: 1, C: 2, '1B': 3, '2B': 4, '3B': 5, SS: 6, LF: 7, CF: 8, RF: 9, DH: null,
};

export const ROLE_KO = { SP: '선발', RP: '불펜', CL: '마무리' } as const;

/** '우투좌타' */
export const handKo = (throws: Hand, bats: BatSide) =>
  `${throws === 'R' ? '우' : '좌'}투${bats === 'R' ? '우' : bats === 'L' ? '좌' : '양'}타`;

export const PITCH_KO: Record<PitchType, string> = {
  FF: '포심', SI: '투심', FC: '커터', SL: '슬라이더', SW: '스위퍼', CU: '커브', CH: '체인지업', FS: '포크', KN: '너클볼',
};

export const ATTR_KO: Record<AttrKey, string> = {
  contactR: '우투 상대 컨택', contactL: '좌투 상대 컨택', power: '파워', gap: '갭 파워', eye: '선구안', avoidK: '삼진 회피',
  vsFast: '강속구 대처', vsBreak: '변화구 대처', bunt: '번트',
  speed: '스피드', baserunning: '주루 판단', stealJump: '도루 스타트', sliding: '슬라이딩',
  range: '수비 범위', firstStep: '첫발 반응', hands: '포구', armStr: '송구 강도', armAcc: '송구 정확', turnDP: '병살 처리',
  block: '블로킹', framing: '프레이밍', popTime: '도루 저지', pitcherLead: '투수 리드',
  velocity: '구속', control: '제구력', deception: '디셉션', extension: '익스텐션', stamina: '스태미나', recovery: '회복력',
  pickoff: '견제', slideStep: '퀵모션', pFielding: '투수 수비',
  composure: '침착', concentration: '집중력', competitiveness: '승부욕', leadership: '리더십', teamwork: '팀워크', baseballIQ: '야구 지능',
  durability: '내구성', agility: '순발력', strength: '근력',
  pullTend: '타구 방향', launchTend: '발사각', swingTend: '적극성', gbTend: '땅볼 유도',
};

/** 상세 화면 묶음 */
export const ATTR_GROUPS: { id: string; ko: string; keys: AttrKey[] }[] = [
  { id: 'bat', ko: '타격', keys: ['contactR', 'contactL', 'power', 'gap', 'eye', 'avoidK', 'vsFast', 'vsBreak', 'bunt'] },
  { id: 'run', ko: '주루', keys: ['speed', 'baserunning', 'stealJump', 'sliding'] },
  { id: 'field', ko: '수비', keys: ['range', 'firstStep', 'hands', 'armStr', 'armAcc', 'turnDP'] },
  { id: 'catch', ko: '포수', keys: ['block', 'framing', 'popTime', 'pitcherLead'] },
  { id: 'pitch', ko: '투구', keys: ['velocity', 'control', 'deception', 'extension', 'stamina', 'recovery', 'pickoff', 'slideStep', 'pFielding'] },
  { id: 'mental', ko: '정신', keys: ['composure', 'concentration', 'competitiveness', 'leadership', 'teamwork', 'baseballIQ'] },
  { id: 'phys', ko: '신체', keys: ['durability', 'agility', 'strength'] },
];

export const WEATHER_KO: Record<WeatherKey, { ko: string; words: [string, string, string, string, string] }> = {
  rain: { ko: '비', words: ['빗속에 매우 약함', '비에 약함', '보통', '비에 강함', '우천 체질'] },
  cold: { ko: '추위', words: ['추위에 매우 약함', '추위에 약함', '보통', '추위에 강함', '한파 체질'] },
  heat: { ko: '더위', words: ['더위에 매우 약함', '더위에 약함', '보통', '더위에 강함', '한여름 체질'] },
  day: { ko: '낮 경기', words: ['낮 경기에 매우 약함', '낮 경기에 약함', '보통', '낮 경기에 강함', '낮 경기 체질'] },
};

/** FM 식 1~20 눈금 (상세 화면) */
export const toFm = (v: number) => Math.max(1, Math.min(20, Math.round(v / 5)));
