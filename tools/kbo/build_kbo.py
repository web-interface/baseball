"""실제 KBO 기록(나무위키 파싱 결과) → 게임 선수 카탈로그 (실명 없음).

입력 (이 컴퓨터에만 — 실명이 들어 있어 저장소에 넣지 않음)
  <KBO>/players_list.tsv · players.csv · seasons_batting.csv · seasons_pitching.csv · raw/*.html (수상 틀)
  web/src/game/data/club-seasons.json (리그 연도 평균 · 구단 코드)
출력 (저장소 — 바뀐 이름 · 고정 ID · 기록만)
  web/src/game/data/kbo/core.json      선수 본체 + 시즌 요약(카드 능력치·카드 뒷면 기록) + 카드 목록   ← 앱 시작 때 따로 불러옴
  web/src/game/data/kbo/rec-<0~f>.json 선수 ID 앞자리(k 다음 글자)별 연도별 상세 기록 (선수 정보 '실제 기록' 탭에서만)
  tools/kbo/out/report.json            규모·매핑 누락·검증용 숫자 (실명 없음)
사용  py -I -X utf8 tools/kbo/build_kbo.py [--kbo <폴더>]    (네트워크 안 씀 · 같은 입력 → 같은 출력)
규칙  docs/실제선수데이터.md
"""
import argparse
import collections
import csv
import hashlib
import json
import math
import pathlib
import re
import sys
import urllib.parse

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent.parent
sys.path.insert(0, str(HERE))
import awards as AW  # noqa: E402
import names as NM  # noqa: E402

DEFAULT_KBO = pathlib.Path(r"C:\Users\kbs\AppData\Local\Temp\claude\C--Users-kbs\750aa473-e37b-4595-b153-c102e9d3836e\scratchpad\kbo")
OUT_DIR = REPO / "web" / "src" / "game" / "data" / "kbo"
CLUB_SEASONS = REPO / "web" / "src" / "game" / "data" / "club-seasons.json"
REPORT = HERE / "out" / "report.json"
LAST_REAL = 2026          # 실제 기록 마지막 해
SOURCE = "나무위키(CC BY-NC-SA 2.0 KR)"

# ───────────────────────── 1. 고정 선수 ID ─────────────────────────
# pid(문서 이름 SHA-1 앞 10자리) 의 해시 → 'k' + 6자리. 이름 규칙과 무관하게 고정. 겹치면 7자리로 늘림.
def kid_of(pid, n=6):
    return "k" + hashlib.sha1(("kbo-person:" + pid).encode()).hexdigest()[:n]


# ───────────────────────── 2. 실제 구단 → 가상 구단 코드 (연도별) ─────────────────────────
EARLY_HD = set()   # 1982~1984 HD 계보 구단 표기 (main 이 입력에서 채움 — 실제 구단 이름을 코드에 적지 않으려고)


def club_code(franchise, team, year):
    f = franchise
    if f == "SS":
        return "DG"
    if f == "LT":
        return "BS"
    if f == "HT":
        return "MDH" if year <= 2000 else "GJ"
    if f == "OB":
        return "DDG" if year <= 1998 else "SB"
    if f == "LG":
        return "SCR" if year <= 1989 else "ST"
    if f == "HH":
        return "HBE" if year <= 1993 else "DJ"
    if f == "SK":
        return "IBY" if year <= 2020 else "IC"
    if f == "HD":
        if year <= 1984:
            return "ISB"
        if year == 1985:
            # 시즌 도중 이름이 바뀐 해 — 1982~84 에 쓰던 표기로 시작하면 전기(ISB), 아니면 후기(IJR). 표기는 입력에서 배움(EARLY_HD)
            t = (team or "").strip()
            return "ISB" if any(t.startswith(x) for x in EARLY_HD) else "IJR"
        if year <= 1987:
            return "IJR"
        if year <= 1995:
            return "IDR"
        return "SUC" if year <= 2007 else None
    if f == "SB":
        return "JDR" if 1991 <= year <= 1999 else None
    if f == "WO":
        return "SH" if year >= 2008 else None
    if f == "NC":
        return "CW" if year >= 2013 else None
    if f == "KT":
        return "SW" if year >= 2015 else None
    return None


LINEAGE = [["DDG", "SB"], ["MDH", "GJ"], ["HBE", "DJ"], ["SCR", "ST"], ["ISB", "IJR", "IDR", "SUC"], ["IBY", "IC"],
           ["JDR"], ["DG"], ["BS"], ["SH"], ["CW"], ["SW"]]
LINE_OF = {c: i for i, row in enumerate(LINEAGE) for c in row}


# ───────────────────────── 숫자 ─────────────────────────
def f(v):
    try:
        x = float(v)
        return x if math.isfinite(x) else None
    except (TypeError, ValueError):
        return None


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def h01(*parts):
    """결정적 0~1 (선수 ID·용도 해시)"""
    return int(hashlib.sha1("|".join(map(str, parts)).encode()).hexdigest()[:8], 16) / 0xFFFFFFFF


def r1(x):
    return int(round(x))


# ───────────────────────── 읽기 ─────────────────────────
def read_inputs(kbo):
    plist = []
    with (kbo / "players_list.tsv").open(encoding="utf-8") as fi:
        next(fi)
        for line in fi:
            p = line.rstrip("\n").split("\t")
            if len(p) >= 3:
                plist.append((p[0], p[1], p[2]))
    players = {r["pid"]: r for r in csv.DictReader((kbo / "players.csv").open(encoding="utf-8-sig"))}
    bat = list(csv.DictReader((kbo / "seasons_batting.csv").open(encoding="utf-8-sig")))
    pit = list(csv.DictReader((kbo / "seasons_pitching.csv").open(encoding="utf-8-sig")))
    return plist, players, bat, pit


# ───────────────────────── 시즌 줄 정리 ─────────────────────────
def bat_row(r):
    g = f(r["G"]) or 0
    ab = f(r["AB"]) or f(r["AB_est"]) or 0
    pa = f(r["PA"]) or f(r["PA_est"]) or ab
    h = f(r["H"]) or 0
    d2, d3, hr = f(r["2B"]) or 0, f(r["3B"]) or 0, f(r["HR"]) or 0
    bb = f(r["BB"])
    if bb is None and f(r["BBHBP"]) is not None:
        bb = f(r["BBHBP"]) * 0.9
    obp = f(r["OBP"])
    if bb is None and obp is not None and pa:
        bb = max(0.0, obp * pa - h) * 0.9
    so = f(r["SO"])
    avg = h / ab if ab else (f(r["AVG"]) or 0)
    tb = h + d2 + 2 * d3 + 3 * hr
    slg = tb / ab if ab else (f(r["SLG"]) or 0)
    if obp is None:
        obp = (h + (bb or 0)) / pa if pa else 0
    return {
        "G": g, "PA": pa, "AB": ab, "R": f(r["R"]) or 0, "H": h, "D2": d2, "D3": d3, "HR": hr, "RBI": f(r["RBI"]) or 0,
        "SB": f(r["SB"]) or 0, "BB": bb, "SO": so, "AVG": avg, "OBP": obp, "SLG": slg,
        "WAR": f(r["WAR"]), "wRC+": f(r["wRC+"]),
    }


def pit_row(r):
    outs = f(r["IP_outs"])
    if outs is None:
        ip = f(r["IP"]) or 0
        outs = round(ip * 3)
    ip = outs / 3
    so, bb, hr, h = f(r["SO"]) or 0, f(r["BB"]), f(r["HR"]), f(r["H"]) or 0
    if bb is None and f(r["BBHBP"]) is not None:
        bb = f(r["BBHBP"]) * 0.92
    era = f(r["ERA"])
    if era is None:
        er = f(r["ER"])
        era = er * 9 / ip if (er is not None and ip) else None
    whip = f(r["WHIP"])
    if whip is None and ip and bb is not None:
        whip = (h + bb) / ip
    return {
        "G": f(r["G"]) or 0, "GS": f(r["GS"]), "W": f(r["W"]) or 0, "L": f(r["L"]) or 0, "SV": f(r["SV"]) or 0, "HLD": f(r["HLD"]) or 0,
        "outs": outs, "IP": ip, "H": h, "HR": hr, "BB": bb, "SO": so, "ERA": era, "WHIP": whip, "WAR": f(r["WAR"]),
    }


def sum_bat(rows):
    keys = ["G", "PA", "AB", "R", "H", "D2", "D3", "HR", "RBI", "SB"]
    s = {k: sum(r[k] for r in rows) for k in keys}
    s["BB"] = sum(r["BB"] for r in rows) if all(r["BB"] is not None for r in rows) else None
    s["SO"] = sum(r["SO"] for r in rows) if all(r["SO"] is not None for r in rows) else None
    s["AVG"] = s["H"] / s["AB"] if s["AB"] else 0
    s["SLG"] = (s["H"] + s["D2"] + 2 * s["D3"] + 3 * s["HR"]) / s["AB"] if s["AB"] else 0
    s["OBP"] = (sum(r["OBP"] * r["PA"] for r in rows) / s["PA"]) if s["PA"] else 0
    ws = [r["WAR"] for r in rows if r["WAR"] is not None]
    s["WAR"] = sum(ws) if ws else None
    return s


def sum_pit(rows):
    keys = ["G", "W", "L", "SV", "HLD", "outs", "H", "SO"]
    s = {k: sum(r[k] for r in rows) for k in keys}
    s["IP"] = s["outs"] / 3
    s["GS"] = sum(r["GS"] for r in rows) if all(r["GS"] is not None for r in rows) else None
    s["HR"] = sum(r["HR"] for r in rows) if all(r["HR"] is not None for r in rows) else None
    s["BB"] = sum(r["BB"] for r in rows) if all(r["BB"] is not None for r in rows) else None
    eras = [(r["ERA"], r["IP"]) for r in rows if r["ERA"] is not None]
    s["ERA"] = (sum(e * i for e, i in eras) / sum(i for _, i in eras)) if eras and sum(i for _, i in eras) else None
    s["WHIP"] = ((s["H"] + s["BB"]) / s["IP"]) if (s["IP"] and s["BB"] is not None) else None
    if s["WHIP"] is None:
        wh = [(r["WHIP"], r["IP"]) for r in rows if r["WHIP"] is not None]
        s["WHIP"] = (sum(w * i for w, i in wh) / sum(i for _, i in wh)) if wh and sum(i for _, i in wh) else None
    ws = [r["WAR"] for r in rows if r["WAR"] is not None]
    s["WAR"] = sum(ws) if ws else None
    return s


# ───────────────────────── 리그 환경 (연도별 평균 · 표준편차) ─────────────────────────
def year_means(entries, keys, weight_key, window=2):
    """entries: [(year, row)] → {year: {key: 가중 평균}} (앞뒤 window 해 묶어 매끈하게)"""
    by = collections.defaultdict(list)
    for y, r in entries:
        by[y].append(r)
    years = sorted(by)
    out = {}
    for y in years:
        pool = [r for yy in range(y - window, y + window + 1) for r in by.get(yy, [])]
        m = {}
        for k, num, den in keys:
            nn = sum(num(r) for r in pool if den(r) and num(r) is not None)
            dd = sum(den(r) for r in pool if den(r) and num(r) is not None)
            m[k] = nn / dd if dd else None
        out[y] = m
    return out


def pooled_sd(entries, means, key, rate, wkey, min_w):
    xs = []
    for y, r in entries:
        if r[wkey] >= min_w:
            v = rate(r)
            if v is not None and means[y].get(key) is not None:
                xs.append(v - means[y][key])
    if len(xs) < 5:
        return None
    mu = sum(xs) / len(xs)
    return math.sqrt(sum((x - mu) ** 2 for x in xs) / len(xs)) or None


# ───────────────────────── 포지션 ─────────────────────────
POS_GAME = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"]
POS_ADJ = {"C": 9, "SS": 7, "2B": 4, "CF": 4, "3B": 2, "1B": -4, "LF": -3, "RF": -2, "DH": -7}   # 600타석당 수비 보정(점)
POS_DEF = {"C": 62, "SS": 64, "2B": 62, "CF": 63, "3B": 60, "1B": 56, "LF": 57, "RF": 59, "DH": 42}
POS_ARM = {"C": 62, "SS": 63, "2B": 55, "CF": 60, "3B": 63, "1B": 50, "LF": 54, "RF": 66, "DH": 45}


def game_pos(p, kid, spd, pow_):
    """players.csv 의 주 포지션 → 게임 포지션 (IF·OF·UT 는 타격 성향으로 나눔)"""
    pos = p.get("pos") or ""
    allp = [x for x in (p.get("pos_all") or "").split("/") if x]
    if pos in POS_GAME:
        return pos
    spec = [x for x in allp if x in POS_GAME]
    if spec:
        return spec[0]
    if pos == "OF":
        return "CF" if spd >= 64 else ("RF" if h01(kid, "of") < 0.5 else "LF")
    if pos in ("IF", "UT"):
        if pow_ >= 66:
            return "3B" if h01(kid, "if") < 0.5 else "1B"
        return "SS" if spd >= 63 else "2B"
    return "DH" if pos == "DH" else "LF"


def sub_pos(p, main):
    allp = [x for x in (p.get("pos_all") or "").split("/") if x in POS_GAME and x != main]
    return allp[:2]


# ───────────────────────── 등급 (시즌 성적 백분위) ─────────────────────────
# 기획서 5.2: 한 시즌 300장 중 엘리트 20 · 레어 30 · 스페셜 90 · 노멀 160 → 위에서부터 6.7% · 10% · 30% · 53.3%
GRADE_CUT = [(0.933, 3), (0.833, 2), (0.533, 1), (0.0, 0)]     # 백분위 ≥ → 0 노멀 1 스페셜 2 레어 3 엘리트
GRADE_LETTER = "nsre"
# 백분위 → 종합(OVR): 기존 생성 선수 분포(노멀 60~70 · 스페셜 70~77 · 레어 77~83 · 엘리트 83~92)에 맞춤
OVR_KNOTS = [(0.0, 56), (0.533, 70), (0.833, 77), (0.933, 83), (1.0, 92)]


def pct_ovr(p):
    for (a, va), (b, vb) in zip(OVR_KNOTS, OVR_KNOTS[1:]):
        if p <= b:
            return va + (vb - va) * (p - a) / (b - a)
    return OVR_KNOTS[-1][1]


def grade_of(p):
    for cut, g in GRADE_CUT:
        if p >= cut:
            return g
    return 0


MIN_PA, MIN_OUTS = 30, 30     # 카드가 생기는 최소 출장 (타석 30 · 10이닝)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kbo", default=str(DEFAULT_KBO))
    ap.add_argument("--no-awards", action="store_true")
    args = ap.parse_args()
    kbo = pathlib.Path(args.kbo)
    plist, players, bat_raw, pit_raw = read_inputs(kbo)
    cs = json.loads(CLUB_SEASONS.read_text(encoding="utf-8"))
    league = {int(y): v for y, v in cs["league"].items()}
    log = lambda *a: print(*a, flush=True)  # noqa: E731
    log(f"선수 목록 {len(plist)} · 정보 {len(players)} · 타격 줄 {len(bat_raw)} · 투구 줄 {len(pit_raw)}")

    # ── 이름 · ID
    real_names = {NM.real_name(t) for _, t, _ in plist}
    special = set(NM.SPECIAL_NAMES)
    new_name, fail = NM.assign([(pid, NM.real_name(t)) for pid, t, _ in plist], real_names)
    kid = {}
    used = set()
    for pid, _, _ in sorted(plist):
        n = 6
        k = kid_of(pid, n)
        while k in used:
            n += 1
            k = kid_of(pid, n)
        used.add(k)
        kid[pid] = k
    path_to_pid = {urllib.parse.unquote(path): pid for pid, _, path in plist}

    for r in bat_raw + pit_raw:
        if r["franchise"] == "HD" and r["year"] and int(float(r["year"])) <= 1984:
            EARLY_HD.add(re.split(r"[\s/·-]", r["team"].strip())[0])
    EARLY_HD.discard("")
    # ── 시즌 줄 → 가상 구단 코드
    miss = collections.Counter()
    tot = collections.Counter()
    stints = collections.defaultdict(lambda: {"b": [], "p": []})   # (pid, year) → 구단별 줄
    for kind, rows, conv in (("b", bat_raw, bat_row), ("p", pit_raw, pit_row)):
        for r in rows:
            if r["pid"] not in players or not r["year"]:
                continue
            y = int(float(r["year"]))
            if y > LAST_REAL:
                continue
            code = club_code(r["franchise"], r["team"], y)
            tot[kind] += 1
            if not code:
                miss[(kind, r["franchise"] or "?", y)] += 1
                continue
            x = conv(r)
            x["code"] = code
            stints[(r["pid"], y)][kind].append(x)

    # ── 시즌 합계 (한 해 한 줄) — 주 소속 = 타석(투구는 아웃×1.3)이 가장 많은 구단
    seasons = {}
    for (pid, y), st in stints.items():
        b = sum_bat(st["b"]) if st["b"] else None
        p = sum_pit(st["p"]) if st["p"] else None
        weight = collections.Counter()
        for x in st["b"]:
            weight[x["code"]] += x["PA"]
        for x in st["p"]:
            weight[x["code"]] += x["outs"] * 1.3
        code = sorted(weight.items(), key=lambda kv: (-kv[1], kv[0]))[0][0] if weight else None
        if not code:
            continue
        pa = b["PA"] if b else 0
        outs = p["outs"] if p else 0
        typ = "p" if (p and (not b or outs * 1.3 >= pa)) else "b"
        seasons[(pid, y)] = {"pid": pid, "year": y, "code": code, "b": b, "p": p, "t": typ, "stints": st}

    # ── 리그 환경 (우리 자료 가중 평균, 앞뒤 2년)
    bents = [(y, s["b"]) for (pid, y), s in seasons.items() if s["b"] and s["b"]["PA"] > 0]
    pents = [(y, s["p"]) for (pid, y), s in seasons.items() if s["p"] and s["p"]["outs"] > 0]
    BK = [
        ("avg", lambda r: r["H"], lambda r: r["AB"]),
        ("obp", lambda r: r["OBP"] * r["PA"], lambda r: r["PA"]),
        ("slg", lambda r: r["H"] + r["D2"] + 2 * r["D3"] + 3 * r["HR"], lambda r: r["AB"]),
        ("iso", lambda r: r["D2"] + 2 * r["D3"] + 3 * r["HR"], lambda r: r["AB"]),
        ("hr", lambda r: r["HR"], lambda r: r["PA"]),
        ("xbh", lambda r: r["D2"] + r["D3"], lambda r: r["AB"]),
        ("bb", lambda r: r["BB"], lambda r: r["PA"] if r["BB"] is not None else 0),
        ("k", lambda r: r["SO"], lambda r: r["PA"] if r["SO"] is not None else 0),
        ("spd", lambda r: r["SB"] + 2 * r["D3"], lambda r: r["H"] + (r["BB"] or 0)),
    ]
    PK = [
        ("k9", lambda r: r["SO"] * 27, lambda r: r["outs"]),
        ("bb9", lambda r: (r["BB"] or 0) * 27, lambda r: r["outs"] if r["BB"] is not None else 0),
        ("hr9", lambda r: (r["HR"] or 0) * 27, lambda r: r["outs"] if r["HR"] is not None else 0),
        ("era", lambda r: r["ERA"] * r["outs"] if r["ERA"] is not None else None, lambda r: r["outs"] if r["ERA"] is not None else 0),
        ("h9", lambda r: r["H"] * 27, lambda r: r["outs"]),
    ]
    bm = year_means(bents, BK, "PA")
    pm = year_means(pents, PK, "outs")
    for y in pm:
        lg = league.get(y)
        if lg and lg.get("era"):
            pm[y]["era"] = lg["era"]
    for y in bm:
        lg = league.get(y)
        if lg and lg.get("avg"):
            bm[y]["avg"] = lg["avg"]

    def brate(k):
        return {
            "avg": lambda r: r["AVG"] if r["AB"] else None,
            "iso": lambda r: (r["SLG"] - r["AVG"]) if r["AB"] else None,
            "hr": lambda r: r["HR"] / r["PA"] if r["PA"] else None,
            "xbh": lambda r: (r["D2"] + r["D3"]) / r["AB"] if r["AB"] else None,
            "bb": lambda r: r["BB"] / r["PA"] if (r["PA"] and r["BB"] is not None) else None,
            "k": lambda r: r["SO"] / r["PA"] if (r["PA"] and r["SO"] is not None) else None,
            "spd": lambda r: (r["SB"] + 2 * r["D3"]) / (r["H"] + (r["BB"] or 0)) if (r["H"] + (r["BB"] or 0)) else None,
        }[k]

    def prate(k):
        return {
            "k9": lambda r: r["SO"] * 27 / r["outs"] if r["outs"] else None,
            "bb9": lambda r: r["BB"] * 27 / r["outs"] if (r["outs"] and r["BB"] is not None) else None,
            "hr9": lambda r: r["HR"] * 27 / r["outs"] if (r["outs"] and r["HR"] is not None) else None,
            "era": lambda r: r["ERA"],
            "h9": lambda r: r["H"] * 27 / r["outs"] if r["outs"] else None,
        }[k]

    bsd = {k: pooled_sd(bents, bm, k, brate(k), "PA", 250) for k in ["avg", "iso", "hr", "xbh", "bb", "k", "spd"]}
    psd = {k: pooled_sd(pents, pm, k, prate(k), "outs", 240) for k in ["k9", "bb9", "hr9", "era", "h9"]}

    def bz(r, y, k, rel):
        v = brate(k)(r)
        m = bm.get(y, {}).get(k)
        sd = bsd.get(k)
        if v is None or m is None or not sd:
            return -0.4
        z = (v - m) / sd
        return clamp(z * rel + (-0.4) * (1 - rel), -3.2, 3.6)

    def pz(r, y, k, rel, sign=1):
        v = prate(k)(r)
        m = pm.get(y, {}).get(k)
        sd = psd.get(k)
        if v is None or m is None or not sd:
            return -0.4
        z = sign * (v - m) / sd
        return clamp(z * rel + (-0.4) * (1 - rel), -3.2, 3.6)

    # ── 선수 정보 (나이·체격)
    def birth(pid):
        return f(players[pid].get("birth_year"))

    # ── 시즌 능력치 · 성적 점수
    for (pid, y), s in seasons.items():
        P = players[pid]
        k = kid[pid]
        b, p = s["b"], s["p"]
        age = (y - birth(pid)) if birth(pid) else 28
        s["age"] = int(age)
        if s["t"] == "b":
            rel = b["PA"] / (b["PA"] + 220)
            z = {kk: bz(b, y, kk, rel) for kk in ["avg", "iso", "hr", "xbh", "bb", "k", "spd"]}
            con = 60 + 10 * (0.75 * z["avg"] - 0.25 * z["k"])
            pow_ = 60 + 10 * (0.55 * z["iso"] + 0.45 * z["hr"])
            gap = 60 + 10 * (0.7 * z["xbh"] + 0.3 * z["iso"])
            eye = 60 + 10 * z["bb"]
            avk = 60 - 10 * z["k"]
            spd = 60 + 10 * z["spd"] - max(0, age - 30) * 0.9 + max(0, 26 - age) * 0.5
            pos = game_pos(P, k, spd, pow_)
            wt, ht = f(P.get("weight_kg")), f(P.get("height_cm"))
            body = 0
            if wt and ht:
                bmi = wt / (ht / 100) ** 2
                body = clamp((26.5 - bmi) * 1.2, -5, 5)
            dfn = POS_DEF[pos] + body + (spd - 60) * 0.25 - max(0, age - 31) * 1.0 + (h01(k, "def") - 0.5) * 8
            arm = POS_ARM[pos] + (h01(k, "arm") - 0.5) * 10 - max(0, age - 32) * 0.8
            s["pos"] = pos
            s["r"] = [con, pow_, gap, eye, avk, spd, dfn, arm]
            # 성적 점수 (대체 선수 대비 득점 비슷한 값) — OPS+ 꼴 × 타석 + 포지션 보정 + 도루
            lo, ls = bm.get(y, {}).get("obp"), bm.get(y, {}).get("slg")
            opsp = 100 * ((b["OBP"] / lo if lo else 1) + (b["SLG"] / ls if ls else 1) - 1)
            s["score"] = b["PA"] / 600 * (opsp - 72) * 0.75 + b["PA"] / 600 * POS_ADJ[pos] + b["SB"] * 0.15
        else:
            rel = p["outs"] / (p["outs"] + 240)
            z = {"k9": pz(p, y, "k9", rel), "bb9": pz(p, y, "bb9", rel, -1), "hr9": pz(p, y, "hr9", rel, -1),
                 "era": pz(p, y, "era", rel, -1), "h9": pz(p, y, "h9", rel, -1)}
            ipg = p["IP"] / p["G"] if p["G"] else 0
            gs = p["GS"]
            role = "SP" if ((gs is not None and p["G"] and gs / p["G"] >= 0.5) or ipg >= 3.6) else ("CL" if (p["SV"] >= 10 or (p["SV"] >= 5 and p["SV"] > p["HLD"])) else "RP")
            era_off = -6 if y < 1995 else (-3 if y < 2008 else 0)      # 옛 시대 구속 표시는 조금 낮게
            vel = 60 + 10 * (0.65 * z["k9"] + 0.15 * z["era"]) + era_off - max(0, age - 31) * 0.8 + (h01(k, "vel") - 0.5) * 6
            stf = 60 + 10 * (0.55 * z["k9"] + 0.25 * z["hr9"] + 0.2 * z["h9"])
            brk = 60 + 10 * (0.45 * z["k9"] + 0.35 * z["era"] + 0.2 * z["h9"])
            ctl = 60 + 10 * z["bb9"]
            sta = (52 + ipg * 6.5 + min(p["IP"], 220) * 0.06) if role == "SP" else (34 + ipg * 9)
            mnt = 60 + 10 * (0.7 * z["era"] + 0.3 * z["hr9"])
            s["pos"] = "P"
            s["role"] = role
            s["r"] = [vel, stf, brk, ctl, sta, mnt]
            lg = pm.get(y, {}).get("era") or 4.2
            era = p["ERA"] if p["ERA"] is not None else lg * 1.25
            # 실점 기준: 대체 선수 평균자책 = 리그 × 1.28 (구원은 1.18)
            rep = lg * (1.28 if role == "SP" else 1.18)
            s["score"] = p["IP"] / 9 * (rep - era) + (p["SV"] + p["HLD"] * 0.5) * 0.12

    # ── 시즌 백분위 → 등급 · 종합 (타자·투수 따로, 출장 최소치 넘은 시즌끼리)
    by_year = collections.defaultdict(lambda: {"b": [], "p": []})
    for key, s in seasons.items():
        ok = (s["t"] == "b" and s["b"]["PA"] >= MIN_PA) or (s["t"] == "p" and s["p"]["outs"] >= MIN_OUTS)
        s["card"] = ok
        if ok:
            by_year[s["year"]][s["t"]].append(s)
    for y, grp in by_year.items():
        for t, lst in grp.items():
            lst.sort(key=lambda s: (s["score"], s["pid"]))
            n = len(lst)
            for i, s in enumerate(lst):
                pc = (i + 0.5) / n if n > 1 else 0.6
                s["pct"] = pc
                s["grade"] = grade_of(pc)
                s["ovr"] = r1(pct_ovr(pc))
    # 카드 없는 시즌도 종합은 낮게 매겨 둔다(선수단 채우기용 · 카드 아님)
    for s in seasons.values():
        if not s["card"]:
            s["pct"], s["grade"], s["ovr"] = 0.0, -1, 52

    # ── 능력치를 종합에 맞춤 (모양은 성적에서, 높이는 백분위에서)
    BAT_W = {"C": [.25, .2, .05, .15, 0, .05, .2, .1], "DH": [.3, .35, .1, .15, .05, .05, 0, 0]}
    for s in seasons.values():
        r = s["r"]
        if s["t"] == "b":
            w = BAT_W.get(s["pos"], [.25, .25, .05, .12, .03, .1, .14, .06])
        else:
            w = [.2, .25, .2, .2, .1 if s["role"] == "SP" else .05, .05 if s["role"] == "SP" else .1]
        raw = sum(a * b for a, b in zip(r, w)) / sum(w)
        d = s["ovr"] - raw
        s["r"] = [r1(clamp(x + d * 0.9, 20, 99)) for x in r]

    # ── 수상 (MVP · GG · TH)
    awards = {}
    if not args.no_awards:
        awards = AW.collect(kbo / "raw", path_to_pid, log=log, cache_file=kbo.parent / "kbo_build" / "awards_cache.local.json")
    award_rows = []   # (pid, year, kind, sub)
    seen_kind = set()
    for (kind, sub, y), pids in sorted(awards.items(), key=lambda kv: (kv[0][0], str(kv[0][1]), kv[0][2])):
        if y > LAST_REAL:
            continue
        if pids:
            seen_kind.add((kind, sub, y))     # 수상 틀에 그 해 수상자가 있음 (우리 목록에 없는 선수여도 계산으로 대신하지 않음)
        for pid in pids:
            if pid in players:
                award_rows.append((pid, y, kind, sub))
    # 수상 틀에 없는 (TH 부문, 연도)는 우리 기록 1위로 계산 (규정 타석 3.1×경기 · 규정 이닝 1×경기)
    TH_CALC = {"HR": ("b", lambda b: b["HR"], False), "AVG": ("b", lambda b: b["AVG"], True), "RBI": ("b", lambda b: b["RBI"], False),
               "SB": ("b", lambda b: b["SB"], False), "H": ("b", lambda b: b["H"], False), "R": ("b", lambda b: b["R"], False),
               "OBP": ("b", lambda b: b["OBP"], True), "SLG": ("b", lambda b: b["SLG"], True),
               "W": ("p", lambda p: p["W"], False), "ERA": ("p", lambda p: -(p["ERA"] if p["ERA"] is not None else 99), True),
               "SO": ("p", lambda p: p["SO"], False), "SV": ("p", lambda p: p["SV"], False), "HLD": ("p", lambda p: p["HLD"], False)}
    calc_th = 0
    for cat, (t, val, qual) in TH_CALC.items():
        if cat == "HLD":
            yrs = range(2000, LAST_REAL + 1)
        else:
            yrs = range(1982, LAST_REAL + 1)
        for y in yrs:
            if ("th", cat, y) in seen_kind:
                continue
            games = (league.get(y) or {}).get("games") or 126
            best, bv = None, None
            for (pid, yy), s in seasons.items():
                if yy != y or not s[t]:
                    continue
                x = s[t]
                if qual and ((t == "b" and x["PA"] < games * 3.1) or (t == "p" and x["IP"] < games)):
                    continue
                v = val(x)
                if v is None or v <= 0 and cat not in ("ERA",):
                    continue
                if bv is None or v > bv or (v == bv and pid < best):
                    best, bv = pid, v
            if best:
                award_rows.append((best, y, "th", cat))
                calc_th += 1

    # ── 통산 · 구단 계보별 가치 (상징 카드)
    by_pid = collections.defaultdict(list)
    for s in seasons.values():
        by_pid[s["pid"]].append(s)
    for lst in by_pid.values():
        lst.sort(key=lambda s: s["year"])
    career = {}
    for pid, lst in by_pid.items():
        val = sum(max(0.0, s["score"]) for s in lst)
        line_val = collections.Counter()
        line_yrs = collections.defaultdict(set)
        code_val = collections.Counter()
        for s in lst:
            ln = LINE_OF.get(s["code"])
            line_val[ln] += max(0.0, s["score"])
            line_yrs[ln].add(s["year"])
            code_val[s["code"]] += max(0.0, s["score"]) + 0.01
        main_line = sorted(line_val.items(), key=lambda kv: (-kv[1], kv[0]))[0][0] if line_val else None
        best = sorted([s for s in lst if s["card"]], key=lambda s: (-s["score"], s["year"]))
        career[pid] = {"val": val, "line": main_line, "line_val": line_val[main_line] if main_line is not None else 0,
                       "line_yrs": len(line_yrs[main_line]) if main_line is not None else 0,
                       "best": best[0] if best else None, "n_elite": sum(1 for s in lst if s["grade"] == 3),
                       "code_in_line": sorted([c for c in code_val if LINE_OF.get(c) == main_line], key=lambda c: (-code_val[c], c))}
    icon = {}   # pid → (grade, code, year)
    lines = collections.defaultdict(list)
    for pid, c in career.items():
        if c["line"] is not None and c["best"]:
            lines[c["line"]].append(pid)
    for ln, pids in lines.items():
        pids.sort(key=lambda p: (-career[p]["line_val"], p))
        sig = [p for p in pids if career[p]["line_yrs"] >= 8][:1]
        for p in sig:
            icon[p] = "signature"
        blk = [p for p in pids if p not in icon and career[p]["line_yrs"] >= 6][:2]
        for p in blk:
            icon[p] = "black"
        fr = [p for p in pids if p not in icon and career[p]["line_yrs"] >= 10][:6]
        for p in fr:
            icon[p] = "franchise"
    # 레전드: 통산 가치 상위 (상징 카드가 아직 없는 선수) — 전체 선수 수의 약 4% · 엘리트 시즌 2번 이상
    rest = sorted([p for p, c in career.items() if p not in icon and c["best"] and c["n_elite"] >= 2], key=lambda p: (-career[p]["val"], p))
    n_leg = max(20, round(len([p for p in career if career[p]["best"]]) * 0.04))
    for p in rest[:n_leg]:
        icon[p] = "legend"

    # ── 카드 목록
    cards = []   # (kid, kind, year, code, ovr, sub, view)
    for (pid, y), s in sorted(seasons.items()):
        if s["card"]:
            cards.append({"id": f"{kid[pid]}-{y}{GRADE_LETTER[s['grade']]}", "k": kid[pid], "g": ["normal", "special", "rare", "elite"][s["grade"]],
                          "y": y, "c": s["code"], "o": s["ovr"], "v": y})
    AW_OVR = {"mvp": (4, 89, 96), "gg": (2, 82, 92), "th": (2, 84, 93)}
    seen_ids = set()
    award_count = collections.Counter()
    for pid, y, kind, sub in sorted(award_rows, key=lambda x: (x[1], x[2], str(x[3]), x[0])):
        s = seasons.get((pid, y))
        if not s:
            continue      # 그 해 1군 기록이 없으면(표 누락) 카드 없음
        bonus, lo, hi = AW_OVR[kind]
        o = r1(clamp(s["ovr"] + bonus, lo, hi))
        cid = f"{kid[pid]}-{y}{kind}" + (f"-{sub.lower()}" if kind == "th" else "")
        if cid in seen_ids:
            continue
        seen_ids.add(cid)
        award_count[kind] += 1
        cards.append({"id": cid, "k": kid[pid], "g": kind, "y": y, "c": s["code"], "o": o, "v": y, "a": sub})
    ICON_OVR = {"legend": (84, 90), "franchise": (86, 92), "black": (89, 94), "signature": (92, 97)}
    ICON_SUF = {"legend": "lg", "franchise": "fr", "black": "bk", "signature": "sg"}
    icon_rank = collections.defaultdict(list)
    for pid, g in icon.items():
        icon_rank[g].append(pid)
    for g, pids in icon_rank.items():
        pids.sort(key=lambda p: (-career[p]["val"], p))
        lo, hi = ICON_OVR[g]
        for i, pid in enumerate(pids):
            c = career[pid]
            best = c["best"]
            o = r1(hi - (hi - lo) * (i / max(1, len(pids) - 1)))
            if g == "legend":
                code, year = best["code"], best["year"]       # 황금기 = 가장 좋았던 시즌
            else:
                code = c["code_in_line"][0] if c["code_in_line"] else best["code"]
                year = None
            item = {"id": f"{kid[pid]}-{ICON_SUF[g]}", "k": kid[pid], "g": g, "c": code, "o": o, "v": best["year"]}
            if year:
                item["y"] = year
            yrs = [s["year"] for s in by_pid[pid] if LINE_OF.get(s["code"]) == c["line"]]
            item["span"] = [min(yrs), max(yrs)]
            cards.append(item)
    cards.sort(key=lambda c: c["id"])

    # ── 선수 본체 (카드가 하나라도 있는 선수 + 1군 시즌이 있는 선수)
    carded = {c["k"] for c in cards}
    persons = {}
    recs = collections.defaultdict(dict)

    def i3(x):
        return None if x is None else int(round(x * 1000))

    def num(x):
        return None if x is None else (int(x) if float(x).is_integer() else round(x, 2))

    for pid, lst in sorted(by_pid.items()):
        k = kid[pid]
        P = players[pid]
        if k not in carded:
            continue
        bats = P.get("bats") or "R"
        throws = P.get("throws") or "R"
        arm = {"사이드암": 1, "언더핸드": 2}.get(P.get("arm_slot") or "", 0)
        main_pos = collections.Counter(s["pos"] for s in lst if s["card"]).most_common(1)
        main = main_pos[0][0] if main_pos else lst[0]["pos"]
        # 본체: [이름, 출생 연도, 투타, 팔 각도, 외국인, 키, 몸무게, 입단 연도, 주 포지션, 다른 포지션, 시즌…]
        body = [new_name[pid], int(birth(pid)) if birth(pid) else None, throws + bats, arm, 1 if str(P.get("foreign")) == "1" else 0,
                num(f(P.get("height_cm"))), num(f(P.get("weight_kg"))), int(f(P.get("entry_year"))) if f(P.get("entry_year")) else None,
                main, sub_pos(P, main), []]
        for s in lst:
            row = [s["year"], s["code"], s["ovr"], s["grade"], s["pos"] if s["t"] == "b" else s["role"], s["age"], *s["r"]]
            if s["t"] == "b":
                b = s["b"]
                row += [num(b["G"]), num(b["PA"]), num(b["AB"]), num(b["H"]), num(b["D2"]), num(b["D3"]), num(b["HR"]), num(b["RBI"]),
                        num(b["R"]), num(b["SB"]), num(b["BB"]), num(b["SO"]), i3(b["AVG"]), i3(b["OBP"]), i3(b["SLG"])]
            else:
                p = s["p"]
                row += [num(p["G"]), num(p["GS"]), num(p["W"]), num(p["L"]), num(p["SV"]), num(p["HLD"]), int(p["outs"]), num(p["H"]),
                        num(p["HR"]), num(p["BB"]), num(p["SO"]), None if p["ERA"] is None else round(p["ERA"], 2),
                        None if p["WHIP"] is None else round(p["WHIP"], 2)]
            if s["card"]:
                body[10].append(row)     # 카드가 있는 시즌만 (그 밖은 상세 기록 파일에만)
            # 상세 기록 (구단별 줄 그대로)
            for x in s["stints"]["b"]:
                recs[k].setdefault("b", []).append([s["year"], x["code"], num(x["G"]), num(x["PA"]), num(x["AB"]), num(x["R"]), num(x["H"]),
                                                     num(x["D2"]), num(x["D3"]), num(x["HR"]), num(x["RBI"]), num(x["SB"]),
                                                     None if x["BB"] is None else num(round(x["BB"])), num(x["SO"]),
                                                     i3(x["AVG"]), i3(x["OBP"]), i3(x["SLG"]), num(x["WAR"])])
            for x in s["stints"]["p"]:
                recs[k].setdefault("p", []).append([s["year"], x["code"], num(x["G"]), num(x["GS"]), num(x["W"]), num(x["L"]), num(x["SV"]),
                                                     num(x["HLD"]), int(x["outs"]), num(x["H"]), num(x["HR"]),
                                                     None if x["BB"] is None else num(round(x["BB"])), num(x["SO"]),
                                                     None if x["ERA"] is None else round(x["ERA"], 2),
                                                     None if x["WHIP"] is None else round(x["WHIP"], 2), num(x["WAR"])])
        persons[k] = body

    core = {
        "v": 1, "src": SOURCE,
        "fmt": {
            "person": "선수 ID → [이름(바뀐 이름), 출생 연도, 투타(던지는 손+치는 손), 팔 각도(0 오버·스리쿼터 1 사이드 2 언더), 외국인, 키, 몸무게, 입단 연도, 주 포지션, 다른 포지션, 시즌 목록]",
            "season": "[연도, 구단 코드, 종합, 등급(0 노멀·1 스페셜·2 레어·3 엘리트), 포지션 또는 보직(SP·RP·CL), 나이, 능력치…, 기록…] — 카드가 생기는 시즌만. 시즌 카드 id = 선수 ID-연도+n|s|r|e",
            "batRatings": "컨택 · 파워 · 갭 · 선구 · 삼진 회피 · 스피드 · 수비 · 어깨",
            "pitRatings": "구속 · 구위 · 변화 · 제구 · 체력 · 위기관리",
            "batLine": "경기 · 타석 · 타수 · 안타 · 2루타 · 3루타 · 홈런 · 타점 · 득점 · 도루 · 볼넷 · 삼진 · 타율×1000 · 출루율×1000 · 장타율×1000",
            "pitLine": "경기 · 선발 · 승 · 패 · 세이브 · 홀드 · 아웃 수 · 피안타 · 피홈런 · 볼넷 · 탈삼진 · 평균자책 · WHIP",
            "card": "[선수 ID, 등급, 카드 연도, 구단 코드, 카드 종합, 능력치를 가져온 시즌, 수상 부문, 계보에서 뛴 첫 해, 끝 해] — 수상·상징 카드만 (시즌 카드는 시즌 목록에서)",
        },
        "persons": persons,
        "cards": [[c["k"], c["g"], c.get("y"), c["c"], c["o"], c["v"], c.get("a"), *(c.get("span") or [None, None])]
                  for c in cards if c["g"] not in ("normal", "special", "rare", "elite")],
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob("rec-*.json"):
        old.unlink()
    dump = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":"), sort_keys=True)  # noqa: E731
    (OUT_DIR / "core.json").write_text(dump(core), encoding="utf-8")
    chunks = collections.defaultdict(dict)
    for k, r in recs.items():
        chunks[k[1]][k] = r
    sizes = {}
    for ch in "0123456789abcdef":
        txt = dump({"v": 1, "src": SOURCE, "fmt": {
            "b": "[연도, 구단, 경기, 타석, 타수, 득점, 안타, 2루타, 3루타, 홈런, 타점, 도루, 볼넷, 삼진, 타율×1000, 출루율×1000, 장타율×1000, WAR]",
            "p": "[연도, 구단, 경기, 선발, 승, 패, 세이브, 홀드, 아웃 수, 피안타, 피홈런, 볼넷, 탈삼진, 평균자책, WHIP, WAR]"}, "r": chunks.get(ch, {})})
        (OUT_DIR / f"rec-{ch}.json").write_text(txt, encoding="utf-8")
        sizes[f"rec-{ch}.json"] = len(txt.encode())
    sizes["core.json"] = (OUT_DIR / "core.json").stat().st_size

    # ── 보고
    gcount = collections.Counter(c["g"] for c in cards)
    no_code = sum(miss.values())
    report = {
        "inputs": {"list": len(plist), "info": len(players), "batRows": len(bat_raw), "pitRows": len(pit_raw)},
        "mappingMiss": {"rows": no_code, "of": sum(tot.values()), "pct": round(100 * no_code / max(1, sum(tot.values())), 3),
                        "detail": {f"{k[0]}:{k[1]}:{k[2]}": v for k, v in sorted(miss.items())}},
        "nameFail": len(fail),
        "persons": len(persons), "personsAll": len(by_pid), "seasons": len(seasons),
        "cards": len(cards), "byGrade": dict(sorted(gcount.items())), "awardsFromBoxes": len(award_rows) - calc_th, "awardsCalculated": calc_th,
        "sizes": sizes, "totalBytes": sum(sizes.values()),
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    log(json.dumps({k: v for k, v in report.items() if k != "mappingMiss"}, ensure_ascii=False))
    log(f"매핑 누락 {no_code}/{sum(tot.values())} 줄 ({report['mappingMiss']['pct']}%)")
    # 바뀐 이름 · ID 표 (로컬 전용 — 실명이 들어 있어 저장소 밖 scratchpad 에)
    local = kbo.parent / "kbo_build" / "name_map.local.tsv"
    local.parent.mkdir(parents=True, exist_ok=True)
    with local.open("w", encoding="utf-8") as fo:
        fo.write("pid\tkid\treal\tnew\n")
        for pid, t, _ in sorted(plist):
            fo.write(f"{pid}\t{kid[pid]}\t{NM.real_name(t)}\t{new_name.get(pid, '')}\n")


if __name__ == "__main__":
    main()
