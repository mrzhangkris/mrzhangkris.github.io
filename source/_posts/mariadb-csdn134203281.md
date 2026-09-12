---
title: "MariaDB 安装与远程访问配置（CentOS 7.6）"
date: 2023-11-03 14:54:52
categories: [技术]
tags: [MySQL]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1597852074816-d933c7d2b988?w=1600&q=80&fm=jpg
updated: 2026-09-11
---

记录一次在 CentOS 7.6 上装 MariaDB 的完整过程，包括设置开机自启和放开 root 远程访问。装完你能得到：一台本机可登录、远程可连接的 MariaDB 服务。文中安装与授权 SQL 已在 Rocky 9（MariaDB 10.5.29）容器复测，10.5 与 CentOS 7.6 自带 5.5 的行为差异在对应步骤标明。

环境规划：

| 服务器 | IP 地址 |
| --- | --- |
| CentOS | 192.168.0.35 |

## 前置条件

- CentOS 7.6，root 权限；
- yum/EPEL 仓库可用（`yum makecache` 不报错）；
- 3306 端口未占用、防火墙准备放行（远程访问需要）；
- 版本预期：CentOS 7.6 官方源自带 MariaDB 5.5.x——这影响后面授权 SQL 的写法，见"开启远程访问"一节的实测。

## 安装

用 yum 直接装客户端和服务端：

```bash
yum install mariadb mariadb-server -y
```

验证点：`rpm -q mariadb-server` 能看到版本号（CentOS 7.6 为 5.5.6x）。实测 Rocky 9 上包名相同，装到 10.5.29：

![配图1](/images/csdn/figures/mariadb-csdn134203281-1.png)

## 启动并设置开机自启

`enable --now` 一条命令同时完成"设为自启"和"立即启动"两件事：

```bash
systemctl enable mariadb --now
```

验证点：`systemctl is-active mariadb` 输出 `active`；`mysql -uroot -e "select version();"` 能打印版本号（root 默认免密登录本地）。

> 注：本篇容器复测环境中没有 systemd，服务进程用 mariadbd 直接启动；`systemctl enable --now` 的写法来自原文与官方文档，语义为"设自启 + 立即启动"。

## 开启远程访问

默认 root 只能本机登录。进入 mysql 库改密码、授权远程连接：

```sql
use mysql;
UPDATE user SET PASSWORD=PASSWORD('root') where USER='root';
GRANT ALL ON *.* TO 'root'@'%' IDENTIFIED BY 'root';
FLUSH PRIVILEGES;
```

逐条含义：

- `UPDATE user SET PASSWORD=...`：把 root 的密码改为 `root`。
- `GRANT ALL ON *.* TO 'root'@'%' IDENTIFIED BY 'root'`：授权 root 从任意主机（`%`）连接，权限覆盖所有库所有表，密码同样是 `root`。
- `FLUSH PRIVILEGES`：刷新权限表让改动立即生效。

**版本差异，实测警告**：这套 SQL 在 MariaDB 5.5（CentOS 7.6）有效，但在 10.4+ 的环境直接照抄会踩坑——实测 10.5 上 `UPDATE user SET PASSWORD=...` 跑完不报错，可查表发现密码被标成 `invalid`，等于没设；`GRANT ... IDENTIFIED BY` 语法 10.5 仍支持、执行成功：

![配图2](/images/csdn/figures/mariadb-csdn134203281-2.png)

10.4+ 改密码的正确姿势是 `ALTER USER 'root'@'localhost' IDENTIFIED BY 'root';`。原环境 5.5 不用动。

## 验证（含一个真实报错）

从另一台机器用 mysql 客户端连 `192.168.0.35`，账号密码能用、能列出库，远程访问即生效。实测中第一次连接被拒，报错原文如下——这是初始化后的常见情况，值得记下：

![配图3](/images/csdn/figures/mariadb-csdn134203281-3.png)

`Access denied for user 'root'@'f52cee1c0d34' (using password: YES)`——密码没错、授权也建了，问题出在**初始化自带的匿名用户**（`user` 表里 User 为空串的行）抢走了连接匹配。删掉它再连：

```sql
DROP USER ''@'localhost';
FLUSH PRIVILEGES;
```

实测删除后同一命令直接列出 `information_schema`、`mysql` 等库，`current_user()` 返回 `root@%`，闭环。

## 失败出口

- **想撤销远程授权**：`DROP USER 'root'@'%'; FLUSH PRIVILEGES;`
- **密码改坏了登不进**：mysqld_safe 跳过授权表启动（`--skip-grant-tables`）后重设，改完正常重启。
- **整套卸掉重来**：`yum remove mariadb mariadb-server` 后删除数据目录 `/var/lib/mysql`（删了数据就真没了），再重新 `yum install`。

## 注意事项

- `root@'%'` 加弱密码等于把数据库裸奔在网络上，只适合内网测试环境；生产环境请换强密码、限定来源 IP，并按需收敛 ALL 权限。
- 这套 SQL 是 MariaDB/MySQL 5.x 的授权写法，MySQL 8.0 已经移除 `IDENTIFIED BY` 语法，MariaDB 10.4+ 直接 UPDATE user 表也会失效，注意版本差异。
- 改完记得 `FLUSH PRIVILEGES`，否则权限表不刷新，连接会被拒。
- 装完建议跑一次 `mysql_secure_installation`：删匿名用户、禁 root 远程、移除 test 库——上面那个匿名用户坑它顺手就替你清了。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
