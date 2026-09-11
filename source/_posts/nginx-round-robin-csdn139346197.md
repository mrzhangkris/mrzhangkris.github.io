---
title: "Nginx Round-Robin 负载均衡：原理与配置"
date: 2024-05-31 10:37:01
updated: 2026-09-11
categories: [技术]
tags: [Nginx, 网络服务]
copyright_author: 司南
cover: /images/csdn/covers/nginx-round-robin-csdn139346197.png
---

Nginx 做反向代理时，多个后端怎么分流量是最先要回答的问题。Round-Robin（轮询）是最基础的答案：请求按顺序逐个分给后端服务器，分完一轮再从头来。它还是 Nginx 的默认策略——upstream 块里不写任何负载均衡指令时，用的就是轮询。

## Round-Robin 是什么

轮询算法按事先定义好的顺序逐个分发请求：第 1 个请求给 backend1，第 2 个给 backend2，依次轮到列表末尾再回到开头。每台服务器被平等对待，负载平均分配。它不看服务器的实时负载，也不管请求是否有状态，所以最适合后端机器配置相近、请求无状态的场景。

## 什么场景适合

- **负载压力不大**：小型应用或流量较轻时，轮询简单有效，没必要上更复杂的策略。
- **后端配置相似**：服务器性能差不多、不需要按机器差异化分配时，轮询能很好地平衡流量。
- **无状态请求**：请求之间互不依赖、落到哪台都一样时，轮询最自然。

## 配置示例

```nginx
http {
  upstream backend {
    server backend1.example.com max_fails=3 fail_timeout=30s;
    server backend2.example.com weight=2;
    server backend3.example.com max_conns=1000;
    keepalive 32;
  }

  server {
    listen 80;
    server_name example.com;

    location / {
      proxy_pass http://backend;
      proxy_http_version 1.1;
      proxy_set_header Connection "";
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
  }
}
```

拆开解释：

- **upstream** 定义后端服务器组，里面每个 **server** 一台机器。round-robin 是默认策略，所以块里没有任何策略指令。
- **max_fails**：连续失败多少次后把这台服务器标记为不可用，默认 1。示例设为 3，容忍偶发失败。
- **fail_timeout**：被标记为不可用后持续多久，默认 10 秒；在这段时间内请求不再分给它。示例为 30 秒，与 max_fails 配套使用。
- **weight**：权重，默认 1。示例里 backend2 权重为 2，它分到的请求大约是其他机器的两倍，适合性能不均的机器。
- **max_conns**：限制这台服务器同时处理的连接数上限，防止某台慢机器被打爆。
- **keepalive**：每个 worker 进程保持到后端的空闲长连接数量。注意它不是最大并发连接数，而是连接复用的"蓄水池"——想让长连接真正生效，必须配 `proxy_http_version 1.1;` 和 `proxy_set_header Connection "";` 这两行，把默认的 HTTP/1.0 短连接和 `Connection: close` 头清掉。

![配图](/images/csdn/figures/nginx-round-robin-csdn139346197.png)

location 里的 `proxy_pass http://backend;` 把请求交给这个服务器组，Nginx 按轮询分发，长连接在组内复用。

## 注意事项

- **健康检查**：轮询本身只做被动的失败计数（max_fails/fail_timeout），建议再配合主动健康检查机制，及时发现并剔除不可用的服务器。
- **会话保持**：需要 session 粘在固定机器上的应用，轮询不是好选择，考虑 `ip_hash` 或把会话状态外置。
- **权重调整**：weight 改的是各机器分到的请求比例，但修改配置后需要 reload 才生效，不是运行时动态调整。
- **慢机器保护**：后端性能差异大时，光靠轮询会拖慢整体响应，用 weight 拉平差异，或给慢机器设 max_conns 限流。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
