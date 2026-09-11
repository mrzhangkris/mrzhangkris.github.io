---
title: "MariaDB安装"
date: 2023-11-03 14:54:52
categories: [技术]
tags: [MySQL]
copyright_author: 张鹏
cover: /images/csdn/covers/mariadb-csdn134203281.png
---

本文在CentOS7.6上安装MariaDB

### 一、软件下载

使用yum命令安装MariaDB服务

-   命令: yum install mariadb mariadb-server

### 二、规划

| 服务器 | IP地址 |
| --- | --- |
| CentOS | 192.168.0.35 |

### 三、部署

-   安装MariaDB服务

```bash
yum install mariadb mariadb-server -y
```

-   将MariaDB服务加入到开机自启动后立即启动MariaDB

```bash
systemctl enable mariadb --now
```

-   开启远程访问

```sql
use mysql;
UPDATE user SET PASSWORD=PASSWORD('root') where USER='root';
GRANT ALL ON *.* TO 'root'@'%' IDENTIFIED BY 'root';
FLUSH PRIVILEGES;
```

-   验证
    ![远程访问MariaDB](/images/csdn/134203281-1.png)

---

> 本文迁移自作者 CSDN 博客，2023-11-03 首发于 CSDN，内容保持原貌。
