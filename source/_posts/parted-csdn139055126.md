---
title: "parted 磁盘分区管理：从查看、创建到调整大小"
date: 2024-05-20 09:45:20
updated: 2026-09-11
categories: [技术]
tags: [Linux]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1496664444929-8c75efb9546f?w=1600&q=80&fm=jpg
---

给新盘分区、扩容时改分区大小，parted 是比 fdisk 更顺手的工具：它支持 MBR 和 GPT 两种分区表，fdisk（旧版本）处理不了的大于 2TB 磁盘它直接管，命令形式还适合写进脚本，自动化装机很常用。这篇按日常操作过一遍 parted 的用法，全部命令在 GNU parted 3.5（rockylinux:9 容器）实跑验证，并指出两个容易出事的点：脚本模式缩小分区会被拦、resizepart 不会帮你扩文件系统。

## 使用场景

- **创建新磁盘分区**：在新磁盘上创建一个或多个分区
- **调整已有分区**：改变现有分区的大小（配合文件系统层扩容）
- **格式化分区**：将分区设置为特定文件系统类型（实际格式化用 mkfs 系列）
- **转换分区表**：将磁盘分区表类型从 MBR 转换为 GPT，反之亦然
- **脚本化磁盘管理**：在自动化部署和脚本中管理磁盘分区

## 安装 parted

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

验证点：`parted --version` 输出版本号（实测为 GNU parted 3.5）。

## 动手前先看磁盘现状

对磁盘做任何操作前，先用 `print` 确认当前布局——看清楚分区表类型和分区号，后面的命令才不会指错目标：

```bash
sudo parted /dev/sda print
```

输出示例（物理盘）：

```text
Model: ATA ST1000DM003-1ER1 (scsi)
Disk /dev/sda: 1000GB
Sector size (logical/physical): 512B/4096B
Partition Table: gpt
Disk Flags:

Number  Start   End     Size    File system  Name     Flags
 1      1049kB  538MB   537MB   fat32        primary  boot, esp
 2      538MB   1000GB  999GB   ext4         primary
```

这里能看到磁盘型号、容量、扇区大小、分区表类型（gpt）以及每个分区的起止位置。实测环境用 loop 设备（稀疏文件模拟磁盘）跑的 print 输出：

![配图1](/images/csdn/figures/parted-csdn139055126-1.png)

## 创建新分区表

在一块空盘（或确定要清空所有分区的盘）上初始化 GPT 分区表：

```bash
sudo parted -s /dev/sda mklabel gpt
```

`mklabel` 会抹掉磁盘上原有的分区表，属于**不可逆操作**——分区表没了，所有分区定义随之消失。执行前用 print 确认选对了盘、备份做好了。GPT 之外还可以用 `msdos`（即 MBR），实测两种标签互转都正常，但转之前盘上分区全部失效。

## 创建新分区

```bash
# 创建一个从 1MiB 到 500GiB 的主分区，文件系统类型标记为 ext4
sudo parted -s /dev/sda mkpart primary ext4 1MiB 500GiB
```

两个要点：

- 起点放在 `1MiB` 是为了对齐到物理扇区（现代盘 4096B 扇区，1MiB 是它的整数倍），直接写 `0` 或旧习惯的 `1s` 容易造成不对齐，影响 SSD 性能；
- `ext4` 在这里只是分区表里的类型标记，**不会真的格式化**——格式化是 mkfs 的事（见下文）。GPT 下 primary/logical 的区分没有实际意义，写 primary 是习惯。

建完用对齐检查确认没踩坑：

```bash
sudo parted /dev/sda align-check optimal 1
# 1 aligned
```

## 调整已有分区大小

```bash
# 将分区 1 的结束位置调到 600GiB
sudo parted /dev/sda resizepart 1 600GiB
```

实测 500MiB → 900MiB 扩容：

![配图2](/images/csdn/figures/parted-csdn139055126-2.png)

两个关键认知：

1. **resizepart 只改分区边界，不动文件系统**——分区扩了之后，里面的文件系统还是旧大小，必须再做一步文件系统层扩容（ext4 用 `resize2fs /dev/sda1`，xfs 用 `xfs_growfs` 挂载点）。漏了这一步，`df` 看到的可用空间纹丝不动，是新手最常困惑的地方。
2. **缩小分区会被安全拦截**：`-s` 脚本模式下执行缩小操作，parted 会输出 `Warning: Shrinking a partition can cause data loss` 并中止（脚本模式无人应答交互问题），分区不会真的被缩。实测验证：

![配图3](/images/csdn/figures/parted-csdn139055126-3.png)

脚本里确实需要缩小时，用 `---pretend-input-tty` 加管道喂应答（`parted -s ---pretend-input-tty ... resizepart 1 600MiB <<< "Yes"`）——但请先备份，缩小分区是数据丢失高危操作。扩容方向不会问，脚本直接跑。

调整大小之前强烈建议先备份数据；对活动分区（正在挂载、承载系统）操作可能导致系统异常，尽量在未挂载状态下进行。

## 删除分区

```bash
# 删除第一个分区
sudo parted -s /dev/sda rm 1
```

`rm` 后面跟的是**分区号**（print 输出第一列的 Number），不是设备名。删掉的是分区定义本身，数据是否可恢复取决于后续是否被覆盖——误删且未写盘时，`parted /dev/sda rescue START END` 有机会找回（它扫描丢失的分区边界重建定义）。

## 格式化分区

parted 的 mkpart 只做分区表层面的登记，新分区要用 mkfs 系列工具真正建立文件系统：

```bash
# 将 /dev/sda1 格式化为 ext4 文件系统
sudo mkfs.ext4 /dev/sda1
```

验证点：`mount /dev/sda1 /mnt && df -h /mnt` 能看到正确容量。

> 注：mkfs/resize2fs 环节在笔者的容器环境未实跑（Docker Desktop 的 loop 设备不生成 /dev/loopXp1 分区节点，partscan/partx 均受限），分区表操作（mklabel/mkpart/resizepart/rm/align-check/print）均已实测。物理机上 mkpart 后分区节点即时可用，无此限制。

## 注意事项

- **数据备份**：涉及分区修改的操作前务必备份重要数据，mklabel/rm 都是定义层面的"不可逆"，误操作可能直接丢数据。
- **系统崩溃风险**：对活动分区（正在挂载、承载系统的分区）的修改可能导致系统异常，尽量在未挂载状态下操作；改完分区表内核没感知时，`partprobe /dev/sda` 强制重读。
- **不确定就先看**：对命令结果没把握时，用 `print` 查看当前磁盘状态和分区布局再继续；脚本里用 `parted -l` 或 `print` 先断言目标盘特征（容量、已有分区），防止盘符漂移写错对象——/dev/sda 在多台机器上不是同一块盘。
- **分区对齐**：起点选 `1MiB` 这类对齐值，建完用 `align-check optimal` 验证，SSD 上不对齐的性能损失很可观。
- **resizepart ≠ 扩容完成**：分区边界改完还要 resize2fs/xfs_growfs 跟上，文件系统才知道空间变大了。
- **脚本模式的缩小保护**：`-s` 下缩小分区会被 Warning 拦截中止（实测），别以为脚本跑完就成功了——检查退出码和 print 结果。

parted 的日常就是 print → mklabel → mkpart → align-check → resizepart 这条链，每步都有明确的验证点。记住它的边界：管分区表不管文件系统、扩容不问缩小必问、脚本跑完要回头 print 确认——磁盘操作没有撤销键，print 就是你唯一的安全网。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。