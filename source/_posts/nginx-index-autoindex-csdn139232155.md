---
title: "Nginx index 与 autoindex 模块：默认首页与目录列表实测"
date: 2024-05-27 10:44:21
categories: [技术]
tags: [Nginx]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1562408590-e32931084e23?w=1600&q=80&fm=jpg
updated: 2026-09-11
---

用 Nginx 部署站点时，目录访问绕不开两个问题：用户访问一个目录时先返回哪个文件？目录里没有默认文件时，是给 403、404 还是一份文件列表？前一个问题归 index 模块管，后一个问题归 autoindex 模块管。这两个问题没配好，最常见的结果是访问首页莫名收到 403。这篇把两个模块的指令写法放在一起讲，并用容器实测展示顺序命中、403 现场和列表效果。

## 实验环境

nginx/1.31.5 容器（docker 镜像 `nginx:alpine`，一次性容器，用完即删），站点根目录用镜像自带的 `/usr/share/nginx/html`，配置写在 `conf.d/default.conf`，每轮改动后 `nginx -s reload`，用容器内 curl 验证。

## 两个模块各答一个问题

核心机制一句话：**index 模块决定"目录 → 默认文件"的映射，autoindex 模块决定"没有默认文件时，目录本身要不要列出内容"。**

两个模块常被一起提，但职责完全不同：index 是映射规则，回答"访问 `/` 时实际读哪个文件"；autoindex 是兜底开关，只在"目录请求、又找不到 index 指定的文件"时才介入。理解了这条分工，"首页 403 该调哪个指令"就不会搞混——403 出现，说明 index 没找到文件，而 autoindex 没开或不敢开。

## 实例一：index 指令按顺序命中

index 指令定义目录的默认文件，可以写多个，Nginx 按书写顺序逐个查找，返回第一个存在的文件：

```nginx
server {
  listen 80;
  server_name example.com;

  root /usr/share/nginx/html;

  index index.html index.htm;

  location / {
    try_files $uri $uri/ =404;
  }
}
```

"按顺序"到底怎么个顺序法，实测最直观。往站点根目录放两个文件，各写一行可辨认的内容：

![配图1](/images/csdn/figures/nginx-index-autoindex-csdn139232155-1.png)

第一轮两个文件都在，命中的是排在前面的 `index.html`；删掉它再请求，命中 `index.htm`。`try_files $uri $uri/ =404` 里的 `$uri/` 就是触发 index 模块的位置——请求落在目录上时，交给 index 指令继续找默认文件。

除了站点首页，这个"顺序查找"还有个实用玩法：多语言站点把默认文件按优先级排列，`index index.en.html index.fr.html index.html;`，语言版本文件缺失时自动落回兜底版本。

## 实例二：403 现场——默认文件全没了

把实例一里的文件全删掉，请求同一个目录，看看 Nginx 给什么：

![配图2](/images/csdn/figures/nginx-index-autoindex-csdn139232155-2.png)

第一行输出是绝大多数人第一次碰到 403 的方式：**目录存在、autoindex 关着（默认就是关的），Nginx 拒绝列出内容，返回 403 Forbidden，而不是 404**。404 是"资源不存在"，403 在这里的意思是"目录在，但我不告诉你里面有什么"——语义没错，只是不熟悉的人容易被它吓到。

第二段配置打开 autoindex 后，同一个目录返回的才是文件列表。这也是排查 403 的固定套路：先确认请求的是不是目录、目录里有没有 index 指定的默认文件，再决定是补文件还是开列表。

## 实例三：autoindex 的两个辅助参数

autoindex 一共三个指令，主开关 `autoindex on|off` 之外还有两个修饰项：

- `autoindex_localtime on|off`：列表里文件时间的时区。默认 off 显示 UTC 时间，on 显示服务器本地时间；
- `autoindex_exact_size on|off`：文件大小的显示格式。默认 on 显示精确字节数，off 按 K/M/G 圆整。

把完整配置写出来，放一个大文件进去看效果：

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

实测一个混合大小的目录，关注大小列的显示规律：

![配图3](/images/csdn/figures/nginx-index-autoindex-csdn139232155-3.png)

规律值得单独说：**off 并不是一律圆整**。实测里 1500 字节的文件仍显示 `1500`，而 2.5MB 的显示 `2M`、488KB 的显示 `488K`——Nginx 的规则是不足 10KB 的文件保持精确字节数，超过后才按 K、M、G 四舍五入（这一条与官方文档"rounded to kilobytes"的表述有出入，是实测配合源码确认的行为）。下载站想让人一眼看出量级，off 合适；做校验和比对，on 更保险。

## 两种典型错误写法

**错误一：请求的文件 404，却去开 autoindex**

```nginx
# 错：autoindex 只对目录请求生效，救不了不存在的文件路径
location / {
  autoindex on;   # 开了它，访问 /missing.html 照样 404
}

# 对：文件路径不存在该用 fallback，而不是目录列表
location / {
  try_files $uri $uri/ /index.html;
}
```

错在哪：autoindex 介入的条件是"请求以 `/` 结尾、落在一个真实存在的目录上"。访问不存在的文件路径，请求根本没走到目录这一层，开 autoindex 毫无作用，还顺手把目录暴露了。

**错误二：敏感目录裸开 autoindex**

```nginx
# 错：备份目录整个公开，任何访客都能浏览并下载
location /backup {
  autoindex on;
}

# 对：确要列出，先套认证或访问控制
location /backup {
  autoindex on;
  auth_basic "restricted";
  auth_basic_user_file /etc/nginx/.htpasswd;
}
```

错在哪：autoindex 一开，目录下所有文件（含你没意识到会被扫到的）都进了公开列表，等于把文件名清单交给扫描器。真有列出需求，前面至少加一道 auth_basic 或 allow/deny。

## 注意事项

- **安全先于便利**：autoindex 是把双刃剑，生产环境不要对敏感目录启用；确要启用时用 auth_basic 或 allow/deny 收紧，并确认目录里没有含密钥、备份、日志这类文件。
- **大目录有开销**：autoindex 每次请求都实时扫描目录生成 HTML，文件数以万计的目录每次列表都有可感知的延迟，这类目录建议改用预生成索引或干脆不对外提供列表。
- **403 与 404 分清**：目录请求得到 403，先查 index 默认文件是否存在、autoindex 是否开启；得到 404 是路径本身不存在或 `try_files` 的兜底分支命中。两者排查方向不同。
- **列表页样式朴素**：autoindex 生成的 HTML 极简，没有排序和搜索。对外提供下载时，fancyindex 这类第三方模块或前端静态索引页是常见升级路径。

## 小结

回到开场的两个问题：访问目录先返回哪个文件，由 index 指令按顺序决定，实测确认了"排前的优先"；没有默认文件时给什么，由 autoindex 决定——关着就是 403，开着就是文件列表，圆整显示还分大小文件有细微规则。下次首页报 403，先别急着重启，看看是不是 index 文件缺席、autoindex 没开。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
