---
title: "使用 logrotate 工具管理日志文件：实用指南"
date: 2024-05-20 08:45:00
categories: [技术]
tags: [Linux]
copyright_author: 张鹏
cover: /images/csdn/covers/logrotate-csdn138911849.png
---

在服务器管理中，有效地管理日志文件对于系统的稳定性和性能至关重要。Nginx 是一款常用的 Web 服务器，其产生的日志文件也需要被及时地管理和维护。logrotate 是一款强大的日志文件管理工具，可以自动化处理旧日志文件的压缩、删除和备份。本篇博客将详细介绍如何使用 logrotate 来管理 Nginx 的日志文件，并提供示例和注释。

##### logrotate 的功能

logrotate 能够根据配置文件自动旋转、压缩、删除和邮寄日志文件，以减少日志文件的大小并保持系统的正常运行。

##### 安装 logrotate

在大多数 Linux 发行版中，logrotate 默认已经安装。如果未安装，可以通过包管理器进行安装：

```bash
sudo apt install logrotate  # Debian/Ubuntu
sudo yum install logrotate  # CentOS/RHEL
```

##### 配置示例

假设我们有多个 Nginx 日志文件需要管理，包括访问日志和错误日志。我们希望每周轮换一次日志，仅保留 4 个旧文件，并且要求压缩以节省空间。下面是一个 logrotate 的配置示例：
**文件位置**：/etc/logrotate.d/nginx

```
/var/log/nginx/*.log
{
    weekly                  # 每周轮换日志
    rotate 4                # 保留 4 个旧文件备份
    compress                # 压缩旧文件
    missingok               # 如果日志丢失，不报错继续
    notifempty              # 日志为空时不轮换
    create 0644 nginx nginx # 轮换后创建新日志文件的权限和所有者
    sharedscripts           # 在所有日志轮换后运行脚本一次
    postrotate              # 日志轮换后执行的命令
        /usr/sbin/nginx -s reopen >/dev/null 2>&1
    endscript               # postrotate 命令的结束标记
}
```

> 多个不同目录\\日志可以将/var/log/nginx/\*.log改成下面方式，同时支持多个文件
> /var/log/nginx/logs/access.log
> /var/log/nginx/logs/error.log

##### 配置解释

-   **weekly**: 指定日志文件每周轮换一次。
-   **rotate 4**: 保留 4 个旧的日志文件备份。
-   **compress**: 对轮换出的旧日志进行 gzip 压缩。
-   **missingok**: 如果日志文件丢失，不报错。
-   **notifempty**: 如果日志文件为空，则不进行轮换。
-   **create 0644 nginx nginx**: 轮换后创建新的日志文件，设置文件权限和所有者。
-   **sharedscripts**: 如果有多个日志文件满足轮换条件，仅在所有日志文件处理后运行一次脚本。
-   **postrotate/endscript**: 指定在所有日志文件轮换后需要执行的命令，这里使用的是重新打开 Nginx 日志文件。

##### 如何运行 logrotate

logrotate 通常由 cron 定期自动运行，配置文件位于 /etc/cron.daily/logrotate。可以通过以下命令手动运行 logrotate：

```bash
sudo logrotate /etc/logrotate.conf
```

或者指定特定的配置文件：

```bash
sudo logrotate /etc/logrotate.d/nginx
```

##### 注意事项

-   确保配置文件语法正确，否则 logrotate 可能无法按预期运行。
-   测试配置文件：可以使用 logrotate -d /path/to/config 运行测试，以查看配置是否有误，但不执行实际的轮换。
-   注意权限设置，确保 logrotate 能够访问并修改指定的日志文件。

##### 结论

通过合理配置 logrotate，可以轻松地管理 Nginx 服务器上的日志文件，确保其不会无限增长，同时节省磁盘空间。这对于系统的性能和稳定性至关重要，并有助于日后的故障排查和日志分析工作。

**希望这篇文章对你有所帮助。如有任何问题或疑问，欢迎在评论区留言或私信。**

---

> 本文迁移自作者 CSDN 博客，2024-05-20 首发于 CSDN，内容保持原貌。
