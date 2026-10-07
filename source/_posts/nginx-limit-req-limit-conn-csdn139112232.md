---
title: "Nginx 限流实战：limit_req 与 limit_conn 的生效阶段与配置"
date: 2024-05-22 10:06:41
categories: [技术, Nginx]
tags: [Nginx]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1580584126903-c17d41830450?w=1600&q=80&fm=jpg
updated: 2026-09-14
---

高流量场景下不对客户端做约束，一个失控的爬虫就能把后端拖垮。Nginx 给了两道闸门：limit_req 限请求频率，limit_conn 限并发连接。两者看着像，实际拦的是不同维度——一个管"每秒来多少次"，一个管"同时挂着几个"。这篇把两个模块的生效阶段、配置写法讲清，并用 nginx/1.31.5 容器实测三组典型行为：burst 突发放行、严格限速拒绝、并发连接超限。

## 实验环境

- nginx/1.31.5（nginx:alpine 容器）
- 所有实测在容器内自测（curl 打 127.0.0.1），不做端口映射
- limit_rate 用于人为拖慢响应，制造真实的并发连接场景

## 核心机制一句话

limit_req 基于**令牌桶**：按 rate 匀速往桶里放令牌，请求来了取一个令牌，取不到就拒绝；burst 是桶的容量，允许短时间攒着的令牌被一次性用掉。limit_conn 基于**实时计数**：某个键（通常是客户端 IP）当前有几个活动连接，超过阈值就拒绝新连接。

## limit_req：限请求频率

### 配置写法

`limit_req_zone` 声明共享内存区（只能放 http 层），`limit_req` 在具体位置启用（可放 http/server/location）：

```nginx
http {
  # $binary_remote_addr 做键，zone=one:10m 分配 10MB 共享内存，rate=1r/s 每秒 1 个请求
  limit_req_zone $binary_remote_addr zone=one:10m rate=1r/s;

  server {
    listen 80;
    location /api/ {
      limit_req zone=one burst=5 nodelay;
      proxy_pass http://backend_service;
    }
  }
}
```

参数含义：
- **zone=one**：引用名为 one 的共享内存区
- **burst=5**：允许突发 5 个请求排队
- **nodelay**：突发请求立即处理，不排队延迟

### 实测一：burst=5 nodelay，10 连发

rate=1r/s 配 burst=5 nodelay，瞬间打 10 个请求：

![burst=5 nodelay 十连发实测](/images/csdn/figures/nginx-limit-req-limit-conn-csdn139112232-1.png)

结果完全符合令牌桶模型：桶里初始有 1 个当前令牌 + 5 个 burst 令牌 = 6 个，前 6 个请求立即放行（200），第 7 个起令牌耗尽被拒（503）。这就是 nodelay 的意义——突发额度内的请求不排队，直接处理。

### 实测二：无 burst 严格 1r/s

去掉 burst，只留 `limit_req zone=one;`，连续打 10 个，再每隔 1 秒打 1 个：

![无 burst 严格限速实测](/images/csdn/figures/nginx-limit-req-limit-conn-csdn139112232-2.png)

无 burst 时令牌桶容量为 0，只认当前速率：连续请求里只有第一个能拿到令牌，其余全 503；而每隔 1 秒的匀速请求，因为每秒补一个令牌，全部放行。对比实测一可以看出 burst 的作用就是"容忍多大的突发"。

**生效阶段**：limit_req 在 preaccess 阶段生效——这有个容易踩的坑：同一 location 里若有 `return` 指令，return 在 rewrite 阶段先执行，limit_req 根本不会触发（详见"错误写法"）。

## limit_conn：限并发连接

### 配置写法

```nginx
http {
  limit_conn_zone $binary_remote_addr zone=addr:10m;

  server {
    location /api/ {
      limit_conn addr 10;   # 每个客户端 IP 最多 10 个并发连接
      proxy_pass http://backend_service;
    }
  }
}
```

### 实测三：limit_conn=2，4 个并发慢请求

并发连接限制不好测——请求太快连接瞬间就断了，数不出"同时几个"。用 `limit_rate 20k` 把 200KB 文件的下载拖慢，让 4 个连接真实并存：

![limit_conn 并发超限实测](/images/csdn/figures/nginx-limit-req-limit-conn-csdn139112232-3.png)

limit_conn addr 2 下，4 个并发请求里只有 2 个拿到连接（200），另外 2 个立即被拒（503）。注意通过的是 1/2、被拒的是 3/4——谁先建立连接谁占额度，与发起书写顺序无关，这正是并发竞争的真实表现。

**生效阶段**：limit_conn 同样在 preaccess 阶段生效，连接建立时立即按配置计数。

## 日志与状态码

被限流时要留下痕迹，两个指令控制这件事：

- **limit_conn_log_level**：连接被限时的日志级别，可选 info/notice/warn/error，推荐 warn
- **limit_conn_status**：连接被限时返回的状态码，默认 503，可自定义

limit_req 对应的是 limit_req_log_level 和 limit_req_status，用法相同。

## 错误写法：return 绕过 limit_req

一个高频踩坑——想用 `return` 做健康检查或静态响应，又挂了 limit_req：

```nginx
location /api/ {
    limit_req zone=one burst=5;
    return 200 "ok";   # 错误：return 在 rewrite 阶段先执行
}
```

`return` 属于 rewrite 模块，在 rewrite 阶段就短路返回了，limit_req 在 preaccess 阶段根本没机会运行——限流形同虚设，任意频率的请求都拿到 200。要测 limit_req 是否生效，后端必须是真实的内容处理（静态文件或 proxy_pass），让请求走到 preaccess 阶段。这也是前面三组实测都用静态文件 / 慢下载而非 return 的原因。

## 完整配置示例

把频率限制、连接限制、日志级别和状态码组合到一起：

```nginx
http {
  limit_req_zone $binary_remote_addr zone=one:10m rate=1r/s;
  limit_conn_zone $binary_remote_addr zone=addr:10m;

  limit_conn_log_level warn;
  limit_conn_status 503;

  server {
    listen 80;
    server_name example.com;

    location /api/ {
      limit_req zone=one burst=5 nodelay;
      limit_conn addr 10;
      proxy_pass http://backend_service;
    }
  }
}
```

两个 zone 声明在 http 层供全局引用，location 里分别挂 limit_req 和 limit_conn，限流触发时记 warn 日志并返回 503。

## 注意事项

- `limit_req_zone` / `limit_conn_zone` 只能声明在 http 层；`limit_req` / `limit_conn` 才是挂在 server 或 location 里生效的。声明和使用分两层，是新手最常搞混的地方。
- `$binary_remote_addr` 比文本形式的 `$remote_addr` 省内存（定长 4/16 字节），做键一般都用它。
- rate 是平均速率，burst 决定容忍多大突发；nodelay 决定突发请求是立即处理还是排队延迟——三者组合出完全不同的限流手感，要按业务流量调，压太紧会误伤正常用户。
- limit_req 拦频率、limit_conn 拦并发，两者正交，通常一起用：频率防刷、并发防占。
- 限流触发默认返回 503 并记日志，生产环境建议把 limit_*_status 和监控告警联动，503 突增往往意味着被刷或容量不足。
- 想验证限流是否真的生效，别用 `return`（会被绕过），用静态文件或 proxy_pass 让请求走到 preaccess 阶段。

两道闸门各管一头：limit_req 用令牌桶抹平请求频率的尖峰，limit_conn 用实时计数掐住并发连接的上限。记住它们都在 preaccess 阶段生效、都怕被 return 短路，配置时把 zone 放 http 层、把启用放 location 层，限流这件事就不会出岔子。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。