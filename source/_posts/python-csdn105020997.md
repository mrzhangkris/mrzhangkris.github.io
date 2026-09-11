---
title: "Python 实时读取子进程输出：-u 参数与 flush=True"
date: 2020-03-22 11:46:08
updated: 2026-09-11
categories: [技术]
tags: [Python]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1605436247078-f0ef43ee8d5c?w=1600&q=80&fm=jpg
---

用 `subprocess` 调用外部 Python 脚本时，常会遇到一个怪现象：子进程明明在逐行打印，父进程却要等它跑完才一次性拿到所有输出。原因是子进程的标准输出接了管道之后不再是终端，Python 会改用块缓冲，输出攒够一批才真正写出去。解法有两个：调用时给解释器加 `-u` 参数，或者在子进程的 `print` 里用 `flush=True`。下面用两个小脚本把两种方法都验证一遍。

### 先造一个慢慢输出的子进程

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

### 用 Popen 读子进程输出

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

### 方法一：给子进程加 -u 参数

把调用命令改成 `/usr/bin/python3 -u ...`：

![配图](/images/csdn/figures/python-csdn105020997.png)

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

再运行，父进程就能实时地每隔一秒读到一条时间了。`-u` 让解释器强制不缓冲 stdout 和 stderr，每条输出立即写入管道。

### 方法二：print 里加 flush=True

换一种改法：`result_output.py` 去掉 `-u` 恢复原样，改在子进程 `system_time.py` 的 `print` 函数里加 `flush=True`。

`result_output.py` 文件内容：

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

`system_time.py` 文件内容：

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

运行后同样能实时逐行读到输出。`flush=True` 的作用范围只在这一条 `print`，每次打印后立刻强制刷新缓冲区。

## 小结

- 现象的本质：stdout 接管道后 Python 从行缓冲退化为块缓冲，父进程只能等攒批。
- `-u` 参数一次性解决整个子进程的缓冲问题，适合改不了对方代码的场景。
- `flush=True` 精确到单条打印，适合能改子进程代码、只想让关键输出实时可见的场景。
- 两种方法选其一即可，都加上也不冲突，但没必要。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
