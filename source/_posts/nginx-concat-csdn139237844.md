---
title: "Nginx Concat 模块：安装与合并静态资源"
date: 2024-05-27 14:41:46
updated: 2026-09-11
categories: [技术]
tags: [Nginx]
copyright_author: 司南
cover: /images/csdn/covers/nginx-concat-csdn139237844.png
---

页面引用十几个 CSS/JS 文件，浏览器就得发十几个请求——Nginx 的 Concat 模块让服务器端把多个文件合成一个响应返回，请求数和网络延迟都降下来。这篇记录它的安装过程、配置示例和适用场景。

## Concat 模块是干什么的

Concat 模块允许在服务器端动态合并多个文件，作为一个单独的响应传送给客户端。直接的好处是客户端对服务器的请求次数减少，网络延迟降低；资源文件的组织也更集中，网站维护起来更省事。

## 安装

安装分五步：

1. 下载 Concat 模块源码，从 Nginx 官方网站或 GitHub 获取：

```bash
git clone https://github.com/alibaba/ngx_http_concat_module.git
```

> 注：concat 模块源自阿里巴巴（Tengine 系），官方仓库常见地址写作 nginx-http-concat，克隆前建议先到 GitHub 确认；原文 URL 存疑保留。

2. 把源码文件解压到任意目录。
3. 配置 Nginx 编译选项：编译 Nginx 时添加 `--add-module=/path/to/ngx_http_concat_module` 参数，路径即模块源码所在目录。
4. 编译安装 Nginx：执行 `./configure` 和 `make && make install`，确保模块被正确编译链接进 Nginx。
5. 修改 Nginx 配置文件，在需要使用的地方添加 concat 相关指令。

![配图](/images/csdn/figures/nginx-concat-csdn139237844.png)

## 配置示例

以合并 style1.css 和 style2.css 两个 CSS 文件为例：

```nginx
server {
  listen 80;
  server_name example.com;

  location /css {
    concat on;
    concat_max_files 20;
    concat_unique off;
    concat_types text/css;
    root /path/to/css/files;

    # 合并后的文件名和路径
    concat_css /css/all.css;

    # 指定要合并的文件
    concat_css_allow all.css;
    concat_css_allow style1.css;
    concat_css_allow style2.css;
  }
}
```

示例在 /css 位置启用 concat，各指令的作用：

- `concat on;` 打开合并功能；
- `concat_max_files 20;` 限制单个合并请求最多 20 个文件，防止超长 URL 拖垮请求；
- `concat_unique off;` 允许不同类型文件混在同一个合并请求里（on 则只允许同类型）；
- `concat_types text/css;` 限定可合并的 MIME 类型；
- `root /path/to/css/files;` 指定 CSS 文件所在目录。

> 注：concat_css 与 concat_css_allow 两条指令在 concat 模块的公开文档中未见收录；该模块通行的用法是在 URL 中以 ?? 连接文件名（如 /css/??style1.css,style2.css）发起合并。原文示例可能无法直接运行，存疑保留。

## 使用场景

- **合并静态资源文件**：把多个 CSS 或 JavaScript 文件合并传输，减少 HTTP 请求次数，加快网页加载。
- **按请求组织合并内容**：根据客户端请求动态决定合并哪些文件，灵活应对不同的资源组合。
- **节省带宽**：请求次数降下来，服务器带宽和资源消耗随之减少，网站整体性能和稳定性更好。

## 注意事项

- `concat_max_files` 给一个合理上限，避免单个 URL 拼接过多文件造成压力。
- `concat_unique` 默认为 on，只允许合并同类型文件；关掉后混类型合并时，确认 `concat_types` 覆盖了涉及的类型。
- 模块是编译进 Nginx 的，日后升级或重装 Nginx 时 `--add-module` 参数要记得带上，否则配置里的 concat 指令会报 unknown directive。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
