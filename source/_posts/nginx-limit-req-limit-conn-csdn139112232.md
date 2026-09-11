---
title: "Nginx中的limit_req模块和limit_conn模块详解"
date: 2024-05-22 10:06:41
categories: [技术]
tags: [Nginx]
copyright_author: 张鹏
cover: /images/csdn/covers/nginx-limit-req-limit-conn-csdn139112232.png
---

#### 引言

在高流量场景下，良好的限流和连接控制策略至关重要，以防止服务器过载，确保服务稳定性和高可用性。Nginx 提供了 limit\_req 和 limit\_conn 模块，用以实现请求频率和并发连接数的限制。本文将详细介绍这两个模块的生效阶段和生效范围，并提供实际配置示例，解释相关指令的作用。

### limit\_req模块

#### 功能介绍

limit\_req 模块用于限制客户端请求的频率，以防止单一客户端占用过多服务器资源，提升稳定性。

#### 生效阶段

limit\_req 在请求处理的“访问阶段（access phase）”生效。它在接收到完整的 HTTP 请求后，即将转发到后端之前进行限流。

#### 生效范围

-   http：全局范围，作用于所有 server 和 location。
-   **server**：作用于特定 server block 内的所有 location。
-   **location**：作用于特定 URL 路径的 location。

#### 配置示例和注释

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

#### 参数解析

-   **limit\_req\_zone**：声明一个限制请求的共享内存区域。
-   **limit\_req**：在指定的区域内启用请求频率限制。
-   **burst**：允许的突发请求数量。
-   **nodelay**：不延迟处理突发请求。

### limit\_conn模块

#### 功能介绍

limit\_conn 模块用于限制每个客户端的并发连接数，以防止资源被单一客户端耗尽。

#### 生效阶段

limit\_conn 在连接处理的“访问阶段（access phase）”生效。当服务器建立新连接时，立即根据配置进行并发连接限制。

#### 生效范围

-   **http**：全局范围，作用于所有 server 和 location。
-   **server**：作用于特定 server block 内的所有 location。
-   l**ocation**：作用于特定 URL 路径的 location。

#### 配置示例和注释

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

#### 参数解析

-   **limit\_conn\_zone**：声明一个限制连接数的共享内存区域。
-   **limit\_conn**：在指定的区域内启用连接数限制。

### 日志和状态设置

#### limit\_conn\_log\_level

limit\_conn\_log\_level 用于设置当连接被限制时的日志记录级别。

##### 可选值

-   **info**：基本信息记录。
-   **notice**：详细信息记录。
-   **warn**：警告信息记录（推荐）。
-   **error**：错误信息记录。

#### limit\_conn\_status

limit\_conn\_status 用于设置当连接被限制时返回的 HTTP 状态码。

##### 常用状态码

-   **503**：服务不可用（推荐）。
-   **其他自定义状态码**：根据具体需求设置。

### 完整配置示例和注释

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

#### 解析与说明

-   **limit\_req\_zone 和 limit\_conn\_zone**：分别定义请求和连接限制的共享内存区域。
-   **limit\_req 和 limit\_conn**：在指定的区域内启用请求频率和连接数限制。
-   **limit\_conn\_log\_level 和 limit\_conn\_status**：分别设置连接限制触发时的日志级别和返回状态码。

### 结论

通过 Nginx 的 limit\_req 和 limit\_conn 模块，可以有效实现精确的请求频率和连接数控制。这不仅可以防止恶意请求和流量激增对服务器的冲击，还能提高服务的稳定性和可用性。结合日志级别和状态码设置，可以轻松监控和管理限流情况。

**希望这篇博客能够帮助你更好地理解和应用 Nginx 的限流功能，提高配置能力。**

---

> 本文迁移自作者 CSDN 博客，2024-05-22 首发于 CSDN，内容保持原貌。
