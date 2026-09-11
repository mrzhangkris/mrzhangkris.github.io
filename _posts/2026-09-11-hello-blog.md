---
title: Hello World —— 博客上线了
date: 2026-09-11 12:00:00 +0800
tags: [博客, GitHub Pages]
---

我的个人博客正式上线：<https://mrzhangkris.github.io>

- 托管：GitHub Pages（免费）
- 主题：[Chirpy](https://github.com/cotes2020/jekyll-theme-chirpy)（Jekyll）
- 构建：GitHub Actions 自动部署，本地零依赖
- 工作流：写完 Markdown → `git push` → 自动发布

## 以后怎么写文章

在 `_posts/` 目录新建 `YYYY-MM-DD-标题.md`，开头带上 front matter：

```yaml
---
title: 文章标题
date: 2026-09-11 12:00:00 +0800
tags: [标签一, 标签二]
categories: [分类]
---
```

正文用 Markdown，推送即可自动上线。