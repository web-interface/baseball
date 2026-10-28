// 같은 아이디로 다른 기기에서 로그인해 이 기기 접속이 끊겼을 때 (어느 API 든 401 code 'replaced' · 채팅도 같은 판정) —
// 닫기 없이 [확인] 하나. 누르면 저장된 토큰만 지우고(게임 기록은 그대로 — 다시 로그인하면 이어서) 로그인 화면으로.
import { Button, Sheet } from '../ui';
import { useAuth } from './auth';
import { navigate } from './router';
import s from './App.module.css';

export function ReplacedSheet() {
  const { replaced, ackReplaced } = useAuth();
  return (
    <Sheet
      open={replaced}
      onClose={() => {}}
      dismissible={false}
      title="다른 기기에서 로그인했어요"
      footer={<Button block onClick={() => { ackReplaced(); navigate('/login', { replace: true }); }}>확인</Button>}
    >
      <p className={s.kick}>같은 아이디는 한 기기에서만 쓸 수 있어서 이 기기 접속을 끊었어요. 여기서 다시 로그인하면 이어서 할 수 있어요(그때는 다른 기기가 끊겨요).</p>
    </Sheet>
  );
}
