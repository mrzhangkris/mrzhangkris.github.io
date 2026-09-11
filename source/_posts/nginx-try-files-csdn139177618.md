---
title: "Nginx try_files：一条指令管住静态文件的查找与回退"
date: 2024-05-26 09:00:00
updated: 2026-09-11
categories: [技术]
tags: [Nginx]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1575318634028-6a0cfcb60c59?w=1600&q=80&fm=jpg
---

把一个用 Vue 或 React 写的前端项目部署到 Nginx，访问首页一切正常，点进 `/orders/42` 也正常——然后用户在这个页面按了 F5，一个 404 砸在脸上。原因很简单：`/orders/42` 这个路径在磁盘上根本不存在，它是前端路由虚拟出来的，Nginx 找不到文件，就只能报 404。

`try_files` 就是用来解决这类问题的指令：按你给的顺序逐个检查候选路径，命中一个就返回，全部落空时走你指定的兜底方案。本文基于 nginx/1.31.5（docker 镜像 `nginx:alpine`）实跑验证，所有输出都是真实执行结果。

![配图](/images/csdn/figures/nginx-try-files-csdn139177618.png)

## 工作机制：按序检查，最后一个参数兜底

`try_files` 接受两个或更多参数：

```nginx
try_files 参数1 参数2 ... 最后一个参数;
```

前几个参数按顺序做**存在性检查**，命中即停：

- 写成 `$uri` —— 检查磁盘上有没有对应文件；
- 写成 `$uri/` —— 检查有没有对应目录；
- 写成命名 location（如 `@backend`）—— 跳转过去。

**只有最后一个参数不一样**：它不做检查，是全部落空后的兜底动作。可以是一个内部重定向的 URI（如 `/index.html`），也可以直接给状态码（如 `=404`）。

理解"内部重定向"很关键：兜底到 URI 时，请求会**从头再走一遍 location 匹配**，等于 Nginx 内部替用户重新发起了一次请求。这个特性既成就了 SPA 回退，也藏着死循环的坑，后面注意事项里细说。

## 实例一：静态站 + SPA 回退

准备一个最小站点：

```
/usr/share/nginx/html/
├── index.html      → <h1>INDEX</h1>
├── about.html      → <h1>ABOUT</h1>
└── report/
    └── 2024.html   → <h1>REPORT 2024</h1>
```

配置：

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

三种请求的真实结果：

**文件存在，第一个参数命中：**

```bash
$ curl -s localhost/about.html
<h1>ABOUT</h1>
```

**子目录下的文件，同样第一个参数命中：**

```bash
$ curl -s localhost/report/2024.html
<h1>REPORT 2024</h1>
```

**文件不存在，前两个参数落空，兜底到 /index.html：**

```bash
$ curl -s localhost/nope.html
<h1>INDEX</h1>

$ curl -s -o /dev/null -w '%{http_code}\n' localhost/nope.html
200
```

注意最后一组：请求的是 `/nope.html`，返回的却是首页内容，状态码 200。这就是 SPA 部署的标配行为——前端拿到入口页后由 JS 读取 URL 渲染对应路由，用户完全无感。

但这个配置有个不显眼的坑。请求 `/report/`（目录存在，里面没有 index.html）时：

```bash
$ curl -s -o /dev/null -w '%{http_code}\n' localhost/report/
403
```

返回 403 而不是回退。原因：`$uri/` 检查的是"目录是否存在"，`report/` 存在即命中；接着 `index` 指令去找目录下的 `index.html`，找不到，Nginx 默认不开 autoindex，于是 403 Forbidden。**命中目录不等于能给出内容**——不想要这个行为，就把 `$uri/` 从参数里去掉。

## 实例二：`=404` 兜底，让该 404 的老实 404

不是所有站点都需要 SPA 回退。纯静态内容站上，兜底到首页会让死链悄悄返回 200，搜索引擎会把重复的首页内容收一堆。该 404 的就让它 404：

```nginx
location / {
    try_files $uri $uri/ =404;
}
```

同一个站点，换个兜底再测：

```bash
$ curl -s -o /dev/null -w '%{http_code}\n' localhost/nope.html
404

$ curl -s localhost/report/2024.html
<h1>REPORT 2024</h1>
```

存在的文件照常返回，不存在的老实给 404。配合 `error_page 404 /404.html;` 还能自定义错误页——404 先发生，`error_page` 再把响应内容替换掉，两件事不冲突。

`=404` 和 URI 兜底的语义差别值得记住：`=404` 直接终结请求，省掉一次内部重定向；URI 兜底则要重走 location 匹配。前者更省，后者更灵活，按需选。

## 实例三：转发给后端时，查询参数别弄丢

伪静态或前后端混合部署时，常见写法是把找不到的请求转给 PHP 或后端网关：

```nginx
location / {
    try_files $uri $uri/ /index.php?$query_string;
}

location = /index.php {
    return 200 "qs=$args uri=$uri\n";
}
```

兜底 URI 末尾的 `?$query_string` 不是装饰。做个对照实验，请求带上查询参数：

```bash
$ curl -s 'localhost/missing?id=42&type=report'
qs=id=42&type=report uri=/fallback.php
```

`$query_string` 完整地把 `id=42&type=report` 带到了兜底目标。如果写成 `try_files $uri $uri/ /index.php;`，参数就丢在半路——后端拿不到 `id=42`，业务直接瞎掉。这是我见过最多的 try_files 事故，没有之一。

另外一个细节藏在输出里：兜底后 `uri=/fallback.php`。内部重定向发生时，`$uri` 已经变成了兜底目标本身，不再是用户请求的原始路径。想拿原始路径，用 `$request_uri`。

## 一组对比：两种错误写法

**错误一：兜底 URI 忘带 query_string**

```nginx
# 错：业务参数丢失
try_files $uri $uri/ /index.php;

# 对：
try_files $uri $uri/ /index.php?$query_string;
```

**错误二：把兜底语义用在中间参数上**

```nginx
# 错：/fallback.php 会被当作磁盘文件去检查，检查失败不报错，直接看下一个参数
try_files $uri /fallback.php =404;

# 对：URI 兜底只能放最后
try_files $uri =404;
```

中间参数的位置上，URI 不会触发重定向，只会做一次注定失败的文件检查。规则就一条：**检查参数在前，兜底动作在后，兜底只写一个**。

## 注意事项

- **顺序就是优先级**。`try_files` 按书写顺序检查，第一个命中即停。把宽泛的 `$uri/` 放在具体的文件规则前面，后面的参数永远轮不到。
- **`$uri/` 是双刃剑**。命中目录但目录里没有 `index` 指定的文件时，结果是 403（autoindex 关闭时）。纯 API 站点通常不需要 `$uri/`。
- **性能账**：每个参数都是一次磁盘 stat。候选堆到七八个的写法，等于让每个请求多跑七八次系统调用。三五个参数以内是常态，再多了先想想目录结构是不是该调。
- **内部重定向有 10 次上限**。兜底目标如果又落回同一个 location 继续兜底（比如 `try_files $uri /index.html;` 而 location 匹配了 `/index.html` 自身），循环到第 10 次直接 500。写完配置，拿一个必然不存在的路径 curl 一下，是基本的自测动作。
- **`alias` 搭配要格外小心**。`alias` 的路径替换规则和 `root` 不同，`try_files` 的参数拼接在 alias 场景下容易拼出意料之外的路径，这是 Nginx 配置审计里的高频问题。用 alias 时，务必逐条 curl 验证每个参数实际检查的物理路径。

## 小结

`try_files` 的心智模型一句话：**前 N-1 个参数是"依次找"，第 N 个参数是"都找不到时怎么办"**。SPA 回退、伪静态转发、严格 404，三种姿势对应三种兜底写法；选哪种取决于你的站点能不能接受"不存在的路径返回 200"。配置写完，用一个必然 404 的路径和一条带参数的路径各 curl 一遍，两种事故都能在上线前拦住。
