---
title: "Ubuntu 安装 NVIDIA 显卡驱动并禁止自动更新"
date: 2024-05-20 09:18:13
updated: 2026-09-11
categories: [技术]
tags: [Linux]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1517483000871-1dbf64a6e1c6?w=1600&q=80&fm=jpg
---

Ubuntu 上装好 NVIDIA 驱动后，有时系统更新会顺手把驱动也升上去，版本一变就可能带来兼容性或稳定性问题。这篇分两部分：先把 NVIDIA 驱动装好，再用 APT pin 和 apt-mark 两道手段把驱动版本锁死，不让它被自动更新。

## 准备工作

开始之前，确保你的系统已备份，并且有管理员权限（sudo）。先更新系统：

```bash
sudo apt update && sudo apt upgrade -y
```

## 确定显卡型号

先弄清你的 NVIDIA 显卡型号，以便下载正确的驱动程序：

```bash
lspci | grep -i nvidia
```

输出示例如下：

```text
01:00.0 VGA compatible controller: NVIDIA Corporation [型号] (rev a1)
```

## 添加图形驱动 PPA

加入 NVIDIA 图形驱动 PPA，可以获得最新的驱动程序版本：

```bash
sudo add-apt-repository ppa:graphics-drivers/ppa
sudo apt update
```

## 安装 NVIDIA 驱动

先检测系统推荐的驱动版本：

```bash
ubuntu-drivers devices
```

输出示例：

```text
driver : nvidia-driver-440 - distro non-free recommended
```

安装推荐的驱动（根据实际推荐版本进行替换）：

```bash
sudo apt install nvidia-driver-440
```

> 注：原文环境为 Ubuntu 18.04 + GTX 1050，推荐驱动 440 系列。2024 年后的卡（RTX 30/40 系列）推荐版本通常是 535 或 550，`ubuntu-drivers devices` 输出以你机器为准。

验证点：`apt-cache policy nvidia-driver-440` 输出显示 `Installed: 440.*` 即安装成功，重启前已有结果。

## 禁止自动更新 NVIDIA 驱动

为了防止 NVIDIA 驱动在系统更新时被自动更新，需要两道措施。

### 修改 APT 配置文件

创建并编辑 `/etc/apt/preferences.d/nvidia` 文件：

```bash
sudo nano /etc/apt/preferences.d/nvidia
```

添加以下内容（确保替换 `nvidia-driver-440` 为实际安装的驱动程序包名）：

```text
Package: nvidia-driver-440
Pin: version 440.*
Pin-Priority: 1001
```

这会让 APT 把 nvidia-driver-440 固定到指定版本，不再自动更新。

### 锁定包版本

再用 `apt-mark hold` 命令锁定 NVIDIA 驱动包的版本：

```bash
sudo apt-mark hold nvidia-driver-440
```

确认锁定状态：

```bash
apt-mark showhold
```

## 重启系统

安装并配置完成后，重启计算机使更改生效：

```bash
sudo reboot
```

## 验证安装

重启后，用 `nvidia-smi` 命令确认驱动安装情况：

```bash
nvidia-smi
```

输出会包含 GPU 信息、驱动版本等，确认驱动已成功安装：

```text
+-----------------------------------------------------------------------------+
| NVIDIA-SMI 440.82       Driver Version: 440.82       CUDA Version: 10.2     |
|-------------------------------+----------------------+----------------------+
| GPU  Name        Persistence-M| Bus-Id        Disp.A | Volatile Uncorr. ECC |
| Fan  Temp  Perf  Pwr:Usage/Cap|         Memory-Usage | GPU-Util  Compute M. |
|===============================+======================+======================|
|   0  GeForce GTX 1050    Off  | 00000000:01:00.0 Off |                  N/A |
| 30%   35C    P8    N/A /  N/A |    162MiB /  2000MiB |      0%      Default |
+-------------------------------+----------------------+----------------------+
```

## 常见故障排除

### 系统无法启动

1. 在启动时按 Shift 进入 GRUB 菜单。
2. 选择 "Advanced options for Ubuntu"。
3. 选择恢复模式并进入 root 终端。
4. 卸载 NVIDIA 驱动：

```bash
sudo apt-get purge nvidia-*
```

5. 重启系统：

```bash
sudo reboot
```

### 黑屏或低分辨率

1. 用 Ctrl+Alt+F1 切换到 TTY 终端。
2. 登录并重新安装驱动：

```bash
sudo apt install --reinstall nvidia-driver-440
```

3. 重启系统：

```bash
sudo reboot
```

## 注意事项

- 禁止自动更新是两道措施配合：APT pin 把版本钉在 `440.*`，`apt-mark hold` 再锁一层，单独用一道都可能出现例外。
- pin 文件里的包名和版本号要与实际安装的驱动一致，装的是 440 就写 `440.*`，别照抄示例后忘了改。
- 驱动版本锁死后，想要升级时先 `apt-mark unhold`，再调整或删除 pin 文件，升级完重新锁上。
- 驱动装坏导致进不了系统时不用慌：GRUB 恢复模式进 root 终端 `purge nvidia-*` 就能退回开源驱动救急。
- 黑屏时 Ctrl+Alt+F1 切 TTY 是最快的自救路径，重装驱动后记得重启。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
