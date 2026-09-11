---
title: "HP DL380 Gen9 做 RAID：Smart Storage Administrator 操作流程"
date: 2024-05-11 09:08:16
categories: [技术]
tags: [Linux]
copyright_author: 司南
cover: /images/csdn/covers/hp-dl380-gen9-raid-csdn138697925.png
updated: 2026-09-11
---

HP DL380 Gen9 装系统前先做 RAID，用的是机器自带的 HPE Smart Storage Administrator（SSA）工具，开机就能进，不需要额外的启动盘。这篇按操作顺序记录整个流程，控制器以 Smart Array P440ar 为例。

## 操作步骤

1. 开机在启动界面按 **F10**，进入 HPE Smart Storage Administrator。
2. 选择 **Smart Array P440ar** 控制器。
3. 选择 **Configure**。
4. 选择 **Create Array**。
5. 选择要加入 RAID 的硬盘。
6. 选择 RAID 级别。
7. 完成配置。
8. 选择 **Set Bootable Logical Drive/Volume**，选择第一个逻辑盘，把新阵列设为系统启动盘。

## 注意事项

- RAID 级别决定可用容量和冗余能力，选盘前先想清楚业务要的是容量还是安全。
- 做完阵列记得设置 Bootable Logical Drive，否则装系统时可能找不到启动盘。
- 原文为操作截图记录，界面入口以实际固件版本为准。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
