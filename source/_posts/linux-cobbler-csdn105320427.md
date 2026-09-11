---
title: "Cobbler 自动装机：从部署到 PXE 批量装系统"
date: 2020-04-06 20:59:23
categories: [技术]
tags: [Linux]
copyright_author: 司南
cover: /images/csdn/covers/linux-cobbler-csdn105320427.png
updated: 2026-09-11
---

机房里十几台新机器等着装系统，一台台插 U 盘不现实。Cobbler 把 PXE 引导、DHCP、kickstart 应答文件串成一整套，机器开机选网络启动就能自动装完。这篇按部署顺序完整走一遍：装服务、按 check 建议改配置、接管 DHCP、导入镜像、替换 ks 文件，最后是已装机器在线重装和按 MAC 定制装机。

官方文档：[cobbler](https://cobbler.readthedocs.io/en/latest/)

## 一、部署 Cobbler

### 环境准备

先把 SELinux 关掉，避免干扰 PXE 和 TFTP：

```bash
[root@localhost ~]# sed -i s#SELINUX=enforcing#SELINUX=disabled#g /etc/selinux/config
[root@localhost ~]# grep "SELINUX=" /etc/selinux/config
SELINUX=disabled
[root@localhost ~]# getenforce
Enforcing
[root@localhost ~]# setenforce 0
[root@localhost ~]# getenforce
Permissive
```

改配置文件后需要重启才彻底生效，当前会话先用 `setenforce 0` 切到 Permissive 过渡。防火墙按自己环境放行相关端口即可，此处不展开。

### 安装与启动

```bash
[root@localhost ~]# yum install -y epel-release
[root@localhost ~]# yum clean all
[root@localhost ~]# yum makecache
[root@localhost ~]# yum install -y net-tools vim
[root@localhost ~]# yum install -y httpd dhcp xinetd tftp cobbler cobbler-web pykickstart
```

启动四个相关服务：

```bash
[root@localhost ~]# systemctl start httpd
[root@localhost ~]# systemctl start cobblerd
[root@localhost ~]# systemctl start xinetd
[root@localhost ~]# systemctl start rsyncd
```

逐个确认都处于运行状态，以 httpd 为例：

```bash
[root@localhost ~]# systemctl status httpd
● httpd.service - The Apache HTTP Server
   Loaded: loaded (/usr/lib/systemd/system/httpd.service; disabled; vendor preset: disabled)
   Active: active (running) since Mon 2020-04-06 12:02:06 CST; 10min ago
```

cobblerd、xinetd、rsyncd 同样确认 `active (running)`。

### 按 check 建议修配置

`cobbler check` 会列出当前环境需要处理的问题，它给的是建议清单，不必每条都执行：

```
[root@localhost ~]# cobbler check
The following are potential configuration items that you may want to fix:

1 : The 'server' field in /etc/cobbler/settings must be set to something other than localhost, or kickstarting features will not work.  This should be a resolvable hostname or IP for the boot server as reachable by all machines that will use it.
2 : For PXE to be functional, the 'next_server' field in /etc/cobbler/settings must be set to something other than 127.0.0.1, and should match the IP of the boot server on the PXE network.
3 : SELinux is enabled. Please review the following wiki page for details on ensuring cobbler works correctly in your SELinux environment:
    https://github.com/cobbler/cobbler/wiki/Selinux
4 : change 'disable' to 'no' in /etc/xinetd.d/tftp
5 : Some network boot-loaders are missing from /var/lib/cobbler/loaders, you may run 'cobbler get-loaders' to download them, or, if you only want to handle x86/x86_64 netbooting, you may ensure that you have installed a *recent* version of the syslinux package installed and can ignore this message entirely.
6 : enable and start rsyncd.service with systemctl
7 : debmirror package is not installed, it will be required to manage debian deployments and repositories
8 : The default password used by the sample templates for newly installed machines (default_password_crypted in /etc/cobbler/settings) is still set to 'cobbler' and should be changed, try: "openssl passwd -1 -salt 'random-phrase-here' 'your-password-here'" to generate new one
9 : fencing tools were not found, and are required to use the (optional) power management features. install cman or fence-agents to use them

Restart cobblerd and then run 'cobbler sync' to apply changes.
```

这里只处理 1、2、8、5、4 这五条，按此顺序来。

**1. server 项：Cobbler 服务器地址**

编辑 `/etc/cobbler/settings`，把 server 从 localhost 改成实际 IP，否则 kickstart 功能不工作。注意不要写成 0.0.0.0，它不是一个监听地址：

```
# 修改前
server: 127.0.0.1
# 修改后（192.168.3.129 是本例的 cobbler 服务器地址）
server: 192.168.3.129
```

**2. next_server 项：TFTP 服务器地址**

next_server 用于 DHCP/PXE，指向下载网络启动文件的 TFTP 服务器，一般和 server 配成同一个 IP：

```
# 修改前
next_server: 127.0.0.1
# 修改后
next_server: 192.168.3.129
```

**8. default_password_crypted：新装系统的 root 密码**

这个密码就是新装出来的系统 root 登录密码，默认值是公开的 `cobbler`，必须换掉。用 check 建议里的命令生成新哈希：

```bash
# -1 用 MD5(BSD) 算法，-salt 用指定字符串填充盐值
[root@localhost ~]# openssl passwd -1 -salt 'cobbler' 'cobbler'
$1$cobbler$M6SE55xZodWc9.vAKLJs6.
```

把 `/etc/cobbler/settings` 里的 default_password_crypted 换成生成的值：

```
default_password_crypted: "$1$cobbler$M6SE55xZodWc9.vAKLJs6."
```

**5. 下载网络引导程序**

`/var/lib/cobbler/loaders` 缺少 PXE 引导文件（pxelinux.0、menu.c32 等），跑一次下载即可：

```bash
[root@localhost ~]# cobbler get-loaders
task started: 2020-04-06_135850_get_loaders
task started (id=Download Bootloader Content, time=Mon Apr  6 13:58:50 2020)
downloading https://cobbler.github.io/loaders/README to /var/lib/cobbler/loaders/README
downloading https://cobbler.github.io/loaders/pxelinux.0-3.86 to /var/lib/cobbler/loaders/pxelinux.0
downloading https://cobbler.github.io/loaders/menu.c32-3.86 to /var/lib/cobbler/loaders/menu.c32
downloading https://cobbler.github.io/loaders/grub-0.97-x86_64.efi to /var/lib/cobbler/loaders/grub-x86_64.efi
*** TASK COMPLETE ***
```

![配图](/images/csdn/figures/linux-cobbler-csdn105320427.png)

**4. 启用 TFTP**

编辑 `/etc/xinetd.d/tftp`，把 disable 项从 yes 改成 no（顺便可以确认 TFTP 根目录配置）：

```
# 修改前
disable  = yes
# 修改后
disable  = no
```

改完重启 xinetd 生效，然后重启 cobblerd 并复查 check：

```bash
systemctl restart xinetd
```

```bash
[root@localhost ~]# systemctl restart cobblerd
[root@localhost ~]# cobbler check
The following are potential configuration items that you may want to fix:

1 : SELinux is enabled. Please review the following wiki page for details on ensuring cobbler works correctly in your SELinux environment:
    https://github.com/cobbler/cobbler/wiki/Selinux
2 : enable and start rsyncd.service with systemctl
3 : debmirror package is not installed, it will be required to manage debian deployments and repositories
4 : fencing tools were not found, and are required to use the (optional) power management features. install cman or fence-agents to use them

Restart cobblerd and then run 'cobbler sync' to apply changes.
```

处理过的五条没有再出现，剩下的属于可选功能（SELinux 环境适配、Debian 支持、电源管理），不影响装机流程。

### 让 Cobbler 接管 DHCP

把 `/etc/cobbler/settings` 里的 manage_dhcp 改成 1，cobbler 就会基于自己的模板生成 dhcpd.conf：

```
# 修改前
manage_dhcp: 0
# 修改后
manage_dhcp: 1
```

模板在 `/etc/cobbler/dhcp.template`，通常只需要改子网相关的几行。本例 IP 是 192.168.3.129，修改后的模板内容：

```
subnet 192.168.3.0 netmask 255.255.255.0 {
     option routers             192.168.3.129;
     option domain-name-servers 192.168.3.1;
     option subnet-mask         255.255.255.0;
     range dynamic-bootp        192.168.3.100 192.168.3.254;
```

> 注：`routers` 对应网关地址，需按自己网络的真实网关填写；`dynamic-bootp` 是可分配的 IP 段。

重启 cobblerd 后执行 sync，cobbler 会生成 DHCP 配置并自动重启 DHCP 服务：

```bash
[root@localhost ~]# systemctl restart cobblerd
[root@localhost ~]# cobbler sync
task started: 2020-04-06_161705_sync
task started (id=Sync, time=Mon Apr  6 16:17:05 2020)
running pre-sync triggers
cleaning trees
copying bootloaders
copying: /var/lib/cobbler/loaders/pxelinux.0 -> /var/lib/tftpboot/pxelinux.0
copying distros to tftpboot
generating PXE configuration files
rendering DHCP files
generating /etc/dhcp/dhcpd.conf
rendering TFTPD files
generating /etc/xinetd.d/tftp
running: dhcpd -t -q
running: service dhcpd restart
*** TASK COMPLETE ***
```

看一下生成的 `/etc/dhcp/dhcpd.conf`，确认 cobbler 已经接管了 DHCP 配置：

```
subnet 192.168.3.0 netmask 255.255.255.0 {
     option routers             192.168.3.129;
     option domain-name-servers 192.168.3.1;
     option subnet-mask         255.255.255.0;
     range dynamic-bootp        192.168.3.100 192.168.3.254;
     default-lease-time         21600;
     max-lease-time             43200;
     next-server                192.168.3.129;
}
```

## 二、自动安装系统

Cobbler 大量使用 /var 目录，`/var/www/cobbler/ks_mirror` 存放所有发行版的完整文件，每导入一个发行版需要预留 5-10GB 空间。

先把系统镜像挂上来：

```bash
[root@localhost ~]# lsblk
NAME            MAJ:MIN RM  SIZE RO TYPE MOUNTPOINT
sda               8:0    0   30G  0 disk
├─sda1            8:1    0    1G  0 part /boot
└─sda2            8:2    0   29G  0 part
  ├─centos-root 253:0    0   27G  0 lvm  /
  └─centos-swap 253:1    0    2G  0 lvm  [SWAP]
sdb               8:16   0 60.5G  0 disk
sr0              11:0    1    7G  0 rom
sr1              11:1    1  4.4G  0 rom
[root@localhost ~]# mount /dev/sr1 /mnt/
mount: /dev/sr1 is write-protected, mounting read-only
```

导入镜像。import 会自动识别发行版签名并创建 distro 和 profile：

```bash
[root@localhost ~]# cobbler import --path=/mnt/ --name=Centos7-x86-64 --arch=x86_64
task started: 2020-04-06_163030_import
Found a candidate signature: breed=redhat, version=rhel6
Found a candidate signature: breed=redhat, version=rhel7
Found a matching signature: breed=redhat, version=rhel7
creating new distro: Centos7-64-x86_64
creating new profile: Centos7-64-x86_64
*** TASK COMPLETE ***
```

- `--path`：挂载的镜像路径
- `--name`：自定义的安装源名称
- `--arch`：通常可自动检测，显式指定是为了避免识别出多个体系结构

导入成功后用 report 查看 profile 详情：

```bash
[root@localhost ~]# cobbler profile report Centos7-64-x86_64
Name                           : Centos7-64-x86_64
Distribution                   : Centos7-64-x86_64
Enable PXE Menu?               : 1
Kickstart                      : /var/lib/cobbler/kickstarts/sample_end.ks
Virt Type                      : kvm
```

默认的 ks 文件是 sample_end.ks，生产上一般要换成自己的应答文件：

```bash
[root@localhost ~]# cobbler profile edit --distro=Centos7-64-x86_64 --name=Centos7-64-x86_64 --kickstart=/var/lib/cobbler/kickstarts/centos7-x86_64.ks
[root@localhost ~]# cobbler sync
```

sync 无报错后再 report 一次，Kickstart 一行已经换成新路径：

```bash
Kickstart                      : /var/lib/cobbler/kickstarts/centos7-x86_64.ks
```

到这里装机环境就绪了：只要客户机与 cobbler 服务器同网段、第一启动项为 PXE，机器加电就会自动安装。不过此时 PXE 菜单还需要手动选择系统，配合下面的 MAC 绑定才能做到全自动。

## 三、已装机器在线重装（koan）

在需要重装的机器上操作：

1. 装 epel 源和 koan 包：

```bash
[root@localhost ~]# yum install -y epel-release
[root@localhost ~]# yum install -y koan
```

2. 查看 cobbler 上可用的 profile：

```bash
[root@localhost ~]# koan --server=192.168.3.129 --list=profiles
- looking for Cobbler at http://192.168.3.129:80/cobbler_api
Centos7-64-x86_64
```

3. 指定要重装成的系统：

```bash
[root@localhost ~]# koan --replace-self --server=192.168.3.129 --profile=Centos7-64-x86_64
- looking for Cobbler at http://192.168.3.129:80/cobbler_api
- reading URL: http://192.168.3.129/cblr/svc/op/ks/profile/Centos7-64-x86_64
install_tree: http://192.168.3.129/cblr/links/Centos7-64-x86_64
downloading initrd initrd.img to /boot/initrd.img_koan
downloading kernel vmlinuz to /boot/vmlinuz_koan
- ['/sbin/grubby', '--add-kernel', '/boot/vmlinuz_koan', '--initrd', '/boot/initrd.img_koan', '--args', '"ks=http://192.168.3.129/cblr/svc/op/ks/profile/Centos7-64-x86_64 ksdevice=link kssendmac lang= text "', '--copy-default', '--make-default', '--title=kick1586181560']
- reboot to apply changes
```

4. 重启，机器会进入自动重装流程：

```bash
[root@localhost ~]# reboot
```

koan 的原理是把安装内核写入本地引导项并设为默认，重启后走 kickstart 完成重装，全程不需要接触 PXE 菜单。

## 四、自定义 yum 源

私网 yum 源地址为 `http://192.168.3.50/centos7`，可以让新装机器直接用它。

添加 repo：

```bash
[root@localhost ~]# cobbler repo add --name=my_repo --mirror=http://192.168.3.50/centos7 --arch=x86_64 --breed=yum
```

同步到本地：

```bash
[root@localhost ~]# cobbler reposync
```

挂到 profile 上，装系统时会自动在 yum.repos.d 下生成 repo 文件：

```bash
[root@localhost ~]# cobbler profile edit --name=Centos7-64-x86_64 --repos="my_repo"
```

repo 需要定期同步，用 crontab 定时跑 `cobbler reposync` 即可。

## 五、按 MAC 定制装机

给指定机器预分配 IP、主机名等配置。规划如下：

- 服务器 MAC：`08:00:27:D8:D9:D0`
- 预分配 IP：192.168.3.123，掩码 255.255.255.0，网关 192.168.3.1
- DNS：202.106.0.20，主机名：node1

```bash
[root@localhost ~]# cobbler system add --name=centos-node1 --mac=08:00:27:D8:D9:D0 --profile=Centos7-64-x86_64 --ip-address=192.168.3.123 --subnet=255.255.255.0 --gateway=192.168.3.1 --interface=eth0 --static=1 --hostname=node1 --name-servers="202.106.0.20" --kickstart=/var/lib/cobbler/kickstarts/centos7-x86_64.ks
```

各参数含义：

- `name`：任务名称
- `mac`：客户端 MAC 匹配到此记录才分配对应 IP 并安装，否则拒绝——这就是"只有指定机器能装"的开关
- `profile`：使用的 profile
- `ip-address`/`subnet`/`gateway`：预分配的网络参数
- `--static=1`：静态 IP
- `hostname`/`name-servers`：主机名与 DNS
- `kickstart`：应答文件路径
- `interface`：记录绑定的网卡名

> 注：`--interface` 填的是为该客户端记录的网卡名（如 eth0），不是 cobbler 服务器的网卡。

确认已登记：

```bash
[root@localhost ~]# cobbler system list
centos-node1
```

## cobbler 常用参数速查

- `cobbler check`：检查配置问题，给建议清单
- `cobbler import`：新增一个 PXE 启动项（distro）
- `cobbler list`：列出 distros 与 profiles
- `cobbler report`：列出详细信息
- `cobbler sync`：修改配置后同步，重新生成 PXE/DHCP 配置
- `cobbler reposync`：同步 repo 源
- `cobbler distro (add/copy/edit/find/list/remove/rename/report)`：管理 distro
- `cobbler profile`：管理 profile

## 注意事项

- 每个导入的发行版占用 5-10GB，规划好 /var 空间再导镜像。
- default_password_crypted 必须改掉，否则装出来的机器 root 密码是公开默认值。
- 改完 settings 记得 `systemctl restart cobblerd && cobbler sync`，否则改动不生效。
- manage_dhcp 开启后 DHCP 由 cobbler 生成，手工改 /etc/dhcp/dhcpd.conf 会被覆盖。
- MAC 绑定是精确装机的关键：不绑定的机器只会停在 PXE 菜单等人工选择。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
