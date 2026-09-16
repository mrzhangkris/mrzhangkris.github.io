---
title: "reposync: Mirroring a YUM Repository Locally"
date: 2020-04-10 23:10:19
updated: 2026-09-14
categories: [Tech, Ops]
tags: [Ops]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1569428034239-f9565e32e224?w=1600&q=80&fm=jpg
lang: en
---

When machines on an intranet can't reach public YUM mirrors directly, the common approach is to sync the entire repository down on a machine that has internet access, then serve it as a local repo. `reposync` does exactly that: pulls the remote repository's rpm packages into a local directory by repoid. This post starts from the CentOS 6-era yum-utils usage (the original environment) and tests, one item at a time, the real dnf-era differences inside a Rocky Linux 9.3 container (dnf 4.14) — with a somewhat counterintuitive conclusion: **the compatibility scripts are still there and most old flags still work; what actually breaks is the `--metadata` flag name that circulates online**.

## The Overall Flow

Syncing a repository locally takes four steps: install the tools → create the directory → find the repoid → run the sync. After syncing, createrepo must generate the metadata before clients can treat the directory as a repository.

## Install the Tool Package

The package carrying the `reposync` command has a different name on the two system generations:

```bash
# CentOS 6/7 (yum era)
yum install -y yum-utils

# RHEL 8/9 (dnf era)
dnf install -y dnf-utils
```

Verification: on CentOS 6/7, `reposync --help` prints output; in the Rocky 9 container, after installing dnf-utils the standalone `reposync` command **still exists** (`/usr/bin/reposync` is a compatibility script pointing at `/usr/libexec/dnf-utils`), and the `dnf reposync` subcommand works at the same time — both paths are viable.

## Create the Download Directory

Create the storage directory first; locally downloaded rpm packages land here:

```bash
mkdir -p /data1/centos/$releasever
```

`$releasever` is the YUM/DNF system-version variable; at execution time it is replaced with the current system's major version (CentOS 6 → 6, Rocky 9 → 9), so packages of different versions naturally land in separate directories. Note that expanding this variable directly in the shell yields an empty string — it is resolved by yum/reposync itself. To get the value at the shell level, `rpm -E %rhel` worked in testing (the Rocky 9 container printed `9`); files like `/etc/dnf/vars/releasever` do not exist in the Rocky 9 container, so don't count on them.

## Get the Repoid

To know which repositories to sync, you first need their repoids:

```bash
yum repolist      # CentOS 6/7
dnf repolist      # RHEL 8/9
```

Sample output (the original article's CentOS 6 environment):

```text
Loaded plugins: fastestmirror, product-id, subscription-manager
Loading mirror speeds from cached hostfile
 * base: mirrors.aliyun.com
 * extras: mirrors.aliyun.com
 * updates: mirrors.aliyun.com
repo id      repo name                                    status
base         CentOS-6 - Base - mirrors.aliyun.com         6,713
epel         Extra Packages for Enterprise Linux 6        12,587
extras       CentOS-6 - Extras - mirrors.aliyun.com       47
updates      CentOS-6 - Updates - mirrors.aliyun.com      952
repolist: 20,299
```

From the output, this machine has 4 repoids: base, epel, extras, updates. **A repoid corresponds to the `[serverid]` in a `.repo` config file** — the name inside the brackets. It distinguishes repositories and must be unique; with duplicate names, the later one overrides the earlier.

## Sync the Repositories

Sync all 4 repositories in one go, into the directory created earlier:

```bash
reposync -n --repoid=base --repoid=epel --repoid=extras --repoid=updates \
  -p /data1/centos/$releasever
```

What this command does:

- `--repoid` names the repositories to sync; you can pass one or several (as long as the download directory is the same);
- `-p` sets the destination path;
- `-n` means `--newest`: download only the newest version of each package and skip older ones, saving a lot of disk space.

When it runs, reposync automatically creates a same-named directory under the destination path for each repoid, so packages lie in their own per-repo directories. Verified on the Rocky 9 container (a small local repository of 3 self-built rpms — the mechanism is identical to a public mirror):

![Figure 1: dnf reposync sync succeeded](/images/csdn/figures/reposync-csdn105444446-1.png)

## Real dnf-era Differences (Verified on Rocky 9)

The counterintuitive conclusion first: the old CentOS 6-era command `reposync -n --repoid=X -p PATH` **runs unchanged** on Rocky 9 — the compatibility script from dnf-utils translates the yum-era flags to dnf as-is. What actually fails is the garbled-by-word-of-mouth `--metadata`; the verified error:

![Figure 2: the --metadata flag trap](/images/csdn/figures/reposync-csdn105444446-2.png)

`--metadata` was prefix-matched by argparse into `--metadata-path` (an option that takes an argument), hence `expected one argument`. The correct flag is `--download-metadata`. Item-by-item comparison of verified results:

| Purpose | CentOS 6/7 (yum-utils) | Rocky 9 (dnf 4.14, verified) |
|------|------------------------|------------------------|
| Invocation | `reposync` | both `reposync` (compat script) and `dnf reposync` work |
| Newest packages only | `-n` / `--newest` | `-n` (help text reads `-n, --newest-only`); both forms verified working |
| Destination path | `-p PATH` | `-p PATH` (`--download-path`), compatible |
| Sync repodata too | manual createrepo needed | `--download-metadata` (not `--metadata`) |

The Rocky 9 equivalent command:

```bash
dnf reposync --repoid=baseos --repoid=appstream \
  --download-path=/data1/rocky/9 --newest-only --download-metadata
```

`--download-metadata` is the dnf version's nicety: repodata is synced along with the packages, eliminating the createrepo step (in the yum era you ran `createrepo /data1/centos/6/base` yourself; on Rocky 9 that command comes from the createrepo_c package, and `/usr/bin/createrepo` is still there).

## After Syncing: Metadata and Consumption Verification

In the yum era the sync produced only rpms; for clients to treat the directory as a repository, you still had to generate metadata inside it:

```bash
createrepo /data1/centos/6/base
```

Then configure a .repo file on the client pointing at this directory (file:// or http://). With the dnf version's `--download-metadata`, this step can be skipped. Finally, a consumption test closes the loop — verified: installing a package directly from the synced copy succeeded:

![Figure 3: installing from the synced copy](/images/csdn/figures/reposync-csdn105444446.png)

## Points to Watch

- The bigger the repository, the longer the sync takes — first-time syncs of large repos like base plus epel routinely hit tens of GB and hours; run it in the background with `nohup ... &`, and resume simply by running it again (reposync skips packages that already exist unchanged).
- `-n` (--newest-only) pulls only the newest packages; if your local repo must serve mixed deployments of old packages (legacy apps pinned to specific old versions), evaluate before dropping that flag — full history is a lot larger.
- After syncing, remember to generate/sync the metadata (createrepo or --metadata); a directory with only rpms and no repodata is not recognized by clients.
- Plan disk space ahead: the status column of `dnf repolist` counts packages; to estimate size roughly, `dnf repoquery --repoid=X --qf '%{downloadsize}' | awk '{s+=$1}END{print s/1024/1024 " MB"}'`.
- Schedule periodic incremental syncs with cron (once daily at low peak); reposync is naturally idempotent — reruns pull only additions and changes.
- The CentOS 6/7 commands in this post follow the original (yum-utils 1.x; that environment is EOL and was not re-run); the Rocky 9 portions were verified in a rockylinux:9 container (dnf 4.14), including the self-built repository, sync, metadata, and the consumption loop (the tree package installed successfully from the synced copy).

reposync's value in one sentence: when the public mirror can't come in, move the mirror in. Three takeaways from the Rocky 9 verification: the compatibility scripts are still there (old commands are safe), repodata syncs via `--download-metadata` (don't write `--metadata`), and after syncing run one installation check with `--repofrompath` — and the intranet-repository job is closed.

> This article was rebuilt from the author's CSDN blog posts written between 2020 and 2024, originally published on CSDN.
