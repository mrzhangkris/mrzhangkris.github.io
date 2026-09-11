---
title: "Debian常用命令"
date: 2024-05-11 15:22:09
categories: [技术]
tags: [Linux]
copyright_author: 张鹏
cover: /images/csdn/covers/debian-csdn138717366.png
---

本篇博客将介绍一些基本但强大的Debian命令，包括命令的使用示例及其参数，帮助您更有效地管理和维护您的系统。

### 1\. apt-get

apt-get是Debian及其派生系统（如Ubuntu）中用于包管理的命令行工具。它用于安装、更新和移除软件包，是系统维护中的重要工具。
示例：

-   安装软件包：

```
sudo apt-get install [package-name]
```

例如，安装nginx：

```
sudo apt-get install nginx
```

-   更新所有已安装的软件包：

```
sudo apt-get update
sudo apt-get upgrade
```

-   移除软件包：

```
sudo apt-get remove [package-name]
```

-   清理不再需要的软件包：

```
sudo apt-get autoremove
```

##### 2\. dpkg

dpkg 是另一个在Debian及其派生系统中用于管理软件包的工具。它用于安装、构建、删除以及管理Debian软件包，但不解决依赖问题。
**示例**：

-   安装一个.deb软件包：

```
sudo dpkg -i [package-name].deb
```

-   列出所有已安装的软件包：

```
dpkg -l
```

-   查询特定软件包信息：

```
dpkg -s [package-name]
```

-   移除软件包但保留配置文件：

```
sudo dpkg -r [package-name]
```

##### 3\. ls

ls 命令用于列出目录的内容，是最常用的命令之一。
**示例**：

-   列出当前目录下的所有文件和目录：

```
ls
```

-   列出详细信息（包括文件权限、拥有者、大小等）：

```
ls -l
```

-   显示包含隐藏文件的目录列表：

```
ls -a
```

##### 4\. cd 和 pwd

-   cd（change directory）命令用于切换目录。
-   pwd（print working directory）命令显示当前工作目录的完整路径。

**示例**：

-   切换到/home目录：

```
cd /home
```

-   显示当前工作路径：

```
pwd
```

##### 5\. cp 和 mv

-   cp 命令用于复制文件或目录。
-   mv 命令用于移动或重命名文件或目录。

**示例**：

-   复制文件：

```
cp source.txt destination.txt
```

-   移动文件：

```
mv source.txt /some/destination/
```

---

> 本文迁移自作者 CSDN 博客，2024-05-11 首发于 CSDN，内容保持原貌。
