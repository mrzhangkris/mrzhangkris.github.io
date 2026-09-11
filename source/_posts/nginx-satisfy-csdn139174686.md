---
title: "Nginx satisfy 指令：多重访问控制的组合判断"
date: 2024-05-25 09:15:00
updated: 2026-09-11
categories: [技术]
tags: [Nginx]
copyright_author: 司南
cover: /images/csdn/covers/nginx-satisfy-csdn139174686.png
---

同一个 location 上同时挂了 IP 白名单和密码验证时，请求要过几道关卡？`satisfy` 指令就是回答这个问题的：`any` 表示任意一道关卡放行即可，`all` 表示每道都得过。做"内网免密、外网要密码"这类策略，全靠它。

## 语法

```nginx
satisfy any | all;
```

- `satisfy any`：多个访问控制条件里，满足任意一个即可通过。
- `satisfy all`：所有条件必须同时满足。

这里的"条件"指的是 access 模块的 allow/deny（IP 控制）和 auth_basic（身份验证）这类访问限制。不写 satisfy 时，Nginx 默认取 `all`。

## 示例一：IP 白名单或密码，过其一即可

```nginx
server {
  listen 80;
  server_name example.com;

  satisfy any;

  # IP白名单
  allow 192.168.1.0/24;
  deny all;

  # 基本身份验证
  auth_basic "Restricted";
  auth_basic_user_file /etc/nginx/.htpasswd;

  location / {
    root /var/www/html;
    index index.html;
  }
}
```

`deny all` 兜住白名单之外的来源，`auth_basic` 要求密码。`satisfy any` 让这两道关卡变成"或"的关系：内网 IP 直接放行，外网用户输对密码也能进。

## 示例二：两个条件都要过

```nginx
server {
  listen 80;
  server_name example.com;

  satisfy all;

  # IP白名单
  allow 192.168.1.0/24;
  deny all;

  # 基本身份验证
  auth_basic "Restricted";
  auth_basic_user_file /etc/nginx/.htpasswd;

  location / {
    root /var/www/html;
    index index.html;
  }
}
```

只把 `any` 换成 `all`，语义就变成"且"：必须在白名单网段里，还必须通过基本身份验证，缺一个都进不来。适合"只允许办公网段访问，且访问者要实名登录"的场景。

![配图](/images/csdn/figures/nginx-satisfy-csdn139174686.png)

## 示例三：deny all 与 allow all 组合

```nginx
server {
  listen 80;
  server_name example.com;

  satisfy any;

  deny all;
  allow all;

  # 基本身份验证
  auth_basic "Restricted";
  auth_basic_user_file /etc/nginx/.htpasswd;

  location / {
    root /var/www/html;
    index index.html;
  }
}
```

同一段里 allow 和 deny 混用时，access 模块按书写顺序逐条检查，碰到第一条匹配当前来源的规则就停止。上面这段里 `deny all` 排在前面并且匹配所有来源，所以 IP 这道关卡实际上对所有请求都说"不"，后面的 `allow all` 永远轮不到——加上 `satisfy any`，最终效果是只能靠通过基本身份验证进门。

> 注：原文此处解释为"Nginx 优先处理 allow all，所有请求都被允许"，与 allow/deny 的顺序匹配语义相反，重构时已修正。

这类配置的意义在于提醒：deny/allow 的书写顺序不是装饰，写反了整条策略就变形了。

## 示例四：return 的优先级更高

```nginx
server {
  listen 80;
  server_name example.com;

  satisfy any;

  deny all;
  allow 192.168.1.0/24;

  # 基本身份验证
  auth_basic "Restricted";
  auth_basic_user_file /etc/nginx/.htpasswd;

  location /secret {
    return 404;
  }

  location / {
    root /var/www/html;
    index index.html;
  }
}
```

请求 `/secret` 时，不管来源是不是白名单 IP、密码对不对，都直接返回 404。原因是 `return` 在 rewrite 阶段就结束了请求，压根走不到 access 检查和身份验证那两步。想在某个路径上彻底关门的场景，这招比配一堆 allow/deny 更干脆。

## 注意事项

- `satisfy` 可以放在 http、server、location 块中，作用范围逐层向内生效。
- 不写 satisfy 时默认 `all`——想要"任一条件放行"的语义，必须显式写 `satisfy any`。
- allow/deny 按书写顺序取第一条匹配，把 `deny all` 和具体网段写在同一个块里时，顺序决定一切，`nginx -t` 只查语法不查逻辑，策略要在测试环境过一遍。
- `.htpasswd` 文件用 `htpasswd` 或 `openssl passwd` 生成，路径别放在 web 根目录下。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
