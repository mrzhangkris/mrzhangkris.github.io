---
title: "Nginx autoindex：让目录在浏览器里直接可浏览"
date: 2024-05-13 15:42:16
updated: 2026-09-14
categories: [技术, Nginx]
tags: [Nginx]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1639066648921-82d4500abf1a?w=1600&q=80&fm=jpg
---

服务器上有一批文件想让同事在浏览器里直接翻，又不想专门写页面——autoindex 就是 Nginx 自带的目录列表功能：请求指向的目录里没有 index.html 这类默认索引文件时，Nginx 自动生成一个列出全部文件和子目录链接的 HTML 页面。这篇在 nginx:1.28 容器里把开关、两个显示选项、JSON 输出和两个典型"为什么看到的不是列表"实跑一遍。

## 实验环境

- Docker 容器 `nginx:1.28-alpine`（nginx/1.28.3，2026-09 实测，autoindex 是标准模块，默认编译）。
- 三个测试目录：`files/`（放 readme.txt、big-archive.tar、app.log 三个文件）、`plain/`（空目录，什么都不配）、`with-index/`（同时放了 index.html 和 other.txt）。

## 核心机制一句话

Nginx 收到指向目录的请求时，先按 index 指令找默认索引文件；找不到时，`autoindex on` 决定是生成目录列表页（on）还是返回 403 Forbidden（默认 off）。列表页是 Nginx 现场生成的，磁盘上并不存在。

## 实例一：开与不开，403 和列表的差别

先看什么都不配的目录——`plain/` 里没有 index.html，也没开 autoindex：

```nginx
location /plain/ { }
```

请求它拿到的是 403 Forbidden。加上 `autoindex on` 再看 `files/`：

```nginx
location /files/ {
  root /usr/share/nginx/html;
  autoindex on;
  autoindex_exact_size off;
  autoindex_localtime on;
}
```

![配图1](/images/csdn/figures/nginx-autoindex-csdn138805950-1.png)

同一个 Nginx，`plain/` 是 403，`files/` 变成了带链接的文件列表——`big-archive.tar` 的大小显示为 `1M`（`autoindex_exact_size off` 的友好单位效果），时间戳是服务器本地时间（`autoindex_localtime on`）。这两个选项不影响功能，只影响列表页的可读性：`autoindex_exact_size` 默认 on 显示精确字节数，`autoindex_localtime` 默认 off 显示 GMT 时间。

## 实例二：autoindex_format json，给脚本用的目录清单

浏览器要的是 HTML，脚本要的是结构化数据。`autoindex_format`（1.7.9 引入）支持 `html | xml | json | jsonp` 四种输出：

```nginx
location /json/ {
  alias /usr/share/nginx/html/files/;
  autoindex on;
  autoindex_format json;
}
```

![配图2](/images/csdn/figures/nginx-autoindex-csdn138805950-2.png)

同一个目录，JSON 输出里每个文件是 name/type/mtime/size 四个字段，size 是精确字节数（不受 `autoindex_exact_size` 影响）。配合 `curl` 一条命令就能做目录同步、增量检查这类小事：

```bash
curl -s http://example.com/json/ | grep -o '"size":[0-9]*'
```

## 错误写法对比：列表不出现的两种原因

**原因一：目录里有 index.html。** `with-index/` 同时放了 index.html 和 other.txt，即使开着 `autoindex on`，请求它拿到的是 index.html 的内容——索引文件优先级高于目录列表：

```
# 错认知：开了 autoindex 就一定看到列表
curl localhost/with-index/
# 实际返回：<h1>I am index.html</h1>
```

**原因二：既没开 autoindex 又没有索引文件**，就是实例一的 403。排查"为什么看不到列表"按这个顺序：先查目录里有没有 index.html 遮蔽，再查 `autoindex on` 是否生效在正确的 location 上。

![配图3](/images/csdn/figures/nginx-autoindex-csdn138805950-3.png)

## 注意事项

- **autoindex 是把目录原样暴露**，含配置、备份、敏感数据的目录绝不能开；要开的目录用 auth_basic 或 allow/deny 收紧访问范围。
- **403 不一定是没权限**，也可能是本该配 autoindex 的目录没配——排查时先分清"拒绝访问"和"缺少列表功能"这两种 403 语义。
- **列表页是动态生成的**，大目录（上万文件）每次请求都遍历一遍，高频访问的大目录考虑加 cache 或换成预生成的静态索引。
- **json 格式下 exact_size 无效**，size 永远是精确字节，写脚本时直接按数值比较即可。

## 小结

回到开头的场景：不写一行代码，让一批文件在浏览器里可翻——`autoindex on` 一个开关就能做到，`autoindex_exact_size` 和 `autoindex_localtime` 让列表更易读，`autoindex_format json` 还能让脚本直接消费。记住两条边界：目录里有 index.html 时列表会被遮蔽，什么都没配的目录是 403 而不是空列表。内部的文档分发、构建产物展示，这套功能正合适。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
