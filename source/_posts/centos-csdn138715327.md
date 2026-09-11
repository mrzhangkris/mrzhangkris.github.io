---
title: "CentOS常见命令"
date: 2024-05-11 14:41:31
categories: [技术]
tags: [Linux]
copyright_author: 张鹏
cover: /images/csdn/covers/centos-csdn138715327.png
---

本文将介绍一些 CentOS 常见命令，帮助你更好地管理和操作 CentOS 系统。

#### 1\. ls 命令：列出目录内容

**命令用途：** ls 命令用于显示目录内容，包括文件和子目录。
**常用参数：**

-   \-l：以列表方式显示详细信息。
-   \-a：显示所有文件，包括隐藏文件。
-   \-h：与 -l 一起使用时，显示易读的文件大小。

##### 示例：查看当前目录所有文件的详细列表，包括隐藏文件。

**操作步骤：**

1. 打开终端。
2. 输入命令并按 Enter：
```bash
ls -la
```
3. 检查显示的输出，确认文件和目录列表的详细信息。
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

#### 2\. cd 命令：切换工作目录

**命令用途：** cd 命令用于改变当前的工作目录。

##### 示例：切换到 /var/log 目录。

**操作步骤：**

1. 打开终端。
2. 输入命令并按 Enter：
```bash
cd /var/log
```
3. 使用 pwd 命令确认当前目录：
```bash
pwd
```
4. 确保输出为 /var/log。
```bash
[root@localhost ~]# cd /var/log/
[root@localhost log]# pwd
/var/log
```

#### 3\. mkdir 命令：创建新目录

**命令用途：** mkdir 命令用于创建新的目录。
**常用参数：**

-   \-p：确保目录名称存在，必要时创建上级目录。

##### 示例：

在不存在的上级目录下创建新目录 ./a/b/c。
**操作步骤：**

1. 打开终端。
2. 输入命令并按 Enter：
```bash
mkdir -p ./a/b/c
```
3. 使用 ls -R 命令检查目录是否创建成功：
```bash
ls -R ./a
```
4. 验证输出中有 b/c 目录结构。
```bash
[root@localhost ~]# mkdir -p ./a/b/c
[root@localhost ~]# ls -R ./a
./a:
b

./a/b:
c

./a/b/c:
```

#### 4\. rm 命令：删除文件和目录

**命令用途：** rm 命令用于删除文件或目录。
**常用参数：**

-   \-r：递归删除目录及其内容。
-   \-f：强制删除，忽略不存在的文件，不提示。

##### 示例：

递归删除名为 a的目录。
\*\*操作步骤：

1. 打开终端。
2. 输入命令并按 Enter：
```
rm -rf a
```
3. 使用 ls 确认a已被删除。
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

#### 5\. cp 命令：复制文件或目录

**命令用途：** cp 命令用于复制文件或目录。
**常用参数：**

-   \-r：复制目录及其内容。
-   \-i：在覆盖文件前提示。
-   \-u：仅当源文件比目标文件新或目标文件不存在时，才复制文件。

##### 示例：

将目录 a 复制到 d。
\*\*操作步骤：

1. 打开终端。
2. 输入命令并按 Enter：
```
cp -r a d
```
3. 使用 ls 检查 dir2 是否存在并包含了 dir1 的内容。
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

---

> 本文迁移自作者 CSDN 博客，2024-05-11 首发于 CSDN，内容保持原貌。
