---
title: Hello World —— 博客上线了
date: 2026-09-11 11:00:00
tags: [博客, GitHub Pages]
categories: [随笔]
---

我的个人博客正式上线：<https://mrzhangkris.github.io>

- 托管：GitHub Pages（免费）
- 框架：[Hexo](https://hexo.io) + [Butterfly](https://butterfly.js.org) 主题
- 构建：GitHub Actions 自动部署，本地零依赖
- 工作流：写完 Markdown → `git push` → 自动发布

## 以后怎么写文章

在 `source/_posts/` 目录新建 `标题.md`，开头带上 front matter：

```yaml
---
title: 文章标题
date: 2026-09-11 11:00:00
tags: [标签一, 标签二]
categories: [分类]
---
```

正文用 Markdown，推送即可自动上线。
