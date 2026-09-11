---
title: "Nginx try_files 指令：用途、使用场景、注意事项和示例"
date: 2024-05-26 09:00:00
updated: 2026-09-11
categories: [技术]
tags: [Nginx]
copyright_author: 司南
cover: /images/csdn/covers/nginx-try-files-csdn139177618.png
---

很多站点都会遇到同一类问题：用户请求的 URL 在磁盘上没有对应的文件，直接返回 404 并不是想要的行为。Nginx 的 try_files 指令就是处理这种情况的：定义一组文件或 URI，按顺序依次检查，找到第一个存在且可访问的就返回，全部落空时走指定的回退。

## try_files 能做什么

try_files 指令主要用于增强网站的灵活性和容错性，主要用途包括：

1. **静态文件处理**：优先查找静态文件，例如 HTML、CSS 和 JavaScript 文件。
2. **回退机制**：提供多个候选路径，按顺序查找资源，直至找到一个存在的资源。
3. **伪静态化处理**：结合伪静态规则，将"不存在的"静态请求转交给动态请求处理程序，如 PHP 或后端应用服务器。
4. **SEO 优化**：将请求重定向到特定的 SEO 优化页面。

## 典型使用场景

### 静态文件优先

请求一个 URL 时，try_files 先查找对应的静态文件，不存在再转交给后端服务处理。比如一个静态博客，可以先找对应的 HTML 文件，找不到再查找 Markdown 文件并进行动态渲染。

### 错误页面处理

try_files 也可以用于错误页面处理：依次尝试不同的错误页面文件（如 404.html 或 default.html），给用户更友好的体验，而不是甩一个默认错误页。

### 简化 URI 映射

对某些路径模式进行重写，可以简化站点内部的 URI 映射关系，把磁盘上静态文件结构的混乱度降到最低。

## 配置示例

### 示例 1：静态文件优先，回退到入口页

![配图](/images/csdn/figures/nginx-try-files-csdn139177618.png)

```nginx
server {
  listen 80;
  server_name example.com;

  location / {
    try_files $uri $uri/ /index.html;
    # 尝试从请求 URI 获取文件，如果不存在再尝试 URI 作为目录，
    # 最后回退到 /index.html 文件
  }
}
```

这条配置的查找顺序是：`$uri`（URL 对应的文件）→ `$uri/`（URL 对应的目录）→ `/index.html`。前两步都没命中时，请求会被交给 /index.html。这类回退到入口页的写法，在静态博客和单页应用部署里很常见。

### 示例 2：动态请求处理

```nginx
server {
  listen 80;
  server_name example.com;

  location / {
    try_files $uri $uri/ /index.php?$query_string;
    # 首先尝试请求 URI 或目录，
    # 若不存在则回退到 index.php 并传递查询字符串
  }
}
```

和示例 1 的区别在最后一跳：找不到静态文件时不是回退到 HTML，而是交给 index.php 处理，并用 `?$query_string` 把原始查询参数带上。这就是前面说的伪静态化处理，PHP 应用常用这种写法。

### 示例 3：错误页面处理

```nginx
server {
  listen 80;
  server_name example.com;

  error_page 404 /404.html;

  location / {
    try_files $uri $uri/ =404;
    # 尝试请求 URI 或目录，如果均不存在则返回 404 错误页面
  }

  location = /404.html {
    root /path/to/error/pages;
  }
}
```

这里回退目标换成了 `=404`：文件和目录都不存在时直接返回 404 状态码，而不是再找一个兜底文件。`error_page 404 /404.html` 负责把 404 响应替换成自定义错误页，最后那个精确匹配的 location 则指定了错误页文件所在的目录。

### 示例 4：SEO 优化

```nginx
server {
  listen 80;
  server_name example.com;

  location / {
    try_files $uri $uri/ /optimized-seo-page.php;
    # 在 URI 和目录均不存在的情况下，重定向到 SEO 优化的 PHP 页面
  }
}
```

面向 SEO 场景的变体：URI 和目录都不存在时，把请求交给一个专门优化过的 SEO 页面，而不是让访问者直接吃到 404。

## 注意事项

1. **顺序很重要**：try_files 按顺序依次检查每一个文件或 URI，遇到第一个可用的就终止检查。候选路径的排列顺序直接决定实际行为，写错顺序，命中的就不是你想要的那个。
2. **别把配置写复杂**：复杂的 try_files 会让 Nginx 配置文件难以维护。建议保持简洁，同时了解 Nginx 的处理流程，再动手堆候选路径。
3. **权限**：确保指定路径对 Nginx 工作进程有适当的读取权限，避免因权限不足导致访问失败。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
