---
title: "Nginx 的 index 模块与 autoindex 模块"
date: 2024-05-27 10:44:21
categories: [技术]
tags: [Nginx]
copyright_author: 司南
cover: /images/csdn/covers/nginx-index-autoindex-csdn139232155.png
updated: 2026-09-11
---

用 Nginx 部署站点时，经常会遇到两个问题：用户访问目录时先返回哪个文件？目录里没有默认文件时，能不能直接列出内容？这两个问题分别由 index 模块和 autoindex 模块解决。本文把这两个模块的指令、用法和坑整理到一起。

## index 模块

index 模块定义目录访问时的默认文件，比如 index.html 或 index.php。

### index 指令

指定目录被访问时要查找的默认文件：

```nginx
index index.html index.htm;
```

可以写多个文件，Nginx 按顺序查找，返回第一个存在的文件。

### 使用示例

```nginx
server {
  listen 80;
  server_name example.com;

  root /var/www/html;

  # 定义默认的索引文件
  index index.html index.htm;

  location / {
    try_files $uri $uri/ =404;
  }
}
```

用户访问 http://example.com/ 时，Nginx 会依次找 `/var/www/html/index.html` 和 `/var/www/html/index.htm`，返回第一个存在的文件；一个都没有则返回 404。

### 使用场景

1. **站点首页**：指定默认首页文件，这是最常用的场景。
2. **语言版本切换**：按语言设置不同的默认文件，例如 index.en.html、index.fr.html。

## autoindex 模块

目录里没有默认文件时，autoindex 模块可以生成目录列表。做文件存储和下载站点时很实用。

### 三个指令

**autoindex**：启用或禁用目录自动索引，取值 on/off：

```nginx
autoindex on;
```

**autoindex_localtime**：目录列表中时间戳的时区。on 使用服务器本地时间，off 使用 UTC 时间，默认 off：

```nginx
autoindex_localtime on;
```

**autoindex_exact_size**：是否显示文件确切字节数。默认 on（显示精确字节）；设为 off 则显示人可读的 1K、1M：

```nginx
autoindex_exact_size off;
```

### 使用示例

![配图](/images/csdn/figures/nginx-index-autoindex-csdn139232155.png)

```nginx
server {
  listen 80;
  server_name files.example.com;

  root /var/www/files;

  location / {
    autoindex on;
    autoindex_localtime on;
    autoindex_exact_size off;
  }
}
```

访问 http://files.example.com/ 时，如果目录里没有默认的 index 文件，Nginx 会生成一个目录列表：修改时间显示为服务器本地时间，文件大小显示为 1K、1M 这种可读形式。

### 使用场景

1. **文件共享和下载站点**：让用户能浏览并下载目录中的文件。
2. **开发和测试环境**：临时共享文件和目录，不用额外搭服务。

## 注意事项

- **安全**：autoindex 一旦开启，目录里所有文件都会被公开列出。生产环境不要对敏感目录启用，确要启用时用 auth_basic 或 allow/deny 收紧访问。
- **性能**：大目录生成列表会有开销，文件极多的目录考虑前端缓存或干脆不对外提供列表。
- **体验**：自动生成的列表页非常朴素，对外提供下载时可考虑自定义样式。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
