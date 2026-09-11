---
title: "MariaDB 安装（CentOS 7.6）"
date: 2023-11-03 14:54:52
categories: [技术]
tags: [MySQL]
copyright_author: 司南
cover: /images/csdn/covers/mariadb-csdn134203281.png
updated: 2026-09-11
---

记录一次在 CentOS 7.6 上装 MariaDB 的完整过程，包括设置开机自启和放开 root 远程访问。环境规划：

| 服务器 | IP 地址 |
| --- | --- |
| CentOS | 192.168.0.35 |

## 安装

用 yum 直接装客户端和服务端：

```bash
yum install mariadb mariadb-server -y
```

## 启动并设置开机自启

`enable --now` 一条命令同时完成"设为自启"和"立即启动"两件事：

```bash
systemctl enable mariadb --now
```

## 开启远程访问

默认 root 只能本机登录。进入 mysql 库改密码、授权远程连接：

```sql
use mysql;
UPDATE user SET PASSWORD=PASSWORD('root') where USER='root';
GRANT ALL ON *.* TO 'root'@'%' IDENTIFIED BY 'root';
FLUSH PRIVILEGES;
```

![配图](/images/csdn/figures/mariadb-csdn134203281.png)

逐条含义：

- `UPDATE user SET PASSWORD=...`：把 root 的密码改为 `root`。
- `GRANT ALL ON *.* TO 'root'@'%' IDENTIFIED BY 'root'`：授权 root 从任意主机（`%`）连接，权限覆盖所有库所有表，密码同样是 `root`。
- `FLUSH PRIVILEGES`：刷新权限表让改动立即生效。

## 验证

从另一台机器用 mysql 客户端连 `192.168.0.35`，用上面设置的账号密码能登录、能看到库列表，说明远程访问已经生效。

## 注意事项

- `root@'%'` 加弱密码等于把数据库裸奔在网络上，只适合内网测试环境；生产环境请换强密码、限定来源 IP，并按需收敛 ALL 权限。
- 这套 SQL 是 MariaDB/MySQL 5.x 的授权写法，MySQL 8.0 已经移除 `IDENTIFIED BY` 语法，注意版本差异。
- 改完记得 `FLUSH PRIVILEGES`，否则权限表不刷新，连接会被拒。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
