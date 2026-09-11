---
title: "DownloadOnly  一个必备的技术实践，以节流和优化网络资源"
date: 2024-05-13 09:41:44
categories: [技术]
tags: [网络服务]
copyright_author: 张鹏
cover: /images/csdn/covers/downloadonly-csdn138786238.png
---

本文将通过具体的技术实例，探索如何有效地利用DownloadOnly功能，以达到预下载内容并优化后续操作的目的。

### 什么是DownloadOnly模式？

DownloadOnly模式特指在一系列操作中只执行下载动作，而不立即执行后续的安装或更新。这对于需要在特定时段进行大量数据传输，但又不希望即时执行更新操作的情况非常实用，比如在带宽使用低峰期下载重要更新，然后在系统维护时段进行安装。

### 示例：使用YUM的DownloadOnly选项进行软件预载

**环境**：

-   **操作系统**：CentOS或任何支持YUM的Linux发行版
-   **目的**：预下载软件更新以备不时之需

**详细步骤**：

1. **安装YUM插件（如果尚未安装）**
```bash
sudo yum install yum-plugin-downloadonly
```
2. **使用DownloadOnly下载更新**
```bash
sudo yum update --downloadonly
```

> -   使用这个命令，YUM会下载所有可用更新的包，但不会安装它们。
> -   downloadonly默认保存路径/var/cache/yum/x86\_64/7/
> -   指定downloadonly默认保存路径，只需加上参数–downloaddir

```bash
yum install --downloadonly --downloaddir=/opt/ update
```

---

> 本文迁移自作者 CSDN 博客，2024-05-13 首发于 CSDN，内容保持原貌。
