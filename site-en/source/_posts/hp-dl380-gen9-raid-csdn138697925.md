---
title: "RAID on HP DL380 Gen9: Building Arrays and Setting the Boot Drive with SSA"
date: 2024-05-11 09:08:16
lang: en
categories: [Tech, Linux]
tags: [Linux]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1650600538903-ec09f670c391?w=1600&q=80&fm=jpg
updated: 2026-09-14
---

A newly arrived HP DL380 Gen9 with drives slotted in is not ready for an OS install — the installer only recognizes logical drives, not raw ones. Raw drives must first be grouped into arrays on the RAID controller before they reach the operating system as logical drives. This post records the complete procedure using the machine's built-in HPE Smart Storage Administrator (SSA hereafter), with the Smart Array P440ar controller as the example. The whole process is reachable at power-on, no extra boot media needed; this is a record of GUI operations, not exercised from the command line, and menu paths are subject to the actual firmware version.

## What Problem SSA Solves

Smart Array controllers move "disk management" out of the operating system and into the firmware layer: building arrays, deleting arrays, and setting the boot drive all happen during POST, and after the OS is installed it sees only one or a few ready-made logical drives. The benefit is that the operating system never has to care about RAID details — no matter how many drives sit underneath or what level, it sees one ordinary disk at install time.

SSA is the controller's built-in graphical management interface; Gen9 models embed it in the Intelligent Provisioning system, entered with F10 at boot, again with no extra boot media. For the OS-install job, there are only three things to do in SSA: enter the interface, build the array (pick drives + pick level), and set the new array as the boot drive. The steps below follow that order.

## Step 1: Enter SSA

At the boot self-test screen, press **F10** to enter the intelligent provisioning menu, then select **HPE Smart Storage Administrator**. This step needs no external media — the firmware ships with it.

> Note: menu hierarchy varies slightly between firmware versions. After F10, if you first land on the Intelligent Provisioning main screen, SSA is reachable from Perform Maintenance; System Utilities entered via F9 also has a controller entry under System Configuration that leads to the same place.

Inside SSA, the interface is organized in two layers: "controller → configuration actions". The left pane lists the machine's controllers (here, Smart Array P440ar) and the physical drives hanging off them; selecting a controller surfaces the available actions on the right. While selecting the controller, take a moment to read its status: the drive list marks each drive's state (OK, Failed, unassigned, and so on). If a drive doesn't appear in the list, check the backplane cabling and bay first — a drive the controller doesn't detect cannot join an array; a drive marked Failed cannot be built into a new array either.

## Step 2: Create the Array

Building an array is four selections in sequence:

1. Select the **Smart Array P440ar** controller;
2. Select **Configure**, then **Create Array**;
3. Check the physical drives to include in the RAID;
4. Choose the RAID level and confirm to complete creation.

Before picking drives, decide whether the business wants capacity or safety — once the level is chosen, capacity and redundancy are fixed, and changing the level later means rebuilding the array with total data loss. The trade-offs of common levels:

| RAID level | Usable capacity | Fault tolerance | Typical use |
|-----------|---------|------|---------|
| RAID 0 | Sum of all drives | None (one failure loses everything) | Cache drives, temporary data |
| RAID 1 | Single-drive capacity | Survives 1 failure | System drives, small critical data |
| RAID 5 | (N-1) drive capacity | Survives 1 failure | General business drives |
| RAID 10 | Half capacity | 1 failure per mirror group | High-IO workloads like databases |

How to choose: the convention for system drives is a separate small array (say two drives in RAID 1), with data drives built separately and level set by the workload. RAID 5 saves drives but carries a write penalty — every write computes parity — so for random-write-heavy loads (databases, virtualization), go straight to RAID 10 and trade half the capacity for performance and faster rebuilds. Consider RAID 0 only for pure cache or temporary data that can be rebuilt at any time.

Two firmware-level hard rules to remember at drive selection:

- **Drives in one array must be the same media type**. SSDs and spinning disks cannot be mixed into one array, and drives with wildly different capacities or spindle speeds don't mix well either; SSA blocks or warns on non-compliant combinations at selection time.
- **The new array will initialize the selected drives**. Before checking the boxes, confirm nothing on them needs to be kept — especially second-hand drives picked up in a datacenter.

The creation screen also offers extras like striping parameters; keep the defaults without a specific reason — defaults are sensible for the vast majority of cases, and these parameters cannot be changed afterward, only rebuilt.

## Step 3: Set the New Array as the Boot Drive

Building the array isn't the end — which drive the installer boots from depends on the controller's boot-drive setting. Return to the controller's configuration screen, select **Set Bootable Logical Drive/Volume**, pick the first logical drive just created, and set it as the system boot drive.

This is the step most often missed, and under Gen9's default UEFI mode there is a second layer: for the logical drive to truly participate in boot, it must also rank high in the boot order. Skip the boot-drive setting and the installer may find no disk on reboot; with stale arrays lingering on the machine, the installer may even install the system onto a different logical drive. So after setting it, go into System Utilities and confirm the boot order puts the target controller first.

Once set, it's worth verifying: reboot into the installer (or any Linux rescue environment), and `lsblk` should show a drive whose capacity matches the chosen level — two 300G drives in RAID 1 present a 300G logical drive, which after installation is usually `/dev/sda`.

## The Other Route Once the OS Is Installed: ssacli

SSA doesn't live only in firmware. After the OS is installed, HPE's official `ssacli` command-line tool can view and even manage the same arrays from within the operating system — far more convenient than entering the BIOS for scripted batch work. Common commands look like:

```bash
ssacli ctrl all show status    # Controller status
ssacli ctrl all show config    # Full view of controllers, arrays, logical drives
ssacli ctrl slot=0 ld all show detail   # Logical drive details (level, capacity, status)
```

> Note: `ssacli` is provided by the HPE Software Delivery Repository (formerly `hpssacli`/`hpacucli`); the commands above were not executed in testing — the source is HPE official documentation, and syntax should be verified against the help output of the installed version.

For daily inspection, `show config` is the most useful: logical drive status should be OK; Failed or Interim Recovery Mode means a degraded array that needs prompt attention. A word on hot spares too: in SSA you can designate an unassigned drive as a spare, and when a drive in the array fails, the controller rebuilds onto the hot spare automatically, no manual swap needed — machines with spare bays should keep one.

## When Something's Off: Delete and Rebuild

Wrong level, wrong drives checked — return to the same controller's **Configure** and use **Delete Array** to remove and rebuild. Deletion takes effect immediately and the data is unrecoverable — the logical drive's metadata lives on the controller, and deleting the array makes the controller forget the arrangement of that group of drives, rendering the contents inaccessible. If a deleted drive previously belonged to another machine's array, the firmware will also warn about old metadata on the drive when you rebuild; confirm the overwrite. For second-hand drives or drives of unknown provenance, rather delete first and build fresh than stack a new array on old configuration.

## Notes

- **Decide the RAID level before selecting drives**. The level determines usable capacity and redundancy; adjusting afterward means rebuilding the array with total data loss.
- **After building the array you must set the Bootable Logical Drive**, and confirm the UEFI boot order in System Utilities, or the OS installer may find no boot disk.
- **Before touching anything, confirm no drive holds data that must be kept**. Create Array initializes the selected drives; back up first, and with second-hand drives, read before you check.
- **Menu paths are subject to the actual firmware version**. This post was recorded against the firmware of its time and not verified against newer releases, but the two actions "create array + set boot drive" are permanent fixtures in SSA.

## Summary

Back to the opening question: a raw drive can't take an OS install directly because it isn't yet a logical drive. On the DL380 Gen9 that happens in the firmware layer via SSA — F10 into the interface, Create Array to pick drives and level, Set Bootable Logical Drive to designate the boot drive; with those three steps done, the installer faces a logical drive ready for partitioning. Choosing the level wisely, not forgetting the boot-drive setting, and not mixing media within an array are the three traps beginners hit most; verify with `lsblk` after install, inspect with `ssacli show config` once the system is up, and the loop closes.

---

> This article was restructured from the author's 2020-2024 CSDN blog posts, originally published on CSDN.
