---
title: "Linux Disk I/O Tuning: Adjusting the Request Queue Length nr_requests"
date: 2024-05-15 17:01:14
categories: [Tech, Linux]
tags: [Linux]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1675495277087-10598bf7bcd1?w=1600&q=80&fm=jpg
updated: 2026-09-14
lang: en
---

When a high-load server's disk I/O saturates, besides buying hardware there is one kernel parameter worth trying: the I/O request queue length `nr_requests`. It decides how many requests each block device can queue at once; with a larger value, the disk scheduler has more room to work with in multi-tasking scenarios, and latency often comes down. This post records how to view and adjust it on Rocky 9 — viewing, adjusting, and verification were all tested in a Rocky 9.3 container, and the testing also exposed a "won't write" pitfall, covered here as well.

## Lab Environment

- Rocky Linux 9.3 disposable container (`docker run --privileged`, needed to write /sys);
- Test subjects: the vda visible to the container (a virtio virtual disk, default 256) and a loop device (default 128);
- iostat from sysstat 12.5.4;
- Physical-machine SATA/SAS disks go through the same /sys interface, so the procedure is identical.

## What the Request Queue Length Affects

In Linux, every disk device has its own I/O request queue, and the queue length is the number of requests the device can buffer. A longer queue lets the kernel accumulate more requests for scheduling and merging, with noticeable effect under high load and multi-tasking; the price is kernel memory — every queued request occupies memory, so doubling the queue doubles the overhead.

The mechanism in one sentence: **nr_requests is the scheduler's "raw material pool" — only with a big pool is there room for merging and reordering**.

While we're here, meet its neighbor in the same directory, `read_ahead_kb`: the readahead size, deciding how much extra the kernel "grabs on the side" behind a read request. Verified: virtio disks default to 8192 (8MB), far larger than the 128 many old references mention — the distro has already tuned it once for you, so check the actual value before touching it. For sequential-read-heavy workloads (large file copies, log scans), raising it often pays off more directly than raising nr_requests, and the two parameters are usually evaluated together.

Another easily confused concept is the hardware queue depth (NCQ-level queue depth): nr_requests governs how many requests pile up in the **kernel software queue**, while hardware queue depth governs how many the disk can accept at once — they sit up- and downstream on the chain. Raising nr_requests only buffers more on the kernel side; a bottleneck at the disk (mechanical seek time, host-side throttling of a virtual disk) doesn't disappear because of it.

**How large to go**: there is no universal value. The common approach is to double from the baseline (128→256→512), take one iostat sample set per step as in Example 3, and proceed only when await drops and aqu-sz rises — that's the sign the direction is right; on memory-tight machines, glance at free memory after each doubling. NVMe disks come with deep hardware queues and usually don't need touching.

## Example 1: Reading the Current Value

Read the /sys filesystem directly, once for the virtual disk and once for the loop device (defaults differ):

![Figure 1](/images/csdn/figures/linux-i-o-csdn138915131-1.png)

**Verification point**: the command prints a single number (128 is common for real SATA/SAS disks, 1023/1024 for NVMe) — record this baseline before touching anything.

## Example 2: Adjusting

Write to the same file to adjust; raise it and observe:

```bash
# Set the request queue length to 256
echo 256 > /sys/block/sda/queue/nr_requests
```

Verified results split two ways: **not every device accepts the change**. vda went from 256 to 512 successfully, with the new value readable right back; doing the same write to the loop device, the kernel rejected it outright:

![Figure 2](/images/csdn/figures/linux-i-o-csdn138915131-2.png)

`Invalid argument` and the original value unchanged — a kernel rejection never corrupts anything, but if the command sits in a script with no error check, you'll believe the change succeeded. On real SATA/SAS disks, going from 128 to 256 usually works; in virtualized environments (virtio, loop) the queue depth is constrained by the virtualization layer and may not be adjustable.

Containers and clouds add another layer: in unprivileged containers /sys is mounted read-only and the write fails outright with `Read-only file system` (verified) — that's not a parameter problem but a permission boundary; do it on the host or with elevated privileges.

**Verification point**: after the `echo`, you must `cat` the file again and see the target number before the change counts.

Note that this writes runtime state — it is gone after a reboot, so persist it once confirmed effective. Two common approaches: a udev rule (applied as soon as the device appears) or a boot script:

```
# /etc/udev/rules.d/71-nr_requests.rules (config example)
ACTION=="add|change", KERNEL=="sda", ATTR{queue/nr_requests}="512"
```

## Example 3: Observing the Effect with iostat

The value of the adjustment has to be confirmed with data. Generate sustained writes to the disk on one side while sampling with iostat on the other:

```bash
iostat -dx /dev/sda 1 5    # Sample once per second, 5 times total
```

Verified output (sysstat 12.5.4, sampled during the direct-write period):

![Figure 3](/images/csdn/figures/linux-i-o-csdn138915131-3.png)

Comparison method: take one sample set before and one after the change, focusing on three columns — `w_await`/`await` (average wait per write / per IO, the primary metric), `aqu-sz` (average queue depth, verifying the enlarged queue is actually used), and `%util` (share of time the disk is busy; long runs near 100% mean the disk itself is the bottleneck and no parameter will save it). How to read the three columns:

| Metric | Meaning | Healthy direction after tuning |
|------|------|------------------|
| `await` / `w_await` / `r_await` | average wait per IO (ms, all/write/read) | should drop |
| `aqu-sz` | average queue depth | rise moderately (the queue is being used), but not pinned at nr_requests |
| `%util` | share of time the disk is busy | a sustained high means the disk is near saturation — time to shard the load or replace hardware |

Keep `top` open at the same time to watch memory, confirming the change didn't drag anything else down.

## Use Cases

- High-load servers: IO-intensive services such as database servers and file servers usually benefit from a longer queue.
- Multi-tasking environments: when several IO-intensive applications run at once, a longer queue improves response time and throughput.

Conversely, tuning it on a low-load machine is pointless — the queue never fills, so there's nothing to merge.

## Wrong Ways Compared

**Mistake one: echo without checking**. When the kernel rejects `echo 256 > ...`, the shell reports a write error; without checking the exit code or reading back in a script, the adjustment becomes "assumed effective".

```bash
# Wrong: write and walk away
echo 256 > /sys/block/sda/queue/nr_requests

# Right: read back to verify after writing
echo 256 > /sys/block/sda/queue/nr_requests && cat /sys/block/sda/queue/nr_requests
```

**Mistake two: tuning nr_requests as a standalone switch**. It behaves jointly with the I/O scheduler and per-request size; enlarge the queue but leave the scheduler mismatched to the disk type, and the gain can be zero — or negative.

**Mistake three: using it to fight a physical bottleneck**. For a disk at sustained 100% %util, a longer queue merely moves the waiting from the application side into the kernel; average latency won't improve — offload cold data, add caching, or replace the disk first; parameters are the last resort.

## Points to Watch

- Back up the original value (the Example 1 cat output) before changing any system setting, and schedule the operation in a low-traffic window.
- Verify the effect in a test environment before considering production; enlarging the queue is not always a net gain.
- Queue length is proportional to memory usage; on memory-tight machines, enlarging it can drag overall performance down instead.
- This parameter works in concert with the I/O scheduler — when changing queue length, check whether the current scheduler matches the disk type.

## Summary

Back to the opening saturation scenario: nr_requests is the "scheduling headroom" card — cat the baseline first, echo then read back to verify, and confirm the gain with iostat's await/aqu-sz. The testing flags two things: not every device accepts the change (Invalid argument), and a change taking effect is not the same as the change helping. If this card is played and nothing improves, replacing hardware isn't too late. And after changing the parameter, make it survive reboots: persist it with a udev rule or boot script, then `cat` it once more during the next reboot check to confirm.

---

> This article was rebuilt from the author's CSDN blog posts written between 2020 and 2024, originally published on CSDN.
