---
title: "Nginx 日志切割：Bash 脚本与 logrotate 两种做法"
date: 2024-05-13 15:13:45
updated: 2026-09-14
categories: [技术, Nginx]
tags: [Nginx]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1667264501379-c1537934c7ab?w=1600&q=80&fm=jpg
---

Nginx 跑久了，access.log 会一路膨胀，大到 grep 都卡。日志切割要解决两件事：把旧日志按时间归档压缩，同时让 nginx 换一个新文件继续写。这篇文章给出两种做法：一个手写 Bash 脚本，一个用系统自带的 logrotate。两种方案都在 nginx/1.31.5 容器（logrotate 3.22.0）里实测通过，输出均来自实跑。

## 实验环境

nginx/1.31.5 容器（`nginx:alpine`），日志为普通文件（非容器默认的 stdout 软链——这个区别本身就是后文的一组坑）；logrotate 取 apk 源的 3.22.0。

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

把脚本放进 crontab 每天跑一次即可。实测（nginx/1.31.5 容器）：归档落盘为 `.log.gz`，USR1 之后新请求写进新 access.log：

![配图1](/images/csdn/figures/bash-logrotate-nginx-csdn138804009-1.png)

## 方案二：logrotate

logrotate 是 Linux 上专门管理日志的工具：定期轮转日志、压缩旧日志、删除过期归档，规则写在配置文件里，由系统的 cron 周期性执行。

假设 OpenResty 有两个访问日志，分别位于：

- /apps/openresty/nginx/logs/head/access.log
- /apps/openresty/nginx/logs/domain/access.log

在 `/etc/logrotate.d` 目录下创建一个名为 `nginx` 的文件：

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
- create：设置轮转后新建日志文件的权限和属主。`qhdrsj` 是原文环境里跑 nginx 的用户，落地时换成自己的 worker 用户。
- sharedscripts：多个日志文件一起轮转时，脚本只执行一次。
- postrotate / endscript：轮转后执行的动作。这里是给两个 nginx 实例的主进程分别发 USR1 信号，让它们重开日志文件。

还有一个实测才看得到的细节：logrotate 按 `create 640 qhdrsj qhdrsj` 建好新文件后，USR1 触发 nginx 重开日志，主进程会把属主改写成 worker 用户（实测新文件属主变成 `nginx:qhdrsj`，640 权限保留）——属主对不上导致 worker 写不进日志的，先想到这一层。

两个日志文件写在同一个配置里，配合 sharedscripts，USR1 只发一轮，不会重复。

这套配置用 `logrotate -f` 强制轮转实测：轮转后目录里是 `access.log`（新）和 `access.log.1`（最近一份），`delaycompress` 生效，`.1` 暂不压缩，查最近的日志不用解压：

![配图2](/images/csdn/figures/bash-logrotate-nginx-csdn138804009-2.png)

## 一组对比：两种共同的坑

**错误一：日志其实是软链**

容器和不少发行版默认把 access.log 做成指向 `/dev/stdout` 的软链。对软链执行上面的 mv + gzip，gzip 会试图读一个永远读不完的字符设备，进程直接挂死；mv 走的也只是链接本身。动手前先 `ls -l` 确认日志是真文件，容器场景应让 nginx 写普通文件再切割。

**错误二：pid 路径想当然**

方案一写死 `/var/run/nginx.pid`，源码安装的 nginx 默认 pid 文件在 `logs/nginx.pid`。路径错了，USR1 发不出去，脚本不报错但新 access.log 一直是空的——现象和"忘了发信号"一模一样。以 `nginx -V` 里的 `--pid-path` 或配置里的 `pid` 指令为准。容器里还有个小细节：nginx:alpine 镜像的 pid 实际写在 `/run/nginx.pid`，而 `/var/run` 通常是 `/run` 的符号链接，所以两种写法都能命中——换个环境就不一定，还是以配置为准。

## 注意事项

- 无论哪种方案，切割后都必须让 nginx 重开日志文件（USR1 信号），漏了这步新日志文件会一直是空的。
- logrotate 的执行由系统 cron 周期触发，不需要自己再挂定时任务。
- `rotate 7` 加 `daily` 意味着归档只保留一周，磁盘紧张可以调小，需要留更久就调大。
- `delaycompress` 让最近一份归档保持未压缩状态，查最近的日志不用先解压。

回到开头的场景：不管选哪种做法，膨胀到 grep 都卡的 access.log 都会被按天归档压缩，而 nginx 拿着新文件继续写。上线前手动触发一次切割（跑脚本或 `logrotate -f`），确认归档落盘、新日志有新请求进来，这套切割才算真的在转。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
