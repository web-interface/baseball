// 두 기기에서 따로 진행했을 때 — 어느 기록으로 이어 할지 고르기 (app/sync). 고르지 않은 쪽 기록은 사라진다.
// 다른 기기 쪽: 서버 기록을 받아 새로고침 · 이 기기 쪽: 이 기기 기록을 서버에 올린다(다른 기기는 다음에 열 때 이 기록을 받는다).
// 받아서 새로고침한 뒤에는 화면이 열릴 때 한 번 알려 준다.
import { useEffect, useState } from 'react';
import { Button, Sheet, useToast } from '../ui';
import { ClubEmblem } from '../art/emblems';
import { isTeamId, teamById } from '../game/mock';
import { int } from '../ui/format';
import { LEVEL_KO, agoText, resolveConflict, takeSyncNote, useSync, type SyncSide } from './sync';
import s from './SyncChoice.module.css';

export function SyncChoice() {
  const v = useSync();
  const toast = useToast();
  const [busy, setBusy] = useState<'remote' | 'local' | null>(null);

  // 새로고침 뒤 한 번 — '다른 기기에서 이어 한 기록을 불러왔어요'
  useEffect(() => {
    if (!v.gate) return;
    const n = takeSyncNote();
    if (n) toast({ text: n, tone: 'good' });
  }, [v.gate, toast]);

  const c = v.conflict;
  const pick = async (side: 'remote' | 'local') => {
    setBusy(side);
    const r = await resolveConflict(side);
    setBusy(null);
    if (side === 'local' && r === 'saved') toast({ text: '이 기기 기록으로 이어 해요', tone: 'good' });
    else if (side === 'local' && (r === 'offline' || r === 'error')) toast({ text: '서버에 저장하지 못해 이 기기 기록으로 계속해요 — 닿으면 저장해요', tone: 'info' });
    else if (side === 'remote' && r !== 'pulled' && r !== 'conflict' && r !== 'off') toast({ text: '다른 기기 기록을 받지 못했어요. 잠시 뒤 다시 눌러 주세요', tone: 'bad' });
  };
  const now = Date.now();
  return (
    <Sheet
      open={v.phase === 'conflict' && !!c}
      onClose={() => {}}
      dismissible={false}
      title="어느 기록으로 이어 할까요?"
      sub="두 기기에서 따로 진행했어요. 고르지 않은 쪽 기록은 지워져요"
    >
      {c && (
        <div className={s.pair}>
          <Side kicker="다른 기기 기록" side={c.remote} now={now} busy={busy === 'remote'} disabled={!!busy} onPick={() => void pick('remote')} />
          <Side kicker="이 기기 기록" side={c.local} now={now} busy={busy === 'local'} disabled={!!busy} onPick={() => void pick('local')} />
        </div>
      )}
    </Sheet>
  );
}

function Side({ kicker, side, now, busy, disabled, onPick }: { kicker: string; side: SyncSide; now: number; busy: boolean; disabled: boolean; onPick: () => void }) {
  const sum = side.sum;
  const team = sum?.club && isTeamId(sum.club) ? teamById(sum.club) : null;
  const progress = !sum || sum.year == null ? '—'
    : sum.post ? '포스트시즌'
      : sum.day >= sum.days ? '정규 시즌 끝'
        : sum.day === 0 ? '개막 전'
          : <><span className="num">{sum.day}</span>/<span className="num">{sum.days}</span>일</>;
  return (
    <section className={s.side} aria-label={kicker}>
      <p className={s.kicker}>{kicker}</p>
      <div className={s.club}>
        {team ? <ClubEmblem team={team} size={34} decorative /> : <span className={s.noClub} aria-hidden />}
        <b>{team?.name ?? sum?.team ?? '구단 없음'}</b>
      </div>
      <dl className={s.rows}>
        <div><dt>시즌</dt><dd>{sum?.year != null ? <span className="num">{sum.year}</span> : '—'}</dd></div>
        <div><dt>진행</dt><dd>{progress}</dd></div>
        <div><dt>카드</dt><dd>{sum ? <><span className="num">{int(sum.cards)}</span>장</> : '—'}</dd></div>
        <div><dt>리그</dt><dd>{sum?.level ? LEVEL_KO[sum.level] ?? sum.level : '—'}</dd></div>
        <div><dt>마지막 저장</dt><dd>{side.at ? agoText(side.at, now) : '저장 전'}</dd></div>
      </dl>
      <Button block variant="secondary" className={s.pick} loading={busy} disabled={disabled} onClick={onPick}>이 기록으로 이어 하기</Button>
    </section>
  );
}
