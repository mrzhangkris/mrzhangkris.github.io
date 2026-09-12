---
title: "CentOS 手动配置静态 IP 与多网卡路由策略"
date: 2024-05-16 08:30:00
updated: 2026-09-11
categories: [技术]
tags: [Linux]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1610563166150-b34df4f3bcd6?w=1600&q=80&fm=jpg
---

服务器要长期对外提供服务，IP 就不能漂：DHCP 租约一续，地址一变，远程访问、DNS 解析、防火墙白名单跟着全断。这篇把 CentOS 上配静态 IP 的完整做法记录下来——单网卡怎么配、多网卡时默认出口选谁、特定网段的流量怎么指到指定网卡，以及两处最容易翻车的地方。

> 适用范围：CentOS 7/8 的 network-scripts 配置机制。文中路由语法实测自 Rocky Linux 9 容器（iproute2），CentOS 7 的 ip 命令行为一致。

## 核心机制一句话

静态 IP 由三样东西决定：`/etc/sysconfig/network-scripts/ifcfg-ethN` 定义每块网卡的地址，`GATEWAY` 全局只能有一个，`route-ethN` 文件负责把额外网段指到指定网卡。改完 `systemctl restart network` 生效。

## 实例一：单网卡静态 IP

先看最简单的场景：一块 eth0，固定为 192.168.1.100，网关 192.168.1.1。

编辑 `/etc/sysconfig/network-scripts/ifcfg-eth0`：

```conf
DEVICE=eth0
BOOTPROTO=none
ONBOOT=yes
IPADDR=192.168.1.100
NETMASK=255.255.255.0
GATEWAY=192.168.1.1
DNS1=8.8.8.8
```

四个关键项：`BOOTPROTO=none` 表示不走 DHCP，地址全部手工指定，写成 dhcp 会把其余地址项覆盖掉；`ONBOOT=yes` 让网卡随网络服务启动；`IPADDR`/`NETMASK` 是地址本体；`GATEWAY` 和 `DNS1` 也可以写在这里，单网卡时最省事。

重启网络并验证：

```bash
systemctl restart network
ip addr show eth0
```

验证点：`ip addr` 能看到 192.168.1.100，`ping 192.168.1.1` 通，配置才算落地。

## 实例二：多网卡分工

服务器插两块网卡时的原则：**对外接口配网关，对内接口只配地址**。

eth0 连互联网，配静态 IP 和网关：

```conf
DEVICE=eth0
BOOTPROTO=none
ONBOOT=yes
IPADDR=192.168.1.100
NETMASK=255.255.255.0
GATEWAY=192.168.1.1
DNS1=8.8.8.8
```

eth1 连内网，只配地址，不写 GATEWAY：

```conf
DEVICE=eth1
BOOTPROTO=none
ONBOOT=yes
IPADDR=10.0.0.100
NETMASK=255.255.255.0
```

为什么 eth1 不配网关：Linux 的路由表里默认路由只能有一条有效，两块网卡各配一个 GATEWAY，会出现两条默认路由，出流量走哪条看内核选择的度量值，结果就是时通时不通。需要走 eth1 的流量，用下一条策略路由明确指过去。

## 实例三：按网段分流

让 10.1.1.0/24 的流量固定走 eth1，下一跳 10.0.0.1：

```bash
echo "10.1.1.0/24 via 10.0.0.1 dev eth1" >> /etc/sysconfig/network-scripts/route-eth1
systemctl restart network
ip route show
```

route-ethN 的文件名必须带网卡后缀，网络服务按接口加载这些文件；文件不存在就新建。验证点是 `ip route show` 里能看到这一行，再从本机 `ping 10.1.1.x` 走 eth1 出去。

这条语法可以直接用 ip 命令在运行中的系统上验证，不必等重启。实测（Rocky Linux 9 容器）：


下一跳合法时路由立即生效、`ip route show` 可见；下一跳与本机接口不在同一网段时，内核直接拒绝并报 `Nexthop has invalid gateway`——route-eth1 文件里的错误配置在重启网络时同样不会生效，问题被静默掩盖，不如先用 ip 命令试一遍。

## 错误写法对比

**错误一：两块网卡都写 GATEWAY。** 表面看"每块网卡都该有自己的网关"，实际产生两条默认路由，出流量方向不稳定，表现为"内网通、外网时通时断"。正确做法是 GATEWAY 只写在对外接口上。

**错误二：via 的下一跳随手填。** route-eth1 里写 `via 192.168.1.1`（eth0 的网关），下一跳不在 eth1 的网段内，路由加载不了也不报明显错误。正确做法是 via 必须与该接口同网段可达，先 `ip route add` 手工验证再落文件。

## 注意事项

- 改配置前先备份原 ifcfg 文件，远程操作时留一个当前会话之外的后手——配置错了网络服务起不来，远程就直接失联了。
- `BOOTPROTO=none` 是静态 IP 的关键项；`BOOTPROTO=dhcp` 与手工 IPADDR 共存时行为不可预期。
- route-ethN 文件属主和权限照搬同目录的 ifcfg 文件即可（root:root 644），权限异常会导致启动时加载失败。
- CentOS 8 起官方转向 NetworkManager（nmcli/nmtui 配置等效），network-scripts 被弃用；这套文件在 CentOS 7 上最稳，CentOS 8 建议改用 `nmtui` 完成同样的配置。

## 小结

回到开头的场景：让 IP 不漂，靠 ifcfg 文件里的 `BOOTPROTO=none`；多网卡不迷路，靠唯一的 GATEWAY 加 route-ethN 精确分流。三份文件各司其职，改完重启网络、`ip addr` 和 `ip route show` 双验证，静态 IP 和分流策略就都稳了。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
