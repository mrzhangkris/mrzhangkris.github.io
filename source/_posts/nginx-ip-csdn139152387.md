---
title: "Nginx 限制 IP 访问：allow 与 deny"
date: 2024-05-23 16:58:55
categories: [技术]
tags: [Nginx]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1592659762303-90081d34b277?w=1600&q=80&fm=jpg
updated: 2026-09-11
---

运维场景里经常要限制某些 IP 才能访问：后台入口只对公司网段开放、接口目录只留给监控机。Nginx 提供了 allow 和 deny 两个指令专门干这件事，本文把它们的用法和几个典型写法过一遍。

## allow 与 deny 指令

- **allow**：允许指定 IP 地址或子网范围的访问。
- **deny**：拒绝指定 IP 地址或子网范围的访问。

这两个指令可以放在 http、server 或 location 块中，作用范围跟着块走。Nginx 按书写顺序逐条匹配，命中即停止，所以通常把允许的条目放前面，最后用 `deny all` 兜底。

## 基本示例

假设有这样一个普通站点配置：

```nginx
server {
  listen 80;
  server_name example.com;

  location / {
    root /var/www/html;
    index index.html;
  }
}
```

要求只有 IP 为 192.168.1.1 的用户能访问，其余全部拒绝：

![配图](/images/csdn/figures/nginx-ip-csdn139152387.png)

```nginx
server {
  listen 80;
  server_name example.com;

  location / {
    # 允许指定的IP地址访问
    allow 192.168.1.1;
    # 拒绝所有其他IP地址访问
    deny all;

    root /var/www/html;
    index index.html;
  }
}
```

## 在不同配置块中的用法

### 在 server 块中限制

整个站点只对 10.0.0.1 和 10.0.0.0/24 网段开放：

```nginx
http {
  server {
    listen 80;
    server_name example.com;

    # 允许10.0.0.1 IP访问
    allow 10.0.0.1;
    # 允许10.0.0.0/24网段内的IP访问
    allow 10.0.0.0/24;
    # 拒绝所有其他IP地址访问
    deny all;

    location / {
      root /var/www/html;
      index index.html;
    }
  }
}
```

### 在 location 块中限制

只锁 `/admin` 路径，允许 192.168.0.0/16 私有网段访问，其余路径不受影响：

```nginx
http {
  server {
    listen 80;
    server_name example.com;

    location /admin {
      # 允许私有IP网段访问
      allow 192.168.0.0/16;
      # 拒绝所有其他IP地址访问
      deny all;

      root /var/www/html/admin;
      index index.html;
    }

    location / {
      root /var/www/html;
      index index.html;
    }
  }
}
```

### 多个 location 分别限制

不同路径对应不同的允许名单，互相独立：

```nginx
http {
  server {
    listen 80;
    server_name example.com;

    location /admin {
      # 允许特定的IP访问/admin路径
      allow 203.0.113.1;
      deny all;

      root /var/www/html/admin;
      index index.html;
    }

    location /private {
      # 允许特定网段访问/private路径
      allow 192.168.1.0/24;
      deny all;

      root /var/www/html/private;
      index index.html;
    }

    location / {
      root /var/www/html;
      index index.html;
    }
  }
}
```

## 测试配置

改完配置不要直接 reload，先验证语法再应用：

```bash
# 测试Nginx配置文件是否有语法错误
sudo nginx -t

# 重新加载Nginx以应用新的配置
sudo systemctl reload nginx
```

## 注意事项

- allow/deny 是按书写顺序匹配的，规则写反了（比如 `deny all` 放最前）会让后面的 allow 全部失效。
- 规则的作用范围跟所在块走：server 块管全站，location 块只管该路径。
- 子网要用 CIDR 写法（如 10.0.0.0/24），单 IP 直接写地址。
- 放行后台、管理接口这类敏感路径时，IP 白名单最好配合认证一起用，别只靠一层防护。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
