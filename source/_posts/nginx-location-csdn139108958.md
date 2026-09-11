---
title: "深入理解Nginx的Location模块"
date: 2024-05-22 09:37:37
categories: [技术]
tags: [Nginx]
copyright_author: 张鹏
cover: /images/csdn/covers/nginx-location-csdn139108958.png
---

Nginx 是一个高性能的HTTP和反向代理服务器，其中的 location 模块用于根据请求的URI对请求进行路由。本文将详细介绍 Nginx 的 location 匹配规则、优先级，以及如何使用嵌套的 location 配置，并通过示例代码加以说明。

### 1\. Location 基础

location 指令用于匹配 URI，在 Nginx 配置中，典型的用法如下：

```nginx
location <匹配模式> {
  # 配置的指令
}
```

#### 常见的匹配模式包括：

-   精确匹配（=）
-   前缀匹配（不带特殊标记）
-   正则表达式匹配（~ 和 ~\*）
-   路径结尾匹配（^~）

### 2\. Location的匹配规则和顺序

Nginx 遇到一个请求时，会根据以下顺序来匹配 location 指令：

1. 精确匹配（=）
2. 按前缀匹配（不带特殊标记的）
3. 正则表达式匹配（~ 和 ~\*）
4. 路径结尾匹配（^~）

其中，正则表达式匹配会继续扫描所有正则表达式，选则最长匹配。

#### 示例匹配顺序

```nginx
server {
  listen 80;
  server_name example.com;

  location = /exact-match {
    # 精确匹配
    return 200 'Exact match';
  }

  location /prefix {
    # 前缀匹配
    return 200 'Prefix match';
  }

  location ~ \.php$ {
    # 正则表达式匹配（区分大小写）
    return 200 'Regex match';
  }

  location ~* \.php$ {
    # 正则表达式匹配（不区分大小写）
    return 200 'Regex match case insensitive';
  }

  location ^~ /important {
    # 路径结尾匹配
    return 200 'Caret tilde match';
  }

  location / {
    # 默认的前缀匹配
    return 200 'Default';
  }
}
```

当访问 example.com/ 时会匹配到最后一个 location，因为它是默认的前缀匹配。访问 example.com/exact-match 则会匹配到 location = /exact-match，而访问 example.com/prefix 则会匹配到 location /prefix。

### 3\. 嵌套 location

Nginx 允许在一个location块内嵌套另一个location块。这在需要对特定路径下的某些子路径进行特殊处理时非常有用。

#### 嵌套location示例

```nginx
server {
  listen 80;
  server_name example.com;

  location / {
    root /var/www/html;

    location /images {
      root /var/www/images;
      # 此处可以添加特定于 /images 的配置
    }

    location /api {
      proxy_pass http://backend;
      # 处理 /api 请求的代理配置
    }
  }
}
```

在上述配置中，访问 example.com/images 时，会匹配到嵌套的 location /images，并在 /var/www/images 中查找资源。而访问 example.com/api 时，请求会被代理到后端服务器。

### 4\. 优先级和详细示例

Nginx 根据匹配规则选择优先级最高的 location 指令来处理请求。以下示例展示了如何利用这些规则进行复杂配置。

```nginx
server {
  listen 80;
  server_name example.com;

  location = / {
    return 200 'Exact match for root';
  }

  location / {
    return 200 'Default root prefix match';
  }

  location ^~ /static {
    return 200 'Static files';
  }

  location ~ \.php$ {
    fastcgi_pass 127.0.0.1:9000;
    include fastcgi_params;
  }

  location /images {
    root /data;

    location ~ \.jpg$ {
      return 200 'JPEG image';
    }
  }
}
```

说明：

-   location = / 会匹配根目录的精确请求（如：http://example.com/）。
-   location / 捕捉所有其他未被更具体的 location 捕捉到的请求。
-   location ^~ /static 优先匹配以 /static 开头的请求，忽略正则表达式。
-   location ~ .php$ 匹配所有以 .php 结尾的请求，进行了 FastCGI 代理。
-   location /images 和其嵌套的 location ~ .jpg$ 分别匹配 /images 目录及其下的 JPEG 文件。

### 结论

Nginx 的 location 模块是其配置的核心，通过合理配置 location，可以实现高效、灵活的请求处理。在实际应用中，了解 location 匹配规则和顺序对于正确配置 Nginx 十分重要。

**希望本文的示例和解释能帮助你更好地掌握这一模块。**

---

> 本文迁移自作者 CSDN 博客，2024-05-22 首发于 CSDN，内容保持原貌。
