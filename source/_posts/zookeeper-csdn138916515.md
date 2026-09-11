---
title: "ZooKeeper 集群部署：CentOS 7 三节点实战"
date: 2024-05-21 09:15:02
updated: 2026-09-11
categories: [技术]
tags: [ZooKeeper]
copyright_author: 司南
cover: /images/csdn/covers/zookeeper-csdn138916515.png
---

ZooKeeper 在分布式系统里干的活不算显眼，但缺了它很多组件跑不起来：配置管理、命名服务、分布式锁都靠它协调。这类组件的特点是一旦上线就轻易不动，所以第一次部署值得花心思装对。本文记录在 CentOS 7 上搭一套三节点 ZooKeeper 集群的完整过程，从装 Java 环境到集群验证。

## 系统和环境准备

示例环境是三台 CentOS 7 机器，下文用 zk1、zk2、zk3 指代。开始前确认两件事：节点之间网络互通，机器时间保持同步。

### 安装 Java 环境

ZooKeeper 是 Java 写的，所有节点都要先有 Java 环境。OpenJDK 和 Oracle JDK 都可以，用 yum 装 OpenJDK 最省事：

```bash
sudo yum install java-1.8.0-openjdk -y
java -version
```

第二条命令用来确认安装结果，能看到版本号输出就说明 Java 已经就位。

### 安装 ZooKeeper

从 Apache 官网下载稳定版，解压到所有服务器上相同的目录：

```bash
wget https://downloads.apache.org/zookeeper/zookeeper-3.7.0/apache-zookeeper-3.7.0-bin.tar.gz
tar -zxvf apache-zookeeper-3.7.0-bin.tar.gz -C /opt
mv /opt/apache-zookeeper-3.7.0-bin /opt/zookeeper
```

`tar` 的 `-C /opt` 表示把压缩包内容直接解到 /opt 下，最后一步把带版本号的长目录名改成短的 /opt/zookeeper，后面所有配置和启动命令都按这个路径来。

## 配置 ZooKeeper 集群

每个节点的配置大体相同，只有 myid 文件的内容需要按节点区分。

### 创建配置文件

ZooKeeper 自带一份示例配置，复制出来改：

```bash
cp /opt/zookeeper/conf/zoo_sample.cfg /opt/zookeeper/conf/zoo.cfg
vi /opt/zookeeper/conf/zoo.cfg
```

![配图](/images/csdn/figures/zookeeper-csdn138916515.png)

在 zoo.cfg 里写入集群配置：

```conf
tickTime=2000
initLimit=10
syncLimit=5
dataDir=/var/lib/zookeeper
clientPort=2181
server.1=zk1:2888:3888
server.2=zk2:2888:3888
server.3=zk3:2888:3888
```

几个关键参数的含义：

- **tickTime**：ZooKeeper 里最基本的时间单位，毫秒。
- **initLimit**：Follower 启动后与 Leader 完成同步的最长时间，超时会被判定异常。
- **syncLimit**：Leader 与 Follower 之间请求和应答的最大时限。
- **dataDir**：内存数据库快照的存放位置。
- **clientPort**：客户端连接端口。
- **server.X**：X 是节点的唯一标识，zkX 是对应主机名，后面两个数字分别是节点间通信端口和选举端口。

### 配置节点 ID

每个节点的 dataDir 目录下需要一个名为 myid 的文件，内容就是该节点在 zoo.cfg 里对应的那个数字：

```bash
mkdir /var/lib/zookeeper
echo 1 > /var/lib/zookeeper/myid  # 在zk1节点上
echo 2 > /var/lib/zookeeper/myid  # 在zk2节点上
echo 3 > /var/lib/zookeeper/myid  # 在zk3节点上
```

注意最后三条 echo 分别在三台机器上执行，myid 的内容必须和 zoo.cfg 里 server.X 的 X 一一对应，写错一个节点整个集群就对不上号。

## 启动和验证集群

三台机器分别启动服务：

```bash
/opt/zookeeper/bin/zkServer.sh start
```

然后检查状态：

```bash
/opt/zookeeper/bin/zkServer.sh status
```

正常情况下每台节点会报出自己是 Leader 还是 Follower，三台机器里应该恰好是一个 Leader 带两个 Follower。哪台报连不上集群，多数要回头查 myid 的内容或配置里的主机名。

## 注意事项

1. **安全性**：生产环境的 ZooKeeper 通信要走可信网络，可以用内置的 ACL 功能保护数据。
2. **持久化存储**：dataDir 放在高可靠性的存储设备上，这里存着投票和元数据信息。
3. **备份与恢复**：定期备份 dataDir 目录，防止单点故障带来数据丢失。
4. **监控**：上线后配上监控和报警，别等客户端报错才发现集群已经异常。
5. **端口互通**：zoo.cfg 里用到的 2181、2888、3888 端口需要跨节点可达，节点之间有防火墙时记得放行。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
