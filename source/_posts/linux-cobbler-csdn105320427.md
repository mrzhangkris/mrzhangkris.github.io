---
title: "Cobbler 自动装机：从部署到 PXE 批量装系统（CentOS 7）"
date: 2020-04-06 20:59:23
categories: [技术]
tags: [Linux]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1587831990711-23ca6441447b?w=1600&q=80&fm=jpg
updated: 2026-09-11
---

机房里十几台新机器等着装系统，一台台插 U 盘不现实。Cobbler 把 PXE 引导、DHCP、kickstart 应答文件串成一整套，机器开机选网络启动就能自动装完。这篇按部署顺序完整走一遍，从装服务到按 MAC 定制装机。环境为 CentOS 7 + Cobbler 2.8（文中输出为当时实测记录）；openssl 密码生成命令已在 Rocky 9（OpenSSL 3.0.7）复核，结果一致。Cobbler 3.x 的配置与参数有变化，照搬本文前先核对官方文档。

官方文档：[cobbler](https://cobbler.readthedocs.io/en/latest/)

## 前置条件

- CentOS 7 服务器一台（root 权限），客户机与它**同网段**；
- `/var` 分区剩余空间 ≥ 10GB（每导入一个发行版占 5-10GB）；
- 关闭 SELinux（PXE/TFTP 会受它干扰），防火墙放行 dhcp/http/tftp 相关端口；
- 网络里没有其他 DHCP 服务抢答（两个 DHCP 会随机响应，装机时灵时不灵）。

关 SELinux：改配置文件重启后彻底生效，当前会话用 `setenforce 0` 过渡：

```bash
[root@localhost ~]# sed -i s#SELINUX=enforcing#SELINUX=disabled#g /etc/selinux/config
[root@localhost ~]# grep "SELINUX=" /etc/selinux/config
SELINUX=disabled
[root@localhost ~]# setenforce 0
[root@localhost ~]# getenforce
Permissive
```

## 一、部署 Cobbler

### 安装与启动

```bash
[root@localhost ~]# yum install -y epel-release
[root@localhost ~]# yum clean all
[root@localhost ~]# yum makecache
[root@localhost ~]# yum install -y net-tools vim
[root@localhost ~]# yum install -y httpd dhcp xinetd tftp cobbler cobbler-web pykickstart
```

启动四个相关服务，逐个确认 `active (running)`（验证点）：

```bash
[root@localhost ~]# systemctl start httpd
[root@localhost ~]# systemctl start cobblerd
[root@localhost ~]# systemctl start xinetd
[root@localhost ~]# systemctl start rsyncd
```

```bash
[root@localhost ~]# systemctl status httpd
● httpd.service - The Apache HTTP Server
   Loaded: loaded (/usr/lib/systemd/system/httpd.service; disabled; vendor preset: disabled)
   Active: active (running) since Mon 2020-04-06 12:02:06 CST; 10min ago
```

### 按 check 建议修配置

`cobbler check` 列出当前环境的问题清单，它给的是建议，不必每条都执行。首查会报九项，这里处理 1（server）、2（next_server）、8（默认密码）、5（引导程序）、4（tftp）这五条。

**1+2. server 与 next_server：改成本机真实 IP**。编辑 `/etc/cobbler/settings`：server 是 kickstart 功能依赖的地址，next_server 是 PXE 客户机下载启动文件的 TFTP 地址，两者都配成 `192.168.3.129`（本例的 cobbler 服务器 IP）。改完应看到：文件里不再有 `127.0.0.1`。注意不要写成 0.0.0.0，它不是一个监听地址。

**8. 换掉默认 root 密码**。`default_password_crypted` 是新装系统 root 的密码，默认值是公开的 `cobbler`，必须换。用 check 建议的命令生成哈希——此命令与系统版本无关，实测输出与 2020 年一致：

![配图1](/images/csdn/figures/linux-cobbler-csdn105320427-1.png)

把生成的值替换进 settings：

```
default_password_crypted: "$1$cobbler$M6SE55xZodWc9.vAKLJs6."
```

**5. 下载网络引导程序**。`/var/lib/cobbler/loaders` 缺 pxelinux.0、menu.c32 等 PXE 文件，跑一次下载：

```bash
[root@localhost ~]# cobbler get-loaders
downloading https://cobbler.github.io/loaders/pxelinux.0-3.86 to /var/lib/cobbler/loaders/pxelinux.0
downloading https://cobbler.github.io/loaders/menu.c32-3.86 to /var/lib/cobbler/loaders/menu.c32
downloading https://cobbler.github.io/loaders/grub-0.97-x86_64.efi to /var/lib/cobbler/loaders/grub-x86_64.efi
*** TASK COMPLETE ***
```

**4. 启用 TFTP**。编辑 `/etc/xinetd.d/tftp`，`disable = yes` 改成 `no`，然后 `systemctl restart xinetd`。

五条处理完，重启 cobblerd 复查（验证点）：

![配图2](/images/csdn/figures/linux-cobbler-csdn105320427-2.png)

剩下的 SELinux 适配、debmirror（Debian 支持）、fence-agents（电源管理）属于可选功能，不影响装机。

### 让 Cobbler 接管 DHCP

settings 里 `manage_dhcp: 0` 改成 `1`，cobbler 就会基于模板生成 dhcpd.conf。模板在 `/etc/cobbler/dhcp.template`，通常只改子网几行（`routers` 填真实网关）：

```
subnet 192.168.3.0 netmask 255.255.255.0 {
     option routers             192.168.3.129;
     option domain-name-servers 192.168.3.1;
     option subnet-mask         255.255.255.0;
     range dynamic-bootp        192.168.3.100 192.168.3.254;
```

重启 cobblerd 后 `cobbler sync`——它会生成 DHCP 配置、语法自检（`dhcpd -t`）并自动重启 DHCP 服务：

```bash
[root@localhost ~]# cobbler sync
...
generating /etc/dhcp/dhcpd.conf
running: dhcpd -t -q
running: service dhcpd restart
*** TASK COMPLETE ***
```

验证点：/etc/dhcp/dhcpd.conf 已出现模板渲染的子网与 `next-server`。

## 二、自动安装系统

先把系统镜像挂上来，导入。import 自动识别发行版签名并创建 distro 和 profile：

```bash
[root@localhost ~]# mount /dev/sr1 /mnt/
mount: /dev/sr1 is write-protected, mounting read-only
[root@localhost ~]# cobbler import --path=/mnt/ --name=Centos7-x86-64 --arch=x86_64
Found a matching signature: breed=redhat, version=rhel7
creating new distro: Centos7-64-x86_64
creating new profile: Centos7-64-x86_64
*** TASK COMPLETE ***
```

`--arch` 通常可自动检测，显式指定是为了避免识别出多个体系结构。导入成功后 report 查看详情（验证点：Distribution 与 Kickstart 两行）：

```bash
[root@localhost ~]# cobbler profile report Centos7-64-x86_64
Name                           : Centos7-64-x86_64
Distribution                   : Centos7-64-x86_64
Kickstart                      : /var/lib/cobbler/kickstarts/sample_end.ks
```

默认 ks 是 sample_end.ks，生产上换成自己的应答文件：

```bash
[root@localhost ~]# cobbler profile edit --distro=Centos7-64-x86_64 --name=Centos7-64-x86_64 --kickstart=/var/lib/cobbler/kickstarts/centos7-x86_64.ks
[root@localhost ~]# cobbler sync
```

sync 无报错后再 report 一次（验证点）：Kickstart 一行已变成新路径。到这里装机环境就绪——客户机与 cobbler 同网段、第一启动项为 PXE，加电即自动安装。此时 PXE 菜单仍需手动选系统，配合第五节的 MAC 绑定才能全自动。

## 三、已装机器在线重装（koan）

在需要重装的机器上操作：

```bash
# 1. 装 koan
[root@localhost ~]# yum install -y epel-release && yum install -y koan

# 2. 看 cobbler 上有哪些 profile（验证点：列出 Centos7-64-x86_64）
[root@localhost ~]# koan --server=192.168.3.129 --list=profiles
Centos7-64-x86_64

# 3. 指定重装目标，koan 把安装内核写进本地引导项
[root@localhost ~]# koan --replace-self --server=192.168.3.129 --profile=Centos7-64-x86_64
- reboot to apply changes

# 4. 重启即进入自动重装
[root@localhost ~]# reboot
```

原理：koan 把安装内核/initrd 追加为本地默认引导项，重启后走 kickstart 完成重装，全程不碰 PXE 菜单。**注意这是破坏性操作**，`--replace-self` 后重启即格式化重装。## 四、自定义 yum 源

让新装机器直接用私网源 `http://192.168.3.50/centos7`：

```bash
[root@localhost ~]# cobbler repo add --name=my_repo --mirror=http://192.168.3.50/centos7 --arch=x86_64 --breed=yum
[root@localhost ~]# cobbler reposync
[root@localhost ~]# cobbler profile edit --name=Centos7-64-x86_64 --repos="my_repo"
```

装系统时会在 yum.repos.d 下自动生成 repo 文件。repo 需要定期同步，crontab 定时跑 `cobbler reposync` 即可。

## 五、按 MAC 定制装机

给指定机器预分配 IP、主机名。规划：MAC `08:00:27:D8:D9:D0`，IP 192.168.3.123/24，网关 192.168.3.1，DNS 202.106.0.20，主机名 node1：

```bash
[root@localhost ~]# cobbler system add --name=centos-node1 --mac=08:00:27:D8:D9:D0 --profile=Centos7-64-x86_64 --ip-address=192.168.3.123 --subnet=255.255.255.0 --gateway=192.168.3.1 --interface=eth0 --static=1 --hostname=node1 --name-servers="202.106.0.20" --kickstart=/var/lib/cobbler/kickstarts/centos7-x86_64.ks
```

- `mac` 是关键开关：只有 MAC 匹配的机器才按此配置自动装，未登记的机器停在 PXE 菜单等人工选择；
- `--interface` 填的是客户端记录的网卡名（如 eth0），不是 cobbler 服务器的网卡；
- `--static=1` 表示静态 IP。

验证点：`cobbler system list` 应列出 `centos-node1`。

## 失败出口

- **改坏了 settings**：改回原值后 `systemctl restart cobblerd && cobbler sync`；每次改 settings 都必须重启+sync 才生效。
- **DHCP 不想要 cobbler 管了**：`manage_dhcp` 改回 0，`cobbler sync` 后手工维护 /etc/dhcp/dhcpd.conf。开着 manage_dhcp 时手工改 dhcpd.conf 会被覆盖。
- **删掉某个 MAC 绑定**：`cobbler system remove --name=centos-node1 && cobbler sync`。
- **整个卸掉**：`yum remove cobbler cobbler-web`，残留的 /var/lib/cobbler、/var/www/cobbler 手动清理。

## 常用参数速查

| 命令 | 作用 |
|------|------|
| `cobbler check` | 检查配置问题，给建议清单 |
| `cobbler import` | 导入镜像，新增 PXE 启动项（distro+profile） |
| `cobbler list` / `report` | 列出条目 / 详细信息 |
| `cobbler sync` | 改配置后同步，重新生成 PXE/DHCP 配置 |
| `cobbler reposync` | 同步 repo 源 |
| `cobbler profile edit` | 改 profile（换 ks、挂 repo） |
| `cobbler system add/remove` | 管理 MAC 绑定 |## 注意事项

- 每个导入的发行版占 5-10GB，规划好 /var 空间再导镜像。
- default_password_crypted 必须改掉，否则装出来的机器 root 密码是公开默认值。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
