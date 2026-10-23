"""실명 → '알아볼 수 있는' 바뀐 이름 (규칙은 이 파일 한 곳에만 둔다).

규칙 (docs/실제선수데이터.md 2절과 같음)
  · 성(첫 글자)은 그대로. 바꾸는 곳은 '이름의 마지막 한글 음절'부터 앞으로 한 음절씩.
    외국인(띄어 쓴 이름)도 같은 방식 — 전체 표기의 마지막 한글 음절부터.
  · 한 음절에서 시도하는 순서 (처음으로 '쓸 수 있는' 결과를 고른다)
      1) 모음 짝 바꾸기  ㅏ↔ㅑ ㅓ↔ㅕ ㅗ↔ㅛ ㅜ↔ㅠ ㅐ↔ㅔ ㅒ↔ㅖ ㅘ↔ㅝ ㅙ↔ㅞ ㅚ→ㅙ
      2) 받침 하나 바꾸기 ㄴ↔ㅇ ㄱ→ㅇ ㄹ→ㄴ ㅁ→ㄴ ㅂ→ㅁ ㅅ→ㄷ (받침 없음 → ㄴ)
      3) 덜 자연스러운 모음 ㅣ→ㅟ ㅡ→ㅜ ㅢ→ㅡ ㅟ→ㅜ ㅚ→ㅞ
      4) 받침 두 번째 후보 ㄴ→ㅁ ㅇ→ㅁ ㄱ→ㄴ ㄹ→ㅁ (받침 없음 → ㅇ)
      5) 첫소리 짝 ㄱ↔ㅋ ㄷ↔ㅌ ㅂ↔ㅍ ㅈ↔ㅊ ㅅ→ㅆ ㅎ↔ㅇ ㄴ↔ㄹ ㅁ→ㅂ   (흔한 동명이인이 많을 때만 여기까지 감)
      6) 1)+2) 함께 (모음 짝과 받침을 같이)
  · '쓸 수 있는' = (가) 실제 선수 이름 전체(목록의 모든 문서 이름, 괄호 뺀 것)와 다르고
                   (나) 특별 선수 이름 11개와 다르고 (다) 이미 다른 선수에게 준 바뀐 이름과 다르다.
    → 동명이인은 pid 순서로 앞 사람이 1번째 후보, 다음 사람이 그다음 후보를 받는다.
  · 결정적: 같은 입력(이름 목록) → 같은 출력. 무작위 없음.
"""
import re

CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"
JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ"
JONG = ["", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"]

VOWEL_1 = {"ㅏ": "ㅑ", "ㅑ": "ㅏ", "ㅓ": "ㅕ", "ㅕ": "ㅓ", "ㅗ": "ㅛ", "ㅛ": "ㅗ", "ㅜ": "ㅠ", "ㅠ": "ㅜ",
           "ㅐ": "ㅔ", "ㅔ": "ㅐ", "ㅒ": "ㅖ", "ㅖ": "ㅒ", "ㅘ": "ㅝ", "ㅝ": "ㅘ", "ㅙ": "ㅞ", "ㅞ": "ㅙ", "ㅚ": "ㅙ"}
BATCHIM_1 = {"ㄴ": "ㅇ", "ㅇ": "ㄴ", "ㄱ": "ㅇ", "ㄹ": "ㄴ", "ㅁ": "ㄴ", "ㅂ": "ㅁ", "ㅅ": "ㄷ", "": "ㄴ"}
VOWEL_2 = {"ㅣ": "ㅟ", "ㅡ": "ㅜ", "ㅢ": "ㅡ", "ㅟ": "ㅜ", "ㅚ": "ㅞ"}
BATCHIM_2 = {"ㄴ": "ㅁ", "ㅇ": "ㅁ", "ㄱ": "ㄴ", "ㄹ": "ㅁ", "": "ㅇ"}
CHO_1 = {"ㄱ": "ㅋ", "ㅋ": "ㄱ", "ㄷ": "ㅌ", "ㅌ": "ㄷ", "ㅂ": "ㅍ", "ㅍ": "ㅂ", "ㅈ": "ㅊ", "ㅊ": "ㅈ", "ㅅ": "ㅆ", "ㅎ": "ㅇ", "ㅇ": "ㅎ",
         "ㄴ": "ㄹ", "ㄹ": "ㄴ", "ㅁ": "ㅂ"}

SPECIAL_NAMES = ["이동규", "엄승재", "박광원", "한유락", "신희준", "김범수", "이상준", "박정환", "김정호", "홍한길", "장재관"]


def split(ch):
    c = ord(ch) - 0xAC00
    if not 0 <= c < 11172:
        return None
    return CHO[c // 588], JUNG[(c % 588) // 28], JONG[c % 28]


def join(cho, jung, jong):
    return chr(0xAC00 + CHO.index(cho) * 588 + JUNG.index(jung) * 28 + JONG.index(jong))


def syllable_variants(ch):
    """한 음절을 바꾸는 후보 [(단계, 바뀐 음절)] (규칙 1~6 순서)"""
    s = split(ch)
    if not s:
        return []
    cho, jung, jong = s
    out = []
    if jung in VOWEL_1:
        out.append((1, join(cho, VOWEL_1[jung], jong)))
    if jong in BATCHIM_1:
        out.append((2, join(cho, jung, BATCHIM_1[jong])))
    if jung in VOWEL_2:
        out.append((3, join(cho, VOWEL_2[jung], jong)))
    if jong in BATCHIM_2:
        out.append((4, join(cho, jung, BATCHIM_2[jong])))
    if cho in CHO_1:
        out.append((5, join(CHO_1[cho], jung, jong)))
    if jung in VOWEL_1 and jong in BATCHIM_1:
        out.append((6, join(cho, VOWEL_1[jung], BATCHIM_1[jong])))
    seen, res = set(), []
    for t, x in out:
        if x != ch and x not in seen:
            seen.add(x)
            res.append((t, x))
    return res


def real_name(title):
    """문서 이름 → 사람 이름 (괄호 구분자 뺌)"""
    return re.sub(r"\s*\([^)]*\)\s*$", "", title).strip()


def candidates(name):
    """바뀐 이름 후보 — 단계(1~6)가 낮은 것부터, 같은 단계면 마지막 음절부터 앞으로 (성 = 첫 글자는 건드리지 않음)"""
    idx = [i for i, ch in enumerate(name) if split(ch)]
    if len(idx) >= 2 and " " not in name:
        idx = idx[1:]          # 한국식 이름: 성(첫 글자) 제외
    found = []
    for order, i in enumerate(reversed(idx)):
        for t, v in syllable_variants(name[i]):
            found.append((t, order, name[:i] + v + name[i + 1:]))
    found.sort(key=lambda x: (x[0], x[1]))
    return [x[2] for x in found]


def assign(pairs, real_names):
    """pairs: [(pid, 실명)] — pid 순으로 바뀐 이름을 정한다. real_names: 실제 이름 전체 집합"""
    taken = set(real_names) | set(SPECIAL_NAMES)
    out, fail = {}, []
    for pid, name in sorted(pairs):
        got = None
        for c in candidates(name):
            if c not in taken:
                got = c
                break
        if got is None:
            fail.append(pid)
            continue
        taken.add(got)
        out[pid] = got
    return out, fail
