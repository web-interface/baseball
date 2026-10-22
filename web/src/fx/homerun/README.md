# 홈런 연출 (`src/fx/homerun`)

홈런이 나오면 경기장 위에 덮어서 **폭죽 · 큰 글자 · 빛 · 살짝 흔들림**을 보여 주고, 만루 홈런은 끝에 **세리머니**(약 3초)까지.
홈런 정보(주자 수 · 끝내기 · 역전/동점 · 비거리 · 방향 · 장외 · 연속 · 선두타자 · 대타 · 시즌 n호 · 구단색 …)로 연출이 정해진다.
**같은 정보 → 언제나 같은 연출**(시드 고정), 정보가 하나라도 다르면 모양 · 색 · 자리 · 박자가 바뀐다.

미리보기: `#/fx` (미리보기 목록에 있음, 메뉴엔 없음) — 17가지 홈런을 눌러 재생, 테마 · 구단 · 길이 바꾸기.

## 1. 연결 — 세 줄

```tsx
import { HomerunFx, homerunDuration, leadOf, type HomerunInfo } from '../../fx/homerun';

// ① 경기장(position: relative — Stage 의 .stage) 안에 한 줄. 끝나면(건너뛰기 포함) onDone 한 번.
{hr && <HomerunFx info={hr} length={mode === 'quick' ? 'short' : 'long'} onDone={() => { setHr(null); player.release(); }} />}

// ② React 밖이면: const h = playHomerunFx(stageEl, info, { length: 'long', onDone }); … h.skip() · h.stop()(화면 떠날 때)
// ③ 박자 짤 때 길이(ms, 세리머니 포함): homerunDuration(info, 'short')  → 800~1200 · 'long' → 2100~3800 (+만루 2980)
```

- 부모 요소에 **`position: relative`** 가 있어야 한다(없으면 잠시 relative 로 바꿨다가 되돌림). 판은 `position:absolute; inset:0; z-index:6`.
- 흔들림은 부모 요소의 CSS `translate` 속성으로만 준다(`transform` 은 안 건드림) — 끝나면 원래 값으로 되돌린다. `shake={false}` 로 끔.
- 화면을 누르면(0.45초 뒤부터) · `Esc` · 오른쪽 아래 '건너뛰기' → 바로 끝(`onDone`). `skippable={false}` 면 누름이 경기장으로 지나간다.
- 같은 `info` 로 다시 그려도 재시작하지 않는다. info 내용이 바뀌면 새로 재생.

## 2. 입력 정보 `HomerunInfo`

| 필드 | 뜻 | 경기 화면에서 (예: `timeline.ts` 의 `PLAYS[i]` · `STATES`) |
|---|---|---|
| `runners` **(필수)** | 홈런 전 주자 수 0~3 → 솔로·투런·스리런·만루 | `p.basesBefore.filter(Boolean).length` |
| `walkoff` | 끝내기 | 9회 이후 말 공격에서 이 홈런으로 경기가 끝나면 |
| `lead` | `'reverse'` 역전 · `'tie'` 동점 · `'go-ahead'` 앞서감 | `leadOf(타격팀 점수, 수비팀 점수, 이번 득점)` — 홈런 **전** 점수 |
| `distM` | 비거리 m | `p.hit.distM` |
| `dir` / `angle` | 좌·중·우 / 엔진 각도(−45 3루 선 ~ +45 1루 선) | `angle: p.hit.angle` (있으면 dir 대신) |
| `outOfPark` | 장외 | 엔진이 장외를 알려 주면 그 값 (임시: 비거리 ≥ 담장 + 25m) |
| `streak` | 연속 타자 홈런 몇 번째 (2 = 백투백, 3 = 백투백투백) | 직전 타자도 홈런이면 +1 |
| `leadoff` | 선두타자 `true` · 경기 첫 타자 `'game'` | 반 이닝 첫 타석 |
| `pinch` | 대타 | 교체 사건(`pre` 의 대타) |
| `seasonNo` · `milestone` | 시즌 n호 (10·20·30… 이면 이정표) · `'통산 100호'` 같은 글 | 시즌 기록 |
| `batter` | 타자 이름 | `playerById(p.batterId)?.name` |
| `team` | 타자 구단색 — `teamById(id).colors` 그대로 | 공격 팀 |
| `home` | 홈 팀 홈런인가 (기본 true) — 원정은 바닥 불꽃(분수·마인) 없이 조금 작게 | `p.half === 'bot'` |
| `mine` | 내 구단 홈런인가 (기본 true) — classic 은 내 구단 별색만, 남의 홈런은 먹 | `teamId === ME.teamId` |
| `inning` · `half` · `outs` | 작은 줄 '9회말 · 2사 만루' | `p.inning` · `p.half` · `p.outsBefore` |
| `id` | 시드에 들어감 (같은 홈런을 다시 보여 줄 땐 같게) | `p.id` |

```ts
function hrInfo(i: number): HomerunInfo {
  const p = PLAYS[i];
  const before = STATES.before[i].score;                 // [원정, 홈] — 홈런 전
  const bat = p.half === 'top' ? 0 : 1;
  const runs = p.score[bat] - before[bat];
  const teamId = bat === 0 ? GAME.match.awayId : GAME.match.homeId;
  return {
    id: p.id,
    runners: p.basesBefore.filter(Boolean).length as 0 | 1 | 2 | 3,
    walkoff: p.half === 'bot' && p.inning >= 9 && i === PLAYS.length - 1,
    lead: leadOf(before[bat], before[1 - bat], runs),
    distM: p.hit?.distM, angle: p.hit?.angle,
    batter: playerById(p.batterId)?.name, team: teamById(teamId).colors,
    home: bat === 1, mine: teamId === ME.teamId,
    inning: p.inning, half: p.half, outs: p.outsBefore,
  };
}
```

## 3. 언제 · 얼마나

- **띄우는 때**: 공이 담장을 넘는 순간(대본 `landing.kind === 'hr'` 의 `t`) 또는 그 플레이의 `bip` 박자가 끝날 때. 재생기를 `callout` 처럼 멈춰 두고 `onDone` 에서 `release()`.
- **강조 문구와 겹치지 않게**: 홈런이 강조 장면이면 `CalloutStage` 대신 이것을 띄운다(이 판에 제목 · 타자 · 이닝이 다 들어 있음). 한 경기 강조 횟수(3~4번)에 같이 센다.
- **길이** `length`
  - `'short'` 빨리 보기(10초 예산) — 0.8~1.2초, 대표 불꽃 1~4발을 몰아서, 세리머니 없음.
  - `'long'` 주요 장면 · 이닝별 · 자세히 — 2.1~3.8초 (+ 만루 세리머니 약 3초, `ceremony={false}` 로 뺄 수 있음).
  - 정확한 값은 `homerunDuration(info, length)` (= `playHomerunFx(...).duration`).

## 4. 홈런마다 무엇이 다른가

| 종류 | 큰 글자 · 움직임 | 폭죽 (구단색 + 금/은) | 화면 |
|---|---|---|---|
| 솔로 | '솔로 홈런' — 지우개처럼 열리고 구단색 선 | 5가지 중 하나: 링+국화 · 꽃술+점멸 · 야자+모란 · 이중 링+국화 · 십자 분열+버드나무 | 약한 빛 |
| 투런 · 스리런 | '투런!' '스리런!' — 구단색 판 위에 꽂힘 | 투런: 좌우 '쾅쾅' 두 발 → 버드나무 · 스리런: 세 발 쓸기 → 토성/꽃술 | 빛 · 흔들림 2~3px |
| 그랜드슬램 | 'GRAND SLAM' + 한 글자씩 떨어짐 + '4 타점' | 1·2·3·4 한 발씩 점점 크게 → 금빛 왕관 + 담장 마인 | 위아래 검은 띠 · 강한 빛 · 5px · **세리머니** |
| 끝내기 | 화면 폭 구단색 띠 '끝내기 홈런' + 빛이 스침 | 축포(번쩍) → 바닥 분수 4줄 → 6연발 → 버드나무 천막 둘 + 이중 링 → 마지막 축포 | 검은 띠 · 가장 강함 6px |
| 역전 | '역전'이 뒤집혀 들어오고 뒤 글자가 밀려옴 | 상대 쪽 은빛 점멸이 꺼지고 → 양쪽에서 엇갈린 혜성(X) → 토성 | 4.5px |
| 동점 | '동점 = 솔로' 양쪽에서 와서 '=' 로 맞물림 | 좌우 거울 쌍둥이(같은 순간·같은 모양) → 가운데 꽃술 | 3px |
| 앞서가는 | 아래에서 솟는 글자 + 비스듬한 선 | 계단처럼 점점 높고 크게 세 발 | 3px |
| 장외 | '장외' + 거리 숫자가 0→145 차오름 + 줄자 눈금 | 홈에서 하늘 끝 밖으로 나가는 은빛 혜성 → 아주 높은 큰 국화/야자 | 3px |
| 백투백(투백) | 앞 홈런 윤곽이 남고 그 위에 다시 찍힘 | 같은 불꽃이 자리를 바꿔 2~3번 (메아리) | 겹마다 흔들림 |
| 선두타자 | 오른쪽에서 밀려오는 한 줄(중계 자막) | 축포 → 은빛 링 → 꽃술 | |
| 대타 | 교체 판 '대타'가 뒤집힌 뒤 글자 | 십자 분열(깜짝) → 점멸 | |
| 시즌 n호 · 이정표 | 큰 숫자를 금빛 고리가 한 바퀴 | 같은 중심 금빛 고리 2~4겹 → 금빛 왕관 | |

- 꼬리표가 겹치면(예: 대타 + 장외 + 백투백) 가장 센 것이 제목, 나머지는 작은 줄과 곁들임 불꽃(장외 혜성 · 메아리 · 십자 분열 · 금빛 고리)으로.
- 방향(좌/중/우) → 공이 넘어간 쪽 하늘에서 터짐 · 비거리 → 높이와 크기 · 원정 → 바닥 불꽃 없이 낮게 · 모란/국화/꽃술/토성은 반쯤 끝 색이 한 번 바뀜(은·금·흰·보조색).
- 만루 세리머니: 홈 옆 카메라로 닦아 내며 전환 → 타자가 뛰어 들어와 홈을 밟음(먼지 · '+4') → 먼저 들어온 주자 셋과 하이파이브, 마지막은 헬멧 툭 → 뒤 더그아웃 동료들 박수 · 관중석 사진 플래시. 몸 움직임은 캐릭터 생성기(`art/character`)의 체격 · 달리기 동작 · 3D 뼈대를 쓰고, 그림은 가벼운 실루엣(캔버스). 이 부분은 만루 때만 따로 불러온다.

## 5. 테마 · 움직임 줄이기

- **night** 전광판 흰 글자 + 구단색 선, 빛을 더하는 폭죽 · **broadcast** 중계 자막(검정 판 + 구단색 기둥 · 기울임 · 흰 하단 자막) · **classic** 신문 호외(종이 판 · 먹 · 내 구단 별색 한 가지, 폭죽은 점각 점선 + 망점 빛, 번쩍임 없음). 테마는 가장 가까운 `[data-theme]` 을 따른다(`theme` 으로 강제 가능).
- `prefers-reduced-motion` 이면: 흔들림 · 번쩍임 · 검은 띠 · 세리머니 없이, 가장 활짝 핀 순간의 **정지된 빛 한 장**과 글자만 나타났다 사라진다(0.9초 / 1.6초).

## 6. 성능 · 정리

- 캔버스 하나(만루 세리머니 때만 하나 더) · `requestAnimationFrame` 하나 · devicePixelRatio 상한 2 · 한 프레임 별 1100개 상한(넘으면 고르게 덜어 냄) · 느린 기기면 꼬리 마디를 줄인다.
- 별 위치는 시각의 닫힌 식이라 쌓아 두는 상태가 없다 — 탭이 숨으면 멈추고(한 프레임 최대 50ms), 아무 시점으로나 바로 갈 수 있다.
- 잰 값(헤드리스 Edge · 소프트웨어 그리기 · 390×368 · DPR 2): 끝내기(가장 무거움) 프레임당 평균 0.4ms · 최대 2.7ms, 세리머니 평균 0.4~0.6ms.
- 끝나면(또는 `stop()`) DOM · 캔버스 메모리(width=0) · 스프라이트 · 이벤트 · ResizeObserver · 흔든 요소의 `translate` 까지 되돌린다.

## 7. 미리보기 주소 (`#/fx`)

`#/fx?play=grandslam&t=900&len=short&team=bs&rm=1&theme=classic`

| 옵션 | 뜻 |
|---|---|
| `play` | 예시 키 — solo · two · three · grandslam · walkoff · walkoff-slam · reverse · tie · goahead · oop · b2b · b2b2b · leadoff · pinch · milestone · away-solo · combo |
| `t` | 그 시점(ms)에서 멈춰 그림 — 스크린샷용 (세리머니는 폭죽 길이 − 320ms 부터) |
| `len` | `short` · `long` |
| `team` | 구단 id (`dj` `gj` `dg` `bs` `sb` `st` `sh` `ic` `cw` `sw`) |
| `rm=1` | 움직임 줄이기 흉내 |

## 8. 파일

| 파일 | 내용 |
|---|---|
| `index.ts` | 공개 입구 |
| `types.ts` | `HomerunInfo` · 옵션 · 핸들 |
| `plan.ts` | 정보 → 계획 (제목 · 폭죽 목록 · 색 · 빛 · 흔들림 · 길이), `leadOf` · `homerunDuration` |
| `fireworks.ts` | 캔버스 폭죽 (모란 · 국화 · 버드나무 · 야자 · 링 · 이중 링 · 토성 · 십자 분열 · 금빛 왕관 · 점멸 · 꽃술 · 축포 · 마인 · 분수 · 장외 혜성) |
| `text.ts` · `homerun.module.css` | 큰 글자 12가지 짜임 · 테마 3종 |
| `player.ts` | 재생기 (시계 · 빛 · 흔들림 · 건너뛰기 · 정리) — `playHomerunFx` |
| `HomerunFx.tsx` | React 부품 |
| `ceremony.ts` | 만루 세리머니 (따로 불러옴) |
| `FxLab.tsx` · `FxLab.module.css` · `presets.ts` | 미리보기 `#/fx` |
