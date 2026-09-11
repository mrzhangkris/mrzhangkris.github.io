---
title: "MySQL 利用frm文件和ibd文件恢复表数据"
date: 2024-05-15 14:51:08
categories: [技术]
tags: [MySQL]
copyright_author: 张鹏
cover: /images/csdn/covers/mysql-frm-ibd-csdn138905640.png
---

当MySQL数据库遭遇崩溃或数据丢失时，利用备份的 .frm 和 .ibd 文件恢复数据是一种有效的解决方案。.frm 文件包含表的结构信息，而 .ibd 文件则存储表的实际数据。本文将提供一个详细的步骤指南，演示如何利用这些文件恢复MySQL表数据。

##### 1\. 环境准备

确保你有MySQL服务器的访问权限，并且安装了相应的MySQL版本。此外，确保你有足够的权限来操作文件和数据库。

##### 2\. 数据库和表的基本设置

假设我们有数据库 mydb 和表 mytable。表的结构和数据由 mytable.frm 和 mytable.ibd 文件备份。

##### 3\. 准备数据恢复环境

在开始恢复数据之前，确保MySQL服务已停止，避免在恢复过程中发生数据冲突。

```bash
sudo systemctl stop mysql
```

##### 4\. 复制文件到数据库目录

将备份的 .frm 和 .ibd 文件复制到数据库目录下对应的位置。

```bash
cp mytable.frm /var/lib/mysql/mydb/
cp mytable.ibd /var/lib/mysql/mydb/
```

##### 5\. 修改文件权限

确保MySQL服务器有权访问这些文件。

```bash
sudo chown mysql:mysql /var/lib/mysql/mydb/mytable.frm
sudo chown mysql:mysql /var/lib/mysql/mydb/mytable.ibd
```

##### 6\. 配置MySQL以导入表空间

编辑MySQL的配置文件（例如 /etc/my.cnf），添加以下配置以启用表空间的导入：

```
[mysqld]
innodb_force_recovery = 1
innodb_file_per_table = 1
```

##### 7\. 启动MySQL服务器

```bash
sudo systemctl start mysql
```

##### 8\. 使用MySQL命令行恢复数据

登录到MySQL命令行工具，并执行以下命令来恢复表空间：

```sql
USE mydb;
ALTER TABLE mytable DISCARD TABLESPACE;
ALTER TABLE mytable IMPORT TABLESPACE;
```

##### 9\. 验证数据恢复

```sql
SELECT * FROM mytable;
```

执行上述命令，如果看到预期的数据，说明恢复成功。

##### 10\. 清理和重置配置

恢复完成后，记得将 innodb\_force\_recovery 设置回 0 并重启MySQL服务器，以恢复正常的数据库操作。

```
[mysqld]
innodb_force_recovery = 0
```

然后重启MySQL：

```bash
sudo systemctl restart mysql
```

##### 结论

使用 .frm 和 .ibd 文件恢复MySQL表数据是一种高效的方式，尤其适合在无法访问常规备份的情况下。通过上述步骤，即使在数据库严重故障后，你也能够恢复重要的数据。
希望这篇文章能帮助你理解和执行MySQL数据的恢复工作。如有任何疑问，请在评论区留言或联系专业技术支持。

---

> 本文迁移自作者 CSDN 博客，2024-05-15 首发于 CSDN，内容保持原貌。
