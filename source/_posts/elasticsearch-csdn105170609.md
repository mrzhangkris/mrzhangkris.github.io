---
title: "Elasticsearch 7.6.1 安装：tar 包手动部署并指定 JDK"
date: 2020-03-29 10:05:30
categories: [技术]
tags: [Elasticsearch]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1762163516269-3c143e04175c?w=1600&q=80&fm=jpg
updated: 2026-09-11
---

在 Linux 上快速跑起一个 Elasticsearch，用官方 tar 包手动部署是最直接的方式。这篇记录 Elasticsearch 7.6.1（no-jdk 版本，安装包内不含 JDK）的完整安装过程：先装好 JDK，创建专用用户，再解压、指定 JDK 路径、启动并验证。

## 基础环境的安装

先装几个基础工具：

```bash
yum install -y wget tar net-tools vim
```

Elasticsearch 依赖 Java 运行环境，用 `java --version` 查看 JDK 版本，若显示 not found 说明未安装 JDK。可以用 `yum search` 按关键字找安装包：

```bash
[root@localhost ~]# yum search "*jdk*"
Last metadata expiration check: 0:16:00 ago on Sat 28 Mar 2020 10:30:06 PM CST.
=============================================================================== Name & Summary Matched: *jdk* ===============================================================================
java-11-openjdk-demo.x86_64 : OpenJDK Demos 11
java-1.8.0-openjdk-demo.x86_64 : OpenJDK Demos 8
java-11-openjdk-jmods.x86_64 : JMods for OpenJDK 11
java-11-openjdk-src.x86_64 : OpenJDK Source Bundle 11
java-11-openjdk.x86_64 : OpenJDK Runtime Environment 11
java-1.8.0-openjdk-src.x86_64 : OpenJDK Source Bundle 8
java-11-openjdk.x86_64 : OpenJDK Runtime Environment 11
copy-jdk-configs.noarch : JDKs configuration files copier
copy-jdk-configs.noarch : JDKs configuration files copier
java-1.8.0-openjdk.x86_64 : OpenJDK Runtime Environment 8
java-11-openjdk-javadoc.x86_64 : OpenJDK 11 API documentation
java-1.8.0-openjdk-javadoc.noarch : OpenJDK 8 API documentation
java-11-openjdk-devel.x86_64 : OpenJDK Development Environment 11
java-1.8.0-openjdk-devel.x86_64 : OpenJDK Development Environment 8
java-11-openjdk-headless.x86_64 : OpenJDK Headless Runtime Environment 11
java-11-openjdk-headless.x86_64 : OpenJDK Headless Runtime Environment 11
java-1.8.0-openjdk-accessibility.x86_64 : OpenJDK 8 accessibility connector
java-1.8.0-openjdk-headless.x86_64 : OpenJDK Headless Runtime Environment 8
java-11-openjdk-javadoc-zip.x86_64 : OpenJDK 11 API documentation compressed in single archive
java-1.8.0-openjdk-javadoc-zip.noarch : OpenJDK 8 API documentation compressed in single archive
================================================================================== Summary Matched: *jdk* ===================================================================================
icedtea-web.noarch : Additional Java components for OpenJDK - Java browser plug-in and Web Start implementation
[root@localhost ~]#
[root@localhost ~]# yum install -y java-11-openjdk.x86_64
...
...
...
Complete!
[root@localhost ~]# java --version
openjdk 11.0.6 2020-01-14 LTS
OpenJDK Runtime Environment 18.9 (build 11.0.6+10-LTS)
OpenJDK 64-Bit Server VM 18.9 (build 11.0.6+10-LTS, mixed mode, sharing)

```

`yum search` 的作用就是根据关键字查找可安装的包，从结果里挑 `java-11-openjdk` 装上即可。

## 安装

### 创建 elasticsearch 用户和用户组

```bash
[root@localhost ~]# groupadd es
[root@localhost ~]# useradd es -g es
```

`groupadd` 创建用户组 es；`useradd` 创建用户 es，参数 `-g` 指定该用户属于 es 组。Elasticsearch 不能用 root 直接启动，所以要先备好一个普通用户。

### 下载并解压安装包

从 [Elasticsearch 官网](https://www.elastic.co/cn/downloads/elasticsearch)下载安装包。本文使用 elasticsearch-7.6.1 的 no-jdk 版本（安装包内不包含 JDK，所以前面要先装好 JDK）：

```bash
[es@localhost ~]$ wget https://artifacts.elastic.co/downloads/elasticsearch/elasticsearch-7.6.1-no-jdk-linux-x86_64.tar.gz
```

解压：

```bash
[es@localhost ~]$ tar -zxf elasticsearch-7.6.1-no-jdk-linux-x86_64.tar.gz
```

![配图](/images/csdn/figures/elasticsearch-csdn105170609.png)

### 在 elasticsearch-env 文件中添加 JDK 路径

no-jdk 版本不会自带 JDK，需要在启动脚本里指明 JAVA_HOME。编辑 elasticsearch-env 文件，大约在第 37 行（第一个 JAVA_HOME 的上一行）添加 `JAVA_HOME=jdk路径`：

```bash
[es@localhost ~]$ cd elasticsearch-7.6.1/bin/
[es@localhost bin]$ vim elasticsearch-env
```

本文的 JDK 路径是 `/usr/lib/jvm/java-11-openjdk-11.0.6.10-0.el8_1.x86_64`，写入时需要换成你自己的 JDK 路径。OpenJDK 默认安装在 /usr/lib/jvm/ 目录下。

### 启动 elasticsearch

```bash
[es@localhost bin]$ ./elasticsearch
```

### 验证

新开一个终端，用 curl 访问 9200 端口，有版本等信息返回说明启动成功：

```bash
[root@localhost ~]# curl 127.0.0.1:9200
{
  "name" : "localhost.localdomain",
  "cluster_name" : "elasticsearch",
  "cluster_uuid" : "hSy-Xh-vRfKfBngqyqdacg",
  "version" : {
    "number" : "7.6.1",
    "build_flavor" : "default",
    "build_type" : "tar",
    "build_hash" : "aa751e09be0a5072e8570670309b1f12348f023b",
    "build_date" : "2020-02-29T00:15:25.529771Z",
    "build_snapshot" : false,
    "lucene_version" : "8.4.0",
    "minimum_wire_compatibility_version" : "6.8.0",
    "minimum_index_compatibility_version" : "6.0.0-beta1"
  },
  "tagline" : "You Know, for Search"
}
[root@localhost ~]#

```

## 注意事项

- Elasticsearch 不允许以 root 身份启动，务必用前面创建的 es 用户来运行。
- no-jdk 版安装包不含 JDK，启动前必须在 elasticsearch-env 里写好 JAVA_HOME，否则起不来；不想配这一步也可以换用带 JDK 的安装包。
- 验证只看 9200 端口的返回即可，返回 JSON 里的 `version.number` 就是当前运行的版本号。
- 前台启动的进程跟着终端走，`./elasticsearch` 是前台运行，验证通过后按需改成后台方式托管。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
