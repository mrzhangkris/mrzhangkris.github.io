---
title: "使用Bash脚本和Logrotate实现Nginx日志切割"
date: 2024-05-13 15:13:45
categories: [技术]
tags: [Nginx]
copyright_author: 张鹏
cover: /images/csdn/covers/bash-logrotate-nginx-csdn138804009.png
---

Nginx是一个广泛使用的高性能Web服务器，它能够处理大量的并发连接，但同时也会生成大量的日志文件。为了有效管理这些日志文件并确保系统的正常运行，我们需要定期对Nginx的日志文件进行切割和归档。本文将介绍如何使用Bash脚本和Logrotate来实现Nginx日志的切割。

### Bash脚本实现

假设Nginx的访问日志文件位于/var/log/nginx/access.log

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

以上脚本的功能包括：

-   检查归档目录是否存在，如果不存在则创建。
-   将当前的访问日志文件移动到归档目录，并使用gzip进行压缩。
-   向Nginx发送USR1信号，以便重新打开日志文件，使Nginx能够继续写入新的日志。

### Logrotate实现

> Logrotate是一个Linux系统上用来管理日志文件的工具，它可以定期轮转日志文件、压缩旧的日志文件以及删除过期的日志文件。Logrotate通过配置文件定义轮转规则，并由系统的cron任务周期性地执行。

假设Nginx的有两个访问日志文件分为位于

-   /apps/openresty/nginx/logs/head/access.log
-   /apps/openresty/nginx/logs/domain/access.log。

在/etc/logrotate.d目录下创建一个名为nginx的文件，并添加以下内容

```latex
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

以上配置的含义如下：

-   daily：每天轮转一次日志。
-   missingok：如果日志文件不存在，则不报错。
-   rotate 7：保留最近的7个归档文件。
-   compress：使用gzip压缩轮转后的日志文件。
-   delaycompress：延迟压缩，直到下一次轮转时才压缩上一次的日志文件。
-   notifempty：如果日志文件为空，则不轮转。
-   create：设置新创建的日志文件的权限和属主。
-   sharedscripts：在所有日志文件轮转之后执行一次脚本。
-   postrotate和endscript：在轮转后执行的内容。

---

> 本文迁移自作者 CSDN 博客，2024-05-13 首发于 CSDN，内容保持原貌。
