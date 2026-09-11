---
title: "ZooKeeper集群部署全攻略"
date: 2024-05-21 09:15:02
categories: [技术]
tags: [ZooKeeper]
copyright_author: 张鹏
cover: /images/csdn/covers/zookeeper-csdn138916515.png
---

Apache ZooKeeper是一个开源的分布式协调服务，用于管理大型分布式系统中的数据。ZooKeeper的核心是其简单的架构和API，它提供了如命名服务、配置管理、同步等功能。部署ZooKeeper集群时，确保高可用性和可靠性是非常关键的。本文将详细介绍如何在Linux环境下部署ZooKeeper集群，并指出部署过程中需要注意的问题。

### 系统和环境准备

本示例使用的是三个节点的ZooKeeper集群，操作系统为CentOS 7。确保所有节点之间网络互通，且时间同步。

#### 安装Java环境

ZooKeeper运行需要Java环境，因此首先需要确保所有节点上安装了Java。可以选择OpenJDK或Oracle JDK。

```bash
sudo yum install java-1.8.0-openjdk -y
java -version
```

#### 安装ZooKeeper

从Apache官网下载ZooKeeper的稳定版本，然后解压到所有服务器上相同的目录。

```bash
wget https://downloads.apache.org/zookeeper/zookeeper-3.7.0/apache-zookeeper-3.7.0-bin.tar.gz
tar -zxvf apache-zookeeper-3.7.0-bin.tar.gz -C /opt
mv /opt/apache-zookeeper-3.7.0-bin /opt/zookeeper
```

### 配置ZooKeeper集群

每个ZooKeeper节点的配置大致相同，但有一些特定的配置需要根据节点进行调整。

#### 创建配置文件

在/opt/zookeeper/conf目录下创建配置文件zoo.cfg。

```bash
cp /opt/zookeeper/conf/zoo_sample.cfg /opt/zookeeper/conf/zoo.cfg
vi /opt/zookeeper/conf/zoo.cfg
```

在zoo.cfg中添加以下内容：

```
tickTime=2000
initLimit=10
syncLimit=5
dataDir=/var/lib/zookeeper
clientPort=2181
server.1=zk1:2888:3888
server.2=zk2:2888:3888
server.3=zk3:2888:3888
```

-   **tickTime**：ZooKeeper中最基本的时间单位, 毫秒。
-   **initLimit**：Follower启动并与Leader同步的最长时间。
-   **syncLimit**：Leader与Follower之间请求和应答时间长度。
-   **dataDir**：存储内存数据库快照的位置。
-   **clientPort**：客户端连接的端口号。
-   **server.X**：X是服务器的唯一标识，zkX是服务器的主机名，后面的数字表示通信端口。

#### 配置节点ID

在每个节点的dataDir目录下创建一个名为myid的文件，文件内容为该节点的ID。

```bash
mkdir /var/lib/zookeeper
echo 1 > /var/lib/zookeeper/myid  # 在zk1节点上
echo 2 > /var/lib/zookeeper/myid  # 在zk2节点上
echo 3 > /var/lib/zookeeper/myid  # 在zk3节点上
```

### 启动和验证集群

在每个节点上启动ZooKeeper服务。

```bash
/opt/zookeeper/bin/zkServer.sh start
```

检查集群状态。

```bash
/opt/zookeeper/bin/zkServer.sh status
```

### 注意事项

1. **安全性**：在生产环境中，确保ZooKeeper的通信通过安全的网络进行。考虑使用ZooKeeper的内置ACL功能来保护数据。
2. **持久化存储**：选择高可靠性的存储设备来存放dataDir，因为这里包含了所有的投票和元数据信息。
3. **备份与恢复**：定期备份dataDir文件夹，以防节点故障导致的数据丢失。
4. **监控**：实施监控和报

---

> 本文迁移自作者 CSDN 博客，2024-05-21 首发于 CSDN，内容保持原貌。
