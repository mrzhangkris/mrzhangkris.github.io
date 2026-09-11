---
title: "Nginx root 与 alias 指令：路径拼接的两种方式"
date: 2024-05-13 15:27:15
updated: 2026-09-11
categories: [技术]
tags: [Nginx]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1697577418970-95d99b5a55cf?w=1600&q=80&fm=jpg
---

配置静态文件服务时，`root` 和 `alias` 都负责告诉 Nginx 去文件系统的哪个目录找文件。这俩指令长得像、干的活不同，混淆的后果很直接：请求 404 或者返回了错误的文件。这篇文章把两者的行为、区别和适用场景讲清楚。

## root：URI 直接拼在根目录后面

`root` 设置资源根目录，Nginx 把请求 URI **原样拼接**到这个目录后面去找文件。

网站文档根目录是 `/var/www/html` 时，典型写法：

```nginx
server {
    listen 80;
    server_name example.com;

    root /var/www/html;

    location / {
        try_files $uri $uri/ =404;
    }
}
```

此时请求 `http://example.com/images/logo.png`，Nginx 会去找 `/var/www/html` + `/images/logo.png`，也就是 `/var/www/html/images/logo.png`。

## alias：把 location 匹配的部分换掉

`alias` 给特定 location 设置路径别名：location 里匹配到的 URI 部分会被**替换**成 alias 指定的路径。

想把 URL 上的 `/images` 目录映射到磁盘上的 `/data/uploads`，又不让真实目录名出现在 URL 里：

```nginx
server {
    listen 80;
    server_name example.com;

    location /images/ {
        alias /data/uploads/;
    }
}
```

请求 `http://example.com/images/logo.png` 时，location 匹配掉的 `/images/` 被替换为 `/data/uploads/`，最终返回 `/data/uploads/logo.png`。

![配图](/images/csdn/figures/nginx-root-alias-csdn138805077.png)

## 两者的主要区别

- **路径拼接方式**：root 是 URI 直接拼接到 root 路径后面；alias 是把 location 中匹配的那部分路径替换为 alias 指定的路径。
- **适用范围**：root 可以写在 server 或 location 块中，适合给网站的大片区域提供统一根目录；alias 只能写在 location 块中，用来对特定 location 做细粒度的路径映射。

## 使用场景

- **用 root**：整站静态文件都在一个目录树下时，root 是最简单直接的选择，server 块里写一次全局生效。
- **用 alias**：某部分资源不在当前根目录里、或者想隐藏真实目录结构时用 alias。比如动态生成的文件单独存放在另一个目录，就用 alias 把对应的 URI 段映射过去。

## 注意事项

- 使用 alias 时，目录路径末尾一定要加 `/`，并且 location 的匹配前缀也以 `/` 结尾，两边对齐才不会拼出错位的路径。
- 正则匹配的 location 里用 alias 时，alias 的值必须包含正则捕获组，例如 `location ~ ^/images/(.+)$ { alias /data/uploads/$1; }`——没有捕获组 Nginx 会报错或解析出错误路径。
- alias 只能放在 location 块里；root 没有这个限制，可以写在 http、server、location 任意层级。
- 排查路径问题时，先在 error_log 里把找不到文件的报错打开，Nginx 会打印它实际尝试的完整路径，root/alias 拼没拼对一眼就能看出来。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
