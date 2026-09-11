---
title: "Nginx try_files：一条指令管住静态文件的查找与回退"
date: 2024-05-26 09:00:00
updated: 2026-09-11
categories: [技术]
tags: [Nginx]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1575318634028-6a0cfcb60c59?w=1600&q=80&fm=jpg
---

把一个用 Vue 或 React 写的前端项目部署到 Nginx，访问首页一切正常，点进 `/orders/42` 也正常——然后用户在这个页面按了 F5，一个 404 砸在脸上。原因是：`/orders/42` 是前端路由虚拟出来的路径，磁盘上并不存在，Nginx 找不到文件只能报 404。

**结论先行：`try_files` 一条指令就能解决这类问题——前几个参数按序检查文件是否存在，最后一个参数决定"全部落空时怎么办"。** 本文按 how-to 组织：先交代实验环境，再给三组可直接复制的配置与真实输出（SPA 回退、严格 404、转发后端），最后用两个事故实验说清这条指令的边界。所有输出均为实跑结果，未跑过的结论会明确标注。

![配图](/images/csdn/figures/nginx-try-files-csdn139177618.png)

## 实验环境

可复现是前提，先交代条件：

- nginx/1.31.5（docker 镜像 `nginx:alpine`）；
- 站点目录挂载到 `/usr/share/nginx/html`，配置挂载到 `/etc/nginx/conf.d/`；
- 每轮改动配置后 `docker exec 容器名 nginx -s reload`，用 `curl` 验证。

最小站点结构：

```
/usr/share/nginx/html/
├── index.html      → <h1>INDEX</h1>
├── about.html      → <h1>ABOUT</h1>
└── report/
    └── 2024.html   → <h1>REPORT 2024</h1>
```

## 指令语义：检查参数在前，兜底参数在后

`try_files` 的全部语义浓缩成一句话：**前面的参数负责"依次找"，最后一个参数负责"都找不到时怎么办"**。

```nginx
try_files 参数1 参数2 ... 最后一个参数;
```

前面的参数做**存在性检查**，命中即停：`$uri` 查文件、`$uri/` 查目录、命名 location（`@backend`）跳转过去。**最后一个参数是兜底**，不做检查，全部落空时才执行——可以是一个 URI（触发内部重定向），也可以直接给状态码（`=404`）。

内部重定向是理解一切坑的钥匙：兜底到 URI 时，请求会从头再走一遍 location 匹配，等于 Nginx 替用户重新发起了一次请求。

## 实例一：SPA 回退，并小心 403 坑

一行配置解决 F5 404——这是 `try_files` 最常用的姿势：

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

**文件存在，`$uri` 命中：**

```bash
$ curl -s localhost/about.html
<h1>ABOUT</h1>
```

**文件不存在，落空后兜底到 `/index.html`：**

```bash
$ curl -s localhost/nope.html
<h1>INDEX</h1>

$ curl -s -o /dev/null -w '%{http_code}\n' localhost/nope.html
200
```

用户请求 `/nope.html`，拿到的却是首页内容和 200——前端拿到入口页后由 JS 读取 URL 渲染路由，用户无感。这就是 F5 404 问题的解法。

**但这套配置里藏着一个 403 坑。** 请求 `/report/`（目录存在，里面没有 index.html）：

```bash
$ curl -s -o /dev/null -w '%{http_code}\n' localhost/report/
403
```

原因：`$uri/` 检查的是"目录是否存在"，`report/` 存在即命中；随后 `index` 指令找目录下的 `index.html`，找不到，autoindex 默认关闭，于是 403。**命中目录不等于能给出内容**——不想要这个行为，把 `$uri/` 从参数里去掉即可。

## 实例二：`=404` 兜底，配合 error_page 做自定义错误页

纯静态内容站不该让死链返回 200（搜索引擎会收录一堆重复首页）。让该 404 的老实 404，并顺手自定义错误页：

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    error_page 404 /404.html;
    location / {
        try_files $uri $uri/ =404;
    }
}
```

实测结果：

```bash
$ curl -s -w '\nHTTP %{http_code}\n' localhost/nope.html
<h1>CUSTOM 404</h1>

HTTP 404
```

状态码保持 404，响应体被 `error_page` 替换成自定义页——两件事各干各的，互不冲突。`=404` 与 URI 兜底的语义差别：`=404` 直接终结请求，省一次内部重定向；URI 兜底要重走 location 匹配。前者更省，后者更灵活。

## 实例三：转发后端时，查询参数别弄丢

伪静态场景把找不到的请求转给 PHP 或网关，兜底 URI 末尾的 `?$query_string` 不是装饰：

```nginx
location / {
    try_files $uri $uri/ /index.php?$query_string;
}

location = /index.php {
    return 200 "qs=$args uri=$uri\n";
}
```

带参数请求的实测结果：

```bash
$ curl -s 'localhost/missing?id=42&type=report'
qs=id=42&type=report uri=/fallback.php
```

`$query_string` 把 `id=42&type=report` 完整带到兜底目标。漏写它，后端拿不到业务参数，这是 try_files 最高频的事故。输出里还有个细节：兜底后 `uri=/fallback.php`——**内部重定向发生时，`$uri` 已变成兜底目标本身**；要拿用户原始路径，用 `$request_uri`。

## 事故实验：兜底目标选了自己，500 伺候

把兜底 URI 指向一个不存在的文件，且它仍会命中同一个 location：

```nginx
location / {
    try_files $uri /loop.html;   # loop.html 不存在
}
```

请求任意不存在的路径，实测直接 500：

```bash
$ curl -s -o /dev/null -w '%{http_code}\n' localhost/nope.html
500
```

错误日志给出了精确原因：

```
rewrite or internal redirection cycle while internally redirecting to "/loop.html"
```

链路是：`/nope.html` 不存在 → 兜底到 `/loop.html` → 内部重定向重新匹配 location → `/loop.html` 还是不存在 → 再兜底到自己 → 循环到 10 次上限，Nginx 强制 500。**兜底目标必须最终能被命中**，写完配置拿一个必然不存在的路径 curl 一遍，是基本自测动作。

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
# 错：/fallback.php 被当作磁盘文件检查，失败不报错，直接看下一个参数
try_files $uri /fallback.php =404;

# 对：URI 兜底只能放最后
try_files $uri =404;
```

规则一条：检查参数在前，兜底动作在后，兜底只写一个。

## 注意事项

- **顺序就是优先级**。按书写顺序检查，第一个命中即停；宽泛的 `$uri/` 放前面，后面的参数永远轮不到。
- **`$uri/` 是双刃剑**。命中目录但目录里没有 index 文件时返回 403（autoindex 关闭时）。纯 API 站点通常不需要它。
- **性能账**。每个参数一次磁盘 stat，候选堆到七八个等于每个请求多七八次系统调用。三五个以内是常态，再多先调目录结构。
- **内部重定向有 10 次上限**（上节已实测，500 + cycle 日志）。
- **`alias` 搭配容易拼错路径**。alias 的路径替换规则与 root 不同，try_files 参数在 alias 下可能拼出意料之外的物理路径——此条来自官方文档与社区共识，本文未实跑，用 alias 时请逐条 curl 验证每个参数实际检查的路径。

## 小结

回到开头的 F5 场景：`try_files $uri $uri/ /index.html;` 一行解决 SPA 刷新 404。这条指令的心智模型一句话——**前 N-1 个参数是"依次找"，第 N 个参数是"都找不到时怎么办"**。三个事故坑（目录 403、丢 query_string、兜底选自己死循环）都来自兜底参数的语义误解，配置写完用一个必然不存在的路径和一条带参数的路径各 curl 一遍，就能在上线前全部拦住。
