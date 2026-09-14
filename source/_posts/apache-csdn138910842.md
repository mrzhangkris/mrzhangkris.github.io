---
title: "Apache 平滑升级：从 2.4.41 到 2.4.46 的完整流程"
date: 2024-05-18 10:30:00
updated: 2026-09-14
categories: [技术]
tags: [运维]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1535957998253-26ae1ef29506?w=1600&q=80&fm=jpg
---

Apache 版本要升级时，直接卸旧装新会有一段服务中断。这篇文章记录的思路是：把新版本编译安装到一个独立目录，配置迁过去、单独起个端口测一遍，确认稳定后再做切换，把升级对线上服务的影响压到最低。走完整个流程，新旧两套并存、随时可以反向切换。

双版本并行流程本次在 Rocky Linux 9 容器里重新完整实测：旧版本 2.4.41 跑 80 端口的同时，新版本 2.4.46 在 8080 独立测试，互不影响；文中版本输出与并行、切换的验证结果均来自这次实跑。历史版本从 archive 站下载在今天的网络上依然可用。

## 前提条件

- 一台装好 Apache HTTP Server 的 Linux 服务器，root 或 sudo 权限；
- 编译环境：gcc、make、pcre-devel、expat-devel、openssl-devel，外加下载用的 wget（RHEL 9 系一条 `dnf install` 装齐）；
- 升级前已备份当前 Apache 的配置文件和关键数据。

还有一个下载层面的前提：2.4.46 这类历史版本已不在 [httpd.apache.org](http://httpd.apache.org/) 的主下载列表里，要从 [archive.apache.org/dist/httpd](https://archive.apache.org/dist/httpd/) 取。apr、apr-util 两个编译依赖同理。方法本身不挑版本，同流程也适用于升级到当前最新的 2.4.x。

## 升级流程概览

1. **准备工作**：确认当前版本，了解目标版本。
2. **安装新版本**：新版本装到独立目录，不动旧版本。
3. **配置检查与调整**：把旧配置迁到新版本目录，确认兼容。
4. **测试新版本**：不影响在跑的旧版本的前提下，把新版本跑起来测。
5. **切换版本**：确认新版稳定后，停旧起新。
6. **监控**：升级后盯住性能和日志。

## 完整示例

以 2.4.41 升级到 2.4.46 为例，走一遍整个流程。为了让验证结果一眼可辨，两个版本的 `htdocs/index.html` 都预先写成各自的版本标记（如 `v2.4.41-old-serving`），curl 到哪个标记，就知道是哪套实例在应答。

### 步骤 1：确认当前版本

```bash
/usr/local/apache2.4.41/bin/apachectl -v
```

记下输出里的版本号，这就是升级的起点，也是回滚时的参照。实测输出：

![当前版本确认](/images/csdn/figures/apache-csdn138910842.png)

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
make install
```

编译安装完成的验证信号是新版本自己的 `apachectl -v` 能报出目标版本，实测输出：

![编译安装验证](/images/csdn/figures/apache-csdn138910842-1.png)

### 步骤 4：迁移配置（最容易翻车的一步）

把旧版本的配置文件整份复制到新版本目录：

```bash
cp -R /usr/local/apache2.4.41/conf/* /usr/local/apache2.4.46/conf/
```

复制完先别急着启动。`make install` 会把 `ServerRoot` 写成各自的安装前缀，整份复制过来的 httpd.conf 里 `ServerRoot` 仍指向 `/usr/local/apache2.4.41`——实测正是这里出的事：新版本带着旧路径启动，读到的是旧版本的 pid 文件，直接报 `httpd (pid xxx) already running`，8080 上根本没有新实例。用 grep 确认后把它改成新前缀：

```bash
grep "^ServerRoot" /usr/local/apache2.4.46/conf/httpd.conf
sed -i "s|apache2.4.41|apache2.4.46|g" /usr/local/apache2.4.46/conf/httpd.conf
grep "^ServerRoot" /usr/local/apache2.4.46/conf/httpd.conf
```

这条 sed 同时把 conf 里其他写死的旧前缀路径一并替换。modules 目录等相对路径都挂在 ServerRoot 下，改完它即可。

### 步骤 5：测试新版本

这一步的核心约束是**新版本不能和正在跑的旧版本抢 80 端口**。迁移过来的配置 Listen 的是 80，直接启动必然端口冲突，所以先把 Listen 改成临时测试端口（8080），测完再改回来：

```bash
sed -i 's/^Listen 80/Listen 8080/' /usr/local/apache2.4.46/conf/httpd.conf
/usr/local/apache2.4.46/bin/apachectl -k start -f /usr/local/apache2.4.46/conf/httpd.conf
```

`-f` 指定要读哪份配置，不能省。启动后分别 curl 新旧端口——新版本在 8080 应答，旧版本在 80 继续服务，互不影响。实测结果：

![新旧并行](/images/csdn/figures/apache-csdn138910842-2.png)

### 步骤 6：切换版本

测试无误后执行切换。注意新版本此刻还在 8080 上跑着测试实例，要把它停掉才能带着改回 80 的配置重新启动：

```bash
sed -i 's/^Listen 8080/Listen 80/' /usr/local/apache2.4.46/conf/httpd.conf
/usr/local/apache2.4.46/bin/apachectl -k stop -f /usr/local/apache2.4.46/conf/httpd.conf
/usr/local/apache2.4.41/bin/apachectl -k stop
sleep 2
/usr/local/apache2.4.46/bin/apachectl -k start
```

实测里有个值得记下的细节：停掉旧版本后立刻起新版本，会撞上 `(98)Address already in use: AH00072: could not bind to address 0.0.0.0:80`——旧进程的监听端口还没释放。`sleep 2` 再启动即可。切换完成后的验证：80 端口已由 2.4.46 接管，返回新版本标记：

![切换完成](/images/csdn/figures/apache-csdn138910842-3.png)

再补一次业务侧的核心接口 curl 与错误日志检查，这轮升级才算收尾。停旧与起新之间存在秒级空窗，这是这套方案的边界——追求严格零中断，需要在负载均衡层把节点摘下来再切。

### 升级后监控

切换不是终点。头一个小时盯三样东西：`tail -f /usr/local/apache2.4.46/logs/error_log` 有没有新报错；`curl` 核心接口的响应码与耗时是否和升级前一致；连接数有没有异常回落。日志级别和模块行为在版本间可能有细微差异，业务高峰前的一轮完整回归比任何离线测试都可靠。

## 错误做法对比

| 错误做法 | 实际后果 |
| --- | --- |
| 直接在旧前缀上 `make install` 覆盖 | 旧二进制被就地替换，回滚无从谈起，停机窗口最大化 |
| 迁配置后不改 `ServerRoot` 就启动 | 新版本读旧 pid 文件报 already running，新实例根本没起来 |
| 停旧后立刻起新 | 端口未释放，报 `(98)Address already in use: AH00072` |
| 省略 `-f` 直接启动新版本 | 读到默认路径的配置，测的和切的可能不是同一份文件 |

其中 ServerRoot 与端口释放两条在本次实测中真实复现，规避方式归纳起来就一句话：独立目录 + 显式路径 + 留出端口释放时间。

## 出了问题怎么回滚

回滚就是反向执行一次切换：`/usr/local/apache2.4.46/bin/apachectl -k stop` 停新版本，等一两秒，`/usr/local/apache2.4.41/bin/apachectl -k start` 启旧版本。旧目录从头到尾没被动过，这是独立目录方案最值得保住的设计。

## 注意事项

- 升级前务必备份配置文件和必要数据，切换失败时才有回退的底气。
- 正式切换前充分测试新版本：配置兼容性和服务稳定性都在测试阶段解决，不要带到线上。
- 迁移配置后必须核对 `ServerRoot`，这是双目录升级最大的暗坑，症状是"already running"却找不到新实例。
- 启动时看到 `AH00558: Could not reliably determine the server's fully qualified domain name` 只是提醒，不影响服务；在 httpd.conf 里给 `ServerName` 赋值即可消除（实测环境同样出现此提示）。
- 历史版本一律从 archive.apache.org 下载，downloads 主站只保留当前推荐版本，直接 wget 主站链接会 404。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
