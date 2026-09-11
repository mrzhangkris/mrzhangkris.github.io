---
title: "linux自动化之cobbler自动安装系统"
date: 2020-04-06 20:59:23
categories: [技术]
tags: [Linux]
copyright_author: 张鹏
cover: /images/csdn/covers/linux-cobbler-csdn105320427.png
---

#### 文章目录

-   [官方文档](#_1)
-   [1 cobbler部署](#1_cobbler_5)
-   -   [1.1 环境的准备](#11__7)
    -   -   [1.1.1 selinux](#111_selinux_8)
        -   [1.1.2 防火墙](#112__20)
    -   [1.2.服务的安装和启动](#12_22)
    -   -   [1.2.1 安装基础环境](#121__24)
        -   [1.2.2 启动服务](#122__32)
    -   [1.3.更改配置](#13_69)
    -   -   [1.3.1 cobbler服务器地址](#131_cobbler_92)
        -   [1.3.2 TFTP服务器地址](#132_TFTP_105)
        -   [1.3.3 默认密码](#133__118)
        -   [1.3.4 下载网络引导程序](#134__142)
        -   [1.3.5 启用TFTP服务](#135_TFTP_163)
    -   [1.4 DHCP管理和DHCP模板](#14_DHCPDHCP_199)
    -   -   [1.4.1 修改manage\_dhcp值](#141_manage_dhcp_201)
        -   [1.4.2 修改dhcp.templateCobbler模板](#142_dhcptemplateCobbler_211)
-   [2 自动安装系统](#2__286)
-   -   [2.1注意事项](#21_288)
    -   [2.2 挂载镜像](#22__291)
    -   [2.3 导入镜像](#23__310)
    -   [2.4 查看导入镜像详细信息](#24__338)
    -   [2.5 替换ks文件](#25_ks_375)
-   [3 自动重装系统](#3__470)
-   [4 cobbler自定义yum源](#4_cobbleryum_510)
-   -   [4.1 添加repo](#41_repo_512)
    -   [4.2 同步](#42__518)
    -   [4.3 安装repo源](#43_repo_523)
    -   [4.4 定期同步repl源](#44_repl_528)
-   [5 自定义安装系统](#5__531)
-   -   [5.1 规划服务器](#51__533)
    -   [5.2 指定服务器安装配置](#52__542)
    -   [5.3 查看详情](#53__559)
-   [cobbler常用参数](#cobbler_569)
-   [参考](#_581)

## 官方文档

[cobbler](https://cobbler.readthedocs.io/en/latest/)

## 1 cobbler部署

### 1.1 环境的准备

#### 1.1.1 selinux

将selinux设置成disabled，同时检查当前环境selinux状态，确保它处于关闭状态

```bash
[root@localhost ~]# sed -i s#SELINUX=enforcing#SElINUX=disabled#g /etc/selinux/config
[root@localhost ~]# grep "SElINUX=" /etc/selinux/config
SElINUX=disabled
[root@localhost ~]# getenforce
Enforcing
[root@localhost ~]# setenforce 0
[root@localhost ~]# getenforce
Permissive
```

#### 1.1.2 防火墙

待定

### 1.2.服务的安装和启动

#### 1.2.1 安装基础环境

```bash
[root@localhost ~]# yum install -y epel-release
[root@localhost ~]# yum clean all
[root@localhost ~]# yum makecache
[root@localhost ~]# yum install -y net-tools vim
[root@localhost ~]# yum install -y httpd dhcp xinetd tftp cobbler cobbler-web pykickstart
```

#### 1.2.2 启动服务

```bash
    [root@localhost ~]# systemctl start httpd
    [root@localhost ~]# systemctl start cobblerd
    [root@localhost ~]# systemctl start xinetd
    [root@localhost ~]# systemctl start rsyncd
```

到这里所有的安装部分都已经完毕了，如果你很顺利，可以使用staus命令看到如下输出

```bash
[root@localhost ~]# systemctl status httpd
● httpd.service - The Apache HTTP Server
   Loaded: loaded (/usr/lib/systemd/system/httpd.service; disabled; vendor preset: disabled)
   Active: active (running) since Mon 2020-04-06 12:02:06 CST; 10min ago
   ···
   ···
[root@localhost ~]# systemctl status cobblerd
● cobblerd.service - Cobbler Helper Daemon
   Loaded: loaded (/usr/lib/systemd/system/cobblerd.service; disabled; vendor preset: disabled)
   Active: active (running) since Mon 2020-04-06 12:02:11 CST; 10min ago
   ···
   ···
[root@localhost ~]# systemctl status xinetd
● xinetd.service - Xinetd A Powerful Replacement For Inetd
   Loaded: loaded (/usr/lib/systemd/system/xinetd.service; enabled; vendor preset: enabled)
   Active: active (running) since Mon 2020-04-06 11:10:50 CST; 1h 2min ago
   ···
   ···
[root@localhost ~]# systemctl status rsyncd
● rsyncd.service - fast remote file copy program daemon
   Loaded: loaded (/usr/lib/systemd/system/rsyncd.service; disabled; vendor preset: disabled)
   Active: active (running) since Mon 2020-04-06 12:02:20 CST; 10min ago
   ···
   ···
```

### 1.3.更改配置

可以使用cobbler check命令查看cobbler给出的建议，这只是建议，并不是需要每条建议都执行。

下面的代码块中是使用check命令列举出了我本机上cobbler所给的建议。

```
[root@localhost ~]# cobbler check
The following are potential configuration items that you may want to fix:

1 : The 'server' field in /etc/cobbler/settings must be set to something other than localhost, or kickstarting features will not work.  This should be a resolvable hostname or IP for the boot server as reachable by all machines that will use it.
2 : For PXE to be functional, the 'next_server' field in /etc/cobbler/settings must be set to something other than 127.0.0.1, and should match the IP of the boot server onthe PXE network.
3 : SELinux is enabled. Please review the following wiki page for details on ensuring cobbler works correctly in your SELinux environment:
    https://github.com/cobbler/cobbler/wiki/Selinux
4 : change 'disable' to 'no' in /etc/xinetd.d/tftp
5 : Some network boot-loaders are missing from /var/lib/cobbler/loaders, you may run 'cobbler get-loaders' to download them, or, if you only want to handle x86/x86_64 netbooting, you may ensure that you have installed a *recent* version of the syslinux package installed and can ignore this message entirely.  Files in this directory, should you want to support all architectures, should include pxelinux.0, menu.c32, elilo.efi, and yaboot. The 'cobbler get-loaders' command is the easiest way to resolve these requirements.
6 : enable and start rsyncd.service with systemctl
7 : debmirror package is not installed, it will be required to manage debian deployments and repositories
8 : The default password used by the sample templates for newly installed machines (default_password_crypted in /etc/cobbler/settings) is still set to 'cobbler' and shouldbe changed, try: "openssl passwd -1 -salt 'random-phrase-here' 'your-password-here'" to generate new one
9 : fencing tools were not found, and are required to use the (optional) power management features. install cman or fence-agents to use them

Restart cobblerd and then run 'cobbler sync' to apply changes.
```

根据cobbler建议，我只打算进行1，2，8，5，4的操作（将按照此顺序操作）

#### 1.3.1 cobbler服务器地址

       cobbler第一条建议是修改/etc/cobbler/settings中的server项，将该项的值配置成除localhost以外的其他值，否则kickstarting功能将不起作用。该值可以是可被解析的主机名或IP，同时可被其他计算机访问。

       server用于设置cobbler服务器地址的IP。一般设置成本机IP地址，注意不要设置成0.0.0.0，因为它不是一个监听地址。

在/etc/cobbler/settings中的server项

```
server: 127.0.0.1
```

修改后

```
server: 192.168.3.129
```

-   192.168.3.129是我的cobbler服务器地址

#### 1.3.2 TFTP服务器地址

       cobbler第二条建议修改/etc/cobbler/settings中的next\_server项，将该项值设置为127.0.0.1以外的其他值，并且该字段应与PXE网络上的引导服务器的IP地址匹配。

       next\_server用于DHCP/PXE,作为下载网络启动文件的TFTP服务器的IP，这里设置一般与server配置相同。

在/etc/cobbler/settings中的next\_server项

```
next_server: 127.0.0.1
```

修改后

```
next_server: 192.168.3.129
```

-   192.168.3.129是我的TFTP服务器地址

#### 1.3.3 默认密码

       cobbler第八条建议修改/etc/cobbler/settings中default\_password\_crypted项，在新安装的cobbler服务中default\_password\_crypted项使用的是默认值(cobbler),可以使用openssl passwd -1 -salt ‘random-phrase-here’ 'your-password-here’生成新的密码

       default\_password\_crypted的密码是为新系统安装设置的root密码，假设用cobbler安装了刚一台系统为CentOS7的机器，在登录时用的root密码就是此密码。

在/etc/cobbler/settings中的next\_server项

```
default_password_crypted: "$1$mF86/UHC$WvcIcX2t6crBz2onWxyac."
```

使用cobbler建议中的命令生成新的密码

```
openssl passwd -1 -salt 'random-phrase-here' 'your-password-here'
```

-   参数1：用MD5基于BSD的密钥算法。
-   参数salt：用指定的字符串填充。当从终端读取一个密钥时，则填充它。

我使用的命令

```
[root@localhost ~]#openssl passwd -1 -salt 'cobbler' 'cobbler'
$1$cobbler$M6SE55xZodWc9.vAKLJs6.
```

修改/etc/cobbler/settings中default\_password\_crypted选项的值,用新生成的密码去替换原有的默认密码,替换后为

```
default_password_crypted: "$1$cobbler$M6SE55xZodWc9.vAKLJs6."
```

#### 1.3.4 下载网络引导程序

       cobbler第五条建议/var/lib/cobbler/loaders中缺少某些网络引导加载程序，可以运行’cobbler get-loaders’下载它们，或者，如果您只想处理x86/x86\_64网络引导，则可以确保已安装 安装的syslinux软件包的最新版本，可以完全忽略此消息。如果要支持所有体系结构，此目录中的文件应包括pxelinux.0，menu.c32，elilo.efi和yaboot。 'cobbler get-loaders’命令是解决这些要求的最简单方法。

运行cobbler get-loaders命令

```bash
[root@localhost ~]# cobbler get-loaders
task started: 2020-04-06_135850_get_loaders
task started (id=Download Bootloader Content, time=Mon Apr  6 13:58:50 2020)
downloading https://cobbler.github.io/loaders/README to /var/lib/cobbler/loaders/README
downloading https://cobbler.github.io/loaders/COPYING.elilo to /var/lib/cobbler/loaders/COPYING.elilo
downloading https://cobbler.github.io/loaders/COPYING.yaboot to /var/lib/cobbler/loaders/COPYING.yaboot
downloading https://cobbler.github.io/loaders/COPYING.syslinux to /var/lib/cobbler/loaders/COPYING.syslinux
downloading https://cobbler.github.io/loaders/elilo-3.8-ia64.efi to /var/lib/cobbler/loaders/elilo-ia64.efi
downloading https://cobbler.github.io/loaders/yaboot-1.3.17 to /var/lib/cobbler/loaders/yaboot
downloading https://cobbler.github.io/loaders/pxelinux.0-3.86 to /var/lib/cobbler/loaders/pxelinux.0
downloading https://cobbler.github.io/loaders/menu.c32-3.86 to /var/lib/cobbler/loaders/menu.c32
downloading https://cobbler.github.io/loaders/grub-0.97-x86.efi to /var/lib/cobbler/loaders/grub-x86.efi
downloading https://cobbler.github.io/loaders/grub-0.97-x86_64.efi to /var/lib/cobbler/loaders/grub-x86_64.efi
*** TASK COMPLETE ***
```

#### 1.3.5 启用TFTP服务

       cobbler第四条建议/etc/xinetd.d/tftp中disable项设置为no。再默认情况下TFTP服务是禁用的，要启用它，就要将disable项设置为no,将更改保存到配置文件后要重启xinetd服务

在/etc/xinetd.d/tftp中的disable项

主要是设置TFTP服务器的根目录

```
disable  = yes
```

修改后

```
disable  = no
```

重新启动xinetd服务

```bash
systemctl restart xinetd
```

到此根据cobbler建议来做的操作都已做完，重启cobbler，再执行check看下效果

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

可以看到我们所做的操作，没有再一次被建议。

下面来配置DHCP，实现cobbler管理DHCP

### 1.4 DHCP管理和DHCP模板

       cobbler可以通过/etc/cobbler/settings中manage\_dhcp项来管理DHCP。将manage\_dhcp的值设置为1，以便cobbler将dhcpd.conf基于dhcp.templateCobbler生成文件。

#### 1.4.1 修改manage\_dhcp值

编辑/etc/cobbler/settings，找到manage\_dhcp项，按i键将其值0修改为1。

/etc/cobbler/settings中的manage\_dhcp项

```
manage_dhcp: 0
```

修改后

```
manage_dhcp: 1
```

#### 1.4.2 修改dhcp.templateCobbler模板

接下来看一下dhcp.templateCobbler模板，它存在于/etc/cobbler/dhcp.template。在大多数情况下，我们只需要修改下面代码块中的内容

```
subnet 192.168.1.0 netmask 255.255.255.0 {
     option routers             192.168.1.5;
     option domain-name-servers 192.168.1.1;
     option subnet-mask         255.255.255.0;
     range dynamic-bootp        192.168.1.100 192.168.1.254;
```

一般会修改subnet（子网），routers（网关），domain-name-servers（DNS），dynamic-bootp（IP段）

我的IP地址是192.168.3.129，网关是192.168.3.1,我的dhcp.template模板内容如下

```
subnet 192.168.3.0 netmask 255.255.255.0 {
     option routers             192.168.3.129;
     option domain-name-servers 192.168.3.1;
     option subnet-mask         255.255.255.0;
     range dynamic-bootp        192.168.3.100 192.168.3.254;
```

现在我已经配置好dhcp.template模板，只需要重启cobbler服务，执行cobblersync命令，会自动生成DHCP配置文件,并自动重启了DHCP服务

```bash
[root@localhost ~]# systemctl restart cobblerd
[root@localhost ~]# cobbler sync
task started: 2020-04-06_161705_sync
task started (id=Sync, time=Mon Apr  6 16:17:05 2020)
running pre-sync triggers
cleaning trees
removing: /var/lib/tftpboot/grub/images
copying bootloaders
copying: /var/lib/cobbler/loaders/pxelinux.0 -> /var/lib/tftpboot/pxelinux.0
copying: /var/lib/cobbler/loaders/menu.c32 -> /var/lib/tftpboot/menu.c32
copying: /var/lib/cobbler/loaders/yaboot -> /var/lib/tftpboot/yaboot
copying: /usr/share/syslinux/memdisk -> /var/lib/tftpboot/memdisk
copying: /var/lib/cobbler/loaders/grub-x86.efi -> /var/lib/tftpboot/grub/grub-x86.efi
copying: /var/lib/cobbler/loaders/grub-x86_64.efi -> /var/lib/tftpboot/grub/grub-x86_64.efi
copying distros to tftpboot
copying images
generating PXE configuration files
generating PXE menu structure
rendering DHCP files
generating /etc/dhcp/dhcpd.conf
rendering TFTPD files
generating /etc/xinetd.d/tftp
cleaning link caches
running post-sync triggers
running python triggers from /var/lib/cobbler/triggers/sync/post/*
running python trigger cobbler.modules.sync_post_restart_services
running: dhcpd -t -q
received on stdout:
received on stderr:
running: service dhcpd restart
received on stdout:
received on stderr: Redirecting to /bin/systemctl restart dhcpd.service

running shell triggers from /var/lib/cobbler/triggers/sync/post/*
running python triggers from /var/lib/cobbler/triggers/change/*
running python trigger cobbler.modules.manage_genders
running python trigger cobbler.modules.scm_track
running shell triggers from /var/lib/cobbler/triggers/change/*
*** TASK COMPLETE ***
```

查看/etc/dhcp/dhcpd.conf文件，会cobbler已经对DHCP进行了管理配置

代码块中是dhcpd.conf文件部分内容

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

## 2 自动安装系统

### 2.1注意事项

cobbler大量使用/var目录。/var/www/cobbler/ks\_mirror目录是所有发行和存储库文件的复制位置，因此每个导入的发行版将需要5-10GB的可用空间

### 2.2 挂载镜像

挂载镜像文件到mnt目录

```bash
[root@localhost ~]# ls /mnt/
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
[root@localhost ~]# ls /mnt/
CentOS_BuildTag  EFI  EULA  GPL  images  isolinux  LiveOS  Packages  repodata  RPM-GPG-KEY-CentOS-7  RPM-GPG-KEY-CentOS-Testing-7  TRANS.TBL
```

### 2.3 导入镜像

```bash
[root@localhost ~]# cobbler import --path=/mnt/ --name=Centos7-x86-64 --arch=x86_64
task started: 2020-04-06_163030_import
task started (id=Media import, time=Mon Apr  6 16:30:30 2020)
Found a candidate signature: breed=redhat, version=rhel6
Found a candidate signature: breed=redhat, version=rhel7
Found a matching signature: breed=redhat, version=rhel7
Adding distros from path /var/www/cobbler/ks_mirror/Centos7-x86-64-x86_64:
creating new distro: Centos7-64-x86_64
trying symlink: /var/www/cobbler/ks_mirror/Centos7-x86-64-x86_64 -> /var/www/cobbler/links/Centos7-64-x86_64
creating new profile: Centos7-64-x86_64
associating repos
checking for rsync repo(s)
checking for rhn repo(s)
checking for yum repo(s)
starting descent into /var/www/cobbler/ks_mirror/Centos7-x86-64-x86_64 for Centos7-64-x86_64
processing repo at : /var/www/cobbler/ks_mirror/Centos7-x86-64-x86_64
need to process repo/comps: /var/www/cobbler/ks_mirror/Centos7-x86-64-x86_64
looking for /var/www/cobbler/ks_mirror/Centos7-x86-64-x86_64/repodata/*comps*.xml
Keeping repodata as-is :/var/www/cobbler/ks_mirror/Centos7-x86-64-x86_64/repodata
*** TASK COMPLETE ***
```

-   参数path：挂载的光盘路径
-   参数name：自定义安装源（镜像）名称
-   arch无需指定该选项，因为通常会自动检测该选项。我们在此示例中这样做是为了防止发现多个体系结构。

如果在导入过程中未报告任何错误，则可以查看有关在导入过程中创建的发行版和配置文件的详细信息。

### 2.4 查看导入镜像详细信息

```bash
[root@localhost ~]# cobbler profile report Centos7-64-x86_64
Name                           : Centos7-64-x86_64
TFTP Boot Files                : {}
Comment                        :
DHCP Tag                       : default
Distribution                   : Centos7-64-x86_64
Enable gPXE?                   : 0
Enable PXE Menu?               : 1
Fetchable Files                : {}
Kernel Options                 : {}
Kernel Options (Post Install)  : {}
Kickstart                      : /var/lib/cobbler/kickstarts/sample_end.ks
Kickstart Metadata             : {}
Management Classes             : []
Management Parameters          : <<inherit>>
Name Servers                   : []
Name Servers Search Path       : []
Owners                         : ['admin']
Parent Profile                 :
Internal proxy                 :
Red Hat Management Key         : <<inherit>>
Red Hat Management Server      : <<inherit>>
Repos                          : []
Server Override                : <<inherit>>
Template Files                 : {}
Virt Auto Boot                 : 1
Virt Bridge                    : xenbr0
Virt CPUs                      : 1
Virt Disk Driver Type          : raw
Virt File Size(GB)             : 5
Virt Path                      :
Virt RAM (MB)                  : 512
Virt Type                      : kvm
```

### 2.5 替换ks文件

使用cobbler profile edit命令修改默认的ks文件

```
[root@localhost ~]# cobbler profile edit --distro=Centos7-64-x86_64 --name=Centos7-64-x86_64 --kickstart=/var/lib/cobbler/kickstarts/centos7-x86_64.ks
[root@localhost ~]# cobbler sync
task started: 2020-04-06_164936_sync
task started (id=Sync, time=Mon Apr  6 16:49:36 2020)
running pre-sync triggers
cleaning trees
removing: /var/www/cobbler/images/Centos7-64-x86_64
removing: /var/lib/tftpboot/pxelinux.cfg/default
removing: /var/lib/tftpboot/grub/images
removing: /var/lib/tftpboot/grub/grub-x86.efi
removing: /var/lib/tftpboot/grub/grub-x86_64.efi
removing: /var/lib/tftpboot/grub/efidefault
removing: /var/lib/tftpboot/images/Centos7-64-x86_64
removing: /var/lib/tftpboot/s390x/profile_list
copying bootloaders
copying: /var/lib/cobbler/loaders/pxelinux.0 -> /var/lib/tftpboot/pxelinux.0
copying: /var/lib/cobbler/loaders/menu.c32 -> /var/lib/tftpboot/menu.c32
copying: /var/lib/cobbler/loaders/yaboot -> /var/lib/tftpboot/yaboot
copying: /usr/share/syslinux/memdisk -> /var/lib/tftpboot/memdisk
copying: /var/lib/cobbler/loaders/grub-x86.efi -> /var/lib/tftpboot/grub/grub-x86.efi
copying: /var/lib/cobbler/loaders/grub-x86_64.efi -> /var/lib/tftpboot/grub/grub-x86_64.efi
copying distros to tftpboot
copying files for distro: Centos7-64-x86_64
trying hardlink /var/www/cobbler/ks_mirror/Centos7-x86-64-x86_64/images/pxeboot/vmlinuz -> /var/lib/tftpboot/images/Centos7-64-x86_64/vmlinuz
trying hardlink /var/www/cobbler/ks_mirror/Centos7-x86-64-x86_64/images/pxeboot/initrd.img -> /var/lib/tftpboot/images/Centos7-64-x86_64/initrd.img
copying images
generating PXE configuration files
generating PXE menu structure
copying files for distro: Centos7-64-x86_64
trying hardlink /var/www/cobbler/ks_mirror/Centos7-x86-64-x86_64/images/pxeboot/vmlinuz -> /var/www/cobbler/images/Centos7-64-x86_64/vmlinuz
trying hardlink /var/www/cobbler/ks_mirror/Centos7-x86-64-x86_64/images/pxeboot/initrd.img -> /var/www/cobbler/images/Centos7-64-x86_64/initrd.img
Writing template files for Centos7-64-x86_64
rendering DHCP files
generating /etc/dhcp/dhcpd.conf
rendering TFTPD files
generating /etc/xinetd.d/tftp
processing boot_files for distro: Centos7-64-x86_64
cleaning link caches
running post-sync triggers
running python triggers from /var/lib/cobbler/triggers/sync/post/*
running python trigger cobbler.modules.sync_post_restart_services
running: dhcpd -t -q
received on stdout:
received on stderr:
running: service dhcpd restart
received on stdout:
received on stderr: Redirecting to /bin/systemctl restart dhcpd.service

running shell triggers from /var/lib/cobbler/triggers/sync/post/*
running python triggers from /var/lib/cobbler/triggers/change/*
running python trigger cobbler.modules.manage_genders
running python trigger cobbler.modules.scm_track
running shell triggers from /var/lib/cobbler/triggers/change/*
*** TASK COMPLETE ***
```

如果sycn同步没有报错，可以使用cobbler profile report Centos7-64-x86\_64查看到默认ks文件已经替换

```bash
[root@localhost ~]# cobbler profile report Centos7-64-x86_64
Name                           : Centos7-64-x86_64
TFTP Boot Files                : {}
Comment                        :
DHCP Tag                       : default
Distribution                   : Centos7-64-x86_64
Enable gPXE?                   : 0
Enable PXE Menu?               : 1
Fetchable Files                : {}
Kernel Options                 : {}
Kernel Options (Post Install)  : {}
Kickstart                      : /var/lib/cobbler/kickstarts/centos7-x86_64.ks
Kickstart Metadata             : {}
Management Classes             : []
Management Parameters          : <<inherit>>
Name Servers                   : []
Name Servers Search Path       : []
Owners                         : ['admin']
Parent Profile                 :
Internal proxy                 :
Red Hat Management Key         : <<inherit>>
Red Hat Management Server      : <<inherit>>
Repos                          : []
Server Override                : <<inherit>>
Template Files                 : {}
Virt Auto Boot                 : 1
Virt Bridge                    : xenbr0
Virt CPUs                      : 1
Virt Disk Driver Type          : raw
Virt File Size(GB)             : 5
Virt Path                      :
Virt RAM (MB)                  : 512
Virt Type                      : kvm
```

到此安装系统部分已经完成了，只要保证机器与和cobbler服务器在同一网段，且第一启动项为PXE(网络)，安装程序会自动安装。不过此时选择系统时还需要手动选择。

## 3 自动重装系统

在准备要重新安装系统的机器上执行进行如下操作

1. 安装第epel源
```bash
[root@localhost ~]# yum install -y epel-release
```
2. 安装koan包
```bash
[root@localhost ~]# yum install -y koan
```
3. 使用koan命令查看可以安装系统
```bash
[root@localhost ~]# koan --server=192.168.3.129 --list=profiles
- looking for Cobbler at http://192.168.3.129:80/cobbler_api
Centos7-64-x86_64
```
4. 执行要重装的系统
```bash
[root@localhost ~]# koan --replace-self --server=192.168.3.129 --profile=Centos7-64-x86_64
- looking for Cobbler at http://192.168.3.129:80/cobbler_api
- reading URL: http://192.168.3.129/cblr/svc/op/ks/profile/Centos7-64-x86_64
install_tree: http://192.168.3.129/cblr/links/Centos7-64-x86_64
downloading initrd initrd.img to /boot/initrd.img_koan
url=http://192.168.3.129/cobbler/images/Centos7-64-x86_64/initrd.img
- reading URL: http://192.168.3.129/cobbler/images/Centos7-64-x86_64/initrd.img
downloading kernel vmlinuz to /boot/vmlinuz_koan
url=http://192.168.3.129/cobbler/images/Centos7-64-x86_64/vmlinuz
- reading URL: http://192.168.3.129/cobbler/images/Centos7-64-x86_64/vmlinuz
- ['/sbin/grubby', '--add-kernel', '/boot/vmlinuz_koan', '--initrd', '/boot/initrd.img_koan', '--args', '"ks=http://192.168.3.129/cblr/svc/op/ks/profile/Centos7-64-x86_64 ksdevice=link kssendmac lang= text "', '--copy-default', '--make-default', '--title=kick1586181560']
- ['/sbin/grubby', '--update-kernel', '/boot/vmlinuz_koan', '--remove-args=root']
- reboot to apply changes
```
5. 重启服务器
```bash
[root@localhost ~]# reboot
```

重启后系统会自动重装

## 4 cobbler自定义yum源

我的私网yum源地址：http://192.168.3.50/centos7

### 4.1 添加repo

使用add命令添加repo源

```bash
[root@localhost ~]# cobbler repo add --name=my_repo --mirror=http://192.168.3.50/centos7 --arch=x86_64 --breed=yum
```

### 4.2 同步

使用reposync命令同步yum源到本地

```bash
[root@localhost ~]# cobbler reposync
```

### 4.3 安装repo源

在安装系统时会在yum.repos.d下添加repo文件

```
[root@localhost ~]# cobbler profile edit --name=Centos7-64-x86_64 --repos="my_repo"
```

### 4.4 定期同步repl源

crontab实现

## 5 自定义安装系统

### 5.1 规划服务器

服务器mac地址：08:00:27:D8:D9:D0
服务器预分配IP：192.168.3.123
服务器预掩码：255.255.255.0
服务器预网关：192.168.3.1
服务器预DNS：202.106.0.20
服务器预分配主机名：node1

### 5.2 指定服务器安装配置

```bash
[root@localhost ~]# cobbler system add --name=centos-node1 --mac=08:00:27:D8:D9:D0 --profile=Centos7-64-x86_64 --ip-address=192.168.3.123 --subnet=255.255.255.0 --gateway=192.168.3.1 --interface=eth0 --static=1 --hostname=node1 --name-servers="202.106.0.20" --kickstart=/var/lib/cobbler/kickstarts/centos7-x86_64.ks
```

-   name：任务名称
-   mac：某个客户端匹配到这个mac地址，才分配上面的ip地址给它，否则拒绝分配IP，以及安装系统
-   profile：任务使用的profile
-   ip-address：指定分配给客户端的ip地址
-   subnet：掩码
-   gateway：网关
-   interface：这个任务使用cobbler服务器哪个网卡，跨网段安装
-   Static:静态IP
-   hostname：主机名
-   name-servers：DNS服务器名称
-   kickstart:kickstart模板路径

### 5.3 查看详情

```
[root@localhost ~]# cobbler system list
centos-node1
```

## cobbler常用参数

cobbler check 检查提示cobbler所需配置

cobbler import 新增一个 cobbler PXE开机选项(distros)

cobbler list 列出 cobber 提供的 distros 与 profile

cobbler report 列出cobbler详细(个别)信息

cobbler sync 修改配置后进行cobbler同步

cobbler reposync 同步repo源

cobbler distro (add , copy , edit , find , list , remove , rename , report) 与distros相关的系统参数

cobbler profile 查看cobbler 与profile 相关信息

## 参考

[cobbler3.1.1版本文档](https://cobbler.readthedocs.io/en/latest/)

---

> 本文迁移自作者 CSDN 博客，2020-04-06 首发于 CSDN，内容保持原貌。
