"""Xuất dữ liệu học từ các module Python cũ sang JSON cho app Tauri.
Chạy từ thư mục gốc dự án:  .venv/bin/python app/scripts/export_data.py
(Chạy lại mỗi khi sửa data/*.py. Bảng pinyin công thức ngữ pháp patternPinyin.json được sửa trực tiếp, không sinh ở đây.)"""
import json, os, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)
OUT = os.path.join(ROOT, "app", "src", "data")
os.makedirs(OUT, exist_ok=True)

from data.hsk1_v3 import HSK1_V3_VOCAB
from data.hsk2_v3 import HSK2_V3_VOCAB
from data.hsk3_v3 import HSK3_V3_VOCAB
from data.hsk4_v3 import HSK4_V3_VOCAB
from data.hsk5_v3 import HSK5_V3_VOCAB
from data.hsk6_v3 import HSK6_V3_VOCAB
from data.grammar import GRAMMAR_DATA
from data.courses import COURSE_TOPICS
from data.collocations import LEVELS as COLLO

# Thứ tự/nhãn cấp HSK (trước đây lấy từ data/vocabulary.py — file đó import PySide6 nên không dùng nữa)
LEVEL_ORDER = ["hsk1_v3", "hsk2_v3", "hsk3_v3", "hsk4_v3", "hsk5_v3", "hsk6_v3"]
LEVEL_LABELS = {k: f"HSK{i}" for i, k in enumerate(LEVEL_ORDER, 1)}
LEVELS = dict(zip(LEVEL_ORDER, [HSK1_V3_VOCAB, HSK2_V3_VOCAB, HSK3_V3_VOCAB, HSK4_V3_VOCAB, HSK5_V3_VOCAB, HSK6_V3_VOCAB]))


def word(t):
    return {"zh": t[0], "vi": t[1], "pinyin": t[2], "exCn": t[3], "exVi": t[4], "pySent": t[5]}


def dump(name, obj):
    path = os.path.join(OUT, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    print(name, os.path.getsize(path) // 1024, "KB")


dump("vocab.json", {
    "order": LEVEL_ORDER,
    "labels": LEVEL_LABELS,
    "levels": {k: [word(t) for t in v] for k, v in LEVELS.items()},
})
dump("grammar.json", {
    lv: [{"title": g["title"], "pattern": g.get("pattern", ""), "explain": g.get("explain", ""),
          "notes": list(g.get("notes", [])),
          "examples": [list(e) for e in g.get("examples", [])]} for g in items]
    for lv, items in GRAMMAR_DATA.items()
})
dump("courses.json", {k: [word(t) for t in v] for k, v in COURSE_TOPICS.items()})


def norm(v):
    if isinstance(v, dict):
        return {k: norm(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        if v and all(isinstance(x, (list, tuple)) for x in v) and all(len(x) >= 2 for x in v):
            return [word(tuple(x) + ("",) * (6 - len(x))) for x in v]
        return [norm(x) for x in v]
    return v


dump("collocations.json", norm(COLLO))

for kind in ("reading", "conversations"):
    for f in sorted(os.listdir(os.path.join(ROOT, "data", kind))):
        if f.endswith(".json"):
            os.makedirs(os.path.join(OUT, kind), exist_ok=True)
            shutil.copy(os.path.join(ROOT, "data", kind, f), os.path.join(OUT, kind, f))
print("done")
