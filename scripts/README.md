# 博客回归检查脚本

## blog_regression.sh
线上全站回归（L1 curl 层），19 项检查，约 30 秒：
- 两站关键路径 200
- 菜单双语项（主站 English / EN 站 中文）
- 悬浮切换器无残留 / 机器人注入 / hreflang
- custom.css 三件套（暗色微光 / hover 背光 / 旋转光束 / reduced-motion）
- 机器人 API 连通 / 双语 sitemap

用法：`bash scripts/blog_regression.sh`
退出码：全过 0，有失败 1。

## 浏览器层（L2）与内容层（L3）说明
- L2（chrome-devtools 实测光效/机器人 UI/控制台）暂为手动流程，要点见
  `~/.agents/skills/blog-regression-check/SKILL.md`（若已批准创建）
- L3 内容质量门：中文 `check_post`（如 blog-pipeline 技能内置）、英文
  `site-en/scripts/check_en_post.py --all`

## 踩坑备忘（检查结果解读必读）
1. **浏览器缓存假象**：页面/子资源被 disk cache 缓存旧版，DOM 实测「异常」未必是缺陷。
   标准动作：`fetch('/css/custom.css?bypass=' + Date.now())` 对比服务器真相；
   或 `fetch('/js/xxx.js?bypass=' + Date.now())`。curl 带 `?r=时间戳` 同理。
2. **CDN 传播窗口**：push 后 30-60s 内加 cache-buster 可能命中未传播节点返回假 404，
   `gh run watch` 确认部署完成后再等 30s 验证。
3. **CSS transition 时序**：读光效/颜色前等 600ms+（box-shadow 有 0.55s 过渡）。
4. **Butterfly 结构**：卡片是 `#recent-posts > .recent-post-items > .recent-post-item`
   （多一层容器），选择器必须用后代选择器。
