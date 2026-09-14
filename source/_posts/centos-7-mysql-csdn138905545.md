---
title: "Rocky Linux 9 安装 MySQL 8.0（附 CentOS 7 / MySQL 5.7 差异）"
date: 2024-05-17 09:22:53
updated: 2026-09-14
categories: [技术]
tags: [MySQL]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1529078155058-5d716f45d604?w=1600&q=80&fm=jpg
---

在 Linux 上装 Oracle 的 MySQL，两条路：走发行版默认仓库，或添加 MySQL 官方仓库装指定版本。这条岔路在两个时代给出的答案完全相反——CentOS 7 的默认仓库里只有 MariaDB、没有 MySQL；而 Rocky Linux 9 的默认仓库直接提供 MySQL 8.0，一条 `dnf install` 就能装上。

本文主环境为 Rocky Linux 9，从安装、初始化到建库建号的全流程在容器里实测通过（MySQL 8.0.46）；CentOS 7 / MySQL 5.7 时代的入口报错与绕行办法保留在「历史版本差异」和「常见报错」，供仍在维护老机器的读者对照。

## 方式一：从默认仓库安装（Rocky Linux 9）

### 1. 安装 MySQL

```bash
dnf install mysql-server
```

el9 的 AppStream 仓库直接提供 MySQL 8.0 系列，实测装上的是 8.0.46。注意包名是 `mysql-server`——这与 CentOS 7 正好相反（那边同名命令会报无包，见历史版本差异）。

### 2. 初始化与启动

真实机器上，systemd 会在首次启动时自动初始化数据目录并拉起服务：

```bash
systemctl start mysqld
systemctl enable mysqld
```

容器内实测时没有 systemd，用等价的两步手工完成——先初始化数据目录，再直接拉起守护进程：

```bash
mysqld --initialize-insecure --user=mysql
/usr/libexec/mysqld --user=mysql &
```

`--initialize-insecure` 生成的 root@localhost 初始为空密码，仅限首次登录用；真实机器走 systemd 初始化的，root 默认走 auth_socket 免密（本机 socket 登录），同样是为了把"第一次进去"的门槛降到最低。

### 3. 验证安装并设置 root 密码

用空密码登录，确认版本和系统库：

```bash
mysql -u root --skip-password -e "SELECT VERSION(); SHOW DATABASES;"
```

实测输出里 `VERSION()` 返回 8.0.46，`SHOW DATABASES` 列出 information_schema、mysql、performance_schema、sys 四个系统库：

![配图2](/images/csdn/figures/centos-7-mysql-csdn138905545-2.png)

随后立刻给 root 设密码。交互式的安全初始化脚本会一次做完设密码、删匿名用户、禁远程 root：

```bash
mysql_secure_installation
```

### 4. 建库建用户（最小权限）

应用别直接用 root。建一个业务库和一个专用账号，只把权限授到这个库上：

```bash
mysql -u root -p <<'SQL'
CREATE DATABASE appdb;
CREATE USER 'newuser'@'%' IDENTIFIED BY 'Str0ng_pass-1';
GRANT ALL PRIVILEGES ON appdb.* TO 'newuser'@'%';
FLUSH PRIVILEGES;
SQL
```

实测这个账号从远程（-h 127.0.0.1 模拟）登录后，`SHOW DATABASES` 只能看到 `appdb` 和两个自带 schema——授权边界即所见边界，最小权限是能被直接验证的：

![配图2](/images/csdn/figures/centos-7-mysql-csdn138905545-2.png)

## 方式二：官方仓库锁定小版本

默认仓库的 8.0.x 随发行版滚动，想锁定或跟进 Oracle 的最新小版本，用官方仓库：从 [dev.mysql.com/downloads/repo/yum](https://dev.mysql.com/downloads/repo/yum/) 取 el9 的 `mysql80-community-release` RPM，`dnf install` 该 RPM 后，`dnf install mysql-community-server` 即走官方源。此路线本文未实测，步骤以官方文档为准；密钥、GPG 校验环节的坑在 CentOS 7 / 5.7 时代实测过一批，见下文常见报错，思路相通。

## 历史版本差异（CentOS 7 / MySQL 5.7）

CentOS 7 已于 2024-06-30 EOL，MySQL 5.7 也于 2023-10 停止官方支持，以下内容只在维护存量机器时有用：

- **默认仓库没有 MySQL**：`yum install mysql-server` 报 `No package mysql-server available.`——默认仓库只提供 MariaDB（CentOS 7.9 容器实测，输出见下图）。要 Oracle MySQL 必须走官方源；若 MariaDB 够用，`yum install mariadb-server` 即可。

![配图1](/images/csdn/figures/centos-7-mysql-csdn138905545-1.png)

- **5.7 的临时密码**：官方源安装 5.7 后，初始化会生成临时 root 密码，只出现在 `/var/log/mysqld.log` 里一次，装完就查：`grep 'temporary password' /var/log/mysqld.log`，再用 `mysql_secure_installation` 完成设置。8.0 的 el9 包不这么做（root 走 auth_socket / 空密码首登）。
- **系统源**：CentOS 7 EOL 后 yum 源需切 vault.centos.org 归档才能用（实测修复后可装）。

## 装坏了怎么办

清场重来很简单：`dnf remove mysql-server` 卸包，`rm -rf /var/lib/mysql` 删掉已初始化的数据目录，重新安装/启动时会再走一次初始化。CentOS 7 上对应的包名是 `mysql-community-server`（官方源）或 `mariadb-server`（MariaDB），数据目录同在 `/var/lib/mysql`。

## 常见报错

- **`No package mysql-server available.`**：CentOS 7 默认仓库没有 MySQL（实测复现），走官方源或改用 MariaDB。
- **`Failing package is: mysql-community-server-5.7.44-1.el7.x86_64`（GPG 校验失败）**：MySQL 官方密钥 2023 年已轮换，`rpm --import https://repo.mysql.com/RPM-GPG-KEY-mysql-2023` 导入新密钥后重试（实测复现与修复；导入后仍失败时可用 `--nogpgcheck` 变通，仅限 EOL 环境的临时安装）。
- **aarch64/ARM 机器上 `repomd.xml ... 404`**：MySQL 5.7 官方 el7 仓库没有 ARM 包（实测复现），ARM 机器走不了官方 5.7 源。
- **容器里 mysqld 报 `Operation not permitted` 起不来**：部分 Docker 桌面版/VM 的默认 seccomp 配置会拦住 mysqld 的启动调用，`--privileged` 或调整 seccomp 后正常（实测环境特有，普通 Linux 主机不受影响）。

## 注意事项

- 安全初始化（mysql_secure_installation）是必做的一步，root 密码、匿名用户、远程 root 都在这一步处理掉。
- 8.0 默认启用密码强度校验，`CREATE USER` 的弱密码会被直接拒绝，测试环境的密码也要凑够长度和复杂度。
- `GRANT ALL PRIVILEGES ON *.* ...` 给出的权限非常大，生产环境像本文示例那样收窄到具体库，新账号"看不到别的库"本身就是一道审计线。
- 应用账号不要用 root，新建专用用户并只授予它用到的库的权限。

两条路最终都指向同一个终点：mysqld 跑起来、root 密码在自己手里、`SHOW DATABASES` 列出库列表。区别只在入口——el9 的默认仓库直接给 MySQL 8.0，老机器上才需要与官方源的密钥问题纠缠。新部署没有理由再选 5.7：默认仓库的一条 `dnf install`，已经把事情做完了。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
