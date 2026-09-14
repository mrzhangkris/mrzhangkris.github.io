---
title: "Nginx realip 实战：把被代理藏起来的真实客户端 IP 还原出来"
date: 2024-05-20 14:01:42
updated: 2026-09-14
categories: [技术]
tags: [Nginx]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1517077304055-6e89abbf09b0?w=1600&q=80&fm=jpg
---

Nginx 做反向代理时，后端看到的 `$remote_addr` 往往是代理服务器自己的 IP，真实客户端被藏在了 `X-Forwarded-For` 这类请求头里。日志、限流、风控如果直接用 `$remote_addr`，结果都会失真：封禁封到代理头上，限流把所有用户算成一个。

`ngx_http_realip_module` 就是解决这个问题的：让 Nginx 从可信代理传来的请求头里还原出真实客户端 IP。**核心就三条指令——`set_real_ip_from` 圈定可信代理名单，`real_ip_header` 指定从哪个头取值，`real_ip_recursive` 决定多层代理时要不要回溯。** 本文在 nginx:alpine 容器里把三种典型场景各跑一遍，每种结果都给出实拍输出。

## 实验环境

- nginx:alpine 官方镜像，`nginx -v` 确认版本为 nginx/1.31.5；
- 请求在容器内自发自收：发起请求的源地址是 127.0.0.1，把它当作转发请求的那一层代理；
- 客户端 IP 用回环之外的地址（203.0.113.7 属于文档保留测试段），通过 `X-Forwarded-For` 头传入。

Realip 属于标准模块，发行版预编译包一般都带着它。动手前先确认：

```bash
nginx -V 2>&1 | grep -o with-http_realip_module
```

![配图1](/images/csdn/figures/nginx-realip-ip-csdn139063602-1.png)

有输出说明已启用；没有的话，需要重新编译 Nginx 并加上 `--with-http_realip_module` 参数。

## 核心机制：一条信任链

realip 的工作方式可以压缩成一句话：**只有来自可信名单的请求，Nginx 才会用指定头部的值覆盖 `$remote_addr`。** 三条指令各管一段：

- **set_real_ip_from**：指定可信代理的 IP 或 CIDR 网段。只有来自这些地址的请求才触发还原，这是安全边界——不设它，任何人都能伪造请求头冒充别的 IP。
- **real_ip_header**：从哪个请求头取真实 IP，常见取值是 `X-Forwarded-For` 或 `X-Real-IP`。
- **real_ip_recursive**：多层代理时设为 `on`，Nginx 会沿代理链从后往前回溯，跳过名单里的可信地址，取第一个不在名单里的地址当作客户端 IP。

三条指令都能写在 `http`、`server`、`location` 三个层级（官方文档口径）。全局统一的信任名单放 `http` 层一次配好；只有个别站点走代理时，收进对应 `server` 块更稳。还有一个容易误会的事实：realip 只改写 `$remote_addr` 变量，**不动请求头本身**——实例一的输出里 `xff=` 一行原样保留，就是证据。头会继续原样传给下游服务，下游拿到后按自己的名单再做一次还原，两边互不干扰。

## 实例一：最小配置，先把 IP 还原出来

```nginx
server {
  listen 80;
  set_real_ip_from 127.0.0.1;      # 信任本实验里转发请求的那层代理
  real_ip_header      X-Forwarded-For;
  real_ip_recursive   off;

  location / {
    return 200 "remote_addr=$remote_addr\nxff=$http_x_forwarded_for\n";
  }
}
```

配置重载后，模拟一个经过两层代理、头部里带着完整代理链的请求：

```bash
curl -s -H "X-Forwarded-For: 203.0.113.7, 10.0.0.5" localhost
```

![配图2](/images/csdn/figures/nginx-realip-ip-csdn139063602-2.png)

`$remote_addr` 从 127.0.0.1 变成了 10.0.0.5——还原已经生效，访问日志里记录的也是它。注意 `off` 的语义：**取 `X-Forwarded-For` 的最后一个地址，到此为止**，不管这个地址可不可信。10.0.0.5 其实也是代理链里的一跳，只是它不在名单里，`off` 就直接采信了。

## 实例二：real_ip_recursive on，剥掉中间可信层

生产里更常见的情况是代理有多层：边缘代理拿到的是上一跳代理的 IP，真实客户端藏在链头。这时把中间层加进可信名单，并打开递归：

```nginx
set_real_ip_from 127.0.0.1;      # 直连的转发层
set_real_ip_from 10.0.0.5;       # 链条中的内层代理
real_ip_header      X-Forwarded-For;
real_ip_recursive   on;
```

同一个请求再发一次：

![配图3](/images/csdn/figures/nginx-realip-ip-csdn139063602-3.png)

结果从 10.0.0.5 变成了 203.0.113.7。`on` 的回溯逻辑：从头部末尾往前逐个检查，10.0.0.5 在名单里，跳过；203.0.113.7 不在名单里，采信。**递归模式下的答案才是"代理链之外的那个真实客户端"。**

## 实例三：名单之外，头写了也不认

信任边界的另一面同样重要——来源不在名单里时，头部写得再像也没用。只信任一个无关网段，再从 127.0.0.1 伪造头：

```nginx
set_real_ip_from 10.0.0.99;      # 名单里没有本实验的请求来源
real_ip_header      X-Forwarded-For;
real_ip_recursive   on;
```

![配图4](/images/csdn/figures/nginx-realip-ip-csdn139063602-4.png)

`$remote_addr` 纹丝不动，还是 TCP 连接对端的 127.0.0.1。这就是 `set_real_ip_from` 作为安全边界的含义：**realip 的可信来自名单，不来自头本身。**

## 错误写法对比：同一个请求，两种答案

最容易踩的坑是多层代理环境忘了开递归。把实例一和实例二并排放着看：

![配图5](/images/csdn/figures/nginx-realip-ip-csdn139063602-5.png)

同一份 `X-Forwarded-For: 203.0.113.7, 10.0.0.5`：`off` 给出 10.0.0.5，`on` 给出 203.0.113.7。错法错在哪：**`off` 时链上任何一层没进名单，它就会被当成客户端**。落在日志和限流上的后果是——封禁封到自家内层代理的 IP 上，一次封一个准，所有经过它的用户一起遭殃。

反向的坑也存在：单层代理环境把 `recursive on` 配合过宽的名单（比如整个 `0.0.0.0/0`）一起上，等于宣告"谁都可以指定自己的客户端 IP"，伪造通道直接敞开。名单只写真正部署代理的地址，永远。

## 几种常见组合

代理层形态不同，写法略有差别。

只有一个固定代理时，直接写单个 IP：

```nginx
set_real_ip_from 123.45.67.89;
real_ip_header X-Forwarded-For;
```

代理是 IPv6 地址时同样支持：

```nginx
set_real_ip_from 2001:0db8::/32;
real_ip_header X-Forwarded-For;
```

本机还有一层本地代理（比如 127.0.0.1 上跑的前置服务）时，它常用的头是 `X-Real-IP`：

```nginx
set_real_ip_from 127.0.0.1;
real_ip_header X-Real-IP;
```

没有请求头可用、上游走四层透传（比如 `proxy_protocol`）的场景，走的是另一条路：`listen 80 proxy_protocol;` 直接从协议层取地址，本文不展开。

日志这边补一句：`$remote_addr` 在 realip 生效后就是还原出的真实客户端 IP；再带一个 `$http_x_forwarded_for` 把原始头内容记下来，排查问题时可以对照——实例一的实拍里已经能看到这种写法的效果。

## 注意事项

- `set_real_ip_from` 只写真正部署代理的那几个网段，范围越大，伪造头冒充 IP 的空间越大。
- `real_ip_recursive on` 只在多层代理时必要，单层代理开不开效果一样；多层代理不开，还原出来的就是内层代理的 IP。
- `X-Forwarded-For` 本身可以被客户端伪造，realip 之所以可信，前提是可信代理会覆盖或追加这个头——信任链建立在 `set_real_ip_from` 上，不在头本身。
- 改完配置记得 `nginx -t` 验证再 reload，避免配置错误导致整个服务不可用。

## 小结

回到开头的问题：代理把真实客户端藏进了请求头，`$remote_addr` 失真。解法就是三条指令的信任链——名单圈定谁有权转发、头部指定从哪取值、递归决定剥几层。三个实例实拍下来，规律一致：**还原是否可信，取决于名单收得多紧。** 把名单管住，日志、限流、风控拿到的 IP 才是那个真正要负责的地址。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
