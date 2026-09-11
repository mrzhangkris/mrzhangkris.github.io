---
title: "深入理解Nginx的proxy_cache模块：配置指南与最佳实践"
date: 2024-05-13 16:03:41
categories: [技术]
tags: [Nginx]
copyright_author: 张鹏
cover: /images/csdn/covers/nginx-proxy-cache-csdn138807133.png
---

在构建高性能的Web应用时，缓存策略扮演着关键的角色。Nginx的proxy\_cache模块提供了强大而灵活的缓存功能，对于优化网站性能，减轻后端服务器的负担，提高响应速度具有显著的效果。本文旨在详细介绍proxy\_cache模块的常用指令、使用场景，以及配置缓存的最佳实践。

### 常用指令及其用途

#### 1\. proxy\_cache\_path

定义缓存的存储路径及其他参数，如缓存键、过期时间等。
**示例：**

```nginx
proxy_cache_path /data/nginx/cache levels=1:2 keys_zone=my_cache:10m max_size=10g inactive=7d use_temp_path=off;
```

**注意事项：**

-   keys\_zone定义了缓存键及其大小，是必须设置的。
-   max\_size控制缓存区域的最大大小。
-   inactive定义了在指定时间内未被访问的内容自动清除的时间。

#### 2\. proxy\_cache\_key

设置用于缓存的键的字符串，通常包括请求的元素，如URL、请求方法等。
**示**例：

```nginx
proxy_cache_key "$request_method$request_uri$http_cookie";
```

#### 3\. proxy\_cache

启用缓存并指定缓存区域。
**示例：**

```nginx
proxy_cache my_cache;
```

#### 4\. proxy\_cache\_valid

设置不同的响应代码或内容类型的缓存时间。
**示例：**

```nginx
proxy_cache_valid 200 302 10m;
proxy_cache_valid 404 1m;
```

#### 5\. proxy\_cache\_bypass 和 proxy\_no\_cache

proxy\_cache\_bypass用于定义条件跳过缓存，proxy\_no\_cache用于避免缓存特定响应。
**示例（绕过缓存）：**

```nginx
proxy_cache_bypass $cookie_no_cache $arg_no_cache$ http_pragma$ http_authorization;
```

**示例（不缓存响应）：**

```nginx
proxy_no_cache $cookie_no_cache $arg_no_cache$ http_pragma$ http_authorization;
```

### 不需要缓存的内容的配置

在配置Nginx时，对于动态内容或敏感信息，常常需要设置不被缓存。以下是如何配置Nginx，以确保特定内容不被缓存。

#### 实例配置

确保用户个人页面不缓存：

```nginx
location /profile {
  proxy_pass http://backend_server;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header Host $http_host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;

  # 禁用缓存
  proxy_cache_bypass 1;
}

location / {
  proxy_pass http://backend_server;
  proxy_cache my_cache;
  proxy_cache_valid 200 1d;
  proxy_cache_bypass $http_cache_control;
  add_header X-Proxy-Cache $upstream_cache_status;
}
```

### 完整的配置示例

以下是一个集成了以上要点的完整的Nginx配置示例：

```nginx
proxy_cache_path /data/nginx/cache levels=1:2 keys_zone=my_cache:10m max_size=10g inactive=7d use_temp_path=off;

server {
  listen 80;
  server_name mysite.com;

  location / {
    proxy_pass http://backend;
    proxy_cache my_cache;
    proxy_cache_key "$request_method$request_uri$http_cookie";
    proxy_cache_valid 200 302 10m;
    proxy_cache_valid 404 1m;
    proxy_cache_bypass $cookie_no_cache $arg_no_cache $http_pragma $http_authorization;
    proxy_no_cache $cookie_no_cache $arg_no_cache $http_pragma $http_authorization;
  }

  location /profile {
    proxy_pass http://backend;
  }
}
```

通过上述配置，我们能够有效地管理缓存行为，提高网站的性能，同时保证敏感或动态数据的实时性和安全性。

---

> 本文迁移自作者 CSDN 博客，2024-05-13 首发于 CSDN，内容保持原貌。
