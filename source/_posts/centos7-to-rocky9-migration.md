---
title: "CentOS 7 停服迁移实战：重测 93 篇旧文挖出的 el7→el9 差异清单"
date: 2026-09-14 21:00:00
categories: [技术]
tags: [Linux, CentOS, Rocky Linux, 迁移, 运维]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1600&q=80&fm=jpg
---

CentOS 7 已经停止维护一年多，vault 源也只是缓刑。我这几天把博客里 93 篇运维旧文在 Rocky Linux 9 上逐篇重测了一遍——不是查文档抄差异，是每条命令真的在容器里跑一遍，跑通的写进文章，跑不通的记进这份清单。

按迁移时的踩坑概率排序：源和仓库最先出事，然后是包名、服务行为、命令参数。每条都附实测依据，照着核对可以少踩一遍。

## 先说源：两边的默认源都不可信

**CentOS 7 侧**：官方源已下线，继续装机必须切 vault——把 repo 文件里的 `mirrorlist` 注释掉，`baseurl` 改指 `http://vault.centos.org`，`yum clean all` 后重装。vault 对某些路径偶发 403，重试或换 x86_64 机器。

**Rocky 9 侧**：容器镜像自带的 mirrorlist 在不少网络环境下直接 404（本机实测如此），同样改 baseurl 指 `https://dl.rockylinux.org/$contentdir/$releasever/`。EPEL 装法不变：`dnf install -y epel-release`。

**这一步的教训是：别假设任何默认源开箱即用，新环境第一件事是跑一条 `dnf install` 探路。**

## 包名与包结构

| el7 习惯 | el9 实际 | 说明 |
|---|---|---|
| `yum install dhcp` | `dnf install dhcp-server` | ISC DHCP 拆成 dhcp-server / dhcp-client / dhcp-common 三个包 |
| `yum install cobbler`（2.8） | `dnf install cobbler`（3.3.7） | 配置文件从 `/etc/cobbler/settings` 变成 `/etc/cobbler/settings.yaml`，格式整个换了 |
| `yum install salt-master` | 同名，但需补 `python3-mysqlclient` | Salt 3005.4 的 MySQL Returner 在 el9 靠这个包 |
| network-scripts 包 | 不存在了 | 下文单说 |

版本跨度也要有预期：BIND 是 9.16，Postfix 3.5 / Dovecot 2.3，OpenResty EPEL 里能到 1.19+，编译新版本另说。

## 服务行为变化（最容易翻车的三类）

**1. network-scripts 整套没了。** `ifcfg`、`route-ethN`、`systemctl restart network` 都成为历史，网络归 NetworkManager 管。静态多路由的写法变成 nmcli keyfile 或 `nmcli con mod +ipv4.routes`。还有一个细节：容器里没有 dbus 时 nmcli 会直接罢工，需要先手起 `dbus-daemon`——自动化脚本里注意。

**2. dhcpd 不再读 `/etc/sysconfig/dhcpd`。** el7 靠 `DHCPDARGS=eth0` 指定监听网卡，el9 的单元文件里明确写着这文件不再使用。实际行为是 **dhcpd 只监听有 subnet 声明的网口**：网口地址不在任何已声明网段内，直接拒绝 `No subnet declaration for eth0`，配了全局网段才正常监听。

**3. OpenSSH 会和 crypto-policies 打架。** el9 的 sshd 默认叠加 `/etc/ssh/sshd_config.d/50-redhat.conf`，源码编译安装 OpenSSH 9.5p1 后 `sshd -t` 报 `GSSAPIKexAlgorithms` 无法识别——它读不懂 crypto-policies 下发的算法名。移开这个 include 文件后配置校验通过。从发行版 OpenSSH 升级到自编译版本的机器，这一步必踩。

## 命令与参数

- **reposync**：dnf 4.14 自带的独立 `reposync` 兼容脚本还在，老参数大多可用；但 `--metadata` 不是有效选项——它会前缀匹配成 `--metadata-path` 然后报"缺参数"。正确写法是 `--download-metadata`。这类前缀匹配坑在 dnf 全家都存在，长选项建议写全。
- **parted 脚本化**：el7 时代 `-s` 配 `---pretend-input-tty` 能跑的写法，el9 实测静默失效返回 1。脚本化 parted 直接去掉 `-s`，用显式的命令参数。
- **drop_caches**：容器内核下 `echo 3 > /proc/sys/vm/drop_caches` 实测 Permission denied，"写完读回永远 0"的老说法在新内核也不成立——这属于环境差异而非版本差异，但自动化脚本同样会中招。

## 数据库与周边

- **MariaDB 远程访问**：el7 老 tutorial 里"装完就能连"在 el9 不成立，首连报 `ERROR 1130`，必须显式 `CREATE USER` + `GRANT`。老 SQL 文件里部分写法已直接报 invalid。
- **MySQL 8 保留字**：`load` 这类列名不加反引号直接语法错误，跨版本迁移的旧 SQL 先过一遍保留字扫描。
- **Elasticsearch**：7.6.x 没有 ARM 构建（官方从 7.8 起才提供），aarch64 机器装旧版会 404。报错 `X-Pack is not supported ... [linux-aarch64]` 的解法（`xpack.ml.enabled: false`）依然有效。
- **Tomcat jsvc**：新版 Tomcat 9 的 bin 目录里仍然只有 `commons-daemon-native.tar.gz` 源码包，没有预编译 jsvc；`daemon.sh` 也删掉了 `# JAVA_HOME=` 注释行，改用 `--java-home` 参数或依赖自动探测——精简镜像里没有 `which` 命令时自动探测会失效。

## 迁移核对清单

按顺序过一遍，每条都能在博客对应文章里找到完整实测过程：

1. 源切换（旧机 vault、新机 dl.rockylinux.org）
2. 包名映射：dhcp-server、cobbler 3.x settings.yaml、salt 补 python3-mysqlclient
3. 网络改 NetworkManager：nmcli keyfile、`+ipv4.routes`，容器里记得 dbus
4. 服务行为：dhcpd 监听逻辑、OpenSSH 与 crypto-policies 的 include 冲突
5. 命令修正：`--download-metadata`、parted 去 `-s`
6. 数据库：显式 GRANT、保留字反引号、ES 版本与架构对应
7. 迁移完跑一轮真机冒烟——这条清单本身也只是一份"已知的坑"，不是充分的验收

## 写在最后

这份清单的每一行都来自真实容器实跑，但迁移的坑永远不止清单上的。真正可迁移的不是这几条差异，是"在隔离环境里先跑一遍"的方法：一台 Rocky 9 容器、一份旧脚本、逐条执行——你的环境特有的差异，一个下午就能全部暴露。
