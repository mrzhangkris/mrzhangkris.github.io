---
title: "YUM/DNF DownloadOnly：只下载不安装，预载软件更新"
date: 2024-05-13 09:41:44
categories: [技术]
tags: [网络服务]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1687038520563-2310e8b06ed2?w=1600&q=80&fm=jpg
updated: 2026-09-14
---

有一类需求很常见：想在带宽空闲的时段把软件更新先下载好，等维护窗口再真正安装。DownloadOnly 模式就是干这个的——只执行下载动作，不立即安装或更新。这篇以 Rocky Linux 9 的 dnf 为主线（全部命令在 rockylinux:9 容器实测，dnf 4.14.0，aarch64），CentOS 7 的插件玩法作为历史差异单列一节，老环境对照着用。

## 这功能解决什么问题

生产服务器的变更要挑维护窗口，但更新包几个 G，窗口里现下载时间根本不够。DownloadOnly 把"传输"和"变更"拆开：低峰期把包拉到本地，维护窗口只做本地安装，窗口时间从"下载+安装"缩短为"安装"。

适用的典型场景：
- 维护窗口短、更新包大
- 多台服务器装同一批更新，下载一次分发复用（配合内网源或 scp）
- 想先审查将安装的包清单，再决定是否执行

## 场景一：预下载系统全部可用更新

RHEL 8/9 / Rocky / Alma 系的 dnf 原生支持 `--downloadonly`，无需任何插件。全系统更新的包拉到指定目录：

```bash
dnf update --downloadonly --downloaddir=/tmp/u -y
```

输出里 `DNF will only download packages for the transaction.` 一行确认了"只下载"语义；实测 60 M 更新、114 个 rpm 全部落进 /tmp/u，系统一个包都没动：

![配图1](/images/csdn/figures/downloadonly-csdn138786238-1.png)

不加 `--downloaddir` 时包会存进 /var/cache/dnf 按仓库分的深层缓存目录，事后想归档得一个个仓库翻，正式使用建议都带上这个参数。

## 场景二：只下载某个包及其依赖

不更新全系统，只想把某个软件包先拉到本地（比如给离线机器装 wget）：

```bash
dnf install --downloadonly --downloaddir=/tmp/dl -y wget
```

实测 wget 连同 libpsl、publicsuffix-list 两个依赖一起落盘：

![配图2](/images/csdn/figures/downloadonly-csdn138786238-2.png)

注意 `--downloadonly` 会连带下载全部依赖——离线安装时这批依赖缺一不可，所以一定要用 `--downloaddir` 收拢到一个目录。

两个坑实测都踩过：一是脚本、容器这类非交互环境里没加 `-y`，事务直接 `Operation aborted` 放弃，一个包都不会下；二是下载完成不等于校验完成，装前用 `rpm -K` 过一遍签名：

![配图3](/images/csdn/figures/downloadonly-csdn138786238-3.png)

## 场景三：维护窗口执行本地安装

包已就位后，窗口里的安装直接指向本地目录，不再产生下载流量：

```bash
dnf install /tmp/dl/*.rpm
```

实测这批 rpm 一次装完（`Complete!`，wget 可用）。dnf 会自动处理目录内 rpm 的依赖关系；若还有目录外的依赖（下载时漏了），它会尝试从仓库补齐——离线环境这一步会失败，提前用 `dnf repoquery --requires` 或 `yum deplist` 核对依赖清单。

## 历史版本差异（CentOS 7）

CentOS 7 的 yum 默认不支持 `--downloadonly`，功能由独立插件提供，来源为原文与官方文档（未在本文环境实测）：

```bash
yum install yum-plugin-downloadonly
yum update --downloadonly --downloaddir=/opt/updates/
```

- 没装插件直接加 `--downloadonly`，yum 报 `No such option: --downloadonly` 退出——这是 CentOS 7 上"照着文档敲却报错"最常见的原因。
- yum 时代默认下载路径在 `/var/cache/yum/x86_64/7/<仓库名>/packages/`，同样按仓库分目录。
- 另一个选择是 yum-utils 包里的 `yumdownloader`（`yumdownloader --destdir=/opt nginx`），单包下载，可与插件并存。
- 本地安装命令叫 `yum localinstall`；dnf 上该功能已合并进 `dnf install`，直接给路径即可。

## 参数速查

| 参数 | 作用 | 示例 |
|------|------|------|
| `--downloadonly` | 只下载不安装 | `dnf update --downloadonly` |
| `--downloaddir=路径` | 指定下载目录 | `--downloaddir=/tmp/u` |
| `-y` | 非交互环境必加，否则事务被放弃 | `dnf install --downloadonly -y wget` |
| `dnf download --resolve` | dnf-plugins-core 的单包下载，`--resolve` 连带依赖 | `dnf download --resolve nginx` |
| `yumdownloader`（yum-utils） | CentOS 7 的单包下载工具 | `yumdownloader --destdir=/opt nginx` |

## 注意事项

- DownloadOnly 只下载不安装，更新并没有生效；真正升级仍要在维护窗口执行 `dnf update` 或 `dnf install 本地目录/*.rpm`。
- 非交互环境（脚本、CI、容器）执行下载必须带 `-y`，实测没加时事务直接放弃。
- 默认下载位置在 /var/cache/dnf（CentOS 7 是 /var/cache/yum）深处且按仓库分目录，要人工拷贝归档时用 `--downloaddir` 指到专门目录更省事。
- 下载的包与系统架构、版本绑定：el9 的 aarch64 包装不进 x86_64 机器，离线复用前先确认目标机器环境一致。
- 下载完成 ≠ 校验完成，安装前 `rpm -K *.rpm` 过一遍 GPG 签名，防止传输损坏或被篡改（实测正常包输出 `digests signatures OK`）。

把"传输"挪到低峰、把"变更"留在窗口，DownloadOnly 这一个选项就能把维护窗口的时长砍掉大半——记住 CentOS 7 要装插件、RHEL 8/9 系原生支持这个差异，两代系统上都能用对。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
