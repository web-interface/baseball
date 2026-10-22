// 세계관 — scratchpad/fd/out/04_world.json (세계관 작가 · 사용자 확정 구단 이름 34번)에서 옮긴 값. 고칠 땐 원본과 같이.
// 화면에는 '대전 독수리스'처럼 전체 이름, 좁은 곳(점수판)은 짧은 이름('독수리스'). 실제 구단 이름은 어디에도 쓰지 않는다.

export const LEAGUE = {
  "name": "한별 리그",
  "fullName": "한별 프로야구 리그",
  "founded": 1985,
  "season": "정규시즌 135경기(상대 구단마다 15경기), 4월 개막 ~ 9월 말, 10월 가을야구",
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
    "founded": 1988,
    "rival": "SW",
    "rivalry": "경부선 더비",
    "titles": [
      1998,
      2001,
      2006,
      2015,
      2024,
      2025
    ],
    "goldenEras": [
      {
        "years": "1998–2006",
        "label": "발톱 시대",
        "desc": "9년 동안 우승 3회, 선발 4명이 모두 두 자릿수 승리",
        "legendSeason": 2006
      },
      {
        "years": "2024–2025",
        "label": "독수리 2연패",
        "desc": "창단 첫 2연패, 통산 6회",
        "legendSeason": 2025
      }
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
    "founded": 1985,
    "rival": "DG",
    "rivalry": "영호남 더비",
    "titles": [
      1990,
      1995,
      2000,
      2005,
      2012,
      2019
    ],
    "goldenEras": [
      {
        "years": "1990–1995",
        "label": "포효 시대",
        "desc": "6년 동안 우승 2회, 팀 타율 1위 5번",
        "legendSeason": 1995
      },
      {
        "years": "2019",
        "label": "줄무늬의 귀환",
        "desc": "7년 만의 우승, 통산 6회",
        "legendSeason": 2019
      }
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
    "styleDesc": "약점 없는 전력과 큰 경기 경험. 리그 최다 우승(9회)",
    "tier": "강",
    "founded": 1985,
    "rival": "GJ",
    "rivalry": "영호남 더비",
    "titles": [
      1986,
      1989,
      1992,
      1993,
      1994,
      2007,
      2010,
      2017,
      2023
    ],
    "goldenEras": [
      {
        "years": "1992–1994",
        "label": "갈기 왕조",
        "desc": "리그 유일의 3연패",
        "legendSeason": 1994
      },
      {
        "years": "2023",
        "label": "갈기 부활",
        "desc": "6년 만의 우승, 통산 9회(최다)",
        "legendSeason": 2023
      }
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
    "founded": 1985,
    "rival": "CW",
    "rivalry": "남해안 더비",
    "titles": [
      1987,
      1999,
      2011,
      2021
    ],
    "goldenEras": [
      {
        "years": "1987",
        "label": "첫 거인",
        "desc": "창단 3년 만의 첫 우승",
        "legendSeason": 1987
      },
      {
        "years": "2021",
        "label": "부두의 함성",
        "desc": "팀 홈런 218개로 10년 만의 우승",
        "legendSeason": 2021
      }
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
    "founded": 1985,
    "rival": "ST",
    "rivalry": "한강 더비",
    "titles": [
      1985,
      1997,
      2004,
      2009,
      2018
    ],
    "goldenEras": [
      {
        "years": "1985",
        "label": "원년 챔피언",
        "desc": "리그 원년 초대 우승",
        "legendSeason": 1985
      },
      {
        "years": "2004–2009",
        "label": "곰발 시대",
        "desc": "6년 동안 우승 2회, 팀 출루율 1위 4번",
        "legendSeason": 2009
      }
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
    "founded": 1985,
    "rival": "SB",
    "rivalry": "한강 더비",
    "titles": [
      1988,
      1991,
      2002,
      2008,
      2013,
      2020,
      2026
    ],
    "goldenEras": [
      {
        "years": "1988–1991",
        "label": "쌍둥이 별",
        "desc": "4년 동안 우승 2회",
        "legendSeason": 1991
      },
      {
        "years": "2020–2026",
        "label": "쌍둥이 왕국",
        "desc": "7년 동안 우승 2회, 2026 디펜딩 챔피언",
        "legendSeason": 2026
      }
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
    "founded": 2003,
    "rival": "IC",
    "rivalry": "경인 더비",
    "titles": [
      2014
    ],
    "goldenEras": [
      {
        "years": "2008",
        "label": "첫 가을",
        "desc": "창단 6년 만의 첫 가을야구",
        "legendSeason": 2008
      },
      {
        "years": "2014",
        "label": "돔의 영웅들",
        "desc": "창단 첫 우승",
        "legendSeason": 2014
      }
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
    "founded": 1985,
    "rival": "SH",
    "rivalry": "경인 더비",
    "titles": [
      1996,
      2003,
      2016
    ],
    "goldenEras": [
      {
        "years": "1996",
        "label": "첫 상륙",
        "desc": "창단 12년 만의 첫 우승",
        "legendSeason": 1996
      },
      {
        "years": "2016",
        "label": "해안 포대",
        "desc": "팀 홈런 1위·외국인 에이스 18승으로 세 번째 우승",
        "legendSeason": 2016
      }
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
    "founded": 2012,
    "rival": "BS",
    "rivalry": "남해안 더비",
    "titles": [
      2022
    ],
    "goldenEras": [
      {
        "years": "2017",
        "label": "첫 발자국",
        "desc": "창단 5년 만의 첫 가을야구",
        "legendSeason": 2017
      },
      {
        "years": "2022",
        "label": "공룡의 포효",
        "desc": "팀 평균자책점 1위로 창단 첫 우승",
        "legendSeason": 2022
      }
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
    "founded": 2016,
    "rival": "DJ",
    "rivalry": "경부선 더비",
    "titles": [],
    "goldenEras": [
      {
        "years": "2019",
        "label": "첫 주문",
        "desc": "창단 4년 만의 첫 가을야구",
        "legendSeason": 2019
      },
      {
        "years": "2025",
        "label": "마법의 가을",
        "desc": "정규시즌 2위, 구단 최고 성적",
        "legendSeason": 2025
      }
    ]
  }
] as const;

export type ClubCode = (typeof CLUBS)[number]['code'];

/** 특별 선수로 고를 수 있는 이름 11명 (요구사항 29번 — 사용자 지정, 실명 금지 규칙의 예외) */
export const SPECIAL_PLAYER_NAMES = ["이동규", "엄승재", "박광원", "한유락", "신희준", "김범수", "이상준", "박정환", "김정호", "홍한길", "장재관"] as const;
