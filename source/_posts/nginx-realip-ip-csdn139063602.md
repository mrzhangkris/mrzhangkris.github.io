---
title: "使用Nginx的Realip模块探知真实客户端IP"
date: 2024-05-20 14:01:42
categories: [技术]
tags: [Nginx]
copyright_author: 张鹏
cover: /images/csdn/covers/nginx-realip-ip-csdn139063602.png
---

在使用Nginx作为反向代理服务器时，客户端的真实IP地址有时候会被隐藏，而显示的只是Nginx服务器的IP地址。这对记录日志、用户分析等行为带来了一定的困扰。为了解决这个问题，Nginx提供了ngx\_http\_realip\_module，用于获取并展示客户端的真实IP地址。

### 1\. 什么是Realip模块？

ngx\_http\_realip\_module模块允许覆盖由代理服务器（如前端Nginx或负载均衡器）传递的客户端IP地址。通过设置real\_ip\_header和set\_real\_ip\_from指令，Nginx可以从特定的HTTP头或指定的IP范围内提取真实的客户端IP地址。

### 2\. 安装Realip模块

Nginx的Realip模块通常在Nginx默认配置时就已包含，您可以通过以下命令查看是否启用了该模块：

```bash
nginx -V 2>&1 | grep -o with-http_realip_module
```

如果未启用，可以重新编译Nginx并添加–with-http\_realip\_module参数。大多数主流Linux发行版的Nginx预编译包中已包含该模块。

### 3\. 配置Realip模块

#### 示例配置

以下是一个简单的Nginx配置文件示例，演示如何使用Realip模块：

```nginx
http {
  # 定义可从哪些IP地址接收真实客户端IP
  set_real_ip_from    192.168.1.0/24;    # 局域网中的负载均衡器
  set_real_ip_from    203.0.113.0/24;   # 公网的负载均衡器

  # 定义客户端IP地址的HTTP头
  real_ip_header      X-Forwarded-For;

  # 仅更改地址部分，不改变端口
  real_ip_recursive   on;

  server {
    listen 80;
    server_name example.com;

    location / {
      proxy_pass http://backend_server;

      # 打印日志，包含真实IP
      log_format main
        '$remote_addr - $remote_user [$time_local] "$request" '
        '$status $body_bytes_sent "$http_referer" '
        '"$http_user_agent" "$http_x_forward_for"';
      access_log /var/log/nginx/access.log main;
    }
  }
}
```

#### 指令解释

1. set\_real\_ip\_from：指定可以信任的代理的IP地址或CIDR。只有在这些IP地址范围内的请求，Nginx才会使用指定的头部字段的值来覆盖客户端IP。
2. real\_ip\_header：指定哪个头部字段包含要使用的真实客户端IP地址。常见的值是X-Forwarded-For或X-Real-IP。
3. real\_ip\_recursive：这个设置用于处理多个层级的代理服务器。当设置为on时，Nginx将使用第一个可信代理传递的IP地址；当设置为off时，Nginx只使用直接连接的代理服务器传递的IP地址。

#### 日志配置

日志格式remoteaddr，打印使用Realip模块后提取的真实IP地址。使用自定义logformat显示remote\_addr，打印使用Realip模块后提取的真实IP地址。使用自定义log\_format显示remotea​ddr，打印使用Realip模块后提取的真实IP地址。使用自定义logf​ormat显示http\_x\_forwarded\_for，可以记录原始的X-Forwarded-For头内容，便于调试。

### 4\. 其他配置选项

#### 单一IP支持

如果只有一个固定的代理服务器或负载均衡器，可以使用单一IP配置：

```nginx
set_real_ip_from 123.45.67.89;
real_ip_header X-Forwarded-For;
```

#### 支持IPv6

支持从IPv6地址获取真实客户端IP：

```nginx
set_real_ip_from 2001:0db8::/32;
real_ip_header X-Forwarded-For;
```

#### 获取本地代理IP

如果有本地代理服务器，可以直接指定本地IP：

```nginx
set_real_ip_from 127.0.0.1;
real_ip_header X-Real-IP;
```

### 5\. 测试配置

配置完成后，可以使用curl命令模拟请求进行测试：

```bash
curl -H "X-Forwarded-For: 1.2.3.4" http://example.com
```

检查Nginx访问日志，确认客户端IP已成功提取：

```bash
tail -f /var/log/nginx/access.log
```

日志输出应包含1.2.3.4，表示Realip模块成功获取真实客户端IP。
通过配置和使用Nginx的Realip模块，可以确保在复杂的代理和负载均衡环境中仍然可以准确记录和处理客户端的真实IP地址。希望这篇文章对您配置Nginx的Realip模块有所帮助。

---

> 本文迁移自作者 CSDN 博客，2024-05-20 首发于 CSDN，内容保持原貌。
