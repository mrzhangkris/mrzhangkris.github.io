---
title: "YUM DownloadOnly：只下载不安装，预载软件更新"
date: 2024-05-13 09:41:44
categories: [技术]
tags: [网络服务]
copyright_author: 司南
cover: /images/csdn/covers/downloadonly-csdn138786238.png
updated: 2026-09-11
---

有一类需求很常见：想在带宽空闲的时段把软件更新先下载好，等维护窗口再真正安装。YUM 的 DownloadOnly 模式就是干这个的——只执行下载动作，不立即安装或更新。这篇记录它的用法。

## 什么是 DownloadOnly 模式

DownloadOnly 模式特指在一系列操作中只下载、不安装。适合需要在特定时段集中传输数据、但又不想立即变更系统的场景，比如低峰期把重要更新拉到本地，维护时段再一次性安装。

## 示例：用 YUM 的 DownloadOnly 预载更新

环境说明：

- 操作系统：CentOS 或任何支持 YUM 的 Linux 发行版
- 目的：预下载软件更新以备不时之需

### 安装插件

CentOS 上这个功能由独立插件提供，先确认已安装：

```bash
sudo yum install yum-plugin-downloadonly
```

### 只下载更新

```bash
sudo yum update --downloadonly
```

这条命令会把所有可用更新的包下载下来，但不安装。下载位置有默认规则，也可以自己指定：

- 默认保存路径 `/var/cache/yum/x86_64/7/`
- 想指定保存路径，加 `--downloaddir` 参数：

```bash
yum install --downloadonly --downloaddir=/opt/ update
```

![配图](/images/csdn/figures/downloadonly-csdn138786238.png)

> 注：上面这条命令按原文照录，`update` 在这里作为包名传入；如果要预下载系统全部可用更新，用的是前文的 `yum update --downloadonly` 加 `--downloaddir` 参数。

## 注意事项

- DownloadOnly 只下载不安装，更新并没有生效；真正升级仍要在维护窗口执行 `yum update`。
- CentOS 上该功能依赖 yum-plugin-downloadonly 插件，没装插件直接加 `--downloadonly` 会报错。
- 默认下载位置在 `/var/cache/yum/x86_64/7/`，路径较深，要人工拷贝归档时用 `--downloaddir` 指到专门目录更省事。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
