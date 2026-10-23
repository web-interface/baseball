// 세계관 — scratchpad/fd/out/04_world.json (세계관 작가 · 사용자 확정 구단 이름 34번)에서 옮긴 값. 고칠 땐 원본과 같이.
// 화면에는 '대전 독수리스'처럼 전체 이름, 좁은 곳(점수판)은 짧은 이름('독수리스'). 실제 구단 이름은 어디에도 쓰지 않는다.
// 역사(창단·존재 연도·우승·황금기)는 1982년부터의 실제 지역 구단 계보 기록(data/club-seasons.json)에 맞췄다 — 04_world.json 의 옛 가상 역사와 다르다.
//  · 현재 구단 10개(CLUBS)는 지금 이름이 된 뒤 연도만 맡고, 그 앞 시대·없어진 구단은 옛 구단 10개(OLD_CLUBS)로 따로 둔다.
//  · 옛 구단을 시작 구단으로 고르면 2027 리그에서 같은 연고 계보의 현재 구단 자리(revives)를 대신해 '부활 구단'으로 뛴다.

export const LEAGUE = {
  "name": "한별 리그",
  "fullName": "한별 프로야구 리그",
  "founded": 1982,
  "season": "정규시즌 144경기(상대 구단마다 16경기), 4월 개막 ~ 9월 말, 10월 가을야구",
  "postseason": "상위 6팀 진출: 3위-6위·4위-5위 3전2선승 → 준결승(1·2위 대 승자) 5전3선승 → 한별 시리즈 7전4선승",
  "allStar": "별빛 올스타전 — 한강 / 중부·호남 / 낙동 3개 권역 대항전",
  "colors": {
    "primary": "#12131A",
    "secondary": "#E6C88A",
    "accent": "#F5F1E8"
  }
} as const;

export const REGION_GROUPS = [
  {
    "id": "han",
    "name": "한강 권역",
    "clubs": [
      "SB",
      "ST",
      "SH",
      "IC"
    ],
    "desc": "서울 3개 구단 + 한강 하구의 인천. 구단이 4개라 권역 카드 풀이 가장 넓음"
  },
  {
    "id": "jungbu",
    "name": "중부·호남 권역",
    "clubs": [
      "SW",
      "DJ",
      "GJ"
    ],
    "desc": "경부선·호남선을 따라 수원·대전·광주"
  },
  {
    "id": "nakdong",
    "name": "낙동 권역",
    "clubs": [
      "DG",
      "BS",
      "CW"
    ],
    "desc": "낙동강 물길로 이어진 영남 3개 구단"
  }
] as const;

export const CLUBS = [
  {
    "code": "DJ",
    "name": "대전 독수리스",
    "short": "독수리스",
    "region": "daejeon",
    "regionName": "대전",
    "regionGroup": "jungbu",
    "stadium": "갑천 볼파크",
    "stadiumDesc": "갑천변 개방형 구장. 우익수 쪽이 짧은 대신 7m '갑천 벽'이 서 있는 비대칭 구장",
    "stadiumTraits": {
      "roof": "개방",
      "surface": "천연잔디",
      "lf": 99,
      "cf": 122,
      "rf": 96,
      "fenceM": {
        "lf": 2.6,
        "cf": 2.6,
        "rf": 7.0
      },
      "wind": "내륙 약풍",
      "climate": "보통",
      "foul": "보통",
      "parkNote": "우측 높은 담장 직격 2루타↑, 우측 홈런↓"
    },
    "mascot": "비상이 — 날개를 활짝 편 독수리. 홈런이 나오면 외야 지붕 위를 한 바퀴 활공",
    "colors": {
      "primary": "#F28C28",
      "secondary": "#1F2024",
      "accent": "#F6E7C8"
    },
    "colorNames": {
      "primary": "이글 오렌지",
      "secondary": "차콜 블랙",
      "accent": "깃털 크림"
    },
    "emblemIdea": "모서리를 깎은 육각 방패 안에 왼쪽을 보는 독수리 옆머리 — 꺾은선 6개로 만든 날카로운 윤곽, 부리는 긴 삼각형 하나, 눈은 크림색 마름모. 방패 윗변 뒤로 깃털 3개(긴 삼각형)가 솟음. 오렌지 면 + 차콜 테두리 + 크림 눈.",
    "style": "에이스 계보 — 선발 투수 왕국",
    "styleKey": "ace",
    "styleDesc": "리그 최다 다승왕 배출. 선발 로테이션을 '발톱'이라 부름. 1~6회를 지배하는 야구",
    "tier": "강",
    "founded": 1994,
    "era": [1994, 2027],
    "rival": "SW",
    "rivalry": "경부선 더비",
    "titles": [1999],
    "goldenEras": [
      { "years": "1999", "label": "독수리 첫 우승", "desc": "정규 4위에서 한별 시리즈 우승", "legendSeason": 1999 },
      { "years": "2025", "label": "독수리의 비상", "desc": "정규 2위 · 마운드 왕국 · 한별 시리즈 준우승", "legendSeason": 2025 }
    ]
  },
  {
    "code": "GJ",
    "name": "광주 호랑이즈",
    "short": "호랑이즈",
    "region": "gwangju",
    "regionName": "광주",
    "regionGroup": "jungbu",
    "stadium": "영산 필드",
    "stadiumDesc": "영산강을 등진 구장. 리그에서 응원 소리가 가장 큰 1루 응원석",
    "stadiumTraits": {
      "roof": "개방",
      "surface": "천연잔디",
      "lf": 99,
      "cf": 121,
      "rf": 99,
      "fenceM": {
        "lf": 3.0,
        "cf": 3.0,
        "rf": 3.0
      },
      "wind": "강바람(외야→내야, 저녁)",
      "climate": "여름 습함",
      "foul": "좁음",
      "parkNote": "좁은 파울 지역 → 타자 유리, 저녁 맞바람에 홈런 약간↓"
    },
    "mascot": "어흥이 — 줄무늬 꼬리를 흔드는 아기 호랑이. 득점 때마다 포효 동작",
    "colors": {
      "primary": "#B1102B",
      "secondary": "#141416",
      "accent": "#F2A007"
    },
    "colorNames": {
      "primary": "타이거 크림슨",
      "secondary": "줄무늬 블랙",
      "accent": "호박 앰버"
    },
    "emblemIdea": "정면 호랑이 얼굴을 역오각형으로 단순화 — 아몬드형 눈 2개(앰버), 이마에 굵기가 다른 가로줄 3개(호랑이 이마 무늬), 볼 양옆에 사선 줄무늬 2쌍. 원형 배지 테두리. 크림슨 면 + 블랙 줄무늬 + 앰버 눈.",
    "style": "불방망이 — 고타율 컨택 타선",
    "styleKey": "contact",
    "styleDesc": "연속 안타로 몰아치는 타선. 삼진이 적고 빅이닝이 잦음",
    "tier": "중",
    "founded": 2001,
    "era": [2001, 2027],
    "rival": "DG",
    "rivalry": "영호남 더비",
    "titles": [2009, 2017, 2024],
    "goldenEras": [
      { "years": "2009", "label": "줄무늬 첫 우승", "desc": "이름을 바꾼 뒤 첫 통합 우승", "legendSeason": 2009 },
      { "years": "2017", "label": "줄무늬의 귀환", "desc": "핵타선으로 8년 만의 통합 우승", "legendSeason": 2017 },
      { "years": "2024", "label": "열두 번째 별", "desc": "무등 시절부터 세면 열두 번째 우승 — 통합 우승", "legendSeason": 2024 }
    ]
  },
  {
    "code": "DG",
    "name": "대구 사자즈",
    "short": "사자즈",
    "region": "daegu",
    "regionName": "대구",
    "regionGroup": "nakdong",
    "stadium": "신천 볼파크",
    "stadiumDesc": "신천변 구장. 한여름 낮 기온이 리그에서 가장 높은 '가마솥 구장'",
    "stadiumTraits": {
      "roof": "개방",
      "surface": "천연잔디",
      "lf": 99,
      "cf": 122,
      "rf": 99,
      "fenceM": {
        "lf": 3.2,
        "cf": 3.2,
        "rf": 3.2
      },
      "wind": "분지 무풍",
      "climate": "더위(7~8월 체력 소모↑)",
      "foul": "보통",
      "parkNote": "더운 공기에 타구가 잘 뻗음(홈런 약간↑), 낮 경기 투수 체력↓"
    },
    "mascot": "갈기 — 파란 갈기를 휘날리는 사자. 더위에 부채질하는 동작이 트레이드마크",
    "colors": {
      "primary": "#2C6BD1",
      "secondary": "#EDF2F8",
      "accent": "#F0A63A"
    },
    "colorNames": {
      "primary": "라이언 블루",
      "secondary": "실버 화이트",
      "accent": "갈기 골드"
    },
    "emblemIdea": "정면 사자 얼굴 — 역오각형 얼굴 둘레에 삼각형 12개를 방사형으로 붙인 기하학 갈기(시계 숫자 위치). 코는 작은 역삼각형, 눈은 가로로 긴 마름모 2개. 블루 갈기 + 화이트 얼굴 + 골드 눈.",
    "style": "왕조 — 공수주 밸런스",
    "styleKey": "balance",
    "styleDesc": "약점 없는 전력과 큰 경기 경험. 지금 구단 가운데 최다 우승(8회)",
    "tier": "강",
    "founded": 1982,
    "era": [1982, 2027],
    "rival": "GJ",
    "rivalry": "영호남 더비",
    "titles": [1985, 2002, 2005, 2006, 2011, 2012, 2013, 2014],
    "goldenEras": [
      { "years": "1985", "label": "전·후기 통합", "desc": "전기·후기 모두 1위 — 시리즈 없이 우승 · 7할 승률", "legendSeason": 1985 },
      { "years": "2002", "label": "첫 시리즈 우승", "desc": "한별 시리즈 첫 우승 — 통합 우승", "legendSeason": 2002 },
      { "years": "2011–2014", "label": "갈기 4연패", "desc": "네 해 연속 통합 우승", "legendSeason": 2014 }
    ]
  },
  {
    "code": "BS",
    "name": "부산 거인츠",
    "short": "거인츠",
    "region": "busan",
    "regionName": "부산",
    "regionGroup": "nakdong",
    "stadium": "광안 스타디움",
    "stadiumDesc": "외야 너머 바다와 대교 야경. 리그에서 가장 시끄러운 응원석과 5m 외야 담장",
    "stadiumTraits": {
      "roof": "개방",
      "surface": "천연잔디",
      "lf": 95,
      "cf": 118,
      "rf": 95,
      "fenceM": {
        "lf": 5.0,
        "cf": 5.0,
        "rf": 5.0
      },
      "wind": "바닷바람(좌→우, 경기마다 세기 다름)",
      "climate": "해양성",
      "foul": "보통",
      "parkNote": "짧지만 높은 담장 → 펜스 직격↑, 바람 부는 날 홈런 변동 큼"
    },
    "mascot": "큰발이 — 바다를 성큼 건너는 거인. 응원 때 발 구르기로 박자를 맞춤",
    "colors": {
      "primary": "#123A7A",
      "secondary": "#D7263D",
      "accent": "#9ED3F0"
    },
    "colorNames": {
      "primary": "항구 남색",
      "secondary": "신호 빨강",
      "accent": "바다 하늘"
    },
    "emblemIdea": "큰 발자국 하나 — 둥근 사다리꼴 발바닥 + 발가락 원 5개. 발바닥 안에 원호 3줄 파도, 맨 위 파도 끝이 야구공 실밥(작은 V자 4개)으로 이어짐. 남색 발 + 빨강 실밥 + 하늘색 파도.",
    "style": "거포 군단",
    "styleKey": "power",
    "styleDesc": "팀 홈런 1위 단골. 삼진도 많지만 한 방으로 뒤집음",
    "tier": "중",
    "founded": 1982,
    "era": [1982, 2027],
    "rival": "CW",
    "rivalry": "남해안 더비",
    "titles": [1984, 1992],
    "goldenEras": [
      { "years": "1984", "label": "첫 거인", "desc": "정규 4위에서 한별 시리즈 우승", "legendSeason": 1984 },
      { "years": "1992", "label": "부두의 함성", "desc": "정규 3위에서 두 번째 우승", "legendSeason": 1992 }
    ]
  },
  {
    "code": "SB",
    "name": "서울 곰스",
    "short": "곰스",
    "region": "seoul",
    "regionName": "서울",
    "regionGroup": "han",
    "stadium": "한강 볼파크",
    "stadiumDesc": "서울 곰스·서울 쌍둥이스가 함께 쓰는 리그 최대 구장. 홈 경기 때 외야 전광판 색이 바뀜",
    "stadiumTraits": {
      "roof": "개방",
      "surface": "천연잔디",
      "lf": 101,
      "cf": 124,
      "rf": 101,
      "fenceM": {
        "lf": 2.8,
        "cf": 2.8,
        "rf": 2.8
      },
      "wind": "강바람(약)",
      "climate": "보통",
      "foul": "넓음",
      "parkNote": "가장 넓은 구장 → 홈런↓·3루타↑, 넓은 파울 지역은 투수 유리"
    },
    "mascot": "반달이 — 가슴에 하얀 반달 무늬가 있는 반달가슴곰",
    "colors": {
      "primary": "#1C1B3F",
      "secondary": "#C9CDD6",
      "accent": "#C8102E"
    },
    "colorNames": {
      "primary": "곰 미드나잇",
      "secondary": "실버",
      "accent": "응원 빨강"
    },
    "emblemIdea": "정면 반달가슴곰 — 원 2개 귀, 둥근 오각형 얼굴, 가슴에 V자 반달 무늬(이 무늬가 상징). 아래에 짧은 가로 띠. 미드나잇 면 + 실버 반달 + 빨강 코(작은 원) 한 점.",
    "style": "선구안 야구 — 출루와 끈기",
    "styleKey": "eye",
    "styleDesc": "볼넷·출루율 상위 단골. 투구 수를 늘려 상대 에이스를 지치게 함",
    "tier": "중",
    "founded": 1999,
    "era": [1999, 2027],
    "rival": "ST",
    "rivalry": "한강 더비",
    "titles": [2001, 2015, 2016, 2019],
    "goldenEras": [
      { "years": "2001", "label": "곰의 기적", "desc": "정규 3위에서 우승", "legendSeason": 2001 },
      { "years": "2015–2016", "label": "곰 2연패", "desc": "2016 93승 통합 우승", "legendSeason": 2016 },
      { "years": "2019", "label": "곰의 뒷심", "desc": "마지막 날 1위를 뒤집고 통합 우승", "legendSeason": 2019 }
    ]
  },
  {
    "code": "ST",
    "name": "서울 쌍둥이스",
    "short": "쌍둥이스",
    "region": "seoul",
    "regionName": "서울",
    "regionGroup": "han",
    "stadium": "한강 볼파크",
    "stadiumDesc": "서울 곰스와 함께 쓰는 리그 최대 구장. 쌍둥이스 홈 경기 때는 와인빛 조명",
    "stadiumTraits": {
      "roof": "개방",
      "surface": "천연잔디",
      "lf": 101,
      "cf": 124,
      "rf": 101,
      "fenceM": {
        "lf": 2.8,
        "cf": 2.8,
        "rf": 2.8
      },
      "wind": "강바람(약)",
      "climate": "보통",
      "foul": "넓음",
      "parkNote": "가장 넓은 구장 → 발 빠른 타자·외야 수비 가치↑"
    },
    "mascot": "하나·두리 — 와인색 모자를 쓴 쌍둥이 남매. 늘 둘이 함께 다님",
    "colors": {
      "primary": "#A1124A",
      "secondary": "#C9CED6",
      "accent": "#1A1A1E"
    },
    "colorNames": {
      "primary": "쌍둥이 와인",
      "secondary": "실버",
      "accent": "블랙"
    },
    "emblemIdea": "같은 크기 원 두 개가 1/3쯤 겹친 모양 — 겹친 렌즈 부분 안에 야구공 실밥(마주 보는 원호 2개). 왼쪽 원은 와인 면, 오른쪽 원은 실버 선만, 겹친 부분은 블랙.",
    "style": "발야구 — 서울의 인기 구단",
    "styleKey": "speed",
    "styleDesc": "리그 최다 도루와 넓은 외야 수비. 스타가 많아 관중 1위",
    "tier": "강",
    "founded": 1990,
    "era": [1990, 2027],
    "rival": "SB",
    "rivalry": "한강 더비",
    "titles": [1990, 1994, 2023, 2025],
    "goldenEras": [
      { "years": "1990", "label": "첫해 우승", "desc": "이름을 바꾼 첫 시즌 통합 우승", "legendSeason": 1990 },
      { "years": "1994", "label": "쌍둥이 별", "desc": "두 번째 통합 우승", "legendSeason": 1994 },
      { "years": "2023–2025", "label": "쌍둥이 왕국", "desc": "세 해 동안 통합 우승 두 번", "legendSeason": 2025 }
    ]
  },
  {
    "code": "SH",
    "name": "서울 영웅즈",
    "short": "영웅즈",
    "region": "seoul",
    "regionName": "서울",
    "regionGroup": "han",
    "stadium": "노을 돔",
    "stadiumDesc": "리그 유일의 돔. 비·바람이 없고 지붕 테두리가 노을빛으로 물드는 밤 경기",
    "stadiumTraits": {
      "roof": "돔",
      "surface": "인조잔디",
      "lf": 99,
      "cf": 122,
      "rf": 99,
      "fenceM": {
        "lf": 3.8,
        "cf": 3.8,
        "rf": 3.8
      },
      "wind": "없음",
      "climate": "실내(우천 취소 없음)",
      "foul": "보통",
      "parkNote": "인조잔디 → 땅볼 빠름·내야 안타↑, 바람·날씨 영향 없음"
    },
    "mascot": "번쩍이 — 버건디 망토를 두른 꼬마 영웅. 결정적인 순간에만 나타남",
    "colors": {
      "primary": "#6E1C2E",
      "secondary": "#8D9099",
      "accent": "#E3B04B"
    },
    "colorNames": {
      "primary": "히어로 버건디",
      "secondary": "돔 스틸",
      "accent": "영웅 골드"
    },
    "emblemIdea": "어깨에 망토를 두른 듯한 오각형 방패 — 방패 양옆으로 망토 자락(긴 삼각형 2개)이 흘러내림. 가운데 위를 향한 셰브론(∧) 3개를 겹쳐 '올라가는 영웅'. 버건디 면 + 골드 셰브론 + 스틸 테두리.",
    "style": "육성 명가 — 신예 돌풍",
    "styleKey": "youth",
    "styleDesc": "유망주를 키워 스타로 만드는 팀. 리그에서 가장 어린 라인업",
    "tier": "약",
    "founded": 2008,
    "era": [2008, 2027],
    "rival": "IC",
    "rivalry": "경인 더비",
    "titles": [],
    "goldenEras": [
      { "years": "2014", "label": "돔의 영웅들", "desc": "정규 2위 · 첫 한별 시리즈", "legendSeason": 2014 },
      { "years": "2019", "label": "영웅의 가을", "desc": "두 번째 한별 시리즈", "legendSeason": 2019 }
    ]
  },
  {
    "code": "IC",
    "name": "인천 상륙스",
    "short": "상륙스",
    "region": "incheon",
    "regionName": "인천",
    "regionGroup": "han",
    "stadium": "월미 필드",
    "stadiumDesc": "바다와 맞닿은 항구 구장. 바닷바람이 경기마다 다르게 붐",
    "stadiumTraits": {
      "roof": "개방",
      "surface": "천연잔디",
      "lf": 95,
      "cf": 120,
      "rf": 95,
      "fenceM": {
        "lf": 2.4,
        "cf": 2.4,
        "rf": 2.4
      },
      "wind": "해안 바람(바다→외야, 낮 경기 강함)",
      "climate": "해양성",
      "foul": "좁음",
      "parkNote": "짧고 낮은 담장 → 리그 최고 홈런 구장, 바람 방향 따라 크게 달라짐"
    },
    "mascot": "닻돌이 — 닻 모양 꼬리를 단 바다 수달. 상륙정 모양 카트를 타고 등장",
    "colors": {
      "primary": "#E2412E",
      "secondary": "#0E5E6F",
      "accent": "#F5F5F2"
    },
    "colorNames": {
      "primary": "상륙 스칼렛",
      "secondary": "항구 틸",
      "accent": "화이트"
    },
    "emblemIdea": "닻 하나 — 세로 막대 + 위 고리(원) + 아래 원호 갈고리. 닻 뒤로 V자 뱃머리(상륙정) 실루엣, 아래 직선 파도 2줄. 스칼렛 닻 + 틸 파도 + 화이트 테두리.",
    "style": "외국인 명가 — 개항 도시",
    "styleKey": "foreign",
    "styleDesc": "외국인 거포·에이스 계보가 화려함. 외국인 선수 카드 비중이 가장 높음",
    "tier": "중",
    "founded": 2021,
    "era": [2021, 2027],
    "rival": "SH",
    "rivalry": "경인 더비",
    "titles": [2022],
    "goldenEras": [
      { "years": "2022", "label": "첫 상륙", "desc": "처음부터 끝까지 1위 — 통합 우승", "legendSeason": 2022 }
    ]
  },
  {
    "code": "CW",
    "name": "창원 공룡스",
    "short": "공룡스",
    "region": "changwon",
    "regionName": "창원",
    "regionGroup": "nakdong",
    "stadium": "합포 필드",
    "stadiumDesc": "옛 포구 자리에 지은 새 구장. 좌우 비대칭에 외야 관중석이 계단식",
    "stadiumTraits": {
      "roof": "개방",
      "surface": "천연잔디",
      "lf": 101,
      "cf": 123,
      "rf": 98,
      "fenceM": {
        "lf": 3.3,
        "cf": 3.3,
        "rf": 3.3
      },
      "wind": "남해 바닷바람(약)",
      "climate": "온화",
      "foul": "보통",
      "parkNote": "좌측이 깊어 우타자 홈런↓, 좌타자 유리"
    },
    "mascot": "쿵쿵이 — 등에 골판이 솟은 초식 공룡. 걸을 때마다 쿵쿵 소리",
    "colors": {
      "primary": "#B38B4D",
      "secondary": "#1D3557",
      "accent": "#F1E9DA"
    },
    "colorNames": {
      "primary": "공룡 브론즈",
      "secondary": "남색",
      "accent": "화석 아이보리"
    },
    "emblemIdea": "등 골판 5개(가운데가 가장 큰 삼각형)를 아치 모양으로 세우고, 그 아래 원호 하나로 공룡 등을 그림 — 육식 공룡 얼굴이 아닌 초식 공룡 골판. 브론즈 골판 + 남색 원호 + 아이보리 바탕.",
    "style": "철벽 불펜",
    "styleKey": "bullpen",
    "styleDesc": "7~9회를 '잠그는' 야구. 1점 차 승부에 강함",
    "tier": "약",
    "founded": 2013,
    "era": [2013, 2027],
    "rival": "BS",
    "rivalry": "남해안 더비",
    "titles": [2020],
    "goldenEras": [
      { "years": "2016", "label": "첫 발자국", "desc": "정규 2위 · 첫 한별 시리즈", "legendSeason": 2016 },
      { "years": "2020", "label": "공룡의 포효", "desc": "정규 1위 · 첫 우승", "legendSeason": 2020 }
    ]
  },
  {
    "code": "SW",
    "name": "수원 마법사즈",
    "short": "마법사즈",
    "region": "suwon",
    "regionName": "수원",
    "regionGroup": "jungbu",
    "stadium": "팔달 스타디움",
    "stadiumDesc": "외야 담장을 옛 성곽처럼 쌓은 막내 구장. 밤 경기마다 조명 쇼",
    "stadiumTraits": {
      "roof": "개방",
      "surface": "천연잔디",
      "lf": 98,
      "cf": 120,
      "rf": 98,
      "fenceM": {
        "lf": 4.0,
        "cf": 4.0,
        "rf": 4.0
      },
      "wind": "내륙 약풍",
      "climate": "보통",
      "foul": "보통",
      "parkNote": "중립 구장 — 큰 쏠림 없음"
    },
    "mascot": "요술이 — 별 지팡이(배트 모양)를 든 꼬마 마법사. 작전이 성공하면 반짝이는 가루를 뿌림",
    "colors": {
      "primary": "#15151A",
      "secondary": "#6B4FD8",
      "accent": "#E0352F"
    },
    "colorNames": {
      "primary": "주문 블랙",
      "secondary": "주문 바이올렛",
      "accent": "마법 레드"
    },
    "emblemIdea": "뾰족한 마법사 모자(긴 삼각형, 끝이 살짝 꺾임) + 모자 챙(납작한 타원). 챙 아래로 지팡이 겸 배트 2자루가 X자로 교차, 모자 둘레에 작은 별 3개. 블랙 모자 + 바이올렛 챙 + 레드 별.",
    "style": "변칙·작전 야구",
    "styleKey": "trick",
    "styleDesc": "히트앤드런·스퀴즈·더블스틸. 상대가 예측 못 하는 작전",
    "tier": "약",
    "founded": 2015,
    "era": [2015, 2027],
    "rival": "DJ",
    "rivalry": "경부선 더비",
    "titles": [2021],
    "goldenEras": [
      { "years": "2021", "label": "마법의 가을", "desc": "정규 1위 결정전 끝에 통합 우승", "legendSeason": 2021 },
      { "years": "2026", "label": "마법의 질주", "desc": "두 번째 정규 1위 · 불방망이", "legendSeason": 2026 }
    ]
  }
] as const;

/* ───────── 옛 구단 10 — 없어진 구단 · 지금 이름이 되기 전 시대 ───────── */
// 코드는 실제 약칭이 드러나지 않게(카드 번호에 보인다) 가상 이름의 머리글자로. data/club-seasons.json 키와 같다.
// 이름 규칙(요구 34번과 같음): 지역 + 실제 별명을 우리말로 + 끝소리 유지. 같은 별명의 현재 구단과 헷갈리지 않게 옛 지역 이름(동대문·무등·한밭).
// era = 그 이름으로 뛴 해 · homes = 연고 이력 · revives = 시작 구단으로 고르면 2027 리그에서 대신 들어가는 자리.
// 색은 그 시절 구단이 떠오르는 계열(실제 색 그대로는 아님) · 구장 이름은 가상.
export const OLD_CLUBS = [
  {
    "code": "DDG",
    "name": "동대문 곰스",
    "short": "곰스",
    "region": "seoul",
    "regionName": "서울",
    "regionGroup": "han",
    "stadium": "흥인 볼파크",
    "stadiumDesc": "성문 곁 옛 서울 구장. 좁은 외야에 나무 관중석, 원년 우승기가 걸린 곳",
    "stadiumTraits": { "roof": "개방", "surface": "천연잔디", "lf": 96, "cf": 116, "rf": 96, "fenceM": { "lf": 2.5, "cf": 2.5, "rf": 2.5 }, "wind": "도심 약풍", "climate": "보통", "foul": "보통", "parkNote": "좁은 외야 → 홈런·2루타↑" },
    "mascot": "곰돌 — 원년 우승기를 흔드는 아기곰. 지금 곰스 반달이의 할아버지뻘",
    "colors": { "primary": "#26386B", "secondary": "#F1E7D3", "accent": "#C9412F" },
    "colorNames": { "primary": "원년 남색", "secondary": "구장 크림", "accent": "벽돌 빨강" },
    "emblemIdea": "성문 지붕 — 처마 끝이 들린 기와 지붕 아래 둥근 귀 곰 얼굴. 크림 바탕 둥근 펠트 배지에 남색 테 + 벽돌 빨강 코.",
    "style": "원년 챔피언 — 뚝심 야구",
    "styleKey": "grit",
    "styleDesc": "정교한 타격과 끈끈한 마운드. 리그 첫 시즌 챔피언",
    "tier": "중",
    "founded": 1982,
    "era": [1982, 1998],
    "homes": [{ "from": 1982, "to": 1984, "region": "대전" }, { "from": 1985, "to": 1998, "region": "서울" }],
    "revives": "SB",
    "blurb": "리그 원년 챔피언. 1982~84 대전에서 출발해 1985년 서울 성문 곁으로 옮겼다",
    "rival": "SCR",
    "rivalry": "동대문 더비",
    "titles": [1982, 1995],
    "goldenEras": [
      { "years": "1982", "label": "원년 챔피언", "desc": "리그 첫 시즌 통합 우승 · 7할 승률", "legendSeason": 1982 },
      { "years": "1995", "label": "곰의 귀환", "desc": "13년 만의 두 번째 우승 — 통합 우승", "legendSeason": 1995 }
    ]
  },
  {
    "code": "MDH",
    "name": "무등 호랑이즈",
    "short": "호랑이즈",
    "region": "gwangju",
    "regionName": "광주",
    "regionGroup": "jungbu",
    "stadium": "빛고을 구장",
    "stadiumDesc": "무등산이 내려다보는 옛 광주 구장. 좁은 파울 지역에 바짝 붙은 응원석",
    "stadiumTraits": { "roof": "개방", "surface": "천연잔디", "lf": 97, "cf": 118, "rf": 97, "fenceM": { "lf": 2.6, "cf": 2.6, "rf": 2.6 }, "wind": "산바람(저녁, 외야→내야)", "climate": "여름 습함", "foul": "좁음", "parkNote": "좁은 파울 지역 → 타자 유리, 저녁 맞바람에 홈런 약간↓" },
    "mascot": "줄범이 — 등에 우승기 아홉 장을 멘 호랑이. 가을이 오면 목소리가 커짐",
    "colors": { "primary": "#A8242C", "secondary": "#17161A", "accent": "#F0E2C3" },
    "colorNames": { "primary": "가을 빨강", "secondary": "검정 바지", "accent": "줄무늬 크림" },
    "emblemIdea": "홈플레이트 오각형(끝이 아래) 안에 호랑이 이마 무늬 — 굵기가 다른 가로줄 셋 + 가운데 세로줄, 위 두 모서리에 세모 귀. 빨강 면 + 검정 줄 + 크림 테.",
    "style": "가을 왕조 — 큰 경기에 강한 팀",
    "styleKey": "dynasty",
    "styleDesc": "철벽 마운드에 거포와 발까지. 한별 시리즈에 아홉 번 나가 아홉 번 모두 이김",
    "tier": "강",
    "founded": 1982,
    "era": [1982, 2000],
    "homes": [{ "from": 1982, "to": 2000, "region": "광주" }],
    "revives": "GJ",
    "blurb": "한별 시리즈 9전 9승 — 가을이면 지지 않던 원년 구단",
    "rival": "DG",
    "rivalry": "영호남 더비",
    "titles": [1983, 1986, 1987, 1988, 1989, 1991, 1993, 1996, 1997],
    "goldenEras": [
      { "years": "1986–1989", "label": "호랑이 4연패", "desc": "네 해 연속 우승", "legendSeason": 1989 },
      { "years": "1996–1997", "label": "마지막 2연패", "desc": "아홉 번째 우승 — 한별 시리즈 9전 9승", "legendSeason": 1997 }
    ]
  },
  {
    "code": "HBE",
    "name": "한밭 독수리스",
    "short": "독수리스",
    "region": "daejeon",
    "regionName": "대전",
    "regionGroup": "jungbu",
    "stadium": "보문 필드",
    "stadiumDesc": "보문산 아래 옛 대전 구장. 가운데 담장이 짧아 큰 타구가 잘 넘어감",
    "stadiumTraits": { "roof": "개방", "surface": "천연잔디", "lf": 98, "cf": 114, "rf": 98, "fenceM": { "lf": 2.8, "cf": 2.8, "rf": 2.8 }, "wind": "내륙 약풍", "climate": "보통", "foul": "보통", "parkNote": "짧은 가운데 담장 → 홈런↑" },
    "mascot": "보문이 — 날개를 접고 있다가 홈런이 나오면 활짝 펴는 아기 독수리",
    "colors": { "primary": "#D06A22", "secondary": "#22305A", "accent": "#F4E6C8" },
    "colorNames": { "primary": "불꽃 주황", "secondary": "밤 남색", "accent": "깃털 크림" },
    "emblemIdea": "야구장 다이아몬드(마름모) 위로 날개를 활짝 편 독수리 — 날개는 셰브론 깃털 석 장씩, 가운데 세모 머리. 주황 날개 + 남색 다이아몬드 + 크림 눈.",
    "style": "불꽃 타선 — 한 방의 팀",
    "styleKey": "dynamite",
    "styleDesc": "홈런·OPS 1위 단골. 다섯 시즌 동안 한별 시리즈에 네 번",
    "tier": "중",
    "founded": 1986,
    "era": [1986, 1993],
    "homes": [{ "from": 1986, "to": 1993, "region": "대전" }],
    "revives": "DJ",
    "blurb": "창단 3년 만에 한별 시리즈 — 그 뒤 다섯 해 동안 네 번 가을 무대에 섰다",
    "rival": "MDH",
    "rivalry": "가을 맞수",
    "titles": [],
    "goldenEras": [
      { "years": "1988–1992", "label": "가을 단골", "desc": "다섯 시즌 동안 한별 시리즈 네 번 · 정규 1위 두 번", "legendSeason": 1989 },
      { "years": "1992", "label": "81승의 해", "desc": "정규 1위 · 마운드 왕국", "legendSeason": 1992 }
    ]
  },
  {
    "code": "SCR",
    "name": "서울 청룡스",
    "short": "청룡스",
    "region": "seoul",
    "regionName": "서울",
    "regionGroup": "han",
    "stadium": "청계 그라운드",
    "stadiumDesc": "개천을 낀 옛 서울 구장. 파울 지역이 넓어 뜬공이 잘 잡힘",
    "stadiumTraits": { "roof": "개방", "surface": "천연잔디", "lf": 99, "cf": 120, "rf": 99, "fenceM": { "lf": 2.6, "cf": 2.6, "rf": 2.6 }, "wind": "도심 약풍", "climate": "보통", "foul": "넓음", "parkNote": "넓은 파울 지역 → 투수 유리" },
    "mascot": "푸름이 — 여의주 대신 야구공을 문 푸른 용. 경기 전 구장 위를 한 바퀴",
    "colors": { "primary": "#1E3F86", "secondary": "#F2EEE4", "accent": "#D23B3B" },
    "colorNames": { "primary": "용 코발트", "secondary": "구름 흰색", "accent": "여의주 빨강" },
    "emblemIdea": "팔각 패치 안에 S자로 휘감은 용 몸통 — 등에 세모 비늘, 머리 앞에 빨강 여의주(야구공).",
    "style": "원년 서울 구단 — 뛰는 야구",
    "styleKey": "speed",
    "styleDesc": "도루·기동력 상위 단골. 서울에서 가장 먼저 사랑받은 인기 구단",
    "tier": "중",
    "founded": 1982,
    "era": [1982, 1989],
    "homes": [{ "from": 1982, "to": 1989, "region": "서울" }],
    "revives": "ST",
    "blurb": "원년부터 서울을 지킨 인기 구단 — 1983 정규 1위로 한별 시리즈에",
    "rival": "DDG",
    "rivalry": "동대문 더비",
    "titles": [],
    "goldenEras": [
      { "years": "1983", "label": "청룡의 가을", "desc": "정규 1위 · 한별 시리즈 준우승", "legendSeason": 1983 }
    ]
  },
  {
    "code": "ISB",
    "name": "인천 슈퍼별즈",
    "short": "슈퍼별즈",
    "region": "incheon",
    "regionName": "인천",
    "regionGroup": "han",
    "stadium": "제물포 구장",
    "stadiumDesc": "옛 항구 곁 인천 구장. 바닷바람이 외야로 불어 나감",
    "stadiumTraits": { "roof": "개방", "surface": "천연잔디", "lf": 95, "cf": 115, "rf": 95, "fenceM": { "lf": 2.4, "cf": 2.4, "rf": 2.4 }, "wind": "바닷바람(바다→외야)", "climate": "해양성", "foul": "좁음", "parkNote": "짧은 담장 + 바닷바람 → 홈런 변동 큼" },
    "mascot": "반짝이 — 망토를 두른 별. 진 날에도 끝까지 손을 흔듦",
    "colors": { "primary": "#2E7CC4", "secondary": "#D93A33", "accent": "#F3C641" },
    "colorNames": { "primary": "하늘 파랑", "secondary": "망토 빨강", "accent": "별 노랑" },
    "emblemIdea": "꼬리 달린 큰 별(혜성) — 노랑 다섯 꼭짓점 별 뒤로 빨강·파랑 속도선 석 줄.",
    "style": "언더독 — 지고도 사랑받는 팀",
    "styleKey": "underdog",
    "styleDesc": "약한 전력을 발과 끈기로 버팀. 에이스 한 명이 마운드를 짊어진 해도 있었음",
    "tier": "약",
    "founded": 1982,
    "era": [1982, 1985],
    "homes": [{ "from": 1982, "to": 1985, "region": "인천" }],
    "revives": "IC",
    "blurb": "원년 인천 구단. 지고 또 져도 응원석이 비지 않던 슈퍼별 — 1985 시즌 도중 이름을 넘겼다",
    "rival": "SCR",
    "rivalry": "경인 더비",
    "titles": [],
    "goldenEras": [
      { "years": "1983", "label": "반짝 슈퍼별", "desc": "정규 3위 — 구단 최고 시즌", "legendSeason": 1983 }
    ]
  },
  {
    "code": "IJR",
    "name": "인천 조랑말스",
    "short": "조랑말스",
    "region": "incheon",
    "regionName": "인천",
    "regionGroup": "han",
    "stadium": "제물포 구장",
    "stadiumDesc": "옛 항구 곁 인천 구장. 슈퍼별즈에게서 이어받은 바닷바람 구장",
    "stadiumTraits": { "roof": "개방", "surface": "천연잔디", "lf": 95, "cf": 115, "rf": 95, "fenceM": { "lf": 2.4, "cf": 2.4, "rf": 2.4 }, "wind": "바닷바람(바다→외야)", "climate": "해양성", "foul": "좁음", "parkNote": "짧은 담장 + 바닷바람 → 홈런 변동 큼" },
    "mascot": "얼룩이 — 얼룩무늬 조랑말. 도루 사인이 나면 앞발을 구름",
    "colors": { "primary": "#2F7556", "secondary": "#F1E6CF", "accent": "#8B4A26" },
    "colorNames": { "primary": "풀밭 초록", "secondary": "얼룩 크림", "accent": "안장 갈색" },
    "emblemIdea": "말발굽(U자) 안에 얼룩무늬 조랑말 옆얼굴 — 갈기는 톱니, 말발굽 못 자리는 작은 네모.",
    "style": "조랑말 작전 — 짧고 빠른 야구",
    "styleKey": "trick",
    "styleDesc": "번트·도루·치고 달리기. 세 시즌 동안 작전으로 버팀",
    "tier": "약",
    "founded": 1985,
    "era": [1985, 1987],
    "homes": [{ "from": 1985, "to": 1987, "region": "인천" }],
    "revives": "IC",
    "blurb": "1985 시즌 도중 슈퍼별즈를 이어받아 인천을 지킨 세 시즌",
    "rival": "SCR",
    "rivalry": "경인 더비",
    "titles": [],
    "goldenEras": [
      { "years": "1985", "label": "조랑말 출발", "desc": "시즌 도중 이어받아 후기 4위", "legendSeason": 1985 }
    ]
  },
  {
    "code": "IDR",
    "name": "인천 돌고래스",
    "short": "돌고래스",
    "region": "incheon",
    "regionName": "인천",
    "regionGroup": "han",
    "stadium": "제물포 구장",
    "stadiumDesc": "옛 항구 곁 인천 구장. 돌고래스 시절 외야 끝에 등대 모양 전광판",
    "stadiumTraits": { "roof": "개방", "surface": "천연잔디", "lf": 95, "cf": 115, "rf": 95, "fenceM": { "lf": 2.4, "cf": 2.4, "rf": 2.4 }, "wind": "바닷바람(바다→외야)", "climate": "해양성", "foul": "좁음", "parkNote": "짧은 담장 + 바닷바람 → 홈런 변동 큼" },
    "mascot": "물보라 — 삼진을 잡으면 공중제비를 도는 돌고래",
    "colors": { "primary": "#1C7C9C", "secondary": "#F2EEE2", "accent": "#EE7A33" },
    "colorNames": { "primary": "바다 청록", "secondary": "물보라 흰색", "accent": "등대 주황" },
    "emblemIdea": "반원 파도 위로 활처럼 휜 돌고래 — 주둥이 끝에 야구공, 아래 파도 두 줄.",
    "style": "짠물 마운드 — 실점이 적은 팀",
    "styleKey": "saltwater",
    "styleDesc": "제구와 변화구로 버티는 투수진. 최하위 다음 해 3위로 뛰어오른 돌풍",
    "tier": "약",
    "founded": 1988,
    "era": [1988, 1995],
    "homes": [{ "from": 1988, "to": 1995, "region": "인천" }],
    "revives": "IC",
    "blurb": "인천 구단의 세 번째 이름 — 1994 한별 시리즈까지 올랐다",
    "rival": "ST",
    "rivalry": "경인 더비",
    "titles": [],
    "goldenEras": [
      { "years": "1989", "label": "첫 가을", "desc": "최하위 다음 해 3위 · 마운드 왕국", "legendSeason": 1989 },
      { "years": "1994", "label": "돌고래의 가을", "desc": "정규 2위 · 한별 시리즈 준우승", "legendSeason": 1994 }
    ]
  },
  {
    "code": "SUC",
    "name": "수원 일각수스",
    "short": "일각수스",
    "region": "suwon",
    "regionName": "수원",
    "regionGroup": "jungbu",
    "stadium": "장안 구장",
    "stadiumDesc": "성곽 북문 가까운 옛 수원 구장. 관중석은 작아도 우승기는 많다",
    "stadiumTraits": { "roof": "개방", "surface": "천연잔디", "lf": 98, "cf": 120, "rf": 98, "fenceM": { "lf": 2.8, "cf": 2.8, "rf": 2.8 }, "wind": "내륙 약풍", "climate": "보통", "foul": "보통", "parkNote": "중립 구장 — 큰 쏠림 없음" },
    "mascot": "은뿔이 — 우승할 때마다 뿔에 별을 하나씩 다는 일각수",
    "colors": { "primary": "#3A3F8F", "secondary": "#E9E4D6", "accent": "#D8A73A" },
    "colorNames": { "primary": "왕조 남보라", "secondary": "은빛 크림", "accent": "뿔 금색" },
    "emblemIdea": "마름모(다이아몬드) 배지 위 꼭짓점으로 솟은 꼬인 뿔 + 안쪽 말 옆얼굴. 남보라 면 + 금 뿔 + 크림 테.",
    "style": "투타 완성 — 2000년대 왕조",
    "styleKey": "twoway",
    "styleDesc": "마운드 왕국에 거포까지. 열두 시즌에 우승 네 번",
    "tier": "강",
    "founded": 1996,
    "era": [1996, 2007],
    "homes": [{ "from": 1996, "to": 1999, "region": "인천" }, { "from": 2000, "to": 2007, "region": "수원" }],
    "revives": "SW",
    "blurb": "인천에서 출발해 2000년 수원으로 — 열두 시즌에 우승 네 번",
    "rival": "DG",
    "rivalry": "왕좌 다툼",
    "titles": [1998, 2000, 2003, 2004],
    "goldenEras": [
      { "years": "1998", "label": "일각수 첫 우승", "desc": "인천 시절 통합 우승 · 마운드 왕국", "legendSeason": 1998 },
      { "years": "2000", "label": "91승의 해", "desc": "91승 2무 40패 — 통합 우승", "legendSeason": 2000 },
      { "years": "2003–2004", "label": "일각수 2연패", "desc": "두 해 연속 통합 우승", "legendSeason": 2004 }
    ]
  },
  {
    "code": "JDR",
    "name": "전주 돌격대스",
    "short": "돌격대스",
    "region": "jeonju",
    "regionName": "전주",
    "regionGroup": "jungbu",
    "stadium": "덕진 구장",
    "stadiumDesc": "연못 공원 곁 작은 옛 구장. 리그에서 가장 짧은 담장",
    "stadiumTraits": { "roof": "개방", "surface": "천연잔디", "lf": 94, "cf": 114, "rf": 94, "fenceM": { "lf": 2.2, "cf": 2.2, "rf": 2.2 }, "wind": "분지 약풍", "climate": "여름 더위", "foul": "좁음", "parkNote": "가장 작은 구장 → 홈런↑" },
    "mascot": "나팔이 — 돌격 나팔을 든 꼬마 대장. 도루 때 나팔을 붐",
    "colors": { "primary": "#D9A62B", "secondary": "#1E1C1A", "accent": "#B63A2C" },
    "colorNames": { "primary": "돌격 노랑", "secondary": "검정", "accent": "깃발 빨강" },
    "emblemIdea": "둥근 모서리 사각 패치 안에서 오른쪽으로 내닫는 화살촉 셰브론 + 뒤로 속도선 석 줄.",
    "style": "돌격 야구 — 발로 흔드는 팀",
    "styleKey": "raid",
    "styleDesc": "기동력 상위 단골. 1996년 최하위권에서 정규 2위로 뛰어오른 돌풍",
    "tier": "약",
    "founded": 1991,
    "era": [1991, 1999],
    "homes": [{ "from": 1991, "to": 1999, "region": "전주" }],
    "revives": "IC",
    "blurb": "전주의 프로 구단. 1996 정규 2위 돌풍 — 1999 시즌을 끝으로 해체, 선수단은 인천 비룡스로",
    "rival": "MDH",
    "rivalry": "호남 더비",
    "titles": [],
    "goldenEras": [
      { "years": "1996", "label": "돌격대 돌풍", "desc": "최하위 다음 해 정규 2위", "legendSeason": 1996 }
    ]
  },
  {
    "code": "IBY",
    "name": "인천 비룡스",
    "short": "비룡스",
    "region": "incheon",
    "regionName": "인천",
    "regionGroup": "han",
    "stadium": "소래 필드",
    "stadiumDesc": "포구 바람이 드는 인천 구장. 좌우 담장이 짧음",
    "stadiumTraits": { "roof": "개방", "surface": "천연잔디", "lf": 95, "cf": 120, "rf": 95, "fenceM": { "lf": 2.4, "cf": 2.4, "rf": 2.4 }, "wind": "해안 바람(경기마다 다름)", "climate": "해양성", "foul": "보통", "parkNote": "짧은 좌우 담장 → 당겨친 홈런↑" },
    "mascot": "날개 — 끝내기 때 불꽃을 뿜는 날개 달린 꼬마 용",
    "colors": { "primary": "#CF4A2A", "secondary": "#F3EBDD", "accent": "#E0A63A" },
    "colorNames": { "primary": "비룡 빨강", "secondary": "구름 크림", "accent": "비늘 금색" },
    "emblemIdea": "야구공 왼쪽으로 박쥐 날개 같은 비룡 날개 하나, 오른쪽으로 말린 꼬리 — 날개 막은 빨강, 뼈대는 금.",
    "style": "그물 수비 — 비룡 왕조",
    "styleKey": "net",
    "styleDesc": "빈틈없는 수비와 불펜으로 지키는 야구. 네 해 동안 우승 세 번",
    "tier": "강",
    "founded": 2000,
    "era": [2000, 2020],
    "homes": [{ "from": 2000, "to": 2020, "region": "인천" }],
    "revives": "IC",
    "blurb": "2000년 인천에서 창단 — 2007~2010 왕조, 2020 시즌을 끝으로 지금 인천 구단에 이름을 넘겼다",
    "rival": "SB",
    "rivalry": "가을 맞수",
    "titles": [2007, 2008, 2010, 2018],
    "goldenEras": [
      { "years": "2007–2010", "label": "비룡 왕조", "desc": "네 해 동안 우승 세 번 · 준우승 한 번", "legendSeason": 2010 },
      { "years": "2018", "label": "마지막 비상", "desc": "정규 2위에서 우승", "legendSeason": 2018 }
    ]
  }
] as const;

/** 현재 구단 10 + 옛 구단 10 (카드·연도팩·구단팩·세트덱은 이 20개 전부) */
export const ALL_CLUBS = [...CLUBS, ...OLD_CLUBS];
export type CurrentCode = (typeof CLUBS)[number]['code'];
export type OldCode = (typeof OLD_CLUBS)[number]['code'];
export type ClubCode = CurrentCode | OldCode;

/** 첫 시즌 · 지금 시즌 */
export const FIRST_SEASON = 1982;
export const CURRENT_SEASON = 2027;

/** 계보 — 같은 줄 = 이어진 구단 (오래된 순). 전주 돌격대스는 해체(선수단은 인천 비룡스가 이어받음) */
export const LINEAGE: readonly (readonly ClubCode[])[] = [
  ['DDG', 'SB'], ['MDH', 'GJ'], ['HBE', 'DJ'], ['SCR', 'ST'], ['ISB', 'IJR', 'IDR', 'SUC'], ['IBY', 'IC'],
  ['JDR'], ['DG'], ['BS'], ['SH'], ['CW'], ['SW'],
];

const clubInfo = (code: string) => ALL_CLUBS.find((c) => c.code === code);
/** 옛 구단인가 */
export const isOldCode = (code: string): code is OldCode => OLD_CLUBS.some((c) => c.code === code);
/** 그 이름으로 뛴 해 [첫 해, 끝 해] — 현재 구단은 끝 해가 2027 */
export const eraOfCode = (code: string): readonly [number, number] => clubInfo(code)?.era ?? [FIRST_SEASON, CURRENT_SEASON];
/** 그 해 리그에 있던 구단인가 (1985 은 시즌 도중 바뀌어 슈퍼별즈·조랑말스 둘 다) */
export const existedIn = (code: string, year: number) => { const [a, b] = eraOfCode(code); return year >= a && year <= b; };
/** 그 해 리그에 있던 구단 코드 */
export const clubsIn = (year: number): ClubCode[] => ALL_CLUBS.filter((c) => year >= c.era[0] && year <= c.era[1]).map((c) => c.code);
/** 좁은 곳 이름 — 옛 구단 가운데 현재 구단과 별명이 같은 곳(곰스·호랑이즈·독수리스)은 옛 지역 이름까지 붙인다 */
export function shortLabel(code: string): string {
  const c = clubInfo(code);
  if (!c) return code;
  return isOldCode(code) && ALL_CLUBS.some((x) => x.code !== code && x.short === c.short) ? c.name : c.short;
}

/** 특별 선수로 고를 수 있는 이름 11명 (요구사항 29번 — 사용자 지정, 실명 금지 규칙의 예외) */
export const SPECIAL_PLAYER_NAMES = ["이동규", "엄승재", "박광원", "한유락", "신희준", "김범수", "이상준", "박정환", "김정호", "홍한길", "장재관"] as const;
