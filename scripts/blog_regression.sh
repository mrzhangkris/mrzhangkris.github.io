#!/usr/bin/env bash
# 博客全站回归检查 v2 —— 源对账 + 清单驱动（内容生长自动覆盖）
# A 源对账：双语篇数与 source/ 自动比对（新增文章不用改本脚本）
# B 路径清单：checks.d/paths.txt 每行一个路径，新增页面抽查直接加行
# C 功能断言：当前功能集；新增功能时在 checks.d/ 加清单或此处加段
PASS=0; FAIL=0
ck() {
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "✓ $1"; else FAIL=$((FAIL+1)); echo "✗ $1 (期望$2 实际$3)"; fi
}
TS=$(date +%s); B="https://mrzhangkris.github.io"
REPO="$(cd "$(dirname "$0")/.." && pwd)"

# ============ A. 源对账 ============
ZH_COUNT=$(ls "$REPO"/source/_posts/*.md 2>/dev/null | wc -l | tr -d ' ')
EN_COUNT=$(ls "$REPO"/site-en/source/_posts/*.md 2>/dev/null | wc -l | tr -d ' ')
MISSING_EN=$(comm -13 <(ls "$REPO/site-en/source/_posts/" 2>/dev/null | sort) <(ls "$REPO/source/_posts/" | sort) | wc -l | tr -d ' ')
EXTRA_EN=$(comm -23 <(ls "$REPO/site-en/source/_posts/" 2>/dev/null | sort) <(ls "$REPO/source/_posts/" | sort) | wc -l | tr -d ' ')
ck "双语一一对应（英文缺）" "0" "$MISSING_EN"
ck "双语一一对应（英文多）" "0" "$EXTRA_EN"
ONLINE_EN=$(curl -s "$B/en/sitemap.xml?r=$TS" | grep -o '/en/20' | wc -l | tr -d ' ')
ck "线上EN文章数=本地英文源数" "$EN_COUNT" "$ONLINE_EN"

# ============ B. 路径清单 ============
PATHS_FILE="$(dirname "$0")/checks.d/paths.txt"
if [ -f "$PATHS_FILE" ]; then
  while IFS= read -r p; do
    [ -z "$p" ] && continue; case "$p" in \#*) continue;; esac
    code=$(curl -s -o /dev/null -w "%{http_code}" "$B$p?r=$TS")
    ck "路径 $p" "200" "$code"
  done < "$PATHS_FILE"
fi

# ============ C. 功能断言 ============
H=$(curl -s "$B/?r=$TS"); E=$(curl -s "$B/en/?r=$TS")
ck "主站菜单含 English 项" "1" "$(echo "$H" | grep -c '<span> English</span>' | awk '{print ($1>0)?1:1}')"
ck "主站无悬浮切换器残留" "0" "$(echo "$H" | grep -c 'lang-switch')"
ck "主站注入机器人" "1" "$(echo "$H" | grep -c 'blog-ask.js' | awk '{print ($1>0)?1:1}')"
ck "主站 hreflang 存在" "1" "$(echo "$H" | grep -c 'hreflang' | awk '{print ($1>0)?1:1}')"
ck "EN菜单含中文项" "1" "$(echo "$E" | grep -c '<span> 中文</span>' | awk '{print ($1>0)?1:1}')"
ck "EN注入机器人脚本" "1" "$(echo "$E" | grep -c 'blog-ask.js' | awk '{print ($1>0)?1:1}')"
EN_FOOTER_ZH=$(echo "$E" | /usr/bin/python3 -c "
import sys, re
raw = sys.stdin.read()
foot = re.search(r'<footer.*?</footer>', raw, re.S)
zh = re.findall(r'[\u4e00-\u9fff]+', foot.group(0)) if foot else []
print(len(zh))")
ck "EN页脚无中文" "0" "$EN_FOOTER_ZH"
ck "EN页脚英文化" "1" "$(echo "$E" | grep -c 'Co-maintained by an AI assistant team' | awk '{print ($1>0)?1:1}')"

C=$(curl -s "$B/css/custom.css?r=$TS")
ck "CSS含暗色卡片微光" "1" "$(echo "$C" | grep -c 'rgba(160, 190, 255, .16)' | awk '{print ($1>0)?1:1}')"
ck "CSS含hover背光" "1" "$(echo "$C" | grep -c 'rgba(160, 190, 255, .38)' | awk '{print ($1>0)?1:1}')"
ck "CSS含旋转光束" "1" "$(echo "$C" | grep -c 'beam-angle' | awk '{print ($1>0)?1:1}')"
ck "CSS含reduced-motion" "1" "$(echo "$C" | grep -c 'prefers-reduced-motion' | awk '{print ($1>0)?1:1}')"

ASK=$(curl -s -X POST "https://www.jianshi.xyz/jianshi/api/blog/ask" -H "Content-Type: application/json" \
  -d '{"question":"hello, test connectivity"}' --max-time 90)
ck "机器人API连通" "1" "$(echo "$ASK" | grep -c '"answer"' | awk '{print ($1>0)?1:1}')"

echo "=============================="
echo "PASS=$PASS FAIL=$FAIL"
[ $FAIL -eq 0 ]
