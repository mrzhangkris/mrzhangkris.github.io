---
title: "MariaDB 安装与远程访问配置：Rocky 9 实测，附 CentOS 7.6 差异"
date: 2023-11-03 14:54:52
categories: [技术]
tags: [MySQL]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1597852074816-d933c7d2b988?w=1600&q=80&fm=jpg
updated: 2026-09-14
---

原文是 2023 年 CentOS 7.6 上装 MariaDB 的操作记录。CentOS 7 已于 2024 年 6 月停止维护，本文按实测为准重写：**安装、授权 SQL、远程连接全部在 Rocky Linux 9.3（MariaDB 10.5.29）双容器环境复跑验证**，CentOS 7.6 的原始环境信息保留作对照——两代系统的行为差异（恰好在这套授权 SQL 上有个大坑）在对应步骤标明。装完你能得到：一台本机可登录、远程可连接的 MariaDB 服务。

环境规划：

| 服务器 | IP 地址 |
| --- | --- |
| Rocky Linux 9（原文为 CentOS 7.6） | 192.168.0.35 |

## 前置条件

- Rocky Linux 9（或同代 RHEL 系：AlmaLinux 9 / CentOS Stream 9），root 权限；CentOS 7.6 环境可照走，但 yum 源需切 vault（见注意事项）；
- 仓库可用（`dnf makecache` / `yum makecache` 不报错；RHEL 9 的 appstream 默认含 MariaDB 10.5）；
- 3306 端口未占用、防火墙准备放行（远程访问需要）；
- 版本预期：**Rocky 9 装到 MariaDB 10.5.x；CentOS 7.6 官方源自带的是 5.5.x**——这直接影响后面授权 SQL 的写法，见"开启远程访问"一节的实测。

## 安装

用包管理器直接装客户端和服务端（Rocky 9 上 `yum` 是 `dnf` 的别名，两个写法等价）：

```bash
yum install mariadb mariadb-server -y
```

验证点：`rpm -q mariadb-server` 能看到版本号——Rocky 9 实测装到 **10.5.29**（CentOS 7.6 为 5.5.6x），本地 root 免密登录即可查到运行版本：

![配图1](/images/csdn/figures/mariadb-csdn134203281-1.png)

## 启动并设置开机自启

`enable --now` 一条命令同时完成"设为自启"和"立即启动"两件事：

```bash
systemctl enable mariadb --now
```

验证点：`systemctl is-active mariadb` 输出 `active`；`mysql -uroot -e "select version();"` 能打印版本号（root 默认免密登录本地）。

> 注：本篇容器复测环境没有 systemd，服务进程用 `mariadbd --user=mysql` 直接启动（数据目录用 `mariadb-install-db` 初始化）；`systemctl enable --now` 的写法来自官方文档，语义为"设自启 + 立即启动"，实机照用。

## 开启远程访问

默认 root 只能本机登录。原文的做法是进 mysql 库改密码、再授权远程连接：

```sql
use mysql;
UPDATE user SET PASSWORD=PASSWORD('root') where USER='root';
GRANT ALL ON *.* TO 'root'@'%' IDENTIFIED BY 'root';
FLUSH PRIVILEGES;
```

**版本差异，实测警告**：这套 SQL 在 MariaDB 5.5（CentOS 7.6）有效，但 10.4+ 的 `mysql.user` 已经从表改成了视图，老写法直接失效——实测 10.5 上跑完 `UPDATE ... SET PASSWORD=...`，密码字段被标记成 `invalid`，等于没设；`GRANT ... IDENTIFIED BY` 语法在 10.5 仍支持、执行成功：

![配图2](/images/csdn/figures/mariadb-csdn134203281-2.png)

10.4+ 改密码的正确姿势是 `ALTER USER ... IDENTIFIED BY ...`，执行后密码哈希正常落库。原环境 5.5 不用动。

## 验证（从另一台机器连）

在客户端机器上连 `192.168.0.35`。全新初始化的服务，授权之前第一次连接必然被拒——报错原文值得记下，这是"服务在跑但没放行远程"的标志：

![配图3](/images/csdn/figures/mariadb-csdn134203281-3.png)

`ERROR 1130 (HY000): Host 'xxx' is not allowed to connect to this MariaDB server`——不是网络不通（能收到拒绝说明 3306 通了），是 `user` 表里还没有允许远程来源的行。补上 `GRANT ... TO 'root'@'%'` 并 `FLUSH PRIVILEGES` 后重试：客户端能列出 `information_schema`、`mysql` 等库，`select current_user()` 返回 `root@%`，闭环。

> 注：还有一个经典坑是初始化自带的匿名用户（`user` 表里 User 为空串的行，实测存在 `''@'localhost'` 与 `''@'<主机名>'` 两行）在某些来源匹配下抢走连接，报 `Access denied for user ... (using password: YES)`。本次干净双容器环境未复现该抢连，但它属于标准清理项——装完跑一次 `mysql_secure_installation` 会顺手删掉匿名用户、禁 root 远程、移除 test 库。

## 装完之后的常用位置

配置入口是 `/etc/my.cnf`，服务端配置在 `/etc/my.cnf.d/mariadb-server.cnf` 的 `[mysqld]` 段。两个最常改的项：`bind-address`（默认注释即监听所有网卡，只想本机用就改成 `127.0.0.1`，配合防火墙双保险）；`character-set-server=utf8mb4`（新库默认字符集，建库前定好省得日后转码）。

日常运维速查：

| 命令 / 路径 | 作用 |
|-------------|------|
| `systemctl status mariadb` | 服务状态与最近日志行 |
| `mariadb-admin -uroot -p status` | 不进 SQL 的轻量健康检查 |
| `mariadb-admin variables` | 全量运行参数（管道接 grep 查 port/datadir） |
| `/etc/my.cnf.d/mariadb-server.cnf` | 服务端主配置 |
| `/var/lib/mysql` | 数据目录（备份/迁移的核心） |

改配置后 `systemctl restart mariadb` 生效；用 `mariadb-admin variables` 或 `SHOW VARIABLES LIKE ...` 确认新值已加载。远程访问异常时按"服务状态 → 端口监听（`ss -tlnp | grep 3306`）→ 授权表 → 防火墙"的顺序排查，多数问题在前两步就能定位。

## 失败出口

- **想撤销远程授权**：`DROP USER 'root'@'%'; FLUSH PRIVILEGES;`
- **密码改坏了登不进**：以 `--skip-grant-tables` 启动后重设密码，改完正常重启。
- **整套卸掉重来**：`dnf remove mariadb mariadb-server` 后删除数据目录 `/var/lib/mysql`（删了数据就真没了），再重新安装。

## 注意事项

- `root@'%'` 加弱密码等于把数据库裸奔在网络上，只适合内网测试环境；生产环境请换强密码、限定来源 IP，并按需收敛 ALL 权限。
- 这套 SQL 是 MariaDB/MySQL 5.x 的授权写法，MySQL 8.0 已经移除 `IDENTIFIED BY` 语法，MariaDB 10.4+ 直接 UPDATE user 表也会失效，注意版本差异。
- 改完记得 `FLUSH PRIVILEGES`，否则权限表不刷新，连接会被拒。
- 防火墙记得放行 3306（`firewall-cmd --add-service=mysql --permanent && firewall-cmd --reload`），容器环境则确认端口可达——本次实验在容器网络上直连即可。
- CentOS 7.6 已于 2024-06 EOL：官方镜像源下线，`yum install` 前需把 repo 文件里的 `mirrorlist` 注释、`baseurl` 指到 `http://vault.centos.org` 再 `yum clean all`；vault 偶尔限流（403），稍后重试即可。这也是本文改用 Rocky 9 复测的原因之一。

## 小结

回到开头的环境规划：装（dnf）、起（enable --now）、通（GRANT + 正确的 ALTER）、验（远程 current_user() 返回 root@%）四步闭环，全程在 Rocky 9 + MariaDB 10.5.29 上实测通过。老环境照走前记住那个版本坑：5.5 用 UPDATE，10.4+ 一律 ALTER USER。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
