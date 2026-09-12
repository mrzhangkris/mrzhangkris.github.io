---
title: "Nginx addition 模块：把子请求内容拼进主响应"
date: 2024-05-28 10:20:58
updated: 2026-09-11
categories: [技术]
tags: [Nginx]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1680992046626-418f7e910589?w=1600&q=80&fm=jpg
---

页面里经常有广告位、页脚、推荐位这类由独立接口提供的小片段，如果让浏览器再发请求去取，请求数和后端压力都会跟着涨。Nginx 的 addition 模块给了另一种思路：在 Nginx 层把子请求的响应体插到主响应的前面或后面，客户端一次请求拿到完整内容。这篇在 nginx:1.28 容器里把它的配置、边界和一个流传很广的过时写法实跑一遍。

## 实验环境

- Docker 容器 `nginx:1.28-alpine`（nginx/1.28.3，2026-09 实测）。
- 官方镜像编译时带了 addition 模块（`nginx -V` 可见 `--with-http_addition_module`），但注意：这是**可选模块**，不是所有发行版包都默认带上，部署前先确认。
- 准备三个文件：`main.html`（主文档）、`banner.html`（横幅）、`footer.html`（页脚）。

## 核心机制一句话

addition 是个过滤模块：响应经过 Nginx 时，它按配置向**子请求**（`add_before_body` / `add_after_body` 指定的 URI）再发起一次内部请求，把子请求的响应体插到主响应体的前面或后面。全程客户端无感知，浏览器只看到一个响应。

## 实例一：给每个页面追加页脚

最简场景——所有 HTML 页面统一追加同一段页脚：

```nginx
server {
  listen 80;
  root /usr/share/nginx/html;

  location ~ \.html$ {
    add_after_body /footer.html;
  }
}
```

请求主文档，看返回了什么：

![配图1](/images/csdn/figures/nginx-addition-csdn139259142-1.png)

返回体里主文档内容 `<h1>MAIN</h1>` 之后紧跟 `<div>FOOTER</div>`——页脚内容是 Nginx 内部请求 `/footer.html` 拿来拼上的，客户端一个请求就拿到了。

## 实例二：广告横幅 + 页脚，前后包夹

把主响应夹在中间，前面插横幅、后面插页脚：

```nginx
location = /main-both.html {
  add_before_body /banner.html;
  add_after_body /footer.html;
}
```

![配图2](/images/csdn/figures/nginx-addition-csdn139259142-2.png)

返回顺序是 `BANNER → MAIN → FOOTER`：`add_before_body` 的子请求先执行，主响应居中，`add_after_body` 收尾。多条指令按这个固定顺序拼接，想调整位置就是调整这两条指令的顺序。

## 实例三：addition_types 划定 MIME 边界

addition 默认**只处理 `text/html`**。给一个 `text/plain` 的文件配上 `add_after_body`，验证它是否生效：

```nginx
location = /note.txt {
  add_after_body /footer.html;
}
```

![配图3](/images/csdn/figures/nginx-addition-csdn139259142-3.png)

`note.txt` 原样返回，页脚没有被拼进来——因为它的 Content-Type 是 `text/plain`，不在默认处理范围内。要扩展范围用 `addition_types`：

```nginx
addition_types text/html text/css;
```

需要处理任意类型时用通配值 `addition_types *;`。这条边界记不住的代价是"配了不生效"，排错时先看响应的 Content-Type。

## 错误写法对比：addition on 是过时指令

网上大量老教程（包括这篇原文的初版）第一步就写 `addition on;`。实测当前 nginx 直接拒绝这条指令：

```nginx
# 错：老版本才有的指令，现已移除
addition on;
# nginx: [emerg] unknown directive "addition"

# 对：模块默认开启，直接写两条 add 指令即可
add_before_body /banner.html;
add_after_body /footer.html;
```

![配图4](/images/csdn/figures/nginx-addition-csdn139259142-4.png)

`nginx -t` 阶段就报 `[emerg] unknown directive "addition"`，配置加载失败。同理，`addition_output_charset` 也不是真实存在的指令，实测同样被拒。addition 模块现行指令只有三条：`add_before_body`、`add_after_body`、`addition_types`。照老教程抄配置起不来的，多半卡在这。

## 注意事项

- **模块不是默认编译的**。官方文档明确 `--with-http_addition_module` 需要显式启用；用自编译或精简发行版包时，先 `nginx -V` 确认模块在位，再 `nginx -t` 验证指令可识别。
- **默认只拼 text/html**。其他 MIME 要靠 `addition_types` 显式放行，否则配置静默不生效。
- **取消继承用空字符串**。`add_before_body "";` 会取消从上一级（http/server）继承的追加配置，嵌套 location 里做例外时用得上。
- **性能有代价**。每个追加项都是一次内部子请求，片段多、流量大时 Nginx 和后端的负载都会上升，功能与成本要一起算。
- **内容一致性**。拼出来的页面要各片段样式结构对得上，片段由不同团队维护时容易错乱，改版时把片段一并检查。

## 小结

回到开头的场景：广告位、页脚这类小片段不必让浏览器多跑一趟——addition 模块在 Nginx 层用子请求把内容拼进主响应，一条 `add_after_body` 就能让全站页面统一带页脚。实跑下来的三条规则：现行指令只有 `add_before_body`、`add_after_body`、`addition_types`；默认只处理 `text/html`；老教程里的 `addition on;` 已被移除，照抄会直接 `unknown directive`。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
