---
title: "/proc/sys/vm/drop_caches Best Practices: Manually Dropping Kernel Caches"
date: 2024-05-18 10:00:00
updated: 2026-09-14
lang: en
categories: [Tech, Linux]
tags: [Linux]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1575318633968-0383e7d07ca0?w=1600&q=80&fm=jpg
---

Linux puts idle memory to work as file cache, so memory appearing "full" in `free` is often just the cache doing its job, not a real shortage — the available column is what applications can actually get. `/proc/sys/vm/drop_caches` therefore shouldn't be cleaned every day, but it is the standard tool when you need a clean baseline before performance testing or want a maintenance window to start from a clean state: no reboot needed — write a number into this special file and the kernel releases the corresponding type of cache.

This post explains, scenario by scenario, what each of the three values clears, how to verify the cache really dropped, and that `sudo echo` redirection trap almost everyone has stepped in. All commands were tested in a Rocky Linux 9.3 privileged container (kernel 7.0.12-linuxkit of the Docker Desktop VM — drop_caches acts on that kernel).

## What It Can Clear

Writing different values to `/proc/sys/vm/drop_caches` makes the kernel clear different ranges of cache:

| Value written | What gets cleared | Corresponding memory |
|--------|---------|---------|
| `1` | Page cache | Recently accessed file contents; free's buff/cache |
| `2` | Dentries + inode cache | Filesystem metadata; the reclaimable part of Slab in /proc/meminfo |
| `3` | All of the above | The most thorough |

It is a one-shot command, not a persistent setting: a write triggers a single cleaning action, the kernel does not remember the value, and the cache fills back up as usual afterwards. Never put it into persistent config like sysctl.conf — that is meaningless at best and can trigger a mysterious cache clear after every reboot. (One kernel quirk to add: on some kernels the file is simply not readable — in my container, `cat` on it returned Permission denied while the write permission worked fine. That is normal, not a fault.)

## Scenario 1: A Clean Baseline Before Performance Testing

When testing filesystem read performance, you must exclude the interference of "the previous round's files still sitting in cache" — cache hits and real disk reads differ by orders of magnitude, and numbers measured on a warm cache are not comparable.

```bash
sync                              # flush dirty pages to disk first
echo 3 | sudo tee /proc/sys/vm/drop_caches
```

Run the test after cleaning, and every run reflects true cold-cache disk behavior.

## Scenario 2: A Maintenance Window Starting from a Clean State

Clear the cache once before system maintenance so subsequent observation (memory usage, IO behavior) is not muddied by historical cache. The operation is the same as Scenario 1; the key is **sync first, drop second**:

`sync` flushes dirty data still in memory to disk. drop_caches only clears "clean" cache pages — dirty pages (modified, not yet written) are never discarded (that would lose data), but running sync first turns more pages reclaimable, making the cleaning more thorough and avoiding the collision between cleaning and writeback that causes IO jitter.

## Scenario 3: Reclaiming Under Memory Pressure

When memory is genuinely tight and space must be freed immediately, drop_caches can release the memory held by cache. But be clear: this treats the symptom — once the cache is dropped, subsequent file access re-reads from disk, IO pressure rises, and the system may get slower. For a real memory shortage, investigate who is eating memory (`ps aux --sort=-%mem | head`) instead of repeatedly clearing caches.

## Usage Examples and Verified Results

The three write-ups:

```bash
# drop the page cache
echo 1 | sudo tee /proc/sys/vm/drop_caches

# drop dentry and inode caches
echo 2 | sudo tee /proc/sys/vm/drop_caches

# drop all caches at once
echo 3 | sudo tee /proc/sys/vm/drop_caches
```

**How to confirm it really cleared** — don't settle for "the command didn't error"; compare buff/cache before and after. Test: create a 200MB file, read it into cache, sync, then echo 1:

![Figure 1: before/after echo 1](/images/csdn/figures/proc-sys-vm-drop-caches-csdn138909671-1.png)

buff/cache dropped from 2962MB to 372MB — note that what was released is not just that 200MB file but the entire page cache of that kernel at that moment (containers share the kernel with the host, so this one write affects the whole VM). available rose accordingly. Next, echo 3's effect on Slab (dentry/inode):

![Figure 2: before/after echo 3](/images/csdn/figures/proc-sys-vm-drop-caches-csdn138909671-2.png)

echo 3 pushed down both the page cache (579→246MB) and the reclaimable Slab (271584→135456 kB, dentry/inode halved) — that is what makes it more thorough than echo 1.

Commit the verification method to memory: run `free -m` (watch buff/cache) and `grep Slab /proc/meminfo` (watch the metadata cache) once before and once after cleaning. Numbers going down is what "really cleared" means.

## The Wrong Way: sudo echo Redirection

This is the trap nearly everyone has stepped in — assuming this clears the cache:

```bash
sudo echo 3 > /proc/sys/vm/drop_caches
# bash: /proc/sys/vm/drop_caches: Permission denied
```

Why it fails: the `>` redirection is performed by the **current shell**, not by the process sudo launches. sudo only elevates `echo` (which writes to stdout and needs no root at all), while the one actually opening `/proc/sys/vm/drop_caches` for the redirection is still your ordinary-user shell — insufficient permissions, Permission denied. Verified reproduction (the same redirection run as a non-root user):

![Figure 3: the redirection trap verified](/images/csdn/figures/proc-sys-vm-drop-caches-csdn138909671.png)

The correct approach is to make the "write the file" action itself run as root. All three of these work:

```bash
echo 3 | sudo tee /proc/sys/vm/drop_caches   # recommended: tee writes as root
sudo sh -c 'echo 3 > /proc/sys/vm/drop_caches'  # the entire subshell is elevated
sudo bash -c "echo 3 > /proc/sys/vm/drop_caches"
```

`tee` is the most common: the echo on the left of the pipe runs as a normal user, but tee is elevated by sudo and writes the file as root.

## Caveats

- **sync before dropping**: `sync` flushes dirty data still in memory to disk before you clean, avoiding a collision between the cleaning and unwritten data. Also make sure no important IO is in progress before executing, so the cleanup doesn't fail operations or cause performance wobble.
- **Performance dips briefly afterwards**: cleared caches need to be re-warmed by subsequent access, so disk reads rise noticeably for a while right after cleaning. Run it in off-peak hours in production and never make it routine — putting drop_caches into a cron job is an anti-pattern.
- **Don't mistake cache clearing for memory optimization**: memory being used as cache is Linux's normal state; a high buff/cache in `free` is not a problem (that memory is "lent to the cache, reclaimable at any time"). Only explicit reasons like test baselines and maintenance windows justify touching it. Judge memory adequacy by available, not free.
- **Container/cloud specifics**: drop_caches acts on the whole kernel; running it in a container (if permitted) affects every container on the host — the tests in this post were done inside a privileged container, and ordinary containers usually lack permission to write this file. Think through the blast radius before running it on a production host.
- **It is not a persistent setting**: a write changes no persistent sysctl value; after a reboot, or even after the next cache fill, the cache works as usual. To tune kernel reclaim behavior, look at real tunables like `vm.vfs_cache_pressure` and `vm.swappiness`.

drop_caches is a "use occasionally, use in the right place" tool: clear a baseline before tests, clear the state in a maintenance window, pair it with sync and a before/after `free` comparison, and it gives you a clean starting point. But in daily operation, a high buff/cache is health, not disease — keep your hands off it; it is not a routine memory-cleaning operation.

> This article was reconstructed from the author's CSDN blog posts from 2020–2024, originally published on CSDN.
