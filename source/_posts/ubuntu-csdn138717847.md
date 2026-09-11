---
title: "Ubuntu 设置中文输入法（Fcitx）"
date: 2024-05-11 15:32:04
updated: 2026-09-11
categories: [技术]
tags: [Linux]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1667984390535-6d03cff0b11a?w=1600&q=80&fm=jpg
---

装好 Ubuntu 想打中文，得先装一套输入法框架再把拼音挂上去。这篇以 Fcitx 框架为例，从安装到能正常切出中文输入，四步走完。

## 准备工作

开始之前，先把系统更新到最新状态：

```bash
sudo apt update && sudo apt upgrade
```

这一步确保所有软件包都是最新的，同时减少后续安装输入法时的兼容性问题。

## 第 1 步：安装输入法框架

Ubuntu 支持多种输入法框架，如 Fcitx 和 IBus。这里选择 Fcitx，它对中文输入支持较好。

1. 打开终端（快捷键 Ctrl+Alt+T）。
2. 安装 Fcitx 及相关中文输入法：

```bash
sudo apt-get install fcitx fcitx-pinyin fcitx-googlepinyin fcitx-table-all
```

这条命令会安装 Fcitx 输入法框架，并添加拼音和谷歌拼音输入方法。

![配图](/images/csdn/figures/ubuntu-csdn138717847.png)

## 第 2 步：设置 Fcitx 为默认输入法

安装完输入法框架后，需要把 Fcitx 设为默认的输入法系统：

1. 打开「系统设置」。
2. 选择「区域和语言（Language & Region）」选项。
3. 点击「管理已安装的语言（Manage Installed Languages）」。
4. 确保在「键盘输入方法系统（Keyboard input method system）」中选择「Fcitx」。
5. 可能需要重启计算机来应用这些更改。

## 第 3 步：添加中文输入法

重启计算机后，把中文输入法添加到 Fcitx：

1. 点击屏幕右上角的键盘图标或 Fcitx 图标。
2. 选择「配置（Configure）」选项。
3. 在配置界面中，点击底部的「+」号添加新输入法。
4. 取消选择「仅显示当前语言（Only Show Current Language）」，在搜索框中输入「pinyin」。
5. 选择「拼音」或「Google Pinyin」并点击「确定」。

## 第 4 步：使用中文输入法

设置完成后，默认快捷键 Ctrl+Space 可以切换输入法：

1. 打开任何可以输入的地方，比如文本编辑器或搜索框。
2. 按 Ctrl+Space 切换到中文输入法。
3. 开始输入拼音，选择合适的中文字词。

## 注意事项

- 语言框架选好之后，一定要在「管理已安装的语言」里把键盘输入方法系统切到 Fcitx，只装软件不切换，重启了也用不上。
- 添加输入法时记得取消「仅显示当前语言」，否则在列表里可能搜不到拼音输入法。
- Ctrl+Space 是默认的中英文切换快捷键，和部分软件的快捷键冲突时可以在 Fcitx 配置里改。
- 如果安装或切换过程中行为异常，先确认系统更新已经做完——旧包之间的兼容性问题是常见原因。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
