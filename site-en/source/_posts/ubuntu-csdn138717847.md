---
title: "Setting Up Chinese Input (Fcitx) on Ubuntu"
date: 2024-05-11 15:32:04
lang: en
updated: 2026-09-14
categories: [Tech, Linux]
tags: [Linux]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1667984390535-6d03cff0b11a?w=1600&q=80&fm=jpg
---

After installing Ubuntu, typing Chinese means first installing an input method framework and then hooking Pinyin onto it. Two generations of framework are on offer: the classic Fcitx 4 (the original article's solution) and the newer Fcitx 5 — the latter is the current recommendation, with its Pinyin engine provided by fcitx5-chinese-addons and under active maintenance. This post covers both generations on an Ubuntu 24.04 baseline: package names and versions were verified in a container, while the GUI click-paths were not run (the container has no desktop) and are documented from official sources with that caveat.

## Preparation

Before starting, bring the system up to date to reduce compatibility issues while installing the input method:

```bash
sudo apt update && sudo apt upgrade
```

One piece of background first: Ubuntu Desktop (GNOME) ships with the IBus framework by default, and Pinyin works once the Chinese language pack is installed. The usual reasons for choosing Fcitx are smoother dictionaries, shortcuts, and advanced options like double pinyin (Shuangpin) or Wubi. Don't mix the two frameworks on one machine — pick one and switch to it.

## Recommended Path: Fcitx 5 (Ubuntu 24.04)

### Step 1: Install Fcitx 5 and the Chinese Components

```bash
sudo apt install fcitx5 fcitx5-chinese-addons fcitx5-frontend-gtk4 fcitx5-config-qt
```

The four packages' division of labor: `fcitx5` is the framework itself (version 5.1.7 in the 24.04 repositories), `fcitx5-chinese-addons` provides the Pinyin/Shuangpin engines, and `fcitx5-frontend-gtk4` plus `fcitx5-config-qt` respectively enable input in GTK applications and provide the graphical configuration interface.

Verification points: `apt policy fcitx5` shows it installed with a version number; `dpkg -l | grep fcitx5-chinese-addons` reports status `ii`.

### Step 2: Switch the Default Input Method Framework to Fcitx 5

GUI path: open "Settings → Region & Language → Manage Installed Languages" and choose "Fcitx 5" under "Keyboard input method system".

Command-line path (same effect; im-config writes the desktop-session environment variables for you):

```bash
im-config -n fcitx5
```

After running it, **log out and log back in** (or reboot) so the environment variables take effect — skip this and Fcitx 5 is installed but never loaded by applications.

### Step 3: Add the Pinyin Input Method

After logging back in, launch the configuration tool:

```bash
fcitx5-configtool
```

In the "Input Method" tab click "+" to add, search for `Pinyin`, and add it to the list. If the search comes up empty, first untick "Only Show Current Language" in the bottom-right corner.

### Step 4: Switching and Typing

The default shortcut **Ctrl+Space** toggles between Chinese and English. Open any text box, switch to Pinyin, type `nihao`, and pick 「你好」 (nǐ hǎo) from the candidates — the input method is working.

## The Comparison Path: Classic Fcitx 4 (the Original Article's Solution)

The classic solution used by the original article is still installable from the 24.04 repositories (container-tested, all installable: fcitx 4.2.9.9, fcitx-pinyin 4.2.9.9, fcitx-googlepinyin 0.1.6, fcitx-table-all 4.2.9.9):

```bash
sudo apt-get install fcitx fcitx-pinyin fcitx-googlepinyin fcitx-table-all
```

After installing, switch the keyboard input method system to "Fcitx" in "Manage Installed Languages" and reboot for it to take effect; then add the Pinyin input method via the tray icon → "Configure" → "+" (remember to untick "Only Show Current Language"), and toggle with Ctrl+Space.

Two caveats: fcitx-googlepinyin's upstream has not been updated for years, and its dictionary and full-sentence capabilities trail Fcitx 5's chinese-addons; on older desktops (X11 sessions) classic Fcitx has the best compatibility, while pure-Wayland newer desktops should go straight to Fcitx 5.

## Caveats

- **Installing the software without switching the framework is the biggest misconception**: after installing, you must switch the input method system in "Manage Installed Languages" (or via `im-config -n fcitx5`), then log out and back in — rebooting alone won't do it.
- **Never enable both generations at once**: im-config honors only one default; having fcitx and fcitx5 installed together makes their candidate windows interfere with each other. Keep the one you actually use.
- **Untick "Only Show Current Language" when adding an input method**: on an English-language system, Pinyin won't appear in the search without unticking it.
- **Ctrl+Space conflicts can be remapped**: when it clashes with an IDE shortcut, change the toggle key under "Global Options" in Fcitx 5's configuration.
- **If behavior is odd, first check whether the framework has actually taken over**: in a desktop session run `echo $GTK_IM_MODULE` — if the output doesn't contain `fcitx`, the environment variables didn't take effect; redo Step 2 and log in again.

> Note: the apt package names, version numbers, and im-config behavior in this post were verified in an Ubuntu 24.04 container; the GUI click-paths and shortcut behavior were not run in a desktop environment and come from the original article (the Fcitx 4 solution) and the official Fcitx 5 documentation.

From installing the framework, switching the default, adding Pinyin, to toggling with Ctrl+Space — four steps and Chinese input is live. Choosing between the two Fcitx generations is simple too: new installs go straight to Fcitx 5, while keeping the classic version in older environments is fine — the key is not skipping the framework switch and the re-login.

> This post was rewritten from the author's CSDN blog articles originally published between 2020 and 2024 on CSDN.
