---
title: "Nginx Referer 防盗链实战：valid_referers 四种请求实测"
date: 2024-05-29 08:45:00
updated: 2026-09-11
categories: [技术]
tags: [Nginx]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1697952431907-8542919a16b3?w=1600&q=80&fm=jpg
---

别人家的页面直接 `<img>` 标签挂着你的图片，流量账单算在你头上——这就是盗链。HTTP 请求头里的 `Referer` 记录了请求是从哪个页面跳转来的，Nginx 的 Referer 模块（`ngx_http_referer_module`）利用这个字段判断请求来源，既能做防盗链，也能把来源信息记进日志做流量分析。

**核心机制一句话：`valid_referers` 列出合法来源，不匹配的请求会让内置变量 `$invalid_referer` 变成非空，配合 `if` 拒绝即可。** 本文在 nginx:alpine 容器里把带 Referer、不带 Referer、空头、盗链头四种请求各跑一遍，每种都有实拍结果，最后把一个流传很广的错误写法实跑给你看。

## 实验环境与机制前提

- nginx:alpine 官方镜像，版本 nginx/1.31.5，referer 模块为内置标准模块，无需额外编译参数；
- 请求在容器内自发自收，用 curl 的 `-H` 手工构造 Referer 头。

先说清楚 Referer 的可信度：浏览器从页面 A 跳到页面 B 时，请求 B 资源通常会带上 `Referer` 头，值就是页面 A 的 URL。但它是客户端提供的，可以直接伪造。所以这个模块的定位是**粗粒度的来源控制**——挡住顺手挂链接的低成本盗用，不是强安全校验。

模块的三个用途：

- **防盗链**：只允许特定来源的页面加载你的图片、视频等资源，其他来源直接拒绝。
- **统计分析**：把 `$http_referer` 记进访问日志，分析流量从哪儿来。
- **安全控制**：挡掉一批不带合法 Referer 的低质量自动请求。

## 实例一：最小防盗链配置，四种请求实测

最典型的写法是 `valid_referers` 配合 `if`：

```nginx
server {
  listen 80 default_server;

  valid_referers none blocked yourwebsite.com;
  if ($invalid_referer) {
    return 403;
  }

  location / {
    return 200 "ok\n";
  }
}
```

拆开看这条配置在做什么：

- `valid_referers none blocked yourwebsite.com;` 定义允许的 Referer 列表：`none` 表示允许**不带** Referer 的请求（直接在地址栏输入网址就是这种），`blocked` 表示允许 Referer 头存在但值为空、或被防火墙/代理删掉的请求，最后的域名是合法来源；
- 匹配失败的请求，`$invalid_referer` 的值为 `1`，`if` 命中后直接 `return 403`。

配置加载后，四种请求各发一次，看响应码：

![配图1](/images/csdn/figures/nginx-referer-csdn139267748-1.png)

矩阵很清楚：站内来源放行，盗链来源 403，无来源和空来源都按 `none`、`blocked` 的声明放行。`none` 和 `blocked` 要不要加，取决于业务——用户会直接打开图片地址就得留 `none`，前面有会剥 Referer 的隐私代理就得留 `blocked`，两个都删，正常用户会被误伤。

## 实例二：blocked 到底挡的是什么

`blocked` 值得单独跑一次，因为它最容易和 `none` 混淆。curl 用 `-H "Referer;"` 发送一个**存在但值为空**的 Referer 头：

![配图2](/images/csdn/figures/nginx-referer-csdn139267748-2.png)

结果是 200。这就是 `blocked` 的语义：头存在过，但值在中途被剥掉了——企业网关、隐私插件、HTTPS 跳转都会干这事。如果把这种请求判成盗链，从这类环境过来的用户会全体中招。反过来提醒一句：`none` 和 `blocked` 都放行意味着"无来源的请求不设防"，对图片站是合理代价，对付费内容就要掂量了。

## 实例三：来源统计，把 Referer 记进日志

防盗链是"拒绝"，统计是"记录"。核心是自定义 `log_format` 把 `$http_referer` 记下来：

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
    }
  }
}
```

`$http_referer` 和 `$http_user_agent` 分别记录来源页面和浏览器信息；location 里再写一次 `access_log` 会覆盖 http 级别的设置，把这部分流量单独落到一个文件，方便分开统计。实例一的实跑日志里已经能看到这个字段的工作状态——盗链请求被拒的日志行是现成的证据：

![配图3](/images/csdn/figures/nginx-referer-csdn139267748-3.png)

`$http_referer` 字段原样记下了 `https://evil.example/hotlink`。日志攒起来之后用途就很实际：分析广告点击来源、看流量主要从哪些站点跳过来、结合来源调整内容发布策略。

## 错误写法对比：allow 写域名，nginx -t 直接报错

网上流传的防盗链配置里，常见 `if` 后面再接访问控制的写法：

```nginx
valid_referers none blocked yourwebsite.com;
if ($invalid_referer) {
  return 403;
}
allow yourwebsite.com;   # 想再补一层来源限制
deny all;
```

这份配置加载不了。`allow`/`deny` 属于 access 模块，只接受 IP/CIDR（和 `unix:`、`all`），**不能写域名**——referer 模块的域名匹配能力不能移植过去。实跑一下 `nginx -t` 看报错：

![配图4](/images/csdn/figures/nginx-referer-csdn139267748-4.png)

`invalid parameter "yourwebsite.com"`，测试直接失败。如果只是照抄粘贴，服务起不来的同时还会拖累同机其他站点；这也是为什么改完配置永远先 `nginx -t` 再 reload。

## 注意事项

- `none` 和 `blocked` 是不是要加，取决于业务：允许用户直接打开资源就得加 `none`，前面有会剥 Referer 的代理就得加 `blocked`；都不加，等于只认带合法域名的请求。
- Referer 可以伪造，防盗链挡的是"顺手挂链接"这种低成本盗用，防不了定向伪造；强校验要走签名 URL（secure_link）或登录态。
- 服务器块里没写 `server_names` 时，域名直接列在 `valid_referers` 后面即可；来源多的时候再考虑哈希表配置。
- 改完用 `nginx -t` 验证，reload 前确认日志目录存在且 Nginx 进程有写权限。

## 小结

回到开头的盗链场景：流量账单算在你头上，是因为服务器默认信任所有来源。`valid_referers` 把"合法来源"变成一份白名单，`$invalid_referer` 把判断结果交还给 `if`，四种请求的实测矩阵就是这套机制的全部行为。防盗链挡不住有心人，但足够让"顺手挂链接"的人去别家找图——对多数站点，这道粗粒度的门已经够用。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
