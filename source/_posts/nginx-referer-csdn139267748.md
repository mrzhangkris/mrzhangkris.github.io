---
title: "Nginx Referer 模块：防盗链与来源统计"
date: 2024-05-29 08:45:00
updated: 2026-09-11
categories: [技术]
tags: [Nginx]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1697952431907-8542919a16b3?w=1600&q=80&fm=jpg
---

别人家的页面直接 `<img>` 标签挂着你的图片，流量账单算在你头上——这就是盗链。HTTP 请求头里的 `Referer` 记录了请求是从哪个页面跳转来的，Nginx 的 Referer 模块（`ngx_http_referer_module`）利用这个字段判断请求来源，既能做防盗链，也能把来源信息记进日志做流量分析。

## Referer 是什么

浏览器从页面 A 上的链接跳到页面 B 时，请求 B 资源通常会带上 `Referer` 头，值就是页面 A 的 URL。服务器由此知道用户从哪儿来。不过要注意，Referer 是客户端提供的，可以直接伪造，它适合做粗粒度的来源控制，不适合做强安全校验。

## 模块能做什么

- **防盗链**：只允许特定来源的页面加载你的图片、视频等资源，其他来源直接拒绝。
- **统计分析**：把 `$http_referer` 记进访问日志，分析流量从哪儿来。
- **安全控制**：限制某些来源页面的访问，挡掉一批低质量的自动请求。

## 示例一：防盗链

最典型的写法是 `valid_referers` 配合 `if`：

```nginx
server {
  listen 80;
  server_name yourwebsite.com;

  location / {
    valid_referers none blocked yourwebsite.com;
    if ($invalid_referer) {
      return 403;
    }
  }
}
```

拆开看这条配置在做什么：

- `valid_referers none blocked yourwebsite.com;` 定义允许的 Referer 列表：`none` 表示允许不带 Referer 的请求（直接在地址栏输入网址就是这种），`blocked` 表示允许 Referer 存在但被防火墙或代理删掉了值的请求，最后的域名是合法来源。
- 匹配失败的请求，内置变量 `$invalid_referer` 的值为非空字符串，`if` 命中后直接 `return 403`。

![配图](/images/csdn/figures/nginx-referer-csdn139267748.png)

适合的场景：图片、视频等静态资源保护，减少被外站白嫖的带宽；配合付费内容做粗粒度来源校验；挡掉一批不带合法 Referer 的爬虫请求。

> 注：原文示例在 `if` 之后还写了 `allow yourwebsite.com; deny all;`，但 allow/deny 属于 access 模块，只接受 IP/CIDR，不能写域名，这两行在本例中也不会按作者意图生效，重构时删去。

## 示例二：来源统计

防盗链是"拒绝"，统计是"记录"。核心是自定义 log_format 把 Referer 记下来：

```nginx
http {
  log_format referer_log '$remote_addr - $remote_user [$time_local] "$request" '
    '$status $body_bytes_sent "$http_referer" "$http_user_agent"';

  access_log /var/log/nginx/referer.log referer_log;

  server {
    listen 80;
    server_name yourwebsite.com;

    location / {
      valid_referers none blocked yourwebsite.com;
      if ($invalid_referer) {
        return 403;
      }
      access_log /var/log/nginx/referer_access.log referer_log;
    }
  }
}
```

这里定义了名为 `referer_log` 的日志格式，`$http_referer` 和 `$http_user_agent` 两个变量分别记录来源页面和浏览器信息。`access_log` 指定了日志文件路径和使用的格式；location 里再写一次 `access_log` 会覆盖 http 级别的设置，这样这个 location 的请求单独落到 `referer_access.log`，方便和其他流量分开统计。

日志攒起来之后，用途就很实际了：分析广告点击来源、看流量主要从哪些站点跳过来、结合不同来源的用户行为调整内容发布策略。

## 注意事项

- `none` 和 `blocked` 是不是要加，取决于业务：允许用户直接打开资源就得加 `none`，前面有会剥 Referer 的代理就得加 `blocked`。
- Referer 可以伪造，防盗链挡的是"顺手挂链接"这种低成本盗用，防不了定向伪造。
- 服务器块里没写 `server_names` 时，域名直接列在 `valid_referers` 后面即可；来源多的时候再考虑哈希表配置。
- 改完用 `nginx -t` 验证，reload 前确认日志目录存在且 Nginx 进程有写权限。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
