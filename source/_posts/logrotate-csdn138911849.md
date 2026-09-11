---
title: "用 logrotate 管理 Nginx 日志"
date: 2024-05-20 08:45:00
categories: [技术]
tags: [Linux]
copyright_author: 司南
cover: /images/csdn/covers/logrotate-csdn138911849.png
updated: 2026-09-11
---

Nginx 的访问日志和错误日志是持续增长的，不管不问迟早写满磁盘，翻历史日志时也会被巨大的单文件拖累。logrotate 就是系统自带的解法：按周期轮换、压缩、删除旧日志，配合 postrotate 钩子让 Nginx 无缝切换到新文件。这篇以 Nginx 为例走一遍完整配置。

## 安装

大多数发行版默认已装，没有的话用包管理器补上：

```bash
sudo apt install logrotate  # Debian/Ubuntu
sudo yum install logrotate  # CentOS/RHEL
```

## 配置示例

目标：每周轮换一次，保留 4 个旧文件，旧日志压缩，轮换后通知 Nginx 重开日志。文件位置 `/etc/logrotate.d/nginx`：

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

多个不同目录的日志，把通配行换成逐条列出即可：

```
/var/log/nginx/logs/access.log
/var/log/nginx/logs/error.log
```

## 配置项逐条解释

- `weekly`：每周轮换一次。
- `rotate 4`：保留 4 份旧日志，更早的自动删除。
- `compress`：轮换出的旧日志做 gzip 压缩。
- `missingok`：日志文件不存在时不报错，适合服务可能未启动的场景。
- `notifempty`：空日志不轮换，避免产生一堆空文件。
- `create 0644 nginx nginx`：轮换后创建新日志文件并指定权限和属主，保证 Nginx 能继续写入。
- `sharedscripts`：多个日志文件满足轮换条件时，脚本只执行一次而不是每个文件执行一遍。
- `postrotate/endscript`：轮换后执行的命令。这里让 Nginx reopen 日志文件，否则 Nginx 还握着旧文件的句柄，新日志会继续写进已轮换的文件里。

![配图](/images/csdn/figures/logrotate-csdn138911849.png)

## 手动运行

logrotate 由 cron 每日自动执行（入口在 /etc/cron.daily/logrotate），日常无需干预。手动跑一次可以用：

```bash
sudo logrotate /etc/logrotate.conf
```

或只针对 Nginx 的配置：

```bash
sudo logrotate /etc/logrotate.d/nginx
```

## 注意事项

- 改完配置先用 `logrotate -d /path/to/config` 干跑一次，它只打印执行计划不真轮换，确认无误再放手。
- postrotate 里的 `nginx -s reopen` 不能省，漏掉会导致日志写进旧文件、新文件一直为空。
- create 的权限和属主要与 Nginx 实际运行用户一致，否则轮换后 Nginx 写不进新日志。
- rotate 的保留份数乘以单日志大小，预留好磁盘空间，压缩后大约能省七成空间但轮换瞬间仍是原尺寸。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
