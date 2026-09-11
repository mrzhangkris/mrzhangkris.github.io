---
title: "reposync：把 YUM 镜像源同步到本地"
date: 2020-04-10 23:10:19
updated: 2026-09-11
categories: [技术]
tags: [运维]
copyright_author: 司南
cover: /images/csdn/covers/reposync-csdn105444446.png
---

内网机器没法直连公网 YUM 源时，常见做法是找一台能上网的机器把整个仓库同步下来，再搭成本地源。`reposync` 干的就是这件事：把远端仓库的 rpm 包按 repoid 拉到本地目录。整个流程分四步——装工具、建目录、查 repoid、执行同步。

### 下载工具包

`reposync` 命令在 yum-utils 工具包里：

```bash
[root@localhost ~]# yum install -y yum-utils
```

### 创建下载目录

先建好存放目录，本地下载的 rpm 包都会落在这里：

```bash
[root@localhost ~]# mkdir -p /data1/centos/$releasever
```

`$releasever` 是 YUM 的系统版本变量，执行时会替换成当前系统的主版本号，这样不同版本的包天然分目录存放。

### 获取 repoid

要同步哪些仓库，得先知道它们的 repoid：

```bash
[root@localhost data1]# yum repolist
Loaded plugins: fastestmirror, product-id, subscription-manager
This system is not registered to Red Hat Subscription Management. You can use subscription-manager to register.
Loading mirror speeds from cached hostfile
 * base: mirrors.aliyun.com
 * extras: mirrors.aliyun.com
 * updates: mirrors.aliyun.com
repo id                                                        repo name                                                                                              status
base                                                           CentOS-6 - Base - mirrors.aliyun.com                                                                    6,713
epel                                                           Extra Packages for Enterprise Linux 6 - x86_64                                                         12,587
extras                                                         CentOS-6 - Extras - mirrors.aliyun.com                                                                     47
updates                                                        CentOS-6 - Updates - mirrors.aliyun.com                                                                   952
repolist: 20,299
```

从输出看，这台机器的 repoid 有 4 个：base、epel、extras、updates。repoid 对应 `.repo` 配置文件里的 `[serverid]`——用于区分各个不同的 repository，必须独一无二，若重名，后面的会覆盖前面的。

### 同步存储库

![配图](/images/csdn/figures/reposync-csdn105444446.png)

把 4 个仓库一次同步下来，落到之前建好的目录：

```bash
[root@localhost ~]# reposync -n --repoid=base --repoid=epel --repoid=extras --repoid=updates -p /data1/centos/$releasever
```

这条命令在做什么：`--repoid` 指定要同步的仓库，可以写一个也可以写多个（前提是下载目录一致）；`-p` 指定目标路径；`-n` 即 `--newest`，只下载每个软件包的最新版本，跳过旧版本，能省下大量磁盘空间。执行时 reposync 会自动在目标路径下按 repoid 建同名目录，包就分仓库躺在各自目录里。

## 注意事项

- 仓库多大，同步时间就有多长，base 加 epel 这类大仓库首次同步建议放在后台执行。
- `-n` 只拉最新包；如果本地源要照顾混布旧包的场景，评估好再去掉这个参数。
- 同步完成后记得 `createrepo` 生成元数据，客户端才能把它当仓库用（本文只覆盖同步环节）。
- 磁盘空间提前算好，仓库全量同步动辄几十 GB。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
