---
title: "在CentOS上手动配置静态IP地址及多网卡路由策略"
date: 2024-05-16 08:30:00
categories: [技术]
tags: [Linux]
copyright_author: 司南
cover: /images/csdn/covers/centos-ip-csdn138852694.png
updated: 2026-09-11
---

服务器要长期对外提供服务，IP 就不能漂：DHCP 分配的地址一变，远程访问、DNS 解析跟着全断。这篇记录在 CentOS 上配静态 IP 的过程——单网卡怎么配、多网卡时默认出口选谁、以及怎么把特定网段的流量指到指定网卡。

## 多网卡的 IP 配置与默认路由选择

服务器插了多块网卡时，每块网卡的静态 IP 和路由都要单独交代清楚，通信才顺畅。

### 步骤 1：编辑网卡配置文件

CentOS 的网络接口配置文件都在 /etc/sysconfig/network-scripts/ 目录下，每张网卡对应一个 ifcfg-ethN 文件，用编辑器打开改即可。

eth0 作为对外接口，配静态 IP 和网关：

```bash
vi /etc/sysconfig/network-scripts/ifcfg-eth0
```

![配图](/images/csdn/figures/centos-ip-csdn138852694.png)

```conf
DEVICE=eth0
BOOTPROTO=none
ONBOOT=yes
IPADDR=192.168.1.100
NETMASK=255.255.255.0
GATEWAY=192.168.1.1
```

eth1 作为内网接口，只配地址不配网关：

```bash
vi /etc/sysconfig/network-scripts/ifcfg-eth1
```

```conf
DEVICE=eth1
BOOTPROTO=none
ONBOOT=yes
IPADDR=10.0.0.100
NETMASK=255.255.255.0
```

`BOOTPROTO=none` 表示不走 DHCP，地址全部手工指定。

### 步骤 2：指定默认网关

多网卡环境下只能选一个接口当出口，通常就是连互联网的那块：

```bash
echo "GATEWAY=192.168.1.1" >> /etc/sysconfig/network
```

### 步骤 3：按网段分流

通过路由表可以把特定流量固定到某块网卡上，比如让来自 10.1.1.0/24 的流量走 eth1：

```bash
echo "10.1.1.0/24 via 10.0.0.1 dev eth1" >> /etc/sysconfig/network-scripts/route-eth1
```

## 完整配置汇总

场景：eth0 连互联网（网关 192.168.1.1），eth1 连内部网络，10.1.1.0/24 的流量走 eth1。

ifcfg-eth0（对外接口，含静态 IP 与 DNS）：

```conf
DEVICE=eth0
BOOTPROTO=none
ONBOOT=yes
IPADDR=192.168.1.100
NETMASK=255.255.255.0
GATEWAY=192.168.1.1
DNS1=8.8.8.8
```

ifcfg-eth1：

```conf
DEVICE=eth1
BOOTPROTO=none
ONBOOT=yes
IPADDR=10.0.0.100
NETMASK=255.255.255.0
```

路由部分：

```bash
echo "GATEWAY=192.168.1.1" >> /etc/sysconfig/network
echo "10.1.1.0/24 via 10.0.0.1 dev eth1" >> /etc/sysconfig/network-scripts/route-eth1
```

## 注意事项

- 默认网关只在 eth0 上配置，eth1 不配 GATEWAY，避免出现两条默认路由。
- `BOOTPROTO=none` 是静态 IP 的关键，写错会被 DHCP 接管。
- route-eth1 里 via 的下一跳（10.0.0.1）必须与 eth1 同网段可达，否则路由写上了也不通。
- route-eth1 若不存在则新建，文件名必须带网卡后缀，NetworkManager/网络服务才会按接口加载。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
