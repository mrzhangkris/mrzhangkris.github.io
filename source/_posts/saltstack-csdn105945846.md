---
title: "SaltStack学习之远程执行"
date: 2020-05-06 10:55:52
categories: [技术]
tags: [SaltStack]
copyright_author: 张鹏
cover: /images/csdn/covers/saltstack-csdn105945846.png
---

#### 文章目录

-   [相关文档](#_1)
-   [远程执行命令结构](#_9)
-   [远程执行命令主要组成](#_14)
-   [Targeting](#Targeting_20)
-   -   [与Minion ID有关的Target](#Minion_IDTarget_22)
    -   [与Minion ID无关的Target](#Minion_IDTarget_67)
-   [模块](#_105)
-   -   [常用的模块](#_121)
-   [返回结果](#_174)
-   -   [将数据返回到mysql服务器](#mysql_179)
-   [编写模块](#_298)

## 相关文档

远程执行文档：https://docs.saltstack.com/en/latest/topics/tutorials/modules.html

指定目标文档：https://docs.saltstack.com/en/master/topics/targeting/index.html

执行模块文档：https://docs.saltstack.com/en/latest/ref/modules/all/index.html

返回模块文档：https://docs.saltstack.com/en/master/ref/returners/all/index.html

## 远程执行命令结构

```
salt '<target>' <function> [arguments]
```

## 远程执行命令主要组成

1. 命令salt，这是固定不变的
2. 目标target
3. 模块function
4. 执行后结果返回,是由Returnners组件来做的

## Targeting

       指定那个或者是那些Minion运行

### 与Minion ID有关的Target

1. 指定Minion ID
```bash
[root@master-node1 ~]# salt "minion-node2" test.ping
minion-node2:
    True
```
2. 使用通配符
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

其他的linux通配符也可以

3. 使用列表
4.
5. 加参数-L,Minion ID间用逗号隔开
```bash
[root@master-node1 ~]# salt -L "master-node1,minion-node2" test.ping
minion-node2:
    True
master-node1:
    True
```
4. 正则表达式
5.
6. 使用-E参数
```bash
[root@master-node1 ~]# salt -E "minion(1|2)*" test.ping
minion-node2:
    True
```

### 与Minion ID无关的Target

1. 指定IP地址
```bash
[root@master-node1 ~]# salt -S "192.168.3.100" test.ping
master-node1:
    True
```
2. 指定子网
```bash
[root@master-node1 ~]# salt -S "192.168.3.0/24" test.ping
minion-node2:
    True
master-node1:
    True
```
3. 使用节点组

在Master配置文件中编写nodegroups

```bash
nodegroups:
  web: "L@master-node1,minion-node2"
```

重启master

```bash
systemctl restart salt-master
```

使用-N参数

```bash
[root@master-node1 ~]# salt -N web test.ping
minion-node2:
    True
master-node1:
    True
```

## 模块

salt使用Python写的，salt模块也就是.py文件。在Python软件包的目标目录(site-packages)/salt/modules下可以找到相关模块

例如我的salt

```
/usr/lib/python2.7/site-packages/salt/modules
```
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

1. network
```bash
获取标准域名
[root@master-node1 ~]# salt '*' network.get_fqdn
master-node1:
    master-node1
minion-node2:
    minion-node2
```

更多用法[传送门](https://docs.saltstack.com/en/latest/ref/modules/all/salt.modules.network.html#module-salt.modules.network)
2\. service

```bash
检查给定的服务是否可用
[root@master-node1 ~]# salt '*' service.available sshd
minion-node2:
    True
master-node1:
    True
[root@master-node1 ~]#
```

更多用法参考[传送门](https://docs.saltstack.com/en/latest/ref/modules/all/salt.modules.service.html#module-salt.modules.service)
3\. cp
可以直接使用salt-cp命令

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

更多用法[传送门](https://docs.saltstack.com/en/latest/ref/modules/all/salt.modules.cp.html#module-salt.modules.cp)
4\. status
控制Minion的状态系统

```bash
[root@master-node1 ~]# salt '*' state.show_top
minion-node2:
    ----------
master-node1:
    ----------
```

更多用法[传送门](https://docs.saltstack.com/en/latest/ref/modules/all/salt.modules.state.html#module-salt.modules.state)

## 返回结果

       由Returner实现。默认情况下，发送到Salt Minions的命令的返回值将返回到Slat Master。但Returner允许将返回的数据(Minion直接返回)发送到接受数据的任何系统。这意味着可以将返回数据发送到Redis，MySQL，elasticsearch或者其他的任何系统上

官方的文档:https://docs.saltstack.com/en/latest/ref/returners/all/index.html

### 将数据返回到mysql服务器

安装MySQL-python

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

创建数据库和表

```
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

远程访问

```
GRANT ALL PRIVILEGES ON *.* TO 'salt'@'%'IDENTIFIED BY 'salt' WITH GRANT OPTION;
FLUSH PRIVILEGES;
```

返回到数据库

```
[root@master-node1 ~]# salt "*" test.ping --return mysql
minion-node2:
    True
master-node1:
    True
```

若返回数据库出现问题，可以在/var/log/salt/minion文件中查看错误日志

## 编写模块

编写路径:/srv/salt/\_modules

Minion上外部模块存放路径:/var/cache/salt/minion/extmods/

官方文档:https://docs.saltstack.com/en/latest/ref/modules/index.html

编写模块

```
def list():
  ret = __salt__["cmd.run"]("df -h")
  return ret
```

刷新模块

```bash
salt "*" saltutil.sync_modules
```

执行模块

```bash
[root@master-node1 _modules]# salt "*" disk.list
minion-node2:
    Filesystem               Size  Used Avail Use% Mounted on
    devtmpfs                 475M     0  475M   0% /dev
    tmpfs                    487M   60K  487M   1% /dev/shm
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

---

> 本文迁移自作者 CSDN 博客，2020-05-06 首发于 CSDN，内容保持原貌。
