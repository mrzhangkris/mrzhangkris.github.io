---
title: "使用 Restricted Shell 限制用户在系统中的操作权限"
date: 2024-05-20 09:15:00
categories: [技术]
tags: [Linux]
copyright_author: 张鹏
cover: /images/csdn/covers/restricted-shell-csdn138912215.png
---

在企业或教育环境中，经常需要限制用户的系统访问权限以防止不当操作或提高系统安全性。Restricted Shell (rshell) 提供了一种有效的方法来限制用户的命令执行环境。本篇博客将详细介绍如何使用 Restricted Shell 来限制用户在 Linux 系统中的活动，并提供实用的配置示例和注意事项。

##### 什么是 Restricted Shell？

Restricted Shell 是一种特殊的命令行环境，它限制用户执行的命令范围，阻止用户访问文件系统的某些部分，限制用户执行某些可能影响系统安全的命令。这对于只需要有限系统访问权限的用户非常有用，如在特定任务中运行脚本或应用程序。

##### 使用场景

-   **教育环境**：限制学生只能访问特定的学习工具和资源。
-   **企业服务器**：限制访客或外包人员的访问权限，以防止数据泄露或不当更改。
-   **公共访问终端**：在图书馆或互联网咖啡店提供有限的服务而不影响系统的整体安全。

##### 安装和配置

-   创建 Restricted Shell 用户:
    使用 Bash 的限制模式，通常是 rbash，可以通过修改用户的 shell 来实现限制。

```bash
sudo useradd -m -s /bin/rbash restricted_user  # 创建用户
sudo passwd restricted_user                    # 设置密码
```

-   配置环境:
    限制用户可以访问的命令和目录。

```bash
sudo mkdir /home/restricted_user/bin           # 创建 bin 目录
sudo ln -s /bin/ls /home/restricted_user/bin/  # 允许使用的命令
```

-   在用户的 .bash\_profile 或 .bashrc 文件中添加：

```
PATH=$HOME/bin
export PATH
```

这样用户只能执行 /home/restricted\_user/bin 目录中的命令。

##### 配置示例

假设我们需要限制用户运行 ls, cat, 和 echo 命令：

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

##### 注意事项

-   **安全性**：确保不向限制环境中添加任何可能允许用户绕过限制的命令。
-   **维护**：定期检查和更新限制环境以适应系统更新或安全策略变化。
-   **测试**：在实际应用前，彻底测试配置以确保其满足预期的安全要求。

通过合理配置 Restricted Shell，管理员可以有效地控制用户的系统访问权限，这不仅可以提高系统的安全性，还可以确保系统资源被适当地使用。

希望这篇文章对你有所帮助。如有任何问题或疑问，欢迎在评论区留言或私信。

---

> 本文迁移自作者 CSDN 博客，2024-05-20 首发于 CSDN，内容保持原貌。
