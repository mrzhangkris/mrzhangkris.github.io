---
title: "Debian 常用命令速查：apt-get、dpkg 与文件操作"
date: 2024-05-11 15:22:09
categories: [技术]
tags: [Linux]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1534972195531-d756b9bfa9f2?w=1600&q=80&fm=jpg
updated: 2026-09-11
---

Debian 及其派生系统（Ubuntu 等）上干活，有几组命令是天天要碰的：装软件用 apt-get 和 dpkg，看文件用 ls，切目录用 cd 和 pwd，复制移动用 cp 和 mv。这篇把它们各自最常用的用法列出来，新机器上手或者换环境时翻一下就能用。

## apt-get：包管理

apt-get 是 Debian 系的包管理命令行工具，负责安装、更新和移除软件包，会自动处理依赖。

安装一个软件包，比如 nginx：

```bash
sudo apt-get install nginx
```

更新所有已安装的软件包，`update` 刷新软件源索引，`upgrade` 才是真正升级：

```bash
sudo apt-get update
sudo apt-get upgrade
```

移除软件包：

```bash
sudo apt-get remove [package-name]
```

清理不再需要的依赖包：

```bash
sudo apt-get autoremove
```

![配图](/images/csdn/figures/debian-csdn138717366.png)

## dpkg：操作本地 .deb 包

dpkg 也是 Debian 系的包管理工具，用来安装、构建、删除和管理 .deb 软件包。和 apt-get 的区别在于它只操作手里的包文件，不解决依赖问题——所以装 .deb 遇到缺依赖，还得靠 apt-get 补。

安装一个 .deb 软件包：

```bash
sudo dpkg -i [package-name].deb
```

列出所有已安装的软件包：

```bash
dpkg -l
```

查询某个软件包的详细信息：

```bash
dpkg -s [package-name]
```

移除软件包但保留配置文件：

```bash
sudo dpkg -r [package-name]
```

## ls：列目录

ls 列出目录的内容，最常用的命令之一。

列出当前目录下的所有文件和目录：

```bash
ls
```

`-l` 显示详细信息，包括文件权限、拥有者、大小等：

```bash
ls -l
```

`-a` 显示包含隐藏文件的目录列表：

```bash
ls -a
```

## cd 和 pwd：切换目录与定位

cd（change directory）切换目录，pwd（print working directory）显示当前工作目录的完整路径。

切换到 /home 目录：

```bash
cd /home
```

显示当前所在路径：

```bash
pwd
```

## cp 和 mv：复制与移动

cp 复制文件或目录，mv 移动或重命名文件或目录。

复制文件：

```bash
cp source.txt destination.txt
```

移动文件到指定目录：

```bash
mv source.txt /some/destination/
```

## 注意事项

- apt-get 和 dpkg 分工不同：apt-get 走软件源并自动解决依赖，dpkg 只操作本地 .deb 文件，日常优先用 apt-get。
- `apt-get update` 和 `apt-get upgrade` 是两步操作，只跑 update 不跑 upgrade 并不会升级任何软件包。
- dpkg 的 `-r` 移除软件包时保留配置文件，重新安装时旧配置还在；想连配置一起清掉需要另用 purge 类操作。
- ls 的 `-l` 和 `-a` 可以组合使用（`ls -la`），看隐藏文件的完整信息更方便。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
