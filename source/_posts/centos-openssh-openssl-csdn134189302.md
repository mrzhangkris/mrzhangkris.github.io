---
title: "在 CentOS 7.6 上源码升级 OpenSSH 9.5p1 与 OpenSSL 3.1.4"
date: 2023-11-02 19:31:59
updated: 2026-09-11
categories: [技术]
tags: [Linux]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1608742213509-815b97c30b36?w=1600&q=80&fm=jpg
---

老版本 OpenSSH 有已知漏洞时，最直接的修法就是源码升级。这篇记录在 CentOS Linux release 7.6.1810 (Core) 上把 OpenSSH 升到 9.5p1、OpenSSL 升到 3.1.4 的全过程。这类操作最大的风险是把 SSH 弄断、把自己锁在门外，所以保底方案放在最前面讲。

> 版本锚定：CentOS 7.6.1810、OpenSSH 9.5p1、OpenSSL 3.1.4。编译与版本验证步骤已实测复现（Rocky Linux 9 容器，同版本源码）；CentOS 7 特有的服务管理部分来自原文实录。

## 软件准备

| 软件 | 版本 | 下载 |
| --- | --- | --- |
| OpenSSH | 9.5p1 | [官方 portable 页](https://www.openssh.com/portable.html)，[阿里云镜像](https://mirrors.aliyun.com/openssh/portable/) |
| OpenSSL | 3.1.4 | [openssl.org/source](https://www.openssl.org/source/) |

前置条件清单：

- CentOS 7.x 服务器，root 权限；能连互联网，或备好离线依赖包。
- 编译依赖：gcc、make、perl、zlib、zlib-devel、pam-devel、perl-IPC-Cmd（OpenSSL 3.x 的 Configure 脚本需要它，漏装会在 config 阶段报 perl 模块错误）。
- 离线场景：找一台**干净的同版本 Minimal 系统**执行 `yum install --downloadonly --downloaddir=/opt/yumsoft/ gcc perl zlib zlib-devel pam-devel` 把 rpm 拉下来随行携带。注意已安装过的包不会被下载，所以要在干净系统上操作。

## 升级前的保命措施

升级过程中 `yum remove openssh` 一执行，新的 SSH 连接就进不来了，全靠手头已登录的窗口收尾。两条铁律：

1. **提前开 telnet 备用通道**，SSH 断了还有后路：

```bash
yum -y install telnet telnet-server xinetd
echo "pts/0" >> /etc/securetty
echo "pts/1" >> /etc/securetty
systemctl start xinetd
systemctl start telnet.socket
```

2. **当前窗口绝不关闭**，直到新 sshd 验证通过。防火墙开着的话临时放行 23 端口；升级完成后记得关掉 telnet 服务并还原配置。

## 步骤一：环境准备

永久关闭 SELINUX，避免编译安装后的权限上下文问题：

```bash
setenforce 0
sed -i 's/^SELINUX=enforcing$/SELINUX=disabled/' /etc/selinux/config
```

安装编译依赖（有源用 yum，无源用本地 rpm：`rpm -Uvh /opt/yumsoft/*`）：

```bash
yum install gcc make perl zlib zlib-devel pam-devel perl-IPC-Cmd -y
```

验证点：`gcc --version` 与 `perl -MIPC::Cmd -e1` 都能正常执行，依赖才算齐。

## 步骤二：卸载旧版

```bash
yum remove openssl openssl-devel openssh -y
```

执行后 SSH 与 FTP 立即失效，这是预期行为——再次确认当前窗口还活着，再往下走。

## 步骤三：编译安装 OpenSSL

```bash
tar -zxvf openssl-3.1.4.tar.gz && cd openssl-3.1.4
./config shared zlib --prefix=/usr/local/openssl --openssldir=/usr/local/openssl/ssl
make -j4 && make install
```

参数说明：`--prefix` 指定安装目录；`--openssldir` 指定 SSL 配置目录；`shared` 生成动态链接库。

配置动态库路径与软链接：

```bash
echo "/usr/local/openssl/lib" >> /etc/ld.so.conf
ln -s /usr/local/openssl/bin/openssl /usr/bin/openssl
ln -s /usr/local/openssl/lib/libssl.so.3 /usr/lib/libssl.so.3
ln -s /usr/local/openssl/lib/libcrypto.so.3 /usr/lib/libcrypto.so.3
ldconfig
```

> 注：动态库实际目录随平台可能是 `lib` 也可能是 `lib64`，链接前先 `ls /usr/local/openssl/` 确认，写错路径 `openssl version` 会报 `libssl.so.3: cannot open shared object file`（实测复现过这一报错）。

## 步骤四：编译安装 OpenSSH

关键是 configure 时把 OpenSSL 指向刚装好的路径，否则会链到系统旧库：

```bash
tar -zxvf openssh-9.5p1.tar.gz && cd openssh-9.5p1
./configure --prefix=/usr --sysconfdir=/etc/ssh --with-openssl-includes=/usr/local/openssl/include/ --with-ssl-dir=/usr/local/openssl --with-zlib --with-md5-passwords --with-pam
make && make install
```

参数说明：`--sysconfdir` 指定 SSH 配置目录；`--with-ssl-dir` 指向新装 OpenSSL；`--with-pam` 启用 PAM 支持，配套要在 sshd_config 里保留 `UsePAM yes` 相关配置。

make install 阶段如果报 `Privilege separation user sshd does not exist`（实测输出：`make: [Makefile:385: check-config] Error 255 (ignored)`），原因是系统没有 sshd 用户——从旧版升级上来的机器一般已有，容器或极简系统上用 `useradd -r -d /var/empty sshd` 补一个即可。

收尾配置：主机密钥必须是 600 权限（常见报错见下一节），然后写 sshd_config、复制启动脚本、设置开机启动：

```bash
chmod 600 /etc/ssh/ssh_host_rsa_key /etc/ssh/ssh_host_ecdsa_key /etc/ssh/ssh_host_ed25519_key
echo "PermitRootLogin yes" >> /etc/ssh/sshd_config
echo "UseDNS no" >> /etc/ssh/sshd_config
cp -a contrib/redhat/sshd.init /etc/init.d/sshd
chmod +x /etc/init.d/sshd
chkconfig --add sshd
systemctl enable sshd
/etc/init.d/sshd restart
```

## 安装后验证

新开一个 SSH 会话（不要复用旧窗口）确认能登录，然后看版本：


版本行里两段信息都要核对：OpenSSH 是 9.5p1，且括号外显示的 OpenSSL 是 3.1.4——如果这里还显示系统旧版，说明 configure 时 `--with-ssl-dir` 没指对，ssh 链到了旧库，需要回到步骤四重编。

## 常见报错：UNPROTECTED PRIVATE KEY FILE

make install 或 sshd -t 检查配置时，主机密钥权限过大会直接失败，原文实录报错核心三行：

> WARNING: UNPROTECTED PRIVATE KEY FILE!
> Permissions 0640 for '/etc/ssh/ssh_host_rsa_key' are too open.
> sshd: no hostkeys available -- exiting.

三个 host key（rsa、ecdsa、ed25519）都改成 600 即可，就是收尾配置里那三行 chmod。

## 注意事项

- 卸载 OpenSSH 前，保住当前已登录的窗口并用 telnet 开备用通道，这是整个流程里最重要的防呆措施。
- 从 OpenSSH 6.7 开始默认关闭 TCP wrappers 支持，升级后 /etc/hosts.allow 和 /etc/hosts.deny 的配置将失效。
- 编译 OpenSSH 时要显式指定 `--with-ssl-dir` 指向新装的 OpenSSL，`ssh -V` 里核对 OpenSSL 版本才算升级闭环。
- OpenSSL 动态库目录（lib/lib64）先确认再写 ld.so.conf，路径错了命令直接起不来。
- 离线依赖用 downloadonly 提前拉包，已安装的包不会被下载，务必在干净的 Minimal 系统上操作。
- 升级完成、确认新 SSH 可登录后，停掉 telnet 服务（`systemctl stop telnet.socket xinetd`）并收回 23 端口放行。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
