#!/usr/bin/env python3
"""英文文章质量检查器（Phase 2 翻译流水线的验收门）
用法: /usr/bin/python3 site-en/scripts/check_en_post.py [--all | 文件.md ...]
检查项:
  1. front matter 存在且含 title/date/lang: en
  2. title 与 categories/tags 无中文残留（tags 允许纯技术词）
  3. 正文中文残留率: 非代码区每千词 > 8 个中文字符 → FAIL
  4. 图片路径以 / 开头（绝对路径，走主站）
  5. 代码块围栏配对完整
退出码: 有 FAIL 则 1
"""
import sys, re, io
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
POSTS = ROOT / "source" / "_posts"
HAN = re.compile(r"[\u4e00-\u9fff]")
FENCE = re.compile(r"^\s*(```|~~~)")

def strip_code(text: str):
    """去掉围栏代码块与行内代码，返回普通文本"""
    out, in_fence = [], False
    for line in text.splitlines():
        if FENCE.match(line):
            in_fence = not in_fence
            continue
        if not in_fence:
            out.append(re.sub(r"`[^`]*`", "", line))
    return "\n".join(out)

def check(path: Path):
    raw = path.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---\n", raw, re.S)
    if not m:
        return ["FAIL: 无 front matter"]
    fm_text, body = m.group(1), raw[m.end():]
    problems = []
    try:
        import yaml
        fm = yaml.safe_load(fm_text)
    except Exception as e:
        return [f"FAIL: front matter YAML 解析失败 {e}"]
    if not fm.get("title"):
        problems.append("FAIL: 缺 title")
    if HAN.search(str(fm.get("title", ""))):
        problems.append(f"FAIL: title 有中文: {fm['title']}")
    if str(fm.get("lang", "")) != "en":
        problems.append("FAIL: 缺 lang: en")
    if not fm.get("date"):
        problems.append("FAIL: 缺 date")
    cats = fm.get("categories") or []
    if isinstance(cats, str): cats = [cats]
    for c in cats:
        if HAN.search(str(c)):
            problems.append(f"FAIL: categories 有中文: {c}")
    plain = strip_code(body)
    # 「…」内是刻意保留的原文引用（如中文报错对照），不计入残留；
    # 真正的漏翻是成段连续中文 → 用「引号外残留率 + 引号外最长连续段」双指标
    outside = re.sub(r"「[^」]*」", "", plain)
    words = len(re.findall(r"[A-Za-z']+", plain))
    han_hits = len(HAN.findall(outside))
    if words > 50 and han_hits / max(words, 1) * 1000 > 8:
        problems.append(f"FAIL: 正文中文残留（引号外）{han_hits} 字 / {words} 词（阈值 8‰）")
    longest = 0
    for run in re.findall(r"[\u4e00-\u9fff]+", outside):
        longest = max(longest, len(run))
    if longest > 20:
        problems.append(f"FAIL: 疑似漏翻段落（引号外连续中文 {longest} 字）")
    if body.count("```") % 2:
        problems.append("FAIL: 代码围栏不配对")
    for img in re.findall(r"!\[[^\]]*\]\(([^)]+)\)", body):
        if not img.startswith("/"):
            problems.append(f"WARN: 图片非绝对路径: {img[:60]}")
    return problems or ["PASS"]

if __name__ == "__main__":
    args = sys.argv[1:]
    files = sorted(POSTS.glob("*.md")) if (not args or args == ["--all"]) else [Path(a) for a in args]
    failed = 0
    for f in files:
        rel = f.relative_to(ROOT.parent) if f.is_absolute() else f
        results = check(f)
        status = "FAIL" if any(r.startswith("FAIL") for r in results) else "PASS"
        if status == "FAIL": failed += 1
        print(f"[{status}] {rel}")
        for r in results:
            if r != "PASS":
                print(f"    {r}")
    print(f"\n{len(files)} 篇检查完毕，{failed} 篇 FAIL")
    sys.exit(1 if failed else 0)
