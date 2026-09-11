---
title: "CentOS 常用命令：ls、cd、mkdir、rm、cp"
date: 2024-05-11 14:41:31
updated: 2026-09-11
categories: [技术]
tags: [Linux]
copyright_author: 司南
cover: /images/csdn/covers/centos-csdn138715327.png
---

刚接手一台 CentOS 机器，日常操作翻来覆去就那几条：看目录、切目录、建目录、删东西、复制。这篇文章把这五条最基础的命令各配一个真实输出示例，跑一遍就有体感了。

## ls：列出目录内容

ls 用于显示目录里的文件和子目录。常用参数：

- -l：以列表方式显示详细信息。
- -a：显示所有文件，包括隐藏文件。
- -h：与 -l 一起使用时，显示易读的文件大小。

查看当前目录所有文件（含隐藏文件）的详细列表：

![配图](/images/csdn/figures/centos-csdn138715327.png)

```bash
ls -la
```

输出：

```bash
[root@localhost ~]# ls -la
total 44
dr-xr-x---.  3 root root   181 May  8 17:29 .
dr-xr-xr-x. 19 root root   247 May  8 15:17 ..
-rw-------.  1 root root  3812 May 10 17:30 .bash_history
-rw-r--r--.  1 root root    18 Feb 11  2022 .bash_logout
-rw-r--r--.  1 root root   141 Feb 11  2022 .bash_profile
-rw-r--r--.  1 root root   429 Feb 11  2022 .bashrc
-rw-r--r--.  1 root root   100 Feb 11  2022 .cshrc
drwx------.  2 root root     6 May  8 15:11 .ssh
-rw-r--r--.  1 root root   129 Feb 11  2022 .tcshrc
-rw-------.  1 root root 11233 May  8 15:47 .viminfo
-rw-r--r--.  1 root root   166 May  8 15:23 .wget-hsts
-rw-------.  1 root root   870 May  8 15:13 anaconda-ks.cfg
```

每行开头的第一个字符说明条目类型：`d` 开头是目录，`-` 开头是普通文件；`.` 和 `..` 分别代表当前目录和上级目录。

## cd：切换工作目录

cd 改变当前所在的工作目录。切到 /var/log 后用 pwd 确认：

```bash
cd /var/log
pwd
```

输出：

```bash
[root@localhost ~]# cd /var/log/
[root@localhost log]# pwd
/var/log
```

注意提示符从 `~` 变成了 `log`，说明当前目录已经切换成功。

## mkdir：创建新目录

mkdir 用于创建新目录，`-p` 参数可以在上级目录不存在时一并创建：

```bash
mkdir -p ./a/b/c
```

用 ls -R 检查创建结果：

```bash
ls -R ./a
```

输出：

```bash
[root@localhost ~]# mkdir -p ./a/b/c
[root@localhost ~]# ls -R ./a
./a:
b

./a/b:
c

./a/b/c:
```

不带 -p 直接 `mkdir ./a/b/c` 会因为 ./a、./a/b 不存在而报错，`-p` 把整条路径补齐了。

## rm：删除文件和目录

rm 用于删除文件或目录。两个参数要记牢：

- -r：递归删除目录及其内容。
- -f：强制删除，忽略不存在的文件，过程中不提示。

先确认 a 目录的结构，然后递归删除并验证：

```bash
[root@localhost ~]# ll
total 4
drwxr-xr-x. 3 root root  15 May 11 14:01 a
-rw-------. 1 root root 870 May  8 15:13 anaconda-ks.cfg
[root@localhost ~]# ls -R ./a
./a:
b

./a/b:
c

./a/b/c:
[root@localhost ~]# rm -rf a
[root@localhost ~]# ls -R ./a
ls: cannot access './a': No such file or directory
```

`No such file or directory` 正说明目录已经删干净了。

## cp：复制文件或目录

cp 用于复制文件或目录，常用参数：

- -r：复制目录及其内容。
- -i：覆盖文件前提示。
- -u：仅当源文件比目标文件新、或目标文件不存在时才复制。

把目录 a 复制为 d：

```bash
cp -r a d
```

分别查看两个目录，确认复制成功且原目录还在：

```bash
[root@localhost ~]# cp -r a d
[root@localhost ~]# ls -R ./d
./d:
b

./d/b:
c

./d/b/c:
[root@localhost ~]# ls -R ./a
./a:
b

./a/b:
c

./a/b/c:
```

复制目录必须带 `-r`，否则 cp 只会报错"略过目录"。

## 注意事项

- `rm -rf` 没有回收站，删了就是删了，执行前把路径再看一遍，尤其带通配符的时候。
- 查看大文件列表用 `ls -lh`，`-h` 会把字节数换算成 K、M 这类可读单位。
- `mkdir -p` 一次建出整条路径，写脚本时必带，可以省掉一堆存在性判断。
- 复制目录记得加 `-r`；不想被意外覆盖目标文件就加 `-i`。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
