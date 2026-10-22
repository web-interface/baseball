// 로비 채팅 — 서버(worker/src/chat.ts)와 주고받는 모양 + 화면 상태

/** 시스템 메시지 (지금은 형식만) — 예: '○○ 감독이 ’27 독수리스 왕조를 완성했어요' */
export type SysEvent =
  | { type: 'dynasty'; user: string; club: string | null; set: string }
  | { type: 'notice'; text: string };

export interface ChatMsg {
  id: number;
  /** 서버 시각 (ms) */
  ts: number;
  /** 0 = 시스템 */
  uid: number;
  name: string;
  /** 구단 코드 'dj' … (없으면 null) */
  club: string | null;
  text: string;
  kind?: 'sys';
  sys?: SysEvent;
}

export interface ChatMe { uid: number; name: string; club: string | null }

/** 서버 → 화면 */
export type ServerEvent =
  | { t: 'init'; msgs: ChatMsg[]; online: number; now?: number; ttl?: number; maxLen?: number }
  | { t: 'me'; me: ChatMe | null; expired?: boolean }
  | { t: 'msg'; m: ChatMsg; cid?: string }
  | { t: 'del'; id: number }
  | { t: 'online'; n: number }
  | { t: 'ok'; rid?: string; what?: string }
  | { t: 'err'; code: string; text: string; cid?: string; rid?: string; wait?: number };

/** idle 쉬는 중 · connecting 연결 중 · open 연결됨 · retry 다시 연결 기다림 · offline 인터넷 없음 · paused 탭이 숨어서 끊음 */
export type ConnStatus = 'idle' | 'connecting' | 'open' | 'retry' | 'offline' | 'paused';

export interface Pending { cid: string; text: string; ts: number }

export interface ChatState {
  status: ConnStatus;
  /** 최근 메시지를 한 번이라도 받았나 */
  loaded: boolean;
  msgs: ChatMsg[];
  /** 곧 사라질(흐려지는) 메시지 id */
  fading: number[];
  pending: Pending[];
  online: number | null;
  /** 서버가 확인한 나 (로그인 안 했으면 null) */
  me: ChatMe | null;
  /** 서버가 로그인 확인을 끝냈나 */
  meChecked: boolean;
  retryAt: number | null;
  /** 보내기 실패 같은 짧은 알림 */
  notice: { text: string; at: number } | null;
  /** 못 보낸 글 — 입력칸이 비어 있으면 되살린다 */
  restore: { text: string; at: number } | null;
  /** 대화 보관 시간 (서버가 알려 줌, 5분) */
  ttl: number;
  maxLen: number;
  /** 서버 시각 - 내 시각 */
  skew: number;
}

export type ReqResult = { ok: true } | { ok: false; text: string };

/** 실제 연결과 예시(?demo=1)가 같은 모양을 쓴다 */
export interface ChatSource {
  /** 예시(서버 연결 없음) */
  readonly demo?: boolean;
  subscribe(l: () => void): () => void;
  get(): ChatState;
  /** 화면이 보이는 동안 연결을 붙잡는다 — 돌려받은 함수로 놓는다 */
  retain(): () => void;
  /** 보내기 — 막히면 그 이유(문장), 보냈으면 null */
  send(text: string): string | null;
  request(kind: 'report' | 'del', id: number): Promise<ReqResult>;
  /** 로그인·로그아웃 뒤 다시 확인 */
  reauth(): void;
  /** 지금 바로 다시 연결 */
  reconnect(): void;
}

export const FADE_MS = 6000;
