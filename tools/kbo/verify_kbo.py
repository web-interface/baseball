"""실제 선수 카탈로그 검증 — 실명 0 · 이름 충돌 0 · 매핑 누락률 · 같은 입력 → 같은 출력.

사용  py -I -X utf8 tools/kbo/verify_kbo.py [--kbo <폴더>] [--rebuild]
  --rebuild : build_kbo.py 를 한 번 더 돌려 출력 해시가 그대로인지 본다 (같은 입력 → 같은 출력)
검사
  1. 매핑 누락률 — 가상 구단 코드를 못 찾은 시즌 줄 (report.json)
  2. 이름 충돌 0 — 바뀐 이름끼리 겹침 0, 바뀐 이름 = 다른 실제 선수 이름(목록 전체) 0, 바뀐 이름 = 특별 선수 이름 0
  3. 저장소 산출물에 실명 0 — 선수 목록(players_list.tsv)의 실제 이름 전체와 대조.
       · 데이터(JSON): 문자열 값이 실명과 같은 것 0 (2글자 이름 포함)
       · 글(문서·스크립트·코드 — 이번 작업 파일): 3글자 이상 실명이 들어 있는 곳 0
       · 특별 선수 11명 이름은 예외(사용자 지정), 실명과 같은 바뀐 이름은 2번에서 0 이어야 함
  4. 카드 id 규칙 · 선수 ID 고정(이름과 무관) · 모든 카드가 본체를 참조
결과는 tools/kbo/out/verify.json (실명 없음 — 개수만)
"""
import argparse
import hashlib
import json
import pathlib
import re
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent.parent
sys.path.insert(0, str(HERE))
import names as NM  # noqa: E402
from build_kbo import DEFAULT_KBO, OUT_DIR, kid_of  # noqa: E402

# 이번 작업이 만든·고친 글 파일 (실명이 들어가면 안 됨)
TEXT_FILES = [
    "docs/실제선수데이터.md", "tools/kbo/build_kbo.py", "tools/kbo/names.py", "tools/kbo/awards.py", "tools/kbo/verify_kbo.py",
    "web/src/game/kbo.ts", "web/src/game/history.ts", "web/src/game/starter.ts", "web/src/game/inventory.ts",
    "web/src/screens/player/RealPanel.tsx", "web/src/screens/player/RecordPanel.tsx", "web/src/season/career.ts",
    "web/scripts/kbo.test.ts", "web/scripts/legacy-fixture.ts", "web/src/game/legacy/history.ts", "web/src/game/legacy/starter.ts",
    "web/src/game/mock.ts", "web/src/screens/gacha/draw.ts", "web/src/screens/gacha/local-mock.ts", "web/src/screens/shop/local-mock.ts",
    "web/src/screens/club-select/StepDraft.tsx", "web/src/screens/player/local-mock.ts", "web/src/screens/player/index.tsx",
    "web/src/season/rosters.ts", "web/src/season/store.ts", "web/src/README-ui.md",
]


def digest():
    h = hashlib.sha256()
    for p in sorted(OUT_DIR.glob("*.json")):
        h.update(p.name.encode())
        h.update(p.read_bytes())
    return h.hexdigest()


def strings_in(o, out):
    if isinstance(o, str):
        out.add(o)
    elif isinstance(o, dict):
        for k, v in o.items():
            out.add(k)
            strings_in(v, out)
    elif isinstance(o, list):
        for v in o:
            strings_in(v, out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kbo", default=str(DEFAULT_KBO))
    ap.add_argument("--rebuild", action="store_true")
    args = ap.parse_args()
    kbo = pathlib.Path(args.kbo)
    plist = [tuple(l.rstrip("\n").split("\t")[:3]) for l in (kbo / "players_list.tsv").open(encoding="utf-8")][1:]
    real = {NM.real_name(t) for _, t, _ in plist}
    special = set(NM.SPECIAL_NAMES)
    real_check = real - special
    res, bad = {}, []

    # 1. 매핑
    rep = json.loads((HERE / "out" / "report.json").read_text(encoding="utf-8"))
    res["mappingMissRows"] = rep["mappingMiss"]["rows"]
    res["mappingMissPct"] = rep["mappingMiss"]["pct"]
    if rep["mappingMiss"]["pct"] > 1.0:
        bad.append("매핑 누락 1% 넘음")

    # 2. 이름 — 규칙을 그대로 다시 돌려 확인 (실명 목록 전체 기준)
    core = json.loads((OUT_DIR / "core.json").read_text(encoding="utf-8"))
    names = [p[0] for p in core["persons"].values()]
    res["persons"] = len(names)
    res["nameDup"] = len(names) - len(set(names))
    res["nameEqualsReal"] = sum(1 for n in names if n in real)
    res["nameEqualsSpecial"] = sum(1 for n in names if n in special)
    new_name, fail = NM.assign([(pid, NM.real_name(t)) for pid, t, _ in plist], real)
    allnew = list(new_name.values())
    res["allNamesAssigned"] = len(allnew)
    res["allNameFail"] = len(fail)
    res["allNameDup"] = len(allnew) - len(set(allnew))
    res["allNameEqualsReal"] = sum(1 for n in allnew if n in real or n in special)
    # 바뀐 이름이 정말 '조금' 바뀌었나 — 글자 수 같고 성 그대로, 다른 글자 1개
    def one_off(a, b):
        return len(a) == len(b) and a[0] == b[0] and sum(1 for x, y in zip(a, b) if x != y) == 1
    res["oneSyllableChanged"] = sum(1 for pid, t, _ in plist if pid in new_name and one_off(NM.real_name(t), new_name[pid]))
    for k in ("nameDup", "nameEqualsReal", "nameEqualsSpecial", "allNameFail", "allNameDup", "allNameEqualsReal"):
        if res[k]:
            bad.append(k)

    # 3. 저장소 산출물 실명 검사
    hits_data = 0
    for p in sorted(OUT_DIR.glob("*.json")):
        ss = set()
        strings_in(json.loads(p.read_text(encoding="utf-8")), ss)
        hits_data += len(ss & real_check)
    res["realNameInData"] = hits_data
    long_names = sorted({n for n in real_check if len(n.replace(" ", "")) >= 3}, key=len, reverse=True)
    rx = re.compile("|".join(map(re.escape, long_names))) if long_names else None
    hits_text = 0
    for f in TEXT_FILES:
        p = REPO / f
        if p.exists() and rx:
            hits_text += len(rx.findall(p.read_text(encoding="utf-8")))
    res["realNameInText"] = hits_text
    if hits_data or hits_text:
        bad.append("실명 발견")

    # 4. ID · 카드
    ids = list(core["persons"].keys())
    res["idPattern"] = all(re.fullmatch(r"k[0-9a-f]{6,8}", k) for k in ids)
    pid_by_kid = {}
    for pid, _, _ in plist:
        for n in (6, 7, 8):
            pid_by_kid.setdefault(kid_of(pid, n), pid)
    res["idFromPidHash"] = all(k in pid_by_kid for k in ids)
    res["cardsListed"] = len(core["cards"])
    res["cardRefOk"] = all(c[0] in core["persons"] for c in core["cards"])
    seasons = sum(len(p[10]) for p in core["persons"].values())
    res["seasonCards"] = seasons
    if not (res["idPattern"] and res["idFromPidHash"] and res["cardRefOk"]):
        bad.append("ID·카드 참조")

    # 5. 같은 입력 → 같은 출력
    if args.rebuild:
        before = digest()
        subprocess.run([sys.executable, "-I", "-X", "utf8", str(HERE / "build_kbo.py"), "--kbo", str(kbo)], check=True, stdout=subprocess.DEVNULL)
        after = digest()
        res["deterministic"] = before == after
        if before != after:
            bad.append("다시 만들면 출력이 달라짐")
    res["ok"] = not bad
    res["problems"] = bad
    (HERE / "out" / "verify.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(res, ensure_ascii=False))
    sys.exit(0 if not bad else 1)


if __name__ == "__main__":
    main()
