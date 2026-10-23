// 처음 로그인 — 테마 고르기 (이 기기에서 한 번). 복구 코드 시트가 먼저면 그 뒤에. 나중엔 설정 › 테마에서 바꾼다.
import { useEffect, useState } from 'react';
import { Button, Sheet, ThemePicker } from '../ui';
import { useAuth } from './auth';

const KEY = 'bb.themePicked';
const picked = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return true; } };
const markPicked = () => { try { localStorage.setItem(KEY, '1'); } catch { /* 이번 방문만 */ } };

export function FirstTheme() {
  const { status, recoveryCode } = useAuth();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (status === 'in' && !recoveryCode && !picked()) setOpen(true);
  }, [status, recoveryCode]);
  const done = () => { markPicked(); setOpen(false); };
  return (
    <Sheet
      open={open}
      onClose={done}
      dismissible={false}
      title="화면 테마를 골라 주세요"
      sub="경기장 · 카드 · 기록 화면의 분위기예요. 나중에 설정 › 테마에서 언제든 바꿀 수 있어요"
      footer={<Button size="l" block onClick={done}>이 테마로 시작</Button>}
    >
      <ThemePicker />
    </Sheet>
  );
}
