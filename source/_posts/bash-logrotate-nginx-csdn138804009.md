---
title: "Nginx 日志切割：Bash 脚本与 logrotate 两种做法"
date: 2024-05-13 15:13:45
updated: 2026-09-11
categories: [技术]
tags: [Nginx]
copyright_author: 司南
cover: /images/csdn/covers/bash-logrotate-nginx-csdn138804009.png
---

Nginx 跑久了，access.log 会一路膨胀，大到 grep 都卡。日志切割要解决两件事：把旧日志按时间归档压缩，同时让 nginx 换一个新文件继续写。这篇文章给出两种做法：一个手写 Bash 脚本，一个用系统自带的 logrotate。

## 方案一：Bash 脚本

假设访问日志位于 `/var/log/nginx/access.log`：

```bash
#!/bin/bash

LOG_FILE="/var/log/nginx/access.log"
ARCHIVE_DIR="/var/log/nginx/archive"

# 判断归档目录是否存在，如果不存在则创建
if [ ! -d "$ARCHIVE_DIR" ]; then
    mkdir -p $ARCHIVE_DIR
fi

# 使用gzip压缩日志文件并移动到归档目录
DATE=$(date +"%Y%m%d%H%M%S")
mv $LOG_FILE "$ARCHIVE_DIR/access_$DATE.log"
gzip "$ARCHIVE_DIR/access_$DATE.log"

# 重新打开日志文件，以便Nginx继续写入新的日志
kill -USR1 $(cat /var/run/nginx.pid)
```

脚本做了三件事：

- 归档目录不存在就先创建。
- 把当前日志移动到归档目录并 gzip 压缩，文件名带上时间戳，不会互相覆盖。
- 向 nginx 主进程发送 USR1 信号，让它重新打开日志文件。这一步不能省：nginx 写日志用的是文件句柄，不通知它，日志还会继续写进刚被移走的旧文件，新的 access.log 一直是空的。

把脚本放进 crontab 每天跑一次即可。

## 方案二：logrotate

logrotate 是 Linux 上专门管理日志的工具：定期轮转日志、压缩旧日志、删除过期归档，规则写在配置文件里，由系统的 cron 周期性执行。

假设 OpenResty 有两个访问日志，分别位于：

- /apps/openresty/nginx/logs/head/access.log
- /apps/openresty/nginx/logs/domain/access.log

在 `/etc/logrotate.d` 目录下创建一个名为 `nginx` 的文件：

![配图](/images/csdn/figures/bash-logrotate-nginx-csdn138804009.png)

```conf
/apps/openresty/nginx/logs/head/access.log
/apps/openresty/nginx/logs/domain/access.log
{
        daily                        # 每天切割
        missingok                    # 忽略错误
        rotate 7                    # 最多保留多少个存档
        compress                     # 切割后且压缩
        delaycompress                # 延迟压缩动作在下一次切割
        notifempty                   # 日志为空就不切割
        create 640 qhdrsj qhdrsj     # 切割的文件权限
        sharedscripts                # 共享脚本，结果为空
        postrotate                   # 收尾动作，重新生成nginx日志
                if [ -f /apps/openresty/nginx/logs/domain/nginx.pid ]; then
                        kill -USR1 `cat /apps/openresty/nginx/logs/domain/nginx.pid`
                fi
                if [ -f /apps/openresty/nginx/logs/head/nginx.pid ]; then
                        kill -USR1 `cat /apps/openresty/nginx/logs/head/nginx.pid`
                fi
        endscript                    # 结束动作

}
```

各配置项的含义：

- daily：每天轮转一次日志。
- missingok：日志文件不存在时不报错。
- rotate 7：保留最近的 7 个归档文件，更早的自动删除。
- compress：轮转后使用 gzip 压缩。
- delaycompress：延迟压缩，上一次轮转的文件要到下一次轮转时才压缩。
- notifempty：日志文件为空就不轮转。
- create：设置轮转后新建日志文件的权限和属主。
- sharedscripts：多个日志文件一起轮转时，脚本只执行一次。
- postrotate / endscript：轮转后执行的动作。这里是给两个 nginx 实例的主进程分别发 USR1 信号，让它们重开日志文件。

两个日志文件写在同一个配置里，配合 sharedscripts，USR1 只发一轮，不会重复。

## 注意事项

- 无论哪种方案，切割后都必须让 nginx 重开日志文件（USR1 信号），漏了这步新日志文件会一直是空的。
- logrotate 的执行由系统 cron 周期触发，不需要自己再挂定时任务。
- `rotate 7` 加 `daily` 意味着归档只保留一周，磁盘紧张可以调小，需要留更久就调大。
- `delaycompress` 让最近一份归档保持未压缩状态，查最近的日志不用先解压。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
