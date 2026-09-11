---
title: "MySQL 利用 frm 文件和 ibd 文件恢复表数据"
date: 2024-05-15 14:51:08
categories: [技术]
tags: [MySQL]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1667372283496-893f0b1e7c16?w=1600&q=80&fm=jpg
updated: 2026-09-11
---

MySQL 崩溃、实例起不来，手上又没有逻辑备份时，数据目录里的文件本身就是最后的救命稻草：`.frm` 存着表结构，`.ibd` 存着表数据和索引（InnoDB 独立表空间模式下每张表一个）。只要这两个文件还在，就能把它们挂回一个新实例里把数据捞出来。这篇按步骤走一遍。

## 环境与前提

- 有 MySQL 服务器的访问权限，且目标实例与源实例版本一致（版本差异会导致表空间不兼容）。
- 有足够的权限操作数据库文件和目录。
- 假设数据库为 mydb、表为 mytable，手上备份着 mytable.frm 和 mytable.ibd。

## 恢复步骤

### 1. 停掉 MySQL

恢复过程要直接动数据目录里的文件，先停服务避免写入冲突：

```bash
sudo systemctl stop mysql
```

### 2. 把文件复制到数据目录

把两个文件放进目标库对应的目录：

```bash
cp mytable.frm /var/lib/mysql/mydb/
cp mytable.ibd /var/lib/mysql/mydb/
```

### 3. 修正属主

mysql 进程要能读写这些文件：

```bash
sudo chown mysql:mysql /var/lib/mysql/mydb/mytable.frm
sudo chown mysql:mysql /var/lib/mysql/mydb/mytable.ibd
```

### 4. 配置表空间导入

编辑配置文件（如 /etc/my.cnf），加两行：

```
[mysqld]
innodb_force_recovery = 1
innodb_file_per_table = 1
```

`innodb_force_recovery = 1` 允许在受控状态下处理表空间；`innodb_file_per_table = 1` 确保独立表空间模式启用。

### 5. 启动 MySQL

```bash
sudo systemctl start mysql
```

### 6. 挂回表空间

![配图](/images/csdn/figures/mysql-frm-ibd-csdn138905640.png)

登录 mysql 命令行，执行：

```sql
USE mydb;
ALTER TABLE mytable DISCARD TABLESPACE;
ALTER TABLE mytable IMPORT TABLESPACE;
```

DISCARD 把当前空的表空间卸掉，IMPORT 则把刚放进目录的 .ibd 重新挂到表上。

### 7. 验证

```sql
SELECT * FROM mytable;
```

能看到预期数据，恢复就成功了。

### 8. 还原配置

`innodb_force_recovery` 是故障恢复用的参数，平时保持 0：

```
[mysqld]
innodb_force_recovery = 0
```

改完重启：

```bash
sudo systemctl restart mysql
```

## 注意事项

- 操作前把 mytable.frm、mytable.ibd 和原 mydb 目录再复制一份留底，导入失败时才有的回退。
- IMPORT TABLESPACE 要求表结构在位，所以 .frm 必须先放回数据目录，且两边 MySQL 版本要一致。
- innodb_force_recovery 只用于恢复场景，等级越高能做的操作越受限，恢复完立刻还原为 0。
- 这套方法恢复的是"文件级备份"，无法替代定期的 mysqldump 或物理备份，日常还是要做正规备份。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
