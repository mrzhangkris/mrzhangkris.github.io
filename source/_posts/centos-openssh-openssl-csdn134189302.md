---
title: "源码编译 OpenSSH 9.5p1 与 OpenSSL 3.1.4：Rocky Linux 9 实测（附 CentOS 7 流程差异）"
date: 2023-11-02 19:31:59
updated: 2026-09-14
categories: [技术, Linux]
tags: [Linux]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1608742213509-815b97c30b36?w=1600&q=80&fm=jpg
---

系统自带的 OpenSSH/OpenSSL 版本落后、有已知漏洞，软件源又给不了新版时，源码编译是最直接的修法。这篇把 OpenSSH 9.5p1 与 OpenSSL 3.1.4 的完整编译升级流程记录下来，并在 Rocky Linux 9.3 容器里从头到尾实跑复现，过程中还踩到一个 RHEL 9 特有的坑：**新编译的旧版 sshd 读不了 el9 的 crypto-policies 配置**。这类操作最大的风险是把 SSH 弄断、把自己锁在门外，所以保命措施放在最前面讲。

## 软件准备

| 软件 | 版本 | 下载 |
| --- | --- | --- |
| OpenSSH | 9.5p1 | [官方 portable 页](https://www.openssh.com/portable.html)，[阿里云镜像](https://mirrors.aliyun.com/openssh/portable/) |
| OpenSSL | 3.1.4 | [openssl.org/source](https://www.openssl.org/source/old/3.1/) |

前置条件清单：

- root 权限；能连互联网，或备好离线依赖包（干净 Minimal 系统上 `dnf install --downloadonly --downloaddir=/opt/yumsoft/ <包名>` 提前拉包，已装过的包不会被下载）。
- 编译依赖：gcc、make、perl、zlib、zlib-devel、pam-devel、perl-IPC-Cmd（OpenSSL 3.x 的 Configure 需要，漏装报 perl 模块错误）。

## 升级前的保命措施

卸载旧版 OpenSSH 的瞬间，新的 SSH 连接就进不来了，全程只能靠手头已登录的会话收尾。两条铁律：

1. **提前开 telnet 备用通道**，SSH 断了还有后路（CentOS 7 的做法，命令来自原文实录）：

```bash
yum -y install telnet telnet-server xinetd
echo "pts/0" >> /etc/securetty
echo "pts/1" >> /etc/securetty
systemctl start xinetd telnet.socket
```

2. **当前窗口绝不关闭**，直到新 sshd 验证通过；防火墙临时放行 23 端口，收尾再收回。

## 步骤一：环境准备

永久关闭 SELINUX，避免编译安装后的权限上下文问题（容器内无此层，真机按需评估）：

```bash
setenforce 0
sed -i 's/^SELINUX=enforcing$/SELINUX=disabled/' /etc/selinux/config
```

安装编译依赖，`gcc --version` 与 `perl -MIPC::Cmd -e1` 能正常执行即依赖齐。先看一眼系统当前版本，升级才有对照：

![配图1](/images/csdn/figures/centos-openssh-openssl-csdn134189302-1.png)

## 步骤二：卸载旧版

```bash
dnf remove -y openssl openssh
```

执行后 SSH 立即失效，这是预期行为——再次确认当前窗口还活着，再往下走。

> 注：容器实测时为保留系统环境没有执行卸载，直接编译安装覆盖；真机按原文流程先卸载，效果一致（make install 覆盖同名文件）。

## 步骤三：编译安装 OpenSSL

```bash
tar -zxvf openssl-3.1.4.tar.gz && cd openssl-3.1.4
./config shared zlib --prefix=/usr/local/openssl \
  --openssldir=/usr/local/openssl/ssl
make -j"$(nproc)" && make install
```

参数说明：`--prefix` 指定安装目录；`--openssldir` 指定 SSL 配置目录；`shared` 生成动态链接库。装完确认版本和配置目录：

![配图2](/images/csdn/figures/centos-openssh-openssl-csdn134189302-2.png)

配置动态库路径与软链接（RHEL 9 上动态库目录就是 `lib`，链接前先 `ls /usr/local/openssl/` 确认，别惯性写 lib64）：

```bash
echo "/usr/local/openssl/lib" >> /etc/ld.so.conf
ln -s /usr/local/openssl/bin/openssl /usr/bin/openssl
ln -s /usr/local/openssl/lib/libssl.so.3 /usr/lib/libssl.so.3
ln -s /usr/local/openssl/lib/libcrypto.so.3 /usr/lib/libcrypto.so.3
ldconfig
```

> 注：写错路径 `openssl version` 会报 `libssl.so.3: cannot open shared object file`（实测复现过的报错），ldconfig 一下或改对路径即恢复。

## 步骤四：编译安装 OpenSSH

关键是 configure 时把 OpenSSL 指向刚装好的路径，否则会链到系统旧库：

```bash
tar -zxvf openssh-9.5p1.tar.gz && cd openssh-9.5p1
./configure --prefix=/usr --sysconfdir=/etc/ssh \
  --with-ssl-dir=/usr/local/openssl --with-zlib \
  --with-md5-passwords --with-pam
make && make install
```

参数说明：`--sysconfdir` 指定 SSH 配置目录；`--with-ssl-dir` 指向新装 OpenSSL；`--with-pam` 启用 PAM 支持，配套要在 sshd_config 里保留 `UsePAM yes` 相关配置。

make install 阶段有个容易被忽略的细节：install 会做一次 check-config（跑 `sshd -t`），失败时显示 `Error 255 (ignored)`——make 不拦截，但说明 sshd 此刻还起不来，**这个 ignored 必须当回事**：

![配图3](/images/csdn/figures/centos-openssh-openssl-csdn134189302-3.png)

另一类报错 `Privilege separation user sshd does not exist`，是系统没有 sshd 用户——升级上来的机器一般已有，极简系统上 `useradd -r -d /var/empty sshd` 补一个即可。

## RHEL 9 新坑：crypto-policies 与旧版 sshd

容器实测里 check-config 失败的根因就是它：RHEL 9 的 `/etc/ssh/sshd_config.d/50-redhat.conf` 把系统级 crypto-policies 配置 include 进来，其中的 `GSSAPIKexAlgorithms` 选项只有新版 OpenSSH 认识，**编译出来的 9.5p1 一读就报 Bad configuration option 退出**，客户端 ssh 同理。

处理：把两处 include 文件移开（或注释 sshd_config/ssh_config 里的 `Include` 行），让新 sshd 按自身能力协商算法：

![配图4](/images/csdn/figures/centos-openssh-openssl-csdn134189302-4.png)

`sshd -t` 通过、守护进程起来、新客户端能完成与 9.5p1 的密钥交换（known_hosts 已记下新 sshd 的 ED25519 主机密钥）——到这一步，升级在容器内的验证就闭环了。真机上还差最后半步：**新开一个 SSH 会话实际登录一次**再下结论。

## 收尾配置与安装后验证

主机密钥必须是 600 权限（常见报错见下一节），然后补 sshd_config 关键项、重启服务：

```bash
chmod 600 /etc/ssh/ssh_host_*_key
echo "PermitRootLogin yes" >> /etc/ssh/sshd_config
echo "UseDNS no" >> /etc/ssh/sshd_config
systemctl restart sshd        # CentOS 7 见文末差异：/etc/init.d/sshd restart
```

版本验证是升级闭环的硬标准：

![配图5](/images/csdn/figures/centos-openssh-openssl-csdn134189302-5.png)

版本行里两段信息都要核对：OpenSSH 9.5p1 加括号外的 OpenSSL 3.1.4；OpenSSL 还显示系统旧版，就是 `--with-ssl-dir` 没指对、链到了旧库，回步骤四重编。

## 常见报错

**UNPROTECTED PRIVATE KEY FILE**：主机密钥权限过大直接起不来。报错核心是 `WARNING: UNPROTECTED PRIVATE KEY FILE!` 加 `sshd: no hostkeys available -- exiting.`（原文实录），三个 host key（rsa、ecdsa、ed25519）都改成 600 即可，就是收尾配置里那条 chmod。

**Bad configuration option: GSSAPIKexAlgorithms**：见上一节，el9 的 crypto-policies include 与旧版 OpenSSH 不兼容，移开 include 文件恢复。

## 历史版本差异（CentOS 7）

| 项目 | CentOS 7（原文环境） | Rocky Linux 9（本文实测） |
|------|--------------------|------------------------|
| 卸载重装 | `yum remove openssh` | `dnf remove -y openssl openssh` |
| 服务管理 | `cp contrib/redhat/sshd.init /etc/init.d/sshd` + `chkconfig --add sshd` | 不需要，`systemctl restart sshd` |
| sshd 配置附加 | 只读 /etc/ssh/sshd_config | 额外 include sshd_config.d/（crypto-policies 坑的来源） |

CentOS 7 已 EOL，软件源需切 vault；这也是"源码编译"在老系统上仍值得掌握的原因——官方源给不了新版本时，它是唯一的路。

## 注意事项

- 卸载 OpenSSH 前，保住当前已登录的窗口并开好备用通道，每一步结束都先确认"还连得上"；升级完成、确认新 SSH 可登录后，停掉 telnet 服务（`systemctl stop telnet.socket xinetd`）并收回 23 端口放行。
- 从 OpenSSH 6.7 开始默认关闭 TCP wrappers 支持，升级后 /etc/hosts.allow 和 /etc/hosts.deny 的配置将失效。
- 编译 OpenSSH 时要显式指定 `--with-ssl-dir` 指向新装的 OpenSSL，`ssh -V` 里核对 OpenSSL 版本才算升级闭环。
- make install 末尾的 `Error 255 (ignored)` 是配置检查失败的信号，不是可以忽略的噪音——顺着它排 crypto-policies、host key 权限两类问题。
- 离线依赖用 downloadonly 提前拉包，已安装的包不会被下载，务必在干净的 Minimal 系统上操作。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
