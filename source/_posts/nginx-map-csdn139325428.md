---
title: "Nginx map 模块实战：用变量映射替代 if 分支"
date: 2024-05-30 15:19:33
categories: [技术]
tags: [Nginx]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1640955785023-1854685dae05?w=1600&q=80&fm=jpg
updated: 2026-09-11
---

写 Nginx 配置时经常遇到这种事：同一个变量在不同取值下要做不同处理，如果用一堆 if 去分支，配置会迅速变得难读——而且 Nginx 的 if 在 location 里声名狼藉（IfIsEvil），行为处处是坑。map 模块就是为这种场景准备的：根据一个变量的值映射出另一个变量的值，映射表集中写在 map 块里，逻辑一目了然。

这篇用 nginx/1.31.5 容器实测四组典型用法：静态查表、正则映射、灰度分流、hostnames 通配，全部配置都跑过验证。

## 实验环境

- nginx/1.31.5（nginx:alpine 容器，容器内 curl 自测）
- 验证方法：map 的结果变量直接用 `return 200` 回显（重定向场景用回显代替真实 301，避免循环跳转干扰观察）

## 核心机制一句话

map 定义在 http 层，把"源变量 → 结果变量"的映射做成一张表；结果是**惰性求值**的——不是每次请求都遍历全表，而是请求真正用到结果变量时才计算一次，内部用哈希组织，性能开销很小。

## 实例一：静态映射——按 URL 查表重定向

原文场景：根据 $uri 计算重定向目标。

```nginx
http {
  map $uri $redirect_url {
    /old-page   /new-page;
    /about      /about-us;
    default     /not-found;
  }

  server {
    listen 80;
    server_name example.com;

    location / {
      return 301 $redirect_url;
    }
  }
}
```

请求 URL 是 /old-page 时重定向到 /new-page；是 /about 时重定向到 /about-us；其他任何 URL 落到 default 分支的 /not-found。实测把 return 301 换成回显，看映射结果：

![配图1](/images/csdn/figures/nginx-map-csdn139325428-1.png)

整个重定向表就是 map 块里那三行，改表比改一堆 if 舒服得多——这是 map 对 if 的核心优势：数据和逻辑分离，加一条规则就是加一行。

## 实例二：正则映射——按 User-Agent 判设备类型

map 的源值以 `~` 开头表示正则（区分大小写），`~*` 不区分大小写：

```nginx
map $http_user_agent $is_mobile {
    ~*(android|iphone|mobile)  1;
    default                    0;
}
```

实测两种 UA 的请求：

![配图2](/images/csdn/figures/nginx-map-csdn139325428-2.png)

移动端 UA 得到 1、桌面端得到 0，后续配置直接 `if ($is_mobile)` 或拿 $is_mobile 做 access_log 的标记字段——把"判断"收敛到 map 里，location 里只剩"使用"。

## 实例三：灰度分流——按 cookie 选后端

灰度发布的经典做法：带特定 cookie 的用户路由到新版本。`$cookie_XXX` 变量可以直接取任意 cookie 的值做映射源：

```nginx
map $cookie_version $backend {
    v2       http://127.0.0.1:8081;
    default  http://127.0.0.1:8080;
}

server {
    location / {
        proxy_pass $backend;
    }
}
```

实测带 `version=v2` cookie 和不带 cookie 的两种请求：

![配图3](/images/csdn/figures/nginx-map-csdn139325428-3.png)

测试同学把 cookie 设成 v2 就进新版本，普通用户走 default 进旧版本——灰度名单从"改配置文件 reload"变成"发 cookie"，运营侧就能控制。

## 实例四：hostnames 通配——按域名查表

map 块里加 `hostnames` 参数后，源值按主机名规则匹配，支持 `*` 通配前缀和 `.` 结尾通配后缀：

```nginx
map $http_x_flag $out {
    hostnames;
    a.example.com   "hit-a";
    *.example.com   "hit-wildcard";
    default         "miss";
}
```

实测三个不同的值（经 X-Flag 请求头传入）：

![配图4](/images/csdn/figures/nginx-map-csdn139325428-4.png)

多租户按域名分流、白名单域名判断都用得上。注意 hostnames 模式下**精确匹配优先于通配**，且通配只能出现在开头（`*.example.com`）或结尾（`www.example.*`），不能写 `*example*` 这种双侧通配。

## 写法要点

- map 块只能定义在 **http 层**，不能放进 server/location；
- 每行格式是 `源值 映射值;`，映射值可以含变量（如 `"/go/$1"` 配合正则捕获组）；
- `default` 行定义兜底值——**不写 default 时兜底是空字符串**，后续指令拿到空值的行为往往出乎意料，建议永远显式写 default；
- 源值以 `~`/`~*` 开头是正则，否则按字符串精确匹配（hostnames 模式下支持通配）；
- 可以定义多个 map 块，结果变量名全局唯一；
- 结果变量惰性求值：请求用到它才算，不用就算都不算。

## 错误写法：在 location 里用 if 实现同样的逻辑

map 能替代的典型 if 写法：

```nginx
location / {
    if ($http_user_agent ~* "android|iphone") {
        set $mobile 1;
    }
    # ... 再用 $mobile 分支
}
```

问题有两个：一是 if 在 location 内是 rewrite 模块的指令，与 set/rewrite 之外的指令（proxy_pass、try_files）组合时行为诡异——官方 wiki 专页 "If is Evil" 列举的事故清单很长；二是同样的判断逻辑散落在每个 location 里，改一处要全文搜。map 把映射收敛到 http 层一张表，location 里只读变量，两个问题都消失。**原则：能用 map 表达的"值到值"逻辑，不用 if。**

## 注意事项

- map 在 http 层定义、全局生效，结果变量名不要和内置变量或别的模块变量撞名（撞了 nginx -t 直接报错，算是好的失败方式）。
- 原文提到"map 在每次请求时都会进行匹配，规则多了可能影响性能"——更准确的说法是：结果变量被用到时才计算，字符串键走哈希是 O(1)，正则键按顺序逐个试；表大且正则多时才有性能顾虑，纯字符串映射几千条也无压力。
- 映射规则上线前仔细测试，尤其是 default 分支——漏写 default 时兜底为空串，`return 301 $redirect_url` 会变成重定向到空地址。
- 映射规则变化频繁（每天改）时，考虑把表放进 include 的独立文件，改完 `nginx -s reload` 平滑生效；再高频就该上 Lua（OpenResty）或外部配置中心，不要把 map 当动态配置用。
- 验证 map 行为最快的方法就是本文的回显法：`return 200 "$变量"`，curl 一看便知，不用猜。

map 模块的本质是"把分支逻辑做成数据表"：静态查表、正则、通配、cookie 取值四种实测覆盖了绝大多数场景。记住三条铁律——定义在 http 层、显式写 default、能 map 不 if，配置就能既短又稳。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。