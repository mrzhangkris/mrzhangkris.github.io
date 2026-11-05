# SEO 增强清单

## 已完成

### 1. Open Graph 标签
- [x] 启用 `Open_Graph_meta`
- [x] 配置 Twitter Card (`summary_large_image`)
- [x] 设置 Twitter ID 和站点链接

### 2. 结构化数据 (JSON-LD)
- [x] 启用 `structured_data`
- [x] 添加站点别名（中/英/用户名）

### 3. 站点验证
- [x] 添加 Google Search Console 占位符
- [x] 添加百度搜索资源平台占位符
- [x] 添加 Bing Webmaster Tools 占位符

### 4. 多语言 SEO
- [x] 添加 `hreflang` 标签（zh-CN / en / x-default）
- [x] 添加 `canonical` URL
- [x] robots.txt 包含双语 sitemap

### 5. Meta 信息
- [x] 增强 description（包含关键词）
- [x] 扩展 keywords（MCP、AI Agent、Linux 等）
- [x] 添加 author/publisher/copyright meta

### 6. CI/CD
- [x] 创建 CI workflow（lint + build + deploy）
- [x] 添加 markdownlint 检查
- [x] 添加 PR 预览构建
- [x] 添加内部链接检查

## 待手动完成

### 1. 填入站点验证码
获取后填入 `_config.butterfly.yml` 的 `site_verification` 部分：
- Google: https://search.google.com/search-console
- 百度: https://ziyuan.baidu.com/
- Bing: https://www.bing.com/webmasters

### 2. 配置分析工具
获取 Tracking ID 后填入 `_config.butterfly.yml`：
- 百度统计（推荐国内流量）
- Google Analytics（推荐国际流量）
- Umami（隐私友好，可自托管）

### 3. 提交 Sitemap
- [ ] Google Search Console 提交 sitemap.xml
- [ ] 百度搜索资源平台提交 sitemap.xml
- [ ] Bing Webmaster Tools 提交 sitemap.xml

### 4. 每篇文章添加 description
在 front-matter 中为重要文章添加 `description` 字段：
```yaml
---
title: 文章标题
date: 2026-01-01
tags: [标签]
description: 这篇文章的简短描述，用于 SEO meta 标签
cover: /img/cover.jpg
---
```

## 可选增强

### 1. 安装 SEO 插件
```bash
npm install hexo-seo --save
```

### 2. 添加面包屑导航
Butterfly 主题支持，可在 `_config.butterfly.yml` 启用：
```yaml
breadcrumb:
  enable: true
```

### 3. 图片优化
- 使用 WebP 格式
- 添加 alt 文本
- 启用懒加载

### 4. 性能优化
- 启用 CDN（jsDelivr/Cloudflare）
- 压缩静态资源
- 添加 Service Worker
