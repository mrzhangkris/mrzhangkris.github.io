---
title: "用 logrotate 管理 Nginx 日志：配置、钩子与实测"
date: 2024-05-20 08:45:00
categories: [技术]
tags: [Linux]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1573164713988-8665fc963095?w=1600&q=80&fm=jpg
updated: 2026-09-14
---

Nginx 的访问日志和错误日志是持续增长的，不管不问迟早写满磁盘，翻历史日志时也会被巨大的单文件拖累。logrotate 就是系统自带的解法：按周期轮换、压缩、删除旧日志，配合 postrotate 钩子让 Nginx 无缝切换到新文件。这篇以 Nginx 为例走一遍完整配置，全流程在 nginx:alpine 容器实测（nginx/1.31.5 + logrotate 3.22.0），包括"漏掉 postrotate 会怎样"的对比实验。

## 实验环境

- nginx:alpine 容器（nginx/1.31.5），`apk add logrotate`（3.22.0）；
- 日志落在真实文件（镜像默认把 access.log 软链到 stdout，先删掉软链建普通文件）；
- 周期参数（weekly 等）靠 `-f` 强制触发验证，无需等一周。

## 安装

大多数发行版默认已装，没有的话用包管理器补上：

```bash
sudo apt install logrotate   # Debian/Ubuntu
sudo dnf install logrotate   # CentOS/RHEL/Rocky 9
apk add logrotate            # Alpine
```

## 核心机制：rename + reopen

logrotate 的轮转本质是两步：把 `access.log` 改名成 `access.log.1`（rename 是原子操作，Nginx 无感知，也不会丢这一瞬间的日志），再靠 postrotate 里的 `nginx -s reopen` 通知 Nginx 放开旧句柄、打开新文件。理解了这一句，下面配置里的每一项都能对号入座。`/etc/logrotate.d/` 下的文件会被主配置 `/etc/logrotate.conf` include，按服务拆文件即可，通常不用动主配置。

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

多个不同目录的日志，把通配行换成逐条列出即可。想用日期当后缀（`access.log-20260914.gz` 而不是 `.1.gz`），加一行 `dateext`；压缩想延后一轮再做（给还在写入的旧日志留时间），加 `delaycompress`。

周期与大小还可以组合出击：`weekly` 配上 `maxsize 200M`，含义是"每周轮一次，但单文件涨到 200M 就提前轮"，突发流量大的站点靠这个兜底。只写 `size 200M` 则完全按大小触发，到期与否不再重要。

## 配置项逐条解释

- `weekly`：每周轮换一次。也可以用 `daily`/`monthly`，或 `size 100M` 按大小触发。
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

读实测结果，配置里每一项都对上了号：`access.log` 变成 0 字节新文件且属主是 `nginx nginx`（`create` 生效）；旧日志成了 `access.log.1.gz`（`compress` 生效）；新请求后 `access.log` 涨到 84 字节——`nginx -s reopen` 把句柄切到了新文件，链路闭合。

顺带说 logrotate 怎么记住"上周轮过没有"：状态记录在 `/var/lib/logrotate/` 下的状态文件里（每个日志一行：上次轮换时间）。用 `-s` 可以指定独立状态文件——测试新配置时不污染正式记录，就是靠它。

两个常见疑问顺带答掉：轮转瞬间会不会丢日志？不会——rename 改名是原子操作，旧句柄继续写旧文件，直到 reopen 切走；轮转后旧文件去哪了？`rotate 4` 之外的更早归档已被自动删除，压缩前的那一刻它们还是原尺寸，磁盘要按"最大一份日志 × (rotate+1)"预留。

## 错误写法对比：漏掉 postrotate

把配置里的 `postrotate/endscript` 块删掉，同样强制轮转、再造一个请求：

![配图2](/images/csdn/figures/logrotate-csdn138911849-2.png)

结果：新 `access.log` 是 0 字节，归档也没增长——**新请求凭空消失了**。机制：没有 reopen，Nginx worker 还握着旧文件的打开句柄；logrotate 改名并压缩删除后，句柄指向一个已不存在的目录项，新日志全部写进这个"幽灵 inode"。数据丢了，磁盘空间还得等句柄关闭才释放，双输。`nginx -s reopen` 这一行不能省。

实在改不了应用（没有 reopen 能力）的兜底方案是 `copytruncate`：先把日志复制一份再截断原文件，应用全程握着同一个句柄。代价是复制和截断之间写进来的几行会丢——能 reopen 就别用它。

## 手动运行与定时入口

日常 logrotate 不需要人管，定时入口各系统不同：Debian 系挂在 /etc/cron.daily/；Rocky 9 起已改为 systemd 定时器（`logrotate.timer`，默认每天触发，`systemctl status logrotate.timer` 可查）。手动跑一次针对 Nginx 的配置：

```bash
sudo logrotate -f /etc/logrotate.d/nginx          # 立即强制轮转
sudo logrotate -d /etc/logrotate.d/nginx          # 干跑，只打印执行计划
```

排错就靠 `-d` 干跑、`-f` 强制轮转、`-v` 看详细过程三个开关组合。实测里 `-d` 输出的 `rotating pattern: /var/log/nginx/*.log weekly ...` 一行就是当前配置的"人话翻译"，检查它比自己脑补配置语义可靠得多。

## 失败出口

- **轮转后 Nginx error log 报 permission denied / open() failed**：九成是 `create` 的属主权限和实际运行用户不一致，对照 `ps aux | grep nginx` 的 worker 用户改正。
- **轮转完日志还在暴涨**：postrotate 没生效，看 `/var/lib/logrotate/` 状态文件的时间戳确认轮转是否真的执行过，再核对 reopen 命令路径。
- **配置写坏了**：`logrotate -d` 会把语法和解析错误直接打出来，改到无报错再上线；改动只涉及 /etc/logrotate.d/ 下单个文件，删掉该文件即回退。

## 注意事项

- 改完配置先用 `logrotate -d /path/to/config` 干跑一次，它只打印执行计划不真轮换，确认无误再放手。
- postrotate 里的 `nginx -s reopen` 不能省，漏掉会导致日志静默丢失（实测见上节），新文件一直为空。
- create 的权限和属主要与 Nginx 实际运行用户一致，否则轮换后 Nginx 写不进新日志。
- rotate 的保留份数乘以单日志大小，预留好磁盘空间，压缩后大约能省七成空间但轮换瞬间仍是原尺寸。
- 容器里跑 Nginx 通常不需要 logrotate：官方镜像把日志软链到 stdout/stderr，交给 Docker 的 json-file 轮转或日志收集器处理；只有把日志落成真实文件（如本文实验）时 logrotate 才有用武之地。

## 小结

回到开场的日志膨胀：logrotate 带来周期、压缩、清理三件事，postrotate 钩子保证 Nginx 无缝切到新文件——实测证明这行钩子是整套方案里唯一"漏了就丢数据"的点。配完先 `-d` 干跑，再 `-f` 轮一圈看产物，五分钟就能对生产日志放心的方案，值得每个装了 Nginx 的机器都有。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
