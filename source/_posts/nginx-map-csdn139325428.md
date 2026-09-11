---
title: "Nginx map 模块：用变量映射简化请求处理"
date: 2024-05-30 15:19:33
categories: [技术]
tags: [Nginx]
copyright_author: 司南
cover: /images/csdn/covers/nginx-map-csdn139325428.png
updated: 2026-09-11
---

写 Nginx 配置时经常遇到这种事：同一个变量在不同取值下要做不同处理，如果用一堆 if 去分支，配置会迅速变得难读。map 模块就是为这种场景准备的——它根据一个变量的值映射出另一个变量的值，映射表集中写在 map 块里，逻辑一目了然。

## 什么是 map 模块

map 模块允许根据变量的值映射到对应的值。这个映射可以是静态的，也可以是动态的。借助它，可以根据请求中的不同条件——请求的 URL、用户 IP 等——决定如何处理请求。

## 使用场景

- **重定向规则**：基于请求的 URL 进行重定向。
- **访问控制**：根据客户端 IP 地址或其他变量限制访问。
- **灰度发布**：把一部分流量路由到不同的服务器。
- **自定义响应**：根据请求特征返回不同的响应。

## 示例：按 URL 重定向

下面这个例子用 map 根据 $uri 计算重定向目标：

![配图](/images/csdn/figures/nginx-map-csdn139325428.png)

```nginx
http {
  map $uri $redirect_url {
    /old-page   /new-page;
    /about      /about-us;
    default     /not-found;
  }

  server {
    listen 80;
    server_name example.com;

    location / {
      return 301 $redirect_url;
    }
  }
}
```

请求的 URL 是 /old-page 时重定向到 /new-page；是 /about 时重定向到 /about-us；其他任何 URL 都会落到 /not-found。整个重定向表就是 map 块里那三行，改表比改一堆 if 舒服得多。

## 写法要点

- map 块中每一行的格式是 `源值 映射值;`。
- `default` 行定义默认映射值，没有命中其他条件时使用。
- 可以定义多个 map 块，分别处理不同的条件。
- 映射结果存进自定义变量（如 $redirect_url），后续指令直接引用。

## 注意事项

- 尽量避免在大规模生产环境中频繁修改映射规则：map 在每次请求时都会进行匹配，规则多了可能影响性能。
- 映射规则上线前仔细测试，确保行为符合预期，尤其是 default 分支。
- 映射规则变化频繁时，考虑用缓存或其他方式优化，不要把高频变更的逻辑压在 map 上。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
