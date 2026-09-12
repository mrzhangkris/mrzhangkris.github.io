---
title: "用 logrotate 管理 Nginx 日志：配置、钩子与实测"
date: 2024-05-20 08:45:00
categories: [技术]
tags: [Linux]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1573164713988-8665fc963095?w=1600&q=80&fm=jpg
updated: 2026-09-11
---

Nginx 的访问日志和错误日志是持续增长的，不管不问迟早写满磁盘，翻历史日志时也会被巨大的单文件拖累。logrotate 就是系统自带的解法：按周期轮换、压缩、删除旧日志，配合 postrotate 钩子让 Nginx 无缝切换到新文件。这篇以 Nginx 为例走一遍完整配置，全流程在 nginx:alpine 容器实测过，包括"漏掉 postrotate 会怎样"的对比实验。

## 实验环境

- nginx:alpine（nginx/1.31.5）+ apk 安装 logrotate；
- 日志落在真实文件（容器镜像默认软链到 stdout，此处已改为普通文件）；
- 周期参数（weekly 等）靠 `-f` 强制触发验证，无需等一周。

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

## 实测：完整轮转一圈

先干跑确认执行计划（只打印不真动），再 `-f` 强制轮转，轮换后立刻造一个新请求验证：

![配图1](/images/csdn/figures/logrotate-csdn138911849-1.png)

读实测结果，配置里每一项都对上了号：`access.log` 变成 0 字节新文件且属主是 `nginx nginx`（`create` 生效）；旧日志成了 `access.log.1.gz`（`compress` 生效）；新请求后 `access.log` 涨到 90 字节——`nginx -s reopen` 把句柄切到了新文件，链路闭合。

## 错误写法对比：漏掉 postrotate

把配置里的 `postrotate/endscript` 块删掉，同样强制轮转、再造一个请求：

![配图2](/images/csdn/figures/logrotate-csdn138911849-2.png)

结果：新 `access.log` 是 0 字节，归档也没增长——**新请求凭空消失了**。机制：没有 reopen，Nginx worker 还握着旧文件的打开句柄；logrotate 改名并压缩删除后，句柄指向一个已不存在的目录项，新日志全部写进这个"幽灵 inode"。数据丢了，磁盘空间还得等句柄关闭才释放，双输。`nginx -s reopen` 这一行不能省。

## 手动运行

logrotate 由 cron 每日自动执行（入口在 /etc/cron.daily/logrotate），日常无需干预。手动跑一次可以用：

```bash
sudo logrotate /etc/logrotate.conf
```

或只针对 Nginx 的配置：

```bash
sudo logrotate /etc/logrotate.d/nginx
```

排错时用 `-d` 干跑（不改任何文件）、`-f` 强制轮转、`-v` 看详细过程，三个开关组合够覆盖绝大多数调试场景。实测里 `-d` 输出的 `rotating pattern: ... weekly, (4 rotations)` 一行就是当前配置的"人话翻译"，检查它比自己脑补配置语义可靠得多。

另外两个实用开关：`-s statefile` 指定独立的状态文件（测试新配置不污染正式记录），`--force 配合 -v` 是线上排日志轮转问题的首选组合。

## 注意事项

- 改完配置先用 `logrotate -d /path/to/config` 干跑一次，它只打印执行计划不真轮换，确认无误再放手。
- postrotate 里的 `nginx -s reopen` 不能省，漏掉会导致日志静默丢失（实测见上节），新文件一直为空。
- create 的权限和属主要与 Nginx 实际运行用户一致，否则轮换后 Nginx 写不进新日志。
- rotate 的保留份数乘以单日志大小，预留好磁盘空间，压缩后大约能省七成空间但轮换瞬间仍是原尺寸。

## 小结

回到开场的日志膨胀：logrotate 带来周期、压缩、清理三件事，postrotate 钩子保证 Nginx 无缝切到新文件——实测证明这行钩子是整套方案里唯一"漏了就丢数据"的点。配完先 `-d` 干跑，再 `-f` 轮一圈看产物，五分钟就能对生产日志放心的方案，值得每个装了 Nginx 的机器都有。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
