---
title: "YUM DownloadOnly：只下载不安装，预载软件更新"
date: 2024-05-13 09:41:44
categories: [技术]
tags: [网络服务]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1687038520563-2310e8b06ed2?w=1600&q=80&fm=jpg
updated: 2026-09-11
---

有一类需求很常见：想在带宽空闲的时段把软件更新先下载好，等维护窗口再真正安装。YUM 的 DownloadOnly 模式就是干这个的——只执行下载动作，不立即安装或更新。这篇按场景整理它的用法，并说明 CentOS 7（yum + 插件）与 RHEL 8/9（dnf 原生支持）在这件事上的差异。

## 这功能解决什么问题

生产服务器的变更要挑维护窗口，但更新包几个 G，窗口里现下载时间根本不够。DownloadOnly 把"传输"和"变更"拆开：低峰期把包拉到本地，维护窗口只做本地安装，窗口时间从"下载+安装"缩短为"安装"。

适用的典型场景：
- 维护窗口短、更新包大
- 多台服务器装同一批更新，下载一次分发复用（配合内网源或 scp）
- 想先审查将安装的包清单，再决定是否执行

## 场景一：预下载系统全部可用更新

### CentOS 7：先装插件

CentOS 7 的 yum 默认不支持 `--downloadonly`，功能由独立插件提供，先装：

```bash
sudo yum install yum-plugin-downloadonly
```

没装插件直接加 `--downloadonly`，yum 会报 `No such option: --downloadonly` 退出——这是最常见的"照着文档敲却报错"的原因。

### 执行下载

```bash
sudo yum update --downloadonly
```

下载位置有默认规则，也可以自己指定：

- 默认保存路径：`/var/cache/yum/x86_64/7/<仓库名>/packages/`（按仓库分目录，路径较深）
- 指定路径：加 `--downloaddir` 参数

```bash
sudo yum update --downloadonly --downloaddir=/opt/updates/
```

### RHEL 8/9 / Rocky / Alma：dnf 原生支持，无需插件

dnf 把 `--downloadonly` 做成了内置选项，不再需要插件（yum-plugin-downloadonly 包在这些系统上也不存在）。实测 rockylinux:9：

![配图1](/images/csdn/figures/downloadonly-csdn138786238-1.png)

输出里的 `Total download size` 和 `DNF will only download packages` 两行确认了"只下载"语义；`--downloaddir` 指定的目录里直接是 rpm 文件，不再按仓库分子目录。

> 原文写作时环境为 CentOS 7；本节 RHEL 9 行为为 2026-09 实测补充（rockylinux:9 容器，dnf 4.x），两代系统的差异以实测为准。

## 场景二：只下载某个包及其依赖

不更新全系统，只想把某个软件包先拉到本地（比如给离线机器装 nginx）：

```bash
sudo yum install --downloadonly --downloaddir=/opt/pkgs/ nginx
```

注意 `--downloadonly` 会连带下载全部依赖——离线安装时这批依赖缺一不可，所以一定要用 `--downloaddir` 收拢到一个目录，别去默认缓存路径里一个个仓库翻。

## 场景三：维护窗口执行本地安装

包已就位后，窗口里的安装走本地目录，不再产生下载流量：

```bash
sudo yum localinstall /opt/updates/*.rpm
```

localinstall 会自动处理目录内 rpm 的依赖关系；若还有目录外的依赖（下载时漏了），它会尝试从仓库补齐——离线环境这一步会失败，提前用 `yum deplist` 核对依赖清单。

## 参数速查

| 参数 | 作用 | 示例 |
|------|------|------|
| `--downloadonly` | 只下载不安装 | `yum update --downloadonly` |
| `--downloaddir=路径` | 指定下载目录 | `--downloaddir=/opt/updates/` |
| `--resolve`（dnf） | 连带下载缺失依赖 | `dnf download --resolve nginx` |
| `yumdownloader`（yum-utils） | 单包下载工具，CentOS 7 另一选择 | `yumdownloader --destdir=/opt nginx` |

CentOS 7 上若嫌插件麻烦，`yum-utils` 包里的 `yumdownloader` 也能干类似的事，两者可并存。

## 注意事项

- DownloadOnly 只下载不安装，更新并没有生效；真正升级仍要在维护窗口执行 `yum update` 或 `yum localinstall`。
- CentOS 7 依赖 yum-plugin-downloadonly 插件，没装插件直接加 `--downloadonly` 会报"No such option"；RHEL 8/9 系 dnf 原生支持，无需插件。
- 默认下载位置在 `/var/cache/yum/` 深处且按仓库分目录，要人工拷贝归档时用 `--downloaddir` 指到专门目录更省事。
- 下载的包与系统架构、版本绑定：CentOS 7 的 x86_64 包不能拿去装 CentOS 8，离线复用前先确认目标机器环境一致。
- 下载完成 ≠ 校验完成，安装前 `rpm -K *.rpm` 过一遍 GPG 签名，防止传输损坏或被篡改。

把"传输"挪到低峰、把"变更"留在窗口，DownloadOnly 这一个选项就能把维护窗口的时长砍掉大半——记住 CentOS 7 要装插件、RHEL 8/9 原生支持这个差异，两代系统上都能用对。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。