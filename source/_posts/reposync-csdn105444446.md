---
title: "reposync同步镜像源库到本地"
date: 2020-04-10 23:10:19
categories: [技术]
tags: [运维]
copyright_author: 张鹏
cover: /images/csdn/covers/reposync-csdn105444446.png
---

#### 文章目录

-   [reposync命令](#reposync_1)
-   [下载工具包](#_3)
-   [创建下载目录](#_9)
-   [获取repoid](#repoid_14)
-   [同步存储库](#_34)

## reposync命令

## 下载工具包

```bash
[root@localhost ~]# yum install -y yum-utils
```

-   reposync命令在yum-utils工具包中

## 创建下载目录

```bash
[root@localhost ~]# mkdir -p /data1/centos/$releasever
```

-   下载到本地的rpm包的存放目录

## 获取repoid

使用yum repolist获取repoid

```bash
[root@localhost data1]# yum repolist
Loaded plugins: fastestmirror, product-id, subscription-manager
This system is not registered to Red Hat Subscription Management. You can use subscription-manager to register.
Loading mirror speeds from cached hostfile
 * base: mirrors.aliyun.com
 * extras: mirrors.aliyun.com
 * updates: mirrors.aliyun.com
repo id                                                        repo name                                                                                              status
base                                                           CentOS-6 - Base - mirrors.aliyun.com                                                                    6,713
epel                                                           Extra Packages for Enterprise Linux 6 - x86_64                                                         12,587
extras                                                         CentOS-6 - Extras - mirrors.aliyun.com                                                                     47
updates                                                        CentOS-6 - Updates - mirrors.aliyun.com                                                                   952
repolist: 20,299
```

-   repoid有4个分别为base、epel、extras、updates。
-   在.repo文件中\[serverid\]就是repoid
-   serverid解释：用于区别各个不同的repository，必须有一个独一无二的名称。若重复后面的会覆盖前面的。

## 同步存储库

同步存储库时可以指定一个repoid，也可以指定多个repoid，当然前提是下载目录一致。

```bash
[root@localhost ~]# reposync -n --repoid=base --repoid=epel --repoid=extras --repoid=updates -p /data1/centos/$releasever
```

-   会自动创建以repoid命令的目录

---

> 本文迁移自作者 CSDN 博客，2020-04-10 首发于 CSDN，内容保持原貌。
