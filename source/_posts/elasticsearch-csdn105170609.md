---
title: "elasticsearch安装"
date: 2020-03-29 10:05:30
categories: [技术]
tags: [Elasticsearch]
copyright_author: 张鹏
cover: /images/csdn/covers/elasticsearch-csdn105170609.png
---

### 基础环境的安装

1. 安装基础命令
```bash
yum install -y wget tar net-tools vim
```
2. 安装JDK
3. 使用java --version命令查看jdk版本，若显示not found，说明未安装JDK，可以根据代码块内容安装JDK，也可以自行安装JDK。
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

-   yum search 根据关键字查找安装包

### 安装

1. 创建elasticsearch用户和用户组
```bash
[root@localhost ~]# groupadd es
[root@localhost ~]# useradd es -g es
```

-   groupadd创建用户组es
-   useradd创建用户es，参数-g是指定es用户属于es组

2. 下载elasticsearch安装包
3. 切换到es用户
```bash
[root@localhost ~]# su - es
```

在[Elasticsearch](https://www.elastic.co/cn/downloads/elasticsearch)下载安装包。文章中使用的是elasticsearch-7.6.1(no-jdk版本,安装包内不包含jdk)

```bash
[es@localhost ~]$ wget https://artifacts.elastic.co/downloads/elasticsearch/elasticsearch-7.6.1-no-jdk-linux-x86_64.tar.gz
```
3. 解压elasticsearch安装包
```bash
[es@localhost ~]$ tar -zxf elasticsearch-7.6.1-no-jdk-linux-x86_64.tar.gz
```
4. 在elasticsearch-env文件中添加jdk路径
5. 编辑elasticsearch-env文件，大约在37行(第一个JAVA\_HOME上一行)添加JAVA\_HOME=jdk路径
```bash
[es@localhost ~]$ cd elasticsearch-7.6.1/bin/
[es@localhost bin]$ vim elasticsearch-env

```

![在这里插入图片描述](/images/csdn/105170609-1.png)

-   /usr/lib/jvm/java-11-openjdk-11.0.6.10-0.el8\_1.x86\_64是我的jdk路径（这里需要改成你的jdk路径）
-   OpenJDK默认安装路径在/usr/lib/jvm/下

5. 启动elasticsearch
```bash
[es@localhost bin]$ ./elasticsearch
```
6. 验证
7. 新开一个终端，使用curl命令访问elasticsearch，有版本等信息返回说明elasticsearch启动成功
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

---

> 本文迁移自作者 CSDN 博客，2020-03-29 首发于 CSDN，内容保持原貌。
