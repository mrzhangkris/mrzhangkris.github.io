---
title: "控制访问来源：Nginx Referer 模块"
date: 2024-05-29 08:45:00
categories: [技术]
tags: [Nginx]
copyright_author: 张鹏
cover: /images/csdn/covers/nginx-referer-csdn139267748.png
---

Nginx 是一款高性能的开源 Web 服务器，其灵活的模块化结构为管理员提供了丰富的配置选项。其中之一就是 Referer 模块，它允许管理员控制允许或拒绝来自特定来源的请求。本文将深入探讨 Nginx Referer 模块的用法、示例以及其在实际场景中的用途。

### 什么是 Referer？

在 HTTP 请求头中，Referer 是一个标头字段，用于指示请求的来源页面的 URL。当用户点击链接访问网页时，浏览器通常会在发送请求时包含 Referer 头。Referer 的存在使得服务器可以知道用户从哪个页面链接过来的。

### Nginx Referer 模块的用途

Nginx Referer 模块可以用于多种用途，包括但不限于：

1. **防盗链**：防止其他网站盗用您的资源，只允许特定来源页面加载资源。
2. **统计分析**：通过统计 Referer 信息，了解访问者的来源，进行网站流量分析。
3. **安全控制**：限制某些来源页面的访问权限，提高网站的安全性。

### 示例1：防盗链设置

使用 Nginx Referer 模块来防止盗链：

```nginx
server {
  listen 80;
  server_name yourwebsite.com;

  location / {
    valid_referers none blocked yourwebsite.com;
    if ($invalid_referer) {
      return 403;
    }
    # 允许直接访问的来源
    allow yourwebsite.com;
    deny all;
  }
}
```

配置中指定了允许的 Referer 来源，只允许来自本网站（yourwebsite.com）的请求访问资源。其他来源的请求将会被拒绝，并返回 403 Forbidden 错误。

#### 说明

-   valid\_referers 指令用于指定允许的 Referer 来源列表。
-   if ($invalid\_referer) 用于检查请求的 Referer 是否在允许列表中。
-   allow 和 deny 指令用于进一步控制访问权限，这里我们只允许来自指定来源的请求访问。

#### 使用场景

1. **图片、视频等资源保护**：防止其他网站直接链接到您的图片或视频资源，减少带宽消耗。
2. **付费内容保护**：确保只有付费用户才能访问付费内容，通过验证 Referer 来源。
3. **防止恶意请求**：限制只允许来自合法来源的请求，防止恶意爬虫或攻击。

#### 示例2：统计分析

使用 Nginx Referer 模块来记录访问者的来源：

```nginx
http {
  log_format referer_log '$remote_addr - $remote_user [$time_local] "$request" '
    '$status $body_bytes_sent "$http_referer" "$http_user_agent"';

  access_log /var/log/nginx/referer.log referer_log;

  server {
    listen 80;
    server_name yourwebsite.com;

    location / {
      valid_referers none blocked yourwebsite.com;
      if ($invalid_referer) {
        return 403;
      }
      # 记录 Referer 信息
      access_log /var/log/nginx/referer_access.log referer_log;
      allow yourwebsite.com;
      deny all;
    }
  }
}
```

在这个配置中，定义了一个名为 referer\_log 的日志格式，用于记录请求的详细信息，包括 Referer 头和用户代理信息。然后在 server 块中的 location 配置中，将符合条件的请求记录到指定的日志文件中。

##### 说明

-   log\_format 指令定义了日志格式，其中 $http\_referer 和 $http\_user\_agent 变量用于记录请求的 Referer 和用户代理信息。
-   access\_log 指令用于指定访问日志文件的路径和日志格式。
-   在 location 配置中，将符合条件的请求记录到指定的访问日志文件中。

##### 使用场景

1. **广告效果分析**：通过统计 Referer 信息，分析广告点击来源，评估广告效果。
2. **流量来源分析**：了解网站流量的来源，优化营销策略和内容发布。
3. **用户行为分析**：根据不同来源的用户行为特点，调整网站内容和功能。

---

> 本文迁移自作者 CSDN 博客，2024-05-29 首发于 CSDN，内容保持原貌。
