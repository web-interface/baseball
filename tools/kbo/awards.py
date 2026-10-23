"""수상 기록 — 선수 문서 아래쪽 '수상자/역대 1위' 틀(접기 상자)에서 연도 → 수상 선수(문서 주소)를 뽑는다.

  · KBO 리그 MVP 수상자                    → mvp
  · KBO 골든글러브 <포지션> 부문 수상자 …  → gg (포지션)
  · KBO 리그 | 역대 <부문> 1위             → th (부문)  — 퓨처스·포스트시즌·구단별 틀은 뺀다
틀 안의 표는 '연도 줄' 다음에 '수상자 줄'이 오는 꼴. 수상자 칸의 링크 주소(/w/…)를 선수 목록의 주소와 맞춰 pid 로 바꾼다.
같은 틀이 여러 문서에 들어 있으므로 모든 문서를 훑어 합친다(연도·부문마다 처음 본 값).
"""
import html
import pathlib
import re
import urllib.parse

GG_POS = {"투수": "P", "포수": "C", "1루수": "1B", "2루수": "2B", "3루수": "3B", "유격수": "SS", "외야수": "OF", "지명타자": "DH"}
TH_CAT = {"세이브 포인트": "SV", "다승": "W", "홈런": "HR", "타율": "AVG", "타점": "RBI", "평균자책점": "ERA", "탈삼진": "SO", "세이브": "SV", "도루": "SB",
          "안타": "H", "최다 안타": "H", "최다안타": "H", "득점": "R", "출루율": "OBP", "장타율": "SLG", "승률": "WPCT", "홀드": "HLD"}

SUMMARY = re.compile(r"<summary[^>]*>\s*&#91; 펼치기 · 접기 &#93;</summary>")


def norm_path(p):
    p = html.unescape(p).split("#")[0].split("?")[0]
    return urllib.parse.unquote(p)


def title_of(pre):
    st = pre.rfind("<strong")
    if st < 0:
        return ""
    t = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", pre[st:]))).strip()
    if re.fullmatch(r"역대 .+ 1위", t):
        # 'KBO 리그' 가 바로 앞 칸에 따로 있는 꼴 — 앞 600자 끝이 'KBO 리그' 면 붙인다 (퓨처스·구단 틀은 제외됨)
        ctx = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", pre[max(0, st - 600):st]))).strip()
        if ctx.endswith("KBO 리그"):
            return "KBO 리그 " + t
    return t


def kind_of(title):
    if re.fullmatch(r"KBO 리그 MVP 수상자", title):
        return ("mvp", None)
    m = re.fullmatch(r"KBO 골든글러브 (\S+) 부문 수상자(?: \(\d{4}~(?:\d{4})?\))?", title)
    if m and m.group(1) in GG_POS:
        return ("gg", GG_POS[m.group(1)])
    m = re.fullmatch(r"KBO 리그 역대 (.+?) 1위", title)
    if m and m.group(1) in TH_CAT:
        return ("th", TH_CAT[m.group(1)])
    return None


def table_after(s, pos):
    i = s.find("<table", pos)
    if i < 0 or i - pos > 3000:
        return None
    depth, j = 0, i
    tag = re.compile(r"<(/?)table\b")
    for m in tag.finditer(s, i):
        depth += -1 if m.group(1) else 1
        if depth == 0:
            return s[i:m.end() + 6]
    return None


def rows_of(tbl):
    out = []
    for tr in re.findall(r"<tr\b[\s\S]*?</tr>", tbl):
        row = []
        for attrs, c in re.findall(r"<td\b([^>]*)>([\s\S]*?)</td>", tr):
            text = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", c))).strip()
            hrefs = [norm_path(h) for h in re.findall(r"href=['\"](/w/[^'\"]+)['\"]", c)]
            m = re.search(r"colspan=['\"]?(\d+)", attrs)
            for _ in range(int(m.group(1)) if m else 1):   # 같은 수상자가 여러 해 이어지면 칸이 합쳐져 있음 → 펼침
                row.append((text, hrefs))
        out.append(row)
    return out


def parse_box(tbl, kind):
    """(연도, [주소…]) 목록"""
    res = []
    rows = rows_of(tbl)
    years = None
    for row in rows:
        texts = [t for t, _ in row]
        if row and all(re.fullmatch(r"\d{4}", t) for t in texts):
            years = [int(t) for t in texts]
            continue
        if years and len(row) == len(years):
            for y, (t, hrefs) in zip(years, row):
                if t in ("", "-", "—", "없음", "수상자 없음"):
                    continue
                res.append((y, hrefs))
            years = None
    return res


def boxes_of_file(f):
    """한 문서의 수상 틀 → [(kind, sub, year, [주소…])]"""
    s = f.read_text(encoding="utf-8", errors="replace")
    out = []
    if "수상자" not in s and " 1위<" not in s:
        return out
    for m in SUMMARY.finditer(s):
        title = title_of(s[max(0, m.start() - 3000):m.start()])
        k = kind_of(title)
        if not k:
            continue
        tbl = table_after(s, m.end())
        if not tbl:
            continue
        for y, hrefs in parse_box(tbl, k[0]):
            out.append([k[0], k[1], y, hrefs])
    return out


def collect(raw_dir, path_to_pid, log=print, cache_file=None, only=None):
    """→ {(kind, sub, year): [pid…]}  (sub = GG 포지션 / TH 부문 / None)
    cache_file: 문서마다 뽑은 틀을 (파일 이름·크기) 열쇠로 적어 두는 로컬 파일 — 다시 돌릴 때 빠르게 (주소만 들어 있음)
    only: 이 pid 들의 문서만 읽는다 (수상 분류가 붙은 선수 — 수상자 문서에는 그 상의 역대 수상자 틀이 들어 있음).
          입력(players.csv 분류)으로 정해지는 묶음이라 같은 입력 → 같은 결과."""
    import json
    cache = {}
    if cache_file and pathlib.Path(cache_file).exists():
        try:
            cache = json.loads(pathlib.Path(cache_file).read_text(encoding="utf-8"))
        except ValueError:
            cache = {}
    found = {}
    files = sorted(p for p in pathlib.Path(raw_dir).glob("*.html") if "__선수경력" not in p.name)
    if only is not None:
        files = [p for p in files if p.name.rsplit("__", 1)[-1][:-5] in only]
    fresh = 0
    for n, f in enumerate(files):
        key = f"{f.name}|{f.stat().st_size}"
        if key not in cache:
            cache[key] = boxes_of_file(f)
            fresh += 1
        for kind, sub, y, hrefs in cache[key]:
            k = (kind, sub, y)
            pids = [path_to_pid[h] for h in hrefs if h in path_to_pid]
            if k not in found or (not found[k] and pids):
                found[k] = pids
        if n % 500 == 499:
            log(f"  수상 틀 훑는 중 {n + 1}/{len(files)} (새로 읽음 {fresh})")
    if cache_file:
        pathlib.Path(cache_file).parent.mkdir(parents=True, exist_ok=True)
        pathlib.Path(cache_file).write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    return found
