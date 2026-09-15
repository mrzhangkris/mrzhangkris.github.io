---
title: "reposync：把 YUM 镜像源同步到本地"
date: 2020-04-10 23:10:19
updated: 2026-09-14
categories: [技术, 运维]
tags: [运维]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1569428034239-f9565e32e224?w=1600&q=80&fm=jpg
---

内网机器没法直连公网 YUM 源时，常见做法是找一台能上网的机器把整个仓库同步下来，再搭成本地源。`reposync` 干的就是这件事：把远端仓库的 rpm 包按 repoid 拉到本地目录。本文以 CentOS 6 时代的 yum-utils 写法为起点（原文环境），并在 Rocky Linux 9.3 容器（dnf 4.14）里逐条实测 dnf 时代的真实差异——结论有点反直觉：**兼容脚本还在、老参数大多能用，真正会翻车的是网上流传的 `--metadata` 选项名**。

## 整体流程

同步一个仓库到本地，四步：装工具 → 建目录 → 查 repoid → 执行同步。同步完还要 createrepo 生成元数据，客户端才能把它当仓库用。

## 下载工具包

`reposync` 命令所在的工具包，两代系统名字不同：

```bash
# CentOS 6/7（yum 时代）
yum install -y yum-utils

# RHEL 8/9（dnf 时代）
dnf install -y dnf-utils
```

验证：CentOS 6/7 上 `reposync --help` 有输出；Rocky 9 容器实测，装完 dnf-utils 后独立 `reposync` 命令**仍然存在**（`/usr/bin/reposync` 是指向 `/usr/libexec/dnf-utils` 的兼容脚本），`dnf reposync` 子命令也同时可用，两条路都能走。

## 创建下载目录

先建好存放目录，本地下载的 rpm 包都会落在这里：

```bash
mkdir -p /data1/centos/$releasever
```

`$releasever` 是 YUM/DNF 的系统版本变量，执行时会替换成当前系统的主版本号（CentOS 6 → 6，Rocky 9 → 9），不同版本的包天然分目录存放。注意这个变量在 shell 里直接展开是空的——它由 yum/reposync 自己解析。要在 shell 层面拿到这个值，实测可用 `rpm -E %rhel`（Rocky 9 容器输出 `9`）；`/etc/dnf/vars/releasever` 这类文件在 Rocky 9 容器里并不存在，别指望它。

## 获取 repoid

要同步哪些仓库，得先知道它们的 repoid：

```bash
yum repolist      # CentOS 6/7
dnf repolist      # RHEL 8/9
```

输出示例（原文的 CentOS 6 环境）：

```text
Loaded plugins: fastestmirror, product-id, subscription-manager
Loading mirror speeds from cached hostfile
 * base: mirrors.aliyun.com
 * extras: mirrors.aliyun.com
 * updates: mirrors.aliyun.com
repo id      repo name                                    status
base         CentOS-6 - Base - mirrors.aliyun.com         6,713
epel         Extra Packages for Enterprise Linux 6        12,587
extras       CentOS-6 - Extras - mirrors.aliyun.com       47
updates      CentOS-6 - Updates - mirrors.aliyun.com      952
repolist: 20,299
```

从输出看，这台机器的 repoid 有 4 个：base、epel、extras、updates。**repoid 对应 `.repo` 配置文件里的 `[serverid]`**——方括号里那个名字就是它，用于区分各个仓库，必须独一无二；若重名，后面的会覆盖前面的。

## 同步存储库

把 4 个仓库一次同步下来，落到之前建好的目录：

```bash
reposync -n --repoid=base --repoid=epel --repoid=extras --repoid=updates \
  -p /data1/centos/$releasever
```

这条命令在做什么：

- `--repoid` 指定要同步的仓库，可以写一个也可以写多个（前提是下载目录一致）；
- `-p` 指定目标路径；
- `-n` 即 `--newest`，只下载每个软件包的最新版本，跳过旧版本，能省下大量磁盘空间。

执行时 reposync 会自动在目标路径下按 repoid 建同名目录，包就分仓库躺在各自目录里。Rocky 9 容器上的实测（自建 3 个 rpm 的本地小仓库，机制与公网源一致）：

![配图1：dnf reposync 同步成功](/images/csdn/figures/reposync-csdn105444446-1.png)

## dnf 时代的真实差异（Rocky 9 实测）

先说反直觉的结论：CentOS 6 时代的老命令 `reposync -n --repoid=X -p PATH` 在 Rocky 9 上**原样能跑**——dnf-utils 提供的兼容脚本把 yum 时代的参数原样翻译给 dnf。真正会失败的是"以讹传讹"的 `--metadata`，实测报错：

![配图2：--metadata 参数陷阱](/images/csdn/figures/reposync-csdn105444446-2.png)

`--metadata` 被 argparse 的前缀匹配解析成了 `--metadata-path`（一个需要参数的选项），于是报 `expected one argument`。正确的选项名是 `--download-metadata`。逐项对照实测结果：

| 用途 | CentOS 6/7（yum-utils） | Rocky 9（dnf 4.14 实测） |
|------|------------------------|------------------------|
| 调用方式 | `reposync` | `reposync`（兼容脚本）与 `dnf reposync` 都可用 |
| 只拉最新包 | `-n` / `--newest` | `-n`（帮助原文即 `-n, --newest-only`），两种写法实测均可 |
| 目标路径 | `-p PATH` | `-p PATH`（`--download-path`），兼容 |
| repodata 一起同步 | 需手动 createrepo | `--download-metadata`（不是 `--metadata`） |

Rocky 9 版本的等价命令：

```bash
dnf reposync --repoid=baseos --repoid=appstream \
  --download-path=/data1/rocky/9 --newest-only --download-metadata
```

`--download-metadata` 是 dnf 版的贴心之处：repodata 一起同步下来，省掉 createrepo 一步（yum 时代要自己跑 `createrepo /data1/centos/6/base`；Rocky 9 上该命令由 createrepo_c 包提供，`/usr/bin/createrepo` 也还在）。

## 同步之后：元数据与消费验证

yum 时代的同步产物只有 rpm，客户端要能把它当仓库用，还得在同步目录里生成元数据：

```bash
createrepo /data1/centos/6/base
```

然后在客户端配 .repo 文件指向这个目录（file:// 或 http://）。dnf 版加了 `--download-metadata` 的话这步可省。最后做一次消费验证才算闭环——实测从同步副本直接装包成功：

![配图3：从同步副本安装](/images/csdn/figures/reposync-csdn105444446.png)

## 注意事项

- 仓库多大，同步时间就有多长——base 加 epel 这类大仓库首次同步动辄几十 GB、数小时，建议 `nohup ... &` 放后台执行，断点续传靠再跑一次（reposync 会跳过已存在且未变化的包）。
- `-n`（--newest-only）只拉最新包；如果本地源要照顾混布旧包的场景（老应用依赖特定旧版本），评估好再去掉这个参数——全量历史的体积会大很多。
- 同步完成后记得生成/同步元数据（createrepo 或 --metadata），只有 rpm 没有 repodata 的目录客户端认不了。
- 磁盘空间提前算好：`dnf repolist` 的 status 列是包数量，粗估体积可以 `dnf repoquery --repoid=X --qf '%{downloadsize}' | awk '{s+=$1}END{print s/1024/1024 " MB"}'`。
- 定期增量同步用 cron 安排（每天低峰跑一次），reposync 天然幂等，重跑只拉新增和变更。
- 本文 CentOS 6/7 命令沿用原文（yum-utils 1.x，环境已 EOL 未实跑）；Rocky 9 部分为 rockylinux:9 容器（dnf 4.14）实测，含自建仓库、同步、元数据与消费闭环（从同步副本成功安装 tree 包）。

reposync 的价值就一句话：公网源进不来，就把源搬进来。Rocky 9 实测给出的三个抓手：兼容脚本还在（老命令不慌）、repodata 用 `--download-metadata` 同步（别写 `--metadata`）、同步完用 `--repofrompath` 做一次安装验证——内网源这件事就闭环了。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。