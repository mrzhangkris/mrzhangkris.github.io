---
title: "Linux 常用命令：ls、cd、mkdir、rm、cp（Rocky Linux 9 实测）"
date: 2024-05-11 14:41:31
updated: 2026-09-14
categories: [技术]
tags: [Linux]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1629654297299-c8506221ca97?w=1600&q=80&fm=jpg
---

刚接手一台 Linux 机器，日常操作翻来覆去就那几条：看目录、切目录、建目录、删东西、复制。这篇文章把这五条最基础的命令各配一个真实输出示例——全部在 Rocky Linux 9 容器里实跑截取，CentOS 7 上用法完全一致。

## ls：列出目录内容

ls 用于显示目录里的文件和子目录。常用参数：

| 参数 | 作用 |
| --- | --- |
| -l | 以列表方式显示详细信息 |
| -a | 显示所有文件，包括隐藏文件 |
| -h | 与 -l 一起用时，把字节数换算成 K、M 等可读单位 |

查看当前目录所有文件（含隐藏文件）的详细列表：

```bash
ls -la
```

实测输出（root 家目录，节选）：

![ls 实测](/images/csdn/figures/centos-csdn138715327-1.png)

每行开头的第一个字符说明条目类型：`d` 开头是目录，`-` 开头是普通文件；`.` 和 `..` 分别代表当前目录和上级目录。

## cd：切换工作目录

cd 改变当前所在的工作目录，本身没有输出，切完用 pwd 确认：

```bash
cd /var/log && pwd
```

实测输出 `/var/log`（与 mkdir 的实测一并见下图）。提示符里的当前目录名也会跟着变，这是不打 pwd 时的快速确认办法。

## mkdir：创建新目录

mkdir 用于创建新目录，`-p` 参数可以在上级目录不存在时一并创建：

```bash
mkdir -p /root/a/b/c
```

用 ls -R 递归检查创建结果，实测整条路径一次建齐：

![cd 与 mkdir 实测](/images/csdn/figures/centos-csdn138715327-2.png)

不带 `-p` 直接 `mkdir /root/a/b/c` 会因为 /root/a、/root/a/b 不存在而报错，`-p` 把整条路径补齐了。

## rm：删除文件和目录

rm 用于删除文件或目录。两个参数要记牢：

| 参数 | 作用 |
| --- | --- |
| -r | 递归删除目录及其内容 |
| -f | 强制删除，忽略不存在的文件，过程中不提示 |

递归删除并验证，实测报 `No such file or directory` 恰恰说明删干净了：

![rm 实测](/images/csdn/figures/centos-csdn138715327-3.png)

## cp：复制文件或目录

cp 用于复制文件或目录，常用参数：

| 参数 | 作用 |
| --- | --- |
| -r | 复制目录及其内容 |
| -i | 覆盖文件前提示 |
| -u | 仅当源文件比目标文件新、或目标文件不存在时才复制 |

先造一个带文件的目录再复制，分别检查两边，实测复制成功且原目录还在：

![cp 实测](/images/csdn/figures/centos-csdn138715327-4.png)

复制目录必须带 `-r`：实测不带时 GNU cp 报 `cp: -r not specified; omitting directory`，目录被整体跳过。验证内容一致，可以 `diff -r a d`，无输出即两边完全相同。

## 注意事项

- `rm -rf` 没有回收站，删了就是删了，执行前把路径再看一遍，尤其带通配符的时候。
- 查看大文件列表用 `ls -lh`，`-h` 会把字节数换算成 K、M 这类可读单位。
- `mkdir -p` 一次建出整条路径，写脚本时必带，可以省掉一堆存在性判断。
- 复制目录记得加 `-r`（实测不带 `-r` 时 GNU cp 报 `-r not specified; omitting directory`）；不想被意外覆盖目标文件就加 `-i`。

五条命令一张卡，贴在手边就够用：

![速查卡](/images/csdn/figures/centos-csdn138715327.png)

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
