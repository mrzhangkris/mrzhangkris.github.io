# 英文翻译规范（REWRITE_SPEC_EN）

Phase 2 全量翻译流水线的单点规范。每批 agent 必须遵守；质量门 `check_en_post.py` 逐条把关。

## 核心红线

1. **文件名与中文源完全同名**（如 `ai-cordis-patch-deep-dive.md` → `site-en/source/_posts/ai-cordis-patch-deep-dive.md`）。语言切换器按同名镜像 URL，改名 = 断链。
2. **技术内容 100% 保真**：不增删事实、不改数字/命令/输出/报错/URL/配置值。禁止注水扩写，禁止为凑字数加内容。
3. **段落结构一一对应**：章节数、段落数与原文一致，不合并不拆分。

## front matter 规则

| 字段 | 规则 | 示例 |
|------|------|------|
| title | 译成地道英文标题（不是直译） | 「把 Docker 容器当实验田」→ "Docker Containers as an Experimental Lab: A Playbook for Hands-On Batch Testing" |
| date / cover / copyright_author | 原样保留（作者笔名不译） | `copyright_author: 干将` |
| lang | 新增 `lang: en` | |
| tags | 译英文：运维→Ops，自动化→Automation，教程→tutorial；纯技术词原样：Docker/Nginx/MCP/dsh | |
| categories | 结构不变，名称译英：技术→Tech，AI 工程→AI Engineering，独立开发→Indie Development，随笔→Essays；二级子类意译 | |

## 正文规则

- 语气：自然流畅的英文博客，不是翻译腔；主动语态优先。
- 代码块/命令/JSON/表格数据原样不动；**代码块内的中文注释要译成英文**。
- 图片引用 `![](...)` 路径不变（走主站绝对路径）；图片标题 alt 文字译英。
- 站内中文文章链接：保留原 URL，链接文字后加 " (Chinese)"。
- 中文报错原文在英文叙述语境中出现时：英文释义为主，原文放括注——`"No matches (only text files under docs/ are indexed)" (原文：「无匹配…」)`。
- 专有名词不译：dsh、DeepSeek Harness、MCP、Butterfly、Hexo、cordis.patch.yml、渐识（Jianshi 可括注）、海龟汤（Turtle Soup）、司南/烛龙/干将（Sinan/Zhulong/Ganjiang 首次出现可括注）。
- 中文字数与英文词数的自然比率约 0.8 词/汉字（技术文含大量代码时更低）；**词数显著高于该比率 = 注水，显著低于 = 漏译**，自查。

## 验收门（每批完成后必跑）

```bash
cd site-en && /usr/bin/python3 scripts/check_en_post.py source/_posts/<本批文件...>
```

全 PASS 才算批次完成；FAIL 项修复后复跑。
