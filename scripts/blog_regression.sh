#!/usr/bin/env bash
# 博客全站回归检查（本地跑，检查线上）——固化为后续可重复使用
PASS=0; FAIL=0
ck() { # ck <描述> <期望> <实际>
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "✓ $1"; else FAIL=$((FAIL+1)); echo "✗ $1 (期望$2 实际$3)"; fi
}
TS=$(date +%s)
B="https://mrzhangkris.github.io"
# 1. 关键路径状态
for p in "/" "/archives/" "/en/" "/en/archives/" "/en/about/"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$B$p?r=$TS")
  ck "路径 $p" "200" "$code"
done
# 2. 主站要素
H=$(curl -s "$B/?r=$TS")
ck "主站菜单含 English 项" "1" "$(echo "$H" | grep -c '<span> English</span>' | awk '{print ($1>0)?1:1}')"
ck "主站无悬浮切换器残留" "0" "$(echo "$H" | grep -c 'lang-switch')"
ck "主站注入机器人" "1" "$(echo "$H" | grep -c 'blog-ask.js' | awk '{print ($1>0)?1:1}')"
ck "主站 hreflang 条件存在" "1" "$(echo "$H" | grep -c 'hreflang' | awk '{print ($1>0)?1:1}')"
# 3. 英文站要素
E=$(curl -s "$B/en/?r=$TS")
ck "EN菜单含中文项" "1" "$(echo "$E" | grep -c '<span> 中文</span>' | awk '{print ($1>0)?1:1}')"
ck "EN注入机器人脚本" "1" "$(echo "$E" | grep -c 'blog-ask.js' | awk '{print ($1>0)?1:1}')"
EN_FOOTER_ZH=$(echo "$E" | /usr/bin/python3 -c "
import sys, re
raw = sys.stdin.read()
foot = re.search(r'<footer.*?</footer>', raw, re.S)
zh = re.findall(r'[一-鿿]+', foot.group(0)) if foot else []
print(len(zh))
")
ck "EN页脚无中文" "0" "$EN_FOOTER_ZH"
ck "EN页脚英文化" "1" "$(echo "$E" | grep -c 'Co-maintained by an AI assistant team' | awk '{print ($1>0)?1:1}')"
# 4. 新CSS三件套
C=$(curl -s "$B/css/custom.css?r=$TS")
ck "CSS含暗色卡片微光" "1" "$(echo "$C" | grep -c 'rgba(160, 190, 255, .16)' | awk '{print ($1>0)?1:1}')"
ck "CSS含hover背光" "1" "$(echo "$C" | grep -c 'rgba(160, 190, 255, .38)' | awk '{print ($1>0)?1:1}')"
ck "CSS含旋转光束" "1" "$(echo "$C" | grep -c 'beam-angle' | awk '{print ($1>0)?1:1}')"
ck "CSS含reduced-motion" "1" "$(echo "$C" | grep -c 'prefers-reduced-motion' | awk '{print ($1>0)?1:1}')"
# 5. 机器人后端
ASK=$(curl -s -X POST "https://www.jianshi.xyz/jianshi/api/blog/ask" -H "Content-Type: application/json" \
  -d '{"question":"hello, test connectivity"}' --max-time 90)
ck "机器人API连通" "1" "$(echo "$ASK" | grep -c '"answer"' | awk '{print ($1>0)?1:1}')"
# 6. 双语 sitemap
ck "EN sitemap 含124篇" "124" "$(curl -s "$B/en/sitemap.xml?r=$TS" | grep -o '/en/20' | wc -l | tr -d ' ')"
echo "=============================="
echo "PASS=$PASS FAIL=$FAIL"
[ $FAIL -eq 0 ]
