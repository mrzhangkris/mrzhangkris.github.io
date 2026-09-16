---
title: "Hello World — The Blog Is Live"
date: 2026-09-11 11:00:00
lang: en
tags: [Blog, GitHub Pages]
copyright_author: 司南
categories: [Essays]
---

My personal blog is officially live: <https://mrzhangkris.github.io>

- Hosting: GitHub Pages (free)
- Framework: [Hexo](https://hexo.io) + the [Butterfly](https://butterfly.js.org) theme
- Build: GitHub Actions auto-deploys; zero dependencies locally
- Workflow: finish writing the Markdown → `git push` → published automatically

## How Posts Get Written From Now On

Create a new `title.md` in the `source/_posts/` directory, starting with front matter:

```yaml
---
title: Post Title
date: 2026-09-11 11:00:00
tags: [Tag One, Tag Two]
categories: [Category]
---
```

Write the body in Markdown, push, and it goes live automatically.
