---
title: "Apache 平滑升级：从 2.4.41 到 2.4.46 的完整流程"
date: 2024-05-18 10:30:00
updated: 2026-09-11
categories: [技术]
tags: [运维]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1535957998253-26ae1ef29506?w=1600&q=80&fm=jpg
---

Apache 版本要升级时，直接卸旧装新会有一段服务中断。这篇文章记录的思路是：把新版本编译安装到一个独立目录，配置迁过去、单独起个端口测一遍，确认稳定后再做切换，把升级对线上服务的影响压到最低。照本文走完，你会得到新旧两套并存、随时可反向切换的 Apache 环境。

本文的双版本并行流程在 RockyLinux 9 容器实测验证：旧版本跑 80 端口的同时，新版本在 8080 独立测试，互不影响；涉及的版本输出均来自实跑。

## 前提条件

- 一台装好 Apache HTTP Server 的 Linux 服务器，root 或 sudo 权限；
- 编译环境：gcc、make、pcre-devel、expat-devel、openssl-devel（实测在 RHEL 9 系上一条 `yum install` 装齐）；
- 升级前已备份当前 Apache 的配置文件和关键数据。

还有一个下载层面的前提：2.4.46 这类历史版本已不在 [httpd.apache.org](http://httpd.apache.org/) 的主下载列表里，要从 [archive.apache.org/dist/httpd](https://archive.apache.org/dist/httpd/) 取。apr、apr-util 两个编译依赖同理。

## 升级流程概览

1. **准备工作**：确认当前版本，了解目标版本。
2. **安装新版本**：新版本装到独立目录，不动旧版本。
3. **配置检查与调整**：把旧配置迁到新版本目录，确认兼容。
4. **测试新版本**：不影响在跑的旧版本的前提下，把新版本跑起来测。
5. **切换版本**：确认新版稳定后，停旧起新。
6. **监控**：升级后盯住性能和日志。

## 完整示例

以 2.4.41 升级到 2.4.46 为例，走一遍整个流程。

### 步骤 1：确认当前版本

```bash
apachectl -v
```

记下输出里的版本号（如 `Server version: Apache/2.4.41`），这就是升级的起点，也是回滚时的参照。

### 步骤 2：下载新版本与编译依赖

apr 和 apr-util 解压到源码树的 `srclib/` 下，configure 时用 `--with-included-apr` 一并编译：

```bash
wget https://archive.apache.org/dist/httpd/httpd-2.4.46.tar.gz
wget https://archive.apache.org/dist/apr/apr-1.7.4.tar.gz
wget https://archive.apache.org/dist/apr/apr-util-1.6.3.tar.gz
tar -xzf httpd-2.4.46.tar.gz
tar -xzf apr-1.7.4.tar.gz  && mv apr-1.7.4    httpd-2.4.46/srclib/apr
tar -xzf apr-util-1.6.3.tar.gz && mv apr-util-1.6.3 httpd-2.4.46/srclib/apr-util
```

验证：`ls httpd-2.4.46/srclib/` 应看到 `apr` 和 `apr-util` 两个目录。

### 步骤 3：编译安装

`--prefix` 指向带版本号的独立目录，这是整个过程的关键：新旧两套二进制互不干扰，切换和回滚都只是换个目录启停。

```bash
cd httpd-2.4.46
./configure --prefix=/usr/local/apache2.4.46 --with-included-apr
make
sudo make install
```

编译安装完成的验证信号是新版本自己的 `apachectl -v` 能报出目标版本，实测输出为 `Server version: Apache/2.4.46 (Unix)`。

![配图1](/images/csdn/figures/apache-csdn138910842-1.png)

### 步骤 4：迁移配置

把旧版本的配置文件整份复制到新版本目录：

```bash
sudo cp -R /usr/local/apache2.4.41/conf/* /usr/local/apache2.4.46/conf/
```

复制完最好快速过一遍 `httpd.conf`，确认模块路径、加载的 so 文件在新版本下都还存在——大版本跨越时这里最容易出问题。

### 步骤 5：测试新版本

这一步的核心约束是**新版本不能和正在跑的旧版本抢 80 端口**。迁移过来的配置 Listen 的是 80，直接启动必然端口冲突，所以先把 Listen 改成一个临时测试端口（如 8080），测完再改回来：

```bash
sed -i 's/^Listen 80/Listen 8080/' /usr/local/apache2.4.46/conf/httpd.conf
/usr/local/apache2.4.46/bin/apachectl -k start -f /usr/local/apache2.4.46/conf/httpd.conf
```

启动后分别 curl 新旧端口验证——新版本在 8080 应答，旧版本在 80 继续服务。实测结果（RockyLinux 9 容器，旧版本为容器内 httpd）：

![配图1](/images/csdn/figures/apache-csdn138910842-1.png)

### 步骤 6：切换版本

测试无误后，把新配置的 Listen 改回 80，然后停掉旧版本：

```bash
/usr/local/apache2.4.41/bin/apachectl -k stop
```

启动新版本：

```bash
/usr/local/apache2.4.46/bin/apachectl -k start
```

验证切换结果：`apachectl -v` 确认当前进程版本，业务侧 curl 一遍核心接口。停旧与起新之间存在秒级的空窗，这是这套方案的边界——追求严格零中断，需要在负载均衡层把节点摘下来再切。

## 出了问题怎么回滚

回滚就是反向执行一次切换：`/usr/local/apache2.4.46/bin/apachectl -k stop` 停新版本，`/usr/local/apache2.4.41/bin/apachectl -k start` 启旧版本。旧目录从头到尾没被动过，这是独立目录方案最值得保住的设计。

## 注意事项

- 升级前务必备份配置文件和必要数据，切换失败时才有回退的底气。
- 正式切换前充分测试新版本：配置兼容性和服务稳定性都在测试阶段解决，不要带到线上。
- 升级后密切关注系统日志和 Apache 错误日志，发现问题及时处理。
- 启动时看到 `AH00558: Could not reliably determine the server's fully qualified domain name` 只是提醒，不影响服务；在 httpd.conf 里给 `ServerName` 赋值即可消除（实测环境同样出现此提示）。
- 历史版本一律从 archive.apache.org 下载，downloads 主站只保留当前推荐版本，直接 wget 主站链接会 404。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
