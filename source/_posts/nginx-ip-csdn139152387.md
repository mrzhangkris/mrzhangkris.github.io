---
title: "Nginx限制IP访问详解"
date: 2024-05-23 16:58:55
categories: [技术]
tags: [Nginx]
copyright_author: 张鹏
cover: /images/csdn/covers/nginx-ip-csdn139152387.png
---

在Web服务器管理中，限制某些IP地址访问网站是一个常见的需求。Nginx作为一款高性能的HTTP服务器和反向代理服务器，提供了灵活强大的配置选项来实现这一功能。本文将详细讲解如何在Nginx中限制IP访问，并通过示例代码展示具体操作。

### 一、Nginx配置文件

Nginx的配置文件通常位于/etc/nginx/nginx.conf或/etc/nginx/conf.d/目录下。可以通过编辑这些配置文件来实现IP访问限制。

### 二、限制IP访问的方法

#### 1\. 基于allow和deny指令

Nginx提供了allow和deny两个指令来控制IP访问。其中：

-   **allow**：允许指定IP地址或子网范围的访问。
-   **deny**：拒绝指定IP地址或子网范围的访问。

这些指令可以在http、server或location块中使用。

#### 2\. 基本示例

假设有一个简单的Nginx配置文件，如下所示：

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

希望只有IP地址为192.168.1.1的用户能够访问这个站点，其他用户都被拒绝访问。以下是实现方法：

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

#### 3\. 详细示例及注释

以下示例展示了在不同的配置块中使用allow和deny指令：

##### 示例 1: 在server块中限制IP访问

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

##### 示例 2: 在location块中限制IP访问

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

##### 示例 3: 多个location块中限制IP访问

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

#### 4\. 测试配置

编辑完配置文件后，测试配置并重新加载Nginx：

```bash
# 测试Nginx配置文件是否有语法错误
sudo nginx -t

# 重新加载Nginx以应用新的配置
sudo systemctl reload nginx
```

### 三、总结

通过使用Nginx的allow和deny指令，可以轻松地控制哪些IP地址或子网段能够访问网站资源。这对于保护敏感信息、限制恶意访问等场景非常有用。

**希望本文能帮助你更好地理解和配置Nginx的IP访问控制功能。**

---

> 本文迁移自作者 CSDN 博客，2024-05-23 首发于 CSDN，内容保持原貌。
