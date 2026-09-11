---
title: "如何在Ubuntu上安装NVIDIA显卡驱动并禁止自动更新"
date: 2024-05-20 09:18:13
categories: [技术]
tags: [Linux]
copyright_author: 张鹏
cover: /images/csdn/covers/ubuntu-nvidia-csdn139053468.png
---

在Ubuntu上安装NVIDIA显卡驱动后，有时为了避免兼容性问题或驱动稳定性问题，可能需要禁止自动更新显卡驱动。本文将逐步介绍如何在Ubuntu上安装NVIDIA显卡驱动，并配置系统以禁止驱动的自动更新。

### 1\. 准备工作

在开始之前，请确保你的系统已备份，并且有管理员权限（sudo）。首先，更新你的Ubuntu系统：

```bash
sudo apt update && sudo apt upgrade -y
```

### 2\. 确定NVIDIA显卡型号

确定你的NVIDIA显卡型号，以便下载正确的驱动程序。使用以下命令查看显卡型号：

```bash
lspci | grep -i nvidia
```

输出示例如下：

```
01:00.0 VGA compatible controller: NVIDIA Corporation [型号] (rev a1)
```

### 3\. 添加图形驱动PPA

加入NVIDIA图形驱动PPA，可以获得最新的驱动程序版本：

```bash
sudo add-apt-repository ppa:graphics-drivers/ppa
sudo apt update
```

### 4\. 安装NVIDIA驱动

检测并安装推荐的NVIDIA驱动版本：

```bash
ubuntu-drivers devices
```

输出示例：

```
driver : nvidia-driver-440 - distro non-free recommended
```

安装推荐的驱动（根据实际推荐版本进行替换）：

```bash
sudo apt install nvidia-driver-440
```

### 5\. 禁止自动更新NVIDIA驱动

为了防止NVIDIA驱动在系统更新时被自动更新，你需要采取以下步骤：

#### 修改APT配置文件

创建一个新的APT配置文件或编辑现有的配置文件以禁止自动更新某些包。例如，创建并编辑/etc/apt/preferences.d/nvidia文件：

```bash
sudo nano /etc/apt/preferences.d/nvidia
```

添加以下内容，确保替换nvidia-driver-440为实际安装的驱动程序包名：

```
Package: nvidia-driver-440
Pin: version 440.*
Pin-Priority: 1001
```

这将使APT将nvidia-driver-440固定到指定版本，不再自动更新。

#### 锁定包版本

使用apt-mark hold命令锁定NVIDIA驱动包的版本：

```bash
sudo apt-mark hold nvidia-driver-440
```

要确认锁定状态，可以运行：

```bash
apt-mark showhold
```

### 6\. 重启系统

安装并配置完成后，重启计算机使更改生效：

```bash
sudo reboot
```

### 7\. 验证安装

重启后，使用nvidia-smi命令确认驱动安装情况：

```bash
nvidia-smi
```

输出将包含GPU信息、驱动版本等，确认驱动已成功安装：

```
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

### 常见故障排除

#### 系统无法启动

1. 在启动时按Shift进入GRUB菜单。
2. 选择“Advanced options for Ubuntu”。
3. 选择恢复模式并进入root终端。
4. 卸载NVIDIA驱动：
```bash
sudo apt-get purge nvidia-*
```
5. 重启系统：
```bash
sudo reboot
```

#### 黑屏或低分辨率

1. 使用Ctrl+Alt+F1切换到TTY终端。
2. 登录并重新安装驱动：
```bash
sudo apt install --reinstall nvidia-driver-440
```
3. 重启系统：
```bash
sudo reboot
```

---

> 本文迁移自作者 CSDN 博客，2024-05-20 首发于 CSDN，内容保持原貌。
