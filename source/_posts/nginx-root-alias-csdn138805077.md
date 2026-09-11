---
title: "深入理解Nginx的root和alias指令"
date: 2024-05-13 15:27:15
categories: [技术]
tags: [Nginx]
copyright_author: 张鹏
cover: /images/csdn/covers/nginx-root-alias-csdn138805077.png
---

Nginx是一种强大的Web服务器和反向代理服务器，广泛用于提供静态文件服务、负载均衡以及作为HTTP缓存。在配置Nginx时，root和alias是两个重要但经常令人混淆的指令，尤其用于指定资源在服务器文件系统中的位置。本篇博文将详细介绍这两个指令的用途、它们之间的不同之处以及具体的使用场景。

### root指令

root指令在Nginx配置中非常常见，用于设置服务器中资源的根目录。这意味着Nginx会从这个指定的目录中查找并服务文件。

#### 示例

假设网站有一个位于/var/www/html的文档根目录，需要为网站根URL提供服务，配置文件中可以这样设置：

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

在此配置中，如果有请求访问http://example.com/images/logo.png，Nginx会在/var/www/html/images/logo.png查找该文件。

### alias指令

与root指令不同，alias用于为特定的location块设置路径别名，这意味着它可以让你为特定的URI请求更改查找的路径。

#### 示例

假设你希望/images目录映射到物理路径/data/uploads，但不想将其暴露于URL中，可以使用alias：

```nginx
server {
    listen 80;
    server_name example.com;

    location /images/ {
        alias /data/uploads/;
    }
}
```

在这种配置下，如果客户请求http://example.com/images/logo.png，Nginx实际上将返回/data/uploads/logo.png的内容。

### root与alias的主要区别

-   **路径拼接方式**: 使用root时，location块中指定的URI将会直接拼接到root路径后面。而alias则会将location中匹配的部分路径替换为alias指定的路径。
-   **适用场景**: root适用于网站的广泛区域，常在server或location块中定义。alias适用于单独改变特定location的路径，适合更细粒度的路径控制。

> 注意：
>
> 1. 使用alias时，目录名后面一定要加"/"。
> 2. alias在使用正则匹配时，必须捕捉要匹配的内容并在指定的内容处使用。
> 3. alias只能位于location块中。（root可以不放在location中）

### 使用场景

-   **使用root**：当你想为整个服务器或者特定位置提供一个统一的根目录时，使用root是最简单直接的方法。
-   **使用alias**：当你需要对服务器上的特定资源进行映射，而这部分资源又不在当前的根目录中时，alias是不可或缺的。例如，如果某些动态生成的文件存放在不同于静态文件的目录，就可以通过alias来进行特殊处理。

---

> 本文迁移自作者 CSDN 博客，2024-05-13 首发于 CSDN，内容保持原貌。
