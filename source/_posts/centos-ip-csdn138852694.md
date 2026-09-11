---
title: "在CentOS上手动配置静态IP地址及多网卡路由策略"
date: 2024-05-16 08:30:00
categories: [技术]
tags: [Linux]
copyright_author: 张鹏
cover: /images/csdn/covers/centos-ip-csdn138852694.png
---

在管理服务器时，手动配置静态IP地址是一项基本而关键的任务，尤其是在涉及多网卡的复杂网络环境中。静态IP配置确保了服务器的稳定访问，有助于避免由于IP地址动态变化引起的潜在问题。本文将探讨如何在CentOS系统中手动设置静态IP地址，如何配置多个网络接口，并如何根据不同的网络流量设置专门的路由。

### 为什么要配置静态IP地址

静态IP地址对于维护网络中的长期连接非常重要，特别是对于需要远程访问的服务。与动态IP相比，静态IP确保设备总是使用同一地址，这对于服务器上的服务来说至关重要，如Web服务、邮件服务器或远程访问服务。

### 多网卡的IP配置与默认路由选择

服务器如果配有多个网卡，正确配置每个网卡的静态IP及其路由是保障网络通信顺畅的关键。

#### 步骤 1: 配置静态IP

手动配置IP地址通常涉及编辑网络配置文件。在CentOS中，网络接口的配置文件位于 /etc/sysconfig/network-scripts/ 目录中。

```
# 编辑eth0配置文件
vi /etc/sysconfig/network-scripts/ifcfg-eth0

# 配置内容如下
DEVICE=eth0
BOOTPROTO=none
ONBOOT=yes
IPADDR=192.168.1.100
NETMASK=255.255.255.0
GATEWAY=192.168.1.1
```
```
# 编辑eth1配置文件
vi /etc/sysconfig/network-scripts/ifcfg-eth1

# 配置内容如下
DEVICE=eth1
BOOTPROTO=none
ONBOOT=yes
IPADDR=10.0.0.100
NETMASK=255.255.255.0
```

#### 步骤 2: 配置默认路由

在多网卡配置中，通常需要选择一个接口作为出口网关。这通常是连接到互联网的接口。

```bash
# 确保eth0设为默认网关
echo "GATEWAY=192.168.1.1" >> /etc/sysconfig/network
```

#### 步骤 3: 配置基于流量的路由

你可以通过编辑路由表来定义特定流量的路由策略，例如，确保来自某一特定子网的流量通过特定的网卡。

```bash
# 添加路由使来自特定IP段的流量通过eth1
echo "10.1.1.0/24 via 10.0.0.1 dev eth1" >> /etc/sysconfig/network-scripts/route-eth1
```

### 完整配置示例

假设有两个网卡：eth0用于连接互联网，eth1用于内部网络。以下是详细的配置：

#### eth0配置

```
DEVICE=eth0
BOOTPROTO=none
ONBOOT=yes
IPADDR=192.168.1.100
NETMASK=255.255.255.0
GATEWAY=192.168.1.1
DNS1=8.8.8.8
```

#### eth1配置

```
DEVICE=eth1
BOOTPROTO=none
ONBOOT=yes
IPADDR=10.0.0.100
NETMASK=255.255.255.0
```

#### 路由配置

```bash
# 默认路由设置
echo "GATEWAY=192.168.1.1" >> /etc/sysconfig/network

# 特定流量路由
echo "10.1.1.0/24 via 10.0.0.1 dev eth1" >> /etc/sysconfig/network-scripts/route-eth1
```

#### 注释说明

-   **eth0** 配置为外部访问接口，包括静态IP

---

> 本文迁移自作者 CSDN 博客，2024-05-16 首发于 CSDN，内容保持原貌。
