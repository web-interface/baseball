# 화면 기반 — 구조와 규칙 (야구 매니저 web/src)

휴대폰 우선 반응형 웹. 앱처럼 만들지 않는다 — PWA·홈 화면 설치·**아래 탭바 금지**, 화면 이동은 위쪽 헤더와 가로 메뉴.
지금은 목업 데이터(`game/mock.ts`)로 화면만 만든다. 서버 연결은 다음 단계에서 같은 타입(`game/types.ts`)으로 갈아 끼운다.
요구사항 원문·정리: `scratchpad/fd/out/00_요구사항_누적.md` (지금 41개) — 화면 만들기 전에 자기 화면 관련 번호를 꼭 읽는다.

## 1. 폴더

| 폴더 | 내용 | 주인 |
|---|---|---|
| `theme/` | `tokens.css`(3테마 토큰) · `base.css`(리셋·숫자·접근성) · `fonts.ts`(글꼴) · `themes.ts`(테마·내 구단 색) · `ThemeProvider.tsx` | 기반 |
| `ui/` | 공용 부품 — `index.ts` 에서만 가져다 쓴다 | 기반 |
| `app/` | `App`(뿌리) · `router`(해시) · `routes`(경로 표) · `auth`(로그인 상태) · `AuthScreen`(로그인 게이트) · `Shell`(헤더+메뉴) · `Preview`(#/preview) · `ScreenStub`(자리 안내판) · `StadiumArt` | 기반 |
| `game/` | `types.ts` · `mock.ts` · `world.ts`(세계관 구단 10 + 옛 구단 10 · 계보 · 리그 · 특별 선수 이름) · `clubSeasons.ts`(1982~ 구단 연도 기록 — `data/club-seasons.json`) · `history.ts`(옛 시즌 선수단 — 연도팩·구단팩) · `grades.ts`(등급 11종 + 특별 선수) · `labels.ts`(한국어 이름표) · `field.ts`(경기장 좌표) | 기반 |
| `cards/` | `Card` · `CardMini` · `CardBack` — 지금은 임시, props 는 최종 | 카드 디자이너 |
| `art/` | `PlayerArt.tsx`(선수 그림 입구) · `interim.ts`(생성기 오류 때 대체 초상) | 기반 |
| `art/character/` | 캐릭터 생성기 (외모·체격·유니폼·초상·전신) | 캐릭터 팀 |
| `screens/<이름>/` | 화면 하나 = 폴더 하나 (`index.tsx` 의 `export default`) | 각 화면 개발자 |

**파일 소유 규칙** — 각 개발자는 **자기 화면 폴더만** 고친다. 공용(`theme` · `ui` · `app` · `game` · `cards` 자리)은 기반 담당 것이다.
공용에 필요한 게 있으면 ① 자기 폴더 안에 먼저 만들어 쓰고 ② 기반 담당에게 "ui 로 올려 달라"고 요청한다. 남의 폴더·공용 파일을 직접 고치지 않는다.
목업 데이터가 모자라면 자기 폴더에 `local-mock.ts` 를 만들어 `game/mock` 값을 이어 붙여 쓴다.

## 2. 경로 (해시) · 새 화면 추가

| 주소 | 화면 | 폴더 |
|---|---|---|
| `#/login` | 로그인 · 새로 시작 · 복구 코드로 비밀번호 다시 정하기 | `app/AuthScreen` |
| `#/preview` | 미리보기 — 로그인 없이 모든 화면 · 테마 · 부품 | `app/Preview` |
| `#/club-select` | 구단 선택 (+ 특별 선수 만들기, 요구 29) | `screens/club-select` |
| `#/home` `#/lineup` `#/match` `#/cards` `#/gacha` `#/shop` `#/pvp` | 위쪽 메뉴 7개 | `screens/<이름>` |
| `#/player/:id` | 선수 정보 (`params.id`) | `screens/player` |
| `#/settings` | 설정 (헤더 톱니) | `screens/settings` |

새 화면: ① `screens/<이름>/index.tsx` 에 `export default function XScreen({ params, query }: ScreenProps)` ② `app/routes.ts` 의 `ROUTES` 에 한 줄
(`menu` 를 넣으면 위 메뉴에 나오고, `back` 을 넣으면 뒤로 버튼, `chrome: 'bare'` 면 메뉴 없이 헤더만) ③ 미리보기 목록에는 저절로 나온다.
이동은 `<Link to="/player/p03">` 또는 `navigate('/match?mode=quick')`, 뒤로는 `goBack('/home')` (`app/router`).

로그인: 개발 서버(`npm run dev`)에서는 로그인 없이 모든 화면이 보인다(스크린샷용). 로그인 막기를 보려면 주소에 `?gate=1`.
배포본에서는 `#/preview` 를 한 번 열면 그 탭에서 둘러보기가 된다. 로그인 상태는 `useAuth()` (`status` · `user` · `logout`).

## 3. 화면 틀

- `Shell` 이 헤더(구단 엠블럼·이름·순위, 재화 GP/골든볼, 설정 / 하위 화면은 뒤로·제목)와 가로 메뉴(밑줄이 미끄러짐)를 그린다. **화면은 본문만** 그린다.
- 본문 최대 폭 `--col`(600px), 넓은 화면에선 가운데. 좌우 여백 `var(--gutter)`(16px). 경기장처럼 꽉 채울 땐 여백 없이.
- 화면이 바뀌면 본문이 살짝 떠오르며 나타난다(260ms). 그동안 `position: fixed` 가 흔들리니, 화면 아래 고정 버튼 줄은 `Sheet` 나 포털로.
- 손가락 크기 44px 이상, 입력칸 글자 16px 이상(아이폰 확대 방지), 가로 스크롤 금지(가로로 미는 목록은 그 목록만).
- 화면 하나가 오류로 멈춰도 앱 전체는 안 깨진다(`ScreenBoundary`). 콘솔 오류는 꼭 확인.
- 재화는 처음 10시즌 GP 1조 · 골든볼 1억(요구 39). 좁은 곳은 `fmt.kr` → '1조' · '1억', 넓은 곳·상세는 `fmt.int` 실제 숫자.

## 4. 테마 토큰

`<html data-theme="night | broadcast | classic">` — 같은 화면 구조에 옷만 갈아입는다. 설정·미리보기에서 바꾸고 기기에 기억한다(`localStorage bb.theme`). 주소 `?theme=classic` 로도 바로 바뀐다.

- **색을 직접 쓰지 않는다.** 예외: 구단색(`team.colors`), 등급색(`var(--gr-<등급>)`), 고유 구종 색(`signaturePitch.color`).
- 테마마다 모양이 달라야 하면 CSS Module 안에서 `:global([data-theme='broadcast']) .x { … }`.
- 숫자는 전부 `className="num"`(자리 맞춤) 또는 `<Num>`. 큰 숫자(OVR·점수)는 `num-display`(broadcast 기울임, classic 은 칠한 점수판 숫자).
- 제목은 `var(--font-head)`(Wanted Sans) + `var(--head-weight)` + `var(--head-tracking)`, 큰 제목에는 `text-shadow: var(--misreg)` (classic 에서만 보임).
- **classic = 인쇄물** (요구 32): 카드 용지 · 먹 · **내 구단 별색 한 가지**(`--club`)만. 크림+금+세리프 '빈티지 템플릿' 금지, 금색은 레전드 이상 카드에만.
  쓸 것: 기록지 괘선(`--line` 이 옅은 초록 회색), 수동 점수판(`--inv` 초록 나무판 + 흰 페인트), 망점(`className="halftone"`), 판 어긋남(`--misreg`), 연필 기록(`className="hand"` — 6-4-3 · K).

| 토큰 | 뜻 |
|---|---|
| `--bg` `--bg-deep` | 바탕 |
| `--surface` `--surface-2` `--surface-3` `--sunk` | 올린 면 / 파인 면(입력칸) |
| `--inv` `--inv-2` `--inv-fg` `--inv-fg-2` `--inv-line` | 점수판·자막 같은 반대색 면 (classic 은 수동 점수판 초록) |
| `--fg` `--fg-2` `--fg-3` `--fg-4` | 글자 4단 (본문 · 보조 · 이름표 · 흐림) |
| `--line` `--line-2` `--line-3` | 헤어라인 3단 |
| `--accent` `--accent-2` `--accent-deep` `--accent-ink` `--accent-weak` | 강조 (night·broadcast 주황, classic 은 내 구단 별색) |
| `--club` `--club-2` `--club-ink` `--club-text` | 내 구단 색 (면 · 보조 · 면 위 글자 · 종이 위 글자) — `applyClubColors` |
| `--good` `--bad` `--warn` `--info` `--up` `--down` | 상태 · 올라감(빨강)/내려감 |
| `--ball` `--strike` `--out` | B·S·O 불 |
| `--volt` `--gold` `--gold-2` | 케미 형광(한 화면 2곳까지) · 금 (classic 은 둘 다 별색·먹) |
| `--field-*` | 경기장 (잔디·흙·선·담장·관중석·조명·풍경) |
| `--gr-normal` … `--gr-th` `--gr-unique` `--gr-holo` | 카드 등급 고유색 |
| `--font-body` `--font-head` `--font-num` `--font-num-display` `--font-hand` | Pretendard · Wanted Sans · Barlow Condensed · (classic) Big Shoulders · Nanum Pen Script |
| `--r-1` `--r-2` `--r-3` `--r-card` · `--btn-clip` | 모서리 · night 주 버튼 모서리 컷 |
| `--shadow-*` · `--texture` · `--misreg` · `--halftone` | 그림자 · 결(night 고운 결, classic 용지) · 판 어긋남 · 망점 |
| `--sp-*` `--fs-*` `--gutter` `--col` `--dur-*` `--ease-*` | 간격 · 글자 크기 · 움직임 |

## 5. 공용 부품 (`import { … } from '../../ui'`)

| 부품 | 쓰임 |
|---|---|
| `Button` `IconButton` | 주(`primary`)·보조(`secondary`)·반대(`ink`)·글자(`ghost`), 크기 `l/m/s`, `trailing` 에 가격 |
| `Tabs` | 밑줄 탭(`underline`) · 상자 세그먼트(`box`) |
| `Sheet` | 아래에서 올라오는 시트 (`footer` 버튼 줄, `dismissible={false}` 면 꼭 읽게) |
| `TopBar` `WalletView` | 헤더 (Shell 이 씀) · 재화 표시 (`full` 이면 실제 숫자) |
| `Gauge` | 팀 종합 게이지 (`value` `base` `potential` `parts`) |
| `StatBar` | 능력치 막대 (`bonus` 빗금, `scale="fm"` 1~20) |
| `Num` · `fmt` | 숫자 표시 · `fmt.avg(.3124)` → `.312`, `fmt.era` `fmt.level(8.99)` `fmt.roman(7)` → `VII` `fmt.signed` `fmt.kr(1e12)` → `1조` `fmt.yearTag(27)` → `’27` |
| `Icon` `CoinGP` `GoldenBall` | 직접 그린 아이콘 (`ICON_NAMES`) — 이모지 대신 |
| `Emblem` | 구단 엠블럼 10종 — 세계관 `emblemIdea` 대로 그린 기하 문장 |
| `Field` | 위에서 본 경기장. `stadium={team.stadium}` 을 넘기면 구장 특색(요구 33): 거리·담장 높이(높은 벽은 두껍게 + '7m')·파울 지역·인조잔디·돔·외야 너머 풍경. 좌표 `game/field.ts`, 자식 HTML 은 `left: x*100%`, `top: y*100%` |
| `CalloutStage` `useCalloutQueue` `CalloutAnnouncer` | 강조 문구 (아래 6) |
| `ToastProvider` `useToast` | 토스트 `toast('저장했어요')` |
| `ThemePicker` · `TextField` | 테마 고르기 · 입력칸 |
| `YearPicker` | 1982~2027 한 해 단위 고르기 — 연대 탭 + 5칸 격자, 칸마다 작은 한 줄(우승 구단 등), 우승한 해 강조 |

카드·선수 그림: `import { Card, CardMini, CardBack, cardProps } from '../../cards'` → `<Card {...cardProps(card)} size="m" />`,
`import { PlayerArt } from '../../art/PlayerArt'` → `<PlayerArt player={p} variant="portrait | full | mini" />`. **선수 얼굴은 반드시 이 둘로만.**
PlayerArt 는 캐릭터 생성기 그림을 화면에 보일 때만 만들어 그림(`<img>`)으로 붙인다(한 장 수백 KB 라 DOM 에 직접 넣지 않음). 곧 보일 게 확실하면 `eager`.

## 6. 강조 문구 (호수비 · 클러치 히트 · 극적인 상황 — 요구 28)

```tsx
const q = useCalloutQueue();
// 엔진 플레이에 highlight 가 있으면
q.push({ kind: 'walkoff', title: '끝내기!', sub: '연이준 · 9회말 우중간 끝내기 안타', meta: '승리 확률 80% → 100%',
         causes: ['스크루볼 세 번째 — 궤적에 눈이 익음'], team: { primary, secondary, ink } });
<CalloutStage callout={q.current} pace="quick" onDone={q.next}> …경기장·중계… </CalloutStage>
<CalloutAnnouncer callout={q.current} />
```
- `kind`: `defense` 호수비 · `clutch` 적시타 · `go-ahead` 역전·결승 · `comeback` 역전승 흐름 · `walkoff` 끝내기 · `escape` 위기 탈출 · `record` 대기록 직전.
- 효과: 구단색 띠가 밀려 들어옴 · 빛 · 살짝 흔들림 · 위아래 검은 띠(느린 재생) · 띠 아래 확률 숫자와 원인 표시(↳ 최대 2줄).
- `pace`: 빨리 보기 `quick`(짧게) · 주요 장면/이닝별 `normal` · 자세히 `slow`. **모든 보기 방식에서 띄운다.**
- 띄울지는 엔진 값으로 정한다(승리 확률 변화 · 잡을 확률). **한 경기 3~4번까지** — 자주 나오면 싱겁다.
- 움직임 줄이기 설정이면 흔들림·밀림 없이 나타났다 사라진다(부품이 알아서). 목업 예시: `LAST_MATCH.plays` 의 `highlight`, 수비 범위 원 데이터는 `a21.defense`(요구 30).

## 7. 목업 (`game/mock.ts`)

- 구단 10 (`TEAMS`, id = 코드 소문자 `dj` `gj` `dg` `bs` `sb` `st` `sh` `ic` `cw` `sw`) — 세계관 확정 이름(요구 34): 대전 독수리스 · 광주 호랑이즈 · 대구 사자즈 · 부산 거인츠 · 서울 곰스 · 서울 쌍둥이스 · 서울 영웅즈 · 인천 상륙스 · 창원 공룡스 · 수원 마법사즈. 화면은 `team.name`, 좁은 곳은 `team.short`.
- 옛 구단 10 (`OLD_TEAMS`, 코드 `DDG` `MDH` `HBE` `SCR` `ISB` `IJR` `IDR` `SUC` `JDR` `IBY`) — 동대문 곰스 · 무등 호랑이즈 · 한밭 독수리스 · 서울 청룡스 · 인천 슈퍼별즈 · 인천 조랑말스 · 인천 돌고래스 · 수원 일각수스 · 전주 돌격대스 · 인천 비룡스. `team.era`(뛴 해) · `team.revives`(부활 자리). 현재 구단은 지금 이름이 된 뒤 해만 맡는다(예 곰스 1999~).
  `TEAMS` 는 2027 리그 10개 — 옛 구단을 시작 구단으로 고르면 같은 계보 자리를 그 구단이 '부활 구단'으로 대신한다(순위표·다음 경기 id 도 옮김). 카드·구단팩·세트덱처럼 20개 모두 필요하면 `ALL_TEAMS` · `CURRENT_TEAMS`, 찾기는 `teamById`/`teamByCode`(20개 모두). 좁은 곳에서 옛 구단과 별명이 겹치면 `shortLabel(code)`('동대문 곰스').
- `PLAYERS`(40 + 특별 선수 예시 `p41` 이동규) · `CARDS`(46, 등급 11종 + `unique`) · `LINEUP_EVAL`(팀컬러 = 같은 구단·권역·연도·라이벌, 케미, 폭발)
- **내 카드 · 라인업은 목업이 아니라 `game/inventory`(보유 카드 저장소, 이 기기 `bb.inv`)** — 카드 id 마다 보유 수량 · 강화 0~10 · 레벨 · 얻은 시각.
  처음엔 구단 선택의 기본 선수단 · 지명 · 특별 선수 카드. 카드구매 · 카드 조합 · 스카우터로 얻은 카드는 `addCards` 로 바로 들어오고, 같은 카드가
  `ENH_STEPS` 수량(노멀 3·5·6·8·9 / 스페셜 2·3·4·5·7 / 레어 이상 1~5)만큼 모이면 I~V 는 자동 강화, VI~X 는 `tryEnhance`(같은 카드 1장 + GP, 확률 · 실패 보정).
  읽기는 `ownedIds` · `ownedCard(id)`(강화 · 레벨 반영) · `useInventory()`, 라인업은 `screens/lineup/calc` 의 `store`(같은 저장소). `MY_CARD_IDS` · `LINEUP` 은 쓰지 않는다.
  시험: `npm test` (뽑기 1,000번 · 저장 왕복 · 깨진 저장).
- `WEATHER_TODAY` · `NEXT_GAME` · `LAST_MATCH`(거인츠 4:5 독수리스 끝내기 — 이닝 점수·플레이·좌표·원인·강조 장면·수비 범위·승리 확률) · `STANDINGS` · `USER_RANKING` · `PVP_OPPONENTS`
  **시즌 성적·순위·선수 시즌 기록은 목업이 아니라 `season/store`(이 기기의 시즌 진행)** — 2027 개막일(3월 27일 토) 모든 구단 0승 0무 0패에서 시작, `teamLine(id)`(순위·공동·전적·남은 경기) · `standingsOf()` · `batLine/pitLine(id)` 를 쓴다(헤더·홈·순위·시즌·경기 화면이 같은 값). `STANDINGS` 는 쓰지 않는다.
- 내 구단 = `ME.teamId`(`myTeam()`) — 구단 선택(#/club-select)에서 고른 구단(옛 구단이면 부활 구단). 'dj' 를 직접 쓰지 말 것.
- `PACKS`(전부 30장: 일반 3만 GP · 프리미엄 27만 · 스페셜 45만 · 레전드 9천 골든볼 · 연도팩 · 구단팩) · `ROULETTE_EXAMPLE` · `SCOUT_SHOP` · `ME`(GP 1조 · 골든볼 1억 · 10시즌까지) · `NEWS` · `SPECIAL_PLAYER_NAMES`
- 찾기: `teamById` `playerById` `cardById` `playerOfCard` `cardsOfPlayer` `myTeam`. 이름표 `game/labels.ts`, 등급 `game/grades.ts`(`GRADES` `GRADE_ORDER` `GRADE_ORDER_ALL`).
- 실제 선수·구단 이름 금지(특별 선수 11명은 사용자 지정 예외). 구단 코드도 화면(카드 번호)에 보이니 실제 구단 약칭과 같은 글자는 쓰지 않는다.

## 8. 스크린샷 (필수 — 찍고, 혹평하고, 고치기)

```bash
cd web && npx vite --port <내 포트> --strictPort            # 끝나면 꼭 끄기
powershell -NoProfile -ExecutionPolicy Bypass -File "<scratchpad>\shot.ps1" -Url "http://localhost:<포트>/baseball/#/lineup?theme=night" -Out "<scratchpad>\ui-shots\<이름>.png" -Wait 4000 -Scale 2
```
- `shot.ps1` 은 헤드리스 Edge 를 CDP 로 W×H 그대로 찍는다(예전 iframe 방식은 개발 서버에서 빈 화면이 나와 바꿈). 긴 화면 `-H 3000`, 넓은 화면 `-W 1280 -H 800`.
- 테마 3개(`night` · `broadcast` · `classic`) 모두. 개발 서버에서는 로그인 없이 보인다.
- 서버 끄기(PowerShell): `Get-NetTCPConnection -LocalPort <포트> -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }`

## 9. 하지 말 것 (AI 티)

알약 칩 남발 · 이모지 · 기울인 스티커 상자 · 하드 섀도 · 체크 아이콘 목록 · 모든 화면 같은 카드 틀 · 보라-파랑 그라디언트 · 글래스 · 네온 · 그라디언트 글자 · 전부 가운데 정렬 · 번역투 · 티켓/우표 클리셰.
대신: 점수판·B·S·O·.312·6-4-3 같은 진짜 야구 표기, 분명한 글자 위계, 자리 맞춤 숫자, 헤어라인, 화면마다 다른 배치, 짧은 해요체.
