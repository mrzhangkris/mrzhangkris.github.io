---
title: "Nginx proxy_cache 实战：HIT、MISS、BYPASS 各是什么意思"
date: 2024-05-13 16:03:41
categories: [技术]
tags: [Nginx]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1617839625591-e5a789593135?w=1600&q=80&fm=jpg
updated: 2026-09-11
---

接口慢，第一反应是扩后端，但很多响应其实压根不变——列表页、配置项、公开详情，十次请求九次内容一样。Nginx 的 proxy_cache 模块把这些上游响应缓存到本地磁盘，命中后直接返回，后端少扛一次是一次。

**结论先行：proxy_cache 用三条指令搭起来——`proxy_cache_path` 划一块磁盘（只能放 http 层），`proxy_cache` 在 location 里启用，`proxy_cache_valid` 定缓存多久；真正决定行为的是缓存键怎么写、哪些请求要绕开。** 本文用一个双容器实验把 MISS、HIT、BYPASS 三种状态各跑一遍，再给两组错误写法的实测翻车现场。所有输出均为实跑结果，未跑过的结论会明确标注。

## 实验环境

可复现是前提，先交代条件：

- nginx/1.31.5（docker 镜像 `nginx:alpine`），两个容器跑在同一个自定义网络里：`cache-backend` 当上游，`cache-proxy` 当缓存代理；
- proxy 容器把配置挂载到 `/etc/nginx/conf.d/default.conf`，每轮改完 `nginx -s reload`，容器内用 `curl` 验证；
- backend 的首页内容为 `BACKEND-V1`，用来区分"回源拿到的新内容"和"缓存里的旧内容"。

## 核心机制：三步搭起缓存

三步记住就够：

```nginx
proxy_cache_path /data/nginx/cache levels=1:2 keys_zone=my_cache:10m max_size=10g inactive=7d use_temp_path=off;

location / {
    proxy_cache my_cache;        # 启用，指向上面定义的内存区
    proxy_cache_valid 200 302 10m;
}
```

`proxy_cache_path` 里的关键参数：`keys_zone` 定义缓存键的共享内存区（必填，`my_cache:10m` 即区名加 10MB）；`max_size` 控制磁盘占用上限；`inactive` 定义多久没被访问就清除。`proxy_cache_valid` 按状态码定 TTL——错误页给短时间，避免后端一抖，404 被放大缓存十分钟。

## 实例一：最小可用配置，看懂 MISS 和 HIT

先把完整配置跑起来：

```nginx
proxy_cache_path /data/nginx/cache levels=1:2 keys_zone=my_cache:10m max_size=10g inactive=7d use_temp_path=off;

server {
    listen 80;

    location / {
        proxy_pass http://cache-backend;
        proxy_cache my_cache;
        proxy_cache_key "$request_method$request_uri$http_cookie";
        proxy_cache_valid 200 302 10m;
        proxy_cache_valid 404 1m;
        proxy_cache_bypass $cookie_no_cache $arg_no_cache $http_pragma $http_authorization;
        proxy_no_cache $cookie_no_cache $arg_no_cache $http_pragma $http_authorization;
        add_header X-Proxy-Cache $upstream_cache_status;
    }
}
```

同一个请求连发两次，`$upstream_cache_status` 把命中状态直接写进响应头：

![配图1](/images/csdn/figures/nginx-proxy-cache-csdn138807133-1.png)

第一次 MISS：缓存里没有这个键，Nginx 回源并把响应写入磁盘。第二次 HIT：不再碰后端，直接从本地缓存返回。排查缓存问题时先看这个头，命中与否一目了然。

## 实例二：bypass 和 no_cache 是成对的，缺一半语义就断

"带 `Pragma: no-cache` 头的请求不要缓存"，靠 `proxy_cache_bypass` 和 `proxy_no_cache` 这对指令：前者管"不读"，后者管"不写"。两个变量列表保持一致，语义才是完整的"绕过这次请求"：

```nginx
proxy_cache_bypass $cookie_no_cache $arg_no_cache $http_pragma $http_authorization;
proxy_no_cache    $cookie_no_cache $arg_no_cache $http_pragma $http_authorization;
```

实测验证"不写"这一半确实生效——BYPASS 的响应不能进缓存，所以紧随其后的普通请求必须是 MISS：

![配图2](/images/csdn/figures/nginx-proxy-cache-csdn138807133-2.png)

三连读法：带 `Pragma` 头的请求拿到 BYPASS（读缓存被跳过）；接着的普通请求拿到 MISS——如果 BYPASS 的响应落了盘，这里应该是 HIT，MISS 恰恰证明它没落盘；再下一次才是 HIT。只写 `bypass` 不写 `no_cache`，响应照样进缓存，下一个用户就会读到这份"本不该缓存"的内容。

## 实例三：个人页面永远回源

动态内容和个人数据不该进缓存。给 `/profile/` 单独一个 location，`proxy_cache_bypass 1` 的条件恒为真，等于永远回源：

```nginx
location /profile/ {
    proxy_pass http://cache-backend;
    proxy_cache my_cache;
    proxy_cache_bypass 1;
    add_header X-Proxy-Cache $upstream_cache_status;
}
```

> 注：原文此段未写 `proxy_cache my_cache;`，缺了它 `proxy_cache_bypass` 没有作用对象（该指令依附于已启用的缓存区），重构时按指令语义补上。

实测，恒真条件和参数绕过各来一发：

![配图3](/images/csdn/figures/nginx-proxy-cache-csdn138807133-3.png)

`/profile/` 返回 200 加 BYPASS——每次都回源；`?no_cache=1` 命中 `$arg_no_cache`，同样绕过。站点其他路径照常走实例一的缓存逻辑，这就是"全局缓存、局部豁免"的标准写法。

## 错误写法对比：两处真实翻车

**错误一：`proxy_cache_path` 写进 server 块。** 这条指令只能放 http 层，放错层级 Nginx 直接拒绝启动：

![配图4](/images/csdn/figures/nginx-proxy-cache-csdn138807133-4.png)

报错精确到行号：`"proxy_cache_path" directive is not allowed here`。同层的坑还有目录本身：`proxy_cache_path` 声明的路径不会自动创建，目录不存在时 nginx 启动报 `mkdir() "/data/nginx/cache" failed`——部署脚本里先 `mkdir -p` 再启动。

**错误二：缓存键里没有用户要素。** 把键简化成 `$request_method$request_uri`，两个"用户"先后请求同一地址：

![配图5](/images/csdn/figures/nginx-proxy-cache-csdn138807133-5.png)

alice 首次请求 MISS 属于正常，但 bob 的首次请求直接 HIT——他读到的是 alice 的缓存条目。键里少了区分用户的东西，所有人的请求都映射到同一个缓存键。登录态接口尤其致命，这也是开篇配置里 `$http_cookie` 必须留在键里的原因。

## 注意事项

- **`proxy_cache_path` 放 http 层，目录预先建好**。放错层级拒绝启动（已实测），目录不存在也起不来（`mkdir() failed`，已实测）；目录要对 Nginx worker 可写。
- **缓存键必须含区分用户的要素**。Cookie、Token 之类放进 `proxy_cache_key`，否则用户间串缓存（已实测）；反过来，纯公开内容别乱加 Cookie，键越散命中率越低。
- **bypass 与 no_cache 成对出现、列表一致**。只 bypass 不 no_cache，敏感响应照样落盘；只 no_cache 不 bypass，请求还是会命中旧缓存。
- **后端缓存头优先于 `proxy_cache_valid`**。上游响应带 `Cache-Control`、`Expires` 或 `X-Accel-Expires` 时，Nginx 以它为准，`proxy_cache_valid` 只在响应没有任何缓存头时生效（此条来自官方文档，本文实验的 backend 未发缓存头，未单独实跑）。
- **404 给短 TTL**。`proxy_cache_valid 404 1m;` 让错误页一分钟内不再反复打到后端，又不至于把故障钉死在缓存里。
- **调试期挂上 `add_header X-Proxy-Cache $upstream_cache_status;`**，HIT/MISS/BYPASS 一眼可辨，比翻日志快得多。

## 小结

回到开头的场景：响应内容不变的那九成请求，`proxy_cache_path` + `proxy_cache` + `proxy_cache_valid` 三条指令就能挡在 Nginx 这一层。三种状态对应三条路：MISS 回源并落盘，HIT 直接吃缓存，BYPASS 绕道走——把"谁绕道"用 bypass/no_cache 写清楚，把"谁和谁共用一份缓存"用缓存键写清楚，这两处写对了，proxy_cache 就不会出事故。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
