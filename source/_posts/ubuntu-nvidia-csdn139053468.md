---
title: "Ubuntu 安装 NVIDIA 显卡驱动并禁止自动更新"
date: 2024-05-20 09:18:13
updated: 2026-09-14
categories: [技术, Linux]
tags: [Linux]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1517483000871-1dbf64a6e1c6?w=1600&q=80&fm=jpg
---

Ubuntu 上装好 NVIDIA 驱动后，系统更新有时会顺手把驱动也升上去，版本一变就可能带来兼容性或稳定性问题。这篇分两部分：先把 NVIDIA 驱动装好，再用 APT pin 和 apt-mark 两道手段把驱动版本锁死。驱动安装与验证需要真实显卡，本文沿原文实测记录（Ubuntu 18.04 + GTX 1050）整理并更新到 Ubuntu 24.04 基线；**版本锁定部分（pin 文件、apt-mark hold）不依赖显卡，已在 Ubuntu 24.04.4 容器中完整实测**，输出均为实测结果。

## 准备工作

开始之前，确保系统已备份且有 sudo 权限，然后更新系统：

```bash
sudo apt update && sudo apt upgrade -y
```

## 确定显卡型号

先弄清 NVIDIA 显卡型号，以便选择正确驱动分支：

```bash
lspci | grep -i nvidia
```

输出形如 `01:00.0 VGA compatible controller: NVIDIA Corporation [型号] (rev a1)`。

## 安装 NVIDIA 驱动

### 查看推荐驱动

Ubuntu 官方仓库自带 `ubuntu-drivers` 工具（包含在 ubuntu-drivers-common 包里，24.04 容器实测可直接安装），自动检测显卡并列出可选驱动：

```bash
ubuntu-drivers devices
```

输出示例：

```text
driver : nvidia-driver-440 - distro non-free recommended
```

24.04 (noble) 官方仓库当前提供的驱动分支实测有 535 / 550 / 570（候选版本分别为 535.309、550.163、570.211），apt 源里还有更老编号的过渡包。装哪个分支以 `ubuntu-drivers devices` 在你机器上的推荐为准。

> 注：本节的 `ubuntu-drivers devices` 输出与驱动安装行为需要真实显卡环境，原文在 Ubuntu 18.04 + GTX 1050 上实测推荐 440 系列；包名检测逻辑同源，未在本机复跑。

### 安装

安装推荐的驱动（把版本号替换成上一步的推荐值）：

```bash
sudo apt install nvidia-driver-550
```

验证点：`apt-cache policy nvidia-driver-550` 输出的 `Installed:` 与 Candidate 一致即安装成功，此结果重启前就能看到。

### 可选：图形驱动 PPA

需要比官方仓库更新的驱动时，再考虑第三方 PPA；24.04 官方源已带 535-570，普通场景不必加：

```bash
sudo add-apt-repository ppa:graphics-drivers/ppa
sudo apt update
```

## 禁止自动更新驱动（容器实测）

两道措施配合：APT pin 钉版本优先级，apt-mark hold 锁安装动作。以下全部命令与输出在 Ubuntu 24.04.4 容器实测，用 `nvidia-driver-550` 做对象（无需装驱动即可操作）。

### 第一道：APT pin 文件

创建 `/etc/apt/preferences.d/nvidia`：

```bash
sudo nano /etc/apt/preferences.d/nvidia
```

内容（包名与版本模式按实际安装的驱动替换）：

```text
Package: nvidia-driver-550
Pin: version 550.*
Pin-Priority: 1001
```

Pin-Priority 高于 1000 时，APT 会把匹配版本的优先级压过仓库默认的 500——仓库里出现更新的版本也不会被选为候选。实测效果：pin 一个 `version 1.21.4-1ubuntu4.5`、优先级 1001 后，`apt-cache policy` 的版本表里该版本带 `1001` 标记；删掉 pin 文件后同一行回落为 `500`：

```text
Version table:
     1.21.4-1ubuntu4.5 1001      # 有 pin 时
     1.21.4-1ubuntu4.5 500       # 删除 pin 后
```

### 第二道：apt-mark 锁定

```bash
sudo apt-mark hold nvidia-driver-550
```

实测输出：`nvidia-driver-550 set on hold.`。确认锁定状态：

```bash
apt-mark showhold
```

实测输出：`nvidia-driver-550`。解除锁定用 `apt-mark unhold nvidia-driver-550`，实测输出 `Canceled hold on nvidia-driver-550.`。

一个实测出的顺手技巧：`apt-mark hold` 对**尚未安装**的包同样生效——先 hold 再安装，后续系统更新就不会动这个包，适合装机脚本里提前锁定。

## 重启与验证

```bash
sudo reboot
```

重启后用 `nvidia-smi` 确认驱动安装情况：

```bash
nvidia-smi
```

正常输出包含 GPU 型号、驱动版本、显存占用等（下为原文 GTX 1050 + 440.82 的实测记录，新卡新驱动格式相同、数值不同）：

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

> 注：`nvidia-smi` 输出需要真实显卡，本文未在容器复跑，保留原文实测记录。

## 常见故障排除

### 系统无法启动

1. 启动时按 Shift 进入 GRUB 菜单。
2. 选择 "Advanced options for Ubuntu"。
3. 选择恢复模式并进入 root 终端。
4. 卸载 NVIDIA 驱动并重启：

```bash
sudo apt-get purge 'nvidia-*'
sudo reboot
```

### 黑屏或低分辨率

1. 用 Ctrl+Alt+F1（部分机型 F2-F6）切换到 TTY 终端。
2. 登录后重装驱动：

```bash
sudo apt install --reinstall nvidia-driver-550
```

3. 重启系统。

## 注意事项

- **两道措施各管一段**：pin 管候选版本的优先级（仓库出了新版也不选），hold 管 apt 的安装/升级动作（连带着安全更新也不动）。只要一套也大致够用，两套同上最稳。
- **pin 文件的包名和版本模式要与实际驱动一致**：装的是 550 就写 `550.*`，照抄示例忘改等于白锁。pin 优先级建议 1001（强制钉住）而不是 100 附近（那是弱偏好）。
- **升级被锁的驱动**：先 `apt-mark unhold`，再删除或放宽 pin 文件，升级完成后重新锁上——顺序反了 apt 会在旧版本和新锁之间打架。
- **hold 可以提前打**：实测对未安装的包同样有效，装机脚本里先 hold 再装驱动，天然免疫后续自动更新。
- **进不了系统的自救路径**：GRUB 恢复模式进 root 终端 `apt-get purge 'nvidia-*'` 退回开源驱动救急；黑屏先切 TTY 再重装驱动。此两节为原文实测与通用方法，未在容器复跑。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
