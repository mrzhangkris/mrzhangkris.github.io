---
title: "CentOS 查看网卡速率：ethtool、ifconfig、nmcli 三种方法"
date: 2024-05-16 09:07:41
updated: 2026-09-11
categories: [技术]
tags: [Linux]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?w=1600&q=80&fm=jpg
---

排查网络问题时，第一件事是确认网卡实际协商到了什么速率——链路灯亮着不代表跑在预期带宽上，千兆口协商成百兆、自协商失败降速，这类问题在机房里并不少见。CentOS 下查网卡信息有三个常用入口：ethtool 看链路层速率，ifconfig 看接口状态，nmcli 看 NetworkManager 管理下的设备详情。这篇按"想看什么"来组织，对号入座即可。

> 注：文中输出实测自 Rocky Linux 9 容器（ethtool 6.15、net-tools 2.0）。CentOS 7/8 上字段相同，数值因环境而异。

## 想看协商速率和双工：用 ethtool

ethtool 直接向网卡驱动查询链路层状态，是看速率的首选。系统里没有就先装：

```bash
sudo yum install ethtool
```

然后查询指定接口（本文统一以 eth0 为例，接口名按实际替换）：


输出里四个字段是排障时最先看的：

- **Speed**：当前协商速率，10000Mb/s 就是万兆链路。千兆网卡显示 100Mb/s，先查网线和对端端口，而不是先动系统。
- **Duplex**：双工模式。Full 是全双工；显示 Half 时链路上容易出现冲突丢包，通常是自协商失败降级的结果。
- **Auto-negotiation**：自协商是否开启。两端配置必须一致，一端固定、一端自协商是最常见的配置坑。
- **Link detected**：链路是否连通。显示 no 时先换网线，再查交换机端口。

除了查询，ethtool 也能临时改协商参数（`ethtool -s eth0 speed 1000 duplex full`），但排障时更常用的还是只读查询——改参数属于变更操作，要有变更记录。

## 想快速确认接口状态：用 ifconfig

ifconfig 回答的是"这个接口起来没有、地址对不对"：IP、掩码、广播地址、MTU，加上收发包计数，一次看全。

```bash
ifconfig eth0
```

eth0 行的 flags 里 `UP,RUNNING` 表示接口已启用且链路正常；`inet` 行是 IPv4 地址和掩码；`RX/TX packets` 是收发计数。如果 `RX errors` 在持续增长，说明链路层有问题，再回头用 ethtool 查速率和双工。

两点提醒：ifconfig 属于 net-tools 包，CentOS 7 最小安装默认没有，需要 `sudo yum install net-tools`；这个包已经停止维护，新系统上更推荐 `ip addr`，输出信息等价。

## NetworkManager 环境看设备全貌：用 nmcli

CentOS 7 及以后默认由 NetworkManager 管理网络，nmcli 是它的命令行入口。`nmcli device show` 会把设备的类型、驱动、MAC、IPv4 配置全部列出来：

```bash
nmcli device show eth0
```

输出比前两条命令都长，适合在服务器上做一次完整的设备盘点。`GENERAL.DRIVER` 字段能看到网卡驱动名（virtio_net、igb、e1000 之类），装驱动、调参数时用得上；`IP4.ADDRESS[1]` 则是当前生效的地址，比翻配置文件快。

> 注：nmcli 依赖 NetworkManager 运行，容器环境无法实测，字段以官方手册 nmcli(1) 为准。

## 命令速查

| 命令 | 看什么 | 典型场景 |
| --- | --- | --- |
| `ethtool eth0` | 速率、双工、自协商、链路 | 带宽不达预期、丢包排查 |
| `ifconfig eth0` | IP、掩码、MTU、收发计数 | 快速确认接口状态与地址 |
| `nmcli device show eth0` | 驱动、MAC、完整 IPv4 配置 | NetworkManager 环境设备盘点 |
| `ip addr` | 地址与接口状态 | 新系统上替代 ifconfig |

## 注意事项

- 接口名按实际环境替换。CentOS 7 起网卡名多为 ens192、ens33 这类一致命名，`ip link` 可以列出全部接口，不要照抄 eth0。
- 速率不对先怀疑物理层。Speed 偏低、Duplex 显示 Half，优先检查网线、光模块和对端交换机端口，系统层面的排查放在后面。
- 脚本里取 IP 建议用 `ip -4 addr show eth0` 配合 grep 解析，比依赖 ifconfig 稳。
- 固定速率时两端要同时固定。只固定一端，链路要么起不来要么降速，这在对接老设备时尤其容易踩。

## 小结

排查带宽问题，先用 ethtool 确认链路协商到了什么速率，再用 ifconfig 或 ip addr 确认接口和地址，NetworkManager 环境下 nmcli 能给出一台设备的完整档案。三个命令各管一层，按需取用。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
