---
title: "CentOS 7 End-of-Life Migration in Practice: The el7→el9 Difference List Excavated by Re-testing 93 Old Articles"
date: 2026-09-14 21:00:00
lang: en
updated: 2026-09-14
categories: [Tech]
tags: [Linux, CentOS, Rocky Linux, Migration, Ops]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1600&q=80&fm=jpg
---

CentOS 7 has been out of maintenance for over a year, and the vault repositories are only a stay of execution. Over the past few days I re-tested the blog's 93 ops articles one by one on Rocky Linux 9 — not copying differences out of documentation, but actually running every command in a container: what passed went back into the articles, and what failed went into this list.

Ordered by the likelihood of tripping you up during migration: repositories break first, then package names, service behavior, and command options. Every entry carries its live-test evidence, so following the list spares you one round of the same pitfalls.

## Repositories First: Neither Side's Defaults Can Be Trusted

**CentOS 7 side**: the official repositories are gone; any fresh install must switch to vault — comment out `mirrorlist` in the repo files, point `baseurl` at `http://vault.centos.org`, then `yum clean all` and reinstall. Vault occasionally serves 403 on some paths; retry or switch to an x86_64 machine.

**Rocky 9 side**: the container image's bundled mirrorlist 404s outright on quite a few networks (it did on mine); the same fix applies — point baseurl at `https://dl.rockylinux.org/$contentdir/$releasever/`. EPEL installs the same as ever: `dnf install -y epel-release`.

**The lesson of this step: never assume any default repository works out of the box — the first thing to do in a new environment is run one `dnf install` to feel out the ground.**

## Package Names and Package Structure

| el7 habit | el9 reality | Notes |
|---|---|---|
| `yum install dhcp` | `dnf install dhcp-server` | ISC DHCP is split into dhcp-server / dhcp-client / dhcp-common |
| `yum install cobbler` (2.8) | `dnf install cobbler` (3.3.7) | The config file moved from `/etc/cobbler/settings` to `/etc/cobbler/settings.yaml` — the whole format changed |
| `yum install salt-master` | Same name, but needs `python3-mysqlclient` added | Salt 3005.4's MySQL Returner depends on this package on el9 |
| network-scripts package | Gone | Discussed below |

Set expectations for version gaps too: BIND is 9.16, Postfix 3.5 / Dovecot 2.3, OpenResty reaches 1.19+ from EPEL; building a newer version is another story.

## Service Behavior Changes (The Three Most Crash-Prone Categories)

**1. network-scripts is gone entirely.** `ifcfg`, `route-ethN`, and `systemctl restart network` are all history; networking belongs to NetworkManager now. Static multiple routes are written as nmcli keyfiles or `nmcli con mod +ipv4.routes`. One more detail: in a container without dbus, nmcli simply refuses to work — start `dbus-daemon` by hand first; watch for this in automation scripts.

**2. dhcpd no longer reads `/etc/sysconfig/dhcpd`.** On el7 you designate the listening NIC with `DHCPDARGS=eth0`; on el9 the unit file states explicitly that this file is no longer used. The actual behavior: **dhcpd only listens on interfaces whose addresses fall inside a declared subnet** — if the interface address isn't in any declared subnet, it refuses outright with `No subnet declaration for eth0`; configure a global subnet declaration and it listens normally.

**3. OpenSSH fights crypto-policies.** el9's sshd layers in `/etc/ssh/sshd_config.d/50-redhat.conf` by default; after source-compiling OpenSSH 9.5p1, `sshd -t` reports an unrecognized `GSSAPIKexAlgorithms` — the hand-built sshd can't parse the algorithm names crypto-policies hands down. Moving that include file aside makes the config check pass. Machines upgrading from the distribution OpenSSH to a self-compiled one will hit this without fail.

## Commands and Options

- **reposync**: dnf 4.14 still ships the standalone `reposync` compatibility script and most old options work; but `--metadata` is not a valid option — it prefix-matches into `--metadata-path` and then errors "missing argument". The correct spelling is `--download-metadata`. This prefix-matching trap exists across the whole dnf family; write long options out in full.
- **parted scripting**: the el7-era incantation of `-s` combined with `---pretend-input-tty` silently fails with exit code 1 on el9. For scripted parted, drop `-s` entirely and pass explicit command arguments.
- **drop_caches**: on a container kernel, `echo 3 > /proc/sys/vm/drop_caches` fails with Permission denied, and the old lore of "write it, read back a nonzero value" doesn't hold on new kernels either — this is an environment difference rather than a version difference, but automation scripts get caught by it all the same.

## Databases and Neighbors

- **MariaDB remote access**: the el7-era tutorial assumption of "works right after install" doesn't hold on el9 — the first connection fails with `ERROR 1130`, and an explicit `CREATE USER` + `GRANT` is required. Some statements in old SQL files fail outright as invalid.
- **MySQL 8 reserved words**: a column named `load` without backticks is a straight syntax error; run old SQL through a reserved-word scan before a cross-version migration.
- **Elasticsearch**: 7.6.x has no ARM build (official builds start at 7.8), so installing the old version on an aarch64 machine 404s. The workaround for `X-Pack is not supported ... [linux-aarch64]` (`xpack.ml.enabled: false`) still works.
- **Tomcat jsvc**: new Tomcat 9's bin directory still ships only the `commons-daemon-native.tar.gz` source package, with no prebuilt jsvc; `daemon.sh` also dropped the `# JAVA_HOME=` comment line — use the `--java-home` option or rely on auto-detection, which fails in minimal images that lack the `which` command.

## Migration Checklist

Work through in order; every item links to the full live-test write-up in the corresponding blog article:

1. Repository switch (vault on the old machine, dl.rockylinux.org on the new)
2. Package name mapping: dhcp-server, cobbler 3.x settings.yaml, salt plus python3-mysqlclient
3. Networking moves to NetworkManager: nmcli keyfiles, `+ipv4.routes`, and remember dbus in containers
4. Service behavior: dhcpd listening logic, the OpenSSH × crypto-policies include conflict
5. Command fixes: `--download-metadata`, parted without `-s`
6. Databases: explicit GRANT, reserved-word backticks, ES version-to-architecture matching
7. After migration, run a round of real-machine smoke tests — this list is itself only a set of "known pitfalls," not a sufficient acceptance test

## Closing Thoughts

Every line in this list comes from a real container run, but migration pitfalls never stop at the list. What actually transfers between environments is not these few differences — it's the method of "run it first in an isolated environment": one Rocky 9 container, one old script, executed line by line — and the differences specific to your environment will all surface within an afternoon.
