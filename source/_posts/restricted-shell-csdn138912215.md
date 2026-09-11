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

### 什么是 Restricted Shell

rbash 是 bash 的受限模式。它限制用户可执行的命令范围，阻止访问文件系统的某些部分，也挡掉那些可能影响系统安全的操作——比如切换目录、修改 PATH 这类动作在受限模式下都会被拒绝。对于只需要跑特定脚本或应用的用户来说，这个环境足够用，也不用在系统上再装别的软件。

### 创建受限用户

新建用户时直接把 shell 指定为 rbash：

```bash
sudo useradd -m -s /bin/rbash restricted_user  # 创建用户
sudo passwd restricted_user                    # 设置密码
```

`-s /bin/rbash` 是关键，它决定用户登录后进入的是受限环境而不是普通 bash。

### 配置可执行命令的白名单

接下来控制"能执行什么"。做法是在用户家目录建一个 `bin` 目录，把允许的命令以软链接方式放进去：

```bash
sudo mkdir /home/restricted_user/bin           # 创建 bin 目录
sudo ln -s /bin/ls /home/restricted_user/bin/  # 允许使用的命令
```

然后在用户的 `.bash_profile`（或 `.bashrc`）里把 PATH 收窄到这个目录：

```
PATH=$HOME/bin
export PATH
```

![配图](/images/csdn/figures/restricted-shell-csdn138912215.png)

这样用户只能执行 `/home/restricted_user/bin` 里的命令。PATH 只剩这一个条目，白名单之外的命令对用户来说等于不存在。

### 完整配置示例

假设要求限制用户只能运行 `ls`、`cat` 和 `echo`：

```bash
# 在用户家目录中创建一个 bin 目录
mkdir /home/restricted_user/bin
# 创建指向允许的命令的链接
ln -s /bin/ls /home/restricted_user/bin/ls
ln -s /bin/cat /home/restricted_user/bin/cat
ln -s /bin/echo /home/restricted_user/bin/echo

# 更新用户的 PATH 变量
echo "PATH=$HOME/bin" >> /home/restricted_user/.bash_profile
echo "export PATH" >> /home/restricted_user/.bash_profile
```

配置完成后用这个账号登录验证：允许的三个命令正常工作，其他命令会提示找不到或被拒绝。

## 注意事项

- **安全性**：白名单里不要放入任何可能让用户绕过限制的命令——比如能启动新 shell、能改 PATH 或读写任意文件的程序。
- **维护**：系统更新或安全策略变化后，定期检查和更新限制环境，链接指向的目标变了要及时调整。
- **测试**：上线前用受限账号实际登录，彻底测一遍配置是否达到预期的限制效果。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
