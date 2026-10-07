---
title: "Essential Linux Commands: ls, cd, mkdir, rm, cp (Tested on Rocky Linux 9)"
date: 2024-05-11 14:41:31
lang: en
updated: 2026-09-14
categories: [Tech, Linux]
tags: [Linux]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1629654297299-c8506221ca97?w=1600&q=80&fm=jpg
---

When you take over a Linux machine, the daily operations come down to the same handful: list directories, change directories, create directories, delete things, copy things. This post pairs each of these five most basic commands with a real output example — all captured from actual runs in a Rocky Linux 9 container. Usage is exactly the same on CentOS 7.

## ls: List Directory Contents

ls displays the files and subdirectories inside a directory. Common options:

| Option | Effect |
| --- | --- |
| -l | Show detailed information in list format |
| -a | Show all files, including hidden ones |
| -h | When used with -l, converts byte counts into readable units like K and M |

A detailed listing of all files in the current directory (including hidden ones):

```bash
ls -la
```

Tested output (root's home directory, excerpted):

![ls test](/images/csdn/figures/centos-csdn138715327-1.png)

The first character at the start of each line indicates the entry type: `d` means a directory, `-` means a regular file; `.` and `..` stand for the current directory and the parent directory, respectively.

## cd: Change the Working Directory

cd changes your current working directory. It produces no output itself, so confirm with pwd afterwards:

```bash
cd /var/log && pwd
```

Tested output: `/var/log` (shown in the same screenshot as the mkdir test below). The current directory name in your prompt also changes along with it — a quick confirmation when you don't feel like typing pwd.

## mkdir: Create New Directories

mkdir creates new directories; the `-p` option also creates missing parent directories along the way:

```bash
mkdir -p /root/a/b/c
```

Check the result recursively with ls -R. Tested: the entire path was created in one shot:

![cd and mkdir test](/images/csdn/figures/centos-csdn138715327-2.png)

Without `-p`, running `mkdir /root/a/b/c` directly errors out because /root/a and /root/a/b don't exist — `-p` fills in the whole path.

## rm: Delete Files and Directories

rm deletes files or directories. Two options to memorize:

| Option | Effect |
| --- | --- |
| -r | Delete directories recursively, along with their contents |
| -f | Force deletion; ignore nonexistent files, no prompts along the way |

Recursive deletion with verification. Tested: getting `No such file or directory` is precisely the proof that everything was deleted:

![rm test](/images/csdn/figures/centos-csdn138715327-3.png)

## cp: Copy Files or Directories

cp copies files or directories. Common options:

| Option | Effect |
| --- | --- |
| -r | Copy directories and their contents |
| -i | Prompt before overwriting files |
| -u | Copy only when the source is newer than the destination, or when the destination doesn't exist |

Build a directory with a file in it, then copy it, and inspect both sides. Tested: the copy succeeded and the original directory remained:

![cp test](/images/csdn/figures/centos-csdn138715327-4.png)

Copying a directory requires `-r`: without it, GNU cp reports `cp: -r not specified; omitting directory` and skips the directory entirely. To verify the contents match, run `diff -r a d` — no output means both sides are identical.

## Notes and Cautions

- `rm -rf` has no recycle bin — once deleted, it's gone. Read the path twice before executing, especially with wildcards involved.
- For large file listings, use `ls -lh`; `-h` converts byte counts into readable units like K and M.
- `mkdir -p` creates the entire path in one shot; always include it in scripts to save yourself a pile of existence checks.
- Remember `-r` when copying directories (tested: without `-r`, GNU cp reports `-r not specified; omitting directory`); add `-i` if you don't want destination files silently overwritten.

Five commands on one card, pinned within reach:

![Cheat sheet](/images/csdn/figures/centos-csdn138715327.png)

> This article was rebuilt from the author's CSDN blog posts published between 2020 and 2024, originally published on CSDN.
