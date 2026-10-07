---
title: "用 rbash（受限 Shell）限制用户的命令执行环境"
date: 2024-05-20 09:15:00
updated: 2026-09-14
categories: [技术, Linux]
tags: [Linux]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1510519138101-570d1dca3d66?w=1600&q=80&fm=jpg
---

外包人员临时上机、学生机开放账号，都不能让对方在系统里随便执行命令。Linux 自带的受限 Shell（rbash）就是干这个的：把用户的登录 shell 换成 bash 的受限模式，再配合一个只装"白名单命令"的目录和收窄的 PATH，用户就只能执行你放行的命令、访问你允许的路径。配置成本很低——不装任何额外软件，三步做完——适合教育环境、企业服务器和公共访问终端这类场景。本文在 Rocky Linux 9 上完整走一遍，并逐项实测哪些操作会被拦截、哪些命令能逃逸。

## 实验环境

- Rocky Linux 9.3 容器（RHEL 9 同源，bash 5.1.8）
- 关键差异：RHEL 8/9 默认**不提供 /bin/rbash 文件**（bash 包本身支持受限模式，需要手动建软链）；CentOS 6/7 时代的 bash 包会预装 /bin/rbash，老教程里 `useradd -s /bin/rbash` 能直接用，搬到 RHEL 9 上会踩坑

## rbash 的限制机制

rbash 是 bash 的受限模式。bash 在启动时检查自己的 argv0（调用名）：如果是 `rbash` 就进入受限模式，否则正常运行——所以 rbash 不是独立程序，是同一份二进制的两种行为，这也是"建个软链就能启用"的原理。

受限模式下，以下操作**全部被禁止**：

- `cd`：不能切换目录
- 赋值/取消 `PATH`、`SHELL`、`ENV`、`BASH_ENV`：不能修改命令查找路径和启动环境
- 输出重定向 `>`/`>>`：不能写任意文件
- 命令名里带 `/`：`/bin/ls`、`/usr/bin/python3` 这类绝对路径调用一律拒绝

有一条机制值得单独说明：**这些限制在启动文件（.bash_profile 等）读取完成之后才生效**。bash 手册对受限 shell 的描述里明确写了限制"enforced after any startup files are read"。这带来一个对配置很友好的性质——管理员可以在 .bash_profile 里正常设置 `PATH=$HOME/bin`，用户登录后再想改 PATH 就会被拒绝。下面的实测会验证这两半行为。

## 第一步：准备 rbash（RHEL 9 必做）

Rocky Linux 9 默认没有 /bin/rbash 这个文件，但 bash 二进制支持受限模式，建一个软链即可：

```bash
ln -s /usr/bin/bash /usr/bin/rbash
```

![配图1](/images/csdn/figures/restricted-shell-csdn138912215-1.png)

验证：`readlink /usr/bin/rbash` 输出 `/usr/bin/bash`，且 `rbash -c 'cd /tmp'` 报 `cd: restricted`，说明受限模式已生效。CentOS 7 老环境跳过这一步（bash 包自带 /bin/rbash）。

## 第二步：建受限用户 + 白名单目录

用户登录后进入什么 shell 由 useradd 的 `-s` 参数决定，这是整个方案的关键：

```bash
useradd -m -s /bin/rbash restricted_user
passwd restricted_user
```

接下来控制"能执行什么"。做法是在用户家目录建一个 `bin` 目录，把允许的命令以软链接方式放进去：

```bash
mkdir /home/restricted_user/bin
for c in ls cat echo grep; do
  ln -s /usr/bin/$c /home/restricted_user/bin/$c
done
```

然后在用户的 `.bash_profile` 里把 PATH 收窄到这个目录：

```bash
PATH=$HOME/bin
export PATH
readonly PATH
```

别忘了把家目录所有权交还用户，否则登录时读不了 .bash_profile：

```bash
chown -R restricted_user:restricted_user /home/restricted_user
```

![配图2](/images/csdn/figures/restricted-shell-csdn138912215-2.png)

验证：`su - restricted_user -c 'echo $PATH'` 输出 `/home/restricted_user/bin`，白名单里的 `echo` 能正常执行。

关于 `readonly PATH` 要说一句公道话：它**不是**拦截 PATH 修改的机制。rbash 的内建限制本来就会拒绝登录后的 PATH 赋值——笔者做过对照实验：.bash_profile 里不写 `readonly PATH`，用户登录后执行 `PATH=/usr/bin:$PATH` 同样报 `PATH: readonly variable`（报错文案相同，这是受限模式对 PATH/SHELL/ENV/BASH_ENV 的内建保护）。`readonly` 的价值是纵深防御：万一用户的 shell 被改成普通 bash（比如排障时临时 `usermod -s /bin/bash` 忘了改回来），readonly 仍能阻止 PATH 被改写。保留它，但别误以为没它就不安全。

## 第三步：逐项实测拦截效果

以受限用户交互登录，逐条试一遍最容易误判的操作：

![配图3](/images/csdn/figures/restricted-shell-csdn138912215-3.png)

实测清单：

| 操作 | 结果 | rbash 提示 |
|------|------|-----------|
| `ls`、`cat`、`echo`（白名单内） | ✅ 正常执行 | 无 |
| `cd /tmp` | ❌ 被禁 | `cd: restricted` |
| `rm`、`python3`（白名单外） | ❌ 找不到命令 | `command not found` |
| `/bin/ls /`（绝对路径绕行） | ❌ 被禁 | `cannot specify '/' in command names` |
| `echo test > /tmp/out.txt` | ❌ 被禁 | `cannot redirect output` |
| `PATH=/usr/bin:$PATH` | ❌ 被禁 | `PATH: readonly variable` |

六项拦截全部符合预期，其中"绝对路径"和"重定向"这两项堵住了两个最直觉的绕过思路。

## 逃逸审计：白名单命令自身的行为不受限

rbash 限制的是**当前 shell**，白名单里每个命令自己的行为不受限——这才是这套方案真正的风险面。以白名单里的 `cat` 为例实测：

![配图4](/images/csdn/figures/restricted-shell-csdn138912215-4.png)

`cat` 以受限用户自己的身份运行：`/etc/passwd` 这类全局可读文件随便读，`/etc/shadow` 这种 root 专属文件会得到 `Permission denied`。所以问题不在"能不能读系统文件"，而在**全局可读文件里有什么敏感信息**（配置文件里的密码、其他用户的文件权限等）。

更危险的是能再起子进程的命令：白名单里放了 `vim`/`vi`，用户可以用 `:!bash` 在编辑器里起一个不受限的 shell；放了 `more`/`less`，可以用 `!command`；`find` 的 `-exec`、`awk` 的 `system()` 同理。白名单选命令时要逐个审查"逃逸能力"，只放"输出型"命令（ls/cat/echo/grep/head/tail）最稳妥。

## 错误写法对比

三种最常见的错误落地方式，每种都有真实的坑：

| 错误写法 | 实际后果 | 错在哪 |
|---------|---------|--------|
| 不建软链直接 `useradd -s /bin/rbash` | 实测 useradd 只给 Warning 不报错：`useradd: Warning: missing or non-executable shell '/bin/rbash'`，用户照常创建；登录时 shell 不存在，su 报 `No such file or directory`，ssh 直接拒绝 | 以为创建成功=配置完成，漏了 RHEL 9 的软链步骤 |
| `PATH=$PATH:$HOME/bin`（只加不减） | 用户能照常运行所有系统命令 | 白名单目录只是"多了一个目录"，没有收窄查找范围，方案形同虚设 |
| 白名单里放 vim 方便改文件 | 用户 `:!bash` 起一个完整 shell，所有限制清零 | 忽略了"白名单命令自身不受限"，编辑器=后门 |

## 常见报错

- **`/bin/rbash: No such file or directory`**（登录时）：软链没建，按第一步 `ln -s` 解决。
- **`useradd: Warning: missing or non-executable shell '/bin/rbash'`**：useradd 不会因此失败，用户照常创建——Warning 只是提醒这个 shell 路径在系统里不存在。建好软链后新用户不再告警；已建的用户用 `usermod -s /bin/rbash 用户名` 重设一次即可。
- **登录后连 `ls` 都找不到**：先查 `.bash_profile` 的属主和权限（`chown` 那步漏了，用户读不了启动文件，PATH 还是系统默认）；再查 PATH 行有没有笔误（比如把 `$HOME/bin` 敲成不存在的目录），PATH 指错了白名单自然全失效。救援方式：root 用 `su - 用户名 -c 'echo $PATH'` 看实际 PATH，或直接 `usermod -s /bin/bash` 收回权限重配。
- **用户用 vim/less 逃逸**：见上文逃逸审计，把这类命令移出白名单，文本编辑需求用 `cat` + 管道替代。

## 注意事项

- **白名单审查**：能启动新 shell（bash/sh/zsh）、能改环境（env/export）、能起子进程（vim/less/find -exec/awk system()）的程序都不能放；只放输出型命令，并定期复查软链目标有没有被升级替换。
- **跨版本迁移**：CentOS 6/7 的 bash 包预装 /bin/rbash，RHEL 8/9 不预装——旧文照搬 RHEL 7 的 `useradd -s /bin/rbash` 会在 RHEL 9 上静默创建一个"假受限用户"，登录直接失败。迁移清单里给软链这步单独一行。
- **限制生效时机**：.bash_profile 是唯一能合法设置 PATH 的窗口（启动文件读取完成后限制才生效），所有 PATH 收紧逻辑都放这里；不要指望在别处"后再改回来"。
- **rbash 不是强隔离**：它防误用和顺手探测，防不住有心人（内核漏洞、白名单命令组合逃逸都有先例）。真需要强隔离用容器/虚拟机/SELinux，rbash 适合"给用户一个干净的命令行环境"这个量级的需求。
- **上线前实测**：用受限账号真实登录一遍，逐项测白名单外的命令、cd、重定向、绝对路径——rbash 的报错信息很明确，但只有实际登录才能确认配置没有遗漏。

rbash 是一个"低成本快速落地"的用户隔离方案：不需要额外安装，软链启用受限模式，白名单用软链接管理，PATH 在启动文件里收窄后由受限模式本身锁死。它不适合替代强隔离，但对于"外包/学生账号只能跑指定命令"这个需求，rbash + 白名单 + 收窄 PATH 三件套足够用——前提是把逃逸审计做在前面。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
