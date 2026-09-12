---
title: "Elasticsearch 7.6.1 安装：tar 包手动部署并指定 JDK"
date: 2020-03-29 10:05:30
categories: [技术]
tags: [Elasticsearch]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1762163516269-3c143e04175c?w=1600&q=80&fm=jpg
updated: 2026-09-11
---

在 Linux 上快速跑起一个 Elasticsearch，用官方 tar 包手动部署是最直接的方式。这篇记录 Elasticsearch 7.6.1（no-jdk 版本，安装包内不含 JDK）的完整安装过程：先装好 JDK，创建专用用户，再解压、指定 JDK 路径、启动并验证。每一步带验证点，关键报错都来自实跑。

装完你能得到什么：一个监听 9200 端口的单节点 ES，`curl 127.0.0.1:9200` 返回版本 JSON，集群健康 green。

## 前置条件

- 操作系统：Linux x86_64（本文实跑环境为 aarch64 容器 + ES 7.6.1 tar 包；x86_64 生产环境流程完全一致，个别平台相关报错见"常见报错"）
- JDK：11（ES 7.6.1 官方支持 JDK 11；no-jdk 版不含 JDK，必须先装）
- 权限：root（安装阶段）+ 一个普通用户（运行阶段，ES 拒绝 root 启动）
- 系统参数：`vm.max_map_count ≥ 262144`、文件描述符 ≥ 65536（ES 启动时的 bootstrap checks 会强制校验）
- 磁盘/内存：默认堆内存 1GB（-Xms1g -Xmx1g），数据盘预留空间

## 安装 JDK

先装基础工具，再装 JDK：

```bash
yum install -y wget tar net-tools vim
yum install -y java-11-openjdk.x86_64
```

验证点：`java --version` 输出 openjdk 11.x：

![配图1](/images/csdn/figures/elasticsearch-csdn105170609-1.png)

`yum search "*jdk*"` 可以按关键字列出仓库里所有 JDK 包（原文用这个方式找包名），从结果里挑 `java-11-openjdk` 装上即可。OpenJDK 默认安装在 /usr/lib/jvm/ 目录下，后面配 JAVA_HOME 要用这个路径。

## 创建 elasticsearch 用户和用户组

```bash
groupadd es
useradd es -g es
```

验证点：`id es` 输出 uid/gid。`groupadd` 创建用户组 es；`useradd` 创建用户 es，参数 `-g` 指定该用户属于 es 组。

为什么必须先建用户：**Elasticsearch 不允许以 root 身份启动**，这是硬性限制，root 直接跑会被拒绝（实测报错见后文）。所以要先备好一个普通用户。

## 下载并解压安装包

从 [Elasticsearch 官网](https://www.elastic.co/cn/downloads/elasticsearch)下载安装包。本文使用 elasticsearch-7.6.1 的 no-jdk 版本（安装包内不包含 JDK，所以前面要先装好 JDK）：

```bash
wget https://artifacts.elastic.co/downloads/elasticsearch/elasticsearch-7.6.1-no-jdk-linux-x86_64.tar.gz
tar -zxf elasticsearch-7.6.1-no-jdk-linux-x86_64.tar.gz
```

验证点：解压后出现 `elasticsearch-7.6.1/` 目录，里面有 bin/config/lib 等子目录。

> 实测注：上述下载 URL 于 2026-09 验证仍有效（HTTP 200，148MB）。

## 在 elasticsearch-env 文件中指定 JDK 路径

no-jdk 版本不自带 JDK，启动脚本找不到 Java 会直接报错：

```text
could not find java in bundled jdk at .../elasticsearch-7.6.1/jdk/bin/java
```

要在启动脚本的环境文件里指明 JAVA_HOME。编辑 bin/elasticsearch-env，找到判断 JAVA_HOME 的那一行（7.6.1 里是第 39 行的 `if [ ! -z "$JAVA_HOME" ]; then`），在它**上一行**插入赋值：

```bash
cd elasticsearch-7.6.1/bin/
vim elasticsearch-env
```

插入的内容（路径换成你自己的 JDK 路径，`ls -d /usr/lib/jvm/java-11-openjdk-*` 可以查到）：

```bash
# now set the path to java
JAVA_HOME=/usr/lib/jvm/java-11-openjdk-11.0.6.10-0.el8_1.x86_64
if [ ! -z "$JAVA_HOME" ]; then
  JAVA="$JAVA_HOME/bin/java"
  JAVA_TYPE="JAVA_HOME"
```

验证点：`grep JAVA_HOME bin/elasticsearch-env` 能看到插入的赋值行。

> 实测注：7.6.1 的 elasticsearch-env 里**没有**注释掉的 `#JAVA_HOME=` 行可以直接取消注释，只能手动在 if 判断前插入赋值——网上不少教程写"取消注释"，对着这个版本找不到那行注释是正常的。

## 系统参数调整

ES 启动时的 bootstrap checks 会强制校验两项系统参数，不达标直接拒绝启动（生产模式）：

```bash
# 虚拟内存映射数（root 执行）
sysctl -w vm.max_map_count=262144
echo 'vm.max_map_count=262144' >> /etc/sysctl.conf

# 文件描述符（对 es 用户生效）
echo 'es soft nofile 65536' >> /etc/security/limits.conf
echo 'es hard nofile 65536' >> /etc/security/limits.conf
```

验证点：`cat /proc/sys/vm/max_map_count` 输出 ≥ 262144；`su es -c 'ulimit -n'` 输出 65536。

## 启动 elasticsearch

把安装目录交给 es 用户，再以 es 身份启动：

```bash
chown -R es:es elasticsearch-7.6.1
su es
cd elasticsearch-7.6.1/bin/
./elasticsearch          # 前台启动
./elasticsearch -d -p /tmp/es.pid   # 后台启动并记录 PID
```

**如果忘了切用户、用 root 直接启动**，会看到实测抓到的这条报错——这是 ES 安装过程中最经典的拒绝：

![配图2](/images/csdn/figures/elasticsearch-csdn105170609-2.png)

## 验证

新开一个终端，用 curl 访问 9200 端口，有版本等信息返回说明启动成功：

```bash
curl 127.0.0.1:9200
```

验证点：返回 JSON，`version.number` 是 7.6.1。实测输出（节选）：

![配图3](/images/csdn/figures/elasticsearch-csdn105170609-3.png)

再确认集群健康状态：

```bash
curl '127.0.0.1:9200/_cluster/health?pretty'
```

单节点空集群应返回 `"status" : "green"`（实测结果）。如果显示 yellow，通常是副本分片无处分配（单节点没有第二个节点放副本），对空集群无影响，建索引时把 `number_of_replicas` 设 0 即可转 green。

## 常见报错

- **`could not find java in bundled jdk`**：no-jdk 版没配 JAVA_HOME，按上文在 elasticsearch-env 里插入赋值。不想配这一步也可以换用带 JDK 的安装包（文件名不带 -no-jdk）。
- **`can not run elasticsearch as root`**：用 root 启动了，切到普通用户（本文的 es）再跑。
- **`max virtual memory areas vm.max_map_count [65530] is too low`**：bootstrap check 拦截，按上文调 sysctl。
- **`max file descriptors [4096] for elasticsearch process is too low`**：同上，调 limits.conf 后重新登录 es 用户生效。
- **ARM 平台报 `X-Pack is not supported and Machine Learning is not available for [linux-aarch64]`**：7.6.1 的 ML 模块没有 ARM 构建。x86_64 生产环境不会遇到；ARM 环境实测在 config/elasticsearch.yml 加 `xpack.ml.enabled: false` 后可正常启动（其余 X-Pack 功能标记为 unsupported 但可用）。

## 注意事项

- Elasticsearch 不允许以 root 身份启动，务必用前面创建的 es 用户来运行；安装目录要 `chown -R es:es`，否则 es 用户写不了 data/logs 目录。
- no-jdk 版安装包不含 JDK，启动前必须在 elasticsearch-env 里写好 JAVA_HOME，否则起不来；不想配这一步也可以换用带 JDK 的安装包。
- 验证只看 9200 端口的返回即可，返回 JSON 里的 `version.number` 就是当前运行的版本号。
- `./elasticsearch` 是前台运行，进程跟着终端走；验证通过后按需改成 `-d` 后台方式或 systemd 托管。
- 堆内存默认 1GB，生产环境按机器内存的一半设置（改 config/jvm.options 里的 -Xms/-Xmx），且两个值要相等。
- 回退方案：tar 包部署没有系统服务残留，停掉进程（`kill $(cat /tmp/es.pid)`）、删掉解压目录即完全卸载；改过的 sysctl/limits 配置按需还原。

从装 JDK 到 curl 出 green，整个流程的坑集中在三处：no-jdk 版要手动指 JAVA_HOME、root 不能启动、bootstrap checks 拦系统参数。把这三关过了，tar 包部署的 ES 就是一个解压即用、删目录即卸载的干净存在。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。