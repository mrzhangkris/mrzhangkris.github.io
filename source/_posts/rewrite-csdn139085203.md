---
title: "Nginx Rewrite 模块入门：重写、重定向与防循环"
date: 2024-05-21 10:09:19
updated: 2026-09-14
categories: [技术, 运维]
tags: [运维]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1630233313373-a03df7d139c9?w=1600&q=80&fm=jpg
---

旧链接要平滑跳到新地址、请求路径要按语言分发，这类需求在 Nginx 上都归 rewrite 模块管：它基于正则匹配和条件判断来修改请求的 URI，重写结果既可以走内部重定向（用户无感知），也可以把浏览器引到别的 URL（返回 301/302）。rewrite 的规则写起来只有一行，但"改写后的 URI 会重新走一遍匹配流程"这个特性让新手经常踩进死循环。本文在 nginx:alpine 容器里把三个典型场景逐个跑通，包括一次真实的循环翻车与修复。

## 实验环境

- nginx:alpine（nginx/1.31.5），配置写在 /etc/nginx/conf.d/default.conf
- 静态目录 /usr/share/nginx/html 下预置了 new-path、zh/docs/intro、en/docs/intro 几个文件作为重写目标
- 验证工具 curl，全部在容器本机 127.0.0.1 完成

## 先搞清楚 rewrite 在哪一步执行

一句话：**server 段的 rewrite 每个请求只执行一遍；location 段的 rewrite 改完 URI 后会触发内部重定向，重新走一遍 location 匹配，可能再次命中改写规则**。这决定了两类典型故障的形态，后文实例 3 会实测对照：server 段的自我改写只跑一遍（落到 404），location 段的自我改写才会循环（被 nginx 掐掉返回 500）。

四个改写标记先记住：

| 标记 | 行为 | 典型用途 |
|------|------|---------|
| （无） | 改完继续处理后续 rewrite 指令 | 规则链 |
| `last` | 停止 rewrite 处理，用新 URI 重新匹配 location | location 内改写后交给别的 location |
| `break` | 停止 rewrite 处理，留在当前 location 直接处理请求 | 改写完就地找文件/转发 |
| `redirect` / `permanent` | 返回 302 / 301 给浏览器，终止内部处理 | 对外跳转 |

## 实例 1：旧路径 301 到新路径

把 `example.com/old-path` 永久重定向到 `example.com/new-path`：

```nginx
server {
  listen 80;
  server_name example.com;
  root /usr/share/nginx/html;

  rewrite ^/old-path$ /new-path permanent;

  location / {
    try_files $uri $uri/ =404;
  }
}
```

- `rewrite ^/old-path$ /new-path permanent;` 正则锚定整个 URI，命中即返回 301；`permanent` 与 `redirect` 的唯一区别是状态码（301 永久 / 302 临时），搜索引擎和浏览器会按 301 更新索引与缓存。
- `try_files $uri $uri/ =404;` 跳转目标落地后先找实际文件，找不到返回 404。

![配图1](/images/csdn/figures/rewrite-csdn139085203-1.png)

实测：响应头拿到 `301` 和 `Location: http://127.0.0.1/new-path`，跟随跳转后拿到目标文件内容。

## 实例 2：按请求头重写——语言目录分发

中文用户请求 `/docs/...` 时自动落到 `zh` 目录，其他语言默认 `en`：

```nginx
server {
    listen 80;
    server_name example.com;
    root /usr/share/nginx/html;

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

- `set $lang en;` 设默认语言；`if ($http_accept_language ~* "^zh")` 检查请求头，`zh-CN`、`zh-TW` 这类以 zh 开头的值都会命中（`~*` 不区分大小写）。
- `rewrite ^/docs/(.*)$ /$lang/docs/$1 break;` 把 `/docs/` 下的路径改写到语言目录，`$1` 保留原路径后半段；`break` 让改写停在当前 location，就地找文件。

![配图2](/images/csdn/figures/rewrite-csdn139085203-2.png)

实测：同一个 URI `/docs/intro`，带 `Accept-Language: zh-CN` 的请求拿到 zh 目录的内容，不带头部的请求拿到 en 目录的内容——改写完全由服务端完成，URL 对用户透明。

## 实例 3：防循环——改写目标别再命中源正则

当改写目标还可能再次命中改写条件时，规则会自我循环。先看翻车现场——location 内一条"越改越长"的规则：

```nginx
location / {
    rewrite ^/old/(.*)$ /old/x$1 last;
    try_files $uri $uri/ =404;
}
```

`/old/a` 被改成 `/old/xa`，仍命中 `^/old/`，再次触发内部重定向……直到超过 nginx 允许的 10 次内部重定向上限：

![配图3](/images/csdn/figures/rewrite-csdn139085203-3.png)

错误日志给出明确定位：`rewrite or internal redirection cycle while processing "/old/xxxxxxxxxxxa"`。修复方式是让**目标不再命中源正则**——把目标前缀换成 `new`：

```nginx
rewrite ^/old/(.*)$ /new/$1 last;
```

实测修复后同一 URI 直接 200。

如果业务上确实需要在 server 段做条件改写（老配置里常见的写法），可以用标记变量 + `break` 收口：

```nginx
server {
    listen 80;
    server_name example.com;
    root /usr/share/nginx/html;

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

- `set $done 0;` 初始化标记；命中旧路径置 1，才执行改写。
- `rewrite ^ /new-path break;` 的 `break` 终止后续 rewrite 处理，请求停在当前阶段，避免新 URI 再进一轮判断。

实测 `/old-path` 返回 200 和 new-path 的内容，规则只跑一遍，无循环。

## 错误写法对比

同样一条"自我改写"规则，放的位置不同，故障形态完全不同：

| 写法 | 实测结果 | 原因 |
|------|---------|------|
| 自我改写放 **server 段**（无标记） | `404`，不循环 | server 段 rewrite 每请求只跑一遍，改完直接选 location 找文件，找不到就 404 |
| 自我改写放 **location 段**（last） | `500` + cycle 日志 | location 内改写触发内部重定向，重新进 location，规则再次命中直到超上限 |
| `if ($done) { rewrite ... }` 不加 break | 可能多轮改写 | 缺 break 时后续 rewrite 指令继续处理，规则链复杂时埋循环隐患 |

排查口诀：改写规则放进了 location，就先问一句"新 URI 还会不会命中这条正则"。

## 注意事项

- **选对重定向类型**：域名迁移、路径永久变更用 `permanent`（301）；临时维护、灰度跳转用 `redirect`（302）。错用 302 会让搜索引擎长期不更新索引。
- **少用 if**：if 指令的执行语义有诸多限制（官方 Wiki 专页 "If is Evil" 讨论过），if 里塞复杂逻辑会让配置难读难调；能靠正则捕获组、map 模块解决的不要用 if。
- **正则成本**：rewrite 每请求都要过正则，规则越多、表达式越复杂开销越大；热路径上的规则优先用精确匹配（`location =`）或前缀匹配前置分流。
- **先测再上**：rewrite 改的是流量走向，curl -i 验证状态码和 Location 头、grep error.log 确认无 cycle，再上生产。

rewrite 模块的能力就三件事：改 URI、发跳转、防自己循环。记住"server 段跑一遍、location 段会重入"这条执行模型，四个标记按需选对，301 迁移、语言分发、条件改写这三个场景照着本文的实测配置走就不会翻车——翻车了也知道自己站在 404 还是 500 的哪一侧。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
