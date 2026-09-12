---
title: "CentOS 上用 Nginx 配置 HTTPS 并禁止 IP 访问"
date: 2024-05-14 08:30:00
updated: 2026-09-11
categories: [技术]
tags: [Nginx]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=1600&q=80&fm=jpg
---

站点上了 HTTPS 之后，仍会有人拿 IP 直接扫 443 端口——这类请求的 Host 不是你的域名，应该在握手阶段就拒掉。这篇记录在 CentOS + Nginx 上配 HTTPS 并禁止 IP 访问的完整过程，包括一个实测踩到的配置坑：用 if 加 && 判断 Host 的写法在 Nginx 里根本无法通过语法检查，正确姿势是 default_server 兜底拒绝。文末附访问不通时怎么查防火墙和 WAF。

> 实测环境：nginx/1.31.5（nginx:alpine 容器，自签证书）。CentOS 7 自带仓库的 nginx 1.16 差异处已在文中标注。

## 核心机制一句话

HTTPS 由证书加 `listen 443 ssl` 决定；拒绝 IP 访问的关键在于：非目标域名的 TLS 请求会落进 SNI 匹配失败的 `default_server` 块，把这块配置成直接拒绝，IP 直连就进不了业务站点。

## 准备工作与证书申请

开始前确认两件事：服务器上已装好 Nginx；域名有一张有效的 SSL/TLS 证书。证书从 Let's Encrypt 免费申请即可，配套的 Certbot 能自动完成申请和 Nginx 配置。

```bash
sudo yum install epel-release
sudo yum install certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Certbot 会尝试自动改 Nginx 配置，下面是手动写法的完整示例，路径以 Certbot 实际签发位置为准。

## Nginx 配置：HTTPS 加拒绝 IP 直连

创建 `/etc/nginx/conf.d/yourdomain.com.conf`，三块各司其职：80 全部重定向，443 的 default_server 拒绝非目标域名的握手，业务块只服务自己的域名。

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$host$request_uri;
}

# 非 yourdomain.com 的 TLS 请求（含 IP 直连）落在这里
server {
    listen 443 ssl default_server;
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_reject_handshake on;    # nginx >= 1.19.4
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    ssl_session_cache shared:SSL:1m;
    ssl_session_timeout  10m;
    ssl_ciphers 'ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-AES128-GCM-SHA256:HIGH:!aNULL:!MD5:!RC4:!DHE';
    ssl_prefer_server_ciphers on;

    location / {
        root /usr/share/nginx/html;
        index index.html index.htm;
    }
}
```

改完先测语法，通过后再重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

实测结果（nginx/1.31.5 容器，自签证书）：域名访问拿到 200，IP 直连在 TLS 握手阶段被拒，80 端口按预期 301：


三个版本注记：`ssl_reject_handshake` 需要 nginx 1.19.4 以上，CentOS 7 老版本把 default_server 块里的 `ssl_reject_handshake on` 换成 `return 444;` 兜底；nginx 1.25.1 起 `listen ... http2` 写法已废弃，实测会告警 `use the "http2" directive instead`，新配置建议 `listen 443 ssl;` 加独立一行 `http2 on;`；default_server 块里的证书必须存在，否则 nginx 起不来。

## 错误写法对比

搜"nginx 禁止 IP 访问"很容易搜到这种写法：

```nginx
if ($host != yourdomain.com && $host != www.yourdomain.com) {
    return 403;
}
```

实测 `nginx -t` 直接报错 `invalid condition "$host"`，配置起不来。Nginx 的 if 指令来自 rewrite 模块，只支持单条件判断，不支持 `&&`、`||` 组合——这类配置从老博客复制过来，语法检查这一关都过不了。即使写成两个独立的 if，也只能拦 HTTP 层的请求：TLS 握手发生在 HTTP 之前，浏览器拿到证书告警的体验仍然存在。default_server 加 `ssl_reject_handshake` 在握手阶段就拒绝，是干净得多的做法。

## 访问不通时排查

配置无误但 HTTPS 仍然访问失败，大概率卡在防火墙或 WAF 上。

防火墙：firewalld 放行 https 服务（对应 443 端口）：

```bash
sudo firewall-cmd --permanent --zone=public --add-service=https
sudo firewall-cmd --reload
```

WAF：用了 ModSecurity 这类 WAF 时，检查有没有规则拦掉合法的 HTTPS 请求——WAF 配置过严误杀正常请求并不少见，错误日志里能看到拦截记录。

## 注意事项

- 证书路径按 Certbot 实际签发位置写，通常在 `/etc/letsencrypt/live/<域名>/` 下，default_server 块同样需要一对可用证书。
- 每次改 Nginx 配置先 `nginx -t` 再 reload，别带着语法错误上线；本文的 if 组合条件坑就能被这一步拦住。
- 用 `curl -k --resolve 域名:443:服务器IP https://域名/` 验证，比改本机 hosts 快，且能区分"握手被拒"和"返回 403"两类结果。
- Certbot 续期后证书路径不变，但 reload 一次 Nginx 才会加载新证书，`certbot --nginx` 模式会自动处理。

## 小结

回到开头的场景：扫 443 的 IP 流量不该打到业务站点上。证书用 Certbot 解决，拒绝 IP 直连交给 `default_server` 加 `ssl_reject_handshake`，配完 `nginx -t` 加一次 curl 双端验证，域名访问正常、IP 握手被拒，这套配置就算闭环了。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
