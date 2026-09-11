---
title: "使用 Nginx Realip 模块还原真实客户端 IP"
date: 2024-05-20 14:01:42
updated: 2026-09-11
categories: [技术]
tags: [Nginx]
copyright_author: 司南
cover: /images/csdn/covers/nginx-realip-ip-csdn139063602.png
---

![配图](/images/csdn/figures/nginx-realip-ip-csdn139063602.png)

Nginx 做反向代理时，后端看到的 `$remote_addr` 往往是代理服务器自己的 IP，真实客户端被藏在了 `X-Forwarded-For` 这类请求头里。日志、限流、风控如果直接用 `$remote_addr`，结果都会失真。`ngx_http_realip_module` 就是解决这个问题的：让 Nginx 从可信代理传来的请求头里还原出真实客户端 IP。

## 确认模块已编译

Realip 模块属于标准模块，大多数发行版的预编译包都带着它。确认一下：

```bash
nginx -V 2>&1 | grep -o with-http_realip_module
```

有输出说明已启用。如果没有，需要重新编译 Nginx 时加上 `--with-http_realip_module` 参数。

## 核心配置

三个指令撑起整个功能：

```nginx
http {
  # 定义可从哪些IP地址接收真实客户端IP
  set_real_ip_from    192.168.1.0/24;    # 局域网中的负载均衡器
  set_real_ip_from    203.0.113.0/24;    # 公网的负载均衡器

  # 从哪个HTTP头取真实客户端IP
  real_ip_header      X-Forwarded-For;

  # 多层代理时逐级回溯
  real_ip_recursive   on;

  server {
    listen 80;
    server_name example.com;

    location / {
      proxy_pass http://backend_server;

      # 日志里同时记录还原后的IP和原始头内容
      log_format main
        '$remote_addr - $remote_user [$time_local] "$request" '
        '$status $body_bytes_sent "$http_referer" '
        '"$http_user_agent" "$http_x_forwarded_for"';
      access_log /var/log/nginx/access.log main;
    }
  }
}
```

逐条说明：

- **set_real_ip_from**：指定可信代理的 IP 或 CIDR 网段。只有来自这些地址的请求，Nginx 才会用指定头部字段的值覆盖客户端 IP。这是安全边界——不设它，任何人都能伪造请求头冒充别的 IP。
- **real_ip_header**：指定从哪个请求头取真实 IP，常见取值是 `X-Forwarded-For` 或 `X-Real-IP`。
- **real_ip_recursive**：处理多层代理的场景。设为 `on` 时，Nginx 会沿代理链逐级回溯：从请求头里依次剥掉可信代理的地址，取最后一个不在可信名单里的地址作为客户端 IP；设为 `off` 时，只取直接连接的那层代理传来的值。多层代理环境一般都要开 `on`。

日志这边补一句：`$remote_addr` 在 realip 生效后就是还原出的真实客户端 IP；再带一个 `$http_x_forwarded_for` 把原始头内容记下来，排查问题时可以对照。

## 几种常见组合

代理层形态不同，写法略有差别。

只有一个固定代理时，直接写单个 IP：

```nginx
set_real_ip_from 123.45.67.89;
real_ip_header X-Forwarded-For;
```

代理是 IPv6 地址时同样支持：

```nginx
set_real_ip_from 2001:0db8::/32;
real_ip_header X-Forwarded-For;
```

本机还有一层本地代理（比如 127.0.0.1 上跑的前置服务）时：

```nginx
set_real_ip_from 127.0.0.1;
real_ip_header X-Real-IP;
```

## 测试

配置重载后，用 curl 模拟一个带头部的请求：

```bash
curl -H "X-Forwarded-For: 1.2.3.4" http://example.com
```

然后盯住访问日志：

```bash
tail -f /var/log/nginx/access.log
```

日志里出现 `1.2.3.4` 就说明 realip 已经在正常还原客户端 IP 了。

## 注意事项

- `set_real_ip_from` 只写真正部署代理的那几个网段，范围越大，伪造头冒充 IP 的空间越大。
- `real_ip_recursive on` 只在多层代理时必要，单层代理开不开效果一样。
- `X-Forwarded-For` 本身可以被客户端伪造，realip 之所以可信，前提是可信代理会覆盖或追加这个头——信任链建立在 `set_real_ip_from` 上，不在头本身。
- 改完配置记得 `nginx -t` 验证再 reload，避免配置错误导致整个服务不可用。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
