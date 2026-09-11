---
title: "Nginx autoindex：让目录在浏览器里直接可浏览"
date: 2024-05-13 15:42:16
updated: 2026-09-11
categories: [技术]
tags: [Nginx]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1639066648921-82d4500abf1a?w=1600&q=80&fm=jpg
---

服务器上有一批文件想让同事在浏览器里直接翻，又不想专门写页面——autoindex 就是 Nginx 自带的目录列表功能：请求指向的目录里没有 index.html 这类默认索引文件时，Nginx 会自动生成一个列出全部文件和子目录链接的 HTML 页面。这篇记录它的用法和几个配套选项。

## autoindex 是什么

autoindex 指令控制 Nginx 是否允许在浏览器中显示目录内容。Web 服务器收到指向目录的请求、且目录里没有默认索引文件（如 index.html）时，如果 autoindex 设置为 on，Nginx 会展示一个包含该目录下所有文件和子目录链接的 HTML 页面。

三个常见使用场景：

- **开发环境**：开发阶段快速浏览服务器上各目录的文件，省去登机器翻目录。
- **内部共享**：在内网向团队成员展示或共享一批文件、文档。
- **资源库展示**：图片库、下载资源这类静态内容目录，提供直观的目录浏览。

## 基本配置

```nginx
server {
    listen 80;
    server_name example.com;

    location /content/ {
        root /var/www/html;
        autoindex on;
    }
}
```

这段配置的效果：所有指向 http://example.com/content/ 的请求，都会看到 /var/www/html/content/ 目录下的文件和子目录列表。`root` 指定站点文件的根路径，`autoindex on` 打开自动索引。

![配图](/images/csdn/figures/nginx-autoindex-csdn138805950.png)

## 相关配置项

Nginx 还提供了两个控制显示效果的指令：

- `autoindex_exact_size`：on（默认）显示文件的精确大小；off 时显示大约大小，以更友好的单位（KB、MB）呈现。
- `autoindex_localtime`：默认 off，文件时间显示为 GMT 时间；on 时显示服务器本地时间。

把它们加进配置：

```nginx
server {
    listen 80;
    server_name example.com;

    location /content/ {
        root /var/www/html;
        autoindex on;
        autoindex_exact_size off;
        autoindex_localtime on;
    }
}
```

访问 http://example.com/content/ 时，文件大小不再是精确到字节的数字，文件时间也按服务器本地时区显示。

## 注意事项

- autoindex 会把目录内容原样暴露给访问者，含敏感信息的目录不要开启。
- 用合适的访问控制或密码保护限制 autoindex 目录的访问范围。
- 定期检查 Web 服务器日志，确认目录索引没有被恶意访问。
- autoindex 只在目录没有默认索引文件时生效；目录里放了 index.html，Nginx 会优先返回它，看到的将是页面而不是文件列表。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
