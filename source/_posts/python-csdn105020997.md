---
title: "Python 实时读取子进程输出：-u 参数与 flush=True"
date: 2020-03-22 11:46:08
updated: 2026-09-14
categories: [技术]
tags: [Python]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1605436247078-f0ef43ee8d5c?w=1600&q=80&fm=jpg
---

用 `subprocess` 调用外部 Python 脚本时，常会遇到一个怪现象：子进程明明在逐行打印，父进程却要等它跑完才一次性拿到所有输出。原因是子进程的标准输出接了管道之后不再是终端，Python 会从行缓冲退化为**块缓冲**——输出攒够一批（通常 4KB/8KB）或进程退出才真正写出去。

解法有两个：调用时给解释器加 `-u` 参数，或者在子进程的 `print` 里用 `flush=True`。这篇用几个小脚本在 debian:12 容器（apt 安装的 Python 3.11.2）里把两种方法都实测验证，并给出带时间戳的对照数据——缓冲与否，一眼就能看出来。

## 核心机制一句话

Python 的 stdout 缓冲策略取决于它接到哪里：接终端是行缓冲（每行立即可见），接管道/文件是块缓冲（攒批写出）。subprocess 的 PIPE 恰恰是管道，所以子进程的 print 全被攒住了。`-u` 和 `flush=True` 都是绕过这个策略：前者让整个解释器无缓冲，后者让单条打印立即刷新。

## 先造一个慢慢输出的子进程

`system_time.py` 获取系统时间，每秒打印一次，共打印 3 次：

```python
# !/usr/bin/python3
# -*- coding: utf-8 -*-
import datetime
import time

for line in range(0, 3):
    print(datetime.datetime.now().strftime("%H:%M:%S"))
    if line == 2:
        break
    time.sleep(1)
```

直接运行它，可以看到三个时间点每隔一秒出现一个；有间隔的输出，才能用来检验父进程是不是"实时"读到了。

## 用 Popen 读子进程输出

`result_output.py` 用 `subprocess.Popen` 启动 `system_time.py`，并循环读取它的标准输出：

```python
# !/usr/bin/python3
# -*- coding: utf-8 -*-
import subprocess
res = subprocess.Popen(["/usr/bin/python3 /root/system_time.py"],
                       shell=True,
                       stdout=subprocess.PIPE,
                       stderr=subprocess.PIPE)
while res.poll() is None:
    print(res.stdout.readline())
```

`poll()` 在子进程未结束时返回 `None`，循环里逐行 `readline()`。实际运行 `result_output.py` 会发现：三个时间点并没有每隔一秒打印一条，而是子进程结束后一口气全部冒出来——输出被缓冲了。

实测复现（父进程在每行到达时打上自己的时间戳）：

![配图1：基线缓冲实测](/images/csdn/figures/python-csdn105020997-1.png)

子进程的输出时间是 29/30/31 秒（每秒一行），但父进程在 31 秒这一刻才一次性收到全部三行——管道缓冲的铁证。

## 方法一：给子进程加 -u 参数

把调用命令改成 `/usr/bin/python3 -u ...`：

```python
# !/usr/bin/python3
# -*- coding: utf-8 -*-
import subprocess
res = subprocess.Popen(["/usr/bin/python3 -u /root/system_time.py"],
                       shell=True,
                       stdout=subprocess.PIPE,
                       stderr=subprocess.PIPE)
while res.poll() is None:
    print(res.stdout.readline())
```

再运行，父进程就能实时地每隔一秒读到一条时间了：

![配图2：-u 实时实测](/images/csdn/figures/python-csdn105020997-2.png)

`-u` 让解释器强制不缓冲 stdout 和 stderr，每条输出立即写入管道。适合**改不了对方代码**的场景——比如子进程是第三方脚本或系统工具（`python -u some_tool.py`），一个参数解决整个进程的缓冲问题。

## 方法二：print 里加 flush=True

换一种改法：`result_output.py` 去掉 `-u` 恢复原样，改在子进程 `system_time.py` 的 `print` 函数里加 `flush=True`。

`result_output.py` 文件内容（和最初版本完全一样）：

```python
# !/usr/bin/python3
# -*- coding: utf-8 -*-
import subprocess
res = subprocess.Popen(["/usr/bin/python3 /root/system_time.py"],
                       shell=True,
                       stdout=subprocess.PIPE,
                       stderr=subprocess.PIPE)
while res.poll() is None:
    print(res.stdout.readline())
```

`system_time.py` 文件内容（只改 print 这一行）：

```python
# !/usr/bin/python3
# -*- coding: utf-8 -*-
import datetime
import time

for line in range(0, 3):
    print(datetime.datetime.now().strftime("%H:%M:%S"), flush=True)
    if line == 2:
        break
    time.sleep(1)
```

运行后同样能实时逐行读到输出：

![配图3：flush=True 实时实测](/images/csdn/figures/python-csdn105020997-3.png)

`flush=True` 的作用范围只在这一条 `print`，每次打印后立刻强制刷新缓冲区。适合**能改子进程代码**、只想让关键输出（进度、日志、告警）实时可见的场景——其余输出照旧攒批，整体开销比全程无缓冲小。

## 两种方法怎么选

| 维度 | `-u` 参数 | `flush=True` |
|------|----------|--------------|
| 改哪里 | 父进程的调用命令 | 子进程的 print 语句 |
| 作用范围 | 整个解释器的 stdout/stderr | 单条 print |
| 能否改子进程代码 | 不需要 | 需要 |
| 开销 | 全程无缓冲，高频输出时略大 | 只刷关键输出，可控 |
| 典型场景 | 跑第三方脚本/工具 | 自己的脚本，进度实时上报 |

补充一个环境变量方案：改不了命令行也不想动代码时，给子进程注入 `PYTHONUNBUFFERED=1`（等效 `-u`）：

```python
import os, subprocess
env = dict(os.environ, PYTHONUNBUFFERED="1")
res = subprocess.Popen(["/usr/bin/python3", "/root/system_time.py"],
                       stdout=subprocess.PIPE, env=env, text=True)
```

实测同样逐秒实时到达：

![配图4：PYTHONUNBUFFERED 实测](/images/csdn/figures/python-csdn105020997.png)

## 顺手说两个相关坑

- **父进程 readline() 的阻塞**：`res.stdout.readline()` 在子进程没输出时会阻塞——上面 `while res.poll() is None` 的写法在子进程结束瞬间可能漏读最后一行（poll 先返回非 None，循环退出，缓冲区里还剩没读完的行）。严谨的写法是循环读到 readline() 返回空字符串为止，或用 `for line in res.stdout:` 迭代。
- **text 模式与字节模式**：不加 `text=True`（或 `universal_newlines=True`）时，readline() 返回的是 bytes（`b'07:23:11\n'`），打印出来带 b 前缀；要字符串就加 `text=True`。

## 小结

- 现象的本质：stdout 接管道后 Python 从行缓冲退化为块缓冲，父进程只能等攒批（实测：三行输出在子进程结束那一刻同时到达）。
- `-u` 参数一次性解决整个子进程的缓冲问题，适合改不了对方代码的场景。
- `flush=True` 精确到单条打印，适合能改子进程代码、只想让关键输出实时可见的场景。
- `PYTHONUNBUFFERED=1` 环境变量等效 `-u`，命令行动不了时的第三条路。
- 两种方法选其一即可，都加上也不冲突，但没必要。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。