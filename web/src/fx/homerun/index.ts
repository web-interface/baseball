// 홈런 연출 — 공개 입구. 연결법은 README.md.
//
//   React   <HomerunFx info={info} length="short" onDone={next} />          (경기장 안에, 부모는 position: relative)
//   그냥 JS  const h = playHomerunFx(stageEl, info, { length: 'long', onDone }); … h.skip() / h.stop()
//   계획만   planHomerun(info, 'long', 'night')  → 제목 · 폭죽 목록 · 길이 (그리지 않음)
export { HomerunFx } from './HomerunFx';
export type { HomerunFxProps } from './HomerunFx';
export { playHomerunFx } from './player';
export { planHomerun, homerunDuration, leadOf, dirFromAngle, SHELL_KO } from './plan';
export type { FxPlan, Shell, ShellType, TitleLook, MainKind } from './plan';
export type { HomerunInfo, HomerunFxOptions, HomerunFxHandle, HrDir, HrLead, HrLength, HrTeam, HrTheme } from './types';
