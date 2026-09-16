---
title: "YUM/DNF DownloadOnly: Download Without Installing, Pre-Load Software Updates"
date: 2024-05-13 09:41:44
lang: en
categories: [Tech, Network Services]
tags: [Network Services]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1687038520563-2310e8b06ed2?w=1600&q=80&fm=jpg
updated: 2026-09-14
---

One class of need is very common: download the software updates while bandwidth is idle, and actually install them during the maintenance window. DownloadOnly mode exists exactly for this — it performs only the download, without installing or updating right away. This post follows dnf on Rocky Linux 9 as the main line (all commands tested in a rockylinux:9 container, dnf 4.14.0, aarch64); the CentOS 7 plugin approach is given its own section as a historical difference, for reference on older environments.

## What Problem Does This Feature Solve

Changes on production servers must pick a maintenance window, but the update packages run to several gigabytes and downloading them on the spot never fits the window. DownloadOnly splits "transfer" from "change": pull the packages at off-peak hours, and the window does only the local install — window time shrinks from "download + install" to "install".

Typical scenarios it fits:
- Short maintenance windows, large update packages
- Installing the same batch of updates on many servers; download once, distribute and reuse (with an intranet mirror or scp)
- Wanting to review the package list first, then decide whether to proceed

## Scenario One: Pre-Download All Available System Updates

On the RHEL 8/9 / Rocky / Alma family, dnf supports `--downloadonly` natively, no plugin needed. Pull the full system update into a chosen directory:

```bash
dnf update --downloadonly --downloaddir=/tmp/u -y
```

The line `DNF will only download packages for the transaction.` in the output confirms the "download only" semantics; measured: 60 M of updates, 114 rpms, all landed in /tmp/u, and the system itself had not a single package touched:

![Figure 1](/images/csdn/figures/downloadonly-csdn138786238-1.png)

Without `--downloaddir`, packages go into the deep, per-repo cache directories under /var/cache/dnf, and archiving them afterwards means digging through one repo after another — for real use, always carry this option.

## Scenario Two: Download One Package and Its Dependencies

Not updating the whole system, just pulling one package locally first (say, wget for an offline machine):

```bash
dnf install --downloadonly --downloaddir=/tmp/dl -y wget
```

Measured: wget lands together with its two dependencies, libpsl and publicsuffix-list:

![Figure 2](/images/csdn/figures/downloadonly-csdn138786238-2.png)

Note that `--downloadonly` downloads all dependencies along with it — for an offline install, every one of those dependencies is indispensable, so always use `--downloaddir` to gather them into one directory.

Two pitfalls, both personally stepped in during testing: first, in non-interactive environments such as scripts and containers, omitting `-y` makes the transaction abort outright with `Operation aborted`, and not a single package gets downloaded; second, download complete does not mean verification complete — before installing, pass the packages through `rpm -K` for signatures:

![Figure 3](/images/csdn/figures/downloadonly-csdn138786238-3.png)

## Scenario Three: Local Install During the Maintenance Window

With the packages in place, the window-time install points straight at the local directory and produces no download traffic:

```bash
dnf install /tmp/dl/*.rpm
```

Measured: this batch of rpms installed in one pass (`Complete!`, wget usable). dnf resolves the dependencies among the rpms in the directory automatically; if any dependency sits outside the directory (missed at download time), it tries to fill the gap from the repos — on an offline environment that step fails, so verify the dependency list beforehand with `dnf repoquery --requires` or `yum deplist`.

## Historical Version Differences (CentOS 7)

CentOS 7's yum does not support `--downloadonly` by default; the feature comes from a separate plugin, sourced from the original article and official documentation (not tested in this article's environment):

```bash
yum install yum-plugin-downloadonly
yum update --downloadonly --downloaddir=/opt/updates/
```

- Without the plugin installed, adding `--downloadonly` makes yum exit with `No such option: --downloadonly` — the most common reason "I typed it exactly as the docs say and it errors" on CentOS 7.
- In the yum era, the default download location was `/var/cache/yum/x86_64/7/<repo-name>/packages/`, likewise organized per repo.
- Another option is `yumdownloader` from the yum-utils package (`yumdownloader --destdir=/opt nginx`) — single-package download, usable alongside the plugin.
- The local-install command is `yum localinstall`; on dnf that function has been merged into `dnf install` — just give it the path.

## Parameter Quick Reference

| Parameter | Purpose | Example |
|------|------|------|
| `--downloadonly` | download without installing | `dnf update --downloadonly` |
| `--downloaddir=PATH` | choose the download directory | `--downloaddir=/tmp/u` |
| `-y` | mandatory in non-interactive environments, or the transaction is abandoned | `dnf install --downloadonly -y wget` |
| `dnf download --resolve` | single-package download from dnf-plugins-core; `--resolve` pulls dependencies too | `dnf download --resolve nginx` |
| `yumdownloader` (yum-utils) | CentOS 7's single-package download tool | `yumdownloader --destdir=/opt nginx` |

## Notes

- DownloadOnly only downloads and does not install; no update has taken effect. The real upgrade still happens in the maintenance window via `dnf update` or `dnf install /local/dir/*.rpm`.
- Running the download in a non-interactive environment (scripts, CI, containers) requires `-y`; measured, without it the transaction aborts outright.
- The default download location sits deep under /var/cache/dnf (/var/cache/yum on CentOS 7), organized per repo; when you need to copy and archive manually, pointing `--downloaddir` at a dedicated directory is far easier.
- Downloaded packages are bound to the system architecture and version: an el9 aarch64 package will not install on an x86_64 machine — confirm the target machine's environment matches before offline reuse.
- Download complete ≠ verification complete; before installing, run `rpm -K *.rpm` through the GPG signatures to guard against transfer corruption or tampering (measured: a good package prints `digests signatures OK`).

Moving "transfer" off-peak and leaving "change" in the window — this one option, DownloadOnly, cuts the maintenance window by more than half. Remember the difference — CentOS 7 needs the plugin, the RHEL 8/9 family supports it natively — and both generations of systems get it right.

---

> This article was rebuilt from the author's CSDN blog posts written between 2020 and 2024, originally published on CSDN.
