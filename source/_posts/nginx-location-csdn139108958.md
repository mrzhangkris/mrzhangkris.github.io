---
title: "Nginx location 的匹配规则与嵌套"
date: 2024-05-22 09:37:37
categories: [技术]
tags: [Nginx]
copyright_author: 司南
cover: /images/csdn/covers/nginx-location-csdn139108958.png
updated: 2026-09-11
---

一个请求进来该由哪个 location 处理，取决于 Nginx 的 location 匹配规则。这套规则决定了请求怎么路由，是写 Nginx 配置绕不开的一块。本文整理 location 的匹配模式、匹配顺序和嵌套用法。

## Location 基础

location 指令用于匹配 URI，典型写法：

```nginx
location <匹配模式> {
  # 配置的指令
}
```

常见的匹配模式有四类：

- 精确匹配（`=`）
- 前缀匹配（不带特殊标记）
- 正则表达式匹配（`~` 和 `~*`）
- 路径结尾匹配（`^~`）

## 匹配顺序

Nginx 遇到一个请求时，按以下顺序匹配 location 指令：

1. 精确匹配（`=`）
2. 按前缀匹配（不带特殊标记的）
3. 正则表达式匹配（`~` 和 `~*`）
4. 路径结尾匹配（`^~`）

原文此处还提到"正则表达式匹配会继续扫描所有正则表达式，选择最长匹配"。

> 注：这段顺序与 Nginx 的实际行为有出入——`^~` 实际上是前缀匹配的修饰符：先找最长前缀匹配，若它带 `^~` 则直接采用、不再查正则；否则正则按配置顺序取第一个命中的。上文第 4 节的示例说明（"^~ /static 优先匹配……忽略正则表达式"）也印证了这一点。以官方文档为准。

### 示例

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

访问 example.com/ 会匹配最后一个 location（默认前缀匹配）；访问 example.com/exact-match 命中 `location = /exact-match`；访问 example.com/prefix 则命中 `location /prefix`。

## 嵌套 location

location 块内可以再嵌套 location 块，适合对某个路径下的特定子路径做特殊处理：

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

访问 example.com/images 时命中嵌套的 `location /images`，资源在 /var/www/images 中查找；访问 example.com/api 则被代理到后端。

## 优先级与综合示例

下面的配置把几种匹配模式放在一起，展示规则的实际效果：

![配图](/images/csdn/figures/nginx-location-csdn139108958.png)

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

逐条看：

- `location = /` 只匹配根路径的精确请求（如 http://example.com/）。
- `location /` 兜底，接住所有未被更具体 location 匹配的请求。
- `location ^~ /static` 优先匹配以 /static 开头的请求，并且忽略正则表达式。
- `location ~ \.php$` 匹配所有以 .php 结尾的请求，走 FastCGI 代理。
- `location /images` 与其嵌套的 `location ~ \.jpg$` 分别处理 /images 目录和其中的 JPEG 文件。

## 注意事项

- 精确匹配 `=` 命中后立即结束查找，高频访问的固定路径（如首页）用它最划算。
- 正则按配置文件里的书写顺序取第一个命中，与"最长匹配"无关，正则块的先后顺序就是优先级。
- `^~` 的价值在于跳过正则：确定某前缀想整体按前缀处理（如静态目录）时加上它，避免被后面的正则意外截胡。
- 嵌套 location 只在父 location 的路径范围内进一步细分，继承父块的上下文。
- 拿不准实际命中哪个 location 时，看 access 日志或用 return 200 打标记验证。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
