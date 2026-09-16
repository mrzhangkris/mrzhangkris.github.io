---
title: "Disk Partition Management with parted: From Inspecting and Creating to Resizing"
date: 2024-05-20 09:45:20
updated: 2026-09-14
categories: [Tech, Linux]
tags: [Linux]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1496664444929-8c75efb9546f?w=1600&q=80&fm=jpg
lang: en
---

For partitioning a new disk or resizing partitions during expansion, parted is handier than fdisk: it supports both MBR and GPT partition tables, it handles disks larger than 2TB that (older) fdisk cannot, and its command form suits scripts, making it a fixture of automated provisioning. This post walks parted through everyday operations, with every command verified by actually running it on a loop disk (a sparse file posing as a block device) in a Rocky Linux 9.3 container (GNU parted 3.5), and flags the spots where things go wrong: shrinking a partition gets blocked in script mode, resizepart will not grow the filesystem for you, and `-s` paired with a piped answer silently fails.

![Verified full parted workflow](/images/csdn/figures/parted-csdn139055126.png)

## Use Cases

- **Creating new disk partitions**: create one or more partitions on a new disk
- **Adjusting existing partitions**: change the size of an existing partition (paired with filesystem-level expansion)
- **Formatting partitions**: set a partition to a specific filesystem type (actual formatting is done by the mkfs family)
- **Converting the partition table**: switch a disk's partition table from MBR to GPT or the reverse
- **Scripted disk management**: manage disk partitions in automated deployment and scripts

## Installing parted

It is in the repositories of most distributions; install it with each system's package manager:

```bash
# Debian/Ubuntu
sudo apt-get update
sudo apt-get install parted

# Rocky/RHEL 9 family
sudo dnf install parted

# Arch Linux
sudo pacman -S parted
```

Verify: `parted --version` prints the version (GNU parted 3.5, verified against the Rocky 9.3 image repositories).

## Inspect the Disk Before Touching It

Before operating on a disk, run `print` to confirm the current layout — see the partition table type and partition numbers clearly so later commands do not point at the wrong target:

```bash
sudo parted /dev/sda print
```

Sample output (physical disk):

```text
Model: ATA ST1000DM003-1ER1 (scsi)
Disk /dev/sda: 1000GB
Sector size (logical/physical): 512B/4096B
Partition Table: gpt
Disk Flags:

Number  Start   End     Size    File system  Name     Flags
 1      1049kB  538MB   537MB   fat32        primary  boot, esp
 2      538MB   1000GB  999GB   ext4         primary
```

This shows the disk model, capacity, sector size, partition table type (gpt), and the start and end of each partition. The hands-on run for this post used a loop device (a sparse file simulating a disk) instead of a physical disk; the print output of a blank disk:

![Figure 1: inspecting the disk with print](/images/csdn/figures/parted-csdn139055126-1.png)

## Creating a New Partition Table

On a blank disk (or one you are certain should lose all partitions), initialize a GPT partition table:

```bash
sudo parted -s /dev/sda mklabel gpt
```

`mklabel` wipes the disk's existing partition table and is **irreversible** — the table is gone, and every partition definition disappears with it. Before running it, use print to confirm you picked the right disk and that backups are done. Besides GPT you can use `msdos` (MBR); both label conversions were verified to work, but before converting, all partitions on the disk become invalid.

## Creating a New Partition

```bash
# Create a primary partition from 1MiB to 500GiB, labeled ext4 in the partition table
sudo parted -s /dev/sda mkpart primary ext4 1MiB 500GiB
```

Two key points:

- Starting at `1MiB` aligns to the physical sector (modern disks have 4096B sectors, and 1MiB is an exact multiple); writing `0` or the old habit `1s` easily produces misalignment and hurts SSD performance;
- `ext4` here is only a type label in the partition table and **does not actually format anything** — formatting is mkfs's job (see below). Under GPT the primary/logical distinction has no real meaning; writing primary is just habit.

After creating it, confirm with an alignment check that you didn't step into the trap:

```bash
sudo parted /dev/sda align-check optimal 1
# 1 aligned
```

## Resizing an Existing Partition

```bash
# Move partition 1's end to 600GiB
sudo parted /dev/sda resizepart 1 600GiB
```

A verified 500MiB → 900MiB expansion (before/after print comparison in the figure):

![Figure 2: resizepart expansion verified](/images/csdn/figures/parted-csdn139055126-2.png)

Two key understandings:

1. **resizepart only changes partition boundaries; it never touches the filesystem** — after the partition grows, the filesystem inside it is still the old size, and a filesystem-level expansion must follow (ext4 with `resize2fs /dev/sda1`, xfs with `xfs_growfs` on the mount point). Skip that step and `df` shows not one byte more of usable space — the single most common source of newcomer confusion.
2. **Shrinking gets blocked by the safety check**: in `-s` script mode, a shrink operation makes parted print `Warning: Shrinking a partition can cause data loss` and abort with exit code 1 (no one answers the interactive question), leaving the partition unchanged. Verified:

![Figure 3: shrink block and allow, verified](/images/csdn/figures/parted-csdn139055126-3.png)

When a script genuinely must shrink, **drop `-s`** and feed the answer through a pipe with `---pretend-input-tty` (`printf "Yes\n" | parted ---pretend-input-tty /dev/loop8 resizepart 1 300MiB`). One counterintuitive detail from testing: with `-s`, even piping "Yes" in, parted aborts outright (exit 1); only without `-s` does it reach the `Yes/No?` prompt and complete the shrink (print confirmed End moving from 944MB to 315MB). Shrinking is a high-risk data-loss operation — back up before you act. Growing never asks; scripts run straight through.

Back up data strongly before resizing; operating on an active partition (mounted, carrying the system) can destabilize the system, so work unmounted whenever possible.

## Deleting a Partition

```bash
# Delete the first partition
sudo parted -s /dev/sda rm 1
```

What follows `rm` is the **partition number** (the Number column, first in print's output), not a device name. What gets deleted is the partition definition itself; whether the data is recoverable depends on whether it is later overwritten — if you mis-delete and nothing has been written since, `parted /dev/sda rescue START END` may still recover it (it scans for lost partition boundaries and rebuilds the definition).

## Formatting a Partition

parted's mkpart only registers in the partition table; a new partition needs the mkfs family to actually build a filesystem:

```bash
# Format /dev/sda1 as an ext4 filesystem
sudo mkfs.ext4 /dev/sda1
```

Verify: `mount /dev/sda1 /mnt && df -h /mnt` shows the correct capacity.

> Note: the mkfs/resize2fs steps were not run hands-on (re-checked 2026-09-14 in the Rocky 9.3 container: `losetup -P`/`partprobe`/`partx -a` produced no partition nodes for this environment's loop device, limited by the Docker Desktop VM kernel). The partition-table operations (mklabel/mkpart/resizepart/rm/align-check/print) were all verified. On physical machines, partition nodes are immediately available after mkpart; this limitation does not apply.

## Caveats

- **Back up your data**: back up important data before any partition-modifying operation; mklabel and rm are both definition-level "irreversible," and a slip can lose data outright.
- **System crash risk**: modifying an active partition (mounted, carrying the system) can destabilize the system; operate unmounted whenever possible. If the kernel hasn't noticed a partition table change, force a re-read with `partprobe /dev/sda`.
- **Look before you leap**: whenever you are unsure what a command will do, run `print` to see the current disk state and partition layout before continuing; in scripts, assert the target disk's characteristics first with `parted -l` or `print` (capacity, existing partitions) to guard against drive-letter drift picking the wrong disk — /dev/sda is not the same disk on every machine.
- **Partition alignment**: choose an aligned start like `1MiB`, then verify with `align-check optimal` after creating; on SSDs the performance cost of misalignment is substantial.
- **resizepart ≠ expansion done**: after the partition boundary moves, resize2fs/xfs_growfs must follow before the filesystem knows the space grew.
- **Script-mode shrink protection**: under `-s`, shrinking gets intercepted by the Warning and aborted (verified exit code 1); don't assume a finished script means success — check the exit code and print result. The allow-answer style is above, and `-s` must go.

## Summary

parted's daily routine is the chain print → mklabel → mkpart → align-check → resizepart, each step with a clear verification action. Remember its boundaries: it manages partition tables, not filesystems; growing never asks while shrinking always does; `-s` turns interactive questions into aborts; and after a script runs, go back and print to confirm — disk operations have no undo key, and print is your only safety net.

> This article was rebuilt from the author's CSDN blog posts written between 2020 and 2024, originally published on CSDN.
