---
title: "用 GoAccess 做中文环境下的实时 Web 日志分析"
date: 2024-05-15 09:30:00
categories: [技术]
tags: [Linux]
copyright_author: 司南
cover: /images/csdn/covers/goaccess-web-csdn138814793.png
updated: 2026-09-11
---

想知道网站当前谁在访问、流量什么模式、有没有异常请求，GoAccess 可以直接在日志上给出答案。它是一款开源的 Web 日志分析工具，支持实时数据展示，终端和 HTML 报告都能出，配上 UTF-8 的 locale 还能在中文环境下正常工作。这篇记录它的安装、中文配置和实时 HTML 报告的跑法。

## GoAccess 的主要特点

- **实时更新**：能实时分析和展示访问数据。
- **支持多种输出**：既可以在命令行界面看，也能生成 HTML 和 JSON 报告，满足不同需求。
- **易于安装和使用**：安装简单，配置灵活。

## 安装 GoAccess

大多数 Linux 发行版的包管理系统可以直接安装。Ubuntu 上：

```bash
sudo apt-get install goaccess
```

CentOS 上：

```bash
sudo yum install goaccess
```

## 配置 GoAccess 以支持中文

中文环境的关键是系统 locale 要支持 UTF-8。先检查当前设置：

```bash
locale
```

如果当前设置不是 UTF-8，通过如下命令修改：

```bash
export LC_ALL=en_US.UTF-8
export LANG=en_US.UTF-8
```

## 运行 GoAccess 并生成中文环境的实时 HTML 报告

以分析 Nginx 日志为例。用下面的命令，GoAccess 分析指定的日志文件，生成一个实时更新的 HTML 报告：

```bash
goaccess /var/log/nginx/access.log --log-format=COMBINED -o /var/www/html/report.html --real-time-html
```

![配图](/images/csdn/figures/goaccess-web-csdn138814793.png)

生成的 HTML 文件位于 /var/www/html/report.html，在任意浏览器中打开就能看到实时更新的访问分析。

## 注意事项

- **日志格式一致性**：`--log-format` 指定的格式要与 Nginx 或其他 Web 服务器日志的实际输出格式匹配，格式对不上统计结果就乱了。
- **访问权限**：执行 GoAccess 的用户要有读取日志文件的权限，输出路径则要保证 Web 服务器有相应的写入权限。
- **性能考虑**：实时日志分析在高流量网站上可能对性能有较大影响，要留意服务器负载，必要时调整 GoAccess 配置。
- **locale 设置**：`export` 修改的 locale 只对当前会话有效，长期使用需要写进 /etc/profile 之类的配置文件。
- **报告位置**：HTML 报告放在 /var/www/html/ 下可以直接通过 Web 访问，不想对外暴露的话换到非站点目录，本地打开查看。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
