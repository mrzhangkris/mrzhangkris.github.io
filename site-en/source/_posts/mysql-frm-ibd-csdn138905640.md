---
title: "Recovering MySQL Table Data from .frm and .ibd Files: DISCARD/IMPORT, Tested"
date: 2024-05-15 14:51:08
categories: [Tech, MySQL]
tags: [MySQL]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1667372283496-893f0b1e7c16?w=1600&q=80&fm=jpg
updated: 2026-09-14
lang: en
---

When MySQL crashes and the instance won't start, and you have no logical backup, the files in the data directory are the last straw you can grab: `.frm` holds the table structure, `.ibd` holds table data and indexes (one per table under InnoDB's file-per-table mode). As long as those two files survive, you can attach them to a fresh instance and fish the data out. This post runs the entire recovery chain in a mysql:8.0 container — what can be recovered, what happens when a step goes out of order, and where 5.x and 8.0 differ.

## Lab Environment and Version Boundaries

The environment first, because this method is highly version-sensitive:

- Verified environment: Docker container `mysql:8.0.46` (run in September 2026; all output below comes from this experiment).
- MySQL 5.x: each table is a pair — `.frm` (structure) + `.ibd` (data and indexes).
- From MySQL 8.0 on: `.frm` is removed and table structure lives in the data dictionary (`mysql.ibd`); only the `.ibd` remains in each table's data directory.
- Prerequisites: you hold the pre-incident `.ibd` files (ideally the `.frm` files too), and the target instance's major version matches the source — with mismatched versions the tablespace format may be incompatible and IMPORT fails outright.

One version rule of thumb: 5.x recovery material is "a pair of files"; 8.0 recovery material is "one `.ibd` plus a byte-for-byte matching `CREATE TABLE` statement."

## The Core Mechanism in One Sentence

This procedure rides on InnoDB's **transportable tablespaces**: `ALTER TABLE ... DISCARD TABLESPACE` detaches the table from its `.ibd` in the data directory (the file itself gets deleted), and `ALTER TABLE ... IMPORT TABLESPACE` re-attaches an external `.ibd` to the table. Once you grasp this "detach — re-attach" relationship, every step below makes sense.

## Example 1: Back Up the .ibd, Lose the Table, Attach It Back

Walk it in the order of a real incident. Step one, put the tablespace into export state and copy out a consistent `.ibd` while it's locked — this is the "backup in hand":

```sql
USE mydb;
FLUSH TABLES mytable FOR EXPORT;
```

```bash
cp /var/lib/mysql/mydb/mytable.ibd /tmp/mytable.ibd.bak
```

Step two, simulate the worst case — the table is gone and only the backup file remains. On the target instance, recreate an empty table with **exactly the same structure**:

```sql
USE mydb;
DROP TABLE mytable;
CREATE TABLE mytable (id INT PRIMARY KEY, name VARCHAR(50)) ENGINE=InnoDB;
```

Step three, detach the empty table's tablespace. Note that after `DISCARD` the `mytable.ibd` in the data directory is deleted and the directory is left clean — this is normal behavior, not a failure:

![Figure 1](/images/csdn/figures/mysql-frm-ibd-csdn138905640-1.png)

```sql
ALTER TABLE mytable DISCARD TABLESPACE;
```

Step four, place the backed-up `.ibd` back into the data directory, fix ownership, then attach:

```bash
cp /tmp/mytable.ibd.bak /var/lib/mysql/mydb/mytable.ibd
chown mysql:mysql /var/lib/mysql/mydb/mytable.ibd
```

```sql
USE mydb;
ALTER TABLE mytable IMPORT TABLESPACE;
```

![Figure 2](/images/csdn/figures/mysql-frm-ibd-csdn138905640-2.png)

IMPORT completing without an error means the attach succeeded. Verify with a query:

```sql
SELECT * FROM mytable;
```

The original three rows (alice, bob, carol) came back intact — recovery loop closed. The most counterintuitive part of the whole chain is step three: `DISCARD` deleting the file isn't an accident; it's part of the procedure.

## Example 2: One Step Out of Order — What the Errors Look Like

The correct order is "`DISCARD` first, then place the file, then `IMPORT` last." During the test run I deliberately got the order wrong twice and recorded both errors — if you hit the same ones, you can identify them at a glance.

**Mistake one**: skip `DISCARD` and copy the backup `.ibd` straight over the data directory, then `IMPORT`. The empty table's own `.ibd` is still registered in the data dictionary, so InnoDB refuses the attach:

```sql
ALTER TABLE mytable IMPORT TABLESPACE;
-- ERROR 1813 (HY000): Tablespace 'mydb/mytable' exists.
```

**Mistake two**: after `DISCARD`, forget to put the `.ibd` back and run `IMPORT` — InnoDB can't find the file to attach:

```sql
ALTER TABLE mytable IMPORT TABLESPACE;
-- ERROR 1812 (HY000): Tablespace is missing for table `mydb`.`mytable`.
```

![Figure 3](/images/csdn/figures/mysql-frm-ibd-csdn138905640-3.png)

Set the correct order side by side and the three moves interlock: `DISCARD` (clears the mounting point) → copy the `.ibd` back (prepares the material) → `IMPORT` (attaches). Error 1813 means the mounting point was never cleared; 1812 means the material never arrived — the two errors correspond to the two ways the order goes wrong.

## Example 3: Where Did frm Go in 8.0

The original article's procedure targeted a `.frm` + `.ibd` pair, which is the standard layout on MySQL 5.x. But in the tested 8.0 data directory, after creating the table only one file remains:

```bash
ls /var/lib/mysql/mydb/
# mytable.ibd
```

`.frm` is fully removed in 8.0, with the table structure absorbed into the global data dictionary. That means in the 8.0 recovery flow, the act of "providing the table structure" no longer relies on copying the `.frm` but on **manually executing a `CREATE TABLE` exactly matching the original table** — column names, types, indexes, and row format must all line up, otherwise IMPORT fails validation. Readers coming from 5.x-era directories should mentally replace the "copy the frm" step with "create an empty table of identical structure"; everything else is unchanged.

## A Configuration Comparison: Should innodb_force_recovery Be Set

One config item in the original flow needs its perception corrected: adding `innodb_force_recovery = 1` to `my.cnf` before recovery. This parameter's actual purpose is forcing InnoDB to start for rescue operations during **instance-level corruption** — the "instance won't start" scenario. For a plain tablespace import, the instance itself is healthy, and verified on 8.0.46 the whole procedure ran without it.

```
# Wrong: adding it routinely on a healthy instance — restricts write operations and adds risk for nothing
[mysqld]
innodb_force_recovery = 1

# Right: it must go back to 0 after recovery (leaving it set keeps suppressing normal writes)
[mysqld]
innodb_force_recovery = 0
```

If the instance truly crashed so hard it won't start, use it to rescue the boot, and set it back to 0 and restart as soon as file-level recovery is done — it is not a resident part of the recovery flow.

## Points to Watch

- **Preserve evidence before recovering**. Copy the `.frm`, the `.ibd`, and the target database directory each one more time before you start; if IMPORT fails you need a fallback — working without copies is betting your only material on perfect execution.
- **Version and structure must match**. Source and target major versions should match; when manually creating the table on 8.0, column definitions, indexes, and `ROW_FORMAT` must equal the original table's — any mismatch can fail the attach or corrupt data.
- **Don't skip ownership**. Files manually copied into the data directory are owned by root, which the mysql process cannot read — the `chown mysql:mysql` step is not optional.
- **Set innodb_force_recovery back to 0 when done**. It serves only the crash-rescue scenario; higher levels restrict more operations, and leaving it on is a live hazard.
- **This method does not replace backups**. It is the "file-level last resort," whose premise is precisely that the files survived; regular `mysqldump` or physical backups are the daily practice — the two relate like safety rope and life ring.

## Summary

Back to the opening scenario: instance down, no logical backup, and the `.ibd` files in the data directory are the last thing you can grab. The full verified chain: export and back up the `.ibd` → create an empty identical-structure table on the target → `DISCARD` to clear the slot → place the file, fix ownership → `IMPORT` to attach → `SELECT` to accept. Remember what the two errors mean — 1813 means you didn't `DISCARD` first, 1812 means you forgot to place the file — and with the order right, this "file-level last straw" reliably fishes the data back out.

---

> This article was rebuilt from the author's CSDN blog posts written between 2020 and 2024, originally published on CSDN.
