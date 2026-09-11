---
title: "CentOS 7 安装 MySQL：默认仓库与官方 5.7 源两种方式"
date: 2024-05-17 09:22:53
updated: 2026-09-11
categories: [技术]
tags: [MySQL]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1529078155058-5d716f45d604?w=1600&q=80&fm=jpg
---

这篇文章记录在 CentOS 7 上装 MySQL 的两条路：直接用系统仓库装，或者添加 MySQL 官方 YUM 仓库装指定版本（以 5.7 为例）。装完顺手把安全初始化和登录验证做完。

## 方式一：从默认仓库安装

### 1. 安装 MySQL

```bash
sudo yum install mysql-server
```

> 注：原文称 MySQL 在 CentOS 7 默认仓库中可用。实际使用时 CentOS 7 默认仓库通常只提供 MariaDB，要装 Oracle 官方的 MySQL 一般需要走下文添加官方仓库的方式，落地前先 `yum info mysql-server` 确认源里到底是谁。

### 2. 启动服务

启动 MySQL 并设为开机自启：

```bash
sudo systemctl start mysqld
sudo systemctl enable mysqld
```

### 3. 安全设置

运行安全初始化脚本，设置 root 密码并做基础加固：

```bash
sudo mysql_secure_installation
```

按提示逐项确认：设置 root 密码、删除匿名用户、禁止 root 远程登录等。

### 4. 验证安装

确认服务在正常运行：

```bash
sudo systemctl status mysqld
```

输出里出现 "active (running)" 就说明服务正常。

### 5. 登录

```bash
mysql -u root -p
```

输入刚设置的 root 密码，进入 MySQL 命令行界面。

### 6. 测试连接

在命令行里执行一条基本 SQL 验证：

```sql
SHOW DATABASES;
```

能列出当前服务器上的所有数据库，安装就算通了。

### 7. 创建新用户（可选）

为了不让应用直接用 root，可以建一个专用用户并授权。例如创建 newuser 并允许其从远程主机登录：

```sql
CREATE USER 'newuser'@'%' IDENTIFIED BY 'password';
GRANT ALL PRIVILEGES ON *.* TO 'newuser'@'%' WITH GRANT OPTION;
FLUSH PRIVILEGES;
```

## 方式二：安装指定版本（MySQL 5.7）

需要锁定版本时，添加 MySQL 官方 YUM 仓库再装。

先下载并安装官方仓库配置包：

```bash
sudo yum install wget
wget https://dev.mysql.com/get/mysql57-community-release-el7-11.noarch.rpm
sudo rpm -Uvh mysql57-community-release-el7-11.noarch.rpm
```

仓库就位后安装 5.7：

```bash
sudo yum install mysql-community-server
```

启动并设为开机自启：

```bash
sudo systemctl start mysqld
sudo systemctl enable mysqld
```

![配图](/images/csdn/figures/centos-7-mysql-csdn138905545.png)

MySQL 5.7 安装完成后会自动生成一个临时 root 密码，先从日志里找出来，再做安全初始化：

```bash
sudo grep 'temporary password' /var/log/mysqld.log
sudo mysql_secure_installation
```

mysql_secure_installation 会先要求输入这个临时密码，然后引导你设置新的 root 密码并逐项确认其它安全选项。

后续的验证、登录、测试和建用户，与方式一的步骤 4 到步骤 7 相同。

## 注意事项

- 安全初始化（mysql_secure_installation）是必做的一步，root 密码、匿名用户、远程 root 都在这一步处理掉。
- 5.7 的临时密码只出现在 /var/log/mysqld.log 里一次，装完就查，别等密码忘了才翻日志。
- `GRANT ALL PRIVILEGES ON *.* ... WITH GRANT OPTION` 给出的权限非常大，生产环境按实际需要收窄到具体库和表。
- 应用账号不要用 root，新建专用用户并只授予它用到的库的权限。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
