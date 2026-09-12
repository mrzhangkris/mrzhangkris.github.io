---
title: "Nginx Concat 模块：安装与合并静态资源"
date: 2024-05-27 14:41:46
updated: 2026-09-11
categories: [技术]
tags: [Nginx]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1506399558188-acca6f8cbf41?w=1600&q=80&fm=jpg
---

页面引用十几个 CSS/JS 文件，浏览器就得发十几个请求——Concat 模块让服务器端把多个文件合成一个响应返回，请求数和网络延迟都降下来。它是阿里 Tengine 系的第三方模块，官方 Nginx 不带，这篇按原文的安装思路在容器里实编译一遍，再把它真正的用法（`??` URL 合并）、类型约束和超限保护逐个实测。

## 安装：第三方模块要走 --add-module

Concat 不在官方发行版里，安装就是"取源码、编译进 Nginx"四步（以下在 Alpine 容器实测通过，模块仓库 alibaba/nginx-http-concat，Nginx 1.28.0）：

```bash
git clone https://github.com/alibaba/nginx-http-concat.git
cd nginx-1.28.0
./configure --add-module=/path/to/nginx-http-concat
make && make install
```

> 注：原文写的仓库地址 `alibaba/ngx_http_concat_module` 实测不存在（GitHub 404），真实仓库名是 `nginx-http-concat`。

**验证点**：编译完成后 `nginx -V` 应看到 `--add-module=.../nginx-http-concat`；`nginx -t` 不报 unknown directive 才算装好。

## 核心机制一句话

Concat 的触发方式很特别——**写在 URL 里**：请求 `/css/??a.css,b.css`，两个问号后面的文件名列表就是合并对象，Nginx 把这些文件按顺序拼成一个响应返回。指令只负责开开关、划边界。

## 配置与实例

```nginx
server {
  listen 80;
  root /usr/local/nginx/html;

  location /css/ {
    concat on;
    concat_max_files 10;
    concat_types text/css application/javascript;
  }
}
```

- `concat on;` 打开合并功能；
- `concat_max_files 10;` 单个合并请求最多 10 个文件，防超长 URL 攻击；
- `concat_types` 限定可合并的 MIME 类型（默认已含 text/css 和 application/x-javascript）；
- `concat_unique on`（默认）要求一次合并全是同类文件，`off` 才允许 CSS 和 JS 淡合。

### 实例一：合并三个 CSS

准备 style1.css、style2.css、style3.css，一条 URL 合并：

![配图1](/images/csdn/figures/nginx-concat-csdn139237844-1.png)

三个文件的规则体按 URL 里的顺序拼进一个响应。与逐个请求相比，浏览器只发一次请求、只走一次连接，HTTP/1.1 时代这是实打实的性能优化。

### 实例二：混类型与 concat_unique

默认 `concat_unique on` 时，把 CSS 和 JS 塞进同一个请求会被拒绝（400）；声明 `concat_unique off;` 后，css 与 js 才能合并返回——实测两种行为对比：

![配图2](/images/csdn/figures/nginx-concat-csdn139237844-2.png)

### 实例三：边界的三个 400

合并请求的失败形态各有含义，实测三种：文件不存在返回 **404**；文件数超过 `concat_max_files` 返回 **400** 且 error.log 记录 `client sent too many concat filenames`；还有一个隐蔽形态——**MIME 类型不在 `concat_types` 里的文件混进请求，直接 400 且不写 error.log**。第三种最坑：忘了 `include mime.types;` 时所有 CSS 都会被判成默认类型，合并全部静默 400。

![配图3](/images/csdn/figures/nginx-concat-csdn139237844-3.png)

## 注意事项

- **mime.types 必须先就位**：`http` 块里 `include mime.types;` 之后再谈 concat，否则类型匹配失败、合并全部无日志 400（实测踩中）。
- **升级 Nginx 记得带模块**：concat 是编译进去的，重装/升级时 `--add-module` 参数丢了，配置里的 concat 指令立刻 unknown directive。
- **concat_max_files 给个贴合业务的值**：它是防滥用上限，不是性能参数；按页面真实引用数 + 余量设，太大失去保护意义。
- **HTTP/2 时代收益要重估**：多路复用让请求合并的收益缩水，拼接还会破坏单独缓存——文件内容一变，整个合并 URL 的缓存全失效。历史项目按需保留，新项目先测再上。

## 小结

回到开头的场景：十几个静态文件请求压成一次——Concat 用一个 `??` URL 做到了，配置面只有 `concat on`、`concat_max_files`、`concat_types` 三五个指令。实跑下来要带走的是三条边界：仓库真实地址是 `alibaba/nginx-http-concat`；`concat_types` 覆盖不到的类型会静默 400（mime.types 先 include）；文件数超 `concat_max_files` 直接拒掉。要不要在新项目里用它，先看你的用户还在不在 HTTP/1.1 上。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
