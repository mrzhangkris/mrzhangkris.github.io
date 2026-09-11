---
title: "parted 磁盘分区管理：从查看、创建到调整大小"
date: 2024-05-20 09:45:20
updated: 2026-09-11
categories: [技术]
tags: [Linux]
copyright_author: 司南
cover: /images/csdn/covers/parted-csdn139055126.png
---

给新盘分区、扩容时改分区大小，parted 是比 fdisk 更顺手的工具：它支持 MBR 和 GPT 两种分区表，fdisk 处理不了的大于 2TB 的磁盘它也能直接管。而且 parted 的命令形式适合写进脚本，自动化装机时很常用。这篇过一遍它的日常用法和几个容易出事的点。

### 使用场景

- **创建新磁盘分区**：在新磁盘上创建一个或多个分区。
- **调整已有分区**：改变现有分区的大小。
- **格式化分区**：将分区设置为特定文件系统类型。
- **转换分区表**：将磁盘分区表类型从 MBR 转换为 GPT，反之亦然。
- **脚本化磁盘管理**：在自动化部署和脚本中管理磁盘分区。

### 安装 parted

多数发行版的仓库里都有，用各自的包管理器装即可：

```bash
# Debian/Ubuntu
sudo apt-get update
sudo apt-get install parted

# CentOS/Fedora
sudo yum install parted

# Arch Linux
sudo pacman -S parted
```

### 动手前先看磁盘现状

对磁盘做任何操作前，先用 `print` 确认当前布局——看清楚分区表类型和分区号，后面的命令才不会指错目标：

![配图](/images/csdn/figures/parted-csdn139055126.png)

```bash
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

这里能看到磁盘型号、容量、扇区大小、分区表类型（gpt）以及每个分区的起止位置。

### 创建新分区表

在一块空盘（或确定要清空所有分区的盘）上初始化 GPT 分区表：

```bash
sudo parted /dev/sda mklabel gpt
```

`mklabel` 会抹掉磁盘上原有的分区表，属于不可逆操作。

### 创建新分区

```bash
# 创建一个大小为 500GB 的主分区，文件系统类型为 ext4
sudo parted /dev/sda mkpart primary ext4 1MiB 500GiB
```

最后的两个参数是分区的起止位置：起点放在 `1MiB` 是为了对齐到物理扇区，直接写 `0` 容易造成不对齐，影响 SSD 性能。

### 调整已有分区大小

```bash
# 将 /dev/sda1 分区大小调整为 600GB
sudo parted /dev/sda resizepart 1 600GiB
```

`resizepart` 只改分区边界，不动文件系统——分区扩了之后通常还要配合文件系统层的扩容操作。调整大小之前强烈建议先备份数据，防止意外丢失。

### 删除分区

```bash
# 删除第一个分区
sudo parted /dev/sda rm 1
```

`rm` 后面跟的是分区号，不是设备名。删掉的是分区本身，数据是否可恢复取决于后续是否被覆盖。

### 格式化分区

新分区分好后，用 mkfs 系列工具指定文件系统：

```bash
# 将 /dev/sda1 格式化为 ext4 文件系统
sudo mkfs.ext4 /dev/sda1
```

## 注意事项

- **数据备份**：涉及分区修改的操作前务必备份重要数据，误操作可能直接丢数据。
- **系统崩溃风险**：对活动分区（正在挂载、承载系统的分区）的修改可能导致系统异常，尽量在未挂载状态下操作。
- **不确定就先看**：对命令结果没把握时，用 `print` 查看当前磁盘状态和分区布局再继续。
- **分区对齐**：起点选 `1MiB` 这类对齐值，确保分区对齐物理扇区，SSD 上尤其影响性能。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
