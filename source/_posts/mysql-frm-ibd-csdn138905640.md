---
title: "MySQL 利用 frm 和 ibd 文件恢复表数据：DISCARD/IMPORT 实测"
date: 2024-05-15 14:51:08
categories: [技术]
tags: [MySQL]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1667372283496-893f0b1e7c16?w=1600&q=80&fm=jpg
updated: 2026-09-11
---

MySQL 崩溃、实例起不来，手上又没有逻辑备份时，数据目录里的文件本身就是最后的救命稻草：`.frm` 存着表结构，`.ibd` 存着表数据和索引（InnoDB 独立表空间模式下每张表一个）。只要这两个文件还在，就能把它们挂回一个新实例里把数据捞出来。这篇用一个 mysql:8.0 容器把整条恢复链路实跑一遍——能恢复什么、顺序错一步会发生什么、5.x 和 8.0 差在哪。

## 实验环境与版本边界

先说清楚环境，因为这套方法对版本高度敏感：

- 实测环境：Docker 容器 `mysql:8.0.46`（2026-09 实跑，下文所有输出都来自这次实验）。
- MySQL 5.x：每张表一对 `.frm`（表结构）+ `.ibd`（数据与索引）。
- MySQL 8.0 起：`.frm` 被移除，表结构存进数据字典（`mysql.ibd`），每张表的数据目录里只剩 `.ibd`。
- 前提：手上留着出事前的 `.ibd` 文件（最好连 `.frm` 一起），且目标实例与源实例大版本一致——版本不一致时表空间格式可能不兼容，IMPORT 直接失败。

一个版本判断原则：5.x 的恢复素材是"一对文件"，8.0 的恢复素材是"一个 `.ibd` + 一条一模一样的 `CREATE TABLE` 语句"。

## 核心机制一句话

这套操作走的是 InnoDB 的**可传输表空间**：`ALTER TABLE ... DISCARD TABLESPACE` 把表和数据目录里的 `.ibd` 断开连接（文件本身会被删掉），`ALTER TABLE ... IMPORT TABLESPACE` 再把一个外部的 `.ibd` 重新挂到表上。理解了"断开—挂回"这层关系，下面每一步为什么这么做就都通了。

## 实例一：备份 .ibd，模拟丢表，再挂回去

按真实事故的顺序走一遍。第一步，把表空间置为导出状态，趁锁定拷出一份一致性的 `.ibd`，这就是"手上的备份"：

```sql
USE mydb;
FLUSH TABLES mytable FOR EXPORT;
```

```bash
cp /var/lib/mysql/mydb/mytable.ibd /tmp/mytable.ibd.bak
```

第二步，模拟最坏情况——表没了，只剩备份文件。在目标实例上重建一张**结构完全相同**的空表：

```sql
USE mydb;
DROP TABLE mytable;
CREATE TABLE mytable (id INT PRIMARY KEY, name VARCHAR(50)) ENGINE=InnoDB;
```

第三步，把空表的空间卸掉。注意 `DISCARD` 之后数据目录里的 `mytable.ibd` 会被删除，目录里干干净净，这是正常现象，不是出错：

![配图1](/images/csdn/figures/mysql-frm-ibd-csdn138905640-1.png)

```sql
ALTER TABLE mytable DISCARD TABLESPACE;
```

第四步，把备份的 `.ibd` 放回数据目录并修正属主，然后挂回：

```bash
cp /tmp/mytable.ibd.bak /var/lib/mysql/mydb/mytable.ibd
chown mysql:mysql /var/lib/mysql/mydb/mytable.ibd
```

```sql
USE mydb;
ALTER TABLE mytable IMPORT TABLESPACE;
```

![配图2](/images/csdn/figures/mysql-frm-ibd-csdn138905640-2.png)

IMPORT 没有报错就是挂载成功了。用查询验证：

```sql
SELECT * FROM mytable;
```

实例里原来的三行数据（alice、bob、carol）完整回来了，恢复闭环。整条链路里最反直觉的是第三步：`DISCARD` 删文件不是事故，是流程的一部分。

## 实例二：顺序错一步，报错长什么样

上面的顺序是"先 `DISCARD`、再放文件、最后 `IMPORT`"。实跑时故意把顺序做错两次，把报错都记下来——遇到同款报错可以直接对号入座。

**错法一**：不执行 `DISCARD`，直接把备份 `.ibd` 覆盖进数据目录就 `IMPORT`。空表自己的 `.ibd` 还在数据字典里注册着，InnoDB 拒绝挂载：

```sql
ALTER TABLE mytable IMPORT TABLESPACE;
-- ERROR 1813 (HY000): Tablespace 'mydb/mytable' exists.
```

**错法二**：`DISCARD` 之后忘了把 `.ibd` 放回去就 `IMPORT`，InnoDB 找不到要挂的文件：

```sql
ALTER TABLE mytable IMPORT TABLESPACE;
-- ERROR 1812 (HY000): Tablespace is missing for table `mydb`.`mytable`.
```

![配图3](/images/csdn/figures/mysql-frm-ibd-csdn138905640-3.png)

对照一下正确顺序，三个动作环环相扣：`DISCARD`（腾出挂载点）→ 拷回 `.ibd`（备好素材）→ `IMPORT`（挂载）。1813 说明挂载点没腾出来，1812 说明素材没到位，两个报错分别对应顺序错的前后两种形态。

## 实例三：8.0 里 frm 去哪了

原文的操作对象是 `.frm` + `.ibd` 一对文件，这在 MySQL 5.x 是标准配置。但实测的 8.0 数据目录里，建完表之后只剩一个文件：

```bash
ls /var/lib/mysql/mydb/
# mytable.ibd
```

`.frm` 在 8.0 里被彻底移除，表结构信息进了全局数据字典。这意味着 8.0 的恢复流程里，"提供表结构"这个动作不再靠拷 `.frm`，而是靠**手工执行一条和原表完全一致的 `CREATE TABLE`**——列名、类型、索引、行格式都要对得上，否则 IMPORT 时校验不过。5.x 老目录升上来的读者，把"拷 frm"这一步在脑内替换成"建同结构空表"，其余流程不变。

## 一组配置对比：innodb_force_recovery 该不该加

原文流程里有一处需要修正认识的配置：恢复前在 `my.cnf` 里加 `innodb_force_recovery = 1`。这个参数的真实用途是**实例级损坏**时强制启动 InnoDB 做抢救，属于"实例起不来"场景；单纯做表空间导入，实例本身健康，实测 8.0.46 不加它全程无阻。

```
# 错：健康实例上例行加它——限制写入操作，平白引入风险
[mysqld]
innodb_force_recovery = 1

# 对：恢复完成后必须归 0（不改回会一直压制正常写入）
[mysqld]
innodb_force_recovery = 0
```

如果实例确实崩到起不来，先用它抢救启动，文件级恢复做完立刻归 0 重启——它不是恢复流程的常驻配置。

## 注意事项

- **恢复前先留底**。把 `.frm`、`.ibd` 和目标库目录各复制一份再动手，IMPORT 失败时才有退路，不留底等于拿唯一素材赌操作不失误。
- **版本与结构一致**。源和目标的大版本要一致；8.0 手工建表时列定义、索引、`ROW_FORMAT` 都要与原表相同，任何一个对不上都可能挂载失败或数据错乱。
- **属主别忽略**。手工拷进数据目录的文件属主是 root，mysql 进程读不了，`chown mysql:mysql` 这步省不得。
- **innodb_force_recovery 用完归 0**。它只服务故障抢救场景，等级越高能做的操作越受限，留着就是隐患。
- **这套方法不能替代备份**。它恢复的是"文件级最后手段"，前提恰好是文件还在；定期的 `mysqldump` 或物理备份才是日常，两者是保险绳和救生圈的关系。

## 小结

回到开头的场景：实例起不来、没有逻辑备份，数据目录里的 `.ibd` 就是最后能抓的东西。实跑下来的完整链路是：导出备份 `.ibd` → 目标端建同结构空表 → `DISCARD` 腾位 → 放文件、修属主 → `IMPORT` 挂回 → `SELECT` 验收。记住两个报错的含义——1813 是没先 `DISCARD`，1812 是忘了放文件——顺序对了，这套"文件级救命稻草"就能稳稳把数据捞回来。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
