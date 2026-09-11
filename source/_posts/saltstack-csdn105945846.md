---
title: "SaltStack 远程执行：Targeting、常用模块与 Returner"
date: 2020-05-06 10:55:52
updated: 2026-09-11
categories: [技术]
tags: [SaltStack]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1667984390553-7f439e6ae401?w=1600&q=80&fm=jpg
---

装好 SaltStack 之后，日常用得最多的就是远程执行：一条命令让一批 Minion 同时干活。这篇把远程执行拆开讲——命令怎么构成、目标机器怎么圈定（Targeting）、有哪些常用模块、返回结果怎么落到外部系统（Returner），最后自己动手写一个模块。

相关文档：

- 远程执行文档：https://docs.saltstack.com/en/latest/topics/tutorials/modules.html
- 指定目标文档：https://docs.saltstack.com/en/master/topics/targeting/index.html
- 执行模块文档：https://docs.saltstack.com/en/latest/ref/modules/all/index.html
- 返回模块文档：https://docs.saltstack.com/en/master/ref/returners/all/index.html

## 远程执行命令结构

一条 salt 命令的骨架：

```text
salt '<target>' <function> [arguments]
```

四个组成部分：

1. 命令 `salt`，固定不变
2. 目标 target
3. 模块 function
4. 执行后结果返回，由 Returner 组件完成

## Targeting

Targeting 解决"指定哪个或哪些 Minion 运行"的问题。按是否依赖 Minion ID，分为两类。

### 与 Minion ID 有关的 Target

**1. 直接指定 Minion ID：**

```bash
[root@master-node1 ~]# salt "minion-node2" test.ping
minion-node2:
    True
```

**2. 使用通配符**（其他 Linux 通配符也可以用）：

```bash
[root@master-node1 ~]# salt "*" test.ping
minion-node2:
    True
master-node1:
    True

[root@master-node1 ~]# salt "*-node[1|2]" test.ping
minion-node2:
    True
master-node1:
    True

[root@master-node1 ~]# salt "minion-node?" test.ping
minion-node2:
    True
```

**3. 使用列表**，加参数 `-L`，Minion ID 间用逗号隔开：

```bash
[root@master-node1 ~]# salt -L "master-node1,minion-node2" test.ping
minion-node2:
    True
master-node1:
    True
```

**4. 正则表达式**，使用 `-E` 参数：

```bash
[root@master-node1 ~]# salt -E "minion(1|2)*" test.ping
minion-node2:
    True
```

![配图](/images/csdn/figures/saltstack-csdn105945846.png)

### 与 Minion ID 无关的 Target

**1. 指定 IP 地址或子网**，使用 `-S` 参数：

```bash
[root@master-node1 ~]# salt -S "192.168.3.100" test.ping
master-node1:
    True
```

指定子网：

```bash
[root@master-node1 ~]# salt -S "192.168.3.0/24" test.ping
minion-node2:
    True
master-node1:
    True
```

**2. 使用节点组**。先在 Master 配置文件中编写 nodegroups：

```yaml
nodegroups:
  web: "L@master-node1,minion-node2"
```

重启 master 使配置生效：

```bash
systemctl restart salt-master
```

然后使用 `-N` 参数按组执行：

```bash
[root@master-node1 ~]# salt -N web test.ping
minion-node2:
    True
master-node1:
    True
```

## 模块

Salt 是用 Python 写的，salt 模块也就是 `.py` 文件。在 Python 软件包的目标目录（site-packages）`/salt/modules` 下可以找到相关模块。

以我的环境为例，路径是 `/usr/lib/python2.7/site-packages/salt/modules`。看一眼 `test.py` 就能明白模块长什么样：

```bash
[root@master-node1 modules]# ls test.py
test.py
[root@master-node1 modules]# cat test.py|grep ping
def ping():
    Used to make sure the minion is up and responding. Not an ICMP ping.
    ....
    ....
```

### 常用的模块

**network** — 网络信息查询，比如获取标准域名：

```bash
[root@master-node1 ~]# salt '*' network.get_fqdn
master-node1:
    master-node1
minion-node2:
    minion-node2
```

更多用法见 [network 模块文档](https://docs.saltstack.com/en/latest/ref/modules/all/salt.modules.network.html#module-salt.modules.network)。

**service** — 服务管理，比如检查给定的服务是否可用：

```bash
[root@master-node1 ~]# salt '*' service.available sshd
minion-node2:
    True
master-node1:
    True
```

更多用法参考 [service 模块文档](https://docs.saltstack.com/en/latest/ref/modules/all/salt.modules.service.html#module-salt.modules.service)。

**cp** — 文件分发，可以直接使用 `salt-cp` 命令把文件推到目标机器：

```bash
[root@master-node1 ~]# salt-cp "*" /etc/hosts /opt/test
master-node1:
    ----------
    /opt/test:
        True
minion-node2:
    ----------
    /opt/test:
        True
[root@master-node1 ~]# salt "*" cmd.run "ls -l /opt/test"
minion-node2:
    -rw-r--r--. 1 root root 158 May  5 22:43 /opt/test
master-node1:
    -rw-r--r--. 1 root root 158 May  5 14:43 /opt/test
```

更多用法见 [cp 模块文档](https://docs.saltstack.com/en/latest/ref/modules/all/salt.modules.cp.html#module-salt.modules.cp)。

**status / state** — 控制 Minion 的状态系统，比如查看当前 top 状态：

```bash
[root@master-node1 ~]# salt '*' state.show_top
minion-node2:
    ----------
master-node1:
    ----------
```

更多用法见 [state 模块文档](https://docs.saltstack.com/en/latest/ref/modules/all/salt.modules.state.html#module-salt.modules.state)。

## 返回结果

返回由 Returner 实现。默认情况下，发送到 Salt Minions 的命令的返回值会返回到 Salt Master。但 Returner 允许将返回的数据（由 Minion 直接返回）发送到接受数据的任何系统——Redis、MySQL、Elasticsearch 或者其他任何系统。

官方文档：https://docs.saltstack.com/en/latest/ref/returners/all/index.html

### 将数据返回到 MySQL 服务器

以 mysql returner 为例，走一遍完整流程。

安装 MySQL-python：

```bash
[root@master-node1 ~]# salt '*' state.single pkg.installed name=MySQL-python
minion-node2:
----------
          ID: MySQL-python
    Function: pkg.installed
      Result: True
     Comment: The following packages were installed/updated: MySQL-python
     Started: 17:18:05.458976
    Duration: 10416.322 ms
     Changes:
              ----------
              MySQL-python:
                  ----------
                  new:
                      1.2.5-1.el7
                  old:

Summary for minion-node2
------------
Succeeded: 1 (changed=1)
Failed:    0
------------
Total states run:     1
Total run time:  10.416 s
master-node1:
----------
          ID: MySQL-python
    Function: pkg.installed
      Result: True
     Comment: The following packages were installed/updated: MySQL-python
     Started: 09:18:07.241733
    Duration: 10736.052 ms
     Changes:
              ----------
              MySQL-python:
                  ----------
                  new:
                      1.2.5-1.el7
                  old:

Summary for master-node1
------------
Succeeded: 1 (changed=1)
Failed:    0
------------
Total states run:     1
Total run time:  10.736 s
```

在 MySQL 上创建数据库和表：

```sql
CREATE DATABASE  `salt`
  DEFAULT CHARACTER SET utf8
  DEFAULT COLLATE utf8_general_ci;

USE `salt`;

--
-- Table structure for table `jids`
--

DROP TABLE IF EXISTS `jids`;
CREATE TABLE `jids` (
  `jid` varchar(255) NOT NULL,
  `load` mediumtext NOT NULL,
  UNIQUE KEY `jid` (`jid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

--
-- Table structure for table `salt_returns`
--

DROP TABLE IF EXISTS `salt_returns`;
CREATE TABLE `salt_returns` (
  `fun` varchar(50) NOT NULL,
  `jid` varchar(255) NOT NULL,
  `return` mediumtext NOT NULL,
  `id` varchar(255) NOT NULL,
  `success` varchar(10) NOT NULL,
  `full_ret` mediumtext NOT NULL,
  `alter_time` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY `id` (`id`),
  KEY `jid` (`jid`),
  KEY `fun` (`fun`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

--
-- Table structure for table `salt_events`
--

DROP TABLE IF EXISTS `salt_events`;
CREATE TABLE `salt_events` (
`id` BIGINT NOT NULL AUTO_INCREMENT,
`tag` varchar(255) NOT NULL,
`data` mediumtext NOT NULL,
`alter_time` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
`master_id` varchar(255) NOT NULL,
PRIMARY KEY (`id`),
KEY `tag` (`tag`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
```

授权远程访问：

```sql
GRANT ALL PRIVILEGES ON *.* TO 'salt'@'%'IDENTIFIED BY 'salt' WITH GRANT OPTION;
FLUSH PRIVILEGES;
```

执行命令时加 `--return mysql`，结果就落库了：

```bash
[root@master-node1 ~]# salt "*" test.ping --return mysql
minion-node2:
    True
master-node1:
    True
```

若返回数据库出现问题，可以在 `/var/log/salt/minion` 文件中查看错误日志。

## 编写模块

自定义模块的编写路径：`/srv/salt/_modules`；Minion 上外部模块存放路径：`/var/cache/salt/minion/extmods/`。官方文档：https://docs.saltstack.com/en/latest/ref/modules/index.html

写一个模块，封装一条 `df -h`：

```python
def list():
  ret = __salt__["cmd.run"]("df -h")
  return ret
```

把模块同步到各 Minion：

```bash
salt "*" saltutil.sync_modules
```

执行自定义模块（模块文件名是磁盘相关的命名，函数名为 `list`）：

```bash
[root@master-node1 _modules]# salt "*" disk.list
minion-node2:
    Filesystem               Size  Used Avail Use% Mounted on
    devtmpfs                 475M     0  475M   0% /dev
    tmpfs                    487M  60K  487M   1% /dev/shm
    tmpfs                    487M  7.7M  479M   2% /run
    tmpfs                    487M     0  487M   0% /sys/fs/cgroup
    /dev/mapper/centos-root   17G  2.1G   15G  13% /
    /dev/sda1               1014M  137M  878M  14% /boot
    tmpfs                     98M     0   98M   0% /run/user/0
master-node1:
    Filesystem               Size  Used Avail Use% Mounted on
    devtmpfs                 475M     0  475M   0% /dev
    tmpfs                    487M  260K  486M   1% /dev/shm
    tmpfs                    487M  7.7M  479M   2% /run
    tmpfs                    487M     0  487M   0% /sys/fs/cgroup
    /dev/mapper/centos-root   17G  1.4G   16G   8% /
    /dev/sda1               1014M  137M  878M  14% /boot
    tmpfs                     98M     0   98M   0% /run/user/0
```

## 注意事项

- Target 的圈定方式先想清楚再执行：通配符、`-L` 列表、`-E` 正则、`-S` 子网、`-N` 节点组各有适用场景，用错范围命令就会打到不该打的机器。
- nodegroups 改完 Master 配置必须 `systemctl restart salt-master` 才生效。
- 想知道某个函数怎么用，直接去 site-packages 下的模块源码看，每个函数的 docstring 就是说明。
- Returner 的数据是由 Minion 直接写出的，所以每台 Minion 都要能连上 MySQL，而不只是 Master。
- 自定义模块同步用 `salt "*" saltutil.sync_modules`，写完不刷新就执行会报模块不存在。
- mysql returner 排错看 `/var/log/salt/minion` 日志，大多数是授权或网络不通。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
