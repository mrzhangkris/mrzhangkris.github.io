---
title: Linux 系统信息查询：比 cat /proc 时代更好用的命令
categories: [技术]
tags: [Linux, 命令行]
cover: /img/linux-info/cover.png
date: 2026-09-11 17:40:00
---

# Linux 系统信息查询：比 cat /proc 时代更好用的命令

> 2024 年我在 CSDN 写过一篇《CentOS 系统常用信息查询》。两年后再看，那篇里的命令能跑，但大多绕了路：`cat /proc/cpuinfo` 配管道数行数、用 awk 算 uptime 秒数、去 `/etc/centos-release` 翻版本号。这两年里 CentOS 7 已经停止维护（2024 年 6 月底生命周期结束），但文里的命令本身跨发行版通用，不管你还在存量 CentOS 上，还是迁到了 Rocky/Alma，照样用得上。索性重写成一篇：旧命令旁边直接给现代写法，顺便说清原写法松在哪里。

## CPU

**原写法**（数逻辑核数）：

```bash
cat /proc/cpuinfo |grep "proc"|wc -l
```

能跑，但两个问题：

- `grep "proc"` 会匹配所有含 "proc" 的行，只是恰好 `/proc/cpuinfo` 里只有 `processor` 行撞上了这个前缀，换个文件这写法就数错。既然目标是"匹配 processor 开头的行数"，就该把它写明白：

```bash
grep -c ^processor /proc/cpuinfo
```

- 更直接的是根本不碰 `/proc`：

```bash
nproc
```

一条命令，直接打印逻辑核数。

![三条查 CPU 核数的命令对照](/img/linux-info/cpu.png)

**查 CPU 型号**，原来是这样：

```bash
cat /proc/cpuinfo | grep "model name"
```

现代写法一条看全：

```bash
lscpu
```

型号、物理核数、逻辑核数、架构、缓存，一屏全有，不用再单独数"physical id"去重。原写法查物理核数是 `cat /proc/cpuinfo | grep "physical id" | uniq | wc -l`，`lscpu` 输出里的 `CPU(s)`、`Socket(s)`、`Core(s) per socket` 几行就是同一个信息。

**看 CPU 使用率**还是 `top`，不过日常看一眼负载，`uptime` 更快（见下文运行时长一节）。

## 内存

**原写法**：

```bash
free -m
```

命令本身没错，错的是不解释输出。新版 `free` 第一行 mem 第二行 swap，关键是 **available 列**——它才是"你还能用多少"的答案，比 free 列靠谱得多。程序申请后释放的内存会回到 free 列吗？不会，Linux 会拿去做缓存，但这部分随时可以让出来，都算在 available 里。所以判断"内存够不够"，看 available，别看 free。

```bash
free -h
```

`-h` 是 human-readable，自动选 KB/MB/GB 单位，比 `-m` 换算省事。

![free -h 输出，available 列高亮](/img/linux-info/free.png)

## 磁盘

**原写法**：

```bash
df -h
```

这条依然是对的，没什么可改。补一条原篇漏掉的：

```bash
lsblk
```

`df` 看的是文件系统的占用，`lsblk` 看的是块设备树——哪个盘挂在哪个设备、分区怎么分、挂在哪个目录，一树看清。排查"新加的盘去哪了"用 `lsblk`，排查"空间怎么没了"用 `df`。

磁盘还有一个隐蔽的坑：`df -h` 显示空间还剩不少，新建文件却报错 `No space left on device`，这时要查的是 inode 不是容量：

```bash
df -i
```

inode 是文件系统的"文件个数配额"，海量小文件（日志、缓存碎片）会把 inode 先吃光，容量看起来却还宽裕。`df -h` 与 `df -i` 一对照，这类"假满"一眼就能看出来。

![df -h 与 df -i 对照](/img/linux-info/df.png)

## 运行时长

**原写法**（把 `/proc/uptime` 的秒数换算成天时分秒）：

```bash
cat /proc/uptime | awk -F. '{run_days=$1 / 86400;run_hour=($1 % 86400)/3600;run_minute=($1 % 3600)/60;run_second=$1 % 60;printf("系统已运行：%d天%d时%d分%d秒",run_days,run_hour,run_minute,run_second)}'
```

原篇最典型的就是这段：想看系统跑了多久，写了一行 40 多字符的 awk 算术。要人话输出，一条命令：

```bash
uptime -p
```

输出就是 `up 3 days, 4 hours, 12 minutes` 这样的格式。想要"系统是几点启动的"：

```bash
uptime -s
```

打印启动时刻（如 `2026-09-08 10:23:11`）。顺带 `uptime` 裸命令还能看 1/5/15 分钟平均负载，排查"机器是不是在忙"第一眼就看它。

![uptime -p 与 uptime -s](/img/linux-info/uptime.png)

## 系统版本

**原写法**：

```bash
cat /etc/centos-release
```

两个问题：CentOS 7 之后的发行版很多没有这个文件（`/etc/os-release` 才是跨发行版标准），而且只看得到版本号，看不到内核。现代写法：

```bash
hostnamectl
```

一条命令：发行版、内核、主机名、虚拟化类型，全齐。只想抓版本号一行的话：

```bash
cat /etc/os-release
```

![cat /etc/os-release 输出（Rocky Linux 9）](/img/linux-info/os.png)

## SN 序列号

**原写法**：

```bash
dmidecode -t system | grep 'Serial Number'
```

思路没问题，但取值可以只要这一个字段：

```bash
dmidecode -s system-serial-number
```

`-s` 后接关键字直接取值，省掉过滤。两个前提别忘：需要 root；云主机上很多拿不到有效 SN（虚拟化不给透传，输出可能是空或 `Not Specified`），这不是命令的锅。

## 速查表

| 查什么 | 现代命令 | 原来的写法 |
|---|---|---|
| CPU 全景 | `lscpu` | `cat /proc/cpuinfo` + 多条 grep |
| 逻辑核数 | `nproc` | `cat /proc/cpuinfo \| grep "proc" \| wc -l` |
| 内存 | `free -h`（看 available 列） | `free -m`（不解释列） |
| 磁盘占用 | `df -h` | 同左，没变化 |
| inode 假满 | `df -i` | 原篇漏了 |
| 块设备 | `lsblk` | 原篇漏了 |
| 运行时长 | `uptime -p` / `uptime -s` | awk 换算 `/proc/uptime` |
| 系统版本 | `hostnamectl` | `cat /etc/centos-release` |
| SN 号 | `dmidecode -s system-serial-number` | `dmidecode -t system \| grep 'Serial Number'` |

旧命令没有一条是"错"到不能跑的，只是 2024 年的写法把简单问题答复杂了。这些现代命令都是 util-linux/coreutils/procps-ng 常见组件的一部分，不引入新依赖。
