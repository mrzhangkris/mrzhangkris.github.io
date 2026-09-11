---
title: "Nginx addition 模块：动态合并响应内容"
date: 2024-05-28 10:20:58
updated: 2026-09-11
categories: [技术]
tags: [Nginx]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1680992046626-418f7e910589?w=1600&q=80&fm=jpg
---

页面里经常有广告位、推荐位这类由后端单独提供的小片段，如果每个片段都让浏览器再发一次请求，请求数和后端压力都会跟着涨。Nginx 的 addition 模块提供了另一种思路：在 Nginx 层把多个响应体拼成一份再返回。这篇记录它的用途、配置方法和要注意的坑。

## addition 模块是干什么的

addition 模块允许在 Nginx 中动态合并 HTTP 响应体：它把多个响应体合并为单个响应体返回给客户端，减少浏览器侧的请求次数，页面加载也会更快。

> 注：该模块实际的工作机制是在响应体前后追加子请求的内容（add_before_body / add_after_body），原文表述与此有出入，存疑保留。

## 典型使用场景

- **合并静态资源**：把 CSS、JavaScript 等静态资源文件并进同一个响应，减少 HTTP 请求次数。
- **动态内容合并**：把后端单独生成的动态内容（广告、推荐位等）并进主响应，降低后端负载，加快页面加载。
- **压缩提效**：内容合并成一份后可以整体交给 gzip 压缩，传输量更小。

## 配置示例

以一个多广告位页面为例：每个广告位对应一个后端请求，用 addition 把这些内容合并进单个响应：

![配图](/images/csdn/figures/nginx-addition-csdn139259142.png)

```nginx
http {
  server {
    location /ad {
      addition on;
      addition_types text/html text/css;
      addition_output_charset utf-8;
      proxy_pass http://backend;
    }
  }
}
```

逐行看这段配置在做什么：

- `addition on;` 打开 addition 模块的过滤开关；
- `addition_types text/html text/css;` 限定只对这两种 MIME 类型的响应做合并；
- `addition_output_charset utf-8;` 指定合并输出的字符集为 utf-8；
- `proxy_pass http://backend;` 把 /ad 路径的请求转给后端，由 Nginx 把合并后的内容返回给客户端。

> 注：按 addition 模块的常规用法，还需要 add_before_body / add_after_body 指定参与合并的子请求位置；原文示例未包含这两条指令，照抄可能达不到合并效果，存疑保留。

## 注意事项

- **缓存要谨慎**：合并结果如果按请求缓存，缓存 key 设计不好会把 A 请求的内容展示给 B，缓存失效场景要专门测。
- **性能有代价**：合并操作会增加 Nginx 的 CPU 和内存开销，内容多、流量大时要在功能和性能之间做权衡。
- **内容一致性**：参与合并的各段内容样式和结构要一致，否则拼出来的页面会错乱、丢样式。
- **配合 gzip**：合并后的响应交给 gzip 模块压缩，数据传输量进一步下降。
- **配合缓存与反向代理**：合并结果再过一层缓存能减少重复合并；结合反向代理，可以把多个后端服务的响应合并为单个响应返回。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
