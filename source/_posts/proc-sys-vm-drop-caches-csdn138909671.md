---
title: "/proc/sys/vm/drop_caches 最佳实践：手动释放内核缓存"
date: 2024-05-18 10:00:00
updated: 2026-09-14
categories: [技术, Linux]
tags: [Linux]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1575318633968-0383e7d07ca0?w=1600&q=80&fm=jpg
---

Linux 会把空闲内存拿来做文件缓存，`free` 里内存"占满"很多时候只是缓存在工作，并不是真的不够用——available 那一列才是应用真正能拿到的量。所以 `/proc/sys/vm/drop_caches` 不该天天清，但性能测试前要个干净基线、维护窗口想从干净状态开始时，它是标准工具：不用重启，往这个特殊文件里写个数字就能让内核释放对应类型的缓存。

这篇按场景讲清三个值各自清什么、怎么验证真的清了、以及那个几乎人人踩过的 `sudo echo` 重定向坑。全部命令在 Rocky Linux 9.3 特权容器实测（内核为 Docker Desktop VM 的 7.0.12-linuxkit，drop_caches 作用于该内核）。

## 它能清什么

向 `/proc/sys/vm/drop_caches` 写入不同的值，内核清理不同范围的缓存：

| 写入值 | 清理范围 | 对应内存 |
|--------|---------|---------|
| `1` | 页面缓存（pagecache） | 最近访问过的文件内容，free 的 buff/cache |
| `2` | 目录项（dentries）+ inode 缓存 | 文件系统元数据，/proc/meminfo 的 Slab 可回收部分 |
| `3` | 以上全部 | 最彻底 |

它是一次性命令，不是持久配置：写入只触发一次清理动作，内核不保存这个值，缓存随后照常回填。别把它写进 sysctl.conf 之类的持久化配置——那样既无意义，也可能在每次重启后莫名清一次缓存。（补充一个内核差异：该文件在部分内核里干脆不可读，实测容器内 `cat` 它直接 Permission denied，写权限正常——属正常现象，别当成故障。）

## 场景一：性能测试前清干净基线

测试文件系统读性能，要排除"上一轮测试把文件读进了缓存"的干扰——缓存命中和真实磁盘读的速度差几个数量级，不清缓存测出来的数据没有可比性。

```bash
sync                              # 先把脏页刷盘
echo 3 | sudo tee /proc/sys/vm/drop_caches
```

清完再跑测试，每次都是冷缓存的真实磁盘表现。

## 场景二：维护窗口从干净状态开始

系统维护前清一次缓存，让后续观察（内存占用、IO 情况）不受历史缓存干扰。操作和场景一相同，关键是**先 sync 再 drop**：

`sync` 把内存中尚未写盘的脏数据刷到磁盘。drop_caches 只清"干净"的缓存页——脏页（已修改未写盘）不会被丢弃（丢了就丢数据了），但先 sync 能让更多页变成可回收状态，清理更彻底，也避免清理过程与回写撞在一起造成 IO 抖动。

## 场景三：内存紧张时回收

内存确实吃紧、需要立即腾出可用空间时，drop_caches 能释放缓存占用的内存。但要清楚：这是治标——缓存被清掉后，后续文件访问要重新从磁盘读，IO 压力反而上升，系统可能更慢。真正内存不足该排查的是谁在吃内存（`ps aux --sort=-%mem | head`），而不是反复清缓存。

## 使用示例与实测验证

三种清理方式的写法：

```bash
# 释放页面缓存
echo 1 | sudo tee /proc/sys/vm/drop_caches

# 释放目录项和 inode 缓存
echo 2 | sudo tee /proc/sys/vm/drop_caches

# 同时释放所有缓存
echo 3 | sudo tee /proc/sys/vm/drop_caches
```

**怎么确认真的清了**——别只看命令没报错，对比清理前后的 buff/cache。实测：造一个 200MB 文件读进缓存，sync 后 echo 1：

![配图1：echo 1 前后对比](/images/csdn/figures/proc-sys-vm-drop-caches-csdn138909671-1.png)

buff/cache 从 2962MB 降到 372MB——注意释放的不只是那 200MB 文件，而是该内核此刻的全部页面缓存（容器与宿主机共享内核，这一写影响的是整个 VM）。available 相应上升。再测 echo 3 对 Slab（dentry/inode）的作用：

![配图2：echo 3 前后对比](/images/csdn/figures/proc-sys-vm-drop-caches-csdn138909671-2.png)

echo 3 同时压低了页面缓存（579→246MB）和可回收 Slab（271584→135456 kB，dentry/inode 减半），这就是它比 echo 1 更彻底的地方。

验证方法记牢：清理前后各跑一次 `free -m`（看 buff/cache）和 `grep Slab /proc/meminfo`（看元数据缓存），数字降了才是真清了。

## 错误写法：sudo echo 重定向

这是几乎人人踩过的坑——以为这样能清缓存：

```bash
sudo echo 3 > /proc/sys/vm/drop_caches
# bash: /proc/sys/vm/drop_caches: Permission denied
```

为什么失败：`>` 重定向由**当前 shell** 执行，不是由 sudo 启动的进程执行。sudo 只提升了 `echo` 的权限（echo 写 stdout，根本不需要 root），而真正打开 `/proc/sys/vm/drop_caches` 这个文件做重定向的，还是你那个普通用户的 shell——权限不够，Permission denied。实测复现（以非 root 用户执行同样的重定向）：

![配图3：重定向坑实测](/images/csdn/figures/proc-sys-vm-drop-caches-csdn138909671.png)

正确做法是让"写文件"这个动作本身以 root 身份执行，三种都行：

```bash
echo 3 | sudo tee /proc/sys/vm/drop_caches   # 推荐：tee 以 root 写
sudo sh -c 'echo 3 > /proc/sys/vm/drop_caches'  # 整个子 shell 提权
sudo bash -c "echo 3 > /proc/sys/vm/drop_caches"
```

`tee` 最常用：管道左侧的 echo 是普通用户，但 tee 被 sudo 提权，由它以 root 身份写文件。

## 注意事项

- **执行前先 sync**：`sync` 把内存中尚未写盘的脏数据刷到磁盘，再执行清理，避免清理操作和未落盘数据撞在一起。执行前也确认系统没有正在进行的重要 IO 操作，以免清理导致操作失败或性能抖动。
- **执行后性能会短暂下降**：被清掉的缓存要靠后续访问重新预热，刚清完的一段时间内磁盘读会明显变多。生产环境选低峰期执行，不要常态化清理——把 drop_caches 写进定时任务是个反模式。
- **别把清缓存当内存优化**：缓存被用起来才是 Linux 的正常状态，`free` 里 buff/cache 高不是问题（那是"借给缓存的内存，随时可回收"）；只有测试基线、维护窗口这类明确理由才需要动它。判断内存够不够看 available，不看 free。
- **容器/云环境的特殊性**：drop_caches 作用于整个内核，容器里执行（若有权限）会影响宿主机所有容器——本文实测在特权容器内进行，普通容器通常无权限写这个文件。生产宿主机上执行前想清楚影响面。
- **它不是持久配置**：写入不改变任何 sysctl 持久值，重启后、甚至下一次缓存填充后，缓存照常工作；想调整内核回收行为该看 `vm.vfs_cache_pressure`、`vm.swappiness` 这些真正的可调参数。

drop_caches 是个"偶尔用、用对地方"的工具：测试前清基线、维护窗口清状态，配合 sync 和前后 free 对比，它能给你干净的起点。但日常运行里，高 buff/cache 是健康不是病——管住手，别把它当内存清理的常规操作。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。