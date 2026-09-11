---
title: "Nginx Rewrite 模块入门：重写、重定向与防循环"
date: 2024-05-21 10:09:19
updated: 2026-09-11
categories: [技术]
tags: [运维]
copyright_author: 司南
cover: /images/csdn/covers/rewrite-csdn139085203.png
---

旧链接要平滑跳到新地址、请求路径要按语言分发，这类需求在 Nginx 上都归 rewrite 模块管：它基于正则匹配和条件判断来修改请求的 URI，重写结果既可以走内部重定向，也可以把浏览器引到别的 URL。下面用三个由浅入深的例子说明常见写法。

### 使用场景

1. 简化用户请求的 URL 路径。
2. 为缺失的文件提供友好的错误页面。
3. 把旧 URL 重定向到新 URL。
4. 根据条件把用户导向不同的网站或内容。

### 示例 1：基本的 URL 重写

把 `example.com/old-path` 永久重定向到 `example.com/new-path`：

```nginx
server {
  listen 80;
  server_name example.com;

  # 基本的 URL 重写
  rewrite ^/old-path$ /new-path permanent;

  location / {
    try_files $uri $uri/ =404;
  }
}
```

两条规则各自的含义：

- `rewrite ^/old-path$ /new-path permanent;` 用正则匹配请求的 URI，改写为新路径，并返回 301 永久重定向状态码。
- `try_files $uri $uri/ =404;` 让 Nginx 先尝试请求的实际文件或目录，找不到就返回 404。

### 示例 2：使用变量重写 URL

用一个变量表示用户的语言版本，实现动态 URL 重写——中文用户请求 `/docs/...` 时自动落到 `zh` 目录：

![配图](/images/csdn/figures/rewrite-csdn139085203.png)

```nginx
server {
    listen 80;
    server_name example.com;

    # 动态 URL 重写
    set $lang en;

    if ($http_accept_language ~* "^zh") {
        set $lang zh;
    }

    rewrite ^/docs/(.*)$ /$lang/docs/$1 break;

    location / {
        try_files $uri $uri/ =404;
    }
}
```

规则含义：

- `set $lang en;` 设置默认语言变量为英语。
- `if ($http_accept_language ~* "^zh") { set $lang zh; }` 检查请求头中的语言偏好，是中文就改写变量为 zh。
- `rewrite ^/docs/(.*)$ /$lang/docs/$1 break;` 把 `/docs/` 下的所有路径重写到对应语言目录，`$1` 保留原路径后半段，`break` 终止后续重写处理。

### 示例 3：条件重写和防止循环

当重写目标还可能再次命中重写条件时，要加标记防止规则自己无限循环：

```nginx
server {
    listen 80;
    server_name example.com;

    # 防止循环重写
    set $done 0;

    if ($uri ~ ^/old-path$) {
        set $done 1;
    }

    if ($done) {
        rewrite ^ /new-path break;
    }

    location / {
        try_files $uri $uri/ =404;
    }
}
```

规则含义：

- `set $done 0;` 初始化标记变量，记录是否已完成重写。
- `if ($uri ~ ^/old-path$) { set $done 1; }` URI 命中旧路径时把标记置 1。
- `if ($done) { rewrite ^ /new-path break; }` 标记已设置才执行重写，并用 `break` 终止重写规则的处理，避免新路径再次进入判断造成死循环。

## 注意事项

- **重定向类型**：`permanent`（301）和 `redirect`（302）是两种主要选择，301 会告诉搜索引擎和浏览器地址永久变更，按需选对。
- **性能**：过于复杂的正则会影响性能，尽量简化表达式，避免不必要的重写规则。
- **少用 if**：if 里塞复杂逻辑会让配置难读难调；官方文档也建议只在确实需要时使用 if。
- **先测再上**：rewrite 改的是流量走向，任何更改都应先在测试环境验证，避免影响线上请求。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
