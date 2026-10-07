# 博客回归检查

> 2026-10-07：本目录原名 `scripts/`，但 Hexo 会把 `scripts/` 下所有文件当插件加载，
> 导致每次构建报 4 条 `Script load failed` ERROR（README.md / blog_regression.sh /
> paths.txt / blog-ask.test.mjs）。故非 Hexo 脚本迁至本目录 `checks/`；
> `scripts/` 只保留真正需要 Hexo 加载的 `hreflang-zh.js`。

## blog_regression.sh
线上全站回归（L1 curl 层），19 项检查，约 30 秒：
- 两站关键路径 200
- 菜单双语项（主站 English / EN 站 中文）
- 悬浮切换器无残留 / 机器人注入 / hreflang
- custom.css 三件套（暗色微光 / hover 背光 / 旋转光束 / reduced-motion）
- 机器人 API 连通 / 双语 sitemap

用法：`bash checks/blog_regression.sh`
退出码：全过 0，有失败 1。

## diff_guard.py —— 提交前格式漂移闸门

拦截「内容只改一处、整份文件全被标记改动」这类污染 diff 的错误。

2026-10-07 实测教训：用 Python `open(p,'w')` 改一个 CRLF 行尾的 yaml，
write 默认写 LF，1214 行全部被标记为改动；内容一个字符没丢，但真正的
3 行改动被噪音淹没，提交完全无法 review。这类错误靠人肉看 diff 统计
迟早漏，故做成闸门。

规则：

| 级别 | 判定 |
|---|---|
| FAIL | 格式漂移：去行尾/行尾空白/BOM 后内容相同但字节不同 |
| FAIL | 编码漂移：HEAD 是 UTF-8，改后不再是合法 UTF-8 |
| WARN | 单文件改动 > 400 行（整文件重写/批量替换需人确认） |

```bash
python3 checks/diff_guard.py --self-test   # 先自测闸门本身有效
python3 checks/diff_guard.py               # 检查暂存区
```

**已挂进 pre-commit 钩子**（`.githooks/`，随 git 跟踪）：

```bash
git config core.hooksPath .githooks        # clone 后执行一次即可启用
```

绕过（仅在确认是整文件重写时）：`git commit --no-verify`

自测里也踩过一次坑：闸门脚本自己的 `git show` 没带 `cwd`，跑的是当前
仓库而不是临时测试仓，导致自测「漏掉」坏样本。是自测抓出来的——
**闸门没验证过就装，等于没装**。

## 浏览器层（L2）与内容层（L3）说明
- L2（chrome-devtools 实测光效/机器人 UI/控制台）暂为手动流程，要点见
  `~/.agents/skills/blog-regression-check/SKILL.md`（若已批准创建）
- L3 内容质量门：中文 `check_post`（如 blog-pipeline 技能内置）、英文
  `python3 site-en/checks/check_en_post.py site-en/source/_posts/*.md`

## 踩坑备忘（检查结果解读必读）
1. **浏览器缓存假象**：页面/子资源被 disk cache 缓存旧版，DOM 实测「异常」未必是缺陷。
   标准动作：`fetch('/css/custom.css?bypass=' + Date.now())` 对比服务器真相；
   或 `fetch('/js/xxx.js?bypass=' + Date.now())`。curl 带 `?r=时间戳` 同理。
2. **CDN 传播窗口**：push 后 30-60s 内加 cache-buster 可能命中未传播节点返回假 404，
   `gh run watch` 确认部署完成后再等 30s 验证。
3. **CSS transition 时序**：读光效/颜色前等 600ms+（box-shadow 有 0.55s 过渡）。
4. **Butterfly 结构**：卡片是 `#recent-posts > .recent-post-items > .recent-post-item`
   （多一层容器），选择器必须用后代选择器。
