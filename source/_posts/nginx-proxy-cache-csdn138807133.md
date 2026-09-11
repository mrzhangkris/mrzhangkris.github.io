---
title: "Nginx proxy_cache 配置指南"
date: 2024-05-13 16:03:41
categories: [技术]
tags: [Nginx]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1617839625591-e5a789593135?w=1600&q=80&fm=jpg
updated: 2026-09-11
---

后端再快，也快不过缓存直接命中。Nginx 的 proxy_cache 模块把上游响应缓存到本地磁盘，命中后直接返回，既减轻后端负担又提高响应速度。本文整理 proxy_cache 的常用指令、不缓存内容的写法和一份完整配置。

## 常用指令

### proxy_cache_path

定义缓存的存储路径及其他参数（缓存键、过期时间等）：

```nginx
proxy_cache_path /data/nginx/cache levels=1:2 keys_zone=my_cache:10m max_size=10g inactive=7d use_temp_path=off;
```

几个关键参数：

- `keys_zone` 定义缓存键的共享内存区及其大小，必须设置。
- `max_size` 控制缓存区域的最大磁盘占用。
- `inactive` 定义多长时间未被访问的内容自动清除。

### proxy_cache_key

设置缓存键的字符串，通常由请求的相关要素组成（URL、请求方法等）：

```nginx
proxy_cache_key "$request_method$request_uri$http_cookie";
```

键里放什么直接决定命中率：带上 `$request_uri` 区分不同路径，带上 `$http_cookie` 可以让登录用户各用各的缓存。

### proxy_cache

启用缓存并指定使用哪个缓存区域：

```nginx
proxy_cache my_cache;
```

### proxy_cache_valid

按响应代码设置缓存时间：

```nginx
proxy_cache_valid 200 302 10m;
proxy_cache_valid 404 1m;
```

200/302 缓存 10 分钟，404 只缓存 1 分钟，错误页少缓存可以避免故障被放大。

### proxy_cache_bypass 与 proxy_no_cache

这两个指令成对出现：`proxy_cache_bypass` 定义条件，命中条件时跳过缓存直接回源；`proxy_no_cache` 定义条件，命中条件时不把响应写入缓存。

绕过缓存：

```nginx
proxy_cache_bypass $cookie_no_cache $arg_no_cache $http_pragma $http_authorization;
```

不缓存响应：

```nginx
proxy_no_cache $cookie_no_cache $arg_no_cache $http_pragma $http_authorization;
```

> 注：原文这两行的变量写作 `$arg_no_cache$ http_pragma$`（变量名首尾 `$` 错位），本文已按同一文档末尾完整示例的正确写法修正。

## 不缓存内容的配置

动态内容和个人数据通常不该进缓存。比如用户个人页面：

```nginx
location /profile {
  proxy_pass http://backend_server;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header Host $http_host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;

  # 禁用缓存
  proxy_cache_bypass 1;
}
```

`proxy_cache_bypass 1` 的条件恒为真，等于这个 location 永远回源。而站点其他路径正常启用缓存，并加上 Cache-Control 旁路判断：

```nginx
location / {
  proxy_pass http://backend_server;
  proxy_cache my_cache;
  proxy_cache_valid 200 1d;
  proxy_cache_bypass $http_cache_control;
  add_header X-Proxy-Cache $upstream_cache_status;
}
```

`X-Proxy-Cache` 响应头会把命中状态（HIT/MISS/BYPASS）带给调试者，排查缓存问题时很好用。

## 完整配置示例

把上面的要点合到一起：

![配图](/images/csdn/figures/nginx-proxy-cache-csdn138807133.png)

```nginx
proxy_cache_path /data/nginx/cache levels=1:2 keys_zone=my_cache:10m max_size=10g inactive=7d use_temp_path=off;

server {
  listen 80;
  server_name mysite.com;

  location / {
    proxy_pass http://backend;
    proxy_cache my_cache;
    proxy_cache_key "$request_method$request_uri$http_cookie";
    proxy_cache_valid 200 302 10m;
    proxy_cache_valid 404 1m;
    proxy_cache_bypass $cookie_no_cache $arg_no_cache $http_pragma $http_authorization;
    proxy_no_cache $cookie_no_cache $arg_no_cache $http_pragma $http_authorization;
  }

  location /profile {
    proxy_pass http://backend;
  }
}
```

这套配置做到：常规内容按方法+URI+Cookie 做键缓存 10 分钟，带 no_cache Cookie、no_cache 参数、Pragma 或 Authorization 头的请求绕过缓存且不落盘，个人页面永远回源。

## 注意事项

- `proxy_cache_path` 必须放在 http 层，`keys_zone` 是必填项；缓存目录要对 Nginx 可写。
- 缓存键要包含区分用户身份的要素（如 Cookie），否则可能出现用户间串缓存。
- 动态、敏感内容用 `proxy_cache_bypass` 明确排除，别只依赖后端的 Cache-Control 头。
- 404 等错误响应单独设短缓存时间，避免后端故障时错误页被长期缓存。
- 调试期加上 `add_header X-Proxy-Cache $upstream_cache_status`，命中与否一目了然。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
