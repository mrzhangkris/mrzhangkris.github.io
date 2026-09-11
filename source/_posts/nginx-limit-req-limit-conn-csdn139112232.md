---
title: "Nginx 限流：limit_req 与 limit_conn 模块"
date: 2024-05-22 10:06:41
categories: [技术]
tags: [Nginx]
copyright_author: 司南
cover: /images/csdn/covers/nginx-limit-req-limit-conn-csdn139112232.png
updated: 2026-09-11
---

高流量场景下，如果不对客户端做约束，一个失控的爬虫就能把服务拖垮。Nginx 的 limit_req 和 limit_conn 模块分别限制请求频率和并发连接数，是保护后端的第一道闸门。本文介绍这两个模块的生效阶段、生效范围和实际配置写法。

## limit_req 模块

limit_req 限制客户端请求的频率，防止单一客户端占用过多服务器资源。

**生效阶段**：在请求处理的访问阶段（access phase）生效，即收到完整 HTTP 请求后、转发到后端之前。

**生效范围**：指令可以放在三个层级——

- http：全局生效，作用于所有 server 和 location。
- server：作用于该 server 内的所有 location。
- location：只作用于匹配该 URL 路径的 location。

### 配置示例

```nginx
http {
  # 定义一个共享内存区域，用于存储请求状态
  # $binary_remote_addr 是客户端的 IP 地址
  # zone=one:10m 定义名为 "one" 的共享内存区域，大小为 10MB
  # rate=1r/s 限制请求速率为每秒 1 个请求
  limit_req_zone $binary_remote_addr zone=one:10m rate=1r/s;

  server {
    listen 80;
    server_name example.com;

    location /api/ {
      # 应用请求频率限制配置
      # zone=one 引用名为 "one" 的共享内存区域
      # burst=5 允许短时间内突发最多 5 个请求
      # nodelay 如果设置该参数，突发请求也会立即执行
      limit_req zone=one burst=5 nodelay;

      # 代理到后端服务
      proxy_pass http://backend_service;
    }
  }
}
```

### 参数解析

- **limit_req_zone**：声明一个限制请求的共享内存区域。
- **limit_req**：在指定区域内启用请求频率限制。
- **burst**：允许的突发请求数量。
- **nodelay**：不延迟处理突发请求。

## limit_conn 模块

limit_conn 限制每个客户端的并发连接数，防止资源被单一客户端耗尽。

**生效阶段**：同样在访问阶段（access phase）生效，服务器建立新连接时立即按配置做并发限制。

**生效范围**：与 limit_req 相同，指令可放在 http、server 或 location 层级。

### 配置示例

```nginx
http {
  # 定义一个共享内存区域，用于存储连接状态
  # $binary_remote_addr 是客户端的 IP 地址
  # zone=addr:10m 定义名为 "addr" 的共享内存区域，大小为 10MB
  limit_conn_zone $binary_remote_addr zone=addr:10m;

  server {
    listen 80;
    server_name example.com;

    location /api/ {
      # 应用并发连接限制配置
      # addr 引用名为 "addr" 的共享内存区域
      # 10 限制每个客户端最多允许 10 个并发连接
      limit_conn addr 10;

      # 代理到后端服务
      proxy_pass http://backend_service;
    }
  }
}
```

### 参数解析

- **limit_conn_zone**：声明一个限制连接数的共享内存区域。
- **limit_conn**：在指定区域内启用连接数限制。

## 日志和状态码

被限流时总得留下痕迹，两个指令控制这件事。

### limit_conn_log_level

设置连接被限制时的日志级别，可选 info（基本信息）、notice（详细信息）、warn（推荐）、error。

### limit_conn_status

设置连接被限制时返回的 HTTP 状态码，常用 503（服务不可用），也可以按需求自定义。

## 完整配置示例

把频率限制、连接限制、日志级别和状态码组合到一起：

![配图](/images/csdn/figures/nginx-limit-req-limit-conn-csdn139112232.png)

```nginx
http {
  # 为 limit_req 和 limit_conn 定义共享内存区域
  limit_req_zone $binary_remote_addr zone=one:10m rate=1r/s;
  limit_conn_zone $binary_remote_addr zone=addr:10m;

  # 设置限制被触发时的日志级别和返回状态码
  limit_conn_log_level warn;
  limit_conn_status 503;

  server {
    listen 80;
    server_name example.com;

    location /api/ {
      # 应用请求频率限制配置
      limit_req zone=one burst=5 nodelay;

      # 应用并发连接限制配置
      limit_conn addr 10;

      # 代理到后端服务
      proxy_pass http://backend_service;
    }
  }
}
```

两个 zone 声明在 http 层供全局引用，location 里分别挂上 limit_req 和 limit_conn，限流触发时记 warn 日志并返回 503。

## 注意事项

- `limit_req_zone` / `limit_conn_zone` 只能声明在 http 层，`limit_req` / `limit_conn` 才是挂在 server 或 location 里生效的。
- `$binary_remote_addr` 比文本形式的 `$remote_addr` 省内存，一般都用它做键。
- rate 是平均速率，burst 决定容忍多大的突发；加不加 nodelay 直接影响突发请求是立刻处理还是排队延迟。
- 限流触发默认记日志并返回 503，通过 limit_conn_log_level / limit_conn_status 可以调整。
- 参数要根据业务实际流量调，压得太紧会误伤正常用户。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
