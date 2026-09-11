---
title: "深入理解Nginx try_files：用途、使用场景、注意事项和示例"
date: 2024-05-26 09:00:00
categories: [技术]
tags: [Nginx]
copyright_author: 张鹏
cover: /images/csdn/covers/nginx-try-files-csdn139177618.png
---

Nginx 是高性能的 HTTP 和反向代理服务器，而 try\_files 是其功能强大的模块之一。try\_files 指令用于定义一组文件或 URI，Nginx 将依次检查这些文件或 URI，直到找到一个存在并可访问的文件或 URI。本文将深度解析 try\_files 的用途、使用场景、注意事项，并通过示例帮助读者更好地理解这一指令。

### 用途

try\_files 指令主要用于增强网站的灵活性和容错性。其主要用途包括：

1. **静态文件处理**：优先查找静态文件，例如 HTML、CSS 和 JavaScript 文件。
2. **回退机制**：提供多个候选路径，按顺序查找资源，直至找到一个存在的资源。
3. **伪静态化处理**：结合伪静态规则，将“不存在的”静态请求转交给动态请求处理程序，如 PHP 或后端应用服务器。
4. **SEO 优化**：将请求重定向到特定的 SEO 优化页面。

### 使用场景

#### 1\. 静态文件优先

当请求一个 URL 时，try\_files 可以优先查找对应的静态文件，若不存在则转交给后端服务处理。例如，一个静态博客可能会先查找对应的 HTML 文件，不存在则查找 Markdown 文件并进行动态渲染。

#### 2\. 错误页面处理

try\_files 也可以用于错误页面处理，例如尝试找不同的错误页面文件（404.html 或 default.html）来提供更友好的用户体验。

#### 3\. 简化 URI 映射

比如，对某些路径模式进行重写，简化站点内部的 URI 映射关系，将静态文件的结构混乱度降到最低。

### 注意事项

1. 顺序问题：
2. try\_files 按顺序依次检查每一个文件或 URI，遇到第一个可用的文件或 URI 时即终止检查。因此，文件或 URI 的顺序很重要。
3. 配置文件优化：
4. 复杂的 try\_files 指令可能导致 Nginx 配置文件复杂化，建议优化和简化配置文件，同时了解 Nginx 处理流程。
5. 权限和安全：
6. 确保指定路径在 Nginx 工作进程具有适当的读取权限，避免因权限不足导致访问失败。

### 示例和注释

#### 示例 1: 静态文件优先

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

#### 示例 2: 动态请求处理

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

#### 示例 3: 错误页面处理

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

#### 示例 4: SEO 优化

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

### 总结

Nginx 的 try\_files 指令提供了灵活有效的资源处理机制，帮助开发者更易于管理静态文件和动态请求之间的关系。try\_files 可以用于各种场景的需求，并使站点配置更加简洁高效。理解其工作原理和注意事项，能更加高效地利用 Nginx，提升站点的性能和用户体验。

---

> 本文迁移自作者 CSDN 博客，2024-05-26 首发于 CSDN，内容保持原貌。
