---
title: "Nginx auth_request 模块：把认证交给外部服务"
date: 2024-05-25 09:00:00
updated: 2026-09-14
categories: [技术, Nginx]
tags: [Nginx]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1462826303086-329426d1aef5?w=1600&q=80&fm=jpg
---

给某个路径加访问控制，又不想把认证逻辑复制进每个后端服务，Nginx 的 auth_request 模块就是为这个场景准备的：Nginx 先把请求转给一个认证端点，拿到状态码再决定放行还是拒绝。这篇在 nginx:1.28 容器里把整条链路实跑一遍——放行、两种拒绝、端点保护，外加两个让 auth_request 悄悄失效的配置坑。

## 实验环境

- Docker 容器 `nginx:1.28-alpine`（nginx/1.28.3，2026-09 实测，下文全部输出来自这次实验）。
- auth_request 是可选模块：自编译 Nginx 需加 `--with-http_auth_request_module`；官方 Docker 镜像已内置，`nginx -V` 可确认。
- 结构：同一个 Nginx 里跑两个 server——8080 端口扮演"外部认证服务"（按请求头判断），80 端口是受保护的主站。生产环境里把 8080 换成真实认证服务即可。

## 核心机制一句话

`auth_request /_auth;` 让 Nginx 在 access 阶段向 `/_auth` 发一个**内部子请求**，按子请求的状态码做裁决：2xx 放行，401/403 拒绝，其他状态码一律按子请求错误处理、客户端只会看到 500。认证逻辑全部在认证端点里，Nginx 只认状态码。

## 实例一：放行与拒绝，三种状态码

完整配置，认证端点按 Authorization 头判断，并演示按原始 URI 做路径级控制：

```nginx
server {                          # 认证服务（生产换成真实认证系统）
  listen 8080;
  location /auth {
    if ($http_authorization != "Basic dXNlcm5hbWU6cGFzc3dvcmQ=") { return 401; }
    if ($http_x_original_uri ~ /admin) { return 403; }
    return 200;
  }
}

server {                          # 受保护的主站
  listen 80;
  root /usr/share/nginx/html;

  location /protected/ {
    auth_request /_auth;
    error_page 401 = @error401;
    error_page 403 = @error403;
  }

  location = /_auth {
    internal;
    proxy_pass http://127.0.0.1:8080/auth;
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
    proxy_set_header X-Original-URI $request_uri;
  }

  location @error401 { return 401 "Unauthorized\n"; }
  location @error403 { return 403 "Forbidden\n"; }
}
```

三个请求对号入座：带正确凭证访问 `/protected/data.txt`、不带凭证访问同一路径、带正确凭证但访问 `/protected/admin/panel.txt`：

![配图1](/images/csdn/figures/nginx-auth-request-csdn139173856-1.png)

三行结果对应三条规则：凭证正确放行，拿到 `SECRET DATA`；无凭证被 401 拦下；`/admin` 路径即使凭证正确也被 403 拒绝——认证服务读到了 `X-Original-URI`，做了路径级判断。

## 实例二：X-Original-URI，路径级授权的关键

实例一里 403 的前提，是这条配置把用户访问的原始路径传给了认证服务：

```nginx
proxy_set_header X-Original-URI $request_uri;
```

没有这一条，认证服务只知道"这个人是谁"，不知道"他要去哪"，只能做全局认证做不了路径级授权。需要更多上下文时按同样方式追加，比如 `X-Original-Method $request_method`。认证端点据此实现"这个用户能否访问这个路径"的判断，这正是 API 网关和单点登录集成的基本形态。

## 实例三：internal，别把认证端点暴露出去

`/_auth` 只该被内部子请求访问。配置里加了 `internal;`，实测外部直接访问它：

![配图2](/images/csdn/figures/nginx-auth-request-csdn139173856-2.png)

返回 404——外部用户探测不到认证端点的存在，子请求却照常工作。不加这条的隐患：`/auth` 公开可达，任何人都能直接请求它试探认证服务的响应行为，等于把门锁的内部结构展示给攻击者。原文示例把认证 location 暴露在公开路径下，这一条是实跑后必加的修正。

## 错误写法对比：两种"看起来配好了"

**错法一**：在配了 auth_request 的 location 里用 `return` 提供内容：

```nginx
# 错：return 在 rewrite 阶段执行，早于 access 阶段
location /protected/ {
  auth_request /_auth;
  return 200 "OK\n";    # 认证被跳过，任何人都能拿到 OK
}
```

实测现象就是"无凭证也返回 200"——auth_request 压根没被执行。`return`、`rewrite` 属于 rewrite 阶段，跑在 access 阶段的 auth_request 之前；受保护 location 的正常出口应该是静态文件或 `proxy_pass`。

![配图3](/images/csdn/figures/nginx-auth-request-csdn139173856-3.png)

**错法二**：漏掉 `proxy_pass_request_body off;` 和 `proxy_set_header Content-Length "";`。这两条不起眼，但要先说清一个机制：**auth 子请求恒为 GET**（Nginx 子请求机制决定，实测 POST 主请求打过去，认证服务日志里记的也是 `method=GET`）。漏配的后果是：主请求的请求体会随这个 GET 子请求一起转发给认证服务——在认证服务的访问日志里能看到 `Content-Length: 3` 这样带着 body 的 GET。

宽容的 mock 端点（if + return）对此无感，配置"看起来没事"；换真实认证服务就会露馅——严格校验"GET 不应携带 body"、校验 Content-Length 或走签名校验的服务，都会直接给出 4xx，认证莫名失败。两条配套指令就是为掐断这条转发链而存在的：前者不转发请求体，后者把 Content-Length 头清空、保持 HTTP 组帧正确。

![配图4](/images/csdn/figures/nginx-auth-request-csdn139173856-4.png)

## 注意事项

- **状态码约定必须严格执行**：认证服务 2xx 放行、401/403 拒绝；返回 302/500 之类的其他值会被 Nginx 当作子请求错误处理，实测客户端统一收到 500 Internal Server Error（不是透传认证服务的原始状态码），排错时容易被这个 500 带偏。认证服务里把未约定的出口一律收敛到 401/403。
- **请求体进不了认证服务**：子请求恒为 GET，配好关 body 的两条指令后主请求体不会到达认证服务；需要按请求体内容做认证的场景，auth_request 不适合直接上，让后端拿到请求后自行调用认证系统。
- **认证端点加 internal**：只允许内部子请求访问，避免端点行为被外部探测。
- **演示配置换真服务**：实例里用 if + return 模拟认证服务只为演示；生产环境换成真实认证系统（SSO、OAuth2 introspection 等），并只监听本机或内网地址。

## 小结

回到开头的场景：认证逻辑写一份、所有后端共享——auth_request 用一次子请求把这件事变成状态码约定。实跑下来的完整清单：`auth_request` 指向 internal 的子请求端点，端点透传 `X-Original-URI` 做路径级授权，`error_page` 接住 401/403，`proxy_pass_request_body off` 加 `Content-Length ""` 关掉请求体转发；同时记住两个失效形态——rewrite 阶段的 `return` 会抢在认证之前，漏关请求体则把 body 静默转给认证服务，宽容的后端看不出来、严格的直接报错。配好这几点，这套轻量网关认证就能稳定接住流量。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
