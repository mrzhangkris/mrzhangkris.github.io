---
title: "在 CentOS 上使用 Nginx 配置 HTTPS 并禁止 IP 访问"
date: 2024-05-14 08:30:00
categories: [技术]
tags: [Nginx]
copyright_author: 张鹏
cover: /images/csdn/covers/centos-nginx-https-ip-csdn138811518.png
---

今天的博文将在 CentOS 系统上使用 Nginx 配置 HTTPS。同时，通过一些配置策略来禁止通过 IP 地址直接访问站点，增强安全性。更重要的是，如果在配置正确后访问仍然失败，将探讨可能的原因，例如 WAF 等防火墙设置的影响。

#### 一、准备开始

在进行配置前，请确保您的 CentOS 服务器已经安装了 Nginx。此外，您还需要为您的域名准备一个有效的 SSL/TLS 证书。证书可以通过 Let’s Encrypt 免费获取，或从其他证书颁发机构购买。

#### 二、安装 SSL 证书

Let’s Encrypt 提供了免费的证书和自动配置工具 Certbot，操作如下：

1. 安装 Certbot 工具：
```
sudo yum install epel-release
sudo yum install certbot-nginx
```
2. 运行 Certbot，获取并自动配置 SSL：
```
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

请务必将 yourdomain.com 和 www.yourdomain.com 替换为您实际的域名。

#### 三、Nginx 配置详解

在获取 SSL 证书后，Certbot 会尝试自动更新您的 Nginx 配置。以下是手动配置 HTTPS 的示例，包括如何禁止 IP 地址访问。

1. 创建或编辑 Nginx 配置文件:
```
sudo nano /etc/nginx/conf.d/yourdomain.com.conf
```
2. 增加以下配置，以支持 HTTPS 并禁止通过 IP 访问:
```
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
3. 启用配置并验证是否正确：
```
sudo nginx -t
sudo systemctl reload nginx
```

#### 四、排除故障

如果在配置后，HTTPS 访问未能成功，这可能与服务器的防火墙或 WAF（Web Application Firewall）设置有关。您需要检查：

1. **防火墙规则**：确保防火墙规则允许从外部网络到服务器的 443 端口（SSL端口）的流量。
```
sudo firewall-cmd --permanent --zone=public --add-service=https
sudo firewall-cmd --reload
```
2. **WAF设置**：如果您使用了 WAF 如 ModSecurity 等，确保没有任何规则阻止了合法的 HTTPS 请求。有时，WAF 的配置过于严格会误杀正常请求。

---

> 本文迁移自作者 CSDN 博客，2024-05-14 首发于 CSDN，内容保持原貌。
