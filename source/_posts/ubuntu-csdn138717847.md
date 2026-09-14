---
title: "Ubuntu 设置中文输入法（Fcitx）"
date: 2024-05-11 15:32:04
updated: 2026-09-14
categories: [技术]
tags: [Linux]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1667984390535-6d03cff0b11a?w=1600&q=80&fm=jpg
---

装好 Ubuntu 想打中文，得先装一套输入法框架再把拼音挂上去。框架目前有两代可选：经典的 Fcitx 4（本文原版方案）和新一代 Fcitx 5——后者是现役推荐，拼音引擎由 fcitx5-chinese-addons 提供，维护活跃。这篇在 Ubuntu 24.04 基线上把两代方案都讲清楚：包名与版本经过容器实测，图形界面的点击步骤因容器无桌面未实跑，按官方文档整理并标注。

## 准备工作

开始之前，把系统更新到最新状态，减少装输入法时的兼容性问题：

```bash
sudo apt update && sudo apt upgrade
```

先说一个背景认知：Ubuntu 桌面版（GNOME）默认自带 IBus 框架，装了中文语言包就能用拼音。选择 Fcitx 的理由通常是词库、快捷键和双拼/五笔等进阶玩法更顺手。同一台机器上两套框架别混用，选定一套切换过去即可。

## 推荐路径：Fcitx 5（Ubuntu 24.04）

### 第 1 步：安装 Fcitx 5 及中文组件

```bash
sudo apt install fcitx5 fcitx5-chinese-addons fcitx5-frontend-gtk4 fcitx5-config-qt
```

四个包的分工：`fcitx5` 是框架本体（24.04 仓库版本 5.1.7），`fcitx5-chinese-addons` 提供拼音/双拼引擎，`fcitx5-frontend-gtk4` 和 `fcitx5-config-qt` 分别让 GTK 应用能输入、提供图形配置界面。

验证点：`apt policy fcitx5` 显示已安装及版本号；`dpkg -l | grep fcitx5-chinese-addons` 状态为 `ii`。

### 第 2 步：把默认输入法框架切到 Fcitx 5

图形界面路径：打开「设置 → 区域和语言 → 管理已安装的语言」，在「键盘输入方法系统」里选「Fcitx 5」。

命令行路径（效果相同， im-config 会替你写好桌面会话的环境变量）：

```bash
im-config -n fcitx5
```

执行后**注销并重新登录**（或重启）让环境变量生效——这一步不做，Fcitx 5 装了也不会被应用加载。

### 第 3 步：添加拼音输入法

重新登录后启动配置界面：

```bash
fcitx5-configtool
```

在「输入法」标签点「+」添加，搜索 `Pinyin`（拼音）加入列表。如果列表里搜不到，先把右下角「仅在当前语言中显示」的勾去掉。

### 第 4 步：切换与输入

默认快捷键 **Ctrl+Space** 在中英文之间切换。打开任意文本框，切到拼音后键入 `nihao`，候选词里选「你好」，输入法即正常工作。

## 对照路径：经典 Fcitx 4（原文方案）

原文使用的经典方案在 24.04 仓库里仍然可用（容器实测均可安装：fcitx 4.2.9.9、fcitx-pinyin 4.2.9.9、fcitx-googlepinyin 0.1.6、fcitx-table-all 4.2.9.9）：

```bash
sudo apt-get install fcitx fcitx-pinyin fcitx-googlepinyin fcitx-table-all
```

安装后在「管理已安装的语言」里把键盘输入方法系统切到「Fcitx」，重启生效；再通过托盘图标 →「配置」→「+」添加拼音输入法（记得取消「仅显示当前语言」），Ctrl+Space 切换使用。

两点提醒：fcitx-googlepinyin 上游多年未更新，词库和整句能力不如 Fcitx 5 的 chinese-addons；老桌面（X11 会话）下经典 Fcitx 兼容性最好，纯 Wayland 新桌面建议直接上 Fcitx 5。

## 注意事项

- **只装软件不切换框架是最大误区**：装完必须在「管理已安装的语言」（或 `im-config -n fcitx5`）里把输入法系统切过去，注销重登才生效，重启了也用不上。
- **两代框架别同时启用**：im-config 只认一个默认值，fcitx 与 fcitx5 同时装会互相干扰候选窗口，留下常用的那套即可。
- **添加输入法时取消「仅显示当前语言」**：系统语言是英文时，不取消这个勾，列表里搜不到拼音。
- **Ctrl+Space 冲突可改键**：与部分 IDE 的快捷键冲突时，在 Fcitx 5 配置的「全局选项」里修改切换键。
- **行为异常先排查框架是否真正接管**：桌面会话里执行 `echo $GTK_IM_MODULE`，输出不含 `fcitx` 说明环境变量没生效，回到第 2 步重做并重新登录。

> 注：本文 apt 包名、版本号与 im-config 在 Ubuntu 24.04 容器中实测确认；图形界面的点击路径与快捷键行为未在桌面环境实跑，来源为原文（Fcitx 4 方案）与 Fcitx 5 官方文档。

从装框架、切默认、添加拼音到 Ctrl+Space 切出中文，四步走完中文输入就通了。两代 Fcitx 选哪个的答案也简单：新装机直接 Fcitx 5，老环境沿用经典版无妨——关键是框架切换和重新登录这两步别省。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
