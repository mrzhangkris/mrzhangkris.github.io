---
title: "在 CentOS 上使用 Nginx 配置 HTTPS 并禁止 IP 访问"
date: 2024-05-14 08:30:00
categories: [技术]
tags: [Nginx]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=1600&q=80&fm=jpg
updated: 2026-09-11
---

站点上了 HTTPS 之后，仍会有人拿 IP 直接扫 443 端口——这类请求的 Host 不是你的域名，应该直接拒掉。这篇记录在 CentOS + Nginx 上配 HTTPS 并禁止 IP 访问的完整过程，末尾附上访问不通时怎么查防火墙和 WAF。

## 准备工作

开始前确认两件事：服务器上已装好 Nginx；域名有一张有效的 SSL/TLS 证书。证书可以从 Let's Encrypt 免费申请，也可以向证书颁发机构购买。

## 用 Certbot 安装 SSL 证书

Let's Encrypt 提供免费的证书，配套的 Certbot 能自动完成申请和 Nginx 配置。

先装 Certbot：

```bash
sudo yum install epel-release
sudo yum install certbot-nginx
```

再申请证书并自动部署（域名替换成自己的）：

```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

## Nginx 配置：HTTPS 加禁止 IP 访问

Certbot 会尝试自动改 Nginx 配置，下面是手动写法的完整示例。

创建站点配置文件：

```bash
sudo nano /etc/nginx/conf.d/yourdomain.com.conf
```

80 端口整段重定向到 HTTPS；443 上挂证书，并用 Host 判断拒绝非域名请求：

![配图](/images/csdn/figures/centos-nginx-https-ip-csdn138811518.png)

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name yourdomain.com www.yourdomain.com;

    # 重定向所有 HTTP 请求到 HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
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

    # 禁止通过 IP 地址访问
    if ($host != yourdomain.com && $host != www.yourdomain.com) {
        return 403;
    }
}
```

改完先测语法，通过后再重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 访问不通时排查

配置无误但 HTTPS 仍然访问失败，大概率卡在防火墙或 WAF 上。

防火墙：确保放行了到 443 端口（SSL 端口）的外部流量。

```bash
sudo firewall-cmd --permanent --zone=public --add-service=https
sudo firewall-cmd --reload
```

WAF：如果用了 ModSecurity 这类 WAF，检查有没有规则拦掉了合法的 HTTPS 请求——WAF 配置过严时误杀正常请求并不少见。

## 注意事项

- 证书路径按 Certbot 实际签发位置写，通常在 /etc/letsencrypt/live/<域名>/ 下。
- if 判断比较的是 $host：IP 直连时 Host 是 IP，不匹配域名即返回 403。
- 每次改 Nginx 配置先 `nginx -t` 再 reload，别带着语法错误上线。
- firewalld 放行 https 服务，对应的就是 443 端口流量。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
