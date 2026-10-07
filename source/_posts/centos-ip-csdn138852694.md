---
title: "Rocky Linux 9 配置静态 IP 与多网卡路由策略（附 CentOS 7 差异）"
date: 2024-05-16 08:30:00
updated: 2026-09-14
categories: [技术, Linux]
tags: [Linux]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1610563166150-b34df4f3bcd6?w=1600&q=80&fm=jpg
---

服务器要长期对外提供服务，IP 就不能漂：DHCP 租约一续，地址一变，远程访问、DNS 解析、防火墙白名单跟着全断。这篇把 RHEL 9 系（Rocky Linux 9）上配静态 IP 的完整做法记录下来——单网卡怎么配、多网卡时默认出口选谁、特定网段的流量怎么指到指定网卡，以及两处最容易翻车的地方。全部步骤在 Rocky Linux 9.3 容器里实跑过，文末附 CentOS 7 的 ifcfg 时代差异对照。

## 核心机制一句话

RHEL 9 起网络由 NetworkManager 统一管理：一条 `nmcli connection` 命令对应一份落盘在 `/etc/NetworkManager/system-connections/*.nmconnection` 的 keyfile 配置，`nmcli con up` 让它生效；多网卡分流靠连接配置里的 `ipv4.routes`（CentOS 7 时代是 route-ethN 文件）。运行时验证始终是 `ip addr` 加 `ip route show`。

## 实验环境

- 操作系统：Rocky Linux 9.3 容器（NetworkManager 1.54.3、iproute 6.17，aarch64）
- 容器默认没有 systemd，本文用 `dbus-daemon --system` 手工拉起总线、再前台运行 `NetworkManager --no-daemon` 等价模拟；真实服务器上 NM 随系统自启，直接用 nmcli 即可
- 路由实验涉及内核路由表改动，容器需加 `--cap-add NET_ADMIN` 启动
- 容器里没有第二块物理网卡，用 `ip link add eth1 type dummy` 创建虚拟网卡扮演对内接口，配置方法与真实网卡完全一致

## 实例一：单网卡静态 IP

先看最简单的场景：一块 eth0，固定为 192.168.1.100，网关 192.168.1.1。nmcli 一条命令建好连接配置，地址、网关、DNS 一次给全：

```bash
nmcli con add type ethernet con-name static-eth0 ifname eth0 \
  ipv4.method manual ipv4.addresses 192.168.1.100/24 \
  ipv4.gateway 192.168.1.1 ipv4.dns 8.8.8.8
```

`ipv4.method manual` 就是静态 IP 的开关——相当于 CentOS 7 ifcfg 里的 `BOOTPROTO=none`；写成 `auto` 则走 DHCP，手工地址项会被忽略。命令执行的同时，配置已经落盘成 keyfile：

![配图1](/images/csdn/figures/centos-ip-csdn138852694-1.png)

这份 keyfile 就是 RHEL 9 上的"配置文件"，重启后依然有效；想改就继续用 `nmcli con mod`，不要手编文件。激活并验证：

```bash
nmcli con up static-eth0
ip -4 addr show eth0
ip route show
```

![配图2](/images/csdn/figures/centos-ip-csdn138852694-2.png)

验证点：`ip addr` 能看到 192.168.1.100，`ip route show` 里默认路由指向 192.168.1.1，`ping 192.168.1.1` 通，配置才算落地。远程操作时建议新开一个会话再断开旧连接——`con up` 替换地址的一瞬间，旧会话就会失联。

## 实例二：多网卡分工

服务器插两块网卡时的原则：**对外接口配网关，对内接口只配地址**。

eth0 连互联网，配置同实例一（static-eth0，含网关）。eth1 连内网 10.0.0.0/24，只配地址：

```bash
nmcli con add type ethernet con-name inner-eth1 ifname eth1 \
  ipv4.method manual ipv4.addresses 10.0.0.100/24
```

为什么 eth1 不配网关：Linux 的路由表里默认路由只能有一条有效，两块网卡各配一个网关，会出现两条默认路由，出流量走哪条看内核选择的度量值，结果就是时通时不通。需要走 eth1 的流量，用下一节的路由明确指过去。

## 实例三：按网段分流

让 10.1.1.0/24 的流量固定走 eth1，下一跳 10.0.0.1。RHEL 9 上不再建 route-eth1 文件，直接往连接配置里追加一条路由：

```bash
nmcli con mod inner-eth1 +ipv4.routes "10.1.1.0/24 10.0.0.1"
nmcli con up inner-eth1
```

![配图3](/images/csdn/figures/centos-ip-csdn138852694-3.png)

`+ipv4.routes` 的加号表示追加（不加号是整体替换，会把已有路由清掉，批量配路由时尤其小心）。落盘的 keyfile 里就是一行 `route1=10.1.1.0/24,10.0.0.1`，逗号前是目标网段、后是下一跳。验证点是 `ip route show` 里能看到这一行，再从本机 `ping 10.1.1.x` 确认走 eth1 出去。

这条语法可以直接用 ip 命令在运行中的系统上预检，不必等配置生效——下一跳不合法时内核立刻报错：

![配图4](/images/csdn/figures/centos-ip-csdn138852694-4.png)

## 错误写法对比

**错误一：两块网卡都配网关。** 表面看"每块网卡都该有自己的网关"，实际产生两条默认路由，出流量方向不稳定，表现为"内网通、外网时通时断"。正确做法是网关只写在对外接口的连接配置上，对内接口只给 `ipv4.addresses`。

**错误二：routes 的下一跳随手填。** 往 inner-eth1 上写 `+ipv4.routes "10.1.1.0/24 192.168.1.1"`，下一跳不在 eth1 的网段内，`con up` 时这条路由装不进内核。正确做法是下一跳必须与该接口同网段可达，先按配图 4 用 `ip route add` 预检一遍，语法和行为都确认了再落到连接配置里。

## 历史版本差异（CentOS 7）

从 CentOS 7 迁移过来的读者，对照这张表：

| 项目 | CentOS 7（network-scripts） | Rocky Linux 9（NetworkManager） |
|------|---------------------------|-------------------------------|
| 地址配置 | 编辑 `ifcfg-ethN`，`BOOTPROTO=none` + `IPADDR` | `nmcli con add ... ipv4.method manual` |
| 网关 | ifcfg 里 `GATEWAY=`（全局只写一份） | 连接配置里 `ipv4.gateway`（同样只写一份） |
| 静态路由 | `route-ethN` 文件写 `via` 行 | `nmcli con mod +ipv4.routes` |
| 生效方式 | `systemctl restart network` | `nmcli con up <连接名>` |
| 配置文件 | `/etc/sysconfig/network-scripts/ifcfg-*` | `/etc/NetworkManager/system-connections/*.nmconnection` |

实跑确认：Rocky 9 的 `/etc/sysconfig/network-scripts/` 目录里只剩一份 `readme-ifcfg-rh.txt`，network-scripts 包已不存在，`systemctl restart network` 这个单元也没有了。ifcfg 格式 NetworkManager 仍兼容读取（细节见那份 readme），但新配置一律建议走 nmcli。语法层面 `ip route` 的 via 写法两个时代完全一致，route-ethN 的行可以直接搬进 `ipv4.routes`（把空格换逗号）。

## 注意事项

- 远程改网络配置前，先备份 keyfile（`cp /etc/NetworkManager/system-connections/xxx.nmconnection{,.bak}`），并保留一个当前会话之外的后手（控制台/iLO）——`con up` 失败或地址写错，SSH 当场失联。
- keyfile 默认权限 600，手工补文件时别放宽成 644，里面可能含密钥类字段。
- `nmcli con mod` 带加号的参数是追加、不带是覆盖；`ipv4.routes` 被误覆盖时，把整组路由一次性重写回去即可。
- 容器里复现这套实验需要 `--cap-add NET_ADMIN`；不加的话 `ip route add` 会报 `RTNETLINK answers: Operation not permitted`，那是能力位缺失，不是语法问题。
- 排查连接状态用 `nmcli con show`（看配置）加 `nmcli device status`（看设备实际归谁管），两边的连接名对上才算配置绑定到了网卡。

## 小结

回到开头的场景：让 IP 不漂，靠 `ipv4.method manual` + 一份 keyfile；多网卡不迷路，靠唯一的网关加 `ipv4.routes` 精确分流。配完 `nmcli con up` 生效，`ip addr` 和 `ip route show` 双验证；从 CentOS 7 过来的老配置，按文末对照表把 ifcfg 三件套翻译成 nmcli 命令就行。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
