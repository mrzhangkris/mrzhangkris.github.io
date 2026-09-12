---
title: "用 rbash（受限 Shell）限制用户的命令执行环境"
date: 2024-05-20 09:15:00
updated: 2026-09-11
categories: [技术]
tags: [Linux]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1510519138101-570d1dca3d66?w=1600&q=80&fm=jpg
---

外包人员临时上机、学生机开放账号，都不能让对方在系统里随便执行命令。Linux 自带的受限 Shell（rbash）就是干这个的：把用户的登录 shell 换成 bash 的受限模式，再配合一个只装"白名单命令"的目录和收紧的 PATH，用户就只能执行你放行的命令、访问你允许的路径。配置成本很低，适合教育环境、企业服务器和公共访问终端这类场景。

## 实验环境

- Rocky Linux 9（RHEL 9 同源，bash 5.1.8）
- 关键差异：RHEL 9 默认**不提供 /bin/rbash 文件**（bash 包本身支持受限模式，但需要手动建软链），CentOS 6/7 时代部分发行版会预装 /bin/rbash

## 什么是 Restricted Shell

rbash 是 bash 的受限模式。bash 在启动时检查自己的 argv0（调用名）：如果是 `rbash` 就进入受限模式，否则正常运行——这是 POSIX 规定的机制，不是独立程序，是同一份二进制的两种行为。

受限模式下，以下操作**全部被禁止**：

- `cd`：不能切换目录
- 赋值 `PATH=`：不能修改 PATH
- 赋值 `SHELL=`：不能修改登录 shell
- 输出重定向 `>`/`>>`：不能写任意文件
- 绝对路径命令 `/bin/ls`：不能绕过 PATH 白名单
- 调用带 `/` 的命令名：`/usr/bin/python3` 同样不行

## 创建受限用户

### 准备 rbash（RHEL 9 必做）

CentOS 6/7 部分发行版预装了 /bin/rbash，但 RHEL 9 默认没有。bash 包本身支持受限模式（检查 argv0），手动建软链即可：

![配图1](/images/csdn/figures/restricted-shell-csdn138912215-1.png)

验证：`ls -l /usr/bin/rbash` 显示指向 /usr/bin/bash 的软链，`su - restricted_user -c "cd /tmp"` 报 `cd: restricted` 即生效。

### 建用户

```bash
useradd -m -s /bin/rbash restricted_user
passwd restricted_user
```

`-s /bin/rbash` 是关键，它决定用户登录后进入的是受限环境而不是普通 bash。

## 配置可执行命令的白名单

接下来控制"能执行什么"。做法是在用户家目录建一个 `bin` 目录，把允许的命令以软链接方式放进去：

```bash
mkdir /home/restricted_user/bin
ln -s /bin/ls /home/restricted_user/bin/
ln -s /bin/cat /home/restricted_user/bin/
ln -s /bin/echo /home/restricted_user/bin/
```

然后在用户的 `.bash_profile` 里把 PATH 收窄到这个目录，并设为只读：

```
PATH=$HOME/bin
export PATH
readonly PATH
```

`readonly PATH` 是安全加固：没有它的话用户可以 `PATH=/usr/bin:$PATH` 把系统目录加回来；有了 readonly，rbash 会拦截 PATH 赋值，报 `PATH: readonly variable`。

## 实测：哪些被拦、哪些放行

逐项实测 rbash 的限制效果：

![配图2](/images/csdn/figures/restricted-shell-csdn138912215-2.png)

实测清单：

| 操作 | 结果 | rbash 提示 |
|------|------|-----------|
| `ls; cat /etc/hostname; echo ok` | ✅ 正常执行 | 无（白名单命令） |
| `cd /tmp` | ❌ 被禁 | `cd: restricted` |
| `rm /tmp/x` | ❌ 命令找不到 | `rm: command not found` |
| `python3` | ❌ 命令找不到 | `python3: command not found` |
| `/bin/ls /` | ❌ 被禁 | `cannot specify '/' in command names` |
| `echo test > /tmp/out.txt` | ❌ 被禁 | `cannot redirect output` |
| `PATH=/usr/bin:$PATH` | ❌ 被禁 | `PATH: readonly variable` |

![配图3](/images/csdn/figures/restricted-shell-csdn138912215-3.png)

**一个绕不开的安全提醒**：rbash 限制的是**当前 shell**，白名单命令自身的行为不受限——比如 `cat /etc/shadow` 会成功（cat 本身以 root 身份运行，且 cat 在白名单里）。如果白名单里放了 `vim`/`vi`，用户可以用 `:!command` 在编辑器里启动任意命令；放了 `more`/`less`，可以用 `!command`。白名单选命令时要审查每个命令的"逃逸能力"。

## 常见报错与绕过尝试

- **`/bin/rbash: No such file or directory`**：rbash 软链没建（RHEL 9），按上文 ln -s 解决。
- **`useradd: Warning: missing or non-executable shell '/bin/rbash'`**：useradd 不会报错退出，用户正常创建——Warning 只是提醒这个 shell 路径在系统里不存在（建了软链就好了）。
- **`su - restricted_user` 进不去**：最常见的原因是 .bash_profile 里 PATH 语法错（`$HOME/bin` 写成了绝对路径 `/home/user/bin`，受限模式连这个赋值都拦），或文件权限不对（restricted_user 读不了自己的 .bash_profile）。
- **用户用 `vim`/`vi` 逃逸**：编辑器在白名单里 = 开了后门（:!command / :!bash）。需要文本编辑的话放 `cat` + `tee`，不要放 vim。

## 注意事项

- **安全性**：白名单里不要放入任何可能让用户绕过限制的命令——能启动新 shell（bash/sh/zsh）、能改 PATH（env/export）、能读写任意文件（vim/tee）、能执行任意命令（find -exec）的程序都不能放。只放"输出型"命令（ls/cat/echo/grep/head/tail）。
- **RHEL 9 的 rbash 差异**：CentOS 6/7 可能预装了 /bin/rbash，RHEL 8/9 不预装，需手动 `ln -s /usr/bin/bash /usr/bin/rbash`——这是跨版本迁移时最容易漏的一步，旧文照搬 RHEL 7 的 useradd 命令会静默创建一个"受限用户"但 rbash 不存在，登录直接进普通 bash。
- **readonly PATH 的必要性**：不加 readonly，用户可以 `PATH=...` 赋值把系统目录加回 PATH，白名单形同虚设；加上后 rbash 会拦截赋值，报 `readonly variable`。
- **维护**：系统更新或安全策略变化后，定期检查和更新限制环境；软链目标如果升级了（比如 bash 从 /usr/bin 移到 /bin），链接要同步调整。
- **测试**：上线前用受限账号实际登录，逐项测白名单外的命令和敏感操作（cd/重定向/绝对路径），确认配置达到预期效果——rbash 的报错信息很明确，但只有实际登录才能验证全部限制项。

rbash 是一个"低成本快速落地"的用户隔离方案：不需要额外安装，白名单用软链接管理，PATH 用 readonly 锁住，受限模式的各项限制行为清晰可测。它不适合替代强隔离（容器/VM/SELinux），但对于"给用户一个干净的命令行环境"这个需求，rbash + 白名单 + readonly PATH 三件套足够用。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。