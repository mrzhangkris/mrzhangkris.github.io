---
title: "使用 parted 命令管理磁盘分区：指南与示例"
date: 2024-05-20 09:45:20
categories: [技术]
tags: [Linux]
copyright_author: 张鹏
cover: /images/csdn/covers/parted-csdn139055126.png
---

parted 是一个强大的命令行工具，用于创建、删除、调整、移动磁盘分区，并管理磁盘文件系统。它支持多种分区表类型，包括 MBR 和 GPT。相较于 fdisk 或者 cfdisk，parted 不仅可以处理传统的2TB以下磁盘，还可以轻松应对大于2TB的磁盘。
在这篇博客将介绍 parted 的基本用法，提供一些实际操作的示例，并讨论使用过程中需要注意的事项。

#### 使用场景

-   **创建新磁盘分区**：在新磁盘上创建一个或多个分区。
-   **调整已有分区**：改变现有分区的大小。
-   **格式化分区**：将分区设置为特定文件系统类型。
-   **转换分区表**：将磁盘分区表类型从 MBR 转换为 GPT，反之亦然。
-   **脚本化磁盘管理**：在自动化部署和脚本中管理磁盘分区。

#### 安装parted

在大多数 Linux 发行版中，你可以使用包管理工具来安装 parted。

```
# Debian/Ubuntu
sudo apt-get update
sudo apt-get install parted

# CentOS/Fedora
sudo yum install parted

# Arch Linux
sudo pacman -S parted
```

#### 基本用法和示例

##### 查看磁盘信息

使用 parted 查看磁盘的当前状态。

```
sudo parted /dev/sda print
```

输出示例：

```
Model: ATA ST1000DM003-1ER1 (scsi)
Disk /dev/sda: 1000GB
Sector size (logical/physical): 512B/4096B
Partition Table: gpt
Disk Flags:

Number  Start   End     Size    File system  Name     Flags
 1      1049kB  538MB   537MB   fat32        primary  boot, esp
 2      538MB   1000GB  999GB   ext4         primary
```

##### 创建新分区表

在磁盘上初始化一个新的 GPT 分区表：

```
sudo parted /dev/sda mklabel gpt
```

##### 创建新分区

在磁盘上创建一个新的分区：

```
# 创建一个大小为 500GB 的主分区，文件系统类型为 ext4
sudo parted /dev/sda mkpart primary ext4 1MiB 500GiB
```

##### 调整已有分区大小

如果需要调整一个已有分区的大小，可以使用 resizepart 命令：

```
# 将 /dev/sda1 分区大小调整为 600GB
sudo parted /dev/sda resizepart 1 600GiB
```

注意：在调整分区大小之前，强烈建议备份数据，以防止意外数据丢失。

##### 删除分区

删除一个分区非常简单：

```
# 删除第一个分区
sudo parted /dev/sda rm 1
```

##### 格式化分区

对于新创建的分区，通常需要格式化它们以指定文件系统类型。使用 mkfs 命令：

```
# 将 /dev/sda1 格式化为 ext4 文件系统
sudo mkfs.ext4 /dev/sda1
```

#### 注意事项

1. **数据备份**：在进行涉及分区修改的操作之前，务必备份重要数据。误操作可能导致数据丢失。
2. **系统崩溃风险**：某些分区操作可能会导致系统崩溃，特别是对活动分区的修改。
3. **运行时安全**：如果对 parted 命令的执行结果不确定，建议在控制台上使用 print 命令查看当前磁盘状态和分区布局。
4. **分区对齐**：确保分区对齐到磁盘的物理扇区大小，以提高性能，特别是在 SSD 上。

**希望这篇文章对你有所帮助。如有任何问题或疑问，欢迎在评论区留言或私信。**

---

> 本文迁移自作者 CSDN 博客，2024-05-20 首发于 CSDN，内容保持原貌。
