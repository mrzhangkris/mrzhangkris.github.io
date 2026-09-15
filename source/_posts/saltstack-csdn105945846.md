---
title: "SaltStack 远程执行：Targeting、常用模块与 Returner"
date: 2020-05-06 10:55:52
updated: 2026-09-14
categories: [技术, SaltStack]
tags: [SaltStack]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1667984390553-7f439e6ae401?w=1600&q=80&fm=jpg
---

装好 SaltStack 之后，日常用得最多的就是远程执行：一条命令让一批 Minion 同时干活。这篇把远程执行拆开讲——命令怎么构成、目标机器怎么圈定（Targeting）、有哪些常用模块、返回结果怎么落到外部系统（Returner），最后自己动手写一个模块。全部命令在 Rocky Linux 9 双容器集群（Salt 3005.4，Master/Minion 搭建见上一篇）上实测跑通，mysql Returner 部分连 MySQL 8 也一并实测。

相关文档：

- 远程执行文档：https://docs.saltstack.com/en/latest/topics/tutorials/modules.html
- 指定目标文档：https://docs.saltproject.io/en/latest/topics/targeting/index.html
- 执行模块文档：https://docs.saltproject.io/en/latest/ref/modules/all/index.html
- 返回模块文档：https://docs.saltproject.io/en/latest/ref/returners/all/index.html

## 远程执行命令结构

一条 salt 命令的骨架：

```text
salt '<target>' <function> [arguments]
```

四个组成部分：

1. 命令 `salt`，固定不变
2. 目标 target——决定哪些 Minion 执行
3. 模块 function——执行什么
4. 执行后结果返回，由 Returner 组件完成

## Targeting：先把要打的机器圈准

按是否依赖 Minion ID 分两类。

### 与 Minion ID 有关的 Target

| 方式 | 写法 | 示例 |
|------|------|------|
| 直接指定 ID | ID 字符串 | `salt "minion-node2" test.ping` |
| 通配符 | `*` `?` `[...]` | `salt "*-node[1|2]" test.ping` |
| 列表 | `-L`，逗号分隔 | `salt -L "master-node1,minion-node2" test.ping` |
| 正则 | `-E` | `salt -E "minion-node2" test.ping` |

实测输出（以通配符 `?` 和节点组为例，其余方式同形）：

![配图1](/images/csdn/figures/saltstack-csdn105945846-1.png)

### 与 Minion ID 无关的 Target

**按 grains 圈定**（`-G`，推荐）：`salt -G "os:Rocky" test.ping` 实测两台全中——按操作系统、角色这类 grains 属性选机器，比记 ID 更稳。

**按子网/IP 圈定**（`-S`）：`salt -S "192.168.3.0/24" test.ping` 可按 IP 或 CIDR 选机器。注意它依赖 Minion 的 `ipv4` grains——本次容器环境里该 grains 为空，`-S` 无匹配（实测结论）；常规宿主机/虚拟机环境不受影响，原文 CentOS 7 双机实测 `salt -S "192.168.3.100"` 与子网写法均正常。

**节点组**（`-N`）：先在 Master 配置文件定义组，重启 salt-master 生效后按组执行：

```yaml
nodegroups:
  web: "L@master-node1,minion-node2"
```

```bash
systemctl restart salt-master   # 容器内：kill 进程后 salt-master -d 重启
salt -N web test.ping
```

## 常用模块

Salt 是 Python 写的，模块就是 `.py` 文件。Rocky 9 上位于 `/usr/lib/python3.9/site-packages/salt/modules/`（CentOS 7 时代在 python2.7 路径下）。想了解某个函数的用法，直接看模块源码，每个函数的 docstring 就是说明书，比如 `test.py` 里的 `ping()`。

| 模块 | 用途 | 示例 |
|------|------|------|
| network | 网络信息查询 | `salt '*' network.get_fqdn` |
| service | 服务管理 | `salt '*' service.available sshd` |
| cp | 文件分发 | `salt-cp '*' /etc/hosts /opt/hosts-copy` |
| cmd | 远程执行命令 | `salt '*' cmd.run "df -h /"` |
| state / status | 状态系统 | `salt '*' state.show_top` |

network.get_fqdn 与文件分发验证的实测输出：

![配图2](/images/csdn/figures/saltstack-csdn105945846-2.png)

两个实测发现值得记录：`service.available salt-minion` 在无 systemd 的容器里返回 False（模块依赖 systemd/init 探测，宿主机上正常）；`state.show_top` 在还没有 top.sls 时返回空的 `----------` 结构，属正常现象而不是报错。

## Returner：把返回值落进外部系统

默认返回值回到 Master 终端打印；Returner 允许把数据由 Minion 直接写进 Redis、MySQL、Elasticsearch 等任意系统。以 mysql 为例，在 Rocky 9 + MySQL 8 上走通全流程。

**第 1 步：装数据库驱动。** Salt 的 mysql returner 严格 `import MySQLdb`，el9 对应的包是 EPEL 的 `python3-mysqlclient`（原文 CentOS 7 装的是 `MySQL-python`）：

```bash
dnf -y install python3-mysqlclient    # 每台 Minion 都要装
```

**第 2 步：建库建表。** 在 MySQL 上创建 `salt` 库和 `jids`、`salt_returns`、`salt_events` 三张表，并授权：

```sql
CREATE DATABASE `salt` DEFAULT CHARACTER SET utf8;
USE `salt`;

CREATE TABLE `jids` (
  `jid` varchar(255) NOT NULL,
  `load` mediumtext NOT NULL,      -- MySQL 8 必须写成 `load`
  UNIQUE KEY `jid` (`jid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `salt_returns` (
  `fun` varchar(50) NOT NULL,
  `jid` varchar(255) NOT NULL,
  `return` mediumtext NOT NULL,
  `id` varchar(255) NOT NULL,
  `success` varchar(10) NOT NULL,
  `full_ret` mediumtext NOT NULL,
  `alter_time` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY `id` (`id`), KEY `jid` (`jid`), KEY `fun` (`fun`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

GRANT ALL PRIVILEGES ON *.* TO 'salt'@'%' IDENTIFIED BY 'salt';
FLUSH PRIVILEGES;
```

> 注：`GRANT ... IDENTIFIED BY` 在 MySQL 8 已废弃，需先 `CREATE USER 'salt'@'%'` 再 GRANT；原文 DDL 里 `load` 不加反引号在 MySQL 5 可用，MySQL 8 会直接报语法错（实测踩过）。

**第 3 步：配置 Minion。** Returner 是 Minion 直接写库，所以连接配置放在**每台 Minion** 的 `/etc/salt/minion.d/ret.conf` 里，改完重启 salt-minion：

```yaml
mysql.host: 192.168.3.100
mysql.user: salt
mysql.pass: salt
mysql.db: salt
mysql.port: 3306
```

**第 4 步：带 `--return mysql` 执行并查库：**

![配图4](/images/csdn/figures/saltstack-csdn105945846-4.png)

返回值成功落进 `salt_returns` 表。若返回库异常，看 Minion 的 `/var/log/salt/minion` 日志，多数是授权或网络不通。

## 编写自定义模块

自定义模块放 Master 的 `/srv/salt/_modules/`，Minion 侧同步后缓存在 `/var/cache/salt/minion/extmods/`。写一个封装 `df -h` 的模块 `disk.py`：

```python
def list():
    ret = __salt__["cmd.run"]("df -h /")
    return ret
```

同步到各 Minion 后即可执行（模块名=文件名，函数名=`list`）：

![配图3](/images/csdn/figures/saltstack-csdn105945846-3.png)

两个实测经验：`__salt__["cmd.run"]` 里别塞管道——实测 `df -h / | tail -1` 被拆词传给 df 直接报 invalid option；写完模块必须 `saltutil.sync_modules`，否则执行报模块不存在。

## 注意事项

- **Target 先想清楚再执行**：通配符、`-L`、`-E`、`-S`、`-N`、`-G` 各有适用场景，范围圈错命令就会打到不该打的机器；拿不准先用 `test.ping` 验证圈中的机器列表。
- **nodegroups 改完必须重启 salt-master** 才生效，改配置不重启等于没改。
- **mysql Returner 是 Minion 直连数据库**：每台 Minion 都要装驱动并能连 MySQL，不只是 Master；排错看 `/var/log/salt/minion`。
- **MySQL 8 兼容**：DDL 里 `load` 加反引号、授权先 `CREATE USER`，原文的 MySQL 5 写法会直接报错。
- **自定义模块三步走**：`/srv/salt/_modules/` 写文件 → `saltutil.sync_modules` 同步 → `salt '*' 模块.函数` 执行；漏了第二步必报错。

## 历史版本差异（CentOS 7）

原文基于 CentOS 7.7 双机实测：模块路径在 `/usr/lib/python2.7/site-packages/salt/modules/`，mysql 驱动包名 `MySQL-python`。Rocky 9 上路径换成 `/usr/lib/python3.9/site-packages/salt/modules/`，驱动换成 `python3-mysqlclient`；命令结构、Targeting 语法、模块体系完全一致，MySQL 侧的差异集中在新版对保留字和授权语法收紧。老环境迁移时对照替换即可。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
