---
title: "用 GoAccess 做实时 Web 日志分析：安装、报告与中文环境配置"
date: 2024-05-15 09:30:00
categories: [技术, Linux]
tags: [Linux]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1640552435388-a54879e72b28?w=1600&q=80&fm=jpg
updated: 2026-09-14
---

想知道网站当前谁在访问、流量什么模式、有没有异常请求，GoAccess 可以直接在日志上给出答案。它是开源的 Web 日志分析工具：不依赖数据库、不往服务器上装 agent，一条命令读 Nginx/Apache 的访问日志就能出统计——终端界面、HTML 报告、JSON 都支持，`--real-time-html` 模式还能让报告跟着日志实时刷新。这篇按使用场景整理它的用法，实测环境为 debian:12 容器内的 GoAccess 1.7（Rocky 9 EPEL 上的 1.11 顺带验证了安装），日志示例为自造的 5 条 combined 格式测试日志。

## 安装

大多数发行版的仓库里都有。Debian/Ubuntu：

```bash
sudo apt-get install -y goaccess
```

CentOS/RHEL/Rocky 要先启用 EPEL 仓库（Rocky 9 实测 `dnf` 版命令，装到 GoAccess 1.11）：

```bash
sudo dnf install -y epel-release
sudo dnf install -y goaccess
```

验证点：`goaccess --version` 输出版本号。debian:12 实测装到的是 GoAccess 1.7：

![配图1](/images/csdn/figures/goaccess-web-csdn138814793-1.png)

## 场景一：快速看一眼今天的访问统计

最常用的一条命令——分析 Nginx 访问日志，结果直接在终端里看：

```bash
goaccess /var/log/nginx/access.log --log-format=COMBINED
```

`--log-format=COMBINED` 对应 Nginx 默认的 combined 日志格式（`log_format combined ...` 或没改过默认配置的就是它）。终端界面按面板组织：访客数、请求数、404、流量、来源、浏览器、状态码……方向键上下翻，回车展开面板明细，`q` 退出。

日志格式对不上时统计结果会乱（大量请求被标记 invalid），先确认 Web 服务器的 `log_format` 再选参数——这是 GoAccess 使用中最常见的问题。

## 场景二：生成 HTML 报告发给别人看

终端界面只有登录服务器的人能看，要分享就用 `-o` 输出 HTML：

```bash
goaccess /var/log/nginx/access.log --log-format=COMBINED -o /var/www/html/report.html
```

实测 5 条测试日志生成 346K 的报告文件，JSON 里 `valid_requests: 5` 确认全部解析成功——所有数据内嵌在单文件里，不依赖外部资源，浏览器直接打开：

![配图2](/images/csdn/figures/goaccess-web-csdn138814793-2.png)

放在 `/var/www/html/` 下可以直接通过 Web 访问；不想对外暴露的话换到非站点目录，拷到本地打开。

## 场景三：实时刷新的监控大屏

`--real-time-html` 让报告活起来：GoAccess 进程常驻，盯着日志文件增长，通过 WebSocket 把新数据推给已打开的浏览器页面，无需手动刷新：

```bash
goaccess /var/log/nginx/access.log --log-format=COMBINED \
  -o /var/www/html/report.html --real-time-html
```

实测启动后输出 `WebSocket server ready to accept new client connections`，默认监听 7890 端口（浏览器所在网络要能访问到这个端口，远程访问用 `--ws-url` 指定地址）：

![配图3](/images/csdn/figures/goaccess-web-csdn138814793-3.png)

注意这个进程是前台常驻的，生产环境要用 systemd 托管；进程退出后页面停止更新，但已生成的 HTML 仍然保留最后状态的快照。

## 场景四：中文环境配置

中文环境的关键是系统 locale 支持 UTF-8。先检查：

```bash
locale
```

输出里 LANG/LC_ALL 带 `.UTF-8` 后缀即可。不是的话临时改：

```bash
export LC_ALL=en_US.UTF-8
export LANG=en_US.UTF-8
```

长期使用写进 `/etc/profile` 或 `~/.bashrc`，`export` 只对当前会话有效。

一个实测修正：**locale 不是 UTF-8 并不影响 HTML 报告生成**——在 POSIX locale 下实测 `-o report.html` 照样成功（346K 输出与 UTF-8 环境一致）。locale 影响的是终端交互界面的字符渲染：非 UTF-8 环境下终端面板里的边框、中文 User-Agent 可能显示为乱码。所以：出 HTML 报告对 locale 无要求，用终端界面才需要配好 UTF-8。

## 场景五：输出 JSON 给程序用

报告给人看，JSON 给程序用——接监控、做二次分析都从这里取数：

```bash
goaccess /var/log/nginx/access.log --log-format=COMBINED -o report.json -p /etc/goaccess/goaccess.conf
```

`-o` 参数按扩展名自动选输出格式：`.html` 出网页，`.json` 出 JSON，不带扩展名或 `-` 输出到终端。

## 参数速查

| 参数 | 作用 | 示例值 |
|------|------|--------|
| `--log-format` | 指定日志格式 | `COMBINED`（Nginx/Apache 默认） |
| `-o` | 输出文件（按扩展名定格式） | `report.html` / `report.json` |
| `--real-time-html` | 实时刷新 + WebSocket 服务 | 配合 `-o xxx.html` 使用 |
| `--ws-url` | 实时模式下浏览器连的 WS 地址 | `--ws-url=host:7890` |
| `--no-color` | 终端输出去色（管道/重定向用） | `goaccess ... --no-color > out.txt` |
| `-f` | 指定日志文件（与位置参数等价） | `-f access.log` |
| `-p` | 指定配置文件 | `-p /etc/goaccess/goaccess.conf` |

## 注意事项

- **日志格式一致性**：`--log-format` 要与 Web 服务器日志的实际输出格式匹配，格式对不上统计结果就乱了。自定义过 `log_format` 的，GoAccess 配置文件里也支持写自定义格式串。
- **访问权限**：执行 GoAccess 的用户要有读取日志文件的权限（access.log 通常是 root:adm 640，普通用户要进 adm 组或 sudo 执行）；输出到 `/var/www/html/` 则要保证写入权限。
- **性能考虑**：实时模式常驻进程持续 tail 日志，高流量站点（每秒千行以上）CPU 占用会上来，可以错峰生成静态报告代替实时模式。
- **locale 设置**：`export` 修改的 locale 只对当前会话有效，长期使用需写进 /etc/profile；且如上实测，locale 只影响终端界面显示，不影响 HTML/JSON 报告生成。
- **报告位置**：HTML 报告放在站点目录下等于把访问统计公开了——里面有 IP、UA、路径分布，敏感环境务必放到非公开目录或加访问控制。

GoAccess 的价值在于零依赖：一个二进制、一条命令，日志进、报告出。终端界面自查、HTML 分享、实时模式挂大屏、JSON 接监控，四种输出覆盖了日志分析的日常场景——记住格式匹配是第一位的，其余都是参数选择问题。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。