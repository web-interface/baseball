// 예시 대화 — #/chat?demo=1 · #/home?chat=demo (미리보기·스크린샷용, 서버에 연결하지 않는다)
// 아이디는 지어낸 것. 보내기·지우기·신고는 이 화면 안에서만 흉내 낸다. 예시는 사라지지 않게 둔다.
import { ME } from '../../game/mock';
import type { ChatMsg, ChatSource, ChatState, ReqResult } from './types';

const ME_UID = 1;
const ago = (s: number) => Date.now() - s * 1000;

function sample(): ChatMsg[] {
  const rows: [number, number, string, string | null, string][] = [
    [272, 31, '곰스직관러', 'sb', '오늘 곰스 선발 누구예요? 라인업이 아직 안 떴네요'],
    [255, 44, '거인츠갈매기', 'bs', '어제 9회말 2사 만루 끝내기… 아직도 생각나요'],
    [251, 44, '거인츠갈매기', 'bs', '그 타석 승리 확률 80%였는데'],
    [214, ME_UID, ME.user, 'dj', '세트덱 ’27 독수리스 7명 모았어요. 두 장 남음'],
    [196, 52, '마법사즈', 'sw', '거의 다 왔네요. 왕조 효과 붙으면 타선이 확 달라져요'],
    [150, 0, '', 'dg', '사자왕 감독이 ’26 사자즈 왕조를 완성했어요'],
    [141, 63, '사자왕', 'dg', '드디어요 ㅋㅋ 3주 걸렸어요'],
    [118, 70, '상륙작전', 'ic', '레전드팩 천장 몇 번째에 떠요?'],
    [97, 81, '영웅즈팬', 'sh', '90번째요. 확률표는 영입 화면 맨 아래에 있어요'],
    [74, 70, '상륙작전', 'ic', '아 오늘 불펜 ** 털렸다'],
    [46, 92, '공룡스', 'cw', '대전 레이팅 1800 넘으니까 상대가 다 세네요'],
    [12, ME_UID, ME.user, 'dj', '오늘 7시 경기 같이 봐요'],
  ];
  return rows.map(([s, uid, name, club, text], i) => ({
    id: 900 + i, ts: ago(s), uid, name, club, text,
    ...(uid === 0 ? { kind: 'sys' as const, sys: { type: 'dynasty' as const, user: '사자왕', club: 'dg', set: '’26 사자즈' } } : {}),
  }));
}

let state: ChatState = {
  status: 'open', loaded: true, msgs: sample(), fading: [], pending: [], online: 23,
  me: { uid: ME_UID, name: ME.user, club: 'dj' }, meChecked: true, retryAt: null, notice: null, restore: null,
  ttl: 5 * 60_000, maxLen: 200, skew: 0,
};
const ls = new Set<() => void>();
const set = (p: Partial<ChatState>) => { state = { ...state, ...p }; ls.forEach((l) => l()); };
let nextId = 2000;
let lastAt = 0;

export const demoChat: ChatSource = {
  demo: true,
  subscribe(l) { ls.add(l); return () => { ls.delete(l); }; },
  get: () => state,
  retain: () => () => {},
  send(raw) {
    const text = raw.replace(/\s+/g, ' ').trim();
    if (!text) return '내용을 써 주세요';
    if ([...text].length > state.maxLen) return `${state.maxLen}자까지 쓸 수 있어요`;
    if (Date.now() - lastAt < 3000) return '3초에 한 번 보낼 수 있어요';
    lastAt = Date.now();
    set({ msgs: [...state.msgs, { id: nextId++, ts: Date.now(), uid: ME_UID, name: ME.user, club: 'dj', text }] });
    return null;
  },
  async request(kind, id): Promise<ReqResult> {
    if (kind === 'del') set({ msgs: state.msgs.filter((m) => m.id !== id) });
    return { ok: true };
  },
  reauth() {},
  reconnect() {},
};
