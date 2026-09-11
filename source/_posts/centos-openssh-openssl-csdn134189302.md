---
title: "在 CentOS 7.6 上源码升级 OpenSSH 9.5p1 与 OpenSSL 3.1.4"
date: 2023-11-02 19:31:59
categories: [技术]
tags: [Linux]
copyright_author: 司南
cover: /images/csdn/covers/centos-openssh-openssl-csdn134189302.png
updated: 2026-09-11
---

老版本 OpenSSH 有已知漏洞时，最直接的修法就是源码升级。本文记录在 CentOS Linux release 7.6.1810 (Core) 上把 OpenSSH 升到 9.5p1、OpenSSL 升到 3.1.4 的全过程——这类操作的最大风险是把 SSH 弄断把自己锁在门外，所以保底方案放在前面讲。

## 软件下载

- CentOS 7.6.1810 Minimal ISO：阿里云镜像 [CentOS-7-x86_64-Minimal-1810.iso](https://mirrors.aliyun.com/centos-vault/7.6.1810/isos/x86_64/CentOS-7-x86_64-Minimal-1810.iso?spm=a2c6h.25603864.0.0.692812cfcN4RYI)
- OpenSSH 源码：官方下载页 [openssh.com/portable.html](https://www.openssh.com/portable.html)，阿里云镜像 [mirrors.aliyun.com/openssh/portable](https://mirrors.aliyun.com/openssh/portable/)
- OpenSSL 源码：官方下载 [openssl.org/source](https://www.openssl.org/source/)

本次使用的版本：

| 服务器版本 | 软件 | 包 |
| --- | --- | --- |
| CentOS Linux release 7.6.1810 (Core) | OpenSSH | [openssh-9.5p1.tar.gz](https://mirrors.aliyun.com/openssh/portable/openssh-9.5p1.tar.gz) |
| CentOS Linux release 7.6.1810 (Core) | OpenSSL | [openssl-3.1.4.tar.gz](https://www.openssl.org/source/openssl-3.1.4.tar.gz) |

## 升级前的规划

操作步骤按顺序走：

1. 确认服务器能否直接连接互联网
2. 确认依赖包与系统版本能对应上
3. 检查系统环境，确认安装（重启）后不会出现问题
4. 将 OpenSSH、OpenSSL、依赖包（备用）上传至目标服务器
5. 卸载 OpenSSH 和 OpenSSL
6. 用源或备用依赖包安装依赖
7. 安装 OpenSSL
8. 安装 OpenSSH
9. 将 SSH 添加开机启动并重启

两条保命建议：

> 防止操作失误：提前开启 telnet，出问题后通过 telnet 端口连服务器操作。
>
> 出现问题后：确保当前窗口不关闭；检查能否用源重装 OpenSSH 和 OpenSSL；检查能否上传 RPM 包到服务器；或开启 socket 通过端口传文件。

### 环境准备

先永久关闭 SELINUX：

```bash
setenforce 0
sed -i 's/^SELINUX=enforcing$/SELINUX=disabled/' /etc/selinux/config
sed -i 's/^SELINUX=enforcing$/SELINUX=disabled/' /etc/sysconfig/selinux
```

准备备用依赖包并上传到服务器（离线准备的技巧见文末附件）：

```text
cpp-4.8.5-44.el7.x86_64.rpm                     pam-1.1.8-23.el7.x86_64.rpm              perl-HTTP-Tiny-0.033-3.el7.noarch.rpm           perl-Socket-2.010-5.el7.x86_64.rpm
gcc-4.8.5-44.el7.x86_64.rpm                     pam-devel-1.1.8-23.el7.x86_64.rpm        perl-libs-5.16.3-299.el7_9.x86_64.rpm           perl-Storable-2.45-3.el7.x86_64.rpm
glibc-2.17-326.el7_9.x86_64.rpm                 perl-5.16.3-299.el7_9.x86_64.rpm         perl-macros-5.16.3-299.el7_9.x86_64.rpm         perl-Text-ParseWords-3.29-4.el7.noarch.rpm
glibc-common-2.17-326.el7_9.x86_64.rpm          perl-Carp-1.26-244.el7.noarch.rpm        perl-parent-0.225-244.el7.noarch.rpm            perl-threads-1.87-4.el7.x86_64.rpm
glibc-devel-2.17-326.el7_9.x86_64.rpm           perl-constant-1.27-2.el7.noarch.rpm      perl-PathTools-3.40-5.el7.x86_64.rpm            perl-threads-shared-1.43-6.el7.x86_64.rpm
glibc-headers-2.17-326.el7_9.x86_64.rpm         perl-Encode-2.51-7.el7.x86_64.rpm        perl-Pod-Escapes-1.04-299.el7_9.noarch.rpm      perl-Time-HiRes-1.9725-3.el7.x86_64.rpm
kernel-headers-3.10.0-1160.76.1.el7.x86_64.rpm  perl-Exporter-5.68-3.el7.noarch.rpm      perl-podlators-2.5.1-3.el7.noarch.rpm           perl-Time-Local-1.2300-2.el7.noarch.rpm
libgcc-4.8.5-44.el7.x86_64.rpm                  perl-File-Path-2.09-2.el7.noarch.rpm     perl-Pod-Perldoc-3.20-4.el7.noarch.rpm          zlib-1.2.7-20.el7_9.x86_64.rpm
libgomp-4.8.5-44.el7.x86_64.rpm                 perl-File-Temp-0.23.01-3.el7.noarch.rpm  perl-Pod-Simple-3.28-4.el7.noarch.rpm           zlib-devel-1.2.7-20.el7_9.x86_64.rpm
libmpc-1.0.1-3.el7.x86_64.rpm                   perl-Filter-1.49-3.el7.x86_64.rpm        perl-Pod-Usage-1.63-3.el7.noarch.rpm
mpfr-3.1.1-4.el7.x86_64.rpm                     perl-Getopt-Long-2.40-3.el7.noarch.rpm   perl-Scalar-List-Utils-1.27-248.el7.x86_64.rpm
```

安装依赖，有源用 yum，无源用本地 rpm：

```bash
# 有源
yum install gcc perl zlib zlib-devel pam-devel perl-IPC-Cmd -y

# 无源
rpm -Uvh /opt/yumsoft/*
```

然后卸载旧的 OpenSSH 和 OpenSSL。这一步要特别注意，否则很可能连不上服务器：操作后当前窗口不能断开，且 SSH 连接和 FTP 功能都会失效。

```bash
yum remove openssl openssl-devel openssh -y
```

## 升级 OpenSSL

下载源码：

```bash
wget https://www.openssl.org/source/openssl-3.1.4.tar.gz --no-check-certificate
```

`--no-check-certificate` 的作用是不检查证书。

解压并编译安装：

```bash
tar -zxvf openssl-3.1.4.tar.gz && cd openssl-3.1.4
./config shared zlib --prefix=/usr/local/openssl --openssldir=/usr/local/openssl/ssl
make -j4 && make install
```

参数说明：`--prefix` 指定安装目录；`--openssldir` 指定 SSL 配置目录，默认为 /usr/local/ssl；`shared` 生成动态链接库（`no-shared` 则不生成）。

配置软链接和动态库路径：

```bash
echo "/usr/local/lib64" >> /etc/ld.so.conf
ln -s /usr/local/openssl/bin/openssl /usr/bin/openssl
ln -s /usr/local/openssl/include/openssl /usr/include/openssl
ln -s /usr/local/openssl/lib64/libssl.so.3 /usr/lib/libssl.so.3
ln -s /usr/local/openssl/lib64/libcrypto.so.3 /usr/lib/libcrypto.so.3
ldconfig
```

确认版本：

```text
# openssl version
OpenSSL 3.1.4 24 Oct 2023 (Library: OpenSSL 3.1.4 24 Oct 2023)
```

## 升级 OpenSSH

下载源码：

```bash
wget https://mirrors.aliyun.com/openssh/portable/openssh-9.5p1.tar.gz
```

解压并编译安装，关键是把 openssl 指向上一步装好的路径：

```bash
tar -zxvf openssh-9.5p1.tar.gz && cd openssh-9.5p1
./configure --prefix=/usr --sysconfdir=/etc/ssh --with-openssl-includes=/usr/local/openssl/include/ --with-ssl-dir=/usr/local/openssl --with-zlib --with-md5-passwords --with-pam
make && make install
```

> 注：原文标注 make install 报权限问题可忽略。

参数说明：`--prefix` 指定安装目录；`--sysconfdir` 指定 SSH 配置目录；`--with-openssl-includes` 指定 openssl 头文件目录；`--with-ssl-dir` 指定 openssl 安装目录；`--with-zlib` 启用压缩库；`--with-md5-passwords` 启用 MD5 密码；`--with-pam` 启用 PAM 支持。

收尾配置：收紧主机密钥权限、写 sshd_config、复制启动脚本：

```bash
chmod 600 /etc/ssh/ssh_host_rsa_key
chmod 600 /etc/ssh/ssh_host_ecdsa_key
chmod 600 /etc/ssh/ssh_host_ed25519_key
echo "PermitRootLogin yes" >> /etc/ssh/sshd_config
echo "UseDNS no" >> /etc/ssh/sshd_config
cp -a contrib/redhat/sshd.init /etc/init.d/sshd
```

设置开机启动：

```bash
chmod +x /etc/init.d/sshd
chkconfig --add sshd
systemctl enable sshd
```

重启 SSH：

```bash
/etc/init.d/sshd restart
```

![配图](/images/csdn/figures/centos-openssh-openssl-csdn134189302.png)

验证版本：

```text
# ssh -V
OpenSSH_9.5p1, OpenSSL 3.1.4 24 Oct 2023
```

## 编译报错与离线依赖包

### 编译 OpenSSH 时报 UNPROTECTED PRIVATE KEY FILE

主机密钥文件权限过大，生成新 host keys 时报错：

```text
ssh-keygen: generating new host keys: DSA
/usr/sbin/sshd -t -f /etc/ssh/sshd_config
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
@         WARNING: UNPROTECTED PRIVATE KEY FILE!          @
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
Permissions 0640 for '/etc/ssh/ssh_host_rsa_key' are too open.
It is required that your private key files are NOT accessible by others.
This private key will be ignored.
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
@         WARNING: UNPROTECTED PRIVATE KEY FILE!          @
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
Permissions 0640 for '/etc/ssh/ssh_host_ecdsa_key' are too open.
It is required that your private key files are NOT accessible by others.
This private key will be ignored.
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
@         WARNING: UNPROTECTED PRIVATE KEY FILE!          @
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
Permissions 0640 for '/etc/ssh/ssh_host_ed25519_key' are too open.
It is required that your private key files are NOT accessible by others.
This private key will be ignored.
sshd: no hostkeys available -- exiting.
make: [check-config] Error 1 (ignored)
```

解决办法就是上面配置步骤中的三行 chmod 600：

```bash
chmod 600 /etc/ssh/ssh_host_rsa_key
chmod 600 /etc/ssh/ssh_host_ecdsa_key
chmod 600 /etc/ssh/ssh_host_ed25519_key
```

### 离线准备依赖包

新建一台相同版本的 Minimal 系统，用 downloadonly 把依赖拉下来。注意：系统中已经装过的包，downloadonly 不会下载。

```bash
mkdir /opt/yumsoft
yum install --downloadonly --downloaddir=/opt/yumsoft/ gcc perl zlib zlib-devel pam-devel
```

### 开启 Telnet 作保底

升级前先装好 telnet 通道，SSH 断了还有后路：

```bash
yum -y install telnet telnet-server xinetd
```

启动服务（防火墙开着的话需要放行 23 端口；升级完成后记得还原配置）：

```bash
# 允许 root 通过 telnet 登录 pts 终端
echo "pts/0" >> /etc/securetty
echo "pts/1" >> /etc/securetty

# 启动 xinetd 服务
systemctl start xinetd

# 启动 telnet 服务
systemctl start telnet.socket
```

## 注意事项

- 卸载 OpenSSH 前，保住当前已登录的窗口，并用 telnet 开一条备用通道，这是整个流程里最重要的防呆措施。
- 主机密钥必须是 600 权限，0640 会导致 sshd 拒绝加载密钥，编译检查阶段就会失败。
- 从 OpenSSH 6.7 开始默认关闭 TCP wrappers 支持，升级后 /etc/hosts.allow 和 /etc/hosts.deny 的配置将失效。
- 编译 OpenSSH 时要显式指定 --with-ssl-dir 指向新装的 OpenSSL，否则会链到系统旧库。
- 离线依赖用 downloadonly 提前拉包，已安装的包不会被下载，建议在干净的 Minimal 系统上操作。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
