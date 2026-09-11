---
title: "基于CentOS升级OpenSSH和OpenSSL"
date: 2023-11-02 19:31:59
categories: [技术]
tags: [Linux]
copyright_author: 张鹏
cover: /images/csdn/covers/centos-openssh-openssl-csdn134189302.png
---

本文基于CentOS Linux release 7.6.1810 (Core)升级OpenSSH和OpenSSL

### 一、软件下载

#### 1、CentOS7.6.1810-Minimal

阿里云开源镜像仓库：[https://mirrors.aliyun.com/centos-vault/7.6.1810/isos/x86\_64/](https://mirrors.aliyun.com/centos-vault/7.6.1810/isos/x86_64/CentOS-7-x86_64-Minimal-1810.iso?spm=a2c6h.25603864.0.0.692812cfcN4RYI)

#### 1、OpenSSH

官方下载：[https://www.openssl.org/source/](https://www.openssl.org/source/)

#### 2、OpenSSL

官方选择下载源：[https://www.openssh.com/portable.html](https://www.openssh.com/portable.html)
阿里云开源镜像仓库：[https://mirrors.aliyun.com/openssh/portable/](https://mirrors.aliyun.com/openssh/portable/)

### 二、规划

#### 1、操作步骤

1. 确认服务器能否能直接连接互联网
2. 确认依赖包与系统版本是否能对应上
3. 检查系统环境，确认安装（重启）后不会出现问题
4. 将OpenSSH、OpenSSL、依赖包（备用）上传至将要升级的服务器
5. 卸载OpenSSH和OpenSL
6. 使用源或者备用依赖包安装依赖
7. 安装OpenSSL
8. 安装OpenSSH
9. 将SSH添加开机启动并重启

> 防止操作失误的步骤：
>
> 1. 提前开启telnet
> 2. 通过telnet端口连接服务器进行操作

> 出现问题后相关操作：
>
> 1. 确保当前窗口不关闭
> 2. 检查能否使用源重新安装OpenSSH和OpenSSL
> 3. 检查能否上传OpenSSH和OpenSSL的RPM包到服务器
> 4. 开启socket通过端口将文件上传到服务器

#### 2、软件信息

| 服务器版本 | 软件信息 | 下载地址 |
| --- | --- | --- |
| CentOS Linux release 7.6.1810 (Core) | OpenSSH | [openssh-9.5p1.tar.gz](openssh-9.5p1.tar.gz) |
| CentOS Linux release 7.6.1810 (Core) | OpenSSL | [openssl-3.1.4.tar.gz](https://www.openssl.org/source/openssl-3.1.4.tar.gz) |

#### 3、环境准备

-   关闭SELINUX

> SELINUX需要永久关闭状态

```bash
setenforce 0
sed -i 's/^SELINUX=enforcing$/SELINUX=disabled/' /etc/selinux/config
sed -i 's/^SELINUX=enforcing$/SELINUX=disabled/' /etc/sysconfig/selinux
```

-   准备备用依赖包，上传备用依赖包到服务器

> 依赖包准备可以参考附件

```latex
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

-   安装依赖

> 可以使用yum安装，也可以使用rpm安装

```bash
# 有源
yum install gcc perl zlib zlib-devel pam-devel perl-IPC-Cmd -y

# 无源
rpm -Uvh /opt/yumsoft/*
```

-   删除OpenSSH和OpenSSL

> 这步需要特别注意，否则很可能操作做连接不上服务器
>
> 1. 操作后当前窗口不能断开连接
> 2. 操作后SSH连接和FTP功能都会失效

```bash
yum remove openssl openssl-devel openssh -y
```

### 三、升级OpenSSL

-   下载

```bash
wget https://www.openssl.org/source/openssl-3.1.4.tar.gz --no-check-certificate
```

> 参数说明：
>
> 1. no-check-certificate作用为不检查证书

-   解压并安装

```bash
tar -zxvf openssl-3.1.4.tar.gz && cd openssl-3.1.4
./config shared zlib --prefix=/usr/local/openssl --openssldir=/usr/local/openssl/ssl
make -j4 && make install
```

> 参数说明：
>
> 1. prefix作用为指定安装目录
> 2. openssldir作用为指定SSL安装目录，默认为/usr/local/ssl
> 3. shared作用生成动态链接库，no-shared 不生成动态链接库

-   配置

```bash
echo "/usr/local/lib64" >> /etc/ld.so.conf
ln -s /usr/local/openssl/bin/openssl /usr/bin/openssl
ln -s /usr/local/openssl/include/openssl /usr/include/openssl
ln -s /usr/local/openssl/lib64/libssl.so.3 /usr/lib/libssl.so.3
ln -s /usr/local/openssl/lib64/libcrypto.so.3 /usr/lib/libcrypto.so.3
ldconfig
```

-   查看版本

```
# openssl version
OpenSSL 3.1.4 24 Oct 2023 (Library: OpenSSL 3.1.4 24 Oct 2023)
```

### 四、升级OpenSSH

-   下载

```bash
wget https://mirrors.aliyun.com/openssh/portable/openssh-9.5p1.tar.gz
```

-   解压并安装

```bash
tar -zxvf openssh-9.5p1.tar.gz && cd openssh-9.5p1
./configure --prefix=/usr --sysconfdir=/etc/ssh --with-openssl-includes=/usr/local/openssl/include/ --with-ssl-dir=/usr/local/openssl --with-zlib --with-md5-passwords --with-pam
make && make install
```

> make install会报权限问题，可以忽略
> 参数说明:
>
> 1. prefix作用为指定安装目录
> 2. sysconfdir作用为指定SSH配置目录
> 3. with-openssl-includes作用为指定openssl的lib
> 4. with-ssl-dir作用为指定openssl安装目录
> 5. with-zlib作用为启用压缩库
> 6. with-md5-passwords作用为启用MD5 密码
> 7. with-pam作用为启用 PAM 支持

-   配置

```bash
chmod 600 /etc/ssh/ssh_host_rsa_key
chmod 600 /etc/ssh/ssh_host_ecdsa_key
chmod 600 /etc/ssh/ssh_host_ed25519_key
echo "PermitRootLogin yes" >> /etc/ssh/sshd_config
echo "UseDNS no" >> /etc/ssh/sshd_config
cp -a contrib/redhat/sshd.init /etc/init.d/sshd
```

-   设置开启启动

```bash
chmod +x /etc/init.d/sshd
chkconfig --add sshd
systemctl enable sshd
```

-   重启SSH

```bash
/etc/init.d/sshd restart
```

-   查看版本

```bash
# ssh -V
OpenSSH_9.5p1, OpenSSL 3.1.4 24 Oct 2023
```

### 五、附件

#### 1、编译OpenSSH时报错

> SSH文件权限过大，导致编译报错

```
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

> SSH文件权限过大的解决办法

```bash
chmod 600 /etc/ssh/ssh_host_rsa_key
chmod 600 /etc/ssh/ssh_host_ecdsa_key
chmod 600 /etc/ssh/ssh_host_ed25519_key
```

#### 2、依赖包准备

> 新建一个相同版本的Minimal系统，使用downloadonly下载，若系统中已经安装过某个包，downloadonly是不会下载该包的

```bash
mkdir /opt/yumsoft
yum install --downloadonly --downloaddir=/opt/yumsoft/ gcc perl zlib zlib-devel pam-devel
```

#### 3、开启Telnet登录

-   安装Telnet

```bash
yum -y install telnet telnet-server xinetd
```

-   启动服务

> 若开启防火墙处于开启状态，需要在防火墙中添加23端口
> 使用后需要还原配置

```bash
# 开启ssh访问
echo "pts/0" >> /etc/securetty
echo "pts/1" >> /etc/securetty

# 启动xinetd服务
systemctl start xinetd

# 启动telnet服务
systemctl start telnet.socket
```

#### 4、升级影响的功能

-   从OpenSSH6.7开始默认关闭TCPwrappers支持，也就说升级后/etc/hosts.allow和/etc/hosts.deny配置将失效

---

> 本文迁移自作者 CSDN 博客，2023-11-02 首发于 CSDN，内容保持原貌。
