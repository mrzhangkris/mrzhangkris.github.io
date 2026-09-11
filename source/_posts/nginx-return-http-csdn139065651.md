---
title: "用 Nginx return 指令定制 HTTP 响应"
date: 2024-05-20 15:01:40
updated: 2026-09-11
categories: [技术]
tags: [Nginx]
copyright_author: 司南
cover: /images/csdn/covers/nginx-return-http-csdn139065651.png
---

有时候你只想让 Nginx 直接"回话"：站点维护中返回 503，旧链接 301 跳新地址，某些路径直接 403。这些都不需要后端参与，一条 `return` 指令就够了。它属于 rewrite 模块（`ngx_http_rewrite_module`），是 Nginx 内置指令，用来指定服务器对请求的直接响应——状态码、跳转地址，甚至响应正文。

## 先看例子

```nginx
server {
  listen 80;
  server_name example.com;

  location / {
    return 503; # 返回503 Service Unavailable状态码
  }

  location /redirect {
    return 301 https://www.example.com;
  }
}
```

两个 location 各干各的事：

- 访问 `example.com`，Nginx 直接返回 503 Service Unavailable，请求不会到任何上游。
- 访问 `example.com/redirect`，返回 301 Moved Permanently，并带上 `Location: https://www.example.com` 让浏览器跳转。

同一个指令，按 URI 匹配返回不同响应，这就是 return 的基本形态。状态码后面也可以直接跟文本，比如 `return 200 "ok";`，把响应内容一并写上。

![配图](/images/csdn/figures/nginx-return-http-csdn139065651.png)

## 在哪些阶段生效

return 指令会在 Nginx 请求处理的两个阶段起作用：

- **rewrite 阶段**：处理重写、跳转类需求。这一阶段常用来改写请求 URI 或执行重定向，让请求被路由到正确的 location。
- **content 阶段**：直接响应客户端，返回指定的状态码和内容，请求到此为止。

实际配置里通常不用特意关心在哪个阶段——location 里写了 return，Nginx 自然在合适的阶段结束请求。

## 测试

改完配置后用 curl 检查响应头：

```bash
curl -I http://example.com
```

看返回的状态码是否符合预期即可，重定向场景再补一个 `-L` 可以跟着跳转走一遍。

## 使用时注意

- **指令位置**：return 要写在对应的 location（或 server）块里；在同一个块内，它应该放在其他 rewrite 类指令之前，先短路先生效。
- **避免重复**：同一个 location 内多次写 return，只有第一个会生效，后面的直接被忽略。
- **错误处理**：返回的状态码要考虑边界情况，比如 503 维护页最好配上 `Retry-After` 或维护说明页，别让用户看到光秃秃的错误码。
- **响应头**：return 本身只管状态码和跳转，要加自定义响应头得配合 `add_header` 指令一起用。

## 典型场景

- **网站维护**：返回 503，让用户知道站点在维护中。
- **URL 重定向**：301/302 把旧地址永久或临时挪到新地址。
- **访问控制**：对特定路径直接返回 403，请求连后端都摸不到。
- **健康检查应答**：对内网探活路径返回固定的 200 文本。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
