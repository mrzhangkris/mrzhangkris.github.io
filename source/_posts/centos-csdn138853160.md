---
title: "如何在 CentOS 中查看网卡速率：ethtool、ifconfig、nmcli 三种方法"
date: 2024-05-16 09:07:41
categories: [技术]
tags: [Linux]
copyright_author: 司南
cover: /images/csdn/covers/centos-csdn138853160.png
updated: 2026-09-11
---

排查网络瓶颈时，第一件事往往是确认网卡实际协商出来的速率——光靠 ping 通不代表链路跑在了预期的带宽上。CentOS 下有三种常用方法，下面依次过一遍。

## 用 ethtool 查看协商速率

ethtool 是查询和控制网络设备驱动与硬件设置的通用工具，看链路速率首选它。

系统里没有的话先安装：

```bash
sudo yum install ethtool
```

然后查询指定接口（本文以 eth0 为例）：

![配图](/images/csdn/figures/centos-csdn138853160.png)

```bash
ethtool eth0
```

输出会给出网卡当前的速度、双工状态，以及是否启用了自动协商。

## 用 ifconfig 看接口基本信息

ifconfig 主要用来配置网络接口参数，也能查看接口的运行状态：

```bash
ifconfig eth0
```

输出包括 IP 地址、掩码、广播地址和 MTU 等信息。这里看到的是接口层状态，链路速率还是要用 ethtool 查。

## 用 nmcli 查设备详情

nmcli 是 NetworkManager 的命令行界面，同样能提供接口状态信息：

```bash
nmcli device show eth0
```

这条命令会列出更多细节，比如设备类型、驱动信息、IPv4 配置等。

## 小结

- 查协商速率用 `ethtool eth0`，输出里有速度、双工、自动协商三项关键状态。
- ifconfig 适合快速确认接口状态（IP、MTU），不展示链路速率。
- nmcli 适合在 NetworkManager 管理的机器上看完整设备信息。
- ethtool 未安装时先 `sudo yum install ethtool`。
- 接口名按实际环境替换，本文统一以 eth0 为例。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
