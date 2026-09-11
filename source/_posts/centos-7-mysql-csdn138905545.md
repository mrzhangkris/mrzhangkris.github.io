---
title: "在 CentOS 7 上安装 MySQL 数据库"
date: 2024-05-17 09:22:53
categories: [技术]
tags: [MySQL]
copyright_author: 张鹏
cover: /images/csdn/covers/centos-7-mysql-csdn138905545.png
---

MySQL 是一个广泛使用的开源关系型数据库管理系统，在Web应用程序中扮演着重要的角色。本文将指导你在 CentOS 7 系统上安装 MySQL 数据库。

##### 1\. 安装 MySQL

MySQL 在 CentOS 7 的默认软件仓库中可用。使用以下命令安装 MySQL：

```bash
sudo yum install mysql-server
```

##### 2\. 启动 MySQL 服务

安装完成后，启动 MySQL 服务并将其设置为开机自启动：

```bash
sudo systemctl start mysqld
sudo systemctl enable mysqld
```

##### 3\. 安全设置

运行以下命令来提高 MySQL 的安全性并设置 root 用户的密码：

```bash
sudo mysql_secure_installation
```

按照提示进行安全设置，包括设置 root 密码、删除匿名用户、禁止 root 远程登录等。

##### 4\. 验证安装

使用以下命令验证 MySQL 是否成功安装并正常运行：

```bash
sudo systemctl status mysqld
```

如果看到输出中包含 “active (running)”，则表示 MySQL 服务正在运行。

##### 5\. 登录 MySQL

使用以下命令登录到 MySQL 数据库：

```bash
mysql -u root -p
```

输入之前设置的 root 密码，即可进入 MySQL 命令行界面。

##### 6\. 测试连接

在 MySQL 命令行界面中，执行一些基本的 SQL 命令来测试数据库连接，例如：

```sql
SHOW DATABASES;
```

这将显示当前数据库服务器上的所有数据库列表。

##### 7\. 创建新用户（可选）

为了安全起见，可以创建一个新的 MySQL 用户并为其授予适当的权限。例如，创建一个名为 newuser 的用户并允许其从远程主机登录：

```sql
CREATE USER 'newuser'@'%' IDENTIFIED BY 'password';
GRANT ALL PRIVILEGES ON *.* TO 'newuser'@'%' WITH GRANT OPTION;
FLUSH PRIVILEGES;
```

##### 安装指定版本的操作

> 这里以安装MySQL5.7版本为例

首先，需要添加 MySQL YUM 仓库到系统中。可以通过下载并安装官方的仓库配置包来实现。

```bash
sudo yum install wget
wget https://dev.mysql.com/get/mysql57-community-release-el7-11.noarch.rpm
sudo rpm -Uvh mysql57-community-release-el7-11.noarch.rpm
```

一旦添加了仓库，就可以安装 MySQL 5.7 了。

```bash
sudo yum install mysql-community-server
```

安装完成后，需要启动 MySQL 服务，并设置为开机自启。

```bash
sudo systemctl start mysqld
sudo systemctl enable mysqld
```

MySQL 安装完成后会生成一个临时的 root 密码，你需要找到这个密码并修改。

```bash
sudo grep 'temporary password' /var/log/mysqld.log
sudo mysql_secure_installation
```

在运行 mysql\_secure\_installation 脚本时，它会提示你设置 root 用户的新密码，并询问你是否要配置其它安全选项。
后续操作参考步骤4到步骤7即可完成。

希望这篇指南对你有所帮助。如有任何问题或疑问，请在评论区留言。

---

> 本文迁移自作者 CSDN 博客，2024-05-17 首发于 CSDN，内容保持原貌。
