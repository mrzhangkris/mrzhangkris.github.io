---
title: "Debian 常用命令速查：apt-get、dpkg 与文件操作"
date: 2024-05-11 15:22:09
categories: [技术]
tags: [Linux]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1534972195531-d756b9bfa9f2?w=1600&q=80&fm=jpg
updated: 2026-09-11
---

Debian 及其派生系统（Ubuntu 等）上干活，有几组命令天天要碰：装软件用 apt-get 和 dpkg，看文件用 ls，切目录用 cd 和 pwd，复制移动用 cp 和 mv。这篇按功能分类做成速查表，新机器上手或换环境时翻一下就能用。文中输出均在 debian:stable 容器（Debian 13.6，apt 3.0.3，dpkg 1.22.22）实测。

## apt-get：软件源包管理

apt-get 是 Debian 系的包管理命令行工具，负责安装、更新和移除软件包，自动处理依赖。

| 命令 | 作用 | 示例 |
|------|------|------|
| `apt-get update` | 刷新软件源索引 | `sudo apt-get update` |
| `apt-get upgrade` | 升级所有已安装软件包 | `sudo apt-get upgrade` |
| `apt-get install <包>` | 安装软件包 | `sudo apt-get install nginx` |
| `apt-get remove <包>` | 移除软件包（保留配置） | `sudo apt-get remove nginx` |
| `apt-get purge <包>` | 移除软件包并删除配置 | `sudo apt-get purge nginx` |
| `apt-get autoremove` | 清理不再需要的依赖包 | `sudo apt-get autoremove` |
| `apt-get install -s <包>` | 模拟安装，只看依赖不动系统 | `sudo apt-get install -s wget` |
| `apt-cache search <词>` | 在软件源里搜索包名 | `apt-cache search ^wget$` |

常用参数：

| 参数 | 作用 |
|------|------|
| `-y` | 所有交互提问自动答 yes，脚本里必加 |
| `-s` / `--dry-run` | 模拟执行，只打印将发生的变更 |
| `-q` | 静默模式，减少进度输出 |
| `--no-install-recommends` | 不装推荐包，只要硬依赖 |

实跑验证（`-s` 模拟安装 wget，autoremove 空转）：

![配图1](/images/csdn/figures/debian-csdn138717366-1.png)

**陷阱**：`update` 和 `upgrade` 是两回事——`update` 只刷新软件源索引，不升级任何软件；`upgrade` 才真正升级。只跑 update 不跑 upgrade，系统一个包都不会变。

## dpkg：本地 .deb 包操作

dpkg 也是 Debian 系的包管理工具，用来安装、构建、删除和管理 .deb 软件包。与 apt-get 的分工：apt-get 走软件源并自动解决依赖，dpkg 只操作手里的包文件，**不解决依赖**——装 .deb 遇到缺依赖，还得靠 apt-get 补（`sudo apt-get install -f`）。

| 命令 | 作用 | 示例 |
|------|------|------|
| `dpkg -i <文件>.deb` | 安装本地 .deb 包 | `sudo dpkg -i app_1.0_amd64.deb` |
| `dpkg -l` | 列出所有已安装软件包 | `dpkg -l`、`dpkg -l curl` |
| `dpkg -s <包>` | 查询包的详细信息 | `dpkg -s curl` |
| `dpkg -L <包>` | 列出包安装的所有文件 | `dpkg -L curl` |
| `dpkg -r <包>` | 移除包，保留配置文件 | `sudo dpkg -r curl` |
| `dpkg -P <包>` | 移除包并清除配置（purge） | `sudo dpkg -P curl` |

实跑验证（查询已安装的 curl）：

![配图2](/images/csdn/figures/debian-csdn138717366-2.png)

**陷阱**：`dpkg -l` 第一列状态码 `ii` 表示正常安装，`rc` 表示已移除但配置残留（purge 才清掉）；`-r` 移除后重装，旧配置还在，想干净卸载用 `-P`。

## ls：列目录

ls 列出目录内容，最常用的命令之一。

| 命令 | 作用 |
|------|------|
| `ls` | 列出当前目录下的文件和目录 |
| `ls -l` | 详细信息：权限、拥有者、大小、修改时间 |
| `ls -a` | 包含隐藏文件（`.` 开头的） |
| `ls -la` | 两者组合：隐藏文件的完整信息 |
| `ls -h` | 大小用 K/M/G 人类可读格式 |
| `ls -d <目录>` | 只看目录本身，不列出其内容 |

`ls -l` 输出每行七列：权限、链接数、属主、属组、大小、修改时间、文件名。第一列如 `-rw-r--r--`：首位 `-` 是普通文件（`d` 为目录），后九位分三组，分别是属主/属组/其他人的读写执行权限。

## cd 和 pwd：切换目录与定位

cd（change directory）切换目录，pwd（print working directory）显示当前工作目录的完整路径。

| 命令 | 作用 |
|------|------|
| `cd /home` | 切换到绝对路径 /home |
| `cd dir1` | 切换到相对路径下的 dir1 |
| `cd ..` | 回到上一级目录 |
| `cd -` | 回到上一次所在的目录 |
| `cd` / `cd ~` | 回到当前用户家目录 |
| `pwd` | 显示当前所在路径 |

## cp 和 mv：复制与移动

cp 复制文件或目录，mv 移动或重命名文件或目录。

| 命令 | 作用 |
|------|------|
| `cp source.txt dest.txt` | 复制文件 |
| `cp -r srcdir/ destdir/` | 复制目录（必须加 `-r` 递归） |
| `mv source.txt /some/dest/` | 移动文件到指定目录 |
| `mv old.txt new.txt` | 重命名（同目录移动） |
| `mv -i <文件> <目标>` | 覆盖前询问，防误覆盖 |

实跑验证（复制、移动、ls 确认）：

![配图3](/images/csdn/figures/debian-csdn138717366-3.png)

**陷阱**：`cp` 不带 `-r` 复制目录直接报错；`mv` 覆盖已有文件默认不提示，重要数据前先 `mv -i` 或自己备份。

## 注意事项

- apt-get 和 dpkg 分工不同：apt-get 走软件源并自动解决依赖，dpkg 只操作本地 .deb 文件，日常优先用 apt-get。
- `apt-get update` 和 `apt-get upgrade` 是两步操作，只跑 update 不跑 upgrade 并不会升级任何软件包。
- dpkg 的 `-r` 移除软件包时保留配置文件，重新安装时旧配置还在；想连配置一起清掉用 `-P`（purge）。
- ls 的 `-l` 和 `-a` 可以组合使用（`ls -la`），看隐藏文件的完整信息更方便。
- 生产环境执行 remove/purge/autoremove 前，先加 `-s` 模拟跑一遍，确认将要变更的包列表再实际执行。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
