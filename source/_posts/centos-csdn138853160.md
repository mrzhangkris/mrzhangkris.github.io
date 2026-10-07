---
title: "Rocky Linux 9 查看网卡速率：ethtool、ifconfig、nmcli 三种方法"
date: 2024-05-16 09:07:41
updated: 2026-09-14
categories: [技术, Linux]
tags: [Linux]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?w=1600&q=80&fm=jpg
---

排查网络问题时，第一件事是确认网卡实际协商到了什么速率——链路灯亮着不代表跑在预期带宽上，千兆口协商成百兆、自协商失败降速，这类问题在机房里并不少见。Linux 下查网卡信息有三个常用入口：ethtool 看链路层速率，ifconfig（或它的现代替代 `ip addr`）看接口状态，nmcli 看 NetworkManager 管理下的设备详情。这篇按"想看什么"来组织，对号入座即可。

文中全部输出实测自 Rocky Linux 9.3 容器（ethtool 6.15、net-tools 2.0、iproute 6.17、NetworkManager 1.54.3，aarch64）。CentOS 7/8/9、RHEL 系上命令和字段相同，数值因环境而异。

## 想看协商速率和双工：用 ethtool

ethtool 直接向网卡驱动查询链路层状态，是看速率的首选。Rocky Linux 9 最小安装默认不带，把这篇用到的 ethtool 和 net-tools 一起装上：

```bash
dnf install -y ethtool net-tools
```

![配图1](/images/csdn/figures/centos-csdn138853160-1.png)

> 注：Rocky 9 的 `dnf` 与 CentOS 7 的 `yum` 用法兼容，把命令里的 dnf 换成 yum 在 CentOS 7 上同样有效。

然后查询指定接口（本文统一以 eth0 为例，接口名按实际替换）：

```bash
ethtool eth0
```

![配图2](/images/csdn/figures/centos-csdn138853160-2.png)

完整输出很长，排障时最先看的是四个字段：

- **Speed**：当前协商速率，10000Mb/s 就是万兆链路。千兆网卡显示 100Mb/s，先查网线和对端端口，而不是先动系统。
- **Duplex**：双工模式。Full 是全双工；显示 Half 时链路上容易出现冲突丢包，通常是自协商失败降级的结果。
- **Auto-negotiation**：自协商是否开启。两端配置必须一致，一端固定、一端自协商是最常见的配置坑。
- **Link detected**：链路是否连通。显示 no 时先换网线，再查交换机端口。

> 注：配图 2 输出末尾多一行 `netlink error: Operation not permitted`，这是容器缺特权位导致的，物理机上没有，不影响字段判读。

装驱动、对网卡型号时再补一条 `ethtool -i eth0`，`driver` 字段直接给出驱动名——容器里是 veth，物理机上常见的有 igb、e1000、ixgbe、virtio_net：

![配图3](/images/csdn/figures/centos-csdn138853160-3.png)

除了查询，ethtool 也能临时改协商参数（`ethtool -s eth0 speed 1000 duplex full`），但排障时更常用的还是只读查询——改参数属于变更操作，要有变更记录，且重启后失效，固化要走连接配置（见文末注意事项）。

## 想快速确认接口状态：用 ifconfig

ifconfig 回答的是"这个接口起来没有、地址对不对"：IP、掩码、广播地址、MTU，加上收发包计数，一次看全：

```bash
ifconfig eth0
```

![配图4](/images/csdn/figures/centos-csdn138853160-4.png)

eth0 行的 flags 里 `UP,RUNNING` 表示接口已启用且链路正常；`inet` 行是 IPv4 地址和掩码；`RX/TX packets` 是收发计数。如果 `RX errors` 在持续增长，说明链路层有问题，再回头用 ethtool 查速率和双工。

两点提醒：ifconfig 属于 net-tools 包，CentOS 7 到 Rocky 9 的最小安装默认都没有，开头那条 dnf 已经一起装了；这个包本身已经很多年不更新，新系统上更推荐 iproute2 的等价命令——`ip addr` 看地址，`ip -s link` 看计数，后者输出的口径和 ifconfig 一致：

```bash
ip -s link show eth0
```

![配图5](/images/csdn/figures/centos-csdn138853160-5.png)

## NetworkManager 环境看设备全貌：用 nmcli

RHEL 7 系以后默认由 NetworkManager 管理网络，nmcli 是它的命令行入口。`nmcli device show` 会把设备的类型、驱动、MAC、IPv4 配置全部列出来：

```bash
nmcli device show eth0
```

这个命令依赖 NetworkManager 守护进程在跑。容器里装了 NetworkManager 包（1.54.3）但没有起守护进程，实测直接报错：

![配图6](/images/csdn/figures/centos-csdn138853160-6.png)

在正常的服务器上（NM 运行中），输出比前两条命令都长，适合做一次完整的设备盘点。按 nmcli(1) 手册，`GENERAL.DRIVER` 字段是网卡驱动名（和 `ethtool -i` 的 driver 一致），装驱动、调参数时用得上；`IP4.ADDRESS[1]` 是当前生效的地址，比翻配置文件快。它还有一个不可替代的用途：改完连接配置（`nmcli con ...`）之后，用同一条命令核对配置与实际状态是否一致。

## 命令速查

| 命令 | 看什么 | 典型场景 |
| --- | --- | --- |
| `ethtool eth0` | 速率、双工、自协商、链路 | 带宽不达预期、丢包排查 |
| `ethtool -i eth0` | 驱动名、固件版本 | 对网卡型号、装驱动前确认 |
| `ifconfig eth0` | IP、掩码、MTU、收发计数 | 快速确认接口状态与地址 |
| `ip addr` / `ip -s link` | 地址与接口状态（含计数） | 新系统上替代 ifconfig |
| `nmcli device show eth0` | 驱动、MAC、完整 IPv4 配置 | NetworkManager 环境设备盘点 |

## 历史版本差异（CentOS 7）

从 CentOS 7 过来的读者，这篇的三个命令本身没有变化，差异在周边：

- **安装命令**：`yum` → `dnf`，用法兼容直接替换；CentOS 7 已 EOL，官方源下线，需切 vault 源才能装包。
- **网卡命名**：CentOS 7 起一致命名普及（ens192、ens33 这类），不再是 eth0——先 `ip link` 列出实际接口名再替换。
- **net-tools 缺省**：CentOS 7 最小安装同样不带 ifconfig，新老系统一致；不同的是新系统上官方推荐位置已让给 iproute2。

## 注意事项

- 接口名按实际环境替换。RHEL 8/9 上偶有自定义命名规则残留，以 `ip link` 的实际输出为准，不要照抄 eth0。
- 速率不对先怀疑物理层。Speed 偏低、Duplex 显示 Half，优先检查网线、光模块和对端交换机端口，系统层面的排查放在后面。
- 固定速率要落到配置里才算数。`ethtool -s` 是临时的，重启即丢；固化要写进连接配置（nmcli 的 ethtool 相关设置项），且两端必须同时固定——只固定一端，链路要么起不来要么降速。
- 脚本里取 IP 建议用 `ip -4 addr show eth0` 配合 grep 解析，比依赖 ifconfig 稳。
- 容器里测网卡参数意义有限：veth 的速率/双工是宿主给的虚拟值，容量规划以物理机实测为准。

## 小结

排查带宽问题，先用 ethtool 确认链路协商到了什么速率（`-i` 补驱动信息），再用 ifconfig 或 `ip -s link` 确认接口和地址，NetworkManager 环境下 nmcli 能给出一台设备的完整档案。三个入口各管一层，按"想看什么"取用即可。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
