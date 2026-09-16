---
title: "Reading Subprocess Output in Real Time with Python: the -u Flag and flush=True"
date: 2020-03-22 11:46:08
updated: 2026-09-14
categories: [Tech, Python]
tags: [Python]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1605436247078-f0ef43ee8d5c?w=1600&q=80&fm=jpg
lang: en
---

When you call an external Python script through `subprocess`, you often hit a strange phenomenon: the child process is clearly printing line by line, yet the parent process gets all the output only in one lump after the child finishes. The reason is that once the child's stdout is connected to a pipe, it is no longer a terminal, and Python degrades from line buffering to **block buffering** — output is actually written out only when a batch accumulates (usually 4KB/8KB) or the process exits.

There are two fixes: add the `-u` flag to the interpreter at call time, or use `flush=True` in the child's `print`. This post live-tests both methods with a few small scripts inside a debian:12 container (Python 3.11.2 from apt), and gives timestamped comparison data — buffered or not, you can see it at a glance.

## The Core Mechanism in One Sentence

Python's stdout buffering strategy depends on where it is connected: to a terminal it's line buffered (each line appears immediately); to a pipe/file it's block buffered (written out in batches). subprocess's PIPE is exactly a pipe, so all of the child's prints get held back. Both `-u` and `flush=True` bypass this strategy: the former makes the whole interpreter unbuffered, the latter flushes a single print immediately.

## First, Build a Slowly Outputting Child Process

`system_time.py` reads the system time and prints once per second, three times in total:

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

Run it directly and you'll see three timestamps appear one second apart; only output with intervals can be used to test whether the parent process is reading "in real time".

## Reading Child Output with Popen

`result_output.py` starts `system_time.py` with `subprocess.Popen` and reads its stdout in a loop:

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

`poll()` returns `None` while the child hasn't finished, and the loop reads line by line with `readline()`. Running `result_output.py` for real, you'll find the three timestamps do not arrive one per second — they all pop out in one burst after the child process ends: the output was buffered.

Reproduced live (the parent stamps each line with its own arrival time):

![Figure 1: baseline buffering live test](/images/csdn/figures/python-csdn105020997-1.png)

The child's output times are seconds 29/30/31 (one line per second), but the parent receives all three lines at once at second 31 — hard evidence of pipe buffering.

## Method 1: Add -u to the Child

Change the invocation to `/usr/bin/python3 -u ...`:

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

Run it again and the parent now reads one timestamp per second, in real time:

![Figure 2: -u real-time live test](/images/csdn/figures/python-csdn105020997-2.png)

`-u` forces the interpreter to leave stdout and stderr unbuffered, so every output is written to the pipe immediately. It fits the scenario where **you can't change the other side's code** — for example, when the child is a third-party script or system tool (`python -u some_tool.py`) — one flag solves the buffering problem for the whole process.

## Method 2: Add flush=True to print

A different fix: revert `result_output.py` to its original form (drop `-u`), and instead add `flush=True` to the `print` in the child `system_time.py`.

Contents of `result_output.py` (identical to the very first version):

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

Contents of `system_time.py` (only the print line changed):

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

After running, the output likewise arrives line by line in real time:

![Figure 3: flush=True real-time live test](/images/csdn/figures/python-csdn105020997-3.png)

`flush=True` applies only to that one `print`: each print immediately forces a buffer flush. It fits the scenario where **you can change the child's code** and only need key output (progress, logs, alerts) visible in real time — the rest keeps batching as before, and the overall overhead is smaller than fully unbuffered.

## How to Choose Between the Two

| Dimension | `-u` flag | `flush=True` |
|------|----------|--------------|
| What you change | The parent's invocation command | The child's print statement |
| Scope | The whole interpreter's stdout/stderr | A single print |
| Child code editable? | Not required | Required |
| Overhead | Fully unbuffered, slightly higher under high-frequency output | Flushes only key output, controllable |
| Typical scenario | Running third-party scripts/tools | Your own script, live progress reporting |

One more option via environment variable: when you can't touch the command line and don't want to touch code either, inject `PYTHONUNBUFFERED=1` into the child (equivalent to `-u`):

```python
import os, subprocess
env = dict(os.environ, PYTHONUNBUFFERED="1")
res = subprocess.Popen(["/usr/bin/python3", "/root/system_time.py"],
                       stdout=subprocess.PIPE, env=env, text=True)
```

Tested live: output likewise arrives in real time, one line per second:

![Figure 4: PYTHONUNBUFFERED live test](/images/csdn/figures/python-csdn105020997.png)

## Two Related Pitfalls Along the Way

- **Blocking of the parent's readline()**: `res.stdout.readline()` blocks when the child has no output — the `while res.poll() is None` pattern above can miss the last line at the instant the child exits (poll returns non-None first, the loop exits, and lines remain unread in the buffer). The rigorous pattern is to loop until readline() returns an empty string, or iterate with `for line in res.stdout:`.
- **text mode vs bytes mode**: without `text=True` (or `universal_newlines=True`), readline() returns bytes (`b'07:23:11\n'`), which print with the b prefix; add `text=True` when you want strings.

## Summary

- The essence of the phenomenon: with stdout connected to a pipe, Python degrades from line buffering to block buffering, and the parent can only wait for batches (measured: three lines of output arrived simultaneously at the moment the child exited).
- The `-u` flag solves the whole child's buffering problem in one shot — for when you can't change the other side's code.
- `flush=True` is precise to a single print — for when you can change the child's code and only need key output visible in real time.
- The `PYTHONUNBUFFERED=1` environment variable is equivalent to `-u`, the third path when the command line is out of reach.
- Either one method alone suffices; combining them doesn't conflict, but there's no need.

> This post was reconstructed from the author's CSDN blog articles written between 2020 and 2024; it was originally published on CSDN.
