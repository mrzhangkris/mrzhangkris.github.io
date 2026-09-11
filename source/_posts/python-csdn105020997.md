---
title: "Python实时获取外部程序输出结果"
date: 2020-03-22 11:46:08
categories: [技术]
tags: [Python]
copyright_author: 张鹏
cover: /images/csdn/covers/python-csdn105020997.png
---

如何Python实时获取外部程序输出结果，可以在运行时加上-u参数或者在print函数中使用flush=True
下面写两个脚本验证一下是否可行。

### system\_time.py

获取系统时间，每秒打印一次，共打印3次

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

运行结果

![在这里插入图片描述](/images/csdn/105020997-1.gif)

### result\_output.py

使用subprocess.Popen执行启动system\_time.py文件命令

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

运行结果
![在这里插入图片描述](/images/csdn/105020997-2.gif)

运行result\_output.py发现并没有实时的逐行打印，那加上-u参数试一下

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

运行结果
![在这里插入图片描述](/images/csdn/105020997-3.gif)
加上-u后可以实时打印了，在看一下在print函数中加上flush=True的效果
首先要在result\_output.py文件中去掉-u参数，然后在system\_time.py文件的print函数中加上flush=True

result\_output.py文件内容

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

system\_time.py文件内容

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

运行结果：
![在这里插入图片描述](/images/csdn/105020997-4.gif)

---

> 本文迁移自作者 CSDN 博客，2020-03-22 首发于 CSDN，内容保持原貌。
